import { describe, expect, it } from 'vitest';
import { makeDemo } from '../src/lib/demo';
import { parseCloudPreferences } from '../src/lib/cloud-preferences-schema';

describe('preferences received from the cloud', () => {
  it('accepts current preferences and returns an independent copy', () => {
    const preferences = makeDemo().preferences;
    const parsed = parseCloudPreferences(preferences);
    expect(parsed).toEqual(preferences);
    expect(parsed).not.toBe(preferences);
    expect(parsed?.styles).not.toBe(preferences.styles);
  });

  it('rejects malformed data, unexpected fields, and unsupported choices', () => {
    const preferences = makeDemo().preferences;
    for (const invalid of [
      null,
      [],
      {},
      { ...preferences, name: '   ' },
      { ...preferences, name: 'x'.repeat(41) },
      { ...preferences, styles: 'Classic' },
      { ...preferences, styles: ['Classic', 'Classic'] },
      { ...preferences, styles: ['Classic', 'Business', 'Casual', 'Sporty'] },
      { ...preferences, styles: ['Unknown'] },
      { ...preferences, styles: [null] },
      { ...preferences, theme: ['light'] },
      { ...preferences, theme: 'unknown' },
      { ...preferences, language: 'unknown' },
      { ...preferences, photos: ['private-image'] },
    ])
      expect(parseCloudPreferences(invalid)).toBeNull();
  });

  it('accepts empty styles and trims the name without changing the input', () => {
    const preferences = { ...makeDemo().preferences, name: ' Alex ', styles: [] };
    expect(parseCloudPreferences(preferences)?.name).toBe('Alex');
    expect(preferences.name).toBe(' Alex ');
  });
});
