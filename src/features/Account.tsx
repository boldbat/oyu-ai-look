import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Shirt,
  Sparkles,
} from 'lucide-react';
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
import './account.css';
import AccountLooks from './AccountLooks';

type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
const humanize = (value: string) => value.replaceAll('_', ' ');
const cancelled = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export function Account() {
  const { accountOpen, setAccountOpen } = useApp();
  const user = useSyncExternalStore(accountApi.subscribe, () => accountApi.currentUser);
  if (!accountOpen) return null;
  return (
    <Dialog
      title={user ? 'Your Oyu AI account' : 'Your style, everywhere'}
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
      setError('Choose a password between 8 and 128 characters.');
      return;
    }
    if (['verify', 'reset'].includes(mode) && !/^\d{8}$/.test(code)) {
      setError('Enter the eight-digit code from your email.');
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
        setNotice('Password updated. Sign in with your new password.');
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
      setNotice('A new code has been requested. Check your email.');
    } catch (cause) {
      failure(cause);
    } finally {
      setBusy(false);
    }
  }
  if (!accountApi.configured)
    return (
      <div className="account-unconnected">
        <div className="account-symbol">
          <Cloud size={26} />
        </div>
        <h3>A little preview of your next chapter.</h3>
        <p>Explore Oyu AI in the sample workspace. Your edits stay in this browser.</p>
        <div className="account-information">
          <LockKeyhole size={18} />
          <div>
            <strong>Account connection is not enabled</strong>
            <p>
              {accountApi.configurationError ??
                'This preview needs a configured Oyu AI account service before you can sign in, sync your wardrobe, or request AI analysis.'}
            </p>
          </div>
        </div>
        <p className="account-caption">
          No account has been created. Sample photos and scores are separate from your personal
          account.
        </p>
      </div>
    );
  const isCode = mode === 'verify' || mode === 'reset';
  const titles: Record<AuthMode, string> = {
    login: 'Welcome back.',
    register: 'Make room for your style.',
    verify: 'Check your inbox.',
    forgot: 'Let’s get you back in.',
    reset: 'A fresh start.',
  };
  return (
    <div className="account-auth">
      <div className="account-symbol">
        <Sparkles size={25} />
      </div>
      <h3>{titles[mode]}</h3>
      <p className="account-intro">
        {isCode
          ? `Enter the eight-digit code sent to ${email}. ${mode === 'reset' ? 'If an account exists, you’ll receive a recovery email.' : 'It may take a moment to arrive.'}`
          : mode === 'forgot'
            ? 'Enter your account email and we’ll help you reset your password.'
            : 'Sign in to your existing Oyu AI account and bring your wardrobe with you.'}
      </p>
      {(mode === 'login' || mode === 'register') && (
        <div className="account-tabs" aria-label="Account access">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            aria-pressed={mode === 'login'}
            onClick={() => changeMode('login')}
            disabled={busy}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            aria-pressed={mode === 'register'}
            onClick={() => changeMode('register')}
            disabled={busy}
          >
            Create account
          </button>
        </div>
      )}
      <form className="account-form" onSubmit={submit}>
        {mode === 'register' && (
          <label>
            Your name <span>(optional)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={120}
              placeholder="How should we call you?"
              disabled={busy}
            />
          </label>
        )}
        {!isCode && (
          <label>
            Email address
            <input
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
            Verification code
            <input
              className="account-code"
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
            {mode === 'reset' ? 'New password' : 'Password'}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              disabled={busy}
            />
            {mode !== 'login' && <span>8–128 characters. Spaces are kept as typed.</span>}
          </label>
        )}
        {mode === 'login' && (
          <button
            type="button"
            className="account-text-button account-forgot"
            onClick={() => changeMode('forgot')}
            disabled={busy}
          >
            Forgot password?
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
          <p className="account-caption">This code has expired. Request a new code to continue.</p>
        )}
        <button
          className="account-button account-primary"
          disabled={busy || blockedUntil > now || (isCode && expiresAt <= now)}
          type="submit"
          aria-busy={busy}
        >
          {busy ? (
            <>
              <LoaderCircle className="account-spin" size={18} /> Please wait…
            </>
          ) : (
            <>
              {
                {
                  login: 'Sign in',
                  register: 'Create account',
                  verify: 'Verify email',
                  forgot: 'Send recovery code',
                  reset: 'Reset password',
                }[mode]
              }
              <ArrowRight size={17} />
            </>
          )}
        </button>
        {isCode && (
          <button
            className="account-text-button"
            type="button"
            disabled={busy || resendAt > now || blockedUntil > now}
            onClick={resend}
          >
            {resendAt > now
              ? `Resend code in ${Math.ceil((resendAt - now) / 1000)}s`
              : 'Send a new code'}
          </button>
        )}
        {!['login', 'register'].includes(mode) && (
          <button
            type="button"
            className="account-text-button"
            onClick={() => {
              changeMode('login');
              setChallenge(null);
            }}
            disabled={busy}
          >
            <ArrowLeft size={14} /> Back to sign in
          </button>
        )}
      </form>
      <p className="account-caption account-auth-footnote">
        <LockKeyhole size={13} /> You’ll sign in again after refreshing this page. The sample
        workspace stays separate.
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
      notify('Signed out of your Oyu AI account.');
    } catch {
      notify('Signed out on this browser. The server could not be reached to revoke the session.');
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
      <div className="account-identity">
        <div className="account-avatar">
          {(data.profile?.profile.display_name || user.email).charAt(0).toUpperCase()}
        </div>
        <div>
          <h3>{data.profile?.profile.display_name || 'Your personal account'}</h3>
          <p>{user.email}</p>
        </div>
        <button className="account-button account-subtle" onClick={signOut}>
          <LogOut size={15} /> Sign out
        </button>
      </div>
      <div className="account-connection-label">
        <ShieldCheck size={15} />
        <span>Connected account · Separate from the sample workspace</span>
      </div>
      <nav className="account-tabs" aria-label="Account sections">
        {(['overview', 'wardrobe', 'looks', 'analysis'] as const).map((value) => (
          <button
            key={value}
            className={tab === value ? 'active' : ''}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {
              {
                overview: 'Overview',
                wardrobe: 'My wardrobe',
                looks: 'Looks & wear',
                analysis: 'AI analysis',
              }[value]
            }
          </button>
        ))}
      </nav>
      {tab === 'overview' && (
        <div className="account-overview">
          <div className="account-section-heading">
            <h4>Your account at a glance</h4>
            <button
              className="account-text-button"
              onClick={() => setReload((value) => value + 1)}
              disabled={busy}
            >
              <RefreshCw size={14} className={busy ? 'account-spin' : ''} /> Refresh
            </button>
          </div>
          {busy && (
            <p className="account-caption" role="status">
              Loading your private account…
            </p>
          )}
          <div className="account-stat-grid">
            <div>
              <span>Account access</span>
              <strong>
                {entitlement
                  ? entitlement.beta_access
                    ? 'Beta access'
                    : humanize(entitlement.tier)
                  : '—'}
              </strong>
              <p>
                {entitlement
                  ? entitlement.active
                    ? `${entitlement.daily_ai_jobs} AI jobs per day`
                    : 'AI access is currently inactive'
                  : errors.entitlement || 'Loading access…'}
              </p>
            </div>
            <div>
              <span>Style score</span>
              <strong>
                {data.summary?.overall == null ? '—' : `${Math.round(data.summary.overall)}/100`}
              </strong>
              <p>
                {data.summary
                  ? `${data.summary.sample_count} eligible ${data.summary.sample_count === 1 ? 'analysis' : 'analyses'}${data.summary.early_estimate && data.summary.overall != null ? ' · Early estimate' : ''}`
                  : errors.summary || 'Loading scores…'}
              </p>
            </div>
          </div>
          {entitlement && (
            <div className="account-detail-list">
              {entitlement.trial_ends_at && entitlement.tier === 'trial' && (
                <p>
                  <span>Trial ends</span>
                  <strong>{dateLabel(entitlement.trial_ends_at)}</strong>
                </p>
              )}
              {entitlement.period_end && (
                <p>
                  <span>{entitlement.renews ? 'Renews' : 'Access ends'}</span>
                  <strong>{dateLabel(entitlement.period_end)}</strong>
                </p>
              )}
              {entitlement.plan && (
                <p>
                  <span>Plan</span>
                  <strong>{entitlement.plan}</strong>
                </p>
              )}
              {entitlement.billing_retry && (
                <p className="account-error">
                  Your payment needs attention. Manage it through the store where you subscribed.
                </p>
              )}
            </div>
          )}
          {data.profile && (
            <div className="account-profile">
              <h4>Your style preferences</h4>
              <div className="account-tags">
                {data.profile.preferences.preferred_styles.length ? (
                  data.profile.preferences.preferred_styles.map((style) => (
                    <span key={style}>{humanize(style)}</span>
                  ))
                ) : (
                  <p className="account-caption">No style preferences recorded yet.</p>
                )}
              </div>
              <p className="account-caption">
                {data.profile.profile.timezone} ·{' '}
                {data.profile.profile.locale === 'mn' ? 'Mongolian' : 'English'} ·{' '}
                {data.profile.profile.unit_system === 'metric' ? 'Metric units' : 'Imperial units'}
              </p>
            </div>
          )}
          {errors.profile && (
            <p className="account-error" role="alert">
              Profile: {errors.profile}
            </p>
          )}
          <p className="account-caption">
            Subscriptions are managed in the mobile app or the store where you subscribed. Web
            checkout is not available in this build. Open Live fitting room from the sidebar to try
            clothes on your camera.
          </p>
        </div>
      )}
      {tab === 'wardrobe' && (
        <div>
          <div className="account-section-heading">
            <h4>
              {data.garments ? `${data.garments.length} items shown` : 'Your private wardrobe'}
            </h4>
            <button
              className="account-text-button"
              onClick={() => setReload((value) => value + 1)}
              disabled={busy}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          {errors.garments && (
            <p className="account-error" role="alert">
              {errors.garments}
            </p>
          )}
          {!data.garments && busy && <p role="status">Loading wardrobe…</p>}
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
              className="account-button account-subtle"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? 'Loading…' : 'Load more items'}
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
    setPhase('Reading your garment');
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
        'Your garment is still processing. Check again in a moment, or refresh your wardrobe later.',
      );
    else if (job.status === 'failed' || job.status === 'dead') {
      setError(
        job.last_error === 'ai_processing_consent_missing'
          ? apiErrorMessage(new ApiError(job.last_error, ''))
          : 'This garment could not be processed. You can retry processing from its item card.',
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
          ? 'Your garment is ready. Review the extracted details before adding it to your active wardrobe.'
          : 'Your garment has been updated.',
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
        throw new ApiError('invalid_response', 'The account service did not return a garment.');
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
            ? 'This garment is still processing. Check again in a moment.'
            : 'Processing failed. You can retry this garment.',
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
          ? 'Moved to laundry in your account.'
          : 'Marked clean and available in your account.',
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
      setNotice('Garment archived and its private photo deleted from your account.');
    } catch (cause) {
      showFailure(cause);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-wardrobe">
      <div className="account-wardrobe-toolbar">
        <p className="account-caption">Your private wardrobe, synced with Oyu AI.</p>
        <button
          className="account-button account-primary"
          onClick={() => {
            setAdding((value) => !value);
            setSelectedId(null);
            setArchiveId(null);
            setError('');
          }}
          disabled={busy}
        >
          <Plus size={15} />
          {adding ? 'Close upload' : 'Add garment'}
        </button>
      </div>
      {adding && (
        <section className="account-garment-upload">
          <div className="account-section-heading">
            <h4>One piece. More possibilities.</h4>
            <Shirt size={20} />
          </div>
          {!allowed ? (
            <div className="account-consent">
              <ShieldCheck size={22} />
              <h4>Your photo, your choice.</h4>
              <p>
                To identify this garment, Oyu AI uploads your chosen photo to private account
                storage and sends it to the configured AI vision provider, OpenAI or Anthropic.
                Camera metadata is removed first. Your name, email, and account ID are not sent with
                the photo.
              </p>
              <p>
                This account-wide choice covers garment and outfit photos. You can turn it off from
                the AI analysis tab; it does not undo completed processing.
              </p>
              <label className="account-check">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                  disabled={busy || !consent}
                />
                <span>I agree to AI processing of the photos I choose to submit.</span>
              </label>
              <button
                className="account-button account-primary"
                onClick={grantConsent}
                disabled={!agreed || busy || !consent}
              >
                Allow AI photo processing
              </button>
              {!consent && (
                <p className="account-caption">{consentError || 'Checking your privacy choice…'}</p>
              )}
            </div>
          ) : (
            <>
              <p className="account-caption">
                Photograph one garment clearly, then review the details Oyu AI finds. AI photo
                processing is allowed for your account.
              </p>
              {entitlement?.active === false && (
                <p className="account-error">
                  Your account needs active AI access to process garment photos.
                </p>
              )}
              <label className={`account-photo-picker ${busy ? 'disabled' : ''}`}>
                {preview ? (
                  <img src={preview} alt="Garment selected for private account upload" />
                ) : (
                  <ImagePlus size={28} />
                )}
                <strong>{file?.name || 'Choose a garment photo'}</strong>
                <span>JPEG, PNG or WebP · Up to 15 MB</span>
                <input
                  type="file"
                  aria-label="Choose garment photo for account wardrobe"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => {
                    chooseFile(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                  disabled={busy || entitlement?.active === false}
                />
              </label>
              <button
                className="account-button account-primary full-width"
                onClick={upload}
                disabled={!file || busy || entitlement?.active === false}
              >
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="account-spin" />
                    {phase || 'Working…'}
                  </>
                ) : pending ? (
                  'Check garment processing'
                ) : (
                  <>
                    <Sparkles size={16} />
                    Upload and identify garment
                  </>
                )}
              </button>
              {busy && (
                <p className="account-caption" role="status">
                  Closing this panel stops waiting. A submitted garment continues processing in your
                  account.
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
            <h4 id="archive-garment-title">Archive {archiveItem.name || 'this garment'}?</h4>
            <p>
              This removes it from your wardrobe and permanently deletes its private photo. Saved
              looks using this piece may become unavailable. This cannot be undone here.
            </p>
            <div className="account-action-row">
              <button
                className="account-button account-subtle"
                onClick={() => setArchiveId(null)}
                disabled={busy}
              >
                Keep garment
              </button>
              <button className="account-button account-danger" onClick={archive} disabled={busy}>
                {busy ? 'Archiving…' : 'Archive and delete photo'}
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
              setNotice('Garment confirmed and active in your account.');
            }}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
      {!selected && garments.length === 0 && !adding && (
        <div className="account-empty">
          <Shirt size={30} />
          <h4>Make room for your first piece.</h4>
          <p>
            Add a garment photo to start your own wardrobe. Review every detail before it becomes
            active.
          </p>
        </div>
      )}
      <div className="account-garment-grid">
        {garments.map((garment) => (
          <article className="account-garment account-garment-manage" key={garment.id}>
            <div className="account-garment-top">
              <PrivateGarmentImage garment={garment} />
              <div>
                <h4>{garment.name || 'Untitled garment'}</h4>
                <p>
                  {[garment.primary_color, garment.category].filter(Boolean).join(' · ') ||
                    'Reading garment details'}
                </p>
                <span className={`account-status ${garment.status === 'active' ? 'ready' : ''}`}>
                  {garment.status === 'active'
                    ? humanize(garment.availability)
                    : humanize(garment.status)}
                </span>
              </div>
            </div>
            <div className="account-garment-actions">
              {(garment.status === 'active' || garment.status === 'pending_confirmation') && (
                <button
                  className="account-text-button"
                  onClick={() => {
                    setSelectedId(garment.id);
                    setArchiveId(null);
                    setAdding(false);
                    setError('');
                  }}
                  disabled={busy}
                >
                  {garment.status === 'pending_confirmation'
                    ? 'Review and confirm'
                    : 'View details'}
                </button>
              )}
              {garment.status === 'active' && (
                <button
                  className="account-text-button"
                  onClick={() => availability(garment)}
                  disabled={busy}
                >
                  {garment.availability === 'laundry' ? 'Mark clean' : 'Move to laundry'}
                </button>
              )}
              {garment.status === 'processing' && (
                <button
                  className="account-text-button"
                  onClick={() => refreshGarment(garment.id)}
                  disabled={busy}
                >
                  Check processing
                </button>
              )}
              {garment.status === 'failed' && (
                <button
                  className="account-text-button"
                  onClick={() => retry(garment)}
                  disabled={busy || entitlement?.active === false}
                >
                  Retry processing
                </button>
              )}
              <button
                className="account-text-button"
                aria-label={`Archive ${garment.name || 'garment'}`}
                onClick={() => {
                  setArchiveId(garment.id);
                  setSelectedId(null);
                }}
                disabled={busy}
              >
                <Archive size={13} /> Archive
              </button>
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
    <div className="account-garment-icon">
      {url ? (
        <img
          src={url}
          alt={garment.name || 'Private garment'}
          referrerPolicy="no-referrer"
          onError={() => setUrl('')}
        />
      ) : (
        <Shirt size={25} />
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
      setError('Choose a category before confirming this garment.');
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
    ['Subcategory', garment.subcategory || 'Not specified'],
    ['Layer', garment.layer_position || 'base'],
    ['Material', garment.material || 'Not specified'],
    ['Pattern', garment.pattern ?? 'solid'],
    ['Secondary colors', garment.secondary_colors?.join(', ') || 'None'],
    [
      'Seasons',
      garment.seasons?.length ? garment.seasons.join(', ') : 'spring, summer, autumn, winter',
    ],
    [
      'Temperature range',
      garment.min_temp_c == null && garment.max_temp_c == null
        ? 'Not specified'
        : `${garment.min_temp_c ?? '—'}°C to ${garment.max_temp_c ?? '—'}°C`,
    ],
    ['Occasions', garment.occasions?.join(', ') || 'Not specified'],
    ['Style tags', garment.style_tags?.join(', ') || 'Not specified'],
    ['Brand', garment.brand || 'Not specified'],
    ['Description', garment.description || 'Not specified'],
  ];
  if (garment.status !== 'pending_confirmation')
    return (
      <section className="account-garment-review">
        <div className="account-section-heading">
          <h4>{garment.name || 'Garment details'}</h4>
          <button className="account-text-button" onClick={onClose}>
            Close details
          </button>
        </div>
        <p className="account-caption">
          This garment is confirmed. Change its availability or archive it from its card.
        </p>
        <div className="account-retained-details">
          <dl>
            {[
              ['Category', garment.category || 'Not specified'],
              ['Primary color', garment.primary_color || 'Not specified'],
              ['Warmth', String(garment.warmth_level)],
              ['Formality', String(garment.formality)],
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
    <section className="account-garment-review">
      <div className="account-section-heading">
        <h4>Review your garment</h4>
        <button className="account-text-button" onClick={onClose} disabled={busy}>
          Close review
        </button>
      </div>
      <p className="account-caption">
        {garment.needs_review
          ? 'The image reader was uncertain. Please check these details carefully.'
          : 'Check the extracted details and make them your own.'}{' '}
        Confirming makes this piece available to your wardrobe.
      </p>
      <form className="account-form" onSubmit={submit}>
        <label>
          Garment name
          <input
            value={name}
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
          />
        </label>
        <div className="account-review-fields">
          <label>
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as GarmentCategory)}
              required
              disabled={busy}
            >
              <option value="">Choose a category</option>
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
                  {humanize(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Primary color
            <input
              value={color}
              maxLength={80}
              onChange={(event) => setColor(event.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <div className="account-review-fields">
          <label>
            Warmth
            <select
              value={warmth}
              onChange={(event) => setWarmth(Number(event.target.value))}
              disabled={busy}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option value={value} key={value}>
                  {value} · {['Very light', 'Light', 'Medium', 'Warm', 'Very warm'][value - 1]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Formality
            <select
              value={formality}
              onChange={(event) => setFormality(Number(event.target.value))}
              disabled={busy}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option value={value} key={value}>
                  {value} ·{' '}
                  {['Very casual', 'Casual', 'Smart casual', 'Formal', 'Very formal'][value - 1]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details className="account-retained-details">
          <summary>Other extracted details · kept when you save</summary>
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
        <button
          className="account-button account-primary"
          type="submit"
          disabled={busy || !category}
        >
          {busy
            ? 'Saving…'
            : garment.status === 'pending_confirmation'
              ? 'Confirm and add to wardrobe'
              : 'Save garment details'}
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
        throw new ApiError('invalid_response', 'The account service did not return an analysis.');
      setScore(created.score);
      setPhase('Analyzing your outfit');
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
            : 'This photo could not be analyzed. You can choose another photo and try again.',
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
          <h4>A fresh perspective on your outfit.</h4>
          <p className="account-caption">
            Upload a photo for analysis from your connected Oyu AI service.
          </p>
        </div>
        <Sparkles size={21} />
      </div>
      {!allowed && (
        <div className="account-consent">
          <ShieldCheck size={22} />
          <h4>You choose what to share.</h4>
          <p>
            When you request an analysis, your photo is uploaded to private account storage and sent
            to the configured AI vision provider, OpenAI or Anthropic. Camera metadata is removed
            before processing. Your name, email, and account ID are not sent with the photo.
          </p>
          <p>
            This account-wide choice also covers garment photo processing in Oyu AI. You can turn it
            off here. It does not undo processing already completed.
          </p>
          <label className="account-check">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={busy || !consent}
            />
            <span>I agree to AI processing of the photos I choose to submit.</span>
          </label>
          <button
            className="account-button account-primary"
            onClick={() => changeConsent(true)}
            disabled={!agreed || busy || !consent}
          >
            {busy ? 'Saving…' : 'Allow AI photo processing'}
          </button>
          {!consent && (
            <p className="account-caption">{consentError || 'Checking your privacy choice…'}</p>
          )}
        </div>
      )}
      {allowed && (
        <>
          <div className="account-consent-active">
            <span>
              <CheckCircle2 size={15} /> AI photo processing is allowed
            </span>
            <button
              className="account-text-button"
              onClick={() => changeConsent(false)}
              disabled={busy}
            >
              Turn off
            </button>
          </div>
          {entitlement && !entitlement.active && (
            <p className="account-error">
              Your account does not currently include AI access. Manage your subscription in the
              mobile app to continue.
            </p>
          )}
          <label className={`account-photo-picker ${busy ? 'disabled' : ''}`}>
            {preview ? (
              <img src={preview} alt="Your selected outfit, ready for analysis" />
            ) : (
              <ImagePlus size={30} />
            )}
            <strong>{file ? file.name : 'Choose an outfit photo'}</strong>
            <span>JPEG, PNG or WebP · Up to 15 MB</span>
            <input
              type="file"
              aria-label="Choose outfit photo for account analysis"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                chooseFile(e.target.files?.[0]);
                e.target.value = '';
              }}
              disabled={busy || entitlement?.active === false}
            />
          </label>
          <button
            className="account-button account-primary"
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
                <LoaderCircle size={17} className="account-spin" />
                {phase || 'Working…'}
              </>
            ) : jobPending ? (
              <>
                <RefreshCw size={16} /> Check analysis
              </>
            ) : (
              <>
                <Sparkles size={17} /> Analyze this outfit
              </>
            )}
          </button>
          {busy && (
            <p className="account-caption" role="status">
              Your analysis may take a moment. Closing this panel stops waiting; a submitted job
              continues in your account.
            </p>
          )}
          {jobPending && !busy && (
            <p className="account-caption" role="status">
              Your analysis is still processing. Check again in a moment. No score is available yet.
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
          className="account-button account-subtle"
          disabled={busy || loadingScore}
          onClick={() => refreshScore(score.id)}
        >
          <RefreshCw size={15} />
          {loadingScore ? 'Checking…' : 'Refresh analysis'}
        </button>
      )}
      {loadingScore && (
        <p className="account-caption" role="status">
          Loading the latest analysis…
        </p>
      )}
      <div className="account-recent">
        <h4>Recent account analyses</h4>
        {recentError && (
          <p className="account-error" role="alert">
            {recentError}
          </p>
        )}
        {recent.length === 0 && !recentError && (
          <p className="account-caption">
            No recent analyses loaded. Your completed outfit reviews will appear here.
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
              <strong>{item.title || 'Outfit analysis'}</strong>
              <small>{dateLabel(item.created_at)}</small>
            </span>
            <b>
              {item.status === 'scored'
                ? item.unreadable
                  ? 'Unreadable'
                  : item.overall == null
                    ? 'Partial'
                    : `${item.overall}/100`
                : humanize(item.status)}
            </b>
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreCard({ score }: { score: ApiScore }) {
  return (
    <article className="account-score-card">
      <div className="account-section-heading">
        <h4>{score.title || 'Your outfit analysis'}</h4>
        <span className="account-status ready">Account result</span>
      </div>
      {score.status !== 'scored' ? (
        <p>
          {score.status === 'failed'
            ? 'This analysis could not be completed.'
            : 'Your photo is being analyzed. Results are not ready yet.'}
        </p>
      ) : score.unreadable ? (
        <p>
          The outfit could not be clearly assessed. Try a well-lit photo with your outfit in view.
        </p>
      ) : (
        <>
          <div className="account-result-overall">
            <strong>
              {score.overall ?? '—'}
              {score.overall != null && <small>/100</small>}
            </strong>
            <span>
              {score.overall == null ? 'Some details were not visible' : 'Overall style score'}
            </span>
          </div>
          <div className="account-score-dimensions">
            {(
              [
                ['Color harmony', score.color_harmony],
                ['Hairstyle', score.hairstyle],
                ['Accessories', score.accessory],
                ['Styling', score.trendiness],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value == null ? 'Not visible' : `${value}/25`}</strong>
              </div>
            ))}
          </div>
          <p>{score.comment}</p>
          {score.positives.length > 0 && (
            <ul>
              {score.positives.map((text, i) => (
                <li key={i}>
                  <Check size={14} />
                  {text}
                </li>
              ))}
            </ul>
          )}
          {score.negatives.length > 0 && (
            <div className="account-improvements">
              <strong>Things to refine</strong>
              {score.negatives.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </div>
          )}
          {score.suggestions.length > 0 && (
            <div className="account-improvements">
              <strong>Ideas to try</strong>
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
