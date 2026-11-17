const express = require('express');
const router = express.Router();
const {
  searchUsers,
  sendRequest,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  getFriends,
  getPendingRequests,
  getBlockedUsers,
  blockUser,
  unblockUser,
  reportUser,
} = require('../controllers/friend.controller');
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { friendRequestValidation, reportValidation } = require('../middleware/validation');

router.use(auth);

router.get('/search', searchUsers);
router.post('/request', friendRequestValidation, sendRequest);
router.post('/request/:id/accept', acceptRequest);
router.post('/request/:id/reject', rejectRequest);
router.post('/request/:id/cancel', cancelRequest);
router.get('/', getFriends);
router.get('/requests', getPendingRequests);
router.get('/blocked', getBlockedUsers);
router.post('/:id/block', blockUser);
router.post('/:id/unblock', unblockUser);
router.post('/report', reportValidation, reportUser);

module.exports = router;
