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
 * With `boundaryRuns` (issue #1279, opt-in) each pass first sweeps boundary
 * runs — 2 to `maxVertices` consecutive source-hull vertices of the outline
 * replaced by one chord, as one step held to every row a single removal is —
 * and then the single removals as above (`removeVertices` states the order).
 * Every accepted operation is one `acceptedAt` entry and one unit of
 * `stopAfterAccepted`.
 *
 * With `removalOrder: 'deformation-load'` (issue #1283, opt-in) each pass's
 * single removals are attempted in ascending predicted deformation load, ties
 * by source index, ranked once at the start of those singles (`loadOrder`);
 * every attempt is still a candidate, held exactly as before.
 *
 * ## The triangulation post-pass (issue #1283, opt-in)
 *
 * With `retriangulate: 'delaunay'`, once the reduction ends — a replay's stop
 * included — the kept vertices are re-triangulated by Delaunay edge flips that
 * never touch the outline, a protected edge or an edge a region holds
 * (`delaunayFlips`), and the result is taken whole only when every required
 * row passes on it, else refused whole and named (`retriangulateResult`). It
 * is not a step: no candidate, no `acceptedAt` entry, so a replay and the
 * budget cut at the same step end on the same state and the same pass.
 *
 * ## The amplitude (issue #1287, opt-in)
 *
 * With `motionAmplitude`, the result's own measurement reads it, so the
 * report's `MQ_ALLOCATION_CONTRAST` and `MQ_DEFORM_LOAD` are measured rather
 * than `not-measurable`. No other measurement of the call is handed it — no
 * step is decided by either row, and no report carries the other
 * measurements' rows (`amplitudeOf`) — so the mesh and every step are the
 * call's without it.
 *
 * ## The skinning residual (issue #1295, opt-in)
 *
 * With `targets.skinning` and a number for its `maxResidual`, every removal,
 * boundary run and post-pass whose required rows all pass is also held to
 * `MQ_SKINNING_RESIDUAL` against the call's own source — the original, never a
 * previous step — and refused by name when it is over; the refinement's outcome
 * is held to it before any removal. The value is carried per sample
 * (`SkinningCarry`, `src/meshskinning.ts`), so a step recomputes only the samples
 * of the triangles it changed; the result's own measurement reads the row in
 * full. Left out, nothing here reads it and the call is the one it was.
 *
 * A removal whose deviation floor — the furthest removed source-hull vertex
 * from the candidate's outline, which `MQ_BOUNDARY_DEVIATION` can only exceed —
 * is over the bound is refused without the measurement; its name, when read,
 * is the measurement's (`tryOperation`). No result reads differently.
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
  validateMotionAmplitude,
  type AcceptedOperation,
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
  type MotionAmplitude,
  type RefinementRegion,
  type ReductionChanges,
  type Retriangulation,
  type SourceMesh,
  type StopNotReached,
  type Termination,
} from './meshquality.ts';
import { artRastersOf, stepRastersOf, type ArtRasters, type StepRasters } from './meshrasters.ts';
import {
  skinningContract,
  SkinningCarry,
  validateReductionSkinning,
  skinningResidual,
  type CarryCheck,
  type CarryPlant,
  type CarryReading,
  type CarryTally,
  type SkinningMeasureArgs,
  type SkinningResidualInput,
} from './meshskinning.ts';

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
function validateReduction(input: MeshReductionInput, plant: ReductionPlant | null = null): void {
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
  if ('boundaryRuns' in input && input.boundaryRuns !== undefined) {
    const runs: unknown = input.boundaryRuns;
    if (!isObject(runs) || !Number.isInteger(runs.maxVertices) || (runs.maxVertices as number) < 2) {
      refuse('REDUCE_INPUT_MISSING', `${who}: boundaryRuns is ${JSON.stringify(runs)}; required { maxVertices: a whole number, 2 or more } — the longest run one chord may replace, which has no default — or the field left out (issue #1279: no run is tried)`);
    }
  }
  if ('retriangulate' in input && input.retriangulate !== undefined && input.retriangulate !== 'delaunay') {
    refuse('REDUCE_INPUT_MISSING', `${who}: retriangulate is ${JSON.stringify(input.retriangulate)}; required "delaunay" — the kept vertices re-triangulated by Delaunay edge flips once the reduction ends — or the field left out (issue #1283: the triangles the removals leave)`);
  }
  if ('removalOrder' in input && input.removalOrder !== undefined && input.removalOrder !== 'deformation-load') {
    refuse('REDUCE_INPUT_MISSING', `${who}: removalOrder is ${JSON.stringify(input.removalOrder)}; required "deformation-load" — single removals in ascending predicted deformation load, ties by source index — or the field left out (issue #1283: ascending source index)`);
  }
  // Issue #1287: refused here, before the admission measurement and any step, in the measurement's own words — the
  // admission does not carry the field, and a call whose source is refused never reaches the one measurement that does.
  if (plant !== 'amplitude-unvalidated') validateMotionAmplitude(who, input.motionAmplitude);
  // Issue #1295: refused before any work in the measurement's own words, under `targets.skinning`.
  validateReductionSkinning(who, t.skinning);
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

/**
 * Issue #1307: an undirected edge as one number, `min * n + max`, for ids below `n` — the key every edge set on the
 * removal and boundary-run paths is held in, where `edgeKey` built a string per edge. Exact below 2^53, so for any
 * `n` up to 94,906,265.
 */
function pairKey(a: number, b: number, n: number): number {
  return a < b ? a * n + b : b * n + a;
}

/**
 * Issue #1307: the edges `fresh`'s triangles hold that no triangle of `old` holds, each once, in the order `fresh`
 * holds them (triangle by triangle, corner k to k + 1) — the order condition (b) reads them in and names the first
 * over `weightJump`. Keyed by number over ids below `n`, and only the keys `fresh` holds are looked for in `old`.
 * `addedEdgesByString` is the construction it replaced, kept as the one it is held equal to.
 */
function addedEdges(old: ReadonlyArray<readonly number[]>, fresh: ReadonlyArray<readonly number[]>, n: number): Array<[number, number]> {
  const wanted = new Set<number>();
  for (const t of fresh) for (let k = 0; k < 3; k++) wanted.add(pairKey(t[k], t[(k + 1) % 3], n));
  const held = new Set<number>();
  for (const t of old) {
    for (let k = 0; k < 3; k++) {
      const key = pairKey(t[k], t[(k + 1) % 3], n);
      if (wanted.has(key)) held.add(key);
    }
  }
  const added: Array<[number, number]> = [];
  const seen = new Set<number>();
  for (const t of fresh) {
    for (let k = 0; k < 3; k++) {
      const key = pairKey(t[k], t[(k + 1) % 3], n);
      if (held.has(key) || seen.has(key)) continue;
      seen.add(key);
      added.push([t[k], t[(k + 1) % 3]]);
    }
  }
  return added;
}

/** The string-keyed construction `addedEdges` replaced (issue #1307), run only by the edge-set audit. */
function addedEdgesByString(old: ReadonlyArray<readonly number[]>, fresh: ReadonlyArray<readonly number[]>): Array<[number, number]> {
  const had = new Set<string>();
  for (const t of old) for (let k = 0; k < 3; k++) had.add(edgeKey(t[k], t[(k + 1) % 3]));
  const added: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (const t of fresh) {
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(t[k], t[(k + 1) % 3]);
      if (had.has(key) || seen.has(key)) continue;
      seen.add(key);
      added.push([t[k], t[(k + 1) % 3]]);
    }
  }
  return added;
}

/**
 * Issue #1307's audit, for the `mesh-compare` suite's control: every edge set the removal and boundary-run paths
 * build is built a second time the string-keyed way it was before the issue and compared — the added edges as a list
 * (membership and order, the order condition (b) reads), the triangulation's edge set the protected edges are looked
 * up in as a set (its order is never read). A difference is recorded, not thrown, so the control reads every one.
 * `plant` is the fault applied to the numeric construction before the comparison: one edge dropped from each list
 * and each set, or each added list of two or more reversed. With the audit and no plant, the call's result is the
 * call's without it.
 */
export interface EdgeSetAudit {
  plant?: 'drop-one' | 'reorder';
  /** Added-edge lists compared, and the edges in them. */
  addedLists: number;
  addedEdges: number;
  /** Lists among them whose order a difference could move — two edges or more. */
  orderedLists: number;
  /** Triangulation edge sets compared (one per operation reaching the protected-edge check), and the edges in them. */
  edgeSets: number;
  edgeSetEdges: number;
  /** Each difference found, named; the first few in full. */
  differences: string[];
}

/** One added-edge list read, through the audit when there is one: the plant applied, then the string construction compared. */
function auditedAdded(audit: EdgeSetAudit | null, where: string, added: Array<[number, number]>, byString: () => Array<[number, number]>): Array<[number, number]> {
  if (audit === null) return added;
  let read = added;
  if (audit.plant === 'drop-one' && read.length > 0) read = read.slice(0, -1);
  if (audit.plant === 'reorder' && read.length > 1) read = [...read].reverse();
  const want = byString();
  audit.addedLists++;
  audit.addedEdges += want.length;
  if (want.length > 1) audit.orderedLists++;
  if (JSON.stringify(read) !== JSON.stringify(want)) audit.differences.push(`${where}: added edges ${JSON.stringify(read)} against the string construction's ${JSON.stringify(want)}`);
  return read;
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
  const { ids, walk } = canonicalWalk(work, sourceTurn);
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

/**
 * Step 1 of the canonical order alone: the surviving ids, and the outline walked from its smallest id the way the
 * source's own hull listing turns — `canonicalise`'s hull, and the walk the early deviation floor (issue #1309) reads
 * the current outline as. A `MeshError` when the triangles are not one closed outline.
 */
function canonicalWalk(work: Work, sourceTurn: number): { ids: number[]; walk: number[] } {
  const ids: number[] = [];
  for (let id = 0; id < work.alive.length; id++) if (work.alive[id]) ids.push(id);
  const compact = new Map<number, number>();
  ids.forEach((id, i) => compact.set(id, i));
  const flat: number[] = [];
  for (const tri of work.triangles) for (const id of tri) flat.push(compact.get(id)!);
  const outline = traceOutline(ids.length, flat);
  return { ids, walk: turnedFromSmallest(work, outline.walk.map((i) => ids[i]), sourceTurn) };
}

/**
 * A closed walk of working ids rotated to start at its smallest id and, when its signed area does not turn the way
 * `sourceTurn` does, walked the other way from that id — the one rule `canonicalise` orders its hull by, and the one
 * the early deviation floor turns its predicted outline by (issue #1309), so the two read one polygon.
 */
function turnedFromSmallest(work: Work, loop: readonly number[], sourceTurn: number): number[] {
  const start = loop.indexOf(Math.min(...loop));
  const walk = [...loop.slice(start), ...loop.slice(0, start)];
  const turn = Math.sign(signedArea(walk.map((id) => [work.pos[id][0], work.pos[id][1]])));
  return turn !== sourceTurn ? [walk[0], ...walk.slice(1).reverse()] : walk;
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
  /** Issue #1268, per operation since #1279: every insertion made, removal taken and boundary run taken, in order. */
  acceptedAt: AcceptedOperation[];
  /** The fault planted for a control, or null. */
  plant: ReductionPlant | null;
  /** What a control reads of every removal-phase attempt, or null. */
  observe: AttemptObserver | null;
  tally: Tally;
  keyed: Map<number, { animation: string; ref: AttachmentRef; key: number; time: number }>;
  protectedVertices: Set<number>;
  protectedEdges: Array<[number, number]>;
  /** The source's edges, `pairKey` over `work.nSource` (issue #1307). */
  sourceEdges: Set<number>;
  /** Issue #1307's audit of the edge sets, or null. */
  edgeAudit: EdgeSetAudit | null;
  /** Issue #1309's audit of the early deviation floor against the late one, or null. */
  floorAudit: FloorAudit | null;
  /** The current outline's canonical walk, for the working triangles it was read off (issue #1309); null until read. */
  walk: { triangles: Array<[number, number, number]>; walk: number[] } | null;
  /** The art's rasters, taken once for the call and read by every measurement in it (issue #1240). */
  rasters: ArtRasters;
  /** The step state each removal and insertion is measured through, carried from the last measurement (issue #1246); null measures every step in full. */
  stepRasters: StepRasters | null;
  /** Issue #1295: the residual every step is held to, or null when the call did not declare a bound for it. */
  skinning: SkinningRun | null;
  /** Issue #1295: the controls' faults and inspector, or null. */
  hooks: SkinningHooks | null;
}

/**
 * Issue #1295: the residual a reduction's steps are vetoed by — the bound, the measurement input the result's own row
 * is read with, and either the carried state (`SkinningCarry`), a reading the admission could not measure (every step
 * is then blocked by it), or neither, under the full-recompute control, which measures each candidate whole.
 */
interface SkinningRun {
  bound: number;
  input: SkinningResidualInput;
  carry: SkinningCarry | null;
  unmeasured: CarryReading | null;
  args: Omit<SkinningMeasureArgs, 'candidate'>;
}

/**
 * Issue #1295's faults, for the `mesh-compare` suite's controls: the carried state's own (`CarryPlant`); the residual
 * measured whole on every trial — not a fault, the path the carried state is held equal to and the cost is measured
 * against; the post-pass taken without the residual's recheck; `effective` echoing `targets.skinning: null` for a
 * call that left it out; and a residual refusal read as the end of the search rather than one refusal among others.
 */
export type SkinningVetoPlant = CarryPlant | 'full-recompute' | 'post-pass-unchecked' | 'echo-when-unset' | 'veto-ends-search';

/** One decision the residual took part in, as a control reads it (issue #1295). */
export interface SkinningInspection {
  phase: 'insertion' | 'removal' | 'boundary-run' | 'delaunay';
  /** `candidatesTried` when it was decided. */
  step: number;
  /** Whether the working mesh now holds the trial (an insertion always does). */
  accepted: boolean;
  /** The residual's reading of the trial. */
  reading: CarryReading;
  /** The carried state's work so far; null under the full-recompute control. */
  tally: CarryTally | null;
  memoryBytes: () => number;
  /** The carried state as it now stands held to the full recompute over the working mesh as it now stands; null under the full-recompute control. */
  check: () => CarryCheck | null;
}

/** What a control hands `reduceMeshWith` for issue #1295: a fault, and a callback after every decision the residual took part in. */
export interface SkinningHooks {
  plant?: SkinningVetoPlant;
  inspect?: (inspection: SkinningInspection) => void;
}

/**
 * A measurement of a canonical mesh against the result's full contract. `final` marks the result's own measurement —
 * the one whose rows the report carries, and the only one handed the input's `motionAmplitude` (`amplitudeOf`).
 */
function measureAgainstTargets(run: Run, mesh: SourceMesh, id: string, final = false): MeshQualityReport {
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
    ...amplitudeOf(run.input, run.plant, final),
    ...(final ? skinningOfResult(run) : {}),
  };
  return run.stepRasters === null ? measureMeshQualityWith(measureInput, run.rasters) : measureMeshQualityStep(measureInput, run.stepRasters);
}

/**
 * Issue #1295: what the result's own measurement is handed as `skinning` — the input's envelope and bound against the
 * call's own source, so the report's row is the measurement's, written as `measureMeshQuality` writes it; `null` as
 * `null`; nothing when the field was left out. No other measurement of the call carries it: the steps read the
 * carried state.
 */
function skinningOfResult(run: Run): { skinning?: SkinningResidualInput | null } {
  const declared = run.input.targets.skinning;
  if (declared === undefined) return {};
  if (declared === null) return { skinning: null };
  return { skinning: skinningInputOf(run.input) };
}

function skinningInputOf(input: MeshReductionInput): SkinningResidualInput {
  const declared = input.targets.skinning!;
  return { source: { id: 'source', mesh: input.source }, envelope: declared.envelope, maxResidual: declared.maxResidual, deform: input.deform };
}

/**
 * Issue #1295: the residual of the working mesh as it now stands — a carried trial, left pending until `settleSkinning`;
 * under the full-recompute control, the measurement over the canonical candidate; or the admission's reading when it
 * could not measure.
 */
function skinningTrial(run: Run, canonical: () => SourceMesh): CarryReading {
  const sk = run.skinning!;
  if (sk.unmeasured !== null) return sk.unmeasured;
  if (sk.carry === null) {
    const reading = skinningResidual({ ...sk.args, candidate: canonical() });
    return reading.state === 'measured' ? { state: 'measured', value: reading.value } : { state: reading.state, reason: reading.reason };
  }
  return sk.carry.trial(run.work.triangles);
}

/** Issue #1295: the residual's reading as the name a refusal carries — `rowName`'s form — or null when it is within the bound. */
function skinningVeto(sk: SkinningRun, reading: CarryReading): string | null {
  if (reading.state === 'measured') return reading.value <= sk.bound ? null : `MQ_SKINNING_RESIDUAL: ${reading.value} against <= ${sk.bound}`;
  return `MQ_SKINNING_RESIDUAL: ${reading.state} — ${reading.reason}`;
}

/** Issue #1295: keep or undo a pending trial, then let a control read the decision. The working mesh is already the one decided on. */
function settleSkinning(run: Run, keep: boolean, phase: SkinningInspection['phase'], reading: CarryReading): void {
  const carry = run.skinning?.carry ?? null;
  if (carry !== null && run.skinning!.unmeasured === null) {
    if (keep) carry.commit();
    else carry.rollback();
  }
  const inspect = run.hooks?.inspect;
  if (inspect === undefined) return;
  inspect({
    phase,
    step: run.steps,
    accepted: keep,
    reading,
    tally: carry === null ? null : { ...carry.tally },
    memoryBytes: () => (carry === null ? 0 : carry.memoryBytes()),
    check: () => (carry === null ? null : carry.compareWithFull(canonicalise(run.work, run.sourceTurn, run.boneRank).mesh)),
  });
}

/** Issue #1295: an operation the residual does not decide — a refinement insertion, or a step a plant takes unmeasured — carried so the state follows the working mesh. */
function followSkinning(run: Run, phase: SkinningInspection['phase']): void {
  if (run.skinning === null || run.skinning.carry === null || run.skinning.unmeasured !== null) return;
  settleSkinning(run, true, phase, run.skinning.carry.trial(run.work.triangles));
}

/**
 * Issue #1287: what one measurement of a reduction is handed as `motionAmplitude` — the input's, on the result's own
 * measurement (`final`) only. The admission, every refinement and removal step and the post-pass are measured without
 * it: no row it adds is read by a step (both are `undeclared`, so `firstBlockingRow` never names one) and no report
 * carries those measurements' rows, so carrying it there would buy nothing and cost Δ's own silhouette search at every
 * step (docs/MESH_REDUCTION.md §8, *Stage B — the amplitude on a reduction*, measured). A field left out is passed as
 * left out and `null` as `null`, so the rows' reasons say which.
 */
function amplitudeOf(input: MeshReductionInput, plant: ReductionPlant | null, final: boolean): { motionAmplitude?: MotionAmplitude | null } {
  const amplitude = input.motionAmplitude;
  if (!final && plant !== 'amplitude-every-measurement' && plant !== 'amplitude-gates-steps') return {};
  if (plant === 'amplitude-not-carried') return {};
  if (plant === 'amplitude-invented' && (amplitude === undefined || amplitude === null)) {
    const bones = [...new Set((input.source.weights ?? []).flatMap((v) => v.map((b) => b.bone)))].sort();
    const pairs: Array<{ bones: [string, string]; theta: number }> = [];
    for (let i = 0; i < bones.length; i++) for (let j = i + 1; j < bones.length; j++) pairs.push({ bones: [bones[i], bones[j]], theta: 1 });
    return { motionAmplitude: { tracks: [{ track: 'invented', pairs, epsilon: 1 }], gradation: 0 } };
  }
  if (plant === 'null-read-as-left-out' && amplitude === null) return {};
  return amplitude === undefined ? {} : { motionAmplitude: amplitude };
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
function accept(run: Run, kind: AcceptedOperation['kind'], sourceVertices: number[]): boolean {
  if (kind === 'boundary-run' && run.plant === 'run-split-per-vertex') {
    for (const v of sourceVertices) run.acceptedAt.push({ step: run.steps, kind: 'removal', count: 1, sourceVertices: [v] });
  } else {
    run.acceptedAt.push({ step: run.steps, kind, count: kind === 'insertion' ? 1 : sourceVertices.length, sourceVertices: [...sourceVertices] });
  }
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
 * Every fault a control plants in a reduction (`reduceMeshWith`'s `plant`); `reduceMesh` plants none. Beside the
 * replay's two (issue #1268), issue #1279's: boundary runs tried by a call that did not opt in; a run recorded as one
 * `removal` entry per vertex (the shape before #1279); a run taken without its rows measured; every candidate
 * measured, with no deviation floor (the path the floor is held equal to); and the floor read half a pixel short
 * of the bound, so it refuses steps the rows would take.
 */
export type ReductionPlant =
  | ReplayPlant
  | 'runs-without-opt-in'
  | 'run-split-per-vertex'
  | 'run-skips-rows'
  | 'measure-every-candidate'
  | 'floor-half-a-pixel-short'
  | RetriangulationPlant
  | OrderPlant
  | AmplitudePlant;

/**
 * Issue #1283's faults in the triangulation post-pass: the pass run on a call that did not opt in; the pass skipped
 * when a replay stops the run, so a replay is not the budget cut at the same step; the flip
 * criterion inverted, so the pass flips edges that are locally Delaunay — the flips a declared row can refuse — with
 * its result measured as the pass's is, or taken without the measurement; and the pass flipping edges a region holds.
 */
export type RetriangulationPlant = 'flips-without-opt-in' | 'flips-not-on-replay' | 'flips-against-delaunay' | 'flips-against-delaunay-unmeasured' | 'flips-ignore-regions';

/** Issue #1283's faults in the removal order: the load order used by a call that did not opt in, and the loads ranked descending. */
export type OrderPlant = 'order-without-opt-in' | 'order-descending';

/**
 * Issue #1287's faults in carrying `motionAmplitude`: the amplitude not handed to the result's measurement; an
 * amplitude invented (every pair of the source's bones at θ 1, ε 1, gradation 0) when the field is left out or
 * `null`; `null` passed to the measurement as the field left out; the field not validated by the reduction; a
 * measured allocation row read as blocking a step; and `effective` echoing `null` for a field left out. And one path
 * that is not a fault, held equal to the call: the amplitude handed to every measurement of the call — the admission,
 * each step, the post-pass — which is what the decision to carry it on the result's measurement only is measured
 * against.
 */
export type AmplitudePlant =
  | 'amplitude-not-carried'
  | 'amplitude-invented'
  | 'null-read-as-left-out'
  | 'amplitude-unvalidated'
  | 'amplitude-gates-steps'
  | 'echo-when-unset'
  | 'amplitude-every-measurement';

/** One removal-phase attempt as a control reads it (issue #1279): what was tried, and what refused it or null when taken. */
export interface AttemptRecord {
  step: number;
  kind: 'removal' | 'boundary-run';
  sourceVertices: number[];
  /** Null when taken; else reads the name of what refused it — measuring the attempt in full when the floor decided it. Read it only inside the observer, while the working mesh is the one the attempt was tried on. */
  refusedBy: (() => string) | null;
  /** Whether the deviation floor refused it without a measurement. */
  decidedByFloor: boolean;
  /** The removal pass it was tried in, 1-based (issue #1283). */
  pass: number;
  /** A single removal under `removalOrder: 'deformation-load'`: the load it was ranked by (Infinity when the removal cannot be made); else null (issue #1283). */
  predictedLoad: number | null;
}

/** Called once per removal-phase attempt, after it. */
export type AttemptObserver = (attempt: AttemptRecord) => void;

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
      followSkinning(run, 'insertion');
      if (accept(run, 'insertion', [])) return { kind: 'replayed' };
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
      followSkinning(run, 'insertion');
      exited = true;
      break;
    }
    if (exited) {
      if (accept(run, 'insertion', [])) return { kind: 'replayed' };
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
    followSkinning(run, 'insertion');
    if (accept(run, 'insertion', [])) return { kind: 'replayed' };
  }
}

// ---------------------------------------------------------------------------
// reduction (§1, §6)
// ---------------------------------------------------------------------------

/**
 * One removal tried: the working triangles after it and the edges it added — read through `added()`, built only when
 * read (issue #1307) — or the structural reason it cannot be made.
 */
type Removal = { triangles: Array<[number, number, number]>; added: () => Array<[number, number]> } | { blocked: string };

/**
 * One removal made on `work`'s triangles: the triangles after it — every triangle not touching `v` as it was, the
 * same tuple, then the hole's new ones, `fresh` — or the structural reason it cannot be made.
 */
function removalStep(work: Work, v: number): { triangles: Array<[number, number, number]>; fresh: Array<[number, number, number]> } | { blocked: string } {
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
  return { triangles: [...rest, ...fresh], fresh };
}

/** `removalStep` with the edges it adds: those of the hole's new triangles no triangle before it holds, in their order. */
function removalOf(work: Work, v: number, audit: EdgeSetAudit | null = null): Removal {
  const step = removalStep(work, v);
  if ('blocked' in step) return step;
  const old = work.triangles;
  const n = work.alive.length;
  return { triangles: step.triangles, added: () => auditedAdded(audit, `removing ${v}`, addedEdges(old, step.fresh, n), () => addedEdgesByString(old, step.fresh)) };
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
 * Issue #1283, §8's deformation load of one edge: its length in px times half the L1 difference of its ends' weight
 * vectors (Δshare, the share of the field that changes along it). 0 on an unweighted mesh.
 */
function edgeLoad(work: Work, a: number, b: number): number {
  const dx = work.pos[a][0] - work.pos[b][0];
  const dy = work.pos[a][1] - work.pos[b][1];
  return Math.sqrt(dx * dx + dy * dy) * (weightJump(work, a, b) / 2);
}

/**
 * Issue #1283 (`removalOrder: 'deformation-load'`): the surviving, unprotected source vertices in the order a pass
 * attempts their single removals — ascending by the predicted load of each removal, the largest `edgeLoad` over the
 * edges its re-triangulated hole adds (0 when it adds none), a removal `removalOf` cannot make ranked Infinity; ties
 * by source index. Nothing is measured and nothing is counted as a candidate: one `removalOf` per vertex and one
 * sort. The plant `order-descending` ranks the loads the other way.
 */
function loadOrder(run: Run): { order: number[]; load: Map<number, number> } {
  const { work } = run;
  const load = new Map<number, number>();
  const order: number[] = [];
  for (let v = 0; v < work.nSource; v++) {
    if (!work.alive[v] || run.protectedVertices.has(v)) continue;
    const step = removalOf(work, v, run.edgeAudit);
    let most = 0;
    if ('blocked' in step) most = Infinity;
    else for (const [a, b] of step.added()) most = Math.max(most, edgeLoad(work, a, b));
    load.set(v, most);
    order.push(v);
  }
  const sign = run.plant === 'order-descending' ? -1 : 1;
  order.sort((p, q) => {
    const lp = load.get(p)!;
    const lq = load.get(q)!;
    if (lp !== lq) return lp < lq ? -sign : sign;
    return p - q;
  });
  return { order, load };
}

/**
 * Several boundary vertices removed one after another as one operation (issue #1279): the working triangles after
 * the last and the edges they hold that the triangles before the first did not, in the order they appear — or the
 * structural reason one of the removals cannot be made. The outline loses the run and gains the chord from the
 * vertex before it to the vertex after it; nothing is measured in between.
 */
function runRemovalOf(work: Work, vertices: readonly number[], audit: EdgeSetAudit | null = null): Removal {
  const was = work.triangles;
  // Issue #1307: each removal's own added edges are never read here, so none is built; what the run adds is read off
  // the triangles its removals made. A triangle of `after` that no removal made is the same tuple as one of `was`
  // (`removalStep` keeps every untouched triangle as it was), so every edge it holds is old and it adds nothing.
  const made = new Set<readonly number[]>();
  let after: Array<[number, number, number]>;
  try {
    for (const v of vertices) {
      const step = removalStep(work, v);
      if ('blocked' in step) return step;
      for (const t of step.fresh) made.add(t);
      work.triangles = step.triangles;
    }
    after = work.triangles;
  } finally {
    work.triangles = was;
  }
  const n = work.alive.length;
  const label = `removing ${vertices.join(', ')} as one boundary run`;
  return { triangles: after, added: () => auditedAdded(audit, label, addedEdges(was, after.filter((t) => made.has(t)), n), () => addedEdgesByString(was, after)) };
}

/**
 * Why an attempt was refused: the constraint's name, or — when the deviation floor refused it without a
 * measurement — a thunk that measures the attempt in full and returns the name the measurement gives, so whatever
 * reads it reads what an unfloored run would have written.
 */
type Refusal = string | FloorRefusal;

/**
 * A refusal the deviation floor decided (issue #1279), read since issue #1309 before any structure is built for the
 * attempt. Reading it names the attempt as the full path does — its structural reason when the structure refuses
 * it, else the rows' — in the state it was tried in. `decidedByFloor` is what the observer reads: whether the path
 * before #1309, which read the floor after every structural check, would have been decided by it — so an attempt
 * the structure refuses reads false, as it did. It is computed only when an observer or the floor audit is attached;
 * with neither it reads true and nothing reads it.
 */
interface FloorRefusal {
  (): string;
  decidedByFloor: boolean;
}

function refusalText(refusal: Refusal): string {
  return typeof refusal === 'string' ? refusal : refusal();
}

/**
 * The surviving source vertices on the current outline, walked the way the source's own hull listing turns (the
 * canonical order's hull) — the order a boundary run follows.
 */
function outlineWalk(run: Run): number[] {
  const canon = canonicalise(run.work, run.sourceTurn, run.boneRank);
  return canon.order.slice(0, canon.mesh.hull);
}

/**
 * Remove surviving source vertices in ascending source index, pass after pass,
 * taking a step only when every structural condition and every required row
 * holds after it. Ends when a pass takes no step, or when the budget is spent.
 *
 * With `boundaryRuns` (issue #1279) each pass first sweeps the boundary runs:
 * for each surviving, unprotected source-hull vertex in ascending source index,
 * the runs starting at it and following the outline the way the source hull is
 * listed, longest first — `maxVertices` down to 2, never leaving fewer than three
 * outline vertices, every member a surviving, unprotected source-hull vertex —
 * each one candidate; the first taken ends that start's sweep, and the sweep
 * goes on to the next index over the outline the run left. Then the pass's
 * single removals, exactly as without the field.
 */
function removeVertices(run: Run): PhaseEnd {
  const { work, input } = run;
  const runs = run.plant === 'runs-without-opt-in' ? { maxVertices: 2 } : input.boundaryRuns;
  const byLoad = input.removalOrder === 'deformation-load' || run.plant === 'order-without-opt-in';
  const hull = input.source.hull;
  let lastBlock: { refusal: Refusal; what: string } | null = null;
  const lastName = (): string => (lastBlock === null ? '' : `${refusalText(lastBlock.refusal)}, ${lastBlock.what}`);
  let pass = 0;
  for (;;) {
    let taken = 0;
    let tried = 0;
    pass++;
    if (runs !== undefined) {
      let walk: number[] | null = null;
      for (let s = 0; s < hull; s++) {
        if (!work.alive[s] || run.protectedVertices.has(s)) continue;
        walk ??= outlineWalk(run);
        const at = walk.indexOf(s);
        if (at === -1) continue;
        for (let r = Math.min(runs.maxVertices, walk.length - 3); r >= 2; r--) {
          const members: number[] = [];
          for (let i = 0; i < r; i++) {
            const v = walk[(at + i) % walk.length];
            if (v >= hull || !work.alive[v] || run.protectedVertices.has(v)) break;
            members.push(v);
          }
          if (members.length < r) continue;
          if (run.steps >= input.budget.maxCandidates) return { kind: 'budget' };
          run.steps++;
          tried++;
          const block = tryOperation(run, members, false);
          if (run.observe !== null) run.observe({ step: run.steps, kind: 'boundary-run', sourceVertices: [...members], refusedBy: block === null ? null : () => refusalText(block), decidedByFloor: typeof block === 'function' && block.decidedByFloor, pass, predictedLoad: null });
          if (block === null) {
            taken++;
            walk = null;
            if (accept(run, 'boundary-run', members)) return { kind: 'replayed' };
            break;
          }
          lastBlock = { refusal: block, what: `removing source vertices ${members.join(', ')} as one boundary run` };
        }
      }
    }
    // Issue #1283: with the load order the pass's singles are ranked once, here, over the mesh the runs left; without
    // it they are every source index ascending, exactly as before the field.
    const ranked = byLoad ? loadOrder(run) : null;
    const singles = ranked === null ? null : ranked.order;
    for (let i = 0, end = singles === null ? work.nSource : singles.length; i < end; i++) {
      const v = singles === null ? i : singles[i];
      if (!work.alive[v] || run.protectedVertices.has(v)) continue;
      if (run.steps >= input.budget.maxCandidates) return { kind: 'budget' };
      run.steps++;
      tried++;
      const block = tryOperation(run, [v], false);
      if (run.observe !== null) run.observe({ step: run.steps, kind: 'removal', sourceVertices: [v], refusedBy: block === null ? null : () => refusalText(block), decidedByFloor: typeof block === 'function' && block.decidedByFloor, pass, predictedLoad: ranked === null ? null : ranked.load.get(v)! });
      if (block === null) {
        taken++;
        if (accept(run, 'removal', [v])) return { kind: 'replayed' };
      } else {
        lastBlock = { refusal: block, what: `removing source vertex ${v}` };
        if (run.hooks?.plant === 'veto-ends-search' && typeof block === 'string' && block.startsWith('MQ_SKINNING_RESIDUAL')) return { kind: 'stuck', constraint: lastName() };
      }
    }
    if (taken === 0) {
      // A pass that took nothing left the working mesh as it found it, so a refusal the floor decided is measured
      // now in the state it was decided in.
      const constraint = tried === 0 ? 'protect: every surviving source vertex is protected (protect.hull, protect.vertices, protect.edges, protect.regionBoundaries or a weightJump edge)' : lastName();
      return { kind: 'stuck', constraint };
    }
  }
}

/**
 * Issue #1309: the current outline's canonical walk (`canonicalWalk`), read once per working mesh — the triangles are
 * replaced, never edited in place, whenever the mesh changes, so the array read off is what the cache is keyed by.
 */
function currentWalk(run: Run): number[] {
  if (run.walk === null || run.walk.triangles !== run.work.triangles) run.walk = { triangles: run.work.triangles, walk: canonicalWalk(run.work, run.sourceTurn).walk };
  return run.walk.walk;
}

/**
 * The deviation floor read before any structure is built for the attempt (issue #1309): `deviationFloor` over the
 * outline the candidate would have — the current walk less the removed vertices, turned as `canonicalise` turns it
 * (`turnedFromSmallest`) — rather than over the canonical candidate. Whenever the structure passes, the candidate's
 * outline is that walk, so the two are the same polygon in the same order and the same number; when it does not, the
 * attempt is refused whatever the floor reads, and the reader is shown the structure's reason (`floorRefusal`). 0, the
 * floor of nothing, when no removed vertex is a source-hull vertex (the walk is then not read) or when fewer than three
 * would remain, which no passing structure leaves. `turned` reports whether the walk was walked the other way.
 */
function earlyFloor(run: Run, vertices: readonly number[]): { floor: number; turned: boolean } {
  const hull = run.input.source.hull;
  if (!vertices.some((v) => v < hull)) return { floor: 0, turned: false };
  const rest = currentWalk(run).filter((id) => !vertices.includes(id));
  if (rest.length < 3) return { floor: 0, turned: false };
  const outline = turnedFromSmallest(run.work, rest, run.sourceTurn);
  const turned = outline.length > 2 && outline[1] !== rest[(rest.indexOf(outline[0]) + 1) % rest.length];
  return { floor: floorOver(run, outline.map((id) => run.work.pos[id]), vertices), turned };
}

/**
 * The deviation floor (issue #1279): the furthest any removed source-hull vertex lies from the candidate's outline.
 * `MQ_BOUNDARY_DEVIATION` is the symmetric Hausdorff distance between that outline and the source hull, and its
 * backward half evaluates every source-hull vertex's distance to the outline exactly, so the row's value is at least
 * this — a step whose floor is over the bound fails that row whatever else it measures. The distance is
 * `distanceToSegment` over the candidate's hull edges, the function and polygon the row reads.
 */
function deviationFloor(run: Run, mesh: SourceMesh, vertices: readonly number[]): number {
  return floorOver(run, mesh.points.slice(0, mesh.hull), vertices);
}

/** `deviationFloor` over an outline given as its points in walk order — the one loop both floors read. */
function floorOver(run: Run, poly: readonly Pt[], vertices: readonly number[]): number {
  let floor = 0;
  for (const v of vertices) {
    if (v >= run.input.source.hull) continue;
    const p = run.work.pos[v];
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) d = Math.min(d, distanceToSegment(p, poly[i], poly[(i + 1) % poly.length]));
    floor = Math.max(floor, d);
  }
  return floor;
}

/**
 * The margin the floor has to clear the bound by before it refuses without measuring: ten units of the `r6` grid
 * the row's value is put on, far above any difference the order the row walks an edge in can make to a distance.
 */
const FLOOR_MARGIN = 1e-5;

/**
 * Issue #1307's audit of the triangulation's edge set (`EdgeSetAudit`): the plant applied to `edges` in place — so
 * the decision reads the planted set — then the set held to the string-keyed one, member for member.
 */
function auditEdgeSet(audit: EdgeSetAudit, edges: Set<number>, triangles: ReadonlyArray<readonly number[]>, n: number, vertices: readonly number[]): void {
  if (audit.plant === 'drop-one') {
    const first = edges.values().next();
    if (first.done !== true) edges.delete(first.value);
  }
  const want = new Set<string>();
  for (const t of triangles) for (let k = 0; k < 3; k++) want.add(edgeKey(t[k], t[(k + 1) % 3]));
  audit.edgeSets++;
  audit.edgeSetEdges += want.size;
  const missing = [...want].filter((key) => {
    const [a, b] = key.split(',').map(Number);
    return !edges.has(pairKey(a, b, n));
  });
  if (missing.length > 0 || edges.size !== want.size) {
    audit.differences.push(`removing ${vertices.join(', ')}: the triangulation's edge set holds ${edges.size} edge(s) against the string construction's ${want.size}${missing.length > 0 ? `, missing ${missing.slice(0, 3).join(' ')}` : ''}`);
  }
}

/**
 * Issue #1309's audit, for the `mesh-compare` suite's control and the population run: on every attempt the floor is
 * read on, the path before the issue is run beside the early floor — every structural check, then the floor read off
 * the canonical candidate, decided at `FLOOR_MARGIN` — and compared. Where the structure passes, the two floors are
 * held equal bit for bit and their decisions equal; where the early floor refuses and the structure would have refused
 * first, the name a reader of the refusal is shown is held to the structure's, and the observer's `decidedByFloor` to
 * false. A difference is recorded, not thrown. `plant` is the fault applied to the early refusal: its name read off
 * the floor (`MQ_BOUNDARY_DEVIATION`), never reaching the structural check that would have refused first. With the
 * audit and no plant, the call's result is the call's without it.
 */
export interface FloorAudit {
  plant?: 'refusal-named-by-the-floor';
  /** Attempts the floor was read on. */
  attempts: number;
  /** Among them, those whose structure passes — where the early floor and the late one are compared. */
  compared: number;
  /** Among those, the ones whose predicted outline `canonicalise` walks the other way from the current walk. */
  turned: number;
  /** Attempts the early floor refused, and among them those whose structure refuses them first. */
  refused: number;
  refusedStructurally: number;
  /** Each difference found, named. */
  differences: string[];
}

/**
 * The structure of one operation, as every attempt builds it: the removal or run made (or its structural reason),
 * condition (b) over the edges it adds, the working mesh set to it, the protected edges looked up, and the canonical
 * candidate. Null-free: either the reason the structure refuses the operation — the working mesh as it was — or the
 * canonical candidate with the working mesh holding it and the `undo` that restores it.
 */
function structureOf(run: Run, vertices: readonly number[]): string | { canon: Canonical; undo: () => void } {
  const { work, input } = run;
  const step = vertices.length === 1 ? removalOf(work, vertices[0], run.edgeAudit) : runRemovalOf(work, vertices, run.edgeAudit);
  if ('blocked' in step) return step.blocked;
  const jump = input.protect.weightJump;
  if (jump !== null) {
    for (const [a, b] of step.added()) {
      if (a < work.nSource && b < work.nSource && run.sourceEdges.has(pairKey(a, b, work.nSource))) continue;
      const d = weightJump(work, a, b);
      if (d > jump) return `weightJump (b): the new edge ${a}–${b} joins weight vectors ${r6(d)} apart, over ${jump}`;
    }
  }
  const was = { triangles: work.triangles };
  work.triangles = step.triangles;
  for (const v of vertices) work.alive[v] = false;
  const undo = (): void => {
    work.triangles = was.triangles;
    for (const v of vertices) work.alive[v] = true;
  };
  // Issue #1307: the triangulation's edge set is built only when a protected edge is looked up in it, keyed by number.
  if (run.protectedEdges.length > 0) {
    const n = work.alive.length;
    const edges = new Set<number>();
    for (const t of work.triangles) for (let k = 0; k < 3; k++) edges.add(pairKey(t[k], t[(k + 1) % 3], n));
    if (run.edgeAudit !== null) auditEdgeSet(run.edgeAudit, edges, work.triangles, n, vertices);
    for (const [a, b] of run.protectedEdges) {
      if (!edges.has(pairKey(a, b, n))) {
        undo();
        return `protect (a): the protected source edge ${a}–${b} is no longer an edge`;
      }
    }
  }
  try {
    return { canon: canonicalise(work, run.sourceTurn, run.boneRank), undo };
  } catch (err) {
    if (!(err instanceof MeshError)) throw err;
    undo();
    return `outline: ${err.message}`;
  }
}

/**
 * The refusal the early floor makes (issue #1309), through #1279's thunk: read, it measures the attempt in full in the
 * state it was tried in and returns that path's name — the structure's reason when the structure refuses it, else the
 * rows'. `late`, when an observer or the floor audit asked for it, is what the structure and the floor read off the
 * canonical candidate gave: it decides `decidedByFloor` as the path before the issue decided it, and — with an
 * observer and no floor audit — its structural reason is the name returned, built once rather than twice (the edge
 * audit counts every list it builds). Under the floor audit the thunk always runs the full path, which is what the
 * audit holds equal to the structure's reason.
 */
function floorRefusal(run: Run, vertices: readonly number[], floor: number, limit: number, late: { structural: string } | { floor: number } | null): FloorRefusal {
  const members = [...vertices];
  const said = late !== null && 'structural' in late && run.floorAudit === null ? late.structural : null;
  const refusal = (() => {
    if (run.floorAudit?.plant === 'refusal-named-by-the-floor') return `MQ_BOUNDARY_DEVIATION: the deviation floor ${r6(floor)} is over ${run.input.targets.maxBoundaryDeviation}`;
    if (said !== null) return said;
    const measured = tryOperation(run, members, true);
    if (measured === null) {
      // Unreachable while the floor is a floor: the step was refused on a bound its own rows then pass. Loud,
      // because the run already went on as if it had been refused.
      throw new Error(`the deviation floor refused removing ${members.join(', ')}, which the rows accept`);
    }
    return refusalText(measured);
  }) as FloorRefusal;
  refusal.decidedByFloor = late === null || ('floor' in late && late.floor > limit);
  return refusal;
}

/** The path before issue #1309 for one attempt, read beside the early floor: the structure's reason, or the floor read off the canonical candidate. The working mesh is left as it was. */
function lateOf(run: Run, vertices: readonly number[]): { structural: string } | { floor: number } {
  const built = structureOf(run, vertices);
  if (typeof built === 'string') return { structural: built };
  const floor = deviationFloor(run, built.canon.mesh, vertices);
  built.undo();
  return { floor };
}

/** The floor audit's comparison where the structure passes: the two floors bit for bit, and the decision at `FLOOR_MARGIN`. */
function auditFloors(audit: FloorAudit, run: Run, vertices: readonly number[], early: { floor: number; turned: boolean }, late: number, refusedEarly: boolean): void {
  audit.compared++;
  if (early.turned) audit.turned++;
  const lateRefuses = late > run.input.targets.maxBoundaryDeviation + FLOOR_MARGIN;
  if (!Object.is(early.floor, late)) audit.differences.push(`removing ${vertices.join(', ')}: the early floor reads ${early.floor} and the floor off the canonical candidate ${late}`);
  else if (refusedEarly !== lateRefuses) audit.differences.push(`removing ${vertices.join(', ')}: the early floor ${refusedEarly ? 'refused' : 'passed'} at ${early.floor}, which the floor off the canonical candidate ${lateRefuses ? 'refuses' : 'passes'} at the bound ${run.input.targets.maxBoundaryDeviation} + FLOOR_MARGIN`);
}

/**
 * One operation — a single removal, or a boundary run of two or more — tried: null when it was taken (the working
 * mesh then holds it), else what refused it (the working mesh as it was). `full` measures every candidate that
 * reaches the rows; otherwise a candidate whose deviation floor is over the bound by `FLOOR_MARGIN` is refused
 * without the measurement, by a thunk that measures it when its name is read. Since issue #1309 the floor is read
 * before the structure is built (`earlyFloor`); an attempt it refuses is not built at all unless an observer or the
 * floor audit asks what the path before would have decided.
 */
function tryOperation(run: Run, vertices: readonly number[], full: boolean): Refusal | null {
  const { input } = run;
  const floored = !full && run.plant !== 'measure-every-candidate' && !(vertices.length > 1 && run.plant === 'run-skips-rows');
  const audit = run.floorAudit;
  let early: { floor: number; turned: boolean } | null = null;
  if (floored) {
    const limit = input.targets.maxBoundaryDeviation + (run.plant === 'floor-half-a-pixel-short' ? -0.5 : FLOOR_MARGIN);
    early = earlyFloor(run, vertices);
    if (audit !== null) audit.attempts++;
    if (early.floor > limit) {
      const late = run.observe !== null || audit !== null ? lateOf(run, vertices) : null;
      const refusal = floorRefusal(run, vertices, early.floor, limit, late);
      if (audit !== null && late !== null) {
        audit.refused++;
        if ('structural' in late) {
          audit.refusedStructurally++;
          const said = refusal();
          if (said !== late.structural) audit.differences.push(`removing ${vertices.join(', ')}: the early refusal reads "${said.slice(0, 80)}" where the structure refuses first with "${late.structural.slice(0, 80)}"`);
          if (refusal.decidedByFloor) audit.differences.push(`removing ${vertices.join(', ')}: refused by the structure first, yet the observer would read decidedByFloor`);
        } else {
          auditFloors(audit, run, vertices, early, late.floor, true);
        }
      }
      return refusal;
    }
  }
  const built = structureOf(run, vertices);
  if (typeof built === 'string') return built;
  const { canon, undo } = built;
  if (audit !== null && early !== null) auditFloors(audit, run, vertices, early, deviationFloor(run, canon.mesh, vertices), false);
  const phase: SkinningInspection['phase'] = vertices.length > 1 ? 'boundary-run' : 'removal';
  if (vertices.length > 1 && run.plant === 'run-skips-rows') {
    followSkinning(run, phase);
    return null;
  }
  const measured = measureAgainstTargets(run, canon.mesh, 'candidate');
  const blocking =
    firstBlockingRow(measured, run.input.targets.artFit) ??
    (run.plant === 'amplitude-gates-steps' ? ((measured.candidates[0]?.geometry?.rows ?? []).find((r) => (r.code === 'MQ_DEFORM_LOAD' || r.code === 'MQ_ALLOCATION_CONTRAST') && r.state === 'undeclared') ?? null) : null);
  if (blocking !== null) {
    undo();
    return rowName(blocking);
  }
  // Issue #1295: every required row passes, so the candidate has no reversed or degenerate triangle; now the residual
  // against the original source. A veto is a refusal like any other: the mesh and the carried state as they were.
  if (run.skinning !== null) {
    const reading = skinningTrial(run, () => canon.mesh);
    const veto = skinningVeto(run.skinning, reading);
    if (veto !== null) {
      undo();
      settleSkinning(run, false, phase, reading);
      return veto;
    }
    settleSkinning(run, true, phase, reading);
  }
  return null;
}

// ---------------------------------------------------------------------------
// the triangulation post-pass (issue #1283)
// ---------------------------------------------------------------------------

/**
 * How far past π the two angles opposite an edge have to sum before the edge is flipped, read as the sine of their
 * sum: the flip is made when that sine is below `-FLIP_MARGIN`. The flip turns the sum into 2π minus it, so its sine
 * changes sign and the new edge is never flipped back in the same or a later sweep; cocircular quads (sine within the
 * margin) are left as they are.
 */
const FLIP_MARGIN = 1e-9;

/** Twice the signed area of p, q, r in drawing px (y down), the orientation test the flip reads. */
function orient(p: Pt, q: Pt, r: Pt): number {
  return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
}

/**
 * sin(α + β) for the angles α at `c` and β at `d` opposite the edge a–b — negative exactly when α + β > π, the edge
 * is then not locally Delaunay. From cross and dot products and square roots only, so it reads the same wherever IEEE
 * arithmetic does (no libm call).
 */
function oppositeAngleSine(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const angle = (o: Pt): { sin: number; cos: number } => {
    const ux = a[0] - o[0];
    const uy = a[1] - o[1];
    const vx = b[0] - o[0];
    const vy = b[1] - o[1];
    const lengths = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    return { sin: Math.abs(ux * vy - uy * vx) / lengths, cos: (ux * vx + uy * vy) / lengths };
  };
  const p = angle(c);
  const q = angle(d);
  return p.sin * q.cos + p.cos * q.sin;
}

/** The sentence every report of a call with `retriangulate` carries (§8 Q4, [agreed, rig-parts#126]). */
const MONOTONICITY_NOT_PROMISED =
  'not promised: the pass re-triangulates whatever mesh the removals leave, so along acceptedAt a step whose result passes a comparison may be followed by one that fails and then by one that passes again; a bisection over acceptedAt finds a passing step, not necessarily the last (§8 Q4, agreed on rig-parts#126)';

type FlipResult = { triangles: Array<[number, number, number]>; flips: number; sweeps: number } | { bound: string; flips: number; sweeps: number };

/**
 * Lawson's edge flips over the working mesh's interior edges, toward the Delaunay triangulation of the same vertices
 * constrained by what the mesh must keep. A sweep visits every interior edge (two triangles) in ascending (smaller id,
 * larger id), skipping an edge whose triangles a flip of this sweep already replaced, and flips it when:
 *
 * - the quad its two triangles form is strictly convex, so both new triangles keep the winding;
 * - the angles opposite it sum past π by `FLIP_MARGIN` (`oppositeAngleSine`) — the Delaunay criterion;
 * - it is not a protected edge (`protect.edges`, and every source edge over `protect.weightJump`);
 * - no declared region holds it, and none would hold the new edge (`edgeIsHeldByRegion`), so every region row reads
 *   the same edges and lengths after the pass as before it;
 * - the new edge is a source edge, or its ends' weight vectors are within `protect.weightJump` (condition (b), as a
 *   removal's new edges are held).
 *
 * The outline is never touched (an outline edge has one triangle) and no vertex is added, moved or removed. Sweeps
 * continue until one flips nothing. **Bounded work:** every flip made is one the criterion allows, which lowers the
 * triangulation's lifting onto the paraboloid strictly, so an edge flipped away never comes back and a pass makes at
 * most n(n − 1)/2 flips over n vertices; a sweep that continues has flipped at least one, so there are at most one more
 * sweeps than flips, and each visits at most 3n interior edges. The bound is also held by count: reaching it ends the
 * pass with the bound named rather than the triangles, which the criterion makes unreachable.
 */
function delaunayFlips(run: Run, plant: ReductionPlant | null): FlipResult {
  const { work, input } = run;
  const P = work.pos;
  const tris = work.triangles.map((t): [number, number, number] => [t[0], t[1], t[2]]);
  const alive = work.alive.reduce((n, a) => n + (a ? 1 : 0), 0);
  const maxFlips = (alive * (alive - 1)) / 2;
  const guarded = new Set(run.protectedEdges.map(([a, b]) => edgeKey(a, b)));
  const jump = input.protect.weightJump;
  const regions = plant === 'flips-ignore-regions' ? [] : input.targets.regions;
  const heldCache = new Map<string, boolean>();
  const held = (a: number, b: number): boolean => {
    if (regions.length === 0) return false;
    const key = edgeKey(a, b);
    let hit = heldCache.get(key);
    if (hit === undefined) {
      hit = regions.some((r) => edgeIsHeldByRegion(P[a], P[b], r));
      heldCache.set(key, hit);
    }
    return hit;
  };
  const against = plant === 'flips-against-delaunay' || plant === 'flips-against-delaunay-unmeasured';
  let flips = 0;
  let sweeps = 0;
  for (;;) {
    sweeps++;
    const sides = new Map<string, number[]>();
    tris.forEach((t, i) => {
      for (let k = 0; k < 3; k++) {
        const key = edgeKey(t[k], t[(k + 1) % 3]);
        const list = sides.get(key);
        if (list === undefined) sides.set(key, [i]);
        else list.push(i);
      }
    });
    const interior: Array<[number, number]> = [];
    for (const [key, list] of sides) {
      if (list.length !== 2) continue;
      const [a, b] = key.split(',').map(Number);
      interior.push([a, b]);
    }
    interior.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const replaced = new Set<number>();
    let flipped = 0;
    for (const [u, w] of interior) {
      const [i, j] = sides.get(edgeKey(u, w))!;
      if (replaced.has(i) || replaced.has(j)) continue;
      if (guarded.has(edgeKey(u, w))) continue;
      // Rotate so the edge is t1's a → b in its own winding; t2 then holds b → a.
      const t1 = tris[i];
      const k1 = t1.findIndex((x, k) => (x === u && t1[(k + 1) % 3] === w) || (x === w && t1[(k + 1) % 3] === u));
      const a = t1[k1];
      const b = t1[(k1 + 1) % 3];
      const c = t1[(k1 + 2) % 3];
      const t2 = tris[j];
      const k2 = t2.findIndex((x, k) => x === b && t2[(k + 1) % 3] === a);
      if (k2 === -1) continue;
      const d = t2[(k2 + 2) % 3];
      if (c === d) continue;
      const turn = Math.sign(orient(P[a], P[b], P[c]));
      const o1 = orient(P[a], P[d], P[c]);
      const o2 = orient(P[d], P[b], P[c]);
      if (Math.sign(o1) !== turn || Math.sign(o2) !== turn || Math.abs(o1) < 1e-9 || Math.abs(o2) < 1e-9) continue;
      const sine = oppositeAngleSine(P[a], P[b], P[c], P[d]);
      if (against ? !(sine > FLIP_MARGIN) : !(sine < -FLIP_MARGIN)) continue;
      if (held(a, b) || held(c, d)) continue;
      if (jump !== null && !(c < work.nSource && d < work.nSource && run.sourceEdges.has(pairKey(c, d, work.nSource))) && weightJump(work, c, d) > jump) continue;
      if (flips >= maxFlips) return { bound: `the flip bound n(n - 1)/2 = ${maxFlips} over ${alive} vertices was reached`, flips, sweeps };
      tris[i] = [a, d, c];
      tris[j] = [d, b, c];
      replaced.add(i);
      replaced.add(j);
      flips++;
      flipped++;
    }
    // The inverted criterion is a plant: one sweep, since flipping a Delaunay edge makes a non-Delaunay one it would
    // flip straight back.
    if (flipped === 0 || against) return { triangles: tris, flips, sweeps };
  }
}

/**
 * Issue #1283: the post-pass on the working mesh the reduction ended on, taken whole or refused whole — the working
 * triangles are the pass's only when every required row passes on its result (the measurement reads the canonical
 * mesh exactly as the result's own does). Undefined when the call did not opt in. One flip pass and at most one
 * measurement, never counted as a candidate: a replay and the budget cut at the same step end on the same state and
 * both are followed by it.
 *
 * Why whole rather than flip by flip: the rows a flip can move are the region rows (held edges, which the pass never
 * flips nor makes) and the minimum angle, which a Delaunay flip only raises; the art rows and the boundary deviation
 * read the outline and the union of the triangles, which no flip changes. A measurement per flip would buy nothing a
 * row can see and cost one measurement per flip — up to n(n − 1)/2 — where the whole pass costs one.
 */
function retriangulateResult(run: Run, termination: Termination): Retriangulation | undefined {
  const plant = run.plant;
  if (run.input.retriangulate === undefined && plant !== 'flips-without-opt-in') return undefined;
  if (plant === 'flips-not-on-replay' && termination.reason === 'replayed-to-accepted-step') return undefined;
  const result = delaunayFlips(run, plant);
  const out = (taken: boolean, refusedBy: string | null): Retriangulation => ({ method: 'delaunay', taken, flips: result.flips, sweeps: result.sweeps, refusedBy, monotonicity: MONOTONICITY_NOT_PROMISED });
  if (!('triangles' in result)) return out(false, result.bound);
  if (result.flips === 0) return out(true, null);
  const was = run.work.triangles;
  run.work.triangles = result.triangles;
  if (plant === 'flips-against-delaunay-unmeasured') {
    followSkinning(run, 'delaunay');
    return out(true, null);
  }
  const canon = canonicalise(run.work, run.sourceTurn, run.boneRank);
  const blocking = firstBlockingRow(measureAgainstTargets(run, canon.mesh, 'retriangulated'), run.input.targets.artFit);
  if (blocking !== null) {
    run.work.triangles = was;
    return out(false, rowName(blocking));
  }
  // Issue #1295: the returned triangulation is held to the residual as every step was — it is not in acceptedAt, and
  // that is no reason for it to escape the bound. Refused whole, naming the row.
  if (run.skinning !== null) {
    const reading = skinningTrial(run, () => canon.mesh);
    const veto = run.hooks?.plant === 'post-pass-unchecked' ? null : skinningVeto(run.skinning, reading);
    if (veto !== null) {
      run.work.triangles = was;
      settleSkinning(run, false, 'delaunay', reading);
      return out(false, veto);
    }
    settleSkinning(run, true, 'delaunay', reading);
  }
  return out(true, null);
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
export function reduceMeshWith(
  input: MeshReductionInput,
  rasters: ArtRasters,
  steps: StepRasters | null = stepRastersOf(rasters),
  plant: ReductionPlant | null = null,
  observe: AttemptObserver | null = null,
  skinning: SkinningHooks | null = null,
  edgeAudit: EdgeSetAudit | null = null,
  floorAudit: FloorAudit | null = null,
): MeshReductionResult {
  validateReduction(input, plant);
  if (steps !== null && steps.rasters !== rasters) {
    refuse('REDUCE_ART_RASTERS_MISMATCH', `attachment ${nameOf(input.attachment)}: the step rasters were made over another rasters object; required step rasters made over the rasters passed beside them (stepRastersOf(rasters))`);
  }
  return reduceValidated(input, rasters, steps, plant, observe, skinning, edgeAudit, floorAudit);
}

/**
 * The operation, over an input `validateReduction` accepted; the art's rasters are computed at most once, in
 * `rasters`, and every refinement and removal step is measured through `steps` when it is given (issue #1246).
 */
function reduceValidated(
  input: MeshReductionInput,
  rasters: ArtRasters,
  steps: StepRasters | null,
  plant: ReductionPlant | null = null,
  observe: AttemptObserver | null = null,
  hooks: SkinningHooks | null = null,
  edgeAudit: EdgeSetAudit | null = null,
  floorAudit: FloorAudit | null = null,
): MeshReductionResult {
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
    ...amplitudeOf(input, plant, false),
  };
  const admit = steps === null ? measureMeshQualityWith(admitInput, rasters) : measureMeshQualityStep(admitInput, steps);
  const effective = effectiveOf(input, admit.effective, sourceHull, plant, hooks);
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
    const skinningAdmitted = admitSkinning(input, rasters);

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
    // The string-keyed set is read once, by `protectionOf`, whose weightJump edges follow its sorted keys; every step
    // reads the numeric one (issue #1307).
    const sourceEdgeNames = new Set<string>();
    for (const t of work.triangles) for (let k = 0; k < 3; k++) sourceEdgeNames.add(edgeKey(t[k], t[(k + 1) % 3]));
    const sourceEdges = new Set<number>();
    for (const t of work.triangles) for (let k = 0; k < 3; k++) sourceEdges.add(pairKey(t[k], t[(k + 1) % 3], work.nSource));
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
      observe,
      tally: { sharesDroppedOnGrid: 0, sharesPruned: 0 },
      keyed: keyedSourceVertices(input),
      ...protectionOf(input, work, sourceEdgeNames),
      sourceEdges,
      edgeAudit,
      floorAudit,
      walk: null,
      rasters,
      stepRasters: steps,
      skinning: null,
      hooks,
    };
    run.skinning = skinningRunOf(run, skinningAdmitted);

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
    const startRow = firstBlockingRow(measureAgainstTargets(run, startCanon.mesh, 'start'), input.targets.artFit);
    // Issue #1295: the refined source — the refinement's outcome — held to the residual before any removal; with no
    // region it is the source, which reads 0 against itself.
    const startBlock = startRow !== null ? rowName(startRow) : run.skinning === null ? null : skinningStart(run, () => startCanon.mesh);
    let termination: Termination;
    if (startBlock !== null) {
      const constraint = refined.kind === 'stuck' ? refined.constraint : startBlock;
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

/**
 * Issue #1295: the residual's admission — what the source itself reads under the declared envelope, before any step.
 * Null when no step reads a residual (the field left out, `null`, or a bound declared absent). A source the
 * measurement refuses — a deform key that moves vertices outside skinning, a bone the envelope does not declare, an
 * envelope bone the source does not bind, shares that do not close, a vertex off its UV, one mesh weighted and not the
 * other — is refused here, `invalid-input` with the measurement's code and words; what it cannot measure (both meshes
 * unweighted, fewer art samples than the floor) is kept as the reading every step is then blocked by.
 */
function admitSkinning(input: MeshReductionInput, rasters: ArtRasters): { input: SkinningResidualInput; args: Omit<SkinningMeasureArgs, 'candidate'>; unmeasured: CarryReading | null } | null {
  const declared = input.targets.skinning;
  if (declared === undefined || declared === null || declared.maxResidual === null) return null;
  const skinning = skinningInputOf(input);
  const args: Omit<SkinningMeasureArgs, 'candidate'> = {
    attachment: input.attachment,
    frame: input.art.frame,
    artBits: rasters.artBits(),
    maskWidth: input.art.mask.width,
    maskHeight: input.art.mask.height,
    minArtSamples: input.minArtSamples,
    threshold: input.art.threshold,
    skinning,
  };
  const contract = skinningContract({ ...args, candidate: input.source });
  if (!('state' in contract) || contract.state === 'measured') return { input: skinning, args, unmeasured: null };
  if (contract.state === 'refused') {
    const code = contract.reason.slice(0, contract.reason.indexOf(':'));
    throw new Stop('invalid-input', code, contract.reason.slice(code.length + 2));
  }
  return { input: skinning, args, unmeasured: { state: 'not-measurable', reason: contract.reason } };
}

/** Issue #1295: the run's residual — the carried state over the working mesh as the reduction starts, or what stands in for it. */
function skinningRunOf(run: Run, admitted: ReturnType<typeof admitSkinning>): SkinningRun | null {
  if (admitted === null) return null;
  const bound = admitted.input.maxResidual!;
  const base = { bound, input: admitted.input, args: admitted.args };
  if (admitted.unmeasured !== null) return { ...base, carry: null, unmeasured: admitted.unmeasured };
  const plant = run.hooks?.plant;
  if (plant === 'full-recompute') {
    const reading = skinningResidual({ ...admitted.args, candidate: run.input.source });
    if (reading.state === 'refused') {
      const code = reading.reason.slice(0, reading.reason.indexOf(':'));
      throw new Stop('invalid-input', code, reading.reason.slice(code.length + 2));
    }
    return { ...base, carry: null, unmeasured: null };
  }
  const carryPlant: CarryPlant | null = plant === 'stale-carrier' || plant === 'lost-maximum' || plant === 'no-rollback' || plant === 'previous-candidate' ? plant : null;
  try {
    const carry = new SkinningCarry(
      run.who,
      { pos: run.work.pos, uv: run.work.uv, weights: run.work.weights! },
      run.work.nSource,
      run.work.triangles,
      run.input.source,
      admitted.input.envelope,
      admitted.args.artBits,
      admitted.args.maskWidth,
      admitted.args.maskHeight,
      run.input.art.frame,
      carryPlant,
    );
    return { ...base, carry, unmeasured: null };
  } catch (err) {
    if (err instanceof MeshReductionError && err.code === 'COMPARE_UV_CARRIER_NOT_UNIQUE') throw new Stop('invalid-input', 'SKINNING_UV_CARRIER_NOT_UNIQUE', err.message);
    throw err;
  }
}

/** Issue #1295: the residual's verdict on the mesh the removals start from — the refinement's outcome — as a refusal name, or null. */
function skinningStart(run: Run, canonical: () => SourceMesh): string | null {
  const sk = run.skinning!;
  let reading: CarryReading;
  if (sk.unmeasured !== null) reading = sk.unmeasured;
  else if (sk.carry !== null) reading = sk.carry.reading();
  else {
    const r = skinningResidual({ ...sk.args, candidate: canonical() });
    reading = r.state === 'measured' ? { state: 'measured', value: r.value } : { state: r.state, reason: r.reason };
  }
  return skinningVeto(sk, reading);
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
  const retriangulation = retriangulateResult(run, termination);
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
  const measured = measureAgainstTargets(run, canon.mesh, 'result', true);
  const candidate = measured.candidates[0];
  const changes: ReductionChanges = {
    removedVertices: indexMap.filter((r) => r === null).length,
    insertedVertices: inserted.length,
    sharesDroppedOnGrid: run.tally.sharesDroppedOnGrid,
    sharesPruned: run.tally.sharesPruned,
    deformRemapped: deform.remapped.map((d) => ({ animation: d.animation, attachment: d.attachment, key: d.key, droppedVertices: d.droppedVertices })),
    deformReevaluated: deform.reevaluated.map((d) => ({ animation: d.animation, attachment: d.attachment, key: d.key })),
    linkedMeshes: input.linkedMeshes,
    acceptedAt: run.acceptedAt.map((a) => ({ step: a.step, kind: a.kind, count: a.count, sourceVertices: [...a.sourceVertices] })),
    ...(retriangulation === undefined ? {} : { retriangulation }),
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
function effectiveOf(input: MeshReductionInput, measured: EffectiveSettings, sourceHull: Array<[number, number]>, plant: ReductionPlant | null, hooks: SkinningHooks | null = null): EffectiveSettings {
  const amplitude = plant === 'echo-when-unset' && input.motionAmplitude === undefined ? null : input.motionAmplitude;
  const fit = (f: ArtFitBounds): ArtFitBounds => ({ minCoverage: f.minCoverage, maxOvershoot: f.maxOvershoot, maxUndercut: f.maxUndercut });
  return {
    ...measured,
    sourceBounds: fit(input.sourceBounds),
    targets: hooks?.plant === 'echo-when-unset' && input.targets.skinning === undefined ? { ...input.targets, skinning: null } : input.targets,
    referenceHull: sourceHull,
    budget: { maxCandidates: input.budget.maxCandidates },
    ...(input.stopAfterAccepted === undefined ? {} : { stopAfterAccepted: input.stopAfterAccepted }),
    ...(input.boundaryRuns === undefined ? {} : { boundaryRuns: { maxVertices: input.boundaryRuns.maxVertices } }),
    ...(amplitude === undefined ? {} : { motionAmplitude: amplitude }),
    ...(input.retriangulate === undefined ? {} : { retriangulate: input.retriangulate }),
    ...(input.removalOrder === undefined ? {} : { removalOrder: input.removalOrder }),
  };
}
