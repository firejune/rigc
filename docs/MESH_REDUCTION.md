# Mesh reduction and topology-independent measurement — the shared contract

Stage A of [#1221](https://github.com/firejune/rigc/issues/1221), the upstream
half of [spine-parts#126](https://github.com/firejune/spine-parts/issues/126).
**Nothing in this page is implemented.** It is the contract both repositories
agree on *before* any of stages B–D is written, and it exists so that a reader
who was not in the conversation that produced it can tell three things apart:

- **Existing** — what the tree already provides, cited `file:line` with the
  symbol beside it (line numbers drift; the symbol is the anchor). Every
  existing number below was read off the source at v2.17.1, not restated from
  memory or from the issue.
- **[proposal]** — rigc's proposed answer. **Unsettled until spine-parts
  agrees**, and an objection to any of them is held to the repository's usual
  standard: *it contradicts X*, *it cannot be measured*, *it breaks Y*.
- **Open with parts** — questions only spine-parts can answer. They are
  numbered **P1, P2, …** across the whole page, so the answer can be a list of
  numbers.

Ownership, as #1221 states it and as this page keeps it: **rigc** owns generic
geometry operations, measurable residuals and deterministic diagnostics;
**parts** owns authoring intent, region and bone name resolution, policy
orchestration and candidate selection; **the consumer** declares regions,
quality requirements and representative motion. rigc infers no anatomy and no
policy from a name.

## Inventory — what exists and what is new

| Concern | Existing (verified) | New (stage B–D, all [proposal]) |
| --- | --- | --- |
| Alpha mask and threshold | `AlphaMask` (`src/mesh.ts:584`); art = alpha `>=` threshold (`artOf`, `src/mesh.ts:982`); threshold a whole number in 1..255 (`src/mesh.ts:1500`, `:1998`) | none — reused |
| Silhouette trace, holes, islands, pinch | `traceAlphaOutline` (`src/mesh.ts:1049`): largest 4-connected island, holes filled by an 8-connected background flood (`:1094`), diagonal pinch refused on the filled silhouette (`:1118`–`:1131`); `fillEnclosed` (`:1188`, internal) | none — reused |
| Outline simplification and offset | `simplifyClosedPolygon` (`:740`, Douglas-Peucker), `offsetPolygon` (`:774`, miter clamp `CONTOUR_MITER_LIMIT = 4`, `:652`), `prunePolygon` (`:812`), `findSelfIntersection` (`:879`), `earClip` (`:936`) | constrained reduction with interior vertices (§1, §5, §6) |
| Coverage and overshoot | `measureContourFit` (`:1285`, bounded search), `measureAuthoredMeshFit` (`:1375`, exact distance transform `squaredDistanceToSet`, `:1423`), `MeshFitReport` (`:1333`), `CONTOUR_MIN_COVERAGE = 0.995` (`:642`), `contourOvershootBound` (`:671`) | undercut (inward) distance, worst-sample location, resolution flag (§4) |
| Outline/hull/edges of a triangulation | `traceOutline` (`:1708`), `checkHullOrder` (`:1782`), `meshEdges` (`:1824`); applied to every authored and generated mesh (`authoredHullAndEdges`, `generatedHullAndEdges`, `src/compile.ts:5328`–`:5371`) | none — every reduced mesh passes through them |
| Generators | `ring`, `ribbon`, `grid`, `contour`, `segments` (`MeshKind`, `src/mesh.ts:103`); `buildSegmentsLattice` (`:1991`), `segmentShares` (`:2221`) | an explicit reduction operation, never a new `generator` default (§1) |
| Weights | `bindWeightedVertices` (`:1638`, bindings by bone name); `ModelBinding` (`src/model.ts:151`); A20 coherence (`src/assertions/bodies/a20.ts`) | pruning/normalisation on reduction (§6) |
| Triangle sign, collapse, stretch | `triangleAreas` (`src/deformsurvey.ts:82`), `DEFORM_AREA_EPSILON = 1e-6` (`:44`), `float32AreaNoise` (`:67`), `stretchSingularValues` (`:117`) | reused for orientation/degeneracy (§4) |
| Deform measurement over time | deform survey (`surveyDeformKeys`, `src/deformmeasure.ts:200`; `surveyOfModel`, `src/deformsurvey.ts:2292`), span scan (`scanDeformSpan`, `:1911`), A39 | none — a different question (it measures one mesh against itself, never two meshes against each other) |
| Posing | spine-core poser and rigc's core poser behind one seam (`src/render_shared.ts`, `src/render_core.ts`); `sampleAnimation` (`src/render_shared.ts:1082`), `sampleSetupPose` (`:1106`); `Frame`/`Mesh` pieces with world vertices, page UVs, triangles (`:464`–`:503`) | a comparison over a common UV domain (§3) |
| Two triangulations compared | **nothing.** `src/correspondence.ts` is a *bone* correspondence for `bonedist`/`bench` (`:12`–`:15`), not a mesh one | the whole of §3 |
| Report document | `build-report/1` (`src/assertions/report.ts:108`): versioned, additive, byte-identical for one build, no time or path | `mesh-quality-report/1` (§2) |
| Import surface for parts | `spine-rigc/mesh` holds 11 values and `AlphaMask` (RELEASING.md *The import surface*; `OBSERVED_SYMBOLS`, `scripts/install_smoke.ts:403`–`:420`); `spine-rigc/render` needs spine-core installed beside it | where the new operations are exported (§0) |

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
- `MeshError` (`src/mesh.ts:140`) extends `Error`, not `CompileError`; the
  compiler rewraps it as `CompileError` with the attachment's location
  (`src/compile.ts:5344`–`:5346`, `:5365`–`:5368`).
- The emitted bytes of every existing generator are held by the step-1 hash
  gates against `tools/emit_hashes.base.json` (CLAUDE.md, *The selftest and its
  fixtures*).

**Proposed.**

- [proposal] Every new operation is an **explicit call**. No `generator`
  default changes, no existing generator gains an implicit reduction, and
  `compile` never remeasures or rewrites authored geometry on its own. The
  emit-hash gates are the proof that an unchanged spec emits unchanged bytes.
- [proposal] Geometry-only operations (`reduceMesh`, `measureMeshQuality`) are
  exported from `spine-rigc/mesh`: they need no runtime, and the module
  already imports nothing that does.
- [proposal] The pose/motion comparison (`compareMeshesInMotion`) poses through
  rigc's **core** over the model document, so it needs no spine-core either,
  and is exported from a new named entry, `spine-rigc/meshcompare`. Posing
  through spine-core remains available to a caller that has it, through the
  existing poser seam, and the report states which poser ran (§2).
- [proposal] Refusals are thrown as `MeshReductionError extends MeshError` with
  a readonly `code` (the codes are listed in each section below), so a
  dependant that already catches `MeshError` keeps catching them and one that
  wants the code can read it. Inside `compile` they are rewrapped as
  `CompileError` exactly as `MeshError` is today.

**Open with parts.**

- **P1.** Is a new named entry (`spine-rigc/meshcompare`) acceptable for the
  motion comparison, or does parts require it on `spine-rigc/mesh`, which would
  pull the core poser into an entry that is today pure geometry?
- **P2.** Does parts need the motion comparison through spine-core as well, or
  is the core poser sufficient? (The core is held to spine-core at tolerance 0
  by `core_gate`, CLAUDE.md *The doctrine*.)

## 1. Inputs, coordinate spaces, scaling, threshold, units, tolerances, order

**Existing.**

| Fact | Where |
| --- | --- |
| Positions are **part-local pixels, y down, origin top-left** | `MeshGeometry.points`, `src/mesh.ts:107`; the crop contract, CLAUDE.md *Conventions* |
| UVs are normalised over the part window, `v` from the top edge; a generator writes `x / w`, `y / h` on the 6-decimal grid | `src/mesh.ts:109`, `:576`, `:1589` |
| Triangles are **counter-clockwise in Spine world** (y up) | `src/mesh.ts:111`; segments flips its y-down corners to keep it, `:2163`–`:2166` |
| Spine world is y up, origin bottom-left of the crop; the whole conversion is `src/transform.ts` | `cropToSpineY` (`:117`), `toBoneLocal` (`:243`), `toWorld` (`:286`) |
| A page that states `scale:` is traced on its texels; the author's distances are applied as `value × pageScale` texels, never a measured ratio | `ContourSpecInput.pageScale`, `src/mesh.ts:601`–`:614` (issue #779); overshoot reported back in the drawing's pixels by dividing by the stated scale, `drawingOvershoot`, `src/compile.ts:5310` |
| Alpha threshold: art is `alpha >= threshold`, a whole number in 1..255; generator default 1 | `src/mesh.ts:594`, `:1500`; `CONTOUR_DEFAULTS` (`src/compile.ts:6679`); `SEGMENTS_DEFAULTS` (`src/compile.ts:6351`) |
| The authored-mesh fit is measured at threshold **1**, whatever the attachment's art | `measureAuthoredFit`, `src/compile.ts:5289` |
| The generator grid: 6 decimals, never `-0`; emission then takes each number's float32 name | `r6`, `src/mesh.ts:148`; `f32`, `src/compile.ts:943`; `onModelGrid`, `src/compile.ts:992` |
| Geometric predicate epsilons | duplicate/collinear `1e-9` (`prunePolygon`, `src/mesh.ts:812`); segment meeting `1e-9` (`:846`–`:877`); point-in-triangle `-1e-9` (`:893`); degenerate raster triangle `|2A| < 1e-12` (`:1252`); ear turn `<= 1e-12` (`:955`) |
| A pixel is covered when its **centre** is in or on a triangle — the renderer's convention | `rasteriseTriangles`, `src/mesh.ts:1238`–`:1245` |
| Canonical order already fixed: hull first in walk order; walk starts at the lowest-numbered boundary vertex towards its smaller neighbour; `edges` = outline loop then interior edges sorted | `MeshOutline.walk`, `src/mesh.ts:1686`–`:1691`; `meshEdges`, `:1824` |
| A segments vertex's weights: strongest first, ties in first-named order, the last closing at `1 − others` on the grid | `segmentShares`, `src/mesh.ts:2221`–`:2250` |

**Proposed.**

```ts
/** [proposal] Everything a reduction reads. No field has a default inside the operation. */
export interface MeshReductionInput {
  /** The art, on the grid it is read off: the plate's pixels, or a `scale:` page's texels. */
  mask: AlphaMask;
  /** The `scale:` the page states, when not 1 — the same meaning as `ContourSpecInput.pageScale`. */
  pageScale?: number;
  /** Art is `alpha >= threshold`. Required, a whole number in 1..255. */
  threshold: number;
  /** The mesh to reduce, as the compiler would emit it. */
  source: SourceMesh;
  constraints: ReductionConstraints;
  /** Optional local density requirements — §5. */
  regions?: RefinementRegion[];
  /** Vertices, edges and attributes the reduction may not remove or cross — §6. */
  protect?: ProtectedFeatures;
  /** Work bound — the termination section. Required. */
  budget: { maxCandidates: number };
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

/** All distances in the drawing's pixels; converted to texels by `pageScale` exactly as `contour` converts. */
export interface ReductionConstraints {
  /** Share of art pixel centres the triangles cover, 0..1. Required. */
  minCoverage: number;
  /** Furthest a covered pixel may sit outside the filled silhouette, px. Required. */
  maxOvershoot: number;
  /** Furthest an uncovered art pixel may sit from the covered set, px. Required. */
  maxUndercut: number;
  /** Largest Hausdorff distance between the reduced and the source hull polygons, px. Required. */
  maxBoundaryDeviation: number;
  /** Optional: smallest interior angle any triangle may have, degrees. Undeclared = reported, not gated. */
  minAngle?: number;
}
```

- [proposal] **Units.** Every caller distance is in the drawing's pixels,
  converted to texels by `pageScale` with the arithmetic `buildContourMesh`
  uses (`onGrid`, `src/mesh.ts:1484`–`:1487`), and reported back in the
  drawing's pixels with the grid it was taken on. A fraction is a fraction; an
  angle is degrees.
- [proposal] **No defaults inside the operation.** A missing constraint is a
  `MeshReductionError` naming the field (`REDUCE_INPUT_MISSING`). A preset, if
  one exists, is parts's: it is expanded to numbers *before* the call, and the
  report echoes the numbers the operation ran with (§2, `effective`).
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
     bone's position in the skeleton's bone list.
- [proposal] **Refusals** (each names the object, the value found and the
  value required): `REDUCE_INPUT_MISSING`, `REDUCE_THRESHOLD_RANGE`,
  `REDUCE_MASK_SIZE` (mask bytes ≠ width × height), `REDUCE_UV_RANGE` (outside
  0..1 by more than A22's `1e-6`, `src/assertions/bodies/a22.ts:33`),
  `REDUCE_SOURCE_NOT_ONE_LOOP` (whatever `traceOutline` refuses),
  `REDUCE_SOURCE_FAILS_ITS_OWN_CONSTRAINTS` (the source itself does not meet
  the declared constraints — there is nothing to preserve).

**Open with parts.**

- **P3.** Parts's region and quality inputs: are they authored in the
  drawing's pixels (this proposal) or in texels of a packed page? Parts#126
  says "units, scaling" without fixing which.
- **P4.** Does parts want the reduction to accept a mask at a threshold other
  than the one it was generated with? The compiler measures authored fit at
  threshold 1 regardless (`src/compile.ts:5289`), so a reduction gated at 16
  would be checked by the build at 1.
- **P5.** Presets: does parts keep them (this proposal), or does it need rigc
  to publish a versioned preset table?

## 2. Geometry-only versus pose/motion-validated evidence — the report

**Existing.**

- A gate row is `PASS`, `FAIL`, `SKIP` with a reason, or `PROF` (not in the
  profile), and the summary counts each separately; `measured` is passed plus
  failed and never includes a skip (`GateSummary`, `src/assertions/report.ts:74`–`:96`).
  An assertion with nothing to measure SKIPs and is never a pass (CLAUDE.md
  *Going public*).
- `build-report/1` is versioned and additive, keys in a fixed order, and two
  reports of one build are byte-identical — no time, path or machine
  (`src/assertions/report.ts:101`–`:189`).
- The deform survey keeps "ran and found nothing" distinct from "did not run"
  (`DeformSpan`, `src/deformsurvey.ts:502`–`:542`), passes over a key whose
  slot draws nothing by name rather than counting it (`DeformKeyDraw`,
  `:175`), and records a predicted-but-unreproduced fold as `unconfirmed`, not
  as a pass or a failure (`:531`–`:541`).

**Proposed.** One document, `mesh-quality-report/1`, written by both the
geometry-only and the motion operation. The two kinds of evidence are **two
sections with two summaries**; no figure anywhere adds them.

```ts
/** [proposal] */
export type MeasureState = 'pass' | 'fail' | 'undeclared' | 'refused' | 'not-measurable';

export interface MeasureRow {
  /** Stable code, e.g. `MQ_COVERAGE`, `MQ_OVERSHOOT`, `MQ_LOCAL_DEFORMATION`. */
  code: string;
  /** The object measured: attachment always; slot, skin and region when they apply. */
  object: { attachment: string; slot?: string; skin?: string; region?: string };
  state: MeasureState;
  /** The measured value: present on pass, fail and undeclared; null otherwise. */
  value: number | null;
  /** The declared bound: present on pass and fail; null on undeclared, refused, not-measurable. */
  bound: { op: '<=' | '>='; value: number } | null;
  unit: 'px' | 'world' | 'fraction' | 'degrees' | 'ratio' | 'count';
  /** Where the worst value was taken: present whenever `value` is. */
  worst: WorstSample | null;
  /** Required on refused and not-measurable: a sentence naming what was missing. */
  reason: string | null;
  /** Raster rows only — §4. */
  grid?: { width: number; height: number; pageScale: number | null; quantum: number; resolutionSensitive: boolean };
}

export interface WorstSample {
  /** A pixel (raster rows), a triangle, an edge, a vertex, or a UV sample (motion rows). */
  at: { pixel?: [number, number]; triangle?: number; edge?: [number, number]; vertex?: number; uv?: [number, number] };
  /** Motion rows only: which frame. */
  frame?: { animation: string; time: number; index: number } | 'setup';
}

export interface EvidenceSection {
  rows: MeasureRow[];
  /** Counts per state. `measured` = pass + fail. Never summed across sections. */
  summary: { pass: number; fail: number; undeclared: number; refused: number; notMeasurable: number; measured: number };
  /** pass only when every row is pass or undeclared AND at least one row is pass. */
  verdict: 'pass' | 'fail' | 'not-measured';
}

export interface MeshQualityReport {
  spec: 'mesh-quality-report/1';
  operation: 'reduce' | 'measure' | 'compare';
  /** The numbers the operation ran with, presets expanded (§1). */
  effective: Record<string, number | string | boolean | null>;
  counts: { before: MeshCounts; after: MeshCounts | null };
  geometry: EvidenceSection;
  /** Null when no motion was asked for — never an empty PASS. */
  motion: (EvidenceSection & { poser: 'core' | 'spine-core'; schedule: ScheduleUsed }) | null;
  /** Whether the caller required motion evidence; with `motion.verdict !== 'pass'` the report is not accepted. */
  motionRequired: boolean;
  accepted: boolean;
  termination: Termination | null;
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
  the slot draws nothing at every scheduled frame, no art sample falls inside
  a region, or the poser the row needs is unavailable.
- [proposal] **Missing stimulus is never a pass.** With no motion supplied,
  `motion` is `null` and the geometry section stands alone. With
  `motionRequired: true` and `motion.verdict` anything but `pass` —
  including `not-measured` — `accepted` is false.
- [proposal] Rows are ordered by section, then attachment in skeleton order,
  then code, then region; the document is two-space JSON with a final newline
  and byte-identical for one input, as `build-report/1` is.

**Open with parts.**

- **P6.** Is `accepted` a field parts wants, or does it want the two
  verdicts only and to decide acceptance itself? (Candidate selection is
  parts's; acceptance of one candidate against declared bounds can be rigc's.)
- **P7.** Does parts need per-row values for every frame (large), or only the
  worst sample per row (this proposal) plus an opt-in per-frame table?

## 3. Comparing different triangulations on a common domain

**Existing.**

- Nothing compares two meshes. The deform survey compares a mesh with
  **itself** — the deformed key against the same posed bones with the deform
  cleared (`src/deformmeasure.ts`, header *The frame*).
- A deform moves positions and never UVs, so UV-rasterised coverage is
  identical at every key — stated, and controlled by `DR04`
  (`src/deformmeasure.ts`, header *What is deliberately NOT here*).
- A posed frame's mesh piece carries world vertices, **page** UVs and triangles
  (`Mesh`, `src/render_shared.ts:464`–`:479`); page UVs depend on where the
  region was packed, region UVs do not (A22's note, `src/assertions/bodies/a22.ts:17`–`:24`).
- Sample times: the render walks `count = round(duration × fps)` poses at
  `i / fps` (`sampleAnimation`, `src/render_shared.ts:1082`–`:1096`); the
  protocol rate is `PROTOCOL_FPS = 12` (`src/render_shared.ts:116`). The pose
  oracle's phases are `grid`, `off`, `irr`, `dense` (`SamplePhase`,
  `src/core/animation.ts:879`), with `IRR_OFFSET = 0.381966011` (`:882`) and
  `sampleTime` at `:890`.
- Physics: the render resets at pose 0 and steps by `1/fps` after
  (`src/render_core.ts:24`–`:28`); the oracle's stepped schedule starts at 0
  with the reset and steps by `dt` (`stepSchedule`,
  `src/core/constraints_physics.ts:845`–`:869`), default `dt` 1/60
  (`ORACLE_DEFAULT_DT`, `tools/pose_oracle.ts:493`). **No warm-up exists
  anywhere in the tree.**

**Proposed.**

```ts
/** [proposal] */
export interface MotionComparisonInput {
  /** The built candidates: each a model document plus the Spine pair it was written beside. */
  reference: BuiltCandidate;
  candidates: BuiltCandidate[];
  /** Which attachments to compare, by skin/slot/attachment name. */
  attachments: Array<{ skin?: string; slot: string; attachment: string }>;
  /** The art the reference is held to independently (§3, independent evidence). */
  art: { mask: AlphaMask; threshold: number; pageScale?: number };
  schedule: MotionSchedule;
  bounds: { maxLocalDeformation: number; maxStretch?: number; minStretch?: number };
}

export interface MotionSchedule {
  /** Explicit frames: setup, and per animation either explicit times or a rate. */
  frames: Array<'setup' | { animation: string; times: number[] } | { animation: string; fps: number }>;
  /** Sample phases each animation is walked at; the verdict must hold at every one. */
  phases: Array<'grid' | 'irr'>;
  physics: { mode: 'none' } | { mode: 'step'; dt: number; warmupSteps: number };
  /** Frames the caller used to SELECT a candidate; the report keeps them apart from held-out frames. */
  selection?: string[];
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
  listed. A part with fewer art samples than a declared minimum is
  `not-measurable` with the count stated, not a pass over nothing.
- [proposal] **Coordinate alignment is by construction, never by fitting.**
  Reference and candidates are compiled from one rig and one motion spec
  differing only in the compared attachments' geometry; their bone rosters and
  setup transforms must be identical or the comparison is refused
  (`COMPARE_SKELETONS_DIFFER`, naming the first differing bone and field). No
  registration, translation or scale is solved for — a solved alignment would
  hide exactly the error being measured.
- [proposal] **Units.** Distances are in Spine world units, and every row also
  states the setup-pose world-units-per-drawing-pixel ratio of the attachment,
  measured from its setup world vertices against its part-local points, so a
  reader can convert.
- [proposal] **Physics.** `mode` and `dt` are required whenever any
  physics constraint is active; `warmupSteps` is required with `step` and may
  be 0. A warm-up is `warmupSteps` steps of `dt` at the animation's time 0,
  after the reset and before the first sample, and it is the same for every
  candidate. Nothing here chooses a value.
- [proposal] **Independent evidence.** Agreement between candidates is
  necessary and not sufficient — two candidates that both drop the same art
  agree perfectly. So each candidate, **and the reference**, is held
  separately to: (a) art coverage, overshoot and undercut against the mask at
  setup (§4); (b) the existing gate on its own build, every assertion as it
  runs today (A13 budgets, A20 weight coherence, A21 rim pinning where it
  applies, A22 UV range, A39 winding); (c) every bound in `bounds`. A
  reference that fails (a) or (b) is refused as a reference
  (`COMPARE_REFERENCE_FAILS`), because a deviation from a wrong reference is
  not evidence.

**Open with parts.**

- **P8.** Is the reference always the unreduced source mesh, or must the
  comparison also accept two candidates with no reference (pairwise only)?
  The proposal refuses pairwise-only acceptance for the reason in
  *Independent evidence*.
- **P9.** What minimum art-sample count makes a part measurable? rigc
  proposes the caller declares it; parts may prefer a fixed number.
- **P10.** Does parts want warm-up at all? The tree has none, and the render
  and oracle both start physics from the reset at time 0.
- **P11.** Which frames are held out from selection — does parts supply the
  `selection` list, or does rigc need to split a schedule itself? (The
  proposal: parts supplies it; rigc only keeps the two apart in the report.)

## 4. The measurements, defined

**Existing.**

- **Coverage**: share of art pixels (alpha `>=` threshold, every island) whose
  centre a triangle covers (`measureAuthoredMeshFit`, `src/mesh.ts:1375`–`:1404`).
- **Overshoot**: the furthest covered pixel outside the **filled** silhouette,
  exact Euclidean distance in pixels, on the `r6` grid
  (`squaredDistanceToSet`, `:1423`; result `:1402`). The contour builder's
  ceiling is `margin × 4 + tolerance + 1`, the last term being the one-pixel
  centre-sampling term (`contourOvershootBound`, `:655`–`:673`).
- **The hole-filled silhouette** exists in two flavours. The tracer fills
  background that **no 8-connected** path of background reaches from the
  border (`src/mesh.ts:1078`–`:1094`, issue #1209, landed by PR #1210 —
  CHANGELOG line 29); the authored-mesh fit fills with a **4-connected** flood
  over all art (`:1383`). The file states the two agree on every mask the
  tracer accepts (`:1183`–`:1186`) — they can differ only across a diagonal
  pinch, which the tracer refuses.
- **Holes and islands in the format.** A Spine mesh's outline is one closed
  loop and its triangle count is Euler's for a hole-free triangulation;
  `traceOutline` refuses a pinched vertex, a hole and two islands by name
  (`src/mesh.ts:1700`–`:1781`, header `:1659`–`:1681`). So a mesh can **span**
  a hole and can **bridge** islands (segments does, `src/mesh.ts:1865`–`:1870`),
  and it cannot cut either out.
- **Orientation and degeneracy**: generators emit counter-clockwise in Spine
  world (`src/mesh.ts:111`); `traceOutline` refuses a triangle that repeats a
  vertex (`:1720`–`:1722`); the A39 band (`DEFORM_AREA_EPSILON`,
  `float32AreaNoise`) decides when a sign is not read.
- **Texture stretch**: the singular values of `J = D·P⁻¹` per triangle
  (`stretchSingularValues`, `src/deformsurvey.ts:117`); a plain triangle with no
  area has no map and is counted `degenerate`, never given the identity.

**Proposed.** [proposal] every definition below.

| Code | Definition | Unit | Raster? |
| --- | --- | --- | --- |
| `MQ_COVERAGE` | `measureAuthoredMeshFit`'s coverage, unchanged | fraction | yes |
| `MQ_OVERSHOOT` | its overshoot, against the filled silhouette as defined in the next bullet | px | yes |
| `MQ_UNDERCUT` | the furthest **uncovered** art pixel from the nearest covered pixel, by the same exact distance transform | px | yes |
| `MQ_BOUNDARY_DEVIATION` | symmetric Hausdorff distance between the reduced hull polygon and the source hull polygon, exact on the polygons | px | no |
| `MQ_HOLES` | transparent pixels inside the hull, reported (spanned, drawing nothing) | count | yes |
| `MQ_ISLANDS` | art islands the mesh joins, and the bridge area holding no art | count | yes |
| `MQ_ORIENTATION` | triangles whose signed area in Spine world is negative, outside the A39 band | count | no |
| `MQ_DEGENERATE` | triangles whose \|area\| is inside the A39 band | count | no |
| `MQ_MIN_ANGLE` | smallest interior angle, gated only when `minAngle` is declared | degrees | no |
| `MQ_LOCAL_DEFORMATION` | per UV sample per scheduled frame, world distance between the candidate's and the reference's carried sample (§3); the worst sample is the row's | world | no |
| `MQ_STRETCH` / `MQ_SQUASH` | `stretchSingularValues` of each candidate triangle, setup to posed frame; worst max and worst min | ratio | no |
| `MQ_INVERSION` | triangles whose sign changes setup to posed frame, A39's rule, slots in `invariants.deformMayFold` (`src/rig.ts:1708`) reported and not counted | count | no |
| `MQ_TRANSITION` | §5's edge bound across a region's transition band | px | no |

- [proposal] **The outside distance uses the hole-filled silhouette**, filled
  over **all** art (several islands, as the authored-mesh fit does) with the
  tracer's **8-connected** background flood — the rule #1209 settled. Where the
  4-connected flood `measureAuthoredMeshFit` uses would fill differently (a
  diagonal pinch), the row says so in `reason` rather than silently choosing.
- [proposal] **Holes are spanned and reported; islands are bridged or
  refused.** A reduction keeps the source's single loop. Art islands the
  source does not reach stay uncovered and fail `MQ_COVERAGE`; they are never
  deleted (`REDUCE_ISLAND_UNREACHED` if the caller asked for full coverage).
- [proposal] **Resolution dependence is a field, not a footnote.** Every
  raster row carries its `grid` and a `quantum` of one texel in the drawing's
  pixels (`1 / pageScale`, or 1). A row whose `|value − bound| < quantum` is
  `resolutionSensitive: true` — its verdict could change on a grid one step
  finer — and the verdict is still the measured one. Vector rows carry no
  grid.
- [proposal] **Transition in time** is phase: a motion row is measured at
  every phase in `schedule.phases`, its value is the worst over them, and a
  row whose verdict differs between phases says so.

**Open with parts.**

- **P12.** Is the 8-connected hole fill acceptable for parts, given
  `measureAuthoredMeshFit` (which parts already calls) floods 4-connected? The
  alternatives: change `measureAuthoredMeshFit` (a behaviour change of a
  promised symbol on pinched masks only), or keep both and report which.
- **P13.** Does parts need `MQ_BOUNDARY_DEVIATION` against the **traced**
  silhouette outline as well as against the source hull? (Against the source
  measures what the reduction lost; against the trace measures the art.)
- **P14.** Parts tracks raster-sensitive measurement in its #123. Is a
  `resolutionSensitive` flag sufficient there, or does parts want a second
  measurement at a finer grid?

## 5. Local refinement — three quantities that are not interchangeable

**Existing.**

- `segments` takes `cell`, a whole number of pixels, and keeps a cell when any
  of its pixels is art (`buildSegmentsLattice`, `src/mesh.ts:1991`–`:2020`).
  Its edges are cell sides (`<= cell`, shorter in the clipped last column and
  row, `:2002`–`:2003`) and one diagonal per cell (`<= cell × √2`). That
  relation holds **only because the lattice is unreduced.**
- `contour` takes a Douglas-Peucker `tolerance` — a deviation, not a spacing —
  and has **no interior vertices** at all (AUTHORING §3.4, `contour`, the
  closing paragraph).
- `grid` takes column and row **positions** (`GridSpecInput`, `src/mesh.ts:85`).
- Nothing in the tree measures edge length or fill distance.

**Proposed.** [proposal] the three, defined numerically over a region `R`
(a polygon in part-local drawing pixels, clipped to the source hull):

- **Sampling step `s`** — the spacing of the points a generator *proposes*.
  An input to a generator; not a property of any output mesh.
- **Maximum edge length `L(R)`** — the largest Euclidean length, in drawing
  pixels, of any triangle edge that has a point inside `R`, measured whole.
- **Fill distance `h(R)`** — the supremum over points `p` of `R` of the
  distance from `p` to the nearest mesh vertex.

Why none follows from another once a mesh is reduced: removing vertices
merges triangles, so a step `s` bounds neither `L` nor `h` of the result; a
small `h` admits long sliver edges along a boundary, so it does not bound `L`;
and `L` bounds `h` only loosely (`h <= L`, since any point of a triangle is
within the triangle's diameter of every vertex; nothing sharper is claimed).

- [proposal] **The guaranteed quantity is `L(R)`**: it is exact on the emitted
  triangles, resolution-free, deterministic, and it is what bounds how coarsely
  a bone-driven deformation is interpolated inside the region. `h(R)` and the
  generator step are reported (`h` by sampling, so as a raster row with a
  `grid`), never gated.

```ts
/** [proposal] */
export interface RefinementRegion {
  /** Caller's name, echoed in the report; rigc reads nothing into it. */
  name: string;
  /** Closed polygon, part-local drawing pixels, y down. */
  polygon: Array<[number, number]>;
  /** Every edge with a point inside the polygon is at most this long, px. */
  maxEdgeLength: number;
  /** Width of the band outside the polygon over which the bound relaxes, px. Required; 0 is a hard edge. */
  transition: number;
  /** In the band, the bound grows by this many px per px of distance from the polygon. Required when transition > 0. */
  grade: number;
}
```

- [proposal] **Overlaps**: at a point inside several regions or bands, the
  smallest applicable bound holds. **Outside** every region and band, no edge
  bound applies — a flat region stays economical. A region is never optimised
  away because the supplied motion does not exercise it: the bound is
  geometric and holds with no motion at all.
- [proposal] **Refusals for impossible requests**: `REGION_OUTSIDE_ART` (the
  clipped polygon is empty), `REGION_BOUND_BELOW_GRID` (`maxEdgeLength`
  under one texel in drawing pixels), `REGION_SELF_INTERSECTS`
  (`findSelfIntersection`), `REGION_TRANSITION_NEGATIVE`. A satisfiable bound
  that exhausts the budget is not a refusal; it is the `budget-exhausted`
  termination.
- [proposal] Denser geometry and stronger weight influence are separate: a
  region changes geometry only. Influence is §6's.

**Open with parts.**

- **P15.** Is `L(R)` the measurable contract parts wants for "denser here", or
  does parts need fill distance guaranteed (which would make the gate
  resolution-dependent)?
- **P16.** The transition form: is a linear grade parts's model, or does parts
  need a different falloff stated numerically?
- **P17.** Region coordinates: does parts resolve names and coordinates to
  part-local drawing pixels before the call (this proposal), or does it need
  rigc to accept bone-relative regions?

## 6. UVs, weights, protected features and vertex-indexed deform data

**Existing.**

- A generator's UV is its position over the window on the `r6` grid
  (`src/mesh.ts:1589`); an authored mesh's UVs are the author's.
- Weights: every vertex bound, finite and non-negative, summing to 1 within
  `1e-3` (`src/assertions/bodies/a20.ts:86`); a weight of 0 is refused on a
  generated mesh under `spine-html`. `segmentShares` keeps the strongest
  `maxBones`, drops shares under `minWeight`, renormalises and closes the last
  at `1 − others` (`src/mesh.ts:2221`–`:2250`); defaults `maxBones` 4,
  `minWeight` 0.03, floor one grid step `0.000001`
  (`src/compile.ts:6351`–`:6354`). Bind coordinates are each bone's local
  setup space (`bindWeightedVertices`, `src/mesh.ts:1638`).
- `hull` and `edges` are derived from the triangles, never defaulted
  (`src/compile.ts:5315`–`:5371`).
- A `deform` key's `vertices` run is **vertex-indexed** — `fromVertex` counts
  vertices, `offset` indexes the deform array, one pair per vertex unweighted
  and one per influence weighted (AUTHORING §4.11; A35 measures the run). A
  `transform` key is a model evaluated over the attachment's own geometry and
  always covers the whole attachment (`evaluateDeformTransform`,
  `src/deformgen.ts:243`–`:273`).
- A linked mesh states no geometry of its own (A44) and by default plays the
  source's deform keys (`timelines`, `src/rig.ts:977`–`:984`).

**Proposed.**

- [proposal] **Removal keeps attributes bit-for-bit.** A vertex that survives
  keeps its position, UV and bindings exactly; nothing is resampled.
- [proposal] **Insertion interpolates, then binds.** A vertex the operation
  inserts takes its UV and its weight vector by barycentric interpolation in
  the source triangle containing it, on the `r6` grid; its bind coordinates
  are computed per bone from its setup world position, as
  `bindWeightedVertices` does. Influences are then pruned to the caller's
  `maxInfluences` and `minWeight` and closed at `1 − others`, the
  `segmentShares` rule. An insertion is refused rather than given a bone the
  source triangle did not carry.
- [proposal] **Attribute discontinuities.** A Spine mesh has one UV per
  vertex, so a UV seam cannot exist inside one mesh; the discontinuity that
  can is in weights. An edge whose endpoints' weight vectors differ by more
  than the caller's `weightJump` (L1) is protected: no collapse crosses it.
  Parts tracks this as its #115.

```ts
/** [proposal] */
export interface ProtectedFeatures {
  /** Keep every source hull vertex. */
  hull: boolean;
  /** Source vertex indices that must survive. */
  vertices?: number[];
  /** Region polygons whose boundary vertices must survive. */
  regionBoundaries?: string[];
  /** L1 weight-vector difference above which an edge may not be collapsed. Undeclared = no such protection, reported. */
  weightJump?: number;
  /** Influence pruning on inserted vertices. Required when the source is weighted. */
  maxInfluences?: number;
  minWeight?: number;
}
```

- [proposal] **Deform timelines.** A reduction never keeps an old index after
  changing topology. Removal-only on an unweighted mesh with `vertices` runs:
  the run is remapped to surviving indices and the removed vertices' offsets
  are dropped — reported, because the removed vertices now move by
  interpolation, which only §3's comparison can judge. Any of the following is
  refused by name (`REDUCE_DEFORM_INDEXED`, naming animation, slot,
  attachment and key): an inserted vertex under a `vertices` run; a weighted
  mesh whose keyed vertices change their influence set; a source mesh with
  linked meshes that play its keys. `transform` keys need no remap — they are
  re-evaluated over the new geometry at compile — and the report lists them,
  since their emitted runs change.
- [proposal] The operation lists every linked mesh of a reduced source,
  because they inherit the new topology.

**Open with parts.**

- **P18.** Does parts's automatic mode ever reduce a mesh that already
  carries `vertices` deform keys, or only meshes it generated itself? (If
  only its own, `REDUCE_DEFORM_INDEXED` is a guard that never fires there.)
- **P19.** Influence limits on inserted vertices: does parts state
  `maxInfluences`/`minWeight` per call, or reuse the `segments` falloff it
  generated with?
- **P20.** Is protecting every hull vertex (`hull: true`) ever wanted, given
  that boundary vertices are what parts's own experiments found too numerous?

## Stage A controls

[proposal] Suite prefix `MQ`, unused in `selftest.ts` today; names follow the
tree's `CODE_SENTENCE` convention, every one with a positive control and every
row of §4 with a planted failure. Fixtures are generated (`fixtures/public.ts`
convention): checkerboard plates, no literal measured numbers.

- `MQ00_CONTROL_A_MESH_COMPARED_WITH_ITSELF_MEASURES_ZERO_ON_EVERY_ROW_AND_EVERY_FRAME`
- `MQ01_A_HULL_VERTEX_MOVED_INWARD_FAILS_COVERAGE_AND_UNDERCUT_NAMING_THE_WORST_PIXEL`
- `MQ02_A_HULL_VERTEX_PUSHED_OUT_K_PIXELS_MEASURES_OVERSHOOT_K_WITHIN_ONE_QUANTUM`
- `MQ03_A_SPANNED_HOLE_IS_NOT_OVERSHOOT_AND_IS_COUNTED_AS_HOLE_PIXELS`
- `MQ04_A_DIAGONAL_PINCH_NAMES_WHICH_FILL_IT_WAS_MEASURED_WITH`
- `MQ05_ONE_TRIANGLE_FLIPPED_FAILS_ORIENTATION_NAMING_THE_TRIANGLE`
- `MQ06_A_NEAR_COLLINEAR_TRIANGLE_INSIDE_THE_WINDING_BAND_IS_DEGENERATE_AND_ONE_JUST_OUTSIDE_IS_NOT`
- `MQ07_AN_EDGE_LONGER_THAN_THE_REGION_BOUND_FAILS_NAMING_EDGE_VALUE_AND_BOUND`
- `MQ08_AN_EDGE_IN_THE_TRANSITION_BAND_IS_HELD_TO_THE_GRADED_BOUND_AND_ONE_OUTSIDE_IS_FREE`
- `MQ09_A_MEASUREMENT_WITH_NO_DECLARED_BOUND_IS_UNDECLARED_AND_NOT_IN_THE_PASS_COUNT`
- `MQ10_NO_MOTION_SUPPLIED_LEAVES_MOTION_NULL_AND_MOTION_REQUIRED_IS_NOT_ACCEPTED`
- `MQ11_TWO_CANDIDATES_THAT_DROP_THE_SAME_ART_AGREE_AND_BOTH_FAIL_COVERAGE`
- `MQ12_A_SINGLE_BONE_RIGID_MOTION_NEEDS_NO_INTERIOR_VERTEX_TO_MEASURE_ZERO`
- `MQ13_A_MULTI_BONE_BEND_WITHOUT_INTERIOR_VERTICES_FAILS_LOCAL_DEFORMATION_AT_THE_BEND_FRAME`
- `MQ14_A_LOCALISED_REGION_REFINES_INSIDE_AND_LEAVES_THE_SURROUNDINGS_UNCHANGED`
- `MQ15_A_VERDICT_THAT_DIFFERS_BETWEEN_PHASES_SAYS_SO`
- `MQ16_A_VALUE_WITHIN_ONE_QUANTUM_OF_ITS_BOUND_IS_RESOLUTION_SENSITIVE`
- `MQ17_A_REMOVAL_REMAPS_A_VERTICES_RUN_AND_AN_INSERTION_UNDER_ONE_IS_REFUSED_BY_NAME`
- `MQ18_A_WEIGHT_JUMP_EDGE_IS_NOT_COLLAPSED`
- `MQ19_A_REFERENCE_THAT_FAILS_ITS_OWN_COVERAGE_IS_REFUSED_AS_A_REFERENCE`
- `MQ20_SKELETONS_THAT_DIFFER_IN_ONE_BONE_FIELD_ARE_REFUSED_NAMING_IT`
- `MQ21_A_PART_UNDER_THE_SAMPLE_FLOOR_IS_NOT_MEASURABLE_WITH_ITS_COUNT`
- `MQ22_PHYSICS_RESET_AND_WARMUP_ARE_THE_SAME_FOR_EVERY_CANDIDATE_AND_A_CHANGED_DT_MOVES_THE_ROWS`
- `MQ23_EACH_REFUSAL_CODE_IS_REACHED_BY_ONE_INPUT_AND_NAMES_OBJECT_VALUE_AND_REQUIREMENT`
- `MQ24_EACH_TERMINATION_REASON_IS_REACHED_BY_ONE_INPUT`
- `MQ25_TWO_RUNS_ON_ONE_INPUT_WRITE_BYTE_IDENTICAL_REPORTS`
- `MQ26_AN_UNCHANGED_SPEC_EMITS_THE_BYTES_IT_EMITTED_BEFORE` (the emit-hash
  base, read for the reduction's absence)

## Termination reasons

[proposal] Every `reduce` report carries exactly one:

```ts
export type Termination =
  | { reason: 'no-further-valid-reduction'; candidatesTried: number; blockingConstraint: string }
  | { reason: 'budget-exhausted'; candidatesTried: number; budget: number; bestSoFar: true }
  | { reason: 'invalid-input'; code: string; detail: string }
  | { reason: 'unsupported-topology'; code: string; detail: string };
```

- **no-further-valid-reduction** — every candidate step from the result
  violates a declared constraint; the report names the constraint that blocked
  the last step. It is a local stop, **not** a minimum: the report never says
  "minimal".
- **budget-exhausted** — `maxCandidates` reached; the result is the best valid
  mesh found, the counts and residuals are its, and nothing implies more
  reduction was impossible.
- **invalid-input** — a refusal from §1, §5 or §6 by code; no mesh is
  returned.
- **unsupported-topology** — the source is not one loop, a requested
  operation would need a hole or an island cut out (§4), or a deform remap is
  refused (§6); no mesh is returned.

In every case `counts.before` is reported; `counts.after` and the geometry
section exist only when a mesh is returned. Wall time is never in the
document (it would break byte identity); the work figure is
`candidatesTried`, and paired CPU timing is stage D's, measured outside it.

## Non-goals

- **No global optimum.** Constrained reduction reports where it stopped and
  why; it never claims the smallest mesh.
- **No anatomy and no intent in rigc.** Region names are echoed, never read.
  Which regions deform, which poses represent the work, which candidate wins:
  parts and the consumer.
- **No pose solver and no new compiler.** The motion comparison poses with the
  posers that exist; the reduced mesh goes through the ordinary `build` and
  its full gate, with no bypass.
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
  fit); §4 picks one and P12 asks parts.
- #1221 lists holes and disconnected islands as cases to support. The format
  forbids cutting either out of one mesh (`traceOutline`, Euler's count), so
  "support" can only mean spanning a hole and bridging or refusing an island;
  §4 states that rather than promising more.
- #1221 refers to *"runtime geometry facilities"* parts can use. The one
  posing entry parts is promised, `spine-rigc/render`, needs spine-core; the
  core poser that does not has no entry. §0 proposes one and P1 asks.
