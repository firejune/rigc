# Rung 5 brief — `5-squash-and-stretch`

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

Author a rig spec and a motion spec that reproduce this shot — one skeleton, three
animations — compile them with rigc, and get a green gate.

```bash
bun cli.ts build \
  --rig    <your>.rig.json \
  --motion <your>.motion.json \
  --images examples/5-squash-and-stretch/images \
  --out    <your-out-dir> \
  --profile spine

bun cli.ts bench 5 --candidate <your-out-dir> --json report.json
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
- This rung has the largest art set on the ladder so far — 29 files — and many of
  them are alternates of one part rather than parts of their own. Read the art table
  before you count parts.

## The art

`examples/5-squash-and-stretch/images/` — fetched by `bun run fetch-examples`, not
redistributed in this repository.

| File | What it is |
| --- | --- |
| `course.png` | the whole set in one piece — see below |
| `ball.png` | a small orange ball |
| `head.png`, `torso.png` | a character's head (with a big eye and an orange visor) and body |
| `hair-1.png`, `hair-2.png` | two drawings of a tuft of hair |
| `belt-ends.png` | two loose belt ends |
| `hood-end1a.png` … `hood-end1f.png`, `hood-end2a.png` … `hood-end2f.png` | six drawings each of two trailing hood tips |
| `left-hand.png`, `right-hand.png` | one hand each |
| `left-foot.png`, `left-foot-side.png`, `left-foot-bent01.png`, `left-foot-bent02.png` | four drawings of the left foot |
| `right-foot.png`, `right-foot-side.png`, `right-foot-bent01.png`, `right-foot-bent02.png` | four of the right |

## The reference frames

[`bench/reference/5-squash-and-stretch/`](../reference/5-squash-and-stretch/), 12
frames per second, all three animations sharing one viewport so they are directly
comparable.

- `ball/f0000.png` … `f0078.png` — 79 frames
- `speedy/f0000.png` … `f0078.png` — 79 frames
- `ball-ready-to-animate/f0000.png` — one frame; that shot holds a single pose
- `contact.png` beside the frames — every frame of that animation as one labelled
  grid, row major. **Look at the contact sheets first.**
- `<animation>@24fps/contact.png` — `ball` and `speedy` sampled at **24 fps**, as
  contact sheets only. The squash is a one-frame event and at 12 fps you land on it
  by luck; the 24 fps sheet is where you can see which side of a landing it is on.

⚠️ **The subject is small in these frames** — the set is wide and everything shares
one viewport, so the ball is about **4 px** across and the character about 14 px
tall. That is enough to *measure* a silhouette's proportions and not enough to
eyeball them. Read the numbers below as what you should be able to reproduce from
measurement, not as something the pictures will show you at a glance.

## What the shot is

The principle is **squash and stretch**: a thing that keeps its volume but not its
shape, drawing out along the way it is going and flattening when it lands.

The set, left to right: a tall block on the left with a blue lamp set into it and a
striped barrier on top; a low ledge stepping down from it; a bed of spikes along the
floor; two thin lattice pillars standing in the spikes, each with a flat cap;
another bed of spikes; a low ledge on the right stepping up to a second tall block;
and, hanging in the air above the right-hand block, a single orange lattice girder.

### `ball` — 79 frames, 6½ seconds (78/12 s)

A small orange ball crosses the whole set, left to right. It starts high at the left
edge, drops, and bounces its way across — off the low left ledge, off the flat caps
of the two pillars, off the right-hand ledge — and finishes on top of the right-hand
block. It stays above the spike beds the whole way.

⭐ **The ball's shape is the shot.** It draws out along its direction of travel
while it is moving fast and flattens on the frame it lands. Measured off these
frames, its silhouette runs about **4 wide × 5 tall** near the top of an arc,
**2 × 5** part-way down a fast fall, and **5 × 3** on a landing frame — so the
proportion swings by roughly a factor of two either side of round.

- a drawn-out one: `ball/f0010.png`
- a flattened one: `ball/f0026.png`
- round, at rest: `ball/f0078.png`

**Ends nowhere near where it began** — it starts at the top left and finishes at the
top right — and it is completely still for the last two frames.

### `speedy` — 79 frames, 6½ seconds (78/12 s)

The same crossing, made by the character instead of the ball: same length, same
route, same landmarks. He runs, jumps the two spike beds, uses the pillar caps, and
climbs the right-hand block.

Note what the art list is telling you about him: six drawings of each hood tip, four
of each foot, two of the hair. A part that ships with six drawings of itself is a
part that gets **swapped**, not one that gets posed — that is a decision to make in
the rig before you start keying angles.

⭐ **Watch the orange girder above the right-hand block as he goes up it.** At
`speedy/f0058.png` he is drawn **in front of** the girder — the lattice disappears
behind his body. Four frames later, at `speedy/f0062.png`, he is drawn **behind**
it — the same lattice crosses over his chest. The girder is one piece and it does
not move between those two frames: the only thing that changed is which of the two
is nearer the viewer. Whatever order you put things in to start with, this shot does
not keep it for its whole length.

(At 192 px the overlap is a couple of pixels wide. Open the two frames and compare
that region directly rather than looking for it on the contact sheet.)

**Ends nowhere near where it began.**

### `ball-ready-to-animate` — 0 seconds, a single pose

The set with the ball back at its starting corner, held. Nothing moves and nothing
is keyed; the animation is zero seconds long and exists to name the pose. Give it an
animation of that name with no tracks and `duration: 0`.

### The comparison, in one line

Two crossings of one course — a ball that survives by changing shape, and a
character who survives by changing which drawing of himself is on screen — and one
moment where he goes from being in front of a girder to being behind it.

## How the result is read

`bench 5` does two things and does not merge them:

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
