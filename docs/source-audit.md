# Source app audit and web scope

Oyu AI web was started from the existing app at `/Users/boldbat/Oyu/Work/Apps/LookLuxe-AI`. This document records the product contracts that matter to the web implementation and distinguishes existing source capabilities from the current browser workspace. It is a source review dated 15 October 2026, not a new qualification of the hosted backend, provider output, payments, or mobile release.

## What the original product does

Oyu AI is a personal wardrobe and styling product with English and Mongolian interfaces. Users organize their clothes, request real outfit-photo assessments, receive weather-aware outfit suggestions, compose saved looks, and preview selected clothes through Photo or Live experiences.

The source architecture has a Flutter mobile app, a FastAPI backend, PostgreSQL persistence, private image storage, and durable AI jobs. The API owns authentication, authorization, consent, entitlements, and lifecycle transitions. Language models extract or describe clothing; a deterministic recommendation engine chooses owned outfits.

The source app's five navigation destinations are Home, History, Wardrobe, Studio, and Settings. History includes assessment history and actual wear records, which remain distinct. Studio currently exposes Photo and Live. Historical Snap, 2D overlay, and 3D mannequin packages do not represent current user-facing modes.

## Contracts to preserve

| Area                   | Source behavior                                                                                                | Consequence for the web                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Account                | Email/password authentication with email-code verification and recovery                                        | Verification codes are not a passwordless login mechanism. Preserve the account identity across asynchronous operations. |
| Garment intake         | Consent, private upload, extraction, review, then confirmation                                                 | Uploading a file does not make it an eligible wardrobe item. Pending confirmation needs its own state.                   |
| Outfit analysis        | A photo produces evidence, observations, and nullable dimension scores                                         | Missing evidence is not zero. Do not describe the score as a judgment of a person's body or attractiveness.              |
| Recommendations        | Confirmed clothing is filtered for availability, weather, preferences, categories, and rotation before ranking | A local rotating combination is a demo helper, not the production recommendation engine.                                 |
| Recommendation actions | Reject before requesting a replacement; accept before recording recommendation wear                            | Preserve server lifecycle ordering and alternative allowances when wiring those controls.                                |
| Saved looks            | Clothing references and compatible slots determine completeness                                                | A saved look is neither a purchase nor a wear record. Catalog items must retain their source.                            |
| Wear history           | Explicitly recorded owned garments on a chosen date                                                            | Do not derive wear records from analysis or preview timestamps. Block future wear writes.                                |
| Photo previews         | Body reference, distinct consent/readiness, explicit generation, durable job and result                        | A successful generated image does not prove fit, fidelity, or an assessment.                                             |
| Live Fitting Room      | Explicit Start/Stop, camera permission, acknowledged clothing changes, teardown on exit                        | A selected item is not automatically an applied or visible change. Never restart a paid session silently.                |
| Access and billing     | Server entitlements determine digital access; merchandise payments are separate                                | Do not unlock features based solely on a browser-side purchase state. Do not invent a unified credit balance.            |
| Privacy                | Private photos, ownership checks, versioned consent, server enforcement                                        | Use the existing API. Keep service keys and provider credentials out of the browser.                                     |

The source `trendiness` field means visible styling coherence; it does not imply a current-fashion trend feed. Overall assessments use `/100`; the four dimensions use `/25`. Real zero, missing, unreadable, failed, and partial results must stay distinguishable.

## What this web workspace currently implements

The primary workspace is a functional local sample experience. [demo.ts](../src/lib/demo.ts) supplies clearly illustrative garments, analyses, saved looks, and wear entries. [store.tsx](../src/lib/store.tsx) persists the local workspace in browser storage.

- Overview: combinations of available local clothes, saved combinations, sample score summaries, and explicit wear logging.
- My wardrobe: search, category/availability filters, sorting, favorites, laundry state, manual photo intake, item details, and removal.
- Look Studio: compose a complete local look, name/save it, reopen it, and remove it.
- Style history: illustrative analyses with nullable dimensions, date-range filtering, a wear calendar, and explicit wear editing.
- Settings: local profile/style choices, Light/Dark/System appearance, JSON export, and sample reset.

Local clothing intake asks the user to enter and confirm details; it does not perform AI extraction. Local outfit suggestions are a small deterministic demo helper that rotates through available categories; they do not claim weather or the production engine's full eligibility logic. The initial sample assets and scores are not evidence of a real customer's wardrobe or AI results.

The main web interface is currently English. The mobile app's Mongolian localization has not been ported in full. Photo try-on remains a prerequisite explanation. Live fitting room now uses the original v3 fitting-room API, real browser camera, WebRTC, and a same-origin authenticated signaling bridge; real provider output remains subject to an approved account acceptance test. Web subscription checkout is not implemented.

## Connected account boundary

[api.ts](../src/lib/api.ts) adapts the source app's owned-auth `/v1` API. [Account.tsx](../src/features/Account.tsx) exposes account access and connected account information separately from the local sample workspace. Configuration uses `VITE_API_BASE_URL`; a running compatible backend and appropriate browser-origin access are required.

The account surface supports authentication and recovery, profile/entitlement information, private garment upload/review and lifecycle controls, analysis history, consent management, outfit-photo analysis, saved looks, and additive wear history. The adapter includes private upload reservation, stable operation keys, job status handling, and owner fencing. These code paths still require validation against the configured service before making deployment claims.

Account tokens and private response state remain in memory for the tab session. Sample data persists separately in local storage. Signing into an account does not silently merge sample clothes or illustrative scores into that account. Existing adapter methods beyond the rendered UI should not be described as finished user flows.

## Design evidence and historical boundaries

The newest source palette is the warm ivory/lavender family shared by the October 10 Wardrobe/Settings refresh and October 11 calendar refresh. [design-system.md](design-system.md) records the exact tokens, spacing, typography, imagery, and accessibility expectations.

The source handbook identifies mobile TestFlight build 23 as the published October 10 design release and the October 11 calendar/radar work as a local refresh. Those are statements in the source records, not independently rechecked release status. Older Studio screenshots show retired modes and must not be treated as current requirements.

Synthetic garment images may be used as labeled examples; they do not establish physical stock or checkout readiness. Editorial portraits are style examples. Sample analysis text and scores in this workspace are presentation fixtures, not completed evaluations of those portraits.

## Source files worth reading before extending a flow

Paths below are relative to the original app root:

- `AGENTS.md` and `CLAUDE.md`: repository conventions, current behavior, and known lifecycle hazards.
- `docs/analysis/design-research-2026-10-08/README.md`: consolidated product contracts and architecture.
- `docs/analysis/design-research-2026-10-08/mobile.md`: mobile feature and navigation context.
- `docs/plans/dashboard-studio-store.md`: destination and capability contract.
- `docs/plans/fitting-room.md`: current Live experience.
- `apps/mobile/lib/core/router.dart`: actual exposed mobile routes.
- `apps/mobile/lib/features/privacy/ai_consent_gate.dart`: AI-consent handling.
- `services/backend/app/api/` and `services/backend/app/domain/`: request and response contracts.
- `services/backend/app/recommendation/`: production outfit decisions.
- `docs/design/store-test-assets.md` and `docs/design/onboarding-assets.md`: imagery provenance.

Use actual API schemas and handlers when adding connected behavior. Source screenshots explain appearance, but they do not prove current network behavior, provider quality, entitlement availability, or payment readiness.
