const { Room, RoomParticipant } = require('../models');
const { isBlockedFromRoom } = require('../services/roomAccess');

/**
 * Ensure the authenticated user is a participant of the room.
 * Sets req.room and req.membership (role).
 */
const requireRoomMembership = async (req, res, next) => {
  try {
    const roomId = req.params.id || req.body.roomId;
    const userId = req.user.id;

    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required' });
    }

    const room = await Room.findByPk(roomId);
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const membership = await RoomParticipant.findOne({
      where: { roomId, userId, isRemoved: false },
    });

    if (!membership || await isBlockedFromRoom(roomId, userId)) {
      return res.status(403).json({ message: 'You are not a participant of this room' });
    }

    req.room = room;
    req.membership = membership;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Ensure the authenticated user is the host of the room.
 */
const requireHost = (req, res, next) => {
  try {
    const room = req.room;
    if (!room) {
      return res.status(400).json({ message: 'Room context not found' });
    }
    if (room.hostId !== req.user.id) {
      return res.status(403).json({ message: 'Only the room host can perform this action' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Ensure the authenticated user is host or moderator.
 */
const requireHostOrModerator = (req, res, next) => {
  try {
    const room = req.room;
    const membership = req.membership;
    if (!room || !membership) {
      return res.status(400).json({ message: 'Room context not found' });
    }
    const isHost = room.hostId === req.user.id;
    const isModerator = membership.role === 'moderator';
    if (!isHost && !isModerator) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requireRoomMembership,
  requireHost,
  requireHostOrModerator,
};
