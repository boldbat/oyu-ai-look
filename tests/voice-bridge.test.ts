import { once } from 'node:events';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVoiceBridge } from '../server/voice-bridge.mjs';

const key = 'fixture-elevenlabs-key-never-visible-to-browser';
const catalog = {
  voices: [
    {
      voice_id: 'BrianVoice000000',
      name: 'Brian',
      category: 'premade',
      labels: { gender: 'male' },
    },
    {
      voice_id: 'AliceVoice000000',
      name: 'Alice',
      category: 'premade',
      labels: { gender: 'female', age: 'middle_aged', accent: 'british' },
    },
    {
      voice_id: 'JessicaVoice0000',
      name: 'Jessica - Playful, Bright, Warm',
      category: 'premade',
      labels: { gender: 'female', age: 'young', accent: 'american', use_case: 'conversational' },
    },
    { voice_id: 'bad id!', name: 'Broken', category: 'premade', labels: { gender: 'female' } },
  ],
};
type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> | null };
const servers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((close) => close()));
});

/** A bridge in front of a fake ElevenLabs. `speech` answers each text-to-speech call. */
async function harness(
  options: { apiKey?: string; model?: string; voiceId?: string } = {},
  speech: (call: Call) => Response | Promise<Response> = () =>
    new Response(new Uint8Array([1, 2, 3])),
) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const call = {
      url,
      headers: init.headers as Record<string, string>,
      body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    };
    calls.push(call);
    if (url.includes('/v2/voices')) return Response.json(catalog);
    return speech(call);
  });
  const bridge = createVoiceBridge({
    apiKey: key,
    ...options,
    fetch: fetch as typeof globalThis.fetch,
  });
  const server = createServer((req, res) => {
    if (!bridge.handleRequest(req, res)) {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  const origin = `http://127.0.0.1:${address.port}`;
  servers.push(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const say = (body: unknown, headers: Record<string, string> = {}) =>
    globalThis.fetch(`${origin}/__lookluxe/voice/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
      body: JSON.stringify(body),
    });
  return { origin, calls, say };
}

describe('Oyu’s human voice route', () => {
  it('says whether a key is set, without revealing it', async () => {
    const { origin } = await harness();
    const status = await globalThis.fetch(`${origin}/__lookluxe/voice/status`);
    expect(await status.json()).toEqual({ configured: true });
    const off = await harness({ apiKey: '' });
    const offStatus = await globalThis.fetch(`${off.origin}/__lookluxe/voice/status`);
    expect(await offStatus.json()).toEqual({ configured: false });
    const voices = await globalThis.fetch(`${off.origin}/__lookluxe/voice/voices`);
    expect(voices.status).toBe(503);
  });

  it('lists only female voices, the warmest default first', async () => {
    const { origin, calls } = await harness();
    const response = await globalThis.fetch(`${origin}/__lookluxe/voice/voices`);
    const text = await response.text();
    expect(text).not.toContain(key);
    expect(JSON.parse(text)).toEqual({
      voices: [
        {
          id: 'JessicaVoice0000',
          name: 'Jessica - Playful, Bright, Warm',
          about: 'young · american · conversational',
        },
        { id: 'AliceVoice000000', name: 'Alice', about: 'middle aged · british' },
      ],
    });
    expect(calls[0].headers['xi-api-key']).toBe(key);
  });

  it('offers the standard voices to a key that may not list voices', async () => {
    const forbidden = Response.json(
      { detail: { status: 'missing_permissions', message: 'voices_read permission' } },
      { status: 401 },
    );
    const fetch = vi.fn(async (url: string) =>
      url.includes('/v2/voices') ? forbidden.clone() : new Response(new Uint8Array([7])),
    );
    const bridge = createVoiceBridge({
      apiKey: key,
      voiceId: 'FGY2WhTYpPnrIDTdsKH5',
      fetch: fetch as typeof globalThis.fetch,
    });
    const server = createServer((req, res) => void bridge.handleRequest(req, res));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    const address = server.address() as { port: number };
    const response = await globalThis.fetch(
      `http://127.0.0.1:${address.port}/__lookluxe/voice/voices`,
    );
    const { voices } = (await response.json()) as { voices: Array<{ name: string }> };
    expect(voices.map((voice) => voice.name)).toEqual(['Laura', 'Sarah', 'Matilda']);
  });

  it('speaks a line in the asked language with the chosen voice, once', async () => {
    const { calls, say } = await harness();
    const line = {
      text: '  Энэ   пиджак танд зохиж байна! ',
      lang: 'mn',
      voice: 'AliceVoice000000',
    };
    const first = await say(line);
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('audio/mpeg');
    expect([...new Uint8Array(await first.arrayBuffer())]).toEqual([1, 2, 3]);
    const spoken = calls.filter((call) => call.url.includes('/text-to-speech/'));
    expect(spoken).toHaveLength(1);
    expect(spoken[0].url).toContain('/v1/text-to-speech/AliceVoice000000?');
    expect(spoken[0].body).toEqual({
      text: 'Энэ пиджак танд зохиж байна!',
      model_id: 'eleven_v4_turbo',
      language_code: 'mn',
    });
    // The same line again comes from memory.
    expect((await say(line)).status).toBe(200);
    expect(calls.filter((call) => call.url.includes('/text-to-speech/'))).toHaveLength(1);
  });

  it('uses the default voice for an unknown or missing one', async () => {
    const { calls, say } = await harness();
    await say({ text: 'Hi!', lang: 'en', voice: 'BrianVoice000000' });
    await say({ text: 'Hello!', lang: 'en' });
    const urls = calls.filter((call) => call.url.includes('/text-to-speech/')).map((c) => c.url);
    expect(urls.every((url) => url.includes('/JessicaVoice0000?'))).toBe(true);
  });

  it('falls back to a model the account can use, and remembers it', async () => {
    const { calls, say } = await harness({}, (call) =>
      call.body?.model_id === 'eleven_v3'
        ? new Response(new Uint8Array([9]))
        : Response.json({ detail: { status: 'model_not_found' } }, { status: 400 }),
    );
    expect((await say({ text: 'One', lang: 'en' })).status).toBe(200);
    expect((await say({ text: 'Two', lang: 'en' })).status).toBe(200);
    const models = calls.filter((c) => c.body).map((c) => c.body?.model_id);
    expect(models).toEqual(['eleven_v4_turbo', 'eleven_v4', 'eleven_v3', 'eleven_v3']);
  });

  it('falls back for parallel first lines when another request advances the model', async () => {
    let attempts = 0;
    let releaseFirst = () => {};
    const { say } = await harness({}, async (call) => {
      if (call.body?.model_id === 'eleven_v3') return new Response(new Uint8Array([9]));
      attempts++;
      // Both lines reach each rejected model before either receives its response.
      if (attempts % 2 === 1)
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      else releaseFirst();
      return Response.json({ detail: { status: 'model_not_found' } }, { status: 400 });
    });
    const responses = await Promise.all([
      say({ text: 'One', lang: 'en' }),
      say({ text: 'Two', lang: 'en' }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
  });

  it('turns provider failures into plain codes', async () => {
    const quota = await harness({}, () =>
      Response.json({ detail: { status: 'quota_exceeded' } }, { status: 401 }),
    );
    const out = await quota.say({ text: 'Hi', lang: 'en' });
    expect(out.status).toBe(402);
    expect(await out.json()).toEqual({ code: 'voice_quota' });
    const wrongKey = await harness({}, () => new Response('{}', { status: 401 }));
    expect(await (await wrongKey.say({ text: 'Hi', lang: 'en' })).json()).toEqual({
      code: 'voice_key_invalid',
    });
  });

  it('refuses bad input and other sites', async () => {
    const { origin, calls, say } = await harness();
    expect((await say({ text: '', lang: 'en' })).status).toBe(400);
    expect((await say({ text: 'x'.repeat(401), lang: 'en' })).status).toBe(400);
    expect((await say({ text: 'Hi', lang: 'fr' })).status).toBe(400);
    expect((await say({ text: 'Hi', lang: 'en' }, { Origin: 'https://evil.example' })).status).toBe(
      403,
    );
    const plain = await globalThis.fetch(`${origin}/__lookluxe/voice/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Origin: origin },
      body: JSON.stringify({ text: 'Hi', lang: 'en' }),
    });
    expect(plain.status).toBe(415);
    expect(calls.filter((call) => call.url.includes('/text-to-speech/'))).toHaveLength(0);
  });

  it('caps new lines per minute', async () => {
    const { say } = await harness();
    const statuses = [];
    for (let n = 0; n < 41; n++)
      statuses.push((await say({ text: `Line ${n}`, lang: 'en' })).status);
    expect(statuses.slice(0, 40).every((status) => status === 200)).toBe(true);
    expect(statuses[40]).toBe(429);
  });
});
