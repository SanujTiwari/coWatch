const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { connectDB } = require('./config/db');
const { PORT, CLIENT_URL } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const initializeSocket = require('./services/socket.service');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { createHmac } = require('crypto');
const auth = require('./middleware/auth');

// Route imports
const authRoutes = require('./routes/auth.routes');
const roomRoutes = require('./routes/room.routes');
const friendRoutes = require('./routes/friend.routes');

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: [CLIENT_URL, 'http://localhost:5174'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
app.set('io', io);

// Middleware
app.use(cors({ origin: [CLIENT_URL, 'http://localhost:5174'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting (disabled in test mode)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 100,
  message: { message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Static uploads (avatars)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/friends', friendRoutes);

// TURN credentials endpoint (short-lived, secrets kept on backend)
app.get('/api/turn/credentials', auth, (req, res) => {
  const stunUrls = (process.env.STUN_URLS || 'stun:stun.l.google.com:19302')
    .split(',').map((url) => url.trim()).filter(Boolean);
  const turnUrls = (process.env.TURN_URLS || '').split(',').map((url) => url.trim()).filter(Boolean);
  const secret = process.env.TURN_SHARED_SECRET;
  if ((turnUrls.length > 0) !== Boolean(secret) ||
      stunUrls.some((url) => !/^stuns?:/i.test(url)) ||
      turnUrls.some((url) => !/^turns?:/i.test(url))) {
    return res.status(503).json({ message: 'ICE server configuration is invalid' });
  }
  const ttlSeconds = 3600;
  const iceServers = stunUrls.length ? [{ urls: stunUrls }] : [];
  if (turnUrls.length) {
    const username = `${Math.floor(Date.now() / 1000) + ttlSeconds}:${req.user.id}`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');
    iceServers.push({ urls: turnUrls, username, credential });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ iceServers, ttl: ttlSeconds * 1000 });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler for multer upload errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.code === 'LIMIT_FILE_TYPES' || (err.message && err.message.includes('Only image files'))) {
    return res.status(400).json({ message: err.message });
  }
  next(err);
});

// Error handler
app.use(errorHandler);

// Initialize Socket.IO
app.set('realtime', initializeSocket(io));

// Connect to DB and start server
const startServer = async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`\n🚀 coWatch server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.IO ready for connections`);
    console.log(`🌐 Client URL: ${CLIENT_URL}\n`);
  });
};

// Export for testing and deployment
module.exports = { app, server, io, startServer };

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Server startup failed:', error);
    process.exitCode = 1;
  });
}
