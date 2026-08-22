# Rung 1 — attempt 1

- date:      2026-08-23
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK subagent
- inputs:    `bench/briefs/1-weight-and-mass.md`, `docs/AUTHORING.md` (incl. §8),
             `bench/runs/README.md`, `examples/1-weight-and-mass/images/`,
             `bench/reference/1-weight-and-mass/` (contact sheets, 12 fps and
             24 fps frame sets, the single `drop` frame),
             `src/png.ts` + `tools/png_probe.mjs` (PNG decode, for measuring),
             `src/validate.ts` (three lines, to find how a skeleton is loaded)
- reference: not read — `examples/*/export/`, `bench/transcriptions/`, other run
             directories, `docs/SPEC_COVERAGE.md`, `docs/LADDER.md`,
             `docs/feature_matrix.*`, `bench/count_features.ts`,
             `bench/render_reference.ts` and git history were never opened, and
             nothing about this example was searched for on the web
- profile:   spine
- candidates: two — `balls-spine/` and `drop-spine/`

## How the loop actually ran

Eleven builds ran — nine for `balls`, two for `drop` — and **every one of them
was green**, including the first. That is not a claim that the specs were right:
the gate is a *validity* gate. It parses the file, steps the animation, and
checks that nothing in it is degenerate — it has no opinion about whether the
animation is the one in the frames. Every `balls` build after the first was
driven by a **self-check I wrote myself** (`spine-core` loads my own candidate,
steps it at 24 fps, and compares each ball's centre / width / height / shadow
width / shadow alpha against the numbers I measured off the reference frames).
The first run of that self-check found a sign error that had reversed every
easing in the file, and the validator was structurally incapable of seeing it.

So the log below has two halves: the measurement passes (where all the real
failures were) and the build passes (where there were none).

## Measurement passes — before the first build

### M1 — segment the balls, and merge them with their shadows
Connected components of "differs from the 232-grey background" on the 12 fps set.
Clean while a ball is airborne; from the contact frame onward **each ball fuses
with its own shadow into one blob**, so the bounding box grew a tail below the
ground and every height near an impact was wrong. This is §8's first trap
verbatim, and it hits exactly the frames the shot is about.

### M2 — colour-key instead
The shadow art is a *perfectly* grey ellipse: `max(r,g,b) − min(r,g,b) == 0` for
all 10 470 opaque pixels of `cast-shadow-iron.png`. The red and blue balls have
**zero** grey pixels, and the steel ball has 3 % (interior only). So for those
three, "channel spread ≥ 2" separates ball from shadow perfectly, even where the
shadow is directly behind the ball.

### M3 — the beach ball defeats the colour key
51 % of `beach-ball.png` is exactly grey (its white panels), and those greys run
from 160 to 250 while the visible fringe of a shadow runs 150 to 231 — the ranges
overlap, so no threshold separates them. Two dead ends:
- *flood fill from the top of the column with "grey ≥ 150 counts as ball"* — the
  shadow's own light fringe is ≥ 150 and connects, so at rest the ball measured
  61 × 65 instead of 61 × 61.
- *take the horizontal run through the column centre* — the beach ball has
  interior pixels within 8 of the background colour, so the run breaks and the
  width came out 59 at rest and 63 at the flatten.

What works: the shadows never reach above y = 214 in any of the 79 frames, so
**above that line every content pixel in the column is ball**; below it, require
channel spread ≥ 2. Width from the plain bounding box above the line, bottom edge
from the spread test below it.

The second reading is the one that made me sure: the brief states the beach
ball's silhouette is **61 px at rest, 57 narrowest, 65 widest**. The broken
estimator said 59 / 53 / 63 — a constant 2 px short. The fixed one says
61 / 55 / 65. That is the only place in this run where a number outside my own
pipeline could check my measurement, and it caught a real error.

### M4 — pixels per unit, cross-checked four ways
The art is used at its natural PNG size, so the render scale falls out of the
silhouettes: beach 61 px / 571 units = 0.1068, red 29/274 = 0.1058,
blue 22/206 = 0.1068, steel 22/206 = 0.1068. One scale fits all four
(§8's "run the same estimator over two shots and cross-check a quantity that must
agree"), so **1 px = 9.375 units** for `balls`. For `drop` the same check across
four parts gives 1 px ≈ 5.26 units — the two shots are framed independently and
the scales are genuinely different.

The renderer fits the *content* box with a ~10 px margin, not the skeleton
header: content spans x[12..245] y[9..228] in a 256×239 frame. So the header is
free, exactly as the brief says.

### M5 — draw order, read from what survives
At the red ball's flatten frame the shadow is at its darkest and widest and lies
directly under the ball. Rows 219–221 read `-##########rrrrrrr#########-`: red
pixels survive *inside* the shadow's area, grey ones outside it. The ball is in
front; there is no ambiguous seam to misread. Same test on the beach ball at rest.
Both shadows therefore go earlier in the slots array (R4).

### M6 — the shadow is not soft where I assumed
I expected a soft ellipse whose measured width would shrink faster than its true
scale at low opacity. Its horizontal profile is alpha 1.0 from u = 0.08 to
u = 0.92 and then a hard edge, so measured width *is* scale. The vertical profile
is the soft one. Its RGB is (20,20,20), not black, so opacity is
`(232 − min) / (232 − 20)`, not `(232 − min) / 232`; the first form overstates
darkness by 9 %. Both scale **and** opacity are animated: at the top of the drop
the beach shadow is 32 px at α 0.28, at contact 59 px at α 0.98.

### M7 — the contacts that no frame contains
The brief says each flatten lasts one frame and lands between two 12 fps frames.
That pins three contacts exactly: beach 24 fps f13, red f11, blue f11 — the
squash frame *is* the contact. It does not pin the rest. The steel ball never
deforms, so nothing marks its impact at all: its lowest sampled centre is 8 px
above its rest position, and the descent (deltas 20, 24, then 13) shows it hit
and rebounded *between* f9 and f10. Later, shallower bounces of the rubber balls
have the same problem. For those I extrapolated the last full descent step to
h = 0 and put the key at the crossing — the physical constraint "a bouncing ball
reaches the ground" is a second way to get a number the frames do not contain.

### M8 — `ground-cover` is invisible
I box-filtered `ground-bg.png` down to the rendered 238 × 75 and differenced it
against the slab in `drop/ready-to-animate/f0000.png`. The residual is uniform
resampling noise with **no rectangular region** anywhere — and `ground-cover.png`
is a fully opaque 341 × 118 tile, which at this scale would be an unmistakable
65 × 22 rectangle. Nothing in the rendered pose is `ground-cover`, so I authored
`drop` without it. (The diff at the end says this was wrong — see the README.)

## Build passes

### 1 — `drop`, build
```
bun cli.ts build --rig drop.rig.json --motion drop.motion.json \
  --images examples/1-weight-and-mass/images --out drop-spine --profile spine
```
Green. 17 PASS, 0 FAIL, 1 SKIP (`A31_DRAW_ORDER_OFFSETS_RESOLVE`: no drawOrder
timeline), 14 PROF. `pages=4 regions=4 bones=5 slots=4 animations=1`.
`A09_ANIMATION_DURATION_MATCHES_SPEC` compared the named 0 s animation against 0
and passed, as §1.2 says it would. No further `drop` builds were needed.

### 2 — `balls`, build
Green. 17 PASS, 0 FAIL, 1 SKIP (same A31), 14 PROF.
`pages=8 regions=8 bones=9 slots=8 animations=1`. 15 timelines, 178 keys.
→ changed: nothing. The report had nothing to change.

### 3 — self-check against the frames
Not a `build`. Loaded `balls-spine/` with `spine-core`, stepped it 79 times at
1/24 s, and compared. **Worst deviation 67 px** — the beach ball was two thirds of
the way down while the reference was a quarter. The key *values* were exact at
every key frame and wrong everywhere between, which localised it to the curves:
```js
k.ease = h > beats[i+1][1] ? 'rise' : 'fall';   // h falling ⇒ picks 'rise'
```
Every accelerating segment got the decelerating curve and vice versa — §8's
"a symmetric shape hides a sign error", one level up: `fall` and `rise` are
mirror images, so the file looked plausible in every static reading of it.
→ changed: the condition, in the generator and in both shadow tracks.

### 4 — `balls`, build
Green, same counts. Self-check: worst **19.9 px**, all of it in the long free
falls. The two hand-derived easings (`fall` = the exact cubic for `t²`,
`rise` = its mirror) are wrong for this shot: normalised, the red ball's first
fall is ≈ u^1.6 and the beach ball's is ≈ u^1.85. The four balls do **not** share
a fall curve — they fall the same distance (151–155 px) in different times
(steel ≈ f9.9, rubber f11, beach f13). That difference *is* the shot, so a single
gravity curve cannot be right.
→ changed: fit the two graph handles per segment by least squares against the
frames the segment spans.

### 5, 6, 7 — `balls`, three builds, handle quantisation sweep
Fitted handles rounded to 0.05 / 0.1 / 0.2. Green every time; self-check worst
**4.7 / 6.9 / 12.8 px**, distinct easings 93 / 91 / 83. Coarser rounding barely
merges anything, because the segments genuinely differ — kept 0.05.

### 8 — `balls`, build
Easings renamed from `e1…e93` to `<ball>-y-N` / `<ball>-shadow-size-N` /
`<ball>-shadow-ink-N`; the beach ball's second contact moved from f34 to f33.5
(f33 and f34 have the same centre, and keying the later one left f33 4.7 px
short). Segments with fewer than two interior frames now get linear instead of a
fit, so the fitter cannot chase a single pixel of noise. Green. Worst 3.75 px.

### 9 — `balls`, build
Squash/stretch keys reworked against a per-ball noise floor (≥ 3 px on the beach
ball, ≥ 2 px on the others — ±1 px is 1.6 % of the beach ball and 4.5 % of the
blue one). Added the `[1,1]` anchors that stop one bounce's stretch from bleeding
across ten frames into the next, and dropped four 1-px "deformations" that were
noise. Green. 15 timelines, **190 keys**, 93 easings. Worst 3.75 px, at
blue f51 — a two-frame segment with one interior sample, which cannot be fitted.

### 10, 11 — final rebuilds, no input change
Two more `balls` builds (re-running the same inputs to read the full report) and
the second `drop` build. Green, identical counts. `explain` read on both: all 8
`balls` slots and all 4 `drop` slots are present, in the order declared, showing
the setup attachment intended — nothing was silently dropped (§3.3).

Build tally: `balls` 9, `drop` 2, FAIL count 0.

### 12 — `bench 1`, once per candidate, no edits after
```
bun cli.ts bench 1 --candidate balls-spine --json bench-balls.json
bun cli.ts bench 1 --candidate drop-spine  --json bench-drop.json
```
Both print a `balls` line and a `drop` line; only the matching one is a
measurement of that candidate. See README.md.

## Notes for the guide

- **The gate cannot fail a wrong animation.** Every build in this run was green,
  including the one whose easings were all reversed. §7's checklist ends at
  "read every measure" of `diff`/`bench`, but `bench` is the finish line and
  cannot be used as a loop. There is a real hole between the two, and the thing
  that filled it here — pose your own candidate with `spine-core` and compare it
  against the frames you measured — is worth naming in §8, because an agent
  authoring from pictures has no other way to close the loop.
- **§8 should say that a value is easier to get right than a curve.** All my key
  values were right in build 2; what was wrong was every curve between them. The
  three traps in §8 are all about *measuring a value*. The mistake that cost the
  most here was about *direction*, and it survived because both candidates for
  the shape are legal and the file reads fine either way.
- **`ease` versus `curve` when every segment differs.** §4.5 says `curve` is for
  "when every key needs a different shape", which is exactly this shot — but the
  emitted JSON is identical either way, and a named easing lets rigc do the
  normalised→absolute conversion that §4.1 warns is a silent trap by hand. Ending
  up with 93 single-use named easings feels wrong and is, I think, still the right
  call; the guide could say so.
- **`region_size_present` can never match for a rigc rig.** R1 emits `width` and
  `height` whenever they are declared, and R5 declares them from the PNG, so a
  region authored with `image` always states its size. The reference does not.
  That measure reads 0/8 on `balls` and 3/5 on `drop` for a reason that is a
  property of the compiler, not of the rig — worth a line in §2 or in the diff's
  own description, so a future run does not go hunting for it.
- **Nothing in a rendered frame carries bone `length`.** §3.2 calls it "part of a
  faithful reproduction", and `bones.length_present` measures it, but a run
  authored from pictures cannot see it at all. Same for the setup `inherit` flag.
  These are structural blind spots of frames-only authoring, and it would help to
  say so in §8 so the run knows to record it rather than guess.
