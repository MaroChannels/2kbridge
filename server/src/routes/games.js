const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const router = express.Router();
const { DATA_DIR } = require('../paths');

const GAMES_FILE = process.env.GAMES_PATH || path.join(DATA_DIR, 'games.json');

function readGames() {
  try { return JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8')).games || []; }
  catch { return []; }
}
function writeGames(games) {
  fs.writeFileSync(GAMES_FILE, JSON.stringify({ games }, null, 2), 'utf8');
}
function checkAdmin(req, res) {
  const secret = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (secret !== process.env.ADMIN_SECRET) {
    res.status(403).json({ error: 'Non autorisé' });
    return false;
  }
  return true;
}

// ── GET /api/games — public list ─────────────────────────────────────────────
router.get('/games', (_req, res) => {
  res.json({ games: readGames() });
});

// ── POST /api/games — add a game (admin only) ─────────────────────────────────
// Body JSON: { name, description, version, coverUrl, downloadUrl, sizeLabel }
router.post('/games', (req, res) => {
  if (!checkAdmin(req, res)) return;

  const { name, description, version, coverUrl, downloadUrl, sizeLabel } = req.body;

  if (!name || !downloadUrl) {
    return res.status(400).json({ error: 'Le nom et le lien de téléchargement sont requis' });
  }

  const games = readGames();
  const game = {
    id:          crypto.randomBytes(6).toString('hex'),
    name:        name.trim(),
    description: (description || '').trim(),
    version:     (version || '').trim(),
    coverUrl:    (coverUrl || '').trim() || null,
    downloadUrl: downloadUrl.trim(),
    sizeLabel:   (sizeLabel || '').trim() || null,
    addedAt:     new Date().toISOString(),
  };

  games.push(game);
  writeGames(games);

  res.status(201).json({ game });
});

// ── DELETE /api/games/:id ─────────────────────────────────────────────────────
router.delete('/games/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;

  let games = readGames();
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Jeu non trouvé' });

  games = games.filter(g => g.id !== req.params.id);
  writeGames(games);

  res.json({ success: true });
});

module.exports = router;
