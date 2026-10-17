#!/usr/bin/env node
/**
 * LOCAL BROWSER-QA FIXTURE ONLY. Not an application backend.
 *
 * Run: node tests/fixtures/mock-api.mjs
 * Point a separate Vite preview at VITE_API_BASE_URL=http://127.0.0.1:8789.
 * Login: fixture@lookluxe.test / FixturePass123!
 * Every email verification / recovery code: 12345678
 * Test image: http://127.0.0.1:8789/fixtures/garment.png
 *
 * Binds exclusively to loopback, performs no upstream requests, and stores all
 * state in memory. Restarting resets the fixture. Upload bytes are discarded;
 * every image/result is synthetic and explicitly labeled as fixture data.
 * Fitting Room reads are synthetic UI fixtures. Starting a live session always
 * returns 503 live_tryon_disabled; no camera, WebRTC, or AI provider is connected.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const HOST = '127.0.0.1';
const PORT = 8789;
const ORIGIN = `http://${HOST}:${PORT}`;
const MAX_BYTES = 15 * 1024 * 1024;
const userId = '11111111-1111-4111-8111-111111111111';
const user = { id: userId, email: 'fixture@lookluxe.test' };
let password = 'FixturePass123!';
let displayName = 'Fixture · Morgan';
let granted = false;
let consentRecorded = false;
const sessions = new Map();
const refreshTokens = new Map();
const challenges = new Map();
const uploads = new Map();
const jobs = new Map();
const idempotency = new Map();
const wearDays = new Map();
const savedLooks = [];
let garmentNumber = 0;
const now = () => new Date().toISOString();
const day = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

// A synthetic PNG test asset, drawn only with Node built-ins. No real photo.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
function inPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i],
      [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function fixturePng() {
  const width = 256,
    height = 320;
  const raw = Buffer.alloc(height * (width * 3 + 1));
  const silhouette = [
    [90, 63],
    [108, 55],
    [148, 55],
    [166, 63],
    [208, 91],
    [193, 141],
    [170, 129],
    [173, 263],
    [83, 263],
    [86, 129],
    [63, 141],
    [48, 91],
  ];
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      let rgb = [242, 238, 230];
      if (inPolygon(x, y, silhouette)) rgb = [118, 130, 145];
      if (
        inPolygon(x, y, [
          [107, 55],
          [128, 77],
          [112, 100],
          [92, 63],
        ])
      )
        rgb = [163, 173, 184];
      if (
        inPolygon(x, y, [
          [149, 55],
          [128, 77],
          [144, 100],
          [164, 63],
        ])
      )
        rgb = [163, 173, 184];
      if (Math.abs(x - 128) < 1 && y > 80 && y < 263) rgb = [101, 113, 128];
      if ([112, 144, 176, 208, 240].some((cy) => (x - 128) ** 2 + (y - cy) ** 2 < 7))
        rgb = [54, 64, 79];
      if (x > 93 && x < 116 && y > 117 && y < 141) rgb = [108, 120, 136];
      const offset = row + 1 + x * 3;
      raw[offset] = rgb[0];
      raw[offset + 1] = rgb[1];
      raw[offset + 2] = rgb[2];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
const image = fixturePng();

function makeGarment(name, status = 'active') {
  return {
    id: randomUUID(),
    media_id: randomUUID(),
    name,
    status,
    category: 'outerwear',
    subcategory: 'blazer',
    layer_position: 'outer',
    primary_color: 'slate blue',
    secondary_colors: ['gray'],
    pattern: 'solid',
    material: 'wool',
    seasons: ['autumn', 'winter'],
    warmth_level: 4,
    min_temp_c: -5,
    max_temp_c: 15,
    formality: 4,
    occasions: ['work', 'dinner'],
    style_tags: ['classic'],
    brand: 'Fixture label',
    description: 'Synthetic fixture garment for browser testing. No AI was called.',
    availability: 'available',
    is_clean: true,
    ai_confidence: 0.91,
    user_confirmed: status === 'active',
    corrected_fields: [],
    needs_review: false,
    created_at: now(),
    updated_at: now(),
  };
}
const garments = [
  makeGarment('Fixture · ready blazer'),
  makeGarment('Fixture · review this blazer', 'pending_confirmation'),
  makeGarment('Fixture · failed garment', 'failed'),
  {
    ...makeGarment('Fixture · white cotton shirt'),
    category: 'top',
    subcategory: 'shirt',
    layer_position: 'base',
    primary_color: 'white',
    secondary_colors: [],
    material: 'cotton',
    seasons: ['spring', 'summer', 'autumn', 'winter'],
    warmth_level: 2,
    formality: 3,
  },
  {
    ...makeGarment('Fixture · tailored navy trousers'),
    category: 'bottom',
    subcategory: 'trousers',
    layer_position: 'standalone',
    primary_color: 'navy',
    secondary_colors: [],
    material: 'cotton',
    seasons: ['spring', 'summer', 'autumn'],
    warmth_level: 2,
    formality: 3,
  },
  {
    ...makeGarment('Fixture · brown leather loafers'),
    category: 'footwear',
    subcategory: 'loafers',
    layer_position: 'standalone',
    primary_color: 'brown',
    secondary_colors: [],
    material: 'leather',
    seasons: ['spring', 'summer', 'autumn'],
    warmth_level: 2,
    formality: 3,
  },
  {
    ...makeGarment('Fixture · sage linen dress'),
    category: 'dress',
    subcategory: 'midi dress',
    layer_position: 'standalone',
    primary_color: 'sage',
    secondary_colors: [],
    material: 'linen',
    seasons: ['spring', 'summer'],
    warmth_level: 1,
    formality: 3,
  },
];
const fixtureSeparates = garments.slice(3, 6);
savedLooks.push({
  id: randomUUID(),
  name: 'Fixture · everyday separates',
  created_at: now(),
  items: fixtureSeparates.map((garment, index) => ({
    ...itemCard(garment),
    slot: ['top', 'bottom', 'footwear'][index],
    is_available: true,
    unavailable_reason: null,
  })),
  is_available: true,
  image_ready: false,
});
// One pre-existing item makes additive wear logging and deduplication visible.
wearDays.set(day(), [wearItem(fixtureSeparates[0])]);
function makeScore(status = 'scored', mediaId = randomUUID()) {
  const ready = status === 'scored';
  return {
    id: randomUUID(),
    media_id: mediaId,
    status,
    title: 'Fixture outfit review · simulated',
    overall: ready ? 84 : null,
    color_harmony: ready ? 22 : null,
    hairstyle: ready ? 21 : null,
    accessory: ready ? 20 : null,
    trendiness: ready ? 21 : null,
    comment: ready
      ? 'Synthetic browser-test result. No AI provider received a photo and no real outfit was assessed.'
      : '',
    positives: ready ? ['Fixture: all displayed scoring data is simulated.'] : [],
    negatives: [],
    suggestions: [],
    locale: 'en',
    unreadable: false,
    failure_reason: null,
    ai_confidence: null,
    assessment_evidence: null,
    created_at: now(),
    updated_at: now(),
  };
}
const scores = [makeScore()];

function fail(status, code, detail) {
  throw Object.assign(new Error(detail), { status, code });
}
function issueSession() {
  const access_token = `fixture_access_${randomUUID()}`;
  const refresh_token = `fixture_refresh_${randomUUID()}`;
  const session = {
    access_token,
    refresh_token,
    token_type: 'bearer',
    expires_in: 600,
    user: { ...user },
    expiresAt: Date.now() + 600_000,
  };
  sessions.set(access_token, session);
  refreshTokens.set(refresh_token, access_token);
  const { expiresAt: _expiresAt, ...response } = session;
  return response;
}
function requireAuth(request) {
  const token = request.headers.authorization?.replace(/^Bearer /, '');
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now())
    fail(401, 'unauthenticated', 'Fixture session expired or missing. Sign in again.');
  return session;
}
function requireConsent() {
  if (!granted)
    fail(
      403,
      'ai_processing_consent_missing',
      'Grant photo processing consent in the fixture account first.',
    );
}
function consentResponse() {
  return {
    consent_type: 'ai_processing',
    policy_version: 'ai-processing.v1',
    status: granted ? 'granted' : consentRecorded ? 'revoked' : 'not_recorded',
    granted,
    record_id: consentRecorded ? userId : null,
    locale: 'en',
    source: consentRecorded ? 'api' : null,
    recorded_at: consentRecorded ? now() : null,
  };
}
function createChallenge(purpose, email) {
  const challenge_id = randomUUID();
  challenges.set(challenge_id, { purpose, email, expiresAt: Date.now() + 600_000 });
  return { challenge_id, expires_in: 600, resend_after: 60 };
}
function checkChallenge(body, purpose) {
  const challenge = challenges.get(body.challenge_id);
  if (
    !challenge ||
    challenge.expiresAt <= Date.now() ||
    body.code !== '12345678' ||
    (purpose && challenge.purpose !== purpose)
  )
    fail(400, 'invalid_verification_code', 'Fixture verification code is 12345678.');
  challenges.delete(body.challenge_id);
  return challenge;
}
function createJob(kind, id) {
  const job = {
    id: randomUUID(),
    job_type: kind === 'garment' ? 'garment_ingestion' : 'outfit_score',
    subject_id: id,
    status: 'queued',
    attempts: 0,
    max_attempts: 3,
    last_error: null,
    queued_at: now(),
    started_at: null,
    finished_at: null,
  };
  jobs.set(job.id, { job, kind, polls: 0 });
  return { ...job };
}
function findGarment(id) {
  const garment = garments.find((item) => item.id === id);
  if (!garment) fail(404, 'not_found', 'Fixture garment not found.');
  return garment;
}
function allowedSlots(garment) {
  if (garment.category === 'top')
    return garment.layer_position === 'mid' ? ['top', 'mid'] : ['top'];
  if (garment.category === 'outerwear')
    return ['deel', 'winter_deel'].includes(garment.subcategory) &&
      garment.layer_position === 'standalone'
      ? ['dress']
      : ['outer'];
  return (
    {
      bottom: ['bottom'],
      dress: ['dress'],
      footwear: ['footwear'],
      accessory: ['accessory1'],
      underlayer: ['mid'],
    }[garment.category] || []
  );
}
function itemCard(garment) {
  return {
    source: 'wardrobe',
    item_id: garment.id,
    name: garment.name,
    category: garment.category,
    primary_color: garment.primary_color,
    allowed_slots: allowedSlots(garment),
    image_ready: !!garment.media_id,
    store_listing_id: null,
    price_minor: null,
    currency: null,
    currency_exponent: null,
    seller_type: null,
    is_test: true,
  };
}
function savedItem(reference, previous = {}) {
  const garment = garments.find((item) => item.id === reference.item_id);
  const unavailable_reason = !garment
    ? 'deleted'
    : garment.status !== 'active'
      ? 'not_active'
      : !garment.user_confirmed
        ? 'unconfirmed'
        : garment.availability !== 'available'
          ? 'unavailable'
          : !garment.is_clean
            ? 'not_clean'
            : !allowedSlots(garment).includes(reference.slot)
              ? 'slot_mismatch'
              : null;
  return {
    ...(garment
      ? itemCard(garment)
      : {
          ...previous,
          source: reference.source,
          item_id: reference.item_id,
          name: previous.name || 'Fixture · archived item',
          category: previous.category || null,
          allowed_slots: previous.allowed_slots || [],
          image_ready: false,
        }),
    slot: reference.slot,
    is_available: !unavailable_reason,
    unavailable_reason,
  };
}
function projectLook(look) {
  const items = look.items.map((item) => savedItem(item, item));
  return {
    ...look,
    items,
    is_available: items.every((item) => item.is_available),
    image_ready: false,
  };
}
function wearItem(garment) {
  return {
    id: randomUUID(),
    garment_id: garment.id,
    name: garment.name,
    category: garment.category,
    primary_color: garment.primary_color,
    recommendation_id: null,
    source: 'manual',
    created_at: now(),
    archived: false,
  };
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function cursorPage(items, url, defaultLimit = 20) {
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || defaultLimit));
  const cursor = url.searchParams.get('cursor');
  const index = cursor ? items.findIndex((item) => item.id === cursor) : -1;
  if (cursor && index < 0) fail(422, 'validation_error', 'Unknown fixture cursor.');
  const page = items.slice(index + 1, index + 1 + limit);
  return { items: page, next_cursor: index + 1 + limit < items.length ? page.at(-1).id : null };
}
function pageItems(items, url, defaultLimit) {
  const limit = Math.min(250, Math.max(1, Number(url.searchParams.get('limit')) || defaultLimit));
  const before = url.searchParams.get('before');
  const start = before ? items.findIndex((item) => item.id === before) + 1 : 0;
  return items.slice(start, start + limit);
}
async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BYTES) fail(413, 'validation_error', 'Fixture accepts files up to 15 MB.');
    chunks.push(chunk);
  }
  if (!size) return {};
  if (!request.headers['content-type']?.includes('application/json')) return { byte_size: size };
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    fail(422, 'validation_error', 'Expected a JSON request body.');
  }
}

async function route(request, url, body) {
  const path = url.pathname,
    method = request.method;
  if (path === '/health')
    return [200, { status: 'ok', fixture: true, upstream_calls: false, state: 'memory-only' }];
  if (path === '/fixtures/garment.png' || path === '/fixtures/outfit.png')
    return [200, image, 'image/png'];
  if (path.startsWith('/fixture-storage/')) {
    const media = uploads.get(path.split('/').at(-1));
    if (!media || url.searchParams.get('token') !== media.token)
      fail(403, 'forbidden', 'Invalid fixture upload capability.');
    if (method !== 'PUT') fail(405, 'method_not_allowed', 'Use PUT for the fixture upload.');
    if (request.headers.authorization)
      fail(
        400,
        'validation_error',
        'Account bearer tokens must not be sent to signed upload storage.',
      );
    if (media.uploaded) fail(409, 'conflict', 'Fixture object already exists.');
    if (!body.byte_size) fail(422, 'validation_error', 'No image bytes received.');
    media.uploaded = true;
    return [200, { fixture: true, uploaded: true, bytes_discarded: body.byte_size }];
  }
  if (path.startsWith('/fixture-images/')) return [200, image, 'image/png'];

  if (path === '/v1/auth/login' && method === 'POST') {
    if (body.email?.trim().toLowerCase() !== user.email || body.password !== password)
      fail(401, 'invalid_credentials', 'Use the documented fixture credentials.');
    return [200, issueSession()];
  }
  if (path === '/v1/auth/register' && method === 'POST') {
    if (
      !body.email ||
      typeof body.password !== 'string' ||
      [...body.password].length < 8 ||
      [...body.password].length > 128
    )
      fail(422, 'weak_password', 'Fixture passwords must contain 8–128 characters.');
    const challenge = createChallenge('register', body.email.trim().toLowerCase());
    Object.assign(challenges.get(challenge.challenge_id), {
      password: body.password,
      displayName: body.display_name,
    });
    return [202, challenge];
  }
  if (path === '/v1/auth/email/verify' && method === 'POST') {
    const challenge = checkChallenge(body, 'register');
    user.email = challenge.email;
    password = challenge.password;
    displayName = `Fixture · ${challenge.displayName || 'New account'}`;
    return [200, issueSession()];
  }
  if (path === '/v1/auth/email/resend' && method === 'POST') {
    const previous = challenges.get(body.challenge_id);
    if (!previous) fail(400, 'invalid_verification_code', 'Start a new fixture verification flow.');
    const next = createChallenge(previous.purpose, previous.email);
    Object.assign(challenges.get(next.challenge_id), previous, { expiresAt: Date.now() + 600_000 });
    challenges.delete(body.challenge_id);
    return [202, next];
  }
  if (path === '/v1/auth/password/forgot' && method === 'POST')
    return [202, createChallenge('reset', body.email?.trim().toLowerCase())];
  if (path === '/v1/auth/password/reset' && method === 'POST') {
    if (
      typeof body.new_password !== 'string' ||
      [...body.new_password].length < 8 ||
      [...body.new_password].length > 128
    )
      fail(422, 'weak_password', 'Choose 8–128 characters.');
    const challenge = checkChallenge(body, 'reset');
    if (challenge.email === user.email) {
      password = body.new_password;
      sessions.clear();
      refreshTokens.clear();
    }
    return [200, { status: 'ok' }];
  }
  if (path === '/v1/auth/refresh' && method === 'POST') {
    const previous = refreshTokens.get(body.refresh_token);
    if (!previous || !sessions.has(previous))
      fail(401, 'unauthenticated', 'Fixture refresh token is invalid or already used.');
    refreshTokens.delete(body.refresh_token);
    sessions.delete(previous);
    return [200, issueSession()];
  }
  const session = requireAuth(request);
  if (path === '/v1/auth/logout' && method === 'POST') {
    sessions.delete(session.access_token);
    refreshTokens.delete(session.refresh_token);
    return [204];
  }
  if (path === '/v1/me') return [200, { user_id: userId, claims: { fixture: true } }];
  if (path === '/v1/fitting-room/readiness' && method === 'GET')
    return [
      200,
      {
        enabled: true,
        ready: true,
        blockers: [],
        entitled: true,
        allowance_kind: 'trial',
        allowance_seconds_remaining: 120,
        session_max_seconds: 120,
        consent_policy_version: 'live-try-on.decart.v3',
        fixture: true,
        fixture_note:
          'Synthetic selection and consent UI only. Live sessions are disabled; no AI provider is connected.',
      },
    ];
  if (path === '/v1/fitting-room/candidates' && method === 'POST') {
    if (!['top', 'bottom', 'dress', 'shoes'].includes(body.slot))
      fail(
        422,
        'validation_error',
        'Choose a fixture Fitting Room lane: top, bottom, dress, or shoes.',
      );
    if (body.limit != null && (!Number.isInteger(body.limit) || body.limit < 1 || body.limit > 50))
      fail(422, 'validation_error', 'Fixture candidate limit must be an integer from 1 to 50.');
    const slot = body.slot === 'shoes' ? 'footwear' : body.slot;
    const available = garments.filter(
      (garment) =>
        garment.status === 'active' &&
        garment.user_confirmed &&
        garment.is_clean &&
        garment.availability === 'available' &&
        allowedSlots(garment).includes(slot),
    );
    const pageUrl = new URL(url);
    if (body.cursor != null) pageUrl.searchParams.set('cursor', body.cursor);
    pageUrl.searchParams.set('limit', String(body.limit ?? 20));
    const page = cursorPage(available, pageUrl);
    return [
      200,
      {
        items: page.items.map((garment) => ({
          slot: body.slot,
          source: 'wardrobe',
          item_id: garment.id,
          name: garment.name,
          category: garment.category,
          subcategory: garment.subcategory,
          primary_color: garment.primary_color,
          image_url: null,
          reference_ready: true,
          store: null,
          reasons: ['Synthetic fixture garment for local UI testing; no AI was called.'],
        })),
        next_cursor: page.next_cursor,
      },
    ];
  }
  if (path === '/v1/fitting-room/sessions' && method === 'POST')
    fail(
      503,
      'live_tryon_disabled',
      'LOCAL QA FIXTURE: live camera processing is deliberately disabled. This server only tests selection, consent, and error handling; no AI provider or WebRTC stream is connected.',
    );
  const fittingImage = path.match(/^\/v1\/outfit-items\/(wardrobe|catalog)\/([^/]+)\/image$/);
  if (fittingImage && method === 'GET') {
    if (fittingImage[1] !== 'wardrobe')
      fail(404, 'not_found', 'This local fixture contains wardrobe images only.');
    const garment = findGarment(fittingImage[2]);
    if (garment.status !== 'active' || !garment.user_confirmed)
      fail(404, 'not_found', 'No confirmed active fixture image was found.');
    return [200, image, 'image/png'];
  }
  if (path === '/v1/onboarding')
    return [
      200,
      {
        completed: true,
        profile: {
          display_name: displayName,
          locale: 'en',
          timezone: 'Asia/Ulaanbaatar',
          unit_system: 'metric',
          fit_profile_version: 1,
        },
        preferences: {
          preferred_styles: ['classic', 'minimal'],
          disliked_colors: [],
          preferred_colors: [],
          formality_default: 3,
          cold_sensitivity: 3,
          version: 1,
        },
      },
    ];
  if (path === '/v1/me/entitlement')
    return [
      200,
      {
        tier: 'trial',
        active: true,
        trial_ends_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
        period_end: null,
        source: 'trial',
        plan: 'Fixture testing · no payment',
        renews: false,
        billing_retry: false,
        beta_access: false,
        daily_ai_jobs: 100,
        trial_days_remaining: 7,
      },
    ];
  if (path === '/v1/home-summary')
    return [
      200,
      {
        preferences: {
          window_days: 30,
          weights: { color_harmony: 25, hairstyle: 25, accessory: 25, trendiness: 25 },
          version: 1,
          updated_at: null,
        },
        timezone: 'Asia/Ulaanbaatar',
        period_start: null,
        period_end: day(),
        overall: 84,
        sample_count: scores.filter((item) => item.status === 'scored').length,
        early_estimate: scores.filter((item) => item.status === 'scored').length < 3,
        metrics: { color_harmony: 88, hairstyle: 84, accessory: 80, trendiness: 84 },
        metric_counts: { color_harmony: 1, hairstyle: 1, accessory: 1, trendiness: 1 },
        incomplete_excluded_count: 0,
        legacy_excluded_count: 0,
        unreadable_excluded_count: 0,
        unavailable_excluded_count: 0,
      },
    ];
  if (path === '/v1/consents/ai-processing') {
    if (method === 'PUT') {
      if (typeof body.granted !== 'boolean')
        fail(422, 'validation_error', 'Consent must be boolean.');
      granted = body.granted;
      consentRecorded = true;
    }
    return [200, consentResponse()];
  }
  if (path === '/v1/garment-uploads' && method === 'POST') {
    requireConsent();
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(body.mime_type) ||
      body.byte_size <= 0 ||
      body.byte_size > MAX_BYTES
    )
      fail(422, 'validation_error', 'Use a JPEG, PNG or WebP image up to 15 MB.');
    const media_id = randomUUID(),
      token = `fixture_upload_${randomUUID()}`;
    uploads.set(media_id, {
      token,
      uploaded: false,
      mimeType: body.mime_type,
      byteSize: body.byte_size,
    });
    return [
      201,
      {
        media_id,
        bucket: 'fixture-private',
        object_path: `${userId}/${media_id}`,
        mime_type: body.mime_type,
        byte_size: body.byte_size,
        signed_upload_url: `${ORIGIN}/fixture-storage/${media_id}?token=${token}`,
        upload_token: token,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      },
    ];
  }
  if (path === '/v1/garments') {
    if (method === 'GET') return [200, { items: pageItems(garments, url, 100) }];
    if (method === 'POST') {
      requireConsent();
      if (!uploads.get(body.media_id)?.uploaded)
        fail(422, 'validation_error', 'Complete the fixture photo upload first.');
      const garment = makeGarment(`Fixture · uploaded garment ${++garmentNumber}`, 'processing');
      garment.media_id = body.media_id;
      garments.unshift(garment);
      return [202, { garment: { ...garment }, job: createJob('garment', garment.id) }];
    }
  }
  if (path.startsWith('/v1/garments/')) {
    const [, , , id, action] = path.split('/');
    const garment = findGarment(id);
    if (action === 'image' && method === 'GET')
      return [
        200,
        {
          signed_url: `${ORIGIN}/fixture-images/${id}.png?fixture=1`,
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
      ];
    if (action === 'confirmation' && method === 'PATCH') {
      if (garment.status !== 'pending_confirmation')
        fail(409, 'conflict', 'Only a pending-confirmation fixture can be confirmed.');
      if (
        !['top', 'bottom', 'dress', 'outerwear', 'footwear', 'accessory', 'underlayer'].includes(
          body.category,
        )
      )
        fail(422, 'validation_error', 'Choose a garment category.');
      // Catch a common integration bug: replacing omitted extracted values with defaults.
      const preserved = [
        'subcategory',
        'layer_position',
        'secondary_colors',
        'pattern',
        'material',
        'seasons',
        'min_temp_c',
        'max_temp_c',
        'occasions',
        'style_tags',
        'brand',
        'description',
      ];
      if (preserved.some((field) => !(field in body)))
        fail(
          422,
          'validation_error',
          'Confirmation must retain the original extracted attributes.',
        );
      const edited = Object.keys(body).filter(
        (field) =>
          field in garment && JSON.stringify(garment[field]) !== JSON.stringify(body[field]),
      );
      Object.assign(garment, body, {
        status: 'active',
        user_confirmed: true,
        needs_review: false,
        corrected_fields: edited,
        updated_at: now(),
      });
      return [200, { ...garment }];
    }
    if (action === 'availability' && method === 'PATCH') {
      if (!['available', 'laundry'].includes(body.availability))
        fail(422, 'validation_error', 'Choose available or laundry.');
      garment.availability = body.availability;
      garment.is_clean = body.availability === 'available';
      garment.updated_at = now();
      return [200, { ...garment }];
    }
    if (action === 'retry' && method === 'POST') {
      requireConsent();
      if (garment.status !== 'failed')
        fail(409, 'conflict', 'Only failed fixtures may be retried.');
      garment.status = 'processing';
      return [202, { garment: { ...garment }, job: createJob('garment', garment.id) }];
    }
    if (!action && method === 'GET') return [200, { ...garment }];
    if (!action && method === 'DELETE') {
      garments.splice(garments.indexOf(garment), 1);
      return [204];
    }
  }
  if (path.startsWith('/v1/ai-jobs/')) {
    const entry = jobs.get(path.split('/').at(-1));
    if (!entry) fail(404, 'not_found', 'Fixture job not found.');
    if (['succeeded', 'failed', 'dead'].includes(entry.job.status)) return [200, { ...entry.job }];
    entry.polls++;
    if (!granted) {
      entry.job.status = 'dead';
      entry.job.last_error = 'ai_processing_consent_missing';
      entry.job.finished_at = now();
      if (entry.kind === 'garment') findGarment(entry.job.subject_id).status = 'failed';
      else {
        const score = scores.find((item) => item.id === entry.job.subject_id);
        if (score) {
          score.status = 'failed';
          score.failure_reason = 'ai_processing_consent_missing';
        }
      }
    } else if (entry.polls < 2) {
      entry.job.status = 'running';
      entry.job.attempts = 1;
      entry.job.started_at = now();
    } else {
      entry.job.status = 'succeeded';
      entry.job.finished_at = now();
      if (entry.kind === 'garment') {
        const garment = findGarment(entry.job.subject_id);
        if (garment.status === 'processing') garment.status = 'pending_confirmation';
      } else {
        const score = scores.find((item) => item.id === entry.job.subject_id);
        if (score?.status === 'analyzing')
          Object.assign(score, makeScore('scored', score.media_id), { id: entry.job.subject_id });
      }
    }
    return [200, { ...entry.job }];
  }
  if (path === '/v1/outfit-scores') {
    if (method === 'GET') return [200, { items: pageItems(scores, url, 30) }];
    if (method === 'POST') {
      requireConsent();
      if (!uploads.get(body.media_id)?.uploaded)
        fail(422, 'validation_error', 'Complete the fixture upload first.');
      const score = makeScore('analyzing', body.media_id);
      score.locale = body.locale || 'en';
      scores.unshift(score);
      return [202, { score: { ...score }, job: createJob('score', score.id) }];
    }
  }
  if (path.startsWith('/v1/outfit-scores/')) {
    const id = path.split('/')[3],
      score = scores.find((item) => item.id === id);
    if (!score) fail(404, 'not_found', 'Fixture score not found.');
    if (path.endsWith('/image'))
      return [
        200,
        {
          signed_url: `${ORIGIN}/fixtures/outfit.png`,
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
      ];
    return [200, { ...score }];
  }
  if (path === '/v1/wear-history') {
    if (method === 'GET') {
      const start_date = url.searchParams.get('start_date'),
        end_date = url.searchParams.get('end_date');
      if (!validDate(start_date) || !validDate(end_date) || start_date > end_date)
        fail(422, 'validation_error', 'Choose a valid fixture date range.');
      const days = [...wearDays]
        .filter(([date]) => date >= start_date && date <= end_date)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, items]) => ({
          date,
          items: items.map((item) => ({
            ...item,
            archived: !garments.some((garment) => garment.id === item.garment_id),
          })),
        }));
      return [200, { start_date, end_date, days }];
    }
    if (method !== 'POST')
      fail(405, 'method_not_allowed', 'Fixture wear history supports GET and POST.');
    if (
      !validDate(body.worn_date) ||
      body.worn_date > day() ||
      !Array.isArray(body.garment_ids) ||
      !body.garment_ids.length ||
      body.garment_ids.length > 20 ||
      new Set(body.garment_ids).size !== body.garment_ids.length
    )
      fail(422, 'validation_error', 'Choose today or an earlier date and 1–20 distinct garments.');
    const chosen = body.garment_ids.map((id) => findGarment(id));
    if (chosen.some((garment) => garment.status !== 'active' || !garment.user_confirmed))
      fail(422, 'validation_error', 'Choose only confirmed, active fixture garments.');
    const existing = wearDays.get(body.worn_date) || [];
    const ids = [];
    let added_count = 0;
    for (const garment of chosen) {
      let item = existing.find((entry) => entry.garment_id === garment.id);
      if (!item) {
        item = wearItem(garment);
        existing.push(item);
        added_count++;
      }
      ids.push(item.id);
    }
    wearDays.set(body.worn_date, existing);
    return [201, { worn_date: body.worn_date, wear_log_ids: ids, added_count }];
  }
  if (path === '/v1/saved-looks') {
    if (method === 'GET') {
      const page = cursorPage(savedLooks, url);
      return [200, { ...page, items: page.items.map(projectLook) }];
    }
    if (method !== 'POST')
      fail(405, 'method_not_allowed', 'Fixture saved looks support GET and POST.');
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (
      !name ||
      name.length > 80 ||
      !Array.isArray(body.items) ||
      body.items.length < 2 ||
      body.items.length > 7
    )
      fail(422, 'validation_error', 'Choose a name and 2–7 pieces for a complete fixture look.');
    const slots = new Set(body.items.map((item) => item.slot));
    const identities = new Set(body.items.map((item) => `${item.source}:${item.item_id}`));
    const separates = slots.has('top') && slots.has('bottom'),
      dress = slots.has('dress');
    if (
      slots.size !== body.items.length ||
      identities.size !== body.items.length ||
      !slots.has('footwear') ||
      !(separates || dress) ||
      (dress && (slots.has('top') || slots.has('bottom')))
    )
      fail(
        422,
        'validation_error',
        'A complete look needs footwear and either a top with bottom or a dress, without repeated slots or items.',
      );
    if (body.items.some((item) => item.source !== 'wardrobe'))
      fail(422, 'validation_error', 'This local fixture includes wardrobe items only.');
    const items = body.items.map((item) => savedItem(item));
    if (items.some((item) => !item.is_available))
      fail(
        409,
        'conflict',
        'Choose confirmed, clean, available fixture garments that match their slots.',
      );
    const look = {
      id: randomUUID(),
      name,
      items,
      is_available: true,
      image_ready: false,
      created_at: now(),
    };
    savedLooks.unshift(look);
    return [201, projectLook(look)];
  }
  if (path.startsWith('/v1/saved-looks/')) {
    const index = savedLooks.findIndex((item) => item.id === path.split('/').at(-1));
    if (index < 0) fail(404, 'not_found', 'Fixture saved look not found.');
    if (method === 'GET') return [200, projectLook(savedLooks[index])];
    if (method === 'DELETE') {
      savedLooks.splice(index, 1);
      return [204];
    }
    fail(405, 'method_not_allowed', 'Fixture saved looks support GET and DELETE.');
  }
  fail(404, 'not_found', `No fixture handler for ${method} ${path}.`);
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  const localOrigin = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (localOrigin) response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Idempotency-Key, Cache-Control, X-Upsert',
  );
  response.setHeader('Access-Control-Expose-Headers', 'Retry-After');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-LookLuxe-Fixture', 'local-browser-qa-only');
  try {
    if (origin && !localOrigin)
      fail(403, 'forbidden', 'This fixture accepts local preview origins only.');
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }
    const url = new URL(request.url, ORIGIN);
    const body = await readBody(request);
    const mutation =
      url.pathname.startsWith('/v1/') &&
      !url.pathname.startsWith('/v1/auth/') &&
      // Candidate ranking is a read expressed as POST, with no idempotency key.
      !(url.pathname === '/v1/fitting-room/candidates' && request.method === 'POST') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    let ledgerKey, fingerprint;
    if (mutation) {
      requireAuth(request);
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(key))
        fail(422, 'validation_error', 'Fixture application mutations require an Idempotency-Key.');
      ledgerKey = `${request.method}:${url.pathname}:${key}`;
      fingerprint = JSON.stringify(body);
      const previous = idempotency.get(ledgerKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          fail(409, 'conflict', 'Do not reuse a fixture operation key with a different body.');
        response.writeHead(previous.status, { 'Content-Type': 'application/json' });
        response.end(previous.json);
        return;
      }
    }
    const [status = 200, result, contentType = 'application/json'] = await route(
      request,
      url,
      body,
    );
    const output =
      result === undefined ? '' : Buffer.isBuffer(result) ? result : JSON.stringify(result);
    if (ledgerKey) idempotency.set(ledgerKey, { fingerprint, status, json: output });
    response.writeHead(status, { 'Content-Type': contentType });
    response.end(output);
  } catch (error) {
    const status = error.status || 500,
      code = error.code || 'internal_error';
    response.writeHead(status, { 'Content-Type': 'application/problem+json' });
    response.end(
      JSON.stringify({
        type: `urn:lookluxe:fixture:${code}`,
        title: 'Local fixture response',
        status,
        code,
        detail: error.message,
        fixture: true,
      }),
    );
  }
});
server.on('error', (error) => {
  console.error(`Fixture server could not start: ${error.message}`);
  process.exitCode = 1;
});
server.listen(PORT, HOST, () => {
  console.log(`Oyu AI LOCAL QA FIXTURE listening on ${ORIGIN}`);
  console.log(
    'No upstream calls. All records, photos, scores, and credentials are synthetic. State is memory-only.',
  );
  console.log('Fixture sign-in: fixture@lookluxe.test / FixturePass123!');
  console.log('Fixture verification/recovery code: 12345678');
  console.log(`Fixture PNG: ${ORIGIN}/fixtures/garment.png`);
});
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
