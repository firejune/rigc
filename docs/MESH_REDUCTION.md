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
It is the contract both repositories agree on *before* any of stages B–D is
written. **Stage B1 ([#1224](https://github.com/firejune/rigc/issues/1224))
implements the geometry measurement** — `measureMeshQuality` and the
`mesh-quality-report/1` document, in `src/meshquality.ts`, re-exported through
`spine-rigc/mesh` — and **stage B2 implements the reduction**: `reduceMesh`,
in `src/meshreduce.ts`, re-exported through the same entry. Every clause the
tree now does is marked **[implemented, #1224]** and says what the tree does,
cited by path and symbol; *The reduction as implemented* gathers the choices B2
had to make. **Stage C1 ([#1230](https://github.com/firejune/rigc/issues/1230))
implements the motion comparison** — `compareMeshesInMotion`, in
`src/meshcompare.ts`, writing the `motion` section of the same document, and
**stage C2** gives it its named entry, `spine-rigc/meshcompare`, held from an
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
| Import surface for parts | `spine-rigc/mesh` holds 11 values and `AlphaMask` (RELEASING.md *The import surface*; `OBSERVED_SYMBOLS`, `scripts/install_smoke.ts`); `spine-rigc/render` needs spine-core installed beside it | `spine-rigc/mesh` (geometry) and `spine-rigc/meshcompare` (motion), §0 — [implemented, #1224] the geometry half: five values held by the smoke's `AGREED_IN_1224` row; [implemented, #1230] the motion half: `compareMeshesInMotion` and `uvCarriers` held by its `AGREED_IN_1230` row, and the comparison called from an install with no spine-core (`MESHCOMPARE_PROBE_SOURCE`, `scripts/install_smoke.ts`) |

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

- [implemented, #1224] Every new operation is an **explicit call**. No
  `generator` default changes, no existing generator gains an implicit
  reduction, and `compile` never remeasures or rewrites authored geometry on its
  own. The emit-hash gates are the proof that an unchanged spec emits unchanged
  bytes, and `EH06` and `MB07` hold the gallery's builds to that base on every
  run; `MQ26` holds that no module under `src/` but `src/mesh.ts`,
  `src/meshquality.ts`, `src/meshreduce.ts` and — since stage C1 —
  `src/meshcompare.ts` names any of the three operations, so
  nothing a build reaches calls them.
- [agreed, spine-parts#126] **P1 — `spine-rigc/meshcompare` is accepted.**
  Geometry-only operations (`reduceMesh`, `measureMeshQuality`) are exported
  from `spine-rigc/mesh`, which stays geometry-only; the motion comparison
  (`compareMeshesInMotion`) is exported from the new named entry
  `spine-rigc/meshcompare`. **Both** entries are held by an installed-package
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
- [agreed, spine-parts#126] **P2 — the core poser is sufficient for the
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
- [implemented, #1224] **Units.** Every caller distance is in the drawing's
  pixels; a measurement carries a point to the mask's grid as `px × pageScale`
  and reports a raster distance back as `texels / pageScale`, with the grid it
  was taken on in the row (`RasterSensitivity.grid`). A pixel a row names is a
  cell of the mask's grid. A fraction is a fraction; an angle is degrees.
  [implemented, #1224] A reduction converts no distance of its own: every bound
  a step is held to is read by `measureMeshQuality`, which carries a point to
  the mask's grid as above, so the reduction and the measurement cannot
  disagree about a unit.
- [agreed, spine-parts#126] **P5 — presets are parts's.** A preset is
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
  does not (`sourceBounds`, a non-null `targets.artFit` and
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
  `MQ_DEGENERATE`; nothing in `targets` is read for admission (`MQ32`).
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
re-evaluated, and the linked meshes. It is absent on a `measure` and whenever no
mesh is returned.

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
- [implemented, #1224] Rows are ordered by section, then attachment in
  skeleton order, then code, then region; candidates in the order the caller
  listed them; the document is two-space JSON with a final newline and
  byte-identical for one input, as `build-report/1` is. As implemented: codes
  compare as strings, the attachment's own row (region null) before a
  region's, and where two fills are both exposed (P12) the gated 8-connected
  row before the labelled 4-connected one; every object is rebuilt in the key
  order its type states, so the bytes do not depend on the order an input was
  built in (`MQ25`).

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
- [agreed, spine-parts#126] **P9 — `minArtSamples` is an explicit positive
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
- [agreed, spine-parts#126] **P10 — no warm-up in v1.** Physics resets and
  steps from time 0, consistently for every candidate, with core-gate and
  render semantics as the baseline. `mode` and `dt` are required whenever any
  physics constraint is active. `warmupSteps: 0` is supported; any other value
  is refused by name (`COMPARE_WARMUP_UNSUPPORTED`) until warm-up is
  implemented and controlled — never silently treated as zero.
  [implemented, #1230] `warmupSteps` other than 0 is refused before any
  document is read (`MQ41`); `mode: 'none'` on a reference that declares a
  physics constraint is `COMPARE_INPUT_MISSING`.
- [agreed, spine-parts#126] **P11 — parts supplies the schedule and the
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
- [agreed, spine-parts#126] **P8 — the reference is the unreduced,
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

- [agreed, spine-parts#126; implemented, #1224] **P12 — the new measurements use the tracer's
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
- [agreed, spine-parts#126] **P14 — grid metadata plus that correctly typed
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
  [corrected, spine-parts#126 / #1229] That consequence held only because the
  piece from the band to the far vertex stayed held however it was split. With
  the exemption below, a split where the edge leaves the band leaves that
  piece touching the band at one point, so it is no longer held, and the
  stated source is refinable inside the band; the stop now covers only what
  stays infeasible (*Changed since v2.19.0*).
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
- [agreed, spine-parts#126] **Which edges a region holds — the exemption.**
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
  vertex, the bones and the cap); they are never removed silently.
  [implemented, #1224] both, in `reduceMesh` on every inserted vertex, in this
  order: protected influences kept first, the strongest others up to
  `maxInfluences` (ties by `boneOrder`), shares under a nonzero `minWeight`
  dropped, shares that are 0 on the 6-decimal grid dropped, the rest closed at
  `1 − others`; the drops are counted in `ReductionChanges.sharesDroppedOnGrid`
  and `sharesPruned` (`MQ43`). A protected share that is 0 on the grid cannot
  be written as a positive binding, and spine-parts#126's acknowledgement
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
in `src/meshreduce.ts`, re-exported through `spine-rigc/mesh`, returns
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
spine-parts#126 comment 6045645512, option 1). Which edges `MQ_MAX_EDGE` and
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
refinement, 37 in 451 ms. Every step is one full `measureMeshQuality` over the
plate, so the cost is the measurement's times the steps; bounding it is stage
D's, and these figures are one machine's reading, not a claim about another.

**Left for later stages.** The motion comparison and every motion row (§3,
stage C); a finer-grid pass, warm-up and traced-boundary gating (*Stage B
scope*); refinement that retriangulates outside the band or flips edges, which
P16's checkable form as agreed does not admit; remapping a linked mesh's own
keys and permuting a weighted keyed vertex's pairs (§6); a bounded-work claim
(stage D).

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
  internal, and exporting it would put it on `spine-rigc/mesh` through that
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
  refused as the `MeshReductionError` `spine-rigc/mesh` exports; the report has
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

## Stage D1 — the installed package over spine-parts's inputs

[measured, #1238] What spine-parts's public inputs show when its automatic
mode runs against the **registry artifacts** `spine-rigc@2.20.0` and `@2.19.0`,
each installed into an empty directory with no spine-core beside it. The
caller is spine-parts at the commit that added the mode (spine-parts PR #131),
unmodified: its `buildRig` with each mesh part of the three public examples
(`demo`, `sample`, `scarf`) switched alone to `auto` under `examplePolicy`
(`fixtures/automesh.ts`, the procedure of `tools/auto_survey.ts`), and its ten
`AUTO_CASES`; every `reduceMesh` call it makes is recorded as made and
replayed one process per call. One darwin machine (Apple M4, 10 cores), Bun
1.4.2, load average 4.3–7.2 throughout — never idle, so no unloaded figure
appears below. Population: 30 parts, of which 18 reach `reduceMesh` (9
example parts, 9 synthetic) and 12 are refused by spine-parts before the call
(`CONTOUR_ONE_ISLAND`). The 18 recorded inputs are byte-identical between the
two versions.

**1. The call shape is on the surface, and 2.20.0 refuses none.** One shape:
all fourteen `MeshReductionInput` fields, no region on any example input,
weights by bone name, `deform` and `linkedMeshes` empty, `preset` null. 18 of
18 calls return at both versions. Every value the automatic mode imports is
held by a row of `OBSERVED_SYMBOLS` (`scripts/install_smoke.ts`) on
`spine-rigc/mesh`; two types it uses, `SourceMesh` and `RefinementRegion`, are
in no row (types are recorded, not held). spine-parts's other imports go
through `./*.ts` courtesy keys rather than the named entries holding the same
symbols. `compareMeshesInMotion` from the install over spine-parts's own demo
builds (`neck` and `bottomwear`, `idle` at 12 fps, 50 frames): the tracked
build against the automatic one is `accepted`; the tracked build against
itself is **not** — `MQ_ORIENTATION` fails on every triangle (210 of 210, 620
of 620), because spine-parts's lattice and contour emitters write clockwise in
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
spine-parts refuses every multi-island source first. Each accepted
`no-further-valid-reduction` was re-checked from outside the call: every
surviving source vertex removed by the rule in *The reduction as implemented*
(its fan, the link polygon tested with `findSelfIntersection` and clipped with
`earClip`) and measured with the installed `measureMeshQuality` — 841 removals
over 13 stops, none valid, 4 not re-checked because the link held an interior
vertex; the named vertex reads back the named row at the named value in 13 of
13. The same re-check finds 6 valid steps on the result of a budget-1 stop,
its positive control.

**4. Cost — two verdicts.** The case spine-parts observed at 81–141 s (PR #131's
evidence table, `demo / bottomwear`) is a 661 × 693 plate (350,983 art pixels
at alpha ≥ 1), a source of 536 vertices and 777 triangles, budget 5000.

- (a) **The candidate count is bounded by the budget.** 1101 of 5000 in every
  run of either version, ending `no-further-valid-reduction`.
- (b) **The wall time is not short.** 87–184 s over seven runs of the same
  input, same 1101 candidates and byte-identical results, at load 4.8–7.2 —
  where the same processes ran spine-parts's whole tracked rig stage for the
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
| spine-parts's contour source as `src/contour.ts` builds it | clockwise |
| the same source as handed to `reduceMesh`, after `spineWinding()` swaps two corners | counter-clockwise |
| the mesh `reduceMesh` returns (8 accepted, 1 refused by admission) | counter-clockwise |
| the compiled skeleton of a real `spine-parts build`, posed by spine-core | counter-clockwise |

Identical at 2.19.0 and 2.20.0 in every row: #1236 moved the `contour` and
`ring` generators, and spine-parts hands rigc authored meshes, so the three
builds' `skeleton.json` are byte-identical across versions. With
`spineWinding()` undone, 18 of 18 recorded inputs are refused at admission
(`REDUCE_SOURCE_FAILS_ITS_ART_BOUNDS`, `MQ_ORIENTATION` on every triangle). The
source's winding is fixed by spine-parts's own tiling check (a triangle wound
against the outline is refused), not by `earClip`, so the recommendation
recorded on spine-parts#126 is to keep the swap unconditionally; a conditional
would add a branch that check makes unreachable.

**What was rejected.** Rebuilding spine-parts's call by hand from
`autoReductionInput` — the example calls carry weights over spine-parts's
internal segments and bone transforms, so the input was recorded as made
instead. Reading phases off the report — wall time is never in it. Quoting one
wall time — the seven readings and their loads are the claim.

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
controls the consumer asked for in its acknowledgement (spine-parts#126,
comment 6042150608) — each composed operation passing with the other idle,
`MQ46` and `MQ47` below. `MQ26` is split: its control holds that no module
under `src/` but the three that define the operations names them, so an
unchanged spec cannot reach them; the bytes themselves are held by `EH06` and
`MB07`, on every run against `tools/emit_hashes.base.json`, and are not
re-checked by a second gate over the same base.

[implemented, #1230] Built and passing, in the `mesh-compare` suite of
`selftest.ts`: `MQ55` (`MQ00`'s motion half — the `MQ` prefix is opened at 00 by
the `mesh-quality` suite and continued here, `TY18`), `MQ10`, `MQ15`, `MQ20`, `MQ22`, `MQ35`,
`MQ36`, `MQ37`, `MQ39`, `MQ41` and `MQ42` — the controls spine-parts#126
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
([implemented, #1224]; asked for in spine-parts#126, comment 6042150608):

- Reduction, positive and planted:
  `MQ46_CONTROL_REDUCTION_ALONE_REMOVES_VERTICES_HOLDING_EVERY_BOUND_AND_A_BOUND_THAT_BLOCKS_EVERY_STEP_IS_NAMED`
- Refinement, positive and planted:
  `MQ47_CONTROL_REFINEMENT_ALONE_INSERTS_ONLY_INSIDE_THE_REGION_AND_ITS_BAND_UNTIL_L_OF_R_HOLDS_AND_A_BOUND_UNDER_ONE_TEXEL_IS_REFUSED`

The exemption agreed on spine-parts#126 (comment 6045645512) and built in
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
  core poser that does not has no entry. §0 records the agreed new entry (P1),
  [implemented, #1230] as `spine-rigc/meshcompare`.
