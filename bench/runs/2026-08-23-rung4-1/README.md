# Rung 4 — `4-wave-principle` — attempt 1

| | |
| --- | --- |
| date | 2026-08-23 |
| model | **Claude Opus 5 (1M context)** — `claude-opus-5[1m]`, Claude Code / Agent SDK |
| brief | [`bench/briefs/4-wave-principle.md`](../../briefs/4-wave-principle.md), revision 2 |
| profile | `spine` |
| status | **clean run** — not bench-assisted |

## Inputs

- the brief (revision 2), [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) including §8 and §9,
  and [`bench/runs/README.md`](../README.md)
- the art: `examples/4-wave-principle/images/` — eight loose PNGs
- the reference renders: `bench/reference/4-wave-principle/` — 121 + 17 + 17 frames
  at 12 fps, three contact sheets at 12 fps and three at 24 fps, and `frames.json`
- the CLI: `build`, `explain`, `check` in the loop; `bench` once at the end

Not read, at any point: `examples/*/export/**`, `bench/transcriptions/**`,
`bench/runs/*-rung*`, `docs/SPEC_COVERAGE.md`, `docs/LADDER.md`,
`docs/feature_matrix.*`, `bench/count_features.ts`, `bench/render_reference.ts`,
git history. No web search. `src/render.ts` and `src/check.ts` were read once, for
how `check` frames a candidate — the guide permits reading the tool.

`bench 4` was run **once**, after `LOOP.md` was written, and nothing was edited
afterwards.

## Files

```
wave-principle.rig.json      8 bones, 8 slots, 8 region attachments, one skin
wave-principle.motion.json   3 animations, 141 named easings, 639 keys total
spine/                       skeleton.json + skeleton.atlas (8 one-part pages)
LOOP.md                      every turn of the loop, including the dead ends
bench.json                   the `bench 4 --json` report
```

## The rig, in one paragraph

`root → platform → chain1 → chain2 → chain3 → chain4 → chain5`, plus `ball` under
`root`. The platform bone sits at the disc's own centre and carries both the
disc's travel and its rotation; the chain hangs from that same point and inherits
the rotation, which is what lets the disc turn through a full circle at f0080 while
the chain's own curves stay smooth. Chain bones point down (`rotation: -90` on
`chain1`, `0` thereafter) with lengths 308.1 / 237.6 / 210.1 / 211.3 units, each
region offset so the link's orange bead lands on its bone. Draw order is
chain1 → chain5, then `ball`, `ball-shade`, `platform` in front. `ball-shade` is
`basket-lambertian` on the ball's bone at slot alpha 0.70; the `ball` slot's alpha
steps to 0.25 between f0091 and f0092, which is when the ball goes grey.

## The bench summary, verbatim

```
  ── summary ──
  validate   green  (profile spine)
  ess        bones=0.499  slots=0.215  attachments=0.772  constraints=1.000  animations=0.854  events=1.000
  ball-catch MAE mean=17.91 worst=41.07  no slot attributable  (121 frame(s))
  ball-catch@24fps MAE mean=12.15 worst=13.30  no slot attributable  (2 frame(s))
  wave-by-hand MAE mean=14.31 worst=20.62  no slot attributable  (17 frame(s))
  wave-by-hand@24fps MAE mean=14.95 worst=14.95  no slot attributable  (2 frame(s))
  wave-offset MAE mean=14.49 worst=18.73  no slot attributable  (17 frame(s))
  wave-offset@24fps MAE mean=14.95 worst=14.95  no slot attributable  (2 frame(s))
```

and the framing lines the `check` section opens with:

```
    framed to  768x634px  0.086960 px/unit  world x[-6719.6 .. 2112.0] y[-1416.0 .. 5877.3]  (the candidate's own content box)
    reference  768x634px  0.086901 px/unit  world x[-7238.6 .. 1599.1] y[-373.0 .. 6927.9]  (frames.json)
```

## Reading the measures

### Validity

Green under `--profile spine`, and green on the **first** build — the gate never
had a word to say about this rig. Three `SKIP`s, all benign: `A31` (no drawOrder
timeline), and `A09`/`A18` which skip because `bench` re-gates artifacts already on
disk rather than compiling (during the run, with the motion spec present, both
passed). Fourteen `PROF` lines: this green is *valid Spine 4.3*, not
renderer-policy-clean, and no archetype assertion ran.

### Structure — `diff` against `ess`

The reference has **9 bones, 9 slots, 9 attachments** where this rig has 8 of each,
so one part of the reference's structure is simply missing here. The likeliest
candidate is the ball's shading: `basket-lambertian` never rotates with the
basketball in the frames, so the reference plausibly gives it its own bone rather
than sharing the ball's, as this rig does. That single missing bone/slot pair is
most of `count = 0.889` in all three sections.

The name-matched measures (`slots.order`, `slots.bone`, `slots.attachment`,
`bones.parent_by_name`, all ≈0.1–0.3) are near-zero for the expected reason: the
names are mine, and a name-matched measure cannot see past that. The
**name-agnostic** bone measures are the informative ones and they are the highest
in the section — `depth_histogram 0.889` and `degree_sequence 0.889` say the
hierarchy has the same shape at every depth and the same branching, i.e. the
skeleton is right up to the missing ninth bone and the naming.

`attachments.region_size_present 1/9` is a format difference, not an error: rigc
emits one part per page and writes each region's measured `width`/`height`, where
the reference's regions take their size from a packed atlas.

`animations` is the strongest section: **count, names and duration are all 3/3**,
so the three shots exist, are named as the frame directories are, and run to the
right length. `timeline_kinds 19/31` is the sharpest structural miss in the run —
the reference carries twelve timelines this rig does not, and the omissions I know
about (the ball's rotation, the ball's squash and stretch, `chain5`'s rotation, a
separate shading bone's translation) account for most of that count.

`key_counts 385/639` needs reading with care, and I got it wrong on the first pass.
The denominator **is this rig's own key total** — 47 + 49 + 543 = 639 — and the
numerator is the per-timeline minimum summed. The rung's own gate line describes
the reference as *"9 bones, 9 slots, 3 animations, 470 bezier keys"*. So this file
is the **denser** one: I over-keyed against a sparser hand-made original, which is
exactly the risk flagged under "Key density" below, and it is real rather than
hypothetical. `curve_kinds 301/639` compounds it — the mix of linear and bezier
keys differs as well.

### Appearance — `check`

Mean MAE 17.9 (`ball-catch`), 14.3 and 14.5 (the two whips), against a 0..255
scale and no threshold. Worst frames:

- **`ball-catch` f0082, 41.07** — the middle of the disc's 360° flip, where it turns
  about 90° between two 12 fps frames. Nothing on the frame grid says where it is
  in between, and one key per frame through a 74°/frame spin is a coarse
  description of a spin.
- **f0019–f0023, 30–39** — the disc's hard tilt as it carries the ball back right.
  Same cause, smaller angle.
- The two whips are flat across all 17 frames (10.9–20.6). A flat MAE and no spikes
  is the "framing or art" diagnosis of §9.2, not a timing one — which is what I
  expect to be left with here, and the next section says why.

**No slot drift was measurable anywhere.** Every frame of every animation reports
`some slots ambiguous`: a disc with five chain links hanging off it is one
connected component in the reference whenever the parts touch, and here they always
touch. So this run has an MAE and nothing else, and any claim about an individual
part is inference, not measurement.

### The thing that dominates this number

`check` frames each side by its own content, and on this shot **the width alone
sets the scale**, `minY` never enters the mapping at all, and each of the three
numbers that do (`minX`, `maxY`, width) is set by one corner of one quad in one
frame. Sub-pixel error at those extremes rescales every frame of every animation.
Measured during the run (LOOP.md turns 3–5, 10):

- pinning the viewport so both sides share one grid took `wave-by-hand` from
  49.45 to 22.96 — **half the reported error was framing, not motion**;
- `chain5`'s rotation is not visible in the pixels at all (pinned MAE moves 0.5 over
  ±20°) and yet moves the default-framed MAE from 27.6 to 84.9, because its quad
  corners swing in and out of the content box;
- tightening key tolerance from 6 units to 4 dropped the MAE from ~41 to ~17,
  mostly because with sparse keys the frame that *sets* an extreme is often not a
  key, so the extreme lands on an interpolated value.

I did not tune the rig to close the framing gap. The one framing-adjacent change I
kept is a genuine measurement: the `ball-catch` launch's anticipation dip bottoms
**between** 12 fps f1 and f2, which the 24 fps contact sheet shows and the 12 fps
frames cannot, so it got a key at t = 1.5/12 s.

### Key density, and the trade it makes

Keys were placed by greedy insertion until the residual against the measured
per-frame series fell below **2 units (0.17 px) and 0.15°** — which is where my own
measurements stop repeating, not an arbitrary target. That yields 47 / 49 keys for
the two whips and 543 for `ball-catch`, 639 in all.

The honest caveat, and `diff` confirms it: because the reference frames sit at
12 fps, keys chosen this way cluster on the 12 fps grid, so `check` is largely
being asked about frames my keys land on — and at 639 keys against a reference the
rung describes as carrying 470 bezier keys, this file is denser than the thing it
reproduces. A sparser cut of the same measurements is available in the loop log
(4 units / 0.3° → 471 keys, MAE 19.6 / 17.0 / 17.0), and it is the more honest
description of a hand-made shot at a small cost in measured drift. I kept the
tighter one because the instruction for this run was to get drift as low as I
could, and because the noise floor is a defensible stopping rule; a reader who
cares more about structure than pixels should read the sparser figures as the
comparable ones. Either way the sub-frame curve shape is essentially unverified:
the 24 fps sheets are the only in-between evidence and only two of their frames are
on disk.

### What is known to be missing

Recorded here so nobody reads the diff and infers a mistake:

- the ball's spin — visible in the seams, but the per-frame fit was unstable
  (±90° at indistinguishable error), so no rotate timeline was authored;
- the ball's squash and stretch — measured (component axes 11.1/6.9 px at f0084,
  12.2/8.1 px at f0085, against 9.0/9.0 at rest) and deliberately not authored;
- `chain5`'s rotation — not observable at 11 px across; locked to `chain4`;
- a separate bone for the shading overlay — the frames show it does not rotate
  with the ball, and this rig gets that for free only because the ball does not
  rotate either.
