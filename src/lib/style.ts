import type { Garment } from './types';
import { colorLabel } from './i18n';
import { t } from './lang';

type Tone = 'light' | 'mid' | 'dark' | 'statement';

/**
 * Colors offered when adding a piece, by stored key (shown via colorLabel).
 * Neutrals carry a tone; anything else is a statement.
 */
export const colorPalette: { name: string; hex: string; tone: Tone }[] = [
  { name: 'White', hex: '#f4f2ed', tone: 'light' },
  { name: 'Cream', hex: '#d7cbb5', tone: 'light' },
  { name: 'Stone', hex: '#b3aa99', tone: 'light' },
  { name: 'Silver', hex: '#c9c9cc', tone: 'light' },
  { name: 'Champagne', hex: '#d8b998', tone: 'light' },
  { name: 'Light blue', hex: '#a9c4e4', tone: 'light' },
  { name: 'Grey', hex: '#a3a29f', tone: 'mid' },
  { name: 'Camel', hex: '#b08458', tone: 'mid' },
  { name: 'Khaki', hex: '#8a7344', tone: 'mid' },
  { name: 'Denim', hex: '#6f86a6', tone: 'mid' },
  { name: 'Brown', hex: '#815d48', tone: 'dark' },
  { name: 'Navy', hex: '#303648', tone: 'dark' },
  { name: 'Charcoal', hex: '#3a3b3e', tone: 'dark' },
  { name: 'Black', hex: '#30302e', tone: 'dark' },
  { name: 'Green', hex: '#79806d', tone: 'statement' },
  { name: 'Pink', hex: '#c58c9c', tone: 'statement' },
  { name: 'Red', hex: '#a8443f', tone: 'statement' },
  { name: 'Yellow', hex: '#e3a92a', tone: 'statement' },
  { name: 'Pattern', hex: '#9d8fb0', tone: 'statement' },
];

export function toneOf(color: string): Tone {
  return colorPalette.find((c) => c.name === color)?.tone ?? 'statement';
}

/** Higher is more harmonious: mostly neutrals, at most one statement, some contrast. */
export function harmonyScore(pieces: Garment[]): number {
  const tones = pieces.map((g) => toneOf(g.color));
  const statements = tones.filter((t) => t === 'statement').length;
  const contrast = tones.includes('light') && (tones.includes('dark') || tones.includes('mid'));
  const styles = pieces.map((g) => g.style ?? 'Everyday');
  const casualShoes = pieces.some(
    (g) => g.category === 'footwear' && ['Sneakers', 'Boots'].includes(g.kind ?? ''),
  );
  return (
    (3 * (tones.length - statements)) / tones.length +
    (styles.filter((s) => s === 'Old money').length >= 2 ? 1 : 0) -
    (styles.includes('Evening') && casualShoes ? 4 : 0) -
    Math.max(0, statements - 1) * 4 +
    (contrast ? 2 : 0) +
    (pieces.some((g) => g.favorite) ? 0.5 : 0)
  );
}

/** Plain-language reasons a look works, shown next to outfit suggestions. */
export function lookReasons(pieces: Garment[]): string[] {
  if (!pieces.length) return [];
  const tones = pieces.map((g) => toneOf(g.color));
  const statement = pieces.find((g) => toneOf(g.color) === 'statement');
  const reasons: string[] = [];
  if (statement)
    reasons.push(
      t(
        'Нэг онцлох хувцсыг саармаг өнгөнүүд тэнцвэржүүлнэ',
        'Neutrals balance the one statement piece',
      ),
    );
  else if (tones.includes('light') && tones.some((t) => t === 'dark' || t === 'mid'))
    reasons.push(
      t(
        'Цайвар, бараан саармаг өнгө зөөлөн ялгарал үүсгэнэ',
        'Light and dark neutrals make a soft contrast',
      ),
    );
  else
    reasons.push(
      t('Ижил өнгөний хослол үргэлж нямбай харагдана', 'A tonal look always reads polished'),
    );
  if (pieces.some((g) => g.category === 'dress'))
    reasons.push(t('Даашинз бэлтгэлийг хялбар болгоно', 'A dress makes getting ready easy'));
  else if (pieces.some((g) => g.category === 'outerwear'))
    reasons.push(t('Гадуур хувцас хэлбэр, дулаан нэмнэ', 'A layer adds shape and warmth'));
  const shoes = pieces.find((g) => g.category === 'footwear');
  if (shoes && pieces.some((g) => g !== shoes && g.color === shoes.color))
    reasons.push(
      t(
        `${colorLabel(shoes.color)} гутал хувцасны өнгийг давтана`,
        `${colorLabel(shoes.color)} shoes echo the outfit’s color`,
      ),
    );
  return reasons.slice(0, 2);
}
