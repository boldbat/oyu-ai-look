import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Lang } from './lang';
import { getOyuSettings } from './oyu-settings';

/**
 * Oyu's voice. When the server has an ElevenLabs key (server/voice-bridge.mjs) she speaks in a
 * natural human voice, in Mongolian and English; only her words leave the device. Otherwise,
 * and whenever that voice is unreachable, the browser's own speech reads her lines and nothing
 * is sent anywhere. Every browser ships English voices; a Mongolian one is rare, so in
 * Mongolian the browser voice speaks only on a device that has one.
 */
type Voice = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'> & { voiceURI?: string };

/**
 * Oyu is a woman: male voices (Apple, Google, Microsoft), child voices and the macOS novelty
 * voices are never hers.
 */
const notHers =
  /\b(Albert|Aman|Daniel|Eddy|Fred|Grandpa|Grandma|Junior|Ralph|Reed|Rishi|Rocko|Alex|Aaron|Arthur|Gordon|Oliver|Thomas|Tom|Evan|Nathan|Lee|David|Guy|Mark|Ryan|Christopher|Eric|Roger|Brian|Andrew|Steffan|Davis|Tony|Jason|George|Richard|Ravi|Sean|James|Sam|Liam|William|Connor|Mitchell|Prabhat|Wayne|Luke|Chilemba|Abeo|Elimu|Bataa|Ana|Maisie|Male|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;
/** Older formant voices that sound robotic even when nothing better is installed. */
const robotic = /\b(Flo|Sandy|Shelley|Kathy|Vicki|Victoria|Princess)\b/i;
/** Female voices that sound pleasant on their own (Apple, Google, Microsoft names). */
const warm =
  /\b(Ava|Zoe|Allison|Samantha|Susan|Serena|Kate|Karen|Moira|Tessa|Fiona|Veena|Aria|Jenny|Emma|Michelle|Sonia|Libby|Natasha|Clara|Zira|Hazel|Female)\b/i;

/**
 * How natural a voice sounds, higher is better. Neural voices (Edge's "Online (Natural)",
 * Apple's downloadable Premium and Enhanced voices) sound most like a person; Google's online
 * voices come next, then the standard Apple and Windows voices. Apple names the quality in the
 * voice's id (com.apple.voice.premium.en-US.Ava), not always in its name.
 */
export function voiceQuality(voice: Voice) {
  const { name } = voice;
  const id = `${name} ${voice.voiceURI ?? ''}`;
  const region = /^en-US/i.test(voice.lang) ? 3 : /^en-GB/i.test(voice.lang) ? 2 : 0;
  if (/natural|neural/i.test(id)) return 100 + region;
  if (/premium/i.test(id)) return 90 + region;
  if (/enhanced/i.test(id)) return 80 + region;
  if (/^Google/i.test(name)) return 70 + region;
  if (robotic.test(name)) return 10 + region;
  // Apple's smallest voices are the most synthetic of its standard ones.
  const small = /super-compact/i.test(id) ? 15 : 0;
  return (warm.test(name) ? 50 : 30) - small + region;
}
/** The female voices this device has for a language, most natural first. */
export function voicesFor<V extends Voice>(voices: V[], language: Lang): V[] {
  return voices
    .filter((voice) => voice.lang.toLowerCase().startsWith(language) && !notHers.test(voice.name))
    .sort((a, b) => voiceQuality(b) - voiceQuality(a));
}
/** The browser voice Oyu uses: the one the user chose if the device has it, else the best. */
export function pickVoice<V extends Voice>(voices: V[], language: Lang, chosen?: string | null) {
  const hers = voicesFor(voices, language);
  return hers.find((voice) => voice.name === chosen) ?? hers[0] ?? null;
}
const synth = () => (typeof speechSynthesis === 'undefined' ? null : speechSynthesis);
/** Quotation marks are not read aloud; dashes read as a pause. */
export const spoken = (text: string) => text.replace(/[«»“”"]/g, '').replace(/\s+[—–]\s+/g, ', ');

/** A human voice the server offers. */
export interface HumanVoice {
  id: string;
  name: string;
  about: string;
}
/** undefined while asking the server; null when it has no human voice. */
let human: HumanVoice[] | null | undefined;
let asking: Promise<HumanVoice[] | null> | null = null;
const listeners = new Set<() => void>();
const isHumanVoice = (value: unknown): value is HumanVoice =>
  !!value &&
  typeof value === 'object' &&
  ['id', 'name', 'about'].every(
    (key) => typeof (value as Record<string, unknown>)[key] === 'string',
  );
async function ask(path: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
    return null;
  const body: unknown = await response.json();
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
}
/** Asks the server once whether it offers a human voice for Oyu, and which ones. */
export function loadHumanVoices() {
  asking ??= (async () => {
    try {
      if ((await ask('/__lookluxe/voice/status'))?.configured !== true) return null;
      const body = await ask('/__lookluxe/voice/voices');
      const voices = Array.isArray(body?.voices) ? body.voices.filter(isHumanVoice) : [];
      return voices.length ? voices : null;
    } catch {
      return null;
    }
  })().then((voices) => {
    human = voices;
    if (voices) wakeOnGesture();
    for (const listener of listeners) listener();
    return voices;
  });
  return asking;
}

let output: AudioContext | null = null;
/** The page's sound output for the human voice, made on first use. */
function audio() {
  if (output) return output;
  const Context =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  // On an iPhone, play even with the ring switch on silent, like a video would.
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  output = new Context();
  return output;
}
/**
 * Browsers start a page's sound only from a tap or key press. Oyu speaks seconds after one, so
 * the first gesture on the page starts the sound output for her.
 */
function wakeOnGesture() {
  const gestures = ['pointerdown', 'keydown', 'touchend'];
  const wake = () => {
    try {
      const context = audio();
      if (!context || context.state === 'running')
        for (const type of gestures) window.removeEventListener(type, wake, true);
      else void context.resume().catch(() => undefined);
    } catch {
      /* no sound output here */
    }
  };
  for (const type of gestures)
    window.addEventListener(type, wake, { capture: true, passive: true });
}

/** Spoken lines kept for this visit: Oyu repeats herself, and a repeat should start at once. */
const clips = new Map<string, Promise<AudioBuffer>>();
function clip(text: string, language: Lang, voice: string, context: AudioContext) {
  const key = `${voice}\n${language}\n${text}`;
  const kept = clips.get(key);
  if (kept) {
    clips.delete(key);
    clips.set(key, kept);
    return kept;
  }
  const made = (async () => {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 12_000);
    try {
      const response = await fetch('/__lookluxe/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text, lang: language, voice }),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: timeout.signal,
      });
      if (!response.ok) throw new Error(`Oyu voice ${response.status}`);
      return await context.decodeAudioData(await response.arrayBuffer());
    } finally {
      clearTimeout(timer);
    }
  })();
  clips.set(key, made);
  made.catch(() => clips.delete(key));
  if (clips.size > 24) clips.delete(clips.keys().next().value as string);
  return made;
}

let turn = 0;
let playing: AudioBufferSourceNode | null = null;
/** After the human voice fails (no credits, no network), the browser speaks for a minute. */
let restUntil = 0;
function silence() {
  try {
    playing?.stop();
  } catch {
    /* already ended */
  }
  playing = null;
  try {
    synth()?.cancel();
  } catch {
    /* nothing to stop */
  }
}
/** Plays the line in her human voice; false when the page cannot play sound yet. */
async function sayHuman(text: string, language: Lang, voices: HumanVoice[], id: number) {
  const context = audio();
  if (!context) return false;
  const chosen = getOyuSettings().voiceId;
  const voice = voices.find((option) => option.id === chosen)?.id ?? voices[0].id;
  const buffer = await clip(text, language, voice, context);
  // Superseded while it was on its way: the newer line speaks instead.
  if (id !== turn) return true;
  if (context.state !== 'running')
    await Promise.race([
      context.resume(),
      new Promise((resolve) => setTimeout(resolve, 400)),
    ]).catch(() => undefined);
  if (id !== turn) return true;
  if (context.state !== 'running') return false;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => {
    if (playing === source) playing = null;
  };
  playing = source;
  source.start();
  return true;
}
function sayWithBrowser(text: string, language: Lang) {
  const engine = synth();
  const voice = engine && pickVoice(engine.getVoices(), language, getOyuSettings().voiceName);
  if (!engine || !voice) return;
  engine.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  // The voice's own pitch and an unhurried pace sound most natural; raising the pitch makes
  // synthetic voices sound more robotic, not more feminine.
  utterance.pitch = 1;
  utterance.rate = 0.97;
  engine.speak(utterance);
}

/**
 * Says `text` in the voice chosen in Settings, cutting off whatever Oyu was saying before.
 * Speech is a nicety: if anything misbehaves, Oyu simply stays silent rather than disturb
 * the page.
 */
export function speak(text: string, language: Lang) {
  const line = spoken(text);
  const id = ++turn;
  silence();
  void (async () => {
    const voices = human === undefined ? await loadHumanVoices() : human;
    if (id !== turn) return;
    if (voices && Date.now() >= restUntil) {
      try {
        if (await sayHuman(line, language, voices, id)) return;
      } catch {
        restUntil = Date.now() + 60_000;
      }
      if (id !== turn) return;
    }
    sayWithBrowser(line, language);
  })().catch(() => undefined);
}
export const hush = () => {
  turn++;
  silence();
};

/** Oyu's browser voices on this device for a language, most natural first (they load late). */
export function useVoices(language: Lang) {
  const read = () => voicesFor(synth()?.getVoices() ?? [], language);
  const [voices, setVoices] = useState(read);
  useEffect(() => {
    const engine = synth();
    if (!engine) return;
    const update = () => setVoices(read());
    update();
    engine.addEventListener('voiceschanged', update);
    return () => engine.removeEventListener('voiceschanged', update);
  }, [language]);
  return voices;
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
/** The human voices the server offers: undefined while asking, null when it has none. */
export function useHumanVoices() {
  const voices = useSyncExternalStore(
    subscribe,
    () => human,
    () => undefined,
  );
  useEffect(() => {
    void loadHumanVoices();
  }, []);
  return voices;
}
/** Whether Oyu can speak `language` here, in a human voice or with a browser voice. */
export function useVoiceReady(language: Lang) {
  const humanVoices = useHumanVoices();
  const browserVoices = useVoices(language);
  return !!humanVoices || browserVoices.length > 0;
}
