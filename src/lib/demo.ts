import { fitsAudience } from './types';
import { lang } from './lang';
import type { Audience, Category, Garment, Workspace } from './types';
import { harmonyScore, toneOf } from './style';

export const SAMPLE_VERSION = 5;

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDate(d);
}
function piece(
  id: string,
  name: string,
  category: Category,
  kind: string,
  color: string,
  colorHex: string,
  added: number,
  extra: Partial<Garment> = {},
): Garment {
  return {
    id,
    name,
    category,
    kind,
    color,
    colorHex,
    image: `/assets/wardrobe/${id}.jpg`,
    availability: 'available',
    favorite: false,
    addedAt: daysAgo(added),
    ...extra,
  };
}
const fav: Partial<Garment> = { favorite: true };
const women: Partial<Garment> = { audience: 'women' };
const oldMoney: Partial<Garment> = { style: 'Old money' };
const womenOld: Partial<Garment> = { audience: 'women', style: 'Old money' };
const womenEvening: Partial<Garment> = { audience: 'women', style: 'Evening' };
const menOld: Partial<Garment> = { audience: 'men', style: 'Old money' };
function look(id: string, name: string, days: number, garmentIds: string[]) {
  return { id, name, garmentIds, createdAt: daysAgo(days) };
}
function wear(id: string, days: number, garmentIds: string[]) {
  return { id, date: daysAgo(days), garmentIds };
}
/**
 * Try-on descriptions of the bundled sample pieces, written from each photo the way Decart's
 * VTON prompting guide asks: only what is visible (colour, fabric, cut, closures), in English.
 */
export const sampleDescriptions: Record<string, string> = {
  'navy-top': 'a navy long-sleeve crew-neck cotton jersey top with a relaxed fit',
  'stone-trousers':
    'light stone cotton chino trousers with a straight leg, belt loops, slanted side pockets and a button fly',
  'white-sneakers':
    'white smooth leather low-top lace-up sneakers with white laces and a flat white rubber sole',
  'beige-top': 'a cream long-sleeve crew-neck cotton jersey top with a relaxed fit',
  'black-trousers':
    'black straight-leg tailored trousers with a flat front, belt loops and side pockets',
  'black-sneakers':
    'black leather low-top lace-up sneakers with black laces and a thick black rubber sole',
  'white-tee': 'a plain white short-sleeve crew-neck cotton t-shirt with a regular fit',
  'striped-knit':
    'a chunky waffle-knit crew-neck sweater with wide navy and light grey horizontal stripes',
  'blue-jeans':
    'mid-blue washed denim jeans with a slim straight leg, five pockets and rolled-up cuffs',
  'denim-shorts':
    'light blue high-waisted denim shorts with distressed rips, five pockets and rolled cuffs',
  'denim-jacket':
    'a dark indigo denim chore jacket with a point collar, a closed button front and four patch pockets',
  'leather-jacket':
    'a black leather biker jacket zipped closed with an asymmetric silver zip, snap lapels and zip pockets',
  'chelsea-boots':
    'dark brown polished leather Chelsea ankle boots with elastic side panels and a low stacked heel',
  'horsebit-loafers':
    'tan suede loafers with a gold horsebit buckle across the vamp and a low flat heel',
  'baseball-cap': 'a mustard yellow cotton six-panel baseball cap with a curved brim',
  sunglasses:
    'browline sunglasses with black upper frames, thin silver metal rims and dark grey gradient lenses',
  'leather-handbag':
    'a cognac brown pebbled leather tote handbag with two rolled top handles, carried in the hand',
  'cream-cable-knit':
    'a cream cable-knit crew-neck wool sweater with long sleeves and ribbed cuffs and hem',
  'silk-blouse':
    'an ivory silk satin long-sleeve blouse with a point collar, a closed button front and buttoned cuffs',
  'navy-knit-polo':
    'a navy fine-knit short-sleeve polo shirt with a soft collar and a three-button placket',
  'wide-leg-trousers':
    'cream high-waisted wide-leg tailored trousers with front pleats and side pockets',
  'pleated-skirt': 'a camel high-waisted pleated A-line midi skirt in a smooth wool fabric',
  'navy-shirt-dress':
    'a navy long-sleeve knee-length shirt dress with a point collar, a full button front and a tie belt at the waist',
  'black-dress':
    'a black fitted knee-length sheath dress with cap sleeves, a round neckline and a seamed waist',
  'slip-dress':
    'a champagne satin midi slip dress with thin spaghetti straps, a V neckline and a body-skimming cut',
  'emerald-gown':
    'an emerald green satin floor-length evening gown with thin straps, a fitted bodice and a full flowing skirt',
  'floral-dress':
    'a cream midi tea dress with a navy and pink floral print, short puff sleeves, a round neckline, a fitted waist and a full gathered skirt',
  'trench-coat':
    'a beige double-breasted cotton trench coat, buttoned and belted at the waist, with a notched collar, epaulettes and buckled cuff straps',
  'tweed-jacket':
    'a cream boucle collarless cropped jacket with navy trim and a closed gold button front',
  'camel-coat':
    'a camel wool double-breasted knee-length overcoat, buttoned closed, with notched lapels and flap pockets',
  'ballet-flats': 'black leather pointed-toe ballet flats with a small bow on the toe',
  'slingback-heels':
    'beige leather slingback pumps with a black pointed cap toe, an ankle buckle strap and a low kitten heel',
  'silver-heels':
    'metallic silver strappy high-heel sandals with an ankle strap, thin straps across the foot and a stiletto heel',
  'chain-bag':
    'a black quilted leather shoulder bag with a gold chain strap and a gold turn-lock clasp',
  'pearl-necklace': 'a single-strand necklace of round cream pearls with a small gold clasp',
  'silk-scarf':
    'a navy silk square scarf with a gold baroque print and border, tied loosely around the neck',
  'oxford-shirt':
    'a white cotton long-sleeve button-down oxford shirt with a point collar and a closed button front',
  'linen-shirt':
    'a sky blue long-sleeve linen shirt with a button-down collar, a chest pocket and a closed button front',
  'navy-polo':
    'a navy cotton pique short-sleeve polo shirt with a flat knit collar and a three-button placket',
  'cashmere-crew': 'a camel cashmere crew-neck sweater with long sleeves and ribbed cuffs and hem',
  'quarter-zip':
    'a forest green knit quarter-zip pullover with a stand collar, a silver zip and long sleeves',
  'grey-trousers':
    'charcoal grey wool tailored trousers with front pleats, pressed creases and a straight leg',
  'beige-chinos':
    'beige cotton chino trousers with a straight leg, slanted side pockets and a button fly',
  'linen-trousers':
    'white linen drawstring trousers with an elastic waist, side pockets and a relaxed straight leg',
  'navy-blazer':
    'a navy double-breasted wool blazer, buttoned closed, with peaked lapels, gold buttons and flap pockets',
  'tweed-blazer':
    'a brown wool single-breasted sport coat, two buttons closed, with notched lapels, flap pockets and a chest pocket',
  'charcoal-overcoat':
    'a charcoal wool single-breasted knee-length overcoat, buttoned closed, with notched lapels and flap pockets',
  'penny-loafers':
    'burgundy polished leather penny loafers with a strap across the vamp and a low heel',
  'oxford-shoes': 'black polished leather cap-toe oxford dress shoes with black laces',
  'dress-watch':
    'a gold dress watch with a round white dial and a dark brown leather strap, worn on the wrist',
  'silk-tie': 'a navy silk necktie with a small white polka-dot pattern, knotted at the collar',
};
/** English names for the bundled sample pieces, looks and analyses (English mode). */
const english = {
  garments: {
    'navy-top': 'The everyday knit',
    'stone-trousers': 'Relaxed stone trousers',
    'white-sneakers': 'Essential white sneakers',
    'beige-top': 'Soft-touch crewneck',
    'black-trousers': 'The tailored trouser',
    'black-sneakers': 'Everyday black sneakers',
    'white-tee': 'The perfect white tee',
    'striped-knit': 'Striped chunky knit',
    'blue-jeans': 'Everyday blue jeans',
    'denim-shorts': 'Summer denim shorts',
    'denim-jacket': 'Indigo denim jacket',
    'leather-jacket': 'Black leather jacket',
    'chelsea-boots': 'Leather Chelsea boots',
    'horsebit-loafers': 'Suede horsebit loafers',
    'baseball-cap': 'Mustard baseball cap',
    sunglasses: 'Browline sunglasses',
    'leather-handbag': 'Cognac leather handbag',
    'cream-cable-knit': 'Cream cable-knit sweater',
    'silk-blouse': 'Ivory silk blouse',
    'navy-knit-polo': 'Navy knitted polo',
    'wide-leg-trousers': 'Cream wide-leg trousers',
    'pleated-skirt': 'Camel pleated midi skirt',
    'navy-shirt-dress': 'Navy belted shirt dress',
    'black-dress': 'Little black dress',
    'slip-dress': 'Champagne silk slip dress',
    'emerald-gown': 'Emerald satin gown',
    'floral-dress': 'Floral tea dress',
    'trench-coat': 'Classic trench coat',
    'tweed-jacket': 'Bouclé tweed jacket',
    'camel-coat': 'Camel wool overcoat',
    'ballet-flats': 'Black ballet flats',
    'slingback-heels': 'Two-tone slingbacks',
    'silver-heels': 'Silver strappy heels',
    'chain-bag': 'Quilted chain bag',
    'pearl-necklace': 'Pearl necklace',
    'silk-scarf': 'Navy silk scarf',
    'oxford-shirt': 'White oxford shirt',
    'linen-shirt': 'Sky blue linen shirt',
    'navy-polo': 'Navy piqué polo',
    'cashmere-crew': 'Camel cashmere crewneck',
    'quarter-zip': 'Forest green quarter-zip',
    'grey-trousers': 'Grey pleated trousers',
    'beige-chinos': 'Beige chinos',
    'linen-trousers': 'White linen trousers',
    'navy-blazer': 'Navy double-breasted blazer',
    'tweed-blazer': 'Brown wool sport coat',
    'charcoal-overcoat': 'Charcoal overcoat',
    'penny-loafers': 'Burgundy penny loafers',
    'oxford-shoes': 'Black oxford shoes',
    'dress-watch': 'Gold dress watch',
    'silk-tie': 'Navy polka-dot tie',
  } as Record<string, string>,
  looks: {
    'look-1': 'Everyday luxe',
    'look-2': 'Soft Monday',
    'look-3': 'Casual Friday',
    'look-4': 'Dinner, then drinks',
    'look-5': 'Saturday market',
    'look-6': 'Old money Sunday',
    'look-7': 'Beach getaway',
    'look-8': 'Gala evening',
    'look-9': 'Business meeting',
    'look-10': 'Golf club',
  } as Record<string, string>,
  analyses: {
    'score-1': {
      title: 'Understated, put together',
      note: 'A tonal palette and clean proportions make this look feel considered. A small accent would give it a little more personality.',
    },
    'score-2': {
      title: 'An everyday kind of classic',
      note: 'Easy layers and balanced neutrals work well together. Try a subtle accessory to bring the look into focus.',
    },
    'score-3': {
      title: 'A little business, a little you',
      note: 'Structured tailoring and a calm palette make a cohesive combination.',
    },
    'score-4': {
      title: 'Your weekend uniform',
      note: 'Relaxed silhouettes give this look an effortless feel. Keep one focal point to balance the outfit.',
    },
  } as Record<string, { title: string; note: string }>,
};
let original: Workspace | null = null;
let mongolianNames: Map<string, string> | null = null;
/**
 * A garment's name in the current language. Bundled sample pieces have a Mongolian and an
 * English name; a piece the user added or renamed keeps the name they gave it.
 */
export function nameOf(g: Pick<Garment, 'id' | 'name'>): string {
  const en = english.garments[g.id];
  if (!en) return g.name;
  original ??= makeDemo();
  mongolianNames ??= new Map(original.garments.map((piece) => [piece.id, piece.name]));
  const mn = mongolianNames.get(g.id);
  if (g.name !== en && g.name !== mn) return g.name;
  return lang() === 'en' ? en : (mn ?? g.name);
}
/**
 * The workspace as shown in English mode: bundled sample pieces, looks and analyses read in
 * English. Stored data is never changed, and anything the user renamed keeps their name.
 */
export function localizeSample(data: Workspace): Workspace {
  if (data.preferences.language !== 'en') return data;
  original ??= makeDemo();
  const names = new Map(original.garments.map((g) => [g.id, g.name]));
  const looks = new Map(original.savedLooks.map((l) => [l.id, l.name]));
  const analyses = new Map(original.analyses.map((a) => [a.id, a]));
  const garment = (g: Garment) =>
    english.garments[g.id] && names.get(g.id) === g.name
      ? { ...g, name: english.garments[g.id] }
      : g;
  return {
    ...data,
    garments: data.garments.map(garment),
    archivedGarments: data.archivedGarments.map(garment),
    savedLooks: data.savedLooks.map((l) =>
      english.looks[l.id] && looks.get(l.id) === l.name ? { ...l, name: english.looks[l.id] } : l,
    ),
    analyses: data.analyses.map((a) => {
      const sample = analyses.get(a.id);
      const text = english.analyses[a.id];
      return sample && text && a.title === sample.title && a.note === sample.note
        ? { ...a, ...text }
        : a;
    }),
  };
}
export function makeDemo(): Workspace {
  return {
    garments: [
      // Everyday essentials
      piece(
        'navy-top',
        'Өдөр тутмын сүлжмэл цамц',
        'top',
        'Long-sleeve top',
        'Navy',
        '#303648',
        2,
        fav,
      ),
      piece('stone-trousers', 'Сул цайвар бор өмд', 'bottom', 'Trousers', 'Stone', '#b3aa99', 3),
      piece(
        'white-sneakers',
        'Үндсэн цагаан пүүз',
        'footwear',
        'Sneakers',
        'White',
        '#f0efeb',
        4,
        fav,
      ),
      piece(
        'beige-top',
        'Зөөлөн дугуй захтай цамц',
        'top',
        'Long-sleeve top',
        'Cream',
        '#d7cbb5',
        5,
      ),
      piece('black-trousers', 'Оёмол хар өмд', 'bottom', 'Trousers', 'Black', '#30302e', 6),
      piece(
        'black-sneakers',
        'Өдөр тутмын хар пүүз',
        'footwear',
        'Sneakers',
        'Black',
        '#30302e',
        7,
        {
          availability: 'laundry',
        },
      ),
      piece('white-tee', 'Төгс цагаан футболк', 'top', 'T-shirt', 'White', '#f4f2ed', 8),
      piece(
        'striped-knit',
        'Судалтай бүдүүн сүлжмэл цамц',
        'top',
        'Knit sweater',
        'Navy',
        '#3b3f63',
        9,
      ),
      piece(
        'blue-jeans',
        'Өдөр тутмын цэнхэр жинсэн өмд',
        'bottom',
        'Jeans',
        'Denim',
        '#4d6a93',
        10,
        fav,
      ),
      piece('denim-shorts', 'Зуны жинсэн шорт', 'bottom', 'Shorts', 'Denim', '#9db7d3', 11, women),
      piece(
        'denim-jacket',
        'Индиго жинсэн хүрэм',
        'outerwear',
        'Denim jacket',
        'Denim',
        '#33445f',
        12,
      ),
      piece(
        'leather-jacket',
        'Хар савхин хүрэм',
        'outerwear',
        'Leather jacket',
        'Black',
        '#30302e',
        13,
      ),
      piece('chelsea-boots', 'Савхин челси гутал', 'footwear', 'Boots', 'Brown', '#5a3a2a', 14),
      piece(
        'horsebit-loafers',
        'Илгэн лофер',
        'footwear',
        'Loafers',
        'Camel',
        '#a77b4f',
        15,
        oldMoney,
      ),
      piece('baseball-cap', 'Гичийн шар малгай', 'accessory', 'Hat', 'Yellow', '#e3a92a', 16),
      piece('sunglasses', 'Хүрээтэй нарны шил', 'accessory', 'Sunglasses', 'Black', '#30302e', 17),
      piece(
        'leather-handbag',
        'Коньяк өнгийн савхин цүнх',
        'accessory',
        'Bag',
        'Brown',
        '#94592f',
        18,
        women,
      ),
      // Womenswear: old money and evening
      piece(
        'cream-cable-knit',
        'Цөцгий өнгийн гөрмөл сүлжмэл цамц',
        'top',
        'Knit sweater',
        'Cream',
        '#e8dcc0',
        19,
        { ...womenOld, favorite: true },
      ),
      piece(
        'silk-blouse',
        'Зааны ясан өнгийн торгон блуз',
        'top',
        'Blouse',
        'Cream',
        '#efe6d2',
        20,
        womenOld,
      ),
      piece(
        'navy-knit-polo',
        'Хар хөх сүлжмэл поло',
        'top',
        'Knit polo',
        'Navy',
        '#1f2740',
        21,
        womenOld,
      ),
      piece(
        'wide-leg-trousers',
        'Цөцгий өнгийн өргөн өмд',
        'bottom',
        'Trousers',
        'Cream',
        '#ece2cc',
        22,
        womenOld,
      ),
      piece(
        'pleated-skirt',
        'Тэмээн шар хуниастай миди банзал',
        'bottom',
        'Skirt',
        'Camel',
        '#b07d4a',
        23,
        womenOld,
      ),
      piece(
        'navy-shirt-dress',
        'Бүстэй хар хөх цамц даашинз',
        'dress',
        'Shirt dress',
        'Navy',
        '#1f2a44',
        24,
        womenOld,
      ),
      piece('black-dress', 'Бяцхан хар даашинз', 'dress', 'Sheath dress', 'Black', '#30302e', 25, {
        ...womenEvening,
        favorite: true,
      }),
      piece(
        'slip-dress',
        'Шампань өнгийн торгон даашинз',
        'dress',
        'Slip dress',
        'Champagne',
        '#d8b998',
        26,
        womenEvening,
      ),
      piece(
        'emerald-gown',
        'Маргад ногоон сатин даашинз',
        'dress',
        'Evening gown',
        'Green',
        '#1f6b45',
        27,
        womenEvening,
      ),
      piece(
        'floral-dress',
        'Цэцэгтэй даашинз',
        'dress',
        'Tea dress',
        'Pattern',
        '#d4a9b5',
        28,
        women,
      ),
      piece(
        'trench-coat',
        'Сонгодог тренч пальто',
        'outerwear',
        'Trench coat',
        'Stone',
        '#cdb48f',
        29,
        womenOld,
      ),
      piece(
        'tweed-jacket',
        'Букле твид хүрэм',
        'outerwear',
        'Tweed jacket',
        'Cream',
        '#efe7d4',
        30,
        womenOld,
      ),
      piece('camel-coat', 'Тэмээн шар ноосон пальто', 'outerwear', 'Coat', 'Camel', '#b07d4a', 31, {
        ...oldMoney,
        favorite: true,
      }),
      piece('ballet-flats', 'Хар балетка', 'footwear', 'Flats', 'Black', '#30302e', 32, womenOld),
      piece(
        'slingback-heels',
        'Хоёр өнгийн өсгийт гутал',
        'footwear',
        'Heels',
        'Stone',
        '#e2c9ae',
        33,
        womenOld,
      ),
      piece(
        'silver-heels',
        'Мөнгөлөг оосортой өсгийт',
        'footwear',
        'Heels',
        'Silver',
        '#c9c9cc',
        34,
        womenEvening,
      ),
      piece(
        'chain-bag',
        'Гинжин бариултай ширмэл цүнх',
        'accessory',
        'Bag',
        'Black',
        '#30302e',
        35,
        {
          ...womenOld,
          favorite: true,
        },
      ),
      piece(
        'pearl-necklace',
        'Сувдан зүүлт',
        'accessory',
        'Jewelry',
        'White',
        '#f1ece0',
        36,
        womenOld,
      ),
      piece(
        'silk-scarf',
        'Хар хөх торгон ороолт',
        'accessory',
        'Scarf',
        'Navy',
        '#253055',
        37,
        womenOld,
      ),
      // Menswear: old money
      piece('oxford-shirt', 'Цагаан оксфорд цамц', 'top', 'Shirt', 'White', '#f4f2ed', 38, {
        ...menOld,
        favorite: true,
      }),
      piece(
        'linen-shirt',
        'Тэнгэрийн цэнхэр маалинган цамц',
        'top',
        'Shirt',
        'Light blue',
        '#a9c4e4',
        39,
        menOld,
      ),
      piece('navy-polo', 'Хар хөх пике поло', 'top', 'Polo shirt', 'Navy', '#1f2740', 40, menOld),
      piece(
        'cashmere-crew',
        'Тэмээн шар ноолууран цамц',
        'top',
        'Knit sweater',
        'Camel',
        '#c08a5b',
        41,
        menOld,
      ),
      piece(
        'quarter-zip',
        'Ойн ногоон цахилгаантай цамц',
        'top',
        'Knit sweater',
        'Green',
        '#1e4d36',
        42,
        menOld,
      ),
      piece(
        'grey-trousers',
        'Саарал хуниастай өмд',
        'bottom',
        'Trousers',
        'Charcoal',
        '#4a4b4d',
        43,
        menOld,
      ),
      piece('beige-chinos', 'Шаргал чинос өмд', 'bottom', 'Chinos', 'Stone', '#d2c09e', 44, menOld),
      piece(
        'linen-trousers',
        'Цагаан маалинган өмд',
        'bottom',
        'Trousers',
        'White',
        '#f2efe8',
        45,
        menOld,
      ),
      piece(
        'navy-blazer',
        'Хар хөх давхар энгэртэй пиджак',
        'outerwear',
        'Blazer',
        'Navy',
        '#1f2740',
        46,
        { ...menOld, favorite: true },
      ),
      piece(
        'tweed-blazer',
        'Хүрэн ноосон пиджак',
        'outerwear',
        'Blazer',
        'Brown',
        '#5c4030',
        47,
        menOld,
      ),
      piece(
        'charcoal-overcoat',
        'Бараан саарал пальто',
        'outerwear',
        'Coat',
        'Charcoal',
        '#2f3032',
        48,
        menOld,
      ),
      piece(
        'penny-loafers',
        'Бордо өнгийн лофер',
        'footwear',
        'Loafers',
        'Brown',
        '#4a2420',
        49,
        menOld,
      ),
      piece(
        'oxford-shoes',
        'Хар оксфорд гутал',
        'footwear',
        'Dress shoes',
        'Black',
        '#30302e',
        50,
        menOld,
      ),
      piece(
        'dress-watch',
        'Алтан бугуйн цаг',
        'accessory',
        'Watch',
        'Brown',
        '#4a2c22',
        51,
        menOld,
      ),
      piece('silk-tie', 'Хар хөх толбот зангиа', 'accessory', 'Tie', 'Navy', '#1f2740', 52, menOld),
    ],
    archivedGarments: [],
    savedLooks: [
      look('look-1', 'Өдөр тутмын тансаг', 1, ['navy-top', 'stone-trousers', 'white-sneakers']),
      look('look-6', 'Old money ням гараг', 2, [
        'cream-cable-knit',
        'wide-leg-trousers',
        'ballet-flats',
        'camel-coat',
        'pearl-necklace',
      ]),
      look('look-9', 'Албан уулзалт', 3, [
        'oxford-shirt',
        'grey-trousers',
        'oxford-shoes',
        'navy-blazer',
        'silk-tie',
      ]),
      look('look-2', 'Зөөлөн даваа гараг', 4, ['beige-top', 'black-trousers', 'white-sneakers']),
      look('look-8', 'Гала үдэш', 5, ['emerald-gown', 'silver-heels', 'chain-bag']),
      look('look-3', 'Баасан гарагийн чөлөөт стиль', 6, [
        'striped-knit',
        'black-trousers',
        'horsebit-loafers',
        'leather-handbag',
      ]),
      look('look-10', 'Гольфын клуб', 7, [
        'navy-polo',
        'beige-chinos',
        'penny-loafers',
        'dress-watch',
      ]),
      look('look-4', 'Оройн зоог, дараа нь уулзалт', 9, [
        'black-dress',
        'leather-jacket',
        'silver-heels',
      ]),
      look('look-7', 'Далайн эргийн амралт', 10, [
        'linen-shirt',
        'linen-trousers',
        'penny-loafers',
        'sunglasses',
      ]),
      look('look-5', 'Бямба гарагийн зах', 12, [
        'white-tee',
        'denim-shorts',
        'white-sneakers',
        'sunglasses',
      ]),
    ],
    wearLogs: [
      wear('wear-1', 1, ['navy-top', 'stone-trousers', 'white-sneakers']),
      wear('wear-4', 2, ['white-tee', 'blue-jeans', 'denim-jacket', 'chelsea-boots']),
      wear('wear-2', 3, ['beige-top', 'black-trousers', 'white-sneakers']),
      wear('wear-10', 4, ['silk-blouse', 'wide-leg-trousers', 'slingback-heels', 'chain-bag']),
      wear('wear-3', 5, ['navy-top', 'black-trousers', 'black-sneakers']),
      wear('wear-5', 6, ['striped-knit', 'black-trousers', 'horsebit-loafers', 'leather-handbag']),
      wear('wear-11', 7, ['oxford-shirt', 'beige-chinos', 'penny-loafers', 'navy-blazer']),
      wear('wear-6', 8, ['black-dress', 'silver-heels']),
      wear('wear-12', 9, ['navy-shirt-dress', 'ballet-flats', 'silk-scarf']),
      wear('wear-7', 10, ['white-tee', 'blue-jeans', 'white-sneakers', 'baseball-cap']),
      wear('wear-13', 11, [
        'cashmere-crew',
        'grey-trousers',
        'oxford-shoes',
        'charcoal-overcoat',
        'dress-watch',
      ]),
      wear('wear-8', 12, ['beige-top', 'stone-trousers', 'denim-jacket', 'chelsea-boots']),
      wear('wear-14', 13, ['cream-cable-knit', 'pleated-skirt', 'ballet-flats', 'trench-coat']),
      wear('wear-15', 14, ['navy-polo', 'linen-trousers', 'penny-loafers']),
      wear('wear-9', 15, ['striped-knit', 'blue-jeans', 'white-sneakers']),
    ],
    analyses: [
      {
        id: 'score-1',
        date: daysAgo(1),
        title: 'Даруу, цэгцтэй',
        image: '/assets/looks/minimal.jpg',
        overall: 88,
        dimensions: { color: 23, hairstyle: 21, accessories: 21, styling: 23 },
        note: 'Ижил өнгөний хослол, цэвэрхэн харьцаа энэ төрхийг нямбай харагдуулж байна. Жижиг онцлох зүйл нэмбэл илүү хувийн өнгө аяс өгнө.',
        sample: true,
      },
      {
        id: 'score-2',
        date: daysAgo(3),
        title: 'Өдөр тутмын сонгодог',
        image: '/assets/looks/casual.jpg',
        overall: 82,
        dimensions: { color: 22, hairstyle: 19, accessories: 18, styling: 23 },
        note: 'Хөнгөн давхарлалт, тэнцвэртэй саармаг өнгөнүүд хоорондоо сайн зохицжээ. Төрхөө төвлөрүүлэхийн тулд даруухан аксессуар нэмээд үзээрэй.',
        sample: true,
      },
      {
        id: 'score-3',
        date: daysAgo(5),
        title: 'Бага зэрэг албан, бага зэрэг та',
        image: '/assets/looks/business.jpg',
        overall: 85,
        dimensions: { color: 22, hairstyle: 21, accessories: 20, styling: 22 },
        note: 'Хэлбэртэй оёдол, тайван өнгө нэгдмэл хослол бүрдүүлжээ.',
        sample: true,
      },
      {
        id: 'score-4',
        date: daysAgo(7),
        title: 'Таны амралтын өдрийн хувцас',
        image: '/assets/looks/street.jpg',
        overall: 78,
        dimensions: { color: 20, hairstyle: 19, accessories: 18, styling: 21 },
        note: 'Сул загвар энэ төрхөд хөнгөн, чөлөөтэй мэдрэмж өгнө. Хослолоо тэнцвэржүүлэхийн тулд нэг гол онцлохыг үлдээгээрэй.',
        sample: true,
      },
    ],
    preferences: { name: 'Alex', styles: ['Minimal', 'Classic'], theme: 'light', language: 'mn' },
    sampleVersion: SAMPLE_VERSION,
  };
}

/**
 * Complete core outfits (top + bottom + shoes, or dress + shoes) from available pieces.
 * Each next suggestion is the most harmonious combination after penalizing pieces that
 * were already suggested, so shuffling moves through the whole wardrobe.
 */
function suggestions(garments: Garment[], count: number, audience: Audience): Garment[][] {
  const available = garments.filter(
    (g) => g.availability === 'available' && fitsAudience(g, audience),
  );
  const of = (category: Category) => available.filter((g) => g.category === category);
  const shoes = of('footwear');
  const combos = [
    ...of('top').flatMap((top) =>
      of('bottom').flatMap((bottom) => shoes.map((shoe) => [top, bottom, shoe])),
    ),
    ...of('dress').flatMap((dress) => shoes.map((shoe) => [dress, shoe])),
  ].map((look) => ({ look, score: harmonyScore(look) }));
  const used = new Map<string, number>();
  const order: Garment[][] = [];
  while (order.length < Math.min(count, combos.length)) {
    let best = -1;
    let bestScore = -Infinity;
    combos.forEach(({ look, score }, index) => {
      if (order.includes(look)) return;
      const adjusted = score - look.reduce((sum, g) => sum + (used.get(g.id) ?? 0) * 1.6, 0);
      if (adjusted > bestScore) [best, bestScore] = [index, adjusted];
    });
    const { look } = combos[best];
    order.push(look);
    for (const g of look) used.set(g.id, (used.get(g.id) ?? 0) + 1);
  }
  return order;
}
export type LookAudience = 'all' | 'women' | 'men';
/**
 * The nth outfit idea. Looks never mix womenswear and menswear; with 'all' the ideas
 * alternate between a women's look and a men's look.
 */
export function recommend(
  garments: Workspace['garments'],
  variant = 0,
  audience: LookAudience = 'all',
) {
  const n = variant % 40;
  const groups: Audience[] = audience === 'all' ? ['women', 'men'] : [audience];
  const per = Math.floor(n / groups.length) + 1;
  const sequences = groups.map((group) => suggestions(garments, per, group));
  const seen = new Set<string>();
  const options = Array.from({ length: per }, (_, i) => sequences.map((seq) => seq[i]))
    .flat()
    .filter((look): look is Garment[] => {
      const key = look ? look.map((g) => g.id).join() : '';
      if (!look || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (options.length) return options[n % options.length];
  // Not enough pieces for a complete look: show what exists so the gap is visible.
  const available = garments.filter((g) => g.availability === 'available');
  return (['top', 'bottom', 'footwear'] as Category[]).flatMap((category) => {
    const item = available.find((g) => g.category === category);
    return item ? [item] : [];
  });
}
/** Optional layer and accessory that keep a suggested look harmonious. */
export function finishingTouches(
  look: Garment[],
  garments: Garment[],
  variant = 0,
  requested: LookAudience = 'all',
): Garment[] {
  if (
    !isCompleteLook(
      look.map((g) => g.id),
      garments,
    )
  )
    return [];
  const statement = look.some((g) => toneOf(g.color) === 'statement');
  // A look of unisex pieces only takes extras for the requested audience, or unisex ones.
  const audience = look.find((g) => g.audience && g.audience !== 'unisex')?.audience ?? requested;
  const fits = (g: Garment) =>
    audience === 'all' ? (g.audience ?? 'unisex') === 'unisex' : fitsAudience(g, audience);
  const style = look.find((g) => g.style && g.style !== 'Everyday')?.style;
  return (['outerwear', 'accessory'] as Category[]).flatMap((category, index) => {
    const options = garments.filter(
      (g) =>
        g.category === category &&
        g.availability === 'available' &&
        fits(g) &&
        (g.kind !== 'Tie' || look.some((piece) => piece.kind === 'Shirt')) &&
        !(statement && toneOf(g.color) === 'statement') &&
        !look.some((piece) => piece.color === 'Denim' && g.color === 'Denim'),
    );
    // Stay within the look's edit (e.g. old money) when it has matching pieces.
    const matching = options.filter((g) => style && g.style === style);
    const pool = matching.length ? matching : options;
    if (!pool.length || (variant + index) % 3 === 2) return [];
    const seed = look.reduce((sum, g) => sum + g.id.charCodeAt(0) + g.id.length * 7, variant);
    return [pool[(seed + index * 5) % pool.length]];
  });
}
export function isCompleteLook(ids: string[], garments: Workspace['garments']) {
  if (!ids.length || new Set(ids).size !== ids.length) return false;
  const pieces = ids.map((id) => garments.find((g) => g.id === id));
  if (pieces.some((g) => !g)) return false;
  const categories = pieces.map((g) => g!.category);
  const unique = new Set(categories);
  if (
    unique.size !== categories.length ||
    (unique.has('dress') && (unique.has('top') || unique.has('bottom')))
  )
    return false;
  return (
    unique.has('footwear') && (unique.has('dress') || (unique.has('top') && unique.has('bottom')))
  );
}
