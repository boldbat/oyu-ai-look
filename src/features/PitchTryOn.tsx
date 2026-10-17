import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Camera,
  Check,
  FlipHorizontal2,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Shirt,
  Sparkles,
  Square,
  Video,
  X,
} from 'lucide-react';
import {
  createDecartSocket,
  DecartApiError,
  decartErrorMessage,
  decartStatus,
  updateDecartReference,
} from '../lib/decart-api';
import { BrowserLiveCamera, type LiveCameraState } from '../lib/live-camera';
import { useApp } from '../lib/store';
import type { CloudUser } from '../lib/firebase-preferences';
import './pitch.css';

const DURATION = 30;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const initialState: LiveCameraState = {
  phase: 'idle',
  localStream: null,
  remoteStream: null,
  hasRemoteFrame: false,
  remainingSeconds: null,
  facing: 'user',
  code: null,
  width: 0,
  height: 0,
  fps: 0,
};
const terminal = (phase: string) => ['idle', 'stopped', 'failed'].includes(phase);
type Reference = { key: string; name: string; image: string; file?: File };
const cameraMessages: Record<string, string> = {
  live_camera_permission_denied:
    'Allow camera access in your browser’s site settings, then try again.',
  live_camera_unsupported:
    'Open this page over HTTPS or localhost in a current Safari, Chrome, or Edge browser.',
  live_camera_unavailable: 'The camera could not start. Close other apps using it, then try again.',
  live_camera_timeout:
    'Camera permission took too long. Check your browser’s camera permission and try again.',
  live_camera_ended: 'The camera disconnected. Check it before starting again.',
  live_camera_switch_failed:
    'That camera is unavailable or could not switch safely. Start again to continue.',
  live_backgrounded: 'Your camera and live session stopped when you left this tab.',
  live_context_changed: 'Your camera and live session have stopped.',
  live_session_limit: 'Your 30-second try-on has finished. Start again when you’re ready.',
  live_session_ended: 'Your camera and live session have stopped.',
  live_connection_failed: 'The live connection failed. Check your connection and try again.',
  live_connection_closed: 'The live connection closed. Start again when you’re ready.',
  live_stream_failed: 'The AI video connection ended. Check your connection and try again.',
  live_stream_ended: 'The AI video stream ended. Start again when you’re ready.',
  live_negotiation_timeout: 'No AI video arrived in time. Check your connection and try again.',
  live_playback_unavailable:
    'Your browser could not play the AI video. Reload this page and try again.',
  live_invalid_response:
    'The live service returned an unexpected response. Start again to reconnect.',
};
function explain(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return cameraMessages[code] ?? decartErrorMessage(code ? new DecartApiError(code) : error);
}
function validImage(blob: Blob) {
  if (!IMAGE_TYPES.includes(blob.type))
    throw new Error('Choose a PNG, JPEG, or WebP garment photo.');
  if (!blob.size || blob.size > MAX_IMAGE_BYTES)
    throw new Error('Choose a garment photo smaller than 4 MB.');
}
async function referenceBlob(reference: Reference, signal: AbortSignal): Promise<Blob> {
  if (reference.file) {
    validImage(reference.file);
    return reference.file;
  }
  const url = new URL(reference.image, window.location.href);
  if (
    !(url.protocol === 'data:' && /^data:image\/(png|jpeg|webp)[;,]/i.test(reference.image)) &&
    !(url.origin === window.location.origin && ['http:', 'https:', 'blob:'].includes(url.protocol))
  ) {
    throw new Error('Upload this garment photo from your device to try it on.');
  }
  const response = await fetch(url, { signal, credentials: 'same-origin', redirect: 'error' });
  if (!response.ok)
    throw new Error(
      'This garment photo could not be loaded. Choose another piece or upload a photo.',
    );
  const blob = await response.blob();
  validImage(blob);
  return blob;
}

export function PitchTryOn({ covered = false }: { covered?: boolean }) {
  const { data, accountOpen } = useApp();
  const garments = data.garments.filter(
    (item) => ['top', 'bottom', 'dress', 'outerwear'].includes(item.category) && item.image,
  );
  const [selectedId, setSelectedId] = useState(() => garments[0]?.id ?? '');
  const [upload, setUpload] = useState<Reference | null>(null);
  const reference: Reference | null =
    upload ??
    (() => {
      const item = garments.find((garment) => garment.id === selectedId);
      return item ? { key: item.id, name: item.name, image: item.image } : null;
    })();
  const [state, setState] = useState<LiveCameraState>(initialState);
  const [view, setView] = useState<'original' | 'ai'>('ai');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusVersion, setStatusVersion] = useState(0);
  const [starting, setStarting] = useState(false);
  const [changing, setChanging] = useState(false);
  const [applied, setApplied] = useState<Reference | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const camera = useRef<BrowserLiveCamera | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const operation = useRef<AbortController | null>(null);
  const referenceRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const blocked = useRef(covered || accountOpen);
  blocked.current = covered || accountOpen;
  const epoch = useRef(0);
  const startLock = useRef(false);
  const nextSequence = useRef(0);
  const pending = useRef<{ seq: number; reference: Reference } | null>(null);
  const applyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadUrl = useRef('');
  const switchingPreview = useRef(false);
  const active = ['connecting', 'negotiating', 'waiting-for-frame', 'live', 'switching'].includes(
    state.phase,
  );
  const previewing = state.phase === 'preview';
  const cameraOn = !terminal(state.phase);
  const showOriginal = view === 'original' || !state.hasRemoteFrame;
  const choosingDisabled = starting || changing || (active && state.phase !== 'live');
  const changed = reference?.key !== applied?.key;

  function clearPending() {
    if (applyTimer.current !== null) clearTimeout(applyTimer.current);
    applyTimer.current = null;
    pending.current = null;
    referenceRequest.current?.abort();
    referenceRequest.current = null;
  }
  function cancelOperation() {
    epoch.current++;
    startLock.current = false;
    operation.current?.abort();
    operation.current = null;
    clearPending();
  }
  function closeSocket() {
    const current = socket.current;
    socket.current = null;
    if (current && current.readyState < 2) current.close();
  }
  function stop(code = 'user_stopped') {
    cancelOperation();
    camera.current?.stop(code);
    closeSocket();
    setStarting(false);
    setChanging(false);
    if (code === 'user_stopped') setNotice('Camera off. Your live session has ended.');
  }
  useEffect(() => {
    if (!localVideo.current || !remoteVideo.current) return;
    mounted.current = true;
    let previousPhase = 'idle';
    const controller = new BrowserLiveCamera({
      localVideo: localVideo.current,
      remoteVideo: remoteVideo.current,
      isContextCurrent: () => mounted.current && !blocked.current,
      onState: (next) => {
        if (!mounted.current) return;
        const ended = !terminal(previousPhase) && terminal(next.phase);
        previousPhase = next.phase;
        setState(next);
        if (ended) {
          cancelOperation();
          closeSocket();
          setStarting(false);
          setChanging(false);
          if (
            next.code &&
            next.code !== 'user_stopped' &&
            next.code !== 'live_cancelled' &&
            !(switchingPreview.current && next.code === 'live_session_ended')
          ) {
            const message = explain({ code: next.code });
            if (next.phase === 'failed') setError(message);
            else setNotice(message);
          }
        }
      },
      onSelectEvent: (event) => {
        const update = pending.current;
        if (!mounted.current || !update || event.seq !== update.seq) return;
        if (event.type === 'applied') {
          setApplied(update.reference);
          setChanging(false);
          setNotice(`${update.reference.name} is applied.`);
          clearPending();
        } else if (event.type === 'rejected') {
          setChanging(false);
          setError(explain({ code: event.code ?? 'reference_rejected' }));
          clearPending();
        }
      },
    });
    camera.current = controller;
    setState(initialState);
    return () => {
      mounted.current = false;
      cancelOperation();
      controller.stop('live_context_changed');
      closeSocket();
      if (camera.current === controller) camera.current = null;
    };
  }, []);
  useEffect(() => {
    if (
      (covered || accountOpen) &&
      (startLock.current || (camera.current && !terminal(camera.current.state.phase)))
    )
      stop('live_context_changed');
  }, [covered, accountOpen]);
  useEffect(() => {
    const abort = new AbortController();
    setConfigured(null);
    setStatusError('');
    void decartStatus(abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) {
          setConfigured(result.configured);
          setRequiresSignIn(result.requiresSignIn === true);
        }
      })
      .catch((cause) => {
        if (!abort.signal.aborted) {
          setConfigured(false);
          setStatusError(explain(cause));
        }
      });
    return () => abort.abort();
  }, [statusVersion]);
  useEffect(() => {
    if (!requiresSignIn) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void import('../lib/firebase-preferences')
      .then((sdk) => {
        if (!active) return;
        unsubscribe = sdk.observeCloudUser(
          (user) => {
            if (active) setCloudUser(user);
          },
          (cause) => {
            if (active) setError(sdk.cloudErrorMessage(cause));
          },
        );
      })
      .catch(() => {
        if (active) setError('Google sign-in could not load. Reload and try again.');
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [requiresSignIn]);
  useEffect(
    () => () => {
      if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current);
    },
    [],
  );

  function canOpenCamera() {
    if (document.visibilityState === 'hidden') {
      setError('Bring this browser tab into view before starting your camera.');
      return false;
    }
    return !blocked.current && !!camera.current;
  }
  async function prepare() {
    if (startLock.current || !canOpenCamera()) return;
    const controller = camera.current!;
    setError('');
    setNotice('');
    try {
      await controller.prepare();
    } catch (cause) {
      if (
        mounted.current &&
        camera.current === controller &&
        cause &&
        (cause as { code?: string }).code !== 'live_cancelled'
      )
        setError(explain(cause));
    }
  }
  async function start() {
    if (
      startLock.current ||
      active ||
      !reference ||
      !configured ||
      (requiresSignIn && !cloudUser) ||
      !canOpenCamera()
    )
      return;
    const controller = camera.current!;
    const chosen = reference;
    const generation = ++epoch.current;
    const abort = new AbortController();
    operation.current = abort;
    startLock.current = true;
    const current = () =>
      mounted.current &&
      !abort.signal.aborted &&
      generation === epoch.current &&
      camera.current === controller &&
      !blocked.current &&
      document.visibilityState !== 'hidden';
    setStarting(true);
    setError('');
    setNotice('');
    setApplied(null);
    setView('ai');
    localVideo.current
      ?.closest('.pitch-camera')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const idToken = requiresSignIn
        ? await (await import('../lib/firebase-preferences')).getCloudIdToken()
        : undefined;
      if (!current()) return;
      if (controller.state.phase !== 'preview') await controller.prepare();
      if (!current()) return;
      const image = await referenceBlob(chosen, abort.signal);
      if (!current()) return;
      const result = await createDecartSocket(
        image,
        DURATION,
        abort.signal,
        idToken ? { transport: 'websocket-init', idToken } : undefined,
      );
      if (!current()) {
        result.socket.close();
        return;
      }
      socket.current = result.socket;
      nextSequence.current = 0;
      setApplied(chosen);
      controller.start({
        socket: result.socket,
        maxDurationSeconds: Math.min(DURATION, result.maxDurationSeconds),
      });
    } catch (cause) {
      if (current()) {
        stop();
        setNotice('');
        setError(cause instanceof Error && !('code' in cause) ? cause.message : explain(cause));
      }
    } finally {
      if (generation === epoch.current) {
        startLock.current = false;
        if (mounted.current) setStarting(false);
      }
    }
  }
  async function signInForLive() {
    if (signingIn) return;
    setSigningIn(true);
    setError('');
    try {
      const sdk = await import('../lib/firebase-preferences');
      try {
        await sdk.connectGoogle();
      } catch (cause) {
        if (mounted.current) setError(sdk.cloudErrorMessage(cause));
      }
    } catch {
      if (mounted.current) setError('Google sign-in could not load. Reload and try again.');
    } finally {
      if (mounted.current) setSigningIn(false);
    }
  }
  async function switchCamera() {
    if (!camera.current || starting || changing) return;
    setError('');
    setNotice('');
    switchingPreview.current = camera.current.state.phase === 'preview';
    try {
      await camera.current.switchCamera();
    } finally {
      switchingPreview.current = false;
    }
  }
  async function applyReference() {
    if (
      !reference ||
      !changed ||
      changing ||
      pending.current ||
      state.phase !== 'live' ||
      !socket.current ||
      socket.current.readyState !== 1
    )
      return;
    const chosen = reference;
    const transport = socket.current;
    const generation = epoch.current;
    // The live socket keeps the Start signal; aborting this independent upload
    // cannot accidentally close a still-running, unchanged connection.
    const abort = new AbortController();
    referenceRequest.current = abort;
    const seq = ++nextSequence.current;
    pending.current = { seq, reference: chosen };
    const current = () =>
      mounted.current &&
      generation === epoch.current &&
      socket.current === transport &&
      pending.current?.seq === seq;
    setChanging(true);
    setError('');
    setNotice('');
    applyTimer.current = setTimeout(() => {
      if (!current()) return;
      abort.abort();
      stop();
      setNotice('');
      setError(
        'The new garment was not confirmed in time. The session stopped; start again to try it.',
      );
    }, 15_000);
    try {
      const image = await referenceBlob(chosen, abort.signal);
      if (!current()) return;
      await updateDecartReference(transport, image, seq, abort.signal);
    } catch (cause) {
      if (current()) {
        clearPending();
        setChanging(false);
        setError(cause instanceof Error && !('code' in cause) ? cause.message : explain(cause));
      }
    }
  }
  function chooseUpload(file: File | undefined) {
    if (!file || choosingDisabled) return;
    try {
      validImage(file);
      const url = URL.createObjectURL(file);
      if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current);
      uploadUrl.current = url;
      setUpload({
        key: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, '') || 'Your garment',
        image: url,
        file,
      });
      setError('');
      setNotice('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This photo could not be opened.');
    }
  }
  function clearUpload() {
    setUpload(null);
    if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current);
    uploadUrl.current = '';
    if (fileInput.current) fileInput.current.value = '';
  }
  const statusLabel =
    state.phase === 'live'
      ? 'AI video live'
      : state.phase === 'switching'
        ? 'Switching camera'
        : active || starting
          ? 'Connecting AI video'
          : previewing
            ? 'Private camera preview'
            : state.phase === 'requesting-camera'
              ? 'Opening camera'
              : 'Camera off';
  return (
    <div className="pitch-page feature-page">
      <div className="page-heading pitch-heading">
        <div>
          <p className="eyebrow">YOUR WARDROBE. IN MOTION.</p>
          <h1>Your next look. In real time.</h1>
          <p className="muted">Pick a piece. Step into frame. See it move with you.</p>
        </div>
        <span className="pitch-powered">
          <Sparkles size={14} /> Powered by Decart
        </span>
      </div>
      <div className="pitch-layout">
        <section className="card pitch-camera" aria-label="Live virtual fitting room">
          <div className="pitch-camera-bar">
            <span
              className={`pitch-status ${state.phase === 'live' ? 'is-live' : ''}`}
              role="status"
            >
              <i />
              {statusLabel}
            </span>
            <div className="pitch-view-toggle" aria-label="Video view">
              <button
                onClick={() => setView('original')}
                className={showOriginal ? 'selected' : ''}
                aria-pressed={showOriginal}
              >
                Original
              </button>
              <button
                onClick={() => setView('ai')}
                disabled={!state.hasRemoteFrame}
                className={!showOriginal ? 'selected' : ''}
                aria-pressed={!showOriginal}
              >
                AI try-on
              </button>
            </div>
          </div>
          <div className={`pitch-viewport ${!cameraOn ? 'camera-off' : ''}`}>
            <video
              ref={localVideo}
              muted
              autoPlay
              playsInline
              aria-label="Original camera video"
              className={`pitch-video ${!showOriginal ? 'is-hidden' : ''}`}
            />
            <video
              ref={remoteVideo}
              muted
              autoPlay
              playsInline
              aria-label="AI generated try-on video"
              className={`pitch-video ${showOriginal ? 'is-hidden' : ''}`}
            />
            {!cameraOn && (
              <div className="pitch-empty">
                <div className="pitch-camera-symbol">
                  <Camera size={38} strokeWidth={1.2} />
                </div>
                <p className="pitch-empty-title">
                  A fitting room.
                  <br />A little more possibility.
                </p>
                <p>
                  Step back so your outfit is in frame.
                  <br />
                  Good light makes all the difference.
                </p>
                <button
                  className="button"
                  onClick={() => void prepare()}
                  disabled={starting || covered || accountOpen}
                >
                  <Camera size={16} /> Enable camera
                </button>
                <small>Preview stays on your device.</small>
              </div>
            )}
            {(state.phase === 'requesting-camera' ||
              ((active || starting) && !state.hasRemoteFrame)) && (
              <div className="pitch-connecting" role="status">
                <LoaderCircle size={17} className="spin" />
                {state.phase === 'requesting-camera'
                  ? 'Waiting for camera permission…'
                  : 'Connecting your AI fitting room…'}
              </div>
            )}
            {cameraOn && (
              <span className="pitch-video-caption">
                {showOriginal ? 'Original camera' : 'AI generated · appearance may vary'}
              </span>
            )}
            {active && state.remainingSeconds !== null && (
              <span
                className="pitch-countdown"
                aria-label={`${state.remainingSeconds} seconds remaining`}
              >
                <span className="pitch-record-dot" />
                0:{String(state.remainingSeconds).padStart(2, '0')}
              </span>
            )}
            {changing && (
              <div className="pitch-applying" role="status">
                <LoaderCircle size={15} className="spin" /> Applying your selected garment…
              </div>
            )}
          </div>
          <div className="pitch-camera-footer">
            <span>
              <ShieldCheck size={15} /> Camera only. No microphone.
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="Switch front or rear camera"
                title="Switch camera"
                disabled={!['preview', 'live'].includes(state.phase) || starting || changing}
                onClick={() => void switchCamera()}
              >
                <FlipHorizontal2 size={18} />
              </button>
              <button
                className="button small secondary pitch-stop"
                onClick={() => stop()}
                disabled={!cameraOn && !starting}
              >
                <Square size={13} fill="currentColor" /> Stop
              </button>
            </div>
          </div>
          {error && (
            <div className="pitch-message is-error" role="alert">
              {error}
            </div>
          )}
          {notice && !error && (
            <div className="pitch-message" role="status">
              {notice}
            </div>
          )}
        </section>
        <section className="card pitch-wardrobe" aria-labelledby="pitch-wardrobe-heading">
          <div className="pitch-panel-heading">
            <div>
              <p className="eyebrow">01 / PICK YOUR PIECE</p>
              <h2 id="pitch-wardrobe-heading">What’s your next look?</h2>
            </div>
            <Shirt size={23} strokeWidth={1.2} />
          </div>
          <div className="pitch-garments" aria-label="Garment references">
            {garments.map((item) => (
              <button
                key={item.id}
                className={`pitch-garment ${!upload && selectedId === item.id ? 'selected' : ''}`}
                disabled={choosingDisabled}
                onClick={() => {
                  clearUpload();
                  setSelectedId(item.id);
                  setError('');
                  setNotice('');
                }}
                aria-pressed={!upload && selectedId === item.id}
              >
                <span className="pitch-garment-image">
                  <img src={item.image} alt="" />
                  {!upload && selectedId === item.id && (
                    <i>
                      <Check size={13} />
                    </i>
                  )}
                </span>
                <strong>{item.name}</strong>
                <small>{item.color}</small>
              </button>
            ))}
          </div>
          <input
            ref={fileInput}
            id="pitch-garment-upload"
            className="pitch-file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={choosingDisabled}
            onChange={(event) => {
              chooseUpload(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          {upload ? (
            <div className="pitch-upload-preview">
              <img src={upload.image} alt="Selected garment reference" />
              <div>
                <strong>{upload.name}</strong>
                <small>From your device</small>
              </div>
              <button
                className="icon-button"
                aria-label="Remove uploaded garment"
                disabled={choosingDisabled}
                onClick={clearUpload}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              className="pitch-upload-button"
              disabled={choosingDisabled}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus size={19} />
              <span>
                <strong>Try a garment of your own</strong>
                <small>Upload PNG, JPEG or WebP · up to 4 MB</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          )}
          <div className="pitch-start-panel">
            <div className="pitch-start-heading">
              <p className="eyebrow">02 / MAKE IT YOURS</p>
              <span>30-second session</span>
            </div>
            {active ? (
              <>
                <p className="pitch-selected-note">
                  {applied ? (
                    <>
                      Trying on <strong>{applied.name}</strong>
                    </>
                  ) : (
                    'Your live fitting room is connecting.'
                  )}
                </p>
                <button
                  className="button full-width"
                  disabled={state.phase !== 'live' || !changed || !reference || changing}
                  onClick={() => void applyReference()}
                >
                  {changing ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
                  {changing
                    ? 'Applying garment…'
                    : state.phase !== 'live'
                      ? 'Connecting AI video…'
                      : changed
                        ? 'Apply selected garment'
                        : 'Your selected garment is applied'}
                </button>
                <p className="pitch-disclosure">
                  Choose another piece to change your look during this session.
                </p>
              </>
            ) : (
              <>
                <p className="pitch-selected-note">
                  {reference ? (
                    <>
                      Ready to try <strong>{reference.name}</strong>?
                    </>
                  ) : (
                    'Choose a piece or upload a garment photo to begin.'
                  )}
                </p>
                {requiresSignIn && !cloudUser && (
                  <button
                    className="button secondary full-width"
                    onClick={() => void signInForLive()}
                    disabled={signingIn}
                  >
                    {signingIn ? 'Opening Google…' : 'Sign in with Google for live try-on'}
                  </button>
                )}
                {requiresSignIn && cloudUser && (
                  <p className="pitch-service-status">
                    Signed in as {cloudUser.email || cloudUser.displayName}
                  </p>
                )}
                <button
                  className="button full-width pitch-start"
                  onClick={() => void start()}
                  disabled={
                    !reference ||
                    !configured ||
                    (requiresSignIn && !cloudUser) ||
                    starting ||
                    state.phase === 'requesting-camera' ||
                    covered ||
                    accountOpen
                  }
                >
                  {starting ? <LoaderCircle size={16} className="spin" /> : <Video size={16} />}
                  {starting ? 'Starting live try-on…' : 'Start live try-on'}
                  {!starting && <ArrowUpRight size={16} />}
                </button>
                <p className="pitch-disclosure">
                  Start sends your camera video and selected garment image to Decart for live AI
                  processing. Your session ends after 30 seconds, when you press Stop, or when you
                  leave this tab.
                </p>
              </>
            )}
            {configured === null && (
              <p className="pitch-service-status" role="status">
                <LoaderCircle size={12} className="spin" /> Checking live service…
              </p>
            )}
            {configured === false && (
              <div className="pitch-service-error" role="status">
                <p>
                  {statusError ||
                    'Live try-on is not configured yet. Ask the demo host to connect Decart.'}
                </p>
                <button onClick={() => setStatusVersion((value) => value + 1)}>
                  <RefreshCw size={13} /> Check again
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
      <p className="pitch-bottom-note">
        <Sparkles size={14} /> A live style preview. Your movement, a new possibility.
      </p>
      {(active || starting) && (
        <button className="pitch-mobile-stop" onClick={() => stop()}>
          <Square size={13} fill="currentColor" /> Stop live try-on
          {state.remainingSeconds !== null && <span>{state.remainingSeconds}s</span>}
        </button>
      )}
    </div>
  );
}
export default PitchTryOn;
