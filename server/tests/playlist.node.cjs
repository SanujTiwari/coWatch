const { test } = require('node:test');
const assert = require('node:assert/strict');

const items = [];
const broadcasts = [];
const room = { id: 'room', isActive: true };
const transaction = { LOCK: { UPDATE: 'update' } };
const mock = (path, exports) => {
  const resolved = require.resolve(path);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};
mock('../models/Room', {
  findByPk: async (id, options) => {
    assert.equal(options.transaction, transaction);
    assert.equal(options.lock, 'update');
    return id === room.id ? room : null;
  },
});
mock('../models/RoomParticipant', {});
mock('../models/Message', {});
mock('../models/User', {});
mock('../config/db', { sequelize: { transaction: (callback) => callback(transaction) } });
mock('../services/roomAccess', {});
mock('../models/PlaylistItem', {
  max: async () => items.length ? Math.max(...items.map((item) => item.order)) : null,
  create: async (values) => {
    const item = {
      ...values,
      id: `item-${items.length + 1}`,
      reload: async () => {},
      update: async function (changes) { Object.assign(this, changes); },
      destroy: async function () { items.splice(items.indexOf(this), 1); },
    };
    items.push(item);
    return item;
  },
  findAll: async () => [...items].sort((a, b) => a.order - b.order),
});

const controller = require('../controllers/room.controller');
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});
const request = (body = {}, params = {}) => ({
  body, params: { id: room.id, ...params }, user: { id: 'host' },
  app: { get: () => ({ to: (id) => ({ emit: (event) => broadcasts.push({ id, event }) }) }) },
});
const next = (error) => { throw error; };

test('playlist additions, stale reorder and removal use the locked room and notify members', async () => {
  for (const title of ['First', 'Second']) {
    const res = response();
    await controller.addToPlaylist(request({ title, url: 'https://example.test/video.mp4' }), res, next);
    assert.equal(res.statusCode, 201);
  }
  assert.deepEqual(items.map((item) => item.order), [1, 2]);
  assert.deepEqual(broadcasts[0], { id: room.id, event: 'playlist:changed' });

  const stale = response();
  await controller.reorderPlaylist(request({ itemIds: ['item-1'] }), stale, next);
  assert.equal(stale.statusCode, 409);
  assert.deepEqual(items.map((item) => item.order), [1, 2]);

  const reorder = response();
  await controller.reorderPlaylist(request({ itemIds: ['item-2', 'item-1'] }), reorder, next);
  assert.equal(reorder.statusCode, 200);
  assert.deepEqual(items.map((item) => item.order), [2, 1]);

  const removed = response();
  await controller.removeFromPlaylist(request({}, { itemId: 'item-2' }), removed, next);
  assert.equal(removed.statusCode, 200);
  assert.equal(items.length, 1);
  assert.equal(items[0].order, 1);
  assert.equal(broadcasts.length, 4);
});
