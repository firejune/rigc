# spineboy — 2026-09-03 attempt 1 (`ess`), the loop

- date:      2026-09-03
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK, fresh session
- rung:      spineboy, `ess` only — the rung clears on `ess`; `pro` was not built
- brief:     `bench/briefs/spineboy.md`, **revision 4** (2026-08-27)
- inputs:    the brief; `bench/reference/spineboy/ess/` (147 committed frames, 12 fps
             in full + the 30 fps stills, and the contact sheets) and its
             `frames.json`; `examples/spineboy/images/` (40 PNGs);
             `docs/AUTHORING.md` in full; `docs/MOTION.md`; `docs/GATE.md`;
             this repository's own source (`src/rig.ts`, `src/types.ts`,
             `src/render.ts`, `src/check.ts`, `src/pose.ts`, `src/framing.ts`,
             `tools/plate.ts`); the CLI — `build`, `explain`, `validate`, `check`,
             `pose`, `render`, and `bench` once at the end
- reference: **not read.** `examples/spineboy/export/` was never opened — not its
             skeleton JSON and not its `.atlas` (this rig needs no atlas: rigc emits
             its own one-part-per-page atlas from the loose PNGs, so the one
             permitted file under `export/` was skipped and is recorded as skipped).
             `bench/transcriptions/`, `docs/LADDER.md`, `docs/SPEC_COVERAGE.md`,
             `src/ladder.ts`, `bench/render_reference.ts` and git history were not
             opened either.
- inheritance: **none — this is a from-zero attempt.** No prior attempt's rig spec,
             motion spec, harness or intermediate store was read or copied, and no
             other attempt at this rung was opened for any purpose, process included.
- guide:     AUTHORING.md §10 in hand; MOTION.md in hand; GATE.md in hand
- profile:   spine

## 1 — the honesty line, and what this run was asked to measure

No honesty-rule incident. The forbidden surfaces above were not opened at any
point; where a decision needed a number the frames do not carry, the number is
recorded as a decision in this log rather than presented as a measurement.

This attempt exists to measure the **tool**, not a spec lineage: the same brief and
the same frames as the graduation series, from zero, on rigc as it stands after
`rigc pose`, `--texture-from` attribution, `docs/MOTION.md` and the extent-spread
framing landed. Where an instrument decided something this log says which
instrument and what it printed.

## 2 — what the frames' own sidecar decided before any fitting

`bench/reference/spineboy/ess/frames.json` is an allowed input (item 2 of the
reading list) and it records the world box the frames were drawn in:
`x[-795.445 .. 926.733] y[-138.025 .. 1506.735]`, `0.222973 px/unit`, 384 × 367.
That fixes two things a run would otherwise have to fit:

- **world y = 0 lands on image row 335.96** — `(1506.735 − 0) × 0.222973` — which
  is the floor the brief's header states, reproduced from the sidecar rather than
  taken on trust;
- **the rig is authored in those units and that origin**, so `check` measures the
  candidate into the frames' own declared box instead of a fit. AUTHORING §9.2 puts
  that at 15–25 MAE on an 8-shot character, and it is free here.

**One art pixel is one world unit.** `rigc pose` was run with its scale window
pinned to `0.222973,0.222973` and every part came back explaining the frame at that
scale; the alternative — a rig at some other unit — is invisible to `check`'s
framing by design, so the *choice* is free, and taking the art's own resolution is
what makes every joint reading below a number in world units.

## 3 — reading the frames with `rigc pose`

`bun cli.ts pose --images <17 ess body parts> --frame <each frame> --scale
0.222973,0.222973` over **all 147 committed `ess` frames** (2.0 s each with the
scale pinned; 4.4 s on the default `0.5,2` window). `tools/parts-ess.sh` builds the
parts directory — the twelve files `ess` never draws are left out, because a part
that is not in the picture spends the search and adds a refusal to read past. The
table is **`fit/placements.json`**, folded out of the 147 reports by
`tools/collect.ts`; the raw reports are 4.8 MB and are not committed, since
re-running the command above rebuilds them.

### 3.1 the control it passes, unprompted

On `ess/idle/f0000` `pose` reports `torso` at (173.1, 270.6), `head` at
(187.7, 224.2) and `gun` at (211.7, 283.1). The brief's own third-party pass
(*Verification notes — revision 2 → 3*) reports its independent template estimator
finding those three at **(173, 271)**, **(188, 224)** and **(211, 283)**. Three
parts, to the pixel, from an estimator written by somebody else for another
purpose. It also splits the two shins the way that pass's `front`-vs-`rear`
control does — `front-shin` on the screen-left leg, `rear-shin` on the
screen-right — which is the discrimination that pass built its whole draw-order
argument on.

### 3.2 and the half of the figure it cannot answer

Per-part, over 147 frames, counting frames where the placement is inside
`residual ≤ 0.16`, `unexplained ≤ 0.45` **and** not flagged `ambiguous`:

| part | clean frames | median residual | median `unexplained` |
| --- | ---: | ---: | ---: |
| `head` | 146 / 147 | 0.130 | 0.25 |
| `goggles` | 136 | 0.150 | 0.27 |
| `rear-shin` | 118 | 0.119 | 0.24 |
| `torso` | 117 | 0.131 | 0.33 |
| `front-shin` | 107 | 0.090 | 0.19 |
| `front-bracer` | 83 | 0.156 | 0.44 |
| `front-thigh` | 82 | 0.086 | 0.15 |
| `rear-bracer` | 81 | 0.155 | 0.42 |
| `rear-thigh` | 55 | 0.083 | 0.15 |
| `front-foot` | 40 | 0.139 | 0.30 |
| `rear-foot` | 31 | 0.148 | 0.39 |
| `front-fist-closed` | 22 | 0.188 | 0.52 |
| `gun` | 19 | 0.210 | 0.50 |
| `front-upper-arm` | 10 | 0.139 | 0.34 |
| `front-fist-open` | 0 | 0.238 | 0.63 |
| `neck` | 0 | 0.107 | 0.20 |
| `rear-upper-arm` | 0 | 0.134 | 0.34 |

⭐ **The split is not about part size, it is about occlusion and duplication**, and
§11.4 predicts both: *"a part drawn behind another has the occluder's pixels where
its own should be, so its residual rises AT THE CORRECT PLACEMENT"*, and *"two
identical limbs … look exactly like this"* on `ambiguous`. The rows that fail are
the far arm (behind the torso on a stance), the thighs (behind the torso and each
other), the feet and fists (small, and one of a near/far pair), and the neck —
which reads a *good* residual, 0.107, and is ambiguous on **every one of the 147
frames** because its art is a rounded blob that fits itself at any angle. That is
`rotationFree`-adjacent behaviour reported honestly rather than a wrong answer.

The same conclusions were reached independently by the brief's revision-3 pass,
which **rejected** the bracers, upper arms, thighs and feet as estimators for
exactly this reason and quoted them as its error bar. Two estimators, one written
for a brief and one shipped in the CLI, agree on which half of this figure a
single-frame template match can read.

### 3.3 the joint triangulation, and where it holds

`tools/joints.ts` solves each joint from `pose`'s placements — the 2×2 that
MOTION.md §3.9 states, stacked over frames, with the conditioning read off the
spread of **relative** angle across the joint (§8.1: *pivots need differing
relative rotation*). `death` and `hit` supply the lying and inverted
configurations §8.1 asks for, and they are what makes any of it conditioned.

| joint | frames | relative-angle spread | closure rms | 1 px jitter | verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| `neck` → `head` | 64 | **228°** | **0.33 px** | 5.4 px | **used** |
| `torso` → `neck` | 52 | 229° | 1.55 px | 4.8 px | used as a seed |
| `torso` → `rear-thigh` | 52 | 93° | 4.04 px | 4.0 px | rejected |
| `front-thigh` → `front-shin` | 47 | 123° | 6.21 px | 5.5 px | rejected |
| `torso` → `front-thigh` | 52 | 99° | 7.73 px | 6.1 px | rejected |
| `torso` → `front-upper-arm` | 51 | 150° | 8.86 px | 7.7 px | rejected |
| `torso` → `rear-upper-arm` | 52 | 198° | 9.38 px | 5.8 px | rejected |
| `rear-thigh` → `rear-shin` | 62 | **23°** | 0.91 px | **29.0 px** | rejected — ill-conditioned |
| `rear-shin` → `rear-foot` | 29 | **2°** | 0.00 px | 6.3 px | rejected — rank-deficient |
| `front-shin` → `front-foot` | 30 | **0°** | 0.00 px | 3.2 px | rejected — rank-deficient |
| `*-upper-arm` → `*-bracer`, `*-bracer` → `gun`, `*-bracer` → `fist` | 0–3 | — | — | — | too few reliable frames |

The table is `evidence/joints.txt`.

⭐ **Two of those rows are §3.9's own warning arriving as data.** The ankles read
an rms of **exactly 0.00 px** with a relative-angle spread of 0° and 2° — a perfect
fit to a system that has no unique answer, which is precisely what MOTION.md says
happens: *"both solves return an exact answer … the ill-conditioned one is simply
wrong, quietly"*. The jitter column is the check §3.9 prescribes (re-solve from
placements pushed a pixel) and it is the only thing separating the knee's 0.88 px
rms from a usable answer: 29.0 px of pivot movement for 1 px of placement noise.
⇒ One joint was taken from the solve. The rest were read off the art
(`tools/art.ts` prints a part as a coordinate-ruled character map) and refined
against the frames.

## 4 — the loop, turn by turn

📌 **Scope note on every figure below.** A number attached to the **committed**
candidate reproduces from this directory: `check.txt` / `check.json`,
`check-all-frames.txt`, `check-texture-from.txt`, `bench.txt` / `bench.json`,
`validate.txt`, and the tools' own stored output under `evidence/`. A number
attached to a **withdrawn variant** — a build this run made, scored and did not keep
— was measured the same way on a build that is not committed, so it does not
reproduce from here; every one of those is marked at the point it is quoted.

**24 compiles.** Every one is below, including the ones that failed for a silly
reason, because a guide that leaves an agent to discover something by failing is a
defect in the guide and this log is the only place that shows up.

The pipeline the turns run through, so the numbers below have a shape to sit in:

```
rigc pose (147 frames)  ->  tools/collect  ->  tools/joints        (§3)
                            tools/solve    ->  the trunk, from placements
tools/art (character maps) ->  tools/setup ->  the seed geometry
tools/fit / tools/limbs / tools/passages   ->  poses, frame by frame
tools/refchange -> tools/plan -> rigc build -> rigc check -> tools/close   (loop)
```

### 4.1 — build 1, the static rig

`bun cli.ts build --rig … --motion <animations: {}> --images examples/spineboy/images
--out … --profile spine` → green. `pages=29 regions=29 bones=17 slots=21
animations=0`.

A static rig first, on purpose: it is a real deliverable (§1.2) and it is the only
way to look at a setup pose before any animation exists. `rigc render --candidate`
on it drew a standing figure with the gun in the far hand at the first attempt,
which is what said the art-read joints were in the right neighbourhood.

⚠️ `A09_ANIMATION_DURATION_MATCHES_SPEC` reads **SKIP** here, and §1.2 says that is
not a pass. Noted rather than mistaken for one.

### 4.2 — the structure, and the one choice that removes a whole degree of freedom

17 bones, 21 slots, 29 attachments; `root → torso → {neck → head, both arms, both
thighs}`.

🚫 **No `hip` bone, and the reason is §10.3's gauge.** *"A bone that carries no
attachment is an exact gauge: turn it by δ, turn its children back by δ, and not one
pixel changes"*, and the same section records what that cost a previous run on this
very figure — a coordinate descent walking a body bone to +181° against its child's
−184°, and a fold that cost 3 MAE on every `idle` frame because the children sit
9–13 units off the origin. This run declines the direction instead of managing it:
the torso is the body root, so **every bone that is keyed carries art**, and the one
remaining gauge (the torso's own pivot, which its translate absorbs exactly) is
pinned at the art-read pelvis rather than left to a solver. ⚖️ The trade is real and
recorded: a biped rig conventionally has a pelvis bone, and `bones.count` and
`parent_by_name` are measured.

Two slot decisions worth naming, both §10.1's:

- **one image, one slot**, except where two images can never be on screen together —
  the fist (closed/open), the five numbered flares, the two eyes, the three mouths.
  §10.1: *"a shared slot is for alternatives, not for economy"*, and *"two parts that
  are ever on screen together cannot share a slot; two that never coexist may"*.
- **the names are the art's names**, straight through: PNG basename → placeholder →
  slot → the bone that moves it. §10.1 calls that the largest lever it has, and it is
  the one place this run can point at a number for it (§6).

🚫 **No bounding box, and that is a decision rather than an omission.** The rung asks
what answers *"was that a hit"*, and the brief is explicit that `src/render.ts` draws
neither a bounding box nor a point nor a clipping shape, so *"the frames neither
confirm nor deny that the reference has any"*. G5's own deduction clause exists for
exactly that: an element the frames cannot show comes off the **reference's** side of
the count. Adding one would put an unobservable on the candidate's side instead.

### 4.3 — the trunk, from the placements (build 2, and a self-inflicted one)

`tools/solve.ts` fits the linear system §3's model states over all 147 frames. With
only `torso`, `neck`, `head` and `goggles` in it — the four `pose` places cleanly —
it reads **rms 1.64 frame px over 551 observations** (`evidence/trunk-solve.txt`,
reproducible with `tools/solve.ts pose 42 --report-only`), per part:

| part | n | rms | worst |
| --- | ---: | ---: | ---: |
| `head` | 146 | **0.50 px** | 1.3 px |
| `goggles` | 137 | **0.50 px** | 1.4 px |
| `neck` | 147 | 1.38 px | 6.8 px |
| `torso` | 121 | 3.06 px | 9.4 px |

⭐ **And it cross-validates the one triangulated joint.** The solve puts the head
bone at head-image **(68.0, 240.2)** — the value the committed `fit/setup.json`
carries; §3.3's triangulation, an independent estimator over a different objective,
put it at **(66.8, 238.6)**. 2.0 units apart — **0.45 frame px** — from two readings
that share only the placements they were both built on. That agreement is the reason the head pivot is the one this run took from a solve
rather than from the art.

🚨 **Build 2 was scored against the seed, not the solve, and the ordering is the
trap.** `tools/setup.ts` writes **both** the parameter file and the rig spec, so
running it after a solve silently overwrites the solve; running the solve after it
leaves the spec at the seed. The first arrangement cost this run one build and an
ablation pass that read the goggles as *harmful* (−7.6 MAE on `aim` when hidden)
because the goggles being scored were the guessed ones. `tools/rebuild.sh` exists so
the ordering is a script rather than a habit.

### 4.4 — the reach check, which is what the first fits were really failing

Builds 3–5. The first composite fits produced a stance that **lunged** — one leg
splayed sideways under an upright torso — at an ordinary residual, on every stance
frame, on both legs. §8.1 names this exactly and says the check is arithmetic:

> *"If a chain's segment lengths are short … then every frame where the chain is
> folded fits beautifully, and the fitter silently absorbs the deficit on every other
> frame by rotating the parts it does have. Nothing reports a failure."*

Here it was the other way up — the chain was **too long**. Read off the art's own
ends, hip→knee→ankle measured **250 units**; the frames put the stance's pelvis
**215 units** above the floor and the boot's ankle-to-sole at **54**, so a straight
leg overshoots the floor by about 90 units and the fitter has to bend it sideways to
land. ⭐ **The frames-side reading beats the rig-side one**, which is §8.1's own
tie-break: the art's outer ends are not the joints, the joints are inset, and the
pelvis height is a measurement. Re-seeding the leg joints inset from the art's ends
— thigh 86 units, shin 94, sockets at torso v ≈ 150 — put the ankle at world y
**53.5** against the boot's own 54.

Build 4 was **refused by name** on the way through, and correctly:

```
animation "death" bone "torso" translate: key at 4.933333s is 0.000033s past the
declared duration 4.9333s
```

§4.5's own precedent, arriving from the other side: rung 6 rounded its key times to
4 dp and lost a one-frame reveal; this run rounded the *duration* to 4 dp against a
key at `148/30`. The durations are written as fractions now, and `A09` passes.

### 4.5 — freezing what is measured (builds 6–7, and two reversals)

⭐ **The composite must not be allowed to move the trunk.** With the limbs still
wrong, unfreezing `torso.x/y/rotate` and the head angles for one local polish moved
`idle/f0000` from **58.2 → 67.5** on the run's own objective (withdrawn builds): §9.1's *sacrificial
cover*, exactly — *"the cheapest available improvement is frequently to drag part B
off its own correct place to cover that ink"*, and here part B was the trunk the
placements had measured to 0.5–3 px. §9.1's own tie-break settles it: *"prefer the
frame-derived instruments when they disagree with the composite about a single part's
place"*. The trunk is frozen while the limbs are fitted, and polished locally after.

🚫 **Two instruments this run built and then withdrew, both on measurement.**

1. **`tools/place.ts` → `tools/solve.ts` over the whole figure.** The idea is sound
   and it is the one thing `pose` structurally cannot do (mask the occluders out and
   seed from the candidate's own limb). It never paid: with the legs in, the solve
   read **19.9 frame px rms on `rear-shin` and 20–26 px on the thighs, worst 78 px**,
   against 0.9–2.7 px on the trunk (a withdrawn configuration of `tools/solve.ts`;
   `FREE_V`'s own comment carries the figures). 78 px is not noise on a figure whose legs sit
   30 px apart — it is one leg's art on the other. Filtering the frames where a
   near/far pair sits within 22 px cost half the leg observations and moved the rms
   by 2 px. **The legs are not in the solve**, and the geometry comes from the
   composite, where the draw order decides which limb is which.
2. **`tools/trunkfit.ts`**, which sets the trunk from the torso's and head's own
   template matches rather than the composite — §9.1's tie-break taken literally.
   Tried twice, once with a 90°-wrong seed (below) and once corrected, and it made
   things **worse both times**: `aim` 27.0 → 38.4 MAE, `hit` 41.5 → 58.5, with
   `death`'s torso drift unchanged at 9.3 px. The per-part objective compares a mip
   of the art against the frame's own blend of that art over the backdrop, so its
   optimum sits a pixel or two off on every edge; that bias is invisible in a single
   part's residual and decisive in aggregate. **Withdrawn.** It is committed because
   the ceiling instrument (§4.9) is built on the same masks and because *"a control
   that returns an impossible number has told you something"* cuts both ways.

🚨 **A run-ending bug, and the only thing that caught it was a picture.** Both
`place.ts` and `trunkfit.ts` read a piece's screen angle off the emitted quad, and
they read the wrong edge. The corner order is **bl, ul, ur, br** — reconstructed by
posing a known frame and solving which local corner each world vertex is — and the
first version took the `bl → ul` edge, which is about **90° out**. A ±24° rotation
window around a seed that far off can never find the truth, so every per-part
placement was garbage that *looked* like data: `idle/f0000` reported every part at
100–140° on an upright stance with residuals of 11–20. ⇒ **The lesson is not the
bug.** It is that a comment naming a corner order was taken on trust while a
five-line reconstruction would have refuted it, and §8's own rule — *"look for a
second way to get the same number before you author it"* — applies to a convention
as much as to a measurement.

### 4.6 — a solve with nothing to solve writes zeros

Between builds, the withdrawn whole-figure solve left `torso.x/y` at exactly
`−TORSO_SETUP` on the two frames of `walk@30fps`, because those two frames had **no
usable observation** and the normal equations leave an unconstrained unknown at the
ridge's zero. Under a frozen trunk that is a figure 215 units below the floor and
nothing downstream can recover it — `walk@30fps` read **137 MAE** against 42 the pass
before. The guard is one `if` and it is in `solve.ts` now: **a frame with no
observation keeps its prior translate**, because zero there means *unmeasured*, not
*the origin*. ⚠️ It also cost a full pipeline re-run, because a corrupted
`fit/setup.json` is read back as the seed by the next solve — the reason
`/tmp/setup-*.json` snapshots exist between destructive stages.

### 4.7 — key planning, and the closing loop that verified it

`tools/refchange.ts` measures the reference's own adjacent-pair change at
`CHANGE_TOLERANCE` (8/255, whole frame) on all 147 committed frames, because the
brief counts at 2/255 and says so. It reproduces the brief's revision-4 correction
exactly: **`death` holds dead across 8 pairs** — f17→18, f18→19, f19→20, f20→21,
f21→22, f23→24, f24→25, f25→26 — with **f22→f23 the one pair that moves**, and
`shoot` f0→f1 dead at both rates. Nothing else in `ess` reads 0.

The plan (`tools/plan.ts`) implements §10.3 as stated: one tolerance of **0.35 frame
px at the end of what each bone swings**, converted per bone by its own lever arm;
forced indices at the series' ends, at every change of direction and at **both ends
of every run of exactly equal values**; each span's deviation capped at the smaller
of the tolerance and the smallest single-frame move inside it; and §10.4's two
passes — free handles first to *discover* the shapes, clustered into a table of
**8**, then every timeline re-planned under the table that will actually be written.
A span with no interior sample takes automatic handles snapped to the table rather
than `ease` omitted.

**Then the loop closed on the frames** (`tools/close.ts`), which is the part §10.3
calls the only verified half of key planning. It samples the **compiled** animation
through `sampleAnimation` — the same stepper the frames were made with — and compares
every adjacent pair against the reference's own. Its history, build by build:

| turn | `death` pairs out of band | what it said, and what was done |
| ---: | ---: | --- |
| first | **11 of 59** | 4,000–5,900 px against the reference's 830–1,270 across f37–f51. Contracting would have cost **300–930 degrees summed per pair** — declined |
| after `tools/passages.ts` | **5** | the quiet passages authored as passages: the body held, the arm free. Costs fell to 0.3–52 deg |
| + far arm freed | **4** | f37→f41 had been the *other* direction — reference 839–956 px against ours 166–188. §10.3's third case: under-change, which a contraction makes worse, so `close.ts` refuses to touch it and the fit was given the far arm instead |
| + hold re-assertion | **1** | f22→f23 read 253 px against 1. Cause: `close.ts` had contracted f16→f17 by a degree and f18..f22 were not re-derived from the new f17, so the hold's far end differed from f23 by exactly that contraction. A repair upstream of a hold breaks it silently |
| final | **0** | and 0 in every other set |

⭐ **`death`'s one moving pair is calibrated, not picked.** The reference moves across
f22→f23 by **one pixel**, and `check` reads stillness categorically in both
directions — so the candidate has to move there, and by little enough that
`mine ≤ 4·theirs + 24` survives against `theirs = 1`. 0.6° of head rotation measured
**806** changed pixels; a binary search against the render settled on **0.0187°**,
which measures **7**. The brief's *"a rig that does not move at all for nine frames,
and one pixel's worth of the head-and-chest end that does, once"*, as a number.

### 4.8 — the two switches, and one that was built and withdrawn

**The fist.** A composite sweep of `front-fist-closed` against `front-fist-open` over
all **132** committed 12 fps frames, per shot, prefers **closed** on the aggregate of
every one of the eight shots and on **131 of the 132** frames
(`evidence/switches.txt`). The brief states that
`death`'s raised hand is an open fist; keying that switch at f27 — as
`t: 27/12 − 1e-6`, §4.5's rule for a stepped key sitting on the 1e-6 grid — was built
and scored, and it cost the `front-fist` slot **12.2 px of drift at death/f0035**
against 9.3 px for the whole shot without it — measured by `check` on a build that is
not committed. ⚠️ **That is not a claim the brief is
wrong about the art.** `front-fist-open`'s own attachment offset was never fitted —
only the closed one's was — so what these two numbers separate is two *placements*,
not two drawings. Withdrawn, and recorded as known-wrong in the README.

**The flare.** `muzzle01..05`, `muzzle-glow` and `muzzle-ring` are **not keyed on**,
and the measurement is the reason. Sweeping the muzzle bone's angle over the full
turn at 5° and a uniform scale over 0.6–3.4, then refining, the best the flare can do
on `shoot` f2–f4 is **35.73 mean against 35.76 with nothing drawn** — no improvement,
at a converged scale of **0.33**, which is the search trying to make the part
invisible. That is §9.1's cliff being *found* by an honest objective rather than
walked off: absence wins, so the flare's geometry is not something this run measured,
and shipping a large mis-shaped flare on three frames to satisfy a convention would
be authoring a number as an argument. Known-wrong, in the README, with the number.

**The face.** `tools/face.ts` sweeps the three riders' offsets over the eight frames
that present the face best, against the alternates, and reports each pick's margin:

| slot | pick | offset | mean over 8 frames | with the slot hidden | margin over the runner-up |
| --- | --- | --- | ---: | ---: | ---: |
| `goggles` | `goggles` | 51, 64 | **35.57** | 42.95 | — (one attachment) |
| `eye` | `eye-indifferent` | 52, 87 | 42.963 | 42.953 | 0.028 |
| `mouth` | `mouth-smile` | 92, −23 | 43.13 | 42.95 | 0.309 |

⭐ **Two of those three rows are the frames declining to answer, and they decline
differently.** The goggles are worth **7.4 MAE** — a real measurement. The **eye**
costs 0.010 either way: placed behind the goggles it is invisible, which is what the
brief says the frames show (*"the goggles cover the eyes on every frame of both
skeletons"*), so its own offset is unobservable and it is recorded as a choice. The
**mouth** is fully visible — `tools/ceiling.ts` reads its visible ceiling at 100 % —
and drawing it at its best offset is still **0.18 worse** than not drawing it, which
says my placement of a 6–8 px feature is worse than absence. It is kept anyway:
omitting a part the frames show is what rung 7's third attempt was refused for, and a
0.18 MAE loss is not a reason to silence a limb about a part that is there.

🚫 **No `drawOrder` timeline.** The brief's silence list reports a search over both
skeletons that came up empty — *"no pair of parts was caught visibly on one side of
each other in one frame and the other side in another"* — so the frames show no
draw-order change and this candidate authors none. The two edges the frames **do**
decide are in the setup order (§5).

### 4.9 — the last measurement, for the clause it belongs to

`tools/ceiling.ts` measures, for every slot, the share of its own material that
nothing drawn after it covers, on **every frame of every set**, and reports the
maximum. It exists because G2's v2.2/v2.3 per-slot limb needs *"a measured ceiling on
its attributability"* calibrated against *"the slots of the same corpus that the
instrument does attribute"*, and this run has slots on both sides of that line:

| slot | visible ceiling | mean visible | `check` attributed |
| --- | ---: | ---: | ---: |
| `neck` | **1.8 %** | 0.4 % | 1 / 147 |
| `rear-upper-arm` | 42.8 % | 7.7 % | 0 / 147 |
| `front-thigh` | 48.0 % | 31.6 % | 1 / 147 |
| `head` | 53.0 % | 52.5 % | 129 / 147 |
| `rear-foot` | 68.7 % | 49.1 % | 44 / 147 |
| `front-shin` | 81.3 % | 67.4 % | 118 / 147 |
| `torso` | 89.7 % | 59.6 % | 129 / 147 |
| `goggles` | 100 % | 100 % | 142 / 147 |
| `mouth` | 100 % | 100 % | **1 / 147** |

The full table is `evidence/slot-ceilings.txt`. ⚠️ **It does not settle the clause and
this run does not adjudicate it** — but it separates two very different blanks that
`check` prints identically: `neck` is unattributable because 98 % of it is never on
screen, and `mouth` is unattributable at 100 % visibility because it is 21 × 13 px
inside the head's own connected component. Only the first is a geometric ceiling.

## 5 — what the frames decided, and what this run decided

**Decided by the frames, with the measurement:**

- the world box, the scale and the floor — `frames.json`, §2;
- the head's pivot — triangulated at 228° of relative angle, rms 0.34 px, and
  cross-validated to 1.1 frame px by an independent linear solve (§4.3);
- the trunk's placement on 147 frames — 0.49–2.95 px rms (§4.3);
- the leg chain's length — the pelvis at 215 units and the boot at 54 refute a
  250-unit art reading (§4.4);
- every animation's length, and the eight dead pairs of `death` plus `shoot`'s
  (§4.7);
- the goggles' offset, worth 7.4 MAE (§4.8);
- **the near leg is drawn in front of the gun and in front of the far leg** — both
  read out of the brief, which measured them; the setup order carries them.

**Decided by this run, and recorded as decisions:**

- no `hip` bone, and the torso's pivot pinned at the art-read pelvis (§4.2);
- region attachments throughout, no meshes — §9.3: the frames cannot separate a
  hull moved by bones from the same hull moved by deform keys, so *"write down which
  way you went and why at the moment you decide it"*;
- the draw order beyond the two edges the frames decide;
- which mouth (`mouth-smile`, margin 0.309 over the runner-up — inside the same
  objective's own scatter) and which eye (`eye-indifferent`, margin 0.028, and it is
  invisible either way);
- the event names `footstep`, `gunshot`, `land` — the brief says outright that how a
  moment is *spelled* is in the export and out of bounds, so only the **times** are
  measured;
- 0.35 frame px as the key tolerance, and 8 easings.

## 6 — Result

`bun cli.ts bench spineboy --candidate bench/runs/2026-09-03-spineboy-1/spine
--frames bench/reference/spineboy/ess --json bench.json` — run **once**, at the end,
after the candidate was final. Nothing was edited afterwards. The whole console
output is `bench.txt`; the summary block, verbatim:

```
  ess        bones=0.702  slots=0.817  attachments=0.955  constraints=1.000  animations=0.812  events=0.333
             bones 0.702 (name-matched) · 0.800 (name-agnostic)   slots 0.817 (name-matched) · 0.643 (name-agnostic)
             reported: mesh_edges 1.000 · key_density 0.511 · keys_per_timeline 0.441
  pro        bones=0.192  slots=0.352  attachments=0.262  constraints=0.000  animations=0.568  events=0.333   [stretch]
             bones 0.192 (name-matched) · 0.206 (name-agnostic)   slots 0.352 (name-matched) · 0.188 (name-agnostic)
             reported: mesh_edges 0.000 · key_density 0.851 · keys_per_timeline 0.386
  framing    one per set (16); one shared box leaves x1.012505, rms 9.05px — see the check table above for each set's own
  aim        MAE mean=24.35 worst=24.35 ref=25.07  over 1 frame(s)  worst slot drift 2.8px, attributed in 1, rear-upper-arm carries 23%
  aim@30fps  MAE mean=24.35 worst=24.35 ref=25.07  over 1 frame(s)  worst slot drift 2.8px, attributed in 1, rear-upper-arm carries 23%
  death      MAE mean=46.49 worst=80.44 ref=50.73  over 60 frame(s)  worst slot drift 9.3px, attributed in 58, neck carries 44%
  death@30fps MAE mean=28.32 worst=29.87 ref=29.35  over 2 frame(s)  worst slot drift 2.4px, attributed in 2, neck carries 25%, sheet 149 tile(s) mean=51.15 worst=113.73
  hit        MAE mean=41.90 worst=57.83 ref=43.98  over 5 frame(s)  worst slot drift 9.0px, attributed in 5, rear-upper-arm carries 35%
  hit@30fps  MAE mean=39.19 worst=42.02 ref=41.42  over 2 frame(s)  worst slot drift 9.0px, attributed in 2, rear-upper-arm carries 24%, sheet 11 tile(s) mean=66.85 worst=116.90
  idle       MAE mean=28.13 worst=33.41 ref=29.10  over 21 frame(s)  worst slot drift 2.5px, attributed in 21, neck carries 26%
  idle@30fps MAE mean=28.10 worst=32.54 ref=29.02  over 2 frame(s)  worst slot drift 1.4px, attributed in 2, rear-upper-arm carries 30%, sheet 51 tile(s) mean=27.24 worst=31.66
  jump       MAE mean=40.01 worst=66.56 ref=42.67  over 17 frame(s)  worst slot drift 6.4px, attributed in 17, neck carries 25%
  jump@30fps MAE mean=41.42 worst=41.48 ref=43.97  over 2 frame(s)  worst slot drift 6.4px, attributed in 2, neck carries 20%, sheet 41 tile(s) mean=56.59 worst=104.25
  run        MAE mean=55.75 worst=78.21 ref=59.12  over 9 frame(s)  worst slot drift 7.1px, attributed in 9, rear-upper-arm carries 48%
  run@30fps  MAE mean=66.79 worst=67.06 ref=70.40  over 2 frame(s)  worst slot drift 0.3px, attributed in 2, rear-upper-arm carries 60%, sheet 21 tile(s) mean=83.70 worst=113.79
  shoot      MAE mean=28.93 worst=36.94 ref=29.75  over 6 frame(s)  worst slot drift 4.7px, attributed in 6, rear-upper-arm carries 30%
  shoot@30fps MAE mean=24.39 worst=27.35 ref=25.16  over 2 frame(s)  worst slot drift 2.0px, attributed in 2, neck carries 21%, sheet 13 tile(s) mean=29.44 worst=38.22
  walk       MAE mean=39.29 worst=74.63 ref=41.09  over 13 frame(s)  worst slot drift 5.9px, attributed in 13, rear-upper-arm carries 36%
  walk@30fps MAE mean=28.11 worst=28.18 ref=29.03  over 2 frame(s)  worst slot drift 3.8px, attributed in 2, front-thigh carries 22%, sheet 31 tile(s) mean=63.76 worst=117.73
```

⚠️ **The `pro` line is noise and is quoted only because `bench` prints it.** This
run built `ess` and nothing else; `bench spineboy` diffs whichever candidate it is
given against **both** references, so that line is an `ess` rig measured against a
skeleton it was never built from. It is labelled *(stretch — reported, does not
count)* by the tool as well.

🚨 **One honesty note, and it belongs here because this is where it happened.**
`bench`'s own console banner prints `src/ladder.ts`'s gate string, which names
**per-skeleton bone, slot and animation counts for both skeletons** — facts
`bench/runs/README.md`'s forbidden table seals to an authoring run. It arrived at the
finish line, after the candidate was final, in the output of the one command the
protocol says to run last; `bench.json` does not carry it (issue #137) but the
console does, and this run read it. **No edit followed it** — the candidate,
`check.json` and every figure above predate it. The line is **redacted in the
committed `bench.txt`** so that a later run opening this directory for process notes
does not meet it, exactly as `2026-08-24-spineboy-3` redacted the same field.
📌 The disclosure is structural rather than this run's mistake: the protocol's own
instruction is *"run `bench` once, at the end"*, and doing that reads the banner.

## 7 — Notes: what the guide should have said, and what the tools cost

1. ⭐ **`rigc pose`'s answer on a dense figure is half the parts, and the half is
   predictable — §11.4 already says which half, but nothing says to expect it.** The
   split here is exactly occlusion and duplication: `head`, `goggles`, `torso` and
   the two shins on 107–146 of 147 frames; the far arm, the thighs, the feet, the
   fists and the gun on 0–55. §11 reads as an instrument that answers or refuses per
   part, and it does — but a *character* is a case where roughly half the parts
   refuse on every frame, and the practical consequence is that `pose` seeds a
   composite fit rather than replacing one. Worth one line in §11: *on a figure whose
   parts occlude each other, expect the unoccluded parts and plan a second instrument
   for the rest.*
2. ⭐ **A joint that `pose` can triangulate is worth more than the ones it cannot,
   and MOTION.md §3.9's own conditioning check is what separates them — but §3.9 is
   written for two poses and this was 147.** Stacking the 2×2 over every frame and
   reading the **spread of relative angle** across the joint is the natural
   generalisation, and the two ankles came back at an rms of **exactly 0.00 px** with
   spreads of 0° and 2° — a perfect fit to a system with no unique answer. §3.9
   predicts it in words (*"both solves return an exact answer"*); it would be worth
   saying that at N frames the tell is **rms 0 with no angular spread**, because a
   zero residual reads as success in every other context.
3. 🚨 **A quad's corner order is a convention, and this repository's own comment for
   it is wrong or at least ambiguous.** `src/render.ts`'s `Quad` says *"World-space
   corners, in spine-core's region order: br, bl, ul, ur"*. Reconstructing a known
   pose from the emitted vertices gives **bl, ul, ur, br**. Two of this run's
   instruments took the comment on trust and read every screen angle about 90° out,
   which produced confident, plausible, wholly wrong placements (§4.7). Either the
   comment should name the order the reconstruction finds, or it should say which
   index is which so a reader can check it in one line.
4. ⚠️ **§8.1's reach check needs its other direction spelled out.** It is written for
   a chain that is too **short** (*"a reach deficit is invisible to every per-frame
   fit"*). A chain that is too **long** fails the same way and looks different: the
   fits converge, every residual is ordinary, and the figure **splays** — a limb bent
   sideways to reach a floor a straight one overshoots. The arithmetic is the same one
   §8.1 gives, and this run would have saved four builds by doing it before the first
   fit rather than after the fifth.
5. 🚨 **`check`'s change measure is two-sided and §10.3's three directions have three
   different repairs — but one of them is not a repair at all.** Under-change (*the
   reference is busy and the candidate is not*) is the one a contraction makes worse,
   and it is easy to write a closing loop that contracts everything out of band. §10.3
   says it, and it would be worth saying it **in the same paragraph as the
   contraction** rather than three paragraphs later, because that is where the code
   gets written.
6. ⚠️ **A hold is a relation between poses, and a repair upstream of it breaks it
   silently.** Contracting one pair by a degree left the far end of `death`'s nine-frame
   hold differing from its neighbour by exactly that degree, which read as 253 changed
   pixels on the one pair allowed to move by one. §10.3's *force both ends* is
   necessary and not sufficient: the relations have to be **re-asserted after every
   repair**, which is why `tools/passages.ts` has a `--holds-only` mode.
7. ⭐ **`--texture-from` answered its question in one command, and the answer was the
   opposite of rung 3's.** The example's atlas is packed at `scale: 0.5`, which is the
   case §9.2 warns about — and the floor measures **5.16–7.94 MAE** on all 16 sets and
   explains only **2.7–15.9 %** of each figure. So the texture is not the story here
   and the rig is, which is a finding worth having before a day of key-hunting and
   which this run had for the cost of one flag.
8. 📌 **A tool that writes two files from one command is an ordering trap.**
   `tools/setup.ts` writing both the parameter file and the rig spec cost one build
   scored against a seed and one ablation pass with a wrong conclusion (§4.3). Nothing
   in the guide is at fault; it is a note for anyone building a harness of this shape.
9. ⚠️ **The key density is a fact about the subject here, not a choice — measured.**
   At 0.35 frame px of tolerance the plan carries 1,450 keys and `bench` reads
   `key_density` **1.96× over-keyed** against the reference. §10.3's own arithmetic
   says what to check before declaring a tolerance — half the series' second
   difference is what a skipped sample costs — and `tools/density.ts` runs it
   (`evidence/key-density.txt`): over every channel and every interior sample the
   median cost is **1.625 frame px, 4.6× the declared 0.35 px**, and per channel it
   runs from 0.11 px on `torso.x` to **10.5 px on `rear-upper-arm.rotate`**. So no
   tolerance under about 1.6 px lets a span skip anything at all, and the trade bought
   accuracy and never sparsity — §10.3's second situation, *"discovering the point the
   shot has already put you on"*. ⚠️ What this run did **not** do is the other half
   §10.3 asks for: measure each channel's own objective basin and floor the tolerance
   at it, capped. `rear-upper-arm.rotate` is the channel that most needs it — its
   ceiling of visibility is 42.8 % and its median skipped-sample cost the largest in
   the rig, which is the signature §10.3 describes of a channel that is *"partly a
   prior rather than a measurement"*. It is keyed as a measurement here, and that is
   the known gap in the key plan.
