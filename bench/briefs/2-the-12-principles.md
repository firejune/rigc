# Rung 2 brief — `2-the-12-principles`

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

Author a rig spec and a motion spec that reproduce this shot — one skeleton, four
animations — compile them with rigc, and get a green gate.

```bash
bun cli.ts build \
  --rig    <your>.rig.json \
  --motion <your>.motion.json \
  --images examples/2-the-12-principles/images \
  --out    <your-out-dir> \
  --profile spine

bun cli.ts bench 2 --candidate <your-out-dir> --json report.json
```

Notes on the shape of the deliverable:

- **You do not need an atlas.** The art is loose PNGs and rigc emits its own
  one-part-per-page atlas from them. Point `--images` at the images directory.
- rigc requires a `skeleton.width`/`skeleton.height` when there is no cut manifest.
  Nothing in the scoring reads the skeleton header — pick something that comfortably
  contains the shot and move on.
- Names are yours. `diff` reports name-matched and name-agnostic figures side by
  side, precisely so that a rig built correctly under its own names is not called a
  total failure.
- This is the **longest** rung on the ladder by a wide margin: four shots of nearly
  26 seconds each. Budget accordingly, and note that almost all of the event
  happens in the first four seconds of each.

## The art

`examples/2-the-12-principles/images/` — fetched by `bun run fetch-examples`, not
redistributed in this repository.

| File | What it is |
| --- | --- |
| `obstacle-course.png` | the whole set: a large L-shaped structure, a sloping wall down the left, a floor along the bottom, a deep U-shaped basin at the right |
| `water.png` | a flat pale-blue sheet — the water sitting in the basin |
| `platform.png` | a small upright panel on a hinge, standing beside the basin |
| `ring-big.png`, `ring-small.png` | two open rings, each a circle with a gap in it |
| `basket-ball.png`, `billiard-ball.png`, `bowling-ball.png`, `tennis-ball.png` | four balls, one per shot: a big brown basketball with seams, a very small pale billiard ball, a mid-sized dark blue bowling ball, a small yellow-green tennis ball |
| `basket-lambertian.png`, `billiard-lambertian.png`, `bowling-lambertian.png`, `tennis-lambertian.png` | a soft light-and-shade disc for each ball |
| `billiard-specular.png`, `bowling-specular.png` | a second, harder highlight disc — the art carries one for two of the four |

## The reference frames

[`bench/reference/2-the-12-principles/`](../reference/2-the-12-principles/), 12
frames per second, all four animations sharing one viewport so they are directly
comparable.

- `basketball/`, `billiard-ball/`, `bowling-ball/`, `tennis-ball/` — one directory
  each
- `contact.png` in each — **all 311 frames** of that animation as one labelled
  grid, row major
- `f0000.png` and `f0310.png` in each — the first and last frame at full size

🚧 **This rung's reference is the sparsest on the ladder, and deliberately so.**
Four shots of 25.8 s is 1,244 frames; as separate files that is over sixty
megabytes of near-identical pictures of a static set, because most of every frame is
the course redrawn. One contact sheet holds the same 311 frames for about a
seventeenth of that, since the redrawn set compresses against the previous tile. So
the sheets carry every frame and the two stills carry the full-size detail. **Read
the sheets as the frame set** — they are not an index to files that exist.

## What the shot is

The principle is the whole dozen at once: the same course run by four balls of very
different weight and bounce, so that timing, spacing, arcs, follow-through and the
rest all fall out of what the ball is.

The set, left to right: a sloping wall down the left side of an L, with a blue lamp
on it; two large open rings hanging in the air above the middle of the L, one above
the other; a third, smaller ring on a little lattice tower lower down; a floor
running along the bottom; then a deep U-shaped basin at the right with water in it,
and an upright hinged panel standing between the floor and the basin.

Each shot starts with its ball at the very top-left corner of the sloping wall, and
runs the same route:

1. the ball rolls down the sloping wall;
2. it drops through the upper ring, then through the lower one;
3. it comes down onto the floor of the course and bounces along it;
4. it knocks the upright panel open as it passes — the panel swings out of the way
   and swings back afterwards;
5. it goes into the water in the basin.

**The four are not one shot at four speeds.** They part company almost immediately.
One second in (frame 12): the basketball is already inside the upper ring; the
bowling ball is barely past the corner of the wall; the tennis ball and the billiard
ball have hardly left it. They differ at the end too — the basketball finishes
**floating on the surface**, while the bowling ball **sinks and settles on the floor
of the basin**.

The two small balls are a few pixels across at this framing. Find them on a contact
sheet before you try to track them, and see §8 of the guide about what a
whole-silhouette estimator does to a small thing next to a big static one.

Two things run for the whole 25.8 seconds regardless of which ball it is, and they
are why the frames never stop changing after the ball has stopped:

- the two large rings **turn slowly and continuously**, from the first frame to the
  last;
- the **water level in the basin falls** slowly over the length of the shot.

Every ball is drawn with a **soft light-and-shade laid over its own markings** — the
basketball's seams show through it — so each reads as a lit sphere rather than a
flat picture. The art list carries a second, harder highlight for two of the four,
which is worth knowing before you decide a ball is one piece.

### The four animations

| Animation | Frames | Length | Ends where it began? |
| --- | --- | --- | --- |
| `basketball` | 311 | 25⅚ s (310/12 s) | no |
| `billiard-ball` | 311 | 25⅚ s | no |
| `bowling-ball` | 311 | 25⅚ s | no |
| `tennis-ball` | 311 | 25⅚ s | no |

None of them returns to its first frame: by the end the rings have turned, the
water is lower, and the ball is in the basin.

### The comparison, in one line

Same course, same route, four balls — and the heavy one is through the upper ring
before the light ones have left the corner, while the light ones are still bouncing
long after the heavy one has sunk.

## How the result is read

`bench 2` does two things and does not merge them:

1. **Validity** — `validate --profile spine` on your candidate. This is the only
   pass/fail. A candidate that is not valid Spine 4.3 has not cleared anything.
2. **Structural diff** — a ratio per measure against the reference export, in six
   sections. **There is no rung score**, on purpose: a rig with the right skeleton
   and the wrong timing and a rig with the right timing and the wrong skeleton call
   for opposite fixes. A person reads the measures and records the judgement in
   [docs/LADDER.md](../../docs/LADDER.md).

So do not tune toward a number. Author the shot, get the gate green, and let the
measures say where it landed.

## Deliverables

See [`bench/runs/README.md`](../runs/README.md) for the run protocol — where the
output goes, what has to be recorded, and what you must not read. Read
[docs/AUTHORING.md](../../docs/AUTHORING.md) first, **including §8**, which is
about measuring reference frames and was written from the mistakes the first ladder
run made doing exactly that.
