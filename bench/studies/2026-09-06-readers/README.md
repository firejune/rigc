# What each of the six slider readers can actually produce

- date: 2026-09-06
- repository at: `60e3774` (`fix(compile): the wrap refusal computes its consequence instead of asserting one`)
- subject: spine-core's six `FromProperty` subclasses — `FromRotate`, `FromX`, `FromY`, `FromScaleX`,
  `FromScaleY`, `FromShearY` in `node_modules/@esotericsoftware/spine-core/dist/TransformConstraintData.js`
  — as a **slider** reaches them (`Slider.update`), and the rig-spec surface that names them
  ([`src/rig.ts`](../../../src/rig.ts), `RIG_FROM_PROPERTIES`)
- corpus: **none** — the harness compiles its own rig, twelve sliders on one bone, from a 12×8 plate
- harness: [`tools/readerprobe.ts`](tools/readerprobe.ts) — no work directory, no store; `--experiment=<name>`
  and an optional `--seed` / `--samples`. Every experiment reproduces byte for byte from the committed harness
- evidence: [`evidence/`](evidence) — one file per experiment, each carrying the invocation that produced it.
  Every figure below is a cell in one of those files
- issue: [#420](https://github.com/firejune/rigc/issues/420), **stage 1 — the measurement only**. No guard was
  written and `src/compile.ts` was not touched; the recommendation for stage 2 is at the end

## The question

A slider with a bone maps

```
time = offset + (value − property.offset) × scale
```

and `value` is one call to `data.property.value(skeleton, bone.appliedPose, data.local, Slider.offsets)`.
If an author states a range that includes readings the runtime **cannot return**, that part of the dial
is dead: it never selects the frames it was meant to, and nothing at runtime reports it.

[#405](https://github.com/firejune/rigc/issues/405) and [#417](https://github.com/firejune/rigc/issues/417)
each closed that defect for **one** cell — `FromRotate` under `local: false`. There are twelve cells: six
readers, each with a `local` branch and a world branch. Eleven of them had never been measured.

⛔ Nothing here is derived from reading the source. The source was read to know *where to look* — which
pose axis moves which term, which branch a signed zero lands in — and then a skeleton was posed through
spine-core and `property.value` was called, exactly as `Slider.update` calls it. That is #403's rule: a
prediction chooses where to look, a measurement decides.

## The table

**Measured. Stated for `offsets` all zero, which is the only array a slider can pass** — `Slider.offsets`
is a `private static readonly` all-zero array, read off a live `Slider` in
[`evidence/controls.txt`](evidence/controls.txt). Every world row below moves if the offsets do not;
[`evidence/offsets.txt`](evidence/offsets.txt) is what each one costs, and it matters because the same six
classes serve `TransformConstraint`, which passes its own.

| rig `property` | `"local"` | Reader | Producible floor | Producible ceiling |
| --- | --- | --- | --- | --- |
| `rotate` | `false` | `FromRotate`, world | `0`, reached | `360`, reached |
| `rotate` | `true` | `FromRotate`, local | none | none |
| `x` | `false` | `FromX`, world | none | none |
| `x` | `true` | `FromX`, local | none | none |
| `y` | `false` | `FromY`, world | none | none |
| `y` | `true` | `FromY`, local | none | none |
| `scaleX` | `false` | `FromScaleX`, world | `0`, reached | none |
| `scaleX` | `true` | `FromScaleX`, local | none | none |
| `scaleY` | `false` | `FromScaleY`, world | `0`, reached | none |
| `scaleY` | `true` | `FromScaleY`, local | none | none |
| `shearY` | `false` | `FromShearY`, world | `-449.99999468`, reached | `269.99999468`, reached |
| `shearY` | `true` | `FromShearY`, local | none | none |

`none` means the extreme ran past ±1e6 while the driven field was held at ±1e9
([`evidence/table.txt`](evidence/table.txt)). That is a statement about the sweep and not a proof of
unboundedness — those readers are `source.<field> + offset` and the field is whatever was written, so
there is nothing there to bound. **Six ends are what the measurement earns**, and they are the six that
a guard could be built on.

⛔ **All six `local` rows are unbounded, and that is load-bearing.** It is the negative control for
anything stage 2 builds: a compiler that refused every non-`rotate` slider would look correct against a
suite that only tested refusals. This is the shape that caught a real mutant in
[#410](https://github.com/firejune/rigc/issues/410).

## Three things the table is not

### 1. 🚨 `FromRotate` world is `[0, 360]`, not `[0, 360)` — and #417 says otherwise

This is a **correction to a documented cell**, so it is stated first.

`FromRotate.value` ends `if (value < 0) value += 360`. `Math.atan2` returns `(−π, π]`, so the
mathematical range is `[0, 360)` — which is what #417 established, what
[`docs/AUTHORING.md`](../../../docs/AUTHORING.md) §3.5.2 states, and what `src/compile.ts`'s refusal
comment says. In IEEE 754 it is not what happens: a reading a hair below zero comes out of that
`+= 360` as **exactly 360** ([`evidence/bounds.txt`](evidence/bounds.txt)):

| `src.rotation` | reading | `=== 360` |
| --- | --- | --- |
| −1e-13 | 359.9999999999999 | false |
| **−1e-14** | **360** | **true** |
| −1e-15 | 360 | true |
| 0 | 0 | false |

**How far below zero, bisected on the runtime's own `v + 360 === 360`** rather than computed:

```
the largest reading that does NOT reach 360:  -2.8421709430404014e-14  ->  359.99999999999994
the smallest reading that DOES reach 360:     -2.842170943040401e-14   ->  360
```

⇒ the readings that arrive as 360 are exactly **`[-2.842170943040401e-14°, 0°)`** — **closed** at the
threshold, and the threshold is half an ulp of 360 to the last bit (checked against
`(nextDoubleAbove(360) − 360) / 2`, which is read off the representation).

⭐ **Nothing about the existing guard changes, and the direction is the friendly one.** `src/compile.ts`
refuses a range whose top runs `> 360 + 1e-6`, so 360 was already inside what it allows; what moves is
that a full-turn dial ending exactly on 360 now provably **reaches its own endpoint** instead of missing
a supremum. AUTHORING's "it misses exactly one value, its own supremum" is the sentence that has to
change, and it changes to something stronger.

⚖️ **Why continuing past the STOP condition was right, narrowly.** Not "it was only a refinement":
*nothing gates on the difference*. `src/compile.ts` tests `> 360 + 1e-6`, so 360 was already inside
the accepted set and the measurement can only strengthen the guard. Had it moved a value across a
boundary the compiler actually tests, stopping would have been mandatory.

### 1a. 🚨 …and this study got that number wrong first, in the study's own failure mode

The line above read `half an ulp of 360 is (360 * Number.EPSILON) / 2` — **3.997e-14** — and stated
the interval as `(−4.0e-14°, 0°)`. `Number.EPSILON` is the ulp of **1.0**, the spacing of the binade
`[1, 2)`. 360 lives in `[256, 512)`, where the spacing is `256 · EPSILON`, so the expression
overstated the threshold by 360/256 and the interval **claimed readings the reader does not
produce** — measured, −3.99e-14, −3.0e-14 and −2.85e-14 all come back `359.99999999999994`.

⛔ That is exactly this study's subject, turned on the instrument: **a formula that is right in the
regime it was written for and silently wrong one binade over.** It is [#417](https://github.com/firejune/rigc/issues/417),
[#431](https://github.com/firejune/rigc/issues/431) and [#434](https://github.com/firejune/rigc/issues/434)
in a row, and it was in the measuring tool as well as in the compiler — inside a study whose whole
question is which values a reader can produce.

⭐ The repair is the study's own standing rule rather than a better formula: **bisect it.** `wrapThreshold`
walks `v + 360 === 360` — the runtime's expression, nothing modelled — until the bracket is two
adjacent doubles, and reports the pair. The half-ulp figure is printed *beside* the measurement as a
cross-check and never used to compute it, and it too is read off the representation
(`nextDoubleAbove(360) − 360`) rather than off a binade constant, because `256 * Number.EPSILON`
would be the same mistake one keystroke over.

🔒 And the corrected figure is **inside the gate**, not narrated next to it: `RD07` bisects the
threshold itself and compares it to the one `docs/AUTHORING.md` prints. A number the doc states and
nothing derives is [#429](https://github.com/firejune/rigc/issues/429)'s shape, and it was this
figure's shape until the correction.

### 2. …and it has a 5.3e-6° hole at 180°

The other half of the same `atan2`. The image of `atan2` is `(−π, π]`; times `radDeg` that is
`(−179.99999734…, 179.99999734…]`, and `+= 360` puts the negative half at `[180.00000265…, 360)`.
Measured over 200,001 bone rotations at 1e-8° plus the two exact ends:

```
largest reading at or below 180: 179.99999734089107   at rotation=−0 shearX=−0 scaleX=−1
smallest reading above 180:      180.00000265910893   at rotation=+0 shearX=+0 scaleX=−1
hole width: 0.000005318217858985008°
```

⚠️ **Not a hazard.** No dial is 5.3e-6° wide. It is here because the cell in the table has to be the
truth rather than a rounding of it.

### 3. Every degree in this study is off by 2.7e-8 relative, and that is spine-core's

`MathUtils.PI` is **`3.1415927`** — the float32 π of the reference runtime, commented in
`Utils.js` as such. So `radDeg` is `180 / 3.1415927 = 57.29577866666166`, not `57.29577951308232`.
Consequences, all measured in [`evidence/controls.txt`](evidence/controls.txt):

- a full turn converts as `2π · radDeg = 359.99999468178214`, so a bone at 360° reads **5.3e-6°**, not 0°;
- `FromShearY`'s world ends are `±2π · radDeg − 90`, which is why they are `−449.99999468178214` and
  `269.99999468178214` and not round numbers;
- the "reads within 5.3e-6° of it" already quoted in `src/compile.ts`'s wrap comment is this constant.

Every `5.3e-6` below is that, and not a tolerance anybody chose.

## `FromScaleX` / `FromScaleY` world — the floor is 0 and **0 is attained**

The reader is `Math.sqrt(a² + c²)` over the world matrix, so #420's claim of `[0, ∞)` holds. Two things
it did not settle, both measured ([`evidence/bounds.txt`](evidence/bounds.txt)):

| pose | `scaleX` world | `=== 0` |
| --- | --- | --- |
| `src.scale` 1e-160 (a² is denormal) | 9.99994433575849e-161 | false |
| `src.scale` 1e-200 (a² underflows to 0) | 0 | **true** |
| **`src.scale` 0 — the degenerate bone** | **0** | **true** |
| `src.scaleX` 0 only | 0 | true |
| `parent.scale` 0 | 0 | true |
| `src.scaleX` **−1** (a mirror) | **1** | false |
| `src.scale` 1e200 (a² overflows) | **Infinity** | false |

- **0 is reached, not approached.** A bone whose own scale is 0, or whose parent's is, reads exactly 0.
  Nothing special happens to the mapping — `time = to + (0 − from)·scale` is arithmetic like any other —
  so the floor is a **closed** end and a range whose bottom is exactly 0 is legal.
- **The sign is gone.** `scaleX: −1` reads `+1`. This is the whole of the defect: an author driving a
  squash axis through negative scale gets the mirror image of the dial they wrote, not a dead half.
- A finite scale past ~1.34e154 squares to `Infinity` and the reader returns `Infinity`. Reported, not
  actionable.

## `FromShearY` world — the reader nobody had a bound for

`(atan2(d/sy, b/sx) − atan2(c/sy, a/sx)) · radDeg − 90`. #420 declined to state a bound and asked for a
measurement. It is `[−449.99999468178214, 269.99999468178214]`, **closed at both ends**, and each end is
hit exactly by an ordinary pose ([`evidence/bounds.txt`](evidence/bounds.txt)):

```
measured minimum: -449.99999468178214   at rotation=-1e-14 shearX=0 shearY=-89.99999999999999 scaleX=-1 scaleY=-1
measured maximum:  269.99999468178214   at rotation=-179.999999999 shearX=179.999999999 shearY=89.999999999 scaleX=-1 scaleY=-1
(−π − π)·radDeg − 90 = -449.99999468178214   |Δ| = 0.00e+0
(π − −π)·radDeg − 90 =  269.99999468178214   |Δ| = 0.00e+0
```

🚨 **But the bound is the least interesting thing about this reader.** A difference of two wrapped angles
wraps too, and driving `shearY` at a fixed bone orientation gives a window of width **exactly 360**:

| `src.rotation` | window | width | seams |
| --- | --- | ---: | --- |
| 0 | [−269.999995, 89.999995] | 359.999989 | shearY ≈ −270, 90, 450 |
| 30 | [−299.999996, 59.999994] | 359.999989 | shearY ≈ −300, 60, 420 |
| 90 | [−359.999999, −0.000009] | 359.999989 | shearY ≈ −360, 0, 360 |
| 180 | [−90.000000, 269.999989] | 359.999989 | shearY ≈ −450, −90, 270 |
| −90 | [−179.999999, 179.999991] | 359.999989 | shearY ≈ −540, −180, 180 |

The window is `(−270 − θx, 90 − θx]`, where `θx` is the bone's world x-axis angle. ⇒ **a `shearY` world
dial wraps exactly as a `rotate` one does, and the seam is not at a fixed value of the driven field —
it is wherever the bone is pointing.** The global bound above is the union over every orientation, which
is why it is 720° wide and why testing a range against it would catch almost nothing.

**The determinant's sign changes the answer, and not the way round it looks.** Over the same grid, the
unmirrored half (`scaleX·scaleY > 0`) hits both ends exactly; the mirrored half stops 6.6e-7° short of
each. Both extremes above come from a bone with *both* scales negative — a 180° turn, determinant
positive, not a mirror.

## `FromX` / `FromY` world — a rejected candidate

#420 asked whether the division by `skeleton.scaleX` / `skeleton.scaleY` changes the producible set under
a negative skeleton scale. **It does not — and it does not change the reading either**
([`evidence/skeleton.txt`](evidence/skeleton.txt)):

| skeleton scale | `rotate` | `x` | `y` | `scaleX` | `scaleY` | `shearY` |
| --- | --- | --- | --- | --- | --- | --- |
| (1, 1) | 37.000001445 | 6.999999234 | 11.000000000 | 1.499999950 | 0.500000017 | 12.000000272 |
| (−1, 1) | 37.000001445 | 6.999999234 | 11.000000000 | 1.499999950 | 0.500000017 | 12.000000272 |
| (1, −1) | 37.000001445 | 6.999999234 | 11.000000000 | 1.499999950 | 0.500000017 | 12.000000272 |
| (−1, −1) | 37.000001445 | 6.999999234 | 11.000000000 | 1.499999950 | 0.500000017 | 12.000000272 |
| (2, 0.5) | 37.000001445 | 6.999999234 | 11.000000000 | 1.499999950 | 0.500000017 | 12.000000272 |
| (−0.5, 3) | 37.000001445 | 6.999999234 | 11.000000000 | 1.499999950 | 0.500000017 | 12.000000272 |

Identical to the digit, for every reader. The world matrix already carries the skeleton scale and the
reader divides the same factor back out. **Rejected.**

The one case that is not identical is a skeleton scale of **zero**, where every world reader returns
`NaN` — not `±Infinity`, because the translation term is `0/0` and the angles are `atan2(±∞, ±∞)`. A
`NaN` reading makes `time` NaN and `Math.max(0, NaN)` is NaN, so the animation is applied at NaN. Out of
rigc's reach: nothing in skeleton data sets that field, a consumer does.

## 🚨 `local: true` is a passthrough only while nothing else drives the bone

The finding this study did not go looking for. `Slider.update` calls
`bone.appliedPose.validateLocalTransform(skeleton)` before reading, and `BonePose.validateLocalTransform`
recomputes the local pose **from the world matrix** when a constraint moved it. The decomposition is
`BonePose.set5`: `atan2Deg` for the angles and `Math.sqrt` for `scaleX`.

Same rig, same poses, the only difference being whether `src` is in a transform constraint's `bones`
([`evidence/local.txt`](evidence/local.txt)):

| pose | reader | free bone | bone in a constraint |
| --- | --- | --- | --- |
| `rotation` 720 | `rotate` local | **720** | **0.0000106** |
| `rotation` −500 | `rotate` local | **−500** | **−140.0000064** |
| `scaleX` −2 | `scaleX` local | **−2** | **+2** |
| `shearY` 250 | `shearY` local | **250** | **70.0000050** |
| `x` 1e6 | `x` local | 1000000 | 1000000 |

⇒ the **producible set** of every local cell is still unbounded — the free-bone case is in it, so the
table's `none` rows stand. What is not true is the sentence everyone reaches for: *"`local: true` reads
the number you authored"*. It reads the number you authored **on a bone nothing else drives**. On a
constrained one it reads a decomposition, with `rotation` and `shearY` back inside `(−180, 180]` and
`scaleX` back to `Math.sqrt` — **the same floor the world reader has, on the branch that was supposed to
be the repair for it.**

## What this changes

- [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) §3.5.2.1 is the table, and §3.5.2's `[0, 360)`
  sentences are corrected to `[0, 360]` with the rounding named.
- `selftest.ts` gains `RD01`–`RD10`, a suite that **re-derives every cell from spine-core and compares
  it to the table the doc states**, two-sided: a bound that loosens reds, and a bound that tightens
  reds. The derivation is asserted first — a scanner that stops matching goes silent, not red.
- Nothing in `src/` changed. The guard is stage 2.

### Red-first: the five edits that were made to the table, and what fired

A gate nobody has seen fail is not a gate. Each row below was applied to
`docs/AUTHORING.md`, `bun run selftest` was run, and the file was restored.

| edit to the table | fired | detail it printed |
| --- | --- | --- |
| `shearY`/`false` ceiling **loosened** to `999` | `RD05` only (`RD04` passed) | `shearY/false ceiling states 999, highest measured 269.99999468178214` |
| the same ceiling **tightened** to `200` | `RD04` and `RD05` | `read 269.99999468178214, above the stated ceiling 200` |
| `rotate`/`true` given a bound, `-1000`..`1000` | `RD04`, `RD05`, `RD06` | `16 of 18 unbounded end(s)` — the negative control noticing it lost two |
| `scaleX`/`false` told to read `FromScaleY` | `RD02` only | `scaleX/false wants FromScaleY, got FromScaleX` |
| the whole table **deleted** | `RD01` first, then `RD02`/`RD04`/`RD05`/`RD06` on their counts | `parsed 1 row(s)…; missing rotate/false, rotate/true, …` |

⭐ The first two are the pair that matters: a loosened bound and a tightened bound are different
defects and only one check catches each. The last is the reason RD01 exists at all — with the table
gone, a suite that only compared the rows it found would have reported agreement over one row.

And two more for `RD07`'s wrap-threshold clause, which gates a figure in **prose** rather than in the
table — added when the threshold was corrected:

| edit to the guide | fired | detail it printed |
| --- | --- | --- |
| the interval put back to `` `[-4.0e-14°, 0°)` `` — **the actual regression that shipped** | `RD07` | `docs/AUTHORING.md prints -4e-14` |
| the interval rewritten so the scanner stops matching it | `RD07` | `docs/AUTHORING.md prints 0 candidate interval(s)` |

🔒 The second is the clause that matters more: without the `exactly one site` requirement, a
rephrased sentence would make `RD07` compare the measurement against **nothing** and stay green.

🔸 Found while running them: the FAIL details recited the wanted answer. With eleven rows deleted,
`RD02` printed *"all 1 rows agree"* beside its own FAIL. Every detail now leads with `over N of 12
row(s)`.

## Recommendation for stage 2

Ranked by what the measurement supports, not by what would be tidy.

1. **`scaleX` / `scaleY` with `local: false`, a range dipping below 0 — refuse.** This is #420's own
   case and the measurement holds it up: the floor is exactly 0, it is attained, and nothing below it
   exists. The message must name the slider, the property, the range's own low end, the floor `0`, and
   the repair. ⚠️ The repair sentence cannot be a bare *"add `local: true`"*: on a bone another
   constraint drives, the local reader has the same `Math.sqrt` floor. Name the condition.
2. **`shearY` with `local: false` — do NOT refuse on the bound.** The global bound is 720° wide and
   catches almost nothing. What is worth saying is the window: a `shearY` world dial has a 360° wrap
   whose seam moves with the bone's orientation, so a range wider than 360 is dead for certain and a
   narrower one may still be. A refusal on `> 360` of range is defensible; a refusal against
   `[−449.99999468, 269.99999468]` is theatre.
3. **`rotate` with `local: false` — no change, but one sentence to fix.** The guard is right. The claim
   that `[0, 360)` is the whole of the reader's output is not, and it appears in `src/compile.ts`'s
   comment and in AUTHORING. This study corrects AUTHORING; the comment belongs to whoever holds
   `src/compile.ts`.
4. **`x` / `y` — nothing to refuse.** Unbounded in both branches, and the skeleton-scale candidate is
   rejected by measurement.

**Distinguishability.** Three refusals would then exist on one construct and every one of them names a
range and a repair. [`PS37`](../../../selftest.ts) is the pattern: assert that each message carries its
own clauses and **none of the others'**. Concretely, the scale refusal must carry `floor` / `below 0`
language and must *not* carry `below 0°`, `past 360°`, `does not cross 0°` or `does not run past 360°`;
the rotate refusals must not carry the scale repair. Choose the numbers so no two mutants can print the
same figure — the rotate cases already use −15/345/12.000s, 300/500/140/−0.800s and 0.001/−0.400s, so a
scale case wants a floor crossing that shares none of them.
