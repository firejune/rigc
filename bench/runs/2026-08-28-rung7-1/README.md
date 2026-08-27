# Rung 7 — `7-anticipation`, attempt 1

- **date** 2026-08-28
- **agent** Claude Opus 5 (1M context), Claude Code / Agent SDK
- **brief** [`bench/briefs/7-anticipation.md`](../../briefs/7-anticipation.md),
  **revision 2** (third-party verified 2026-08-27) — the first revision this rung has
  been runnable from
- **guide** `docs/AUTHORING.md` §10 in hand
- **profile** `spine`
- **reference export** **not read.** `examples/7-anticipation/export/sack-pro.json` was
  never opened. One `.atlas` header was, which is item 4 of *What a run may read* and
  which this rung needs — see *The texture floor* below
- **honesty-rule incidents** one, small, named in [`LOOP.md`](LOOP.md) §1: a
  `git log --oneline -3` on the fresh clone before the protocol was read. Git history is
  forbidden; the three commit subjects carried no count, measure or reference-side value
- **builds** **5**, all green
- **bench** read once, after the last build, and nothing was edited afterwards. The run
  is **not** bench-assisted

## What is peculiar about this rung, and what it cost

`7-anticipation` ships no upstream `license.txt`, so its rendered frames may exist
locally only. This run rendered them itself with the brief's exact commands, and **all
twelve frame counts across three rates reproduced the brief's table exactly**
(21/41/51, 35/70/87, 9/17/21, 37/73/91 — 102 frames at 12 fps).

🚫 **No frame of it is committed.** `git ls-files bench/reference-local` reports **0**,
checked before every commit of this run, and no artefact here contains a rendered pixel
of that example.

Two consequences a later reader should know:

- the candidate's `spine/skeleton.atlas` names its pages as
  `../../../../examples/7-anticipation/images/*.png`, which resolves from the repository
  root in any clone — but `examples/` is gitignored, so **re-inspecting this candidate
  needs `bun run fetch-examples` first**. That is inherent to the rung rather than a
  portability defect: the art cannot be committed either;
- every figure below is at `--max 1024 --tile 256`. At another `--max` they mean nothing.

## The inputs, and the brief as a measurement

Before anything was authored, about fifty of the brief's quantitative claims were
re-measured off the rendered frames — the pass `bench/runs/README.md` asks for and that
rung 2 paid for. **Every one reproduced to the digit**: the rest pose's 99 × 153–154 and
10,244 / 10,245 / 10,249 drawn, `walk`'s nine sack widths, `fall-in`'s four centroid
drops and five base rows, `hello`'s sixteen base rows f19 → f34 in order, and
`cape-follow-example`'s ten monotone cape areas and its centroid pinned at 345.23 … 345.33.
The five art-side controls in the revision-2 header came back identical too — `sack.png`'s
460 × 809 opaque box, its 250,792 opaque pixels of which 40 read as cape, its 9,041 px
area and 164.7 px diameter at the frames' scale, and 100.0 % of both cape images on the
cape side.

⇒ **nothing below overrules the brief.** Where this run disagrees with it, it is one
claim, it goes the *other* way, and it is measured — see *The panel's draw order*.

## What was built

One skeleton, `sack`, four animations, **7 bones · 3 slots · 3 attachments · 0
constraints · 1,326 keys over 60 tracks**.

```
root
└── sack          mesh slot "sack"       translate · rotate · scale
    ├── sack-b    mesh control bone      rotate · scale
    │   └── sack-c                       rotate · scale
    │       └── sack-d                   rotate · scale
    ├── cape-back region slot            translate · rotate · scale
    └── cape-front region slot           translate · rotate · scale
```

Draw order (the slots array, R4): **`cape-back` → `sack` → `cape-front`**.

Three decisions, each written down at the moment it was taken (§9.3 asks for exactly
that) and each with the measurement behind it:

**1. Names come straight off the art.** Three PNGs called `sack`, `cape-back` and
`cape-front` become three slots, three attachments and the bone that moves each —
§10.1's largest lever. It paid: `slots` **0.952** name-matched, with `slots.names`,
`slots.order`, `slots.attachment`, `slots.blend` and `slots.count` all **3/3**.

**2. The sack is a weighted mesh, not a region — and that was settled without a build.**
A Spine bone's local transform *is* a general affine, so the question has an exact form:
is each frame's sack silhouette an affine image of `sack.png`'s own? Measured over all
102 frames, with the estimator's floor and a positive control through the identical code:

| | residual |
| --- | --- |
| the art through a known affine — **the floor** | 0.0088 |
| the art at a plain non-uniform scale — must read as the floor, and does | 0.0090 |
| the art with its top third slid 20 % of its width — **a real bend** | 0.0715 |
| **the frames** | **mean 0.1234, worst 0.2745** |

The frames read nearly twice as far from affine as a deliberate 20 % bend, and fourteen
times the floor. The 20 frames under 0.05 are exactly the still ones. Polynomial warps
of rising order then sized what it needs: order 1 (one bone) 0.1531 → order 2 (a 3 × 3
lattice) 0.0915 → order 3 0.0713. ⇒ a four-bone chain, 5 × 9 vertices, 64 triangles,
weights blended by height only so every row shares its weights.

**3. Both cape parts are regions — and that was tested, not assumed.** The two cape
images are both crimson, so no colour key separates them; the question was asked through
the rig instead. Given a long search on one frame whose sack pose is independently known
correct, the two cape bones reach crimson silhouette IoU **0.9303** — above the sack's own
floor. ⇒ the cape's deficit was **placement, not deformation**. Cloth mechanism is in the
brief's *cannot tell you* list, and a region that translates, turns and scales reaches the
same floor the mesh does.

⚠️ **`bench` disagrees with decision 3, and the frames could not have told me.** The
reference carries **31 bones and 24 constraints** against my 7 and 0, and
`attachments.type_counts` reads **1/3** — so its cape is almost certainly meshed and
driven, which is the mechanism §9.3 says renders to identical pixels. This is that
paragraph's case exactly: *"an argument for writing down which way you went and why at the
moment you decide it, rather than meeting the decision again in the measures after the run
is over."* The decision is above; the measure is below; and the frames still do not decide
it.

## The measures

`validate --profile spine` — **green**. 15 PASS, 0 FAIL, 5 SKIP, 14 PROF.

### Structural diff — `sack-pro`

| section | ratio | | |
| --- | --- | --- | --- |
| **bones** | **0.136** name-matched · 0.187 name-agnostic | 7 mine vs **31** reference | |
| **slots** | **0.952** name-matched · 0.333 name-agnostic | 3 vs 3 | |
| **attachments** | **0.407** | 3 vs 3 | |
| **constraints** | **0.000** | 0 vs **24** | |
| **animations** | **0.791** | 4 vs 4 | |
| **events** | **1.000** | 0 vs 0, neither side has any | |

The measures worth reading individually:

- `slots.count` **3/3** · `slots.names` **3/3** · `slots.order` **3/3** ·
  `slots.attachment` **3/3** · `slots.blend` **3/3** · `slots.color_present` **3/3** ·
  `slots.bone` 2/3. ⭐ **`slots.order` is 3/3, which is the draw order** — the slots
  array *is* the draw order, so the reference agrees with both edges this run built,
  independently of the render-back test below.
- `animations.count` **4/4** · `animations.names` **4/4** · `animations.duration`
  **4/4** ⭐ — the brief's duration table, declared rather than derived, and `hello`
  declared at 86/30 rather than the 12 fps set's 2.833.
- `animations.curve_kinds` **0.643** (852/1326). For scale, the guide records a run that
  keyed everything linear scoring under a sixteenth on this measure. 1,231 bezier spans
  against 35 linear.
- `animations.key_counts` 0.486 (645/1326) · `animations.timeline_kinds` 0.243 (44/181) ·
  `animations.deform` 0.75 — the reference carries a deform timeline in exactly one
  animation and this candidate carries none.
- `attachments.skins` **1/1** · `count` **3/3** · `names` **3/3**; `type_counts` 1/3,
  `mesh_weighted` 1/3, `mesh_vertices` 0/3, `mesh_triangles` 0/3, `mesh_hull` 0/3,
  `region_size` 0/2.
- `bones.count` 7/31, `bones.names` 3/35, `bones.parent_by_name` 2/31.

### `check` — per set, per dimension

**Two tables, and which is which matters.** The rig is authored in the frames' own world
units (read off `frames.json`; the setup box lands on the reference's own
[102..188] × [596..749] to the pixel), but `check` refused `frames.json`'s box on all 12
sets because that test is on **extent** and this candidate's union content box is a few
pixels off at the extremes. So the fitted framing is 0.99 % small in scale, and that costs
every set. The **fitted** figures are the run's, because they are what the artifact
produces unaided and what `bench` wrote; the **pinned** ones separate the framing from the
keys, which is §9.2's second named use of `--viewport`.

| set | MAE / ref-px (fitted) | (pinned) | worst | at | worst slot drift | frame-change | sheet / ref-px |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fall-in` | **19.07** | 16.03 | 42.91 | f0000 | 5.0 px `cape-front` | **20/20 agree** | — |
| `hello` | **29.23** | 25.79 | 48.31 | f0034 | 3.3 px `cape-front` | **34/34 agree** | — |
| `walk` | **20.80** | 20.29 | 25.60 | f0002 | 2.2 px `cape-front` | **8/8 agree** | — |
| `cape-follow-example` | **25.07** | 23.32 | 39.96 | f0020 | 7.3 px `cape-front` | **36/36 agree** | — |
| `fall-in@24fps` | 26.74 | 17.47 | 42.91 | f0000 | 5.0 px | n/a (stills) | **22.13** |
| `fall-in@30fps` | 26.74 | 17.47 | 42.91 | f0000 | 5.0 px | n/a (stills) | **22.77** |
| `hello@24fps` | 32.52 | 21.45 | 49.69 | f0069 | 1.0 px | n/a (stills) | **37.91** |
| `hello@30fps` | 31.73 | 20.88 | 48.41 | f0086 | 1.0 px | n/a (stills) | **38.51** |
| `walk@24fps` | 17.46 | 16.56 | 18.08 | f0016 | 2.6 px | n/a (stills) | **24.97** |
| `walk@30fps` | 16.97 | 15.98 | 17.15 | f0020 | 3.5 px | n/a (stills) | **24.87** |
| `cape-follow-example@24fps` | 16.45 | 12.86 | 22.93 | f0072 | 3.0 px | n/a (stills) | **29.53** |
| `cape-follow-example@30fps` | 16.42 | 12.84 | 22.86 | f0090 | 3.0 px | n/a (stills) | **30.40** |

⭐ **Frame-change agreement: 98 of 98 adjacent pairs, zero disagreements**, on the one
measure in this toolchain that can see a hold, a loop seam or a one-frame event. Reached
by §10.3's own closing loop, run to convergence over four rounds with no build per round.

**Slot drift**: worst anywhere is **7.3 px** on `cape-front` in
`cape-follow-example/f0012`; every chain's mean is **1.0–1.8 px**. The parts are where the
reference puts them.

**Drawn inventory: complete.** All three slots are authored and drawn on every frame of
every set; no set reports a reference component no slot reaches.

### Chains — the rollup, read per pixel rather than per share

| chain | worst slot drift across every set | mean | MAE in it | share |
| --- | --- | --- | --- | --- |
| `sack` | 4.4 px `sack` in `fall-in/f0000` | 1.8 px | **16.85** | 67.5 % |
| `cape-back` | 1.0 px `cape-back` in `cape-follow-example/f0021` | 1.0 px | **39.61** | 16.9 % |
| `cape-front` | 7.3 px `cape-front` in `cape-follow-example/f0012` | 1.5 px | **37.47** | 12.9 % |

§9.2 says to read `MAE in it` beside the share because the share confounds *wrong* with
*big*, and here it is decisive: the sack carries two thirds of the error at **less than
half** the error per pixel of either cape part. ⇒ **the cape is this candidate's worst
part**, by more than 2×, and the sack is close to its floor.

ℹ️ The chain named `sack-b` (`sack-b`, `sack-c`, `sack-d`) reports *"draws nothing"*. On a
mesh rig that is normal: those are the mesh's control bones and the mesh lives on `sack`'s
slot. It is not a missing part.

## The floor these numbers sit on

`examples/7-anticipation/export/7-anticipation.atlas` carries **`scale: 0.5`**, so the
reference frames were drawn from a half-resolution texture and this candidate is drawn
from the full-resolution PNGs rigc packs itself (§9.2 — rigc has no packer). That is a
constant on the outline of every part in every frame and **no key can move it**.

Measured at the rest pose, where the pose is provably right (the setup pose is the art at
scale 1, and the brief measures the standing sack at 87–88 × 153–154 against the art's own
87.3 × 153.6):

| frame | sack IoU | cape IoU | sack Δ | cape Δ | MAE / ref-px |
| --- | --- | --- | --- | --- | --- |
| `hello/f0000` | 0.9860 | 0.9202 | 118 px | 152 px | **4.42** |
| `fall-in/f0020` | 0.9860 | 0.9237 | 118 px | 145 px | 4.43 |
| `cape-follow-example/f0000` | 0.9844 | 0.9192 | 132 px | 154 px | 4.54 |

⇒ **4.42 is the floor** for this candidate on a frame it has exactly right.

## The panel's draw order — a claim that goes the other way

The brief settles one edge by measurement (the collar is in front of the sack, from the
beige-piece census) and says of the other: *"That is what a panel behind the sack looks
like, and it is the weaker of the two readings: a panel in front that happens never to
overlap would look the same … Build it behind; the frames do not force it."*

**The frames do force it.** §8's render-back test, scored over the pixels where the two
orders differ at all, with the settled edge as the control:

| edge | deciding px | as built | swapped | separation | per-frame tally |
| --- | --- | --- | --- | --- | --- |
| collar vs sack — **control, settled by the brief** | 69,299 | 23.070 | 87.891 | +281 % | **102 : 0** |
| **panel vs sack — said not to be forced** | **359,989** | **8.492** | 98.848 | **+1064 %** | **101 : 1** |

The panel's edge separates by nearly **four times** the settled control's margin and wins
101 of 102 frames. The brief's reasoning turns on the panel never overlapping the sack;
the overlap is 359,989 pixels across the corpus, five times the collar's own deciding set.
Each variant asserts exactly one edge — three slots, one adjacent swap — so §8's warning
about a control that asserts more than one thing does not apply. And `slots.order` **3/3**
in the diff agrees, from the other side.

⇒ **suggested for the brief's next revision**: move the panel's side out of *the weaker
reading* and into a measured claim, with the deciding-pixel figure beside it.

## Known-wrong, and what a second attempt should do differently

1. ⚠️ **The cape is the worst part, at 2× the sack's error per pixel** (`MAE in it` 39.61
   and 37.47 against 16.85), and its silhouette IoU runs **0.62–0.76** against a rest-pose
   floor of 0.92. A region reaches the floor at rest, so the residual is the panel's own
   deformation while it moves — and `bench` says the reference has 24 constraints and 31
   bones. **A mesh for `cape-back` on a short chain is the named next step**, and it is
   where the remaining MAE is.
2. ⚠️ **`fall-in/f0000` is the worst frame in the corpus** (MAE 42.91). At f0 the crimson
   spans 183 px while the sack inside it is 87 — the cape is streaming out on both sides
   and *above* — and a 97.6 px region at scale 1.87 does not get there. My `fall-in` union
   box is **44 px narrower** than the reference's for that reason alone, which is also
   most of why the declared framing was refused.
3. ⚠️ **Eight frames of 103 carry a deliberate fidelity trade.** On `cape-follow-example`
   f30–f36 and `hello` f11–f12 the poses were contracted toward their neighbours until my
   own frame-to-frame change was inside `check`'s band, at a cost of 0.003–0.146 part
   error on those frames. It is a trade of a little fidelity on the quietest frames of one
   shot for agreement on the one measure that can see a hold, and it is recorded as a
   trade rather than presented as a fit ([`LOOP.md`](LOOP.md) §17).
4. **`bones` 0.136 and `constraints` 0.000 are the two sections this rig does not reach**,
   and both follow from decision 3 above rather than from a fitting failure. 7 bones
   against 31, 0 constraints against 24.
5. **The framing.** Fitted rather than declared, costing 1–11 MAE depending on the set.
   The cause is a few pixels of union extent at the extremes (item 2), not a coordinate
   error; both tables are above and `check-pinned.txt` is in this directory.
6. **`hello` is the weakest shot** (29.23 against `fall-in`'s 19.07), and its worst frame
   is now f0034 — the last 12 fps sample, one thirtieth of a second before an end pose
   that drops 69 px. That interval is sampled by exactly one frame on disk.

## What the guide should have said

Seven items, in [`LOOP.md`](LOOP.md)'s *Notes*. The two worth lifting here:

- ⭐ **§9.1's trap list is missing the mirror image of its three traps.** All three are
  *"the number will not move"*. This shot produced the twin — an objective that
  **improves by removing the subject**, because a symmetric part error scores a candidate
  that draws nothing at exactly 1.0 while a present but badly-posed one can score above
  it. A full-range search duly walked the figure 5,695 units off frame and reported
  1.0000 as progress on 1.4018.
- ⭐ **§9.2's floor advice needs a precondition: a floor measured with another part
  misplaced is not a floor.** This run measured its texture floor at the rest pose, which
  is exactly what §9.2 asks for, and got sack IoU 0.870. The real figure is **0.986**. The
  difference was the collar, 45 units low, occluding the wrong sack pixels — and two
  experiments were read against the wrong number before the setup fit exposed it. It is
  the same shape as this repository's own *guard baselines captured after the break*.

## Files

| | |
| --- | --- |
| `sack.rig.json` · `sack.motion.json` | the specs, generated by `tools/emit.ts` |
| `spine/` | the compiled candidate |
| `bench.json` · `bench.txt` | the finish line, read once |
| `check.txt` | `check` as the run's figures record them — fitted framing |
| `check-pinned.txt` | the same with `--viewport` on `frames.json`'s box, for §19 of the loop log |
| `placements.json` | the fitted pose per sample, and each set's sample times |
| `keys.json` · `force.json` · `setup.json` | the key plan, its forced indices, the re-fitted setup pose |
| `fit.log` | the staged fit's console output |
| `tools/` | every script this run used, in the order [`LOOP.md`](LOOP.md) names them |
