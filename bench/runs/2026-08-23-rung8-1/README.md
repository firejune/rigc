# Rung 8 (`8-follow-through`) — attempt 1

**Two skeletons, two candidates, two `bench` runs.** `pendulum` is a discus carried
round a loop with a four-link chain that arrives late; `ball` is a comet whose trail
bends and whose ball changes shape. The rung's own line is that the two want
opposite machinery, and they got it: nothing in the `pendulum` deforms and
everything in it is pose, while the `ball` carries the run's only mesh.

- **date** — 2026-08-23
- **model** — Claude Opus 5 (1M context), running as a Claude Code / Agent SDK agent
  in a fresh session, in its own `git worktree`
- **profile** — `spine`
- **guide** — [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) in full, **§10 in
  hand**: this run is after the 2026-08-23 boundary, so its convention measures are
  not comparable with a run authored before it
- **clean or bench-assisted** — **clean.** `bench 8` was run exactly once per
  candidate, at the end, and neither spec was touched afterwards.
- **iterations** — the gate was green on the first compile of each candidate's real
  spec. One compile error was hit all run (an empty `tracks` array against a
  declared duration, from the static rig the fitting loop poses). Everything else
  in the loop was `build` + `check` + render-back: roughly 40 builds for the
  `pendulum` and 25 for the `ball`, nearly all of them structure and tolerance
  sweeps rather than fixes.

## Inputs

| input | note |
| --- | --- |
| [`bench/briefs/8-follow-through.md`](../../briefs/8-follow-through.md) | **revision 2** — verified by a third party, 2026-08-23 |
| [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) | the whole guide, including §8, §9 and §10 |
| [`bench/runs/README.md`](../README.md) | the run protocol |
| [`docs/LADDER.md`](../../../docs/LADDER.md) | *"How a rung is scored"* and *"The honesty rule"* only, as this run's instructions directed |
| `examples/8-follow-through/images/` | the eight loose PNGs |
| `bench/reference/8-follow-through/` | `ball/` and `pendulum/`, 45 + 88 frames each, plus contact sheets and `frames.json` |
| this repository's source | `src/render.ts`, `src/rig.ts`, `src/types.ts`, `src/check.ts`, `src/diff.ts`, `src/ladder.ts`, `tools/plate.ts` — format and renderer documentation |

Nothing under `examples/*/export/`, `bench/transcriptions/`, `bench/render_reference.ts`,
`bench/count_features.ts`, `docs/SPEC_COVERAGE.md` or any other run's rig and motion
specs was opened; no git history, no web search. `src/ladder.ts` is declared in
[`LOOP.md`](LOOP.md) — it was read to find out how `bench` resolves a two-skeleton
rung, and the one sentence it carries about this rung is the one the ladder's table
and this run's own instructions had already given.

## Files

```
pendulum/  pendulum.rig.json  pendulum.motion.json  spine/  check.txt  selfcheck.txt  bench.json
ball/      ball.rig.json      ball.motion.json      spine/  check.txt  selfcheck.txt  bench.json
tools/     every script every number in here came out of
LOOP.md    every turn of the loop, including the three defects the gate could not see
```

`spine/` carries `skeleton.json` and `skeleton.atlas` only. The atlas pages are the
example's own PNGs, which this repository does not redistribute — re-run `build` to
put them back, which is what the earlier runs' directories do too.

## What was built

```
pendulum                                     ball
root                                         root
└── discus    platform.png   translate+rotate └── comet    translate — the ball's path
    └── chain1  chain-1.png  rotate               ├── ball   ball.png   scale — the squash
        └── chain2 chain-2.png rotate             └── tail0 ─ tail1 ─ … ─ tail5  rotate ×6
            └── chain3 chain-3.png rotate              tail.png as ONE weighted mesh
                └── chain4 chain-4.png rotate
                    └── eyelet chain-end.png  (no timeline)
```

- **`pendulum`: 7 bones, 6 slots, 6 region attachments, 6 timelines, 302 keys, 12
  named easings, no mesh, no constraint, no `drawOrder` timeline.**
- **`ball`: 9 bones, 2 slots, 1 region + 1 weighted mesh, 8 timelines, 501 keys, 12
  named easings, no constraint, no `drawOrder` timeline.**
- Both declare `duration` **3.633333 s** — the brief's 109/30, the only value in the
  frames' own window that lands on a 30 or 60 fps project grid.

### The build choices, in order of how much they moved

1. **The `pendulum` is rotation and travel only** — the brief's own headline, and
   every measurement here agrees: the rim holds 109.6–111.2 px, the joint spacings
   hold to ±0.3 px, the subject's area to 1.8 %. So every attachment is a plain
   region and there is not a mesh or a scale key in the shot.
2. **The chain hangs from the discus's own centre.** The one joint the frames cannot
   show directly — the discus covers 70 % of the top bead — was *fitted*: the point,
   fixed in the discus's frame, that keeps its distance to the second bead constant.
   Both frame sets independently put it on the rim's tip midpoint to a hundredth of
   a pixel, and put link 1 at **305 units**, not the 247 the occluded bead reads.
3. **The `ball` does not turn; it only changes shape.** Its pale cap points within
   82°–102° of straight up on every frame whose split holds, and the art's own cap
   is straight up. So the ball's bone is screen-aligned and carries `scale` alone,
   which puts the squash axes on the screen axes — and the flattened landing frames
   read a major axis of about 0°, which is what that predicts.
4. **The trail is a weighted mesh on a six-bone chain**, authored geometry with
   `weights` bound by name, hull-first, both vertices of a row carrying identical
   weights so the strip bends and cannot change width. A rigid region can point the
   trail and cannot bow it, and the trail is past a straight spindle's own sagitta
   floor on three quarters of the frames.
5. **Draw order in the `pendulum` was measured, not guessed** — each link is drawn
   in front of the one below it. The brief could not see this and a like-for-like
   render can: [`LOOP.md` §9](LOOP.md). Worth 1.402 → 1.335 window MAE, and `bench`
   scores `slots.order` **6/6**.
6. **No constraints anywhere**, deliberately — [`LOOP.md` §13](LOOP.md).
7. **Bezier everywhere, from a fitted table of 12 named easings**, per §10.4 🧩; no
   raw `curve` in either file. §10.3's paired `translate`/`scale` were used as the
   default rather than the Separate checkbox, since neither shot's axes needed
   different times.

## The measures

### `pendulum` — the matching line, verbatim

```
  ── summary ──
  validate   green  (profile spine)
  pendulum   bones=0.456  slots=0.857  attachments=1.000  constraints=1.000  animations=0.846  events=1.000
             bones 0.456 (name-matched) · 1.000 (name-agnostic)   slots 0.857 (name-matched) · 1.000 (name-agnostic)
  framing    fit x1.000902  rms 0.34px  union residual -0.33 x +0.17px  (frames.json's own box, the candidate measured into it)
  follow-through MAE mean=12.52 worst=17.62  over 45 frame(s)  worst slot drift 3.3px, attributed in 45
  follow-through@24fps MAE mean=12.56 worst=21.22  over 88 frame(s)  worst slot drift 3.3px, attributed in 88
```

⚠️ That run also printed a `ball` line. It is this candidate diffed against the
*other* skeleton's reference and it measures nothing; it is not quoted here.

### `ball` — the matching line, verbatim

```
  ── summary ──
  validate   green  (profile spine)
  ball       bones=0.466  slots=0.929  attachments=0.444  constraints=0.000  animations=0.878  events=1.000
             bones 0.466 (name-matched) · 0.550 (name-agnostic)   slots 0.929 (name-matched) · 0.625 (name-agnostic)
  framing    fit x0.999441  rms 0.90px  union residual +1.63 x -0.06px  (frames.json's own box, the candidate measured into it)
  follow-through MAE mean=16.17 worst=56.36  over 45 frame(s)  worst slot drift 5.3px, attributed in 45
  follow-through@24fps MAE mean=16.12 worst=56.72  over 88 frame(s)  worst slot drift 5.3px, attributed in 86
```

⚠️ Same for the `pendulum` line in that run: noise, not quoted.

## Reading

**Both candidates are framed in the reference's own coordinates, and `check` says so
rather than being told.** Both report `frames.json's own box — the candidate measured
into it`: rendering each rig into the box the frames were drawn at put its own pixels
on the reference's, 0.34 px rms for the `pendulum` and 0.90 px for the `ball`. That
is the case #52 added, and it means none of the MAE below is framing.

**The `pendulum`'s skeleton is the reference's skeleton with different names on it.**
Every count is identical — 7 bones, 6 slots, 1 skin, 6 attachments, 0 constraints, 1
animation — and every name-agnostic bone measure is **1.000**: `count`,
`depth_histogram`, `degree_sequence`, `shape_histogram` and `order_shape` all 7/7.
`attachments` is **1.000 across the board**, including `names 6/6` and
`region_size 6/6`, which is §10.1's "the attachment name is the image name" doing
exactly what it promises. `slots` is 6/6 on count, **names**, **order**, attachment,
blend and colour; the single failure is `slots.bone 0/6`, which is the bone names
again. `bones.names 1/13` is that same fact counted a sixth time — the one match is
`root`.

**`constraints` splits the two shots, and that is the price of the honesty rule paid
in public.** The `pendulum`'s reference has none and neither does mine: **1.000**.
The `ball`'s has **four** and mine has none: **0.000**. Frames cannot show a
constraint (§9.3), so both outcomes came from the same decision not to guess — one
of them won and one lost, and no reading of the pixels could have told me which.

**The animations are the right length and the right shape, and there are too many
keys in them.** Both score 1.000 on `count`, `names`, `duration`, `draw_order` and
`deform`. But `key_counts` reads **135/302** (`pendulum`) and **307/501** (`ball`):
the reference is roughly half as densely keyed as this run's tolerance produced.
That is rung 4's finding reproduced under a different mechanism — I did not aim at a
density (§10.6 is right that no public page gives one), I aimed at a sub-pixel
tolerance, and a sub-pixel tolerance against a *fitted* pose series is a much
stricter thing to ask than what a hand-animated shot actually contains. The
tolerance/keys/MAE tables are in [`LOOP.md` §8 and §12](LOOP.md); at 0.6 px the
`pendulum` is 238 keys and 1.597 window MAE against 302 and 1.335, so a cut much
closer to the reference's density was available at a cost I could measure and chose
not to take. **This is the run's clearest own-goal, and it is a knob, not a bug.**

**`curve_kinds` is where §10.4 paid.** 165/302 and 344/501, against rung 6's
**34/539** for the same section when it keyed everything linear on the reasoning that
frames underdetermine a curve. They do — but abstaining authors constant speed, and
the reference is overwhelmingly Bezier. A synthetic control in [`LOOP.md` §8](LOOP.md)
says what the curve is worth on its own: two harmonics over 88 samples reduce to
**9 keys at 0.88 units of error** with fitted Beziers and **24.3** with linear spans.

**The `ball` is the harder shot and its measures say where.** `slots` 0.929 —
`count`, `names` and **`order`** all 2/2, so `tail` behind `ball` is what the
reference does, which [`LOOP.md` §11](LOOP.md) could *not* establish from the pixels
and took on rung 6's reasoning instead. `attachments` 0.444 is the real gap:
`type_counts 1/2`, `mesh_weighted 1/2`, `region_size 0/1`. My ball is a **region
scaled by its bone** and the reference's is not — which §9.3 says outright the
frames cannot distinguish ("a hull moved by a bone chain and the same hull moved by
deform keys render to the same pixels"), and `animations.deform` scoring 1.000 on
both sides says neither of us deforms it with keys. `bones` 9 against 12 is the same
choice from the other end: the reference spends three more bones where this rig
spends one region's scale.

**MAE, read as §9.2 asks.** The `pendulum` is flat — 12.52 and 12.56 across both
rates with a worst of 21.22 — which is the signature of art and edge coverage, not
of timing, and it is corroborated by `per-frame` reporting **all 44 and all 87
adjacent pairs changing by as much as the reference's own frames do**: nothing holds
where the reference moves and nothing moves where it holds. The `ball` is spiky —
16.1 mean against a 56.7 worst — and the spikes are at f24, f60 and f61 of the 24 fps
set, the three frames the pose fit could not land either. That is the honest split:
the `pendulum`'s residual is the rasteriser, the `ball`'s is three poses.

## The frame-fidelity self-check

Before `bench`, both candidates were rendered back and measured with **the same
estimator over both sides**, so its bias cancels
([`tools/selfcheck.ts`](tools/selfcheck.ts); full output in each candidate's
`selfcheck.txt`).

### `pendulum` — the shot's own quantities

| quantity | candidate | reference |
| --- | --- | --- |
| discus rim, tip to tip | 109.49–111.52 px | 109.60–111.20 px |
| discus tilt | −16.80° … +33.26° | −16.30° … +33.11° |
| joint 1→2 spacing | 40.62 px | 40.69 px |
| joint 2→3 | 38.78 | 39.18 |
| joint 3→4 | 33.74 | 34.59 |
| joint 4→5 | 35.54 | 34.58 |
| total chain bend | 1.39°–103.33°, peak **f53** | 0.53°–103.41°, peak **f53** |
| eyelet x extremes | 31.0 … 478.5 px | 30.6 … 478.6 px |
| eyelet ÷ discus x travel | **1.52×** | **1.53×** |
| eyelet lag vs discus, x / y | **8 / 0** frames | **8 / 0** frames |
| last discus step over 1 px | **f79** | **f79** |
| last eyelet step over 1 px | **f84** | **f84** |
| subject drawn area | 2851–2886 px | 2919–2971 px |

The rung's whole subject — *the chain is a third of a second late sideways and not
late at all up and down, and it is still moving after the discus has stopped* —
reproduces exactly: the same lag on each axis, the same 1.5× overshoot, the same
last-moving frame on both parts, the same bend peak on the same frame.

### `ball`

| quantity | candidate | reference |
| --- | --- | --- |
| subject drawn area | 706–1064 px, mean **906** | 787–961 px, mean **902** |
| ball proportion, readable frames | 1.01–3.27 over 80 | 1.02–2.72 over 87 |
| frames under 1.15 (round) | 38 | 43 |
| trail sagitta | 0.51–14.28 px, mean 4.4 | 0.52–16.50 px, mean 5.1 |
| trail chord ÷ arc | 0.70–1.00 | 0.71–1.00 |
| f26 / f40 ball proportion | 2.96 / 2.25 | 2.43 / 2.43 |
| ball centre difference | median **0.95 px**, 59/79 under 2 px | worst 45.6 px at f8 — a split failure, not a rig error |

The mean drawn area matches to 0.4 % and the trail's bow reproduces in both the
scale-dependent and the scale-free form. What does not: my ball **over-flattens**,
and it loses its neck on 8 frames where the reference loses it on 1.

## Known-wrong, in order

1. **The `ball` over-squashes, and eight frames lose their neck because of it.** The
   proportion reaches 3.27 where the reference reads 2.72, `f27` and `f28` become
   unsplittable in my render, and 38 frames read round against the reference's 43.
   This is rung 6's §13 in a new suit: the optimiser can pay for the trail's error
   with the ball's shape, and clamping the value to `[0.25, 3.5]` bounded the
   disaster (a negative `scaleY`) without bounding the tendency.
2. **f24, f60 and f61 of the 24 fps set.** Window MAE 10.5–11.0 against a 2.7 mean;
   `check` reads 56.4 and 56.7 there. All three are places where a six-link chain can
   be folded two ways for nearly the same silhouette, and a 24-start rescue moved
   them by less than a point. Not the optimiser — the model.
3. **The `ball`'s union residual is +1.63 px wide.** My comet reaches further than
   anything in the frames does, so the `lead`/art-scale pair is a little long
   somewhere. It was swept ([`LOOP.md` §10](LOOP.md)) and −20/1.0 was the minimum of
   what was tried; the residual says the minimum is not zero.
4. **The `pendulum`'s joints 3→4 and 4→5 are 0.9 px out, in opposite directions**
   (33.74 against 34.59, 35.54 against 34.58) while their sum is right to 0.11 px. My
   `chain-4` bead sits about 0.9 px too far up the chain. Everything else in that
   shot is inside a fifth of a pixel.
5. **`chain-1`'s anchor has two readings that disagree** — 30 units by MAE, about 33
   by bead visibility ([`LOOP.md` §9](LOOP.md)). One anchor number cannot satisfy
   both the crescent above the link and the joint below it. Shipped at 30; the
   candidate's top bead reads 51–63 px where the reference's reads 58–71.
6. **Both candidates draw about 2 % fewer pixels than the reference** for the same
   content box (2851–2886 against 2919–2971 on the `pendulum`). On a shot that is
   mostly outline against a light backdrop that is most of the residual MAE, and it
   is the floor rung 3's second attempt describes.
7. **The key density**, above — measured, and chosen.
8. **What is not in the frames, and what this run did about each.** *Not claimed:*
   the eyelet's rotation (the only one this run can **show** is unknowable rather
   than merely assert — run free it wandered −25°…+52° frame to frame with no trend,
   and freezing it cost a measured 1.069 → 1.279 window MAE), the `ball`'s four
   constraints, every bone's `inherit`, and every name. *Claimed anyway, and said
   so:* every bone carries a setup `length`, because a bone made with Spine's
   Create tool has one — the chain's four are the link lengths the frames measured,
   and the discus's 343 and the eyelet's 120 are **not** measurements, they are
   plausible numbers for a plate that wide and an eyelet that size. `bench` cannot
   check either way here: `bones.length_present` and `bones.inherit_present` are
   name-gated, and with `root` the only shared name they read 1/7 and 1/12 no
   matter what is in the file. Rung 3's second attempt read its own 1/3 on those
   two as a genuine miss; on this rung they carry no information at all.

## Notes for the guide

1. **spine-core 4.3 keeps a bone's local transform on `bone.pose`, not on the bone.**
   Writing `bone.rotation = …` is neither an error nor a rotation: it adds a property
   nothing reads, and every frame renders as the setup pose. §9 tells a run to render
   its candidate back; this is the first thing it will hit doing so, and it cost a
   loop and a plausible-looking MAE that did not move for any parameter.
2. **A tolerance on a rotation is not a number of degrees.** A quarter of a degree on
   the last link of a chain moves its end 0.15 px and the same quarter degree on the
   first moves it 0.69 px. §10.3's "key every change of direction" says nothing about
   how tight a span has to be, and a run that picks one number per property will
   quietly key the far end of a chain four times too loosely. The rule that works is
   one tolerance, in pixels at the end of what the bone swings, divided by its lever
   arm — that belongs beside §8's "a value is easier to get right than a curve".
3. **Fitting a curve and then writing a different one is a silent 4× loss.** Fitting
   each span's own handles and substituting the nearest entry of a named table took
   this shot from 1.07 to 4.65 MAE with a green gate and an unmoved `diff`. §10.4 🧩
   asks for a small named table and does not say that the table has to be in hand
   *while the keys are chosen*. It does. Same shape as rung 6's clamp note: a
   constraint that is not enforced where the value is written is not a constraint.
4. **§9.3's "a mesh or a bone renders the same" has a measurable cost, and the guide
   could say where it lands.** Choosing bone scale over a mesh for the `ball` was
   §9.3's own advice — the frames cannot separate them — and it cost `attachments`
   0.444 and `bones` 9/12 on a rung whose reference chose the other one. That is not
   an argument for guessing; it is an argument for §9.3 saying out loud that this
   invisible choice is one `bench` *does* see, so a run records it as a choice rather
   than discovering it in the measures.
5. **Draw order is more decidable than "look at the reference" suggests.** §8 says to
   find a frame where one part's interior detail lies inside another's area. That
   settles one edge here. What settles three more is rendering **your own candidate**
   both ways and measuring the same interior detail on both sides — a part that is
   99–109 px in the reference and 108–116 in your build is being covered in one and
   not the other. §8's draw-order paragraph is written entirely about reading the
   reference; the like-for-like version deserves a sentence beside it.
6. **`bench` prints a line per skeleton and the protocol's warning is worth keeping.**
   Both runs here printed a confident, plausible line for the *other* skeleton. Read
   only the matching one.
