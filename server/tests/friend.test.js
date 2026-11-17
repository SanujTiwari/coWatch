const request = require('supertest');
const { app } = require('../server');
const { User, Friend, Report } = require('../models');

let server;

beforeAll((done) => {
  server = app.listen(0, done);
});

afterAll((done) => {
  server.close(done);
});

const signupAndLogin = async (email, name = 'Test User') => {
  await request(server).post('/api/auth/register').send({ name, email, password: 'password123' });
  const res = await request(server).post('/api/auth/login').send({ email, password: 'password123' });
  return res.body.token;
};

const getUserId = async (server, token) => {
  const res = await request(server)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`);
  return res.body.user.id;
};

describe('Friends API', () => {
  let user1Token, user1Id, user2Token, user2Id;

  beforeEach(async () => {
    user1Token = await signupAndLogin('friend1@example.com', 'Friend One');
    user2Token = await signupAndLogin('friend2@example.com', 'Friend Two');
    user1Id = await getUserId(server, user1Token);
    user2Id = await getUserId(server, user2Token);
  });

  describe('GET /api/friends/search', () => {
    test('should search users by name', async () => {
      const res = await request(server)
        .get('/api/friends/search?q=Friend')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    });

    test('should search users by email', async () => {
      const res = await request(server)
        .get('/api/friends/search?q=friend2@example.com')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.users.some((u) => u.email === 'friend2@example.com')).toBe(true);
    });

    test('should not include self in search results', async () => {
      const res = await request(server)
        .get('/api/friends/search?q=Friend One')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.body.users.some((u) => u.id === user1Id)).toBe(false);
    });

    test('should return empty array for no query', async () => {
      const res = await request(server)
        .get('/api/friends/search')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.users).toEqual([]);
    });
  });

  describe('POST /api/friends/request', () => {
    test('should send friend request', async () => {
      const res = await request(server)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ friendId: user2Id });
      expect(res.status).toBe(201);
      expect(res.body.request).toBeDefined();
      expect(res.body.request.status).toBe('pending');
    });

    test('should reject sending request to self', async () => {
      const res = await request(server)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ friendId: user1Id });
      expect(res.status).toBe(400);
    });

    test('should reject non-existent user', async () => {
      const res = await request(server)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ friendId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
    });

    test('should reject duplicate request', async () => {
      await request(server)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ friendId: user2Id });
      const res = await request(server)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ friendId: user2Id });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/friends/request/:id/accept', () => {
    test('should accept pending friend request', async () => {
      await request(server)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ friendId: user2Id });

      const res = await request(server)
        .post(`/api/friends/request/${user1Id}/accept`)
        .set('Authorization', `Bearer ${user2Token}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('accepted');
    });

    test('should reject non-existent request', async () => {
      const res = await request(server)
        .post(`/api/friends/request/${user1Id}/accept`)
        .set('Authorization', `Bearer ${user2Token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/friends/request/:id/reject', () => {
    test('should reject pending friend request', async () => {
      await request(server)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ friendId: user2Id });

      const res = await request(server)
        .post(`/api/friends/request/${user1Id}/reject`)
        .set('Authorization', `Bearer ${user2Token}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('rejected');
    });
  });

  describe('POST /api/friends/request/:id/cancel', () => {
    test('should cancel sent friend request', async () => {
      await request(server)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ friendId: user2Id });

      const res = await request(server)
        .post(`/api/friends/request/${user2Id}/cancel`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('cancelled');
    });
  });

  describe('GET /api/friends', () => {
    test('should return accepted friends', async () => {
      // Send and accept request
      await request(server)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ friendId: user2Id });
      await request(server)
        .post(`/api/friends/request/${user1Id}/accept`)
        .set('Authorization', `Bearer ${user2Token}`);

      const res = await request(server)
        .get('/api/friends')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.friends.length).toBeGreaterThanOrEqual(1);
      expect(res.body.friends.some((f) => f.id === user2Id)).toBe(true);
    });

    test('should return empty array when no friends', async () => {
      const res = await request(server)
        .get('/api/friends')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.friends).toEqual([]);
    });
  });

  describe('GET /api/friends/requests', () => {
    test('should return pending received and sent requests', async () => {
      await request(server)
        .post('/api/friends/request')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ friendId: user2Id });

      const res = await request(server)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${user2Token}`);
      expect(res.status).toBe(200);
      expect(res.body.received.length).toBeGreaterThanOrEqual(1);
      expect(res.body.received.some((u) => u.id === user1Id)).toBe(true);

      const res2 = await request(server)
        .get('/api/friends/requests')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res2.body.sent.length).toBeGreaterThanOrEqual(1);
      expect(res2.body.sent.some((u) => u.id === user2Id)).toBe(true);
    });
  });

  describe('POST /api/friends/:id/block', () => {
    test('should block a user', async () => {
      const res = await request(server)
        .post(`/api/friends/${user2Id}/block`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('blocked');
    });

    test('should reject blocking self', async () => {
      const res = await request(server)
        .post(`/api/friends/${user1Id}/block`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/friends/:id/unblock', () => {
    test('should unblock a user', async () => {
      await request(server)
        .post(`/api/friends/${user2Id}/block`)
        .set('Authorization', `Bearer ${user1Token}`);

      const res = await request(server)
        .post(`/api/friends/${user2Id}/unblock`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('unblocked');
    });

    test('should return 404 for non-blocked user', async () => {
      const res = await request(server)
        .post(`/api/friends/${user2Id}/unblock`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/friends/report', () => {
    test('should submit a report', async () => {
      const res = await request(server)
        .post('/api/friends/report')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          reportedUserId: user2Id,
          reason: 'harassment',
          description: 'User was rude',
        });
      expect(res.status).toBe(201);
      expect(res.body.report).toBeDefined();
      expect(res.body.report.reason).toBe('harassment');
    });

    test('should reject reporting self', async () => {
      const res = await request(server)
        .post('/api/friends/report')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ reportedUserId: user1Id });
      expect(res.status).toBe(400);
    });

    test('should reject non-existent user', async () => {
      const res = await request(server)
        .post('/api/friends/report')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ reportedUserId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
    });

    test('should require reportedUserId', async () => {
      const res = await request(server)
        .post('/api/friends/report')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ reason: 'spam' });
      expect(res.status).toBe(400);
    });
  });
});
