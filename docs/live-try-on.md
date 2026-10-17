# Browser live try-on

The current **Live fitting room** uses Lucy VTON 3.6, a server-held API key, and real browser WebRTC. Local sessions require no account; the hosted Vercel demo requires Firebase Google sign-in and an authorized email. Neither uses a subscription entitlement or reservation through the original backend. The original account fitting-room integration is retained separately for later SaaS integration.

## Run and use

1. For a fresh checkout, copy `.env.example` to `.env.local`. Set `DECART_API_KEY` and `DECART_MODEL=lucy-vton-3.6`. This workspace's ignored `.env.local` is already configured with the key copied securely from the original backend. Never put this key in a `VITE_` variable.
2. Run `npm run dev` and open `http://127.0.0.1:5174/#live`.
   On the hosted Vercel app, sign in with an authorized Google account before starting AI processing.
3. Choose a top, bottom, dress or outerwear image from the local workspace, or upload a PNG, JPEG or WebP up to 4 MB. Choosing a reference does not send it to Decart.
4. Optionally press **Enable camera**. This is a local preview, with no provider session and no microphone.
5. Press **Start live try-on** to send the reference and camera video to Decart. The disclosure beside Start explains this processing. Camera permission is acquired before creating the provider connection.
6. Wait for a decoded remote frame to unlock **AI try-on**. Use **Original** to view the unchanged camera, or switch front/rear cameras when the device supports them.
7. To change clothes during the session, choose another image and press **Apply selected garment**. The UI marks it applied only after the matching provider acknowledgment. Only one change can be pending.
8. Press **Stop** to end camera capture and close signaling. Every new session requires a new explicit Start; there is no automatic reconnect.

The UI caps sessions at **30 seconds**. The bridge supports 30- or 60-second requests, but the current screen always selects 30. Navigation/unmount, a hidden tab, pagehide, a covering app panel, connection failure or the time cap also stop the session. There is no pointer/keyboard inactivity timeout, so the user can stand back for the camera. A reference update that is not confirmed within 15 seconds stops the session.

## Direct Decart transport

`src/features/PitchTryOn.tsx` owns the pitch controls, local reference selection and explicit processing action. `src/lib/decart-api.ts` calls only the same-origin direct gateway:

| Request                                 | Purpose                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /__lookluxe/decart/status`         | Report whether a server key is configured, the model, and the supported maximum duration.       |
| `POST /__lookluxe/decart/sessions`      | Validate a reference and duration, then issue a 15-second, single-use local ticket.             |
| `WS /__lookluxe/decart/stream?ticket=…` | Consume the ticket, start the bounded Decart connection, and relay signaling/reference updates. |

`server/decart-bridge.mjs` holds the permanent API key and obtains a short-lived Decart token constrained to the selected model and session duration. Both keys stay on the server. Opening the socket starts the provider connection; issuing the local ticket alone does not. Reference images stay transient in memory and are discarded from the ticket after submission or expiry. They are not added to the connected account.

The bridge translates Decart's reference acknowledgments and SDP/ICE messages into the existing camera controller protocol. Garment changes use a monotonically increasing sequence and matching `applying`, `applied` or `select_rejected` events. Both sides close together on Stop, errors or expiry. The gateway defaults to loopback requests, rejects foreign origins and oversized/invalid image payloads, and admits one active session at a time.

`src/lib/live-camera.ts` owns MediaStream, a video-only RTCPeerConnection, negotiation, first-frame detection, camera replacement and cleanup. Actual camera and generated video travel over WebRTC; the gateway carries signaling and selected clothing references. Local and AI views use `object-fit: contain` and are unmirrored. The browser does not request audio or record the video. Raw provider errors, keys, ticket URLs, SDP, ICE and media are not logged.

## Vercel live deployment

`api/live.mjs` exports a Node HTTP server with WebSocket upgrades. Vercel serves this function alongside the frontend, with Fluid compute enabled and a 120-second function limit. `GET /api/live` reports status; `GET /__lookluxe/decart/status` rewrites to it. Status identifies `transport: "websocket-init"` and `requiresSignIn: true`.

After explicit Start and local camera preparation, the client opens `WS /api/live` and sends the reference, MIME type, duration, and Firebase ID token in its first message. The token is never in the URL. The server checks the origin and payload, verifies the Firebase token against Google's public signing keys, and requires a verified Google-provider email in `LIVE_ALLOWED_EMAILS`. Failed authorization never contacts Decart. Initialization must finish within 15 seconds. All following signaling and garment updates reuse the accepted connection.

This avoids process-local HTTP tickets being issued by one function instance and consumed by another. The provider key and constrained token stay server-side. The local gateway retains its original ticket flow and remains independent of Firebase.

Configure `DECART_API_KEY`, `DECART_MODEL`, `FIREBASE_PROJECT_ID`, `LIVE_ALLOWED_EMAILS`, and `LIVE_ALLOWED_ORIGINS` in Vercel, then redeploy. Add the frontend hostname to Firebase Authentication's authorized domains. See the [README deployment instructions](../README.md#deploy-live-try-on-on-vercel). The optional original account proxy is not part of this Vercel function.

The email list restricts this paid demo. Request and active-session limits remain process-local; public multi-user access requires shared usage accounting and allowance enforcement. Google sign-in alone does not supply a paid entitlement.

## Standalone local server and deployment boundary

Both Vite and `npm run build && npm start` use the local server gateway. For this standalone mode, serve the Node application, not only `dist/`.

Remote pitch access is off by default. An intentionally private remote demo requires `DECART_DEMO_ALLOW_REMOTE=true`, an exact `PUBLIC_WEB_ORIGIN=https://your-demo-domain`, HTTPS with WebSocket upgrades, and private access enforced in front of the app. The direct gateway has no user authentication or per-user entitlement and its single-session limit is process-local. A public multi-user deployment needs those controls and a shared session/ticket design. `HOST` and `PORT` configure the Node listener.

## Legacy account fitting-room integration

`src/features/LiveTryOn.tsx`, `src/lib/api.ts` and `server/live-bridge.mjs` retain the original authenticated Oyu AI flow. It uses `/v1/fitting-room/readiness`, `/candidates`, `/sessions`, private `/outfit-items/{source}/{id}/image`, and `DELETE /v1/live-preview-sessions/{id}`. That flow requires account entitlement, the original disclosure policy, valid owned/catalog references and a server reservation. It is not the current pitch screen.

Its `/__lookluxe/live-ticket` and `/__lookluxe/live-stream` routes exchange an in-memory account bearer for a short-lived browser ticket, then add Authorization only to the fixed upstream connection. The original backend remains responsible for consent, ownership, allowance, billing and provider credentials on that legacy path. `LOOKLUXE_API_ORIGIN` configures it and the connected account REST proxy; it is optional for direct Decart. See [existing backend integration](backend-integration.md).

## Verification and acceptance

The hosted repair passes **155 application tests** and **15 Firestore rules tests**, with successful typecheck, production build, and zero production dependency audit findings. The production status endpoint returns configured HTTP 200. A real hosted WebSocket rejects invalid initialization, and the authenticated synthetic browser test received actual Decart video through the production Vercel function: **1280×720**, first live **6,468 ms**, garment change acknowledged at **8,861 ms**, stopped **9,866 ms**, and complete cleanup at **9,875 ms**. No physical camera or microphone was used. See the [dated verification record](verification.md).

### Earlier local verification

The full automated suite passed 126 tests across eight files; typecheck and the production build also passed. Direct client and gateway tests use local services and synthetic data to verify payloads, tickets, origin checks, bounded sessions, cancellation and reference acknowledgment behavior. Camera-controller tests cover video-only SDP, VP8 preference with browser fallback, ICE queues, first-frame gating, permission cancellation, switching and teardown. These tests establish protocol behavior, not generated-image quality.

Safari local-camera checks reached preview and returned to Camera off after Stop. The synthetic loopback fixture passed with real browser RTCPeerConnections at 640×360, decoded-frame detection and complete media teardown. Safari also displayed the direct pitch screen with Start available without account sign-in. The configured Decart credential passed a provider token probe with HTTP 200 and the expected constraints; a gateway probe received a successful `set_image_ack` for the navy garment in 3,624 ms. Those provider probes did not capture camera video.

Safari then received actual Lucy VTON 3.6 output using a synthetic canvas mannequin and the public navy garment reference. The first run decoded video after 5,663 ms at 1280×720. A second run reached live at 6,618 ms, observed 29 frame callbacks, 28 decoded inbound frames and 89,102 inbound bytes, and received `applying` then `applied` for a navy-to-beige reference change on the same connection at 7,668 ms. It stopped at 8,676 ms and completed verification at 8,731 ms. Neither run requested a physical camera or microphone.

The second run passed complete cleanup: both tracks disabled and ended, peers closed, videos detached and socket closed. Safari's local track ended immediately; the remote track reached ended during a 26 ms observation window. The earlier immediate remote-track sample reflected this native timing, not a cleanup failure. The production server also served the app and configured-status endpoint successfully on port 5176, then was stopped.

**Appearance on a real wearer remains a manual acceptance check.** Use an explicit 30-second Start with a usable camera to assess the clothing transformation and the visible result of a garment change. Hosted sessions require an authorized Google sign-in; local sessions do not. Synthetic-input output and a reference acknowledgment do not establish physical fit or exact garment fidelity.
