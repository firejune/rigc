# Rung 4 brief — `4-wave-principle`

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
  --images examples/4-wave-principle/images \
  --out    <your-out-dir> \
  --profile spine

bun cli.ts bench 4 --candidate <your-out-dir> --json report.json
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

## The art

`examples/4-wave-principle/images/` — fetched by `bun run fetch-examples`, not
redistributed in this repository. Eight files, and one of the three shots uses two
of them that the other two never show.

| File | What it is |
| --- | --- |
| `platform.png` | a flat dark disc seen nearly edge-on — a shallow saucer |
| `chain-1.png` … `chain-4.png` | four short links, each a dark bar with a small orange bead on it. They are drawn to sit end to end |
| `chain-end.png` | a fifth, slightly heavier link — the one that finishes the chain |
| `basket-ball.png` | a brown basketball with seams |
| `basket-lambertian.png` | a soft light-and-shade disc that goes over that ball |

## The reference frames

[`bench/reference/4-wave-principle/`](../reference/4-wave-principle/), rendered
from the official export, all three animations sharing one viewport so they are
directly comparable.

- `ball-catch/f0000.png` … `f0120.png` — 121 frames at **12 fps**
- `wave-by-hand/f0000.png` … `f0016.png` — 17 frames at 12 fps
- `wave-offset/f0000.png` … `f0016.png` — 17 frames at 12 fps
- `contact.png` in each — every frame of that animation as one labelled grid, row
  major. **Look at the contact sheets first.**
- `<animation>@24fps/contact.png` — the same three animations sampled at **24 fps**,
  as contact sheets only. They are here because the fast part of `ball-catch`
  happens between two 12 fps frames; the individual 24 fps frames were not worth
  their weight, so the sheet is the whole of that set.

⚠️ **The subject sits in the bottom-right eighth of the frame and the rest is
empty.** That is not a rendering fault: all three animations share one viewport, and
`ball-catch` throws its ball far up and to the left, so the box that holds all three
is mostly sky. The frames are rendered large (768 px on the long side) so the
subject is still legible inside it. Every frame of every animation here uses the
same box and the same scale, so a distance measured in one is a distance in
another — which is the whole reason for framing them together.

## What the shot is

The principle is the **wave**: one disturbance travelling down a chain of parts,
each one starting a beat after the one above it, so the chain bends instead of
swinging as a stick.

The set is the same in all three shots: a flat disc hangs in the air with a short
chain of five links dangling from its underside, the last one a little heavier than
the rest.

### `wave-by-hand` and `wave-offset` — 17 frames each, 1⅓ seconds (16/12 s)

One whip of the chain, and nothing else in the frame.

The disc tips, and the chain swings out to the right and back. Each link starts
after the one above it, so at the middle of the swing the chain is a curve rather
than a line: the top has already turned back while the bottom link is still going
out. The last link travels the furthest and arrives last.

**Both loop exactly.** The last frame is pixel-identical to the first in both, so
these two run continuously with no snap.

⚠️ **The two are the same whip, twice.** Frame for frame they differ by a pixel or
two at the widest part of the swing and by nothing at all at either end. You are not
expected to tell them apart from the frames, and you are not being scored on
telling them apart: reproduce the whip, give it to both, and let the diff say what
the difference between them was worth.

### `ball-catch` — 121 frames, 10 seconds (120/12 s)

The same disc and chain, plus a ball.

A ball drops in from the upper left, lands on the disc and is bounced back up, over
and over for the length of the shot. The disc tips under each landing and the chain
starts moving a beat later, so between one landing and the next the chain is still
settling from the last one — the wave never fully dies before it is set going again.

The bounces are big: several times the ball is sent far enough up and to the left
to spend a few frames alone in the empty part of the frame, and that travel is what
the shared viewport is sized to. They get smaller through the shot, and by the last
two or three frames very little is moving.

**Ends nowhere near where it began.** The last frame is not the first.

### The comparison, in one line

The two short shots are the wave on its own, keyed to loop; the long one is the same
wave being re-triggered by a ball that lands on the thing it hangs from.

## How the result is read

`bench 4` does two things and does not merge them:

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
