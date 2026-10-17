import { describe, expect, it } from 'vitest';
import { isCompleteLook, localDate, makeDemo, recommend } from '../src/lib/demo';
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
  it('uses local calendar dates instead of UTC', () => {
    const date = new Date(2026, 9, 15, 0, 30);
    expect(localDate(date)).toBe('2026-10-15');
  });
  it('keeps generated sample collections independent', () => {
    const first = makeDemo();
    const second = makeDemo();
    first.garments.pop();
    first.savedLooks[0].garmentIds.pop();
    expect(second.garments).toHaveLength(6);
    expect(second.savedLooks[0].garmentIds).toHaveLength(3);
    expect(second.analyses.every((a) => a.sample)).toBe(true);
  });
});
