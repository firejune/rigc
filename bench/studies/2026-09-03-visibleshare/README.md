# `visibleShare` against the fit it was measured at

- date: 2026-09-03
- issue: [#323](https://github.com/firejune/rigc/issues/323)
- subject: `chainfit`'s `visibleShare` / `visibleShareAtFit` — [`src/chainfit.ts`](../../../src/chainfit.ts)
- corpus: all **147** committed `ess` frames of [`bench/reference/spineboy`](../../reference/spineboy/ess), 16 sets
- candidate: the 2026-09-03 run 2's committed [`spine/skeleton.json`](../../runs/2026-09-03-spineboy-2/spine/skeleton.json)
- harness: [`tools/vsprobe.ts`](tools/vsprobe.ts) (measure) + [`tools/vsreport.ts`](tools/vsreport.ts) (fold)
- evidence: [`evidence/`](evidence) — every figure below is printed by `vsreport.ts`

## The question

`visibleShare` is quoted as a summary statistic in two places: issue #284's landing
table (*"mean visible share 24.8 % vs floor 25 %"*, *"reads rear-bracer at 0.1 %
visible share"*) and [`docs/LADDER.md`](../../../docs/LADDER.md)'s run-2 agreement
table, which files 1,046 readings into five visibility bands and reads the median
`|mine − hinge|` of each. [PR #322](https://github.com/firejune/rigc/pull/322) then
saw the quantity move **0.36 → 0.89** on one frame when the objective under it moved
by **0.0008** of residual — so #323 asked whether a median of it is a number yet.

⭐ **And there is a third consumer, which is the one that makes this
clause-adjacent rather than merely untidy.** Gate v2.4's kind-5 visibility ceiling
has exactly one implementation —
[`readdown.ts`](../../runs/2026-09-03-spineboy-2/tools/readdown.ts), which produced
that run's [`g2-read-down.txt`](../../runs/2026-09-03-spineboy-2/evidence/g2-read-down.txt)
— and it states its convention outright: *"the ceiling is `chainfit`'s
`visibleShare` … taken as the MAXIMUM over all 147 committed frames"*, with the bar
*"the smallest ceiling among the slots `check` DOES attribute"*. Two extreme-order
statistics of this quantity, and a maximum over 147 frames is exactly the statistic
an upward outlier moves.

## What was perturbed, and why that knob

`chainfit` is handed a `rigc pose` report and hangs every chain off the placements
in it. An objective change moves those placements and nothing else, which is
precisely what #322 did by accident. So the knob is **the anchor report**: every
placement in it is jittered, and the report is then kept **self-consistent** — the
harness re-measures each moved placement's residual and `unexplained` with `pose`'s
own objective and writes the moved numbers back.

That last part is not decoration. Two live channels would otherwise be frozen
artificially:

- `anchorEntries`' **eligibility** test (residual ≤ 0.16, `unexplained` ≤ 0.45), and
- the **per-bone tie-break**, which gives a bone to the eligible part on it with the
  *lowest reported residual*. On this rig `head`, `goggles` and all three `mouth`
  attachments ride one bone, so a sub-band residual move can change which part
  anchors the head.

Both are reported separately below as the *discrete* channels.

### Two bases, because the figures at stake are not all on one

| basis | anchor set | the figure it speaks to |
| --- | --- | --- |
| `declared` | run 2's declared set — `torso`, `head`, `goggles`, `mouth-smile`/`-grind`/`-oooo` | **the quoted medians.** #284's table and LADDER's bands both come out of that run's pipeline |
| `pose-criterion` | the raw `pose` report, so `chainfit` anchors on whatever clears its own §12.2 criterion | **#322's observation.** That spot check ran the internal anchor pass, so its *anchor-selection rule* is this one and not the declared set |

One jittered report serves both, so the two are compared at the same perturbation
rather than at two draws of one.

⚠️ **Matching the rule is not matching the basis.** `rear-bracer` comes back a
`chain` part on *both* of this study's bases, because this study's pinned-scale
`pose` pass calls it `ambiguous` with three alternates; in #306's spot check it was
an eligible ANCHOR. So this study reproduces the *phenomenon* on a stated basis and
does not re-derive that spot check's digits — see the `rear-bracer` reading below,
which says so with both numbers.

### The band is measured, not assumed

`src/pose.ts`'s level-0 polish terminates when its pattern-search step falls below
`floor = { translate: 0.05, rotate: 0.1, scale: 0.001 }`. **Below that the fitter
does not look**, so it cannot distinguish its own answer from any placement inside
that box — that is the convergence band, stated in the code rather than inferred.

[`evidence/band.txt`](evidence/band.txt) then *prices* the box in residual, one axis
at a time off each anchor's own reported placement, both signs, 882 probes per
magnitude:

| axis | at the polish floor | median Δresidual | max Δresidual |
| --- | --- | ---: | ---: |
| translation | 0.05 px | 0.000087 | 0.000686 |
| rotation | 0.1° | 0.000031 | 0.000199 |
| scale | 0.1 % | 0.000103 | 0.000710 |

⇒ **The convergence band's own width is worth the same order of residual as #322's
accidental 0.0008.** That is the connection the study needs: perturbing inside the
band is not a smaller experiment than #322's, it is the same size of experiment.

The ladder keeps three wider rungs so a flat result at the floor cannot pass for a
measurement — `polish-floor-2x` (a pattern search that stopped at step `d` sits
within about one step of its optimum), `pr322-scale` (sized from the sweep above so
the induced residual change brackets 0.0008), `readback-floor` (PS01/PS02's worst
known-answer readback, re-baselined in #306: 0.16 px / 0.27° / 3.1 %) and
`control-1px`, which is outside every band on purpose.

## The reading

### The headline figure, and it is a tail figure

Declared basis, `polish-floor` — the fitter's own convergence band. 18,048 paired
readings (147 frames × 8 replicates × the parts with a placement in both):

| | |
| --- | ---: |
| median anchor Δresidual the jitter induced | **0.000288** |
| median \|Δ`visibleShare`\| | **0.0005** |
| p90 | 0.0297 |
| **p99** | **0.5592** |
| max | 0.9401 |
| **share swing per 0.001 residual, at the median** | **0.0017** |
| **share swing per 0.001 residual, at p99** | **1.94** |

🚨 **The two slope figures differ by three orders of magnitude, and that is the
finding.** A single number for this quantity's sensitivity does not exist: at the
median the share is exact to four decimals, and at the 99th percentile 0.001 of
residual buys the whole range of the quantity.

### The shape is bimodal, not a noise floor

| threshold on \|Δshare\| | share of the 18,048 readings |
| --- | ---: |
| > 0.01 | 15.08 % |
| > 0.05 | 7.88 % |
| > 0.10 | **5.71 %** |
| > 0.25 | 3.34 % |
| > 0.50 | **1.29 %** |

A reading is either essentially unmoved or in a different place entirely; the middle
is thinly populated. That shape is why a **median** of the quantity looks safe — 95 %
of the mass never moves, so most rows are steady and the unsteady ones do not
announce themselves — while a **mean** is the worst of the three choices, because the
1.29 % that jump by more than 0.50 land in it undiluted. It is also why the
**maximum** the kind-5 ceiling reads turns out to be the steadiest of the three: the
parts whose readings jump are mostly already saturated at 1.

### #322's observation reproduces, on the basis it was made on

The `pose-criterion` basis, `rear-bracer`, `idle/f0001`: base share **0.8912**, and
over the eight replicates inside the convergence band the swing is **0.8686** — the
part reads anywhere from 0.02 to 0.89 at fits `pose` cannot tell apart. Six frames
show a rear-bracer swing above 0.30 on that basis.

⚠️ **This is not a re-derivation of #306's own four digits and does not claim to
be.** That spot check ran its own pipeline: on `idle/f0000` it read `rear-bracer`'s
anchor residual at **0.1564** where this study's pinned-scale `pose` pass reads
**0.21556** with `ambiguous: true` and three alternates — so the part is an eligible
anchor there and a `chain` answer here, and this study's `idle/f0000` base share is
0.0199 rather than 0.36. Same part, same corpus, same order of swing, **different
basis** — stated rather than merged.

### Which branch of #323 step 2 fires — the attribution says ②

Of the 1,030 cells that swing by more than 0.10 at the convergence band:

| what moved | cells | share |
| --- | ---: | ---: |
| the part's own placement travelled > 1 px or turned > 5° (`AMBIGUITY_HINGE_DEG`) | 649 | **63.0 %** |
| the part stood still (≤ 0.25 px, ≤ 1°) but something else on the frame relocated | 326 | 31.6 % |
| **the part stood still and nothing else on the frame relocated** | **5** | **0.5 %** |
| neither test — reported rather than assigned | 50 | 4.9 % |

⇒ **Branch ① is falsified rather than merely not chosen.** The class a definitional
edge would live in — a share that moves while every placement on the frame stands
still — holds **5 of 1,030 cells**. In the 326-cell middle class the median
*other* part moved **42.6 px** on a 384 × 367 picture: an occluder landed somewhere
else, which is a fit moving and not a mask mis-defined. The swing is the instrument
faithfully reporting a bistable fit, and no tie-breaking or refresh-order rule
reaches it. The two remaining definitional levers are checked below and both fail:
`visibleShareAtFit` is less steady, and `--passes` makes it worse.

📌 **And the obvious milder definitional fix is also falsified.** `visibleShareAtFit`
— the field that is measured where the answer landed, in one coherent
reverse-draw-order sweep, rather than on the set frozen at each bone's seed — is
**not** the steadier quantity. At the same rung its p99 is **0.6588** against
`visibleShare`'s 0.5592 and its max 0.9749 against 0.9401. So "quote the coherent
field instead" is not available: both fields are downstream of the same fit.

### `--passes` does not cure it — it amplifies it, monotonically

The one definitional lever the instrument already has is `--passes`: the visible set
is frozen at each bone's *seed*, and pass *n*+1 seeds on pass *n*'s own answer, so
more passes are supposed to converge the set onto the fit. If the swing were an
artifact of measuring the set somewhere the answer is not, it would shrink. The same
perturbation, the same seed, at `--passes` 1, 2 and 4
([`evidence/passes.txt`](evidence/passes.txt), 6 replicates, 13,536 paired readings
per row):

| basis | `--passes` | p99 \|Δshare\| | readings > 0.10 |
| --- | ---: | ---: | ---: |
| declared | 1 | 0.0715 | **0.78 %** |
| declared | **2** (default) | 0.5495 | **5.45 %** |
| declared | 4 | 0.8138 | **15.17 %** |
| pose-criterion | 1 | 0.0349 | 0.51 % |
| pose-criterion | 2 | 0.1923 | 1.73 % |
| pose-criterion | 4 | 0.4686 | 4.13 % |

🚨 **It goes the wrong way, on both bases, monotonically — a factor of ~20 from one
pass to four.** The mechanism is the re-seeding itself: each pass starts the hinge
search from the last pass's answer, so two nearby fits that fall into different
basins on pass 1 are *further* apart on pass 2 and further still on pass 4. The
passes loop compounds a divergence rather than contracting it.

⚠️ **What this does and does not say.** It says the *fit-sensitivity of the reported
share* rises with `--passes`. It does **not** say `--passes` fails at the job
§12.3 gives it — reducing the seed-versus-answer drift within one run — which is a
different quantity this sweep did not isolate (`base drift` median is 0.0000 at
every pass count here). Both can be true: more passes can bring one run's set and
answer together while making the answer itself less determined by the input.

⇒ Recorded as a follow-up rather than acted on: a share reported at a **fit-independent**
placement — the rig's own prediction, or a stated covering placement — would be a
different and steadier quantity, and that is a design decision rather than a docs
edit.

### Is a median of it a number? — for eleven of eighteen parts, yes

Each replicate index is one whole-corpus reading of the instrument at a fit inside
the band, so each gives its own corpus median. How far that median itself travels:

| part | base median | min over replicates | max | **spread** |
| --- | ---: | ---: | ---: | ---: |
| `rear-foot` | 0.3599 | 0.3055 | 0.5228 | **0.2173** |
| `front-thigh` | 0.4338 | 0.2957 | 0.4876 | **0.1919** |
| `front-bracer` | 0.7274 | 0.5561 | 0.7282 | **0.1721** |
| `torso` | 0.4455 | 0.3728 | 0.4517 | 0.0789 |
| `rear-shin` | 0.2476 | 0.2605 | 0.2984 | 0.0379 |
| `neck` | 0.4586 | 0.4450 | 0.4656 | 0.0206 |
| `front-upper-arm` | 0.7447 | 0.7328 | 0.7468 | 0.0140 |
| `front-shin`, `gun`, `rear-bracer`, `head`, `eye`, `goggles` | — | — | — | ≤ 0.0034 |
| `rear-thigh`, `rear-upper-arm`, `front-foot`, `mouth-smile`, `front-fist-closed` | — | — | — | **0.0000** (saturated at 0 or 1) |

⇒ **The answer is per part and it is not a flat "no".** For **eleven of the
eighteen** the corpus median moves by less than **0.004** across the whole band.
For **three** it moves by **17 to 22 points** — a `rear-foot` median share of 0.31
and one of 0.52 are the same instrument on the same corpus at two fits it cannot
distinguish. ⚠️ **And the split is not predictable from the row**: `front-bracer`
sits at a comfortable 0.73 median and moves 17 points, while `rear-bracer` sits at
a 0.015 sliver and moves 0.0005. So a reader cannot tell which group a row is in by
looking at it, which is exactly why the caution has to be attached to the *field*
rather than to the rows that happen to look risky.

### The consumer that reads the bands — 9 % of readings could be filed elsewhere

`LADDER.md`'s run-2 agreement table files 1,046 readings into five visibility bands
and reads a median disagreement per band. At the convergence band, **8.98 %** of
readings change which band they belong to, and it is not uniform:

| from band | migrates |
| --- | ---: |
| < 10 % | 5.1 % |
| **10–25 %** | **25.6 %** |
| 25–50 % | 18.3 % |
| 50–75 % | 11.6 % |
| ≥ 75 % | 2.9 % |

⭐ **This does not overturn that record's conclusion; it explains it.** Band
assignment noise attenuates any real relationship toward flat, so *"the medians are
flat and non-monotonic"* is consistent both with there being no relationship and
with there being one that this banding cannot resolve. The record's operational
claim — *"the instrument's own uncertainty signal does not separate a reading the
composite will accept from one it will not"* — survives either way, and reading it
as evidence that visibility is irrelevant to agreement would be reading more than
it measured.

### The clause-adjacent statistic survives — on the margin, not on the method

The kind-5 ceiling is a **maximum over 147 frames**, and a maximum of a saturating
quantity is far steadier than its median. Recomputed on each replicate at
`--min-visible 0.05` (the flag the read-down's own source report carries):

| | base | over 8 replicates |
| --- | ---: | --- |
| the bar (`head`'s ceiling) | 50.2 % | **50.2 – 50.3 %**, set by `head` on all nine fits |
| `rear-upper-arm`'s ceiling — the one that carries the read-down | 37.9 % | 37.8 – 38.1 % |
| `eye`'s ceiling | 0.6 % | 0.5 – 0.6 % |
| **the slots that read down** | eye, rear-upper-arm | **identical on all nine fits** |

✅ **So the verdict in that record is not disturbed, and this study says so plainly.**

📌 Incidentally the base column lands close to that record's own — `head` 50.2 vs
50.3, `rear-upper-arm` 37.9 vs 38.1, `front-thigh` 84.1 vs 84.1, `torso` 75.6 vs
75.8, `neck` 66.9 vs 67.0 — despite the different candidate and pipeline. That is
**agreement, not re-derivation**, and it is reported as a coincidence worth knowing
rather than as a reproduction: `gun` reads 98.8 here against 99.2 there, and nothing
in this study licenses substituting one column for the other.

⚠️ **But it was the margin that saved it, not the statistic.** `front-shin`'s
ceiling spans **78.8 – 100.0 %** across the same replicates — a **21.2-point**
spread on an *attributed* slot. It does not set the bar only because `head` sits
lower. On a corpus without `head`, that bar would have been unstable by 21 points
against a read-down margin of 12. ⇒ **A verdict reaching this ground should quote
the ceiling's spread over the corpus beside its value**, not the value alone.

### The discrete channels — a sub-band move can flip a refusal

At the convergence band, per 1,176 replicates (declared basis):

| channel | rate |
| --- | ---: |
| the anchor set `chainfit` chose changed | 4 (0.3 %) |
| an anchor's eligibility flipped across the 0.16 / 0.45 criterion | 4 (0.3 %) |
| **a part's `refusal` reason moved** | **1,061 / 21,168 readings (5.01 %)** |
| readings that had no placement in the base and did in a replicate | 52 |

📌 The per-bone tie-break — `head`, `goggles` and all three `mouth` attachments ride
one bone, so the lowest reported residual decides which anchors it — is live but
quiet inside the convergence band (0.3 %). It is **not** quiet outside it: on the
`pose-criterion` basis it flips on **16.7 %** of replicates at `pr322-scale` and
**83.5 %** at `control-1px`.

### Verdict

**Branch ② of #323 step 2: the quantity is inherently fit-relative and the repair
is in the docs.** It is not a definitional edge (0.5 % of large swings), and the
coherent field is not steadier, so there is nothing in `src/` to fix that would
make a median of this comparable across fits. What the docs now say, at every site
that quotes it:

- `visibleShare` is a **per-frame diagnostic**, read beside the residual it was
  computed on. That use is unaffected — it is exactly what the field was added for.
- **A median or mean of it is not comparable across fits.** Where one is quoted, the
  fit it was measured at is part of the figure.
- A **maximum** of it over a corpus is the steadier statistic and is what the kind-5
  ceiling reads — and a verdict quoting it should carry its spread.
- `--passes` buys mask-to-answer convergence and **costs** determinacy, with the
  measured ladder beside the flag.

### What this study deliberately does not do

Three things it found and did not act on, because each is a decision rather than a
docs edit:

1. **A `caveats` line in the report itself.** The report's own `caveats` array is
   where a consumer reading JSON would meet this, and it is a one-line addition to
   `src/chainfit.ts`. Left out on purpose: `chainfit`'s `src` is being extended
   concurrently ([#326](https://github.com/firejune/rigc/issues/326)), and a
   one-line string is not worth a merge race.
2. **A fit-independent share.** The share reported at a *stated covering placement*
   — the rig's own prediction rather than the fit — would be a different and
   steadier quantity, and it is what gate v2.4's kind-5 clause already asks for in
   as many words (*"an instrument-side **geometric** fact"* that bounds *"what the
   instrument could read of that slot rather than … what it happened to read of
   this candidate's placement"*). Adding it is a surface change.
3. **Anything in `GATE.md`.** The clause text is not moved and does not need to be:
   the ceiling verdict resting on it is re-measured as intact, and the one
   recommendation — quote the spread — is a drafting matter for whoever next writes
   a verdict on that ground.

## What it does not measure

- **One candidate, one corpus, one figure.** Everything here is the spineboy `ess`
  corpus read through run 2's committed candidate. The *mechanism* — a share whose
  numerator is stamped from other parts' fitted placements — is structural and
  applies to any dense figure; the magnitudes are this corpus's.
- **`--min-visible 0` for the ladder, `0.05` for the ceiling table.** The flag is
  not inert: under the floor a bone gets one *unmasked* look before its visible set
  is frozen, so the flag changes the fit and not only which rows are refused. The
  ladder takes `0` because a distribution of a quantity cannot be read off rows the
  instrument declined to print, and because it is the setting #306's spot check
  used; [`evidence/ceiling.txt`](evidence/ceiling.txt) takes `0.05` to match the
  flag the read-down's own source report carries.
- **The attribution half of the kind-5 clause is taken, not re-derived.** Which
  slots `check` attributes somewhere comes from run 2's frozen
  `g2-read-down.txt`. Exactly one of the clause's two inputs moves in this study.
- **The ceiling table's absolute numbers are not a re-derivation of that record's.**
  It read a probe candidate (`fit/chainfit.json` names `/tmp/sb2/probe`) through its
  own pipeline; this reads the committed `spine/skeleton.json`. What transfers is
  the *spread* of the statistic, which is a fact about the quantity.
- **The objective used to re-measure a moved placement is a hand copy** of
  `src/pose.ts`'s own `measure`, which is not exported. It is verified rather than
  trusted — see [`evidence/controls.txt`](evidence/controls.txt) — and the perturbed
  residual is written back as the *delta* the move induced, never as the copy's
  absolute, so the copy's own offset cannot reach an eligibility test.

## Frozen records this study does not touch

`docs/LADDER.md`'s run-2 adjudication and `bench/runs/2026-09-03-spineboy-2/` are
records: they re-derive their figures from their own evidence files, which name
their own toolchain, and they are read as of their own date. This study states its
finding from its own directory and leaves them alone. What it changes is the **live**
surface — `docs/AUTHORING.md` §12, which is the guide a reader consumes the field
from.
