const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const express = require('express');
const request = require('supertest');
const { upload, validateAvatar } = require('../middleware/upload');

test('avatar upload rejects disguised content and accepts a PNG signature', async () => {
  const app = express();
  app.post('/avatar', upload.single('avatar'), validateAvatar, async (req, res, next) => {
    try {
      await fs.unlink(req.file.path);
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });
  const invalid = await request(app).post('/avatar').attach('avatar', Buffer.from('not an image'), 'avatar.png');
  assert.equal(invalid.status, 400);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const valid = await request(app).post('/avatar').attach('avatar', png, 'avatar.png');
  assert.equal(valid.status, 204);
});
