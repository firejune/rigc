# Noise is also a slope — what a depth map's grain does to the turn ceiling

- date: 2026-09-05
- repository at: `7ebebc974f7429c74872436165a3037b06b2a42d`
- subject: the depth model and the turn ceiling ([`src/depth.ts`](../../../src/depth.ts) — `sampleLevel`, `toneLevel`, `turnCeiling`), the `grid` generator ([`src/mesh.ts`](../../../src/mesh.ts)), and the survey `A39_DEFORM_KEEPS_TRIANGLE_WINDING` refuses from ([`src/deformmeasure.ts`](../../../src/deformmeasure.ts))
- corpus: **none** — the harness generates its own part and every depth sheet in it
- harness: [`tools/noiseprobe.ts`](tools/noiseprobe.ts) — one required argument, the work directory, which is **created and deleted recursively** on every run and is refused by name if it is inside the repository, is the filesystem or home root, or exists and is not a directory ([`evidence/guard.txt`](evidence/guard.txt) is all six refusals firing)
- evidence: [`evidence/`](evidence) — one file per experiment, each carrying the invocation that produced it, each reproducing byte for byte from the committed harness. Every figure below is a cell in one of those tables

## The question the density study left open

[`2026-09-05-density`](../2026-09-05-density/README.md) closed with a hole it
named itself:

> A measured depth map has noise, and noise is a gradient — whether a real map's
> fold angle is set by its *shape* or by its *sampling noise* is the next
> question and this study did not ask it.

It matters because of what that study *established*: the fold angle is
`tan t = 1 / max|dz/du|`, a **maximum over sampled gradients**, with no mesh term
in it. A maximum has no averaging in it anywhere. If a sheet carries
high-frequency structure that is not shape — 8-bit rounding, a resampling
ripple, a monocular model's grain, one stray pixel — then the number `build`
prints, and the author trusts, may be a property of the sampling.

Every sheet the density study measured was analytic. Every sheet a real cut has
is a PNG.

## The answer

**Yes, and it takes less noise than anyone would guess. [measured]**

On a raised cosine whose exact ceiling is **64.77°** and whose density
independence the density study established (63–64° from 289 to 32,761
vertices), at a lattice of 4,225 vertices over a 400 px part:

| the sheet | reported ceiling | what it cost |
| --- | --- | --- |
| the form itself, closed form | 64.77° | — |
| 8 bits, nothing added | 64.58° | 0.19° |
| ±1 LSB of white noise | **61.37°** | 3.21° |
| ±8 LSB | **45.34°** | 19.24° |
| ±32 LSB | **21.55°** | 43.03° |
| one stray pixel, δ 245 of 255 | **6.08°** | 58.50° |

⇒ **±1 LSB — the smallest perturbation an 8-bit sheet can carry — costs 3.2°,
and one pixel out of 160,000 costs 58°.**
[`evidence/white.txt`](evidence/white.txt), [`evidence/outlier.txt`](evidence/outlier.txt)

And **density makes all of it worse, monotonically**, because a finer lattice
samples a shorter baseline and reads the same grain as a steeper slope:

| ±LSB | grid-17 | grid-33 | grid-65 | grid-129 | grid-257 |
| --- | --- | --- | --- | --- | --- |
| 0 | 65.35 | 64.80 | 64.58 | 63.06 | 61.37 |
| 1 | 64.80 | 63.49 | **61.37** | 58.15 | 52.34 |
| 8 | 62.21 | 55.14 | **45.34** | 33.10 | 20.71 |
| 32 | 52.42 | 35.40 | **21.55** | 11.72 | **6.24** |

🚨 **This is the opposite sign from the reassurance the density study ends on.**
There, a bounded map's angle was density-independent and the fix for the dome
was an edit to the sheet. That still holds — of the *form*. What refining the
mesh does to the *grain* is the density cliff all over again, arriving through a
different door.

⭐ **And the ceiling is not lying.** `A39`'s own survey, walked one degree at a
time through the runtime, refuses at exactly the reported angle in all eight
configurations and in both directions — worst disagreement **0°**
([`evidence/a39.txt`](evidence/a39.txt)). The noise does not corrupt the report.
It corrupts the **rig**: a ±8 LSB sheet genuinely gives a mesh that folds at 50°
where the clean sheet folds at 65°.

## 1. Controls — nothing below is measured through a chain that was not checked

[`evidence/controls.txt`](evidence/controls.txt).

The sweeps compile hundreds of rungs, so most of them use a **direct chain** —
`buildGridMesh` → `sampleLevel`/`toneLevel` → `turnCeiling`, all four out of
`src/`, with no skeleton written. That is only legitimate if it is the same
number `build` prints, so it is checked first, on clean and noisy sheets at
three lattices: **worst disagreement 0.00e+0 degrees, at nine decimal places.**

| lattice | sheet | compiler ° | direct ° | \|Δ\| |
| --- | --- | --- | --- | --- |
| grid-17 | clean | 65.353229148 | 65.353229148 | 0.00e+0 |
| grid-17 | ±4 LSB | 63.705209929 | 63.705209929 | 0.00e+0 |
| grid-65 | clean | 64.578533984 | 64.578533984 | 0.00e+0 |
| grid-65 | ±4 LSB | 52.679807969 | 52.679807969 | 0.00e+0 |
| band-1px | clean | 62.102728969 | 62.102728969 | 0.00e+0 |

Two more, for the two things the harness does that `src/` cannot:

- **The float sampler.** There is no way to hand the compiler a sheet that is not
  8 bits, so the unquantised reference has to be sampled here. Against
  `sampleLevel` on an integer field, over 4,225 vertices: **worst difference
  0.00e+0 levels.**
- **The per-triangle distribution.** `turnCeiling` returns a minimum and §6 asks
  what the rest of the distribution looks like, so the closed form is written a
  second time. Its minimum against `turnCeiling`'s answer, clean and noisy:
  **0.00e+0 degrees.**

⚠️ Nothing in the density sweeps beyond grid-181 is compiled. A 577-lattice is
332,929 vertices, which at the density study's measured 449 bytes a vertex is a
149 MB skeleton for one table row. The controls above are what buys the right to
skip writing it.

### The harness's own guard, fired

[`evidence/guard.txt`](evidence/guard.txt). The work directory is a **required
argument with no default**, for the reason the density study learned the hard
way — its harness defaulted to a directory inside the tree and the motion specs
it left there were swept up by the selftest's own walk, inflating that count from
38 to 66.

🚨 **Saying so in a comment is not enough, because the next line is
`rmSync(dir, { recursive: true, force: true })`.** `noiseprobe.ts src
--experiment=quant` deleted `src/`. A polluted count is visible in the next run;
a deleted directory is not. So the rule is checked rather than documented, and
the check is exercised: eight refusals run for real, with the exact stderr and
exit code of each, a positive control showing a legitimate path still runs, and
the working tree afterwards showing nothing was removed.

| refused | the message names |
| --- | --- |
| `src` — inside the repository, and it exists | the resolved path and the repository root, both in full |
| the repository root itself | the same |
| the same in-repo path, run from `/` | the same, which is the cwd-independence check |
| `/` | the filesystem root |
| `$HOME` | the home directory |
| a literal `~` the shell did not expand, from inside the repository | that it would become a directory *named* `~`, and where |
| the same from `/tmp`, where no other rule reaches it | the same |
| `~/np`, likewise unexpanded | the same |
| a path that exists and is a file | that it is a file, and what the argument is for |

⚠️ The tilde is refused for what it **meant**, not for where it lands. Quoted,
`~` is an ordinary relative path and `resolve` turns it into a directory
literally named `~` beside the caller — which the repository rule catches only
when the caller happens to be standing in the tree. Two of the rows above are
that gap, closed and then fired from outside the repository to prove it.

The root is derived from `import.meta.dir`, not `process.cwd()` — a guard that
asks the caller where the repository is can be walked around by standing
somewhere else, and the evidence file's `cd /` row is that checked. And the run
announces `noiseprobe: removing and recreating <path>` on stderr **before** it
removes anything, which is the line that would have made the hazard visible the
first time somebody mistyped the argument.

⚠️ The seven experiment files are stdout only, so that announcement is not in
them; it is in `guard.txt`'s positive control, where it belongs. All seven
reproduce byte for byte from the harness as it now stands.

## 2. 8-bit quantisation alone, and the two floors it puts under everything

[`evidence/quant.txt`](evidence/quant.txt). Peak level 255, `zScale` 60 — a sheet
spending its whole range on the part, which is the best case a PNG has.

| lattice | cell h px | 8-bit ° | unquantised ° | 8-bit − unquantised | one-level bound ° | texel-step floor ° |
| --- | --- | --- | --- | --- | --- | --- |
| grid-17 | 25.000 | 65.35 | 65.30 | +0.05 | 89.46 | 54.78 |
| grid-33 | 12.500 | 64.80 | 64.89 | −0.10 | 88.92 | 54.78 |
| grid-65 | 6.250 | 64.58 | 64.80 | −0.22 | 87.84 | 54.78 |
| grid-129 | 3.125 | 63.06 | 64.77 | −1.72 | 85.69 | 54.78 |
| grid-181 | 2.222 | 62.37 | 64.77 | −2.40 | 83.96 | 54.78 |
| grid-257 | 1.563 | 61.37 | 64.77 | −3.40 | 81.44 | 54.78 |
| grid-401 | 1.000 | 62.10 | 64.77 | −2.67 | 76.76 | 54.78 |
| grid-577 | 0.694 | 56.57 | 64.77 | −8.20 | 71.28 | 54.78 |
| grid-801 | 0.500 | **54.78** | 64.77 | −9.99 | 64.80 | **54.78** |

Three readings.

**The unquantised control converges on the closed form and stays there** — 64.77°
at every rung from grid-129's 16,641 vertices to grid-801's 641,601, a 39×
refinement that does not move the third significant figure. That is the density
study's result reproduced through a different chain, and it is what makes every
other column in the table attributable to the encoding rather than to the
geometry.

**Quantisation alone costs 0.2° at grid-65 and 10° at grid-801.** The cost is a
smooth function of the cell, not a threshold.

⭐ **And it stops.** Below one texel per cell, both bilinear taps of both
endpoints fall inside one texel cell, so the sampled gradient stops shrinking
with the cell and saturates at the steepest **adjacent-texel step** the lattice
can reach. This sheet's steepest step is 3 levels, so the floor is
`atan(255 / (60 × 3)) = 54.78°` — and `grid-801` reads **54.78°**. [derived +
measured, agreeing to the two decimals printed]

The band rungs are the same statement in a cheaper form: a narrow strip of
columns across the steepest part of the sheet reaches a 0.0625 px cell in 1,923
vertices, and reads **59.53° at 0.5 px and at every cell finer than it**. The
number differs from 54.78° because the strip samples only the columns it spans,
so its steepest reachable texel pair is not the map's.

⚠️ `grid-401` at exactly h = 1 px reads **62.10°, higher than grid-257** — the
only non-monotone row in the table, and it is an aliasing artefact, not noise:
at integer spacing every tap lands with `fx = 0.5`, so each sample is the mean of
two adjacent texels and each difference is a two-texel average that halves the
visible step. It is a reminder that the reported number is a property of where
the vertices land, not only of how many there are.

## 3. ⭐ The one-level bound — an 8-bit sheet cannot report an angle above it

[`evidence/amplitude.txt`](evidence/amplitude.txt). Seven encodings of **one
physical surface**: peak level `L` falling while `zScale` rises by the same
factor, so `max|dz/du|` — and therefore the true ceiling — is 64.77° in every
row.

| peak level | zScale | lattice | levels per cell | 8-bit ° | closed form ° | one-level bound ° |
| --- | --- | --- | --- | --- | --- | --- |
| 255 | 60.00 | grid-65 | 12.52 | 64.58 | 64.77 | 87.84 |
| 128 | 119.53 | grid-65 | 6.28 | 64.89 | 64.77 | 85.71 |
| 64 | 239.06 | grid-65 | 3.14 | 62.30 | 64.77 | 81.47 |
| 32 | 478.13 | grid-65 | 1.57 | 59.04 | 64.77 | 73.30 |
| 16 | 956.25 | grid-65 | 0.79 | **59.04** | 64.77 | **59.04** |
| 8 | 1912.50 | grid-65 | 0.39 | **39.81** | 64.77 | **39.81** |
| 4 | 3825.00 | grid-65 | 0.20 | **22.62** | 64.77 | **22.62** |

The bolded rows are equal to two decimal places, and the same equality holds in
**nine rows** across the three lattices in the evidence file. It is a closed
form, and it was not predicted:

    q = zScale / 255                     one quantisation step, in world units
    ceiling ≤ atan(h / q) = atan(255·h / zScale)

The smallest non-zero depth difference a sheet can put across one mesh cell is
exactly one level. A cell that steps at all steps by at least `q`, so the
steepest sampled gradient is at least `q/h`, whatever the form underneath is
doing. It tightens as the mesh refines and it tightens as `zScale` grows.

🚨 **Below one level of change per mesh cell, the reported ceiling contains no
information about the form at all.** It is `atan(h/q)` — arithmetic about the
encoding. Three of the rows above report 59.04°, 39.81° and 22.62° for a surface
whose real answer is 64.77°, and every one of them is a plausible-looking number.

Between one and about three levels per cell the ceiling is wrong by several
degrees without the bound binding: `grid-129` at 1.57 levels per cell reads
**57.48°**, 7.29° low, with its bound still at 73.30°. The cost is not monotone
in levels-per-cell at that scale — where the staircase falls relative to the
lattice matters — but the envelope is clear: **≥ 12 levels per cell keeps the
quantisation cost under 0.3°; ≥ 6 keeps it under about 2°; below 3 it is
multiple degrees; below 1 there is no form left in the number.**

## 4. White noise — a linear law, and it is linear in the wrong thing

[`evidence/white.txt`](evidence/white.txt). Uniform integer noise on
`{−A … +A}` levels, added to the 8-bit sheet, deterministic from `--seed`.

A ceiling **is** a sampled gradient, so the identity inverts:
`Δlevel = 255·h / (zScale · tan t)`. Subtracting the clean sheet's from each
noisy sheet's gives the excess levels the noise actually put across the steepest
cell — no model in it, just the arithmetic run backwards:

| ±LSB | grid-17 | grid-33 | grid-65 | grid-129 | grid-257 | mean excess ÷ ±LSB |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1.25 | 1.50 | 1.88 | 1.50 | 1.50 | **1.53** |
| 2 | 2.00 | 3.00 | 3.88 | 3.13 | 3.50 | **1.55** |
| 4 | 3.75 | 6.00 | 7.63 | 6.50 | 6.76 | **1.53** |
| 8 | 7.25 | 12.00 | 13.63 | 13.63 | 13.94 | **1.51** |
| 16 | 15.75 | 24.75 | 28.12 | 27.88 | 27.81 | **1.55** |
| 32 | 33.00 | 49.75 | 54.63 | 57.25 | 57.06 | **1.57** |

⭐ **The noise adds `≈ 1.53·A` levels to the steepest sampled step, flat in
amplitude and nearly flat in density.** [measured] It is the max, over every cell
in the mesh, of a difference of two bilinear blends of iid noise — an order
statistic, which is why it sits well above the per-sample standard deviation and
why it creeps up with the number of cells (1.25 at 512 triangles, 1.88 at 8,192).

The form, meanwhile, contributes `s·h` levels across a cell, where `s` is the
sheet's steepest level gradient (2.0028 levels/px here). So:

    noise fraction of the sampled gradient  =  1.53·A / (s·h)

which is **linear in the amplitude and inverse in the cell** — noise and mesh
density pull in the same direction. In the noise-dominated limit `tan t ∝ h`, so
halving the cell should halve the tangent; measured at ±32 LSB the successive
ratios are **1.80, 1.90, 1.90** against a predicted 2.00, the shortfall being
the order statistic creeping up as the cell count rises.

**Seed stability.** Five seeds at ±1 LSB, worst spread across the five: 0.42° at
grid-65, 1.33° at grid-257. So a single reading is worth about ±0.7° at these
densities and no finer distinction is claimed anywhere above.

## 5. One stray pixel — no threshold, only a coin flip

[`evidence/outlier.txt`](evidence/outlier.txt). One texel of 160,000, moved by
δ levels.

At grid-65, on the texel some vertex reads hardest **inside the art** (137, 37),
weight **1.0000**:

| δ levels | on that texel | on a texel no vertex reads | closed form from w·δ |
| --- | --- | --- | --- |
| 8 | 64.58 | 64.58 | 64.58 |
| 16 | 52.68 | 64.58 | 58.94 |
| 32 | 36.23 | 64.58 | 39.70 |
| 128 | 11.36 | 64.58 | 11.72 |
| 255 | **6.08** | **64.58** | 5.95 |

Two things, and they are the whole of the answer for outliers.

**It is not a threshold, it is whether the pixel is sampled.** The unread column
does not move by a hundredth of a degree at any δ, at any density. A stray pixel
a lattice cannot reach is invisible; one it reads at weight 1 is worth `w·δ`
levels with no averaging at all. The closed form `atan(255h / (zScale·w·δ))`
tracks it to **0.13° at δ 255 and 0.36° at δ 128**, and over-states the ceiling by
up to 6° in the middle of the range (58.94° predicted against 52.68° measured at
δ 16) because it credits the outlier's edge with none of the sheet's own secant.
The knee — where the outlier first overtakes the form — is measured in **(8, 16]**
levels against a predicted `s·h / w` = 12.5.

🚨 **Weight 1.0000 is not a contrivance.** A vertex whose coordinate lands on a
half-pixel — which `cols: 65` over a 400 px part produces at every fourth column
— has `fx = 0`, and its bilinear tap collapses onto a single texel. The
smoothing an author might assume protects them is simply not there for those
vertices.

And **a denser mesh is more exposed, twice over:**

| lattice | texels it can read | clean ° | with one stray pixel (δ ≈ 245) |
| --- | --- | --- | --- |
| grid-5 | 0.04 % | 73.15 | 73.15 |
| grid-9 | 0.16 % | 66.87 | 66.87 |
| grid-17 | 0.64 % | 65.35 | 57.57 |
| grid-33 | 1.44 % | 64.80 | **11.90** |
| grid-65 | 7.84 % | 64.58 | **6.08** |
| grid-129 | 36.00 % | 63.06 | **3.08** |
| grid-257 | 100.00 % | 61.37 | **1.55** |
| grid-801 | 100.00 % | 54.78 | **0.97** |

Once — because the share of the sheet it can see goes from 0.04 % to 100 %, so
the probability that a given bad pixel is sampled at all rises with it. Twice —
because the same `w·δ` divided by a smaller `h` is a steeper slope. `grid-5`
cannot see the pixel; `grid-801` reports **0.97°** for a surface whose answer is
64.77°.

⚠️ **The trend is not clean and the omitted rows are why.** `grid-401` reports
**3.84°**, worse than nothing but better than the coarser `grid-257`'s 1.55°,
because at integer spacing no vertex reads any texel above weight 0.25 (§2's
aliasing again). The exposure is governed by the largest bilinear weight the
lattice happens to give a texel, which is a property of where the columns land
and not of how many there are — the full column is in
[`evidence/outlier.txt`](evidence/outlier.txt).

## 6. Can one compile tell grain from form? Yes, and cheaply

[`evidence/shape.txt`](evidence/shape.txt). The ceiling is the minimum of the
per-triangle fold angles. The **rest of that distribution** is already in the
compiler's hands and is not currently looked at.

At grid-65, 8,192 triangles read on two axes each:

| sheet | ceiling ° (= min) | p1 ° | **p1 / min** | within 5 % of the ceiling | share |
| --- | --- | --- | --- | --- | --- |
| clean 8-bit | 64.58 | 64.80 | **1.003** | 1100 / 12016 | 9.15 % |
| ±1 LSB | 61.37 | 64.36 | **1.049** | 170 / 15625 | 1.09 % |
| ±8 LSB | 45.34 | 55.42 | **1.222** | 6 / 16014 | 0.04 % |
| ±32 LSB | 21.55 | 30.48 | **1.414** | 2 / 16134 | 0.01 % |
| one stray pixel, δ 245 | 6.08 | 64.80 | **10.652** | 8 / 12016 | 0.07 % |

⭐ **`p1 / min` separates the worst case by a factor of ten, in one compile, from
data the compiler already holds.** A form-driven ceiling is reached by a whole
**band** of the mesh at once — the steepest ring of the cosine — because the form
is smooth and its steepest region has area, so the 1st percentile sits 0.3 %
above the minimum. A ceiling set by one bad texel has 99 % of the mesh surviving
to 64.80° while the reported number is 6.08°.

The share within 5 % is the complementary reading and it is **not** monotone in
severity — the stray pixel's 0.07 % sits above ±8 LSB's 0.04 % — because broadband
noise lowers the whole distribution while an outlier lowers one point of it.
Read together they say different things: the share says *the limit is not a
band*, the ratio says *the limit is one triangle*.

⚠️ **The diagnostic does not false-positive on a mesh that cannot see the
pixel.** At grid-17 the stray-pixel row is identical to the clean row in every
column — min 65.35°, ratio 1.002, share 10.89 % — because that lattice never
samples the texel. The signal appears exactly when there is something to signal.

⚠️ The denominators move because a perfectly flat cell has `A_axis = 0` and is
not measurable at all; noise gives every cell a gradient. That is why the share
and not the count is the statistic.

## Prediction against measurement

Written before the harness ran, kept as written. Nine landed, two were wrong in
the same direction — both over-estimating what quantisation costs — one had the
right formula and a wrong constant in it, and the two largest findings, the
one-level bound and the strength of the distribution diagnostic, were not
predicted at all.

| # | predicted | measured | verdict |
| --- | --- | --- | --- |
| quantisation at grid-65 | 62.5° (assumed ~1 level of excess per cell) | 64.58° | ❌ **8× too pessimistic** — bilinear blending averages most of the rounding away |
| quantisation floor at h ≤ 1 px | `atan(255/(60×3))` = 54.78° | grid-801: **54.78°** | ✅ exact |
| a sheet using 1/8 of the range | loses ~12° at grid-65 | loses 5.8° | ❌ 2× too pessimistic — and the mechanism turned out to be a closed form (§3) that was not predicted |
| white-noise excess | `n ≈ 1.7·A` levels | **1.53·A**, flat in A and in density | ✅ to 11 % |
| density under noise | halving `h` doubles the relative cost; `tan t ∝ h` | ratios 1.80 / 1.90 / 1.90 against 2.00 | ✅ to 5 % |
| outlier knee | δ ≈ 22 levels, assuming weight 0.5625 | weight is **1.0000**, so the same formula predicts 12.5; measured knee in (8, 16] | ⚠️ formula right, assumed weight wrong |
| outlier magnitude | 10.5° at δ 255 | with the measured weight the same formula gives 5.95°; measured **6.08°** | ✅ to 2 % |
| an unread outlier | exactly zero change | exactly zero, every δ, every density | ✅ exact |
| texel coverage | ≤ 4·V/160000 — grid-65 10.6 %, grid-181 82 % | 7.84 % and 81.00 % | ✅ bound held |
| `A39` agrees on a noisy sheet | yes | **0° gap**, 8 rows, both directions | ✅ exact |
| the distribution as a diagnostic | separates the outlier but not white noise | separates **both** — `p1/min` 1.003 clean against 10.652 for one stray pixel, and the share within 5 % 9.15 % against 0.04–0.07 % | ✅ better than predicted |
| the practical threshold | A ≈ 0.74 levels for a 10 % tangent error at grid-65 | A ≈ 0.82 levels, from the measured 1.53·A | ✅ to 11 % |

⚠️ **One error of the study's own, recorded because it nearly became a finding.**
The first `A39` comparison read a **4° disagreement** between the reported
ceiling and what the survey refused, and it was wrong: it compared a `+yaw` key
against `tightest()`, the minimum of all four reported ceilings. A key turns in
one direction and is bounded by that direction's number. Compared per-direction,
the gap is 0° everywhere. ⇒ **The four reported ceilings are not
interchangeable**, and a comparison that folds them into one number will read a
disagreement with the runtime that is not there. The density study's own
`foldSearch` walks positive degrees only, and its readings are `yaw.positive`
figures whatever else the mesh's other three directions were doing.

## The practical threshold

Combining §3 and §4, both measured on this sheet:

    sampled gradient across a cell  ≈  s·h  +  1.53·A  levels
                                       \__/    \_____/
                                       form     grain

⭐ **The ceiling stops describing the form when `1.53·A` approaches `s·h`.** At a
10 % error in the tangent that is `A ≤ s·h / 15`. On this sheet at grid-65,
`s·h = 12.5` levels, so **A ≤ 0.82 levels — below one LSB.**

Stated the way an author can act on it, since `s·h` is *the number of levels the
sheet changes across one mesh cell*:

> **The depth sheet must change by at least about 15 levels per mesh cell for
> every ±1 level of noise it carries, and by at least 8 levels per cell for the
> 8-bit rounding alone.** Below that the reported turn ceiling is a reading of
> the sheet's grain.

Two hard bounds sit underneath it, and neither has an amplitude in it:

- `ceiling ≤ atan(255·h / zScale)` — **the one-level bound.** No 8-bit sheet can
  report more, at any density, for any form.
- `ceiling → atan(255 / (zScale · D))` as the cell drops below a texel, where `D`
  is the steepest adjacent-texel step. Refining past one texel per cell buys
  nothing and costs the difference.

And for a single stray pixel there is **no threshold to give**. It is not an
amplitude question: a pixel the lattice does not sample costs exactly nothing,
and one it samples at weight 1 costs `atan(255·h / (zScale·w·δ))` — 6° for one
pixel of 160,000. The only defence measured here is that a coarse lattice cannot
see most of the sheet, which is not a defence anyone should want.

## What this recommends

🚨 **Not a filter.** The standing rule is that rigc does not have the authority
to guess its input away, learned on this very feature the day before
([#391](https://github.com/firejune/rigc/issues/391): a depth threshold picking
the jiggle region was plausible, green and wrong; the fix was a hand-painted
mask). Smoothing a depth map before measuring it would make the reported ceiling
describe a surface **that is not the one the deform key will be built from** —
the mesh would still sample the raw sheet, `A39` would still refuse at the raw
angle, and the report and the gate would part company. Everything above says the
ceiling is *correct*. It is the sheet that is wrong.

What the measurements do support is **saying more, alongside the same number.**
Two candidates, both computable from what `sampleMeshDepth` already holds, both
free, neither changing any value rigc emits, and both diagnostics in the sense
`A39`'s own header uses — a report, never a refusal:

1. **The 1st-percentile fold angle beside the ceiling.** §6: on a clean sheet the
   two are 64.58° and 64.80°; with one stray pixel they are 6.08° and 64.80°. A
   ratio near 1 says a band of the mesh reaches the limit together, which is what
   a form looks like. A ratio of 10 says one triangle does, which is what a texel
   looks like.
2. **The level step across the triangle that folds first** — `Δz / (zScale/255)`,
   in levels. §3: below about 3 the ceiling is quantisation, and below 1 the
   reported angle is `atan(h/q)` with no form in it at all. The compiler has `z`,
   has the triangle, and has `zScale`.

Draft issue text, for the commander to file or discard:

```
title: the turn ceiling should say whether it is describing the form or the sheet's grain

`turnCeiling` reports the minimum of the per-triangle fold angles and nothing
else about their distribution. bench/studies/2026-09-05-noise measures that the
minimum alone cannot distinguish a limit set by the shape from one set by the
sampling, and that the difference is large:

  clean 8-bit sheet, grid-65   ceiling 64.58°   1st percentile 64.80°   ratio 1.003
  the same sheet, one texel
  of 160,000 moved 245 levels  ceiling  6.08°   1st percentile 64.80°   ratio 10.652

Both are correct — A39 refuses at the reported angle in both cases, measured to
0° over eight configurations — and an author reading 6.08° has no way to tell
that 99 % of their mesh turns to 64.80° and one triangle does not.

Proposal, a report and never a refusal:

1. print the 1st-percentile fold angle beside each of the four ceilings;
2. print the depth step across the triangle that folds first, in LEVELS
   (Δz ÷ (zScale/255)). Below ~3 levels the ceiling is quantisation; at 1 level
   it is exactly atan(255·h / zScale) and carries no information about the form.

Explicitly NOT proposed: any smoothing, filtering or outlier rejection of the
depth map. rigc does not have the authority to guess its input away (#391), and
a filtered measurement would part company with A39, which reads the raw sheet
through the mesh.

Evidence: bench/studies/2026-09-05-noise/evidence/shape.txt (the distribution),
amplitude.txt (the one-level bound, exact in nine rows), a39.txt (the ceiling
and the runtime agreeing to 0°).
```

The authoring rule belongs in [`docs/FACE.md`](../../../docs/FACE.md) §2.2 beside
the density study's, and is stated there in three lines.

## What this does not measure

- **Nothing about real art.** Every sheet here is synthetic: one raised cosine on
  one 400×400 generated ellipse. Whether a depth map that comes off a real
  monocular pass carries ±1 LSB, ±8 or a stray pixel is **not measured and not
  estimated** — the study says what each costs, not which one anybody has.
- **Nothing about structured error.** White noise and a single delta are the two
  extremes of a spectrum. A resampled sheet rings, a JPEG one blocks, a dithered
  one carries a pattern, and a monocular model's error is spatially correlated
  with the shape it got wrong. All of those are *between* the two cases measured
  and none of them is one of them.
- **Nothing about `tone`.** `gamma`, `contrast` and `bias` all multiply the
  gradient, so all of them move every figure here. Every sheet was read through
  the identity curve.
- **Nothing about how it looks.** Every number is a refusal angle. No frame was
  rendered, and whether a ceiling of 45° instead of 65° produces a turn a person
  would reject is a question for `vote`, per the usage-phase rule.
- **Nothing about `contour`.** Only `grid` was measured. The density study
  already established that `contour` samples 2 % of a depth map and holds
  triangles three orders of magnitude apart in area, so its interaction with
  grain is a separate question and probably a worse one.
- **Nothing about one asymmetric sheet.** The cosine is radially symmetric, so
  the four reported ceilings differ only through the lattice. A real face's yaw
  and pitch limits differ by construction, and the noise interaction with that
  asymmetry is unmeasured.
- **One seed sweep, at one amplitude.** Five seeds at ±1 LSB give a worst spread
  of 1.33°. Nothing above claims a difference smaller than that.
- **The band lattice is a device, not a mesh anyone would author.** It spans a
  strip and its saturation floor (59.53°) is that strip's steepest texel pair,
  not the sheet's. The whole-window `grid-801` rung is what pins the sheet's own
  floor.
- **No timing, no bytes.** The density study measured both and nothing here
  changes them.
