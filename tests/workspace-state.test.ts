import { describe, expect, it } from 'vitest';
import { makeDemo } from '../src/lib/demo';
import {
  archiveGarment,
  isCalendarDate,
  parseWorkspace,
  recordWear,
  restoreGarment,
} from '../src/lib/workspace';

describe('stored workspace validation', () => {
  it('round-trips the current shape and accepts the old shape without archives', () => {
    const workspace = makeDemo();
    expect(parseWorkspace(JSON.stringify(workspace))).toEqual(workspace);
    const { archivedGarments: _archived, ...oldWorkspace } = workspace;
    expect(parseWorkspace(JSON.stringify(oldWorkspace))).toEqual(workspace);
  });

  it.each(['not json', 'null', '[]', '{}', '{"garments":[null]}'])(
    'rejects malformed data: %s',
    (raw) => {
      expect(parseWorkspace(raw)).toBeNull();
    },
  );

  it('rejects invalid nested objects, duplicate identities and broken references', () => {
    const workspace = makeDemo();
    const invalid = [
      { ...workspace, garments: [{ ...workspace.garments[0], name: 7 }] },
      { ...workspace, garments: [{ ...workspace.garments[0], category: 'unknown' }] },
      { ...workspace, garments: [{ ...workspace.garments[0], availability: ['available'] }] },
      { ...workspace, archivedGarments: [workspace.garments[0]] },
      { ...workspace, archivedGarments: null },
      { ...workspace, preferences: { ...workspace.preferences, styles: 'Minimal' } },
      { ...workspace, preferences: { ...workspace.preferences, theme: 'unknown' } },
      { ...workspace, preferences: { ...workspace.preferences, theme: ['light'] } },
      { ...workspace, savedLooks: [{ ...workspace.savedLooks[0], garmentIds: ['unknown'] }] },
      { ...workspace, wearLogs: [{ ...workspace.wearLogs[0], date: '2026-02-30' }] },
      { ...workspace, analyses: [{ ...workspace.analyses[0], dimensions: null }] },
      { ...workspace, analyses: [{ ...workspace.analyses[0], overall: 101 }] },
    ];
    for (const state of invalid) expect(parseWorkspace(JSON.stringify(state))).toBeNull();
  });
});

describe('wear record boundaries', () => {
  const today = '2026-10-15';
  it('accepts valid leap dates and rejects rollover, empty and malformed dates', () => {
    expect(isCalendarDate('2024-02-29')).toBe(true);
    for (const date of ['', '2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '0000-01-01']) {
      expect(isCalendarDate(date)).toBe(false);
      expect(() => recordWear(makeDemo(), date, [], today)).toThrow(RangeError);
    }
  });

  it('rejects future dates, unknown pieces, duplicate pieces and oversized logs', () => {
    const data = makeDemo();
    expect(() => recordWear(data, '2026-10-16', [], today)).toThrow(RangeError);
    expect(() => recordWear(data, today, ['unknown'], today)).toThrow(RangeError);
    expect(() => recordWear(data, today, ['navy-top', 'navy-top'], today)).toThrow(RangeError);
    const garments = Array.from({ length: 21 }, (_, index) => ({
      ...data.garments[0],
      id: `piece-${index}`,
    }));
    expect(() =>
      recordWear(
        { ...data, garments },
        today,
        garments.map((g) => g.id),
        today,
      ),
    ).toThrow(RangeError);
  });

  it('copies selections, retains existing record identity, and clears only the requested day', () => {
    const original = {
      ...makeDemo(),
      wearLogs: [{ id: 'past', date: '2026-10-01', garmentIds: ['navy-top'] }],
    };
    const ids = ['navy-top'];
    const created = recordWear(original, today, ids, today);
    ids.push('white-sneakers');
    expect(created.wearLogs.find((log) => log.date === today)?.garmentIds).toEqual(['navy-top']);
    const edited = recordWear(created, today, ['stone-trousers'], today);
    expect(edited.wearLogs.find((log) => log.date === today)?.id).toBe(
      created.wearLogs.find((log) => log.date === today)?.id,
    );
    expect(recordWear(edited, today, [], today).wearLogs).toEqual(original.wearLogs);
    expect(original.wearLogs.some((log) => log.date === today)).toBe(false);
  });
});

describe('archived garment history', () => {
  it('preserves saved look and wear references across archive and restore', () => {
    const original = makeDemo();
    const archived = archiveGarment(original, 'navy-top');
    expect(original.archivedGarments).toEqual([]);
    expect(archived.garments.some((g) => g.id === 'navy-top')).toBe(false);
    expect(archived.archivedGarments.map((g) => g.id)).toEqual(['navy-top']);
    expect(archived.wearLogs).toBe(original.wearLogs);
    expect(archived.savedLooks).toBe(original.savedLooks);
    expect(parseWorkspace(JSON.stringify(archived))).toEqual(archived);
    const restored = restoreGarment(archived, 'navy-top');
    expect(restored.garments.find((g) => g.id === 'navy-top')).toEqual(original.garments[0]);
    expect(restored.archivedGarments).toEqual([]);
    expect(restored.wearLogs).toBe(original.wearLogs);
    expect(restored.savedLooks).toBe(original.savedLooks);
    expect(archiveGarment(archived, 'navy-top')).toBe(archived);
    expect(restoreGarment(original, 'missing')).toBe(original);
  });

  it('retains archived pieces when editing their historical day but rejects newly assigning them', () => {
    const initial = recordWear(
      { ...makeDemo(), wearLogs: [] },
      '2026-10-10',
      ['navy-top', 'white-sneakers'],
      '2026-10-15',
    );
    const archived = archiveGarment(initial, 'navy-top');
    const edited = recordWear(archived, '2026-10-10', ['navy-top', 'stone-trousers'], '2026-10-15');
    expect(edited.wearLogs.find((log) => log.date === '2026-10-10')?.garmentIds).toEqual([
      'navy-top',
      'stone-trousers',
    ]);
    expect(() => recordWear(archived, '2026-10-15', ['navy-top'], '2026-10-15')).toThrow(
      RangeError,
    );
    expect(
      recordWear(edited, '2026-10-10', [], '2026-10-15').wearLogs.some(
        (log) => log.date === '2026-10-10',
      ),
    ).toBe(false);
  });
});
