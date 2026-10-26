import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Camera,
  CaretRight,
  Check,
  ClockCounterClockwise,
  CoatHanger,
  GearSix,
  Info,
  List,
  MagnifyingGlass,
  Question,
  SquaresFour,
  Swatches,
  VideoCamera,
} from '@phosphor-icons/react';
import { useApp } from './lib/store';
import type { Page } from './lib/types';
import { Home } from './features/Home';
import { Wardrobe } from './features/Wardrobe';
import { Studio } from './features/Studio';
import { History } from './features/History';
import { Settings } from './features/Settings';
import { Account } from './features/Account';
import { PitchTryOn } from './features/PitchTryOn';
import { OyuCompanion } from './components/Oyu';
import { useOyuSettings } from './lib/oyu-settings';
import { OyuOutfitCheck } from './features/OyuOutfitCheck';
import { Dialog } from './components/Dialog';
import { journeySteps } from './components/Journey';
import { t } from './lib/lang';
/** A function so the labels follow the current language; call it while rendering. */
const navigation = (): { id: Page; label: string; icon: typeof SquaresFour }[] => [
  { id: 'home', label: t('Тойм', 'Overview'), icon: SquaresFour },
  { id: 'wardrobe', label: t('Миний шүүгээ', 'My wardrobe'), icon: CoatHanger },
  { id: 'studio', label: t('Хослолын студи', 'Look studio'), icon: Swatches },
  { id: 'live', label: t('Шууд өмсөж үзэх', 'Live try-on'), icon: VideoCamera },
  { id: 'history', label: t('Хувцаслалтын түүх', 'Style history'), icon: ClockCounterClockwise },
];
export default function App() {
  const { page, navigate, search, setSearch, data, toast, openAccount, updatePreferences } =
    useApp();
  const language = data.preferences.language;
  const oyu = useOyuSettings();
  const [checkOutfit, setCheckOutfit] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () =>
      Array.from(
        sidebarRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
      );
    controls()[0]?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        return;
      }
      if (event.key === 'Tab') {
        const list = controls();
        const first = list[0],
          last = list[list.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      previous?.focus();
    };
  }, [mobileOpen]);
  const [help, setHelp] = useState(false);
  const [notifications, setNotifications] = useState(false);
  useEffect(() => {
    setMobileOpen(false);
  }, [page]);
  // The tab title names the page in the current language, so it follows both.
  useEffect(() => {
    document.title = `${navigation().find((item) => item.id === page)?.label || t('Тохиргоо', 'Settings')} · Oyu AI`;
  }, [page, language]);
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        {t('Үндсэн агуулга руу шилжих', 'Skip to content')}
      </a>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label={t('Цэс хаах', 'Close navigation')}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        ref={sidebarRef}
        aria-label={t('Орчны цэс', 'Workspace navigation')}
        className={`sidebar ${mobileOpen ? 'open' : ''}`}
      >
        <button
          className="brand"
          onClick={() => navigate('home')}
          aria-label={t('Oyu AI нүүр', 'Oyu AI home')}
        >
          <span className="brand-mark">
            <img src="/assets/lookluxe_mark.png" alt="" />
          </span>
          <span>Oyu AI</span>
        </button>
        <nav aria-label={t('Үндсэн цэс', 'Main navigation')}>
          {navigation().map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-separator" />
        <button
          className={`nav-item ${page === 'settings' ? 'active' : ''}`}
          onClick={() => navigate('settings')}
          aria-current={page === 'settings' ? 'page' : undefined}
        >
          <GearSix size={20} />
          <span>{t('Тохиргоо', 'Settings')}</span>
        </button>
        <button
          className="nav-item"
          onClick={() => {
            setMobileOpen(false);
            setHelp(true);
          }}
        >
          <Question size={20} />
          <span>{t('Хэрхэн ажилладаг вэ', 'How it works')}</span>
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-pro">
            <strong>Oyu Pro</strong>
            <p>
              {t(
                'Хязгааргүй өмсөж үзэх, зургийн үнэлгээ, хувийн зөвлөмж.',
                'Unlimited try-ons, photo analysis and personal recommendations.',
              )}
            </p>
            <button
              className="text-link"
              onClick={() => {
                navigate('settings');
                setTimeout(
                  () =>
                    document.getElementById('membership')?.scrollIntoView({ behavior: 'smooth' }),
                  100,
                );
              }}
            >
              {t('Гишүүнчлэл үзэх', 'Explore membership')} <ArrowRight size={15} weight="regular" />
            </button>
          </div>
          <button
            className="profile-button"
            onClick={() => {
              setMobileOpen(false);
              openAccount();
            }}
          >
            <span className="avatar">{data.preferences.name.slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{data.preferences.name}</strong>
              <small>
                {page === 'live'
                  ? t('Oyu AI бүртгэл', 'Oyu AI account')
                  : t('Жишээ орчин', 'Sample workspace')}
              </small>
            </span>
            <CaretRight size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace" inert={mobileOpen}>
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              aria-label={t('Цэс нээх', 'Open navigation')}
              onClick={() => setMobileOpen(true)}
            >
              <List size={22} />
            </button>
            <span className="breadcrumb">
              Oyu AI <CaretRight size={12} weight="regular" />{' '}
              <strong>
                {page === 'home'
                  ? t('Тойм', 'Overview')
                  : navigation().find((n) => n.id === page)?.label || t('Тохиргоо', 'Settings')}
              </strong>
            </span>
          </div>
          <div className="topbar-actions">
            {page !== 'live' && (
              <form
                className="global-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = search;
                  navigate('wardrobe');
                  setSearch(q);
                }}
              >
                <MagnifyingGlass size={17} />
                <input
                  aria-label={t('Шүүгээнээсээ хайх', 'Search your wardrobe')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('Шүүгээнээсээ хувцас хайх', 'Find something in your wardrobe')}
                />
              </form>
            )}
            <span className="demo-pill">
              {page === 'live'
                ? t('Бодит орчин', 'Live workspace')
                : t('Жишээ орчин', 'Sample workspace')}
            </span>
            <button
              type="button"
              className="lang-toggle"
              aria-label={t('Англи хэл рүү шилжих', 'Switch to Mongolian')}
              title={t('Англи хэл рүү шилжих', 'Switch to Mongolian')}
              onClick={() => updatePreferences({ language: language === 'mn' ? 'en' : 'mn' })}
            >
              {language === 'mn' ? 'EN' : 'MN'}
            </button>
            <button
              className="icon-button notification-button"
              aria-label={t('Мэдэгдэл', 'Notifications')}
              onClick={() => setNotifications(true)}
            >
              <Bell size={20} />
            </button>
            <button
              className="top-avatar"
              aria-label={t('Бүртгэл нээх', 'Open account')}
              onClick={openAccount}
            >
              {data.preferences.name.slice(0, 1)}
            </button>
          </div>
        </header>
        <main id="main" className="main-content" tabIndex={-1}>
          <div hidden={page !== 'home'}>
            <Home />
          </div>
          <div hidden={page !== 'wardrobe'}>
            <Wardrobe />
          </div>
          <div hidden={page !== 'studio'}>
            <Studio />
          </div>
          {page === 'live' && <PitchTryOn covered={mobileOpen || help || notifications} />}
          <div hidden={page !== 'history'}>
            <History />
          </div>
          <div hidden={page !== 'settings'}>
            <Settings />
          </div>
          <footer className="footer">
            <span>
              © {new Date().getFullYear()} Oyu AI · {t('Хувийн стилист', 'Personal stylist')}
            </span>
            <span>
              {t(
                'Жишээ орчны өгөгдөл зөвхөн энэ хөтөчид хадгалагдана',
                'Sample workspace data stays in this browser only',
              )}
            </span>
          </footer>
        </main>
      </div>
      {page !== 'live' && oyu.companion && (
        <OyuCompanion hidden={mobileOpen} onCheckOutfit={() => setCheckOutfit(true)} />
      )}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-icon">
            <Check size={16} />
          </span>
          {toast}
          <button
            aria-label={t('Тохиргоо харах', 'View settings')}
            onClick={() => navigate('settings')}
          >
            <CaretRight size={15} weight="regular" />
          </button>
        </div>
      )}
      {checkOutfit && <OyuOutfitCheck onClose={() => setCheckOutfit(false)} />}
      <Account />
      {notifications && (
        <Dialog title={t('Мэдэгдэл', 'Notifications')} onClose={() => setNotifications(false)}>
          <div className="empty-state">
            <Bell size={32} />
            <h3>{t('Шинэ мэдэгдэл алга', 'You’re all caught up')}</h3>
            <p>
              {t(
                'Энд зөвхөн бүртгэлийн чухал мэдээлэл харагдана. Энэ жишээ орчинд мэдэгдэл байхгүй.',
                'Only important account updates appear here. This sample workspace has no notifications.',
              )}
            </p>
            <button className="button secondary" onClick={() => setNotifications(false)}>
              {t('Өдөртөө буцах', 'Back to my day')}
            </button>
          </div>
        </Dialog>
      )}
      {help && (
        <Dialog
          title={t('Oyu AI хэрхэн ажилладаг вэ', 'How Oyu AI works')}
          onClose={() => setHelp(false)}
        >
          <p className="muted">
            {t(
              'Oyu AI бол таны байгаа хувцсан дээр суурилсан хувийн стилист. Дөрвөн алхам:',
              'Oyu AI is a personal stylist built around the clothes you already own. Four steps:',
            )}
          </p>
          <div className="help-list">
            {journeySteps().map(({ page: target, title, text, icon: Icon }, index) => (
              <button
                key={target}
                className="help-step"
                onClick={() => {
                  setHelp(false);
                  navigate(target);
                }}
              >
                <Icon size={22} />
                <span>
                  <strong>
                    {index + 1}. {title}
                  </strong>
                  <p>{text}</p>
                </span>
                <CaretRight size={16} />
              </button>
            ))}
            <div>
              <Camera size={22} />
              <span>
                <strong>
                  {t(
                    'Бүрэн боломжийг ашиглахын тулд холбогдоорой',
                    'Connect for the full experience',
                  )}
                </strong>
                <p>
                  {t(
                    'Зургийн үнэлгээ болон жинхэнэ шүүгээгээ ашиглахын тулд Oyu AI бүртгэлдээ нэвтэрнэ үү. Жишээ орчин тусдаа хадгалагдана.',
                    'Sign in to your Oyu AI account to use photo analysis and your real wardrobe. The sample workspace is kept separate.',
                  )}
                </p>
              </span>
            </div>
          </div>
          <div className="notice">
            <Info size={18} />
            <p>
              {t(
                'Жишээ орчинд хийсэн өөрчлөлт энэ хөтөчид хадгалагдана. Тохиргооноос хүссэн үедээ хуулбар татаж аваарай.',
                'Your sample edits stay in this browser. Download a copy from Settings anytime.',
              )}
            </p>
          </div>
          <button
            className="button"
            onClick={() => {
              setHelp(false);
              navigate('wardrobe');
            }}
          >
            {t('Шүүгээнээсээ эхэлье', 'Let’s start with your wardrobe')} <ArrowRight size={16} />
          </button>
        </Dialog>
      )}
    </div>
  );
}
