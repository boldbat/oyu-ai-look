import { describe, expect, it } from 'vitest';
import { makeDemo } from '../src/lib/demo';
import {
  appliedLine,
  band,
  lookAddition,
  rateLook,
  liveLines,
  lingerLine,
  nextToTry,
  phrase,
  rateGarment,
  ratingLine,
  reviewGarment,
  reviewLook,
  reviewWeek,
  visionLine,
} from '../src/lib/oyu';
import type { PoseEvent } from '../src/lib/oyu-vision';
import { tryOnCategories } from '../src/lib/types';

const data = makeDemo();
const prefs = data.preferences;
const byId = (id: string) => data.garments.find((g) => g.id === id)!;
const tryable = data.garments.filter((g) => tryOnCategories.includes(g.category));
/** Oyu speaks Mongolian; only names, style names and "Oyu"/"AI" stay in Latin script. */
const latinAllowed =
  /\b(Oyu|AI|Old money|Minimal|Classic|Casual|Business|Street|Romantic|Sporty|Formal)\b/g;
const mongolianOnly = (text: string) => !/[A-Za-z]/.test(text.replace(latinAllowed, ''));

describe('Oyu ratings', () => {
  it('scores every piece between 6 and 9.9 with one decimal, the same every time', () => {
    for (const g of data.garments) {
      const rating = rateGarment(g, prefs);
      for (const value of Object.values(rating)) {
        expect(value).toBeGreaterThanOrEqual(6);
        expect(value).toBeLessThanOrEqual(9.9);
        expect(Math.round(value * 10)).toBe(value * 10);
      }
      expect(rateGarment(g, prefs)).toEqual(rating);
    }
  });

  it('rates pieces that suit the chosen styles higher', () => {
    const blazer = byId('navy-blazer');
    const classic = rateGarment(blazer, { ...prefs, styles: ['Classic', 'Minimal'] }).overall;
    const street = rateGarment(blazer, { ...prefs, styles: ['Street'] }).overall;
    expect(classic).toBeGreaterThan(street);
  });

  it('spreads the sample wardrobe across all three reactions', () => {
    const bands = new Set(tryable.map((g) => band(rateGarment(g, prefs).overall)));
    expect(bands).toEqual(new Set(['love', 'like', 'ok']));
  });
});

describe('Oyu in live try-on', () => {
  it('suggests something else only when a piece is not the best fit', () => {
    for (const g of tryable) {
      const next = nextToTry(g, tryable, [], prefs);
      const line = appliedLine(g, prefs, next);
      expect(line.score).toBe(rateGarment(g, prefs).overall);
      expect(mongolianOnly(line.text.replace(next?.name ?? '', ''))).toBe(true);
      if (band(line.score!) === 'ok') expect(line.suggest).toBe(next);
      else expect(line.suggest).toBeUndefined();
    }
  });

  it('never suggests the current piece, a tried one, or one cut for someone else', () => {
    const dress = byId('emerald-gown');
    const tried = ['black-dress', 'slip-dress'];
    for (let i = 0; i < 5; i++) {
      const next = nextToTry(dress, tryable, tried, prefs)!;
      expect(next.id).not.toBe(dress.id);
      expect(tried).not.toContain(next.id);
      expect(next.audience).not.toBe('men');
      tried.push(next.id);
    }
    expect(nextToTry(dress, [dress], [], prefs)).toBeNull();
  });

  it('names each piece in plain Mongolian, colour first', () => {
    expect(phrase(byId('navy-blazer'))).toBe('хар хөх пиджак');
    expect(phrase(byId('cream-cable-knit'))).toBe('цөцгий өнгийн сүлжмэл цамц');
    expect(phrase(byId('blue-jeans'))).toBe('жинсэн өмд');
    expect(phrase(byId('floral-dress'))).toBe('цэцэгтэй даашинз');
    expect(phrase({ ...byId('white-tee'), kind: undefined })).toBe('цагаан цамц');
  });

  it('does not repeat itself within a session, and compares with the last piece', () => {
    const session = { scores: [] as number[], said: new Set<string>() };
    const texts: string[] = [];
    for (const g of tryable.filter((piece) => band(rateGarment(piece, prefs).overall) !== 'ok')) {
      const line = appliedLine(g, prefs, null, session);
      texts.push(line.text);
      session.scores.push(line.score!);
    }
    // A demo tries a handful of pieces: none of those lines repeat, and never two in a row.
    expect(new Set(texts.slice(0, 10)).size).toBe(10);
    texts.forEach((text, i) => expect(text).not.toBe(texts[i - 1]));
    const after = { scores: [8.3], said: new Set<string>() };
    expect(appliedLine(byId('oxford-shirt'), prefs, null, after).text).toMatch(
      /^Өмнөхөөсөө ч илүү гоё!/,
    );
  });

  it('follows up with a word about the piece, then a next piece', () => {
    const blazer = byId('navy-blazer');
    const next = nextToTry(blazer, tryable, [], prefs);
    expect(lingerLine(blazer, prefs, next, 0).suggest).toBeUndefined();
    expect(lingerLine(blazer, prefs, next, 1).suggest).toBe(next);
    const watching = { vision: true, turned: false };
    expect(lingerLine(blazer, prefs, next, 0, watching).text).toMatch(/эргэ/);
    expect(lingerLine(blazer, prefs, next, 0, { ...watching, turned: true }).text).not.toMatch(
      /эргэ/,
    );
  });

  it('has a Mongolian line for everything the camera notices', () => {
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
      for (const stage of ['preview', 'live'] as const) {
        const line = visionLine(event, { stage, need: 'legs' });
        expect(line.text.length).toBeGreaterThan(10);
        expect(mongolianOnly(line.text)).toBe(true);
      }
    expect(visionLine('step-back', { stage: 'live', need: 'legs' }).text).toMatch(/^Хөл/);
  });

  it('gives a rating card with a breakdown on request', () => {
    const line = ratingLine(byId('camel-coat'), prefs);
    expect(line.rating).toEqual(rateGarment(byId('camel-coat'), prefs));
    expect(mongolianOnly(line.text)).toBe(true);
  });

  it('speaks Mongolian on every step', () => {
    const lines = [
      liveLines.greeting('Alex'),
      liveLines.preview(),
      liveLines.dim(),
      liveLines.connecting(),
      liveLines.upload(),
      liveLines.compare(),
    ];
    for (const line of lines) expect(mongolianOnly(line.text.replace('Alex', ''))).toBe(true);
    const picks = [
      { garment: byId('navy-blazer'), score: 9.1 },
      { garment: byId('blue-jeans'), score: 8.2 },
    ];
    const summary = liveLines.summary(picks, 3);
    expect(summary.text).toContain('3 хувцас');
    expect(summary.text).toContain(byId('navy-blazer').name);
    expect(summary).toMatchObject({ score: 9.1, picks });
  });
});

describe('Oyu reviews', () => {
  it('reviews a look with a score and one way to improve it', () => {
    expect(reviewLook([], prefs)).toBeNull();
    const noShoes = reviewLook([byId('oxford-shirt'), byId('grey-trousers')], prefs)!;
    expect(noShoes.lines.at(-1)).toBe('Гутал нэмбэл бүрэн болно.');
    const full = reviewLook(
      [byId('oxford-shirt'), byId('grey-trousers'), byId('penny-loafers')],
      prefs,
    )!;
    expect(full.score).toBeGreaterThan(noShoes.score);
    for (const line of full.lines) expect(mongolianOnly(line)).toBe(true);
  });

  it('pairs a piece only with available pieces cut for the same person', () => {
    const laundry = {
      ...data,
      garments: data.garments.map((g) =>
        g.id === 'grey-trousers' ? { ...g, availability: 'laundry' as const } : g,
      ),
    };
    const review = reviewGarment(byId('oxford-shirt'), laundry);
    expect(review.pairs.length).toBeGreaterThan(0);
    for (const pair of review.pairs) {
      expect(pair.availability).toBe('available');
      expect(pair.audience).not.toBe('women');
    }
    expect(review.pairs.map((g) => g.id)).not.toContain('grey-trousers');
  });

  it('looks back at the week and suggests a piece to bring back', () => {
    const week = reviewWeek(data);
    expect(week.lines[0]).toMatch(
      /^Энэ долоо хоногт \d өдөр тэмдэглэж, \d+ өөр хувцас өмссөн байна\.$/,
    );
    expect(week.worn.length).toBeGreaterThan(0);
    const recent = new Set(data.wearLogs.flatMap((log) => log.garmentIds));
    expect(week.forgotten && recent.has(week.forgotten.id)).toBeFalsy();
    for (const line of week.lines) expect(mongolianOnly(line.replace(/«[^»]+»/g, ''))).toBe(true);
    const empty = reviewWeek({ ...data, wearLogs: [] });
    expect(empty.lines[0]).toMatch(/тэмдэглээгүй/);
    expect(empty.worn).toEqual([]);
  });

  it('rates an outfit higher as it comes together', () => {
    const top = byId('oxford-shirt');
    const trousers = byId('grey-trousers');
    const shoes = byId('penny-loafers');
    const coat = byId('charcoal-overcoat');
    const watch = byId('dress-watch');
    const partial = rateLook([top], prefs);
    const base = rateLook([top, trousers], prefs);
    const complete = rateLook([top, trousers, shoes], prefs);
    const finished = rateLook([top, trousers, shoes, coat, watch], prefs);
    expect(partial.complete).toBeLessThan(base.complete);
    expect(base.overall).toBeLessThan(complete.overall);
    expect(complete.overall).toBeLessThan(finished.overall);
    for (const value of Object.values(finished)) expect(value).toBeLessThanOrEqual(9.9);
    expect(reviewLook([top, trousers, shoes], prefs)!.score).toBe(complete.overall);
  });

  it('suggests the piece that completes an outfit first', () => {
    const top = byId('oxford-shirt');
    const add = (pieces: string[]) => lookAddition(pieces.map(byId), data);
    expect(add([])).toBeNull();
    expect(add(['oxford-shirt'])?.category).toBe('bottom');
    expect(add(['grey-trousers'])?.category).toBe('top');
    expect(add(['oxford-shirt', 'grey-trousers'])?.category).toBe('footwear');
    expect(add(['oxford-shirt', 'grey-trousers', 'penny-loafers'])?.category).toBe('outerwear');
    expect(
      add(['oxford-shirt', 'grey-trousers', 'penny-loafers', 'charcoal-overcoat'])?.category,
    ).toBe('accessory');
    expect(
      add(['oxford-shirt', 'grey-trousers', 'penny-loafers', 'charcoal-overcoat', 'dress-watch']),
    ).toBeNull();
    // A women's dress is completed with pieces a woman would wear, and one statement is enough.
    const shoes = add(['emerald-gown'])!;
    expect(shoes.category).toBe('footwear');
    expect(shoes.audience).not.toBe('men');
    expect(top.audience).not.toBe('women');
  });
});
