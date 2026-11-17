const request = require('supertest');
const { app } = require('../server');
const { User, Room, RoomParticipant } = require('../models');

let server;
let authToken;
let userId;

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

describe('Room Management API', () => {
  beforeEach(async () => {
    authToken = await signupAndLogin('roomuser@example.com', 'Room User');
    const meRes = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    userId = meRes.body.user.id;
  });

  describe('POST /api/rooms/create', () => {
    test('should create a room successfully', async () => {
      const res = await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Test Room', roomType: 'couple', maxParticipants: 2 });
      expect(res.status).toBe(201);
      expect(res.body.room).toBeDefined();
      expect(res.body.room.name).toBe('Test Room');
      expect(res.body.room.token).toBeDefined();
      expect(res.body.room.hostId).toBe(userId);
    });

    test('should create room with default values', async () => {
      const res = await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.room.maxParticipants).toBe(10);
      expect(res.body.room.isPrivate).toBe(true);
      expect(res.body.room.roomType).toBe('group');
    });

    test('should reject unauthenticated request', async () => {
      const res = await request(server).post('/api/rooms/create').send({ name: 'Test' });
      expect(res.status).toBe(401);
    });

    test('should add host as participant with host role', async () => {
      const res = await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Participant Test' });
      const roomId = res.body.room.id;
      const membership = await RoomParticipant.findOne({
        where: { roomId, userId },
      });
      expect(membership).toBeDefined();
      expect(membership.role).toBe('host');
    });
    let roomToken;

    beforeEach(async () => {
      const res = await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Joinable Room' });
      roomToken = res.body.room.token;
    });

    test('should join a room with valid token', async () => {
      const res = await request(server)
        .post('/api/rooms/join')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: roomToken });
      expect(res.status).toBe(200);
      expect(res.body.room.id).toBeDefined();
    });

    test('should reject invalid token', async () => {
      const res = await request(server)
        .post('/api/rooms/join')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: 'INVALID-TOKEN' });
      expect(res.status).toBe(404);
    });

    test('should reject missing token', async () => {
      const res = await request(server)
        .post('/api/rooms/join')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('should add requesting user as participant', async () => {
      // Create a second user to join as participant
      const otherToken = await signupAndLogin('joiner@example.com', 'Joiner User');
      const res = await request(server)
        .post('/api/rooms/join')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ token: roomToken });
      const roomId = res.body.room.id;
      const membership = await RoomParticipant.findOne({
        where: { roomId },
      });
      expect(membership).toBeDefined();
      // The first membership is host (creator), second is participant (joiner)
      const participantMembership = await RoomParticipant.findOne({
        where: { roomId, role: 'participant' },
      });
      expect(participantMembership).toBeDefined();
    });
  });

  describe('GET /api/rooms/:id', () => {
    let roomId;

    beforeEach(async () => {
      const res = await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Get Room Test' });
      roomId = res.body.room.id;
    });

    test('should get room details', async () => {
      const res = await request(server)
        .get(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.room.id).toBe(roomId);
    });

    test('should reject non-participant access', async () => {
      // Create another user who is not a participant
      const otherToken = await signupAndLogin('otheruser@example.com', 'Other User');
      const res = await request(server)
        .get(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
    });

    test('should return 404 for non-existent room', async () => {
      const res = await request(server)
        .get('/api/rooms/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/rooms/my/rooms', () => {
    test('should return rooms for the authenticated user', async () => {
      await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'My Room 1' });
      await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'My Room 2' });

      const res = await request(server)
        .get('/api/rooms/my/rooms')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.rooms.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PUT /api/rooms/:id/media', () => {
    let roomId;

    beforeEach(async () => {
      const res = await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Media Room' });
      roomId = res.body.room.id;
    });

    test('should update media for host', async () => {
      const res = await request(server)
        .put(`/api/rooms/${roomId}/media`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Video',
          url: 'https://example.com/video.mp4',
          type: 'video',
        });
      expect(res.status).toBe(200);
      expect(res.body.room.currentMedia.title).toBe('Test Video');
    });

    test('should reject non-participant', async () => {
      const otherToken = await signupAndLogin('nonparticipant@example.com', 'Non Participant');
      const res = await request(server)
        .put(`/api/rooms/${roomId}/media`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Test', url: 'https://example.com/video.mp4' });
      expect(res.status).toBe(403);
    });

    test('should reject non-host changing media', async () => {
      // Create a second user and join the room
      const otherToken = await signupAndLogin('seconduser@example.com', 'Second User');
      await request(server)
        .post('/api/rooms/join')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ token: (await request(server)
          .post('/api/rooms/create')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ name: 'Join Room' })).body.room.token });

      // Actually, the second user joined their own room. Let me redo this properly.
      // Re-create scenario: user1 creates room, user2 joins, user2 tries to change media
      const res = await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Media Room 2' });
      const newRoomId = res.body.room.id;
      await request(server)
        .post('/api/rooms/join')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ token: res.body.room.token });

      const mediaRes = await request(server)
        .put(`/api/rooms/${newRoomId}/media`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ title: 'Hacked Video', url: 'https://example.com/hacked.mp4' });
      expect(mediaRes.status).toBe(403);
    });
  });

  describe('DELETE /api/rooms/:id', () => {
    test('should allow host to delete room', async () => {
      const res = await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Delete Room' });
      const roomId = res.body.room.id;

      const delRes = await request(server)
        .delete(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(delRes.status).toBe(200);
    });

    test('should reject non-host deleting room', async () => {
      const otherToken = await signupAndLogin('thirduser@example.com', 'Third User');
      const res = await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Delete Room 2' });
      const roomId = res.body.room.id;

      const delRes = await request(server)
        .delete(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(delRes.status).toBe(403);
    });
  });

  describe('POST /api/rooms/:id/playlist', () => {
    let roomId;

    beforeEach(async () => {
      const res = await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Playlist Room' });
      roomId = res.body.room.id;
    });

    test('should add item to playlist', async () => {
      const res = await request(server)
        .post(`/api/rooms/${roomId}/playlist`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Playlist Item', url: 'https://example.com/video.mp4', type: 'video' });
      expect(res.status).toBe(201);
      expect(res.body.item).toBeDefined();
      expect(res.body.item.title).toBe('Playlist Item');
    });

    test('should reject missing title or url', async () => {
      const res = await request(server)
        .post(`/api/rooms/${roomId}/playlist`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'No URL' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/rooms/:id/messages', () => {
    let roomId;

    beforeEach(async () => {
      const res = await request(server)
        .post('/api/rooms/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Messages Room' });
      roomId = res.body.room.id;
    });

    test('should return messages for room', async () => {
      const res = await request(server)
        .get(`/api/rooms/${roomId}/messages`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.messages)).toBe(true);
    });
  });
});
