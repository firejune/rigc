# Rung 3 — attempt 1

- date:      2026-08-23
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- inputs:    `bench/briefs/3-timing-and-spacing.md`, `docs/AUTHORING.md`,
             `bench/runs/README.md`, `examples/3-timing-and-spacing/images/`,
             `bench/reference/3-timing-and-spacing/` (contact sheets + all 86 frames),
             `src/rig.ts`, `src/types.ts`, `src/timelines.ts`, `bezierForChannel` in
             `src/compile.ts`, the `A10` stepping loop in `src/validate.ts`
- reference: **not read.** `examples/*/export/`, `bench/transcriptions/`,
             `docs/SPEC_COVERAGE.md`, `docs/LADDER.md`, `docs/feature_matrix.*`,
             `bench/count_features.ts`, `bench/render_reference.ts` and git history
             were never opened. No web search.
- profile:   spine
- verdict:   **clean run.** `bench` was run once, at the end, and nothing was
             edited afterwards.

A note on the filename: `bench/runs/README.md` calls the loop log `log.md`. This
run was commissioned with `LOOP.md` + `README.md`, so that is what is here.

---

## Before the first build — the authoring pass

The gate was green on the first compile, so the honest record of "what this agent
could not tell without checking" is not in the build log; it is here. Every number
below came out of the rendered frames, which the brief supplies.

### 1 — what the shot is made of

Contact sheets first, as the brief asks. Two plates, one pivot, one struck block,
no colour changes, no attachment swaps, no squash (the pendulum's silhouette is
the same length in every frame and the block's minimum-area rectangle is 18.6 px
square throughout). So: three bones, two slots, four bone timelines per animation.

### 2 — measuring the frames

The frames are 256x116, so eyeballing spacing off a contact sheet is not good
enough for a rung whose subject *is* spacing. I measured instead, with numpy/PIL:

- **Pivot and scale.** The bar's axis passes through the fixed pivot in every
  frame, so a least-squares fit of `centroid = pivot + d * axis` over all 86 frames
  gives both. Result: pivot at frame px (90.99, 23.09), residual 0.21 px, and
  `d = 47.36` px against 406.72 px measured on `pendulum.png` — a render scale of
  **0.11644 frame px per image px**, agreeing to 0.06 % between the two shots.
  That is what let me author in image pixels and check against the frames.
- **Pendulum angle.** Direction from the pivot to the centroid of the pixels in an
  annulus 12–48 px out — i.e. the bar, with both balls and the block excluded.
- **Block.** Centroid of its connected component (rotation-invariant), rotation
  from the minimum-area rectangle unwrapped across the 90° symmetry, sign taken
  from where the red marks sit relative to the centre.

Reading `heavy`: the bar leaves the raised pose at 0.0°/frame, peaks at 33°/frame
between f8 and f9, overshoots to +130.6° at f12, then rocks back through
extremes at roughly f21.5 / f31 / f36.5 / f42 / f46 / f51 with amplitudes
40 / 27 / 16 / 9 / 4 / 2.4 / 0.9° about vertical — the half-period shrinks from 10
frames to 3 as well as the amplitude. `light` does the whole fall in 4 frames and
has one 8° overshoot.

### 3 — the dead ends

**(a) The impact frame that wasn't.** My first pass took the pendulum's axis from
a PCA of the whole silhouette. On the one frame per shot where the ball and the
block touch, they label as a single blob and the block's mass drags the axis:
`heavy` f9 read 118° instead of 107°. I believed that for a while and it told a
tidy story — 44°/frame at impact, then 5°/frame, an obvious energy transfer. It
was an artefact. The bar-only annulus estimator (above) is what killed it, and the
real reading is a smooth 33 → 16 → 6 → 1°/frame deceleration with **no corner at
contact at all**. If I had authored the tidy story it would have needed an extra
key at f9 in both the spec and the reference's, and it would have been wrong.

**(b) A 90°-symmetric mask and a sign.** To keep the block out of the pendulum's
PCA I subtracted its rotated footprint — and rotated the test box the wrong way.
A square is symmetric under 90°, so the error is `2*theta mod 90`: invisible while
the block is upright, and by the time it has tumbled 25° the box misses the corners
and leaks them into the pendulum. `light` (block barely turns) stayed correct while
`heavy` produced a *negative* render scale. Two shots measured by one script, one
of them silently wrong, is the shape of bug this whole exercise is about.

**(c) Rolling, or bouncing?** The heavy block's centre rises again after f15, and
a square rocking on a corner also lifts its centre, so I checked whether the block
was simply rolling: `(s/2)(cos φ + sin φ)` predicts 0.8 px of lift at f16 where the
frames show 7.8 px. It is a real second hop. **But** the same formula explains
f23–f28 to within 0.2 px — so the last six frames of the block are the corner-rocking
geometry, which is why its `translatey` cannot return to 0 until its rotation does.
That pair of keys (`f23 = 5.3`, `f26 = 11.8`) looks like noise-fitting and is not.

**(d) Draw order, nearly read backwards.** Where the ball and the block overlap,
the ball's silhouette is cut off flat — and the seam is *background* coloured, not
block coloured, which reads as the ball being clipped by something. Both PNGs carry
a one-pixel fully transparent border whose RGB is white, so the renderer's filtering
bleeds a light halo along the block's edge. The decisive test was the red marks:
at `light` f4 the block's centre is inside the ball's disc and all four marks are
still visible, so **the block draws in front**. Slots are `[pendulum, block]`.

**(e) One `translate`, or two single-axis timelines?** I started with a paired
`translate` for the block, then measured that its x decays monotonically from the
strike to rest while its y arcs, lands, hops and rocks — different key times *and*
different curves per axis, which is exactly the case `AUTHORING.md` §4.4 names.
Split into `translatex` (3 keys) and `translatey` (9 keys). If the reference used
the paired form this costs me on the diff, and I would still author it this way.

### 4 — curves

Key times are pinned to a 24 fps working grid (the reference renders at 12, and
several of its extremes sit visibly between rendered frames — the heavy block's
second apex is flat across f16 and f17). Values and easing shapes were fitted to
the measured series by least squares, then the easings were collapsed into a shared
vocabulary of nine: one fall shape per shot (`heave` / `drop` — the thing that
separates them), one `arc` reused by **every** swing in **both** animations, and
six for the block. Reusing one arc costs about 1.5° at the worst frame versus a
bespoke curve per swing; a pendulum is one mechanism and should read as one.

---

## Loop

### 1 — build

```
bun cli.ts build \
  --rig    bench/runs/2026-08-23-rung3-1/pendulum-and-block.rig.json \
  --motion bench/runs/2026-08-23-rung3-1/pendulum-and-block.motion.json \
  --images examples/3-timing-and-spacing/images \
  --out    bench/runs/2026-08-23-rung3-1/spine \
  --profile spine
```

Green. **17 PASS, 0 FAIL, 0 SKIP, 14 PROF** (7 renderer, 7 archetype).
`pages=2 regions=2 bones=3 slots=2 animations=2 version=4.3.13`.

Nothing to fix, so nothing was changed. **Build iterations: 1.**

The validator therefore caught nothing in this run — worth stating plainly rather
than dressing up. The named failures it would have caught were all designed out
while reading §2 and §5 of the guide: R3 (setup pose declared on the rig slot and
*not* in `motion.setup`), R6 (`ease` xor `curve`), R7 (declared duration equal to
the largest key time on the `pendulum.rotate` track, which is why both animations
carry a final hold key), the last-key-carries-no-easing rule, and R8 (no `from`,
because there is no manifest).

### 2 — explain

```
bun cli.ts explain --rig … --motion … --images … --out …
```

Guide §7.4. Both slots present, in the order declared, showing the setup
attachments meant (`pendulum` → `pendulum`, `block` → `square`); the emitted slot
array is not a subsequence, nothing was silently dropped. Timeline and key counts
as authored: heavy 10/3/9/4, light 7/3/3/3.

### 3 — self-check against the frames (not against the reference export)

Two checks, both against the rendered frames the brief supplies:

- **Pose sampling.** Played the compiled `skeleton.json` through
  `@esotericsoftware/spine-core` at 1/12 s steps and read back the bone poses,
  then differenced them against the measured series. Worst frame:

  | | pendulum rotate | block x | block y | block rotate |
  | --- | --- | --- | --- | --- |
  | heavy | 2.42° | 8.98 u (1.05 px) | 4.49 u (0.52 px) | 3.00° |
  | light | 1.02° | 2.38 u (0.28 px) | 0.09 u (0.01 px) | 0.73° |

  Typical error is well under 1°; the 2.4° is at f29–f30, the cost of the shared
  `arc` easing. Note these are *Spine's* values, not my fitted béziers — Spine
  resamples each curve into ten linear segments, which is worth about 0.9° on the
  very flat opening of `heave`.

- **Re-render.** Composited the two PNGs at the sampled poses and differenced
  against the reference frames pixel by pixel: mean absolute difference 3.44/255
  per frame for `heavy` (worst frame 4.68) and 3.39 for `light` (worst 3.83), most
  of which is resampling, not pose.

### 4 — bench, once

```
bun cli.ts bench 3 --candidate bench/runs/2026-08-23-rung3-1/spine \
  --json bench/runs/2026-08-23-rung3-1/bench.json
```

Output verbatim in **Result** below. Nothing was edited after this ran.

---

## Result

```
  ── validate (profile spine) ──
    15 PASS, 0 FAIL, 2 SKIP, 14 PROF
    SKIP  A09_ANIMATION_DURATION_MATCHES_SPEC: no motion spec supplied, so no declared duration to compare against
    SKIP  A18_DETERMINISTIC_EMIT: no second compile to compare against (re-gating artifacts on disk)

  ── diff vs 3-timing-and-spacing/ess ──
    ..         bones=3/3  slots=2/2  skins=1/1  attachments=2/2  constraints=0/0  animations=2/2  events=0/0   (candidate/reference)

    bones         mean 0.567  over 8 measures
        1.000  count                  3/3
        0.200  names                  1/5
        0.333  parent_by_name         1/3
        0.333  order                  1/3
        0.333  length_present         1/3
        0.333  inherit_present        1/3
        1.000  depth_histogram        3/3         NAME-AGNOSTIC
        1.000  degree_sequence        3/3         NAME-AGNOSTIC

    slots         mean 0.476  over 7 measures
        1.000  count                  2/2
        0.333  names                  1/3
        0.500  order                  1/2
        0.000  bone                   0/2
        0.500  attachment             1/2
        0.500  blend                  1/2
        0.500  color_present          1/2

    attachments   mean 0.870  over 9 measures
        1.000  skins                  1/1
        1.000  count                  2/2
        0.333  names                  1/3
        1.000  type_counts            2/2
        1.000  mesh_vertices          0/0         — neither side has any
        1.000  mesh_triangles         0/0         — neither side has any
        1.000  mesh_weighted          0/0         — neither side has any
        1.000  mesh_hull              0/0         — neither side has any
        0.500  region_size_present    1/2

    constraints   mean 1.000  over 5 measures   (0/0 throughout — neither side has any)

    animations    mean 0.911  over 9 measures
        1.000  count                  2/2
        1.000  names                  2/2
        1.000  duration               2/2
        1.000  timeline_kinds         8/8
        0.609  key_counts             42/69
        0.594  curve_kinds            41/69
        1.000  event_keys             0/0         — neither side has any
        1.000  draw_order             2/2
        1.000  deform                 2/2

    events        mean 1.000  over 2 measures   (0/0 — neither side has any)

  ── summary ──
  validate   green  (profile spine)
  ess        bones=0.567  slots=0.476  attachments=0.870  constraints=1.000  animations=0.911  events=1.000
  Section figures are means of their own measures. There is no rung score:
  a rung is cleared by a person reading the measures, and docs/LADDER.md records it.
```

`bench.json` holds the same report machine-readably. Nothing in this directory was
edited after this ran.

---

## Notes for the guide

Things the brief and the frames *did* supply, and did well: durations, whether it
loops, the two first-move frames (f9 / f4) and the two rest frames (f30 / f6). All
four checked out against measurement, which is a good sign for the leakage rule —
they are exactly the facts a client could state.

Things I had to decide with nothing to check them against, which is where a clean
run's uncertainty actually lives:

1. **The stage.** `skeleton.width/height` is required with no manifest and the
   brief says nothing reads it, so it is a guessed number that `A14`/`A19` would
   have measured against had the profile been `spine-html`. Fine here; worth
   knowing it is a hole by design.
2. **Where the origin is.** I put it on the pivot. Nothing observable depends on it.
3. **Bone `length`.** Omitted. The bar points along the bone's **-x** (the art has
   the mass at the left and the pivot at the right, and the setup pose is the
   raised pose), so a positive length would draw the bone away from its own mass.
   A rig with `rotation: 180` on the bone and `rotation: 180` on the attachment to
   cancel it would let the bone point at the ball, at the cost of two emitted
   fields. Neither is checkable from the frames.
4. **Key density.** Nothing in the frames says whether the reference keys every
   extreme or every frame. I keyed extremes plus breakdowns where a single cubic
   could not hold the samples within about a pixel.

Guide defects, small:

- `explain` labels every bone timeline `<- bone track (mesh tier)`. This rig has no
  meshes; the tag reads as if the track were driving one.
- `explain`'s bone header prints `(crop y-down -> spine y-up, origin at the
  bottom-left of the crop)` even with no manifest and therefore no crop.
- §7.2 says "read the SKIP lines". A foreign-skeleton rig on `--profile spine`
  produces no SKIP lines at all — every archetype assertion comes back `PROF`
  instead, because the profile excludes them before the missing `invariants` can
  make them skip. Saying so would save a reader looking for something that is not
  there.
- Nothing in the guide says whether key times are expected to land on a frame grid.
  They are seconds and need not; a sentence would have saved a decision.
- §4.4's paragraph on single-axis timelines not being sugar was the single most
  load-bearing sentence in the guide for this rung.
