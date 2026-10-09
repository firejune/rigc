/**
 * Mesh reduction and local refinement — stage B2 of the contract in
 * docs/MESH_REDUCTION.md (issue #1221, stage B: issue #1224).
 *
 * One operation is exported, `reduceMesh` — `reduceMeshWith` is the same
 * operation over art rasters the caller made — and it is two operations
 * composed:
 *
 * 1. **Refinement** (`refineRegions`) inserts vertices inside the union of the
 *    declared regions and their bands until §5's `L(R)` holds on every edge
 *    that meets each region — a coarse source is refined, never refused
 *    (correction 3).
 * 2. **Reduction** (`removeVertices`) then removes source vertices one at a
 *    time, retriangulating the hole each leaves, and takes a step only when
 *    every bound the caller declared still holds after it — the region bounds
 *    included, so the reduction cannot undo the refinement.
 *
 * Each is its own function with its own entry and exit, so a control can run
 * one with the other idle — regions empty, or every source vertex protected —
 * which is the shape the consumer asked for (rig-parts#126, comment
 * 6042150608: "separate composed operations … with independently passing
 * controls for each").
 *
 * ## What every step is held to
 *
 * Each candidate step is measured by `measureMeshQuality` (`src/meshquality.ts`)
 * — no row is re-implemented here; the call reads it as `measureMeshQualityWith`
 * over the art's rasters taken once at admission (`src/meshrasters.ts`, issue
 * #1240), and as `measureMeshQualityStep` carried from the last step's
 * measurement (`StepRasters`, issue #1246), each of which returns the same
 * report — and taken only when every row the caller's
 * contract requires is `pass`: the art fit at `targets.artFit` (an overshoot or
 * undercut bound declared `null` is measured and never required), the boundary
 * deviation from the source hull at `targets.maxBoundaryDeviation`, the minimum
 * angle when declared, orientation and degeneracy at 0, and every region's
 * `MQ_MAX_EDGE` and `MQ_TRANSITION`. Before the measurement, the structural
 * conditions a row cannot see: the hole's link polygon is strictly simple and
 * ear-clips, the outline is still one loop, every protected source edge is
 * still an edge, and no new edge joins two vertices whose weight vectors differ
 * by more than `weightJump` (§6, conditions (a) and (b)).
 *
 * ## The order, which is the determinism (A18)
 *
 * The reduction sweeps the surviving SOURCE vertices in ascending source index,
 * one removal attempted per vertex per pass; a step taken stays taken and the
 * sweep continues with the next index. A pass in which no step is taken ends
 * the reduction (`no-further-valid-reduction`, naming the constraint that
 * blocked the last attempt). Inserted vertices are never candidates: they exist
 * to meet `L(R)`, and removing one is undoing the refinement.
 *
 * The refinement measures, takes the first failing region row in report order
 * (code, then region name) and splits that row's worst edge. When an end of
 * the edge lies outside the region and its band, the split is where the edge
 * leaves the band, so the piece to that end only touches the band's outer
 * boundary and `edgeIsHeldByRegion` — the one definition the rows read —
 * exempts it (rig-parts#126). Otherwise the split is at the midpoint when
 * the midpoint lies in the region or its band, else at the point of the edge
 * inside them nearest the midpoint. A region no edge meets — one
 * inside a single triangle — gets the first vertex of its polygon inserted into
 * the triangle that holds it. Every inserted position is on the `r6` grid.
 *
 * ## What it never does
 *
 * - **Invent a value.** Every bound, floor, limit and the budget are inputs; a
 *   missing one is `REDUCE_INPUT_MISSING`, thrown.
 * - **Resample a survivor.** A surviving vertex keeps its position, UV and
 *   bindings bit for bit (P19); only the order of its bindings is the canonical
 *   one (strongest first, `boneOrder` on a tie).
 * - **Bind.** A `SourceMesh` names bones and carries no bind coordinates, and
 *   the input carries no bone transforms, so an inserted vertex's weights are
 *   by bone name exactly as a source vertex's are; the compiler binds them, as
 *   `bindWeightedVertices` binds every generated mesh.
 * - **Claim a minimum.** A local stop is reported as one.
 * - Pose, or link the runtime. Pure: no clock, no randomness, nothing from the
 *   compiler.
 */
import {
  distanceToSegment,
  earClip,
  findSelfIntersection,
  MeshError,
  MeshReductionError,
  meshEdges,
  r6,
  rasteriseTriangles,
  signedArea,
  traceOutline,
  checkHullOrder,
} from './mesh.ts';
import {
  BAND_CONTACT_TOLERANCE,
  edgeIsHeldByRegion,
  measureMeshQualityStep,
  measureMeshQualityWith,
  type AttachmentRef,
  type ArtFitBounds,
  type CandidateReport,
  type DeformKeyInput,
  type EffectiveSettings,
  type MeasureRow,
  type MeshCounts,
  type MeshMeasureInput,
  type MeshQualityReport,
  type MeshReductionInput,
  type RefinementRegion,
  type ReductionChanges,
  type SourceMesh,
  type StopNotReached,
  type Termination,
} from './meshquality.ts';
import { artRastersOf, stepRastersOf, type ArtRasters, type StepRasters } from './meshrasters.ts';

// ---------------------------------------------------------------------------
// the result
// ---------------------------------------------------------------------------

/** A `vertices` key after the remap: the run rewritten over the result's vertex order. */
export interface RemappedDeformKey {
  animation: string;
  attachment: AttachmentRef;
  /** The key's position in its timeline's `keys`. */
  key: number;
  time: number;
  /** Into the RESULT's deform array, as the compiler emits it. */
  offset: number;
  vertices: number[];
  /** Source vertices whose offsets the run carried and whose vertex the reduction removed — dropped, never moved onto another vertex. */
  droppedVertices: number[];
}

/** A `transform` key: re-evaluated over the new geometry at compile, so it has no run to rewrite. */
export interface DeformKeyRef {
  animation: string;
  attachment: AttachmentRef;
  key: number;
  time: number;
}

/**
 * The reduced mesh: §1's `SourceMesh` in the canonical output order, plus what a
 * consumer needs to carry anything indexed by the old vertices across.
 */
export interface ReducedMesh extends SourceMesh {
  /** `meshEdges`' list, in the export encoding (index × 2), outline loop first. */
  edges: number[];
  /** Source index → result index; null where the reduction removed the vertex. */
  indexMap: Array<number | null>;
  /** Result indices of the vertices the refinement inserted, ascending. */
  inserted: number[];
  /** Every linked mesh of the source, echoed: each inherits this topology. */
  linkedMeshes: AttachmentRef[];
  /** P18: what happened to every deform key the input listed. */
  deform: { remapped: RemappedDeformKey[]; reevaluated: DeformKeyRef[] };
  counts: MeshCounts;
}

export interface MeshReductionResult {
  /** Null when no mesh is returned: a refusal, or a budget that ran out before any candidate met the targets. */
  mesh: ReducedMesh | null;
  report: MeshQualityReport;
}

// ---------------------------------------------------------------------------
// refusals and small helpers
// ---------------------------------------------------------------------------

type Pt = readonly [number, number];
type Binding = { bone: string; weight: number };

/** The predicate epsilon `segmentsMeet` and `prunePolygon` use (`src/mesh.ts`), for "on the boundary". */
const ON_BOUNDARY = 1e-9;

/** How many halvings toward a point known to lie in a region's band the split search tries before it says none was found. */
const SPLIT_SEARCH_STEPS = 40;

/** Iterations of the convex searches `offsetExit` runs along an edge: 2^-60 of an edge is below a double's resolution of it. */
const EXIT_SEARCH_STEPS = 60;

function nameOf(ref: AttachmentRef): string {
  return `${ref.skin ?? '(no skin)'}/${ref.slot}/${ref.attachment}`;
}

function sameRef(a: AttachmentRef, b: AttachmentRef): boolean {
  return a.skin === b.skin && a.slot === b.slot && a.attachment === b.attachment;
}

function refuse(code: string, message: string): never {
  throw new MeshReductionError(code, message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRef(value: unknown): value is AttachmentRef {
  return isObject(value) && typeof value.slot === 'string' && value.slot !== '' && typeof value.attachment === 'string' && value.attachment !== '' && (value.skin === null || typeof value.skin === 'string');
}

/** A refusal the operation reports rather than throws: the input is well formed and the request cannot be met. */
class Stop extends Error {
  constructor(
    readonly reason: 'invalid-input' | 'unsupported-topology',
    readonly code: string,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// validation — what is refused by a throw, before anything is measured
// ---------------------------------------------------------------------------

function checkFit(who: string, field: string, fit: unknown): void {
  if (fit === undefined || fit === null || !isObject(fit)) refuse('REDUCE_INPUT_MISSING', `${who}: ${field} is ${JSON.stringify(fit)}; required { minCoverage, maxOvershoot, maxUndercut } — no field has a default`);
  if (!isFiniteNumber(fit.minCoverage) || fit.minCoverage < 0 || fit.minCoverage > 1) refuse('REDUCE_INPUT_MISSING', `${who}: ${field}.minCoverage is ${JSON.stringify(fit.minCoverage)}; required a fraction in 0..1`);
  // `null` is a bound declared absent (issue #1254): measured, reported `undeclared`, never gating. A field left
  // out is not the same thing and stays refused — `JSON.stringify` names it `undefined` in the message.
  for (const k of ['maxOvershoot', 'maxUndercut'] as const) {
    const v = fit[k];
    if (v !== null && (!isFiniteNumber(v) || v < 0)) refuse('REDUCE_INPUT_MISSING', `${who}: ${field}.${k} is ${JSON.stringify(v)}; required a finite number of px, 0 or more, or null (declared absent: measured, reported undeclared)`);
  }
}

/**
 * Whether `fit` declares the bound of an art row absent (issue #1254): the
 * 8-connected `MQ_OVERSHOOT` under `maxOvershoot: null`, `MQ_UNDERCUT` under
 * `maxUndercut: null`. Such a row is `undeclared` when measured and is never
 * required — not for admission, not for a step, not when it could not be
 * measured. Every other row answers false.
 */
function artBoundAbsent(fit: ArtFitBounds, row: MeasureRow): boolean {
  if (row.code === 'MQ_OVERSHOOT') return fit.maxOvershoot === null;
  if (row.code === 'MQ_UNDERCUT') return fit.maxUndercut === null;
  return false;
}

/**
 * The fields a reduction reads and a measurement does not, refused by name. The
 * art, the mesh's arrays, the regions' shapes and the sample floors are refused
 * by `measureMeshQuality`'s own validation when the source is first measured,
 * with the same codes.
 */
function validateReduction(input: MeshReductionInput): void {
  if (!isObject(input)) refuse('REDUCE_INPUT_MISSING', `the input is ${JSON.stringify(input)}; required a MeshReductionInput object`);
  if (!isRef(input.attachment)) refuse('REDUCE_INPUT_MISSING', `attachment is ${JSON.stringify(input.attachment)}; required { skin: string | null, slot: string, attachment: string }`);
  const who = `attachment ${nameOf(input.attachment)}`;
  checkFit(who, 'sourceBounds', input.sourceBounds);
  const t = input.targets;
  if (!isObject(t)) refuse('REDUCE_INPUT_MISSING', `${who}: targets is ${JSON.stringify(t)}; required { artFit, maxBoundaryDeviation, regions }`);
  checkFit(who, 'targets.artFit', t.artFit);
  if (!isFiniteNumber(t.maxBoundaryDeviation) || t.maxBoundaryDeviation < 0) {
    refuse('REDUCE_INPUT_MISSING', `${who}: targets.maxBoundaryDeviation is ${JSON.stringify(t.maxBoundaryDeviation)}; required a finite number of px, 0 or more (P13: the required preservation bound)`);
  }
  if (!Array.isArray(t.regions)) refuse('REDUCE_INPUT_MISSING', `${who}: targets.regions is ${JSON.stringify(t.regions)}; required a list (empty when none)`);
  const b = input.budget;
  if (!isObject(b) || !Number.isInteger(b.maxCandidates) || (b.maxCandidates as number) < 0) {
    refuse('REDUCE_INPUT_MISSING', `${who}: budget is ${JSON.stringify(b)}; required { maxCandidates: a whole number, 0 or more } — the work bound has no default`);
  }
  if ('stopAfterAccepted' in input && input.stopAfterAccepted !== undefined && (!Number.isInteger(input.stopAfterAccepted) || input.stopAfterAccepted < 0)) {
    refuse('REDUCE_INPUT_MISSING', `${who}: stopAfterAccepted is ${JSON.stringify(input.stopAfterAccepted)}; required a whole number of accepted steps, 0 or more, or the field left out (issue #1268: replay to that step)`);
  }
  const src = input.source;
  if (!isObject(src) || !Array.isArray(src.points)) refuse('REDUCE_INPUT_MISSING', `${who}: source is not { points, uvs, triangles, hull, weights }`);
  const n = src.points.length;

  const p = input.protect;
  if (p === undefined || p === null || !isObject(p)) refuse('REDUCE_INPUT_MISSING', `${who}: protect is ${JSON.stringify(p)}; required a ProtectedFeatures — a reduction has no default protection (P20)`);
  if (typeof p.hull !== 'boolean') refuse('REDUCE_INPUT_MISSING', `${who}: protect.hull is ${JSON.stringify(p.hull)}; required true or false (P20: no default inside the operation)`);
  if (!Array.isArray(p.vertices) || !Array.isArray(p.edges) || !Array.isArray(p.regionBoundaries) || !Array.isArray(p.influences) || !(p.weightJump === null || (isFiniteNumber(p.weightJump) && p.weightJump >= 0))) {
    refuse('REDUCE_INPUT_MISSING', `${who}: protect is not { hull, vertices, edges, regionBoundaries, weightJump, influences } with lists and a weightJump that is null or 0 or more`);
  }
  p.vertices.forEach((v, i) => {
    if (!Number.isInteger(v) || v < 0 || v >= n) refuse('REDUCE_INPUT_MISSING', `${who}: protect.vertices[${i}] is ${JSON.stringify(v)}; required a source vertex index in 0..${n - 1}`);
  });
  const sourceEdges = new Set<string>();
  if (Array.isArray(src.triangles)) {
    for (let i = 0; i + 2 < src.triangles.length; i += 3) {
      const tri = [src.triangles[i], src.triangles[i + 1], src.triangles[i + 2]];
      for (let k = 0; k < 3; k++) sourceEdges.add(edgeKey(tri[k], tri[(k + 1) % 3]));
    }
  }
  p.edges.forEach((e, i) => {
    if (!Array.isArray(e) || e.length !== 2 || !sourceEdges.has(edgeKey(e[0], e[1]))) {
      refuse('REDUCE_INPUT_MISSING', `${who}: protect.edges[${i}] is ${JSON.stringify(e)}; required a pair of source indices that is an edge of a source triangle`);
    }
  });
  const regionNames = new Set(t.regions.map((r) => (isObject(r) ? r.name : undefined)));
  p.regionBoundaries.forEach((name, i) => {
    if (!regionNames.has(name)) refuse('REDUCE_INPUT_MISSING', `${who}: protect.regionBoundaries[${i}] is ${JSON.stringify(name)}, which no region in targets.regions is; required a declared region's name`);
  });

  const weighted = src.weights !== null && src.weights !== undefined;
  if (weighted) {
    const lim = input.influences;
    if (lim === undefined || lim === null || !isObject(lim)) refuse('REDUCE_INPUT_MISSING', `${who}: influences is ${JSON.stringify(lim)} on a weighted source; required { maxInfluences, minWeight } — stated on every weighted call, never inherited (P19)`);
    if (!Number.isInteger(lim.maxInfluences) || lim.maxInfluences < 1) refuse('REDUCE_INPUT_MISSING', `${who}: influences.maxInfluences is ${JSON.stringify(lim.maxInfluences)}; required a whole number >= 1`);
    if (!isFiniteNumber(lim.minWeight) || lim.minWeight < 0 || lim.minWeight >= 1) refuse('REDUCE_INPUT_MISSING', `${who}: influences.minWeight is ${JSON.stringify(lim.minWeight)}; required a share in 0..1 (0 drops only shares that are zero on the weight grid)`);
    const order = input.boneOrder;
    if (!Array.isArray(order) || order.some((x) => typeof x !== 'string')) refuse('REDUCE_INPUT_MISSING', `${who}: boneOrder is ${JSON.stringify(order)} on a weighted source; required the skeleton's bone names in order (correction 1: the weight tie-break)`);
    if (new Set(order).size !== order.length) refuse('REDUCE_INPUT_MISSING', `${who}: boneOrder names a bone twice; required each bone once`);
    const known = new Set(order);
    if (Array.isArray(src.weights)) {
      src.weights.forEach((vertex, i) => {
        if (!Array.isArray(vertex)) return;
        for (const bnd of vertex) {
          if (isObject(bnd) && typeof bnd.bone === 'string' && !known.has(bnd.bone)) refuse('REDUCE_INPUT_MISSING', `${who}: source.weights[${i}] binds "${bnd.bone}", which boneOrder does not name; required every bound bone in boneOrder`);
          if (isObject(bnd) && isFiniteNumber(bnd.weight) && bnd.weight < 0) refuse('REDUCE_INPUT_MISSING', `${who}: source.weights[${i}] gives "${String(bnd.bone)}" the weight ${bnd.weight}; required 0 or more`);
        }
      });
    }
    p.influences.forEach((bone, i) => {
      if (!known.has(bone)) refuse('REDUCE_INPUT_MISSING', `${who}: protect.influences[${i}] is ${JSON.stringify(bone)}, which boneOrder does not name; required a bone of the skeleton`);
    });
  }

  for (const field of ['minArtSamples', 'regionArtSamples', 'preset'] as const) {
    if (input[field] === undefined) refuse('REDUCE_INPUT_MISSING', `${who}: ${field} is missing; required a value — no field has a default`);
  }
  if (!Array.isArray(input.linkedMeshes)) refuse('REDUCE_INPUT_MISSING', `${who}: linkedMeshes is ${JSON.stringify(input.linkedMeshes)}; required a list of the source's linked meshes (empty when none)`);
  input.linkedMeshes.forEach((ref, i) => {
    if (!isRef(ref)) refuse('REDUCE_INPUT_MISSING', `${who}: linkedMeshes[${i}] is ${JSON.stringify(ref)}; required an AttachmentRef`);
  });
  if (!Array.isArray(input.deform)) refuse('REDUCE_INPUT_MISSING', `${who}: deform is ${JSON.stringify(input.deform)}; required a list of the deform timelines keyed on the attachment and its linked meshes (empty when none)`);
  input.deform.forEach((tl, i) => {
    if (!isObject(tl) || typeof tl.animation !== 'string' || tl.animation === '' || !isRef(tl.attachment) || !Array.isArray(tl.keys)) {
      refuse('REDUCE_INPUT_MISSING', `${who}: deform[${i}] is not { animation, attachment, keys }; required that`);
    }
    if (!sameRef(tl.attachment, input.attachment) && !input.linkedMeshes.some((l) => sameRef(l, tl.attachment))) {
      refuse('REDUCE_INPUT_MISSING', `${who}: deform[${i}] (animation "${tl.animation}") is keyed on ${nameOf(tl.attachment)}, which is neither the attachment nor a listed linked mesh; required one of those`);
    }
    tl.keys.forEach((key, k) => {
      const at = `${who}: deform[${i}] (animation "${tl.animation}") key ${k}`;
      if (!isObject(key) || !isFiniteNumber(key.time)) refuse('REDUCE_INPUT_MISSING', `${at} has no finite time; required one`);
      if (key.kind === 'vertices') {
        if (!Number.isInteger(key.offset) || key.offset < 0) refuse('REDUCE_INPUT_MISSING', `${at}: offset is ${JSON.stringify(key.offset)}; required a whole index into the deform array, 0 or more`);
        if (!Array.isArray(key.vertices) || key.vertices.some((v) => !isFiniteNumber(v))) refuse('REDUCE_INPUT_MISSING', `${at}: vertices is not a list of finite numbers; required the run as the compiler emits it`);
      } else if (key.kind !== 'setup' && key.kind !== 'transform') {
        refuse('REDUCE_INPUT_MISSING', `${at}: kind is ${JSON.stringify((key as { kind: unknown }).kind)}; required "setup", "vertices" or "transform"`);
      }
    });
  });
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

// ---------------------------------------------------------------------------
// the working mesh — vertices by stable id: source index, then insertion order
// ---------------------------------------------------------------------------

interface Work {
  /** Number of source vertices: ids below it are source indices, ids from it are insertions in order. */
  nSource: number;
  pos: Pt[];
  uv: Array<[number, number]>;
  weights: Binding[][] | null;
  alive: boolean[];
  triangles: Array<[number, number, number]>;
  /** For an inserted id, the source triangle its UV and weights were interpolated in. */
  sourceTriangle: Map<number, number>;
}

interface Canonical {
  mesh: SourceMesh;
  /** Result index → working id. */
  order: number[];
  /** Working id → result index. */
  indexOf: Map<number, number>;
}

/**
 * §1's canonical order, read off a working mesh — or a `MeshError` naming why
 * its triangles are not one closed outline.
 *
 * 1. hull vertices in walk order, from the surviving hull vertex with the
 *    smallest source index (an inserted one only when no source vertex is on
 *    the hull), turning the way the source's own hull listing turns;
 * 2. surviving interior source vertices, ascending source index;
 * 3. inserted interior vertices, ascending by (y, x) on the `r6` grid;
 * 4. triangles rotated to start at their smallest index, winding kept, sorted;
 * 5. bindings strongest first, ties by the bone's position in `boneOrder`.
 */
function canonicalise(work: Work, sourceTurn: number, boneRank: Map<string, number>): Canonical {
  const ids: number[] = [];
  for (let id = 0; id < work.alive.length; id++) if (work.alive[id]) ids.push(id);
  const compact = new Map<number, number>();
  ids.forEach((id, i) => compact.set(id, i));
  const flat: number[] = [];
  for (const tri of work.triangles) for (const id of tri) flat.push(compact.get(id)!);
  const outline = traceOutline(ids.length, flat);
  let walk = outline.walk.map((i) => ids[i]);
  const start = walk.indexOf(Math.min(...walk));
  walk = [...walk.slice(start), ...walk.slice(0, start)];
  const turn = Math.sign(signedArea(walk.map((id) => [work.pos[id][0], work.pos[id][1]])));
  if (turn !== sourceTurn) walk = [walk[0], ...walk.slice(1).reverse()];
  const onHull = new Set(walk);
  const interiorSource = ids.filter((id) => !onHull.has(id) && id < work.nSource);
  const interiorInserted = ids
    .filter((id) => !onHull.has(id) && id >= work.nSource)
    .sort((a, b) => work.pos[a][1] - work.pos[b][1] || work.pos[a][0] - work.pos[b][0] || a - b);
  const order = [...walk, ...interiorSource, ...interiorInserted];
  const indexOf = new Map<number, number>();
  order.forEach((id, i) => indexOf.set(id, i));
  const tris = work.triangles.map(([a, b, c]): [number, number, number] => {
    const t: [number, number, number] = [indexOf.get(a)!, indexOf.get(b)!, indexOf.get(c)!];
    const k = t.indexOf(Math.min(...t));
    return [t[k], t[(k + 1) % 3], t[(k + 2) % 3]];
  });
  tris.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  const mesh: SourceMesh = {
    points: order.map((id): [number, number] => [work.pos[id][0], work.pos[id][1]]),
    uvs: order.flatMap((id) => work.uv[id]),
    triangles: tris.flat(),
    hull: walk.length,
    weights: work.weights === null ? null : order.map((id) => sortBindings(work.weights![id], boneRank)),
  };
  checkHullOrder({ hull: mesh.hull, walk: [...Array(mesh.hull).keys()] }, order.length);
  return { mesh, order, indexOf };
}

/** Strongest first, ties by the bone's place in `boneOrder` — the values themselves untouched. */
function sortBindings(list: readonly Binding[], boneRank: Map<string, number>): Binding[] {
  return list.map((b) => ({ bone: b.bone, weight: b.weight })).sort((p, q) => q.weight - p.weight || (boneRank.get(p.bone) ?? 0) - (boneRank.get(q.bone) ?? 0));
}

// ---------------------------------------------------------------------------
// plane geometry the steps need (the rows' own geometry stays in meshquality.ts)
// ---------------------------------------------------------------------------

function inClosedPolygon(p: Pt, poly: readonly Pt[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) if (distanceToSegment(p, poly[i], poly[(i + 1) % n]) <= ON_BOUNDARY) return true;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToBoundary(p: Pt, poly: readonly Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distanceToSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

/** Is `p` in the closed region or within its band — the set P16's checkable form confines an insertion to? */
function inRegionOrBand(p: Pt, region: RefinementRegion): boolean {
  return inClosedPolygon(p, region.polygon) || (region.transition > 0 && distanceToBoundary(p, region.polygon) <= region.transition);
}

/** Barycentric coordinates of `p` in the triangle a, b, c, or null for a triangle with no area. */
function barycentric(p: Pt, a: Pt, b: Pt, c: Pt): [number, number, number] | null {
  const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(det) < 1e-12) return null;
  const l0 = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / det;
  const l1 = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / det;
  return [l0, l1, 1 - l0 - l1];
}

// ---------------------------------------------------------------------------
// what an inserted vertex carries — §6: interpolate, then prune
// ---------------------------------------------------------------------------

interface Tally {
  sharesDroppedOnGrid: number;
  sharesPruned: number;
}

interface Interpolated {
  uv: [number, number];
  weights: Binding[] | null;
  sourceTriangle: number;
}

/**
 * UV and weights of a point by barycentric interpolation in the source triangle
 * containing it — the first by triangle index whose smallest coordinate is the
 * largest, so a point on a shared edge takes the lower-numbered triangle (the
 * two agree there) and a point rounded a hair outside onto the grid still finds
 * the triangle it belongs to.
 */
function interpolate(p: Pt, input: MeshReductionInput, boneRank: Map<string, number>, tally: Tally, who: string): Interpolated {
  const src = input.source;
  let best = -1;
  let bestMin = -Infinity;
  let bestL: [number, number, number] = [0, 0, 0];
  for (let t = 0; t * 3 + 2 < src.triangles.length; t++) {
    const [a, b, c] = [src.triangles[t * 3], src.triangles[t * 3 + 1], src.triangles[t * 3 + 2]];
    const l = barycentric(p, src.points[a], src.points[b], src.points[c]);
    if (l === null) continue;
    const m = Math.min(...l);
    if (m > bestMin + 1e-12) {
      best = t;
      bestMin = m;
      bestL = l;
    }
  }
  const clamped = bestL.map((v) => Math.max(0, v));
  const sum = clamped[0] + clamped[1] + clamped[2];
  const lam = clamped.map((v) => v / sum);
  const corners = [src.triangles[best * 3], src.triangles[best * 3 + 1], src.triangles[best * 3 + 2]];
  const uv: [number, number] = [0, 1].map((k) => r6(corners.reduce((s, v, i) => s + lam[i] * src.uvs[v * 2 + k], 0))) as [number, number];
  if (src.weights === null) return { uv, weights: null, sourceTriangle: best };
  const shares = new Map<string, number>();
  corners.forEach((v, i) => {
    for (const bnd of src.weights![v]) shares.set(bnd.bone, (shares.get(bnd.bone) ?? 0) + lam[i] * bnd.weight);
  });
  const where = `${who}: the vertex inserted at (${p[0]}, ${p[1]}) in source triangle ${best} (vertices ${corners.join(', ')})`;
  return { uv, weights: prune(shares, input, boneRank, tally, where), sourceTriangle: best };
}

/**
 * `InfluenceLimits` applied to one interpolated weight vector (§6, P19): the
 * protected influences kept first, then the strongest others up to
 * `maxInfluences`; shares under `minWeight` dropped; a positive share that is 0
 * on the 6-decimal weight grid dropped and counted rather than written as a 0
 * binding (`minWeight: 0` drops only those); the rest closed at `1 − others`,
 * the `segmentShares` rule. Every bone it returns is one the source triangle
 * carried — interpolation cannot name another.
 */
function prune(shares: Map<string, number>, input: MeshReductionInput, boneRank: Map<string, number>, tally: Tally, where: string): Binding[] {
  const limits = input.influences!;
  const guarded = new Set(input.protect.influences);
  const rank = (bone: string): number => boneRank.get(bone) ?? 0;
  let entries = [...shares.entries()].filter(([, s]) => s > 0).map(([bone, share]) => ({ bone, share }));
  entries.sort((p, q) => q.share - p.share || rank(p.bone) - rank(q.bone));
  const kept = entries.filter((e) => guarded.has(e.bone));
  if (kept.length > limits.maxInfluences) {
    throw new Stop(
      'invalid-input',
      'REDUCE_PROTECTED_INFLUENCES_OVER_CAP',
      `${where} carries ${kept.length} protected influence(s) (${kept.map((e) => e.bone).join(', ')}); required at most influences.maxInfluences = ${limits.maxInfluences} — a protected influence is never pruned silently`,
    );
  }
  for (const e of entries) {
    if (guarded.has(e.bone)) continue;
    if (kept.length < limits.maxInfluences) kept.push(e);
    else tally.sharesPruned++;
  }
  entries = kept.sort((p, q) => q.share - p.share || rank(p.bone) - rank(q.bone));
  const normalise = (): void => {
    const total = entries.reduce((s, e) => s + e.share, 0);
    for (const e of entries) e.share /= total;
  };
  normalise();
  if (limits.minWeight > 0) {
    const before = entries.length;
    entries = entries.filter((e) => guarded.has(e.bone) || e.share >= limits.minWeight);
    tally.sharesPruned += before - entries.length;
    normalise();
  }
  for (;;) {
    const zero = entries.find((e) => r6(e.share) === 0);
    if (zero === undefined) break;
    if (guarded.has(zero.bone)) {
      throw new Stop(
        'invalid-input',
        'REDUCE_PROTECTED_INFLUENCE_BELOW_GRID',
        `${where} gives the protected influence "${zero.bone}" a share of ${zero.share}, which is 0 on the 6-decimal weight grid; required a share that can be written as a positive binding — a protected influence is never dropped silently`,
      );
    }
    entries = entries.filter((e) => e !== zero);
    tally.sharesDroppedOnGrid++;
    normalise();
  }
  for (;;) {
    const out: Binding[] = [];
    let others = 0;
    entries.forEach((e, k) => {
      const w = k === entries.length - 1 ? r6(1 - others) : r6(e.share);
      others += w;
      out.push({ bone: e.bone, weight: w });
    });
    const last = out[out.length - 1];
    if (last.weight > 0) return out;
    // The closing share fell to 0 or below on the grid: it is a share the grid cannot hold.
    const lastEntry = entries[entries.length - 1];
    if (guarded.has(lastEntry.bone)) {
      throw new Stop(
        'invalid-input',
        'REDUCE_PROTECTED_INFLUENCE_BELOW_GRID',
        `${where} closes the protected influence "${lastEntry.bone}" at ${last.weight} on the 6-decimal weight grid; required a positive binding`,
      );
    }
    entries = entries.slice(0, -1);
    tally.sharesDroppedOnGrid++;
    normalise();
  }
}

// ---------------------------------------------------------------------------
// the deform keys (P18)
// ---------------------------------------------------------------------------

/** Deform-array start of each vertex and its width: two per vertex unweighted, two per influence weighted. */
function layoutOf(weights: readonly Binding[][] | null, count: number): { start: number[]; width: number[] } {
  const start: number[] = [];
  const width: number[] = [];
  let at = 0;
  for (let v = 0; v < count; v++) {
    const w = weights === null ? 2 : 2 * weights[v].length;
    start.push(at);
    width.push(w);
    at += w;
  }
  return { start, width };
}

/** The source vertices a `vertices` run writes into. */
function verticesUnder(key: Extract<DeformKeyInput, { kind: 'vertices' }>, layout: { start: number[]; width: number[] }): number[] {
  const out: number[] = [];
  const end = key.offset + key.vertices.length;
  layout.start.forEach((s, v) => {
    if (s < end && s + layout.width[v] > key.offset) out.push(v);
  });
  return out;
}

function deformName(animation: string, ref: AttachmentRef, key: number, time: number): string {
  return `animation "${animation}", slot "${ref.slot}", attachment "${ref.attachment}"${ref.skin === null ? '' : ` (skin "${ref.skin}")`}, key ${key} (t ${time})`;
}

/** Refused before any work (P18): a deform timeline keyed on a linked mesh, whose own keys this remap does not carry; and a run past the source's array (A35). */
function checkDeformBeforeWork(input: MeshReductionInput): void {
  const layout = layoutOf(input.source.weights, input.source.points.length);
  const length = layout.start.length === 0 ? 0 : layout.start[layout.start.length - 1] + layout.width[layout.width.length - 1];
  for (const tl of input.deform) {
    const linked = !sameRef(tl.attachment, input.attachment);
    tl.keys.forEach((key, k) => {
      if (linked && key.kind !== 'setup') {
        throw new Stop(
          'unsupported-topology',
          'REDUCE_DEFORM_INDEXED',
          `attachment ${nameOf(input.attachment)}: ${deformName(tl.animation, tl.attachment, k, key.time)} is keyed on a linked mesh of ${nameOf(input.attachment)}; required keys on the source attachment only — a linked mesh's own vertex-indexed keys are not remapped by this operation, and a linked mesh that inherits plays the source's remapped keys`,
        );
      }
      if (key.kind === 'vertices' && key.offset + key.vertices.length > length) {
        refuse(
          'REDUCE_INPUT_MISSING',
          `attachment ${nameOf(input.attachment)}: ${deformName(tl.animation, tl.attachment, k, key.time)} writes deform-array entries ${key.offset}..${key.offset + key.vertices.length - 1}; required within the source's ${length} (A35)`,
        );
      }
    });
  }
}

/** The vertices runs on the source that cover a source vertex — what an insertion beside it would sit under. */
function keyedSourceVertices(input: MeshReductionInput): Map<number, { animation: string; ref: AttachmentRef; key: number; time: number }> {
  const layout = layoutOf(input.source.weights, input.source.points.length);
  const out = new Map<number, { animation: string; ref: AttachmentRef; key: number; time: number }>();
  for (const tl of input.deform) {
    tl.keys.forEach((key, k) => {
      if (key.kind !== 'vertices') return;
      for (const v of verticesUnder(key, layout)) if (!out.has(v)) out.set(v, { animation: tl.animation, ref: tl.attachment, key: k, time: key.time });
    });
  }
  return out;
}

/**
 * Every deform key carried onto the result's vertex order. A `vertices` run is
 * rewritten entry by entry onto the vertex and influence it addressed; entries
 * of a removed vertex are dropped and reported; the gaps a reorder opens are
 * zero, which is what the format reads outside a run anyway. Refused by name: a
 * weighted keyed vertex whose binding list is not the same list in the same
 * order in the result — its pairs would land on other influences.
 */
function remapDeform(input: MeshReductionInput, result: SourceMesh, indexMap: Array<number | null>): { remapped: RemappedDeformKey[]; reevaluated: DeformKeyRef[] } {
  const before = layoutOf(input.source.weights, input.source.points.length);
  const after = layoutOf(result.weights, result.points.length);
  const remapped: RemappedDeformKey[] = [];
  const reevaluated: DeformKeyRef[] = [];
  for (const tl of input.deform) {
    tl.keys.forEach((key, k) => {
      if (key.kind === 'transform') {
        reevaluated.push({ animation: tl.animation, attachment: tl.attachment, key: k, time: key.time });
        return;
      }
      if (key.kind !== 'vertices') return;
      const placed = new Map<number, number>();
      const dropped = new Set<number>();
      key.vertices.forEach((value, j) => {
        const at = key.offset + j;
        let v = 0;
        while (v + 1 < before.start.length && before.start[v + 1] <= at) v++;
        const within = at - before.start[v];
        const r = indexMap[v];
        if (r === null) {
          dropped.add(v);
          return;
        }
        if (input.source.weights !== null) {
          const was = input.source.weights[v].map((b) => b.bone).join(',');
          const now = result.weights![r].map((b) => b.bone).join(',');
          if (was !== now) {
            throw new Stop(
              'unsupported-topology',
              'REDUCE_DEFORM_INDEXED',
              `attachment ${nameOf(input.attachment)}: ${deformName(tl.animation, tl.attachment, k, key.time)} keys source vertex ${v}, weighted [${was}], which the result binds [${now}]; required the same influences in the same order, so each pair of the run still lands on its influence — a weighted keyed mesh whose influence layout changes is not remapped`,
            );
          }
        }
        placed.set(after.start[r] + within, value);
      });
      const positions = [...placed.keys()].sort((a, b) => a - b);
      const offset = positions.length === 0 ? 0 : positions[0];
      const vertices: number[] = [];
      if (positions.length > 0) for (let at = offset; at <= positions[positions.length - 1]; at++) vertices.push(placed.get(at) ?? 0);
      remapped.push({ animation: tl.animation, attachment: tl.attachment, key: k, time: key.time, offset, vertices, droppedVertices: [...dropped].sort((a, b) => a - b) });
    });
  }
  return { remapped, reevaluated };
}

// ---------------------------------------------------------------------------
// the composed operation's shared state
// ---------------------------------------------------------------------------

interface Run {
  input: MeshReductionInput;
  who: string;
  work: Work;
  boneRank: Map<string, number>;
  sourceTurn: number;
  sourceHull: Array<[number, number]>;
  /** Steps tried so far, refinement insertions and removal attempts alike. */
  steps: number;
  /** Issue #1268: `steps` as it stood at each accepted step — every insertion made and every removal taken — in order. */
  acceptedAt: number[];
  /** The replay fault planted for a control, or null. */
  plant: ReplayPlant | null;
  tally: Tally;
  keyed: Map<number, { animation: string; ref: AttachmentRef; key: number; time: number }>;
  protectedVertices: Set<number>;
  protectedEdges: Array<[number, number]>;
  sourceEdges: Set<string>;
  /** The art's rasters, taken once for the call and read by every measurement in it (issue #1240). */
  rasters: ArtRasters;
  /** The step state each removal and insertion is measured through, carried from the last measurement (issue #1246); null measures every step in full. */
  stepRasters: StepRasters | null;
}

/** A measurement of a canonical mesh against the result's full contract. */
function measureAgainstTargets(run: Run, mesh: SourceMesh, id: string): MeshQualityReport {
  const { input } = run;
  const targets = input.targets;
  const measureInput: MeshMeasureInput = {
    id,
    attachment: input.attachment,
    art: input.art,
    source: mesh,
    targets: { artFit: targets.artFit, maxBoundaryDeviation: targets.maxBoundaryDeviation, ...(targets.minAngle === undefined ? {} : { minAngle: targets.minAngle }), regions: targets.regions },
    referenceHull: run.sourceHull,
    minArtSamples: input.minArtSamples,
    regionArtSamples: input.regionArtSamples,
    protect: input.protect,
    influences: input.influences,
    boneOrder: input.boneOrder,
    preset: input.preset,
  };
  return run.stepRasters === null ? measureMeshQualityWith(measureInput, run.rasters) : measureMeshQualityStep(measureInput, run.stepRasters);
}

/** The order constraints are named in when several fail on one step: structure, then shape, then art, then density. */
const BLOCKING_ORDER = ['MQ_ORIENTATION', 'MQ_DEGENERATE', 'MQ_BOUNDARY_DEVIATION', 'MQ_COVERAGE', 'MQ_OVERSHOOT', 'MQ_UNDERCUT', 'MQ_MIN_ANGLE', 'MQ_MAX_EDGE', 'MQ_TRANSITION'];

function rowName(row: MeasureRow): string {
  const region = row.object.region === null ? '' : `[${row.object.region}]`;
  if (row.state === 'fail') return `${row.code}${region}: ${row.value} against ${row.bound!.op} ${row.bound!.value}`;
  return `${row.code}${region}: ${row.state} — ${row.reason ?? ''}`;
}

/**
 * The first required row that is not `pass`, in `BLOCKING_ORDER`, or null when
 * every one passes. A row is required exactly when its bound is declared — an
 * art bound declared `null` is not (`artBoundAbsent`, issue #1254); the
 * overshoot row gated is the 8-connected one (P12).
 */
function firstBlockingRow(report: MeshQualityReport, artFit: ArtFitBounds): MeasureRow | null {
  const rows = report.candidates[0]?.geometry?.rows ?? [];
  const required = (r: MeasureRow): boolean => {
    if (artBoundAbsent(artFit, r)) return false;
    if (r.code === 'MQ_OVERSHOOT') return r.art?.connectivity === 8;
    if (r.code === 'MQ_MIN_ANGLE') return r.bound !== null;
    if (r.code === 'MQ_HOLES' || r.code === 'MQ_ISLANDS' || r.code === 'MQ_TRACE_DEVIATION' || r.code === 'MQ_FILL_DISTANCE') return false;
    return true;
  };
  for (const code of BLOCKING_ORDER) {
    const hit = rows.find((r) => r.code === code && required(r) && r.state !== 'pass');
    if (hit !== undefined) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// refinement (§5)
// ---------------------------------------------------------------------------

/** Where to split edge a–b for `region`: its midpoint when that is in the region or its band, else the point inside them nearest the midpoint. */
function splitPoint(a: Pt, b: Pt, region: RefinementRegion): Pt | null {
  const at = (t: number): Pt => [r6(a[0] + (b[0] - a[0]) * t), r6(a[1] + (b[1] - a[1]) * t)];
  const usable = (q: Pt): boolean => inRegionOrBand(q, region) && !(q[0] === a[0] && q[1] === a[1]) && !(q[0] === b[0] && q[1] === b[1]);
  if (usable(at(0.5))) return at(0.5);
  // The parameters where the inside of the region or its band can begin or end: crossings of the
  // polygon's edges and the feet of its vertices; the inside point nearest the midpoint is among them.
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const ts = new Set<number>();
  const poly = region.polygon;
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i];
    const d = poly[(i + 1) % poly.length];
    ts.add(Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / len2)));
    const ex = d[0] - c[0];
    const ey = d[1] - c[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) > 1e-12) {
      const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den;
      const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
      if (t >= 0 && t <= 1 && u >= -1e-9 && u <= 1 + 1e-9) ts.add(t);
    }
  }
  const candidates = [...ts].filter((t) => t > 0 && t < 1 && usable(at(t))).sort((p, q) => Math.abs(p - 0.5) - Math.abs(q - 0.5) || p - q);
  if (candidates.length > 0) return at(candidates[0]);
  // A point of the edge in the band only at an endpoint: halve towards it from the midpoint.
  for (const end of [0, 1]) {
    if (!inRegionOrBand(end === 0 ? a : b, region)) continue;
    let t = 0.5;
    for (let i = 0; i < SPLIT_SEARCH_STEPS; i++) {
      t = (t + end) / 2;
      if (usable(at(t))) return at(t);
    }
  }
  return null;
}

/**
 * The parameter, from `inner` (0) to `outer` (1), of the point of the edge
 * nearest `outer` that lies within `level` of `region`'s polygon — where the
 * edge last leaves that offset of the polygon on its way to `outer` — or null
 * when no point of it comes that near. `outer` lies further than `level`, so
 * walking back from it the offset is first met where some polygon side is
 * exactly `level` away: the largest such parameter over the sides. Each side's
 * distance is convex along the edge, so its minimum is found by golden section
 * and the last parameter within `level` by bisection from there towards `outer`.
 */
function offsetExit(inner: Pt, outer: Pt, poly: readonly Pt[], level: number): number | null {
  const at = (t: number): Pt => [inner[0] + (outer[0] - inner[0]) * t, inner[1] + (outer[1] - inner[1]) * t];
  const g = (Math.sqrt(5) - 1) / 2;
  let best: number | null = null;
  for (let i = 0; i < poly.length; i++) {
    const c = poly[i];
    const e = poly[(i + 1) % poly.length];
    const f = (t: number): number => distanceToSegment(at(t), c, e);
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < EXIT_SEARCH_STEPS; k++) {
      const p = hi - g * (hi - lo);
      const q = lo + g * (hi - lo);
      if (f(p) <= f(q)) hi = q;
      else lo = p;
    }
    let inside = (lo + hi) / 2;
    if (f(inside) > level) continue;
    let outside = 1;
    for (let k = 0; k < EXIT_SEARCH_STEPS; k++) {
      const mid = (inside + outside) / 2;
      if (f(mid) <= level) inside = mid;
      else outside = mid;
    }
    if (best === null || inside > best) best = inside;
  }
  return best;
}

/**
 * [agreed, rig-parts#126] A split of `inner`–`outer` where it leaves
 * `region`'s band, so that the piece to `outer` only touches the band's outer
 * boundary and is exempt by `edgeIsHeldByRegion` — the one definition the
 * measurement reads. The split is put half of `BAND_CONTACT_TOLERANCE` inside
 * the outer boundary, then on the `r6` grid, so it lies inside the band (P16's
 * checkable form) and within the tolerance of its edge. Null when there is no
 * band, no point of the edge comes that near the polygon, or the point found
 * is an end or fails either condition — each re-checked rather than assumed.
 */
function outerSplit(inner: Pt, outer: Pt, region: RefinementRegion): Pt | null {
  if (!(region.transition > 0)) return null;
  const t = offsetExit(inner, outer, region.polygon, region.transition - BAND_CONTACT_TOLERANCE / 2);
  if (t === null) return null;
  const q: Pt = [r6(inner[0] + (outer[0] - inner[0]) * t), r6(inner[1] + (outer[1] - inner[1]) * t)];
  if ((q[0] === inner[0] && q[1] === inner[1]) || (q[0] === outer[0] && q[1] === outer[1])) return null;
  return inRegionOrBand(q, region) && !edgeIsHeldByRegion(q, outer, region) ? q : null;
}

/** Add a vertex at `p` with what interpolation gives it, refusing it under a deform run (P18). */
function addVertex(run: Run, p: Pt): number {
  const got = interpolate(p, run.input, run.boneRank, run.tally, run.who);
  const src = run.input.source;
  for (let k = 0; k < 3; k++) {
    const corner = src.triangles[got.sourceTriangle * 3 + k];
    const key = run.keyed.get(corner);
    if (key !== undefined) {
      throw new Stop(
        'unsupported-topology',
        'REDUCE_DEFORM_INDEXED',
        `${run.who}: ${deformName(key.animation, key.ref, key.key, key.time)} keys source vertex ${corner}, and the refinement would insert a vertex at (${p[0]}, ${p[1]}) in source triangle ${got.sourceTriangle} beside it, under the run; required no insertion under a vertices run — the inserted vertex has no offset in any key`,
      );
    }
  }
  const id = run.work.pos.length;
  run.work.pos.push(p);
  run.work.uv.push(got.uv);
  if (run.work.weights !== null) run.work.weights.push(got.weights!);
  run.work.alive.push(true);
  run.work.sourceTriangle.set(id, got.sourceTriangle);
  return id;
}

/** Split the edge between working ids a and b at `p`: each triangle on it becomes two, winding kept. */
function splitEdge(run: Run, a: number, b: number, p: Pt): void {
  const m = addVertex(run, p);
  const next: Array<[number, number, number]> = [];
  for (const tri of run.work.triangles) {
    const i = tri.indexOf(a);
    const j = tri.indexOf(b);
    if (i === -1 || j === -1) {
      next.push(tri);
      continue;
    }
    // Rotate so the edge is the triangle's first two corners, in its own winding.
    const r = (j - i + 3) % 3 === 1 ? i : j;
    const x = tri[r];
    const y = tri[(r + 1) % 3];
    const c = tri[(r + 2) % 3];
    next.push([x, m, c], [m, y, c]);
  }
  run.work.triangles = next;
}

/** Insert `p` into the working triangle that holds it: on an edge, that edge is split; inside, the triangle becomes three. */
function insertPoint(run: Run, p: Pt): boolean {
  const { work } = run;
  for (const tri of work.triangles) {
    const l = barycentric(p, work.pos[tri[0]], work.pos[tri[1]], work.pos[tri[2]]);
    if (l === null || Math.min(...l) < -1e-9) continue;
    const onEdge = l.findIndex((v) => Math.abs(v) <= 1e-9);
    if (onEdge !== -1) {
      splitEdge(run, tri[(onEdge + 1) % 3], tri[(onEdge + 2) % 3], p);
      return true;
    }
    const m = addVertex(run, p);
    work.triangles = work.triangles.flatMap((t): Array<[number, number, number]> => (t === tri ? [[tri[0], tri[1], m], [tri[1], tri[2], m], [tri[2], tri[0], m]] : [t]));
    return true;
  }
  return false;
}

type PhaseEnd =
  | { kind: 'done' }
  | { kind: 'budget' }
  | { kind: 'stuck'; constraint: string }
  | { kind: 'replayed' };

/**
 * Record an accepted step (issue #1268) and say whether the call's `stopAfterAccepted` is now reached — checked
 * straight after the step, before the budget is read again, so the replay stops in exactly the state the
 * unreplayed run held after that step.
 */
function accept(run: Run): boolean {
  run.acceptedAt.push(run.steps);
  const stop = run.input.stopAfterAccepted;
  if (stop === undefined) return false;
  const at = run.plant === 'stop-one-early' ? stop - 1 : run.plant === 'stop-one-late' ? stop + 1 : stop;
  return run.acceptedAt.length >= at;
}

/**
 * A fault planted on purpose in the replay, for the mesh-quality suite's controls (issue #1268): the stop taken
 * one accepted step before or after the one asked for. `reduceMesh` plants none.
 */
export type ReplayPlant = 'stop-one-early' | 'stop-one-late';

/**
 * Refine the working mesh until every region's `MQ_MAX_EDGE` and
 * `MQ_TRANSITION` that the refinement can act on passes. One insertion per
 * measurement: the first failing region row in report order has its worst edge
 * split. A band no edge lies in leaves `MQ_TRANSITION` not-measurable (B1's
 * definition) and is not something an insertion is aimed at.
 */
function refineRegions(run: Run): PhaseEnd {
  const regions = new Map(run.input.targets.regions.map((r) => [r.name, r]));
  if (regions.size === 0) return { kind: 'done' };
  for (;;) {
    const canon = canonicalise(run.work, run.sourceTurn, run.boneRank);
    const report = measureAgainstTargets(run, canon.mesh, 'refinement');
    const rows = report.candidates[0]?.geometry?.rows ?? [];
    const target = rows.find((r) => (r.code === 'MQ_MAX_EDGE' || r.code === 'MQ_TRANSITION') && r.state === 'fail') ?? rows.find((r) => r.code === 'MQ_MAX_EDGE' && r.state === 'not-measurable' && (r.reason ?? '').includes('no triangle edge meets'));
    if (target === undefined) return { kind: 'done' };
    if (run.steps >= run.input.budget.maxCandidates) return { kind: 'budget' };
    run.steps++;
    const region = regions.get(target.object.region!)!;
    if (target.state === 'not-measurable') {
      const p: Pt = [r6(region.polygon[0][0]), r6(region.polygon[0][1])];
      if (!insertPoint(run, p)) return { kind: 'stuck', constraint: `${rowName(target)} (the refinement found no triangle holding the region's first vertex)` };
      if (accept(run)) return { kind: 'replayed' };
      continue;
    }
    const [ra, rb] = target.worst!.at.edge!;
    const a = canon.order[ra];
    const b = canon.order[rb];
    // An end outside the region and its band: split where the edge leaves the band, so the piece to that
    // end only touches the band's outer boundary and is exempt (rig-parts#126) — the same predicate the
    // measurement reads decides it, so the next measurement agrees.
    let exited = false;
    for (const [inner, outer] of [[b, a], [a, b]] as const) {
      if (inRegionOrBand(run.work.pos[outer], region)) continue;
      const q = outerSplit(run.work.pos[inner], run.work.pos[outer], region);
      if (q === null) continue;
      splitEdge(run, a, b, q);
      exited = true;
      break;
    }
    if (exited) {
      if (accept(run)) return { kind: 'replayed' };
      continue;
    }
    // An end outside the region and its band further beyond it than the edge's own bound, with no split on
    // the band's outer boundary that frees the piece to it — always so with transition 0, where a contact
    // with the authored boundary stays held: every split keeps a held edge from a vertex inside the region
    // and its band to that end, so no insertion P16 allows can meet it.
    for (const [end, id] of [[ra, a], [rb, b]] as const) {
      const at = run.work.pos[id];
      if (inRegionOrBand(at, region)) continue;
      const beyond = distanceToBoundary(at, region.polygon) - region.transition;
      if (beyond > target.bound!.value) {
        const why =
          region.transition > 0
            ? 'no point of the edge on the band\'s outer boundary leaves the piece to it exempt, so an edge from inside the region and its band to it stays over the bound'
            : 'with no band, an edge from the region to it touches the authored boundary and stays held (rig-parts#126), so it stays over the bound';
        return {
          kind: 'stuck',
          constraint: `${rowName(target)} (vertex ${end} of edge ${ra}–${rb} lies ${r6(beyond)} px beyond region "${region.name}"'s ${region.transition} px band, further than the edge's bound ${target.bound!.value}: ${why}, and the refinement inserts only inside them — P16)`,
        };
      }
    }
    const p = splitPoint(run.work.pos[a], run.work.pos[b], region);
    if (p === null) return { kind: 'stuck', constraint: `${rowName(target)} (the refinement found no point of edge ${ra}–${rb} strictly between its ends inside region "${region.name}" or its band)` };
    splitEdge(run, a, b, p);
    if (accept(run)) return { kind: 'replayed' };
  }
}

// ---------------------------------------------------------------------------
// reduction (§1, §6)
// ---------------------------------------------------------------------------

/** One removal tried: the working triangles after it and the edges it added, or the structural reason it cannot be made. */
function removalOf(work: Work, v: number): { triangles: Array<[number, number, number]>; added: Array<[number, number]> } | { blocked: string } {
  const star = work.triangles.filter((t) => t.includes(v));
  const next = new Map<number, number>();
  const incoming = new Set<number>();
  for (const t of star) {
    const k = t.indexOf(v);
    const a = t[(k + 1) % 3];
    const b = t[(k + 2) % 3];
    if (next.has(a) || incoming.has(b)) return { blocked: `retriangulation: vertex ${v}'s triangles do not form one fan` };
    next.set(a, b);
    incoming.add(b);
  }
  const heads = [...next.keys()].filter((a) => !incoming.has(a));
  const boundary = heads.length === 1;
  if (heads.length > 1) return { blocked: `retriangulation: vertex ${v}'s triangles do not form one fan` };
  let at = boundary ? heads[0] : Math.min(...next.keys());
  const ring = [at];
  for (;;) {
    const to = next.get(at);
    if (to === undefined || to === ring[0]) break;
    ring.push(to);
    at = to;
    if (ring.length > next.size + 1) return { blocked: `retriangulation: vertex ${v}'s link does not close` };
  }
  if (ring.length !== (boundary ? next.size + 1 : next.size)) return { blocked: `retriangulation: vertex ${v}'s triangles do not form one fan` };
  const rest = work.triangles.filter((t) => !t.includes(v));
  const fresh: Array<[number, number, number]> = [];
  if (ring.length >= 3) {
    const poly = ring.map((id): [number, number] => [work.pos[id][0], work.pos[id][1]]);
    if (findSelfIntersection(poly) !== null) return { blocked: `retriangulation: the hole vertex ${v} leaves is not a strictly simple polygon` };
    let tris: number[];
    try {
      tris = earClip(poly);
    } catch (err) {
      if (!(err instanceof MeshError)) throw err;
      return { blocked: `retriangulation: the hole vertex ${v} leaves does not ear-clip (${err.message})` };
    }
    for (let i = 0; i < tris.length; i += 3) fresh.push([ring[tris[i]], ring[tris[i + 1]], ring[tris[i + 2]]]);
  } else if (!boundary) {
    return { blocked: `retriangulation: vertex ${v} has fewer than three neighbours` };
  }
  const old = new Set<string>();
  for (const t of work.triangles) for (let k = 0; k < 3; k++) old.add(edgeKey(t[k], t[(k + 1) % 3]));
  const added: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (const t of fresh) {
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(t[k], t[(k + 1) % 3]);
      if (old.has(key) || seen.has(key)) continue;
      seen.add(key);
      added.push([t[k], t[(k + 1) % 3]]);
    }
  }
  return { triangles: [...rest, ...fresh], added };
}

/** L1 difference of two weight vectors over the bones they name. */
function weightJump(work: Work, a: number, b: number): number {
  if (work.weights === null) return 0;
  const shares = new Map<string, number>();
  for (const bnd of work.weights[a]) shares.set(bnd.bone, (shares.get(bnd.bone) ?? 0) + bnd.weight);
  for (const bnd of work.weights[b]) shares.set(bnd.bone, (shares.get(bnd.bone) ?? 0) - bnd.weight);
  let sum = 0;
  for (const v of shares.values()) sum += Math.abs(v);
  return sum;
}

/**
 * Remove surviving source vertices in ascending source index, pass after pass,
 * taking a step only when every structural condition and every required row
 * holds after it. Ends when a pass takes no step, or when the budget is spent.
 */
function removeVertices(run: Run): PhaseEnd {
  const { work, input } = run;
  let lastBlock = '';
  for (;;) {
    let taken = 0;
    let tried = 0;
    for (let v = 0; v < work.nSource; v++) {
      if (!work.alive[v] || run.protectedVertices.has(v)) continue;
      if (run.steps >= input.budget.maxCandidates) return { kind: 'budget' };
      run.steps++;
      tried++;
      const block = tryRemoval(run, v);
      if (block === null) {
        taken++;
        if (accept(run)) return { kind: 'replayed' };
      } else lastBlock = `${block}, removing source vertex ${v}`;
    }
    if (taken === 0) {
      if (tried === 0) lastBlock = 'protect: every surviving source vertex is protected (protect.hull, protect.vertices, protect.edges, protect.regionBoundaries or a weightJump edge)';
      return { kind: 'stuck', constraint: lastBlock };
    }
  }
}

/** One removal: null when it was taken, else the constraint that blocked it. */
function tryRemoval(run: Run, v: number): string | null {
  const { work, input } = run;
  const step = removalOf(work, v);
  if ('blocked' in step) return step.blocked;
  const jump = input.protect.weightJump;
  if (jump !== null) {
    for (const [a, b] of step.added) {
      if (a < work.nSource && b < work.nSource && run.sourceEdges.has(edgeKey(a, b))) continue;
      const d = weightJump(work, a, b);
      if (d > jump) return `weightJump (b): the new edge ${a}–${b} joins weight vectors ${r6(d)} apart, over ${jump}`;
    }
  }
  const was = { triangles: work.triangles };
  work.triangles = step.triangles;
  work.alive[v] = false;
  const undo = (): void => {
    work.triangles = was.triangles;
    work.alive[v] = true;
  };
  const edges = new Set<string>();
  for (const t of work.triangles) for (let k = 0; k < 3; k++) edges.add(edgeKey(t[k], t[(k + 1) % 3]));
  for (const [a, b] of run.protectedEdges) {
    if (!edges.has(edgeKey(a, b))) {
      undo();
      return `protect (a): the protected source edge ${a}–${b} is no longer an edge`;
    }
  }
  let canon: Canonical;
  try {
    canon = canonicalise(work, run.sourceTurn, run.boneRank);
  } catch (err) {
    if (!(err instanceof MeshError)) throw err;
    undo();
    return `outline: ${err.message}`;
  }
  const blocking = firstBlockingRow(measureAgainstTargets(run, canon.mesh, 'candidate'), run.input.targets.artFit);
  if (blocking !== null) {
    undo();
    return rowName(blocking);
  }
  return null;
}

// ---------------------------------------------------------------------------
// the operation
// ---------------------------------------------------------------------------

/**
 * Reduce one mesh towards the caller's targets, refining it first where a
 * region asks for density — §1, §5 and §6 of docs/MESH_REDUCTION.md, geometry
 * only. Throws a `MeshReductionError` for a malformed input (a missing or
 * out-of-range field, a threshold, a mask or a UV out of range); reports
 * everything else, with exactly one `Termination`:
 *
 * - `invalid-input`: the source fails its own art bounds
 *   (`REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS`, `sourceBounds` only — correction 3),
 *   a region is refused (`REGION_*`), full coverage is asked of a source that
 *   leaves an art island untouched (`REDUCE_ISLAND_UNREACHED`), or an inserted
 *   vertex's protected influences cannot be written
 *   (`REDUCE_PROTECTED_INFLUENCES_OVER_CAP`, `REDUCE_PROTECTED_INFLUENCE_BELOW_GRID`);
 * - `unsupported-topology`: the source is not one loop
 *   (`REDUCE_SOURCE_NOT_ONE_LOOP`) or a deform key cannot be carried
 *   (`REDUCE_DEFORM_INDEXED`);
 * - `budget-exhausted`: `budget.maxCandidates` steps were tried — the result is
 *   returned when it meets every required bound, and none is when it does not;
 * - `no-further-valid-reduction`: a pass took no step, naming what blocked the
 *   last one. A local stop: nothing here says the result is the smallest.
 * - `replayed-to-accepted-step`: the input's `stopAfterAccepted` was reached —
 *   the mesh is the one the same call without it held after that many accepted
 *   steps, byte for byte (issue #1268). Never reported as an exhausted budget; a
 *   stop the run does not reach leaves the run's own termination, which then
 *   carries `stopAfterAccepted: { requested, acceptedSteps }`.
 */
export function reduceMesh(input: MeshReductionInput): MeshReductionResult {
  validateReduction(input);
  const rasters = artRastersOf(input.art);
  return reduceValidated(input, rasters, stepRastersOf(rasters));
}

/**
 * `reduceMesh` over art rasters the caller made (`artRastersOf`,
 * `src/meshrasters.ts`) — the result is `reduceMesh`'s for the same input, byte
 * for byte, and every measurement of the call reads the one object, so its
 * `tally` is the count of what the call computed. Rasters taken from another
 * art are refused at admission (`REDUCE_ART_RASTERS_MISMATCH`). Each step is
 * measured through `steps` (`stepRastersOf(rasters)` unless given), carried
 * from the last measurement (issue #1246); `null` measures every step in full,
 * which is the path the carried one is held equal to. Step rasters made over
 * another rasters object are refused by the same code.
 *
 * Internal: it is on `rig-c/mesh` only because that entry re-exports this
 * module with `export *`, and a symbol that is merely exported is not promised
 * (RELEASING.md, *The import surface*).
 */
export function reduceMeshWith(input: MeshReductionInput, rasters: ArtRasters, steps: StepRasters | null = stepRastersOf(rasters), plant: ReplayPlant | null = null): MeshReductionResult {
  validateReduction(input);
  if (steps !== null && steps.rasters !== rasters) {
    refuse('REDUCE_ART_RASTERS_MISMATCH', `attachment ${nameOf(input.attachment)}: the step rasters were made over another rasters object; required step rasters made over the rasters passed beside them (stepRastersOf(rasters))`);
  }
  return reduceValidated(input, rasters, steps, plant);
}

/**
 * The operation, over an input `validateReduction` accepted; the art's rasters are computed at most once, in
 * `rasters`, and every refinement and removal step is measured through `steps` when it is given (issue #1246).
 */
function reduceValidated(input: MeshReductionInput, rasters: ArtRasters, steps: StepRasters | null, plant: ReplayPlant | null = null): MeshReductionResult {
  const who = `attachment ${nameOf(input.attachment)}`;
  const src = input.source;
  const sourceHull: Array<[number, number]> = src.points.slice(0, Math.max(0, src.hull)).map(([x, y]): [number, number] => [x, y]);

  // The source, measured against its own admissibility bounds (correction 3) — this is also what refuses a
  // malformed art, mesh, region list or sample floor, by measureMeshQuality's own codes. Through the step
  // rasters when the call carries them, so what a region reads of the art alone is computed once (issue #1253).
  const admitInput: MeshMeasureInput = {
    id: 'source',
    attachment: input.attachment,
    art: input.art,
    source: src,
    targets: { artFit: input.sourceBounds, maxBoundaryDeviation: null, regions: input.targets.regions },
    referenceHull: null,
    minArtSamples: input.minArtSamples,
    regionArtSamples: input.regionArtSamples,
    protect: input.protect,
    influences: input.influences,
    boneOrder: input.boneOrder,
    preset: input.preset,
  };
  const admit = steps === null ? measureMeshQualityWith(admitInput, rasters) : measureMeshQualityStep(admitInput, steps);
  const effective = effectiveOf(input, admit.effective, sourceHull);
  const sourceCounts = admit.sourceCounts;
  const noMesh = (termination: Termination): MeshReductionResult => ({
    mesh: null,
    report: reportOf(effective, sourceCounts, { id: 'result', counts: null, geometry: null, motion: null, accepted: false }, termination),
  });
  if (admit.termination !== null) return noMesh(admit.termination);

  try {
    const admitRows = admit.candidates[0]?.geometry?.rows ?? [];
    for (const row of admitRows) {
      if (row.state === 'refused') {
        const reason = row.reason ?? '';
        const code = reason.slice(0, reason.indexOf(':'));
        throw new Stop('invalid-input', code, reason.slice(code.length + 2));
      }
    }
    for (const code of ['MQ_ORIENTATION', 'MQ_DEGENERATE', 'MQ_COVERAGE', 'MQ_OVERSHOOT', 'MQ_UNDERCUT']) {
      const row = admitRows.find((r) => r.code === code && (code !== 'MQ_OVERSHOOT' || r.art?.connectivity === 8));
      if (row !== undefined && row.state !== 'pass' && !artBoundAbsent(input.sourceBounds, row)) {
        const found = row.state === 'fail' ? `${row.value} against ${row.bound!.op} ${row.bound!.value}` : `${row.state} (${row.reason ?? ''})`;
        throw new Stop(
          'invalid-input',
          'REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS',
          `${who}: the source's ${code} is ${found}; required the source to pass its own art bounds (sourceBounds) and its own winding — a source that does not is not a reference to reduce from (correction 3)`,
        );
      }
    }
    checkIslands(input, who, rasters);
    checkDeformBeforeWork(input);

    const boneRank = new Map((input.boneOrder ?? []).map((b, i) => [b, i]));
    const work: Work = {
      nSource: src.points.length,
      pos: src.points.map((p): Pt => p),
      uv: src.points.map((_, i): [number, number] => [src.uvs[i * 2], src.uvs[i * 2 + 1]]),
      weights: src.weights === null ? null : src.weights.map((v) => v.map((b) => ({ bone: b.bone, weight: b.weight }))),
      alive: src.points.map(() => true),
      triangles: [],
      sourceTriangle: new Map(),
    };
    for (let i = 0; i + 2 < src.triangles.length; i += 3) work.triangles.push([src.triangles[i], src.triangles[i + 1], src.triangles[i + 2]]);
    const sourceEdges = new Set<string>();
    for (const t of work.triangles) for (let k = 0; k < 3; k++) sourceEdges.add(edgeKey(t[k], t[(k + 1) % 3]));
    const run: Run = {
      input,
      who,
      work,
      boneRank,
      sourceTurn: Math.sign(signedArea(sourceHull)),
      sourceHull,
      steps: 0,
      acceptedAt: [],
      plant,
      tally: { sharesDroppedOnGrid: 0, sharesPruned: 0 },
      keyed: keyedSourceVertices(input),
      ...protectionOf(input, work, sourceEdges),
      sourceEdges,
      rasters,
      stepRasters: steps,
    };

    // Issue #1268: a replay ends in its own termination, never as an exhausted budget; a stop the run never reaches
    // leaves the run's own termination, which then carries `stopAfterAccepted` saying so.
    const replayed = (): Termination => ({ reason: 'replayed-to-accepted-step', acceptedSteps: run.acceptedAt.length, candidatesTried: run.steps });
    const stop = input.stopAfterAccepted;
    const notReached = (): { stopAfterAccepted?: StopNotReached } => (stop === undefined ? {} : { stopAfterAccepted: { requested: stop, acceptedSteps: run.acceptedAt.length } });
    if (stop === 0) return finish(run, effective, sourceCounts, replayed());
    const refined = refineRegions(run);
    if (refined.kind === 'replayed') return finish(run, effective, sourceCounts, replayed());
    if (refined.kind === 'budget') return noMesh({ reason: 'budget-exhausted', candidatesTried: run.steps, budget: input.budget.maxCandidates, result: 'none-met-the-targets', ...notReached() });
    const startCanon = canonicalise(work, run.sourceTurn, boneRank);
    const startBlock = firstBlockingRow(measureAgainstTargets(run, startCanon.mesh, 'start'), input.targets.artFit);
    let termination: Termination;
    if (startBlock !== null) {
      const constraint = refined.kind === 'stuck' ? refined.constraint : rowName(startBlock);
      termination = { reason: 'no-further-valid-reduction', candidatesTried: run.steps, blockingConstraint: `${constraint} — before any removal: the refined source does not meet its targets, so no step from it can`, ...notReached() };
    } else {
      const reduced = removeVertices(run);
      if (reduced.kind === 'replayed') return finish(run, effective, sourceCounts, replayed());
      termination =
        reduced.kind === 'budget'
          ? { reason: 'budget-exhausted', candidatesTried: run.steps, budget: input.budget.maxCandidates, result: 'best-meeting-every-bound', ...notReached() }
          : { reason: 'no-further-valid-reduction', candidatesTried: run.steps, blockingConstraint: reduced.kind === 'stuck' ? reduced.constraint : '', ...notReached() };
    }
    return finish(run, effective, sourceCounts, termination);
  } catch (err) {
    if (err instanceof Stop) return noMesh({ reason: err.reason, code: err.code, detail: err.detail });
    throw err;
  }
}

/** §4: full coverage asked of a source that touches no pixel of some art island is refused, never met by deleting art. */
function checkIslands(input: MeshReductionInput, who: string, rasters: ArtRasters): void {
  if (input.targets.artFit.minCoverage !== 1) return;
  const { mask, frame } = input.art;
  const { label, sizes } = rasters.islands();
  const onGrid = input.source.points.map(([x, y]): [number, number] => [x * frame.pageScale, y * frame.pageScale]);
  const covered = rasteriseTriangles(onGrid, input.source.triangles, mask.width, mask.height);
  const touched = new Set<number>();
  for (let i = 0; i < label.length; i++) if (label[i] && covered[i]) touched.add(label[i]);
  for (let island = 1; island <= sizes.length; island++) {
    if (touched.has(island) || sizes[island - 1] === 0) continue;
    const at = label.indexOf(island);
    throw new Stop(
      'invalid-input',
      'REDUCE_ISLAND_UNREACHED',
      `${who}: the art island of ${sizes[island - 1]} pixel(s) at (${at % mask.width}, ${Math.floor(at / mask.width)}) has no pixel the source covers, and targets.artFit.minCoverage is 1; required a source that reaches every island when full coverage is asked — art is never deleted to meet a bound (§4)`,
    );
  }
}

/** The vertices no step may remove and the source edges every result must keep (§6, conditions (a) and (b)). */
function protectionOf(input: MeshReductionInput, work: Work, sourceEdges: Set<string>): { protectedVertices: Set<number>; protectedEdges: Array<[number, number]> } {
  const p = input.protect;
  const vertices = new Set<number>(p.vertices);
  if (p.hull) for (let v = 0; v < input.source.hull; v++) vertices.add(v);
  const edges: Array<[number, number]> = p.edges.map(([a, b]): [number, number] => [a, b]);
  if (p.weightJump !== null) {
    for (const key of [...sourceEdges].sort()) {
      const [a, b] = key.split(',').map(Number);
      if (weightJump(work, a, b) > p.weightJump) edges.push([a, b]);
    }
  }
  for (const [a, b] of edges) {
    vertices.add(a);
    vertices.add(b);
  }
  for (const name of p.regionBoundaries) {
    const region = input.targets.regions.find((r) => r.name === name)!;
    input.source.points.forEach((pt, v) => {
      if (distanceToBoundary(pt, region.polygon) <= ON_BOUNDARY) vertices.add(v);
    });
  }
  return { protectedVertices: vertices, protectedEdges: edges };
}

/** The result, canonical, with its deform keys carried and its own measurement as the report's one candidate. */
function finish(run: Run, effective: EffectiveSettings, sourceCounts: MeshCounts | null, termination: Termination): MeshReductionResult {
  const { input, work } = run;
  const canon = canonicalise(work, run.sourceTurn, run.boneRank);
  const indexMap: Array<number | null> = [];
  for (let v = 0; v < work.nSource; v++) indexMap.push(work.alive[v] ? canon.indexOf.get(v)! : null);
  const inserted = [...canon.indexOf.entries()].filter(([id]) => id >= work.nSource).map(([, r]) => r).sort((a, b) => a - b);
  let deform: { remapped: RemappedDeformKey[]; reevaluated: DeformKeyRef[] };
  try {
    deform = remapDeform(input, canon.mesh, indexMap);
  } catch (err) {
    if (err instanceof Stop) {
      return { mesh: null, report: reportOf(effective, sourceCounts, { id: 'result', counts: null, geometry: null, motion: null, accepted: false }, { reason: err.reason, code: err.code, detail: err.detail }) };
    }
    throw err;
  }
  const measured = measureAgainstTargets(run, canon.mesh, 'result');
  const candidate = measured.candidates[0];
  const changes: ReductionChanges = {
    removedVertices: indexMap.filter((r) => r === null).length,
    insertedVertices: inserted.length,
    sharesDroppedOnGrid: run.tally.sharesDroppedOnGrid,
    sharesPruned: run.tally.sharesPruned,
    deformRemapped: deform.remapped.map((d) => ({ animation: d.animation, attachment: d.attachment, key: d.key, droppedVertices: d.droppedVertices })),
    deformReevaluated: deform.reevaluated.map((d) => ({ animation: d.animation, attachment: d.attachment, key: d.key })),
    linkedMeshes: input.linkedMeshes,
    acceptedAt: [...run.acceptedAt],
  };
  const counts = candidate.counts!;
  const mesh: ReducedMesh = {
    ...canon.mesh,
    edges: meshEdges(canon.mesh.points.length, canon.mesh.triangles, canon.mesh.hull),
    indexMap,
    inserted,
    linkedMeshes: input.linkedMeshes,
    deform,
    counts,
  };
  return { mesh, report: reportOf(effective, sourceCounts, { ...candidate, changes }, termination) };
}

function reportOf(effective: EffectiveSettings, sourceCounts: MeshCounts | null, candidate: CandidateReport, termination: Termination): MeshQualityReport {
  return {
    spec: 'mesh-quality-report/1',
    operation: 'reduce',
    effective,
    poser: null,
    motionRequired: false,
    sourceCounts,
    reference: null,
    candidates: [candidate],
    termination,
  };
}

/** Correction 1: the reduction's inputs echoed with their structure — the measurement's echo, with what a reduction adds. */
function effectiveOf(input: MeshReductionInput, measured: EffectiveSettings, sourceHull: Array<[number, number]>): EffectiveSettings {
  const fit = (f: ArtFitBounds): ArtFitBounds => ({ minCoverage: f.minCoverage, maxOvershoot: f.maxOvershoot, maxUndercut: f.maxUndercut });
  return {
    ...measured,
    sourceBounds: fit(input.sourceBounds),
    targets: input.targets,
    referenceHull: sourceHull,
    budget: { maxCandidates: input.budget.maxCandidates },
    ...(input.stopAfterAccepted === undefined ? {} : { stopAfterAccepted: input.stopAfterAccepted }),
  };
}
