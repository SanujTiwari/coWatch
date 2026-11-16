const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/User');
const { generateRoomToken } = require('../utils/tokenGenerator');
const { Op } = require('sequelize');

// POST /api/rooms/create
exports.createRoom = async (req, res, next) => {
  try {
    const { name, maxParticipants, theme, isPrivate } = req.body;

    const token = generateRoomToken();

    const room = await Room.create({
      name: name || `${req.user.name}'s Room`,
      token,
      hostId: req.user.id,
      maxParticipants: maxParticipants || 10,
      theme: theme || 'default',
      isPrivate: isPrivate !== false,
    });

    await room.reload({ include: [{ association: 'host' }] });

    res.status(201).json({ room });
  } catch (error) {
    next(error);
  }
};

// POST /api/rooms/join
exports.joinRoom = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Room token is required' });
    }

    const room = await Room.findOne({
      where: { token: token.toUpperCase(), isActive: true },
      include: [{ association: 'host' }],
    });

    if (!room) {
      return res.status(404).json({ message: 'Room not found or inactive' });
    }

    res.json({ room });
  } catch (error) {
    next(error);
  }
};

// GET /api/rooms/:id
exports.getRoom = async (req, res, next) => {
  try {
    const room = await Room.findByPk(req.params.id, {
      include: [{ association: 'host' }],
    });

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json({ room });
  } catch (error) {
    next(error);
  }
};

// GET /api/rooms/my/rooms
exports.getMyRooms = async (req, res, next) => {
  try {
    const rooms = await Room.findAll({
      where: {
        hostId: req.user.id,
        isActive: true,
      },
      include: [{ association: 'host' }],
      order: [['updatedAt', 'DESC']],
    });

    res.json({ rooms });
  } catch (error) {
    next(error);
  }
};

// PUT /api/rooms/:id/media
exports.updateMedia = async (req, res, next) => {
  try {
    const { title, url, type } = req.body;
    const room = await Room.findByPk(req.params.id);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    room.currentMediaTitle = title || '';
    room.currentMediaUrl = url || '';
    room.currentMediaType = type || 'video';
    room.currentMediaTime = 0;
    room.isMediaPlaying = false;

    await room.save();
    res.json({ room });
  } catch (error) {
    next(error);
  }
};

// POST /api/rooms/:id/playlist
exports.addToPlaylist = async (req, res, next) => {
  try {
    const { title, url, type } = req.body;
    const room = await Room.findByPk(req.params.id);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json({ message: 'Playlist feature coming soon' });
  } catch (error) {
    next(error);
  }
};

// GET /api/rooms/:id/messages
exports.getMessages = async (req, res, next) => {
  try {
    const messages = await Message.findAll({
      where: { roomId: req.params.id },
      include: [{ association: 'sender', attributes: ['id', 'name', 'avatar'] }],
      order: [['createdAt', 'ASC']],
      limit: 100,
    });

    res.json({ messages });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/rooms/:id
exports.deleteRoom = async (req, res, next) => {
  try {
    const room = await Room.findByPk(req.params.id);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (room.hostId !== req.user.id) {
      return res.status(403).json({ message: 'Only the host can delete the room' });
    }

    room.isActive = false;
    await room.save();

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    next(error);
  }
};
