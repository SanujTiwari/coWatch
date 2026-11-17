const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { JWT_SECRET, JWT_EXPIRE, CLIENT_URL } = require('../config/env');
const nodemailer = require('nodemailer');

const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
};

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  avatar: user.avatar,
  mood: user.mood,
  bio: user.bio,
  online: user.online,
  lastSeen: user.lastSeen,
});

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = await User.create({ name, email, password });
    const token = generateToken(user.id);

    res.status(201).json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    user.online = true;
    user.lastSeen = new Date();
    await user.save();

    const token = generateToken(user.id);

    res.json({
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/auth/me
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};

// PUT /api/auth/profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, bio, mood, avatar } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (bio !== undefined) updates.bio = bio;
    if (mood !== undefined) updates.mood = mood;
    if (avatar !== undefined) updates.avatar = avatar;

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.update(updates);

    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/forgot-password
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Please provide an email address' });
    }
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM ||
        Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASS)) {
      return res.status(503).json({ message: 'Password reset email is not configured' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.json({ message: 'If an account exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await user.update({ resetPasswordToken, resetPasswordExpire });

    const resetUrl = `${CLIENT_URL.replace(/\/$/, '')}/reset-password/${resetToken}`;
    try {
      const port = Number(process.env.SMTP_PORT || 587);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP port');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        ...(process.env.SMTP_USER ? { auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        } } : {}),
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: 'coWatch — Password Reset',
        text: `You requested a password reset. Use this token: ${resetToken}\nLink: ${resetUrl}\nThis link expires in 10 minutes.`,
      });
    } catch (mailErr) {
      console.error('Password reset email failed:', mailErr.message);
      return res.status(503).json({ message: 'Unable to send password reset email' });
    }

    res.json({ message: 'If an account exists, a reset link has been sent.' });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/reset-password/:token
exports.resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      where: {
        resetPasswordToken,
        resetPasswordExpire: { [require('sequelize').Op.gt]: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpire = null;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/upload-avatar
exports.uploadAvatar = async (req, res, next) => {
  try {
    if (req.fileValidationError) {
      return res.status(400).json({ message: req.fileValidationError });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No avatar file uploaded' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.avatar = avatarUrl;
    await user.save();

    res.json({
      message: 'Avatar uploaded',
      avatar: avatarUrl,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};
