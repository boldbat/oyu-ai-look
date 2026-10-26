/** Direct Decart pitch client. Only the same-origin server knows the provider key.
 * Images are transient. Hosted sessions use a Firebase ID token; provider keys never reach the client.
 */
import { localized } from './lang';

export const DECART_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export type DecartImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
/** Requested session length; null runs until Stop or the server's own cap. */
export type DecartDuration = 30 | 60 | null;
/** Where the garment goes on the body; the server turns it into a region-specific prompt. */
export interface DecartGarment {
  region: 'upper' | 'lower' | 'outfit' | 'footwear' | 'layer';
  description: string;
}
export interface DecartStatus {
  configured: boolean;
  model: string;
  /** Server cap in seconds, or null when sessions run until Stop. */
  maxDurationSeconds: number | null;
  fast: boolean;
  transport?: 'websocket-init';
  requiresSignIn?: true;
}
export interface DecartConnection {
  socket: WebSocket;
  maxDurationSeconds: number | null;
}
interface DecartTicket {
  id: string;
  ticket: string;
  expiresIn: 15;
  maxDurationSeconds: number | null;
}
const seconds = (value: unknown): value is number | null =>
  value === null ||
  (Number.isInteger(value) && (value as number) >= 10 && (value as number) <= 86_400);
function garmentPayload(garment: DecartGarment | undefined) {
  if (garment === undefined) return {};
  if (
    !['upper', 'lower', 'outfit', 'footwear', 'layer'].includes(garment.region) ||
    !/^[\p{L}\p{N} ,.'’&()/-]{3,160}$/u.test(garment.description)
  )
    throw new DecartApiError('decart_invalid_request');
  return { garment: { region: garment.region, description: garment.description } };
}

const messages = localized({
  decart_not_configured: [
    'Энэ серверт шууд өмсөж үзэх хараахан тохируулагдаагүй байна.',
    'Live try-on isn’t set up on this server yet.',
  ],
  decart_unconfigured: [
    'Энэ серверт шууд өмсөж үзэх хараахан тохируулагдаагүй байна.',
    'Live try-on isn’t set up on this server yet.',
  ],
  decart_invalid_image: [
    '4 MB хүртэл хэмжээтэй JPEG, PNG эсвэл WebP форматтай хувцасны зураг сонгоно уу.',
    'Choose a JPEG, PNG, or WebP clothing image up to 4 MB.',
  ],
  decart_image_too_large: [
    '4 MB хүртэл хэмжээтэй хувцасны зураг сонгоно уу.',
    'Choose a clothing image up to 4 MB.',
  ],
  decart_session_active: [
    'Шууд сесс аль хэдийн ажиллаж эсвэл эхэлж байна. Түүнийг зогсоох эсвэл түр хүлээгээд дахин оролдоно уу.',
    'A live session is already running or starting. Stop it or wait a moment before trying again.',
  ],
  decart_origin_denied: [
    'Аппыг зөвшөөрөгдсөн хаягаас нээгээд дахин оролдоно уу.',
    'Open the app from an allowed address and try again.',
  ],
  decart_invalid_request: [
    'Өмсөж үзэх хүсэлтийг бэлтгэж чадсангүй. Өөр хувцас сонгоно уу.',
    'We couldn’t prepare that try-on. Choose another piece.',
  ],
  decart_invalid_response: [
    'Шууд үйлчилгээ энэ хөтчийн ашиглаж чадахгүй хариу буцаалаа.',
    'The live service returned a response this browser can’t use.',
  ],
  decart_connection_closed: [
    'Шууд холболт дууслаа. Өөр хувцас өмсөж үзэхийн тулд дахин эхлүүлнэ үү.',
    'The live connection has ended. Start again to try on another piece.',
  ],
  decart_unavailable: [
    'Шууд үйлчилгээ одоогоор ажиллахгүй байна. Дараа дахин оролдоно уу.',
    'The live service is unavailable right now. Please try again later.',
  ],
  decart_network_error: [
    'Шууд үйлчилгээнд холбогдож чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.',
    'Couldn’t reach the live service. Check your connection and try again.',
  ],
  decart_timeout: [
    'Шууд үйлчилгээний хариу хэт удлаа. Дахин оролдоно уу.',
    'The live service took too long to respond. Please try again.',
  ],
  decart_busy: [
    'Шууд үйлчилгээ одоо завгүй байна. Хэсэг хугацааны дараа дахин оролдоно уу.',
    'The live service is busy right now. Please try again shortly.',
  ],
  live_sign_in_required: [
    'Шууд өмсөж үзэхээс өмнө Google-ээр нэвтэрнэ үү.',
    'Sign in with Google before starting live try-on.',
  ],
  live_access_denied: [
    'Энэ Google бүртгэлд шууд демо ашиглах эрх нээгдээгүй байна. Эрхтэй бүртгэлээрээ нэвтэрнэ үү.',
    'This Google account isn’t enabled for the live demo. Sign in with your authorized account.',
  ],
  rate_limited: [
    'Хэт олон хүсэлт илгээлээ. Түр хүлээгээд дахин оролдоно уу.',
    'Too many requests. Please wait a moment and try again.',
  ],
  provider_unavailable: [
    'Шууд үйлчилгээ үзүүлэгч түр ажиллахгүй байна. Дараа дахин оролдоно уу.',
    'The live provider is temporarily unavailable. Please try again later.',
  ],
  live_tryon_disabled: [
    'Энэ серверт шууд өмсөж үзэх одоогоор идэвхгүй байна.',
    'Live try-on isn’t currently enabled on this server.',
  ],
  live_decart_key_invalid: [
    'Decart энэ сессийг баталгаажуулж чадсангүй. Серверийн Decart API түлхүүрийг шалгана уу.',
    'Decart couldn’t authorize this session. Check the server’s Decart API key.',
  ],
  live_decart_credits: [
    'Decart бүртгэлд кредит үлдээгүй байна. Дахин эхлүүлэхээс өмнө кредит нэмнэ үү.',
    'The Decart account has no credits left. Add credits before starting again.',
  ],
  live_decart_busy: [
    'Decart одоо завгүй байна. Түр хүлээгээд дахин эхлүүлнэ үү.',
    'Decart is busy right now. Wait a moment, then start again.',
  ],
  live_decart_unavailable: [
    'Decart видео дамжуулалтыг эхлүүлж чадсангүй. Дахин оролдоно уу.',
    'Decart couldn’t start the video stream. Please try again.',
  ],
  live_decart_token_invalid: [
    'Decart хугацаатай сессийг баталгаажуулж чадсангүй. Дахин оролдоно уу.',
    'Decart couldn’t authorize a timed session. Please try again.',
  ],
  live_decart_timeout: [
    'Decart-тай холбогдоход хэт удлаа. Дахин оролдоно уу.',
    'Decart took too long to connect. Please try again.',
  ],
  live_decart_network: [
    'Энэ сүлжээгээр AI видеог холбож чадсангүй. Өөр сүлжээ ашиглана уу.',
    'This network couldn’t connect the AI video. Try another network.',
  ],
  live_decart_reference_rejected: [
    'Decart энэ хувцасны зургийг ашиглаж чадсангүй. Тод харагдах хувцасны зураг сонгоод дахин оролдоно уу.',
    'Decart couldn’t use this clothing image. Choose a clear photo of the piece and try again.',
  ],
  live_decart_reference_timeout: [
    'Decart шинэ хувцсыг цагтаа баталгаажуулсангүй. Үргэлжлүүлэхийн тулд дахин эхлүүлнэ үү.',
    'Decart didn’t confirm the new piece in time. Start again to continue.',
  ],
  selection_item_unavailable: [
    'Decart тэр хувцсыг өмсгөж чадсангүй. Өөр хувцасны зураг сонгоно уу.',
    'Decart couldn’t put on that piece. Choose another clothing photo.',
  ],
  selection_invalid: [
    'Хувцсыг одоохондоо өмсгөх боломжгүй. Шууд видео гарахыг хүлээгээд дахин оролдоно уу.',
    'The piece can’t be applied just yet. Wait for the live video, then try again.',
  ],
}) as Record<string, string>;

export class DecartApiError extends Error {
  constructor(
    readonly code: string,
    message = messages[code] ?? messages.decart_unavailable,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'DecartApiError';
  }
}
export function decartErrorMessage(error: unknown): string {
  return error instanceof DecartApiError ? error.message : messages.decart_unavailable;
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const ownedSockets = new WeakSet<WebSocket>();
function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Live request cancelled', 'AbortError');
}
function pageUrl(): URL {
  if (typeof window === 'undefined') throw new DecartApiError('decart_unavailable');
  const url = new URL(window.location.href);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new DecartApiError('decart_unavailable');
  }
  return url;
}

/** Fixed same-origin routes cannot redirect an image or inherit the original account API's auth. */
async function request(
  path: '/__lookluxe/decart/status' | '/__lookluxe/decart/sessions',
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  pageUrl();
  cancelled(signal);
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException('Live request timed out', 'TimeoutError')),
    20_000,
  );
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers:
        body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    });
    cancelled(signal);
    if (controller.signal.aborted) throw controller.signal.reason;
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      if (controller.signal.aborted) throw controller.signal.reason;
      throw new DecartApiError(
        response.ok ? 'decart_invalid_response' : 'decart_unavailable',
        undefined,
        response.status,
      );
    }
    cancelled(signal);
    if (controller.signal.aborted) throw controller.signal.reason;
    if (!response.ok) {
      const code =
        object(result) && typeof result.code === 'string' && /^[a-z][a-z_]{1,79}$/.test(result.code)
          ? result.code
          : 'decart_unavailable';
      // Never echo provider diagnostics, which may contain upstream credentials.
      throw new DecartApiError(code, undefined, response.status);
    }
    return result;
  } catch (error) {
    cancelled(signal);
    if (error instanceof DecartApiError) throw error;
    throw new DecartApiError(controller.signal.aborted ? 'decart_timeout' : 'decart_network_error');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function imagePayload(
  image: Blob,
  signal?: AbortSignal,
): Promise<{ image: string; mimeType: DecartImageMime }> {
  cancelled(signal);
  if (
    !image ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(image.type) ||
    !Number.isInteger(image.size) ||
    image.size <= 0 ||
    image.size > DECART_MAX_IMAGE_BYTES
  ) {
    throw new DecartApiError('decart_invalid_image');
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await image.arrayBuffer());
  } catch {
    cancelled(signal);
    throw new DecartApiError('decart_invalid_image');
  }
  cancelled(signal);
  const matches =
    image.type === 'image/png'
      ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
      : image.type === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.length >= 12 &&
          String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
          String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
  if (!matches || bytes.byteLength !== image.size) throw new DecartApiError('decart_invalid_image');
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  return { image: btoa(chunks.join('')), mimeType: image.type as DecartImageMime };
}

export async function decartStatus(signal?: AbortSignal): Promise<DecartStatus> {
  const result = await request('/__lookluxe/decart/status', undefined, signal);
  if (
    !object(result) ||
    typeof result.configured !== 'boolean' ||
    typeof result.model !== 'string' ||
    !result.model.length ||
    result.model.length > 120 ||
    !seconds(result.maxDurationSeconds ?? null) ||
    (result.speed !== undefined && result.speed !== 'standard' && result.speed !== 'fast')
  ) {
    throw new DecartApiError('decart_invalid_response');
  }
  if (
    result.transport !== undefined &&
    (result.transport !== 'websocket-init' || result.requiresSignIn !== true)
  )
    throw new DecartApiError('decart_invalid_response');
  return {
    configured: result.configured,
    model: result.model,
    maxDurationSeconds: (result.maxDurationSeconds ?? null) as number | null,
    fast: result.speed === 'fast',
    ...(result.transport === 'websocket-init'
      ? { transport: 'websocket-init', requiresSignIn: true }
      : {}),
  };
}

/** Call only after explicit camera/image consent. No automatic retry or reconnect.
 * The local gateway uses a ticket; hosted sessions initialize and authorize on the socket.
 * Attach BrowserLiveCamera immediately after this promise resolves.
 */
export async function createDecartSocket(
  image: Blob,
  durationSeconds: DecartDuration,
  signal?: AbortSignal,
  hosted?: { transport: 'websocket-init'; idToken: string },
  garment?: DecartGarment,
): Promise<DecartConnection> {
  const origin = pageUrl();
  cancelled(signal);
  if (typeof WebSocket === 'undefined') throw new DecartApiError('decart_unavailable');
  if (![30, 60, null].includes(durationSeconds)) throw new DecartApiError('decart_invalid_request');
  const hint = garmentPayload(garment);
  const payload = await imagePayload(image, signal);
  let maxDurationSeconds: number | null = durationSeconds;
  let url: URL;
  if (hosted) {
    if (
      hosted.transport !== 'websocket-init' ||
      typeof hosted.idToken !== 'string' ||
      hosted.idToken.length < 20 ||
      hosted.idToken.length > 10000
    )
      throw new DecartApiError('live_sign_in_required');
    url = new URL('/api/live', origin);
  } else {
    const result = await request(
      '/__lookluxe/decart/sessions',
      { ...payload, durationSeconds, ...hint },
      signal,
    );
    cancelled(signal);
    if (
      !object(result) ||
      typeof result.id !== 'string' ||
      !result.id.length ||
      result.id.length > 128 ||
      typeof result.ticket !== 'string' ||
      !/^[A-Za-z0-9_-]{16,256}$/.test(result.ticket) ||
      result.expiresIn !== 15 ||
      !seconds(result.maxDurationSeconds) ||
      (durationSeconds !== null &&
        (result.maxDurationSeconds === null || result.maxDurationSeconds > durationSeconds))
    ) {
      throw new DecartApiError('decart_invalid_response');
    }
    const ticket = result as unknown as DecartTicket;
    url = new URL('/__lookluxe/decart/stream', origin);
    url.searchParams.set('ticket', ticket.ticket);
    maxDurationSeconds = ticket.maxDurationSeconds;
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  let socket: WebSocket;
  try {
    socket = new WebSocket(url.href);
  } catch {
    throw new DecartApiError('decart_unavailable');
  }
  ownedSockets.add(socket);
  if (hosted) {
    socket.addEventListener(
      'open',
      () => {
        if (signal?.aborted || socket.readyState !== 1) return;
        try {
          socket.send(
            JSON.stringify({
              type: 'init',
              ...payload,
              durationSeconds,
              idToken: hosted.idToken,
              ...hint,
            }),
          );
        } catch {
          socket.close();
        }
      },
      { once: true },
    );
  }
  const close = () => {
    try {
      socket.close(1000, 'Preview cancelled');
    } catch {
      /* Already closed. */
    }
  };
  signal?.addEventListener('abort', close, { once: true });
  socket.addEventListener(
    'close',
    () => {
      ownedSockets.delete(socket);
      signal?.removeEventListener('abort', close);
    },
    { once: true },
  );
  return { socket, maxDurationSeconds };
}

/** Sends one explicit garment change. Completion is signaled by applying/applied
 * or select_rejected on the existing socket; this method never retries a change.
 */
export async function updateDecartReference(
  socket: WebSocket,
  image: Blob,
  seq: number,
  signal?: AbortSignal,
  garment?: DecartGarment,
): Promise<void> {
  cancelled(signal);
  if (!Number.isInteger(seq) || seq < 1 || seq > 2_147_483_647)
    throw new DecartApiError('decart_invalid_request');
  const hint = garmentPayload(garment);
  if (!ownedSockets.has(socket) || socket.readyState !== 1)
    throw new DecartApiError('decart_connection_closed');
  const payload = await imagePayload(image, signal);
  cancelled(signal);
  if (!ownedSockets.has(socket) || socket.readyState !== 1)
    throw new DecartApiError('decart_connection_closed');
  try {
    socket.send(JSON.stringify({ type: 'reference', ...payload, seq, ...hint }));
  } catch {
    throw new DecartApiError('decart_connection_closed');
  }
}
