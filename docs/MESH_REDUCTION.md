# Mesh reduction and topology-independent measurement — the shared contract

> **Revision 2.** Agreed against
> [spine-parts#126, comment 6041707537](https://github.com/firejune/spine-parts/issues/126#issuecomment-6041707537),
> which answers P1–P20 and lists five contract corrections, read at parts
> `836ffb1` and rigc `2af8693`. Revision 1 (PR #1222) asked the questions; this
> revision records the answers, folds each into the interface it changes, and
> maps each correction to a control pair in *Stage A controls*. The answer
> settles the requested consumer behaviour; it does not assert that either
> repository has implemented it, and neither does this page.

Stage A of [#1221](https://github.com/firejune/rigc/issues/1221), the upstream
half of [spine-parts#126](https://github.com/firejune/spine-parts/issues/126).
**Nothing in this page is implemented.** It is the contract both repositories
agree on *before* any of stages B–D is written, and it exists so that a reader
who was not in the conversation that produced it can tell four things apart:

- **Existing** — what the tree already provides, cited by file path and
  symbol name (or a short quoted phrase where there is no symbol), never by
  line number, because line numbers move with nothing going red. Every
  existing number below was read off the source at v2.17.1, not restated from
  memory or from the issue. Facts about parts are cited the same way, as
  `spine-parts src/<file>` plus a symbol, and were read at parts `836ffb1`.
- **[agreed, spine-parts#126]** — decided by parts in the comment above. Each
  decision keeps its question number (**P1 … P20**) so the trail from question
  to answer survives.
- **[proposal]** — rigc's answer to something parts did not decide. Still
  unsettled until parts agrees, and an objection is held to the repository's
  usual standard: *it contradicts X*, *it cannot be measured*, *it breaks Y*.
  Every number on this page that parts did not state is a proposal.
- **Correction N** — one of the five corrections parts listed, applied to the
  interface or definition it names, each with a positive control and a planted
  failure in *Stage A controls*.

Ownership, as #1221 states it and as this page keeps it: **rigc** owns generic
geometry operations, measurable residuals and deterministic diagnostics;
**parts** owns authoring intent, region and bone name resolution, policy
orchestration and candidate selection; **the consumer** declares regions,
quality requirements and representative motion. rigc infers no anatomy and no
policy from a name.

## Inventory — what exists and what is new

| Concern | Existing (verified) | New (stage B–D) |
| --- | --- | --- |
| Alpha mask and threshold | `AlphaMask`, `artOf` (internal) in `src/mesh.ts`: art is alpha `>=` threshold; the threshold is a whole number in 1..255 ("the alpha threshold must be a whole number in 1..255", in both `buildContourMesh` and `buildSegmentsLattice`) | per-attachment art inputs, thresholds never exchanged (§1) |
| Silhouette trace, holes, islands, pinch | `traceAlphaOutline` in `src/mesh.ts`: largest 4-connected island, holes filled by an 8-connected background flood (`fillEnclosed(inside, w, h, 8)`), diagonal pinch refused on the filled silhouette ("the alpha silhouette pinches to a single point"); `fillEnclosed` is internal | none — reused |
| Outline simplification and offset | in `src/mesh.ts`: `simplifyClosedPolygon` (Douglas-Peucker), `offsetPolygon` (miter clamp `CONTOUR_MITER_LIMIT = 4`), `prunePolygon`, `findSelfIntersection`, `earClip` | constrained reduction with interior vertices (§1, §5, §6) |
| Coverage and overshoot | in `src/mesh.ts`: `measureContourFit` (bounded search), `measureAuthoredMeshFit` (exact distance transform, internal `squaredDistanceToSet`), `MeshFitReport`, `CONTOUR_MIN_COVERAGE = 0.995`, `contourOvershootBound` | undercut (inward) distance, worst-sample location, raster sensitivity in each row's unit (§4) |
| Outline/hull/edges of a triangulation | `traceOutline`, `checkHullOrder`, `meshEdges` in `src/mesh.ts`; applied to every authored and generated mesh (`authoredHullAndEdges`, `generatedHullAndEdges`, `src/compile.ts`) | none — every reduced mesh passes through them |
| Generators | `ring`, `ribbon`, `grid`, `contour`, `segments` (`MeshKind`, `src/mesh.ts`); `buildSegmentsLattice`, `segmentShares` | an explicit reduction operation, never a new `generator` default (§1) |
| Weights | `bindWeightedVertices` in `src/mesh.ts` (bindings by bone name); `ModelBinding` (`src/model.ts`); A20 coherence (`src/assertions/bodies/a20.ts`) | explicit influence limits on every weighted call (§6) |
| Triangle sign, collapse, stretch | in `src/deformsurvey.ts`: `triangleAreas`, `DEFORM_AREA_EPSILON = 1e-6`, `float32AreaNoise`, `stretchSingularValues` | reused for orientation/degeneracy (§4) |
| Deform measurement over time | deform survey (`surveyDeformKeys`, `src/deformmeasure.ts`; `surveyOfModel`, `src/deformsurvey.ts`), span scan (`scanDeformSpan`, `src/deformsurvey.ts`), A39 | none — a different question (it measures one mesh against itself, never two meshes against each other) |
| Posing | spine-core poser and rigc's core poser behind one seam (`src/render_shared.ts`, `src/render_core.ts`); `sampleAnimation`, `sampleSetupPose` and the `Frame`/`Mesh` pieces with world vertices, page UVs, triangles (`src/render_shared.ts`) | a comparison over a common UV domain through the core poser (§3) |
| Two triangulations compared | **nothing.** `src/correspondence.ts` is a *bone* correspondence for `bonedist`/`bench` (`BONEDIST_SPEC`, `IDENTITY_CORRESPONDENCE`), not a mesh one | the whole of §3 |
| Report document | `build-report/1` (`src/assertions/report.ts`): versioned, additive, byte-identical for one build, no time or path | `mesh-quality-report/1` (§2) |
| Import surface for parts | `spine-rigc/mesh` holds 11 values and `AlphaMask` (RELEASING.md *The import surface*; `OBSERVED_SYMBOLS`, `scripts/install_smoke.ts`); `spine-rigc/render` needs spine-core installed beside it | `spine-rigc/mesh` (geometry) and `spine-rigc/meshcompare` (motion), §0 |

## 0. Where the operations live, and what they never change

**Existing.**

- The named entries are the API and a symbol is promised only once a
  dependant is observed using it (RELEASING.md *The import surface*). Through
  `spine-rigc/mesh` parts is promised `traceAlphaOutline`, `traceOutline`,
  `earClip`, `offsetPolygon`, `prunePolygon`, `simplifyClosedPolygon`,
  `signedArea`, `findSelfIntersection`, `checkHullOrder`,
  `measureAuthoredMeshFit`, `MeshError`, and the type `AlphaMask`.
  `measureContourFit`, `meshEdges`, `buildSegmentsLattice` and `segmentShares`
  are exported by the module and **not** promised.
- `spine-rigc/render` loads `@esotericsoftware/spine-core` on import, which the
  package declares as a devDependency only since 2.0.0 (RELEASING.md, the
  paragraph after the *not promised* list). rigc's own core poser
  (`src/core/`, `src/render_core.ts`) links nothing of the runtime, and **has
  no named entry**.
- The install smoke already installs the package **without** spine-core and
  imports every observed entry with it taken away (`scripts/install_smoke.ts`,
  its `clean` scenario).
- `MeshError` (`src/mesh.ts`) extends `Error`, not `CompileError`; the
  compiler rewraps it as `CompileError` with the attachment's location
  (`authoredHullAndEdges`, `generatedHullAndEdges`, `src/compile.ts`).
- The emitted bytes of every existing generator are held by the step-1 hash
  gates against `tools/emit_hashes.base.json` (CLAUDE.md, *The selftest and its
  fixtures*).

**Agreed and proposed.**

- [proposal] Every new operation is an **explicit call**. No `generator`
  default changes, no existing generator gains an implicit reduction, and
  `compile` never remeasures or rewrites authored geometry on its own. The
  emit-hash gates are the proof that an unchanged spec emits unchanged bytes.
- [agreed, spine-parts#126] **P1 — `spine-rigc/meshcompare` is accepted.**
  Geometry-only operations (`reduceMesh`, `measureMeshQuality`) are exported
  from `spine-rigc/mesh`, which stays geometry-only; the motion comparison
  (`compareMeshesInMotion`) is exported from the new named entry
  `spine-rigc/meshcompare`. **Both** entries are held by an installed-package
  smoke with spine-core absent, the scenario the smoke already runs for the
  observed entries.
- [agreed, spine-parts#126] **P2 — the core poser is sufficient for the
  initial production interface.** `compareMeshesInMotion` poses through rigc's
  core over the model document; no parts consumer gains a spine-core
  dependency, and a second poser backend is not a prerequisite. The report
  records the poser and its version (§2, `poser`); a measurement the core
  poser does not support is `refused` or `not-measurable` by name, never
  silently approximated. The upstream core-gate parity tests (`core_gate`,
  CLAUDE.md *The doctrine*) stay as they are; they are what makes the core's
  poses admissible.
- [proposal] Refusals are thrown as `MeshReductionError extends MeshError` with
  a readonly `code` (the codes are listed in each section below), so a
  dependant that already catches `MeshError` keeps catching them and one that
  wants the code can read it. Inside `compile` they are rewrapped as
  `CompileError` exactly as `MeshError` is today.

## 1. Inputs, coordinate spaces, scaling, threshold, units, tolerances, order

**Existing.**

| Fact | Where |
| --- | --- |
| Positions are **part-local pixels, y down, origin top-left** | `MeshGeometry.points`, `src/mesh.ts`; the crop contract, CLAUDE.md *Conventions* |
| UVs are normalised over the part window, `v` from the top edge; a generator writes `x / w`, `y / h` on the 6-decimal grid | `MeshGeometry.uvs` and every builder's `uvs.push(r6(x / w), r6(y / h))`, `src/mesh.ts` |
| Triangles are **counter-clockwise in Spine world** (y up) | `MeshGeometry.triangles`, `src/mesh.ts`; `buildSegmentsLattice` swaps each y-down triangle's last two corners to keep it ("Emitted counter-clockwise in Spine world") |
| Spine world is y up, origin bottom-left of the crop; the whole conversion is `src/transform.ts` | `cropToSpineY`, `toBoneLocal`, `toWorld` |
| A page that states `scale:` is traced on its texels; the author's distances are applied as `value × pageScale` texels, never a measured ratio | `ContourSpecInput.pageScale`, `src/mesh.ts` (issue #779); overshoot reported back in the drawing's pixels by dividing by the stated scale, `drawingOvershoot`, `src/compile.ts` |
| Alpha threshold: art is `alpha >= threshold`, a whole number in 1..255; generator default 1 | `buildContourMesh`, `src/mesh.ts`; `CONTOUR_DEFAULTS` and `SEGMENTS_DEFAULTS`, `src/compile.ts` |
| The authored-mesh fit is measured at threshold **1**, whatever the attachment's art | `measureAuthoredFit`, `src/compile.ts` |
| The generator grid: 6 decimals, never `-0`; emission then takes each number's float32 name | `r6`, `src/mesh.ts`; `f32`, `src/compile.ts`; `onModelGrid`, `src/compile.ts` |
| Geometric predicate epsilons | in `src/mesh.ts`: duplicate/collinear `1e-9` (`prunePolygon`); segment meeting `1e-9` (`segmentsMeet`); point-in-triangle `-1e-9` (`pointInTriangle`); degenerate raster triangle `|2A| < 1e-12` (`rasteriseTriangles`); ear turn `<= 1e-12` (`earClip`) |
| A pixel is covered when its **centre** is in or on a triangle — the renderer's convention | `rasteriseTriangles`, `src/mesh.ts` |
| Canonical order already fixed: hull first in walk order; walk starts at the lowest-numbered boundary vertex towards its smaller neighbour; `edges` = outline loop then interior edges sorted | `MeshOutline.walk` and `meshEdges`, `src/mesh.ts` |
| A segments vertex's weights: strongest first, ties in first-named order, the last closing at `1 − others` on the grid | `segmentShares`, `src/mesh.ts` |

**Existing in parts** (read at `836ffb1`; recorded because this contract must
not disturb them).

| Fact | Where |
| --- | --- |
| Parts's art is alpha **above** `ART_ALPHA = 8` — the same pixel set as rigc's `>= 9` | spine-parts `src/mesh.ts`, `ART_ALPHA`; its `artMask` in spine-parts `src/contour.ts` tests `alpha > threshold` |
| The contour fit hands rigc `threshold + 1` so rigc's `>=` reads parts's `>` | spine-parts `src/contour.ts`, `contourFit` calling `measureAuthoredMeshFit`, reached from `contourMesh` (the answer names the caller `assertContourFit`; no symbol of that name exists at `836ffb1`, and `contourFit` is the one that makes the call) |
| Rig-space regions are translated to part-local coordinates before the contour mesh is built | spine-parts `src/rig.ts`, the `contourAttachment` closure, mapping each region by the part origin before `contourMesh` |
| The minimum weight is applied inside the segment shares and **not** again to a region's scaled shares, so the declared ramp has no step | spine-parts `src/localweights.ts`, `localInfluences` and its header *The vertex's weights* ("The floor") |

**Thresholds — the agreed rule.** [agreed, spine-parts#126]

- **The existing parts path is alpha `> 8`, rigc `>= 9`, and stays
  byte-identical.** Nothing in this contract changes it.
- **P4 — the new automatic policy's final acceptance is measured at `>= 1`**,
  the threshold the compiler's authored-fit gate uses (`measureAuthoredFit`,
  `src/compile.ts`). Candidate construction may use another, explicitly
  recorded threshold; if it does, the reference **and** the selected candidate
  are measured again at `>= 1` under the same declared final bounds.
- **Evidence is never exchanged between thresholds.** A pass at `>= 9` is not
  a pass at `>= 1`, and the report keys every raster row by the threshold it
  was taken at (`art.threshold` in §2's row). A reference that cannot meet the
  final policy at `>= 1` is regenerated or refused; its art is never deleted
  to make it pass.
- The generic geometry operations still accept a caller-declared threshold for
  explicit research and measurement calls; such a call's report states that
  threshold and claims nothing at any other.

**Proposed** (with the decisions folded in).

```ts
/** [proposal] The art one attachment is measured against. Correction 1: one per attachment, never shared. */
export interface ArtInput {
  /** The art, on the grid it is read off: the plate's pixels, or a `scale:` page's texels. */
  mask: AlphaMask;
  /** Art is `alpha >= threshold`. Required, a whole number in 1..255. Never exchanged (Thresholds). */
  threshold: number;
  /** The frame the caller's distances are in — P3. Echoed in the report, never inferred. */
  frame: SourceFrame;
}

/** [agreed, spine-parts#126] P3: the caller authors in drawing pixels, part-local, y down. */
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

/** [proposal] Everything a reduction reads. No field has a default inside the operation. */
export interface MeshReductionInput {
  /** The attachment being reduced, echoed in every row. */
  attachment: AttachmentRef;
  art: ArtInput;
  /** The mesh to reduce, as the compiler would emit it — P8: the unreduced, independently gated source. */
  source: SourceMesh;
  /** Correction 3: what the SOURCE must already satisfy to be admissible (reference/art validity). */
  sourceBounds: ArtFitBounds;
  /** Correction 3: what the RESULT must satisfy; the source need not meet these and is refined towards them. */
  targets: ReductionTargets;
  /** Vertices, edges and influences the reduction may not remove or cross — §6. */
  protect: ProtectedFeatures;
  /** Required when `source.weights` is non-null — §6, P19. */
  influences: InfluenceLimits | null;
  /** Correction 1: the skeleton's bone order, used for every weight tie-break. Required when weighted. */
  boneOrder: string[] | null;
  /** P5: the preset parts expanded, if any, echoed and never read. */
  preset: { name: string; version: string } | null;
  /** Work bound — *Termination reasons*. Required. */
  budget: { maxCandidates: number };
}

export interface AttachmentRef { skin: string | null; slot: string; attachment: string }

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

/** All distances in the drawing's pixels; converted to texels by `pageScale` exactly as `contour` converts. */
export interface ArtFitBounds {
  /** Share of art pixel centres the triangles cover, 0..1. Required. */
  minCoverage: number;
  /** Furthest a covered pixel may sit outside the filled silhouette, px. Required. */
  maxOvershoot: number;
  /** Furthest an uncovered art pixel may sit from the covered set, px. Required. */
  maxUndercut: number;
}

export interface ReductionTargets {
  /** The result's art fit — independent of `sourceBounds`, may be equal to it. */
  artFit: ArtFitBounds;
  /** P13: largest Hausdorff distance between the reduced and the source hull polygons, px. Required. */
  maxBoundaryDeviation: number;
  /** Optional: smallest interior angle any triangle may have, degrees. Undeclared = reported, not gated. */
  minAngle?: number;
  /** Local density requirements — §5. Empty array when none; a source that does not meet them is refined. */
  regions: RefinementRegion[];
}
```

- [agreed, spine-parts#126] **P3 — inputs are authored in drawing pixels.**
  Parts resolves every input to part-local drawing pixels, y down, before the
  call. Packing scale never changes the authored quality requirement: a bound
  stated in drawing pixels means the same art on any page. The report echoes
  the source frame, page scale and conversion (`ArtInput.frame`); **no scale is
  ever inferred from the packed page's dimensions.**
- [proposal] **Units.** Every caller distance is converted to texels by
  `pageScale` with the arithmetic `buildContourMesh` uses (`onGrid`,
  `src/mesh.ts`), and reported back in the drawing's pixels with the grid it
  was taken on. A fraction is a fraction; an angle is degrees.
- [agreed, spine-parts#126] **P5 — presets are parts's.** A preset is
  explicitly selected, versioned and expanded into numbers before the call;
  the report echoes its name, version and every expanded number. rigc
  publishes no preset table and derives no tolerance from an image. Existing
  explicit modes remain byte-identical. A missing number is a
  `MeshReductionError` naming the field (`REDUCE_INPUT_MISSING`).
- [proposal] **Fixed tolerances are the tree's own.** Predicates use the
  epsilons in the table above; zero-area is the A39 band —
  `max(DEFORM_AREA_EPSILON × largest |area| in the mesh, float32AreaNoise)` —
  so a triangle the reduction calls degenerate is one the gate would also
  read no sign off. Output positions and UVs are on the `r6` grid, then
  `f32` at emission, as every generator's are.
- [proposal] **Canonical output order** (byte-deterministic, A18):
  1. Hull vertices in outline walk order, starting at the surviving hull
     vertex with the smallest **source** index, in the source's direction.
  2. Interior source vertices that survive, ascending source index.
  3. Vertices the operation inserted (refinement only, §5), ascending by
     `(y, x)` on the `r6` grid.
  4. Triangles: each rotated so its smallest index is first, winding kept
     counter-clockwise in Spine world, then sorted lexicographically.
  5. `edges` from `meshEdges`; weights per vertex strongest first, ties by the
     bone's position in `boneOrder` (correction 1: the order is an input, so
     the tie-break is reproducible from the report alone).
- [proposal] **Refusals** (each names the object, the value found and the
  value required): `REDUCE_INPUT_MISSING`, `REDUCE_THRESHOLD_RANGE`,
  `REDUCE_MASK_SIZE` (mask bytes ≠ width × height, or the mask's dimensions
  are not the frame's `width × pageScale` by `height × pageScale`),
  `REDUCE_UV_RANGE` (outside 0..1 by more than A22's `1e-6`,
  `src/assertions/bodies/a22.ts`), `REDUCE_SOURCE_NOT_ONE_LOOP` (whatever
  `traceOutline` refuses), `REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS`.
- **Correction 3 — source admissibility is not target density.**
  `REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS` (renamed from revision 1's
  `REDUCE_SOURCE_FAILS_ITS_OWN_CONSTRAINTS`) fires **only** on
  `sourceBounds` — the source's own art fit and its own build gate, the
  reference validity of §3. A valid source that is coarser than a requested
  region density is **refinable**, not refused: `targets.regions` and
  `targets.maxBoundaryDeviation` are things the result is driven towards,
  never admission conditions.

## 2. Geometry-only versus pose/motion-validated evidence — the report

**Existing.**

- A gate row is `PASS`, `FAIL`, `SKIP` with a reason, or `PROF` (not in the
  profile), and the summary counts each separately; `measured` is passed plus
  failed and never includes a skip (`GateSummary`, `src/assertions/report.ts`).
  An assertion with nothing to measure SKIPs and is never a pass (CLAUDE.md
  *Going public*).
- `build-report/1` is versioned and additive, keys in a fixed order, and two
  reports of one build are byte-identical — no time, path or machine
  (`src/assertions/report.ts`).
- The deform survey keeps "ran and found nothing" distinct from "did not run"
  (`DeformSpan`, `src/deformsurvey.ts`), passes over a key whose
  slot draws nothing by name rather than counting it (`DeformKeyDraw`), and
  records a predicted-but-unreproduced fold as `unconfirmed`, not as a pass or
  a failure (`DeformSpan.unconfirmed`).

**Proposed** (with the decisions and corrections 1–3 folded in). One document,
`mesh-quality-report/1`, written by both the geometry-only and the motion
operation. The two kinds of evidence are **two sections with two summaries**;
no figure anywhere adds them.

```ts
/** [proposal] */
export type MeasureState = 'pass' | 'fail' | 'undeclared' | 'refused' | 'not-measurable';

export interface MeasureRow {
  /** Stable code, e.g. `MQ_COVERAGE`, `MQ_OVERSHOOT`, `MQ_LOCAL_DEFORMATION`. */
  code: string;
  /** The object measured: attachment always; region when the row is a region's. */
  object: { attachment: AttachmentRef; region: string | null };
  state: MeasureState;
  /** The measured value: present on pass, fail and undeclared; null otherwise. */
  value: number | null;
  /** The declared bound, inclusive: present on pass and fail; null on undeclared, refused, not-measurable. */
  bound: { op: '<=' | '>='; value: number } | null;
  unit: 'px' | 'world' | 'fraction' | 'degrees' | 'ratio' | 'count';
  /** Where the worst value was taken: present whenever `value` is. */
  worst: WorstSample | null;
  /** Required on refused and not-measurable: a sentence naming what was missing. */
  reason: string | null;
  /** Raster rows only: the art the row was taken against — never read across thresholds. */
  art?: { threshold: number; connectivity: 4 | 8 | null; samples: number };
  /** Raster rows only — correction 2, §4. */
  raster?: RasterSensitivity;
  /** Sampled rows (§4: `MQ_LOCAL_DEFORMATION`, fill distance) — correction 2. */
  sampling?: { domain: string; count: number };
}

/** [proposal] Correction 2: the spatial grid and the value's own granularity are two fields. */
export interface RasterSensitivity {
  grid: { width: number; height: number; pageScale: number };
  /** One texel, in the drawing's pixels: 1 / pageScale. A property of the grid, not of the value. */
  spatialQuantum: number;
  /** The smallest step the VALUE can take, in the row's own unit: px rows — spatialQuantum;
   *  fraction rows — 1 / art sample count; count rows — 1. */
  valueIncrement: number;
  /** `at-bound` when value equals bound exactly; `within-increment` when 0 < |value − bound| <= valueIncrement;
   *  `clear` otherwise. A diagnostic: it changes no verdict and bounds no error. */
  nearBound: 'at-bound' | 'within-increment' | 'clear';
}

export interface WorstSample {
  /** A pixel (raster rows), a triangle, an edge, a vertex, or a UV sample (motion rows). */
  at: { pixel?: [number, number]; triangle?: number; edge?: [number, number]; vertex?: number; uv?: [number, number] };
  /** Motion rows only — P7, P11: the frame, by stable id. */
  frame?: FrameRef;
}

/** [agreed, spine-parts#126] P7/P11: a frame is named by a stable id that carries animation, phase and time. */
export interface FrameRef {
  /** `setup`, or `<animation>@<phase>@<time on the r6 grid>`; the same frame has the same id in every report. */
  id: string;
  animation: string | null;
  phase: 'grid' | 'irr' | null;
  time: number | null;
  index: number | null;
  /** Whether the caller used this frame to choose a candidate. */
  role: 'selection' | 'held-out' | 'baseline';
}

export interface EvidenceSection {
  rows: MeasureRow[];
  /** Counts per state. `measured` = pass + fail. Never summed across sections. */
  summary: { pass: number; fail: number; undeclared: number; refused: number; notMeasurable: number; measured: number };
  /** pass only when every REQUIRED row is pass AND at least one row is pass; an undeclared row never satisfies a requirement. */
  verdict: 'pass' | 'fail' | 'not-measured';
}

/** One candidate's evidence — correction 1. `reduce` and `measure` carry exactly one. */
export interface CandidateReport {
  /** The caller's id for the candidate (§3, `BuiltCandidate.id`), or `result` for a `reduce`. */
  id: string;
  counts: MeshCounts | null;
  /** Null when no mesh exists to measure (correction 3). */
  geometry: EvidenceSection | null;
  /** Null when no motion was asked for — never an empty PASS (P6). */
  motion: (EvidenceSection & { schedule: ScheduleUsed }) | null;
  /** P6 — declared-contract acceptance, defined below. */
  accepted: boolean;
  /** Opt-in (P7): every row's value at every frame. Absent unless asked for. */
  perFrame?: Array<{ code: string; frame: string; value: number | null }>;
}

export interface MeshQualityReport {
  spec: 'mesh-quality-report/1';
  operation: 'reduce' | 'measure' | 'compare';
  /** Correction 1: the inputs echoed with their structure, presets expanded — never a flat record of scalars. */
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

/** [proposal] Correction 1: every input the text requires, echoed field for field. */
export interface EffectiveSettings {
  preset: { name: string; version: string } | null;
  attachments: Array<{ attachment: AttachmentRef; threshold: number; finalThreshold: number; frame: SourceFrame;
    maskSize: [number, number]; minArtSamples: number }>;
  sourceBounds: ArtFitBounds | null;
  referenceArtFit: ArtFitBounds | null;
  candidateArtFit: ArtFitBounds | null;
  targets: ReductionTargets | null;
  motionBounds: MotionBounds | null;
  protect: ProtectedFeatures | null;
  influences: InfluenceLimits | null;
  boneOrder: string[] | null;
  schedule: MotionSchedule | null;
  budget: { maxCandidates: number } | null;
}

export interface MeshCounts {
  boundaryVertices: number;
  interiorVertices: number;
  triangles: number;
  /** Total `{ bone, weight }` entries over all vertices; 0 on an unweighted mesh. */
  bindings: number;
  maxInfluences: number;
}
```

- [proposal] **The five states, defined.** `pass`/`fail`: measured against a
  declared bound. `undeclared`: measured, and the caller declared no bound —
  the value and its worst sample are reported, and the row is **not** in the
  pass count. `refused`: the input to *this* measurement is invalid (a region
  outside the art, a bound below the grid), named by code. `not-measurable`:
  the input is valid and the measurement cannot be taken — no motion supplied,
  the slot draws nothing at every scheduled frame, fewer art samples than the
  declared minimum (P9), or the poser does not support the row (P2).
- [proposal] **Bounds are inclusive**, and a value exactly at its bound
  passes and carries `nearBound: 'at-bound'` (correction 2: boundary equality
  is handled explicitly, not left to a float comparison's mood).
- [agreed, spine-parts#126] **P6 — `accepted` stays, defined narrowly as
  declared-contract acceptance.** A candidate is `accepted` when its geometry
  section's verdict is `pass`, every required measurement is available (no
  required row `not-measurable` or `refused`), and — when `motionRequired` —
  its motion verdict is `pass`. An `undeclared` informational row never
  satisfies a required claim. Geometry-only acceptance stays visibly
  geometry-only: `motion` is `null` and `motionRequired` is false, so the
  report says *unmeasured*, never *passed*. With `motionRequired: true` and a
  motion verdict of anything but `pass` — including `not-measured` —
  `accepted` is false. Choosing among candidates and production acceptance
  remain parts's.
- [agreed, spine-parts#126] **P7 — each row carries its worst value and
  location, plus counts and the effective settings**; a per-frame table is
  opt-in (`CandidateReport.perFrame`) for diagnostics. Every worst motion
  sample names its frame by `FrameRef.id`, which carries the phase and a
  stable time — not a bare index — so a result is reproducible and can be
  located in selection or evaluation data.
- [proposal] Rows are ordered by section, then attachment in skeleton order,
  then code, then region; candidates in the order the caller listed them; the
  document is two-space JSON with a final newline and byte-identical for one
  input, as `build-report/1` is.

## 3. Comparing different triangulations on a common domain

**Existing.**

- Nothing compares two meshes. The deform survey compares a mesh with
  **itself** — the deformed key against the same posed bones with the deform
  cleared (`src/deformmeasure.ts`, header *The frame*).
- A deform moves positions and never UVs, so UV-rasterised coverage is
  identical at every key — stated, and controlled by `DR04`
  (`src/deformmeasure.ts`, header *What is deliberately NOT here*).
- A posed frame's mesh piece carries world vertices, **page** UVs and triangles
  (`Mesh`, `src/render_shared.ts`); page UVs depend on where the
  region was packed, region UVs do not (A22's note, `src/assertions/bodies/a22.ts`).
- Sample times: the render walks `count = round(duration × fps)` poses at
  `i / fps` (`sampleAnimation`, `src/render_shared.ts`); the
  protocol rate is `PROTOCOL_FPS = 12` (`src/render_shared.ts`). The pose
  oracle's phases are `grid`, `off`, `irr`, `dense` (`SamplePhase`,
  `src/core/animation.ts`), with `IRR_OFFSET = 0.381966011` and the times
  `sampleTime` returns, both in the same file.
- Physics: the render resets at pose 0 and steps by `1/fps` after
  (`src/render_core.ts`); the oracle's stepped schedule starts at 0
  with the reset and steps by `dt` (`stepSchedule`,
  `src/core/constraints_physics.ts`), default `dt` 1/60
  (`ORACLE_DEFAULT_DT`, `tools/pose_oracle.ts`). **No warm-up exists
  anywhere in the tree.**
- A rig may exempt a slot from A39's fold rule (`invariants.deformMayFold`,
  `src/rig.ts`).

**Proposed** (with the decisions and corrections 1, 4 and 5 folded in).

```ts
/** [proposal] */
export interface MotionComparisonInput {
  /** P8: the unreduced, independently gated source build. Required — no pairwise-only acceptance. */
  reference: BuiltCandidate;
  candidates: BuiltCandidate[];
  /** Correction 1: per attachment, its own art, threshold, frame and sample floor. */
  attachments: Array<{ attachment: AttachmentRef; art: ArtInput; finalThreshold: 1; minArtSamples: number;
    regions: Array<{ name: string; polygon: Array<[number, number]>; minArtSamples: number }> }>;
  /** Correction 1: the reference and the candidates are held to independently declared art-fit bounds. */
  referenceArtFit: ArtFitBounds;
  candidateArtFit: ArtFitBounds;
  schedule: MotionSchedule;
  bounds: MotionBounds;
}

export interface BuiltCandidate {
  /** Correction 1: the caller's identity for the candidate, unique within one call, echoed in its report. */
  id: string;
  /** The model document and the Spine pair it was written beside. */
  build: { modelPath: string; skeletonPath: string; atlasPath: string };
}

export interface MotionBounds { maxLocalDeformation: number; maxStretch?: number; minStretch?: number }

export interface MotionSchedule {
  /** P11: explicit frames, supplied by parts — setup, and per animation either explicit times or a rate. */
  frames: Array<'setup' | { animation: string; times: number[] } | { animation: string; fps: number }>;
  /** Sample phases each animation is walked at; the verdict must hold at every one. */
  phases: Array<'grid' | 'irr'>;
  /** P10: `warmupSteps` must be 0 until warm-up exists; any other value is refused by name. */
  physics: { mode: 'none' } | { mode: 'step'; dt: number; warmupSteps: 0 };
  /** P11: frame ids the caller used to SELECT a candidate. Every other non-setup frame is held out. */
  selection: string[];
}
```

- [proposal] **The common domain is the attachment's region UV square**, not
  its page UVs and not vertex indices. UVs are the one attribute a deform never
  moves and a repack never changes, so a UV point names the same texel of art
  in every candidate at every frame.
- [proposal] **The sample set** is the centre of every art pixel of the mask,
  `((x + 0.5) / w, (y + 0.5) / h)` for each pixel with `alpha >= threshold`,
  plus every reference hull vertex's UV. Each sample is located by barycentric
  coordinates in each candidate's UV triangulation and carried to world by that
  triangle's posed vertices. A sample that lies in no triangle of a candidate
  is **not dropped**: it counts against that candidate's coverage and is
  listed.
- **Correction 4 — the comparison map is unambiguous or refused.** A sample
  whose UV lies in more than one triangle of a candidate — overlapping or
  degenerate UV triangles — would otherwise be carried by an arbitrary one.
  [proposal] It is refused by name (`COMPARE_UV_CARRIER_NOT_UNIQUE`, naming the
  candidate, the sample's UV and every triangle that contains it). The one
  exception is a sample on an edge or vertex **shared** by the triangles that
  contain it: there the carriers agree on the carried point by construction,
  and the hit is one hit. A UV triangle inside the A39 area band carries
  nothing and is never chosen as a carrier.
- [agreed, spine-parts#126] **P9 — `minArtSamples` is an explicit positive
  integer input with no hidden rigc constant.** [proposal] It is stated **per
  attachment** (required) and **per region** (required for every region whose
  rows are required); the report states the observed count separately for each
  domain (`MeasureRow.art.samples`). Hull-vertex samples do not count towards
  it. A domain under its floor is `not-measurable` with its count, never a pass
  over nothing. A value of 1 is admissible for an explicitly chosen geometry
  investigation of a nonempty part; it is not a production floor, and parts
  supplies the number from its declared policy or versioned preset.
- [proposal] **Coordinate alignment is by construction, never by fitting.**
  No registration, translation or scale is solved for, and no alignment is
  ever fitted to the output vertices — a solved alignment would hide exactly
  the error being measured.
- **Correction 5 — equality covers every non-mesh input.** Identical bone
  rosters and setup transforms are necessary and not sufficient: a changed
  constraint, attachment transform, skin or slot attachment schedule, motion
  track or physics setting confounds the comparison. [proposal] Reference and
  candidates must be equal in **every input not on the allowlist**, compared
  on their model documents, or the comparison is refused
  (`COMPARE_INPUTS_DIFFER`, naming the first differing object and field and
  both values; revision 1's `COMPARE_SKELETONS_DIFFER` is its bone-only
  special case and is retired into it). The allowlist is exactly:
  (a) the compared attachments' vertices, UVs, triangles, hull, edges and
  bindings; (b) what follows from them by topology — deform runs remapped
  under §6's rule and `transform` deform keys re-evaluated over the new
  geometry; (c) atlas layout — page, region placement and rotation — provided
  each candidate's page UVs convert back to its region UVs. Nothing else may
  differ.
- [proposal] **A permitted fold stays visible.** A slot exempted by
  `invariants.deformMayFold` remains outside `MQ_INVERSION`'s count as A39
  rules, and its folded triangles are **listed** in the row's diagnostics with
  their frames; the row never reports zero for them.
- **Correction 4 — units.** [proposal] Distances are in Spine world units, the
  primary error. A single world-units-per-pixel ratio is invalid under
  nonuniform scale or shear, so it is not reported. Each row instead states
  the **declared** setup map from part-local drawing pixels to world — the
  placement the compile used (`cropToSpineY`, `toBoneLocal`, `toWorld`,
  `src/transform.ts`), read from the build and never measured from vertices —
  as its 2×2 linear part with its two singular scales. Where no single
  declared map exists for an attachment, the conversion is reported as
  `refused` with a reason and the world-space row stands alone.
- [agreed, spine-parts#126] **P10 — no warm-up in v1.** Physics resets and
  steps from time 0, consistently for every candidate, with core-gate and
  render semantics as the baseline. `mode` and `dt` are required whenever any
  physics constraint is active. `warmupSteps: 0` is supported; any other value
  is refused by name (`COMPARE_WARMUP_UNSUPPORTED`) until warm-up is
  implemented and controlled — never silently treated as zero.
- [agreed, spine-parts#126] **P11 — parts supplies the schedule and the
  selection membership; rigc invents no split.** Frames are named by
  `FrameRef.id` (animation, phase and time). The report keeps
  selection-only and held-out results apart, and a frame used for candidate
  choice is never held out. A held-out claim requires a nonempty set of
  held-out frames disjoint from `selection`, evaluated through the same
  recorded physics reset and `dt`; `setup` is a shared baseline
  (`role: 'baseline'`) and is not held-out evidence.
- [agreed, spine-parts#126] **P8 — the reference is the unreduced,
  independently gated source mesh.** It may be generated by the automatic
  pipeline; a reference game's mesh or vertex count is not an input. A
  candidate-to-candidate comparison may be reported as a diagnostic and never
  establishes acceptance.
- [proposal] **Independent evidence.** Agreement between candidates is
  necessary and not sufficient — two candidates that both drop the same art
  agree perfectly. So each candidate, **and the reference**, is held
  separately to: (a) art coverage, overshoot and undercut against its
  attachment's own mask at setup (§4), the reference under `referenceArtFit`
  and each candidate under `candidateArtFit`, both at the final threshold;
  (b) the existing gate on its own build, every assertion as it runs today
  (A13 budgets, A20 weight coherence, A21 rim pinning where it applies, A22 UV
  range, A39 winding); (c) every bound in `bounds`. A reference that fails
  (a) or (b) is refused as a reference (`COMPARE_REFERENCE_FAILS`), because a
  deviation from a wrong reference is not evidence.

## 4. The measurements, defined

**Existing.**

- **Coverage**: share of art pixels (alpha `>=` threshold, every island) whose
  centre a triangle covers (`measureAuthoredMeshFit`, `src/mesh.ts`).
- **Overshoot**: the furthest covered pixel outside the **filled** silhouette,
  exact Euclidean distance in pixels, on the `r6` grid
  (the internal `squaredDistanceToSet` in `src/mesh.ts`, read by
  `measureAuthoredMeshFit`). The contour builder's ceiling is
  `margin × 4 + tolerance + 1`, the last term being the one-pixel
  centre-sampling term (`contourOvershootBound`).
- **The hole-filled silhouette** exists in two flavours, both in
  `src/mesh.ts`. The tracer fills background that **no 8-connected** path of
  background reaches from the border (`traceAlphaOutline`'s
  `fillEnclosed(inside, w, h, 8)`; issue #1209, landed by PR #1210 — the
  CHANGELOG's 2.15.1 entry); the authored-mesh fit fills with a
  **4-connected** flood over all art (`measureAuthoredMeshFit`'s
  `fillEnclosed(art, w, h, 4)`). `fillEnclosed`'s own comment states the two
  "agree on every mask the trace accepts" — they can differ only across a
  diagonal pinch, which the tracer refuses.
- **Holes and islands in the format.** A Spine mesh's outline is one closed
  loop and its triangle count is Euler's for a hole-free triangulation;
  `traceOutline` refuses a pinched vertex, a hole and two islands by name
  (`src/mesh.ts`, the section headed "the outline a triangulation already
  states"). So a mesh can **span** a hole and can **bridge** islands
  (`buildSegmentsLattice` does, its step "**One loop.**"), and it cannot cut
  either out.
- **Orientation and degeneracy**: generators emit counter-clockwise in Spine
  world (`MeshGeometry.triangles`, `src/mesh.ts`); `traceOutline` refuses a
  triangle that "repeats a vertex, so it has no area"; the A39 band (`DEFORM_AREA_EPSILON`,
  `float32AreaNoise`) decides when a sign is not read.
- **Texture stretch**: the singular values of `J = D·P⁻¹` per triangle
  (`stretchSingularValues`, `src/deformsurvey.ts`); a plain triangle with no
  area has no map and is counted `degenerate`, never given the identity.

**Proposed.** [proposal] every definition below, except where a row is marked
agreed.

| Code | Definition | Unit | Raster? |
| --- | --- | --- | --- |
| `MQ_COVERAGE` | `measureAuthoredMeshFit`'s coverage, unchanged | fraction | yes |
| `MQ_OVERSHOOT` | its overshoot, against the filled silhouette as defined in the next bullet | px | yes |
| `MQ_UNDERCUT` | the furthest **uncovered** art pixel from the nearest covered pixel, by the same exact distance transform | px | yes |
| `MQ_BOUNDARY_DEVIATION` | [agreed, P13] symmetric Hausdorff distance between the reduced hull polygon and the **source** hull polygon, exact on the polygons — the required reduction-preservation bound | px | no |
| `MQ_TRACE_DEVIATION` | [agreed, P13] the same distance against the **traced** silhouette outline — a diagnostic, never required; `not-measurable` with the tracer's refusal as its reason when tracing is refused | px | no |
| `MQ_HOLES` | transparent pixels inside the hull, reported (spanned, drawing nothing) | count | yes |
| `MQ_ISLANDS` | art islands the mesh joins, and the bridge area holding no art | count | yes |
| `MQ_ORIENTATION` | triangles whose signed area in Spine world is negative, outside the A39 band | count | no |
| `MQ_DEGENERATE` | triangles whose \|area\| is inside the A39 band | count | no |
| `MQ_MIN_ANGLE` | smallest interior angle, gated only when `minAngle` is declared | degrees | no |
| `MQ_MAX_EDGE` | [agreed, P15] §5's `L(R)` per region | px | no |
| `MQ_FILL_DISTANCE` | [agreed, P15] §5's `h(R)` per region, sampled — informational, never gated | px | sampled |
| `MQ_LOCAL_DEFORMATION` | per UV sample per scheduled frame, world distance between the candidate's and the reference's carried sample (§3); the worst sample is the row's. A maximum over the **finite** sample set, stated with its domain and count — never a continuous-domain maximum | world | sampled |
| `MQ_STRETCH` / `MQ_SQUASH` | `stretchSingularValues` of each candidate triangle, setup to posed frame; worst max and worst min | ratio | no |
| `MQ_INVERSION` | triangles whose sign changes setup to posed frame, A39's rule; slots in `invariants.deformMayFold` (`src/rig.ts`) not counted and **listed** (§3) | count | no |
| `MQ_TRANSITION` | §5's edge bound across a region's transition band | px | no |

- [agreed, spine-parts#126] **P12 — the new measurements use the tracer's
  8-connected background flood**, filled over **all** art (several islands, as
  the authored-mesh fit does). `measureAuthoredMeshFit` keeps its 4-connected
  behaviour unchanged for every existing caller, and no old report is
  reinterpreted. Every new raster row records its connectivity and threshold
  (`MeasureRow.art`); where the 4-connected measurement would differ (a
  diagonal pinch), **both** labelled results are exposed rather than
  harmonised, and a diagonal-pinch refusal keeps its own reason.
- [proposal] **Holes are spanned and reported; islands are bridged or
  refused.** A reduction keeps the source's single loop. Art islands the
  source does not reach stay uncovered and fail `MQ_COVERAGE`; they are never
  deleted (`REDUCE_ISLAND_UNREACHED` if the caller asked for full coverage).
- **Correction 2 — raster sensitivity in the row's unit.** Revision 1 flagged
  a row when `|value − bound| < 1 / pageScale`, which is a distance in drawing
  pixels and means nothing for a coverage fraction or a pixel count.
  [proposal] Each raster row now carries `RasterSensitivity` (§2): the
  **spatial quantum** of the grid (`1 / pageScale` drawing pixels) and,
  separately, the **value increment** in the row's own unit — `spatialQuantum`
  for px rows, `1 / artSampleCount` for fraction rows, `1` for count rows.
  `nearBound` compares `|value − bound|` with the value increment, and
  equality is its own state (`at-bound`). It is a **diagnostic**: it changes
  no verdict, and neither increment bounds what shifting or resampling a
  whole boundary would do to the value — so it is not an error guarantee and
  the report never calls it one.
- [agreed, spine-parts#126] **P14 — grid metadata plus that correctly typed
  flag is sufficient for the initial contract.** No second-resolution pass is
  mandatory for Stage B. The flag is not a resolution-invariance proof and
  does not close parts#123; optional finer-grid or phase diagnostics may
  follow later with their own declared sampling and mask-resampling policy.
- **Correction 2 — sampled rows.** [proposal] `MQ_LOCAL_DEFORMATION` and
  `MQ_FILL_DISTANCE` compute each carried or measured point geometrically but
  take their maximum over a finite sample set, so each records
  `sampling: { domain, count }` (for local deformation the domain is the art
  pixel centres plus the reference hull UVs, §3), and neither implies a
  maximum over the continuous domain.
- [proposal] **Transition in time** is phase: a motion row is measured at
  every phase in `schedule.phases`, its value is the worst over them, and a
  row whose verdict differs between phases says so.

## 5. Local refinement — three quantities that are not interchangeable

**Existing.**

- `segments` takes `cell`, a whole number of pixels, and keeps a cell when any
  of its pixels is art (`buildSegmentsLattice`, `src/mesh.ts`).
  Its edges are cell sides (`<= cell`, shorter in the clipped last column and
  row, where `xs` and `ys` are clamped with `Math.min(i * cell, w)`) and one diagonal per cell (`<= cell × √2`). That
  relation holds **only because the lattice is unreduced.**
- `contour` takes a Douglas-Peucker `tolerance` — a deviation, not a spacing —
  and has **no interior vertices** at all (AUTHORING §3.4, `contour`, the
  closing paragraph).
- `grid` takes column and row **positions** (`GridSpecInput`, `src/mesh.ts`).
- Nothing in the tree measures edge length or fill distance.

**Agreed and proposed.** The three, defined numerically over a region `R`
(a closed polygon in part-local drawing pixels, clipped to the source hull):

- **Sampling step `s`** — the spacing of the points a generator *proposes*.
  An input to a generator; not a property of any output mesh.
- **Maximum edge length `L(R)`** — the largest Euclidean length, in drawing
  pixels, of any triangle edge that **intersects the closed region** —
  including an edge that only touches its boundary and an edge whose two
  endpoints both lie outside it — measured whole.
- **Fill distance `h(R)`** — the supremum over points `p` of `R` of the
  distance from `p` to the nearest mesh vertex.

Why none follows from another once a mesh is reduced: removing vertices
merges triangles, so a step `s` bounds neither `L` nor `h` of the result; a
small `h` admits long sliver edges along a boundary, so it does not bound `L`;
and `L` bounds `h` only loosely (`h <= L`, since any point of a triangle is
within the triangle's diameter of every vertex; nothing sharper is claimed).

- [agreed, spine-parts#126] **P15 — the guaranteed quantity is `L(R)`**: exact
  on the emitted triangles, resolution-free and deterministic. It guarantees a
  **geometric density condition, not a numerical deformation-error bound by
  itself** — the motion measurement of §3 stays separate and is the only
  evidence about deformation. `h(R)` is informational (`MQ_FILL_DISTANCE`,
  sampled, never gated) and the generator step is reported. A declared region
  survives even when the test motion leaves it still: the bound is geometric
  and holds with no motion at all.

```ts
/** [agreed, spine-parts#126] P16/P17. */
export interface RefinementRegion {
  /** Caller's name, echoed in the report; rigc reads nothing into it. */
  name: string;
  /** Closed polygon, part-local drawing pixels, y down — resolved by parts (P17). */
  polygon: Array<[number, number]>;
  /** L0: every edge that intersects the closed polygon is at most this long, px. */
  maxEdgeLength: number;
  /** Width of the band outside the polygon over which the bound relaxes, px. Finite, >= 0; 0 is a hard edge. */
  transition: number;
  /** In the band, L(d) = L0 + grade × d, d the distance from the polygon, px per px. Finite, >= 0. */
  grade: number;
  /** P17: when parts approximated another shape by this polygon, how — echoed in `effective`, never read. */
  approximation: { from: string; policy: string; maxError: number } | null;
}
```

- [agreed, spine-parts#126] **P16 — linear grade.** In a region's band,
  `L(d) = L0 + grade·d` for `0 <= d <= transition`, with `grade` and
  `transition` finite and nonnegative. An edge that crosses several regions or
  bands is held to the **smallest** bound applicable anywhere on its
  intersection with them; overlapping regions take the minimum. Outside every
  region and band there is no density constraint — a flat region stays
  economical. Retriangulation of neighbouring triangles that conformity
  requires is allowed, and neighbouring triangles are **not** promised
  byte-identical; wholesale refinement of unrelated areas is not allowed.
  [proposal] The checkable form: every inserted vertex lies inside the union
  of the closed regions and their bands.
- [agreed, spine-parts#126] **P17 — parts resolves coordinates and names.**
  rigc receives only part-local numeric polygons and offers no bone-relative
  region API — parts already translates rig-space regions to part-local
  coordinates before building a contour mesh (spine-parts `src/rig.ts`,
  `contourAttachment`). A circle or other shape turned into a polygon carries
  its approximation policy and error in `approximation`, which the report
  echoes. Density regions and control-bone influence regions are different
  concepts: a region changes geometry only, and nothing here changes parts's
  existing overlapping-weight-region refusal.
- [proposal] **Refusals for impossible requests**: `REGION_OUTSIDE_ART` (the
  clipped polygon is empty), `REGION_BOUND_BELOW_GRID` (`maxEdgeLength`
  under one texel in drawing pixels), `REGION_SELF_INTERSECTS`
  (`findSelfIntersection`), `REGION_TRANSITION_NEGATIVE`,
  `REGION_GRADE_NEGATIVE`, `REGION_NOT_FINITE`. A satisfiable bound that
  exhausts the budget is not a refusal; it is the `budget-exhausted`
  termination.

## 6. UVs, weights, protected features and vertex-indexed deform data

**Existing.**

- A generator's UV is its position over the window on the `r6` grid
  (`src/mesh.ts`); an authored mesh's UVs are the author's.
- Weights: every vertex bound, finite and non-negative, summing to 1 within
  `1e-3` (`src/assertions/bodies/a20.ts`); a weight of 0 is refused on a
  generated mesh under `spine-html`. `segmentShares` keeps the strongest
  `maxBones`, drops shares under `minWeight`, renormalises and closes the last
  at `1 − others` (`src/mesh.ts`); defaults `maxBones` 4,
  `minWeight` 0.03, and a `minWeight` under one grid step `0.000001` is
  refused because "a kept binding could be written as 0"
  (`SEGMENTS_DEFAULTS`, `SEGMENTS_WEIGHT_STEP`, `src/compile.ts`). Bind
  coordinates are each bone's local setup space (`bindWeightedVertices`,
  `src/mesh.ts`).
- `hull` and `edges` are derived from the triangles, never defaulted
  (`src/compile.ts`).
- A `deform` key's `vertices` run is **vertex-indexed** — `fromVertex` counts
  vertices, `offset` indexes the deform array, one pair per vertex unweighted
  and one per influence weighted (AUTHORING §4.11; A35 measures the run). A
  `transform` key is a model evaluated over the attachment's own geometry and
  always covers the whole attachment (`evaluateDeformTransform`,
  `src/deformgen.ts`).
- A linked mesh states no geometry of its own (A44) and by default plays the
  source's deform keys (`timelines`, `src/rig.ts`).

**Agreed and proposed.**

- [agreed, spine-parts#126] **Removal keeps attributes bit-for-bit** (P19:
  "surviving vertices keep their attributes unchanged"). A vertex that
  survives keeps its position, UV and bindings exactly; nothing is resampled.
- [proposal] **Insertion interpolates, then binds.** A vertex the operation
  inserts takes its UV and its weight vector by barycentric interpolation in
  the source triangle containing it, on the `r6` grid; its bind coordinates
  are computed per bone from its setup world position, as
  `bindWeightedVertices` does. Influences are then pruned by the call's
  `InfluenceLimits` and closed at `1 − others`, the `segmentShares` rule. An
  insertion is refused rather than given a bone the source triangle did not
  carry.
- [agreed, spine-parts#126] **P19 — parts passes explicit influence limits on
  every weighted call.** A preset may supply them only after expansion; rigc's
  `segments` defaults are never inherited, and in particular the ordinary
  `0.03` floor is never applied to interpolated shares — parts deliberately
  keeps smaller positive shares so its ramp stays continuous (spine-parts
  `src/localweights.ts`, `localInfluences`). `minWeight: 0` is admissible on
  the new path: it drops exact-zero entries and keeps every positive one.
  [proposal] "Exact zero" is read **on the 6-decimal weight grid** the
  bindings are written on: a positive share that rounds to 0 there cannot be
  kept as a positive binding (the reason `SEGMENTS_WEIGHT_STEP` exists), so it
  is dropped and **counted** in the report rather than written as a 0 weight.
  If the protected influences of a vertex do not fit under `maxInfluences`,
  the call is refused (`REDUCE_PROTECTED_INFLUENCES_OVER_CAP`, naming the
  vertex, the bones and the cap); they are never removed silently. Weight
  effects still need §3's motion and `MQ_TRANSITION` to be judged.
- **Correction 3 — `weightJump` and protected edges, defined on the result
  rather than on an algorithm.** A Spine mesh has one UV per vertex, so a UV
  seam cannot exist inside one mesh; the discontinuity that can is in
  weights. [proposal] A source edge whose endpoints' weight vectors differ by
  more than `weightJump` (L1, over bones in `boneOrder`) is **protected**, as
  is every edge in `protect.edges`. Whatever the implementation — edge
  collapse, or vertex removal followed by retriangulation of the hole — the
  result must satisfy two checkable conditions: (a) every protected source
  edge is an edge of the result, so both its endpoints survive and no new
  edge crosses it; (b) no edge of the result that is **not** a source edge
  joins two vertices whose weight vectors differ by more than `weightJump`.
  A removal or retriangulation that would break either is not taken. Parts
  tracks the weight discontinuity as its #115.

```ts
/** [proposal] with P19/P20 folded in. */
export interface ProtectedFeatures {
  /** P20: keep every source hull vertex. Required — no default inside the operation; parts's policy default is false. */
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

/** [agreed, spine-parts#126] P19: stated on every weighted call, never inherited. */
export interface InfluenceLimits {
  /** The cap on bindings per vertex. */
  maxInfluences: number;
  /** Shares under this are dropped; 0 drops only shares that are zero on the weight grid. */
  minWeight: number;
}
```

- [agreed, spine-parts#126] **P20 — the default automatic policy is
  `hull: false`.** Boundary reduction is the consumer's goal; shape is kept by
  the declared boundary and art bounds (`targets.maxBoundaryDeviation`,
  `targets.artFit`), not by locking every boundary sample. `hull: true` stays
  available as an explicit diagnostic or authoring option, alongside
  individual protected vertices and edges. This is a default of parts's new
  opt-in policy; rigc's operation has no default for it (§1), and no existing
  generator changes.
- [agreed, spine-parts#126] **P18 — the first automatic path reduces only
  parts-generated source meshes, before any authored vertex-indexed deform
  key exists on them.** Imported keyed meshes are not a v1 consumer
  requirement. The generic safeguards stay and are controlled:
  [proposal] a reduction never keeps an old index after **any** topology
  change, including one that only reorders vertices (the canonical output
  order of §1 reorders even on removal). Removal-only on an unweighted mesh
  with `vertices` runs: the run is remapped to surviving indices and the
  removed vertices' offsets are dropped — reported, because the removed
  vertices now move by interpolation, which only §3's comparison can judge.
  Each of the following is refused by name (`REDUCE_DEFORM_INDEXED`, naming
  animation, slot, attachment and key): an inserted vertex under a `vertices`
  run; a weighted mesh whose keyed vertices change their influence layout; a
  source mesh with linked meshes that inherit its keys in a way the remap
  does not support. `transform` keys need no remap — they are re-evaluated
  over the new geometry at compile — and the report lists those
  re-evaluations separately from remaps, since their emitted runs change.
- [proposal] The operation lists every linked mesh of a reduced source,
  because they inherit the new topology.

## Stage A controls

[proposal] Suite prefix `MQ`, unused in `selftest.ts` today; names follow the
tree's `CODE_SENTENCE` convention, every one with a positive control and every
row of §4 with a planted failure. Fixtures are generated (`fixtures/public.ts`
convention): checkerboard plates, no literal measured numbers. **The box stays
open:** every name below is a control to be built, and none of them exists
yet — Stage A is not complete until they do, and listing them is not building
them.

- `MQ00_CONTROL_A_MESH_COMPARED_WITH_ITSELF_MEASURES_ZERO_ON_EVERY_ROW_AND_EVERY_FRAME`
- `MQ01_A_HULL_VERTEX_MOVED_INWARD_FAILS_COVERAGE_AND_UNDERCUT_NAMING_THE_WORST_PIXEL`
- `MQ02_A_HULL_VERTEX_PUSHED_OUT_K_PIXELS_MEASURES_OVERSHOOT_K_WITHIN_ONE_SPATIAL_QUANTUM`
- `MQ03_A_SPANNED_HOLE_IS_NOT_OVERSHOOT_AND_IS_COUNTED_AS_HOLE_PIXELS`
- `MQ04_A_DIAGONAL_PINCH_EXPOSES_BOTH_LABELLED_FILLS_AND_THE_LEGACY_FIT_IS_UNCHANGED` (P12)
- `MQ05_ONE_TRIANGLE_FLIPPED_FAILS_ORIENTATION_NAMING_THE_TRIANGLE`
- `MQ06_A_NEAR_COLLINEAR_TRIANGLE_INSIDE_THE_WINDING_BAND_IS_DEGENERATE_AND_ONE_JUST_OUTSIDE_IS_NOT`
- `MQ07_AN_EDGE_CROSSING_A_REGION_WITH_BOTH_ENDPOINTS_OUTSIDE_IS_HELD_TO_THE_REGION_BOUND_NAMING_EDGE_VALUE_AND_BOUND` (P15)
- `MQ08_AN_EDGE_IN_THE_TRANSITION_BAND_IS_HELD_TO_THE_SMALLEST_GRADED_BOUND_ON_ITS_INTERSECTION_AND_ONE_OUTSIDE_IS_FREE` (P16)
- `MQ09_A_MEASUREMENT_WITH_NO_DECLARED_BOUND_IS_UNDECLARED_AND_SATISFIES_NO_REQUIRED_CLAIM` (P6)
- `MQ10_NO_MOTION_SUPPLIED_LEAVES_MOTION_NULL_AND_MOTION_REQUIRED_IS_NOT_ACCEPTED` (P6)
- `MQ11_TWO_CANDIDATES_THAT_DROP_THE_SAME_ART_AGREE_AND_BOTH_FAIL_COVERAGE`
- `MQ12_A_SINGLE_BONE_RIGID_MOTION_NEEDS_NO_INTERIOR_VERTEX_TO_MEASURE_ZERO`
- `MQ13_A_MULTI_BONE_BEND_WITHOUT_INTERIOR_VERTICES_FAILS_LOCAL_DEFORMATION_AT_THE_BEND_FRAME`
- `MQ14_A_LOCALISED_REGION_REFINES_INSIDE_AND_INSERTS_NO_VERTEX_OUTSIDE_ITS_REGION_AND_BAND` (P16)
- `MQ15_A_VERDICT_THAT_DIFFERS_BETWEEN_PHASES_SAYS_SO_NAMING_BOTH_FRAME_IDS` (P7)
- `MQ16_A_VALUE_WITHIN_ONE_VALUE_INCREMENT_OF_ITS_BOUND_IS_FLAGGED_AND_ITS_VERDICT_UNCHANGED` (correction 2)
- `MQ17_A_REMOVAL_REMAPS_A_VERTICES_RUN_A_REORDER_ONLY_CHANGE_REMAPS_TOO_AND_AN_INSERTION_UNDER_ONE_IS_REFUSED_BY_NAME` (P18)
- `MQ18_A_WEIGHT_JUMP_EDGE_SURVIVES_VERTEX_REMOVAL_AND_RETRIANGULATION` (correction 3)
- `MQ19_A_REFERENCE_THAT_FAILS_ITS_OWN_COVERAGE_IS_REFUSED_AS_A_REFERENCE`
- `MQ20_SKELETONS_THAT_DIFFER_IN_ONE_BONE_FIELD_ARE_REFUSED_NAMING_IT` (now one case of `COMPARE_INPUTS_DIFFER`, correction 5)
- `MQ21_A_DOMAIN_UNDER_ITS_SAMPLE_FLOOR_IS_NOT_MEASURABLE_WITH_ITS_COUNT_AND_HULL_SAMPLES_DO_NOT_RAISE_IT` (P9)
- `MQ22_PHYSICS_RESET_IS_THE_SAME_FOR_EVERY_CANDIDATE_AND_A_CHANGED_DT_MOVES_THE_ROWS` (P10)
- `MQ23_EACH_REFUSAL_CODE_IS_REACHED_BY_ONE_INPUT_AND_NAMES_OBJECT_VALUE_AND_REQUIREMENT`
- `MQ24_EACH_TERMINATION_REASON_IS_REACHED_BY_ONE_INPUT`
- `MQ25_TWO_RUNS_ON_ONE_INPUT_WRITE_BYTE_IDENTICAL_REPORTS`
- `MQ26_AN_UNCHANGED_SPEC_EMITS_THE_BYTES_IT_EMITTED_BEFORE` (the emit-hash
  base, read for the reduction's absence)

The five corrections, one positive control and one planted failure each:

- Correction 1 (typed fields), positive:
  `MQ27_CONTROL_TWO_ATTACHMENTS_WITH_THEIR_OWN_MASKS_THRESHOLDS_AND_SAMPLE_FLOORS_ARE_EACH_MEASURED_AND_ECHOED_FIELD_FOR_FIELD`
- Correction 1, planted:
  `MQ28_ONE_MASK_GIVEN_FOR_TWO_ATTACHMENTS_OF_DIFFERENT_SIZE_OR_A_DUPLICATE_CANDIDATE_ID_IS_REFUSED_NAMING_BOTH`
- Correction 2 (raster unit), positive:
  `MQ29_CONTROL_PX_FRACTION_AND_COUNT_ROWS_STATE_THEIR_SPATIAL_QUANTUM_AND_THEIR_OWN_VALUE_INCREMENT_AND_A_VALUE_AT_ITS_BOUND_PASSES_AT_BOUND`
- Correction 2, planted:
  `MQ30_A_COVERAGE_WITHIN_ONE_SPATIAL_QUANTUM_BUT_BEYOND_ONE_SAMPLE_INCREMENT_OF_ITS_BOUND_IS_NOT_FLAGGED`
- Correction 2, sampled rows:
  `MQ31_LOCAL_DEFORMATION_STATES_ITS_SAMPLE_DOMAIN_AND_COUNT_AND_A_SAMPLE_REMOVED_LOWERS_THE_COUNT`
- Correction 3 (admissibility vs density), positive:
  `MQ32_CONTROL_A_COARSE_SOURCE_THAT_MEETS_ITS_ART_BOUNDS_BUT_NOT_THE_REGION_DENSITY_IS_REFINED_NOT_REFUSED`
- Correction 3, planted:
  `MQ33_A_BUDGET_THAT_EXPIRES_BEFORE_ANY_CANDIDATE_MEETS_THE_TARGETS_RETURNS_NO_MESH_NO_GEOMETRY_AND_NOT_ACCEPTED`
- Correction 3, counts:
  `MQ34_A_SOURCE_THAT_IS_NOT_ONE_LOOP_REPORTS_SOURCE_COUNTS_NULL_WITH_A_REASON_NOT_ZEROS`
- Correction 4 (comparison map), positive:
  `MQ35_CONTROL_A_SAMPLE_ON_A_SHARED_UV_EDGE_IS_ONE_HIT_CARRIED_TO_ONE_WORLD_POINT`
- Correction 4, planted:
  `MQ36_OVERLAPPING_UV_TRIANGLES_GIVING_A_SAMPLE_TWO_CARRIERS_ARE_REFUSED_NAMING_THE_SAMPLE_AND_BOTH_TRIANGLES`
- Correction 4, units:
  `MQ37_A_NONUNIFORMLY_SCALED_SETUP_REPORTS_TWO_DECLARED_SINGULAR_SCALES_AND_NO_SINGLE_RATIO`
- Correction 5 (non-mesh equality), positive:
  `MQ38_CONTROL_CANDIDATES_DIFFERING_ONLY_IN_ALLOWLISTED_INPUTS_ARE_COMPARED_AND_A_PERMITTED_FOLD_IS_LISTED_NOT_ZEROED`
- Correction 5, planted:
  `MQ39_A_CHANGED_PHYSICS_SETTING_WITH_IDENTICAL_BONES_IS_REFUSED_NAMING_THE_INPUT_AND_BOTH_VALUES`

The decisions that change behaviour rather than an interface:

- `MQ40_A_CANDIDATE_THAT_PASSES_AT_THRESHOLD_NINE_AND_FAILS_AT_ONE_IS_NOT_ACCEPTED` (Thresholds, P4)
- `MQ41_A_NONZERO_WARMUP_IS_REFUSED_BY_NAME_AND_NOT_RUN_AS_ZERO` (P10)
- `MQ42_A_SELECTION_FRAME_IS_NEVER_HELD_OUT_AND_AN_EMPTY_HELD_OUT_SET_MAKES_NO_HELD_OUT_CLAIM` (P11)
- `MQ43_MIN_WEIGHT_ZERO_KEEPS_EVERY_POSITIVE_SHARE_ON_THE_GRID_AND_PROTECTED_INFLUENCES_OVER_THE_CAP_ARE_REFUSED` (P19)
- `MQ44_A_REFUSED_TRACE_LEAVES_TRACE_DEVIATION_NOT_MEASURABLE_AND_THE_SOURCE_ACCEPTED_ON_ITS_REQUIRED_ROWS` (P13)
- `MQ45_THE_MOTION_ENTRY_IMPORTS_AND_COMPARES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE` (P1, P2; held by the install smoke rather than `selftest.ts`)

## Termination reasons

[proposal] Every `reduce` report carries exactly one:

```ts
export type Termination =
  | { reason: 'no-further-valid-reduction'; candidatesTried: number; blockingConstraint: string }
  | { reason: 'budget-exhausted'; candidatesTried: number; budget: number; result: 'best-meeting-every-bound' | 'none-met-the-targets' }
  | { reason: 'invalid-input'; code: string; detail: string }
  | { reason: 'unsupported-topology'; code: string; detail: string };
```

- **no-further-valid-reduction** — every candidate step from the result
  violates a declared constraint; the report names the constraint that blocked
  the last step. It is a local stop, **not** a minimum: the report never says
  "minimal".
- **budget-exhausted** — `maxCandidates` reached. [agreed, spine-parts#126,
  P6 and correction 3] With `best-meeting-every-bound`, the result is the best
  candidate found that meets **every** required bound — it may be accepted,
  and nothing implies more reduction was impossible or that it is optimal.
  With `none-met-the-targets`, **no mesh is returned and nothing is accepted**;
  the report keeps `sourceCounts` and carries no `geometry`.
- **invalid-input** — a refusal from §1, §3, §5 or §6 by code; no mesh is
  returned.
- **unsupported-topology** — the source is not one loop, a requested
  operation would need a hole or an island cut out (§4), or a deform remap is
  refused (§6); no mesh is returned.

Correction 3, made consistent between this prose and §2's interface: a
candidate's `counts` and `geometry` are `null` exactly when no mesh exists to
measure, and `sourceCounts` is `null` exactly when the source could not be
read as a mesh — a count is never invented to fill the field. Wall time is
never in the document (it would break byte identity); the work figure is
`candidatesTried`, and paired CPU timing is stage D's, measured outside it.

## Stage B scope

[agreed, spine-parts#126] None of the following is a prerequisite for the
first static reduction, and Stage B does not wait for them:

- nonzero physics warm-up (P10 — refused by name until it exists);
- a mandatory finer-grid pass (P14 — the typed flag suffices);
- gating on the traced boundary (P13 — `MQ_TRACE_DEVIATION` is a diagnostic);
- refinement of imported meshes that carry vertex-indexed deform keys (P18).

Stage B may start once this revision is recorded; it does not wait for
parts#126's implementation. What stays distinct: Stage A's control box
remains open until the controls above exist; stages B–D are separate stages;
and downstream production and release-candidate acceptance is parts#126's,
not any stage's here.

## Non-goals

- **No global optimum.** Constrained reduction reports where it stopped and
  why; it never claims the smallest mesh.
- **No anatomy and no intent in rigc.** Region names are echoed, never read.
  Which regions deform, which poses represent the work, which candidate wins:
  parts and the consumer.
- **No pose solver and no new compiler.** The motion comparison poses with the
  core poser that exists; the reduced mesh goes through the ordinary `build`
  and its full gate, with no bypass.
- **No performance claim from counts.** Vertex and triangle counts are not GPU
  or frame-rate evidence.
- **Public and generated assets only.** No private asset, name, screenshot or
  path belongs in this page, its fixtures, its controls or the reports they
  print. Aggregate consumer observations motivate the work and substitute for
  none of the evidence above.
- **No release.** Stage completion does not close #1221 or parts#126 before
  the downstream acceptance parts#126 lists is met.

## Corrections to the issue text, measured on the tree

- #1221 asks to *"state whether an outside-distance metric uses a hole-filled
  silhouette"*. Both existing measurements already do, with **two** fill rules
  (8-connected background for the tracer, 4-connected for the authored-mesh
  fit); §4 records the agreed choice (P12) and keeps the legacy one.
- #1221 lists holes and disconnected islands as cases to support. The format
  forbids cutting either out of one mesh (`traceOutline`, Euler's count), so
  "support" can only mean spanning a hole and bridging or refusing an island;
  §4 states that rather than promising more.
- #1221 refers to *"runtime geometry facilities"* parts can use. The one
  posing entry parts is promised, `spine-rigc/render`, needs spine-core; the
  core poser that does not has no entry. §0 records the agreed new entry (P1).
