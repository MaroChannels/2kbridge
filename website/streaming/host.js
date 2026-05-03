/**
 * HOST streaming module (web version)
 * Uses getDisplayMedia() instead of Electron's desktopCapturer.
 */
import { ICE_SERVERS, SOCKET_EVENTS } from '../constants.js';

export class HostStreamer {
  constructor(socket) {
    this.socket = socket;
    this.peers = new Map();
    this.stream = null;
    this._onInputCb = null;
    this._listenersRegistered = false;
  }

  async startCapture() {
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 60, max: 60 },
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    for (const track of this.stream.getVideoTracks()) {
      track.contentHint = 'motion';
      // If user clicks "Stop sharing" from the browser UI, clean up
      track.onended = () => this.stop();
    }

    this._registerSocketHandlers();
    return this.stream;
  }

  async onViewerRequest(viewerSocketId) {
    if (!this.stream) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(viewerSocketId, pc);

    for (const track of this.stream.getTracks()) {
      const sender = pc.addTrack(track, this.stream);
      if (track.kind === 'video') {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0].maxBitrate    = 4_000_000;
        params.encodings[0].maxFramerate  = 60;
        params.encodings[0].networkPriority = 'high';
        sender.setParameters(params).catch(() => {});
      }
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.socket.emit(SOCKET_EVENTS.RTC_ICE, { targetSocketId: viewerSocketId, candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this._removePeer(viewerSocketId);
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.socket.emit(SOCKET_EVENTS.RTC_OFFER, { targetSocketId: viewerSocketId, offer: pc.localDescription });
  }

  async onAnswer(viewerSocketId, answer) {
    const pc = this.peers.get(viewerSocketId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async onIceCandidate(viewerSocketId, candidate) {
    const pc = this.peers.get(viewerSocketId);
    if (!pc) return;
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }

  onInput(cb) { this._onInputCb = cb; }

  _registerSocketHandlers() {
    if (this._listenersRegistered) return;
    this._listenersRegistered = true;

    this.socket.on(SOCKET_EVENTS.RTC_REQUEST, ({ fromSocketId }) => this.onViewerRequest(fromSocketId));
    this.socket.on(SOCKET_EVENTS.RTC_ANSWER,  ({ fromSocketId, answer }) => this.onAnswer(fromSocketId, answer));
    this.socket.on(SOCKET_EVENTS.RTC_ICE,     ({ fromSocketId, candidate }) => this.onIceCandidate(fromSocketId, candidate));
    this.socket.on(SOCKET_EVENTS.INPUT_FORWARD, ({ input }) => { if (this._onInputCb) this._onInputCb(input); });
  }

  _removePeer(socketId) {
    const pc = this.peers.get(socketId);
    if (pc) { pc.close(); this.peers.delete(socketId); }
  }

  stop() {
    for (const [id] of this.peers) this._removePeer(id);
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    this.socket.off(SOCKET_EVENTS.RTC_REQUEST);
    this.socket.off(SOCKET_EVENTS.RTC_ANSWER);
    this.socket.off(SOCKET_EVENTS.RTC_ICE);
    this.socket.off(SOCKET_EVENTS.INPUT_FORWARD);
    this._listenersRegistered = false;
  }
}
