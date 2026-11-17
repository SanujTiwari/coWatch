const request = require('supertest');
const { app } = require('../server');
const { User } = require('../models');
const fs = require('fs');
const path = require('path');

let server;
let authToken;

beforeAll((done) => {
  server = app.listen(0, done);
});

afterAll((done) => {
  server.close(done);
});

describe('File Upload API', () => {
  beforeEach(async () => {
    await request(server).post('/api/auth/register').send({
      name: 'Upload User',
      email: 'upload@example.com',
      password: 'password123',
    });
    const res = await request(server).post('/api/auth/login').send({
      email: 'upload@example.com',
      password: 'password123',
    });
    authToken = res.body.token;
  });

  test('should reject upload without file', async () => {
    const res = await request(server)
      .post('/api/auth/upload-avatar')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('No avatar file');
  });

  test('should reject non-image file', async () => {
    const res = await request(server)
      .post('/api/auth/upload-avatar')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('avatar', Buffer.from('not an image'), 'test.txt');
    expect(res.status).toBe(400);
  });

  test('should accept valid image file', async () => {
    // Create a minimal valid PNG (1x1 pixel)
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    const res = await request(server)
      .post('/api/auth/upload-avatar')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('avatar', pngBuffer, 'avatar.png');
    expect(res.status).toBe(200);
    expect(res.body.avatar).toBeDefined();
    expect(res.body.avatar).toContain('/uploads/avatars/');
  });

  test('should reject unauthenticated upload', async () => {
    const res = await request(server).post('/api/auth/upload-avatar');
    expect(res.status).toBe(401);
  });

  test('should update user avatar in database', async () => {
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    await request(server)
      .post('/api/auth/upload-avatar')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('avatar', pngBuffer, 'avatar.png');

    const meRes = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(meRes.body.user.avatar).toContain('/uploads/avatars/');
  });
});
