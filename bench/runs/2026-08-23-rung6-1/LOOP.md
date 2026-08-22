# Rung 6 — attempt 1 — the loop

- date:      2026-08-23
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK, fresh session
- brief:     `bench/briefs/6-arcs.md` **revision 3** (third-party verified)
- inputs:    the brief, `docs/AUTHORING.md`, `bench/runs/README.md`,
             `examples/6-arcs/images/`, `bench/reference/6-arcs/`
- reference: **not read** — `examples/6-arcs/export/`, `bench/transcriptions/`,
             `docs/LADDER.md`, `docs/SPEC_COVERAGE.md`, `bench/count_features.ts`,
             `bench/render_reference.ts` and git history were never opened
- profile:   spine
- `bench`:   run once, at the end, after the last edit to either spec

Worktree: `/tmp/rigc-run6` on `run/rung6-1`, per `bench/runs/README.md`.

## 0 — reading the art before authoring anything

Four PNGs, measured for their alpha extents rather than looked at:

| File | Pixels | Alpha box | Components |
| --- | --- | --- | --- |
| `ball.png` | 156×156 | 154×154, centred | 1 |
| `tail.png` | 380×111 | 378×109 | 1 |
| `platform.png` | 1064×396 | — | **15**: one 1029×342 body, one 6×47 mark at x 1058–1063, and 13 specks |
| `arc-tracker.png` | 18×18 | 16×16 | 1 |

Two things came out of that and both changed the build:

- **`tail.png` points the other way from how it reads at a glance.** The rendered
  thumbnail looks like a rounded cap on the left and a taper to the right. The
  per-column alpha profile says the opposite: at x=1 the spindle is **3 px tall**
  (a sharp point) and at x=378 it is **30 px** and cut flat. Widest at x=132. So
  the **blunt cut end is the one that joins the ball** and the art is used
  unflipped, with the ball to its right. Believing the thumbnail would have put the
  silver bands at the wrong end of every frame.
- **The stone's 15 components fix its scale without any fitting.** The body is 1029
  art px wide and the brief's measured stone body is 176 frame px; at the frames'
  0.08545789 px/unit that is a scale of **2.0015**, i.e. the plate is used at **×2**
  and the residual is the pixel the box was rounded to. The same factor puts the
  detached 6×47 mark at frame x=450.9, y=109.3; the brief measured x=451, y=109.
  Two independent facts from one number, and §9's fit later returned 1.99836 for it.

`frames.json` gives the world box and scale, so every frame-pixel measurement
below converts to the units the rig is authored in (1 px = 11.7017 units).

## 1 — build (structure only, `"animations": {}`)

```
bun cli.ts build --rig …/arcs.rig.json --motion …/arcs.motion.json \
  --images examples/6-arcs/images --out …/spine --profile spine
```

```
FAIL  A00_ROUNDTRIP_PARSE: threw: Region not found in atlas: trail (attachment: trail)
```

The mesh placeholder was called `trail` and its `image` is `tail.png`. **R5 writes a
`path` for a region whose PNG basename differs from the placeholder; it does not do
that for a mesh** — `buildGeneratedMesh`/the authored-mesh path copy `att.path` only
when the spec states it. Changed: renamed the placeholder to `tail` (slot stays
`trail`).

*Guide note: §3.4's mesh table lists `path` but nothing says the auto-`path` of R5
is region-only. That is one loop spent on a sentence.*

## 2 — build

Green, 0 FAIL. `A09` SKIP (a static rig has no duration to compare) and `A31` SKIP
(no draw-order timeline in this shot); the renderer-policy and archetype assertions
came back PROF under `--profile spine`, which is §7 step 3's expected shape for a
foreign skeleton with no `invariants` block. The final build of the finished rig
reports **17 PASS · 0 FAIL · 1 SKIP (`A31`) · 14 PROF**.

## 3 — the two shape decisions, and why the ribbon generator is not one of them

**The trail.** `buildRibbonMesh` lays its rows along the part window's **height** and
its width along **x**, and the compiler maps the window centred on the slot bone with
`py` running down. So a generated ribbon's long axis is always the region's *v* axis.
`tail.png` is 380 wide × 111 tall — its long axis is *u*. Feeding it `size:[380,111]`
gives a strip that bends across the spindle's short axis; feeding it `size:[111,380]`
turns the art 90° and stretches it. Neither is the shot, and the only way to use the
generator would have been to author a rotated copy of the art.

So the trail is an **authored mesh with named `weights`** (§3.4's recommended form)
laid out along the art's own long axis: a chain `tail0…tail6`, the mesh spanning
art x 380 (entry) → 0 (tip), two rows per chain segment, each row's two vertices
carrying identical weights so the strip cannot change width. `A21` and `A28` SKIP on
an authored mesh, which is correct and is also why the width guarantee here is mine
to keep rather than the gate's; `A04`, `A20` and `A22` still ran and passed.

**The ball.** It is one piece whose proportion runs from stretched to flattened. The
squash axis is screen-vertical on every landing (the pale grey cap stays at the top
of the ball in every frame checked — f0, f6, f13, f20, f26, f34 — so the ball does
not rotate), so `scaleX`/`scaleY` on a bone expresses it exactly, and a mesh would
render to identical pixels (§9.3). `ball` is a **sibling** of `tail0` under `comet`,
not its parent, so the squash does not propagate into the trail.

**`arc-tracker`** is a slot with a `null` setup attachment and a two-key stepped
attachment timeline, parented to `tail6` — the trail's tip.

## 4 — the estimator, and calibrating it against the reference's own numbers

Nothing here is eyeballed. Per frame: a **per-pixel modal backdrop** over the 69
frames (so the stone is part of the backdrop and the subject is what differs from it
by >8/255), connected components, an inscribed-radius (distance-transform) profile,
and a **neck split** at the minimum of that profile along the geodesic from the
fattest point — the same shape of estimator the brief's third-party pass describes,
written from scratch here.

Scored against the brief's published figures before it was used for anything:

| Quantity | Brief (rev 3) | This pass |
| --- | --- | --- |
| stone body | 176×59 at x 270–445, y 50–108 | identical |
| detached mark | 1×9 at x=451 | 1×(5+2) at x=451, y 110–117 |
| drawn area, outside f45–52 | 309–345, mean 333 | 309–345, mean 333 |
| smallest box | 18×19 on f48 and f50, 280 and 270 px | identical |
| least drawn area | 234 px on f51 | 234 px on f51 |
| ball centre f0/f2/f59 | (54.8,101.1)/(54.7,102.3)/(484.8,101.2) | (54.9,101.1)/(54.3,102.1)/(484.9,101.1) |
| tip f0/f2 | (21,99)/(20,88) | (21,99)/(20,88) |
| centre steps f43→f47 | 5.9, 14.2, 16.1, 16.6 | 5.5, 14.4, 16.2, 16.9 |
| trail bend | 0.8–8.2 px, median 4.7 | 0.7–8.5 px, median 4.3 |

**Dead end — the centre line.** The first centre line was the centroid of the trail
pixels in each geodesic level set. At 6.5 px per chain segment on a 9 px-wide
spindle that is pure noise: adjacent knot directions came out 20–40° apart on frames
where the trail is visibly smooth (f0 read 160°, 158°, −177°, −179°, −138°).
Replaced with a **degree-3 least-squares fit of x(d) and y(d)** over every trail
pixel, d = geodesic distance — which is what made the bend figures above reproduce
the brief's.

## 5 — fitting the pose to the pixels rather than to a chain of estimates

The centre line still could not give the ball's centre on f45–f52, where the brief
says (correctly) that the split fails. So the motion was fitted the other way round:
load the compiled candidate, pose it directly through `spine-core`, render it with
**`src/render.ts` into the reference's own viewport**, and minimise mean |ΔRGB|
against the reference frame over a fixed per-frame window. Nine parameters per frame
(`comet.x/y`, the ball's squash, six chain rotations), pattern search, multi-start.

This never opens the reference skeleton — only the frames — so it is a `check`-class
loop, not a `bench`-class one. Its second virtue is that **any bias in the estimator
cancels**: the same neck-split estimator is run over my rendered frames and over the
reference's, and only the difference is read.

**Mistake — the objective window.** The first version derived the comparison window
from each *seed*, so two seeds for the same frame were scored over different windows
and their costs were not comparable. Multi-start was therefore choosing on noise. Fixed
to one window per frame (the reference's subject box padded 42 px — enough that a
trail pushed anywhere still falls inside it and cannot be hidden by leaving the frame).

**The ball's area is a constraint, not a free parameter.** With `scaleX` and `scaleY`
independent the optimiser inflated the ball to 1.68× on f47 to cover the reference's
blob. The brief's reliable form of the claim — "the ball's drawn area is very nearly
constant, so widening it has to flatten it" — is also what my own area measurement
says (309–345 on a mean of 333), so `scaleY = 1/scaleX` was imposed. Total cost
changed by 0.2 % and the cheat disappeared.

## 6 — draw order: the frames do not answer, and that is the finding

The overlap between ball and trail is the tail's flat blunt end, which is 2.6 px tall
and sits inside the ball's own silhouette on every frame outside the hook. §8's test —
find a frame where one part's interior detail lies inside the other's area — has no
frame to run on except f45–f52, and those are the frames no estimator can split.

Measured anyway, by fitting the whole shot twice:

| Draw order | fit cost | `check` MAE (pinned) |
| --- | --- | --- |
| stone · **trail** · ball · tracker | 0.7566 | **3.50** |
| stone · **ball** · trail · tracker | 0.7651 | 3.53 |

0.6 % apart, on an objective whose own noise is larger. **Chose trail behind ball**:
it measured marginally better, and the tail's blunt end is a *flat cut* — art that is
built to be tucked under a head, and that would read as a straight seam across the
ball if drawn over it. Recorded as a choice, not a measurement.

## 7 — the hook, f45–f52: a model limit, confirmed as one

The reference curls the trail into a ring that overlaps itself; the interior of that
ring shows the stone through it (f48 rows 74–81, f49 rows 79–82 are stone-coloured
pixels *inside* the subject). My first candidate did not reach it.

Before blaming the model, the optimiser was ruled out: **30,000 random poses per
frame plus pattern-search refinement of the best 40** found nothing better than the
incumbent on any of f47–f50. Then the chain resolution was tested, since a polyline's
turning radius is bounded by its segment length:

| Chain segments over the tail | total fit cost |
| --- | --- |
| 5 | 1.5982 |
| 6 | 1.6003 |
| 8 | 1.5877 |

0.8 % apart — the frames do not favour any of them, so the count was chosen on what
the rig has to do rather than on the pixels: **6 segments**, enough for the degree-3
bend the trail actually has, with a joint every 5.4 px. What is left at f47–f50 is a
few pixels of the ring's interior; the candidate gets the mass and the extent and
loses the hole.

## 8 — the structural numbers, swept rather than asserted

The trail's geometry has three numbers that are not animation: how far the tail's
blunt end sits from the ball's centre (`LEAD`), the art scale of the tail, and the
art scale of the ball. Each was swept, rebuilding and refitting each time:

| | value | fit cost |
| --- | --- | --- |
| LEAD | 40 / **56** / 60 / 68 / 80 | 0.884 / **0.786** / 0.798 / 0.865 / 1.043 |
| tail art scale | 0.97 / **1.00** / 1.03 / 1.06 | 0.796 / **0.798** / 0.882 / 1.020 |
| ball art scale | 0.97 / **1.00** / 1.03 / 1.06 | 0.812 / **0.798** / 0.816 / 0.852 |

Both plates are used at **scale 1**, which is the same answer the art gave in §0
(a 154 px ball is 13.2 frame px; the flight frames measure 13–15). `LEAD = 56` units
= 4.8 px.

## 9 — the stone was 0.3 px out, and it was worth 0.4 MAE

First `check`, before this: **MAE 5.67**, and the union is ~6,400 px of which 6,023
is stone — so the stone dominates the number. Fitted the stone alone against f0 (the
comet is 200 px away there): the bone wanted to move 1.6 and 3.1 units (**0.14 and
0.27 frame px**) from the position computed straight out of `frames.json`, and the
plate scale came back **1.99836** against the 2.0 read off the art. Kept the exact
2 and took the offset. Region-only cost 2.91 → 0.75; whole-shot `check` 5.67 → 5.26.

That 0.3 px agreement is also the evidence for §11's pin.

## 10 — two bugs the gate cannot see, both found by rendering the candidate back

**The tracker never fired.** Key times were rounded to 4 dp, so the last key landed at
`5.6667` while the last sample of a 68/12 s animation is at `5.666666…`. The gate is
green either way — `A09` compares the declared duration to the loaded one and both said
5.6667. Only re-rendering the animation and diffing f67→f68 showed the reveal missing.
Fixed by **flooring key times to 6 dp** so no key can be later than the sample that
should see it.

**The settle was not still.** The reference is pixel-identical across f64–f67 and f68
differs by exactly 3 pixels (the tracker). My render changed **91 pixels** across
f67→f68, because greedy key reduction is allowed to slope a line through a plateau
if the deviation stays inside tolerance. Fixed by forcing a key at the first frame of
every constant run. 91 px → **2 px**, and both are the tracker.

A related fix at the same place: reference frames that are pixel-identical must get an
**identical pose**, and the per-frame fit had converged on three visibly different
poses for f64/f65/f66 at nearly equal cost. A polish pass now freezes duplicates and,
where a neighbour's pose costs within 2 % of the incumbent, prefers the continuous one.
Cost +0.1 %, jitter gone.

## 11 — reading `check`, and the framing

`check` was run through the loop a dozen-odd times. The last two runs, on the same artifacts:

| | framing | MAE (12 fps set) |
| --- | --- | --- |
| unpinned | fitted, `0.085512 px/unit`, **did not settle in 4 passes** | 8.73 |
| `--viewport` pinned to `frames.json` | `0.085458 px/unit` | **3.50** |

The content boxes agree either way — `471.2 × 89.5 at (20.5, 19.5)` against the
reference's `471.4 × 89.5 at (20.4, 19.5)`, union residual −0.40 × −0.04 px, rms
0.26 px over 284 edges. So the two shots *are* the same size in the same place. The
unpinned fit nevertheless lands on a scale **0.063 % away** from the one the frames
were rendered at, will not settle, and that fraction of a percent costs **5 MAE
points**.

The pin is §9's second case, and the claim it makes is checkable rather than
asserted: every number in this rig was computed from `frames.json`'s own world box
and scale, and §9's stone fit is the independent confirmation — the stone converged
**0.14 / 0.27 px** from where `frames.json` says it goes. Both numbers are reported.

## 12 — key density: what it costs, measured

Keys were chosen by greedy tolerance fitting against the fitted per-frame track,
**linear** between them. At 12 fps with keys landing every 1–3 frames there is almost
nothing left for a curve shape to be constrained by, and §8's lesson is that a guessed
curve is where the error lives — so no easings were invented.

| tolerance (px / scale / deg) | keys | MAE (pinned) |
| --- | --- | --- |
| 0.36 / 0.02 / 2.5 | **440** | **3.50** |
| 0.68 / 0.035 / 4 | 393 | 3.74 |
| 1.03 / 0.05 / 6 | 350 | 3.98 |
| 1.54 / 0.07 / 9 | 305 | 4.52 |

Shipped the tightest. Even there the count is ~55 keys per 69-frame timeline: at
12 fps this shot genuinely changes pose almost every frame, and a sparser file would
be smoothness the frames do not show.

## 13 — the squash: cross-checked, and a clamp that did not clamp

The fit is free to explain a trail error with a ball shape, and it was doing so: it
wanted proportions up to 2.05 where the brief's flattest measured frame is 1.80 and my
own like-for-like read of the reference agrees. A clamp was added to hold the fitted
proportion inside **[0.72, 1.85]**, the fit and polish were re-run, `check` moved
3.49 → 3.50, and the run moved on.

🚨 **The clamp did not bind, and I only found that out after `bench` had been run.**
Reading the emitted `skeleton.json` back:

```
ball scale, 52 keys:  proportion 0.519 … 2.052, median 0.994
                      scaleX*scaleY 0.99992 … 1.00007
8 keys outside [0.72, 1.85]: f2 2.05 · f20 1.95 · f34 1.90 · f26 0.55
                             f44 0.67 · f45 0.71 · f48 0.64 · f50 0.52
```

The area constraint held to five decimals. The proportion clamp did not, and the
reason is a shape of bug worth naming: **it was implemented as "refuse a step that
leaves the range", which constrains moves and not starts.** The refit was warm-started
from the previous, unclamped fit, so every frame whose incumbent was already outside
the range stayed there — the search could only decline to make it worse. A bound
enforced on the transition is not a bound on the state.

`bench` had already run by the time I read the keys back, so the specs were left
alone: the honesty rule makes `bench` a finish line, and "I edited it afterwards for a
good reason" is exactly the door that rule closes. What is shipped is what is
described here, and the defect is listed in §14 rather than quietly fixed.

Final like-for-like, the same estimator over both sides, excluding f45–52:

- ball box: mean difference **−0.20 px wide, −0.30 px tall**
- trail bend: reference 0.7–8.5 px median 4.3 · candidate 0.1–9.3 px median 3.9

Those aggregates are good because the over-squash is concentrated in the handful of
contact frames listed above; per-frame, f2 reads 23×9 against the reference's 17×11
and f20 reads 20×10 against 17×10 — the ball is 2–3 px too wide exactly where it
flattens hardest.

## 14 — what is still wrong

- **f47–f50**: the ring's interior. The candidate covers a few of the pixels that
  should show stone through the loop. Model limit, confirmed in §7.
- **the tracker is 1 px up-left** — the reference's core pixel is (460, 86), mine is
  (459, 85) with the exact colour `46,49,146`. It rides `tail6` at offset (0,0), so
  this is the trail tip's own 1 px, and no offset was invented to hide it.
- **the ball over-squashes on eight contact frames** — §13. Proportion reaches 2.05 at
  f2 and 0.52 at f50 where two independent estimators put the reference's extremes at
  1.80 and 0.76. The intended clamp was written and did not take.
- **f10** is the worst 12 fps frame outside the hook (MAE 4.46–4.73 depending on
  framing); the trail sits ~3 px long there.
- Nothing in the frames pins bone `length`, `inherit`, parentage or names (§9.3), and
  nothing here claims them.

## Notes for the guide

1. **R5's auto-`path` is region-only.** §3.4 should say so beside the mesh's `path`
   row; it costs one build to find out.
2. **The ribbon generator's long axis is the region's `v`.** §3.4 calls it "a two-wide
   strip along a bone chain" without saying which way the strip runs relative to the
   art, and the answer decides whether a given plate can use it at all.
3. **A key time rounded up past the last sample is invisible to the gate.** `A09`
   compares durations, and both sides agreed; the animation silently lost its last
   event. Worth a line in §4.5 beside "seconds, not frames".
4. **A bound enforced per step is not a bound on the value.** §13's clamp refused any
   move outside the range and left every warm start that was already outside it alone.
   Nothing in the loop surfaces that: the gate has no opinion on a scale key's value,
   `check` was indifferent to it, and it only turned up on reading the emitted keys back.
   The general form — *re-read the artifact for the property you think you constrained* —
   belongs beside §7's "before you call it done".
5. **§9's framing can fail to settle even when the content boxes agree.** The warning
   text exists and is accurate; what is missing is that the *cost* of an unsettled fit
   is large — 5 MAE points here for 0.063 % of scale, on a candidate whose union
   residual is under half a pixel. That is worth naming next to the `--viewport`
   guidance, because it is the difference between "my keys are wrong" and "my keys are
   fine".

## Result

`bun cli.ts bench 6 --candidate …/spine --frames bench/reference/6-arcs --json bench.json`
— run **once**, after the last edit to either spec.

```
  ── summary ──
  validate   green  (profile spine)
  pro        bones=0.433  slots=0.306  attachments=0.321  constraints=0.000  animations=0.810  events=1.000
  framing    fit x0.999505  rms 0.26px  union residual -0.40 x -0.04px  (fitted to the candidate's pixels, 4 pass(es))
  arcs       MAE mean=8.73 worst=9.69  over 69 frame(s)  worst slot drift 4.1px, attributed in 69
  arcs@24fps MAE mean=8.47 worst=8.65  over 2 frame(s)  worst slot drift 0.6px, attributed in 2
```

Nothing was changed after this ran. The run is **clean**, not bench-assisted.
