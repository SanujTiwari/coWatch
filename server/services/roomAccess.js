const { Op } = require('sequelize');
const { Friend, Room, RoomParticipant } = require('../models');

const isBlockedFromRoom = async (roomId, userId) => {
  const room = await Room.findByPk(roomId);
  if (!room || !room.isActive) return true;
  if (room.hostId === userId) return false;
  const members = await RoomParticipant.findAll({ where: { roomId, isRemoved: false }, attributes: ['userId'] });
  if (!members.length) return false;
  const block = await Friend.findOne({
    where: {
      status: 'blocked',
      [Op.or]: [
        { userId: { [Op.in]: members.map((member) => member.userId) }, friendId: userId },
        { userId, friendId: room.hostId },
      ],
    },
  });
  return Boolean(block);
};

module.exports = { isBlockedFromRoom };
