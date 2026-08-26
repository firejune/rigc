# Rung 4 — `4-wave-principle`, attempt 1 of 2026-08-26

- date:      2026-08-26
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- brief:     [`4-wave-principle.md`](../../briefs/4-wave-principle.md) **revision 3**
             (2026-08-26) — the first third-party-verified revision of this brief
- inputs:    the brief; [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) in full,
             §8, §8.1, §9 and §10 included; `examples/4-wave-principle/images/`;
             `bench/reference/4-wave-principle/` including `frames.json` and the
             three `@24fps` contact sheets; this repository's `src/`; Spine's
             public documentation
- reference: **not read.** No reference skeleton was opened. The supplied
             `.atlas` — the one file under a reference export a run may open — was
             read for exactly one line; see *A note on the supplied atlas*
- guide:     AUTHORING.md §10 in hand (a post-2026-08-23 run)
- profile:   `spine`
- builds:    **10**
- loop log:  [`LOOP.md`](LOOP.md) — every turn, every dead end, and the
             honesty-rule note in its §1

## The candidate

One skeleton, three animations, eight region attachments, no mesh, no constraint,
no event, no draw-order timeline, 1,339 keys across 30 timelines.

```
bun cli.ts build \
  --rig    bench/runs/2026-08-26-rung4-1/4-wave-principle.rig.json \
  --motion bench/runs/2026-08-26-rung4-1/4-wave-principle.motion.json \
  --images examples/4-wave-principle/images \
  --out    bench/runs/2026-08-26-rung4-1/spine \
  --profile spine
```

### The bone tree, and why it is that shape

```
root
├── platform ─ chain-1 ─ chain-2 ─ chain-3 ─ chain-4 ─ chain-end
└── basket-lambertian ─ basket-ball
```

Nine bones, eight slots, one skin. Every name but `root` is a PNG basename carried
straight through — image → slot → attachment → the bone that moves it — which is
§10.1's largest lever and the one thing about this shot that made it available: the
art here *is* named after the parts.

Three structural readings, each a decision this run made and wrote down at the time
(§9.3's rule), with the evidence in [`LOOP.md`](LOOP.md) §3:

- **the chain is five links and four moving joints.** `chain-end`'s art is a
  rotationally near-symmetric ring centred on its own joint, and |ring − bead₄|
  holds at 18.1–18.6 px (σ 0.15) across every frame of both short shots — so the
  ring is rigid to `chain-4` in the pixels, and its bone's rotation is an
  unobservable gauge. It is **not keyed** (§10.3). If the reference keys it, this
  candidate is one timeline short, and that is the honest trade.
- **the ball's spin and the ball's shading are on different bones.** The seams move
  between adjacent frames; the highlight does not. `basket-lambertian` carries the
  travel, the squash and the squash's own tilt; `basket-ball` hangs under it and
  carries only the spin, plus the `rgba` track for the colour it loses at frame 91.
- **regions, not meshes.** Nothing deforms within itself on any frame, and §9.3
  says the frames cannot separate a posed hull from a deformed one. Written down
  here rather than met again in the measures.

## A note on the supplied atlas

The run did not use it and did not need it: rigc emits its own one-part-per-page
atlas from the loose PNGs. One figure was read out of its first four lines —
`scale: 0.5`, i.e. the reference's pages are packed at half the art's size —
because rung 3's row in [the protocol](../README.md) now warns that this example
family does that and that it puts a floor under the MAE.

**It does not put one here, and that is measured rather than assumed.** Two
controls, both on `wave-by-hand` frames 0/4/8/12 at a converged pose:

| Pages the candidate sampled | residual, as a fraction of the reference's own ink cost |
| --- | --- |
| full size (what it ships) | 0.1626 · 0.1555 · 0.1545 · 0.1489 |
| 2×2-averaged, same size | 0.1675 · 0.1696 · 0.1776 · 0.1497 |
| genuinely half size, world geometry held | 0.1644 · 0.1505 · 0.1562 · 0.1415 |

Halving the texel detail moves nothing either way. So the residual this run started
from was geometry and pose, with no resolution floor hiding inside it — which is
what made the setup-geometry sweep worth running, and it took the same figure from
0.156 to 0.081.

## The measures

`bun cli.ts bench 4 --candidate … --frames bench/reference/4-wave-principle --json bench.json`

### Validity — `validate --profile spine`

**15 PASS, 0 FAIL**, 5 SKIP, 14 PROF. The SKIPs are the four the shot has nothing
for (no draw-order timeline, no event timeline, no bounding box or clipping
attachment) plus `A18_DETERMINISTIC_EMIT`, which `bench` skips because it re-gates
artifacts already on disk rather than compiling them. `build` ran A18 and A09 green
on every one of the ten builds.

### Structural diff

```
    ..    bones=9/9  slots=8/9  skins=1/1  attachments=8/9  constraints=0/0  animations=3/3  events=0/0   (candidate/reference)

    bones                 mean 0.715  over 8 measures
    bones (name-agnostic) mean 0.956  over 5 measures
    slots                 mean 0.671  over 7 measures
    slots (name-agnostic) mean 0.750  over 4 measures
    attachments           mean 0.930  over 9 measures
    constraints           mean 1.000  over 5 measures
    animations            mean 0.822  over 9 measures
    events                mean 1.000  over 2 measures
```

Measure by measure:

| measure | ratio | measure | ratio |
| --- | --- | --- | --- |
| `bones.count` | **9/9 = 1.000** | `slots.count` | 8/9 = 0.889 |
| `bones.names` | 6/12 = 0.500 | `slots.names` | 7/10 = 0.700 |
| `bones.parent_by_name` | 4/9 = 0.444 | `slots.order` | 3/9 = 0.333 |
| `bones.order` | 6/9 = 0.667 | `slots.bone` | 4/9 = 0.444 |
| `bones.length_present` | 4/9 = 0.444 | `slots.attachment` | 7/9 = 0.778 |
| `bones.inherit_present` | 6/9 = 0.667 | `slots.blend` | 7/9 = 0.778 |
| `bones.depth_histogram` | **9/9 = 1.000** | `slots.color_present` | 7/9 = 0.778 |
| `bones.degree_sequence` | **9/9 = 1.000** | | |
| `attachments.skins` | **1/1 = 1.000** | `animations.count` | **3/3 = 1.000** |
| `attachments.count` | 8/9 = 0.889 | `animations.names` | **3/3 = 1.000** |
| `attachments.names` | 7/10 = 0.700 | `animations.duration` | **3/3 = 1.000** |
| `attachments.type_counts` | 8/9 = 0.889 | `animations.timeline_kinds` | 22/31 = 0.710 |
| `attachments.region_size` | 8/9 = 0.889 | `animations.key_counts` | 421/1339 = 0.314 |
| `attachments.mesh_*` (4) | 0/0 = 1.000 | `animations.curve_kinds` | 495/1339 = 0.370 |
| `constraints.*` (5) | 0/0 = 1.000 | `animations.event_keys` | 0/0 = 1.000 |
| `events.*` (2) | 0/0 = 1.000 | `animations.draw_order` | **3/3 = 1.000** |
| | | `animations.deform` | **3/3 = 1.000** |

### `check` — against the frames

All **6 of 6** frame sets were measured in `frames.json`'s **own declared box**
(`framed to … frames.json's own box — the candidate measured into it`), so none of
these figures carries the extent fit's floor. The candidate is authored in the
frames' own world coordinates, and that is measured rather than assumed: rendering
it into the declared box put its pixels on the reference's to within 0.22–0.54 px
rms per set.

| set | rate | MAE mean | (ref denom) | MAE worst | worst slot drift | frame-change | sheet mean | sheet worst | **worst ÷ mean** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ball-catch` | 12 | **16.61** | 17.24 | 28.97 at f0019 | 3.6 px `chain-1` f0103 | **0 of 120** | — | — | — |
| `ball-catch@24fps` | 24 | 5.56 | 5.60 | 6.02 at f0000 | 0.4 px | — | **16.89** | 32.28 at f0053 | **1.911** |
| `wave-by-hand` | 12 | **13.98** | 14.26 | 20.32 at f0009 | 1.0 px `chain-4` f0009 | **0 of 16** | — | — | — |
| `wave-by-hand@24fps` | 24 | 12.73 | 12.93 | 12.73 at f0000 | 0.8 px | — | **12.91** | 18.43 at f0029 | **1.428** |
| `wave-offset` | 12 | **15.21** | 15.59 | 22.45 at f0003 | 1.9 px `chain-1` f0009 | **0 of 16** | — | — | — |
| `wave-offset@24fps` | 24 | 11.12 | 11.26 | 11.12 at f0000 | 0.4 px | — | **13.89** | 24.67 at f0006 | **1.776** |

Every tile of every sheet was compared: 241/241, 33/33, 33/33. Every slot was
matched on every set (8/8 or 7/8 where a part is legitimately hidden), and no set
reported a reference component no slot reaches.

## The reading

**The shot is reproduced, and the timing is reproduced at both rates.** The three
figures this attempt was aimed at:

1. **The frame-change column is clean on all three shots** — 120 of 120, 16 of 16,
   16 of 16 adjacent pairs change by as much as the reference's own frames do. It
   was *not* clean on the first finished build, and what made it dirty was the loop
   itself: see [`LOOP.md`](LOOP.md) §2.5, which is the most transferable thing this
   run found.
2. **The worst tile of each sheet sits at 1.43×, 1.78× and 1.91× that sheet's own
   mean.** The spread is what says the timing holds *between* the 12 fps frames as
   well as on them — the passage the brief warns about (the saucer turning right
   over twice inside half a second, and the ball's contact, which happens entirely
   between frames 84 and 85) is in the sheet and nowhere else.
3. **The MAE is flat rather than spiked**: `ball-catch`'s worst frame is 1.74× its
   own mean, `wave-by-hand`'s 1.45×, `wave-offset`'s 1.48×. §9.2's reading of that
   shape — *"a shot whose MAE is flat across the set and a shot with two spikes are
   different diagnoses"* — puts what is left in framing and art rather than in
   timing at particular moments. The first build of this candidate had a worst frame
   at **3.2×** its mean, and closing that gap was four rescue passes over frames the
   tracked search could not leave (§8.1's multi-start rule, and it is the single
   biggest thing that moved a number here).

**On the structure**, the tree is right and the vocabulary is partly not: `bones.count`,
`bones.depth_histogram` and `bones.degree_sequence` are all **9/9** — nine bones,
at the same depths, with the same child counts — while `bones.names` is 6 of 12.
So the reference and this candidate agree about the *shape* of the rig exactly, and
share six of nine names. §10.1's naming lever paid on the six the art names
(`root`, and the parts whose PNGs are named for them); the three that differ are
where this run had to invent a scheme the art does not carry.

**The reference has one part more than this candidate**: `slots=8/9`,
`attachments=8/9`, `attachments.type_counts` 8/9. Eight PNGs ship, and eight
distinct parts are visible in the frames, so whatever the ninth slot holds is
either a second attachment on a part that already has one or something the frames
never draw. Nothing in the frames could have said so.

**`animations` is where the two rigs differ most, and in one direction.** Count,
names, duration, draw-order presence and deform presence are all exactly right;
`timeline_kinds` is 0.710; and `key_counts` is **421/1339 = 0.314**. The denominator
is this candidate's own total, so the reading is unambiguous: **this run authored
roughly three times as many keys as the reference did.** `curve_kinds` (0.370) is
the same fact seen through the curve column.

## What is known wrong

- ⚠️ **Over-keyed by about 3×, and the loop had no instrument that could see it.**
  §10.3 says to declare one tolerance in pixels at the end of what each bone swings
  and convert it per bone by that bone's lever arm; this run declared **0.28 px**
  and did exactly that (levers: 963 units for the saucer, 905/668/431/204 down the
  chain, 103 for the ball). What §10.3 does not say is how to *choose* the number —
  and nothing in the loop can, because **`check` is blind to key density by
  construction**: a candidate that keys every sample and one that keys a third of
  them render identical pixels wherever both are inside tolerance. Only `bench`
  sees it, and `bench` is the finish line. So the tolerance was chosen blind, and
  0.28 px was too tight: it is below this run's own *fitting* accuracy on the
  shortest lever (the objective's basin on `chain-4`'s rotation measures ±1.5°,
  which is ±0.5 px at its lever arm), so a good part of those keys are the
  estimator's wander rather than the shot's. **This is not corrected here on
  purpose** — changing the tolerance after reading `bench` would be tuning against
  the answer, and this run is not bench-assisted. What the next attempt should do is
  in *What the guide should have said*.
- **`ball-catch` frame 19 (MAE 28.97) and the `chain-1` drift of 3.6 px at frame
  103** are the two places the fit is furthest off. Frame 19 is inside the pass
  where the saucer runs back from its far point; frame 103 is in the long settle
  after the ball is parked, where the chain's motion is small and the objective is
  correspondingly flat.
- **`chain-end`'s rotation is not keyed at all** (see above). Deliberate, and wrong
  if the reference keys it.
- **Three bone names, two attachment names and the ninth slot are guesses that the
  frames could not check.** `bones.parent_by_name` (0.444) and `slots.bone` (0.444)
  are mostly downstream of the names rather than of the tree, which the
  name-agnostic figures (0.956, 0.750) say directly.
- **`bones.length_present` 4/9 and `bones.inherit_present` 6/9.** This run declared
  a `length` on every bone but `root` and an `inherit` on none. Both figures say the
  reference made different choices on about a third of its bones; neither is visible
  in a frame (§9.3's first bullet), so neither was authored from evidence.

## What the guide should have said

1. 🚨 **§10.3 asks for a tolerance in pixels and gives no way to pick the number,
   and the loop cannot supply one.** The section's own worked example reports the
   trade (*0.6 px → 259 keys → 1.619 MAE, 0.3 → 300 → 1.402, 0.15 → 377 → 1.305*),
   which is a run that could see both columns — but that run could only see them
   because MAE moved with the tolerance. On this shot it does not: at every
   tolerance the fit tried, the planner's residual is *at* the tolerance and the
   rendered result is unmoved, because the tolerance is well under a frame pixel.
   ⇒ The missing rule is an upper bound rather than a target: **do not declare a
   tolerance below the accuracy of whatever produced the series.** For a render fit
   that accuracy is measurable without touching the reference — scan the objective
   around the converged value and read the basin's width (this run measured ±1.5°
   on `chain-4`, ±1° on `chain-1`) — and a tolerance under it buys keys that encode
   the fitter's wander. §10.3's arithmetic (`|f(n−1) − 2f(n) + f(n+1)| / 2`) answers
   a different question, about the subject; this one is about the estimator, and
   both need doing.
2. ⚠️ **§10.3's hold rule needs its precondition stated: check that the shot holds
   at all.** Applying it to a shot that never holds still does not cost nothing — it
   manufactures the defect the rule exists to prevent. One pass over the frames
   settles it (121 + 17 + 17 pairs here, zero identical), and it belongs beside the
   rule. [`LOOP.md`](LOOP.md) §2.5 has the incident.
3. ⭐ **§9.2's `sheet` line deserves the sentence §9.3 gives the frame table.** §9.3
   says `check` cannot see *"what happens between two committed frames"* — but on a
   stills-plus-sheet set it can, and the sheet is the only place it does. That is
   worth saying at the sheet rather than only in `--frames`' own paragraph, because
   a half-frame is **not between its neighbours**: `ball-catch`'s ball contact sits
   40 px below both frames that bracket it, and any search whose reach is derived
   from those two frames cannot find it by construction. This run lost a pass to
   exactly that.
4. 📌 **§8.1's multi-start rule is the highest-value paragraph in the guide for a
   serial figure, and it reads like a refinement.** Four rescue passes that did
   nothing but *start from somewhere else* — the product of the saucer's rotation
   and the chain's first joint, 18 × 3 starts per frame — took `ball-catch`'s worst
   frame from 0.440 of the reference's ink cost to 0.178, its mean from 0.114 to
   0.099, and the worst sheet tile from 3.55× the sheet mean to 1.91×. Everything
   else in this run's loop moved smaller numbers.
