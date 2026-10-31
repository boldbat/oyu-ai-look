import { describe, expect, it } from 'vitest';
import { finishingTouches, isCompleteLook, localDate, makeDemo, recommend } from '../src/lib/demo';
import { lookReasons } from '../src/lib/style';
import type { Garment } from '../src/lib/types';

describe('outfit rules', () => {
  const garments = makeDemo().garments;
  const basic = ['navy-top', 'stone-trousers', 'white-sneakers'];
  const dress: Garment = { ...garments[0], id: 'dress', category: 'dress', name: 'A dress' };
  it('accepts complete separates and dress outfits', () => {
    expect(isCompleteLook(basic, garments)).toBe(true);
    expect(isCompleteLook(['dress', 'white-sneakers'], [...garments, dress])).toBe(true);
  });
  it('rejects missing, duplicate, unknown and incompatible pieces', () => {
    for (const ids of [
      [],
      ['navy-top'],
      [...basic, 'navy-top'],
      [...basic, 'missing'],
      [...basic, 'dress'],
      [...basic, 'beige-top'],
    ]) {
      expect(isCompleteLook(ids, [...garments, dress])).toBe(false);
    }
  });
  it('never suggests laundry pieces', () => {
    const inventory = garments.map((g) => ({
      ...g,
      availability: g.id === 'navy-top' ? ('laundry' as const) : g.availability,
    }));
    for (let i = 0; i < 12; i++) {
      const items = recommend(inventory, i);
      expect(items.every((g) => g.availability === 'available')).toBe(true);
      expect(
        isCompleteLook(
          items.map((g) => g.id),
          inventory,
        ),
      ).toBe(true);
    }
  });
  it('recommends a dress when separates are unavailable', () => {
    const inventory = [dress, garments.find((g) => g.id === 'white-sneakers')!];
    const ids = recommend(inventory).map((g) => g.id);
    expect(ids).toEqual(['dress', 'white-sneakers']);
    expect(isCompleteLook(ids, inventory)).toBe(true);
  });
  it('offers different combinations without creating missing garments', () => {
    const a = recommend(garments, 0).map((g) => g.id);
    const b = recommend(garments, 1).map((g) => g.id);
    expect(a).not.toEqual(b);
    expect(recommend([])).toEqual([]);
  });
  it('suggests varied, complete looks across the expanded sample wardrobe', () => {
    const looks = Array.from({ length: 8 }, (_, i) => recommend(garments, i));
    for (const look of looks) {
      expect(
        isCompleteLook(
          look.map((g) => g.id),
          garments,
        ),
      ).toBe(true);
      expect(lookReasons(look).length).toBeGreaterThan(0);
      const extras = finishingTouches(look, garments, 0);
      expect(
        isCompleteLook(
          [...look, ...extras].map((g) => g.id),
          garments,
        ),
      ).toBe(true);
    }
    expect(new Set(looks.map((look) => look.map((g) => g.id).join())).size).toBe(8);
    const womens = Array.from({ length: 8 }, (_, i) => recommend(garments, i, 'women'));
    expect(womens.some((look) => look.some((g) => g.category === 'dress'))).toBe(true);
  });
  it('never mixes womenswear and menswear in one suggestion', () => {
    for (const audience of ['all', 'women', 'men'] as const) {
      for (let i = 0; i < 12; i++) {
        const look = recommend(garments, i, audience);
        const outfit = [...look, ...finishingTouches(look, garments, i, audience)];
        const cuts = new Set(outfit.map((g) => g.audience ?? 'unisex'));
        expect(cuts.has('women') && cuts.has('men')).toBe(false);
        if (audience !== 'all')
          expect(cuts.has(audience === 'women' ? 'men' : 'women')).toBe(false);
      }
    }
    const alternating = [0, 1, 2, 3].map((i) => recommend(garments, i, 'all'));
    expect(alternating.some((look) => look.some((g) => g.audience === 'women'))).toBe(true);
    expect(alternating.some((look) => look.some((g) => g.audience === 'men'))).toBe(true);
  });
  it('only adds finishing touches to complete, available looks', () => {
    expect(finishingTouches(garments.slice(0, 1), garments)).toEqual([]);
    const look = recommend(garments, 0);
    const laundry = garments.map((g) => ({ ...g, availability: 'laundry' as const }));
    expect(finishingTouches(look, laundry)).toEqual([]);
  });
  it('uses local calendar dates instead of UTC', () => {
    const date = new Date(2026, 9, 15, 0, 30);
    expect(localDate(date)).toBe('2026-10-15');
  });
  it('keeps generated sample collections independent', () => {
    const first = makeDemo();
    const second = makeDemo();
    first.garments.pop();
    first.savedLooks[0].garmentIds.pop();
    expect(second.garments).toHaveLength(51);
    expect(second.savedLooks[0].garmentIds).toHaveLength(3);
    expect(second.analyses.every((a) => a.sample)).toBe(true);
  });
});
