/**
 * Fit one pose per committed reference frame by rendering the candidate into
 * the frames' own viewport and minimising the difference (§8's "second way to
 * get the number", applied to a whole pose; §9.1's `bone.pose` trap is handled
 * in `harness.ts`).
 *
 * The search is Hooke-Jeeves: a line search per knob at a shrinking step, then
 * a pattern move along whatever the sweep as a whole achieved. Plain coordinate
 * descent stalls here because the knobs are coupled — a hip that is a pixel low
 * and a thigh that is a degree out cost less together than either does alone.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { centroid, loadCandidate, loadFrame, maeLevel, reduceTo, Rigged, type Level, type Pose } from './harness.ts';
import { SCALE } from './geom.ts';

const run = join(import.meta.dir, '..');
const refRoot = join(run, '../../reference/spineboy/ess');

export const ROTATE_BONES = [
  'torso',
  'head',
  'rear-upper-arm',
  'rear-bracer',
  'gun',
  'front-upper-arm',
  'front-bracer',
  'front-fist',
  'rear-thigh',
  'rear-shin',
  'rear-foot',
  'front-thigh',
  'front-shin',
  'front-foot',
];
export const KEYS = ['hip.x', 'hip.y', 'hip.rot', ...ROTATE_BONES];

export type Vec = Record<string, number>;

export interface FramePose {
  v: Vec;
  fist: string;
  mae: number;
  /** extra slot attachments this frame shows — the muzzle flare (§ shoot) */
  slots?: Record<string, string | null>;
}

export function toPose(v: Vec, fist?: string, extra?: Record<string, string | null>): Pose {
  const bones: Pose['bones'] = { hip: { x: v['hip.x'], y: v['hip.y'], rotation: v['hip.rot'] } };
  for (const b of ROTATE_BONES) bones[b] = { rotation: v[b] };
  if (v['muzzle.rot'] !== undefined || v['muzzle.sx'] !== undefined) {
    bones.muzzle = { rotation: v['muzzle.rot'] ?? 0, scaleX: v['muzzle.sx'] ?? 1, scaleY: v['muzzle.sy'] ?? 1 };
  }
  const slots: Record<string, string | null> = { ...(extra ?? {}) };
  if (fist) slots['front-fist'] = fist;
  return Object.keys(slots).length ? { bones, slots } : { bones };
}

export function zero(): Vec {
  const v: Vec = {};
  for (const k of KEYS) v[k] = 0;
  return v;
}

/**
 * §10.3's gauge warning, checked rather than assumed. An exact rotation gauge
 * needs a bone that carries no art AND children at its own origin; the hip's
 * three children sit 9-13 units off it, so a hip turn moves their origins and
 * the picture — folding a median back would change the render, and this run
 * does not do it. What is left is a soft degeneracy, and this penalty is the
 * guard: invisible at animator-sized angles, decisive against a 180 deg turn
 * bought with a 180 deg counter-turn.
 */
const GAUGE_PENALTY = 2e-5;
function penalty(v: Vec): number {
  let s = 0;
  for (const k of KEYS) if (k !== 'hip.x' && k !== 'hip.y') s += v[k] * v[k];
  return GAUGE_PENALTY * s;
}

const rig = new Rigged(loadCandidate(join(run, 'ess', 'spine')));

export interface Target {
  levels: Level[];
  cx: number;
  cy: number;
}

export function target(path: string): Target {
  const plate = loadFrame(path);
  const [cx, cy] = centroid(plate);
  return { levels: BLOCK_ORDER.map((b) => reduceTo(plate, b)), cx, cy };
}

const BLOCK_ORDER = [8, 4, 2, 1];
let evals = 0;
let extraSlots: Record<string, string | null> | undefined;
export function setExtraSlots(s: Record<string, string | null> | undefined): void {
  extraSlots = s;
}
function score(v: Vec, fist: string, t: Target, li: number): number {
  evals++;
  return maeLevel(rig.render(toPose(v, fist, extraSlots)), t.levels[li]) + penalty(v);
}

/** The cheap global register: put the candidate's drawn centroid on the
 *  reference's before any rotation is searched. Two passes settle it. */
function centreOn(p: FramePose, t: Target): void {
  for (let i = 0; i < 3; i++) {
    const [cx, cy] = centroid(rig.render(toPose(p.v, p.fist)));
    const dx = (t.cx - cx) / SCALE;
    const dy = -(t.cy - cy) / SCALE;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
    p.v['hip.x'] += dx;
    p.v['hip.y'] += dy;
  }
}

const TRANSLATE_PER_DEG = 4.5;

/**
 * A global scan of one knob, not a line search from where it happens to sit.
 *
 * This is the change that made the fit work at all. A local search cannot turn
 * an arm 60 degrees when the arm currently overlaps nothing the reference drew
 * there: every small step reads as noise, so the sweep reports "no improvement"
 * and the frame lands at a pose with almost no overlap (`run` measured a mean
 * 50.2 that way, against 15.9 with this). Scanning the whole plausible range of
 * each knob costs about 45 renders and finds the basin outright.
 */
function scan(p: FramePose, t: Target, li: number, k: string, half: number, step: number): void {
  const base = p.v[k];
  let bestV = base;
  let best = p.mae;
  for (let d = -half; d <= half + 1e-9; d += step) {
    if (Math.abs(d) < 1e-9) continue;
    p.v[k] = base + d;
    const val = score(p.v, p.fist, t, li);
    if (val < best - 1e-7) {
      best = val;
      bestV = p.v[k];
    }
  }
  p.v[k] = bestV;
  p.mae = best;
}

/**
 * Two knobs at once, for the pair a 1-D scan cannot separate.
 *
 * The gun hangs three rotations below the shoulder, so where it lands is a
 * function of the whole arm and no single knob moves it to the right place —
 * scanned one at a time the arm is the one part of the figure that stays wrong
 * (measured on `run`: every frame's residual was the gun and the two arms).
 */
function scan2(p: FramePose, t: Target, li: number, k1: string, k2: string, half: number, step: number): void {
  const b1 = p.v[k1];
  const b2 = p.v[k2];
  let best = p.mae;
  let v1 = b1;
  let v2 = b2;
  for (let d1 = -half; d1 <= half + 1e-9; d1 += step) {
    p.v[k1] = b1 + d1;
    for (let d2 = -half; d2 <= half + 1e-9; d2 += step) {
      p.v[k2] = b2 + d2;
      const val = score(p.v, p.fist, t, li);
      if (val < best - 1e-7) {
        best = val;
        v1 = p.v[k1];
        v2 = p.v[k2];
      }
    }
  }
  p.v[k1] = v1;
  p.v[k2] = v2;
  p.mae = best;
}

const ARM_PAIRS: [string, string][] = [
  ['rear-upper-arm', 'rear-bracer'],
  ['rear-bracer', 'gun'],
  ['front-upper-arm', 'front-bracer'],
];

export function polish(p: FramePose, t: Target, li: number, steps: number[], sweeps: number): void {
  p.mae = score(p.v, p.fist, t, li);
  for (const step of steps) {
    for (let sweep = 0; sweep < sweeps; sweep++) {
      let moved = false;
      const before = { ...p.v };
      for (const k of KEYS) {
        const s = k === 'hip.x' || k === 'hip.y' ? step * TRANSLATE_PER_DEG : step;
        for (const dir of [1, -1]) {
          let n = 0;
          for (;;) {
            p.v[k] += dir * s;
            const val = score(p.v, p.fist, t, li);
            if (val < p.mae - 1e-7) {
              p.mae = val;
              moved = true;
              if (++n > 16) break;
            } else {
              p.v[k] -= dir * s;
              break;
            }
          }
          if (n > 0) break;
        }
      }
      const d: Vec = {};
      let stepped = false;
      for (const k of KEYS) {
        d[k] = p.v[k] - before[k];
        if (Math.abs(d[k]) > 1e-9) stepped = true;
      }
      if (stepped) {
        for (const mult of [1, 2]) {
          for (const k of KEYS) p.v[k] += d[k] * mult;
          const val = score(p.v, p.fist, t, li);
          if (val < p.mae - 1e-7) {
            p.mae = val;
            moved = true;
          } else {
            for (const k of KEYS) p.v[k] -= d[k] * mult;
            break;
          }
        }
      }
      if (!moved) break;
    }
  }
}

/**
 * One frame, coarse to fine.
 *
 * Block 8 is deliberately not used for limbs: at 1/8 the whole figure is about
 * 13 x 19 cells and a shin is one of them, so a scan there registers the body
 * and nothing else. The limbs are placed at block 4 with a scan over the whole
 * plausible range of each rotation — `run` needs 60-90 degrees off the stance
 * and a +-24 degree window never reaches it.
 */
export function fitFrame(p: FramePose, t: Target, _wide: boolean): void {
  void _wide;
  centreOn(p, t);
  /**
   * A whole-body turn has to be scanned WITH the body re-centred, or it is
   * never found. The head is the heaviest thing in the picture and it sits at
   * the top of the chain, so turning the hip 90 degrees swings the head right
   * out of the reference's head and every candidate turn scores worse than no
   * turn at all. `death` measured this exactly: a figure lying on his back,
   * fitted upright at hip.rot = 2 degrees and MAE 91.8. Re-centring inside the
   * scan finds the turn.
   */
  {
    const base = p.v['hip.rot'];
    let best = Infinity;
    let keep = { r: base, x: p.v['hip.x'], y: p.v['hip.y'] };
    for (let d = -180; d < 180; d += 15) {
      p.v['hip.rot'] = base + d;
      centreOn(p, t);
      const v = score(p.v, p.fist, t, 0);
      if (v < best) {
        best = v;
        keep = { r: p.v['hip.rot'], x: p.v['hip.x'], y: p.v['hip.y'] };
      }
    }
    p.v['hip.rot'] = keep.r;
    p.v['hip.x'] = keep.x;
    p.v['hip.y'] = keep.y;
    p.mae = best;
  }
  p.mae = score(p.v, p.fist, t, 0);
  for (const k of ['hip.x', 'hip.y', 'hip.rot']) scan(p, t, 0, k, k === 'hip.rot' ? 30 : 120, k === 'hip.rot' ? 5 : 16);
  for (const k of KEYS) scan(p, t, 0, k, k === 'hip.x' || k === 'hip.y' ? 60 : 90, k === 'hip.x' || k === 'hip.y' ? 8 : 9);
  for (const [a, b] of ARM_PAIRS) scan2(p, t, 0, a, b, 90, 12);
  // block 4 — the limbs, over their whole range
  p.mae = score(p.v, p.fist, t, 1);
  for (const k of KEYS) scan(p, t, 1, k, k === 'hip.x' || k === 'hip.y' ? 80 : 180, k === 'hip.x' || k === 'hip.y' ? 8 : 10);
  for (const [a, b] of ARM_PAIRS) scan2(p, t, 1, a, b, 40, 8);
  for (const k of KEYS) scan(p, t, 1, k, k === 'hip.x' || k === 'hip.y' ? 30 : 30, k === 'hip.x' || k === 'hip.y' ? 3 : 4);
  polish(p, t, 1, [6, 3], 3);
  // block 2
  p.mae = score(p.v, p.fist, t, 2);
  for (const k of KEYS) scan(p, t, 2, k, k === 'hip.x' || k === 'hip.y' ? 24 : 14, k === 'hip.x' || k === 'hip.y' ? 3 : 2);
  polish(p, t, 2, [3, 1.5], 3);
  // block 1 — the pixels
  polish(p, t, 3, [1.5, 0.8, 0.4, 0.2], 4);
}

function fitFist(p: FramePose, t: Target): void {
  const was = p.fist;
  p.fist = was === 'front-fist-open' ? 'front-fist-closed' : 'front-fist-open';
  const v = score(p.v, p.fist, t, BLOCK_ORDER.length - 1);
  if (v < p.mae - 1e-6) p.mae = v;
  else p.fist = was;
}

if (import.meta.main) {
  for (const anim of process.argv.slice(2)) {
    const dir = join(refRoot, anim);
    const files = readdirSync(dir)
      .filter((f) => /^f\d+\.png$/.test(f))
      .sort();
    const out: FramePose[] = [];
    let prev: FramePose = { v: zero(), fist: 'front-fist-open', mae: 0 };
    const t0 = performance.now();
    for (let i = 0; i < files.length; i++) {
      const t = target(join(dir, files[i]));
      const cand: FramePose = { v: { ...prev.v }, fist: prev.fist, mae: 0 };
      fitFrame(cand, t, i === 0);
      fitFist(cand, t);
      polish(cand, t, 3, [0.8, 0.4, 0.2], 3);
      out.push(cand);
      prev = cand;
      process.stdout.write(`${anim} ${files[i]} MAE ${cand.mae.toFixed(2)} ${((performance.now() - t0) / 1000).toFixed(0)}s\n`);
    }
    writeFileSync(join(import.meta.dir, `poses-${anim}.json`), JSON.stringify(out, null, 1) + '\n');
    const mean = out.reduce((s, p) => s + p.mae, 0) / out.length;
    console.log(`== ${anim}: ${out.length} frames, mean MAE ${mean.toFixed(3)}, ${evals} evals`);
  }
}
