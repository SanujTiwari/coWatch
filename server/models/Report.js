const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Report = sequelize.define('Report', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  reporterId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  reportedUserId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  roomId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Rooms',
      key: 'id',
    },
  },
  reason: {
    type: DataTypes.ENUM('spam', 'harassment', 'inappropriate-content', 'other'),
    allowNull: false,
    defaultValue: 'other',
  },
  description: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
  status: {
    type: DataTypes.ENUM('pending', 'reviewed', 'resolved', 'dismissed'),
    defaultValue: 'pending',
  },
}, {
  timestamps: true,
  indexes: [
    { fields: ['reportedUserId'] },
    { fields: ['status'] },
  ],
});

module.exports = Report;
