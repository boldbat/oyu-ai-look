import { useEffect, useRef, useState } from 'react';
import { CloudArrowDown, CloudArrowUp, GoogleLogo, SignOut, Trash } from '@phosphor-icons/react';
import { Dialog } from '../components/Dialog';
import { useApp } from '../lib/store';
import type { CloudUser, SavedCloudPreferences } from '../lib/firebase-preferences';
import { formatDateTime } from '../lib/i18n';
import { localized, t } from '../lib/lang';
import './cloud-preferences.css';

type CloudClient = typeof import('../lib/firebase-preferences');
type Action = 'connect' | 'disconnect' | 'save' | 'load' | 'remove';
const themeLabels = localized({
  light: ['Цайвар', 'Light'],
  dark: ['Бараан', 'Dark'],
  system: ['Системийн', 'System'],
});

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
          setError(
            t(
              'Үүлэн тохиргоог ачаалж чадсангүй. Энэ төхөөрөмжийн орчин хэвээр ашиглагдана.',
              'Cloud preferences couldn’t load. Your local workspace is still available.',
            ),
          );
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
        else
          setMessage(
            t(
              'Хадгалсан тохиргоо алга. Эхлэхийн тулд энэ төхөөрөмжийн тохиргоог хадгална уу.',
              'No saved preferences yet. Save this device’s preferences to get started.',
            ),
          );
      }
      if (operation.current !== current) return;
      if (action === 'save')
        setMessage(
          t(
            'Тохиргоо таны Google бүртгэлд хадгалагдлаа.',
            'Your preferences are saved to your Google account.',
          ),
        );
      if (action === 'remove')
        setMessage(
          t(
            'Үүлэн тохиргоог устгалаа. Энэ төхөөрөмж өөрчлөгдөөгүй.',
            'Cloud preferences removed. This device is unchanged.',
          ),
        );
    } catch (failure) {
      if (operation.current === current) setError(client.cloudErrorMessage(failure));
    } finally {
      if (operation.current === current) setBusy(null);
    }
  }

  if (page !== 'settings') return null;
  return (
    <section
      className="settings-section cloud-preferences"
      aria-labelledby="cloud-preferences-title"
    >
      <header>
        <h2 id="cloud-preferences-title">{t('Үүлэн хадгалалт', 'Cloud backup')}</h2>
        <p>
          {t(
            'Нэр, стилийн сонголт, харагдах байдлаа Google бүртгэлдээ хадгална.',
            'Keep your name, style choices and appearance with your Google account.',
          )}
        </p>
      </header>
      <div className="settings-body">
        <p className="cloud-preferences-disclosure">
          {t(
            'Тохиргоогоо хүссэн үедээ хадгалах эсвэл ашиглах боломжтой. Шүүгээ, зураг, хадгалсан хослол болон шууд өмсөж үзэх өрөө одоогийн холболтоороо хэвээр ажиллана.',
            'Save or apply your preferences whenever you like. Your wardrobe, photos, saved looks and live try-on keep working on their current connection.',
          )}
        </p>
        {!ready && !error && (
          <p role="status">
            {t('Үүлэн тохиргоонд холбогдож байна…', 'Connecting to cloud preferences…')}
          </p>
        )}
        {!ready && error && (
          <button
            className="button secondary small"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t('Дахин оролдох', 'Try again')}
          </button>
        )}
        {ready && !user && (
          <button
            className="button secondary"
            disabled={!!busy}
            onClick={() => void perform('connect')}
          >
            <GoogleLogo size={17} />
            {busy === 'connect'
              ? t('Google нээж байна…', 'Opening Google…')
              : t('Google-ээр үргэлжлүүлэх', 'Continue with Google')}
          </button>
        )}
        {ready && user && (
          <>
            <div className="cloud-preferences-account">
              <span>
                <strong>
                  {user.displayName || t('Google-ээр холбогдсон', 'Connected with Google')}
                </strong>
                {user.email && <small>{user.email}</small>}
              </span>
              <button
                className="button ghost small"
                disabled={!!busy}
                onClick={() => void perform('disconnect')}
              >
                <SignOut size={14} weight="regular" /> {t('Гарах', 'Sign out')}
              </button>
            </div>
            <div className="cloud-preferences-actions">
              <button
                className="button small"
                disabled={!!busy}
                onClick={() => void perform('save')}
              >
                <CloudArrowUp size={15} weight="regular" />{' '}
                {busy === 'save'
                  ? t('Хадгалж байна…', 'Saving…')
                  : t('Тохиргоо хадгалах', 'Save preferences')}
              </button>
              <button
                className="button secondary small"
                disabled={!!busy}
                onClick={() => void perform('load')}
              >
                <CloudArrowDown size={15} weight="regular" />{' '}
                {busy === 'load'
                  ? t('Ачааллаж байна…', 'Loading…')
                  : t('Хадгалсан тохиргоо ачаалах', 'Load saved preferences')}
              </button>
              <button
                className="button ghost small danger-text"
                disabled={!!busy}
                onClick={() => setRemoveOpen(true)}
              >
                <Trash size={14} weight="regular" />{' '}
                {t('Үүлэн хуулбар устгах', 'Remove cloud copy')}
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
        <small className="cloud-preferences-provider">
          {t('Google нэвтрэлт · Firebase-д хадгална', 'Google sign-in · Saved with Firebase')}
        </small>
      </div>
      {preview && (
        <Dialog
          title={t('Хадгалсан тохиргоогоо ашиглах уу?', 'Use your saved preferences?')}
          onClose={() => setPreview(null)}
        >
          <p className="muted">
            {t(
              'Энэ төхөөрөмж дээрх таны нэр, стилийн сонголт, харагдах байдлыг шинэчилнэ. Шүүгээ болон хадгалсан хослол хэвээр үлдэнэ.',
              'This updates your name, style choices and appearance on this device. Your wardrobe and saved looks stay as they are.',
            )}
          </p>
          <dl className="cloud-preferences-preview">
            <div>
              <dt>{t('Нэр', 'Name')}</dt>
              <dd>{preview.preferences.name}</dd>
            </div>
            <div>
              <dt>{t('Стиль', 'Styles')}</dt>
              <dd>
                {preview.preferences.styles.join(', ') ||
                  t('Стиль сонгоогүй', 'No styles selected')}
              </dd>
            </div>
            <div>
              <dt>{t('Харагдах байдал', 'Appearance')}</dt>
              <dd>{themeLabels[preview.preferences.theme]}</dd>
            </div>
          </dl>
          {preview.updatedAt && (
            <p className="muted">
              {t(
                `Хадгалсан: ${formatDateTime(new Date(preview.updatedAt))}`,
                `Saved ${formatDateTime(new Date(preview.updatedAt))}`,
              )}
            </p>
          )}
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setPreview(null)}>
              {t('Энэ төхөөрөмжийн тохиргоог үлдээх', 'Keep this device’s preferences')}
            </button>
            <button
              className="button"
              onClick={() => {
                updatePreferences(preview.preferences);
                setPreview(null);
                setMessage(
                  t(
                    'Хадгалсан тохиргоог энэ төхөөрөмжид ашиглалаа.',
                    'Saved preferences applied to this device.',
                  ),
                );
              }}
            >
              {t('Хадгалсан тохиргоог ашиглах', 'Apply saved preferences')}
            </button>
          </div>
        </Dialog>
      )}
      {removeOpen && (
        <Dialog
          title={t('Үүлэн тохиргоогоо устгах уу?', 'Remove your cloud preferences?')}
          onClose={() => setRemoveOpen(false)}
        >
          <p className="muted">
            {t(
              'Энэ нь таны Google бүртгэлээс хадгалсан тохиргоог устгана. Энэ төхөөрөмжийн тохиргоог өөрчлөхгүй, бүртгэлийг тань устгахгүй.',
              'This removes the saved preferences from your Google account. It doesn’t change this device’s settings or delete your account.',
            )}
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setRemoveOpen(false)}>
              {t('Үүлэн хуулбарыг үлдээх', 'Keep cloud copy')}
            </button>
            <button
              className="button danger"
              onClick={() => {
                setRemoveOpen(false);
                void perform('remove');
              }}
            >
              {t('Үүлэн хуулбар устгах', 'Remove cloud copy')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
