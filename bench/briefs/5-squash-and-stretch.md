# Rung 5 brief — `5-squash-and-stretch`

> **Revision 3 — 2026-08-26.** Second verification pass, and the first by a
> **different** agent than the one that wrote revision 2 (Claude Opus 5 (1M
> context), Claude Code / Agent SDK), under the protocol in
> [`bench/runs/README.md`](../runs/README.md). Revision 2's ball measurements all
> reproduce to the digit — the 4 × 4 / 2 × 5 / 5 × 3 silhouettes, the three named
> frames, the 30 px spike clearance — and so do the girder findings: the character
> is one pixel column clear of the lattice at `speedy/f0058` and covers exactly two
> of its pixels at `speedy/f0062`, which is the only frame in either shot where any
> girder pixel changes. What was wrong:
>
> - **the girder is not above the right-hand block.** It hangs above the right-hand
>   spike bed, columns 125–129 of 192, immediately left of the right-hand ledge; the
>   block is columns 154–184. Said twice in revision 2, corrected in both places;
> - **`ball-ready-to-animate` is not "nothing keyed".** What the frame shows is the
>   set with the ball at its corner *and no character on screen*, and revision 2's
>   instruction to emit the animation "with no tracks" will not produce that from a
>   skeleton that has to carry the character for `speedy`;
> - **the route is missing its last leg.** After the right-hand ledge the ball goes
>   up, across to the girder and down its side before it arcs onto the block;
> - the set is **5,556** px, not 5,116 (the *at most 6* overwritten is exact);
> - "the last three frames are pixel-identical" — the last **four** are, and nothing
>   moves after frame 75;
> - the character reaches **26** px stretched, not 24;
> - the hair should not have been counted among the swap sets — see `speedy` below.
>
> Added: `ball` holds **three** times, not once, and revision 2 named only the last.

> **Revision 2 — 2026-08-23.** Verified against the frames and contact sheets by
> Claude Opus 5 (1M context), Claude Code / Agent SDK, under the protocol in
> [`bench/runs/README.md`](../runs/README.md). This rung has not been attempted; the
> pass was prompted by revision 1 of the rung 2 brief shipping claims that were not
> in the pixels. The ball measurements below all held. Two things did not: the
> `speedy/f0058` ↔ `speedy/f0062` girder moment (at 192 px the character never covers
> the girder at frame 58 — he is one pixel column clear of it — and the only frame in
> the whole shot where any girder pixel changes is 62, by two pixels), and "still for
> the last two frames" (the last **three** are pixel-identical). The route also gains
> the bounce it was missing.

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
| `hair-1.png`, `hair-2.png` | two hair tufts of much the same shape in two colours — one bright orange, one darker brown. Two files in two colours is a different pattern from the many-drawings-of-one-shape sets below; see `speedy` |
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
one viewport, so the ball is about **4 px** across and the character about **16 px**
tall standing — up to 26 px when he is stretched out. That is enough to *measure* a
silhouette's proportions and not enough to eyeball them. Read the numbers below as
what you should be able to reproduce from measurement, not as something the pictures
will show you at a glance.

## What the shot is

The principle is **squash and stretch**: a thing that keeps its volume but not its
shape, drawing out along the way it is going and flattening when it lands.

The set, left to right: a tall block on the left with a blue lamp set into it and a
striped barrier on top; a low ledge stepping down from it; a bed of spikes along the
floor; two thin lattice pillars standing in the spikes, each with a flat cap;
another bed of spikes; a low ledge on the right stepping up to a second tall block;
and, hanging in the air **above that second bed of spikes**, immediately to the left
of the right-hand ledge, a single orange lattice girder. ⚠️ It is *not* over the
right-hand block: the girder occupies pixel columns 125–129 of 192, the ledge starts
at 133 and the block itself at 154.

### `ball` — 79 frames, 6½ seconds (78/12 s)

A small orange ball crosses the whole set, left to right. It starts high at the left
edge, drops, and bounces its way across — first off the top of the tall left block
itself (frame 3), then off the low left ledge (frames 10–19), off the flat caps of
the two pillars (frames 26 and 31), off the right-hand ledge (frames 39–49) — and
then a last leg that is easy to miss: **it goes up the left face of the right-hand
block, crosses to the girder, runs down the girder's right side over frames 58–62,
and only then arcs up and over onto the top of the block** (landing frame 69, at rest
from frame 75). The girder is a stop on the route, not scenery. ✅ It stays above the
spike beds the whole way, and by a wide margin: over open spikes it never comes
within about 30 px of the tips.

⭐ **The ball's shape is the shot.** It draws out along its direction of travel
while it is moving fast and flattens on the frame it lands. Measured off these
frames, its silhouette runs **4 × 4 to 4 × 5** near the top of an arc, **2 × 5**
part-way down a fast fall, and **5 × 3** on a landing frame — so the proportion
swings by roughly a factor of two either side of round.

- a drawn-out one: `ball/f0010.png`
- a flattened one: `ball/f0026.png`
- round, at rest: `ball/f0078.png`

⚠️ **It stops dead three separate times, and two of them are mid-shot.** The whole
picture is bit-identical from one frame to the next at **frames 16 → 17 → 18**
(resting on the low left ledge), again at **frames 46 → 47** (resting on the
right-hand ledge), and then for the rest of the shot from **frame 75** on. A hold in
this shot is a *hold*, not a slow passage: if your ball moves by a pixel across any
of those pairs, the shot is wrong there in a way the contact sheet will not show you
and a frame-by-frame comparison will.

**Ends nowhere near where it began** — it starts at the top left and finishes at the
top right — and the **last four frames are pixel-identical**: nothing at all moves
after frame 75.

### `speedy` — 79 frames, 6½ seconds (78/12 s)

The same crossing, made by the character instead of the ball: same length, same
route, same landmarks. He runs, jumps the two spike beds, uses the pillar caps, and
climbs the right-hand block.

Note what the art list is telling you about him: six drawings of each hood tip, four
of each foot. A part that ships with six drawings of itself is a
part that gets **swapped**, not one that gets posed — that is a decision to make in
the rig before you start keying angles. 🚫 **The two hair files are not on that
list.** Two drawings of something is not the evidence six is, and at this scale the
frames cannot settle whether they are alternates of one tuft or two tufts drawn
together — so do not read a swap into them, and do not read the absence of one either.

⚠️ **He never gets in front of the set, anywhere in this shot.** Across all 79
frames his silhouette overwrites at most **6** of the set's 5,556 pixels, and those
are antialiased edges. He runs along the tops of things, so there is almost nothing
for him to cross: at the orange girder he comes closest,
standing one pixel column clear of it at `speedy/f0058.png` (the lattice is
untouched) and covering **two** of its pixels at `speedy/f0062.png`. Nothing in these
frames tells you anything about draw order beyond "the set is in front", and two
pixels is not evidence of a change. Do not build a reordering out of it — and do not
take the absence as evidence either way.

**Ends nowhere near where it began.** Unlike `ball`, he is still moving on the last
frame.

### `ball-ready-to-animate` — 0 seconds, a single pose

The set with the ball back at its starting corner, held, and **no character on
screen** — `ball-ready-to-animate/f0000.png` is pixel-identical to `ball/f0000.png`,
and both differ from `speedy/f0000.png` by exactly the character. The animation is
zero seconds long and exists to name that pose.

⚠️ **It is one skeleton for all three shots, so "no character on screen" is
something the rig has to arrange.** Whatever your setup pose draws, this shot's one
frame — and every frame of `ball` — has to come out with the course and the ball and
nothing else, and `speedy` has to come out with the character. Do not assume an
empty animation gets you there; render it and look.

### The comparison, in one line

Two crossings of one course — a ball that survives by changing shape, and a
character who survives by changing which drawing of himself is on screen.

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
