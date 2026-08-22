# Rung 2, attempt 2 — `2-the-12-principles`

One skeleton, four ~25.8 s animations, authored from the brief and the reference
frames alone. `LOOP.md` is the turn-by-turn record; this file is the inputs, the
result and how the measures read.

## Inputs

| | |
| --- | --- |
| brief | [`bench/briefs/2-the-12-principles.md`](../../briefs/2-the-12-principles.md), **revision 2** (verified 2026-08-23) |
| guide | [`docs/AUTHORING.md`](../../../docs/AUTHORING.md), including §8 and §9 |
| protocol | [`bench/runs/README.md`](../README.md) |
| art | `examples/2-the-12-principles/images/` — 15 loose PNGs |
| reference | `bench/reference/2-the-12-principles/` — 4 contact sheets (311 tiles each), 8 full-size stills, `frames.json` |
| model | **Claude Opus 5 (1M context)**, Claude Code / Agent SDK |
| profile | `spine` |

**Clean, not bench-assisted.** The reference export, the transcriptions, the
first rung-2 run, `docs/LADDER.md`, `docs/SPEC_COVERAGE.md`, the feature matrix
and git history were never opened. `bench 2` was run once, at the end; nothing
was edited after it.

## Files

```
obstacle-course.rig.json      10 bones, 15 slots, 15 region attachments, 1 skin
obstacle-course.motion.json   4 animations, 25.833333 s each
spine/                        skeleton.json + skeleton.atlas + 15 pages
LOOP.md                       the loop, including the two false starts
bench.json                    the finish-line report
```

## Result — the `bench 2` summary, verbatim

```
  ── summary ──
  validate   green  (profile spine)
  ess        bones=0.308  slots=0.156  attachments=0.762  constraints=1.000  animations=0.623  events=1.000
  basketball MAE mean=4.40 worst=4.45  worst slot drift 11.4px  (2 frame(s))
  billiard-ball MAE mean=4.33 worst=4.35  worst slot drift 11.2px  (2 frame(s))
  bowling-ball MAE mean=4.39 worst=4.41  worst slot drift 11.2px  (2 frame(s))
  tennis-ball MAE mean=4.34 worst=4.34  worst slot drift 11.2px  (2 frame(s))
  Section figures are means of their own measures. There is no rung score:
  a rung is cleared by a person reading the measures, and docs/LADDER.md records it.
```

## Reading the measures

### Validity — the only pass/fail, and it is green

17 PASS, 0 FAIL. Three SKIPs, all of them expected and none of them a check that
was being relied on: `A31` (the shot has no `drawOrder` timeline), and — because
`bench` re-gates artifacts already on disk rather than compiling — `A09`
(no motion spec to compare a declared duration against) and `A18` (no second
compile). Both of those ran and passed at build time. 14 PROF: `--profile spine`
means valid Spine 4.3, not the renderer policy.

### Fidelity — `check`, and what it could not reach

**MAE 4.32–4.45 on every animation, flat between the two frames it compares.**
Framing settled in 2 passes: the candidate's content box is 231.9x196.1 px
against the reference's 231.7x196.1, fit scale 0.99982, offset +0.04 px, rms
0.04 px. That is as close as two content boxes can be measured, so nothing below
it is carrying a framing error.

⚠️ **`check` compared 2 frames per animation, not 311.** This rung's reference is
contact sheets plus two stills, and `check` reads `fNNNN.png` files, so it saw
`f0000` and `f0310` and nothing between them. The line `frames 2 on disk,
candidate samples 311, 2 compared` says so. Everything the rung is *about* — four
different balls running the same course at four different speeds — happens in the
309 frames it did not see.

So the run built the missing instrument and reports it separately. Loading the
compiled candidate through `src/render.ts`, sampling every animation at 12 fps
into the reference's own world box at quarter scale and comparing each frame
against its tile on the contact sheet (`LOOP.md` §0 — it reads the sheets and
`frames.json`, the same reference-side files `check` reads, and no skeleton):

```
basketball     311 frames   MAE mean 4.85  worst 5.47 at f0122
billiard-ball  311 frames   MAE mean 4.86  worst 5.49 at f0122
bowling-ball   311 frames   MAE mean 4.95  worst 5.61 at f0122
tennis-ball    311 frames   MAE mean 4.89  worst 5.49 at f0262
```

**Flat across 1,244 frames, spread 0.7, no spikes.** §9.2 of the guide reads a
flat MAE as framing or art and a spiking one as timing at those moments; there
are no spikes anywhere in any of the four. That is the evidence that the
trajectories, the two ring rates, the panel cycle and the attachment swaps land
where and when they should — and it is the evidence `check` on this rung cannot
give.

**The slot-drift column says nothing here.** Every frame reports `some slots
ambiguous`: the course, the water, the panel and both rings are one connected
component in the reference, so no slot has a component of its own to be matched
against. The "course drift 11.2 px" that appears in the summary is the distance
from the course's own centroid to the centroid of a blob that contains four other
parts — §9.2's warning, in the form a reader will actually meet it.

**Where the residual 4.3 lives.** Drawn as a picture it is a one-pixel outline
along every edge in the set art, plus a single column at the course's left edge
and two rows at its bottom. It does not move when the course is nudged (tried
±4 units: 4.90 → 5.18 → 5.86) or rescaled (swept 1.99–2.01; 2.000 is sharply
best), so it is not a placement error. It is the difference between sampling a
loose one-part-per-page atlas and sampling the reference's packed one — rigc has
no packer, and B3's emitter half is the known open gap.

### Structure — `diff`, and why the name-matched measures are near zero

`bones=0.308 slots=0.156 attachments=0.762 constraints=1.000 animations=0.623`.

The two halves of that read very differently:

- **Counts are close.** bones 10/12, slots 15/17, attachments 15/17, skins 1/1,
  animations 4/4 — and `animations.names` is **4/4**, because the brief names the
  animations and the frame directories carry those names.
- **Everything keyed by name is ~0.** `slots.bone` 0/17, `slots.color_present`
  0/17, `bones.names` 1/21, `slots.names` 1/31. Names were mine to choose (the
  brief says so), so these measures are reporting that two people named the same
  parts differently, which is what they are for. The name-agnostic pair beside
  them is the honest read of the tree: `depth_histogram` 0.667,
  `degree_sequence` 0.583 — a flat 10-bone rig against a 12-bone one that is
  presumably not flat.
- **`animations.duration` 0/4** is a real disagreement and worth naming. The
  reference's `frames.json` records the *last sampled frame's* time, 25.8333 s,
  which pins the true duration only to `[25.8333, 25.9167)`. 310/12 is what the
  brief states and what this rig declares; the reference's own duration is
  somewhere above it by less than one 12 fps frame, and no picture can say where.
- **`timeline_kinds` 0.306, `key_counts` 0.141, `curve_kinds` 0.163.** These are
  the measures this run deliberately spent, and the reason is in `LOOP.md` §8:
  the reference is sampled at 12 fps, so between two consecutive frames *no*
  curve shape is observable. Rather than invent easings — the exact failure §8
  warns about, and the one rung 1's first run shipped green — every timeline here
  is a polyline through measured samples with linear interpolation. That
  reproduces every sampled frame exactly and scores badly on `curve_kinds` by
  construction. It is a trade, made knowingly, and a human refining this in the
  editor would replace those runs of keys with eased ones.

## What the shot turned out to be

Written down because a later reader can check it against the frames without
opening the answer, and because three of these are not in the brief:

- The set is **one plate at scale 2** (`obstacle-course.png`, 1628x1325 → 3256
  world units), with the water sheet **behind** it showing through the basin, the
  hinged panel behind it too, and both turning rings in front.
- The panel is scaled about a **hinge at its base**: 1.0 standing, 0.405 down,
  period **27.60 frames = 2.30 s exactly**, and it **overshoots to 0.365 for one
  frame** at the bottom of the drop.
- Both rings turn **±7401° over 310 frames** — 15.08 frames a revolution, upper
  clockwise, lower anticlockwise.
- The **lower ring's rotation is off-centre**: its attachment sits 18.1 units
  from its bone, so it wobbles by ~1.3 px as it turns.
- Each ball is **two or three stacked discs**, and the one you actually see is
  the near-opaque `lambertian` shade disc carrying a **per-ball slot tint**
  (`ffb5a1` basketball, `ecceff` bowling, `fbffa7` tennis, white billiard). The
  ball art under it contributes about 0.3 MAE — the brief's *"the basketball's
  seams show through it"*, measured.
- **The tennis shot's set is not the other three's.** Its upper ring turns 1.3 %
  faster and **stops at frame 306.4**; its panel keeps the common phase for three
  cycles and then runs ~5 frames early. The brief's *"frame-for-frame identical in
  all four animations"* holds for the panel in three shots and not in the fourth.

## One thing that happened to the tooling mid-run

`src/check.ts` was being refactored in the shared tree while this run was
looping (issue #34: framing moved from posed-quad corners to a content-box fit).
One turn hit a `SyntaxError` from a half-landed edit and had to wait ~100 s; more
importantly, **MAE numbers from before that landed are not comparable with the
ones after**, and `LOOP.md` marks where the line falls. The final numbers here are
all from the new procedure.
