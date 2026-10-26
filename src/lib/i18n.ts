import type { Category } from './types';
import { lang, locale, t } from './lang';

/**
 * Display text for values that are stored as stable English keys. Stored keys stay English
 * so saved workspaces keep working and live try-on prompts (which the AI model expects in
 * English) can be built from them; in English mode the key itself is the label.
 */

export const colorLabels: Record<string, string> = {
  White: 'Цагаан',
  Cream: 'Цөцгий',
  Stone: 'Цайвар бор',
  Silver: 'Мөнгөлөг',
  Champagne: 'Шампань',
  'Light blue': 'Цайвар цэнхэр',
  Grey: 'Саарал',
  Camel: 'Тэмээн шар',
  Khaki: 'Хаки',
  Denim: 'Жинсэн цэнхэр',
  Brown: 'Хүрэн',
  Navy: 'Хар хөх',
  Charcoal: 'Бараан саарал',
  Black: 'Хар',
  Green: 'Ногоон',
  Pink: 'Ягаан',
  Red: 'Улаан',
  Yellow: 'Шар',
  Pattern: 'Хээтэй',
};

export const kindLabels: Record<string, string> = {
  'Long-sleeve top': 'Урт ханцуйтай цамц',
  'T-shirt': 'Футболк',
  Shirt: 'Захтай цамц',
  Blouse: 'Блуз',
  'Polo shirt': 'Поло цамц',
  'Knit polo': 'Сүлжмэл поло',
  'Knit sweater': 'Сүлжмэл цамц',
  Hoodie: 'Малгайтай цамц',
  'Striped top': 'Судалтай цамц',
  Jeans: 'Жинсэн өмд',
  Trousers: 'Өмд',
  Chinos: 'Чинос өмд',
  Skirt: 'Банзал',
  Shorts: 'Шорт',
  Leggings: 'Трико',
  'Midi dress': 'Миди даашинз',
  'Maxi dress': 'Макси даашинз',
  'Slip dress': 'Оосортой даашинз',
  'Shirt dress': 'Цамц даашинз',
  'Sheath dress': 'Бариу даашинз',
  'Evening gown': 'Үдшийн даашинз',
  'Tea dress': 'Цэцэгтэй даашинз',
  Sundress: 'Зуны даашинз',
  Coat: 'Пальто',
  'Trench coat': 'Тренч пальто',
  Blazer: 'Пиджак',
  'Tweed jacket': 'Твид хүрэм',
  'Denim jacket': 'Жинсэн хүрэм',
  'Leather jacket': 'Савхин хүрэм',
  Sneakers: 'Пүүз',
  Boots: 'Түрийтэй гутал',
  Loafers: 'Лофер',
  'Dress shoes': 'Албан гутал',
  Heels: 'Өндөр өсгийт',
  Flats: 'Балетка',
  Sandals: 'Сандаль',
  Bag: 'Цүнх',
  Hat: 'Малгай',
  Scarf: 'Ороолт',
  Tie: 'Зангиа',
  Sunglasses: 'Нарны шил',
  Belt: 'Бүс',
  Watch: 'Цаг',
  Jewelry: 'Гоёл чимэглэл',
};

// Style names (Old money, Evening, Minimal, Classic…) are shown in English by choice.

export const colorLabel = (color: string) => t(colorLabels[color] ?? color, color);
export const kindLabel = (kind: string) => t(kindLabels[kind] ?? kind, kind);

/** The stored key for a garment type typed or picked in Mongolian (or English). */
export function kindKey(text: string) {
  const value = text.trim();
  const english = Object.keys(kindLabels).find(
    (key) => key.toLowerCase() === value.toLowerCase() || kindLabels[key] === value,
  );
  return english ?? value;
}

/** English nouns for the live try-on prompt when a piece has no known type. */
export const promptNouns: Record<Category, string> = {
  top: 'top',
  bottom: 'bottoms',
  dress: 'dress',
  outerwear: 'jacket',
  footwear: 'shoes',
  accessory: 'accessory',
};

const weekdays = {
  mn: ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** Accepts a Date or a stored 'YYYY-MM-DD' (or ISO) string. */
function toDate(value: Date | string) {
  if (value instanceof Date) return value;
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
}

/** "Ням", "Даваа" … or "Sunday", "Monday" … */
export const weekdayName = (value: Date | string) => weekdays[lang()][toDate(value).getDay()];
/** Two-letter weekday: "Ня", "Да", "Мя" … or "Su", "Mo", "Tu" … */
export const weekdayShort = (value: Date | string) => weekdayName(value).slice(0, 2);

const english: Record<'day' | 'weekday' | 'year' | 'month', Intl.DateTimeFormatOptions> = {
  day: { day: 'numeric', month: 'long' },
  weekday: { weekday: 'long', day: 'numeric', month: 'long' },
  year: { day: 'numeric', month: 'long', year: 'numeric' },
  month: { month: 'long', year: 'numeric' },
};
/**
 * Dates in the interface language:
 * - 'day':     "10-р сарын 25"            / "25 October"
 * - 'weekday': "Ням, 10-р сарын 25"        / "Sunday 25 October"
 * - 'year':    "2026 оны 10-р сарын 25"    / "25 October 2026"
 * - 'month':   "2026 оны 10-р сар"         / "October 2026"
 */
export function formatDate(
  value: Date | string,
  style: 'day' | 'weekday' | 'year' | 'month' = 'day',
) {
  const date = toDate(value);
  if (lang() === 'en') return new Intl.DateTimeFormat(locale(), english[style]).format(date);
  const month = `${date.getMonth() + 1}-р сар`;
  const day = `${month}ын ${date.getDate()}`;
  if (style === 'weekday') return `${weekdayName(date)}, ${day}`;
  if (style === 'year') return `${date.getFullYear()} оны ${day}`;
  if (style === 'month') return `${date.getFullYear()} оны ${month}`;
  return day;
}

/** "2026 оны 10-р сарын 25, 14:05" / "25 October 2026, 14:05" */
export function formatDateTime(value: Date | string) {
  const date = toDate(value);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${formatDate(date, 'year')}, ${time}`;
}
