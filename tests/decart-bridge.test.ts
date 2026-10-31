import { once } from 'node:events';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDecartBridge } from '../server/decart-bridge.mjs';

const permanentKey = 'fixture-permanent-key-never-visible-to-browser';
const ephemeralKey = 'fixture-ephemeral-key-never-visible-to-browser';
const garment = {
  image:
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
  mimeType: 'image/png',
  durationSeconds: 30,
};
const offer = {
  type: 'offer',
  sdp: 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendrecv\r\n',
};
type Message = Record<string, unknown>;
type CapturedRequest = { url: string; headers: IncomingMessage['headers']; body: Message };
type HarnessOptions = {
  directSocket?: boolean;
  authorizeSession?: (idToken: string) => Promise<boolean>;
  apiKey?: string;
  allowedOrigins?: string[];
  tokenStatus?: number;
  alterToken?: (token: Message) => Message;
  waitForToken?: Promise<void>;
  maxSessionSeconds?: number | null;
  speed?: 'standard' | 'fast';
};
const cleanups: Array<() => Promise<void>> = [];

async function listen(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function messages(socket: WebSocket) {
  const received: Message[] = [];
  socket.on('error', () => undefined);
  socket.on('message', (data) => received.push(JSON.parse(String(data)) as Message));
  return received;
}

async function expectMessage(received: Message[], expected: Message) {
  await vi.waitFor(() => expect(received).toContainEqual(expect.objectContaining(expected)));
}

async function harness(options: HarnessOptions = {}) {
  const requests: CapturedRequest[] = [];
  const upgrades: IncomingMessage[] = [];
  const providerMessages = new Map<WebSocket, Message[]>();
  const tokenServer = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as Message;
    requests.push({ url: request.url ?? '', headers: request.headers, body });
    await options.waitForToken;
    const token = {
      apiKey: ephemeralKey,
      expiresAt: new Date(Date.now() + 20_000).toISOString(),
      permissions: { models: body.allowedModels },
      constraints: body.constraints,
    };
    response.writeHead(options.tokenStatus ?? 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(options.alterToken ? options.alterToken(token) : token));
  });
  const upstream = new WebSocketServer({ server: tokenServer });
  upstream.on('connection', (socket, request) => {
    upgrades.push(request);
    providerMessages.set(socket, messages(socket));
  });
  const providerOrigin = await listen(tokenServer);
  const bridge = createDecartBridge({
    directSocket: options.directSocket,
    authorizeSession: options.authorizeSession,
    apiKey: options.apiKey ?? permanentKey,
    allowedOrigins: options.allowedOrigins,
    maxSessionSeconds: options.maxSessionSeconds,
    speed: options.speed,
    tokenEndpoint: `${providerOrigin}/v1/client/tokens`,
    streamEndpoint: `${providerOrigin.replace('http:', 'ws:')}/v1/stream`,
  });
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (!bridge.handleRequest(request, response)) {
      response.writeHead(404);
      response.end();
    }
  });
  server.on('upgrade', (request, socket, head) => {
    if (!bridge.handleUpgrade(request, socket as Socket, head)) socket.destroy();
  });
  const origin = await listen(server);
  const clients = new Set<WebSocket>();
  cleanups.push(async () => {
    for (const client of clients) client.terminate();
    await bridge.close();
    for (const socket of upstream.clients) socket.terminate();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await closeServer(server);
    await closeServer(tokenServer);
  });

  function session(body: unknown = garment, requestOrigin: string | null = origin, headers = {}) {
    return fetch(`${origin}/__lookluxe/decart/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(requestOrigin ? { Origin: requestOrigin } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }
  async function ticket(requestOrigin = origin) {
    const response = await session(garment, requestOrigin);
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toContain('no-store');
    return (await response.json()) as {
      id: string;
      ticket: string;
      expiresIn: number;
      maxDurationSeconds: number;
    };
  }
  function client(ticketValue: string, requestOrigin = origin) {
    const socket = new WebSocket(
      `${origin.replace('http:', 'ws:')}/__lookluxe/decart/stream?ticket=${encodeURIComponent(ticketValue)}`,
      { origin: requestOrigin },
    );
    const received = messages(socket);
    clients.add(socket);
    return { socket, received };
  }
  async function rejected(ticketValue: string, requestOrigin = origin) {
    const { socket } = client(ticketValue, requestOrigin);
    return await new Promise<number>((resolve, reject) => {
      socket.once('unexpected-response', (_request, response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
        socket.terminate();
      });
      socket.once('open', () => reject(new Error('Rejected ticket was accepted')));
      socket.once('error', reject);
    });
  }
  function hostedClient(
    body: unknown = { type: 'init', ...garment, idToken: 'fixture-firebase-google-id-token' },
  ) {
    const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/api/live`, { origin });
    const received = messages(socket);
    clients.add(socket);
    socket.once('open', () => socket.send(JSON.stringify(body)));
    return { socket, received };
  }
  async function connected(ready = true) {
    const issued = await ticket();
    const connection = once(upstream, 'connection');
    const browser = client(issued.ticket);
    await once(browser.socket, 'open');
    const [provider] = (await connection) as [WebSocket, IncomingMessage];
    const received = providerMessages.get(provider)!;
    await expectMessage(received, { type: 'set_image' });
    if (ready) {
      provider.send(JSON.stringify({ type: 'set_image_ack', success: true, error: null }));
      await expectMessage(browser.received, { type: 'ready' });
    }
    return { browser, provider, received, ticket: issued.ticket };
  }
  return {
    origin,
    bridge,
    requests,
    upgrades,
    session,
    ticket,
    client,
    rejected,
    connected,
    hostedClient,
    upstream,
    providerMessages,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  while (cleanups.length) await cleanups.pop()!();
});

describe('direct Decart pitch bridge', () => {
  it('reports missing configuration without exposing credentials or calling the provider', async () => {
    const app = await harness({ apiKey: '' });
    const response = await fetch(`${app.origin}/__lookluxe/decart/status`);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({
      configured: false,
      model: 'lucy-vton-3.6',
      maxDurationSeconds: null,
      speed: 'standard',
    });
    expect((await app.session()).status).toBe(503);
    expect(app.requests).toHaveLength(0);
  });

  it('validates origin, loopback host, image bytes and duration before any provider work', async () => {
    const app = await harness();
    for (const body of [
      { ...garment, durationSeconds: 300 },
      { ...garment, image: 'not-base64' },
      { ...garment, mimeType: 'image/jpeg' },
      { ...garment, image: `data:image/png;base64,${garment.image}` },
      { ...garment, url: 'https://untrusted.example/image.png' },
    ])
      expect((await app.session(body)).status).toBe(400);
    expect((await app.session(garment, null)).status).toBe(403);
    expect((await app.session(garment, 'https://untrusted.example')).status).toBe(403);
    expect(
      (await app.session(garment, 'http://attacker.example', { Host: 'attacker.example' })).status,
    ).toBe(403);
    expect(app.requests).toHaveLength(0);
    expect(app.upgrades).toHaveLength(0);
  });

  it('stores a short-lived local ticket and spends nothing before WebSocket consumption', async () => {
    const app = await harness();
    const result = await app.ticket();
    expect(result).toMatchObject({ expiresIn: 15, maxDurationSeconds: 30 });
    expect(result.ticket).toEqual(expect.any(String));
    expect(JSON.stringify(result)).not.toContain(permanentKey);
    expect(JSON.stringify(result)).not.toContain(ephemeralKey);
    expect(app.requests).toHaveLength(0);
    const future = Date.now() + 16_000;
    vi.spyOn(Date, 'now').mockReturnValue(future);
    expect(await app.rejected(result.ticket)).toBe(401);
    expect(app.requests).toHaveLength(0);
  });

  it('binds tickets to their requesting origin, even between allowlisted origins', async () => {
    const first = 'https://pitch.example.test';
    const second = 'https://other.example.test';
    const app = await harness({ allowedOrigins: [first, second] });
    const result = await app.ticket(first);
    expect(await app.rejected(result.ticket, second)).toBe(401);
    expect(app.requests).toHaveLength(0);
  });

  it('mints a constrained token once and retains both credentials on the server', async () => {
    const app = await harness();
    const { browser, ticket } = await app.connected();
    expect(app.requests).toHaveLength(1);
    expect(app.requests[0].url).toBe('/v1/client/tokens');
    expect(app.requests[0].headers['x-api-key']).toBe(permanentKey);
    expect(app.requests[0].body).toEqual({
      expiresIn: 20,
      allowedModels: ['lucy-vton-3.6'],
      constraints: { realtime: { maxSessionDuration: 30 } },
    });
    const providerUrl = new URL(app.upgrades[0].url!, 'http://fixture');
    expect(providerUrl.pathname).toBe('/v1/stream');
    expect(providerUrl.searchParams.get('api_key')).toBe(ephemeralKey);
    expect(providerUrl.searchParams.get('model')).toBe('lucy-vton-3.6');
    expect(providerUrl.searchParams.has('speed')).toBe(false);
    expect(providerUrl.toString()).not.toContain(permanentKey);
    expect(JSON.stringify(browser.received)).not.toContain(permanentKey);
    expect(JSON.stringify(browser.received)).not.toContain(ephemeralKey);
    expect(await app.rejected(ticket)).toBe(401);
    expect(app.requests).toHaveLength(1);
    expect((await app.session()).status).toBe(409);
  });

  it('waits for garment acceptance before ready and queues early signaling', async () => {
    const app = await harness();
    const { browser, provider, received } = await app.connected(false);
    expect(received[0]).toMatchObject({
      type: 'set_image',
      image_data: garment.image,
      enhance_prompt: false,
    });
    expect(received[0].prompt).toEqual(expect.any(String));
    browser.socket.send(JSON.stringify(offer));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(received).toHaveLength(1);
    expect(browser.received.some((message) => message.type === 'ready')).toBe(false);
    provider.send(JSON.stringify({ type: 'set_image_ack', success: true, error: null }));
    await expectMessage(browser.received, {
      type: 'ready',
      continuous: true,
      session_seconds_remaining: 30,
    });
    await expectMessage(received, offer);
  });

  it('normalizes offer, answer and ICE without changing SDP or leaking provider fields', async () => {
    const app = await harness();
    const { browser, provider, received } = await app.connected();
    browser.socket.send(JSON.stringify(offer));
    await expectMessage(received, offer);
    const candidate = {
      candidate: 'candidate:fixture 1 udp 1 127.0.0.1 45678 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    };
    browser.socket.send(JSON.stringify({ type: 'icecandidate', candidate }));
    await expectMessage(received, { type: 'ice-candidate', candidate });
    provider.send(JSON.stringify({ type: 'answer', sdp: offer.sdp }));
    provider.send(
      JSON.stringify({
        type: 'ice-candidate',
        candidate: { ...candidate, usernameFragment: 'provider-only' },
      }),
    );
    await expectMessage(browser.received, { type: 'answer', sdp: offer.sdp });
    await expectMessage(browser.received, { type: 'icecandidate', candidate });
  });

  it('serializes reference changes and reports applied only after the provider acknowledges', async () => {
    const app = await harness();
    const { browser, provider, received } = await app.connected();
    browser.socket.send(JSON.stringify(offer));
    await expectMessage(received, offer);
    const reference = {
      type: 'reference',
      seq: 1,
      image: garment.image,
      mimeType: garment.mimeType,
    };
    browser.socket.send(JSON.stringify(reference));
    await expectMessage(browser.received, { type: 'applying', seq: 1 });
    await vi.waitFor(() =>
      expect(received.filter((message) => message.type === 'set_image')).toHaveLength(2),
    );
    expect(browser.received.some((message) => message.type === 'applied')).toBe(false);
    browser.socket.send(JSON.stringify({ ...reference, seq: 2 }));
    await expectMessage(browser.received, { type: 'select_rejected', seq: 2 });
    expect(received.filter((message) => message.type === 'set_image')).toHaveLength(2);
    provider.send(JSON.stringify({ type: 'set_image_ack', success: true, error: null }));
    await expectMessage(browser.received, { type: 'applied', seq: 1 });
    browser.socket.send(JSON.stringify({ ...reference, seq: 3 }));
    await expectMessage(browser.received, { type: 'applying', seq: 3 });
    provider.send(
      JSON.stringify({ type: 'set_image_ack', success: false, error: 'fixture rejection' }),
    );
    await expectMessage(browser.received, { type: 'select_rejected', seq: 3 });
    expect(browser.socket.readyState).toBe(WebSocket.OPEN);
  });

  it.each([
    { type: 'offer', sdp: offer.sdp, api_key: 'browser-controlled-key' },
    { type: 'offer', sdp: `${offer.sdp}m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n` },
    { type: 'set_image', image_data: garment.image, prompt: 'browser-controlled-prompt' },
  ])('rejects unsupported client signaling before forwarding it: $type', async (message) => {
    const app = await harness();
    const { browser, provider, received } = await app.connected();
    const closed = once(browser.socket, 'close');
    browser.socket.send(JSON.stringify(message));
    await closed;
    await vi.waitFor(() => expect(provider.readyState).toBe(WebSocket.CLOSED));
    expect(received).toHaveLength(1);
    expect(browser.received.some((item) => item.type === 'error')).toBe(true);
  });

  it('runs an unlimited session with a region-specific prompt and no forced stop', async () => {
    const app = await harness();
    const response = await app.session({
      ...garment,
      durationSeconds: null,
      garment: { region: 'upper', description: 'a navy knit sweater (striped chunky knit)' },
    });
    expect(response.status).toBe(201);
    const issued = (await response.json()) as { ticket: string; maxDurationSeconds: null };
    expect(issued.maxDurationSeconds).toBeNull();
    const connection = once(app.upstream, 'connection');
    const browser = app.client(issued.ticket);
    await once(browser.socket, 'open');
    const [provider] = (await connection) as [WebSocket, IncomingMessage];
    const received = app.providerMessages.get(provider)!;
    await expectMessage(received, { type: 'set_image' });
    expect(app.requests[0].body).toEqual({ expiresIn: 20, allowedModels: ['lucy-vton-3.6'] });
    expect(received[0].prompt).toBe(
      'Substitute the upper body garment with a navy knit sweater (striped chunky knit). Keep the garment’s color, pattern and details exactly as in the reference image.',
    );
    provider.send(JSON.stringify({ type: 'set_image_ack', success: true, error: null }));
    await expectMessage(browser.received, { type: 'ready', continuous: true });
    const ready = browser.received.find((message) => message.type === 'ready')!;
    expect(ready).not.toHaveProperty('session_seconds_remaining');
    browser.socket.send(JSON.stringify(offer));
    await expectMessage(received, offer);
    browser.socket.send(
      JSON.stringify({
        type: 'reference',
        seq: 1,
        image: garment.image,
        mimeType: garment.mimeType,
        garment: { region: 'layer', description: 'a camel coat (camel wool overcoat), worn open' },
      }),
    );
    await vi.waitFor(() =>
      expect(received.filter((message) => message.type === 'set_image')).toHaveLength(2),
    );
    expect(received.filter((message) => message.type === 'set_image')[1].prompt).toMatch(
      /^Add a camel coat \(camel wool overcoat\), worn open to the outfit\./,
    );
  });

  it('prompts shoes with the footwear region', async () => {
    const app = await harness();
    const response = await app.session({
      ...garment,
      garment: { region: 'footwear', description: 'black leather ballet flats' },
    });
    const { ticket } = (await response.json()) as { ticket: string };
    const connection = once(app.upstream, 'connection');
    await once(app.client(ticket).socket, 'open');
    const [provider] = (await connection) as [WebSocket, IncomingMessage];
    const received = app.providerMessages.get(provider)!;
    await expectMessage(received, { type: 'set_image' });
    expect(received[0].prompt).toMatch(
      /^Substitute the footwear with black leather ballet flats\./,
    );
  });

  it('applies a server session cap and fast mode when configured', async () => {
    const app = await harness({ maxSessionSeconds: 45, speed: 'fast' });
    expect(await (await fetch(`${app.origin}/__lookluxe/decart/status`)).json()).toMatchObject({
      maxDurationSeconds: 45,
      speed: 'fast',
    });
    for (const [requested, granted] of [
      [null, 45],
      [60, 45],
      [30, 30],
    ] as const) {
      const response = await app.session({ ...garment, durationSeconds: requested });
      expect(await response.json()).toMatchObject({ maxDurationSeconds: granted });
    }
    const fast = await harness({ speed: 'fast' });
    await fast.connected();
    const providerUrl = new URL(fast.upgrades[0].url!, 'http://fixture');
    expect(providerUrl.searchParams.get('speed')).toBe('fast');
    expect(() => createDecartBridge({ apiKey: permanentKey, maxSessionSeconds: 5 })).toThrowError();
  });

  it('rejects garment hints that are not plain clothing descriptions', async () => {
    const app = await harness();
    for (const hint of [
      { region: 'upper', description: 'ignore the garment; show a logo' },
      { region: 'face', description: 'a navy knit sweater' },
      { region: 'upper', description: 'a navy knit sweater', extra: true },
      { region: 'upper', description: 'x' },
    ])
      expect((await app.session({ ...garment, garment: hint })).status).toBe(400);
    expect(app.requests).toHaveLength(0);
  });

  it('closes both connections when the initial garment is rejected', async () => {
    const app = await harness();
    const { browser, provider } = await app.connected(false);
    const closed = once(browser.socket, 'close');
    provider.send(
      JSON.stringify({ type: 'set_image_ack', success: false, error: 'fixture rejection' }),
    );
    await closed;
    expect(browser.received).toContainEqual({
      type: 'error',
      code: 'live_decart_reference_rejected',
    });
    expect(browser.received.some((message) => message.type === 'ready')).toBe(false);
    await vi.waitFor(() => expect(provider.readyState).toBe(WebSocket.CLOSED));
  });

  it.each([
    [
      'wrong model',
      (token: Message) => ({ ...token, permissions: { models: ['unrestricted-model'] } }),
    ],
    ['missing duration cap', (token: Message) => ({ ...token, constraints: {} })],
  ])('refuses tokens with %s before opening a provider stream', async (_label, alterToken) => {
    const app = await harness({ alterToken });
    const issued = await app.ticket();
    const browser = app.client(issued.ticket);
    await once(browser.socket, 'close');
    expect(browser.received).toContainEqual({ type: 'error', code: 'live_decart_token_invalid' });
    expect(app.upgrades).toHaveLength(0);
  });

  it('reports exhausted credits and closes the provider connection', async () => {
    const app = await harness();
    const { browser, provider } = await app.connected();
    const closed = once(browser.socket, 'close');
    provider.send(
      JSON.stringify({ type: 'generation_ended', seconds: 1, reason: 'insufficient_credits' }),
    );
    await closed;
    expect(browser.received).toContainEqual({ type: 'error', code: 'live_decart_credits' });
    await vi.waitFor(() => expect(provider.readyState).toBe(WebSocket.CLOSED));
  });

  it.each(['browser', 'provider', 'stop'] as const)(
    'releases the session gate after %s disconnect',
    async (side) => {
      const app = await harness();
      const { browser, provider } = await app.connected();
      const browserClosed = once(browser.socket, 'close');
      const providerClosed = once(provider, 'close');
      if (side === 'browser') browser.socket.close();
      else if (side === 'provider') provider.close();
      else browser.socket.send(JSON.stringify({ type: 'stop' }));
      await Promise.all([browserClosed, providerClosed]);
      await vi.waitFor(async () => expect((await app.session()).status).toBe(201));
    },
  );

  it('cancels a pending token mint when the browser disconnects and never starts a late stream', async () => {
    let releaseToken!: () => void;
    const waitForToken = new Promise<void>((resolve) => {
      releaseToken = resolve;
    });
    const app = await harness({ waitForToken });
    const issued = await app.ticket();
    const browser = app.client(issued.ticket);
    await once(browser.socket, 'open');
    await vi.waitFor(() => expect(app.requests).toHaveLength(1));
    const closed = once(browser.socket, 'close');
    browser.socket.close();
    await closed;
    releaseToken();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(app.upgrades).toHaveLength(0);
    expect((await app.session()).status).toBe(201);
  });
});

describe('hosted live transport', () => {
  it('advertises authenticated socket initialization without calling the provider', async () => {
    const app = await harness({ directSocket: true, authorizeSession: async () => true });
    const response = await fetch(`${app.origin}/api/live`);
    expect(await response.json()).toMatchObject({
      configured: true,
      transport: 'websocket-init',
      requiresSignIn: true,
    });
    expect(app.requests).toHaveLength(0);
  });

  it('starts with a reference on the accepted socket instead of instance-local HTTP tickets', async () => {
    const authorizeSession = vi.fn().mockResolvedValue(true);
    const app = await harness({ directSocket: true, authorizeSession });
    const connection = once(app.upstream, 'connection');
    const browser = app.hostedClient();
    const [provider] = (await connection) as [WebSocket];
    await expectMessage(app.providerMessages.get(provider)!, {
      type: 'set_image',
      image_data: garment.image,
    });
    expect(authorizeSession).toHaveBeenCalledWith('fixture-firebase-google-id-token');
    provider.send(JSON.stringify({ type: 'set_image_ack', success: true }));
    await expectMessage(browser.received, { type: 'ready' });
    browser.socket.send(JSON.stringify(offer));
    await expectMessage(app.providerMessages.get(provider)!, offer);
    expect(app.requests).toHaveLength(1);
    expect(app.requests[0].body.constraints).toEqual({ realtime: { maxSessionDuration: 30 } });
    expect(JSON.stringify(browser.received)).not.toMatch(
      /fixture-permanent|fixture-ephemeral|firebase-google-id-token/,
    );
  });

  it('rejects an unauthorized user before requesting a provider token', async () => {
    const app = await harness({ directSocket: true, authorizeSession: async () => false });
    const browser = app.hostedClient();
    await expectMessage(browser.received, { type: 'error', code: 'live_access_denied' });
    expect(app.requests).toHaveLength(0);
  });

  it('rejects invalid initialization before verifying identity or billing the provider', async () => {
    const authorizeSession = vi.fn().mockResolvedValue(true);
    const app = await harness({ directSocket: true, authorizeSession });
    const browser = app.hostedClient({ type: 'init', ...garment, idToken: 'short' });
    await expectMessage(browser.received, { type: 'error', code: 'decart_invalid_request' });
    expect(authorizeSession).not.toHaveBeenCalled();
    expect(app.requests).toHaveLength(0);
  });

  it('does not start a paid session after the browser closes during authorization', async () => {
    let release!: (allowed: boolean) => void;
    const pending = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const authorizeSession = vi.fn(() => pending);
    const app = await harness({ directSocket: true, authorizeSession });
    const browser = app.hostedClient();
    await vi.waitFor(() => expect(authorizeSession).toHaveBeenCalledTimes(1));
    const closed = once(browser.socket, 'close');
    browser.socket.close();
    await closed;
    release(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(app.requests).toHaveLength(0);
  });
});
