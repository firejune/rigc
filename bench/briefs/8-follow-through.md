# Rung 8 brief — `8-follow-through`

> **Revision 1 — 2026-08-23. Brief verified: no.** Written from the committed
> reference frames by Claude Opus 5 (1M context), Claude Code / Agent SDK. It has
> **not** had the second pair of eyes the protocol in
> [`bench/runs/README.md`](../runs/README.md) requires, and until a *different*
> agent has re-measured every claim below off `bench/reference/8-follow-through/`
> a run against it carries the risk that section names: a wrong sentence here
> spends the run's time before either the gate or `bench` can see it.
>
> **How every number below was obtained**, so that the verifying pass can attack
> the method and not only the digits:
>
> - **Subject mask** — a pixel counts as drawn when it differs from the backdrop by
>   more than **8/255 on some channel**. Every area, box and connectivity figure
>   below uses that threshold; two honest passes that pick different thresholds
>   will disagree by a few per cent, so it is stated rather than assumed.
> - **The pendulum's platform** is measured off the **orange rim** under it — the
>   only orange thing in that shot that is not a chain bead — as the farthest-apart
>   pair of rim pixels. Controlled against `platform.png` composited at the
>   sidecar's own scale at 23 known angles from −20° to +35°: **error −0.34° to
>   +0.76°, rms 0.35°**, tip-to-tip 109.7–111.2 px. The estimator's own angular
>   resolution is ±0.5° (two integer pixels 110 px apart).
> - **The pendulum's chain** is measured off the **orange beads** — one at the top
>   of each link, plus the terminal disc — as connected orange components of ≥12 px.
>   Five of them are found on every frame of both rates.
> - **The comet's ball** is cut from its tail at the **neck**: the minimum of the
>   inscribed-radius profile taken along the shape from the ball's far end, where
>   the ball's end is the one of the two extremities with more drawn area within a
>   geodesic radius of 9 px. Controlled against `ball.png` and `tail.png`
>   composited at the sidecar's scale with a **known** squash at four rotations: the
>   ball's minor axis reads within **±0.8 px**, its major within **−3.0/+1.4 px**,
>   and its drawn area within **2 %** — *up to an aspect of about 2.1*. Beyond that
>   the same control scatters by up to 14 px across rotations, so the frames
>   that read above 2.1 are quoted as "beyond 2:1" and not to a digit.
> - **Tail bend** is the tail centre line's departure from the chord joining its
>   ends. A **straight** tail — the real `tail.png`, composited unbent at twelve
>   rotations — reads a floor of **1.7–2.7 px of sagitta and 0.924–1.027 of
>   chord ÷ arc**, purely from where the raster puts the end caps. Only readings
>   past that floor are quoted as bend. (This is rung 6's warning, re-run here: an
>   estimator fed a straight shape must be checked to return zero before anything
>   it says about a bent one is believed.)
> - **Everything quoted at 24 fps rests on frames that are committed.** Both rates
>   ship in full, 88 frames each per skeleton. That is deliberate: rung 6's
>   revision 2 quoted sub-pixel 24 fps figures measured on frames the repository
>   never received, and nothing downstream could check them.
>
> **What the frames could not decide** is collected under *What this brief cannot
> tell you*, near the end. Read it before you treat any silence here as a fact.

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

This rung is **two shots**, not one: `8-follow-through` ships two skeletons —
`ball` and `pendulum` — and `bench 8` measures both. Author a rig and a motion spec
for each, compile each with rigc, and get a green gate on each.

```bash
bun cli.ts build \
  --rig    <your>.rig.json \
  --motion <your>.motion.json \
  --images examples/8-follow-through/images \
  --out    <your-out-dir> \
  --profile spine

bun cli.ts bench 8 --candidate <your-out-dir> --json report.json
```

⚠️ **`bench 8` takes one candidate and diffs it against both references**, so it
prints a `ball` line and a `pendulum` line whichever candidate you hand it. Run it
twice — once per candidate — and read the matching line from each run. Record both
runs in the log; the other line in each is noise, and say so rather than quoting it.

Notes on the shape of the deliverable:

- **You do not need an atlas.** The art is loose PNGs and rigc emits its own
  one-part-per-page atlas from them. Point `--images` at the images directory. Only
  the parts a shot actually shows need to be in that shot's rig — the two shots use
  disjoint subsets of the eight files.
- rigc requires a `skeleton.width`/`skeleton.height` when there is no cut manifest.
  Nothing in the scoring reads the skeleton header — pick something that comfortably
  contains the shot and move on.
- Names are yours. `diff` reports name-matched and name-agnostic figures side by
  side, precisely so that a rig built correctly under its own names is not called a
  total failure.
- ⭐ **The two shots want opposite machinery, and that is the rung.** Nothing in the
  `pendulum` changes size or shape on any frame; everything in it is pose. The
  `ball`'s subject changes shape on most frames. Read *Nothing in this shot
  deforms* and *The ball changes shape* before you decide how to build either.

## The art

`examples/8-follow-through/images/` — fetched by `bun run fetch-examples`, not
redistributed in this repository. Eight files, and the two shots share none of them.

| File | Size | What it is | Used by |
| --- | --- | --- | --- |
| `ball.png` | 156 × 156 | a round orange ball with a pale grey cap across its top and a soft grey underside | `ball` |
| `tail.png` | 380 × 111 | a long spindle — orange, with two pale silver bands across it, drawn to a sharp silver point at one end and cut off blunt at the other | `ball` |
| `platform.png` | 687 × 106 | a dark slate-blue lens seen edge on — a saucer or a discus — with a warm orange rim running along its lower edge | `pendulum` |
| `chain-1.png` | 108 × 303 | an orange bead sitting on top of a dark slate post that narrows in the middle and flares at its foot | `pendulum` |
| `chain-2.png` | 74 × 252 | the same shape, smaller | `pendulum` |
| `chain-3.png` | 74 × 223 | smaller again | `pendulum` |
| `chain-4.png` | 74 × 196 | smaller again — the four are a graded set, largest at the top | `pendulum` |
| `chain-end.png` | 126 × 120 | a thick dark ring with an orange disc set into it, like an eyelet | `pendulum` |

Each file carries a 1 px fully transparent border, so the drawn part of `ball.png`
is 154 × 154 and of `platform.png` 685 × 105.

## The reference frames

[`bench/reference/8-follow-through/`](../reference/8-follow-through/), rendered from
the official export. **One directory per skeleton**, because the two are different
shots that happen to share an atlas and they are framed independently:

- `ball/follow-through/f0000.png` … `f0044.png` — 45 frames at **12 fps**, 512 × 413
- `ball/follow-through@24fps/f0000.png` … `f0087.png` — 88 frames at **24 fps**
- `pendulum/follow-through/f0000.png` … `f0044.png` — 45 frames at **12 fps**, 512 × 381
- `pendulum/follow-through@24fps/f0000.png` … `f0087.png` — 88 frames at **24 fps**
- `contact.png` in each — every frame of that set as one labelled grid, row major.
  **Look at the four contact sheets first.**

`frames.json` beside each skeleton carries that shot's world box and its scale in
pixels per unit — **0.142758 px/unit** for `ball`, **0.164739 px/unit** for
`pendulum` — so a distance measured here converts into the units a rig is authored
in. The two shots are at different scales; do not carry a pixel figure across.

⚠️ **Both rates ship in full, and for the `ball` shot you need them.** That shot
moves the comet up to **155 px between two consecutive 12 fps frames** — over a
quarter of the frame width — and its fastest event, a launch that covers 122 px in
one 24 fps frame, falls between two 12 fps samples. The 12 fps set is the protocol
every brief is written against and it is what the numbered route below is keyed to
for `pendulum`; for `ball` the route is given at 24 fps, and the frame index is
said each time. A frame index in one set is not a frame index in the other.

## How long, and where it ends

Both animations are called `follow-through`, and both run the same length.

⚠️ **The frames do not pin the duration exactly, which is unusual.** 45 frames at
12 fps and 88 at 24 fps put it in **3.625 s ≤ d < 3.646 s** and no tighter. (Rung 1
and rung 6 came out exact because their durations were whole 12ths of a second; this
one is not.) The only value in that window that lands on a 30 fps or 60 fps project
grid is **3.6333 s** — 109 frames at 30 — and that is what to declare unless you
have a reason to prefer another value in the window.

**Neither shot ends where it began**, and neither is ever completely still:

| | first vs last frame | quietest consecutive pair |
| --- | ---: | ---: |
| `ball` | 1,912 of the frame's pixels differ | 334 px still change (f86 → f87, 24 fps) |
| `pendulum` | 5,903 pixels differ | 985 px still change (f86 → f87, 24 fps) |

---

## `pendulum` — a disc carried around, and a chain that will not keep up

The principle is **follow-through and overlapping action**: the thing you drive
stops, and the things hanging off it do not.

A dark slate discus hangs in the middle of the frame with a chain of four graded
links dangling straight down from its underside, each joined to the next at an
orange bead, and a heavy ringed eyelet on the end. It is carried through a wide
loop — right and down, then hard left and up, then a smaller recovery — and set
down again, left of and above where it started. The chain does everything late.

### Nothing in this shot deforms

⭐ **Every measurable distance in it is constant, and that is the first thing to
settle before you build it.** Across all 45 frames of the 12 fps set:

- the discus's rim measures **109.6–111.2 px tip to tip, mean 110.4** — the same
  range, to a tenth, that `platform.png` composited **unscaled** at this shot's own
  0.164739 px/unit reads under the same estimator (109.7–111.2). It never grows or
  shrinks;
- the joint-to-joint spacings down the chain are **40.7, 39.2, 34.6 and 34.7 px**
  (≈ 247, 238, 210 and 211 units), each holding to **±0.3 px** frame over frame —
  except the last, which wanders ±0.8 px. ⚠️ The topmost bead is partly behind the
  discus on every frame, so the 40.7 figure is measured from a centroid that only
  sees part of that bead; treat it as ±1 px where the other three are ±0.3;
- the eyelet on the end measures 12–13 px across on every frame;
- the whole subject's drawn area holds inside **2,919–2,971 px**, a spread of
  **0.9 %**, against a mean of 2,951.

⇒ The shot is made of **rotation and travel only**. A build that squashes anything
here is answering a question this shot does not ask.

The subject is also **one connected shape on every frame of both rates** — zero
detached pixels, under 4-connectivity as well as 8. The chain never breaks and never
shows a gap at a joint.

### The route, in the 12 fps frames

The discus is measured by its rim's two tips: its centre is their midpoint and its
angle is the line between them, positive meaning the right-hand tip is the higher.

- **f0 → f2 — held.** The discus sits at (265, 142) dead level (0.5°, i.e. level
  within the estimator's own 0.5° step) and the chain hangs plumb below it, its
  eyelet at (266, 301). Consecutive frames differ by 2,271 and 3,089 pixels, so
  something is already moving, but nothing has gone anywhere.
- **f3 → f10 — swept right and down.** The discus runs from (267, 151) out to
  **(405, 195)**, and it **tips nose-down to −16.3° by f6**, holding within 4° of
  that through f5 → f8 while it travels. The chain does not come with it: through
  f4 → f7 the eyelet is still within 17 px of where it started, and the chain bows
  backwards — the turning measured at its three interior joints goes from 0° to
  **66° of total bend by f8**.
- **f10 → f13 — the discus stops, the chain does not.** The discus's centre stays
  within 3 px of x = 402 for f9 → f11 while it rolls back level and on through to
  +24°; the eyelet covers 63 px between f9 and f10 and 57 px between f10 and f11,
  and passes **x = 478.6 at f12**, its rightmost point of the whole shot — **73 px
  further right than the discus ever got**, and two frames after the discus turned
  round.
- **f13 → f20 — swept hard left and up.** The discus holds about **+32.5°** for
  f14 → f16 — nose-up now, the opposite tilt — while it crosses the whole frame to
  **(111, 84)** at f20. The chain streams out behind it to the right; its total bend
  sits at 41–51° for the seven frames f15 → f21, the longest sustained bow in the
  shot. The discus's own fastest 12 fps step, 49.9 px, is in this sweep, at f15.
- **f21 → f25 — up and over.** The discus rises to its highest, **(160, 35)** at
  f25, tipping back down to −15.2° at f23 and level again by f25. The eyelet
  reaches **x = 33.9 at f24** — its leftmost, again *after* the discus had already
  turned — and its highest, y = 118.3, at f25.
- **f26 → f28 — the whip.** The discus comes back down to (164, 107) and the chain,
  still travelling, **curls under it**: total bend peaks at **103° at f26**, and the
  eyelet covers **74.8 px in the single frame f27 → f28**, the fastest anything moves
  in this shot. This is the one frame pair where the chain is unmistakably an object
  with its own momentum rather than a thing being posed.
- **f29 → f40 — set down and settle.** The discus drifts back to (168, 105) and
  level, and holds there: its last step over 1 px is **f40**. The chain overshoots
  twice more — the eyelet swings to (193, 287) at f30 and back to (151, 292) at f33
  — before hanging plumb again.
- **f41 → f44 — the tail of it.** The discus is at rest to within the estimator's
  half-pixel. **The chain is not**: its last step over 1 px is **f42**, and the
  eyelet is still creeping a fraction of a pixel a frame at f44.

At 24 fps the same story reads with twice the resolution and the same numbers:
the discus's last move over 1 px is **f79 of 88**, the eyelet's is **f84**, and 985
pixels of the frame still change between the last two frames.

### The lag, as one number

Correlate the discus's frame-to-frame velocity against the eyelet's and slide one
against the other. The best match is at

- **4 frames at 12 fps** (r = 0.79 at lag 4, against 0.39 at lag 0), and
- **8 frames at 24 fps** (r = 0.78 at lag 8, against 0.38 at lag 0)

— the same **1/3 of a second**, found independently in two frame sets. That is the
figure to build to. Everything else in this shot is a consequence of it.

⚠️ It is a **lag, not a scaled copy**: over the shot the discus's centre spans
293.5 px in x and the eyelet spans **444.7 px** — the end of the chain travels
**1.5×** as far as the thing carrying it, and its extremes fall outside the
discus's, not inside them.

### What the discus does with its angle

−16.3° (f6) → +32.8° (f14) → −15.2° (f23) → +6.7° (f27) → −1.0° at rest: a range of
**49.1°**, crossing level **five times** in 45 frames. The extremes grow once and
then decay — −16.3, +32.8, −15.2, +6.7, −1.0. The estimator's rms error on the real art is 0.35°, so those
figures are good to about half a degree. The 24 fps set reads the same range,
−16.3° to +33.1°.

### The comparison, in one line

A discus swung round a wide loop and set down again, with four links and an eyelet
that arrive a third of a second late, overshoot both ends of its travel, and are
still moving after it has stopped.

---

## `ball` — a comet that squashes when it lands and streaks when it flies

The principle here is follow-through as well, but on a body that is **not rigid**.
A small orange ball with a long pointed spindle streaming behind it — read it as a
comet — bounces its way from the bottom left of the frame to the top right and
settles on the right-hand side. It is **one connected shape on every frame of both
rates**: the trail never separates from the ball and never shows a seam. (Strictly:
on the busiest frames up to **4 px** of anti-aliased fringe detach from the main
body — `ball/follow-through/f0027.png` is the worst — which is a rasteriser
artefact, not a break. Nothing bigger than that ever detaches.)

The subject's drawn area runs **785–961 px, mean 899** — it does *not* hold
constant the way rung 6's did, and the frames where it is smallest are the frames
where the trail has curled over itself.

### The route, in the 24 fps frames

The ball's centre is the centroid of the ball once it is cut from the trail at the
neck; distances are in the 512 × 413 frame.

- **f0 → f3 — a wind-up, not a rest.** The ball's centre holds at x = 83 to within
  **0.2 px** and drifts **1.9 px** down over four frames, while **870–970 pixels of
  the frame change every frame**. Nearly all of that is the trail: it lifts and
  swings behind a ball that has not gone anywhere. Nothing in this shot is ever
  still, and it opens by saying so.
- **f4 → f11 — the first arc.** Up and right to an apex at f7 (y = 325) and back
  down; the ball is at (187, 382) at f11, its lowest so far.
- **f12 → f24 — the second, much bigger arc.** Up to **y = 254.9 at f18** and down
  to (331, 376) at f24, where it arrives doing 45.7 px a frame.
- **f25 → f28 — it lands, and flattens.** The ball's centre sits inside **0.5 px**
  of (332.7, 384.8) for **f26, f27 and f28**, with f25 only 4 px above them: the one
  held beat in the shot, and the frames where the ball is furthest from round. See
  *The ball changes shape*.
- **f29 → f30 — the launch.** 32.9 px, then **121.8 px in a single 24 fps frame**,
  the fastest thing in either shot. The 12 fps set skips straight over this: between
  its f14 and f15 the ball jumps 155 px with nothing in between.
- **f31 → f40 — the third arc**, up to **y = 103 at f36** and down to (420, 140) at
  f40, where it flattens again.
- **f41 → f61 — two smaller arcs**, apexes at f45–f46 (**y = 33**, the highest the
  ball gets in the whole shot) and f54 (y = 44.4), each returning lower than the last.
- **f63 → f87 — the settle.** The ball's centre stays inside a **5 × 25 px** box
  around (474, 145) for the last 25 frames, and inside **2.4 × 1.0 px** for the last
  six, while the trail keeps drifting behind it: 334 pixels of the frame still
  change between the last two frames.

**It ends nowhere near where it began.** The ball's centre crosses from x = 83 to
x = 476 and from y = 380 up to y = 33 and back to y = 155.

### The ball changes shape

⭐ **This is half the rung**, and it is the thing the `pendulum` deliberately does
not do.

Measured as the ball's own principal axes once it is cut from the trail, the ball's
**major ÷ minor** proportion runs from **1.02 to about 3** across the shot, and it is
not random about where:

| Where | Proportion | What it means |
| --- | --- | --- |
| 51 of the 88 frames | below **1.15** | round — and 1.03 is what the unscaled `ball.png` itself reads under this estimator, so "round" here means *drawn at its own size* |
| `@24fps/f0030` — the 121.8 px launch frame | **2.11**, major axis **+77°** against a travel direction of **+86°** — **9°** apart | drawn out **along** the motion |
| `@24fps/f0026`, `f0027`, `f0028` — the held landing | **2.6, 3.0, 2.9**, major axis **−1° to 0°** (flat) against the **−81°** it arrived on at f24 — **80°** apart | flattened **across** the motion |
| `@24fps/f0040` — the next landing | **2.56**, major axis **+3°** against a travel of −53° (−69° the frame before) | the same flattening, smaller shot |
| thirteen more frames | 1.4–1.7 | in between, on the frames either side of those; `f0039` (1.40, axis −61° against travel −69°) shows the mild version of the same alignment |

Two things to take from that, and the second decides how you build it:

1. **The two extremes are different events and they point different ways.** A
   stretch aligned with travel on the frame it is moving fastest; a squash across
   travel on the frames it has stopped. A build that reaches only one of them has
   built half of it.
2. ⚠️ **Do not read a proportion past 2.1 as a figure.** The control run on the real
   art holds to ±0.8 px on the minor axis and ±3 px on the major *up to* an aspect
   of 2.1, and past that its readings scatter by up to 14 px across rotations of the
   same true shape. So "f0026 through f0028 are flattened past 2:1, and f0027 is the
   flattest frame in the shot" is what the pixels support; "f0027 is 3.04:1" is not.

📏 **The ball's drawn area is not obviously conserved, and this brief will not
claim either way.** The estimator reads 285–420 px, i.e. about **0.70** of the round
value at the flattest frames. The same estimator reads 0.72 for a control ball
genuinely built at 0.72 of its area and 0.82 for one built area-preserving at
aspect 2.35 — both plausible against 0.70, and the two controls are 12 % apart
where the measurement's own scatter at that aspect is larger than that. **Build
whichever is natural and do not tune to this number.**

### The trail bends, and it bends most when the ball has stopped

The spindle **bows away from the straight line between its ends**. Measured as the
centre line's departure from that chord, against a floor of **1.7–2.7 px** that the
real `tail.png` reads while perfectly straight, the shot reads **1.9–14.5 px, mean
6.1**, and it is past the floor on **71 of the 88** frames. The same thing said
scale-free — chord ÷ arc length, floor 0.924 — reads **0.82–1.06**, dropping below
the floor on 16 frames.

Where it bends hardest is the point: `follow-through/f0006`, `f0025` and `f0031`
(chord ÷ arc 0.84, 0.86, 0.83, the three lowest of the 12 fps set) all sit either
side of a direction change — f6 one frame after one, f25 and f31 one frame before
one. At its most extreme the trail curls right over
the ball — `@24fps/f0026` and `f0027` are the ones to look at — and the whole
subject's drawn area drops to its lowest, because part of it is behind the rest.

⚠️ If you measure this yourself, **feed your estimator a straight spindle first and
check what it returns.** It will not return zero: a centre line taken from geodesic
level sets reads up to 2.7 px of "bend" on a perfectly straight `tail.png`, purely
from where the raster puts the end caps, and a good deal more if the split between
ball and trail is placed wrongly. Rung 6's brief lost a revision to this exact
mistake.

A rigid `tail.png` on a chain of joints can get the trail *pointing* the right way
on most frames. It cannot curl it over the ball on f0026, and it cannot flatten the
ball at all.

### The comparison, in one line

A comet that bounces its way across the frame, streaks out along its path when it is
flying and squashes flat across it when it lands, and whose trail is still swinging
after the ball has stopped.

---

## What this brief cannot tell you

Stated so that its silence is not mistaken for a measurement:

- **The exact duration.** 3.625 ≤ d < 3.646 s is as tight as two frame sets get.
- **Whether the ball's area is conserved** through its squash — see the 📏 note.
- **Draw order anywhere in either shot.** In `pendulum` the parts overlap constantly
  and the overlaps are between a dark link and a dark discus, so nothing shows
  through anything; in `ball` there are only two parts and they meet at a seamless
  join. Nothing in these pixels decides an ordering, and nothing here should be read
  as evidence of one.
- **How many pieces the comet's trail is made of.** It reads as one continuous
  spindle on every frame; whether it is built from one part or several is not
  visible.
- **Whether the chain's beads are separate parts or belong to the links.** They are
  drawn into the link images, and the frames cannot say whether the rig treats them
  as anything of their own.
- **Anything about the `ball` shot's ground.** The comet's bounces are at four
  different heights (y ≈ 385, 140, 91, 179) and no surface is drawn. There is no
  floor in this shot to reproduce, only the bounces.
- **What is off the bottom of the `pendulum`'s viewport**, if anything. Every frame
  of both rates keeps the whole subject inside the frame; nothing is ever clipped.

## How the result is read

`bench 8` does two things and does not merge them:

1. **Validity** — `validate --profile spine` on your candidate. This is the only
   pass/fail. A candidate that is not valid Spine 4.3 has not cleared anything.
2. **Structural diff** — a ratio per measure against the reference export, in six
   sections, **once per skeleton of the rung**. **There is no rung score**, on
   purpose: a rig with the right skeleton and the wrong timing and a rig with the
   right timing and the wrong skeleton call for opposite fixes. A person reads the
   measures and records the judgement in [docs/LADDER.md](../../docs/LADDER.md).

So do not tune toward a number. Author the shot, get the gate green, and let the
measures say where it landed.

`check` **does** work on both shots — the rasteriser draws parts that change shape,
so a candidate whose ball deforms can be compared against these frames. Run it in
the loop as often as you like; it never opens the reference skeleton. Point
`--frames` at `bench/reference/8-follow-through/ball/` or
`.../pendulum/` — the skeleton root, the directory with `frames.json` in it — and it
will check every set of that shot.

## Deliverables

See [`bench/runs/README.md`](../runs/README.md) for the run protocol — where the
output goes, what has to be recorded, and what you must not read. Read
[docs/AUTHORING.md](../../docs/AUTHORING.md) first, **including §8**, which is about
measuring reference frames and was written from the mistakes the first ladder run
made doing exactly that, and **§10**, the editor's own default conventions.

⚠️ Two candidates, two runs, two `bench` invocations, and the log has to say which
line came from which. Quoting the other line as though it were a measurement of
anything is the failure mode at a two-skeleton rung.
