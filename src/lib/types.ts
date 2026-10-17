export type Page = 'home' | 'wardrobe' | 'studio' | 'live' | 'history' | 'settings';
export type Category = 'top' | 'bottom' | 'footwear' | 'outerwear' | 'dress' | 'accessory';
export interface Garment {
  id: string;
  name: string;
  category: Category;
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
}
export const categoryLabels: Record<Category, string> = {
  top: 'Tops',
  bottom: 'Bottoms',
  footwear: 'Footwear',
  outerwear: 'Outerwear',
  dress: 'Dresses',
  accessory: 'Accessories',
};
