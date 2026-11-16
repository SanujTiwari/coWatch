const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const User = require('../models/User');
const Room = require('../models/Room');
const Message = require('../models/Message');

const initializeSocket = (io) => {
  // Auth middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.user.name} (${socket.id})`);

    // Update online status
    User.findByIdAndUpdate(socket.user._id, { online: true, lastSeen: Date.now() }).exec();

    // ===== ROOM EVENTS =====

    socket.on('room:join', async ({ roomId }) => {
      try {
        const room = await Room.findById(roomId)
          .populate('participants', 'name email avatar online');
        if (!room) return socket.emit('error', { message: 'Room not found' });

        socket.join(roomId);
        socket.roomId = roomId;

        // Notify others
        socket.to(roomId).emit('room:user-joined', {
          user: { _id: socket.user._id, name: socket.user.name, avatar: socket.user.avatar },
        });

        // Send current media state to the joining user
        socket.emit('media:state', {
          currentMedia: room.currentMedia,
        });

        // Send updated participant list
        const updatedRoom = await Room.findById(roomId)
          .populate('participants', 'name email avatar online');
        io.to(roomId).emit('room:participants', {
          participants: updatedRoom.participants,
        });

        console.log(`📺 ${socket.user.name} joined room ${room.name}`);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('room:leave', async ({ roomId }) => {
      socket.leave(roomId);
      socket.to(roomId).emit('room:user-left', {
        user: { _id: socket.user._id, name: socket.user.name },
      });
      console.log(`🚪 ${socket.user.name} left room`);
    });

    // ===== MEDIA SYNC EVENTS =====

    socket.on('media:play', async ({ roomId, currentTime }) => {
      try {
        await Room.findByIdAndUpdate(roomId, {
          'currentMedia.isPlaying': true,
          'currentMedia.currentTime': currentTime,
        });

        socket.to(roomId).emit('media:play', {
          currentTime,
          userId: socket.user._id,
          userName: socket.user.name,
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('media:pause', async ({ roomId, currentTime }) => {
      try {
        await Room.findByIdAndUpdate(roomId, {
          'currentMedia.isPlaying': false,
          'currentMedia.currentTime': currentTime,
        });

        socket.to(roomId).emit('media:pause', {
          currentTime,
          userId: socket.user._id,
          userName: socket.user.name,
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('media:seek', async ({ roomId, currentTime }) => {
      try {
        await Room.findByIdAndUpdate(roomId, {
          'currentMedia.currentTime': currentTime,
        });

        socket.to(roomId).emit('media:seek', {
          currentTime,
          userId: socket.user._id,
          userName: socket.user.name,
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('media:change', async ({ roomId, media }) => {
      try {
        await Room.findByIdAndUpdate(roomId, {
          currentMedia: {
            title: media.title,
            url: media.url,
            type: media.type || 'video',
            currentTime: 0,
            isPlaying: false,
          },
        });

        io.to(roomId).emit('media:change', {
          media,
          userId: socket.user._id,
          userName: socket.user.name,
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // ===== CHAT EVENTS =====

    socket.on('chat:message', async ({ roomId, content, type }) => {
      try {
        const message = await Message.create({
          room: roomId,
          sender: socket.user._id,
          content,
          type: type || 'text',
        });

        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'name avatar');

        io.to(roomId).emit('chat:message', populatedMessage);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // ===== REACTION EVENTS =====

    socket.on('reaction:send', ({ roomId, emoji }) => {
      io.to(roomId).emit('reaction:received', {
        emoji,
        userId: socket.user._id,
        userName: socket.user.name,
        id: Date.now() + Math.random(),
      });
    });

    // ===== TYPING EVENTS =====

    socket.on('chat:typing', ({ roomId }) => {
      socket.to(roomId).emit('chat:typing', {
        userId: socket.user._id,
        userName: socket.user.name,
      });
    });

    socket.on('chat:stop-typing', ({ roomId }) => {
      socket.to(roomId).emit('chat:stop-typing', {
        userId: socket.user._id,
      });
    });

    // ===== DISCONNECT =====

    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.user.name}`);

      await User.findByIdAndUpdate(socket.user._id, {
        online: false,
        lastSeen: Date.now(),
      });

      if (socket.roomId) {
        socket.to(socket.roomId).emit('room:user-left', {
          user: { _id: socket.user._id, name: socket.user.name },
        });

        // Update participant list
        const room = await Room.findById(socket.roomId)
          .populate('participants', 'name email avatar online');
        if (room) {
          io.to(socket.roomId).emit('room:participants', {
            participants: room.participants,
          });
        }
      }
    });
  });
};

module.exports = initializeSocket;
