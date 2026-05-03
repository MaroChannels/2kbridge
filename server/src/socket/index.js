const jwt = require('jsonwebtoken');
const { SOCKET_EVENTS } = require('../../../shared/constants');
const { registerLobbyHandlers } = require('./lobby');
const { registerChatHandlers } = require('./chat');
const { registerSignalingHandlers } = require('./signaling');

function setupSocketIO(io) {
  // ── JWT middleware ─────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.user = { id: payload.id, username: payload.username };
      socket.data.currentRoom = null;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[+] ${socket.data.user.username} connected (${socket.id})`);

    registerLobbyHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerSignalingHandlers(io, socket);

    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
      console.log(`[-] ${socket.data.user?.username} disconnected`);
    });
  });
}

module.exports = { setupSocketIO };
