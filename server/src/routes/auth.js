const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { stmts } = require('../database');

const router = express.Router();

function makeToken(id, username) {
  return jwt.sign({ id, username }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// ── POST /api/register ────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: 'Username must be 3–20 characters' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username: letters, numbers, _ and - only' });
  }

  if (stmts.findByName(username)) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const hash = await bcrypt.hash(password, 10);
  const { lastInsertRowid: id } = stmts.createUser({ username, password: hash });
  const token = makeToken(id, username);
  res.status(201).json({ token, user: { id, username } });
});

// ── POST /api/login ───────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = stmts.findByName(username);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = makeToken(user.id, user.username);
  res.json({ token, user: { id: user.id, username: user.username } });
});

module.exports = router;
