# Rung 4 — attempt 1

- date:      2026-08-23
- agent:     Claude Opus 5 (1M context) — `claude-opus-5[1m]`, Claude Code / Agent SDK
- brief:     `bench/briefs/4-wave-principle.md` revision 2
- inputs:    the brief, `docs/AUTHORING.md`, `bench/runs/README.md`,
             `examples/4-wave-principle/images/`,
             `bench/reference/4-wave-principle/` (frames, contact sheets, `frames.json`)
- reference: **not read.** `examples/4-wave-principle/export/`,
             `bench/transcriptions/`, `docs/SPEC_COVERAGE.md`, `docs/LADDER.md`,
             `docs/feature_matrix.*`, `bench/count_features.ts`,
             `bench/render_reference.ts` and git history were never opened.
             `src/render.ts` and `src/check.ts` were read once, to understand how
             `check` frames a candidate (see turn 4) — the guide allows that.
- profile:   spine
- clean run: yes. `bench 4` was run once, at the end, and nothing was edited after.

## How the numbers were got, before any build

Everything below came out of the frames. The tooling was Python (PIL + numpy +
scipy) and it did four things:

1. **The disc.** Template-matched `platform.png`, rendered at the sidecar's
   `0.0869008 px/unit` and rotated, against each frame — first by correlating its
   alpha with the frame's non-background mask, then scoring the candidates by RGB
   error so the disc's asymmetric orange rim resolves a flip. Gives `(x, y, angle)`
   for all 155 frames.
2. **The chain.** The four free beads are clean orange blobs; a soft
   orange-weighted centroid locates each to ≈0.05 px. A global fit over all 155
   frames solved for the top joint's offset from the disc and the four link
   lengths at once, choosing the bead→link assignment by permutation search.
   **rms residual 0.166 px over 620 constraints.**
3. **The ball.** Component centroid where it is a separate blob, subpixel SSD
   against a composited `basket-ball` + `basket-lambertian` template elsewhere.
4. **Art anchors.** Each chain PNG's orange bead centroid, measured with the same
   weighting used on the frames, is the point that lands on the bone.

Two structural things fell out that no single frame shows:

- The chain's top pivot sits **at the disc's art centre** — the fit put it at
  (0.20, 0.23) px from it. So the disc pivots about the point the chain hangs from.
- `basket-lambertian` is composited over the ball at **0.7 alpha** (fitted; 1.0
  reads flat grey, which the frames are not), and the ball's own alpha **steps from
  1.0 to ≈0.25 between f0091 and f0092** — from f0092 the ball is nearly neutral
  grey (R−G ≈ 18 instead of ≈ 55). Fitting both alphas jointly at f0098 gives
  (ball 0.25, shade 0.70) at MAE 3.4 on the ball's own 24×24 window.

### Three readings that were wrong first

- **The top joint, from the wave shots alone.** Fitting "the point equidistant
  from bead 2 over 34 wave frames" converged to 5 px *below* the disc with a
  residual of 0.06 px — a tidy, confident, wrong answer. It is a circle fit to an
  arc that spans 11.6 px in x and **0.95 px in y**: the radius is barely
  constrained, and the cost landscape is flat from y=513 to y=520. Two things
  killed it: the top bead's visible chord does not move relative to the disc as
  the link swings (so the pivot *is* the bead), and `ball-catch`, where the disc
  turns through 360°, conditions the same fit properly. §8's "run the estimator
  over two shots and cross-check" is exactly the rule that catches this.
- **The disc's rotation at f0079–f0083.** Searching ±90° made the flip read as a
  sign flip (−78°, +17°, −76°, +31°). Widening to −270…+90 and scoring on RGB
  rather than silhouette shows a single continuous clockwise **full revolution**:
  −20, −78, −163, −255, −329, −355. The silhouette of a disc is symmetric under
  180°; only the orange rim breaks the tie. §8's "a symmetric shape hides a sign
  error", in a different costume.
- **Where the chain hangs from.** Modelled first as a sibling of the disc bone
  (translating with it, not rotating). That forces chain1's rotation to sweep a
  full −360° through the flip. Re-parenting chain1 *under* the platform bone turns
  the same measurements into a smooth ±40° curve — and the smoothness is the
  evidence, because an animator's curve is the smooth one.

### What could not be measured

- **The end ring's rotation.** `chain-end` is very nearly rotationally symmetric
  at 11 px across. A rotation sweep of ±90° in a private renderer changed the
  error by less than its noise, and `check` with a pinned viewport moves by 0.5 MAE
  over ±20°. Authored as 0 relative to `chain4` and flagged.
- **The ball's spin.** The seams visibly change orientation, but a per-frame fit
  jumps ±90° between neighbouring frames at indistinguishable error. No rotate
  timeline was authored; this is a known omission, not a claim the ball does not
  spin.
- **The ball's squash and stretch.** Real and measured — the component's axes go
  to 11.1/6.9 px at f0084 and 12.2/8.1 px at f0085 against 9.0/9.0 at rest — and
  deliberately not authored, to keep the run's scope to the wave. Also flagged.

## Loop

### 1 — build (green first time)

```
bun cli.ts build --rig …/wave-principle.rig.json --motion …/wave-principle.motion.json \
  --images examples/4-wave-principle/images --out …/spine --profile spine
```

17 PASS, 0 FAIL, 1 SKIP (`A31`, no drawOrder timeline), 14 PROF.
`explain`'s slot table lists all eight slots in the intended order with the
intended setup attachments. So the gate had nothing to say about this rig at any
point in the run — which is the guide's own headline and worth restating: **every
single correction below came from `check`, none from `build`.**

### 2 — check, default framing

```
MAE  ball-catch 43.39 · wave-by-hand 49.45 · wave-offset 47.34
⚠️ the candidate frames itself to 768x632px where the reference frames are 768x634px
slot drift: no slot could be attributed in any frame
```

Every slot is `ambiguous` in every frame of all three animations: the disc, five
chain links and the ball are one connected component in the reference wherever
they touch, which here is always. **There is no drift number in this run at all** —
the MAE is the whole instrument, as §9.2 warns.

### 3 — is that 45 the animation, or the framing?

Re-ran with `--viewport` pinned to the reference's box expressed in the
candidate's coordinates (calibrated from the tracked disc position, so the
candidate and the reference share one grid):

```
wave-by-hand  content framing 49.45  →  pinned 22.96
```

So **half the reported error was the framing**, not the motion. This is the run's
main finding and it is developed in turn 4.

### 4 — reading `src/render.ts` and `src/check.ts`

Not for an answer — for the framing rule, because the warning above says "2px out"
and calls it harmless, and it was not harmless. What the code says:

- the box is the union of posed quads at `FRAMING_FPS = 60`, padded by
  `PAD = 0.04` of the longer side;
- `scale = maxSide / max(width, height)` — so on this shot the **width alone sets
  the scale**;
- `worldToPixel` is `(wx − minX)·scale, (maxY − wy)·scale` — anchored at the box's
  **left and top**.

Three consequences that matter for authoring:

1. `minY` — the bottom of the box — does not enter the mapping at all. The
   "768x632 vs 768x634" warning is therefore *cosmetic*, and chasing it is chasing
   the wrong number.
2. What does enter is `minX`, `maxY` and the width. Each of those is set by **one
   corner of one quad in one frame**. My box was 5 units (0.44 px) wider and its
   top 3 units lower than the reference's — sub-pixel errors on single frames —
   and that rescales and shifts *every* frame of *every* animation.
3. Quad corners are invisible. A region's quad extends past its own artwork
   wherever the art is transparent, so a part that is never seen to move can still
   move the framing.

### 5 — sweeps against `check`, with the viewport pinned so geometry is isolated

| swept | values | pinned MAE (wave-by-hand) | verdict |
| --- | --- | --- | --- |
| `chain-1` anchor, art y | 0 / 8 / 15 / 22 / 30 | 23.99 / 23.34 / 22.96 / 22.99 / 23.71 | flat bottom at 15–22; took 18. Independently derived 15–20 from where the bead's orange stops against the disc's edge |
| `chain-end` anchor, art y | 50 / 58 / 63 / 67.8 / 74 | 20.06 / 17.49 / 15.79 / **14.79** / 16.38 | the measured value wins outright — the anchor is right |
| `chain5` rotation, constant | −20 / −10 / 0 / +10 / +20 | 15.06 / 14.82 / 14.79 / 14.92 / 15.35 | **flat**: the ring's rotation is not in the pixels |

The same `chain5` sweep under *default* framing reads 84.92 / 71.91 / 49.67 /
27.60 / 60.21. That is the finding in turn 4 with a number on it: **an angle the
pixels cannot see moves the reported MAE by a factor of three**, purely by
swinging one quad corner in and out of the content box.

### 6 — a dead end: giving `chain5` the wave

The brief says every link starts a beat after the one above, so the end ring
presumably rotates too. Authored `chain5.rotate` as `chain4`'s curve lagged 1.5
frames and scaled 1.1×. Pinned MAE 14.79 → 14.67 (a real but tiny improvement, so
the ring probably does rotate); default MAE 49.67 → 72.88, because the swung
corners widened the box. Reverted: an invented curve that makes the headline
number worse is not worth keeping, and I cannot tell whether 14.67 is signal.

### 7 — the 24 fps contact sheets, used as measurement

The candidate's box was short at the bottom. Rather than guess, I measured the
`ball-catch@24fps` sheet: cells are 255×210 for a 768×634 frame, so ~3× down, but
a subpixel correlation of the disc's row profile between cells is still good to
≈0.3 frame px — cell 4 (12 fps f2) came back at +1.96 px against the 12 fps
measurement's +2.05.

It shows the launch's **anticipation dip bottoming between 12 fps f1 and f2**:
+3.06 px at f1, **+5.94 px at f1.5**, +1.96 px at f2. The extreme is not on the
12 fps grid at all. Added one `translate` key at t = 1.5/12 s at −72.5 units.
The box height went 631 → 633 px; the MAE did not move (turn 4, consequence 1),
but the animation is right where it was wrong.

This is the one place the shot's motion genuinely lives between the frames I was
given, and the sheet is the only reason I know it.

### 8 — control: is my easing convention the right way round?

Rung 1 shipped a green build with every easing reversed. Cheap test — rebuild the
same rig with (a) all easings stripped, (b) every easing mirrored
`[hx1,0,hx2,1] → [1−hx2,0,1−hx1,1]`:

```
mine      pinned MAE 14.79   worst 22.97
linear    pinned MAE 73.27   worst 100.12
reversed  pinned MAE 82.76   worst 111.90
```

Reversed is worse than *no curves at all*, which is what makes this failure so
expensive and so invisible to `build` and `diff`. The convention is right.

### 9 — refitting the ball where the disc covers it

Frames f0031–f0070 have the ball resting on the disc, and the template match there
was pulled by the disc's pixels — up to 1.3 px in y. Refit with the template's
lower 45% masked out.

```
default framing:  ball-catch 43.50 → 39.23 · wave-by-hand 49.67 → 43.65 · wave-offset 47.58 → 41.67
```

Note the wave animations improved without a single wave key changing: the ball's
corrected extremes moved the shared content box.

### 10 — key density, tightened to the measurement floor

The fitter places keys greedily — insert a key at the worst residual, refit each
segment's easing from a grid of graph-view handles, repeat until the residual is
under tolerance. Sweeping the tolerance:

| tolerance | keys, `ball-catch` | ball-catch | wave-by-hand | wave-offset | framing |
| --- | --- | --- | --- | --- | --- |
| 6 units / 0.5° | 391 | 39.23 | 43.65 | 41.67 | 768x633 (1px out) |
| 4 units / 0.3° | 471 | 19.64 | 16.95 | 16.95 | exact |
| 2 units / 0.15° | 543 | **17.91** | **14.31** | **14.49** | exact |

The 6 → 4 step is not mostly about sampling density. It is turn 4 again: with
sparse keys the frame that sets a content extreme is often *not* a key, so the
extreme lands on an interpolated value and the whole normalisation shifts.

I stopped at 2 units (0.17 px) and 0.15°, because that is where my own
measurements stop: bead centroids repeat to ≈0.05–0.2 px and link angles to
≈0.1–0.3°. Keying tighter would be fitting my noise; keying looser throws away
signal I actually have.

That rule is defensible and it still bought a file denser than the reference —
`diff` afterwards put this rig at 639 keys against a rung the gate line describes
as *470 bezier keys*. The 4-unit / 0.3° row above (471 keys, MAE 19.6 / 17.0 /
17.0) is the sparser cut of the same measurements and is the fairer structural
comparison; the README says so too.

## Result

`bun cli.ts bench 4 --candidate bench/runs/2026-08-23-rung4-1/spine --frames bench/reference/4-wave-principle --json bench.json`

The summary is in [README.md](README.md), verbatim.

## Notes for the guide

1. **§9.2 undersells the framing.** "A couple of pixels is rounding in the art
   sizes … and it shifts everything below" is right about the cause and much too
   calm about the size. On this shot a sub-pixel error at one content extreme
   tripled the MAE, and a parameter the frames cannot resolve at all
   (`chain5`'s rotation) moved it from 27 to 85. Two things would help an
   authoring agent: say that the *width* alone sets the scale and that `minY`
   does not enter the mapping (so the `NxM px out` warning is not the thing to
   chase), and say that **quad corners extend past the visible art**, so framing
   can turn on geometry no frame shows.
2. **A drift table of nothing is a real outcome.** Every frame of every animation
   here reported `some slots ambiguous` — a chain that touches itself never
   separates into components. §9.2 says the MAE carries those frames; it would be
   worth saying up front that some shots yield **no** drift measurement at all, so
   an agent plans for MAE-only from the start instead of waiting for a slot table.
3. **Sparse keys can move the framing.** Worth one line in §4.5: the frames that
   set your content extremes want keys on them, whatever the tolerance elsewhere.
4. **The 24 fps sheets are numerically usable.** §8 does not say so, and I nearly
   treated them as illustration. Subpixel correlation on a 3×-downscaled contact
   cell recovered the disc's vertical position to ≈0.3 frame px, which was enough
   to find a motion extreme that is not on the 12 fps grid.
5. **An agent's own rasteriser is not a substitute for `check`.** Mine (PIL,
   Lanczos) sits at ≈35 MAE against the reference on the *platform alone*, placed
   perfectly. It is fine for "does this look like the frame" and useless for
   fitting. `check` is the only rasteriser that agrees with the reference, which
   is the practical reason it belongs inside the loop.
