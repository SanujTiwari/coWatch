const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  updateProfile,
  forgotPassword,
  resetPassword,
  uploadAvatar,
} = require('../controllers/auth.controller');
const auth = require('../middleware/auth');
const { upload, validateAvatar } = require('../middleware/upload');
const rateLimit = require('express-rate-limit');
const { registerValidation, loginValidation } = require('../middleware/validation');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 10,
  message: { message: 'Too many authentication attempts, please try again later' },
});

router.post('/register', authLimiter, registerValidation, register);
router.post('/login', authLimiter, loginValidation, login);
router.get('/me', auth, getMe);
router.put('/profile', auth, updateProfile);
router.post('/upload-avatar', auth, upload.single('avatar'), validateAvatar, uploadAvatar);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);

module.exports = router;
