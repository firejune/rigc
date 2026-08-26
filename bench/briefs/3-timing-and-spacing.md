# Rung 3 brief — `3-timing-and-spacing`

> **Revision 2 — 2026-08-26.** First verification pass, by a different agent than
> the one that wrote it (Claude Opus 5 (1M context), Claude Code / Agent SDK),
> under the protocol in [`bench/runs/README.md`](../runs/README.md). Measured off
> the committed frames, not eyeballed. Corrected: `heavy`'s settling swings were
> described as getting *slower* (the gap between successive extremes **contracts**,
> from about nine frames to about four); `light`'s settle was "one small overshoot"
> (the return swing is the same size as the overshoot, and two smaller reversals
> follow); `light`'s block was said to shift "about one block's width" (it shifts
> about two thirds of its own width); and `light`'s "final two frames are still" is
> the final **three**. `heavy`'s tail gained the frame at which the bar actually
> stops, and the block's tilt gained a figure. Everything else held, including both
> durations, the identical opening pose, both block-contact frames, `heavy`'s
> half-frame travel, the tumble, and both rest frames.

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
>
> Two allowances are worth naming out loud, because [docs/LADDER.md](../../docs/LADDER.md)
> once listed durations as off limits:
>
> - **Durations are stated**, because the reference frames are rendered at a fixed
>   rate over each animation's own length, so the frame count already tells you the
>   duration exactly. Withholding the number while shipping the frames would be
>   theatre, and rigc requires a declared duration (rule R7) — so it is given.
> - **Whether it loops is stated** as an observation about the frames: whether the
>   last frame returns to the first. Spine skeleton data has no loop field; nothing
>   in `bench` reads one.

## The job

Author a rig spec and a motion spec that reproduce this shot, compile them with
rigc, and get a green gate. Read [docs/AUTHORING.md](../../docs/AUTHORING.md) first
— it is the guide for both formats, the CLI loop and every named failure.

```bash
bun cli.ts build \
  --rig    <your>.rig.json \
  --motion <your>.motion.json \
  --images examples/3-timing-and-spacing/images \
  --out    <your-out-dir> \
  --profile spine

bun cli.ts bench 3 --candidate <your-out-dir> --json report.json
```

Use `--profile spine`. You are reproducing an editor export, and the `spine-html`
profile would fail you for renderer policy that this rung is not about.

Notes on the shape of the deliverable:

- **You do not need an atlas.** The art is two loose PNGs and rigc emits its own
  one-part-per-page atlas from them. Point `--images` at the images directory.
- rigc requires a `skeleton.width`/`skeleton.height` when there is no cut manifest.
  Nothing in the scoring reads the skeleton header — pick something that comfortably
  contains the shot and move on.
- Names are yours. `diff` reports name-matched and name-agnostic figures side by
  side, precisely so that a rig built correctly under its own names is not called a
  total failure.

## The art

`examples/3-timing-and-spacing/images/` — fetched by `bun run fetch-examples`, not
redistributed in this repository.

| File | What it is |
| --- | --- |
| `pendulum.png` | one piece: a long straight bar with a **large ball at one end** and a **small ball at the other**. Dark blue-grey, drawn flat |
| `square.png` | a small square block, the same dark palette, with a red marking on its face |

Both are ordinary rectangular images; let rigc measure them.

## The reference frames

[`bench/reference/3-timing-and-spacing/`](../reference/3-timing-and-spacing/), 12
frames per second, both animations sharing one viewport so the two are directly
comparable.

- `heavy/f0000.png` … `heavy/f0064.png` — 65 frames
- `light/f0000.png` … `light/f0020.png` — 21 frames
- `contact.png` in each — every frame of that animation as one labelled grid, row
  major. **Look at the contact sheets first.** This rung's subject is *spacing* —
  how far something travels between one frame and the next — and that is a
  comparison across frames, not a property of any single one.

## What the shot is

The principle being demonstrated is **timing and spacing**: two shots of the same
object doing the same thing, differing only in how much the thing appears to weigh.
Same art, same starting pose, same event. Everything that separates them is *when*
things happen and *how far* they move between frames.

Both animations start from **the identical pose** — `heavy/f0000.png` and
`light/f0000.png` are the same image. The bar lies horizontal across the top left,
large ball at the far left, small ball at the other end and level with it, as though
it has been lifted to the side and released. It pivots about the small ball. The
block sits low, just below and to the right of that pivot end.

### `heavy` — 65 frames, 5⅓ seconds (64/12 s)

The heavy read. Watch the opening: for the first several frames the bar barely
moves — frames 0 and 1 are almost the same picture, and the block has not been
touched. It takes real time to get going, then accelerates hard through the bottom
of its arc, the large ball sweeping down and to the right with the frames spaced far
apart at the fastest point.

The large ball reaches the block on the way through — the block first moves at frame
**9** — and knocks it away. It is thrown a long way: it **arcs up and to the right**,
crossing about half the width of the frame, **tumbling as it goes**, then comes down,
lands square again and slides to a stop. It is at rest by frame **30**, a little
under halfway into the shot, and never moves again — while the bar is still going.

The bar overshoots well past hanging — roughly 40° beyond the vertical on the first
swing — and then rocks back and forth about the vertical in visibly shrinking arcs:
about four swings you can pick out, each shorter than the last **and arriving sooner
than the one before it.** The gap from one extreme to the next
contracts as the arcs shrink, from about nine frames for the first two to about four
by the end — so the shot gets *quicker* as it dies down, not slower.

The motion creeps to nothing near the end, but not as early as it looks: the bar is
still visibly moving at frames **59 and 60**, and only the last three or four frames
are completely still.

**Ends hanging straight down.** The last frame is not the first frame: played on a
loop it would snap back to the raised pose.

### `light` — 21 frames, 1⅔ seconds (20/12 s)

The light read of the same event, and the contrast is the whole point.

It starts immediately: frame 0 → 1 already shows a large move, where `heavy` had
almost none. The fall is over in three or four frames — and then it rocks, rather
than arriving: it overshoots a little past hanging (frames 4–5), swings back **about
as far again the other way** (frame 8), and settles through two much smaller
reversals after that. Small next to `heavy`'s swings, but there is more than one of
them.

The block is barely disturbed. It first moves at frame **4** — much earlier than in
`heavy`, because the bar got down there much sooner — and it is at rest again by
frame **6**, having shifted about **two thirds of its own width** to the right
instead of half the frame — 12 px, against a block that measures 19 px across.
It stays beside the ball rather than across the picture. It does turn as
it is knocked — tilted about 12° while it moves, which widens its silhouette from
19 px to 23 px, and square again by the time it settles — but it is a nudge, not a
tumble: the same event, a tenth of the travel.

After that first half-second there is no more event, but the bar is not parked
either: the settle above runs on through the rest of the shot's length, and the
final **three** frames are still. **Ends hanging straight down**, in the same rest
pose `heavy` ends in, and again not where it began.

### The comparison, in one line

`heavy` eases in slowly, throws the block half a frame away, and takes five seconds
to stop moving. `light` starts at once, nudges the block a body-width, and is done
in well under one. Reproducing one of them convincingly and the other as a scaled
copy of it would miss the rung.

## How the result is read

`bench 3` does two things and does not merge them:

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
output goes, what has to be recorded, and what you must not read.
