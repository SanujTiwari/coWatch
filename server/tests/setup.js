const { sequelize } = require('../config/db');

const cleanup = async () => {
  const { User, Room, RoomParticipant, Message, PlaylistItem, Friend, Report } = require('../models');
  await PlaylistItem.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
  await Message.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
  await RoomParticipant.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
  await Room.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
  await Report.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
  await Friend.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
  await User.destroy({ where: {}, truncate: true, cascade: true, restartIdentity: true });
};

beforeAll(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();
    await cleanup();
    console.log('✅ Test database authenticated and synced');
  } catch (error) {
    console.error('❌ Test database setup failed:', error.message);
  }
});

afterAll(async () => {
  try {
    await cleanup();
    await sequelize.close();
  } catch (e) {}
});

beforeEach(async () => {
  await cleanup();
});

afterEach(async () => {
  await cleanup();
});
