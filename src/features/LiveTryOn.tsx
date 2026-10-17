import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  FlipHorizontal2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Shirt,
  Square,
  Video,
  X,
} from 'lucide-react';
import {
  accountApi,
  apiErrorMessage,
  ApiError,
  isValidFittingRoomSelection,
  newOperationKey,
} from '../lib/api';
import type {
  FittingRoomCandidate,
  FittingRoomReadiness,
  FittingRoomSelection,
  FittingRoomSlot,
} from '../lib/api';
import { BrowserLiveCamera } from '../lib/live-camera';
import { useApp } from '../lib/store';
import './live.css';

const lanes: { id: FittingRoomSlot; label: string }[] = [
  { id: 'top', label: 'Tops' },
  { id: 'bottom', label: 'Bottoms' },
  { id: 'dress', label: 'Dresses' },
  { id: 'shoes', label: 'Shoes' },
];
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
type CameraState = {
  phase: string;
  hasRemoteFrame: boolean;
  remainingSeconds: number | null;
  code: string | null;
  width: number;
  height: number;
  fps: number;
};
const initial: CameraState = {
  phase: 'idle',
  hasRemoteFrame: false,
  remainingSeconds: null,
  code: null,
  width: 0,
  height: 0,
  fps: 0,
};
const terminal = (phase: string) => ['idle', 'stopped', 'failed'].includes(phase);
const messages: Record<string, string> = {
  camera_permission_denied:
    'Camera access was denied. Allow it in your browser’s site settings, then try again.',
  permission_denied: 'Allow camera access in your browser’s site settings, then try again.',
  camera_not_found: 'No camera was found. Connect a camera and try again.',
  camera_unavailable: 'Your camera could not start. Close other apps using it and try again.',
  insecure_context: 'Camera access requires HTTPS or localhost.',
  unsupported_browser:
    'This browser does not support live camera try-on. Use a current Safari, Chrome, or Edge browser.',
  idle_timeout:
    'Live preview stopped after 20 seconds without interaction. Start again when you’re ready.',
  page_hidden: 'The camera stopped when you left the tab.',
  covered: 'The camera stopped when another panel opened.',
  camera_stopped: 'Your camera session has ended.',
  remote_frame_timeout: 'No AI video arrived. Check your connection, then start a new session.',
  connection_failed: 'The live connection ended. Check your connection before starting again.',
  live_camera_permission_denied:
    'Camera access was denied. Allow it in your browser’s site settings, then try again.',
  live_camera_unavailable: 'Your camera could not start. Close other apps using it and try again.',
  live_camera_unsupported:
    'This browser cannot open the camera here. Use HTTPS or localhost in a current Safari, Chrome, or Edge browser.',
  live_camera_timeout:
    'Camera permission took too long. Check your browser’s camera permission and try again.',
  live_camera_ended: 'Your camera disconnected or stopped. Check the camera before starting again.',
  live_camera_switch_failed:
    'The camera could not switch safely. The session stopped; start again to continue.',
  live_backgrounded: 'The camera stopped when you left the tab.',
  live_context_changed: 'The camera stopped because your account changed.',
  live_cancelled: 'Your camera session has ended.',
  live_connection_failed: 'The live connection ended. Check your connection before starting again.',
  live_connection_closed: 'The live connection closed. Start a new session when you’re ready.',
  live_stream_failed: 'The AI video connection ended. Check your connection before starting again.',
  live_negotiation_timeout:
    'No AI video arrived in time. Check your connection, then start a new session.',
  live_session_ended: 'Your camera session has ended.',
  live_transport_invalid: 'The camera connection could not start. Please start a new session.',
};
function explain(code: string) {
  return messages[code] || apiErrorMessage(new ApiError(code, code.replaceAll('_', ' ')));
}

function GarmentImage({ item }: { item: FittingRoomCandidate }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    void accountApi
      .fittingRoomItemImage(item.source, item.item_id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.source, item.item_id]);
  return url ? <img src={url} alt="" /> : <Shirt size={30} strokeWidth={1} />;
}

export function LiveTryOn({ covered = false }: { covered?: boolean }) {
  const { openAccount, accountOpen, data } = useApp();
  const user = useSyncExternalStore(accountApi.subscribe, () => accountApi.currentUser);
  const local = useRef<HTMLVideoElement>(null);
  const remote = useRef<HTMLVideoElement>(null);
  const camera = useRef<BrowserLiveCamera | null>(null);
  const mountedView = useRef(false);
  const [state, setState] = useState<CameraState>(initial);
  const [view, setView] = useState<'ai' | 'original'>('ai');
  const [readiness, setReadiness] = useState<FittingRoomReadiness | null>(null);
  const [lane, setLane] = useState<FittingRoomSlot>('top');
  const [items, setItems] = useState<FittingRoomCandidate[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selection, setSelection] = useState<FittingRoomSelection>({});
  const [confirmed, setConfirmed] = useState<FittingRoomSelection>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [sessionLength, setSessionLength] = useState(20);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [idleLeft, setIdleLeft] = useState(20);
  const [reload, setReload] = useState(0);
  const epoch = useRef(0);
  const session = useRef<{ id: string; ownerId: string } | null>(null);
  const sessionCleanup = useRef<Promise<void>>(Promise.resolve());
  const startTask = useRef<Promise<void>>(Promise.resolve());
  const liveRequest = useRef<AbortController | null>(null);
  const operation = useRef<{ digest: string; key: string } | null>(null);
  const startLock = useRef<number | null>(null);
  const selected = useRef(selection);
  selected.current = selection;
  const sequence = useRef(0);
  const pendingSelection = useRef<{ seq: number; selection: FittingRoomSelection } | null>(null);
  const lastTouch = useRef(Date.now());
  const candidateGeneration = useRef(0);
  const candidatePage = useRef<AbortController | null>(null);
  const candidateScope = useRef<{
    generation: number;
    lane: FittingRoomSlot;
    ownerId: string;
    selection: FittingRoomSelection;
  } | null>(null);
  const currentLane = useRef(lane);
  currentLane.current = lane;
  const active = ['connecting', 'negotiating', 'waiting-for-frame', 'live', 'switching'].includes(
    state.phase,
  );
  const previewing = state.phase === 'preview';

  function withdrawSession(id: string, ownerId: string) {
    const generation = epoch.current;
    const withdrawal =
      accountApi.currentUser?.id === ownerId
        ? accountApi.stopLiveSession(id).catch(() => {
            if (
              mountedView.current &&
              generation === epoch.current &&
              accountApi.currentUser?.id === ownerId
            )
              setNotice(
                'Camera stopped. The service will close the reserved session at its time limit; its stop confirmation could not be reached.',
              );
          })
        : Promise.resolve();
    sessionCleanup.current = Promise.all([sessionCleanup.current, withdrawal]).then(
      () => undefined,
    );
    return sessionCleanup.current;
  }
  function releaseSession() {
    const reserved = session.current;
    session.current = null;
    if (reserved) return withdrawSession(reserved.id, reserved.ownerId);
    return sessionCleanup.current;
  }
  function cancelStart() {
    epoch.current++;
    startLock.current = null;
    liveRequest.current?.abort();
    liveRequest.current = null;
  }
  function stop(reason = 'camera_stopped') {
    cancelStart();
    camera.current?.stop(reason);
    releaseSession();
    setStarting(false);
    setChanging(false);
    setConsent(false);
    pendingSelection.current = null;
  }
  useEffect(() => {
    if (!local.current || !remote.current) return;
    let mounted = true;
    mountedView.current = true;
    let previousPhase = 'idle';
    const ownerId = user?.id;
    const controller = new BrowserLiveCamera({
      localVideo: local.current,
      remoteVideo: remote.current,
      isContextCurrent: () => mounted && accountApi.currentUser?.id === ownerId,
      onState: (next) => {
        if (!mounted) return;
        const ended = !terminal(previousPhase) && terminal(next.phase);
        previousPhase = next.phase;
        setState(next);
        if (terminal(next.phase)) {
          // A camera-ended/background callback must also cancel HTTP work that
          // has not handed its socket to this controller yet. An initial idle
          // notification must not cancel a newly requested Start.
          if (ended) cancelStart();
          releaseSession();
          setStarting(false);
          setChanging(false);
          if (next.phase !== 'idle') setConsent(false);
          pendingSelection.current = null;
          if (next.code && next.code !== 'user_stopped') setNotice(explain(next.code));
        }
      },
      onSelectEvent: (event) => {
        const pending = pendingSelection.current;
        if (!mounted || !pending || event.seq !== pending.seq) return;
        if (event.type === 'applied') {
          setConfirmed(pending.selection);
          setChanging(false);
          pendingSelection.current = null;
          setNotice('Your new pieces are applied.');
        } else if (event.type === 'rejected') {
          setChanging(false);
          pendingSelection.current = null;
          setError(explain(event.code || 'selection_item_unavailable'));
        }
      },
    });
    camera.current = controller;
    setState(initial);
    setSelection({});
    setConfirmed({});
    setItems([]);
    setReadiness(null);
    setNames({});
    setCursor(null);
    setLoading(false);
    setStarting(false);
    setChanging(false);
    setNotice('');
    operation.current = null;
    setConsent(false);
    setError('');
    return () => {
      mounted = false;
      mountedView.current = false;
      cancelStart();
      candidateGeneration.current++;
      candidatePage.current?.abort();
      controller.stop('user_stopped');
      camera.current = null;
      releaseSession();
    };
  }, [user?.id]);
  useEffect(() => {
    if (
      (covered || accountOpen) &&
      (startLock.current !== null || !terminal(camera.current?.state.phase ?? 'idle'))
    )
      stop('covered');
  }, [covered, accountOpen]);
  useEffect(() => {
    // The controller has no lifecycle listeners while a new Start is queued
    // behind an earlier reservation. Cancel that HTTP intent here too.
    const hidden = () => {
      if (
        document.visibilityState === 'hidden' &&
        (startLock.current !== null || !terminal(camera.current?.state.phase ?? 'idle'))
      )
        stop('live_backgrounded');
    };
    const leaving = () => stop('live_backgrounded');
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leaving);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leaving);
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    const abort = new AbortController();
    setReadiness(null);
    void accountApi
      .fittingRoomReadiness(abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) setReadiness(result);
      })
      .catch((cause) => {
        if (!abort.signal.aborted) setError(apiErrorMessage(cause));
      });
    return () => abort.abort();
  }, [user?.id, reload]);
  useEffect(() => {
    if (!user) return;
    const abort = new AbortController();
    const generation = ++candidateGeneration.current;
    candidatePage.current?.abort();
    candidatePage.current = null;
    const scope = { generation, lane, ownerId: user.id, selection: { ...selected.current } };
    candidateScope.current = scope;
    const current = () =>
      !abort.signal.aborted &&
      generation === candidateGeneration.current &&
      accountApi.currentUser?.id === scope.ownerId &&
      currentLane.current === lane;
    setLoading(true);
    setItems([]);
    setCursor(null);
    void accountApi
      .fittingRoomCandidates({ slot: lane, selection: scope.selection, limit: 20 }, abort.signal)
      .then((result) => {
        if (!current()) return;
        setItems(result.items);
        setCursor(result.next_cursor);
        setNames((current) => ({
          ...current,
          ...Object.fromEntries(result.items.map((item) => [item.item_id, item.name])),
        }));
      })
      .catch((cause) => {
        if (current()) setError(apiErrorMessage(cause));
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => {
      abort.abort();
      candidateGeneration.current++;
      candidatePage.current?.abort();
      candidatePage.current = null;
    };
  }, [user?.id, lane, reload]);
  useEffect(() => {
    if (!active) return;
    lastTouch.current = Date.now();
    const touch = () => {
      lastTouch.current = Date.now();
    };
    document.addEventListener('pointerdown', touch);
    document.addEventListener('keydown', touch);
    const tick = setInterval(() => {
      const left = Math.max(0, 20 - Math.floor((Date.now() - lastTouch.current) / 1000));
      setIdleLeft(left);
      if (left === 0) stop('idle_timeout');
    }, 500);
    return () => {
      clearInterval(tick);
      document.removeEventListener('pointerdown', touch);
      document.removeEventListener('keydown', touch);
    };
  }, [active]);

  async function prepare() {
    if (
      startLock.current !== null ||
      covered ||
      accountOpen ||
      document.visibilityState === 'hidden'
    )
      return;
    const controller = camera.current;
    if (!controller) return;
    const generation = ++epoch.current;
    setError('');
    setNotice('');
    try {
      await controller.prepare();
    } catch (cause) {
      if (generation === epoch.current && camera.current === controller)
        setError(explain((cause as { code?: string }).code || 'live_camera_unavailable'));
    }
  }
  async function start() {
    if (document.visibilityState === 'hidden') {
      setError('Bring this browser tab into view before starting your camera.');
      return;
    }
    if (!camera.current) {
      setError('Camera controls are not ready. Reload this page and try again.');
      return;
    }
    if (
      startLock.current !== null ||
      !user ||
      !consent ||
      covered ||
      accountOpen ||
      !isValidFittingRoomSelection(selection)
    )
      return;
    const generation = ++epoch.current;
    startLock.current = generation;
    const ownerId = user.id;
    const controller = camera.current;
    const abort = new AbortController();
    liveRequest.current = abort;
    const current = () =>
      !abort.signal.aborted &&
      generation === epoch.current &&
      camera.current === controller &&
      document.visibilityState !== 'hidden' &&
      accountApi.currentUser?.id === ownerId;
    const previous = startTask.current;
    local.current
      ?.closest('.live-camera-card')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setStarting(true);
    setError('');
    setNotice('');
    const task = (async () => {
      try {
        // A cancelled reservation may still return an ID. Wait until the prior
        // attempt has withdrawn it before asking for another metered visit.
        await previous;
        await sessionCleanup.current;
        if (!current()) return;
        if (controller.state.phase !== 'preview') await controller.prepare();
        if (!current()) return;
        const available = await accountApi.fittingRoomReadiness(abort.signal);
        if (!current()) return;
        setReadiness(available);
        if (!available.ready)
          throw new ApiError(
            available.blockers[0] || 'live_preview_unavailable',
            'Live preview is currently unavailable.',
          );
        if (available.consent_policy_version !== 'live-try-on.decart.v3')
          throw new ApiError('live_contract_outdated', 'Live processing disclosure changed.');
        const outfit = { ...selected.current };
        const digest = JSON.stringify([ownerId, data.preferences.language, outfit]);
        if (operation.current?.digest !== digest)
          operation.current = { digest, key: newOperationKey() };
        const key = operation.current.key;
        // Keep this response observable after Stop so a committed reservation
        // can be withdrawn; aborting a POST could hide its successfully made ID.
        const reserved = await accountApi.createFittingRoomSession(
          outfit,
          {
            policy_version: 'live-try-on.decart.v3',
            granted: true,
            locale: data.preferences.language,
          },
          { idempotencyKey: key },
        );
        if (operation.current?.key === key) operation.current = null;
        if (!current()) {
          await withdrawSession(reserved.id, ownerId);
          return;
        }
        session.current = { id: reserved.id, ownerId };
        if (Date.parse(reserved.connect_before) <= Date.now())
          throw new ApiError(
            'live_preview_unavailable',
            'The camera connection expired. Start a new session.',
          );
        const socket = await accountApi.createLiveSocket(reserved.id, abort.signal);
        if (!current()) {
          socket.close();
          return;
        }
        setConfirmed(outfit);
        setView('ai');
        sequence.current = 0;
        lastTouch.current = Date.now();
        await controller.start({
          socket,
          maxDurationSeconds: Math.min(reserved.lease_seconds, sessionLength),
        });
      } catch (cause) {
        if (current()) {
          setError(
            cause instanceof ApiError
              ? apiErrorMessage(cause)
              : explain((cause as { code?: string }).code || 'connection_failed'),
          );
          stop('user_stopped');
        }
      } finally {
        if (startLock.current === generation) startLock.current = null;
        if (current()) setStarting(false);
      }
    })();
    startTask.current = task.catch(() => undefined);
    await task;
  }
  function choose(item: FittingRoomCandidate) {
    if (!item.reference_ready) return;
    setSelection((current) => {
      const next = { ...current };
      if (next[lane]?.item_id === item.item_id) delete next[lane];
      else {
        next[lane] = { source: item.source, item_id: item.item_id };
        if (lane === 'dress') {
          delete next.top;
          delete next.bottom;
        } else if (lane === 'top' || lane === 'bottom') delete next.dress;
      }
      return next;
    });
  }
  function apply() {
    if (!isValidFittingRoomSelection(selection) || changing) return;
    const seq = ++sequence.current;
    pendingSelection.current = { seq, selection: { ...selection } };
    if (camera.current?.select(seq, selection)) {
      local.current
        ?.closest('.live-camera-card')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setChanging(true);
      setError('');
      setNotice('Applying your selected clothes…');
    } else {
      pendingSelection.current = null;
      setError('Wait for the live connection before changing clothes.');
    }
  }
  async function more() {
    const scope = candidateScope.current;
    if (
      !cursor ||
      loading ||
      candidatePage.current ||
      !scope ||
      scope.lane !== lane ||
      scope.ownerId !== user?.id
    )
      return;
    const abort = new AbortController();
    candidatePage.current = abort;
    const current = () =>
      !abort.signal.aborted &&
      candidateGeneration.current === scope.generation &&
      accountApi.currentUser?.id === scope.ownerId &&
      currentLane.current === scope.lane;
    setLoading(true);
    try {
      const result = await accountApi.fittingRoomCandidates(
        { slot: scope.lane, selection: scope.selection, limit: 20, cursor },
        abort.signal,
      );
      if (!current()) return;
      setItems((current) => [
        ...current,
        ...result.items.filter(
          (item) =>
            !current.some(
              (existing) => existing.item_id === item.item_id && existing.source === item.source,
            ),
        ),
      ]);
      setCursor(result.next_cursor);
      setNames((current) => ({
        ...current,
        ...Object.fromEntries(result.items.map((item) => [item.item_id, item.name])),
      }));
    } catch (cause) {
      if (current()) setError(apiErrorMessage(cause));
    } finally {
      if (candidatePage.current === abort) candidatePage.current = null;
      if (current()) setLoading(false);
    }
  }
  const ready = readiness?.ready && readiness.consent_policy_version === 'live-try-on.decart.v3';
  const showOriginal = view === 'original' || !state.hasRemoteFrame;
  const changed = JSON.stringify(selection) !== JSON.stringify(confirmed);
  return (
    <div className="live-page feature-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR WARDROBE. IN MOTION.</p>
          <h1 className="page-title">Meet your next look. Live.</h1>
          <p className="muted">
            Try real clothes on your camera. Change a piece. See it move with you.
          </p>
        </div>
        <span className="badge">
          <Video size={15} /> Live fitting room
        </span>
      </div>
      <div className="live-layout">
        <section className="card live-camera-card" aria-label="Live camera try-on">
          <div className="live-camera-toolbar">
            <span
              role="status"
              className={`live-status ${state.phase === 'live' ? 'is-live' : ''}`}
            >
              <i />
              {state.phase === 'live'
                ? 'AI video live'
                : active
                  ? 'Connecting AI video'
                  : previewing
                    ? 'Camera preview'
                    : 'Camera off'}
            </span>
            <div className="segmented live-view-switch">
              <button
                onClick={() => setView('original')}
                className={showOriginal ? 'active' : ''}
                aria-pressed={showOriginal}
              >
                Original
              </button>
              <button
                onClick={() => setView('ai')}
                disabled={!state.hasRemoteFrame}
                className={!showOriginal ? 'active' : ''}
                aria-pressed={!showOriginal}
              >
                AI try-on
              </button>
            </div>
          </div>
          <div className={`live-viewport ${terminal(state.phase) ? 'camera-off' : ''}`}>
            <video
              ref={local}
              muted
              autoPlay
              playsInline
              className={`live-feed ${!showOriginal ? 'feed-hidden' : ''}`}
              aria-label="Original camera video"
            />
            <video
              ref={remote}
              muted
              autoPlay
              playsInline
              className={`live-feed ${showOriginal ? 'feed-hidden' : ''}`}
              aria-label="AI generated try-on video"
            />
            {terminal(state.phase) && (
              <div className="live-camera-empty">
                <div className="live-frame-corners">
                  <Camera size={42} strokeWidth={1} />
                </div>
                <h2>
                  Your fitting room,
                  <br />
                  wherever you are.
                </h2>
                <p>
                  Stand back so your outfit is in frame.
                  <br />
                  Good light makes all the difference.
                </p>
                <button className="button" onClick={prepare}>
                  <Camera size={16} /> Enable camera
                </button>
                <small>Camera check stays on this device.</small>
              </div>
            )}
            {(state.phase === 'requesting-camera' || (active && !state.hasRemoteFrame)) && (
              <div className="live-connection-note" role="status">
                <LoaderCircle size={18} className="spin" />
                {state.phase === 'requesting-camera'
                  ? 'Waiting for camera permission…'
                  : 'Connecting your AI fitting room…'}
              </div>
            )}
            {!terminal(state.phase) && (
              <span className="live-video-label">
                {showOriginal ? 'Original camera · no AI changes' : 'AI generated · fit may vary'}
              </span>
            )}
            {active && idleLeft <= 8 && (
              <button
                className="live-idle-warning"
                onClick={() => {
                  lastTouch.current = Date.now();
                  setIdleLeft(20);
                }}
              >
                Keep trying on · stops in {idleLeft}s
              </button>
            )}
          </div>
          <div className="live-camera-footer">
            <span>
              <ShieldCheck size={15} /> No microphone. No recording.
            </span>
            <div>
              {active && state.remainingSeconds !== null && (
                <span className="live-timer">{time(state.remainingSeconds)} left</span>
              )}
              <button
                className="icon-button"
                aria-label="Switch camera"
                disabled={!['preview', 'live'].includes(state.phase) || starting}
                onClick={() => void camera.current?.switchCamera()}
              >
                <FlipHorizontal2 size={19} />
              </button>
              {(!terminal(state.phase) || starting) && (
                <button className="button secondary small" onClick={() => stop('user_stopped')}>
                  <Square size={13} fill="currentColor" /> Stop camera
                </button>
              )}
            </div>
          </div>
          {error && (
            <p role="alert" className="live-message is-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="live-message">
              {notice}
            </p>
          )}
        </section>
        <aside className="card live-wardrobe">
          <div className="live-panel-heading">
            <div>
              <p className="eyebrow">MAKE IT YOURS</p>
              <h2>Choose your pieces</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Refresh live garments and allowance"
              disabled={active || starting}
              onClick={() => {
                setError('');
                setReload((v) => v + 1);
              }}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          {!user ? (
            <div className="live-signin">
              <span>
                <Shirt size={32} strokeWidth={1} />
              </span>
              <h3>Your real wardrobe awaits.</h3>
              <p>Sign in to use your Oyu AI clothes and discover pieces from the catalog.</p>
              <button className="button" onClick={openAccount}>
                Sign in to Oyu AI <ChevronRight size={16} />
              </button>
              <small>You can check your camera first.</small>
            </div>
          ) : (
            <>
              <div className="live-lanes" role="group" aria-label="Clothing categories">
                {lanes.map((item) => (
                  <button
                    key={item.id}
                    className={lane === item.id ? 'active' : ''}
                    aria-pressed={lane === item.id}
                    disabled={starting}
                    onClick={() => setLane(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="live-candidates" aria-busy={loading}>
                {items.map((item) => (
                  <button
                    key={`${item.source}:${item.item_id}`}
                    className={`live-garment ${selection[lane]?.item_id === item.item_id ? 'selected' : ''}`}
                    disabled={!item.reference_ready || starting || changing}
                    aria-pressed={selection[lane]?.item_id === item.item_id}
                    onClick={() => choose(item)}
                  >
                    <span className="live-garment-image">
                      <GarmentImage item={item} />
                      {selection[lane]?.item_id === item.item_id && (
                        <i>
                          <Check size={13} />
                        </i>
                      )}
                    </span>
                    <strong>{item.name}</strong>
                    <small>
                      {!item.reference_ready
                        ? 'Image not ready'
                        : item.source === 'wardrobe'
                          ? 'Your wardrobe'
                          : 'From the catalog'}
                    </small>
                  </button>
                ))}
                {loading && (
                  <p className="live-candidate-note">
                    <LoaderCircle className="spin" size={17} /> Finding your pieces…
                  </p>
                )}
                {!loading && !items.length && (
                  <p className="live-candidate-note">
                    No available {lanes.find((item) => item.id === lane)?.label.toLowerCase()} yet.
                    Add and confirm a garment in your account.
                  </p>
                )}
                {cursor && (
                  <button
                    className="text-link live-more"
                    disabled={loading}
                    onClick={() => void more()}
                  >
                    Show more pieces
                  </button>
                )}
              </div>
              {!!Object.values(selection).filter(Boolean).length && (
                <div className="live-selection">
                  {lanes
                    .filter((item) => selection[item.id])
                    .map((item) => (
                      <span key={item.id}>
                        {names[selection[item.id]!.item_id] || item.label}
                        <button
                          aria-label={`Remove selected ${item.label.toLowerCase()}`}
                          disabled={starting || changing}
                          onClick={() =>
                            setSelection((current) => {
                              const next = { ...current };
                              delete next[item.id];
                              return next;
                            })
                          }
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                </div>
              )}
              <div className="live-start-panel">
                {active ? (
                  <>
                    <p className="muted">
                      Choose another piece and apply it while your camera keeps rolling.
                    </p>
                    <button
                      className="button"
                      disabled={
                        !state.hasRemoteFrame ||
                        !changed ||
                        !isValidFittingRoomSelection(selection) ||
                        changing
                      }
                      onClick={apply}
                    >
                      {changing ? <LoaderCircle size={16} className="spin" /> : <Shirt size={16} />}
                      {changing ? 'Changing clothes…' : 'Apply selected clothes'}
                    </button>
                  </>
                ) : (
                  <>
                    {readiness && (
                      <div className="live-allowance">
                        <span>{readiness.allowance_kind === 'pro' ? 'Pro' : 'Live'} allowance</span>
                        <strong>{time(readiness.allowance_seconds_remaining)} remaining</strong>
                      </div>
                    )}
                    {readiness && !ready && (
                      <p className="live-message is-error">
                        {readiness.blockers.map(explain).join(' ') ||
                          'Live processing is currently unavailable.'}
                      </p>
                    )}
                    <label className="live-session-length">
                      Session length
                      <select
                        value={sessionLength}
                        disabled={starting}
                        onChange={(event) => setSessionLength(Number(event.target.value))}
                      >
                        <option value={20}>Up to 20 seconds</option>
                        {(readiness?.session_max_seconds ?? 0) >= 60 && (
                          <option value={60}>Up to 1 minute</option>
                        )}
                        {(readiness?.session_max_seconds ?? 0) >= 120 && (
                          <option value={120}>Up to 2 minutes</option>
                        )}
                        {(readiness?.session_max_seconds ?? 0) >= 300 && (
                          <option value={300}>Up to 5 minutes</option>
                        )}
                      </select>
                    </label>
                    <label className="live-consent">
                      <input
                        type="checkbox"
                        checked={consent}
                        disabled={starting}
                        onChange={(event) => setConsent(event.target.checked)}
                      />
                      <span>
                        I agree to send my live video and selected clothing to{' '}
                        <strong>Decart</strong> for AI try-on. This uses my Live allowance.
                      </span>
                    </label>
                    <p className="live-fineprint">
                      Video only; Oyu AI does not record your session. Stops when you leave, cover
                      the preview, or don’t interact for 20 seconds. Sessions never restart
                      automatically.
                    </p>
                    <button
                      className="button live-start"
                      disabled={
                        !ready ||
                        !consent ||
                        !isValidFittingRoomSelection(selection) ||
                        starting ||
                        state.phase === 'requesting-camera'
                      }
                      onClick={() => void start()}
                    >
                      {starting ? <LoaderCircle size={17} className="spin" /> : <Video size={17} />}
                      {starting ? 'Starting live try-on…' : 'Start live try-on'}
                    </button>
                    {!isValidFittingRoomSelection(selection) && (
                      <small className="live-start-hint">
                        Choose a top, bottom, or dress to begin.
                      </small>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      <div className="live-bottom-note">
        <CircleHelp size={16} />
        <p>
          A moving preview to explore your style. AI can change garment details and proportions; it
          does not measure physical fit.
        </p>
      </div>
      {active && (
        <button className="live-mobile-stop" onClick={() => stop('user_stopped')}>
          <Square size={13} fill="currentColor" /> Stop camera
          {state.remainingSeconds !== null && <span>{time(state.remainingSeconds)}</span>}
        </button>
      )}
    </div>
  );
}
