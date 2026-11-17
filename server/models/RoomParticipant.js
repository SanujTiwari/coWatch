const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const RoomParticipant = sequelize.define('RoomParticipant', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  role: {
    type: DataTypes.ENUM('host', 'moderator', 'participant'),
    defaultValue: 'participant',
    allowNull: false,
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  isRemoved: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  chatMuted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  timestamps: false,
  indexes: [
    { fields: ['roomId'] },
    { fields: ['userId'] },
    { unique: true, fields: ['roomId', 'userId'] },
  ],
});

module.exports = RoomParticipant;
