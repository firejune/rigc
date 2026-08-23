# spineboy — attempt 2, the loop

- date:      2026-08-23
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK, fresh session,
             in its own `git worktree` (`bench/spineboy-run2`)
- skeleton:  **`ess` only.** `pro` was not attempted — the rung clears on `ess`
             and `pro` is a stretch figure
- inputs:    `bench/briefs/spineboy.md` (revision 2, third-party verified),
             `docs/AUTHORING.md` in full, `bench/runs/README.md`,
             `bench/reference/spineboy/ess/` (8 sets, 132 frames at 12 fps, and
             the 30 fps stills), `examples/spineboy/images/` (40 PNGs),
             this repository's source (`src/render.ts`, `src/rig.ts`,
             `src/types.ts`, `src/check.ts`, `src/diff.ts`, `tools/plate.ts`)
- reference: **not read.** See §1
- guide:     AUTHORING.md §10 in hand — this run is after the 2026-08-23
             boundary, so its convention measures are not comparable with a run
             authored before it
- profile:   spine
- atlas:     `examples/spineboy/export/*.atlas` was **not** opened. rigc emits
             its own one-part-per-page atlas from the loose PNGs, so the run
             did not need it (the allowance in `bench/runs/README.md` item 4
             says to say so and skip it)

## 1 — Honesty

Read: the brief; the frames and their `frames.json`; the art; `docs/AUTHORING.md`
in full; `bench/runs/README.md`; the run protocol's process notes in
[`2026-08-23-rung8-1/README.md`](../2026-08-23-rung8-1/README.md) and its
`LOOP.md` §3, §7, §8, §9 (method only — a different rung); this repository's
source as documentation of the formats.

Not opened: `examples/spineboy/export/` (its `.json` **and** its `.atlas`),
`bench/transcriptions/`, `docs/LADDER.md` (any part — this run did not need the
two sections it is allowed, and the status table and per-rung sections are the
leak the previous attempt was caveated for), `docs/SPEC_COVERAGE.md`,
`src/ladder.ts`, `bench/render_reference.ts`, any issue body, any git history,
and **`bench/runs/2026-08-23-spineboy-1/`** — the previous attempt at this rung,
which the prompt forbids outright.

No incident to report. One thing worth recording that is *not* a breach: the
session's own prior knowledge of Spine's public example projects was
deliberately not used as a source of names — every name in this rig is derived
from the art's own filenames (§10.1's "the art's names are the rig's names"),
and the bone tree is the one the parts imply.

**A defect in an allowed document, reported rather than used** — see §12.

**Two disclosures at the finish line**, neither of which could reach the
authoring:

- `bench` was invoked **twice**, back to back, with **no edit between them and
  none after**. The first call omitted `--frames` and printed no `check` table,
  which the protocol asks a run to record; the second added it. Both printed the
  same `ess` diff line, and it is quoted from the second.
- `git log --oneline -1` was run **once**, after the run record was committed,
  to read back the subject of this run's own commit. Git history is on the
  forbidden list because the transcription commits are in it; a single subject
  line this session had written seconds earlier is not that, and it came after
  the finish line. Recorded because the list says git history, not "git history
  except the bit you just wrote".
- `bench.json`'s own `gates` field carries `src/ladder.ts`'s gate string, which
  is on the forbidden list — it names the reference's bone, slot and animation
  counts. It arrived **in `bench`'s output at the finish line**, which is the one
  place the protocol licenses, and after the last edit to any spec. Recorded
  because a number that reaches an agent is worth recording whichever file it
  came in.

## 2 — Method, in one paragraph

The rig's structure is read off the art (§10.1); every number in it is fitted by
**rendering the candidate into the frames' own viewport and minimising the
difference** (§8's *"look for a second way to get the same number"* applied to a
whole pose, and §9.1's note that this sends you past `check` into your own render
loop over `spine-core`). The setup pose is fitted against `idle/f0000`, then
re-fitted against ten frames drawn from every shot at once, because a wrong
offset can hide inside a single frame's own bone rotations and cannot hide across
frames. Each of the 132 committed frames then gets its own pose. The series are
key-reduced last, under one tolerance declared in pixels at each bone's lever arm
and a named easing table planned in the two passes §10.4 requires. Every script
is in [`tools/`](tools/).

## 3 — The art decides the rig, and it decides one thing the brief gets wrong

`examples/spineboy/images/` ships 40 PNGs; 29 of them are the ones `ess` can
show (the hoverboard's three and the portal's seven appear only in shots `pro`
has, and the crosshair only in `pro/aim`). §10.1's rule — one image, one
attachment, one slot, named for the image — gives 21 slots directly, with five
of them holding alternatives that are never on screen together: two eyes, three
mouths, two fists, five numbered muzzle flares.

The bone tree is the one those parts imply: `root → hip → {torso → {neck →
head, rear-upper-arm → rear-bracer → gun → muzzle, front-upper-arm →
front-bracer → front-fist}, rear-thigh → rear-shin → rear-foot, front-thigh →
front-shin → front-foot}`. 18 bones.

⚠️ **The gun hangs off the *rear* arm, and this contradicts the brief.** The
brief says twice that the gun is *"held … in the near hand"* (`idle`, `walk`).
The art says otherwise and the brief's own `death` paragraph says otherwise:

- `gun.png` is not just a gun. It carries a **gripping hand** — a dark glove with
  four grey fingers wrapped round the grip — so whichever arm holds the gun needs
  no separate hand art.
- The art ships `front-fist-closed` and `front-fist-open` and **no rear fist**,
  which is the brief's own evidence in `death`: *"the raised hand is an open
  fist, and the art ships a fist only for the near arm"*.
- In `idle`, `aim` and `death` a fist is drawn **free of the gun** — hanging at
  the figure's left in `idle`, below the barrel in `aim`. Two hands are on
  screen: the gun's own, and a fist.

Fist ⇒ near arm (the brief's rule); the fist is not the hand on the gun
(measured, and visible at 5x); therefore the gun is in the **far** hand. Both
statements cannot be true, and this one is reported rather than used — see §12.

Draw order is then the ordinary one for a side-on character, with the gun's slot
lifted out of its bone's chain: rear arm, rear leg, neck, torso, head and face,
**gun**, muzzle, front leg, front arm. That is §10.2's own reason for slots
existing — *"slots decouple bones from the draw order"* — and it is what makes
the brief's one measured edge (the near leg is in front of the gun in `walk`)
compatible with the gun reading unoccluded in `idle`.

## 4 — Three turns lost to the runtime and to `rigc`'s own shapes

**4.1 — `bone.data.setupPose`, not `bone.data`.** §9.1 warns that a bone's local
transform lives on `bone.pose`; the same is true one level up. `BoneData` extends
`PosedData` and the setup transform is on `bone.data.setupPose`, so
`bone.data.rotation` is `undefined` and `undefined + delta` is `NaN`. The symptom
was not a crash: the setup fit wrote `"px": null` into its own placements file,
the next build read those as zero, and the candidate's MAE went 13.0 → 114.6
while every gate stayed green.

*Guide note: §9.1's paragraph is about `Bone`. `BoneData` has the same shape and
the same trap, and a run that drives the runtime touches both.*

**4.2 — a region attachment caches its own offsets.** Moving `attachment.x/y/
rotation` changes nothing until `updateSequence()` is called; the first setup fit
ran 4,500 renders and reported the same MAE for every one of them.

**4.3 — `Piece.world`, not `Piece.vertices`.** Cost one line.

## 5 — The gauge §10.3 warns about is not a gauge in this rig, and the check matters

§10.3 says to fold a rotation gauge out before the series becomes keys, and names
the shape: a bone that carries no art with every moving bone under it. `hip` is
that bone here, so the first fitter folded the median of `torso`,
`front-thigh` and `rear-thigh` back into it after every frame.

**That fold changed the picture.** An exact rotation gauge needs the children to
sit *at the parent's origin*; the hip's three children sit 9–13 units off it, so
turning the hip moves their origins and the render. Folding cost MAE on every
frame it touched (`idle` mean 23.0 with the fold against 19.9 without, same
search). What is real here is a **soft** degeneracy, and it is guarded instead by
a penalty of 2e-5 per squared degree — invisible at animator-sized angles, and
decisive against the 180° turn against a 180° counter-turn §10.3 measured on the
previous spineboy run.

*Guide note: §10.3's prescription is right and its precondition is worth stating
next to it — "children at the bone's own origin" is what makes the fold exact,
and a fan of children at different offsets is a different (weaker) problem.*

## 6 — The objective a search can walk, and the two changes that made it one

A whole-frame difference is a **terrible** objective for a 17-parameter pose on a
100 × 150 px character, and it took three rebuilds of the fitter to see why.

**6.1 — the landscape is flat where it matters.** Sweeping the hip alone over
±60 × 200 units against `jump/f0001`, the full-resolution figure never leaves
80…117. Every gradient a coordinate search can see there is noise, so the search
reported "no improvement" and left the frame at a pose with almost no overlap
(`run` measured a mean of **50.2** that way).

⇒ **Fixed by a pyramid.** Both sides are box-averaged before they are compared,
and the search runs coarse to fine: block 8 places the body, block 4 the limbs,
block 2 and block 1 the pixels. The same hip sweep at block 8 runs 44.7…78.2 —
a gradient with a slope on it.

⚠️ Block 8 is deliberately **not** used for limbs: at 1/8 the whole figure is
about 13 × 19 cells and a shin is one of them.

**6.2 — a line search cannot turn an arm 60°.** Even with the pyramid, a search
that steps out from where a knob currently sits never reaches a limb angle that
far away, because the first step overlaps nothing either. Replacing every line
search with a **global scan of the whole plausible range of each knob** — about
45 renders each — is the change that made the fit work: `run` went **50.2 →
45.8** mean, and the visible failure (legs folded under the body) stopped.

**6.3 — the arm needs two knobs at once.** The gun hangs three rotations below
the shoulder, and no single knob puts it in the right place. A 2-D scan over
each of `rear-upper-arm × rear-bracer`, `rear-bracer × gun` and
`front-upper-arm × front-bracer` is worth another point and a half.

*Guide note: §9's `check` and §8's like-for-like both assume you already have a
pose. Nothing in the guide says how to get one for a figure with a dozen joints,
and the two things that decide whether that search converges — comparing at a
reduced resolution first, and scanning a knob's whole range rather than stepping
from where it sits — are not obvious enough to be left to each run to rediscover.*

## 7 — A control that stopped this run reading its own numbers wrong

For two hours the fitted figures for `run` looked like a failure: mean MAE ~46,
against ~13 for the setup pose on the frame it was fitted to. The number that
settled it is the **reference against itself**:

| pair | MAE |
| --- | ---: |
| `run/f0002` vs `run/f0003` (adjacent reference frames) | **88.2** |
| `run/f0002` vs `run/f0006` | 51.5 |
| `run/f0002` vs `idle/f0000` | 100.8 |
| `idle/f0000` vs `idle/f0010` | 50.5 |
| this run's fit, `run` mean | 45.9 |
| this run's fit, `idle` mean | ~20 |

At this subject size a one-frame error costs **88**, so a fit at 46 is inside a
frame of the truth and a fit at 20 is well inside one. **The metric's own scale
is a fact about the shot, not about the rig**, and reading an absolute MAE
without it is how a run talks itself into rebuilding something that works. The
drawn-pixel counts agree independently: `run/f0000` reference 5,882 against
candidate 5,874.

## 8 — The muzzle flare is drawn far larger than its art

`shoot` is the only shot that shows the flare, on three committed frames (166 /
1,659 / 717 flare pixels — the brief's figures, reproduced). Placed at one world
unit per art pixel, `muzzle03`'s 166 × 106 art is **37 × 24 frame pixels**; the
reference's flare reaches column 354 and is about **130 px** across. So the shot
**scales** it, and the scale is keyed — which is a decision the pixels force and
the brief could not tell you, since it says outright it cannot say how the five
numbered flares are divided between parts.

Fitted per flash frame on the `muzzle` bone, with the flare's own offset held at
half its width so the scale grows it away from the barrel rather than through it:

| | f2 (`muzzle01`) | f3 (`muzzle03`) | f4 (`muzzle04`) |
| --- | ---: | ---: | ---: |
| fitted scale | 5.93 ⚠️ | 2.55 | 3.94 |
| that frame's MAE | 26.5 | 34.2 | 23.4 |

⚠️ `muzzle01`'s scale sits **on the clamp** (0.4…6, imposed after an unclamped
run walked it to 13.1). f2's flare is the faintest of the three, so the objective
barely constrains it; the number is a floor, not a measurement, and it is in
*Known-wrong*.

Drawing the flare at all is worth **36.7 → 28.0** mean MAE over those three
frames. `muzzle-glow` and `muzzle-ring` are worth **0.08** between them, which is
§8's *"the same test knows when to stay silent"* — they are shipped on the
reasoning that the art ships them in the same group, and the log says that is
what happened rather than pretending the frames chose.

## 9 — Which attachment, where the frames can say and where they cannot

- **`front-fist`** — visible, and fitted per frame (open against closed, whichever
  renders closer). It is the one alternative the frames decide.
- **`eye`** and **`mouth`** — not keyed at all. The brief measured that the
  goggles cover the eyes on every frame of both skeletons and that the mouth is
  6–8 px across, and calls which shot uses which *"not readable here"*. Keying
  them would be inventing a timeline; the setup pose picks `eye-indifferent` and
  `mouth-grind` and nothing keys them. **Both are coin flips and are recorded as
  such.**
- **`muzzle`** — the five flares are stepped through the flash on the brief's own
  30 fps timing (tiles 5–11, brightest at 9): `muzzle01` at 5/30, `02` at 6/30,
  `03` at 7/30, `04` at 9/30, `05` at 11/30, hidden at 12/30. Sampled at 12 fps
  that shows the smallest at f2, the largest at f3 and a middling one at f4,
  which is the size series the brief measures.

## 10 — Events

Three moments, named as an animator would name them, placed where the brief puts
them and nowhere else: `footstep` twice in `walk` (13/30 and 28/30 — the first
30 fps tile at which the landing foot is down, half a second apart), `footstep`
twice in `run` (tiles 6 and 17), and `shoot` once in `shoot` (tile 5, where the
flare first appears). Nothing is keyed in `jump`'s landing or in `death`: the
brief names footfalls and the gunshot as the moments a game wants, and inventing
a third kind is inventing an event name.

⚠️ Worth knowing while reading the measures: `diff` compares **event names and
payloads**, and counts firings **per animation** — it does not compare their
times. So the two names are the whole bet here.

## 11 — Draw order, tested like-for-like

§8's second test: render the candidate both ways and measure the same feature on
both sides. Run over `idle`, `walk`, `run`, `jump` and `shoot` (73 frames), with
each slot moved to every other position in the array in turn. Base = 32.306 mean
MAE; the numbers are the change.

| edge | worst violation | verdict |
| --- | ---: | --- |
| `eye` behind `goggles` | **+1.95** to draw it over them | **decided** — the goggles' lens is opaque and the eye never shows |
| `torso` in front of the rear arm and rear leg | +0.13 … **+0.32** | **decided** |
| `rear-upper-arm` behind the torso and head | **+0.21** | **decided** |
| `gun` in front of the rear arm | **+0.28** | **decided** |
| `gun` behind the front leg | +0.05 | **weak** — but it is the one edge the brief measures directly (the gun's own teal drops from 322–338 px to 36 px at `walk` f6), and the sign agrees |
| `front-upper-arm` in front of the torso | −0.076 for the *other* order | **not decided.** 0.23 % of the objective, and pointing the wrong way. §8's own rule says a difference this small is not a quiet vote — it is shipped in front on the reasoning that the art's near-side limbs are the near-side ones, and this line is here so the reader knows that is reasoning and not measurement |
| `eye` before or after `mouth` | −0.077 | **not decided.** Same reading |

## 12 — A defect in an allowed document

`bench/briefs/spineboy.md` (revision 2, third-party verified) says the gun is in
the **near** hand, twice:

> `idle` — *"The figure stands facing right, gun held across him in the near hand"*
> `walk` — *"The gun rides in the near hand and swings with the arm."*

and elsewhere, on evidence, establishes the rule that contradicts it:

> `death` — *"The arm that lifts off the chest and waves is the **near** one, and
> the frames say so: the raised hand is an open fist, and the art ships a fist
> only for the near arm."*

`gun.png` carries its own gripping hand, and a **second** hand — a `front-fist-*`
— is drawn free of the gun in `idle`, `aim` and `death`. If a fist means the near
arm, the arm holding the gun is the far one. The two claims cannot both hold.

This is a **behavioural** claim rather than a digit, which is the class
`bench/runs/README.md` says the verification pass exists to catch, and the class
the honesty rule cannot. It is reported here rather than used: this rig hangs the
gun off the rear arm, which is what the art supports, and says so in §3.

## 13 — Constraints, meshes, draw-order timelines: not authored, and why

- **No constraints.** A constraint draws nothing, so no frame can show one
  (§9.3), and `bench` scores `constraints` all the same. Rung 8 shipped the same
  decision and it won on one skeleton and lost on the other; there is no reading
  of these pixels that could choose. Not guessed.
- **No meshes.** Every part of this figure is rigid in every frame: nothing in
  `ess` bends, and a region posed by its bone renders what the frames show. §9.3
  is explicit that the frames cannot tell a deformed hull from a posed one and
  that `bench` can, so this is written down at the moment it was decided rather
  than met in the measures.
- **No `drawOrder` timeline.** The brief's search for a draw-order *change* came
  up empty over both skeletons, and §11's like-for-like test found no frame where
  a different order pays. A timeline with no key is not the same as no timeline.
- **No bounding box.** The brief's §3 devotes a numbered item to hit regions and
  is equally explicit that the frames neither confirm nor deny one. It is left
  unauthored on the same rule every other omission here follows — do not author
  what the frames cannot show — and because a polygon is a coin flip that costs a
  measure whichever way it falls. **This is the run's most arguable omission**,
  since §3 reads like an invitation, and it is in *Known-wrong*.

## 14 — The finish line

```
bun cli.ts build --rig bench/runs/2026-08-23-spineboy-2/ess/spineboy-ess.rig.json \
  --motion bench/runs/2026-08-23-spineboy-2/ess/spineboy-ess.motion.json \
  --images examples/spineboy/images --out bench/runs/2026-08-23-spineboy-2/ess/spine \
  --profile spine
→ green. 0 FAIL. Under `build` the report is 17 PASS, 2 SKIP (`A31` — no
  drawOrder timeline; `A33` — no bounding box and no clipping attachment) and
  14 PROF (the renderer and archetype rules `--profile spine` excludes). Under
  `bench`'s own `validate`, which re-gates the artifacts on disk with no motion
  spec beside them, it is 16 PASS and 4 SKIP — `A09` has no declared duration to
  compare against and `A18` has no inputs to recompile.

bun cli.ts check --candidate …/ess/spine --frames bench/reference/spineboy/ess
→ ess/check.txt

bun cli.ts bench spineboy --candidate …/ess/spine --frames bench/reference/spineboy/ess \
  --json ess/bench.json
```

The summary line is quoted verbatim in [`README.md`](README.md), `ess` only.

### What the finish line said that the loop could not

1. **`bones.count` 18/18 and both name-agnostic bone measures 1.000.** The tree
   built from the art alone is the reference's tree — same size, same depth
   profile, same degree sequence — and 17 of its 19 names are the reference's
   names. Nothing in the loop could have told me that; `check` sees pixels and
   the gate sees validity.
2. **`animations.duration` 8/8.** The brief's two frame rates bracket each
   duration to one thirtieth, and every one of those eight guesses is inside
   `diff`'s window. That is the brief's measurement, not this run's.
3. **`key_counts` 654/1368.** The reference is about half as densely keyed.
   Measured, not felt: the loop's own tolerance sweep could see the MAE cost of
   coarsening and could not see the reference's density at all.
4. **`animations.draw_order` 7/8.** One reference shot re-orders its slots. §11's
   like-for-like test over 73 frames found no edge where a change pays — so this
   is a fact the frames genuinely do not carry, not a test that was run badly.
5. **`constraints` 1.000.** `ess` has none. The decision in §13 not to guess was
   the right one here; it is the same decision that lost rung 8 a section on its
   other skeleton, which is the point — it was not a bet either time.
6. **`events.names` 1/2.** One of `footstep` and `shoot` is the reference's own
   name. The brief says outright it will not tell you how a moment is spelled.

## Notes for the guide

Collected in [`README.md`](README.md), *Notes for the guide* — five things this
run had to find out by failing (§4.1, §4.2, §5, §6, §8), and one contradiction
inside the brief (§12).
