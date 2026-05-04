require('dotenv').config({ path: require('./paths').DOT_ENV });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { SERVER_PORT } = require('../shared/constants');
const authRouter  = require('./routes/auth');
const modsRouter  = require('./routes/mods');
const gamesRouter = require('./routes/games');
const { setupSocketIO } = require('./socket');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/api', authRouter);
app.use('/api', modsRouter);
app.use('/api', gamesRouter);

// Serve uploaded mod files
const uploadsDir = process.env.UPLOADS_DIR || require('path').join(require('./paths').DATA_DIR, 'uploads');
app.use('/uploads', require('express').static(uploadsDir));

app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// ── Socket.io ──────────────────────────────────────────────────────────────
setupSocketIO(io);

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || SERVER_PORT;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`\n🏀 2KBridge server running on ${HOST}:${PORT}`);
  console.log(`   API : http://0.0.0.0:${PORT}/api  (accessible via toutes les interfaces)`);
  console.log(`   WS  : ws://0.0.0.0:${PORT}\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
