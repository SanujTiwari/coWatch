const { User, Friend, Report } = require('../models');
const { Op } = require('sequelize');

const friendUserAttributes = ['id', 'name', 'email', 'avatar', 'online', 'lastSeen'];

// GET /api/friends/search?q=
exports.searchUsers = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return res.json({ users: [] });
    }
    const blocks = await Friend.findAll({
      where: { status: 'blocked', [Op.or]: [{ userId: req.user.id }, { friendId: req.user.id }] },
    });
    const blockedIds = blocks.map((block) => block.userId === req.user.id ? block.friendId : block.userId);
    const users = await User.findAll({
      where: {
        [Op.and]: [
          { id: { [Op.notIn]: [req.user.id, ...blockedIds] } },
          {
            [Op.or]: [
              { name: { [Op.iLike]: `%${q}%` } },
              { email: { [Op.iLike]: `%${q}%` } },
            ],
          },
        ],
      },
      attributes: friendUserAttributes,
      limit: 10,
    });
    res.json({ users });
  } catch (error) {
    next(error);
  }
};

// POST /api/friends/request
exports.sendRequest = async (req, res, next) => {
  try {
    const { friendId } = req.body;
    if (!friendId) {
      return res.status(400).json({ message: 'friendId is required' });
    }
    if (friendId === req.user.id) {
      return res.status(400).json({ message: 'You cannot send a request to yourself' });
    }

    const target = await User.findByPk(friendId);
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existing = await Friend.findOne({
      where: {
        [Op.or]: [
          { userId: req.user.id, friendId },
          { userId: friendId, friendId: req.user.id },
        ],
      },
    });
    if (existing) {
      return res.status(400).json({ message: 'A request or friendship already exists between you' });
    }

    const request = await Friend.create({ userId: req.user.id, friendId, status: 'pending' });
    await request.reload({ include: [{ association: 'target', attributes: friendUserAttributes }] });

    res.status(201).json({ request });
  } catch (error) {
    next(error);
  }
};

// POST /api/friends/request/:id/accept
exports.acceptRequest = async (req, res, next) => {
  try {
    const request = await Friend.findOne({
      where: { userId: req.params.id, friendId: req.user.id, status: 'pending' },
    });
    if (!request) {
      return res.status(404).json({ message: 'No pending request from this user' });
    }
    request.status = 'accepted';
    await request.save();
    res.json({ message: 'Friend request accepted', request });
  } catch (error) {
    next(error);
  }
};

// POST /api/friends/request/:id/reject
exports.rejectRequest = async (req, res, next) => {
  try {
    const request = await Friend.findOne({
      where: { userId: req.params.id, friendId: req.user.id, status: 'pending' },
    });
    if (!request) {
      return res.status(404).json({ message: 'No pending request from this user' });
    }
    await request.destroy();
    res.json({ message: 'Friend request rejected' });
  } catch (error) {
    next(error);
  }
};

// POST /api/friends/request/:id/cancel
exports.cancelRequest = async (req, res, next) => {
  try {
    const request = await Friend.findOne({
      where: { userId: req.user.id, friendId: req.params.id, status: 'pending' },
    });
    if (!request) {
      return res.status(404).json({ message: 'No pending request to this user' });
    }
    await request.destroy();
    res.json({ message: 'Friend request cancelled' });
  } catch (error) {
    next(error);
  }
};

// GET /api/friends
exports.getFriends = async (req, res, next) => {
  try {
    const friendships = await Friend.findAll({
      where: {
        status: 'accepted',
        [Op.or]: [{ userId: req.user.id }, { friendId: req.user.id }],
      },
      include: [
        { association: 'requester', attributes: friendUserAttributes },
        { association: 'target', attributes: friendUserAttributes },
      ],
    });

    const friends = friendships.map((f) => {
      const other = f.userId === req.user.id ? f.target : f.requester;
      return { friendshipId: f.id, ...other.toJSON ? other.toJSON() : other };
    });

    res.json({ friends });
  } catch (error) {
    next(error);
  }
};

// GET /api/friends/requests
exports.getPendingRequests = async (req, res, next) => {
  try {
    const received = await Friend.findAll({
      where: { friendId: req.user.id, status: 'pending' },
      include: [{ association: 'requester', attributes: friendUserAttributes }],
    });
    const sent = await Friend.findAll({
      where: { userId: req.user.id, status: 'pending' },
      include: [{ association: 'target', attributes: friendUserAttributes }],
    });
    res.json({
      received: received.map((r) => r.requester),
      sent: sent.map((s) => s.target),
    });
  } catch (error) {
    next(error);
  }
};

exports.getBlockedUsers = async (req, res, next) => {
  try {
    const blocks = await Friend.findAll({
      where: { userId: req.user.id, status: 'blocked' },
      include: [{ association: 'target', attributes: friendUserAttributes }],
    });
    res.json({ users: blocks.map((block) => block.target) });
  } catch (error) {
    next(error);
  }
};

// POST /api/friends/:id/block
exports.blockUser = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      return res.status(400).json({ message: 'You cannot block yourself' });
    }

    let rel = await Friend.findOne({
      where: {
        [Op.or]: [
          { userId: req.user.id, friendId: targetId },
          { userId: targetId, friendId: req.user.id },
        ],
      },
    });
    if (rel) {
      if (rel.status === 'blocked' && rel.userId !== req.user.id) {
        return res.status(403).json({ message: 'This relationship is blocked' });
      }
      rel.userId = req.user.id;
      rel.friendId = targetId;
      rel.status = 'blocked';
      await rel.save();
    } else {
      rel = await Friend.create({ userId: req.user.id, friendId: targetId, status: 'blocked' });
    }
    const io = req.app.get('io');
    if (io) {
      io.in(`user:${targetId}`).disconnectSockets(true);
      io.in(`user:${req.user.id}`).disconnectSockets(true);
    }
    res.json({ message: 'User blocked', friend: rel });
  } catch (error) {
    next(error);
  }
};

// POST /api/friends/:id/unblock
exports.unblockUser = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    const rel = await Friend.findOne({
      where: {
        userId: req.user.id,
        friendId: targetId,
        status: 'blocked',
      },
    });
    if (!rel) {
      return res.status(404).json({ message: 'No blocked relationship found' });
    }
    await rel.destroy();
    res.json({ message: 'User unblocked' });
  } catch (error) {
    next(error);
  }
};

// POST /api/friends/report
exports.reportUser = async (req, res, next) => {
  try {
    const { reportedUserId, reason, description, roomId } = req.body;

    if (!reportedUserId) {
      return res.status(400).json({ message: 'reportedUserId is required' });
    }
    if (reportedUserId === req.user.id) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }

    const reportedUser = await User.findByPk(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const report = await Report.create({
      reporterId: req.user.id,
      reportedUserId,
      reason: reason || 'other',
      description: description || '',
      roomId: roomId || null,
    });

    res.status(201).json({ message: 'Report submitted', report });
  } catch (error) {
    next(error);
  }
};
