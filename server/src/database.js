/**
 * Simple JSON file-based database — no native dependencies required.
 * Stores users and rooms in a JSON file (data/2kbridge.json).
 *
 * Not suitable for large scale but perfect for a LAN/friends app.
 */
const fs   = require('fs');
const path = require('path');
const { ROOM_STATUS } = require('../../shared/constants');
const { DATA_DIR } = require('./paths');

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, '2kbridge.json');

const DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

// ── In-memory store ──────────────────────────────────────────────────────────
let store = { users: [], rooms: [], _nextUserId: 1, _nextRoomId: 1 };

// Load from disk if exists
function load() {
  try {
    if (fs.existsSync(DB_PATH)) {
      store = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch {
    // Corrupted file – start fresh
    store = { users: [], rooms: [], _nextUserId: 1, _nextRoomId: 1 };
  }
}

function save() {
  fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2), 'utf8');
}

load();

// ── Users ─────────────────────────────────────────────────────────────────────

const stmts = {
  createUser({ username, password }) {
    const id = store._nextUserId++;
    const user = { id, username, password, created_at: Date.now() };
    store.users.push(user);
    save();
    return { lastInsertRowid: id };
  },

  findByName(username) {
    return store.users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
  },

  findById(id) {
    const u = store.users.find(u => u.id === id);
    if (!u) return null;
    return { id: u.id, username: u.username, created_at: u.created_at };
  },

  // ── Rooms ──────────────────────────────────────────────────────────────────

  createRoom({ code, name, host_id, max_players }) {
    const id = store._nextRoomId++;
    const room = {
      id, code, name, host_id,
      max_players: max_players || 2,
      status: ROOM_STATUS.WAITING,
      created_at: Date.now(),
    };
    store.rooms.push(room);
    save();
    return { lastInsertRowid: id };
  },

  findRoomByCode(code) {
    return store.rooms.find(r => r.code === code) || null;
  },

  findRoomById(id) {
    return store.rooms.find(r => r.id === id) || null;
  },

  updateRoomStatus(status, id) {
    const room = store.rooms.find(r => r.id === id);
    if (room) { room.status = status; save(); }
  },

  deleteRoom(id) {
    store.rooms = store.rooms.filter(r => r.id !== id);
    save();
  },

  listOpenRooms() {
    return store.rooms
      .filter(r => r.status === 'waiting')
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 50)
      .map(r => {
        const host = store.users.find(u => u.id === r.host_id);
        return { ...r, host_name: host?.username || 'Unknown' };
      });
  },
};

module.exports = { stmts };
