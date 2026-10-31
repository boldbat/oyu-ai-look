# Oyu, the companion stylist

Oyu is the character who guides people through the app. She suggests outfits, rates single pieces and saved looks, reviews the week's wear log, and keeps the user company during live try-on, reacting to every piece, rating on request and suggesting what to try next. She speaks the interface language, Mongolian or English; style names (Old money, Minimal…) stay in English in both, as everywhere in the app. In English she names pieces colour first (“navy blazer”) with verbs that agree (“the trousers suit you”).

Everything Oyu does is local and instant. There is no language model and no extra service: her words come from `src/lib/oyu.ts`, and her awareness of the user comes from a small pose model that runs in the browser.

## Where she appears

| Place                       | What she does                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Every page except live      | A floating Oyu opens a panel: today's outfit, rate a piece, rate a saved look, the week in review, a shortcut to try-on.              |
| Overview                    | Comments on the suggested outfit with a score.                                                                                        |
| Overview → Хослол үнэлүүлэх | The outfit check: tap what you're wearing; Oyu rates it as it comes together, suggests the next piece, and logs it as today's outfit. |
| Studio                      | Rates the look on the board as it is built and says what would complete it.                                                           |
| Wardrobe detail             | Rates the piece (colour, style fit, elegance), says why, and shows three pieces it pairs with.                                        |
| Live try-on                 | Hosts the idle stage, guides framing, reacts to each piece, rates on request, suggests the next piece and sums up the session.        |
| Settings → Oyu стилист      | Three switches, stored on this device only: Oyu on every page, Oyu in live try-on, and Oyu seeing the user.                           |

## How she rates

`rateGarment` gives three sub-scores and an overall score out of 10, always to one decimal and always the same for the same piece:

- **Өнгө (colour):** neutrals score higher than statement colours.
- **Таны стиль (style fit):** how many of the user's chosen styles (Settings) the piece suits; for example Classic suits Old money pieces, shirts, blazers and coats.
- **Тансаг байдал (elegance):** Old money and Evening pieces score higher; favourites get a lift.

A small, fixed per-piece offset keeps scores from looking templated. Overall ≥ 9.0 is a "love" reaction, ≥ 8.2 "like", anything lower "ok". An ok piece always comes with a better suggestion and a one-tap **Өмсөөд үзэх** button. Looks (`rateLook`) are rated on three parts: **Өнгөний зохицол** (colour harmony, from `harmonyScore`), **Таны стиль** (the pieces' style fit) and **Бүрэн байдал** (completeness: a base, shoes, then a layer and an accessory). Completeness weighs most, so an outfit without shoes is never a "love". `lookAddition` picks the one piece that would improve it most: the other half of the base, then shoes, a layer, an accessory, never a second statement colour and always cut for the same person. The photo-based style analysis (scores out of 100) is the account feature from the original backend and keeps its own scale.

## In live try-on

1. **Idle:** Oyu stands in the middle of the stage and greets the user; after a session she shows her favourite piece and the top three to put back on.
2. **Preview:** she asks the user to step back. With awareness on, she confirms when the whole body is in frame, or asks for two steps back (legs for trousers, skirts and dresses; hips for tops and jackets).
3. **Each piece:** a short "thinking" beat, then a reaction that names the piece in Mongolian (“Хар хөх пиджак танд үнэхээр зохиж байна!”), a score that counts up, and why it works. She compares with the previous piece, never repeats a line within a typical session, and calls out a new favourite.
4. **While the user keeps a piece on:** after 11 s she asks them to turn around (or compliments the piece if they already did); after 26 s she suggests the next piece.
5. **On request:** tapping Oyu or **Намайг үнэлээч** shows the score card.
6. **Also:** a tip when the picture is too dark, a word when the side-by-side view opens, and silence while a new piece is being applied.

Oyu never covers the start button: on the idle stage she is part of the layout, and during the session she sits in the corner above the clothing strip, larger in full screen. Lines she offers on her own never replace a score card or suggestion the user is reading, and a bubble stays while it is pointed at or focused. The camera-bar button with her face hides her; she keeps the session in mind and returns quietly.

For screen readers, each new line (with its score) is announced once from a single live region; the bubbles themselves are not live regions, and keyboard focus returns to Oyu after any bubble button.

## Motion and voice

Oyu is meant to be noticed without getting in the way:

- **Floating companion:** she bounces in when the app opens, waves every so often, and wears a small “Oyu” name tag. On each page she offers one nudge per visit, with a soft pulsing halo (for example “Want me to rate one of your pieces?” in the wardrobe). Tapping it opens her on that page's main question; closing it stops nudges for the visit.
- **Live stage:** she stands in a soft spotlight, tilts while she thinks, and bobs as if talking while her words type in. Hearts float up for a piece she loves (9.0 and above). On the idle stage she waves when she appears.
- **Reduced motion:** with the system setting on, none of this moves. Her text appears whole and no hearts are shown.

**Her voice** is optional and off by default: **Settings → Oyu stylist → Oyu’s voice**, or the speaker button on the live stage. With the voice on, Settings lists her voices with a **Listen** button and remembers the one you pick on this device.

**Human voice (ElevenLabs).** With `ELEVENLABS_API_KEY` in `.env.local` she speaks in a natural human voice, in Mongolian as well as English. The key stays on the server (`server/voice-bridge.mjs`); the browser sends only the line she is about to say, never camera images. The server offers the account's female voices (and any voice the account made for her, preferring one named “Oyu”), uses the newest model the account can use (`eleven_v4_turbo`, then `eleven_v4`, then `eleven_v3`), remembers lines she has already said so a repeat costs nothing, caps new lines at 40 a minute, and answers only this machine unless `ELEVENLABS_ALLOW_REMOTE=true`. Browsers play sound only after the user has tapped or pressed a key on the page; every try-on starts with a tap, so she is heard from her first reaction. If ElevenLabs fails (no credits, no network), the browser's voice reads her lines for the next minute.

**Browser voice.** Without a key she uses the browser's own speech (nothing is sent anywhere), at the voice's natural pitch and an unhurried pace. Only female voices are offered (male, child and novelty voices are filtered out), most natural first: neural voices (Edge's "Online (Natural)"), Apple's downloadable Premium and Enhanced voices, Google's voices in Chrome, then the built-in ones such as Samantha. A Mac without downloads has only Apple's basic compact voices, which sound synthetic; download **Ava (Premium)** or **Zoe (Premium)** for free in System Settings → Accessibility → Spoken Content → System voice → Manage Voices…, reload, and Oyu uses it automatically. Settings shows this tip when only basic voices are available. Browsers ship English voices but rarely a Mongolian one, so in Mongolian the switch explains this and the speaker button stays hidden unless the device has a Mongolian voice. If speech ever fails, she simply stays silent.

**Language:** every line Oyu says is written in both languages at the moment she says it, with the same wording. Switching language re-renders the line on screen, the session summary and her panel messages, and pieces are named in the current language (`nameOf`).

## Seeing the user (on this device only)

`src/lib/oyu-vision.ts` runs MediaPipe Pose Landmarker (lite) on the user's own camera picture about five times a second, on the CPU (about 15 ms a frame). Camera frames never leave the device. The runtime (`@mediapipe/tasks-vision` 0.10.35, about 11 MB) comes from jsDelivr and the model (5.8 MB) from Google's model storage; both are fetched once when the try-on page opens and then cached. If either cannot be loaded, or the device is too slow (the loop backs off, then stops rather than slow the live video), Oyu simply carries on without awareness.

`readPose` turns landmarks into a frame reading (in frame, torso visible, legs visible, close-up, facing front/side/back, raised hand, both arms up, hand on hip). `PoseTracker` turns frames into a few events, each of which must hold for a moment and then cool down, so model flicker never makes Oyu repeat herself:

| Event          | Oyu says                                                               |
| -------------- | ---------------------------------------------------------------------- |
| `absent`       | Таныг харахгүй байна. Камерын өмнө зогсоорой.                          |
| `returned`     | Таныг харлаа! Үргэлжлүүлье.                                            |
| `step-back`    | Хөл тань харагдахгүй байна… / Жаахан хойшоо зогсоорой…                 |
| `framed`       | Таныг бүтэн харж байна… (preview) / Яг зөв! Одоо бүтэн харагдаж байна. |
| `spin`, `back` | Эргэлт гоё байлаа!… / Ар талаас нь ч гоё харагдаж байна!               |
| poses          | Хөөх, миний дуртай поз!… / Гоё поз!… / Ийм итгэлтэй поз…               |

Poses only count while the user faces the camera, and "back" needs the shoulders swapped with a weak face reading, because a missed turn costs less than a wrong compliment. For the same reason a single glance to the side is not a spin: a spin shows the back, or passes through the side twice. Oyu mentions what she notices only when she has been quiet for a moment and no piece is being applied; confirmations ("I can see you", "there you are") wait for that moment rather than being dropped, and "there you are" only ever answers "I can't see you".

## Rehearse before a demo

With the app running (`npm run dev`), run:

```bash
npm run rehearse                  # desktop
npm run rehearse -- --width 390   # phone size
npm run rehearse -- --headed      # watch it
npm run rehearse -- --lang en     # in English
npm run rehearse -- --voice       # with her voice on (a silent stand-in for ElevenLabs)
```

The script opens the try-on page in a test browser whose camera shows a person, answers the session request in the browser and stands in for Decart with an in-page video peer, so it costs nothing and contacts no provider. It checks Oyu's greeting and guidance, that she sees the person, the live video, her reaction and score, a suggestion applied in one tap, the score card, the summary, the browser console and that Decart was never contacted. It prints a checklist, saves screenshots to a temporary folder and exits non-zero if anything fails. It uses Playwright's Chromium if installed (`npx playwright-core install chromium`), or the installed Google Chrome.

It does not replace one short real session before presenting: Decart's video, the venue network (outbound UDP 7882 and 3478) and the room's light are only tested for real.

## Code map

| File                                            | Role                                                           |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `src/lib/oyu.ts`                                | Ratings, reviews and every line Oyu says                       |
| `src/lib/oyu-vision.ts`                         | Pose model loading, frame reading and the event tracker        |
| `src/lib/oyu-settings.ts`                       | Per-device switches shared between Settings and the pages      |
| `src/lib/oyu-voice.ts`                          | Her optional voice: choosing a voice, speaking, falling silent |
| `server/voice-bridge.mjs`                       | Her human voice: the server-side ElevenLabs route              |
| `src/components/Oyu.tsx`, `oyu.css`             | Figure, score, notes and the floating companion panel          |
| `src/features/OyuLive.tsx`                      | Oyu on the live try-on stage                                   |
| `public/assets/oyu/`                            | The three poses (hello, happy, thinking) and the welcome image |
| `tests/oyu.test.ts`, `tests/oyu-vision.test.ts` | Engine, lines, pose reading and tracker tests                  |
| `scripts/rehearse-live.mjs`                     | The free end-to-end rehearsal                                  |
