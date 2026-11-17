const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const { User, Room, RoomParticipant, Message } = require('../models');
const { isBlockedFromRoom } = require('./roomAccess');
const { sequelize } = require('../config/db');
const createCallInvitations = require('./callInvitations');

const participantAttributes = ['id', 'name', 'email', 'avatar', 'online', 'lastSeen'];

const emitParticipants = async (io, roomId) => {
  const room = await Room.findByPk(roomId, {
    include: [
      {
        association: 'participants',
        attributes: participantAttributes,
        through: { attributes: ['role', 'chatMuted'], where: { isRemoved: false } },
      },
    ],
  });
  if (!room) return;
  io.to(roomId).emit('room:participants', {
    participants: room.participants.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      avatar: p.avatar,
      online: p.online,
      lastSeen: p.lastSeen,
      role: p.RoomParticipant ? p.RoomParticipant.role : 'participant',
      chatMuted: p.RoomParticipant ? p.RoomParticipant.chatMuted : false,
    })),
  });
};

const isParticipant = async (roomId, userId) => {
  const membership = await RoomParticipant.findOne({ where: { roomId, userId, isRemoved: false } });
  if (!membership) return false;
  const room = await Room.findByPk(roomId);
  return !!room?.isActive && !(await isBlockedFromRoom(roomId, userId));
};

const isHost = async (roomId, userId) => {
  if (!(await isParticipant(roomId, userId))) return false;
  const room = await Room.findByPk(roomId);
  return !!room && room.hostId === userId;
};

const setUserOnline = (userId, online) =>
  User.update({ online, lastSeen: new Date() }, { where: { id: userId } });

const initializeSocket = (io) => {
  const calls = new Map();
  const playback = new Map();
  const playbackTime = (room) => {
    const state = playback.get(room.id);
    if (!state || state.url !== room.currentMediaUrl) return room.currentMediaTime || 0;
    return state.time + (state.playing ? (Date.now() - state.at) / 1000 : 0);
  };
  const validTime = (time) => typeof time === 'number' && Number.isFinite(time) && time >= 0 && time <= 2592000;

  const leaveCall = (socket) => {
    const roomId = socket.callRoomId;
    if (!roomId) return;
    const call = calls.get(roomId);
    if (call) {
      call.delete(socket.id);
      if (call.size === 0) calls.delete(roomId);
    }
    socket.leave(`call:${roomId}`);
    socket.to(`call:${roomId}`).emit('call:user-left', {
      socketId: socket.id,
      userId: socket.user.id,
      userName: socket.user.name,
    });
    socket.callRoomId = null;
  };
  const invitations = createCallInvitations(io, calls, isParticipant, leaveCall);

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.user.name} (${socket.id})`);
    setUserOnline(socket.user.id, true).catch((error) => console.error('Presence update failed:', error));
    socket.join(`user:${socket.user.id}`);
    invitations.register(socket);
    let windowStart = Date.now();
    let eventCount = 0;
    socket.use(([event, payload], next) => {
      if (Date.now() - windowStart >= 10000) {
        windowStart = Date.now();
        eventCount = 0;
      }
      eventCount += 1;
      if (eventCount > 120) return next(new Error('Too many real-time events'));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return next(new Error(`Invalid ${event} payload`));
      }
      next();
    });
    const safely = (handler) => (...args) => {
      Promise.resolve(handler(...args)).catch((error) => {
        console.error('Socket event failed:', error);
        socket.emit('error', { message: 'A real-time operation failed' });
      });
    };

    // ===== ROOM EVENTS =====

    socket.on('room:join', async ({ roomId }) => {
      const generation = (socket.roomJoinGeneration || 0) + 1;
      socket.roomJoinGeneration = generation;
      try {
        const room = await Room.findByPk(roomId, {
          include: [
            {
              association: 'participants',
              attributes: participantAttributes,
              through: { attributes: ['role', 'chatMuted'], where: { isRemoved: false } },
            },
          ],
        });
        if (!room || !room.isActive) return socket.emit('error', { message: 'Room not found' });
        const joined = await sequelize.transaction(async (transaction) => {
          const lockedRoom = await Room.findByPk(roomId, { transaction, lock: transaction.LOCK.UPDATE });
          const membership = await RoomParticipant.findOne({
            where: { roomId, userId: socket.user.id, isRemoved: false }, transaction,
          });
          if (!lockedRoom?.isActive || !membership || await isBlockedFromRoom(roomId, socket.user.id)) return false;
          if (!socket.connected || socket.roomJoinGeneration !== generation) return 'superseded';
          if (socket.roomId && socket.roomId !== roomId) socket.leave(socket.roomId);
          if (socket.roomId === roomId && socket.rooms.has(roomId)) return 'existing';
          await socket.join(roomId);
          if (!socket.connected || socket.roomJoinGeneration !== generation) {
            socket.leave(roomId);
            return 'superseded';
          }
          socket.roomId = roomId;
          return true;
        });
        if (joined === 'superseded' || joined === 'existing') return;
        if (!joined) {
          return socket.emit('error', { message: 'You are not a participant of this room' });
        }
        if (!socket.connected || socket.roomJoinGeneration !== generation) return;

        socket.to(roomId).emit('room:user-joined', {
          id: socket.user.id,
          name: socket.user.name,
          avatar: socket.user.avatar,
        });

        socket.emit('media:state', {
          currentMedia: {
            title: room.currentMediaTitle,
            url: room.currentMediaUrl,
            type: room.currentMediaType,
            currentTime: playbackTime(room),
            isPlaying: room.isMediaPlaying,
          },
        });

        await emitParticipants(io, roomId);
        console.log(`📺 ${socket.user.name} joined room ${room.name}`);
      } catch (error) {
        if (socket.roomJoinGeneration === generation && socket.roomId === roomId) {
          socket.leave(roomId);
          socket.roomId = null;
        }
        console.error('Room join failed:', error);
        socket.emit('error', { message: 'Unable to join the room' });
      }
    });

    socket.on('room:leave', safely(async ({ roomId }) => {
      socket.roomJoinGeneration = (socket.roomJoinGeneration || 0) + 1;
      if (socket.roomId !== roomId || !socket.rooms.has(roomId)) return;
      socket.leave(roomId);
      socket.roomId = null;
      socket.to(roomId).emit('room:user-left', {
        id: socket.user.id,
        name: socket.user.name,
      });
      await emitParticipants(io, roomId);
      console.log(`🚪 ${socket.user.name} left room ${roomId}`);
    }));

    // ===== MEDIA SYNC EVENTS =====

    socket.on('media:play', async ({ roomId, currentTime }) => {
      try {
        if (!validTime(currentTime) || !socket.rooms.has(roomId) || !(await isHost(roomId, socket.user.id))) {
          return socket.emit('error', { message: 'Only the host can control playback' });
        }
        await Room.update(
          { isMediaPlaying: true, currentMediaTime: currentTime },
          { where: { id: roomId } },
        );
        const room = await Room.findByPk(roomId);
        playback.set(roomId, { time: currentTime, playing: true, at: Date.now(), url: room.currentMediaUrl });
        socket.to(roomId).emit('media:play', {
          currentTime,
          userId: socket.user.id,
          userName: socket.user.name,
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('media:pause', async ({ roomId, currentTime }) => {
      try {
        if (!validTime(currentTime) || !socket.rooms.has(roomId) || !(await isHost(roomId, socket.user.id))) {
          return socket.emit('error', { message: 'Only the host can control playback' });
        }
        await Room.update(
          { isMediaPlaying: false, currentMediaTime: currentTime },
          { where: { id: roomId } },
        );
        const room = await Room.findByPk(roomId);
        playback.set(roomId, { time: currentTime, playing: false, at: Date.now(), url: room.currentMediaUrl });
        socket.to(roomId).emit('media:pause', {
          currentTime,
          userId: socket.user.id,
          userName: socket.user.name,
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('media:seek', async ({ roomId, currentTime }) => {
      try {
        if (!validTime(currentTime) || !socket.rooms.has(roomId) || !(await isHost(roomId, socket.user.id))) {
          return socket.emit('error', { message: 'Only the host can control playback' });
        }
        await Room.update({ currentMediaTime: currentTime }, { where: { id: roomId } });
        const room = await Room.findByPk(roomId);
        playback.set(roomId, { time: currentTime, playing: room.isMediaPlaying, at: Date.now(), url: room.currentMediaUrl });
        socket.to(roomId).emit('media:seek', {
          currentTime,
          userId: socket.user.id,
          userName: socket.user.name,
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('media:change', async ({ roomId, media }) => {
      try {
        if (!socket.rooms.has(roomId) || !(await isHost(roomId, socket.user.id))) {
          return socket.emit('error', { message: 'Only the host can change media' });
        }
        let url;
        try { url = new URL(media?.url); } catch { return socket.emit('error', { message: 'Invalid media URL' }); }
        if (!['http:', 'https:'].includes(url.protocol) || media.url.length > 2048 ||
            typeof media.title !== 'string' || media.title.length > 200 ||
            !['video', 'youtube', 'reel'].includes(media.type)) {
          return socket.emit('error', { message: 'Invalid media' });
        }
        await Room.update(
          {
            currentMediaTitle: media.title,
            currentMediaUrl: media.url,
            currentMediaType: media.type || 'video',
            currentMediaTime: 0,
            isMediaPlaying: false,
          },
          { where: { id: roomId } },
        );
        playback.set(roomId, { time: 0, playing: false, at: Date.now(), url: media.url });
        io.to(roomId).emit('media:change', {
          media,
          userId: socket.user.id,
          userName: socket.user.name,
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // ===== CHAT EVENTS =====

    socket.on('chat:message', async ({ roomId, content, type, replyToId }) => {
      try {
        if (!socket.rooms.has(roomId) || !(await isParticipant(roomId, socket.user.id))) {
          return socket.emit('error', { message: 'You are not a participant of this room' });
        }
        if (typeof content !== 'string' || !content.trim() || content.length > 1000 ||
            (type && type !== 'text')) {
          return socket.emit('error', { message: 'Invalid message' });
        }
        const result = await sequelize.transaction(async (transaction) => {
          const room = await Room.findByPk(roomId, { transaction, lock: transaction.LOCK.UPDATE });
          const membership = await RoomParticipant.findOne({
            where: { roomId, userId: socket.user.id, isRemoved: false }, transaction,
          });
          if (!room?.isActive || !membership) return { error: 'You are not a participant of this room' };
          if (membership.chatMuted) return { error: 'Your chat is muted in this room' };
          if (replyToId != null &&
              (typeof replyToId !== 'string' ||
               !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(replyToId) ||
               !(await Message.findOne({ where: { id: replyToId, roomId }, attributes: ['id'], transaction })))) {
            return { error: 'The message being replied to was not found in this room' };
          }
          const message = await Message.create({
            roomId, senderId: socket.user.id, content: content.trim(), type: 'text', replyToId: replyToId || null,
          }, { transaction });
          const populatedMessage = await Message.findByPk(message.id, {
            include: [
              { association: 'sender', attributes: ['id', 'name', 'avatar'] },
              { association: 'replyTo', include: [{ association: 'sender', attributes: ['id', 'name', 'avatar'] }] },
            ],
            transaction,
          });
          return { message: populatedMessage };
        });
        if (result.error) return socket.emit('error', { message: result.error });
        io.to(roomId).emit('chat:message', result.message);
      } catch (error) {
        console.error('Chat message failed:', error);
        socket.emit('error', { message: 'Unable to send the message' });
      }
    });

    // ===== REACTION EVENTS =====

    socket.on('reaction:send', safely(async ({ roomId, emoji }) => {
      if (!socket.rooms.has(roomId) || typeof emoji !== 'string' || emoji.length > 16 ||
          !(await isParticipant(roomId, socket.user.id))) return;
      io.to(roomId).emit('reaction:received', {
        emoji,
        userId: socket.user.id,
        userName: socket.user.name,
        id: Date.now() + Math.random(),
      });
    }));

    // ===== WEBRTC SIGNALING EVENTS (relay via Socket.IO) =====

    socket.on('call:signal', async ({ roomId, targetId, signal, type } = {}) => {
      try {
        const call = calls.get(roomId);
        const target = call && call.get(targetId);
        const validSignal = signal && typeof signal === 'object' &&
          ['offer', 'answer', 'ice-candidate'].includes(type) &&
          JSON.stringify(signal).length <= 65536 &&
          (type === 'ice-candidate'
            ? typeof signal.candidate === 'string'
            : signal.type === type && typeof signal.sdp === 'string');
        if (!validSignal || socket.callRoomId !== roomId || !call?.has(socket.id) ||
            !target || targetId === socket.id ||
            !(await isParticipant(roomId, socket.user.id)) ||
            !(await isParticipant(roomId, target.userId)) ||
            !socket.connected || !calls.get(roomId)?.has(socket.id) ||
            calls.get(roomId)?.get(targetId) !== target) {
          return socket.emit('call:error', { message: 'Call signaling was rejected' });
        }
        io.to(targetId).emit('call:signal', {
          from: socket.id,
          userId: socket.user.id,
          userName: socket.user.name,
          signal,
          type,
        });
      } catch (error) {
        console.error('Call signaling error:', error);
        socket.emit('call:error', { message: 'Unable to relay call signal' });
      }
    });

    socket.on('call:join', async ({ roomId, sessionId } = {}, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      let registered = false;
      try {
        const room = await Room.findByPk(roomId);
        const eligible = room?.isActive && await isParticipant(roomId, socket.user.id);
        if (!socket.connected || !eligible) {
          return reply({ error: 'You are not an active participant of this room' });
        }
        if (!invitations.canJoin(roomId, sessionId, socket.user.id)) {
          return reply({ error: 'An accepted call invitation is required' });
        }
        if (socket.callRoomId === roomId) return reply({ error: 'Already in this call' });
        if (socket.callRoomId) return reply({ error: 'You are already in another call' });
        for (const activeCall of calls.values()) {
          if ([...activeCall.values()].some((participant) => participant.userId === socket.user.id)) {
            return reply({ error: 'You are already in a call on another tab or room' });
          }
        }
        const call = calls.get(roomId) || new Map();
        const participants = [...call.values()];
        const participant = {
          socketId: socket.id,
          userId: socket.user.id,
          userName: socket.user.name,
          avatar: socket.user.avatar,
        };
        call.set(socket.id, participant);
        calls.set(roomId, call);
        socket.callRoomId = roomId;
        registered = true;
        await socket.join(`call:${roomId}`);
        if (!socket.connected) {
          leaveCall(socket);
          invitations.mediaDisconnected(roomId, socket.user.id);
          return;
        }
        if (socket.callRoomId !== roomId || !calls.get(roomId)?.has(socket.id) ||
            !invitations.canJoin(roomId, sessionId, socket.user.id)) {
          leaveCall(socket);
          return reply({ error: 'The call is no longer available' });
        }
        invitations.joined(roomId, sessionId, socket.user.id);
        reply({ participants });
        socket.to(`call:${roomId}`).emit('call:user-joined', participant);
      } catch (error) {
        if (registered && socket.callRoomId === roomId) {
          leaveCall(socket);
          invitations.mediaDisconnected(roomId, socket.user.id);
        }
        console.error('Call join error:', error);
        reply({ error: 'Unable to join the call' });
      }
    });

    socket.on('call:leave', ({ roomId } = {}) => {
      if (socket.callRoomId === roomId) invitations.leave(socket);
    });

    // ===== TYPING EVENTS =====

    socket.on('chat:typing', safely(async ({ roomId }) => {
      if (!socket.rooms.has(roomId) || !(await isParticipant(roomId, socket.user.id))) return;
      socket.to(roomId).emit('chat:typing', {
        userId: socket.user.id,
        userName: socket.user.name,
      });
    }));

    socket.on('chat:stop-typing', safely(async ({ roomId }) => {
      if (!socket.rooms.has(roomId) || !(await isParticipant(roomId, socket.user.id))) return;
      socket.to(roomId).emit('chat:stop-typing', {
        userId: socket.user.id,
      });
    }));

    // ===== DISCONNECT =====

    socket.on('disconnect', safely(async () => {
      const disconnectedCallRoom = socket.callRoomId;
      leaveCall(socket);
      if (disconnectedCallRoom) invitations.mediaDisconnected(disconnectedCallRoom, socket.user.id);
      invitations.disconnect(socket);
      console.log(`❌ User disconnected: ${socket.user.name}`);
      if (!io.sockets.adapter.rooms.has(`user:${socket.user.id}`)) {
        await setUserOnline(socket.user.id, false);
      }
      if (socket.roomId) {
        socket.to(socket.roomId).emit('room:user-left', {
          id: socket.user.id,
          name: socket.user.name,
        });
        await emitParticipants(io, socket.roomId);
      }
    }));
  });
  return invitations;
};

module.exports = initializeSocket;
