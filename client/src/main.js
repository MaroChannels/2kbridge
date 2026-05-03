const { app, BrowserWindow, ipcMain, desktopCapturer, shell, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');
const { spawn } = require('child_process');
const Store = require('electron-store');

// IMPORTANT: Disable hardware acceleration for better capture stability if glitches persist
app.disableHardwareAcceleration();

const store = new Store();

// Try loading robotjs – it requires native rebuild for Electron
// Run: npm run rebuild   (from client/ directory) to compile it
let robot = null;
try {
  robot = require('robotjs');
  robot.setMouseDelay(0);
  robot.setKeyboardDelay(0);
} catch (e) {
  console.warn('[robotjs] Not available – input simulation disabled');
}

// Support for virtual Xbox controllers (requires ViGEmBus driver)
let vigem = null;
let vgClient = null;
let controller = null;
try {
  vigem = require('vigemclient');
  vgClient = new vigem();
  vgClient.connect(); // <--- Important: cette ligne doit être AVANT de créer la manette
  controller = vgClient.createX360Controller();
  controller.connect();
  controller.updateMode = 'manual'; // batch all setValue() into one driver update
  console.log('[ViGEm] Virtual Xbox 360 Controller connected');
} catch (e) {
  console.warn('[ViGEm] Gamepad simulation disabled :', e.message);
}

let mainWindow = null;
let gameProcess = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0d0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,  // local app — allows loading local files across directories
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // DevTools: always open (press F12 or Ctrl+Shift+I to toggle)
  mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('[Renderer] Load failed:', code, desc);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (gameProcess) gameProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC Handlers ────────────────────────────────────────────────────────────

// Window controls (custom frame)
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// Config store
ipcMain.handle('config:get', (_e, key) => store.get(key));
ipcMain.handle('config:set', (_e, key, value) => { store.set(key, value); });
ipcMain.handle('config:delete', (_e, key) => { store.delete(key); });

// Get screen capture sources (desktopCapturer must run in main process in Electron 17+)
ipcMain.handle('capture:getSources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  });
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
  }));
});

// Launch NBA 2K14
ipcMain.handle('game:launch', async (_e, gamePath) => {
  let exePath = (gamePath || store.get('gamePath', '')).trim();

  // If user gave a folder, look for the exe inside
  if (exePath && fs.existsSync(exePath) && fs.statSync(exePath).isDirectory()) {
    const candidates = ['NBA2K14.exe', 'nba2k14.exe', 'NBA 2K14.exe'];
    const found = candidates.find(c => fs.existsSync(path.join(exePath, c)));
    if (found) exePath = path.join(exePath, found);
    else return { success: false, error: `Aucun .exe trouvé dans "${exePath}". Précise le chemin complet vers NBA2K14.exe` };
  }

  // Auto-add .exe if missing
  if (exePath && !exePath.toLowerCase().endsWith('.exe')) exePath += '.exe';

  if (!exePath || !fs.existsSync(exePath)) {
    return { success: false, error: `Fichier introuvable : "${exePath}"` };
  }

  return new Promise((resolve) => {
    try {
      gameProcess = spawn(exePath, [], {
        detached: true,
        stdio: 'ignore',
        cwd: path.dirname(exePath),
      });
      gameProcess.on('error', (err) => resolve({ success: false, error: err.message }));
      gameProcess.unref();
      resolve({ success: true });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

// Simulate keyboard input (for host receiving client inputs)
ipcMain.on('input:keyboard', (_e, { type, key, modifiers = [] }) => {
  if (!robot) return;
  try {
    if (type === 'keydown') {
      robot.keyToggle(key, 'down', modifiers);
    } else if (type === 'keyup') {
      robot.keyToggle(key, 'up', modifiers);
    } else if (type === 'keypress') {
      robot.keyTap(key, modifiers);
    }
  } catch (err) {
    // Ignore unknown key errors
  }
});

// Simulate mouse input
ipcMain.on('input:mouse', (_e, { type, x, y, button }) => {
  if (!robot) return;
  try {
    if (type === 'move') {
      robot.moveMouse(x, y);
    } else if (type === 'click') {
      robot.mouseClick(button || 'left');
    } else if (type === 'scroll') {
      robot.scrollMouse(x, y);
    }
  } catch (err) {
    // Ignore
  }
});

// Simulate Gamepad input (Xbox 360 emulation via ViGEm)
ipcMain.on('input:gamepad', (_e, state) => {
  if (!controller) return;
  try {
    // Buttons — names must match XUSB_BUTTON enum (UPPERCASE)
    controller.button.A.setValue(state.buttons[0]?.pressed || false);
    controller.button.B.setValue(state.buttons[1]?.pressed || false);
    controller.button.X.setValue(state.buttons[2]?.pressed || false);
    controller.button.Y.setValue(state.buttons[3]?.pressed || false);
    controller.button.LEFT_SHOULDER.setValue(state.buttons[4]?.pressed || false);
    controller.button.RIGHT_SHOULDER.setValue(state.buttons[5]?.pressed || false);
    controller.button.BACK.setValue(state.buttons[8]?.pressed || false);
    controller.button.START.setValue(state.buttons[9]?.pressed || false);
    controller.button.LEFT_THUMB.setValue(state.buttons[10]?.pressed || false);
    controller.button.RIGHT_THUMB.setValue(state.buttons[11]?.pressed || false);

    // DPAD — handled as axes in vigemclient (not buttons)
    const dpadUp    = state.buttons[12]?.pressed || false;
    const dpadDown  = state.buttons[13]?.pressed || false;
    const dpadLeft  = state.buttons[14]?.pressed || false;
    const dpadRight = state.buttons[15]?.pressed || false;
    controller.axis.dpadVert.setValue(dpadUp ? -1 : dpadDown ? 1 : 0);
    controller.axis.dpadHorz.setValue(dpadRight ? 1 : dpadLeft ? -1 : 0);

    // Analog sticks — Gamepad API: -1..1, vigemclient accepts -1..1 (converts internally to -32768..32767)
    controller.axis.leftX.setValue(state.axes[0] || 0);
    controller.axis.leftY.setValue(-(state.axes[1] || 0));
    controller.axis.rightX.setValue(state.axes[2] || 0);
    controller.axis.rightY.setValue(-(state.axes[3] || 0));

    // Triggers — Gamepad API: 0..1, vigemclient accepts 0..1 (converts internally to 0..255)
    controller.axis.leftTrigger.setValue(state.buttons[6]?.value || 0);
    controller.axis.rightTrigger.setValue(state.buttons[7]?.value || 0);

    // Submit all changes in a single report to the driver
    controller.update();
  } catch (err) {
    // Ignore updates if controller disconnected
  }
});

// Check if robotjs is available
ipcMain.handle('input:isAvailable', () => robot !== null && controller !== null);

// ── Mod installer ─────────────────────────────────────────────────────────────
// Downloads a mod file and places it next to NBA2K14.exe (same directory).
// gameFilePath is just the filename, e.g. "jersey_home.iff"
ipcMain.handle('mod:install', async (_e, { downloadUrl, gameFilePath, serverUrl }) => {
  try {
    // If downloadUrl is relative (/uploads/xxx), prepend the server base URL
    let fullUrl = downloadUrl;
    if (downloadUrl.startsWith('/')) {
      const base = (serverUrl || store.get('serverUrl', 'http://localhost:3000')).replace(/\/$/, '');
      fullUrl = base + downloadUrl;
    }

    // Resolve the game root from the stored exe path
    let exePath = (store.get('gamePath', '')).trim();
    if (!exePath) return { success: false, error: 'Chemin du jeu non configuré. Configure-le dans Paramètres.' };

    let gameRoot = exePath;
    if (fs.existsSync(exePath) && fs.statSync(exePath).isFile()) {
      gameRoot = path.dirname(exePath);
    }
    if (!fs.existsSync(gameRoot)) {
      return { success: false, error: `Dossier du jeu introuvable : "${gameRoot}"` };
    }

    // Build the full destination path
    const destPath = path.join(gameRoot, gameFilePath.replace(/\//g, path.sep));
    const destDir  = path.dirname(destPath);

    // Create missing subdirectories
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    // Backup the original file (only once)
    if (fs.existsSync(destPath) && !fs.existsSync(destPath + '.bak')) {
      fs.copyFileSync(destPath, destPath + '.bak');
    }

    // Download the file
    await new Promise((resolve, reject) => {
      const proto = fullUrl.startsWith('https') ? https : http;
      const file  = fs.createWriteStream(destPath);

      const req = proto.get(fullUrl, (res) => {
        // Follow redirects (up to 5 hops)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(destPath, () => {});
          // Re-invoke for redirect — unwrap via recursive call
          reject(new Error('__REDIRECT__:' + res.headers.location));
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(destPath, () => {});
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      });

      req.on('error', (err) => {
        file.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });

      req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout (30s)')); });
    });

    return { success: true, destPath };
  } catch (err) {
    // Handle redirect by retrying with new URL (one level only)
    if (err.message.startsWith('__REDIRECT__:')) {
      const newUrl = err.message.slice('__REDIRECT__:'.length);
      try {
        let exePath = (store.get('gamePath', '')).trim();
        let gameRoot = fs.existsSync(exePath) && fs.statSync(exePath).isFile() ? path.dirname(exePath) : exePath;
        const destPath = path.join(gameRoot, gameFilePath.replace(/\//g, path.sep));
        const destDir  = path.dirname(destPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        if (fs.existsSync(destPath) && !fs.existsSync(destPath + '.bak')) fs.copyFileSync(destPath, destPath + '.bak');

        await new Promise((resolve, reject) => {
          const proto = newUrl.startsWith('https') ? https : http;
          const file  = fs.createWriteStream(destPath);
          const req   = proto.get(newUrl, (res) => {
            if (res.statusCode !== 200) { file.close(); fs.unlink(destPath, () => {}); reject(new Error(`HTTP ${res.statusCode}`)); return; }
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', reject);
          });
          req.on('error', (e) => { file.close(); fs.unlink(destPath, () => {}); reject(e); });
          req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
        });
        return { success: true, destPath };
      } catch (e2) {
        return { success: false, error: e2.message };
      }
    }
    return { success: false, error: err.message };
  }
});

// ── Game installer ────────────────────────────────────────────────────────────

// Open folder picker dialog
ipcMain.handle('game:choosePath', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: "Choisir le dossier d'installation",
  });
  return canceled ? null : filePaths[0];
});

// Download + extract a game
ipcMain.handle('game:download', async (_e, { id, downloadUrl, installPath }) => {
  let AdmZip;
  try { AdmZip = require('adm-zip'); } catch { AdmZip = null; }

  // Helper: download a URL to a destination file, sending progress events
  function download(url, destFile, contentLength) {
    return new Promise((resolve, reject) => {
      const proto = url.startsWith('https') ? https : http;
      const file  = fs.createWriteStream(destFile);
      let received = 0;

      const req = proto.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlink(destFile, () => {});
          reject(new Error('__REDIRECT__:' + res.headers.location));
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(destFile, () => {});
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const total = contentLength || parseInt(res.headers['content-length'] || '0', 10);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const percent = Math.min(99, (received / total) * 100);
            mainWindow?.webContents.send('game:progress', { id, percent });
          }
        });
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
      });

      req.on('error', (err) => { file.close(); fs.unlink(destFile, () => {}); reject(err); });
      req.setTimeout(0); // No timeout for large game files
    });
  }

  try {
    if (!fs.existsSync(installPath)) fs.mkdirSync(installPath, { recursive: true });

    const isZip = downloadUrl.toLowerCase().includes('.zip') ||
                  downloadUrl.toLowerCase().includes('zip');
    const tmpFile = path.join(installPath, `__2kb_download_${id}${isZip ? '.zip' : '.bin'}`);

    mainWindow?.webContents.send('game:progress', { id, percent: 0 });

    try {
      await download(downloadUrl, tmpFile);
    } catch (err) {
      // Handle one redirect
      if (err.message.startsWith('__REDIRECT__:')) {
        const newUrl = err.message.slice('__REDIRECT__:'.length);
        await download(newUrl, tmpFile);
      } else {
        throw err;
      }
    }

    mainWindow?.webContents.send('game:progress', { id, percent: 99 });

    // Extract ZIP if applicable
    if (isZip && AdmZip && fs.existsSync(tmpFile)) {
      const zip = new AdmZip(tmpFile);
      zip.extractAllTo(installPath, true);
      fs.unlink(tmpFile, () => {});
    } else if (!isZip) {
      // Non-zip: just keep the file as-is (EXE, etc.)
      const ext  = path.extname(downloadUrl.split('?')[0]) || '.exe';
      const dest = path.join(installPath, `game${ext}`);
      fs.renameSync(tmpFile, dest);
    }

    mainWindow?.webContents.send('game:progress', { id, percent: 100 });

    // Find the main exe in the install folder (recursive, depth 2)
    function findExe(dir, depth = 0) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) return path.join(dir, e.name);
        }
        if (depth < 2) {
          for (const e of entries) {
            if (e.isDirectory()) {
              const found = findExe(path.join(dir, e.name), depth + 1);
              if (found) return found;
            }
          }
        }
      } catch {}
      return null;
    }
    const exePath = findExe(installPath);

    return { success: true, installPath, exePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
