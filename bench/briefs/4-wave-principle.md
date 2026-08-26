# Rung 4 brief — `4-wave-principle`

> **Revision 3 — 2026-08-26.** Second verification pass, and the first by a
> **different** agent than the one that wrote revision 2 (Claude Opus 5 (1M
> context), Claude Code / Agent SDK), under the protocol in
> [`bench/runs/README.md`](../runs/README.md). Revision 2's two short shots came out
> of this pass almost untouched — the 87 px slide, the frame-8 far point, the
> frame 9–10 tip lag, the 108 px tip travel, the exact loop, and the 7½ px / 6 px /
> 1½ px differences between the two whips all reproduce to the digit. Corrected:
> the `@24fps` sets are described as sheets only (each also commits its first and
> last frame); frame 8 is not the *least* different frame of the two whips (frames
> 1, 14 and 15 are closer); and three `ball-catch` figures were a few frames or a few
> pixels out — the far point is x 383 at frame 16, the disc is at x 584 at frame 30
> and reaches 600 around frame 33, and the mid-shot rocking spans x 590–621. Added
> two things the frames carry and the brief did not: the disc **turns right over**,
> twice, in the throw at the end of the shot — revision 2 had that passage as "the
> disc drops away", and it is the fastest and most complicated motion in the shot —
> and the way out is not an even sweep but a fast run, a near-stop across frames 6–8,
> and a second fast run.

> **Revision 2 — 2026-08-23.** Verified against the frames and contact sheets by
> Claude Opus 5 (1M context), Claude Code / Agent SDK, under the protocol in
> [`bench/runs/README.md`](../runs/README.md). This rung has not been attempted;
> the pass was prompted by revision 1 of the rung 2 brief shipping claims that were
> not in the pixels, and it found four here. Corrected below: the disc *tips* in the
> two short shots (it slides sideways without visibly turning); the two short shots
> differ "by a pixel or two at the widest part of the swing" (they differ most, by
> about 7½ px, in the bottom links at the quarter points, and least at the widest
> part); the ball bounces on a disc that stays put in `ball-catch` (the disc travels
> most of the width of the frame to meet it); and the bounces "get smaller through
> the shot" (the ball's highest point after it enters is near the end). The claims
> that survived the pass are marked ✅ where they are easy to doubt.

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
| `chain-1.png` … `chain-4.png` | four links, each a narrow dark bar with a **large orange bead at one end** — the bead is as wide as the whole image and about a third of its length, and it marks the joint. They are drawn to sit end to end, and they get shorter down the chain (303, 252, 223, 196 px tall) |
| `chain-end.png` | a fifth piece that finishes the chain: short and wide (126 × 120) rather than a bar — a dark ring with an orange disc in it |
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
- `<animation>@24fps/` — the same three animations sampled at **24 fps**. Each of
  those three sets commits its `contact.png` plus its **first and last frame** and
  nothing in between: the sheet is where the set's whole shot lives, and the two
  stills are there to be measured against. They exist because the fast parts of
  `ball-catch` happen between two 12 fps frames, so the 12 fps set — which you can
  read frame by frame — cannot show you what your curves do in the gaps, and the
  sheet can.

⚠️ **The subject sits in the bottom-right eighth of the frame and the rest is
empty** — in the two short shots. That is not a rendering fault: all three
animations share one viewport, and `ball-catch` moves the whole disc-and-chain rig a
third of the way across the frame and throws its ball into the far corner, so the
box that holds all three is mostly sky. The frames are rendered large (768 px on the
long side) so the subject is still legible inside it. Every frame of every animation
here uses the same box and the same scale, so a distance measured in one is a
distance in another — which is the whole reason for framing them together.

## What the shot is

The principle is the **wave**: one disturbance travelling down a chain of parts,
each one starting a beat after the one above it, so the chain bends instead of
swinging as a stick.

The set is the same in all three shots: a flat disc hangs in the air with a short
chain of five links dangling from its underside, the last one a little heavier than
the rest.

### `wave-by-hand` and `wave-offset` — 17 frames each, 1⅓ seconds (16/12 s)

One whip of the chain, and nothing else in the frame.

**The disc slides sideways** — it does not tip. It moves about 87 px to the right
(rather more than its own width), reaches its far point at frame 8, and comes
straight back; through all 17 frames it occupies exactly the same rows and keeps the
same width, so nothing in the pixels says it turns.

The chain follows it and lags. Each link starts after the one above it, so at the
middle of the swing the chain is a curve rather than a line: ✅ the top has already
turned back while the bottom link is still going out — the disc peaks at frame 8 and
the chain's tip does not peak until frame 9–10. ✅ The last link travels the
furthest: about 108 px against the disc's 87.

✅ **Both loop exactly.** The last frame is pixel-identical to the first in both, so
these two run continuously with no snap.

⚠️ **The two are the same whip, twice, but not to within a pixel.** They are
identical at frames 0 and 16 and differ at every frame in between: the largest
difference is about **7½ px**, in the bottom links, at frames 4–5 on the way out and
about 6 px at frame 12 on the way back. At the widest part of the swing (frame 8)
they differ by about 1½ px — and only the frames next to the loop point (1, 14, 15)
are closer, at about a pixel. So the offset between them shows up in the
accelerating and decelerating quarters, not at the
extremes. You are not expected to reproduce that difference from the frames, and you
are not being scored on it: reproduce the whip, give it to both, and let the diff say
what the difference between them was worth.

### `ball-catch` — 121 frames, 10 seconds (120/12 s)

The same disc and chain, plus a ball.

⚠️ **It is the disc that does the travelling, not just the ball** — the shot is
named for it. A ball drops in from the upper left; the disc rushes up and to the left
to meet it, and from then on the two move together while the disc keeps the ball up.
The disc's own centre runs from about x 629 at the start out to about **x 383 at
frame 16** and back to about x 584 by frame 30 (it passes 600 around frame 33) — a
third of the width of a 768 px frame — and it tilts hard while it goes, which is what
sets the chain going. ⚠️ **The way out is not one even sweep.** It covers about 29 px
a frame over frames 3–6, then almost stops — about 3 px a frame across frames 6, 7
and 8 — and then runs out to its far point at about 25 px a frame again. On a rung
about timing, that hold in the middle of a fast move is worth reading off the contact
sheet before you key anything. ✅ The chain starts a beat later and is still settling
from one throw when the next arrives, so the wave never fully dies.

Through the middle of the shot — roughly frames 31 to 70 — the ball rides on the
disc and the pair only rocks gently, over a range of about x 590 to x 621. Then the
disc drops away and flicks the ball up: **that flick, around frame 79, is the ball's
highest point in the whole shot after it enters**, higher than any earlier arc. The
bounces do not simply decay.

⚠️ **And in that same throw the disc turns right over — twice.** Open
`ball-catch/f0077.png` through `f0085.png` one after another. The saucer is flat and
about 59 × 10 px through frame 78; by **frame 80** it is standing **upright and
edge-on**, about 16 px wide and 58 px tall; it comes part-way back at frame 81, stands
right up **again** at frame 82 (about 25 × 57), and is flat again by frame 84. The
chain whips over the top of it rather than hanging under it for the whole of that
half second. It is the fastest and most violently rotating passage in the shot, and
what your curves do *between* those frames is exactly what the 24 fps sheet is there
to show you: read the 12 fps frames alone and you can author a modest tilt here and
never know.

After the last contact, around frame 84, the ball is thrown left across the empty
part of the frame, comes to rest in the bottom-left corner by about frame 98, and
does not move again. That empty part is what the shared viewport is sized to, and
the ball crosses it **twice** — once coming in, once going out.

✅ **By the last two or three frames very little is moving.** The ball has been
parked for the last twenty-odd frames; only the disc and the chain are still
settling, and they are still settling at the final frame.

✅ **Ends nowhere near where it began.** The last frame is not the first.

### The comparison, in one line

The two short shots are the wave on its own, keyed to loop, driven by a disc that
slides one width sideways and back; the long one is the same wave set going over and
over by a disc that chases a ball across the frame and keeps it in the air.

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
