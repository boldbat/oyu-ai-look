import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  Audience,
  Category,
  Garment,
  Page,
  Preferences,
  SavedLook,
  StyleTag,
  Workspace,
} from './types';
import { isCompleteLook, localDate, localizeSample, makeDemo } from './demo';
import { setLang, t } from './lang';
import {
  archiveGarment,
  parseWorkspace,
  recordWear,
  restoreGarment as restoreArchivedGarment,
  upgradeSample,
} from './workspace';
const KEY = 'lookluxe.workspace.v1';
function restore(): Workspace {
  try {
    const raw = localStorage.getItem(KEY);
    const stored = raw ? parseWorkspace(raw) : null;
    if (stored) return upgradeSample(stored);
  } catch {
    /* unavailable storage uses this session */
  }
  return makeDemo();
}
/** A request to open a page in a particular state, e.g. a garment preselected for try-on. */
export interface PageIntent {
  page: Page;
  category?: Category | 'all';
  filter?: string;
  audience?: Audience | 'all';
  style?: StyleTag | 'all';
  garmentIds?: string[];
  nonce: number;
}
interface AppContextValue {
  data: Workspace;
  page: Page;
  navigate: (page: Page) => void;
  intent: PageIntent | null;
  openWith: (intent: Omit<PageIntent, 'nonce'>) => void;
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
  return ['home', 'wardrobe', 'studio', 'live', 'history', 'settings'].includes(p)
    ? (p as Page)
    : 'home';
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Workspace>(restore);
  const [page, setPage] = useState<Page>(getPage);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [intent, setIntent] = useState<PageIntent | null>(null);
  const notify = (message: string) => setToast(message);
  // The saved preference decides the language before anything below renders.
  setLang(data.preferences.language);
  /** What pages see: sample text in the current language; stored data stays as saved. */
  const view = useMemo(() => localizeSample(data), [data]);
  const navigate = (p: Page) => {
    window.location.hash = p;
    setPage(p);
    setSearch('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      setToast(
        t(
          'Хөтчийн санах ой дүүрсэн байна. Хуулбар үлдээхийн тулд Тохиргооноос орчноо татаж аваарай.',
          'Your browser storage is full. Download your workspace from Settings to keep a copy.',
        ),
      );
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
      data: view,
      page,
      search,
      setSearch,
      toast,
      notify,
      accountOpen,
      setAccountOpen,
      openAccount: () => setAccountOpen(true),
      navigate,
      intent,
      openWith: (next) => {
        setIntent({ ...next, nonce: Date.now() });
        navigate(next.page);
      },
      addGarment: (g) => {
        setData((d) => ({
          ...d,
          garments: [{ ...g, id: crypto.randomUUID(), addedAt: localDate() }, ...d.garments],
        }));
        notify(
          t(
            'Шүүгээнд нэмэгдлээ. Бас нэг шинэ боломж.',
            'Added to your wardrobe. One more way to wear it.',
          ),
        );
      },
      updateGarment: (id, patch) =>
        setData((d) => ({
          ...d,
          garments: d.garments.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),
      deleteGarment: (id) => {
        setData((d) => archiveGarment(d, id));
        notify(
          t(
            'Хувцсыг архивлалаа. Өмссөн түүх хадгалагдсан.',
            'Piece archived. Its wear history is kept.',
          ),
        );
      },
      restoreGarment: (id) => {
        setData((d) => restoreArchivedGarment(d, id));
        notify(t('Хувцас шүүгээнд буцаж ирлээ.', 'The piece is back in your wardrobe.'));
      },
      saveLook: (look) => {
        if (
          !look.name.trim() ||
          !isCompleteLook(look.garmentIds, data.garments) ||
          look.garmentIds.some(
            (id) => data.garments.find((g) => g.id === id)?.availability !== 'available',
          )
        ) {
          notify(
            t(
              'Өмсөхөд бэлэн хувцаснаас бүрэн хослол сонгоно уу.',
              'Choose a complete look from pieces that are ready to wear.',
            ),
          );
          return;
        }
        setData((d) => ({
          ...d,
          savedLooks: look.id
            ? d.savedLooks.map((l) => (l.id === look.id ? { ...l, ...look } : l))
            : [{ ...look, id: crypto.randomUUID(), createdAt: localDate() }, ...d.savedLooks],
        }));
        notify(t('Хослол хадгалагдлаа.', 'Look saved.'));
      },
      deleteLook: (id) => {
        setData((d) => ({ ...d, savedLooks: d.savedLooks.filter((l) => l.id !== id) }));
        notify(t('Хадгалсан хослолыг устгалаа.', 'Saved look deleted.'));
      },
      logWear: (date, garmentIds) => {
        try {
          setData(recordWear(data, date, garmentIds));
          notify(
            garmentIds.length
              ? t(
                  'Хослол бүртгэгдлээ. Таны стилийн түүх өдөр бүр баяжина.',
                  'Look logged. Your style history grows every day.',
                )
              : t('Энэ өдрийн өмссөн бүртгэлийг цэвэрлэлээ.', 'Cleared the wear log for this day.'),
          );
        } catch (error) {
          notify(
            error instanceof Error
              ? error.message
              : t('Энэ хослолыг бүртгэж чадсангүй.', 'Couldn’t log this look.'),
          );
        }
      },
      updatePreferences: (patch) =>
        setData((d) => ({ ...d, preferences: { ...d.preferences, ...patch } })),
      resetWorkspace: () => {
        setData(makeDemo());
        notify(t('Жишээ орчныг сэргээлээ.', 'Sample workspace restored.'));
      },
    }),
    [data, view, page, search, toast, accountOpen, intent],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('Missing AppProvider');
  return context;
}
