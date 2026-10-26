import { localized } from './lang';
export type Page = 'home' | 'wardrobe' | 'studio' | 'live' | 'history' | 'settings';
export type Category = 'top' | 'bottom' | 'footwear' | 'outerwear' | 'dress' | 'accessory';
export type Audience = 'women' | 'men' | 'unisex';
export type StyleTag = 'Old money' | 'Evening' | 'Everyday';
export interface Garment {
  id: string;
  name: string;
  category: Category;
  /** Specific garment type within the category, e.g. "Denim jacket" (shown via kindLabel). */
  kind?: string;
  /** Who the piece is cut for; missing means unisex. */
  audience?: Audience;
  /** The style edit the piece belongs to; missing means Everyday. */
  style?: StyleTag;
  color: string;
  colorHex: string;
  image: string;
  availability: 'available' | 'laundry';
  favorite: boolean;
  addedAt: string;
}
export interface SavedLook {
  id: string;
  name: string;
  garmentIds: string[];
  createdAt: string;
}
export interface WearLog {
  id: string;
  date: string;
  garmentIds: string[];
}
export interface Analysis {
  id: string;
  date: string;
  title: string;
  image: string;
  overall: number | null;
  dimensions: {
    color: number | null;
    hairstyle: number | null;
    accessories: number | null;
    styling: number | null;
  };
  note: string;
  sample: boolean;
}
export interface Preferences {
  name: string;
  styles: string[];
  theme: 'light' | 'dark' | 'system';
  language: 'en' | 'mn';
}
export interface Workspace {
  garments: Garment[];
  archivedGarments: Garment[];
  savedLooks: SavedLook[];
  wearLogs: WearLog[];
  analyses: Analysis[];
  preferences: Preferences;
  /** Version of the bundled sample collection this workspace has received. */
  sampleVersion?: number;
}
export const categoryLabels = localized<Category>({
  top: ['Цамц', 'Tops'],
  bottom: ['Өмд, банзал', 'Bottoms'],
  dress: ['Даашинз', 'Dresses'],
  outerwear: ['Гадуур хувцас', 'Outerwear'],
  footwear: ['Гутал', 'Shoes'],
  accessory: ['Аксессуар', 'Accessories'],
});
export const audienceLabels = localized<Audience>({
  women: ['Эмэгтэй', 'Women'],
  men: ['Эрэгтэй', 'Men'],
  unisex: ['Хүйс ялгаагүй', 'Unisex'],
});
export const styleTags: StyleTag[] = ['Old money', 'Evening', 'Everyday'];
/** Suggested garment types per category (stored keys; shown via kindLabel). */
export const kindSuggestions: Record<Category, string[]> = {
  top: ['T-shirt', 'Shirt', 'Blouse', 'Polo shirt', 'Knit sweater', 'Hoodie', 'Striped top'],
  bottom: ['Jeans', 'Trousers', 'Chinos', 'Skirt', 'Shorts', 'Leggings'],
  dress: ['Midi dress', 'Maxi dress', 'Slip dress', 'Shirt dress', 'Evening gown', 'Sundress'],
  outerwear: ['Coat', 'Trench coat', 'Blazer', 'Tweed jacket', 'Denim jacket', 'Leather jacket'],
  footwear: ['Sneakers', 'Boots', 'Loafers', 'Dress shoes', 'Heels', 'Flats', 'Sandals'],
  accessory: ['Bag', 'Hat', 'Scarf', 'Tie', 'Sunglasses', 'Belt', 'Watch', 'Jewelry'],
};
/** Whether a piece can be worn in a look for the given audience. */
export function fitsAudience(garment: Garment, audience: Audience | 'all') {
  return (
    audience === 'all' ||
    (garment.audience ?? 'unisex') === 'unisex' ||
    garment.audience === audience
  );
}
/** Categories the live fitting room can apply to the body. */
export const tryOnCategories: Category[] = ['top', 'bottom', 'dress', 'outerwear'];
