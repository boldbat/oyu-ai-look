import { useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Crown,
  Database,
  Globe2,
  Laptop,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { Dialog } from '../components/Dialog';
export function Settings() {
  const { data, updatePreferences, resetWorkspace, notify, openAccount } = useApp();
  const [name, setName] = useState(data.preferences.name);
  const [resetOpen, setResetOpen] = useState(false);
  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { ...data, exportedAt: new Date().toISOString(), workspace: 'local-sample' },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'oyu-ai-my-workspace.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Your workspace has been exported.');
  };
  return (
    <div className="settings-page page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">A SPACE THAT FEELS LIKE YOU</div>
          <h1>Make yourself at home.</h1>
          <p className="muted">Your preferences, your privacy, your personal style.</p>
        </div>
      </div>
      <div className="settings-grid">
        <div className="settings-main">
          <section className="card settings-card">
            <div className="section-heading">
              <div>
                <h2>The little details</h2>
                <p className="muted">Personalize your sample workspace.</p>
              </div>
              <span className="large-avatar">{data.preferences.name.slice(0, 1)}</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) {
                  updatePreferences({ name: name.trim() });
                  notify('A little more you. Profile saved.');
                }
              }}
            >
              <label className="field-label" htmlFor="display-name">
                What should we call you?
              </label>
              <div className="inline-form">
                <input
                  id="display-name"
                  className="field"
                  value={name}
                  maxLength={40}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
                <button className="button secondary" type="submit">
                  Save changes
                </button>
              </div>
            </form>
            <div className="setting-divider" />
            <label className="field-label">
              Your style, in a few words <span>Choose up to 3</span>
            </label>
            <div className="style-choices">
              {[
                'Minimal',
                'Classic',
                'Casual',
                'Business',
                'Street',
                'Romantic',
                'Sporty',
                'Formal',
              ].map((style) => (
                <button
                  key={style}
                  aria-pressed={data.preferences.styles.includes(style)}
                  className={`chip ${data.preferences.styles.includes(style) ? 'active' : ''}`}
                  onClick={() => {
                    const active = data.preferences.styles.includes(style);
                    if (!active && data.preferences.styles.length >= 3) {
                      notify('Pick up to three styles that feel most like you.');
                      return;
                    }
                    updatePreferences({
                      styles: active
                        ? data.preferences.styles.filter((s) => s !== style)
                        : [...data.preferences.styles, style],
                    });
                  }}
                >
                  {data.preferences.styles.includes(style) && <Check size={13} />} {style}
                </button>
              ))}
            </div>
          </section>
          <section className="card settings-card">
            <h2>Set the mood</h2>
            <p className="muted">A comfortable view, morning to night.</p>
            <div className="theme-options">
              {(
                [
                  { id: 'light', name: 'Light', icon: Sun },
                  { id: 'dark', name: 'Dark', icon: Moon },
                  { id: 'system', name: 'System', icon: Laptop },
                ] as const
              ).map(({ id, name: label, icon: Icon }) => (
                <button
                  key={id}
                  aria-pressed={data.preferences.theme === id}
                  className={`theme-option theme-${id} ${data.preferences.theme === id ? 'selected' : ''}`}
                  onClick={() => updatePreferences({ theme: id })}
                >
                  <div className="theme-preview">
                    <span />
                    <div>
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <span>
                    <Icon size={15} />
                    {label}
                    {data.preferences.theme === id && <Check size={14} />}
                  </span>
                </button>
              ))}
            </div>
            <div className="setting-divider" />
            <div className="setting-line">
              <span className="setting-icon">
                <Globe2 size={20} />
              </span>
              <div>
                <h3>Language</h3>
                <p>The web workspace is currently in English.</p>
              </div>
              <span className="subtle-pill">English</span>
            </div>
          </section>
          <section className="card settings-card">
            <h2>Always yours</h2>
            <p className="muted">
              Your sample collection stays in this browser. Take it with you anytime.
            </p>
            <div className="setting-line">
              <span className="setting-icon">
                <ArrowDownToLine size={20} />
              </span>
              <div>
                <h3>Export your workspace</h3>
                <p>Your clothes, saved looks, wear journal and preferences.</p>
              </div>
              <button className="button secondary small" onClick={exportData}>
                Export JSON
              </button>
            </div>
            <div className="setting-line">
              <span className="setting-icon">
                <Database size={20} />
              </span>
              <div>
                <h3>Start fresh</h3>
                <p>Restore the original sample collection on this device.</p>
              </div>
              <button className="button ghost small danger-text" onClick={() => setResetOpen(true)}>
                Reset sample
              </button>
            </div>
          </section>
        </div>
        <aside className="settings-aside">
          <section className="membership-card" id="membership">
            <span className="membership-icon">
              <Crown size={23} />
            </span>
            <div className="eyebrow">OYU AI MEMBERSHIP</div>
            <h2>
              A wardrobe with
              <br />
              more possibility.
            </h2>
            <p>Your personal style, thoughtfully supported.</p>
            <ul>
              {[
                'AI outfit scorecards',
                'A wardrobe that works together',
                'Personal style insights',
                'Photo and Live try-on',
              ].map((s) => (
                <li key={s}>
                  <Check size={16} />
                  {s}
                </li>
              ))}
            </ul>
            <button className="button full-width" onClick={openAccount}>
              View my account <ArrowUpRight size={16} />
            </button>
            <p className="membership-note">
              Your existing account’s access applies. Web subscription checkout is not available
              yet.
            </p>
          </section>
          <section className="card privacy-card">
            <ShieldCheck size={26} />
            <h3>Personal means private.</h3>
            <p>
              Sample uploads stay on this device. Connected AI processing asks for your explicit
              consent before sending a photo.
            </p>
            <button className="text-link" onClick={openAccount}>
              Manage my real account <ArrowRightIcon />
            </button>
          </section>
          <div className="quiet-note">
            <Sparkles size={16} />
            <p>
              Sample insights are illustrative. Your real style journey starts when you connect your
              account.
            </p>
          </div>
        </aside>
      </div>
      {resetOpen && (
        <Dialog title="A fresh start?" onClose={() => setResetOpen(false)}>
          <p className="muted">
            This replaces your local wardrobe, uploads, saved looks and wear records with the
            original sample collection. Your connected Oyu AI account is unaffected.
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setResetOpen(false)}>
              Keep my workspace
            </button>
            <button
              className="button danger"
              onClick={() => {
                resetWorkspace();
                setName('Alex');
                setResetOpen(false);
              }}
            >
              <Trash2 size={15} /> Reset sample
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={15} />;
}
