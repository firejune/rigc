/**
 * Mesh quality, measured without posing anything — the geometry half of the
 * contract in docs/MESH_REDUCTION.md (issue #1221, stage B1: issue #1224).
 *
 * One operation lives here today, `measureMeshQuality`: a mesh, the art one
 * attachment draws, and the bounds the caller declared, measured into one
 * `mesh-quality-report/1` document (`writeMeshQualityReport` writes its text).
 * Every type the contract declares is declared here too, including the ones
 * only the reduction (`reduceMesh`, stage B2, in `src/meshreduce.ts`) and the
 * motion comparison (stage C) fill, so that those stages build on one set of
 * types rather than restating them.
 *
 * ## What it is for
 *
 * An agent that cannot see a mesh cannot tell a mesh that drops art from one
 * that does not, a spanned hole from overshoot, or a sliver from a fold. Each of
 * those is a row here with its value, where the worst value was taken, the bound
 * the caller declared, and a state that keeps "measured and failed" apart from
 * "nothing was declared" and from "could not be measured". The five states are
 * §2's; nothing folds one into another, and an informational row never counts
 * towards a pass.
 *
 * ## What it never does
 *
 * - **Invent a bound.** A row whose bound the caller did not declare is
 *   `undeclared`: measured, reported, and out of the pass count. The two rows
 *   with a bound of their own — `MQ_ORIENTATION` and `MQ_DEGENERATE`, both 0 —
 *   take it from the input's own definition (`SourceMesh.triangles` is
 *   counter-clockwise in Spine world, and a triangle whose sign the A39 band
 *   cannot read cannot be shown to be), not from a guess.
 * - **Exchange thresholds.** Every raster row records the threshold it was
 *   taken at (`MeasureRow.art.threshold`); a measurement claims nothing at any
 *   other.
 * - **Change the legacy fit.** `measureAuthoredMeshFit` (`src/mesh.ts`) keeps
 *   its 4-connected fill for every existing caller (its `connectivity: 8`,
 *   issue #1262, is the fill the rows read). The rows here fill with the
 *   tracer's 8-connected background flood over all art (P12), and where the two
 *   fills differ — a diagonal pinch — both labelled results are rows.
 * - **Pose, or link the runtime.** Pure: no clock, no randomness, no network,
 *   no spine-core, nothing from the compiler.
 *
 * ## Coordinates
 *
 * Every caller distance is in the drawing's part-local pixels, y down (P3). The
 * mask is read on its own grid — the plate's pixels, or a `scale:` page's
 * texels — so a point is carried to the grid as `px × pageScale`, and a raster
 * distance comes back as `texels / pageScale`. A pixel named in a `worst` is a
 * cell of the mask's grid, `[x, y]`, y down. Orientation is read in Spine world,
 * through `cropToSpineY` (`src/transform.ts`), the one place that conversion
 * lives.
 *
 * ⚠️ `src/mesh.ts` re-exports this module and this module imports helpers from
 * it, which is an import cycle. It is safe only because nothing at the top
 * level of either reads the other's bindings: every use is inside a function.
 * `MeshReductionError` is defined in `src/mesh.ts` for exactly that reason.
 */
import {
  checkHullOrder,
  distanceToSegment,
  findSelfIntersection,
  MeshError,
  MeshReductionError,
  meshEdges,
  r6,
  rasteriseTriangles,
  segmentsMeet,
  squaredDistanceToSet,
  traceOutline,
  type AlphaMask,
  type MeshOutline,
} from './mesh.ts';
import { areaBand, triangleAreas } from './areaband.ts';
import { artRastersOf, type ArtRasters, type CoverageReading, type OutlineMemo, type RegionEdgeReading, type SilhouetteReading, type StepRasters } from './meshrasters.ts';
import { cropToSpineY } from './transform.ts';

// ---------------------------------------------------------------------------
// §1 — inputs
// ---------------------------------------------------------------------------

/** The art one attachment is measured against. Correction 1: one per attachment, never shared. */
export interface ArtInput {
  /** The art, on the grid it is read off: the plate's pixels, or a `scale:` page's texels. */
  mask: AlphaMask;
  /** Art is `alpha >= threshold`. Required, a whole number in 1..255. Never exchanged. */
  threshold: number;
  /** The frame the caller's distances are in — P3. Echoed in the report, never inferred. */
  frame: SourceFrame;
}

/** P3: the caller authors in drawing pixels, part-local, y down. */
export interface SourceFrame {
  space: 'part-local-drawing-px-y-down';
  /** The part window in drawing pixels. */
  width: number;
  height: number;
  /** The `scale:` the page states (1 when none) — the meaning of `ContourSpecInput.pageScale`. */
  pageScale: number;
  /** The conversion applied, stated rather than implied: texels = drawing px × pageScale. */
  conversion: 'texels = px * pageScale';
}

export interface AttachmentRef {
  skin: string | null;
  slot: string;
  attachment: string;
}

export interface SourceMesh {
  /** Part-local pixels of the drawing, y down. */
  points: Array<[number, number]>;
  /** Region UVs, 0..1, `v` from the top — one pair per point. */
  uvs: number[];
  /** Counter-clockwise in Spine world; hull first, as `checkHullOrder` requires. */
  triangles: number[];
  hull: number;
  /** Per vertex, by bone NAME (`ModelBinding` without the bind coordinates), or null for an unweighted mesh. */
  weights: Array<Array<{ bone: string; weight: number }>> | null;
}

/**
 * All distances in the drawing's pixels; converted to texels by `pageScale`.
 *
 * `maxOvershoot` and `maxUndercut` may be `null` — a bound **declared absent**
 * (issue #1254): the row is measured and reported `undeclared`, with its value
 * and worst sample, and never passes, fails, blocks a step or refuses a source.
 * A field left out (`undefined`) is still refused by name: an omission cannot be
 * told from a caller that forgot, and only the explicit `null` says "measured,
 * not bounded". `minCoverage` has no such form and is always required.
 */
export interface ArtFitBounds {
  /** Share of art pixel centres the triangles cover, 0..1. */
  minCoverage: number;
  /** Furthest a covered pixel may sit outside the filled silhouette, px; null = declared absent. */
  maxOvershoot: number | null;
  /** Furthest an uncovered art pixel may sit from the covered set, px; null = declared absent. */
  maxUndercut: number | null;
}

/** What a reduction's RESULT must satisfy (correction 3). Read by `reduceMesh`, stage B2. */
export interface ReductionTargets {
  artFit: ArtFitBounds;
  /** P13: largest Hausdorff distance between the reduced and the source hull polygons, px. */
  maxBoundaryDeviation: number;
  /** Optional: smallest interior angle any triangle may have, degrees. Undeclared = reported, not gated. */
  minAngle?: number;
  /** Local density requirements — §5. */
  regions: RefinementRegion[];
}

/** P16/P17: a local density requirement over a closed polygon. */
export interface RefinementRegion {
  /** Caller's name, echoed in the report; rigc reads nothing into it. */
  name: string;
  /** Closed polygon, part-local drawing pixels, y down — resolved by the caller (P17). */
  polygon: Array<[number, number]>;
  /** L0: every edge that intersects the closed polygon is at most this long, px. */
  maxEdgeLength: number;
  /** Width of the band outside the polygon over which the bound relaxes, px. Finite, >= 0; 0 is a hard edge. */
  transition: number;
  /** In the band, L(d) = L0 + grade × d, d the distance from the polygon, px per px. Finite, >= 0. */
  grade: number;
  /** P17: when the caller approximated another shape by this polygon, how — echoed, never read. */
  approximation: { from: string; policy: string; maxError: number } | null;
}

/** §6, with P19/P20 folded in. Echoed by `measureMeshQuality`; read by `reduceMesh`, stage B2. */
export interface ProtectedFeatures {
  /** P20: keep every source hull vertex. Required — no default inside the operation. */
  hull: boolean;
  /** Source vertex indices that must survive. */
  vertices: number[];
  /** P20: source edges (pairs of source indices) that must survive as edges. */
  edges: Array<[number, number]>;
  /** Region polygons whose boundary vertices must survive. */
  regionBoundaries: string[];
  /** L1 weight-vector difference above which an edge is protected (correction 3). Null = no such protection, reported. */
  weightJump: number | null;
  /** Bones whose binding may not be pruned from any vertex that carries it (P19). */
  influences: string[];
}

/** P19: stated on every weighted call, never inherited. */
export interface InfluenceLimits {
  /** The cap on bindings per vertex. */
  maxInfluences: number;
  /** Shares under this are dropped; 0 drops only shares that are zero on the weight grid. */
  minWeight: number;
}

/**
 * One deform key of a timeline the reduced attachment is keyed under (§6, P18),
 * in the form the compiler emits it: a `vertices` run is the emitted `offset`
 * (an index into the deform array — two numbers per vertex unweighted, two per
 * influence weighted, AUTHORING §4.11) and the numbers copied in from there; a
 * `transform` key is a model the compile evaluates over the attachment's own
 * geometry (§4.11.1), so it has no run to remap; a `setup` key carries no run.
 */
export type DeformKeyInput =
  | { time: number; kind: 'setup' }
  | { time: number; kind: 'vertices'; offset: number; vertices: number[] }
  | { time: number; kind: 'transform' };

/** One deform timeline: the animation, the attachment it is keyed on, and its keys in order. */
export interface DeformTimelineInput {
  animation: string;
  /** The reduced attachment itself, or one of `MeshReductionInput.linkedMeshes`. */
  attachment: AttachmentRef;
  keys: DeformKeyInput[];
}

/** Everything a reduction reads (stage B2, `reduceMesh` in `src/meshreduce.ts`). No field has a default inside the operation. */
export interface MeshReductionInput {
  attachment: AttachmentRef;
  art: ArtInput;
  /** P8: the unreduced, independently gated source. */
  source: SourceMesh;
  /** Correction 3: what the SOURCE must already satisfy to be admissible. */
  sourceBounds: ArtFitBounds;
  /** Correction 3: what the RESULT must satisfy. */
  targets: ReductionTargets;
  protect: ProtectedFeatures;
  /** Required when `source.weights` is non-null — §6, P19. */
  influences: InfluenceLimits | null;
  /** Correction 1: the skeleton's bone order, used for every weight tie-break. Required when weighted. */
  boneOrder: string[] | null;
  /** P5: the preset the caller expanded, if any, echoed and never read. */
  preset: { name: string; version: string } | null;
  /** Work bound — *Termination reasons*. Every refinement insertion and every removal attempted counts one. */
  budget: { maxCandidates: number };
  /** P9: the fewest art samples the attachment's raster rows are taken over. A whole number >= 1. */
  minArtSamples: number;
  /** P9: one floor per region, by region name — every region named once. */
  regionArtSamples: Array<{ region: string; minArtSamples: number }>;
  /** P18: every deform timeline keyed on the attachment or on one of its linked meshes; empty when none. */
  deform: DeformTimelineInput[];
  /** Every linked mesh of the source (they inherit the new topology); empty when none. */
  linkedMeshes: AttachmentRef[];
  /**
   * Replay (issue #1268, §7 mechanism 2): stop after the n-th accepted step — a refinement insertion or a removal
   * taken, counted as `ReductionChanges.acceptedAt` counts them — and return the mesh the same call without this field
   * had at that step, byte for byte, terminated `replayed-to-accepted-step`. Left out = today's behaviour. A whole
   * number, 0 or more: 0 takes no step. A number the run never reaches leaves the run to end as it would have, and
   * that termination says so (`stopAfterAccepted` on it).
   */
  stopAfterAccepted?: number;
}

/**
 * What a measurement is held to. `ReductionTargets` with every bound allowed to
 * be undeclared: a measurement is also asked of meshes nobody has set a target
 * for, and a null bound is a row reported `undeclared`, never one given a value.
 */
export interface MeasureTargets {
  artFit: ArtFitBounds | null;
  maxBoundaryDeviation: number | null;
  minAngle?: number;
  regions: RefinementRegion[];
}

/**
 * What `measureMeshQuality` reads: the part of `MeshReductionInput` a
 * measurement needs, plus the three things only a measurement is handed — the
 * caller's id for the mesh, the hull polygon `MQ_BOUNDARY_DEVIATION` is taken
 * against, and the art sample floors (P9). Every field is required; a field the
 * caller has nothing for is `null` (or an empty list), never left out.
 */
export interface MeshMeasureInput {
  /** The caller's id for the mesh measured, echoed as the candidate's id. */
  id: string;
  attachment: AttachmentRef;
  art: ArtInput;
  /** The mesh measured. */
  source: SourceMesh;
  targets: MeasureTargets;
  /** The hull polygon to measure boundary deviation against, drawing px; null makes that row `not-measurable`. */
  referenceHull: Array<[number, number]> | null;
  /** P9: the fewest art samples the attachment's raster rows are taken over. A whole number >= 1. */
  minArtSamples: number;
  /** P9: one floor per region, by region name — every region named once. */
  regionArtSamples: Array<{ region: string; minArtSamples: number }>;
  protect: ProtectedFeatures | null;
  influences: InfluenceLimits | null;
  boneOrder: string[] | null;
  preset: { name: string; version: string } | null;
}

// ---------------------------------------------------------------------------
// §2 — the report
// ---------------------------------------------------------------------------

export const MESH_QUALITY_REPORT_SPEC = 'mesh-quality-report/1';

export type MeasureState = 'pass' | 'fail' | 'undeclared' | 'refused' | 'not-measurable';

export interface MeasureRow {
  /** Stable code, e.g. `MQ_COVERAGE`. */
  code: string;
  /** The object measured: attachment always; region when the row is a region's. */
  object: { attachment: AttachmentRef; region: string | null };
  state: MeasureState;
  /** The measured value: present on pass, fail and undeclared; null otherwise. */
  value: number | null;
  /** The declared bound, inclusive: present on pass and fail; null on undeclared, refused, not-measurable. */
  bound: { op: '<=' | '>='; value: number } | null;
  unit: 'px' | 'world' | 'fraction' | 'degrees' | 'ratio' | 'count';
  /** Where the worst value was taken: present whenever `value` is. `{ at: {} }` when nothing is worse than ideal. */
  worst: WorstSample | null;
  /** Required on refused and not-measurable: a sentence naming what was missing. */
  reason: string | null;
  /** Raster and sampled rows: the art the row was taken against — never read across thresholds. */
  art?: { threshold: number; connectivity: 4 | 8 | null; samples: number };
  /** Raster rows only — correction 2. */
  raster?: RasterSensitivity;
  /** Sampled rows — correction 2. */
  sampling?: { domain: string; count: number };
  /** Motion rows only (stage C, `src/meshcompare.ts`): how the row's value was taken over the schedule. */
  motion?: MotionRowDetail;
}

/** Correction 2: the spatial grid and the value's own granularity are two fields. */
export interface RasterSensitivity {
  grid: { width: number; height: number; pageScale: number };
  /** One texel, in the drawing's pixels: 1 / pageScale. */
  spatialQuantum: number;
  /** The smallest step the VALUE can take, in the row's own unit. */
  valueIncrement: number;
  /** A diagnostic: it changes no verdict and bounds no error. */
  nearBound: 'at-bound' | 'within-increment' | 'clear';
}

export interface WorstSample {
  at: { pixel?: [number, number]; triangle?: number; edge?: [number, number]; vertex?: number; uv?: [number, number] };
  /** Motion rows only — P7, P11. */
  frame?: FrameRef;
}

/** P7/P11: a frame named by a stable id carrying animation, phase and time. Stage C. */
export interface FrameRef {
  id: string;
  animation: string | null;
  phase: 'grid' | 'irr' | null;
  time: number | null;
  index: number | null;
  role: 'selection' | 'held-out' | 'baseline';
}

export interface EvidenceSection {
  rows: MeasureRow[];
  /** Counts per state. `measured` = pass + fail. Never summed across sections. */
  summary: { pass: number; fail: number; undeclared: number; refused: number; notMeasurable: number; measured: number };
  /** pass only when every REQUIRED row is pass AND at least one row is pass. */
  verdict: 'pass' | 'fail' | 'not-measured';
}

/** §3's motion bounds. Stage C. */
export interface MotionBounds {
  maxLocalDeformation: number;
  maxStretch?: number;
  minStretch?: number;
}

/** §3's schedule. Stage C. */
export interface MotionSchedule {
  frames: Array<'setup' | { animation: string; times: number[] } | { animation: string; fps: number }>;
  phases: Array<'grid' | 'irr'>;
  physics: { mode: 'none' } | { mode: 'step'; dt: number; warmupSteps: 0 };
  selection: string[];
}

/**
 * The schedule a motion section was measured under. The contract names this
 * type without defining it; stage C (issue #1230) defines it as the schedule as
 * given plus what was walked from it (`ScheduleWalked`, at the end of this file).
 */
export type ScheduleUsed = MotionSchedule & ScheduleWalked;

/** One candidate's evidence — correction 1. `reduce` and `measure` carry exactly one. */
export interface CandidateReport {
  /** The caller's id for the candidate, or `result` for a `reduce`. */
  id: string;
  counts: MeshCounts | null;
  /** Null when no mesh exists to measure (correction 3). */
  geometry: EvidenceSection | null;
  /** Null when no motion was asked for — never an empty PASS (P6). */
  motion: (EvidenceSection & { schedule: ScheduleUsed }) | null;
  /** P6 — declared-contract acceptance. */
  accepted: boolean;
  /** Opt-in (P7): every row's value at every frame. Absent unless asked for. */
  perFrame?: Array<{ code: string; frame: string; value: number | null }>;
  /** A `reduce` whose result exists: what the operation changed. Absent on a `measure` and when no mesh is returned. */
  changes?: ReductionChanges;
}

/**
 * What a reduction changed, counted rather than described — the figures the
 * contract says are reported (§6, P18 and P19) and that no geometry row carries.
 */
export interface ReductionChanges {
  /** Source vertices the reduction removed. */
  removedVertices: number;
  /** Vertices the refinement inserted (§5). */
  insertedVertices: number;
  /** P19: positive interpolated shares that are 0 on the 6-decimal weight grid, dropped rather than written as 0. */
  sharesDroppedOnGrid: number;
  /** Interpolated shares pruned by `InfluenceLimits` — over `maxInfluences`, or under a nonzero `minWeight`. */
  sharesPruned: number;
  /** P18: `vertices` keys remapped, each with the source vertices whose offsets were dropped. */
  deformRemapped: Array<{ animation: string; attachment: AttachmentRef; key: number; droppedVertices: number[] }>;
  /** P18: `transform` keys, re-evaluated over the new geometry at compile rather than remapped. */
  deformReevaluated: Array<{ animation: string; attachment: AttachmentRef; key: number }>;
  /** Every linked mesh of the source: each inherits the new topology. */
  linkedMeshes: AttachmentRef[];
  /**
   * Issue #1268: the attempt number — `candidatesTried` as it stood when the step was taken, 1-based — of every
   * accepted step, ascending: each refinement insertion and each removal, so its length is
   * `insertedVertices + removedVertices`. `stopAfterAccepted: k` replays to the step at `acceptedAt[k - 1]`.
   */
  acceptedAt: number[];
}

export interface MeshQualityReport {
  spec: typeof MESH_QUALITY_REPORT_SPEC;
  operation: 'reduce' | 'measure' | 'compare';
  /** Correction 1: the inputs echoed with their structure. */
  effective: EffectiveSettings;
  /** P2: which poser ran and its version. Null on geometry-only operations. */
  poser: { kind: 'core'; rigcVersion: string } | null;
  /** Whether the caller required motion evidence (P6). */
  motionRequired: boolean;
  /** Null when the source could not be read as a mesh (correction 3: counts are never invented). */
  sourceCounts: MeshCounts | null;
  reference: CandidateReport | null;
  candidates: CandidateReport[];
  termination: Termination | null;
}

/** Correction 1: every input the text requires, echoed field for field. */
export interface EffectiveSettings {
  preset: { name: string; version: string } | null;
  attachments: Array<{
    attachment: AttachmentRef;
    threshold: number;
    finalThreshold: number;
    frame: SourceFrame;
    maskSize: [number, number];
    minArtSamples: number;
    /** P9: each region's own floor, in the order the regions were given — and, on a `compare`, its polygon. */
    regions: Array<{ name: string; minArtSamples: number; polygon?: Array<[number, number]> }>;
  }>;
  sourceBounds: ArtFitBounds | null;
  referenceArtFit: ArtFitBounds | null;
  candidateArtFit: ArtFitBounds | null;
  targets: ReductionTargets | MeasureTargets | null;
  /** The hull polygon `MQ_BOUNDARY_DEVIATION` was taken against on a `measure`; null when none was given. */
  referenceHull: Array<[number, number]> | null;
  motionBounds: MotionBounds | null;
  protect: ProtectedFeatures | null;
  influences: InfluenceLimits | null;
  boneOrder: string[] | null;
  schedule: MotionSchedule | null;
  budget: { maxCandidates: number } | null;
  /** A reduction's `stopAfterAccepted`, echoed when the input set it (issue #1268); absent otherwise. */
  stopAfterAccepted?: number;
}

export interface MeshCounts {
  boundaryVertices: number;
  interiorVertices: number;
  triangles: number;
  /** Total `{ bone, weight }` entries over all vertices; 0 on an unweighted mesh. */
  bindings: number;
  /** The most entries any one vertex carries; 0 on an unweighted mesh. */
  maxInfluences: number;
}

/**
 * Issue #1268: carried by a run's own termination when the input asked for `stopAfterAccepted` and the run ended
 * before that many steps were accepted — `requested` the input's n, `acceptedSteps` how many the run took.
 */
export interface StopNotReached {
  requested: number;
  acceptedSteps: number;
}

/** *Termination reasons*. Every `reduce` report carries exactly one; a `measure` carries one only when it could not read the mesh. */
export type Termination =
  | { reason: 'no-further-valid-reduction'; candidatesTried: number; blockingConstraint: string; stopAfterAccepted?: StopNotReached }
  | { reason: 'budget-exhausted'; candidatesTried: number; budget: number; result: 'best-meeting-every-bound' | 'none-met-the-targets'; stopAfterAccepted?: StopNotReached }
  | { reason: 'replayed-to-accepted-step'; acceptedSteps: number; candidatesTried: number }
  | { reason: 'invalid-input'; code: string; detail: string }
  | { reason: 'unsupported-topology'; code: string; detail: string };

// ---------------------------------------------------------------------------
// fixed tolerances
// ---------------------------------------------------------------------------

/** A22's slack on a region UV (`src/assertions/bodies/a22.ts`): outside 0..1 by more than this is refused. */
const UV_RANGE_SLACK = 1e-6;

/**
 * How close the two-sided Hausdorff search brings its lower and upper bounds
 * before it stops, in drawing px. The value reported is then put on the `r6`
 * grid, six decimals, so the search is exact to three orders below what is
 * printed.
 */
const HAUSDORFF_TOLERANCE = 1e-9;

/** The predicate epsilon `segmentsMeet` and `prunePolygon` use (`src/mesh.ts`), for "on the boundary". */
const ON_BOUNDARY = 1e-9;

/**
 * How near a region's band's outer boundary, in drawing px, an edge's nearest
 * point has to come to count as touching it rather than entering the band —
 * the precision of "a single point on the outer boundary" in
 * `edgeIsHeldByRegion`, ten units of the `r6` grid. The refinement puts the
 * vertex it splits an edge at half of this inside the outer boundary and then
 * on the grid, which moves it by at most √2 × 5e-7 px, so the piece beyond it
 * lands inside this tolerance from either side.
 */
export const BAND_CONTACT_TOLERANCE = 1e-5;

/** Halvings of the parameter interval in the convex searches along an edge (`edgeIsHeldByRegion`): 2^-60 of an edge is below a double's resolution of it. */
const EDGE_SEARCH_STEPS = 60;

// ---------------------------------------------------------------------------
// refusals
// ---------------------------------------------------------------------------

/** `skin/slot/attachment`, the way every message names the attachment. */
function nameOf(ref: AttachmentRef): string {
  return `${ref.skin ?? '(no skin)'}/${ref.slot}/${ref.attachment}`;
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

function isPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]);
}

/** A field that has to be present: `undefined` is a refusal naming it. */
function present(owner: string, field: string, value: unknown, required: string): void {
  if (value === undefined) refuse('REDUCE_INPUT_MISSING', `${owner}: ${field} is missing; required ${required} — no field has a default`);
}

/**
 * Everything §1 refuses before a pixel is read, by code. The order is the order
 * a fix has to happen in: the attachment's identity, then the art, then the
 * mesh, then the bounds.
 */
function validateInput(input: MeshMeasureInput): void {
  if (!isObject(input)) refuse('REDUCE_INPUT_MISSING', `the input is ${JSON.stringify(input)}; required a MeshMeasureInput object`);
  const ref = input.attachment;
  if (!isObject(ref) || typeof ref.slot !== 'string' || ref.slot === '' || typeof ref.attachment !== 'string' || ref.attachment === '' || !(ref.skin === null || typeof ref.skin === 'string')) {
    refuse('REDUCE_INPUT_MISSING', `attachment is ${JSON.stringify(ref)}; required { skin: string | null, slot: string, attachment: string } with a slot and an attachment name`);
  }
  const who = `attachment ${nameOf(ref)}`;
  if (typeof input.id !== 'string' || input.id === '') refuse('REDUCE_INPUT_MISSING', `${who}: id is ${JSON.stringify(input.id)}; required a non-empty string naming the mesh measured`);

  // The art.
  const art = input.art;
  present(who, 'art', art, '{ mask, threshold, frame }');
  if (!isObject(art)) refuse('REDUCE_INPUT_MISSING', `${who}: art is ${JSON.stringify(art)}; required { mask, threshold, frame }`);
  present(who, 'art.threshold', art.threshold, 'a whole number in 1..255');
  if (!Number.isInteger(art.threshold) || art.threshold < 1 || art.threshold > 255) {
    refuse('REDUCE_THRESHOLD_RANGE', `${who}: art.threshold is ${JSON.stringify(art.threshold)}; required a whole number in 1..255 (art is alpha >= threshold)`);
  }
  const frame = art.frame;
  present(who, 'art.frame', frame, '{ space, width, height, pageScale, conversion }');
  if (!isObject(frame)) refuse('REDUCE_INPUT_MISSING', `${who}: art.frame is ${JSON.stringify(frame)}; required { space, width, height, pageScale, conversion }`);
  if (frame.space !== 'part-local-drawing-px-y-down') refuse('REDUCE_INPUT_MISSING', `${who}: art.frame.space is ${JSON.stringify(frame.space)}; required "part-local-drawing-px-y-down"`);
  if (frame.conversion !== 'texels = px * pageScale') refuse('REDUCE_INPUT_MISSING', `${who}: art.frame.conversion is ${JSON.stringify(frame.conversion)}; required "texels = px * pageScale"`);
  for (const field of ['width', 'height', 'pageScale'] as const) {
    const v = frame[field];
    if (!isFiniteNumber(v) || v <= 0) refuse('REDUCE_INPUT_MISSING', `${who}: art.frame.${field} is ${JSON.stringify(v)}; required a finite number above 0`);
  }
  const mask = art.mask;
  present(who, 'art.mask', mask, '{ width, height, alpha }');
  if (!isObject(mask) || !(mask.alpha instanceof Uint8Array)) refuse('REDUCE_INPUT_MISSING', `${who}: art.mask is not { width, height, alpha: Uint8Array }; required an AlphaMask`);
  if (!Number.isInteger(mask.width) || !Number.isInteger(mask.height) || mask.width < 1 || mask.height < 1) {
    refuse('REDUCE_MASK_SIZE', `${who}: the mask is ${mask.width}x${mask.height}; required whole dimensions of at least 1x1`);
  }
  if (mask.alpha.length !== mask.width * mask.height) {
    refuse('REDUCE_MASK_SIZE', `${who}: the mask holds ${mask.alpha.length} bytes for ${mask.width}x${mask.height}; required width × height = ${mask.width * mask.height}`);
  }
  // Correction 1: the mask has to be THIS attachment's — its grid is the frame's, by the stated scale.
  const wantW = r6(frame.width * frame.pageScale);
  const wantH = r6(frame.height * frame.pageScale);
  if (mask.width !== wantW || mask.height !== wantH) {
    refuse(
      'REDUCE_MASK_SIZE',
      `${who}: the mask is ${mask.width}x${mask.height} and the frame is ${frame.width}x${frame.height} px at pageScale ${frame.pageScale}; ` +
        `required a ${wantW}x${wantH} mask (frame × pageScale) — a mask is one attachment's and is never shared with another of a different size`,
    );
  }

  // The mesh.
  const src = input.source;
  present(who, 'source', src, '{ points, uvs, triangles, hull, weights }');
  if (!isObject(src) || !Array.isArray(src.points) || !Array.isArray(src.uvs) || !Array.isArray(src.triangles)) {
    refuse('REDUCE_INPUT_MISSING', `${who}: source is not { points, uvs, triangles, hull, weights } with three arrays`);
  }
  src.points.forEach((p, i) => {
    if (!isPoint(p)) refuse('REDUCE_INPUT_MISSING', `${who}: source.points[${i}] is ${JSON.stringify(p)}; required a pair of finite numbers`);
  });
  if (src.uvs.length !== 2 * src.points.length) {
    refuse('REDUCE_INPUT_MISSING', `${who}: source.uvs holds ${src.uvs.length} numbers for ${src.points.length} points; required one u, v pair per point (${2 * src.points.length})`);
  }
  src.uvs.forEach((u, i) => {
    if (!isFiniteNumber(u) || u < -UV_RANGE_SLACK || u > 1 + UV_RANGE_SLACK) {
      refuse('REDUCE_UV_RANGE', `${who}: source.uvs[${i}] (vertex ${Math.floor(i / 2)}, ${i % 2 === 0 ? 'u' : 'v'}) is ${u}; required 0..1 within ${UV_RANGE_SLACK} (A22)`);
    }
  });
  if (!Number.isInteger(src.hull)) refuse('REDUCE_INPUT_MISSING', `${who}: source.hull is ${JSON.stringify(src.hull)}; required the whole number of hull vertices`);
  if (src.weights !== null) {
    if (!Array.isArray(src.weights) || src.weights.length !== src.points.length) {
      refuse('REDUCE_INPUT_MISSING', `${who}: source.weights is not one binding list per point (${src.points.length}); required that, or null for an unweighted mesh`);
    }
    src.weights.forEach((vertex, i) => {
      if (!Array.isArray(vertex) || vertex.some((b) => !isObject(b) || typeof b.bone !== 'string' || !isFiniteNumber(b.weight))) {
        refuse('REDUCE_INPUT_MISSING', `${who}: source.weights[${i}] is not a list of { bone, weight }; required that`);
      }
    });
  }

  // The bounds.
  const targets = input.targets;
  present(who, 'targets', targets, '{ artFit, maxBoundaryDeviation, regions }');
  if (!isObject(targets)) refuse('REDUCE_INPUT_MISSING', `${who}: targets is ${JSON.stringify(targets)}; required { artFit, maxBoundaryDeviation, regions }`);
  present(who, 'targets.artFit', targets.artFit, 'an ArtFitBounds or null');
  if (targets.artFit !== null) {
    const fit = targets.artFit;
    const coverage = fit.minCoverage;
    if (!isFiniteNumber(coverage) || coverage < 0 || coverage > 1) refuse('REDUCE_INPUT_MISSING', `${who}: targets.artFit.minCoverage is ${JSON.stringify(coverage)}; required a fraction in 0..1`);
    for (const field of ['maxOvershoot', 'maxUndercut'] as const) {
      const v = fit[field];
      if (v !== null && (!isFiniteNumber(v) || v < 0)) refuse('REDUCE_INPUT_MISSING', `${who}: targets.artFit.${field} is ${JSON.stringify(v)}; required a finite number of px, 0 or more, or null (declared absent: measured, reported undeclared)`);
    }
  }
  present(who, 'targets.maxBoundaryDeviation', targets.maxBoundaryDeviation, 'a number of px or null');
  if (targets.maxBoundaryDeviation !== null && (!isFiniteNumber(targets.maxBoundaryDeviation) || targets.maxBoundaryDeviation < 0)) {
    refuse('REDUCE_INPUT_MISSING', `${who}: targets.maxBoundaryDeviation is ${JSON.stringify(targets.maxBoundaryDeviation)}; required a finite number of px, 0 or more, or null`);
  }
  if (targets.minAngle !== undefined && (!isFiniteNumber(targets.minAngle) || targets.minAngle < 0)) {
    refuse('REDUCE_INPUT_MISSING', `${who}: targets.minAngle is ${JSON.stringify(targets.minAngle)}; required a finite number of degrees, 0 or more, or the field left out`);
  }
  present(who, 'targets.regions', targets.regions, 'a list of regions (empty when none)');
  if (!Array.isArray(targets.regions)) refuse('REDUCE_INPUT_MISSING', `${who}: targets.regions is ${JSON.stringify(targets.regions)}; required a list (empty when none)`);
  present(who, 'referenceHull', input.referenceHull, 'a polygon or null');
  if (input.referenceHull !== null) {
    if (!Array.isArray(input.referenceHull) || input.referenceHull.length < 3 || !input.referenceHull.every(isPoint)) {
      refuse('REDUCE_INPUT_MISSING', `${who}: referenceHull is not a polygon of at least 3 finite points; required that, or null`);
    }
  }

  // P9: the sample floors.
  present(who, 'minArtSamples', input.minArtSamples, 'a whole number >= 1');
  if (!Number.isInteger(input.minArtSamples) || input.minArtSamples < 1) {
    refuse('REDUCE_INPUT_MISSING', `${who}: minArtSamples is ${JSON.stringify(input.minArtSamples)}; required a whole number >= 1 (P9, no hidden constant)`);
  }
  present(who, 'regionArtSamples', input.regionArtSamples, 'one { region, minArtSamples } per region');
  if (!Array.isArray(input.regionArtSamples)) refuse('REDUCE_INPUT_MISSING', `${who}: regionArtSamples is not a list; required one { region, minArtSamples } per region`);
  const names = new Set<string>();
  targets.regions.forEach((region, i) => {
    if (!isObject(region) || typeof region.name !== 'string' || region.name === '') {
      refuse('REDUCE_INPUT_MISSING', `${who}: targets.regions[${i}] has no name; required a non-empty name, which every row of the region is keyed by`);
    }
    if (names.has(region.name)) refuse('REDUCE_INPUT_MISSING', `${who}: region "${region.name}" is named twice; required one name per region, which its rows and its sample floor are keyed by`);
    names.add(region.name);
    if (!Array.isArray(region.polygon) || region.polygon.length < 3) {
      refuse('REDUCE_INPUT_MISSING', `${who}: region "${region.name}" has a polygon of ${Array.isArray(region.polygon) ? region.polygon.length : 'no'} vertices; required at least 3`);
    }
    for (const field of ['maxEdgeLength', 'transition', 'grade'] as const) present(`${who}, region "${region.name}"`, field, region[field], 'a finite number');
    present(`${who}, region "${region.name}"`, 'approximation', region.approximation, 'an approximation or null');
    const floors = input.regionArtSamples.filter((f) => isObject(f) && f.region === region.name);
    if (floors.length !== 1 || !Number.isInteger(floors[0].minArtSamples) || floors[0].minArtSamples < 1) {
      refuse('REDUCE_INPUT_MISSING', `${who}: region "${region.name}" has ${floors.length} sample floor(s) in regionArtSamples; required exactly one, a whole number >= 1 (P9)`);
    }
  });
  input.regionArtSamples.forEach((f, i) => {
    if (!isObject(f) || !names.has(f.region)) refuse('REDUCE_INPUT_MISSING', `${who}: regionArtSamples[${i}] names ${JSON.stringify(isObject(f) ? f.region : f)}, which no region is; required a floor for a declared region`);
  });

  // Echoed, never read — but present, since nothing has a default.
  for (const field of ['protect', 'influences', 'boneOrder', 'preset'] as const) present(who, field, input[field], 'a value or null');
  if (input.protect !== null) {
    const p = input.protect;
    const ok =
      isObject(p) &&
      typeof p.hull === 'boolean' &&
      Array.isArray(p.vertices) &&
      Array.isArray(p.edges) &&
      Array.isArray(p.regionBoundaries) &&
      (p.weightJump === null || isFiniteNumber(p.weightJump)) &&
      Array.isArray(p.influences);
    if (!ok) refuse('REDUCE_INPUT_MISSING', `${who}: protect is not a ProtectedFeatures with every field; required { hull, vertices, edges, regionBoundaries, weightJump, influences }, or null`);
  }
  if (input.influences !== null && (!isObject(input.influences) || !isFiniteNumber(input.influences.maxInfluences) || !isFiniteNumber(input.influences.minWeight))) {
    refuse('REDUCE_INPUT_MISSING', `${who}: influences is not { maxInfluences, minWeight }; required that, or null`);
  }
  if (input.boneOrder !== null && (!Array.isArray(input.boneOrder) || input.boneOrder.some((b) => typeof b !== 'string'))) {
    refuse('REDUCE_INPUT_MISSING', `${who}: boneOrder is not a list of bone names; required that, or null`);
  }
  if (input.preset !== null && (!isObject(input.preset) || typeof input.preset.name !== 'string' || typeof input.preset.version !== 'string')) {
    refuse('REDUCE_INPUT_MISSING', `${who}: preset is not { name, version }; required that, or null`);
  }
}

// ---------------------------------------------------------------------------
// plane geometry
// ---------------------------------------------------------------------------

type Pt = readonly [number, number];

/**
 * Is `p` inside or on the closed polygon? On the boundary within `ON_BOUNDARY` counts as inside.
 *
 * The rule, exactly, because `closedPolygonCentres` reproduces it bit for bit:
 * `p` is in when its `distanceToSegment` to some side `poly[i]`–`poly[i+1]`
 * is at most `ON_BOUNDARY` (1e-9 px) — a point on an edge or at a vertex is in,
 * whatever the ray says; otherwise by **even-odd** parity of a ray towards +x,
 * where the side from `poly[j]` to `poly[i]` (`j` the one before `i`) crosses
 * when exactly one of its ends has a y strictly greater than `p`'s — `yi > py`
 * differs from `yj > py`, so the half-open rule counts a vertex at `p`'s height
 * once and a horizontal side never — at
 * `xc = ((xj − xi)·(py − yi)) / (yj − yi) + xi`, and the crossing counts when
 * `px < xc` strictly.
 */
export function inClosedPolygon(p: Pt, poly: readonly Pt[]): boolean {
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

/**
 * A fault planted on purpose in `closedPolygonCentres`, for the mesh-quality
 * suite's negative control: `'crossing-half-pixel'` moves every ray crossing
 * half a pixel towards +x. `regionRows` plants none.
 */
export type ScanlinePlant = 'crossing-half-pixel';

/**
 * Which pixel centres of a `w`×`h` grid lie in or on a closed polygon given
 * in drawing px — `inClosedPolygon` of every centre `((x + 0.5) / scale,
 * (y + 0.5) / scale)`, 1 where it is true, by scanline (issue #1263).
 *
 * The same decision, not a cleaner one: each row's crossings are the sides
 * `inClosedPolygon` counts for that row's centre height, by its own
 * half-open test, at the `xc` it computes with the same expression in the same
 * order, so they are the same doubles; sorted, the number of them a centre
 * lies strictly left of is the number its ray counts, and its parity is the
 * answer. The boundary band is then added side by side, each centre near a
 * side tested with `distanceToSegment` against `ON_BOUNDARY` — the predicate's
 * own test — so a centre on an edge or at a vertex is in exactly when the
 * predicate says so. The rows and columns visited around a side are widened by
 * a pixel past where it can reach, and only the exact tests decide.
 *
 * O(rows × sides + pixels) where testing every centre against every side is
 * O(pixels × sides).
 */
export function closedPolygonCentres(poly: readonly Pt[], w: number, h: number, scale: number, plant: ScanlinePlant | null = null): Uint8Array {
  const marks = new Uint8Array(w * h);
  const n = poly.length;
  if (n === 0 || w <= 0 || h <= 0) return marks;
  const cx = (x: number): number => (x + 0.5) / scale;
  const cy = (y: number): number => (y + 0.5) / scale;
  const shift = plant === 'crossing-half-pixel' ? 0.5 / scale : 0;
  /** The grid row or column of a drawing coordinate, rounded one way and widened by `slack`; NaN visits nothing. */
  const cellOf = (v: number, round: (u: number) => number, slack: number, size: number): number => {
    const c = round(v * scale - 0.5) + slack;
    if (Number.isNaN(c)) return slack < 0 ? size : -1;
    return c;
  };

  // Even-odd: per row, the crossings of a ray towards +x from the row's centre height.
  const crossings: Array<number[] | undefined> = new Array<number[] | undefined>(h);
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const y0 = Math.max(0, cellOf(Math.min(yi, yj), Math.floor, -1, h));
    const y1 = Math.min(h - 1, cellOf(Math.max(yi, yj), Math.ceil, 1, h));
    for (let y = y0; y <= y1; y++) {
      const py = cy(y);
      if (yi > py !== yj > py) {
        let row = crossings[y];
        if (row === undefined) {
          row = [];
          crossings[y] = row;
        }
        row.push(((xj - xi) * (py - yi)) / (yj - yi) + xi + shift);
      }
    }
  }
  for (let y = 0; y < h; y++) {
    const row = crossings[y];
    if (row === undefined) continue;
    row.sort((a, b) => a - b);
    const x0 = Math.max(0, cellOf(row[0], Math.floor, -1, w));
    const x1 = Math.min(w - 1, cellOf(row[row.length - 1], Math.ceil, 1, w));
    let left = 0;
    for (let x = x0; x <= x1; x++) {
      const px = cx(x);
      while (left < row.length && !(px < row[left])) left++;
      if ((row.length - left) & 1) marks[y * w + x] = 1;
    }
  }

  // On the boundary: within ON_BOUNDARY of a side. Per side, the rows its ends span and, per row, the columns
  // the side passes within a pixel of that row's centre height, each widened by a pixel; the exact test decides.
  const unit = 1 / scale;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const y0 = Math.max(0, cellOf(Math.min(a[1], b[1]), Math.floor, -1, h));
    const y1 = Math.min(h - 1, cellOf(Math.max(a[1], b[1]), Math.ceil, 1, h));
    const dy = b[1] - a[1];
    for (let y = y0; y <= y1; y++) {
      let lo = Math.min(a[0], b[0]);
      let hi = Math.max(a[0], b[0]);
      if (dy !== 0) {
        const py = cy(y);
        const t0 = Math.max(0, Math.min(1, (py - unit - a[1]) / dy));
        const t1 = Math.max(0, Math.min(1, (py + unit - a[1]) / dy));
        const xa = a[0] + (b[0] - a[0]) * t0;
        const xb = a[0] + (b[0] - a[0]) * t1;
        lo = Math.min(xa, xb);
        hi = Math.max(xa, xb);
      }
      const x0 = Math.max(0, cellOf(lo, Math.floor, -1, w));
      const x1 = Math.min(w - 1, cellOf(hi, Math.ceil, 1, w));
      for (let x = x0; x <= x1; x++) {
        const k = y * w + x;
        if (marks[k]) continue;
        if (distanceToSegment([cx(x), cy(y)], a, b) <= ON_BOUNDARY) marks[k] = 1;
      }
    }
  }
  return marks;
}

/** Does the segment `a`–`b` meet the closed polygon — an endpoint inside or on it, or any crossing or touch? */
function segmentMeetsPolygon(a: Pt, b: Pt, poly: readonly Pt[]): boolean {
  if (inClosedPolygon(a, poly) || inClosedPolygon(b, poly)) return true;
  const n = poly.length;
  for (let i = 0; i < n; i++) if (segmentsMeet(a, b, poly[i], poly[(i + 1) % n])) return true;
  return false;
}

/** Distance between two segments that do not meet: the nearest of the four endpoint-to-segment distances. */
function segmentDistance(a: Pt, b: Pt, c: Pt, d: Pt): number {
  if (segmentsMeet(a, b, c, d)) return 0;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}

/** Distance from a segment to a closed polygon's region: 0 when they meet, else to its nearest edge. */
function segmentToPolygon(a: Pt, b: Pt, poly: readonly Pt[]): number {
  if (segmentMeetsPolygon(a, b, poly)) return 0;
  let best = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) best = Math.min(best, segmentDistance(a, b, poly[i], poly[(i + 1) % n]));
  return best;
}

/**
 * The parameter in `[0, 1]` along `a`–`b` nearest which `c`–`d` lies — the
 * minimum of the distance from `a + t(b − a)` to the segment `c`–`d`, which is
 * convex in `t`, found by golden-section search. A flat minimum (parallel
 * segments) returns some point of it; the callers never read one there.
 */
function nearestParameter(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const at = (t: number): number => distanceToSegment([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], c, d);
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < EDGE_SEARCH_STEPS; i++) {
    const p = hi - g * (hi - lo);
    const q = lo + g * (hi - lo);
    if (at(p) <= at(q)) hi = q;
    else lo = p;
  }
  return (lo + hi) / 2;
}

/**
 * Does `a`–`b` run along the outer boundary of a band of width `transition`
 * for a positive length — some polygon edge it overlaps in projection by more
 * than `BAND_CONTACT_TOLERANCE`, at that edge's perpendicular distance
 * `transition` (within the tolerance) at both ends of the overlap, so at every
 * point between them? The caller has already found the edge's nearest approach
 * to the polygon within the tolerance of `transition`.
 */
function runsAlongOuterBoundary(a: Pt, b: Pt, poly: readonly Pt[], transition: number): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const c = poly[i];
    const e = poly[(i + 1) % n];
    const side = Math.hypot(e[0] - c[0], e[1] - c[1]);
    if (side === 0) continue;
    const ux = (e[0] - c[0]) / side;
    const uy = (e[1] - c[1]) / side;
    const sa = (a[0] - c[0]) * ux + (a[1] - c[1]) * uy;
    const sb = (b[0] - c[0]) * ux + (b[1] - c[1]) * uy;
    let t0 = 0;
    let t1 = 1;
    if (sa === sb) {
      if (sa < 0 || sa > side) continue;
    } else {
      const p = (0 - sa) / (sb - sa);
      const q = (side - sa) / (sb - sa);
      t0 = Math.max(0, Math.min(p, q));
      t1 = Math.min(1, Math.max(p, q));
    }
    if ((t1 - t0) * length <= BAND_CONTACT_TOLERANCE) continue;
    const off = (t: number): number => Math.abs(ux * (a[1] + (b[1] - a[1]) * t - c[1]) - uy * (a[0] + (b[0] - a[0]) * t - c[0]));
    if (Math.abs(off(t0) - transition) <= BAND_CONTACT_TOLERANCE && Math.abs(off(t1) - transition) <= BAND_CONTACT_TOLERANCE) return true;
  }
  return false;
}

/**
 * [agreed, spine-parts#126] Is the edge `a`–`b` held by `region` — does the
 * region's density bound (`MQ_MAX_EDGE` or `MQ_TRANSITION`) apply to it? The
 * one definition both `measureMeshQuality` and `reduceMesh`'s refinement read.
 *
 * The region's active domain is its closed polygon and, when `transition > 0`,
 * the band of that width outside it. An edge is held when it meets that domain,
 * except for one case: its intersection with the domain is a **single point on
 * the band's outer boundary** and the rest of the edge lies outside — an edge
 * that only touches the band from outside is exempt.
 *
 * - An edge that meets the closed polygon is held, whatever the band.
 * - With `transition: 0` there is no outer band, and a contact with the
 *   authored boundary is held under the closed-region rule — never exempt.
 * - A positive-length intersection is held, including a segment lying along
 *   the band's outer boundary.
 * - Two separate touches of the outer boundary are two points, not one, and
 *   the edge is held.
 *
 * "On the outer boundary" is within `BAND_CONTACT_TOLERANCE`. Each region is
 * read on its own: an exemption from one never removes another's bound.
 */
export function edgeIsHeldByRegion(a: readonly [number, number], b: readonly [number, number], region: RefinementRegion): boolean {
  const poly: readonly Pt[] = region.polygon;
  if (segmentMeetsPolygon(a, b, poly)) return true;
  const transition = region.transition;
  if (!(transition > 0)) return false;
  const d = segmentToPolygon(a, b, poly);
  if (d > transition) return false;
  if (d < transition - BAND_CONTACT_TOLERANCE) return true;
  if (runsAlongOuterBoundary(a, b, poly, transition)) return true;
  // Where on the edge each polygon side is touched: one point, or several apart.
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let first = Infinity;
  let last = -Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const c = poly[i];
    const e = poly[(i + 1) % n];
    if (segmentDistance(a, b, c, e) > transition) continue;
    const t = nearestParameter(a, b, c, e);
    first = Math.min(first, t);
    last = Math.max(last, t);
  }
  return (last - first) * length > BAND_CONTACT_TOLERANCE;
}

/** Distance from a point to a closed polyline (the polygon's boundary), and the edge that realises it. */
function pointToBoundary(p: Pt, poly: readonly Pt[]): { d: number; edge: number } {
  let d = Infinity;
  let edge = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const v = distanceToSegment(p, poly[i], poly[(i + 1) % n]);
    if (v < d) {
      d = v;
      edge = i;
    }
  }
  return { d, edge };
}

/**
 * The directed Hausdorff distance from the boundary of `a` to the boundary of
 * `b` — the furthest any point of `a`'s outline sits from `b`'s — and where.
 *
 * Exact up to `HAUSDORFF_TOLERANCE`, by branch and bound along each edge of
 * `a`. The distance to one edge of `b` is convex along a segment, so on any
 * piece of an edge of `a` it is at most the larger of its two end values; the
 * distance to the whole of `b` is the minimum over `b`'s edges, so the smallest
 * of those maxima bounds it from above. A piece whose bound cannot beat the best
 * value already found is dropped; the rest are halved. No sampling density is
 * chosen, so nothing here can miss a maximum between two samples.
 */
function directedHausdorff(a: readonly Pt[], b: readonly Pt[], carried: ((p: Pt) => Float64Array) | null = null): { d: number; edge: number; at: Pt } {
  const m = b.length;
  const toEach =
    carried ??
    ((p: Pt): Float64Array => {
      const out = new Float64Array(m);
      for (let j = 0; j < m; j++) out[j] = distanceToSegment(p, b[j], b[(j + 1) % m]);
      return out;
    });
  const minOf = (g: Float64Array): number => {
    let v = Infinity;
    for (let j = 0; j < m; j++) v = Math.min(v, g[j]);
    return v;
  };
  let best = -1;
  let bestEdge = 0;
  let bestAt: Pt = a[0];
  const n = a.length;
  for (let i = 0; i < n; i++) {
    const p0 = a[i];
    const p1 = a[(i + 1) % n];
    const at = (t: number): Pt => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
    const consider = (f: number, t: number): void => {
      if (f > best) {
        best = f;
        bestEdge = i;
        bestAt = at(t);
      }
    };
    const g0 = toEach(p0);
    const g1 = toEach(p1);
    consider(minOf(g0), 0);
    consider(minOf(g1), 1);
    const stack: Array<{ t0: number; t1: number; g0: Float64Array; g1: Float64Array; depth: number }> = [{ t0: 0, t1: 1, g0, g1, depth: 0 }];
    while (stack.length > 0) {
      const piece = stack.pop()!;
      let upper = Infinity;
      for (let j = 0; j < m; j++) upper = Math.min(upper, Math.max(piece.g0[j], piece.g1[j]));
      if (upper <= best + HAUSDORFF_TOLERANCE || piece.depth >= 64) continue;
      const tm = (piece.t0 + piece.t1) / 2;
      const gm = toEach(at(tm));
      consider(minOf(gm), tm);
      stack.push({ t0: piece.t0, t1: tm, g0: piece.g0, g1: gm, depth: piece.depth + 1 });
      stack.push({ t0: tm, t1: piece.t1, g0: gm, g1: piece.g1, depth: piece.depth + 1 });
    }
  }
  return { d: Math.max(best, 0), edge: bestEdge, at: bestAt };
}

/**
 * The symmetric Hausdorff distance between two closed polygons' boundaries,
 * with the candidate hull edge the worst value belongs to: the edge it was
 * taken on when the worst point is the candidate's, else the candidate edge
 * nearest the reference's worst point.
 */
function hausdorff(candidate: readonly Pt[], reference: readonly Pt[], carried: { forward: (p: Pt) => Float64Array; backward: (p: Pt) => Float64Array } | null = null): { d: number; candidateEdge: number } {
  const forward = directedHausdorff(candidate, reference, carried?.forward ?? null);
  const backward = directedHausdorff(reference, candidate, carried?.backward ?? null);
  if (forward.d >= backward.d) return { d: forward.d, candidateEdge: forward.edge };
  return { d: backward.d, candidateEdge: pointToBoundary(backward.at, candidate).edge };
}

/** A point as a key: both coordinates' shortest round-trip decimals, a negative zero told from a positive one. */
function pointKey(p: Pt): string {
  const k = (v: number): string => (v === 0 && 1 / v < 0 ? '-0' : String(v));
  return `${k(p[0])},${k(p[1])}`;
}

/**
 * `hausdorff`'s point-to-edge distance lists for one outline slot of a
 * reduction, carried from the slot's last reading (`OutlineMemo`, issue #1246).
 * Every list is the one `directedHausdorff` computes — `distanceToSegment(p,
 * b[j], b[(j + 1) % m])` for every edge `j` — had in one of three ways, each
 * the same function of the same input:
 *
 * - **toward the polygon read against** (fixed in a reduction): the list
 *   kept for the same point, handed back whole while that polygon is equal;
 * - **toward the outline**, which a step changes: the last reading's list for
 *   the same point, each distance copied when its edge — both ends, exactly —
 *   is an edge of the last outline, and computed when it is not;
 * - anything else: computed.
 */
function carriedDistances(
  memo: OutlineMemo,
  outline: readonly Pt[],
  against: readonly Pt[],
  steps: StepRasters,
): { forward: (p: Pt) => Float64Array; backward: (p: Pt) => Float64Array; commit: () => void } {
  const { tally, plant } = steps;
  memo.readings++;
  const reading = memo.readings;
  // The polygon read against: keep the lists while it is equal, coordinate by coordinate.
  const againstFlat = new Float64Array(against.length * 2);
  against.forEach((p, i) => {
    againstFlat[i * 2] = p[0];
    againstFlat[i * 2 + 1] = p[1];
  });
  const sameAgainst = memo.against !== null && memo.against.length === againstFlat.length && memo.against.every((v, i) => Object.is(v, againstFlat[i]));
  if (!sameAgainst) {
    memo.toAgainst.clear();
    memo.against = againstFlat;
  }
  const ma = against.length;
  const forward = (p: Pt): Float64Array => {
    tally.distanceLists++;
    const key = pointKey(p);
    const kept = memo.toAgainst.get(key);
    if (kept !== undefined) {
      kept.used = reading;
      tally.distanceListsReused++;
      return kept.list;
    }
    const list = new Float64Array(ma);
    for (let j = 0; j < ma; j++) list[j] = distanceToSegment(p, against[j], against[(j + 1) % ma]);
    tally.edgesComputed += ma;
    memo.toAgainst.set(key, { list, used: reading });
    return list;
  };
  // The outline's edges, and where each sat in the last outline.
  const mo = outline.length;
  const edges = new Map<string, number>();
  const from = new Int32Array(mo);
  const lastEdges = memo.outlineEdges;
  let plantPending = plant === 'skip-an-edge';
  for (let j = 0; j < mo; j++) {
    const key = `${pointKey(outline[j])};${pointKey(outline[(j + 1) % mo])}`;
    edges.set(key, j);
    const was = lastEdges?.get(key);
    from[j] = was ?? -1;
    if (was === undefined && plantPending && lastEdges !== null && j < lastEdges.size) {
      // The plant: one new edge read as if it were the last outline's edge at the same index.
      plantPending = false;
      from[j] = j;
    }
  }
  const last = memo.toOutline;
  const next = new Map<string, Float64Array>();
  const backward = (p: Pt): Float64Array => {
    tally.distanceLists++;
    const key = pointKey(p);
    const done = next.get(key);
    if (done !== undefined) {
      tally.distanceListsReused++;
      return done;
    }
    const before = last.get(key);
    const list = new Float64Array(mo);
    if (before === undefined) {
      for (let j = 0; j < mo; j++) list[j] = distanceToSegment(p, outline[j], outline[(j + 1) % mo]);
      tally.edgesComputed += mo;
    } else {
      tally.distanceListsCarried++;
      for (let j = 0; j < mo; j++) {
        if (from[j] >= 0) {
          list[j] = before[from[j]];
          tally.edgesCarried++;
        } else {
          list[j] = distanceToSegment(p, outline[j], outline[(j + 1) % mo]);
          tally.edgesComputed++;
        }
      }
    }
    next.set(key, list);
    return list;
  };
  return {
    forward,
    backward,
    commit: () => {
      // Keep this reading's outline lists for the next one; drop the lists toward the fixed polygon the last two readings did not ask for.
      memo.toOutline = next;
      memo.outlineEdges = edges;
      for (const [key, entry] of memo.toAgainst) if (entry.used < reading - 1) memo.toAgainst.delete(key);
    },
  };
}

/** `hausdorff` through a reduction's carried distances (`carriedDistances`), dropping what the last two readings of the slot did not ask for. */
function hausdorffCarried(memo: OutlineMemo, candidate: readonly Pt[], reference: readonly Pt[], steps: StepRasters): { d: number; candidateEdge: number } {
  const carried = carriedDistances(memo, candidate, reference, steps);
  const value = hausdorff(candidate, reference, carried);
  carried.commit();
  return value;
}

// ---------------------------------------------------------------------------
// rows
// ---------------------------------------------------------------------------

/** A row as it is being built: the report's row, and whether the caller's declared contract requires it (P6). */
interface Built {
  row: MeasureRow;
  required: boolean;
}

function nearBoundOf(value: number | null, bound: MeasureRow['bound'], increment: number): RasterSensitivity['nearBound'] {
  if (value === null || bound === null) return 'clear';
  const gap = Math.abs(value - bound.value);
  if (gap === 0) return 'at-bound';
  return gap <= increment ? 'within-increment' : 'clear';
}

/** Pass or fail against an inclusive bound — equality passes. */
function judged(value: number, bound: { op: '<=' | '>='; value: number }): 'pass' | 'fail' {
  return (bound.op === '<=' ? value <= bound.value : value >= bound.value) ? 'pass' : 'fail';
}

const NOTHING_WORSE: WorstSample = { at: {} };

interface RowSpec {
  code: string;
  region: string | null;
  unit: MeasureRow['unit'];
  attachment: AttachmentRef;
}

function measuredRow(spec: RowSpec, value: number, bound: MeasureRow['bound'], worst: WorstSample, required: boolean): Built {
  return {
    row: {
      code: spec.code,
      object: { attachment: spec.attachment, region: spec.region },
      state: bound === null ? 'undeclared' : judged(value, bound),
      value,
      bound,
      unit: spec.unit,
      worst,
      reason: null,
    },
    required: required && bound !== null,
  };
}

function unmeasuredRow(spec: RowSpec, state: 'refused' | 'not-measurable', reason: string, required: boolean): Built {
  return {
    row: { code: spec.code, object: { attachment: spec.attachment, region: spec.region }, state, value: null, bound: null, unit: spec.unit, worst: null, reason },
    required,
  };
}

/** The raster fields of a row: its art, and the grid and increment its value is quantised on (correction 2). */
function withRaster(built: Built, art: NonNullable<MeasureRow['art']>, grid: RasterSensitivity['grid'], increment: number): Built {
  const row = built.row;
  row.art = art;
  row.raster = {
    grid,
    spatialQuantum: 1 / grid.pageScale,
    valueIncrement: increment,
    nearBound: nearBoundOf(row.value, row.bound, increment),
  };
  return built;
}

/** Row order (§2): code, then region (the attachment's own row first), then the gated fill before the labelled legacy one. */
function compareRows(a: MeasureRow, b: MeasureRow): number {
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  const ra = a.object.region;
  const rb = b.object.region;
  if (ra !== rb) {
    if (ra === null) return -1;
    if (rb === null) return 1;
    return ra < rb ? -1 : 1;
  }
  const ca = a.art?.connectivity ?? 0;
  const cb = b.art?.connectivity ?? 0;
  return cb - ca;
}

// ---------------------------------------------------------------------------
// the operation
// ---------------------------------------------------------------------------

/**
 * Measure one mesh against the art its attachment draws and the bounds the
 * caller declared — §4's geometry rows, no motion. Throws a
 * `MeshReductionError` for an input §1 refuses; reports a source whose
 * triangles are not one closed loop rather than throwing, with `sourceCounts`
 * null and an `unsupported-topology` termination saying why (correction 3: a
 * count is never invented).
 */
export function measureMeshQuality(input: MeshMeasureInput): MeshQualityReport {
  validateInput(input);
  return measureValidated(input, artRastersOf(input.art), null);
}

/**
 * `measureMeshQuality` over art rasters the caller already holds
 * (`src/meshrasters.ts`) — what `reduceMesh` calls for every measurement of
 * one call, so the quantities of the art alone are computed once per call
 * rather than once per step (issue #1240). The report is the one
 * `measureMeshQuality` returns for the same input, byte for byte; rasters
 * taken from another art are refused (`REDUCE_ART_RASTERS_MISMATCH`), never
 * read.
 *
 * Internal: it is on `rig-c/mesh` only because that entry re-exports this
 * module with `export *`, and a symbol that is merely exported is not promised
 * (RELEASING.md, *The import surface*).
 */
export function measureMeshQualityWith(input: MeshMeasureInput, rasters: ArtRasters): MeshQualityReport {
  validateInput(input);
  checkArtRasters(input, rasters);
  return measureValidated(input, rasters, null);
}

/**
 * `measureMeshQualityWith` carried from the last measurement the same
 * `StepRasters` made (`src/meshrasters.ts`, issue #1246) — what `reduceMesh`
 * calls for each step, so a step redraws only the triangles its removal
 * changed, redoes the distance transform only where the coverage flipped, and
 * reads the outline rows again only when the outline moved. The report is the
 * one `measureMeshQuality` returns for the same input, byte for byte; rasters
 * taken from another art are refused as `measureMeshQualityWith` refuses them.
 *
 * Internal, as `measureMeshQualityWith` is.
 */
export function measureMeshQualityStep(input: MeshMeasureInput, steps: StepRasters): MeshQualityReport {
  validateInput(input);
  checkArtRasters(input, steps.rasters);
  return measureValidated(input, steps.rasters, steps);
}

/**
 * The coverage reading of a triangle set measured on its own — the full path:
 * every triangle drawn (`rasteriseTriangles`), the whole distance transform,
 * and the covered art and islands counted over every pixel.
 */
function coverageOf(onGrid: Array<[number, number]>, triangles: number[], w: number, h: number, rasters: ArtRasters): CoverageReading {
  const artBits = rasters.artBits();
  const covered = rasteriseTriangles(onGrid, triangles, w, h);
  let coveredArt = 0;
  for (let i = 0; i < artBits.length; i++) if (artBits[i] && covered[i]) coveredArt++;
  const toCovered = squaredDistanceToSet(covered, w, h);
  const anyCovered = covered.some((c) => c === 1);
  let undercutAt = -1;
  let undercutSq = 0;
  for (let i = 0; i < artBits.length; i++) {
    if (!artBits[i] || covered[i]) continue;
    if (undercutAt === -1 || toCovered[i] > undercutSq) {
      undercutAt = i;
      undercutSq = toCovered[i];
    }
  }
  const { label } = rasters.islands();
  const touched = new Set<number>();
  for (let i = 0; i < label.length; i++) if (label[i] && covered[i]) touched.add(label[i]);
  const secondIsland = touched.size >= 2 ? [...touched].sort((p, q) => p - q)[1] : 0;
  const silhouette = (connectivity: 4 | 8): SilhouetteReading => {
    const fills = rasters.fills();
    const filled = connectivity === 8 ? fills.fill8 : fills.fill4;
    const toFilled = rasters.toFilled(connectivity);
    let overAt = -1;
    let overSq = 0;
    let holes = 0;
    let holeAt = -1;
    for (let i = 0; i < covered.length; i++) {
      if (!covered[i]) continue;
      if (!filled[i]) {
        if (overAt === -1 || toFilled[i] > overSq) {
          overAt = i;
          overSq = toFilled[i];
        }
      } else if (!artBits[i]) {
        holes++;
        if (holeAt === -1) holeAt = i;
      }
    }
    return { overAt, overSq, holes, holeAt };
  };
  return { covered, toCovered, coveredArt, anyCovered, undercut: { at: undercutAt, sq: undercutSq }, silhouette, islandsTouched: touched.size, secondIsland };
}

/**
 * Rasters are read only for the art they were taken from: the same mask
 * array, mask size, threshold and frame. The first field that differs is
 * refused by name, with the value the rasters were taken at and the value the
 * input requires.
 */
function checkArtRasters(input: MeshMeasureInput, rasters: ArtRasters): void {
  const want = input.art;
  const got = rasters.art;
  if (got === want) return;
  const who = `attachment ${nameOf(input.attachment)}`;
  const differs = (field: string, found: string, required: string): never =>
    refuse('REDUCE_ART_RASTERS_MISMATCH', `${who}: the art rasters were taken at ${field} ${found}; required ${field} ${required}, the input's — rasters are read only for the art they were taken from`);
  const size = (m: AlphaMask | undefined): string => (m === undefined ? 'undefined' : `${m.width}x${m.height}`);
  if (size(got.mask) !== size(want.mask)) differs('art.mask size', size(got.mask), size(want.mask));
  if (got.threshold !== want.threshold) differs('art.threshold', JSON.stringify(got.threshold), JSON.stringify(want.threshold));
  for (const field of ['pageScale', 'width', 'height'] as const) {
    if (got.frame?.[field] !== want.frame[field]) differs(`art.frame.${field}`, JSON.stringify(got.frame?.[field]), JSON.stringify(want.frame[field]));
  }
  if (got.mask.alpha !== want.mask.alpha) differs('art.mask.alpha', 'another array', 'the input\'s own array (the same object)');
}

/** The measurement proper, over an input `validateInput` accepted and rasters taken from its art. */
function measureValidated(input: MeshMeasureInput, rasters: ArtRasters, steps: StepRasters | null): MeshQualityReport {
  rasters.tally.uses++;
  const { attachment, art, source, targets } = input;
  const { mask, threshold, frame } = art;
  const scale = frame.pageScale;
  const effective = effectiveOf(input);
  const report = (sourceCounts: MeshCounts | null, candidate: CandidateReport, termination: Termination | null): MeshQualityReport => ({
    spec: MESH_QUALITY_REPORT_SPEC,
    operation: 'measure',
    effective,
    poser: null,
    motionRequired: false,
    sourceCounts,
    reference: null,
    candidates: [candidate],
    termination,
  });

  // The outline the triangles state — or the reason there is none.
  const n = source.points.length;
  let outline: MeshOutline;
  try {
    outline = traceOutline(n, source.triangles);
    if (outline.hull !== source.hull) {
      throw new MeshError(`source.hull says ${source.hull} and the triangles' outline has ${outline.hull} vertices`);
    }
    checkHullOrder(outline, n);
  } catch (err) {
    if (!(err instanceof MeshError)) throw err;
    const detail = `attachment ${nameOf(attachment)}: ${err.message}; required one closed outline listed first, in order (traceOutline, checkHullOrder)`;
    return report(null, { id: input.id, counts: null, geometry: null, motion: null, accepted: false }, { reason: 'unsupported-topology', code: 'REDUCE_SOURCE_NOT_ONE_LOOP', detail });
  }

  const counts = countsOf(source, outline);
  const rows: Built[] = [];
  const spec = (code: string, unit: MeasureRow['unit'], region: string | null = null): RowSpec => ({ code, unit, region, attachment });
  const points: Pt[] = source.points;
  const hullPolygon: Pt[] = outline.walk.map((v) => points[v]);

  // --- raster rows ---------------------------------------------------------
  const w = mask.width;
  const h = mask.height;
  const grid = { width: w, height: h, pageScale: scale };
  const artBits = rasters.artBits();
  const artCount = rasters.artCount();
  const onGrid: Array<[number, number]> = source.points.map(([x, y]) => [x * scale, y * scale]);
  const fit = targets.artFit;
  const pxIncrement = 1 / scale;
  const rasterArt = (connectivity: 4 | 8 | null): NonNullable<MeasureRow['art']> => ({ threshold, connectivity, samples: artCount });
  const pixelOf = (i: number): [number, number] => [i % w, Math.floor(i / w)];
  if (artCount < input.minArtSamples) {
    const why = `attachment ${nameOf(attachment)} has ${artCount} art sample(s) at alpha >= ${threshold}; required at least ${input.minArtSamples} (minArtSamples, P9) — a row over fewer is not a measurement`;
    rows.push(withRaster(unmeasuredRow(spec('MQ_COVERAGE', 'fraction'), 'not-measurable', why, fit !== null), rasterArt(null), grid, artCount === 0 ? 1 : 1 / artCount));
    rows.push(withRaster(unmeasuredRow(spec('MQ_OVERSHOOT', 'px'), 'not-measurable', why, fit !== null && fit.maxOvershoot !== null), rasterArt(8), grid, pxIncrement));
    rows.push(withRaster(unmeasuredRow(spec('MQ_UNDERCUT', 'px'), 'not-measurable', why, fit !== null && fit.maxUndercut !== null), rasterArt(null), grid, pxIncrement));
    rows.push(withRaster(unmeasuredRow(spec('MQ_HOLES', 'count'), 'not-measurable', why, false), rasterArt(8), grid, 1));
    rows.push(withRaster(unmeasuredRow(spec('MQ_ISLANDS', 'count'), 'not-measurable', why, false), rasterArt(4), grid, 1));
  } else {
    // Coverage — `measureAuthoredMeshFit`'s, unchanged: art pixel centres a triangle covers. A reduction step
    // carries it from its last measurement (`StepRasters`), which reads the same values.
    const reading = steps === null ? coverageOf(onGrid, source.triangles, w, h, rasters) : steps.coverage(onGrid, source.triangles);
    const { coveredArt, anyCovered } = reading;
    // Undercut: the furthest uncovered art pixel from the covered set. Its pixel is coverage's worst too.
    const { at: undercutAt, sq: undercutSq } = reading.undercut;
    const missingWorst: WorstSample = undercutAt === -1 ? NOTHING_WORSE : { at: { pixel: pixelOf(undercutAt) } };
    rows.push(
      withRaster(
        measuredRow(spec('MQ_COVERAGE', 'fraction'), coveredArt / artCount, fit === null ? null : { op: '>=', value: fit.minCoverage }, missingWorst, true),
        rasterArt(null),
        grid,
        1 / artCount,
      ),
    );
    const undercutSpec = spec('MQ_UNDERCUT', 'px');
    rows.push(
      withRaster(
        !anyCovered
          ? unmeasuredRow(undercutSpec, 'not-measurable', `attachment ${nameOf(attachment)}: the triangles cover no pixel centre of the ${w}x${h} grid, so no art pixel has a distance to a covered one`, fit !== null && fit.maxUndercut !== null)
          : measuredRow(undercutSpec, r6(Math.sqrt(undercutSq) / scale), fit === null || fit.maxUndercut === null ? null : { op: '<=', value: fit.maxUndercut }, missingWorst, true),
        rasterArt(null),
        grid,
        pxIncrement,
      ),
    );

    // Overshoot and holes against the filled silhouette: 8-connected background over ALL art (P12) — and,
    // where the legacy 4-connected fill differs (a diagonal pinch), the labelled 4-connected reading beside it.
    const fillsDiffer = rasters.fills().differ;
    const silhouetteRows = (connectivity: 4 | 8, gated: boolean): void => {
      const { overAt, overSq, holes, holeAt } = reading.silhouette(connectivity);
      const bound = gated && fit !== null && fit.maxOvershoot !== null ? { op: '<=' as const, value: fit.maxOvershoot } : null;
      rows.push(
        withRaster(
          measuredRow(spec('MQ_OVERSHOOT', 'px'), r6(Math.sqrt(overSq) / scale), bound, overAt === -1 ? NOTHING_WORSE : { at: { pixel: pixelOf(overAt) } }, gated),
          rasterArt(connectivity),
          grid,
          pxIncrement,
        ),
      );
      rows.push(withRaster(measuredRow(spec('MQ_HOLES', 'count'), holes, null, holeAt === -1 ? NOTHING_WORSE : { at: { pixel: pixelOf(holeAt) } }, false), rasterArt(connectivity), grid, 1));
    };
    silhouetteRows(8, true);
    if (fillsDiffer) silhouetteRows(4, false);

    // Islands: the 4-connected art islands (the tracer's, `labelIslands`) the triangles cover a pixel of.
    const { label } = rasters.islands();
    const joinedAt = reading.islandsTouched >= 2 ? label.indexOf(reading.secondIsland) : -1;
    rows.push(
      withRaster(
        measuredRow(spec('MQ_ISLANDS', 'count'), reading.islandsTouched, null, joinedAt === -1 ? NOTHING_WORSE : { at: { pixel: pixelOf(joinedAt) } }, false),
        { threshold, connectivity: 4, samples: artCount },
        grid,
        1,
      ),
    );
  }

  // --- the outline against a reference, and against the traced art -------------------------
  const boundarySpec = spec('MQ_BOUNDARY_DEVIATION', 'px');
  const edgeOfHull = (i: number): [number, number] => [outline.walk[i], outline.walk[(i + 1) % outline.walk.length]];
  if (input.referenceHull === null) {
    rows.push(unmeasuredRow(boundarySpec, 'not-measurable', `attachment ${nameOf(attachment)}: no referenceHull was given, so there is no polygon to measure the hull's deviation from`, targets.maxBoundaryDeviation !== null));
  } else {
    const reference = input.referenceHull;
    const hd = steps === null ? hausdorff(hullPolygon, reference) : steps.outline('reference', hullPolygon, reference, (memo) => hausdorffCarried(memo, hullPolygon, reference, steps));
    const bound = targets.maxBoundaryDeviation === null ? null : { op: '<=' as const, value: targets.maxBoundaryDeviation };
    rows.push(measuredRow(boundarySpec, r6(hd.d), bound, hd.d === 0 ? NOTHING_WORSE : { at: { edge: edgeOfHull(hd.candidateEdge) } }, true));
  }
  const traceSpec = spec('MQ_TRACE_DEVIATION', 'px');
  const traced = rasters.traced();
  if ('outline' in traced) {
    const tracedOutline = traced.outline;
    const hd = steps === null ? hausdorff(hullPolygon, tracedOutline) : steps.outline('traced', hullPolygon, tracedOutline, (memo) => hausdorffCarried(memo, hullPolygon, tracedOutline, steps));
    rows.push(measuredRow(traceSpec, r6(hd.d), null, hd.d === 0 ? NOTHING_WORSE : { at: { edge: edgeOfHull(hd.candidateEdge) } }, false));
  } else {
    rows.push(unmeasuredRow(traceSpec, 'not-measurable', `attachment ${nameOf(attachment)}: the tracer refused the art at alpha >= ${threshold}: ${traced.refused}`, false));
  }

  // --- triangles: sign, degeneracy, angle --------------------------------------------------
  const world: number[] = [];
  for (const [x, y] of points) world.push(x, cropToSpineY(y, frame.height));
  const areas = triangleAreas(world, source.triangles);
  const band = areaBand(areas, world);
  let flipped = 0;
  let flippedWorst = -1;
  let degenerate = 0;
  let degenerateWorst = -1;
  areas.forEach((a, t) => {
    if (Math.abs(a) <= band) {
      degenerate++;
      if (degenerateWorst === -1 || Math.abs(a) < Math.abs(areas[degenerateWorst])) degenerateWorst = t;
    } else if (a < 0) {
      flipped++;
      if (flippedWorst === -1 || a < areas[flippedWorst]) flippedWorst = t;
    }
  });
  rows.push(measuredRow(spec('MQ_ORIENTATION', 'count'), flipped, { op: '<=', value: 0 }, flippedWorst === -1 ? NOTHING_WORSE : { at: { triangle: flippedWorst } }, true));
  rows.push(measuredRow(spec('MQ_DEGENERATE', 'count'), degenerate, { op: '<=', value: 0 }, degenerateWorst === -1 ? NOTHING_WORSE : { at: { triangle: degenerateWorst } }, true));
  let smallest = Infinity;
  let smallestAt = 0;
  for (let t = 0; t * 3 + 2 < source.triangles.length; t++) {
    const corner = [points[source.triangles[t * 3]], points[source.triangles[t * 3 + 1]], points[source.triangles[t * 3 + 2]]];
    for (let k = 0; k < 3; k++) {
      const o = corner[k];
      const p = corner[(k + 1) % 3];
      const q = corner[(k + 2) % 3];
      const ux = p[0] - o[0];
      const uy = p[1] - o[1];
      const vx = q[0] - o[0];
      const vy = q[1] - o[1];
      const angle = (Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy) * 180) / Math.PI;
      if (angle < smallest) {
        smallest = angle;
        smallestAt = t;
      }
    }
  }
  rows.push(
    measuredRow(spec('MQ_MIN_ANGLE', 'degrees'), r6(smallest), targets.minAngle === undefined ? null : { op: '>=', value: targets.minAngle }, { at: { triangle: smallestAt } }, true),
  );

  // --- regions (§5) ------------------------------------------------------------------------
  rows.push(...regionRows(input, outline, hullPolygon, rasters, steps));

  const ordered = rows.slice().sort((a, b) => compareRows(a.row, b.row));
  const geometry = sectionOf(ordered);
  const accepted = geometry.verdict === 'pass';
  return report(counts, { id: input.id, counts, geometry, motion: null, accepted }, null);
}

/** What one source states about itself: hull and interior from the outline, bindings from the weights. */
function countsOf(source: SourceMesh, outline: MeshOutline): MeshCounts {
  const bindings = source.weights === null ? 0 : source.weights.reduce((s, v) => s + v.length, 0);
  const maxInfluences = source.weights === null ? 0 : source.weights.reduce((m, v) => Math.max(m, v.length), 0);
  return {
    boundaryVertices: outline.hull,
    interiorVertices: source.points.length - outline.hull,
    triangles: source.triangles.length / 3,
    bindings,
    maxInfluences,
  };
}

/**
 * The section's figures and verdict (§2, P6): `measured` is pass + fail; the
 * verdict is `fail` when a required row failed, `pass` only when every required
 * row passed and at least one row did, and `not-measured` otherwise — which is
 * what a required row that could not be measured, or was refused, leaves.
 */
function sectionOf(built: readonly Built[]): EvidenceSection {
  const summary = { pass: 0, fail: 0, undeclared: 0, refused: 0, notMeasurable: 0, measured: 0 };
  for (const { row } of built) {
    if (row.state === 'pass') summary.pass++;
    else if (row.state === 'fail') summary.fail++;
    else if (row.state === 'undeclared') summary.undeclared++;
    else if (row.state === 'refused') summary.refused++;
    else summary.notMeasurable++;
  }
  summary.measured = summary.pass + summary.fail;
  const required = built.filter((b) => b.required);
  let verdict: EvidenceSection['verdict'];
  if (required.some((b) => b.row.state === 'fail')) verdict = 'fail';
  else if (required.every((b) => b.row.state === 'pass') && summary.pass > 0) verdict = 'pass';
  else verdict = 'not-measured';
  return { rows: built.map((b) => b.row), summary, verdict };
}

// ---------------------------------------------------------------------------
// §5 — regions
// ---------------------------------------------------------------------------

/** A region's own refusal (§2's `refused`: this measurement's input is invalid), or null when it is measurable. */
function regionRefusal(region: RefinementRegion, pageScale: number, who: string, steps: StepRasters | null): { code: string; message: string } | null {
  const numbers: Array<[string, unknown]> = [
    ['maxEdgeLength', region.maxEdgeLength],
    ['transition', region.transition],
    ['grade', region.grade],
    ...region.polygon.flatMap((p, i): Array<[string, unknown]> => (Array.isArray(p) ? [[`polygon[${i}][0]`, p[0]], [`polygon[${i}][1]`, p[1]]] : [[`polygon[${i}]`, p]])),
  ];
  for (const [field, value] of numbers) {
    if (!isFiniteNumber(value)) return { code: 'REGION_NOT_FINITE', message: `${who}, region "${region.name}": ${field} is ${String(value)}; required a finite number` };
  }
  if (region.transition < 0) return { code: 'REGION_TRANSITION_NEGATIVE', message: `${who}, region "${region.name}": transition is ${region.transition} px; required 0 or more (0 is a hard edge)` };
  if (region.grade < 0) return { code: 'REGION_GRADE_NEGATIVE', message: `${who}, region "${region.name}": grade is ${region.grade} px per px; required 0 or more` };
  if (region.maxEdgeLength < 1 / pageScale) {
    return {
      code: 'REGION_BOUND_BELOW_GRID',
      message: `${who}, region "${region.name}": maxEdgeLength is ${region.maxEdgeLength} px; required at least one texel, ${r6(1 / pageScale)} px at pageScale ${pageScale}`,
    };
  }
  // A function of the polygon alone: a reduction step has it handed back by its `StepRasters` (issue #1253).
  const crossing = steps === null ? findSelfIntersection(region.polygon) : steps.polygonCrossing(region.polygon, () => findSelfIntersection(region.polygon));
  if (crossing !== null) {
    return {
      code: 'REGION_SELF_INTERSECTS',
      message: `${who}, region "${region.name}": polygon edges ${crossing[0]} and ${crossing[1]} meet; required a strictly simple polygon (findSelfIntersection)`,
    };
  }
  return null;
}

interface Edge {
  a: number;
  b: number;
  length: number;
}

/**
 * The rows of every region: `MQ_MAX_EDGE` (§5's `L(R)`), `MQ_TRANSITION` (its
 * graded band, only where the band has width) and `MQ_FILL_DISTANCE` (`h(R)`,
 * sampled, informational).
 *
 * Which edges a region holds is `edgeIsHeldByRegion`'s answer and nothing
 * else's: an edge that only touches the band's outer boundary at one point,
 * from outside, is not held (spine-parts#126). One bound per edge, the smallest
 * applicable anywhere on it (P16): `L0` of every region whose closed polygon it
 * meets, and `L0 + grade·d` of every other region that holds it, `d` its
 * distance from that region. A row's value is the edge whose
 * length most exceeds its own bound — so the row fails exactly when some edge
 * it covers is over — and the row names that edge and that bound.
 *
 * `MQ_FILL_DISTANCE` reads the art pixels whose centre lies in the region's
 * closed polygon, a function of the art and the polygon alone: a reduction
 * step has it handed back by its `StepRasters` (`regionPixels`, issue #1253)
 * rather than testing every art pixel against the polygon again.
 */
function regionRows(input: MeshMeasureInput, outline: MeshOutline, hullPolygon: readonly Pt[], rasters: ArtRasters, steps: StepRasters | null): Built[] {
  const { attachment, source, art } = input;
  const who = `attachment ${nameOf(attachment)}`;
  const scale = art.frame.pageScale;
  const points: Pt[] = source.points;
  const out: Built[] = [];
  const spec = (code: string, unit: MeasureRow['unit'], region: string): RowSpec => ({ code, unit, region, attachment });
  const encoded = meshEdges(points.length, source.triangles, outline.hull);
  const edges: Edge[] = [];
  for (let i = 0; i < encoded.length; i += 2) {
    const a = encoded[i] / 2;
    const b = encoded[i + 1] / 2;
    edges.push({ a: Math.min(a, b), b: Math.max(a, b), length: Math.hypot(points[b][0] - points[a][0], points[b][1] - points[a][1]) });
  }
  edges.sort((p, q) => p.a - q.a || p.b - q.b);

  // Each edge's answers for a region: computed here, or — on a reduction step — carried by its `StepRasters` from
  // the last reading of the region for an edge with the same two ends (`regionEdges`, issue #1253).
  const readings = new Map<RefinementRegion, RegionEdgeReading | null>();
  const readingOf = (region: RefinementRegion): RegionEdgeReading | null => {
    if (!readings.has(region)) readings.set(region, steps === null ? null : steps.regionEdges(region.polygon, region.transition));
    return readings.get(region)!;
  };
  const meetsOf = (region: RefinementRegion, e: Edge): boolean => {
    const record = readingOf(region)?.entry(points[e.a], points[e.b]);
    if (record === undefined) return segmentMeetsPolygon(points[e.a], points[e.b], region.polygon);
    if (record.meets === undefined) record.meets = segmentMeetsPolygon(points[e.a], points[e.b], region.polygon);
    return record.meets;
  };
  const heldOf = (region: RefinementRegion, e: Edge): number | null => {
    const held = (): number | null => (edgeIsHeldByRegion(points[e.a], points[e.b], region) ? segmentToPolygon(points[e.a], points[e.b], region.polygon) : null);
    const record = readingOf(region)?.entry(points[e.a], points[e.b]);
    if (record === undefined) return held();
    if (record.held === undefined) record.held = held();
    return record.held;
  };

  // Which regions are measurable, and the one refusal of each that is not.
  const live: RefinementRegion[] = [];
  const refusals = new Map<string, string>();
  for (const region of input.targets.regions) {
    let refusal = regionRefusal(region, scale, who, steps);
    if (refusal === null) {
      const poly: Pt[] = region.polygon;
      const meets = edges.some((e) => meetsOf(region, e)) || poly.some((p) => inClosedPolygon(p, hullPolygon));
      if (!meets) {
        refusal = {
          code: 'REGION_OUTSIDE_ART',
          message: `${who}, region "${region.name}": the polygon does not meet the mesh's hull anywhere, so clipped to it the region is empty; required a region that meets the hull`,
        };
      }
    }
    if (refusal === null) live.push(region);
    else refusals.set(region.name, `${refusal.code}: ${refusal.message}`);
  }

  /**
   * Per measurable region, per edge (in `edges` order): the edge's distance
   * from the closed polygon when the region holds it (`edgeIsHeldByRegion`,
   * the one definition the refinement reads too), null when it does not.
   */
  const holds = new Map<RefinementRegion, Array<number | null>>();
  for (const region of live) {
    holds.set(
      region,
      edges.map((e) => heldOf(region, e)),
    );
  }
  const edgeIndex = new Map(edges.map((e, i) => [e, i]));

  /** Every bound that applies to an edge, from every measurable region that holds it, and the smallest. */
  const boundOf = (e: Edge): number | null => {
    let bound: number | null = null;
    const i = edgeIndex.get(e)!;
    for (const region of live) {
      const d = holds.get(region)![i];
      if (d === null) continue;
      const here = d === 0 ? region.maxEdgeLength : r6(region.maxEdgeLength + region.grade * d);
      if (bound === null || here < bound) bound = here;
    }
    return bound;
  };

  /** The worst edge of a set: the largest length over its own bound, ties to the smaller (a, b). */
  const worstOf = (set: readonly Edge[]): { edge: Edge; bound: number } | null => {
    let best: { edge: Edge; bound: number; excess: number } | null = null;
    for (const e of set) {
      const bound = boundOf(e);
      if (bound === null) continue;
      const excess = r6(e.length) - bound;
      if (best === null || excess > best.excess) best = { edge: e, bound, excess };
    }
    return best === null ? null : { edge: best.edge, bound: best.bound };
  };

  const floorOf = (name: string): number => input.regionArtSamples.find((f) => f.region === name)!.minArtSamples;
  const { mask, threshold } = art;
  const artBits = rasters.artBits();

  for (const region of input.targets.regions) {
    const refused = refusals.get(region.name);
    if (refused !== undefined) {
      out.push(unmeasuredRow(spec('MQ_MAX_EDGE', 'px', region.name), 'refused', refused, true));
      out.push(unmeasuredRow(spec('MQ_TRANSITION', 'px', region.name), 'refused', refused, true));
      out.push(unmeasuredRow(spec('MQ_FILL_DISTANCE', 'px', region.name), 'refused', refused, false));
      continue;
    }
    const poly: Pt[] = region.polygon;
    const held = holds.get(region)!;
    const inside = edges.filter((_, i) => held[i] === 0);
    const maxSpec = spec('MQ_MAX_EDGE', 'px', region.name);
    const inWorst = worstOf(inside);
    if (inWorst === null) {
      out.push(unmeasuredRow(maxSpec, 'not-measurable', `${who}, region "${region.name}": no triangle edge meets the closed polygon — it lies inside one triangle — so L(R) is a maximum over no edge`, true));
    } else {
      out.push(measuredRow(maxSpec, r6(inWorst.edge.length), { op: '<=', value: inWorst.bound }, { at: { edge: [inWorst.edge.a, inWorst.edge.b] } }, true));
    }
    if (region.transition > 0) {
      const banded = edges.filter((_, i) => held[i] !== null && held[i]! > 0);
      const bandWorst = worstOf(banded);
      const transitionSpec = spec('MQ_TRANSITION', 'px', region.name);
      if (bandWorst === null) {
        out.push(unmeasuredRow(transitionSpec, 'not-measurable', `${who}, region "${region.name}": no triangle edge lies in the ${region.transition} px band outside the polygon`, true));
      } else {
        out.push(measuredRow(transitionSpec, r6(bandWorst.edge.length), { op: '<=', value: bandWorst.bound }, { at: { edge: [bandWorst.edge.a, bandWorst.edge.b] } }, true));
      }
    }

    // h(R): art pixel centres inside the region clipped to the hull, each to its nearest mesh vertex. The art
    // pixels inside the region come in ascending order, so the scan below visits what a scan of every art pixel
    // would keep, in the same order.
    const centreOf = (i: number): Pt => [((i % mask.width) + 0.5) / scale, (Math.floor(i / mask.width) + 0.5) / scale];
    const inRegion = (): Int32Array => {
      // `inClosedPolygon` of every art pixel centre, by scanline (`closedPolygonCentres`, issue #1263).
      const inside = closedPolygonCentres(poly, mask.width, mask.height, scale);
      const kept: number[] = [];
      for (let i = 0; i < artBits.length; i++) if (artBits[i] && inside[i]) kept.push(i);
      return Int32Array.from(kept);
    };
    const regionPixels = steps === null ? inRegion() : steps.regionPixels(poly, inRegion);
    let count = 0;
    let worst = -1;
    let worstAt = -1;
    const visit = (i: number, nearest: number): void => {
      count++;
      if (nearest > worst) {
        worst = nearest;
        worstAt = i;
      }
    };
    const distance = (i: number, p: Pt): number => {
      const centre = centreOf(i);
      return Math.hypot(p[0] - centre[0], p[1] - centre[1]);
    };
    if (steps === null) {
      for (const i of regionPixels) {
        const centre = centreOf(i);
        if (!inClosedPolygon(centre, hullPolygon)) continue;
        let nearest = Infinity;
        for (const p of points) nearest = Math.min(nearest, Math.hypot(p[0] - centre[0], p[1] - centre[1]));
        visit(i, nearest);
      }
    } else {
      // A reduction step: the pixels in the hull and their nearest distances carried from the last reading (issue #1253).
      const carried = steps.regionFill(poly, { pixels: regionPixels, centre: centreOf, hull: hullPolygon, points, inHull: (i) => inClosedPolygon(centreOf(i), hullPolygon), distance });
      for (let j = 0; j < carried.inside.length; j++) visit(carried.inside[j], carried.nearest[j]);
    }
    const fillSpec = spec('MQ_FILL_DISTANCE', 'px', region.name);
    const floor = floorOf(region.name);
    const sampled = { threshold, connectivity: null, samples: count };
    const sampling = { domain: 'art pixel centres inside the region and the hull', count };
    let fill: Built;
    if (count < floor) {
      fill = unmeasuredRow(fillSpec, 'not-measurable', `${who}, region "${region.name}" holds ${count} art sample(s) inside the hull at alpha >= ${threshold}; required at least ${floor} (P9)`, false);
    } else {
      fill = measuredRow(fillSpec, r6(worst), null, { at: { pixel: [worstAt % mask.width, Math.floor(worstAt / mask.width)] } }, false);
    }
    fill.row.art = sampled;
    fill.row.sampling = sampling;
    out.push(fill);
  }
  return out;
}

// ---------------------------------------------------------------------------
// the echo, and the document's text
// ---------------------------------------------------------------------------

function effectiveOf(input: MeshMeasureInput): EffectiveSettings {
  const { art } = input;
  return {
    preset: input.preset,
    attachments: [
      {
        attachment: input.attachment,
        threshold: art.threshold,
        // A measurement states the threshold it was taken at and claims nothing at any other (Thresholds).
        finalThreshold: art.threshold,
        frame: art.frame,
        maskSize: [art.mask.width, art.mask.height],
        minArtSamples: input.minArtSamples,
        regions: input.targets.regions.map((r) => ({ name: r.name, minArtSamples: input.regionArtSamples.find((f) => f.region === r.name)!.minArtSamples })),
      },
    ],
    sourceBounds: null,
    referenceArtFit: null,
    candidateArtFit: null,
    targets: input.targets,
    referenceHull: input.referenceHull,
    motionBounds: null,
    protect: input.protect,
    influences: input.influences,
    boneOrder: input.boneOrder,
    schedule: null,
    budget: null,
  };
}

// Every object of the document is rebuilt below in the order its type states
// its keys, so the bytes depend on the values alone — never on the key order
// an input object happened to be built in (A18's standard; `build-report/1`'s
// precedent in `src/assertions/report.ts`). An optional key is written only
// when it is present.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const pair = (p: readonly [number, number]): Json => [p[0], p[1]];
const attachmentJson = (a: AttachmentRef): Json => ({ skin: a.skin, slot: a.slot, attachment: a.attachment });
const fitJson = (f: ArtFitBounds | null): Json => (f === null ? null : { minCoverage: f.minCoverage, maxOvershoot: f.maxOvershoot, maxUndercut: f.maxUndercut });
const frameJson = (f: SourceFrame): Json => ({ space: f.space, width: f.width, height: f.height, pageScale: f.pageScale, conversion: f.conversion });

function regionJson(r: RefinementRegion): Json {
  return {
    name: r.name,
    polygon: r.polygon.map(pair),
    maxEdgeLength: r.maxEdgeLength,
    transition: r.transition,
    grade: r.grade,
    approximation: r.approximation === null ? null : { from: r.approximation.from, policy: r.approximation.policy, maxError: r.approximation.maxError },
  };
}

function targetsJson(t: ReductionTargets | MeasureTargets | null): Json {
  if (t === null) return null;
  const out: { [key: string]: Json } = { artFit: fitJson(t.artFit), maxBoundaryDeviation: t.maxBoundaryDeviation };
  if (t.minAngle !== undefined) out.minAngle = t.minAngle;
  out.regions = t.regions.map(regionJson);
  return out;
}

function protectJson(p: ProtectedFeatures | null): Json {
  if (p === null) return null;
  return {
    hull: p.hull,
    vertices: [...p.vertices],
    edges: p.edges.map(pair),
    regionBoundaries: [...p.regionBoundaries],
    weightJump: p.weightJump,
    influences: [...p.influences],
  };
}

function motionBoundsJson(b: MotionBounds | null): Json {
  if (b === null) return null;
  const out: { [key: string]: Json } = { maxLocalDeformation: b.maxLocalDeformation };
  if (b.maxStretch !== undefined) out.maxStretch = b.maxStretch;
  if (b.minStretch !== undefined) out.minStretch = b.minStretch;
  return out;
}

function scheduleJson(s: MotionSchedule | null): Json {
  if (s === null) return null;
  return {
    frames: s.frames.map((f): Json => (f === 'setup' ? 'setup' : 'times' in f ? { animation: f.animation, times: [...f.times] } : { animation: f.animation, fps: f.fps })),
    phases: [...s.phases],
    physics: s.physics.mode === 'none' ? { mode: 'none' } : { mode: 'step', dt: s.physics.dt, warmupSteps: s.physics.warmupSteps },
    selection: [...s.selection],
  };
}

function effectiveJson(e: EffectiveSettings): Json {
  return {
    preset: e.preset === null ? null : { name: e.preset.name, version: e.preset.version },
    attachments: e.attachments.map((a) => ({
      attachment: attachmentJson(a.attachment),
      threshold: a.threshold,
      finalThreshold: a.finalThreshold,
      frame: frameJson(a.frame),
      maskSize: pair(a.maskSize),
      minArtSamples: a.minArtSamples,
      regions: a.regions.map((r): Json => (r.polygon === undefined ? { name: r.name, minArtSamples: r.minArtSamples } : { name: r.name, minArtSamples: r.minArtSamples, polygon: r.polygon.map(pair) })),
    })),
    sourceBounds: fitJson(e.sourceBounds),
    referenceArtFit: fitJson(e.referenceArtFit),
    candidateArtFit: fitJson(e.candidateArtFit),
    targets: targetsJson(e.targets),
    referenceHull: e.referenceHull === null ? null : e.referenceHull.map(pair),
    motionBounds: motionBoundsJson(e.motionBounds),
    protect: protectJson(e.protect),
    influences: e.influences === null ? null : { maxInfluences: e.influences.maxInfluences, minWeight: e.influences.minWeight },
    boneOrder: e.boneOrder === null ? null : [...e.boneOrder],
    schedule: scheduleJson(e.schedule),
    budget: e.budget === null ? null : { maxCandidates: e.budget.maxCandidates },
    ...(e.stopAfterAccepted === undefined ? {} : { stopAfterAccepted: e.stopAfterAccepted }),
  };
}

function frameRefJson(f: FrameRef): Json {
  return { id: f.id, animation: f.animation, phase: f.phase, time: f.time, index: f.index, role: f.role };
}

function worstJson(w: WorstSample | null): Json {
  if (w === null) return null;
  const at: { [key: string]: Json } = {};
  if (w.at.pixel !== undefined) at.pixel = pair(w.at.pixel);
  if (w.at.triangle !== undefined) at.triangle = w.at.triangle;
  if (w.at.edge !== undefined) at.edge = pair(w.at.edge);
  if (w.at.vertex !== undefined) at.vertex = w.at.vertex;
  if (w.at.uv !== undefined) at.uv = pair(w.at.uv);
  const out: { [key: string]: Json } = { at };
  if (w.frame !== undefined) out.frame = frameRefJson(w.frame);
  return out;
}

function rowJson(r: MeasureRow): Json {
  const out: { [key: string]: Json } = {
    code: r.code,
    object: { attachment: attachmentJson(r.object.attachment), region: r.object.region },
    state: r.state,
    value: r.value,
    bound: r.bound === null ? null : { op: r.bound.op, value: r.bound.value },
    unit: r.unit,
    worst: worstJson(r.worst),
    reason: r.reason,
  };
  if (r.art !== undefined) out.art = { threshold: r.art.threshold, connectivity: r.art.connectivity, samples: r.art.samples };
  if (r.raster !== undefined) {
    const g = r.raster.grid;
    out.raster = {
      grid: { width: g.width, height: g.height, pageScale: g.pageScale },
      spatialQuantum: r.raster.spatialQuantum,
      valueIncrement: r.raster.valueIncrement,
      nearBound: r.raster.nearBound,
    };
  }
  if (r.sampling !== undefined) out.sampling = { domain: r.sampling.domain, count: r.sampling.count };
  if (r.motion !== undefined) out.motion = motionDetailJson(r.motion);
  return out;
}

function sectionJson(s: EvidenceSection): { [key: string]: Json } {
  const m = s.summary;
  return {
    rows: s.rows.map(rowJson),
    summary: { pass: m.pass, fail: m.fail, undeclared: m.undeclared, refused: m.refused, notMeasurable: m.notMeasurable, measured: m.measured },
    verdict: s.verdict,
  };
}

const countsJson = (c: MeshCounts | null): Json =>
  c === null ? null : { boundaryVertices: c.boundaryVertices, interiorVertices: c.interiorVertices, triangles: c.triangles, bindings: c.bindings, maxInfluences: c.maxInfluences };

function candidateJson(c: CandidateReport): Json {
  const out: { [key: string]: Json } = {
    id: c.id,
    counts: countsJson(c.counts),
    geometry: c.geometry === null ? null : sectionJson(c.geometry),
    motion: c.motion === null ? null : { ...sectionJson(c.motion), schedule: scheduleUsedJson(c.motion.schedule) },
    accepted: c.accepted,
  };
  if (c.perFrame !== undefined) out.perFrame = c.perFrame.map((p) => ({ code: p.code, frame: p.frame, value: p.value }));
  if (c.changes !== undefined) {
    const k = c.changes;
    out.changes = {
      removedVertices: k.removedVertices,
      insertedVertices: k.insertedVertices,
      sharesDroppedOnGrid: k.sharesDroppedOnGrid,
      sharesPruned: k.sharesPruned,
      deformRemapped: k.deformRemapped.map((d) => ({ animation: d.animation, attachment: attachmentJson(d.attachment), key: d.key, droppedVertices: [...d.droppedVertices] })),
      deformReevaluated: k.deformReevaluated.map((d) => ({ animation: d.animation, attachment: attachmentJson(d.attachment), key: d.key })),
      linkedMeshes: k.linkedMeshes.map(attachmentJson),
      acceptedAt: [...k.acceptedAt],
    };
  }
  return out;
}

const notReachedJson = (s: StopNotReached | undefined): { [key: string]: Json } =>
  s === undefined ? {} : { stopAfterAccepted: { requested: s.requested, acceptedSteps: s.acceptedSteps } };

function terminationJson(t: Termination | null): Json {
  if (t === null) return null;
  switch (t.reason) {
    case 'no-further-valid-reduction':
      return { reason: t.reason, candidatesTried: t.candidatesTried, blockingConstraint: t.blockingConstraint, ...notReachedJson(t.stopAfterAccepted) };
    case 'budget-exhausted':
      return { reason: t.reason, candidatesTried: t.candidatesTried, budget: t.budget, result: t.result, ...notReachedJson(t.stopAfterAccepted) };
    case 'replayed-to-accepted-step':
      return { reason: t.reason, acceptedSteps: t.acceptedSteps, candidatesTried: t.candidatesTried };
    case 'invalid-input':
    case 'unsupported-topology':
      return { reason: t.reason, code: t.code, detail: t.detail };
  }
}

/**
 * The document's text: two-space JSON and a final newline, every key in the
 * order its type states it, so two reports of one input are byte-identical —
 * nothing in it is a time, a path or a machine's.
 */
export function writeMeshQualityReport(report: MeshQualityReport): string {
  const doc: Json = {
    spec: report.spec,
    operation: report.operation,
    effective: effectiveJson(report.effective),
    poser: report.poser === null ? null : { kind: report.poser.kind, rigcVersion: report.poser.rigcVersion },
    motionRequired: report.motionRequired,
    sourceCounts: countsJson(report.sourceCounts),
    reference: report.reference === null ? null : candidateJson(report.reference),
    candidates: report.candidates.map(candidateJson),
    termination: terminationJson(report.termination),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// stage C — the motion section's own fields (issue #1230, `src/meshcompare.ts`)
// ---------------------------------------------------------------------------
//
// Additive: nothing above reads these, a `measure` and a `reduce` never write
// them, and every one is written only when present.

/** One group of frames a motion row was also taken over — a phase, or a role (P11). */
export interface MotionReading {
  /** The group's worst value; null when no frame of the group drew the attachment. */
  value: number | null;
  /** The value against the row's bound, by the row's own rule; `undeclared` with no bound, `not-measurable` with no value. */
  state: MeasureState;
  /** The frame the group's worst value was taken at, by `FrameRef.id`. */
  frame: string | null;
}

/**
 * How a motion row's value was taken over the schedule (stage C). The row's own
 * `value` is the worst over every frame measured; these keep apart what the
 * contract says must not be folded together.
 */
export interface MotionRowDetail {
  /** Frames at which the attachment was drawn and measured, and the ids of those at which its slot drew something else or nothing. */
  frames: { measured: number; notDrawn: string[] };
  /**
   * §4 *Transition in time*: the row taken per sample phase — `grid` and `irr`
   * for the frames a rate generated, `null` for the setup frame and for frames
   * the caller gave as explicit times (no phase applies to those).
   */
  byPhase: Array<{ phase: 'grid' | 'irr' | null } & MotionReading>;
  /** When one phase passes and another fails: the worst frame of each, by id, and a sentence naming both. Null otherwise. */
  phasesDisagree: { pass: string; fail: string; sentence: string } | null;
  /** P11: the row per role. `heldOut` is null when no held-out frame was measured — no held-out claim is made. */
  byRole: { baseline: MotionReading | null; selection: MotionReading | null; heldOut: MotionReading | null };
  /**
   * Correction 4, world rows: the declared setup map of the attachment's slot
   * bone — its world 2×2 at the setup pose, `[a, b, c, d]` as the core poses it
   * from the bones' declared fields — and its two singular scales. Never a
   * single world-per-pixel ratio, and never fitted to output vertices.
   */
  setupMap?: { bone: string; linear: [number, number, number, number]; singularScales: [number, number] };
  /** §3: samples no non-degenerate UV triangle carries, listed by UV — in the reference's mesh and in this candidate's. */
  uncarried?: { reference: Array<[number, number]>; candidate: Array<[number, number]> };
  /** §3, `MQ_INVERSION` on a slot `invariants.deformMayFold` names: every reversed triangle with its frame — listed, never zeroed. */
  folds?: Array<{ triangle: number; frame: string }>;
  /** Triangles that have no area at the setup pose (the A39 band), so no sign and no stretch is read off them. */
  degenerateAtSetup?: number;
}

/** What a motion section walked from the schedule it was given (`ScheduleUsed`). */
export interface ScheduleWalked {
  /** Every frame the schedule names, in walk order, each with its role (P11). */
  walked: FrameRef[];
  /** The roles among those frames — what the section has evidence for. */
  roles: Array<FrameRef['role']>;
  /** P11: true only when at least one held-out frame, disjoint from `selection`, was walked. */
  heldOutClaim: boolean;
  /** P10: every walk resets physics at time 0 and steps from there, the same steps for the reference and every candidate. */
  reset: 'physics reset at time 0';
  /** Each walk: the animation, the phase (null for explicit times), and how many steps reached its last frame. */
  walks: Array<{ animation: string; phase: 'grid' | 'irr' | null; steps: number }>;
}

function readingJson(r: MotionReading | null): Json {
  return r === null ? null : { value: r.value, state: r.state, frame: r.frame };
}

function motionDetailJson(m: MotionRowDetail): Json {
  const out: { [key: string]: Json } = {
    frames: { measured: m.frames.measured, notDrawn: [...m.frames.notDrawn] },
    byPhase: m.byPhase.map((p) => ({ phase: p.phase, value: p.value, state: p.state, frame: p.frame })),
    phasesDisagree: m.phasesDisagree === null ? null : { pass: m.phasesDisagree.pass, fail: m.phasesDisagree.fail, sentence: m.phasesDisagree.sentence },
    byRole: { baseline: readingJson(m.byRole.baseline), selection: readingJson(m.byRole.selection), heldOut: readingJson(m.byRole.heldOut) },
  };
  if (m.setupMap !== undefined) out.setupMap = { bone: m.setupMap.bone, linear: [...m.setupMap.linear], singularScales: pair(m.setupMap.singularScales) };
  if (m.uncarried !== undefined) out.uncarried = { reference: m.uncarried.reference.map(pair), candidate: m.uncarried.candidate.map(pair) };
  if (m.folds !== undefined) out.folds = m.folds.map((f) => ({ triangle: f.triangle, frame: f.frame }));
  if (m.degenerateAtSetup !== undefined) out.degenerateAtSetup = m.degenerateAtSetup;
  return out;
}

function scheduleUsedJson(s: ScheduleUsed): Json {
  const given = scheduleJson(s) as { [key: string]: Json };
  return {
    ...given,
    walked: s.walked.map(frameRefJson),
    roles: [...s.roles],
    heldOutClaim: s.heldOutClaim,
    reset: s.reset,
    walks: s.walks.map((w) => ({ animation: w.animation, phase: w.phase, steps: w.steps })),
  };
}
