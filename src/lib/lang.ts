/**
 * The interface language: Mongolian (the default) or English.
 *
 * Every user-facing string is written in place as `t('Монгол', 'English')`, so both versions
 * sit side by side in the code. The language comes from the workspace preference; the store
 * sets it before anything renders, and a language change re-renders the app.
 *
 * Call `t` while rendering or in a function, never at module level: a string built when a
 * module loads would stay in the language of that moment. For label tables use `localized`.
 */
export type Lang = 'mn' | 'en';
export const languages: Lang[] = ['mn', 'en'];
let current: Lang = 'mn';

export const lang = (): Lang => current;
/** The text in the current language. */
export function t(mn: string, en: string): string {
  return current === 'en' ? en : mn;
}
/** Sets the language for the next render (the store calls this from the saved preference). */
export function setLang(next: Lang) {
  current = next === 'en' ? 'en' : 'mn';
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}
/**
 * Runs `make` as if `language` were current, for text that is built once but shown in
 * whichever language is current later (Oyu writes each line in both).
 */
export function inLanguage<T>(language: Lang, make: () => T): T {
  const saved = current;
  current = language;
  try {
    return make();
  } finally {
    current = saved;
  }
}
/**
 * A label table whose values follow the language, read like a plain record:
 * `categoryLabels.top` is "Цамц" or "Tops", whichever is current.
 */
export function localized<K extends string>(
  pairs: Record<K, readonly [mn: string, en: string]>,
): Record<K, string> {
  const table = {} as Record<K, string>;
  for (const key of Object.keys(pairs) as K[])
    Object.defineProperty(table, key, {
      enumerable: true,
      get: () => t(pairs[key][0], pairs[key][1]),
    });
  return table;
}
/** BCP 47 locale for dates and numbers. */
export const locale = () => (current === 'en' ? 'en-GB' : 'mn-MN');
