# Existing Oyu AI backend integration

The connected account panel reuses the FastAPI `/v1` contracts in `LookLuxe-AI/services/backend`. It does not introduce a second authentication database or billing system. The current **Live fitting room** is a separate direct Decart pitch flow that needs no account or entitlement; see [live try-on](live-try-on.md).

The public development API returned HTTP 200 from a read-only health probe. Later, the Decart key was copied securely from the original backend configuration into this workspace's ignored, server-only `.env.local` for the pitch flow. No original repository files or backend data were modified, and the key was not printed.

## Connect the existing API

1. For a fresh checkout, copy `.env.example` to `.env.local` in this web project. Preserve any existing Decart configuration.
2. Set `LOOKLUXE_API_ORIGIN` to the existing API root, for example `http://127.0.0.1:8000` for a separately configured local API. Do not append `/v1`. Use HTTPS for a remote service.
3. Restart `npm run dev`. The account button opens genuine sign-in and registration.
4. Sign in with a test account belonging to that API. The connected account panel shows its profile, entitlement, wardrobe, score summary, and recent analyses.

This value configures the included server’s fixed upstream. The legacy `VITE_API_BASE_URL` remains supported. It must not contain credentials, API
keys, storage keys, or tokens. The app has no arbitrary server-address form.
Leaving the variable unset preserves the fully local sample workspace and clearly
marks account connection as unavailable.

The original backend must already have owned auth enabled, its database migrations
applied, and transactional email configured. Registration can be disabled separately
with the backend's existing registration flag. Processing also requires private
storage, a running job worker, an AI provider, and an active server-side entitlement.
Do not start the original backend against an existing `.env` without first checking
that its database and storage are the intended environment.

## Browser deployment boundary

The original `services/backend/app/main.py` currently permits CORS origins matching
`http(s)://localhost[:port]` and `http(s)://127.0.0.1[:port]`. A deployed SaaS domain
uses the included same-origin reverse proxy at `/__lookluxe/api`. Production must run `npm start` behind HTTPS and set `PUBLIC_WEB_ORIGIN`; the server also handles WebSocket upgrades.
The API must allow `Authorization`, `Content-Type`, and `Idempotency-Key`; expose
`Retry-After` if the browser should display its precise rate-limit countdown.
Signed private storage upload URLs also need browser-accessible hosts and PUT CORS
support for `Content-Type`, `Cache-Control`, and `x-upsert`. The client uses the
returned URL without rewriting its host or attaching account credentials.

## What is connected in the UI

- Email/password sign-in, registration, eight-digit email verification, code resend,
  password recovery/reset, and sign-out.
- Private account overview from the original onboarding/profile and entitlement APIs.
- Paginated account wardrobe with private thumbnails, real garment upload,
  extraction-job polling, and a review form for pending garments. Confirming
  activates the garment in the existing account. The review edits name, category,
  primary color, warmth, and formality while retaining the extracted layer,
  subcategory, secondary colors, material, pattern, seasons, temperature range,
  occasions, style tags, brand, and description. An unrecognized category must
  be chosen explicitly; it is never silently replaced with “top.”
- Active garment availability switches between available/clean and laundry.
  Failed ingestion can be retried with consent. Archiving requires a separate
  confirmation that explains permanent deletion of the private photo and the
  possible effect on saved looks. Existing wear-history references are retained
  by the backend's soft deletion.
- Saved looks support listing, cursor pagination, complete wardrobe outfit composition, and confirmed deletion. Composition checks the source backend's slots, active confirmation, cleanliness, and availability. Existing catalog references retain their source labels.
- The connected wear journal uses the account's local date and monthly history. Recording is explicitly additive and deduplicated by the backend; it does not claim to replace or erase an existing day. Archived history remains readable. Saving a look never records wear automatically.
- AI processing consent, recorded/revoked against the account. Consent is required
  before choosing an upload. It also applies to garment photos in the mobile app.
- Real outfit-photo upload and scoring. The browser reserves a private upload,
  uploads to the returned signed capability, creates the score, polls its job, and
  displays the server's result. It never manufactures a score or fills missing
  dimensions with zero. Unreadable, failed, and still-processing results remain
  distinct. Recent server analyses are available after reopening the panel.

The main Home, Wardrobe, Studio, and History workspace remains labeled **Sample
workspace**. Its browser-local data is not merged into, copied to, or treated as the
signed-in account. Connecting an account does not upload sample photos or local
wardrobe images. The original API only permits attribute confirmation while a
garment is `pending_confirmation`; it rejects edits to an already-active garment.
Active garments therefore show details, availability controls, and archive actions
without a misleading attribute-edit form.

## Adapter surface

`src/lib/api.ts` exports the typed `LookLuxeApi`, singleton `accountApi`,
`ApiError`, `apiErrorMessage`, and `newOperationKey`.

| Capability          | Existing routes                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owned auth          | `/auth/login`, `/auth/register`, `/auth/email/verify`, `/auth/email/resend`, `/auth/password/forgot`, `/auth/password/reset`, `/auth/refresh`, `/auth/logout`                                     |
| Profile and access  | `GET /onboarding`, `GET /me/entitlement`                                                                                                                                                          |
| Garments            | `GET /garments`, `GET /garments/{id}`, `GET /garments/{id}/image`, `PATCH /garments/{id}/confirmation`, `PATCH /garments/{id}/availability`, `POST /garments/{id}/retry`, `DELETE /garments/{id}` |
| Scores              | `GET /outfit-scores`, `GET /outfit-scores/{id}`                                                                                                                                                   |
| Home summary        | `GET /home-summary`                                                                                                                                                                               |
| Wear log            | `GET /wear-history?start_date=...&end_date=...`, `POST /wear-history`                                                                                                                             |
| Saved looks         | `GET/POST /saved-looks`, `DELETE /saved-looks/{id}`                                                                                                                                               |
| AI consent          | `GET/PUT /consents/ai-processing`                                                                                                                                                                 |
| Upload and creation | `POST /garment-uploads`, signed storage `PUT`, `POST /garments` or `POST /outfit-scores`                                                                                                          |
| Job status          | `GET /ai-jobs/{id}`                                                                                                                                                                               |

All paths in the table have `/v1` prepended by the client. Saved look item references
retain their `wardrobe`/`catalog` source and the backend's `accessory1` slot. Garment
and score pagination use `before`; saved looks use `cursor`.

## Sessions, retries, and privacy

- Access and refresh tokens live only in the client instance's memory. They never
  enter localStorage, sessionStorage, URL parameters, sample data, or logs. A page
  reload requires sign-in again. Production persistent login should use an
  independently reviewed server-side session/BFF design with secure HttpOnly
  cookies; do not add token persistence to the sample workspace store.
- Requests omit cookies, disallow redirects, and use `cache: no-store`. The browser
  sends bearer credentials only to the configured API. Signed storage receives
  only its scoped upload capability. Account data is held in React memory and
  disposed when the account panel/session ends.
- Concurrent authentication failures share one refresh request. Refresh tokens
  rotate according to the original contract. Auth mutations have no application
  idempotency header and are never automatically replayed. Refresh happens on
  demand, not on a timer.
- Authenticated application mutations require a caller-owned operation key; the
  same key and body survive a single 401/refresh replay. They are not blindly
  retried after timeouts or network errors.
- `createImageOperation` fixes a file, owner, and pair of operation keys.
  `submitImage` checks server consent, reserves/uploads the file, and submits the
  job. Reusing the operation preserves successful stages and safely reuses the
  creation key if an API response is lost. `pollJob` is bounded and cancellable;
  it returns a genuine queued/running status if the wait ends before completion.
- If a storage PUT response is lost after storage accepted the file, retrying that
  non-upsert PUT can report a conflict. The UI reports failure rather than claiming
  completion. Choose the photo again to begin a new operation; backend retention
  remains responsible for abandoned reservations. Cancellation stops waiting or
  uploading, but does not cancel jobs already submitted to the server.
- Sign-out clears local credentials immediately, even if server revocation fails.
  Late refresh/read responses cannot restore a signed-out session or cross users.

The photo-consent disclosure follows the original `docs/legal/privacy.md`: private
storage, deployment-selected OpenAI or Anthropic vision processing, metadata removal
before provider processing, and no accompanying name/email/account identifier. This
client does not automatically grant consent or substitute the separate explanation
privacy preference for photo-processing consent.

## Features requiring additional backend work

The existing billing interface is a RevenueCat server webhook plus read-only
entitlement. It is not a browser subscription checkout endpoint. This build shows
real access but does not simulate a purchase. The current pitch Live screen uses the separate direct Decart gateway; the original account fitting-room adapter and bridge remain available as legacy integration code. See [live try-on](live-try-on.md).

## Verification

Run `npm run typecheck` and `npx vitest run tests/api.test.ts`.
The focused suite uses an injected fetch implementation and checks exact auth
payloads, eight-digit codes, preserved passwords, rate-limit feedback, serialized
refresh, session isolation and sign-out races, stable idempotency keys, consent
gating, upload credential isolation, and honest terminal/pending job states.
Wardrobe tests additionally cover the full private-upload/ingestion contract,
preservation of extraction metadata during review, unknown-category validation,
and exact confirmation, availability, retry, and archive mutations.
These are contract tests, not a claim of a live production integration test. Safari checks against the local fixture API additionally verified sign-in, account loading, garment confirmation, laundry/clean, failed-job retry, complete saved-look creation, and additive wear logging with deduplication. See [verification](verification.md) for the browser limitations.

The initial health probe timed out, but the later live-camera implementation received HTTP 200 from the same public development API. Real sign-in and original-backend photo-processing acceptance still require a test account. The direct Decart pitch flow requires no account and has separately returned real provider video using synthetic input; its current evidence and remaining acceptance checks are recorded in [live try-on](live-try-on.md). Automated account tests use synthetic local fixtures.
