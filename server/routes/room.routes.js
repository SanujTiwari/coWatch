const express = require('express');
const router = express.Router();
const {
  createRoom,
  joinRoom,
  getRoom,
  getMyRooms,
  updateMedia,
  addToPlaylist,
  getMessages,
  deleteRoom,
} = require('../controllers/room.controller');
const auth = require('../middleware/auth');

router.use(auth); // All room routes require authentication

router.post('/create', createRoom);
router.post('/join', joinRoom);
router.get('/my/rooms', getMyRooms);
router.get('/:id', getRoom);
router.put('/:id/media', updateMedia);
router.post('/:id/playlist', addToPlaylist);
router.get('/:id/messages', getMessages);
router.delete('/:id', deleteRoom);

module.exports = router;
