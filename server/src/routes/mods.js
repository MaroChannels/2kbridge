const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const multer  = require('multer');

const router = express.Router();
const { DATA_DIR } = require('../paths');

const MODS_FILE   = process.env.MODS_PATH  || path.join(DATA_DIR, 'mods.json');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads');

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Multer: store uploaded file with its original extension ──────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = crypto.randomBytes(10).toString('hex') + ext;
    cb(null, name);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB max
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function readMods() {
  try { return JSON.parse(fs.readFileSync(MODS_FILE, 'utf8')).mods || []; }
  catch { return []; }
}
function writeMods(mods) {
  fs.writeFileSync(MODS_FILE, JSON.stringify({ mods }, null, 2), 'utf8');
}
function checkAdmin(req, res) {
  const secret = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (secret !== process.env.ADMIN_SECRET) {
    res.status(403).json({ error: 'Non autorisé' });
    return false;
  }
  return true;
}

// ── GET /api/mods — public list ──────────────────────────────────────────────
router.get('/mods', (_req, res) => {
  res.json({ mods: readMods() });
});

// ── POST /api/mods — add a mod with file upload ──────────────────────────────
// Form fields: name, description, category, imageUrl, gameFileName
// File field:  modFile
router.post('/mods', (req, res) => {
  if (!checkAdmin(req, res)) return;

  upload.single('modFile')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const { name, description, category, imageUrl, gameFileName, gameFilePath } = req.body;
    // Accept either field name for compatibility
    const targetFile = (gameFileName || gameFilePath || '').trim();

    if (!name || !targetFile) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Le nom et le nom du fichier cible sont requis' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Le fichier du mod est requis' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;

    const mods = readMods();
    const mod = {
      id:           crypto.randomBytes(6).toString('hex'),
      name:         name.trim(),
      description:  (description || '').trim(),
      category:     (category || 'Autres').trim(),
      imageUrl:     (imageUrl || '').trim() || null,
      downloadUrl:  fileUrl,
      gameFilePath: targetFile,
      storedFile:   req.file.filename,
      addedAt:      new Date().toISOString(),
    };

    mods.push(mod);
    writeMods(mods);

    res.status(201).json({ mod });
  });
});

// ── DELETE /api/mods/:id ─────────────────────────────────────────────────────
router.delete('/mods/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;

  let mods = readMods();
  const mod = mods.find(m => m.id === req.params.id);
  if (!mod) return res.status(404).json({ error: 'Mod non trouvé' });

  // Delete the stored file from disk
  if (mod.storedFile) {
    const filePath = path.join(UPLOADS_DIR, mod.storedFile);
    if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
  }

  mods = mods.filter(m => m.id !== req.params.id);
  writeMods(mods);

  res.json({ success: true });
});

module.exports = router;
