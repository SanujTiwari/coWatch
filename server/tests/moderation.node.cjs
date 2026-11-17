const { test } = require('node:test');
const assert = require('node:assert/strict');

const ids = {
  host: '00000000-0000-4000-8000-000000000001',
  moderator: '00000000-0000-4000-8000-000000000002',
  participant: '00000000-0000-4000-8000-000000000003',
};
const room = { id: 'room', hostId: ids.host, isActive: true, participants: [], async save() {} };
const memberships = Object.fromEntries(Object.entries(ids).map(([role, userId]) => [userId, {
  roomId: room.id, userId, role: role === 'moderator' ? 'moderator' : role === 'host' ? 'host' : 'participant',
  isRemoved: false, chatMuted: false,
  async update(changes) { Object.assign(this, changes); },
}]));
const Room = { findByPk: async () => room, findOne: async () => room };
const RoomParticipant = {
  findOne: async ({ where }) => {
    const membership = memberships[where.userId];
    return membership && (!Object.hasOwn(where, 'isRemoved') || membership.isRemoved === where.isRemoved) ? membership : null;
  },
  findOrCreate: async ({ where }) => [memberships[where.userId], false],
};
const mock = (path, exports) => {
  const resolved = require.resolve(path);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};
mock('../config/db', { sequelize: { transaction: (callback) => callback({ LOCK: { UPDATE: 'update' } }) } });
mock('../models', { Room, RoomParticipant });
mock('../models/Room', Room);
mock('../models/RoomParticipant', RoomParticipant);
mock('../models/Message', {});
mock('../models/User', {});
mock('../models/PlaylistItem', {});
mock('../services/roomAccess', { isBlockedFromRoom: async () => false });

const moderation = require('../controllers/moderation.controller');
const { joinRoom, deleteRoom } = require('../controllers/room.controller');
const { requireRoomMembership } = require('../middleware/roomAuth');
const events = [];
const revoked = [];
const closed = [];
const leftRooms = [];
let disconnected = false;
const targetSocket = {
  user: { id: ids.participant }, roomId: room.id, connected: true,
  disconnect() { disconnected = true; },
};
const io = {
  sockets: { sockets: new Map([['target', targetSocket]]) },
  to: (roomId) => ({ emit: (event, payload) => events.push({ roomId, event, payload }) }),
  in: (roomId) => ({ socketsLeave: (leftRoom) => leftRooms.push([roomId, leftRoom]) }),
};
const realtime = { revoke: (...args) => revoked.push(args), closeRoom: (roomId) => closed.push(roomId) };
const req = (actor, target, action) => ({
  params: { id: room.id, userId: target },
  body: { action }, user: { id: actor, name: 'Moderator' },
  app: { get: (name) => name === 'io' ? io : realtime },
});
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const next = (error) => { if (error) throw error; };

test('moderation authorization, removal and explicit reinstatement', async () => {
  const forbidden = response();
  await moderation.update(req(ids.participant, ids.moderator, 'remove'), forbidden, next);
  assert.equal(forbidden.statusCode, 403);
  const protectHost = response();
  await moderation.update(req(ids.moderator, ids.host, 'remove'), protectHost, next);
  assert.equal(protectHost.statusCode, 403);
  memberships[ids.participant].role = 'moderator';
  const protectModerator = response();
  await moderation.update(req(ids.moderator, ids.participant, 'remove'), protectModerator, next);
  assert.equal(protectModerator.statusCode, 403);
  memberships[ids.participant].role = 'participant';

  const removed = response();
  await moderation.update(req(ids.moderator, ids.participant, 'remove'), removed, next);
  assert.equal(removed.statusCode, 200);
  assert.equal(memberships[ids.participant].isRemoved, true);
  assert.equal(disconnected, true);
  assert.deepEqual(revoked, [[room.id, ids.participant]]);
  assert.ok(events.some((event) => event.event === 'room:removed'));

  const access = response();
  await requireRoomMembership(req(ids.participant, ids.participant, ''), access, next);
  assert.equal(access.statusCode, 403);
  const rejoin = response();
  await joinRoom({ body: { token: 'ROOM' }, user: { id: ids.participant } }, rejoin, next);
  assert.equal(rejoin.statusCode, 403);

  const reinstated = response();
  await moderation.update(req(ids.moderator, ids.participant, 'reinstate'), reinstated, next);
  assert.equal(reinstated.statusCode, 200);
  const joined = response();
  await joinRoom({ body: { token: 'ROOM' }, user: { id: ids.participant } }, joined, next);
  assert.equal(joined.statusCode, 200);
});

test('chat mute is persisted and microphone requests do not change it', async () => {
  const muted = response();
  await moderation.update(req(ids.host, ids.participant, 'mute-chat'), muted, next);
  assert.equal(muted.statusCode, 200);
  assert.equal(memberships[ids.participant].chatMuted, true);

  const requested = response();
  await moderation.update(req(ids.host, ids.participant, 'request-mic-mute'), requested, next);
  assert.equal(requested.statusCode, 200);
  assert.equal(memberships[ids.participant].chatMuted, true);
  assert.ok(events.some((event) => event.event === 'room:mic-mute-request'));

  targetSocket.connected = false;
  const unavailable = response();
  await moderation.update(req(ids.host, ids.participant, 'request-mic-mute'), unavailable, next);
  assert.equal(unavailable.statusCode, 409);
});

test('only the host can close the room and terminate its active calls', async () => {
  const forbidden = response();
  await deleteRoom(req(ids.moderator, ids.participant, ''), forbidden, next);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(room.isActive, true);
  assert.deepEqual(closed, []);
  const deleted = response();
  await deleteRoom(req(ids.host, ids.participant, ''), deleted, next);
  assert.equal(deleted.statusCode, 200);
  assert.equal(room.isActive, false);
  assert.deepEqual(closed, [room.id]);
  assert.ok(events.some((event) => event.event === 'room:closed' && event.payload.roomId === room.id));
  assert.deepEqual(leftRooms, [[room.id, room.id]]);
});
