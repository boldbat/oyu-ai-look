import type { Preferences } from './types';

export const CLOUD_PREFERENCE_STYLES = [
  'Minimal',
  'Classic',
  'Casual',
  'Business',
  'Street',
  'Romantic',
  'Sporty',
  'Formal',
] as const;

export function parseCloudPreferences(value: unknown): Preferences | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).length !== 4 ||
    typeof data.name !== 'string' ||
    !data.name.trim() ||
    data.name.length > 40 ||
    !Array.isArray(data.styles) ||
    data.styles.length > 3 ||
    new Set(data.styles).size !== data.styles.length ||
    !data.styles.every(
      (style) =>
        typeof style === 'string' && CLOUD_PREFERENCE_STYLES.some((item) => item === style),
    ) ||
    !['light', 'dark', 'system'].includes(data.theme as string) ||
    !['en', 'mn'].includes(data.language as string)
  )
    return null;
  return {
    name: data.name.trim(),
    styles: [...data.styles],
    theme: data.theme as Preferences['theme'],
    language: data.language as Preferences['language'],
  };
}
