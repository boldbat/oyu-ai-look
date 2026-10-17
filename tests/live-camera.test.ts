import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserLiveCamera, LIVE_CAMERA_CONSTRAINTS, parseIceServers } from '../src/lib/live-camera';
import type { LiveCameraOptions, LiveCameraState, LiveSelectEvent } from '../src/lib/live-camera';

class Track extends EventTarget {
  enabled = true; readyState = 'live';
  constructor(readonly kind = 'video') { super(); }
  stop = vi.fn(() => { this.readyState = 'ended'; });
}
class Stream {
  constructor(private tracks: Track[]) {}
  getTracks() { return [...this.tracks]; }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
  removeTrack(track: Track) { this.tracks = this.tracks.filter(item => item !== track); }
}
class Video extends EventTarget {
  muted = false; autoplay = false; playsInline = false; srcObject: MediaStream | null = null;
  readyState = 0; videoWidth = 0; videoHeight = 0;
  private next = 0; private callbacks = new Map<number, VideoFrameRequestCallback>();
  play = vi.fn(async () => {}); pause = vi.fn(); load = vi.fn();
  requestVideoFrameCallback(callback: VideoFrameRequestCallback) { const id = ++this.next; this.callbacks.set(id, callback); return id; }
  cancelVideoFrameCallback(id: number) { this.callbacks.delete(id); }
  frame() {
    this.readyState = 2; this.videoWidth = 1280; this.videoHeight = 720;
    const callbacks = [...this.callbacks.values()]; this.callbacks.clear();
    callbacks.forEach(callback => callback(0, { width: 1280, height: 720 } as VideoFrameCallbackMetadata));
  }
}
class Socket extends EventTarget {
  readyState = 1; bufferedAmount = 0;
  sent: Record<string, unknown>[] = [];
  send = vi.fn((raw: string) => { this.sent.push(JSON.parse(raw)); });
  close = vi.fn(() => { this.readyState = 3; });
  message(message: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) })); }
}
class Peer {
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  connectionState = 'new'; iceConnectionState = 'new';
  sender = { replaceTrack: vi.fn(async (_track: MediaStreamTrack) => {}) };
  addTrack = vi.fn((_track: MediaStreamTrack, _stream: MediaStream) => this.sender);
  createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' }));
  setLocalDescription = vi.fn(async (_description: RTCSessionDescriptionInit) => {});
  setRemoteDescription = vi.fn(async (_description: RTCSessionDescriptionInit) => {});
  addIceCandidate = vi.fn(async (_candidate: RTCIceCandidateInit) => {});
  getStats = vi.fn(async () => new Map([['inbound', { type: 'inbound-rtp', kind: 'video', framesDecoded: 0, framesPerSecond: 0 }]]) as unknown as RTCStatsReport);
  close = vi.fn(() => { this.connectionState = 'closed'; });
  track(track: Track) { this.ontrack?.({ track } as unknown as RTCTrackEvent); }
  ice(index: number) { this.onicecandidate?.({ candidate: { candidate: `candidate:${index}`, sdpMid: '0', sdpMLineIndex: 0 } } as RTCPeerConnectionIceEvent); }
}
const asStream = (stream: Stream) => stream as unknown as MediaStream;
const controllers: BrowserLiveCamera[] = [];
function fixture(overrides: Partial<LiveCameraOptions> = {}) {
  const localVideo = new Video(), remoteVideo = new Video();
  const videoTrack = new Track(), audioTrack = new Track('audio');
  const stream = new Stream([videoTrack, audioTrack]);
  const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => asStream(stream));
  const peer = new Peer(); const socket = new Socket();
  const onState = vi.fn((_state: LiveCameraState) => {});
  const onSelectEvent = vi.fn((_event: LiveSelectEvent) => {});
  const createPeer = vi.fn((_configuration: RTCConfiguration) => peer as unknown as RTCPeerConnection);
  const camera = new BrowserLiveCamera({
    localVideo: localVideo as unknown as HTMLVideoElement, remoteVideo: remoteVideo as unknown as HTMLVideoElement,
    getUserMedia, createPeer, createStream: tracks => asStream(new Stream(tracks as unknown as Track[])), onState, onSelectEvent,
    ...overrides,
  });
  controllers.push(camera);
  return { camera, localVideo, remoteVideo, videoTrack, audioTrack, stream, getUserMedia, createPeer, peer, socket, onState, onSelectEvent };
}
async function flush() { await vi.advanceTimersByTimeAsync(0); }
async function connect(setup = fixture()) {
  await setup.camera.prepare();
  setup.camera.start({ socket: setup.socket as unknown as WebSocket, maxDurationSeconds: 60 });
  setup.socket.message({ type: 'iceservers', iceServers: [{ urls: 'stun:stun.example.test:19302' }] });
  await flush();
  return setup;
}
async function becomeLive(setup = fixture()) {
  await connect(setup);
  setup.socket.message({ type: 'ready', continuous: true, session_seconds_remaining: 60 });
  setup.socket.message({ type: 'answer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' });
  await flush();
  const remoteTrack = new Track(); setup.peer.track(remoteTrack); setup.remoteVideo.frame();
  return { ...setup, remoteTrack };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { controllers.splice(0).forEach(camera => camera.stop()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('explicit camera permission and cleanup', () => {
  it('does not acquire anything on construction; prepares video without signaling or microphone', async () => {
    const f = fixture();
    expect(f.getUserMedia).not.toHaveBeenCalled();
    await f.camera.prepare();
    expect(f.getUserMedia).toHaveBeenCalledWith(LIVE_CAMERA_CONSTRAINTS);
    expect(f.camera.state.phase).toBe('preview');
    expect(f.audioTrack.stop).toHaveBeenCalledOnce();
    expect(f.stream.getAudioTracks()).toEqual([]);
    expect(f.createPeer).not.toHaveBeenCalled();
    expect(f.localVideo.srcObject).toBe(f.stream);
    f.camera.stop();
    expect(f.videoTrack.stop).toHaveBeenCalledOnce();
    expect(f.localVideo.srcObject).toBeNull();
    expect(f.camera.state.localStream).toBeNull();
  });

  it('stops a permission wait immediately and releases a camera returned late', async () => {
    let resolve!: (stream: MediaStream) => void;
    const f = fixture({ getUserMedia: () => new Promise(done => { resolve = done; }) });
    const preparing = f.camera.prepare().catch(error => error);
    await flush(); f.camera.stop('live_cancelled');
    expect((await preparing).code).toBe('live_cancelled');
    const lateTrack = new Track(); resolve(asStream(new Stream([lateTrack]))); await flush();
    expect(lateTrack.stop).toHaveBeenCalledOnce();
    expect(f.camera.state.phase).toBe('stopped');
    expect(f.localVideo.srcObject).toBeNull();
  });

  it('does not request permission when stopped before the request microtask', async () => {
    const f = fixture(); const preparing = f.camera.prepare().catch(error => error);
    f.camera.stop('live_cancelled'); await preparing;
    expect(f.getUserMedia).not.toHaveBeenCalled();
  });

  it('changes preview cameras before a paid session without signaling', async () => {
    const f = fixture(); await f.camera.prepare();
    const replacement = new Track(); f.getUserMedia.mockResolvedValueOnce(asStream(new Stream([replacement])));
    expect(await f.camera.switchCamera()).toBe(true);
    expect(f.camera.state).toMatchObject({ phase: 'preview', facing: 'environment' });
    expect(f.videoTrack.stop).toHaveBeenCalledOnce();
    expect(f.getUserMedia.mock.calls[1][0]).toMatchObject({ video: { facingMode: { exact: 'environment' } } });
    expect(f.createPeer).not.toHaveBeenCalled();
    expect(f.socket.sent).toEqual([]);
  });

  it('reports permission refusal without retaining a stream', async () => {
    const f = fixture({ getUserMedia: async () => { throw new DOMException('private details', 'NotAllowedError'); } });
    await expect(f.camera.prepare()).rejects.toMatchObject({ code: 'live_camera_permission_denied' });
    expect(f.camera.state.phase).toBe('failed'); expect(f.camera.state.localStream).toBeNull();
  });

  it('releases local and remote tracks, socket and peer on background or context change', async () => {
    const lifecycle = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
    lifecycle.visibilityState = 'visible';
    const f = await becomeLive(fixture({ lifecycleTarget: lifecycle }));
    lifecycle.visibilityState = 'hidden'; lifecycle.dispatchEvent(new Event('visibilitychange'));
    expect(f.camera.state).toMatchObject({ phase: 'stopped', code: 'live_backgrounded', hasRemoteFrame: false });
    expect(f.videoTrack.stop).toHaveBeenCalled(); expect(f.remoteTrack.stop).toHaveBeenCalled();
    expect(f.peer.close).toHaveBeenCalled(); expect(f.socket.close).toHaveBeenCalled();
    expect(f.remoteVideo.srcObject).toBeNull();
    expect(f.socket.sent.at(-1)).toEqual({ type: 'stop' });
  });
});

describe('owned WebRTC signaling', () => {
  it('prefers VP8 before creating the offer while retaining every fallback codec', async () => {
    const codecs = [
      { mimeType: 'video/H264', clockRate: 90000 },
      { mimeType: 'video/rtx', clockRate: 90000 },
      { mimeType: 'video/VP9', clockRate: 90000 },
      { mimeType: 'video/vP8', clockRate: 90000 },
      { mimeType: 'video/red', clockRate: 90000 },
    ];
    const original = [...codecs];
    const getCapabilities = vi.fn(() => ({ codecs }));
    vi.stubGlobal('RTCRtpSender', { getCapabilities });
    const f = fixture();
    const setCodecPreferences = vi.fn();
    Object.assign(f.peer, { getTransceivers: () => [{ sender: { track: f.videoTrack }, receiver: {}, setCodecPreferences }] });
    await connect(f);
    expect(getCapabilities).toHaveBeenCalledWith('video');
    expect(setCodecPreferences).toHaveBeenCalledWith([codecs[3], codecs[0], codecs[1], codecs[2], codecs[4]]);
    expect(setCodecPreferences.mock.invocationCallOrder[0]).toBeLessThan(f.peer.createOffer.mock.invocationCallOrder[0]);
    expect(codecs).toEqual(original);
    expect(f.socket.sent[0]).toMatchObject({ type: 'offer' });
  });

  it.each(['no capabilities', 'no VP8', 'no transceivers', 'no setter', 'setter refuses'] as const)('continues negotiation when codec preference is unavailable: %s', async reason => {
    const f = fixture();
    const codecs = [{ mimeType: reason === 'no VP8' ? 'video/H264' : 'video/VP8', clockRate: 90000 }];
    vi.stubGlobal('RTCRtpSender', { getCapabilities: () => reason === 'no capabilities' ? null : { codecs } });
    const setCodecPreferences = vi.fn(() => { if (reason === 'setter refuses') throw new Error('Unsupported preferences'); });
    if (reason !== 'no transceivers') Object.assign(f.peer, { getTransceivers: () => [{ sender: { track: f.videoTrack }, receiver: {}, ...(reason !== 'no setter' ? { setCodecPreferences } : {}) }] });
    await connect(f);
    expect(f.socket.sent[0]).toMatchObject({ type: 'offer' });
    expect(f.camera.state.phase).toBe('negotiating');
    if (reason !== 'setter refuses') expect(setCodecPreferences).not.toHaveBeenCalled();
  });

  it('sends one video offer early and only calls the output live after an actual frame', async () => {
    const f = await connect();
    expect(f.getUserMedia).toHaveBeenCalledOnce();
    expect(f.socket.sent[0]).toMatchObject({ type: 'offer' });
    f.socket.message({ type: 'icecandidate', candidate: { candidate: 'candidate:remote', sdpMid: '0', sdpMLineIndex: 0 } });
    await flush(); expect(f.peer.addIceCandidate).not.toHaveBeenCalled();
    f.socket.message({ type: 'ready', session_seconds_remaining: 50 });
    f.socket.message({ type: 'answer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' });
    await flush(); expect(f.peer.addIceCandidate).toHaveBeenCalledOnce();
    f.peer.track(new Track());
    expect(f.camera.state.phase).toBe('waiting-for-frame');
    expect(f.camera.state.hasRemoteFrame).toBe(false);
    f.remoteVideo.frame();
    expect(f.camera.state).toMatchObject({ phase: 'live', hasRemoteFrame: true, width: 1280, height: 720, remainingSeconds: 50 });
    expect(f.socket.sent.every(message => !['frame', 'image', 'set_image'].includes(String(message.type)))).toBe(true);
  });

  it('bounds early candidates and flushes the remainder only after ready', async () => {
    const f = await connect();
    for (let index = 0; index < 100; index++) f.peer.ice(index);
    expect(f.socket.sent).toHaveLength(64);
    f.socket.message({ type: 'ready', session_seconds_remaining: 60 }); await flush();
    expect(f.socket.sent.filter(message => message.type === 'icecandidate')).toHaveLength(100);
  });

  it('recognizes decoded output when an occluded video suppresses compositor callbacks', async () => {
    const f = await connect();
    f.socket.message({ type: 'ready', session_seconds_remaining: 60 });
    f.socket.message({ type: 'answer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' });
    await flush(); f.peer.track(new Track());
    f.remoteVideo.readyState = 2; f.remoteVideo.videoWidth = 1280; f.remoteVideo.videoHeight = 720;
    f.peer.getStats.mockResolvedValue(new Map([['inbound', { type: 'inbound-rtp', kind: 'video', framesDecoded: 2, framesPerSecond: 30 }]]) as unknown as RTCStatsReport);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.camera.state).toMatchObject({ phase: 'live', hasRemoteFrame: true, fps: 30 });
  });

  it('fails closed on excess queued server candidates', async () => {
    const f = await connect();
    for (let index = 0; index < 130; index++) f.socket.message({ type: 'icecandidate', candidate: { candidate: `candidate:${index}`, sdpMLineIndex: 0 } });
    await flush();
    expect(f.camera.state).toMatchObject({ phase: 'failed', code: 'live_invalid_response' });
    expect(f.videoTrack.stop).toHaveBeenCalled();
  });

  it('preempts an unfinished permission request when the server stops', async () => {
    let resolve!: (stream: MediaStream) => void;
    const f = fixture({ getUserMedia: () => new Promise(done => { resolve = done; }) });
    f.camera.start({ socket: f.socket as unknown as WebSocket, maxDurationSeconds: 60 });
    f.socket.message({ type: 'iceservers', iceServers: [] }); await flush();
    f.socket.message({ type: 'stopped', code: 'live_allowance_exhausted' }); await flush();
    expect(f.camera.state.code).toBe('live_allowance_exhausted');
    const track = new Track(); resolve(asStream(new Stream([track]))); await flush();
    expect(track.stop).toHaveBeenCalled(); expect(f.createPeer).not.toHaveBeenCalled();
  });

  it('does not accept microphone or data-channel offers', async () => {
    const f = fixture();
    f.peer.createOffer.mockResolvedValue({ type: 'offer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' });
    await connect(f);
    expect(f.camera.state.code).toBe('live_invalid_offer');
    expect(f.socket.sent.some(message => message.type === 'offer')).toBe(false);
  });

  it('limits setup, respects the remaining lease, and never reconnects', async () => {
    const stalled = await connect(); await vi.advanceTimersByTimeAsync(30_000);
    expect(stalled.camera.state.code).toBe('live_negotiation_timeout');
    const f = await becomeLive(); f.socket.message({ type: 'ready', session_seconds_remaining: 2 }); await flush();
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.camera.state).toMatchObject({ phase: 'stopped', code: 'live_session_limit' });
    expect(f.createPeer).toHaveBeenCalledOnce();
  });

  it('validates selection commands and forwards safe acknowledgement codes', async () => {
    const f = await becomeLive();
    const selection = { top: { source: 'wardrobe' as const, item_id: '00000000-0000-0000-0000-000000000001' } };
    expect(f.camera.select(1, selection)).toBe(true);
    expect(f.camera.select(1, selection)).toBe(false);
    expect(f.camera.select(2, { shoes: selection.top })).toBe(false);
    f.socket.message({ type: 'select_rejected', seq: 1, code: 'selection_item_unavailable' });
    expect(f.onSelectEvent).toHaveBeenCalledWith({ type: 'rejected', seq: 1, code: 'selection_item_unavailable' });
    expect(f.camera.state.phase).toBe('live');
  });

  it('rejects malformed or oversized messages and hides provider text', async () => {
    const f = await connect(); f.socket.message({ type: 'error', code: 'secret https://provider.example/key' });
    expect(f.camera.state.code).toBe('live_session_ended');
    const second = await connect(); second.socket.dispatchEvent(new MessageEvent('message', { data: 'x'.repeat(131073) }));
    expect(second.camera.state.code).toBe('live_invalid_response');
  });
});

describe('in-session camera changes', () => {
  it('replaces the video track and hides old AI until ten fresh frames and 600ms', async () => {
    const f = await becomeLive();
    const replacement = new Track(); f.getUserMedia.mockResolvedValueOnce(asStream(new Stream([replacement])));
    const switching = f.camera.switchCamera(); await flush();
    expect(f.camera.state).toMatchObject({ phase: 'switching', hasRemoteFrame: false, facing: 'environment' });
    expect(f.videoTrack.stop).toHaveBeenCalled();
    expect(f.peer.sender.replaceTrack).toHaveBeenCalledWith(replacement);
    for (let index = 0; index < 10; index++) f.remoteVideo.frame();
    expect(f.camera.state.hasRemoteFrame).toBe(false);
    await vi.advanceTimersByTimeAsync(601); f.remoteVideo.frame();
    expect(await switching).toBe(true);
    expect(f.camera.state).toMatchObject({ phase: 'live', hasRemoteFrame: true });
    expect(f.peer.createOffer).toHaveBeenCalledOnce();
  });

  it('ends capture rather than revealing stale AI when switched frames never arrive', async () => {
    const f = await becomeLive();
    const replacement = new Track(); f.getUserMedia.mockResolvedValueOnce(asStream(new Stream([replacement])));
    const switching = f.camera.switchCamera(); await flush();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await switching).toBe(false);
    expect(f.camera.state.code).toBe('live_camera_switch_failed');
    expect(replacement.stop).toHaveBeenCalled(); expect(f.remoteVideo.srcObject).toBeNull();
  });

  it('releases a replacement stream while a native replaceTrack promise is stalled', async () => {
    const f = await becomeLive();
    const replacement = new Track(); f.getUserMedia.mockResolvedValueOnce(asStream(new Stream([replacement])));
    f.peer.sender.replaceTrack.mockImplementation(() => new Promise(() => {}));
    const switching = f.camera.switchCamera(); await flush(); f.camera.stop();
    expect(await switching).toBe(false); expect(replacement.stop).toHaveBeenCalled();
  });
});

describe('ICE configuration validation', () => {
  it('accepts only bounded STUN/TURN server lists', () => {
    expect(parseIceServers({ iceServers: [{ urls: 'stun:stun.example.test' }] })).toEqual([{ urls: ['stun:stun.example.test'] }]);
    expect(parseIceServers({})).toBeNull();
    for (const iceServers of [[{ urls: 'https://provider.example/token' }], [{ urls: [] }], Array.from({ length: 17 }, () => ({ urls: 'stun:test' }))]) {
      expect(() => parseIceServers({ iceServers })).toThrow();
    }
  });
});
