import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECART_MAX_IMAGE_BYTES,
  DecartApiError,
  createDecartSocket,
  decartErrorMessage,
  decartStatus,
  updateDecartReference,
  type DecartDuration,
} from '../src/lib/decart-api';

const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const png = () => new Blob([pngBytes], { type: 'image/png' });
const ticket = {
  id: 'local-session-1',
  ticket: 'one-use-short-lived-ticket',
  expiresIn: 15,
  maxDurationSeconds: 30,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fetcher = vi.fn<typeof fetch>();
class FakeSocket extends EventTarget {
  static instances: FakeSocket[] = [];
  readyState = 0;
  url: string;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  });
  constructor(url: string | URL) {
    super();
    this.url = String(url);
    FakeSocket.instances.push(this);
  }
}
beforeEach(() => {
  FakeSocket.instances = [];
  fetcher.mockReset().mockImplementation(async () => json(ticket, 201));
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('window', { location: new URL('http://127.0.0.1:5174/live') });
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('direct Decart status and error boundary', () => {
  it('reads actual configuration without account credentials or storing extra server fields', async () => {
    fetcher.mockResolvedValue(
      json({
        configured: false,
        model: 'lucy-vton-3.5',
        maxDurationSeconds: 60,
        ignored: 'not-exposed',
      }),
    );
    expect(await decartStatus()).toEqual({
      configured: false,
      model: 'lucy-vton-3.5',
      maxDurationSeconds: 60,
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('/__lookluxe/decart/status');
    expect(options?.method).toBe('GET');
    expect(options?.body).toBeUndefined();
    expect(options?.credentials).toBe('omit');
    expect(options?.redirect).toBe('error');
    expect(options?.cache).toBe('no-store');
    expect(new Headers(options?.headers).has('Authorization')).toBe(false);
  });

  it('rejects malformed status and hides raw provider diagnostics in errors', async () => {
    fetcher.mockResolvedValueOnce(
      json({ configured: 'yes', model: 'lucy-vton-3.5', maxDurationSeconds: 60 }),
    );
    await expect(decartStatus()).rejects.toMatchObject({ code: 'decart_invalid_response' });
    fetcher.mockResolvedValueOnce(
      json(
        {
          code: 'provider_unavailable',
          detail: 'sensitive provider diagnostic',
          api_key: 'must-not-echo',
        },
        503,
      ),
    );
    try {
      await decartStatus();
      throw new Error('Expected a failure');
    } catch (error) {
      expect(error).toBeInstanceOf(DecartApiError);
      expect(error).toMatchObject({ code: 'provider_unavailable', status: 503 });
      expect(decartErrorMessage(error)).toContain('temporarily unavailable');
      expect(decartErrorMessage(error)).not.toMatch(/sensitive|must-not-echo/);
    }
    expect(decartErrorMessage(new Error('unsafe detail'))).not.toContain('unsafe detail');
  });

  it('reports network failures and does not automatically retry reservations', async () => {
    fetcher.mockRejectedValue(new TypeError('Connection failed'));
    await expect(createDecartSocket(png(), 30)).rejects.toMatchObject({
      code: 'decart_network_error',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it('times out an unavailable bridge and clears the request timer', async () => {
    vi.useFakeTimers();
    fetcher.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
            once: true,
          });
        }),
    );
    const checking = expect(decartStatus()).rejects.toMatchObject({ code: 'decart_timeout' });
    await vi.advanceTimersByTimeAsync(20_000);
    await checking;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('consented image reservation and one-use socket ticket', () => {
  it('sends only bare base64, MIME and duration to the local bridge, then returns an opening socket', async () => {
    vi.stubGlobal('window', { location: new URL('https://pitch.example.test/live?ignore=1') });
    const result = await createDecartSocket(png(), 30);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('/__lookluxe/decart/sessions');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({
      image: btoa(String.fromCharCode(...pngBytes)),
      mimeType: 'image/png',
      durationSeconds: 30,
    });
    expect(options?.credentials).toBe('omit');
    expect(options?.redirect).toBe('error');
    expect(new Headers(options?.headers).has('Authorization')).toBe(false);
    expect(result.maxDurationSeconds).toBe(30);
    expect(result.socket.readyState).toBe(0);
    expect(result.socket.url).toBe(
      `wss://pitch.example.test/__lookluxe/decart/stream?ticket=${ticket.ticket}`,
    );
    expect(FakeSocket.instances[0].send).not.toHaveBeenCalled();
  });

  it.each([
    ['image/jpeg', new Uint8Array([255, 216, 255, 224])],
    ['image/png', pngBytes],
    ['image/webp', new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80])],
  ])('accepts a matching %s image signature', async (mimeType, bytes) => {
    await createDecartSocket(new Blob([bytes], { type: mimeType }), 30);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).mimeType).toBe(mimeType);
  });

  it('rejects empty, oversized, unsupported, or mislabeled image data before any network request', async () => {
    for (const image of [
      new Blob([], { type: 'image/png' }),
      new Blob([new Uint8Array(DECART_MAX_IMAGE_BYTES + 1)], { type: 'image/png' }),
      new Blob([pngBytes], { type: 'image/svg+xml' }),
      new Blob(['not an image'], { type: 'image/jpeg' }),
      new Blob([pngBytes], { type: 'image/webp' }),
    ])
      await expect(createDecartSocket(image, 30)).rejects.toMatchObject({
        code: 'decart_invalid_image',
      });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('refuses unsupported durations and insecure remote pages', async () => {
    await expect(createDecartSocket(png(), 120 as DecartDuration)).rejects.toMatchObject({
      code: 'decart_invalid_request',
    });
    vi.stubGlobal('window', { location: new URL('http://public.example.test/live') });
    await expect(createDecartSocket(png(), 30)).rejects.toMatchObject({
      code: 'decart_unavailable',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('will not open a stream for malformed, long-lived, or unexpectedly longer reservations', async () => {
    for (const response of [
      null,
      { ...ticket, ticket: 'https://untrusted.test/key' },
      { ...ticket, expiresIn: 60 },
      { ...ticket, maxDurationSeconds: 60 },
      { ...ticket, id: '' },
    ]) {
      fetcher.mockResolvedValueOnce(json(response, 201));
      await expect(createDecartSocket(png(), 30)).rejects.toMatchObject({
        code: 'decart_invalid_response',
      });
    }
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it('honors cancellation before upload and while reading the image', async () => {
    const aborted = new AbortController();
    aborted.abort();
    await expect(createDecartSocket(png(), 30, aborted.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    let finish!: (value: ArrayBuffer) => void;
    const image = png();
    vi.spyOn(image, 'arrayBuffer').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const opening = expect(createDecartSocket(image, 30, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();
    finish(pngBytes.buffer);
    await opening;
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not open a socket from a late ticket after cancellation', async () => {
    let finish!: (value: Response) => void;
    fetcher.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const opening = expect(createDecartSocket(png(), 30, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    controller.abort();
    finish(json(ticket, 201));
    await opening;
    expect(FakeSocket.instances).toHaveLength(0);
  });

  it('closes an owned socket on abort and removes the abort listener after close', async () => {
    const controller = new AbortController();
    await createDecartSocket(png(), 30, controller.signal);
    controller.abort();
    expect(FakeSocket.instances[0].close).toHaveBeenCalledTimes(1);
    const later = new AbortController();
    await createDecartSocket(png(), 30, later.signal);
    FakeSocket.instances[1].close();
    later.abort();
    expect(FakeSocket.instances[1].close).toHaveBeenCalledTimes(1);
  });
});

describe('in-session Decart garment reference changes', () => {
  it('sends validated image bytes and sequence over the existing owned socket without creating another session', async () => {
    const { socket } = await createDecartSocket(png(), 30);
    FakeSocket.instances[0].readyState = 1;
    await updateDecartReference(socket, png(), 4);
    expect(FakeSocket.instances[0].send).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        type: 'reference',
        image: btoa(String.fromCharCode(...pngBytes)),
        mimeType: 'image/png',
        seq: 4,
      }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects foreign sockets, invalid sequences, and invalid images without sending', async () => {
    const { socket } = await createDecartSocket(png(), 30);
    FakeSocket.instances[0].readyState = 1;
    const foreign = new FakeSocket('wss://unrelated.example.test/stream');
    foreign.readyState = 1;
    await expect(
      updateDecartReference(foreign as unknown as WebSocket, png(), 1),
    ).rejects.toMatchObject({ code: 'decart_connection_closed' });
    for (const seq of [0, -1, 0.5, 2_147_483_648])
      await expect(updateDecartReference(socket, png(), seq)).rejects.toMatchObject({
        code: 'decart_invalid_request',
      });
    await expect(
      updateDecartReference(socket, new Blob(['bad'], { type: 'image/png' }), 1),
    ).rejects.toMatchObject({ code: 'decart_invalid_image' });
    expect(foreign.send).not.toHaveBeenCalled();
    expect(FakeSocket.instances[0].send).not.toHaveBeenCalled();
  });

  it('does not send a late reference after socket closure', async () => {
    const { socket } = await createDecartSocket(png(), 30);
    FakeSocket.instances[0].readyState = 1;
    let finish!: (value: ArrayBuffer) => void;
    const image = png();
    vi.spyOn(image, 'arrayBuffer').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const updating = expect(updateDecartReference(socket, image, 1)).rejects.toMatchObject({
      code: 'decart_connection_closed',
    });
    FakeSocket.instances[0].close();
    finish(pngBytes.buffer);
    await updating;
    expect(FakeSocket.instances[0].send).not.toHaveBeenCalled();
  });

  it('does not send a reference after its image read is cancelled', async () => {
    const { socket } = await createDecartSocket(png(), 30);
    FakeSocket.instances[0].readyState = 1;
    let finish!: (value: ArrayBuffer) => void;
    const image = png();
    vi.spyOn(image, 'arrayBuffer').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const updating = expect(
      updateDecartReference(socket, image, 1, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    finish(pngBytes.buffer);
    await updating;
    expect(FakeSocket.instances[0].send).not.toHaveBeenCalled();
  });
});
