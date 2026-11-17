const { body, param, query, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array().map((e) => e.msg).join(', ') });
  }
  next();
};

// Sanitize string input to prevent XSS
const sanitizeInput = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>&'"]/g, (char) => {
      const entities = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' };
      return entities[char] || char;
    });
};

const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeInput(req.body[key]);
      }
    }
  }
  next();
};

// Common validation rules
const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6, max: 128 }).withMessage('Password must be 6-128 characters'),
  sanitizeBody,
  handleValidationErrors,
];

const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
  sanitizeBody,
  handleValidationErrors,
];

const roomCreateValidation = [
  body('name').optional().trim().isLength({ max: 60 }).withMessage('Room name too long'),
  body('maxParticipants').optional().isInt({ min: 2, max: 50 }).withMessage('Invalid participant count'),
  sanitizeBody,
  handleValidationErrors,
];

const roomMediaValidation = [
  param('id').isUUID().withMessage('Invalid room ID'),
  body('title').optional().trim().isLength({ max: 200 }).withMessage('Title too long'),
  body('url').optional().trim().isURL().withMessage('Valid URL is required'),
  sanitizeBody,
  handleValidationErrors,
];

const friendRequestValidation = [
  body('friendId').isUUID().withMessage('Invalid user ID'),
  sanitizeBody,
  handleValidationErrors,
];

const reportValidation = [
  body('reportedUserId').isUUID().withMessage('Invalid user ID'),
  body('reason').optional().isIn(['spam', 'harassment', 'inappropriate-content', 'other']),
  body('description').optional().trim().isLength({ max: 1000 }),
  sanitizeBody,
  handleValidationErrors,
];

module.exports = {
  handleValidationErrors,
  registerValidation,
  loginValidation,
  roomCreateValidation,
  roomMediaValidation,
  friendRequestValidation,
  reportValidation,
};
