/**
 * 2KBridge – main renderer script
 * Handles all UI logic, socket communication, and orchestrates streaming.
 *
 * Note: This file uses dynamic import() for the ES module streaming/input files.
 * The streaming modules use browser-native WebRTC APIs available in Electron (Chromium).
 */

// ── Imports via dynamic import (ES modules) ─────────────────────────────────
// We lazy-load streaming modules only when needed
let HostStreamer = null;
let ViewerStreamer = null;
let InputHandler = null;

async function loadStreamingModules() {
  if (!HostStreamer) {
    const hMod = await import('./streaming/host.js');
    HostStreamer = hMod.HostStreamer;
  }
  if (!ViewerStreamer) {
    const vMod = await import('./streaming/viewer.js');
    ViewerStreamer = vMod.ViewerStreamer;
  }
  if (!InputHandler) {
    const iMod = await import('./input/input-handler.js');
    InputHandler = iMod.InputHandler;
  }
}

// socket.io-client is loaded via <script> tag in index.html before this file runs
// It sets window.io automatically

// ── State ────────────────────────────────────────────────────────────────────
const State = {
  token: null,
  user: null,
  serverUrl: 'http://localhost:3000',
  socket: null,
  currentRoom: null,
  isHost: false,
  hostSocketId: null,
  hostStreamer: null,
  viewerStreamer: null,
  inputHandler: null,
};

// ── Utility ──────────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function chatMsg(author, text, isSystem = false) {
  const el = document.createElement('div');
  el.className = `chat-msg${isSystem ? ' system' : ''}`;
  if (!isSystem) {
    el.innerHTML = `<span class="msg-author">${esc(author)}</span><span class="msg-text">${esc(text)}</span>`;
  } else {
    el.innerHTML = `<span class="msg-text">${esc(text)}</span>`;
  }
  const container = document.getElementById('chat-messages');
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// Accept "3000", "localhost:3000", or full "http://..." URL
function normalizeUrl(raw) {
  const s = (raw || '').trim().replace(/\/$/, '');
  if (!s) return 'http://localhost:3000';
  if (/^\d+$/.test(s)) return `http://localhost:${s}`;            // just a port number
  if (/^[\w.-]+(:\d+)?$/.test(s)) return `http://${s}`;           // host or host:port (no scheme)

  // Full URL — if no port is specified, add :3000 as default
  try {
    const u = new URL(s);
    if (!u.port) u.port = '3000';
    return u.origin;
  } catch {
    return s;
  }
}

async function apiPost(path, body) {
  const res = await fetch(`${State.serverUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json() };
}

// ── App ───────────────────────────────────────────────────────────────────────
const App = {
  async init() {
    // Restore saved config
    const savedUrl    = await bridge.configGet('serverUrl');
    const savedToken  = await bridge.configGet('token');
    const savedUser   = await bridge.configGet('user');
    const savedGame   = await bridge.configGet('gamePath');

    if (savedUrl) {
      State.serverUrl = normalizeUrl(savedUrl);
      document.getElementById('server-url-input').value = State.serverUrl;
      // Persist the normalized form so future loads are clean
      await bridge.configSet('serverUrl', State.serverUrl);
    }
    if (savedGame) {
      document.getElementById('game-path-input').value = savedGame;
    }

    if (savedToken && savedUser) {
      State.token = savedToken;
      State.user  = savedUser;
      App.connectSocket();
    } else {
      showPage('page-login');
    }

    // Update fullscreen button icon when fullscreen state changes
    document.addEventListener('fullscreenchange', () => {
      const btn = document.getElementById('btn-stream-fullscreen');
      if (!btn) return;
      if (document.fullscreenElement) {
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline>
            <line x1="10" y1="14" x2="3" y2="21"></line><line x1="21" y1="3" x2="14" y2="10"></line>
          </svg> Réduire`;
      } else {
        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>
          </svg> Plein écran`;
      }
    });

    // Enter key support on login/register forms
    document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') App.login(); });
    document.getElementById('reg-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') App.register(); });
    document.getElementById('join-code-input').addEventListener('keydown', e => { if (e.key === 'Enter') App.joinByCode(); });

    // Server url input
    document.getElementById('server-url-input').addEventListener('change', (e) => {
      State.serverUrl = normalizeUrl(e.target.value);
      document.getElementById('server-url-input').value = State.serverUrl;
    });
  },

  showTab(tab) {
    const isLogin = (tab === 'login');
    document.getElementById('form-login').style.display    = isLogin ? '' : 'none';
    document.getElementById('form-register').style.display = isLogin ? 'none' : '';
    document.getElementById('tab-login-btn').classList.toggle('active', isLogin);
    document.getElementById('tab-register-btn').classList.toggle('active', !isLogin);
    document.getElementById('login-error').textContent = '';
    document.getElementById('register-error').textContent = '';
  },

  async login() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl    = document.getElementById('login-error');
    errEl.textContent = '';

    if (!username || !password) { errEl.textContent = 'Remplis tous les champs.'; return; }

    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Connexion...';

    try {
      const { ok, data } = await apiPost('/api/login', { username, password });
      if (!ok) { errEl.textContent = data.error || 'Erreur de connexion.'; return; }

      State.token = data.token;
      State.user  = data.user;
      await bridge.configSet('token', data.token);
      await bridge.configSet('user', data.user);
      App.connectSocket();
    } catch (e) {
      errEl.textContent = `Impossible de joindre le serveur (${State.serverUrl}).`;
    } finally {
      btn.disabled = false; btn.textContent = 'Se connecter';
    }
  },

  async register() {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;
    const errEl    = document.getElementById('register-error');
    errEl.textContent = '';

    if (!username || !password) { errEl.textContent = 'Remplis tous les champs.'; return; }
    if (password !== confirm) { errEl.textContent = 'Les mots de passe ne correspondent pas.'; return; }

    const btn = document.getElementById('register-btn');
    btn.disabled = true; btn.textContent = 'Création...';

    try {
      const { ok, data } = await apiPost('/api/register', { username, password });
      if (!ok) { errEl.textContent = data.error || 'Erreur.'; return; }

      State.token = data.token;
      State.user  = data.user;
      await bridge.configSet('token', data.token);
      await bridge.configSet('user', data.user);
      App.connectSocket();
    } catch (e) {
      errEl.textContent = `Impossible de joindre le serveur (${State.serverUrl}).`;
    } finally {
      btn.disabled = false; btn.textContent = 'Créer le compte';
    }
  },

  logout() {
    if (State.socket) { State.socket.disconnect(); State.socket = null; }
    bridge.configDelete('token');
    bridge.configDelete('user');
    State.token = null; State.user = null; State.currentRoom = null;
    showPage('page-login');
  },

  // ── Socket ──────────────────────────────────────────────────────────────

  connectSocket() {
    const io = window.io;
    if (!io) { toast('socket.io non chargé – relance l\'app.', 'error'); return; }

    State.socket = io(State.serverUrl, {
      auth: { token: State.token },
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    State.socket.on('connect', () => {
      console.log('[Socket] Connected', State.socket.id);
      showPage('page-lobby');
      document.getElementById('lobby-username').textContent = State.user.username;
      App.refreshRooms();
      toast(`Connecté en tant que ${State.user.username}`, 'success');
    });

    State.socket.on('connect_error', (err) => {
      toast(`Connexion échouée : ${err.message}`, 'error');
      showPage('page-login');
    });

    State.socket.on('disconnect', () => {
      toast('Déconnecté du serveur.', 'error');
      showPage('page-login');
    });

    App._registerSocketHandlers();
  },

  _registerSocketHandlers() {
    const s = State.socket;

    s.on('room:list', (rooms) => App._renderRooms(rooms));

    s.on('room:created', (room) => {
      State.currentRoom = room;
      State.isHost = true;
      App._enterRoom(room);
    });

    s.on('room:joined', (room) => {
      State.currentRoom = room;
      State.isHost = (room.hostId === State.user.id);
      App._enterRoom(room);
    });

    s.on('room:updated', (room) => {
      State.currentRoom = room;
      App._updatePlayersUI(room.members);
    });

    s.on('room:member:joined', ({ user, room }) => {
      State.currentRoom = room;
      App._updatePlayersUI(room.members);
      chatMsg('', `${user.username} a rejoint la room.`, true);
    });

    s.on('room:member:left', ({ userId, room }) => {
      State.currentRoom = room;
      App._updatePlayersUI(room.members);
      chatMsg('', 'Un joueur a quitté la room.', true);
    });

    s.on('room:closed', () => {
      toast('La room a été fermée.', 'error');
      App._exitRoom();
    });

    s.on('room:game:started', ({ hostSocketId }) => {
      State.hostSocketId = hostSocketId;
      chatMsg('', 'Le jeu a démarré !', true);

      if (State.isHost) {
        App._hostStartStreaming();
      } else {
        // Enable connect stream button
        document.getElementById('connect-stream-btn').disabled = false;
        document.getElementById('stream-connect-text').textContent = 'Prêt – clique pour connecter';
        document.getElementById('stream-connect-dot').className = 'status-dot orange';
      }
    });

    s.on('room:stream:stopped', () => {
      chatMsg('', 'Le stream a été arrêté par le host.', true);
      App._stopAllStreaming();
      
      if (!State.isHost) {
        document.getElementById('connect-stream-btn').disabled = true;
        document.getElementById('stream-connect-text').textContent = 'Stream arrêté';
        document.getElementById('stream-connect-dot').className = 'status-dot red';
      } else {
        document.getElementById('start-game-btn').style.display = 'block';
        document.getElementById('start-game-btn').disabled = false;
        document.getElementById('stop-game-btn').style.display = 'none';
        document.getElementById('stream-status').style.display = 'none';
      }
    });

    s.on('chat:message', ({ user, text }) => {
      chatMsg(user.username, text);
    });

    s.on('friend:invite:recv', ({ from, roomCode }) => {
      App._showInvitation(from, roomCode);
    });

    s.on('error', (msg) => toast(msg, 'error'));
  },

  // ── Lobby ────────────────────────────────────────────────────────────────

  refreshRooms() {
    if (State.socket) State.socket.emit('room:list');
  },

  _renderRooms(rooms) {
    const list = document.getElementById('rooms-list');
    if (!rooms || rooms.length === 0) {
      list.innerHTML = '<div class="empty-state">Aucune room ouverte pour l\'instant.</div>';
      return;
    }
    list.innerHTML = rooms.map(r => `
      <div class="room-card" onclick="App.joinRoom('${r.code}')">
        <div>
          <div class="room-name">${esc(r.name)}</div>
          <div class="room-meta">Host: ${esc(r.hostName)} · ${r.currentPlayers}/${r.maxPlayers} joueurs</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="room-code">${r.code}</span>
          <span class="badge badge-${r.status === 'waiting' ? 'waiting' : 'playing'}">
            ${r.status === 'waiting' ? 'Ouvert' : 'En jeu'}
          </span>
        </div>
      </div>
    `).join('');
  },

  showCreateModal() {
    document.getElementById('create-modal').classList.add('active');
    document.getElementById('new-room-name').focus();
  },

  hideCreateModal() {
    document.getElementById('create-modal').classList.remove('active');
    document.getElementById('create-room-error').textContent = '';
  },

  createRoom() {
    const name = document.getElementById('new-room-name').value.trim();
    const maxPlayers = document.getElementById('new-room-max').value;
    if (!name) { document.getElementById('create-room-error').textContent = 'Donne un nom à la room.'; return; }
    State.socket.emit('room:create', { name, maxPlayers: parseInt(maxPlayers) });
    App.hideCreateModal();
  },

  joinByCode() {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (!code) { toast('Entre un code de room.', 'error'); return; }
    App.joinRoom(code);
  },

  joinRoom(code) {
    State.socket.emit('room:join', { code });
  },

  sendInvite() {
    const target = document.getElementById('invite-username').value.trim();
    const code   = document.getElementById('invite-room-code').value.trim().toUpperCase();
    if (!target || !code) { toast('Remplis les deux champs d\'invitation.', 'error'); return; }
    State.socket.emit('friend:invite', { targetUsername: target, roomCode: code });
    toast(`Invitation envoyée à ${target} !`, 'success');
  },

  _showInvitation(from, roomCode) {
    const list = document.getElementById('invite-list');
    const el = document.createElement('div');
    el.style.cssText = 'margin-bottom:8px;padding:8px;background:var(--bg3);border-radius:6px;border:1px solid var(--border)';
    el.innerHTML = `
      <div style="margin-bottom:6px"><b>${esc(from)}</b> t'invite dans sa room</div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-primary" style="flex:1;font-size:12px;padding:5px" onclick="App.joinRoom('${roomCode}');this.closest('div[style]').remove()">Rejoindre</button>
        <button class="btn btn-secondary" style="font-size:12px;padding:5px" onclick="this.closest('div[style]').remove()">✕</button>
      </div>
    `;
    if (list.textContent === 'Aucune invitation') list.textContent = '';
    list.appendChild(el);
    toast(`Invitation reçue de ${from} !`, 'info');
  },

  // ── Room ─────────────────────────────────────────────────────────────────

  _enterRoom(room) {
    document.getElementById('room-name-display').textContent = room.name;
    document.getElementById('room-code-display').textContent = room.code;

    const isHost = State.isHost;
    document.getElementById('room-role-badge').textContent = isHost ? '👑 Host' : '🎮 Client';
    document.getElementById('host-controls').style.display   = isHost ? 'flex' : 'none';
    document.getElementById('client-controls').style.display = isHost ? 'none' : 'flex';

    // Pre-fill game path if saved
    bridge.configGet('gamePath').then(p => {
      if (p) document.getElementById('game-path-input').value = p;
    });

    App._updatePlayersUI(room.members);

    // Clear chat
    document.getElementById('chat-messages').innerHTML = '';
    chatMsg('', `Bienvenue dans la room "${room.name}" ! Code: ${room.code}`, true);

    showPage('page-room');
  },

  _exitRoom() {
    State.currentRoom = null;
    State.isHost = false;
    State.hostSocketId = null;
    App._stopAllStreaming();
    document.getElementById('chat-messages').innerHTML = '';
    showPage('page-lobby');
    App.refreshRooms();
  },

  leaveRoom() {
    State.socket.emit('room:leave');
    App._exitRoom();
  },

  deleteRoom() {
    if (!State.isHost) return;
    if (!confirm('Supprimer la room ? Tous les joueurs seront déconnectés.')) return;
    State.socket.emit(SOCKET_EVENTS.ROOM_DELETE);
  },

  _updatePlayersUI(members) {
    const isHost = State.isHost;
    const hostId = State.currentRoom?.hostId;
    
    document.getElementById('players-list').innerHTML = members.map(m => {
      const isSelf = (m.id === State.user.id);
      const mIsHost = (m.id === hostId);
      
      // If host, show toggles for OTHER players
      let permsHtml = '';
      if (isHost && !mIsHost) {
        permsHtml = `
          <div class="player-perms">
            <button class="perm-btn ${m.permissions?.keyboard ? 'active' : ''}" onclick="App.togglePerm('${m.socketId}', 'keyboard')" title="Clavier"><i data-lucide="keyboard"></i></button>
            <button class="perm-btn ${m.permissions?.mouse ? 'active' : ''}" onclick="App.togglePerm('${m.socketId}', 'mouse')" title="Souris"><i data-lucide="mouse-pointer-2"></i></button>
            <button class="perm-btn ${m.permissions?.gamepad ? 'active' : ''}" onclick="App.togglePerm('${m.socketId}', 'gamepad')" title="Manette"><i data-lucide="gamepad-2"></i></button>
          </div>
        `;
      } else if (!mIsHost) {
        // Just indicators for non-hosts
        permsHtml = `
          <div class="player-perms indicators">
             <span class="perm-val ${m.permissions?.keyboard ? 'active' : ''}"><i data-lucide="keyboard"></i></span>
             <span class="perm-val ${m.permissions?.mouse ? 'active' : ''}"><i data-lucide="mouse-pointer-2"></i></span>
             <span class="perm-val ${m.permissions?.gamepad ? 'active' : ''}"><i data-lucide="gamepad-2"></i></span>
          </div>
        `;
      }

      return `
        <div class="player-item">
          <div class="player-avatar">${esc(m.username[0].toUpperCase())}</div>
          <span>${esc(m.username)}</span>
          ${mIsHost ? '<span class="crown" title="Host"><i data-lucide="crown"></i></span>' : ''}
          ${permsHtml}
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
    
    // Start gamepad polling if we are a viewer
    if (!State.isHost) {
      App._startGamepadCapture();
    }
  },

  _startGamepadCapture() {
    if (State.gamepadInterval) clearInterval(State.gamepadInterval);
    
    // Virtual Gamepad state (for keyboard emulation)
    State.virtualGamepad = State.virtualGamepad || {
      buttons: Array(16).fill(false),
      axes: [0, 0, 0, 0] // LX, LY, RX, RY
    };

    State.gamepadInterval = setInterval(() => {
      let gpState = null;
      
      // 1. Check physical gamepads first
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (gp) {
          gpState = {
            buttons: gp.buttons.map(b => ({ pressed: b.pressed, value: b.value })),
            axes: gp.axes
          };
          break;
        }
      }

      // 2. If no physical gamepad, use keyboard emulation (if enabled)
      if (!gpState && State.useGamepadEmulation) {
        gpState = {
          buttons: State.virtualGamepad.buttons.map(p => ({ pressed: p, value: p ? 1 : 0 })),
          axes: State.virtualGamepad.axes
        };
      }
      
      if (gpState) {
        State.socket.emit('input:forward', {
          hostSocketId: State.currentRoom.hostSocketId,
          input: { type: 'gamepad', state: gpState }
        });
      }
    }, 16); 

    // Keyboard listener for emulation (only once)
    if (!window._padEmuRegistered) {
      window._padEmuRegistered = true;
      window.addEventListener('keydown', (e) => App._onEmuKey(e, true));
      window.addEventListener('keyup', (e) => App._onEmuKey(e, false));
    }
  },

  _onEmuKey(e, isDown) {
    if (!State.useGamepadEmulation || State.isHost) return;
    if (!State.virtualGamepad) return;

    const k = e.code;
    const v = State.virtualGamepad;
    
    // Mapping keys to buttons/axes
    // Buttons: 0:A (Space), 1:B (E), 2:X (Q), 3:Y (R)
    if (k === 'Space') v.buttons[0] = isDown;
    if (k === 'KeyE')   v.buttons[1] = isDown;
    if (k === 'KeyQ')   v.buttons[2] = isDown;
    if (k === 'KeyR')   v.buttons[3] = isDown;
    
    // Sticks: WASD -> LX/LY
    if (k === 'KeyW') v.axes[1] = isDown ? -1 : 0;
    if (k === 'KeyS') v.axes[1] = isDown ? 1 : 0;
    if (k === 'KeyA') v.axes[0] = isDown ? -1 : 0;
    if (k === 'KeyD') v.axes[0] = isDown ? 1 : 0;
  },

  togglePerm(targetSocketId, device) {
    if (!State.isHost) return;
    State.socket.emit('room:player:permission', { targetSocketId, device });
  },

  sendChat() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    State.socket.emit('chat:send', { text });
    input.value = '';
  },

  // ── Game ─────────────────────────────────────────────────────────────────

  async startGame() {
    const pathInput = document.getElementById('game-path-input').value.trim();
    if (pathInput) await bridge.configSet('gamePath', pathInput);

    // Notify everyone in the room that the game is starting
    State.socket.emit('room:game:start');

    // Launch the game
    const result = await bridge.launchGame(pathInput || null);
    if (!result.success) {
      toast(`Impossible de lancer le jeu : ${result.error}`, 'error');
      document.getElementById('start-game-btn').disabled = false;
      return;
    }
    document.getElementById('start-game-btn').style.display = 'none';
    document.getElementById('stop-game-btn').style.display = 'block';
    
    toast('NBA 2K14 lancé ! Le stream va démarrer...', 'success');

    // Give the game a few seconds to start, then start capturing
    setTimeout(() => App._hostStartStreaming(), 3000);
  },

  stopGame() {
    if (!State.isHost) return;
    State.socket.emit('room:game:stop');
    App._stopAllStreaming();
  },

  // ── Streaming (HOST) ──────────────────────────────────────────────────────

  async _hostStartStreaming() {
    await loadStreamingModules();

    const sources = await bridge.getCaptureSources();
    if (!sources || sources.length === 0) {
      toast('Aucune source de capture trouvée.', 'error');
      return;
    }

    // PRIORITÉ : On capture l'écran entier (Screen) car c'est beaucoup plus robuste
    // pour les jeux comme NBA 2K14 qui bloquent la capture de fenêtre individuelle.
    let source = sources.find(s => s.id.startsWith('screen:'));

    // Si on ne trouve pas l'écran pour une raison x, on cherche la fenêtre du jeu
    if (!source) {
      source = sources.find(s => {
        const name = s.name.toLowerCase();
        return name.includes('nba') || name.includes('2k') || name.includes('nba2k14');
      });
    }

    if (!source) source = sources[0];

    console.log('[Host] Source sélectionnée pour capture :', source.name, '(' + source.id + ')');

    // Find the game window as a separate audio source (per-process loopback)
    const audioSource = sources.find(s => {
      if (s.id.startsWith('screen:')) return false;
      const name = s.name.toLowerCase();
      return name.includes('nba') || name.includes('2k14') || name.includes('nba2k');
    });
    if (audioSource) {
      console.log('[Host] Source audio jeu :', audioSource.name, '(' + audioSource.id + ')');
    } else {
      console.log('[Host] Fenêtre NBA 2K14 non détectée — fallback sur audio système');
    }

    State.hostStreamer = new HostStreamer(State.socket);

    State.hostStreamer.onInput((input) => {
      // Received input from a viewer – simulate it on this machine
      App._simulateInput(input);
    });

    try {
      await State.hostStreamer.startCapture(source.id, audioSource?.id ?? null);
      document.getElementById('stream-status').style.display = 'flex';
      document.getElementById('stream-status-text').textContent = 'Stream actif – en attente des joueurs';
      toast('Stream démarré ! Les clients peuvent se connecter.', 'success');
    } catch (err) {
      toast(`Erreur capture écran : ${err.message}`, 'error');
      console.error('[Host] Capture error:', err);
    }
  },

  _simulateInput(input) {
    if (input.type === 'keyboard') {
      bridge.sendKeyboard({ type: input.subtype, key: input.key });
    } else if (input.type === 'mouse') {
      bridge.sendMouse({ type: input.subtype, x: input.x, y: input.y, button: input.button });
    } else if (input.type === 'gamepad' && input.subtype === 'state' && input.state) {
      bridge.sendGamepad(input.state);
    }
  },

  // ── Streaming (VIEWER) ────────────────────────────────────────────────────
  async requestStream() {
    const btn = document.getElementById('connect-stream-btn');
    if (btn.disabled && btn.textContent === 'Connexion...') return;
    btn.disabled = true;

    await loadStreamingModules();

    const videoEl = document.getElementById('stream-video');
    State.viewerStreamer = new ViewerStreamer(State.socket, videoEl);

    State.viewerStreamer.onStateChange((state) => {
      const dot  = document.getElementById('stream-connect-dot');
      const text = document.getElementById('stream-connect-text');
      if (state === 'connected') {
        dot.className = 'status-dot green';
        text.textContent = 'Stream connecté !';
        document.getElementById('stream-container').classList.add('active');
        App._startInputCapture();
        toast('Stream connecté !', 'success');
      } else if (state === 'connecting') {
        dot.className = 'status-dot orange';
        text.textContent = 'Connexion...';
      } else if (state === 'closed' || state === 'failed') {
        dot.className = 'status-dot red';
        text.textContent = 'Stream déconnecté';
        document.getElementById('stream-container').classList.remove('active');
        document.getElementById('connect-stream-btn').disabled = false;
        App._stopInputCapture();
      }
    });

    // Connect to host — host socket id is resolved via signaling
    // We use the room to broadcast the request, the host (who registered the handler) will respond
    if (!State.hostSocketId) {
      toast('Socket ID du host inconnu – réessaie.', 'error');
      return;
    }
    State.viewerStreamer.connect(State.hostSocketId);
    document.getElementById('stream-connect-text').textContent = 'Connexion...';
  },

  toggleFullscreen() {
    const container = document.getElementById('stream-container');
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen().catch(err => {
        console.warn('[Stream] Fullscreen failed:', err.message);
      });
    }
  },

  _startInputCapture() {
    if (!State.inputHandler) {
      State.inputHandler = new InputHandler();
    }
    State.inputHandler.onInput((input) => {
      if (State.viewerStreamer) State.viewerStreamer.sendInput(input);
    });
    State.inputHandler.start();

    // Escape: exit fullscreen if active, otherwise stop stream entirely
    State._escHandler = (e) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) return; // browser exits fullscreen natively
        App.stopStream();
      }
    };
    window.addEventListener('keydown', State._escHandler);
  },

  _stopInputCapture() {
    if (State.inputHandler) { State.inputHandler.stop(); }
    if (State._escHandler) {
      window.removeEventListener('keydown', State._escHandler);
      State._escHandler = null;
    }
  },

  stopStream() {
    document.getElementById('stream-container').classList.remove('active');
    if (State.viewerStreamer) { State.viewerStreamer.stop(); State.viewerStreamer = null; }
    App._stopInputCapture();
    toast('Stream arrêté.', 'info');
  },

  _stopAllStreaming() {
    if (State.hostStreamer)   { State.hostStreamer.stop();   State.hostStreamer = null; }
    if (State.viewerStreamer) { State.viewerStreamer.stop(); State.viewerStreamer = null; }
    App._stopInputCapture();
    document.getElementById('stream-container').classList.remove('active');
    document.getElementById('stream-status').style.display = 'none';
  },

  // ── Settings ──────────────────────────────────────────────────────────────

  async settings() {
    const serverUrl = await bridge.configGet('serverUrl') || State.serverUrl;
    const gamePath  = await bridge.configGet('gamePath') || '';
    document.getElementById('settings-server-url').value = serverUrl;
    document.getElementById('settings-game-path').value  = gamePath;
    document.getElementById('settings-modal').classList.add('active');
  },

  hideSettings() {
    document.getElementById('settings-modal').classList.remove('active');
  },

  async saveSettings() {
    const url  = document.getElementById('settings-server-url').value.trim();
    const game = document.getElementById('settings-game-path').value.trim();
    if (url)  await bridge.configSet('serverUrl', url);
    if (game) await bridge.configSet('gamePath', game);
    State.serverUrl = normalizeUrl(url) || State.serverUrl;
    document.getElementById('game-path-input').value = game;
    App.hideSettings();
    toast('Paramètres sauvegardés.', 'success');
  },
};

// Expose App globally for onclick handlers
window.App = App;

// ═══════════════════════════════════════════════════════════════════════════════
// MOD MANAGER
// ═══════════════════════════════════════════════════════════════════════════════
const Mods = {
  _all:      [],       // full list from server
  _cat:      'Tous',   // active category filter
  _installed: {},      // { modId: true } persisted in electron-store

  async open() {
    document.getElementById('mods-overlay').classList.add('active');
    await this._loadInstalled();
    await this.refresh();
  },

  close() {
    document.getElementById('mods-overlay').classList.remove('active');
  },

  async _loadInstalled() {
    try {
      const raw = await bridge.configGet('installedMods');
      this._installed = raw || {};
    } catch { this._installed = {}; }
  },

  async _saveInstalled() {
    await bridge.configSet('installedMods', this._installed);
  },

  async refresh() {
    const grid = document.getElementById('mods-grid');
    grid.innerHTML = '<div class="mods-loading"><div class="mods-spinner"></div><span>Chargement…</span></div>';

    try {
      const res  = await fetch(`${State.serverUrl}/api/mods`);
      const data = await res.json();
      this._all  = data.mods || [];
    } catch (e) {
      grid.innerHTML = `<div class="mods-empty">Impossible de contacter le serveur.<br><small>${e.message}</small></div>`;
      return;
    }

    // Update subtitle
    document.getElementById('mods-subtitle').textContent =
      `${this._all.length} mod${this._all.length !== 1 ? 's' : ''} disponible${this._all.length !== 1 ? 's' : ''}.`;

    // Build category filter pills
    const cats = ['Tous', ...new Set(this._all.map(m => m.category || 'Autres'))];
    const filtersEl = document.getElementById('mods-filters');
    filtersEl.innerHTML = cats.map(c =>
      `<button class="mods-filter-btn${c === this._cat ? ' active' : ''}" data-cat="${c}" onclick="Mods.filterCat(this)">${c}</button>`
    ).join('');

    this._render();
  },

  filterCat(btn) {
    this._cat = btn.dataset.cat;
    document.querySelectorAll('.mods-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === this._cat));
    this._render();
  },

  _render() {
    const grid = document.getElementById('mods-grid');
    const list = this._cat === 'Tous'
      ? this._all
      : this._all.filter(m => (m.category || 'Autres') === this._cat);

    if (!list.length) {
      grid.innerHTML = '<div class="mods-empty">Aucun mod dans cette catégorie.</div>';
      return;
    }

    grid.innerHTML = list.map(mod => {
      const isInstalled = !!this._installed[mod.id];
      const thumb = mod.imageUrl
        ? `<img class="mod-thumbnail" src="${mod.imageUrl}" alt="${mod.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          + `<div class="mod-thumb-placeholder" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`
        : `<div class="mod-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>`;

      const btnClass = isInstalled ? 'mod-install-btn installed' : 'mod-install-btn';
      const btnLabel = isInstalled
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Installé'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Installer';

      return `
        <div class="mod-card" id="mod-${mod.id}">
          ${thumb}
          <div class="mod-info">
            <div class="mod-category">${mod.category || 'Autres'}</div>
            <div class="mod-name">${mod.name}</div>
            ${mod.description ? `<div class="mod-desc">${mod.description}</div>` : ''}
          </div>
          <div class="mod-footer">
            <button class="${btnClass}" id="modbtn-${mod.id}" onclick="Mods.install('${mod.id}')">${btnLabel}</button>
          </div>
        </div>`;
    }).join('');
  },

  async install(modId) {
    const mod = this._all.find(m => m.id === modId);
    if (!mod) return;

    const btn = document.getElementById(`modbtn-${modId}`);
    if (!btn) return;

    // Already installed — show confirm to reinstall
    if (this._installed[modId]) {
      if (!confirm(`"${mod.name}" est déjà installé. Réinstaller ?`)) return;
    }

    // Check game path
    const gamePath = await bridge.configGet('gamePath');
    if (!gamePath) {
      toast('Configure le chemin de NBA 2K14 dans Paramètres avant d\'installer un mod.', 'error');
      return;
    }

    // Show installing state
    btn.disabled  = true;
    btn.className = 'mod-install-btn installing';
    btn.innerHTML = '<div class="mods-spinner" style="width:12px;height:12px;border-width:1.5px"></div> Installation…';

    const result = await bridge.installMod({
      downloadUrl:  mod.downloadUrl,
      gameFilePath: mod.gameFilePath,
      serverUrl:    State.serverUrl,
    });

    if (result.success) {
      this._installed[modId] = true;
      await this._saveInstalled();
      btn.disabled  = false;
      btn.className = 'mod-install-btn installed';
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Installé';
      toast(`"${mod.name}" installé avec succès !`, 'success');
    } else {
      btn.disabled  = false;
      btn.className = this._installed[modId] ? 'mod-install-btn installed' : 'mod-install-btn';
      btn.innerHTML = this._installed[modId]
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Installé'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Installer';
      toast(`Erreur : ${result.error}`, 'error');
    }
  },
};

window.Mods = Mods;

// ── Game Library ─────────────────────────────────────────────────────────────
const Games = {
  _all: [],
  _installed: {},  // { [id]: { installPath, version } }

  async open() {
    document.getElementById('games-overlay').classList.add('active');
    await this._loadInstalled();
    await this.refresh();
    bridge.onGameProgress((data) => this._onProgress(data.id, data.percent));
  },

  close() {
    document.getElementById('games-overlay').classList.remove('active');
    bridge.offGameProgress();
  },

  async _loadInstalled() {
    this._installed = await bridge.configGet('installedGames') || {};
  },

  async _saveInstalled() {
    await bridge.configSet('installedGames', this._installed);
  },

  async refresh() {
    const serverUrl = (State.serverUrl || await bridge.configGet('serverUrl') || 'http://localhost:3000').replace(/\/$/, '');
    const grid = document.getElementById('games-grid');
    grid.innerHTML = '<div class="mods-loading"><div class="mods-spinner"></div><span>Chargement…</span></div>';
    try {
      const res  = await fetch(`${serverUrl}/api/games`);
      const data = await res.json();
      this._all  = data.games || [];
      document.getElementById('games-subtitle').textContent =
        this._all.length === 0
          ? 'Aucun jeu disponible pour l\'instant.'
          : `${this._all.length} jeu${this._all.length > 1 ? 'x' : ''} disponible${this._all.length > 1 ? 's' : ''}.`;
      this._render();
    } catch (e) {
      grid.innerHTML = `<div class="mods-loading" style="color:var(--red)">Erreur : ${e.message}</div>`;
    }
  },

  _render() {
    const grid = document.getElementById('games-grid');
    if (!this._all.length) {
      grid.innerHTML = '<div class="mods-loading" style="opacity:.5">Aucun jeu disponible.</div>';
      return;
    }
    grid.innerHTML = this._all.map(g => {
      const inst        = this._installed[g.id];
      const isInstalled = !!inst;
      const coverStyle  = g.coverUrl ? `background-image:url('${g.coverUrl}')` : '';
      return `
      <div class="game-card ${isInstalled ? 'installed' : ''}" data-id="${g.id}">
        <div class="game-card-cover" style="${coverStyle}"></div>
        <div class="game-card-progress-reveal" id="gr-reveal-${g.id}" style="${coverStyle}"></div>
        <div class="game-card-info">
          <div class="game-card-name">${g.name}</div>
          ${g.sizeLabel ? `<div class="game-card-size">${g.sizeLabel}</div>` : ''}
          <div class="game-card-progress-bar" id="gr-bar-${g.id}">
            <div class="game-card-progress-track">
              <div class="game-card-progress-fill" id="gr-fill-${g.id}"></div>
            </div>
            <span class="game-card-progress-pct" id="gr-pct-${g.id}">0%</span>
          </div>
          ${isInstalled
            ? `<button class="game-card-btn installed" onclick="Games.launch('${g.id}')">▶ Lancer</button>`
            : `<button class="game-card-btn" id="gr-btn-${g.id}" onclick="Games.install('${g.id}')">Installer</button>`
          }
        </div>
      </div>`;
    }).join('');
  },

  async install(id) {
    const game = this._all.find(g => g.id === id);
    if (!game) return;

    const installPath = await bridge.choosePath();
    if (!installPath) return;

    const btn  = document.getElementById(`gr-btn-${id}`);
    const bar  = document.getElementById(`gr-bar-${id}`);
    if (btn) { btn.disabled = true; btn.className = 'game-card-btn installing'; btn.textContent = 'Installation…'; }
    if (bar) { bar.classList.add('visible'); }

    const result = await bridge.downloadGame({ id, downloadUrl: game.downloadUrl, installPath });

    if (result.success) {
      this._installed[id] = { installPath: result.installPath, exePath: result.exePath || null, version: game.version };
      await this._saveInstalled();
      toast(`"${game.name}" installé !`, 'success');
      this._render();
    } else {
      if (btn) { btn.disabled = false; btn.className = 'game-card-btn'; btn.textContent = 'Installer'; }
      if (bar) { bar.classList.remove('visible'); }
      toast(`Erreur : ${result.error}`, 'error');
    }
  },

  _onProgress(id, percent) {
    const reveal = document.getElementById(`gr-reveal-${id}`);
    const fill   = document.getElementById(`gr-fill-${id}`);
    const pct    = document.getElementById(`gr-pct-${id}`);
    const bar    = document.getElementById(`gr-bar-${id}`);
    if (bar)    bar.classList.add('visible');
    if (reveal) reveal.style.clipPath = `inset(0 ${(100 - percent).toFixed(1)}% 0 0)`;
    if (fill)   fill.style.width = percent + '%';
    if (pct)    pct.textContent  = Math.round(percent) + '%';
  },

  async launch(id) {
    const inst = this._installed[id];
    if (!inst) return;
    const result = await bridge.launchGame(inst.exePath || inst.installPath);
    if (!result.success) toast(`Erreur : ${result.error}`, 'error');
  },
};

window.Games = Games;

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
