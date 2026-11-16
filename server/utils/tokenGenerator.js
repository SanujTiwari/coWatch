const crypto = require('crypto');

/**
 * Generate a secure room token
 * Format: XXXX-XXXX-XXXX (uppercase alphanumeric)
 */
const generateRoomToken = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars (0/O, 1/I)
  let token = '';
  const randomBytes = crypto.randomBytes(12);
  
  for (let i = 0; i < 12; i++) {
    token += chars[randomBytes[i] % chars.length];
    if ((i + 1) % 4 === 0 && i < 11) token += '-';
  }
  
  return token;
};

module.exports = { generateRoomToken };
