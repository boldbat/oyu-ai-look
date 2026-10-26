import { useEffect, useState } from 'react';
import type { Lang } from './lang';

/**
 * Oyu's voice: her lines read aloud by the browser's own speech synthesis, so nothing is sent
 * anywhere. Every browser ships English voices; a Mongolian one is rare, so in Mongolian Oyu
 * speaks only on a device that has one.
 */
type Voice = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>;

/** Warm, natural-sounding voices, best first (macOS, Chrome, Edge and Windows names). */
const preferred = [
  'Samantha',
  'Ava',
  'Allison',
  'Susan',
  'Serena',
  'Karen',
  'Moira',
  'Tessa',
  'Google US English',
  'Google UK English Female',
  'Microsoft Aria',
  'Microsoft Jenny',
  'Microsoft Zira',
];
/** The voice Oyu uses for a language, or null when the device has none. */
export function pickVoice<V extends Voice>(voices: V[], language: Lang): V | null {
  const matching = voices.filter((voice) => voice.lang.toLowerCase().startsWith(language));
  for (const name of preferred) {
    const voice = matching.find((candidate) => candidate.name.includes(name));
    if (voice) return voice;
  }
  return matching.find((voice) => voice.localService) ?? matching[0] ?? null;
}
const synth = () => (typeof speechSynthesis === 'undefined' ? null : speechSynthesis);
export const canSpeak = (language: Lang) => !!pickVoice(synth()?.getVoices() ?? [], language);
/** Quotation marks are not read aloud; dashes read as a pause. */
export const spoken = (text: string) => text.replace(/[«»“”"]/g, '').replace(/\s+[—–]\s+/g, ', ');

/**
 * Says `text`, cutting off whatever Oyu was saying before. Speech is a nicety: if the browser's
 * speech engine misbehaves, Oyu simply stays silent rather than disturb the page.
 */
export function speak(text: string, language: Lang) {
  try {
    const engine = synth();
    const voice = engine && pickVoice(engine.getVoices(), language);
    if (!engine || !voice) return;
    engine.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken(text));
    utterance.voice = voice;
    utterance.lang = voice.lang;
    // A touch brighter and quicker than the default, closer to Oyu's character.
    utterance.pitch = 1.15;
    utterance.rate = 1.03;
    engine.speak(utterance);
  } catch {
    /* no voice this time */
  }
}
export const hush = () => {
  try {
    synth()?.cancel();
  } catch {
    /* nothing to stop */
  }
};

/** Whether this device has a voice for `language` (browsers load their voices late). */
export function useVoiceReady(language: Lang) {
  const [ready, setReady] = useState(() => canSpeak(language));
  useEffect(() => {
    const engine = synth();
    if (!engine) return;
    const update = () => setReady(canSpeak(language));
    update();
    engine.addEventListener('voiceschanged', update);
    return () => engine.removeEventListener('voiceschanged', update);
  }, [language]);
  return ready;
}
