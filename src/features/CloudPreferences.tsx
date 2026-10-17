import { useEffect, useRef, useState } from 'react';
import { Cloud, CloudDownload, CloudUpload, LogOut, Trash2 } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { useApp } from '../lib/store';
import type { CloudUser, SavedCloudPreferences } from '../lib/firebase-preferences';
import './cloud-preferences.css';

type CloudClient = typeof import('../lib/firebase-preferences');
type Action = 'connect' | 'disconnect' | 'save' | 'load' | 'remove';

export function CloudPreferences() {
  const { data, page, updatePreferences } = useApp();
  const [client, setClient] = useState<CloudClient | null>(null);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<SavedCloudPreferences | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const operation = useRef(0);

  useEffect(() => {
    if (page !== 'settings') return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setReady(false);
    setError('');
    void import('../lib/firebase-preferences')
      .then((sdk) => {
        if (!active) return;
        setClient(sdk);
        unsubscribe = sdk.observeCloudUser(
          (next) => {
            if (!active) return;
            operation.current++;
            setUser(next);
            setReady(true);
            setBusy(null);
            setPreview(null);
            setRemoveOpen(false);
            setMessage('');
            setError('');
          },
          (failure) => {
            if (active) setError(sdk.cloudErrorMessage(failure));
          },
        );
      })
      .catch(() => {
        if (active)
          setError('Cloud preferences could not load. Your local workspace is still available.');
      });
    return () => {
      active = false;
      operation.current++;
      unsubscribe?.();
    };
  }, [page, attempt]);

  async function perform(action: Action) {
    if (!client || busy || !ready) return;
    if (!user && !['connect', 'disconnect'].includes(action)) return;
    const current = ++operation.current;
    setBusy(action);
    setError('');
    setMessage('');
    try {
      if (action === 'connect') await client.connectGoogle();
      if (action === 'disconnect') await client.disconnectGoogle();
      if (action === 'save') await client.saveCloudPreferences(user!.uid, data.preferences);
      if (action === 'remove') await client.removeCloudPreferences(user!.uid);
      if (action === 'load') {
        const saved = await client.loadCloudPreferences(user!.uid);
        if (operation.current !== current) return;
        if (saved) setPreview(saved);
        else setMessage('No preferences saved yet. Save this device’s preferences to get started.');
      }
      if (operation.current !== current) return;
      if (action === 'save') setMessage('Your preferences are saved to your Google account.');
      if (action === 'remove') setMessage('Cloud preferences removed. This device is unchanged.');
    } catch (failure) {
      if (operation.current === current) setError(client.cloudErrorMessage(failure));
    } finally {
      if (operation.current === current) setBusy(null);
    }
  }

  if (page !== 'settings') return null;
  return (
    <section
      className="card settings-card cloud-preferences"
      aria-labelledby="cloud-preferences-title"
    >
      <div className="section-heading">
        <div>
          <h2 id="cloud-preferences-title">Your style, wherever you go</h2>
          <p className="muted">
            Keep your name, style choices and appearance with your Google account.
          </p>
        </div>
        <Cloud className="cloud-preferences-icon" size={25} aria-hidden="true" />
      </div>
      <p className="cloud-preferences-disclosure">
        Save or apply preferences when you choose. Your wardrobe, photos, saved outfits and live
        fitting room stay on their current connection.
      </p>
      {!ready && !error && <p role="status">Connecting to cloud preferences…</p>}
      {!ready && error && (
        <button className="button secondary small" onClick={() => setAttempt((value) => value + 1)}>
          Try again
        </button>
      )}
      {ready && !user && (
        <button
          className="button secondary"
          disabled={!!busy}
          onClick={() => void perform('connect')}
        >
          <Cloud size={16} /> {busy === 'connect' ? 'Opening Google…' : 'Continue with Google'}
        </button>
      )}
      {ready && user && (
        <>
          <div className="cloud-preferences-account">
            <span>
              <strong>{user.displayName || 'Connected with Google'}</strong>
              {user.email && <small>{user.email}</small>}
            </span>
            <button
              className="button ghost small"
              disabled={!!busy}
              onClick={() => void perform('disconnect')}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
          <div className="cloud-preferences-actions">
            <button className="button small" disabled={!!busy} onClick={() => void perform('save')}>
              <CloudUpload size={15} /> {busy === 'save' ? 'Saving…' : 'Save preferences'}
            </button>
            <button
              className="button secondary small"
              disabled={!!busy}
              onClick={() => void perform('load')}
            >
              <CloudDownload size={15} /> {busy === 'load' ? 'Loading…' : 'Load saved preferences'}
            </button>
            <button
              className="button ghost small danger-text"
              disabled={!!busy}
              onClick={() => setRemoveOpen(true)}
            >
              <Trash2 size={14} /> Remove cloud copy
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="cloud-preferences-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="cloud-preferences-message" role="status">
          {message}
        </p>
      )}
      <small className="cloud-preferences-provider">Google sign-in · Saved with Firebase</small>
      {preview && (
        <Dialog title="Use your saved preferences?" onClose={() => setPreview(null)}>
          <p className="muted">
            This updates your display name, style choices and appearance on this device. Your
            wardrobe and saved outfits stay as they are.
          </p>
          <dl className="cloud-preferences-preview">
            <div>
              <dt>Name</dt>
              <dd>{preview.preferences.name}</dd>
            </div>
            <div>
              <dt>Styles</dt>
              <dd>{preview.preferences.styles.join(', ') || 'No styles selected'}</dd>
            </div>
            <div>
              <dt>Appearance</dt>
              <dd>{preview.preferences.theme}</dd>
            </div>
          </dl>
          {preview.updatedAt && (
            <p className="muted">Saved {new Date(preview.updatedAt).toLocaleString()}</p>
          )}
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setPreview(null)}>
              Keep this device’s preferences
            </button>
            <button
              className="button"
              onClick={() => {
                updatePreferences(preview.preferences);
                setPreview(null);
                setMessage('Saved preferences applied to this device.');
              }}
            >
              Apply saved preferences
            </button>
          </div>
        </Dialog>
      )}
      {removeOpen && (
        <Dialog title="Remove your cloud preferences?" onClose={() => setRemoveOpen(false)}>
          <p className="muted">
            This removes the saved preferences from your Google account. It does not change this
            device’s settings or delete your account.
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setRemoveOpen(false)}>
              Keep cloud copy
            </button>
            <button
              className="button danger"
              onClick={() => {
                setRemoveOpen(false);
                void perform('remove');
              }}
            >
              Remove cloud copy
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
