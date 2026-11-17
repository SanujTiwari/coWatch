const request = require('supertest');
const { app } = require('../server');
const { User } = require('../models');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

let server;

beforeAll((done) => {
  server = app.listen(0, done);
});

afterAll((done) => {
  server.close(done);
});

describe('Authentication API', () => {
  const userData = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
  };

  describe('POST /api/auth/register', () => {
    test('should register a new user successfully', async () => {
      const res = await request(server).post('/api/auth/register').send(userData);
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(userData.email);
      expect(res.body.user.name).toBe(userData.name);
      expect(res.body.user.password).toBeUndefined();
    });

    test('should hash the password', async () => {
      await request(server).post('/api/auth/register').send(userData);
      const user = await User.findOne({ where: { email: userData.email } });
      expect(user.password).not.toBe(userData.password);
      expect(user.password).toMatch(/^\$2[ab]\$/);
    });

    test('should reject duplicate email', async () => {
      await request(server).post('/api/auth/register').send(userData);
      const res = await request(server).post('/api/auth/register').send(userData);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });

    test('should reject missing fields', async () => {
      const res = await request(server).post('/api/auth/register').send({ name: 'Test' });
      expect(res.status).toBe(400);
    });

    test('should reject invalid email', async () => {
      const res = await request(server)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'not-an-email', password: 'password123' });
      expect(res.status).toBe(400);
    });

    test('should reject short password', async () => {
      const res = await request(server)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'test2@example.com', password: 'short' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(server).post('/api/auth/register').send(userData);
    });

    test('should login with valid credentials', async () => {
      const res = await request(server).post('/api/auth/login').send({
        email: userData.email,
        password: userData.password,
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(userData.email);
    });

    test('should reject invalid email', async () => {
      const res = await request(server).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: userData.password,
      });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    test('should reject invalid password', async () => {
      const res = await request(server).post('/api/auth/login').send({
        email: userData.email,
        password: 'wrongpassword',
      });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid credentials');
    });

    test('should reject missing fields', async () => {
      const res = await request(server).post('/api/auth/login').send({ email: userData.email });
      expect(res.status).toBe(400);
    });
  });

  describe('JWT Authentication', () => {
    let token;

    beforeEach(async () => {
      await request(server).post('/api/auth/register').send(userData);
      const res = await request(server).post('/api/auth/login').send({
        email: userData.email,
        password: userData.password,
      });
      token = res.body.token;
    });

    test('should verify JWT token on /api/auth/me', async () => {
      const res = await request(server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(userData.email);
    });

    test('should reject request without token', async () => {
      const res = await request(server).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    test('should reject invalid token', async () => {
      const res = await request(server)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.status).toBe(401);
    });

    test('should decode JWT and extract user id', async () => {
      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.id).toBeDefined();
    });
  });

  describe('PUT /api/auth/profile', () => {
    let token;

    beforeEach(async () => {
      await request(server).post('/api/auth/register').send(userData);
      const res = await request(server).post('/api/auth/login').send({
        email: userData.email,
        password: userData.password,
      });
      token = res.body.token;
    });

    test('should update user profile', async () => {
      const res = await request(server)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated Name', bio: 'New bio', mood: 'romantic' });
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Updated Name');
      expect(res.body.user.bio).toBe('New bio');
      expect(res.body.user.mood).toBe('romantic');
    });

    test('should reject unauthenticated request', async () => {
      const res = await request(server).put('/api/auth/profile').send({ name: 'Test' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    test('should generate reset token for existing user', async () => {
      await request(server).post('/api/auth/register').send(userData);
      const res = await request(server).post('/api/auth/forgot-password').send({
        email: userData.email,
      });
      expect(res.status).toBe(200);
      expect(res.body.message).toBeDefined();
      // In non-production, resetToken is returned
      if (process.env.NODE_ENV !== 'production') {
        expect(res.body.resetToken).toBeDefined();
      }
    });

    test('should handle non-existent email gracefully', async () => {
      const res = await request(server).post('/api/auth/forgot-password').send({
        email: 'nonexistent@example.com',
      });
      expect(res.status).toBe(400);
    });

    test('should reject missing email', async () => {
      const res = await request(server).post('/api/auth/forgot-password').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/reset-password/:token', () => {
    test('should reset password with valid token', async () => {
      await request(server).post('/api/auth/register').send(userData);
      const forgotRes = await request(server).post('/api/auth/forgot-password').send({
        email: userData.email,
      });
      const resetToken = forgotRes.body.resetToken;

      const res = await request(server)
        .post(`/api/auth/reset-password/${resetToken}`)
        .send({ password: 'newpassword123' });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('successful');

      // Verify login works with new password
      const loginRes = await request(server).post('/api/auth/login').send({
        email: userData.email,
        password: 'newpassword123',
      });
      expect(loginRes.status).toBe(200);
    });

    test('should reject expired token', async () => {
      const res = await request(server)
        .post('/api/auth/reset-password/expiredtoken123')
        .send({ password: 'newpassword123' });
      expect(res.status).toBe(400);
    });

    test('should reject short password', async () => {
      await request(server).post('/api/auth/register').send(userData);
      const forgotRes = await request(server).post('/api/auth/forgot-password').send({
        email: userData.email,
      });
      const resetToken = forgotRes.body.resetToken;

      const res = await request(server)
        .post(`/api/auth/reset-password/${resetToken}`)
        .send({ password: 'short' });
      expect(res.status).toBe(400);
    });
  });
});
