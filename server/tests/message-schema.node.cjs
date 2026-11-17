const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize } = require('sequelize');

const dbPath = require.resolve('../config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: { sequelize: new Sequelize('postgres://localhost/offline', { logging: false }) },
};

test('message reply field is declared before associations are loaded', () => {
  const Message = require('../models/Message');
  const reply = Message.rawAttributes.replyToId;
  assert.ok(reply);
  assert.equal(reply.allowNull, true);
  assert.equal(reply.references.model, 'Messages');
  assert.equal(reply.onDelete, 'SET NULL');
});
