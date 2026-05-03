const { SOCKET_EVENTS } = require('../../shared/constants');

function registerChatHandlers(io, socket) {
  socket.on(SOCKET_EVENTS.CHAT_SEND, ({ text } = {}) => {
    const roomCode = socket.data.currentRoom;
    if (!roomCode) return;
    if (!text || typeof text !== 'string') return;

    const message = text.trim().slice(0, 300);
    if (!message) return;

    io.to(roomCode).emit(SOCKET_EVENTS.CHAT_MESSAGE, {
      user: { id: socket.data.user.id, username: socket.data.user.username },
      text: message,
      timestamp: Date.now(),
    });
  });
}

module.exports = { registerChatHandlers };
