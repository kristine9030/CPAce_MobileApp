const { Server } = require('socket.io');
const { one } = require('./db');

/**
 * Attach Socket.IO to the Express HTTP server.
 * Clients authenticate via the `token` query parameter (same Bearer token
 * used for REST). Each authenticated socket joins a personal room
 * `user:<userId>` and can join/leave conversation rooms.
 */
function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  // Track online users: Map<userId, Set<socketId>>
  const onlineUsers = new Map();

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));

      const record = await one('SELECT * FROM api_tokens WHERE token = ?', [token]);
      if (!record) return next(new Error('Invalid token'));

      if (record.expires_at && new Date(record.expires_at) < new Date()) {
        return next(new Error('Token expired'));
      }

      const user = await one('SELECT id, first_name, last_name, profile_photo FROM users WHERE id = ?', [record.user_id]);
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      next(err);
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;

    // Join personal room for direct notifications
    socket.join(`user:${userId}`);

    // Track online status
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    console.log(`[Socket.IO] User ${userId} connected (${socket.id})`);

    // ── Join a conversation room ──
    socket.on('join-conversation', (conversationId) => {
      socket.join(`conversation:${conversationId}`);
    });

    // ── Leave a conversation room ──
    socket.on('leave-conversation', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // ── Typing indicator (optional, for future use) ──
    socket.on('typing', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('user-typing', {
        userId,
        name: `${socket.user.first_name} ${socket.user.last_name}`,
        conversationId,
      });
    });

    socket.on('stop-typing', ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit('user-stop-typing', {
        userId,
        conversationId,
      });
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) onlineUsers.delete(userId);
      }
      console.log(`[Socket.IO] User ${userId} disconnected (${socket.id})`);
    });
  });

  // Expose helpers on the io instance
  io.isOnline = (uid) => onlineUsers.has(uid);
  io.getOnlineUsers = () => [...onlineUsers.keys()];

  return io;
}

module.exports = { createSocketServer };
