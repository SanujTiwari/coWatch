const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Friend = sequelize.define('Friend', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'blocked'),
    defaultValue: 'pending',
    allowNull: false,
  },
}, {
  timestamps: true,
  indexes: [
    { fields: ['userId', 'friendId'], unique: true },
    { fields: ['friendId'] },
    { fields: ['status'] },
  ],
});

module.exports = Friend;
