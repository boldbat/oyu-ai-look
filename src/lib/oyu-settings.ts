import { useSyncExternalStore } from 'react';

/** Oyu preferences for this device. Like the camera mirror choice, they never leave the browser. */
export interface OyuSettings {
  /** The floating companion on every page except live try-on. */
  companion: boolean;
  /** Oyu on the live try-on stage. */
  live: boolean;
  /** On-device body awareness during live try-on (framing, turning, poses). */
  vision: boolean;
  /** Oyu reads her live try-on lines aloud. Off until the user turns it on. */
  voice: boolean;
}
const KEY = 'oyu.settings.v1';
const defaults: OyuSettings = { companion: true, live: true, vision: true, voice: false };
const listeners = new Set<() => void>();

function read(): OyuSettings {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const value = (key: keyof OyuSettings) =>
      stored && typeof stored === 'object' && typeof (stored as OyuSettings)[key] === 'boolean'
        ? (stored as OyuSettings)[key]
        : defaults[key];
    return {
      companion: value('companion'),
      live: value('live'),
      vision: value('vision'),
      voice: value('voice'),
    };
  } catch {
    return { ...defaults };
  }
}
let current = read();

export function setOyuSettings(patch: Partial<OyuSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* kept for this visit only */
  }
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed them.
  const sync = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    current = read();
    listener();
  };
  window.addEventListener('storage', sync);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', sync);
  };
}
export function useOyuSettings(): OyuSettings {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => defaults,
  );
}
