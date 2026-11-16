const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

module.exports = {
  PORT: process.env.PORT || 5000,
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/cowatch',
  JWT_SECRET: process.env.JWT_SECRET || 'default_secret',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
};
