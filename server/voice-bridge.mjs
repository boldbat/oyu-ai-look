/**
 * Oyu's human voice: her lines spoken by ElevenLabs. The key stays on this server; the browser
 * sends only the line to say and gets audio back. Without a key the app keeps the browser's
 * own voice.
 */
const MAX_TEXT = 400;
const MAX_BODY = 4096;
/** Spoken lines kept in memory: Oyu repeats herself, and a repeat costs nothing. */
const CACHE_LINES = 300;
/** New lines per minute, so a runaway page cannot spend the account's credits. */
const PER_MINUTE = 40;
const VOICE_ID = /^[A-Za-z0-9]{8,40}$/;
/** Newest first; the first model this account can use is kept for the rest of the run. */
const MODELS = ['eleven_v4_turbo', 'eleven_v4', 'eleven_v3'];
/** ElevenLabs' default voices that suit a warm, young stylist, best first. */
const PREFERRED = ['Jessica', 'Sarah', 'Laura', 'Lily', 'Matilda', 'Alice'];
const OWN = ['cloned', 'generated', 'professional'];
/** ElevenLabs' standard female voices, for a key that may speak but not list voices. */
const STANDARD = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', about: 'young · american · soft' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', about: 'young · american · upbeat' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', about: 'middle aged · american · friendly' },
];
const loopback = (value) =>
  ['localhost', '127.0.0.1', '[::1]', '::1', '::ffff:127.0.0.1'].includes(value);

class VoiceError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
/** The browser-facing error for a provider response. */
function providerError(status, detail) {
  if (/quota|credits|limit_reached/i.test(detail)) return new VoiceError('voice_quota', 402);
  if (status === 401 || status === 403) return new VoiceError('voice_key_invalid', 502);
  if (status === 429) return new VoiceError('voice_busy', 429);
  return new VoiceError('voice_failed', 502);
}
/** "young · american · conversational" from a voice's labels. */
function about(labels) {
  if (!labels || typeof labels !== 'object') return '';
  return ['age', 'accent', 'descriptive', 'description', 'use_case']
    .map((key) => labels[key])
    .filter((value) => typeof value === 'string' && value.length < 40)
    .map((value) => value.replace(/[_-]+/g, ' ').trim())
    .join(' · ')
    .slice(0, 90);
}

export function createVoiceBridge({
  apiKey = '',
  model = '',
  voiceId = '',
  allowedOrigins = [],
  allowRemote = false,
  endpoint = 'https://api.elevenlabs.io',
  fetch: send = globalThis.fetch,
} = {}) {
  if (model && !/^[a-z0-9_]{3,48}$/.test(model)) throw new Error('Unsupported ELEVENLABS_MODEL');
  if (voiceId && !VOICE_ID.test(voiceId)) throw new Error('Unsupported ELEVENLABS_VOICE_ID');
  let models = model ? [model] : [...MODELS];
  /** Models that refused `language_code`; they detect the language from the text instead. */
  const guessLanguage = new Set();
  const cache = new Map();
  const calls = [];
  let catalog = null;

  const reply = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const fail = (res, error) =>
    error instanceof VoiceError
      ? reply(res, error.status, { code: error.code })
      : reply(res, 502, { code: 'voice_failed' });
  function allowed(req, requireOrigin) {
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
  const provider = (path, init = {}) =>
    send(`${endpoint}${path}`, {
      ...init,
      headers: { 'xi-api-key': apiKey, ...init.headers },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });

  /** The account's female voices (and any it made for Oyu), refreshed hourly. */
  function voices() {
    if (catalog && catalog.at > Date.now() - 3_600_000) return catalog.list;
    const list = (async () => {
      const response = await provider('/v2/voices?page_size=100&include_total_count=false', {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        // A key restricted to speech: offer the standard voices (and the configured one).
        if ([401, 403].includes(response.status) && /permission/i.test(detail))
          return [
            ...(voiceId && !STANDARD.some((voice) => voice.id === voiceId)
              ? [{ id: voiceId, name: 'Oyu', about: '' }]
              : []),
            ...STANDARD,
          ].sort((a, b) => (b.id === voiceId) - (a.id === voiceId));
        console.warn(`Oyu voice: ElevenLabs voices ${response.status}`);
        throw providerError(response.status, detail);
      }
      const body = await response.json();
      const found = (Array.isArray(body?.voices) ? body.voices : [])
        .filter(
          (voice) =>
            voice &&
            typeof voice.voice_id === 'string' &&
            VOICE_ID.test(voice.voice_id) &&
            typeof voice.name === 'string' &&
            (String(voice.labels?.gender).toLowerCase() === 'female' ||
              OWN.includes(voice.category)),
        )
        .map((voice) => ({
          id: voice.voice_id,
          name: voice.name.trim().slice(0, 60),
          about: about(voice.labels),
          own: OWN.includes(voice.category),
        }));
      const rank = (voice) => {
        if (voice.id === voiceId) return -3;
        if (/\boyu\b/i.test(voice.name)) return -2;
        if (voice.own) return -1;
        const at = PREFERRED.findIndex((name) => voice.name.startsWith(name));
        return at < 0 ? PREFERRED.length : at;
      };
      return found
        .sort((a, b) => rank(a) - rank(b))
        .map(({ id, name, about: line }) => ({ id, name, about: line }));
    })();
    catalog = { at: Date.now(), list };
    list.catch(() => {
      if (catalog?.list === list) catalog = null;
    });
    return list;
  }

  async function synthesize(text, language, voice) {
    for (;;) {
      const current = models[0];
      const withLanguage = !guessLanguage.has(current);
      const response = await provider(`/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: current,
          ...(withLanguage ? { language_code: language } : {}),
        }),
      });
      if (response.ok) {
        const audio = Buffer.from(await response.arrayBuffer());
        if (!audio.length) throw new VoiceError('voice_failed', 502);
        return audio;
      }
      const detail = await response.text().catch(() => '');
      const refused = [400, 404, 422].includes(response.status);
      // A model this account or endpoint cannot use: move on to the next one, and keep it.
      if (refused && /model/i.test(detail) && (models.length > 1 || current !== models[0])) {
        models = models.filter((name) => name !== current);
        continue;
      }
      if (refused && withLanguage && /language/i.test(detail)) {
        guessLanguage.add(current);
        continue;
      }
      console.warn(`Oyu voice: ElevenLabs ${current} ${response.status}`);
      throw providerError(response.status, detail);
    }
  }
  /** One spoken line, from memory when Oyu said it before. */
  function line(text, language, voice) {
    const key = `${voice}\n${language}\n${text}`;
    const kept = cache.get(key);
    if (kept) {
      cache.delete(key);
      cache.set(key, kept);
      return kept;
    }
    const now = Date.now();
    while (calls.length && calls[0] <= now - 60_000) calls.shift();
    if (calls.length >= PER_MINUTE) throw new VoiceError('voice_busy', 429);
    calls.push(now);
    const audio = synthesize(text, language, voice);
    cache.set(key, audio);
    audio.catch(() => cache.delete(key));
    if (cache.size > CACHE_LINES) cache.delete(cache.keys().next().value);
    return audio;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(new VoiceError('voice_invalid', 413));
          req.destroy();
        } else chunks.push(chunk);
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new VoiceError('voice_invalid', 400));
        }
      });
      req.on('error', () => reject(new VoiceError('voice_invalid', 400)));
    });
  }
  async function speak(req, res) {
    if (!String(req.headers['content-type']).startsWith('application/json'))
      throw new VoiceError('voice_invalid', 415);
    const body = await readBody(req);
    const text = typeof body?.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
    const language = body?.lang;
    if (!text || text.length > MAX_TEXT || !['mn', 'en'].includes(language))
      throw new VoiceError('voice_invalid', 400);
    const list = await voices();
    const voice =
      typeof body.voice === 'string' && list.some((option) => option.id === body.voice)
        ? body.voice
        : list[0]?.id;
    if (!voice) throw new VoiceError('voice_unavailable', 503);
    const audio = await line(text, language, voice);
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audio.length,
      'Cache-Control': 'no-store',
    });
    res.end(audio);
  }

  function handleRequest(req, res) {
    let url;
    try {
      url = new URL(req.url, 'http://local');
    } catch {
      return false;
    }
    if (!url.pathname.startsWith('/__lookluxe/voice/')) return false;
    const post = req.method === 'POST';
    if (!allowed(req, post)) {
      reply(res, 403, { code: 'voice_origin_denied' });
      return true;
    }
    if (url.pathname === '/__lookluxe/voice/status' && req.method === 'GET') {
      reply(res, 200, { configured: !!apiKey });
      return true;
    }
    const route =
      url.pathname === '/__lookluxe/voice/voices' && req.method === 'GET'
        ? async () => {
            const list = await voices();
            reply(res, 200, { voices: list });
          }
        : url.pathname === '/__lookluxe/voice/speak' && post
          ? () => speak(req, res)
          : null;
    if (!route) {
      reply(res, 404, { code: 'voice_not_found' });
      return true;
    }
    if (!apiKey) {
      reply(res, 503, { code: 'voice_not_configured' });
      return true;
    }
    route().catch((error) => {
      if (!res.headersSent) fail(res, error);
      else res.destroy();
    });
    return true;
  }
  return { handleRequest };
}
