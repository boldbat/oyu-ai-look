import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LookLuxeApi,
  isSupportedLiveConsent,
  isValidFittingRoomSelection,
  type FittingRoomConsent,
  type FittingRoomSelection,
  type LiveTryOnConsent,
  type LiveTryOnReadiness,
} from '../src/lib/api';

const sessionId = '11111111-1111-4111-8111-111111111111';
const lookId = '22222222-2222-4222-8222-222222222222';
const top = { source: 'wardrobe' as const, item_id: '33333333-3333-4333-8333-333333333333' };
const shoes = { source: 'catalog' as const, item_id: '44444444-4444-4444-8444-444444444444' };
const streamTicket = 'local-one-use-ticket-1234567890';
const session = (suffix = 'one', expiresIn = 3600) => ({
  access_token: `access-${suffix}`,
  refresh_token: `refresh-${suffix}`,
  token_type: 'bearer',
  expires_in: expiresIn,
  user: { id: 'user-1', email: 'style@example.test' },
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const bodyOf = (options?: RequestInit) => JSON.parse(String(options?.body));
const headersOf = (options?: RequestInit) => new Headers(options?.headers);
const consent: FittingRoomConsent = {
  policy_version: 'live-try-on.decart.v3',
  granted: true,
  locale: 'en',
};
const savedConsent: LiveTryOnConsent = {
  policy_version: 'live-try-on.decart.v2',
  granted: true,
  locale: 'en',
  continuous: true,
};
const fittingSession = (selection: FittingRoomSelection = { top }) => ({
  id: sessionId,
  saved_look_id: null,
  max_duration_seconds: 30,
  connect_before: '2099-01-01T00:00:20Z',
  continuous: true,
  lease_seconds: 3500,
  selection,
});
const savedSession = { ...fittingSession(), saved_look_id: lookId };
const readiness: LiveTryOnReadiness = {
  saved_look_id: lookId,
  enabled: false,
  ready: false,
  blockers: ['live_tryon_disabled'],
  max_duration_seconds: 30,
  consent_policy_version: 'live-try-on.decart.v2',
  processor: 'decart',
  continuous: true,
  entitled: false,
  allowance_kind: null,
  allowance_seconds_remaining: 0,
  session_max_seconds: 3500,
};

class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = [];
  url: string;
  close = vi.fn((_code?: number, _reason?: string) => this.dispatchEvent(new Event('close')));
  send = vi.fn();
  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }
}
function browser(origin = 'http://127.0.0.1:5174') {
  FakeWebSocket.instances = [];
  vi.stubGlobal('window', { location: new URL(`${origin}/studio`) });
  vi.stubGlobal('WebSocket', FakeWebSocket);
}
afterEach(() => vi.unstubAllGlobals());

describe('original saved-look Live contracts', () => {
  it('preserves blocked readiness and checks disclosure against processor and duration', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        json(String(url).endsWith('/login') ? session() : readiness),
      );
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('style@example.test', 'password');
    expect(await api.liveReadiness(lookId)).toEqual(readiness);
    expect(fetcher.mock.calls[1][0]).toBe(
      `https://api.example.test/v1/saved-looks/${lookId}/live-preview/readiness`,
    );
    expect(isSupportedLiveConsent(readiness)).toBe(true);
    expect(isSupportedLiveConsent({ ...readiness, processor: 'fal' })).toBe(false);
    expect(isSupportedLiveConsent({ ...readiness, continuous: false })).toBe(false);
  });

  it('reserves with the exact consent and stable operation key, then stops without a key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
      if (options?.method === 'DELETE') return new Response(null, { status: 204 });
      return json(String(url).endsWith('/login') ? session() : savedSession, 200);
    });
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('style@example.test', 'password');
    expect(
      await api.createLiveSession(lookId, savedConsent, { idempotencyKey: 'live:intent-1' }),
    ).toEqual(savedSession);
    const reserve = fetcher.mock.calls[1];
    expect(reserve[0]).toBe(
      `https://api.example.test/v1/saved-looks/${lookId}/live-preview-sessions`,
    );
    expect(bodyOf(reserve[1])).toEqual(savedConsent);
    expect(headersOf(reserve[1]).get('Idempotency-Key')).toBe('live:intent-1');
    await api.stopLiveSession(sessionId);
    const stop = fetcher.mock.calls[2];
    expect(stop[0]).toBe(`https://api.example.test/v1/live-preview-sessions/${sessionId}`);
    expect(stop[1]?.method).toBe('DELETE');
    expect(stop[1]?.body).toBeUndefined();
    expect(headersOf(stop[1]).has('Idempotency-Key')).toBe(false);
    expect(headersOf(stop[1]).get('Authorization')).toBe('Bearer access-one');
  });

  it('rejects missing or mismatched grants before reserving a metered session', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    for (const invalid of [
      { ...savedConsent, granted: false },
      { ...savedConsent, policy_version: 'live-try-on.decart.v3' },
      { ...savedConsent, continuous: false },
    ])
      await expect(
        api.createLiveSession(lookId, invalid as LiveTryOnConsent, { idempotencyKey: 'intent' }),
      ).rejects.toMatchObject({ code: 'live_tryon_consent_changed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not accept a reservation bound to another saved look', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        json(
          String(url).endsWith('/login')
            ? session()
            : { ...savedSession, saved_look_id: 'other-look' },
        ),
      );
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('style@example.test', 'password');
    await expect(
      api.createLiveSession(lookId, savedConsent, { idempotencyKey: 'intent' }),
    ).rejects.toMatchObject({ code: 'live_invalid_response' });
  });
});

describe('Fitting Room v3 contracts', () => {
  it('reads readiness and ranks a partial selection using the shoes lane on the same-origin proxy', async () => {
    const result = { items: [], next_cursor: null };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        json(
          String(url).endsWith('/login')
            ? session()
            : String(url).endsWith('/readiness')
              ? { ...readiness, consent_policy_version: consent.policy_version }
              : result,
        ),
      );
    const api = new LookLuxeApi('/__lookluxe/api/', fetcher);
    expect(api.configured).toBe(true);
    await api.login('style@example.test', 'password');
    await api.fittingRoomReadiness();
    expect(
      await api.fittingRoomCandidates({
        slot: 'shoes',
        selection: { top, bottom: null },
        cursor: 'next-page',
        limit: 12,
      }),
    ).toEqual(result);
    expect(fetcher.mock.calls[1][0]).toBe('/__lookluxe/api/v1/fitting-room/readiness');
    const ranked = fetcher.mock.calls[2];
    expect(ranked[0]).toBe('/__lookluxe/api/v1/fitting-room/candidates');
    expect(ranked[1]?.method).toBe('POST');
    expect(bodyOf(ranked[1])).toEqual({
      slot: 'shoes',
      selection: { top, bottom: null },
      cursor: 'next-page',
      limit: 12,
    });
    expect(headersOf(ranked[1]).has('Idempotency-Key')).toBe(false);
  });

  it('starts one partial selection with nested v3 consent and retains the operation key on auth replay', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
      if (String(url).endsWith('/login')) return json(session());
      if (String(url).endsWith('/refresh')) return json(session('two'));
      if (headersOf(options).get('Authorization') === 'Bearer access-one')
        return json({ code: 'unauthenticated' }, 401);
      return json(fittingSession({ top, shoes, bottom: null, dress: null }), 201);
    });
    const api = new LookLuxeApi('/__lookluxe/api', fetcher);
    await api.login('style@example.test', 'password');
    const result = await api.createFittingRoomSession(
      { top, shoes },
      { ...consent, locale: null },
      { idempotencyKey: 'fitting:intent-1' },
    );
    expect(result.selection.top).toEqual(top);
    const writes = fetcher.mock.calls.filter(([url]) =>
      String(url).endsWith('/fitting-room/sessions'),
    );
    expect(writes).toHaveLength(2);
    for (const [, options] of writes) {
      expect(bodyOf(options)).toEqual({
        selection: { top, shoes },
        consent: { policy_version: consent.policy_version, granted: true },
      });
      expect(headersOf(options).get('Idempotency-Key')).toBe('fitting:intent-1');
    }
    expect(writes[0][1]?.body).toBe(writes[1][1]?.body);
  });

  it('allows a top, bottom, or dress alone and refuses shoes-only, duplicate, or dress+separates', async () => {
    for (const valid of [{ top }, { bottom: top }, { dress: top }, { top, shoes }])
      expect(isValidFittingRoomSelection(valid)).toBe(true);
    const invalid: FittingRoomSelection[] = [
      {},
      { shoes },
      { top, dress: shoes },
      { top, bottom: top },
    ];
    const fetcher = vi.fn<typeof fetch>();
    const api = new LookLuxeApi('/__lookluxe/api', fetcher);
    for (const selection of invalid) {
      expect(isValidFittingRoomSelection(selection)).toBe(false);
      await expect(
        api.createFittingRoomSession(selection, consent, { idempotencyKey: 'intent' }),
      ).rejects.toMatchObject({ code: 'selection_invalid' });
    }
    await expect(
      api.createFittingRoomSession(
        { top },
        { ...consent, granted: false } as unknown as FittingRoomConsent,
        { idempotencyKey: 'intent' },
      ),
    ).rejects.toMatchObject({ code: 'live_tryon_consent_changed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a different bound selection or an invalid lease returned by the service', async () => {
    const responses = [
      fittingSession({ top: shoes }),
      { ...fittingSession(), lease_seconds: 3501 },
      null,
    ];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        json(String(url).endsWith('/login') ? session() : responses.shift()),
      );
    const api = new LookLuxeApi('/__lookluxe/api', fetcher);
    await api.login('style@example.test', 'password');
    for (let index = 0; index < 3; index++)
      await expect(
        api.createFittingRoomSession({ top }, consent, { idempotencyKey: `intent-${index}` }),
      ).rejects.toMatchObject({ code: 'live_invalid_response' });
  });

  it('retrieves private image bytes using bearer auth without following redirects or accepting HTML', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith('/login')) return json(session());
      return new Response('private-image', {
        headers: { 'Content-Type': String(url).includes('/catalog/') ? 'text/html' : 'image/png' },
      });
    });
    const api = new LookLuxeApi('/__lookluxe/api', fetcher);
    await api.login('style@example.test', 'password');
    const blob = await api.fittingRoomItemImage('wardrobe', top.item_id);
    expect(await blob.text()).toBe('private-image');
    const read = fetcher.mock.calls[1];
    expect(read[0]).toBe(`/__lookluxe/api/v1/outfit-items/wardrobe/${top.item_id}/image`);
    expect(headersOf(read[1]).get('Authorization')).toBe('Bearer access-one');
    expect(read[1]?.credentials).toBe('omit');
    expect(read[1]?.redirect).toBe('error');
    await expect(api.fittingRoomItemImage('catalog', shoes.item_id)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});

describe('browser one-use stream ticket isolation', () => {
  it('refreshes before ticket exchange and opens only a same-origin socket with no bearer payload', async () => {
    browser('https://web.example.test');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        json(
          String(url).endsWith('/login')
            ? session()
            : String(url).endsWith('/refresh')
              ? session('two')
              : { ticket: streamTicket, expires_in: 15 },
          200,
        ),
      );
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('style@example.test', 'password');
    const socket = await api.createLiveSocket(sessionId);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/v1/auth/login',
      'https://api.example.test/v1/auth/refresh',
      '/__lookluxe/live-ticket',
    ]);
    const ticketRequest = fetcher.mock.calls[2];
    expect(bodyOf(ticketRequest[1])).toEqual({ session_id: sessionId });
    expect(headersOf(ticketRequest[1]).get('Authorization')).toBe('Bearer access-two');
    expect(headersOf(ticketRequest[1]).has('Idempotency-Key')).toBe(false);
    expect(ticketRequest[1]?.credentials).toBe('omit');
    expect(socket.url).toBe(`wss://web.example.test/__lookluxe/live-stream?ticket=${streamTicket}`);
    expect(FakeWebSocket.instances[0].send).not.toHaveBeenCalled();
    expect(socket.url).not.toMatch(/access-|refresh-|api\.example/);
  });

  it('retries one rejected ticket with a rotated token, then closes the socket on sign-out', async () => {
    browser();
    let refreshes = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
      if (String(url).endsWith('/login')) return json(session());
      if (String(url).endsWith('/refresh')) return json(session(`fresh-${++refreshes}`));
      if (String(url).endsWith('/logout')) return new Response(null, { status: 204 });
      if (headersOf(options).get('Authorization') === 'Bearer access-fresh-1')
        return json({ code: 'unauthenticated' }, 401);
      return json({ ticket: streamTicket, expires_in: 15 }, 201);
    });
    const api = new LookLuxeApi('/__lookluxe/api', fetcher);
    await api.login('style@example.test', 'password');
    await api.createLiveSocket(sessionId);
    const exchanges = fetcher.mock.calls.filter(([url]) => url === '/__lookluxe/live-ticket');
    expect(exchanges).toHaveLength(2);
    expect(headersOf(exchanges[1][1]).get('Authorization')).toBe('Bearer access-fresh-2');
    expect(FakeWebSocket.instances).toHaveLength(1);
    await api.logout();
    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed/long-lived tickets and insecure pages without constructing a socket', async () => {
    browser();
    const tickets = [
      { ticket: streamTicket, expires_in: 16 },
      { ticket: 'https://evil.test/access', expires_in: 15 },
      null,
    ];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        json(
          String(url).endsWith('/login') || String(url).endsWith('/refresh')
            ? session()
            : tickets.shift(),
        ),
      );
    const api = new LookLuxeApi('/__lookluxe/api', fetcher);
    await api.login('style@example.test', 'password');
    for (let index = 0; index < 3; index++)
      await expect(api.createLiveSocket(sessionId)).rejects.toMatchObject({
        code: 'live_invalid_response',
      });
    expect(FakeWebSocket.instances).toHaveLength(0);
    browser('http://remote.example.test');
    await expect(api.createLiveSocket(sessionId)).rejects.toMatchObject({
      code: 'live_bridge_unavailable',
    });
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('cannot open a socket from a ticket that arrives after sign-out', async () => {
    browser();
    let finishTicket!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).endsWith('/login') || String(url).endsWith('/refresh'))
        return json(session());
      if (String(url).endsWith('/logout')) return new Response(null, { status: 204 });
      return new Promise<Response>((resolve) => {
        finishTicket = resolve;
      });
    });
    const api = new LookLuxeApi('/__lookluxe/api', fetcher);
    await api.login('style@example.test', 'password');
    const opening = api.createLiveSocket(sessionId);
    const rejection = expect(opening).rejects.toMatchObject({ code: 'unauthenticated' });
    await vi.waitFor(() => expect(finishTicket).toBeTypeOf('function'));
    await api.logout();
    finishTicket(json({ ticket: streamTicket, expires_in: 15 }));
    await rejection;
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('ends the opened socket when the owning operation is cancelled', async () => {
    browser();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        json(
          String(url).endsWith('/login') || String(url).endsWith('/refresh')
            ? session()
            : { ticket: streamTicket, expires_in: 15 },
        ),
      );
    const api = new LookLuxeApi('/__lookluxe/api', fetcher);
    await api.login('style@example.test', 'password');
    const controller = new AbortController();
    await api.createLiveSocket(sessionId, controller.signal);
    controller.abort();
    expect(FakeWebSocket.instances[0].close).toHaveBeenCalledTimes(1);
  });
});
