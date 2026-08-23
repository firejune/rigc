# Rung 3 — attempt 2 (the first with the editor-conventions guide)

- date:      2026-08-23
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- inputs:    `bench/briefs/3-timing-and-spacing.md`, `docs/AUTHORING.md` (**including §10**),
             `bench/runs/README.md`, `examples/3-timing-and-spacing/images/`,
             `bench/reference/3-timing-and-spacing/` (contact sheets, 86 stills, `frames.json`)
- reference: **not read.** No file under `examples/*/export/`, `bench/transcriptions/`,
             any `bench/runs/*-rung*` directory, `docs/SPEC_COVERAGE.md`, `docs/LADDER.md`,
             `docs/feature_matrix.*`, `bench/count_features.ts` or `bench/render_reference.ts`
             was opened, and no git history or PR body was read. No web search was made.
- guide:     **AUTHORING.md §10 in hand** (standard input from 2026-08-23)
- profile:   spine
- clean:     yes — `bench` was run exactly once, at the end, and nothing was edited after it.

## What was measured before anything was authored

`check` cannot be run before there is a candidate, so the first half of the work was
measuring the frames (§8). Every number in the specs came out of one of these, and the
scripts are in [`tools/`](tools/) so a reader can re-run them:

| what | how | result |
| --- | --- | --- |
| render scale | `frames.json` viewport | 1 frame px = 8.501386 world units, bg `#e8e8e8` |
| both parts at scale 1 | art alpha box × scale vs the rendered box | 743×210 u → 87.4×24.7 px (observed 88×25); 157 u → 18.5 px (observed 19) |
| pivot | circle fit of the **big ball's** centroid over all 86 frames | (91.015, 23.095) px, orbit R = 68.795 px, fit rms **0.046 px** |
| cross-check (§8) | the same fit on each shot separately | heavy R = 68.802, light R = 68.519 — and the art predicts 68.778 from its own geometry |
| estimator bias | the same estimator run over the source PNG | the ball's darkness centroid sits 2.145 u off the bar axis → a constant **+0.210°** on every reading, removed |
| bar angle | PCA + centroid of an annulus 26–54 px from the pivot | agrees with the ball estimator to ~0.1°, and the annulus **cannot contain the block** (nearest block pixel is 64 px out), so the two merged frames are still measurable |
| block position + rotation | template correlation of the f0 block against every frame, solving (x, y, θ) | removes the rotation-dependent bias a coverage centroid has; see below |
| draw order | interior detail (§8) | at heavy f9 and light f4 the ball's outline is whole and the block's left edge and border line stop at it ⇒ **block behind, pendulum in front**, in two independent shots |
| holds | consecutive-frame pixel diffs | heavy: block still f0–f8, moves f9, still again from f29; the pendulum never fully stops (max Δ still 6/765 at f63→f64). light: block still f0–f3, moves f4, still from f6; pendulum **bit-identical** f18/f19/f20 |

Two measurement traps caught here, both of the shape §8 warns about:

- **A coverage-weighted centroid of the block is not its centre.** It read the block
  0.19 px higher at heavy f29 than at f0 — and f29 is the same block rotated 180°.
  A sub-pixel correlation of the two patches puts the real displacement at
  (−0.04, −0.04) px. The bias rotates with the part, so every rotated frame was wrong
  by a rotated version of it. Re-measured by template fit; the numbers in the spec are
  the template ones.
- **The first swing's deceleration is real, and it is not a corner.** Central-difference
  speed peaks at f8.3 (30°/frame) and the block is first touched at f9, so the peak is
  *before* contact and the fall after it is smooth. §8 records an earlier run reading a
  corner at contact from a contaminated estimator; measured on an annulus that excludes
  the block, there is none here either — but the fall is genuinely much faster than the
  rise (8 frames up, 3.5 down), which is why the release needed two keys and not one.

Curves were then fitted rather than guessed: a least-squares fit of Bezier handles per
segment, then a joint fit of a **named-easing vocabulary + key times + key values**
against all 86 frames at once (`tools/fit-motion.ts`). Final model residual **0.097 px
rms**, worst 0.36 px.

## Loop

### 1 — build
`bun cli.ts build --rig …/pendulum.rig.json --motion …/pendulum.motion.json --images examples/3-timing-and-spacing/images --out …/spine --profile spine`

**Green on the first run.** 17 PASS, 0 FAIL, 1 SKIP (`A31_DRAW_ORDER_OFFSETS_RESOLVE`:
no drawOrder timeline), 15 PROF. No `CompileError` at any point in the run — the guide's
field tables were enough to get both files right without a failed compile.

### 2 — explain (failed for a silly reason, recorded per the protocol)
`bun cli.ts explain --rig … --motion … --out …` →
`rigc compile error: image "square.png" is not on disk at …/bench/runs/2026-08-23-rung3-2/examples/…`

`build` had been given `--images`; `explain` had not, so the rig's own `images` field
resolved **relative to the rig file** rather than the working directory. §0's flag table
says `--images` is "relative to your working directory" and overrides the rig's field,
but the four `explain`/`diff`/`check`/`bench` examples above it do not show it, so it is
easy to drop. Re-ran with `--images`: slot table correct, both slots present, draw order
as intended, and **no `path` written** in the emitted file (§10.1 — the placeholders equal
the PNG basenames).

### 3 — check
`bun cli.ts check --candidate …/spine --frames bench/reference/3-timing-and-spacing`

heavy **MAE 12.64** / light **14.70**; worst slot drift 0.50 px (heavy) / 1.03 px (light).
Two things came out of the per-slot JSON:

- the block's drift is a flat **−0.32 px in y** from f29 on — my block renders 19×18 where
  the reference's is 19×19, i.e. it had crossed a pixel boundary;
- decomposing the pendulum's drift about the pivot gives radial +0.04 px and **tangential
  +0.113 px ⇒ a −0.135° rotation error**, constant across all 86 frames. That is almost
  exactly the +0.143° that the art-bias correction had predicted and that I had then
  subtracted out to make f0 read a clean 0. Two independent routes to the same number, so
  the correction went back in and f0 is authored at 0.143°.

### 4 — check with `--viewport` pinned to the reference's own box (diagnostic, reverted)
`… --viewport -573.317…,-81.246…,2176.354…,990.146…`

`content candidate 201.0x89.7px at (0.0, 17.3)` — clipped at the left edge — and
`in units … x0.8978`, MAE 144. My world origin is **my own** (I put the block's rest
position at x = 0 and the floor at y = 0), so §9's second legitimate use of `--viewport`
("your coordinates already match the reference's") does not apply here, however tempting
`frames.json` looks. Dropped; every number below is from a fitted framing.

### 5 — build, check (after the template re-measure of the block and the +0.143° correction)
heavy **13.24** / light **14.63**. Tangential systematic gone (−0.135° → −0.024°) and the
block's y drift down from −0.318 to −0.119 px — but MAE **rose**, because the framing
refit (`fit x0.999581 → x0.999036`, aspect −0.26% → −0.05%). §9's warning about comparing
across a refit is not theoretical: it costs about ±0.5 MAE between builds.

### 6 — sweeps with `--viewport` pinned to **my own** fitted box (§9's third use)
Region-offset sweeps were non-monotonic unpinned and clean pinned, so the sweeps ran
pinned. The first useful finding: the pendulum bone was ~2 units (0.24 px) too high.

### 7 — build, check (pivot y 708 → 706)
heavy **11.92** / light **12.22**, both confirmed **unpinned**.

### 8 — a pinned coordinate descent over six geometry numbers (reverted)
Pinned score 11.99 → 10.66; the same rig **unpinned** scored 12.37/14.98, worse than what
it started from. The pin was fitted for an earlier geometry, so the descent was walking
toward the stale box. Reverted, and every step after this was accepted only on an
**unpinned** re-check.

### 9 — unpinned coordinate descent on the four geometry numbers
Converged on the pendulum region x = −316.8 (art-derived: −316.14) with the pivot at
(−177.8, 706). heavy **10.59** / light **12.79**.

### 10 — build, check (light gets its own swing easing)
The shared `swing` shape left light's first return 0.56 px out at f6 — a real model error,
not check noise, and §10.4's "add another key / adjust the handles" case. Splitting
`swingl` out dropped light's model residual from 0.178 px to 0.006 px:
heavy **11.22** / light **11.14**.

### 11 — build, check (two more block keys)
`tools/fit-motion.ts` showed the block's single-span spin lagging 0.97 px at f9 and 0.76 px
at f10, and its slide 0.46 px out at f22 — again §10.3's "one Bezier span could not hold
the shape". Added one key to `block.rotate` (f10.6) and a fourth to `block.translatex`
(f21.4). Model residual 0.149 → **0.097 px rms**. heavy **10.08** / light **11.10**.

### 12 — final micro-descent, final build, final check
Pendulum bone x −177.8 → −177.2. Final: heavy **MAE 9.84**, light **MAE 10.93**,
worst slot drift 0.9 px / 0.7 px, `validate` green.

Milestones above are 6 builds; the geometry sweeps in steps 6–12 ran a further ~70
`build` + `check` pairs, all of them the same two commands with one number changed.

| check | heavy MAE | light MAE | worst drift |
| --- | --- | --- | --- |
| 3 (first) | 12.64 | 14.70 | 0.50 / 1.03 px |
| 5 | 13.24 | 14.63 | 0.83 / 0.61 px |
| 7 | 11.92 | 12.22 | 0.83 / 0.51 px |
| 9 | 10.59 | 12.79 | 0.80 / 0.51 px |
| 10 | 11.22 | 11.14 | 0.90 / 0.60 px |
| 11 | 10.08 | 11.10 | 0.90 / 0.70 px |
| 12 (final) | **9.84** | **10.93** | 0.9 / 0.7 px |

## Result

`bun cli.ts bench 3 --candidate …/spine --frames bench/reference/3-timing-and-spacing --json bench.json`

```
  ── summary ──
  validate   green  (profile spine)
  ess        bones=0.567  slots=0.476  attachments=0.870  constraints=1.000  animations=0.936  events=1.000
  framing    fit x0.999458  rms 0.25px  union residual +0.50 x +0.01px  (fitted to the candidate's pixels, 4 pass(es))
  heavy      MAE mean=9.84 worst=17.43  over 65 frame(s)  worst slot drift 0.9px, attributed in 65
  light      MAE mean=10.93 worst=16.37  over 21 frame(s)  worst slot drift 0.7px, attributed in 21
```

Counts all match: `bones=3/3 slots=2/2 skins=1/1 attachments=2/2 constraints=0/0 animations=2/2 events=0/0`.
Under `animations`: `count 2/2 · names 2/2 · duration 2/2 · timeline_kinds 8/8 · draw_order 2/2 ·
deform 2/2 · key_counts 49/69 · curve_kinds 49/69`.

## Notes — what the frames could not say, and what the guide should

**The measures that are low are the ones frames cannot carry.** `bones names 1/5`,
`slots bone 0/2`, `attachments names 1/3` are all downstream of one free choice the brief
explicitly grants ("Names are yours"). `bones parent_by_name` and `order` follow from the
same choice. The two that are *not* naming are worth naming:

- **`bones length_present 1/3` and `inherit_present 1/3`.** The reference declares a setup
  `length` and an `inherit` on bones where I declared neither. §9.3 lists bone `length` and
  the setup `inherit` mode as things a frame cannot contain, and §10 does not mention them —
  so I omitted them under §10.5's "declare only what the shot needs". But a bone in the
  Spine editor is *created by dragging*, which gives it a length; only a bone made by other
  means has length 0. That is a public-documentation fact of the same kind as the rest of
  §10 and it would have moved two measures. **Suggested §10.1 line:** a bone drawn with the
  Create tool has a non-zero `length`; a rig with every bone at length 0 is not one a person
  drew.

- **`key_counts 49/69`.** The reference carries ~40% more keys than I authored, and §10.6
  is explicitly right that no public page gives a density figure — I did not aim at one. What
  I did instead was §10.3's rule ("key every change of direction… and wherever one Bezier
  span could not hold the shape"), and it produced 49. The gap is the interesting result of
  this run: the editor's *habit* (§10.3's Auto Key + Clean Up) puts keys where a value
  changes at all, not only where a span fails, and there is no way to get from the frames to
  the ones a curve already explains. At 0.117 px/unit a key that a span already covers moves
  nothing, so `check` cannot ask for it and `bench` can — exactly the divergence §10 was
  written for, and the one line of it that no convention can close.

- **One repeated value, and the frames insist on it.** §10.3 records Clean Up deleting
  "keying the same value multiple times in a row", but light's f18/f19/f20 are *bit-identical*
  and R7 needs a key at 1.6667 s to make the duration. So `light`'s rotate track holds
  90.139 at both 1.5 s and 1.6667 s. Either the reference did not run Clean Up, or its
  duration comes from a timeline I did not think of. Worth a §10.3 sentence: a hold at the
  end of a shot is what sets the exported duration, and Clean Up does not remove it.

- **`--images` is not optional for `explain`.** See step 2. A one-word addition to §0's
  command list ("`explain --rig … --motion … --images … --out …`") removes a whole loop turn.

- **The framing refit is a real cost between builds, and the obvious fix is a trap.**
  `--viewport` pinned to *the reference's* box is wrong whenever the rig has its own origin
  (step 4), and pinned to *a stale box of your own* it will happily walk you backwards
  (step 8). What worked was: sweep pinned to your own current box to get a clean gradient,
  then accept the step only on an unpinned re-check. §9's three bullets describe all the
  pieces; they do not describe that procedure.

- **`check`'s slot drift and its MAE disagree, and MAE is the one to follow.** The drift
  said my pendulum sat 0.14–0.33 px too far *out* along the bar; MAE said move it *further
  out* still, and MAE was right (10.6 → 9.8 following it). The cause is visible in the JSON:
  my candidate draws ~5% fewer pixels than the reference for the same bounding box, so the
  component centroid that drift is built on is measured on a slightly eroded silhouette
  while MAE is measured on the pixels themselves. A note in §9.2 would save the detour.
