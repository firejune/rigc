# Rung 2 — attempt 2 (brief revision 2)

- date:      2026-08-23
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- brief:     `bench/briefs/2-the-12-principles.md`, **revision 2**
- inputs:    brief, `docs/AUTHORING.md`, `bench/runs/README.md`,
             `examples/2-the-12-principles/images/`,
             `bench/reference/2-the-12-principles/` (4 contact sheets + 8 stills + `frames.json`)
- reference: **not read.** `examples/2-the-12-principles/export/`,
             `bench/transcriptions/`, `bench/runs/2026-08-23-rung2-1/`,
             `docs/LADDER.md`, `docs/SPEC_COVERAGE.md`, `docs/feature_matrix.*`,
             `bench/count_features.ts`, `bench/render_reference.ts` and git history
             were not opened at any point.
- profile:   spine
- clean or bench-assisted: **clean.** `bench 2` was run once, at the end, and
             nothing was edited afterwards.

---

## 0. What the frames could be measured with

`check` on this rung compares **two frames per animation** — `f0000.png` and
`f0310.png` are the only `fNNNN.png` files the rung ships, and the 311-frame
contact sheets are not read by it. So the loop needed a second instrument for
the other 309 frames.

Two were built, and both are downstream of pictures only:

1. **A numpy replica of `src/render.ts`** — `rasteriseQuad`, `bilinear` and
   `Plate.blend`, ported line for line. It agrees with `check` to 0.01 MAE
   (4.217 vs 4.22 at `basketball/f0000`), which is what makes an offline fit
   worth running: a placement can be searched in seconds instead of a build.
2. **A whole-shot self-check** (`sheetcheck.ts`, in this directory)
   that loads the *compiled candidate* through `src/render.ts`, samples every
   animation at 12 fps into the reference's own world box at quarter scale, and
   compares each frame against its tile on the contact sheet. It opens the
   contact sheets and `frames.json` and nothing else — the same reference-side
   reads `check` is allowed. It is the only measurement in this run that can see
   a wrong trajectory at frame 150.

`frames.json` also gives the reference's world box, and that box is a fact about
the *rendering*, not about the skeleton. Inverting `framingViewport`'s
`PAD = 0.04` on it recovers the reference's **unpadded content box**:

```
padded  x[-179.740, 3336.740]  y[-181.240, 2952.426]
unpadded x[ -49.500, 3206.500]  y[ -51.000, 2822.186]      W = 3256.000
```

`3256 = 1628 x 2`, and `obstacle-course.png` is 1628 px wide. That one line fixed
the course's scale (**exactly 2**) and both of its x edges before a single fit was
run, and everything else was measured against it.

## 1. Measuring the set

Each part was fitted by rendering it into the reference's grid and searching for
the placement that minimises the pixel difference. Order matters: the course
first (it covers most of the frame), then whatever the residual still showed.

| Part | Result | How it was pinned |
| --- | --- | --- |
| `obstacle-course` | bone (1578.5, 1274.0), region scale **2** | union box in x; a 2-D search in y; scale swept 1.99–2.01, 2.000 sharply best |
| `water` | bone (2418, 457), slot colour `ffffffc4`, **behind** the course | a vertical colour scan through the basin fitted top edge, height and alpha to 0.30 mean error; it is 74.8 px wide against a 68 px hole, so it must be occluded, so it is behind |
| `platform` | bone (1765, 540) = the **hinge**, region `y: +406.5` | free fit at f0000; 2-D search plus a rotation sweep that chose 0° |
| `ring-big` | bone (801.43, 2387.67), offset 0 | free fit; independently `2822.186 - 434.52 = 2387.67`, the half-diagonal of a 618x611 quad — the big ring's spinning corner *is* the top of the union box |
| `ring-small` | bone (1034.29, 1884.11), region **`x: 0.17, y: -18.12`** | see §3 |

The residual after the set was fitted showed **only** the two turning rings, the
panel, the ball, and a one-pixel outline everywhere else. The third ring on the
lattice tower did not appear in it at all — it is painted into
`obstacle-course.png`, exactly as the brief says.

## 2. Three things the frames said that the brief does not

**The lambertian discs are tinted, and they are what you see.** Composited plain,
`basket-lambertian.png` is a near-opaque grey disc: source-over it replaces the
ball with grey, and the reference's basketball is saturated brown. But its **red
channel alone** already matched the reference almost exactly. Fitting a slot
colour on the shade slot dropped the ball's local error from 12.0 to 3.5, and
gives one warm/blue/yellow tint per ball:

| slot | colour | ball's own art contributes |
| --- | --- | --- |
| `basketball-shade` | `ffb5a1` | 2.42 → 2.12 with the ball layer under it |
| `bowling-shade` | `ecceff` | 3.43 → 3.25 |
| `tennis-shade` | `fbffa7` | 2.07 → 2.05 |
| `billiard-shade` | white (omitted) | 2.42 → 2.24 |

That is the brief's *"the basketball's seams show through it"*, read off the
pixels: the shade is nearly opaque, so the ball underneath is worth ~0.3 MAE and
no more. The two **specular** discs move the error by 0.07 — under the noise. They
are authored because the art ships them and the model is one slot per image, not
because a frame could confirm them.

**The lower ring does not spin about its own centre.** Fitted at f0000 the ring
centre is (1041.55, 1867.5); fitted free at f0310 it is (1021.55, 1897.0) — 36
units away, and holding the centre fixed cost 12.2 local error against 1.4 free.
Solving `C1 - C0 = (R(dtheta) - I) v` for the offset gives `|v| = 18.1` units and a
bone at (1034.29, 1884.11), which then predicts the f0000 centre to 0.1 units. So
the ring wobbles as it turns, by about 1.3 px — small, and it was the single
largest residual in the shot until it was found.

**The tennis shot is not the same set animation as the other three.** The brief
says the panel is *"frame-for-frame identical in all four animations"*. That is
true of basketball, billiard and bowling, and false of tennis:

- its **upper ring** turns at −24.19°/frame instead of −23.874, and **stops
  dead at frame 306.4** (measured: 159° at f306, 149° at f307, 149° at f308–310);
- its **panel** keeps the others' phase for three cycles and then runs ~5 frames
  early from cycle 3 on (down-starts 11, 39, 66, **89**, 117, 144, … against 11,
  39, 66, **94**, 121, 149, …).

Both were found by differencing tiles between animations, then confirmed at full
size on `f0310`, where the tennis upper ring is visibly 10° behind the others.

## 3. What the brief said that the frames confirm

Every quantitative claim in revision 2 that this run could test held up:

- 311 frames, 25⅚ s, four animations, one viewport — yes.
- **rings turn once per ~15 frames, opposite ways** — measured −23.874°/frame
  (upper, clockwise) and +23.874°/frame (lower, anticlockwise), i.e. ±7401° over
  310 frames, 15.08 frames a turn. The endpoint residue is 158.9°, near the
  brief's "~163°" warning value.
- **panel period ≈27½ frames** — 27.60 frames exactly (five cycles repeat
  bit-for-bit every 138 frames), 16 sampled frames down and 11 up.
- **panel collapses to 40–45 %** — 0.405, and it **overshoots to 0.365 for one
  frame** on the way down, which the brief does not mention and which broke the
  first timeline model (below).
- **the bowling ball rests on the lowered panel and is thrown in four frames** —
  it sits at (36.7, 37.3) tile px for f47–f53 and rises to (37.5, 11.4) by f57.
- **only two finish the course** — the resting places measured on `f0310` are
  basketball (2868, 719) at the water line, bowling (2497, 295) on the basin
  floor, and billiard (1271, 681) and tennis (1264, 683) — the same spot, the
  bowl of the painted ring.
- **the water never moves** — modelled static, and the basin residual is flat
  across both stills.

The one claim this run could not test is the "%" of the collapse being about the
*standing height*: the panel is scaled about its hinge, so 0.405 is that number
by construction.

## 4. Two false starts worth recording

**Ball isolation via a "common residual" mask.** The first tracker took each
animation's residual against the modelled set and removed the pixels where *all
four* animations disagreed with the model, on the theory that the set error and
the frame-number label are common to all four. They are — but the tennis rings
are not, so tennis got 15–48-pixel blobs of ring error handed to it as "the
ball". Replaced with peer differencing: a ball is where its shot differs from the
**two peers that share its ring phase**, which cancels the set, the panel, the
rings and the label in one step. Tennis has no such peer, so the upper ring's
sweep box is cut out of its mask instead and the frames where its ball is inside
that box are interpolated.

**A seed typed wrong.** The basketball's f0310 anchor was seeded from tile
(55.5, 40.0) but the world x was mistyped 2597 instead of 2897, and the fit's
±20-unit window could not escape it. It cost a build: `check` reported MAE 6.63
at `basketball/f0310` and the residual map showed **two** hot blobs 20 px apart —
the reference's ball and mine. The lesson is the guide's own (§8): a wrong number
with a plausible story attached survives until something contradicts it, and the
thing that contradicted it was drawing the residual rather than reading the fit's
error.

## 5. The loop

### 1 — build
```
bun cli.ts build --rig … --motion … --images examples/2-the-12-principles/images \
  --out bench/runs/2026-08-23-rung2-2/spine --profile spine
```
Green first time: **17 PASS, 0 FAIL, 1 SKIP** (`A31` — no `drawOrder` timeline),
14 PROF. 10 bones, 15 slots, 15 regions, 4 animations.

### 2 — check
MAE mean 5.10–5.97, worst 6.63 at `f0310` on every animation; f0000 flat at 4.26.
`slot drift: no slot could be attributed in any frame` — the course, water, panel
and rings are one connected component in the reference, so drift said nothing all
run and MAE carried every frame.
→ residual map at f0310 named the causes: the two rings' end angles, and the
basketball 20 px out (§4).

### 3 — measure again, no build
Re-fitted both rings at full size on both stills, which produced §2's ring
findings; re-fitted the four f0310 ball anchors; re-ran the whole track with the
corrected set model.

### 4 — build
Green, same counts. **`check` failed to run**: `SyntaxError: Cannot export a
duplicate function name: 'matchSlots'`. Not this run's doing — another agent was
mid-refactor on `src/check.ts` in the shared tree (`src/framing.ts` and
`src/slots.ts` appeared as untracked files). Waited, retrying every 20 s; it
compiled again after ~100 s.

⚠️ **That refactor changed what `check` measures**, so numbers from turn 2 and
numbers from turn 4 onward are not comparable. Framing moved from "union of posed
quad corners, padded by `PAD`" to a similarity fit between the two sides' **drawn
pixel** boxes. Under the old rule this candidate framed to the reference's box
exactly, because it is authored in the reference's own coordinates; under the new
rule it is fitted, and the fit costs ~0.6 MAE.

### 5 — check
MAE 4.88–5.00. Framing: candidate content box 232.5x196.1 px against the
reference's 232.4x196.2, fit scale 0.99989, offset +0.13 px, residual 0.07 px,
*"did not settle in 3 passes"*.
Pinned with `--viewport` to the reference's own world box (legitimate here: the
rig is authored in that coordinate system, recovered from `frames.json`, not from
any skeleton) the same build reads **4.21–4.34**. Recorded as a diagnostic; the
run's number is the default.

### 6 — three builds, course x offset by 0, +2, +4 units
Testing whether nudging the course could shrink the 0.16 px content-box mismatch
on the left edge. It could not: MAE 4.90 → 5.18 → 5.86. The mismatch is the faint
left column of the course art rendering differently from a loose page than from
the reference's packed atlas, and it is not a placement error. Reverted.

### 7 — water x +20 units, alpha `c4`
4.95 → 4.90 and so on, ~0.05 each. The water is clipped by the basin on both
sides, so its x is only weakly observable; taken because it is the best fit, and
noted as weakly determined.

### 8 — panel timeline rewritten, build + check
The two-ramp model (fall start, fall duration, hold, rise) fitted the four
mid-transition samples to 0.035 frames and was still **wrong**: it put the first
cycle's fall at frame 9.74 when frame 10 is measured fully up and frame 11
measured fully down — no fall duration satisfies both. The reason is the
overshoot: frame 11 reads **0.365**, below the 0.405 the panel rests at, so the
transition is not monotone and a two-ramp model cannot express it. Replaced with a
polyline through the measured per-frame series, simplified to where it bends
(72 keys per animation). Sub-frame shape between two 12 fps samples is not
observable in this reference, and a straight line between them is the honest
choice.

**MAE 4.32–4.45**, framing settled in 2 passes, offset +0.04 px. Final build.

### 9 — whole-shot self-check (all 311 frames, not just the two stills)
```
basketball     MAE mean 4.85  worst 5.47 at f0122
billiard-ball  MAE mean 4.86  worst 5.49 at f0122
bowling-ball   MAE mean 4.95  worst 5.61 at f0122
tennis-ball    MAE mean 4.89  worst 5.49 at f0262
```
**Flat**, with a 0.7 spread over 1,244 frames and no spikes. §9.2 of the guide
reads a flat MAE as "framing or art" and spikes as "timing at those moments" —
there are no spikes, in any of the four, anywhere. That is the evidence that the
trajectories, the ring rates, the panel cycle and the four attachment swaps are
in the right places at the right times, and it is evidence `check` on this rung
cannot produce.

## Result

`bun cli.ts bench 2 --candidate bench/runs/2026-08-23-rung2-2/spine --frames bench/reference/2-the-12-principles --json bench.json`

See `README.md` for the summary, verbatim, and for how the measures read.

## Notes for the guide

- **§9 should say that a frame set can be contact-sheets-only**, and that `check`
  then compares two frames. It is stated in the brief and in `bench/runs/README.md`
  but not in the section that tells an author `check` is the half of the loop that
  can see a wrong animation — on this rung it can see 2 frames of 311 per
  animation, and everything between them has to be checked some other way.
- **A candidate authored in the reference's own coordinates is now penalised**
  by the framing fit, by ~0.6 MAE here. `frames.json` publishes the reference's
  world box precisely so an author can convert pixels into units; an author who
  uses it all the way and lands *on* those coordinates then has a content-box fit
  applied on top. Worth a sentence in §9.2 about when `--viewport` is the honest
  call.
- **The slot-drift column is dead on a shot whose set is one connected blob.**
  Every frame of every animation reported `some slots ambiguous`, and after the
  refactor a "course drift 11 px" that is not a measurement of the course. A
  reader who does not know §9.2's warning by heart will read that number.
- **`build` cannot fail on a shot like this and that is the whole exercise.** The
  first build was green with the balls tracked by a broken mask, one ball 20 px
  out, the lower ring wobbling about the wrong point and the panel's overshoot
  missing. Nothing in the gate moved between that build and this one: 17 PASS,
  0 FAIL, both times.
