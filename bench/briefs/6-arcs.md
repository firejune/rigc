# Rung 6 brief — `6-arcs`

> **Brief verified: revision 1 → 2, 2026-08-23.** Written from the frames and then
> re-measured from scratch in a second, independent pass — **by the same agent**
> (Claude Opus 5 (1M context), Claude Code / Agent SDK), under the protocol in
> [`bench/runs/README.md`](../runs/README.md). The second pass used different
> machinery throughout: a persistence statistic instead of a per-pixel median for
> the backdrop, morphological erosion and normalised cross-correlation instead of a
> max-inscribed-disc tracker, row profiles instead of column profiles, and a medial
> line instead of a chord for the trail. Six claims were corrected — the opening,
> the length of the hold, how many touchdowns fall between samples, the stone's flat
> runs, the trail-bend figures and the trail-lag claim — and the corrections are in
> the text below rather than listed here.
>
> ⚠️ **A third-party check is still owed, and this header does not substitute for
> it.** The protocol asks for a *different* agent precisely because two passes by
> one agent share whatever that agent assumed. Two of the six corrections came from
> an estimator disagreeing with itself; none could have come from a mistake both
> passes were built to make. One such mistake was in fact caught only by adding a
> **synthetic control** — a straight shape fed to the trail-bend estimator, which
> should have returned zero and did not, revealing that revision 1's headline
> figures for the bend were mostly the trail's own thickness. Read this as
> "measured twice", not "reviewed twice".

> ## The leakage rule this brief was written under
>
> ⭐ **Everything below is something a client watching the finished animation
> could tell you.** Nothing below was copied out of the reference `skeleton.json`.
>
> This brief is allowed to name the image files, name the animation, state its
> length and whether it ends where it began, describe in plain words what a viewer
> sees, and point at the rendered reference frames.
>
> It deliberately does **not** carry bone names, bone counts, the hierarchy, key
> times, key values, curve handles, timeline kinds, slot names, the setup pose, the
> stage size, or any other fact that only reading the reference JSON could supply.
> Those omissions are the measurement, not an oversight: an agent that has seen the
> answer is being scored on transcription. **If you have the reference export in
> context, stop — this run cannot be recorded.**

## The job

Author a rig spec and a motion spec that reproduce this shot — one skeleton, one
animation — compile them with rigc, and get a green gate.

```bash
bun cli.ts build \
  --rig    <your>.rig.json \
  --motion <your>.motion.json \
  --images examples/6-arcs/images \
  --out    <your-out-dir> \
  --profile spine

bun cli.ts bench 6 --candidate <your-out-dir> --json report.json
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
- ⭐ **This is the first rung where parts change *shape* rather than only their
  position, angle and scale.** Read *The ball changes shape* and *The trail bends*
  before you decide how to build either of them — that decision is the rung.

## The art

`examples/6-arcs/images/` — fetched by `bun run fetch-examples`, not redistributed
in this repository. Four files, and the sizes matter: two of them are far larger
than they look in the frames.

| File | Size | What it is |
| --- | --- | --- |
| `ball.png` | 156 × 156 | a round orange ball with a pale grey cap and a pale rim below |
| `tail.png` | 380 × 111 | a long pointed spindle — orange, with two pale silver bands across it, sharp at one end and blunt at the other |
| `platform.png` | 1064 × 396 | the whole stone set in one piece |
| `arc-tracker.png` | 18 × 18 | a solid dark-blue dot, and nothing else |

`arc-tracker.png` is the smallest thing in the corpus and it is on screen for
exactly one frame. See *The last frame* before you decide that is a mistake.

## The reference frames

[`bench/reference/6-arcs/`](../reference/6-arcs/), 512 × 137 px, 12 frames per
second.

- `arcs/f0000.png` … `f0068.png` — 69 frames
- `arcs/contact.png` — every frame as one labelled grid, row major.
  **Look at the contact sheet first.**
- `arcs@24fps/contact.png` — the same shot at **24 fps**, as a contact sheet plus
  its first and last stills. Take it seriously: two of the nine touchdowns in the
  shot land on odd 24 fps frames and so have **no 12 fps sample at all**, and a
  third is sampled on the way back up. At 12 fps those bounces read softer than
  they are.

`frames.json` beside them carries the world box and the scale in pixels per unit,
so a distance measured here converts into the units a rig is authored in.

⚠️ **The subject is small and the set is large.** Everything shares one viewport and
the shot is very wide, so the ball is about **12 × 13 px** and the stone is
182 × 68 px. That is enough to *measure* proportions and not enough to eyeball them.
Read the numbers below as what you should be able to reproduce from measurement,
not as something the pictures show at a glance. Where a figure below is given as a
range or with "about", that is the measurement's own precision — the trail runs
into the ball with no seam between them, so the ball's own extent is only good to
a pixel or two.

## What the shot is

The principle is **arcs**: nothing living moves in a straight line, and a thing
that trails behind a moving body follows the body's curve rather than pointing
straight at it.

### The set

One piece of grey-blue stone, on screen from the first frame to the last and
**never moving** — it reproduces exactly as the pixels that are non-background in
at least 90 % of the frames, 6,023 of them. Across the whole shot the subject
covers at most **7** of those on any one frame (frame 47), and a few dozen in
total. Nothing here tells you anything about draw order beyond "where they do meet,
the subject is in front", and seven pixels is not evidence of anything else. Do not
build a reordering out of it, and do not take the absence as evidence either way.

Left to right, in frame pixels: a low ledge whose top runs flat at **y = 89 from
x = 270 to x = 295**; one step up to a shelf at **y = 69 out to x = 322**; one more
step up to a flat top at **y = 50 out to x = 348**; and then a single straight slope
of gradient **0.60**, running from about (350, 51) down to about (444, 107) before
the stone tapers to its point — its right-most column is x = 451 and its base sits
at y = 117. Cut into the face below the top step is a vertical column of **four dark
oval recesses**, centred near y = 67, 78, 88 and 97 and shrinking as they go down
(about 8 × 8 px at the top, 7 × 5 px at the bottom). The whole silhouette carries an
inscribed groove a few pixels inside its own edge.

### `arcs` — 69 frames, 5.667 s (68/12 s)

A small orange ball with a long trailing spindle — read it as a comet — crosses the
whole shot from left to right, and it is **one connected shape on every single
frame**: the trail never detaches from the ball and never shows a gap or a seam
where they join. The distance from the ball to the trail's far tip holds at
**33–38 px all through the shot** — the trail bends and swings, but it never gets
longer or shorter.

The route, in the 12 fps frames:

- **f0–f2 — a wind-up, not a rest.** The ball's centre barely moves: it sits within
  a pixel and a half of (54, 101) for the first five 24 fps frames. The *trail*
  does move, and that is the point — its tip lifts about 10 px over those same five
  frames and drops back, and consecutive frames differ by 380–440 pixels. Nothing
  in this shot is ever still except the very end of it.
- **f2 → f20 — four arcs over open ground**, each lower and shorter than the last.
  Measured on the ball's centre, the apexes sit at y ≈ 58, 68, 73 and 73 against a
  ground line at y ≈ 104, so the arcs stand about 45, 36, 31 and 31 px tall;
  touchdown to touchdown they are 78, 67 and 50 px long. Sampled touchdowns are f2,
  f9, f15 and f20; the apexes fall nearest f6, f12, f18 and f23.
- **f25 → f34 — up the stone.** It touches down once on the low ledge (f25: the
  ball's underside is the pixel row directly above the ledge's top), once on the
  middle shelf (between f29 and f30 — that one has no 12 fps frame, see the 24 fps
  sheet) and once on the flat top (f34: again exactly one row above the stone).
- **f35 → f43 — it stops on the top.** It runs out of speed on the flat and holds
  there: at 12 fps the ball's centre moves 0.3–1.1 px per frame from f38, and at
  24 fps its step stays under a pixel for **eleven consecutive frames — 0.46 s**.
  This is the one still moment in the shot and it is not an artefact of sampling.
- **f44 → f51 — down the slope**, gaining speed the whole way: the ball's step grows
  from **4.0 px to 8.9 px** per 24 fps frame.
- **f51 → f58** — it touches down at the foot of the slope, makes one last shallow
  bounce, and settles.
- **f59 → f64** — the settle finishes. Frames **64, 65, 66 and 67 are pixel-identical**.

**It ends nowhere near where it began.** The ball crosses 430 px left to right and
finishes at almost exactly the height it started at; 675 of the frame's pixels
differ between the first frame and the last.

### The ball changes shape, and it changes it in one piece

⭐ **This is half the rung.** The ball is not a rigid drawing being moved around.
Its silhouette, measured frame by frame (± a pixel or two — the trail runs into it):

| Where | Ball, w × h | Proportion |
| --- | --- | --- |
| through most of the flight | ≈ 12 × 13 | ≈ 0.9 |
| flattest — the fourth touchdown, `arcs/f0020.png` | ≈ **16 × 10** | ≈ 1.6 |
| the other landings — f25, f34, f55 | ≈ 13–15 × 10–11 | 1.2–1.5 |
| most drawn-out — leaving the ledge, `arcs/f0026.png` | ≈ **9 × 15** | ≈ 0.6 |

Two things to take from that, and the second decides how you build it:

1. It flattens on the frames where it meets a surface and draws out tall on the
   frames just after it leaves one. The proportion swings by roughly a factor of
   three across the shot, either side of round.
2. **Width and height move in opposite directions on the same frame**, every time.
   The ball never simply gets bigger or smaller: the subject's whole drawn area
   holds inside **309–345 px** on every frame outside f45–f52, against a mean of
   333 — under ±6 %. Whatever you drive to squash it has to widen it at the same
   moment, from the same input.

### The trail bends

⭐ **This is the other half**, and it is the claim to be most careful measuring.

The trailing spindle **bows away from the straight line between its ends on every
one of the 69 frames**. Taken properly — extract the trail's centre line first,
then measure that line's departure from the chord joining its ends, so the shape's
own thickness does not count as bend — the bow runs from **1.2 px to 13.0 px**, with
a median of **6.5 px** and at least 3 px on **64 of the 69 frames**. Against a trail
33–38 px long, the middle of it is displaced by roughly a fifth of its own length,
frame after frame.

> ⚠️ If you measure this yourself, do not use the maximum distance of the trail's
> *pixels* from a straight line. A perfectly straight spindle scores its own
> half-width — about 4.5 px here — on that test, which is most of the number.
> Revision 1 of this brief made exactly that mistake and reported a floor of 5.7 px
> as though it were bend. Feed your estimator a straight shape first and check it
> returns zero.

The trail also does not point where the ball is going. The angle between the ball's
direction of travel and the line from the ball back to the trail's tip swings
through about **40° either side of straight**, and it is largest — 25° to 48° — on
the frames where the ball turns at the bottom of an arc, then reverses through zero
as the ball goes over the top. It is not a constant lag; it is a swing.

At its most extreme — the fast run down the slope, `arcs/f0045.png` to
`arcs/f0051.png` — the trail curls into a tight hook that overlaps itself: the whole
subject shrinks to about **18 × 19 px** of frame and its drawn area falls to
**234 px**, not because anything got smaller but because part of it is now behind
the rest. Those are the frames to check a build against; anything that can only
rotate a rigid drawing will not reach that shape.

A rigid `tail.png` on a chain of joints can get the trail *pointing* the right way.
It cannot bend it, and the bend is what this rung is named for.

### The last frame

On `arcs/f0068.png`, and nowhere else in the shot, **exactly three pixels change**:
a small dark-blue mark appears at the trailing tip, at (460, 86). It is the only
strongly blue pixel in all 69 frames — the stone is grey-blue, but nothing else in
the set comes near `arc-tracker.png`'s colour. It is a one-frame reveal at the very
end. Build it as one.

### The comparison, in one line

A comet that arcs across a stone ramp, climbs it, stops dead at the top and slides
down — and whose ball and trail both change shape rather than only their pose.

## How the result is read

`bench 6` does two things and does not merge them:

1. **Validity** — `validate --profile spine` on your candidate. This is the only
   pass/fail. A candidate that is not valid Spine 4.3 has not cleared anything.
2. **Structural diff** — a ratio per measure against the reference export, in six
   sections. **There is no rung score**, on purpose: a rig with the right skeleton
   and the wrong timing and a rig with the right timing and the wrong skeleton call
   for opposite fixes. A person reads the measures and records the judgement in
   [docs/LADDER.md](../../docs/LADDER.md).

So do not tune toward a number. Author the shot, get the gate green, and let the
measures say where it landed.

`check` **does** work on this rung — the rasteriser draws parts that change shape,
so a candidate whose subject deforms can be compared against these frames. Run it
in the loop as often as you like; it never opens the reference skeleton.

## Deliverables

See [`bench/runs/README.md`](../runs/README.md) for the run protocol — where the
output goes, what has to be recorded, and what you must not read. Read
[docs/AUTHORING.md](../../docs/AUTHORING.md) first, **including §8**, which is
about measuring reference frames and was written from the mistakes the first ladder
run made doing exactly that. The trail-bend warning above is a fresh instance of
§8's rule: *when a reading implies a key, look for a second way to get the same
number before you author it.*
