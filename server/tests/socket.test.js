const { Server } = require('socket.io');
const http = require('http');
const jwt = require('jsonwebtoken');
const { io: Client } = require('socket.io-client');
const { User, Room, RoomParticipant } = require('../models');
const { JWT_SECRET } = require('../config/env');
const { generateRoomToken } = require('../utils/tokenGenerator');

let ioServer, httpServer, serverUrl;
let userToken, userId, roomId;
let clients = [];

const TEST_USER = { name: 'Socket User', email: 'socket@example.com', password: 'password123' };

const createSocketClient = (token, opts = {}) => {
  const client = Client(serverUrl, {
    auth: { token },
    transports: ['websocket'],
    ...opts,
  });
  clients.push(client);
  return client;
};

const disconnectAll = () => {
  clients.forEach((c) => { try { c.disconnect(); } catch (e) {} });
  clients = [];
};

beforeAll(async () => {
  // Clean up test data
  await User.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
  await RoomParticipant.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
  await Room.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });

  const user = await User.create({
    name: TEST_USER.name,
    email: TEST_USER.email,
    password: TEST_USER.password,
  });
  userId = user.id;
  userToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

  const room = await Room.create({
    name: 'Socket Test Room',
    token: generateRoomToken(),
    hostId: user.id,
    isActive: true,
  });
  roomId = room.id;

  await RoomParticipant.create({
    roomId,
    userId,
    role: 'host',
  });

  // Start Socket.IO test server
  httpServer = http.createServer();
  ioServer = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 10000,
    pingInterval: 5000,
  });

  const initializeSocket = require('../services/socket.service');
  initializeSocket(ioServer);

  await new Promise((resolve) => httpServer.listen(0, resolve));
  const port = httpServer.address().port;
  serverUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  disconnectAll();
  if (ioServer) {
    try { ioServer.close(); } catch (e) {}
  }
  if (httpServer) {
    try { httpServer.close(); } catch (e) {}
  }
  try {
    await User.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await RoomParticipant.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
    await Room.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
  } catch (e) {}
});

describe('Socket.IO Real-Time Events', () => {
  let socket;

  afterEach(() => {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
  });

  describe('Authentication', () => {
    test('should reject connection without token', (done) => {
      const badSocket = Client(serverUrl, { transports: ['websocket'] });
      badSocket.on('connect_error', (err) => {
        expect(err.message).toContain('Authentication');
        badSocket.close();
        done();
      });
      setTimeout(() => {
        badSocket.close();
        done(new Error('Connection timeout'));
      }, 15000);
    });

    test('should accept connection with valid token', (done) => {
      socket = createSocketClient(userToken);
      socket.on('connect', () => {
        expect(socket.id).toBeDefined();
        done();
      });
      socket.on('connect_error', (err) => {
        done(err);
      });
      setTimeout(() => {
        if (!socket.connected) done(new Error('Connection timeout'));
      }, 15000);
    });
  });

  describe('room:join', () => {
    beforeEach((done) => {
      socket = createSocketClient(userToken);
      socket.on('connect', () => done());
    });

    test('should join room and receive media state', (done) => {
      socket.on('media:state', (data) => {
        expect(data.currentMedia).toBeDefined();
        done();
      });
      socket.emit('room:join', { roomId });
      setTimeout(() => done(new Error('media:state timeout')), 15000);
    });

    test('should reject joining non-existent room', (done) => {
      socket.on('error', (data) => {
        expect(data.message).toContain('Room not found');
        done();
      });
      socket.emit('room:join', { roomId: '00000000-0000-0000-0000-000000000000' });
      setTimeout(() => done(new Error('error timeout')), 15000);
    });
  });

  describe('media events', () => {
    beforeEach((done) => {
      socket = createSocketClient(userToken);
      socket.on('connect', () => {
        socket.emit('room:join', { roomId }, () => done());
      });
    });

    test('media:play should broadcast to room', (done) => {
      const socket2 = createSocketClient(userToken);
      socket2.on('connect', () => {
        socket2.on('media:play', (data) => {
          expect(data.currentTime).toBeDefined();
          expect(data.userId).toBe(userId);
          socket2.disconnect();
          done();
        });
        socket2.emit('room:join', { roomId });
        socket.emit('media:play', { roomId, currentTime: 120 });
      });
      setTimeout(() => done(new Error('media:play timeout')), 15000);
    });

    test('media:pause should broadcast to room', (done) => {
      const socket2 = createSocketClient(userToken);
      socket2.on('connect', () => {
        socket2.on('media:pause', (data) => {
          expect(data.currentTime).toBeDefined();
          socket2.disconnect();
          done();
        });
        socket2.emit('room:join', { roomId });
        socket.emit('media:pause', { roomId, currentTime: 60 });
      });
      setTimeout(() => done(new Error('media:pause timeout')), 15000);
    });

    test('media:seek should broadcast to room', (done) => {
      const socket2 = createSocketClient(userToken);
      socket2.on('connect', () => {
        socket2.on('media:seek', (data) => {
          expect(data.currentTime).toBe(30);
          socket2.disconnect();
          done();
        });
        socket2.emit('room:join', { roomId });
        socket.emit('media:seek', { roomId, currentTime: 30 });
      });
      setTimeout(() => done(new Error('media:seek timeout')), 15000);
    });

    test('media:change should require host/moderator', (done) => {
      User.create({
        name: 'Non Host',
        email: 'nonhost@example.com',
        password: 'password123',
      }).then((nonHost) => {
        const nonHostToken = jwt.sign({ id: nonHost.id }, JWT_SECRET, { expiresIn: '7d' });
        const socket3 = createSocketClient(nonHostToken);
        socket3.on('connect', () => {
          socket3.emit('room:join', { roomId });
          socket3.on('error', (data) => {
            expect(data.message).toContain('Only the host');
            socket3.disconnect();
            done();
          });
          socket3.emit('media:change', {
            roomId,
            media: { title: 'Hacked', url: 'https://evil.com/video.mp4', type: 'video' },
          });
        });
      });
      setTimeout(() => done(new Error('media:change timeout')), 15000);
    });
  });

  describe('chat events', () => {
    beforeEach((done) => {
      socket = createSocketClient(userToken);
      socket.on('connect', () => {
        socket.emit('room:join', { roomId }, () => done());
      });
    });

    test('chat:message should broadcast', (done) => {
      const socket2 = createSocketClient(userToken);
      socket2.on('connect', () => {
        socket2.on('chat:message', (msg) => {
          expect(msg.content).toBe('Hello world');
          socket2.disconnect();
          done();
        });
        socket2.emit('room:join', { roomId });
        socket.emit('chat:message', { roomId, content: 'Hello world', type: 'text' });
      });
      setTimeout(() => done(new Error('chat:message timeout')), 15000);
    });

    test('chat:typing should broadcast', (done) => {
      const socket2 = createSocketClient(userToken);
      socket2.on('connect', () => {
        socket2.on('chat:typing', (data) => {
          expect(data.userId).toBe(userId);
          socket2.disconnect();
          done();
        });
        socket2.emit('room:join', { roomId });
        socket.emit('chat:typing', { roomId });
      });
      setTimeout(() => done(new Error('chat:typing timeout')), 15000);
    });

    test('chat:stop-typing should broadcast', (done) => {
      const socket2 = createSocketClient(userToken);
      socket2.on('connect', () => {
        socket2.on('chat:stop-typing', (data) => {
          expect(data.userId).toBe(userId);
          socket2.disconnect();
          done();
        });
        socket2.emit('room:join', { roomId });
        socket.emit('chat:stop-typing', { roomId });
      });
      setTimeout(() => done(new Error('chat:stop-typing timeout')), 15000);
    });
  });

  describe('reaction events', () => {
    beforeEach((done) => {
      socket = createSocketClient(userToken);
      socket.on('connect', () => {
        socket.emit('room:join', { roomId }, () => done());
      });
    });

    test('reaction:send should broadcast reaction', (done) => {
      const socket2 = createSocketClient(userToken);
      socket2.on('connect', () => {
        socket2.on('reaction:received', (data) => {
          expect(data.emoji).toBe('❤️');
          expect(data.userId).toBe(userId);
          socket2.disconnect();
          done();
        });
        socket2.emit('room:join', { roomId });
        socket.emit('reaction:send', { roomId, emoji: '❤️' });
      });
      setTimeout(() => done(new Error('reaction timeout')), 15000);
    });
  });

  describe('room:leave and disconnect', () => {
    test('should emit room:user-left on disconnect', (done) => {
      const socket2 = createSocketClient(userToken);
      socket2.on('connect', () => {
        socket2.emit('room:join', { roomId });
        socket.on('room:user-left', (data) => {
          expect(data.id).toBe(userId);
          done();
        });
        socket2.disconnect();
      });
      setTimeout(() => done(new Error('disconnect timeout')), 15000);
    });
  });

  describe('call signaling events', () => {
    beforeEach((done) => {
      socket = createSocketClient(userToken);
      socket.on('connect', () => {
        socket.emit('room:join', { roomId }, () => done());
      });
    });

    test('call:signal should relay offer to room participants', (done) => {
      const socket2 = createSocketClient(userToken);
      socket2.on('connect', () => {
        socket2.on('call:signal', (data) => {
          expect(data.from).toBe(userId);
          expect(data.type).toBe('offer');
          socket2.disconnect();
          done();
        });
        socket2.emit('room:join', { roomId });
        socket.emit('call:signal', {
          roomId,
          targetId: 'user2',
          signal: { sdp: 'fake-offer', type: 'offer' },
          type: 'offer',
        });
      });
      setTimeout(() => done(new Error('call:signal timeout')), 15000);
    });

    test('call:user-joined should notify room participants', (done) => {
      const socket2 = createSocketClient(userToken);
      socket2.on('connect', () => {
        socket2.on('call:user-joined', (data) => {
          expect(data.userId).toBe(userId);
          socket2.disconnect();
          done();
        });
        socket2.emit('room:join', { roomId });
        socket.emit('call:join', { roomId });
      });
      setTimeout(() => done(new Error('call:user-joined timeout')), 15000);
    });
  });
});
