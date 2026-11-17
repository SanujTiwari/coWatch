const { test } = require('node:test');
const assert = require('node:assert/strict');

const userPath = require.resolve('../models/User');
const envPath = require.resolve('../config/env');
const mailPath = require.resolve('nodemailer');
let sent;
let tokenHash;
const user = { update: async (values) => { tokenHash = values.resetPasswordToken; } };
require.cache[userPath] = {
  id: userPath, filename: userPath, loaded: true,
  exports: { findOne: async ({ where }) => where.email === 'user@example.test' ? user : null },
};
require.cache[envPath] = {
  id: envPath, filename: envPath, loaded: true,
  exports: { JWT_SECRET: 'test-secret', JWT_EXPIRE: '1h', CLIENT_URL: 'https://client.example.test' },
};
require.cache[mailPath] = {
  id: mailPath, filename: mailPath, loaded: true,
  exports: { createTransport: () => ({ sendMail: async (message) => { sent = message; } }) },
};
const { forgotPassword } = require('../controllers/auth.controller');

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return this; },
});

test('password reset emails the frontend link without exposing a token in the response', async () => {
  const saved = {};
  const settings = { SMTP_HOST: 'mail.example.test', SMTP_FROM: 'sender@example.test', SMTP_USER: '', SMTP_PASS: '', SMTP_PORT: '587' };
  for (const [key, value] of Object.entries(settings)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    const res = response();
    await forgotPassword({ body: { email: 'user@example.test' } }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 200);
    assert.match(sent.text, /https:\/\/client\.example\.test\/reset-password\/[a-f0-9]{64}/);
    assert.match(tokenHash, /^[a-f0-9]{64}$/);
    assert.equal(res.body.resetToken, undefined);
    const unknown = response();
    await forgotPassword({ body: { email: 'missing@example.test' } }, unknown, (error) => { throw error; });
    assert.deepEqual(unknown.body, res.body);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
