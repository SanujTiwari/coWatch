const Room = require('../models/Room');
const RoomParticipant = require('../models/RoomParticipant');
const Message = require('../models/Message');
const User = require('../models/User');
const PlaylistItem = require('../models/PlaylistItem');
const { generateRoomToken } = require('../utils/tokenGenerator');
const { Op } = require('sequelize');
const { sequelize } = require('../config/db');
const { isBlockedFromRoom } = require('../services/roomAccess');

const participantAttributes = ['id', 'name', 'email', 'avatar', 'online', 'lastSeen'];

// POST /api/rooms/create
exports.createRoom = async (req, res, next) => {
  try {
    const { name, maxParticipants, theme, isPrivate, roomType } = req.body;

    const token = generateRoomToken();

    const room = await sequelize.transaction(async (transaction) => {
      const created = await Room.create({
        name: name || `${req.user.name}'s Room`,
        token,
        hostId: req.user.id,
        maxParticipants: maxParticipants || 10,
        theme: theme || 'default',
        isPrivate: isPrivate !== false,
        roomType: roomType || 'group',
      }, { transaction });

      await RoomParticipant.create({
        roomId: created.id,
        userId: req.user.id,
        role: 'host',
      }, { transaction });

      await created.reload({
        include: [
          { association: 'host', attributes: participantAttributes },
          {
            association: 'participants',
            attributes: participantAttributes,
            through: { attributes: ['role', 'chatMuted'], where: { isRemoved: false } },
          },
        ],
        transaction,
      });
      return created;
    });

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
      include: [
        { association: 'host', attributes: participantAttributes },
        {
          association: 'participants',
          attributes: participantAttributes,
          through: { attributes: ['role', 'chatMuted'], where: { isRemoved: false } },
        },
      ],
    });

    if (!room) {
      return res.status(404).json({ message: 'Room not found or inactive' });
    }
    if (await isBlockedFromRoom(room.id, req.user.id)) {
      return res.status(403).json({ message: 'You cannot join this room' });
    }

    // Add requesting user as a participant if not already
    const membership = await sequelize.transaction(async (transaction) => {
      const lockedRoom = await Room.findByPk(room.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!lockedRoom || !lockedRoom.isActive) return null;
      const [entry] = await RoomParticipant.findOrCreate({
        where: { roomId: room.id, userId: req.user.id },
        defaults: { role: 'participant' },
        transaction,
      });
      return entry;
    });
    if (!membership || membership.isRemoved) {
      return res.status(403).json({ message: 'A host or moderator must reinstate you before you can rejoin' });
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
      include: [
        { association: 'host', attributes: participantAttributes },
        {
          association: 'participants',
          attributes: participantAttributes,
          through: { attributes: ['role', 'chatMuted'], where: { isRemoved: false } },
        },
      ],
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
    const memberships = await RoomParticipant.findAll({
      where: { userId: req.user.id, isRemoved: false },
      attributes: ['roomId'],
    });
    const participantRoomIds = memberships.map((m) => m.roomId);

    const rooms = await Room.findAll({
      where: {
        isActive: true,
        [Op.or]: [{ hostId: req.user.id }, { id: participantRoomIds }],
      },
      include: [
        { association: 'host', attributes: participantAttributes },
        {
          association: 'participants',
          attributes: participantAttributes,
          through: { attributes: ['role', 'chatMuted'], where: { isRemoved: false } },
        },
      ],
      order: [['updatedAt', 'DESC']],
    });

    const allowed = await Promise.all(rooms.map(async (room) => !(await isBlockedFromRoom(room.id, req.user.id))));
    res.json({ rooms: rooms.filter((room, index) => allowed[index]) });
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

    const membership = await RoomParticipant.findOne({
      where: { roomId: room.id, userId: req.user.id },
    });
    if (!membership) {
      return res.status(403).json({ message: 'You are not a participant of this room' });
    }

    const isHost = room.hostId === req.user.id;
    if (!isHost) {
      return res.status(403).json({ message: 'Only the host can change media' });
    }

    room.currentMediaTitle = title || '';
    room.currentMediaUrl = url || '';
    room.currentMediaType = type || 'video';
    room.currentMediaTime = 0;
    room.isMediaPlaying = false;

    await room.save();

    const updated = await Room.findByPk(room.id, {
      include: [
        { association: 'host', attributes: participantAttributes },
        {
          association: 'participants',
          attributes: participantAttributes,
          through: { attributes: ['role', 'chatMuted'], where: { isRemoved: false } },
        },
      ],
    });

    res.json({ room: updated });
  } catch (error) {
    next(error);
  }
};

// POST /api/rooms/:id/playlist
exports.addToPlaylist = async (req, res, next) => {
  try {
    const { title, url, type, duration } = req.body;

    let parsedUrl;
    try { parsedUrl = new URL(url); } catch { return res.status(400).json({ message: 'Valid media URL is required' }); }
    if (typeof title !== 'string' || !title.trim() || title.length > 200 ||
        typeof url !== 'string' || url.length > 2048 || !['http:', 'https:'].includes(parsedUrl.protocol) ||
        (type && !['video', 'youtube', 'reel', 'direct'].includes(type)) ||
        (duration != null && (!Number.isInteger(duration) || duration < 0 || duration > 2592000))) {
      return res.status(400).json({ message: 'Title and URL are required' });
    }

    const item = await sequelize.transaction(async (transaction) => {
      const room = await Room.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!room || !room.isActive) return null;
      const maxOrder = await PlaylistItem.max('order', { where: { roomId: room.id }, transaction });
      const created = await PlaylistItem.create({
        roomId: room.id,
        addedBy: req.user.id,
        title: title.trim(),
        url,
        type: type || 'video',
        duration: duration || 0,
        order: (maxOrder || 0) + 1,
      }, { transaction });
      await created.reload({
        include: [{ association: 'addedByUser', attributes: ['id', 'name', 'avatar'] }],
        transaction,
      });
      return created;
    });
    if (!item) return res.status(404).json({ message: 'Room not found' });

    const io = req.app.get('io');
    if (io) io.to(req.params.id).emit('playlist:changed');
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
};

exports.reorderPlaylist = async (req, res, next) => {
  try {
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds) || itemIds.some((id) => typeof id !== 'string') ||
        new Set(itemIds).size !== itemIds.length) {
      return res.status(400).json({ message: 'A unique list of playlist item IDs is required' });
    }

    const result = await sequelize.transaction(async (transaction) => {
      const room = await Room.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!room || !room.isActive) return 'missing';
      const items = await PlaylistItem.findAll({ where: { roomId: room.id }, transaction });
      const byId = new Map(items.map((item) => [item.id, item]));
      if (itemIds.length !== items.length || itemIds.some((id) => !byId.has(id))) return 'stale';
      for (let index = 0; index < itemIds.length; index += 1) {
        await byId.get(itemIds[index]).update({ order: index + 1 }, { transaction });
      }
      return 'updated';
    });

    if (result === 'missing') return res.status(404).json({ message: 'Room not found' });
    if (result === 'stale') return res.status(409).json({ message: 'Playlist changed; refresh and try again' });
    const io = req.app.get('io');
    if (io) io.to(req.params.id).emit('playlist:changed');
    res.json({ message: 'Playlist reordered' });
  } catch (error) {
    next(error);
  }
};

exports.removeFromPlaylist = async (req, res, next) => {
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const room = await Room.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!room || !room.isActive) return false;
      const items = await PlaylistItem.findAll({
        where: { roomId: room.id }, order: [['order', 'ASC'], ['createdAt', 'ASC']], transaction,
      });
      const item = items.find((entry) => entry.id === req.params.itemId);
      if (!item) return false;
      await item.destroy({ transaction });
      const remaining = items.filter((entry) => entry.id !== item.id);
      for (let index = 0; index < remaining.length; index += 1) {
        await remaining[index].update({ order: index + 1 }, { transaction });
      }
      return true;
    });
    if (!result) return res.status(404).json({ message: 'Playlist item not found' });
    const io = req.app.get('io');
    if (io) io.to(req.params.id).emit('playlist:changed');
    res.json({ message: 'Playlist item removed' });
  } catch (error) {
    next(error);
  }
};

exports.getPlaylist = async (req, res, next) => {
  try {
    const items = await PlaylistItem.findAll({
      where: { roomId: req.params.id },
      include: [{ association: 'addedByUser', attributes: ['id', 'name', 'avatar'] }],
      order: [['order', 'ASC'], ['createdAt', 'ASC']],
    });
    res.json({ items });
  } catch (error) {
    next(error);
  }
};

// GET /api/rooms/:id/messages
exports.getMessages = async (req, res, next) => {
  try {
    const messages = await Message.findAll({
      where: { roomId: req.params.id },
      include: [
        { association: 'sender', attributes: ['id', 'name', 'avatar'] },
        { association: 'replyTo', include: [{ association: 'sender', attributes: ['id', 'name', 'avatar'] }] },
      ],
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    res.json({ messages: messages.reverse() });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/rooms/:id
exports.deleteRoom = async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const realtime = req.app.get('realtime');
    if (!io || !realtime) return res.status(503).json({ message: 'Real-time service is unavailable' });
    const result = await sequelize.transaction(async (transaction) => {
      const room = await Room.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!room || !room.isActive) return { status: 404, message: 'Room not found' };
      if (room.hostId !== req.user.id) return { status: 403, message: 'Only the host can delete the room' };
      room.isActive = false;
      await room.save({ transaction });
      return { status: 200 };
    });
    if (result.status !== 200) return res.status(result.status).json({ message: result.message });

    realtime.closeRoom(req.params.id);
    io.to(req.params.id).emit('room:closed', { roomId: req.params.id });
    io.in(req.params.id).socketsLeave(req.params.id);
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    next(error);
  }
};
