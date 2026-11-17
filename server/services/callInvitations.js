const { randomUUID } = require('crypto');
const { Room } = require('../models');

module.exports = (io, calls, isParticipant, leaveCall) => {
  const rawTimeout = process.env.CALL_RING_TIMEOUT_MS || '30000';
  if (!/^\d+$/.test(rawTimeout) || Number(rawTimeout) < 5000 || Number(rawTimeout) > 120000) {
    throw new Error('CALL_RING_TIMEOUT_MS must be between 5000 and 120000 milliseconds');
  }
  const timeout = Number(rawTimeout);
  const sessions = new Map();
  const reservations = new Map();

  const hasCall = (userId) => [...calls.values()].some((call) =>
    [...call.values()].some((participant) => participant.userId === userId));
  const listenerFor = (userId) => [...io.sockets.sockets.values()].find((socket) =>
    socket.connected && socket.callListener && socket.user.id === userId);

  const updateCaller = (session, userId, status) => {
    io.to(session.callerSocketId).emit('call:invite-update', {
      sessionId: session.id, userId, status,
    });
  };
  const close = (session, reason) => {
    if (sessions.get(session.roomId) !== session) return;
    sessions.delete(session.roomId);
    clearTimeout(session.timer);
    clearTimeout(session.callerJoinTimer);
    for (const entry of session.recipients.values()) clearTimeout(entry.joinTimer);
    for (const userId of [session.callerId, ...session.recipients.keys()]) {
      if (reservations.get(userId) === session.id) reservations.delete(userId);
      io.to(`user:${userId}`).emit('call:ended', { sessionId: session.id, roomId: session.roomId, reason });
    }
    const active = calls.get(session.roomId);
    for (const socketId of [...(active?.keys() || [])]) {
      const peer = io.sockets.sockets.get(socketId);
      if (peer) leaveCall(peer);
    }
  };
  const finishIfNoRecipients = (session) => {
    if (![...session.recipients.values()].some((entry) => entry.status === 'pending' || entry.status === 'accepted')) {
      close(session, 'No participants accepted the call.');
    }
  };
  const exit = (session, userId) => {
    if (session.callerId === userId) {
      close(session, 'The caller ended the call.');
      return;
    }
    const recipient = session.recipients.get(userId);
    if (!recipient || recipient.status !== 'accepted') return;
    recipient.status = 'left';
    clearTimeout(recipient.joinTimer);
    reservations.delete(userId);
    updateCaller(session, userId, 'left');
    io.to(`user:${userId}`).emit('call:ended', {
      sessionId: session.id, roomId: session.roomId, reason: 'You left the call.',
    });
    const active = calls.get(session.roomId);
    for (const participant of [...(active?.values() || [])]) {
      if (participant.userId === userId) {
        const peer = io.sockets.sockets.get(participant.socketId);
        if (peer) leaveCall(peer);
      }
    }
    finishIfNoRecipients(session);
  };

  const canJoin = (roomId, sessionId, userId) => {
    const session = sessions.get(roomId);
    return !!session && session.id === sessionId &&
      (session.callerId === userId || session.recipients.get(userId)?.status === 'accepted');
  };

  const watchJoin = (session, userId) => {
    if (session.callerId === userId) {
      clearTimeout(session.callerJoinTimer);
      session.callerJoinTimer = setTimeout(() => {
        if (sessions.get(session.roomId) === session) close(session, 'The caller did not join the call.');
      }, timeout);
      session.callerJoinTimer.unref();
      return;
    }
    const entry = session.recipients.get(userId);
    if (!entry || entry.status !== 'accepted') return;
    clearTimeout(entry.joinTimer);
    entry.joinTimer = setTimeout(() => {
      if (sessions.get(session.roomId) === session && entry.status === 'accepted') exit(session, userId);
    }, timeout);
    entry.joinTimer.unref();
  };

  const register = (socket) => {
    socket.on('call:subscribe', ({}, acknowledge) => {
      socket.callListener = true;
      if (typeof acknowledge === 'function') acknowledge({ ok: true });
    });

    socket.on('call:invite', async ({ roomId }, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      const generation = socket.callInviteGeneration || 0;
      let session;
      let replied = false;
      try {
        if (!socket.callListener || !(await isParticipant(roomId, socket.user.id)) || !socket.connected ||
            (socket.callInviteGeneration || 0) !== generation) {
          return reply({ error: 'You are not an active participant of this room' });
        }
        if (reservations.has(socket.user.id) || hasCall(socket.user.id)) return reply({ error: 'You are already busy in another call' });
        if (sessions.has(roomId) || calls.has(roomId)) return reply({ error: 'A call is already active in this room' });
        session = {
          id: randomUUID(), roomId, callerId: socket.user.id, callerSocketId: socket.id,
          recipients: new Map(), timer: null,
        };
        sessions.set(roomId, session);
        reservations.set(socket.user.id, session.id);
        const room = await Room.findByPk(roomId, {
          include: [{
            association: 'participants', attributes: ['id', 'name'],
            through: { attributes: [], where: { isRemoved: false } },
          }],
        });
        const callerEligible = room?.isActive && await isParticipant(roomId, socket.user.id);
        if (!callerEligible || sessions.get(roomId) !== session || !socket.connected ||
            (socket.callInviteGeneration || 0) !== generation) {
          close(session, 'The call could not be started.');
          return reply({ error: 'The call could not be started' });
        }
        const recipients = [];
        for (const member of room.participants) {
          if (member.id === socket.user.id) continue;
          const eligible = await isParticipant(roomId, member.id);
          if (sessions.get(roomId) !== session) return reply({ error: 'The call was cancelled' });
          if (!eligible) continue;
          const listener = listenerFor(member.id);
          const status = reservations.has(member.id) || hasCall(member.id) ? 'busy' : listener ? 'pending' : 'unavailable';
          recipients.push({ userId: member.id, userName: member.name, status });
          if (status === 'pending') {
            session.recipients.set(member.id, { status, socketId: listener.id });
            reservations.set(member.id, session.id);
          }
        }
        if (!session.recipients.size) {
          close(session, 'No participants are available.');
          return reply({ error: 'No participants are available', recipients });
        }
        const expiresAt = Date.now() + timeout;
        session.timer = setTimeout(() => {
          for (const [userId, entry] of session.recipients) {
            if (entry.status !== 'pending') continue;
            entry.status = 'timeout';
            reservations.delete(userId);
            updateCaller(session, userId, 'timeout');
            io.to(entry.socketId).emit('call:ended', { sessionId: session.id, roomId, reason: 'The call timed out.' });
          }
          finishIfNoRecipients(session);
        }, timeout);
        session.timer.unref();
        reply({ sessionId: session.id, roomId, recipients, expiresAt });
        replied = true;
        for (const [userId, entry] of session.recipients) {
          const eligible = await isParticipant(roomId, userId);
          if (sessions.get(roomId) !== session) return;
          if (entry.status !== 'pending') continue;
          if (!eligible || !io.sockets.sockets.get(entry.socketId)?.connected) {
            entry.status = 'unavailable';
            reservations.delete(userId);
            updateCaller(session, userId, 'unavailable');
            finishIfNoRecipients(session);
            continue;
          }
          io.to(entry.socketId).emit('call:incoming', {
            sessionId: session.id, roomId, roomName: room.name, expiresAt,
            caller: { id: socket.user.id, name: socket.user.name, avatar: socket.user.avatar },
          });
        }
      } catch (error) {
        if (session) close(session, 'The call could not be started.');
        console.error('Call invitation failed:', error);
        if (!replied) reply({ error: 'Unable to start the call' });
      }
    });

    socket.on('call:cancel-start', ({ roomId }) => {
      socket.callInviteGeneration = (socket.callInviteGeneration || 0) + 1;
      const session = sessions.get(roomId);
      if (session?.callerSocketId === socket.id) close(session, 'The caller cancelled the call.');
    });

    socket.on('call:respond', async ({ roomId, sessionId, accept }, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      try {
        const session = sessions.get(roomId);
        const entry = session?.recipients.get(socket.user.id);
        if (!session || session.id !== sessionId || !entry || entry.socketId !== socket.id ||
            entry.status !== 'pending' || typeof accept !== 'boolean' ||
            !(await isParticipant(roomId, socket.user.id)) ||
            !(await isParticipant(roomId, session.callerId)) ||
            sessions.get(roomId) !== session || entry.status !== 'pending') {
          return reply({ error: 'This invitation is no longer available' });
        }
        entry.status = accept ? 'accepted' : 'rejected';
        if (!accept) reservations.delete(socket.user.id);
        if (accept) {
          watchJoin(session, socket.user.id);
          if (!session.callerJoinTimer && !calls.get(roomId)?.size) {
            watchJoin(session, session.callerId);
          }
        }
        updateCaller(session, socket.user.id, entry.status);
        reply({ ok: true });
        if (!accept) finishIfNoRecipients(session);
      } catch (error) {
        console.error('Call response failed:', error);
        reply({ error: 'Unable to respond to the call' });
      }
    });

    socket.on('call:exit', ({ roomId, sessionId }, acknowledge) => {
      const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
      const session = sessions.get(roomId);
      if (!session || session.id !== sessionId) return reply({ ok: true });
      if (session.callerId !== socket.user.id && session.recipients.get(socket.user.id)?.status !== 'accepted') {
        return reply({ error: 'You are not a participant of this call' });
      }
      exit(session, socket.user.id);
      reply({ ok: true });
    });
  };

  const disconnect = (socket) => {
    for (const session of [...sessions.values()]) {
      if (session.callerSocketId === socket.id) {
        close(session, 'The caller disconnected.');
        continue;
      }
      const entry = session.recipients.get(socket.user.id);
      if (entry?.socketId === socket.id && entry.status === 'accepted') {
        exit(session, socket.user.id);
        continue;
      }
      if (entry?.socketId === socket.id && entry.status === 'pending') {
        entry.status = 'unavailable';
        reservations.delete(socket.user.id);
        updateCaller(session, socket.user.id, 'unavailable');
        finishIfNoRecipients(session);
      }
    }
  };

  return {
    register, disconnect, canJoin,
    closeRoom: (roomId) => {
      const session = sessions.get(roomId);
      if (session) close(session, 'The room was closed.');
    },
    joined: (roomId, sessionId, userId) => {
      const session = sessions.get(roomId);
      if (!session || session.id !== sessionId) return;
      if (session.callerId === userId) {
        clearTimeout(session.callerJoinTimer);
        session.callerJoinTimer = null;
      } else {
        const entry = session.recipients.get(userId);
        if (entry) {
          clearTimeout(entry.joinTimer);
          entry.joinTimer = null;
        }
      }
    },
    mediaDisconnected: (roomId, userId) => {
      const session = sessions.get(roomId);
      if (session) watchJoin(session, userId);
    },
    revoke: (roomId, userId) => {
      const session = sessions.get(roomId);
      if (!session) return;
      if (session.callerId === userId || session.recipients.get(userId)?.status === 'accepted') {
        exit(session, userId);
        return;
      }
      const entry = session.recipients.get(userId);
      if (entry?.status === 'pending') {
        entry.status = 'unavailable';
        reservations.delete(userId);
        updateCaller(session, userId, 'unavailable');
        io.to(entry.socketId).emit('call:ended', { sessionId: session.id, roomId, reason: 'Room access was removed.' });
        finishIfNoRecipients(session);
      }
    },
    leave: (socket) => {
      const session = sessions.get(socket.callRoomId);
      if (session) exit(session, socket.user.id);
      else leaveCall(socket);
    },
  };
};
