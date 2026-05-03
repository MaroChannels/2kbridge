/**
 * VIEWER streaming module
 * Receives the host's WebRTC stream and displays it in a <video> element.
 */
import { ICE_SERVERS, SOCKET_EVENTS } from '../constants.js';

export class ViewerStreamer {
  constructor(socket, videoEl) {
    this.socket = socket;
    this.videoEl = videoEl;
    this.pc = null;
    this.hostSocketId = null;
    this._onStateChange = null;
    this._listenersRegistered = false;
  }

  /** Request the stream from the host */
  connect(hostSocketId) {
    this.hostSocketId = hostSocketId;
    this._registerSocketHandlers();

    // Ask the host to initiate the WebRTC offer
    this.socket.emit(SOCKET_EVENTS.RTC_REQUEST, { hostSocketId });
    console.log('[Viewer] Sent RTC_REQUEST to host', hostSocketId);
  }

  onStateChange(cb) {
    this._onStateChange = cb;
  }

  async _handleOffer(fromSocketId, offer) {
    if (fromSocketId !== this.hostSocketId) return;
    console.log('[Viewer] Got offer from host');

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Relay ICE candidates back to host
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.socket.emit(SOCKET_EVENTS.RTC_ICE, {
          targetSocketId: this.hostSocketId,
          candidate,
        });
      }
    };

    // When stream arrives, attach to video element
    this.pc.ontrack = (event) => {
      console.log('[Viewer] Got remote track');
      if (this.videoEl.srcObject !== event.streams[0]) {
        this.videoEl.srcObject = event.streams[0];
      }
      if (this._onStateChange) this._onStateChange('connected');
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      console.log('[Viewer] Connection state:', state);
      if (this._onStateChange) this._onStateChange(state);
      if (state === 'disconnected' || state === 'failed') {
        this.stop();
      }
    };

    // Accept the offer
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    this.socket.emit(SOCKET_EVENTS.RTC_ANSWER, {
      targetSocketId: this.hostSocketId,
      answer: this.pc.localDescription,
    });
  }

  async _handleIce(fromSocketId, candidate) {
    if (fromSocketId !== this.hostSocketId || !this.pc) return;
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('[Viewer] ICE candidate error:', e.message);
    }
  }

  _registerSocketHandlers() {
    if (this._listenersRegistered) return;
    this._listenersRegistered = true;
    this.socket.on(SOCKET_EVENTS.RTC_OFFER, ({ fromSocketId, offer }) => {
      this._handleOffer(fromSocketId, offer);
    });
    this.socket.on(SOCKET_EVENTS.RTC_ICE, ({ fromSocketId, candidate }) => {
      this._handleIce(fromSocketId, candidate);
    });
  }

  /** Forward a local input event to the host via socket */
  sendInput(input) {
    if (!this.hostSocketId) return;
    this.socket.emit(SOCKET_EVENTS.INPUT_FORWARD, {
      hostSocketId: this.hostSocketId,
      input,
    });
  }

  stop() {
    if (this.pc) { this.pc.close(); this.pc = null; }
    if (this.videoEl) { this.videoEl.srcObject = null; }
    this.socket.off(SOCKET_EVENTS.RTC_OFFER);
    this.socket.off(SOCKET_EVENTS.RTC_ICE);
    this.hostSocketId = null;
    this._listenersRegistered = false;
    if (this._onStateChange) this._onStateChange('closed');
  }
}
