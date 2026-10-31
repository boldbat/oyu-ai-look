import { useEffect, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  ArrowsIn,
  ArrowsOut,
  Camera,
  Check,
  CircleNotch,
  FlipHorizontal,
  Gauge,
  ShieldCheck,
  SpeakerHigh,
  SpeakerSlash,
  Stop,
  UploadSimple,
  VideoCamera,
  X,
} from '@phosphor-icons/react';
import {
  createDecartSocket,
  DecartApiError,
  decartErrorMessage,
  decartStatus,
  updateDecartReference,
} from '../lib/decart-api';
import type { DecartGarment } from '../lib/decart-api';
import { BrowserLiveCamera, type LiveCameraState } from '../lib/live-camera';
import { useApp } from '../lib/store';
import { categoryLabels, fitsAudience, tryOnCategories } from '../lib/types';
import { AudienceToggle } from '../components/AudienceToggle';
import type { AudienceFilter } from '../components/AudienceToggle';
import type { Category, Garment } from '../lib/types';
import { colorLabel, kindKey, kindLabel, kindLabels, promptNouns } from '../lib/i18n';
import { sampleDescriptions } from '../lib/demo';
import type { CloudUser } from '../lib/firebase-preferences';
import { StepEyebrow } from '../components/Journey';
import { liveLines, oyuPose } from '../lib/oyu';
import type { TopPick } from '../lib/oyu';
import { useVoiceReady } from '../lib/oyu-voice';
import { nameOf } from '../lib/demo';
import { OyuFigure, OyuScore } from '../components/Oyu';
import { OyuLive } from './OyuLive';
import { setOyuSettings, useOyuSettings } from '../lib/oyu-settings';
import { localized, t } from '../lib/lang';
import './pitch.css';

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const initialState: LiveCameraState = {
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
const terminal = (phase: string) => ['idle', 'stopped', 'failed'].includes(phase);
type Reference = { key: string; name: string; image: string; file?: File; garment: DecartGarment };
type View = 'ai' | 'original' | 'compare';
// Decart's VTON prompting guide: jackets and coats replace the upper body garment.
const regions: Record<Category, DecartGarment['region']> = {
  top: 'upper',
  bottom: 'lower',
  dress: 'outfit',
  outerwear: 'upper',
  footwear: 'footwear',
  accessory: 'layer',
};
const uploadRegionLabels = localized({
  upper: ['Цамц, хүрэм', 'Top or jacket'],
  lower: ['Өмд, банзал', 'Bottoms'],
  outfit: ['Даашинз', 'Dress'],
});
const uploadRegions: (keyof typeof uploadRegionLabels)[] = ['upper', 'lower', 'outfit'];
/** English garment description for the try-on prompt; the model is prompted in English. */
function hintFor(g: Garment): DecartGarment {
  const key = g.kind && kindKey(g.kind);
  // Bundled pieces have a description written from their photo, unless the photo was replaced.
  const sample = g.image === `/assets/wardrobe/${g.id}.jpg` ? sampleDescriptions[g.id] : undefined;
  const color = g.color === 'Pattern' ? 'patterned' : g.color.toLowerCase();
  const kind = (key && key in kindLabels ? key : promptNouns[g.category]).toLowerCase();
  const closed = g.category === 'outerwear' ? ', worn closed' : '';
  const description = (sample ?? `${/^[aeiou]/.test(color) ? 'an' : 'a'} ${color} ${kind}${closed}`)
    .replace(/[^\p{L}\p{N} ,.'’&()/-]/gu, '')
    .slice(0, 160);
  return { region: regions[g.category], description };
}
function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
const cameraMessages = localized({
  live_camera_permission_denied: [
    'Хөтчийнхөө сайтын тохиргооноос камер ашиглахыг зөвшөөрөөд дахин оролдоно уу.',
    'Allow camera access in your browser’s site settings, then try again.',
  ],
  live_camera_unsupported: [
    'Энэ хуудсыг HTTPS эсвэл localhost хаягаар, Safari, Chrome, Edge хөтчийн шинэ хувилбараар нээнэ үү.',
    'Open this page over HTTPS or localhost in a current version of Safari, Chrome, or Edge.',
  ],
  live_camera_unavailable: [
    'Камер асаж чадсангүй. Камер ашиглаж буй бусад аппыг хаагаад дахин оролдоно уу.',
    'The camera couldn’t start. Close other apps using it, then try again.',
  ],
  live_camera_timeout: [
    'Камерын зөвшөөрөл хэт удлаа. Хөтчийнхөө камерын зөвшөөрлийг шалгаад дахин оролдоно уу.',
    'Camera permission took too long. Check your browser’s camera permission and try again.',
  ],
  live_camera_ended: [
    'Камер салсан байна. Дахин эхлүүлэхээс өмнө камераа шалгана уу.',
    'The camera disconnected. Check it before starting again.',
  ],
  live_camera_switch_failed: [
    'Тэр камерыг ашиглах боломжгүй эсвэл аюулгүй сэлгэж чадсангүй. Үргэлжлүүлэхийн тулд дахин эхлүүлнэ үү.',
    'That camera is unavailable or couldn’t switch safely. Start again to continue.',
  ],
  live_backgrounded: [
    'Та энэ табаас гарсан тул камер болон шууд сесс зогслоо.',
    'Your camera and live session stopped when you left this tab.',
  ],
  live_context_changed: [
    'Камер болон шууд сесс зогслоо.',
    'Your camera and live session have stopped.',
  ],
  live_session_limit: [
    'Серверийн сессийн хязгаарт хүрлээ. Бэлэн болмогц дахин эхлүүлнэ үү.',
    'You’ve reached the server’s session limit. Start again when you’re ready.',
  ],
  live_session_ended: [
    'Камер болон шууд сесс зогслоо.',
    'Your camera and live session have stopped.',
  ],
  live_connection_failed: [
    'Шууд холболт амжилтгүй боллоо. Интернэт холболтоо шалгаад дахин оролдоно уу.',
    'The live connection failed. Check your connection and try again.',
  ],
  live_connection_closed: [
    'Шууд холболт хаагдлаа. Бэлэн болмогц дахин эхлүүлнэ үү.',
    'The live connection closed. Start again when you’re ready.',
  ],
  live_stream_failed: [
    'AI видеоны холболт тасарлаа. Интернэт холболтоо шалгаад дахин оролдоно уу.',
    'The AI video connection dropped. Check your connection and try again.',
  ],
  live_stream_ended: [
    'AI видео дамжуулалт дууслаа. Бэлэн болмогц дахин эхлүүлнэ үү.',
    'The AI video stream ended. Start again when you’re ready.',
  ],
  live_negotiation_timeout: [
    'AI видео цагтаа ирсэнгүй. Интернэт холболтоо шалгаад дахин оролдоно уу.',
    'The AI video didn’t arrive in time. Check your connection and try again.',
  ],
  live_playback_unavailable: [
    'Таны хөтөч AI видеог тоглуулж чадсангүй. Хуудсаа дахин ачаалаад оролдоно уу.',
    'Your browser couldn’t play the AI video. Reload the page and try again.',
  ],
  live_invalid_response: [
    'Шууд үйлчилгээнээс гэнэтийн хариу ирлээ. Дахин холбогдохын тулд дахин эхлүүлнэ үү.',
    'The live service sent an unexpected response. Start again to reconnect.',
  ],
}) as Record<string, string>;
function explain(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  return cameraMessages[code] ?? decartErrorMessage(code ? new DecartApiError(code) : error);
}
function validImage(blob: Blob) {
  if (!IMAGE_TYPES.includes(blob.type))
    throw new Error(
      t(
        'PNG, JPEG эсвэл WebP форматтай хувцасны зураг сонгоно уу.',
        'Choose a PNG, JPEG, or WebP clothing photo.',
      ),
    );
  if (!blob.size || blob.size > MAX_IMAGE_BYTES)
    throw new Error(
      t(
        '4 MB-аас бага хэмжээтэй хувцасны зураг сонгоно уу.',
        'Choose a clothing photo smaller than 4 MB.',
      ),
    );
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
    throw new Error(
      t(
        'Өмсөж үзэхийн тулд энэ хувцасны зургийг төхөөрөмжөөсөө оруулна уу.',
        'Upload this clothing photo from your device to try it on.',
      ),
    );
  }
  const response = await fetch(url, { signal, credentials: 'same-origin', redirect: 'error' });
  if (!response.ok)
    throw new Error(
      t(
        'Хувцасны зургийг ачаалж чадсангүй. Өөр хувцас сонгох эсвэл зураг оруулна уу.',
        'This clothing photo couldn’t load. Choose another piece or upload a photo.',
      ),
    );
  const blob = await response.blob();
  validImage(blob);
  return blob;
}

export function PitchTryOn({ covered = false }: { covered?: boolean }) {
  const { data, accountOpen, intent } = useApp();
  const garments = data.garments.filter(
    (item) => tryOnCategories.includes(item.category) && item.image,
  );
  const [selectedId, setSelectedId] = useState(() => {
    const requested = intent?.page === 'live' ? intent.garmentIds?.[0] : undefined;
    return garments.find((g) => g.id === requested)?.id ?? garments[0]?.id ?? '';
  });
  const [shelf, setShelf] = useState<Category | 'all'>('all');
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const fitting = garments.filter((g) => fitsAudience(g, audience));
  const shelfGarments = fitting.filter((g) => shelf === 'all' || g.category === shelf);
  const [upload, setUpload] = useState<Omit<Reference, 'garment'> | null>(null);
  const [uploadRegion, setUploadRegion] = useState<DecartGarment['region']>('upper');
  const reference: Reference | null = upload
    ? {
        ...upload,
        key: `${upload.key}:${uploadRegion}`,
        garment: { region: uploadRegion, description: 'the item shown in the reference image' },
      }
    : (() => {
        const item = garments.find((garment) => garment.id === selectedId);
        return item
          ? { key: item.id, name: item.name, image: item.image, garment: hintFor(item) }
          : null;
      })();
  const [state, setState] = useState<LiveCameraState>(initialState);
  const [view, setView] = useState<View>('ai');
  const [mirror, setMirror] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [fast, setFast] = useState(false);
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusVersion, setStatusVersion] = useState(0);
  const [starting, setStarting] = useState(false);
  const [changing, setChanging] = useState(false);
  const [applied, setApplied] = useState<Reference | null>(null);
  const [failedKey, setFailedKey] = useState('');
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const oyu = useOyuSettings();
  const oyuOn = oyu.live;
  /** The last session's best pieces, for Oyu's summary on the idle stage. */
  const [oyuIdle, setOyuIdle] = useState<{ picks: TopPick[]; count: number } | null>(null);
  // Built while rendering, so it reads in the current language.
  const idleLine = oyuIdle
    ? liveLines.summary(oyuIdle.picks, oyuIdle.count)
    : liveLines.greeting(data.preferences.name || t('найз', 'friend'));
  const voiceReady = useVoiceReady(data.preferences.language);
  const stage = useRef<HTMLElement>(null);
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
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadUrl = useRef('');
  const switchingPreview = useRef(false);
  const active = ['connecting', 'negotiating', 'waiting-for-frame', 'live', 'switching'].includes(
    state.phase,
  );
  const previewing = state.phase === 'preview';
  const cameraOn = !terminal(state.phase);
  const showAi = state.hasRemoteFrame && view !== 'original';
  const showOriginal = !showAi || view === 'compare';
  const compare = view === 'compare' && state.hasRemoteFrame;
  const mirrored = mirror && state.facing === 'user';
  const changed = reference?.key !== applied?.key;
  // Oyu's view of the session. A camera switch only happens mid-session; pressing Start with the
  // camera off passes through preview, which is already "getting ready" for her.
  const oyuStage = terminal(state.phase)
    ? 'off'
    : state.phase === 'requesting-camera'
      ? 'opening'
      : state.phase === 'switching' || (state.phase === 'live' && state.hasRemoteFrame)
        ? 'live'
        : previewing && !starting
          ? 'preview'
          : 'connecting';
  const applyingKey = changing ? pending.current?.reference.key : undefined;

  function showFlash(message: string) {
    setFlash(message);
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(''), 2400);
  }
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
    if (code === 'user_stopped')
      setNotice(
        t('Камер унтарлаа. Шууд сесс дууслаа.', 'Camera off. Your live session has ended.'),
      );
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
          setFailedKey('');
          showFlash(
            t(`Одоо өмссөн: ${update.reference.name}`, `Now wearing: ${update.reference.name}`),
          );
          clearPending();
        } else if (event.type === 'rejected') {
          setChanging(false);
          setFailedKey(update.reference.key);
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
      if (flashTimer.current !== null) clearTimeout(flashTimer.current);
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
          setFast(result.fast);
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
        if (active)
          setError(
            t(
              'Google-ээр нэвтрэх хэсэг ачаалагдсангүй. Хуудсаа дахин ачаалаад оролдоно уу.',
              'Google sign-in couldn’t load. Reload the page and try again.',
            ),
          );
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
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => {
    void camera.current?.setMirror(mirror);
  }, [mirror]);
  // One tap switches clothes: whenever the chosen piece differs from the one on screen,
  // send it. Taps made while a change is pending are applied right after it lands.
  useEffect(() => {
    if (
      state.phase === 'live' &&
      reference &&
      applied &&
      changed &&
      !changing &&
      !pending.current &&
      reference.key !== failedKey
    )
      void applyReference();
    // applyReference reads the current reference; these values decide when to send.
  }, [state.phase, reference?.key, applied?.key, changing, failedKey]);

  function canOpenCamera() {
    if (document.visibilityState === 'hidden') {
      setError(
        t(
          'Камер асаахын өмнө энэ табыг дэлгэц дээр нээнэ үү.',
          'Bring this tab into view before turning on your camera.',
        ),
      );
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
    setFailedKey('');
    setApplied(null);
    if (view === 'original') setView('ai');
    stage.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        null,
        abort.signal,
        idToken ? { transport: 'websocket-init', idToken } : undefined,
        chosen.garment,
      );
      if (!current()) {
        result.socket.close();
        return;
      }
      socket.current = result.socket;
      nextSequence.current = 0;
      setApplied(chosen);
      controller.start({ socket: result.socket, maxDurationSeconds: result.maxDurationSeconds });
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
      if (mounted.current)
        setError(
          t(
            'Google-ээр нэвтрэх хэсэг ачаалагдсангүй. Хуудсаа дахин ачаалаад оролдоно уу.',
            'Google sign-in couldn’t load. Reload the page and try again.',
          ),
        );
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
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      setError(
        t(
          'Энэ хөтөч бүтэн дэлгэцийг дэмжихгүй байна.',
          'This browser doesn’t support full screen.',
        ),
      );
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
        t(
          'Шинэ хувцас цагтаа баталгаажсангүй. Сесс зогссон тул дахин эхлүүлж өмсөж үзнэ үү.',
          'The new piece wasn’t confirmed in time. The session stopped; start again to try it on.',
        ),
      );
    }, 15_000);
    try {
      const image = await referenceBlob(chosen, abort.signal);
      if (!current()) return;
      await updateDecartReference(transport, image, seq, abort.signal, chosen.garment);
    } catch (cause) {
      if (current()) {
        clearPending();
        setChanging(false);
        setFailedKey(chosen.key);
        setError(cause instanceof Error && !('code' in cause) ? cause.message : explain(cause));
      }
    }
  }
  /** Oyu's suggestion: show it on the shelf even if a filter hid it, then put it on. */
  function tryFromOyu(id: string) {
    const garment = garments.find((item) => item.id === id);
    if (!garment) return;
    if (!fitsAudience(garment, audience)) setAudience('all');
    if (shelf !== 'all' && shelf !== garment.category) setShelf('all');
    pick(id);
  }
  function pick(id: string) {
    clearUpload();
    setSelectedId(id);
    setError('');
    setNotice('');
  }
  function chooseUpload(file: File | undefined) {
    if (!file) return;
    try {
      validImage(file);
      const url = URL.createObjectURL(file);
      if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current);
      uploadUrl.current = url;
      setUpload({
        key: crypto.randomUUID(),
        name: file.name.replace(/\.[^.]+$/, '') || t('Таны хувцас', 'Your piece'),
        image: url,
        file,
      });
      setError('');
      setNotice('');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t('Энэ зургийг нээж чадсангүй.', 'This photo couldn’t be opened.'),
      );
    }
  }
  function clearUpload() {
    setUpload(null);
    if (uploadUrl.current) URL.revokeObjectURL(uploadUrl.current);
    uploadUrl.current = '';
    if (fileInput.current) fileInput.current.value = '';
  }
  const pieceState = (id: string) => ({
    selected: !upload && selectedId === id,
    wearing: active && applied?.key === id,
    applying: applyingKey === id,
  });
  const statusLabel =
    state.phase === 'live'
      ? t('AI видео идэвхтэй', 'AI video live')
      : state.phase === 'switching'
        ? t('Камер сэлгэж байна', 'Switching camera')
        : active || starting
          ? t('AI видео холбогдож байна', 'Connecting AI video')
          : previewing
            ? t('Хувийн урьдчилсан харагдац', 'Private preview')
            : state.phase === 'requesting-camera'
              ? t('Камер нээж байна', 'Opening camera')
              : t('Камер унтраалттай', 'Camera off');
  return (
    <div className="pitch-page feature-page">
      <div className="page-heading pitch-heading">
        <div>
          <StepEyebrow page="live" />
          <h1>{t('Өөр дээрээ шууд өмсөж үзээрэй', 'Try it on yourself, live')}</h1>
          <p className="lead">
            {t(
              'Хувцас сонгоод камераа асаахад AI түүнийг танд бодит цагт өмсгөнө. Өөр хувцас дээр дармагц шууд солигдоно.',
              'Pick a piece and turn on your camera, and AI dresses you in it in real time. Tap another piece and it changes instantly.',
            )}
          </p>
        </div>
        <span className="pitch-credit">
          {t('Decart технологиор ажилладаг', 'Powered by Decart')}
        </span>
      </div>
      <div className="pitch-layout">
        <section
          ref={stage}
          className={`pitch-camera ${fullscreen ? 'is-fullscreen' : ''}`}
          aria-label={t('Шууд өмсөж үзэх өрөө', 'Live fitting room')}
        >
          <div className="pitch-camera-bar">
            <span
              className={`pitch-status ${state.phase === 'live' ? 'is-live' : ''}`}
              role="status"
            >
              <i aria-hidden="true" />
              {statusLabel}
            </span>
            <div className="pitch-bar-actions">
              <div
                className="segmented pitch-view-toggle"
                role="group"
                aria-label={t('Видео харагдац', 'Video view')}
              >
                {(
                  [
                    ['ai', t('AI дүрс', 'AI view')],
                    ['original', t('Эх дүрс', 'Original')],
                    ['compare', t('Зэрэгцүүлэх', 'Side by side')],
                  ] as [View, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setView(value)}
                    disabled={value !== 'original' && !state.hasRemoteFrame}
                    className={view === value ? 'active' : ''}
                    aria-pressed={view === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                className="icon-button pitch-icon"
                aria-label={
                  fullscreen
                    ? t('Бүтэн дэлгэцээс гарах', 'Exit full screen')
                    : t('Бүтэн дэлгэц', 'Full screen')
                }
                title={
                  fullscreen
                    ? t('Бүтэн дэлгэцээс гарах', 'Exit full screen')
                    : t('Бүтэн дэлгэц', 'Full screen')
                }
                onClick={() => void toggleFullscreen()}
              >
                {fullscreen ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
              </button>
            </div>
          </div>
          <div
            className={`pitch-viewport ${!cameraOn ? 'camera-off' : ''} ${mirrored ? 'is-mirrored' : ''} ${compare ? 'is-compare' : ''}`}
          >
            <video
              ref={localVideo}
              muted
              autoPlay
              playsInline
              aria-label={t('Камерын эх видео', 'Original camera video')}
              className={`pitch-video pitch-video-original ${showOriginal ? '' : 'is-hidden'}`}
            />
            <video
              ref={remoteVideo}
              muted
              autoPlay
              playsInline
              aria-label={t('AI-ийн үүсгэсэн өмсөж үзэх видео', 'AI-generated try-on video')}
              className={`pitch-video pitch-video-ai ${showAi ? '' : 'is-hidden'}`}
            />
            {compare && (
              <>
                <span className="pitch-side-label is-left">{t('Эх дүрс', 'Original')}</span>
                <span className="pitch-side-label is-right">{t('AI дүрс', 'AI view')}</span>
              </>
            )}
            {!cameraOn && (
              <div className={`pitch-empty ${oyuOn ? 'with-oyu' : ''}`}>
                {oyuOn ? (
                  <>
                    <span className="pitch-oyu" aria-hidden="true">
                      <OyuFigure mood={idleLine.mood} />
                    </span>
                    <div className="pitch-oyu-line">
                      <p role="status">
                        <span>
                          <strong>Oyu</strong>
                          {idleLine.score !== undefined && (
                            <OyuScore score={idleLine.score} animate />
                          )}
                        </span>
                        {idleLine.text}
                      </p>
                      {idleLine.picks && idleLine.picks.length > 1 && (
                        <div
                          className="pitch-oyu-picks"
                          role="group"
                          aria-label={t('Oyu-гийн шилдэг сонголт', 'Oyu’s top picks')}
                        >
                          <small>{t('Дахин өмсөх бол сонгоорой', 'Pick one to try again')}</small>
                          {idleLine.picks.map(({ garment, score }) => (
                            <button
                              key={garment.id}
                              className={!upload && selectedId === garment.id ? 'is-selected' : ''}
                              aria-pressed={!upload && selectedId === garment.id}
                              aria-label={`${nameOf(garment)}, ${score.toFixed(1)}/10`}
                              onClick={() => tryFromOyu(garment.id)}
                            >
                              <span className="oyu-thumb">
                                <img src={garment.image} alt="" />
                              </span>
                              {score.toFixed(1)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <span className="pitch-camera-symbol" aria-hidden="true">
                      <Camera size={24} />
                    </span>
                    <p className="pitch-empty-title">{t('Өмсөж үзэх өрөө', 'Fitting room')}</p>
                    <p>
                      {t(
                        'Хувцас тань бүтэн харагдахаар хойш зай аваад, гэрэл жигд тусах газар зогсоорой.',
                        'Step back so your whole outfit is in frame, somewhere with even light.',
                      )}
                    </p>
                  </>
                )}
                <button
                  className="button"
                  onClick={() => void prepare()}
                  disabled={starting || covered || accountOpen}
                >
                  <Camera size={18} /> {t('Камер асаах', 'Turn on camera')}
                </button>
                <small>
                  {t(
                    'Урьдчилсан харагдац таны төхөөрөмжөөс гарахгүй.',
                    'Your preview never leaves your device.',
                  )}
                </small>
              </div>
            )}
            {(state.phase === 'requesting-camera' ||
              ((active || starting) && !state.hasRemoteFrame)) && (
              <div className="pitch-connecting" role="status">
                <CircleNotch size={16} weight="regular" className="spin" />
                {state.phase === 'requesting-camera'
                  ? t('Камерын зөвшөөрлийг хүлээж байна…', 'Waiting for camera permission…')
                  : t(
                      'AI хувцас өмсгөж байна… хэдэн секунд болно',
                      'AI is dressing you… this takes a few seconds',
                    )}
              </div>
            )}
            <div className="pitch-hud">
              {active && state.elapsedSeconds !== null && (
                <span
                  className="pitch-countdown"
                  aria-label={t(
                    `Шууд: ${state.elapsedSeconds} секунд`,
                    `Live: ${state.elapsedSeconds} seconds`,
                  )}
                >
                  <span className="pitch-record-dot" />
                  {t('Шууд', 'Live')} {clock(state.elapsedSeconds)}
                  {state.remainingSeconds !== null && (
                    <small>
                      {t(
                        `· ${clock(state.remainingSeconds)} үлдсэн`,
                        `· ${clock(state.remainingSeconds)} left`,
                      )}
                    </small>
                  )}
                  {state.phase === 'live' && state.height > 0 && (
                    <small>
                      · {state.height}p{state.fps > 0 ? ` · ${Math.round(state.fps)} fps` : ''}
                    </small>
                  )}
                </span>
              )}
              {cameraOn && showAi && !compare && (
                <span className="pitch-video-caption">
                  {t(
                    'AI-ийн бүтээл · бодитоос зөрж болно',
                    'AI-generated · may differ from real life',
                  )}
                </span>
              )}
            </div>
            {(flash || changing) && (
              <div className="pitch-applying" role="status">
                {changing ? (
                  <CircleNotch size={15} weight="regular" className="spin" />
                ) : (
                  <Check size={15} weight="regular" />
                )}
                {changing
                  ? t(
                      `Өмсгөж байна: ${pending.current?.reference.name ?? 'таны хувцас'}…`,
                      `Putting on ${pending.current?.reference.name ?? 'your piece'}…`,
                    )
                  : flash}
              </div>
            )}
            {cameraOn && shelfGarments.length > 0 && (
              <div
                className="pitch-strip"
                role="group"
                aria-label={t('Хувцас хурдан солих', 'Quick change')}
              >
                {shelfGarments.map((item) => {
                  const piece = pieceState(item.id);
                  return (
                    <button
                      key={item.id}
                      className={`${piece.selected ? 'selected' : ''} ${piece.wearing ? 'wearing' : ''}`}
                      aria-pressed={piece.selected}
                      aria-label={t(`Өмсөж үзэх: ${item.name}`, `Try on: ${item.name}`)}
                      title={item.name}
                      onClick={() => pick(item.id)}
                    >
                      <img src={item.image} alt="" />
                      {piece.applying && <CircleNotch size={16} className="spin" />}
                    </button>
                  );
                })}
              </div>
            )}
            <OyuLive
              stage={oyuStage}
              applied={applied}
              selectedKey={reference?.key}
              changing={changing}
              compare={compare}
              video={localVideo}
              options={fitting}
              raised={cameraOn && shelfGarments.length > 0}
              hidden={!oyuOn}
              vision={oyu.vision}
              voice={oyu.voice && voiceReady}
              onTry={tryFromOyu}
              onIdle={setOyuIdle}
            />
          </div>
          <div className="pitch-camera-footer">
            <span className="pitch-privacy">
              <ShieldCheck size={16} />
              {t(
                'Зөвхөн камер, микрофонгүй. Юу ч бичигдэхгүй.',
                'Camera only, no microphone. Nothing is recorded.',
              )}
            </span>
            <div className="pitch-camera-controls">
              <button
                className={`icon-button pitch-icon oyu-toggle ${oyuOn ? 'is-on' : ''}`}
                aria-pressed={oyuOn}
                aria-label={t('Oyu стилист', 'Oyu stylist')}
                title={oyuOn ? t('Oyu-г нуух', 'Hide Oyu') : t('Oyu-г харуулах', 'Show Oyu')}
                onClick={() => setOyuSettings({ live: !oyuOn })}
              >
                <img src={oyuPose.happy} alt="" />
              </button>
              {oyuOn && voiceReady && (
                <button
                  className={`icon-button pitch-icon ${oyu.voice ? 'is-on' : ''}`}
                  aria-pressed={oyu.voice}
                  aria-label={t('Oyu-гийн дуу хоолой', 'Oyu’s voice')}
                  title={
                    oyu.voice
                      ? t('Oyu-г чимээгүй болгох', 'Mute Oyu')
                      : t('Oyu чанга ярих', 'Let Oyu speak aloud')
                  }
                  onClick={() => setOyuSettings({ voice: !oyu.voice })}
                >
                  {oyu.voice ? <SpeakerHigh size={18} /> : <SpeakerSlash size={18} />}
                </button>
              )}
              <button
                className={`icon-button pitch-icon ${mirror ? 'is-on' : ''}`}
                aria-pressed={mirror}
                aria-label={t('Толин тусгал', 'Mirror')}
                title={t('Толин тусгал', 'Mirror')}
                onClick={() => setMirror((value) => !value)}
              >
                <FlipHorizontal size={18} />
              </button>
              <button
                className="icon-button pitch-icon"
                aria-label={t('Урд, хойд камер сэлгэх', 'Switch front or rear camera')}
                title={t('Камер сэлгэх', 'Switch camera')}
                disabled={!['preview', 'live'].includes(state.phase) || starting || changing}
                onClick={() => void switchCamera()}
              >
                <ArrowsClockwise size={18} />
              </button>
              <button
                className="button small secondary pitch-stop"
                onClick={() => stop()}
                disabled={!cameraOn && !starting}
              >
                <Stop size={12} weight="fill" /> {t('Зогсоох', 'Stop')}
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
        <section className="pitch-rail" aria-labelledby="pitch-wardrobe-heading">
          <div className="pitch-step-heading">
            <p className="overline">{t('Алхам 1', 'Step 1')}</p>
            <h2 id="pitch-wardrobe-heading">
              {t('Дараа нь юу өмсөх вэ?', 'What’s your next look?')}
            </h2>
          </div>
          <div className="pitch-filters">
            <AudienceToggle value={audience} onChange={setAudience} />
            <div
              className="pitch-filter"
              role="group"
              aria-label={t('Хувцсыг төрлөөр шүүх', 'Filter pieces by type')}
            >
              {(['all', ...tryOnCategories] as const).map((value) => (
                <button
                  key={value}
                  className={`chip ${shelf === value ? 'active' : ''}`}
                  aria-pressed={shelf === value}
                  onClick={() => setShelf(value)}
                >
                  {value === 'all' ? t('Бүгд', 'All') : categoryLabels[value]}
                  <span>
                    {value === 'all'
                      ? fitting.length
                      : fitting.filter((g) => g.category === value).length}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="pitch-garments" aria-label={t('Хувцасны зураг', 'Clothing photos')}>
            {shelfGarments.map((item) => {
              const piece = pieceState(item.id);
              return (
                <button
                  key={item.id}
                  className={`pitch-garment ${piece.selected ? 'selected' : ''} ${piece.wearing ? 'wearing' : ''}`}
                  onClick={() => pick(item.id)}
                  aria-pressed={piece.selected}
                >
                  <span className="pitch-garment-image">
                    <img src={item.image} alt="" />
                    {piece.applying ? (
                      <i>
                        <CircleNotch size={12} weight="regular" className="spin" />
                      </i>
                    ) : (
                      piece.selected && (
                        <i>
                          <Check size={12} weight="regular" />
                        </i>
                      )
                    )}
                    {piece.wearing && <em>{t('Өмссөн', 'Wearing')}</em>}
                  </span>
                  <strong>{item.name}</strong>
                  <small>{item.kind ? kindLabel(item.kind) : colorLabel(item.color)}</small>
                </button>
              );
            })}
          </div>
          <input
            ref={fileInput}
            id="pitch-garment-upload"
            className="pitch-file-input"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              chooseUpload(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          {upload ? (
            <div className="pitch-upload-preview">
              <img
                src={upload.image}
                alt={t('Сонгосон хувцасны зураг', 'Selected clothing photo')}
              />
              <div>
                <strong>{upload.name}</strong>
                <div
                  className="pitch-region"
                  role="group"
                  aria-label={t('Хувцасны төрөл', 'Piece type')}
                >
                  {uploadRegions.map((value) => (
                    <button
                      key={value}
                      className={`chip ${uploadRegion === value ? 'active' : ''}`}
                      aria-pressed={uploadRegion === value}
                      onClick={() => setUploadRegion(value)}
                    >
                      {uploadRegionLabels[value]}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="icon-button"
                aria-label={t('Оруулсан хувцсыг хасах', 'Remove uploaded piece')}
                onClick={clearUpload}
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <button className="pitch-upload-button" onClick={() => fileInput.current?.click()}>
              <UploadSimple size={20} />
              <span>
                <strong>{t('Өөрийн хувцсаа өмсөж үзэх', 'Try on your own piece')}</strong>
                <small>
                  {t('PNG, JPEG эсвэл WebP · 4 MB хүртэл', 'PNG, JPEG, or WebP · up to 4 MB')}
                </small>
              </span>
            </button>
          )}
          <div className="pitch-start-panel">
            <div className="pitch-step-heading">
              <p className="overline">{t('Алхам 2', 'Step 2')}</p>
              <h2>{t('Өөр дээрээ үзэх', 'See it on you')}</h2>
              <p className="pitch-step-meta">
                {t(
                  'Хугацааны хязгааргүй · “Зогсоох” дартал үргэлжилнэ',
                  'No time limit · runs until you press “Stop”',
                )}
              </p>
            </div>
            {fast && (
              <p className="pitch-fast">
                <Gauge size={16} />
                <span>
                  <strong>{t('Хурдан горим идэвхтэй', 'Fast mode on')}</strong>
                  {t('Хувцас бага саатлаар солигдоно', 'Pieces change with less delay')}
                </span>
              </p>
            )}
            {active ? (
              <>
                {applied ? (
                  <div className="pitch-selected">
                    <span className="pitch-selected-thumb">
                      <img src={applied.image} alt="" />
                    </span>
                    <p>
                      <small>{t('Одоо өмссөн', 'Now wearing')}</small>
                      <strong>{applied.name}</strong>
                    </p>
                  </div>
                ) : (
                  <p className="pitch-selected-note">
                    {t(
                      'Шууд өмсөж үзэх өрөө холбогдож байна.',
                      'Your live fitting room is connecting.',
                    )}
                  </p>
                )}
                <p className="pitch-tip">
                  {t(
                    'Энд эсвэл видео дээрх хувцсыг дармагц агшин зуур солигдоно.',
                    'Tap a piece here or on the video and it changes instantly.',
                  )}
                </p>
                <button className="button full-width pitch-end" onClick={() => stop()}>
                  <Stop size={12} weight="fill" />{' '}
                  {t('Шууд өмсөж үзэхийг дуусгах', 'End live try-on')}
                </button>
              </>
            ) : (
              <>
                {reference ? (
                  <div className="pitch-selected">
                    <span className="pitch-selected-thumb">
                      <img src={reference.image} alt="" />
                    </span>
                    <p>
                      <small>{t('Сонгосон хувцас', 'Selected piece')}</small>
                      <strong>{reference.name}</strong>
                    </p>
                  </div>
                ) : (
                  <p className="pitch-selected-note">
                    {t(
                      'Эхлэхийн тулд хувцас сонгох эсвэл хувцасны зураг оруулна уу.',
                      'Choose a piece or upload a clothing photo to begin.',
                    )}
                  </p>
                )}
                {requiresSignIn && !cloudUser && (
                  <button
                    className="button secondary full-width pitch-sign-in"
                    onClick={() => void signInForLive()}
                    disabled={signingIn}
                  >
                    {signingIn
                      ? t('Google нээж байна…', 'Opening Google…')
                      : t(
                          'Шууд өмсөж үзэхийн тулд Google-ээр нэвтрэх',
                          'Sign in with Google for live try-on',
                        )}
                  </button>
                )}
                {requiresSignIn && cloudUser && (
                  <p className="pitch-service-status pitch-signed-in">
                    {t(
                      `Нэвтэрсэн: ${cloudUser.email || cloudUser.displayName}`,
                      `Signed in as ${cloudUser.email || cloudUser.displayName}`,
                    )}
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
                  {starting ? (
                    <CircleNotch size={18} className="spin" />
                  ) : (
                    <VideoCamera size={18} />
                  )}
                  {starting
                    ? t('Эхлүүлж байна…', 'Starting…')
                    : t('Шууд өмсөж үзэх', 'Start live try-on')}
                </button>
                <p className="pitch-disclosure">
                  {t(
                    '“Шууд өмсөж үзэх” товчийг дарахад таны камерын видео болон сонгосон хувцасны зураг шууд AI боловсруулалтад зориулан Decart руу илгээгдэнэ. “Зогсоох” товчийг дарах эсвэл энэ табаас гартал сесс үргэлжилнэ.',
                    '“Start live try-on” sends your camera video and the selected clothing photo to Decart for live AI processing. The session runs until you press “Stop” or leave this tab.',
                  )}
                </p>
              </>
            )}
            {configured === null && (
              <p className="pitch-service-status" role="status">
                <CircleNotch size={14} weight="regular" className="spin" />{' '}
                {t('Шууд үйлчилгээг шалгаж байна…', 'Checking the live service…')}
              </p>
            )}
            {configured === false && (
              <div className="pitch-service-error" role="status">
                <p>
                  {statusError ||
                    t(
                      'Шууд өмсөж үзэх хараахан тохируулагдаагүй байна. Демо хостоос Decart-ыг холбохыг хүснэ үү.',
                      'Live try-on isn’t set up yet. Ask the demo host to connect Decart.',
                    )}
                </p>
                <button onClick={() => setStatusVersion((value) => value + 1)}>
                  <ArrowsClockwise size={14} weight="regular" /> {t('Дахин шалгах', 'Check again')}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
      {(active || starting) && (
        <button className="pitch-mobile-stop" onClick={() => stop()}>
          <Stop size={12} weight="fill" /> {t('Шууд өмсөж үзэхийг зогсоох', 'Stop live try-on')}
          {state.elapsedSeconds !== null && <span>{clock(state.elapsedSeconds)}</span>}
        </button>
      )}
    </div>
  );
}
export default PitchTryOn;
