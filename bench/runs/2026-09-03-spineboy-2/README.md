# spineboy — 2026-09-03, attempt 2, from zero, with `rigc chainfit` in the toolbox

- date:      2026-09-03
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK, fresh session
- brief:     [`bench/briefs/spineboy.md`](../../briefs/spineboy.md) **revision 4**, 2026-08-27, third-party verified ×3
- guide:     [AUTHORING.md](../../../docs/AUTHORING.md) — §10 in hand, and §12 (`chainfit`);
             [MOTION.md](../../../docs/MOTION.md); [GATE.md](../../../docs/GATE.md) (the clause statements).
             ⚠️ **Not read in full** — see [`LOOP.md`](LOOP.md) §3.6, which records what that cost
- profile:   spine
- reference: **not read.** No `examples/*/export/*.json`, no `bench/transcriptions/`, no
             `docs/LADDER.md`, no `docs/SPEC_COVERAGE.md`, no `src/ladder.ts` gate strings, no
             `bench/render_reference.ts`, no git history. Two disclosures, both recorded:
             one collision with the launch prompt ([`LOOP.md`](LOOP.md) §1) and `bench`'s own
             console `gates` line at the finish line (*The disclosures* below)
- inherited: **nothing.** From-zero: no prior attempt's rig spec, motion spec, harness or
             intermediate store was opened, and protocol item 10 does not apply
- skeleton:  **`ess` only.** The rung clears on `ess` alone and `pro` is the stretch figure;
             this run built one candidate and reads only the `ess` line
- bench:     run **once**, after the last edit. **Not bench-assisted** — and one consequence of
             holding that line is recorded under *What is left for the adjudicator*
- wall clock: **3 h 20 min**, from the first stored artefact (10:44) to `bench.json` (14:04),
             on a machine also running other work. **16 builds** (counted from [`LOOP.md`](LOOP.md))

## Why this run exists

Issue [#291](https://github.com/firejune/rigc/issues/291): a second from-zero attempt at the
same brief, under the same protocol, with **exactly one change in the toolbox** — `rigc
chainfit` now exists. The run prices the instrument.

⚠️ **The claim shape is "where a fresh attempt lands with `chainfit` in the toolbox", not
"`chainfit` = X px".** A fresh attempt carries attempt-to-attempt variance — a different rig,
a different fitter, a different set of authoring decisions — so nothing here is a controlled
subtraction against the recorded series (from-zero worsts 19.57 → 9.33; the graduation series
ended 5.55). What *is* a measurement is the per-part trail below.

## The inputs

The brief; `bench/reference/spineboy/ess/` — 8 animations, **132 frames at 12 fps** plus 8
sheet sets carrying **15 committed stills** at 30 fps, **147 committed frames** in all — and
its `frames.json`; the art in `examples/spineboy/images/` (40 PNGs, fetched, not
redistributed here); this repository's `src/`; and the CLI.

🚫 **`examples/spineboy/export/spineboy.atlas` was declined** as an authoring input —
allowed-list item 4 offers it and says a run that does not need it should say so. rigc emits a
29-page one-part-per-page atlas from the loose PNGs. It was opened once at the very end as
`--texture-from`, which is a named diagnostic and not the record.

## What was built

One skeleton — **16 bones, 21 slots, 29 attachments**, no constraints, no meshes, no events,
no draw-order timeline — and **8 animations carrying 1,633 keys over 123 timelines and 7
named easings**. `spineboy-ess.rig.json` and `spineboy-ess.motion.json` are the two authored
files; [`tools/`](tools/) is the harness that produced them and
[`tools/rebuild.sh`](tools/rebuild.sh) rebuilds the artifact from a clone.

```
root                                                      never keyed
└─ torso                  slot: torso                     translate + rotate
   ├─ head                slots: neck, head, eye, goggles, mouth
   ├─ rear-upper-arm ─ rear-bracer ─ gun ─ muzzle          slots: …, gun, muzzle-ring, muzzle, muzzle-glow
   ├─ front-upper-arm ─ front-bracer ─ front-fist
   ├─ rear-thigh ─ rear-shin ─ rear-foot
   └─ front-thigh ─ front-shin ─ front-foot
```

**Draw order** (index 0 furthest back — the slots array *is* the setup order, R4):
`rear-foot`, `rear-shin`, `rear-thigh`, `rear-upper-arm`, `rear-bracer`, `gun`,
`muzzle-ring`, `muzzle`, `muzzle-glow`, `neck`, `torso`, `front-thigh`, `front-shin`,
`front-foot`, `head`, `eye`, `goggles`, `mouth`, `front-upper-arm`, `front-bracer`,
`front-fist`.

Two of those edges are the frames' own, from the brief's *What this brief cannot tell you*:
the near leg in front of the gun, and the near leg in front of the far leg. Every other pair
is one the frames never catch overlapping, and it is ordered far-side-first off the art's own
naming. **No `drawOrder` timeline** — the brief's search for a draw-order *change* came up
empty and §10.2 says a change has exactly one expression, so authoring one would assert
something the frames do not show.

### The decisions worth naming

1. **`torso` is the trunk and everything hangs off it**, rather than a pelvis with the chest
   and the legs as siblings. Chosen for identifiability, not anatomy: `chainfit` recovers a
   bone from an anchor by walking **outward only** (§12.2, "a bone above an anchor does not
   [follow]"), and `torso` is the one part `pose` places confidently on nearly every frame of
   this corpus. Under a pelvis the legs sit above the only reliable anchor and every leg comes
   back `no-anchor` on every frame — measured, not predicted ([`LOOP.md`](LOOP.md) §3.7).
2. **The neck plate rides the `head` bone.** §10.1 asks for one slot per image, which this rig
   gives it; it does not ask for one bone per slot. A separate neck bone is a second rotation
   between the torso and the head, and at 8 × 9 frame pixels the frames cannot separate them.
3. **Three slots hold alternatives, each earned by the shot** — §10.1's "a shared slot is for
   alternatives, not for economy". `muzzle` holds the five numbered flare plates, `front-fist`
   holds closed and open, and `eye` and `mouth` hold theirs because only one of each can be on
   screen. Every other image gets a slot of its own. **G5 reads 0.952 on slots and 0.931 on
   attachments with no deduction taken**, so the structure needed no argument.
4. **`root` is never keyed.** It sits at the world origin, which is the floor — the one line
   the brief measures — and the trunk carries the figure's position. That removes the exact
   rotation gauge §10.3 warns about outright, rather than folding or regularising it.
5. **The candidate is authored in the frames' own world units**, and this is the single
   largest thing the run got right. One art pixel is one world unit, *measured*: with `pose`'s
   `--scale` window opened to 0.10–0.40 the four biggest unoccluded parts return 0.216–0.221
   against the sidecar's 0.222973 px/unit. The trunk's world position is the torso plate's own
   pelvis cap carried through `pose`'s placement on `idle/f0000` into the sidecar's box. ⇒
   **`check` took `frames.json`'s own box on all 16 sets**, so no set pays the fitted
   framing's floor, which §9 measures at 15–25 MAE on a character this size.

## The measures

Generated from [`check.json`](check.json) by [`tools/summary.ts`](tools/summary.ts) into
[`evidence/check-summary.md`](evidence/check-summary.md), so every figure quoted below
reproduces from a stored file rather than from a transcription.

### The clauses, as the author reads them — and this is not a verdict

| clause | reads | evidence |
| --- | --- | --- |
| **G1** validity | **met** — `validate --profile spine`, **0 FAIL** | [`validate.txt`](validate.txt) |
| **G2** worst attributable drift ≤ 6.0 px | **NOT met** — worst **18.98 px**, `rear-shin` in `death` f7. Over 6.0 px on **4 of 16 sets** (`death` 18.98, `death@30fps` 15.27, `jump` 6.89, `idle` 6.44); the other 12 read 1.78–5.65 | [`check.txt`](check.txt) |
| **G2** per-slot limb | **NOT met, and the burden is 170 read-downs** — 170 of the 291 (set, slot) pairs that draw are attributable in no frame of their set. The reason is structural and is below | [`evidence/g2-read-down.txt`](evidence/g2-read-down.txt) |
| **G3** per-frame motion | **NOT met** — `changeDisagreements` **7** (5 in `death`, 2 in `idle`); **no set carries `⚠️ overdraw`**, the worst `drawnRatio` being 1.024. Read **directly** on all seven shots that have adjacent pairs, so the Discharge does not arise; `aim` is a single-pose set and is **out of the clause's scope** (v2.1) rather than an unmet reading | [`check.txt`](check.txt) |
| **G4** shot inventory | **met** — `animations.count` **1.000** (8/8) and `animations.names` **1.000** (8/8); the length limb below | [`bench.txt`](bench.txt) |
| **G5** drawn inventory, name-agnostic | **met** — `slots.count` **0.952** (20/21) and `attachments.count` **0.931** (27/29), both against a 0.85 bar, **with no deduction taken** | [`bench.txt`](bench.txt) |
| **G7** sheet flatness ≤ 3.5 × its own mean | **met on all 7 sheets** — ratios **1.143 to 1.461** against a 3.5 bar. `aim` and `aim@30fps` ship one frame each and no sheet, so both **SKIP** — on §G7's second ground (a single pose) and its first (the set commits every sampled frame) at once. **No sheet was refused by name**, so there is no HOLE | [`evidence/check-summary.md`](evidence/check-summary.md) |
| **G6** the rung | follows from the above on the one skeleton that counts | — |

**G4's length limb** is a tolerance and is not read off `bench`, so the declared durations
are quoted here. Every one is the single multiple of 1/30 s inside the intersection of the two
rates' windows, recomputed from `frames.json`'s own `sampled` counts rather than taken from
the brief's table:

| animation | declared | 12 fps frames | 30 fps frames | loop hint |
| --- | ---: | ---: | ---: | --- |
| `aim` | 0 | 1 | 1 | — |
| `death` | 4.933333 | 60 | 149 | no |
| `hit` | 0.333333 | 5 | 11 | no |
| `idle` | 1.666667 | 21 | 51 | yes |
| `jump` | 1.333333 | 17 | 41 | no |
| `run` | 0.666667 | 9 | 21 | yes |
| `shoot` | 0.400000 | 6 | 13 | yes |
| `walk` | 1.000000 | 13 | 31 | yes |

`bench` reads `animations.duration` **1.000 (8/8)** against the reference at its own "within
one frame" tolerance, which is the second half of the limb; the reference's own eight lengths
are in [`bench.json`](bench.json) for whoever holds it. `loop` is a player hint only and is
not emitted (§4.3); it is written because it is true of the shot, on the brief's returns
column.

### The whole `check` table

[`evidence/check-summary.md`](evidence/check-summary.md) has it per set. The shape of the
drift, which one worst figure hides:

- **499 slot-frame drift readings**, of which **13 (2.6 %) exceed 6.0 px**, 5 exceed 10 px and
  3 exceed 15 px.
- **Every one of those 13 came from the `tmpl` fallback matcher**, at confidences 0.26–0.56
  over search radii of 15–32 px — so they are believed rather than dismissed, and §9.2's
  caveat that the number there is a *confidence* and not a component centroid applies to all
  of them.
- They concentrate on **two parts and one shot**: `front-shin` and `rear-shin` — the near/far
  twins — inside `death`'s fall and slide, where the figure is horizontal and 1 to 4 of 18
  slots are attributable at all.

### G2's per-slot limb, and why it is 170 read-downs and not one

🚨 **`check`'s `component` matcher cannot fire on this corpus at all, and the brief says so
before any build.** The strong matcher needs "your slot [to sit] on a connected component of
the reference frame that is its own size **and holds nothing else you drew**" (§9.2). Measured
here: **143 of the 147 reference frames hold exactly one 8-connected component** of 20 px or
more, and the maximum anywhere is two. The brief states the same fact from the other side —
"under 8-connectivity the frame holds exactly one connected component of 20 px or more — and
so does every one of the other 131 committed `ess` frames bar `shoot/f0004`". One blob holds
all 18 drawn slots, so the first matcher's third condition is unsatisfiable by construction.

⇒ **All 499 drift readings came from the `tmpl` fallback, and 2,156 slot-frames got `none`.**
The median frame attributes **4 of its 18 drawn slots**. Under G2 v2.2's per-slot limb that
makes **170 of 291 (set, slot) pairs** a blank owing an explicit read-down —
[`evidence/g2-read-down.txt`](evidence/g2-read-down.txt) lists them by slot.

⚖️ **And the run's ceiling evidence does not discharge them, which is the finding worth
carrying.** v2.3's first half asks for "a measured ceiling on its attributability ... an
instrument-side geometric fact about the slot's **visible footprint**", calibrated on the
slots the instrument does attribute. This run measured exactly that quantity, on every frame
of every set, from `chainfit`'s `visibleShare` — and it **does not separate the blanks from
the attributed**:

| slot | visible-footprint ceiling | sets it is blank in |
| --- | ---: | ---: |
| `eye` | **0.7 %** | 16/16 |
| `rear-upper-arm` | 38.1 % | 16/16 |
| `head` | 50.3 % | 0/16 — the **calibration bar**, the smallest ceiling among attributed slots |
| `rear-thigh` | 62.4 % | 15/16 |
| `front-thigh` | **84.1 %** | 16/16 |
| `front-upper-arm` | 94.9 % | 15/16 |
| `gun` | **99.2 %** | 16/16 |
| `front-fist`, `front-foot`, `mouth`, `rear-foot`, `rear-shin` | 100 % | 5/16 to 9/16 |

⇒ **A slot 99.2 % visible is attributable nowhere.** The ceiling was the right quantity for the
rung it was written for, where a slot is genuinely mostly off screen; on a character the blanks
come from **the reference merging everything into one connected component**, which a
visible-footprint ceiling cannot see. Only `eye`'s blank is explained by its ceiling — 0.7 %
against a 50.3 % calibration bar — and even there the read-down is **incomplete**: v2.3's
second half wants the slot's placement "pinned by a sweep that does not use the matcher and
that carries a known-answer control", and this run's `eye` placement is a declared **prior**
(concentric with the goggles). 🚫 "A ceiling without half 2 is not a read-down."

⚠️ **And three slots have no ceiling at all.** `muzzle`, `muzzle-glow` and `muzzle-ring` are
`null` in the setup skin, so `chainfit` never saw them — the §12.5 gap this record reports
under *What the guide should have said*. Their blanks in `shoot` are undischarged and
unmeasured.

### The chain rollup — §9.2's work queue, pooled across every set

| chain | worst slot drift | mean drift | MAE in it | sets with any attribution |
| --- | ---: | ---: | ---: | ---: |
| `rear-thigh` | **18.98 px** `rear-shin` (`death` f7) | 3.01 px | 18.96 | 11/16 |
| `front-thigh` | **15.27 px** `front-shin` (`death` f0) | 3.75 px | 20.99 | 13/16 |
| `torso` | 6.89 px `torso` (`jump` f11) | 1.76 px | 18.60 | 13/16 |
| `rear-upper-arm` | 5.21 px `rear-bracer` (`jump` f1) | 5.21 px | 25.50 | **1/16** |
| `head` | 4.73 px `goggles` (`run` f3) | 0.74 px | 11.15 | 16/16 |
| `front-upper-arm` | 4.10 px `front-upper-arm` (`jump` f15) | 0.84 px | 19.97 | 13/16 |

⚠️ **`rear-upper-arm`'s 1/16 is the loud row**, and §9.2 says to read `MAE in it` beside it
rather than the share: the far arm chain carries the worst error per pixel in the rig (25.50)
and is attributable in **one set out of sixteen**. It is not a G2 per-slot blank — every slot
on it is attributable *somewhere* — but it is the chain the next attempt should take.

### The texture floor — `--texture-from`, a named diagnostic and never the record

| | range over the 16 sets |
| --- | --- |
| MAE (the figure of record) | 41.21 – 69.73 |
| texture floor | **5.48 – 7.01** |
| what the texture **explained** on these frames | **2.4 % – 6.0 %** of each figure |
| what the floor says it could **at most** explain | **8.4 % – 16.9 %** of each figure |

⇒ **The texture is not this run's problem.** §9.2 says the two figures "bound rather than
subtract" — `MAE − above` is what the texture explained and `floor` is the most it could ever
explain — so the honest reading is the two rows above and not one of them: the texture
accounts for 2.4–6.0 % of each figure here, and **at least 83 % of every figure is the rig
whatever the resampling did**. Full table:
[`evidence/check-texture-summary.md`](evidence/check-texture-summary.md).

### `bench spineboy` — the `ess` line, which is the one that counts

`bones` **0.717** name-matched · **0.767** name-agnostic · `slots` **0.824** · **0.643**
name-agnostic · `attachments` **0.955** · `constraints` **1.000** · `animations` **0.703** ·
`events` **0.000**. Reported, gating nothing: `key_density` **0.456** and
`keys_per_timeline` **0.366** — both saying the candidate is **over-keyed by 2.2 ×** (1,633
keys against the reference's 744, over the same 10.333 s). The `pro` line is printed by
`bench` from an `ess` candidate and is noise; it is in [`bench.txt`](bench.txt) and is not
read here.

## The chainfit price tag

This is what the run was for. Three separate readings, kept apart because they answer
different questions.

### 1. Availability — what the instrument produced, over 147 frames

[`evidence/chainfit-census.txt`](evidence/chainfit-census.txt), per part. `chainfit` itself
costs **0.18 s a frame**; the `pose` call that feeds it costs **~7 s**, so the instrument is
free and its input is not.

| part | hinges produced | median visible share | the dominant refusal |
| --- | ---: | ---: | --- |
| `front-upper-arm` | 125 / 147 | 73.3 % | `no-anchor`×21 |
| `front-shin` | 93 | 56.7 % | `no-match`×33 |
| `rear-shin` | 92 | 27.8 % | `no-match`×28 |
| `front-thigh` | 76 | 20.9 % | `occluded`×23 |
| `front-bracer` | 61 | 74.0 % | `no-match`×65 |
| `rear-foot` | 57 | 28.1 % | `no-match`×50 |
| `rear-thigh` | 30 | 0.0 % | `occluded`×96 |
| `front-foot` | 26 | 100 % | `no-match`×100 |
| `rear-upper-arm` | 26 | 0.0 % | `occluded`×100 |
| `rear-bracer` | 16 | 1.6 % | `occluded`×100 |
| `front-fist-closed` | 6 | 100 % | `no-match`×120 |
| `gun` | 4 | 67.9 % | `no-match`×120 |
| `torso` | **0** | 45.7 % | it is this rig's anchor |
| `eye-indifferent` | **0** | 0.1 % | `occluded`×147 |

⚠️ **`no-anchor`×21 is one number appearing thirteen times.** On 21 of the 147 frames `pose`
could not place the trunk to §12.2's criterion, and on those frames the instrument produces
nothing at all for any limb. That is an all-or-nothing failure mode that follows from the
design rather than from a defect, and `--anchor-residual` cannot reach it: the frames that
fail do so on `unexplained > 0.45`, which is a reported field and not a flag.

🚫 **And the anchor set had to be DECLARED rather than taken** — the run's first finding about
the tool, in [`LOOP.md`](LOOP.md) §3.7. With `chainfit`'s own criterion, `pose` anchors the
far-side limbs (measured: `rear-thigh` at residual 0.0751 on `aim/f0000`, better than
`front-thigh`'s 0.0840) while placing them on the near-side ones, and an anchored part is not
re-fitted — so **no `hingeDeg` was produced for any limb at all** until
[`tools/anchor.ts`](tools/anchor.ts) suppressed everything but the trunk and the face.

### 2. Agreement — and it does not improve with visible share

[`evidence/chainfit-trail.txt`](evidence/chainfit-trail.txt). `|mine − hinge|` in **frame
pixels at the end of what each bone swings**, so the comparison is in the unit §10.3 requires
and not in degrees. Median over every reading, split by the reading's own `visibleShare`:

| visible share | < 10 % | 10–25 % | 25–50 % | 50–75 % | ≥ 75 % |
| --- | ---: | ---: | ---: | ---: | ---: |
| median \|mine − hinge\| | 24.2 px | 21.2 px | 26.9 px | 22.6 px | **18.5 px** |
| readings | 65 | 125 | 229 | 220 | 407 |

⭐ **That is the run's headline finding about the instrument, and it is a negative one:
`visibleShare` does not predict agreement.** The band medians are flat — 18.5 to 26.9 frame px
across a range from a sliver to a fully visible part — so on this corpus, through this rig,
the instrument's own uncertainty signal does not separate a reading the composite will accept
from one it will not.

⚠️ **Read the direction of that claim carefully.** Disagreement with this run's composite is
not evidence that `chainfit` is wrong. It is evidence that the two instruments answer
differently, and §12.5 names the reason the disagreement can be systematic rather than noisy:
"the occlusion is your candidate's, and so is the geometry ... `chainfit` can be wrong about a
*limb*, in a way that looks internally consistent." The per-part medians are consistent with
exactly that — `front-thigh` disagrees by a median **159.8 px ≈ 148°**, a near-antipodal
answer, on a part whose median visible share is 20.9 %.

### 3. What it bought — adjudicated by `check`'s own matcher, and the answer is: nothing here

The one place the two instruments could be adjudicated is where `check`'s own per-slot matcher
reports drift: §9.1 says outright to "prefer the frame-derived instruments when they disagree
with the composite about a single part's place", and predicts the repair will cost composite
score. [`tools/prefer.ts`](tools/prefer.ts) implements it, with a **declared** accept
threshold. Over the 19 slot-frames where `check` reported more than 6 px:

- **6 adopted** at a declared 2.1 threshold, costing +0.036 to +2.025 on this run's objective;
- **7 refused** as costing more than that (up to +3.328, on `jump` f11's head bone);
- **6 got nothing** — `chainfit` produced no unrefused hinge for that bone on that frame,
  including **all five `idle` frames where the drifting slot was `torso`**, because the trunk
  is this rig's anchor and the field does not exist for it.

🚫 **And then the adoptions did not improve the drift.** Measured afterwards with the
reduction cap held constant in both columns
([`evidence/chainfit-adopted-effect.txt`](evidence/chainfit-adopted-effect.txt)): of the six
adopted slot-frames, **three became unattributable** — the part moved far enough that
`check`'s matcher stopped naming a distance at all — and **three read fractionally worse or
unchanged** (15.27 → 15.27, 15.27 → 15.27, 6.10 → 6.44). Not one improved.

🚨 **This run nearly published the opposite.** The corpus-level count of readings over 6 px
falls **19 → 16** across that change, and read on its own that is an improvement. It is not:
the total number of readings falls **507 → 500** at the same time, so the count improved
because seven readings *vanished*, and §9.2 says a blank drift row is "the loudest signal
`check` prints". ⇒ **A drift count is not comparable across two candidates whose attribution
counts differ**, and this record states both denominators everywhere it states a count.

### 4. Where the instrument did earn its place

Not on the hinges. On three other things, and they are worth separating from the negative
result above:

- **The G2 ceiling, measured rather than argued — on 16 of the 19 slots that draw.**
  `visibleShare` over every frame of every set is exactly the quantity v2.3's first half asks
  for, computed from a stated convention and taken on every frame rather than argued from one.
  It is what lets this record say `eye` never exceeds **0.7 %** against a **50.3 %**
  calibration bar, and — more usefully — what lets it say the ceiling **does not** explain the
  other 169 blanks. Producing that negative result took one flag and no extra fitting; nothing
  else in the toolbox measures it.
- **An independent second opinion on the one joint it can speak about.**
  `pivotDisagreementPx` — §12.3's "one direct measurement of your rig against the picture" —
  reads **median 2.00 px, max 5.17** on the head bone across 126 frames, the same order as the
  structural sweep's own basin there ([`LOOP.md`](LOOP.md) §3.5). It is reported for anchored
  bones only, so on this rig it speaks about that joint and no other.
- **The starts.** Of the 147 fitted frames, **7 (4.8 %) shipped an answer that descended from
  a `chainfit`-seeded start** — 3 from `chainfit-on-incumbent` or `chainfit-on-centroid` in
  the search, 4 from the `prefer` pass. Small, and it is the honest number: 85 frames (57.8 %)
  came from the incumbent and 36 from a neighbour.

## What is known-wrong, and what was not attempted

- 🚫 **G2 and G3 are not met, and the frontier is one shot and two parts.** `death`'s fall and
  slide with the figure horizontal: 1–4 of 18 slots attributable, the near/far shin twins
  20–150° apart between the two instruments, and 5 of the 7 `changeDisagreements`. The
  remaining 2 are `idle`, where the trunk drifts 6.1–6.5 px on five frames and no instrument in
  the toolbox reads the trunk.
- 🚫 **No `events`.** `bench` reads `events` 0.000 (0/1 name, 0/1 payload) and
  `animations.event_keys` 0/5. The brief states the *moments* — both `walk` footfalls, both
  `run` landings, the flash — to the frame, and says the *spelling* of a moment "is in the
  export and it is out of bounds". This run read that as licence not to author events, and
  placed the moments in the poses and the attachment timeline instead. **That reading is
  arguable** and it is left as an adjudicator question below.
- 🚫 **No `drawOrder` timeline**, on the reasoning under *What was built*. `bench` reads
  `draw_order` 0.875 (7/8), which is a finding against the export and arrived after the last
  edit.
- ⚠️ **Over-keyed by 2.2 ×** (1,633 against 744). The reduction cap was chosen by measurement
  over three values before `bench` was run ([`tools/keys.ts`](tools/keys.ts)), and the
  direction that lowers the key count also raises the drift count, so the trade was taken
  toward fidelity. That the reference sits at half this density is a fact this run learned at
  the finish line and did not act on.
- ⚠️ **Three priors, each recorded as a prior and not as a measurement.**
  ① `eye`'s placement — concentric with the goggles, which the brief measures as covering it
  on every frame and which `chainfit` independently confirms at a 0.7 % ceiling.
  ② `front-fist-open` over `death` f27–f56 — the brief's passage 5, on the art's own evidence.
  This run's own sweep decided **nothing** there: the best window it found anywhere bought
  0.0196 against a declared 0.25 threshold ([`evidence/skins.txt`](evidence/skins.txt)).
  ③ the shoulders and hips on the chest plate, which the art draws no cap for — declared, then
  swept, and the sweep measured a basin of ±4.5 to ±9 units (±1 to ±2 frame px) on **every one
  of its 21 knobs**, so they are weakly identified at the scale a frame can see.
- ⚠️ **One muzzle plate for the whole flare window, not five.** The five plates separate by
  only **0.029 to 0.089** on this run's objective and each of the three flare frames prefers a
  different one, so the plate was read on the brightest frame (`shoot` f3, 1,659 px of flare →
  `muzzle01`) and held. A five-key sequence is a shape the frames do not support.
- ⚠️ **The `pro` skeleton was not attempted.** The rung clears on `ess` alone.
- 📌 **Nothing was verified by looking at a viewport.** [`tools/look.ts`](tools/look.ts) prints
  an ASCII silhouette pair, which is what caught the far leg folded behind the body
  ([`LOOP.md`](LOOP.md) §3.6) and the gun coming up short at `aim`. `render` and `preview` were
  not run.

## The disclosures

1. **The launch prompt named `bench/runs/2026-09-03-spineboy-1/`** — "for the record SHAPE
   only". That directory was **not opened**, beyond one `find` listing its file names before
   the protocol had been read; the record shape came from two other rungs' runs instead, which
   item 9 allows. Full detail, and why this is the fifth instance of a collision the protocol's
   own table catalogues, in [`LOOP.md`](LOOP.md) §1.
2. **`bench`'s console printed a `gates` line carrying the reference's own counts** — the
   forbidden fact issue #137 removed from `bench.json` and left on the console "for the person
   reading the run". It names `ess 18 bones/20 slots/8 animations`. It arrived **after the last
   edit**, at the finish line, so it cannot have informed any authoring decision, and it is
   quoted here rather than hidden. It is in [`bench.txt`](bench.txt) line 2.

## What the guide should have said

Three items, and none of them is a trap the guide already names — the two of those this run
walked into are in [`LOOP.md`](LOOP.md) §3.6 as a finding about the reader.

1. 🆕 **§12.5's caveat list should include the setup SKIN, not only the setup draw order.**
   It warns that "a `drawOrder` timeline reorders your slots at runtime and this cannot know
   the time, so a candidate that has one is masked in the order its setup pose declares". The
   same shape of caveat applies one field over and is not listed: a slot whose **setup
   attachment is `null`** is not drawn at all, so `chainfit` opens with *"18 of 21 slots
   drawn"* and the muzzle flare is invisible to the instrument on the three frames it is
   actually on screen. A one-shot event authored as an attachment swap — which §10.2 says is
   how to author one — is therefore exactly the thing `chainfit` cannot read.
2. 🆕 **§12.2's repair list is missing the one that works on a biped.** It offers "give `pose`
   a better frame, pin its `--scale`, or loosen `--anchor-residual` deliberately". On a figure
   whose near and far limbs are the same drawing at two sizes, none of the three reaches the
   problem: `pose` is *confident and wrong*, so a better frame does not help, `--scale` was
   already pinned, and loosening cannot help because the failing half of the criterion is
   `unexplained ≤ 0.45`, which is a reported field rather than a flag. What works is
   **declaring the anchor set** — handing `--anchor` a `pose` report with everything but the
   trusted parts refused. That is four lines of code and it is the difference between the chain
   running and the chain never running at all.
3. 🆕 **§8.1's reach check is stated in one direction only, and the other one is silent.**
   "If the shot asks for markedly more than the chain has, the rig is wrong and no amount of
   searching will say so." The converse — a chain with *more* reach than the shot needs — is
   absorbed by bending and therefore reports nothing anywhere. This run's leg chain assembled
   from the art's own caps reaches 308 units hip-to-sole where the frames put the standing leg
   at about 233, and the cheapest detector for it turned out to be **`check`'s `in units` line
   on one set with a static candidate**: `candidate 352.8 x 727.9 reference 460.7 x 648.7`,
   which names the 79-unit excess directly and doubles as the confirmation that the shot was
   measured in the frames' own units. ⚖️ And the hypothesis it raises is worth testing rather
   than acting on — shortening every link by 10 % measured **worse**
   ([`evidence/limb-reach.txt`](evidence/limb-reach.txt)), so the excess is a real knee bend in
   the reference's stance and not an error in the rig.

## What is left for the adjudicator

1. **A superseded pose store exists with more attribution and a lower MAE at the same gated
   figures, and this run did not ship it.** Reverting the six `prefer` adoptions is the change.
   Both were measured at the reduction cap of **1.2** they were fitted under, before the cap
   was tightened — that is the only comparison where the two differ in one thing:

   | | drift readings | over 6.0 px | MAE (ref px), mean of 16 sets | worst drift | `changeDisagreements` |
   | --- | ---: | ---: | ---: | ---: | ---: |
   | no adoptions | **507** | 19 | **55.54** | 18.98 | 7 |
   | six adoptions (shipped lineage) | 500 | 16 | 55.99 | 18.98 | 7 |

   ⚠️ **Neither row is the shipped candidate**, whose own cap is 0.4 and which reads
   **499 / 13 / 55.62 / 18.98 / 7**. So those two rows bracket the choice rather than settle
   it — and the count columns are not comparable between them anyway, for the reason stated
   two sections up: seven readings vanished rather than improved.

   **No clause reads differently either way** — the worst attributable drift is 18.98 px and
   `changeDisagreements` is 7 in all three. The choice was left standing because `bench` had
   already been run on the shipped candidate, and reverting on post-`bench` evidence would have
   made the run bench-assisted for a change that moves no clause. The shipped store is
   [`fit/poses.json`](fit/poses.json); the harness reproduces the other with `MAX_COST=1.0`.
2. **Is not authoring `events` a defensible reading of the brief's item 2?** The brief gives
   the moments to the frame and says the spelling is out of bounds. This run took that as
   licence; the opposite reading — author five firings at the measured instants under invented
   names — is available and would have moved `events` off 0.000.
3. **The `no-anchor`×21 frames are a design consequence, not a defect — but should the run
   have supplied its own anchors there?** `--anchor` takes a `pose` report, and this run
   already edits one. Feeding a *fitted* trunk placement back in as the anchor would have made
   `chainfit` read those 21 frames, at the cost of the instrument no longer being independent
   of the fit it is being compared against. The run declined; it is a judgement about what the
   price tag is measuring.
4. **`rear-upper-arm` is attributable in 1 of 16 sets at the worst error per pixel in the rig
   (25.50).** It is the chain a third attempt should take, and whether the clause's per-slot
   limb should reach a chain rather than a slot is a question about the gate.
5. 🚨 **The big one: is G2's per-slot limb readable at all on a single-component figure?** 170
   of 291 (set, slot) pairs are blank, `check`'s `component` matcher is unsatisfiable by
   construction on 143 of 147 frames, and v2.3's ceiling ground — the only measured ground the
   clause offers — separates exactly **one** of those 170 blanks. This run cannot tell whether
   that means the candidate fails the clause, or the clause has no purchase on a corpus whose
   own brief measures it as one connected component. It is stated as a measurement and left
   where a question about the gate belongs.

## Files

| | |
| --- | --- |
| [`spineboy-ess.rig.json`](spineboy-ess.rig.json) · [`spineboy-ess.motion.json`](spineboy-ess.motion.json) | the two authored files |
| [`spine/`](spine/) | the compiled candidate |
| [`build.txt`](build.txt) · [`validate.txt`](validate.txt) | the gate |
| [`check.txt`](check.txt) · [`check.json`](check.json) · [`check-all-frames.txt`](check-all-frames.txt) | the record's measures |
| [`check-texture-from.txt`](check-texture-from.txt) | the named diagnostic. Its `--json` was 2.6 MB and every figure this record quotes from it is in [`evidence/check-texture-summary.md`](evidence/check-texture-summary.md), so it is not committed; `tools/finish.sh` regenerates it |
| [`bench.txt`](bench.txt) · [`bench.json`](bench.json) | the finish line, run once |
| [`LOOP.md`](LOOP.md) | the turns, the two disclosures and the defects |
| [`evidence/`](evidence/) | the frame census, the chainfit census and trail, the key plan, the sweeps, the reach control, the compiled-vs-fit control |
| [`fit/`](fit/) | the pose store, the chainfit readings, the skins, the structural sweep |
| [`tools/`](tools/) | the harness; [`rebuild.sh`](tools/rebuild.sh) rebuilds from a clone, and [`finish.sh`](tools/finish.sh) reproduces every measure above |

📌 **The stored specs reproduce this record's figures from a clone, checked before it was
committed**: `rebuild.sh` into a fresh directory, then `check` from the repository root with no
`--atlas` override, gives byte-identical `slot drift`, `MAE` and `per-frame` lines on all 16
sets. The atlas's 29 page paths are relative to `spine/` and resolve to
`examples/spineboy/images/`, so nothing here depends on the worktree it was built in — the
condition the 2026-08-26 amendment precedent exists for.
