/** Browser adapter for the existing Oyu AI owned-auth /v1 API.
 * Credentials and private account data stay in memory. The sample workspace
 * deliberately has no connection to this client.
 */
import { lang, localized, t } from './lang';

export type Locale = 'en' | 'mn';
export interface AuthUser {
  id: string;
  email: string;
}
interface SessionResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: AuthUser;
}
export interface AuthChallenge {
  challenge_id: string;
  expires_in: number;
  resend_after: number;
}
export interface ProfileResponse {
  completed: boolean;
  profile: {
    display_name: string | null;
    locale: Locale;
    timezone: string;
    unit_system: 'metric' | 'imperial';
  };
  preferences: { preferred_styles: string[]; disliked_colors: string[]; cold_sensitivity: number };
}
export interface Entitlement {
  tier: 'trial' | 'pro' | 'expired';
  active: boolean;
  trial_ends_at: string | null;
  period_end: string | null;
  source: string | null;
  plan: string | null;
  renews: boolean;
  billing_retry: boolean;
  beta_access: boolean;
  daily_ai_jobs: number;
  trial_days_remaining: number | null;
}
export type GarmentCategory =
  'top' | 'bottom' | 'dress' | 'outerwear' | 'footwear' | 'accessory' | 'underlayer';
export interface GarmentAttributes {
  category: GarmentCategory;
  subcategory: string | null;
  layer_position: 'base' | 'mid' | 'outer' | 'standalone';
  primary_color: string | null;
  secondary_colors: string[];
  pattern: string;
  material: string | null;
  seasons: string[];
  warmth_level: number;
  min_temp_c: number | null;
  max_temp_c: number | null;
  formality: number;
  occasions: string[];
  style_tags: string[];
  brand: string | null;
  name: string;
  description: string | null;
  schema_version: 'v1';
}
export interface ApiGarment {
  id: string;
  media_id: string | null;
  name: string;
  category: GarmentCategory | null;
  status: 'processing' | 'pending_confirmation' | 'active' | 'archived' | 'failed';
  primary_color: string | null;
  availability: 'available' | 'laundry' | 'repair' | 'lent_out' | 'stored';
  is_clean: boolean;
  user_confirmed: boolean;
  needs_review: boolean;
  created_at: string;
  subcategory: string | null;
  layer_position: GarmentAttributes['layer_position'];
  secondary_colors: string[];
  pattern: string | null;
  material: string | null;
  seasons: string[];
  warmth_level: number;
  min_temp_c: number | null;
  max_temp_c: number | null;
  formality: number;
  occasions: string[];
  style_tags: string[];
  brand: string | null;
  description: string | null;
  ai_confidence: number | null;
  corrected_fields: string[];
}
export interface ApiScore {
  id: string;
  media_id: string;
  status: 'analyzing' | 'scored' | 'failed';
  title: string;
  overall: number | null;
  color_harmony: number | null;
  hairstyle: number | null;
  accessory: number | null;
  trendiness: number | null;
  comment: string;
  positives: string[];
  negatives: string[];
  suggestions: string[];
  locale: Locale;
  unreadable: boolean;
  failure_reason: string | null;
  created_at: string;
}
export type ScoreCriterion = 'color_harmony' | 'hairstyle' | 'accessory' | 'trendiness';
export interface HomeSummary {
  preferences: {
    window_days: 7 | 30 | null;
    weights: Record<ScoreCriterion, number>;
    version: number;
  };
  timezone: string;
  period_start: string | null;
  period_end: string;
  overall: number | null;
  sample_count: number;
  early_estimate: boolean;
  metrics: Record<ScoreCriterion, number | null>;
  metric_counts: Record<ScoreCriterion, number>;
  incomplete_excluded_count: number;
  legacy_excluded_count: number;
  unreadable_excluded_count: number;
  unavailable_excluded_count: number;
}
export interface WearHistory {
  start_date: string;
  end_date: string;
  days: {
    date: string;
    items: {
      id: string;
      garment_id: string;
      name: string;
      category: string;
      primary_color: string | null;
      source: 'confirmed' | 'manual' | 'inferred';
      archived: boolean;
    }[];
  }[];
}
export type OutfitSlot = 'top' | 'bottom' | 'dress' | 'mid' | 'outer' | 'footwear' | 'accessory1';
export interface OutfitItemReference {
  source: 'wardrobe' | 'catalog';
  item_id: string;
  slot: OutfitSlot;
}
export interface ApiSavedLook {
  id: string;
  name: string;
  created_at: string;
  is_available: boolean;
  image_ready: boolean;
  items: (OutfitItemReference & {
    name: string;
    is_available: boolean;
    unavailable_reason: string | null;
  })[];
}
export interface AiConsent {
  consent_type: 'ai_processing';
  policy_version: 'ai-processing.v1';
  status: 'not_recorded' | 'granted' | 'revoked';
  granted: boolean;
  record_id: string | null;
  locale: Locale | null;
  recorded_at: string | null;
}
export interface UploadTicket {
  media_id: string;
  bucket: string;
  object_path: string;
  mime_type: string;
  byte_size: number;
  signed_upload_url: string;
  upload_token: string;
  expires_at: string;
}
export interface AiJob {
  id: string;
  job_type: string;
  subject_id: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';
  attempts: number;
  max_attempts: number;
  last_error: string | null;
}
export interface MutationOptions {
  idempotencyKey: string;
  signal?: AbortSignal;
}
interface RequestOptions {
  method?: string;
  body?: unknown;
  authenticated?: boolean;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Internal fixed same-origin bridge route; never a caller-supplied host. */
  bridge?: boolean;
  responseType?: 'blob';
}
export interface ImageOperation {
  readonly ownerId: string;
  readonly file: Blob;
  readonly kind: 'garment' | 'score';
  readonly locale: Locale;
  readonly uploadKey: string;
  readonly createKey: string;
  ticket?: UploadTicket;
  uploaded?: boolean;
  created?: { garment?: ApiGarment; score?: ApiScore; job: AiJob };
}

/** Saved-look Live contracts from the existing backend, not camera capabilities. */
export type LiveTryOnProcessor = 'fal' | 'decart';
export type LiveTryOnPolicyVersion =
  'live-try-on.fal.v1' | 'live-try-on.fal.v2' | 'live-try-on.decart.v1' | 'live-try-on.decart.v2';
export interface LiveTryOnReadiness {
  saved_look_id: string;
  enabled: boolean;
  ready: boolean;
  blockers: string[];
  max_duration_seconds: number;
  consent_policy_version: LiveTryOnPolicyVersion;
  processor: LiveTryOnProcessor;
  continuous: boolean;
  entitled: boolean;
  allowance_kind: 'trial' | 'pro' | null;
  allowance_seconds_remaining: number;
  session_max_seconds: number;
}
export interface LiveTryOnConsent {
  policy_version: LiveTryOnPolicyVersion;
  granted: true;
  locale: Locale;
  continuous: boolean;
}
export interface LiveTryOnSession {
  id: string;
  saved_look_id: string;
  max_duration_seconds: number;
  connect_before: string;
  continuous: boolean;
  lease_seconds: number | null;
}
export type FittingRoomSlot = 'top' | 'bottom' | 'shoes' | 'dress';
export interface FittingRoomItemRef {
  source: 'wardrobe' | 'catalog';
  item_id: string;
}
export type FittingRoomSelection = Partial<Record<FittingRoomSlot, FittingRoomItemRef | null>>;
export interface FittingRoomReadiness {
  enabled: boolean;
  ready: boolean;
  blockers: string[];
  entitled: boolean;
  allowance_kind: 'trial' | 'pro' | null;
  allowance_seconds_remaining: number;
  session_max_seconds: number;
  consent_policy_version: 'live-try-on.decart.v3';
}
export interface FittingRoomConsent {
  policy_version: 'live-try-on.decart.v3';
  granted: true;
  locale?: Locale | null;
}
export interface FittingRoomCandidate {
  slot: FittingRoomSlot;
  source: 'wardrobe' | 'catalog';
  item_id: string;
  name: string;
  category: GarmentCategory | null;
  subcategory: string | null;
  primary_color: string | null;
  image_url: null;
  reference_ready: boolean;
  store: {
    listing_id: string;
    price_mnt: number;
    price_mnt_minor: number;
    is_test: boolean;
  } | null;
  reasons: string[];
}
export interface FittingRoomCandidatesRequest {
  slot: FittingRoomSlot;
  selection: FittingRoomSelection;
  cursor?: string | null;
  limit?: number;
}
export interface FittingRoomCandidatesResponse {
  items: FittingRoomCandidate[];
  next_cursor: string | null;
}
export interface FittingRoomSession {
  id: string;
  saved_look_id: null;
  max_duration_seconds: number;
  connect_before: string;
  continuous: true;
  lease_seconds: number;
  selection: FittingRoomSelection;
}
interface LiveStreamTicket {
  ticket: string;
  expires_in: number;
}
export interface LiveIceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}
export type LiveClientSignal =
  | { type: 'offer'; sdp: string }
  | { type: 'icecandidate'; candidate: LiveIceCandidate }
  | { type: 'stop' }
  | { type: 'select'; seq: number; selection: FittingRoomSelection };
export type LiveServerSignal =
  | {
      type: 'ready';
      iceServers?: RTCIceServer[];
      continuous?: boolean;
      session_seconds_remaining?: number;
    }
  | { type: 'iceservers'; iceServers: RTCIceServer[] }
  | { type: 'answer'; sdp: string }
  | { type: 'icecandidate'; candidate: LiveIceCandidate }
  | { type: 'error' | 'stopped'; code: string }
  | { type: 'applying' | 'applied'; seq: number }
  | { type: 'select_rejected'; seq: number; code: string };

const fittingLanes: FittingRoomSlot[] = ['top', 'bottom', 'shoes', 'dress'];
function fittingSelection(selection: FittingRoomSelection): FittingRoomSelection {
  return Object.fromEntries(
    fittingLanes
      .filter((lane) => selection[lane] !== undefined)
      .map((lane) => {
        const item = selection[lane];
        return [lane, item ? { source: item.source, item_id: item.item_id } : null];
      }),
  );
}
/** A partial outfit is supported; shoes alone and dress+separates are not. */
export function isValidFittingRoomSelection(selection: FittingRoomSelection): boolean {
  if (
    !selection ||
    typeof selection !== 'object' ||
    (!selection.top && !selection.bottom && !selection.dress) ||
    (selection.dress && (selection.top || selection.bottom))
  )
    return false;
  const items = fittingLanes
    .map((lane) => selection[lane])
    .filter((item): item is FittingRoomItemRef => !!item);
  if (
    items.some(
      (item) =>
        !['wardrobe', 'catalog'].includes(item.source) ||
        typeof item.item_id !== 'string' ||
        !item.item_id,
    )
  )
    return false;
  return new Set(items.map((item) => `${item.source}:${item.item_id}`)).size === items.length;
}

/** A changed provider/disclosure must be reviewed before another camera grant. */
export function isSupportedLiveConsent(readiness: LiveTryOnReadiness): boolean {
  return (
    ['fal', 'decart'].includes(readiness.processor) &&
    typeof readiness.continuous === 'boolean' &&
    readiness.consent_policy_version ===
      `live-try-on.${readiness.processor}.${readiness.continuous ? 'v2' : 'v1'}`
  );
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter: number | null;
  constructor(code: string, message: string, status = 0, retryAfter: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const problemMessages: Record<string, string> = localized({
  invalid_credentials: [
    'Имэйл эсвэл нууц үг буруу байна. Дахин оролдоно уу.',
    'That email and password don’t match. Please try again.',
  ],
  invalid_verification_code: [
    'Код буруу эсвэл хугацаа нь дууссан байна. 8 оронтой кодоо шалгах эсвэл шинэ код хүснэ үү.',
    'This code is incorrect or has expired. Check all eight digits or request a new code.',
  ],
  weak_password: [
    'Түгээмэл биш, 8–128 тэмдэгттэй нууц үг сонгоно уу.',
    'Choose a password between 8 and 128 characters that isn’t commonly used.',
  ],
  signup_disabled: [
    'Шинэ бүртгэл одоогоор хаалттай байна. Бүртгэлтэй хэрэглэгчид нэвтэрч болно.',
    'New account registration is currently unavailable. Existing accounts can still sign in.',
  ],
  rate_limited: [
    'Хэт олон удаа оролдлоо. Түр хүлээгээд дахин оролдоно уу.',
    'Too many attempts. Please wait before trying again.',
  ],
  unauthenticated: [
    'Таны нэвтрэлтийн хугацаа дууссан. Дахин нэвтэрнэ үү.',
    'Your session has ended. Please sign in again.',
  ],
  provider_unavailable: [
    'Энэ үйлчилгээ түр ажиллахгүй байна. Дараа дахин оролдоно уу.',
    'This service is temporarily unavailable. Please try again later.',
  ],
  ai_processing_consent_missing: [
    'Зургийг AI-аар боловсруулахын өмнө таны тодорхой зөвшөөрөл шаардлагатай.',
    'AI processing requires your explicit consent before a photo can be processed.',
  ],
  subscription_required: [
    'Таны бүртгэлд одоогоор AI ашиглах эрх алга. Гишүүнчлэлээ гар утасны аппаас удирдана уу.',
    'Your account doesn’t currently include AI access. Manage your membership in the mobile app.',
  ],
  quota_exceeded: [
    'Таны бүртгэл AI ашиглалтын хязгаартаа хүрлээ. Эрх шинэчлэгдсэний дараа дахин оролдоно уу.',
    'Your account has reached its AI usage limit. Please try again when your allowance resets.',
  ],
  validation_error: [
    'Зарим мэдээллийг хүлээн авах боломжгүй байна. Шалгаад дахин оролдоно уу.',
    'Some details couldn’t be accepted. Check your entries and try again.',
  ],
  saved_look_limit: [
    'Таны бүртгэл хадгалах хослолын хязгаартаа хүрлээ.',
    'Your account has reached its saved look limit.',
  ],
  conflict: [
    'Энэ өөрчлөлт одоогийн мэдээлэлтэй зөрчилдөж байна. Бүртгэлээ шинэчлээд дахин оролдоно уу.',
    'This change conflicts with the current item. Refresh your account and try again.',
  ],
  not_found: [
    'Энэ зүйл таны бүртгэлд байхгүй болсон байна.',
    'This item is no longer available in your account.',
  ],
  network_error: [
    'Бүртгэлийн үйлчилгээнд холбогдож чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.',
    'Couldn’t reach the account service. Check your connection and try again.',
  ],
  timeout: [
    'Бүртгэлийн үйлчилгээ хэт удаан хариу өгч байна. Дахин оролдоно уу.',
    'The account service took too long to respond. Please try again.',
  ],
  live_tryon_active: [
    'Өөр шууд өмсөж үзэх явц идэвхтэй байна. Шинийг эхлүүлэхийн өмнө түүнийг зогсооно уу.',
    'Another live try-on is already active. Stop it before starting a new one.',
  ],
  live_allowance_exhausted: [
    'Шууд өмсөж үзэх эрх тань дууссан. Дахин эхлүүлэхийн өмнө бүртгэлийнхээ эрхийг шалгана уу.',
    'Your live try-on allowance is used up. Check your account access before starting again.',
  ],
  live_tryon_budget: [
    'Шууд өмсөж үзэх үйлчилгээ түр ачаалалтай байна. Дараа дахин оролдоно уу.',
    'Live try-on is temporarily at capacity. Please try again later.',
  ],
  live_contract_outdated: [
    'Шууд камерын энэ нөхцөл хүчингүй болсон. Үргэлжлүүлэхийн өмнө аппаа дахин ачаална уу.',
    'This live camera disclosure is no longer supported. Reload the app before continuing.',
  ],
  live_tryon_disabled: [
    'Энэ үйлчилгээнд шууд өмсөж үзэх боломж одоогоор идэвхгүй байна.',
    'Live try-on isn’t currently enabled for this service.',
  ],
  live_tryon_consent_changed: [
    'Шууд камерын боловсруулалтын нөхцөл өөрчлөгдсөн. Дахин эхлэхийн өмнө танилцана уу.',
    'The live camera processing disclosure has changed. Review it before starting again.',
  ],
  live_session_limit: [
    'Шууд өмсөж үзэх хугацааны хязгаарт хүрлээ. Дахин эхлүүлэх эсэхээ та өөрөө шийднэ үү.',
    'This live try-on reached its time limit. Whether you start another is up to you.',
  ],
  live_preview_unavailable: [
    'Шууд өмсөж үзэх явц үргэлжлэх боломжгүй боллоо. Камер унтарлаа.',
    'The live try-on couldn’t continue. Your camera has been turned off.',
  ],
  live_invalid_response: [
    'Шууд үйлчилгээнээс энэ хөтөч аюулгүй ашиглах боломжгүй хариу ирлээ.',
    'The live service returned a response this browser can’t safely use.',
  ],
  live_bridge_unavailable: [
    'Хөтчийн шууд холболтын үйлчилгээ ажиллахгүй байна. Дараа дахин оролдоно уу.',
    'The browser live connection service is unavailable. Please try again later.',
  ],
  selection_invalid: [
    'Цамц, өмд банзал эсвэл даашинз сонгоно уу. Даашинз нь цамц, өмдийг орлох бөгөөд нэг хувцас зөвхөн нэг байрлалд байна.',
    'Choose a top, a bottom, or a dress. A dress replaces separates, and each piece can fill only one place.',
  ],
  selection_item_unavailable: [
    'Сонгосон хувцас шууд өмсөж үзэхэд боломжгүй болсон. Өөр хувцас сонгоно уу.',
    'A selected piece is no longer available for live try-on. Choose another piece.',
  ],
  select_rate_limited: [
    'Шууд хослолоо дахин солихоос өмнө түр хүлээнэ үү.',
    'Please wait a moment before changing your live outfit again.',
  ],
});

export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return t('Алдаа гарлаа. Дахин оролдоно уу.', 'Something went wrong. Please try again.');
  const message = problemMessages[error.code] ?? error.message;
  return error.code === 'rate_limited' && error.retryAfter
    ? t(
        `${message} ${error.retryAfter} секундын дараа дахин оролдоно уу.`,
        `${message} Try again in ${error.retryAfter} ${error.retryAfter === 1 ? 'second' : 'seconds'}.`,
      )
    : message;
}

export function newOperationKey(): string {
  return `web:${crypto.randomUUID()}`;
}
/** Match the mobile confirmation contract: retain extraction metadata unless the
 * user explicitly changes it. An unknown category must never become "top". */
export function garmentConfirmation(
  source: ApiGarment,
  edits: Partial<GarmentAttributes> = {},
): GarmentAttributes {
  const category = edits.category ?? source.category;
  if (!category)
    throw new ApiError(
      'category_required',
      t(
        'Баталгаажуулахаас өмнө ангилал сонгоно уу.',
        'Choose a category before confirming this piece.',
      ),
    );
  return {
    category,
    subcategory: source.subcategory ?? null,
    layer_position: source.layer_position ?? 'base',
    primary_color: source.primary_color ?? null,
    secondary_colors: [...(source.secondary_colors ?? [])],
    pattern: source.pattern ?? 'solid',
    material: source.material ?? null,
    seasons: source.seasons?.length
      ? [...source.seasons]
      : ['spring', 'summer', 'autumn', 'winter'],
    warmth_level: source.warmth_level ?? 3,
    min_temp_c: source.min_temp_c ?? null,
    max_temp_c: source.max_temp_c ?? null,
    formality: source.formality ?? 2,
    occasions: [...(source.occasions ?? [])],
    style_tags: [...(source.style_tags ?? [])],
    brand: source.brand ?? null,
    name: source.name,
    description: source.description ?? null,
    schema_version: 'v1',
    ...edits,
  };
}
const escaped = (value: string) => encodeURIComponent(value);
const isLoopback = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);

function parseBaseUrl(value: string): string {
  if (!value.trim()) return '';
  // The included web bridge forwards this fixed prefix to its configured API.
  if (value.trim().replace(/\/+$/, '') === '/__lookluxe/api') return '/__lookluxe/api';
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ApiError(
      'configuration_error',
      t(
        'Тохируулсан бүртгэлийн үйлчилгээний хаяг буруу байна.',
        'The configured account service URL is invalid.',
      ),
    );
  }
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ApiError(
      'configuration_error',
      t(
        'Бүртгэлийн үйлчилгээнд HTTPS шаардлагатай (хөгжүүлэлтийн үед localhost дээр HTTP болно).',
        'The account service requires HTTPS, or HTTP on localhost for development.',
      ),
    );
  }
  return url.href.replace(/\/+$/, '');
}

/** One instance owns one in-memory session. No cookies or browser storage. */
export class LookLuxeApi {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private session: SessionResponse | null = null;
  private expiresAt = 0;
  private epoch = 0;
  private refreshing: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private readonly rawBaseUrl: string;

  constructor(baseUrl = '', fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.fetcher = fetcher;
    this.rawBaseUrl = baseUrl;
    let normalized = '';
    try {
      normalized = parseBaseUrl(baseUrl);
    } catch {
      normalized = '';
    }
    this.baseUrl = normalized;
  }
  /** Why the account service is unavailable, in the current language (null when configured). */
  get configurationError(): string | null {
    if (this.baseUrl) return null;
    try {
      parseBaseUrl(this.rawBaseUrl);
      return null;
    } catch (cause) {
      return apiErrorMessage(cause);
    }
  }
  get configured(): boolean {
    return !!this.baseUrl;
  }
  get currentUser(): AuthUser | null {
    return this.session?.user ?? null;
  }
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
  private clearSession(): void {
    this.epoch++;
    this.session = null;
    this.expiresAt = 0;
    this.notify();
  }
  private storeSession(session: SessionResponse): void {
    if (
      !session.access_token ||
      !session.refresh_token ||
      !session.user?.id ||
      !session.user.email ||
      session.token_type !== 'bearer' ||
      !Number.isFinite(session.expires_in)
    ) {
      throw new ApiError(
        'invalid_response',
        t(
          'Бүртгэлийн үйлчилгээнээс буруу нэвтрэлтийн мэдээлэл ирлээ.',
          'The account service returned an invalid session.',
        ),
      );
    }
    this.session = session;
    this.expiresAt = Date.now() + session.expires_in * 1000;
    this.notify();
  }

  private async wire<T>(path: string, options: RequestOptions = {}, token?: string): Promise<T> {
    if (!this.configured)
      throw new ApiError(
        'not_configured',
        this.configurationError ??
          t(
            'Энэ хувилбарт бүртгэлийн холболт тохируулагдаагүй байна.',
            'Account connection isn’t configured for this preview.',
          ),
      );
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
      25_000,
    );
    try {
      const headers = new Headers({
        Accept: options.responseType === 'blob' ? 'image/*' : 'application/json',
      });
      if (options.body !== undefined) headers.set('Content-Type', 'application/json');
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
      const response = await this.fetcher(options.bridge ? path : `${this.baseUrl}/v1${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        let body: Record<string, unknown> = {};
        try {
          body = (await response.json()) as Record<string, unknown>;
        } catch {
          /* A gateway may not return JSON. */
        }
        const code =
          typeof body.code === 'string'
            ? body.code
            : response.status === 401
              ? 'unauthenticated'
              : 'request_failed';
        const retry = response.headers.get('Retry-After');
        const seconds = retry
          ? /^\d+$/.test(retry)
            ? Number(retry)
            : Math.ceil((Date.parse(retry) - Date.now()) / 1000)
          : null;
        throw new ApiError(
          code,
          problemMessages[code] ??
            t(
              'Бүртгэлийн үйлчилгээ энэ хүсэлтийг гүйцэтгэж чадсангүй.',
              'The account service couldn’t complete this request.',
            ),
          response.status,
          seconds !== null && Number.isFinite(seconds) ? Math.max(0, seconds) : null,
        );
      }
      if (response.status === 204) return undefined as T;
      if (options.responseType === 'blob') return (await response.blob()) as T;
      try {
        return (await response.json()) as T;
      } catch {
        throw new ApiError(
          'invalid_response',
          t(
            'Бүртгэлийн үйлчилгээнээс уншигдахгүй хариу ирлээ.',
            'The account service returned an unreadable response.',
          ),
        );
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
      throw new ApiError(
        controller.signal.aborted ? 'timeout' : 'network_error',
        problemMessages[controller.signal.aborted ? 'timeout' : 'network_error'],
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (!this.session) throw new ApiError('unauthenticated', problemMessages.unauthenticated, 401);
    const epoch = this.epoch;
    const refreshToken = this.session.refresh_token;
    const promise = (async () => {
      try {
        const next = await this.wire<SessionResponse>('/auth/refresh', {
          method: 'POST',
          body: { refresh_token: refreshToken },
        });
        if (epoch !== this.epoch)
          throw new ApiError('unauthenticated', problemMessages.unauthenticated, 401);
        this.storeSession(next);
      } catch (error) {
        // Keep the current rotating token after a network failure; retry only
        // when the user needs the API again, never on a timer.
        if (epoch === this.epoch && error instanceof ApiError && error.status === 401)
          this.clearSession();
        throw error;
      }
    })();
    this.refreshing = promise;
    try {
      await promise;
    } finally {
      if (this.refreshing === promise) this.refreshing = null;
    }
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (options.authenticated === false) return this.wire<T>(path, options);
    if (!this.session) throw new ApiError('unauthenticated', problemMessages.unauthenticated, 401);
    if (this.expiresAt <= Date.now() + 15_000) await this.refresh();
    const epoch = this.epoch;
    const token = this.session?.access_token;
    if (!token) throw new ApiError('unauthenticated', problemMessages.unauthenticated, 401);
    try {
      const result = await this.wire<T>(path, options, token);
      if (epoch !== this.epoch)
        throw new ApiError('unauthenticated', problemMessages.unauthenticated, 401);
      return result;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || epoch !== this.epoch) throw error;
      if (this.session?.access_token === token) await this.refresh();
      if (epoch !== this.epoch || !this.session)
        throw new ApiError('unauthenticated', problemMessages.unauthenticated, 401);
      try {
        const result = await this.wire<T>(path, options, this.session.access_token);
        if (epoch !== this.epoch)
          throw new ApiError('unauthenticated', problemMessages.unauthenticated, 401);
        return result;
      } catch (retried) {
        if (retried instanceof ApiError && retried.status === 401 && epoch === this.epoch)
          this.clearSession();
        throw retried;
      }
    }
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const session = await this.request<SessionResponse>('/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: email.trim(), password },
    });
    this.epoch++;
    this.storeSession(session);
    return session.user;
  }
  register(
    email: string,
    password: string,
    locale: Locale,
    displayName?: string,
  ): Promise<AuthChallenge> {
    return this.request('/auth/register', {
      method: 'POST',
      authenticated: false,
      body: {
        email: email.trim(),
        password,
        locale,
        ...(displayName?.trim() ? { display_name: displayName.trim() } : {}),
      },
    });
  }
  async verify(challengeId: string, code: string): Promise<AuthUser> {
    const session = await this.request<SessionResponse>('/auth/email/verify', {
      method: 'POST',
      authenticated: false,
      body: { challenge_id: challengeId, code },
    });
    this.epoch++;
    this.storeSession(session);
    return session.user;
  }
  resend(challengeId: string): Promise<AuthChallenge> {
    return this.request('/auth/email/resend', {
      method: 'POST',
      authenticated: false,
      body: { challenge_id: challengeId },
    });
  }
  forgotPassword(email: string, locale: Locale): Promise<AuthChallenge> {
    return this.request('/auth/password/forgot', {
      method: 'POST',
      authenticated: false,
      body: { email: email.trim(), locale },
    });
  }
  resetPassword(challengeId: string, code: string, newPassword: string): Promise<{ status: 'ok' }> {
    return this.request('/auth/password/reset', {
      method: 'POST',
      authenticated: false,
      body: { challenge_id: challengeId, code, new_password: newPassword },
    });
  }
  async logout(): Promise<void> {
    const token = this.session?.access_token;
    this.clearSession(); // Always remove local credentials, including on an offline sign-out.
    if (token) await this.wire<void>('/auth/logout', { method: 'POST' }, token);
  }

  profile(signal?: AbortSignal): Promise<ProfileResponse> {
    return this.request('/onboarding', { signal });
  }
  entitlement(signal?: AbortSignal): Promise<Entitlement> {
    return this.request('/me/entitlement', { signal });
  }
  garments(limit = 100, before?: string, signal?: AbortSignal): Promise<{ items: ApiGarment[] }> {
    return this.request(`/garments?limit=${limit}${before ? `&before=${escaped(before)}` : ''}`, {
      signal,
    });
  }
  garment(id: string, signal?: AbortSignal): Promise<ApiGarment> {
    return this.request(`/garments/${escaped(id)}`, { signal });
  }
  garmentImage(
    id: string,
    signal?: AbortSignal,
  ): Promise<{ signed_url: string; expires_at: string }> {
    return this.request(`/garments/${escaped(id)}/image`, { signal });
  }
  confirmGarment(
    id: string,
    attributes: GarmentAttributes,
    options: MutationOptions,
  ): Promise<ApiGarment> {
    return this.request(`/garments/${escaped(id)}/confirmation`, {
      ...options,
      method: 'PATCH',
      body: attributes,
    });
  }
  setGarmentAvailability(
    id: string,
    availability: 'available' | 'laundry',
    options: MutationOptions,
  ): Promise<ApiGarment> {
    return this.request(`/garments/${escaped(id)}/availability`, {
      ...options,
      method: 'PATCH',
      body: { availability },
    });
  }
  archiveGarment(id: string, options: MutationOptions): Promise<void> {
    return this.request(`/garments/${escaped(id)}`, { ...options, method: 'DELETE' });
  }
  retryGarment(id: string, options: MutationOptions): Promise<{ garment: ApiGarment; job: AiJob }> {
    return this.request(`/garments/${escaped(id)}/retry`, { ...options, method: 'POST' });
  }
  scores(limit = 30, before?: string, signal?: AbortSignal): Promise<{ items: ApiScore[] }> {
    return this.request(
      `/outfit-scores?limit=${limit}${before ? `&before=${escaped(before)}` : ''}`,
      { signal },
    );
  }
  score(id: string, signal?: AbortSignal): Promise<ApiScore> {
    return this.request(`/outfit-scores/${escaped(id)}`, { signal });
  }
  homeSummary(signal?: AbortSignal): Promise<HomeSummary> {
    return this.request('/home-summary', { signal });
  }
  wearHistory(startDate: string, endDate: string, signal?: AbortSignal): Promise<WearHistory> {
    return this.request(
      `/wear-history?start_date=${escaped(startDate)}&end_date=${escaped(endDate)}`,
      { signal },
    );
  }
  recordWear(
    wornDate: string,
    garmentIds: string[],
    options: MutationOptions,
  ): Promise<{ worn_date: string; wear_log_ids: string[]; added_count: number }> {
    return this.request('/wear-history', {
      ...options,
      method: 'POST',
      body: { worn_date: wornDate, garment_ids: garmentIds },
    });
  }
  savedLooks(
    limit = 20,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<{ items: ApiSavedLook[]; next_cursor: string | null }> {
    return this.request(
      `/saved-looks?limit=${limit}${cursor ? `&cursor=${escaped(cursor)}` : ''}`,
      { signal },
    );
  }
  saveLook(
    name: string,
    items: OutfitItemReference[],
    options: MutationOptions,
  ): Promise<ApiSavedLook> {
    return this.request('/saved-looks', { ...options, method: 'POST', body: { name, items } });
  }
  deleteLook(id: string, options: MutationOptions): Promise<void> {
    return this.request(`/saved-looks/${escaped(id)}`, { ...options, method: 'DELETE' });
  }
  liveReadiness(lookId: string, signal?: AbortSignal): Promise<LiveTryOnReadiness> {
    return this.request(`/saved-looks/${escaped(lookId)}/live-preview/readiness`, { signal });
  }
  /** Reserve only after showing the exact readiness disclosure and an explicit grant.
   * This starts a metered session; reuse the operation key only for the same intent. */
  async createLiveSession(
    lookId: string,
    consent: LiveTryOnConsent,
    options: MutationOptions,
  ): Promise<LiveTryOnSession> {
    const supported = consent.continuous
      ? ['live-try-on.fal.v2', 'live-try-on.decart.v2']
      : ['live-try-on.fal.v1', 'live-try-on.decart.v1'];
    if (
      consent.granted !== true ||
      typeof consent.continuous !== 'boolean' ||
      !supported.includes(consent.policy_version) ||
      !['en', 'mn'].includes(consent.locale)
    ) {
      throw new ApiError('live_tryon_consent_changed', problemMessages.live_tryon_consent_changed);
    }
    const result = await this.request<LiveTryOnSession>(
      `/saved-looks/${escaped(lookId)}/live-preview-sessions`,
      {
        ...options,
        method: 'POST',
        body: {
          policy_version: consent.policy_version,
          granted: true,
          locale: consent.locale,
          continuous: consent.continuous,
        },
      },
    );
    if (
      !result ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.id) ||
      result.saved_look_id !== lookId ||
      result.continuous !== consent.continuous ||
      !Number.isInteger(result.max_duration_seconds) ||
      result.max_duration_seconds < 1 ||
      result.max_duration_seconds > 30 ||
      !Number.isFinite(Date.parse(result.connect_before)) ||
      (result.lease_seconds !== null &&
        (!Number.isInteger(result.lease_seconds) ||
          result.lease_seconds < 10 ||
          result.lease_seconds > 3500))
    ) {
      throw new ApiError('live_invalid_response', problemMessages.live_invalid_response);
    }
    return result;
  }
  /** The original stop endpoint has no application idempotency requirement. */
  stopLiveSession(sessionId: string, signal?: AbortSignal): Promise<void> {
    return this.request(`/live-preview-sessions/${escaped(sessionId)}`, {
      method: 'DELETE',
      signal,
    });
  }
  fittingRoomReadiness(signal?: AbortSignal): Promise<FittingRoomReadiness> {
    return this.request('/fitting-room/readiness', { signal });
  }
  /** Ranked read expressed as POST. The backend does not require an operation key. */
  fittingRoomCandidates(
    request: FittingRoomCandidatesRequest,
    signal?: AbortSignal,
  ): Promise<FittingRoomCandidatesResponse> {
    return this.request('/fitting-room/candidates', {
      method: 'POST',
      signal,
      body: {
        slot: request.slot,
        selection: fittingSelection(request.selection),
        ...(request.cursor != null ? { cursor: request.cursor } : {}),
        limit: request.limit ?? 20,
      },
    });
  }
  async fittingRoomItemImage(
    source: 'wardrobe' | 'catalog',
    id: string,
    signal?: AbortSignal,
  ): Promise<Blob> {
    const blob = await this.request<Blob>(`/outfit-items/${escaped(source)}/${escaped(id)}/image`, {
      signal,
      responseType: 'blob',
    });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) {
      throw new ApiError(
        'invalid_response',
        t('Хувцасны зургийг ачаалж чадсангүй.', 'The piece’s image couldn’t be loaded.'),
      );
    }
    return blob;
  }
  /** One explicit camera grant reserves one metered visit; swaps use socket select. */
  async createFittingRoomSession(
    selection: FittingRoomSelection,
    consent: FittingRoomConsent,
    options: MutationOptions,
  ): Promise<FittingRoomSession> {
    if (
      consent.policy_version !== 'live-try-on.decart.v3' ||
      consent.granted !== true ||
      (consent.locale != null && !['en', 'mn'].includes(consent.locale))
    ) {
      throw new ApiError('live_tryon_consent_changed', problemMessages.live_tryon_consent_changed);
    }
    if (!isValidFittingRoomSelection(selection)) {
      throw new ApiError('selection_invalid', problemMessages.selection_invalid, 409);
    }
    const selected = fittingSelection(selection);
    const result = await this.request<FittingRoomSession>('/fitting-room/sessions', {
      ...options,
      method: 'POST',
      body: {
        selection: selected,
        consent: {
          policy_version: consent.policy_version,
          granted: true,
          ...(consent.locale != null ? { locale: consent.locale } : {}),
        },
      },
    });
    if (
      !result ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.id) ||
      result.saved_look_id !== null ||
      result.continuous !== true ||
      !Number.isInteger(result.max_duration_seconds) ||
      result.max_duration_seconds < 1 ||
      !Number.isInteger(result.lease_seconds) ||
      result.lease_seconds < 10 ||
      result.lease_seconds > 3500 ||
      !Number.isFinite(Date.parse(result.connect_before)) ||
      !isValidFittingRoomSelection(result.selection)
    ) {
      throw new ApiError('live_invalid_response', problemMessages.live_invalid_response);
    }
    const bound = fittingSelection(result.selection);
    if (
      fittingLanes.some(
        (lane) => JSON.stringify(bound[lane] ?? null) !== JSON.stringify(selected[lane] ?? null),
      )
    ) {
      throw new ApiError('live_invalid_response', problemMessages.live_invalid_response);
    }
    return result;
  }
  /** Exchanges the private bearer for a 15-second one-use, same-origin socket
   * ticket. The controller must attach listeners immediately after this resolves.
   * Account credentials never enter the URL, component props, or a socket message. */
  async createLiveSocket(sessionId: string, signal?: AbortSignal): Promise<WebSocket> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      throw new ApiError('live_invalid_response', problemMessages.live_invalid_response);
    }
    if (
      typeof window === 'undefined' ||
      typeof WebSocket === 'undefined' ||
      (window.location.protocol !== 'https:' &&
        !(window.location.protocol === 'http:' && isLoopback(window.location.hostname)))
    ) {
      throw new ApiError('live_bridge_unavailable', problemMessages.live_bridge_unavailable);
    }
    const epoch = this.epoch;
    // A long visit should start with a fresh access-token lifetime. Rotation is
    // serialized with other API requests and cannot restore a signed-out account.
    await this.refresh();
    const ticket = await this.request<LiveStreamTicket>('/__lookluxe/live-ticket', {
      method: 'POST',
      body: { session_id: sessionId },
      bridge: true,
      signal,
    });
    if (epoch !== this.epoch || !this.session)
      throw new ApiError('unauthenticated', problemMessages.unauthenticated, 401);
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    if (
      !ticket ||
      typeof ticket.ticket !== 'string' ||
      !/^[A-Za-z0-9_-]{16,256}$/.test(ticket.ticket) ||
      !Number.isInteger(ticket.expires_in) ||
      ticket.expires_in <= 0 ||
      ticket.expires_in > 15
    ) {
      throw new ApiError('live_invalid_response', problemMessages.live_invalid_response);
    }
    const url = new URL('/__lookluxe/live-stream', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', ticket.ticket);
    let socket: WebSocket;
    try {
      socket = new WebSocket(url.href);
    } catch {
      throw new ApiError('live_bridge_unavailable', problemMessages.live_bridge_unavailable);
    }
    const close = () => {
      try {
        socket.close(1000, 'Live session ended');
      } catch {
        /* Already closed. */
      }
    };
    const unsubscribe = this.subscribe(() => {
      if (epoch !== this.epoch) close();
    });
    signal?.addEventListener('abort', close, { once: true });
    socket.addEventListener(
      'close',
      () => {
        unsubscribe();
        signal?.removeEventListener('abort', close);
      },
      { once: true },
    );
    return socket;
  }
  consent(signal?: AbortSignal): Promise<AiConsent> {
    return this.request('/consents/ai-processing', { signal });
  }
  /** Call only after showing the disclosure and receiving the user's explicit decision. */
  setConsent(granted: boolean, locale: Locale, options: MutationOptions): Promise<AiConsent> {
    return this.request('/consents/ai-processing', {
      ...options,
      method: 'PUT',
      body: { granted, locale },
    });
  }
  job(id: string, signal?: AbortSignal): Promise<AiJob> {
    return this.request(`/ai-jobs/${escaped(id)}`, { signal });
  }

  createImageOperation(
    file: Blob,
    kind: 'garment' | 'score',
    locale: Locale = lang(),
  ): ImageOperation {
    if (!this.currentUser)
      throw new ApiError('unauthenticated', problemMessages.unauthenticated, 401);
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size <= 0 ||
      file.size > 15 * 1024 * 1024
    ) {
      throw new ApiError(
        'invalid_image',
        t(
          'JPEG, PNG эсвэл WebP зураг сонгоно уу (15 MB хүртэл).',
          'Choose a JPEG, PNG, or WebP image up to 15 MB.',
        ),
      );
    }
    return {
      ownerId: this.currentUser.id,
      file,
      kind,
      locale,
      uploadKey: newOperationKey(),
      createKey: newOperationKey(),
    };
  }

  /** Reuse the same operation to retry unchanged content; keys and stages survive
   * a lost API response for this tab session. Consent is read from the server. */
  async submitImage(
    operation: ImageOperation,
    options: { signal?: AbortSignal; onProgress?: (stage: string) => void } = {},
  ): Promise<ImageOperation['created']> {
    const { signal, onProgress } = options;
    const checkOwner = () => {
      if (operation.ownerId !== this.currentUser?.id)
        throw new ApiError('unauthenticated', problemMessages.unauthenticated, 401);
      if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    };
    checkOwner();
    const consent = await this.consent(signal);
    if (
      !consent.granted ||
      consent.status !== 'granted' ||
      consent.policy_version !== 'ai-processing.v1'
    ) {
      throw new ApiError(
        'ai_processing_consent_missing',
        problemMessages.ai_processing_consent_missing,
        403,
      );
    }
    checkOwner();
    if (!operation.ticket) {
      onProgress?.(t('Хувийн байршуулалт бэлтгэж байна', 'Reserving private upload'));
      operation.ticket = await this.request<UploadTicket>('/garment-uploads', {
        method: 'POST',
        signal,
        idempotencyKey: operation.uploadKey,
        body: { mime_type: operation.file.type, byte_size: operation.file.size },
      });
    }
    checkOwner();
    const ticket = operation.ticket;
    if (!operation.uploaded && !operation.created) {
      onProgress?.(t('Зураг байршуулж байна', 'Uploading photo'));
      const url = new URL(ticket.signed_upload_url);
      if (
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) ||
        url.username ||
        url.password
      ) {
        throw new ApiError(
          'invalid_upload_url',
          t(
            'Бүртгэлийн үйлчилгээнээс буруу байршуулах хаяг ирлээ.',
            'The account service returned an invalid upload destination.',
          ),
        );
      }
      let response: Response;
      try {
        response = await this.fetcher(url.href, {
          method: 'PUT',
          body: operation.file,
          signal,
          credentials: 'omit',
          redirect: 'error',
          cache: 'no-store',
          headers: {
            'Content-Type': ticket.mime_type,
            'x-upsert': 'false',
            'cache-control': 'max-age=3600',
          },
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new ApiError('network_error', problemMessages.network_error);
      }
      if (!response.ok)
        throw new ApiError(
          'upload_failed',
          t(
            'Зургийг хувийн санд байршуулж чадсангүй. Дахин оролдоно уу.',
            'The private photo upload failed. Please try again.',
          ),
          response.status,
        );
      operation.uploaded = true;
    }
    checkOwner();
    if (!operation.created) {
      onProgress?.(t('Боловсруулалтад илгээж байна', 'Submitting for processing'));
      operation.created = await this.request(
        operation.kind === 'garment' ? '/garments' : '/outfit-scores',
        {
          method: 'POST',
          signal,
          idempotencyKey: operation.createKey,
          body: {
            media_id: ticket.media_id,
            ...(operation.kind === 'score' ? { locale: operation.locale } : {}),
          },
        },
      );
    }
    return operation.created;
  }

  /** Bounded polling. A queued/running result means it is still processing. */
  async pollJob(
    id: string,
    options: { signal?: AbortSignal; attempts?: number; intervalMs?: number } = {},
  ): Promise<AiJob> {
    const attempts = Math.max(1, Math.min(options.attempts ?? 30, 120));
    let last!: AiJob;
    for (let attempt = 0; attempt < attempts; attempt++) {
      last = await this.job(id, options.signal);
      if (['succeeded', 'failed', 'dead'].includes(last.status)) return last;
      if (attempt + 1 < attempts)
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(new DOMException('Request cancelled', 'AbortError'));
          };
          const timer = setTimeout(() => {
            options.signal?.removeEventListener('abort', abort);
            resolve();
          }, options.intervalMs ?? 1000);
          if (options.signal?.aborted) abort();
          else options.signal?.addEventListener('abort', abort, { once: true });
        });
    }
    return last;
  }
}

// VITE_ values are public build configuration. This value must never contain a secret.
export const accountApi = new LookLuxeApi(import.meta.env.VITE_API_BASE_URL ?? '/__lookluxe/api');
