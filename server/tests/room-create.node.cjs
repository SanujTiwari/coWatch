const { test } = require('node:test');
const assert = require('node:assert/strict');

const committedRooms = [];
const committedParticipants = [];
let participantError;
const mock = (path, exports) => {
  const resolved = require.resolve(path);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};
mock('../config/db', {
  sequelize: {
    transaction: async (callback) => {
      const transaction = { rooms: [], participants: [] };
      const result = await callback(transaction);
      committedRooms.push(...transaction.rooms);
      committedParticipants.push(...transaction.participants);
      return result;
    },
  },
});
mock('../models/Room', {
  create: async (values, { transaction }) => {
    const room = {
      ...values,
      id: 'room-1',
      reload: async (options) => assert.equal(options.transaction, transaction),
    };
    transaction.rooms.push(room);
    return room;
  },
});
mock('../models/RoomParticipant', {
  create: async (values, { transaction }) => {
    if (participantError) throw participantError;
    transaction.participants.push(values);
  },
});
mock('../models/Message', {});
mock('../models/User', {});
mock('../models/PlaylistItem', {});
mock('../services/roomAccess', {});

const { createRoom } = require('../controllers/room.controller');
const request = { body: { name: 'Movie' }, user: { id: 'host', name: 'Host' } };
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('room and host membership commit together', async () => {
  const res = response();
  await createRoom(request, res, (error) => { throw error; });
  assert.equal(res.statusCode, 201);
  assert.equal(committedRooms.length, 1);
  assert.equal(committedParticipants.length, 1);
  assert.equal(committedParticipants[0].roomId, res.body.room.id);
});

test('a membership failure does not commit an orphaned room', async () => {
  const before = committedRooms.length;
  participantError = new Error('Membership insert failed');
  let actualError;
  await createRoom(request, response(), (error) => { actualError = error; });
  assert.equal(actualError, participantError);
  assert.equal(committedRooms.length, before);
  assert.equal(committedParticipants.length, before);
  participantError = null;
});
