const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be configured.');
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be configured.');

module.exports = {
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
};
