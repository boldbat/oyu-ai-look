import type { Workspace } from './types';
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDate(d);
}
export function makeDemo(): Workspace {
  return {
    garments: [
      {
        id: 'navy-top',
        name: 'The everyday knit',
        category: 'top',
        color: 'Navy',
        colorHex: '#303648',
        image: '/assets/navy-top.png',
        availability: 'available',
        favorite: true,
        addedAt: daysAgo(2),
      },
      {
        id: 'stone-trousers',
        name: 'Relaxed stone trousers',
        category: 'bottom',
        color: 'Stone',
        colorHex: '#b3aa99',
        image: '/assets/stone-trousers.png',
        availability: 'available',
        favorite: false,
        addedAt: daysAgo(3),
      },
      {
        id: 'white-sneakers',
        name: 'Essential white sneakers',
        category: 'footwear',
        color: 'White',
        colorHex: '#f0efeb',
        image: '/assets/white-sneakers.png',
        availability: 'available',
        favorite: true,
        addedAt: daysAgo(4),
      },
      {
        id: 'beige-top',
        name: 'Soft-touch crewneck',
        category: 'top',
        color: 'Cream',
        colorHex: '#d7cbb5',
        image: '/assets/beige-top.png',
        availability: 'available',
        favorite: false,
        addedAt: daysAgo(5),
      },
      {
        id: 'black-trousers',
        name: 'The tailored trouser',
        category: 'bottom',
        color: 'Black',
        colorHex: '#30302e',
        image: '/assets/black-trousers.png',
        availability: 'available',
        favorite: false,
        addedAt: daysAgo(6),
      },
      {
        id: 'black-sneakers',
        name: 'Everyday black sneakers',
        category: 'footwear',
        color: 'Black',
        colorHex: '#30302e',
        image: '/assets/black-sneakers.png',
        availability: 'available',
        favorite: false,
        addedAt: daysAgo(7),
      },
    ],
    archivedGarments: [],
    savedLooks: [
      {
        id: 'look-1',
        name: 'Everyday, elevated',
        garmentIds: ['navy-top', 'stone-trousers', 'white-sneakers'],
        createdAt: daysAgo(1),
      },
      {
        id: 'look-2',
        name: 'A softer kind of Monday',
        garmentIds: ['beige-top', 'black-trousers', 'white-sneakers'],
        createdAt: daysAgo(4),
      },
    ],
    wearLogs: [
      {
        id: 'wear-1',
        date: daysAgo(1),
        garmentIds: ['navy-top', 'stone-trousers', 'white-sneakers'],
      },
      {
        id: 'wear-2',
        date: daysAgo(3),
        garmentIds: ['beige-top', 'black-trousers', 'white-sneakers'],
      },
      {
        id: 'wear-3',
        date: daysAgo(5),
        garmentIds: ['navy-top', 'black-trousers', 'black-sneakers'],
      },
    ],
    analyses: [
      {
        id: 'score-1',
        date: daysAgo(1),
        title: 'Understated, put together',
        image: '/assets/minimal.png',
        overall: 88,
        dimensions: { color: 23, hairstyle: 21, accessories: 21, styling: 23 },
        note: 'A tonal palette and clean proportions make this look feel considered. A small accent would give it a little more personality.',
        sample: true,
      },
      {
        id: 'score-2',
        date: daysAgo(3),
        title: 'An everyday kind of classic',
        image: '/assets/casual.png',
        overall: 82,
        dimensions: { color: 22, hairstyle: 19, accessories: 18, styling: 23 },
        note: 'Easy layers and balanced neutrals work well together. Try a subtle accessory to bring the look into focus.',
        sample: true,
      },
      {
        id: 'score-3',
        date: daysAgo(5),
        title: 'A little business, a little you',
        image: '/assets/business.png',
        overall: 85,
        dimensions: { color: 22, hairstyle: 21, accessories: 20, styling: 22 },
        note: 'Structured tailoring and a calm palette make a cohesive combination.',
        sample: true,
      },
      {
        id: 'score-4',
        date: daysAgo(7),
        title: 'Your weekend uniform',
        image: '/assets/street.png',
        overall: 78,
        dimensions: { color: 20, hairstyle: 19, accessories: 18, styling: 21 },
        note: 'Relaxed silhouettes give this look an effortless feel. Keep one focal point to balance the outfit.',
        sample: true,
      },
    ],
    preferences: { name: 'Alex', styles: ['Minimal', 'Classic'], theme: 'light', language: 'en' },
  };
}
export function recommend(garments: Workspace['garments'], variant = 0) {
  const available = garments.filter((g) => g.availability === 'available');
  const dresses = available.filter((g) => g.category === 'dress');
  const hasSeparates =
    available.some((g) => g.category === 'top') && available.some((g) => g.category === 'bottom');
  const categories =
    dresses.length && (!hasSeparates || variant % 3 === 2)
      ? ['dress', 'footwear']
      : ['top', 'bottom', 'footwear'];
  return categories.flatMap((category, index) => {
    const items = available.filter((g) => g.category === category);
    return items.length
      ? [items[(variant + (index === 1 ? Math.floor(variant / 2) : 0)) % items.length]]
      : [];
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
