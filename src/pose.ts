/**
 * pose — where each loose part sits in one pose frame.
 *
 * ⭐ This is an ENTRY instrument, and the distinction decides every choice below.
 * The user hands over a condition — "here is the pose I want" as a picture — and
 * an agent has to turn it into spec coordinates. Nothing here grades anything:
 * the poses become inputs the spec then states by construction, so no pass bar
 * attaches to any number this file produces. The residual exists so the agent
 * knows **how much to trust** a placement and **where two answers are equally
 * good**, which is a different job from scoring and needs the opposite defaults.
 *
 * What that means in practice: a refusal names the part and the reason and still
 * prints the best it found, an ambiguity reports BOTH optima rather than picking,
 * and a part whose rotation genuinely does not matter is reported as having a free
 * degree of freedom instead of a bad one.
 *
 * 🔍 The estimator. For every part PNG it searches the rigid family
 * (translation, one rotation, one uniform scale) for the placement whose pixels
 * best explain the frame's pixels **inside the part's own alpha footprint**. The
 * objective is an alpha-weighted mean absolute colour error in 0..1:
 *
 *   err(part pixel) = material · |partRGB − frameRGB| / 255   +   (1 − material)
 *
 * where `material` is how much of the frame is *not* background there — so a part
 * pixel hanging over the background, or off the canvas entirely, costs the maximum
 * 1 rather than whatever colour distance the background happens to give.
 * Normalising by the part's own alpha weight is what makes residuals comparable
 * between a thumb and a torso.
 *
 * ⚠️ Measuring on the part's own footprint is also the only occlusion robustness
 * here, and it is deliberately not a solver. A part drawn *behind* another in the
 * frame has the occluder's pixels where its own should be, so its residual rises
 * even at the correct placement. `unexplained` separates the two readings: a low
 * residual is a confident placement, a middling residual with a high `unexplained`
 * is usually a correct placement seen through something else. Weigh accordingly;
 * do not read either as a verdict.
 *
 * Coordinates are the frame's own: **frame pixels, y down, origin top-left**, the
 * same convention a cut manifest uses. `rotationDeg` is screen degrees — positive
 * turns clockwise on screen — so `screenToSpineDegrees` in `src/transform.ts` is
 * the one conversion to Spine's y-up CCW world, and `cropToSpineY` the other.
 *
 * ⭐ **This file owns the objective, and `src/chainfit.ts` borrows it rather than
 * holding a second opinion about it.** The pixel machinery below — the background
 * read, the material plate, the alpha-weighted halving, the sample sets and the
 * two error functions — is exported for exactly one caller, whose whole claim is
 * that it is *this* estimator with the occluders taken out of the denominator. Two
 * implementations of "how well does this part explain these pixels" would make the
 * two instruments' residuals incomparable, which is the one thing a caller reading
 * both of them needs them not to be. What `chainfit` does NOT borrow is the search:
 * it has the candidate rig, so it searches one degree of freedom where this file
 * searches four.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Plate, readPlate } from '../tools/plate.ts';
// The rasteriser's sampler rather than a second one written here: how a pixel is
// read between two pixel centres is exactly the kind of thing two
// implementations drift on.
//
// ⚠️ `bilinearChannels`, NOT `bilinear`. `bilinear` interpolates in
// premultiplied space, which is correct for an atlas and wrong for what this
// file samples: `materialPlate` hands it the frame's own RGB with alpha rewritten
// to mean "how much material is here", so the two are decoupled by construction
// and `errBilinear` combines them itself. Issue #292 moved `bilinear` to the
// premultiplied form and left this call on the channel-independent one — the
// objective's own semantics, and unchanged fitting numbers with it.
import { bilinearChannels } from './render.ts';

export class PoseError extends Error {}

/** The `spec` field every report carries, so a consumer can refuse a future shape. */
export const POSE_SPEC = 'rigc-pose/1';

// ---------------------------------------------------------------------------
// the constants the search is made of — every one of them is reported
// ---------------------------------------------------------------------------
//
// They are exported because a number that steers a refusal has to be quotable:
// the docs cite them, the selftest states its tolerances against them, and the
// report repeats the ones a caller can move.

/**
 * Longest side, in pixels, the coarse scan would like to reduce the FRAME to.
 *
 * A ceiling on the pyramid, not the level the scan runs at — `COARSE_PART_SPAN`
 * can overrule it downward, because a level that has reduced the part to three
 * pixels tells nobody anything about where the part is.
 */
export const COARSE_LONG_SIDE = 40;

/**
 * Pixels the PART must still span at the level the coarse scan runs at.
 *
 * ⚠️ The other half of choosing that level, and the half a frame-only rule gets
 * wrong. Measured: on a 1600x1200 frame the frame rule alone picks a 64x
 * reduction, at which a 120x180 part is 2x3 pixels sampled six times — no signal
 * at all, and eight such parts came back with the wrong scale and a position out
 * by seventeen pixels. The coarse level is therefore the coarser of "the frame
 * fits in COARSE_LONG_SIDE" and "the part still spans this much".
 */
export const COARSE_PART_SPAN = 10;

/**
 * Coarse anchor positions are stepped at a fraction of the part's own size.
 *
 * The objective varies over distances of order the part, not of order a pixel, so
 * scanning every pixel of the coarse level buys resolution the refinement stages
 * supply anyway — and it is what makes the scan's cost grow with the frame's area
 * instead of with the number of places the part could plausibly be.
 */
export const COARSE_STRIDE_FRACTION = 0.25;

/** How many scale rungs one octave gets in the coarse ladder. */
export const SCALE_STEPS_PER_OCTAVE = 3;

/** The coarse rotation ladder's step, in degrees. */
export const COARSE_ROTATION_STEP = 15;

/** Default scale window, as frame pixels per part pixel. */
export const DEFAULT_SCALE_MIN = 0.5;
export const DEFAULT_SCALE_MAX = 2;

/**
 * Above this residual the placement is refused by name rather than reported flat.
 *
 * ⚠️ Not a pass bar. It is where "this part is somewhere in this picture" stops
 * being a claim worth making — a foreign part scores far above it and a real one
 * far below, and the report carries the number either way so a caller who
 * disagrees can read past the refusal.
 */
export const DEFAULT_MAX_RESIDUAL = 0.25;

/** Two optima this close are reported as both, never as one. Absolute, then relative to the best. */
export const AMBIGUITY_ABSOLUTE = 0.01;
export const AMBIGUITY_RELATIVE = 0.2;

/**
 * Max self-residual under rotation, relative to the identity, for a part to be
 * called rotation-free.
 *
 * The gap it sits in is wide, which is why one number can hold it: on the
 * selftest's own art a smooth 32px ball reads 0.014 and the least distinctive
 * non-round part in the set — a two-tone head — reads 0.307. Anything with a
 * corner, a silhouette or an off-centre feature is an order of magnitude clear
 * of this line.
 */
export const ROTATION_FREE_TOLERANCE = 0.04;

/** Per-pixel error above which a pixel counts toward `unexplained`. */
export const UNEXPLAINED_TOLERANCE = 0.15;

/** Mean absolute channel distance, 0..255, within which a frame pixel counts as background. */
export const BACKGROUND_TOLERANCE = 10;

/** Share of the frame's border ring one colour must hold before it is called the background. */
export const BACKGROUND_BORDER_SHARE = 0.6;

/** How many distinct places each coarse scale rung sends down for refinement. */
const MINIMA_PER_SCALE = 3;

/** How many candidates survive each refinement level. */
const REFINE_CANDIDATES = 12;

/** Sample budgets per stage. The reported residual uses every pixel regardless. */
const COARSE_SAMPLES = 96;
const REFINE_SAMPLES = 384;
const POLISH_SAMPLES = 2048;

/** Alternates beyond this many are not printed; the count is still stated. */
const MAX_ALTERNATES = 3;

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// the report
// ---------------------------------------------------------------------------

export interface PoseBackground {
  kind: 'transparent' | 'colour' | 'unknown';
  /** The background colour, when there is one. */
  colour: [number, number, number] | null;
  /** Share of the one-pixel border ring that agreed with the verdict, 0..1. */
  borderShare: number;
  /** Share of the frame that counts as material, 0..1. */
  materialShare: number;
}

/** One rigid placement of one part, in frame pixels, y down, origin top-left. */
export interface PosePlacement {
  /** Where the part image's own centre — `(width/2, height/2)` — lands. */
  x: number;
  y: number;
  /** Screen degrees: positive turns clockwise on screen. `screenToSpineDegrees` converts. */
  rotationDeg: number;
  /** Uniform, as frame pixels per part pixel. */
  scale: number;
  /** Alpha-weighted mean absolute error over the part's own footprint, 0..1. Lower is better explained. */
  residual: number;
  /** Share of the part's alpha weight whose per-pixel error clears `UNEXPLAINED_TOLERANCE`. Occlusion shows up here. */
  unexplained: number;
  /** Share of the part's alpha weight that lands outside the frame canvas. */
  offCanvas: number;
  /** Frame pixels of material this placement accounts for — the tie-break between equal residuals. */
  footprint: number;
  /** Axis-aligned box the placed part's material occupies, frame pixels. */
  bbox: { x: number; y: number; width: number; height: number };
}

export type PoseRefusalReason = 'empty-part' | 'larger-than-canvas' | 'no-match';

export interface PoseRefusal {
  reason: PoseRefusalReason;
  detail: string;
}

export interface PosePart {
  /** The PNG's file name — how the report names the part everywhere. */
  part: string;
  path: string;
  width: number;
  height: number;
  /**
   * Why this part's answer should not be taken at face value, or `null`.
   *
   * ⚠️ `placement` is still filled in under a `no-match` refusal, on purpose: a
   * refusal here names why you should not trust a number, it does not hide it.
   * `empty-part` and `larger-than-canvas` leave it `null` because nothing was
   * searched.
   */
  refusal: PoseRefusal | null;
  placement: PosePlacement | null;
  /** Other optima worth reporting, best first. Non-empty means the answer was not unique. */
  alternates: PosePlacement[];
  /** True when at least one alternate sits inside the ambiguity margin. */
  ambiguous: boolean;
  /** True when the part is self-similar under rotation, so `rotationDeg` is yours to choose. */
  rotationFree: boolean;
  /**
   * Worst residual the part scores against itself over eleven rotations, 0..1.
   *
   * The number `rotationFree` is a threshold on — reported because "how round is
   * this part" is a spectrum, and a part just over the line is worth knowing about.
   */
  rotationSelfSimilarity: number;
  /**
   * The grid this part was actually looked for on: the frame reduction the
   * exhaustive pass ran at, its anchor grid, and the step between anchors in
   * those reduced pixels. A coarse grid of a handful of cells is a warning that
   * the part is small relative to the frame and the first pass had little to go on.
   */
  coarse: { reduction: number; cols: number; rows: number; stride: number } | null;
  /** Plain-language versions of everything above, in the order they were found. */
  notes: string[];
}

export interface PoseSearch {
  scale: { min: number; max: number; steps: number };
  rotation: { minDeg: number; maxDeg: number; stepDeg: number; steps: number };
  /**
   * How the exhaustive first pass was sized. The level it runs at is chosen PER
   * PART — see `PosePart.coarse` — because it depends on how big the part is.
   */
  coarse: { frameLongSide: number; partSpan: number; strideFraction: number; framePyramid: number };
  maxResidual: number;
  ambiguity: { absolute: number; relative: number };
}

export interface PoseReport {
  spec: string;
  /** The coordinate contract, spelled out in the file rather than assumed. */
  space: string;
  images: string;
  frame: { path: string; width: number; height: number; background: PoseBackground };
  search: PoseSearch;
  /** What the numbers above cannot see. Read before consuming them. */
  caveats: string[];
  parts: PosePart[];
}

export interface PoseOptions {
  /** Directory of loose part PNGs. */
  imagesDir: string;
  /** One pose frame. */
  framePath: string;
  /**
   * The parts to place, when the caller already knows which they are. Default:
   * every `.png` in `imagesDir`, in name order — which is what the CLI does.
   *
   * ⭐ The one thing `src/chainfit.ts` needs from this signature. It holds a
   * candidate rig, so it knows exactly which images are parts and which of the
   * directory's PNGs the figure never draws, and searching the rest would spend
   * the pass and add refusals to read past. A directory is still the CLI's
   * contract — this narrows it, it does not replace it.
   */
  parts?: string[];
  scale?: { min: number; max: number };
  rotation?: { minDeg: number; maxDeg: number };
  maxResidual?: number;
}

// ---------------------------------------------------------------------------
// pixels
// ---------------------------------------------------------------------------

/** One rung of a plate pyramid, flattened for the inner loops. */
export interface Level {
  data: Uint8Array;
  width: number;
  height: number;
  /** Full-resolution pixels per pixel of this level. */
  reduction: number;
}

export function levelOf(plate: Plate, reduction: number): Level {
  return { data: plate.data, width: plate.width, height: plate.height, reduction };
}

/**
 * Box-filter one plate down by two.
 *
 * RGB is averaged **weighted by alpha** and alpha plainly: averaging colour
 * straight would drag every edge pixel toward whatever the transparent
 * neighbour happens to store, which for a cut-out part is usually black.
 */
export function halvePlate(src: Plate): Plate {
  const w = Math.max(1, src.width >> 1);
  const h = Math.max(1, src.height >> 1);
  const out = new Plate(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sa = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let dy = 0; dy < 2; dy++) {
        const sy = Math.min(src.height - 1, y * 2 + dy);
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(src.width - 1, x * 2 + dx);
          const i = (sy * src.width + sx) * 4;
          const a = src.data[i + 3];
          sa += a;
          sr += src.data[i] * a;
          sg += src.data[i + 1] * a;
          sb += src.data[i + 2] * a;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o + 3] = Math.round(sa / n);
      if (sa > 0) {
        out.data[o] = Math.round(sr / sa);
        out.data[o + 1] = Math.round(sg / sa);
        out.data[o + 2] = Math.round(sb / sa);
      }
    }
  }
  return out;
}

/** `plate`, then every halving of it down to `minLongSide`, capped at `maxLevels`. */
function pyramid(plate: Plate, maxLevels: number, minLongSide: number): Plate[] {
  const out = [plate];
  while (out.length <= maxLevels) {
    const top = out[out.length - 1];
    if (Math.max(top.width, top.height) <= minLongSide) break;
    if (top.width < 2 || top.height < 2) break;
    out.push(halvePlate(top));
  }
  return out;
}

/**
 * What the frame's background is, read off its one-pixel border ring.
 *
 * ⭐ Why the background matters at all: without it, a grey part placed on grey
 * emptiness scores as well as a grey part placed on the grey figure, and the
 * whole silhouette signal is gone. With it, "the frame has nothing here" is the
 * maximum error rather than a lucky colour match.
 *
 * A border that is not dominated by one colour is reported `unknown` rather than
 * guessed at — the objective then reduces to plain colour matching, which is a
 * weaker instrument, and the report says so instead of quietly being weaker.
 */
export function readBackground(frame: Plate): PoseBackground {
  const w = frame.width;
  const h = frame.height;
  let ringCount = 0;
  let transparent = 0;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  const visit = (x: number, y: number): void => {
    const i = (y * w + x) * 4;
    ringCount++;
    if (frame.data[i + 3] < 8) {
      transparent++;
      return;
    }
    const r = frame.data[i];
    const g = frame.data[i + 1];
    const b = frame.data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cell = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cell.n++;
    cell.r += r;
    cell.g += g;
    cell.b += b;
    buckets.set(key, cell);
  };
  for (let x = 0; x < w; x++) {
    visit(x, 0);
    if (h > 1) visit(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    visit(0, y);
    if (w > 1) visit(w - 1, y);
  }
  if (ringCount === 0) return { kind: 'unknown', colour: null, borderShare: 0, materialShare: 1 };
  if (transparent / ringCount >= 0.5) {
    return { kind: 'transparent', colour: null, borderShare: transparent / ringCount, materialShare: 0 };
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const cell of buckets.values()) if (best === null || cell.n > best.n) best = cell;
  if (best === null || best.n / ringCount < BACKGROUND_BORDER_SHARE) {
    return { kind: 'unknown', colour: null, borderShare: best ? best.n / ringCount : 0, materialShare: 1 };
  }
  return {
    kind: 'colour',
    colour: [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)],
    borderShare: best.n / ringCount,
    materialShare: 0,
  };
}

/**
 * The frame as the objective reads it: the frame's own RGB, with alpha rewritten
 * to mean **how much material is here** rather than how opaque the file is.
 *
 * Keeping it in a `Plate` is what lets the pyramid, `bilinearChannels` and the nearest
 * lookup all be the ones this repository already has.
 */
export function materialPlate(frame: Plate, background: PoseBackground): { plate: Plate; share: number } {
  const out = new Plate(frame.width, frame.height);
  let material = 0;
  const bg = background.colour;
  for (let i = 0; i < frame.data.length; i += 4) {
    const a = frame.data[i + 3];
    out.data[i] = frame.data[i];
    out.data[i + 1] = frame.data[i + 1];
    out.data[i + 2] = frame.data[i + 2];
    let m: number;
    if (background.kind === 'transparent') {
      m = a;
    } else if (background.kind === 'colour' && bg !== null) {
      const d = (Math.abs(frame.data[i] - bg[0]) + Math.abs(frame.data[i + 1] - bg[1]) + Math.abs(frame.data[i + 2] - bg[2])) / 3;
      m = d > BACKGROUND_TOLERANCE ? a : 0;
    } else {
      m = a;
    }
    out.data[i + 3] = m;
    material += m / 255;
  }
  return { plate: out, share: material / Math.max(1, frame.width * frame.height) };
}

/** The box the part's material occupies, in part pixels. `null` when there is none. */
function materialBox(part: Plate): { minX: number; minY: number; maxX: number; maxY: number; weight: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let weight = 0;
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      const a = part.data[(y * part.width + x) * 4 + 3];
      if (a === 0) continue;
      weight += a / 255;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (weight === 0) return null;
  return { minX, minY, maxX: maxX + 1, maxY: maxY + 1, weight };
}

// ---------------------------------------------------------------------------
// the objective
// ---------------------------------------------------------------------------

/**
 * The part, reduced to a list of coloured offsets from its anchor.
 *
 * Offsets are in **full-resolution part pixels** whatever mip they were read
 * from, so one sample set is valid at every search level: the level only decides
 * what the offsets get divided by on the way in.
 */
export interface Samples {
  u: Float64Array;
  v: Float64Array;
  r: Float64Array;
  g: Float64Array;
  b: Float64Array;
  w: Float64Array;
  count: number;
  weight: number;
}

const EMPTY_SAMPLES: Samples = {
  u: new Float64Array(0),
  v: new Float64Array(0),
  r: new Float64Array(0),
  g: new Float64Array(0),
  b: new Float64Array(0),
  w: new Float64Array(0),
  count: 0,
  weight: 0,
};

/**
 * Pick at most `cap` of a mip's material pixels, by a fixed stride over the
 * material list.
 *
 * Deterministic on purpose — `src/` has no randomness, and a sampler that
 * shuffled would make two runs of the same command disagree in the last decimal
 * of every residual.
 */
export function buildSamples(mip: Plate, reduction: number, anchorX: number, anchorY: number, cap: number): Samples {
  const idx: number[] = [];
  for (let y = 0; y < mip.height; y++) {
    for (let x = 0; x < mip.width; x++) {
      if (mip.data[(y * mip.width + x) * 4 + 3] > 0) idx.push(y * mip.width + x);
    }
  }
  if (idx.length === 0) return EMPTY_SAMPLES;
  const count = Math.min(cap, idx.length);
  const s: Samples = {
    u: new Float64Array(count),
    v: new Float64Array(count),
    r: new Float64Array(count),
    g: new Float64Array(count),
    b: new Float64Array(count),
    w: new Float64Array(count),
    count,
    weight: 0,
  };
  for (let k = 0; k < count; k++) {
    const at = idx[Math.floor((k * idx.length) / count)];
    const px = at % mip.width;
    const py = (at - px) / mip.width;
    const i = at * 4;
    s.u[k] = (px + 0.5) * reduction - anchorX;
    s.v[k] = (py + 0.5) * reduction - anchorY;
    s.r[k] = mip.data[i];
    s.g[k] = mip.data[i + 1];
    s.b[k] = mip.data[i + 2];
    s.w[k] = mip.data[i + 3] / 255;
    s.weight += s.w[k];
  }
  return s;
}

/** Error of one part pixel against the level, nearest neighbour. 1 outside the canvas. */
export function errNearest(level: Level, x: number, y: number, pr: number, pg: number, pb: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= level.width || iy >= level.height) return 1;
  const i = (iy * level.width + ix) * 4;
  const m = level.data[i + 3] / 255;
  if (m <= 0) return 1;
  const d = (Math.abs(level.data[i] - pr) + Math.abs(level.data[i + 1] - pg) + Math.abs(level.data[i + 2] - pb)) / 765;
  return m * d + (1 - m);
}

/** Same, sampled between pixel centres — what the refinement stages measure with. */
export function errBilinear(level: Level, plate: Plate, x: number, y: number, pr: number, pg: number, pb: number): number {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return 1;
  const [fr, fg, fb, fa] = bilinearChannels(plate, x - 0.5, y - 0.5);
  const m = fa / 255;
  if (m <= 0) return 1;
  const d = (Math.abs(fr - pr) + Math.abs(fg - pg) + Math.abs(fb - pb)) / 765;
  return m * d + (1 - m);
}

/** A placement mid-search: the anchor's position at some level, plus the two other degrees of freedom. */
interface Candidate {
  /** Anchor position in the level's own pixels. */
  cx: number;
  cy: number;
  rotDeg: number;
  /** Frame pixels per part pixel, at FULL resolution — level-independent. */
  scale: number;
  residual: number;
}

function residualAt(level: Level, plate: Plate, s: Samples, cand: Candidate, smooth: boolean): number {
  if (s.count === 0) return 1;
  const k = cand.scale / level.reduction;
  const cos = Math.cos(cand.rotDeg * DEG) * k;
  const sin = Math.sin(cand.rotDeg * DEG) * k;
  let acc = 0;
  for (let i = 0; i < s.count; i++) {
    const fx = cand.cx + s.u[i] * cos - s.v[i] * sin;
    const fy = cand.cy + s.u[i] * sin + s.v[i] * cos;
    acc += s.w[i] * (smooth ? errBilinear(level, plate, fx, fy, s.r[i], s.g[i], s.b[i]) : errNearest(level, fx, fy, s.r[i], s.g[i], s.b[i]));
  }
  return acc / s.weight;
}

// ---------------------------------------------------------------------------
// the search
// ---------------------------------------------------------------------------

/**
 * Every anchor cell of the coarse level, holding the best (rotation, scale) found
 * for it.
 *
 * A per-cell best rather than a global top-K, because the thing this instrument
 * must not lose is the SECOND place a part could sit — and a global top-K fills
 * up with a hundred neighbours of the single best cell before it ever reaches it.
 */
interface CoarseField {
  residual: Float64Array;
  rotDeg: Float64Array;
  scale: number;
  /** Grid size, which is the LEVEL's size divided by `stride`. */
  cols: number;
  rows: number;
  /** Level pixels per grid step. */
  stride: number;
}

/**
 * One field per scale rung, and that separation is the load-bearing part.
 *
 * 🚨 A coarse level cannot compare scales. At a 4x reduction a striped torso and
 * a ringed ball are both near-uniform blobs, so the rung that scores best on one
 * is whichever fits deepest inside it — the smallest — and folding all rungs into
 * one field bakes that preference in before any level with detail gets a vote.
 * Keeping the fields apart means the coarse scan only ever answers the question it
 * CAN answer — "given this size, where and at what angle?" — and every rung sends
 * its own best guesses down to the levels that can tell them apart. Measured on
 * the fixture, folding them cost a torso its scale (0.59 against a true 1.15) and
 * cost the estimator one of two identical arms.
 */
function coarseScan(level: Level, s: Samples, scale: number, rotations: number[], stride: number): CoarseField {
  const cols = Math.max(1, Math.ceil(level.width / stride));
  const rows = Math.max(1, Math.ceil(level.height / stride));
  const field: CoarseField = {
    residual: new Float64Array(cols * rows).fill(Infinity),
    rotDeg: new Float64Array(cols * rows),
    scale,
    cols,
    rows,
    stride,
  };
  if (s.count === 0) return field;
  const k = scale / level.reduction;
  for (const rotDeg of rotations) {
    const cos = Math.cos(rotDeg * DEG) * k;
    const sin = Math.sin(rotDeg * DEG) * k;
    const dx = new Float64Array(s.count);
    const dy = new Float64Array(s.count);
    for (let i = 0; i < s.count; i++) {
      dx[i] = s.u[i] * cos - s.v[i] * sin;
      dy[i] = s.u[i] * sin + s.v[i] * cos;
    }
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const cell = gy * cols + gx;
        // The bound is this cell's own best so far: anything that cannot beat
        // it changes nothing, so the loop may leave the moment it passes it.
        const bound = field.residual[cell] * s.weight;
        const ax = gx * stride + stride / 2;
        const ay = gy * stride + stride / 2;
        let acc = 0;
        let beaten = false;
        for (let i = 0; i < s.count; i++) {
          acc += s.w[i] * errNearest(level, ax + dx[i], ay + dy[i], s.r[i], s.g[i], s.b[i]);
          if ((i & 15) === 15 && acc >= bound) {
            beaten = true;
            break;
          }
        }
        if (beaten) continue;
        const residual = acc / s.weight;
        if (residual < field.residual[cell]) {
          field.residual[cell] = residual;
          field.rotDeg[cell] = rotDeg;
        }
      }
    }
  }
  return field;
}

/**
 * The distinct places a part could sit, best first.
 *
 * A cell survives when nothing within `radius` beats it — the two-arms case is
 * exactly two such cells — and the accepted list then keeps them apart so the
 * refinement budget is not spent twice on one hill.
 */
function localMinima(field: CoarseField, radius: number, keep: number): Candidate[] {
  const found: Candidate[] = [];
  for (let gy = 0; gy < field.rows; gy++) {
    for (let gx = 0; gx < field.cols; gx++) {
      const here = field.residual[gy * field.cols + gx];
      if (!Number.isFinite(here)) continue;
      let minimal = true;
      for (let dy = -radius; dy <= radius && minimal; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= field.cols || ny >= field.rows) continue;
          if (field.residual[ny * field.cols + nx] < here) {
            minimal = false;
            break;
          }
        }
      }
      if (!minimal) continue;
      const cell = gy * field.cols + gx;
      found.push({
        cx: gx * field.stride + field.stride / 2,
        cy: gy * field.stride + field.stride / 2,
        rotDeg: field.rotDeg[cell],
        scale: field.scale,
        residual: here,
      });
    }
  }
  found.sort((a, b) => a.residual - b.residual);
  const accepted: Candidate[] = [];
  for (const cand of found) {
    if (accepted.length >= keep) break;
    if (accepted.some((a) => Math.hypot(a.cx - cand.cx, a.cy - cand.cy) <= radius * field.stride)) continue;
    accepted.push(cand);
  }
  return accepted;
}

/**
 * Pattern search on all four degrees of freedom: probe, move to the best
 * improvement, and halve the steps when none of them improves.
 *
 * Cheaper than a local grid by an order of magnitude and it is the same answer —
 * the objective is smooth at this range, and the coarse scan has already done the
 * part a local method cannot (finding the right hill).
 */
function polish(
  level: Level,
  plate: Plate,
  s: Samples,
  start: Candidate,
  step: { translate: number; rotate: number; scale: number },
  floor: { translate: number; rotate: number; scale: number },
  smooth: boolean,
  /** The scale window the report declares. A polish that walked outside it would report a scale nobody searched. */
  bounds: { min: number; max: number },
): Candidate {
  const clamp = (v: number): number => Math.min(bounds.max, Math.max(bounds.min, v));
  let cur: Candidate = { ...start, residual: residualAt(level, plate, s, start, smooth) };
  let dt = step.translate;
  let dr = step.rotate;
  let ds = step.scale;
  for (let guard = 0; guard < 200; guard++) {
    if (dt <= floor.translate && dr <= floor.rotate && ds <= floor.scale) break;
    const probes: Candidate[] = [];
    const push = (cand: Omit<Candidate, 'residual'>): void => {
      probes.push({ ...cand, residual: residualAt(level, plate, s, { ...cand, residual: 0 }, smooth) });
    };
    if (dt > floor.translate) {
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        push({ cx: cur.cx + ox * dt, cy: cur.cy + oy * dt, rotDeg: cur.rotDeg, scale: cur.scale });
      }
    }
    if (dr > floor.rotate) {
      push({ cx: cur.cx, cy: cur.cy, rotDeg: cur.rotDeg + dr, scale: cur.scale });
      push({ cx: cur.cx, cy: cur.cy, rotDeg: cur.rotDeg - dr, scale: cur.scale });
    }
    if (ds > floor.scale) {
      push({ cx: cur.cx, cy: cur.cy, rotDeg: cur.rotDeg, scale: clamp(cur.scale * (1 + ds)) });
      push({ cx: cur.cx, cy: cur.cy, rotDeg: cur.rotDeg, scale: clamp(cur.scale * (1 - ds)) });
    }
    let best = cur;
    for (const p of probes) if (p.residual < best.residual) best = p;
    if (best === cur) {
      dt /= 2;
      dr /= 2;
      ds /= 2;
      continue;
    }
    cur = best;
  }
  return cur;
}

/** Candidates that walked to one optimum, collapsed to the best of them. Input must be sorted. */
function dedupe(sorted: Candidate[], within: number, degrees: number, scaleRatio: number): Candidate[] {
  const out: Candidate[] = [];
  for (const cand of sorted) {
    const same = out.some(
      (o) =>
        Math.hypot(o.cx - cand.cx, o.cy - cand.cy) <= within &&
        Math.abs(normaliseDegrees(o.rotDeg - cand.rotDeg)) <= degrees &&
        Math.abs(Math.log(o.scale / cand.scale)) <= Math.log(scaleRatio),
    );
    if (!same) out.push(cand);
  }
  return out;
}

// ---------------------------------------------------------------------------
// measuring the answer
// ---------------------------------------------------------------------------

/** The reported numbers, taken at full resolution over EVERY part pixel rather than a sample of them. */
function measure(
  level: Level,
  plate: Plate,
  part: Plate,
  anchorX: number,
  anchorY: number,
  cand: Candidate,
): Omit<PosePlacement, 'x' | 'y' | 'rotationDeg' | 'scale'> {
  const cos = Math.cos(cand.rotDeg * DEG) * cand.scale;
  const sin = Math.sin(cand.rotDeg * DEG) * cand.scale;
  let weight = 0;
  let acc = 0;
  let unexplained = 0;
  let off = 0;
  let onMaterial = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < part.height; y++) {
    for (let x = 0; x < part.width; x++) {
      const i = (y * part.width + x) * 4;
      const a = part.data[i + 3];
      if (a === 0) continue;
      const w = a / 255;
      const u = x + 0.5 - anchorX;
      const v = y + 0.5 - anchorY;
      const fx = cand.cx + u * cos - v * sin;
      const fy = cand.cy + u * sin + v * cos;
      weight += w;
      if (fx < minX) minX = fx;
      if (fx > maxX) maxX = fx;
      if (fy < minY) minY = fy;
      if (fy > maxY) maxY = fy;
      const inside = fx >= 0 && fy >= 0 && fx < level.width && fy < level.height;
      if (!inside) off += w;
      const err = errBilinear(level, plate, fx, fy, part.data[i], part.data[i + 1], part.data[i + 2]);
      acc += w * err;
      if (err > UNEXPLAINED_TOLERANCE) unexplained += w;
      if (inside) {
        const ix = Math.min(level.width - 1, Math.floor(fx));
        const iy = Math.min(level.height - 1, Math.floor(fy));
        onMaterial += w * (level.data[(iy * level.width + ix) * 4 + 3] / 255);
      }
    }
  }
  if (weight === 0) {
    return { residual: 1, unexplained: 1, offCanvas: 1, footprint: 0, bbox: { x: 0, y: 0, width: 0, height: 0 } };
  }
  return {
    residual: acc / weight,
    unexplained: unexplained / weight,
    offCanvas: off / weight,
    // One part pixel covers `scale²` frame pixels, so this is the frame area the
    // placement actually accounts for — which is what separates two placements
    // whose per-pixel residuals are the same.
    footprint: onMaterial * cand.scale * cand.scale,
    bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

export function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  const v = Math.round(n * f) / f;
  return v === 0 ? 0 : v;
}

/** Degrees into (-180, 180], the way an editor shows a rotation. */
export function normaliseDegrees(deg: number): number {
  let v = ((deg % 360) + 360) % 360;
  if (v > 180) v -= 360;
  return v;
}

/** A finished candidate, converted into the report's own frame of reference. */
function toPlacement(part: Plate, anchorX: number, anchorY: number, cand: Candidate, stats: ReturnType<typeof measure>): PosePlacement {
  const cos = Math.cos(cand.rotDeg * DEG) * cand.scale;
  const sin = Math.sin(cand.rotDeg * DEG) * cand.scale;
  const ou = part.width / 2 - anchorX;
  const ov = part.height / 2 - anchorY;
  return {
    x: roundTo(cand.cx + ou * cos - ov * sin, 3),
    y: roundTo(cand.cy + ou * sin + ov * cos, 3),
    rotationDeg: roundTo(normaliseDegrees(cand.rotDeg), 3),
    scale: roundTo(cand.scale, 5),
    residual: roundTo(stats.residual, 5),
    unexplained: roundTo(stats.unexplained, 4),
    offCanvas: roundTo(stats.offCanvas, 4),
    footprint: roundTo(stats.footprint, 1),
    bbox: {
      x: roundTo(stats.bbox.x, 2),
      y: roundTo(stats.bbox.y, 2),
      width: roundTo(stats.bbox.width, 2),
      height: roundTo(stats.bbox.height, 2),
    },
  };
}

/**
 * Is this part self-similar under rotation — a ball rather than an arm?
 *
 * Measured with the same objective, against the part itself: rotate it about its
 * own material centre and ask how much of it still lands on itself, in the same
 * colours. A disc answers ~0 at every angle; anything with a corner or a pattern
 * does not.
 */
function rotationSelfSimilarity(part: Plate, anchorX: number, anchorY: number): number {
  const level = levelOf(part, 1);
  const samples = buildSamples(part, 1, anchorX, anchorY, POLISH_SAMPLES);
  if (samples.count === 0) return 1;
  const at = (deg: number): number =>
    residualAt(level, part, samples, { cx: anchorX, cy: anchorY, rotDeg: deg, scale: 1, residual: 0 }, true);
  // ⚠️ Measured against the IDENTITY, not against zero. A part with a soft rim
  // scores above zero when laid over itself unrotated — every partly transparent
  // pixel pays the `1 − material` term against its own partial alpha — so an
  // absolute reading calls a perfectly round anti-aliased ball asymmetric. On the
  // fixture's 32px ball that baseline is most of a 0.034 absolute reading, which
  // sits the wrong side of a tolerance the shape plainly deserves to pass.
  const baseline = at(0);
  let worst = 0;
  for (let deg = 30; deg < 360; deg += 30) {
    const r = at(deg) - baseline;
    if (r > worst) worst = r;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// arguments
// ---------------------------------------------------------------------------

function scaleLadder(min: number, max: number): number[] {
  if (max <= min) return [min];
  const octaves = Math.log2(max / min);
  const steps = Math.max(1, Math.round(octaves * SCALE_STEPS_PER_OCTAVE));
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) out.push(min * (max / min) ** (i / steps));
  return out;
}

function rotationLadder(minDeg: number, maxDeg: number): number[] {
  const span = maxDeg - minDeg;
  if (span <= 0) return [minDeg];
  // A full turn's two endpoints are the same rotation, so it gets one of them.
  if (span >= 360 - 1e-9) {
    const count = Math.round(360 / COARSE_ROTATION_STEP);
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(minDeg + (i * 360) / count);
    return out;
  }
  const out: number[] = [];
  for (let deg = minDeg; deg <= maxDeg + 1e-9; deg += COARSE_ROTATION_STEP) out.push(deg);
  if (out[out.length - 1] < maxDeg - 1e-9) out.push(maxDeg);
  return out;
}

/** The PNGs in a directory, in name order — the parts, and the order the report lists them. */
export function partFiles(imagesDir: string, exclude: string): string[] {
  const dir = resolve(imagesDir);
  if (!existsSync(dir)) throw new PoseError(`no parts directory at ${dir}`);
  if (!statSync(dir).isDirectory()) throw new PoseError(`${dir} is not a directory — --images takes the directory the part PNGs are in`);
  const excluded = resolve(exclude);
  const files = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .map((f) => join(dir, f))
    .filter((f) => resolve(f) !== excluded)
    .sort();
  if (files.length === 0) throw new PoseError(`no .png files in ${dir} — there is nothing to place`);
  return files;
}

// ---------------------------------------------------------------------------
// the instrument
// ---------------------------------------------------------------------------

export function estimatePose(options: PoseOptions): PoseReport {
  const framePath = resolve(options.framePath);
  if (!existsSync(framePath)) throw new PoseError(`no pose frame at ${framePath}`);
  let frame: Plate;
  try {
    frame = readPlate(framePath);
  } catch (err) {
    throw new PoseError(`cannot read the pose frame ${framePath}: ${(err as Error).message}`);
  }
  const paths =
    options.parts === undefined
      ? partFiles(options.imagesDir, framePath)
      : options.parts.map((p) => resolve(p)).filter((p) => p !== framePath);
  if (paths.length === 0) throw new PoseError(`no parts to place — there is nothing to search for in ${framePath}`);

  const scaleMin = options.scale?.min ?? DEFAULT_SCALE_MIN;
  const scaleMax = options.scale?.max ?? DEFAULT_SCALE_MAX;
  const rotMin = options.rotation?.minDeg ?? -180;
  const rotMax = options.rotation?.maxDeg ?? 180;
  const maxResidual = options.maxResidual ?? DEFAULT_MAX_RESIDUAL;
  const scales = scaleLadder(scaleMin, scaleMax);
  const rotations = rotationLadder(rotMin, rotMax);

  const background = readBackground(frame);
  const material = materialPlate(frame, background);
  background.materialShare = roundTo(material.share, 4);
  const framePyramid = pyramid(material.plate, 6, COARSE_LONG_SIDE);
  const levels = framePyramid.map((p, i) => levelOf(p, 2 ** i));

  const report: PoseReport = {
    spec: POSE_SPEC,
    space:
      'frame pixels, y down, origin top-left. (x, y) is where the part image\'s own centre lands; rotationDeg is ' +
      'screen degrees, positive clockwise; scale is frame pixels per part pixel. Reconstruct a part pixel p as ' +
      'centre + scale * R(rotationDeg) * (p - (width/2, height/2)). src/transform.ts converts to Spine world ' +
      '(screenToSpineDegrees, cropToSpineY).',
    images: resolve(options.imagesDir),
    frame: { path: framePath, width: frame.width, height: frame.height, background },
    search: {
      scale: { min: scaleMin, max: scaleMax, steps: scales.length },
      rotation: { minDeg: rotMin, maxDeg: rotMax, stepDeg: COARSE_ROTATION_STEP, steps: rotations.length },
      coarse: {
        frameLongSide: COARSE_LONG_SIDE,
        partSpan: COARSE_PART_SPAN,
        strideFraction: COARSE_STRIDE_FRACTION,
        framePyramid: framePyramid.length,
      },
      maxResidual,
      ambiguity: { absolute: AMBIGUITY_ABSOLUTE, relative: AMBIGUITY_RELATIVE },
    },
    caveats: [
      'No number here is a score and none of them has a pass bar. The residual says how well the placed part ' +
        'explains the frame under it, which is a measure of how far to trust the placement.',
      'Residuals degrade under OCCLUSION. A part drawn behind another has the occluder\'s pixels where its own ' +
        'should be, so its residual rises at the correct placement; `unexplained` is the share of the part that ' +
        'disagrees, and a middling residual with a high `unexplained` usually means "right place, seen through ' +
        'something else" rather than "wrong place". Nothing here solves for depth.',
      'An `ambiguous` part has two or more placements this instrument cannot separate. Both are reported. ' +
        'Choosing between them needs something it cannot see — anatomy, the other frame, or a human.',
      'A `rotationFree` part is self-similar under rotation, so its reported rotation is a placeholder and the ' +
        'value is yours to choose.',
      'The search is bounded to the scale and rotation windows named in `search`, with the part anchor placed ' +
        'only inside the frame canvas. ⚠️ A window that does not contain the true value does NOT reliably ' +
        'refuse: a part shrunk inside the region it came from still explains those pixels, so the answer is the ' +
        'best placement available INSIDE the window and its residual can look reasonable. That is why the window ' +
        'is a reported field — if the numbers surprise you, check it before you trust them.',
    ],
    parts: [],
  };

  for (const path of paths) {
    report.parts.push(
      placePart(path, frame, levels, framePyramid, scales, rotations, maxResidual, { min: scaleMin, max: scaleMax }),
    );
  }
  return report;
}

function placePart(
  path: string,
  frame: Plate,
  levels: Level[],
  plates: Plate[],
  scales: number[],
  rotations: number[],
  maxResidual: number,
  scaleBounds: { min: number; max: number },
): PosePart {
  const scaleMin = scaleBounds.min;
  /** The scale the sample sets are sized for — the middle of the window, and NOT the scale under test. */
  const scaleReference = Math.sqrt(scaleBounds.min * scaleBounds.max);
  const name = basename(path);
  let part: Plate;
  try {
    part = readPlate(path);
  } catch (err) {
    return {
      part: name,
      path,
      width: 0,
      height: 0,
      refusal: { reason: 'empty-part', detail: `cannot decode ${name}: ${(err as Error).message}` },
      placement: null,
      alternates: [],
      ambiguous: false,
      rotationFree: false,
      rotationSelfSimilarity: 1,
      coarse: null,
      notes: [`${name} could not be decoded, so it was not placed.`],
    };
  }
  const base: PosePart = {
    part: name,
    path,
    width: part.width,
    height: part.height,
    refusal: null,
    placement: null,
    alternates: [],
    ambiguous: false,
    rotationFree: false,
    rotationSelfSimilarity: 1,
    coarse: null,
    notes: [],
  };

  const box = materialBox(part);
  if (box === null) {
    base.refusal = { reason: 'empty-part', detail: `${name} is ${part.width}x${part.height} and every pixel of it is transparent` };
    base.notes.push(`${name} has no material to place.`);
    return base;
  }
  const tw = box.maxX - box.minX;
  const th = box.maxY - box.minY;
  const fitsUpright = tw * scaleMin <= frame.width && th * scaleMin <= frame.height;
  const fitsTurned = th * scaleMin <= frame.width && tw * scaleMin <= frame.height;
  if (!fitsUpright && !fitsTurned) {
    base.refusal = {
      reason: 'larger-than-canvas',
      detail:
        `${name}'s material is ${tw}x${th} part px; at the smallest tested scale ${scaleMin} that is ` +
        `${roundTo(tw * scaleMin, 1)}x${roundTo(th * scaleMin, 1)} frame px, which does not fit a ` +
        `${frame.width}x${frame.height} canvas at any rotation`,
    };
    base.notes.push(`${name} cannot be contained by this frame at any tested scale — lower --scale or check the pair.`);
    return base;
  }

  /** Longest side of the part's material, in part pixels — the yardstick "near" is measured in. */
  const span = Math.max(tw, th);
  const anchorX = (box.minX + box.maxX) / 2;
  const anchorY = (box.minY + box.maxY) / 2;

  // Rotation freedom is settled before the search, because a part it applies to
  // does not need a rotation ladder at all — and searching one would invent a
  // precise-looking angle for a quantity that has none.
  const selfSimilarity = rotationSelfSimilarity(part, anchorX, anchorY);
  const rotationFree = selfSimilarity <= ROTATION_FREE_TOLERANCE;
  base.rotationFree = rotationFree;
  base.rotationSelfSimilarity = roundTo(selfSimilarity, 5);
  const searchRotations = rotationFree ? [0] : rotations;
  if (rotationFree) {
    base.notes.push(
      `${name} is self-similar under rotation (worst self-residual ${roundTo(selfSimilarity, 4)} over 11 probes, ` +
        `tolerance ${ROTATION_FREE_TOLERANCE}), so rotation is a free degree of freedom — the reported 0° is a ` +
        'placeholder, not a measurement.',
    );
  }

  const partPyramid = pyramid(part, 6, 4);
  const samplesCache = new Map<string, Samples>();
  /**
   * The part's sample set for one search level.
   *
   * 🚨 The mip is chosen from the level and the MIDDLE of the scale window, never
   * from the scale being tried — and that is the whole reason scale is
   * identifiable at all. Sizing the sample set to each candidate scale looks
   * obviously right (sample the part as finely as the frame can resolve it) and
   * collapses the search: a small scale then gets a coarse, few-pixel mip whose
   * every sample is an average of a large patch, those samples land deep inside
   * the blob, and the residual goes to nothing. Measured on the fixture: a 22px
   * head found its optimum at scale 0.39 with residual 0.065, against 0.017 at
   * the true 1.15 — the search preferred a placement the objective itself scores
   * worse, because the two were not scored on the same pixels. One sample set per
   * level puts every candidate scale on the same material, and then a scale that
   * squeezes six samples into three frame pixels has to explain why they disagree.
   */
  const samplesFor = (levelReduction: number, cap: number): Samples => {
    const wanted = Math.max(0, Math.round(Math.log2(Math.max(1e-6, levelReduction / scaleReference))));
    const mip = Math.min(partPyramid.length - 1, wanted);
    const key = `${mip}:${cap}`;
    const hit = samplesCache.get(key);
    if (hit) return hit;
    const built = buildSamples(partPyramid[mip], 2 ** mip, anchorX, anchorY, cap);
    samplesCache.set(key, built);
    return built;
  };

  // ⭐ Which level the exhaustive pass runs at is a decision about the PART, not
  // only about the frame. The pyramid stops when the frame fits in
  // COARSE_LONG_SIDE; this then walks back UP it until the part still spans
  // COARSE_PART_SPAN pixels there, because a level that has reduced the part to
  // three pixels cannot say where the part is at any price.
  let coarseIndex = levels.length - 1;
  while (coarseIndex > 0 && (span * scaleReference) / levels[coarseIndex].reduction < COARSE_PART_SPAN) coarseIndex--;
  const coarse = levels[coarseIndex];
  const spanAtCoarse = (span * scaleReference) / coarse.reduction;
  const stride = Math.max(1, Math.round(spanAtCoarse * COARSE_STRIDE_FRACTION));
  const coarseSamples = samplesFor(coarse.reduction, COARSE_SAMPLES);
  let candidates: Candidate[] = [];
  let grid = { reduction: coarse.reduction, cols: 0, rows: 0, stride };
  for (const scale of scales) {
    const field = coarseScan(coarse, coarseSamples, scale, searchRotations, stride);
    grid = { reduction: coarse.reduction, cols: field.cols, rows: field.rows, stride };
    candidates.push(...localMinima(field, 2, MINIMA_PER_SCALE));
  }
  base.coarse = grid;
  candidates.sort((a, b) => a.residual - b.residual);
  if (candidates.length === 0) {
    base.refusal = { reason: 'no-match', detail: `${name}: the coarse scan found no finite placement in this frame` };
    base.notes.push(`${name} matched nowhere in this frame.`);
    return base;
  }

  // Refine down the pyramid. Every level doubles the coordinates and halves the
  // steps; the candidate list narrows as it goes so the budget follows the
  // placements that are still plausible.
  //
  // 🚨 One level RE-GRIDS rotation instead of narrowing, for the same reason the
  // coarse fields are kept apart by scale: a blurred blob does not have a
  // measurable angle either, and the field keeps only one rotation per cell. On
  // the fixture the right arm was found at exactly the right PLACE carrying
  // rotation -122 degrees, which no 7.5 degree local step could ever leave — and
  // that arm is one half of the two-identical-limbs answer the whole instrument
  // exists to report. Re-gridding the ladder at the first level with real detail
  // brought it back at +35.
  const branchLevel = Math.max(0, coarseIndex - 1);
  /** How many rotations survive the re-grid at the branch level, per position. */
  const BRANCH_ROTATIONS = 3;
  let rotStep = rotationFree ? 0 : COARSE_ROTATION_STEP / 2;
  for (let li = coarseIndex; li >= 0; li--) {
    const level = levels[li];
    const plate = plates[li];
    const smooth = li !== coarseIndex;
    const branch = li === branchLevel;
    const keep = li === coarseIndex ? scales.length * MINIMA_PER_SCALE : REFINE_CANDIDATES;
    const s = samplesFor(level.reduction, li === 0 ? POLISH_SAMPLES : REFINE_SAMPLES);
    // The coarse pass only sampled every `stride` pixels, so entering the
    // refinement the anchor can be half a stride out; the first polish gets a
    // step big enough to cross that rather than a step that assumes a pixel.
    const step = { translate: li === coarseIndex ? Math.max(1.5, stride) : 1.5, rotate: rotStep, scale: 0.08 };
    const floor =
      li === 0 ? { translate: 0.05, rotate: 0.1, scale: 0.001 } : { translate: 0.25, rotate: 0.5, scale: 0.01 };
    const seeds: Candidate[] = [];
    for (const start of candidates.slice(0, keep)) {
      if (branch && !rotationFree) {
        const grid: Candidate[] = [];
        for (const rotDeg of searchRotations) {
          const probe: Candidate = { ...start, rotDeg, residual: 0 };
          probe.residual = residualAt(level, plate, s, probe, smooth);
          grid.push(probe);
        }
        grid.sort((a, b) => a.residual - b.residual);
        // One position and one scale throughout, so this dedupe is a spread over
        // rotation alone: an angle within 25 degrees of one already kept is the
        // same basin under a slightly different name.
        seeds.push(...dedupe(grid, 1, 25, Infinity).slice(0, BRANCH_ROTATIONS));
        continue;
      }
      seeds.push(start);
    }
    candidates = seeds.map((seed) => polish(level, plate, s, seed, step, floor, smooth, scaleBounds));
    candidates.sort((a, b) => a.residual - b.residual);
    // ⚠️ Eight branches that walked to one optimum are one candidate, not eight —
    // and the radius has to scale with the PART rather than be a pixel count.
    // Narrowing by residual alone lets near-copies of the best hill fill the
    // budget and crowd the SECOND hill out, which is exactly the answer this
    // instrument exists to keep: with a fixed one-pixel radius the fixture lost
    // one of its two identical arms.
    candidates = dedupe(candidates, Math.max(1, (0.2 * span * scaleReference) / level.reduction), 5, 1.03);
    if (li > 0) {
      candidates = candidates.map((c) => ({ ...c, cx: c.cx * 2, cy: c.cy * 2 }));
      // A rotation-free part keeps its step at zero all the way down, so the
      // polish never touches an angle that means nothing and the report's 0° is
      // the placeholder it says it is rather than a wandered-to number.
      if (!rotationFree) rotStep = Math.max(1, rotStep / 2);
    }
  }

  // The one rotation family the translation scan cannot see: a part that is its
  // own mirror after a quarter or a half turn sits in the SAME place at more than
  // one angle, so the field records only whichever won. Probe them explicitly.
  if (!rotationFree && candidates.length > 0) {
    const primary = candidates[0];
    const s = samplesFor(1, POLISH_SAMPLES);
    for (const turn of [90, 180, 270]) {
      candidates.push(
        polish(
          levels[0],
          plates[0],
          s,
          { ...primary, rotDeg: primary.rotDeg + turn },
          { translate: 1.5, rotate: 4, scale: 0.04 },
          { translate: 0.05, rotate: 0.1, scale: 0.001 },
          true,
          scaleBounds,
        ),
      );
    }
    candidates.sort((a, b) => a.residual - b.residual);
  }

  // Measured at full resolution over every pixel, then de-duplicated: two
  // candidates that walked to the same optimum are one answer, not two.
  const measured = candidates.map((cand) => ({ cand, placement: toPlacement(part, anchorX, anchorY, cand, measure(levels[0], plates[0], part, anchorX, anchorY, cand)) }));
  measured.sort((a, b) => a.placement.residual - b.placement.residual || b.placement.footprint - a.placement.footprint);
  const distinct: typeof measured = [];
  for (const m of measured) {
    const same = distinct.some(
      (d) =>
        Math.hypot(d.placement.x - m.placement.x, d.placement.y - m.placement.y) <= Math.max(1.5, 0.03 * span * m.placement.scale) &&
        Math.abs(normaliseDegrees(d.placement.rotationDeg - m.placement.rotationDeg)) <= 5 &&
        Math.abs(Math.log(d.placement.scale / m.placement.scale)) <= Math.log(1.05),
    );
    if (!same) distinct.push(m);
  }

  const best = distinct[0].placement;
  const margin = Math.max(AMBIGUITY_ABSOLUTE, best.residual * AMBIGUITY_RELATIVE);
  const close = distinct.slice(1).filter((d) => d.placement.residual - best.residual <= margin);
  base.placement = best;
  base.alternates = close.slice(0, MAX_ALTERNATES).map((d) => d.placement);
  base.ambiguous = close.length > 0;
  if (base.ambiguous) {
    base.notes.push(
      `${name} has ${close.length + 1} placements within ${roundTo(margin, 4)} residual of each other — all of them ` +
        'are reported and none was picked. Two identical limbs look exactly like this; so does a part that fits ' +
        'its own silhouette at more than one angle.',
    );
  }
  if (best.residual > maxResidual) {
    base.refusal = {
      reason: 'no-match',
      detail: `${name}: the best placement found has residual ${best.residual.toFixed(4)}, above --max-residual ${maxResidual}`,
    };
    base.notes.push(
      `${name} matches nowhere in this frame well enough to report. The best placement found is still in ` +
        '`placement` — a refusal names why not to trust it, it does not hide it.',
    );
  }
  if (best.unexplained > 0.25 && best.residual <= maxResidual) {
    base.notes.push(
      `${roundTo(best.unexplained * 100, 1)}% of ${name}'s material disagrees with the frame at this placement. ` +
        'Another part drawn over it is the usual reason; the placement can be right and the residual still high.',
    );
  }
  if (best.offCanvas > 0.01) {
    base.notes.push(`${roundTo(best.offCanvas * 100, 1)}% of ${name}'s material falls outside the frame canvas at this placement.`);
  }
  return base;
}

// ---------------------------------------------------------------------------
// the console report
// ---------------------------------------------------------------------------

function placementLine(p: PosePlacement): string {
  return (
    `x=${p.x.toFixed(1).padStart(7)}  y=${p.y.toFixed(1).padStart(7)}  rot=${p.rotationDeg.toFixed(1).padStart(7)}°  ` +
    `scale=${p.scale.toFixed(3)}  residual=${p.residual.toFixed(4)}  unexplained=${(p.unexplained * 100).toFixed(0).padStart(3)}%`
  );
}

export function poseLines(report: PoseReport): string[] {
  const bg = report.frame.background;
  const bgText =
    bg.kind === 'colour' && bg.colour !== null
      ? `rgb(${bg.colour.join(', ')}) over ${(bg.borderShare * 100).toFixed(0)}% of the border ring`
      : bg.kind === 'transparent'
        ? `transparency over ${(bg.borderShare * 100).toFixed(0)}% of the border ring`
        : 'UNKNOWN — the border ring has no dominant colour, so every pixel counts as material and the silhouette ' +
          'signal is gone; residuals here are colour agreement only';
  const lines = [
    `  ..    frame   ${report.frame.path}  (${report.frame.width}x${report.frame.height})`,
    `  ..    ground  ${bgText}`,
    `  ..    parts   ${report.images}  (${report.parts.length} png)`,
    `  ..    search  scale ${report.search.scale.min}–${report.search.scale.max} in ${report.search.scale.steps} step(s) · ` +
      `rotation ${report.search.rotation.minDeg}°–${report.search.rotation.maxDeg}° step ${report.search.rotation.stepDeg}° · ` +
      `refuse above residual ${report.search.maxResidual}`,
  ];
  const width = Math.max(8, ...report.parts.map((p) => p.part.length));
  for (const part of report.parts) {
    const label = part.part.padEnd(width);
    if (part.placement === null) {
      lines.push(`  REFUSE ${label}  ${part.refusal?.reason ?? 'unplaced'}: ${part.refusal?.detail ?? ''}`);
      continue;
    }
    const tag = part.refusal !== null ? 'REFUSE' : part.ambiguous ? 'AMBIG ' : 'PLACE ';
    lines.push(`  ${tag} ${label}  ${placementLine(part.placement)}`);
    if (part.coarse !== null) {
      lines.push(
        `         ${' '.repeat(width)}  found on a ${part.coarse.cols}x${part.coarse.rows} anchor grid, ` +
          `step ${part.coarse.stride} at ${part.coarse.reduction}x reduction`,
      );
    }
    if (part.rotationFree) lines.push(`         ${' '.repeat(width)}  rotation is a FREE degree of freedom — the 0° above is a placeholder`);
    part.alternates.forEach((alt, i) => {
      lines.push(`         ${' '.repeat(width)}  alt ${i + 2}: ${placementLine(alt)}`);
    });
    if (part.refusal !== null) lines.push(`         ${' '.repeat(width)}  ${part.refusal.reason}: ${part.refusal.detail}`);
  }
  lines.push('');
  lines.push('  ..    residuals are a trust signal, not a score — nothing here has a pass bar.');
  lines.push('  ..    they degrade under occlusion: a high `unexplained` on a plausible placement usually means');
  lines.push('  ..    the part is drawn behind something, not that it is in the wrong place.');
  return lines;
}
