/**
 * The `pendulum` motion spec: per-frame poses in, keys and curves out.
 *
 * ⚠️ **A rotation's tolerance is not a number of degrees, it is a number of
 * pixels at the far end of what it swings.** A quarter of a degree on `chain4`
 * moves the eyelet 0.15 px; the same quarter degree on the discus moves it four
 * and a half times as far, because everything below it comes with. Tolerances
 * here are stated once, in pixels at the end of the chain, and divided by each
 * bone's own lever arm.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/emit-pendulum.ts <fit.json> <outdir> [--px 0.15] [--easings 8]`
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { MotionTrack, MotionKey, EasingHandles } from '../../../../src/types.ts';
import { sidecar } from './frames.ts';
import { pendulumRig, pendulumMotion, type PendulumStructure } from './pendulum-spec.ts';
import { floorTime, planTimelines, type TimelinePlan } from './keys.ts';

const FPS = 24;
export const DURATION = 3.633333;

export interface Fit {
  index: number;
  dx: number;
  dy: number;
  rot: number;
  link: number[];
  mae: number;
}

export function buildTracks(
  fits: Fit[],
  L: [number, number, number, number],
  targetPx: number,
  scale: number,
  easingCount: number,
): { tracks: MotionTrack[]; easings: Record<string, EasingHandles>; keyCount: number; worst: number[] } {
  const t = fits.map((f) => f.index / FPS);
  const units = targetPx / scale;
  // how far the eyelet sits from each bone's own origin, in units
  const arm = [L[0] + L[1] + L[2] + L[3], L[1] + L[2] + L[3], L[2] + L[3], L[3]];
  const degTol = (a: number): number => units / (a * (Math.PI / 180));

  const spec: { bone: string; property: 'translate' | 'rotate'; plan: TimelinePlan }[] = [
    {
      bone: 'discus',
      property: 'translate',
      plan: { channels: [fits.map((f) => f.dx), fits.map((f) => f.dy)], tol: units },
    },
    { bone: 'discus', property: 'rotate', plan: { channels: [fits.map((f) => f.rot)], tol: degTol(arm[0]) } },
  ];
  for (let k = 0; k < 4; k++) {
    spec.push({
      bone: `chain${k + 1}`,
      property: 'rotate',
      plan: { channels: [fits.map((f) => f.link[k])], tol: degTol(arm[k]) },
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
    // R7: the declared duration needs a key on it, and the 24 fps set's last
    // sample is 3.625 s. The shot is still creeping there, so this holds the
    // last measured pose for the remaining 1/120 s rather than extrapolating a
    // pose no frame shows. §10.3's "does not repeat a value" is broken here on
    // purpose, once per track, and that is the only place it is.
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
    structure: { pivotX: number; pivotY: number; L: [number, number, number, number] };
    h1: number;
    setupWorld: [number, number];
    fits: Fit[];
  };
  const side = sidecar('pendulum');
  const arg = (name: string, fallback: number): number => {
    const at = process.argv.indexOf(name);
    return at >= 0 ? Number(process.argv[at + 1]) : fallback;
  };
  const targetPx = arg('--px', 0.15);
  const easingCount = arg('--easings', 8);

  const structure: PendulumStructure = {
    pivot: [data.structure.pivotX, data.structure.pivotY],
    L: data.structure.L,
    h1: arg('--h1', data.h1),
    discus: data.setupWorld,
    box: { x: -400, y: -1100, width: 800, height: 1200 },
  };
  const { tracks, easings, keyCount, worst } = buildTracks(
    data.fits,
    data.structure.L,
    targetPx,
    side.viewport.scale,
    easingCount,
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'pendulum.rig.json'), `${JSON.stringify(pendulumRig(structure), null, 2)}\n`);
  writeFileSync(
    join(outDir, 'pendulum.motion.json'),
    `${JSON.stringify(pendulumMotion(DURATION, tracks, easings), null, 2)}\n`,
  );
  console.log(
    `pendulum: ${tracks.length} timelines, ${keyCount} keys, ${Object.keys(easings).length} named easings ` +
      `(tolerance ${targetPx} px at the eyelet)`,
  );
  tracks.forEach((tr, i) =>
    console.log(`  ${tr.bone}.${tr.property}  ${tr.keys.length} keys   worst span deviation ${worst[i].toFixed(3)}`),
  );
}
