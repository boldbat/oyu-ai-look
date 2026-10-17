# Verification record

## Firebase preferences — 18 October 2026

- `npm test`: **129 application tests passed across nine files**, including all 126 original tests. The 15 emulator-only tests are skipped by this command when the emulator is absent.
- `npm run test:firebase`: **15 Security Rules tests passed** against the official Firestore emulator using isolated project `demo-oyu-ai`. Checks cover ownership, unauthenticated and cross-user access, collection listing, unrelated paths, malformed schemas, extra fields, timestamps, and preference value limits.
- `npm run build`: TypeScript and the production bundle passed. Firebase is a separate dynamically imported chunk initialized when Settings opens.
- `npm audit --omit=dev`: zero production dependency vulnerabilities after a scoped transitive gRPC override.
- Firebase project `oyu-i-look` has the `Oyu AI Web` app, Google Authentication enabled, and a default Standard Native Firestore database in `asia-northeast1`. The tested `firestore.rules` were deployed to its `cloud.firestore` release.
- Real browser Google sign-in succeeded. The Settings card saved preferences to the real database, loaded a preview with the saved timestamp, and applied it. Values were the existing sample preferences; no wardrobe photos or camera media were uploaded.
- An administrative read confirmed the live document has exactly `schemaVersion`, `preferences`, and `updatedAt`. A direct unauthenticated request to the same document returned **HTTP 403**.
- The existing workspace store/key, original account API, camera controller, Decart client/gateway, and production server were not modified. Their tests pass. No new paid Decart session or physical-camera acceptance test was performed for this change.
- A static frontend supports Firebase preferences; live try-on and account proxying still require the Node.js gateway. No Cloud Run deployment or Gemini integration was performed.

## Original implementation — 15 October 2026

## Automated

- `npm run typecheck`: strict TypeScript build across application and tests.
- `npm test`: **126 tests passed across eight files**, including the direct Decart client and gateway suites. Coverage includes v3 consent, session binding, one-use bridge tickets, real local HTTP/WebSocket relaying, origin restrictions, SDP/ICE, VP8 preference with browser fallback, first decoded frame gating, camera switching and cleanup. API contracts cover auth, serialized refresh, late-response session isolation, stable mutation keys, consent gates, signed-upload credential isolation and job states. Workspace tests cover invalid combinations, dress looks, laundry exclusion, stored-state validation, date boundaries, and historical archive references. Direct Decart tests cover image validation, account-free same-origin requests, cancellation, ticket handling, bounded sessions and reference updates.
- `npm run build`: Vite production build to `dist/`.

## Browser checks

Verified through the native Comet browser on the local Vite server, with desktop and responsive device preview:

- Overview renders the original brand and garment assets with working navigation.
- Studio requires a complete combination, saves a named outfit, and retains it across a browser reload.
- Wardrobe category filtering, garment detail, laundry and ready-to-wear actions update state.
- Explicit wear logging produces the selected pieces in the calendar without adding a photo analysis.
- Light/dark appearance changes correctly and Light was restored after verification.
- The connected account sign-in form is available when the public API origin is configured.
- At 440px the wardrobe uses two readable image columns.
- At 320×568 the menu opens, focuses its first action, navigates and closes. Closed navigation is absent from the accessibility tree.
- Every dialog has an accessible name derived from its heading.

Review found and repaired a category-label CSS collision, a narrow-screen outfit-image overlap, stale selection when changing wear dates, off-screen date selection when paging weeks, inclusive date-range errors, destructive historical item removal, incomplete-look validation, and missing dress recommendations.

Safari also verified the main Overview/Wardrobe render. Page entrance opacity animations were removed after the Safari capture repeatedly showed invisible page content. The editorial text and image layout was separated at desktop/tablet widths as well as on phones.

## Connected-screen checks with synthetic data

The localhost-only Node fixture API (`tests/fixtures/mock-api.mjs`) was used with a separate Vite preview on port 5175. It has no upstream connection, and every account, photo and score is synthetic. Native Safari checks verified:

- Sign-in, private account overview, and sign-out back to an empty login form.
- Full wardrobe listing and private thumbnails.
- Pending garment review, edited name, and confirmation to active status.
- Laundry and clean status changes.
- Failed garment retry, processing status, polling, and return to pending review.
- Complete top/bottom/footwear look composition and a persisted server response in the saved-look list.
- Additive wear logging: a day with one piece retained it and added only two new pieces when three were selected.
- Consent gate before selecting an image, and fetching a recent analysis with its actual returned dimensions.

Safari's native file chooser kept its Upload button disabled for the generated PNG and an existing sample PNG, so browser-driven file attachment and the full upload-to-result interaction remain unverified. The exact cause (browser/native automation versus application behavior) was not established. File validation, private signed upload, job submission, and polling are covered by the automated API contract tests. This limitation should be checked manually before release.

These checks are scoped smoke tests, not a full assistive-technology certification or an exhaustive cross-browser matrix.

## Live camera verification

- Safari: Enable camera requested video-only permission, reached **Camera preview**, and Stop camera returned to **Camera off**. No provider session was started.
- Safari: `tests/fixtures/live-loopback.html` passed using real browser RTCPeerConnections and synthetic canvas streams. It traversed preview → connecting → negotiating → waiting-for-frame → live; decoded a 640×360 remote frame even though the output started at opacity 0; stopped all input tracks and detached both video elements. This establishes browser WebRTC transport and cleanup, not AI generation.
- The public development API `/health` returned HTTP 200 with version 0.4.0. The dev and production same-origin proxies reached its fitting-room readiness route and correctly received 401 without a bearer.
- The production Node server served `dist/` with HTTP 200 and camera=self / microphone=disabled permissions headers. After the direct Decart integration, a production smoke test on port 5176 also returned HTTP 200 for the app and configured status from the Decart endpoint; the test server was then stopped.
- The legacy authenticated fitting-room fixture displayed private garment images, trial allowance, four lanes, and the session-length control. Selecting a dress removed the previously selected top. Start remained disabled until both valid clothes and explicit consent were present. A background Safari window was correctly prevented from starting capture and displayed a bring-the-tab-into-view message. These checks apply to the retained `LiveTryOn.tsx` account implementation.
- The current `PitchTryOn.tsx` screen uses direct Decart without a Oyu AI account or entitlement. Its explicit Start caps the session at 30 seconds; local preview stays on the device. It has no 20-second interaction cutoff. Stop, navigation, hidden tabs, covering panels, connection failure and the time limit still end capture and signaling. Safari showed the new UI with Start available without account sign-in.
- A direct Decart token probe returned HTTP 200 with the expected model/duration constraints. A gateway probe using the navy garment received a real successful `set_image_ack` in 3,624 ms without camera capture. These verify token creation and reference acceptance, not generated video.
- Safari subsequently received actual Lucy VTON 3.6 video using a synthetic canvas mannequin and the public navy garment reference. First decoded frame: **5,663 ms**, **1280×720**. The run observed **16 frame callbacks**, **14 decoded inbound frames** and **157,627 inbound bytes**, then stopped at **6,665 ms**. No physical camera or microphone was requested.
- A second actual-provider Safari run reached live at **6,618 ms**, **1280×720**, with **29 frame callbacks**, **28 decoded inbound frames** and **89,102 inbound bytes**. A navy-to-beige reference update on the same connection received both `applying` and `applied` at **7,668 ms**. It stopped at **8,676 ms** and completed at **8,731 ms**. No physical camera or microphone was requested.
- Complete cleanup passed on the second run: both tracks disabled and ended, peers closed, videos detached and socket closed. The local track ended immediately; the provider remote track reached ended within a **26 ms** observation window. The first run's immediate remote-track sampling reflected Safari's native state-update delay, not a stop/cleanup defect.

**Appearance on a real wearer remains a manual acceptance check.** Actual provider video, an in-session reference acknowledgment and cleanup were confirmed with synthetic input; those results do not establish physical fit or exact garment fidelity. The direct acceptance test no longer requires a signed-in account. The original repository was not changed; only its Decart key was copied into the ignored local server configuration without printing it. No public deployment has been completed. See [live try-on](live-try-on.md) for the current acceptance steps and local pitch boundary.
