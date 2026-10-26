/**
 * On-device body awareness for Oyu. A small pose model (MediaPipe Pose Landmarker, lite) reads
 * the user's own camera picture a few times a second. Frames never leave the device: only the
 * model and its runtime are downloaded, once, and the browser caches them. Anything that fails
 * here only switches the awareness off; Oyu keeps working without it.
 */
import type { NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision';

const VERSION = '0.10.35';
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export type Facing = 'front' | 'side' | 'back';
/** What one camera frame shows about the person in it. */
export interface PoseFrame {
  present: boolean;
  /** Shoulders and hips in frame: enough for a top or a jacket. */
  torso: boolean;
  /** Knees in frame too: enough for trousers, skirts and dresses. */
  legs: boolean;
  /** Head to feet in frame. */
  fullBody: boolean;
  /** So close that the shoulders fill most of the picture. */
  closeUp: boolean;
  facing: Facing | null;
  /** A hand raised above the head, like Oyu's salute. */
  handRaised: boolean;
  /** Both hands above the shoulders. */
  armsUp: boolean;
  /** A hand on the hip with the elbow out. */
  handOnHip: boolean;
}
const ABSENT: PoseFrame = {
  present: false,
  torso: false,
  legs: false,
  fullBody: false,
  closeUp: false,
  facing: null,
  handRaised: false,
  armsUp: false,
  handOnHip: false,
};

// MediaPipe pose landmark indices. "Left" is the person's own left.
const NOSE = 0;
const LEFT_EYE = 2;
const RIGHT_EYE = 5;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

type Point = Pick<NormalizedLandmark, 'x' | 'y' | 'visibility'>;
const inside = (p: Point) => p.x >= -0.01 && p.x <= 1.01 && p.y >= -0.01 && p.y <= 1.01;
const seen = (p: Point | undefined, min = 0.5): p is Point =>
  !!p && (p.visibility ?? 0) >= min && inside(p);

/**
 * Reads one set of landmarks. `aspect` is the frame's width / height, so horizontal and
 * vertical distances can be compared. The camera frame is not mirrored: a person facing it
 * has their left shoulder on the right of the picture.
 */
export function readPose(lm: Point[], aspect: number): PoseFrame {
  const ls = lm[LEFT_SHOULDER];
  const rs = lm[RIGHT_SHOULDER];
  const shoulders = seen(ls) && seen(rs);
  if (!shoulders && !(seen(lm[NOSE]) && (seen(ls) || seen(rs)))) return ABSENT;
  const hips = seen(lm[LEFT_HIP], 0.4) && seen(lm[RIGHT_HIP], 0.4);
  const knees = seen(lm[LEFT_KNEE], 0.4) || seen(lm[RIGHT_KNEE], 0.4);
  const feet = [lm[LEFT_ANKLE], lm[RIGHT_ANKLE]].some((p) => seen(p, 0.4) && p.y < 0.985);
  const head = seen(lm[NOSE], 0.4) && lm[NOSE].y > 0.03;
  const width = shoulders ? Math.abs(ls.x - rs.x) * aspect : 0;
  const torsoHeight =
    shoulders && hips ? Math.abs((lm[LEFT_HIP].y + lm[RIGHT_HIP].y - ls.y - rs.y) / 2) : 0;

  let facing: Facing | null = null;
  if (shoulders) {
    const face = Math.max(
      lm[NOSE]?.visibility ?? 0,
      lm[LEFT_EYE]?.visibility ?? 0,
      lm[RIGHT_EYE]?.visibility ?? 0,
    );
    if (torsoHeight > 0.05 && width / torsoHeight < 0.32) facing = 'side';
    // The model often guesses a face even from behind, so "back" needs the shoulders swapped
    // with a weak face, or no face at all. A missed turn costs less than a wrong compliment.
    else facing = (ls.x < rs.x && face < 0.6) || face < 0.2 ? 'back' : 'front';
  }
  // Poses only count facing the camera: mid-turn, the arms are half hidden and easy to misread.
  const front = facing === 'front';
  const above = (wrist: Point | undefined, level: number) => seen(wrist) && wrist.y < level;
  const handRaised =
    front &&
    seen(lm[NOSE], 0.3) &&
    (above(lm[LEFT_WRIST], lm[NOSE].y) || above(lm[RIGHT_WRIST], lm[NOSE].y));
  const armsUp = front && above(lm[LEFT_WRIST], ls.y) && above(lm[RIGHT_WRIST], rs.y);
  // Akimbo: the wrist rests near the hip while the elbow sits further out than the wrist.
  const middle = shoulders ? (ls.x + rs.x) / 2 : 0.5;
  const akimbo = (wrist: Point | undefined, elbow: Point | undefined, hip: Point | undefined) =>
    front &&
    torsoHeight > 0.05 &&
    seen(wrist) &&
    seen(elbow) &&
    seen(hip, 0.4) &&
    Math.hypot((wrist.x - hip.x) * aspect, wrist.y - hip.y) < torsoHeight * 0.35 &&
    Math.abs(elbow.x - middle) * aspect > Math.abs(wrist.x - middle) * aspect + torsoHeight * 0.12;
  return {
    present: true,
    torso: shoulders && hips,
    legs: shoulders && hips && knees,
    fullBody: head && feet,
    // Shoulders spanning half the picture, or most of its height (portrait cameras are narrow).
    closeUp: Math.abs(ls.x - rs.x) > 0.5 || width > 0.62,
    facing,
    handRaised,
    armsUp,
    handOnHip:
      akimbo(lm[LEFT_WRIST], lm[LEFT_ELBOW], lm[LEFT_HIP]) ||
      akimbo(lm[RIGHT_WRIST], lm[RIGHT_ELBOW], lm[RIGHT_HIP]),
  };
}

export type PoseEvent =
  | 'absent'
  | 'returned'
  | 'step-back'
  | 'framed'
  | 'spin'
  | 'back'
  | 'hand-raised'
  | 'arms-up'
  | 'hand-on-hip';
/** How much of the body the current piece needs in frame. */
export type Need = 'torso' | 'legs';

/**
 * Turns a stream of frames into the few moments worth a word from Oyu. Every reading has to
 * hold for a while before it counts, and every event has a cooldown, so a flicker in the
 * model never makes Oyu repeat herself.
 */
export class PoseTracker {
  need: Need = 'torso';
  private present = false;
  private seenOnce = false;
  /** Oyu said nobody is there; she greets the person when they appear. */
  private missing = false;
  /** A framing hint is waiting for the user to step back. */
  private hinted = false;
  /** The user has been well framed at least once (Oyu confirms that first time). */
  private framedOnce = false;
  private holds = new Map<string, { value: unknown; since: number }>();
  private cooldowns = new Map<PoseEvent, number>();
  private turns: { facing: Facing; at: number }[] = [];

  /** Whether a confirmation is still true, for one said a moment after it was noticed. */
  still(event: 'framed' | 'returned') {
    return this.present && (event === 'returned' || this.holds.get('framed')?.value === true);
  }
  /** How long `key` has kept `value` (0 when it just changed). */
  private held(key: string, value: unknown, at: number) {
    const previous = this.holds.get(key);
    if (!previous || previous.value !== value) {
      this.holds.set(key, { value, since: at });
      return 0;
    }
    return at - previous.since;
  }
  private fire(event: PoseEvent, at: number, cooldown: number, out: PoseEvent[]) {
    if ((this.cooldowns.get(event) ?? -Infinity) > at) return false;
    this.cooldowns.set(event, at + cooldown);
    out.push(event);
    return true;
  }

  push(frame: PoseFrame | null, at: number): PoseEvent[] {
    const out: PoseEvent[] = [];
    const present = !!frame?.present;
    const presentFor = this.held('present', present, at);
    if (present && !this.present && presentFor >= 500) {
      if (this.missing) this.fire('returned', at, 8_000, out);
      this.present = true;
      this.seenOnce = true;
      this.missing = false;
    } else if (!present && !this.missing && presentFor >= (this.seenOnce ? 2_500 : 3_500)) {
      this.present = false;
      this.missing = this.fire('absent', at, 15_000, out);
    }
    if (!present || !this.present || !frame) return out;

    const framed = !frame.closeUp && (this.need === 'legs' ? frame.legs : frame.torso);
    const framedFor = this.held('framed', framed, at);
    if (!framed && framedFor >= 2_500 && this.fire('step-back', at, 30_000, out))
      this.hinted = true;
    if (framed && framedFor >= 1_200 && (this.hinted || !this.framedOnce)) {
      this.hinted = false;
      this.framedOnce = true;
      out.push('framed');
    }

    if (frame.facing) {
      const facingFor = this.held('facing', frame.facing, at);
      if (facingFor >= 400 && this.turns.at(-1)?.facing !== frame.facing)
        this.turns.push({ facing: frame.facing, at });
      this.turns = this.turns.filter((turn) => at - turn.at < 8_000);
      // A spin shows the back, or passes through the side twice (when the model misreads the
      // back as the front). A single glance to the side, to check the fit, is not a spin.
      const first = this.turns.findIndex((turn) => turn.facing === 'front');
      const away = this.turns.slice(first + 1, -1);
      const turnedRound =
        away.some((turn) => turn.facing === 'back') ||
        away.filter((turn) => turn.facing === 'side').length >= 2;
      if (
        first >= 0 &&
        turnedRound &&
        this.turns.at(-1)?.facing === 'front' &&
        this.fire('spin', at, 10_000, out)
      )
        this.turns = this.turns.slice(-1);
      if (frame.facing === 'back' && facingFor >= 1_000) this.fire('back', at, 20_000, out);
    }

    const armsUpFor = this.held('arms-up', frame.armsUp, at);
    const raisedFor = this.held('hand-raised', frame.handRaised, at);
    if (frame.armsUp && armsUpFor >= 700) this.fire('arms-up', at, 30_000, out);
    else if (frame.handRaised && raisedFor >= 700) this.fire('hand-raised', at, 30_000, out);
    const hipFor = this.held('hand-on-hip', frame.handOnHip, at);
    if (frame.handOnHip && hipFor >= 1_000) this.fire('hand-on-hip', at, 30_000, out);
    return out;
  }
}

let model: Promise<PoseLandmarker> | null = null;
let lastTimestamp = 0;
/**
 * The runtime announces its CPU backend through console.error while it sets up. That line is
 * information, not an error, so it is dropped during setup; console.error is restored after.
 */
function hushed<T>(run: () => T): T {
  const original = console.error;
  const filter = (...items: unknown[]) => {
    if (typeof items[0] === 'string' && items[0].startsWith('INFO: Created TensorFlow Lite'))
      return;
    original.apply(console, items);
  };
  console.error = filter;
  const restore = () => {
    if (console.error === filter) console.error = original;
  };
  try {
    const result = run();
    if (result instanceof Promise) return result.finally(restore) as T;
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}
/**
 * Loads the model once per page; a failed load can be retried by the next session. It runs on
 * the CPU: about 15 ms a frame, with no graphics driver involved and the GPU left to the live
 * video (the GPU path needs seconds of shader setup and stalls the page on weaker machines).
 */
function landmarker() {
  model ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const files = await FilesetResolver.forVisionTasks(WASM);
    return hushed(() =>
      PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      }),
    );
  })();
  model.catch(() => {
    model = null;
  });
  return model;
}
/** Starts loading early (when the try-on page opens) so awareness is ready with the camera. */
export function preloadPose() {
  void landmarker().catch(() => {});
}

/**
 * Reads `video` about five times a second and reports each frame (null: nobody in it).
 * On a slow device it reads less often, and stops entirely rather than make the live
 * video stutter. Returns a function that stops watching.
 */
export function watchPose(
  video: HTMLVideoElement,
  onFrame: (frame: PoseFrame | null, at: number) => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frames = 0;
  void landmarker()
    .then((pose) => {
      const tick = () => {
        if (stopped) return;
        let delay = 200;
        if (
          document.visibilityState === 'visible' &&
          video.readyState >= 2 &&
          video.videoWidth > 0
        ) {
          const started = performance.now();
          lastTimestamp = Math.max(started, lastTimestamp + 1);
          let landmarks;
          try {
            // The first frames finish the runtime's setup, which logs one notice.
            const detect = () => pose.detectForVideo(video, lastTimestamp).landmarks[0];
            landmarks = frames < 3 ? hushed(detect) : detect();
          } catch {
            stopped = true;
            return;
          }
          const cost = performance.now() - started;
          // A bug in what Oyu does with a frame is reported, but never ends her awareness.
          try {
            onFrame(
              landmarks ? readPose(landmarks, video.videoWidth / video.videoHeight) : null,
              started,
            );
          } catch (error) {
            console.error(error);
          }
          // The first frames include one-time setup, so they don't count as slow.
          if (++frames > 5) {
            if (cost > 250) {
              stopped = true;
              return;
            }
            delay = Math.max(delay, cost * 5);
          }
        }
        timer = setTimeout(tick, delay);
      };
      tick();
    })
    .catch(() => {});
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
