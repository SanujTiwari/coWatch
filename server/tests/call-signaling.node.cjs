const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const jwt = require('jsonwebtoken');

const secret = 'local-signaling-test-secret';
const members = new Set(['host', 'guest', 'third']);
let blocked = false;
let pauseRoomLookup = null;
let pauseMembershipLookup = null;
const mutedUsers = new Set();
const removedUsers = new Set();
const room = {
  id: 'room', hostId: 'host', isActive: true, name: 'Test',
  currentMediaTitle: 'Video', currentMediaUrl: 'https://example.com/video.mp4',
  currentMediaType: 'video', currentMediaTime: 0, isMediaPlaying: false,
  participants: [...members].map((id) => ({ id, name: id })),
};
const otherRoom = { ...room, id: 'other-room', name: 'Other room' };
const users = Object.fromEntries([...members, 'outsider'].map((id) => [id, { id, name: id }]));
const repliedMessage = {
  id: '00000000-0000-4000-8000-000000000001',
  roomId: room.id,
  content: 'Original message',
};
const createdMessages = [];
const modelsPath = require.resolve('../models');
const envPath = require.resolve('../config/env');
const dbPath = require.resolve('../config/db');
require.cache[modelsPath] = {
  id: modelsPath, filename: modelsPath, loaded: true,
  exports: {
    User: { findByPk: async (id) => users[id], update: async () => {} },
    Room: {
      findByPk: async (id, options) => {
        if (pauseRoomLookup && options?.include) await pauseRoomLookup();
        return id === room.id ? room : id === otherRoom.id ? otherRoom : null;
      },
      update: async (changes) => Object.assign(room, changes),
    },
    RoomParticipant: {
      findOne: async ({ where }) => {
        if (pauseMembershipLookup && where.userId === 'guest') await pauseMembershipLookup();
        return [room.id, otherRoom.id].includes(where.roomId) && members.has(where.userId)
          && !(where.isRemoved === false && removedUsers.has(where.userId))
          ? { role: where.userId === 'guest' ? 'moderator' : 'participant', chatMuted: mutedUsers.has(where.userId) }
          : null;
      },
      findAll: async () => [...members].map((userId) => ({ userId })),
    },
    Friend: { findOne: async () => blocked ? { status: 'blocked' } : null },
    Message: {
      findOne: async ({ where }) => where.id === repliedMessage.id && where.roomId === repliedMessage.roomId ? repliedMessage : null,
      create: async (message) => {
        const created = { ...message, id: `message-${createdMessages.length + 1}` };
        createdMessages.push(created);
        return created;
      },
      findByPk: async (id) => {
        const message = createdMessages.find((entry) => entry.id === id);
        return { ...message, replyTo: message.replyToId ? repliedMessage : null };
      },
    },
  },
};
require.cache[envPath] = { id: envPath, filename: envPath, loaded: true, exports: { JWT_SECRET: secret } };
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { sequelize: { transaction: (callback) => callback({ LOCK: { UPDATE: 'update' } }) } },
};
const initializeSocket = require('../services/socket.service');

test('call signaling requires membership and reaches only the selected participant', async () => {
  const httpServer = http.createServer();
  const io = new Server(httpServer);
  const realtime = initializeSocket(io);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const clients = [];
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clientFor = async (id) => {
    const client = connect(url, { forceNew: true, auth: { token: jwt.sign({ id }, secret) } });
    clients.push(client);
    await once(client, 'connect', { signal: AbortSignal.timeout(3000) });
    return client;
  };
  try {
    const host = await clientFor('host');
    const guest = await clientFor('guest');
    const third = await clientFor('third');
    const outsider = await clientFor('outsider');
    for (const client of [host, guest, third, outsider]) {
      await client.timeout(2000).emitWithAck('call:subscribe', {});
    }
    assert.match((await outsider.timeout(2000).emitWithAck('call:invite', { roomId: room.id })).error, /not an active participant/);
    const guestIncoming = once(guest, 'call:incoming', { signal: AbortSignal.timeout(3000) });
    const thirdIncoming = once(third, 'call:incoming', { signal: AbortSignal.timeout(3000) });
    const invitation = await host.timeout(2000).emitWithAck('call:invite', { roomId: room.id });
    assert.equal((await guestIncoming)[0].caller.name, 'host');
    assert.equal((await thirdIncoming)[0].sessionId, invitation.sessionId);
    assert.match((await guest.timeout(2000).emitWithAck('call:join', { roomId: room.id, sessionId: invitation.sessionId })).error, /accepted/);
    assert.equal((await guest.timeout(2000).emitWithAck('call:respond', { roomId: room.id, sessionId: invitation.sessionId, accept: true })).ok, true);
    assert.equal((await third.timeout(2000).emitWithAck('call:respond', { roomId: room.id, sessionId: invitation.sessionId, accept: true })).ok, true);
    const hostMedia = await clientFor('host');
    const guestMedia = await clientFor('guest');
    const thirdMedia = await clientFor('third');
    assert.deepEqual((await hostMedia.timeout(2000).emitWithAck('call:join', { roomId: room.id, sessionId: invitation.sessionId })).participants, []);
    assert.equal((await guestMedia.timeout(2000).emitWithAck('call:join', { roomId: room.id, sessionId: invitation.sessionId })).participants.length, 1);
    assert.equal((await thirdMedia.timeout(2000).emitWithAck('call:join', { roomId: room.id, sessionId: invitation.sessionId })).participants.length, 2);
    assert.match((await outsider.timeout(2000).emitWithAck('call:join', { roomId: room.id })).error, /not an active participant/);
    const roomRejected = once(outsider, 'error', { signal: AbortSignal.timeout(3000) });
    outsider.emit('room:join', { roomId: room.id });
    assert.match((await roomRejected)[0].message, /not a participant/);

    let leaked = false;
    thirdMedia.on('call:signal', () => { leaked = true; });
    const received = once(guestMedia, 'call:signal', { signal: AbortSignal.timeout(10000) });
    hostMedia.emit('call:signal', {
      roomId: room.id, targetId: guestMedia.id, type: 'offer', signal: { type: 'offer', sdp: 'test-offer' },
    });

    await test('invitations support rejection, busy state, cancellation and authorization', async () => {
      const httpServer = http.createServer();
      const io = new Server(httpServer);
      initializeSocket(io);
      await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const clients = [];
      const clientFor = async (id) => {
        const client = connect(`http://127.0.0.1:${httpServer.address().port}`, {
          forceNew: true, auth: { token: jwt.sign({ id }, secret) },
        });
        clients.push(client);
        await once(client, 'connect', { signal: AbortSignal.timeout(3000) });
        await client.timeout(2000).emitWithAck('call:subscribe', {});
        return client;
      };
      try {
        const host = await clientFor('host');
        const guest = await clientFor('guest');
        const third = await clientFor('third');
        const outsider = await clientFor('outsider');
        const secondGuestTab = await clientFor('guest');
        let duplicateNotifications = 0;
        secondGuestTab.on('call:incoming', () => { duplicateNotifications += 1; });
        const guestIncoming = once(guest, 'call:incoming', { signal: AbortSignal.timeout(3000) });
        const thirdIncoming = once(third, 'call:incoming', { signal: AbortSignal.timeout(3000) });
        const invitation = await host.timeout(2000).emitWithAck('call:invite', { roomId: room.id });
        await Promise.all([guestIncoming, thirdIncoming]);
        assert.match((await host.timeout(2000).emitWithAck('call:invite', { roomId: otherRoom.id })).error, /busy/);
        assert.equal(duplicateNotifications, 0);
        assert.match((await outsider.timeout(2000).emitWithAck('call:respond', {
          roomId: room.id, sessionId: invitation.sessionId, accept: true,
        })).error, /no longer available/);
        assert.match((await outsider.timeout(2000).emitWithAck('call:exit', {
          roomId: room.id, sessionId: invitation.sessionId,
        })).error, /not a participant/);
        const rejected = once(host, 'call:invite-update', { signal: AbortSignal.timeout(3000) });
        await guest.timeout(2000).emitWithAck('call:respond', {
          roomId: room.id, sessionId: invitation.sessionId, accept: false,
        });
        assert.equal((await rejected)[0].status, 'rejected');
        const cancelled = once(third, 'call:ended', { signal: AbortSignal.timeout(3000) });
        host.emit('call:cancel-start', { roomId: room.id });
        assert.match((await cancelled)[0].reason, /cancelled/);
        assert.match((await third.timeout(2000).emitWithAck('call:respond', {
          roomId: room.id, sessionId: invitation.sessionId, accept: true,
        })).error, /no longer available/);

        let releaseLookup;
        let lookupStarted;
        const started = new Promise((resolve) => { lookupStarted = resolve; });
        const released = new Promise((resolve) => { releaseLookup = resolve; });
        pauseRoomLookup = async () => { lookupStarted(); await released; };
        let unexpectedIncoming = 0;
        guest.on('call:incoming', () => { unexpectedIncoming += 1; });
        const pending = host.timeout(3000).emitWithAck('call:invite', { roomId: room.id });
        await started;
        host.emit('call:cancel-start', { roomId: room.id });
        await host.timeout(2000).emitWithAck('call:subscribe', {});
        pauseRoomLookup = null;
        releaseLookup();
        assert.match((await pending).error, /could not be started|cancelled/);
        assert.equal(unexpectedIncoming, 0);
        const retriedIncoming = once(guest, 'call:incoming', { signal: AbortSignal.timeout(3000) });
        const retry = await host.timeout(2000).emitWithAck('call:invite', { roomId: room.id });
        assert.ok(retry.sessionId);
        await retriedIncoming;
        host.emit('call:cancel-start', { roomId: room.id });
      } finally {
        pauseRoomLookup = null;
        clients.forEach((client) => client.disconnect());
        await new Promise((resolve) => io.close(resolve));
      }
    });

    await test('ringing ends at the configured timeout', async () => {
      const previous = process.env.CALL_RING_TIMEOUT_MS;
      process.env.CALL_RING_TIMEOUT_MS = '5000';
      const httpServer = http.createServer();
      const io = new Server(httpServer);
      initializeSocket(io);
      await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const clients = [];
      const clientFor = async (id) => {
        const client = connect(`http://127.0.0.1:${httpServer.address().port}`, {
          forceNew: true, auth: { token: jwt.sign({ id }, secret) },
        });

        clients.push(client);
        await once(client, 'connect', { signal: AbortSignal.timeout(3000) });
        await client.timeout(2000).emitWithAck('call:subscribe', {});
        return client;
      };
      try {
        const host = await clientFor('host');
        const guest = await clientFor('guest');
        const incoming = once(guest, 'call:incoming', { signal: AbortSignal.timeout(3000) });
        const ended = once(guest, 'call:ended', { signal: AbortSignal.timeout(8000) });
        const invitation = await host.timeout(2000).emitWithAck('call:invite', { roomId: room.id });
        assert.equal(invitation.recipients.find((entry) => entry.userId === 'third').status, 'unavailable');
        await incoming;
        assert.match((await ended)[0].reason, /timed out/);
        assert.ok(Date.now() >= invitation.expiresAt);
      } finally {
        clients.forEach((client) => client.disconnect());
        await new Promise((resolve) => io.close(resolve));
        if (previous === undefined) delete process.env.CALL_RING_TIMEOUT_MS;
        else process.env.CALL_RING_TIMEOUT_MS = previous;
      }
    });
    await test('a disconnect during call authorization preserves the join timeout', async () => {
      const previous = process.env.CALL_RING_TIMEOUT_MS;
      process.env.CALL_RING_TIMEOUT_MS = '5000';
      const httpServer = http.createServer();
      const io = new Server(httpServer);
      initializeSocket(io);
      await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const clients = [];
      const clientFor = async (id) => {
        const client = connect(`http://127.0.0.1:${httpServer.address().port}`, {
          forceNew: true, auth: { token: jwt.sign({ id }, secret) },
        });
        clients.push(client);
        await once(client, 'connect', { signal: AbortSignal.timeout(3000) });
        return client;
      };
      let releaseLookup;
      try {
        const host = await clientFor('host');
        const guest = await clientFor('guest');
        const hostMedia = await clientFor('host');
        const guestMedia = await clientFor('guest');
        for (const client of [host, guest]) await client.timeout(2000).emitWithAck('call:subscribe', {});
        const incoming = once(guest, 'call:incoming', { signal: AbortSignal.timeout(3000) });
        const invitation = await host.timeout(2000).emitWithAck('call:invite', { roomId: room.id });
        await incoming;
        await guest.timeout(2000).emitWithAck('call:respond', {
          roomId: room.id, sessionId: invitation.sessionId, accept: true,
        });
        await hostMedia.timeout(2000).emitWithAck('call:join', {
          roomId: room.id, sessionId: invitation.sessionId,
        });

        let lookupStarted;
        const started = new Promise((resolve) => { lookupStarted = resolve; });
        const released = new Promise((resolve) => { releaseLookup = resolve; });
        pauseMembershipLookup = async () => { lookupStarted(); await released; };
        const disconnected = once(io.sockets.sockets.get(guestMedia.id), 'disconnect', { signal: AbortSignal.timeout(3000) });
        guestMedia.emit('call:join', { roomId: room.id, sessionId: invitation.sessionId });
        await started;
        guestMedia.disconnect();
        await disconnected;
        const left = once(host, 'call:invite-update', { signal: AbortSignal.timeout(8000) });
        pauseMembershipLookup = null;
        releaseLookup();
        assert.equal((await left)[0].status, 'left');
      } finally {
        pauseMembershipLookup = null;
        if (releaseLookup) releaseLookup();
        clients.forEach((client) => client.disconnect());
        await new Promise((resolve) => io.close(resolve));
        if (previous === undefined) delete process.env.CALL_RING_TIMEOUT_MS;
        else process.env.CALL_RING_TIMEOUT_MS = previous;
      }
    });

    await test('removing an invited member cancels their invitation and denies access', async () => {
      const httpServer = http.createServer();
      const io = new Server(httpServer);
      const realtime = initializeSocket(io);
      await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const clients = [];
      const clientFor = async (id) => {
        const client = connect(`http://127.0.0.1:${httpServer.address().port}`, {
          forceNew: true, auth: { token: jwt.sign({ id }, secret) },
        });
        clients.push(client);
        await once(client, 'connect', { signal: AbortSignal.timeout(3000) });
        await client.timeout(2000).emitWithAck('call:subscribe', {});
        return client;
      };
      try {
        const host = await clientFor('host');
        const guest = await clientFor('guest');
        const incoming = once(guest, 'call:incoming', { signal: AbortSignal.timeout(3000) });
        const invitation = await host.timeout(2000).emitWithAck('call:invite', { roomId: room.id });
        await incoming;
        const ended = once(guest, 'call:ended', { signal: AbortSignal.timeout(3000) });
        removedUsers.add('guest');
        realtime.revoke(room.id, 'guest');
        assert.match((await ended)[0].reason, /removed/);
        assert.match((await guest.timeout(2000).emitWithAck('call:respond', {
          roomId: room.id, sessionId: invitation.sessionId, accept: true,
        })).error, /no longer available/);
        assert.match((await guest.timeout(2000).emitWithAck('call:invite', { roomId: room.id })).error, /not an active participant/);
      } finally {
        removedUsers.delete('guest');
        clients.forEach((client) => client.disconnect());
        await new Promise((resolve) => io.close(resolve));
      }
    });
    const [message] = await received;
    assert.equal(message.from, hostMedia.id);
    assert.equal(message.userId, 'host');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(leaked, false);

    blocked = true;
    const blockedSignal = once(hostMedia, 'call:error', { signal: AbortSignal.timeout(3000) });
    hostMedia.emit('call:signal', {
      roomId: room.id, targetId: guestMedia.id, type: 'offer', signal: { type: 'offer', sdp: 'test-offer' },
    });
    assert.match((await blockedSignal)[0].message, /rejected/);
    blocked = false;

    const rejected = once(outsider, 'call:error', { signal: AbortSignal.timeout(3000) });
    outsider.emit('call:signal', {
      roomId: room.id, targetId: guestMedia.id, type: 'offer', signal: { type: 'offer', sdp: 'test-offer' },
    });
    assert.match((await rejected)[0].message, /rejected/);
    const duplicate = await clientFor('host');
    assert.match((await duplicate.timeout(2000).emitWithAck('call:join', { roomId: room.id, sessionId: invitation.sessionId })).error, /another tab/);
    await duplicate.timeout(2000).emitWithAck('call:subscribe', {});
    assert.match((await duplicate.timeout(2000).emitWithAck('call:invite', { roomId: otherRoom.id })).error, /busy/);

    for (const client of [host, guest]) {
      const state = once(client, 'media:state', { signal: AbortSignal.timeout(3000) });
      client.emit('room:join', { roomId: room.id });
      await state;
    }
    const reply = once(guest, 'chat:message', { signal: AbortSignal.timeout(3000) });
    host.emit('chat:message', { roomId: room.id, content: 'A reply', replyToId: repliedMessage.id });
    assert.equal((await reply)[0].replyTo.id, repliedMessage.id);
    const invalidReply = once(host, 'error', { signal: AbortSignal.timeout(3000) });
    host.emit('chat:message', {
      roomId: room.id, content: 'Bad reply', replyToId: '00000000-0000-4000-8000-000000000002',
    });
    assert.match((await invalidReply)[0].message, /not found in this room/);
    assert.equal(createdMessages.length, 1);
    mutedUsers.add('guest');
    const muted = once(guest, 'error', { signal: AbortSignal.timeout(3000) });
    guest.emit('chat:message', { roomId: room.id, content: 'Not allowed' });
    assert.match((await muted)[0].message, /chat is muted/);
    assert.equal(createdMessages.length, 1);
    mutedUsers.delete('guest');
    const play = once(guest, 'media:play', { signal: AbortSignal.timeout(3000) });
    host.emit('media:play', { roomId: room.id, currentTime: 10 });
    assert.equal((await play)[0].currentTime, 10);
    const deniedPlayback = once(guest, 'error', { signal: AbortSignal.timeout(3000) });
    guest.emit('media:pause', { roomId: room.id, currentTime: 11 });
    assert.match((await deniedPlayback)[0].message, /Only the host/);
    const lateState = once(third, 'media:state', { signal: AbortSignal.timeout(3000) });
    third.emit('room:join', { roomId: room.id });
    assert.ok((await lateState)[0].currentMedia.currentTime >= 10);
    const disconnectedPeer = once(guestMedia, 'call:user-left', { signal: AbortSignal.timeout(3000) });
    hostMedia.disconnect();
    assert.equal((await disconnectedPeer)[0].userId, 'host');
    const reconnectedMedia = await clientFor('host');
    assert.equal((await reconnectedMedia.timeout(2000).emitWithAck('call:join', {
      roomId: room.id, sessionId: invitation.sessionId,
    })).participants.length, 2);
    const hostEnded = once(reconnectedMedia, 'call:ended', { signal: AbortSignal.timeout(3000) });
    const guestEnded = once(guestMedia, 'call:ended', { signal: AbortSignal.timeout(3000) });
    await host.timeout(2000).emitWithAck('call:exit', { roomId: room.id, sessionId: invitation.sessionId });
    assert.equal((await hostEnded)[0].sessionId, invitation.sessionId);
    assert.equal((await guestEnded)[0].sessionId, invitation.sessionId);

    const newIncoming = once(guest, 'call:incoming', { signal: AbortSignal.timeout(3000) });
    const nextInvitation = await host.timeout(2000).emitWithAck('call:invite', { roomId: room.id });
    await newIncoming;
    await guest.timeout(2000).emitWithAck('call:respond', {
      roomId: room.id, sessionId: nextInvitation.sessionId, accept: true,
    });
    await reconnectedMedia.timeout(2000).emitWithAck('call:join', {
      roomId: room.id, sessionId: nextInvitation.sessionId,
    });
    await guestMedia.timeout(2000).emitWithAck('call:join', {
      roomId: room.id, sessionId: nextInvitation.sessionId,
    });
    const closedHost = once(reconnectedMedia, 'call:ended', { signal: AbortSignal.timeout(3000) });
    const closedGuest = once(guestMedia, 'call:ended', { signal: AbortSignal.timeout(3000) });
    realtime.closeRoom(room.id);
    assert.match((await closedHost)[0].reason, /room was closed/);
    assert.match((await closedGuest)[0].reason, /room was closed/);
    assert.match((await guestMedia.timeout(2000).emitWithAck('call:join', {
      roomId: room.id, sessionId: nextInvitation.sessionId,
    })).error, /accepted/);
  } finally {
    clients.forEach((client) => client.disconnect());
    await new Promise((resolve) => io.close(resolve));
  }
});
