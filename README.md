# Oyu AI — Your Wardrobe, Reimagined

Oyu AI is a personal styling web app that helps people organize the clothes they own, discover outfit combinations, keep a wear journal, and preview garments in a live AI fitting room. It brings wardrobe management, outfit planning, and real-time visual experimentation into one responsive workspace.

Built with **React, TypeScript, Vite, Node.js, WebRTC, and Decart Lucy VTON**, this repository is the web MVP for the existing Oyu AI Flutter/FastAPI product. Its proposed Google Cloud architecture brings together **Firebase Authentication, Cloud Firestore, Cloud Run, and Gemini**.

**Current status:** The browser-local wardrobe workspace, existing account API adapter, and direct Decart fitting room are implemented. Firebase Authentication, Firestore persistence, and Gemini calls are planned integrations; their SDKs and service configuration are not present in this checkout. Cloud Run deployment instructions are provided below, but a cloud deployment has not been verified. Deploying this repository alone does not implement the remaining integrations.

## Brief description for the submission

### Current build

We built Oyu AI, a personal styling and virtual wardrobe application that helps users make better use of the clothes they already own. Users can organize garments, create and save outfits, log what they wear, and explore a live AI fitting room. The responsive React interface includes a browser-local sample workspace and a separate connection to the existing Oyu AI account backend. Our live fitting room uses Decart Lucy VTON with WebRTC to transform camera video using a selected garment reference, with explicit session start, garment switching, and stop controls. We have designed the next deployment around Firebase for identity, Firestore for wardrobe and styling records, Cloud Run for the Node.js application and protected AI endpoints, and Gemini for multimodal garment understanding and personalized styling explanations. These Google service integrations remain to be implemented and verified.

### Google Cloud version — draft for after integration

The following paragraph describes the intended completed architecture in submission style. Use it as an implementation claim after the integrations and acceptance checks below are complete.

> We built Oyu AI, an AI personal stylist and virtual wardrobe that helps users discover new outfits from the clothes they already own. Users can organize their wardrobe, save looks, track what they wear, receive personalized styling guidance, and preview garments in a live fitting room. We use Firebase Authentication to manage user identity and Cloud Firestore to store each user's wardrobe metadata, saved outfits, preferences, wear history, and AI analysis results. Our Node.js application runs on Cloud Run, serving the web experience and handling authenticated requests, AI orchestration, and live try-on signaling while keeping provider credentials on the server. Gemini analyzes consented garment and outfit images, extracts structured clothing attributes, and generates styling explanations grounded in the user's available wardrobe. Decart Lucy VTON provides the real-time garment transformation over WebRTC. Together, these services connect wardrobe organization, AI styling assistance, and an interactive fitting room in one application.

## Why we built Oyu AI

People can own plenty of clothes and still struggle to decide what to wear. Wardrobe photos, saved inspiration, and outfit decisions often live in separate places. Useful pieces get forgotten, the same combinations get repeated, and new purchases can be difficult to imagine alongside existing clothes.

Oyu AI starts with the user's own wardrobe. It makes clothes easier to find, turns individual pieces into reusable outfits, and provides a visual way to explore a garment. Helping people rediscover existing clothes is a product goal; reduced spending or environmental impact has not been measured.

## What users can do today

| Area              | Implemented experience                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview          | Browse available clothing combinations, saved looks, and clearly labeled sample style summaries.                                                                                   |
| My wardrobe       | Add images, manually confirm details, search and sort pieces, filter categories and availability, mark favorites, and manage laundry status.                                       |
| Archive           | Archive and restore garments while preserving references in historical wear records.                                                                                               |
| Look Studio       | Compose outfits from available pieces, save combinations, edit looks, and remove saved looks.                                                                                      |
| Wear journal      | Record clothes actually worn on a selected date and browse the resulting history.                                                                                                  |
| Style history     | Explore illustrative sample scores and notes, with missing dimensions represented separately from zero scores.                                                                     |
| Live fitting room | Select a garment, enable a local camera preview, explicitly start AI try-on, change the garment during a session, switch supported cameras, and stop.                              |
| Preferences       | Set a display name and style preferences, choose light/dark/system appearance, export sample data as JSON, or confirm a sample reset.                                              |
| Connected account | Use the original API for authentication, entitlement, private wardrobe workflows, saved outfits, wear logging, and consented outfit-photo analysis. Requires a configured backend. |

The interface supports desktop and mobile layouts, keyboard navigation, and dialog focus management. The current web interface is English; a complete Mongolian translation remains future work.

### Two separate data experiences

**Sample workspace:** Clothing, uploaded images, saved outfits, wear records, and preferences persist in this browser's local storage. Initial assets and analysis scores are presentation fixtures. Local clothing intake uses manual confirmation, and local outfit combinations use deterministic application logic. Neither flow currently calls Gemini.

**Connected account:** The account panel uses the original Oyu AI `/v1` backend through the included same-origin proxy. Account tokens stay in memory, so refreshing the page signs out of the connected view. Real records remain separate from sample data; signing in does not import the sample wardrobe.

The direct live fitting room is a separate flow that currently works without a Oyu AI account or subscription entitlement when the server has a valid Decart configuration.

## Architecture

### Current implementation

```text
Browser: React + TypeScript
  |-- Local storage: sample wardrobe, outfits, preferences, wear journal
  |-- Same-origin HTTP requests and WebSocket signaling
  |     |
  |     Node.js server / Vite development middleware
  |       |-- Serves the production web build (Node.js server)
  |       |-- Proxies optional account requests to Oyu AI FastAPI
  |       `-- Holds Decart credentials and relays try-on signaling
  |
  `-- WebRTC video exchange with Decart
```

Vite runs the development frontend and gateway middleware. In production, `server/index.mjs` serves `dist/` and handles HTTP and WebSocket routes. The gateway carries session setup, signaling, and garment references. Camera and generated video travel over WebRTC between the browser and the provider.

### Google Cloud integration plan

| Service                        | Intended responsibility                                                                                          | Current status                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Firebase Authentication**    | Registration/sign-in, stable user IDs, and identity tokens verified by backend endpoints.                        | Planned; the existing account panel uses the original owned-auth API.                             |
| **Cloud Firestore**            | Per-user garment metadata, saved looks, wear logs, preferences, consent records, and AI results.                 | Planned; sample data currently uses local storage.                                                |
| **Cloud Run**                  | Host the production frontend and Node.js server; execute protected AI requests and handle live signaling.        | Server supports configurable host/port; cloud deployment is unverified.                           |
| **Gemini**                     | Understand consented clothing images, propose structured garment attributes, and explain outfit recommendations. | Planned; no Gemini client or endpoint is implemented here.                                        |
| **Cloud Storage for Firebase** | Store private clothing and analysis images separately from Firestore metadata.                                   | Planned for the Google architecture; existing account uploads use the original backend's storage. |
| **Secret Manager**             | Supply server-only provider credentials to Cloud Run.                                                            | Planned cloud configuration; local development reads `.env.local`.                                |
| **Decart Lucy VTON**           | Generate the live garment transformation from camera video and a selected reference.                             | Implemented through the direct gateway and camera controller.                                     |

The first cloud deployment can serve the entire app from a Cloud Run HTTPS URL. Firebase Authentication and Firestore do not require Firebase Hosting. Firebase Hosting is an optional later choice for static assets and ordinary HTTP rewrites; adopting it requires separately validating the live connection routing. See [Firebase's Cloud Run integration guide](https://firebase.google.com/docs/hosting/cloud-run).

### Firebase: user identity

In the intended integration, the browser signs in through the Firebase client SDK and sends its ID token with protected backend requests. The Node.js service verifies that token with the Firebase Admin SDK and derives ownership from the verified user ID. See [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

That identity must be connected to wardrobe access, uploads, AI analysis, and live session creation. Sign-in alone does not protect an endpoint that never verifies a token. The existing owned-auth account panel also needs an explicit migration or account-linking design; Firebase tokens cannot simply replace the original backend's tokens.

### Firestore: wardrobe and styling records

A proposed document layout follows user ownership:

```text
users/{uid}
  garments/{garmentId}
  looks/{lookId}
  wearLogs/{wearLogId}
  analyses/{analysisId}
  consents/{policyId}
```

| Record     | Example fields                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Profile    | Display name, preferred styles, theme, locale, timestamps.                                                    |
| Garment    | Name, category, color, private image object path, availability, favorite/archive state, confirmed attributes. |
| Saved look | Name, owned garment IDs, timestamps.                                                                          |
| Wear log   | Calendar date and the owned garments actually worn.                                                           |
| Analysis   | Status, source image reference, model/prompt version, observations, nullable scores, timestamp.               |
| Consent    | Policy version, granted/revoked state, processing purpose, timestamp.                                         |

This is a proposed schema. Images belong in private object storage, with references in Firestore. Client access needs ownership and field-validation rules. Server writes need equivalent authorization because server client libraries bypass Firestore Security Rules. See [Firestore security guidance](https://firebase.google.com/docs/firestore/security/get-started).

The migration must preserve archive history, prevent foreign garment references, and make importing local records an explicit action. AI results, consent evidence, and usage allowances must not be freely writable by a client.

### Cloud Run: application runtime

Cloud Run is the intended runtime for the Node.js server. A source build compiles the React app, and the service serves its assets alongside the API proxy and live gateway. The server already reads `PORT` and supports `HOST=0.0.0.0`. Future Firebase Admin SDK and Gemini calls should run behind authenticated backend routes.

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
3. Select **Enable camera** for a local preview, without starting a provider session.
4. Select **Start live try-on** to send the reference and camera video to Decart.
5. Wait for a returned video frame to decode before the AI view becomes available.
6. Choose another reference and select **Apply selected garment** to update the session.
7. Select **Stop** to end capture, the peer connection, and signaling.

The screen caps sessions at **30 seconds**, requests no microphone, and does not implement video recording. Navigation, a hidden tab, a covering app panel, connection failure, or the time cap also stops capture. There is no pointer/keyboard inactivity cutoff and no automatic reconnection.

| Gateway route                           | Purpose                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `GET /__lookluxe/decart/status`         | Report server configuration and supported duration.                  |
| `POST /__lookluxe/decart/sessions`      | Validate the reference and issue a short-lived, single-use ticket.   |
| `WS /__lookluxe/decart/stream?ticket=…` | Consume the ticket and relay provider signaling and garment changes. |

The gateway keeps provider credentials out of the browser, validates payloads and origins, and permits one active provider session per process. Selecting a reference or issuing a ticket alone does not start provider processing. See [live implementation and verification](docs/live-try-on.md).

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
| `LOOKLUXE_API_ORIGIN`      | Optional original backend root, without `/v1`.                                       | Development startup, frontend build, and production runtime. |
| `VITE_API_BASE_URL`        | Legacy fallback for the original backend origin. Prefer `LOOKLUXE_API_ORIGIN`.       | Development startup, frontend build, and production runtime. |
| `HOST`                     | Production listener; defaults to `127.0.0.1`. Use `0.0.0.0` on Cloud Run.            | Production runtime.                                          |
| `PORT`                     | Production port; defaults to 5174. Cloud Run supplies its configured container port. | Production runtime.                                          |
| `PUBLIC_WEB_ORIGIN`        | Exact remote browser origin, including HTTPS scheme and no path.                     | Development startup / production runtime.                    |
| `DECART_DEMO_ALLOW_REMOTE` | Permits remote direct-gateway requests when `true`; disabled by default.             | Development startup / production runtime.                    |

The account UI's enabled state is compiled into the frontend. When changing its backend configuration in production, rebuild with the intended origin **and** set the matching runtime origin. A runtime update does not rebuild the browser bundle.

There are no active Firebase or Gemini environment variables in this checkout; adding names to a cloud console has no effect until their code is implemented.

## Deploy the current web shell to Cloud Run

This recipe publishes the existing browser-local sample experience and leaves remote paid try-on disabled. It does not provision Firebase, migrate data, or add Gemini. These instructions have not been executed against a cloud project for this documentation update.

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

## Acceptance checks for the Google service submission

| Integration             | Work needed                                                                                                  | Evidence before claiming completion                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Firebase Authentication | Browser sign-in, token verification, authorized domains, and existing-account migration/linking.             | A real user signs in; invalid identities and cross-user access are rejected.                                  |
| Firestore               | Per-user persistence, validation, queries/indexes, access rules, and explicit local-data import.             | Records persist across sessions/devices; ownership and forbidden-field checks pass.                           |
| Private images          | Owned upload/download access, file validation, and deletion behavior.                                        | One account can retrieve its image; another cannot; media deletion follows the defined lifecycle.             |
| Gemini                  | Server-side provider client, configured model, validated outputs, consent enforcement, and failure handling. | A real consented image produces a traceable provider result; missing consent and invalid results are handled. |
| Cloud Run               | Deploy with the correct listener, environment, identity, secret access, and routing.                         | Deployed HTTPS pages, protected requests, and intended live connections work in a real browser.               |
| Live usage controls     | Protected session creation, per-user allowance, and shared state before scaling.                             | Unauthorized/exhausted users cannot start paid sessions; concurrent instances preserve limits.                |

After these pass, update the implementation status and submission paragraph, and add the actual demo URL. Keep fixtures visibly labeled even after cloud integration.

## Verification and known limits

The existing [verification record](docs/verification.md) reports **126 passing tests across eight files**, successful type checking, and a successful production build from the earlier implementation session. Those are recorded results, not a new test run for this documentation change.

Recorded browser checks include actual Decart video at **1280 × 720** from a synthetic canvas mannequin, an acknowledged garment change, and camera/peer/socket/video-element cleanup. No physical camera or microphone was used for those provider checks. Appearance on a real wearer, physical fit, and exact garment fidelity remain separate manual acceptance checks.

Current limits:

- Real-account sign-in and photo processing require acceptance testing against an available original backend and test account.
- Main-workspace cloud synchronization, Firebase identity, Firestore storage, and Gemini processing remain unimplemented.
- Sample uploads are limited to **2 MB** each and browser storage capacity. Export a copy from Settings for independent safekeeping.
- Live references support **4 MB**; the current screen uses **30-second** sessions.
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
tests/                     Client, state, protocol, and gateway tests
  fixtures/                Synthetic API and browser verification tools
docs/                      Design, backend, transport, and verification notes
public/                    Static assets
```

| Command             | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start Vite with gateway middleware.       |
| `npm run typecheck` | Check TypeScript project types.           |
| `npm test`          | Run the Vitest suite.                     |
| `npm run build`     | Type-check and build the frontend.        |
| `npm start`         | Serve the built app and backend gateways. |
| `npm run preview`   | Alias for the production Node.js server.  |
| `npm run format`    | Format source, tests, and documentation.  |

## Further documentation

- [Design system](docs/design-system.md)
- [Source audit and feature parity boundaries](docs/source-audit.md)
- [Existing backend integration](docs/backend-integration.md)
- [Live camera implementation and verification](docs/live-try-on.md)
- [Verification record](docs/verification.md)

The original Flutter/FastAPI project is a separate application. This repository provides the web client and local gateway; it does not include that backend's database, workers, storage deployment, or production credentials.
