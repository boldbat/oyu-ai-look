/** Camera video travels over WebRTC. The owned socket carries SDP/ICE only. */
export type LiveCameraPhase =
  | 'idle'
  | 'requesting-camera'
  | 'preview'
  | 'connecting'
  | 'negotiating'
  | 'waiting-for-frame'
  | 'live'
  | 'switching'
  | 'stopped'
  | 'failed';
export type CameraFacing = 'user' | 'environment';
export type LiveSelection = Partial<
  Record<
    'top' | 'bottom' | 'shoes' | 'dress',
    { source: 'wardrobe' | 'catalog'; item_id: string } | null
  >
>;
export interface LiveSelectEvent {
  type: 'applying' | 'applied' | 'rejected';
  seq: number;
  code?: string;
}
export interface LiveCameraState {
  phase: LiveCameraPhase;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  hasRemoteFrame: boolean;
  /** Seconds left when the session has a cap; null when it runs until Stop. */
  remainingSeconds: number | null;
  /** Seconds since Start, while a session is running. */
  elapsedSeconds: number | null;
  facing: CameraFacing;
  code: string | null;
  width: number;
  height: number;
  fps: number;
}
export interface LiveCameraOptions {
  localVideo: HTMLVideoElement;
  remoteVideo: HTMLVideoElement;
  onState: (state: LiveCameraState) => void;
  onSelectEvent?: (event: LiveSelectEvent) => void;
  isContextCurrent?: () => boolean;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createPeer?: (configuration: RTCConfiguration) => RTCPeerConnection;
  createStream?: (tracks: MediaStreamTrack[]) => MediaStream;
  lifecycleTarget?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}
export class LiveCameraError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'LiveCameraError';
  }
}

export const LIVE_CAMERA_CONSTRAINTS = {
  audio: false,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: { ideal: 'user' },
  },
} satisfies MediaStreamConstraints;
const FALLBACK_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const MAX_SIGNALS = 128;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const safeCode = (value: unknown, fallback = 'live_session_ended') =>
  typeof value === 'string' &&
  (/^live_[a-z_]{1,48}$/.test(value) || value === 'subscription_required')
    ? value
    : fallback;
const stopStream = (stream: MediaStream) => {
  for (const track of stream.getTracks()) {
    track.enabled = false;
    track.stop();
  }
};

export function parseIceServers(message: Record<string, unknown>): RTCIceServer[] | null {
  const value = message.iceServers ?? message.ice_servers ?? message.iceservers;
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 16)
    throw new LiveCameraError('live_invalid_response');
  return value.map((entry) => {
    if (!object(entry)) throw new LiveCameraError('live_invalid_response');
    const urls = typeof entry.urls === 'string' ? [entry.urls] : entry.urls;
    if (
      !Array.isArray(urls) ||
      !urls.length ||
      urls.length > 8 ||
      urls.some(
        (url) => typeof url !== 'string' || url.length > 2048 || !/^(turns?|stun):/.test(url),
      )
    )
      throw new LiveCameraError('live_invalid_response');
    return {
      urls: urls as string[],
      ...(typeof entry.username === 'string' ? { username: entry.username } : {}),
      ...(typeof entry.credential === 'string' ? { credential: entry.credential } : {}),
    };
  });
}

function candidate(value: unknown): RTCIceCandidateInit | null {
  if (value === null) return null;
  if (
    !object(value) ||
    typeof value.candidate !== 'string' ||
    !value.candidate.length ||
    value.candidate.length > 4096 ||
    (value.sdpMid != null && (typeof value.sdpMid !== 'string' || value.sdpMid.length > 32)) ||
    (value.sdpMLineIndex != null && value.sdpMLineIndex !== 0)
  )
    throw new LiveCameraError('live_invalid_response');
  return {
    candidate: value.candidate,
    sdpMid: (value.sdpMid as string | null | undefined) ?? null,
    sdpMLineIndex: (value.sdpMLineIndex as number | null | undefined) ?? null,
  };
}

function preferVp8(peer: RTCPeerConnection) {
  try {
    if (typeof RTCRtpSender === 'undefined' || typeof RTCRtpSender.getCapabilities !== 'function')
      return;
    const codecs = RTCRtpSender.getCapabilities('video')?.codecs;
    if (!codecs?.some((codec) => codec.mimeType.toLowerCase() === 'video/vp8')) return;
    const transceiver = peer
      .getTransceivers?.()
      .find((item) => item.sender.track?.kind === 'video' || item.receiver.track?.kind === 'video');
    if (typeof transceiver?.setCodecPreferences !== 'function') return;
    transceiver.setCodecPreferences([
      ...codecs.filter((codec) => codec.mimeType.toLowerCase() === 'video/vp8'),
      ...codecs.filter((codec) => codec.mimeType.toLowerCase() !== 'video/vp8'),
    ]);
  } catch {
    /* Codec preferences are optional; keep the browser's negotiation fallback. */
  }
}

/** Prefer dropping resolution over dropping frames, capped at the camera's 30 fps. */
async function keepFrameRate(sender: RTCRtpSender | null) {
  try {
    if (!sender || typeof sender.getParameters !== 'function') return;
    const parameters = sender.getParameters();
    parameters.degradationPreference = 'maintain-framerate';
    for (const encoding of parameters.encodings ?? []) encoding.maxFramerate = 30;
    await sender.setParameters(parameters);
  } catch {
    /* Encoder hints are optional; the browser's defaults still work. */
  }
}

/** No automatic reconnect, reservation, paid retry, or camera activation on construction. */
export class BrowserLiveCamera {
  private current: LiveCameraState = {
    phase: 'idle',
    localStream: null,
    remoteStream: null,
    hasRemoteFrame: false,
    remainingSeconds: null,
    elapsedSeconds: null,
    facing: 'user',
    code: null,
    width: 0,
    height: 0,
    fps: 0,
  };
  private epoch = 0;
  private socket: WebSocket | null = null;
  private peer: RTCPeerConnection | null = null;
  private sender: RTCRtpSender | null = null;
  private ownedStreams = new Set<MediaStream>();
  /** Selfie mode: send a mirrored copy of the front camera, as Decart recommends. */
  private mirror = true;
  private flipped: { track: MediaStreamTrack; release: () => void } | null = null;
  private removers: (() => void)[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private setupTimer?: ReturnType<typeof setTimeout>;
  private negotiationTimer?: ReturnType<typeof setTimeout>;
  private switchTimer?: ReturnType<typeof setTimeout>;
  private frameCallback?: number;
  private chain: Promise<void> = Promise.resolve();
  private queued = 0;
  private ready = false;
  private initialized = false;
  private answered = false;
  private offered = false;
  private earlySignals = 0;
  private localCandidates: RTCIceCandidateInit[] = [];
  private remoteCandidates: RTCIceCandidateInit[] = [];
  private iceServers: RTCIceServer[] | null = null;
  private earlyOffer = true;
  private deadline = Infinity;
  private startedAt = 0;
  private seenFrame = false;
  private lastSeq = 0;
  private switchAt: number | null = null;
  private switchFrames = 0;
  private decodedFrames = 0;
  private switchBaseline = 0;
  private resolveSwitch: ((result: boolean) => void) | null = null;
  private lifecycleBound = false;
  private pendingWaits = new Set<() => void>();

  constructor(private readonly options: LiveCameraOptions) {}
  get state(): LiveCameraState {
    return { ...this.current };
  }

  private publish(patch: Partial<LiveCameraState>) {
    this.current = { ...this.current, ...patch };
    this.options.onState(this.state);
  }
  private active(epoch: number): boolean {
    if (epoch !== this.epoch || ['idle', 'stopped', 'failed'].includes(this.current.phase))
      return false;
    if (this.options.isContextCurrent && !this.options.isContextCurrent()) {
      this.stop('live_context_changed');
      return false;
    }
    return true;
  }
  private later(milliseconds: number, callback: () => void) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, milliseconds);
    this.timers.add(timer);
    return timer;
  }
  private clear(timer: ReturnType<typeof setTimeout> | undefined) {
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(timer);
    }
  }
  private listen(target: EventTarget, type: string, callback: EventListener) {
    target.addEventListener(type, callback);
    this.removers.push(() => target.removeEventListener(type, callback));
  }
  private bindLifecycle() {
    if (this.lifecycleBound) return;
    this.lifecycleBound = true;
    const target =
      this.options.lifecycleTarget ?? (typeof document !== 'undefined' ? document : undefined);
    if (target) {
      const hidden = () => {
        if (target.visibilityState === 'hidden') this.stop('live_backgrounded');
      };
      target.addEventListener('visibilitychange', hidden);
      this.removers.push(() => target.removeEventListener('visibilitychange', hidden));
    }
    if (typeof window !== 'undefined')
      this.listen(window, 'pagehide', () => this.stop('live_backgrounded'));
  }
  private attach(video: HTMLVideoElement, stream: MediaStream) {
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;
    return video.play();
  }
  private async cancellable<T>(promise: Promise<T>): Promise<T> {
    let cancel!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => reject(new LiveCameraError('live_cancelled'));
      this.pendingWaits.add(cancel);
    });
    try {
      return await Promise.race([promise, cancelled]);
    } finally {
      this.pendingWaits.delete(cancel);
    }
  }

  private async acquire(
    epoch: number,
    facing: CameraFacing,
    timeout: number,
    exactFacing = false,
  ): Promise<MediaStream> {
    let expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const getMedia =
      this.options.getUserMedia ??
      ((constraints) => {
        if (!globalThis.navigator?.mediaDevices?.getUserMedia)
          throw new LiveCameraError('live_camera_unsupported');
        return navigator.mediaDevices.getUserMedia(constraints);
      });
    const request = Promise.resolve()
      .then(() => {
        if (!this.active(epoch)) throw new LiveCameraError('live_cancelled');
        return getMedia({
          ...LIVE_CAMERA_CONSTRAINTS,
          video: {
            ...(LIVE_CAMERA_CONSTRAINTS.video as MediaTrackConstraints),
            facingMode: exactFacing ? { exact: facing } : { ideal: facing },
          },
        });
      })
      .then((stream) => {
        if (expired || !this.active(epoch)) {
          stopStream(stream);
          throw new LiveCameraError('live_cancelled');
        }
        for (const track of stream.getAudioTracks()) {
          track.enabled = false;
          track.stop();
          stream.removeTrack(track);
        }
        const tracks = stream.getVideoTracks();
        if (!tracks.length || tracks[0].readyState === 'ended') {
          stopStream(stream);
          throw new LiveCameraError('live_camera_unavailable');
        }
        for (const track of tracks.slice(1)) {
          track.stop();
          stream.removeTrack(track);
        }
        this.ownedStreams.add(stream);
        const track = tracks[0];
        this.listen(track, 'ended', () => {
          if (this.current.localStream?.getVideoTracks().includes(track))
            this.fail(this.epoch, 'live_camera_ended');
        });
        return stream;
      });
    try {
      return await this.cancellable(
        Promise.race([
          request,
          new Promise<never>((_, reject) => {
            timer = this.later(timeout, () => reject(new LiveCameraError('live_camera_timeout')));
          }),
        ]),
      );
    } finally {
      expired = true;
      this.clear(timer);
    }
  }

  /** Call from the user's Start action before reserving a metered session. */
  async prepare(facing: CameraFacing = 'user'): Promise<MediaStream> {
    return this.prepareCamera(facing, false);
  }
  private async prepareCamera(facing: CameraFacing, exactFacing: boolean): Promise<MediaStream> {
    if (
      this.current.phase === 'preview' &&
      this.current.localStream &&
      facing === this.current.facing
    )
      return this.current.localStream;
    if (!['idle', 'stopped', 'failed', 'preview'].includes(this.current.phase))
      throw new LiveCameraError('live_already_running');
    if (this.current.phase === 'preview') this.stop('live_session_ended');
    const epoch = ++this.epoch;
    this.publish({ phase: 'requesting-camera', facing, code: null });
    this.bindLifecycle();
    try {
      const stream = await this.acquire(epoch, facing, 30_000, exactFacing);
      if (!this.active(epoch)) {
        stopStream(stream);
        throw new LiveCameraError('live_cancelled');
      }
      this.publish({ localStream: stream });
      await this.cancellable(this.attach(this.options.localVideo, stream));
      if (!this.active(epoch)) throw new LiveCameraError('live_cancelled');
      this.publish({ phase: 'preview' });
      return stream;
    } catch (error) {
      const code =
        error instanceof LiveCameraError
          ? error.code
          : error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'live_camera_permission_denied'
            : 'live_camera_unavailable';
      this.fail(epoch, code);
      throw new LiveCameraError(code);
    }
  }

  /** The socket must be freshly created by the authenticated owned-account adapter. */
  start({
    socket,
    maxDurationSeconds,
    offerBeforeReady = true,
  }: {
    socket: WebSocket;
    /** null runs until stop(); a number stops the session after that many seconds. */
    maxDurationSeconds: number | null;
    offerBeforeReady?: boolean;
  }): void {
    if (
      !['preview', 'idle', 'stopped', 'failed'].includes(this.current.phase) ||
      (maxDurationSeconds !== null &&
        (!Number.isFinite(maxDurationSeconds) ||
          maxDurationSeconds <= 0 ||
          maxDurationSeconds > 86_400)) ||
      socket.readyState > 1
    ) {
      socket.close();
      this.stop('live_transport_invalid', true);
      throw new LiveCameraError('live_transport_invalid');
    }
    const epoch = ++this.epoch;
    this.socket = socket;
    this.earlyOffer = offerBeforeReady;
    this.startedAt = Date.now();
    this.deadline =
      maxDurationSeconds === null ? Infinity : this.startedAt + maxDurationSeconds * 1000;
    this.ready = this.initialized = this.answered = this.offered = this.seenFrame = false;
    this.earlySignals = this.lastSeq = this.queued = this.decodedFrames = 0;
    this.iceServers = null;
    this.chain = Promise.resolve();
    this.localCandidates = [];
    this.remoteCandidates = [];
    this.publish({
      phase: 'connecting',
      code: null,
      remainingSeconds: maxDurationSeconds === null ? null : Math.ceil(maxDurationSeconds),
      elapsedSeconds: 0,
      hasRemoteFrame: false,
    });
    this.bindLifecycle();
    this.listen(socket, 'message', (event) => this.enqueue((event as MessageEvent).data, epoch));
    this.listen(socket, 'error', () => this.fail(epoch, 'live_connection_failed'));
    this.listen(socket, 'close', () => this.fail(epoch, 'live_connection_closed'));
    this.setupTimer = this.later(30_000, () => this.fail(epoch, 'live_negotiation_timeout'));
    this.tick(epoch);
  }

  private tick(epoch: number) {
    if (!this.active(epoch)) return;
    const elapsed = Math.floor((Date.now() - this.startedAt) / 1000);
    const remaining = Number.isFinite(this.deadline)
      ? Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000))
      : null;
    if (remaining === 0) {
      this.stop('live_session_limit');
      return;
    }
    if (remaining !== this.current.remainingSeconds || elapsed !== this.current.elapsedSeconds)
      this.publish({ remainingSeconds: remaining, elapsedSeconds: elapsed });
    this.later(1000, () => this.tick(epoch));
  }
  private send(message: Record<string, unknown>) {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1 || socket.bufferedAmount > 256 * 1024)
      throw new LiveCameraError('live_connection_failed');
    socket.send(JSON.stringify(message));
  }
  private fail(epoch: number, code: string) {
    if (epoch === this.epoch && !['stopped', 'failed', 'idle'].includes(this.current.phase))
      this.stop(code, true);
  }

  private enqueue(raw: unknown, epoch: number) {
    if (!this.active(epoch)) return;
    let message: Record<string, unknown>;
    try {
      if (typeof raw !== 'string' || raw.length > 128 * 1024) throw new Error();
      const parsed: unknown = JSON.parse(raw);
      if (!object(parsed)) throw new Error();
      message = parsed;
    } catch {
      this.fail(epoch, 'live_invalid_response');
      return;
    }
    if (message.type === 'error' || message.type === 'stopped') {
      this.stop(safeCode(message.code), message.type === 'error');
      return;
    }
    if (['applying', 'applied', 'select_rejected'].includes(String(message.type))) {
      if (!Number.isSafeInteger(message.seq) || Number(message.seq) < 0) {
        this.fail(epoch, 'live_invalid_response');
        return;
      }
      this.options.onSelectEvent?.({
        type:
          message.type === 'select_rejected'
            ? 'rejected'
            : (message.type as 'applying' | 'applied'),
        seq: Number(message.seq),
        ...(message.type === 'select_rejected'
          ? {
              code:
                typeof message.code === 'string' && /^[a-z_]{1,48}$/.test(message.code)
                  ? message.code
                  : 'select_rejected',
            }
          : {}),
      });
      return;
    }
    if (message.type === 'ready') this.ready = true;
    if (++this.queued > MAX_SIGNALS) {
      this.fail(epoch, 'live_invalid_response');
      return;
    }
    this.chain = this.chain.then(async () => {
      if (!this.active(epoch)) return;
      try {
        await this.handle(message, epoch);
      } catch (error) {
        this.fail(epoch, error instanceof LiveCameraError ? error.code : 'live_invalid_response');
      } finally {
        if (epoch === this.epoch) this.queued--;
      }
    });
  }

  private async handle(message: Record<string, unknown>, epoch: number) {
    switch (message.type) {
      case 'iceservers':
        if (this.initialized) return;
        this.iceServers = parseIceServers(message);
        if (this.ready || (this.earlyOffer && this.iceServers !== null))
          await this.initialize(epoch);
        return;
      case 'ready': {
        const seconds = message.session_seconds_remaining;
        if (seconds !== undefined) {
          if (!Number.isInteger(seconds) || Number(seconds) < 0 || Number(seconds) > 86_400)
            throw new LiveCameraError('live_invalid_response');
          this.deadline = Math.min(this.deadline, Date.now() + Number(seconds) * 1000);
          this.publish({
            remainingSeconds: Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000)),
          });
          if (Number(seconds) === 0) {
            this.stop('live_session_limit');
            return;
          }
        }
        this.iceServers = parseIceServers(message) ?? this.iceServers;
        if (!this.initialized) {
          if (this.iceServers) await this.initialize(epoch);
          else
            this.later(1000, () => {
              if (this.active(epoch))
                void this.initialize(epoch).catch((error) =>
                  this.fail(
                    epoch,
                    error instanceof LiveCameraError ? error.code : 'live_negotiation_failed',
                  ),
                );
            });
        }
        if (this.offered) {
          this.flushCandidates();
          this.boundNegotiation(epoch);
        }
        this.maybeLive(epoch);
        return;
      }
      case 'answer': {
        if (!this.initialized || !this.peer || this.answered) return;
        if (
          typeof message.sdp !== 'string' ||
          !message.sdp.startsWith('v=0') ||
          message.sdp.length > 128 * 1024
        )
          throw new LiveCameraError('live_invalid_response');
        const peer = this.peer;
        await peer.setRemoteDescription({ type: 'answer', sdp: message.sdp });
        if (!this.active(epoch)) return;
        this.answered = true;
        this.clear(this.negotiationTimer);
        for (const item of this.remoteCandidates.splice(0)) {
          await peer.addIceCandidate(item);
          if (!this.active(epoch)) return;
        }
        this.publish({ phase: 'waiting-for-frame' });
        this.maybeLive(epoch);
        return;
      }
      case 'icecandidate': {
        const item = candidate(message.candidate);
        if (!item) return;
        if (!this.answered || !this.peer) {
          if (this.remoteCandidates.length >= MAX_SIGNALS)
            throw new LiveCameraError('live_invalid_response');
          this.remoteCandidates.push(item);
        } else await this.peer.addIceCandidate(item);
        return;
      }
      default:
        throw new LiveCameraError('live_invalid_response');
    }
  }

  private boundNegotiation(epoch: number) {
    if (this.answered || this.negotiationTimer !== undefined) return;
    this.negotiationTimer = this.later(15_000, () => this.fail(epoch, 'live_negotiation_timeout'));
  }
  private async initialize(epoch: number) {
    if (this.initialized || !this.active(epoch)) return;
    this.initialized = true;
    let stream = this.current.localStream;
    if (!stream) {
      this.publish({ phase: 'requesting-camera' });
      stream = await this.acquire(epoch, this.current.facing, 30_000);
      if (!this.active(epoch)) return;
      this.publish({ localStream: stream });
      await this.attach(this.options.localVideo, stream);
    }
    if (!this.active(epoch)) return;
    this.publish({ phase: 'negotiating' });
    const peer = (
      this.options.createPeer ?? ((configuration) => new RTCPeerConnection(configuration))
    )({ iceServers: this.iceServers ?? FALLBACK_ICE, bundlePolicy: 'max-bundle' });
    this.peer = peer;
    peer.onicecandidate = (event) => {
      if (!event.candidate || !this.active(epoch)) return;
      try {
        const item = candidate({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        });
        if (!item) return;
        if (this.localCandidates.length >= MAX_SIGNALS)
          throw new LiveCameraError('live_invalid_response');
        this.localCandidates.push(item);
        this.flushCandidates();
      } catch {
        this.fail(epoch, 'live_connection_failed');
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed' || peer.connectionState === 'closed')
        this.fail(epoch, 'live_stream_failed');
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'failed') this.fail(epoch, 'live_stream_failed');
    };
    peer.ontrack = (event) => this.remoteTrack(event, epoch);
    const track = this.outgoing(stream.getVideoTracks()[0]);
    this.sender = peer.addTrack(track, stream);
    preferVp8(peer);
    const offer = await peer.createOffer({ offerToReceiveAudio: false, offerToReceiveVideo: true });
    if (!this.active(epoch)) return;
    const sdp = offer.sdp;
    const media = sdp?.split(/\r?\n/).filter((line) => line.startsWith('m=')) ?? [];
    if (
      !sdp?.startsWith('v=0') ||
      sdp.length > 64 * 1024 ||
      media.length !== 1 ||
      !media[0].startsWith('m=video ')
    )
      throw new LiveCameraError('live_invalid_offer');
    await peer.setLocalDescription(offer);
    if (!this.active(epoch)) return;
    await keepFrameRate(this.sender);
    if (!this.active(epoch)) return;
    this.send({ type: 'offer', sdp });
    this.offered = true;
    if (!this.ready) this.earlySignals++;
    this.flushCandidates();
    if (this.ready) this.boundNegotiation(epoch);
    void this.readStats(epoch);
  }
  private flushCandidates() {
    if (!this.offered) return;
    while (this.localCandidates.length && (this.ready || this.earlySignals < 64)) {
      this.send({ type: 'icecandidate', candidate: this.localCandidates.shift() });
      if (!this.ready) this.earlySignals++;
    }
  }

  private remoteTrack(event: RTCTrackEvent, epoch: number) {
    if (!this.active(epoch) || event.track.kind !== 'video') {
      event.track.enabled = false;
      event.track.stop();
      return;
    }
    if (this.current.remoteStream) {
      if (!this.current.remoteStream.getTracks().includes(event.track)) event.track.stop();
      return;
    }
    const stream = (this.options.createStream ?? ((tracks) => new MediaStream(tracks)))([
      event.track,
    ]);
    this.ownedStreams.add(stream);
    this.publish({ remoteStream: stream });
    this.listen(event.track, 'ended', () => this.fail(epoch, 'live_stream_ended'));
    const video = this.options.remoteVideo;
    if (typeof video.requestVideoFrameCallback === 'function') {
      const frame: VideoFrameRequestCallback = () => {
        if (!this.active(epoch)) return;
        this.onFrame(epoch);
        if (this.active(epoch)) this.frameCallback = video.requestVideoFrameCallback(frame);
      };
      this.frameCallback = video.requestVideoFrameCallback(frame);
    } else {
      const frame = () => {
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0)
          this.onFrame(epoch);
      };
      this.listen(video, 'loadeddata', frame);
      this.listen(video, 'playing', frame);
    }
    void this.attach(video, stream).catch(() => this.fail(epoch, 'live_playback_unavailable'));
  }
  private onFrame(epoch: number) {
    if (!this.active(epoch)) return;
    this.seenFrame = true;
    if (this.current.phase === 'switching' && this.switchAt !== null) {
      this.switchFrames++;
      this.finishSwitch(epoch);
    } else this.maybeLive(epoch);
  }
  private maybeLive(epoch: number) {
    if (
      !this.active(epoch) ||
      !this.answered ||
      !this.ready ||
      !this.seenFrame ||
      this.current.phase === 'switching'
    )
      return;
    this.clear(this.setupTimer);
    this.clear(this.negotiationTimer);
    if (!this.current.hasRemoteFrame)
      this.publish({
        phase: 'live',
        hasRemoteFrame: true,
        width: this.options.remoteVideo.videoWidth,
        height: this.options.remoteVideo.videoHeight,
      });
  }
  private async readStats(epoch: number) {
    if (!this.active(epoch) || !this.peer) return;
    try {
      const stats = await this.peer.getStats();
      if (!this.active(epoch)) return;
      let decoded = 0,
        fps = 0;
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && (report.kind ?? report.mediaType) === 'video') {
          if (Number.isFinite(report.framesDecoded)) decoded += report.framesDecoded;
          if (Number.isFinite(report.framesPerSecond)) fps = report.framesPerSecond;
        }
      });
      this.decodedFrames = decoded;
      if (this.switchAt !== null) {
        this.switchFrames = Math.max(this.switchFrames, decoded - this.switchBaseline);
        this.finishSwitch(epoch);
      }
      const video = this.options.remoteVideo;
      // Browsers can suppress compositor callbacks for an occluded video. A
      // decoded inbound frame plus a ready video with dimensions is evidence,
      // even while the UI deliberately hides the first generated frame.
      if (decoded > 0 && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        this.seenFrame = true;
        this.maybeLive(epoch);
      }
      if (this.active(epoch))
        this.publish({ width: video.videoWidth, height: video.videoHeight, fps });
    } catch {
      /* Metrics cannot turn a negotiating track into a shown AI frame. */
    }
    if (this.active(epoch)) this.later(1000, () => void this.readStats(epoch));
  }

  select(seq: number, selection: LiveSelection): boolean {
    if (
      !this.active(this.epoch) ||
      !this.ready ||
      !this.options.onSelectEvent ||
      !Number.isSafeInteger(seq) ||
      seq <= this.lastSeq
    )
      return false;
    const entries = Object.entries(selection);
    const valid = entries.every(
      ([slot, item]) =>
        ['top', 'bottom', 'shoes', 'dress'].includes(slot) &&
        (item == null ||
          (object(item) &&
            Object.keys(item).every((key) => ['source', 'item_id'].includes(key)) &&
            (item.source === 'wardrobe' || item.source === 'catalog') &&
            typeof item.item_id === 'string' &&
            /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(item.item_id))),
    );
    if (
      !valid ||
      (selection.dress && (selection.top || selection.bottom)) ||
      !(selection.top || selection.bottom || selection.dress)
    )
      return false;
    const identities = entries
      .filter(([, item]) => item)
      .map(([, item]) => `${item!.source}:${item!.item_id}`);
    if (new Set(identities).size !== identities.length) return false;
    try {
      this.send({ type: 'select', seq, selection });
      this.lastSeq = seq;
      return true;
    } catch {
      this.fail(this.epoch, 'live_connection_failed');
      return false;
    }
  }

  /** The track sent to the provider: mirrored for the front camera when mirror is on. */
  private outgoing(track: MediaStreamTrack): MediaStreamTrack {
    this.releaseFlip();
    const sent = this.mirror && this.current.facing === 'user' ? this.flip(track) : track;
    // A body in motion matters more than pixel detail: keep the frame rate under load.
    if ('contentHint' in sent) sent.contentHint = 'motion';
    return sent;
  }
  private releaseFlip() {
    this.flipped?.release();
    this.flipped = null;
  }
  /** Draws each camera frame flipped onto a canvas and returns the canvas track. */
  private flip(track: MediaStreamTrack): MediaStreamTrack {
    if (
      typeof document === 'undefined' ||
      typeof HTMLCanvasElement === 'undefined' ||
      typeof HTMLCanvasElement.prototype.captureStream !== 'function'
    )
      return track;
    const { width = 1280, height = 720, frameRate = 30 } = track.getSettings();
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) return track;
    context.translate(width, 0);
    context.scale(-1, 1);
    let running = true;
    let frame = 0;
    // Drive drawing from the display clock: frame callbacks on an off-screen video are
    // throttled by browsers, which would starve the provider of input frames.
    const draw = () => {
      if (!running) return;
      if (video.readyState >= 2) context.drawImage(video, 0, 0, width, height);
      frame = requestAnimationFrame(draw);
    };
    void video.play().then(
      () => {
        if (running) frame = requestAnimationFrame(draw);
      },
      () => undefined,
    );
    const sent = canvas.captureStream(frameRate).getVideoTracks()[0];
    if (!sent) return track;
    this.flipped = {
      track: sent,
      release: () => {
        running = false;
        cancelAnimationFrame(frame);
        sent.stop();
        video.pause();
        video.srcObject = null;
      },
    };
    return sent;
  }
  /** Turn selfie mirroring on or off, including mid-session. */
  async setMirror(on: boolean): Promise<void> {
    if (this.mirror === on) return;
    this.mirror = on;
    const camera = this.current.localStream?.getVideoTracks()[0];
    if (
      !this.sender ||
      !camera ||
      !['live', 'waiting-for-frame', 'negotiating'].includes(this.current.phase)
    )
      return;
    const previous = this.flipped;
    this.flipped = null;
    try {
      await this.sender.replaceTrack(this.outgoing(camera));
    } catch {
      /* Keep the previous track if the browser refuses the swap. */
    }
    previous?.release();
  }

  async switchCamera(): Promise<boolean> {
    if (this.current.phase === 'preview') {
      try {
        await this.prepareCamera(this.current.facing === 'user' ? 'environment' : 'user', true);
        return this.current.phase === 'preview';
      } catch {
        return false;
      }
    }
    if (this.current.phase !== 'live' || !this.sender || !this.active(this.epoch)) return false;
    const epoch = this.epoch;
    const facing = this.current.facing === 'user' ? 'environment' : 'user';
    const completion = new Promise<boolean>((resolve) => {
      this.resolveSwitch = resolve;
    });
    this.publish({ phase: 'switching', hasRemoteFrame: false });
    this.switchAt = null;
    const old = this.current.localStream;
    this.options.localVideo.srcObject = null;
    this.publish({ localStream: null });
    if (old) {
      stopStream(old);
      this.ownedStreams.delete(old);
    }
    this.switchTimer = this.later(8000, () => this.fail(epoch, 'live_camera_switch_failed'));
    try {
      const stream = await this.acquire(epoch, facing, 8000, true);
      if (!this.active(epoch)) return false;
      this.current.facing = facing;
      await this.cancellable(this.sender.replaceTrack(this.outgoing(stream.getVideoTracks()[0])));
      if (!this.active(epoch)) return false;
      this.publish({ localStream: stream, facing });
      await this.cancellable(this.attach(this.options.localVideo, stream));
      if (!this.active(epoch)) return false;
      this.clear(this.switchTimer);
      this.switchAt = Date.now();
      this.switchFrames = 0;
      this.switchBaseline = this.decodedFrames;
      this.switchTimer = this.later(3000, () => this.fail(epoch, 'live_camera_switch_failed'));
    } catch {
      this.fail(epoch, 'live_camera_switch_failed');
    }
    return completion;
  }
  private finishSwitch(epoch: number) {
    if (
      !this.active(epoch) ||
      this.switchAt === null ||
      this.switchFrames < 10 ||
      Date.now() - this.switchAt < 600
    )
      return;
    this.clear(this.switchTimer);
    this.switchAt = null;
    this.publish({ phase: 'live', hasRemoteFrame: true });
    this.resolveSwitch?.(true);
    this.resolveSwitch = null;
  }

  /** Cleanup is synchronous even if permission, SDP, or camera replacement is pending. */
  stop(code = 'live_session_ended', failed = false): void {
    ++this.epoch;
    for (const cancel of this.pendingWaits) cancel();
    this.pendingWaits.clear();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.setupTimer = this.negotiationTimer = this.switchTimer = undefined;
    for (const remove of this.removers.splice(0)) remove();
    this.lifecycleBound = false;
    if (this.frameCallback !== undefined)
      this.options.remoteVideo.cancelVideoFrameCallback?.(this.frameCallback);
    this.frameCallback = undefined;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'stop' }));
      } catch {
        /* Closing also terminates the lease. */
      }
      try {
        socket.close();
      } catch {
        /* Already closed. */
      }
    }
    const peer = this.peer;
    this.peer = null;
    this.sender = null;
    if (peer) {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.onconnectionstatechange = null;
      peer.oniceconnectionstatechange = null;
      peer.close();
    }
    this.releaseFlip();
    for (const stream of this.ownedStreams) stopStream(stream);
    this.ownedStreams.clear();
    for (const video of [this.options.localVideo, this.options.remoteVideo]) {
      try {
        video.pause();
        video.srcObject = null;
        video.load();
      } catch {
        video.srcObject = null;
      }
    }
    this.resolveSwitch?.(false);
    this.resolveSwitch = null;
    this.switchAt = null;
    this.localCandidates = [];
    this.remoteCandidates = [];
    this.chain = Promise.resolve();
    this.publish({
      phase: failed ? 'failed' : 'stopped',
      localStream: null,
      remoteStream: null,
      hasRemoteFrame: false,
      remainingSeconds: null,
      elapsedSeconds: null,
      width: 0,
      height: 0,
      fps: 0,
      code,
    });
  }
}
