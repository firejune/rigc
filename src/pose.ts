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
// ⭐ `bilinear` — the PREMULTIPLIED tap — and the fourth channel is what makes
// that read oddly at first. `materialPlate` hands this file the frame's own RGB
// with alpha rewritten to mean "how much material is here", so the weighting is
// not a colour-space correction here: a texel with no material has no material
// COLOUR either — it carries the background's — so it must get a vote in the
// coverage and none in the colour. That is exactly what premultiplying by the
// fourth channel does, and interpolating the colours channel by channel is what
// mixed the ground into the material along every silhouette (issue #306, the
// same defect class as #292 in the instrument that prices placements).
//
// Both tap paths in this file are colour-against-colour, and neither reads a
// mask as if it were a colour:
//   • the search and `measure` sample the MATERIAL PLATE — mask fourth channel,
//     the frame's own RGB;
//   • `rotationSelfSimilarity` samples the PART plate itself, whose fourth
//     channel is the art's own straight alpha — the #292 case verbatim.
// `bilinear` computes its fourth channel with the unchanged `lerpTap`, so the
// coverage term `errBilinear` gates on is bit-identical to what the
// channel-independent tap returned; only the colour moves, and only where a tap
// straddles an edge. #301 deliberately left this call on the old arithmetic to
// hold the fitting numbers still while the from-zero run 2 was in flight; #306
// moved it, with the re-baseline of every figure that quoted a residual.
import { bilinear } from './render.ts';

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

/**
 * The COARSEST step, in degrees, the rotation ladder is allowed to take.
 *
 * ⚠️ A ceiling on the step rather than the step itself, and the distinction is
 * the whole of issue #719. Read as "the step", a window narrower than it prints
 * a resolution the search never had: `--rotation -5,5` reported `step 15°` over
 * a ten-degree window. The ladder therefore divides the window into whole steps
 * no coarser than this — the same shape `scaleLadder` has always had for
 * octaves — and the report states the step that division produced.
 */
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

/**
 * One wall of the search window a reported placement stands ON.
 *
 * ⭐ A fact about the search, not about the picture: the refinement is clamped
 * to the window, so a value held by a wall is the bound itself — which is what
 * lets "on" be told from "near". A placement that settled inside stops short of
 * the wall by at least the polish's last step; one that was held by it sits on
 * it exactly (issue #737).
 */
export interface PoseWall {
  axis: 'scale' | 'rotation';
  edge: 'floor' | 'ceiling';
  /** The window as its flag spells it, `min,max` — `--scale 0.5,2`'s is `"0.5,2"`. */
  window: string;
}

export interface PosePart {
  /** The PNG's file name — how the report names the part everywhere. */
  part: string;
  path: string;
  width: number;
  height: number;
  /**
   * The walls of the search window `placement` stands on — empty when it settled
   * inside the window, and always empty when there is no placement.
   *
   * 🔒 Set whatever the verdict, and read by one function (`placementWalls`) for
   * both: a `no-match` quotes these in its `refusal.detail`, an accepted part
   * carries them on its console line. Until issue #737 only the refusal said so,
   * and an accepted `scale=2.000` under `--scale 0.5,2` over a part whose truth
   * was 2.30 carried no mark at all.
   *
   * ⚠️ A wall here is not a claim about which side the truth is on. Measured over
   * the rendered corpus, a floor holds two kinds of answer — a truth below the
   * window, and a part shrunk into the region it came from while its truth sits
   * inside the window — and nothing in one frame separates them. What is certain
   * is that the value is where the search was held, not where it came to rest.
   */
  walls: PoseWall[];
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
  /**
   * The rotation window, and the ladder it produced.
   *
   * 🔒 `stepDeg` is read off `degrees` rather than off `COARSE_ROTATION_STEP`,
   * and `degrees` is the array the coarse pass iterated — so the two cannot say
   * different things about the same run (issue #719). `steps` is how many angles
   * that is, which is `degrees.length`.
   */
  rotation: { minDeg: number; maxDeg: number; stepDeg: number; steps: number; degrees: number[] };
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
 * Keeping it in a `Plate` is what lets the pyramid, `bilinear` and the nearest
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

/**
 * Same, sampled between pixel centres — what the refinement stages measure with.
 *
 * ⭐ The two halves of the tap are read differently on purpose, and `bilinear`
 * is what supplies both: the colour is the material-weighted mean (a texel with
 * no material contributes no colour), while `fa` — the coverage this charges
 * `1 − m` for — is the plain interpolation of the fourth channel, unchanged.
 * Weighting a mask as if it were a colour is the mistake the import comment
 * warns about; weighting the colour BY the mask is the objective.
 */
export function errBilinear(level: Level, plate: Plate, x: number, y: number, pr: number, pg: number, pb: number): number {
  if (x < 0 || y < 0 || x >= level.width || y >= level.height) return 1;
  const [fr, fg, fb, fa] = bilinear(plate, x - 0.5, y - 0.5);
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
  /**
   * The rotation window the report declares, held for exactly the reason above.
   *
   * ⚠️ This argument did not exist until issue #719, and the sentence over
   * `bounds` was the whole argument for it the entire time: a polish free to
   * walk outside the window reports an answer nobody searched, and the window is
   * a field a caller is entitled to read as a promise. `src/chainfit.ts` had
   * already written that argument out for its own hinge — *"for the same reason
   * `pose`'s polish clamps its scale"* — while this file, the one it was citing,
   * clamped one of its two windows. Measured on a rotation window of `-5,5`: the
   * ladder walked its two endpoints and the report came back with 28.1°, 121.3°
   * and −122.3°.
   *
   * A full turn contains every angle, so it is left unclamped and the rotation
   * may wrap — which is what the default window is, and why nothing about a
   * default run moves.
   */
  rotationBounds: { min: number; max: number; wraps: boolean },
): Candidate {
  const clamp = (v: number): number => Math.min(bounds.max, Math.max(bounds.min, v));
  const hold = (v: number): number =>
    rotationBounds.wraps ? v : Math.min(rotationBounds.max, Math.max(rotationBounds.min, v));
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
      push({ cx: cur.cx, cy: cur.cy, rotDeg: hold(cur.rotDeg + dr), scale: cur.scale });
      push({ cx: cur.cx, cy: cur.cy, rotDeg: hold(cur.rotDeg - dr), scale: cur.scale });
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
  // fixture's 32px ball that baseline is most of a 0.033 absolute reading, which
  // sits the wrong side of a tolerance the shape plainly deserves to pass.
  //
  // 📏 Re-baselined for #306: the absolute reading was 0.034 under the
  // channel-independent tap and the BASELINE did not move at all (0.0198 both
  // ways). It could not: at zero rotation every sample lands on a texel centre,
  // where premultiplying and dividing back out is the identity. What premultiplying
  // took off is the rotated readings — worst relative 0.0143 -> 0.0129 — which is
  // the ball's own soft rim no longer being compared against black.
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

/**
 * The angles the coarse pass actually walks, evenly dividing the window.
 *
 * ⭐ `scaleLadder` above is the shape this follows, and it is the reason the
 * defect was reachable: that one takes a rung count off its window and divides,
 * so the rung it reports is the rung it walks. This one used to march
 * `COARSE_ROTATION_STEP` off the floor and then append the ceiling, which left
 * two ways for the reported step to be a different number from the applied one —
 * a window narrower than the constant got its two endpoints and a gap of the
 * window's own width, and any window whose span is not a whole number of steps
 * got a short final gap. Both printed `step 15°`.
 *
 * ⚠️ The count is a CEILING rather than a rounding, which is not tidiness: a
 * rounding down would make the applied step wider than `COARSE_ROTATION_STEP`
 * for a window like 20°, so the constant would stop being an upper bound on the
 * step. Rounding up cannot coarsen the search — measured against the old ladder,
 * every window it changes gets at least as many angles as before.
 */
export function rotationLadder(minDeg: number, maxDeg: number): number[] {
  const span = maxDeg - minDeg;
  if (span <= 0) return [minDeg];
  const steps = Math.ceil(span / COARSE_ROTATION_STEP - 1e-9);
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) out.push(minDeg + (span * i) / steps);
  // A full turn's two endpoints are the same rotation, so it gets one of them.
  if (span >= 360 - 1e-9) out.pop();
  return out;
}

/** The step a ladder walks, read off the ladder rather than off the constant it was built from. */
function ladderStep(degrees: number[]): number {
  return degrees.length > 1 ? degrees[1] - degrees[0] : 0;
}

/**
 * The `search` line's rotation clause.
 *
 * ⭐ Exported for the same reason `windowEdgeNote` is: `docs/AUTHORING.md`
 * quotes this line, and a guide that spells a report's own sentence by hand is
 * a second implementation of it. `CUR47` builds the clause here and looks for it
 * in the page, so the two go stale together or not at all.
 */
export function searchRotationClause(rotation: PoseSearch['rotation']): string {
  // Rounded for the console alone — `search.rotation` in the JSON carries the
  // ladder unrounded, because a window that divides into thirds has angles no
  // decimal place holds.
  return `rotation ${rotation.minDeg}°–${rotation.maxDeg}° in ${rotation.steps} step(s) of ${roundTo(rotation.stepDeg, 3)}°`;
}

/**
 * The sentence a refusal carries when its best placement sits on a WALL of the
 * search window rather than somewhere inside it.
 *
 * ⭐ Exported because the guide quotes it and `CUR48` compares the two: a
 * message and the document that teaches it are the same interface, and the only
 * way they cannot drift is for one of them to be built from the other.
 *
 * The claim is deliberately weak — *may* lie outside — because that is all that
 * is known. The search was bounded, the optimum walked to the bound and stopped;
 * whether the truth is past it or the part simply does not appear in this frame
 * are two readings this instrument cannot separate. Naming the wall is what lets
 * an author separate them, by moving the wall.
 */
export function windowEdgeNote(axis: 'scale' | 'rotation', edge: 'floor' | 'ceiling', at: string, window: string): string {
  return (
    `best placement at ${axis} ${at}, ${wallClause(axis, edge, window)} — ` +
    `the truth may lie ${edge === 'floor' ? 'below' : 'above'} the window`
  );
}

/**
 * The wall named on its own — `the ceiling of --scale 0.5,2` — which is the part
 * of `windowEdgeNote` an ACCEPTED placement's console line carries (issue #737).
 *
 * ⭐ One clause, two sentences, so the refusal and the accepted line cannot spell
 * the same wall two ways. The accepted line carries the wall and not the "truth
 * may lie" half on purpose: measured over the corpus, a floor holds truths below
 * the window and parts shrunk into their own region alike, so which side the
 * truth is on is exactly what an accepted placement does not know.
 */
export function wallClause(axis: 'scale' | 'rotation', edge: 'floor' | 'ceiling', window: string): string {
  return `the ${edge} of --${axis} ${window}`;
}

/**
 * The walls of the window one placement stands on — the single reading both a
 * refusal and an accepted placement are marked from (issue #737).
 *
 * 🔑 Read off the UNROUNDED candidate, because the clamp writes the bound itself
 * and so "on" is an equality — while the reported `scale` is rounded to five
 * places and a window need not be: under `--scale 0.0931424…,0.3725…` the report
 * prints `0.09314`, below its own floor, for a candidate the clamp put exactly on
 * it. The `1e-9` is float slack on a ladder rung computed as `min + span·i/steps`,
 * not a notion of "near": the nearest correct placement that settled inside the
 * window was measured 0.125% off its wall, the polish's last scale step.
 *
 * A window with no interior — `min === max` — has no wall to be at: being at the
 * only value there is says nothing about where the answer is (issue #719). A
 * window spanning a full turn has none either, and neither has the rotation of a
 * `rotationFree` part, whose `0°` is a placeholder the search never moved.
 */
export function placementWalls(
  scale: number,
  rotationDeg: number,
  scaleBounds: { min: number; max: number },
  rotationBounds: { min: number; max: number; wraps: boolean },
  rotationFree: boolean,
): PoseWall[] {
  const walls: PoseWall[] = [];
  const at = (value: number, bound: number): boolean => Math.abs(value - bound) <= 1e-9 * Math.max(1, Math.abs(bound));
  if (scaleBounds.max > scaleBounds.min) {
    const window = `${scaleBounds.min},${scaleBounds.max}`;
    if (at(scale, scaleBounds.min)) walls.push({ axis: 'scale', edge: 'floor', window });
    else if (at(scale, scaleBounds.max)) walls.push({ axis: 'scale', edge: 'ceiling', window });
  }
  if (!rotationFree && !rotationBounds.wraps && rotationBounds.max > rotationBounds.min) {
    const window = `${rotationBounds.min},${rotationBounds.max}`;
    if (at(rotationDeg, rotationBounds.min)) walls.push({ axis: 'rotation', edge: 'floor', window });
    else if (at(rotationDeg, rotationBounds.max)) walls.push({ axis: 'rotation', edge: 'ceiling', window });
  }
  return walls;
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
      rotation: {
        minDeg: rotMin,
        maxDeg: rotMax,
        // ⚠️ Neither of these is rounded, and every other number in this report
        // is. Rounding them would make the reported ladder a near-copy of the
        // applied one, which is the defect this field exists to close — a window
        // that divides into thirds has angles no decimal place holds. The console
        // rounds for display; the record is exact.
        stepDeg: ladderStep(rotations),
        steps: rotations.length,
        degrees: [...rotations],
      },
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
        'is a reported field — if the numbers surprise you, check it before you trust them. A part whose placement ' +
        'stopped ON a wall of the window lists it in `walls`, whatever its verdict: a refused one also names it in ' +
        '`refusal.detail`, an accepted one beside the value on its console line. That value is where the search was ' +
        'held rather than where it came to rest, and the window is the first thing to move. An empty `walls` is ' +
        'not evidence the truth is inside the window — a placement can settle inside it on another optimum.',
    ],
    parts: [],
  };

  // A window spanning a whole turn contains every angle there is, so nothing is
  // outside it and nothing has to be held inside it.
  const rotationBounds = { min: rotMin, max: rotMax, wraps: rotMax - rotMin >= 360 - 1e-9 };
  for (const path of paths) {
    report.parts.push(
      placePart(
        path,
        frame,
        levels,
        framePyramid,
        scales,
        rotations,
        maxResidual,
        { min: scaleMin, max: scaleMax },
        rotationBounds,
      ),
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
  rotationBounds: { min: number; max: number; wraps: boolean },
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
      walls: [],
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
    walls: [],
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
    candidates = seeds.map((seed) => polish(level, plate, s, seed, step, floor, smooth, scaleBounds, rotationBounds));
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
  //
  // 🚨 Only the turns the window contains, and this is the other half of #719's
  // measurement. A quarter turn off is a SEED, not a ladder rung — so under
  // `--rotation -5,5` it entered the answer from outside a window the report was
  // calling the search, and the candidate who ran the exam read `rot=91.2°`
  // under `rotation -5°–5°`. A caller who bounds the rotation has said the part
  // is not a quarter turn over; the honest response is not to look there rather
  // than to look and report it.
  if (!rotationFree && candidates.length > 0) {
    const primary = candidates[0];
    const s = samplesFor(1, POLISH_SAMPLES);
    for (const turn of [90, 180, 270]) {
      const turned = primary.rotDeg + turn;
      if (!rotationBounds.wraps && (turned < rotationBounds.min - 1e-9 || turned > rotationBounds.max + 1e-9)) continue;
      candidates.push(
        polish(
          levels[0],
          plates[0],
          s,
          { ...primary, rotDeg: turned },
          { translate: 1.5, rotate: 4, scale: 0.04 },
          { translate: 0.05, rotate: 0.1, scale: 0.001 },
          true,
          scaleBounds,
          rotationBounds,
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
  // 🔒 Which walls the answer stands on, read once and for every verdict — the
  // refusal below quotes them and an accepted line carries them (issue #737).
  // The candidate rather than the rounded placement, and in the window's own
  // spelling: the clamp holds `rotDeg` inside `170,190` as written, so its
  // ceiling is 190 there even though the report normalises it to −170°.
  base.walls = placementWalls(distinct[0].cand.scale, distinct[0].cand.rotDeg, scaleBounds, rotationBounds, rotationFree);
  if (best.residual > maxResidual) {
    // ⭐ The wall the answer stopped against, named in the refusal that reports
    // it (issue #719). A refusal that states only the residual and the threshold
    // sends an author to the one remedy that cannot work — every part of a frame
    // rendered below the scale floor came back refused at the floor, and the
    // window that could not reach the truth was a line further up the report
    // nobody was told to read.
    //
    // A window with no interior — `min === max` — has no wall to be at, so it
    // gets no sentence: being at the only value there is says nothing about
    // where the truth is. `placementWalls` holds that rule for both verdicts.
    const edges = base.walls.map((wall) =>
      windowEdgeNote(
        wall.axis,
        wall.edge,
        wall.axis === 'scale' ? best.scale.toFixed(3) : `${best.rotationDeg.toFixed(1)}°`,
        wall.window,
      ),
    );
    base.refusal = {
      reason: 'no-match',
      detail:
        `${name}: the best placement found has residual ${best.residual.toFixed(4)}, above --max-residual ${maxResidual}` +
        (edges.length === 0 ? '' : `; ${edges.join('; ')}`),
    };
    base.notes.push(
      `${name} matches nowhere in this frame well enough to report. The best placement found is still in ` +
        '`placement` — a refusal names why not to trust it, it does not hide it.',
    );
    if (edges.length > 0) {
      base.notes.push(
        `${name}'s best placement sits on a wall of the search window, so the window is the first thing to move: ` +
          `${edges.join('; ')}.`,
      );
    }
  } else if (base.walls.length > 0) {
    // ⭐ And an ACCEPTED placement on a wall says so too (issue #737), which
    // #719 had declined on the grounds that a window chosen to bracket the
    // answer puts correct placements near its edges. Near, measured, is not on:
    // the refinement is clamped, so a value held by a wall IS the bound, while
    // correct placements that settled inside stopped short of their wall by at
    // least the polish's last step. The mark is on the placements whose number
    // is the window's rather than the picture's, and not on the ones a
    // well-chosen window merely brackets closely.
    //
    // ⚠️ It names the wall and nothing more — not "the truth may lie beyond",
    // which a refusal says. Measured on the rendered corpus under a window
    // bracketing every truth, the floor held parts shrunk into their own region
    // whose truth was inside the window, so which side the truth is on is the one
    // thing an accepted placement on a wall does not know.
    base.notes.push(
      `${name} was accepted, but its placement stopped ON a wall of the search window rather than settling inside ` +
        'it, so that value is where the search was held and not where it came to rest: ' +
        `${base.walls.map((wall) => wallClause(wall.axis, wall.edge, wall.window)).join('; ')}.`,
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

/**
 * One placement as the console prints it, with the wall each value stands on
 * written beside that value (issue #737) — `scale=2.000 (the ceiling of --scale
 * 0.5,2)` — so the number and the fact that the window chose it are read
 * together. Only an accepted part's own placement is passed walls: a refusal
 * already prints the whole sentence on the line below it.
 */
function placementLine(p: PosePlacement, walls: readonly PoseWall[] = []): string {
  const beside = (axis: PoseWall['axis']): string =>
    walls
      .filter((wall) => wall.axis === axis)
      .map((wall) => ` (${wallClause(wall.axis, wall.edge, wall.window)})`)
      .join('');
  return (
    `x=${p.x.toFixed(1).padStart(7)}  y=${p.y.toFixed(1).padStart(7)}  rot=${p.rotationDeg.toFixed(1).padStart(7)}°${beside('rotation')}  ` +
    `scale=${p.scale.toFixed(3)}${beside('scale')}  residual=${p.residual.toFixed(4)}  unexplained=${(p.unexplained * 100).toFixed(0).padStart(3)}%`
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
      // The step is the ladder's own rather than the constant it was capped at.
      // Printing the constant here is what issue #719 was: a line that said
      // `step 15°` over a window ten degrees wide, which no run had ever walked.
      `${searchRotationClause(report.search.rotation)} · ` +
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
    lines.push(`  ${tag} ${label}  ${placementLine(part.placement, part.refusal === null ? part.walls : [])}`);
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
