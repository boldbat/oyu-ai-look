import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Garment, Page, Preferences, SavedLook, Workspace } from './types';
import { isCompleteLook, localDate, makeDemo } from './demo';
import {
  archiveGarment,
  parseWorkspace,
  recordWear,
  restoreGarment as restoreArchivedGarment,
} from './workspace';
const KEY = 'lookluxe.workspace.v1';
function restore(): Workspace {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return parseWorkspace(raw) ?? makeDemo();
  } catch {
    /* unavailable storage uses this session */
  }
  return makeDemo();
}
interface AppContextValue {
  data: Workspace;
  page: Page;
  navigate: (page: Page) => void;
  search: string;
  setSearch: (value: string) => void;
  addGarment: (garment: Omit<Garment, 'id' | 'addedAt'>) => void;
  updateGarment: (id: string, patch: Partial<Garment>) => void;
  deleteGarment: (id: string) => void;
  restoreGarment: (id: string) => void;
  saveLook: (look: Omit<SavedLook, 'id' | 'createdAt'> & { id?: string }) => void;
  deleteLook: (id: string) => void;
  logWear: (date: string, garmentIds: string[]) => void;
  updatePreferences: (patch: Partial<Preferences>) => void;
  resetWorkspace: () => void;
  notify: (message: string) => void;
  toast: string;
  openAccount: () => void;
  accountOpen: boolean;
  setAccountOpen: (value: boolean) => void;
}
const AppContext = createContext<AppContextValue | null>(null);
function getPage(): Page {
  const p = window.location.hash.slice(1);
  return ['home', 'wardrobe', 'studio', 'live', 'history', 'settings'].includes(p) ? (p as Page) : 'home';
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Workspace>(restore);
  const [page, setPage] = useState<Page>(getPage);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      setToast('Your browser storage is full. Export your workspace from Settings to keep a copy.');
    }
  }, [data]);
  useEffect(() => {
    const f = () => setPage(getPage());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        data.preferences.theme === 'system'
          ? m.matches
            ? 'dark'
            : 'light'
          : data.preferences.theme;
    };
    apply();
    m.addEventListener('change', apply);
    return () => m.removeEventListener('change', apply);
  }, [data.preferences.theme]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(id);
  }, [toast]);
  const value = useMemo<AppContextValue>(
    () => ({
      data,
      page,
      search,
      setSearch,
      toast,
      notify,
      accountOpen,
      setAccountOpen,
      openAccount: () => setAccountOpen(true),
      navigate: (p) => {
        window.location.hash = p;
        setPage(p);
        setSearch('');
        window.scrollTo({ top: 0, behavior: 'instant' });
      },
      addGarment: (g) => {
        setData((d) => ({
          ...d,
          garments: [{ ...g, id: crypto.randomUUID(), addedAt: localDate() }, ...d.garments],
        }));
        notify('Added to your wardrobe. A little more possibility.');
      },
      updateGarment: (id, patch) =>
        setData((d) => ({
          ...d,
          garments: d.garments.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),
      deleteGarment: (id) => {
        setData((d) => archiveGarment(d, id));
        notify('Piece archived. Your wear history is preserved.');
      },
      restoreGarment: (id) => {
        setData((d) => restoreArchivedGarment(d, id));
        notify('Piece restored to your wardrobe.');
      },
      saveLook: (look) => {
        if (
          !look.name.trim() ||
          !isCompleteLook(look.garmentIds, data.garments) ||
          look.garmentIds.some(
            (id) => data.garments.find((g) => g.id === id)?.availability !== 'available',
          )
        ) {
          notify('Choose a complete look with available pieces.');
          return;
        }
        setData((d) => ({
          ...d,
          savedLooks: look.id
            ? d.savedLooks.map((l) => (l.id === look.id ? { ...l, ...look } : l))
            : [{ ...look, id: crypto.randomUUID(), createdAt: localDate() }, ...d.savedLooks],
        }));
        notify('Your look is saved.');
      },
      deleteLook: (id) => {
        setData((d) => ({ ...d, savedLooks: d.savedLooks.filter((l) => l.id !== id) }));
        notify('Saved look removed.');
      },
      logWear: (date, garmentIds) => {
        try {
          setData(recordWear(data, date, garmentIds));
          notify(
            garmentIds.length
              ? 'Outfit recorded. Your style story, one day at a time.'
              : 'Wear record cleared for this day.',
          );
        } catch (error) {
          notify(error instanceof Error ? error.message : 'Unable to record this outfit.');
        }
      },
      updatePreferences: (patch) =>
        setData((d) => ({ ...d, preferences: { ...d.preferences, ...patch } })),
      resetWorkspace: () => {
        setData(makeDemo());
        notify('Sample workspace restored.');
      },
    }),
    [data, page, search, toast, accountOpen],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('Missing AppProvider');
  return context;
}
