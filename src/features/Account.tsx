import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  Check,
  CheckCircle,
  CircleNotch,
  CloudSlash,
  ImageSquare,
  LockKey,
  Plus,
  Scan,
  ShieldCheck,
  SignOut,
  TShirt,
  X,
} from '@phosphor-icons/react';
import { Dialog } from '../components/Dialog';
import { useApp } from '../lib/store';
import {
  accountApi,
  apiErrorMessage,
  ApiError,
  garmentConfirmation,
  newOperationKey,
} from '../lib/api';
import type {
  AiConsent,
  ApiGarment,
  ApiScore,
  AuthChallenge,
  AuthUser,
  Entitlement,
  GarmentCategory,
  HomeSummary,
  ImageOperation,
  ProfileResponse,
} from '../lib/api';
import { colorLabel, colorLabels, formatDate } from '../lib/i18n';
import { localized, t } from '../lib/lang';
import { categoryLabels } from '../lib/types';
import './account.css';
import AccountLooks from './AccountLooks';

type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
const dateLabel = (value: string) => formatDate(value, 'year');
const humanize = (value: string) => value.replaceAll('_', ' ');
/** A service key’s label in the current language; unknown values are shown as sent. */
const labelFor = (labels: Record<string, string>, value: string) => {
  const text = humanize(value);
  const match = Object.entries(labels).find(
    ([key]) => humanize(key).toLowerCase() === text.toLowerCase(),
  );
  return match?.[1] ?? text.charAt(0).toUpperCase() + text.slice(1);
};
const colorText = (value: string) =>
  labelFor(
    Object.fromEntries(Object.keys(colorLabels).map((key) => [key, colorLabel(key)])),
    value,
  );
const categoryText = (value: string) =>
  labelFor({ ...categoryLabels, underlayer: t('Дотуур давхарга', 'Underlayers') }, value);
const styleText = (value: string) => labelFor({}, value);
const tierLabels = localized({
  trial: ['Туршилт', 'Trial'],
  pro: ['Pro', 'Pro'],
  expired: ['Дууссан', 'Expired'],
});
const availabilityLabels = localized({
  available: ['Өмсөхөд бэлэн', 'Ready to wear'],
  laundry: ['Угаалгад байгаа', 'In the laundry'],
  repair: ['Засварт байгаа', 'In repair'],
  lent_out: ['Зээлүүлсэн', 'Lent out'],
  stored: ['Хадгалалтад', 'In storage'],
});
const garmentStatusLabels = localized({
  processing: ['Боловсруулж байна', 'Processing'],
  pending_confirmation: ['Баталгаажуулаагүй', 'Not confirmed'],
  active: ['Идэвхтэй', 'Active'],
  archived: ['Архивласан', 'Archived'],
  failed: ['Амжилтгүй', 'Failed'],
});
const scoreStatusLabels = localized({
  analyzing: ['Үнэлж байна', 'Analyzing'],
  scored: ['Үнэлсэн', 'Scored'],
  failed: ['Амжилтгүй', 'Failed'],
});
const layerLabels = localized({
  base: ['Суурь', 'Base'],
  mid: ['Дунд', 'Mid'],
  outer: ['Гадна', 'Outer'],
  standalone: ['Бие даасан', 'Standalone'],
});
const patternLabels = localized({
  solid: ['Хээгүй', 'Solid'],
  striped: ['Судалтай', 'Striped'],
  plaid: ['Дөрвөлжин хээтэй', 'Plaid'],
  checked: ['Дөрвөлжин хээтэй', 'Checked'],
  floral: ['Цэцэгтэй', 'Floral'],
  polka_dot: ['Цэгэн хээтэй', 'Polka dot'],
  graphic: ['Зурагтай', 'Graphic'],
});
const seasonLabels = localized({
  spring: ['хавар', 'spring'],
  summer: ['зун', 'summer'],
  autumn: ['намар', 'fall'],
  winter: ['өвөл', 'winter'],
});
const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export function Account() {
  const { accountOpen, setAccountOpen } = useApp();
  const user = useSyncExternalStore(accountApi.subscribe, () => accountApi.currentUser);
  if (!accountOpen) return null;
  return (
    <Dialog
      title={
        user
          ? t('Таны Oyu AI бүртгэл', 'Your Oyu AI account')
          : t('Oyu AI бүртгэл', 'Oyu AI account')
      }
      wide={!!user}
      onClose={() => setAccountOpen(false)}
    >
      {user ? <ConnectedAccount key={user.id} user={user} /> : <AuthForm />}
    </Dialog>
  );
}

function AuthForm() {
  const { data } = useApp();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!challenge && !blockedUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge, blockedUntil]);
  function changeMode(next: AuthMode) {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
    setCode('');
  }
  function rememberChallenge(next: AuthChallenge) {
    setChallenge(next);
    setNow(Date.now());
    setResendAt(Date.now() + next.resend_after * 1000);
    setExpiresAt(Date.now() + next.expires_in * 1000);
  }
  function failure(cause: unknown) {
    setError(apiErrorMessage(cause));
    if (cause instanceof ApiError && cause.code === 'rate_limited')
      setBlockedUntil(Date.now() + (cause.retryAfter ?? 60) * 1000);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (
      ['register', 'reset'].includes(mode) &&
      (Array.from(password).length < 8 || Array.from(password).length > 128)
    ) {
      setError(
        t(
          '8–128 тэмдэгттэй нууц үг сонгоно уу.',
          'Choose a password between 8 and 128 characters.',
        ),
      );
      return;
    }
    if (['verify', 'reset'].includes(mode) && !/^\d{8}$/.test(code)) {
      setError(
        t(
          'Имэйлээр ирсэн 8 оронтой кодыг оруулна уу.',
          'Enter the eight-digit code from your email.',
        ),
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await accountApi.login(email, password);
      else if (mode === 'register') {
        rememberChallenge(
          await accountApi.register(email, password, data.preferences.language, name),
        );
        setMode('verify');
        setPassword('');
      } else if (mode === 'verify' && challenge)
        await accountApi.verify(challenge.challenge_id, code);
      else if (mode === 'forgot') {
        rememberChallenge(await accountApi.forgotPassword(email, data.preferences.language));
        setMode('reset');
        setPassword('');
      } else if (mode === 'reset' && challenge) {
        await accountApi.resetPassword(challenge.challenge_id, code, password);
        changeMode('login');
        setChallenge(null);
        setNotice(
          t(
            'Нууц үг шинэчлэгдлээ. Шинэ нууц үгээрээ нэвтэрнэ үү.',
            'Password updated. Sign in with your new password.',
          ),
        );
      }
    } catch (cause) {
      failure(cause);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    if (!challenge) return;
    setBusy(true);
    setError('');
    try {
      rememberChallenge(await accountApi.resend(challenge.challenge_id));
      setCode('');
      setNotice(
        t(
          'Шинэ код илгээх хүсэлт явууллаа. Имэйлээ шалгана уу.',
          'A new code has been requested. Check your email.',
        ),
      );
    } catch (cause) {
      failure(cause);
    } finally {
      setBusy(false);
    }
  }
  if (!accountApi.configured)
    return (
      <div className="account-unconnected">
        <h3 className="account-title">
          {t('Жишээ орчинд ажиллаж байна', 'You’re using the sample workspace')}
        </h3>
        <p className="account-lead">
          {t(
            'Oyu AI-г жишээ орчинд туршиж үзээрэй. Таны өөрчлөлт зөвхөн энэ хөтөч дээр хадгалагдана.',
            'Explore Oyu AI in the sample workspace. Your edits stay in this browser.',
          )}
        </p>
        <div className="account-information">
          <CloudSlash size={20} />
          <div>
            <strong>
              {t('Бүртгэлийн холболт идэвхжээгүй байна', 'Account connection isn’t enabled')}
            </strong>
            <p>
              {accountApi.configurationError ??
                t(
                  'Нэвтрэх, шүүгээгээ ижилтгэх, AI үнэлгээ авахын тулд энэ хувилбарт Oyu AI бүртгэлийн үйлчилгээг тохируулсан байх шаардлагатай.',
                  'This preview needs a configured Oyu AI account service before you can sign in, sync your wardrobe, or request AI analysis.',
                )}
            </p>
          </div>
        </div>
        <p className="account-caption">
          {t(
            'Бүртгэл үүсгээгүй байна. Жишээ зураг, оноо таны хувийн бүртгэлээс тусдаа.',
            'No account has been created. Sample photos and scores are separate from your personal account.',
          )}
        </p>
      </div>
    );
  const isCode = mode === 'verify' || mode === 'reset';
  const titles: Record<AuthMode, string> = {
    login: t('Дахин тавтай морил', 'Welcome back'),
    register: t('Бүртгэл үүсгэх', 'Create your account'),
    verify: t('Имэйлээ шалгана уу', 'Check your email'),
    forgot: t('Нууц үгээ сэргээх', 'Reset your password'),
    reset: t('Шинэ нууц үг', 'New password'),
  };
  return (
    <div className="account-auth">
      <h3 className="account-title">{titles[mode]}</h3>
      <p className="account-lead account-intro">
        {isCode
          ? t(
              `${email} хаяг руу илгээсэн 8 оронтой кодыг оруулна уу. ${mode === 'reset' ? 'Бүртгэл байгаа бол сэргээх имэйл ирнэ.' : 'Ирэхэд хэсэг хугацаа шаардагдаж магадгүй.'}`,
              `Enter the eight-digit code sent to ${email}. ${mode === 'reset' ? 'If an account exists, you’ll receive a recovery email.' : 'It may take a moment to arrive.'}`,
            )
          : mode === 'forgot'
            ? t(
                'Бүртгэлтэй имэйлээ оруулна уу. Нууц үгээ шинэчлэх код илгээнэ.',
                'Enter your account email, and we’ll send you a code to reset your password.',
              )
            : t(
                'Oyu AI бүртгэлээрээ нэвтэрч, шүүгээгээ хаана ч авч яваарай.',
                'Sign in with your Oyu AI account and take your wardrobe with you anywhere.',
              )}
      </p>
      {(mode === 'login' || mode === 'register') && (
        <div
          className="segmented account-auth-tabs"
          aria-label={t('Бүртгэлд нэвтрэх', 'Account access')}
        >
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            aria-pressed={mode === 'login'}
            onClick={() => changeMode('login')}
            disabled={busy}
          >
            {t('Нэвтрэх', 'Sign in')}
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            aria-pressed={mode === 'register'}
            onClick={() => changeMode('register')}
            disabled={busy}
          >
            {t('Бүртгүүлэх', 'Create account')}
          </button>
        </div>
      )}
      <form className="account-form" onSubmit={submit}>
        {mode === 'register' && (
          <label>
            <span className="account-label">
              {t('Таны нэр', 'Your name')} <span>{t('заавал биш', 'optional')}</span>
            </span>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={120}
              placeholder={t('Таныг хэн гэж дуудах вэ?', 'What should we call you?')}
              disabled={busy}
            />
          </label>
        )}
        {!isCode && (
          <label>
            {t('Имэйл хаяг', 'Email address')}
            <input
              className="field"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              maxLength={254}
              required
              disabled={busy}
            />
          </label>
        )}
        {isCode && (
          <label>
            {t('Баталгаажуулах код', 'Verification code')}
            <input
              className="field account-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              pattern="[0-9]{8}"
              maxLength={8}
              placeholder="00000000"
              required
              disabled={busy}
            />
          </label>
        )}
        {['login', 'register', 'reset'].includes(mode) && (
          <label>
            {mode === 'reset' ? t('Шинэ нууц үг', 'New password') : t('Нууц үг', 'Password')}
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              disabled={busy}
            />
            {mode !== 'login' && (
              <span className="account-hint">
                {t(
                  '8–128 тэмдэгт. Хоосон зай бичсэнээрээ хадгалагдана.',
                  '8–128 characters. Spaces are kept as typed.',
                )}
              </span>
            )}
          </label>
        )}
        {mode === 'login' && (
          <button
            type="button"
            className="text-link account-link account-forgot"
            onClick={() => changeMode('forgot')}
            disabled={busy}
          >
            {t('Нууц үгээ мартсан уу?', 'Forgot password?')}
          </button>
        )}
        {error && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="account-success" role="status">
            {notice}
          </p>
        )}
        {isCode && expiresAt <= now && (
          <p className="account-caption">
            {t(
              'Кодын хугацаа дууссан. Үргэлжлүүлэхийн тулд шинэ код хүснэ үү.',
              'This code has expired. Request a new code to continue.',
            )}
          </p>
        )}
        <button
          className="button account-submit"
          disabled={busy || blockedUntil > now || (isCode && expiresAt <= now)}
          type="submit"
          aria-busy={busy}
        >
          {busy ? (
            <>
              <CircleNotch className="account-spin" size={18} />{' '}
              {t('Түр хүлээнэ үү…', 'Please wait…')}
            </>
          ) : (
            <>
              {
                {
                  login: t('Нэвтрэх', 'Sign in'),
                  register: t('Бүртгүүлэх', 'Create account'),
                  verify: t('Имэйл баталгаажуулах', 'Verify email'),
                  forgot: t('Сэргээх код илгээх', 'Send recovery code'),
                  reset: t('Нууц үг шинэчлэх', 'Reset password'),
                }[mode]
              }
              <ArrowRight size={18} />
            </>
          )}
        </button>
        {isCode && (
          <button
            className="text-link account-link"
            type="button"
            disabled={busy || resendAt > now || blockedUntil > now}
            onClick={resend}
          >
            {resendAt > now
              ? t(
                  `${Math.ceil((resendAt - now) / 1000)} секундын дараа дахин илгээх`,
                  `Resend code in ${Math.ceil((resendAt - now) / 1000)}s`,
                )
              : t('Шинэ код илгээх', 'Send a new code')}
          </button>
        )}
        {!['login', 'register'].includes(mode) && (
          <button
            type="button"
            className="text-link account-link"
            onClick={() => {
              changeMode('login');
              setChallenge(null);
            }}
            disabled={busy}
          >
            <ArrowLeft size={14} weight="regular" />{' '}
            {t('Нэвтрэх хэсэг рүү буцах', 'Back to sign in')}
          </button>
        )}
      </form>
      <p className="account-footnote">
        <LockKey size={16} />
        <span>
          {t(
            'Хуудсыг дахин ачаалсны дараа дахин нэвтрэх шаардлагатай. Жишээ орчин тусдаа хэвээр үлдэнэ.',
            'You’ll need to sign in again after reloading this page. The sample workspace stays separate.',
          )}
        </span>
      </p>
    </div>
  );
}

interface AccountData {
  profile?: ProfileResponse;
  entitlement?: Entitlement;
  garments?: ApiGarment[];
  summary?: HomeSummary;
  consent?: AiConsent;
}
function ConnectedAccount({ user }: { user: AuthUser }) {
  const [tab, setTab] = useState<'overview' | 'wardrobe' | 'looks' | 'analysis'>('overview');
  const [data, setData] = useState<AccountData>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(true);
  const [reload, setReload] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const { notify } = useApp();
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    setBusy(true);
    setErrors({});
    const requests = [
      ['profile', () => accountApi.profile(signal)],
      ['entitlement', () => accountApi.entitlement(signal)],
      [
        'garments',
        () =>
          accountApi.garments(100, undefined, signal).then((response) => {
            setHasMore(response.items.length === 100);
            return response.items;
          }),
      ],
      ['summary', () => accountApi.homeSummary(signal)],
      ['consent', () => accountApi.consent(signal)],
    ] as const;
    void Promise.allSettled(
      requests.map(async ([key, request]) => {
        try {
          const result = await request();
          if (!signal.aborted) setData((current) => ({ ...current, [key]: result }));
        } catch (error) {
          if (!signal.aborted)
            setErrors((current) => ({ ...current, [key]: apiErrorMessage(error) }));
        }
      }),
    ).then(() => {
      if (!signal.aborted) setBusy(false);
    });
    return () => controller.abort();
  }, [reload]);
  async function signOut() {
    try {
      await accountApi.logout();
      notify(t('Oyu AI бүртгэлээс гарлаа.', 'Signed out of your Oyu AI account.'));
    } catch {
      notify(
        t(
          'Энэ хөтөч дээр гарлаа. Сервертэй холбогдож чадаагүй тул нэвтрэлтийг цуцалж чадсангүй.',
          'Signed out on this browser. The server couldn’t be reached to revoke the session.',
        ),
      );
    }
  }
  async function loadMore() {
    setLoadingMore(true);
    try {
      const response = await accountApi.garments(100, data.garments?.at(-1)?.id);
      setData((current) => ({
        ...current,
        garments: [...(current.garments ?? []), ...response.items],
      }));
      setHasMore(response.items.length === 100);
    } catch (error) {
      setErrors((current) => ({ ...current, garments: apiErrorMessage(error) }));
    } finally {
      setLoadingMore(false);
    }
  }
  const entitlement = data.entitlement;
  return (
    <div className="account-connected">
      <header className="account-identity">
        <div className="account-avatar" aria-hidden="true">
          {(data.profile?.profile.display_name || user.email).charAt(0).toUpperCase()}
        </div>
        <div>
          <h3>
            {data.profile?.profile.display_name ||
              t('Таны хувийн бүртгэл', 'Your personal account')}
          </h3>
          <p>{user.email}</p>
          <p className="account-connection-label">
            <ShieldCheck size={16} />
            <span>
              {t(
                'Холбогдсон бүртгэл · Жишээ орчноос тусдаа',
                'Connected account · Separate from the sample workspace',
              )}
            </span>
          </p>
        </div>
        <button className="button secondary small" onClick={signOut}>
          <SignOut size={16} /> {t('Гарах', 'Sign out')}
        </button>
      </header>
      <nav className="account-nav" aria-label={t('Бүртгэлийн хэсгүүд', 'Account sections')}>
        {(['overview', 'wardrobe', 'looks', 'analysis'] as const).map((value) => (
          <button
            key={value}
            className={tab === value ? 'active' : ''}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {
              {
                overview: t('Тойм', 'Overview'),
                wardrobe: t('Миний шүүгээ', 'My wardrobe'),
                looks: t('Хослол, өмсөлт', 'Looks & wear'),
                analysis: t('AI үнэлгээ', 'AI analysis'),
              }[value]
            }
          </button>
        ))}
      </nav>
      {tab === 'overview' && (
        <div className="account-overview">
          <div className="account-section-heading">
            <h4>{t('Бүртгэлийн тойм', 'Account overview')}</h4>
            <button
              className="text-link account-link"
              onClick={() => setReload((value) => value + 1)}
              disabled={busy}
            >
              <ArrowsClockwise size={15} weight="regular" className={busy ? 'account-spin' : ''} />{' '}
              {t('Шинэчлэх', 'Refresh')}
            </button>
          </div>
          {busy && (
            <p className="account-caption" role="status">
              {t('Хувийн бүртгэлийг ачааллаж байна…', 'Loading your private account…')}
            </p>
          )}
          <div className="account-stats">
            <div>
              <span>{t('Бүртгэлийн эрх', 'Account access')}</span>
              <strong>
                {entitlement
                  ? entitlement.beta_access
                    ? t('Бета эрх', 'Beta access')
                    : labelFor(tierLabels, entitlement.tier)
                  : '—'}
              </strong>
              <p>
                {entitlement
                  ? entitlement.active
                    ? t(
                        `Өдөрт ${entitlement.daily_ai_jobs} AI хүсэлт`,
                        `${entitlement.daily_ai_jobs} AI ${entitlement.daily_ai_jobs === 1 ? 'request' : 'requests'} per day`,
                      )
                    : t('AI эрх одоогоор идэвхгүй', 'AI access is currently inactive')
                  : errors.entitlement || t('Эрхийг ачааллаж байна…', 'Loading access…')}
              </p>
            </div>
            <div>
              <span>{t('Стилийн оноо', 'Style score')}</span>
              <strong>
                {data.summary?.overall == null ? (
                  '—'
                ) : (
                  <>
                    {Math.round(data.summary.overall)}
                    <small>/100</small>
                  </>
                )}
              </strong>
              <p>
                {data.summary
                  ? t(
                      `Тооцоонд орсон ${data.summary.sample_count} үнэлгээ${data.summary.early_estimate && data.summary.overall != null ? ' · Урьдчилсан тооцоо' : ''}`,
                      `${data.summary.sample_count} eligible ${data.summary.sample_count === 1 ? 'analysis' : 'analyses'}${data.summary.early_estimate && data.summary.overall != null ? ' · Early estimate' : ''}`,
                    )
                  : errors.summary || t('Оноог ачааллаж байна…', 'Loading scores…')}
              </p>
            </div>
          </div>
          {entitlement && (
            <div className="account-detail-list">
              {entitlement.trial_ends_at && entitlement.tier === 'trial' && (
                <p>
                  <span>{t('Туршилт дуусах', 'Trial ends')}</span>
                  <strong>{dateLabel(entitlement.trial_ends_at)}</strong>
                </p>
              )}
              {entitlement.period_end && (
                <p>
                  <span>
                    {entitlement.renews ? t('Сунгагдах', 'Renews') : t('Эрх дуусах', 'Access ends')}
                  </span>
                  <strong>{dateLabel(entitlement.period_end)}</strong>
                </p>
              )}
              {entitlement.plan && (
                <p>
                  <span>{t('Багц', 'Plan')}</span>
                  <strong>{entitlement.plan}</strong>
                </p>
              )}
              {entitlement.billing_retry && (
                <p className="account-error">
                  {t(
                    'Төлбөрт анхаарах зүйл гарлаа. Гишүүнчлэл авсан дэлгүүрээрээ дамжуулан шийдвэрлэнэ үү.',
                    'Your payment needs attention. Manage it through the store where you got your membership.',
                  )}
                </p>
              )}
            </div>
          )}
          {data.profile && (
            <div className="account-profile">
              <h4>{t('Таны стилийн сонголт', 'Your style preferences')}</h4>
              <div className="account-tags">
                {data.profile.preferences.preferred_styles.length ? (
                  data.profile.preferences.preferred_styles.map((style) => (
                    <span key={style}>{styleText(style)}</span>
                  ))
                ) : (
                  <p className="account-caption">
                    {t(
                      'Стилийн сонголт хараахан бүртгэгдээгүй байна.',
                      'No style preferences recorded yet.',
                    )}
                  </p>
                )}
              </div>
              <p className="account-caption">
                {data.profile.profile.timezone} ·{' '}
                {data.profile.profile.locale === 'mn'
                  ? t('Монгол', 'Mongolian')
                  : t('Англи', 'English')}{' '}
                ·{' '}
                {data.profile.profile.unit_system === 'metric'
                  ? t('Метрийн нэгж', 'Metric units')
                  : t('Английн нэгж', 'Imperial units')}
              </p>
            </div>
          )}
          {errors.profile && (
            <p className="account-error" role="alert">
              {t('Хувийн мэдээлэл', 'Profile')}: {errors.profile}
            </p>
          )}
          <p className="account-caption account-overview-note">
            {t(
              'Гишүүнчлэлийг гар утасны апп эсвэл гишүүнчлэл авсан дэлгүүрээс удирдана. Энэ хувилбарт вэбээр төлбөр төлөх боломжгүй. Камераараа хувцас өмсөж үзэхийн тулд хажуугийн цэснээс Шууд өмсөж үзэх өрөөг нээнэ үү.',
              'Membership is managed in the mobile app or the store where you got it. Web checkout isn’t available in this version. To try clothes on with your camera, open Live try-on from the sidebar.',
            )}
          </p>
        </div>
      )}
      {tab === 'wardrobe' && (
        <div className="account-wardrobe-tab">
          <div className="account-section-heading">
            <h4>
              {data.garments
                ? t(
                    `${data.garments.length} хувцас харагдаж байна`,
                    `${data.garments.length} ${data.garments.length === 1 ? 'piece' : 'pieces'} shown`,
                  )
                : t('Таны хувийн шүүгээ', 'Your private wardrobe')}
            </h4>
            <button
              className="text-link account-link"
              onClick={() => setReload((value) => value + 1)}
              disabled={busy}
            >
              <ArrowsClockwise size={15} weight="regular" /> {t('Шинэчлэх', 'Refresh')}
            </button>
          </div>
          {errors.garments && (
            <p className="account-error" role="alert">
              {errors.garments}
            </p>
          )}
          {!data.garments && busy && (
            <p className="account-caption" role="status">
              {t('Шүүгээг ачааллаж байна…', 'Loading wardrobe…')}
            </p>
          )}
          <ConnectedWardrobe
            garments={data.garments ?? []}
            consent={data.consent}
            entitlement={entitlement}
            consentError={errors.consent}
            onConsent={(consent) => setData((current) => ({ ...current, consent }))}
            onGarment={(garment) =>
              setData((current) => ({
                ...current,
                garments: current.garments?.some((item) => item.id === garment.id)
                  ? current.garments.map((item) => (item.id === garment.id ? garment : item))
                  : [garment, ...(current.garments ?? [])],
              }))
            }
            onArchive={(id) =>
              setData((current) => ({
                ...current,
                garments: current.garments?.filter((item) => item.id !== id),
              }))
            }
          />
          {hasMore && (
            <button
              className="button secondary account-more"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? t('Ачааллаж байна…', 'Loading…') : t('Цааш нь ачаалах', 'Load more')}
            </button>
          )}
        </div>
      )}
      {tab === 'looks' && <AccountLooks garments={data.garments ?? []} />}
      {tab === 'analysis' && (
        <AnalysisPanel
          consent={data.consent}
          entitlement={entitlement}
          consentError={errors.consent}
          onConsent={(consent) => setData((current) => ({ ...current, consent }))}
        />
      )}
    </div>
  );
}

interface ConnectedWardrobeProps {
  garments: ApiGarment[];
  consent?: AiConsent;
  entitlement?: Entitlement;
  consentError?: string;
  onConsent: (consent: AiConsent) => void;
  onGarment: (garment: ApiGarment) => void;
  onArchive: (id: string) => void;
}
function ConnectedWardrobe({
  garments,
  consent,
  entitlement,
  consentError,
  onConsent,
  onGarment,
  onArchive,
}: ConnectedWardrobeProps) {
  const { data } = useApp();
  const [adding, setAdding] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const revealedPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!archiveId && !selectedId) return;
    const heading = revealedPanel.current?.querySelector('h4');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'nearest' });
    }
  }, [archiveId, selectedId]);
  const [pending, setPending] = useState(false);
  const operation = useRef<ImageOperation | null>(null);
  const controller = useRef(new AbortController());
  const keys = useRef(new Map<string, string>());
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const keyFor = (scope: string) => {
    let key = keys.current.get(scope);
    if (!key) {
      key = newOperationKey();
      keys.current.set(scope, key);
    }
    return key;
  };
  const allowed = consent?.granted === true && consent.status === 'granted';
  const selected = garments.find((item) => item.id === selectedId);
  const archiveItem = garments.find((item) => item.id === archiveId);
  function showFailure(cause: unknown) {
    if (!cancelled(cause)) setError(apiErrorMessage(cause));
  }
  async function grantConsent() {
    setBusy(true);
    setError('');
    try {
      onConsent(
        await accountApi.setConsent(true, data.preferences.language, {
          idempotencyKey: keyFor('consent:true'),
          signal: controller.current.signal,
        }),
      );
      keys.current.delete('consent:true');
    } catch (cause) {
      showFailure(cause);
    } finally {
      setBusy(false);
    }
  }
  function chooseFile(next: File | undefined) {
    setError('');
    setNotice('');
    setPending(false);
    operation.current = null;
    if (!next) {
      setFile(null);
      return;
    }
    try {
      operation.current = accountApi.createImageOperation(
        next,
        'garment',
        data.preferences.language,
      );
      setFile(next);
    } catch (cause) {
      showFailure(cause);
      setFile(null);
    }
  }
  async function watchGarment(id: string, jobId: string) {
    setPhase(t('Хувцсыг таньж байна', 'Identifying your piece'));
    const job = await accountApi.pollJob(jobId, {
      signal: controller.current.signal,
      attempts: 30,
      intervalMs: 1500,
    });
    const result = await accountApi.garment(id, controller.current.signal);
    onGarment(result);
    const stillPending = job.status === 'queued' || job.status === 'running';
    setPending(stillPending);
    if (stillPending)
      setNotice(
        t(
          'Хувцас боловсруулагдсаар байна. Хэсэг хугацааны дараа дахин шалгах эсвэл шүүгээгээ дараа шинэчилнэ үү.',
          'Your piece is still processing. Check again in a moment, or refresh your wardrobe later.',
        ),
      );
    else if (job.status === 'failed' || job.status === 'dead') {
      setError(
        job.last_error === 'ai_processing_consent_missing'
          ? apiErrorMessage(new ApiError(job.last_error, ''))
          : t(
              'Энэ хувцсыг боловсруулж чадсангүй. Хувцасны карт дээрээс дахин боловсруулж болно.',
              'This piece couldn’t be processed. You can retry processing from its card.',
            ),
      );
      setAdding(false);
      setFile(null);
      operation.current = null;
    } else {
      setAdding(false);
      setFile(null);
      operation.current = null;
      setSelectedId(result.id);
      setNotice(
        result.status === 'pending_confirmation'
          ? t(
              'Хувцас бэлэн боллоо. Шүүгээндээ нэмэхээс өмнө илрүүлсэн мэдээллийг шалгана уу.',
              'Your piece is ready. Review the detected details before adding it to your wardrobe.',
            )
          : t('Хувцас шинэчлэгдлээ.', 'Your piece has been updated.'),
      );
    }
  }
  async function upload() {
    if (!operation.current) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const created = await accountApi.submitImage(operation.current, {
        signal: controller.current.signal,
        onProgress: setPhase,
      });
      if (!created?.garment)
        throw new ApiError(
          'invalid_response',
          t(
            'Бүртгэлийн үйлчилгээнээс хувцасны мэдээлэл ирсэнгүй.',
            'The account service didn’t return the piece’s details.',
          ),
        );
      onGarment(created.garment);
      await watchGarment(created.garment.id, created.job.id);
    } catch (cause) {
      showFailure(cause);
    } finally {
      setBusy(false);
      setPhase('');
    }
  }
  async function refreshGarment(id: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await accountApi.garment(id, controller.current.signal);
      onGarment(result);
      if (result.status === 'pending_confirmation' || result.status === 'active') setSelectedId(id);
      else
        setNotice(
          result.status === 'processing'
            ? t(
                'Энэ хувцас боловсруулагдсаар байна. Хэсэг хугацааны дараа дахин шалгана уу.',
                'This piece is still processing. Check again in a moment.',
              )
            : t(
                'Боловсруулалт амжилтгүй боллоо. Энэ хувцсыг дахин боловсруулж болно.',
                'Processing failed. You can retry this piece.',
              ),
        );
    } catch (cause) {
      showFailure(cause);
    } finally {
      setBusy(false);
    }
  }
  async function retry(garment: ApiGarment) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const recorded = await accountApi.consent(controller.current.signal);
      onConsent(recorded);
      if (!recorded.granted || recorded.status !== 'granted') {
        setAdding(true);
        throw new ApiError('ai_processing_consent_missing', '');
      }
      const scope = `retry:${garment.id}`;
      const created = await accountApi.retryGarment(garment.id, {
        idempotencyKey: keyFor(scope),
        signal: controller.current.signal,
      });
      keys.current.delete(scope);
      onGarment(created.garment);
      await watchGarment(created.garment.id, created.job.id);
    } catch (cause) {
      showFailure(cause);
    } finally {
      setBusy(false);
      setPhase('');
    }
  }
  async function availability(garment: ApiGarment) {
    const next = garment.availability === 'laundry' ? 'available' : 'laundry';
    const scope = `${garment.id}:availability:${next}`;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      onGarment(
        await accountApi.setGarmentAvailability(garment.id, next, {
          idempotencyKey: keyFor(scope),
          signal: controller.current.signal,
        }),
      );
      keys.current.delete(scope);
      setNotice(
        next === 'laundry'
          ? t('Угаалгад байгаа гэж тэмдэглэлээ.', 'Moved to the laundry.')
          : t('Цэвэр, өмсөхөд бэлэн гэж тэмдэглэлээ.', 'Marked clean and ready to wear.'),
      );
    } catch (cause) {
      showFailure(cause);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!archiveItem) return;
    const scope = `archive:${archiveItem.id}`;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await accountApi.archiveGarment(archiveItem.id, {
        idempotencyKey: keyFor(scope),
        signal: controller.current.signal,
      });
      onArchive(archiveItem.id);
      keys.current.delete(scope);
      setArchiveId(null);
      setSelectedId(null);
      setNotice(
        t(
          'Хувцсыг архивлаж, хувийн зургийг нь бүртгэлээс устгалаа.',
          'Piece archived and its private photo deleted from your account.',
        ),
      );
    } catch (cause) {
      showFailure(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-wardrobe">
      <div className="account-wardrobe-toolbar">
        <p className="account-caption">
          {t(
            'Oyu AI-тай ижилтгэсэн таны хувийн шүүгээ.',
            'Your private wardrobe, synced with Oyu AI.',
          )}
        </p>
        <button
          className={adding ? 'button secondary small' : 'button small'}
          onClick={() => {
            setAdding((value) => !value);
            setSelectedId(null);
            setArchiveId(null);
            setError('');
          }}
          disabled={busy}
        >
          {adding ? <X size={15} weight="regular" /> : <Plus size={15} weight="regular" />}
          {adding ? t('Хаах', 'Close') : t('Хувцас нэмэх', 'Add a piece')}
        </button>
      </div>
      {adding && (
        <section className="account-panel account-garment-upload">
          <div className="account-subheading">
            <h4>{t('Хувцасны зураг байршуулах', 'Upload a clothing photo')}</h4>
          </div>
          {!allowed ? (
            <div className="account-consent">
              <div className="account-consent-head">
                <ShieldCheck size={20} />
                <h4>{t('AI зураг боловсруулах зөвшөөрөл', 'Consent to AI photo processing')}</h4>
              </div>
              <p>
                {t(
                  'Энэ хувцсыг танихын тулд Oyu AI таны сонгосон зургийг бүртгэлийн хувийн санд байршуулж, тохируулсан AI зураг танилтын үйлчилгээ (OpenAI эсвэл Anthropic) руу илгээнэ. Эхлээд камерын мета өгөгдлийг арилгана. Таны нэр, имэйл, бүртгэлийн ID зурагтай хамт илгээгдэхгүй.',
                  'To identify this piece, Oyu AI uploads the photo you choose to private account storage and sends it to the configured AI vision service (OpenAI or Anthropic). Camera metadata is removed first. Your name, email, and account ID aren’t sent with the photo.',
                )}
              </p>
              <p>
                {t(
                  'Энэ сонголт бүртгэлийн хэмжээнд хамаарах бөгөөд хувцас болон хослолын зургийг хамарна. AI үнэлгээ хэсгээс унтрааж болно; аль хэдийн хийгдсэн боловсруулалтыг буцаахгүй.',
                  'This account-wide choice covers both clothing and outfit photos. You can turn it off from the AI analysis tab; it doesn’t undo processing that’s already done.',
                )}
              </p>
              <label className="account-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  disabled={busy || !consent}
                />
                <span>
                  {t(
                    'Миний илгээхээр сонгосон зургийг AI-аар боловсруулахыг зөвшөөрч байна.',
                    'I agree to AI processing of the photos I choose to submit.',
                  )}
                </span>
              </label>
              <button
                className="button"
                onClick={grantConsent}
                disabled={!agreed || busy || !consent}
              >
                {t('AI зураг боловсруулалтыг зөвшөөрөх', 'Allow AI photo processing')}
              </button>
              {!consent && (
                <p className="account-caption">
                  {consentError ||
                    t('Нууцлалын сонголтыг шалгаж байна…', 'Checking your privacy choice…')}
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="account-caption">
                {t(
                  'Нэг хувцсыг тод зураад Oyu AI-ийн илрүүлсэн мэдээллийг шалгана уу. Таны бүртгэлд AI зураг боловсруулалт зөвшөөрөгдсөн.',
                  'Photograph one piece clearly, then review the details Oyu AI finds. AI photo processing is allowed for your account.',
                )}
              </p>
              {entitlement?.active === false && (
                <p className="account-error">
                  {t(
                    'Хувцасны зураг боловсруулахад идэвхтэй AI эрх шаардлагатай.',
                    'Your account needs active AI access to process clothing photos.',
                  )}
                </p>
              )}
              <label className={`account-photo-picker ${busy ? 'disabled' : ''}`}>
                {preview ? (
                  <img
                    src={preview}
                    alt={t(
                      'Хувийн бүртгэлд байршуулахаар сонгосон хувцас',
                      'Piece selected for private account upload',
                    )}
                  />
                ) : (
                  <span className="account-picker-icon" aria-hidden="true">
                    <ImageSquare size={20} />
                  </span>
                )}
                <strong>
                  {file?.name || t('Хувцасны зураг сонгох', 'Choose a clothing photo')}
                </strong>
                <span>
                  {t('JPEG, PNG эсвэл WebP · 15 MB хүртэл', 'JPEG, PNG, or WebP · Up to 15 MB')}
                </span>
                <input
                  type="file"
                  aria-label={t(
                    'Бүртгэлийн шүүгээнд нэмэх хувцасны зураг сонгох',
                    'Choose a clothing photo for your account wardrobe',
                  )}
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => {
                    chooseFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                  disabled={busy || entitlement?.active === false}
                />
              </label>
              <button
                className="button full-width"
                onClick={upload}
                disabled={!file || busy || entitlement?.active === false}
              >
                {busy ? (
                  <>
                    <CircleNotch size={18} className="account-spin" />
                    {phase || t('Боловсруулж байна…', 'Processing…')}
                  </>
                ) : pending ? (
                  t('Боловсруулалтыг шалгах', 'Check processing')
                ) : (
                  <>
                    <Scan size={18} />
                    {t('Байршуулж, хувцсыг таних', 'Upload and identify piece')}
                  </>
                )}
              </button>
              {busy && (
                <p className="account-caption" role="status">
                  {t(
                    'Энэ хэсгийг хаавал хүлээлт зогсоно. Илгээсэн хувцас бүртгэлд тань боловсруулагдсаар байна.',
                    'Closing this panel stops waiting. A submitted piece keeps processing in your account.',
                  )}
                </p>
              )}
            </>
          )}
        </section>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="account-success" role="status">
          {notice}
        </p>
      )}
      <div ref={revealedPanel}>
        {archiveItem && (
          <section className="account-archive-confirm" aria-labelledby="archive-garment-title">
            <h4 id="archive-garment-title">
              {archiveItem.name
                ? t(`“${archiveItem.name}” хувцсыг архивлах уу?`, `Archive “${archiveItem.name}”?`)
                : t('Энэ хувцсыг архивлах уу?', 'Archive this piece?')}
            </h4>
            <p>
              {t(
                'Хувцсыг шүүгээнээс хасаж, хувийн зургийг нь бүрмөсөн устгана. Энэ хувцсыг ашигласан хадгалсан хослол боломжгүй болж магадгүй. Энэ үйлдлийг эндээс буцаах боломжгүй.',
                'This removes the piece from your wardrobe and permanently deletes its private photo. Saved looks that use this piece may become unavailable. This can’t be undone here.',
              )}
            </p>
            <div className="account-action-row">
              <button
                className="button secondary small"
                onClick={() => setArchiveId(null)}
                disabled={busy}
              >
                {t('Хувцсыг үлдээх', 'Keep piece')}
              </button>
              <button className="button danger small" onClick={archive} disabled={busy}>
                {busy
                  ? t('Архивлаж байна…', 'Archiving…')
                  : t('Архивлаж, зургийг устгах', 'Archive and delete photo')}
              </button>
            </div>
          </section>
        )}
        {selected && !archiveItem && (
          <GarmentReview
            key={`${selected.id}:${selected.status}`}
            garment={selected}
            onSaved={(garment) => {
              onGarment(garment);
              setSelectedId(null);
              setNotice(
                t(
                  'Хувцас баталгаажиж, шүүгээнд тань идэвхжлээ.',
                  'Piece confirmed and active in your wardrobe.',
                ),
              );
            }}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
      {!selected && garments.length === 0 && !adding && (
        <div className="account-empty">
          <TShirt size={28} />
          <h4>{t('Анхны хувцсаа нэмээрэй', 'Add your first piece')}</h4>
          <p>
            {t(
              'Хувцасны зураг нэмж өөрийн шүүгээгээ эхлүүлээрэй. Идэвхжүүлэхээс өмнө мэдээлэл бүрийг шалгах боломжтой.',
              'Add a clothing photo to start your own wardrobe. You can review every detail before it becomes active.',
            )}
          </p>
        </div>
      )}
      <div className="account-garment-grid">
        {garments.map((garment) => (
          <article
            className={`account-garment ${garment.id === selectedId || garment.id === archiveId ? 'selected' : ''}`}
            key={garment.id}
          >
            <PrivateGarmentImage garment={garment} />
            <div className="account-garment-body">
              <h4>{garment.name || t('Нэргүй хувцас', 'Untitled piece')}</h4>
              <p>
                {[
                  garment.primary_color && colorText(garment.primary_color),
                  garment.category && categoryText(garment.category),
                ]
                  .filter(Boolean)
                  .join(' · ') || t('Хувцасны мэдээллийг уншиж байна', 'Reading piece details')}
              </p>
              <span
                className={`account-status ${garment.status === 'active' ? 'ready' : garment.status === 'failed' ? 'failed' : ''}`}
              >
                {garment.status === 'active'
                  ? labelFor(availabilityLabels, garment.availability)
                  : labelFor(garmentStatusLabels, garment.status)}
              </span>
              <div className="account-garment-actions">
                {(garment.status === 'active' || garment.status === 'pending_confirmation') && (
                  <button
                    className="text-link account-link"
                    onClick={() => {
                      setSelectedId(garment.id);
                      setArchiveId(null);
                      setAdding(false);
                      setError('');
                    }}
                    disabled={busy}
                  >
                    {garment.status === 'pending_confirmation'
                      ? t('Шалгаж баталгаажуулах', 'Review and confirm')
                      : t('Дэлгэрэнгүй', 'Details')}
                  </button>
                )}
                {garment.status === 'active' && (
                  <button
                    className="text-link account-link"
                    onClick={() => availability(garment)}
                    disabled={busy}
                  >
                    {garment.availability === 'laundry'
                      ? t('Цэвэр гэж тэмдэглэх', 'Mark clean')
                      : t('Угаалгад хийх', 'Move to the laundry')}
                  </button>
                )}
                {garment.status === 'processing' && (
                  <button
                    className="text-link account-link"
                    onClick={() => refreshGarment(garment.id)}
                    disabled={busy}
                  >
                    {t('Боловсруулалтыг шалгах', 'Check processing')}
                  </button>
                )}
                {garment.status === 'failed' && (
                  <button
                    className="text-link account-link"
                    onClick={() => retry(garment)}
                    disabled={busy || entitlement?.active === false}
                  >
                    {t('Дахин боловсруулах', 'Retry processing')}
                  </button>
                )}
                <button
                  className="text-link account-link"
                  aria-label={t(
                    `Архивлах: ${garment.name || 'хувцас'}`,
                    `Archive ${garment.name || 'piece'}`,
                  )}
                  onClick={() => {
                    setArchiveId(garment.id);
                    setSelectedId(null);
                  }}
                  disabled={busy}
                >
                  <Archive size={15} weight="regular" /> {t('Архивлах', 'Archive')}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function PrivateGarmentImage({ garment }: { garment: ApiGarment }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!garment.media_id) return;
    const controller = new AbortController();
    accountApi
      .garmentImage(garment.id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setUrl(result.signed_url);
      })
      .catch(() => {
        /* Missing or processing photos use the category icon. */
      });
    return () => controller.abort();
  }, [garment.id, garment.media_id, garment.status]);
  return (
    <div className="account-garment-thumb">
      {url ? (
        <img
          src={url}
          alt={garment.name || t('Хувийн хувцас', 'Private piece')}
          referrerPolicy="no-referrer"
          onError={() => setUrl('')}
        />
      ) : (
        <TShirt size={22} />
      )}
    </div>
  );
}

function GarmentReview({
  garment,
  onSaved,
  onClose,
}: {
  garment: ApiGarment;
  onSaved: (garment: ApiGarment) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(garment.name);
  const [category, setCategory] = useState<GarmentCategory | ''>(garment.category ?? '');
  const [color, setColor] = useState(garment.primary_color ?? '');
  const [warmth, setWarmth] = useState(garment.warmth_level ?? 3);
  const [formality, setFormality] = useState(garment.formality ?? 2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef<{ body: string; key: string } | null>(null);
  const controller = useRef(new AbortController());
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    return () => active.abort();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!category) {
      setError(
        t(
          'Баталгаажуулахаас өмнө ангилал сонгоно уу.',
          'Choose a category before confirming this piece.',
        ),
      );
      return;
    }
    setBusy(true);
    try {
      const attributes = garmentConfirmation(garment, {
        category,
        name: name.trim(),
        primary_color: color.trim() || null,
        warmth_level: warmth,
        formality,
      });
      const signature = JSON.stringify(attributes);
      if (operation.current?.body !== signature)
        operation.current = { body: signature, key: newOperationKey() };
      onSaved(
        await accountApi.confirmGarment(garment.id, attributes, {
          idempotencyKey: operation.current.key,
          signal: controller.current.signal,
        }),
      );
    } catch (cause) {
      if (!cancelled(cause)) setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  const retained: [string, string][] = [
    [
      t('Дэд ангилал', 'Subcategory'),
      garment.subcategory ? humanize(garment.subcategory) : t('Тодорхойгүй', 'Not specified'),
    ],
    [t('Давхарга', 'Layer'), labelFor(layerLabels, garment.layer_position || 'base')],
    [t('Материал', 'Material'), garment.material || t('Тодорхойгүй', 'Not specified')],
    [t('Хээ', 'Pattern'), labelFor(patternLabels, garment.pattern ?? 'solid')],
    [
      t('Нэмэлт өнгө', 'Secondary colors'),
      garment.secondary_colors?.map(colorText).join(', ') || t('Байхгүй', 'None'),
    ],
    [
      t('Улирал', 'Seasons'),
      garment.seasons?.length
        ? garment.seasons.map((season) => labelFor(seasonLabels, season).toLowerCase()).join(', ')
        : t('хавар, зун, намар, өвөл', 'spring, summer, fall, winter'),
    ],
    [
      t('Температурын хүрээ', 'Temperature range'),
      garment.min_temp_c == null && garment.max_temp_c == null
        ? t('Тодорхойгүй', 'Not specified')
        : `${garment.min_temp_c ?? '—'}°C – ${garment.max_temp_c ?? '—'}°C`,
    ],
    [
      t('Өмсөх үе', 'Occasions'),
      garment.occasions?.join(', ') || t('Тодорхойгүй', 'Not specified'),
    ],
    [
      t('Стилийн шошго', 'Style tags'),
      garment.style_tags?.join(', ') || t('Тодорхойгүй', 'Not specified'),
    ],
    [t('Брэнд', 'Brand'), garment.brand || t('Тодорхойгүй', 'Not specified')],
    [t('Тайлбар', 'Description'), garment.description || t('Тодорхойгүй', 'Not specified')],
  ];
  if (garment.status !== 'pending_confirmation')
    return (
      <section className="account-panel account-garment-review">
        <div className="account-subheading">
          <h4>{garment.name || t('Хувцасны дэлгэрэнгүй', 'Piece details')}</h4>
          <button className="text-link account-link" onClick={onClose}>
            {t('Дэлгэрэнгүйг хаах', 'Close details')}
          </button>
        </div>
        <p className="account-caption">
          {t(
            'Энэ хувцас баталгаажсан. Төлөвийг нь өөрчлөх эсвэл архивлахыг картаас нь хийнэ үү.',
            'This piece is confirmed. Change its availability or archive it from its card.',
          )}
        </p>
        <div className="account-retained-details">
          <dl>
            {[
              [
                t('Ангилал', 'Category'),
                garment.category
                  ? categoryText(garment.category)
                  : t('Тодорхойгүй', 'Not specified'),
              ],
              [
                t('Үндсэн өнгө', 'Primary color'),
                garment.primary_color
                  ? colorText(garment.primary_color)
                  : t('Тодорхойгүй', 'Not specified'),
              ],
              [t('Дулаан', 'Warmth'), String(garment.warmth_level)],
              [t('Албан ёсны түвшин', 'Formality'), String(garment.formality)],
              ...retained,
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    );
  return (
    <section className="account-panel account-garment-review">
      <div className="account-subheading">
        <h4>{t('Хувцсаа шалгах', 'Review your piece')}</h4>
        <button className="text-link account-link" onClick={onClose} disabled={busy}>
          {t('Хаах', 'Close')}
        </button>
      </div>
      <p className="account-caption">
        {garment.needs_review
          ? t(
              'Зураг танигч эргэлзээтэй үр дүн гаргасан. Мэдээллийг анхааралтай шалгана уу.',
              'The image reader was uncertain. Please check these details carefully.',
            )
          : t(
              'Илрүүлсэн мэдээллийг шалгаж, өөрийнхөөрөө засаарай.',
              'Check the detected details and make them your own.',
            )}{' '}
        {t(
          'Баталгаажуулснаар энэ хувцас шүүгээнд тань нэмэгдэнэ.',
          'Confirming adds this piece to your wardrobe.',
        )}
      </p>
      <form className="account-form" onSubmit={submit}>
        <label>
          {t('Хувцасны нэр', 'Piece name')}
          <input
            className="field"
            value={name}
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
        </label>
        <div className="account-review-fields">
          <label>
            {t('Ангилал', 'Category')}
            <select
              className="field account-select"
              value={category}
              onChange={(event) => setCategory(event.target.value as GarmentCategory)}
              required
              disabled={busy}
            >
              <option value="">{t('Ангилал сонгох', 'Choose a category')}</option>
              {(
                [
                  'top',
                  'bottom',
                  'dress',
                  'outerwear',
                  'footwear',
                  'accessory',
                  'underlayer',
                ] as const
              ).map((value) => (
                <option value={value} key={value}>
                  {categoryText(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Үндсэн өнгө', 'Primary color')}
            <input
              className="field"
              value={color}
              maxLength={80}
              onChange={(event) => setColor(event.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <div className="account-review-fields">
          <label>
            {t('Дулаан', 'Warmth')}
            <select
              className="field account-select"
              value={warmth}
              onChange={(event) => setWarmth(Number(event.target.value))}
              disabled={busy}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option value={value} key={value}>
                  {value} ·{' '}
                  {
                    [
                      t('Маш нимгэн', 'Very light'),
                      t('Нимгэн', 'Light'),
                      t('Дунд зэрэг', 'Medium'),
                      t('Дулаан', 'Warm'),
                      t('Маш дулаан', 'Very warm'),
                    ][value - 1]
                  }
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('Албан ёсны түвшин', 'Formality')}
            <select
              className="field account-select"
              value={formality}
              onChange={(event) => setFormality(Number(event.target.value))}
              disabled={busy}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option value={value} key={value}>
                  {value} ·{' '}
                  {
                    [
                      t('Маш чөлөөт', 'Very casual'),
                      t('Чөлөөт', 'Casual'),
                      t('Хагас албан', 'Smart casual'),
                      t('Албан', 'Formal'),
                      t('Маш албан', 'Very formal'),
                    ][value - 1]
                  }
                </option>
              ))}
            </select>
          </label>
        </div>
        <details className="account-retained-details">
          <summary>
            {t(
              'Бусад илрүүлсэн мэдээлэл · хадгалахад хэвээр үлдэнэ',
              'Other detected details · kept when you save',
            )}
          </summary>
          <dl>
            {retained.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </details>
        {error && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
        <button className="button" type="submit" disabled={busy || !category}>
          {busy
            ? t('Хадгалж байна…', 'Saving…')
            : garment.status === 'pending_confirmation'
              ? t('Баталгаажуулж, шүүгээнд нэмэх', 'Confirm and add to wardrobe')
              : t('Хувцасны мэдээллийг хадгалах', 'Save piece details')}
        </button>
      </form>
    </section>
  );
}

function AnalysisPanel({
  consent,
  entitlement,
  consentError,
  onConsent,
}: {
  consent?: AiConsent;
  entitlement?: Entitlement;
  consentError?: string;
  onConsent: (consent: AiConsent) => void;
}) {
  const { data } = useApp();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [score, setScore] = useState<ApiScore | null>(null);
  const [jobPending, setJobPending] = useState(false);
  const [recent, setRecent] = useState<ApiScore[]>([]);
  const [recentError, setRecentError] = useState('');
  const [loadingScore, setLoadingScore] = useState(false);
  const operation = useRef<ImageOperation | null>(null);
  const controller = useRef(new AbortController());
  const consentKey = useRef(newOperationKey());
  async function refreshScore(id: string) {
    setLoadingScore(true);
    setRecentError('');
    try {
      const result = await accountApi.score(id, controller.current.signal);
      setScore(result);
      setRecent((current) => current.map((item) => (item.id === id ? result : item)));
    } catch (cause) {
      if (!cancelled(cause)) setRecentError(apiErrorMessage(cause));
    } finally {
      setLoadingScore(false);
    }
  }
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    accountApi
      .scores(10, undefined, active.signal)
      .then((response) => setRecent(response.items))
      .catch((cause) => {
        if (!cancelled(cause)) setRecentError(apiErrorMessage(cause));
      });
    return () => active.abort();
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function changeConsent(granted: boolean) {
    setBusy(true);
    setError('');
    try {
      const updated = await accountApi.setConsent(granted, data.preferences.language, {
        idempotencyKey: consentKey.current,
        signal: controller.current.signal,
      });
      onConsent(updated);
      consentKey.current = newOperationKey();
      if (!granted) {
        setFile(null);
        operation.current = null;
        setAgreed(false);
      }
    } catch (cause) {
      if (!cancelled(cause)) setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function chooseFile(next: File | undefined) {
    setError('');
    setScore(null);
    setJobPending(false);
    operation.current = null;
    if (!next) {
      setFile(null);
      return;
    }
    try {
      operation.current = accountApi.createImageOperation(next, 'score', data.preferences.language);
      setFile(next);
    } catch (cause) {
      setError(apiErrorMessage(cause));
      setFile(null);
    }
  }
  async function analyze() {
    if (!operation.current) return;
    setBusy(true);
    setError('');
    try {
      const created = await accountApi.submitImage(operation.current, {
        signal: controller.current.signal,
        onProgress: setPhase,
      });
      if (!created?.score)
        throw new ApiError(
          'invalid_response',
          t(
            'Бүртгэлийн үйлчилгээнээс үнэлгээ ирсэнгүй.',
            'The account service didn’t return an analysis.',
          ),
        );
      setScore(created.score);
      setPhase(t('Хослолыг тань үнэлж байна', 'Analyzing your outfit'));
      const job = await accountApi.pollJob(created.job.id, {
        signal: controller.current.signal,
        attempts: 30,
        intervalMs: 1500,
      });
      const result = await accountApi.score(created.score.id, controller.current.signal);
      setScore(result);
      setJobPending(job.status === 'queued' || job.status === 'running');
      setRecent((current) =>
        [result, ...current.filter((item) => item.id !== result.id)].slice(0, 10),
      );
      if (job.status === 'failed' || job.status === 'dead') {
        const reason = result.failure_reason || job.last_error;
        setError(
          reason === 'ai_processing_consent_missing'
            ? apiErrorMessage(new ApiError(reason, ''))
            : t(
                'Энэ зургийг үнэлж чадсангүй. Өөр зураг сонгоод дахин оролдоно уу.',
                'This photo couldn’t be analyzed. Choose another photo and try again.',
              ),
        );
      }
    } catch (cause) {
      if (!cancelled(cause)) setError(apiErrorMessage(cause));
    } finally {
      setBusy(false);
      setPhase('');
    }
  }
  const allowed = consent?.granted === true && consent.status === 'granted';
  return (
    <div className="account-analysis">
      <div className="account-section-heading">
        <div>
          <h4>{t('Хослолын үнэлгээ', 'Outfit analysis')}</h4>
          <p className="account-caption">
            {t(
              'Холбогдсон Oyu AI үйлчилгээгээр үнэлүүлэх зургаа оруулна уу.',
              'Upload a photo for analysis from your connected Oyu AI service.',
            )}
          </p>
        </div>
      </div>
      {!allowed && (
        <div className="account-consent">
          <div className="account-consent-head">
            <ShieldCheck size={20} />
            <h4>{t('AI зураг боловсруулах зөвшөөрөл', 'Consent to AI photo processing')}</h4>
          </div>
          <p>
            {t(
              'Үнэлгээ хүсэхэд таны зураг бүртгэлийн хувийн санд байршиж, тохируулсан AI зураг танилтын үйлчилгээ (OpenAI эсвэл Anthropic) руу илгээгдэнэ. Боловсруулахаас өмнө камерын мета өгөгдлийг арилгана. Таны нэр, имэйл, бүртгэлийн ID зурагтай хамт илгээгдэхгүй.',
              'When you request an analysis, your photo is uploaded to private account storage and sent to the configured AI vision service (OpenAI or Anthropic). Camera metadata is removed before processing. Your name, email, and account ID aren’t sent with the photo.',
            )}
          </p>
          <p>
            {t(
              'Энэ сонголт бүртгэлийн хэмжээнд хамаарах бөгөөд Oyu AI дахь хувцасны зураг боловсруулалтыг мөн хамарна. Эндээс унтрааж болно. Аль хэдийн хийгдсэн боловсруулалтыг буцаахгүй.',
              'This account-wide choice also covers clothing photo processing in Oyu AI. You can turn it off here. It doesn’t undo processing that’s already done.',
            )}
          </p>
          <label className="account-check">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={busy || !consent}
            />
            <span>
              {t(
                'Миний илгээхээр сонгосон зургийг AI-аар боловсруулахыг зөвшөөрч байна.',
                'I agree to AI processing of the photos I choose to submit.',
              )}
            </span>
          </label>
          <button
            className="button"
            onClick={() => changeConsent(true)}
            disabled={!agreed || busy || !consent}
          >
            {busy
              ? t('Хадгалж байна…', 'Saving…')
              : t('AI зураг боловсруулалтыг зөвшөөрөх', 'Allow AI photo processing')}
          </button>
          {!consent && (
            <p className="account-caption">
              {consentError ||
                t('Нууцлалын сонголтыг шалгаж байна…', 'Checking your privacy choice…')}
            </p>
          )}
        </div>
      )}
      {allowed && (
        <>
          <div className="account-consent-active">
            <span>
              <CheckCircle size={16} />{' '}
              {t('AI зураг боловсруулалт зөвшөөрөгдсөн', 'AI photo processing is allowed')}
            </span>
            <button
              className="text-link account-link"
              onClick={() => changeConsent(false)}
              disabled={busy}
            >
              {t('Унтраах', 'Turn off')}
            </button>
          </div>
          {entitlement && !entitlement.active && (
            <p className="account-error">
              {t(
                'Таны бүртгэлд одоогоор AI ашиглах эрх алга. Үргэлжлүүлэхийн тулд гишүүнчлэлээ гар утасны аппаас удирдана уу.',
                'Your account doesn’t currently include AI access. To continue, manage your membership in the mobile app.',
              )}
            </p>
          )}
          <label className={`account-photo-picker ${busy ? 'disabled' : ''}`}>
            {preview ? (
              <img
                src={preview}
                alt={t(
                  'Үнэлгээнд бэлэн, таны сонгосон хослол',
                  'Your selected outfit, ready for analysis',
                )}
              />
            ) : (
              <span className="account-picker-icon" aria-hidden="true">
                <ImageSquare size={20} />
              </span>
            )}
            <strong>
              {file ? file.name : t('Хослолын зураг сонгох', 'Choose an outfit photo')}
            </strong>
            <span>
              {t('JPEG, PNG эсвэл WebP · 15 MB хүртэл', 'JPEG, PNG, or WebP · Up to 15 MB')}
            </span>
            <input
              type="file"
              aria-label={t(
                'Бүртгэлийн үнэлгээнд зориулж хослолын зураг сонгох',
                'Choose an outfit photo for account analysis',
              )}
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                chooseFile(e.target.files?.[0]);
                e.target.value = '';
              }}
              disabled={busy || entitlement?.active === false}
            />
          </label>
          <button
            className="button full-width"
            disabled={
              !file ||
              busy ||
              entitlement?.active === false ||
              (!!operation.current?.created &&
                !jobPending &&
                (score?.status === 'scored' || score?.status === 'failed') &&
                score.id === operation.current.created.score?.id)
            }
            onClick={analyze}
          >
            {busy ? (
              <>
                <CircleNotch size={18} className="account-spin" />
                {phase || t('Боловсруулж байна…', 'Processing…')}
              </>
            ) : jobPending ? (
              <>
                <ArrowsClockwise size={18} /> {t('Үнэлгээг шалгах', 'Check analysis')}
              </>
            ) : (
              <>
                <Scan size={18} /> {t('Энэ хослолыг үнэлэх', 'Analyze this outfit')}
              </>
            )}
          </button>
          {busy && (
            <p className="account-caption" role="status">
              {t(
                'Үнэлгээ хэсэг хугацаа шаардаж магадгүй. Энэ хэсгийг хаавал хүлээлт зогсох ч илгээсэн хүсэлт бүртгэлд тань үргэлжилнэ.',
                'Your analysis may take a moment. Closing this panel stops waiting, but a submitted request continues in your account.',
              )}
            </p>
          )}
          {jobPending && !busy && (
            <p className="account-caption" role="status">
              {t(
                'Үнэлгээ боловсруулагдсаар байна. Хэсэг хугацааны дараа дахин шалгана уу. Оноо хараахан гараагүй байна.',
                'Your analysis is still processing. Check again in a moment. No score is available yet.',
              )}
            </p>
          )}
        </>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {score && <ScoreCard score={score} />}
      {score?.status === 'analyzing' && (
        <button
          className="button secondary small"
          disabled={busy || loadingScore}
          onClick={() => refreshScore(score.id)}
        >
          <ArrowsClockwise size={15} weight="regular" />
          {loadingScore
            ? t('Шалгаж байна…', 'Checking…')
            : t('Үнэлгээг шинэчлэх', 'Refresh analysis')}
        </button>
      )}
      {loadingScore && (
        <p className="account-caption" role="status">
          {t('Сүүлийн үнэлгээг ачааллаж байна…', 'Loading the latest analysis…')}
        </p>
      )}
      <div className="account-recent">
        <h4>{t('Сүүлийн үнэлгээ', 'Recent analyses')}</h4>
        {recentError && (
          <p className="account-error" role="alert">
            {recentError}
          </p>
        )}
        {recent.length === 0 && !recentError && (
          <p className="account-caption">
            {t(
              'Сүүлийн үнэлгээ алга. Дууссан хослолын үнэлгээ энд харагдана.',
              'No recent analyses yet. Your completed outfit analyses will appear here.',
            )}
          </p>
        )}
        {recent.map((item) => (
          <button
            key={item.id}
            className={`account-recent-item ${score?.id === item.id ? 'selected' : ''}`}
            onClick={() => refreshScore(item.id)}
            disabled={busy || loadingScore}
          >
            <span>
              <strong>{item.title || t('Хослолын үнэлгээ', 'Outfit analysis')}</strong>
              <small>{dateLabel(item.created_at)}</small>
            </span>
            <b>
              {item.status === 'scored'
                ? item.unreadable
                  ? t('Уншигдсангүй', 'Unreadable')
                  : item.overall == null
                    ? t('Хэсэгчилсэн', 'Partial')
                    : `${item.overall}/100`
                : labelFor(scoreStatusLabels, item.status)}
            </b>
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreCard({ score }: { score: ApiScore }) {
  const dimensions = [
    [t('Өнгөний зохицол', 'Color harmony'), score.color_harmony],
    [t('Үс засалт', 'Hairstyle'), score.hairstyle],
    [t('Аксессуар', 'Accessories'), score.accessory],
    [t('Хослуулалт', 'Styling'), score.trendiness],
  ] as const;
  return (
    <article className="account-score-card">
      <div className="account-subheading">
        <h4>{score.title || t('Таны хослолын үнэлгээ', 'Your outfit analysis')}</h4>
        <span className="account-status">{t('Бүртгэлийн үр дүн', 'Account result')}</span>
      </div>
      {score.status !== 'scored' ? (
        <p>
          {score.status === 'failed'
            ? t('Энэ үнэлгээг дуусгаж чадсангүй.', 'This analysis couldn’t be completed.')
            : t(
                'Таны зургийг үнэлж байна. Үр дүн хараахан бэлэн болоогүй.',
                'Your photo is being analyzed. Results aren’t ready yet.',
              )}
        </p>
      ) : score.unreadable ? (
        <p>
          {t(
            'Хослолыг тодорхой үнэлж чадсангүй. Хослол тань бүтнээрээ харагдах, сайн гэрэлтэй зураг оруулж үзээрэй.',
            'The outfit couldn’t be clearly assessed. Try a well-lit photo that shows your whole outfit.',
          )}
        </p>
      ) : (
        <>
          <div className="account-score-main">
            <div className="account-result-overall">
              <strong>
                {score.overall ?? '—'}
                {score.overall != null && <small>/100</small>}
              </strong>
              <span>
                {score.overall == null
                  ? t('Зарим хэсэг харагдаагүй', 'Some details weren’t visible')
                  : t('Нийт стилийн оноо', 'Overall style score')}
              </span>
            </div>
            <div className="account-score-dimensions">
              {dimensions.map(([label, value]) => (
                <div key={label}>
                  <p>
                    <span>{label}</span>
                    <strong>
                      {value == null ? t('Харагдаагүй', 'Not visible') : `${value}/25`}
                    </strong>
                  </p>
                  <span className="account-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${value == null ? 0 : Math.min(100, Math.max(0, (value / 25) * 100))}%`,
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="account-score-comment">{score.comment}</p>
          {score.positives.length > 0 && (
            <ul>
              {score.positives.map((text, i) => (
                <li key={i}>
                  <Check size={15} weight="regular" />
                  {text}
                </li>
              ))}
            </ul>
          )}
          {score.negatives.length > 0 && (
            <div className="account-improvements">
              <strong>{t('Сайжруулах зүйлс', 'Things to refine')}</strong>
              {score.negatives.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </div>
          )}
          {score.suggestions.length > 0 && (
            <div className="account-improvements">
              <strong>{t('Туршиж үзэх санаа', 'Ideas to try')}</strong>
              {score.suggestions.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}
