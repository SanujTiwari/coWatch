const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { connectDB } = require('./config/db');
const { PORT, CLIENT_URL } = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const initializeSocket = require('./services/socket.service');

// Route imports
const authRoutes = require('./routes/auth.routes');
const roomRoutes = require('./routes/room.routes');

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

// Middleware
app.use(cors({ origin: [CLIENT_URL, 'http://localhost:5174'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Initialize Socket.IO
initializeSocket(io);

// Connect to DB and start server
const startServer = async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`\n🚀 coWatch server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.IO ready for connections`);
    console.log(`🌐 Client URL: ${CLIENT_URL}\n`);
  });
};

startServer();
