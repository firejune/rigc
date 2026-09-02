/**
 * The per-frame pose fit.
 *
 * AUTHORING §8.1, item by item: the objective is the whole composite; the search
 * runs coarse to fine with the body placed at the coarsest level and each limb
 * decided at a level whose cells are smaller than the part being moved; every
 * knob is scanned across its whole plausible range rather than line-searched out
 * from where it sits; the chains that only decide together are scanned as pairs;
 * and more than one start is screened coarsely, the incumbent always among them.
 *
 * The seeds are what this run has that the instrument set did not before: one of
 * them is `rigc pose`'s own placement report for that very frame, converted into
 * bone-local rotations. It is a start, not an answer — §11.4's occlusion caveat
 * is exactly why.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readViewport, wrap180, type Viewport } from './geom.ts';
import { BONES, PARENT_OF, artSizes } from './rig.ts';
import { OWN_PIVOT, TORSO_SETUP } from './setup.ts';
import {
  applyPose,
  changeWeights,
  drawNothingFloor,
  loadPosable,
  refLevels,
  score,
  type PoseVec,
  type Posed,
  type RefLevel,
} from './fitlib.ts';
import type { Table, FrameRow } from './collect.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';
const IMAGES = 'examples/spineboy/images';

export const ROT_BONES = BONES.filter(([, p]) => p !== null && p !== 'muzzle').map(([b]) => b);

export interface KnobDef {
  key: string;
  min: number;
  max: number;
  /** Coarsest pyramid level (index into LEVELS) this knob is allowed to move at. */
  from: number;
}

/**
 * Ranges taken from what the shot visits, not from what the format permits
 * (§9.1's bound rule, and its converse — a bound has to REACH what the frames
 * show). `death` slides ~426 units left of the stance and `jump` peaks ~749
 * units above the floor, so the translate box is drawn to contain both with room.
 */
export const KNOBS: KnobDef[] = [
  { key: 'torso.x', min: -900, max: 500, from: 0 },
  { key: 'torso.y', min: -260, max: 820, from: 0 },
  { key: 'torso.rotate', min: -180, max: 180, from: 0 },
  { key: 'rear-thigh.rotate', min: -180, max: 180, from: 1 },
  { key: 'front-thigh.rotate', min: -180, max: 180, from: 1 },
  { key: 'rear-shin.rotate', min: -170, max: 170, from: 1 },
  { key: 'front-shin.rotate', min: -170, max: 170, from: 1 },
  { key: 'neck.rotate', min: -90, max: 90, from: 1 },
  { key: 'head.rotate', min: -90, max: 90, from: 1 },
  { key: 'rear-upper-arm.rotate', min: -180, max: 180, from: 1 },
  { key: 'front-upper-arm.rotate', min: -180, max: 180, from: 1 },
  { key: 'rear-bracer.rotate', min: -170, max: 170, from: 2 },
  { key: 'front-bracer.rotate', min: -170, max: 170, from: 2 },
  { key: 'gun.rotate', min: -180, max: 180, from: 2 },
  { key: 'front-fist.rotate', min: -170, max: 170, from: 2 },
  { key: 'rear-foot.rotate', min: -110, max: 110, from: 2 },
  { key: 'front-foot.rotate', min: -110, max: 110, from: 2 },
];

/**
 * Knobs the composite may NOT move.
 *
 * ⭐ AUTHORING §9.1's *sacrificial cover*, and its own instruction about what to do
 * when the two instruments disagree: *"prefer the frame-derived instruments when
 * they disagree with the composite about a single part's place"*. The trunk's
 * translate and the torso/neck/head angles are measured off `pose`'s own
 * placements by `tools/solve.ts` at 0.5-3 frame px; left free, the composite spends
 * exactly that measurement dragging the torso to cover a mis-posed leg — measured
 * here, 58.2 -> 67.5 on `idle/f0000` in one pass. So they are frozen, which is also
 * §8.1's *"freeze the chains that have converged"*.
 */
export const FROZEN = new Set(
  (process.env.RIGC_RUN_FREE ?? 'torso.x,torso.y,torso.rotate,neck.rotate,head.rotate').split(',').filter(Boolean),
);

/** Chains whose two links only decide together — §8.1's paired scan. */
export const PAIRS: [string, string][] = [
  ['front-thigh.rotate', 'front-shin.rotate'],
  ['rear-thigh.rotate', 'rear-shin.rotate'],
  ['front-upper-arm.rotate', 'front-bracer.rotate'],
  ['rear-upper-arm.rotate', 'rear-bracer.rotate'],
  ['rear-bracer.rotate', 'gun.rotate'],
];

const PART_OF_BONE: Record<string, string> = {
  'front-fist': 'front-fist-closed',
};

export function zeroPose(): PoseVec {
  const p: PoseVec = {};
  for (const k of KNOBS) p[k.key] = 0;
  return p;
}

/** `pose`'s report for one frame, turned into a bone-local pose vector. */
export function seedFromPose(row: FrameRow, vp: Viewport, sizes: Map<string, [number, number]>): PoseVec {
  const gate = (r: { res: number; unexp: number }): boolean => r.res <= 0.16 && r.unexp <= 0.45;
  const world = new Map<string, number>([['root', 0]]);
  for (const [bone, parent] of BONES) {
    if (parent === null) continue;
    if (bone === 'muzzle') continue;
    const part = PART_OF_BONE[bone] ?? bone;
    const p = row[part];
    const inherited = world.get(parent) ?? 0;
    world.set(bone, p && gate(p) ? -p.rot : inherited);
  }
  const pose = zeroPose();
  for (const k of KNOBS) {
    if (!k.key.endsWith('.rotate')) continue;
    const bone = k.key.slice(0, -7);
    const parent = PARENT_OF.get(bone) ?? 'root';
    pose[k.key] = wrap180((world.get(bone) ?? 0) - (world.get(parent) ?? 0));
  }
  const t = row['torso'];
  if (t && t.res <= 0.2) {
    const [w, h] = sizes.get('torso')!;
    const [pu, pv] = OWN_PIVOT['torso'];
    const u = pu - w / 2;
    const v = pv - h / 2;
    const c = Math.cos((t.rot * Math.PI) / 180) * vp.scale;
    const s = Math.sin((t.rot * Math.PI) / 180) * vp.scale;
    const fx = t.x + u * c - v * s;
    const fy = t.y + u * s + v * c;
    pose['torso.x'] = vp.minX + fx / vp.scale - TORSO_SETUP[0];
    pose['torso.y'] = vp.maxY - fy / vp.scale - TORSO_SETUP[1];
  }
  return pose;
}

function clampPose(pose: PoseVec): PoseVec {
  for (const k of KNOBS) pose[k.key] = Math.max(k.min, Math.min(k.max, pose[k.key]));
  return pose;
}

interface Ctx {
  p: Posed;
  levels: RefLevel[];
  attachments?: Record<string, string | null>;
  evals: number;
}

function evaluate(ctx: Ctx, pose: PoseVec, level: number): number {
  ctx.evals++;
  applyPose(ctx.p, pose, ctx.attachments);
  const lv = ctx.levels[level];
  const s = score(ctx.p, lv);
  // §9.1's ink assertion, expressed at the level being evaluated.
  if (s.ink < 0.25 * lv.ink) return Infinity;
  return s.value;
}

function scanKnob(ctx: Ctx, pose: PoseVec, k: KnobDef, level: number, samples: number): void {
  let best = evaluate(ctx, pose, level);
  let bestV = pose[k.key];
  const step = (k.max - k.min) / samples;
  for (let i = 0; i <= samples; i++) {
    const v = k.min + i * step;
    pose[k.key] = v;
    const s = evaluate(ctx, pose, level);
    if (s < best) {
      best = s;
      bestV = v;
    }
  }
  pose[k.key] = bestV;
}

function refineKnob(ctx: Ctx, pose: PoseVec, k: KnobDef, level: number, radius: number, steps: number): number {
  let best = evaluate(ctx, pose, level);
  let bestV = pose[k.key];
  for (let i = -steps; i <= steps; i++) {
    if (i === 0) continue;
    const v = Math.max(k.min, Math.min(k.max, bestV + (i * radius) / steps));
    pose[k.key] = v;
    const s = evaluate(ctx, pose, level);
    if (s < best) {
      best = s;
      bestV = v;
    }
  }
  pose[k.key] = bestV;
  return best;
}

function scanPair(ctx: Ctx, pose: PoseVec, a: KnobDef, b: KnobDef, level: number, samples: number): void {
  let best = evaluate(ctx, pose, level);
  let bestA = pose[a.key];
  let bestB = pose[b.key];
  const sa = (a.max - a.min) / samples;
  const sb = (b.max - b.min) / samples;
  for (let i = 0; i <= samples; i++) {
    pose[a.key] = a.min + i * sa;
    for (let j = 0; j <= samples; j++) {
      pose[b.key] = b.min + j * sb;
      const s = evaluate(ctx, pose, level);
      if (s < best) {
        best = s;
        bestA = pose[a.key];
        bestB = pose[b.key];
      }
    }
  }
  pose[a.key] = bestA;
  pose[b.key] = bestB;
}

const KNOB_BY_KEY = new Map(KNOBS.map((k) => [k.key, k]));

export interface FitResult {
  pose: PoseVec;
  value: number;
  floor: number;
  evals: number;
  onBound: string[];
}

/**
 * Polish: local refinement only, at the two finest levels, every knob free.
 *
 * ⭐ This is the second half of the freeze, and the order matters. While the limbs
 * were wrong the composite would spend the trunk's measurement covering them
 * (§9.1's *sacrificial cover*), so the trunk was frozen. Once the limbs are seated
 * the trade reverses: the trunk's own residual is then the largest single drift in
 * the report and a **local** polish can only improve it, because there is no longer
 * a cliff within reach of a few pixels. So this mode never scans a range — it
 * refines, which cannot leave the basin the placements put it in.
 */
export function polishFrame(ctx: Ctx, start: PoseVec): FitResult {
  const pose = clampPose({ ...start });
  for (const level of [2, 3]) {
    for (let round = 0; round < 3; round++) {
      for (const k of KNOBS) {
        const radius = level === 2 ? (k.key.endsWith('.rotate') ? 6 : 18) : k.key.endsWith('.rotate') ? 2 : 6;
        refineKnob(ctx, pose, k, level, radius, 6);
      }
    }
  }
  const value = evaluate(ctx, pose, 3);
  const onBound = KNOBS.filter((k) => Math.abs(pose[k.key] - k.min) < 1e-6 || Math.abs(pose[k.key] - k.max) < 1e-6).map(
    (k) => k.key,
  );
  return { pose, value, floor: drawNothingFloor(ctx.levels[3]), evals: ctx.evals, onBound };
}

/** Coarse-to-fine, multi-start. `starts[0]` is the incumbent. */
export function fitFrame(ctx: Ctx, starts: PoseVec[], opts?: { quick?: boolean }): FitResult {
  const anchor = starts[0] ?? zeroPose();
  const screened = starts.map((s) => {
    const pose = clampPose({ ...s });
    for (const key of FROZEN) if (anchor[key] !== undefined) pose[key] = anchor[key];
    return { pose, value: evaluate(ctx, pose, opts?.quick ? 1 : 0) };
  });
  screened.sort((x, y) => x.value - y.value);
  const keep = screened.slice(0, Math.min(2, screened.length));

  let bestOverall: { pose: PoseVec; value: number } | null = null;
  for (const cand of keep) {
    const pose = cand.pose;
    for (let level = opts?.quick ? 1 : 0; level < 4; level++) {
      const active = KNOBS.filter((k) => k.from <= level && !FROZEN.has(k.key));
      const rounds = level >= 2 ? 2 : 1;
      for (let r = 0; r < rounds; r++) {
        if (level <= 1 && r === 0) {
          for (const k of active) scanKnob(ctx, pose, k, level, level === 0 ? 24 : 36);
          for (const [ak, bk] of PAIRS) {
            const a = KNOB_BY_KEY.get(ak)!;
            const b = KNOB_BY_KEY.get(bk)!;
            if (a.from <= level && b.from <= level) scanPair(ctx, pose, a, b, level, 12);
          }
        }
        for (const k of active) {
          const radius = level === 0 ? 60 : level === 1 ? 20 : level === 2 ? 8 : 3;
          refineKnob(ctx, pose, k, level, radius, 6);
        }
      }
    }
    const value = evaluate(ctx, pose, 3);
    if (!bestOverall || value < bestOverall.value) bestOverall = { pose: { ...pose }, value };
  }
  const pose = bestOverall!.pose;
  const onBound = KNOBS.filter((k) => Math.abs(pose[k.key] - k.min) < 1e-6 || Math.abs(pose[k.key] - k.max) < 1e-6).map(
    (k) => k.key,
  );
  return { pose, value: bestOverall!.value, floor: drawNothingFloor(ctx.levels[3]), evals: ctx.evals, onBound };
}

// ---------------------------------------------------------------------------
// the driver
// ---------------------------------------------------------------------------

export interface SetSpec {
  dir: string;
  frames: string[];
}

export function setsOf(): SetSpec[] {
  const sidecar = JSON.parse(readFileSync(join(REF, 'frames.json'), 'utf8'));
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  return sidecar.sets.map((s: { dir: string }) => ({
    dir: s.dir,
    frames: readdirSync(join(REF, s.dir))
      .filter((f: string) => /^f\d+\.png$/.test(f))
      .sort(),
  }));
}

if (import.meta.main) {
  const only = process.argv[2];
  const vp = readViewport(join(REF, 'frames.json'));
  const sizes = artSizes(IMAGES);
  const table: Table = JSON.parse(readFileSync(join(ROOT, 'fit/placements.json'), 'utf8'));
  const p = loadPosable(join(ROOT, 'spine'));
  const outDir = join(ROOT, 'fit/poses');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  for (const set of setsOf()) {
    if (only && !new RegExp(only).test(set.dir)) continue;
    const dest = join(outDir, `${set.dir.replace('@', '_at_')}.json`);
    const prior: Record<string, PoseVec> = existsSync(dest) ? JSON.parse(readFileSync(dest, 'utf8')) : {};
    const result: Record<string, PoseVec> = {};
    let prev: PoseVec | null = null;
    for (const file of set.frames) {
      const frame = file.replace('.png', '');
      const framePath = join(REF, set.dir, file);
      const key = `${set.dir}/${frame}`;
      const levels = refLevels(framePath, vp);
      const idx = set.frames.indexOf(file);
      const neighbours = [set.frames[idx - 1], set.frames[idx + 1]]
        .filter(Boolean)
        .map((f) => join(REF, set.dir, f as string));
      // §8's change weighting is for the SEARCH — it is what makes a passage whose
      // motion is a small part against a still body trackable at all. It is not what
      // `check` measures, so the polish runs unweighted, against the figure of record.
      if (!process.env.RIGC_RUN_POLISH) changeWeights(levels, neighbours);
      const ctx: Ctx = { p, levels, evals: 0 };
      const starts: PoseVec[] = [];
      if (prior[frame]) starts.push(prior[frame]);
      const row = table[key];
      if (row) starts.push(seedFromPose(row, vp, sizes));
      if (prev) starts.push(prev);
      starts.push(zeroPose());
      const t0 = Date.now();
      const r = process.env.RIGC_RUN_POLISH ? polishFrame(ctx, starts[0] ?? zeroPose()) : fitFrame(ctx, starts);
      result[frame] = r.pose;
      prev = r.pose;
      console.log(
        `${key.padEnd(22)} ${r.value.toFixed(3)}  floor ${r.floor.toFixed(3)}  ` +
          `${r.evals} evals  ${((Date.now() - t0) / 1000).toFixed(1)}s` +
          (r.onBound.length ? `  ON BOUND: ${r.onBound.join(',')}` : ''),
      );
      writeFileSync(dest, JSON.stringify(result, null, 1));
    }
    if (!existsSync(dirname(dest))) mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(result, null, 1));
  }
}
