import { randomBytes, randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

const MAX_IMAGE = 4 * 1024 * 1024;
const MAX_BODY = Math.ceil((MAX_IMAGE * 4) / 3) + 2048;
const PROMPT =
  'Replace the clothing on the person with the garment from the reference image. Preserve the person’s face, body, pose and background. Keep the garment’s color, pattern, texture and design.';
const loopback = (value) =>
  ['localhost', '127.0.0.1', '[::1]', '::1', '::ffff:127.0.0.1'].includes(value);
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => keys.includes(key));
function imageValid(image, mime) {
  if (
    typeof image !== 'string' ||
    !image.length ||
    image.length > Math.ceil((MAX_IMAGE * 4) / 3) + 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(image)
  )
    return false;
  const bytes = Buffer.from(image, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE || bytes.toString('base64') !== image) return false;
  return mime === 'image/png'
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === 'image/jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === 'image/webp' &&
        bytes.subarray(0, 4).toString() === 'RIFF' &&
        bytes.subarray(8, 12).toString() === 'WEBP';
}

/** Local pitch gateway. Permanent and constrained Decart keys stay server-side. */
export function createDecartBridge({
  apiKey = '',
  model = 'lucy-vton-3.6',
  allowedOrigins = [],
  allowRemote = false,
  tokenEndpoint = 'https://api.decart.ai/v1/client/tokens',
  streamEndpoint = 'wss://api3.decart.ai/v1/stream',
} = {}) {
  if (!['lucy-vton-3.5', 'lucy-vton-3.6'].includes(model))
    throw new Error('Unsupported DECART_MODEL');
  const tickets = new Map();
  const active = new Set();
  const attempts = [];
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_BODY,
    perMessageDeflate: false,
  });
  function prune() {
    for (const [key, ticket] of tickets) if (ticket.expires <= Date.now()) tickets.delete(key);
  }
  const sweep = setInterval(prune, 5000);
  sweep.unref();
  const reply = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const fail = (res, status, code) => reply(res, status, { code });
  function allowed(req, requireOrigin = true) {
    let host;
    try {
      host = new URL(`http://${req.headers.host}`).hostname;
    } catch {
      return false;
    }
    if (!allowRemote && (!loopback(host) || !loopback(req.socket.remoteAddress))) return false;
    const origin = req.headers.origin;
    if (!origin) return !requireOrigin && req.headers['sec-fetch-site'] !== 'cross-site';
    return allowedOrigins.length
      ? allowedOrigins.includes(origin)
      : origin === `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
  }
  function handleRequest(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://local');
    } catch {
      return false;
    }
    if (!url.pathname.startsWith('/__lookluxe/decart/')) return false;
    if (!allowed(req, req.method !== 'GET')) {
      fail(res, 403, 'decart_origin_denied');
      return true;
    }
    if (url.pathname === '/__lookluxe/decart/status' && req.method === 'GET') {
      reply(res, 200, { configured: !!apiKey, model, maxDurationSeconds: 60 });
      return true;
    }
    if (url.pathname !== '/__lookluxe/decart/sessions' || req.method !== 'POST') {
      fail(res, 404, 'not_found');
      return true;
    }
    if (!apiKey) {
      fail(res, 503, 'decart_not_configured');
      return true;
    }
    prune();
    if (active.size || tickets.size >= 4) {
      fail(res, 409, 'decart_session_active');
      return true;
    }
    let chunks = [],
      size = 0,
      rejected = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        if (!rejected) fail(res, 413, 'decart_image_too_large');
        rejected = true;
        chunks = [];
      } else if (!rejected) chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        fail(res, 400, 'decart_invalid_image');
        return;
      }
      chunks = [];
      if (
        !exact(body, ['image', 'mimeType', 'durationSeconds']) ||
        ![30, 60].includes(body.durationSeconds) ||
        !imageValid(body.image, body.mimeType)
      ) {
        fail(res, 400, 'decart_invalid_image');
        return;
      }
      // Tickets are local only: no Decart call occurs until the user connects.
      if (active.size || tickets.size >= 4) {
        fail(res, 409, 'decart_session_active');
        return;
      }
      const ticket = randomBytes(32).toString('base64url');
      const id = randomUUID();
      tickets.set(ticket, {
        id,
        image: body.image,
        origin: req.headers.origin,
        expires: Date.now() + 15000,
        seconds: body.durationSeconds,
      });
      reply(res, 201, { id, ticket, expiresIn: 15, maxDurationSeconds: body.durationSeconds });
    });
    req.on('error', () => {
      if (!res.headersSent) fail(res, 400, 'decart_invalid_image');
    });
    return true;
  }
  function handleUpgrade(req, socket, head) {
    let url;
    try {
      url = new URL(req.url, 'http://local');
    } catch {
      return false;
    }
    if (url.pathname !== '/__lookluxe/decart/stream') return false;
    const deny = (status) =>
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    if (!allowed(req)) {
      deny('403 Forbidden');
      return true;
    }
    const key = url.searchParams.get('ticket');
    const ticket = tickets.get(key);
    tickets.delete(key);
    if (!ticket || ticket.expires <= Date.now() || ticket.origin !== req.headers.origin) {
      deny('401 Unauthorized');
      return true;
    }
    while (attempts.length && attempts[0] < Date.now() - 60000) attempts.shift();
    if (active.size || attempts.length >= 6) {
      deny('429 Too Many Requests');
      return true;
    }
    attempts.push(Date.now());
    wss.handleUpgrade(req, socket, head, (downstream) => {
      void connect(downstream, ticket);
    });
    return true;
  }
  async function connect(downstream, ticket) {
    let remote = null,
      closed = false,
      ready = false,
      offered = false,
      swap = null,
      lastSeq = 0;
    let queued = [],
      queuedBytes = 0;
    const abort = new AbortController();
    const timers = new Set();
    const later = (ms, fn) => {
      const timer = setTimeout(fn, ms);
      timers.add(timer);
      timer.unref();
      return timer;
    };
    const send = (message) => {
      if (downstream.readyState === WebSocket.OPEN && downstream.bufferedAmount < 512 * 1024)
        downstream.send(JSON.stringify(message));
    };
    const close = (code = null, failed = false) => {
      if (closed) return;
      closed = true;
      abort.abort();
      for (const timer of timers) clearTimeout(timer);
      queued = [];
      ticket.image = '';
      swap = null;
      if (code) send({ type: failed ? 'error' : 'stopped', code });
      for (const peer of [downstream, remote]) {
        if (!peer) continue;
        if (peer.readyState === WebSocket.CONNECTING) peer.terminate();
        else if (peer.readyState === WebSocket.OPEN) peer.close();
      }
      // Keep the single-session gate until the provider socket actually closes.
      const forced = setTimeout(() => {
        downstream.terminate();
        remote?.terminate();
        active.delete(close);
      }, 1000);
      forced.unref();
      if (!remote || remote.readyState === WebSocket.CLOSED) active.delete(close);
    };
    active.add(close);
    const setupTimeout = later(20000, () => close('live_decart_timeout', true));
    downstream.on('error', () => close());
    downstream.on('close', () => close());
    downstream.on('message', (raw, binary) => {
      if (closed) return;
      let value;
      try {
        if (binary) throw new Error();
        value = JSON.parse(raw.toString());
      } catch {
        close('live_invalid_response', true);
        return;
      }
      if (value?.type === 'stop' && exact(value, ['type'])) {
        close('live_session_ended');
        return;
      }
      if (value?.type === 'reference') {
        if (
          !ready ||
          !offered ||
          swap ||
          !Number.isInteger(value.seq) ||
          value.seq <= lastSeq ||
          !exact(value, ['type', 'seq', 'image', 'mimeType']) ||
          !imageValid(value.image, value.mimeType)
        ) {
          send({ type: 'select_rejected', seq: value?.seq ?? 0, code: 'selection_invalid' });
          return;
        }
        lastSeq = value.seq;
        swap = {
          seq: value.seq,
          timer: later(15000, () => close('live_decart_reference_timeout', true)),
        };
        send({ type: 'applying', seq: value.seq });
        remote.send(
          JSON.stringify({
            type: 'set_image',
            image_data: value.image,
            prompt: PROMPT,
            enhance_prompt: false,
          }),
        );
        return;
      }
      let signal;
      if (
        value?.type === 'offer' &&
        exact(value, ['type', 'sdp']) &&
        !offered &&
        typeof value.sdp === 'string' &&
        value.sdp.startsWith('v=0') &&
        value.sdp.length <= 65536
      ) {
        const media = value.sdp.split(/\r?\n/).filter((line) => line.startsWith('m='));
        if (media.length !== 1 || !media[0].startsWith('m=video ')) {
          close('live_invalid_offer', true);
          return;
        }
        offered = true;
        signal = value;
      } else if (
        value?.type === 'icecandidate' &&
        exact(value, ['type', 'candidate']) &&
        exact(value.candidate, ['candidate', 'sdpMid', 'sdpMLineIndex']) &&
        typeof value.candidate.candidate === 'string' &&
        value.candidate.candidate.length <= 8192 &&
        (value.candidate.sdpMLineIndex == null || value.candidate.sdpMLineIndex === 0)
      ) {
        signal = { type: 'ice-candidate', candidate: value.candidate };
      } else {
        close('live_invalid_response', true);
        return;
      }
      if (ready && remote?.readyState === WebSocket.OPEN) remote.send(JSON.stringify(signal));
      else if (queued.length < 128 && queuedBytes + raw.length < 1024 * 1024) {
        queued.push(signal);
        queuedBytes += raw.length;
      } else close('live_invalid_response', true);
    });
    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]),
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiresIn: 20,
          allowedModels: [model],
          constraints: { realtime: { maxSessionDuration: ticket.seconds } },
        }),
      });
      if (closed) return;
      if (!response.ok) {
        close(
          response.status === 401 || response.status === 403
            ? 'live_decart_key_invalid'
            : response.status === 402
              ? 'live_decart_credits'
              : response.status === 429
                ? 'live_decart_busy'
                : 'live_decart_unavailable',
          true,
        );
        return;
      }
      const token = await response.json();
      if (closed) return;
      if (
        typeof token.apiKey !== 'string' ||
        token.apiKey.length < 20 ||
        token.constraints?.realtime?.maxSessionDuration !== ticket.seconds ||
        JSON.stringify(token.permissions?.models) !== JSON.stringify([model])
      ) {
        close('live_decart_token_invalid', true);
        return;
      }
      const url = new URL(streamEndpoint);
      url.searchParams.set('api_key', token.apiKey);
      url.searchParams.set('model', model);
      remote = new WebSocket(url, {
        handshakeTimeout: 10000,
        maxPayload: 128 * 1024,
        perMessageDeflate: false,
        followRedirects: false,
      });
      remote.on('open', () => {
        if (closed) return;
        send({ type: 'iceservers', iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        remote.send(
          JSON.stringify({
            type: 'set_image',
            image_data: ticket.image,
            prompt: PROMPT,
            enhance_prompt: false,
          }),
        );
        ticket.image = '';
      });
      remote.on('message', (raw, binary) => {
        if (closed) return;
        let value;
        try {
          if (binary) throw new Error();
          value = JSON.parse(raw.toString());
        } catch {
          close('live_invalid_response', true);
          return;
        }
        if (value.type === 'set_image_ack') {
          if (!ready) {
            if (value.success !== true) {
              close('live_decart_reference_rejected', true);
              return;
            }
            ready = true;
            clearTimeout(setupTimeout);
            send({ type: 'ready', continuous: true, session_seconds_remaining: ticket.seconds });
            for (const signal of queued) remote.send(JSON.stringify(signal));
            queued = [];
            later(ticket.seconds * 1000, () => close('live_session_limit'));
          } else if (swap) {
            clearTimeout(swap.timer);
            send(
              value.success === true
                ? { type: 'applied', seq: swap.seq }
                : { type: 'select_rejected', seq: swap.seq, code: 'selection_item_unavailable' },
            );
            swap = null;
          }
        } else if (value.type === 'answer' && ready && typeof value.sdp === 'string')
          send({ type: 'answer', sdp: value.sdp });
        else if (value.type === 'ice-candidate' && value.candidate) {
          const c = value.candidate;
          send({
            type: 'icecandidate',
            candidate: {
              candidate: c.candidate,
              sdpMid: c.sdpMid ?? null,
              sdpMLineIndex: c.sdpMLineIndex ?? null,
            },
          });
        } else if (value.type === 'generation_ended')
          close(
            value.reason === 'insufficient_credits'
              ? 'live_decart_credits'
              : value.reason === 'timeout'
                ? 'live_session_limit'
                : 'live_session_ended',
            value.reason === 'insufficient_credits' || value.reason === 'error',
          );
        else if (value.type === 'error' || value.status === 'error')
          close('live_decart_unavailable', true);
        else if (value.type === 'ice-restart') close('live_decart_network', true);
      });
      remote.on('unexpected-response', (_req, response) => {
        response.resume();
        close(
          response.statusCode === 401
            ? 'live_decart_key_invalid'
            : response.statusCode === 402
              ? 'live_decart_credits'
              : 'live_decart_unavailable',
          true,
        );
      });
      remote.on('error', () => close('live_decart_unavailable', true));
      remote.on('close', () => {
        close('live_session_ended');
        active.delete(close);
      });
    } catch {
      if (!closed) close('live_decart_unavailable', true);
    }
  }
  async function close() {
    clearInterval(sweep);
    tickets.clear();
    for (const stop of [...active]) stop();
    for (const client of wss.clients) client.terminate();
    await new Promise((resolve) => wss.close(resolve));
  }
  return { handleRequest, handleUpgrade, close };
}
