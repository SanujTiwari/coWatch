const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');

const Room = sequelize.define('Room', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(60),
    allowNull: false,
    validate: {
      len: [1, 60],
    },
  },
  token: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    index: true,
  },
  hostId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  maxParticipants: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    validate: {
      min: 2,
      max: 50,
    },
  },
  currentMediaTitle: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
  currentMediaUrl: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
  currentMediaType: {
    type: DataTypes.ENUM('video', 'youtube', 'reel', ''),
    defaultValue: '',
  },
  currentMediaTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
  },
  isMediaPlaying: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  theme: {
    type: DataTypes.ENUM('default', 'cinema', 'cozy', 'romantic', 'retro', 'neon'),
    defaultValue: 'default',
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  isPrivate: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  timestamps: true,
});

// Association with User
Room.belongsTo(User, { as: 'host', foreignKey: 'hostId' });
User.hasMany(Room, { as: 'hostedRooms', foreignKey: 'hostId' });

module.exports = Room;
