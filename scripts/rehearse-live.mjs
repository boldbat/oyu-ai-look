#!/usr/bin/env node
/**
 * Pre-demo rehearsal for live try-on with Oyu. It is free: Decart is never contacted.
 *
 * Opens the running app (`npm run dev`) in a test browser whose camera shows a person, answers
 * the session request inside the browser and stands in for Decart's stream with a second
 * in-page WebRTC peer. Then it runs a real try-on session and checks what a presenter relies
 * on: Oyu's guidance, the live video, reactions and scores, a suggestion applied in one tap,
 * the rating card, the summary, no console errors and no request to Decart.
 *
 *   npm run rehearse                  desktop, headless
 *   npm run rehearse -- --width 390   phone size
 *   npm run rehearse -- --headed      watch it run
 *   npm run rehearse -- --lang en     the English interface
 *   npm run rehearse -- --url http://127.0.0.1:5174
 */
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const url = option('url', 'http://127.0.0.1:5174').replace(/\/$/, '');
const width = Number(option('width', '1440'));
const headed = args.includes('--headed');
const english = option('lang', 'mn') === 'en';
/** What Oyu says at each checked step, in the rehearsed language. */
const expect = english
  ? { preview: 'Your camera’s on', framed: 'I can see all of you' }
  : { preview: 'Камер асчихлаа', framed: 'Таныг бүтэн харж байна' };
const phone = width < 600;
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(tmpdir(), `oyu-rehearsal-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(out, { recursive: true });

const started = Date.now();
const time = () => `${((Date.now() - started) / 1000).toFixed(1).padStart(5)}s`;
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(
    `${time()}  ${ok === null ? '–' : ok ? '✓' : '✗'}  ${name}${detail ? `  (${detail})` : ''}`,
  );
}

/** Playwright's own Chromium, any Chromium in its cache, or the installed Chrome. */
async function launch(extraArgs) {
  const options = { headless: !headed, args: extraArgs };
  try {
    return await chromium.launch(options);
  } catch {
    const cache = join(homedir(), 'Library/Caches/ms-playwright');
    const builds = existsSync(cache)
      ? readdirSync(cache)
          .filter((name) => /^chromium-\d+$/.test(name))
          .sort()
          .reverse()
      : [];
    const apps = [
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    ];
    for (const build of builds)
      for (const app of apps)
        if (existsSync(join(cache, build, app)))
          return chromium.launch({ ...options, executablePath: join(cache, build, app) });
    try {
      return await chromium.launch({ ...options, channel: 'chrome' });
    } catch {
      console.error('No browser found. Install one with: npx playwright-core install chromium');
      process.exit(2);
    }
  }
}

/** A fake camera video (Y4M) of a person standing full body, from the sample look photo. */
async function personVideo(browser) {
  const page = await browser.newPage();
  const photo = readFileSync(join(root, 'public/assets/looks/business.jpg')).toString('base64');
  const [w, h] = [512, 288];
  const frame = await page.evaluate(
    async ({ photo, w, h }) => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${photo}`;
      await image.decode();
      const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const context = canvas.getContext('2d');
      context.fillStyle = '#ebe8e2';
      context.fillRect(0, 0, w, h);
      const scale = (h - 8) / image.height;
      context.drawImage(image, (w - image.width * scale) / 2, 4, image.width * scale, h - 8);
      const rgba = context.getImageData(0, 0, w, h).data;
      const yuv = new Uint8Array(w * h * 1.5);
      for (let i = 0; i < w * h; i++)
        yuv[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
      let u = w * h;
      let v = u + (w * h) / 4;
      for (let y = 0; y < h; y += 2)
        for (let x = 0; x < w; x += 2) {
          const p = (y * w + x) * 4;
          yuv[u++] = -0.169 * rgba[p] - 0.331 * rgba[p + 1] + 0.5 * rgba[p + 2] + 128;
          yuv[v++] = 0.5 * rgba[p] - 0.419 * rgba[p + 1] - 0.081 * rgba[p + 2] + 128;
        }
      return Array.from(yuv);
    },
    { photo, w, h },
  );
  await page.close();
  const file = join(out, 'person.y4m');
  const fd = openSync(file, 'w');
  writeSync(fd, `YUV4MPEG2 W${w} H${h} F8:1 Ip A1:1 C420jpeg\n`);
  const bytes = Buffer.from(frame);
  for (let i = 0; i < 48; i++) {
    writeSync(fd, 'FRAME\n');
    writeSync(fd, bytes);
  }
  closeSync(fd);
  return file;
}

const helper = await launch([]);
const video = await personVideo(helper);
await helper.close();
const browser = await launch([
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-video-capture=${video}`,
]);
const context = await browser.newContext({
  viewport: { width, height: phone ? 844 : 1000 },
  deviceScaleFactor: phone ? 2 : 1,
  permissions: ['camera'],
});
const page = await context.newPage();
const errors = [];
let decartRequests = 0;
let poseModel = false;
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
page.on('request', (request) => /decart\.ai/.test(request.url()) && decartRequests++);
page.on('response', (response) => {
  if (/pose_landmarker/.test(response.url()) && response.ok()) poseModel = true;
});

// The stand-in for Decart: a second peer in the page that sends the camera back, tinted.
await page.addInitScript(() => {
  let peer;
  window.__rehearsal = {
    async answer(sdp) {
      peer = new RTCPeerConnection();
      const camera = await navigator.mediaDevices.getUserMedia({ video: true });
      const source = Object.assign(document.createElement('video'), { muted: true });
      source.srcObject = camera;
      await source.play();
      const canvas = Object.assign(document.createElement('canvas'), { width: 1280, height: 720 });
      const context = canvas.getContext('2d');
      const draw = () => {
        context.filter = 'sepia(0.6) saturate(1.4)';
        context.drawImage(source, 0, 0, 1280, 720);
        context.filter = 'none';
        context.fillStyle = 'rgba(0,0,0,.5)';
        context.fillRect(24, 24, 300, 48);
        context.fillStyle = '#fff';
        context.font = '600 26px sans-serif';
        context.fillText('REHEARSAL · no Decart', 38, 57);
        requestAnimationFrame(draw);
      };
      draw();
      for (const track of canvas.captureStream(30).getVideoTracks()) peer.addTrack(track);
      await peer.setRemoteDescription({ type: 'offer', sdp });
      await peer.setLocalDescription(await peer.createAnswer());
      await new Promise((resolve) => {
        peer.addEventListener('icegatheringstatechange', () => {
          if (peer.iceGatheringState === 'complete') resolve();
        });
        setTimeout(resolve, 2000);
      });
      return peer.localDescription.sdp;
    },
    candidate: (candidate) => peer?.addIceCandidate(candidate).catch(() => {}),
  };
});
await page.route('**/__lookluxe/decart/sessions', (route) =>
  route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 'rehearsal',
      ticket: 'rehearsal_ticket_000000',
      expiresIn: 15,
      maxDurationSeconds: null,
    }),
  }),
);
await page.routeWebSocket(/\/__lookluxe\/decart\/stream/, (socket) => {
  socket.onMessage(async (raw) => {
    const message = JSON.parse(String(raw));
    if (message.type === 'offer') {
      const sdp = await page.evaluate((offer) => window.__rehearsal.answer(offer), message.sdp);
      socket.send(JSON.stringify({ type: 'answer', sdp }));
    } else if (message.type === 'icecandidate' && message.candidate) {
      await page.evaluate(
        (candidate) => window.__rehearsal.candidate(candidate),
        message.candidate,
      );
    } else if (message.type === 'reference') {
      socket.send(JSON.stringify({ type: 'applying', seq: message.seq }));
      setTimeout(() => socket.send(JSON.stringify({ type: 'applied', seq: message.seq })), 700);
    }
  });
  setTimeout(() => socket.send(JSON.stringify({ type: 'ready', continuous: true })), 150);
});

const bubble = page.locator('.oyu-bubble:not(.is-thinking)').first();
const say = () => bubble.innerText({ timeout: 300 }).catch(() => '');
async function waitFor(test, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await test()) return true;
    await page.waitForTimeout(150);
  }
  return false;
}
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });

console.log(
  `Oyu live try-on rehearsal · ${url} · ${width}px · ${english ? 'English' : 'Mongolian'} · screenshots: ${out}\n`,
);
try {
  await page.goto(`${url}/#live`, { waitUntil: 'networkidle', timeout: 20_000 });
  if (english) {
    // Switch the saved language preference, as the language toggle does, and reload.
    const key = 'lookluxe.workspace.v1';
    await page.waitForFunction((name) => !!localStorage.getItem(name), key);
    await page.evaluate((name) => {
      const workspace = JSON.parse(localStorage.getItem(name));
      workspace.preferences.language = 'en';
      localStorage.setItem(name, JSON.stringify(workspace));
    }, key);
    await page.reload({ waitUntil: 'networkidle' });
    if ((await page.evaluate(() => document.documentElement.lang)) !== 'en')
      throw new Error('The page did not switch to English.');
  }
} catch {
  console.error(`Could not open ${url}. Start the app first: npm run dev`);
  await browser.close();
  process.exit(2);
}
check(
  'Oyu greets on the idle stage',
  (
    await page
      .locator('.pitch-oyu-line')
      .innerText()
      .catch(() => '')
  ).includes('Oyu'),
);
await shot('1-idle');
const firstPiece = page.locator('.pitch-garment:has(img[src$="/navy-blazer.jpg"])');
await ((await firstPiece.count()) ? firstPiece : page.locator('.pitch-garment').first()).click();
await page.locator('.pitch-empty .button').click();
check(
  'Camera preview opens, Oyu guides the framing',
  await waitFor(async () => (await say()).includes(expect.preview), 6_000),
);
const sees = await waitFor(async () => (await say()).includes(expect.framed), 30_000);
check(
  'Oyu sees the person (on-device pose model)',
  sees || (poseModel ? false : null),
  sees ? '' : poseModel ? 'model loaded but no framing line' : 'pose model unreachable: skipped',
);
await shot('2-preview');

await page.locator('.pitch-start').click();
const live = await page
  .waitForSelector('.pitch-status.is-live', { timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
check('Live session starts and the AI video plays', live);
if (live) {
  const reacted = await waitFor(
    async () => (await bubble.locator('.oyu-score').count()) > 0,
    4_000,
  );
  const said = await bubble
    .locator('p')
    .nth(1)
    .innerText({ timeout: 300 })
    .catch(() => '');
  check('Oyu reacts to the piece with a score', reacted, said);
  await shot('3-reaction');

  const low = page.locator('.pitch-strip button:has(img[src$="/floral-dress.jpg"])');
  if (await low.count()) {
    await low.first().click({ force: true });
    const offered = await waitFor(async () => (await page.locator('.oyu-try').count()) > 0, 6_000);
    check('A weaker fit gets a better suggestion', offered);
    await shot('4-suggestion');
    if (offered) {
      const before = await say();
      await page.locator('.oyu-try').click({ force: true });
      check(
        'The suggestion goes on in one tap and Oyu reacts',
        await waitFor(async () => {
          const text = await say();
          return text !== before && (await bubble.locator('.oyu-score').count()) > 0;
        }, 6_000),
      );
    }
  } else check('A weaker fit gets a better suggestion', null, 'sample piece not in wardrobe');

  await page
    .locator('.oyu-rate')
    .first()
    .click({ force: true })
    .catch(() => {});
  check(
    'Rate me shows the score card',
    await waitFor(async () => (await page.locator('.oyu-bars li').count()) === 3, 3_000),
  );
  await shot('5-rating');
  await page.locator('.pitch-stop').click();
  check(
    'Oyu sums up the session with pieces to wear again',
    await waitFor(async () => (await page.locator('.pitch-oyu-picks button').count()) >= 2, 4_000),
  );
  await shot('6-summary');
}
check('No errors in the browser console', errors.length === 0, errors.slice(0, 2).join(' | '));
check('Decart was never contacted', decartRequests === 0);
await browser.close();

const failed = results.filter((result) => result.ok === false).length;
console.log(
  `\n${failed ? `✗ ${failed} check(s) failed` : '✓ Ready for the demo'} · screenshots in ${out}`,
);
process.exit(failed ? 1 : 0);
