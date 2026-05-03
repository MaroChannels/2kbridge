/**
 * 2KBridge – Web client (Vercel)
 * Replaces bridge.* calls with localStorage, host streaming uses getDisplayMedia().
 */

let HostStreamer = null;
let ViewerStreamer = null;
let InputHandler = null;

async function loadStreamingModules() {
  if (!HostStreamer) {
    const m = await import('./streaming/host.js');
    HostStreamer = m.HostStreamer;
  }
  if (!ViewerStreamer) {
    const m = await import('./streaming/viewer.js');
    ViewerStreamer = m.ViewerStreamer;
  }
  if (!InputHandler) {
    const m = await import('./input/input-handler.js');
    InputHandler = m.InputHandler;
  }
}

// ── localStorage config (replaces bridge.configGet/Set/Delete) ──────────────
const cfg = {
  get(key)      { try { return JSON.parse(localStorage.getItem('2kb_' + key)); } catch { return null; } },
  set(key, val) { localStorage.setItem('2kb_' + key, JSON.stringify(val)); },
  del(key)      { localStorage.removeItem('2kb_' + key); },
};

// ── State ─────────────────────────────────────────────────────────────────────
const State = {
  token: null,
  user: null,
  serverUrl: '',
  socket: null,
  currentRoom: null,
  isHost: false,
  hostSocketId: null,
  hostStreamer: null,
  viewerStreamer: null,
  inputHandler: null,
  useGamepadEmulation: false,
  virtualGamepad: null,
  gamepadInterval: null,
  _escHandler: null,
};
window.State = State;

// ── Utility ───────────────────────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function chatMsg(author, text, isSystem = false) {
  const el = document.createElement('div');
  el.className = 'chat-msg' + (isSystem ? ' system' : '');
  if (!isSystem) {
    el.innerHTML = `<span class="msg-author">${esc(author)}</span><span class="msg-text">${esc(text)}</span>`;
  } else {
    el.innerHTML = `<span class="msg-text">${esc(text)}</span>`;
  }
  const c = document.getElementById('chat-messages');
  c.appendChild(el);
  c.scrollTop = c.scrollHeight;
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function normalizeUrl(raw) {
  const s = (raw || '').trim().replace(/\/$/, '');
  if (!s) return '';
  if (/^\d+$/.test(s)) return 'http://localhost:' + s;
  if (/^[\w.-]+(:\d+)?$/.test(s)) return 'http://' + s;
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    return u.origin;
  } catch { return s; }
}

async function apiPost(path, body) {
  const res = await fetch(State.serverUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json() };
}

// ── App ───────────────────────────────────────────────────────────────────────
const App = {
  async init() {
    const savedUrl   = cfg.get('serverUrl');
    const savedToken = cfg.get('token');
    const savedUser  = cfg.get('user');

    if (savedUrl) {
      State.serverUrl = normalizeUrl(savedUrl);
      document.getElementById('server-url-input').value = State.serverUrl;
    }

    document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') App.login(); });
    document.getElementById('reg-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') App.register(); });
    document.getElementById('join-code-input').addEventListener('keydown', e => { if (e.key === 'Enter') App.joinByCode(); });

    document.getElementById('server-url-input').addEventListener('change', (e) => {
      State.serverUrl = normalizeUrl(e.target.value);
      document.getElementById('server-url-input').value = State.serverUrl;
    });

    if (savedToken && savedUser && State.serverUrl) {
      State.token = savedToken;
      State.user  = savedUser;
      App.connectSocket();
    } else {
      showPage('page-login');
    }
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

    const url = normalizeUrl(document.getElementById('server-url-input').value);
    if (!url) { errEl.textContent = 'Entre l\'URL du serveur.'; return; }
    State.serverUrl = url;
    cfg.set('serverUrl', url);

    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Connexion...';
    try {
      const { ok, data } = await apiPost('/api/login', { username, password });
      if (!ok) { errEl.textContent = data.error || 'Erreur de connexion.'; return; }
      State.token = data.token;
      State.user  = data.user;
      cfg.set('token', data.token);
      cfg.set('user', data.user);
      App.connectSocket();
    } catch {
      errEl.textContent = 'Impossible de joindre le serveur (' + State.serverUrl + ').';
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

    const url = normalizeUrl(document.getElementById('server-url-input').value);
    if (!url) { errEl.textContent = 'Entre l\'URL du serveur.'; return; }
    State.serverUrl = url;
    cfg.set('serverUrl', url);

    const btn = document.getElementById('register-btn');
    btn.disabled = true; btn.textContent = 'Création...';
    try {
      const { ok, data } = await apiPost('/api/register', { username, password });
      if (!ok) { errEl.textContent = data.error || 'Erreur.'; return; }
      State.token = data.token;
      State.user  = data.user;
      cfg.set('token', data.token);
      cfg.set('user', data.user);
      App.connectSocket();
    } catch {
      errEl.textContent = 'Impossible de joindre le serveur (' + State.serverUrl + ').';
    } finally {
      btn.disabled = false; btn.textContent = 'Créer le compte';
    }
  },

  logout() {
    if (State.socket) { State.socket.disconnect(); State.socket = null; }
    cfg.del('token'); cfg.del('user');
    State.token = null; State.user = null; State.currentRoom = null;
    showPage('page-login');
  },

  // ── Socket ──────────────────────────────────────────────────────────────────
  connectSocket() {
    if (!window.io) { toast('socket.io non chargé.', 'error'); return; }

    State.socket = window.io(State.serverUrl, {
      auth: { token: State.token },
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    State.socket.on('connect', () => {
      showPage('page-lobby');
      document.getElementById('lobby-username').textContent = State.user.username;
      App.refreshRooms();
      toast('Connecté en tant que ' + State.user.username, 'success');
    });

    State.socket.on('connect_error', (err) => {
      toast('Connexion échouée : ' + err.message, 'error');
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
    s.on('room:created', (room) => { State.currentRoom = room; State.isHost = true; App._enterRoom(room); });
    s.on('room:joined',  (room) => { State.currentRoom = room; State.isHost = (room.hostId === State.user.id); App._enterRoom(room); });
    s.on('room:updated', (room) => { State.currentRoom = room; App._updatePlayersUI(room.members); });
    s.on('room:member:joined', ({ user, room }) => {
      State.currentRoom = room;
      App._updatePlayersUI(room.members);
      chatMsg('', user.username + ' a rejoint la room.', true);
    });
    s.on('room:member:left', ({ room }) => {
      State.currentRoom = room;
      App._updatePlayersUI(room.members);
      chatMsg('', 'Un joueur a quitté la room.', true);
    });
    s.on('room:closed', () => { toast('La room a été fermée.', 'error'); App._exitRoom(); });

    s.on('room:game:started', ({ hostSocketId }) => {
      State.hostSocketId = hostSocketId;
      chatMsg('', 'Le stream a démarré !', true);
      if (State.isHost) {
        App._hostStartStreaming();
      } else {
        document.getElementById('connect-stream-btn').disabled = false;
        document.getElementById('stream-connect-text').textContent = 'Prêt – clique pour connecter';
        document.getElementById('stream-connect-dot').className = 'status-dot orange';
      }
    });

    s.on('room:stream:stopped', () => {
      chatMsg('', 'Le stream a été arrêté.', true);
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

    s.on('chat:message', ({ user, text }) => chatMsg(user.username, text));
    s.on('friend:invite:recv', ({ from, roomCode }) => App._showInvitation(from, roomCode));
    s.on('error', (msg) => toast(msg, 'error'));
  },

  // ── Lobby ────────────────────────────────────────────────────────────────────
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
    if (!target || !code) { toast('Remplis les deux champs.', 'error'); return; }
    State.socket.emit('friend:invite', { targetUsername: target, roomCode: code });
    toast('Invitation envoyée à ' + target + ' !', 'success');
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
    toast('Invitation reçue de ' + from + ' !', 'info');
  },

  // ── Room ──────────────────────────────────────────────────────────────────────
  _enterRoom(room) {
    document.getElementById('room-name-display').textContent = room.name;
    document.getElementById('room-code-display').textContent = room.code;

    const isHost = State.isHost;
    document.getElementById('room-role-badge').textContent   = isHost ? '👑 Host' : '🎮 Client';
    document.getElementById('host-controls').style.display   = isHost ? 'flex' : 'none';
    document.getElementById('client-controls').style.display = isHost ? 'none' : 'flex';

    App._updatePlayersUI(room.members);
    document.getElementById('chat-messages').innerHTML = '';
    chatMsg('', 'Bienvenue dans la room "' + room.name + '" ! Code: ' + room.code, true);
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
    State.socket.emit('room:delete');
  },

  _updatePlayersUI(members) {
    const isHost = State.isHost;
    const hostId = State.currentRoom?.hostId;

    document.getElementById('players-list').innerHTML = members.map(m => {
      const mIsHost = (m.id === hostId);
      let permsHtml = '';
      if (isHost && !mIsHost) {
        permsHtml = `
          <div class="player-perms">
            <button class="perm-btn ${m.permissions?.keyboard ? 'active' : ''}" onclick="App.togglePerm('${m.socketId}', 'keyboard')" title="Clavier"><i data-lucide="keyboard"></i></button>
            <button class="perm-btn ${m.permissions?.mouse ? 'active' : ''}" onclick="App.togglePerm('${m.socketId}', 'mouse')" title="Souris"><i data-lucide="mouse-pointer-2"></i></button>
            <button class="perm-btn ${m.permissions?.gamepad ? 'active' : ''}" onclick="App.togglePerm('${m.socketId}', 'gamepad')" title="Manette"><i data-lucide="gamepad-2"></i></button>
          </div>`;
      } else if (!mIsHost) {
        permsHtml = `
          <div class="player-perms indicators">
            <span class="perm-val ${m.permissions?.keyboard ? 'active' : ''}"><i data-lucide="keyboard"></i></span>
            <span class="perm-val ${m.permissions?.mouse ? 'active' : ''}"><i data-lucide="mouse-pointer-2"></i></span>
            <span class="perm-val ${m.permissions?.gamepad ? 'active' : ''}"><i data-lucide="gamepad-2"></i></span>
          </div>`;
      }

      return `
        <div class="player-item">
          <div class="player-avatar">${esc(m.username[0].toUpperCase())}</div>
          <span>${esc(m.username)}</span>
          ${mIsHost ? '<span class="crown" title="Host"><i data-lucide="crown"></i></span>' : ''}
          ${permsHtml}
        </div>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    if (!State.isHost) App._startGamepadCapture();
  },

  _startGamepadCapture() {
    if (State.gamepadInterval) clearInterval(State.gamepadInterval);

    State.virtualGamepad = State.virtualGamepad || {
      buttons: Array(16).fill(false),
      axes: [0, 0, 0, 0],
    };

    State.gamepadInterval = setInterval(() => {
      let gpState = null;
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (gp) {
          gpState = {
            buttons: gp.buttons.map(b => ({ pressed: b.pressed, value: b.value })),
            axes: Array.from(gp.axes),
          };
          break;
        }
      }
      if (!gpState && State.useGamepadEmulation) {
        gpState = {
          buttons: State.virtualGamepad.buttons.map(p => ({ pressed: p, value: p ? 1 : 0 })),
          axes: State.virtualGamepad.axes,
        };
      }
      if (gpState && State.currentRoom) {
        State.socket.emit('input:forward', {
          hostSocketId: State.currentRoom.hostSocketId,
          input: { type: 'gamepad', state: gpState },
        });
      }
    }, 16);

    if (!window._padEmuRegistered) {
      window._padEmuRegistered = true;
      window.addEventListener('keydown', (e) => App._onEmuKey(e, true));
      window.addEventListener('keyup',   (e) => App._onEmuKey(e, false));
    }
  },

  _onEmuKey(e, isDown) {
    if (!State.useGamepadEmulation || State.isHost || !State.virtualGamepad) return;
    const k = e.code;
    const v = State.virtualGamepad;
    if (k === 'Space') v.buttons[0] = isDown;
    if (k === 'KeyE')  v.buttons[1] = isDown;
    if (k === 'KeyQ')  v.buttons[2] = isDown;
    if (k === 'KeyR')  v.buttons[3] = isDown;
    if (k === 'KeyW')  v.axes[1] = isDown ? -1 : 0;
    if (k === 'KeyS')  v.axes[1] = isDown ? 1 : 0;
    if (k === 'KeyA')  v.axes[0] = isDown ? -1 : 0;
    if (k === 'KeyD')  v.axes[0] = isDown ? 1 : 0;
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

  // ── Host streaming ─────────────────────────────────────────────────────────
  async startGame() {
    State.socket.emit('room:game:start');
    document.getElementById('start-game-btn').style.display = 'none';
    document.getElementById('stop-game-btn').style.display = 'block';
    toast('Sélectionne la fenêtre à partager…', 'info');
    // slight delay so button state updates visually first
    setTimeout(() => App._hostStartStreaming(), 300);
  },

  stopGame() {
    if (!State.isHost) return;
    State.socket.emit('room:game:stop');
    App._stopAllStreaming();
  },

  async _hostStartStreaming() {
    await loadStreamingModules();
    State.hostStreamer = new HostStreamer(State.socket);
    State.hostStreamer.onInput(() => {
      // Input injection needs 2KBridge.exe — not available in browser
    });

    try {
      await State.hostStreamer.startCapture();
      document.getElementById('stream-status').style.display = 'flex';
      document.getElementById('stream-status-text').textContent = 'Stream actif – en attente des joueurs';
      toast('Stream démarré ! Les clients peuvent se connecter.', 'success');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        toast('Partage d\'écran refusé par le navigateur.', 'error');
      } else {
        toast('Erreur stream : ' + err.message, 'error');
      }
      document.getElementById('start-game-btn').style.display = 'block';
      document.getElementById('start-game-btn').disabled = false;
      document.getElementById('stop-game-btn').style.display = 'none';
    }
  },

  // ── Viewer streaming ────────────────────────────────────────────────────────
  async requestStream() {
    const btn = document.getElementById('connect-stream-btn');
    if (btn.disabled && btn.textContent.includes('Connexion')) return;
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

    if (!State.hostSocketId) { toast('Socket ID du host inconnu.', 'error'); return; }
    State.viewerStreamer.connect(State.hostSocketId);
    document.getElementById('stream-connect-text').textContent = 'Connexion...';
  },

  _startInputCapture() {
    if (!State.inputHandler) State.inputHandler = new InputHandler();
    State.inputHandler.onInput((input) => {
      if (State.viewerStreamer) State.viewerStreamer.sendInput(input);
    });
    State.inputHandler.start();
    State._escHandler = (e) => { if (e.key === 'Escape') App.stopStream(); };
    window.addEventListener('keydown', State._escHandler);
  },

  _stopInputCapture() {
    if (State.inputHandler) State.inputHandler.stop();
    if (State._escHandler) {
      window.removeEventListener('keydown', State._escHandler);
      State._escHandler = null;
    }
  },

  stopStream() {
    document.getElementById('stream-container').classList.remove('active');
    if (State.viewerStreamer) { State.viewerStreamer.stop(); State.viewerStreamer = null; }
    App._stopInputCapture();
  },

  _stopAllStreaming() {
    if (State.hostStreamer)   { State.hostStreamer.stop();   State.hostStreamer = null; }
    if (State.viewerStreamer) { State.viewerStreamer.stop(); State.viewerStreamer = null; }
    App._stopInputCapture();
    document.getElementById('stream-container').classList.remove('active');
    document.getElementById('stream-status').style.display = 'none';
  },

  // ── Settings ─────────────────────────────────────────────────────────────────
  settings() {
    document.getElementById('settings-server-url').value = State.serverUrl || cfg.get('serverUrl') || '';
    document.getElementById('settings-modal').classList.add('active');
  },

  hideSettings() {
    document.getElementById('settings-modal').classList.remove('active');
  },

  saveSettings() {
    const url = document.getElementById('settings-server-url').value.trim();
    if (url) {
      const norm = normalizeUrl(url);
      cfg.set('serverUrl', norm);
      State.serverUrl = norm;
    }
    App.hideSettings();
    toast('Paramètres sauvegardés.', 'success');
  },
};
window.App = App;

// ── Mod Manager ───────────────────────────────────────────────────────────────
const Mods = {
  _all: [],
  _cat: 'Tous',

  async open() {
    document.getElementById('mods-overlay').classList.add('active');
    await this.refresh();
  },

  close() {
    document.getElementById('mods-overlay').classList.remove('active');
  },

  async refresh() {
    const grid = document.getElementById('mods-grid');
    grid.innerHTML = '<div class="mods-loading"><div class="mods-spinner"></div><span>Chargement…</span></div>';
    try {
      const res  = await fetch(State.serverUrl + '/api/mods');
      const data = await res.json();
      this._all  = data.mods || [];
    } catch (e) {
      grid.innerHTML = `<div class="mods-empty">Impossible de contacter le serveur.<br><small>${e.message}</small></div>`;
      return;
    }
    document.getElementById('mods-subtitle').textContent =
      this._all.length + ' mod' + (this._all.length !== 1 ? 's' : '') + ' disponible' + (this._all.length !== 1 ? 's' : '') + '.';

    const cats = ['Tous', ...new Set(this._all.map(m => m.category || 'Autres'))];
    document.getElementById('mods-filters').innerHTML = cats.map(c =>
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
    const list = this._cat === 'Tous' ? this._all : this._all.filter(m => (m.category || 'Autres') === this._cat);
    const grid = document.getElementById('mods-grid');
    if (!list.length) { grid.innerHTML = '<div class="mods-empty">Aucun mod dans cette catégorie.</div>'; return; }

    grid.innerHTML = list.map(mod => {
      const thumb = mod.imageUrl
        ? `<img class="mod-thumbnail" src="${mod.imageUrl}" alt="${mod.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="mod-thumb-placeholder" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/></svg></div>`
        : `<div class="mod-thumb-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/></svg></div>`;

      return `
        <div class="mod-card">
          ${thumb}
          <div class="mod-info">
            <div class="mod-category">${mod.category || 'Autres'}</div>
            <div class="mod-name">${mod.name}</div>
            ${mod.description ? `<div class="mod-desc">${mod.description}</div>` : ''}
          </div>
          <div class="mod-footer">
            <button class="mod-install-btn" disabled title="Nécessite l'app 2KBridge.exe">
              🖥 App requise
            </button>
          </div>
        </div>`;
    }).join('');
  },
};
window.Mods = Mods;

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
