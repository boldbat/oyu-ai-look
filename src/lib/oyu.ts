/**
 * Oyu, the companion stylist. Everything here is local and instant: ratings come from the
 * piece itself (colour, style edit, the user's chosen styles), not from the camera, so a
 * reaction never waits on a network call and the same piece always gets the same score.
 */
import { colorLabel, kindKey, kindLabels } from './i18n';
import { inLanguage, lang, localized, t } from './lang';
import { harmonyScore, lookReasons, toneOf } from './style';
import { fitsAudience, tryOnCategories } from './types';
import { localDate, nameOf } from './demo';
import type { Category, Garment, Preferences, Workspace } from './types';
import type { Need, PoseEvent } from './oyu-vision';

export type OyuMood = 'hello' | 'happy' | 'think';
export const oyuPose: Record<OyuMood, string> = {
  hello: '/assets/oyu/oyu-salute.webp',
  happy: '/assets/oyu/oyu-happy.webp',
  think: '/assets/oyu/oyu-think.webp',
};
export interface OyuRating {
  overall: number;
  color: number;
  style: number;
  polish: number;
}
export const ratingLabels = localized<Exclude<keyof OyuRating, 'overall'>>({
  color: ['Өнгө', 'Color'],
  style: ['Таны стиль', 'Your style'],
  polish: ['Тансаг байдал', 'Elegance'],
});
export interface OyuLine {
  mood: OyuMood;
  text: string;
  score?: number;
  rating?: OyuRating;
  /** A piece Oyu proposes trying next. */
  suggest?: Garment;
  /** Pieces to put back on, best first (the session summary). */
  picks?: TopPick[];
}

/** Stable 0–1 value for a seed, so wording and scores vary by piece but never flicker. */
function unit(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
const spread = (seed: string, width: number) => (unit(seed) * 2 - 1) * width;
const one = (value: number) => Math.round(Math.min(9.9, Math.max(6, value)) * 10) / 10;
function choose<T>(items: T[], seed: string): T {
  return items[Math.floor(unit(seed) * items.length)];
}
const kindOf = (g: Garment) => (g.kind && kindKey(g.kind)) || '';
const isKind = (g: Garment, kinds: string[]) => kinds.includes(kindOf(g));

/** Which of the user's chosen styles (Settings) a piece suits. */
const affinity: Record<string, (g: Garment) => boolean> = {
  Minimal: (g) => toneOf(g.color) !== 'statement',
  Classic: (g) =>
    g.style === 'Old money' ||
    isKind(g, ['Shirt', 'Blazer', 'Trench coat', 'Coat', 'Knit sweater', 'Chinos', 'Shirt dress']),
  Casual: (g) => (g.style ?? 'Everyday') === 'Everyday',
  Business: (g) =>
    isKind(g, ['Blazer', 'Shirt', 'Trousers', 'Coat', 'Shirt dress', 'Sheath dress', 'Blouse']),
  Street: (g) =>
    isKind(g, ['Denim jacket', 'Leather jacket', 'Jeans', 'Hoodie', 'T-shirt', 'Shorts']),
  Romantic: (g) =>
    isKind(g, ['Blouse', 'Skirt', 'Slip dress', 'Tea dress', 'Midi dress', 'Maxi dress']) ||
    ['Pink', 'Pattern', 'Champagne'].includes(g.color),
  Sporty: (g) => isKind(g, ['Polo shirt', 'Knit polo', 'Shorts', 'Hoodie', 'T-shirt']),
  Formal: (g) =>
    g.style === 'Evening' || isKind(g, ['Evening gown', 'Blazer', 'Sheath dress', 'Coat']),
};
export const styleMatches = (g: Garment, prefs: Preferences) =>
  prefs.styles.filter((style) => affinity[style]?.(g));

/** Oyu's score out of 10 for one piece, for this user. */
export function rateGarment(g: Garment, prefs: Preferences): OyuRating {
  const matches = Math.min(styleMatches(g, prefs).length, 2);
  const color = one((toneOf(g.color) === 'statement' ? 8.1 : 8.8) + spread(`${g.id}:c`, 0.4));
  const style = one(7.4 + matches + spread(`${g.id}:s`, 0.3));
  const polish = one(
    (g.style === 'Old money' || g.style === 'Evening' ? 9 : 7.9) +
      (g.favorite ? 0.4 : 0) +
      spread(`${g.id}:p`, 0.3),
  );
  return { color, style, polish, overall: one(0.3 * color + 0.45 * style + 0.25 * polish) };
}
export type Band = 'love' | 'like' | 'ok';
export const band = (score: number): Band => (score >= 9 ? 'love' : score >= 8.2 ? 'like' : 'ok');
const moodOf = (score: number): OyuMood => (band(score) === 'ok' ? 'think' : 'happy');

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const nouns = localized<Category>({
  top: ['цамц', 'top'],
  bottom: ['өмд', 'bottoms'],
  dress: ['даашинз', 'dress'],
  outerwear: ['хүрэм', 'jacket'],
  footwear: ['гутал', 'shoes'],
  accessory: ['аксессуар', 'accessory'],
});
/** Colours that read as nouns in Mongolian, so they take "өнгийн" before a garment. */
const nounColors = ['Cream', 'Champagne', 'Khaki'];
/**
 * The piece in plain words, colour first: "хар хөх пиджак", "цөцгий өнгийн сүлжмэл цамц",
 * or in English "navy blazer", "cream knit sweater".
 */
export function phrase(g: Garment) {
  const key = g.kind && kindKey(g.kind);
  if (lang() === 'en') {
    const noun = key && kindLabels[key] ? key.toLowerCase() : nouns[g.category];
    if (g.color === 'Pattern') return noun;
    const color = g.color.toLowerCase();
    // "denim denim jacket" would say denim twice.
    return noun.includes(color.split(' ')[0]) ? noun : `${color} ${noun}`;
  }
  const noun = key && kindLabels[key] ? lower(kindLabels[key]) : nouns[g.category];
  if (g.color === 'Pattern') return noun;
  const color = lower(colorLabel(g.color));
  // "жинсэн цэнхэр жинсэн өмд" would say denim twice.
  if (noun.includes(color.split(' ')[0])) return noun;
  return `${color}${nounColors.includes(g.color) ? ' өнгийн' : ''} ${noun}`;
}

/** English words that agree with the piece: "the trousers suit", "the blazer suits". */
function english(g: Garment) {
  const piece = phrase(g);
  const plural = /[^s]s$/.test(piece);
  return {
    piece,
    the: `the ${piece}`,
    The: `The ${piece}`,
    This: plural ? 'These' : 'This',
    It: plural ? 'They' : 'It',
    is: plural ? 'are' : 'is',
    s: plural ? '' : 's',
  };
}
/** Lines Oyu has already used this session, so she doesn't repeat herself. */
export type Said = Set<string>;
type Template = { id: string; text: string };
/** A line not said yet (any line once all have been), picked at random or in order. */
function fresh(templates: Template[], said: Said | undefined, seed: string, ordered = false) {
  const unused = said ? templates.filter((template) => !said.has(template.id)) : templates;
  const pool = unused.length ? unused : templates;
  const picked = ordered ? pool[0] : choose(pool, seed);
  said?.add(picked.id);
  return picked.text;
}
const categoryReason = localized<Category>({
  dress: ['Ганц даашинзаар бүтэн төрх болж байна.', 'One dress and the whole look is done.'],
  outerwear: [
    'Гадуур хувцас төрхийг тань илүү нямбай болгоно.',
    'A layer makes your look more polished.',
  ],
  bottom: ['Аль ч цамцтай хослуулахад амар.', 'Easy to pair with any top.'],
  top: ['Өдөр тутамд эвтэйхэн, бас нямбай.', 'Easy for every day, and polished.'],
  footwear: ['Хослолыг тань бүрэн болгоно.', 'It finishes your look.'],
  accessory: ['Жижиг ч гэсэн төрхийг тань өөрчилнө.', 'Small, but it changes the whole look.'],
});
/** One sentence on why a piece works: its strongest quality Oyu hasn't mentioned yet. */
function why(g: Garment, prefs: Preferences, seed: string, said?: Said) {
  const en = english(g);
  const reasons: Template[] = styleMatches(g, prefs).map((style) => ({
    id: `why:${style}`,
    text: t(
      `Таны ${style} стильтэй яг таарч байна.`,
      `${en.It} match${en.s ? 'es' : ''} your ${style} style perfectly.`,
    ),
  }));
  if (g.style === 'Old money')
    reasons.push({
      id: 'why:old-money',
      text: t(
        'Old money төрх таныг тайван, тансаг харагдуулна.',
        'Old money style makes you look calm and refined.',
      ),
    });
  if (g.style === 'Evening')
    reasons.push({
      id: 'why:evening',
      text: t('Оройн арга хэмжээнд яг тохирно.', 'Just right for an evening event.'),
    });
  reasons.push(
    g.color === 'Pattern'
      ? {
          id: 'why:pattern',
          text: t('Хээ нь төрхийг тань сэргэг болгоно.', 'The print gives your look a lift.'),
        }
      : toneOf(g.color) === 'statement'
        ? {
            id: 'why:statement',
            text: t(
              `${colorLabel(g.color)} өнгө төрхийг тань тод, содон болгоно.`,
              `${colorLabel(g.color)} adds a bold, bright note to your look.`,
            ),
          }
        : {
            id: `why:${g.color}`,
            text: t(
              `${colorLabel(g.color)} өнгө юутай ч зохицно.`,
              `${colorLabel(g.color)} goes with everything.`,
            ),
          },
    { id: `why:${g.category}`, text: categoryReason[g.category] },
  );
  return fresh(reasons, said, seed, true);
}

/**
 * A line written in both languages, so it can follow a language switch while on screen. Each
 * pass sees the same lines-already-said, so both pick the same wording; `said` then holds
 * what was said, once.
 */
export function inBoth(make: () => OyuLine, said: Said): { mn: OyuLine; en: OyuLine } {
  const before = [...said];
  const mn = inLanguage('mn', make);
  const after = [...said];
  said.clear();
  for (const id of before) said.add(id);
  const en = inLanguage('en', make);
  for (const id of after) said.add(id);
  return { mn, en };
}

/** What Oyu remembers within one live session. */
export interface Session {
  /** Pieces worn so far (this one excluded) and her score for each, in order. */
  scores: number[];
  said: Said;
}
/** Oyu's reaction when a piece lands on the user in live try-on. */
export function appliedLine(
  g: Garment,
  prefs: Preferences,
  next: Garment | null,
  session: Session = { scores: [], said: new Set() },
): OyuLine {
  const rating = rateGarment(g, prefs);
  const score = rating.overall;
  const level = band(score);
  const { said, scores } = session;
  const seed = `${g.id}:${scores.length}`;
  const name = upper(phrase(g));
  const en = english(g);
  const previous = scores.at(-1);
  const best = scores.length ? Math.max(...scores) : null;
  const base = { mood: moodOf(score), score };
  if (level === 'ok')
    return next
      ? {
          ...base,
          suggest: next,
          text: fresh(
            [
              {
                id: 'ok:1',
                text: t(
                  `Муугүй ээ. Гэхдээ «${nameOf(next)}» танд илүү зохих байх. Үзэх үү?`,
                  `Not bad. But “${nameOf(next)}” might suit you even better. Want to see?`,
                ),
              },
              {
                id: 'ok:2',
                text: t(
                  `Энэ ч болж байна. Харин «${nameOf(next)}» танд бүр илүү тохирно. Үзэх үү?`,
                  `This works too. But “${nameOf(next)}” would suit you better still. Shall we try it?`,
                ),
              },
            ],
            said,
            seed,
          ),
        }
      : {
          ...base,
          text: t(
            'Муугүй ээ. Өөр өнгөтэй хослуулбал илүү тод харагдана.',
            'Not bad. Pair it with a different color and it will stand out more.',
          ),
        };
  const openers: Template[] =
    best !== null && scores.length >= 2 && score > best && score >= 9.2
      ? [
          {
            id: 'top',
            text: t(
              `Одоогийн миний хамгийн дуртай нь энэ! ${name} яг таных.`,
              `My favorite so far! ${en.The} ${en.is} so you.`,
            ),
          },
        ]
      : previous !== undefined && score - previous >= 0.4
        ? [
            {
              id: 'up',
              text: t(
                `Өмнөхөөсөө ч илүү гоё! ${name} яг таных.`,
                `Even better than the last one! ${en.The} ${en.is} so you.`,
              ),
            },
          ]
        : previous !== undefined && previous - score >= 0.4 && level === 'like'
          ? [
              {
                id: 'down',
                text: t(
                  `Өмнөх нь арай илүү зохиж байсан ч ${phrase(g)} ч гоё.`,
                  `The last one suited you a touch better, but ${en.the} ${en.is} lovely too.`,
                ),
              },
            ]
          : [];
  const fallback: Template[] =
    level === 'love'
      ? [
          {
            id: 'love:1',
            text: t(`${name} танд үнэхээр зохиж байна!`, `${en.The} really suit${en.s} you!`),
          },
          {
            id: 'love:2',
            text: t(
              `Хөөх! ${name} танд яг зориулагдсан юм шиг.`,
              `Wow! ${en.The} look${en.s} made for you.`,
            ),
          },
          {
            id: 'love:3',
            text: t(
              'Ямар гоё! Ингээд гарвал бүгд эргэж харна.',
              'How lovely! Walk out like this and heads will turn.',
            ),
          },
          {
            id: 'love:4',
            text: t(
              `Төгс! ${name} таныг их ганган харагдуулж байна.`,
              `Perfect! ${en.The} make${en.s} you look so elegant.`,
            ),
          },
          {
            id: 'love:5',
            text: t(
              `Энэ ${phrase(g)} танд их сайхан харагдаж байна!`,
              `${en.This} ${en.piece} look${en.s} wonderful on you!`,
            ),
          },
        ]
      : [
          {
            id: 'like:1',
            text: t(
              `Гоё харагдаж байна! ${name} танд сайхан зохижээ.`,
              `Looking good! ${en.The} suit${en.s} you nicely.`,
            ),
          },
          { id: 'like:2', text: t(`${name} танд таарч байна.`, `${en.The} work${en.s} for you.`) },
          {
            id: 'like:3',
            text: t(
              `Сайхан сонголт! ${name} энгийн мөртлөө ганган.`,
              `Nice choice! ${en.The} ${en.is} simple yet chic.`,
            ),
          },
          {
            id: 'like:4',
            text: t(`${name} надад их таалагдаж байна.`, `I really like ${en.the}.`),
          },
          {
            id: 'like:5',
            text: t(
              `Энэ ${phrase(g)} танд их тохиромжтой.`,
              `${en.This} ${en.piece} ${en.is} just right for you.`,
            ),
          },
        ];
  // A comparison is only worth saying once; after that the usual praise takes over.
  const opener = openers.find((template) => !said.has(template.id))
    ? fresh(openers, said, seed)
    : fresh(fallback, said, seed);
  return { ...base, text: `${opener} ${why(g, prefs, seed, said)}` };
}
/**
 * What Oyu adds while the user keeps a piece on: first a word about it (or, when she can see,
 * a request to turn around), then the next piece to try.
 */
export function lingerLine(
  g: Garment,
  prefs: Preferences,
  next: Garment | null,
  step: number,
  context: { vision: boolean; turned: boolean; said?: Said } = { vision: false, turned: false },
): OyuLine {
  const { vision, turned, said } = context;
  if ((step > 0 || band(rateGarment(g, prefs).overall) === 'ok') && next)
    return {
      mood: 'think',
      text:
        step > 0
          ? t(
              `Дараагийнхыг үзэх үү? Миний санал: «${nameOf(next)}».`,
              `Want to see the next one? My pick: “${nameOf(next)}”.`,
            )
          : t(
              `Өөр нэгийг туршъя. Миний санал: «${nameOf(next)}».`,
              `Let’s try another. My pick: “${nameOf(next)}”.`,
            ),
      suggest: next,
    };
  if (vision && !turned)
    return {
      mood: 'hello',
      text: fresh(
        [
          {
            id: 'turn:1',
            text: t('Нэг эргээд харуулаач! Би харж байна.', 'Give me a twirl! I’m watching.'),
          },
          {
            id: 'turn:2',
            text: t('Ар талыг нь харъя! Аажуухан эргээрэй.', 'Let’s see the back! Turn slowly.'),
          },
        ],
        said,
        g.id,
      ),
    };
  return {
    mood: 'happy',
    text: fresh(
      [
        ...(vision
          ? []
          : [
              {
                id: 'linger:turn',
                text: t(
                  'Нэг эргээд харуулаач! Ар талаас нь ч гоё харагдах байх.',
                  'Give me a twirl! I bet the back looks great too.',
                ),
              },
            ]),
        {
          id: 'linger:1',
          text: t(
            'Мөрөө тэнийлгээд зогсоход бүр ч гоё.',
            'Shoulders back and stand tall. Even better.',
          ),
        },
        {
          id: 'linger:2',
          text: t('Энэ хувцастайгаа заавал зургаа аваарай!', 'You have to take a photo in this!'),
        },
        {
          id: 'linger:3',
          text: t(
            'Энэ хувцас таныг өөртөө итгэлтэй харагдуулж байна.',
            'This outfit makes you look so confident.',
          ),
        },
      ],
      said,
      `${g.id}:linger`,
    ),
  };
}
/** A rating card when the user asks Oyu to rate them. */
export function ratingLine(g: Garment, prefs: Preferences): OyuLine {
  const rating = rateGarment(g, prefs);
  const en = english(g);
  const text = {
    love: t(
      `Миний үнэлгээ өндөр байна! ${upper(phrase(g))} танд үнэхээр зохиж байна.`,
      `A high score from me! ${en.The} really suit${en.s} you.`,
    ),
    like: t(
      'Сайн байна! Тохирох хувцастай хослуулбал бүр ч гоё болно.',
      'Good! Pair it with the right pieces and it gets even better.',
    ),
    ok: t(
      'Болж байна, гэхдээ шүүгээнд тань илүү зохих хувцас бий.',
      'It works, but there’s something in your wardrobe that suits you better.',
    ),
  }[band(rating.overall)];
  return { mood: moodOf(rating.overall), text, score: rating.overall, rating };
}

/** The piece Oyu suggests trying next: well rated, not tried yet, cut for the same person. */
export function nextToTry(
  current: Garment | null,
  options: Garment[],
  tried: Iterable<string>,
  prefs: Preferences,
): Garment | null {
  const skip = new Set(tried);
  const audience = current?.audience && current.audience !== 'unisex' ? current.audience : 'all';
  let best: Garment | null = null;
  let bestScore = -Infinity;
  for (const g of options) {
    if (g.id === current?.id || skip.has(g.id) || !fitsAudience(g, audience)) continue;
    const score =
      rateGarment(g, prefs).overall +
      (current && g.category !== current.category ? 0.3 : 0) +
      spread(`${g.id}:${skip.size}`, 0.25);
    if (score > bestScore) [best, bestScore] = [g, score];
  }
  return best;
}

export type TopPick = { garment: Garment; score: number };
export const liveLines = {
  greeting: (name: string): OyuLine => ({
    mood: 'hello',
    text: t(
      `Сайн байна уу, ${name}! Би Oyu, таны стилист. Камераа асаагаад бүтэн биеэ харуулахаар хойш зай аваарай.`,
      `Hi ${name}! I’m Oyu, your stylist. Turn on your camera and step back so I can see all of you.`,
    ),
  }),
  preview: (): OyuLine => ({
    mood: 'hello',
    text: t(
      'Камер асчихлаа! Бүтэн биеэ харуулахаар хоёр алхам хойш зогсоод «Шууд өмсөж үзэх» товчийг дараарай.',
      'Your camera’s on! Take two steps back so your whole body shows, then press “Start live try-on”.',
    ),
  }),
  dim: (): OyuLine => ({
    mood: 'think',
    text: t(
      'Гэрэл жаахан бага байна. Гэрэлтэй газар зогсвол AI хувцсыг илүү тод өмсгөнө.',
      'The light is a little low. Stand somewhere brighter and the AI will dress you more clearly.',
    ),
  }),
  connecting: (): OyuLine => ({
    mood: 'think',
    text: t(
      'Хувцсыг тань бэлдэж байна. Хэдэн секунд хүлээгээрэй!',
      'Getting your outfit ready. Just a few seconds!',
    ),
  }),
  upload: (): OyuLine => ({
    mood: 'happy',
    text: t(
      'Өөрийн хувцсаа өмсөж үзэх гоё санаа байна! Танд сайхан зохиж байна.',
      'Trying on your own piece, what a great idea! It suits you nicely.',
    ),
  }),
  compare: (): OyuLine => ({
    mood: 'happy',
    text: t(
      'Зүүн талд жинхэнэ, баруун талд AI. Гайхалтай биз?',
      'The real you on the left, AI on the right. Amazing, isn’t it?',
    ),
  }),
  /** The session in one line, with her best pieces (highest first) to put back on. */
  summary: (picks: TopPick[], count: number): OyuLine => ({
    mood: 'happy',
    text:
      count > 1
        ? t(
            `Өнөөдөр ${count} хувцас үзлээ. Миний шилдэг сонголт бол «${nameOf(picks[0].garment)}».`,
            `You tried on ${count} pieces today. My top pick is “${nameOf(picks[0].garment)}”.`,
          )
        : t(
            `Гоё эхлэл байлаа! «${nameOf(picks[0].garment)}» танд сайхан зохисон.`,
            `A great start! “${nameOf(picks[0].garment)}” suited you nicely.`,
          ),
    score: picks[0].score,
    picks,
  }),
};

/** What Oyu says when she notices something about the user through the camera. */
export function visionLine(
  event: PoseEvent,
  context: { stage: 'preview' | 'live'; need: Need; said?: Said },
): OyuLine {
  const { stage, need, said } = context;
  switch (event) {
    case 'absent':
      return {
        mood: 'think',
        text: t(
          'Таныг харахгүй байна. Камерын өмнө зогсоорой.',
          'I can’t see you. Please stand in front of the camera.',
        ),
      };
    case 'returned':
      return {
        mood: 'happy',
        text: t('Таныг харлаа! Үргэлжлүүлье.', 'There you are! Let’s keep going.'),
      };
    case 'step-back':
      return {
        mood: 'think',
        text:
          need === 'legs'
            ? t(
                'Хөл тань харагдахгүй байна. Хоёр алхам хойшоо зогсоорой.',
                'I can’t see your legs. Take two steps back.',
              )
            : t(
                'Жаахан хойшоо зогсоорой. Хувцас тань бүтэн харагдах хэрэгтэй.',
                'Step back a little. I need to see the whole outfit.',
              ),
      };
    case 'framed':
      return {
        mood: 'happy',
        text:
          stage === 'preview'
            ? t(
                'Таныг бүтэн харж байна. Одоо «Шууд өмсөж үзэх» товчийг дараарай.',
                'I can see all of you. Now press “Start live try-on”.',
              )
            : t('Яг зөв! Одоо бүтэн харагдаж байна.', 'That’s it! Now you’re fully in frame.'),
      };
    case 'spin':
      return {
        mood: 'happy',
        text: fresh(
          [
            {
              id: 'spin:1',
              text: t(
                'Эргэлт гоё байлаа! Бүх талаасаа гоё харагдаж байна.',
                'Lovely twirl! You look great from every side.',
              ),
            },
            {
              id: 'spin:2',
              text: t(
                'Ямар гоё эргэлт вэ! Хувцас тань хөдөлгөөн дунд ч сайхан.',
                'What a spin! Your outfit looks great in motion too.',
              ),
            },
          ],
          said,
          'spin',
        ),
      };
    case 'back':
      return {
        mood: 'happy',
        text: t('Ар талаас нь ч гоё харагдаж байна!', 'It looks great from the back too!'),
      };
    case 'hand-raised':
      return {
        mood: 'hello',
        text: t(
          'Хөөх, миний дуртай поз! Бид хоёр адилхан байна.',
          'Ooh, my favorite pose! We match.',
        ),
      };
    case 'arms-up':
      return {
        mood: 'happy',
        text: t('Гоё поз! Яг загвар өмсөгч шиг.', 'Great pose! Just like a model.'),
      };
    case 'hand-on-hip':
      return {
        mood: 'happy',
        text: t('Ийм итгэлтэй поз танд их зохиж байна!', 'That confident pose really suits you!'),
      };
  }
}

export interface LookRating {
  overall: number;
  harmony: number;
  style: number;
  complete: number;
}
export const lookLabels = localized<Exclude<keyof LookRating, 'overall'>>({
  harmony: ['Өнгөний зохицол', 'Color harmony'],
  style: ['Таны стиль', 'Your style'],
  complete: ['Бүрэн байдал', 'Completeness'],
});
const categoriesOf = (pieces: Garment[]) => {
  const has = (category: Category) => pieces.some((g) => g.category === category);
  return { has, base: has('dress') || (has('top') && has('bottom')) };
};
/** A whole outfit out of 10: colour harmony, fit with the user's styles, and completeness. */
export function rateLook(pieces: Garment[], prefs: Preferences): LookRating {
  const { has, base } = categoriesOf(pieces);
  const harmony = one(6 + Math.min(6.5, Math.max(0, harmonyScore(pieces))) * 0.6);
  const style = one(
    pieces.reduce((sum, g) => sum + rateGarment(g, prefs).style, 0) / pieces.length,
  );
  const complete = one(
    base && has('footwear')
      ? 9 + (has('outerwear') ? 0.4 : 0) + (has('accessory') ? 0.4 : 0)
      : base
        ? 7.2
        : 6.2,
  );
  return {
    harmony,
    style,
    complete,
    // Completeness weighs most: an outfit without shoes is not yet a "love".
    overall: one(0.3 * harmony + 0.3 * style + 0.4 * complete),
  };
}
/** Oyu's take on a whole outfit: a score, what works, and one way to improve it. */
export function reviewLook(pieces: Garment[], prefs: Preferences) {
  if (!pieces.length) return null;
  const { has, base } = categoriesOf(pieces);
  const rating = rateLook(pieces, prefs);
  const score = rating.overall;
  const statements = pieces.filter((g) => toneOf(g.color) === 'statement').length;
  const tip = !base
    ? t(
        'Цамц, өмд эсвэл даашинз нэмээд бүтэн хослол болгоорой.',
        'Add a top and bottoms, or a dress, to make it a full look.',
      )
    : !has('footwear')
      ? t('Гутал нэмбэл бүрэн болно.', 'Add shoes to finish it.')
      : statements > 1
        ? t(
            'Нэг л онцлох өнгө үлдээвэл илүү цэгцтэй харагдана.',
            'Keep just one statement color and it will look more put together.',
          )
        : !has('outerwear')
          ? t('Гадуур хувцас нэмбэл илүү ганган болно.', 'Add a layer for a sharper look.')
          : !has('accessory')
            ? t('Жижиг аксессуар нэмбэл төгс болно.', 'A small accessory would make it perfect.')
            : t('Яг одоо хадгалаад өмсөхөд бэлэн!', 'Ready to save and wear right now!');
  const opener = {
    love: t('Энэ хослол үнэхээр гоё болжээ!', 'This look turned out beautifully!'),
    like: t('Сайхан хослол байна.', 'A lovely look.'),
    ok: t('Хослол болж байна, гэхдээ сайжруулж болно.', 'The look works, but it could be better.'),
  }[band(score)];
  return {
    score,
    rating,
    mood: moodOf(score),
    // Reasons about colours between pieces need at least two of them.
    lines: [opener, ...(pieces.length > 1 ? lookReasons(pieces).slice(0, 1) : []), tip],
  };
}
/**
 * The one piece that would improve an outfit most: whatever completes it first (the other
 * half of the base, then shoes), then a layer, then an accessory. Null when nothing is missing.
 */
export function lookAddition(pieces: Garment[], data: Workspace): Garment | null {
  if (!pieces.length) return null;
  const { has, base } = categoriesOf(pieces);
  const needed: Category | null = !base
    ? has('top')
      ? 'bottom'
      : has('bottom')
        ? 'top'
        : null
    : !has('footwear')
      ? 'footwear'
      : !has('outerwear')
        ? 'outerwear'
        : !has('accessory')
          ? 'accessory'
          : null;
  if (!needed) return null;
  const audience = pieces.find((g) => g.audience && g.audience !== 'unisex')?.audience ?? 'all';
  const statements = pieces.filter((g) => toneOf(g.color) === 'statement').length;
  let best: Garment | null = null;
  let bestScore = -Infinity;
  for (const g of data.garments) {
    if (
      g.category !== needed ||
      g.availability !== 'available' ||
      pieces.includes(g) ||
      !fitsAudience(g, audience) ||
      (statements > 0 && toneOf(g.color) === 'statement')
    )
      continue;
    const score = harmonyScore([...pieces, g]) + rateGarment(g, data.preferences).overall / 3;
    if (score > bestScore) [best, bestScore] = [g, score];
  }
  return best;
}

const partners: Record<Category, Category[]> = {
  top: ['bottom', 'footwear', 'outerwear'],
  outerwear: ['top', 'bottom', 'dress'],
  bottom: ['top', 'footwear', 'outerwear'],
  dress: ['footwear', 'outerwear', 'accessory'],
  footwear: ['bottom', 'dress', 'top'],
  accessory: ['top', 'dress', 'outerwear'],
};
/** Oyu's notes on one piece: a rating, a few lines and up to three pieces it pairs with. */
export function reviewGarment(g: Garment, data: Workspace) {
  const prefs = data.preferences;
  const rating = rateGarment(g, prefs);
  const worn = data.wearLogs.filter((log) => log.garmentIds.includes(g.id)).length;
  const opener = {
    love: t('Энэ бол таны шүүгээний од!', 'This is the star of your wardrobe!'),
    like: t(
      'Олон зүйлтэй хослуулж болох сайхан хувцас.',
      'A lovely piece that pairs with lots of things.',
    ),
    ok: t(
      'Зөв хослуулбал энэ хувцас илүү гоё харагдана.',
      'Style it right and this piece will look even better.',
    ),
  }[band(rating.overall)];
  const habit =
    worn === 0
      ? t(
          'Одоохондоо өмсөөгүй байна. Энэ долоо хоногт нэг туршаад үзээрэй.',
          'You haven’t worn it yet. Try it once this week.',
        )
      : worn >= 3
        ? t(
            `Та үүнийг ${worn} удаа өмссөн. Их дуртай нь илт байна.`,
            `You’ve worn it ${worn} times. You clearly love it.`,
          )
        : null;
  const audience = g.audience && g.audience !== 'unisex' ? g.audience : 'all';
  const pairs = partners[g.category]
    .map(
      (category) =>
        data.garments
          .filter(
            (other) =>
              other.category === category &&
              other.availability === 'available' &&
              fitsAudience(other, audience),
          )
          .map((other) => ({
            other,
            score: harmonyScore([g, other]) + rateGarment(other, prefs).overall / 3,
          }))
          .sort((a, b) => b.score - a.score)[0]?.other,
    )
    .filter((other): other is Garment => !!other);
  return {
    rating,
    mood: moodOf(rating.overall),
    lines: [opener, why(g, prefs, g.id), ...(habit ? [habit] : [])],
    pairs,
  };
}

/** Oyu's look back at the last seven days of the wear log, and a piece worth bringing back. */
export function reviewWeek(data: Workspace, today = new Date()) {
  const day = (back: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - back);
    return localDate(date);
  };
  const end = day(0);
  const logs = data.wearLogs.filter(
    (log) => log.date >= day(6) && log.date <= end && log.garmentIds.length,
  );
  const counts = new Map<string, number>();
  for (const log of logs)
    for (const id of log.garmentIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const worn = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ garment: data.garments.find((g) => g.id === id), count }))
    .filter((entry): entry is { garment: Garment; count: number } => !!entry.garment);
  const recent = new Set(
    data.wearLogs
      .filter((log) => log.date >= day(29) && log.date <= end)
      .flatMap((log) => log.garmentIds),
  );
  const resting = data.garments.filter((g) => g.availability === 'available' && !recent.has(g.id));
  // A favourite first, then something Oyu can put on the user in live try-on.
  const forgotten =
    resting.find((g) => g.favorite) ??
    resting.find((g) => tryOnCategories.includes(g.category)) ??
    resting[0] ??
    null;
  const bringBack = forgotten
    ? t(
        `«${nameOf(forgotten)}» удаан өмсөгдөөгүй байна. Энэ долоо хоногт нэг өмсөөд үзээрэй.`,
        `“${nameOf(forgotten)}” hasn’t been worn in a while. Wear it once this week.`,
      )
    : null;
  if (!logs.length)
    return {
      mood: 'think' as OyuMood,
      lines: [
        t(
          'Энэ долоо хоногт хувцаслалтаа тэмдэглээгүй байна. Өнөөдрөөс эхлэх үү?',
          'You haven’t logged any outfits this week. Start today?',
        ),
        ...(bringBack ? [bringBack] : []),
      ],
      worn: [] as Garment[],
      forgotten,
    };
  const top = worn[0];
  return {
    mood: (logs.length >= 4 ? 'happy' : 'think') as OyuMood,
    lines: [
      t(
        `Энэ долоо хоногт ${logs.length} өдөр тэмдэглэж, ${counts.size} өөр хувцас өмссөн байна.`,
        `This week you logged ${logs.length} ${logs.length === 1 ? 'day' : 'days'} and wore ${counts.size} different ${counts.size === 1 ? 'piece' : 'pieces'}.`,
      ),
      ...(top && top.count > 1
        ? [
            t(
              `Хамгийн их өмссөн нь «${nameOf(top.garment)}» (${top.count} удаа).`,
              `Most worn: “${nameOf(top.garment)}” (${top.count} times).`,
            ),
          ]
        : []),
      ...(bringBack ? [bringBack] : []),
    ],
    worn: worn.slice(0, 6).map((entry) => entry.garment),
    forgotten,
  };
}
