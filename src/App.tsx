import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  Heart,
  History as HistoryIcon,
  LayoutDashboard,
  Menu,
  Search,
  Settings as SettingsIcon,
  Shirt,
  Sparkles,
  Video,
} from 'lucide-react';
import { useApp } from './lib/store';
import type { Page } from './lib/types';
import { Home } from './features/Home';
import { Wardrobe } from './features/Wardrobe';
import { Studio } from './features/Studio';
import { History } from './features/History';
import { Settings } from './features/Settings';
import { Account } from './features/Account';
import { PitchTryOn } from './features/PitchTryOn';
import { Dialog } from './components/Dialog';
const navigation: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'home', label: 'Overview', icon: LayoutDashboard },
  { id: 'wardrobe', label: 'My wardrobe', icon: Shirt },
  { id: 'studio', label: 'Look Studio', icon: Sparkles },
  { id: 'live', label: 'Live fitting room', icon: Video },
  { id: 'history', label: 'Style history', icon: HistoryIcon },
];
export default function App() {
  const { page, navigate, search, setSearch, data, toast, openAccount } = useApp();
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
    document.title = `${navigation.find((item) => item.id === page)?.label || 'Settings'} · Oyu AI`;
    setMobileOpen(false);
  }, [page]);
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
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        ref={sidebarRef}
        aria-label="Workspace navigation"
        className={`sidebar ${mobileOpen ? 'open' : ''}`}
      >
        <button className="brand" onClick={() => navigate('home')} aria-label="Oyu AI home">
          <span className="brand-mark">
            <img src="/assets/lookluxe_mark.png" alt="" />
          </span>
          <span>Oyu AI</span>
        </button>
        <button
          className="workspace-picker"
          onClick={() => {
            setMobileOpen(false);
            openAccount();
          }}
        >
          <span className="workspace-avatar">
            {data.preferences.name.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{page === 'live' ? 'Oyu AI account' : 'Personal workspace'}</strong>
            <small>{page === 'live' ? 'Account & wardrobe' : 'Sample collection'}</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <p className="nav-label">YOUR EVERYDAY, ELEVATED</p>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? 'active' : ''}`}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} strokeWidth={1.65} />
              <span>{label}</span>
              {id === 'studio' && <span className="nav-new">NEW</span>}
              {page === id && id !== 'studio' && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-separator" />
        <button
          className={`nav-item ${page === 'settings' ? 'active' : ''}`}
          onClick={() => navigate('settings')}
          aria-current={page === 'settings' ? 'page' : undefined}
        >
          <SettingsIcon size={19} strokeWidth={1.65} />
          <span>Settings</span>
        </button>
        <button
          className="nav-item"
          onClick={() => {
            setMobileOpen(false);
            setHelp(true);
          }}
        >
          <CircleHelp size={19} strokeWidth={1.65} />
          <span>A little guidance</span>
          <ArrowUpRight size={14} className="nav-end" />
        </button>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <span className="upgrade-icon">
              <Sparkles size={19} />
            </span>
            <h3>
              More possibilities.
              <br />
              More you.
            </h3>
            <p>
              Meet your wardrobe’s
              <br />
              full potential with Pro.
            </p>
            <button
              onClick={() => {
                navigate('settings');
                setTimeout(
                  () =>
                    document.getElementById('membership')?.scrollIntoView({ behavior: 'smooth' }),
                  100,
                );
              }}
            >
              Explore membership <ArrowUpRight size={16} />
            </button>
            <span className="upgrade-star">✳</span>
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
              <small>Sample workspace</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace" inert={mobileOpen}>
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              My workspace <ChevronRight size={13} />{' '}
              <strong>
                {page === 'home'
                  ? 'Overview'
                  : navigation.find((n) => n.id === page)?.label || 'Settings'}
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
                <Search size={16} />
                <input
                  aria-label="Search your wardrobe"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find something in your wardrobe"
                />
                <kbd>↵</kbd>
              </form>
            )}
            <span className="demo-pill">
              <span />
              {page === 'live' ? 'Live workspace' : 'Sample workspace'}
            </span>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => setNotifications(true)}
            >
              <Bell size={19} />
              <i />
            </button>
            <button className="top-avatar" aria-label="Open account" onClick={openAccount}>
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
            <span>A little less deciding. A lot more you.</span>
            <span>
              Made with intention <span>✦</span> Oyu AI
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span className="toast-icon">
            <Check size={15} />
          </span>
          {toast}
          <button aria-label="View settings" onClick={() => navigate('settings')}>
            <ChevronRight size={15} />
          </button>
        </div>
      )}
      <Account />
      {notifications && (
        <Dialog title="You’re all caught up" onClose={() => setNotifications(false)}>
          <div className="empty-state">
            <Bell size={32} />
            <h3>A quieter kind of app.</h3>
            <p>
              Only important account updates appear here. This sample workspace has no
              notifications.
            </p>
            <button className="button secondary" onClick={() => setNotifications(false)}>
              Back to my day
            </button>
          </div>
        </Dialog>
      )}
      {help && (
        <Dialog title="Your wardrobe, with a fresh perspective" onClose={() => setHelp(false)}>
          <p className="muted">A few small steps to make getting dressed feel effortless.</p>
          <div className="help-list">
            {[
              {
                icon: Shirt,
                title: 'Make room for what you own',
                text: 'Add pieces to My wardrobe. Choose an image, confirm the details, and make them yours.',
              },
              {
                icon: Compass,
                title: 'Discover new combinations',
                text: 'Build a look from your available pieces in Look Studio, then save it for another day.',
              },
              {
                icon: CalendarDays,
                title: 'Build your style story',
                text: 'Log what you actually wear. Your wear journal is separate from outfit photo analysis.',
              },
              {
                icon: Camera,
                title: 'Connect for the full picture',
                text: 'Sign in to your existing Oyu AI backend to view your real account. The sample workspace stays separate.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <Icon size={21} />
                <span>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </span>
              </div>
            ))}
          </div>
          <div className="notice">
            <Heart size={17} />
            <p>Your sample edits stay in this browser. Export a copy from Settings anytime.</p>
          </div>
          <button
            className="button"
            onClick={() => {
              setHelp(false);
              navigate('wardrobe');
            }}
          >
            Let’s start with your wardrobe <ArrowUpRight size={16} />
          </button>
        </Dialog>
      )}
    </div>
  );
}
