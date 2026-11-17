const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const User = require('../models/User');

const auth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided, authorization denied' });
  }
  let decoded;
  try {
    const token = authHeader.split(' ')[1];
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: 'Token is not valid' });
  }
  try {
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Token is not valid' });
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = auth;
