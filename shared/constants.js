// Shared constants between server and client

const SOCKET_EVENTS = {
  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_OK: 'auth:ok',
  AUTH_ERROR: 'auth:error',

  // Rooms
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_LIST: 'room:list',
  ROOM_CREATED: 'room:created',
  ROOM_JOINED: 'room:joined',
  ROOM_UPDATED: 'room:updated',
  ROOM_MEMBER_JOINED: 'room:member:joined',
  ROOM_MEMBER_LEFT: 'room:member:left',
  ROOM_CLOSED: 'room:closed',
  ROOM_GAME_STARTED: 'room:game:started',
  ROOM_GAME_START: 'room:game:start',
  ROOM_GAME_STOP: 'room:game:stop',
  ROOM_STREAM_STOPPED: 'room:stream:stopped',
  ROOM_DELETE: 'room:delete',

  // Chat
  CHAT_MESSAGE: 'chat:message',
  CHAT_SEND: 'chat:send',

  // WebRTC signaling
  RTC_OFFER: 'rtc:offer',
  RTC_ANSWER: 'rtc:answer',
  RTC_ICE: 'rtc:ice',
  RTC_REQUEST: 'rtc:request',  // client asks host to initiate

  // Input forwarding & permissions
  INPUT_FORWARD: 'input:forward',
  PLAYER_PERMISSION_TOGGLE: 'room:player:permission',

  // Friends & invites
  FRIEND_INVITE: 'friend:invite',
  FRIEND_INVITE_RECV: 'friend:invite:recv',

  // Generic
  ERROR: 'error',
  DISCONNECT: 'disconnect',
};

const ROOM_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  CLOSED: 'closed',
};

const MAX_ROOM_PLAYERS = 4;

const SERVER_PORT = 3000;

// Free STUN servers for WebRTC ICE
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

module.exports = { SOCKET_EVENTS, ROOM_STATUS, MAX_ROOM_PLAYERS, SERVER_PORT, ICE_SERVERS };
