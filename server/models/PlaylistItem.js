const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const PlaylistItem = sequelize.define('PlaylistItem', {
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
  addedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('video', 'youtube', 'reel', 'direct'),
    defaultValue: 'video',
  },
  duration: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  plays: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  timestamps: true,
  indexes: [
    { fields: ['roomId', 'order'] },
  ],
});

module.exports = PlaylistItem;
