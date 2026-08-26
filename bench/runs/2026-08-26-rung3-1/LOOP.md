# Rung 3 — attempt 1 of 2026-08-26, the loop

- date:      2026-08-26
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- brief:     [`3-timing-and-spacing.md`](../../briefs/3-timing-and-spacing.md) **revision 2**,
             third-party verified 2026-08-26
- inputs:    the brief; `bench/reference/3-timing-and-spacing/` (frames, both
             `contact.png`, `frames.json`); `examples/3-timing-and-spacing/images/`;
             the example `.atlas` (read once, late, as a diagnostic — §1);
             `docs/AUTHORING.md` in full; this repository's `src/` and `tools/` as
             format documentation; the CLI
- reference: **not read** — `examples/3-timing-and-spacing/export/*.json` was never opened
- guide:     AUTHORING.md §10 in hand
- profile:   spine
- builds:    13 · `check` 14 · `bench` 2 (the first was invalid — §1)

## 1 — the reading list, and two entries of it I declined

The prompt that started this run named two surfaces the protocol's forbidden table
covers, and **the repository is the SSOT over the prompt**, so neither was opened:

- **`docs/LADDER.md` *Operating rules*** (gate v2's clauses and thresholds). The
  forbidden table's own reason is that the section "derives its thresholds by quoting
  those measures back". Read instead: *How a rung is scored* and *The honesty rule*,
  which are the two parts of that file a run is told to read. ⇒ **This run cannot
  return a clause-by-clause gate verdict.** It returns the measures; the adjudication
  belongs to a session that may open the section.
- **issue #12, body and comments.** The table names "the per-rung issues (#10–#18)"
  outright. The prompt offered the issue's 2026-08-26 comments as the authoritative
  record of the brief verification *if the clone predated the README change* — the
  clone is at `ba6f0ea`, which already carries both #164 and #166, and
  `bench/runs/README.md` already reads **yes (third party), rev 2, 2026-08-26** for
  this rung. So the fallback was not needed and the issue stayed shut.

One thing worth naming rather than burying: **AUTHORING.md §9.2's worked example is a
rung-3 `heavy` report**, and it prints reference-side change figures
(`f0018 … ref Δ 374`, `f0029 … 301`). The guide is allowed reading in full and §3
says every example value in it is invented, so this was checked rather than trusted:
the frames' own adjacent-pair changes at those indices are **1659** and **1253**. The
example is invented, as the guide claims. No figure from it was used.

The example `.atlas` (allowed list item 4) was opened **once, after the last spec
edit**, to explain a residual floor `check` could not otherwise attribute — §7. It
carries no key time, no bone and no pose.

## 2 — measuring the frames before writing anything

The whole method is §8's, run on two parts instead of a dozen: **render the candidate
through the same rasteriser that drew the reference, into `frames.json`'s own
viewport, and minimise the difference over the parts' transforms.** `tools/` holds
every script.

**The art, measured (`tools/` — `fit.ts` loads it).** `pendulum.png` 745×212, opaque
1..743 × 1..210: a disc of radius 105 centred (106, 106), a bar 38 tall on the same
centre line, a disc of radius 55 centred (689, 106). `square.png` 159×159, opaque
1..157 both ways, with a red glyph whose centroid sits 13.71 units above the image
centre and 0.35 right of it. **The glyph is what makes this shot measurable**: it is
interior detail on the only part that rotates through a 90°-symmetric silhouette, so
the block's rotation is decidable rather than ambiguous mod 90 — §8's second trap
("a symmetric shape hides a sign error") has no purchase here.

**One knob per part per frame, and the frames pin them.** Pivot `(Px, Py)` shared by
both shots; per frame the bar's bone rotation `rho`, the block's centre `(Bx, By)`
and its rotation `phi`. Full-range scans first (`phi` over 0..360 at 6°, `rho` over
−10..370 at 3°, the block's centre seeded from the glyph's own centroid), then
coordinate descent down to 0.003°; globals and per-frame poses alternated four
rounds. Mean whole-frame error **0.2501** over all 86 frames, flat (0.185..0.282).

**Cross-checks, because a single shot cannot tell you the estimator is wrong (§8).**
Both shots' `f0000` is the same picture and both fitted to the same setup pose to
within the fit's own step; `rho` came out **0.11°** at `f0000` and **90°** at rest in
both shots independently — the art's own horizontal and vertical. Region scales came
out `1.00000` and `1.00000` against the PNGs' own pixel sizes. A later global fit that
freed the attachment offsets, an attachment rotation and both scales moved the number
from 0.2535 to 0.2511 and moved no offset by more than 0.08 units, which is what says
the two-rigid-region model is the right model rather than a lucky one.

**The block's height is not a free parameter, and that is the check that the fit is
physical.** In `light` the block rises 13.5 units while tilted 11.17°; a 159-unit
square pivoting on a bottom corner by 11.17° lifts its centre by
`111·(cos(33.83°) − cos 45°)` = **13.7 units**. In `heavy` the block's centre hovers
8–10 units above its own rest height across f24..f28 while `phi` is still 7° off
flat — the same arithmetic, and it settles to the rest height exactly as `phi`
reaches −180°. Neither was fitted for.

## 3 — what the adjacent-pair test actually asks for

`check`'s `per-frame` column is the clause this attempt exists for, so it was read out
of `src/check.ts` (allowed list item 7) rather than guessed. `disagrees(a, b)` is
`a > 0 && (b === 0 || (a > 4b && a − b > 24))` over **whole-frame** pixels that move
by more than 8 on a channel. Two consequences decide the whole run:

- **An exactly still reference pair must be answered by an exactly still candidate
  pair, and vice versa.** `b === 0` with `a > 0` is a disagreement with no tolerance
  at all, in both directions.
- **Everywhere else the band is wide**: roughly `ref/4` to `4·ref`, so the interesting
  constraint is not fidelity, it is the pairs where the reference barely moves.

Measured off the frames, the reference's own adjacent-pair change (`tools/dcheck.ts`):

```
heavy  1:  40   2: 520   3: 815  …   9:1954  10:1964  …  47:  63  …
      56: 109  57: 265  58: 229  59: 150  60:  62  61:   1  62:0  63:0  64:0
light  1: 988   2:1479   3:1509   4:1872  …  17: 133  18: 374  19:   0  20:   0
```

⇒ four pairs are the whole problem. `heavy` 62/63/64 and `light` 19/20 must be **0**;
`heavy` 61 must be **1..25** — a pair the reference moves *one pixel* on, which no MAE
and no drift figure can see and which a candidate that simply stops is wrong about.

**So the tail was calibrated rather than fitted.** Near vertical, with the block
parked, `Δrho → Δpx` measures `0.005°→1  0.01°→18  0.02°→30  0.05°→80  0.12°→174
0.3°→295  1.2°→525`. Reading the reference's own tail through that inverse says the
bar is still moving by about a hundredth of a degree between f60 and f61 and by
nothing at all after it — and the independent per-frame fit could not have told me,
because 0.01° is 0.012 px at the ball, two orders below the fit's own step. The
holds themselves came off the frames directly: `heavy`'s block is bit-identical from
f29 and `light`'s from f6 (the glyph's centroid does not move), and both bars are
still over their last frames.

## Loop

### 1 — build (tol 0.30 px, 8 easings, absolute tolerance only)

`bun cli.ts build --rig … --motion … --images examples/3-timing-and-spacing/images
--out … --profile spine` → green, 17 PASS, 0 FAIL, 3 SKIP, 14 PROF.

`check`: **both sets took `frames.json`'s own box** (rms 0.13 and 0.11 px), which is
the framing this whole exercise wanted — heavy MAE 6.67, light 6.25, worst drift
0.7 px. `per-frame`: **3 of 64 pairs disagree in `heavy`** —

```
f0001  yours moved 259 px where the reference moved 40    (band 10..160)
f0060  yours moved 260 px where the reference moved 62    (band 16..248)
f0061  yours moved   0 px where the reference moved  1    (band  1..25)
```

`light` clean at 20/20. → Two different defects, and only the frames separate them.

### 2 — the tail, at the pose level (no build)

f0060 and f0061 are the *poses*, not the reduction: an independently fitted series
wanders by ±0.3° in a tail whose real motion is ±0.03°, so it moves 260 px where the
reference moves 62 and then stops dead where the reference still has a pixel left.
Fixed by optimising `rho[51..60]` against rendered error **plus** a penalty for
leaving each pair's band (`tools/tail_opt.ts`); f61..f64 stay pinned to one value so
their pairs are exactly 0 by construction. Every tail pair in band afterwards, and
the rest value settled at **89.776°**.

### 3 — the reduction, first repair: a relative floor on the tolerance

f0001 is the *key reduction*. The planner had spanned f0→f2 legally: its deviation at
f1 was 0.098 px against a 0.30 px tolerance — and the reference's whole move across
that pair is **0.109 px**. An absolute tolerance says "close enough"; the adjacent-pair
test compares *changes*, and a 0.098 px error on a 0.109 px move is a 90 % error.

⇒ a span may not deviate by more than **the smallest single-frame move inside it**,
which is one line in `planKeys` and is the general form of §10.3's "a tolerance is not
a hold": a tolerance is not a *slow span* either. Build: heavy 6.56, **1 of 64**
(f0001, 246 vs 40) — better and still wrong, because the floor is a heuristic and the
column is a measurement.

### 4 — the reduction, second repair: close the loop on the frames

So the loop was closed instead of tuned. After planning, sample the planned curves at
12 fps, render them, compare every adjacent pair against the reference's own, and
**force the offending frames as keys and re-plan** — repeat until no pair is out of
band (`tools/author2.ts`). `heavy` needed one extra round (it forced f0 and f1);
`light` needed none.

Build → `check`: **heavy all 64 adjacent pairs agree, light all 20.** heavy MAE 6.53,
light 6.31.

### 5–7 — the key tolerance, a point picked deliberately (§10.3)

§10.3's arithmetic first: the median second difference of the fitted `rho` series is
1.07 px in `heavy` and 1.40 px in `light`, so **skipping one sample costs more than
any tolerance worth declaring** — the key density here is a fact about the subject,
not a choice. What the trade buys is accuracy:

| tol at the end of the swing | keys | heavy MAE | light MAE | pairs |
| --- | ---: | ---: | ---: | --- |
| 0.30 px | 109 | 6.53 | 6.31 | all agree |
| **0.15 px** | **118** | **6.13** | **6.01** | all agree |
| 0.08 px | 128 | 6.05 | 5.94 | all agree |

0.15 px is the knee and is what shipped.

### 8 — separate `translatex`/`translatey`: measured, rejected

The block flies an arc, so its axes plausibly want different curves (§4.4). Built:
133 keys, heavy **6.25**, light **6.01** — *worse* on one shot and equal on the other,
for two extra timelines. ⇒ §10.3's editor default (both axes on one key) is kept, and
kept because it measured better rather than because it is the default.

### 9–12 — the easings table size

| easings | keys | heavy | light |
| ---: | ---: | ---: | ---: |
| 4 | 120 | 6.14 | 6.05 |
| **8** | **118** | **6.13** | **6.01** |
| 12 | 104 | 6.22 | 6.05 |
| 16 | 106 | 6.12 | 6.03 |

0.10 MAE across the whole sweep, which is inside this objective's own scatter: **the
frames do not decide the table size.** 8 kept — §10.4's own worked figure, and the
best `light` reading. Recorded as a choice, not a measurement.

### 13 — the deliverable, built where it lands

Rebuilt with `--out bench/runs/2026-08-26-rung3-1/spine`, then `explain` read: three
bones, two slots in the intended draw order, both setup attachments as intended.

## Result

`bun cli.ts bench 3 --candidate bench/runs/2026-08-26-rung3-1/spine --frames
bench/reference/3-timing-and-spacing --json bench.json`

**⚠️ `bench` ran twice, and the first run is void.** The first invocation was pointed
at a `spine/` directory I had *copied* rather than built in place, so the atlas's
relative page paths no longer resolved and `A17_ATLAS_PAGE_FILES_EXIST` failed twice —
stage 1 red, and by the brief's own rule a candidate that is not valid Spine 4.3 has
cleared nothing. It is an artifact-placement mistake, not a spec one. **No spec byte
changed between the two invocations**, and no measure from either was fed back into
the specs: turn 13 above is the last edit and it predates both. The recorded report is
the second invocation; `bench.json` carries no gate string.

```
  ── summary ──
  validate   green  (profile spine)
  ess        bones=0.729  slots=0.929  attachments=1.000  constraints=1.000  animations=0.823  events=1.000
             bones 0.729 (name-matched) · 1.000 (name-agnostic)   slots 0.929 (name-matched) · 1.000 (name-agnostic)
  framing    one per set (2); one shared box leaves x0.999634, rms 0.10px
  heavy      MAE mean=6.13 worst=7.51 ref=6.13  over 65 frame(s)  worst slot drift 0.7px, attributed in 65, pendulum carries 79%
  light      MAE mean=6.01 worst=7.56 ref=6.01  over 21 frame(s)  worst slot drift 0.5px, attributed in 21, pendulum carries 78%
```

`per-frame`: **heavy all 64 adjacent pairs agree · light all 20 agree.**
No `sheet` line on either set, and that is not an omission — see the README.

## Notes

**What could not be told without compiling.** Two things, and both are the relation
between frames rather than any frame. The **one-pixel pair** at `heavy` f60→f61: no
pose fit can resolve a hundredth of a degree, and nothing but the adjacent-pair
column says it is there. And the **reduction's own error budget**: the specs that
produced 259 px where the reference moved 40 were, at every keyframe, correct — §8's
"a value is easier to get right than a curve", arriving as a span rather than a
handle.

**What the guide should have said, and did not.** Two entries, both folded into
`docs/AUTHORING.md` by this run's PR:

1. **The reference frames are rendered through the example's own packed atlas, and
   this rung's is packed at `scale: 0.5`.** A candidate built from the loose PNGs
   samples a texture at twice that resolution, so its edges resample differently and
   it carries an MAE floor it cannot author away. Measured on the identical skeleton:
   **6.13 / 6.01 with the candidate's own atlas against 2.25 / 2.30 with the supplied
   one** — about two thirds of the figure, and none of it the animation. Nothing in
   `check`'s report attributes it, and a run that does not know it will spend its
   budget hunting keys.
2. **A key reducer needs a relative floor, not only an absolute pixel tolerance** —
   turn 3 above, with the measurement. §10.3 already says a tolerance is not a hold;
   it does not say a tolerance is not a slow span, and the failure mode is the same
   column.

**Where the guide was right and it cost a loop not to check first.** §10.3's
second-difference arithmetic and §10.4's two-pass rule were both applied from the
start and both held. The one thing done in the wrong order was `bench`: building the
artifact where it would be committed is a one-line difference and it cost an invalid
finish line.
