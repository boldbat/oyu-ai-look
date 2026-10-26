import { afterEach, describe, expect, it } from 'vitest';
import { lang, localized, setLang, t } from '../src/lib/lang';
import { localizeSample, makeDemo } from '../src/lib/demo';
import { colorLabel, formatDate, kindLabel, weekdayShort } from '../src/lib/i18n';
import { categoryLabels } from '../src/lib/types';
import {
  appliedLine,
  liveLines,
  lingerLine,
  nextToTry,
  phrase,
  ratingLabels,
  ratingLine,
  reviewGarment,
  reviewLook,
  reviewWeek,
  visionLine,
} from '../src/lib/oyu';
import type { PoseEvent } from '../src/lib/oyu-vision';
import { tryOnCategories } from '../src/lib/types';

const cyrillic = /[А-Яа-яӨөҮүЁё]/;
afterEach(() => setLang('mn'));

describe('language switch', () => {
  it('defaults to Mongolian and switches both ways', () => {
    expect(lang()).toBe('mn');
    expect(t('Сайн уу', 'Hello')).toBe('Сайн уу');
    setLang('en');
    expect(t('Сайн уу', 'Hello')).toBe('Hello');
    setLang('mn');
    expect(t('Сайн уу', 'Hello')).toBe('Сайн уу');
  });

  it('keeps label tables in step with the language', () => {
    const table = localized({ a: ['Нэг', 'One'] });
    expect(table.a).toBe('Нэг');
    expect(categoryLabels.top).toBe('Цамц');
    setLang('en');
    expect(table.a).toBe('One');
    expect(Object.keys(table)).toEqual(['a']);
    expect(categoryLabels.top).toBe('Tops');
    expect(ratingLabels.polish).toBe('Elegance');
    expect(colorLabel('Navy')).toBe('Navy');
    expect(kindLabel('Blazer')).toBe('Blazer');
  });

  it('formats dates in the current language', () => {
    const day = '2026-10-25';
    expect(formatDate(day, 'year')).toBe('2026 оны 10-р сарын 25');
    setLang('en');
    expect(formatDate(day, 'year')).toBe('25 October 2026');
    expect(formatDate(day, 'weekday')).toBe('Sunday 25 October');
    expect(weekdayShort(day)).toBe('Su');
  });
});

describe('sample data in English', () => {
  it('shows sample names in English without changing what is stored', () => {
    const stored = makeDemo();
    expect(localizeSample(stored)).toBe(stored);
    const english = { ...stored, preferences: { ...stored.preferences, language: 'en' as const } };
    const shown = localizeSample(english);
    const name = (id: string) => shown.garments.find((g) => g.id === id)!.name;
    expect(name('navy-blazer')).toBe('Navy double-breasted blazer');
    for (const g of shown.garments) expect(g.name).not.toMatch(cyrillic);
    for (const look of shown.savedLooks) expect(look.name).not.toMatch(cyrillic);
    for (const a of shown.analyses) expect(`${a.title} ${a.note}`).not.toMatch(cyrillic);
    expect(stored.garments.find((g) => g.id === 'navy-blazer')!.name).toMatch(cyrillic);
  });

  it('keeps a name the user changed', () => {
    const stored = makeDemo();
    stored.garments[0] = { ...stored.garments[0], name: 'Миний дуртай цамц' };
    const shown = localizeSample({
      ...stored,
      preferences: { ...stored.preferences, language: 'en' },
    });
    expect(shown.garments[0].name).toBe('Миний дуртай цамц');
  });
});

describe('Oyu in English', () => {
  const data = localizeSample({
    ...makeDemo(),
    preferences: { ...makeDemo().preferences, language: 'en' },
  });
  const prefs = data.preferences;
  const byId = (id: string) => data.garments.find((g) => g.id === id)!;
  const tryable = data.garments.filter((g) => tryOnCategories.includes(g.category));

  it('names pieces colour first, with verbs that agree', () => {
    setLang('en');
    expect(phrase(byId('navy-blazer'))).toBe('navy blazer');
    expect(phrase(byId('denim-jacket'))).toBe('denim jacket');
    expect(phrase(byId('floral-dress'))).toBe('tea dress');
    const trousers = ratingLine(byId('wide-leg-trousers'), prefs).text;
    expect(trousers).toContain('The cream trousers really suit you');
    const coat = ratingLine(byId('tweed-jacket'), prefs).text;
    expect(coat).toMatch(/really suits you/);
  });

  it('speaks English everywhere, with no Mongolian left', () => {
    setLang('en');
    const session = { scores: [] as number[], said: new Set<string>() };
    const lines: string[] = [];
    for (const g of tryable) {
      const next = nextToTry(g, tryable, [], prefs);
      const line = appliedLine(g, prefs, next, session);
      session.scores.push(line.score!);
      lines.push(line.text, ratingLine(g, prefs).text);
      for (const step of [0, 1])
        for (const vision of [true, false])
          lines.push(lingerLine(g, prefs, next, step, { vision, turned: false }).text);
      lines.push(...reviewGarment(g, data).lines);
    }
    const events: PoseEvent[] = [
      'absent',
      'returned',
      'step-back',
      'framed',
      'spin',
      'back',
      'hand-raised',
      'arms-up',
      'hand-on-hip',
    ];
    for (const event of events)
      for (const stage of ['preview', 'live'] as const)
        for (const need of ['torso', 'legs'] as const)
          lines.push(visionLine(event, { stage, need }).text);
    const picks = [{ garment: byId('navy-blazer'), score: 9.1 }];
    lines.push(
      liveLines.greeting('Alex').text,
      liveLines.preview().text,
      liveLines.dim().text,
      liveLines.connecting().text,
      liveLines.upload().text,
      liveLines.compare().text,
      liveLines.summary(picks, 1).text,
      liveLines.summary(picks, 3).text,
      ...reviewLook([byId('oxford-shirt'), byId('grey-trousers')], prefs)!.lines,
      ...reviewWeek(data).lines,
      ...reviewWeek({ ...data, wearLogs: [] }).lines,
    );
    for (const line of lines) expect(line, line).not.toMatch(cyrillic);
    expect(liveLines.summary(picks, 3).text).toBe(
      'You tried on 3 pieces today. My top pick is “Navy double-breasted blazer”.',
    );
  });
});

describe('Oyu across a language switch', () => {
  it('writes each line in both languages with the same wording', async () => {
    const { appliedLine, inBoth } = await import('../src/lib/oyu');
    const { inLanguage } = await import('../src/lib/lang');
    const data = makeDemo();
    const blazer = data.garments.find((g) => g.id === 'navy-blazer')!;
    const said = new Set<string>();
    const first = inBoth(
      () => appliedLine(blazer, data.preferences, null, { scores: [], said }),
      said,
    );
    expect(first.mn.text).toMatch(cyrillic);
    expect(first.en.text).not.toMatch(cyrillic);
    expect(first.mn.score).toBe(first.en.score);
    const remembered = new Set(said);
    // The same template in both: saying it again picks a new one in each language.
    const second = inBoth(
      () => appliedLine(blazer, data.preferences, null, { scores: [9], said }),
      said,
    );
    expect(second.en.text).not.toBe(first.en.text);
    expect(said.size).toBeGreaterThan(remembered.size);
    expect(inLanguage('en', () => t('Сайн уу', 'Hello'))).toBe('Hello');
    expect(lang()).toBe('mn');
  });

  it('names a sample piece in the current language, and keeps a name the user gave', async () => {
    const { nameOf } = await import('../src/lib/demo');
    const blazer = makeDemo().garments.find((g) => g.id === 'navy-blazer')!;
    expect(nameOf(blazer)).toBe(blazer.name);
    setLang('en');
    expect(nameOf(blazer)).toBe('Navy double-breasted blazer');
    expect(nameOf({ ...blazer, name: 'Navy double-breasted blazer' })).toBe(
      'Navy double-breasted blazer',
    );
    expect(nameOf({ ...blazer, name: 'My lucky blazer' })).toBe('My lucky blazer');
    setLang('mn');
    expect(nameOf({ ...blazer, name: 'Navy double-breasted blazer' })).toBe(blazer.name);
  });
});

describe('Oyu’s voice', () => {
  it('picks a warm voice for the language, or none', async () => {
    const { pickVoice, spoken } = await import('../src/lib/oyu-voice');
    const voices = [
      { name: 'Fred', lang: 'en-US', localService: true },
      { name: 'Google UK English Female', lang: 'en-GB', localService: false },
      { name: 'Samantha', lang: 'en-US', localService: true },
      { name: 'Thomas', lang: 'fr-FR', localService: true },
    ];
    expect(pickVoice(voices, 'en')?.name).toBe('Samantha');
    expect(pickVoice(voices.slice(0, 2), 'en')?.name).toBe('Google UK English Female');
    expect(pickVoice([voices[0]], 'en')?.name).toBe('Fred');
    expect(pickVoice(voices, 'mn')).toBeNull();
    expect(pickVoice([{ name: 'Mongolian', lang: 'mn-MN', localService: true }], 'mn')?.name).toBe(
      'Mongolian',
    );
    expect(spoken('My pick: “Navy blazer” — try it')).toBe('My pick: Navy blazer, try it');
  });
});
