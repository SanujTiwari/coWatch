const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/db');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      len: [2, 50],
    },
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    lowercase: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 255],
    },
  },
  avatar: {
    type: DataTypes.TEXT,
    defaultValue: '',
  },
  mood: {
    type: DataTypes.ENUM('happy', 'relaxed', 'romantic', 'adventurous', 'nostalgic', 'energetic', ''),
    defaultValue: '',
  },
  partnerId: {
    type: DataTypes.UUID,
    references: {
      model: 'Users',
      key: 'id',
    },
    allowNull: true,
  },
  bio: {
    type: DataTypes.STRING(200),
    defaultValue: '',
  },
  online: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  lastSeen: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  resetPasswordToken: {
    type: DataTypes.STRING,
    defaultValue: null,
  },
  resetPasswordExpire: {
    type: DataTypes.DATE,
    defaultValue: null,
  },
}, {
  timestamps: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
  },
});

User.prototype.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = User;
