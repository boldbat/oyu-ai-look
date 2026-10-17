import { localDate } from './demo';
import { categoryLabels } from './types';
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
    throw new RangeError('Choose a valid date on or before today.');
  if (!strings(garmentIds) || garmentIds.length > 20 || !unique(garmentIds))
    throw new RangeError('Choose up to 20 different wardrobe pieces.');
  const previous = data.wearLogs.find((log) => log.date === date);
  const allowed = new Set([
    ...data.garments.map((g) => g.id),
    ...data.archivedGarments.filter((g) => previous?.garmentIds.includes(g.id)).map((g) => g.id),
  ]);
  if (garmentIds.some((id) => !allowed.has(id)))
    throw new RangeError(
      'Choose current wardrobe pieces or keep pieces already recorded for this day.',
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
