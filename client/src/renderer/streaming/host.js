/**
 * HOST streaming module
 * Captures the screen via Electron desktopCapturer and streams it to
 * each viewer via WebRTC peer connections.
 */
import { ICE_SERVERS, SOCKET_EVENTS } from '../constants.js';

export class HostStreamer {
  constructor(socket) {
    this.socket = socket;
    // Map: viewerSocketId → RTCPeerConnection
    this.peers = new Map();
    this.stream = null;
    this.sourceId = null;
    this._onInputCb = null;
    this._listenersRegistered = false;
  }

  /**
   * Start capturing the screen + game audio.
   * @param {string} videoSourceId  – screen/window source for video
   * @param {string|null} audioSourceId – window source of the game for audio (optional)
   */
  async startCapture(videoSourceId, audioSourceId = null) {
    this.sourceId = videoSourceId;

    const videoConstraints = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: videoSourceId,
        maxFrameRate: 60,
        maxWidth: 1280,
        maxHeight: 720,
        minFrameRate: 30,
      },
    };

    // Step 1 — Video stream (always from screen for fullscreen-game stability)
    const videoStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints,
    });
    const videoTracks = videoStream.getVideoTracks();
    for (const t of videoTracks) t.contentHint = 'motion';

    // Step 2 — Audio: try game-specific process loopback first
    let audioTracks = [];

    if (audioSourceId) {
      try {
        // Chromium on Windows 10 2004+ supports per-process loopback when the
        // window source ID is passed alongside chromeMediaSource:'desktop'.
        // We request video too (required by the API) then immediately discard it.
        const gameStream = await navigator.mediaDevices.getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: audioSourceId } },
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: audioSourceId } },
        });
        gameStream.getVideoTracks().forEach(t => t.stop()); // discard duplicate video
        audioTracks = gameStream.getAudioTracks();
        if (audioTracks.length > 0) {
          console.log('[Host] Game audio captured (per-process loopback)');
        }
      } catch (e) {
        console.warn('[Host] Per-process audio failed, will try system loopback:', e.message);
      }
    }

    if (audioTracks.length === 0) {
      console.log('[Host] Aucun audio jeu disponible — stream vidéo uniquement');
    }

    // Step 3 — Combine into one MediaStream sent over WebRTC
    this.stream = new MediaStream([...videoTracks, ...audioTracks]);

    this._registerSocketHandlers();
    return this.stream;
  }

  /** Called when a viewer requests the stream */
  async onViewerRequest(viewerSocketId) {
    if (!this.stream) {
      console.warn('[Host] Got viewer request but stream is not started');
      return;
    }
    console.log(`[Host] Creating peer for viewer ${viewerSocketId}`);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(viewerSocketId, pc);

    // Add all tracks — video with low-latency encoding params
    for (const track of this.stream.getTracks()) {
      const sender = pc.addTrack(track, this.stream);
      if (track.kind === 'video') {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0].maxBitrate   = 4_000_000; // 4 Mbps
        params.encodings[0].maxFramerate = 60;
        params.encodings[0].networkPriority = 'high';
        sender.setParameters(params).catch(() => {});
      }
    }

    // Relay ICE candidates
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.socket.emit(SOCKET_EVENTS.RTC_ICE, {
          targetSocketId: viewerSocketId,
          candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Host] Peer ${viewerSocketId} state: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this._removePeer(viewerSocketId);
      }
    };

    // Create and send the offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.socket.emit(SOCKET_EVENTS.RTC_OFFER, {
      targetSocketId: viewerSocketId,
      offer: pc.localDescription,
    });
  }

  /** Called when a viewer sends back an answer */
  async onAnswer(viewerSocketId, answer) {
    const pc = this.peers.get(viewerSocketId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /** Called when a viewer sends an ICE candidate */
  async onIceCandidate(viewerSocketId, candidate) {
    const pc = this.peers.get(viewerSocketId);
    if (!pc) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('[Host] ICE candidate error:', e.message);
    }
  }

  /** Register a callback for received input events */
  onInput(cb) {
    this._onInputCb = cb;
  }

  _registerSocketHandlers() {
    if (this._listenersRegistered) return;
    this._listenersRegistered = true;
    // Viewer wants to connect
    this.socket.on(SOCKET_EVENTS.RTC_REQUEST, ({ fromSocketId }) => {
      this.onViewerRequest(fromSocketId);
    });

    // Viewer answer
    this.socket.on(SOCKET_EVENTS.RTC_ANSWER, ({ fromSocketId, answer }) => {
      this.onAnswer(fromSocketId, answer);
    });

    // ICE from viewer
    this.socket.on(SOCKET_EVENTS.RTC_ICE, ({ fromSocketId, candidate }) => {
      this.onIceCandidate(fromSocketId, candidate);
    });

    // Incoming input from viewers
    this.socket.on(SOCKET_EVENTS.INPUT_FORWARD, ({ input }) => {
      if (this._onInputCb) this._onInputCb(input);
    });
  }

  _removePeer(socketId) {
    const pc = this.peers.get(socketId);
    if (pc) { pc.close(); this.peers.delete(socketId); }
  }

  stop() {
    for (const [id] of this.peers) this._removePeer(id);
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.socket.off(SOCKET_EVENTS.RTC_REQUEST);
    this.socket.off(SOCKET_EVENTS.RTC_ANSWER);
    this.socket.off(SOCKET_EVENTS.RTC_ICE);
    this.socket.off(SOCKET_EVENTS.INPUT_FORWARD);
    this._listenersRegistered = false;
  }
}
