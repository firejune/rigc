# Rung 2 — attempt 1

- date:      2026-08-23
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- inputs:    `bench/briefs/2-the-12-principles.md`, `docs/AUTHORING.md` (incl. §8),
             `bench/runs/README.md`, `examples/2-the-12-principles/images/`,
             `bench/reference/2-the-12-principles/` (4 contact sheets + 8 stills)
- reference: **not read** — no `examples/*/export/`, no `bench/transcriptions/`,
             no `docs/SPEC_COVERAGE.md` / `docs/LADDER.md` / `feature_matrix.*`,
             no `bench/count_features.ts` / `bench/render_reference.ts`, no git history,
             no web search. Tool sources read: `src/diff.ts`, `src/types.ts` (motion
             shapes), `tools/contact.ts` (opened by mistake — see below).
- profile:   spine
- clean vs bench-assisted: **clean.** `bench 2` was run once, after the last edit to
  either spec. Nothing was changed afterwards.

## How the frames were read

The contact sheet decodes as an 8 × 39 grid of 64 × 57 tiles with 1 px separators
(`521 = 8·64 + 9`, `2263 = 39·57 + 40`), row major, 311 tiles, frame index printed in
each tile's top-left corner. A tile is an exact ¼-scale copy of the 256 × 228 still.

The set's placement was solved by fitting `obstacle-course.png` to the still: its alpha
bbox (1608 × 1302 art px) lands on frame x 12..245, y 26..215, so **1 world px = 0.0723
frame px** for the props and the course plate is drawn at **2×** that. Everything else
was measured in that frame and converted; the rig is authored in prop-art pixels with
the course and the water carrying `scaleX/scaleY: 2`.

Estimators used, and the cross-checks §8 asks for:

- **rings** — template match: `ring-big.png` / `ring-small.png` rendered at the fitted
  scale, rotated in 1° steps, scored against the frame. Cross-checked against a second,
  independent estimator: the angle of the single **orange bracket** on each ring, found
  by colour key inside an annulus about the fitted centre. Both give the same rate, and
  both fits recover the *same* rotation centre from the first and the last frame, which
  is the quantity §8 says must agree between two shots.
- **ball** — a per-frame background made from the **median of the other three
  animations at the same frame index**. That removes the course, the rings, the water
  and the panel (identical across animations) without needing a model of any of them,
  and leaves only the ball. It fails exactly where the animations stop agreeing, which
  is how the tennis divergence below was found. The tennis ball was tracked by colour
  key instead (yellow-green is unique in this palette).
- **panel** — the topmost non-background row in the panel's own column, per frame.

## Loop

### 1 — build
```
bun cli.ts build \
  --rig    bench/runs/2026-08-23-rung2-1/the-12-principles.rig.json \
  --motion bench/runs/2026-08-23-rung2-1/the-12-principles.motion.json \
  --images examples/2-the-12-principles/images \
  --out    bench/runs/2026-08-23-rung2-1/spine \
  --profile spine
```
**Green on the first attempt.** 17 PASS, 0 FAIL, 1 SKIP
(`A31_DRAW_ORDER_OFFSETS_RESOLVE`: no animation carries a drawOrder timeline),
14 PROF (7 renderer, 7 archetype).
`pages=15 regions=15 bones=7 slots=8 animations=4 version=4.3.13`

### 2 — explain
`bun cli.ts explain …` — read the bone table, the slot table and every timeline.
All 8 slots emitted in the intended draw order, every setup attachment as intended,
the `specular` slot present with a `null` setup pose (it has skin entries, so §3.3's
silent-drop trap did not fire). No change made.

Re-derived the compiled numbers back into frame space as a check: the basketball's
last translate key puts it at frame (220.3, 160.6) and the last frame measures its
centre at (221.5, 162.5); the panel at `scaleY 0.4` puts its top at frame y 152.1 and
the collapsed panel measures 152. So the compile agrees with the measurement it came
from.

**There was no red turn.** That is worth saying plainly: this run measured *reading
frames*, not *reading the validator*, because the validator never had anything to say.

## What I got wrong on the way, honestly

1. **I opened `tools/contact.ts` expecting the contact-sheet builder.** It is the
   contact-*depth* measurement tool for a different archetype — nothing to do with this
   rung, and nothing about any answer in it. Recorded because it was a read I did not
   need to make. The sheet geometry was then derived from the pixels instead.

2. **I believed the brief's "the water level in the basin falls slowly" for about
   twenty minutes** and went looking for the keys. It does not fall. The basin region
   is *bit-identical* between frame 0 and frame 310 in all four animations
   (`|Δ| ≤ 2/255`, and the only components that differ anywhere in the frame are the two
   rings and the ball), and the water surface sits on the same row in every one of the
   311 tiles. I authored no water timeline. This is the §8 failure mode in reverse — a
   plausible story arriving from outside the pixels — and the defence was the same one:
   go and measure it.

3. **I believed "the rings turn slowly" and nearly authored ~163° over the shot.**
   163° is what you get by comparing *only* the first and last frame — the residue of a
   spin mod 360. The rings actually turn about **24° per frame**, one revolution per
   ~15 frames, ~20½ revolutions over the shot, the two counter-rotating. Caught by
   sampling intermediate frames instead of the endpoints, then confirmed by the orange
   bracket estimator and by eye on a zoomed strip of frames 0–15. The endpoint reading
   and the true rate are *consistent with each other*, which is exactly why the wrong
   one was believable.

4. **My first ball tracker used the median across all four animations, and it lied
   about the tennis ball.** The tennis detections came back sitting in the ring region,
   moving nowhere sensible. The cause was not the tracker: the **tennis animation's
   rings and panel run on their own, slightly different timings** (its ring angles match
   the other three up to frame ~15 and drift after; its panel cycle slips ~4 frames at
   the fourth cycle and stays slipped). Median-of-four therefore had no majority for the
   background, and the residue read as a ball. Fixed by using median-of-*the other
   three* and, for tennis, a colour key. The lesson is §8's: the estimator broke on
   precisely the frames that mattered, and it broke *plausibly*.

5. **I read the panel as "swings flat / disappears" and nearly wrote an attachment
   toggle.** Two things were wrong with that. The collapse is not instantaneous — single
   intermediate frames show the panel at *varying* partial heights (top row at 31, 33,
   34, 35, 37 on different cycles), which is a continuous ramp sampled at 12 fps, not a
   toggle. And it does not collapse to nothing: it stops at ~40 % height, and the
   **bowling ball rolls onto the collapsed panel, sits on it for six frames, and is
   launched straight up when it snaps back**. That is the whole reason the ball reaches
   the basin. I only saw it because the ball tracker lost the bowling ball for twelve
   frames — the frames where it was parked on the panel, inside a region I had masked
   out to keep the panel from polluting the tracker. Masking the confusing thing hid the
   event.

## What the frames could not tell me

- **Whether the balls spin.** They render at 2.5 px (billiard, tennis) to 10 px
  (basketball); the seam pattern is gone at that size and there is no mid-shot still.
  A rolling ball is the obvious authoring choice and I still did not author one, because
  §8's rule is that a reading which implies a key needs a second way to get the same
  number, and there is no second way here. If the reference spins its balls, this run
  is missing four `rotate` timelines and that is the honest cost of the rule.
- **Whether the ring spin is two keys or twenty-one.** A constant rate is what the
  frames show; whether the animator wrote it as one long linear ramp or as a key per
  revolution is invisible. I wrote two keys — the fewest that reproduce the measurement.
- **Slot/bone naming and the ball's slot structure.** Nothing in the pixels names
  anything. I inferred three shared ball slots (`ball`, `lambertian`, `specular`) with
  the four variants as swapped attachments, from the `<ball>-<layer>.png` naming family
  and from only ever seeing one ball at a time — rather than ten per-image slots with
  the unused ones hidden.
- **Draw order between parts that never overlap** (the rings against the set; the panel
  against the water). Decided by the two that *do*: the water is drawn over the ball
  (the floating basketball's lower half is tinted, cut by the water's straight surface),
  and the set is drawn over both the water and the panel (the water is visible only
  inside the basin's U, the panel's base is hidden by the floor). The ball never crosses
  the set's opaque area at all, which is what makes that order possible.
- **The third ring.** The brief says three rings are on screen and two ring PNGs exist,
  so "at least one is used twice". Measured: the third — the C-shape cradled on the
  lattice tower — is **painted into `obstacle-course.png`**, it never moves, and both
  small balls end the shot resting in its bowl. Two ring attachments, not three.

## What the guide could have said

- §8 is about *your* estimator's failure modes. The one that cost the most here was a
  different shape: **an assertion in the brief that the frames do not support** (the
  falling water level, the "slow" ring spin, the ball-triggered panel). A line in §8 to
  the effect of "the brief is a viewer's report, not a measurement — check its claims
  the same way you check your own" would have saved two detours.
- A note that a *periodic* background element (this panel cycles eleven times over
  25.8 s regardless of the ball) will defeat any background model built by comparing
  animations, and that the way to find one is a per-frame change profile over a fixed
  window rather than a tracker.
