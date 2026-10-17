/** Direct Decart pitch client. Only the same-origin server knows the provider key.
 * Images are transient; no account credentials or browser storage are involved.
 */
export const DECART_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export type DecartImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type DecartDuration = 30 | 60;
export interface DecartStatus {
  configured: boolean;
  model: string;
  maxDurationSeconds: 60;
}
export interface DecartConnection {
  socket: WebSocket;
  maxDurationSeconds: DecartDuration;
}
interface DecartTicket {
  id: string;
  ticket: string;
  expiresIn: 15;
  maxDurationSeconds: DecartDuration;
}

const messages: Record<string, string> = {
  decart_not_configured: 'Live try-on is not configured on this server yet.',
  decart_unconfigured: 'Live try-on is not configured on this server yet.',
  decart_invalid_image: 'Choose a valid JPEG, PNG, or WebP clothing image up to 4 MB.',
  decart_image_too_large: 'Choose a clothing image up to 4 MB.',
  decart_session_active:
    'A preview is already running or starting. Stop it or wait a moment before trying again.',
  decart_origin_denied: 'Open the app from an allowed address and try again.',
  decart_invalid_request: 'Choose a 30 or 60 second session and try again.',
  decart_invalid_response: 'The live service returned a response this browser cannot use.',
  decart_connection_closed:
    'The live connection has ended. Start a new preview to try another item.',
  decart_unavailable: 'The live service is unavailable. Please try again later.',
  decart_network_error: 'Could not reach the live service. Check your connection and try again.',
  decart_timeout: 'The live service took too long to respond. Please try again.',
  decart_busy: 'The live service is currently busy. Please try again shortly.',
  rate_limited: 'Too many live requests. Please wait before trying again.',
  provider_unavailable: 'The live provider is temporarily unavailable. Please try again later.',
  live_tryon_disabled: 'Live try-on is not currently enabled on this server.',
  live_decart_key_invalid:
    'Decart could not authorize this session. Check the server’s Decart API key.',
  live_decart_credits:
    'The Decart account has no available credits. Add credits before starting again.',
  live_decart_busy: 'Decart is busy right now. Wait a moment, then start again.',
  live_decart_unavailable: 'Decart could not start the video stream. Please try again.',
  live_decart_token_invalid: 'Decart could not authorize a timed session. Please try again.',
  live_decart_timeout: 'Decart took too long to connect. Please try again.',
  live_decart_network: 'This network could not connect the AI video. Try another network.',
  live_decart_reference_rejected:
    'Decart could not use this garment image. Choose a clear clothing photo and try again.',
  live_decart_reference_timeout:
    'Decart did not confirm the new garment in time. Start again to continue.',
  selection_item_unavailable: 'Decart could not apply that garment. Choose another clothing photo.',
  selection_invalid: 'The garment could not be applied yet. Wait for live video, then try again.',
};

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

/** Fixed local routes cannot redirect an image or accidentally inherit account auth. */
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
    result.maxDurationSeconds !== 60
  ) {
    throw new DecartApiError('decart_invalid_response');
  }
  return { configured: result.configured, model: result.model, maxDurationSeconds: 60 };
}

/** Call only after explicit camera/image consent. No automatic retry or reconnect.
 * Creating a ticket is local; the server starts Decart only when this socket opens.
 * Attach BrowserLiveCamera immediately after this promise resolves.
 */
export async function createDecartSocket(
  image: Blob,
  durationSeconds: DecartDuration,
  signal?: AbortSignal,
): Promise<DecartConnection> {
  const origin = pageUrl();
  cancelled(signal);
  if (typeof WebSocket === 'undefined') throw new DecartApiError('decart_unavailable');
  if (![30, 60].includes(durationSeconds)) throw new DecartApiError('decart_invalid_request');
  const payload = await imagePayload(image, signal);
  const result = await request(
    '/__lookluxe/decart/sessions',
    { ...payload, durationSeconds },
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
    (result.maxDurationSeconds !== 30 && result.maxDurationSeconds !== 60) ||
    result.maxDurationSeconds > durationSeconds
  ) {
    throw new DecartApiError('decart_invalid_response');
  }
  const ticket = result as unknown as DecartTicket;
  const url = new URL('/__lookluxe/decart/stream', origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket.ticket);
  let socket: WebSocket;
  try {
    socket = new WebSocket(url.href);
  } catch {
    throw new DecartApiError('decart_unavailable');
  }
  ownedSockets.add(socket);
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
  return { socket, maxDurationSeconds: ticket.maxDurationSeconds };
}

/** Sends one explicit garment change. Completion is signaled by applying/applied
 * or select_rejected on the existing socket; this method never retries a change.
 */
export async function updateDecartReference(
  socket: WebSocket,
  image: Blob,
  seq: number,
  signal?: AbortSignal,
): Promise<void> {
  cancelled(signal);
  if (!Number.isInteger(seq) || seq < 1 || seq > 2_147_483_647)
    throw new DecartApiError('decart_invalid_request');
  if (!ownedSockets.has(socket) || socket.readyState !== 1)
    throw new DecartApiError('decart_connection_closed');
  const payload = await imagePayload(image, signal);
  cancelled(signal);
  if (!ownedSockets.has(socket) || socket.readyState !== 1)
    throw new DecartApiError('decart_connection_closed');
  try {
    socket.send(JSON.stringify({ type: 'reference', ...payload, seq }));
  } catch {
    throw new DecartApiError('decart_connection_closed');
  }
}
