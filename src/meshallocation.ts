/**
 * Where a mesh's vertices sit, read as five `undeclared` rows of
 * `mesh-quality-report/1` (issue #1280, Stage B of #1271): docs/MESH_REDUCTION.md
 * §8, *Measured — spatial measurements of allocation*, gives each definition
 * and the fixtures it separates; this module computes them for
 * `measureMeshQuality` (`src/meshquality.ts`), which turns them into rows.
 *
 * - `MQ_GRADE` — the largest |h_u − h_v| / L over the mesh's edges, h a
 *   vertex's mean incident edge length: an uncontrolled transition, dense
 *   beside sparse, whether or not the density is justified.
 * - `MQ_MIN_ANGLE_P10` — the tenth percentile of the triangles' smallest
 *   angles: the sliver fans a dense boundary leaves against an emptied interior.
 * - `MQ_ALLOCATION_CONTRAST` — Δ, the share of the dense vertices removable
 *   alone by a half-edge collapse judged against declared needs only, minus
 *   that share among the rest; economy E, the share of all, beside it.
 * - `MQ_DEFORM_LOAD` — the largest L · Δshare · θ / 4 over the edges: the chord
 *   error bound of the mesh's own weight field under the declared amplitude.
 *   A location reading; it is not predicted motion (§8's correction).
 * - `MQ_BOUNDARY_NECESSARY` — B\*, the fewest vertices of the reference hull a
 *   closed outline can keep with every skipped run within the declared
 *   deviation of its chord both ways and no art pixel centre cut off.
 *
 * None of them takes a bound: there is no field to declare one in, so every
 * row is `undeclared` when measured and `not-measurable`, with a reason
 * naming what is missing, when not. None is required, so none can block a
 * step, refuse a source or satisfy acceptance.
 *
 * Pure, as `src/meshquality.ts` is: no clock, no randomness, no runtime. Every
 * loop runs in index order and every sort breaks its ties by index, so one
 * input reads one answer (A18's standard).
 *
 * ⚠️ This module and `src/meshquality.ts` import each other. As with
 * `src/mesh.ts`, it is safe only because neither reads the other's bindings at
 * the top level: every use is inside a function.
 */
import { distanceToSegment, r6, type AlphaMask } from './mesh.ts';
import { closedPolygonCentres, inClosedPolygon, regionEdgeBound, type MotionAmplitude, type RefinementRegion } from './meshquality.ts';

type Pt = readonly [number, number];
type Weights = ReadonlyArray<ReadonlyArray<{ bone: string; weight: number }>>;

/**
 * A fault planted on purpose, for the `mesh-quality` suite's negative controls
 * (MQ120 onward). `measureMeshQuality` plants none.
 *
 * - `omit-rows`: no allocation row at all — the report as it was before #1280,
 *   the baseline the opt-out identity is held to.
 * - `grade-undivided`: |h_u − h_v| not divided by L.
 * - `p10-is-min`: the minimum angle reported as the tenth percentile.
 * - `contrast-without-amplitude`: Δ measured with no declared amplitude, the
 *   reading §8 rejected (the deformation need is then absent).
 * - `load-without-theta`: the load reported as L · Δshare / 4, θ dropped.
 * - `undeclared-pair-is-rigid`: a pair of bones no track declares read as θ 0.
 * - `bstar-ignores-art`: B\* without the art test.
 * - `rows-required`: the rows counted as required.
 * - `mutates-input`: the measurement sorts the caller's triangle list in place.
 */
export type AllocationPlant =
  | 'omit-rows'
  | 'grade-undivided'
  | 'p10-is-min'
  | 'contrast-without-amplitude'
  | 'load-without-theta'
  | 'undeclared-pair-is-rigid'
  | 'bstar-ignores-art'
  | 'rows-required'
  | 'mutates-input';

/** The art as the allocation rows read it: art pixels on the mask's grid, and the scale that grid is at. */
export interface AllocationArt {
  mask: AlphaMask;
  /** 1 where the pixel is art (`alpha >= threshold`). */
  bits: Uint8Array;
  /** `pageScale`: texels = drawing px × scale. */
  scale: number;
}

/** A measured reading, or the sentence saying why there is none. */
export type Reading<T> = { measured: true; value: T } | { measured: false; reason: string };

const unmeasured = (reason: string): { measured: false; reason: string } => ({ measured: false, reason });

/** The mesh's unique edges, `[low, high]`, sorted — each encoded as low × n + high and sorted as numbers. */
function uniqueEdges(triangles: readonly number[]): Array<[number, number]> {
  let n = 0;
  for (const v of triangles) n = Math.max(n, v + 1);
  const seen = new Set<number>();
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = triangles[t + k];
      const b = triangles[t + ((k + 1) % 3)];
      seen.add(Math.min(a, b) * n + Math.max(a, b));
    }
  }
  const keys = Float64Array.from(seen).sort();
  const out: Array<[number, number]> = [];
  for (const key of keys) out.push([Math.floor(key / n), key % n]);
  return out;
}

const lengthOf = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Nearest rank at index round((n − 1) · p) of the values sorted ascending, ties by index — §8's percentile rule —
 * as the index of the value at that rank: the values sorted as numbers, then, among the indices holding the value
 * found, the one the rank falls on in ascending index order.
 */
function rankOf(values: readonly number[], p: number): number {
  const sorted = Float64Array.from(values).sort();
  const rank = Math.round((sorted.length - 1) * p);
  const value = sorted[rank];
  let below = 0;
  while (below < rank && sorted[below] < value) below++;
  let seen = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== value) continue;
    if (seen === rank - below) return i;
    seen++;
  }
  return values.indexOf(value);
}

// ---------------------------------------------------------------------------
// MQ_GRADE
// ---------------------------------------------------------------------------

/** The largest |h_u − h_v| / L, and the edge it is taken on (the first in sorted order on a tie). */
export function gradeMax(points: readonly Pt[], triangles: readonly number[], plant: AllocationPlant | null): Reading<{ value: number; edge: [number, number] }> {
  const edges = uniqueEdges(triangles);
  const sum = new Array<number>(points.length).fill(0);
  const count = new Array<number>(points.length).fill(0);
  const lengths: number[] = [];
  for (const [u, v] of edges) {
    const L = lengthOf(points[u], points[v]);
    if (!(L > 0)) return unmeasured(`edge [${u}, ${v}] has zero length, so |h_u − h_v| / L has no value on it`);
    lengths.push(L);
    sum[u] += L;
    sum[v] += L;
    count[u]++;
    count[v]++;
  }
  if (edges.length === 0) return unmeasured('the mesh has no edge');
  const h = sum.map((s, i) => (count[i] > 0 ? s / count[i] : 0));
  let best = -1;
  let at = edges[0];
  edges.forEach(([u, v], i) => {
    const g = plant === 'grade-undivided' ? Math.abs(h[u] - h[v]) : Math.abs(h[u] - h[v]) / lengths[i];
    if (g > best) {
      best = g;
      at = [u, v];
    }
  });
  return { measured: true, value: { value: r6(best), edge: at } };
}

// ---------------------------------------------------------------------------
// MQ_MIN_ANGLE_P10
// ---------------------------------------------------------------------------

/** Each triangle's smallest interior angle, degrees — `MQ_MIN_ANGLE`'s own formula. */
export function smallestAngles(points: readonly Pt[], triangles: readonly number[]): number[] {
  const out: number[] = [];
  for (let t = 0; t * 3 + 2 < triangles.length; t++) {
    const corner = [points[triangles[t * 3]], points[triangles[t * 3 + 1]], points[triangles[t * 3 + 2]]];
    let smallest = Infinity;
    for (let k = 0; k < 3; k++) {
      const o = corner[k];
      const p = corner[(k + 1) % 3];
      const q = corner[(k + 2) % 3];
      const ux = p[0] - o[0];
      const uy = p[1] - o[1];
      const vx = q[0] - o[0];
      const vy = q[1] - o[1];
      smallest = Math.min(smallest, (Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy) * 180) / Math.PI);
    }
    out.push(smallest);
  }
  return out;
}

/** The tenth percentile of the triangles' smallest angles, and the triangle it is read at. */
export function minAngleP10(points: readonly Pt[], triangles: readonly number[], plant: AllocationPlant | null): Reading<{ value: number; triangle: number }> {
  const angles = smallestAngles(points, triangles);
  if (angles.length === 0) return unmeasured('the mesh has no triangle');
  const t = rankOf(angles, plant === 'p10-is-min' ? 0 : 0.1);
  return { measured: true, value: { value: r6(angles[t]), triangle: t } };
}

// ---------------------------------------------------------------------------
// the declared amplitude, per pair of bones
// ---------------------------------------------------------------------------

/** Half the L1 distance between two weight vectors: the share of weight that moves across an edge. */
export function shareJump(a: ReadonlyArray<{ bone: string; weight: number }>, b: ReadonlyArray<{ bone: string; weight: number }>): number {
  const d = deltaOf(a, b);
  let s = 0;
  for (const bone of [...d.keys()].sort()) s += Math.abs(d.get(bone)!);
  return s / 2;
}

function deltaOf(a: ReadonlyArray<{ bone: string; weight: number }>, b: ReadonlyArray<{ bone: string; weight: number }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of a) m.set(x.bone, (m.get(x.bone) ?? 0) + x.weight);
  for (const x of b) m.set(x.bone, (m.get(x.bone) ?? 0) - x.weight);
  return m;
}

const pairKey = (p: string, q: string): string => (p < q ? `${p}\u0000${q}` : `${q}\u0000${p}`);

/**
 * The declared amplitude read per pair of bones: the largest θ, and the
 * largest θ / ε, any track declares for the pair. A share moving across an
 * edge from bones that lose it to bones that gain it is a flow between such
 * pairs, and |Σ Δw_b R_b| ≤ Σ flow · θ_pair ≤ Δshare · max θ_pair — so the
 * largest over the pairs an edge moves a share between bounds it.
 */
export class PairAmplitudes {
  private readonly theta = new Map<string, number>();
  private readonly ratio = new Map<string, number>();
  /** The first pair a share moved between that no track declares, in the order the measurement met it. */
  missing: { bones: [string, string]; edge: [number, number] } | null = null;

  constructor(
    declared: MotionAmplitude,
    private readonly plant: AllocationPlant | null,
  ) {
    for (const track of declared.tracks) {
      for (const pair of track.pairs) {
        const key = pairKey(pair.bones[0], pair.bones[1]);
        this.theta.set(key, Math.max(this.theta.get(key) ?? 0, pair.theta));
        this.ratio.set(key, Math.max(this.ratio.get(key) ?? 0, pair.theta / track.epsilon));
      }
    }
  }

  /** The largest declared θ and θ / ε over the pairs a share moves between across `a`→`b`; null when a pair is undeclared. */
  across(a: ReadonlyArray<{ bone: string; weight: number }>, b: ReadonlyArray<{ bone: string; weight: number }>, edge: [number, number]): { theta: number; ratio: number } | null {
    const d = deltaOf(a, b);
    const bones = [...d.keys()].sort();
    const gain = bones.filter((x) => d.get(x)! > 0);
    const loss = bones.filter((x) => d.get(x)! < 0);
    let theta = 0;
    let ratio = 0;
    for (const g of gain) {
      for (const l of loss) {
        const key = pairKey(g, l);
        const t = this.theta.get(key);
        if (t === undefined) {
          if (this.plant === 'undeclared-pair-is-rigid') continue;
          if (this.missing === null) this.missing = { bones: g < l ? [g, l] : [l, g], edge };
          return null;
        }
        theta = Math.max(theta, t);
        ratio = Math.max(ratio, this.ratio.get(key)!);
      }
    }
    return { theta, ratio };
  }
}

function undeclaredPairReason(missing: NonNullable<PairAmplitudes['missing']>): string {
  return (
    `motionAmplitude declares no track moving bones "${missing.bones[0]}" and "${missing.bones[1]}", and a share moves between them across ` +
    `[${missing.edge[0]}, ${missing.edge[1]}]; required a { bones, theta } entry for every pair of bones a share moves between — no amplitude is assumed`
  );
}

// ---------------------------------------------------------------------------
// MQ_DEFORM_LOAD
// ---------------------------------------------------------------------------

/** The largest L · Δshare · θ / 4 over the edges, px, and the edge; `{ edge: null }` when every edge carries none. */
export function deformLoad(points: readonly Pt[], triangles: readonly number[], weights: Weights, declared: MotionAmplitude, plant: AllocationPlant | null): Reading<{ value: number; edge: [number, number] | null }> {
  const pairs = new PairAmplitudes(declared, plant);
  let best = 0;
  let at: [number, number] | null = null;
  for (const [u, v] of uniqueEdges(triangles)) {
    const amp = pairs.across(weights[u], weights[v], [u, v]);
    if (amp === null) return unmeasured(undeclaredPairReason(pairs.missing!));
    const theta = plant === 'load-without-theta' ? 1 : amp.theta;
    const load = (lengthOf(points[u], points[v]) * shareJump(weights[u], weights[v]) * theta) / 4;
    if (load > best) {
      best = load;
      at = [u, v];
    }
  }
  return { measured: true, value: { value: r6(best), edge: at } };
}

// ---------------------------------------------------------------------------
// MQ_BOUNDARY_NECESSARY — B*
// ---------------------------------------------------------------------------

/** How close the search along a chord brings a piece before it stops, px: `HAUSDORFF_TOLERANCE`'s figure. */
const CHORD_TOLERANCE = 1e-9;
/** On the chord within this, px, a pixel centre is not cut off by it — `ON_BOUNDARY`'s figure. */
const ON_CHORD = 1e-9;

/**
 * Is the furthest point of the chord `a`–`b` from the open polyline `run`
 * more than `delta`? Exact up to `CHORD_TOLERANCE`, by the branch and bound
 * `directedHausdorff` (`src/meshquality.ts`) uses: the distance to one segment
 * is convex along the chord, so on a piece it is at most the larger of its end
 * values, and the distance to the run is the minimum over its segments.
 */
function chordLeavesRun(a: Pt, b: Pt, run: readonly Pt[], delta: number): boolean {
  const m = run.length - 1;
  const toEach = (p: Pt): Float64Array => {
    const out = new Float64Array(m);
    for (let j = 0; j < m; j++) out[j] = distanceToSegment(p, run[j], run[j + 1]);
    return out;
  };
  const minOf = (g: Float64Array): number => {
    let v = Infinity;
    for (let j = 0; j < m; j++) v = Math.min(v, g[j]);
    return v;
  };
  const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const g0 = toEach(a);
  const g1 = toEach(b);
  if (minOf(g0) > delta || minOf(g1) > delta) return true;
  const stack: Array<{ t0: number; t1: number; g0: Float64Array; g1: Float64Array; depth: number }> = [{ t0: 0, t1: 1, g0, g1, depth: 0 }];
  while (stack.length > 0) {
    const piece = stack.pop()!;
    let upper = Infinity;
    for (let j = 0; j < m; j++) upper = Math.min(upper, Math.max(piece.g0[j], piece.g1[j]));
    if (upper <= delta + CHORD_TOLERANCE || piece.depth >= 64) continue;
    const tm = (piece.t0 + piece.t1) / 2;
    const gm = toEach(at(tm));
    if (minOf(gm) > delta) return true;
    stack.push({ t0: piece.t0, t1: tm, g0: piece.g0, g1: gm, depth: piece.depth + 1 });
    stack.push({ t0: tm, t1: piece.t1, g0: gm, g1: piece.g1, depth: piece.depth + 1 });
  }
  return false;
}

/**
 * Whether the outline `hull` may skip forward from `hull[i]` to `hull[j]`:
 * every skipped vertex within `delta` of the chord, the chord within `delta`
 * of the skipped run (both exact), and — unless planted out — no art pixel
 * centre inside the hull and strictly inside the sliver the chord cuts off
 * (even-odd over the run closed by the chord; a centre on the chord is kept).
 */
export function shortcutTest(hull: readonly Pt[], delta: number, art: AllocationArt, plant: AllocationPlant | null): { valid: (i: number, j: number) => boolean; tests: () => number } {
  const n = hull.length;
  const { mask, bits, scale } = art;
  const w = mask.width;
  const h = mask.height;
  let inside: Uint8Array | null = null;
  let tests = 0;
  const valid = (i: number, j: number): boolean => {
    const k = (j - i + n) % n;
    if (k < 2) return true;
    tests++;
    const run: Pt[] = [];
    for (let s = 0; s <= k; s++) run.push(hull[(i + s) % n]);
    const a = hull[i];
    const b = hull[j];
    for (let s = 1; s < k; s++) if (distanceToSegment(run[s], a, b) > delta) return false;
    if (chordLeavesRun(a, b, run, delta)) return false;
    if (plant === 'bstar-ignores-art') return true;
    if (inside === null) inside = closedPolygonCentres(hull, w, h, scale);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of run) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
    const gy0 = Math.max(0, Math.floor(y0 * scale) - 1);
    const gy1 = Math.min(h - 1, Math.ceil(y1 * scale));
    const gx0 = Math.max(0, Math.floor(x0 * scale) - 1);
    const gx1 = Math.min(w - 1, Math.ceil(x1 * scale));
    for (let y = gy0; y <= gy1; y++) {
      for (let x = gx0; x <= gx1; x++) {
        const cell = y * w + x;
        if (!inside[cell] || !bits[cell]) continue;
        const c: Pt = [(x + 0.5) / scale, (y + 0.5) / scale];
        if (distanceToSegment(c, a, b) <= ON_CHORD) continue;
        let odd = false;
        for (let p = 0, q = run.length - 1; p < run.length; q = p++) {
          const [xp, yp] = run[p];
          const [xq, yq] = run[q];
          if (yp > c[1] !== yq > c[1] && c[0] < ((xq - xp) * (c[1] - yp)) / (yq - yp) + xp) odd = !odd;
        }
        if (odd) return false;
      }
    }
    return true;
  };
  return { valid, tests: () => tests };
}

/** B\*, its outline (indices into the hull, in walk order) and the work the search took. */
export interface BoundaryNecessity {
  count: number;
  path: number[];
  /** Shortcuts tested; at most n × (n − 2) for n hull vertices — every forward skip of 2 or more from every vertex, once. */
  tests: number;
  /** n × (n − 2): the bound `tests` is held to. */
  bound: number;
}

/**
 * B\*: the fewest vertices of `hull` a closed outline of at least three of
 * them can keep, in order, when each skip is a valid shortcut. Every forward
 * shortcut from every vertex is tested once (n × (n − 2) tests at most), then
 * a breadth-first walk round the loop from every start, its hop count capped
 * at 3 so a two-vertex "outline" is never the answer. Ties: the lowest start,
 * then the first path found in ascending offsets.
 */
export function boundaryNecessity(hull: readonly Pt[], delta: number, art: AllocationArt, plant: AllocationPlant | null): BoundaryNecessity {
  const n = hull.length;
  const shortcut = shortcutTest(hull, delta, art, plant);
  const adj: number[][] = [];
  for (let i = 0; i < n; i++) {
    const out: number[] = [];
    for (let k = 1; k < n; k++) if (shortcut.valid(i, (i + k) % n)) out.push(k);
    adj.push(out);
  }
  let best = n;
  let bestPath = hull.map((_, i) => i);
  // States: (offset, hops capped at 3). dist[off * 4 + c].
  for (let s = 0; s < n; s++) {
    const dist = new Array<number>((n + 1) * 4).fill(Infinity);
    const prev = new Array<number>((n + 1) * 4).fill(-1);
    dist[0] = 0;
    for (let off = 0; off < n; off++) {
      for (let c = 0; c < 4; c++) {
        const here = dist[off * 4 + c];
        if (here === Infinity) continue;
        for (const k of adj[(s + off) % n]) {
          if (off + k > n) continue;
          const nc = Math.min(c + 1, 3);
          const to = (off + k) * 4 + nc;
          if (here + 1 < dist[to]) {
            dist[to] = here + 1;
            prev[to] = off * 4 + c;
          }
        }
      }
    }
    const end = n * 4 + 3;
    if (dist[end] < best) {
      best = dist[end];
      const path: number[] = [];
      for (let st = prev[end]; st > 0; st = prev[st]) path.push((s + Math.floor(st / 4)) % n);
      path.push(s);
      bestPath = path.reverse();
    }
  }
  return { count: best, path: bestPath, tests: shortcut.tests(), bound: n * (n - 2) };
}

/**
 * B\* for one hull, delta and art, once per art rasters object: `reduceMesh`
 * measures every step against the same source hull, so its B\* is a function
 * of the call and is computed once for it. Keyed by the hull's coordinates and
 * the deviation; the plant is part of the key.
 */
const necessityMemo = new WeakMap<object, Map<string, BoundaryNecessity>>();

export function boundaryNecessityOnce(owner: object, hull: readonly Pt[], delta: number, art: AllocationArt, plant: AllocationPlant | null): BoundaryNecessity {
  let memo = necessityMemo.get(owner);
  if (memo === undefined) {
    memo = new Map();
    necessityMemo.set(owner, memo);
  }
  const key = `${plant ?? ''}|${delta}|${hull.map((p) => `${p[0]},${p[1]}`).join(';')}`;
  let found = memo.get(key);
  if (found === undefined) {
    found = boundaryNecessity(hull, delta, art, plant);
    memo.set(key, found);
  }
  return found;
}

// ---------------------------------------------------------------------------
// MQ_ALLOCATION_CONTRAST — Δ and E
// ---------------------------------------------------------------------------

export interface AllocationContrast {
  /** Δ: removable-alone share among the dense vertices minus that share among the rest. */
  contrast: number;
  /** E: the removable-alone share over every vertex. */
  economy: number;
  dense: { vertices: number; removableAlone: number };
  rest: { vertices: number; removableAlone: number };
  /** The dense vertex with the lowest ν (ties: the lowest index). */
  worstVertex: number;
}

/** h\*: the largest local size every primary need allows at a point, each relaxed at gradation G away from its source. */
interface Need {
  at(p: Pt): number;
}

function needField(points: readonly Pt[], triangles: readonly number[], weights: Weights, silhouette: number[] | null, regions: readonly RefinementRegion[], pairs: PairAmplitudes, gradation: number): Need | null {
  const sources: Array<{ a: Pt; b: Pt; h: number }> = [];
  if (silhouette !== null && silhouette.length >= 3) {
    for (let i = 0; i < silhouette.length; i++) {
      const a = points[silhouette[i]];
      const b = points[silhouette[(i + 1) % silhouette.length]];
      sources.push({ a, b, h: lengthOf(a, b) });
    }
  }
  const bones = [...new Set(weights.flatMap((v) => v.map((x) => x.bone)))].sort();
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const [i, j, k] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const [A, B, C] = [points[i], points[j], points[k]];
    const det = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
    if (Math.abs(det) < 1e-12) continue;
    let tv = 0;
    for (const bone of bones) {
      const wt = (v: number): number => weights[v].find((x) => x.bone === bone)?.weight ?? 0;
      const [wa, wb, wc] = [wt(i), wt(j), wt(k)];
      const gx = ((wb - wa) * (C[1] - A[1]) - (wc - wa) * (B[1] - A[1])) / det;
      const gy = ((wc - wa) * (B[0] - A[0]) - (wb - wa) * (C[0] - A[0])) / det;
      tv += Math.hypot(gx, gy);
    }
    tv /= 2;
    if (tv <= 0) continue;
    let ratio = 0;
    for (const [u, v] of [
      [i, j],
      [j, k],
      [k, i],
    ] as const) {
      const amp = pairs.across(weights[u], weights[v], [Math.min(u, v), Math.max(u, v)]);
      if (amp === null) return null;
      ratio = Math.max(ratio, amp.ratio);
    }
    if (ratio <= 0) continue;
    const c: Pt = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
    sources.push({ a: c, b: c, h: Math.sqrt(4 / (ratio * tv)) });
  }
  return {
    at(p: Pt): number {
      let need = Infinity;
      for (const s of sources) need = Math.min(need, s.h + gradation * distanceToSegment(p, s.a, s.b));
      for (const r of regions) {
        const poly = r.polygon;
        let d = 0;
        if (!inClosedPolygon(p, poly)) {
          d = Infinity;
          for (let q = 0; q < poly.length; q++) d = Math.min(d, distanceToSegment(p, poly[q], poly[(q + 1) % poly.length]));
        }
        const here = d === 0 ? r.maxEdgeLength : r.transition > 0 && d <= r.transition ? r.maxEdgeLength + r.grade * d : Infinity;
        need = Math.min(need, here);
      }
      return need;
    },
  };
}

const twiceSigned = (a: Pt, b: Pt, c: Pt): number => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);

/**
 * Δ and E (§8; the stage-A record for #1271, M7). For each vertex the
 * cheapest half-edge collapse into a neighbour — a hull vertex only along the
 * hull — that turns no triangle over; ν is the largest, over what that
 * collapse changes, of: the silhouette (the moved outline's chord distance
 * over δ, and the skip must pass the art test), the deformation (each new
 * edge's L · Δshare · θ / (4ε)), the region (each new edge over the bound its
 * region holds it to, `regionEdgeBound`) and the need (each new edge over h\*
 * at its midpoint). A ratio already over 1 on the edge it replaces counts only
 * by how much it worsens it. ν < 1 is removable alone. Dense vertices are
 * those whose mean neighbour distance (on the `r6` grid, so the class is not
 * a summation order's) is below the area-weighted median of it.
 */
export function allocationContrast(
  points: readonly Pt[],
  triangles: readonly number[],
  hull: number,
  weights: Weights,
  delta: number,
  art: AllocationArt,
  regions: readonly RefinementRegion[],
  declared: MotionAmplitude,
  silhouette: number[],
  plant: AllocationPlant | null,
): Reading<AllocationContrast> {
  const n = points.length;
  const pairs = new PairAmplitudes(declared, plant);
  const amplitudeRead = plant !== 'contrast-without-amplitude';
  const need = needField(points, triangles, weights, silhouette, regions, amplitudeRead ? pairs : new PairAmplitudes({ tracks: [], gradation: declared.gradation }, 'undeclared-pair-is-rigid'), declared.gradation);
  if (need === null) return unmeasured(undeclaredPairReason(pairs.missing!));
  const nb: Array<Set<number>> = Array.from({ length: n }, () => new Set<number>());
  const triOf: number[][] = Array.from({ length: n }, () => []);
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = triangles[t + k];
      nb[a].add(triangles[t + ((k + 1) % 3)]);
      nb[a].add(triangles[t + ((k + 2) % 3)]);
      triOf[a].push(t);
    }
  }
  const neighbours = nb.map((s) => [...s].sort((p, q) => p - q));
  const hullPoints = points.slice(0, hull);
  const shortcut = shortcutTest(hullPoints, delta, art, null);
  const adjacentOnHull = (v: number, w: number): boolean => w < hull && (Math.abs(w - v) === 1 || Math.abs(w - v) === hull - 1);
  const term = (now: number, before: number): number => (now <= 1 ? now : now / Math.max(1, before));
  const nu = new Array<number>(n).fill(Infinity);
  for (let v = 0; v < n; v++) {
    const isHull = v < hull;
    for (const w of neighbours[v]) {
      if (isHull && !adjacentOnHull(v, w)) continue;
      let folds = false;
      for (const t of triOf[v]) {
        const tri = [triangles[t], triangles[t + 1], triangles[t + 2]];
        if (tri.includes(w)) continue;
        const before = twiceSigned(points[tri[0]], points[tri[1]], points[tri[2]]);
        const moved = tri.map((i) => (i === v ? points[w] : points[i]));
        const after = twiceSigned(moved[0], moved[1], moved[2]);
        if (Math.sign(after) !== Math.sign(before) || Math.abs(after) < 1e-9) {
          folds = true;
          break;
        }
      }
      if (folds) continue;
      let worst = 0;
      if (isHull) {
        const other = v === (w + 1) % hull ? (v + 1) % hull : (v - 1 + hull) % hull;
        worst = Math.max(worst, distanceToSegment(points[v], points[w], points[other]) / delta);
        const [from, to] = other === (v + 1) % hull ? [w, other] : [other, w];
        if (!shortcut.valid(from, to)) worst = Math.max(worst, 1);
      }
      for (const u of neighbours[v]) {
        if (u === w) continue;
        const a = points[w];
        const b = points[u];
        const L = lengthOf(a, b);
        const L0 = lengthOf(points[v], b);
        if (amplitudeRead) {
          const now = pairs.across(weights[w], weights[u], [Math.min(w, u), Math.max(w, u)]);
          const was = pairs.across(weights[v], weights[u], [Math.min(v, u), Math.max(v, u)]);
          if (now === null || was === null) return unmeasured(undeclaredPairReason(pairs.missing!));
          worst = Math.max(worst, term((L * shareJump(weights[w], weights[u]) * now.ratio) / 4, (L0 * shareJump(weights[v], weights[u]) * was.ratio) / 4));
        }
        const rb = regionEdgeBound(a, b, regions);
        if (rb !== null) {
          const rb0 = regionEdgeBound(points[v], b, regions);
          worst = Math.max(worst, term(L / rb, rb0 === null ? 0 : L0 / rb0));
        }
        const q = need.at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        if (Number.isFinite(q)) {
          const q0 = need.at([(points[v][0] + b[0]) / 2, (points[v][1] + b[1]) / 2]);
          worst = Math.max(worst, term(L / q, Number.isFinite(q0) ? L0 / q0 : 0));
        }
      }
      nu[v] = Math.min(nu[v], worst);
    }
  }
  const area = new Array<number>(n).fill(0);
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const third = Math.abs(twiceSigned(points[triangles[t]], points[triangles[t + 1]], points[triangles[t + 2]])) / 6;
    for (let k = 0; k < 3; k++) area[triangles[t + k]] += third;
  }
  const local = neighbours.map((s, x) => (s.length === 0 ? 0 : r6(s.reduce((sum, y) => sum + lengthOf(points[x], points[y]), 0) / s.length)));
  const order = local.map((_, i) => i).sort((i, j) => local[i] - local[j] || i - j);
  const total = area.reduce((s, x) => s + x, 0);
  let median = local[order[order.length - 1]];
  let acc = 0;
  for (const i of order) {
    acc += area[i];
    if (acc >= 0.5 * total) {
      median = local[i];
      break;
    }
  }
  const removable = (i: number): boolean => nu[i] < 1;
  const dense = local.map((_, i) => i).filter((i) => local[i] < median);
  const rest = local.map((_, i) => i).filter((i) => local[i] >= median);
  if (dense.length === 0) return unmeasured(`no vertex's local size is below the area-weighted median ${r6(median)} px, so there is no dense part to contrast`);
  if (rest.length === 0) return unmeasured('every vertex is below the area-weighted median local size, so there is no rest to contrast the dense part with');
  const denseRemovable = dense.filter(removable).length;
  const restRemovable = rest.filter(removable).length;
  let worstVertex = dense[0];
  for (const i of dense) if (nu[i] < nu[worstVertex]) worstVertex = i;
  return {
    measured: true,
    value: {
      contrast: r6(denseRemovable / dense.length - restRemovable / rest.length),
      economy: r6(nu.filter((x) => x < 1).length / n),
      dense: { vertices: dense.length, removableAlone: denseRemovable },
      rest: { vertices: rest.length, removableAlone: restRemovable },
      worstVertex,
    },
  };
}
