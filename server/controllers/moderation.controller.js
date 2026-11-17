const { sequelize } = require('../config/db');
const { Room, RoomParticipant } = require('../models');

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = ['remove', 'reinstate', 'mute-chat', 'unmute-chat', 'request-mic-mute'];

exports.list = async (req, res, next) => {
  try {
    const room = await Room.findByPk(req.params.id, {
      include: [{
        association: 'participants',
        attributes: ['id', 'name', 'avatar', 'online'],
        through: { attributes: ['role', 'isRemoved', 'chatMuted'] },
      }],
    });
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json({ participants: room.participants });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { userId, id: roomId } = req.params;
    const { action } = req.body;
    if (!uuid.test(userId) || !actions.includes(action)) {
      return res.status(400).json({ message: 'Invalid moderation action' });
    }
    const io = req.app.get('io');
    const realtime = req.app.get('realtime');
    if (!io || !realtime) return res.status(503).json({ message: 'Real-time service is unavailable' });

    const result = await sequelize.transaction(async (transaction) => {
      const room = await Room.findByPk(roomId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!room?.isActive) return { status: 404, message: 'Room not found' };
      const actor = await RoomParticipant.findOne({
        where: { roomId, userId: req.user.id, isRemoved: false }, transaction,
      });
      if (!actor || (room.hostId !== req.user.id && actor.role !== 'moderator')) {
        return { status: 403, message: 'Insufficient permissions' };
      }
      const target = await RoomParticipant.findOne({ where: { roomId, userId }, transaction });
      if (!target) return { status: 404, message: 'Participant not found' };
      if (userId === req.user.id || userId === room.hostId ||
          (room.hostId !== req.user.id && target.role !== 'participant')) {
        return { status: 403, message: 'You cannot moderate this participant' };
      }
      if (action === 'request-mic-mute' && target.isRemoved) {
        return { status: 409, message: 'Participant is removed from this room' };
      }
      if (action === 'remove') await target.update({ isRemoved: true }, { transaction });
      if (action === 'reinstate') await target.update({ isRemoved: false }, { transaction });
      if (action === 'mute-chat') await target.update({ chatMuted: true }, { transaction });
      if (action === 'unmute-chat') await target.update({ chatMuted: false }, { transaction });
      return { status: 200 };
    });
    if (result.status !== 200) return res.status(result.status).json({ message: result.message });

    if (action === 'request-mic-mute') {
      const listening = [...io.sockets.sockets.values()].some((socket) =>
        socket.connected && socket.user?.id === userId && socket.roomId === roomId);
      if (!listening) return res.status(409).json({ message: 'Participant is unavailable in this room' });
      io.to(`user:${userId}`).emit('room:mic-mute-request', { roomId, userName: req.user.name });
    } else {
      io.to(roomId).emit('room:moderation-changed', { roomId, userId, action });
      if (action === 'remove') {
        realtime.revoke(roomId, userId);
        io.to(`user:${userId}`).emit('room:removed', { roomId });
        for (const socket of io.sockets.sockets.values()) {
          if (socket.user?.id === userId && (socket.roomId === roomId || socket.callRoomId === roomId)) {
            socket.disconnect(true);
          }
        }
      }
    }
    res.json({ message: action === 'request-mic-mute' ? 'Microphone mute requested' : 'Participant updated' });
  } catch (error) {
    next(error);
  }
};
