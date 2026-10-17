import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Bridge = {
  handleRequest(request: IncomingMessage, response: ServerResponse): boolean;
  handleUpgrade(request: IncomingMessage, socket: Socket, head: Buffer): boolean;
  close(): Promise<void>;
};
type BridgeOptions = { apiOrigin: string; allowedOrigins?: string[]; ticketTtlMs?: number };
const bridgeModulePath = '../server/live-bridge.mjs';
const { createLiveBridge } = (await import(bridgeModulePath)) as {
  createLiveBridge(options: BridgeOptions): Bridge;
};

const sessionId = '9b2e973b-7711-473e-bd90-c34f7a9d01c2';
const accessToken = 'test-access-token-never-in-url';
const cleanups: Array<() => Promise<void>> = [];

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback port');
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function harness(options: Omit<BridgeOptions, 'apiOrigin'> = {}) {
  const requests: Array<{ url: string; headers: IncomingMessage['headers']; body: string }> = [];
  const upgrades: IncomingMessage[] = [];
  const upstream = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      url: request.url ?? '',
      headers: request.headers,
      body: Buffer.concat(chunks).toString(),
    });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ user_id: 'test-owner', forwarded_path: request.url }));
  });
  const upstreamSockets = new WebSocketServer({ server: upstream });
  upstreamSockets.on('connection', (_socket, request) => upgrades.push(request));
  const apiOrigin = await listen(upstream);
  const bridge = createLiveBridge({ apiOrigin, ...options });
  const web = createServer((request, response) => {
    if (!bridge.handleRequest(request, response)) {
      response.writeHead(404);
      response.end();
    }
  });
  web.on('upgrade', (request, socket, head) => {
    if (!bridge.handleUpgrade(request, socket as Socket, head)) socket.destroy();
  });
  const origin = await listen(web);
  const clients = new Set<WebSocket>();

  cleanups.push(async () => {
    for (const client of clients) client.terminate();
    await bridge.close();
    for (const client of upstreamSockets.clients) client.terminate();
    await new Promise<void>((resolve) => upstreamSockets.close(() => resolve()));
    await closeServer(web);
    await closeServer(upstream);
  });

  function ticketRequest({
    requestOrigin = origin,
    authorization = `Bearer ${accessToken}`,
    body = { session_id: sessionId } as Record<string, unknown>,
  } = {}) {
    return fetch(`${origin}/__lookluxe/live-ticket`, {
      method: 'POST',
      headers: {
        Origin: requestOrigin,
        ...(authorization ? { Authorization: authorization } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  async function ticket() {
    const response = await ticketRequest();
    expect(response.ok).toBe(true);
    const result = (await response.json()) as { ticket: string; expires_in: number };
    expect(result.ticket).toEqual(expect.any(String));
    expect(result.ticket).not.toContain(accessToken);
    expect(response.headers.get('cache-control')).toContain('no-store');
    return result;
  }

  function client(ticketValue: string, requestOrigin = origin) {
    const socket = new WebSocket(
      `${origin.replace('http:', 'ws:')}/__lookluxe/live-stream?ticket=${encodeURIComponent(ticketValue)}`,
      { origin: requestOrigin },
    );
    socket.on('error', () => undefined);
    clients.add(socket);
    return socket;
  }

  async function connected() {
    const issued = await ticket();
    const connectedUpstream = once(upstreamSockets, 'connection');
    const browser = client(issued.ticket);
    await once(browser, 'open');
    const [provider] = (await connectedUpstream) as [WebSocket, IncomingMessage];
    provider.on('error', () => undefined);
    return { browser, provider, ticket: issued.ticket };
  }

  async function rejected(ticketValue: string, requestOrigin = origin) {
    const socket = client(ticketValue, requestOrigin);
    return new Promise<number>((resolve, reject) => {
      socket.once('unexpected-response', (_request, response) => {
        response.resume();
        socket.terminate();
        resolve(response.statusCode ?? 0);
      });
      socket.once('open', () => {
        socket.close();
        reject(new Error('Unauthorized WebSocket opened'));
      });
      socket.once('error', reject);
    });
  }

  return {
    origin,
    requests,
    upgrades,
    upstreamSockets,
    bridge,
    ticketRequest,
    ticket,
    connected,
    rejected,
  };
}

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe('same-origin live signaling bridge', () => {
  it('issues a no-store ticket only for an authorized same-origin session request', async () => {
    const app = await harness();
    const result = await app.ticket();
    expect(result.expires_in).toBe(15);
    for (const parameters of [
      { requestOrigin: 'https://untrusted.example' },
      { requestOrigin: 'null' },
      { authorization: '' },
      { authorization: 'Basic credentials' },
      { body: { session_id: '../../another-route' } },
    ]) {
      const response = await app.ticketRequest(parameters);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    }
    const missingOrigin = await fetch(`${app.origin}/__lookluxe/live-ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    expect(missingOrigin.status).toBe(403);
    expect(app.upgrades).toHaveLength(0);
  });

  it('adds the bearer only to the fixed upstream handshake and consumes a ticket once', async () => {
    const app = await harness();
    const { browser, provider, ticket } = await app.connected();
    expect(app.upgrades).toHaveLength(1);
    expect(app.upgrades[0].url).toBe(`/v1/live-preview-sessions/${sessionId}/stream`);
    expect(app.upgrades[0].headers.authorization).toBe(`Bearer ${accessToken}`);
    expect(app.upgrades[0].url).not.toContain(accessToken);
    expect(app.upgrades[0].headers['sec-websocket-protocol']).toBeUndefined();
    expect(await app.rejected(ticket)).toBeGreaterThanOrEqual(400);
    expect(app.upgrades).toHaveLength(1);
    const remoteClose = once(provider, 'close');
    browser.close();
    await remoteClose;
  });

  it('refuses cross-origin upgrades even when a valid ticket is presented', async () => {
    const app = await harness();
    const { ticket } = await app.ticket();
    expect(await app.rejected(ticket, 'https://untrusted.example')).toBeGreaterThanOrEqual(400);
    expect(app.upgrades).toHaveLength(0);
  });

  it('expires unused tickets instead of retaining reusable access credentials', async () => {
    const app = await harness({ ticketTtlMs: 15 });
    const { ticket } = await app.ticket();
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    expect(await app.rejected(ticket)).toBeGreaterThanOrEqual(400);
    expect(app.upgrades).toHaveLength(0);
  });

  it('binds an allowlisted ticket to the origin that requested it', async () => {
    const firstOrigin = 'https://app.example.test';
    const otherOrigin = 'https://other.example.test';
    const app = await harness({ allowedOrigins: [firstOrigin, otherOrigin] });
    const response = await app.ticketRequest({ requestOrigin: firstOrigin });
    expect(response.status).toBe(201);
    const { ticket } = (await response.json()) as { ticket: string };
    expect(await app.rejected(ticket, otherOrigin)).toBe(401);
    expect(app.upgrades).toHaveLength(0);
  });

  it('relays video signaling and garment swaps without altering their contracts', async () => {
    const app = await harness();
    const { browser, provider } = await app.connected();
    const offer = {
      type: 'offer',
      sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendrecv\r\n',
    };
    const receivedOffer = once(provider, 'message');
    browser.send(JSON.stringify(offer));
    expect(JSON.parse(String((await receivedOffer)[0]))).toEqual(offer);

    const answer = { type: 'answer', sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' };
    const receivedAnswer = once(browser, 'message');
    provider.send(JSON.stringify(answer));
    expect(JSON.parse(String((await receivedAnswer)[0]))).toEqual(answer);

    const selection = {
      type: 'select',
      seq: 1,
      selection: { top: { source: 'wardrobe', item_id: sessionId } },
    };
    const receivedSelection = once(provider, 'message');
    browser.send(JSON.stringify(selection));
    expect(JSON.parse(String((await receivedSelection)[0]))).toEqual(selection);

    const applied = { type: 'applied', seq: 1 };
    const receivedApplied = once(browser, 'message');
    provider.send(JSON.stringify(applied));
    expect(JSON.parse(String((await receivedApplied)[0]))).toEqual(applied);
  });

  it.each([
    ['provider instructions', { type: 'set_image', image_data: 'private-photo', prompt: 'change' }],
    ['unknown command', { type: 'arbitrary-command' }],
    ['credential-bearing offer', { type: 'offer', sdp: 'v=0', authorization: accessToken }],
  ])('rejects %s before it can reach the upstream', async (_label, message) => {
    const app = await harness();
    const { browser, provider } = await app.connected();
    const forwarded: unknown[] = [];
    provider.on('message', (data) => forwarded.push(String(data)));
    const closed = once(browser, 'close');
    browser.send(JSON.stringify(message));
    await Promise.race([
      closed,
      once(provider, 'message').then(() => {
        throw new Error('Forbidden browser payload reached the backend');
      }),
    ]);
    expect(forwarded).toEqual([]);
    await vi.waitFor(() => expect(provider.readyState).toBe(WebSocket.CLOSED));
  });

  it('rejects binary camera payloads because this socket carries signaling only', async () => {
    const app = await harness();
    const { browser, provider } = await app.connected();
    const forwarded: unknown[] = [];
    provider.on('message', (data) => forwarded.push(data));
    const closed = once(browser, 'close');
    browser.send(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    await closed;
    expect(forwarded).toEqual([]);
    await vi.waitFor(() => expect(provider.readyState).toBe(WebSocket.CLOSED));
  });

  it('does not expose unrecognized provider messages to the browser', async () => {
    const app = await harness();
    const { browser, provider } = await app.connected();
    const received: unknown[] = [];
    browser.on('message', (data) => received.push(data));
    const closed = once(browser, 'close');
    provider.send(
      JSON.stringify({ type: 'provider_credentials', api_key: 'private-provider-key' }),
    );
    await closed;
    expect(received).toEqual([]);
  });

  it('ends the browser connection when its upstream disconnects', async () => {
    const app = await harness();
    const { browser, provider } = await app.connected();
    const closed = once(browser, 'close');
    provider.close(1000);
    await closed;
    expect(browser.readyState).toBe(WebSocket.CLOSED);
  });

  it('shutdown closes active peers and clears unused tickets', async () => {
    const app = await harness();
    const { browser, provider } = await app.connected();
    const unused = await app.ticket();
    const browserClosed = once(browser, 'close');
    const providerClosed = once(provider, 'close');
    await app.bridge.close();
    await Promise.all([browserClosed, providerClosed]);
    expect(await app.rejected(unused.ticket)).toBe(401);
  });

  it('proxies REST to the configured backend and denies a foreign-origin mutation', async () => {
    const app = await harness();
    const response = await fetch(
      `${app.origin}/__lookluxe/api/v1/me?url=https%3A%2F%2Funtrusted.example%2Fsteal`,
      { headers: { Origin: app.origin, Authorization: `Bearer ${accessToken}` } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user_id: 'test-owner' });
    expect(app.requests).toHaveLength(1);
    expect(app.requests[0].url).toBe('/v1/me?url=https%3A%2F%2Funtrusted.example%2Fsteal');
    expect(app.requests[0].headers.authorization).toBe(`Bearer ${accessToken}`);

    const body = JSON.stringify({ selection: { top: { source: 'wardrobe', item_id: sessionId } } });
    const write = await fetch(`${app.origin}/__lookluxe/api/v1/fitting-room/sessions`, {
      method: 'POST',
      headers: {
        Origin: app.origin,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'web:stable-live-session',
        Cookie: 'browser-only-cookie=private',
      },
      body,
    });
    expect(write.status).toBe(200);
    expect(app.requests[1].body).toBe(body);
    expect(app.requests[1].headers['idempotency-key']).toBe('web:stable-live-session');
    expect(app.requests[1].headers.cookie).toBeUndefined();

    const rejected = await fetch(`${app.origin}/__lookluxe/api/v1/fitting-room/sessions`, {
      method: 'POST',
      headers: {
        Origin: 'https://untrusted.example',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ selection: {} }),
    });
    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.status).toBeLessThan(500);
    expect(app.requests).toHaveLength(2);
  });
});
