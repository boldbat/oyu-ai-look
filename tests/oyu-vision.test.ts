import { describe, expect, it } from 'vitest';
import { PoseTracker, readPose } from '../src/lib/oyu-vision';
import type { PoseFrame } from '../src/lib/oyu-vision';

const ASPECT = 16 / 9;
type Point = { x: number; y: number; visibility: number };
const at = (x: number, y: number, visibility = 0.95): Point => ({ x, y, visibility });
const hidden = { x: 0.5, y: 1.3, visibility: 0.05 };

/** A person standing in the middle of a 16:9 frame, as the camera (unmirrored) sees them. */
function body(
  options: {
    facing?: 'front' | 'side' | 'back';
    legs?: boolean;
    close?: boolean;
    pose?: 'hand-raised' | 'arms-up' | 'hand-on-hip';
  } = {},
) {
  const { facing = 'front', legs = true, close = false, pose } = options;
  const half = close ? 0.2 : facing === 'side' ? 0.01 : 0.06;
  // Facing the camera, the person's left shoulder is on the right of the picture.
  const left = facing === 'back' ? 0.5 - half : 0.5 + half;
  const right = facing === 'back' ? 0.5 + half : 0.5 - half;
  const face = facing === 'back' ? 0.1 : 0.95;
  const points: Point[] = Array.from({ length: 33 }, () => hidden);
  points[0] = at(0.5, close ? 0.3 : 0.15, face);
  points[2] = at(0.49, 0.14, face);
  points[5] = at(0.51, 0.14, face);
  points[11] = at(left, close ? 0.75 : 0.28);
  points[12] = at(right, close ? 0.75 : 0.28);
  if (close) return points;
  points[13] = at(0.5 + (left - 0.5) * 1.3, 0.42);
  points[14] = at(0.5 + (right - 0.5) * 1.3, 0.42);
  points[15] = at(0.5 + (left - 0.5) * 1.3, 0.54);
  points[16] = at(0.5 + (right - 0.5) * 1.3, 0.54);
  points[23] = at(0.5 + (left - 0.5) * 0.7, 0.55);
  points[24] = at(0.5 + (right - 0.5) * 0.7, 0.55);
  if (legs) {
    points[25] = at(0.52, 0.72);
    points[26] = at(0.48, 0.72);
    points[27] = at(0.52, 0.9);
    points[28] = at(0.48, 0.9);
  }
  if (pose === 'hand-raised') points[16] = at(0.42, 0.05);
  if (pose === 'arms-up') {
    points[15] = at(0.6, 0.18);
    points[16] = at(0.4, 0.18);
  }
  if (pose === 'hand-on-hip') {
    points[13] = at(0.62, 0.42);
    points[15] = points[23];
  }
  return points;
}
const read = (options?: Parameters<typeof body>[0]) => readPose(body(options), ASPECT);

describe('readPose', () => {
  it('sees a person standing facing the camera, head to feet', () => {
    expect(read()).toMatchObject({
      present: true,
      torso: true,
      legs: true,
      fullBody: true,
      closeUp: false,
      facing: 'front',
      handRaised: false,
      armsUp: false,
      handOnHip: false,
    });
  });

  it('tells side and back from front', () => {
    expect(read({ facing: 'side' }).facing).toBe('side');
    expect(read({ facing: 'back' }).facing).toBe('back');
  });

  it('notices when the legs are out of frame, or the person is too close', () => {
    expect(read({ legs: false })).toMatchObject({ torso: true, legs: false, fullBody: false });
    expect(read({ close: true })).toMatchObject({ present: true, torso: false, closeUp: true });
  });

  it('recognises a raised hand, both arms up and a hand on the hip', () => {
    expect(read({ pose: 'hand-raised' })).toMatchObject({ handRaised: true, armsUp: false });
    expect(read({ pose: 'arms-up' })).toMatchObject({ armsUp: true });
    expect(read({ pose: 'hand-on-hip' }).handOnHip).toBe(true);
  });

  it('notices a close-up on a portrait (phone) camera too', () => {
    const portrait = body({ close: true });
    // Head and shoulders filling a 9:16 picture: the shoulders span most of its width.
    portrait[11] = at(0.85, 0.75);
    portrait[12] = at(0.15, 0.75);
    expect(readPose(portrait, 9 / 16).closeUp).toBe(true);
    // Standing back in the same portrait frame is not a close-up.
    expect(readPose(body(), 9 / 16).closeUp).toBe(false);
  });

  it('sees nobody in an empty frame', () => {
    expect(
      readPose(
        Array.from({ length: 33 }, () => hidden),
        ASPECT,
      ).present,
    ).toBe(false);
  });
});

/** Feeds the tracker one frame every 200 ms (the camera rate) and collects its events. */
function run(tracker: PoseTracker, script: [PoseFrame | null, number][], start = 0) {
  const events: [string, number][] = [];
  let time = start;
  for (const [frame, ms] of script)
    for (let t = 0; t < ms; t += 200, time += 200)
      for (const event of tracker.push(frame, time)) events.push([event, time]);
  return { events: events.map(([event]) => event), time };
}

describe('PoseTracker', () => {
  it('says nobody is there only after a few seconds, then welcomes the person back', () => {
    const tracker = new PoseTracker();
    expect(run(tracker, [[null, 3_000]]).events).toEqual([]);
    expect(run(tracker, [[null, 1_000]], 3_000).events).toEqual(['absent']);
    expect(run(tracker, [[read(), 1_000]], 4_000).events).toEqual(['returned']);
  });

  it('asks a person wearing trousers to step back, then confirms the framing', () => {
    const tracker = new PoseTracker();
    tracker.need = 'legs';
    const { events, time } = run(tracker, [[read({ legs: false }), 3_600]]);
    expect(events).toEqual(['step-back']);
    expect(run(tracker, [[read(), 1_600]], time).events).toEqual(['framed']);
  });

  it('accepts a waist-up picture for a top, and confirms good framing once', () => {
    const tracker = new PoseTracker();
    expect(run(tracker, [[read({ legs: false }), 5_000]]).events).toEqual(['framed']);
    expect(run(tracker, [[read(), 5_000]], 5_000).events).toEqual([]);
  });

  it('notices a turn to show the back, then the full spin', () => {
    const tracker = new PoseTracker();
    const { events } = run(tracker, [
      [read(), 1_600],
      [read({ facing: 'side' }), 600],
      [read({ facing: 'back' }), 1_400],
      [read({ facing: 'side' }), 600],
      [read(), 800],
    ]);
    expect(events).toEqual(['framed', 'back', 'spin']);
  });

  it('knows whether a late confirmation is still true', () => {
    const tracker = new PoseTracker();
    const { time } = run(tracker, [[read(), 2_000]]);
    expect(tracker.still('framed')).toBe(true);
    expect(tracker.still('returned')).toBe(true);
    run(tracker, [[read({ close: true }), 400]], time);
    expect(tracker.still('framed')).toBe(false);
    run(tracker, [[null, 3_000]], time + 400);
    expect(tracker.still('returned')).toBe(false);
  });

  it('does not take a glance to the side for a spin', () => {
    const tracker = new PoseTracker();
    const glance = run(tracker, [
      [read(), 1_600],
      [read({ facing: 'side' }), 1_000],
      [read(), 1_000],
    ]);
    expect(glance.events).toEqual(['framed']);
  });

  it('counts a full turn even when the model misreads the back as the front', () => {
    const tracker = new PoseTracker();
    const { events } = run(tracker, [
      [read(), 1_600],
      [read({ facing: 'side' }), 600],
      [read(), 600],
      [read({ facing: 'side' }), 600],
      [read(), 800],
    ]);
    expect(events).toEqual(['framed', 'spin']);
  });

  it('ignores a one-frame flicker of the facing reading', () => {
    const tracker = new PoseTracker();
    const flicker: [PoseFrame, number][] = [];
    for (let i = 0; i < 10; i++) flicker.push([read(), 600], [read({ facing: 'back' }), 200]);
    expect(run(tracker, flicker).events).toEqual(['framed']);
  });

  it('compliments a pose once, then waits before mentioning it again', () => {
    const tracker = new PoseTracker();
    const { events, time } = run(tracker, [
      [read(), 600],
      [read({ pose: 'hand-raised' }), 1_200],
      [read(), 600],
      [read({ pose: 'hand-raised' }), 1_200],
    ]);
    expect(events).toEqual(['hand-raised', 'framed']);
    expect(run(tracker, [[read({ pose: 'hand-raised' }), 30_000]], time).events).toEqual([
      'hand-raised',
    ]);
    expect(run(new PoseTracker(), [[read({ pose: 'hand-on-hip' }), 2_200]]).events).toEqual([
      'hand-on-hip',
      'framed',
    ]);
  });
});
