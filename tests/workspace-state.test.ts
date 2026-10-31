import { describe, expect, it } from 'vitest';
import { makeDemo } from '../src/lib/demo';
import {
  archiveGarment,
  isCalendarDate,
  parseWorkspace,
  recordWear,
  restoreGarment,
  upgradeSample,
} from '../src/lib/workspace';

describe('sample collection upgrade', () => {
  function legacyWorkspace() {
    const current = makeDemo();
    const legacy = current.garments.slice(0, 6).map(({ kind: _kind, ...g }) => ({
      ...g,
      image: `/assets/${g.id}.png`,
    }));
    return {
      ...current,
      garments: [
        ...legacy,
        { ...legacy[0], id: 'mine', name: 'My own shirt', image: 'data:image/png;base64,AAAA' },
      ],
      savedLooks: current.savedLooks.slice(0, 2),
      wearLogs: [
        ...current.wearLogs.filter((w) => ['wear-1', 'wear-2', 'wear-3'].includes(w.id)),
        {
          id: `wear-${current.wearLogs[1].date}`,
          date: current.wearLogs[1].date,
          garmentIds: ['mine'],
        },
      ],
      analyses: current.analyses.map((a) => ({
        ...a,
        image: a.image.replace('/looks/', '/').replace('.jpg', '.png'),
      })),
      sampleVersion: undefined,
    };
  }

  it('adds new sample pieces and moves sample photos without touching personal data', () => {
    const upgraded = upgradeSample(legacyWorkspace());
    const sample = makeDemo();
    expect(upgraded.sampleVersion).toBe(sample.sampleVersion);
    expect(upgraded.garments).toHaveLength(sample.garments.length + 1);
    expect(upgraded.garments.find((g) => g.id === 'navy-top')).toMatchObject({
      image: '/assets/wardrobe/navy-top.jpg',
      kind: 'Long-sleeve top',
    });
    expect(upgraded.garments.find((g) => g.id === 'mine')?.image).toBe(
      'data:image/png;base64,AAAA',
    );
    expect(upgraded.analyses.every((a) => a.image.startsWith('/assets/looks/'))).toBe(true);
    expect(upgraded.savedLooks).toHaveLength(sample.savedLooks.length);
    expect(upgraded.wearLogs.filter((w) => w.date === sample.wearLogs[1].date)).toEqual([
      expect.objectContaining({ garmentIds: ['mine'] }),
    ]);
    expect(parseWorkspace(JSON.stringify(upgraded))).toEqual(upgraded);
    expect(upgradeSample(upgraded)).toBe(upgraded);
  });

  it('repairs a collection saved with retired sample pieces', () => {
    const sample = makeDemo();
    const retired = {
      ...sample.garments[0],
      id: 'khaki-jacket',
      image: '/assets/wardrobe/khaki-jacket.jpg',
    };
    const navy = { ...sample.garments[0], favorite: false, image: '/assets/wardrobe/old.jpg' };
    const saved = {
      ...sample,
      garments: [navy, ...sample.garments.slice(1), retired],
      savedLooks: [
        {
          ...sample.savedLooks[2],
          garmentIds: ['khaki-jacket', ...sample.savedLooks[0].garmentIds],
        },
      ],
      wearLogs: [
        { ...sample.wearLogs[4], garmentIds: ['khaki-jacket'] },
        { id: 'mine', date: sample.wearLogs[0].date, garmentIds: ['khaki-jacket', 'navy-top'] },
      ],
      sampleVersion: 2,
    };
    const upgraded = upgradeSample(saved);
    expect(upgraded.garments.map((g) => g.id)).toEqual(sample.garments.map((g) => g.id));
    expect(upgraded.garments[0]).toMatchObject({
      image: sample.garments[0].image,
      favorite: false,
    });
    expect(upgraded.savedLooks.find((l) => l.id === sample.savedLooks[2].id)?.garmentIds).toEqual(
      sample.savedLooks[2].garmentIds,
    );
    expect(upgraded.wearLogs.find((w) => w.id === sample.wearLogs[4].id)?.garmentIds).toEqual(
      sample.wearLogs[4].garmentIds,
    );
    expect(upgraded.wearLogs.find((w) => w.id === 'mine')?.garmentIds).toEqual(['navy-top']);
    expect(parseWorkspace(JSON.stringify(upgraded))).toEqual(upgraded);
  });

  it('does not bring back sample pieces the person archived', () => {
    const legacy = legacyWorkspace();
    const archived = archiveGarment(legacy as never, 'navy-top');
    const upgraded = upgradeSample(archived);
    expect(upgraded.garments.some((g) => g.id === 'navy-top')).toBe(false);
    expect(upgraded.archivedGarments.map((g) => g.id)).toEqual(['navy-top']);
  });

  it('moves an English sample workspace to Mongolian, keeping personal data', () => {
    const sample = makeDemo();
    const english = {
      ...sample,
      garments: [
        { ...sample.garments[0], name: 'The everyday knit', favorite: false },
        { ...sample.garments[1], id: 'mine', name: 'My own shirt', image: 'data:,' },
      ],
      savedLooks: [
        { ...sample.savedLooks[0], name: 'Everyday, elevated' },
        { ...sample.savedLooks[0], id: 'my-look', name: 'My look' },
      ],
      wearLogs: [],
      analyses: sample.analyses.map((a) => ({ ...a, title: 'Old title', note: 'Old note' })),
      preferences: { ...sample.preferences, name: 'Alex', language: 'en' as const },
      sampleVersion: 3,
    };
    const upgraded = upgradeSample(english);
    expect(upgraded.garments[0]).toMatchObject({ name: sample.garments[0].name, favorite: false });
    expect(upgraded.garments.find((g) => g.id === 'mine')?.name).toBe('My own shirt');
    expect(upgraded.savedLooks.map((l) => l.name).slice(0, 2)).toEqual([
      sample.savedLooks[0].name,
      'My look',
    ]);
    expect(upgraded.analyses.map((a) => a.title)).toEqual(sample.analyses.map((a) => a.title));
    expect(upgraded.preferences).toMatchObject({ name: 'Alex', language: 'mn' });
    expect(parseWorkspace(JSON.stringify(upgraded))).toEqual(upgraded);
  });
});

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
      { ...workspace, garments: [{ ...workspace.garments[0], kind: '' }] },
      { ...workspace, sampleVersion: 'two' },
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
