# Firebase cloud preferences

Oyu AI uses Firebase Authentication for Google sign-in and Cloud Firestore for explicit preference saving. These are implemented services connected to project `oyu-i-look` (project number `150458138`). Cloud Run and Gemini are not part of this integration.

## User flow

1. Open Settings and select **Continue with Google**.
2. Choose a Google account. This connection is separate from the original Oyu AI account API.
3. Choose **Save preferences** to store the current display name, styles, appearance, and locale.
4. On this or another device, choose **Load saved preferences**, review the preview, and select **Apply saved preferences**.
5. **Remove cloud copy** deletes only the saved preference document after confirmation. **Sign out** disconnects Google from this cloud feature.

Opening Settings initializes Firebase. The hosted Live screen also loads Firebase to authorize paid demo sessions; the local loopback live flow does not require it. No Firebase SDK is needed for the initial wardrobe screen. Failed cloud operations show an error within the card and do not replace local state. A cloud load does not automatically overwrite preferences, and responses from an earlier Google session are discarded.

Garments, uploaded images, saved looks, wear records, analysis fixtures, camera media, existing account tokens, and Decart credentials are excluded from the preference document. There is no automatic wardrobe migration or background synchronization. Signing out does not reset this device's workspace.

## Project resources

| Resource         | Configuration                                        |
| ---------------- | ---------------------------------------------------- |
| Firebase project | `oyu-i-look`                                         |
| Firebase web app | `Oyu AI Web`                                         |
| App ID           | `1:150458138:web:a8881b8f622e8dbab826a3`             |
| Sign-in provider | Google, enabled                                      |
| Database         | `(default)`, Firestore Native mode, Standard edition |
| Database region  | `asia-northeast1` (Tokyo)                            |
| Rules            | `firestore.rules`, deployed as `cloud.firestore`     |

Authorized browser domains include `localhost`, `127.0.0.1`, `oyu-ai-look.vercel.app`, and the project's Firebase default domains. A new custom domain or a different preview hostname must be added in Firebase Authentication settings before Google sign-in works there. Do not use wildcard shared hosting domains.

The public web configuration lives in `src/lib/firebase-web-config.json` and is compiled into the browser bundle. Its API key and app/project IDs identify the client project; they are not an administrative credential. Never replace them with a service account key, a Decart key, or another server credential. The Firestore access boundary is the signed-in user and the deployed Security Rules.

## Stored document

Path: `users/{firebaseUid}/settings/preferences`.

```json
{
  "schemaVersion": 1,
  "preferences": {
    "name": "Alex",
    "styles": ["Minimal", "Classic"],
    "theme": "light",
    "language": "en"
  },
  "updatedAt": "Firestore server timestamp"
}
```

`updatedAt` is an actual Firestore timestamp written with `serverTimestamp()`, not the string shown in this illustrative JSON. Names are limited to 40 characters. Up to three unique styles are allowed from the existing preference picker. Theme and language values follow the existing application model. Saving a locale does not add a translated interface.

Rules grant only document get/create/update/delete operations to the matching Firebase UID. They validate the exact schema, permitted values, and server timestamp. Collection enumeration, other users' documents, arbitrary additional fields, and all unrelated document paths are denied.

The client uses Firestore Lite for explicit online requests. It does not queue offline writes or subscribe to a live cloud snapshot. A successful Save means the write completed; Load fetches a fresh document. The server's original account API is not called by this feature.

## Development and testing

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5174/#settings`. No new private environment variable is needed for this Firebase project. A deployment to an authorized HTTPS domain uses the same checked-in public configuration.

Application tests:

```sh
npm test
npm run build
```

Security Rules tests require **Java 21+** and the Firebase CLI installed by `npm ci`:

```sh
npm run test:firebase
```

The CLI starts the official Firestore emulator on `127.0.0.1:8089`, runs the rules tests, and shuts it down. The project ID is always `demo-oyu-ai`; this suite does not write to `oyu-i-look`. Normal `npm test` skips the emulator-only suite unless that exact local emulator is running.

Tests cover owner CRUD, unauthenticated access, cross-user access, collection enumeration, unrelated paths, extra fields, unsupported schema versions, forged timestamps, invalid types, duplicate/unknown styles, and value limits. The regular application suite also validates cloud preferences before applying them to local state.

## Updating the deployed rules

```sh
npx firebase login
npm run firebase:rules
```

Use the Google account that owns `oyu-i-look`. Review and test rules before deploying. The current rule file deliberately denies all paths outside the preference document; extend it deliberately if adding future collections.

## Deployment boundaries

Firebase preferences work from a static frontend on an authorized domain. The existing live fitting room and connected account proxy still require the Node.js gateway and cannot run from `dist/` alone. The Firebase addition does not replace or reroute either gateway.

On Vercel, `api/live.mjs` provides the live gateway alongside the static frontend. `server/live-auth.mjs` verifies Firebase ID tokens using Google's public signing keys and the JOSE library: RS256 signature, key ID, project audience and issuer, expiration, issued/authentication times, subject, verified email, Google provider, and the configured email allowlist. No service account key is required. A token goes in the first encrypted socket message, never the socket URL. Failed authorization cannot start a Decart session. This flow does not read or write Firestore.

The README describes Vercel configuration and a separate, unverified Cloud Run recipe for the standalone server. No Cloud Run service, Firebase Hosting release, image storage bucket, or Gemini integration has been created.
