import { randomBytes } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { WebSocket, WebSocketServer } from 'ws';

const MAX_SIGNAL = 128 * 1024;
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clientTypes = new Set(['offer', 'icecandidate', 'select', 'stop']);
const serverTypes = new Set([
  'iceservers',
  'ready',
  'answer',
  'icecandidate',
  'applying',
  'applied',
  'select_rejected',
  'stopped',
  'error',
]);
const exactKeys = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => keys.includes(key));
function validClient(value) {
  if (value.type === 'stop') return exactKeys(value, ['type']);
  if (value.type === 'offer')
    return (
      exactKeys(value, ['type', 'sdp']) &&
      typeof value.sdp === 'string' &&
      value.sdp.startsWith('v=0') &&
      value.sdp.length <= 65536
    );
  if (value.type === 'icecandidate')
    return (
      exactKeys(value, ['type', 'candidate']) &&
      exactKeys(value.candidate, ['candidate', 'sdpMid', 'sdpMLineIndex']) &&
      typeof value.candidate.candidate === 'string' &&
      value.candidate.candidate.length > 0 &&
      value.candidate.candidate.length <= 8192 &&
      (value.candidate.sdpMid == null || typeof value.candidate.sdpMid === 'string') &&
      (value.candidate.sdpMLineIndex == null || value.candidate.sdpMLineIndex === 0)
    );
  if (value.type === 'select')
    return (
      exactKeys(value, ['type', 'seq', 'selection']) &&
      Number.isInteger(value.seq) &&
      value.seq >= 0 &&
      value.seq <= 2147483647 &&
      exactKeys(value.selection, ['top', 'bottom', 'dress', 'shoes']) &&
      Object.values(value.selection).every(
        (item) =>
          item === null ||
          (exactKeys(item, ['source', 'item_id']) &&
            ['wardrobe', 'catalog'].includes(item.source) &&
            typeof item.item_id === 'string' &&
            SESSION.test(item.item_id)),
      )
    );
  return false;
}

/** Same-origin HTTP + signaling adapter. Media travels directly over WebRTC.
 * Tokens, tickets, SDP and ICE are deliberately never logged or persisted. */
export function createLiveBridge({ apiOrigin, allowedOrigins = [], ticketTtlMs = 15_000 } = {}) {
  const upstream = apiOrigin ? new URL(apiOrigin) : null;
  if (
    upstream &&
    (!['http:', 'https:'].includes(upstream.protocol) ||
      upstream.username ||
      upstream.password ||
      upstream.pathname !== '/' ||
      upstream.search ||
      upstream.hash)
  )
    throw new Error('LOOKLUXE_API_ORIGIN must be an HTTP(S) origin');
  const tickets = new Map();
  const peers = new Set();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_SIGNAL,
    perMessageDeflate: false,
  });
  const cleanTickets = () => {
    for (const [key, value] of tickets) if (value.expires <= Date.now()) tickets.delete(key);
  };
  const sweep = setInterval(cleanTickets, 15_000);
  sweep.unref();
  function validOrigin(req, required = true) {
    const origin = req.headers.origin;
    if (!origin) return !required && req.headers['sec-fetch-site'] !== 'cross-site';
    if (allowedOrigins.length) return allowedOrigins.includes(origin);
    return origin === `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
  }
  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  function reject(res, status, code) {
    json(res, status, { code, detail: code.replaceAll('_', ' ') });
  }
  function handleRequest(req, res) {
    const url = new URL(req.url, 'http://bridge.invalid');
    if (url.pathname === '/__lookluxe/live-ticket') {
      if (req.method !== 'POST') {
        reject(res, 405, 'method_not_allowed');
        return true;
      }
      if (!validOrigin(req)) {
        reject(res, 403, 'origin_not_allowed');
        return true;
      }
      if (!upstream) {
        reject(res, 503, 'backend_not_configured');
        return true;
      }
      const authorization = req.headers.authorization;
      if (
        typeof authorization !== 'string' ||
        !/^Bearer [\x21-\x7e]{1,8192}$/.test(authorization)
      ) {
        reject(res, 401, 'unauthenticated');
        return true;
      }
      let body = '',
        oversized = false;
      req.on('data', (chunk) => {
        if (oversized) return;
        body += chunk.toString();
        if (body.length > 4096) {
          oversized = true;
          reject(res, 413, 'request_too_large');
        }
      });
      req.on('end', () => {
        if (oversized) return;
        let id;
        try {
          id = JSON.parse(body).session_id;
        } catch {
          /* invalid JSON */
        }
        if (typeof id !== 'string' || !SESSION.test(id)) {
          reject(res, 400, 'invalid_session');
          return;
        }
        cleanTickets();
        if (tickets.size >= 512) {
          reject(res, 429, 'bridge_busy');
          return;
        }
        const ticket = randomBytes(32).toString('base64url');
        tickets.set(ticket, {
          id,
          authorization,
          origin: req.headers.origin,
          expires: Date.now() + ticketTtlMs,
        });
        json(res, 201, { ticket, expires_in: Math.ceil(ticketTtlMs / 1000) });
      });
      req.on('error', () => {
        if (!res.headersSent) reject(res, 400, 'invalid_request');
      });
      return true;
    }
    if (!url.pathname.startsWith('/__lookluxe/api/')) return false;
    if (!validOrigin(req, false)) {
      reject(res, 403, 'origin_not_allowed');
      return true;
    }
    if (!upstream) {
      reject(res, 503, 'backend_not_configured');
      return true;
    }
    const path = url.pathname.slice('/__lookluxe/api'.length);
    if (
      !path.startsWith('/v1/') ||
      !['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)
    ) {
      reject(res, 400, 'invalid_api_path');
      return true;
    }
    const target = new URL(upstream);
    target.pathname = path;
    target.search = url.search;
    const headers = {};
    for (const key of ['authorization', 'content-type', 'accept', 'idempotency-key'])
      if (req.headers[key]) headers[key] = req.headers[key];
    const proxy = (target.protocol === 'https:' ? https : http).request(
      target,
      { method: req.method, headers, timeout: 60_000 },
      (response) => {
        const returned = { 'Cache-Control': 'no-store' };
        for (const key of ['content-type', 'retry-after'])
          if (response.headers[key]) returned[key] = response.headers[key];
        res.writeHead(response.statusCode ?? 502, returned);
        response.pipe(res);
      },
    );
    proxy.on('timeout', () => proxy.destroy());
    proxy.on('error', () => {
      if (!res.headersSent) reject(res, 502, 'backend_unavailable');
      else res.destroy();
    });
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        if (!res.headersSent) reject(res, 413, 'request_too_large');
        proxy.destroy();
      }
    });
    req.on('aborted', () => proxy.destroy());
    res.on('close', () => {
      if (!res.writableEnded) proxy.destroy();
    });
    req.pipe(proxy);
    return true;
  }
  function handleUpgrade(req, socket, head) {
    const url = new URL(req.url, 'http://bridge.invalid');
    if (url.pathname !== '/__lookluxe/live-stream') return false;
    const deny = (status) => {
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    };
    if (!validOrigin(req)) {
      deny('403 Forbidden');
      return true;
    }
    const key = url.searchParams.get('ticket');
    const ticket = tickets.get(key);
    tickets.delete(key);
    if (
      !upstream ||
      !ticket ||
      ticket.expires <= Date.now() ||
      ticket.origin !== req.headers.origin
    ) {
      deny('401 Unauthorized');
      return true;
    }
    wss.handleUpgrade(req, socket, head, (downstream) => {
      const endpoint = new URL(`/v1/live-preview-sessions/${ticket.id}/stream`, upstream);
      endpoint.protocol = upstream.protocol === 'https:' ? 'wss:' : 'ws:';
      const remote = new WebSocket(endpoint, {
        headers: { Authorization: ticket.authorization },
        maxPayload: MAX_SIGNAL,
        handshakeTimeout: 10_000,
        perMessageDeflate: false,
        followRedirects: false,
      });
      let queue = [],
        closed = false;
      const close = (code = 1000) => {
        if (closed) return;
        closed = true;
        queue = [];
        peers.delete(close);
        for (const peer of [downstream, remote]) {
          if (peer.readyState === WebSocket.CONNECTING) peer.terminate();
          else if (peer.readyState === WebSocket.OPEN) peer.close(code);
        }
        const timer = setTimeout(() => {
          downstream.terminate();
          remote.terminate();
        }, 1000);
        timer.unref();
      };
      peers.add(close);
      const signal = (data, binary, types) => {
        if (binary || data.length > MAX_SIGNAL) return false;
        try {
          const value = JSON.parse(data.toString());
          return value && types.has(value.type) && (types !== clientTypes || validClient(value));
        } catch {
          return false;
        }
      };
      downstream.on('message', (data, binary) => {
        if (!signal(data, binary, clientTypes)) {
          close(1008);
          return;
        }
        if (remote.readyState === WebSocket.OPEN) {
          if (remote.bufferedAmount > MAX_SIGNAL * 8) {
            close(1008);
            return;
          }
          remote.send(data.toString());
        } else if (!closed && queue.length < 128) queue.push(data.toString());
        else close(1008);
      });
      remote.on('open', () => {
        if (closed) return;
        for (const data of queue) remote.send(data);
        queue = [];
      });
      remote.on('message', (data, binary) => {
        if (!signal(data, binary, serverTypes)) {
          close(1008);
          return;
        }
        if (downstream.readyState === WebSocket.OPEN && downstream.bufferedAmount <= MAX_SIGNAL * 8)
          downstream.send(data.toString());
        else close(1008);
      });
      remote.on('unexpected-response', (_request, response) => {
        response.resume();
        close(response.statusCode === 401 ? 4401 : 1011);
      });
      for (const peer of [downstream, remote]) {
        peer.on('error', () => close(1011));
        peer.on('close', () => close());
      }
    });
    return true;
  }
  async function close() {
    clearInterval(sweep);
    tickets.clear();
    for (const stop of [...peers]) stop();
    for (const client of wss.clients) client.terminate();
    await new Promise((resolve) => wss.close(resolve));
  }
  return { handleRequest, handleUpgrade, close };
}
