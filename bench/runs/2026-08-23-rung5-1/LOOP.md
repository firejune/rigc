# Rung 5 — attempt 1

- date:       2026-08-23
- agent:      Claude Opus 5 (1M context), Claude Code / Agent SDK
- brief:      [`5-squash-and-stretch.md`](../../briefs/5-squash-and-stretch.md), revision 2
- inputs:     the brief, [docs/AUTHORING.md](../../../docs/AUTHORING.md),
              `examples/5-squash-and-stretch/images/`,
              `bench/reference/5-squash-and-stretch/` (frames, contact sheets, `frames.json`),
              `src/render.ts`, `src/check.ts`, `src/rig.ts`, `tools/plate.ts` as tool documentation
- reference:  **not read.** No `examples/*/export/`, no `bench/transcriptions/`,
              no `docs/LADDER.md`, no `docs/SPEC_COVERAGE.md`, no git history, no web.
- profile:    spine
- bench:      run once, at the end, after this log was written. **Clean, not bench-assisted.**

## How the shot was measured

The frames are 192x124 and the subject is 4-16 px, so nothing here was eyeballed.
Three measurement layers, each checked against the next:

1. **The set.** The per-pixel median of the 79 `ball` frames is the course alone —
   the ball is small and never sits still long enough to survive a median. The
   median is bit-identical to the median of the 79 `speedy` frames, which is the
   first cross-check §8 asks for: two shots, one quantity that must agree.
2. **The subject.** Each frame minus that median leaves exactly one connected
   component in `ball` and one in `speedy` — nothing merges, so the centroid is a
   real measurement rather than a fit to two things that touch.
3. **The pose.** For the ball, that centroid only seeds a proper measurement:
   every one of the 79 frames was re-rendered with rigc's own rasteriser at the
   reference's viewport, and the ball's world `x`, `y`, `scaleX`, `scaleY` were
   found by minimising the pixel difference in a 15x15 px window. That is the
   loop `check` runs, done per frame and per parameter.

`bench/reference/.../frames.json` gives the viewport those frames were drawn from,
so every pixel measurement converts to world units at 17.7634 units/px. All the
scripts that produced the tables live in [`authoring/`](authoring/).

## Loop

### 1 — build (green first time)

```
bun cli.ts build --rig ess.rig.json --motion ess.motion.json \
  --images examples/5-squash-and-stretch/images --out spine --profile spine
```

A first rig: course + ball + an 18-bone character, and a motion spec with the three
animations, the ball and the hip on a straight line between their end points.
17 PASS, 0 FAIL, 1 SKIP (`A31`, no draw-order timeline), 14 PROF.

Nothing about that green says the animation is right, which is exactly §0's warning:
the file was valid and the shot was a straight line.

### 2 — check, ready pose, `--viewport` pinned

```
bun cli.ts check --candidate spine --frames bench/reference/.../ball-ready-to-animate \
  --viewport -1746.2553475382363,-133.42505497503265,3410.572860925112,2208.310576492067
```

MAE 5.39, ball drift 0.30 px, course drift 1.29 px with `heightDrift 19`.

The height drift is not an error: the reference frame has **three** connected
components — the ball, the set, and the floating girder — and one slot covering
two of them matches the larger and reports the other as unmatched. That "1 reference
component(s) matched no slot" line appears on every frame of this run and always
means the girder.

**What the first check bought:** the course was already inside a pixel, so the model
behind it — `course.png` at exactly 2x, centred on x = 0 — was right on the first
try. That model came from `frames.json` alone: the padded viewport's content box has
`maxX = 1538.0000`, and 1538 is the PNG's own width, so the plate is 2x with its
right edge on the box's right edge.

### 3 — course sub-pixel scan

A scan of the course attachment's `y` (0.25-unit steps) against the ready frame:

| attachment `y` | course spans | whole-frame MAE |
| --- | --- | --- |
| 823 | y[1 .. 1645] | 1.565 |
| 822 | y[0 .. 1644] | 1.254 |
| **821** | **y[-1 .. 1643]** | **1.011** |
| 820 | y[-2 .. 1642] | 1.286 |
| 815 | y[-7 .. 1637] | 2.976 |

A joint scan over `scaleX`/`scaleY` in 1.985..1.02 found nothing better than exactly
2. So the course is `course.png`, scale 2, spanning x[-1538, 1538] y[-1, 1643], and
MAE 1.011 over the whole frame is this build's floor — the residual is the reference's
own rasterisation of the same plate, and no rig change moves it.

### 4 — ball setup scan

Same method on the ball bone: (-1501.5, 1298.5), scale exactly 1.0 (0.95 and 1.05
both score 2.5x worse). The ball is 76 px of art at 1:1 — 4.28 frame pixels.

### 5 — per-frame ball fit, then curves

The 79-frame fit gives the shot in numbers. Landings squash and fast falls stretch,
and the magnitudes are much larger than the brief's "factor of two" hedge:

| frame | what it is | scaleX | scaleY |
| --- | --- | --- | --- |
| f0010 | part-way down the first long fall | 0.583 | 1.393 |
| f0015 | landing on the low left ledge | 1.108 | 0.798 |
| f0019 | the crouch before the leap | 1.139 | 0.734 |
| f0026 | landing on the first pillar cap | 1.323 | 0.697 |
| f0049 | the crouch on the right ledge | 1.283 | 0.612 |
| f0050 | one frame later, launched | 0.725 | 1.343 |
| f0062 | sliding down the girder | 0.828 | 1.314 |

The squash frames also sit ~7 units low, which is `r * (1 - scaleY)` — the ball keeps
its bottom on the surface, so the centre drops with the flattening. That is a key,
not an artefact, and it is in the fit.

Curves were then fitted rather than guessed. Handles are held at hx = (1/3, 2/3),
which makes a Spine bezier's time map exactly linear and leaves a two-parameter
value shape that is linear in both the key values and the handles — so key times
are chosen, and values and handles fall out of least squares against the measured
series. 73 distinct shapes came out; they are named for what they do
(`in-24-56`, `out-76-92`, `ease-28-84`, `over-120-m20`) rather than numbered.

**A parabola was the wrong first guess.** Gravity would put hy at (2/3, 1) rising and
(0, 1/3) falling. The measured falls are far steeper than that: apex to contact on the
second bounce drops 8 units in the first 1/24 s and 505 in the last 1/8 s. Authoring
it as a parabola left a 6.4 px error mid-fall. The fitted handles carry the hang.

### 6 — build + check, ball only

`translatex` / `translatey` split, because the axes key at different moments — x has
22 keys where the horizontal rate changes, y has 31 at every contact, apex and hold.
`scale` is paired (65 keys), because squash and stretch always move together.

Fit residual, in frame pixels: translatex rms 0.22 (worst 0.59), translatey rms 0.32
(worst 1.49), scale rms 0.02 / 0.02.

`check`, pinned: **MAE 4.34** against a course-only floor of 4.29. Re-rendering the
79 frames and differencing whole-frame gives 1.024 mean against the 1.027 floor — the
ball is at the rasteriser's noise.

### 7 — three dead ends in the curve fit

- **One extra key made it worse.** Adding a key at 24 fps sample 136 to help the last
  long fall moved the worst error at t=5.708 from 1.49 px to 2.13 px: the sample it
  was meant to serve is a half-resolution reading off the 24 fps sheet, and the fit
  chased it. Reverted.
- **Fitting both channels at once coupled them.** The first `fitTrack` fitted handles
  over x and y together, so the `translatey` handles were partly chosen by the x
  residual: rms 18.9 units. Fitting each track on its own channel took it to 5.5.
- **A key at 1/24 s off the 12 fps grid is unconstrained.** Two contacts (24 fps
  samples 21 and 87) fall between reference frames, so the squash there is invisible
  and least squares had nothing to pull on. Those two keys are pinned by hand from
  the landings that are visible, and the log says so rather than the numbers pretending
  to be measurements.
- **A hold has no shape, and fitting one anyway produced 220% overshoots.** The handles
  are normalised by (v2 - v1), so on the frames where the ball is at rest the fit
  divided a noise-sized residual by a change of 0.8 units and came back with handles at
  2.2 — a curve that swings 120% past a value nobody can see move, and exactly the kind
  of wrong-shape-between-right-values §8 warns about. Segments whose change is below a
  per-track floor are now left linear, which also took the easing count from 84 to 73.

### 8 — the character

18 bones, a hip at the ground contact, and the two decisions the art list forces.
**Six drawings of each hood tip and four of each foot are swapped, not posed** —
they are `attachment` timelines (36 keys each for the tips, 24 each for the feet),
holding one drawing through the two moments he stands still and ping-ponging while
he moves. The setup pose shows the course and the ball with every character slot
`null`, because `ball-ready-to-animate` has no tracks at all and still has to render
as the ball's first frame — so hiding the runner has to be the setup, and `speedy`
turns him on at t = 0 and the ball off.

The first build stood 10x17 px against the reference's 10x14 at f0016. Re-laying the
bones (head on torso on feet, no overlap) got it to 12x14 and its lit-pixel count
within one of the reference's 84.

The hip path was then fitted by rendering, the same way as the ball but two
parameters: the character's own pose is fixed, and only where he stands is measured.

### 9 — three more dead ends, on the character

- **A four-parameter hip fit collapsed.** Adding `scaleX`/`scaleY` to the hip fit let
  it shrink the figure to hide the pose mismatch: it came back with sx ~ 0.75 on most
  frames and sy scattered 0.54..1.30, and the SADs were no better. The landscape is
  shallow because a fixed pose is being matched to a moving one — the classic shape
  of a measurement that is really an artefact. Discarded.
- **Driving the hip scale off the reference's bbox made it worse.** The reference
  silhouette runs 11..26 px tall against my 14; scaling the body by that ratio put
  f0067's SAD up from 33374 to 54034. Looking at the frames at 10x says why: his
  height is limbs flying out from a body that stays the same size, not a scaled body.
- **Lengthening the limbs to match, likewise.** `scalex` on the leg and arm bones with
  `noScale` boots and hands — the right mechanism for reach — moved `speedy`'s MAE from
  6.32 to 6.41. The shares were guesses and the guess was wrong. Removed.
- **Aligning centroids is not the same as minimising MAE.** Three rounds of correcting
  the hip samples by the measured centroid difference took mean |dcx| from 0.61 px to
  0.20 px and |dcy| from 0.84 to 0.29 — and MAE went 6.32 -> 6.35 -> 6.37 -> 6.39.
  For a silhouette of the wrong shape, centring it is not what the pixels want.
  Reverted to the plain fit.

### 10 — the framing, which was worth more than all of the above

Every `check` so far had `--viewport` pinned to the reference's own box. Run without
it — which is how `bench --frames` runs it — the same build reported:

```
  ⚠️ the candidate frames itself to 192x126px where the reference frames are 192x124px
     MAE  mean 39.00   (ball)      40.30  (speedy)
```

**MAE 4.34 -> 39.00 from framing alone.** `check` frames a candidate by its own
content box, and mine was 3128.72 x 1962.12 world units where the reference's is
3157.94 x 1955.68. The long side sets the scale, so a 0.93% narrow box renders the
whole set 0.93% large — 1.8 px of drift at the far edge of a frame whose set is
5,500 high-contrast pixels.

The reference's box is in `frames.json`: the viewport minus the 4% pad on the long
side gives x[-1619.9378 .. 1538.0000] y[-7.1075 .. 1948.5680]. Three of those four
numbers my rig already had for real reasons — `maxX` is the course's right edge.
The other three are set by the character's outermost quad corners, which are
transparent margins of PNGs and are not in the pixels at all.

So two extremes were nudged, both inside the noise of the pose fit already recorded
above, and both named in [`authoring/gen.ts`](authoring/gen.ts):

| extreme | set by | nudge | cost |
| --- | --- | --- | --- |
| `minX` | the trailing hood tip at `speedy` f0000 | hip x at t=0, -29.24 units | 1.6 px on one frame |
| `maxY` | the head at the top of the last jump | hip y at t=5.5, -13.66 units | 0.8 px across ~7 frames |

Two passes were needed. The first matched the box's width **and height** exactly and
still reported MAE 12.7, because matching the height is not the point: the projector
reads `minX` and `maxY`, and my box bottom sat 6.1 units higher than the reference's.
The second pass dropped `maxY` by that 6.1 as well and let the height fall where it
liked — `pixelHeight` is a rounded product and tolerates +/- 8.9 units, so it stayed
124. That put my viewport within 0.06 units of the reference's on both axes it reads.

MAE, unpinned, after: **ball 4.35, speedy 6.35** — the pinned numbers, recovered.

**And the nudges have to be re-derived after any change to the fit.** The hold-floor
fix above moved the hip's y curve by about a unit, which moved the head's topmost
corner by 1.15 units, which moved the viewport by 0.065 px — and MAE went 4.35 -> 5.71
on that alone. Both constants were re-solved against the built skeleton (five passes of
build, measure the union box, correct) as the last step before `bench`. 0.065 px of
viewport offset is worth 1.35 MAE on this shot; that is the scale of thing this rung
is sensitive to.

One residual is honest and unfixable from here: the reference has something 6.1 units
below the course's bottom edge and this rig has nothing there. A pixel scan rules out
it being the course itself (a course at y[-7.11 .. 1636.89] scores 3.01 against 1.01).
Whatever it is, it is invisible, and the 6.1 units are absorbed into the `maxY` nudge.

### 11 — draw order, decided by colour algebra

The brief says the frames do not settle whether the set is in front, and warns against
building a reordering out of the two girder pixels the runner touches at `speedy/f0062`.
No reordering was built. But the two pixels do settle which side he is on:

At (129, 26) the set alone is `[187, 94, 57]` and the frame is `[81, 44, 27]`. If he
were **behind** a partly transparent girder edge of coverage `a`, his colour there would
have to be `232 - [106, 50, 30]/(1-a)`, which for every `a` that keeps all three channels
in range is a saturated blue — `[20, 132, 172]` at a = 0.5. Nothing on this character is
blue. In front, the same pixel is just his own colour at his own coverage.

So the course is slot 0 and everything else is in front of it. No `drawOrder` timeline;
`A31` reports SKIP and that is correct.

## Measurement mistakes made, and how they were caught

- **The 24 fps contact sheet was read wrong first.** Differencing each cell against the
  median of all 157 picked up the frame-index labels drawn over the cells, and every
  reading past index 100 was garbage (three-digit labels). Colour-keying the ball
  (R - B > 55) instead of thresholding the difference fixed it. The tell was that the
  garbage started exactly at cell 100.
- **The half-resolution centroid carries a sub-pixel bias.** On the frames where the
  ball is at rest the 24 fps sheet reads x = -819 and the full-resolution 12 fps frames
  read -807 — a fixed 11-unit offset from the downsample phase, not motion. Left in, it
  would have put a 0.6 px wobble into a hold. It is de-biased against the 12 fps fit at
  the even samples before anything is fitted.
- **A silhouette measured against the wrong base.** My own `speedy` frames were first
  differenced against a render that still had the ball in it, so every bounding box ran
  from x = 12 — the ball's absence read as part of the character. Caught because the
  boxes were 40 px wide for a 12 px figure.
- **The ball really does go backwards.** Between f0056 and f0058 it travels up and to
  the *left* at 13-16 px per frame, having gone left-to-right for five seconds. That
  looked exactly like a tracking failure. It is not: at 24 fps the arc is smooth, it
  clings to the right block's left wall for five samples, rebounds up-left into the
  girder, slides down its right face for ten, and only then launches at the top of the
  right block. §8 says look for a second way to get the number before authoring it; the
  second way agreed.

## Result

Gate, `--profile spine`: **17 PASS, 0 FAIL, 1 SKIP, 14 PROF.**
The SKIP is `A31_DRAW_ORDER_OFFSETS_RESOLVE` — no draw-order timeline, which is a
decision (see §11), not an omission. The 14 PROF are the 7 renderer and 7 archetype
rules `spine` does not carry; this is a foreign skeleton with no `invariants` block,
so that is expected and it means the green has **not** been held to renderer policy.

`check`, framed by the candidate's own content box (no `--viewport`):

| set | frames | MAE mean | MAE worst | ball drift, unambiguous frames |
| --- | --- | --- | --- | --- |
| `ball` | 79 | 4.35 | 4.47 at f0057 | n=50, mean 0.35 px, max 0.89 px |
| `ball-ready-to-animate` | 1 | 4.29 | 4.29 | 0.06 px |
| `ball-ready-to-animate@24fps` | 1 | 4.29 | 4.29 | 0.06 px |
| `ball@24fps` | 2 | 4.31 | 4.31 | 0.15 px at f0000 |
| `speedy` | 79 | 6.35 | 7.23 at f0009 | — |
| `speedy@24fps` | 2 | 6.33 | 6.78 | — |

The course alone renders at MAE 4.29 against these frames, so the ball costs 0.06 and
the runner 2.06. The runner is where this run is weakest and the log above says why:
a 16 px figure whose limbs fly off the body, reproduced by a rig whose limbs are
rigid.

**Read the drift column with the ambiguity note.** 29 of the 79 `ball` frames report
drift between 4 and 48 px, and every one of them is the matcher, not the rig: on 16
of them the ball is touching a ledge and the reference labels the two as one
component (the report says so), and on the other 13 it has no component of its own
and the nearest one is the floating girder 47 px away. On the 50 frames where the
ball is a component by itself, the mean drift is 0.35 px — a third of a pixel at
0.056 px/unit.

The `bench` summary is in [`README.md`](README.md) and [`bench.json`](bench.json).

## Notes for the guide

- **§9 should say that the framing is part of the deliverable.** §9.2 explains that a
  candidate is framed by its own content and warns that differing pixel dimensions
  "shift everything below", but nothing prepares an author for the size of it: this
  build's MAE went 4.34 -> 39.00 on a 2 px framing difference and back again, with no
  change to any key. It is by far the largest single effect measured in this run, it
  is invisible with `--viewport` pinned, and the numbers that fix it are `minX` and
  `maxY` of the content box — not the width and height, which is what the first fix
  attempt matched and why it took two passes.
- **§9's `--viewport` note is aimed at the wrong reader.** The flag is documented as
  being for "frame sets that have no `frames.json`". Its most useful role in an
  authoring loop is the opposite: pinning it to the sidecar's own box separates
  "my keys are wrong" from "my framing is wrong", which are two different repairs
  and read identically in the MAE column.
- **§9.2's drift table needs its denominator.** "Slot drift is what you act on" is
  true for the 50 frames here where the ball stands alone and wrong for the 29 where
  it does not, and the summary line reports the worst of all 79 — 48.3 px, which is
  the girder. The one-line summary would be more useful as the worst *unambiguous*
  drift, or with the ambiguous count beside it.
- **§8 could name the sample-grid trap.** The brief warns that a one-frame squash is
  landed on by luck at 12 fps; the authoring consequence is that some keys have no
  sample to fit against and must be authored from the ones that do. Worth saying next
  to "a value is easier to get right than a curve".
