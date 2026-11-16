const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');
const Room = require('./Room');

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

// Associations
Message.belongsTo(Room, { foreignKey: 'roomId' });
Message.belongsTo(User, { as: 'sender', foreignKey: 'senderId' });
Room.hasMany(Message, { foreignKey: 'roomId', onDelete: 'CASCADE' });
User.hasMany(Message, { as: 'sentMessages', foreignKey: 'senderId' });

module.exports = Message;
