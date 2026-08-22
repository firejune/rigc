# Rung 2 brief — `2-the-12-principles`

> **Revision 2 — 2026-08-23.** Verified against the contact sheets by Claude Opus 5
> (1M context), Claude Code / Agent SDK, independently of the run that first
> disputed it. Revision 1 asserted six things the frames do not show: the water
> level falls (it never moves); the rings turn *slowly* (they turn once every 15
> frames); the panel swings flat *because the ball reaches it* (it is on its own
> clock and never goes flat); a ring PNG is used twice (the third ring is painted
> into the set); every ball ends in the basin (two of the four do); and almost all
> of the event happens in the first four seconds (4.6 s to 9.75 s, by ball). Each is
> replaced below by what was measured. The rung 2 run
> ([`bench/runs/2026-08-23-rung2-1/`](../runs/2026-08-23-rung2-1/)) lost two detours
> to the first three of them before overruling the brief with its own measurements,
> which is why [`bench/runs/README.md`](../runs/README.md) now requires a second
> agent to check a brief against the frames before it is run.

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
  26 seconds each. Budget accordingly. The ball's own run is a small part of that:
  it reaches its final resting place at about **4.6 s** (basketball), **7.6 s**
  (bowling), **7.8 s** (billiard) and **9.75 s** (tennis), and after that only the
  rings and the panel are still moving.

## The art

`examples/2-the-12-principles/images/` — fetched by `bun run fetch-examples`, not
redistributed in this repository.

| File | What it is |
| --- | --- |
| `obstacle-course.png` | the whole set: a large L-shaped structure, a sloping wall down the left, a floor along the bottom, a deep U-shaped basin at the right |
| `water.png` | a flat pale-blue sheet — the water sitting in the basin |
| `platform.png` | a small upright panel on a hinge, standing beside the basin |
| `ring-big.png`, `ring-small.png` | two open rings, each a circle with a gap in it. Three rings are on screen; **the third one is painted into `obstacle-course.png`** and never moves, so these two PNGs account for the two that turn — one each |
| `basket-ball.png`, `billiard-ball.png`, `bowling-ball.png`, `tennis-ball.png` | four balls, one per shot: a big brown basketball with seams, a very small dark billiard ball with a light patch on it, a mid-sized dark blue bowling ball, a small yellow-green tennis ball |
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
on it; two open rings hanging in the air above the middle of the L, the upper one
the larger and the smaller one below it and a little to the right; a third, smaller
ring cradled on a little lattice tower lower down — **that one is part of the set
art and never moves**; a floor running along the bottom; then a deep U-shaped basin
at the right with water in it, and an upright hinged panel standing between the
floor and the basin.

Each shot starts with its ball at the very top-left corner of the sloping wall, and
runs the same route as far as it gets:

1. the ball rolls down the sloping wall from the corner;
2. it drops through the upper ring, then the lower one;
3. it comes down over the small ring on the lattice tower;
4. it lands and bounces along towards the basin, past the upright panel;
5. one high bounce, and it comes down into the water in the basin.

**Only two of the four finish the route.** The basketball and the bowling ball reach
the basin; the billiard ball and the tennis ball come to rest **in the bowl of the
small painted ring** — the billiard ball at frame 94, the tennis ball at frame 117 —
and never touch the water. In their two shots the basin is bit-identical in all 311
frames.

**The four are not one shot at four speeds.** They part company almost immediately.
One second in (frame 12): the basketball is already at the centre of the upper ring;
the bowling ball is about two thirds of the way down the sloping wall; the two small
balls are slower still — at 2–3 px across, exactly where on the wall they are at
that moment is below what a ¼-scale tile will tell you. They differ at the end too — the basketball finishes **floating on the
surface**, while the bowling ball **sinks and settles on the floor of the basin**.

**The panel is not waiting for the ball.** It drops and springs back on a cycle of
its own, about every 27½ frames (≈2.3 s), roughly eleven times over the shot,
frame-for-frame identical in all four animations — including the two whose ball
never gets near it. It does not swing flat, either: it collapses to about 40–45 % of
its standing height over a couple of frames, stays down for 16 frames, and takes
about 11 back up. In the bowling shot the ball happens to arrive while the panel is
down, **rests on the lowered panel for six frames, and is thrown nearly half the
height of the frame in four when it springs back** — that launch is what puts it in
the basin. Nothing the ball does changes when the panel moves.

The two small balls are a few pixels across at this framing. Find them on a contact
sheet before you try to track them, and see §8 of the guide about what a
whole-silhouette estimator does to a small thing next to a big static one.

Two things run for the whole 25.8 seconds regardless of which ball it is, and they
are why the frames never stop changing after the ball has stopped:

- the two hanging rings **spin, fast and steadily**, from the first frame to the
  last: **a full revolution every 15 frames** — 1¼ s a turn, about 20⅔ turns over
  the shot — and **the two turn opposite ways**, the upper one clockwise on screen
  and the lower one anticlockwise. Sample intermediate frames rather than comparing
  the first and last: the endpoints alone give a plausible-looking ~163°, which is
  the residue of the real spin taken mod 360;
- the **hinged panel** cycles down and back up, as described above.

The **water does not move at all.** Its surface sits on the same rows in the first
and last frame of every shot, and in the two shots where nothing enters the basin
the whole basin region is bit-identical across all 311 frames.

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

None of them returns to its first frame: by the end the rings have stopped on a
different angle, the panel is at a different point in its cycle, and the ball is a
long way from the corner it started in.

### The comparison, in one line

Same course, four balls — the basketball is at the centre of the upper ring while
the bowling ball is still on the wall and the two small ones are slower again; and
only those two heavy balls finish the course, one floating in the basin and one on
the bottom of it, while the light pair stall in the little painted ring on the tower
and sit there for the rest of the shot.

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
