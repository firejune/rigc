# Mesh reduction and topology-independent measurement — the shared contract

> The dependant is **rig-parts** (named spine-parts until 2026-10-09; its GitHub
> URLs redirect, its issue numbers are unchanged, and the versions this page
> cites were released under the old name).
>
> **Revision 2.** Agreed against
> [rig-parts#126, comment 6041707537](https://github.com/firejune/rig-parts/issues/126#issuecomment-6041707537),
> which answers P1–P20 and lists five contract corrections, read at parts
> `836ffb1` and rigc `2af8693`. Revision 1 (PR #1222) asked the questions; this
> revision records the answers, folds each into the interface it changes, and
> maps each correction to a control pair in *Stage A controls*. The answer
> settles the requested consumer behaviour; it does not assert that either
> repository has implemented it, and neither does this page.

Stage A of [#1221](https://github.com/firejune/rigc/issues/1221), the upstream
half of [rig-parts#126](https://github.com/firejune/rig-parts/issues/126).
It is the contract both repositories agree on *before* any of stages B–D is
written. **Stage B1 ([#1224](https://github.com/firejune/rigc/issues/1224))
implements the geometry measurement** — `measureMeshQuality` and the
`mesh-quality-report/1` document, in `src/meshquality.ts`, re-exported through
`rig-c/mesh` — and **stage B2 implements the reduction**: `reduceMesh`,
in `src/meshreduce.ts`, re-exported through the same entry. Every clause the
tree now does is marked **[implemented, #1224]** and says what the tree does,
cited by path and symbol; *The reduction as implemented* gathers the choices B2
had to make. **Stage C1 ([#1230](https://github.com/firejune/rigc/issues/1230))
implements the motion comparison** — `compareMeshesInMotion`, in
`src/meshcompare.ts`, writing the `motion` section of the same document, and
**stage C2** gives it its named entry, `rig-c/meshcompare`, held from an
install with no spine-core by the install smoke (`MQ45`), and builds the rest
of its controls. Its clauses are marked **[implemented, #1230]**, and *The
comparison as implemented* gathers the choices C1 and C2 had to make. The page exists
so that a reader who was
not in the conversation that produced it can tell five things apart:

- **Existing** — what the tree already provides, cited by file path and
  symbol name (or a short quoted phrase where there is no symbol), never by
  line number, because line numbers move with nothing going red. Every
  existing number below was read off the source at v2.17.1, not restated from
  memory or from the issue. Facts about parts are cited the same way, as
  `rig-parts src/<file>` plus a symbol, and were read at parts `836ffb1`.
- **[agreed, rig-parts#126]** — decided by parts in the comment above. Each
  decision keeps its question number (**P1 … P20**) so the trail from question
  to answer survives.
- **[proposal]** — rigc's answer to something parts did not decide. Still
  unsettled until parts agrees, and an objection is held to the repository's
  usual standard: *it contradicts X*, *it cannot be measured*, *it breaks Y*.
  Every number on this page that parts did not state is a proposal.
- **Correction N** — one of the five corrections parts listed, applied to the
  interface or definition it names, each with a positive control and a planted
  failure in *Stage A controls*.
- **[implemented, #1224]** — what the tree does since stage B1, held by the
  `mesh-quality` suite's `MQ` controls in `selftest.ts`. Where the
  implementation had to decide something the contract left open, or had to add
  a field, the clause says so beside the mark rather than leaving the proposal
  text to imply it.
- **[implemented, #1230]** — what the tree does since stage C1, held by the
  `mesh-compare` suite's `MQ` controls in `selftest.ts`, under the same rule.

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
| Outline simplification and offset | in `src/mesh.ts`: `simplifyClosedPolygon` (Douglas-Peucker), `offsetPolygon` (miter clamp `CONTOUR_MITER_LIMIT = 4`), `prunePolygon`, `findSelfIntersection`, `earClip` | constrained reduction with interior vertices (§1, §5, §6) — [implemented, #1224] `reduceMesh`, `src/meshreduce.ts` |
| Coverage and overshoot | in `src/mesh.ts`: `measureContourFit` (bounded search), `measureAuthoredMeshFit` (exact distance transform, internal `squaredDistanceToSet`), `MeshFitReport`, `CONTOUR_MIN_COVERAGE = 0.995`, `contourOvershootBound` | undercut (inward) distance, worst-sample location, raster sensitivity in each row's unit (§4) — [implemented, #1224] `measureMeshQuality`, `src/meshquality.ts` |
| Outline/hull/edges of a triangulation | `traceOutline`, `checkHullOrder`, `meshEdges` in `src/mesh.ts`; applied to every authored and generated mesh (`authoredHullAndEdges`, `generatedHullAndEdges`, `src/compile.ts`) | none — every reduced mesh passes through them |
| Generators | `ring`, `ribbon`, `grid`, `contour`, `segments` (`MeshKind`, `src/mesh.ts`); `buildSegmentsLattice`, `segmentShares` | an explicit reduction operation, never a new `generator` default (§1) |
| Weights | `bindWeightedVertices` in `src/mesh.ts` (bindings by bone name); `ModelBinding` (`src/model.ts`); A20 coherence (`src/assertions/bodies/a20.ts`) | explicit influence limits on every weighted call (§6) — [implemented, #1224] `reduceMesh`, `src/meshreduce.ts`, on every inserted vertex |
| Triangle sign, collapse, stretch | in `src/deformsurvey.ts`: `triangleAreas`, `DEFORM_AREA_EPSILON = 1e-6`, `float32AreaNoise`, `stretchSingularValues` | reused for orientation/degeneracy (§4) — [implemented, #1224] the first three and the band they make (`areaBand`) moved unchanged to `src/areaband.ts`, which `src/deformsurvey.ts` imports and re-exports, so the geometry entry reads the band without reaching the compiler |
| Deform measurement over time | deform survey (`surveyDeformKeys`, `src/deformmeasure.ts`; `surveyOfModel`, `src/deformsurvey.ts`), span scan (`scanDeformSpan`, `src/deformsurvey.ts`), A39 | none — a different question (it measures one mesh against itself, never two meshes against each other) |
| Posing | spine-core poser and rigc's core poser behind one seam (`src/render_shared.ts`, `src/render_core.ts`); `sampleAnimation`, `sampleSetupPose` and the `Frame`/`Mesh` pieces with world vertices, page UVs, triangles (`src/render_shared.ts`) | a comparison over a common UV domain through the core poser (§3) — [implemented, #1230] `compareMeshesInMotion` poses through `poseRawSetup` and `poseRawAnimationEach` (`src/core/raw.ts`), the walk `src/render_core.ts` steps with, not through the render seam |
| Two triangulations compared | **nothing.** `src/correspondence.ts` is a *bone* correspondence for `bonedist`/`bench` (`BONEDIST_SPEC`, `IDENTITY_CORRESPONDENCE`), not a mesh one | the whole of §3 — [implemented, #1230] `src/meshcompare.ts` |
| Report document | `build-report/1` (`src/assertions/report.ts`): versioned, additive, byte-identical for one build, no time or path | `mesh-quality-report/1` (§2) — [implemented, #1224] for `measure`: `writeMeshQualityReport`, `src/meshquality.ts` |
| Import surface for parts | `rig-c/mesh` holds 11 values and `AlphaMask` (RELEASING.md *The import surface*; `OBSERVED_SYMBOLS`, `scripts/install_smoke.ts`); `rig-c/render` needs spine-core installed beside it | `rig-c/mesh` (geometry) and `rig-c/meshcompare` (motion), §0 — [implemented, #1224] the geometry half: five values held by the smoke's `AGREED_IN_1224` row; [implemented, #1230] the motion half: `compareMeshesInMotion` and `uvCarriers` held by its `AGREED_IN_1230` row, and the comparison called from an install with no spine-core (`MESHCOMPARE_PROBE_SOURCE`, `scripts/install_smoke.ts`) |

## 0. Where the operations live, and what they never change

**Existing.**

- The named entries are the API and a symbol is promised only once a
  dependant is observed using it (RELEASING.md *The import surface*). Through
  `rig-c/mesh` parts is promised `traceAlphaOutline`, `traceOutline`,
  `earClip`, `offsetPolygon`, `prunePolygon`, `simplifyClosedPolygon`,
  `signedArea`, `findSelfIntersection`, `checkHullOrder`,
  `measureAuthoredMeshFit`, `MeshError`, and the type `AlphaMask`.
  `measureContourFit`, `meshEdges`, `buildSegmentsLattice` and `segmentShares`
  are exported by the module and **not** promised.
- `rig-c/render` loads `@esotericsoftware/spine-core` on import, which the
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

- [implemented, #1224] Every new operation is an **explicit call**. No
  `generator` default changes, no existing generator gains an implicit
  reduction, and `compile` never remeasures or rewrites authored geometry on its
  own. The emit-hash gates are the proof that an unchanged spec emits unchanged
  bytes, and `EH06` and `MB07` hold the gallery's builds to that base on every
  run; `MQ26` holds that no module under `src/` but `src/mesh.ts`,
  `src/meshquality.ts`, `src/meshreduce.ts` and — since stage C1 —
  `src/meshcompare.ts` names any of the three operations, so
  nothing a build reaches calls them.
- [agreed, rig-parts#126] **P1 — `rig-c/meshcompare` is accepted.**
  Geometry-only operations (`reduceMesh`, `measureMeshQuality`) are exported
  from `rig-c/mesh`, which stays geometry-only; the motion comparison
  (`compareMeshesInMotion`) is exported from the new named entry
  `rig-c/meshcompare`. **Both** entries are held by an installed-package
  smoke with spine-core absent, the scenario the smoke already runs for the
  observed entries. [implemented, #1230] `compareMeshesInMotion`
  is exported from `src/meshcompare.ts`, which links nothing of the runtime
  (`CUR07` derives the linkers from the tree, and it is not among them) and
  nothing of the compiler; `exports["./meshcompare"]` in `package.json` names
  it, crossing no directory `files` does not already ship. The smoke holds it
  twice: the `AGREED_IN_1230` row of `OBSERVED_SYMBOLS` reads its two values
  through the entry with the runtime installed and imports the entry without
  it, and `MESHCOMPARE_PROBE_SOURCE` calls the comparison from the install
  with the runtime taken away (`MQ45`, *Stage A controls*). The
  `drop-meshcompare-entry` plant takes the key out of the packed map and has
  to go red at those steps alone, naming the entry.
- [agreed, rig-parts#126] **P2 — the core poser is sufficient for the
  initial production interface.** `compareMeshesInMotion` poses through rigc's
  core over the model document; no parts consumer gains a spine-core
  dependency, and a second poser backend is not a prerequisite. The report
  records the poser and its version (§2, `poser`); a measurement the core
  poser does not support is `refused` or `not-measurable` by name, never
  silently approximated. [implemented, #1230] `poser` is
  `{ kind: 'core', rigcVersion }`, the version read by `readVersion`
  (`src/package_meta.ts`, moved there unchanged from `src/cli/shared.ts` so a
  library module does not load the CLI to read it), and `null` when no schedule
  was given and nothing was posed; a build the core refuses to pose
  (`CoreInputError`) leaves every motion row `not-measurable` with the core's
  words. The upstream core-gate parity tests (`core_gate`,
  CLAUDE.md *The doctrine*) stay as they are; they are what makes the core's
  poses admissible.
- [implemented, #1224] Refusals are thrown as `MeshReductionError extends
  MeshError` with a readonly `code` (the codes are listed in each section
  below), so a dependant that already catches `MeshError` keeps catching them
  and one that wants the code can read it; the message opens with the code.
  The class is defined in `src/mesh.ts` beside `MeshError`, not in
  `src/meshquality.ts`: that module imports `src/mesh.ts`, which re-exports it,
  and a class extending `MeshError` at the top of the importing module would
  read `MeshError` before `src/mesh.ts` had run. [proposal] Inside `compile`
  they are rewrapped as `CompileError` exactly as `MeshError` is today —
  nothing in `compile` calls them yet.

## 1. Inputs, coordinate spaces, scaling, threshold, units, tolerances, order

**Existing.**

| Fact | Where |
| --- | --- |
| Positions are **part-local pixels, y down, origin top-left** | `MeshGeometry.points`, `src/mesh.ts`; the crop contract, CLAUDE.md *Conventions* |
| UVs are normalised over the part window, `v` from the top edge; a generator writes `x / w`, `y / h` on the 6-decimal grid | `MeshGeometry.uvs` and every builder's `uvs.push(r6(x / w), r6(y / h))`, `src/mesh.ts` |
| Triangles are **counter-clockwise in Spine world** (y up) — every generator since #1236; `contour` and `ring` emitted clockwise before (measured: *Stage C2*, the closed paragraph) | `MeshGeometry.triangles`, `src/mesh.ts`; `buildSegmentsLattice` swaps each y-down triangle's last two corners to keep it ("Emitted counter-clockwise in Spine world"), and `windCounterClockwiseInSpineWorld` does the same for the triples `buildContourMesh` (an `earClip` of the outline) and `buildRingMesh` (strips along the hull) build along a polygon that runs clockwise on screen; held on spine-core's posed world by `CT15` (`contour-mesh`) |
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
| Parts's art is alpha **above** `ART_ALPHA = 8` — the same pixel set as rigc's `>= 9` | rig-parts `src/mesh.ts`, `ART_ALPHA`; its `artMask` in rig-parts `src/contour.ts` tests `alpha > threshold` |
| The contour fit hands rigc `threshold + 1` so rigc's `>=` reads parts's `>` | rig-parts `src/contour.ts`, `contourFit` calling `measureAuthoredMeshFit`, reached from `contourMesh` (the answer names the caller `assertContourFit`; no symbol of that name exists at `836ffb1`, and `contourFit` is the one that makes the call) |
| Rig-space regions are translated to part-local coordinates before the contour mesh is built | rig-parts `src/rig.ts`, the `contourAttachment` closure, mapping each region by the part origin before `contourMesh` |
| The minimum weight is applied inside the segment shares and **not** again to a region's scaled shares, so the declared ramp has no step | rig-parts `src/localweights.ts`, `localInfluences` and its header *The vertex's weights* ("The floor") |

**Thresholds — the agreed rule.** [agreed, rig-parts#126]

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

**Proposed** (with the decisions folded in). [implemented, #1224] Every type in
this block is declared in `src/meshquality.ts` with these fields.
`measureMeshQuality` reads `MeshMeasureInput`: the part of `MeshReductionInput`
a measurement needs, with three changes the implementation had to make — every
bound may be `null` and is then reported `undeclared` (`MeasureTargets`, in
place of `sourceBounds` and `targets`), and three inputs a measurement alone is
handed: the caller's `id` for the mesh, the `referenceHull` that
`MQ_BOUNDARY_DEVIATION` is taken against, and the P9 floors `minArtSamples` and
`regionArtSamples` (one per region, by name). [implemented, #1224]
`MeshReductionInput` is read by `reduceMesh` (`src/meshreduce.ts`), with four
required fields B2 had to add, each one the declared type left no place for:
`minArtSamples` and `regionArtSamples` (P9 makes the floor an input, and every
step is measured), `deform` (P18's keys, typed `DeformTimelineInput` and
`DeformKeyInput` in `src/meshquality.ts`) and `linkedMeshes` (the operation
lists every linked mesh, and the input has to name them for it to).

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

/** [agreed, rig-parts#126] P3: the caller authors in drawing pixels, part-local, y down. */
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
  /** Furthest a covered pixel may sit outside the filled silhouette, px. Required; null = declared absent (#1254). */
  maxOvershoot: number | null;
  /** Furthest an uncovered art pixel may sit from the covered set, px. Required; null = declared absent (#1254). */
  maxUndercut: number | null;
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

- [agreed, rig-parts#126 items 4–5; #1254] **A distance bound may be
  declared absent.** `ArtFitBounds.maxOvershoot` and `maxUndercut` accept
  `null` wherever an `ArtFitBounds` is read — `reduceMesh`'s `sourceBounds`
  and `targets.artFit`, `measureMeshQuality`'s `targets.artFit`, and
  `compareMeshesInMotion`'s `referenceArtFit` and `candidateArtFit`. A `null`
  means exactly what §2 defines `undeclared` to mean: the row is measured, its
  value and worst sample are reported, its `bound` is null and its
  `nearBound` `clear`; it is neither `pass` nor `fail`, is not in the pass
  count, never satisfies a required claim, never refuses a source
  (`REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS`) or a reference
  (`COMPARE_REFERENCE_FAILS`), and never blocks a step or acceptance — in
  `reduceMesh` the one predicate that says so is `artBoundAbsent`, read at
  admission and by `firstBlockingRow`. It is never read as 0, as an unbounded
  number, or as a pass. `EffectiveSettings` echoes the `null` in place
  (`sourceBounds`, `targets.artFit`, `referenceArtFit`, `candidateArtFit`), and
  the report writer serialises it as `null`. `minCoverage` has no such form and
  stays a required number in 0..1.

  **`undefined` and `null` differ on purpose.** A field left out is still
  refused by name (`REDUCE_INPUT_MISSING`, `COMPARE_INPUT_MISSING`), as are NaN
  and a negative number: an omission cannot be told from a caller that forgot
  the field, and "no field has a default" is the rule that keeps the report the
  record of what was declared. Only the explicit `null` is a declaration — the
  caller saying "measure this, do not bound it" — so only it is accepted. The
  widening is additive: an input that declares numbers is read exactly as
  before (the replay below).
- [agreed, rig-parts#126] **P3 — inputs are authored in drawing pixels.**
  Parts resolves every input to part-local drawing pixels, y down, before the
  call. Packing scale never changes the authored quality requirement: a bound
  stated in drawing pixels means the same art on any page. The report echoes
  the source frame, page scale and conversion (`ArtInput.frame`); **no scale is
  ever inferred from the packed page's dimensions.**
- [implemented, #1224] **Units.** Every caller distance is in the drawing's
  pixels; a measurement carries a point to the mask's grid as `px × pageScale`
  and reports a raster distance back as `texels / pageScale`, with the grid it
  was taken on in the row (`RasterSensitivity.grid`). A pixel a row names is a
  cell of the mask's grid. A fraction is a fraction; an angle is degrees.
  [implemented, #1224] A reduction converts no distance of its own: every bound
  a step is held to is read by `measureMeshQuality`, which carries a point to
  the mask's grid as above, so the reduction and the measurement cannot
  disagree about a unit.
- [agreed, rig-parts#126] **P5 — presets are parts's.** A preset is
  explicitly selected, versioned and expanded into numbers before the call;
  the report echoes its name, version and every expanded number. rigc
  publishes no preset table and derives no tolerance from an image. Existing
  explicit modes remain byte-identical. A missing number is a
  `MeshReductionError` naming the field (`REDUCE_INPUT_MISSING`).
- **Fixed tolerances are the tree's own.** [implemented, #1224] Predicates
  use the epsilons in the table above; zero-area is the A39 band —
  `max(DEFORM_AREA_EPSILON × largest |area| in the mesh, float32AreaNoise)`,
  `areaBand` in `src/areaband.ts`, read over the mesh's Spine-world
  coordinates — so a triangle the measurement calls degenerate is one the gate
  would also read no sign off. A reported px value is on the `r6` grid.
  [implemented, #1224] An inserted vertex's position and UV are on the `r6`
  grid, then `f32` at emission, as every generator's are; a surviving vertex
  keeps the source's numbers bit for bit (P19).
- [implemented, #1224] **Canonical output order** (byte-deterministic, A18),
  as `reduceMesh` writes `ReducedMesh` (`src/meshreduce.ts`). Two readings the
  implementation chose: an inserted vertex on the hull is a hull vertex and sits
  in the walk (item 1), so item 3 orders the inserted **interior** vertices; and
  the walk starts at an inserted vertex only when no source vertex is on the
  hull. Item 5 reorders a survivor's bindings and never their values.
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
  [implemented, #1224] `measureMeshQuality` throws the first four. Three
  readings the implementation chose: `REDUCE_MASK_SIZE` compares the mask with
  the frame's `width × pageScale` by `height × pageScale` on the `r6` grid, so a
  product that is not a whole number of texels is refused rather than rounded;
  `REDUCE_INPUT_MISSING` also names a field that is present and out of range
  (a coverage outside 0..1, a negative distance, a floor under 1) and a region
  name given twice, since no other code fits and the message says which; and
  `REDUCE_SOURCE_NOT_ONE_LOOP` — which also covers a stated `hull` the outline
  contradicts and an outline `checkHullOrder` refuses — is **reported**, not
  thrown, by a measurement: correction 3 requires a report whose
  `sourceCounts` is null, so the report carries an `unsupported-topology`
  termination with the code and `traceOutline`'s words. A measurement never
  throws `REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS`; it reports the source's fit as
  rows (`MQ19`). [implemented, #1224] `reduceMesh` throws the first four — and
  `REDUCE_INPUT_MISSING` for every field a reduction reads and a measurement
  does not (`sourceBounds`, a non-null `targets.artFit` — whose two distances
  may each be `null`, declared absent, but not left out — and
  `maxBoundaryDeviation`, `protect`, `influences` and `boneOrder` on a weighted
  source, `budget`, `deform`, `linkedMeshes`) — and **terminates** on the last
  two: `REDUCE_SOURCE_NOT_ONE_LOOP` as `unsupported-topology` with
  `sourceCounts` null, `REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS` as `invalid-input`.
  The line between them: a malformed input is thrown, a well-formed request
  that cannot be met is the report's termination with no mesh (`MQ23`).
- **Correction 3 — source admissibility is not target density.**
  [implemented, #1224] `reduceMesh` measures the source with `sourceBounds` as
  its art fit and refuses on `MQ_COVERAGE`, the 8-connected `MQ_OVERSHOOT`,
  `MQ_UNDERCUT`, and — the source's own build gate — `MQ_ORIENTATION` and
  `MQ_DEGENERATE`; nothing in `targets` is read for admission (`MQ32`). An
  overshoot or undercut bound `sourceBounds` declares `null` is measured and
  admits on nothing — it is not one of those conditions (#1254, `MQ72`).
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

[implemented, #1224] for `operation: 'measure'`: every type below is declared
in `src/meshquality.ts`, `measureMeshQuality` fills one `CandidateReport` with
the caller's `id` in `candidates`, `reference` null, `poser` null,
`motionRequired` false and `motion` null, and `writeMeshQualityReport` writes
the text. Four additions the implementation needed, each additive: (1)
`EffectiveSettings.attachments[].regions`, each region's `{ name,
minArtSamples }` — P9 makes the floor an input and correction 1 echoes every
input, and `EffectiveSettings` had no place for it (§3's input carries it the
same way); (2) `EffectiveSettings.referenceHull`, the polygon the boundary row
was taken against; (3) `EffectiveSettings.targets` is `ReductionTargets |
MeasureTargets | null`, since a measurement's bounds may be undeclared; (4)
`ScheduleUsed`, which the interface names and does not define, was
`MotionSchedule` until stage C defined it — [implemented, #1230] the schedule as
given plus `ScheduleWalked` (`src/meshquality.ts`): every frame walked as a
`FrameRef` with its role, the roles present, `heldOutClaim`, the reset
(`'physics reset at time 0'`) and each walk's step count. A `measure` echoes its `finalThreshold`
as the threshold it was taken at: such a call claims nothing at any other.

[implemented, #1224] for `operation: 'reduce'`: `reduceMesh` fills one
`CandidateReport` with id `result` — the measurement of the canonical result
against `targets`, `art.threshold` and the source hull, so its rows are
`measureMeshQuality`'s and are keyed by the threshold they were taken at (P4) —
and exactly one `termination`; `effective` echoes `sourceBounds`, `targets`, the
source hull as `referenceHull`, and `budget`. One addition, additive and written
only when present: `CandidateReport.changes` (`ReductionChanges`), the figures
§6 says are reported and no row carries — vertices removed and inserted, shares
dropped on the weight grid and shares pruned by `InfluenceLimits`, the deform
keys remapped (each with the source vertices whose offsets were dropped) and
re-evaluated, and the linked meshes — and, last, `acceptedAt` ([implemented,
#1268]; one entry per accepted operation since [implemented, #1279]). It is
absent on a `measure` and whenever no mesh is returned. `effective` also echoes
a reduction's `stopAfterAccepted` and `boundaryRuns`, each only when the input
set it.

`acceptedAt` lists the accepted operations in the order taken, each written
with its keys in this order:

```ts
/** src/meshquality.ts [implemented, #1279] */
export interface AcceptedOperation {
  /** The attempt number — `candidatesTried` as it stood when the operation was taken, 1-based; strictly ascending. */
  step: number;
  /** A refinement insertion, one source vertex removed, or a boundary run replaced by one chord (§8). */
  kind: 'insertion' | 'removal' | 'boundary-run';
  /** Vertices inserted (an insertion: 1) or removed (a removal: 1; a boundary run: 2 or more). */
  count: number;
  /** The source indices removed — each `null` in `indexMap` — in outline order for a run; `[]` for an insertion. */
  sourceVertices: number[];
}
// ReductionChanges.acceptedAt: AcceptedOperation[] — the counts sum to insertedVertices + removedVertices.
```

The unit is the operation, so `stopAfterAccepted: k` replays to the operation
at `acceptedAt[k − 1]` and `candidatesTried` of that replay is its `step`. A
call that does not set `boundaryRuns` takes only insertions and single
removals, so every count is 1 and the list's length is still
`insertedVertices + removedVertices`; only the entries' shape differs from
2.24.0, where each was the bare `step` number.

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

/** [agreed, rig-parts#126] P7/P11: a frame is named by a stable id that carries animation, phase and time. */
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

- [implemented, #1224] **The five states, defined.** `pass`/`fail`: measured against a
  declared bound. `undeclared`: measured, and the caller declared no bound —
  the value and its worst sample are reported, and the row is **not** in the
  pass count. `refused`: the input to *this* measurement is invalid (a region
  outside the art, a bound below the grid), named by code. `not-measurable`:
  the input is valid and the measurement cannot be taken — no motion supplied,
  the slot draws nothing at every scheduled frame, fewer art samples than the
  declared minimum (P9), or the poser does not support the row (P2).
  [implemented, #1224] A row is **required** when the caller declared its
  bound; `MQ_ORIENTATION` and `MQ_DEGENERATE` are required with a bound of 0
  taken from the input's own definition (`SourceMesh.triangles` is
  counter-clockwise in Spine world, and a triangle inside the A39 band has no
  sign to show it), never from a guess. A row that cannot be measured is
  required exactly when its bound was declared, so a reader can tell from
  `effective` which unmeasured rows block acceptance. A row whose value has
  nothing worse than ideal to point at — coverage of every art pixel, no
  overshoot — carries `worst: { at: {} }`.
- [implemented, #1224] **Bounds are inclusive**, and a value exactly at its
  bound passes and carries `nearBound: 'at-bound'` (correction 2: boundary
  equality is handled explicitly, not left to a float comparison's mood).
- [agreed, rig-parts#126] **P6 — `accepted` stays, defined narrowly as
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
- [agreed, rig-parts#126] **P7 — each row carries its worst value and
  location, plus counts and the effective settings**; a per-frame table is
  opt-in (`CandidateReport.perFrame`) for diagnostics. Every worst motion
  sample names its frame by `FrameRef.id`, which carries the phase and a
  stable time — not a bare index — so a result is reproducible and can be
  located in selection or evaluation data.
- [implemented, #1224] Rows are ordered by section, then attachment in
  skeleton order, then code, then region; candidates in the order the caller
  listed them; the document is two-space JSON with a final newline and
  byte-identical for one input, as `build-report/1` is. As implemented: codes
  compare as strings, the attachment's own row (region null) before a
  region's, and where two fills are both exposed (P12) the gated 8-connected
  row before the labelled 4-connected one; every object is rebuilt in the key
  order its type states, so the bytes do not depend on the order an input was
  built in (`MQ25`).
- [implemented, #1280] **Three additive fields**, each written only when
  present, for §8's allocation rows: `MeshMeasureInput.motionAmplitude` (the
  declared amplitude, optional; `null` declares it absent), echoed as
  `EffectiveSettings.motionAmplitude` when the input set it; and
  `MeasureRow.allocation` (`AllocationDetail`: `reading`, and `contrast` or
  `search` on the row that has one), written on the five allocation rows and
  no other. The five rows are geometry rows like any other: sorted by code
  with the rest, counted in the section's `summary`, never required. A report
  of an input that declares nothing new is the report it was before but for
  those five rows and the summary counts they add (§8, *Implemented — the
  allocation rows*; `MQ124`, `MQ126`).

## 3. Comparing different triangulations on a common domain

[implemented, #1230] as *The comparison as implemented* states, below *The
reduction as implemented*; the clauses here keep their marks, and each one C1
implements says so beside it.

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

- [proposal; implemented, #1230] **The common domain is the attachment's region UV square**, not
  its page UVs and not vertex indices. UVs are the one attribute a deform never
  moves and a repack never changes, so a UV point names the same texel of art
  in every candidate at every frame.
- [proposal] **The sample set** is the centre of every art pixel of the mask,
  `((x + 0.5) / w, (y + 0.5) / h)` for each pixel with `alpha >= threshold`,
  plus every reference hull vertex's UV. Each sample is located by barycentric
  coordinates in each candidate's UV triangulation and carried to world by that
  triangle's posed vertices. A sample that lies in no triangle of a candidate
  is **not dropped**: it counts against that candidate's coverage and is
  listed. [implemented, #1230] at the final threshold (`finalThreshold`, P4);
  an uncarried sample is listed by UV in the local-deformation row
  (`MotionRowDetail.uncarried`, for the reference's mesh and the candidate's)
  and left out of the distance; the coverage it costs is the setup art fit's
  `MQ_COVERAGE`.
- **Correction 4 — the comparison map is unambiguous or refused.** A sample
  whose UV lies in more than one triangle of a candidate — overlapping or
  degenerate UV triangles — would otherwise be carried by an arbitrary one.
  [proposal] It is refused by name (`COMPARE_UV_CARRIER_NOT_UNIQUE`, naming the
  candidate, the sample's UV and every triangle that contains it). The one
  exception is a sample on an edge or vertex **shared** by the triangles that
  contain it: there the carriers agree on the carried point by construction,
  and the hit is one hit. A UV triangle inside the A39 area band carries
  nothing and is never chosen as a carrier. [implemented, #1230]
  `uvCarriers` (`src/meshcompare.ts`): containment is each barycentric
  coordinate at least `−1e-9`, `pointInTriangle`'s epsilon (`src/mesh.ts`),
  applied to the coordinates rather than the cross products so it does not
  scale with the UV square; "shared" is read off vertex indices — every
  containing triangle has the same corners at nonzero weight, one or two of
  them — so two triangles that meet at one place through duplicated vertices are
  refused, not excused; the band is `areaBand` over the UVs.
- [agreed, rig-parts#126] **P9 — `minArtSamples` is an explicit positive
  integer input with no hidden rigc constant.** [proposal] It is stated **per
  attachment** (required) and **per region** (required for every region whose
  rows are required); the report states the observed count separately for each
  domain (`MeasureRow.art.samples`). Hull-vertex samples do not count towards
  it. A domain under its floor is `not-measurable` with its count, never a pass
  over nothing. [implemented, #1230] for the attachment's
  and each region's `MQ_LOCAL_DEFORMATION` row; a region's samples are those
  whose UV, carried to the frame's drawing px, lies in its closed polygon. The
  floors' control is `MQ21`'s motion half, printed as `MQ60`
  (`mesh-compare`): a floor one above the art count is `not-measurable` naming
  the count though the hull samples would meet it, for the attachment and for a
  region. A value of 1 is admissible for an explicitly chosen geometry
  investigation of a nonempty part; it is not a production floor, and parts
  supplies the number from its declared policy or versioned preset.
- [proposal] **Coordinate alignment is by construction, never by fitting.**
  No registration, translation or scale is solved for, and no alignment is
  ever fitted to the output vertices — a solved alignment would hide exactly
  the error being measured.
- **Correction 5 — equality covers every non-mesh input.** Identical bone
  rosters and setup transforms are necessary and not sufficient: a changed
  constraint, attachment transform, skin or slot attachment schedule, motion
  track or physics setting confounds the comparison. [proposal; implemented, #1230, the allowlist as
  `allowed` in `src/meshcompare.ts` spells it] Reference and
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
  their frames; the row never reports zero for them. [implemented, #1230] such
  a slot's row holds no bound — `undeclared` — and its value is the fold count,
  with every fold in `MotionRowDetail.folds`; `MQ38`, its control, is printed
  as `MQ63` (`mesh-compare`): the same fold count fails a bound of 0 on the
  same rig without the exemption.
- **Correction 4 — units.** [proposal] Distances are in Spine world units, the
  primary error. A single world-units-per-pixel ratio is invalid under
  nonuniform scale or shear, so it is not reported. Each row instead states
  the **declared** setup map from part-local drawing pixels to world — the
  placement the compile used (`cropToSpineY`, `toBoneLocal`, `toWorld`,
  `src/transform.ts`), read from the build and never measured from vertices —
  as its 2×2 linear part with its two singular scales. [implemented, #1230] as
  the slot bone's setup world 2×2 — `[a, b, c, d]` as the core poses the bone
  from its declared fields — with its singular scales
  (`MotionRowDetail.setupMap`, on every `world` row). It is the slot bone's map
  and is named so: a weighted vertex is carried by its own bones, and no single
  map is claimed for it. Where no single
  declared map exists for an attachment, the conversion is reported as
  `refused` with a reason and the world-space row stands alone.
- [agreed, rig-parts#126] **P10 — no warm-up in v1.** Physics resets and
  steps from time 0, consistently for every candidate, with core-gate and
  render semantics as the baseline. `mode` and `dt` are required whenever any
  physics constraint is active. `warmupSteps: 0` is supported; any other value
  is refused by name (`COMPARE_WARMUP_UNSUPPORTED`) until warm-up is
  implemented and controlled — never silently treated as zero.
  [implemented, #1230] `warmupSteps` other than 0 is refused before any
  document is read (`MQ41`); `mode: 'none'` on a reference that declares a
  physics constraint is `COMPARE_INPUT_MISSING`.
- [agreed, rig-parts#126] **P11 — parts supplies the schedule and the
  selection membership; rigc invents no split.** Frames are named by
  `FrameRef.id` (animation, phase and time). The report keeps
  selection-only and held-out results apart, and a frame used for candidate
  choice is never held out. A held-out claim requires a nonempty set of
  held-out frames disjoint from `selection`, evaluated through the same
  recorded physics reset and `dt`; `setup` is a shared baseline
  (`role: 'baseline'`) and is not held-out evidence. [implemented, #1230] a
  frame is `selection` exactly when its id is in `selection`, `baseline` when
  it is `setup`, and `held-out` otherwise; a selection id the schedule does not
  walk is refused by name rather than read as held out; each motion row carries
  its reading per role, `heldOut` null with no held-out frame, and the
  schedule's `heldOutClaim` is false then (`MQ42`).
- [agreed, rig-parts#126] **P8 — the reference is the unreduced,
  independently gated source mesh.** It may be generated by the automatic
  pipeline; a reference game's mesh or vertex count is not an input. A
  candidate-to-candidate comparison may be reported as a diagnostic and never
  establishes acceptance. [implemented, #1230] the contract's `MQ11`, printed
  as `MQ56`: two candidates that drop the same art read 0 against each other
  and each fails coverage against its own mask; held to that bound, either one
  as the reference is `COMPARE_REFERENCE_FAILS`.
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
  deviation from a wrong reference is not evidence. [implemented, #1230, (a)
  only] each build's art fit at setup is `measureMeshQuality` over its UVs on the
  frame's drawing px — the reading the compiler's authored fit takes
  (`measureAuthoredFit`, `src/compile.ts`) — under `referenceArtFit` or
  `candidateArtFit`, as the build's `geometry` section. [implemented, #1230]
  `COMPARE_REFERENCE_FAILS` (`compareMeshesInMotion`, `src/meshcompare.ts`): a
  reference whose `MQ_COVERAGE`, `MQ_OVERSHOOT` or `MQ_UNDERCUT` fails
  `referenceArtFit` — (a) as written, and nothing else (`REFERENCE_ART_FIT`) —
  is refused before any candidate is measured, naming each failed row with its
  value and bound; a candidate failing the same bound is reported, not refused
  (the contract's `MQ19`, motion half, printed as `MQ59`). Only a **failed**
  row refuses: a reference row that is `not-measurable` — an attachment under
  its sample floor (P9) — leaves its section `not-measured` and the reference
  not accepted, which the report already says, and refusing it would make
  `MQ60`'s floor unreachable at the attachment level. (b), the gate on each build, is
  held where it runs and not a second time: `build` writes
  `skeleton.model.json` only after every assertion passed (*emit only after
  green*), and the module is handed that document's text — not the rig, the
  plates or the Spine pair the gate reads — so it cannot rerun the gate, and
  does not claim to. ⚠️ A document edited after its build is outside (b): the
  install smoke's moved-vertex candidate is exactly such a document, used as a
  planted displacement and never as evidence that a mesh is acceptable.

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
  `fillEnclosed(art, w, h, 4)`, its default; `connectivity: 8` makes it the
  tracer's flood, #1262 — P12 below). `fillEnclosed`'s own comment states the two
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
  world (`MeshGeometry.triangles`, `src/mesh.ts` — every one since #1236, held
  by `CT15`); `traceOutline` refuses a
  triangle that "repeats a vertex, so it has no area"; the A39 band (`DEFORM_AREA_EPSILON`,
  `float32AreaNoise`) decides when a sign is not read.
- **Texture stretch**: the singular values of `J = D·P⁻¹` per triangle
  (`stretchSingularValues`, `src/deformsurvey.ts`); a plain triangle with no
  area has no map and is counted `degenerate`, never given the identity.

**Proposed.** [proposal] every definition below, except where a row is marked
agreed.

[implemented, #1230] `MQ_LOCAL_DEFORMATION`, `MQ_STRETCH` / `MQ_SQUASH` and
`MQ_INVERSION` are measured by `compareMeshesInMotion` (`src/meshcompare.ts`),
as *The comparison as implemented* states.

[implemented, #1224] Every geometry row — every row of the table except
`MQ_LOCAL_DEFORMATION`, `MQ_STRETCH` / `MQ_SQUASH` and `MQ_INVERSION`, which
are stage C's — is measured by `measureMeshQuality` (`src/meshquality.ts`) as
defined here, with these readings of what the table leaves open:

- `MQ_UNDERCUT` is `not-measurable` when the triangles cover no pixel centre,
  since no art pixel then has a distance to a covered one. Its worst pixel is
  `MQ_COVERAGE`'s worst too.
- `MQ_BOUNDARY_DEVIATION` is taken against `MeshMeasureInput.referenceHull`
  and is `not-measurable` without one; `MQ_TRACE_DEVIATION` against the
  outline `traceAlphaOutline` traces, which is the **largest** island's. Both
  are exact on the polygons by a branch and bound along each edge, to `1e-9`
  px before the `r6` grid, and name the candidate hull edge the worst value
  belongs to.
- `MQ_HOLES` counts the pixels the triangles cover that the filled silhouette
  holds and the art does not — the transparent pixels a mesh spans.
- `MQ_ISLANDS` counts the 4-connected art islands (the tracer's,
  `labelIslands`) the triangles cover a pixel of, and names the first pixel of
  the second; the bridge area is not a separate figure — it is the covered
  pixels outside the silhouette, which is `MQ_OVERSHOOT`'s domain.
- `MQ_HOLES`, `MQ_ISLANDS`, `MQ_TRACE_DEVIATION` and `MQ_FILL_DISTANCE` take no
  bound, so they are always `undeclared` when measured; `MQ_MIN_ANGLE` is
  gated only when `minAngle` is declared.
- [implemented, #1280] The five allocation rows at the end of the table take
  no bound either, and are `not-measurable`, naming the field, when an input
  they read is missing — §8, *Implemented — the allocation rows*, gives each
  definition, what each needs and the reading of the amplitude.

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
| `MQ_GRADE` | [agreed, rig-parts#126; implemented, #1280] grade max, max \|h_u − h_v\| / L over edges, h the mean incident edge length — always `undeclared` when measured | ratio | no |
| `MQ_MIN_ANGLE_P10` | [agreed, rig-parts#126; implemented, #1280] the tenth percentile of the triangles' smallest angles, nearest rank — always `undeclared` | degrees | no |
| `MQ_ALLOCATION_CONTRAST` | [agreed, rig-parts#126; implemented, #1280] Δ, with economy E beside it; reads `motionAmplitude` — always `undeclared` when measured | fraction | no (the art is read for the silhouette need) |
| `MQ_DEFORM_LOAD` | [agreed, rig-parts#126; implemented, #1280] max L · Δshare · θ / 4 under `motionAmplitude` — a location reading, **not** predicted motion; always `undeclared` when measured | px | no |
| `MQ_BOUNDARY_NECESSARY` | [agreed, rig-parts#126; implemented, #1280] B\*, over `referenceHull` — always `undeclared` when measured | count | no (the art is read for the cut-off test) |

- [agreed, rig-parts#126; implemented, #1224] **P12 — the new measurements use the tracer's
  8-connected background flood**, filled over **all** art (several islands, as
  the authored-mesh fit does). `measureAuthoredMeshFit` keeps its 4-connected
  behaviour unchanged for every existing caller, and no old report is
  reinterpreted. Every new raster row records its connectivity and threshold
  (`MeasureRow.art`); where the 4-connected measurement would differ (a
  diagonal pinch), **both** labelled results are exposed rather than
  harmonised, and a diagonal-pinch refusal keeps its own reason. As
  implemented: `MQ_OVERSHOOT` and `MQ_HOLES` are taken against the
  8-connected fill and, only when the 4-connected fill holds a different set
  of pixels, again against that one as an `undeclared` row with
  `art.connectivity: 4` — the reading `measureAuthoredMeshFit` gives (`MQ04`);
  `MQ_COVERAGE` and `MQ_UNDERCUT` use no fill and record `connectivity: null`,
  `MQ_ISLANDS` records the 4 of its island labelling.
  [implemented, #1262] `measureAuthoredMeshFit` takes an optional fifth
  argument, `connectivity: 4 | 8`, **default 4**, so every call that passes
  four arguments reads what it read before; `8` floods the background through
  the very `fillEnclosed` call the rows read, and anything else is refused by
  name (a `MeshError`). **A consumer's gate that is to agree with these rows
  should read the fit with `8`, or call `measureMeshQuality` directly** —
  with the default it is on the legacy ruler, and the two part exactly where a
  background pocket meets the outside only at a corner. On the recorded
  sources that is rig-parts's `sample/hair_back`: 2 px with the default and
  5.09902 px with `8`, which is `MQ_OVERSHOOT`'s figure for the same source; on
  the other 18 the three readings are one number. `MQ75` holds the default
  equal to an explicit 4 and to the labelled 4-connected row, `8` equal to
  `MQ_OVERSHOOT` by value and by the pixel the overshoot is read at, and all
  three equal on a mask with no such pocket; `MQ76` plants a fit that is
  passed 8 and floods 4, caught on the pocket naming the pixel, and silent
  where the fills agree.
- [implemented, #1224] **Holes are spanned and reported; islands are bridged or
  refused.** A reduction keeps the source's single loop (every step is read
  back through `traceOutline`). Art islands the source does not reach stay
  uncovered and fail `MQ_COVERAGE`; they are never deleted
  (`REDUCE_ISLAND_UNREACHED`, an `invalid-input` termination, when
  `targets.artFit.minCoverage` is 1 and a 4-connected island has no pixel the
  source covers — named by its first pixel and size).
- **Correction 2 — raster sensitivity in the row's unit.** Revision 1 flagged
  a row when `|value − bound| < 1 / pageScale`, which is a distance in drawing
  pixels and means nothing for a coverage fraction or a pixel count.
  [implemented, #1224] Each raster row now carries `RasterSensitivity` (§2): the
  **spatial quantum** of the grid (`1 / pageScale` drawing pixels) and,
  separately, the **value increment** in the row's own unit — `spatialQuantum`
  for px rows, `1 / artSampleCount` for fraction rows, `1` for count rows.
  `nearBound` compares `|value − bound|` with the value increment, and
  equality is its own state (`at-bound`). It is a **diagnostic**: it changes
  no verdict, and neither increment bounds what shifting or resampling a
  whole boundary would do to the value — so it is not an error guarantee and
  the report never calls it one.
- [agreed, rig-parts#126] **P14 — grid metadata plus that correctly typed
  flag is sufficient for the initial contract.** No second-resolution pass is
  mandatory for Stage B. The flag is not a resolution-invariance proof and
  does not close parts#123; optional finer-grid or phase diagnostics may
  follow later with their own declared sampling and mask-resampling policy.
- **Correction 2 — sampled rows.** [implemented, #1224, for `MQ_FILL_DISTANCE`;
  proposal for `MQ_LOCAL_DEFORMATION`] `MQ_LOCAL_DEFORMATION` and
  `MQ_FILL_DISTANCE` compute each carried or measured point geometrically but
  take their maximum over a finite sample set, so each records
  `sampling: { domain, count }` (for local deformation the domain is the art
  pixel centres plus the reference hull UVs, §3), and neither implies a
  maximum over the continuous domain. `MQ_FILL_DISTANCE`'s domain is the art
  pixel centres inside both the region and the hull polygon, each to its
  nearest mesh vertex, and its `art.samples` is that count, held to the
  region's floor.
- [proposal; implemented, #1230] **Transition in time** is phase: a motion row is measured at
  every phase in `schedule.phases`, its value is the worst over them, and a
  row whose verdict differs between phases says so — `MotionRowDetail.byPhase`
  and `phasesDisagree`, which names the worst frame of the passing phase and of
  the failing one (`MQ15`).

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

- [agreed, rig-parts#126] **P15 — the guaranteed quantity is `L(R)`**: exact
  on the emitted triangles, resolution-free and deterministic. It guarantees a
  **geometric density condition, not a numerical deformation-error bound by
  itself** — the motion measurement of §3 stays separate and is the only
  evidence about deformation. `h(R)` is informational (`MQ_FILL_DISTANCE`,
  sampled, never gated) and the generator step is reported. A declared region
  survives even when the test motion leaves it still: the bound is geometric
  and holds with no motion at all.

```ts
/** [agreed, rig-parts#126] P16/P17. */
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

- [agreed, rig-parts#126] **P16 — linear grade.** In a region's band,
  `L(d) = L0 + grade·d` for `0 <= d <= transition`, with `grade` and
  `transition` finite and nonnegative. An edge that crosses several regions or
  bands is held to the **smallest** bound applicable anywhere on its
  intersection with them; overlapping regions take the minimum. Outside every
  region and band there is no density constraint — a flat region stays
  economical. Retriangulation of neighbouring triangles that conformity
  requires is allowed, and neighbouring triangles are **not** promised
  byte-identical; wholesale refinement of unrelated areas is not allowed.
  [proposal] The checkable form: every inserted vertex lies inside the union
  of the closed regions and their bands. [implemented, #1224] `reduceMesh`
  inserts only there (`MQ14`, `MQ47`, read by the test's own distance), and
  the form has a consequence the agreement did not state, measured while
  building it: an edge from a vertex inside a region's band to a vertex
  further beyond the band than that edge's bound cannot be brought under its
  bound by any insertion the form allows — every split leaves an edge from
  inside the band to that vertex. So a source whose vertices around a region
  are further apart than `L0 + grade·transition` reaches is not refinable
  under P16 without retriangulating or inserting outside the band; the
  refinement stops there by name rather than spending the budget (*The
  reduction as implemented*).
  [corrected, rig-parts#126 / #1229] That consequence held only because the
  piece from the band to the far vertex stayed held however it was split. With
  the exemption below, a split where the edge leaves the band leaves that
  piece touching the band at one point, so it is no longer held, and the
  stated source is refinable inside the band; the stop now covers only what
  stays infeasible (*Changed since v2.19.0*).
- [agreed, rig-parts#126] **P17 — parts resolves coordinates and names.**
  rigc receives only part-local numeric polygons and offers no bone-relative
  region API — parts already translates rig-space regions to part-local
  coordinates before building a contour mesh (rig-parts `src/rig.ts`,
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
  [implemented, #1224] In a reduction the first refused region, in the order
  given, is an `invalid-input` termination carrying the region's code and its
  words; no mesh is returned (`MQ23`, `MQ47`).
  [implemented, #1224] In a measurement each of the six makes that region's
  rows `refused` — §2 defines `refused` with exactly these examples — with the
  reason opening on the code, and the region adds no bound to any other
  region's edges. `REGION_OUTSIDE_ART` fires when the polygon meets no mesh
  edge and no vertex of it lies in the hull polygon: the name says art and the
  definition says the hull, and the definition is what is implemented.
- [implemented, #1224] **`L(R)` and its band, as rows.** `MQ_MAX_EDGE` holds
  every edge that meets the closed polygon, `MQ_TRANSITION` every other edge
  the region holds by `edgeIsHeldByRegion` (below; in 2.19.0, every edge that
  did not meet the polygon and lay within `transition` of it). A region with
  `transition: 0` has no band and no transition row. Each edge's bound is the
  smallest that applies to it anywhere: `L0` of every region it meets, and
  `L0 + grade·d` of every other region that holds it, `d` its distance from
  that region — the nearest point, which is where the graded bound is
  smallest. A row's value is the edge whose
  length most exceeds its own bound, with that edge and that bound, so the row
  fails exactly when an edge it holds is over. A region no edge meets — one
  inside a single triangle — is `not-measurable`, never a pass over no edge.
- [agreed, rig-parts#126] **Which edges a region holds — the exemption.**
  A region's active domain is its closed polygon and, when `transition > 0`,
  the band of that width outside it. An edge is held by the region when it
  meets the domain, **except** when its intersection with the domain is a
  **single point on the band's outer boundary** and the rest of the edge lies
  outside: such an edge is exempt from that region's bound. One definition,
  `edgeIsHeldByRegion(a, b, region)` in `src/meshquality.ts`, is what
  `measureMeshQuality` reads for `MQ_MAX_EDGE` and `MQ_TRANSITION` and what the
  refinement in `src/meshreduce.ts` reads to place a split, so the two cannot
  disagree about an edge.
  - A positive-length intersection is held, including a segment lying along
    the band's outer boundary (`MQ50`), an edge crossing the band or the
    polygon with both ends outside, and an edge with one end on the outer
    boundary that crosses the band (`MQ51`). Two separate touches are two
    points, not one, and are held. Whole-edge measurement and the minimum
    applicable bound are unchanged.
  - Regions are evaluated independently: an exemption from one region never
    removes another region's bound, and the minimum is taken over the regions
    that hold the edge (`MQ52`).
  - `transition: 0`: there is no outer band, and a contact with the authored
    boundary is held under the closed-region rule — never exempt (`MQ53`).
    A later change to that rule needs its own decision.
  - "On the outer boundary" is within `BAND_CONTACT_TOLERANCE`, ten units of
    the `r6` grid, exported beside the predicate: an edge whose nearest
    approach is that close to `transition` and that does not run along the
    boundary is read as touching it. The refinement places its split at half
    that depth inside the band, so the piece it frees is exempt from either
    side of the grid's rounding.
  - [measured, #1229] A consequence of B1's states that the agreement did not name:
    a band whose only nearby edge is exempt holds no edge, so its
    `MQ_TRANSITION` is `not-measurable`, which is not `pass`, and a result
    under it is not accepted. Measured while building `MQ49`, whose fixture
    therefore keeps an edge inside the band.

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

- [agreed, rig-parts#126] **Removal keeps attributes bit-for-bit** (P19:
  "surviving vertices keep their attributes unchanged"). A vertex that
  survives keeps its position, UV and bindings exactly; nothing is resampled.
- [proposal] **Insertion interpolates, then binds.** A vertex the operation
  inserts takes its UV and its weight vector by barycentric interpolation in
  the source triangle containing it, on the `r6` grid; its bind coordinates
  are computed per bone from its setup world position, as
  `bindWeightedVertices` does. Influences are then pruned by the call's
  `InfluenceLimits` and closed at `1 − others`, the `segmentShares` rule. An
  insertion is refused rather than given a bone the source triangle did not
  carry. [implemented, #1224] in `reduceMesh`, with one part **rejected on
  measurement of the types**: bind coordinates are not computed, because
  `SourceMesh.weights` is by bone name without bind coordinates and
  `MeshReductionInput` carries no bone setup transform to compute them from —
  an inserted vertex's weights are by name exactly as a source vertex's are,
  and the compiler binds them as it binds every generated mesh. The containing
  source triangle is the first, by index, whose smallest barycentric coordinate
  is the largest (a point on a shared edge takes the lower-numbered triangle;
  the two agree there). Interpolation can name no bone the triangle's corners
  do not carry, so that refusal has no input that reaches it.
- [agreed, rig-parts#126] **P19 — parts passes explicit influence limits on
  every weighted call.** A preset may supply them only after expansion; rigc's
  `segments` defaults are never inherited, and in particular the ordinary
  `0.03` floor is never applied to interpolated shares — parts deliberately
  keeps smaller positive shares so its ramp stays continuous (rig-parts
  `src/localweights.ts`, `localInfluences`). `minWeight: 0` is admissible on
  the new path: it drops exact-zero entries and keeps every positive one.
  [proposal] "Exact zero" is read **on the 6-decimal weight grid** the
  bindings are written on: a positive share that rounds to 0 there cannot be
  kept as a positive binding (the reason `SEGMENTS_WEIGHT_STEP` exists), so it
  is dropped and **counted** in the report rather than written as a 0 weight.
  If the protected influences of a vertex do not fit under `maxInfluences`,
  the call is refused (`REDUCE_PROTECTED_INFLUENCES_OVER_CAP`, naming the
  vertex, the bones and the cap); they are never removed silently.
  [implemented, #1224] both, in `reduceMesh` on every inserted vertex, in this
  order: protected influences kept first, the strongest others up to
  `maxInfluences` (ties by `boneOrder`), shares under a nonzero `minWeight`
  dropped, shares that are 0 on the 6-decimal grid dropped, the rest closed at
  `1 − others`; the drops are counted in `ReductionChanges.sharesDroppedOnGrid`
  and `sharesPruned` (`MQ43`). A protected share that is 0 on the grid cannot
  be written as a positive binding, and rig-parts#126's acknowledgement
  (comment 6042150608, item 1) asks for a named refusal there: it is
  `REDUCE_PROTECTED_INFLUENCE_BELOW_GRID`, a code B2 adds. Both are
  `invalid-input` terminations. A surviving source vertex is not pruned — it
  keeps its bindings (P19), so a source vertex over the cap stays over it. Weight
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
  tracks the weight discontinuity as its #115. [implemented, #1224] in
  `reduceMesh`: a protected edge's endpoints are never candidates, every step
  is checked to keep every protected edge, and an edge a step adds is checked
  against `weightJump` before the step is measured (`MQ18`). Condition (b) is
  applied to the edges a removal adds; an edge the refinement adds joins an
  inserted vertex whose weights are interpolated between its neighbours'.
- [measured, #1268] **`weightJump` acts through (b) long after (a) has
  stopped protecting anything — read it as a cap on every new edge, not as a
  seam detector.** Condition (a) reads source edges only, so at any value at
  or above the largest source edge jump *J* it protects nothing. Condition (b)
  reads the edges a removal *adds*, and a new edge spans several source edges:
  on a ramp its endpoints differ by several steps, so (b) refuses it at any
  value under that span — up to the largest L1 difference between **any** two
  source vertices, which is 2 whenever two vertices share no bone. Measured at
  exactly *J* on §7's reproducer and on three of rig-parts's recorded
  inputs: (a) protected 0 edges every time; (b) refused 76, 93, 5 and 67
  candidates, and with (b) switched off in a scratch copy the result was the
  run without `weightJump` byte for byte, while with (a) switched off it was
  the run at *J* byte for byte (table in §7, *Measured — `weightJump` at
  exactly J*). So a consumer choosing a value should expect: under *J*, every
  source edge above the value protected and its endpoints never candidates (on
  the reproducer's linear ramp that is every vertex); from *J* up to the
  largest pairwise difference, no protected edge but a reduction held back by
  (b) — fewer vertices removed than without the field, by an amount no source
  edge predicts; at or above that pairwise maximum, exactly the run without
  `weightJump`. The two conditions are unchanged; this is what they already
  said, measured.

```ts
/** [proposal] with P19/P20 folded in. [implemented, #1224] declared in `src/meshquality.ts`, echoed in `effective`, read by `reduceMesh`. */
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

/** [agreed, rig-parts#126] P19: stated on every weighted call, never inherited. */
export interface InfluenceLimits {
  /** The cap on bindings per vertex. */
  maxInfluences: number;
  /** Shares under this are dropped; 0 drops only shares that are zero on the weight grid. */
  minWeight: number;
}
```

- [agreed, rig-parts#126] **P20 — the default automatic policy is
  `hull: false`.** Boundary reduction is the consumer's goal; shape is kept by
  the declared boundary and art bounds (`targets.maxBoundaryDeviation`,
  `targets.artFit`), not by locking every boundary sample. `hull: true` stays
  available as an explicit diagnostic or authoring option, alongside
  individual protected vertices and edges. This is a default of parts's new
  opt-in policy; rigc's operation has no default for it (§1), and no existing
  generator changes.
- [agreed, rig-parts#126] **P18 — the first automatic path reduces only
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
- [implemented, #1224] P18's safeguards, in `reduceMesh`. A `vertices` key
  (`DeformKeyInput`, the emitted `offset` and run) is rewritten entry by entry
  onto the vertex — and, weighted, the influence — it addressed in the result's
  order (`ReducedMesh.deform.remapped`); a removed vertex's entries are dropped
  and listed (`droppedVertices`, also in `ReductionChanges.deformRemapped`); the
  gaps a reorder opens inside the new run are 0, which the format reads outside
  a run anyway (`MQ17`). Refused as `REDUCE_DEFORM_INDEXED`, an
  `unsupported-topology` termination naming animation, slot, attachment and
  key: an insertion whose containing source triangle has a corner a `vertices`
  run covers ("under a run"); a weighted keyed vertex whose binding list is not
  the same bones in the same order in the result — which the canonical order
  causes whenever the source lists them weakest first, since the remap does not
  permute pairs within a vertex; and **any** non-setup key on a linked mesh,
  since a linked mesh's own keys are not remapped here (one that inherits plays
  the source's remapped keys). `transform` keys are listed as re-evaluated
  (`ReducedMesh.deform.reevaluated`). ⚠️ The contract asked for a refusal of
  "linked meshes that inherit its keys in a way the remap does not support";
  B2 reads that as the linked mesh's own keys, the one way the remap carries
  nothing.
- [implemented, #1224] The operation lists every linked mesh of a reduced
  source, because they inherit the new topology (`ReducedMesh.linkedMeshes`,
  `ReductionChanges.linkedMeshes`, echoed from the input's `linkedMeshes`).

## The reduction as implemented (stage B2)

[implemented, #1224] `reduceMesh(input: MeshReductionInput): MeshReductionResult`
in `src/meshreduce.ts`, re-exported through `rig-c/mesh`, returns
`{ mesh: ReducedMesh | null, report }`. `ReducedMesh` is §1's `SourceMesh` in
the canonical order plus `edges` (`meshEdges`), `indexMap` (source index →
result index, `null` where removed), `inserted` (result indices the refinement
added), `linkedMeshes`, `deform` (`remapped`, `reevaluated`) and `counts`. The
contract left the following to the implementation; each is what the tree does.

**Two operations, composed in one order.** Admission (the source against
`sourceBounds`, §1) → refinement → reduction → the result measured once more as
the report's candidate. Each is its own function inside the module, and each
passes with the other idle: `MQ46` runs the reduction with no region, `MQ47`
the refinement with every source vertex protected.

**What a step is held to.** A removal is taken only when, after it, every row
the caller's contract requires is `pass` in `measureMeshQuality`'s reading of
the canonical candidate — art fit at `targets.artFit`, `MQ_BOUNDARY_DEVIATION`
against the source hull at `targets.maxBoundaryDeviation`, `MQ_MIN_ANGLE` when
declared, `MQ_ORIENTATION` and `MQ_DEGENERATE` at 0, and every region's
`MQ_MAX_EDGE` and `MQ_TRANSITION` — so the reduction cannot undo the
refinement. Before the measurement, the conditions no row reads: the hole's
link polygon is strictly simple (`findSelfIntersection`) and ear-clips
(`earClip`), the outline is one loop (`traceOutline`), every protected source
edge is still an edge, and no added edge breaks `weightJump`. A refined source
that does not meet its targets takes no step: the reduction ends at once,
naming the first failing row, and the mesh is returned not accepted. When
several rows fail on one step, the one named is the first of orientation,
degeneracy, boundary deviation, coverage, overshoot, undercut, minimum angle,
maximum edge, transition.

**The candidate order** (determinism, A18). The reduction sweeps the surviving
**source** vertices in ascending source index, one removal attempted per
vertex per pass, skipping protected ones (`protect.hull`, `protect.vertices`,
the endpoints of `protect.edges` and of every `weightJump` edge, and every
source vertex on a `protect.regionBoundaries` polygon's boundary within
`1e-9` px). A step taken stays taken and the sweep continues; a pass that
takes no step ends the reduction as `no-further-valid-reduction`, naming the
constraint that blocked the pass's last attempt, or `protect:` when nothing was
left to try. Inserted vertices are never candidates: they exist to meet `L(R)`.

**The insertion rule.** The refinement measures, takes the first failing
`MQ_MAX_EDGE` or `MQ_TRANSITION` row in report order (code, then region), and
splits that row's worst edge — at its midpoint when the midpoint lies in that
region or its band, otherwise at the point of the edge inside them nearest the
midpoint (among the edge's crossings of the polygon and the feet of the
polygon's vertices, then by halving towards an end that lies inside), every
position on the `r6` grid. [#1229] Before that, when an end of the worst edge
lies outside the region and its band, the edge is split where it leaves the
band — the point of the edge within `transition − BAND_CONTACT_TOLERANCE / 2`
of the polygon nearest that end, on the grid — provided the point is inside
the band, strictly between the ends, and leaves the piece to that end exempt
by `edgeIsHeldByRegion`; each of the three is checked, not assumed. A region
no edge meets gets its polygon's first vertex inserted into the triangle that
holds it. One insertion per
measurement. A band no edge lies in leaves `MQ_TRANSITION` `not-measurable`
(B1's definition), and no insertion is aimed at it.

**Where refinement stops by name** — the consequence of P16 recorded in §5. When
the worst edge has an end outside the region and its band that lies further
beyond the band than the edge's own bound, no insertion inside them can meet
it, and the refinement stops: the reduction is then `no-further-valid-reduction`
with that edge, its end and the distance in the constraint, and the mesh is
returned not accepted. Measured on the public fixtures before the rule
existed: a single quad under a region of `L0` 6 px, band 4 px, grade 0.5 spent
a budget of 1,000 insertions without converging (57 s on one darwin run); the
same request on the 4 × 3 lattice of the suite converges.
[corrected, #1229] Since the exemption, the stop applies only when the split
where the edge leaves the band is not available — always so with
`transition: 0`, whose constraint now says the piece to the far end touches
the authored boundary and stays held (`MQ53`) — and that quad converges
(`MQ48`). No convergence is promised beyond that: protection, a minimum angle,
art bounds, the coordinate grid or the budget can each leave a target unmet,
and the result is then `accepted: false` with the blocking constraint or a
budget termination (`MQ54`).

**Changed since v2.19.0** ([#1229](https://github.com/firejune/rigc/issues/1229),
rig-parts#126 comment 6045645512, option 1). Which edges `MQ_MAX_EDGE` and
`MQ_TRANSITION` hold is the only row semantics that moved; no emitted byte
moves, and no edge that 2.19.0 left free is held now. An edge held in 2.19.0
and exempt now is one that does not meet a region's polygon, whose nearest
approach to it is exactly `transition` (within `BAND_CONTACT_TOLERANCE`), at
one point and not along a side: in 2.19.0 it sat in `MQ_TRANSITION` at
`L0 + grade·transition`, and now it is in no row of that region. `MQ49`'s top
edge is one — `MQ_TRANSITION` holds it at 26 px with a band one and a half
times as wide, and passes it by without one at the band that touches it.
Measured on one darwin run, before (the 2.19.0 tree) and after, each the
second call in one process:

| fixture | 2.19.0 | now |
| --- | --- | --- |
| the coarse quad above, refinement alone | stopped by name after 1 candidate, not accepted | 23 inserted, accepted, 33.6 ms |
| the coarse quad, composed | the same stop | 27 candidates, 23 inserted, accepted, 43.5 ms |
| the 4 × 3 lattice, `dense`, refinement alone (`MQ47`) | 37 inserted, 78.7 ms | 43 inserted, 114.9 ms |
| the 4 × 3 lattice, `dense`, composed (`MQ14`) | 76 candidates, 172.9 ms | 80 candidates, 219.0 ms |
| the 4 × 3 lattice, band 6, grade 2, composed (`MQ14`) | 57 candidates, 93.3 ms | 58 candidates, 107.7 ms |

The lattice spends more insertions because a split where an edge leaves the
band adds a vertex the midpoint rule would not have, and each measurement
now runs the predicate per edge and region.

[measured, #1229] One shape the exemption does not resolve: a region inside a
triangle whose band touches that triangle's own kept edge at one point, with
no edge meeting the region. Each split where an edge leaves the band leaves a
chord from the new vertex to the far corner that crosses the band again, so
the vertices march towards the touching point — which lies on the kept edge,
where no split is aimed because the edge is exempt. On the exact fan with a
diamond under the top edge, each of seven settings tried — `L0` 1 to 4 px,
half-diagonal 1 or 2 px, band 2 or 4 px, grade 0.5 or 1 — spent a budget of
400 candidates; the termination is `budget-exhausted`, by name, as the
agreement allows. `MQ49` keeps its region over a spoke for that reason.

**What was rejected, on measurement of the contract or the brief.**

- [#1229] Exempting any contact with the outer boundary — it would free an
  edge lying along it, a positive-length intersection the agreement keeps
  held; `MQ50` plants exactly that widening and names the edge it frees.
- [#1229] A second copy of the hold rule in `src/meshreduce.ts` — the
  refinement and the rows would then be two definitions that only agree by
  hope; the refinement asks `edgeIsHeldByRegion` whether a split frees the
  piece beyond.

- Bind coordinates for an inserted vertex (§6) — the input has no bone
  transforms, and `SourceMesh` names bones without them; weights stay by name.
- A `deform.refused` list on the result, which the stage-B2 brief named — a
  refused key is an `unsupported-topology` termination with no mesh, so the
  list would always be empty.
- A refusal narrower than "linked meshes that inherit its keys in a way the
  remap does not support" — no input distinguishes the ways, so every
  non-setup key keyed on a linked mesh is refused, and a linked mesh is listed
  by reference only (§6).
- Admission on `sourceBounds` alone — the source's winding (`MQ_ORIENTATION`,
  `MQ_DEGENERATE`) is admitted too, as "its own build gate" in correction 3
  says, since every step is held to both at 0 and a source failing either
  could take no step.

**Cost.** Wall time is never in the report; the suite's last control prints,
per fixture, the candidates tried and the wall time of each `reduceMesh` call.
One darwin run at the commit that added it: the 20-vertex lattice reduced to
its 4 corners in 24 candidates and 97 ms; the refinement alone, 37 insertions
in 274 ms; the composed run, 76 candidates in 295–327 ms; the weighted
refinement, 37 in 451 ms. Every step was then one full measurement over the
plate, so the cost was the measurement's times the steps (since #1246 a step
redoes only what its mesh changed — below); bounding it is stage D's, and these
figures are one machine's reading, not a claim about another.

**The art's rasters, taken once per call**
([#1240](https://github.com/firejune/rigc/issues/1240)). What a measurement
reads from the art alone — the art bits at the threshold, the filled
silhouette at both background connectivities and each one's distance
transform, the 4-connected island labels, and the traced outline in drawing
pixels — is an `ArtRasters` value (`artRastersOf`, `src/meshrasters.ts`).
`reduceMesh` makes one per call before admission and hands it to every
measurement the call makes: admission and `checkIslands`, every refinement
and removal step through `measureAgainstTargets`, and the result's own
measurement — each through `measureMeshQualityWith` in `src/meshquality.ts`.
The rule:

- **Passed, never kept.** There is no module-level cache: the object is made
  by the caller, held in the call's `Run`, and dropped with it.
  `measureMeshQuality` makes a fresh one per call, so its behaviour is the
  uncached one, and its signature is unchanged.
- **Computed on first read.** A measurement that returns before a raster row
  (a source that is not one loop) or reads none (art under its sample floor)
  computes nothing more than it did; a tracer refusal is kept as its message
  and read back into the same `not-measurable` row.
- **Refused for any other art.** `checkArtRasters` compares the art the
  rasters were taken from with the input's — the mask's size, the threshold,
  the frame's `pageScale`, `width` and `height`, and the mask array itself, by
  identity — and the first that differs is `REDUCE_ART_RASTERS_MISMATCH`,
  thrown, naming the field, the value the rasters were taken at and the value
  the input requires. No stale raster is ever read.
- **Counted.** `tally` records each quantity's computations and the
  measurements that read the object. `MQ65` holds the cached and uncached
  reports byte-identical on every row over fixtures that read every quantity
  (the pinch reads the 4-connected distance and the tracer's refusal), and
  `reduceMeshWith` — `reduceMesh` over rasters the caller made — to
  `reduceMesh`'s report and mesh bytes; `MQ66` plants rasters at another
  threshold, mask size and mask, each refused by name and never read, and the
  same plant refused by `reduceMeshWith` at admission; `MQ67` reads the tally
  of one reduction — 80 candidates, 84 measurements, every quantity computed
  once — beside the per-step plant computing the art bits 84 times, and holds
  `src/meshreduce.ts` to no call of `measureMeshQuality` and one of
  `artRastersOf`.

`measureMeshQualityWith` and `reduceMeshWith` are on `rig-c/mesh` only
because that entry re-exports both modules with `export *`; a symbol that is
merely exported is not promised (RELEASING.md, *The import surface*), and the
install smoke's observed list is unchanged. `src/meshrasters.ts` is on no named
entry. Rejected: an optional second parameter on `measureMeshQuality`, which
changes the agreed signature; moving the measurement's body into a module
`src/mesh.ts` does not re-export, which moves a thousand lines to keep two
internal names off the entry.

**Cost of the cache, measured.** Rig-parts's `demo/bottomwear` (a 661 × 693
plate, 350,983 art pixels, 536 source vertices, budget 5000), its recorded
`reduceMesh` input replayed on one Apple M4 (darwin 25.6.0, Bun 1.4.2) in the
order before, after, after, before, each in its own process, with another
session's reduction matrix and builds running throughout (1-minute load 5.9,
15.4, 11.0 and 8.0 at the four starts; no stale `rigc-*` directory in
`$TMPDIR`): 1101 candidates every run, `no-further-valid-reduction`, report
and mesh byte-identical. Before, 184.9 s and 138.2 s — 167 and 125 ms a step
((full − budget-0 call) / 1101); after, 76.2 s and 79.4 s — 69 and 72 ms a
step. A CPU profile of a third after-run (55.4 s, load 7.0) puts 98.3 % of
samples still in the measurement and 0.16 % in functions of the art alone
(`artOf`, `fillEnclosed`, `labelIslands`, `traceAlphaOutline`), against
≥ 40.1 % before (#1240's profile): what remains per step is the candidate's
own coverage raster (`rasteriseTriangles`, 45.3 %), its distance transform
(`squaredDistanceToSet`, 22.4 % with the silhouette's no longer in it) and the
two Hausdorff readings (18.0 %). The byte identity is measured over the 18
`reduceMesh` inputs rig-parts made at 2.20.0 (report, mesh and the
admission-shaped measurement: 54 of 54 files identical to the tree before the
change and to the installed 2.20.0's) and over every `measureMeshQuality` and
`reduceMesh` call the `mesh-quality` and `mesh-compare` suites make (152
outputs, the same in order). These figures are one loaded machine's reading,
not a claim about another; no wall-time threshold is set here.

**Each step carried from the last one**
([#1246](https://github.com/firejune/rigc/issues/1246)). After the cache, a
step's cost was the candidate's own coverage raster, its distance transform and
the two Hausdorff readings, and almost all of it was redone for nothing: on
`demo/bottomwear` a measurement's triangles differ from the previous
measurement's by 5.1 removed and 4.7 added of ~465 (5.4 % of the rasteriser's
box work), 21 pixel centres flip on average and none in 243 of 1103, the
distance transform's columns and rows that a flip can reach are 7.3 % of its
passes, and the outline is unchanged in 243 of 1103 (interior removals). So
`reduceMesh` measures every refinement and removal step through a
`StepRasters` value (`stepRastersOf`, `src/meshrasters.ts`) with
`measureMeshQualityStep` in `src/meshquality.ts`, made once per call beside
the `ArtRasters` and dropped with it. The rule, one quantity at a time, is that
each carried value is the same function of the same input as the full one:

- **Coverage** is a count per pixel centre of the triangles whose centre test
  holds there — `triangleRasterBox` and `pixelCentreInTriangle` in
  `src/mesh.ts`, the rule `rasteriseTriangles` itself reads. The triangles are
  diffed against the last measurement's as a multiset keyed by their corners'
  exact coordinates in the order given; one taken away is drawn with −1 and one
  added with +1, so a centre is covered exactly when its count is positive —
  `rasteriseTriangles`'s union. Covered art, covered centres, covered pixels
  per island, the uncovered art pixels and the covered centres outside each
  filled silhouette or in its holes are kept with it, updated at each centre
  that flips; a worst pixel is read from those sets by the full scan's rule
  (the largest value, the first pixel in order among equals).
- **The distance transform** is `squaredDistanceToSet`'s two passes, now
  `distancePassesOf` in `src/mesh.ts`, which `squaredDistanceToSet` itself
  calls. A column's pass reads that column of the coverage alone, so only
  columns holding a flipped centre are redone; a row's pass reads that row of
  the column results alone, so only rows where a redone column changed are.
- **The outline rows** (`MQ_BOUNDARY_DEVIATION`, `MQ_TRACE_DEVIATION`) are
  handed back whole when the outline and the polygon it is read against equal
  the last ones coordinate by coordinate. Otherwise `hausdorff` runs as it
  always does, and only its point-to-edge distance lists are carried
  (`carriedDistances`): a list toward the fixed polygon is kept per point, and a
  list toward the outline copies each distance whose edge — both ends,
  exactly — the last outline also had, computing the rest. The branch and
  bound itself is not made incremental: its pruning depends on the best value
  found so far, so a per-edge reuse would change which points are sampled.
- A measurement whose triangles differ from the last in more than they share
  is built from nothing, as the first one is. Which way a reading is built
  changes its cost, never its values.

`measureMeshQuality` and `measureMeshQualityWith` are the full path and are
unchanged; `reduceMeshWith(input, rasters, null)` measures every step in full,
and step rasters made over another rasters object are refused
(`REDUCE_ART_RASTERS_MISMATCH`). `MQ68` measures a sequence — an interior vertex
moved, a hull vertex out and in, a corner cut, a fold, a fan of another
topology and back, and the pinch's 4-connected silhouette — through one
`StepRasters` against a fresh `measureMeshQuality` each, every row's bytes and
every pixel's coverage and squared distance identical, and two reductions
carried, over the step rasters made by the caller and in full, byte-identical;
`MQ69` plants a skipped added triangle, a skipped distance-transform column and
row, an outline reused on its vertex count alone and an edge distance copied
from the wrong edge, each caught by the pixel or the row it changed.

**Cost of carrying, measured.** The 18 `reduceMesh` inputs rig-parts made at
2.20.0, replayed one process per call through the tree before the change and
after it: report, mesh and `accepted` identical, 54 of 54; every
`measureMeshQuality`, `measureMeshQualityWith`, `reduceMesh` and
`reduceMeshWith` output the `mesh-quality` and `mesh-compare` suites make, run
by the selftest from before the change over both trees: 303 outputs, the same in
order. `demo/bottomwear`, before and after in the order before, after, after,
before, twice, on one Intel Core Ultra 7 265K (20 threads, WSL2 Linux 6.6, Bun
1.4.2), 1-minute load 0.80–0.99 at every start and nothing else running: 1101
candidates every run; before 32.1–34.3 s, after 2.98–3.24 s; per step
((full − budget-0 call) / 1101) 29.0–31.0 ms before and 2.5–2.8 ms after. A
CPU profile of a third after-run (4.0 s) puts 32.4 % of samples in the carried
coverage (`StepRasters.coverage`), 32.0 % in the outline readings and 9.8 % in
`canonicalise`; before, 46.1 % was `rasteriseTriangles`, 23.9 %
`squaredDistanceToSet` and 19.5 % `hausdorff`. These figures are one machine's
reading, not a claim about another; no wall-time threshold is set here.

**A region's rows, carried from the last step too**
([#1253](https://github.com/firejune/rigc/issues/1253)). After #1246 a step
over a mesh with no region cost about 2.6 ms; with one region it cost about
1.8 s. The subject is rig-parts's `demo/bottomwear` (536 source vertices, a
661 × 693 plate with 350,983 art pixels) with one declared region `hem`: a
circle of radius 65 handed over as a circumscribed 287-gon, `maxEdgeLength`
18, `transition` 65, one art sample — 1443 candidates, 262 inserted and 214
removed. Its profile, split by what a step does (section timers and counters
in an instrumented copy, the call capped at `maxCandidates` 320 for the
profile only: all 263 refinement measurements and the first 58 removal
attempts):

- **`MQ_FILL_DISTANCE`** was 92 % of a refinement measurement (1,634 of
  1,778 ms) and 90 % of a removal one. Every measurement tested all 350,983 art
  pixels against the region's closed polygon (`inClosedPolygon`, 287 sides:
  100.7 million side tests), then the 13,273 inside it against the hull (about 293
  sides: 3.9 million) and each of those against every vertex (8.9 million
  distances at 667 vertices).
- **The region's edge predicates** (`edgeIsHeldByRegion`, `segmentToPolygon`,
  `segmentMeetsPolygon` — every edge against the 287 sides) were 6.5 % and
  1.4 %.
- **`canonicalise`** was 0.6 ms a step and **the carried coverage** 0.6 ms:
  an insertion flipped no pixel centre in any of the 263 refinement
  measurements (splitting a triangle changes which triangle covers a centre,
  never whether one does), and a removal flipped 17 on average, redoing 10.6
  columns and 147 rows of the distance transform.
  `canonicalise` cannot move to the end of the run in any case: the
  refinement reads the canonical order to name the edge it splits, and the
  removal's outline check is what refuses a step that leaves no single loop.
- The self-intersection check of the region's polygon (`findSelfIntersection`)
  was 0.1 % before and, once the rest was carried, the largest of the
  region's terms in a removal step, so it is carried with them.

So `regionRows` (`src/meshquality.ts`) reads each of those through the call's
`StepRasters` (`src/meshrasters.ts`), by the rule #1246 set: each value is
the same function of the same input.

- **The region's art pixels** (`regionPixels`) — the art pixels whose centre
  lies in the closed polygon, ascending — are a function of the art and the
  polygon alone: computed once for a polygon equal coordinate by coordinate,
  and handed back after. The fill scan visits them in ascending order, which
  is the order a scan of every art pixel keeps them in.
- **The polygon's self-intersection check** (`polygonCrossing`) is handed back
  the same way.
- **An edge's answers** (`regionEdges`) — whether it meets the closed polygon,
  and whether the region holds it and at what distance — are functions of its
  two ends and the region's polygon and band, so they are carried from the last
  reading of the region for an edge with both ends equal, in the same order.
- **The fill distances** (`regionFill`). Whether a region pixel lies in the
  hull is measured again only inside the box of the hull edges that changed
  (directed, both ends exact), widened by one unit; outside it the shared
  edges answer the same, a changed edge is further than the boundary tolerance,
  and the changed edges cross a horizontal ray from the pixel an even number of
  times between them, so the parity is the last one's. A pixel's nearest-vertex
  distance is carried by the vertices that differ from the last reading's, as
  a multiset of exact coordinates: while the vertex that attained it remains,
  the new minimum is the smaller of the last one and the distances to the
  vertices added; when it is gone, the pixel is measured over every vertex
  again. A minimum is exact, so either way it is the same number.
- **Admission** is measured through the same `StepRasters` when the call
  carries one, so the region's pixel set is computed once per call rather than
  once for admission and once for the steps.

`measureMeshQuality` and `measureMeshQualityWith` read none of this; their
signatures, every row's definition, the budget, the bounds, the sample counts,
the raster resolution and the candidate order are unchanged. `MQ70` measures a
sequence under a region — an interior vertex moved, a fold, a corner cut that
moves the hull across region pixels with its vertex count unchanged, the region
moved to another polygon of as many vertices, and the region with two corners
swapped — through one `StepRasters` against a fresh `measureMeshQuality` each,
every row's bytes identical, and a reduction under a region carried and in full,
byte-identical; `MQ71` plants a pixel set and a crossing check handed back on
the vertex count alone, an edge's answers carried from an edge sharing only its
first end, a changed hull's box not measured again and a nearest vertex kept
after it was removed, each caught by the row it changed.

**Cost, measured.** The 18 recorded inputs and the with-region one, replayed
one process per call through the tree before and after (the with-region before
side is the profiled run below): report, mesh and `accepted` identical, 57 of 57;
every `measureMeshQuality`, `measureMeshQualityWith`, `reduceMesh` and
`reduceMeshWith` output the `mesh-quality` and `mesh-compare` suites make, run by
the selftest from before the change over both trees: 379 outputs, the same in
order. On one Intel Core Ultra 7 265K (20 threads, WSL2 Linux 6.6, Bun 1.4.2),
each run alone on the machine (the pool held exclusively) and the 1-minute load 0.1–1.1 at every start:
the with-region call before, under the CPU profiler, 2,575 s (1443 candidates;
the profiler's cost is within the noise — the unprofiled first 100 candidates
took 188 and 193 s, 1.9 s a step, against 1.8 s a step profiled); after, 10.1–11.0 s
in three runs, 5.7–6.3 ms a step ((full − budget-0 call) / 1443); capped at 100
candidates, before 188.0 and 192.9 s, after 2.14 and 2.20 s. The no-region call,
before and after in the order before, after, after, before, twice: 2.83–3.29 s
before, 2.81–3.17 s after, 1101 candidates every run — the change does not touch
a call without a region. A CPU profile of a fourth after-run (10.9 s) puts
18.6 % of samples in `regionFill`, 12.9 % in computing the region's pixel set
once, 12.3 % in the carried coverage and 11.5 % in the outline readings; before,
88.3 % was `inClosedPolygon` and 99.8 % `regionRows`. These figures are one
machine's reading, not a claim about another; no wall-time threshold is set here.

**The region's pixel set, by scanline**
([#1263](https://github.com/firejune/rigc/issues/1263)). After #1253 the one
thing a region still cost once per call was its pixel set: every art pixel
centre tested against every side of the polygon — for `hem`, 350,983 × 287 ≈
100.7 million side tests. That is the algorithm, not the polygon, so it is
replaced rather than the polygon (a native circle stays out, P17):
`closedPolygonCentres` (`src/meshquality.ts`) collects each row's crossings
and marks each centre once, O(rows × sides + pixels).

The rule it reproduces is `inClosedPolygon`'s, to the bit, and is written
beside that predicate: a centre is in when its `distanceToSegment` to some side
is at most `ON_BOUNDARY` (1e-9 px); otherwise by **even-odd** parity of a ray
towards +x, where a side crosses when exactly one of its ends has a y strictly
greater than the centre's (half-open: a vertex at the centre's height counts
once, a horizontal side never) at
`xc = ((xj − xi)·(py − yi)) / (yj − yi) + xi`, counted when `px < xc`. So
**a centre exactly on an edge or at a vertex is in** — not because the ray
says so, which on a boundary depends on which side is left or right of it,
but because the distance test runs first and decides it; the scanline adds the
same test side by side over the centres near each side. Each row's crossings
are computed by the predicate's own expression in its order, so they are the
same doubles, and a centre's count of crossings strictly to its right is the
predicate's count. The single-point predicate is unchanged and still answers
every single-point question (the hull membership, an edge's endpoints).

`MQ77` holds the scanline equal to the predicate at every centre of twelve
grids — a concave notch, a loop touching itself at one vertex, sides at a
slope of one half through centres, vertices at a row's centre height off the
centres, sides past the grid and an irregular polygon, each at scale 1 and 2:
14,400 centres, 442 on a side and 33 at a vertex. `MQ78` moves every crossing
half a pixel and is caught, naming the first centre that parts. Measured
identity: the 19 recorded inputs replayed through the tree before and after —
report, mesh and `accepted` identical, 57 of 57 — and every region pixel set
the `mesh-quality` and `mesh-compare` suites compute (379), computed both ways
in one instrumented run and identical.

**What a region's polygon costs the caller.** The pixel set is computed once
per call, by scanline. On the machine above (each run alone on it, the
1-minute load 0.6–1.0 at every start), `hem`'s set — 13,273 of the 350,983
art pixels — took 1,372–1,635 ms by the predicate over every pixel and
0.7–3.5 ms by scanline, the same set; the with-region call went from 11.2,
12.0 and 12.2 s to 8.7, 9.5 and 9.1 s, 1443 candidates and the same report,
mesh and `accepted` bytes each run. A CPU profile of a fourth after-run (9.5 s)
no longer shows the pixel set; its largest terms are `regionFill` (21.4 % of
samples), the carried coverage (14.4 %) and the outline readings (13.5 %). So
the sides of a polygon now cost per step only where a step reads them — the
edges it changes (`regionEdges`) and a polygon not seen before — and the
287-gon's once-per-call cost is a few milliseconds; a polygon of fewer sides is
still the caller's choice of approximation, not something the reduction rounds
away. These figures are one machine's reading, not a claim about another; no
wall-time threshold is set here.

**Left for later stages.** The motion comparison and every motion row (§3,
stage C); a finer-grid pass, warm-up and traced-boundary gating (*Stage B
scope*); refinement that retriangulates outside the band or flips edges, which
P16's checkable form as agreed does not admit; remapping a linked mesh's own
keys and permuting a weighted keyed vertex's pairs (§6); a bounded-work claim
(stage D).

### A distance bound declared absent (#1254)

[implemented, #1254] What §1 *A distance bound may be declared absent* agrees,
built: `checkFit` and `measureMeshQuality`'s validation accept `null` on
`maxOvershoot` and `maxUndercut` and refuse `undefined`, NaN and a negative by
name, as before; `compareMeshesInMotion`'s `validateFit` does the same. The
rows take a bound only from a number, so a `null` row is built `undeclared` by
the same path that builds every undeclared row, and a row the art leaves
unmeasurable under a `null` bound is not required either. Neither the carried
step measurement (`StepRasters`) nor any other row reads a bound, so nothing
else moved.

`MQ72` reduces a lattice shifted two pixels off its art — undercut 2 and
overshoot 2 — under `null` distances on both `sourceBounds` and
`targets.artFit`: admitted, 16 vertices removed, accepted, both rows
`undeclared` with their values, effective settings and document echoing
`null`; the same nulls under `minCoverage: 1` are blocked by `MQ_COVERAGE`,
and each distance restored to 0 refuses the source and blocks the target by its
own row, so the `null` is what admitted it; the full, carried and `reduceMesh`
paths agree byte for byte. `MQ73` holds the two misreadings apart from the
reading — `null` as 0 is refused, `null` as a bound nothing reaches leaves a
`pass` row, not an `undeclared` one — and refuses a left-out field, NaN, a
negative and a `null` coverage by name. `MQ74` is the comparison's half: a
reference that fails undercut 0 is admitted under `null` and refused at 0, and
a candidate's row is `undeclared`. Four planted readings of the source —
`null` required at admission and per step, required per step only, read as a
passing bound, read as 0 — each turned `MQ72` and `MQ73` red; `validateFit`
refusing `null` turned `MQ74` red.

**Measured identity.** The 19 recorded `reduceMesh` inputs (the 18 of stage D1
and the with-region one of #1253), each declaring numbers, replayed one process
per call through the tree before and after: report, mesh and `accepted`
identical, 57 of 57.

## The comparison as implemented (stage C1)

[implemented, #1230] `compareMeshesInMotion(input: MotionComparisonInput):
MeshQualityReport` in `src/meshcompare.ts` returns a `mesh-quality-report/1`
with `operation: 'compare'`, written by `writeMeshQualityReport` — no second
format. The contract left the following to the implementation; each is what the
tree does.

**The input.** §3's `MotionComparisonInput`, with three fields the agreed text
requires an input for and the interface had no place for: `motionRequired`
(P6), `perFrame` (P7's opt-in) and `schedule: MotionSchedule | null` (P6: no
motion supplied leaves `motion` null, never an empty pass — `MQ10`).
`BuiltCandidate` is `{ id, model }`, the model document's text; see *rejected*
below. All attachments of one call are under one skin: each skin is its own
posed view.

**The report.** `reference` is the reference's own report — its art fit, and
its motion section, in which local deformation is 0 by definition (it is
compared with itself); `candidates` in the caller's order; `sourceCounts` the
reference's counts; `termination` null. `accepted` is P6's: the geometry
verdict `pass` and, with `motionRequired`, the motion verdict `pass`.
`EffectiveSettings` echoes every attachment with its regions' polygons (an
optional field added for this), both art-fit bounds, the motion bounds and the
schedule. Additive types in `src/meshquality.ts`: `MotionRowDetail` (each motion
row's `motion` field — frames measured and not drawn, the reading per phase and
per role, the setup map, uncarried samples, folds, triangles degenerate at
setup), `MotionReading` and `ScheduleWalked`. `perFrame` lists the four
attachment-level rows at every frame walked (`null` where none was taken);
region rows carry their worst frame on the row.

**The schedule.** A rate entry walks `count = round(duration × fps)` intervals,
the render's count (`sampleAnimation`, `src/render_shared.ts`): under `grid`
`count + 1` samples at `sampleTime('grid', …)`, `i / fps` on a whole number of
frames; under `irr` `count` samples at `sampleTime('irr', …)`, each a frame
interval's `IRR_OFFSET` past its grid sample (`src/core/animation.ts`). An
explicit-times entry takes no phase — a phase is a rule for placing samples, and
those times are placed already — so its frames carry `phase: null` and their id
spells `explicit` where a phase would be: `<animation>@explicit@<time>`. Each
(animation, phase) is one walk from the reset at time 0 (`poseRawAnimationEach`,
reset `'animation'`), stepped to its frames in ascending time by
`stepSchedule`'s rule (`src/core/constraints_physics.ts`) — steps of `dt` while
before the next frame, then to it — under `mode: 'step'`, and one jump per frame
under `mode: 'none'`. The steps are computed once and handed to the reference
and every candidate (`MQ22`). A time past the animation's duration, a frame id
given twice and an animation the reference does not have are
`COMPARE_INPUT_MISSING`.

**The rows.** Per attachment, in skeleton order: `MQ_INVERSION`,
`MQ_LOCAL_DEFORMATION` (and one per region), `MQ_SQUASH`, `MQ_STRETCH`.
`MQ_LOCAL_DEFORMATION` is the largest world distance over the samples carried by
both meshes and the frames the attachment is drawn at, bound
`maxLocalDeformation` (required), `sampling.count` every sample of the domain and
`art.samples` the art pixels alone. `MQ_STRETCH` is the largest `σ₁` and
`MQ_SQUASH` the smallest `σ₂` of `stretchSingularValues` (moved unchanged to
`src/areaband.ts`, re-exported from `src/deformsurvey.ts`) from each triangle's
setup world triangle to its posed one, bounds `maxStretch` / `minStretch` when
declared and `undeclared` otherwise. `MQ_INVERSION` is the most triangles
reversed at one frame by A39's rule (`surveyDeformKeys`' reading: the band
over the setup and posed areas, no sign read off a setup triangle inside it, one
collapsed onto zero not reversed), required at 0 except on a
`deformMayFold` slot. A value of 0 on a distance or count row points at nothing
(`worst: { at: {} }`).

**Equality** (correction 5) is `firstDifference` over the parsed documents in
the reference's key order, with arrays of named objects named by `name` in the
path (`bones["b"].x`, `constraints["b_follow"].strength`), each value shown
beside the other. The allowlist is `allowed`'s: the compared attachment's
`uvs`, `triangles`, `vertices`, `hull` and `edges`; its deform keys' runs (every
field but `time` and `curve`) and `deformTransforms` entries (every field but the
key's identity and time); the slot's `meshes` entry (every field but `slot` and
`attachments`), `meshBones`, each physics constraint's `drivesMesh`, and the
slot's `rig.meshKinds`, `rig.meshDeclaredBones` and `rig.meshSoftBones`; `pages`;
`spine.sha256`. `pages` needs no conversion check: the comparison reads each
mesh's region UVs off its own attachment and never a page UV.

**What was rejected, on measurement of the contract or the brief.**

- `BuiltCandidate.build` as three paths (`modelPath`, `skeletonPath`,
  `atlasPath`) — the core poses the model document and reads neither file of
  the Spine pair, and a module under `src/` that opened paths would tie the call
  to a disk layout; it takes the document's text.
- A geometry-only report for the reference — the reference's motion section is
  kept, because its stretch, squash and inversion are its own evidence and its
  zero local deformation is `MQ55`'s statement (`MQ00`'s motion half), not a placeholder.
- Explicit times walked once per phase — they would be the same poses under two
  ids; they carry no phase instead.
- A section builder imported from `src/meshquality.ts` — `sectionOf` there is
  internal, and exporting it would put it on `rig-c/mesh` through that
  entry's `export *`; `src/meshcompare.ts` applies §2's rule in its own
  `sectionOf`.
- The version through `src/cli/shared.ts`'s `readVersion` in place — that module
  loads the whole CLI; the reader moved unchanged to `src/package_meta.ts`, and
  `src/cli/shared.ts` re-exports it.

**Cost.** Wall time is never in the report; `MQ55`'s detail line prints one
comparison's frames, samples and wall time on the suite's fixture. One darwin
run at the commit that added it: 10 frames × 1,034 samples (a 64 × 16 strip,
1,024 art pixels and 10 hull UVs), one candidate, 12.5–39 ms over three runs,
including both builds' posing and setup art fits. That is one machine's reading; bounding the work is
stage D's. From an install (`MQ45`'s line in the smoke, which prints its own
figures on every run): the flag mesh of the smoke's fixture, 26 frames × 1,336
samples (1,310 art pixels of a 56 × 40 plate and 26 hull UVs), one
candidate, 79–292 ms over four comparisons on one darwin machine at the commit
that added it in single-case runs (both builds' posing and setup art fits
included; the first comparison of a process is the slow one), and 0.36–2.9 s
inside the full 18-case battery on the same machine, where installs run around
it. One machine's reading, unpaired, as above.

**Stage C2.** [implemented, #1230] What C1 left:

- The entry: `exports["./meshcompare"]` → `src/meshcompare.ts`, the
  `AGREED_IN_1230` row of `OBSERVED_SYMBOLS` (`compareMeshesInMotion`,
  `uvCarriers`; types `MotionComparisonInput`, `BuiltCandidate`,
  `CompareAttachment` recorded and not held), RELEASING.md *The import
  surface* by agreement, and the `drop-meshcompare-entry` plant.
- The call from the install (`MQ45`): `MESHCOMPARE_PROBE_SOURCE` in
  `scripts/install_smoke.ts`, run after the runtime is taken away, recorded
  under `SMOKE_MESHCOMPARE_COMPARES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE`. It
  compares the flag mesh of the build the smoke just wrote with itself (0 at
  every frame), with the same document with hull vertex 0 moved
  `MESHCOMPARE_MOVED` units (that distance at every frame, at that vertex's
  UV — the fixture's bones carry no scale), and two candidates under one id,
  refused as the `MeshReductionError` `rig-c/mesh` exports; the report has
  to say `operation: 'compare'` and `poser.kind: 'core'` at the installed
  version.
- `COMPARE_REFERENCE_FAILS` — *Independent evidence* above.
- The controls, printed from `MQ56` up — *Stage A controls*.

What C2 rejected, and the reason:

- A candidate for the smoke built a second time by the installed `rigc build`
  with a different contour — the flag rides one bone, so any two
  triangulations of it carry every shared sample to the same point under a
  rigid pose (`MQ57`'s statement) and the plant would read 0, which is the
  self-comparison's reading and not a moved vertex. The moved vertex is an
  edit of the built document, inside the allowlist.
- Refusing a reference whose geometry is `not-measured` as well as `fail` —
  see *Independent evidence*: it makes the attachment floor of `MQ60`
  unreachable.
- Refusing a reference on its whole `geometry` verdict, which was the first
  version — measured wrong on the install smoke's own build: the
  contour-generated flag mesh reads `MQ_ORIENTATION` 24 of its 24 triangles
  under C1's setup art fit, so every reference built by the `contour`
  generator would be refused. Winding is (b)'s, not (a)'s, so the refusal reads
  (a)'s three rows only. C2 recorded the reading itself as open: a
  comparison over a contour-generated build reported `MQ_ORIENTATION` failing
  for the reference and every candidate (the smoke's flag mesh, 24 of 24), so
  none was `accepted`. ✅ **Closed by #1236 — the generator was wrong, not the
  reading.** `geometryOf` in `compareMeshesInMotion` (`src/meshcompare.ts`)
  hands `measureMeshQuality` the model document's triangles over the
  document's UVs times the art frame — part-local drawing pixels, y down, as
  `SourceMesh.points` defines them — and `measureMeshQuality` converts every
  point through `cropToSpineY` before it reads a sign, so it reads in Spine
  world, the frame B1's `MQ05` fixture (`mqMesh`) winds in. Measured on one
  public build per generator, the signed area of every triangle in spine-core's
  setup-pose world (y up) against the same triangles as `MQ_ORIENTATION` reads
  them — skeleton and model triangles identical in every mesh, and the two
  signs equal on every triangle:

  | build | generator | mesh | triangles | Spine world, before #1236 | `geometryOf` points (y down) | `MQ_ORIENTATION` reads (via `cropToSpineY`) |
  | --- | --- | --- | --- | --- | --- | --- |
  | `gallery/flex` | `contour` | `flag_a`, `flag_b`, `flag_c`, `leaf` | 50, 46, 79, 75 | all clockwise | all positive | all clockwise |
  | `fixtures/public.ts` `articulated_probe` | `ring` | `mass_pad`, `collar` | 40, 40 | all clockwise | all positive | all clockwise |
  | `fixtures/public.ts` `articulated_probe` | `ribbon` | `trail` | 14 | all counter-clockwise | all negative | all counter-clockwise |
  | `gallery/look` | `grid` | `head`, `hair_lock_l`, `hair_lock_r`, `ahoge` | 320, 48, 48, 48 | all counter-clockwise | all negative | all counter-clockwise |
  | `fixtures/public.ts` `segments_probe` | `segments` | `cloth` | 100 | all counter-clockwise | all negative | all counter-clockwise |
  | `gallery/squash` | authored | `ball` | 8 | all counter-clockwise | all negative | all counter-clockwise |

  No triangle was degenerate and no mesh mixed signs. The cause was a
  derivation, in two comments (the `earClip` doc and the ring builder): that a
  y flip turns a clockwise-on-screen polygon counter-clockwise in Spine world.
  It changes the sign of the signed area, not the direction the loop turns as
  drawn, because the y-up frame is drawn with y up — so an outline clockwise
  on screen (positive `signedArea` in y-down pixels) ear-clips to triangles
  clockwise in Spine world. `windCounterClockwiseInSpineWorld` (`src/mesh.ts`)
  now swaps each triple's last two corners when the polygon's y-down area is
  positive: the triangle set, the hull walk (`traceOutline`, which starts at
  the lowest vertex towards its smaller neighbour), `checkHullOrder` (either
  direction is the same polygon) and `meshEdges` (unordered edge keys,
  interior edges sorted) are unchanged, and only the order of two indices
  inside each `contour` and `ring` triangle moves. Clipping the mirrored
  outline instead was rejected: the ear tests mirror with it, so it picks the
  same ears and writes the same triples. Reading the sign flipped in
  `geometryOf` was rejected on the table — it would fail every `grid`,
  `segments`, `ribbon` and authored build instead. Measured after: every row
  above counter-clockwise; of the gallery's base only `gallery/flex`'s
  `skeleton.json` moved (`tools/emit_hashes.base.json`), and
  `tools/render_hashes.ts base --check` is CURRENT — no pixel moved, because
  nothing culls. `vertices` deform keys index vertices, not triangles, so no
  animation data changes. Held by `CT15` (`contour-mesh`: every generator's
  triangles counter-clockwise on spine-core's posed world, the plant the
  emitted skeleton with the swap removed, named by generator and triangle),
  `MQ64` (`mesh-compare`: a contour-generated build compared with itself is
  `accepted` with `MQ_ORIENTATION` 0 for both, and its triangles read with the
  sign flipped fail `MQ_ORIENTATION` naming the triangle), and the install
  smoke's `MQ45` step, which now requires the flag mesh's self comparison
  `accepted`.
- An unknown page appended to `pages` for `MQ63`'s allowlisted difference —
  `readModel` refuses a page with fields it does not know before the
  comparison runs; the control doubles each page and moves its regions instead.

## Stage D1 — the installed package over rig-parts's inputs

[measured, #1238] What rig-parts's public inputs show when its automatic
mode runs against the **registry artifacts** `spine-rigc@2.20.0` and `@2.19.0`,
each installed into an empty directory with no spine-core beside it. The
caller is rig-parts at the commit that added the mode (rig-parts PR #131),
unmodified: its `buildRig` with each mesh part of the three public examples
(`demo`, `sample`, `scarf`) switched alone to `auto` under `examplePolicy`
(`fixtures/automesh.ts`, the procedure of `tools/auto_survey.ts`), and its ten
`AUTO_CASES`; every `reduceMesh` call it makes is recorded as made and
replayed one process per call. One darwin machine (Apple M4, 10 cores), Bun
1.4.2, load average 4.3–7.2 throughout — never idle, so no unloaded figure
appears below. Population: 30 parts, of which 18 reach `reduceMesh` (9
example parts, 9 synthetic) and 12 are refused by rig-parts before the call
(`CONTOUR_ONE_ISLAND`). The 18 recorded inputs are byte-identical between the
two versions.

**1. The call shape is on the surface, and 2.20.0 refuses none.** One shape:
all fourteen `MeshReductionInput` fields, no region on any example input,
weights by bone name, `deform` and `linkedMeshes` empty, `preset` null. 18 of
18 calls return at both versions. Every value the automatic mode imports is
held by a row of `OBSERVED_SYMBOLS` (`scripts/install_smoke.ts`) on
`rig-c/mesh`; two types it uses, `SourceMesh` and `RefinementRegion`, are
in no row (types are recorded, not held). rig-parts's other imports go
through `./*.ts` courtesy keys rather than the named entries holding the same
symbols. `compareMeshesInMotion` from the install over rig-parts's own demo
builds (`neck` and `bottomwear`, `idle` at 12 fps, 50 frames): the tracked
build against the automatic one is `accepted`; the tracked build against
itself is **not** — `MQ_ORIENTATION` fails on every triangle (210 of 210, 620
of 620), because rig-parts's lattice and contour emitters write clockwise in
Spine world (all 20 tracked meshes measured on the compiled skeletons through
spine-core's setup pose).

**2. Reproducible from the install.** Every recorded input replayed twice, in
separate processes and directories: report, mesh and a `measureMeshQuality`
of the source byte-identical, 54 of 54 file pairs; the three comparison
reports, 3 of 3. Between 2.19.0 and 2.20.0, 16 of 18 report-and-mesh pairs are
identical; the two that differ are the synthetic cases with a region, as
#1229's changed semantics predicts.

**3. Budget and termination.** Over 54 reduce reports: every termination one
of the four; `candidatesTried <= budget.maxCandidates` in all 54;
`none-met-the-targets` with no mesh, no geometry and nothing accepted, 3 of 3;
no report says minimal. `unsupported-topology` is not reached on these inputs —
rig-parts refuses every multi-island source first. Each accepted
`no-further-valid-reduction` was re-checked from outside the call: every
surviving source vertex removed by the rule in *The reduction as implemented*
(its fan, the link polygon tested with `findSelfIntersection` and clipped with
`earClip`) and measured with the installed `measureMeshQuality` — 841 removals
over 13 stops, none valid, 4 not re-checked because the link held an interior
vertex; the named vertex reads back the named row at the named value in 13 of
13. The same re-check finds 6 valid steps on the result of a budget-1 stop,
its positive control.

**4. Cost — two verdicts.** The case rig-parts observed at 81–141 s (PR #131's
evidence table, `demo / bottomwear`) is a 661 × 693 plate (350,983 art pixels
at alpha ≥ 1), a source of 536 vertices and 777 triangles, budget 5000.

- (a) **The candidate count is bounded by the budget.** 1101 of 5000 in every
  run of either version, ending `no-further-valid-reduction`.
- (b) **The wall time is not short.** 87–184 s over seven runs of the same
  input, same 1101 candidates and byte-identical results, at load 4.8–7.2 —
  where the same processes ran rig-parts's whole tracked rig stage for the
  example in 53–106 ms. One machine's reading at the loads stated; no bound is
  claimed from it.

Where the time goes, derived because the call has no phase hooks: admission is
one measurement (111 ms), refinement nothing (no region), the final
measurement one (144 ms), and each removal step one `measureMeshQuality` of the
whole plate — (full call − a budget-0 call) / 1101 = 129 ms. A CPU profile of
the call puts 98.98 % of its samples in `measureMeshQuality` under
`tryRemoval`, 0.55 % in the step's own geometry, and at least 40.1 % in
functions whose only input is the art (`artOf`, `fillEnclosed`,
`labelIslands`, `traceAlphaOutline`), which do not change between the steps of
one call. Per-step cost follows the plate's pixel count, not the mesh: 13–129 ms
for plates of 40,388–458,073 pixels. Reusing the art-derived rasters across the
steps of a call is its own card, with this section's byte-identity pairs as its
acceptance.

**5. Winding at every hand-off.** Signed area in Spine world, on the 9 example
inputs (the synthetic cases agree):

| hand-off | every triangle |
| --- | --- |
| rig-parts's contour source as `src/contour.ts` builds it | clockwise |
| the same source as handed to `reduceMesh`, after `spineWinding()` swaps two corners | counter-clockwise |
| the mesh `reduceMesh` returns (8 accepted, 1 refused by admission) | counter-clockwise |
| the compiled skeleton of a real `rig-parts build`, posed by spine-core | counter-clockwise |

Identical at 2.19.0 and 2.20.0 in every row: #1236 moved the `contour` and
`ring` generators, and rig-parts hands rigc authored meshes, so the three
builds' `skeleton.json` are byte-identical across versions. With
`spineWinding()` undone, 18 of 18 recorded inputs are refused at admission
(`REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS`, `MQ_ORIENTATION` on every triangle). The
source's winding is fixed by rig-parts's own tiling check (a triangle wound
against the outline is refused), not by `earClip`, so the recommendation
recorded on rig-parts#126 is to keep the swap unconditionally; a conditional
would add a branch that check makes unreachable.

**What was rejected.** Rebuilding rig-parts's call by hand from
`autoReductionInput` — the example calls carry weights over rig-parts's
internal segments and bone transforms, so the input was recorded as made
instead. Reading phases off the report — wall time is never in it. Quoting one
wall time — the seven readings and their loads are the claim.

## 7. Motion-valid reduction (#1266)

> **Mechanism 2 is implemented** ([#1268](https://github.com/firejune/rigc/issues/1268),
> *Mechanism 2 — implemented* below); nothing else in this section is. The
> rest is Stage A of
> [#1266](https://github.com/firejune/rigc/issues/1266): a public reproducer
> (`MQ79`, `MQ80`, `mesh-compare`), the measurements made on it, and a proposal
> settled with parts (rig-parts#126, comment 6072801422). #1268 adds one
> report key and one optional input; `compareMeshesInMotion`, every row, bound,
> the reduction's order and budget, and the emitted bytes are unchanged. Marks: **Existing** cites the tree by path and symbol;
> **[measured, #1266]** is a figure taken for this section, with the machine
> beside it; **[proposal]** is unsettled until parts answers the questions at
> the end by number.

The gap, as the card states it: `reduceMesh` holds every static bound and
removes every interior vertex; `compareMeshesInMotion` then refuses the result
on `MQ_LOCAL_DEFORMATION`; and `protect.weightJump` at the value tried keeps
motion by keeping every vertex. Ownership stays as the head of this page puts
it — rigc owns geometry and measurement, parts owns policy and candidate
selection, the consumer declares the motion and the bounds.

⚠️ **Correction [measured, #1271].** The first clause holds as an observation
and misleads as a cause. The strict result's 28 vertices, triangulated
otherwise and with no vertex added, moved or removed, pass the same motion row:
0.244563 px when the same reduction runs interior-first and ends on the same
vertex set, 0.245 px for a left-to-right zipper over the strict result's own
28 (§8, *Triangulation decides motion*). So the reproducer's refusal comes from
the long edges the ear-clipping sequence left across `b`'s ramp (longest
118.8 px), not from the absence of interior vertices — and a 28-vertex mesh
passes where this section's best measured candidates kept 30–53.

### Existing

- **`protect.weightJump`** (`ProtectedFeatures`, `src/meshquality.ts`) is an
  L1 distance between two weight vectors over the bones they name
  (`weightJump`, `src/meshreduce.ts`). It acts twice. Condition (a):
  `protectionOf` protects every **source** edge whose endpoints differ by more
  than the value, and both endpoints become protected vertices, never
  candidates. Condition (b): `tryRemoval` refuses a step one of whose **added**
  edges joins vectors further apart than the value, before the step is
  measured. Both read one edge's endpoints and nothing of its length, so on a
  smooth ramp the figure an edge carries is the ramp's slope times the source's
  spacing: a value under that step protects every edge that crosses the ramp.
  At and above it, (a) protects nothing and (b) still refuses a new edge that
  spans more than the value — measured in *`weightJump` at exactly J* below.
- **The candidate loop** (`removeVertices`): surviving source vertices in
  ascending source index, one attempt per vertex per pass; a step taken stays
  taken; a pass that takes none ends `no-further-valid-reduction`. The budget
  is checked **before** each attempt (`run.steps >= input.budget.maxCandidates`),
  so a call with budget *k* stops after exactly *k* attempts in the state they
  left, reported `budget-exhausted` / `best-meeting-every-bound`. Only the last
  state is returned (`ReducedMesh`); no intermediate mesh is kept, and the
  carried step state (`StepRasters`, *Each step carried from the last one*) is
  dropped with the call. Since #1268 any earlier state is reachable by replay
  (*Mechanism 2 — implemented*).
- **No pose anywhere in the reduction.** `src/meshreduce.ts` links no poser
  (`CUR07` derives the linkers; `MQ26` holds which modules name the
  operations), and `rig-c/mesh` stays geometry-only (§0, P1). `SourceMesh`
  carries weights by bone name and no bone transform (§6, *Insertion
  interpolates, then binds*).
- **`FrameRef.role`** (`src/meshquality.ts`): `selection` exactly when the id
  is in `schedule.selection`, `baseline` for `setup`, `held-out` otherwise;
  each motion row keeps its reading per role (`MotionRowDetail.byRole`) and the
  schedule says `heldOutClaim: false` when no held-out frame exists (P11,
  `MQ42`).
- **The comparison** (`compareMeshesInMotion`, `src/meshcompare.ts`) walks one
  schedule once and poses any number of candidates against one reference;
  carriers are `uvCarriers` over the §3 sample set.

### The fixture

`mvSource` and `mvBuild` in `selftest.ts` (beside the `mesh-compare` suite):
a lens-shaped strip 160 × 48 px whose silhouette bulges 8 px at its middle, a
grid every 8 px (52 boundary and 95 interior vertices, 240 triangles, 280
bindings), the art exactly the pixels whose centre the source hull holds
(6,828 art pixels). Bone `a` at the strip's left end, bone `b` at its middle;
`b`'s share rises linearly from 0 at the left end to 1 at the right across the
whole strip, so the largest source edge jump is 0.1. One animation, `idle`:
`b` alone turns 0 → +5° → −5° → 0 over 2 s. The strict policy is the card's:
coverage 1, overshoot ≤ 3, undercut 0, boundary deviation ≤ 1, influences
`{ maxInfluences: 4, minWeight: 0 }`, no region, budget 5000. The comparison:
`setup` plus `idle` at 12 fps, `grid` and `irr` (50 frames), physics `none`,
6,880 samples (the art pixels and 52 hull UVs), bound 1.

Variants used by the measurements only (scratch, not in the tree), each one
change to that fixture: **kinked** — `b`'s share ramps over x 48..112 only,
flat outside; **smooth** — a smoothstep ramp over the whole strip;
**far pivot** — bone `b` 400 px off the strip's line; **scale** — `b` also
scales (1.15, 0.85) at the +5° key and (0.85, 1.15) at the −5° key;
**diagonal** — the share rises with x + y.

### Measured — the reproducer [measured, #1266]

Printed by `MQ79` and `MQ80` on every run; the figures below are one darwin
run (Apple M4, 10 cores, darwin 25.6.0, Bun 1.4.2, 1-minute load 2.5–4.0
throughout, other sessions running). The motion row is
`MQ_LOCAL_DEFORMATION`, world units (the fixture's bones carry no scale, so
one drawing px is one unit).

| candidate | boundary/interior | triangles | bindings | termination | static | motion, worst frame |
| --- | --- | --- | --- | --- | --- | --- |
| source (reference) | 52/95 | 240 | 280 | — | pass | 0 |
| strict | 28/0 | 26 | 52 | `no-further-valid-reduction` after 175 | accepted | **1.807703 at `idle@grid@1.5` — refused** |
| `weightJump` 0.15 (1.5 × the largest source edge jump) | 42/0 | 40 | 80 | `no-further-valid-reduction` | accepted | 0.058835 at `idle@grid@0.5` |
| the strict order cut at 87 candidates (half of 175) | 28/60 | 146 | 172 | `budget-exhausted`, best-meeting-every-bound | accepted | 0.218939 at `idle@grid@0.5` |

The last two are the card's feasible control: fewer vertices than the source,
every static bound the strict run holds, motion within 1 px. Neither was
chosen by posing — the jump and the cut are derived from the source and from
the strict run — so every frame is held out. ⚠️ Those two derivation rules
were written after the scratch measurements below, so their held-out reading is
a demonstration that such candidates exist, not evidence about a selection
procedure.

`MQ80`, four outcomes on the same fixture:

| outcome | what was run | result |
| --- | --- | --- |
| rigid motion | every vertex wholly on `b` | 28/0, motion 0.000034 — the reduction to the hull passes |
| no reduction | every source vertex in `protect.vertices` | 0 removed, `no-further-valid-reduction` naming `protect:`, motion 0 — identity, not optimisation |
| budget exhaustion | budget 3 | `budget-exhausted` after 3, 1 removed, motion 0.036628 |
| a bound no prefix meets | bound 0.001 | the first prefix that removes anything (budget 2) reads 0.036628 — **fail**, so of the prefixes only the source meets it |

**Correction to the brief.** The brief asked for bound 0.001 as *genuinely
unachievable — nothing but the source passes*. On this fixture that is false:
of the 147 source vertices, 123 can be removed alone with every static bound
held, and **33** of those removals read ≤ 0.001 (4 on the end columns, 29
inside). `MQ80` holds one of them: the midpoint of column 1, removed alone,
reads 0 — its share is its column neighbours' and its position their midpoint,
so the field along that column is linear and the column's edge that spans the
hole carries it exactly. So
*unachievable* is a property of a **search**, not of a mesh and a bound, and
the outcome a motion-aware reduction reports has to say which search found
nothing. On the **diagonal** variant, where the share also climbs with y, no
single removal reads ≤ 0.001 (smallest 0.011931 over the 123); that is the
strongest statement measured, and it is about single removals only.

### Measured — M1, `weightJump` [measured, #1266]

The strict policy plus `protect.weightJump` at each value, on the fixture
(load 2.9–3.7):

| `weightJump` | removed | boundary/interior | triangles | candidates | motion, worst frame |
| --- | --- | --- | --- | --- | --- |
| 0.05, 0.07, 0.09 | 0 | 52/95 | 240 | 0 — `protect:` | 0 (identity) |
| 0.11, 0.15 | 105 | 42/0 | 40 | 189 | 0.058835 `idle@grid@0.5` |
| 0.2 | 105 | 30/12 | 52 | 278 | 0.093172 `idle@grid@1.5` |
| 0.25 | 108 | 30/9 | 46 | 269 | 0.093172 |
| 0.3 | 110 | 30/7 | 42 | 223 | 0.142998 |
| 0.4 | 116 | 28/3 | 32 | 210 | 0.219972 |
| 0.5 | 117 | 28/2 | 30 | 177 | 0.289909 |
| 0.7 | 117 | 28/2 | 30 | 177 | 0.544040 |
| 1.0 | 117 | 28/2 | 30 | 177 | 0.990322 |
| none (strict) | 119 | 28/0 | 26 | 175 | **1.807703 — fail** |

Every value from 0.11 to 1.0 gives a reduced, statically accepted,
motion-valid candidate here — so on this fixture the existing control **does**
answer the card, which the consumer's single value did not show. Every value
at or under the largest source edge jump (0.1) protects every edge that crosses
the ramp and removes nothing: the shape of the consumer's
`removedVertices 0`. Whether that is what happened on the private inputs is
parts's to measure (Q7). On the variants: **smooth** reduces at every value
(19 removed at 0.05, 117 at 1.0) and passes at every value (0.013537 to
0.752818); **kinked** and both **far pivot** variants pass at every value; the
**scale** variant on the linear ramp fails at 1.0 (1.500525) and passes below
it. So no value is safe without a motion
comparison, and a value chosen by one is chosen on **selection** frames.

⚠️ **Correction [measured, #1268].** "At or under" is wrong at the boundary:
the values measured were 0.09 and 0.11, never 0.1 itself. At exactly 0.1 — the
fixture's *J*, nothing strictly above it — no edge is protected and the result
is the 0.11 row's mesh byte for byte (105 removed, 42/0, 189 candidates, motion
0.058835). The sentence holds for values **under** *J*.

### Measured — `weightJump` at exactly J [measured, #1268]

rig-parts reported (rig-parts#126, comment 6072801422, observation (a))
that at `weightJump` = *J* — the largest source edge jump, so condition (a)
protects nothing — the result still differs from the run without the field.
Measured with a scratch copy of `src/meshreduce.ts` that counts, per
candidate, which condition refused it and can switch either off (its
unswitched results byte-identical to `reduceMesh`'s on every call below), on
the reproducer and on the three parts inputs parts named, from the inputs
recorded for stage D1 (rig-c 2.20.0, strict policy, no `weightJump` of their
own). *J* derived as `MQ79` derives it. darwin, Apple M4, load 2.5–2.9.

| input | *J* | `weightJump` | (a) edges protected | refused by (a) | refused by (b) | removed | candidates | mesh |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| reproducer | 0.1 | unset | — | — | — | 119 | 175 | A |
| | | *J* | 0 | 0 | 76 | 105 | 189 | B |
| | | *J*, (b) off | 0 | 0 | — | 119 | 175 | = A |
| | | *J*, (a) off | — | — | 76 | 105 | 189 | = B |
| | | 1.1 *J* | 0 | 0 | 76 | 105 | 189 | = B |
| demo/bottomwear | 1.426772 | unset | — | — | — | 254 | 1101 | A |
| | | *J* | 0 | 0 | 93 | 239 | 1457 | B |
| | | *J*, (b) off / (a) off | | | | | | = A / = B |
| | | 1.1 *J* | 0 | 0 | 79 | 240 | 1446 | C |
| sample/sleeves | 1.445506 | unset | — | — | — | 41 | 421 | A |
| | | *J* | 0 | 0 | 5 | 39 | 423 | B |
| | | *J*, (b) off / (a) off | | | | | | = A / = B |
| | | 1.1 *J* | 0 | 0 | 5 | 39 | 423 | = B |
| sample/bottomwear | 1.56238 | unset | — | — | — | 129 | 331 | A |
| | | *J* | 0 | 0 | 67 | 118 | 583 | B |
| | | *J*, (b) off / (a) off | | | | | | = A / = B |
| | | 1.1 *J* | 0 | 0 | 25 | 126 | 454 | C |

At 1.1 *J* the same held: (b) off gave the unset mesh and (a) off the 1.1 *J*
mesh, on all four. The removed counts at *J* (239, 39, 118) are the ones parts
reported, so the recorded inputs are the calls parts measured. **Condition (b)
is the whole of the difference, and (a) none of it.** It stops when the value
reaches the largest L1 difference between any two source vertices: 2.0 on
both bottomwears, 1.989220 on sleeves, and `weightJump` set to exactly that
returned the unset mesh on all three (on demo/bottomwear and
sample/bottomwear, 0.95 of it still did not). That is the `> 2` parts read
off its own 1.5 *J* row. §6 carries the consumer's reading.

### Measured — M2, the weight-field proxy, and what the motion error is made of [measured, #1266]

**The card's proxy**, built in scratch: at every sample of the §3 set, each
mesh's weight vector barycentric-interpolated in its carrying triangle
(`uvCarriers`), and the difference between the source's and the candidate's in
L1 and L∞ over bones, the largest over samples. Over the 119 accepted steps of
each strict run:

| variant | proxy L∞, strict result | motion, strict result | Spearman, proxy vs motion over the steps | does a proxy threshold separate pass from fail at 1 px? |
| --- | --- | --- | --- | --- |
| fixture (linear) | **0** | 1.807703 | undefined — the proxy is 0 at every step | no |
| far pivot (linear) | 0 | 1.807707 | undefined | no |
| scale (linear) | 0 | 2.507863 | undefined | no |
| kinked | 0.352311 | 2.436222 | 0.944 | yes (passing ≤ 0.097509 < failing ≥ 0.104477) |
| smooth | 0.089830 | 2.085513 | 0.805 | no (0.020663 on both sides) |
| smooth, far pivot | 0.089830 | 4.104883 | 0.926 | no |
| smooth, scale | 0.089830 | 3.126620 | 0.681 | no |

L1 is twice L∞ on every row (two bones), so the two orders agree. Across the
M1 candidates of **smooth** the same proxy value 0.020663 sits under motion
0.138059 to 0.752818. And the proxy cannot see a pivot or a scale at all: the
far pivot doubles the smooth strict result's motion and the scale raises it by
half, at the same proxy.

**Why it is blind on the fixture — derived, then measured.** For a mesh whose
vertex *i* has setup position *xᵢ* and weights *wᵢₖ*, posed by bone maps
*Dₖ(p) = Aₖ p + tₖ*, a point at barycentric *βᵢ* in its triangle is drawn at
*Σᵢ βᵢ Σₖ wᵢₖ Dₖ xᵢ*. Write *w̄ₖ = Σᵢ βᵢ wᵢₖ* and *p = Σᵢ βᵢ xᵢ*. The
translations cancel, and, because the shares and the barycentric coordinates
each sum to 1, for any reference bone 0:

  drawn − *Σₖ w̄ₖ Dₖ p* = *Σₖ (Aₖ − A₀) sₖ*, with *sₖ = Σᵢ βᵢ (wᵢₖ − w̄ₖ)(xᵢ − p)*;

so the candidate's drawn point minus the source's, at one UV, is

  *Σₖ (Aₖ − A₀)(sₖᶜ − sₖʳ)* + *Σₖ (w̄ₖᶜ − w̄ₖʳ)(Dₖ − D₀) p*.

The second term is the card's weight-interpolation error times each bone's
motion at the point — it carries the pivot's lever. The first is a product of
weight spread and position spread inside the carrying triangle, times the
bones' **linear** deformation only; a weight-field comparison cannot see it,
and on a linear ramp it is the whole error. Evaluated at the two extreme key
poses, this expression reproduced `compareMeshesInMotion`'s
`MQ_LOCAL_DEFORMATION` to within 2·10⁻⁵ px at every one of the 7 × 119 accepted
steps measured (the variants above). That is a two-bone measurement; the
derivation does not depend on the number of bones, and nothing with three was
measured.

**The bound it gives.** With a declared envelope — per bone, an upper bound
*εₖ* on the spectral norm of *Aₖ − A₀* over the motion, and a lever
*|(Dₖ − D₀) p| ≤ εₖ |p − cₖ| + τₖ* about a declared pivot *cₖ* — the drawn
difference is at most *Σₖ εₖ |sₖᶜ − sₖʳ| + Σₖ |w̄ₖᶜ − w̄ₖʳ| (εₖ |p − cₖ| + τₖ)*,
pose-free and frame-free. Measured over the same 833 steps: never below the
measured motion; measured / bound 1.0 on the fixture and its far-pivot variant
(a pure rotation makes *Aₖ − A₀* a scaled rotation, so the norm loses
nothing), 0.65–1.0 on kinked and smooth, 0.46–0.96 on smooth with the far
pivot, 0.27–0.72 on both scale variants (the norm forgets direction). As a **step condition** in a scratch copy of
`reduceMesh` (residual ≤ 1 px checked after the art rows), the strict policy
reached 28/2 or 28/3 on six variants, every one within 1 px in motion
(0.529452 to 0.990322) — but the kinked result reversed one triangle
(`MQ_INVERSION` 1): the bound is about positions and certifies no orientation,
stretch or squash.

### Measured — M3, intermediate candidates [measured, #1266]

From a scratch copy of `src/meshreduce.ts` that records the canonical mesh of
every accepted removal (the copy's final mesh and report byte-identical to
`reduceMesh`'s): the strict run takes 119 removals in 175 candidates.

- **Prefix replay already exists.** `reduceMesh` with
  `budget.maxCandidates` set to the attempt at which the *j*-th removal was
  taken returned that removal's mesh — points, triangles and weights byte for
  byte — for **119 of 119** steps. Every checkpoint is therefore reachable
  today by re-running the call, holding nothing.
- **Memory of keeping meshes instead** (JSON of `SourceMesh`): the source
  13,691 bytes; every accepted step 962,633; every 4th 237,026; every 8th
  115,695; every 16th 56,297. The attempt numbers alone are 119 integers.
- **Is motion validity monotone along the order?** At a bound of 1 px, yes on
  all seven variants: no step passes after the first that fails (the last
  passing step: fixture 94 of 119, 28/25; kinked 69, 28/50; smooth 84,
  28/35). The **value** is not monotone — it falls at up to 3 steps of a run,
  by up to 0.143173 px — so at other bounds validity is not monotone either:
  the bounds at which a later step passes after an earlier one fails are
  [0.590995, 0.650925) on smooth/far pivot, [0.275883, 0.275897) and
  [2.507863, 2.749208) on linear/scale, [0.408403, 0.408417) and
  [3.126620, 3.273464) on smooth/scale, and only a sliver above the strict
  result's own value on the rest. A search that assumes monotonicity finds *a*
  passing prefix, not necessarily the last.
- **A bisection over the budget**, selecting on the 25 `grid` frames: 8 calls
  of each operation, 764 ms, budget 122 → 28/25, 76 triangles, 0.990322 on
  selection; evaluated with those frames declared `selection` and the 24 `irr`
  frames held out: 0.927313 at `idle@irr@1.531831`, pass, `heldOutClaim`
  true. On smooth, 9 calls, 829 ms, budget 112 → 28/35, held out 0.886173.

### Measured — M4, cost [measured, #1266]

On the fixture, same machine, five repetitions unless stated, load 2.5–4.0:

| what | wall time |
| --- | --- |
| `reduceMesh`, strict, 175 candidates | 59–68 ms |
| `reduceMesh`, budget 0 (admission and the result's measurement) | 2.6–3.7 ms |
| `compareMeshesInMotion`, one candidate, 50 frames × 6,880 samples | 42–46 ms |
| the same, ten candidates in one call | 215–242 ms (about 19 ms a candidate past the first) |
| a motion check at every accepted step: 119 candidates in one call | 2,669–2,700 ms (2 runs) |
| the same, one call per step | 5,343–5,370 ms (2 runs) |
| every 8th accepted step, one call | 333–334 ms (2 runs) |
| compiling one candidate (`compile` + `modelDocument`) | 0.9–2.5 ms |
| the residual as a step condition, recomputed in full at every step (scratch) | 861–910 ms (one run per variant) |

A motion check per accepted step costs about 40 times the reduction; per 8th
step about 5 times; a bisection about 12 times. The full-recompute residual is
about 15 times the reduction — the card's warning about full invariant work on
every step applies to it as written.

### Mechanism 2 — implemented [implemented, #1268]

Agreed with parts (rig-parts#126, comment 6072801422): Q1 — the list and the
replay promise are enough, parts keeps no intermediate mesh and asks for no
step or byte limit beyond `budget.maxCandidates`; Q2 — a replay is its own
input with its own termination, accepted by parts on the same footing as
`no-further-valid-reduction` and `budget-exhausted` / `best-meeting-every-bound`
provided every declared row passes; Q9 — when parts picks a replay by
comparison, it chooses on the `grid` frames and holds out the `irr` frames of
the same animation, and its held-out claim names them as untouched by the
choice (`heldOutClaim: true`, phases listed; another animation only when the
rig declares one; no held-out set is not something parts reports as a pass). The choosing is parts's
(mechanism 3, Q8); rigc supplies the list and the replay.

```ts
/** src/meshquality.ts — additive. */
export interface ReductionChanges {
  // …every existing field…
  /** `candidatesTried` as it stood when each accepted step was taken, 1-based, ascending. */
  acceptedAt: number[];
}
export interface MeshReductionInput {
  // …every existing field…
  /** Stop after the n-th accepted step. Left out = today. A whole number, 0 or more. */
  stopAfterAccepted?: number;
}
// Termination gains one reason, and the run's own two may carry a stop they did not reach:
//   | { reason: 'replayed-to-accepted-step'; acceptedSteps: number; candidatesTried: number }
//   no-further-valid-reduction / budget-exhausted: stopAfterAccepted?: { requested: number; acceptedSteps: number }
```

- **`acceptedAt`** lists every accepted step — each refinement insertion and
  each removal taken — so its length is `insertedVertices + removedVertices`,
  written last in `changes` (the only key a reader of the earlier report meets
  that it did not know). ⚠️ **Changed by [implemented, #1279]:** each entry is
  now an `AcceptedOperation` (§2) rather than the bare attempt number, and a
  boundary run (§8) is one entry that removes two or more vertices, so the
  length is that sum only on a call without `boundaryRuns`. The promise below
  reads "operation" for "step"; the attempt number is the entry's `step`.
- **The contract:** `stopAfterAccepted: n` returns, byte for byte, the mesh the
  same call without the field held after its *n*-th accepted step, terminated
  `replayed-to-accepted-step` with `acceptedSteps: n` and `candidatesTried:
  acceptedAt[n − 1]`, and its own `acceptedAt` is the full run's first *n*. The
  stop is read straight after the step, before the budget is read again, so a
  replay is never reported as an exhausted budget. `n = 0` takes no step and
  returns the canonical source (with a region declared, the unrefined one).
- **A stop the run does not reach** leaves the run to end as it would have,
  with its own termination, which then carries `stopAfterAccepted: {
  requested, acceptedSteps }`; the input is echoed as
  `effective.stopAfterAccepted`. A refusal (`invalid-input`,
  `unsupported-topology`) does not carry it — the refusal is the answer.
- **Inside a refinement** a replay returns the partly refined mesh and its own
  measurement, which may not be accepted: a refinement step is not required to
  meet the targets, only the steps after it are. A removal step is taken only
  when every required row passes after it, so a replay to one carries that.
- **Refused:** a `stopAfterAccepted` that is not a whole number 0 or more, as
  `REDUCE_INPUT_MISSING` naming the field.
- **Measured** [measured, #1268]: on the reproducer, `stopAfterAccepted: k`
  equals the budget cut at `acceptedAt[k − 1]` for **119 of 119** k, termination
  named each time. On the 19 inputs recorded for stage D1, main (5db8e45)
  against this tree without the field: mesh, `accepted` and the report with
  `changes.acceptedAt` removed identical, **57 of 57**; replays at the first,
  middle and last accepted step equal main's budget cut wherever that cut
  returns a mesh (a budget spent inside a refinement returns none, which is
  why the replay, not the budget, is the contract). Cost: a replay to step *k*
  costs its first `acceptedAt[k − 1]` attempts — on the reproducer 4.1 s for
  all 119, against 0.12 s for the run itself, so a consumer searching the steps
  should bisect (§7 M3: 8 replays) rather than walk them.
- **Controls:** `MQ81` (replay identity at a derived sample of 20 of the
  reproducer's 119 steps — the cost above is quadratic in a walk — and across a
  refinement), `MQ82` (the termination, `n = 0`, `n` beyond the run, a budget
  the stop outlives, the report without the field), `MQ83` (a replay planted to
  stop one step early or late is caught naming the step), `MQ84` (refusals).

### Proposed [proposal]

**Mechanism 2 — intermediate candidates, by replay.** [implemented, #1268] —
see the subsection above; the proposal is kept as written, and the
implementation departs from it in three places, each for a reason stated
there: `acceptedAt` counts refinement insertions too (one count for the list
and the replay); the promise is `stopAfterAccepted`, not
`budget.maxCandidates` (parts's Q2, and a budget cut inside a refinement
returns no mesh); and a replay inside a refinement returns the mesh rather
than being refused. The minimum is a promise
and a list, both additive:

```ts
/** [proposal] Additive on ReductionChanges (src/meshquality.ts). */
export interface ReductionChanges {
  // …every existing field…
  /**
   * The value of `candidatesTried` at which each removal step was taken, ascending —
   * one integer per removed vertex. Refinement insertions are not in it.
   */
  acceptedAt: number[];
}
```

- **The promise:** for every *j*, `reduceMesh` of the same input with
  `budget.maxCandidates = acceptedAt[j]` returns the mesh after exactly the
  first *j* + 1 removals, byte for byte (the 119/119 above, made a contract and
  a control), and with `maxCandidates` 0 the canonical source with nothing
  removed (with a region declared, the refined source — refinement steps count
  against the same budget, so replay below their number is not a prefix of
  the reduction and is refused by name). Work:
  replaying step *j* costs `acceptedAt[j]` attempts, never more than the
  original call; memory: the list.
- **Outcomes:** source / no-op (`acceptedAt` empty, or replay at 0); reduced
  (any replay); the original call's result (the last entry). It never says
  *minimal* and never says *the last valid prefix*: validity along the order was
  measured not monotone at some bounds.
- **Schedule honesty:** every frame a consumer uses to pick a replay is
  `selection`; a held-out claim needs frames disjoint from them (another phase,
  another animation), or none is made.
- **Cannot certify:** anything about meshes off the order. The prefixes of the
  static order are one family; the fixture's best prefix keeps 53 vertices
  where `weightJump` 0.11 and the residual condition reach 30–42.
- **Rejected:** returning meshes (`checkpoints: { every: k }`) as the first
  form — 0.96 MB for this fixture's 119 steps against 119 integers, and replay
  costs one call; it can be added later if a consumer measures replay as too
  slow.

**Mechanism 1 — the weight-interpolation measurement, restated.** As the card
words it (the source and candidate weight fields over a common UV domain) it is
measured above to read 0 where the motion error is 1.8 px, so it is proposed
only as the second factor of a bound that also carries the first:

```ts
/** [proposal] The motion a reduction must stay correct under — declared, never posed. Part-local drawing px, y down. */
export interface SkinningEnvelope {
  /** The bone every other bone's deformation is measured against (D₀). Usually the slot's bone. */
  reference: string;
  bones: Array<{
    bone: string;
    /** εₖ ≥ the spectral norm of (Aₖ − A₀) over the motion; dimensionless. A rotation by up to θ is 2·sin(θ/2). */
    linear: number;
    /** cₖ: the pivot of the lever bound |(Dₖ − D₀) p| ≤ εₖ·|p − cₖ| + τₖ. */
    pivot: [number, number];
    /** τₖ, px. */
    translation: number;
  }>;
}

/** [proposal] Additive on ReductionTargets. Absent = today's behaviour, byte for byte. */
export interface ReductionTargets {
  // …every existing field…
  skinning?: { envelope: SkinningEnvelope; maxResidual: number };
}
```

- **The row:** `MQ_SKINNING_RESIDUAL`, geometry section, unit `px`
  (drawing), bound `<= maxResidual`; value the largest over samples of the
  bound above. Samples: §3's set — every art pixel centre at the final
  threshold and every source hull UV — carried by `uvCarriers` in the source
  and in the candidate (correction 4's refusal applies); a sample either mesh
  does not carry is listed, as §3 lists it, and left out. Weights: each mesh's
  bindings **as written** — after `InfluenceLimits` pruning and the 6-decimal
  grid — so pruning and quantisation error is inside the value, never beside
  it. Coordinates: drawing px; converting to world is the setup map's job
  (`MotionRowDetail.setupMap`), and the row is not stated in world units
  because no single ratio exists under non-uniform scale (correction 4).
  The derivation assumes the source and the candidate place each UV at the same
  setup position — a removal keeps both, an insertion interpolates both (§6) —
  so a source whose UVs are not one affine image of its points makes the row
  `refused`, naming the vertex. Reported by `measureMeshQuality` when `targets.skinning` is given, required
  by `reduceMesh` at every step when it is.
- **The diagnostic** the card asked for — the weight-field difference in L1 and
  L∞, worst sample — as an undeclared row beside it, never a gate alone.
- **Work and memory:** carried per step as `StepRasters` carries the art rows:
  a step changes the carriers only of samples in the triangles it removed and
  added, so only those are re-read. The full recompute measured above
  (861–910 ms against 59–68 ms) is not acceptable as written.
- **Outcomes:** unchanged — `no-further-valid-reduction` naming
  `MQ_SKINNING_RESIDUAL` when it blocks, `budget-exhausted` as today; a source
  that fails its own residual cannot (it reads 0 against itself).
- **Schedule honesty:** it reads no frame, so it selects with none; the final
  comparison can be wholly held out **provided the envelope was declared before
  any comparison was read** — an envelope tuned until a comparison passed is a
  selection made through the envelope.
- **Cannot certify:** motion outside the envelope; `MQ_INVERSION`,
  `MQ_STRETCH`, `MQ_SQUASH` (measured: a residual-gated candidate reversed a
  triangle); `vertices` deform keys, whose offsets a removal drops (§6, P18);
  physics, unless the consumer bounds the simulated bones in the envelope. So
  `compareMeshesInMotion` stays the acceptance; the residual only keeps the
  search where acceptance is likely.

**Mechanism 3 — a motion-aware search.** It needs the poser, and `rig-c/mesh`
links none and must not (§0, P1; the reduction is pure). So inside rigc it
could only be a composed operation on `rig-c/meshcompare` — replay over
`acceptedAt`, compare, keep the best — which is the same two calls parts can
compose today, with no measurement rigc could add to them. It is proposed to
stay in parts, with rigc's part being mechanism 2's promise. If parts wants it
in rigc instead, the signature would be
`reduceMeshInMotion(reduction: MeshReductionInput, comparison: Omit<MotionComparisonInput, 'candidates'>): MeshQualityReport`
on `rig-c/meshcompare`, every frame it reads recorded as `selection`, and it
would add no row and no bound of its own.

### Recommendation

From the measurements: **mechanism 2 first, in its minimum form** — the
prefix promise and `acceptedAt`. It adds no measurement, no poser and no memory
beyond integers, its property was measured byte-exact on every step, and it
lets parts recover a less-reduced, motion-valid candidate from any failed
reduction today (8 replays and 8 comparisons, 0.76 s on the fixture), with
honest roles because parts does the choosing. Its limit is that it only walks
back along the static order (53 vertices where 30–42 were reachable here), and
it can miss the last valid prefix at bounds where validity is not monotone.
**Mechanism 1, restated as the envelope residual, second** — it is the one that
moves the reduction itself towards motion-valid meshes without posing or
selecting a frame (30–31 vertices, every one within 1 px on six variants), and
its derivation was measured exact to 2·10⁻⁵ px; but it needs a carried
implementation (the naive one is 15 times the reduction), an envelope parts can
declare (Q3), and it cannot replace the comparison (inversion). The card's
field-only form is **not** recommended as a gate: it read 0 on the very
fixture that fails at 1.8 px. **Mechanism 3 stays in parts.** And before any
of it, the M1 table says the existing `weightJump` above the source's own edge
jump already yields reduced, motion-valid candidates on this fixture — a sweep
parts can run privately now, recording the frames it chose by as `selection`
(Q7).

### Open with parts

Answered on rig-parts#126 (comment 6072801422); Q1, Q2 and Q9 are folded
into *Mechanism 2 — implemented*, observation (a) of Q7 into *`weightJump` at
exactly J*, and the rest wait for mechanism 1's card. The questions as asked:

- **Q1.** Is `ReductionChanges.acceptedAt` with the replay promise enough for
  parts's retry, or does parts need meshes returned, and at what limit of
  steps or bytes?
- **Q2.** A replayed prefix is reported `budget-exhausted` /
  `best-meeting-every-bound`. Is that acceptable, or should replay be its own
  input field (`stopAfterAccepted: number`) with its own termination, so it is
  not read as an exhausted budget?
- **Q3.** Can parts declare the envelope per bone — `linear` (εₖ), `pivot`,
  `translation` — from the motion it declares, including bones physics drives?
  Should rigc ship the helper that turns a rotation and scale range into `linear`,
  or is that parts's?
- **Q4.** Which bone is `reference` (D₀): the slot's bone always, or declared
  per attachment?
- **Q5.** `maxResidual` in drawing px, as proposed, or in world units through
  the setup map's largest singular scale?
- **Q6.** Is the field-only difference wanted as an undeclared diagnostic row,
  or omitted?
- **Q7.** On the two private attachments: what is the largest source edge jump
  (as `MQ79` derives it), and does a `weightJump` just above it reduce and pass?
  Aggregate figures only.
- **Q8.** Mechanism 3 stays in parts — agreed, or is a composed operation on
  `rig-c/meshcompare` wanted?
- **Q9.** For a replay chosen by comparison, is the held-out set parts will
  report the `irr` phase of the same animations, another animation, or none
  (`heldOutClaim: false`)?
- **Q10.** `targets.skinning` with a `vertices` deform key on the attachment:
  refuse by name, as P18's first path has no such keys anyway?

## 8. Vertex allocation under contour and motion bounds (#1271)

> **One part of this section is implemented**: the five spatial measurements
> of allocation, as `undeclared` rows, and the amplitude declaration two of
> them read — [agreed, rig-parts#126] by parts's answers to Q2 and Q7,
> [implemented, #1280] in *Implemented — the allocation rows* below. The rest
> is Stage A of [#1271](https://github.com/firejune/rigc/issues/1271): a
> public reproducer (`MQ85`–`MQ90`, `mesh-compare`), the measurements made on
> it and on the inputs recorded for stage D1, and the questions for parts at
> the end. The reproducer holds today's behaviour; no bound, order,
> termination or emitted byte changes. Marks as in §7: **Existing** cites the tree by path and
> symbol; **[measured, #1271]** is a figure taken for this section — from the
> stage-A record for #1271 (scratch scripts that import the tree at `5614f63`,
> v2.24.0, and write nothing into it) or printed by the controls — with the
> machine beside it; **[proposal]** is unsettled until parts answers by number.
>
> **Stage B's first landing is implemented** — boundary runs taken as steps and
> `acceptedAt` one entry per operation, [implemented, #1279], in *Stage B —
> boundary runs as steps* at the end of this section, with the decisions it
> rests on [agreed, rig-parts#126]. Everything above it is Stage A as recorded,
> and the reproducer's figures (`MQ85`–`MQ90`) are unchanged by it: they are a
> call without the opt-in.

The consumer's problem, in its own aggregate figures: after #1266's replay
(parts PR #141), two attachments reduce to motion-valid meshes — A from 109/145
boundary/interior to 108/71 (step 75 of 146), B from 104/152 to 102/106 (step 48
of 155), each in 7 replays — while removing only 1 and 2 boundary vertices; the
triangle-area P90 of A's replay is 513 px² against the source's 162. Its
policy is the one §7 used: coverage 1, overshoot ≤ 3, undercut 0, boundary
deviation ≤ 1, influences `{ 4, 0 }`, budget 5000, an isolated ±5° bend at
12 fps, selection on `grid` and `irr` held out, local deformation ≤ 1 with no
inversion. The card is explicit that density is not a defect in itself — a
curved contour and a bend legitimately need samples — and asks which of four
things keeps the boundary dense beside a thinned interior: the boundary
constraints, the initial sampling, the removal order and replay cut, or the
triangulation. The ownership line is §7's: geometry in `rig-c/mesh`, the
motion selection loop in parts.

### Existing

- **The deviation reference is the source's own hull.** `reduceValidated`
  (`src/meshreduce.ts`) takes `sourceHull` as the first `source.hull` points of
  the input and measures every step's `MQ_BOUNDARY_DEVIATION` against it —
  [agreed, P13]: the traced outline is the diagnostic `MQ_TRACE_DEVIATION`,
  never required (*Stage B scope*).
- **The order is already boundary-first.** Hull vertices are source indices
  `0 … hull − 1` and `removeVertices` sweeps surviving vertices in ascending
  source index, so every pass offers the boundary first.
- **A removal's hole is ear-clipped.** `removalOf` (`src/meshreduce.ts`)
  re-triangulates the ring a removed vertex leaves with `earClip`
  (`src/mesh.ts`): the triangulation is a function of the removal sequence, and
  no step changes an edge outside that ring.
- **`buildContourMesh`** (`src/mesh.ts`) traces the alpha on the pixel-corner
  lattice, simplifies it by Douglas–Peucker at `tolerance` and offsets it by
  `margin` — the outline a consumer typically hands `reduceMesh` as its hull.

### The fixture

`abSource` and `abBuild` in `selftest.ts` (beside the `mesh-compare` suite): a
superellipse "bean" (exponent 2.5, half-axes 148 × 56 px, times 1.3) in a
416 × 195 window, its centre line arched toward the ends, its radius perturbed
by 1.5 × (0.6 sin 37θ + 0.4 sin(61θ + 1.3)) px — an organic edge whose
amplitude is the tolerance's order (47,364 art pixels). The boundary is
`buildContourMesh` at **tolerance 1, margin 1** (107 vertices); the interior a
grid every 18 px kept 6 px clear of it (129 vertices), Delaunay-triangulated
with it (363 triangles). Bones `a → b → c` along the long axis, `b`'s share
ramping in by smoothstep over x 117–195 and `c`'s over 234–312, rigid outside;
two animations, each an isolated ±5° bend of one joint over 2 s. The policy and
the comparison are the card's (above), physics `none`. The interior placement
is the fixture's, not parts's (parts's is not public); the boundary half of the
symptom does not depend on it (below).

### Measured — the reproducer [measured, #1271]

Printed by `MQ85`–`MQ89` on every run, and equal to the record's figures;
darwin, Apple M4 (10 cores), Bun 1.4.2, 1-minute load 4–10 with other sessions
running. Motion in px, worst frame.

| mesh | step | boundary / interior (total) | removed boundary / interior | triangles | selection (`grid`) | held out (`irr`) | inversions | accepted |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| source | 0 | 107 / 129 (236) | — | 363 | — | — | — | — |
| strict, fully reduced | 134 of 134 | 102 / 0 (102) | 5 / 129 | 100 | 4.248476 | 3.978170 | 1 | no |
| replay, bisected | 45 of 134 | 102 / 89 (191) | 5 / 40 | 278 | 0.972042 | 0.910200 | 0 | yes |

The strict run ends `no-further-valid-reduction` after 338 candidates naming
`MQ_BOUNDARY_DEVIATION: 2.034193 against <= 1, removing source vertex 106`. The
bisection — lo 0, hi 134, choosing on `grid` — tries 67 (fail 1.933933), 33
(pass), 50 (fail), 41 (pass), 45 (pass 0.972042), 47 (fail), 46 (fail 1.220845)
and takes **45 in 7 replays**, the card's count. A walk of all 134 steps in one
comparison agrees: last pass 45, first fail 46, nothing passing after it, so
validity is monotone along the order here at bound 1. All five boundary
removals fall inside the first 45 steps. Boundary reduction 5 of 107, total
236 → 191 (−19.1 %), against the card's 1–2 and −29.5 % / −18.8 %.

**Controls under the same bounds** (every static row of `measureMeshQuality`
against the source hull, and the comparison above):

| control | boundary / interior (total) | selection / held out | min angle, min / P10 | how |
| --- | --- | --- | --- | --- |
| C0 | 107 / 3 (110) | 0.875000 / 0.819337 | 1.19° / 4.15° | the source's boundary, interior thinned greedily with motion in the loop (selection frames only) |
| C1 | 100 / 3 (103) | 0.867748 / 0.812549 | 1.49° / 4.69° | the fewest-vertex *subset* of the source hull holding every static row, same thinning |
| C2 | **74 / 3 (77)** | 0.875202 / 0.819531 | 3.55° / 5.28° | each hull vertex allowed 0, 0.5 or 0.9 px outward, fewest-vertex outline, same thinning |
| C3 | 74 / 28 (102) | 0.660991 / 0.618940 | 5.80° / 10.98° | C2's outline and every other grid column and row, no search |
| `MQ89`'s control | 107 / 28 (135) | 0.660991, every frame held out | — | the source's outline and every other grid column and row, no search |

Against the replay's 191, C2 holds 114 fewer vertices and C3 89 fewer, each
with a lower motion error, and **C0 keeps the source's boundary untouched and
drops 81**: on this fixture the interior is the larger part of what the
reduction leaves on the table. C0–C2 are existence proofs — the thinning poses
every trial, which `rig-c/mesh` never does (§0) — not proposed mechanisms.
There is no single winner: C2 is fewest and has the worst triangles (minimum
angle 3.5°, area P90 1,566 px², fans from three interior points to the rim); C3
has 25 more vertices and the best shape of any reduced mesh measured, minimum
angle above the source's own 5.0°. No static row sees the difference, because
the card declares no `minAngle`. `MQ89` holds the cheapest of these to build
— no boundary search — and reads the same motion error as C3: the worst frame
is set by the interior.

**Scale and smoothness.** At scale 1 and ripples 0, 0.8, 1.5 and 2.5 px, and at
scale 1.3 with ripple 0, the boundary survives every strict run (0–8 of 29–120
removed), each stop naming `MQ_BOUNDARY_DEVIATION`; the ripple sets *how many*
boundary vertices there are, not what pins them. The smooth variant at scale
1.3 is worse: 43 / 129, nothing removed from the boundary, and the bisection
takes step 2 of 129 (a 1.2 % reduction).

**A negative control.** On the smooth variant, a relocated outline thinned to
22 vertices passes every static row (deviation 0.990201, overshoot 2.828427)
and **fails motion at 1.917724 px with every interior vertex kept**: an outline
thinned to its silhouette minimum can break deformation, and the silhouette
bounds cannot see it. Which edge carries the error was not localised. The same
variant's removal-only subset (43 → 33) and 33 / 6 control pass.

### Measured — what holds the boundary [measured, #1271]

The four suspects the card names were separated with an instrumented copy of
`src/meshreduce.ts` that records, for every attempt, every required row and
not only the first named — its results byte-identical to `reduceMesh`'s on the
19 inputs recorded for stage D1 (on Nova) and on `MQ79`'s fixture (darwin).
Subjects: `MQ79`'s fixture, and demo/bottomwear with the other 8 public
example inputs of that record; none is private art.

| rank | what binds | `MQ79` (strict) | demo/bottomwear (strict, no region) |
| --- | --- | --- | --- |
| 1 | `MQ_BOUNDARY_DEVIATION ≤ 1`, measured against a hull that was itself simplified at 1 px | never alone; fails in 8 of 56 refusals (the corners); bound 2, 4 or ∞ alone: 28 → 28 kept | fails in **847 of 847** boundary refusals, alone in 602; bound 2: 282 → **91** kept; 4 or ∞: **82** |
| 2 | coverage 1 ⇔ undercut 0, overshoot ≤ 3 | **56 of 56** refusals; coverage 0 + undercut 1: 28 → **8** | beside rank 1 in 245, never alone; bind only once rank 1 is relaxed; relaxed alone: 282 → 282 |
| 3 | the replay cut | 0 boundary removals cut at the motion-accepted step 94 | at most 1 (the pass-2 removal at step 254) for any step in 10–253 |
| 4 | removal order | interior-first: the same 28, the same vertex set | interior-first: 282 |
| 5 | re-triangulation | 0 refusals under the strict policy | 0 refusals |

**The mechanism is two equal tolerances.** For one removal from the source,
the measured deviation equals the removed vertex's sagitta over its
neighbours' chord, to six decimals, in 293 of 293 hull vertices of
demo/bottomwear. That hull is a traced staircase simplified at about the same
1 px: sagitta P10 1.109, **P50 1.414** (the pixel diagonal), P90 2.157 px;
only **9 of 293** read ≤ 1, and 9 are what removes alone. Across the 9 example
inputs `MQ_BOUNDARY_DEVIATION` fails in every boundary refusal, relaxing the art
bounds alone moves no boundary count, interior-first order moves none, and
bound 2 removes 21–69 % of the hull with every art bound still holding on the
result. The synthetic inputs of the same record, whose hulls have sagittas
≤ 1, reduce their boundaries normally under the same bound. The order costs
work, not vertices: 847 of demo/bottomwear's 1,101 candidates (77 %) are
boundary retries that cannot pass, because neither the bound nor the
reference moves between passes.

On the reproducer, `MQ90` holds the counterfactual: the deviation bound at 2,
every art bound unchanged, leaves **52 of 107** boundary vertices (55 removed,
coverage 1, overshoot 3, undercut 0, accepted); `MQ86`'s plant with the bound
out of reach keeps 36 and stops on `MQ_OVERSHOOT`. A removal-only outline,
however ordered, can go from 107 only to 100 at bound 1 (C1); it is a
*joint* choice — on the smooth variant 43 → 33, where every single removal is
refused, because one chord replaces a run of staircase vertices — and
`reduceMesh` removes one vertex at a time.

**`MQ79` does not reproduce the boundary half.** It removes 24 of its 52
boundary vertices (46 %), and what keeps the rest is coverage 1 / undercut 0
over art that is exactly the hull's pixel centres — 48 of its hull vertices
have a sagitta ≤ 0.08 px. A public positive control for #1271 needs a traced
boundary simplified at the deviation bound's own tolerance; that is why §8 has
its own fixture.

**Triangulation decides motion.** `MQ79`'s strict result and the same
reduction run interior-first end on **the same 28 vertices** (source indices
listed in the record) and 26 triangles each, triangulated differently:

| triangulation of the 28 | edges | `MQ_LOCAL_DEFORMATION` (bound 1) |
| --- | --- | --- |
| the tree's order (ascending source index) | longest 118.8 px, a 112 px horizontal span across `b`'s pivot; P90 88.0 | **1.807703 — refused** (§7) |
| the same reduction run interior-first | longest 57.2 px | **0.244563 — accepted**, and every replay step 0–119 passes |
| a left-to-right zipper over the strict result's 28 (built in scratch) | P90 47.4 px | **0.245 — accepted**, every static row passing |

On this section's fixture the same holds for the replay: its 191 vertices
Delaunay-triangulated read **0.574257 / 0.537722** against the ear-clipped
0.972042 / 0.910200, and the fully reduced 102 / 0 drops from 4.248476 (one
inversion) to 1.647442 (none) — still refused. A walk of every accepted step,
each Delaunay-triangulated, passes as far as step 101 (102 / 33, 0.912243)
against 45 ear-clipped — but **is not monotone**: the first failure is step 60
and 36 steps between 62 and 101 pass after it, so a bisection over it would not
find 101.

⚠️ **Correction [measured, #1271].** The last clause is wrong: the bisection
rig-parts runs, read off the same walk, probed 67, 100, 117, 108, 104, 102, 101
and **found 101** (and 81 on the smooth variant), because its probes fell above
the non-monotone stretch. What holds is that it is **not guaranteed** to find
the last pass (*Measured — bounded alternatives*).

### Measured — spatial measurements of allocation [measured, #1271]

Each measured on six synthetic fixtures built to be accepted or flagged (one
domain, 160 × 52 px, two bones, art the hull's pixel centres, deviation
bound 1), on `MQ79` at every accepted step, and on the 8 public example inputs
that reduce. The bars are separations measured on those fixtures — the
geometric midpoint between the worst must-accept and the best must-flag
reading — not defaults rigc would set; each is proposed as an `undeclared`
diagnostic row first.

| measurement | what it reads | must-accept worst → bar → must-flag best | needs |
| --- | --- | --- | --- |
| **grade max** — max over edges of \|h_u − h_v\| / L, h = mean incident edge length | an uncontrolled transition, dense beside sparse, justified or not | 0.998 → **1.64** → 2.694 (×1.64 each side) | geometry |
| **minimum angle P10** | sliver fans off a dense boundary | 17.10° → **7.77°** → 3.53° (×2.2) | geometry |
| **allocation contrast Δ** — the share of the *dense* vertices removable alone, by a half-edge collapse judged against declared needs only, minus that share among the rest; economy **E** = the share of all | density no declared need explains, located | 0 → **0.25** → 0.510; holds for gradation G 0.5–1.64 (accept ≤ 0.124) | δ, mask, weights, gradation G, **a declared motion amplitude {θ, ε}** |
| **deformation load D** — max over edges of L · Δshare, px; D·θ/4 bounds the chord error of the mesh's own field | an edge too long for the weight change it spans | on `MQ79`, predicted / posed **1.002–1.091 over all 119 accepted steps**, Pearson 0.99999 — **and on `MQ79` only** (below) | weights; θ to read it in px |
| **B\*** — the fewest source-hull vertices a closed outline can keep with every static row held | boundary beyond what the silhouette needs | ear-clipped B\* outlines pass `measureMeshQuality` with the input's own targets on **9 of 9** inputs that reduce | δ, mask |

What they read: `MQ79`'s replay at step 94 flags on all three bars (grade
4.52, minimum angle P10 4.49°, Δ 0.357 — its 25 interior vertices are the
source's whole 8-px grid at x 120–152 and none at x < 120, the ascending-index
prefix); its source reads Δ 0.020, E 0.524 — uniformly over-dense, economy and
not allocation. `MQ79`'s strict result keeps exactly B\* = 28 boundary
vertices; the public example inputs keep **0–65 above B\*** (282 against 217
on demo/bottomwear). D·θ/4 reads 1.814 on the strict result (1.808 posed) and
0.249 on the zipper (0.245 posed). And the dense-boundary-beside-sparse-interior
pattern is already in every example **source**: boundary nearest-neighbour P50
3.2–5.1 px against interior 5–36 px, grade max above 1.64 on 7 of 8.

**Rejected, and why:** raw uniformity (the coefficient of variation of local
size) reads highest on a fixture that must *not* be flagged (0.609, against
0.416 on one that must) — it is the global uniformity the card rules out;
boundary-transition and longest/shortest-edge ratios read justified anisotropy
3.40 against an abrupt transition's 3.86; the minimum angle itself (rather
than P10) reads 10.49° against 10.43° across the pair it must separate;
deformation-load equidistribution reads the justified fixture 0 and the
unjustified 0.68 — backwards; an isotropic need-field ratio is undefined on
even meshes and backwards where defined; a collapse test whose transition
term is built from the mesh's own sizes justifies its own abruptness.

⚠️ **Nothing that reads justification separates without a declared
amplitude.** With no {θ, ε}, the dense-share reading is 0.920 on the even
positive control and 0.981 on the worst negative: such a row has to report
`not-measurable`, never a pass. Two fixtures with **identical** area and edge
percentiles (26 / 94.25 / 120.25 px², 4 / 13.60 / 20.62 px) and identical grade
(0.543) read Δ −0.941 and 0.510 — their density is justified on one weight
field and not on the other, and only the weights and the amplitude tell them
apart. The predictor D is validated on one fixture (two bones, one rotation, a
linear ramp); read under an assumed single θ on many-bone fields it is a
reading to compare against, not a motion row.

⚠️ **Correction [measured, #1271]: the predictor does not generalise.** On the
smooth fixture with flips, D·θ/4 against the posed row reads Pearson
0.00–0.69 and agrees on pass or fail at 24–55 of 130 steps; on sample/topwear's
fully reduced mesh it predicts 0.780 where the linear-blend stand-in reads
3.039 [assumed motion]. D bounds the chord error of the mesh's own weight
field; the comparison measures the difference to the source, which includes
§7 M2's lever term, invisible to D. `MQ79`'s source reads 0.012 against itself,
which is why it agrees there. D stays a location reading; it is not a motion
predictor, and no question below offers it as one.

### Implemented — the allocation rows [agreed, rig-parts#126; implemented, #1280]

parts answered Q2 and Q7 on rig-parts#126: all five measurements above are
reported, as `undeclared` rows, with no bound declared on any of them today;
the amplitude the two weight-aware ones read is an optional field of
`MeshMeasureInput` that parts fills from the motion it already declares. The
measurements are `src/meshallocation.ts`; `measureMeshQuality`
(`src/meshquality.ts`) turns them into rows of the geometry section of every
report it writes — and so of every `reduceMesh` result and every
`compareMeshesInMotion` setup section, which are its reports.

| Code | Value | Unit | `worst` | `not-measurable` when |
| --- | --- | --- | --- | --- |
| `MQ_GRADE` | grade max: the largest \|h_u − h_v\| / L over the mesh's unique edges, h a vertex's mean incident edge length | ratio | the edge (the first in sorted order on a tie) | an edge has zero length |
| `MQ_MIN_ANGLE_P10` | the tenth percentile of the triangles' smallest angles, nearest rank at round((n − 1) · 0.1), ties by triangle index; the angle is `MQ_MIN_ANGLE`'s formula | degrees | the triangle at that rank | never on a mesh `traceOutline` accepts |
| `MQ_ALLOCATION_CONTRAST` | Δ, as defined above; economy E and the counts both are taken from in `allocation.contrast` | fraction | the dense vertex with the lowest ν | `motionAmplitude` left out or `null`, `source.weights` null, `targets.maxBoundaryDeviation` null, fewer art samples than `minArtSamples`, a refused region, a pair of bones no track declares, or an empty dense or rest class |
| `MQ_DEFORM_LOAD` | the largest L · Δshare · θ / 4 over the edges, px: the chord-error bound of the mesh's own weight field under the declared amplitude | px | the edge; `{ at: {} }` when no edge moves a share | `motionAmplitude` left out or `null`, `source.weights` null, or a pair of bones no track declares |
| `MQ_BOUNDARY_NECESSARY` | B\*, over the **reference hull**; the search's work in `allocation.search` | count | the first vertex of this mesh's hull, in walk order, that is not on the B\* outline; `{ at: {} }` when every one is | no `referenceHull`, `targets.maxBoundaryDeviation` null, or fewer art samples than `minArtSamples` |

Every row carries `allocation.reading`, one fixed sentence saying what the
value is a reading of; `MQ_DEFORM_LOAD`'s says it is **not predicted motion**
and no difference to any reference — §8's correction above. None has a field
to declare a bound in, so each is `undeclared` when measured: out of the pass
count, never required, never the constraint a step is refused on, never a
pass. The section's `summary` counts them like every other row.

**The amplitude.** `MeshMeasureInput.motionAmplitude?: MotionAmplitude | null`:

```ts
interface MotionAmplitude {
  tracks: Array<{
    track: string;                                         // echoed, never read
    pairs: Array<{ bones: [string, string]; theta: number }>; // θ = ‖M − I‖ of the pair's relative linear part
    epsilon: number;                                       // ε, drawing px, above 0
  }>;
  gradation: number;                                       // G, px per px, 0 or more — Δ only
}
```

Left out, it is not declared; `null` declares it absent (as a `null` art
bound is, #1257) — both leave `MQ_ALLOCATION_CONTRAST` and `MQ_DEFORM_LOAD`
`not-measurable` with a reason naming the field, and differ only in the
reason's words and in the echo: `EffectiveSettings.motionAmplitude` is written
when the input set the field, `null` included, and absent otherwise. Anything
else that is not a `MotionAmplitude` in full is refused
(`REDUCE_INPUT_MISSING`, naming the field's path). θ is dimensionless: 2 sin(α
/ 2) for a rotation by α (≈ α in radians for a small one), |s − 1| for a
uniform scale by s. A pair is unordered; declared twice, in one track or
several, the larger θ and the larger θ / ε are read. Across an edge the share
moves from the bones that lose it to the bones that gain it; every such pair
has to be declared — a pair no track declares makes both rows
`not-measurable`, naming the two bones and the edge, because no amplitude is
assumed (a bone that does not move is declared with θ 0). The edge's θ is the
largest over those pairs, which bounds |Σ Δw_b R_b| ≤ Δshare · max θ, so on a
two-bone field the reading is exactly §8's and on a many-bone field it is an
upper bound. The field declares no bound; it changes no other row.

⚠️ **One field more than the card named, and why.** Δ's need field relaxes at
a gradation G (the table above: "needs … gradation G"), and the stage-A
record left who declares G open. No default is invented, so G is
`motionAmplitude.gradation`, declared beside the amplitude it is read with;
only `MQ_ALLOCATION_CONTRAST` reads it.

**Readings the tree fixes that the stage-A record left open** — each measured:

- **B\* is read against `referenceHull`** — the source hull a `reduceMesh`
  result is held to — so a reduction's report reads the source's B\* beside
  the result's `counts.boundaryVertices`, the comparison this section makes.
  `reduceMesh` measures every step against the same source hull, so B\* is
  computed **once per call** (memoised on the call's art rasters, keyed by the
  hull's coordinates and δ). The chord-to-run half of a skip is exact (the
  branch and bound `directedHausdorff` uses, to `1e-9` px) where the
  prototype sampled every 0.25 px; and the outline is at least three
  vertices. The search tests every forward skip of two or more from every
  hull vertex once: **at most n × (n − 2) shortcut tests** for an n-vertex
  hull, which `allocation.search` reports beside the count (`MQ125` holds
  tests ≤ bound). On the recorded inputs B\* is the prototype's on all 7
  (217, 14, 95, 162, 21, 166, 59).
- **Δ's dense class reads local size on the `r6` grid**, so which vertices are
  "below the median" is not decided by a summation order. ⚠️ **Correction
  [measured, #1280]** to the stage-A record's consumer readings of Δ (not to
  this section's fixtures, which read identically): those were taken on
  points rebuilt from UVs, up to 4·10⁻⁵ px from `points`, and on a lattice
  source that is enough to move vertices across the median. On `points`
  [assumed amplitude: θ = 5° between every pair, ε = 1, G = 0.75, as the
  record assumed]: sample/neck **−0.214** (UV-rebuilt 0.354), sample/topwear
  −0.514 (−0.090), sample/bottomwear −0.047 (−0.008), demo/bottomwear −0.351
  (−0.383; the record printed −0.378); E is the same number both ways on all
  four. So on lattice-sampled sources Δ is decided by ties at the median and
  moves with a sub-pixel perturbation of the points — read it there as the
  location of the removable vertices (its `worst`) and E, not as a signed
  figure.
- **`MQ_DEFORM_LOAD` reports D · θ / 4 in px**, not D: the card makes the row
  `not-measurable` without an amplitude, and with one the per-pair θ is part
  of which edge is worst.

**On a reduction.** `MeshReductionInput` has no `motionAmplitude` and this
change adds none, so on every `reduceMesh` report Δ and the load are
`not-measurable`, naming the field; B\*, grade and P10 are measured. A caller
that wants them measures the returned mesh with `measureMeshQuality` and its
amplitude.

**Fixtures [implemented, #1280].** `MQ120` rebuilds the six fixtures above in
the suite and reads every figure of their table to the printed precision —
grade 0.998 → 2.694, P10 17.10° → 3.53°, Δ 0.000 → 0.510, at gradation 0.5,
1.0 and 1.64 (accept ≤ 0.124) — and B\* reads 4 on the four rectangle
outlines and 57 of 72 on the two wavy ones (`MQ125`). The reproducer's strict
run keeps exactly B\* = 28 boundary vertices, read off its own report.

**The opt-out [measured, #1280].** Every report a caller already writes is
the same bytes but for the five rows: with them taken out and each summary
recounted, the text is identical. On the inputs recorded for stage D1 —
demo/* and sample/*, 7 inputs (`demo__bottomwear`, `demo__neck`,
`sample__bottomwear`, `sample__hair_back`, `sample__neck`, `sample__sleeves`,
`sample__topwear`), each reduced and measured admission-shaped and
final-shaped on the source and the result — **34 of 34 texts identical**,
every returned mesh identical; darwin, Apple M4, against the tree this
change starts from (`6dcda87`). In suite, `MQ124` holds it on ten public subjects.

**Cost [measured, #1280].** Each row on its own, Nova pool (WSL2, Bun 1.4.2,
load 2.7), best of 5 (B\* and Δ best of 1), Δ and the load under the assumed
amplitude above:

| input | V / hull | grade | P10 | load | B\* (tests) | Δ |
| --- | --- | --- | --- | --- | --- | --- |
| demo/bottomwear source | 536 / 293 | 0.59 ms | 0.12 ms | 2.56 ms | 92.4 ms (85,263) | 244.2 ms |
| demo/bottomwear result | 282 / 282 | 0.14 ms | 0.06 ms | 0.50 ms | 53.6 ms | 20.5 ms |
| sample/sleeves source | 231 / 198 | 0.07 ms | 0.02 ms | 0.40 ms | 15.5 ms (38,808) | 31.0 ms |
| sample/bottomwear source | 230 / 107 | 0.10 ms | 0.02 ms | 0.52 ms | 2.9 ms (11,235) | 60.2 ms |
| sample/topwear source | 142 / 66 | 0.05 ms | 0.02 ms | 0.16 ms | 1.6 ms (4,224) | 22.4 ms |
| sample/neck source | 107 / 26 | 0.04 ms | 0.01 ms | 0.14 ms | 0.1 ms (624) | 16.0 ms |
| demo/neck source | 89 / 14 | 0.04 ms | 0.01 ms | 0.12 ms | 0.0 ms (168) | 12.9 ms |

`reduceMesh` reads grade and P10 at every measurement and B\* once:
`reduceMesh` before and after, in one process, alternating, best of 5, same
pool job (load 3.9–4.7) — demo/bottomwear 3,038 → 3,180 ms (+4.7 %),
sample/sleeves 2,282 → 2,340 (+2.6 %), sample/bottomwear 725 → 742 (+2.3 %),
sample/topwear 239 → 259 (+8.1 %), sample/neck 58 → 66 (+14 %), demo/neck
29 → 39 ms (+10 ms).

**Controls [implemented, #1280]**, in `mesh-quality`, numbered from `MQ120`
to stay clear of codes another change was opening in `mesh-compare`:
`MQ120` (the fixtures' separations; plant: the deformation need dropped),
`MQ121` (grade, P10 and the load against the suite's own derivation; plants:
grade undivided by L, P10 read as the minimum, θ dropped), `MQ122`
(`not-measurable` without the amplitude, the weights, the deviation bound, the
reference hull, or for an undeclared pair, each naming it; plants: the
rejected reading measured without an amplitude, an undeclared pair read as
rigid), `MQ123` (no row required: verdict, acceptance and pass/fail counts
those of the report without the rows, on eight subjects and the reduction;
plant: the rows required), `MQ124` (the opt-out identity; plant: a
measurement that rewrites its input's triangles), `MQ125` (B\*'s outline
holds coverage, undercut and deviation, the search under its bound, the
reproducer keeps B\*; plant: B\* without the art test), `MQ126` (one input,
one text, in any key order of the amplitude) and `MQ127` (refusals). Each
plant is an `AllocationPlant` passed through the internal
`measureMeshQualityPlanted`; `measureMeshQuality` plants none. `MQ126`'s
claim was seen to fail by hand with an echo that passed the input object
through.

**What the brief or the card said that the tree does not.** There is no
`residuals` section in `mesh-quality-report/1`: the rows are geometry rows,
as every other `undeclared` row is. AUTHORING.md has no row table — §4 is
the row table — so it does not change. "Region-normalised where §8 says so":
§8 normalises none of the five by a region's density (the stage-A record kept
that ratio as a diagnostic, not a row); regions enter Δ as declared needs, L0
inside and L0 + grade · d in the band, through `regionEdgeBound` — the bound
`MQ_MAX_EDGE` and `MQ_TRANSITION` read.

### Measured — bounded alternatives [measured, #1271]

Each alternative was a switch in a scratch copy of `src/meshreduce.ts` (the
instrumented copy above plus the switches); with every switch off it returned
the tree's result byte for byte on all 9 subjects. Subjects: this section's
fixture (primary, and its smooth variant), `MQ79`'s, and six public example
inputs recorded for stage D1 (demo/neck, demo/bottomwear, sample/neck,
sample/topwear, sample/bottomwear, sample/sleeves). The two fixtures and
`MQ79` were posed by `compareMeshesInMotion` (`grid` selection, `irr` held
out, bound 1, no inversion). The example inputs have no public rig, so they
were read through a scratch linear-blend stand-in **[assumed]**: every bone
pivots at the share-weighted centroid of the vertices it carries, with no
hierarchy, and turns ±5° alone. Where pivots and hierarchy are known it
matched the posed comparison to 1.0000 on `MQ79` and on the primary fixture.
Its figures are a common yardstick between variants, not a verdict on any
rig-parts attachment; D2 is where those are posed. Runs: darwin (Apple M4,
load 5.2–14.1) and three Nova pool jobs (WSL2, load 1.2–4.4).

| rank | mechanism | primary fixture, replayed (posed): total (b/i), selection / held out | demo/bottomwear, replayed [assumed motion] | cost | contract change |
| --- | --- | --- | --- | --- | --- |
| baseline | the tree | 191 (102/89), 0.972 / 0.910 | 526 (283/243), 0.450 / 0.488 | — | — |
| 1 | **Delaunay flip post-pass** on every returned mesh, vertex set kept | **135 (102/33), 0.912 / 0.854** | 526 — no change | +0–5 % time, no extra candidates | the triangulation becomes the operation's own, so output bytes differ: opt-in only |
| 2 | **boundary runs as steps**: up to 8 consecutive outline vertices removed as one accepted step, before the interior, every bound as declared | 189 (100/89); with rank 1, 133 (100/33) | **488 (245/243)**, 0.700 / 0.670; with rank 1, **470 (227/243)** | ×6–10 time, candidates 1,101 → 4,804 on demo/bottomwear | one accepted step removes 2 or more vertices, so `acceptedAt.length = insertedVertices + removedVertices` no longer holds |
| 3 | **error-priority order** (`dprio`: each pass sorts candidates by the smallest L·½‖Δw‖₁ over the edges the removal adds) | 140 (102/38), 0.655 / 0.614; with rank 1, **110 (102/8)** | 525 (284/241) | +0–15 % time | none in the format; a different step sequence |
| 4 | **relocation plus weight transfer** (a relocated outline as step 0, then the tree's passes) | 163 (74/89); with rank 1, 107 (74/33) | **refused at step 0**, 3.477 / 2.865 | +0.05–1.6 s search | P19, a deform refusal, the UV window, the meaning of step 0 |

What each did:

- **The flip post-pass decides the interior.** On `MQ79` it turns the fully
  reduced 28/0 from refused at 1.807703 into accepted at **0.2446 / 0.2290**,
  28 vertices where the replay keeps 53; on the smooth fixture the replay goes
  170 → 91; under the stand-in sample/neck 57 → 26 and sample/topwear
  121 → 80. It does nothing on demo/bottomwear (526): a 282-vertex outline over
  an eleven-bone field needs long diagonals whatever the triangulation, so the
  interior has to stay and the replay has to choose it. Whether the flips run
  once on the returned mesh or after every removal is moot for Delaunay: the
  two gave identical figures on 8 of 9 subjects (`MQ79` differs by a
  cocircular tie), the in-loop form costing up to 35 % more.
- **Boundary runs are the only mechanism that moved the consumer-like boundary
  at the 1 px bound as declared.** Fully reduced: demo/bottomwear 282 → **225**
  against B\* 217, sample/sleeves 190 → **168** (B\* 166), sample/bottomwear
  101 → 95, sample/topwear 63 → 59, sample/neck 26 → 21; on the two fixtures
  102 → 100 and 43 → 33, each the removal-only optimum. Because the runs are
  steps before the interior, a replay keeps them.
- **A boundary simplified as one pre-step is refused by motion.** The same
  outline taken whole at step 0 (the B\* subset) reads **3.081 / 2.865 px** on
  demo/bottomwear and 1.813 / 1.815 on sample/bottomwear [assumed motion],
  refused, where the runs replay to 245 and 96 within 1 px. A replay cannot step
  back into a pre-step, so boundary simplification has to be steps, and the
  replay decides how far it goes.
- **Error-priority order** helps the two fixtures and sample/topwear
  (121 → 86) and is monotone wherever it was posed, does nothing on
  demo/bottomwear (526 → 525) and costs vertices on sample/sleeves (209 → 223,
  at lower error). Interior-first and sagitta orders gain nothing outside
  `MQ79`.
- **Relocation** reaches A1's C2 and C3 under a defined weight transfer —
  barycentric inside a source triangle, from the nearest point of the source
  hull outside it, then §6's insertion rule: 0.876213 / 0.820477 and
  0.660991 / 0.618940 — and the largest savings where it holds (`MQ79` 12
  vertices with flips). But it is **refused by motion at step 0 on 4 of 9
  subjects** (the smooth fixture 1.927 px, demo/bottomwear, sample/bottomwear,
  sample/sleeves), and its first `MQ79` run was refused at admission with
  `REDUCE_UV_RANGE` — an outward move left the texture window, which no
  silhouette row reads. Not recommended for Stage B on this evidence.
- **Rejected:** flips by the deformation-load criterion in global form, which
  rewrite the source's own triangles (step 0 reads up to 2.709 px on
  demo/bottomwear); a hole-local form was not built.

**What needs which contract change.** None of ranks 1–3 needs the deviation
bound redefined or a motion amplitude declared; each needs a byte-identical
opt-out.

| contract item | flip post-pass | boundary runs | error-priority order | relocation |
| --- | --- | --- | --- | --- |
| the returned triangulation is the operation's (§1, §3) | **yes, opt-in** | — | — | with flips |
| `acceptedAt` counts operations, not vertices | — | **yes** | — | step 0 |
| P19 attributes kept; a deform refusal for a moved vertex | — | — | — | **yes** |
| the UV window bounds the search | — | — | — | **yes** |
| `stopAfterAccepted: 0` is the source | yes (the source, flipped) | yes | yes | **no — the relocated source** |

**Replay and monotonicity.** Every probed `stopAfterAccepted: k` returned the
walk's snapshot byte for byte under every variant (9 of 9 probes per variant on
the fixtures and `MQ79`, 1–8 per example input); a second run was identical,
and the primary fixture's hashes were equal on darwin arm64 and WSL x86_64.
The post-pass keeps replay byte-exact by construction too: the removal loop is
unchanged, so the state at step k is the tree's, and the flip is a
deterministic function of that state. **Monotonicity is not guaranteed under
it**: the Delaunay walk's first failure / last pass / passes after the first
failure read 60 / 101 / 36 on the primary fixture, 25 / 81 / 50 on the smooth
one and 57 / 62 / 5 on sample/topwear. The bisection rig-parts runs found the
last pass on all three (101, 81, 62) because no probe fell in the stretch —
which is luck of placement, not a property.

**Trade-off, not a universal minimum.** Fewest vertices and triangle shape
conflict on the two fixtures: on the primary one every reduction below 110
vertices has minimum-angle P10 2.2–3.1°, against 4.8° at 110, 7.2° at 135 and
10.8° at 191 — and the bar above (P10 ≥ 7.77°) flags 135 at 7.16°. On `MQ79`
and demo/bottomwear the fewest-vertex result found is also the best-shaped. No
mechanism here is claimed as the minimum.

### Questions for parts

Numbered afresh for #1271; cited as "§8 Q1" and so on where §7's could be meant. Each
comes from a measurement above; none is settled by this page.

- **Q1.** The boundary is held by two equal tolerances: an outline simplified
  at 1 px and a deviation bound of 1 px measured against that outline. Which of
  these, if any, does parts want — each loosens something different:
  (i) parts declares `maxBoundaryDeviation` as its sampling tolerance plus an
  allowance (on the reproducer bound 2 keeps 52 of 107 with every art bound
  held; on demo/bottomwear 91 of 293) — loosens the declared silhouette limit,
  which the card lists among the limits not to loosen; (ii) parts samples the
  hull finer than the bound it declares — loosens nothing declared, and moves
  the reference with the sampling, so it buys removability only where the art
  allows; (iii) P13 is reopened so the bound reads against the traced art
  outline rather than the source hull — loosens the agreed meaning of a
  required row, and every recorded result's verdict would have to be re-taken;
  (iv) a boundary simplification step in `rig-c/mesh` that chooses an outline
  jointly (one chord for a run of vertices) held to the art bounds and the
  declared deviation — loosens no bound, adds an operation whose removals are
  not one vertex at a time. Option (iv) as boundary runs taken as steps moved
  demo/bottomwear's fully reduced boundary 282 → 225 at the 1 px bound as
  declared (*Measured — bounded alternatives*; its contract change is Q10).
- **Q2.** The allocation and load readings need a declared amplitude: θ per
  pair of bones a share moves between, and ε. Who declares it — parts from the
  motion it already declares, or the consumer per attachment — and does it
  belong in `MeshMeasureInput` as an optional field? Without it those rows
  report `not-measurable`. [agreed, rig-parts#126] parts, from the motion it
  already declares, in an optional field of `MeshMeasureInput`;
  [implemented, #1280] as `motionAmplitude` (*Implemented — the allocation
  rows*).
- **Q3.** On `MQ79` and on this fixture a different triangulation of the same
  vertex set is what passes motion. Is a post-pass that keeps the vertex set and
  re-triangulates acceptable, given that it changes the bytes of every result
  it touches — and if so, opt-in only, so today's calls stay byte-identical?
- **Q4.** The bisection rig-parts runs over `acceptedAt` assumes passing is
  monotone in the step. Ear-clipped it was on both fixtures at bound 1; with the
  Delaunay post-pass it is not guaranteed (first failure / last pass / passes
  after it: 60 / 101 / 36, 25 / 81 / 50, 57 / 62 / 5), though the bisection
  found the last pass on all three. If a triangulation pass ships, does
  rig-parts need monotonicity kept, or will it accept the disclosed
  non-monotone stretch and walk or search differently where it matters?
  ⚠️ **Correction [agreed, rig-parts#126]:** the question's premise is wrong —
  rig-parts's search reports a passing prefix found by bisection, not
  necessarily the last, no monotonicity is promised by either side, and the
  chosen step is re-compared on the whole schedule before anything is written.
- **Q5.** Is relocation wanted at all? The fewest-vertex controls (C2, C3) need
  positions not in the source, which breaks the index correspondence a
  `vertices` deform key relies on (§6, P18), needs a weight-transfer rule (the
  controls carried the source vertex's weights over a move of at most 0.9 px,
  exact only because the field there depends on x alone), and moves UVs off
  the source's.
- **Q6.** The smooth negative control shows an outline thinned to its
  silhouette minimum failing motion (1.92 px) with every interior vertex kept.
  Should a boundary operation (Q1 iv) be held to the motion comparison by
  rig-parts before acceptance, as every reduction is today, rather than
  guarded inside the operation? The measurements favour the comparison: the
  boundary runs leave the motion to the replay, a pre-step the replay cannot
  undo was refused, and the deformation load D is not a validated motion guard
  beyond `MQ79` (*Measured — spatial measurements of allocation*, correction).
- **Q7.** Of the measurements proposed as `undeclared` rows — grade max,
  minimum angle P10, allocation contrast Δ with economy E, deformation load D,
  B\* — which does parts want reported, and does it want to declare a bound on
  any of them, given the bars above come from one synthetic domain? D would be
  reported as a location reading only, never as predicted motion.
  [agreed, rig-parts#126] all five, `undeclared`, and no bound on any of them
  today; [implemented, #1280].
- **Q8.** On the two private attachments, in aggregate figures only: the
  sagitta distribution of the source hull (P10/P50/P90 and the count ≤ the
  declared deviation), and B\* against the kept boundary — whether the boundary
  half there is the same two-tolerance mechanism.
- **Q9.** Does rig-parts accept that the returned triangulation becomes the
  operation's own — the Delaunay post-pass, opt-in, the opt-out path
  byte-identical, replay byte-exact — with the non-monotone interval of Q4
  disclosed rather than prevented?
- **Q10.** May `acceptedAt` become one entry per accepted operation rather than
  per vertex, so that one step can remove a run of boundary vertices? What does
  rig-parts's reader of `acceptedAt` and `stopAfterAccepted` need for that —
  the vertices each step removed, or only the count per step — and is the
  prototype's ×6–10 cost acceptable while it is brought down?
- **Q11.** Is a weight-aware removal order such as `dprio` rig-c's — a pose-free
  default inside `rig-c/mesh`, behind an opt-in — or rig-parts's policy, passed
  in as an order? It reads weights only, and its ranking assumes every share
  change bends equally.

### Stage B — boundary runs as steps, and `acceptedAt` per operation [implemented, #1279]

**Decided** [agreed, rig-parts#126, its answers to the questions above]: Q1 —
option (iv), boundary runs taken as steps inside `rig-c/mesh`, under the
declared bounds and P13's reference meaning ((ii) is parts's own experiment;
(i) and (iii) refused); Q6 — a run stays replayable and is held to parts's
final motion comparison like every step, and no pre-step the replay cannot
back out of; Q10 — `acceptedAt` counts operations, recording each one's kind
and count, the prototype's cost accepted while it is brought down, absolute
runtime and candidates reported; Q4 — nothing here promises that passing is
monotone along the steps.

```ts
/** src/meshquality.ts — the input's one new field; AcceptedOperation is in §2. */
export interface MeshReductionInput {
  // …every existing field…
  /** Opt-in. Left out = no run is tried. */
  boundaryRuns?: { maxVertices: number }; // a whole number, 2 or more; no default
}
```

- **What a run is.** A run is 2 to `maxVertices` consecutive outline vertices,
  every one a surviving, unprotected *source-hull* vertex (inserted vertices and
  interior vertices the outline has reached are never in one), removed one
  after another by the same `removalOf` a single removal uses and replaced on
  the outline by the chord from the vertex before it to the vertex after it;
  nothing is measured in between. It never leaves fewer than three outline
  vertices.
- **Held exactly as a single removal is.** After the run: every structural
  condition (each hole simple and ear-clipped, the outline one loop, every
  protected edge still an edge, `weightJump` over the edges the run added),
  then every required row of `measureMeshQuality` — the art rows,
  `MQ_BOUNDARY_DEVIATION` against the source hull at the declared bound,
  `minAngle` when declared, each region's rows. A refusal is named like any
  other, `<row>, removing source vertices a, b, c as one boundary run`.
- **Order, which is the determinism (A18).** Each removal pass, with the field
  set, first sweeps the runs and then the single removals exactly as without
  it. The runs: for each surviving, unprotected source-hull vertex in ascending
  source index, the runs starting there and following the outline the way the
  source hull is listed (the canonical walk), longest first — `maxVertices`
  down to 2 — the first one taken ending that start, the sweep going on to the
  next index over the outline the run left. A pass that takes nothing in either
  sweep ends the reduction.
- **Budget and replay.** Every run tried is one candidate. Each run taken is
  one `acceptedAt` entry, `kind: 'boundary-run'`, `count` ≥ 2,
  `sourceVertices` in outline order; `stopAfterAccepted` counts operations and
  its termination and promise are §7's.
- **Bounded work on the boundary path.** From the order above: a pass tries,
  for each of its *h* surviving, unprotected source-hull vertices, at most
  `min(maxVertices, W − 3) − 1` runs, where *W* is the outline's vertex count
  at that start (one per length from that down to 2) — so at most
  *h* · (`maxVertices` − 1) run candidates per pass, before its single
  removals. A pass that continues has taken at least one operation, each of
  which removes at least one source vertex, so there are at most one more
  passes than removable vertices; and every candidate, run or single, counts
  against `budget.maxCandidates`, which bounds the whole call. The absolute
  runtimes and candidates measured on the recorded inputs are the table
  below.
- **Opt-out.** A call without the field tries no run, and its mesh and report
  are 2.24.0's byte for byte with `acceptedAt`'s entries read as their `step`
  (measured below).

**A cost change that moves no byte: the deviation floor.** §8 *What holds the
boundary* found 847 of demo/bottomwear's 1,101 candidates to be boundary
removals the deviation row refuses, each paid in full. `MQ_BOUNDARY_DEVIATION`
is the symmetric Hausdorff distance between the candidate's outline and the
source hull, and its backward half evaluates every source-hull vertex's
distance to that outline exactly, so the row is at least the distance of any
removed source-hull vertex from the candidate's outline (`deviationFloor`,
`src/meshreduce.ts`). A candidate whose floor is over the bound by more than
`FLOOR_MARGIN` (ten units of the `r6` grid) is refused without the
measurement, after every structural check. The refusal's name is never
guessed: when it is read — the termination's last block, or a control's
observer — the candidate is measured in full and named by the rows, in the
same state (a pass that took nothing left the mesh unchanged). Singles and
runs alike; it is not part of the opt-in.

**Measured** [measured, #1279] — the tree at `6dcda87` (v2.24.1) against this
one, the 18 inputs of the stage-D1 record at 2.20.0 (`reduceMeshWith` over the
recorded input, one process per variant, darwin, Apple M4, 1-minute load
3.8–4.7, one run each — the times are one machine's, the candidates are not):

- **Opt-out bytes.** Mesh and report identical with `acceptedAt` read as its
  `step` numbers, **18 of 18**; and identical with the floor and with every
  candidate measured (`measure-every-candidate`), **18 of 18** opted out and
  **18 of 18** with `boundaryRuns: { maxVertices: 8 }`.
- **Replay across runs.** `stopAfterAccepted` at the first operations, the
  first boundary runs and the operation after each, the middle and the last
  equals the budget cut at that operation's `step`, with its termination and the
  run's first *k* entries, **26 of 26** probes over sample/neck, sample/topwear,
  sample/bottomwear, sample/sleeves and demo/bottomwear.

| input | source hull | 2.24.1: kept / candidates / ms | opted out: kept / candidates / ms | `maxVertices: 8`: kept (runs / vertices) / candidates / ms | the same, every candidate measured: ms |
| --- | --- | --- | --- | --- | --- |
| demo/bottomwear | 293 | 282 / 1,101 / 2,417 | 282 / 1,101 / **862** | **223** (27 / 65) / 4,029 / 3,126 | 11,633 |
| demo/neck | 14 | 14 / 103 / 22 | 14 / 103 / 17 | 14 (0) / 299 / 24 | 51 |
| sample/bottomwear | 107 | 101 / 331 / 526 | 101 / 331 / 182 | **95** (3 / 8) / 1,694 / 550 | 3,638 |
| sample/neck | 26 | 26 / 133 / 39 | 26 / 133 / 20 | **21** (2 / 5) / 430 / 41 | 135 |
| sample/sleeves | 198 | 190 / 421 / 1,458 | 190 / 421 / 152 | **166** (12 / 27) / 2,810 / 930 | 12,262 |
| sample/topwear | 66 | 63 / 205 / 218 | 63 / 205 / 59 | **59** (1 / 6) / 1,031 / 183 | 1,204 |

(sample/hair_back is `invalid-input` at admission in every variant.) Kept is
the result's boundary. Against *Measured — bounded alternatives*: the
prototype kept 225 / 95 / 21 / 168 / 59 on the same five that reduce; this
order keeps 223 / 95 / 21 / **166** / 59 — sample/sleeves at its B\* (166),
demo/bottomwear 6 above its B\* (217). Its cost: candidates ×2.9–6.7 against
2.24.1, time ×0.6–1.3 on these inputs (demo/bottomwear 2,417 → 3,126 ms,
sample/sleeves 1,458 → 930; the prototype measured ×6–10), because the floor
decides most run candidates without a measurement — without it the same runs
cost ×2.3–8.4 against 2.24.1 (11,633 ms on demo/bottomwear). The inputs under
50 ms are within the load's noise. On the public fixture the run keeps **100** of 107 against
the singles' 102, the removal-only optimum C1 (`MQ92`).

**Not done here.** A run is removal-only, so P19, the deform remap and the
UV window hold as for any removal; nothing in this landing touches the
triangulation (Q3/Q9) or the order of the single removals (Q11). Whether a run
passes motion is parts's comparison to decide (Q6), on the replay.

## Stage A controls

[proposal] Suite prefix `MQ`, unused in `selftest.ts` today; names follow the
tree's `CODE_SENTENCE` convention, every one with a positive control and every
row of §4 with a planted failure. Fixtures are generated (`fixtures/public.ts`
convention): checkerboard plates, no literal measured numbers. **Every control
listed below exists and passes** since stage C2 (#1230): each name maps to the
code it is printed under and the suite that prints it in the two paragraphs
that follow and in the list, `MQ45` is held by the install smoke rather than
`selftest.ts`, and `MQ26` is the one whose statement is held partly by other
controls (`EH06`, `MB07`), as its entry says.

[implemented, #1224] Built and passing, in the `mesh-quality` suite of
`selftest.ts`: `MQ00` (its geometry half, renamed for what it measures),
`MQ01`–`MQ09`, `MQ16`, `MQ19` (its geometry half: a source that fails its own
coverage bound is reported `fail` and not accepted — the refusal as a
reference is stage C's), `MQ21` (its geometry half: the attachment's and a
region's floor), `MQ23`, `MQ25`, `MQ26` (its call half), `MQ27`, `MQ28` (its mask half — a
duplicate candidate id has no input before stage C), `MQ29`, `MQ30`, `MQ34`
and `MQ44`; and since stage B2, `MQ14`, `MQ17`, `MQ18`, `MQ24`, `MQ32`, `MQ33`,
`MQ40`, `MQ43`, with `MQ23` and `MQ25` extended to `reduceMesh`, plus the two
controls the consumer asked for in its acknowledgement (rig-parts#126,
comment 6042150608) — each composed operation passing with the other idle,
`MQ46` and `MQ47` below. `MQ26` is split: its control holds that no module
under `src/` but the three that define the operations names them, so an
unchanged spec cannot reach them; the bytes themselves are held by `EH06` and
`MB07`, on every run against `tools/emit_hashes.base.json`, and are not
re-checked by a second gate over the same base.

[implemented, #1230] Built and passing, in the `mesh-compare` suite of
`selftest.ts`: `MQ55` (`MQ00`'s motion half — the `MQ` prefix is opened at 00 by
the `mesh-quality` suite and continued here, `TY18`), `MQ10`, `MQ15`, `MQ20`, `MQ22`, `MQ35`,
`MQ36`, `MQ37`, `MQ39`, `MQ41` and `MQ42` — the controls rig-parts#126
(comment 6045645512) asked C1 to carry for UV carrier mapping, schedule
identity and held-out separation, and report states. `MQ26` names the fourth
defining module. Since stage C2, in the same suite, the rest of the
contract's motion controls — under new codes, because their numbers are
`mesh-quality`'s or already printed here and a code names one control
(`TY17`):

| contract | printed as | suite |
| --- | --- | --- |
| `MQ11` | `MQ56_TWO_CANDIDATES_THAT_DROP_THE_SAME_ART_AGREE_AND_BOTH_FAIL_COVERAGE` | `mesh-compare` |
| `MQ12` | `MQ57_A_SINGLE_BONE_RIGID_MOTION_NEEDS_NO_INTERIOR_VERTEX_TO_MEASURE_ZERO` | `mesh-compare` |
| `MQ13` | `MQ58_A_MULTI_BONE_BEND_WITHOUT_INTERIOR_VERTICES_FAILS_LOCAL_DEFORMATION_AT_THE_BEND_FRAME` | `mesh-compare` |
| `MQ19`, motion half | `MQ59_A_REFERENCE_THAT_FAILS_ITS_OWN_COVERAGE_IS_REFUSED_AS_A_REFERENCE` | `mesh-compare` |
| `MQ21`, motion half | `MQ60_A_DOMAIN_UNDER_ITS_SAMPLE_FLOOR_IS_NOT_MEASURABLE_WITH_ITS_COUNT_AND_HULL_SAMPLES_DO_NOT_RAISE_IT` | `mesh-compare` |
| `MQ28`, motion half | `MQ61_A_DUPLICATE_CANDIDATE_ID_IS_REFUSED_NAMING_BOTH` | `mesh-compare` |
| `MQ31` | `MQ62_LOCAL_DEFORMATION_STATES_ITS_SAMPLE_DOMAIN_AND_COUNT_AND_A_SAMPLE_REMOVED_LOWERS_THE_COUNT` | `mesh-compare` |
| `MQ38` | `MQ63_CONTROL_CANDIDATES_DIFFERING_ONLY_IN_ALLOWLISTED_INPUTS_ARE_COMPARED_AND_A_PERMITTED_FOLD_IS_LISTED_NOT_ZEROED` | `mesh-compare` |
| `MQ45` | `SMOKE_MESHCOMPARE_COMPARES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE`, a step of every case | the install smoke (`bun run smoke`) |

Beyond the contract's list, #1236 added
`MQ64_A_COMPARISON_OVER_A_CONTOUR_GENERATED_BUILD_IS_ACCEPTED_AND_THE_SIGN_FLIPPED_ON_READ_FAILS_ORIENTATION_NAMING_THE_TRIANGLE`
(`mesh-compare`) — *Stage C2*, the closed paragraph.

[measured, #1266] §7's public reproducer, in the same suite and under the
next free codes:
`MQ79_A_REDUCTION_HOLDING_EVERY_STATIC_BOUND_FAILS_MOTION_ON_A_WEIGHT_RAMP_AND_A_LESS_REDUCED_CANDIDATE_OF_THE_SAME_SOURCE_PASSES`
and
`MQ80_RIGID_NO_REDUCTION_BUDGET_AND_A_BOUND_NO_PREFIX_MEETS_ARE_FOUR_DISTINCT_OUTCOMES_AND_THE_LAST_IS_THE_ORDERS_NOT_THE_MESHS`
(`mesh-compare`). They hold today's behaviour on that fixture — the gap and its
feasible controls — and implement nothing of §7's proposal.

[implemented, #1268] §7's mechanism 2, in the `mesh-quality` suite, under the
next free codes:
`MQ81_CONTROL_STOP_AFTER_ACCEPTED_K_RETURNS_THE_MESH_OF_THE_KTH_ACCEPTED_STEP_ON_THE_REPRODUCERS_STRICT_RUN`,
`MQ82_CONTROL_A_REPLAY_TERMINATES_REPLAYED_TO_ACCEPTED_STEP_ZERO_TAKES_NO_STEP_AND_A_STOP_BEYOND_THE_RUN_KEEPS_ITS_OWN_TERMINATION_NAMING_IT`,
`MQ83_A_REPLAY_PLANTED_TO_STOP_ONE_ACCEPTED_STEP_EARLY_OR_LATE_IS_CAUGHT_NAMING_THE_STEP`
(the plant is `ReplayPlant`, passed through `reduceMeshWith`; `reduceMesh`
plants none) and
`MQ84_A_STOP_AFTER_ACCEPTED_THAT_IS_NOT_A_WHOLE_NUMBER_0_OR_MORE_IS_REFUSED_NAMING_THE_FIELD`.

[measured, #1271] §8's public reproducer, in the `mesh-compare` suite, under
the next free codes — one fact each, every one read beside a run or a plant
that makes its predicate fire (named in its line):
`MQ85_THE_STRICT_REDUCTION_OF_A_TRACED_BOUNDARY_REMOVES_EVERY_INTERIOR_VERTEX_AND_AT_MOST_A_TENTH_OF_THE_BOUNDARY`
(plant: the run at deviation bound 2),
`MQ86_THE_STRICT_REDUCTION_OF_A_TRACED_BOUNDARY_STOPS_ON_MQ_BOUNDARY_DEVIATION`
(plant: the bound out of reach, which stops on `MQ_OVERSHOOT`),
`MQ87_THE_STRICT_REDUCTION_OF_A_TRACED_BOUNDARY_HOLDS_EVERY_STATIC_BOUND_AND_FAILS_MOTION`
(its predicate's passing side is read by `MQ89`),
`MQ88_A_REPLAY_BISECTED_ON_GRID_FRAMES_PASSES_ON_ITS_HELD_OUT_IRR_FRAMES_AND_THE_NEXT_STEP_FAILS`
(the step after the chosen one),
`MQ89_A_HAND_BUILT_MESH_OVER_THE_SAME_BOUNDARY_WITH_FEWER_VERTICES_THAN_THE_REPLAY_PASSES_EVERY_STATIC_ROW_AND_MOTION`
(plants: the source as the mesh with "fewer" vertices; one hull vertex pushed
the bound plus a pixel out, failing `MQ_BOUNDARY_DEVIATION`) and
`MQ90_WITH_THE_DEVIATION_BOUND_AT_TWICE_THE_SOURCE_TOLERANCE_THE_BOUNDARY_REDUCES_AND_EVERY_ART_ROW_STILL_PASSES`
(plant: the strict run). They hold today's behaviour on that fixture and
implement nothing of §8; `MQ79` and `MQ80` are unchanged.

[implemented, #1279] §8's Stage B first landing, on the same fixture in the
`mesh-compare` suite, under the next free codes — each read beside a plant
that must make it fire (`ReductionPlant`, passed through `reduceMeshWith`;
`reduceMesh` plants none):
`MQ91_CONTROL_ACCEPTED_AT_IS_ONE_ENTRY_PER_ACCEPTED_OPERATION_AND_STOP_AFTER_ACCEPTED_REPLAYS_TO_IT_ACROSS_A_BOUNDARY_RUN`
(plant: a run recorded as one removal per vertex),
`MQ92_ON_THE_TRACED_BOUNDARY_A_BOUNDARY_RUN_TAKES_THE_RESULT_PAST_WHAT_SINGLE_REMOVALS_REACH_WITH_EVERY_STATIC_ROW_HELD`
(plants: the singles-only run; runs taken without their rows),
`MQ93_A_CALL_WITHOUT_BOUNDARY_RUNS_TRIES_NONE_AND_WRITES_ONE_SINGLE_VERTEX_ENTRY_PER_STEP`
(plant: runs tried without the opt-in — the bytes against 2.24.0 are measured
out of suite, §8, because the tree keeps no older copy to compare with),
`MQ94_A_BOUNDARY_RUN_THAT_WOULD_BREACH_THE_DEVIATION_BOUND_IS_REFUSED_NAMING_THE_ROW`
(plant: runs taken without their rows),
`MQ95_A_BOUNDARY_RUNS_THAT_IS_NOT_A_MAX_VERTICES_OF_2_OR_MORE_IS_REFUSED_NAMING_THE_FIELD`
and
`MQ96_CONTROL_THE_DEVIATION_FLOOR_REFUSES_WITHOUT_MEASURING_AND_CHANGES_NO_BYTE_OF_ANY_RESULT`
(plant: the floor read half a pixel short of the bound). `MQ81`–`MQ84` read
`acceptedAt`'s entries by their `step`, and `MQ67` counts a removal the floor
decides beside the measurements, which it would otherwise read as a step
measured without the rasters.

[implemented, #1280] §8's allocation rows, in the `mesh-quality` suite, from
`MQ120` (clear of codes another change was opening from `MQ91` in
`mesh-compare` at the time):
`MQ120_THE_ALLOCATION_ROWS_SEPARATE_SECTION_8S_FIXTURES_AT_THE_FIGURES_IT_PRINTS_AND_EVERY_ROW_IS_UNDECLARED`,
`MQ121_GRADE_MIN_ANGLE_P10_AND_DEFORM_LOAD_EQUAL_THE_SUITES_OWN_DERIVATION_ON_EVERY_FIXTURE`,
`MQ122_CONTRAST_AND_LOAD_ARE_NOT_MEASURABLE_WITHOUT_A_DECLARED_AMPLITUDE_OR_WEIGHTS_OR_FOR_AN_UNDECLARED_PAIR_NAMING_THE_FIELD`,
`MQ123_NO_ALLOCATION_ROW_IS_REQUIRED_SO_NONE_BLOCKS_A_STEP_PASSES_OR_MOVES_A_VERDICT`,
`MQ124_EVERY_REPORT_WITHOUT_ITS_FIVE_ALLOCATION_ROWS_IS_THE_REPORT_WITHOUT_THEM_BYTE_FOR_BYTE`,
`MQ125_AN_OUTLINE_OF_B_STAR_REFERENCE_HULL_VERTICES_HOLDS_COVERAGE_UNDERCUT_AND_DEVIATION_AND_THE_SEARCH_STAYS_UNDER_ITS_BOUND`,
`MQ126_THE_ALLOCATION_ROWS_AND_THE_AMPLITUDE_ECHO_ARE_BYTE_IDENTICAL_FOR_ONE_INPUT_IN_ANY_KEY_ORDER`
and
`MQ127_A_MOTION_AMPLITUDE_THAT_IS_NOT_A_MOTION_AMPLITUDE_IS_REFUSED_NAMING_THE_FIELD`
— each plant named in §8's paragraph on them. `MQ00` reads the allocation
rows aside: on its unweighted mesh with no amplitude, two of them are
`not-measurable` by design, and `MQ122` holds those states.

Every other name in the list is printed under its own code, by the suite the
paragraphs above name.

- `MQ00_CONTROL_A_MESH_COMPARED_WITH_ITSELF_MEASURES_ZERO_ON_EVERY_ROW_AND_EVERY_FRAME` —
  its geometry half is `MQ00` (`MQ00_CONTROL_A_MESH_MEASURED_AGAINST_ITS_OWN_HULL_DEVIATES_ZERO_AND_ITS_RASTER_ROWS_ARE_THE_LEGACY_FIT`,
  `mesh-quality`) and its motion half is `MQ55`
  (`MQ55_CONTROL_A_MESH_COMPARED_WITH_ITSELF_MEASURES_ZERO_ON_EVERY_ROW_AND_EVERY_FRAME`, `mesh-compare`)
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
- `MQ11_TWO_CANDIDATES_THAT_DROP_THE_SAME_ART_AGREE_AND_BOTH_FAIL_COVERAGE` — printed as `MQ56` (`mesh-compare`)
- `MQ12_A_SINGLE_BONE_RIGID_MOTION_NEEDS_NO_INTERIOR_VERTEX_TO_MEASURE_ZERO` — printed as `MQ57` (`mesh-compare`)
- `MQ13_A_MULTI_BONE_BEND_WITHOUT_INTERIOR_VERTICES_FAILS_LOCAL_DEFORMATION_AT_THE_BEND_FRAME` — printed as `MQ58` (`mesh-compare`)
- `MQ14_A_LOCALISED_REGION_REFINES_INSIDE_AND_INSERTS_NO_VERTEX_OUTSIDE_ITS_REGION_AND_BAND` (P16)
- `MQ15_A_VERDICT_THAT_DIFFERS_BETWEEN_PHASES_SAYS_SO_NAMING_BOTH_FRAME_IDS` (P7)
- `MQ16_A_VALUE_WITHIN_ONE_VALUE_INCREMENT_OF_ITS_BOUND_IS_FLAGGED_AND_ITS_VERDICT_UNCHANGED` (correction 2)
- `MQ17_A_REMOVAL_REMAPS_A_VERTICES_RUN_A_REORDER_ONLY_CHANGE_REMAPS_TOO_AND_AN_INSERTION_UNDER_ONE_IS_REFUSED_BY_NAME` (P18)
- `MQ18_A_WEIGHT_JUMP_EDGE_SURVIVES_VERTEX_REMOVAL_AND_RETRIANGULATION` (correction 3)
- `MQ19_A_REFERENCE_THAT_FAILS_ITS_OWN_COVERAGE_IS_REFUSED_AS_A_REFERENCE` — geometry half `MQ19` (`mesh-quality`), motion half printed as `MQ59` (`mesh-compare`)
- `MQ20_SKELETONS_THAT_DIFFER_IN_ONE_BONE_FIELD_ARE_REFUSED_NAMING_IT` (now one case of `COMPARE_INPUTS_DIFFER`, correction 5)
- `MQ21_A_DOMAIN_UNDER_ITS_SAMPLE_FLOOR_IS_NOT_MEASURABLE_WITH_ITS_COUNT_AND_HULL_SAMPLES_DO_NOT_RAISE_IT` (P9) — geometry half `MQ21` (`mesh-quality`), motion half printed as `MQ60` (`mesh-compare`)
- `MQ22_PHYSICS_RESET_IS_THE_SAME_FOR_EVERY_CANDIDATE_AND_A_CHANGED_DT_MOVES_THE_ROWS` (P10)
- `MQ23_EACH_REFUSAL_CODE_IS_REACHED_BY_ONE_INPUT_AND_NAMES_OBJECT_VALUE_AND_REQUIREMENT`
- `MQ24_EACH_TERMINATION_REASON_IS_REACHED_BY_ONE_INPUT`
- `MQ25_TWO_RUNS_ON_ONE_INPUT_WRITE_BYTE_IDENTICAL_REPORTS`
- `MQ26_AN_UNCHANGED_SPEC_EMITS_THE_BYTES_IT_EMITTED_BEFORE` (the emit-hash
  base, read for the reduction's absence) — [implemented, #1224] as
  `MQ26_NO_MODULE_UNDER_SRC_BUT_THE_FOUR_THAT_DEFINE_THE_OPERATIONS_NAMES_THEM_SO_AN_UNCHANGED_SPEC_CANNOT_REACH_THEM`
  (the three of #1224, and `src/meshcompare.ts` since #1230)
  for the reduction's absence, and `EH06` and `MB07` for the bytes

The five corrections, one positive control and one planted failure each:

- Correction 1 (typed fields), positive:
  `MQ27_CONTROL_TWO_ATTACHMENTS_WITH_THEIR_OWN_MASKS_THRESHOLDS_AND_SAMPLE_FLOORS_ARE_EACH_MEASURED_AND_ECHOED_FIELD_FOR_FIELD`
- Correction 1, planted:
  `MQ28_ONE_MASK_GIVEN_FOR_TWO_ATTACHMENTS_OF_DIFFERENT_SIZE_OR_A_DUPLICATE_CANDIDATE_ID_IS_REFUSED_NAMING_BOTH`
  — mask half `MQ28` (`mesh-quality`), duplicate-id half printed as `MQ61` (`mesh-compare`)
- Correction 2 (raster unit), positive:
  `MQ29_CONTROL_PX_FRACTION_AND_COUNT_ROWS_STATE_THEIR_SPATIAL_QUANTUM_AND_THEIR_OWN_VALUE_INCREMENT_AND_A_VALUE_AT_ITS_BOUND_PASSES_AT_BOUND`
- Correction 2, planted:
  `MQ30_A_COVERAGE_WITHIN_ONE_SPATIAL_QUANTUM_BUT_BEYOND_ONE_SAMPLE_INCREMENT_OF_ITS_BOUND_IS_NOT_FLAGGED`
- Correction 2, sampled rows:
  `MQ31_LOCAL_DEFORMATION_STATES_ITS_SAMPLE_DOMAIN_AND_COUNT_AND_A_SAMPLE_REMOVED_LOWERS_THE_COUNT`
  — printed as `MQ62` (`mesh-compare`)
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
  — printed as `MQ63` (`mesh-compare`)
- Correction 5, planted:
  `MQ39_A_CHANGED_PHYSICS_SETTING_WITH_IDENTICAL_BONES_IS_REFUSED_NAMING_THE_INPUT_AND_BOTH_VALUES`

The two composed operations of stage B2, each with the other idle
([implemented, #1224]; asked for in rig-parts#126, comment 6042150608):

- Reduction, positive and planted:
  `MQ46_CONTROL_REDUCTION_ALONE_REMOVES_VERTICES_HOLDING_EVERY_BOUND_AND_A_BOUND_THAT_BLOCKS_EVERY_STEP_IS_NAMED`
- Refinement, positive and planted:
  `MQ47_CONTROL_REFINEMENT_ALONE_INSERTS_ONLY_INSIDE_THE_REGION_AND_ITS_BAND_UNTIL_L_OF_R_HOLDS_AND_A_BOUND_UNDER_ONE_TEXEL_IS_REFUSED`

The exemption agreed on rig-parts#126 (comment 6045645512) and built in
[#1229](https://github.com/firejune/rigc/issues/1229), [implemented]:

- `MQ48_THE_COARSE_QUAD_THAT_2_19_0_STOPPED_ON_CONVERGES_AND_IS_ACCEPTED`
- `MQ49_AN_EDGE_TOUCHING_THE_BAND_OUTER_BOUNDARY_AT_ONE_POINT_FROM_OUTSIDE_IS_EXEMPT_IN_THE_MEASUREMENT_AND_LEFT_ALONE_BY_THE_REFINEMENT`
- `MQ50_AN_EDGE_ALONG_THE_BAND_OUTER_BOUNDARY_IS_HELD_AND_AN_EXEMPTION_WIDENED_TO_ANY_BOUNDARY_CONTACT_IS_CAUGHT` (the plant)
- `MQ51_AN_EDGE_CROSSING_A_BAND_OR_A_REGION_WITH_BOTH_ENDPOINTS_OUTSIDE_IS_HELD_AND_AN_END_ON_THE_OUTER_BOUNDARY_EXEMPTS_NO_CROSSING`
- `MQ52_OVERLAPPING_BANDS_ARE_READ_INDEPENDENTLY_AN_EDGE_EXEMPT_FROM_ONE_REGION_IS_STILL_HELD_BY_THE_OTHER`
- `MQ53_WITH_TRANSITION_ZERO_A_BOUNDARY_CONTACT_IS_HELD_AND_AN_INFEASIBLE_REFINEMENT_IS_NAMED_NOT_LOOPED`
- `MQ54_A_REFINEMENT_LIMITED_BY_ITS_BUDGET_OR_A_MINIMUM_ANGLE_IS_NOT_ACCEPTED_AND_NAMES_WHICH`

The decisions that change behaviour rather than an interface:

- `MQ40_A_CANDIDATE_THAT_PASSES_AT_THRESHOLD_NINE_AND_FAILS_AT_ONE_IS_NOT_ACCEPTED` (Thresholds, P4)
- `MQ41_A_NONZERO_WARMUP_IS_REFUSED_BY_NAME_AND_NOT_RUN_AS_ZERO` (P10)
- `MQ42_A_SELECTION_FRAME_IS_NEVER_HELD_OUT_AND_AN_EMPTY_HELD_OUT_SET_MAKES_NO_HELD_OUT_CLAIM` (P11)
- `MQ43_MIN_WEIGHT_ZERO_KEEPS_EVERY_POSITIVE_SHARE_ON_THE_GRID_AND_PROTECTED_INFLUENCES_OVER_THE_CAP_ARE_REFUSED` (P19)
- `MQ44_A_REFUSED_TRACE_LEAVES_TRACE_DEVIATION_NOT_MEASURABLE_AND_THE_SOURCE_ACCEPTED_ON_ITS_REQUIRED_ROWS` (P13)
- `MQ45_THE_MOTION_ENTRY_IMPORTS_AND_COMPARES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE` (P1, P2; held by the install smoke rather than `selftest.ts`) — [implemented, #1230] as `SMOKE_MESHCOMPARE_COMPARES_FROM_AN_INSTALL_WITH_NO_SPINE_CORE`, `MESHCOMPARE_PROBE_SOURCE` in `scripts/install_smoke.ts`

## Termination reasons

[implemented, #1224] Every `reduce` report carries exactly one (`MQ24`). The
type is declared in `src/meshquality.ts`; a `measure` report carries one only
when it could not read the mesh — `unsupported-topology` with
`REDUCE_SOURCE_NOT_ONE_LOOP` — and `null` otherwise. `candidatesTried` counts
every step `reduceMesh` tried: each refinement insertion and each removal
attempted, which is also what `budget.maxCandidates` bounds:

```ts
export type Termination =
  | { reason: 'no-further-valid-reduction'; candidatesTried: number; blockingConstraint: string; stopAfterAccepted?: StopNotReached }
  | { reason: 'budget-exhausted'; candidatesTried: number; budget: number; result: 'best-meeting-every-bound' | 'none-met-the-targets'; stopAfterAccepted?: StopNotReached }
  | { reason: 'replayed-to-accepted-step'; acceptedSteps: number; candidatesTried: number }
  | { reason: 'invalid-input'; code: string; detail: string }
  | { reason: 'unsupported-topology'; code: string; detail: string };
```

[implemented, #1268] `replayed-to-accepted-step` and the optional
`stopAfterAccepted: { requested, acceptedSteps }` on the run's own two
reasons exist only when the input sets `stopAfterAccepted` (§7, *Mechanism 2
— implemented*).

- **no-further-valid-reduction** — every candidate step from the result
  violates a declared constraint; the report names the constraint that blocked
  the last step. It is a local stop, **not** a minimum: the report never says
  "minimal".
- **budget-exhausted** — `maxCandidates` reached. [agreed, rig-parts#126,
  P6 and correction 3] With `best-meeting-every-bound`, the result is the best
  candidate found that meets **every** required bound — it may be accepted,
  and nothing implies more reduction was impossible or that it is optimal.
  With `none-met-the-targets`, **no mesh is returned and nothing is accepted**;
  the report keeps `sourceCounts` and carries no `geometry`.
- **replayed-to-accepted-step** — the input's `stopAfterAccepted` was
  reached; the mesh is the one the call without it held after that many
  accepted operations (one per `acceptedAt` entry, a boundary run counting
  one — #1279), byte for byte. It says nothing about the steps the run would
  have taken next.
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

[agreed, rig-parts#126] None of the following is a prerequisite for the
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
  posing entry parts is promised, `rig-c/render`, needs spine-core; the
  core poser that does not has no entry. §0 records the agreed new entry (P1),
  [implemented, #1230] as `rig-c/meshcompare`.
