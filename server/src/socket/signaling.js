/**
 * WebRTC signaling server.
 * The host captures the screen and sends a WebRTC offer to each joining client.
 * ICE candidates are relayed through here.
 *
 * Flow:
 *  1. Game starts → clients emit RTC_REQUEST to host
 *  2. Host creates an RTCPeerConnection, gets offer, emits RTC_OFFER to that client
 *  3. Client sets remote description, creates answer, emits RTC_ANSWER to host
 *  4. Both sides relay ICE candidates to each other via RTC_ICE
 */

const { SOCKET_EVENTS } = require('../../../shared/constants');
const { activeRooms } = require('./lobby');

// socketId → { user, currentRoom } (we use socket.data directly)

function registerSignalingHandlers(io, socket) {
  // Client asks host to send an offer
  socket.on(SOCKET_EVENTS.RTC_REQUEST, ({ hostSocketId } = {}) => {
    if (!hostSocketId) return;
    io.to(hostSocketId).emit(SOCKET_EVENTS.RTC_REQUEST, {
      fromSocketId: socket.id,
      fromUser: socket.data.user,
    });
  });

  // Host sends offer to specific client
  socket.on(SOCKET_EVENTS.RTC_OFFER, ({ targetSocketId, offer } = {}) => {
    if (!targetSocketId || !offer) return;
    io.to(targetSocketId).emit(SOCKET_EVENTS.RTC_OFFER, {
      fromSocketId: socket.id,
      offer,
    });
  });

  // Client sends answer back to host
  socket.on(SOCKET_EVENTS.RTC_ANSWER, ({ targetSocketId, answer } = {}) => {
    if (!targetSocketId || !answer) return;
    io.to(targetSocketId).emit(SOCKET_EVENTS.RTC_ANSWER, {
      fromSocketId: socket.id,
      answer,
    });
  });

  // Relay ICE candidates between peers
  socket.on(SOCKET_EVENTS.RTC_ICE, ({ targetSocketId, candidate } = {}) => {
    if (!targetSocketId || !candidate) return;
    io.to(targetSocketId).emit(SOCKET_EVENTS.RTC_ICE, {
      fromSocketId: socket.id,
      candidate,
    });
  });

  // Forward input events from client to host
  socket.on(SOCKET_EVENTS.INPUT_FORWARD, ({ hostSocketId, input } = {}) => {
    if (!hostSocketId || !input) return;

    // Check permissions
    const roomCode = socket.data.currentRoom;
    if (roomCode) {
      const room = activeRooms.get(roomCode);
      const member = room?.members.get(socket.id);
      if (member && member.permissions) {
        const device = input.type; // keyboard, mouse, gamepad
        if (!member.permissions[device]) {
          return; // Silently drop denied input
        }
      }
    }

    io.to(hostSocketId).emit(SOCKET_EVENTS.INPUT_FORWARD, {
      fromSocketId: socket.id,
      input,
    });
  });

  // Friend invite relay
  socket.on(SOCKET_EVENTS.FRIEND_INVITE, ({ targetUsername, roomCode } = {}) => {
    if (!targetUsername || !roomCode) return;
    // Find socket by username
    for (const [, s] of io.sockets.sockets) {
      if (s.data.user?.username?.toLowerCase() === targetUsername.toLowerCase()) {
        s.emit(SOCKET_EVENTS.FRIEND_INVITE_RECV, {
          from: socket.data.user.username,
          roomCode,
        });
        break;
      }
    }
  });
}

module.exports = { registerSignalingHandlers };
