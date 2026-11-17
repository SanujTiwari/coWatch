const User = require('./User');
const Room = require('./Room');
const RoomParticipant = require('./RoomParticipant');
const Message = require('./Message');
const PlaylistItem = require('./PlaylistItem');
const Friend = require('./Friend');
const Report = require('./Report');

// Room <-> User (many-to-many via RoomParticipant)
Room.belongsToMany(User, {
  through: RoomParticipant,
  as: 'participants',
  foreignKey: 'roomId',
  otherKey: 'userId',
});
User.belongsToMany(Room, {
  through: RoomParticipant,
  as: 'rooms',
  foreignKey: 'userId',
  otherKey: 'roomId',
});

// Room host (one-to-many)
Room.belongsTo(User, { as: 'host', foreignKey: 'hostId' });
User.hasMany(Room, { as: 'hostedRooms', foreignKey: 'hostId' });

// Message associations
Message.belongsTo(Room, { foreignKey: 'roomId', onDelete: 'CASCADE' });
Message.belongsTo(User, { as: 'sender', foreignKey: 'senderId' });
Message.belongsTo(Message, { as: 'replyTo', foreignKey: 'replyToId', onDelete: 'SET NULL' });
Room.hasMany(Message, { foreignKey: 'roomId', onDelete: 'CASCADE' });
User.hasMany(Message, { as: 'sentMessages', foreignKey: 'senderId' });

// Playlist associations
PlaylistItem.belongsTo(Room, { foreignKey: 'roomId', onDelete: 'CASCADE' });
PlaylistItem.belongsTo(User, { as: 'addedByUser', foreignKey: 'addedBy' });
Room.hasMany(PlaylistItem, { foreignKey: 'roomId', onDelete: 'CASCADE' });
User.hasMany(PlaylistItem, { as: 'addedPlaylistItems', foreignKey: 'addedBy' });

// Friend associations
Friend.belongsTo(User, { as: 'requester', foreignKey: 'userId' });
Friend.belongsTo(User, { as: 'target', foreignKey: 'friendId' });
User.hasMany(Friend, { as: 'sentRequests', foreignKey: 'userId' });
User.hasMany(Friend, { as: 'receivedRequests', foreignKey: 'friendId' });

// Report associations
Report.belongsTo(User, { as: 'reporter', foreignKey: 'reporterId' });
Report.belongsTo(User, { as: 'reportedUser', foreignKey: 'reportedUserId' });
Report.belongsTo(Room, { foreignKey: 'roomId' });
User.hasMany(Report, { as: 'reportsSent', foreignKey: 'reporterId' });
User.hasMany(Report, { as: 'reportsReceived', foreignKey: 'reportedUserId' });
Room.hasMany(Report, { foreignKey: 'roomId' });

module.exports = {
  User,
  Room,
  RoomParticipant,
  Message,
  PlaylistItem,
  Friend,
  Report,
};
