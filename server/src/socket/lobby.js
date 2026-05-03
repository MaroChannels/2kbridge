const { v4: uuidv4 } = require('uuid');
const { stmts } = require('../database');
const { SOCKET_EVENTS, ROOM_STATUS, MAX_ROOM_PLAYERS } = require('../../../shared/constants');

// In-memory room state: roomCode → { dbId, members: Map<socketId, {id, username}> }
const activeRooms = new Map();

// Auto-delete timers: roomCode → setTimeout handle (fires after 2 min if still empty)
const emptyTimers = new Map();
const EMPTY_ROOM_TTL = 2 * 60 * 1000; // 2 minutes

function scheduleEmptyDelete(io, roomCode) {
  cancelEmptyDelete(roomCode);
  const timer = setTimeout(() => {
    emptyTimers.delete(roomCode);
    if (!activeRooms.has(roomCode)) return;
    const mem = activeRooms.get(roomCode);
    if (mem && mem.members.size === 0) {
      const dbRoom = stmts.findRoomByCode(roomCode);
      if (dbRoom) stmts.updateRoomStatus(ROOM_STATUS.CLOSED, dbRoom.id);
      activeRooms.delete(roomCode);
      broadcastRoomList(io);
      console.log(`[Lobby] Room ${roomCode} auto-deleted after 2 min empty`);
    }
  }, EMPTY_ROOM_TTL);
  emptyTimers.set(roomCode, timer);
}

function cancelEmptyDelete(roomCode) {
  const t = emptyTimers.get(roomCode);
  if (t) { clearTimeout(t); emptyTimers.delete(roomCode); }
}

function generateCode() {
  return uuidv4().slice(0, 8).toUpperCase();
}

function getRoomPublicData(roomCode) {
  const mem = activeRooms.get(roomCode);
  if (!mem) return null;
  const dbRoom = stmts.findRoomByCode(roomCode);
  if (!dbRoom) return null;
  return {
    id: dbRoom.id,
    code: roomCode,
    name: dbRoom.name,
    status: dbRoom.status,
    hostId: dbRoom.host_id,
    maxPlayers: dbRoom.max_players,
    members: Array.from(mem.members.entries()).map(([socketId, data]) => ({
      ...data,
      socketId
    })),
  };
}

function registerLobbyHandlers(io, socket) {
  const user = socket.data.user; // { id, username } set after auth

  // ── Create room ───────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_CREATE, ({ name, maxPlayers } = {}) => {
    if (!name || typeof name !== 'string') {
      return socket.emit(SOCKET_EVENTS.ERROR, 'Room name is required');
    }
    const roomName = name.trim().slice(0, 40);
    const players = Math.min(Math.max(parseInt(maxPlayers) || 2, 2), MAX_ROOM_PLAYERS);
    const code = generateCode();

    try {
      const result = stmts.createRoom({ code, name: roomName, host_id: user.id, max_players: players });
      activeRooms.set(code, { dbId: result.lastInsertRowid, members: new Map() });
      activeRooms.get(code).members.set(socket.id, { 
        id: user.id, 
        username: user.username,
        permissions: { keyboard: true, mouse: true, gamepad: true }
      });

      socket.join(code);
      socket.data.currentRoom = code;

      const roomData = getRoomPublicData(code);
      socket.emit(SOCKET_EVENTS.ROOM_CREATED, roomData);
      broadcastRoomList(io);
    } catch (err) {
      socket.emit(SOCKET_EVENTS.ERROR, 'Failed to create room');
    }
  });

  // ── Join room ─────────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_JOIN, ({ code } = {}) => {
    if (!code) return socket.emit(SOCKET_EVENTS.ERROR, 'Room code required');
    const roomCode = code.toUpperCase().trim();

    const dbRoom = stmts.findRoomByCode(roomCode);
    if (!dbRoom) return socket.emit(SOCKET_EVENTS.ERROR, 'Room not found');
    if (dbRoom.status !== ROOM_STATUS.WAITING) {
      return socket.emit(SOCKET_EVENTS.ERROR, 'Room is already in-game or closed');
    }

    const mem = activeRooms.get(roomCode);
    if (!mem) return socket.emit(SOCKET_EVENTS.ERROR, 'Room not active');
    if (mem.members.size >= dbRoom.max_players) {
      return socket.emit(SOCKET_EVENTS.ERROR, 'Room is full');
    }

    cancelEmptyDelete(roomCode); // Someone joined — cancel any pending auto-delete
    leaveCurrentRoom(io, socket);

    mem.members.set(socket.id, { 
      id: user.id, 
      username: user.username,
      permissions: { keyboard: true, mouse: true, gamepad: true }
    });
    socket.join(roomCode);
    socket.data.currentRoom = roomCode;

    const roomData = getRoomPublicData(roomCode);
    socket.emit(SOCKET_EVENTS.ROOM_JOINED, roomData);
    socket.to(roomCode).emit(SOCKET_EVENTS.ROOM_MEMBER_JOINED, {
      user: { id: user.id, username: user.username },
      room: roomData,
    });
    broadcastRoomList(io);
  });

  // ── Leave room ────────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_LEAVE, () => {
    leaveCurrentRoom(io, socket);
  });

  // ── List rooms ────────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_LIST, () => {
    socket.emit(SOCKET_EVENTS.ROOM_LIST, buildRoomList());
  });

  // ── Start game (host only) ────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_GAME_START, () => {
    const roomCode = socket.data.currentRoom;
    if (!roomCode) return socket.emit(SOCKET_EVENTS.ERROR, 'Not in a room');

    const dbRoom = stmts.findRoomByCode(roomCode);
    if (!dbRoom || dbRoom.host_id !== user.id) {
      return socket.emit(SOCKET_EVENTS.ERROR, 'Only the host can start the game');
    }

    stmts.updateRoomStatus(ROOM_STATUS.PLAYING, dbRoom.id);
    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_GAME_STARTED, {
      roomCode,
      hostId: user.id,
      hostSocketId: socket.id,  // clients need this for WebRTC signaling
    });
    broadcastRoomList(io);
  });

  // ── Stop game (host only) ──────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_GAME_STOP, () => {
    const roomCode = socket.data.currentRoom;
    if (!roomCode) return;
    const dbRoom = stmts.findRoomByCode(roomCode);
    if (!dbRoom || dbRoom.host_id !== user.id) return;

    stmts.updateRoomStatus(ROOM_STATUS.WAITING, dbRoom.id);
    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_STREAM_STOPPED);
    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, getRoomPublicData(roomCode));
    broadcastRoomList(io);
  });

  // ── Toggle player permission (host only) ──────────────────────────────────
  socket.on(SOCKET_EVENTS.PLAYER_PERMISSION_TOGGLE, ({ targetSocketId, device }) => {
    const roomCode = socket.data.currentRoom;
    if (!roomCode) return;
    const mem = activeRooms.get(roomCode);
    if (!mem) return;

    const dbRoom = stmts.findRoomByCode(roomCode);
    if (!dbRoom || dbRoom.host_id !== user.id) return;

    const targetUser = mem.members.get(targetSocketId);
    if (targetUser && targetUser.permissions[device] !== undefined) {
      targetUser.permissions[device] = !targetUser.permissions[device];
      io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, getRoomPublicData(roomCode));
    }
  });

  // ── Delete room (host only) ───────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.ROOM_DELETE, () => {
    const roomCode = socket.data.currentRoom;
    if (!roomCode) return socket.emit(SOCKET_EVENTS.ERROR, 'Not in a room');

    const dbRoom = stmts.findRoomByCode(roomCode);
    if (!dbRoom || dbRoom.host_id !== user.id) {
      return socket.emit(SOCKET_EVENTS.ERROR, 'Seul le host peut supprimer la room');
    }

    cancelEmptyDelete(roomCode);
    stmts.updateRoomStatus(ROOM_STATUS.CLOSED, dbRoom.id);

    // Notify all members they're being kicked
    io.to(roomCode).emit(SOCKET_EVENTS.ROOM_CLOSED, { roomCode, reason: 'deleted_by_host' });

    // Clean up all members from the in-memory state
    const mem = activeRooms.get(roomCode);
    if (mem) {
      for (const [sid] of mem.members) {
        const s = io.sockets.sockets.get(sid);
        if (s) { s.leave(roomCode); s.data.currentRoom = null; }
      }
    }
    activeRooms.delete(roomCode);
    broadcastRoomList(io);
    console.log(`[Lobby] Room ${roomCode} deleted by host`);
  });

  // ── On disconnect ─────────────────────────────────────────────────────────
  socket.on(SOCKET_EVENTS.DISCONNECT, () => {
    leaveCurrentRoom(io, socket);
  });
}

function leaveCurrentRoom(io, socket) {
  const roomCode = socket.data.currentRoom;
  if (!roomCode) return;

  const mem = activeRooms.get(roomCode);
  if (mem) {
    mem.members.delete(socket.id);

    if (mem.members.size === 0) {
      // Room is empty — start 2-min auto-delete timer instead of closing immediately
      scheduleEmptyDelete(io, roomCode);
    } else {
      io.to(roomCode).emit(SOCKET_EVENTS.ROOM_MEMBER_LEFT, {
        userId: socket.data.user?.id,
        room: getRoomPublicData(roomCode),
      });
    }
  }

  socket.leave(roomCode);
  socket.data.currentRoom = null;
  broadcastRoomList(io);
}

function buildRoomList() {
  const dbRooms = stmts.listOpenRooms();
  return dbRooms.map(r => {
    const mem = activeRooms.get(r.code);
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      hostName: r.host_name,
      maxPlayers: r.max_players,
      currentPlayers: mem ? mem.members.size : 0,
      status: r.status,
    };
  });
}

function broadcastRoomList(io) {
  io.emit(SOCKET_EVENTS.ROOM_LIST, buildRoomList());
}

module.exports = { registerLobbyHandlers, leaveCurrentRoom, activeRooms };
