# Rung 1 — `1-weight-and-mass` — attempt 1

**Clean.** `bench` was run once per candidate, at the end, and nothing was edited
after seeing it. This run is not bench-assisted.

| | |
| --- | --- |
| date | 2026-08-23 |
| agent | Claude Opus 5 (1M context), Claude Code / Agent SDK subagent |
| profile | `spine` |
| candidates | 2 — `balls-spine/`, `drop-spine/` |
| gate | green on both, on every build |
| loop log | [LOOP.md](LOOP.md) |

## Inputs

Read: the brief (`bench/briefs/1-weight-and-mass.md`), `docs/AUTHORING.md`
including §8, `bench/runs/README.md`, the art in
`examples/1-weight-and-mass/images/`, and the reference **renders** in
`bench/reference/1-weight-and-mass/` — both contact sheets, all 40 frames of
`balls/animation`, all 79 of `balls/animation@24fps`, and the single `drop`
frame. Of the repository's own source I read `src/png.ts`, `tools/png_probe.mjs`
(to decode PNGs for measuring) and three lines of `src/validate.ts` (to find how
a skeleton is loaded, for the self-check described in the log).

Not read: `examples/*/export/**`, `bench/transcriptions/**`, any other run
directory, `docs/SPEC_COVERAGE.md`, `docs/LADDER.md`, `docs/feature_matrix.*`,
`bench/count_features.ts`, `bench/render_reference.ts`, git history. No web
search was made about this example.

## Files

```
balls.rig.json    balls.motion.json    balls-spine/   bench-balls.json
drop.rig.json     drop.motion.json     drop-spine/    bench-drop.json
```

The atlas page paths point out to `examples/…/images/`, which is fetched rather
than redistributed, so the compiled directories hold `skeleton.json` and
`skeleton.atlas` only.

## What was authored

**`balls`** — 9 bones (a root, four shadow bones on the ground line, four ball
bones at each ball's rest centre), 8 slots with the four shadows drawn first,
one `default` skin of 8 region attachments, and one animation called `animation`,
3.25 s, 15 timelines, 190 keys, 93 fitted easings:

- `translatey` per ball — the balls never move sideways, so the paired form would
  emit a flat second channel that is not in the shot (§4.4);
- `scale` on the three deforming balls, and **none on the steel ball**;
- `scale` and slot `rgba` per shadow — both its size and its opacity are
  animated, and the opacity range (α 0.28 → 0.99) is as large a part of the
  effect as the size.

**`drop`** — 5 bones, 4 slots, and one empty animation named `ready-to-animate`
at `duration: 0`, per the brief.

## `bench 1`, run once per candidate

`bench 1` diffs one candidate against **both** reference skeletons, so each run
prints a `balls` line and a `drop` line. Only the line naming the same skeleton
as the candidate is a measurement; the other is a candidate compared against a
skeleton it was never meant to be.

### Run A — `--candidate balls-spine` → `bench-balls.json`

```
  ── summary ──
  validate   green  (profile spine)
  balls      bones=0.438  slots=0.143  attachments=0.778  constraints=1.000  animations=0.764  events=1.000
  drop       bones=0.219  slots=0.089  attachments=0.694  constraints=1.000  animations=0.222  events=1.000
```

The `balls` line is this candidate's. The `drop` line is the `balls` candidate
measured against the `drop` reference — noise, quoted only because the tool
prints it.

### Run B — `--candidate drop-spine` → `bench-drop.json`

```
  ── summary ──
  validate   green  (profile spine)
  balls      bones=0.260  slots=0.071  attachments=0.667  constraints=1.000  animations=0.222  events=1.000
  drop       bones=0.650  slots=0.557  attachments=0.856  constraints=1.000  animations=1.000  events=1.000
```

The `drop` line is this candidate's; the `balls` line is noise.

## Reading the measures

### `balls` — the shape is right and the names are not

```
1.000  bones.count              9/9     1.000  bones.depth_histogram    9/9
1.000  bones.degree_sequence    9/9     0.059  bones.names              1/17
0.111  bones.parent_by_name     1/9     0.111  bones.order              1/9
1.000  slots.count              8/8     0.000  slots.names              0/16
1.000  attachments.count        8/8     1.000  attachments.type_counts  8/8
1.000  attachments.skins        1/1     0.000  attachments.names        0/16
```

Every name-agnostic structural measure is 1.000. Nine bones, at the same depths,
with the same child counts; eight slots; eight region attachments in one skin
called `default`. The reference and this candidate have the **same skeleton
shape**, and `root` is the only name they share — every per-object measure keyed
by name therefore reads near zero for one reason, not eight. `bones.names` is
1/17 rather than 1/9 because the denominator is the union of two disjoint name
sets. Nothing here says a bone is in the wrong place; it says a rig authored
under its own names cannot be scored by name, which the brief warns about and
which the name-agnostic pair exists to answer.

The one structural miss:

```
0.000  attachments.region_size_present  0/8
```

Not a mistake. R5 measures the PNG and R1 emits what is declared, so a rigc
region authored with `image` always states `width` and `height`; Spine's exporter
omits them when they equal the atlas region. This measure cannot be won by any
rig rigc compiles from loose art, and it reads 3/5 on `drop` for the same reason.

### `balls` — the animation

```
1.000  animations.count         1/1     1.000  animations.names         1/1
0.000  animations.duration      0/1     0.682  animations.timeline_kinds 15/22
0.696  animations.key_counts    190/273 0.502  animations.curve_kinds   137/273
1.000  animations.draw_order    1/1     1.000  animations.deform        1/1
```

`animations.names 1/1` is the only name in this run that landed: the animation is
called `animation`, which the frame directory gave away. Beyond that:

- **The reference has 22 timelines to my 15, and 273 keys to my 190.** I expected
  the opposite — that measuring frames would over-key. It under-keyed by about a
  third. Seven timelines exist that I did not author at all. Two guesses I
  cannot check without reading the answer: the balls' shadows may translate as
  well as scale, and the flattens may be carried by a channel I folded into
  another (I used paired `scale`; single-axis `scalex`/`scaley` timelines would
  count as two).
- **`curve_kinds` 137/273** — half the keys agree about being linear, stepped or
  bezier. Given that I fitted a bezier to every segment with two or more interior
  frames and left the short ones linear, the disagreement is probably about which
  keys are linear, not about the shape of the bezier ones.
- **`duration` 0/1.** Mine is 3.25 s, and the brief says 40 frames at 12 fps
  = 39/12 = 3.25 s. The measure allows one frame of slack, so the reference's
  last key is more than 1/60 s past 3.25. A 12 fps render of 40 frames is
  consistent with any duration in [3.25, 3.333); a 24 fps render of 79 frames
  narrows it to [3.25, 3.292). The rendered frame counts cannot resolve it
  further, so this measure is not winnable from the frames either — the last key
  of a shot that ends at rest leaves no trace in the last frame.

### `drop` — a whole layer I could not see

```
0.800  bones.count       4/5     0.800  bones.names            4/5
0.800  slots.count       4/5     0.500  slots.names            3/6
0.200  slots.order       1/5     0.200  bones.length_present   1/5
1.000  animations.*      all     0.856  attachments (section mean)
```

Four of five bone names match — `root`, `rock`, `stick`, `sword` are exactly what
the reference calls them, which is the one place in this run where the obvious
name was the right name. The mismatch is mine: `bones.count 4/5` with a union of
5 says the reference has **four** bones where I have five, so its ground plate
hangs off `root` and does not get a bone of its own.

More interesting, `slots.count 4/5` runs the other way: the reference has **five**
slots where I have four. Combined with `slots.names 3/6` — three shared out of a
six-name union — the two slots I do not have are its two ground layers, against
my one. So `ground-cover.png` **is** in this shot, and §M8 of the log records
exactly how thoroughly it is invisible: I box-filtered `ground-bg.png` down to
the rendered size and differenced it against the slab, and the residual has no
rectangle in it anywhere, though a fully opaque 341 × 118 tile would be an
unmissable 65 × 22 one. It is behind the plate, or masked by it, or off in a
corner the framing crops. The brief's art table says the ground is "in two
layers" in plain words, and I let a pixel measurement overrule a sentence. That
is the one place in this run where the brief knew something the frames did not,
and the right reading was to believe it.

`bones.length_present 1/5` and the `inherit` measure beside it are a different
kind of miss: a rendered frame carries no trace of a bone's `length` or of its
inheritance mode, so a run authored from pictures cannot recover them at all.
`animations` is 1.000 across every measure — a zero-length named animation is
easy to get exactly right, which is presumably part of why it is on this rung.

### What I would tell the next run

The gate stayed green through a build in which every easing in the file was
reversed. Getting the *values* out of the frames was tractable; getting the
*shape between them* was where the work and the one real error were, and nothing
in the loop can see it. If you author from pictures, build a self-check that
poses your own candidate and compares it back against your measurements — the log
describes the one I used — and treat the brief's prose as evidence with the same
standing as a pixel.
