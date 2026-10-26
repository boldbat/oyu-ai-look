import { describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  LookLuxeApi,
  apiErrorMessage,
  garmentConfirmation,
  newOperationKey,
} from '../src/lib/api';
import type { ApiGarment } from '../src/lib/api';

const session = (suffix = 'one', expiresIn = 600) => ({
  access_token: `access-${suffix}`,
  refresh_token: `refresh-${suffix}`,
  token_type: 'bearer',
  expires_in: expiresIn,
  user: { id: 'user-1', email: 'style@example.test' },
});
const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
const unauthorized = () => json({ code: 'unauthenticated' }, 401);
const challenge = { challenge_id: 'challenge-1', expires_in: 600, resend_after: 60 };
const consent = { granted: true, status: 'granted', policy_version: 'ai-processing.v1' };
const ticket = {
  media_id: 'media-1',
  mime_type: 'image/jpeg',
  byte_size: 5,
  bucket: 'private-media',
  object_path: 'user-1/photo.jpg',
  signed_upload_url:
    'https://storage.example.test/storage/v1/object/upload/sign/private-media/user-1/photo.jpg?token=upload-only',
  upload_token: 'upload-only',
  expires_at: '2099-01-01T00:00:00Z',
};
const requestBody = (options: RequestInit | undefined) => JSON.parse(String(options?.body));
const headersOf = (options: RequestInit | undefined) => new Headers(options?.headers);
const extractedGarment: ApiGarment = {
  id: 'garment-1',
  media_id: 'media-1',
  name: 'Wool blazer',
  category: 'outerwear',
  status: 'pending_confirmation',
  primary_color: 'navy',
  availability: 'available',
  is_clean: true,
  user_confirmed: false,
  needs_review: false,
  created_at: '2026-10-15T12:00:00Z',
  subcategory: 'blazer',
  layer_position: 'outer',
  secondary_colors: ['brown'],
  pattern: 'herringbone',
  material: 'wool',
  seasons: ['autumn', 'winter'],
  warmth_level: 4,
  min_temp_c: -5,
  max_temp_c: 15,
  formality: 4,
  occasions: ['work', 'dinner'],
  style_tags: ['classic'],
  brand: 'Test label',
  description: 'Two-button tailored blazer',
  ai_confidence: 0.91,
  corrected_fields: [],
};

describe('existing backend authentication contract', () => {
  it('stays disconnected without explicit configuration and rejects insecure remote origins', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = new LookLuxeApi('', fetcher);
    expect(api.configured).toBe(false);
    await expect(api.login('me@example.test', 'password')).rejects.toMatchObject({
      code: 'not_configured',
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(new LookLuxeApi('http://remote.example.test').configured).toBe(false);
    expect(new LookLuxeApi('https://user:secret@example.test').configured).toBe(false);
    expect(new LookLuxeApi('http://127.0.0.1:8000').configured).toBe(true);
  });

  it('uses exact register, verify, recovery and resend contracts, preserving passwords', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const path = String(input);
      return json(
        path.endsWith('/verify')
          ? session()
          : path.endsWith('/reset')
            ? { status: 'ok' }
            : challenge,
        path.endsWith('/register') || path.endsWith('/forgot') || path.endsWith('/resend')
          ? 202
          : 200,
      );
    });
    const api = new LookLuxeApi('https://api.example.test/', fetcher);
    await api.register(' style@example.test ', '  keep spaces  ', 'mn', ' Ada ');
    await api.resend(challenge.challenge_id);
    await api.verify(challenge.challenge_id, '01234567');
    await api.forgotPassword(' style@example.test ', 'en');
    await api.resetPassword(challenge.challenge_id, '12345678', ' new password ');
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.example.test/v1/auth/register',
      'https://api.example.test/v1/auth/email/resend',
      'https://api.example.test/v1/auth/email/verify',
      'https://api.example.test/v1/auth/password/forgot',
      'https://api.example.test/v1/auth/password/reset',
    ]);
    expect(requestBody(fetcher.mock.calls[0][1])).toEqual({
      email: 'style@example.test',
      password: '  keep spaces  ',
      locale: 'mn',
      display_name: 'Ada',
    });
    expect(requestBody(fetcher.mock.calls[2][1])).toEqual({
      challenge_id: 'challenge-1',
      code: '01234567',
    });
    expect(requestBody(fetcher.mock.calls[4][1])).toEqual({
      challenge_id: 'challenge-1',
      code: '12345678',
      new_password: ' new password ',
    });
    for (const [, options] of fetcher.mock.calls) {
      expect(options?.method).toBe('POST');
      expect(options?.cache).toBe('no-store');
      expect(options?.credentials).toBe('omit');
      expect(headersOf(options).has('Idempotency-Key')).toBe(false);
      expect(headersOf(options).has('Authorization')).toBe(false);
    }
    expect(api.currentUser?.email).toBe('style@example.test');
  });

  it('never refreshes or retries a failed login and keeps error codes distinct', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ code: 'invalid_credentials' }, 401));
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await expect(api.login('x@example.test', 'wrong')).rejects.toMatchObject({
      code: 'invalid_credentials',
      status: 401,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(api.currentUser).toBeNull();
    expect(apiErrorMessage(new ApiError('signup_disabled', '', 503))).toContain('Шинэ бүртгэл');
    expect(apiErrorMessage(new ApiError('provider_unavailable', '', 503))).toContain(
      'түр ажиллахгүй',
    );
  });

  it('honors Retry-After in rate-limit feedback', async () => {
    const api = new LookLuxeApi(
      'https://api.example.test',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ code: 'rate_limited' }, 429, { 'Retry-After': '71' })),
    );
    let error: unknown;
    try {
      await api.forgotPassword('x@example.test', 'en');
    } catch (cause) {
      error = cause;
    }
    expect(error).toMatchObject({ code: 'rate_limited', retryAfter: 71 });
    expect(apiErrorMessage(error)).toContain('71 секундын дараа');
  });
});

describe('memory session and serialized token rotation', () => {
  it('serializes parallel refreshes and replays reads with the new access token', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, options) => {
      const url = String(input);
      if (url.endsWith('/login')) return json(session());
      if (url.endsWith('/refresh')) {
        await Promise.resolve();
        return json(session('two'));
      }
      if (headersOf(options).get('Authorization') === 'Bearer access-one') return unauthorized();
      return json({ ok: true });
    });
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('x@example.test', 'password');
    await Promise.all([api.profile(), api.entitlement(), api.homeSummary()]);
    const refreshes = fetcher.mock.calls.filter(([url]) => String(url).endsWith('/refresh'));
    expect(refreshes).toHaveLength(1);
    expect(requestBody(refreshes[0][1])).toEqual({ refresh_token: 'refresh-one' });
    expect(headersOf(refreshes[0][1]).has('Authorization')).toBe(false);
    expect(headersOf(refreshes[0][1]).has('Idempotency-Key')).toBe(false);
    expect(
      fetcher.mock.calls.filter(
        ([, options]) => headersOf(options).get('Authorization') === 'Bearer access-two',
      ),
    ).toHaveLength(3);
  });

  it('preserves the original idempotency key and body when replaying an authenticated mutation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, options) => {
      if (String(input).endsWith('/login')) return json(session());
      if (String(input).endsWith('/refresh')) return json(session('two'));
      return headersOf(options).get('Authorization') === 'Bearer access-one'
        ? unauthorized()
        : json({ added_count: 1 });
    });
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('x@example.test', 'password');
    await api.recordWear('2026-10-15', ['garment-1'], { idempotencyKey: 'wear:stable-operation' });
    const writes = fetcher.mock.calls.filter(([url]) => String(url).endsWith('/wear-history'));
    expect(writes).toHaveLength(2);
    expect(writes.map(([, options]) => headersOf(options).get('Idempotency-Key'))).toEqual([
      'wear:stable-operation',
      'wear:stable-operation',
    ]);
    expect(writes[0][1]?.body).toBe(writes[1][1]?.body);
  });

  it('clears rejected sessions and does not put credentials in another client instance', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input).endsWith('/login') ? json(session('one', 0)) : unauthorized(),
      );
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('x@example.test', 'password');
    expect(new LookLuxeApi('https://api.example.test').currentUser).toBeNull();
    await expect(api.profile()).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(api.currentUser).toBeNull();
  });

  it('does not restore a session when an in-flight refresh finishes after sign-out', async () => {
    let finishRefresh!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).endsWith('/login')) return json(session('one', 0));
      if (String(input).endsWith('/refresh'))
        return new Promise<Response>((resolve) => {
          finishRefresh = resolve;
        });
      if (String(input).endsWith('/logout')) return new Response(null, { status: 204 });
      return json({});
    });
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('x@example.test', 'password');
    const pending = api.profile();
    const rejected = expect(pending).rejects.toMatchObject({ code: 'unauthenticated' });
    await api.logout();
    finishRefresh(json(session('two')));
    await rejected;
    expect(api.currentUser).toBeNull();
  });

  it('signs out locally even if server revocation is unreachable', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).endsWith('/login')) return json(session());
      throw new TypeError('Failed to fetch');
    });
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('x@example.test', 'password');
    await expect(api.logout()).rejects.toMatchObject({ code: 'network_error' });
    expect(api.currentUser).toBeNull();
  });
});

describe('consent-gated private media and real job processing', () => {
  it('checks recorded consent before reserving or uploading a photo', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) =>
        String(input).endsWith('/login')
          ? json(session())
          : json({ ...consent, granted: false, status: 'revoked' }),
      );
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('x@example.test', 'password');
    const operation = api.createImageOperation(
      new Blob(['image'], { type: 'image/jpeg' }),
      'score',
    );
    await expect(api.submitImage(operation)).rejects.toMatchObject({
      code: 'ai_processing_consent_missing',
    });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.example.test/v1/auth/login',
      'https://api.example.test/v1/consents/ai-processing',
    ]);
  });

  it('uploads to the signed URL without account bearer tokens and reuses keys after a lost create response', async () => {
    let creates = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/login')) return json(session());
      if (url.endsWith('/consents/ai-processing')) return json(consent);
      if (url.endsWith('/garment-uploads')) return json(ticket, 201);
      if (url.startsWith('https://storage.example.test/')) return json({});
      if (url.endsWith('/outfit-scores')) {
        if (++creates === 1) throw new TypeError('Lost response');
        return json(
          { score: { id: 'score-1', status: 'analyzing' }, job: { id: 'job-1', status: 'queued' } },
          202,
        );
      }
      throw new Error(`Unexpected test route ${url}`);
    });
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('x@example.test', 'password');
    const operation = api.createImageOperation(
      new Blob(['image'], { type: 'image/jpeg' }),
      'score',
      'mn',
    );
    await expect(api.submitImage(operation)).rejects.toMatchObject({ code: 'network_error' });
    await api.submitImage(operation);
    const upload = fetcher.mock.calls.filter(([url]) =>
      String(url).startsWith('https://storage.example.test/'),
    );
    expect(upload).toHaveLength(1);
    expect(upload[0][1]?.method).toBe('PUT');
    expect(upload[0][1]?.credentials).toBe('omit');
    expect(upload[0][1]?.redirect).toBe('error');
    expect(headersOf(upload[0][1]).has('Authorization')).toBe(false);
    expect(headersOf(upload[0][1]).has('Idempotency-Key')).toBe(false);
    const createCalls = fetcher.mock.calls.filter(([url]) =>
      String(url).endsWith('/outfit-scores'),
    );
    expect(createCalls).toHaveLength(2);
    expect(requestBody(createCalls[0][1])).toEqual({ media_id: 'media-1', locale: 'mn' });
    expect(createCalls.map(([, options]) => headersOf(options).get('Idempotency-Key'))).toEqual([
      operation.createKey,
      operation.createKey,
    ]);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).endsWith('/garment-uploads')),
    ).toHaveLength(1);
  });

  it('validates image types and refuses an operation belonging to a different account', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(session()));
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('x@example.test', 'password');
    expect(() =>
      api.createImageOperation(new Blob(['svg'], { type: 'image/svg+xml' }), 'score'),
    ).toThrow('JPEG');
    const operation = api.createImageOperation(
      new Blob(['image'], { type: 'image/png' }),
      'garment',
    );
    await expect(
      api.submitImage({ ...operation, ownerId: 'another-account' }),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('polls to terminal state, and reports pending honestly when the bounded wait ends', async () => {
    let polls = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      if (String(input).endsWith('/login')) return json(session());
      return json({ id: 'job-1', status: ++polls >= 2 ? 'succeeded' : 'running' });
    });
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('x@example.test', 'password');
    expect((await api.pollJob('job-1', { attempts: 1 })).status).toBe('running');
    expect((await api.pollJob('job-1', { attempts: 5, intervalMs: 0 })).status).toBe('succeeded');
    expect(polls).toBe(2);
    expect(newOperationKey()).toMatch(/^web:[\da-f-]+$/);
  });
});

describe('connected wardrobe ingestion and review', () => {
  it('preserves every extracted attribute outside explicit review edits', () => {
    const attributes = garmentConfirmation(extractedGarment, {
      name: 'My favorite blazer',
      primary_color: 'charcoal',
      warmth_level: 3,
    });
    expect(attributes).toEqual({
      category: 'outerwear',
      subcategory: 'blazer',
      layer_position: 'outer',
      primary_color: 'charcoal',
      secondary_colors: ['brown'],
      pattern: 'herringbone',
      material: 'wool',
      seasons: ['autumn', 'winter'],
      warmth_level: 3,
      min_temp_c: -5,
      max_temp_c: 15,
      formality: 4,
      occasions: ['work', 'dinner'],
      style_tags: ['classic'],
      brand: 'Test label',
      name: 'My favorite blazer',
      description: 'Two-button tailored blazer',
      schema_version: 'v1',
    });
    expect(attributes.seasons).not.toBe(extractedGarment.seasons);
    expect(attributes).not.toHaveProperty('id');
    expect(attributes).not.toHaveProperty('status');
    expect(attributes).not.toHaveProperty('ai_confidence');
    expect(extractedGarment.name).toBe('Wool blazer');
  });

  it('requires an explicit category when extraction did not recognize it', () => {
    expect(() => garmentConfirmation({ ...extractedGarment, category: null })).toThrow(
      'ангилал сонгоно уу',
    );
    expect(
      garmentConfirmation({ ...extractedGarment, category: null }, { category: 'dress' }).category,
    ).toBe('dress');
    const missing = garmentConfirmation({ ...extractedGarment, pattern: null, seasons: [] });
    expect(missing.pattern).toBe('solid');
    expect(missing.seasons).toEqual(['spring', 'summer', 'autumn', 'winter']);
  });

  it('uses the exact confirmation, availability, retry and archive contracts with operation keys', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, options) => {
      if (String(input).endsWith('/login')) return json(session());
      if (options?.method === 'DELETE') return new Response(null, { status: 204 });
      if (String(input).endsWith('/retry'))
        return json({
          garment: { ...extractedGarment, status: 'processing' },
          job: { id: 'job-retry', status: 'queued' },
        });
      return json({ ...extractedGarment, status: 'active', user_confirmed: true });
    });
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('x@example.test', 'password');
    const attributes = garmentConfirmation(extractedGarment, { name: 'Reviewed blazer' });
    await api.confirmGarment('garment-1', attributes, { idempotencyKey: 'confirm:one' });
    await api.setGarmentAvailability('garment-1', 'laundry', { idempotencyKey: 'laundry:one' });
    await api.retryGarment('failed-garment', { idempotencyKey: 'retry:one' });
    await api.archiveGarment('garment-1', { idempotencyKey: 'archive:one' });
    const mutations = fetcher.mock.calls.slice(1);
    expect(mutations.map(([url]) => String(url))).toEqual([
      'https://api.example.test/v1/garments/garment-1/confirmation',
      'https://api.example.test/v1/garments/garment-1/availability',
      'https://api.example.test/v1/garments/failed-garment/retry',
      'https://api.example.test/v1/garments/garment-1',
    ]);
    expect(mutations.map(([, options]) => options?.method)).toEqual([
      'PATCH',
      'PATCH',
      'POST',
      'DELETE',
    ]);
    expect(mutations.map(([, options]) => headersOf(options).get('Idempotency-Key'))).toEqual([
      'confirm:one',
      'laundry:one',
      'retry:one',
      'archive:one',
    ]);
    expect(requestBody(mutations[0][1])).toEqual(attributes);
    expect(requestBody(mutations[1][1])).toEqual({ availability: 'laundry' });
    expect(mutations[3][1]?.body).toBeUndefined();
  });

  it('creates a real garment from its private upload and reads the pending review state', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, options) => {
      const url = String(input);
      if (url.endsWith('/login')) return json(session());
      if (url.endsWith('/consents/ai-processing')) return json(consent);
      if (url.endsWith('/garment-uploads')) return json(ticket, 201);
      if (url.startsWith('https://storage.example.test/')) return json({});
      if (url.endsWith('/garments') && options?.method === 'POST')
        return json(
          {
            garment: { ...extractedGarment, status: 'processing' },
            job: { id: 'job-garment', status: 'queued' },
          },
          202,
        );
      if (url.endsWith('/ai-jobs/job-garment'))
        return json({ id: 'job-garment', status: 'succeeded' });
      if (url.endsWith('/garments/garment-1')) return json(extractedGarment);
      throw new Error(`Unexpected test route ${url}`);
    });
    const api = new LookLuxeApi('https://api.example.test', fetcher);
    await api.login('x@example.test', 'password');
    const operation = api.createImageOperation(
      new Blob(['image'], { type: 'image/jpeg' }),
      'garment',
      'mn',
    );
    const created = await api.submitImage(operation);
    expect(created?.garment?.status).toBe('processing');
    expect((await api.pollJob('job-garment')).status).toBe('succeeded');
    expect((await api.garment('garment-1')).status).toBe('pending_confirmation');
    const creation = fetcher.mock.calls.find(([url]) => String(url).endsWith('/garments'));
    expect(requestBody(creation?.[1])).toEqual({ media_id: 'media-1' });
    const upload = fetcher.mock.calls.find(([url]) =>
      String(url).startsWith('https://storage.example.test/'),
    );
    expect(headersOf(upload?.[1]).has('Authorization')).toBe(false);
  });
});
