# Rung 1 brief — `1-weight-and-mass`

> **Revision 2 — 2026-08-26.** First verification pass, by a different agent than
> the one that wrote it (Claude Opus 5 (1M context), Claude Code / Agent SDK), under
> the protocol in [`bench/runs/README.md`](../runs/README.md). Every quantitative
> claim was measured off the committed frames. What was wrong:
>
> - the four balls were said to start at **staggered heights** — their bottom edges
>   are level and all four fall the same distance;
> - all three deforming balls were said to rebound "a little over half" — the
>   **red** one rebounds two thirds; and the steel ball's own hop is a fifth of its
>   fall rather than a sixth, with two smaller hops after it that went unmentioned;
> - "the two rubber balls are still moving in the final frames" — only the **red**
>   one is; the blue one stops before the beach ball does;
> - "the 12 fps set does not contain a single one of them" (the flattenings) — it
>   contains two;
> - the beach ball was said to be "round as it arrives" at `animation@24fps/f0012`
>   — it is drawn out and narrow there;
> - its narrowest silhouette is **55 px**, not 57, so the shape change is not
>   symmetric.
>
> Missing: each shadow's **opacity** tracks its ball's height, which is the largest
> single thing the shadows do and the brief described only their width. `drop` held
> entire. So did the durations, the four contact frames, the columns, the steel
> ball's rigidity, the arc counts and the beach ball's 61 px rest silhouette.

> ## The leakage rule this brief was written under
>
> ⭐ **Everything below is something a client watching the finished animation
> could tell you.** Nothing below was copied out of the reference `skeleton.json`.
>
> This brief is allowed to name the image files, name the animations, state each
> animation's length and whether it ends where it began, describe in plain words
> what a viewer sees, and point at the rendered reference frames.
>
> It deliberately does **not** carry bone names, bone counts, the hierarchy, key
> times, key values, curve handles, timeline kinds, slot names, the setup pose, the
> stage size, or any other fact that only reading the reference JSON could supply.
> Those omissions are the measurement, not an oversight: an agent that has seen the
> answer is being scored on transcription. **If you have the reference export in
> context, stop — this run cannot be recorded.**

## The job

This rung is **two shots**, not one: `1-weight-and-mass` ships two skeletons and
`bench 1` measures both. Author a rig and a motion spec for each, compile each with
rigc, and get a green gate on each.

```bash
bun cli.ts build \
  --rig    <your>.rig.json \
  --motion <your>.motion.json \
  --images examples/1-weight-and-mass/images \
  --out    <your-out-dir> \
  --profile spine

bun cli.ts bench 1 --candidate <your-out-dir> --json report.json
```

⚠️ **`bench 1` takes one candidate and diffs it against both references**, so it
prints a `balls` line and a `drop` line whichever candidate you hand it. Run it
twice — once per candidate — and read the matching line from each run. Record both
runs in the log; the other line in each is noise, and say so rather than quoting it.

Notes on the shape of the deliverable:

- **You do not need an atlas.** The art is loose PNGs and rigc emits its own
  one-part-per-page atlas from them. Point `--images` at the images directory. Only
  the parts a shot actually shows need to be in that shot's rig.
- rigc requires a `skeleton.width`/`skeleton.height` when there is no cut manifest.
  Nothing in the scoring reads the skeleton header — pick something that comfortably
  contains the shot and move on.
- Names are yours. `diff` reports name-matched and name-agnostic figures side by
  side, precisely so that a rig built correctly under its own names is not called a
  total failure.

## The art

`examples/1-weight-and-mass/images/` — fetched by `bun run fetch-examples`, not
redistributed in this repository. Thirteen files, and the two shots use different
subsets of them.

| File | What it is |
| --- | --- |
| `beach-ball.png` | a large striped ball — white with red, yellow and blue panels |
| `red-rubber-ball.png` | a medium plain red ball |
| `blue-rubber-ball.png` | a smaller plain blue ball |
| `steel-ball.png` | a small dark grey ball with a hard highlight |
| `cast-shadow-beach.png`, `cast-shadow-red.png`, `cast-shadow-blue.png`, `cast-shadow-iron.png` | one soft dark ellipse each — the shadow that goes under the matching ball |
| `ground-bg.png`, `ground-cover.png` | a slab of cracked dry earth, in two layers |
| `rock.png` | a pale grey rock |
| `stick.png` | a bare wooden stick |
| `sword.png` | a sword, blade up |

## The reference frames

[`bench/reference/1-weight-and-mass/`](../reference/1-weight-and-mass/), rendered
from the official export. **One directory per skeleton**, because the two are
different shots that happen to share an atlas and they are framed independently:

- `balls/animation/f0000.png` … `f0039.png` — 40 frames at **12 fps**
- `balls/animation@24fps/f0000.png` … `f0078.png` — the same shot at **24 fps**
- `drop/ready-to-animate/f0000.png` — one frame; that shot holds a single pose
- `contact.png` in each — every frame of that animation as one labelled grid, row
  major. **Look at the contact sheets first.**

The 24 fps set is there because the fastest part of this shot happens between two
12 fps frames. Read the two sets as two sets: they share a viewport and a scale, so
a distance measured in one is a distance in the other, but a frame index in one is
not a frame index in the other.

## What the shot is

The principle is **weight and mass**: the same event given to four objects of very
different heft, so that what separates them is how much each one seems to weigh.

### `balls` — 40 frames, 3¼ seconds (39/12 s)

Four balls hang in the air in a row, each with its own soft shadow on the ground
below it: the big striped beach ball at the far left, then the red rubber ball,
then the smaller blue one, and the small dark steel ball at the right.

⚠️ **They are all at the same height, and it does not look like it.** Their **bottom
edges are level** — all four sit about 150 px above the ground and fall the same
distance — so the row looks like it slopes down to the right only because the balls
are four different sizes. Measure the bottoms, not the tops.

**Nothing travels sideways at any point.** Every ball goes straight up and down in
its own column for the whole shot.

They are released together and reach the ground within a frame of each other
(around **f5–f6**). From there they part completely:

- the **steel ball** barely rebounds. Its first hop comes back about a fifth of the
  way to where it was dropped from — 31 px of a 151 px fall — and there are two more
  after it, about 10 px and about 3 px, easiest to see in the 24 fps set. It is at
  rest by **f12** — a
  third of the way into the shot — and never moves again;
- the **beach ball** and the **blue** rubber ball rebound to a little over **half**
  the height they fell from; the **red** one is the bounciest of the four and comes
  back **two thirds** of the way. Then again, and again: you can pick out three or
  four arcs each, every one lower than the last;
- they do not settle together either, and not in the order you would guess. The
  **blue** ball is the first to stop — its silhouette stops changing at **f28** —
  then the beach ball around **f33**, and the **red** one is still moving a pixel at
  a time in the last frame of both sets.

Three of the four **change shape as they go.** The beach ball and both rubber balls
draw out taller and narrower while they are falling fast, and flatten wider than
they are tall on the frame they hit. The **steel ball never does**: it stays the
same circle throughout. That contrast is the shot.

⭐ **Each flattening lasts about one frame, and every ball's *first* impact falls
between two 12 fps frames** — which is what the 24 fps set is for. ⚠️ **Later
impacts are not all so obliging**: two of them land square on a 12 fps frame, and
you can measure the flattening there — `balls/animation/f0022.png` has the red ball
**31 px wide against its 29 px rest silhouette**, and `f0026.png` has the blue ball
at 23 against 22. So "no flattening at 12 fps" is not a rule you can lean on.

The red rubber ball is the clearest of the three:

- `balls/animation@24fps/f0010.png` — drawn out, taller than wide, on the way down
- `balls/animation@24fps/f0011.png` — flat and wide, on the ground
- `balls/animation@24fps/f0012.png` — tall again, on the way back up

The beach ball does the same one frame later, and it is worth opening both:
`f0012.png` catches it **drawn out and narrow** — 55 px across, not round — and
`f0013.png` is the flattened one, 65 px across. Its rest silhouette is 61 px, so the
change is **not symmetric**: about +6 % wide on the landing frame and about −10 %
narrow on the frame before it. Small enough that it is worth measuring rather than
judging by eye.

The **steel ball** is round in every frame of its own impact — open the same four
frames on its column and there is nothing to see. That is the point of it being
there.

Each shadow does two things at once, and the second is the bigger one:

- it **widens as its ball comes down and narrows as it goes up**;
- and it **darkens and fades with it**, from barely there when its ball is at the top
  of an arc to full strength on the frame the ball lands, over and over for as long
  as that ball keeps bouncing. Measured on the darkest pixel of each shadow, the
  swing runs from about 170 down to about 20 on a 0–232 scale — far more visible than
  the width change, and it is the one thing in this shot you are most likely to miss.

**Ends nowhere near where it began.** The last frame is four balls on the ground;
the first is four balls in the air.

### `drop` — one animation named `ready-to-animate`, 0 seconds

A held pose, and that is the whole shot: a slab of cracked dry earth across the
bottom, and three objects hanging in the air above it in a row — a rock, a bare
stick, and a sword standing blade-up. Nothing moves, and there is nothing keyed:
the animation is zero seconds long and exists to name the pose.

That is a legitimate deliverable and not a stepping stone. Give it an animation of
that name with no tracks and `duration: 0`; rigc emits it and `A09` compares 0
against 0. (A motion spec with `"animations": {}` is also legal — it emits no
animation at all and `A09` then reports SKIP — but this shot has one, so declare
it.)

### The comparison, in one line

Four balls, one drop, and the only thing that separates them is weight: the steel
one is finished before the beach ball has come down from its first bounce, and it
is the only one that keeps its shape.

## How the result is read

`bench 1` does two things and does not merge them:

1. **Validity** — `validate --profile spine` on your candidate. This is the only
   pass/fail. A candidate that is not valid Spine 4.3 has not cleared anything.
2. **Structural diff** — a ratio per measure against the reference export, in six
   sections, once per skeleton of the rung. **There is no rung score**, on purpose:
   a rig with the right skeleton and the wrong timing and a rig with the right
   timing and the wrong skeleton call for opposite fixes. A person reads the
   measures and records the judgement in [docs/LADDER.md](../../docs/LADDER.md).

So do not tune toward a number. Author the shot, get the gate green, and let the
measures say where it landed.

## Deliverables

See [`bench/runs/README.md`](../runs/README.md) for the run protocol — where the
output goes, what has to be recorded, and what you must not read. Read
[docs/AUTHORING.md](../../docs/AUTHORING.md) first, **including §8**, which is
about measuring reference frames and was written from the mistakes the first ladder
run made doing exactly that.
