# Rung 7 — attempt 2, the loop

- date:      2026-08-28
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- inputs:    `bench/briefs/7-anticipation.md` **revision 3**, `docs/AUTHORING.md` in full,
             `examples/7-anticipation/images/`, `bench/reference-local/7-anticipation/`
             (rendered locally at the brief's exact flags), `frames.json`,
             this repository's own source (`src/rig.ts`, `src/types.ts`, `src/render.ts`,
             `src/check.ts`, `src/slots.ts`, `src/framing.ts`, `tools/plate.ts`, README)
- atlas:     **not read.** rigc emits its own atlas from the loose PNGs, so the
             example's `.atlas` was not needed and was not opened
- reference: not read
- guide:     AUTHORING.md §10 in hand
- profile:   spine
- frames:    rendered by this session, never committed — `git ls-files bench/reference-local`
             reports 0, checked before every commit

## The frames

```bash
bun run fetch-examples
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256 --fps 24 --stride 999
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256 --fps 30 --stride 999
```

Flag for flag as the brief states. Frame counts came back 21 / 35 / 9 / 37 at 12 fps and
41 / 70 / 17 / 73 and 51 / 87 / 21 / 91 at 24 and 30 — the brief's table, digit for digit.
`frames.json`: viewport 1024 × 798 px, 0.189871 px per unit, skeleton `sack-pro`.

## Loop

### 0 — measuring the frames before writing anything

Own estimators, at the brief's own conventions (drawn ⇔ more than 8/255 from
(232,232,232) on some channel; cape ⇔ `g − b ≤ 8`; raw masks, no denoise). Reproduced,
to the digit, before anything was authored:

| claim | brief | measured here |
| --- | --- | --- |
| rest pose, whole subject | 99 × 153–154 px, 10,244–10,249 drawn, 1,843–1,846 crimson | 99 × 154, 10,241–10,249, 1,835–1,848 |
| the sack at rest | 87–88 × 153–154 | 87–88 × 153–154 |
| `cape-follow-example` f7 → f13 crimson | 1,551 1,414 1,183 1,007 920 876 782 | identical |
| f13 → f14 | 782 → 1,816 (+132 %) | identical |
| `walk`'s nine widths | 104 130 114 83 73 72 73 85 104 | identical |
| `hello` f19 → f20 crimson | 951 → 2,306 | identical |
| `sack.png` opaque | 460 × 809 box, 250,792 px, 9,041 px at frame scale | identical |
| `cape-back.png` / `cape-front.png` opaque | 514 × 515 / 395 × 203 | identical, 7,498 px and 805 px at frame scale |

⇒ the brief's method reproduces under its stated conventions, so its figures were taken
as given from here on and the loop spent its time on the two things it does not settle.

**What the masks showed that decided the structure.** At the rest pose the crimson is one
connected component, 1,798 px in a **99 × 100** box — which is `cape-back.png`'s own
97.6 × 97.8 at scale 1, in place behind the sack, showing as a fringe down both sides. The
band crossing the sack is `cape-front.png` read straight off the art: its alpha is a wide
**chevron** with a bow and two short loose ends, and that is exactly the shape the frames
draw across the sack at y 636–672. So the collar is identifiable in the frames after all —
not by colour, which the brief is right about, but by **outline**.

**Also measured, and it decided the key planner (§10.3's 🚨):** the reference's own
adjacent-pair change, at `check`'s own `CHANGE_TOLERANCE` of 8. **Not one of the 98
adjacent pairs in the four sets is exactly still.** The smallest is `fall-in` f19 → f20 at
**39 px**, then f18 → f19 at 75 and f17 → f18 at 105. So this is the shot §10.3's 🚨 warns
about: a snap-to-still step would manufacture the one defect the per-frame column treats
categorically. The plateau rule is therefore gated on measured reference stillness and is
**off** for every set here.

### 1 — build (scaffold A: the panel as a region)

`bun cli.ts build --rig A.rig.json --motion scaffold.motion.json --images examples/7-anticipation/images --out outA --profile spine`

Green. 8 bones, 3 slots, 2 region attachments, 1 mesh (45 verts / 64 tris, hull 24),
`animations: {}` so `A09` SKIPs. 14 PASS, 4 SKIP, 14 PROF.

### 2 — build (scaffold B: the panel as a weighted mesh)

Same, `B.rig.json`. Green. 10 bones, 3 slots, 1 region, 2 meshes.

Both scaffolds exist so the cape's mechanism can be decided by measurement rather than by
taste — the brief leaves it open on purpose, and §8's answer to an open structural choice
is to build both and compare like with like.

### 3 — the setup pose, unfitted, against `hello/f0000`

Placed from the masks alone: sack centre (145.5, 672.5), panel centre (147, 683.5), collar
centre (146, 654), all three at scale 1, converted into the frames' own world units.
Rendered through `src/render.ts` at the frames' own viewport, no fitting:

- candidate rest box **98 × 153 at (98, 596)** against the reference's **99 × 154 at (98, 596)**
- composite error **11.14** against a *"draw nothing"* floor of **90.95** (§9.1: the floor
  was evaluated deliberately, and it is the number every fitted frame is read against)

So the setup pose needed no search, and the art is drawn at its own size at rest, which is
what the brief's three art numbers already said.

### 4 — the fitter, and three defects it had to be caught in

The poses are fitted, not read: `src/render.ts` renders the candidate into the frames' own
viewport and a coordinate search over the bones' local transforms minimises the composite
difference, coarse to fine, multi-start, per §8.1. Three things went wrong and each looked
like a fact about the animation until it was measured.

**ⓐ An assertion that silently turned the coarse search off.** §9.1's second defence —
*count your own ink for that part and reject any candidate whose count is zero* — was
written at full-resolution counts and applied at every pyramid level. At k = 4 the counts
are a sixteenth of that, so **every** coarse pose was refused and the fit fell back to a
line search from a bad start. `walk` read mean 37.14; with the floors scaled by k² it read
**23.79** on the identical search. A refusal that fires on everything is indistinguishable
from an objective with no gradient.

**ⓑ A bound that could not reach.** `body.y` was bounded from the standing pose, and
`fall-in` enters **558 px above the standing line**. Every pose in that shot's first four
frames was outside the range, so the figure stayed low, most of its ink fell outside the
window, and the ink assertion refused it: `fall-in` reported **mean Infinity**. Bounded by
what the frames *show* — the subject's own centroid runs y 119 … 702 — it reads
**22.57**. §9.1 says to bound each parameter by what the frames can show; the other half
of that is that the bound has to actually reach what they show.

**ⓒ §9.1's cliff, arriving through the window's edge.** The objective is computed in a
window around the reference's drawn box, so ink that leaves the window costs *nothing* —
and the search found it. Measured on the built animation: the panel hung **164 px below
the frame** at `cape-follow-example` f26 and the collar sat **146 px past the right edge**
at `hello` f34, with the composite score reporting progress the whole way. `check` saw it
immediately and from the other end: the candidate's union world box came out **1.2054 ×**
the reference's, the fitted framing shrank the whole shot by that factor, and every set
read MAE 77–117 with `no slot could be attributed in any frame`.

⇒ two fixes, and the first is the one that generalises: ink further than 25 px outside the
reference's own drawn box is **counted and charged**, and past a twentieth of the
reference's own ink the pose is refused outright; and the cape's offsets are bounded at
±90 px rather than ±300, which is what the frames show (the crimson's centroid never sits
further than ~50 px from the sack's on any of the 102 frames).

### 5 — the emission, verified against the fitter rather than assumed

`build` was green on the first motion spec and the shot was wrong, which is the whole of
§0's warning. What found it was not `check` but a five-line diff: sample the **compiled**
animation with `sampleAnimation` and compare its world vertices against the fitter's own
pose, frame by frame.

**A translate key is an offset from the bone's setup position** (§4.4, and
`TranslateTimeline.apply`: `pose.x = setup.x + x`), while the fitter drives
`bone.pose.x` — the absolute local position. The two differ by exactly the bone's own
setup x/y, which is nonzero for `body`, `panel` and `collar` in this rig, so the first
spec moved the figure by the setup offset a second time. Rotation and scale needed no
correction: their setups are 0 and 1. After the fix the compiled animation reproduces the
fitted poses to **1.6 – 5.8 px at the worst vertex**, which is the key reduction's own cost
and not an emission error.

⇒ **worth keeping as a rule: a fitted run should diff its compiled animation against its
own pose series before it reads a single measure.** The gate cannot see it, `check` sees it
only as a framing catastrophe, and the diff names it in one line.

### 6 — the mechanism comparison, on a baseline that was not yet like-for-like

The mesh variant fitted far worse than the region variant, and it was not the mechanism.
Its panel mesh bound each vertex against a chain whose y values were written as if the
mesh's local frame were centred on the sheet, when the frame is `panel`'s own — one
segment out. It drew the **same ink in the wrong place**: rest pose **51.73** against the
region variant's **11.14** with identical ink counts (8,306 cape, 9,037 sack). Fixed, both
variants baseline at **11.14** on the same frame, which is the point at which a comparison
between them measures the mechanism and nothing else.

### 7 — what the drift measure actually is, read out of `src/slots.ts`

Worth stating because it decided where the loop spent itself. The brief says the subject is
**one connected component on every one of the 102 frames**, so `check`'s cheap matcher —
which asks whether a slot sits on a reference component its own size — cannot answer for
any slot on any frame here: the component is the whole figure. Every drift on this rung
therefore comes from the **template** matcher, which renders the slot **alone** and finds
the translation that best aligns its own pixels to the reference. So a slot's drift is a
**registration residual**, not a shape error — and it can be driven toward zero by moving
the bone that carries the slot by exactly the offset the matcher reports.

That is what `driftPass` does, using `matchSlots`/`componentField` imported from
`src/slots.ts` rather than a reimplementation, so the number the loop reads is the number
the report prints. It runs after every fit and after every contraction, three rounds, and
refuses any step that makes the composite worse.

It also predicts, before any build, which slots can be attributed at all: `cape-back` is
drawn **behind** the sack, so three quarters of its own template sits over reference pixels
that are beige, the best residual exceeds half the template's own contrast, and the matcher
returns **no match** — which it does, on every frame of every set. That is the honest answer
for a part the reference draws behind another, not a hole: the panel draws (15.7 % of the
final report's error share, 44.04 per pixel), and the report's own `(unattributed)` count
is what a missing part would show up in. **0 reference components go unreached in any set.**

### 8 — the key planner

§10.3 and §10.4 in the order they state, and three of their instruments changed the answer.

**Sensitivity, measured rather than derived.** Each knob is perturbed on five spread poses
and the largest displacement of any drawn vertex is read off, giving frame pixels per unit:
`body.x` 0.190, `sack1.rotation` 2.817, `sack4.rotation` 1.146, `panel.rotation` 1.300,
`collar.rotation` 0.749, `sack1.scaleY` 187.6. One tolerance in degrees would have keyed
`sack4` two and a half times more loosely than `sack1` for the same pixel error.

**The basin, measured before the tolerance was declared** (§10.3's 🚨), on five poses:
`body.x/y` **0.25 px**, `sack1.x` 0.50, `sack1.rotation` 1.00, `sack2.rotation` 2.25,
`sack3.scaleY` 3.75, `sack4.rotation` **6.00**, `panel.rotation` **4.50**,
`collar.scaleX/scaleY` **3.00**, `collar.x` 2.00.

⚠️ **Those two rules pull apart by more than an order of magnitude on this rig, and the
resolution is a finding.** §10.3 asks for **one** tolerance and, separately, for it to be
declared at or above the **widest** basin. Declaring 6.1 px keyed the body twenty-four times
more loosely than its own basin allows and cost **4–7 px of worst-vertex disagreement**
between the compiled animation and the pose series it was reduced from — the size of the
drift that failed attempt 1. ⇒ the tolerance is declared once (**0.40 px**) and floored per
channel at `min(that channel's basin, 1.5 px)`, and the reduction then reproduces the fitted
poses to **1.5–2.0 px** at the worst vertex. The reasoning is that the basin rule protects
against keys finer than *the estimator that wrote the channel*, and two estimators wrote
these: the composite for shape, and the drift matcher — a sub-pixel translation fit — for
every translate channel. The composite's 6 px basin on the collar is not the resolution of
the series that was actually written.

**What a skipped sample costs** (§10.3's second ⚠️): half the fitted series' own second
difference, median **0.59 / 1.50 / 1.89 / 1.83 px** and p90 **7.7 / 10.6 / 9.2 / 11.3 px**
across the four shots against a 0.40 px tolerance. So this is the case that section
describes: the key density is mostly a fact about the subject. **64 timelines, 1,273 keys.**

**Easings, in two passes** (§10.4's 🚨). Pass A fits handles freely from a 7⁴ grid purely to
discover which shapes the shot uses — 1,087 handle sets — those are k-means clustered into
**8**, and pass B re-plans **every** timeline under that table. Spans with no interior
sample take the editor's **automatic handles** snapped to the table rather than linear.
Curve evaluation mirrors `CurveTimeline.setBezier`'s own 9-point forward-difference table,
so the planner samples the curve the runtime plays rather than an exact cubic.

### 9 — the per-frame change column, which took the rest of the run

`check` reported drift under 3 px early and **7 pairs out of 98** whose change disagreed.
Three blunt fixes failed before a targeted one worked, and all three failed the same way.

- **Penalising every knob's deviation from its neighbours' mean, weighted by its basin**
  took `fall-in` from **17.70 to 31.13**. That quantity is half the second difference, which
  is not noise on an accelerating series: `body.y` drops 140 px a frame there and its basin
  is 0.25 px, so the prior charged ~4 units for motion the shot has.
- **Filtering only the wide-basin knobs** still took it to **23.03**: a wide basin is not
  the same thing as no signal, and the sack's own shape knobs sit at 1.25–6 px and carry
  the squash.
- **Contracting the raw pose series** left the planner reporting six pairs out of band on
  the *reduced* ones, one of them a pair the raw series was fine on. The reduction moves the
  poses again, so a correction upstream of it measures something the report never sees.

⇒ what worked, in the order it is applied: ① a filter on the degenerate directions
**weighted by the reference's own local change**, so it is inert where the shot moves and
full-strength where it has stopped, with each frame's step bounded by bisection at 3.0
composite units; ② inside the plan loop, against the **planned curves**, a contraction of
each flagged pair aimed straight at half of what `check` allows.

**The diagnosis that made ② right rather than ①'s opposite** (§10.3's ⭐): every flagged
pair had both poses inside the fit's own accuracy, so the defect is the per-frame residual
and forcing keys there would have pinned the excess. And case ⓐ — *my curve slopes through
a plateau the reference holds* — **cannot arise on this shot at all**, which is why turn 0
measured for it: none of the 98 pairs is still.

⚠️ **One more thing the loop only found by building.** Aiming at `check`'s own ratio of 4
was not enough: the loop renders into `frames.json`'s box while `check` measures in the
framing it fits to the candidate's pixels (0.189725 against 0.189871 px/unit here), and a
fraction of a percent of scale moves the change count by a few percent. The loop reported
**zero** pairs out of band on a build `check` read at **1307 against 322** — ratio 4.06,
nineteen pixels the wrong side. Aiming at 3 instead carries that margin, and the next build
came back clean on all four shots.

**The trade, recorded as a trade** (§10.3): 13 pairs contracted, each bounded at 12
composite units — `fall-in` f14/f15 +0.76, f15/f16 +0.46, f16/f17 +0.20, f17/f18 +0.13,
f18/f19 +0.19, f19/f20 +0.14; `hello` f11/f12 +0.43, f12/f13 +0.77;
`cape-follow-example` f31/f32 +0.37, **f32/f33 +6.89, f33/f34 +7.06, f34/f35 +7.08**,
f35/f36 +2.66. The three expensive ones are in the passage where the body's centroid walks
0.4 px over ten frames and only the cloth moves; they are the frames this candidate is
least faithful on, and they were paid for the one measure that can see a hold.

### 10 — the cape's mechanism, decided by measurement

The brief leaves it open and says explicitly not to read the sack's verdict across. Both
hypotheses were built and fitted with the identical fitter, the identical knob budget and
the identical objective, from a baseline where **both rigs score 11.14 on `hello/f0000`
unfitted** — which is the point at which the comparison measures the mechanism and nothing
else (turn 6 is how that baseline was reached).

| composite error, pass 1 mean | A — one bone, one region | B — weighted mesh, three-bone chain |
| --- | --- | --- |
| `fall-in` | **19.55** | 23.13 |
| `hello` | **27.10** | 32.45 |
| `walk` | **24.21** | 27.30 |
| `cape-follow-example` | **25.39** | 27.15 |

**A wins on all four shots**, and the frames agree with it: the passage that looks least
affine — `fall-in` f0, where the crimson forms two wings reaching up and out with a genuine
gap between them at y = 45 that no affine image of a convex blob could leave — is explained
by the **collar**, whose art is a wide chevron whose two arms reach exactly those outer
corners. Nothing in the 102 frames needs the panel to be non-affine.

⚠️ **The honest caveat on that table**: B carries 30 knobs against A's 24 at the same search
budget, so part of the gap is search and not mechanism. It is stated here rather than
smoothed over. ⇒ **built as a region, and the reason is recorded at the moment of deciding
it** (§9.3's ⚠️: the frames cannot separate a posed hull from a deformed one, so the choice
belongs in the log).

### 11 — the final build, and two diagnostics beside it

`bun cli.ts build … --out bench/runs/2026-08-28-rung7-2/spine --profile spine` → green,
**17 PASS, 3 SKIP, 14 PROF**, `A09_ANIMATION_DURATION_MATCHES_SPEC` **PASS** against the
four durations declared from the brief's table.

Built into the run's own directory deliberately: rigc writes atlas page paths relative to
`--out`, so a candidate built in a working directory carries paths only that directory can
resolve — the portability defect the owner's 2026-08-26 ruling on [#181] is about. Verified:
`check` from the repository root with no `--atlas` override reproduces every figure to the
digit.

**Diagnostic 1 — the frames' own declared box** (`check-declared-box.txt`). The brief
predicts the declared box is refused on every set for a reason that is not a coordinate
error, and it is: 0 of 12 sets take it, on **extent** (`union residual −15.4 x −0.9 px`).
Pinned to it with `--viewport`, MAE(ref) reads **24.23 / 17.92 / …** against the record's
**24.93 / 19.17 / …** — so the framing is worth about **0.7–1.3 MAE** and what is left is
the keys. 🚫 The pinned run is not the record.

**Diagnostic 2 — the example's own packed atlas** (`check-atlas.txt`), the one file under
`export/` a run may open, read for §9.2's texture floor and nothing else. Its `scale: 0.5`
is there as the brief says. ⚠️ **But it does not size a floor on this rung and is reported
as not doing so**: MAE(ref) goes *up*, 24.93 → 28.84 and 19.17 → 27.75. The reason is that
`--atlas` substitutes the region **geometry** as well as the texture — those regions are
packed `rotate: 270` and trimmed — while this rig's attachments are measured from the loose
PNGs, so the run is not "same quads, coarser texture" here. §9.2's precondition was met
(the rest pose places all three parts provably), so the failure is the substitution's, not
the pose's.

## Result

`bun cli.ts bench 7 --candidate bench/runs/2026-08-28-rung7-2/spine --frames bench/reference-local/7-anticipation --json bench.json`

```
  ── summary ──
  validate   green  (profile spine)
  sack-pro   bones=0.128  slots=0.857  attachments=0.407  constraints=0.000  animations=0.798  events=1.000
             bones 0.128 (name-matched) · 0.213 (name-agnostic)   slots 0.857 (name-matched) · 0.333 (name-agnostic)
  framing    one per set (12); one shared box leaves x1.000056, rms 9.41px
  cape-follow-example MAE mean=23.92 worst=38.70 ref=24.93  over 37 frame(s)  worst slot drift 2.8px, attributed in 29, sack1 carries 72%
  cape-follow-example@24fps MAE mean=21.22 worst=22.73 ref=22.02  over 2 frame(s)  worst slot drift 0.8px, attributed in 2, sack1 carries 80%, sheet 73 tile(s) mean=28.30 worst=71.81
  cape-follow-example@30fps MAE mean=21.24 worst=22.77 ref=22.04  over 2 frame(s)  worst slot drift 0.8px, attributed in 2, sack1 carries 80%, sheet 91 tile(s) mean=29.25 worst=72.77
  fall-in    MAE mean=18.64 worst=34.95 ref=19.17  over 21 frame(s)  worst slot drift 2.0px, attributed in 16, sack1 carries 57%
  fall-in@24fps MAE mean=21.60 worst=33.97 ref=22.29  over 2 frame(s)  worst slot drift 1.8px, attributed in 1, sack1 carries 34%, sheet 41 tile(s) mean=22.17 worst=62.44
  fall-in@30fps MAE mean=21.61 worst=33.97 ref=22.30  over 2 frame(s)  worst slot drift 1.8px, attributed in 1, sack1 carries 34%, sheet 51 tile(s) mean=22.74 worst=66.48
  hello      MAE mean=24.96 worst=39.51 ref=26.20  over 35 frame(s)  worst slot drift 2.7px, attributed in 19, sack1 carries 64%
  hello@24fps MAE mean=27.35 worst=34.27 ref=28.29  over 2 frame(s)  worst slot drift 0.5px, attributed in 1, sack1 carries 63%, sheet 70 tile(s) mean=33.09 worst=58.64
  hello@30fps MAE mean=26.67 worst=32.93 ref=27.54  over 2 frame(s)  worst slot drift 0.5px, attributed in 1, sack1 carries 64%, sheet 87 tile(s) mean=34.30 worst=58.47
  walk       MAE mean=21.73 worst=25.29 ref=22.56  over 9 frame(s)  worst slot drift 2.1px, attributed in 7, sack1 carries 74%
  walk@24fps MAE mean=21.43 worst=21.93 ref=21.97  over 2 frame(s)  worst slot drift 0.3px, attributed in 1, sack1 carries 75%, sheet 17 tile(s) mean=26.63 worst=41.14
  walk@30fps MAE mean=21.04 worst=21.93 ref=21.57  over 2 frame(s)  worst slot drift 0.4px, attributed in 1, sack1 carries 76%, sheet 21 tile(s) mean=26.90 worst=39.74
```

Chain rollup, across every set:

```
  chain                worst slot drift across every set                            mean   MAE in it    share
  sack1                2.7 px "sack" in hello/f0004                               1.2 px       16.28    66.0%
  collar               2.8 px "cape-front" in cape-follow-example/f0019           0.8 px       42.53    16.5%
  panel                no slot attributable in any set                                 —       44.04    15.7%
```

**Builds: 14.** Two scaffolds, one that found the translate-offset defect, one that found
the off-frame cliff, and ten in the change-column loop. `check` ran on every one of them
and on several intermediate states besides; `bench` ran once, here.

## Notes — what the guide should have said

1. ⭐ **A fitted run should diff its compiled animation against its own pose series before
   it reads a single measure.** §9.1 warns about three inert writes inside a fit; the mirror
   defect is on the way *out* — a translate key is an offset from setup and the fitter drives
   the absolute local position, so the first spec here moved the whole figure by the setup
   offset a second time. `build` was green, and `check` reported it only as a framing
   catastrophe (union box **1.2054 ×** the reference's, MAE 77–117, no slot attributable
   anywhere) which reads like a wrong rig rather than a wrong emission. Five lines of
   `sampleAnimation` against the fitter's own pose named it exactly.
2. ⭐ **§9.1's cliff has a second entrance the section does not name: the objective's own
   window.** All three of its defences were in place and none of them reached this, because
   an objective computed in a window around the reference's drawn box charges nothing for
   ink that *leaves the window* — the fitter hung the panel 164 px below the frame and the
   collar 146 px past its right edge, reporting progress every step. The defence that works
   is one more line in the same place: count ink further than a margin outside the
   reference's own drawn box and charge it.
3. ⭐ **§9.1's "assert the part is drawn" has to be written at the level's own resolution.**
   Applied at full-resolution counts on a coarse-to-fine pyramid it refuses *every* coarse
   pose, and a refusal that fires on everything is indistinguishable from an objective with
   no gradient — it cost this run one whole shot's fit reading `mean Infinity` and another
   reading 37.14 where the same search reads 23.79.
4. ⭐ **§9.1's first defence needs its converse stated: a bound has to reach what the frames
   show, not just stop where they stop.** `body.y` bounded from the standing pose put
   `fall-in`'s entry — 558 px higher up, which the brief states outright — outside the
   search entirely.
5. ⚠️ **§10.3's one-tolerance rule and its basin rule can pull apart by an order of
   magnitude, and the section does not say which wins.** Here: 0.25 px on the body against
   ≥6 px on the collar. Following the basin rule literally cost 4–7 px of reduction error;
   what resolved it is that the basin belongs to *the estimator that wrote the channel*, and
   a run that fits poses has two of them. Worth a sentence in §10.3.
6. ⚠️ **§10.3's ⓑ fix has to be applied to the planned curves, not the pose series.** The
   section says to contract the neighbouring poses; it does not say that doing so before the
   reduction is measuring a series the report never sees. Two builds went into learning that.
7. 📌 **A run aiming at `check`'s change band should aim inside it.** The band is stated in
   `src/check.ts` and is exact, but a run measuring its own change renders in a different
   framing than the report does, and a fraction of a percent of scale is worth a few percent
   of the count — enough to sit 19 px the wrong side of a threshold the loop believed it had
   cleared.
8. 📌 **The brief's expected texture floor did not materialise as a floor here, and §9.2's
   diagnostic recipe is why.** `--atlas <the example's own>` substitutes region geometry as
   well as texture; where the supplied atlas packs rotated and trimmed regions and the
   candidate's attachments are measured from loose PNGs, the substitution is not
   "same quads, coarser texture" and the number goes the wrong way. §9.2 could say so.
