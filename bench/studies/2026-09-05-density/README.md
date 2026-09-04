# The turn a depth map supports, against the density it is meshed at

- date: 2026-09-05
- issue: [#381](https://github.com/firejune/rigc/issues/381) stage 2 — *"the contour generator at density, with A39 and the DEFORM report holding at that scale (their cost is per triangle; measure it)"*
- subject: the `grid` and `contour` generators ([`src/mesh.ts`](../../../src/mesh.ts)), the depth model ([`src/depth.ts`](../../../src/depth.ts)), `A39_DEFORM_KEEPS_TRIANGLE_WINDING` and the survey it shares with the DEFORM report ([`src/deformmeasure.ts`](../../../src/deformmeasure.ts))
- corpus: **none** — the harness generates its own part, its own depth sheets and its own specs
- harness: [`tools/densprobe.ts`](tools/densprobe.ts)
- evidence: [`evidence/`](evidence) — [`controls.txt`](evidence/controls.txt) has the command line and the constants; every figure below is one of the three tables printed beside it

## The question, and the answer it did not have

#381 stage 1 measured a cliff on `gallery/portrait`: refining the head grid
**lowers** the angle it can turn through — 5 columns fold at 31.38°, 9 at
20.95°, the continuous limit 17.65° — and read it as the cylinder model's error
showing up sooner. Stage 1's conclusion was therefore that *"each vertex needs
its own depth, not a radius shared by a column"*, and [#383](https://github.com/firejune/rigc/issues/383)
built that: a depth map, sampled per vertex, consumed by the same closed form.

So the question stage 2 actually has to answer is not only *what does density
cost* but **did per-vertex depth buy the angle back**.

⭐ **It did not, and the reason is not the model.** The fold angle is set by the
**steepest gradient the mesh samples in its depth map**, and refining a mesh
finds steeper gradients on a map that has them. A dome is *vertical at its rim*,
so its fold angle falls without limit as the lattice refines — to zero, not to
17.65°. A map whose slope is **bounded** turns the same angle at every density.

That is a rule about the input, not about rigc, and it is the useful half.

## 1. Cost holds. Nothing broke, and nothing is superlinear

[`evidence/cost.txt`](evidence/cost.txt), all rungs green — no failure at any
density, on a 12° turn every rung admits.

| rung | vertices | triangles | compile ms | validate ms | survey ms | skeleton bytes |
| --- | --- | --- | --- | --- | --- | --- |
| `grid-17` | 289 | 512 | 11.85 | 0.94 | 0.85 | 113,278 |
| `grid-65` | 4,225 | 8,192 | 19.58 | 5.01 | 3.57 | 1,795,180 |
| `grid-129` | 16,641 | 32,768 | 28.98 | 15.28 | 9.72 | 7,304,782 |
| `grid-181` | 32,761 | 64,800 | 52.31 | 28.51 | 18.28 | 14,714,490 |

Per triangle at the top rung: compile **0.81 µs**, validate **0.44 µs**, the
deform survey **0.28 µs**. Against `grid-65`, 8× smaller: 2.39 / 0.61 / 0.44 µs.
⇒ **linear in triangles, with the constant falling at scale.** A39 and the
DEFORM report cost what stage 2 assumed they cost, and the gate is not the thing
that stops you meshing a part densely.

⚠️ The timings are single readings, and the table says so itself: `contour-8`,
at **sixteen** vertices, compiles in 178.85 ms — 3.4× the 32,761-vertex lattice
— because it is the first compile the process runs. Read the slope across the
eight lattice rungs, never a rung's absolute millisecond, and nothing under a
factor of two. The byte counts and the fold ladder have no such caveat: both
reproduce exactly across runs.

## 2. The wall is the file, at 449 bytes a vertex

**One part. One deform key. 14.7 MB.**

Bytes per vertex *rise* with density — 371 at `grid-5`, 449 at `grid-181` —
because every one of them costs a `1, boneIndex, bindX, bindY, 1` run, a uv
pair, its share of the triangle list and its two offsets in the key, and the
coordinates get longer as they get finer.

**And a second key costs 1.77 MB** — [`evidence/keycost.txt`](evidence/keycost.txt),
at `grid-181`:

| deform keys | skeleton bytes | added by the last key |
| --- | --- | --- |
| 1 | 14,714,490 | — |
| 2 | 16,483,534 | 1,769,044 |
| 4 | 20,010,598 | 1,763,532 |
| 8 | 27,056,120 | 1,761,381 |

⚠️ **That figure is measured because estimating it was wrong.** Multiplying 449
bytes a vertex by a key count gives ~100 MB for eight keys; the emitter says
**27 MB**, because most of the 449 is the setup mesh's five-number weighted run,
its uv pair and its share of the triangle list, and a key carries only two
offsets. The per-vertex figure is a per-*part* cost paid once. `keyLadder` in the
harness exists so this cannot be re-derived by arithmetic again.

⇒ [#380](https://github.com/firejune/rigc/issues/380)'s premise, measured on
this repository's own emitter rather than argued: a dense turn stated as a
closed form is one line, and the same turn baked is **14.7 MB for the part plus
1.77 MB for every key of every animation that touches it**. The eight keys
`gallery/portrait` spends on one part come to 27 MB, before a second part.

## 3. `contour` cannot be a dense mesh, for two measured reasons

[`evidence/depth.txt`](evidence/depth.txt).

| rung | vertices | span of `zScale` sampled | smallest triangle | median triangle |
| --- | --- | --- | --- | --- |
| `contour-1` | 68 | 1.8 % | 3.00 px² | 437.97 px² |
| `contour-0.5` | 668 | 2.1 % | 0.118 px² | 66.00 px² |
| `contour-0.25` | 868 | 2.1 % | 0.500 px² | 53.50 px² |
| `grid-181` | 32,761 | 100.0 % | 2.469 px² | 2.469 px² |

- **It saturates.** 0.25 px of tolerance buys 868 vertices where 0.5 px bought
  668: the outline is only so many pixels long, and "thousands of vertices per
  part" is not something an outline tracer can be asked for.
- **It reads 2 % of the depth map.** Every vertex is on the rim, and the rim is
  where a dome is nearly flat in z. The interior — all of it — is one ear-clipped
  fan with no vertex in it, so the map that was the whole point goes unsampled.
  The lattice reads **100 %** of the range at every rung.
- **Its triangles are slivers.** The lattice's smallest triangle *is* its median.
  `contour-0.5`'s smallest is **560× below** its own median, and a triangle of
  0.118 px² reverses under a displacement of a fraction of a pixel.

⇒ Stage 2 as written asked for the contour generator at density. The measured
answer is that the generator for a turn is [`grid`](../../../src/mesh.ts)
([#386](https://github.com/firejune/rigc/issues/386)), and `contour` stays what
its own header says it is: geometry cut to a silhouette, not a deformation mesh.

## 4. The fold angle belongs to the depth map, not to the mesh

[`evidence/fold.txt`](evidence/fold.txt). Three sheets over one part: `dome`
(vertical at the rim), `cosine` (a raised cosine, slope bounded by `Zπ/2R`
everywhere), `flat` (one level — the control).

| rung | vertices | dome: last admitted | dome: predicted | cosine: last | cosine: predicted | flat: last |
| --- | --- | --- | --- | --- | --- | --- |
| `grid-5` | 25 | 62° | 59.0° | 73° | 64.8° | 90° |
| `grid-17` | 289 | 41° | 39.8° | 65° | 64.8° | 90° |
| `grid-33` | 1,089 | 31° | 30.5° | 64° | 64.8° | 90° |
| `grid-65` | 4,225 | 23° | 22.6° | 64° | 64.8° | 90° |
| `grid-129` | 16,641 | 17° | 16.4° | 64° | 64.8° | 90° |
| `grid-181` | 32,761 | 14° | 14.0° | 63° | 64.8° | 90° |

Three readings, and the third is the one that matters.

**The dome falls, and a closed form says exactly how far.** Two neighbouring
vertices swap when `tan t ≥ Δu/Δz`. Across the outermost pair of an even lattice
over a dome, `Δu = h = W/(side−1)` and `Δz = Z√(2h/R)`, so

    tan t = √h · √(R/2) / Z

which is **√h** — it goes to zero as the lattice refines, and it tracks the
measured ladder to **≤ 1.2°** across a 1,300× range of vertex counts. Per-vertex
depth did not lift the cliff and could not have: the cliff is the map's own
vertical rim, and a finer mesh simply stands closer to it.

**The flat control turns 90° at every rung.** So the fold is the depth, not the
triangulation and not the emitter — for the lattice. (For `contour` the same
control says the opposite, which is finding 3's sliver: `contour-0.5` folds at
**3°** even on the gentle cosine sheet, and at 90° on the flat one.)

⭐ **The bounded map converges.** `cosine` holds **63–64°** from 289 vertices to
32,761 — a 113× refinement moving the answer by one degree — against a predicted
64.8° that has no `side` in it at all. **A depth map with a bounded slope has a
density-independent fold angle.**

## What this changes

- **The authoring rule, now stated in [`docs/FACE.md`](../../../docs/FACE.md)
  §2.2 — *The angle belongs to the map, not to the mesh***: the angle a part can turn through is a property of its **depth map's
  steepest slope**, `tan t_max = 1 / max|dz/du|`, and not of how finely it is
  meshed. A map that reaches its floor with a vertical edge — a dome, a
  hemisphere, anything traced straight off a rendered normal — will fold at any
  angle you like if you mesh it finely enough. Flattening the map where the part
  turns away is the fix, and it is a change to the *input*, which is where rigc
  is not allowed to guess.
- **`contour` is not the generator for a turn**, and stage 2's own wording is
  superseded by its measurement. `grid` reads the whole map; `contour` reads 2 %
  of it through triangles three orders of magnitude apart in area.
- **#381 stage 3 keeps its place in the queue and gains a number.** The gate is
  linear and holds; the artifact is 449 bytes a vertex. Nothing here is an
  argument for starting #380 early — the standing sequencing ruling is
  unchanged — but when it does start, this is the figure it is measured against.

## What this does not say

- **Nothing about whether a dense turn LOOKS right.** Every figure here is a
  refusal count, a byte count or a clock. The judge of the result is a person
  through `vote`, per the usage-phase rule, and no frame was rendered.
- **Nothing about real art.** The part is a generated checkerboard ellipse and
  all three depth sheets are analytic. A measured depth map has noise, and noise
  is a gradient — whether a real map's fold angle is set by its *shape* or by its
  *sampling noise* is the next question and this study did not ask it.
- **Nothing about more than one part.** One slot, one attachment, one key.
