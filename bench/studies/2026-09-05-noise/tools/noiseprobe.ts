/**
 * The noise probe — what a depth map's SAMPLING does to the turn ceiling.
 *
 * `bench/studies/2026-09-05-density` measured that the fold angle belongs to
 * the depth map's steepest slope, `tan t = 1 / max|dz/du|`, with no mesh term in
 * it. Every sheet it measured was analytic. A real sheet is a PNG: 8-bit, maybe
 * resampled, maybe painted, maybe the output of a monocular depth model — and
 * **noise is also a slope**. If the ceiling is a maximum over sampled
 * gradients, a sheet's grain can set it instead of the sheet's shape, and the
 * number `build` prints would then be a property of the sampling.
 *
 * This measures that. It adds nothing to the compiler and proposes nothing to
 * it: the whole output is a table.
 *
 * ## What is measured and what is reimplemented
 *
 * The ceiling itself is always `src/depth.ts`'s `turnCeiling` and the lattice is
 * always `src/mesh.ts`'s `buildGridMesh` — neither is copied here. Two chains
 * reach them, and `--experiment=controls` proves they agree:
 *
 * - the **compiler chain**, `compile()` end to end, reading
 *   `meshes[0].depth.ceiling` out of the result — what an author actually sees;
 * - the **direct chain**, `buildGridMesh` → `sampleLevel`/`toneLevel` (both
 *   `src/depth.ts`'s) → `turnCeiling`, which skips writing a skeleton. The
 *   sweeps use it because they compile hundreds of rungs, and `controls`
 *   requires it to reproduce the compiler's own reported degrees to 1e-9 on
 *   clean, quantised and noisy sheets at two densities before any of them run.
 *
 * ⚠️ One thing here is genuinely this file's own: the **float control**, a
 * bilinear sample of the UNQUANTISED level field. It has to be, because there
 * is no way to hand the compiler a sheet that is not 8 bits — 8 bits is the
 * floor of everything it can be given. `controls` checks that same sampler
 * against `sampleLevel` on an integer field, so what it adds over `src/` is the
 * element type and nothing else.
 */
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, parse } from 'node:path';
import { homedir } from 'node:os';
import { Plate } from '../../../../tools/plate.ts';
import { compile } from '../../../../src/compile.ts';
import { buildGridMesh } from '../../../../src/mesh.ts';
import {
  turnCeiling,
  sampleLevel,
  toneLevel,
  DEPTH_TONE_IDENTITY,
  type DepthMap,
  type TurnCeiling,
} from '../../../../src/depth.ts';
import { skeletonDataFromText, surveyDeformKeys } from '../../../../src/deformmeasure.ts';

// ---------------------------------------------------------------------------
// The part, and the sheet whose ceiling is known in closed form
// ---------------------------------------------------------------------------

/** The same part window the density study used, so the two are comparable. */
const W = 400;
const H = 400;
/** Radius of the raised cosine, in part pixels. */
const R = W / 2;
/** World units the full 0..255 range spans, when the sheet uses all of it. */
const Z_FULL = 60;

/** An ellipse filling most of the window — the density study's part, unchanged. */
function art(x: number, y: number): boolean {
  const u = (x - W / 2) / (W * 0.46);
  const v = (y - H / 2) / (H * 0.46);
  return u * u + v * v <= 1;
}

/**
 * The raised cosine, in levels, as a float field — flat at the centre, flat at
 * the rim, steepest at half radius.
 *
 * ⭐ It is the right base for a noise study for one reason: its slope is
 * BOUNDED, so the density study measured its fold angle to be the same at every
 * mesh density (63–64° from 289 to 32,761 vertices). Anything that moves with
 * density here is therefore the sampling and not the form.
 *
 * `peak` is the level the centre reaches. Lowering it while raising `zScale` by
 * the same factor describes the IDENTICAL physical surface at a coarser
 * quantisation, which is what the amplitude experiment sweeps.
 */
function cosineField(peak: number): Float64Array {
  const out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x - W / 2) / R;
      const v = (y - H / 2) / R;
      const r = Math.min(1, Math.hypot(u, v));
      out[y * W + x] = (peak * (1 + Math.cos(Math.PI * r))) / 2;
    }
  }
  return out;
}

/** The steepest level gradient the continuous cosine has, levels per pixel. */
function peakLevelSlope(peak: number): number {
  return (peak * Math.PI) / (2 * R);
}

/**
 * The closed-form ceiling of the continuous surface: `atan(1 / max|dz/du|)`.
 *
 * `zScale/255 · peakLevelSlope` is `max|dz/du|`, so a sheet with half the peak
 * level and twice the `zScale` gives exactly the same number — which is the
 * point of the amplitude sweep: the FORM is fixed and only its encoding moves.
 */
function continuousCeilingDegrees(peak: number, zScale: number): number {
  const dzdu = (zScale / 255) * peakLevelSlope(peak);
  return (Math.atan(1 / dzdu) * 180) / Math.PI;
}

/**
 * ⭐ The **one-level bound**: no 8-bit sheet can report a ceiling above this.
 *
 * `q = zScale/255` is one quantisation step in world units, and the smallest
 * non-zero depth difference a sheet can put across one mesh cell is exactly one
 * of them. A cell that steps at all steps by at least `q`, so the steepest
 * sampled gradient is at least `q/h` and `tan t = h/q` bounds the answer from
 * above — whatever the form underneath is doing.
 *
 * It falls with the cell, so it TIGHTENS as the mesh refines, and it falls with
 * `zScale`, so it tightens as the sheet spends less of its range on the part.
 */
function oneLevelBoundDegrees(h: number, zScale: number): number {
  return (Math.atan((h * 255) / zScale) * 180) / Math.PI;
}

/**
 * ⭐ The **texel-step floor**: the other end of the same quantisation.
 *
 * Below one texel per cell both bilinear taps of both endpoints fall in one
 * cell, so the sampled gradient stops shrinking with the cell and saturates at
 * the steepest adjacent-texel step `D` the lattice can reach. Refining further
 * finds nothing steeper, and the ceiling stops moving.
 */
function texelStepFloorDegrees(step: number, zScale: number): number {
  return (Math.atan(255 / (zScale * step)) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Sheets: quantise, perturb, write
// ---------------------------------------------------------------------------

function quantise(field: Float64Array): Uint8Array {
  const out = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i++) {
    const v = Math.round(field[i]);
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

/** Deterministic PRNG — a study whose noise is not reproducible measures nothing. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform integer noise on {−amplitude … +amplitude}, added after rounding. */
function addWhiteNoise(level: Uint8Array, amplitude: number, seed: number): Uint8Array {
  const rnd = mulberry32(seed);
  const out = new Uint8Array(level.length);
  const span = 2 * amplitude + 1;
  for (let i = 0; i < level.length; i++) {
    const n = Math.floor(rnd() * span) - amplitude;
    const v = level[i] + n;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

function writeSheet(path: string, level: Uint8Array): void {
  const plate = new Plate(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = level[y * W + x];
      plate.set(x, y, [l, l, l, 255]);
    }
  }
  plate.writePng(path);
}

function writeArt(path: string): void {
  const plate = new Plate(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = ((x >> 4) + (y >> 4)) % 2 === 0 ? 210 : 120;
      plate.set(x, y, [c, c, c, art(x, y) ? 255 : 0]);
    }
  }
  plate.writePng(path);
}

/**
 * The steepest difference between two horizontally adjacent texels, in levels.
 *
 * ⭐ This is the quantisation FLOOR's only free parameter. Once the mesh is
 * finer than a texel both bilinear taps of both endpoints fall in one cell, so
 * the sampled gradient stops shrinking with the cell and saturates here: no
 * refinement can find a slope steeper than the steepest pair of texels.
 */
function maxAdjacentTexelStep(level: Uint8Array): number {
  let worst = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      const d = Math.abs(level[y * W + x + 1] - level[y * W + x]);
      if (d > worst) worst = d;
    }
  }
  return worst;
}

// ---------------------------------------------------------------------------
// The two chains to a ceiling
// ---------------------------------------------------------------------------

/** Even positions across the window, the same spread `cols`/`rows` expands to. */
function spread(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i / (n - 1));
}

/**
 * A narrow band of columns, so a sub-texel cell can be reached without meshing
 * the whole window at that spacing.
 *
 * A `side`-401 lattice over this part is 160,801 vertices; the band is under a
 * thousand and gives the same yaw ceiling, because the yaw ratio is
 * `h_x / Δz_x` with the row spacing cancelling out of it exactly. The band is
 * centred on `x = R/2`, which is where the raised cosine is steepest, so the
 * edge that sets the ceiling is inside it.
 */
function bandColumns(cellPx: number): number[] {
  const from = 0.2 * W;
  const to = 0.3 * W;
  const n = Math.round((to - from) / cellPx) + 1;
  return Array.from({ length: n }, (_, i) => (from + i * cellPx) / W);
}

/** Bilinear sample of a FLOAT field, pixel centres and clamp-to-edge — `sampleLevel`'s twin. */
function sampleFloat(field: Float64Array, x: number, y: number): number {
  const u = x - 0.5;
  const v = y - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const cx = (i: number): number => (i < 0 ? 0 : i > W - 1 ? W - 1 : i);
  const cy = (j: number): number => (j < 0 ? 0 : j > H - 1 ? H - 1 : j);
  const l00 = field[cy(y0) * W + cx(x0)];
  const l10 = field[cy(y0) * W + cx(x0 + 1)];
  const l01 = field[cy(y0 + 1) * W + cx(x0)];
  const l11 = field[cy(y0 + 1) * W + cx(x0 + 1)];
  const top = l00 + (l10 - l00) * fx;
  const bottom = l01 + (l11 - l01) * fx;
  return top + (bottom - top) * fy;
}

export interface Lattice {
  points: Array<[number, number]>;
  triangles: number[];
  /** Bind space is the part grid with y flipped; a translation does not move an area. */
  bind: Array<readonly [number, number]>;
}

export function lattice(us: number[], vs: number[]): Lattice {
  const g = buildGridMesh({ size: [W, H], us, vs });
  return {
    points: g.points,
    triangles: g.triangles,
    bind: g.points.map(([x, y]) => [x, -y] as const),
  };
}

/** The tightest of the four reported ceilings, in degrees; 90 when nothing folds. */
export function tightest(c: TurnCeiling): number {
  const all = [c.yaw.positive, c.yaw.negative, c.pitch.positive, c.pitch.negative];
  let best = 90;
  for (const f of all) if (f !== null && f.degrees < best) best = f.degrees;
  return best;
}

/** The direct chain: `src/`'s sampler and `src/`'s ceiling, with no skeleton written. */
export function directCeiling(lat: Lattice, level: Uint8Array, zScale: number): TurnCeiling {
  const map: DepthMap = { width: W, height: H, level };
  const z = lat.points.map(([x, y]) => toneLevel(sampleLevel(map, x, y), 'white', DEPTH_TONE_IDENTITY) * zScale);
  return turnCeiling(lat.bind, z, lat.triangles);
}

/** The same, on the unquantised field — the reference an 8-bit sheet cannot be. */
export function floatCeiling(lat: Lattice, field: Float64Array, zScale: number): TurnCeiling {
  const z = lat.points.map(([x, y]) => (sampleFloat(field, x, y) / 255) * zScale);
  return turnCeiling(lat.bind, z, lat.triangles);
}

// ---------------------------------------------------------------------------
// The compiler chain
// ---------------------------------------------------------------------------

type Generator = Record<string, unknown>;

function rigSpec(generator: Generator): Record<string, unknown> {
  return {
    spec: 'rigc-rig/1',
    name: 'noise_probe',
    skeleton: { width: 512, height: 512 },
    invariants: { meshSlots: 1, meshTriangles: 1_000_000 },
    bones: [{ name: 'root' }, { name: 'part', parent: 'root', x: 0, y: 0 }],
    slots: [{ name: 'part', bone: 'part', attachment: 'part' }],
    skins: { default: { part: { part: { type: 'mesh', image: 'part.png', generator } } } },
  };
}

function motionSpec(degrees: number): Record<string, unknown> {
  return {
    spec: 'rigc-motion/1',
    archetype: 'noise_probe',
    cut: 'noise_probe',
    easings: {},
    animations: {
      turn: {
        duration: 1,
        tracks: [],
        deform: [
          {
            slot: 'part',
            attachment: 'part',
            keys: [{ t: 1, transform: { kind: 'yaw', depth: true, degrees } }],
          },
        ],
      },
    },
  };
}

export interface CompiledRung {
  ceiling: TurnCeiling;
  range: [number, number];
  skeletonText: string;
  atlasText: string;
}

/** What `build` would print for this sheet and this lattice: the compiler's own number. */
export function compiledCeiling(
  dir: string,
  tag: string,
  us: number[],
  vs: number[],
  sheet: string,
  zScale: number,
  degrees: number,
): CompiledRung {
  const generator = { kind: 'grid', us, vs, depth: { image: sheet, near: 'white', zScale } };
  const rigPath = join(dir, `${tag}.rig.json`);
  const motionPath = join(dir, `${tag}.motion.json`);
  writeFileSync(rigPath, `${JSON.stringify(rigSpec(generator), null, 2)}\n`);
  writeFileSync(motionPath, `${JSON.stringify(motionSpec(degrees), null, 2)}\n`);
  const result = compile({ rigPath, motionPath, outDir: join(dir, `${tag}.spine`), imagesDir: dir });
  const depth = result.meshes[0].depth;
  if (depth === undefined) throw new Error(`${tag}: the compiler reported no depth summary`);
  return {
    ceiling: depth.ceiling,
    range: depth.range,
    skeletonText: result.skeletonText,
    atlasText: result.atlasText,
  };
}

/**
 * The largest whole degree the deform survey admits — the same implementation
 * `A39` refuses from, walked upward one degree at a time.
 *
 * A linear walk, not a bisection, for the density study's reason: nothing has
 * established that the reversal count is monotone in the angle, and bisecting
 * would be quoting that property without having measured it.
 */
export function surveyLimit(
  dir: string,
  tag: string,
  us: number[],
  vs: number[],
  sheet: string,
  zScale: number,
  /**
   * +1 walks the turn one way and −1 the other. It has to be a parameter: the
   * report carries FOUR ceilings and a key turns in exactly one direction, so a
   * positive walk can only ever be the counterpart of `yaw.positive`.
   */
  sign: 1 | -1 = 1,
  ceiling = 89,
): number | null {
  let last: number | null = null;
  for (let deg = 1; deg <= ceiling; deg++) {
    const built = compiledCeiling(dir, tag, us, vs, sheet, zScale, sign * deg);
    const survey = surveyDeformKeys(skeletonDataFromText(built.skeletonText, built.atlasText), new Set());
    if (survey.keys.reduce((n, k) => n + k.reversed.length, 0) > 0) return last;
    last = deg;
  }
  return last;
}

// ---------------------------------------------------------------------------
// The per-triangle distribution, for the diagnostic question
// ---------------------------------------------------------------------------

/**
 * Every triangle's own fold angle, not just the smallest.
 *
 * ⚠️ This is the one place the ceiling's closed form is written twice, and it is
 * deliberate: `turnCeiling` returns a minimum and the question here is what the
 * REST of the distribution looks like — whether a ceiling set by one stray pixel
 * is distinguishable, in a single compile, from one set by the form. Every
 * caller checks its own minimum against `turnCeiling`'s answer and prints the
 * disagreement, so a drift between the two is visible rather than assumed.
 */
export function foldAngles(lat: Lattice, z: number[]): number[] {
  const out: number[] = [];
  const p = lat.bind;
  let largest = 0;
  const areas: number[] = [];
  for (let t = 0; t < lat.triangles.length; t += 3) {
    const [ia, ib, ic] = [lat.triangles[t], lat.triangles[t + 1], lat.triangles[t + 2]];
    const a =
      (p[ib][0] - p[ia][0]) * (p[ic][1] - p[ia][1]) - (p[ic][0] - p[ia][0]) * (p[ib][1] - p[ia][1]);
    areas.push(a);
    if (Math.abs(a) > largest) largest = Math.abs(a);
  }
  const floor = largest * 1e-6;
  for (let t = 0, n = 0; t < lat.triangles.length; t += 3, n++) {
    if (Math.abs(areas[n]) <= floor) continue;
    const [ia, ib, ic] = [lat.triangles[t], lat.triangles[t + 1], lat.triangles[t + 2]];
    const dyb = p[ib][1] - p[ia][1];
    const dyc = p[ic][1] - p[ia][1];
    const dxb = p[ib][0] - p[ia][0];
    const dxc = p[ic][0] - p[ia][0];
    const dzb = z[ib] - z[ia];
    const dzc = z[ic] - z[ia];
    for (const aAxis of [dzb * dyc - dzc * dyb, dxb * dzc - dxc * dzb]) {
      if (aAxis === 0) continue;
      out.push((Math.atan(Math.abs(areas[n] / aAxis)) * 180) / Math.PI);
    }
  }
  return out.sort((a, b) => a - b);
}

export function depthsFor(lat: Lattice, level: Uint8Array, zScale: number): number[] {
  const map: DepthMap = { width: W, height: H, level };
  return lat.points.map(([x, y]) => toneLevel(sampleLevel(map, x, y), 'white', DEPTH_TONE_IDENTITY) * zScale);
}

// ---------------------------------------------------------------------------
// Outlier placement: which texel a vertex actually reads, and how hard
// ---------------------------------------------------------------------------

export interface Tap {
  index: number;
  weight: number;
}

/** The four texels a bilinear sample at `(x, y)` reads, with their weights. */
export function taps(x: number, y: number): Tap[] {
  const u = x - 0.5;
  const v = y - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const cx = (i: number): number => (i < 0 ? 0 : i > W - 1 ? W - 1 : i);
  const cy = (j: number): number => (j < 0 ? 0 : j > H - 1 ? H - 1 : j);
  const out = new Map<number, number>();
  const add = (i: number, j: number, w: number): void => {
    const k = cy(j) * W + cx(i);
    out.set(k, (out.get(k) ?? 0) + w);
  };
  add(x0, y0, (1 - fx) * (1 - fy));
  add(x0 + 1, y0, fx * (1 - fy));
  add(x0, y0 + 1, (1 - fx) * fy);
  add(x0 + 1, y0 + 1, fx * fy);
  return [...out].map(([index, weight]) => ({ index, weight }));
}

/** Every texel any vertex reads with a non-zero weight, and the largest weight each gets. */
export function reach(lat: Lattice): Map<number, number> {
  const out = new Map<number, number>();
  for (const [x, y] of lat.points) {
    for (const t of taps(x, y)) {
      if (t.weight <= 0) continue;
      const held = out.get(t.index);
      if (held === undefined || t.weight > held) out.set(t.index, t.weight);
    }
  }
  return out;
}

/**
 * The texel a lattice reads hardest, **inside the art**, ties to the lowest index.
 *
 * ⚠️ Inside the art on purpose, and it is not the worst case. A grid's corner
 * vertex clamps all four of its taps onto one corner texel, so the hardest-read
 * texel of every lattice here is the window's own corner — outside the
 * silhouette, in the background nobody inspects, and read at weight 1. Aiming
 * the outlier there would be measuring the most flattering possible worst case.
 * The interior figure is the one an author can act on.
 */
export function hottestInArt(r: Map<number, number>): { index: number; weight: number } {
  let index = -1;
  let weight = 0;
  for (const [i, w] of r) {
    if (!art(i % W, Math.floor(i / W))) continue;
    if (w > weight || (w === weight && i < index)) {
      index = i;
      weight = w;
    }
  }
  return { index, weight };
}

/** A texel inside the art that no vertex reads at all; −1 when the lattice reads them all. */
export function unreadInArt(r: Map<number, number>): number {
  for (let i = 0; i < W * H; i++) if (art(i % W, Math.floor(i / W)) && !r.has(i)) return i;
  return -1;
}

// ---------------------------------------------------------------------------
// Reporting helpers
// ---------------------------------------------------------------------------

function f(n: number, places = 2): string {
  return n.toFixed(places);
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

// ---------------------------------------------------------------------------
// The experiments
// ---------------------------------------------------------------------------

/**
 * Whole-window lattices. 181 is the density study's top rung; 401 is h = 1 px
 * exactly and 577 is below it, which is where the sampled slope has to saturate.
 *
 * ⚠️ Nothing in this list is COMPILED. A 577-lattice is 332,929 vertices, and at
 * the density study's measured 449 bytes a vertex that is a 149 MB skeleton for
 * a row of one table. The direct chain reaches the same `turnCeiling` without
 * writing one, and `--experiment=controls` is what earns the right to use it.
 */
const SIDES = [5, 9, 17, 33, 65, 97, 129, 181, 257, 401, 577, 801] as const;
/** Band cells, in part pixels — the sub-texel end the whole-window rungs cannot reach. */
const BAND_CELLS = [4, 2, 1, 0.5, 0.25, 0.125, 0.0625] as const;
/** Peak levels for the bit-depth sweep; `zScale` rises to keep the surface fixed. */
const PEAKS = [255, 128, 64, 32, 16, 8, 4] as const;
/** White-noise amplitudes, in levels. 1 is one LSB. */
const AMPLITUDES = [0, 1, 2, 4, 8, 16, 32] as const;

interface Ctx {
  dir: string;
  seed: number;
}

function header(title: string, ctx: Ctx): void {
  console.log(`# noise probe — ${title}`);
  console.log('');
  console.log(
    `part ${W}x${H}, raised cosine of radius ${R} px, seed ${ctx.seed}, ` +
      `continuous closed form ${f(continuousCeilingDegrees(255, Z_FULL), 2)}° at peak 255 / zScale ${Z_FULL}`,
  );
  console.log(`invocation: bun bench/studies/2026-09-05-noise/tools/noiseprobe.ts <workdir> ${process.argv.slice(3).join(' ')}`);
  console.log('');
}

function experimentControls(ctx: Ctx): void {
  header('controls', ctx);
  const field = cosineField(255);
  const clean = quantise(field);
  const noisy = addWhiteNoise(clean, 4, ctx.seed);
  writeSheet(join(ctx.dir, 'cos255.png'), clean);
  writeSheet(join(ctx.dir, 'cos255_n4.png'), noisy);

  console.log('## The direct chain reproduces the compiler, to the digit');
  console.log('');
  console.log('| lattice | sheet | compiler ° (tightest) | direct ° | |Δ| |');
  console.log('| --- | --- | --- | --- | --- |');
  let worst = 0;
  for (const side of [17, 65] as const) {
    const us = spread(side);
    const lat = lattice(us, us);
    for (const [name, level] of [
      ['cos255.png', clean],
      ['cos255_n4.png', noisy],
    ] as const) {
      const c = compiledCeiling(ctx.dir, `ctl_${side}_${name.replace(/\W/g, '')}`, us, us, name, Z_FULL, 1);
      const d = directCeiling(lat, level, Z_FULL);
      const delta = Math.abs(tightest(c.ceiling) - tightest(d));
      if (delta > worst) worst = delta;
      console.log(`| grid-${side} | ${name} | ${f(tightest(c.ceiling), 9)} | ${f(tightest(d), 9)} | ${delta.toExponential(2)} |`);
    }
  }
  const band = bandColumns(1);
  const bandLat = lattice(band, [0, 0.5, 1]);
  {
    const c = compiledCeiling(ctx.dir, 'ctl_band', band, [0, 0.5, 1], 'cos255.png', Z_FULL, 1);
    const d = directCeiling(bandLat, clean, Z_FULL);
    const delta = Math.abs(tightest(c.ceiling) - tightest(d));
    if (delta > worst) worst = delta;
    console.log(`| band-1px | cos255.png | ${f(tightest(c.ceiling), 9)} | ${f(tightest(d), 9)} | ${delta.toExponential(2)} |`);
  }
  console.log('');
  console.log(`worst disagreement over the table: ${worst.toExponential(2)} degrees`);

  console.log('');
  console.log('## The float sampler reproduces `sampleLevel` on an integer field');
  console.log('');
  const asFloat = Float64Array.from(clean);
  const lat65 = lattice(spread(65), spread(65));
  const map: DepthMap = { width: W, height: H, level: clean };
  let sampWorst = 0;
  for (const [x, y] of lat65.points) {
    const a = sampleLevel(map, x, y);
    const b = sampleFloat(asFloat, x, y);
    const d = Math.abs(a - b);
    if (d > sampWorst) sampWorst = d;
  }
  console.log(`4,225 vertices, worst |sampleLevel − sampleFloat|: ${sampWorst.toExponential(2)} levels`);

  console.log('');
  console.log('## `foldAngles` reproduces `turnCeiling`\'s minimum');
  console.log('');
  console.log('| lattice | sheet | turnCeiling ° | min foldAngles ° | |Δ| |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const [tag, level] of [
    ['clean', clean],
    ['±4 LSB', noisy],
  ] as const) {
    const z = depthsFor(lat65, level, Z_FULL);
    const tc = tightest(turnCeiling(lat65.bind, z, lat65.triangles));
    const fa = foldAngles(lat65, z)[0];
    console.log(`| grid-65 | ${tag} | ${f(tc, 9)} | ${f(fa, 9)} | ${Math.abs(tc - fa).toExponential(2)} |`);
  }

  console.log('');
  console.log('## The sheets, as written');
  console.log('');
  console.log('| sheet | peak level | zScale | steepest adjacent-texel step (levels) |');
  console.log('| --- | --- | --- | --- |');
  for (const peak of PEAKS) {
    const lv = quantise(cosineField(peak));
    console.log(`| cosine peak ${peak} | ${peak} | ${f((Z_FULL * 255) / peak, 3)} | ${maxAdjacentTexelStep(lv)} |`);
  }
  for (const a of AMPLITUDES) {
    if (a === 0) continue;
    const lv = addWhiteNoise(clean, a, ctx.seed);
    console.log(`| cosine peak 255 + ±${a} LSB | 255 | ${Z_FULL} | ${maxAdjacentTexelStep(lv)} |`);
  }

  console.log('');
  console.log('## How much of the sheet each lattice can see');
  console.log('');
  console.log('| lattice | vertices | texels read | share of the 160,000 | largest single-texel weight |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const side of SIDES) {
    const us = spread(side);
    const lat = lattice(us, us);
    const r = reach(lat);
    let maxW = 0;
    for (const w of r.values()) if (w > maxW) maxW = w;
    console.log(
      `| grid-${side} | ${lat.points.length} | ${r.size} | ${f((100 * r.size) / (W * H), 2)} % | ${f(maxW, 4)} |`,
    );
  }
}

function experimentQuant(ctx: Ctx): void {
  header('8-bit quantisation against mesh density', ctx);
  const field = cosineField(255);
  const level = quantise(field);
  const step = maxAdjacentTexelStep(level);
  const floorDeg = texelStepFloorDegrees(step, Z_FULL);
  console.log(
    `steepest adjacent-texel step ${step} levels ⇒ predicted saturation floor ` +
      `atan(255 / (${Z_FULL} × ${step})) = ${f(floorDeg, 2)}°`,
  );
  console.log('');
  console.log(
    '| lattice | cell h px | vertices | 8-bit ° | unquantised ° | closed form ° | 8-bit − unquantised | ' +
      'one-level bound ° | texel-step floor ° |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const closed = continuousCeilingDegrees(255, Z_FULL);
  const row = (label: string, h: number, lat: Lattice): void => {
    const q = tightest(directCeiling(lat, level, Z_FULL));
    const c = tightest(floatCeiling(lat, field, Z_FULL));
    console.log(
      `| ${label} | ${f(h, 3)} | ${lat.points.length} | ${f(q)} | ${f(c)} | ${f(closed)} | ${f(q - c)} | ` +
        `${f(oneLevelBoundDegrees(h, Z_FULL))} | ${f(floorDeg)} |`,
    );
  };
  for (const side of SIDES) row(`grid-${side}`, W / (side - 1), lattice(spread(side), spread(side)));
  for (const cell of BAND_CELLS) row(`band-${cell}px`, cell, lattice(bandColumns(cell), [0, 0.5, 1]));
}

function experimentAmplitude(ctx: Ctx): void {
  header('bit-depth utilisation — one surface, seven encodings', ctx);
  console.log('`zScale` rises as the peak level falls, so every row describes the SAME physical surface.');
  console.log('');
  console.log(
    '| peak level | zScale | lattice | levels per cell | 8-bit ° | unquantised ° | closed form ° | cost ° | ' +
      'one-level bound ° |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const side of [33, 65, 129] as const) {
    const us = spread(side);
    const lat = lattice(us, us);
    const h = W / (side - 1);
    for (const peak of PEAKS) {
      const zScale = (Z_FULL * 255) / peak;
      const field = cosineField(peak);
      const level = quantise(field);
      const q = tightest(directCeiling(lat, level, zScale));
      const c = tightest(floatCeiling(lat, field, zScale));
      console.log(
        `| ${peak} | ${f(zScale, 2)} | grid-${side} | ${f(peakLevelSlope(peak) * h)} | ${f(q)} | ${f(c)} | ` +
          `${f(continuousCeilingDegrees(peak, zScale))} | ${f(c - q)} | ${f(oneLevelBoundDegrees(h, zScale))} |`,
      );
    }
  }
}

function experimentWhite(ctx: Ctx): void {
  header('per-pixel white noise against amplitude and density', ctx);
  const field = cosineField(255);
  const clean = quantise(field);
  console.log('Each cell: the tightest reported ceiling, degrees. Row 0 is the 8-bit sheet with nothing added.');
  console.log('');
  const sides = [17, 33, 65, 129, 257] as const;
  console.log(`| ±LSB | ${sides.map((s) => `grid-${s}`).join(' | ')} |`);
  console.log(`| --- | ${sides.map(() => '---').join(' | ')} |`);
  const lats = sides.map((s) => lattice(spread(s), spread(s)));
  for (const a of AMPLITUDES) {
    const level = a === 0 ? clean : addWhiteNoise(clean, a, ctx.seed);
    const row = lats.map((lat) => f(tightest(directCeiling(lat, level, Z_FULL))));
    console.log(`| ${a} | ${row.join(' | ')} |`);
  }
  console.log('');
  console.log('## The same, as the tangent the ceiling actually is');
  console.log('');
  console.log('`tan t` is what the arithmetic is linear in; degrees compress the top of the range.');
  console.log('');
  console.log(`| ±LSB | ${sides.map((s) => `grid-${s}`).join(' | ')} |`);
  console.log(`| --- | ${sides.map(() => '---').join(' | ')} |`);
  for (const a of AMPLITUDES) {
    const level = a === 0 ? clean : addWhiteNoise(clean, a, ctx.seed);
    const row = lats.map((lat) => f(Math.tan((tightest(directCeiling(lat, level, Z_FULL)) * Math.PI) / 180), 4));
    console.log(`| ${a} | ${row.join(' | ')} |`);
  }
  console.log('');
  console.log('## The level gradient the noise actually added');
  console.log('');
  console.log(
    'A ceiling IS a sampled gradient: `Δlevel = 255·h / (zScale·tan t)`. Subtracting row 0\'s from each row\'s ' +
      'gives the excess levels the noise put across the steepest cell — no model, just the identity inverted.',
  );
  console.log('');
  console.log(`| ±LSB | ${sides.map((s) => `grid-${s}`).join(' | ')} | mean excess ÷ ±LSB |`);
  console.log(`| --- | ${sides.map(() => '---').join(' | ')} | --- |`);
  const baseline = lats.map((lat) => tightest(directCeiling(lat, clean, Z_FULL)));
  for (const a of AMPLITUDES) {
    if (a === 0) continue;
    const level = addWhiteNoise(clean, a, ctx.seed);
    const excess = lats.map((lat, i) => {
      const h = W / (sides[i] - 1);
      const t = tightest(directCeiling(lat, level, Z_FULL));
      const dl = (x: number): number => (255 * h) / (Z_FULL * Math.tan((x * Math.PI) / 180));
      return dl(t) - dl(baseline[i]);
    });
    console.log(
      `| ${a} | ${excess.map((e) => f(e)).join(' | ')} | ${f(excess.reduce((x, y) => x + y, 0) / excess.length / a)} |`,
    );
  }
  console.log('');
  console.log('## Seed stability — five seeds at ±1 LSB');
  console.log('');
  console.log('| lattice | ' + [0, 1, 2, 3, 4].map((i) => `seed ${ctx.seed + i}`).join(' | ') + ' | spread |');
  console.log(`| --- | ${[0, 1, 2, 3, 4].map(() => '---').join(' | ')} | --- |`);
  for (let i = 0; i < sides.length; i++) {
    const readings = [0, 1, 2, 3, 4].map((k) =>
      tightest(directCeiling(lats[i], addWhiteNoise(clean, 1, ctx.seed + k), Z_FULL)),
    );
    console.log(
      `| grid-${sides[i]} | ${readings.map((r) => f(r)).join(' | ')} | ${f(Math.max(...readings) - Math.min(...readings))} |`,
    );
  }
}

function experimentOutlier(ctx: Ctx): void {
  header('one stray pixel', ctx);
  const field = cosineField(255);
  const clean = quantise(field);
  const lat = lattice(spread(65), spread(65));
  const base = tightest(directCeiling(lat, clean, Z_FULL));
  const r = reach(lat);

  const { index: hot, weight: hotW } = hottestInArt(r);
  // And the control: a texel inside the art that NO vertex reads at all.
  const cold = unreadInArt(r);
  console.log(
    `grid-65 reads ${r.size} of ${W * H} texels (${f((100 * r.size) / (W * H), 2)} %). ` +
      `Hottest texel inside the art (${hot % W}, ${Math.floor(hot / W)}) at weight ${f(hotW, 4)}; ` +
      `unread control texel (${cold % W}, ${Math.floor(cold / W)}).`,
  );
  console.log(`clean 8-bit ceiling: ${f(base)}°`);
  console.log('');
  console.log('| δ levels | on the hottest read texel ° | on an unread texel ° | predicted from w·δ ° |');
  console.log('| --- | --- | --- | --- |');
  const h = W / 64;
  for (const delta of [1, 2, 4, 8, 16, 22, 32, 64, 128, 255] as const) {
    const hotSheet = Uint8Array.from(clean);
    hotSheet[hot] = Math.max(0, Math.min(255, clean[hot] + delta));
    const coldSheet = Uint8Array.from(clean);
    coldSheet[cold] = Math.max(0, Math.min(255, clean[cold] + delta));
    const hotDeg = tightest(directCeiling(lat, hotSheet, Z_FULL));
    const coldDeg = tightest(directCeiling(lat, coldSheet, Z_FULL));
    // The edge the outlier lands on carries the sheet's own secant too; this is
    // the outlier acting alone, which is the upper bound on the ceiling it sets.
    const pred = (Math.atan((h * 255) / (Z_FULL * hotW * delta)) * 180) / Math.PI;
    console.log(`| ${delta} | ${f(hotDeg)} | ${f(coldDeg)} | ${f(Math.min(base, pred))} |`);
  }

  console.log('');
  console.log('## The same stray pixel against density');
  console.log('');
  console.log(
    'One texel driven to whichever end of the range is further from what it held, at each lattice\'s own ' +
      'hardest-read texel inside the art, and at a texel that lattice cannot read at all.',
  );
  console.log('');
  console.log('| lattice | texels read | largest weight in art | δ levels | clean ° | hottest-texel ° | unread-texel ° |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  // Driving the texel to the far end of the range rather than to zero: a texel
  // near the rim of this sheet already HOLDS a level near zero, so "set it to 0"
  // is a δ of four levels there and of 255 at the centre. The row would then be
  // reporting where the hottest texel happened to sit.
  const extreme = (v: number): number => (v < 128 ? 255 : 0);
  for (const side of SIDES) {
    const us = spread(side);
    const l = lattice(us, us);
    const rr = reach(l);
    const { index: hi, weight: hw } = hottestInArt(rr);
    const lo = unreadInArt(rr);
    const cleanDeg = tightest(directCeiling(l, clean, Z_FULL));
    const hotSheet = Uint8Array.from(clean);
    hotSheet[hi] = extreme(clean[hi]);
    const hotDeg = tightest(directCeiling(l, hotSheet, Z_FULL));
    let coldDeg = NaN;
    if (lo >= 0) {
      const coldSheet = Uint8Array.from(clean);
      coldSheet[lo] = extreme(clean[lo]);
      coldDeg = tightest(directCeiling(l, coldSheet, Z_FULL));
    }
    console.log(
      `| grid-${side} | ${f((100 * rr.size) / (W * H), 2)} % | ${f(hw, 4)} | ` +
        `${Math.abs(extreme(clean[hi]) - clean[hi])} | ${f(cleanDeg)} | ${f(hotDeg)} | ` +
        `${Number.isNaN(coldDeg) ? 'no unread texel inside the art' : f(coldDeg)} |`,
    );
  }
}

function experimentA39(ctx: Ctx): void {
  header('does the runtime agree — the reported ceiling against what the deform survey refuses', ctx);
  const field = cosineField(255);
  const clean = quantise(field);
  /**
   * The four sheets, built per lattice — the stray pixel has to be aimed at the
   * texel THIS lattice reads hardest, or the row is reporting whether one
   * lattice happens to sample another lattice's chosen texel.
   */
  const casesFor = (side: number): Array<{ tag: string; level: Uint8Array }> => {
    const lat = lattice(spread(side), spread(side));
    const { index } = hottestInArt(reach(lat));
    const stray = Uint8Array.from(clean);
    const to = clean[index] < 128 ? 255 : 0;
    const delta = Math.abs(to - clean[index]);
    stray[index] = to;
    return [
      { tag: 'clean 8-bit', level: clean },
      { tag: '±1 LSB', level: addWhiteNoise(clean, 1, ctx.seed) },
      { tag: '±8 LSB', level: addWhiteNoise(clean, 8, ctx.seed) },
      { tag: `one stray pixel (δ ${delta})`, level: stray },
    ];
  };
  console.log(
    '| sheet | lattice | yaw+ ° | walk + admits | yaw− ° | walk − admits | pitch+ ° | pitch− ° | worst |floor − walk| |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  let worstGap = 0;
  for (const side of [33, 65] as const) {
    const us = spread(side);
    for (const c of casesFor(side)) {
      const key = `${side}_${c.tag.replace(/\W/g, '')}`;
      const name = `a39_${key}.png`;
      writeSheet(join(ctx.dir, name), c.level);
      const built = compiledCeiling(ctx.dir, `a39_${key}`, us, us, name, Z_FULL, 1);
      const cl = built.ceiling;
      const yp = cl.yaw.positive?.degrees ?? 90;
      const yn = cl.yaw.negative?.degrees ?? 90;
      const wp = surveyLimit(ctx.dir, `walkp_${key}`, us, us, name, Z_FULL, 1);
      const wn = surveyLimit(ctx.dir, `walkn_${key}`, us, us, name, Z_FULL, -1);
      const gap = Math.max(
        Math.abs(Math.floor(yp) - (wp ?? 0)),
        Math.abs(Math.floor(yn) - (wn ?? 0)),
      );
      if (gap > worstGap) worstGap = gap;
      console.log(
        `| ${c.tag} | grid-${side} | ${f(yp)} | ${wp ?? '—'} | ${f(yn)} | ${wn ?? '—'} | ` +
          `${f(cl.pitch.positive?.degrees ?? 90)} | ${f(cl.pitch.negative?.degrees ?? 90)} | ${gap} |`,
      );
    }
  }
  console.log('');
  console.log(`worst |floor(reported) − last degree admitted| over the table: ${worstGap}°`);
}

function experimentShape(ctx: Ctx): void {
  header('the shape of the distribution — can one compile tell noise from form', ctx);
  const field = cosineField(255);
  const clean = quantise(field);
  const lat = lattice(spread(65), spread(65));
  const stray = Uint8Array.from(clean);
  // The same texel and the same δ rule the outlier and A39 experiments use, so
  // the three tables are describing one perturbation and not three.
  const strayAt = hottestInArt(reach(lat)).index;
  const strayTo = clean[strayAt] < 128 ? 255 : 0;
  const strayDelta = Math.abs(strayTo - clean[strayAt]);
  stray[strayAt] = strayTo;
  const sheets: Array<[string, Uint8Array]> = [
    ['clean 8-bit', clean],
    ['±1 LSB', addWhiteNoise(clean, 1, ctx.seed)],
    ['±8 LSB', addWhiteNoise(clean, 8, ctx.seed)],
    ['±32 LSB', addWhiteNoise(clean, 32, ctx.seed)],
    [`one stray pixel (δ ${strayDelta})`, stray],
  ];
  console.log('Per-triangle fold angles at grid-65, 8,192 triangles × 2 axes.');
  console.log('');
  console.log('| sheet | min (= ceiling) ° | p0.1 ° | p1 ° | p50 ° | within 5 % of min | share | p1 / min |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [tag, level] of sheets) {
    const z = depthsFor(lat, level, Z_FULL);
    const angles = foldAngles(lat, z);
    const min = angles[0];
    const near = angles.filter((a) => a <= min * 1.05).length;
    console.log(
      `| ${tag} | ${f(min)} | ${f(quantile(angles, 0.001))} | ${f(quantile(angles, 0.01))} | ` +
        `${f(quantile(angles, 0.5))} | ${near} / ${angles.length} | ${f((100 * near) / angles.length, 3)} % | ` +
        `${f(quantile(angles, 0.01) / min, 3)} |`,
    );
  }
  console.log('');
  console.log('## The same five sheets at grid-17, where a coarse lattice barely reads the map');
  console.log('');
  const lat17 = lattice(spread(17), spread(17));
  console.log('| sheet | min ° | p1 ° | p50 ° | within 5 % of min | share | p1 / min |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [tag, level] of sheets) {
    const z = depthsFor(lat17, level, Z_FULL);
    const angles = foldAngles(lat17, z);
    const min = angles[0];
    const near = angles.filter((a) => a <= min * 1.05).length;
    console.log(
      `| ${tag} | ${f(min)} | ${f(quantile(angles, 0.01))} | ${f(quantile(angles, 0.5))} | ` +
        `${near} / ${angles.length} | ${f((100 * near) / angles.length, 3)} % | ` +
        `${f(quantile(angles, 0.01) / min, 3)} |`,
    );
  }
}

const EXPERIMENTS: Record<string, (ctx: Ctx) => void> = {
  controls: experimentControls,
  quant: experimentQuant,
  amplitude: experimentAmplitude,
  white: experimentWhite,
  outlier: experimentOutlier,
  a39: experimentA39,
  shape: experimentShape,
};

/**
 * The repository this file lives in, from the file rather than from the caller.
 *
 * ⚠️ **Not `process.cwd()`.** The guard below refuses a work directory inside
 * the repository, and a guard that asks the caller where the repository is can
 * be walked around by standing somewhere else. `tools` → the study → `studies`
 * → `bench` → the root is four levels, and it is fixed by this file's own path.
 */
export const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..');

/**
 * Why the work directory is checked and not merely documented.
 *
 * The paragraph that used to sit at the call site explained at length that the
 * directory has to be outside the repository — the density study's harness had
 * a default inside the tree and the motion specs it left there were swept up by
 * the selftest's own walk, inflating that count from 38 to 66 — and then the
 * code only asked. The next line is `rmSync(dir, { recursive: true, force:
 * true })`, so `noiseprobe.ts src --experiment=quant` deleted `src/`. That is
 * not the drift the paragraph was about; it is strictly worse, because a
 * polluted count is visible in the next run and a deleted directory is not.
 *
 * ⭐ So the rule is enforced here, by name, and `evidence/guard.txt` is the
 * record of all four refusals actually firing. An unexercised guard is the same
 * thing as an unexercised assertion.
 *
 * @returns the resolved absolute path, or a refusal to print.
 */
export function checkWorkDir(dir: string): { ok: true; path: string } | { ok: false; why: string } {
  // An unexpanded tilde, refused for what it MEANT rather than for where it
  // lands. Quoted, `~` is an ordinary relative path and `resolve` makes it a
  // directory literally named "~" beside the caller — which the repository rule
  // below catches only when the caller happens to be standing in the tree. The
  // intent was the home directory either way, and both readings are refusals.
  if (dir === '~' || dir.startsWith('~/')) {
    return {
      ok: false,
      why:
        `noiseprobe: "${dir}" begins with a tilde the shell did not expand, so it would resolve to ` +
        `${resolve(dir)} — a directory literally named "~", not a path under ${resolve(homedir())}. The work ` +
        'directory is created and DELETED recursively on every run, so it is given as a path that is already ' +
        'expanded: drop the quotes, or write it out in full.',
    };
  }
  const path = resolve(dir);
  const root = parse(path).root;
  const home = resolve(homedir());
  if (path === root) {
    return { ok: false, why: `noiseprobe: "${dir}" resolves to ${path}, the filesystem root; the work directory is created and DELETED on every run, so it is a directory of its own` };
  }
  if (path === home) {
    return { ok: false, why: `noiseprobe: "${dir}" resolves to ${path}, the home directory; the work directory is created and DELETED on every run, so it is a directory of its own` };
  }
  // `relative` rather than a prefix test: "…/rigc-elsewhere" starts with the
  // root's characters and is not inside it, and a `..` first segment is the
  // only honest way to say "outside".
  const rel = relative(REPO_ROOT, path);
  const inside = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  if (path === REPO_ROOT || inside) {
    return {
      ok: false,
      why:
        `noiseprobe: "${dir}" resolves to ${path}, which is inside the repository at ${REPO_ROOT}; ` +
        'the work directory is created and DELETED on every run, so it must be outside it. It also has to ' +
        'be, for the reason the density study learned: a harness that writes into the tree it measures gets ' +
        "its own leavings swept up by the selftest's walk over every motion spec.",
    };
  }
  let kind: string | null = null;
  try {
    const st = statSync(path);
    kind = st.isDirectory() ? null : st.isFile() ? 'a file' : st.isSymbolicLink() ? 'a symlink' : 'not a directory';
  } catch {
    // Absent is the ordinary case — the run creates it.
  }
  if (kind !== null) {
    return {
      ok: false,
      why:
        `noiseprobe: "${dir}" resolves to ${path}, which exists and is ${kind}; the work directory is created ` +
        'and DELETED recursively on every run, so it is a directory this harness owns or a path that does not exist yet',
    };
  }
  return { ok: true, path };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  const name = args.find((a) => a.startsWith('--experiment='))?.slice(13);
  if (dir === undefined || name === undefined || EXPERIMENTS[name] === undefined) {
    console.error('usage: bun bench/studies/2026-09-05-noise/tools/noiseprobe.ts <workdir> --experiment=<name> [--seed=N]');
    console.error(`       <name> is one of: ${Object.keys(EXPERIMENTS).join(', ')}`);
    console.error('       <workdir> is created and DELETED RECURSIVELY on every run; it must be outside the');
    console.error(`       repository at ${REPO_ROOT}.`);
    process.exit(2);
  }
  const checked = checkWorkDir(dir);
  if (!checked.ok) {
    console.error(checked.why);
    process.exit(2);
  }
  const seed = Number(args.find((a) => a.startsWith('--seed='))?.slice(7) ?? 20260905);
  // Said before it happens, not after: the one line that would have made the
  // hazard visible the first time somebody mistyped the argument.
  console.error(`noiseprobe: removing and recreating ${checked.path}`);
  rmSync(checked.path, { recursive: true, force: true });
  mkdirSync(checked.path, { recursive: true });
  writeArt(join(checked.path, 'part.png'));
  EXPERIMENTS[name]({ dir: checked.path, seed });
}
