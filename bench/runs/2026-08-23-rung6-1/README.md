# Rung 6 (`6-arcs`) — attempt 1

One skeleton, one animation, authored from the brief and the rendered frames.

## Inputs

| Input | What was used |
| --- | --- |
| brief | [`bench/briefs/6-arcs.md`](../../briefs/6-arcs.md), **revision 3** — the third-party-verified one |
| guide | [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) in full, including §8 and §9 |
| protocol | [`bench/runs/README.md`](../README.md) |
| art | `examples/6-arcs/images/` — `ball.png`, `tail.png`, `platform.png`, `arc-tracker.png` |
| frames | `bench/reference/6-arcs/` — `arcs/` (69 frames + contact sheet), `arcs@24fps/` (sheet + 2 stills), `frames.json` |
| source read | `src/rig.ts`, `src/mesh.ts`, `src/render.ts`, `src/compile.ts` (the generator call site), `tools/plate.ts` — format and renderer documentation, none of which says anything about this rung's answer |

**Model:** Claude Opus 5 (1M context), running as a Claude Code / Agent SDK subagent
in a fresh session, in its own `git worktree` at `/tmp/rigc-run6`.

## Clean, not bench-assisted

`examples/6-arcs/export/`, `bench/transcriptions/`, `docs/LADDER.md`,
`docs/SPEC_COVERAGE.md`, `docs/feature_matrix.*`, `bench/count_features.ts`,
`bench/render_reference.ts` and git history were **never opened**. `bench 6` was run
**once**, at the very end; neither spec was touched afterwards. `check` was run
throughout the loop, which the protocol explicitly allows — it never opens the
reference skeleton.

## What was built

```
root
├── stone                      platform.png at ×2, static
└── comet                      translate — the ball's path through the shot
    ├── ball                   scale     — the squash, screen-aligned
    └── tail0 ─ tail1 ─ … ─ tail6      rotate ×6 — the trail's bend
        └── tracker            arc-tracker.png, revealed on the last frame only
```

Draw order (the slots array, R4): `stone` · `trail` · `ball` · `tracker`.
440 keys across 9 timelines; duration 5.666666 s (68/12).

### How the deformation was built, and why

**The trail is a weighted mesh on a bone chain — authored geometry, not a generator.**

*Why a mesh at all:* the brief is explicit that a rigid `tail.png` on a chain of
joints can point the right way and cannot bend, and the bend is the rung. Measured
here independently, the trail's centre line departs from the chord joining its ends
by **0.7–8.5 px, median 4.3** against a trail 32–41 px long — about an eighth of its
own length typically. Nothing rigid produces that.

*Why not `generator: { kind: "ribbon" }`:* `buildRibbonMesh` runs its rows down the
part window's **height** and its width across **x**, so a generated ribbon's long axis
is always the region's *v* axis. `tail.png` is 380 × 111 — its long axis is *u*.
`size:[380,111]` bends the strip across the spindle's short axis; `size:[111,380]`
turns the art 90° and stretches it. The generator would have needed a rotated copy of
the plate, which is not the art we were given. So the mesh is authored with
`weights` — §3.4's recommended form, binding by name — laid out along the art's own
long axis: 13 rows from the blunt entry (art x 380) to the sharp tip (art x 0), two
rows per chain segment, **both vertices of a row carrying identical weights** so the
strip can bend and cannot change width. That is the ribbon's structural guarantee kept
by hand, since `A28` correctly SKIPs on an authored mesh.

*Why six segments:* the bend is a smooth degree-3 curve, and a joint every 5.4 px
represents it comfortably. 5, 6 and 8 segments were built and fitted; total residual
came out 1.598 / 1.600 / 1.588 — **within 0.8 %**, so the frames do not choose. Six was
chosen on what a comet-tail rig has to do next rather than on pixels that are silent
(§9.3's rule).

**The ball is bone scale, one piece.** Its proportion runs 0.52–2.05 as shipped
(median 0.994) — wider than the 0.76–1.80 two estimators read off the reference, see
*Known-wrong*. The squash axis is screen-vertical on every landing: the pale grey cap
stays at the top of the ball on every frame examined, so the ball never rotates. `scaleX` /
`scaleY` on a bone expresses exactly that, and §9.3 says outright that frames cannot
distinguish a hull moved by bones from the same hull moved by deform keys. A mesh here
would be four times the data for identical pixels.

Two structural consequences worth naming:

- `ball` is a **sibling** of `tail0` under `comet`, not its parent, so squashing the
  ball does not squash the trail.
- `scaleY` is held at `1/scaleX`, so the ball's drawn area cannot change. The emitted
  keys hold `scaleX·scaleY` to 1.0000 ± 0.00008. The ball's drawn area really is very
  nearly constant — 309–345 px on a mean of 333, measured here, matching the brief —
  and with the two axes free the fit used ball inflation (up to 1.68×) to paper over
  trail error.

## Reading the measures

### validate — green

15 PASS, 0 FAIL under `--profile spine` in `bench`'s own re-gate (the `build` of the
same artifacts reports 17 PASS, 0 FAIL, 1 SKIP, 14 PROF). Three SKIPs here, all
expected when re-gating artifacts on disk: `A31` (no draw-order timeline in this shot), `A09` (`bench` passes
no motion spec, so there is no declared duration to compare — `build` ran it and it
passed), `A18` (no second compile). 14 PROF: the renderer policy and the archetype
assertions are out of profile, which is the right profile for a foreign skeleton with
no `invariants` block (§3.6, §7 step 3). Nothing was relied on that did not run.

### check — the framing line first

```
framed to  512x137px  0.085512 px/unit   (fitted to the candidate's own drawn pixels)
reference  512x137px  0.085458 px/unit   (frames.json)
content    candidate 471.2x89.5px at (20.5, 19.5)   reference 471.4x89.5px at (20.4, 19.5)
           ⤷ fit x0.999505  offset +0.20, -0.18 px   rms 0.26 px over 284 edge(s)
             union residual -0.40 x -0.04 px   aspect -0.04%  (applied, 4 pass(es))
⚠️ the framing did not settle in 4 pass(es)
```

The content boxes agree: **471.2 × 89.5 against 471.4 × 89.5, in the same place to a
fifth of a pixel**, `rms 0.26 px` over 284 edges — under the method's own noise floor —
and a union residual of −0.40 × −0.04 px. By the guide's own reading that says the two
shots are the same shape at the same size, not two shapes a fit could not reconcile.

What the ⚠️ says is that the *fit* did not converge: it settled on a scale **0.063 %
away** from the one the frames were rendered at, and would not stop moving. That
fraction of a percent is worth **5 MAE points** here:

| framing | MAE, 12 fps set | MAE, 24 fps stills |
| --- | --- | --- |
| fitted (what `bench` prints) | **8.73** (worst 9.69) | 8.47 |
| `--viewport` pinned to `frames.json`'s box | **3.50** (worst 4.46) | 3.09 |

Both are reported because the guide says to read the unpinned line first, and because
neither on its own is the whole answer. The pin is §9's second case — *"you already
know your candidate's world coordinates match the reference's own — declared in
`frames.json`"* — and here that is checkable rather than claimed: every number in the
rig was computed from `frames.json`'s world box and scale, and the one place it was
tested independently, the stone converged to within **0.14 / 0.27 frame px** of the
position derived from that arithmetic, with the plate scale coming back 1.99836
against the exact 2.0 read off the art's alpha box. So 3.50 is what the shot measures
and 8.73 is what an unsettled framing loop costs on top of it. The honest summary is
that the difference between them is not the animation.

### check — the drift table

```
   f0010   9.49   ball    3.1  tmpl 0.42   3/3
   f0021   9.44   ball    1.4  tmpl 0.47   3/3
   f0023   9.54   trail   1.3  tmpl 0.77   3/3
   f0039   9.59   stone   3.1  component   3/3
   f0045   9.34   stone   2.7  component   3/3
   f0047   9.33   stone   2.7  component   3/3
   f0049   9.69   stone   3.2  component   1/3
   f0050   9.59   stone   4.1  component   2/3
```

- **MAE is flat, not spiky** — 8.29 to 9.69 across every frame of both sets. Per §9.2
  that is the signature of framing or art, not of timing: there is no frame where the
  animation arrives at the wrong moment.
- **The "stone" drift is the matcher, not the rig.** The stone is static and was fitted
  to a third of a pixel; it is named as the worst slot only on f39 and f45–f50 — exactly
  the frames where the comet touches or overlaps it, and where the `slots` column drops
  to 1/3 or 2/3 because the connected-component matcher has merged the comet into the
  stone. A real stone misplacement would show on all 69 frames.
- **The `ball` drifts are `tmpl` with low confidence** (0.42, 0.47) — the fallback
  matcher, because the reference merges ball and trail into one component. Measured
  like-for-like instead (the same neck-split estimator run over both sides, excluding
  the eight frames the brief says are unsplittable), the ball box differs by
  **−0.20 px in width and −0.30 px in height on average**, and the trail bend by
  −0.4 px of median. That is the number to believe about the ball.
- **f0010** is the worst real frame: the trail sits about 3 px long there.

### diff vs `6-arcs/pro` — where this rig is and is not the reference's

| Section | mean | What it says |
| --- | --- | --- |
| animations | **0.810** | `count`, `names`, `duration`, `draw_order` and `deform` all 1.000. `key_counts` 391/539. `timeline_kinds` 8/16. `curve_kinds` **34/539** |
| bones | 0.433 | 12 against 14; `depth_histogram` 0.643 and `degree_sequence` 0.714 name-agnostically |
| attachments | 0.321 | same count and same skin; `mesh_vertices`, `mesh_triangles`, `mesh_weighted`, `mesh_hull` all 0/2 |
| slots | 0.306 | same count; different names, order and bindings |
| constraints | **0.000** | 0 against 4 |
| events | 1.000 | neither side has any |

Read rather than scored:

- **The timing is right and the interpolation is not.** Duration matches inside a
  frame, the animation is named and counted alike, and 391 of 539 keys are there. But
  `curve_kinds` is 34/539: the reference's keys are overwhelmingly bezier and mine are
  linear. That is a deliberate choice recorded in [`LOOP.md` §12](LOOP.md) — with keys
  landing every one to three frames of a 12 fps reference there is almost nothing left
  for a curve shape to be constrained by, and §8's standing lesson is that a guessed
  curve is where the error lives. It is the single largest structural gap and it is the
  one I would fix first with a denser reference.
- **`deform` scores 1.000, meaning neither side uses deform timelines.** The reference
  bends its trail with bones too. The mesh measures nonetheless read 0/2 — the reference
  carries **two** mesh attachments where this rig carries one, so nothing pairs.
- **`constraints` 0/4 is real and expected.** The rung's gate line names *"transform
  constraints (first appearance, static)"*, and nothing in 69 rendered frames can show
  that a bone is driven by a constraint rather than keyed directly: the pixels are
  identical either way. Building four constraints would have been a guess dressed as a
  reading. This is the clearest example on this rung of §9.3's "anything a frame does
  not contain".
- **Names, slot order and bindings score low, and the brief says they may.** Names are
  ours; `diff` prints name-agnostic figures beside the name-matched ones for exactly
  this reason, and those are the ones that carry information here — 0.643 depth
  histogram, 0.714 degree sequence, from a chain shaped by the trail rather than copied.

## Known-wrong, in order

1. **f47–f50** — the reference curls the trail into a ring whose interior shows the
   stone through it; the candidate reaches the mass and the extent and loses the hole.
   Confirmed a model limit, not an optimiser failure: 30,000 random poses per frame plus
   refinement found nothing better, and 5/6/8-segment chains are within 0.8 % of each
   other.
2. **The ball over-squashes on eight contact frames.** Proportion reaches **2.05** at
   f2 and **0.52** at f50, against the 1.80 / 0.76 extremes that both the brief's
   third-party pass and my own like-for-like estimator read off the reference; f2
   measures 23×9 where the reference measures 17×11. A clamp to [0.72, 1.85] was
   written for exactly this and **did not take** — it refused steps that left the
   range and never pulled back a warm start that was already outside it, and that was
   discovered by reading the emitted keys after `bench` had run. The specs were left
   alone rather than edited past the finish line. [`LOOP.md` §13](LOOP.md).
3. **The one-frame tracker reveal is 1 px up-left** — the reference's core pixel is
   (460, 86); the candidate puts `46,49,146` at (459, 85). It rides `tail6` at offset
   (0,0), so this is the trail tip's own pixel, and no offset was invented to hide it.
4. **Interpolation shape** — linear where the reference is bezier, as above.
5. **Bone `length`, `inherit`, parentage, names, and the four constraints** are not in
   the frames and are not claimed.

No `authoring/` directory is committed with this run. The measurement and fitting
scripts were written against absolute worktree paths and would need a rewrite to sit
under the repository's `typecheck` and `no-explicit-any` gates; [`LOOP.md`](LOOP.md)
describes each estimator and the fitting loop in enough detail to rebuild them, and
every figure they produced is cross-checked there against the brief's own.

The full loop, including the three bugs that were green at the gate and only visible
by rendering the candidate back, is in [`LOOP.md`](LOOP.md).
