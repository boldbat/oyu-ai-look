# Oyu AI — Your Wardrobe, Reimagined

Oyu AI is a personal styling web app that helps people organize the clothes they own, discover outfit combinations, keep a wear journal, and preview garments in a live AI fitting room. It brings wardrobe management, outfit planning, and real-time visual experimentation into one responsive workspace.

Built with **React, TypeScript, Vite, Node.js, Firebase Authentication, Cloud Firestore, WebRTC, and Decart Lucy VTON**, this repository is the web MVP for the existing Oyu AI Flutter/FastAPI product. Cloud Run is the proposed Node.js deployment target; Gemini styling assistance remains future work.

**Current status:** Google sign-in and Firestore-backed preference saving are implemented and connected to Firebase project **`oyu-i-look`**. Users explicitly save, preview/apply, or remove their cloud preferences in Settings. The Vercel live API also verifies Firebase Google identity and an authorized-email list before starting a paid Decart session. The local wardrobe and existing account adapter remain independent. Cloud Run deployment has not been verified, and Gemini is not integrated.

## Brief description for the submission

We built Oyu AI, a personal styling and virtual wardrobe app that helps users organize clothes, create saved outfits, track what they wear, and explore a live AI fitting room. We use **Firebase Authentication** for Google sign-in and **Cloud Firestore** to persist each signed-in user's display name, preferred styles, appearance, and locale. Users choose when to save or apply those preferences, and Firestore Security Rules restrict each record to its owner. This cloud feature is separate from the browser-local wardrobe and existing account backend, preserving the original workflows. Live garment transformation uses **Decart Lucy VTON and WebRTC**, with explicit start, garment switching, and stop controls. The included Node.js server is prepared for deployment to **Cloud Run**, although that deployment has not been verified. **Gemini** is planned for future garment understanding and styling explanations; it is not used by this build.

The Firebase integration stores preferences only. It does not claim cloud wardrobe storage, Gemini-generated analyses, or a completed Cloud Run deployment.

## Why we built Oyu AI

People can own plenty of clothes and still struggle to decide what to wear. Wardrobe photos, saved inspiration, and outfit decisions often live in separate places. Useful pieces get forgotten, the same combinations get repeated, and new purchases can be difficult to imagine alongside existing clothes.

Oyu AI starts with the user's own wardrobe. It makes clothes easier to find, turns individual pieces into reusable outfits, and provides a visual way to explore a garment. Helping people rediscover existing clothes is a product goal; reduced spending or environmental impact has not been measured.

## What users can do today

| Area              | Implemented experience                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview          | See the four-step "How Oyu AI works" guide, a daily outfit idea with plain-language reasons and optional layer/accessory, wardrobe counts by type, and pieces not worn in 30 days. |
| My wardrobe       | Add images with a category, garment type and color; search and sort; filter by type, availability, favorites or "not worn in 30 days"; manage laundry; send a piece to try-on.     |
| Archive           | Archive and restore garments while preserving references in historical wear records.                                                                                               |
| Look Studio       | Compose outfits from available pieces, get a color-harmony suggestion, save, edit and remove looks, and send a look's main piece to the live fitting room.                         |
| Wear journal      | Record clothes actually worn on a selected date and browse the resulting history.                                                                                                  |
| Style history     | Explore illustrative sample scores and notes, with missing dimensions represented separately from zero scores.                                                                     |
| Live fitting room | Filter garments by type, enable a local camera preview, explicitly start AI try-on, change the garment during a session, switch supported cameras, and stop.                       |
| Preferences       | Set a display name and style preferences, choose light/dark/system appearance, export sample data as JSON, or confirm a sample reset.                                              |
| Cloud preferences | Sign in with Google and explicitly save, load/apply, or remove your owner-only Firestore preferences.                                                                              |
| Connected account | Use the original API for authentication, entitlement, private wardrobe workflows, saved outfits, wear logging, and consented outfit-photo analysis. Requires a configured backend. |

The sample workspace contains 51 pieces across six categories (tops, bottoms, dresses, outerwear, shoes and accessories): everyday essentials plus an Old Money edit, evening wear, womenswear and menswear, with saved looks and a few weeks of wear history. Pieces are tagged Women, Men or Unisex and by style, and the Overview, Wardrobe, Look Studio and live fitting room can filter by them. Browsers that saved an earlier sample receive the current pieces automatically; their own pieces, looks and records are kept. Outfit ideas are deterministic color-harmony and style rules that never mix womenswear and menswear, not Gemini output.

The interface supports desktop and mobile layouts, keyboard navigation, and dialog focus management. The current web interface is English; a complete Mongolian translation remains future work.

### Independent data experiences

**Sample workspace:** Clothing, uploaded images, saved outfits, wear records, and preferences persist in this browser's local storage. Initial assets and analysis scores are presentation fixtures. Local clothing intake uses manual confirmation, and local outfit combinations use deterministic application logic. Neither flow currently calls Gemini.

**Connected account:** The account panel uses the original Oyu AI `/v1` backend through the included same-origin proxy. Account tokens stay in memory, so refreshing the page signs out of the connected view. Real records remain separate from sample data; signing in does not import the sample wardrobe.

**Google cloud preferences:** Settings offers a separate Google sign-in, backed by Firebase Authentication. A user can save their name, styles, theme, and locale to Firestore, load a preview, and explicitly apply it. Photos, garments, outfits, wear logs, and account tokens are never included in this cloud document. Google sign-in does not sign in to or replace the original account backend.

The local live fitting room works without an Oyu AI account or subscription entitlement when the server has a valid Decart configuration. The hosted Vercel demo requires an authorized Google account; this uses the same Firebase sign-in as cloud preferences.

## Architecture

### Current implementation

```text
Browser: React + TypeScript
  |-- Local storage: sample wardrobe, outfits, preferences, wear journal
  |-- Firebase Authentication: optional Google sign-in in Settings
  |-- Cloud Firestore: owned preference document, saved/applied explicitly
  |-- Same-origin HTTP requests and WebSocket signaling
  |     |
  |     Node.js server / Vite development middleware
  |       |-- Serves the production web build (Node.js server)
  |       |-- Proxies optional account requests to Oyu AI FastAPI
  |       `-- Holds Decart credentials and relays try-on signaling
  |
  `-- WebRTC video exchange with Decart
```

Vite runs the development frontend and gateway middleware. The standalone production server, `server/index.mjs`, serves `dist/` and handles HTTP and WebSocket routes. On Vercel, static assets and the `api/live.mjs` Node function provide the frontend and live signaling. The gateway carries session setup, signaling, and garment references. Camera and generated video travel over WebRTC between the browser and the provider.

### Google services and providers

| Service                        | Responsibility                                                  | Current status                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Firebase Authentication**    | Google identity for cloud preferences and the hosted live demo. | Implemented in `oyu-i-look`; hosted live sessions also require an authorized email. Original account authentication is separate. |
| **Cloud Firestore**            | One owner-only preference document per Firebase user.           | Implemented; schema validation and ownership rules are deployed. Wardrobe cloud storage is future work.                          |
| **Cloud Run**                  | Host the frontend and Node.js server, including live signaling. | Server supports configurable host/port; deployment remains unverified.                                                           |
| **Gemini**                     | Future image understanding and styling explanations.            | Planned; no Gemini client or endpoint is implemented.                                                                            |
| **Cloud Storage for Firebase** | Future private clothing and analysis images.                    | Not used by cloud preferences. Existing account uploads use the original backend.                                                |
| **Secret Manager**             | Future server-side cloud provider credentials.                  | Planned deployment configuration; development reads `.env.local`.                                                                |
| **Decart Lucy VTON**           | Live garment transformation from camera video and a reference.  | Implemented through the existing gateway and camera controller.                                                                  |

The first cloud deployment can serve the entire app from a Cloud Run HTTPS URL. Firebase Authentication and Firestore do not require Firebase Hosting. Firebase Hosting is an optional later choice for static assets and ordinary HTTP rewrites; adopting it requires separately validating the live connection routing. See [Firebase's Cloud Run integration guide](https://firebase.google.com/docs/hosting/cloud-run).

### Firebase: Google sign-in

`src/lib/firebase-preferences.ts` uses the Firebase JavaScript SDK and Google's popup sign-in provider. Firebase loads when Settings or the hosted Live screen needs identity. The SDK supplies the signed-in identity to Firestore; Security Rules authorize each request against that user's UID. The Vercel live function separately verifies the signed ID token and email allowlist. Google sign-out disconnects this shared Firebase identity. See [Firebase Google sign-in documentation](https://firebase.google.com/docs/auth/web/google-signin).

The original account API retains its separate identity system. Local live sessions retain the loopback-only ticket gateway. Hosted live authorization does not create a subscription or migrate an original account.

### Firestore: saved preferences

The implemented document path is:

```text
users/{firebaseUid}/settings/preferences
```

Each document contains a schema version, a preferences map (`name`, `styles`, `theme`, `language`), and a server-generated `updatedAt` timestamp. Saving is explicit. Loading shows a preview before changing local settings. Removing the cloud copy requires confirmation and leaves local preferences intact.

The deployed `firestore.rules` permit only the owner's document get/create/update/delete operations, validate fields and allowed values, and reject collection enumeration and all unrelated paths. The app uses [Firestore Lite](https://firebase.google.com/docs/firestore/solutions/firestore-lite) for explicit online operations, without an offline write queue or automatic wardrobe synchronization.

The default Firestore database is in **`asia-northeast1` (Tokyo)**, Standard edition, Native mode. Only a small preference document is stored; no images or live media are sent to Firebase. The checked-in web configuration contains public client identifiers, not an administrative credential. Access is enforced by Authentication and Security Rules. See [Firebase setup and verification](docs/firebase.md) for configuration, domain setup, and tests.

### Cloud Run: application runtime

Cloud Run is a proposed runtime for the standalone Node.js server. A source build compiles the React app, and the service serves its assets alongside the API proxy and live gateway. The server already reads `PORT` and supports `HOST=0.0.0.0`. Future Gemini calls should run behind authenticated backend routes. The current hosted live implementation uses Vercel instead.

Cloud Run supports WebSockets, but connections remain subject to request timeouts and session affinity is best effort. This gateway keeps tickets and the one-session gate in process memory, so scaling requires shared session coordination. The browser currently requires an explicit new Start after a connection ends. See [Cloud Run WebSocket guidance](https://docs.cloud.google.com/run/docs/triggering/websockets).

### Gemini: garment understanding and styling explanations

Gemini's intended role is to turn consented images and wardrobe context into reviewable styling assistance: visible garment attributes, observations about color and pattern combinations, and explanations for outfit choices. Gemini supports image inputs, as described in its [image understanding documentation](https://ai.google.dev/gemini-api/docs/image-understanding).

The proposed flow is:

1. The user signs in and explicitly agrees to the relevant image processing.
2. The backend verifies identity, ownership, consent, file constraints, and usage allowance.
3. It sends the selected image and necessary wardrobe context to a configured Gemini model.
4. The model returns a constrained result: proposed attributes, observations, suggested garment IDs, and an explanation.
5. The backend validates the result against the schema and the user's owned, available garments before storing or displaying it.
6. The user reviews extracted attributes before a garment becomes confirmed.

Use [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) where the chosen model supports them, then apply application validation. Preserve missing evidence as unknown, record model/prompt versions, reject invented wardrobe references, and report failures without manufacturing analyses.

The current live video transformation is provided by Decart. Gemini would provide image understanding and styling explanations; it does not currently power this fitting room.

## Live fitting room

1. Open **Live fitting room**, or visit `http://127.0.0.1:5174/#live`.
2. Choose a local wardrobe reference or upload a PNG, JPEG, or WebP image up to **4 MB**.
   On the hosted demo, sign in with an authorized Google account before starting AI processing.
3. Select **Enable camera** for a local preview, without starting a provider session.
4. Select **Start live try-on** to send the reference and camera video to Decart.
5. Wait for a returned video frame to decode before the AI view becomes available.
6. Choose another reference and select **Apply selected garment** to update the session.
7. Select **Stop** to end capture, the peer connection, and signaling.

Sessions have **no time limit** by default: they run until **Stop**, and Decart bills per second while one runs ($0.02/s standard, $0.04/s with `DECART_SPEED=fast`). Set `DECART_MAX_SESSION_SECONDS` to cap every session. The screen requests no microphone and does not record video. Navigation, a hidden tab, a covering app panel or connection failure also stops capture. There is no pointer/keyboard inactivity cutoff and no automatic reconnection.

While live, tapping any garment (in the panel or the strip on the video) switches it immediately; the latest tap wins. Each garment is sent with a region-specific prompt such as “Substitute the upper body garment with a navy knit sweater”, following Decart’s VTON prompting guide. The front camera is mirrored before it is sent, so the view behaves like a mirror. **AI try-on**, **Original** and **Side by side** views and full screen are available.

| Gateway route                           | Purpose                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `GET /__lookluxe/decart/status`         | Report server configuration and supported duration.                  |
| `POST /__lookluxe/decart/sessions`      | Validate the reference and issue a short-lived, single-use ticket.   |
| `WS /__lookluxe/decart/stream?ticket=…` | Consume the ticket and relay provider signaling and garment changes. |

**Oyu**, the companion stylist, hosts the stage: she guides framing, reacts to every piece with a score, rates on request, suggests the next piece and sums up the session. With awareness on she also sees the user through an on-device pose model (frames never leave the browser). See [Oyu, the companion stylist](docs/oyu.md); run `npm run rehearse` for a free end-to-end check before a demo.

The gateway keeps provider credentials out of the browser, validates payloads and origins, and permits one active provider session per process. Selecting a reference or issuing a ticket alone does not start provider processing. See [live implementation and verification](docs/live-try-on.md).

On Vercel, `GET /api/live` supplies status and `WS /api/live` receives the reference, duration, and Firebase ID token in the first encrypted message. Authorization and session creation happen on that same connection; they do not depend on an HTTP ticket reaching the same function instance. The discovery route above rewrites to this function. The function rejects unauthorized users before obtaining a Decart token.

## Languages

The interface speaks **Mongolian** (default) and **English**. Switch with the **MN / EN** button in the top bar or under **Settings → Харагдах байдал / Appearance**; the choice is saved with the workspace (and with cloud preferences when signed in). Oyu speaks the chosen language too, and the bundled sample wardrobe, looks and analyses appear in English in English mode without changing what is stored. Style names (Old money, Minimal…) stay English in both, and the try-on prompts sent to Decart are always English.

Every interface string sits in the code as a pair, `t('Монгол', 'English')` from `src/lib/lang.ts`; label tables use `localized({ key: ['Монгол', 'English'] })`. Call `t` while rendering, never at module level. `tests/i18n-guard.test.ts` fails if any Mongolian text is missing its English pair or if `t` runs when a module loads.

## Run locally

Use **Node.js 22.12 or later**, npm, and a camera-capable browser for live try-on. A Decart key is required only for provider-backed sessions; the sample wardrobe works without it. The connected account requires a separately running original backend.

```sh
npm ci
```

For a fresh checkout, create the ignored local configuration. Preserve an existing `.env.local` if already configured:

```sh
cp -n .env.example .env.local
```

Edit `.env.local`:

```dotenv
DECART_API_KEY=your_server_side_decart_key
DECART_MODEL=lucy-vton-3.6

# Optional: Oyu's human voice (ElevenLabs). Without it she uses the browser's voice.
ELEVENLABS_API_KEY=your_server_side_elevenlabs_key

# Optional original API root, without /v1; leave empty if unavailable.
LOOKLUXE_API_ORIGIN=http://127.0.0.1:8000
```

An existing development workspace may already have a configured ignored file. Credentials are not distributed with a fresh checkout. Never put provider secrets into `VITE_` variables.

```sh
npm run dev
```

Open **http://127.0.0.1:5174/**. Port 5174 allows this project to run beside another Oyu AI app on port 5173. Restart the development server after changing environment values.

### Production build on your computer

```sh
npm run typecheck
npm test
npm run build
npm start
```

The production server also defaults to port 5174. Stop the development server first, or run `PORT=5176 npm start`. `npm run preview` invokes this same Node.js server. Serving only `dist/` cannot provide the account proxy or live gateway.

### Environment reference

| Variable                   | Purpose                                                                              | Read when                                                    |
| -------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `DECART_API_KEY`           | Server-only provider credential; empty disables provider session creation.           | Development startup / production runtime.                    |
| `DECART_MODEL`             | Defaults to `lucy-vton-3.6`.                                                         | Development startup / production runtime.                    |
| `ELEVENLABS_API_KEY`       | Server-only key for Oyu's human voice; empty keeps the browser's own voice.          | Development startup / production runtime.                    |
| `ELEVENLABS_VOICE_ID`      | Optional default voice; otherwise a warm female voice from the account.              | Development startup / production runtime.                    |
| `ELEVENLABS_MODEL`         | Optional; by default the newest of `eleven_v4_turbo`, `eleven_v4`, `eleven_v3`.      | Development startup / production runtime.                    |
| `ELEVENLABS_ALLOW_REMOTE`  | Permits remote voice requests when `true`; loopback only by default.                 | Development startup / production runtime.                    |
| `LOOKLUXE_API_ORIGIN`      | Optional original backend root, without `/v1`.                                       | Development startup, frontend build, and production runtime. |
| `VITE_API_BASE_URL`        | Legacy fallback for the original backend origin. Prefer `LOOKLUXE_API_ORIGIN`.       | Development startup, frontend build, and production runtime. |
| `HOST`                     | Production listener; defaults to `127.0.0.1`. Use `0.0.0.0` on Cloud Run.            | Production runtime.                                          |
| `PORT`                     | Production port; defaults to 5174. Cloud Run supplies its configured container port. | Production runtime.                                          |
| `PUBLIC_WEB_ORIGIN`        | Exact remote browser origin, including HTTPS scheme and no path.                     | Development startup / production runtime.                    |
| `DECART_DEMO_ALLOW_REMOTE` | Permits remote direct-gateway requests when `true`; disabled by default.             | Development startup / production runtime.                    |

The account UI's enabled state is compiled into the frontend. When changing its backend configuration in production, rebuild with the intended origin **and** set the matching runtime origin. A runtime update does not rebuild the browser bundle.

Firebase uses the public web configuration in `src/lib/firebase-web-config.json`; it is included in the frontend build and needs no secret environment variable. To use a different project, replace that configuration, enable Google sign-in, authorize the website domain, and deploy the rules. Gemini is not configured or called.

## Deploy live try-on on Vercel

The repository includes `vercel.json` and the Node HTTP/WebSocket function `api/live.mjs`. Vercel must deploy this function as well as the Vite frontend. A deployment of `dist/` alone cannot run live try-on. Enable Fluid compute; Vercel WebSockets require it. See [Vercel's WebSocket documentation](https://vercel.com/docs/functions/websockets).

Set these **server-side** environment variables for the intended deployment environment, then redeploy:

| Variable               | Value                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DECART_API_KEY`       | Your private Decart provider key.                                                                                     |
| `DECART_MODEL`         | `lucy-vton-3.6`                                                                                                       |
| `FIREBASE_PROJECT_ID`  | `oyu-i-look`                                                                                                          |
| `LIVE_ALLOWED_EMAILS`  | Comma-separated verified Google email addresses authorized to use the demo. An empty list disables provider sessions. |
| `LIVE_ALLOWED_ORIGINS` | Exact HTTPS frontend origin, e.g. `https://oyu-ai-look.vercel.app`. Comma-separated if more than one.                 |

Add the frontend hostname to Firebase Authentication's authorized domains and enable Google sign-in. The current production hostname is authorized. Each preview has a different hostname and needs its own Firebase domain authorization if signing in there. The function accepts its own deployment origin automatically.

```sh
vercel link
vercel deploy --prod
```

Check `https://your-project.vercel.app/__lookluxe/decart/status` for `configured: true`, `transport: "websocket-init"`, and `requiresSignIn: true`. Open Live fitting room, sign in, choose a reference, enable the camera, and explicitly start. Vercel ends the function at its 300-second `maxDuration` (vercel.json), so hosted sessions stop after about five minutes even though the app sets no limit; local sessions have no such ceiling. Provider credentials stay on the server; Firebase ID tokens are sent in a WebSocket message rather than a URL.

This is an authorized private demo. The per-process active-session and request limits do not provide shared quotas across function instances. Public paid multi-user access still needs shared usage accounting and allowance enforcement. The optional original account proxy is provided by the standalone Node server and is not implemented by this Vercel live function.

## Deploy the current web shell to Cloud Run

This recipe publishes the browser-local workspace and its optional Firebase cloud-preferences feature, while leaving remote paid try-on disabled. It uses the already configured Firebase project; it does not migrate wardrobe data or add Gemini. Cloud Run deployment remains unverified.

### 1. Select the project

Install the Google Cloud CLI, sign in, and select a project with billing enabled. Replace `your-project-id`. Deployer and build identities need the permissions in the [Cloud Run source deployment prerequisites](https://docs.cloud.google.com/run/docs/quickstarts/build-and-deploy/deploy-nodejs-service).

```sh
gcloud auth login

export OYU_GCP_PROJECT="your-project-id"
export OYU_GCP_REGION="us-central1"

gcloud config set project "$OYU_GCP_PROJECT"

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

### 2. Exclude local credentials

Create `.gcloudignore` in the repository root with these contents, or merge these exclusions into an existing file:

```gitignore
.gcloudignore
.git/
node_modules/
dist/
.env
.env.*
!.env.example
*.tsbuildinfo
.DS_Store
```

Review the upload inventory before deploying:

```sh
gcloud meta list-files-for-upload
```

The inventory must exclude `.env.local`, other credential files, and local dependencies. `.env.example` contains placeholders and can be included.

### 3. Build and deploy

Run from the repository root. The buildpack uses the existing `build` and `start` scripts. The build settings select Node.js 24 and the frontend build with its required build dependencies. See [Google's Node.js buildpack documentation](https://docs.cloud.google.com/docs/buildpacks/nodejs).

```sh
gcloud run deploy oyu-ai-web \
  --source . \
  --region "$OYU_GCP_REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --set-build-env-vars 'GOOGLE_NODEJS_VERSION=24.x.x,GOOGLE_NODE_RUN_SCRIPTS=build' \
  --set-env-vars 'HOST=0.0.0.0,DECART_DEMO_ALLOW_REMOTE=false' \
  --timeout 300 \
  --max-instances 1
```

This makes the sample web app publicly reachable. No Decart credential is supplied, and remote live requests remain disabled. The instance limit constrains initial scaling; it does not create shared state or guarantee that instances never overlap during lifecycle changes. See the [Cloud Run deployment reference](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy).

If reusing a service, review its retained secrets, access controls, and environment settings before applying this sample-only configuration.

### 4. Configure the origin and verify

```sh
export OYU_CLOUD_RUN_URL="$(gcloud run services describe oyu-ai-web \
  --region "$OYU_GCP_REGION" \
  --format='value(status.url)')"

gcloud run services update oyu-ai-web \
  --region "$OYU_GCP_REGION" \
  --update-env-vars "PUBLIC_WEB_ORIGIN=$OYU_CLOUD_RUN_URL"

curl --fail --head "$OYU_CLOUD_RUN_URL"
```

Open the returned HTTPS URL. Check the overview, wardrobe, saved looks, history, preferences, and refresh behavior. Sample edits still live in each browser; hosting does not synchronize them across devices. Live provider processing should remain unavailable with this configuration.

### Remote live try-on

Before enabling the current direct gateway remotely, provide private browser access in front of the demo or implement verified per-user authorization and usage controls. Its origin checks do not authenticate visitors.

Then supply the Decart credential through Secret Manager, grant the runtime service identity access, set `DECART_DEMO_ALLOW_REMOTE=true`, and set the exact `PUBLIC_WEB_ORIGIN`. Keep HTTP and WebSocket connections on a tested route and validate session termination on the deployed service. See [Cloud Run secrets configuration](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

Multiple instances require coordinated tickets, atomic ticket consumption, and shared session limits. Session affinity and a single-instance setting do not replace those controls. See the [live deployment boundaries](docs/live-try-on.md).

## Google integration acceptance and remaining work

| Area                     | Verified or remaining work                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebase Authentication  | Real Google browser sign-in verified in `oyu-i-look`; development and the current Vercel production domain are authorized.                                  |
| Firestore                | Preference schema and ownership tests pass; rules deployed; browser preference saving verified against the real database.                                   |
| Original features        | All original tests pass; wardrobe persistence and original account API behavior are preserved. The live gateway also supports authenticated Vercel sockets. |
| Private images           | Firebase image storage is not implemented. Preferences contain no photos.                                                                                   |
| Gemini                   | Future server-side integration with explicit consent, validated outputs, and failure handling.                                                              |
| Cloud Run                | Deployment recipe provided; a cloud deployment and live connection check remain necessary.                                                                  |
| Paid live usage controls | Per-user authorization, allowance enforcement, and shared session state remain required before public multi-user operation.                                 |

### Firebase tests and rule deployment

The regular application suite needs no cloud credentials. The rules suite uses the isolated `demo-oyu-ai` emulator project and requires Java 21 or later:

```sh
npm test
npm run test:firebase
```

To deploy a reviewed rule change to the real project, sign in to the Firebase CLI with the project owner and run:

```sh
npx firebase login
npm run firebase:rules
```

See [Firebase setup](docs/firebase.md) for details. Keep sample fixtures visibly labeled after cloud integration.

## Verification and known limits

The current checks pass **155 application tests**, including the original wardrobe/account/camera checks, hosted transport checks, and signed Firebase token validation, plus **15 Firestore Security Rules tests** in the official emulator. Type checking and the production build pass. Real Google sign-in, a Firestore preference save, and actual Decart video through the deployed Vercel function were verified in the browser; see the [verification record](docs/verification.md).

Recorded browser checks include actual Decart video at **1280 × 720** from a synthetic canvas mannequin, an acknowledged garment change, and camera/peer/socket/video-element cleanup. No physical camera or microphone was used for those provider checks. Appearance on a real wearer, physical fit, and exact garment fidelity remain separate manual acceptance checks.

Current limits:

- Real-account sign-in and photo processing require acceptance testing against an available original backend and test account.
- Cloud persistence currently covers preferences only. Main-workspace wardrobe synchronization and Gemini processing remain future work.
- Sample uploads are limited to **2 MB** each and browser storage capacity. Export a copy from Settings for independent safekeeping.
- Live references support **4 MB**; sessions have no time limit unless `DECART_MAX_SESSION_SECONDS` is set (hosted sessions also end at the 300-second Vercel function limit).
- Account tokens are held in memory; production session persistence needs an explicit session design.
- Subscription checkout, dedicated photo try-on, body/fit setup, Store, Style Memory, and complete mobile parity are outside this MVP.
- Public multi-user live operation and Google Cloud deployment have not been verified.

### Isolated account fixture

Start the synthetic localhost-only API:

```sh
node tests/fixtures/mock-api.mjs
```

In another terminal:

```sh
VITE_API_BASE_URL=http://127.0.0.1:8789 npm run dev -- --port 5175
```

Fixture login: `fixture@lookluxe.test` / `FixturePass123!`. Email codes: `12345678`. It makes no upstream calls and resets on restart. It is a local development tool and must not be deployed.

## Project structure and commands

```text
src/
  App.tsx                  Navigation and application shell
  features/                Wardrobe, studio, history, account, live, settings
  lib/                     API clients, state, validation, camera controller
  components/              Shared interface components
server/
  index.mjs                Production server and gateway entrypoint
  decart-bridge.mjs        Direct Decart session and signaling gateway
  live-bridge.mjs          Original API proxy and legacy live bridge
  live-auth.mjs            Hosted Firebase token and email authorization
api/live.mjs               Vercel Node HTTP/WebSocket entrypoint
tests/                     Client, state, protocol, and gateway tests
  fixtures/                Synthetic API and browser verification tools
docs/                      Design, backend, transport, and verification notes
public/                    Static assets
```

| Command                  | Purpose                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`            | Start Vite with gateway middleware.                                                                                   |
| `npm run typecheck`      | Check TypeScript project types.                                                                                       |
| `npm run test:firebase`  | Run the isolated Firestore rules tests (Java 21+).                                                                    |
| `npm run firebase:rules` | Deploy reviewed rules to `oyu-i-look`.                                                                                |
| `npm test`               | Run the Vitest suite.                                                                                                 |
| `npm run rehearse`       | Free live try-on rehearsal with Oyu (app running); add `-- --lang en` for English, `-- --voice` to include her voice. |
| `npm run build`          | Type-check and build the frontend.                                                                                    |
| `npm start`              | Serve the built app and backend gateways.                                                                             |
| `npm run preview`        | Alias for the production Node.js server.                                                                              |
| `npm run format`         | Format source, tests, and documentation.                                                                              |

## Further documentation

- [Firebase configuration and verification](docs/firebase.md)
- [Design system](docs/design-system.md)
- [Source audit and feature parity boundaries](docs/source-audit.md)
- [Existing backend integration](docs/backend-integration.md)
- [Live camera implementation and verification](docs/live-try-on.md)
- [Oyu, the companion stylist](docs/oyu.md)
- [Verification record](docs/verification.md)

The original Flutter/FastAPI project is a separate application. This repository provides the web client and local gateway; it does not include that backend's database, workers, storage deployment, or production credentials.
