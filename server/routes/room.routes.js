const express = require('express');
const router = express.Router();
const {
  createRoom,
  joinRoom,
  getRoom,
  getMyRooms,
  updateMedia,
  addToPlaylist,
  reorderPlaylist,
  removeFromPlaylist,
  getPlaylist,
  getMessages,
  deleteRoom,
} = require('../controllers/room.controller');
const auth = require('../middleware/auth');
const {
  requireRoomMembership,
  requireHost,
  requireHostOrModerator,
} = require('../middleware/roomAuth');
const rateLimit = require('express-rate-limit');
const { roomCreateValidation, roomMediaValidation } = require('../middleware/validation');
const moderation = require('../controllers/moderation.controller');

const roomLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 30,
  message: { message: 'Too many room requests, please try again later' },
});

// All room routes require authentication
router.use(auth);

router.post('/create', roomLimiter, roomCreateValidation, createRoom);
router.post('/join', roomLimiter, joinRoom);
router.get('/my/rooms', roomLimiter, getMyRooms);

router.get('/:id', auth, requireRoomMembership, getRoom);
router.put('/:id/media', auth, requireRoomMembership, requireHost, roomMediaValidation, updateMedia);
router.post('/:id/playlist', auth, requireRoomMembership, addToPlaylist);
router.put('/:id/playlist/order', auth, requireRoomMembership, requireHostOrModerator, reorderPlaylist);
router.delete('/:id/playlist/:itemId', auth, requireRoomMembership, requireHostOrModerator, removeFromPlaylist);
router.get('/:id/playlist', auth, requireRoomMembership, getPlaylist);
router.get('/:id/messages', auth, requireRoomMembership, getMessages);
router.get('/:id/moderation', requireRoomMembership, requireHostOrModerator, moderation.list);
router.patch('/:id/participants/:userId', requireRoomMembership, requireHostOrModerator, moderation.update);
router.delete('/:id', auth, requireRoomMembership, requireHost, deleteRoom);

module.exports = router;
