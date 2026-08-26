# Rung 4 — attempt 1 of 2026-08-26, the loop

- date:      2026-08-26
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- inputs:    `bench/briefs/4-wave-principle.md` (**revision 3**, 2026-08-26),
             `docs/AUTHORING.md` in full, `examples/4-wave-principle/images/`,
             `bench/reference/4-wave-principle/` (frames, contact sheets and
             `frames.json`), this repository's `src/`, Spine's public documentation
- reference: **not read.** No reference skeleton was opened, and the candidate does
             not use the supplied atlas — rigc emits its own from the loose PNGs.
             The `.atlas` itself **was** opened, which allowed-reading item 4
             permits, for one line: `scale: 0.5`, because the protocol's rung-3 row
             now warns this example family packs at half size and that it floors the
             MAE. That figure and the three controls that answered it are in
             [`README.md`](README.md), *A note on the supplied atlas*; nothing else
             in the file was read and no other export file was touched.
             `bench/transcriptions/`, `docs/LADDER.md`'s status table / per-rung
             sections / *Operating rules*, `docs/SPEC_COVERAGE.md`, `src/ladder.ts`,
             `render_reference.ts` and the per-rung issues were not opened at all
- guide:     AUTHORING.md §10 in hand
- profile:   spine

## 1 — honesty-rule notes, and one thing the prompt asked for that the protocol seals

Recorded here because a leak that is named costs a run some measures and a leak
that is buried costs the ladder every figure it ever printed.

**Two surfaces the launching prompt pointed at are on the forbidden list, and this
run did not open either.**

- *"docs/LADDER.md — Operating rules; gate v2 (G1–G7) is the pass bar."* —
  `bench/runs/README.md`'s forbidden table names *Operating rules* explicitly, and
  gives the reason: it derives its thresholds by quoting previous runs' measures
  back, so it carries them. The run protocol is the SSOT over the prompt, so the
  section was not read and **this run does not know what G1–G6 say.** It was
  authored to the brief, to §10 and to `check`, which is what the brief itself asks
  for (*"do not tune toward a number"*). G7's own text arrived in the prompt as a
  clause about the candidate's own tile distribution — *worst tile ≤ 3.5× that
  sheet's own mean* — which constrains a diff's shape and no reference-side value,
  so it is not answer-bearing under the honesty rule's own criterion, and it is
  measurable in the loop by `check`. It was used that way.
- *"Issue #17 (`gh issue view 17 --comments`)"* — the forbidden table names *"the
  per-rung issues (#10–#18)"*. #17 is rung 4's. Not opened. The result comment is
  posted to it at the end, which needs no read.

The dispatching commander confirmed the same reading mid-run — *"the forbidden list
WINS, per the repo-is-SSOT rule in the same prompt"* — and ruled that **formal gate
adjudication happens separately, after this run lands.** So what this run reports is
what the surfaces it may read can say: `build`'s report, `check`'s tables (including
the sheet line, which is where G7's clause is measurable), and `bench`'s own
measures. It does not claim a clause-by-clause verdict it has no text for.

⚠️ **This is the second recorded instance of the pattern rung 1's run named**: a leak
arriving through a document the run was *told* to read. It cost nothing this time
because the prompt quoted the allowed and forbidden lists as the protocol requires
(*What a run may read*'s ⭐), so the conflict was visible before either surface was
opened. That is the lists being load-bearing rather than decorative.

## 2 — what the frames were measured with

No off-the-shelf estimator survives this shot on its own, so the loop used three
tools, all of them reading only frames and art.

### 2.1 `tools/seed.ts` — partial observations, and the right to say nothing

Three estimators, each on pixels that can only be its own part (§8's first rule):

| Part | Pixels that can only be it | What it yields |
| --- | --- | --- |
| the saucer | its orange **under-band**, one long thin blob | centroid + principal axis |
| a chain joint | that link's **bead**, a compact saturated-orange blob | a joint position |
| the ball | **warm brown**, which nothing else in this shot is | a centre |

Two things this cost, and both are §8 patterns rather than wrong digits:

- 🩹 **The first `orange` predicate (`r>130, r−b>55, r−g>25`) matched the ball.**
  The ball's own art is a strong orange (207, 77, 36); under the lambertian overlay
  it reads (114, 73, 61) to (165, 136, 131), which still clears that bar. So on
  every frame where the ball touches the saucer, the merged blob became the
  *longest* blob and the band estimator returned the **ball's** position as the
  saucer's. `ball-catch` frame 6 seeded the platform at the ball's centre and the
  fit ratio at frame 3 came out at **1.19** — worse than drawing nothing at all,
  which is what said the estimator and not the search was wrong. Predicting what
  each part *should* read (`bench/runs/README.md`'s ⚠️ about a colour predicate two
  parts satisfy) fixed it: beads and band read r−b ≈ 110–147 and r−g ≈ 78–84, the
  ball reads r−b ≈ 34–53. The predicate is now `r>150, r−b>95, r−g>55`, plus an
  **elongation** test (λ₁/λ₂ ≥ 2.6²) so a round blob cannot be a band.
- 🩹 **An estimator that fails must not veto the frame.** The first version
  returned *nothing* when the band was missing, which took the ball's own
  observation down with it — and the ball moves 80 px between two frames there, so
  tracking could not recover it. The estimator now returns **partial**
  observations and the fitter merges whichever ones arrived into its tracked pose.

The band's axis is an axis, so it is **mod 180**, and the sign of the saucer's
rotation is not in it. The estimator does not guess: it returns *both* readings and
the render decides. That is §8's symmetric-shape trap kept out of the estimator.

### 2.2 `tools/fitrun.ts` — the pose search

Coarse-to-fine over three levels (¼, ½ and full frame scale), full-range scans
rather than line searches, multi-start from the observations, the neighbour and the
neighbour's extrapolation, and alternate forward/backward passes (§8.1).

- 🩹 **Level 0 cannot see the chain, and pretending otherwise cost the first fit.**
  At ¼ scale the whole subject is ~15×23 px and a chain bar is under a pixel wide.
  The first schedule scanned the chain there and then only refined ±14° below, so
  `wave-by-hand` frame 0 came back with the chain hanging straight (c1 = −89.2°)
  where the frames put it 10.8° to the left, and scored **0.42** against a hand
  seed's **0.166**. §8.1 states this outright — *a block big enough to give the
  whole figure a gradient is a block a shin is one cell of* — and the fix is the
  same sentence: level 0 places the platform and the ball and nothing else.
- 🩹 **Identical frames scoring differently is the search reporting on its start,
  not on the shot.** `wave-by-hand`'s frames 0 and 16 are bit-identical and the
  first fit gave them px −564.2 and −524.0. That spread is the measure of how far
  from converged a single-start fit was, exactly as §8.1's multi-start note says.
  After the fix the same set reads a mean ratio of 0.156 with a worst of 0.172.

### 2.3 `tools/globals.ts` — the setup geometry, and where most of the error was

Eleven numbers are the same in every frame of every shot — the four link lengths,
the four chain attachment offsets along their own bones, the ring's offset, the
chain's attachment point on the saucer, and the saucer's own attachment offset —
and **no single frame can see an error in any of them**, because that frame's own
rotations absorb it. §8.1's last rule is the whole of the method here: fit them
against a spread drawn from every shot, because a wrong link length would have to
be absorbed by a *different* rotation in each frame and no one value of it does
that.

⭐ **This is where most of the residual was, and it is worth stating as a figure.**
With the pose fit already converged on both short shots and the geometry left at
its first estimate, the residual sat at **0.156** of the reference's own ink cost.
Alternating the two — sweep the eleven, re-polish the poses, sweep again — took it
to **0.097** in three rounds, with not one pose knob newly free. The corrections
were small and systematic: the chain's attachment point on the saucer moved from
−71 to −62 units (the value the beads had implied all along), and `chain-1`'s
attachment offset along its own bone from 98.5 to 87.7.

⚠️ **And the reason it was worth chasing rather than accepting: the residual is
not a resolution floor, and that had to be measured rather than assumed.** The
supplied atlas packs at `scale: 0.5`, and rung 3's protocol row now warns that this
example family does exactly that and that it puts a floor under the MAE. Two
controls say it does not put one here. Re-rendering this candidate from 2×2-averaged
pages — same atlas, same UVs, same geometry, only the texel detail halved and
restored — makes every frame *worse* by about 0.005. Re-rendering it from genuinely
**half-size pages** with the world geometry held (the reference's own situation:
page 54×152 where the attachment still says 108×303) lands within ±0.005 either
way, frame by frame. So there was nothing hiding under the residual, and the
geometry sweep was the lever.

### 2.4 `tools/half.ts` — the half-frames

`check` compares a stills-plus-sheet set tile by tile, so the `@24fps` sheets are
the only place a candidate's curves are measured *between* two 12 fps frames — and
the brief says outright that the saucer's two turns live in there. Each odd 24 fps
sample starts from a **Catmull-Rom** prior through its 12 fps neighbours (the value
a curve would give it, not a linear filler, which would have taught the key planner
to author linear spans) and is then fitted against its own tile. A tile is a third
of a frame's scale, so a fit is accepted only when it beats the prior by more than
3 % of that tile's ink — otherwise the smooth prior stands and no zigzag is
invented.

## 2.5 — the one defect `check` found, and it was the loop's own

🩹 **The first `check` over the finished candidate reported exactly one
frame-change disagreement, and the loop had authored it.** `ball-catch`'s
per-frame column read *"f0120, yours moved 0 px where the reference moved 28"* —
§9.2's held-pose defect arriving from the opposite direction: a hold authored where
the shot has none.

The cause was a step taken on §10.3's instruction without checking whether this
shot has the thing the instruction is about. §10.3 asks for both ends of every run
of *exactly* equal values to be forced as keys, and for a near-still span to be
snapped to exactly still so that test can see it. So the planner snapped runs
inside the fit's own resolution — and the tail of `ball-catch`, where the ball has
been parked for twenty frames and only the chain is still moving, snapped flat.

**The measurement that settles it: not one adjacent pair of reference frames in
this rung is pixel-identical.** 121 + 17 + 17 frames, every consecutive pair
differenced: zero holds. Even the last two frames of `ball-catch` differ, which is
the brief's ✅ *"they are still settling at the final frame"* holding to the pixel.
⇒ The rule stays, the step goes: **snap a hold only where the frames show one.**
With it switched off, all 120 pairs of `ball-catch` and all 16 of each short shot
change by as much as the reference's own frames do.

⭐ The general form is worth carrying: §10.3's hold rule is a rule about a *shot*,
and applying it to a shot that never holds still does not cost nothing — it
manufactures the very defect the rule exists to prevent. The cheap test is the one
above, and it takes one pass over the frames.

## 3 — what the frames decided, and what they could not

### 3.1 The handle X positions are 1/3 and 2/3, and that is a measurement

`wave-by-hand`'s saucer slides 87.5 px out and back, and its x reads
584.0, 588.0, 598.0, 611.5, 627.5, 643.5, 657.5, 667.5, 671.5 over frames 0–8 and
mirrors exactly on the way back. Normalised, that is
0, 0.0457, 0.160, 0.3143, 0.4971, 0.680, 0.840, 0.9543, 1 — and
`3s² − 2s³` at s = i/8 is 0, 0.0430, 0.1563, 0.3164, 0.5, 0.6836, 0.8438, 0.9570, 1.
Every sample within 0.003 of normalised progress (≈ 0.26 px).

`3s² − 2s³` is exactly what Spine's cubic gives for normalised handles
**[1/3, 0, 2/3, 1]**: with the handle x at 1/3 and 2/3 the time cubic reduces to
`t(s) = s` identically, and the value cubic to smoothstep. So the whole shot is
readable as **two spans and one easing**, not seventeen keys.

Two things follow, and the second is why this is in the log rather than in a comment:

1. the handle **x** positions are taken as 1/3 and 2/3 throughout — the editor's
   own default handle length, and what these frames measure;
2. with those fixed, a span's two handle **y** values are a *linear* least-squares
   fit against its interior samples, which is what makes §10.4's pass A affordable
   on a 241-sample series instead of a grid search per span.

### 3.2 The saucer turns right over, and the sign comes from the band

The brief's frames 77–85 passage reproduces: at frame 82 the saucer's long axis
measures 58.2 px against the art's own 59.7, so it is within 4° of vertical, and
chain-1's joint sits 71 units along the saucer's own **perpendicular** from its
centre — 4.95 units along the axis, i.e. nothing. That is what fixes the chain's
attachment point on the saucer as a purely perpendicular offset, and it is what the
orange band's *side* then resolves the sign of.

### 3.3 The ball spins, the shading does not, and the ball loses its colour

- **The ball spins.** Its 18×18 patch, centred on its own centroid, changes by
  MAE 5–25 between adjacent frames while it travels and is **bit-identical**
  across frames 98–120 once it is parked. Its seams move; the light and shade do
  not (the highlight is upper-left at frame 0 and upper-left at frame 90). So the
  spin and the shading are on different bones.
- **It squashes, and the squash is tilted.** The silhouette is 18×18 (n ≈ 255) in
  almost every frame and 14×22 at frame 84, 24×19 at frame 85 — and frame 85's is
  one clean ellipse at roughly −25°, not two circles. So the squash rides on a
  rotation of its own, which is what `basket-lambertian`'s `rotate` track is.
- ⚠️ **The ball goes grey at frame 91.** Mean colour over its own pixels reads
  (148, 107, 95) at frames 88–90 and (152, 141, 141) from frame 92 on, and stays
  there. Compositing the two art files at the background and solving for the two
  slot alphas puts the lambertian at a constant **0.69** and the ball's own alpha
  at **1.00 → 0.24** across frame 91 (residual 3.4 and 10.5 of 765 total). So
  `basket-lambertian` carries a setup slot colour and `basket-ball` carries an
  `rgba` track. This is the one place §10.2's *hide with an attachment key, not
  with alpha* does **not** apply: 0.24 is not hidden.
- 🩹 Before that was measured, the candidate drew the lambertian at its own art
  alpha (~0.96) over the ball, so **the ball was grey in every frame** and the
  `ball-catch` fit was reading a colour error as a pose error.

### 3.4 What the frames do not decide, and what was shipped on reasoning

- **`chain-end`'s rotation is unobservable, so it is not keyed.** Its art is a
  rotationally near-symmetric annulus centred on its own joint: |ring − bead4|
  measures 18.1–18.6 px (σ 0.15) across every frame of both short shots, so the
  ring is rigid to chain-4, and turning the bone changes almost no pixel. The
  first fit made the case for itself — with the rotation free, it wandered to 140°,
  173°, −14°, −62° and 85° on consecutive frames while the score barely moved.
  §10.3's gauge rule says fold an unobservable direction out rather than key it, so
  `ce` is pinned at 0. **If the reference keys it, this run is short one timeline,**
  and that is the honest trade rather than authoring noise.
- **Regions, not meshes.** Every part is rigid within itself in every frame, and
  §9.3 says the frames cannot tell a posed hull from a deformed one — so the
  decision is written down here at the moment it was made rather than met again in
  the measures: eight region attachments, no mesh, no deform timeline.
- **The setup pose shows the ball.** The two short shots hide it with an
  attachment key. An animator rigs with every part visible and hides in the
  animation, so that direction was chosen; the frames cannot say.
- **The art does not carry the names of two of the nine bones.** `platform`,
  `chain-1`…`chain-4`, `chain-end`, `basket-ball` and `basket-lambertian` are all
  PNG basenames carried straight through to slot, attachment and bone (§10.1's
  largest lever). `root` is Spine's own name.

## 4 — the turns

Every build is numbered; `check` and the fit tools ran between them and are listed
where they changed a decision. The fit tools are in [`tools/`](tools/) beside this
log and read only frames and art.

### 1 — build (structure only, `"animations": {}`)
`bun cli.ts build --rig … --motion … --images examples/4-wave-principle/images --out … --profile spine`
Green. 15 PASS, 0 FAIL. Confirms the coordinate mapping: posed at the position the
frames imply, the candidate's content box came out `x[554..613] y[506..600]`
against the reference's `x[555..613] y[506..597]` on `wave-by-hand` f0000.

### 2 — the first pose fit, and two schedule defects
`fitrun.ts wave-by-hand` → mean 0.419 of the reference's ink cost at f0, against
**0.166** for a hand-computed seed polished locally. Both defects are in §2.2
above: the chain was being scanned at a level where it is invisible, and two
bit-identical frames were coming back with poses 4 px apart. Fixed → mean 0.156.

### 3 — the geometry sweep (`globals.ts`), alternated with the pose fit
0.156 → 0.097 → 0.089 → 0.086 over three alternations, then builds **2, 3** baked
the winners into the rig spec. §2.3 has the figures and the two controls that said
the residual was not a resolution floor.

### 4 — `ball-catch`, three attempts at the same passage
- unbounded: mean 0.318, and frames 3–24 at ratios **around 1.0** with rotations of
  −740°, −833°, +879°. §2.1's second finding.
- bounded (a chain does not fold back on itself): mean 0.194 fresh, 0.137 after a
  pass against the corrected geometry.
- with the band-free `rig` centroid start and a level-0 reach that covers 29 px of
  travel per frame: the fast passage came in. Mean 0.114.

### 5 — the half-frames
`half.ts` on all three sets. 58 of 120 of `ball-catch`'s half-frames moved off the
smooth prior; the biggest gains (75–87 % of a tile's ink) are in the throw.

### 6 — builds **4, 5**: the first finished candidate, and the first `check`
`check` reported all six sets measured in `frames.json`'s own box, `ball-catch` MAE
mean 18.25 — and **one** frame-change disagreement, which the loop had authored
(§2.5). Fixed; `per-frame` clean on all three shots from build 5 onward.

### 7 — build **6**: the half-frame reach
`check`'s worst tile was f0169 at 3.55× the sheet mean. The probe in §3.5 found the
ball's contact 40 px below both bracketing frames and the search reaching ±9 px.
Reach made generous → tile 169's ball landed within 5 px of the sheet's reading.

### 8 — build **7**: one value, two owners
`basket-lambertian`'s slot alpha was being fitted per frame and shipped as a single
setup number, so the fit and the emitted animation disagreed about the ball's own
colour on every frame of `ball-catch`. Pinned to the swept value (0.73) in both.
Worst sheet tile 3.55× → **3.08×**.

### 9 — builds **8, 9, 10**: four rescue passes
`rescue.ts` (12 fps frames) and `rescue-half.ts` (sheet tiles) walk the product of
the saucer's rotation and the chain's first joint from every start and keep only
what beats the incumbent. §8.1's rule, and the largest single lever in this run:

| | before | after |
| --- | --- | --- |
| `ball-catch` worst frame | 0.440 | 0.178 |
| `ball-catch` mean | 0.114 | 0.099 |
| `ball-catch` sheet worst ÷ mean | 3.55× | **1.91×** |
| `ball-catch` 12 fps MAE mean | 18.25 | **16.61** |
| `ball-catch` 12 fps MAE worst | 53.86 | **28.97** |

### 10 — one structural hypothesis, refuted
Before accepting `ball-catch` frame 5's residual, the saucer was swept over
scaleX × scaleY from 0.75 to 1.30 on frames 3, 5 and 11. **1.00 × 1.00 is optimal
on all three, exactly.** The saucer does not squash, so no `scale` timeline for it
— a negative result, recorded because the next attempt should not spend a pass
re-asking.

### 11 — `bench`, once
`bun cli.ts bench 4 --candidate … --frames … --json bench.json`. The candidate was
frozen at this call. The measures are in [`README.md`](README.md); the one thing
they invite — a looser key tolerance — is **not** applied here, because that would
be tuning against the answer, and the reasoning that should have chosen the
tolerance before `bench` is written up under *What the guide should have said*.

## Notes — what could not be told without compiling

- **Nothing about the setup geometry.** Every one of the eleven numbers that are
  constant across the shot was wrong at first estimate by 2–26 units, and no single
  frame could have said so; it took a render fit over a spread from every shot
  (§2.3). The art measures the beads to the pixel and *still* does not give the
  joint: `chain-1`'s attachment offset along its own bone reads 98.5 units off the
  art's own bead centre and fits at 72.6.
- **Which of two rotations the saucer is in.** The frames show an ellipse with a
  3 px orange band on one edge, and at frame scale that band is the entire
  difference between `prot` and `prot + 180`. Only rendering both and comparing
  settles it — and only once the chain is forbidden from folding 180° to absorb the
  swap.
- **That the ball loses its colour.** Visible in the frames as a change of hue, but
  *which* slot changed and by how much needed the two art files composited at the
  background and solved: lambertian 0.69–0.73 constant, ball 1.00 → 0.24.
- **Whether the residual was a texture floor.** Three renders of the same poses
  from three page resolutions, and the answer was no (§2.3).
