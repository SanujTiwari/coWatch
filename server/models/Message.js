const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  roomId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Rooms',
      key: 'id',
    },
    index: true,
  },
  senderId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  replyToId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Messages',
      key: 'id',
    },
    onDelete: 'SET NULL',
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [1, 1000],
    },
  },
  type: {
    type: DataTypes.ENUM('text', 'emoji', 'system', 'reaction'),
    defaultValue: 'text',
  },
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['roomId', 'createdAt'],
      name: 'room_created_index',
    },
  ],
});

module.exports = Message;
