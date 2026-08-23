# spineboy (`ess`) — attempt 2

The graduation exam: a character, not a moving object. A figure with a head, two
arms, two legs, a gun that fires, and eight shots a game switches between.

**This is the first attempt at this rung after the leak seal.** The attempt of
2026-08-23 read facts about the reference out of this repository's own documents
and its figures carry that caveat; this run read the brief, the frames, the art
and the guide, and nothing else — §1 of [`LOOP.md`](LOOP.md) lists both sides of
the reading list as it was actually followed.

- **date** — 2026-08-23 (the fitting ran past midnight into 2026-08-24)
- **model** — Claude Opus 5 (1M context), running as a Claude Code / Agent SDK
  agent in a fresh session, in its own `git worktree`
- **skeleton** — **`ess` only.** The rung clears on `ess`; `pro` is a stretch
  figure and was not attempted, so the `pro` line `bench` prints from this
  candidate measures nothing and is not quoted
- **profile** — `spine`
- **guide** — [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) in full, **§10 in
  hand**: this run is after the 2026-08-23 boundary, so its convention measures
  are not comparable with a run authored before it
- **clean or bench-assisted** — **clean.** No file was edited after `bench` was
  run. ⚠️ It was invoked **twice**, back to back and with nothing changed between
  them: the first call omitted `--frames` and so printed no `check` table, and
  the protocol asks the run to record that table. Declared rather than tidied
  away — [`LOOP.md` §14](LOOP.md)
- **iterations** — the gate was green on the first compile of the real rig spec
  and on every compile after it. No `CompileError` was hit all run. The loop was
  `build` + a private render fit + `check`: about 30 builds, and something over
  600,000 renders inside the fitter

## Inputs

| input | note |
| --- | --- |
| [`bench/briefs/spineboy.md`](../../briefs/spineboy.md) | **revision 2** — verified by a third party, 2026-08-23 |
| [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) | the whole guide, §8, §9 and §10 included |
| [`bench/runs/README.md`](../README.md) | the run protocol |
| `bench/reference/spineboy/ess/` | 8 sets, 132 frames at 12 fps, plus two stills per set at 30 fps, and `frames.json` |
| `examples/spineboy/images/` | the 40 loose PNGs |
| this repository's source | `src/render.ts`, `src/rig.ts`, `src/types.ts`, `src/check.ts`, `src/diff.ts`, `tools/plate.ts` — format and renderer documentation |

**The atlas was not needed and was not opened.** `bench/runs/README.md` item 4
allows `examples/spineboy/export/*.atlas`; rigc emits its own one-part-per-page
atlas from the loose PNGs, so nothing under `examples/spineboy/export/` was read.

Not opened: `examples/spineboy/export/` at all, `bench/transcriptions/`,
`docs/LADDER.md` (any part), `docs/SPEC_COVERAGE.md`, `src/ladder.ts`,
`bench/render_reference.ts`, any issue body, git history, and
`bench/runs/2026-08-23-spineboy-1/` — the previous attempt at this rung.
Earlier runs' `README.md`/`LOOP.md` were read for **process only**, and only
[`2026-08-23-rung8-1/`](../2026-08-23-rung8-1/), which is a different rung.

## Files

```
ess/     spineboy-ess.rig.json  spineboy-ess.motion.json  spine/
         check.txt  check-pinned.txt  bench.json
tools/   every script every number in here came out of, and the fitted pose
         series (poses-<animation>.json, one entry per committed frame)
LOOP.md  every turn, including the five the guide could have saved
```

`spine/` carries `skeleton.json` and `skeleton.atlas`. The atlas pages are the
example's own PNGs, which this repository does not redistribute — re-run `build`
to put them back, as the earlier runs' directories also expect.

## What was built

```
root
└── hip                                       translate + rotate — the body
    ├── torso                                 torso.png
    │   ├── neck ── head                      neck.png, head.png
    │   │            └── (eye, mouth, goggles on the head bone)
    │   ├── rear-upper-arm ── rear-bracer ── gun ── muzzle
    │   └── front-upper-arm ── front-bracer ── front-fist
    ├── rear-thigh  ── rear-shin  ── rear-foot
    └── front-thigh ── front-shin ── front-foot
```

**18 bones, 21 slots, 29 region attachments, 1 skin, 8 animations, 2 events, no
constraint, no mesh, no draw-order timeline, 1,368 keys, 10 named easings.**

Every name is the art's own (§10.1): PNG basename → attachment → slot → the bone
that moves it. Five slots hold alternatives that are never on screen together —
`eye` (2), `mouth` (3), `front-fist` (2), `muzzle` (5) — which is §10.1's *"slots
group attachments of the same type … only one can be visible at any time"*, and
the other sixteen are one image each.

### The build choices, in order of how much they moved

1. **Everything is fitted by rendering the candidate back into the frames' own
   viewport.** No estimator on this figure survives §8's first trap — on a
   character almost every part touches another — so the objective is the picture,
   through the same rasteriser that drew the reference. The setup pose is fitted
   against `idle/f0000`, then re-fitted against **ten frames drawn from every
   shot at once**, because a wrong offset hides inside one frame's own rotations
   and cannot hide across frames. Each of the 132 committed frames then gets its
   own 17-parameter pose.
2. **The gun hangs off the *rear* arm** — against the brief, on the art's own
   evidence and on the brief's own rule about fists. See [`LOOP.md` §3 and
   §12](LOOP.md); this is reported as a defect in the brief rather than used.
3. **The gun's slot is lifted out of its bone's chain.** It is drawn in front of
   the torso and behind the front leg, which is §10.2's own reason slots exist
   and the only arrangement that satisfies both things the frames measure: the
   gun reads unoccluded in `idle`, and the near leg covers it in `walk`.
4. **The muzzle flare is scaled, and the scale is keyed.** `muzzle03` at one unit
   per art pixel is 37 px wide; the reference's flare is about 130. The scale is
   solved against the brief's own measurement — the subject box widening 108 →
   189 / 202 / 218 px — rather than against the difference, which barely moves
   for a soft sprite. [`LOOP.md` §8](LOOP.md).
5. **Bezier from a table of 10 named easings, planned in §10.4's two passes**;
   no raw `curve` anywhere. One tolerance, **0.8 px at each bone's lever arm**,
   measured off the setup pose rather than declared in degrees (§10.3).
6. **`translate` paired, not separated** (§10.3) — the hip is the only bone that
   translates and both its axes move together on every shot.
7. **Nothing is authored that the frames cannot show**: no constraints, no
   meshes, no draw-order timeline, no bounding box, and no `eye`/`mouth`
   attachment keys. [`LOOP.md` §13](LOOP.md) has each decision at the moment it
   was made, which is what §9.3 asks for.

## The measures

### The `ess` line, verbatim

```
  ── summary ──
  validate   green  (profile spine)
  ess        bones=0.904  slots=0.831  attachments=0.955  constraints=1.000  animations=0.806  events=0.500
             bones 0.904 (name-matched) · 0.956 (name-agnostic)   slots 0.831 (name-matched) · 0.798 (name-agnostic)
  framing    one per set (16); one shared box leaves x0.999740, rms 6.12px — see the check table above for each set's own
  aim        MAE mean=46.28 worst=46.28  over 1 frame(s)  worst slot drift 2.2px, attributed in 1
  aim@30fps  MAE mean=46.28 worst=46.28  over 1 frame(s)  worst slot drift 2.2px, attributed in 1
  death      MAE mean=50.44 worst=59.56  over 60 frame(s)  worst slot drift 18.8px, attributed in 60, 12/59 pair(s) change unlike the reference
  death@30fps MAE mean=46.81 worst=47.56  over 2 frame(s)  worst slot drift 2.7px, attributed in 2
  hit        MAE mean=58.51 worst=63.07  over 5 frame(s)  worst slot drift 5.9px, attributed in 4
  hit@30fps  MAE mean=60.06 worst=63.07  over 2 frame(s)  worst slot drift 3.2px, attributed in 1
  idle       MAE mean=23.53 worst=28.91  over 21 frame(s)  worst slot drift 3.7px, attributed in 21
  idle@30fps MAE mean=16.10 worst=18.36  over 2 frame(s)  worst slot drift 2.2px, attributed in 2
  jump       MAE mean=52.39 worst=63.04  over 17 frame(s)  worst slot drift 6.8px, attributed in 17
  jump@30fps MAE mean=54.06 worst=55.26  over 2 frame(s)  worst slot drift 6.8px, attributed in 2
  run        MAE mean=57.28 worst=62.98  over 9 frame(s)  worst slot drift 11.5px, attributed in 9
  run@30fps  MAE mean=53.90 worst=55.82  over 2 frame(s)  worst slot drift 7.1px, attributed in 2
  shoot      MAE mean=47.20 worst=52.71  over 6 frame(s)  worst slot drift 16.3px, attributed in 6, 1/5 pair(s) change unlike the reference
  shoot@30fps MAE mean=45.30 worst=49.42  over 2 frame(s)  worst slot drift 3.6px, attributed in 2
  walk       MAE mean=47.81 worst=53.95  over 13 frame(s)  worst slot drift 5.9px, attributed in 13
  walk@30fps MAE mean=32.54 worst=33.94  over 2 frame(s)  worst slot drift 3.4px, attributed in 2
```

⚠️ **That run also printed a `pro` line.** This candidate was built from `ess`
and only `ess`; `bench` diffs whatever it is given against **both** reference
skeletons, so the `pro` line is this `ess` rig measured against a skeleton it was
never built from. It is noise, it is labelled *(stretch — reported, does not
count)* in the tool's own output, and it is **not quoted here**.

### `ess`, measure by measure

| section | measure | | |
| --- | --- | ---: | ---: |
| **bones** 0.904 | count | 18/18 | **1.000** |
| | names | 17/19 | 0.895 |
| | parent_by_name | 17/18 | 0.944 |
| | order | 9/18 | 0.500 |
| | length_present | 17/18 | 0.944 |
| | inherit_present | 17/18 | 0.944 |
| | depth_histogram | 18/18 | **1.000** |
| | degree_sequence | 18/18 | **1.000** |
| **slots** 0.831 | count | 20/21 | 0.952 |
| | names | 19/22 | 0.864 |
| | order | 12/21 | 0.571 |
| | bone | 18/21 | 0.857 |
| | attachment | 17/21 | 0.810 |
| | blend | 18/21 | 0.857 |
| | color_present | 19/21 | 0.905 |
| **attachments** 0.955 | skins | 1/1 | **1.000** |
| | count | 27/29 | 0.931 |
| | names | 26/30 | 0.867 |
| | type_counts | 26/29 | 0.897 |
| | region_size | 26/29 | 0.897 |
| | the four mesh measures | 0/0 | **1.000** each |
| **constraints** 1.000 | all five | 0/0 | **1.000** |
| **animations** 0.806 | count | 8/8 | **1.000** |
| | names | 8/8 | **1.000** |
| | duration | 8/8 | **1.000** |
| | timeline_kinds | 112/153 | 0.732 |
| | key_counts | 654/1368 | 0.478 |
| | curve_kinds | 507/1368 | 0.371 |
| | event_keys | 4/5 | 0.800 |
| | draw_order | 7/8 | 0.875 |
| | deform | 8/8 | **1.000** |
| **events** 0.500 | names | 1/2 | 0.500 |
| | payloads | 1/2 | 0.500 |

## Reading

**The eight shots are the right eight shots, and they are the right lengths.**
`animations.count`, `animations.names` and `animations.duration` all read
**1.000** — 8/8 on each. The duration table came out of the brief's two rates and
was authored as exact thirtieths (`death` 148/30, `shoot` 12/30, and so on); every
one of them lands inside `diff`'s one-frame window. Nothing here was tuned:
those are the only values the two frame counts allow if the project is on a
30 fps grid.

**The bone tree is the reference's tree.** `bones.count` **18/18**, and both
name-agnostic measures — `depth_histogram` and `degree_sequence` — read
**1.000**. That is the same tree, of the same size, with the same shape, arrived
at from the art alone. And 17 of 19 names match, with `parent_by_name` at 17/18:
§10.1's *"when the art is named after the parts, the art's names are the rig's
names"* is doing exactly what it promises, and it is by a distance the largest
single thing this run got from the guide.

**`attachments` at 0.955 is the same fact again**, one level down: 26 of 30
attachment keys match, `region_size` 26/29 (rigc measures every PNG, R5), and
`skins` 1/1. The four mesh measures read 1.000 because neither side has a mesh —
that is an agreement, not an absence.

**`constraints` 1.000.** The reference has none and neither does this rig. §13 of
[`LOOP.md`](LOOP.md) records that as a decision not to guess rather than a lucky
one; rung 8 made the same call and it went the other way on one of its two
skeletons.

**`key_counts` 654/1368 is the run's clearest own-goal, and it is rung 8's
finding reproduced under different machinery.** The reference carries roughly
**half** the keys this rig does. I did not aim at a density — §10.6 is right that
no public page gives one — I aimed at a tolerance, 0.8 px at each bone's lever
arm, against a pose series that was *fitted per frame*; and a sub-pixel tolerance
against a fitted series asks for far more than a hand-animated shot contains. The
trade was measured (7 shots, before `death` landed):

| tolerance | keys | `check` mean over 14 sets |
| ---: | ---: | ---: |
| 0.4 px | 872 | 41.71 |
| **0.8 px** | **779** | **41.85** |
| 1.6 px | 694 | 42.44 |
| 3.0 px | 609 | 44.58 |

0.8 px was shipped because MAE is flat between 0.4 and 0.8 and rises after. A
tolerance chosen to hit the reference's density instead would have cost about
2 MAE and would have been aiming at a number the frames do not carry.

**`curve_kinds` 507/1368 has the same shape and one extra cause.** Every span
this run could not describe with a straight line got a Bezier from the ten-entry
table (§10.4 🧩), and `LINEAR` was written only where linear genuinely fit best —
so the *kinds* are right in character and there are twice as many keys carrying
them. Rung 6 scored 34/539 on this measure by keying everything linear; that is
the failure this one is on the other side of.

**`animations.draw_order` 7/8 is a real finding and the frames could not give
it.** One reference animation carries a draw-order timeline and none of mine
does. The brief's own search came up empty over both skeletons, and §11's
like-for-like test found no frame where a different order pays by more than the
objective's own scatter. Eight shots, one of them re-orders; nothing in 132
frames says which.

**`events` 0.500 — one of the two names is the reference's.** Two were declared,
`footstep` and `shoot`, and `event_keys` reads 4/5, so the firings are nearly the
right count in the right animations. The one that missed is a naming coin flip
the brief deliberately does not resolve: *"This brief does not tell you how such
a moment is spelled — that is in the export and it is out of bounds — only where
the moments are."* This is the honesty rule's price, paid in public and worth it.

**`slots.order` 12/21 and `bones.order` 9/18 are declaration order**, not draw
order being wrong: `slots.count` is 20/21 and `slots.bone` 18/21, so the same
slots hang off the same bones — the array is written in a different sequence.
Draw order itself was tested like-for-like (§11) and every edge the objective
could decide, this rig has.

**The MAE figures need [`LOOP.md` §7](LOOP.md) beside them.** Two *reference*
frames of `run` one twelfth of a second apart differ by **88.2** in these units;
`idle` at 23.5 and `walk` at 47.8 are inside a frame of the truth, and `hit` at
58.5 — five frames of a figure recovering from horizontal — is the worst shot in
the set. Some of every number is framing: only 3 of 16 sets took `frames.json`'s
own box, and pinning it by hand gives, for the same skeleton and no key changed,
`death` 38.87, `jump` 38.83, `run` 44.53, `shoot` 37.03, `walk` 32.18, `hit`
49.42, `aim` 41.22, `idle` unchanged at 23.53 — `ess/check-pinned.txt`. The
unpinned figures are the ones quoted above, because those are the ones `bench`
prints.

## Known-wrong

1. **The pose fit is not exact, and `run`, `hit` and `death` are the worst of
   it.** The fit is a 17-parameter search per frame against a picture; on the
   shots whose limbs are furthest from the stance it lands inside a frame of the
   truth but not on it. The calibration that says what "inside a frame" means is
   in [`LOOP.md` §7](LOOP.md) and is worth reading before any absolute MAE here:
   two **reference** frames of `run` one twelfth of a second apart differ by
   **88.2** in the same units.
2. **`check` measures almost every set in a fitted framing, not in the frames'
   own box.** The candidate is authored in the reference's own world coordinates
   and lands there to within a tenth of a pixel — but the box is only accepted
   when the candidate's own extent lands on the reference's to within a pixel,
   and a pose that is a pixel out anywhere fails that. Rung 8's two-part rigs
   cleared it; a fitted character does not. Some of every MAE below is therefore
   the framing, and `--viewport` was **not** used to hide it.
3. **`muzzle01`'s scale is a floor, not a measurement.** f2's flare is the
   faintest of the three and the objective barely constrains it; an unclamped fit
   walked it to 13x. It is solved against the brief's box width like the other
   two, and it is the least well determined of the three.
4. **`eye-indifferent` and `mouth-grind` are coin flips.** The goggles cover the
   eyes on every frame and the mouth is 6–8 px across; the brief says outright
   that which shot uses which is not readable. They are the setup pose and
   nothing keys them.
5. **No bounding box.** The brief devotes a numbered item to hit regions and is
   equally clear that the frames cannot show one. Left unauthored on the rule
   every other omission here follows. It is the run's most arguable omission.
6. **Keys land on the 12 fps grid.** The committed frames are the only samples
   there are, so a key can only be placed where one was measured; the 30 fps sets
   ship two stills, both of which coincide with a 12 fps sample. What happens
   *between* two committed frames is authored by the easing table and is not
   checkable against anything.
7. **`front-upper-arm` in front of the torso, and `eye` before `mouth`, are
   reasoning rather than measurement.** Both edges came back inside the
   objective's own scatter — [`LOOP.md` §11](LOOP.md) prints the numbers.

## Notes for the guide

Five things this run had to find out by failing. Each is in
[`LOOP.md`](LOOP.md) with the numbers.

1. **§9.1's `bone.pose` trap has a twin one level up.** The setup transform lives
   on `bone.data.setupPose`, not on `bone.data`, so `bone.data.rotation` is
   `undefined` and every arithmetic on it is `NaN`. The symptom was a placements
   file full of `null`, a candidate at MAE 114.6 and a green gate throughout.
   A run that drives the runtime touches `BoneData` as surely as it touches
   `Bone`. (§4.1)
2. **A region attachment caches its own offsets.** `attachment.x/y/rotation`
   change nothing until `updateSequence()` is called. 4,500 renders reported the
   same number before this surfaced. (§4.2)
3. **§10.3's gauge fold needs its precondition stated beside it.** A rotation
   gauge is exact only when the bone's children sit at its own origin. This rig's
   hip has three children 9–13 units off it, so the fold §10.3 prescribes
   *changes the picture* — it cost 3 MAE on every `idle` frame before it was
   removed. The soft degeneracy that remains wants a penalty, not a fold. (§5)
4. **Nothing in the guide says how to get a pose for a figure with a dozen
   joints, and the two things that decide whether that search converges are not
   guessable.** A full-resolution difference is flat where it matters — sweeping
   the hip alone over ±60 × 200 units against `jump/f0001` never leaves 80…117 —
   so the search has to compare at a reduced resolution first; and a line search
   from where a knob sits cannot turn an arm 60°, so each knob needs its whole
   range scanned. Together they took `run` from a mean of 50.2 to 45.8 and
   stopped it producing figures with their legs folded under them. §8 and §9 both
   assume a pose already exists. (§6)
5. **A union-mean objective can be gamed by making the union bigger.** `mae`
   divides by the pixels either side drew, so a large, mostly transparent sprite
   adds many cheap pixels and the *mean* falls. The muzzle flare found that hole,
   walked its scale to 13x, pushed this candidate's union 32 px wider than the
   reference's, and cost **every** set in `check` its framing (shared-fit rms
   13.98 px → 7.08 px once fixed). `check`'s own MAE has the same denominator; it
   is the right one for comparing two builds and the wrong one to optimise
   against. (§8)

And one about the brief, not the guide: **[`LOOP.md` §12](LOOP.md) reports a
contradiction inside `bench/briefs/spineboy.md` revision 2** — the gun is said to
be in the near hand, while the brief's own `death` paragraph establishes the rule
(a fist means the near arm) that puts it in the far one. It is a behavioural
claim, which is the class the verification pass exists to catch and the honesty
rule cannot.
