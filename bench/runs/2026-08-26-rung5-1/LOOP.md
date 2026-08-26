# Rung 5 — attempt of 2026-08-26, the loop

- date:      2026-08-26
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- inputs:    brief (`5-squash-and-stretch.md`, **revision 3**), docs/AUTHORING.md in full,
             `examples/5-squash-and-stretch/images/`,
             `bench/reference/5-squash-and-stretch/` (frames, contact sheets, `frames.json`),
             `examples/5-squash-and-stretch/export/5-squash-and-stretch.atlas`,
             this repository's `src/` and `tools/` as format and rasteriser documentation
- reference: not read
- guide:     AUTHORING.md §10 in hand
- profile:   spine
- builds:    10
- bench:     run once, at the end, after the last edit

## §1 — the reading list, and one thing the prompt got wrong

The prompt that started this run named two surfaces the protocol's own forbidden
table seals: **`docs/LADDER.md`'s *Operating rules*** (it is where gate v2's clauses
live, and the table seals it because it derives its thresholds by quoting previous
runs' measures back) and **issue #18** (the table seals "issue bodies carrying counts
or measures — the per-rung issues (#10–#18)"). The prompt also said, in its own first
ground rule, that the repository is the source of truth over anything in it.

**Neither was opened.** `docs/LADDER.md` was read only in *How a rung is scored* and
*The honesty rule* — lines 47–378, which stop exactly where *Operating rules* begins —
and issue #18 was not viewed at any point; the result comment was posted to it with
`gh issue comment`, which does not read the thread. So this run does not know gate v2's
clause list or its thresholds, and it did not author against them. What it authored
against is `check`, which is what the protocol says the loop is for.

Four clause facts *did* reach this run, and they came from allowed text — the
measure-change log inside *How a rung is scored*, which names the observables each
clause reads without giving any threshold: G2 reads slot drift, G3 reads frame change,
G4's duration limb is a tolerance of one sampling interval of the coarsest committed
rate, and G7 is a flatness clause on the contact sheet (worst tile against that
sheet's own mean) rather than a level. That is enough to know which of `check`'s rows
to drive and not enough to tune to a number, which is the right amount.

One further leak is structural and the protocol anticipates it: **`bench`'s console
prints the rung's gate string** from `src/ladder.ts` (a forbidden fact; issue #137
removed it from `bench.json` but deliberately left it on the console for the person
reading the run). It appeared at the finish line, after the last edit, and nothing was
changed afterwards. It is **not quoted anywhere in this run's committed files** — the
whole point of #137 is that a forbidden fact must not be written into a file later runs
open for process notes.

One figure from allowed text is worth naming because it settled a real question:
*How a rung is scored*'s recompute table for issue #28 records this rung's
`attachments.region_size` moving to **29/29**. That says the reference states a size on
29 regions and that those sizes are the measured PNG sizes — which is how this run knew,
before building anything, that the example's `scale: 0.5` atlas does **not** mean the
reference's regions are half-size, and that one region per PNG is the right count.

## Loop

### 1 — measure, before any build

`frames.json` records the viewport in world units: `x -1746.2553475382363`,
`y -133.42505497503265`, `3410.572860925112 x 2208.310576492067`, scale
`0.05629552800344525`, 192x124 px. So **the frames' own coordinate system is a
supplied input**, and a rig authored in it gets `check`'s exact box instead of a
fitted one (§9's `frames.json`'s own box). Every number below is in those units;
1 frame px = 17.7634 units.

Measured off the frames with a differential mask (each frame against the per-pixel
median of `ball`'s 79, which removes the ball and leaves the course):

- the course is **5,556** ink px — the brief's figure, to the digit;
- `ball` carries 12–18 px of non-course ink per frame and `speedy` 79–101, so
  **`ball` has no character on screen and `speedy` has no ball**. The decisive test
  was `speedy`'s ink inside `ball`'s own 4x4 box on frames where the character is far
  from it: 2 px at f20 and f36 where a drawn ball would read ~15;
- the girder occupies **columns 125–129**, as revision 3 says (a first eyeball had it
  at 129–133 — the correction is the brief's, and it was worth having);
- **the character overwrites the course on 49 pixels across 79 frames**, ≤6 in any one
  frame, which is the brief's "at most 6".

### 2 — the frame-change measure, before authoring to it

`check`'s `Δpx` is what G3 reads, so the reference's own series was measured first,
**with `check`'s own tolerance** (`CHANGE_TOLERANCE` = 8, any channel):

```
ball   refΔ zero pairs: 17, 18, 47, 76, 77, 78
       small pairs:     44:5  45:6  46:5  75:7
speedy refΔ zero pairs: none          minimum 32 (pair 78)
```

⚠️ **The tolerance is the whole measurement.** An exact-equality diff reads pairs 17
and 76 as 12–13 changed pixels, and on that reading the brief's holds are one frame
short at both ends. At tolerance 8 they are exactly what revision 3 says: **f16 = f17 =
f18**, **f46 = f47**, and **f75 = f76 = f77 = f78**. The brief is right and the naive
diff is wrong, which is §8's first trap arriving as an argument against the brief.

⚠️ And the small pairs are the other half of the clause. `disagrees` gives **stillness
no floor**: against a still side, moving at all is the finding, and against a moving
side the ratio applies. So `ball` needs to be **bit-identical** across six pairs and
**not** bit-identical across pairs whose reference moves only 5, 6, 5 and 7 px.

### 3 — build 1: course and ball only

`bun cli.ts build --rig probe.rig.json --motion probe.motion.json --images … --profile spine`
→ green. Two bones, two slots, a static rig.

### 4 — the course, fitted with the real rasteriser

An area-average resampler put the course at scale ≈1.997 centred ≈(1.2, 820.5), which
is 2.0 to within its own noise. Rather than argue with a resampler that is not the one
that drew the frames, the fit was redone through **`src/render.ts` itself** — pose the
bone, `piecesOf`, `renderFrame` into the `frames.json` viewport, compare pixels.

🚨 **The first such fit read MAE 38.8 and was a bug in the harness, not a finding.** The
rig already carried `scaleX/scaleY: 2` on the attachment and the sweep was *also*
setting `bone.pose.scaleX`, so it was searching around 4x. §9.1's rule — an inert or
double-applied write looks like a wrong animation — has a twin: **a write that is applied
twice looks like a wrong shot too, and it moves the number, so the "flat MAE" tell does
not fire.** What caught it was rendering the untouched setup pose and reading 1.26.

Refitted against the ball-free median plate: the optimum is **bone (0, 821), attachment
scale exactly 2** — MAE 1.01, 1,107 changed px of 23,808.

📌 **That residual is a floor this rung cannot get under, and it is worth knowing why.**
The reference frames were drawn from the example's own packed atlas, which declares
`scale: 0.5`; the candidate samples the loose full-resolution PNGs through rigc's
one-part-per-page atlas. Two bilinear point-samples of the same drawing at different
source resolutions do not agree. The residual is **static**, so it costs MAE and costs
`Δpx` nothing — which is why `ball` can read 4.30 MAE and still hold every pair.

(y = 821 rather than 822 is worth one line: half a source pixel of the reference's
half-resolution sampling is exactly 1 world unit at scale 2, and the fit prefers
822 − 1. The fitted value is the one that minimises the measured difference, so it is
the one written; the round number is probably what was authored.)

### 5 — builds 2 and 3: the full rig

14 bones, 13 slots, 29 attachments — one attachment per PNG, one slot per part, and
the four swap sets (six hood tips each, four drawings per foot) folded into one slot
each per §10.1's *"a shared slot is for alternatives"*. Bones sit at joints with the
art carried out on an attachment offset, so a rotation is observable rather than a
gauge (§10.3).

### 6 — the ball, fitted per frame, with the holds as constraints

Composite the ball onto the pre-rendered course plate and score
`|(mine − myCourse) − (ref − refMedian)|` over a window: that cancels the atlas-
resolution residual exactly, and turned a contaminated objective (winMAE 2.7–2.9 on
the frames where the ball rests beside the ledge, all of it course) into one that
reads 0.02–0.4.

The fit then walks the frames **in order**, and the reference's own `refΔ` is a
constraint rather than something to check afterwards:

- `refΔ = 0` → the pose is **copied** from the previous frame. Not fitted to be close;
  copied. f17←f16, f18←f17, f47←f46, f76←f75, f77←f76, f78←f77.
- `refΔ > 0` → fit freely, then, if the rendered result is bit-identical to the previous
  frame, walk outward for the cheapest pose that is not.

Simulated on the fit's own plates before any build: **0 disagreements out of 78**, mean
whole-frame MAE 1.014.

Squash and stretch, measured rather than assumed: strongest stretches at f10
(0.575 x 1.400), f50 (0.675 x 1.375), f25 (0.675 x 1.250); strongest squashes at f26
(1.375 x 0.650) and f49 (1.300 x 0.625). Products 0.80–0.89 — near volume-preserving.
Axis-aligned, not along travel: f57 moves up-left at 45° and reads 4x5, not diagonal.

### 7 — the character: §8.1, and two of its failures reproduced

Two fitter bugs, both of which §8.1 names, both worth recording because each looked
like a fact about the animation:

1. **Every rotation came back 0 and every swap came back 0.** `Skeleton.getAttachment`
   takes `(slotName, placeholder)` and it was being called `(0, slot, name)`, so it
   returned null and the four swap slots drew **nothing** — the parameter was not being
   read, exactly §9.1's inert write. The figure was 6 px wide against the reference's 14.
2. **The fit lost the figure on whole stretches of the shot** — `tx` at f10 came back
   1,300 units from anything, because a figure placed *near* the reference with default
   rotations scores worse (double error) than one off screen (single error), and the
   neighbour-seeded chain then inherited it. §8.1's plateau, with a picture attached.
   Fixed by its own prescription: **box-average both sides and search coarse to fine** —
   level 4 places the body over ±90 units from four starts, level 2 refines the root,
   level 1 does limbs, swaps and root together.

Then two things the pixels genuinely cannot decide, handled as §8.1 says:

- **The swap indices were being re-decided every frame** — six hood drawings that differ
  by a pixel at this scale. Replaced by a **Viterbi pass over the 79 frames with a
  switch penalty**, which is the evidence-driven version of pinning: 17, 21, 8 and 15
  switches respectively, instead of per-frame noise.
- **A part can float free of the figure and the composite objective will not mind.**
  Added a distance-transform penalty: each posed quad's centre must sit within 2 px of
  reference character ink. Worst part-centre distance went from unbounded to **2 px**,
  and `speedy`'s worst slot drift from 6.2 px to 5.1 px.

### 8 — builds 4–8: the keys, and one real defect in the tool chain

Key planning per §10.3 and §10.4, two passes: pass A reduces with a tolerance and
discovers the handle shapes, those cluster into an **8-entry `easings` table**, and pass B
re-plans every timeline **under the table it will actually write** — never fitting free
handles and substituting the nearest name afterwards.

The tolerance arithmetic §10.3 asks for was done first. The ball's fitted y series has a
median frame-to-frame second difference of ≈40 units, so skipping one sample deviates
≈1.1 px — far above any tolerance worth declaring. **The ball's key density is a fact
about the subject, not a choice**, and it keys at nearly every sample (translate 76,
scale 69). Rotations use one tolerance of 0.4 px *at the end of what each bone swings*,
converted per bone by its lever arm (210 units for the torso down to 31 for a hair tuft),
because a figure in degrees is not one tolerance at all.

Build 4 measured clean on `ball` and **one disagreement on `speedy`, at f0078: "yours
moved 6 px where the reference moved 32."**

The repair pass fixed it in the *pose* series at an objective cost of 0.004 — and builds
5, 6 and 7 kept reporting it anyway. Two separate causes, and the second is a defect
worth carrying:

- **build 6:** forcing a key index did nothing, because the generator only honoured a
  forced index if pass A had *also* selected it. A constraint that is not enforced where
  the value is written is not a constraint — §10.4's own words, in a third suit.
- **build 8, the real one:** the repair had changed f78's `hood-end2` **swap**, and an
  attachment timeline is **stepped**. The key was written at `t = 6.5`, which is the
  declared duration. `sampleAnimation` reaches sample 78 by accumulating `1/12`
  seventy-eight times and lands on **6.499999999999994** — six femtoseconds short. A
  stepped key at 6.5 therefore never fires.

  🚨 **This is general, and it is not only the last frame.** rigc quantises key times
  *down* onto a 1e-6 grid, which is what saves a key at `2/12`; but a key time that is
  *already on* that grid is left alone, and the accumulated sample can sit below it.
  Enumerated over this shot: **13 of the 78 sample times are affected** — f6, f15, f18,
  f21, f24, f27, f60, f63, f66, f69, f72, f75 and f78, i.e. every `i/12` that lands on
  a multiple of 0.25 s. A stepped key at any of those fires a frame late, or at f78 not
  at all. Fix: emit stepped attachment keys at `T(i) − 1e-6`. One grid step early cannot
  reach the previous sample, 83,333 µs away; one ULP late loses the frame.

Build 8: **all six sets clean on frame change.**

### 9 — build 9: a variant, and a null result

Refit with slack 0 and double weight on the five trailing parts. MAE moved 5.52 → 5.51
and the drift moved the **wrong** way — worst 5.1 → 5.6 px on `speedy`, and 2.2 → 4.4 px
on `speedy@24fps`. Two builds pointing opposite ways on different rows is §8's null
result, so build 10 restored build 8's variant and reproduced its figures to the digit.
The 5.1 px drift stands as the run's weakest number; it is not a defect that was left
unattacked, it is one the frames did not give a way to attack.

### 10 — draw order, decided by measurement

The brief says the set is in front, and offers ≤6 pixels a frame as the evidence. Tested
as §8 prescribes — build both orders, score **only the pixels where the two renders
differ**, and read the per-frame tally beside the total. Both orders were rendered from
the same built candidate by reordering the piece list, so nothing but the edge changed:

```
speedy: 34 deciding pixels over 79 frames
        set behind   5637        set in front   1561
        per-frame tally: in front 16, behind 1, tie 0
ball:    5 deciding pixels over 79 frames
        set behind    428        set in front    357
        per-frame tally: in front 1, behind 1, tie 0
```

**The character's edge is decided**: 3.6x on the deciding pixels with a 16-to-1 tally is
not inside anybody's scatter, and it confirms the brief. **The ball's edge is not** — five
pixels in the whole shot and a 1-1 tally is §8's *no answer*. The ball is drawn behind the
course on the reasoning that one backdrop is in front of everything or of nothing, and
that is an argument, not a measurement.

## Result

`bun cli.ts bench 5 --candidate … --json bench.json` — once, after the last edit.

```
validate   green  (profile spine)
ess        bones=0.402  slots=0.356  attachments=0.897  constraints=1.000  animations=0.763  events=1.000
           bones 0.402 (name-matched) · 0.563 (name-agnostic)   slots 0.356 (name-matched) · 0.692 (name-agnostic)
```

`check` (all six sets took `frames.json`'s own box):

| set | MAE mean / worst | worst slot drift | per-frame | sheet mean / worst |
| --- | --- | --- | --- | --- |
| `ball` | 4.30 / 4.42 f0056 | 1.3 px `course` f0000 | **all 78 pairs agree** | — |
| `ball-ready-to-animate` | 4.29 / 4.29 | 1.3 px `course` | n/a (1 frame) | — |
| `ball-ready-to-animate@24fps` | 4.29 / 4.29 | 1.3 px `course` | n/a (1 frame) | — |
| `ball@24fps` | 4.29 / 4.29 | 1.3 px `course` | n/a (stills) | 5.80 / 6.27 f0125 |
| `speedy` | 5.52 / 6.02 f0041 | 5.1 px `hood-end1` f0023 | **all 78 pairs agree** | — |
| `speedy@24fps` | 5.48 / 5.63 | 2.2 px `head` f0156 | n/a (stills) | 7.38 / 8.71 f0021 |

## Notes — what the guide should have said

1. **A stepped key on a sample time that is already on the 1e-6 grid can be missed.**
   §4.5 explains why rigc rounds key times *down*, and that rule protects `2/12`; it
   does nothing for `0.25`, `0.5`, … `6.5`, where the key is already on the grid and the
   sampler's accumulated time falls a few ULPs below it. 13 of this shot's 78 sample
   times are in that set. §4.5 is the right home for it and the fix is one line: for a
   **stepped** timeline, write `T(i) − 1e-6`.

2. **§9.1's inert-write warning needs its twin.** "An MAE that does not move for any
   parameter you sweep is an inert write" catches a write nothing reads. It does not
   catch a write applied **twice** — an attachment scale in the rig and a bone scale in
   the sweep — which moves the number freely and reads as a wrong shot. The tell that
   worked was rendering the untouched setup pose first and comparing.

3. **Say that `frames.json`'s viewport is an authoring input, not only a checking one.**
   §9 explains that `check` will use the declared box when the candidate's pixels land in
   it. Read from the authoring side that is much stronger: the world box is *given*, so a
   rig can be authored in the frames' own coordinates from the first line and never pay
   the extent fit's floor at all. All six sets here took the declared box.

4. **A packed reference atlas puts a floor under MAE that no key can reach.** The
   example's atlas declares `scale: 0.5`; a candidate built from the loose PNGs samples a
   different source resolution, and the two point-samples disagree on ~1,100 static
   pixels — ~4.3 of this rung's 4.30 union MAE. §9.3's list of what `check` cannot see
   should say so, because without it a run reads its own floor as a wrong animation and
   goes looking for keys.

5. **The tolerance belongs in the brief's hold claim.** Revision 3's three holds are
   exactly right at `check`'s tolerance and one frame short at exact equality. A reader
   who verifies them the naive way will "correct" a correct brief. Either the brief or
   §8 should say which tolerance a hold claim is made at.
