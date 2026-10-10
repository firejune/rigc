/**
 * The synthetic blink — the fixture issue #1326 measures an interior feature line on (`MQ162`–`MQ165`,
 * docs/MESH_REDUCTION.md §11).
 *
 * ⭐ Why it exists. rig-parts#160's survey measured an eyelid that closes over a hole with rig-parts's own builders
 * (rig-parts PR #164, `tools/feature_contour_survey.ts`): a lattice source cannot put a vertex on the lid's edge, and a
 * source that carries the edge can only keep it whole (`protect.edges`) or thin it with nothing but the skinning veto
 * bounding where it goes. That measurement lives in another repository and reads rig-c through an install. This
 * rebuilds the case from rig-c alone, so the current API's three readings are held by controls in this tree and the
 * contract the line row will be written against has a fixture before any mechanism.
 *
 * The case, by construction: a 56 × 40 block at (4, 4) in a 64 × 48 mask, alpha 255, with one 24 × 6 hole at
 * (20, 19) — its upper edge the line y = 19, its lower edge y = 25. Two bones, `root` (the slot's) and `lid` below
 * it. The weight rule (`blinkShare`): the lid's share is 1 at and above the upper edge, 0 at and below the lower edge
 * and (25 − y) / 6 between, so translating the lid by the hole's height, T = (0, 6), carries the upper edge onto the
 * lower one — the hole closes, and nothing below it moves. The dense reference is that rule evaluated at every point.
 *
 * The sources are tensor-product grids (`blinkSource`): one set of columns and one set of rows, every cell two
 * triangles. The lattice source's lines are the multiples of the spacing inside the block; the line source adds the
 * columns and rows of the hole's ring sampled every `lineStep` px, so every ring edge is a grid edge by construction
 * — no triangulator is needed to make the line a line, which is what keeps this fixture independent of one (rig-c has
 * `earClip` and no constrained triangulation). The figures it yields are therefore this construction's, not rig-parts's:
 * the same hole, the same rule, a different source.
 *
 * Read by `selftest.ts` (the `mesh-quality` suite) and by the stage-A record's scripts for #1326, which import it to
 * measure the same object the controls hold. Pure: no clock, no randomness, no file.
 */
import { r6, simplifyClosedPolygon, skinningEnvelopeBone, type AlphaMask, type BoneMotionRange, type MeshReductionInput, type ProtectedFeatures, type SkinningEnvelope, type SourceMesh } from '../src/mesh.ts';
import { cropToSpineY } from '../src/transform.ts';

type Pt = readonly [number, number];

/** The mask, the block and the hole: `[x, y, width, height]`, part-local px, y down. */
export const BLINK = { width: 64, height: 48, block: [4, 4, 56, 40], hole: [20, 19, 24, 6] } as const;

/** The two bones: the slot's, which the envelope measures against, and the lid below it. */
export const BLINK_REFERENCE = 'root';
export const BLINK_LID = 'lid';

/** The lid's translation at the closed pose: straight down by the hole's height. */
export const BLINK_T: Pt = [0, BLINK.hole[3]];

/** The edge samples' spacing along the ring, px — rig-parts's dense-reference step. */
export const BLINK_EDGE_STEP = 0.25;

/** The skinning veto's bound and the line's: 1 px, the consumer's `maxLocalDeformation`. */
export const BLINK_BOUND = 1;

/** The art: 255 inside the block and outside the hole, 0 elsewhere. */
export function blinkAlpha(x: number, y: number): number {
  const [bx, by, bw, bh] = BLINK.block;
  const [hx, hy, hw, hh] = BLINK.hole;
  const inBlock = x >= bx && x < bx + bw && y >= by && y < by + bh;
  const inHole = x >= hx && x < hx + hw && y >= hy && y < hy + hh;
  return inBlock && !inHole ? 255 : 0;
}

/** The art as a mask, in memory (the suite writes its own PLACEHOLDER plate with `blinkAlpha` and reads that). */
export function blinkMask(): AlphaMask {
  const alpha = new Uint8Array(BLINK.width * BLINK.height);
  for (let y = 0; y < BLINK.height; y++) for (let x = 0; x < BLINK.width; x++) alpha[y * BLINK.width + x] = blinkAlpha(x, y);
  return { width: BLINK.width, height: BLINK.height, alpha };
}

/** The weight rule: the lid's share at a point — 1 at and above the hole's upper edge, 0 at and below its lower, linear between. */
export function blinkShare(p: Pt): number {
  const top = BLINK.hole[1];
  const bottom = BLINK.hole[1] + BLINK.hole[3];
  return p[1] <= top ? 1 : p[1] >= bottom ? 0 : (bottom - p[1]) / (bottom - top);
}

/** A vertex's weights by the rule: the lid alone at 1, the reference alone at 0, both between. */
export function blinkWeights(p: Pt): Array<{ bone: string; weight: number }> {
  const s = blinkShare(p);
  if (s >= 1) return [{ bone: BLINK_LID, weight: 1 }];
  if (s <= 0) return [{ bone: BLINK_REFERENCE, weight: 1 }];
  return [
    { bone: BLINK_LID, weight: r6(s) },
    { bone: BLINK_REFERENCE, weight: r6(1 - s) },
  ];
}

/** The hole's ring at pixel corners, clockwise on screen from its top-left corner. */
export function blinkRing(): Array<[number, number]> {
  const [x, y, w, h] = BLINK.hole;
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}

/** Points along a closed ring: `ceil(edge / step)` per edge, evenly spaced, starting at each corner. */
export function ringPoints(ring: ReadonlyArray<Pt>, step: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let m = 0; m < n; m++) out.push([a[0] + ((b[0] - a[0]) * m) / n, a[1] + ((b[1] - a[1]) * m) / n]);
  }
  return out;
}

/** The edge the displacement is read on: the ring every `BLINK_EDGE_STEP` px (240 samples). */
export function blinkEdgeSamples(): Array<[number, number]> {
  return ringPoints(blinkRing(), BLINK_EDGE_STEP);
}

/** A source and its line: every source vertex on the hole's ring, in ring order from its top-left corner (closed); empty for the lattice source. */
export interface BlinkSource {
  mesh: SourceMesh;
  line: number[];
}

/**
 * A tensor-grid source over the block. Columns and rows: the block's sides, every multiple of `spacing` strictly
 * inside the block, and — when `lineStep` is given — the coordinates of the hole's ring sampled every `lineStep` px
 * (`ringPoints`). The hull is the block's perimeter walked from its top-left corner (clockwise on screen, as
 * `checkHullOrder` asks), every grid line meeting it a hull vertex; the interior follows row-major. Each cell is two
 * triangles, the diagonal alternating, turned counter-clockwise in Spine world through `cropToSpineY`. UVs are the
 * point over the mask, at six places; weights are `blinkWeights`.
 */
export function blinkSource(spacing: number, lineStep: number | null): BlinkSource {
  const [bx, by, bw, bh] = BLINK.block;
  const x0 = bx;
  const y0 = by;
  const x1 = bx + bw;
  const y1 = by + bh;
  const inside = (lo: number, hi: number): number[] => {
    const out: number[] = [];
    for (let v = Math.floor(lo / spacing) * spacing + spacing; v < hi; v += spacing) if (v > lo) out.push(v);
    return out;
  };
  const line = lineStep === null ? [] : ringPoints(blinkRing(), lineStep);
  const uniq = (vs: number[]): number[] => [...new Set(vs)].sort((a, b) => a - b);
  const xs = uniq([x0, x1, ...inside(x0, x1), ...line.map((p) => p[0])]);
  const ys = uniq([y0, y1, ...inside(y0, y1), ...line.map((p) => p[1])]);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const walk: Array<[number, number]> = [];
  for (let i = 0; i < nx; i++) walk.push([i, 0]);
  for (let j = 0; j < ny; j++) walk.push([nx, j]);
  for (let i = nx; i > 0; i--) walk.push([i, ny]);
  for (let j = ny; j > 0; j--) walk.push([0, j]);
  const index = new Map<string, number>();
  const points: Array<[number, number]> = [];
  const add = (i: number, j: number): void => {
    index.set(`${i},${j}`, points.length);
    points.push([xs[i], ys[j]]);
  };
  for (const [i, j] of walk) add(i, j);
  const hull = points.length;
  for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) add(i, j);
  const v = (i: number, j: number): number => index.get(`${i},${j}`)!;
  const triangles: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if ((i + j) % 2 === 0) triangles.push(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i, j + 1));
      else triangles.push(v(i, j), v(i + 1, j), v(i, j + 1), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
    }
  }
  const H = BLINK.height;
  for (let t = 0; t < triangles.length; t += 3) {
    const [a, b, c] = [points[triangles[t]], points[triangles[t + 1]], points[triangles[t + 2]]];
    const ay = cropToSpineY(a[1], H);
    const twice = (b[0] - a[0]) * (cropToSpineY(c[1], H) - ay) - (c[0] - a[0]) * (cropToSpineY(b[1], H) - ay);
    if (twice < 0) [triangles[t + 1], triangles[t + 2]] = [triangles[t + 2], triangles[t + 1]];
  }
  // The line: every grid vertex on the ring, in ring order — the sampled points and wherever a lattice line meets
  // the ring between them, so that each consecutive pair is one grid edge.
  const ring = blinkRing();
  const onRing: number[] = [];
  if (lineStep !== null) {
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % ring.length];
      const along: Array<{ t: number; id: number }> = [];
      points.forEach((p, id) => {
        const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        if (cross !== 0) return;
        const t = a[0] !== b[0] ? (p[0] - a[0]) / (b[0] - a[0]) : (p[1] - a[1]) / (b[1] - a[1]);
        if (t >= 0 && t < 1) along.push({ t, id });
      });
      along.sort((p, q) => p.t - q.t);
      onRing.push(...along.map((e) => e.id));
    }
  }
  const mesh: SourceMesh = {
    points,
    uvs: points.flatMap(([x, y]) => [r6(x / BLINK.width), r6(y / H)]),
    triangles,
    hull,
    weights: points.map((p) => blinkWeights(p)),
  };
  return { mesh, line: onRing };
}

/** The line's vertices that survive simplifying its polyline at `tolerance` px (`simplifyClosedPolygon`), as source indices. */
export function simplifiedLine(source: BlinkSource, tolerance: number): number[] {
  const poly = source.line.map((v) => source.mesh.points[v]);
  const kept = simplifyClosedPolygon(poly, tolerance);
  return kept.map((p) => source.line[poly.findIndex((q) => q[0] === p[0] && q[1] === p[1])]);
}

/** A bone that does not move: zero ranges at a pivot. */
function still(bone: string, pivot: [number, number]): BoneMotionRange {
  return { bone, source: 'keys', pivot, rotate: [0, 0], scaleX: [1, 1], scaleY: [1, 1], translate: 0, setup: { scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, inherit: 'normal' } };
}

/** The envelope: the lid below the slot's bone, translating by |T| from its joint at the middle of the upper edge, through rig-c's helper. */
export function blinkEnvelope(): SkinningEnvelope {
  const pivot: [number, number] = [BLINK.hole[0] + BLINK.hole[2] / 2, BLINK.hole[1]];
  const lid = { ...still(BLINK_LID, pivot), translate: Math.hypot(BLINK_T[0], BLINK_T[1]) };
  return { reference: BLINK_REFERENCE, bones: [skinningEnvelopeBone({ referenceChain: [still(BLINK_REFERENCE, pivot)], chain: [lid] })] };
}

/**
 * The reduction input rig-parts's survey runs the blink under, rebuilt: coverage 1, overshoot ≤ 2, undercut 0, hull
 * deviation ≤ 1 px, influences { 4, 0 }, budget 2000, one art sample, and the skinning veto at `maxResidual` (the
 * consumer's 1 px; `null` declares it absent). `mask` is the art the caller read.
 */
export function blinkReductionInput(mask: AlphaMask, source: SourceMesh, protect: Partial<ProtectedFeatures>, maxResidual: number | null): MeshReductionInput {
  const fit = { minCoverage: 1, maxOvershoot: 2, maxUndercut: 0 };
  return {
    attachment: { skin: null, slot: 'blink', attachment: 'blink' },
    art: { mask, threshold: 1, frame: { space: 'part-local-drawing-px-y-down', width: BLINK.width, height: BLINK.height, pageScale: 1, conversion: 'texels = px * pageScale' } },
    source,
    sourceBounds: fit,
    targets: { artFit: { ...fit }, maxBoundaryDeviation: 1, regions: [], skinning: { envelope: blinkEnvelope(), maxResidual } },
    protect: { hull: false, vertices: [], edges: [], regionBoundaries: [], weightJump: null, influences: [], ...protect },
    influences: { maxInfluences: 4, minWeight: 0 },
    boneOrder: [BLINK_REFERENCE, BLINK_LID],
    preset: null,
    budget: { maxCandidates: 2000 },
    minArtSamples: 1,
    regionArtSamples: [],
    deform: [],
    linkedMeshes: [],
  };
}

/** A weighted triangle mesh, part-local px, y down: a `SourceMesh` or a reduced one. */
export interface WeightedMesh {
  points: ReadonlyArray<Pt>;
  triangles: readonly number[];
  weights: ReadonlyArray<ReadonlyArray<{ bone: string; weight: number }>> | null;
}

/** The share of `bone` a mesh carries at `p`: Σ βᵢ wᵢ over the first triangle (by index) whose barycentric coordinates are all ≥ −1e-9; null when none does. */
export function carriedShare(mesh: WeightedMesh, bone: string, p: Pt): number | null {
  const { points, triangles } = mesh;
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const A = points[triangles[t]];
    const B = points[triangles[t + 1]];
    const C = points[triangles[t + 2]];
    const det = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]);
    if (det === 0) continue;
    const l0 = ((B[1] - C[1]) * (p[0] - C[0]) + (C[0] - B[0]) * (p[1] - C[1])) / det;
    const l1 = ((C[1] - A[1]) * (p[0] - C[0]) + (A[0] - C[0]) * (p[1] - C[1])) / det;
    const l2 = 1 - l0 - l1;
    if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
    const w = (v: number): number => mesh.weights?.[v]?.find((e) => e.bone === bone)?.weight ?? 0;
    return l0 * w(triangles[t]) + l1 * w(triangles[t + 1]) + l2 * w(triangles[t + 2]);
  }
  return null;
}

/**
 * rig-parts's dense-reference reading, re-implemented here rather than imported: under the lid's translation T a mesh
 * draws a setup point p at p + w̄(p)·T and the dense reference at p + rule(p)·T, so a sample's displacement is
 * |w̄(p) − rule(p)|·|T|, and its largest over the motion is at the full T (it is linear in the pose). The largest over
 * `samples`, where, and how many samples a triangle carried — an uncarried sample is counted, never read as 0.
 */
export function edgeDisplacement(mesh: WeightedMesh, samples: ReadonlyArray<Pt>, rule: (p: Pt) => number = blinkShare, bone: string = BLINK_LID, T: Pt = BLINK_T): { max: number; at: Pt | null; carried: number; uncarried: number } {
  const len = Math.hypot(T[0], T[1]);
  let max = 0;
  let at: Pt | null = null;
  let carried = 0;
  let uncarried = 0;
  for (const p of samples) {
    const s = carriedShare(mesh, bone, p);
    if (s === null) {
      uncarried++;
      continue;
    }
    carried++;
    const d = Math.abs(s - rule(p)) * len;
    if (at === null || d > max) {
      max = d;
      at = p;
    }
  }
  return { max, at, carried, uncarried };
}
