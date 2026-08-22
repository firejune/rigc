# Rung 6 brief — `6-arcs`

> **Brief verified: revision 2 → 3, 2026-08-23 — third party.** Re-measured from
> the frames by a **different agent** from the one that wrote revisions 1 and 2
> (Claude Opus 5 (1M context), Claude Code / Agent SDK, fresh session, no sight of
> either earlier pass's working), under the protocol in
> [`bench/runs/README.md`](../runs/README.md). This is the check revision 2 said was
> owed; the line below is now the record of it rather than a promise of it.
>
> Every quantitative and behavioural claim was re-derived with estimators written
> from scratch for this pass — a per-pixel modal backdrop, a **neck split** (the
> subject is cut into ball and trail at the minimum of its inscribed-radius profile,
> which uses neither a template nor a fixed ball radius), and a **chord-slice bend**
> read from a degree-3 fit to the centre line. Each was put through a synthetic
> control first, and then through a control built out of the **actual art**:
> `ball.png` and `tail.png` composited at the reference scale with a known squash and
> a known bend, so the estimator could be scored against an answer. That second
> control is what sets the error bars quoted below, and it is also what caught two
> defects in this pass's own machinery before any of it was believed.
>
> **What held**: the shot's shape — one connected subject on every frame, the four
> arcs and where their apexes fall, the ledge and shelf runs, the slope's gradient
> and ends, the drawn-area figures, the 430 px crossing, the pixel-identical tail and
> the three-pixel reveal. Several of these reproduce to the pixel.
>
> **What changed**: the stone is **two pieces, not one**, and the 182 × 68 figure was
> the box round both; the set's pixel count, the count of set pixels the subject
> covers, the top step's right end, the size of the topmost recess, the ball's own
> width in flight, the trail's length, the trail's bend figures, which frame is the
> smallest and which has the least drawn area, the wind-up's frame-difference
> numbers, and where the ball's underside sits at `f0034`.
>
> ⚠️ **What could not be checked at all**: every figure this brief quoted "at 24 fps"
> to sub-pixel precision. `arcs@24fps/` ships **a contact sheet and two stills**, and
> the sheet's tiles are the frame reduced to **171 × 46** — a third of its resolution,
> with a label burnt into the corner. A 14 px ball is under 5 px there. Those claims have
> been rewritten as what the committed frames do support, and the ones that rest on
> material nobody has have been removed rather than repeated. This is the failure
> mode two same-agent passes could not catch: both were measuring frames the second
> pass could still see and the repository never received.

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
- `arcs@24fps/` — the same shot at 24 fps as a contact sheet, plus its first and
  last stills.

⚠️ **The 24 fps set is not a frame set, and you cannot measure the ball on it.**
It ships `contact.png`, `f0000.png` and `f0136.png` — that is all; the other 135
frames were sampled to build the sheet and never written. The sheet is 8 tiles
across and each tile is the 512 × 137 frame **reduced to 171 × 46**, a third of its
resolution, with the frame number burnt into the corner. A 14 px ball is under 5 px there.
So the sheet is good for *what happens and roughly when* — the subject's box, its
lowest row, whether it is moving — and it cannot support a figure about the ball's
centre to a pixel. Revision 2 of this brief carried several such figures; they were
measured on 24 fps frames that were rendered at the time and are not in this
repository, so nothing downstream can check them. They have been replaced below by
what the committed frames do support.

`frames.json` beside them carries the world box and the scale in pixels per unit,
so a distance measured here converts into the units a rig is authored in.

⚠️ **The subject is small and the set is large.** Everything shares one viewport and
the shot is very wide, so the ball is about **14 × 14 px** in flight and the stone's
body is 176 × 59 px. That is enough to *measure* proportions and not enough to
eyeball them. Read the numbers below as what you should be able to reproduce from
measurement, not as something the pictures show at a glance. Where a figure below is
given as a range or with "about", that is the measurement's own precision — the trail
runs into the ball with no seam between them, so the ball's own extent is only good
to a pixel or two, and the brief now says which way that error runs.

## What the shot is

The principle is **arcs**: nothing living moves in a straight line, and a thing
that trails behind a moving body follows the body's curve rather than pointing
straight at it.

### The set

Grey-blue stone, on screen from the first frame to the last and **never moving** —
it reproduces exactly as the pixels that are non-background in at least 90 % of the
frames, **6,057** of them. In fact all 6,057 are non-background in *every* frame:
the subject never thins one of them back to the backdrop, it only recolours a few.
Across the whole shot the subject covers at most **9** of them on any one frame
(frame 47), and **49** in total. Nothing here tells you anything about draw order
beyond "where they do meet, the subject is in front", and nine pixels is not evidence
of anything else. Do not build a reordering out of it, and do not take the absence as
evidence either way.

⚠️ **It is two pieces, not one.** The stone's body is a single connected shape
**176 × 59** — x = 270 to 445, y = 50 to 108, 6,048 px. Five columns
further right and below it there is a **detached 1 × 9 pale-grey mark** at x = 451,
y = 109 to 117 (9 px, about (213,215,215) — much lighter than the stone). It is there
from the first frame to the last, and it is what makes the set's overall box
182 × 68. Read as "the stone is 182 × 68 and its base sits at y = 117" that box is
misleading in the only way that matters to a build: the stone itself stops at x = 445
and y = 108.

Left to right, in frame pixels: a low ledge whose top runs flat at **y = 89 from
x = 270 to x = 295**; one step up to a shelf at **y = 69 out to x = 322**; one more
step up to a flat top at **y = 50 out to x = 349**; and then a single straight slope
of gradient **0.603**, running from (350, 51) down to (444, 107) before the stone
tapers to its point at (445, 108). Cut into the face below the top step is a column
of **four dark oval recesses**, centred near y = 66, 78, 88 and 97 and shrinking
steadily as they go down: about **15 × 9 px** at the top, then 12 × 7, then 10 × 6,
then **7 × 5** at the bottom. The column is not quite vertical — the centres drift
right as they descend, from x ≈ 343 to x ≈ 347. The whole silhouette carries an
inscribed groove a few pixels inside its own edge.

### `arcs` — 69 frames, 5.667 s (68/12 s)

A small orange ball with a long trailing spindle — read it as a comet — crosses the
whole shot from left to right, and it is **one connected shape on every single
frame**: the trail never detaches from the ball and never shows a gap or a seam
where they join. That holds under the strict test as well as the loose one — every
frame is a single component under 4-connectivity, not merely under 8.

The trail is the same trail all the way through, but **it does not hold the same
apparent length**, and the difference is the principle. Measured **along the shape**,
from the ball's centre out to the far tip, it runs **32–41 px** (mean 36) — that is
the one that stays put. Measured as the **straight line** from the ball to the tip it
runs **28–37 px** (mean 33), and it is shortest on exactly the frames where the trail
bows most, because a bent thing spans less than a straight one. Do not read the
straight-line figure as the trail's length.

The route, in the 12 fps frames:

- **f0–f2 — a wind-up, not a rest.** The ball's centre barely moves: (54.8, 101.1),
  (54.6, 101.5), (54.7, 102.3) — inside a pixel and a half of (54, 101) throughout.
  The *trail* does move, and that is the point: its tip climbs **11 px** over those
  three frames, from (21, 99) to (20, 88), while its x barely shifts. Consecutive
  frames differ by **408 and 453 pixels**. Nothing in this shot is ever still except
  the very end of it.
- **f2 → f20 — four arcs over open ground**, each lower and shorter than the last.
  Measured on the ball's centre, the apexes sit at y ≈ 58, 68, 73 and 73 against a
  ground line at y ≈ 104, so the arcs stand about 46, 36, 31 and 31 px tall;
  touchdown to touchdown they are **78, 68 and 48 px** long. Sampled touchdowns are
  f2, f9, f15 and f20; the apexes fall nearest f6, f12, f18 and f23. f15 is the
  lowest 12 fps sample of its arc but not its bottom — the ball's centre is at
  y = 97 there, 7 px clear of the ground line, so that touchdown falls between two
  frames.
- **f25 → f34 — up the stone.** It touches down once on the low ledge (f25: the
  ball's underside is y = 88, the pixel row directly above the ledge's top at
  y = 89, and no pixel of the stone is covered), once on the middle shelf (no 12 fps
  frame catches it — f29 has the ball's centre at y = 60 and f30 already back up at
  y = 56), and once on the flat top. ⚠️ **f34 is not "one row above" the stone**: the
  ball's lowest drawn row there is **y = 50, the stone's own top row**, and the
  subject covers 5 of the stone's pixels on that frame. The ball meets that surface,
  it does not clear it.
- **f35 → f43 — it stops on the top.** It runs out of speed on the flat and holds
  there. The ball's centre moves 5.9 px between f35 and f36, 7.4 between f36 and f37,
  2.2 between f37 and f38 — and then **0.5, 1.3, 0.5, 0.7, 0.5 and 0.8 px** for
  f38 → f43: six frames, half a second, inside a pixel or so each. The 24 fps sheet
  agrees as far as it can see: the subject's lowest row is pinned at one value for
  14 consecutive tiles (≈ 0.58 s) and the whole-subject centroid steps under about a
  pixel for six of them. This is the one still moment in the shot and it is not an
  artefact of sampling.
- **f43 → f52 — down the slope.** It accelerates hard off the top and then runs: the
  ball's centre steps **5.9, 14.2, 16.1, 16.6** px per 12 fps frame over f43 → f47,
  and from there to f52 it averages about 15 px a frame. It does not keep gaining all
  the way down. ⚠️ On **f45–f52** the trail curls over the ball and the two stop
  being separable at all (see *The trail bends*), so nothing finer than the frame's
  own box can be measured on those eight frames — by any estimator, including yours.
- **f52 → f58** — it comes off the slope, makes one last shallow bounce (apex f53,
  centre y = 89; down again at f55, y = 102.5), a much smaller one at f56, and
  settles.
- **f59 → f68** — the settle finishes. The ball's centre is stationary at
  (484.8, 101.2) from f59 on; frames **64, 65, 66 and 67 are pixel-identical**.

**It ends nowhere near where it began.** The ball's centre crosses **430.0 px** left
to right and finishes **0.1 px** from the height it started at; 675 of the frame's
pixels differ between the first frame and the last.

### The ball changes shape, and it changes it in one piece

⭐ **This is half the rung.** The ball is not a rigid drawing being moved around.

Measuring it is harder than it looks and the numbers below carry real error bars.
The trail runs into the ball with no seam, so any estimator has to decide where one
ends and the other begins. This pass cut the subject at the **neck** — the minimum of
its inscribed-radius profile taken along the shape — and then scored that cut against
`ball.png` and `tail.png` composited at the reference scale with a known squash: the
cut reads the ball's **width 0 to +3 px high** (typically +1), its **height within a
pixel**, and its centre within about 2 px. Read the table with that on top of it.

| Where | Ball, w × h | Proportion |
| --- | --- | --- |
| through most of the flight | 13–15 × 12–16, median 15 × 14 | ≈ **1.0** |
| flattest — the fourth touchdown, `arcs/f0020.png` | **18 × 10** | 1.8 |
| the other landings — f25, f34, f55 | 16–17 × 10–11 | 1.45–1.70 |
| most drawn-out — leaving the ledge, `arcs/f0026.png` | **13 × 17** | **0.76** |

⚠️ **In free flight the ball is round, not flattened.** `ball.png` is 156 × 156 and
the frames are rendered at 0.0855 px per unit, so an unscaled ball is **14 × 14** on
screen — and that is what the flight frames measure. Revision 2's "≈ 12 × 13, ≈ 0.9"
put the resting proportion on the wrong side of round, which would send a build
looking for a squash that is not there.

Two things to take from the table, and the second decides how you build it:

1. It flattens on the frames where it meets a surface and draws out tall on the
   frames just after it leaves one. The proportion runs from 0.76 to 1.80 across the
   shot — **a factor of about two and a half**, either side of round.
2. **The ball's drawn area is very nearly constant, so widening it has to flatten it.**
   That is the reliable form of the claim, and it is the one that survives
   measurement: the subject's whole drawn area holds inside **309–345 px** on every
   frame outside f45–f52, against a mean of **333** — **+4 % / −7 %**. The per-frame
   *box* is a pixel-quantised read of a shape whose edge is blurred by the trail, and
   it does not show w and h moving oppositely "every time": of the 25 frame-to-frame
   pairs where both change, 16 go opposite and 9 go the same way (correlation
   −0.24). Build to the constant area, not to the box.

> 📏 **Those area figures depend on a threshold, and the threshold is worth stating.**
> They count a pixel as drawn when it differs from the backdrop by more than **8**
> out of 255 on some channel. Counted as "differs at all", the same shot reads
> 322–356 with a mean of 345. Either is defensible; quoting one without the other is
> what makes two honest passes disagree by a dozen pixels.

### The trail bends

⭐ **This is the other half**, and it is the claim to be most careful measuring.

The trailing spindle **bows away from the straight line between its ends** — on every
frame where the trail can be told from the ball at all. That qualifier is not a
hedge; see the hook paragraph below.

Taken properly — extract the trail's centre line, then measure that line's departure
from the chord joining its ends, so the shape's own thickness does not count as bend
— this pass reads the bow as **0.6 to 6.2 px** with a median of **3.6**, and after
calibrating against the real `tail.png` bent by known amounts (the estimator reads
0.76 × the true sagitta, rms 0.5 px) as **0.8 to 8.2 px** with a median of **4.7**,
at least 3 px on **47 of the 61 measurable frames**. Against a trail 32–41 px long
that is a mid-span displacement of roughly an eighth of its own length typically, and
a fifth at the extremes.

> ⚠️ **61, not 69.** On **f45–f52** the trail curls back over the ball and the
> subject becomes one lump with no neck in it — the split fails, and it fails loudly
> rather than quietly. There is no per-frame bend figure for those eight frames, from
> any estimator; a pass that reports one for all 69 has measured something else,
> most likely the whole subject's centre line with the ball still in it. Revision 2's
> "1.2 px to 13.0 px, median 6.5, at least 3 px on 64 of the 69 frames" is higher
> than this pass gets on every one of those numbers, and its frame count is one this
> pass cannot reproduce at all.

> ⚠️ If you measure this yourself, do not use the maximum distance of the trail's
> *pixels* from a straight line. A perfectly straight spindle scores its own
> half-width — about 4.5 px here — on that test, which is most of the number.
> Revision 1 of this brief made exactly that mistake and reported a floor of 5.7 px
> as though it were bend. **Feed your estimator a straight shape first and check it
> returns zero** — and feed it a *diagonal* straight shape too. A centre line taken
> from geodesic level sets reads 1.6 px of "bend" on a straight horizontal spindle
> and **4.9 px on the same spindle at 34°**, purely from where the raster puts the
> end caps; that error is invisible in the one control everybody runs.

The trail also does not point where the ball is going. The angle between the ball's
direction of travel and the line from the ball back to the trail's tip is **a swing,
not a lag**: over the 42 frames where the ball is moving fast enough to have a
direction at all, it runs from **−54° to +50°** with the sign changing 14 times.
Its sign is not random — it is **negative at the apexes** (−24°, −27°, −29°, −32°,
−45° on five of the six) and **positive at the touchdowns** (+7°, +31°, +32°, +48°,
+50°). It does not pass through zero over the top; the top is where it is furthest
over to one side. On the two or three frames that straddle a bounce it reads as high
as +70°, but a direction of travel taken across 1/6 s is a poor description of the
ball on those frames, so treat those as the measurement's limit rather than the
animation's.

At its most extreme — the fast run down the slope, `arcs/f0045.png` to
`arcs/f0052.png` — the trail curls into a tight hook that overlaps itself, and the
whole subject shrinks. ⚠️ **The smallest box and the least drawn area are different
frames**: the box bottoms out at **18 × 19 px** on `f0048` and `f0050` (280 and
270 px drawn), while the drawn area bottoms out at **234 px** on `f0051`, whose box
is 23 × 16. Nothing got smaller — part of it is behind the rest. Those are the frames
to check a build against; anything that can only rotate a rigid drawing will not
reach that shape.

A rigid `tail.png` on a chain of joints can get the trail *pointing* the right way.
It cannot bend it, and the bend is what this rung is named for.

### The last frame

On `arcs/f0068.png`, and nowhere else in the shot, **exactly three pixels change**:
(460, 85) and (459, 86) pick up a faint blue tint out of the backdrop, and (460, 86)
goes to **(46, 49, 146)** — `arc-tracker.png`'s own colour, exactly. It is the only
strongly blue pixel in all 69 frames; the stone is grey-blue, but nothing else in the
set comes near it. A one-frame reveal at the trailing tip, at the very end. Build it
as one.

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
number before you author it.* The third-party pass adds one more: **score your
estimator against a shape you built out of the art itself**. A synthetic blob is
enough to catch a sign error; it is not enough to tell you that your ball-and-trail
split reads the ball three pixels too wide, and that is the size of error that puts
a squash in a brief where there is none.
