/**
 * The `ball` motion spec: per-frame poses in, keys and curves out.
 *
 * Same rule as the `pendulum`'s emitter — one tolerance, stated in pixels at the
 * far end of whatever each bone swings, and divided by that bone's own lever arm.
 * For the trail that is the distance from the bone to the spindle's tip; for the
 * ball's scale it is its own radius.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/emit-ball.ts <fit.json> <outdir> [--px 0.3] [--easings 12]`
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MotionTrack, MotionKey, EasingHandles } from '../../../../src/types.ts';
import { sidecar } from './frames.ts';
import { ballRig, ballMotion } from './ball-spec.ts';
import { floorTime, planTimelines, type TimelinePlan } from './keys.ts';

const FPS = 24;
export const DURATION = 3.633333;
/** `tail.png`'s drawn length, and `ball.png`'s drawn radius, in art units. */
const TAIL_LENGTH = 378;
const BALL_RADIUS = 77;

export interface Fit {
  index: number;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  tail: number[];
  mae: number;
}

export function buildBallTracks(
  fits: Fit[],
  segments: number,
  artScale: number,
  targetPx: number,
  scale: number,
  easingCount: number,
): { tracks: MotionTrack[]; easings: Record<string, EasingHandles>; keyCount: number; worst: number[] } {
  const t = fits.map((f) => f.index / FPS);
  const units = targetPx / scale;
  const seg = (TAIL_LENGTH * artScale) / segments;

  const spec: { bone: string; property: 'translate' | 'rotate' | 'scale'; plan: TimelinePlan }[] = [
    {
      bone: 'comet',
      property: 'translate',
      plan: { channels: [fits.map((f) => f.dx), fits.map((f) => f.dy)], tol: units },
    },
    {
      bone: 'ball',
      property: 'scale',
      plan: { channels: [fits.map((f) => f.sx), fits.map((f) => f.sy)], tol: units / BALL_RADIUS },
    },
  ];
  for (let k = 0; k < segments; k++) {
    const arm = TAIL_LENGTH * artScale - k * seg;
    spec.push({
      bone: `tail${k}`,
      property: 'rotate',
      plan: { channels: [fits.map((f) => f.tail[k])], tol: units / (arm * (Math.PI / 180)) },
    });
  }

  const { plans, table } = planTimelines(
    t,
    spec.map((s) => s.plan),
    easingCount,
  );
  const easings: Record<string, EasingHandles> = {};
  table.forEach((h, i) => {
    easings[`e${i + 1}`] = h as EasingHandles;
  });

  const tracks: MotionTrack[] = [];
  let keyCount = 0;
  spec.forEach((s, i) => {
    const plan = plans[i];
    const keys: MotionKey[] = plan.keys.map((idx, k) => {
      const key: MotionKey = { t: floorTime(t[idx]), v: s.plan.channels.map((ch) => ch[idx]) };
      if (k < plan.keys.length - 1) key.ease = `e${plan.easing[k] + 1}`;
      return key;
    });
    const last = keys[keys.length - 1];
    if (last.t < DURATION - 1e-9) keys.push({ t: DURATION, v: (last.v as number[]).slice() });
    keyCount += keys.length;
    tracks.push({ bone: s.bone, property: s.property, keys });
  });
  return { tracks, easings, keyCount, worst: plans.map((p) => p.worst) };
}

if (import.meta.main) {
  const fitPath = process.argv[2];
  const outDir = process.argv[3];
  const data = JSON.parse(readFileSync(fitPath, 'utf8')) as {
    setupWorld: [number, number];
    segments: number;
    lead: number;
    artScale: number;
    ballScale: number;
    fits: Fit[];
  };
  const side = sidecar('ball');
  const arg = (name: string, fallback: number): number => {
    const at = process.argv.indexOf(name);
    return at >= 0 ? Number(process.argv[at + 1]) : fallback;
  };
  const targetPx = arg('--px', 0.3);
  const easingCount = arg('--easings', 12);
  const { tracks, easings, keyCount, worst } = buildBallTracks(
    data.fits,
    data.segments,
    data.artScale,
    targetPx,
    side.viewport.scale,
    easingCount,
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'ball.rig.json'),
    `${JSON.stringify(
      ballRig({
        comet: data.setupWorld,
        segments: data.segments,
        artScale: data.artScale,
        ballScale: data.ballScale,
        lead: data.lead,
        box: { x: -1000, y: -1000, width: 2000, height: 2000 },
      }),
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(outDir, 'ball.motion.json'), `${JSON.stringify(ballMotion(DURATION, tracks, easings), null, 2)}\n`);
  console.log(
    `ball: ${tracks.length} timelines, ${keyCount} keys, ${Object.keys(easings).length} named easings ` +
      `(tolerance ${targetPx} px at the trail's tip)`,
  );
  tracks.forEach((tr, i) =>
    console.log(`  ${tr.bone}.${tr.property}  ${tr.keys.length} keys   worst span deviation ${worst[i].toFixed(4)}`),
  );
}
