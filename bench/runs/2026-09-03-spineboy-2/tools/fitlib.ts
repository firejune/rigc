/**
 * The render-back fitter — AUTHORING §8.1, implemented.
 *
 * The rules from that section this implements, each named where it is applied:
 *
 *  - "Fit the rendered composite, never a part on its own" — the objective is
 *    the whole frame, rendered through rigc's own rasteriser into the frames'
 *    own viewport.
 *  - "Compare at a reduced resolution first ... run the search coarse to fine" —
 *    `PYRAMID` below, and each level is a real render at that pixel size rather
 *    than a full render box-averaged down, which is the same picture for a third
 *    of the cost.
 *  - "The coarsest level is for the body and nothing else" — `level.knobs`
 *    gates which knobs a level is allowed to move.
 *  - "Scan each knob's whole plausible range. Do not line-search out from where
 *    it sits" — `scan()` evaluates the whole window every pass.
 *  - "Some knobs only decide together" — `pairs` scans two links of a chain
 *    over the grid.
 *  - "more than one start, screened coarsely" and "Keep the incumbent among the
 *    candidates" — `fitFrame(starts)`.
 *  - "Weight the objective by the reference's own frame-to-frame change" —
 *    `weightFromChange`.
 *  - the hip's soft rotation gauge is regularised rather than folded, at
 *    2e-5 per squared degree, which is the figure AUTHORING §10.3 states.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Physics, Skeleton, type SkeletonData } from '@esotericsoftware/spine-core';
import { Plate } from '../../../../tools/plate';
import { piecesOf, posableFromText, renderFrame, viewportOfSize, type Viewport } from '../../../../src/render';
import { BACKGROUND, MASK_TOLERANCE, changeMask, plateToRgb, reduce, reduceWeight, weightedMae } from './geom';

export const GAUGE_PENALTY_PER_SQ_DEG = 2e-5;

export interface Candidate {
  data: SkeletonData;
  pages: Map<string, Plate>;
  skeleton: Skeleton;
}

export function loadCandidate(dir: string): Candidate {
  const posable = posableFromText(
    readFileSync(join(dir, 'skeleton.json'), 'utf8'),
    readFileSync(join(dir, 'skeleton.atlas'), 'utf8'),
    dir,
  );
  return { data: posable.data, pages: posable.pages, skeleton: new Skeleton(posable.data) };
}

/** One bone channel the fitter may move. */
export interface Knob {
  bone: string;
  kind: 'rotate' | 'tx' | 'ty' | 'scale';
  /** Search window, absolute value of the channel (degrees, units, ratio). */
  min: number;
  max: number;
  /** Samples across the window on a full scan. */
  steps: number;
  /** Refinement radius and step for the fine passes. */
  fine: number;
}

export type Pose = Record<string, number>;

export const keyOf = (k: Knob): string => `${k.bone}.${k.kind}`;

/**
 * Apply a pose vector to the skeleton, as DELTAS from its setup pose — the same
 * convention `chainfit` reports `hingeDeg` in, "in Spine degrees relative to
 * the bone's setup rotation".
 *
 * ⚠️ The deltas are added to `bone.pose` immediately after
 * `Skeleton.setupPose()`, which is where the setup values are. `bone.data.x`,
 * `.y`, `.rotation` and `.scaleX` are all **undefined** on spine-core 4.3.13's
 * `BoneData` — reading them and adding produced `NaN` poses that rendered ZERO
 * pixels, which the fitter scored as an ordinary number and preferred to every
 * real pose. Cost one debugging round; the control is `tools/probe.ts`.
 */
export function applyPose(skeleton: Skeleton, pose: Pose): void {
  skeleton.setupPose();
  for (const bone of skeleton.bones) {
    const name = bone.data.name;
    const rot = pose[`${name}.rotate`];
    if (rot !== undefined) bone.pose.rotation += rot;
    const tx = pose[`${name}.tx`];
    if (tx !== undefined) bone.pose.x += tx;
    const ty = pose[`${name}.ty`];
    if (ty !== undefined) bone.pose.y += ty;
    const sc = pose[`${name}.scale`];
    if (sc !== undefined) {
      bone.pose.scaleX *= sc;
      bone.pose.scaleY *= sc;
    }
  }
  skeleton.update(0);
  skeleton.updateWorldTransform(Physics.reset);
}

/** Which attachment each slot shows, by name; `null` hides the slot. */
export type Skin = Record<string, string | null>;

/**
 * ⚠️ `setAttachment` is on the slot's POSE in spine-core 4.3, not on the slot
 * — `slot.setAttachment` is undefined and throws.
 */
export function applySkin(skeleton: Skeleton, skin: Skin): void {
  for (const [slotName, attachment] of Object.entries(skin)) {
    const slot = skeleton.findSlot(slotName);
    if (!slot) continue;
    slot.pose.setAttachment(attachment === null ? null : skeleton.getAttachment(slotName, attachment));
  }
}

export function renderPose(c: Candidate, viewport: Viewport): Plate {
  return renderFrame({ index: 0, time: 0, pieces: piecesOf(c.skeleton) }, c.pages, viewport, BACKGROUND);
}

// ---------------------------------------------------------------------------
// the pyramid
// ---------------------------------------------------------------------------

export interface Level {
  /** Integer reduction factor from the frames' own pixel grid. */
  factor: number;
  viewport: Viewport;
  /** Which knobs this level is allowed to move; `null` means all of them. */
  knobs: string[] | null;
  /**
   * `silhouette` = symmetric difference of the two inked sets over the
   * reference's own ink count; `colour` = the weighted mean absolute RGB
   * difference.
   *
   * 🚨 The coarse levels MUST be `silhouette`, and this is worth the field.
   * A colour mean over the whole frame has a strong minimum at DRAW NOTHING:
   * the figure is about 10k of 141k pixels, so a candidate parked outside the
   * viewport pays the reference's ink once while a candidate whose limbs are
   * in the wrong place pays it about twice. Measured here on `aim/f0000`: the
   * first coarse pass walked `torso.tx`/`ty` to the far corner of their
   * windows and reported 4.919 — a better number than any on-screen pose, for
   * an empty frame. The symmetric difference reads 1.0 for that pose by
   * construction, which is its worst value.
   */
  metric: 'silhouette' | 'colour';
}

export function levelsFor(
  declared: Viewport,
  plans: { factor: number; knobs: string[] | null; metric: 'silhouette' | 'colour' }[],
): Level[] {
  return plans.map((p) => ({
    factor: p.factor,
    knobs: p.knobs,
    metric: p.metric,
    viewport: viewportOfSize(
      declared.minX,
      declared.minY,
      declared.maxX - declared.minX,
      declared.maxY - declared.minY,
      declared.scale / p.factor,
      Math.max(1, Math.ceil(declared.width / p.factor)),
      Math.max(1, Math.ceil(declared.height / p.factor)),
    ),
  }));
}

export interface Target {
  /** The reference frame at each level, as rgb triples. */
  byLevel: Map<number, { w: number; h: number; rgb: Float32Array }>;
  weightByLevel: Map<number, Float32Array | null>;
  /** The reference's inked set at each level, and its count. */
  inkByLevel: Map<number, { mask: Uint8Array; count: number }>;
  /** The reference's ink centroid at full resolution, in frame pixels. */
  centroid: [number, number];
}

/** The ink threshold at a reduced level: box-averaging dilutes a thin part. */
export const REDUCED_INK_TOLERANCE = 3;

function inkOf(rgb: Float32Array, tol: number): { mask: Uint8Array; count: number } {
  const mask = new Uint8Array(rgb.length / 3);
  let count = 0;
  for (let i = 0, at = 0; i < rgb.length; i += 3, at++) {
    if (
      Math.abs(rgb[i] - BACKGROUND[0]) > tol ||
      Math.abs(rgb[i + 1] - BACKGROUND[1]) > tol ||
      Math.abs(rgb[i + 2] - BACKGROUND[2]) > tol
    ) {
      mask[at] = 1;
      count++;
    }
  }
  return { mask, count };
}

/**
 * The change weight: 1 everywhere, plus `boost` on the pixels the reference
 * itself changes between the frames bracketing this one.
 *
 * Not a pure change mask — a pure one loses the still majority that holds the
 * body in place, and §8.1 asks for the moving pixels to *carry* the objective,
 * not to be the whole of it.
 */
export function weightFromChange(frame: Plate, neighbours: Plate[], boost: number, tol = 8): Float32Array {
  const w = new Float32Array(frame.width * frame.height).fill(1);
  for (const n of neighbours) {
    const m = changeMask(frame, n, tol);
    for (let i = 0; i < w.length; i++) if (m[i]) w[i] = boost;
  }
  return w;
}

export function targetFor(frame: Plate, levels: Level[], weight: Float32Array | null): Target {
  const byLevel = new Map<number, { w: number; h: number; rgb: Float32Array }>();
  const weightByLevel = new Map<number, Float32Array | null>();
  const inkByLevel = new Map<number, { mask: Uint8Array; count: number }>();
  for (const level of levels) {
    if (level.factor === 1) {
      byLevel.set(1, { w: frame.width, h: frame.height, rgb: plateToRgb(frame) });
      weightByLevel.set(1, weight);
    } else {
      byLevel.set(level.factor, reduce(frame, level.factor));
      weightByLevel.set(
        level.factor,
        weight ? reduceWeight(weight, frame.width, frame.height, level.factor).v : null,
      );
    }
    const at = byLevel.get(level.factor);
    if (at) inkByLevel.set(level.factor, inkOf(at.rgb, level.factor === 1 ? MASK_TOLERANCE : REDUCED_INK_TOLERANCE));
  }
  const full = inkByLevel.get(1) ?? inkOf(byLevel.get(levels[0].factor)?.rgb ?? new Float32Array(0), MASK_TOLERANCE);
  let sx = 0;
  let sy = 0;
  let n = 0;
  const w = byLevel.get(1)?.w ?? frame.width;
  for (let i = 0; i < full.mask.length; i++) {
    if (!full.mask[i]) continue;
    sx += i % w;
    sy += Math.floor(i / w);
    n++;
  }
  return { byLevel, weightByLevel, inkByLevel, centroid: n === 0 ? [0, 0] : [sx / n, sy / n] };
}

// ---------------------------------------------------------------------------
// the objective
// ---------------------------------------------------------------------------

export interface Objective {
  (pose: Pose, level: Level): number;
}

/**
 * ⚠️ The skin is applied INSIDE the objective, after the pose.
 * `Skeleton.setupPose()` resets the slots as well as the bones, so a skin set
 * once outside the loop is silently gone by the first evaluation — which reads
 * as a fit that cannot find the muzzle flare anywhere.
 */
export function objectiveFor(c: Candidate, target: Target, skin: Skin = {}, gaugeBones: string[] = []): Objective {
  let calls = 0;
  const hasSkin = Object.keys(skin).length > 0;
  const fn = (pose: Pose, level: Level): number => {
    calls++;
    applyPose(c.skeleton, pose);
    if (hasSkin) applySkin(c.skeleton, skin);
    const plate = renderPose(c, level.viewport);
    const ref = target.byLevel.get(level.factor);
    if (!ref) throw new Error(`no target at level ${level.factor}`);
    const mine = plateToRgb(plate);
    let score: number;
    if (level.metric === 'silhouette') {
      const ink = target.inkByLevel.get(level.factor);
      if (!ink) throw new Error(`no ink mask at level ${level.factor}`);
      const tol = level.factor === 1 ? MASK_TOLERANCE : REDUCED_INK_TOLERANCE;
      let sym = 0;
      for (let i = 0, at = 0; i < mine.length; i += 3, at++) {
        const drawn =
          Math.abs(mine[i] - BACKGROUND[0]) > tol ||
          Math.abs(mine[i + 1] - BACKGROUND[1]) > tol ||
          Math.abs(mine[i + 2] - BACKGROUND[2]) > tol
            ? 1
            : 0;
        if (drawn !== ink.mask[at]) sym++;
      }
      score = ink.count === 0 ? sym : sym / ink.count;
    } else {
      score = weightedMae(mine, ref.rgb, target.weightByLevel.get(level.factor) ?? null);
    }
    for (const bone of gaugeBones) {
      const v = pose[`${bone}.rotate`] ?? 0;
      score += GAUGE_PENALTY_PER_SQ_DEG * v * v;
    }
    return score;
  };
  (fn as Objective & { calls: () => number }).calls = () => calls;
  return fn as Objective;
}

// ---------------------------------------------------------------------------
// the search
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** One knob, scanned across its whole window. Returns the best value found. */
function scanKnob(obj: Objective, level: Level, pose: Pose, knob: Knob, samples: number): { value: number; score: number } {
  const key = keyOf(knob);
  const incumbent = pose[key] ?? 0;
  let best = incumbent;
  let bestScore = obj(pose, level);
  for (let i = 0; i <= samples; i++) {
    const v = knob.min + ((knob.max - knob.min) * i) / samples;
    pose[key] = v;
    const s = obj(pose, level);
    if (s < bestScore) {
      bestScore = s;
      best = v;
    }
  }
  pose[key] = best;
  return { value: best, score: bestScore };
}

/** One knob, refined locally around where it sits. */
function refineKnob(obj: Objective, level: Level, pose: Pose, knob: Knob, radius: number, steps: number): number {
  const key = keyOf(knob);
  const at = pose[key] ?? 0;
  let best = at;
  let bestScore = obj(pose, level);
  for (let i = -steps; i <= steps; i++) {
    if (i === 0) continue;
    const v = clamp(at + (radius * i) / steps, knob.min, knob.max);
    pose[key] = v;
    const s = obj(pose, level);
    if (s < bestScore) {
      bestScore = s;
      best = v;
    }
  }
  pose[key] = best;
  return bestScore;
}

/** Two knobs of one chain, over the grid — §8.1's "some knobs only decide together". */
function scanPair(obj: Objective, level: Level, pose: Pose, a: Knob, b: Knob, samples: number): number {
  const ka = keyOf(a);
  const kb = keyOf(b);
  let bestA = pose[ka] ?? 0;
  let bestB = pose[kb] ?? 0;
  let bestScore = obj(pose, level);
  for (let i = 0; i <= samples; i++) {
    pose[ka] = a.min + ((a.max - a.min) * i) / samples;
    for (let j = 0; j <= samples; j++) {
      pose[kb] = b.min + ((b.max - b.min) * j) / samples;
      const s = obj(pose, level);
      if (s < bestScore) {
        bestScore = s;
        bestA = pose[ka];
        bestB = pose[kb];
      }
    }
  }
  pose[ka] = bestA;
  pose[kb] = bestB;
  return bestScore;
}

export interface FitPlan {
  knobs: Knob[];
  /** Chains scanned as pairs at the level whose cells are smaller than the part. */
  pairs: [string, string][];
  levels: Level[];
  /** Knobs frozen at their incoming value — §8.1's "freeze the chains that have converged". */
  frozen?: Set<string>;
  /** Coarse-scan sample counts per level factor. */
  samples?: Record<number, number>;
  /** Grid resolution for a pair scan, per level factor. */
  pairSamples?: Record<number, number>;
  sweeps?: number;
}

export interface FitResult {
  pose: Pose;
  score: number;
  evaluations: number;
  /** Which start this answer came out of — the caller labels them. */
  startIndex: number;
}

/** Screen several starts through the coarse levels only, then finish the best. */
export function fitFrame(obj: Objective, plan: FitPlan, starts: Pose[], keep = 2): FitResult {
  const coarse = plan.levels[0];
  const scored = starts.map((s, at) => ({ pose: { ...s }, score: obj(s, coarse), at }));
  scored.sort((a, b) => a.score - b.score);
  const finalists = scored.slice(0, Math.max(1, keep));

  let best: FitResult | null = null;
  for (const finalist of finalists) {
    const pose = { ...finalist.pose };
    for (const level of plan.levels) {
      const samples = plan.samples?.[level.factor] ?? 24;
      const active = plan.knobs.filter(
        (k) => (level.knobs === null || level.knobs.includes(keyOf(k))) && !plan.frozen?.has(keyOf(k)),
      );
      const pairSamples = plan.pairSamples?.[level.factor] ?? Math.max(6, samples >> 1);
      for (let sweep = 0; sweep < (plan.sweeps ?? 2); sweep++) {
        if (sweep === 0 && pairSamples > 0) {
          for (const [aName, bName] of plan.pairs) {
            const a = active.find((k) => keyOf(k) === aName);
            const b = active.find((k) => keyOf(k) === bName);
            if (a && b) scanPair(obj, level, pose, a, b, pairSamples);
          }
        }
        for (const knob of active) {
          // A full scan the first time a knob is active AT THIS LEVEL, then
          // refinement. Scanning only at the first level would leave every limb
          // knob unscanned, because the coarsest level moves the body alone.
          if (sweep === 0) scanKnob(obj, level, pose, knob, samples);
          else refineKnob(obj, level, pose, knob, knob.fine, 4);
        }
      }
    }
    const score = obj(pose, plan.levels[plan.levels.length - 1]);
    if (!best || score < best.score) best = { pose, score, evaluations: 0, startIndex: finalist.at };
  }
  if (!best) throw new Error('no starts');
  return best;
}
