# Rung 8 brief — `8-follow-through`

> **Revision 1 → 2. Brief verified: yes (third party), 2026-08-23.** Every
> quantitative and behavioural claim below was re-measured off
> `bench/reference/8-follow-through/` by a **different agent** from the one that
> wrote revision 1 (Claude Opus 5 (1M context), Claude Code / Agent SDK, fresh
> session), under the protocol in [`bench/runs/README.md`](../runs/README.md).
> Estimators were written from scratch for this pass and **each was scored against
> a control with a known answer before any number it produced was believed** —
> including a compositor that mirrors `src/render.ts` (bilinear sample, alpha > 0.5
> cut, straight-alpha source-over) so that art composited by hand is comparable
> with the rendered frames. See *Verification notes* at the end for claim-by-claim
> results.
>
> **What held, much of it to the digit**: the whole `pendulum` route and every
> figure in it bar three; the chain's total-bend numbers (0 → 66° by f8, 41–51°
> across f15 → f21, a 103° peak at f26) reproduced exactly; the eyelet's extremes
> (x = 478.6 at f12, x = 33.9 at f24, y = 118.3 at f25) and its 74.8 px whip into
> f28; the 1.5× travel ratio; the tilt series and its five level crossings; the
> rim's constancy; one connected shape on every `pendulum` frame under
> 4-connectivity as well as 8; the duration window and the 3.6333 s reading;
> and almost all of the `ball`'s route, including the held landing at
> (332.7, 384.8).
>
> **What changed**: the lag is **horizontal only** — the claim's headline number
> survives on the x component and the vertical component has **no lag at all**;
> the launch frame's shape figures rest on a split the pixels do not support and
> have been moved out; `chord ÷ arc` was quoted with an impossible floor; the
> `ball`'s connectivity claim was measured under 8-connectivity only; the discus
> **is** decidably in front of the chain, so draw order is not wholly undecidable;
> the area-conservation controls, re-run at matching aspect, separate cleanly where
> revision 1 found them 12 % apart, and the shot leans against conservation; and two
> of the eight images do not carry the transparent border the art table claims.
> Smaller corrections are listed at the end.
>
> **How every number below was obtained**, so that a later pass can attack the
> method and not only the digits:
>
> - **Subject mask** — a pixel counts as drawn when it differs from the backdrop by
>   more than **8/255 on some channel**. Every area, box and connectivity figure
>   below uses that threshold; two honest passes that pick different thresholds
>   will disagree by a few per cent, so it is stated rather than assumed.
> - ⚠️ **The frame-to-frame pixel-difference counts do not use that threshold.**
>   They count pixels differing by more than **2/255 on some channel** — at 8/255
>   the same four figures read 1,860 / 121 / 5,855 / 502 instead of
>   1,912 / 334 / 5,903 / 985. Revision 1 quoted the numbers without the threshold;
>   they reproduce exactly at 2/255, and that is now said.
> - **The pendulum's platform** is measured off the **orange rim** under it — the
>   only orange thing in that shot that is not a chain bead — as the farthest-apart
>   pair of rim pixels. Controlled against `platform.png` composited at the
>   sidecar's own scale at 23 known angles from −20° to +35°: **error −0.40° to
>   +0.69°, rms 0.35°**, tip-to-tip 109.8–111.1 px. The estimator's own angular
>   resolution is ±0.5° (two integer pixels 110 px apart). Revision 1's independent
>   run of the same control reported −0.34°/+0.76°, rms 0.35° — the two agree.
> - **The pendulum's chain** is measured off the **orange beads** — one at the top
>   of each link, plus the terminal disc — as connected orange components of ≥12 px.
>   Five of them are found on every frame of both rates; with the rim that is
>   **exactly six orange components on every frame**, and the count does not change
>   even with the 12 px floor removed.
> - **The comet's ball** is cut from its tail at the **neck**: the minimum of the
>   inscribed-radius profile taken along the shape. ⚠️ **Which end is the ball
>   cannot be decided by looking at either end.** Revision 1 used "the extremity
>   with more drawn area within a geodesic radius of 9 px"; this pass found that
>   rule picks the trail's point on the arc-apex frames, and that "the end nearer
>   the shape's fattest point" picks the trail on the landing frames, where the
>   curled trail is fatter than the flattened ball. What works on both is to take
>   the neck from **each** end in turn and keep the split whose ball piece best
>   fills its own ellipse (area ÷ ¼π·major·minor, which is 1.0 for a filled
>   ellipse and well under it for a curved spindle). It reads 0.99–1.00 on the
>   frames this brief quotes.
> - **The ball estimator's acceptance test is the neck's depth, not the aspect.**
>   Controlled against `ball.png` and `tail.png` composited at the sidecar's scale
>   with a **known** squash at four rotations: the ball's minor axis reads within
>   **+0.70/−0.58 px**, its major within **−2.94/+2.80 px**, and the aspect is
>   **under**-read — never over-read — by up to 0.28 at a true 2.6. Where the split
>   fails it fails completely, reading a near-round 1.1, and on every such control
>   case the **neck prominence** (the smaller of the two flanking peaks, minus the
>   neck) is **0.00** while every good case scores ≥ 2.07. That statistic separates
>   the two perfectly, so it, and not a threshold on the aspect, is what marks a
>   frame unreadable here. **Two frames of the 88 fail it: `@24fps/f0023` and
>   `@24fps/f0030`** (the same instants as `f0015` at 12 fps for the latter).
> - **Tail bend** is the tail centre line's departure from the chord joining its
>   ends, the centre line being the centroid of each geodesic level set. Two
>   controls: a **straight** `tail.png` composited unbent at twelve rotations reads
>   a floor of **1.6–2.7 px of sagitta and 0.914–0.951 of chord ÷ arc**, purely from
>   where the raster puts the end caps; and `tail.png` warped onto **circular arcs
>   of known sagitta** (1.8 → 15.7 px) reads them back to within about 1.5 px, high.
>   Only readings past the floor are quoted as bend. (This is rung 6's warning,
>   re-run here: an estimator fed a straight shape must be checked to return zero
>   before anything it says about a bent one is believed.)
> - ⚠️ **`chord ÷ arc` cannot exceed 1.** The chord is the straight line between the
>   centre line's ends and the arc is that same line's length, so the triangle
>   inequality caps the ratio at 1.0. Revision 1 quoted a floor of "0.924–1.027"
>   and a range of "0.82–1.06"; values above 1 mean the two were taken from
>   different curves. The figures below are re-derived with both measured on the
>   centre line.
> - **Everything quoted at 24 fps rests on frames that are committed.** Both rates
>   ship in full, 88 frames each per skeleton — checked, and they are all there.
>   That is deliberate: rung 6's revision 2 quoted sub-pixel 24 fps figures measured
>   on frames the repository never received, and nothing downstream could check them.
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

⚠️ **The transparent border is not uniform, and two files have none at the top.**
`ball.png`, `tail.png` and the three smaller links carry a 1 px fully transparent
border all round, so the drawn part of `ball.png` is 154 × 154. **`platform.png`
and `chain-1.png` are flush with their top edge** — row 0 of each carries alpha up
to 242 and 236 respectively — so their drawn parts are 685 × 105 and 106 × 302,
sitting one row higher in the image than the border rule would suggest. Anything
that assumes a symmetric border puts those two half a pixel out vertically.
(`ball.png` is a true circle: 154 px across both ways, and its drawn area matches a
154 px disc to within a pixel.)

## The reference frames

[`bench/reference/8-follow-through/`](../reference/8-follow-through/), rendered from
the official export. **One directory per skeleton**, because the two are different
shots and they are framed independently:

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
moves the comet's whole subject **136 px between two consecutive 12 fps frames** —
over a quarter of the frame width — and its fastest event, a launch that carries the
subject 113 px in one 24 fps frame, falls between two 12 fps samples. (Both figures
are the subject's centroid, not the ball's: on that frame the ball cannot be
separated from its trail at all — see *The ball changes shape*.) The 12 fps set is the protocol
every brief is written against and it is what the numbered route below is keyed to
for `pendulum`; for `ball` the route is given at 24 fps, and the frame index is
said each time. A frame index in one set is not a frame index in the other.

## How long, and where it ends

Both animations are called `follow-through`. Both sample to the same frame counts
at both rates, so both durations fall in the same window below — but the frames
cannot show that the two are *equal*, only that neither can be told apart from the
other at 24 fps.

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

⚠️ Those four counts are at the **2/255** threshold named in the header, not the
8/255 one the rest of the brief uses; at 8/255 they read 1,860 / 121 / 5,855 / 502.
The shape of the claim does not change either way — **no consecutive pair anywhere
in either shot differs by zero pixels**, at any threshold, and the quietest pair in
both shots is the last one.

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

- the discus's rim measures **109.6–111.2 px tip to tip, mean 110.5** — the same
  range, to a tenth, that `platform.png` composited **unscaled** at this shot's own
  0.164739 px/unit reads under the same estimator (109.8–111.1). It never grows or
  shrinks;
- the joint-to-joint spacings down the chain are **40.7, 39.2, 34.6 and 34.6 px**
  (≈ 247, 238, 210 and 210 units), each holding to **±0.3 px of its own mean** —
  except the last, which wanders ±0.8 px. Read *frame to frame* instead of about the
  mean, the first three step by at most 0.4 px at 12 fps (0.55 px at 24 fps) and the
  last by 1.0 px. ⚠️ The topmost bead is partly behind the
  discus on every frame, so the 40.7 figure is measured from a centroid that only
  sees part of that bead; treat it as ±1 px where the other three are ±0.3;
- the eyelet on the end measures 12–13 px across on every frame;
- the whole subject's drawn area holds inside **2,919–2,971 px** — **±0.9 %** about
  a mean of 2,951, i.e. a 1.8 % band end to end.

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
- **f10 → f13 — the discus stops, the chain does not.** The discus's centre sits at
  x = 403.0, 405.5 and 399.0 on f9 → f11 — a 6.5 px band, so within 3.5 px of
  x = 402 — while it rolls back level and on through to
  +24°; the eyelet covers 61 px between f9 and f10 and 57 px between f10 and f11,
  and passes **x = 478.6 at f12**, its rightmost point of the whole shot — **73 px
  further right than the discus ever got**, and two frames after the discus turned
  round.
- **f13 → f20 — swept hard left and up.** The discus holds about **+32.5°** for
  f14 → f16 — nose-up now, the opposite tilt — while it crosses the whole frame to
  **(111, 84)** at f20. The chain streams out behind it to the right; its total bend
  sits at 41–51° for the seven frames f15 → f21, the longest sustained bow in the
  shot. The discus's own fastest 12 fps step, 49.9 px, is in this sweep, at f15.
- **f21 → f25 — up and over.** The discus rises to its highest, **(160, 35)** at
  f25, tipping back down to −15.2° at f23 and **nearly** back to level by f25 — it
  reads −2.1° there, which is four of this estimator's 0.5° steps off level, not on
  it. The eyelet
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

### The lag, and the axis it is on

Correlate the discus's frame-to-frame velocity against the eyelet's and slide one
against the other. ⚠️ **Do it per axis. The answer is different on each, and a
correlation taken over both at once returns a number that is true of neither.**

**Horizontally**, the chain is late by

- **4 frames at 12 fps** (r = 0.79 at lag 4, against 0.38 at lag 0), and
- **8 frames at 24 fps** (r = 0.78 at lag 8, against 0.38 at lag 0)

— **1/3 of a second**. The peak is broad: lags 3–5 at 12 fps all score 0.75–0.79,
and the same lag read off *positions* rather than velocities comes out at 3. So the
honest figure is **1/4 to 1/3 of a second, best estimate 1/3**, not a hard 1/3.

**Vertically there is no lag at all.** The y correlation is highest at **lag 0**
(r = 0.72 at 12 fps, 0.71 at 24 fps) and falls away monotonically as the eyelet is
slid later, going negative by lag 5. Read off positions it is the same story:
lag 0, r = 0.82, decaying from there. A chain of fixed-length links transmits its
carrier's *vertical* travel immediately and only swings late *sideways*, and that is
what the pixels show.

⚠️ **Both frame sets are the same animation sampled twice**, so 4-at-12 and
8-at-24 agreeing is arithmetic, not a second opinion. Revision 1 called them
"independent"; they are not.

⚠️ **A single lag fitted to the whole 2-D velocity is a measurement artefact.** Fed
a control built to lag by 4 on x and 0 on y, the combined estimator returns **3** —
neither of the two true answers — while the per-axis estimators return 4 and 0
exactly. On the real frames that combined figure comes out at 1 (12 fps) and 2
(24 fps), with a weak, almost flat r ≈ 0.57. Build the horizontal lateness; do not
delay the vertical with it.

⚠️ It is a **lag, not a scaled copy**: over the shot the discus's centre spans
294.0 px in x and the eyelet spans **444.7 px** — the end of the chain travels
**1.5×** as far as the thing carrying it, and its extremes fall outside the
discus's, not inside them.

### What the discus does with its angle

−16.3° (f6) → +32.8° (f14) → −15.2° (f23) → +6.7° (f27) → −1.0° at rest: a range of
**49.1°**, crossing level **five times** in 45 frames. The extremes grow once and
then decay — −16.3, +32.8, −15.2, +6.7, −1.0. The estimator's rms error on the real
art is 0.35°, so those figures are good to about half a degree. The 24 fps set
reads **−16.8° to +33.6°, a range of 50.3°** — about a degree wider at each end,
because the finer sampling catches the turns closer to their extremes. It is the
same motion, not the same numbers; if you are checking against a build, check
against the set you are sampling.

### The comparison, in one line

A discus swung round a wide loop and set down again, with four links and an eyelet
that arrive a third of a second late **sideways** — but not late at all up and
down — overshoot both ends of its travel, and are still moving after it has
stopped.

---

## `ball` — a comet that squashes when it lands and streaks when it flies

The principle here is follow-through as well, but on a body that is **not rigid**.
A small orange ball with a long pointed spindle streaming behind it — read it as a
comet — bounces its way from the bottom left of the frame to the top right and
settles on the right-hand side. The trail never separates from the ball and never
shows a seam.

⚠️ **It is not, however, literally one connected component, and which way you count
matters.** Under **8-connectivity** up to **4 px** of anti-aliased fringe stands off
the main body, on 17 of the 45 12 fps frames and 38 of the 88 at 24 fps
(`ball/follow-through/f0027.png` is the worst of the 12 fps set). Under
**4-connectivity** it is up to **5 px**, on 27 of 45 and 55 of 88. It is a
rasteriser artefact rather than a break — but note that the worst cases fall on the
**quietest** frames, not the busiest: 5 px at `f0043` of the 12 fps set and at
`f0086` of the 24 fps set, both in the final settle. Do not build a seam to explain
it, and do not expect your own render to be one component either. (The `pendulum`,
by contrast, really is one component on every frame of both rates under both
connectivities — zero detached pixels anywhere.)

The subject's drawn area runs **787–961 px, mean 900** — it does *not* hold
constant the way rung 6's did. Its **smallest** frame is `@24fps/f0030`, the launch,
at 787 px, where the trail lies along the ball and the two overlap most; the curled
landing frames `f0027` and `f0026` are next at 794 and 811.

### The route, in the 24 fps frames

The ball's centre is the centroid of the ball once it is cut from the trail at the
neck; distances are in the 512 × 413 frame.

- **f0 → f3 — a wind-up, not a rest.** The ball's centre holds at x = 83 to within
  **0.24 px** and drifts **1.95 px** down over four frames, while **872–973 pixels of
  the frame change every frame**. Nearly all of that is the trail: it lifts and
  swings behind a ball that has not gone anywhere. Nothing in this shot is ever
  still, and it opens by saying so.
- **f4 → f11 — the first arc.** Up and right to an apex at f7 (y = 325) and back
  down; the ball is at (187, 382) at f11, its lowest so far.
- **f12 → f24 — the second, much bigger arc.** Up to **y = 254.9 at f18** and down
  to (330, 376) at f24, arriving at 33.6 px a frame — though that last step is
  measured across `f0023`, one of the two frames whose ball cannot be separated from
  its trail (see below), so treat it as approximate. The last well-conditioned step
  into the landing is 21.7 px, into f22.
- **f25 → f28 — it lands, and flattens.** The ball's centre sits inside **0.5 px**
  of (332.7, 384.8) for **f26, f27 and f28**, with f25 only 4 px above them: the one
  held beat in the shot, and the frames where the ball is furthest from round. See
  *The ball changes shape*.
- **f29 → f30 — the launch.** 32.9 px into f29, then the fastest event in either
  shot into f30. ⚠️ **How fast cannot be pinned to the ball**, because `f0030` is one
  of the two frames with no neck: the whole subject there is a single smooth spindle
  and any ball/trail split in it is arbitrary. Measured on the **whole subject's**
  centroid, which needs no split, it travels **113.1 px in that one 24 fps frame** —
  the largest such step in the shot — and **136.2 px** between the 12 fps set's f14
  and f15, which is the same instant seen at half the rate.
- **f31 → f40 — the third arc**, up to **y = 103 at f36** and down to (420, 140) at
  f40, where it flattens again.
- **f41 → f61 — two smaller arcs**, apexes at f45–f46 (**y = 33**, the highest the
  ball gets in the whole shot) and f54 (y = 44.4), each returning lower than the last.
- **f63 → f87 — the settle.** The ball's centre stays inside a **5.5 × 25 px** box
  around (473.5, 148) for the last 25 frames, and inside **2.5 × 1.0 px** for the last
  six, while the trail keeps drifting behind it: 334 pixels of the frame still
  change between the last two frames.

**It ends nowhere near where it began.** The ball's centre crosses from x = 83 to
x = 477 and from y = 380 up to y = 33 and back to y = 155.

### The ball changes shape

⭐ **This is half the rung**, and it is the thing the `pendulum` deliberately does
not do.

Measured as the ball's own principal axes once it is cut from the trail, the ball's
**major ÷ minor** proportion runs from **1.01 to about 3** across the shot, and it is
not random about where:

| Where | Proportion | What it means |
| --- | --- | --- |
| 50 of the 88 frames | below **1.15** | round — 1.00–1.15 is what the unscaled `ball.png` itself reads under this estimator across rotations, so "round" here means *drawn at its own size* |
| `@24fps/f0026`, `f0027`, `f0028` — the held landing | **2.7, 3.0, 2.9**, major axis **−2° to −1°** (flat) against the **−83°** it arrived on at f24 — **84–88°** apart | flattened **across** the motion |
| `@24fps/f0040` — the next landing | **2.6**, major axis **+3°** against a travel of −54° (−68° the frame before) | the same flattening, smaller shot |
| eleven more frames | 1.4–1.7 | in between, on the frames either side of those; `f0039` (1.6, axis −64° against travel −68°) shows the mild version of the same alignment |
| `@24fps/f0023`, `@24fps/f0030` | — | **no reading.** Neither frame has a neck; see below |

⚠️ **The launch frame carries no proportion, and revision 1's figure for it has been
withdrawn.** At `@24fps/f0030` the ball and the trail form one smooth spindle whose
inscribed-radius profile is flat (6.0–7.1 px over two thirds of its length) — there
is no neck, so no ball to measure, and the control shows this failure mode reads
back a plausible-looking near-round number rather than announcing itself. Revision 1
read it as 2.11 with a major axis at +77°; that split is not in the pixels.

**The stretch is real all the same, and it can be said without a split.** At that
frame the **whole subject's** long axis is **+76°** while its centroid travels
**113 px at +79°** — the two are **3° apart**. So:

1. **The two extremes are different events and they point different ways.** A
   stretch aligned with travel on the frame it is moving fastest — within 3°, read
   off the whole subject; a squash across travel, 84–88° off it, on the frames it
   has stopped. A build that reaches only one of them has built half of it.
2. ⚠️ **Read the aspect as a floor, not a figure, once it is past about 1.7.** The
   control on the real art holds the minor axis to +0.7/−0.6 px and the major to
   −2.9/+2.8 px, and above a true 2.1 it **under**-reads the aspect — by 0.25 at a
   true 2.35, by 0.28 at a true 2.6 — and never over-reads it. So "f0026 through
   f0028 are flattened past 2:1, and f0027 is the flattest frame in the shot" is
   what the pixels support, and the true flattening there is if anything *more* than
   3:1; "f0027 is exactly 3.02:1" is not supported.

📏 **The ball's drawn area leans against being conserved.** Revision 1 called this
undecidable on the grounds that its two controls were only 12 % apart; re-run, they
are not close at all. Compared **at matching aspect**, so that the estimator's own
bias falls on both sides equally:

| aspect | an area-preserving squash reads | the shot reads |
| ---: | ---: | ---: |
| 2.61 | 0.92 of the round area | **0.77** (`f0040`) |
| 2.69 | 0.92 | **0.75** (`f0026`) |
| 2.85 | 0.90 | **0.72** (`f0028`) |
| 3.02 | 0.90 | **0.69** (`f0027`) |

A ball genuinely built at 0.72 of its round area reads 0.63–0.65 at aspect 2.1–2.35
under the same estimator. So the shot sits **about 15 points below** an
area-preserving build on every one of the four flattened frames — a consistent gap,
several times the ±2–5 % area error the control establishes — and much nearer a
build that simply loses area. ⚠️ The caveat that keeps this out of the "decided"
column entirely: in the control the trail lies **along** the ball's long axis, while
on these frames it curls **across** it, and that changes how much of the join the
split hands to each side. **Nothing in `bench` scores this. Build whichever is
natural, do not tune to the number — but if you were going to reach for a strictly
area-preserving squash because it is the textbook answer, the pixels are not asking
for one.**

### The trail bends, and it bends most when the ball has stopped

The spindle **bows away from the straight line between its ends**. Measured as the
centre line's departure from that chord, against a floor of **1.6–2.7 px** that the
real `tail.png` reads while perfectly straight, the shot reads **1.3–15.2 px, mean
6.1**, and it is past the floor on **74 of the 86 readable** frames. The same thing
said scale-free — chord ÷ arc length, floor **0.914–0.951** — reads **0.68–0.96**,
and drops below the floor on **65** of those 86.

⚠️ That last count is the one revision 1 got most wrong: it reported the tail below
the floor on **16** frames, which reads as an occasional bow. It is below the floor
on **three quarters** of them. This tail is bent nearly all the time.

Where it bends hardest is the point: of the 12 fps set the three lowest chord ÷ arc
are `follow-through/f0031` (0.68), `f0012` (0.72) and `f0006` (0.74) — each within a
frame of a direction change. (`f0025`, which revision 1 named among the lowest three,
reads 0.87 and is nowhere near them.) At its most extreme the trail curls right over
the ball — `@24fps/f0026` and `f0027` are the ones to look at.

⚠️ If you measure this yourself, **feed your estimator a straight spindle first and
check what it returns.** It will not return zero: a centre line taken from geodesic
level sets reads up to 2.7 px of "bend" on a perfectly straight `tail.png`, purely
from where the raster puts the end caps, and a good deal more if the split between
ball and trail is placed wrongly. Rung 6's brief lost a revision to this exact
mistake, and revision 1 of this one quoted a **chord ÷ arc floor of 0.924–1.027** —
a ratio that cannot exceed 1 when both halves are taken off the same curve. If yours
returns more than 1, your chord and your arc are not on the same line.

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
- **Whether the two animations are exactly the same length.** Both land in that same
  window; the frames cannot separate them inside it.
- **The ball's proportion on `@24fps/f0023` and `@24fps/f0030`.** Neither frame has a
  neck, so neither has a ball to measure — and with it goes any figure derived from
  the ball's centre on those two frames, including how far it moved into or out of
  them. The whole-subject measures quoted above are the substitutes.
- **Whether the ball's area is conserved** through its squash — though it now leans
  clearly one way; see the 📏 note. What is genuinely undecided is only how much of
  the 15-point gap is the join rather than the ball.
- **Draw order in `ball`** — there are only two parts and they never overlap
  anywhere it would show, so nothing in those pixels decides an ordering.
  ⚠️ **`pendulum` is a different matter, and revision 1 was wrong to call it
  undecidable.** The frames do decide one edge of it: **the discus is drawn in front
  of the topmost link.** `chain-1.png`'s orange bead would render about **222 px** at
  this shot's scale, and the top bead measures **57–66 px on every frame of both
  rates** — under a third of it — while the beads below it read 99–109 against a
  predicted 112 and the eyelet 119–125 against 122. Something covers roughly 70 % of
  that bead on every frame, the only thing over it is the discus, and the figure
  never changes, so the ordering never changes either. The rest of the ordering —
  among the links themselves, and the eyelet — the frames still do not show.
- **How many pieces the comet's trail is made of.** It reads as one continuous
  spindle on every frame; whether it is built from one part or several is not
  visible.
- **Whether the chain's beads are separate parts or belong to the links.** They are
  drawn into the link images, and the frames cannot say whether the rig treats them
  as anything of their own.
- **Anything about the `ball` shot's ground.** The comet's bounces are at four
  different heights (y = 385.0, 139.6, 90.8, 179.3) and no surface is drawn. There is
  no floor in this shot to reproduce, only the bounces.
- **What is off the bottom of the `pendulum`'s viewport**, if anything. Every frame
  of both rates keeps the whole subject inside the frame with room to spare — its
  extremes over the whole shot are x 22–488 and y 23–356 in a 512 × 381 frame, so at
  least 22 px of margin on every side. Nothing is ever clipped.

## Verification notes — revision 1 → 2

Third-party pass, 2026-08-23, by an agent that did not write revision 1, working
from `bench/reference/8-follow-through/` and `examples/8-follow-through/images/`
only. The reference export and `bench/transcriptions/` were **not** opened.

**Method and controls.** Estimators were written from scratch, and every one was
scored against a control with a known answer before its output was used:

| Estimator | Control | Result |
| --- | --- | --- |
| rim angle / length | `platform.png` composited at 0.164739 px/unit at 23 known angles, −20° → +35° | err −0.40°/+0.69°, rms 0.35°; reproduces revision 1's own control |
| ball axes | `ball.png` + `tail.png` at 0.142758 px/unit, known squash, 4 rotations × 7 aspects | minor +0.70/−0.58 px, major −2.94/+2.80 px; aspect **under**-read above 2.1 |
| ball/trail split | same, plus the two frames that fail it | neck prominence is 0.00 on every collapsed case and ≥ 2.07 on every good one |
| tail bend | `tail.png` straight at 12 rotations, **and** warped onto circular arcs of known sagitta 1.8 → 15.7 px | floor 1.6–2.7 px / 0.914–0.951; known sagitta recovered to ≈ +1.5 px |
| lag | a velocity series delayed by a known 0–8 frames, and a two-axis series with different true lags per axis | recovers each true lag exactly; the combined two-axis estimator returns neither |

A compositor mirroring `src/render.ts` (bilinear, alpha > 0.5, straight-alpha
source-over) was used for all controls so that hand-composited art is comparable
with the rendered frames. Two defects in this pass's **own** machinery were caught
by those controls before anything was believed: the ball/trail split picked the
trail's point as the ball on the arc-apex frames under one end-rule and on the
landing frames under another (fixed by the ellipse-fill rule now described in the
header), and the bend estimator's geodesic walk overflowed on frames with detached
fringe pixels. No scripts are committed — rung 6's verification did not commit its
own, and the methods are described here instead.

**Tally: 79 claims taken in turn — 61 verified, 13 corrected, 5 moved to
undecidable.** Where this pass and revision 1 disagree by less than the calibrated
error, revision 1's number was kept.

**Verified, and worth naming because they reproduce to the digit** — the chain's
total bend (0.6° at f0, 65.5° at f8, 41.3–51.3° across f15 → f21, 103.0° at f26);
the eyelet's x = 478.6 at f12, x = 33.9 at f24, y = 118.3 at f25 and its 74.8 px
step into f28; the discus's last step over 1 px at f40 and the eyelet's at f42, and
at 24 fps f79 and f84; the tilt series −16.3 / +32.8 / −15.2 / +6.7 / −1.0 with a
49.1° range and five level crossings; the 2,271 and 3,089 px opening differences;
the whole-subject area band 2,919–2,971; one connected component on every `pendulum`
frame under 4-connectivity as well as 8; the ball's held landing inside 0.5 px of
(332.7, 384.8) on f26–f28; its wind-up holding x = 83 to 0.24 px while drifting
1.95 px down; apexes at f7, f18, f36, f45–f46 and f54; the settle box; the four
bounce heights; the duration window and 3.6333 s; and all eight image dimensions.

**Corrected** (old → new):

1. **The lag is horizontal only.** "4 frames at 12 fps / 8 at 24 fps" reproduces
   exactly — but only on the **x** component. On **y** the best lag is **0**
   (r = 0.72 / 0.71), falling monotonically and going negative by lag 5. A control
   built to lag 4 on x and 0 on y makes the combined estimator return 3, neither
   truth. "Everything else in this shot is a consequence of it" → the *horizontal*
   lateness is; the vertical is not late at all. Also: the two frame sets are the
   same animation sampled twice, so their agreement is arithmetic, not independence.
2. **`chord ÷ arc` floor 0.924–1.027 → 0.914–0.951**, and the shot's range
   0.82–1.06 → **0.68–0.96**. A ratio above 1 is geometrically impossible with both
   halves on the same curve. Consequently **"below the floor on 16 frames" → 65 of
   86 readable frames** — the tail is bent on three quarters of the shot, not on a
   sixth of it.
3. **The `ball`'s connectivity claim was measured under 8-connectivity only.** 4 px
   detaching on the busiest frames → up to **4 px under 8-connectivity and 5 px
   under 4-connectivity**, on 17/45 and 38/88 (8-conn) or 27/45 and 55/88 (4-conn) —
   and the worst cases are on the **quietest** frames (12 fps f43, 24 fps f86), not
   the busiest.
4. **The area-conservation controls do not say what revision 1 said they said.**
   "0.72 against 0.82, both plausible, 12 % apart" → re-run at **matching aspect**,
   an area-preserving squash reads 0.90–0.92 of the round area and the shot reads
   0.69–0.77 on all four flattened frames. The gap is ~15 points and consistent,
   several times the estimator's own area error. It does not decide the question —
   the control's trail lies along the ball's long axis where the shot's curls across
   it — but it leans hard, and the brief now says so instead of shrugging.
5. **Draw order in `pendulum` is not undecidable** — moved out of the silence list.
   `chain-1.png`'s bead should render ~222 px and reads 57–66 on every frame of both
   rates, against 99–109 for the beads below it; the discus is in front of the top
   link, on every frame.
6. **Two of eight images have no top border.** "Each file carries a 1 px fully
   transparent border" → `platform.png` and `chain-1.png` are flush with row 0
   (alpha 242 and 236 there).
7. **The three most-bent 12 fps frames** f6, f25, f31 (0.84, 0.86, 0.83) → **f31
   (0.68), f12 (0.72), f6 (0.74)**; f25 reads 0.87 and is not among them.
8. **The `ball` subject's smallest frame** is `@24fps/f0030` (787 px), the launch,
   not the curled landing frames — those are second and third at 794 and 811. So
   "the frames where it is smallest are the frames where the trail has curled over
   itself" is withdrawn.
9. **The 24 fps tilt range** −16.3° → +33.1° ("the same range") → **−16.8° → +33.6°,
   a range of 50.3°** against the 12 fps set's 49.1°.
10. **Frame-difference counts need their threshold stated.** 1,912 / 334 / 5,903 /
   985 reproduce exactly at 2/255, not at the 8/255 the header declared for
   everything else; at 8/255 they read 1,860 / 121 / 5,855 / 502.
11. **Small numeric corrections**: rim mean 110.4 → 110.5; the fourth joint spacing
    34.7 → 34.6 px (211 → 210 units); the eyelet's f9 → f10 step 63 → 61 px; "within
    3 px of x = 402" → within 3.5 px (399.0–405.5); "level again by f25" → −2.1°,
    four estimator steps off level; discus x span 293.5 → 294.0 px; the ball's
    arrival at f24 45.7 → 33.6 px a frame; frames below aspect 1.15 51 → 50; frames
    in 1.4–1.7 thirteen → eleven; `f0039` 1.40 → 1.6; ball area 285–420 → 278–429 px;
    the subject area band 785–961 → 787–961; the settle box 5 × 25 around (474, 145)
    → 5.5 × 25 around (473.5, 148); the opening frame differences "870–970" →
    872–973.
12. **The ball/trail split's end-rule** as revision 1 described it ("more drawn area
    within a geodesic radius of 9 px") picks the wrong end on the arc-apex frames.
    Replaced, and the replacement described in the header.
13. **The estimator's failure mode is not what revision 1 said.** "Do not read a
    proportion past 2.1" implied scatter; the control shows a systematic **under**-read
    above 2.1 and, where it truly breaks, a collapse to a near-round figure that the
    aspect alone will not reveal. The gate is neck prominence.

**Moved to undecidable** — the exact figure for the launch (2.11 with a major axis
at +77°, 9° from travel) and the 121.8 px and 155 px steps built on it, since
`@24fps/f0030` has no neck; the ball's proportion on `@24fps/f0023` for the same
reason; and whether the two animations are exactly the same length. The stretch
claim itself survives, re-derived without a split: the subject's long axis is 3°
from its direction of travel there.

**Honesty-rule check.** One line was removed: the reference frames section said the
two shots "happen to share an atlas", which is a fact about the reference export's
packaging that no viewer of the animation could tell and that the brief's own
instructions make irrelevant. Nothing else in the brief carries bone names or
counts, hierarchy, key times or values, curve handles, timeline kinds, slot names,
the setup pose or the stage size; the scales, frame counts, backdrop and animation
names all come from the committed `frames.json` sidecars and the frames themselves.

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
