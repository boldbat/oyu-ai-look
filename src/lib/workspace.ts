import { localDate, makeDemo, SAMPLE_VERSION } from './demo';
import { t } from './lang';
import { categoryLabels, styleTags } from './types';
import type { Garment, Workspace } from './types';

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown): value is string => text(value) && !!value.trim();
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(nonempty);
const unique = (values: string[]) => new Set(values).size === values.length;
const score = (value: unknown, max: number) =>
  value === null ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max);
const dimensions = (value: unknown) =>
  object(value) &&
  ['color', 'hairstyle', 'accessories', 'styling'].every((key) => score(value[key], 25));

export function isCalendarDate(value: unknown): value is string {
  if (!text(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function garment(value: unknown): value is Garment {
  return (
    object(value) &&
    nonempty(value.id) &&
    nonempty(value.name) &&
    text(value.category) &&
    Object.hasOwn(categoryLabels, value.category) &&
    (value.kind === undefined || (nonempty(value.kind) && value.kind.length <= 60)) &&
    (value.audience === undefined ||
      ['women', 'men', 'unisex'].includes(value.audience as string)) &&
    (value.style === undefined || (styleTags as unknown[]).includes(value.style)) &&
    text(value.color) &&
    text(value.colorHex) &&
    nonempty(value.image) &&
    (value.availability === 'available' || value.availability === 'laundry') &&
    typeof value.favorite === 'boolean' &&
    isCalendarDate(value.addedAt)
  );
}

/** Stored browser data is untrusted; malformed collections never reach the UI. */
export function parseWorkspace(raw: string): Workspace | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (!object(data)) return null;
    const archived = data.archivedGarments === undefined ? [] : data.archivedGarments;
    if (
      !Array.isArray(data.garments) ||
      !data.garments.every(garment) ||
      !Array.isArray(archived) ||
      !archived.every(garment)
    )
      return null;
    const ids = [...data.garments, ...archived].map((g) => g.id);
    if (!unique(ids)) return null;
    const known = new Set(ids);
    const references = (value: unknown): value is string[] =>
      strings(value) && unique(value) && value.every((id) => known.has(id));
    if (
      !Array.isArray(data.savedLooks) ||
      !data.savedLooks.every(
        (value) =>
          object(value) &&
          nonempty(value.id) &&
          nonempty(value.name) &&
          isCalendarDate(value.createdAt) &&
          references(value.garmentIds),
      ) ||
      !unique(data.savedLooks.map((value) => value.id))
    )
      return null;
    if (
      !Array.isArray(data.wearLogs) ||
      !data.wearLogs.every(
        (value) =>
          object(value) &&
          nonempty(value.id) &&
          isCalendarDate(value.date) &&
          references(value.garmentIds) &&
          value.garmentIds.length <= 20,
      ) ||
      !unique(data.wearLogs.map((value) => value.id)) ||
      !unique(data.wearLogs.map((value) => value.date))
    )
      return null;
    if (
      !Array.isArray(data.analyses) ||
      !data.analyses.every(
        (value) =>
          object(value) &&
          nonempty(value.id) &&
          isCalendarDate(value.date) &&
          text(value.title) &&
          nonempty(value.image) &&
          score(value.overall, 100) &&
          text(value.note) &&
          typeof value.sample === 'boolean' &&
          dimensions(value.dimensions),
      ) ||
      !unique(data.analyses.map((value) => value.id))
    )
      return null;
    if (
      data.sampleVersion !== undefined &&
      !(Number.isInteger(data.sampleVersion) && (data.sampleVersion as number) > 0)
    )
      return null;
    const preferences = data.preferences;
    if (
      !object(preferences) ||
      !nonempty(preferences.name) ||
      !strings(preferences.styles) ||
      preferences.styles.length > 3 ||
      !unique(preferences.styles) ||
      !text(preferences.theme) ||
      !['light', 'dark', 'system'].includes(preferences.theme) ||
      !text(preferences.language) ||
      !['en', 'mn'].includes(preferences.language)
    )
      return null;
    return { ...data, archivedGarments: archived } as unknown as Workspace;
  } catch {
    return null;
  }
}

/** Archived pieces can remain on their recorded day, but cannot enter a new log. */
export function recordWear(
  data: Workspace,
  date: string,
  garmentIds: string[],
  today = localDate(),
): Workspace {
  if (!isCalendarDate(date) || !isCalendarDate(today) || date > today)
    throw new RangeError(
      t(
        'Өнөөдөр эсвэл түүнээс өмнөх зөв огноо сонгоно уу.',
        'Choose a valid date, today or earlier.',
      ),
    );
  if (!strings(garmentIds) || garmentIds.length > 20 || !unique(garmentIds))
    throw new RangeError(
      t(
        'Шүүгээнээсээ 20 хүртэл өөр хувцас сонгоно уу.',
        'Choose up to 20 different pieces from your wardrobe.',
      ),
    );
  const previous = data.wearLogs.find((log) => log.date === date);
  const allowed = new Set([
    ...data.garments.map((g) => g.id),
    ...data.archivedGarments.filter((g) => previous?.garmentIds.includes(g.id)).map((g) => g.id),
  ]);
  if (garmentIds.some((id) => !allowed.has(id)))
    throw new RangeError(
      t(
        'Шүүгээнд байгаа хувцас сонгох эсвэл энэ өдөр аль хэдийн бүртгэсэн хувцсаа үлдээнэ үү.',
        'Choose pieces from your wardrobe, or keep the ones already logged for this day.',
      ),
    );
  return {
    ...data,
    wearLogs: [
      ...data.wearLogs.filter((log) => log.date !== date),
      ...(garmentIds.length
        ? [{ id: previous?.id ?? `wear-${date}`, date, garmentIds: [...garmentIds] }]
        : []),
    ],
  };
}

export function archiveGarment(data: Workspace, id: string): Workspace {
  const item = data.garments.find((g) => g.id === id);
  if (!item) return data;
  return {
    ...data,
    garments: data.garments.filter((g) => g.id !== id),
    archivedGarments: [...data.archivedGarments, item],
  };
}

export function restoreGarment(data: Workspace, id: string): Workspace {
  const item = data.archivedGarments.find((g) => g.id === id);
  if (!item) return data;
  return {
    ...data,
    garments: [...data.garments, item],
    archivedGarments: data.archivedGarments.filter((g) => g.id !== id),
  };
}

/**
 * Brings a workspace saved with an older sample collection up to date. Bundled sample
 * pieces (images under /assets/) are refreshed from the current collection, retired
 * sample pieces are removed, and new sample pieces, looks and wear days are added.
 * Personal uploads, favorites, laundry status and the person's own records are kept.
 */
export function upgradeSample(data: Workspace, sample = makeDemo()): Workspace {
  if ((data.sampleVersion ?? 1) >= SAMPLE_VERSION) return data;
  const current = new Map(sample.garments.map((g) => [g.id, g]));
  const byName = new Map(
    [...sample.garments, ...sample.analyses].map((item) => [
      item.image.replace(/^.*\/|\.\w+$/g, ''),
      item.image,
    ]),
  );
  const image = (src: string) =>
    byName.get(/^\/assets\/([a-z-]+)\.png$/.exec(src)?.[1] ?? '') ?? src;
  const bundled = (g: Garment) => g.image.startsWith('/assets/');
  const retired = new Set(
    [...data.garments, ...data.archivedGarments]
      .filter((g) => bundled(g) && !current.has(g.id))
      .map((g) => g.id),
  );
  const refresh = (g: Garment): Garment => {
    const s = current.get(g.id);
    if (!s || !bundled(g)) return { ...g, image: image(g.image) };
    const {
      id: _id,
      favorite: _favorite,
      availability: _availability,
      addedAt: _added,
      ...look
    } = s;
    return { ...g, ...look };
  };
  const keep = (g: Garment) => !retired.has(g.id);
  const archivedGarments = data.archivedGarments.filter(keep).map(refresh);
  const known = new Set([...data.garments, ...archivedGarments].map((g) => g.id));
  const garments = [
    ...data.garments.filter(keep).map(refresh),
    ...sample.garments.filter((g) => !known.has(g.id)),
  ];
  const active = new Set(garments.map((g) => g.id));
  const all = new Set([...active, ...archivedGarments.map((g) => g.id)]);
  const sampleLooks = new Map(sample.savedLooks.map((l) => [l.id, l]));
  const sampleLogs = new Map(sample.wearLogs.map((w) => [w.id, w]));
  const sampleAnalyses = new Map(sample.analyses.map((a) => [a.id, a]));
  const stale = (ids: string[]) => ids.some((id) => retired.has(id));
  // Versions 4 and 5 moved the app to Mongolian: sample looks and analyses take the new wording.
  const toMongolian = (data.sampleVersion ?? 1) < 5;
  const savedLooks = data.savedLooks.flatMap((l) => {
    const named =
      toMongolian && sampleLooks.has(l.id) ? { ...l, name: sampleLooks.get(l.id)!.name } : l;
    if (!stale(l.garmentIds)) return [named];
    const s = sampleLooks.get(l.id);
    return s && s.garmentIds.every((id) => active.has(id))
      ? [{ ...l, name: s.name, garmentIds: [...s.garmentIds] }]
      : [];
  });
  const wearLogs = data.wearLogs.flatMap((w) => {
    if (!stale(w.garmentIds)) return [w];
    const s = sampleLogs.get(w.id);
    const ids =
      s && s.garmentIds.every((id) => all.has(id))
        ? s.garmentIds
        : w.garmentIds.filter((id) => !retired.has(id));
    return ids.length ? [{ ...w, garmentIds: [...ids] }] : [];
  });
  const lookIds = new Set(savedLooks.map((l) => l.id));
  const wearDays = new Set(wearLogs.map((w) => w.date));
  const wearIds = new Set(wearLogs.map((w) => w.id));
  return {
    ...data,
    garments,
    archivedGarments,
    savedLooks: [
      ...savedLooks,
      ...sample.savedLooks.filter(
        (l) => !lookIds.has(l.id) && l.garmentIds.every((id) => active.has(id)),
      ),
    ],
    wearLogs: [
      ...wearLogs,
      ...sample.wearLogs.filter(
        (w) =>
          !wearDays.has(w.date) && !wearIds.has(w.id) && w.garmentIds.every((id) => all.has(id)),
      ),
    ],
    analyses: data.analyses.map((a) => {
      const s = toMongolian && a.sample ? sampleAnalyses.get(a.id) : undefined;
      return { ...a, image: image(a.image), ...(s && { title: s.title, note: s.note }) };
    }),
    preferences: toMongolian ? { ...data.preferences, language: 'mn' } : data.preferences,
    sampleVersion: SAMPLE_VERSION,
  };
}

/** Active pieces with no recorded wear in the last `days` days, e.g. forgotten favorites. */
export function idleGarments(data: Workspace, days = 30, today = localDate()): Garment[] {
  const start = new Date(`${today}T12:00:00`);
  start.setDate(start.getDate() - days + 1);
  const since = localDate(start);
  const worn = new Set(
    data.wearLogs.filter((w) => w.date >= since && w.date <= today).flatMap((w) => w.garmentIds),
  );
  return data.garments.filter((g) => !worn.has(g.id));
}
