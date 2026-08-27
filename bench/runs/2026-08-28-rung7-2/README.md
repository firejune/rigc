# Rung 7 — `7-anticipation`, attempt 2

- date:      2026-08-28
- agent:     Claude Opus 5 (1M context), Claude Code / Agent SDK
- brief:     [`7-anticipation.md`](../../briefs/7-anticipation.md) **revision 3**, third-party verified 2026-08-28
- inputs:    the brief; [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) in full, §8, §9 and §10 included;
             `examples/7-anticipation/images/`; `bench/reference-local/7-anticipation/` and its
             `frames.json`, rendered by this session at the brief's exact flags; this
             repository's own source as documentation of the formats and the measures
             (`src/rig.ts`, `src/types.ts`, `src/render.ts`, `src/check.ts`, `src/slots.ts`,
             `src/framing.ts`, `src/timelines.ts`, `tools/plate.ts`, `README.md`)
- atlas:     `examples/7-anticipation/export/7-anticipation.atlas` — opened **once, after the
             candidate was final**, for §9.2's texture-floor diagnostic only. The build needs
             no atlas: rigc emits its own from the loose PNGs
- reference: **not read.** `examples/7-anticipation/export/sack-pro.json` was never opened,
             nor `bench/transcriptions/`, `docs/SPEC_COVERAGE.md`, `src/ladder.ts`'s gate
             strings, `docs/LADDER.md`'s status table / per-rung sections / *Operating rules*,
             the per-rung issue threads, any previous run's directory, or git history
- guide:     AUTHORING.md §10 in hand
- profile:   `spine`
- bench:     run **once**, at the end. Not bench-assisted
- frames:    rendered locally, **never committed**. `git ls-files bench/reference-local`
             reports **0**, checked before every commit of this run

## The frames

```bash
bun run fetch-examples
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256 --fps 24 --stride 999
bun bench/render_reference.ts --rung 7 --max 1024 --tile 256 --fps 30 --stride 999
```

Flag for flag. Frame counts came back 21 / 35 / 9 / 37 at 12 fps and 41 / 70 / 17 / 73 and
51 / 87 / 21 / 91 at 24 and 30 — the brief's table, digit for digit. `frames.json`: viewport
1024 × 798 px, 0.189871 px per unit.

🚫 **This example ships no upstream `license.txt`, so no frame of it may be committed,
published or shipped.** Nothing in this directory is a rendered frame, and the candidate's
atlas points at the example's own PNGs by relative path rather than carrying copies of them.

## What was built

One skeleton, `sack`, **8 bones / 3 slots / 4 animations**, `--profile spine` green.

| slot | drawn from | attachment | bone |
| --- | --- | --- | --- |
| `cape-back` | `cape-back.png` | region | `panel` |
| `sack` | `sack.png` | **weighted mesh**, 45 verts / 64 tris, hull 24, 5 × 9 grid | `sack1` |
| `cape-front` | `cape-front.png` | region | `collar` |

Bone tree: `root` → `body` → { `sack1` → `sack2` → `sack3` → `sack4`, `collar`, `panel` }.
Names carried straight through from the PNG basenames (§10.1). `body` carries **translation
only** — it holds no attachment, so keying its rotation as well would be a gauge (§10.3).

**Draw order** — `cape-back`, `sack`, `cape-front`, i.e. the panel behind and the collar in
front, both as the brief's revision 3 states them as measured. No `drawOrder` timeline: the
frames settle two edges and nothing about them changes over time.

**Two structural decisions the brief deliberately left open**, both recorded at the moment
of deciding (§9.3's ⚠️):

- **The sack deforms.** The brief proves no affine image of `sack.png` fits any frame. Built
  as a weighted grid mesh on a four-link chain up the sack's own height, so it squashes,
  stretches and leans and its knots move relative to its body.
- **The cape panel does not.** Built as **one bone placing one region** — translate, rotate,
  scale each axis. Decided by building both hypotheses and fitting them with the identical
  fitter, budget and objective from a baseline where both rigs score **11.14** on
  `hello/f0000` unfitted: the region variant wins on all four shots
  (**19.55 / 27.10 / 24.21 / 25.39** against **23.13 / 32.45 / 27.30 / 27.15**). The frames
  agree — the passage that looks least affine, `fall-in` f0's two crimson wings with a real
  gap between them, is explained by the **collar**, whose art is a wide chevron whose arms
  reach exactly those outer corners. ⚠️ **Caveat**: the mesh variant carries 30 knobs against
  the region's 24 at the same search budget, so part of that gap is search rather than
  mechanism. `LOOP.md` §10 has the full working.

**Durations declared from the brief's table, not from the frame counts** — 1.6667 s,
**2.8667 s**, 0.6667 s, 3.0000 s. `A09_ANIMATION_DURATION_MATCHES_SPEC` **PASS**. `hello`'s
terminal pose exists in exactly one file — its 30 fps last still at 86/30 s, which the 12 fps
set (ending 2.8333 s) does not carry — so it was fitted like any other frame and keyed at the
declared duration, rather than a hold being written across the gap (AUTHORING §9's ⇒ ①).

**64 timelines, 1,273 keys, 8 named easings.** Tolerance **0.40 px** at the end of what each
bone swings, floored per channel at `min(that channel's own basin, 1.5 px)`.

## The measures

`bench 7`, verbatim. Validity is the only pass/fail and it is green.

```
  validate   green  (profile spine)
  sack-pro   bones=0.128  slots=0.857  attachments=0.407  constraints=0.000  animations=0.798  events=1.000
             bones 0.128 (name-matched) · 0.213 (name-agnostic)   slots 0.857 (name-matched) · 0.333 (name-agnostic)
  framing    one per set (12); one shared box leaves x1.000056, rms 9.41px
```

| set | MAE mean / worst | MAE over the reference's own px | worst slot drift | attributed | per-frame change | sheet mean / worst |
| --- | --- | --- | --- | --- | --- | --- |
| `fall-in` | 18.64 / 34.95 @f0 | **19.17** | **2.0 px** `sack` @f8 | 16 / 21 | **all 20 agree** | — |
| `fall-in@24fps` | 21.60 / 33.97 | 22.29 | 1.8 px `sack` | 1 / 2 | n/a (2 stills) | 22.17 / 62.44 (ref 23.23) |
| `fall-in@30fps` | 21.61 / 33.97 | 22.30 | 1.8 px `sack` | 1 / 2 | n/a | 22.74 / 66.48 (ref 24.05) |
| `hello` | 24.96 / 39.51 @f21 | **26.20** | **2.7 px** `sack` @f4 | 19 / 35 | **all 34 agree** | — |
| `hello@24fps` | 27.35 / 34.27 | 28.29 | 0.5 px `sack` | 1 / 2 | n/a | 33.09 / 58.64 (ref 36.08) |
| `hello@30fps` | 26.67 / 32.93 | 27.54 | 0.5 px `sack` | 1 / 2 | n/a | 34.30 / 58.47 (ref 37.61) |
| `walk` | 21.73 / 25.29 @f2 | **22.56** | **2.1 px** `sack` @f5 | 7 / 9 | **all 8 agree** | — |
| `walk@24fps` | 21.43 / 21.93 | 21.97 | 0.3 px `cape-front` | 1 / 2 | n/a | 26.63 / 41.14 (ref 27.79) |
| `walk@30fps` | 21.04 / 21.93 | 21.57 | 0.4 px `cape-front` | 1 / 2 | n/a | 26.90 / 39.74 (ref 28.11) |
| `cape-follow-example` | 23.92 / 38.70 @f19 | **24.93** | **2.8 px** `cape-front` @f19 | 29 / 37 | **all 36 agree** | — |
| `cape-follow-example@24fps` | 21.22 / 22.73 | 22.02 | 0.8 px `sack` | 2 / 2 | n/a | 28.30 / 71.81 (ref 30.38) |
| `cape-follow-example@30fps` | 21.24 / 22.77 | 22.04 | 0.8 px `sack` | 2 / 2 | n/a | 29.25 / 72.77 (ref 31.64) |

Chain rollup, across every set:

```
  chain                worst slot drift across every set                            mean   MAE in it    share
  sack1                2.7 px "sack" in hello/f0004                               1.2 px       16.28    66.0%
  collar               2.8 px "cape-front" in cape-follow-example/f0019           0.8 px       42.53    16.5%
  panel                no slot attributable in any set                                 —       44.04    15.7%
```

**0 reference components go unreached, in any set.** The drawn inventory is complete: three
parts, all three drawn on every frame of every animation.

## The reading

**Worst attributable slot drift, over all 12 sets and all 118 compared frames: 2.8 px**, on
`cape-front` at `cape-follow-example` f19. The next worst is 2.7 px on the sack. That is the
clause the first attempt failed at 7.33 px, and it is the cape that carries it here too — so
the figure is comparable in kind, on the same measure, from the same frames.

**Every adjacent pair of every committed 12 fps set changes by as much as the reference's own
frames do — 98 pairs, 0 disagreements.** Reaching that took most of the run and is the whole
of `LOOP.md` §9.

**Where the error is.** The `sack1` chain carries 66 % of the difference at **16.28 per
pixel** — the lowest figure per pixel of the three, which is what says it is *large* rather
than *wrong*. The two cape chains carry a third of the error at 42.53 and 44.04 per pixel,
which is where a further attempt should go: the cape is the part the composite objective can
least see, and it is the part the shot is about.

**Why `panel` reads `no slot attributable in any set`, and why that is not a hole.** The
panel is drawn **behind** the sack, so three quarters of its own template sits over reference
pixels that are beige, the best residual exceeds half the template's own contrast, and
`src/slots.ts`'s matcher returns **no match** — its documented answer for a part it cannot
honestly name a distance for. The panel draws throughout (15.7 % of the error share, 44.04
per pixel); a missing part would show up in the report's `(unattributed)` row and in the
unreached-component count, and both are clean. This was predicted from `src/slots.ts` before
any build, not discovered afterwards (`LOOP.md` §7).

**Naming.** `bones` reads 0.128 name-matched and `slots` 0.857. §10.1's largest lever applies
here only half way: the three PNGs are named after the parts, so the slot and attachment names
carry through and `slots` is high — but no public fact names this rig's *bones*, and every
candidate name is as good as every other (§10.1's ⚠️). The low `bones` figure is the honesty
rule's price on this shot, not a defect in the rig.

**`constraints` is 0.000 on both sides' terms** — this rig declares none. Nothing in the
frames asks for one: the cloth's lag is a behaviour, and the brief says outright that whether
it is simulated, driven or keyed is not decidable from the frames. Keyed by hand here.

## Known-wrong, and the trades

- ⚠️ **Three frames of `cape-follow-example` are deliberately less faithful than the fit made
  them**: f32/f33, f33/f34 and f34/f35 were contracted toward each other at a cost of
  **+6.89, +7.06 and +7.08** composite units to bring their own frame-to-frame change inside
  `check`'s band. Ten further pairs were contracted at +0.13 to +2.66. This is §10.3's
  recorded trade, and the frames it was paid on are named because a contraction reported as a
  fit is the same dishonesty as a hold reported as a measurement.
- ⚠️ **The candidate's union content box is 15.4 px narrower than the reference's**, and the
  fit leaves 9.41 px rms across the frames' edges — so no single scale and offset puts the two
  shots on each other. Something in this candidate is a slightly different shape, most likely
  the cape's extremes on the frames where it streams widest. Not chased: shrinking a part to
  fit the box trades a framing cost for a wrong silhouette.
- ⚠️ **The panel's pose is only weakly identified and is partly a prior, not a measurement.**
  Its own basin against the composite objective is 4.5 px in rotation; through the passages
  where the sack hides it the per-frame fit chose it from noise (measured: 24° → 112° → 7°
  across three frames the body crosses in 0.4 px), and it was regularised rather than fitted
  there. Its trajectory in those passages is a smooth trend, which the reference's own
  monotone furl supports but the frames do not pin.
- 📌 **`hello` attributes no slot on 16 of 35 frames** and `fall-in` on 5 of 21 — the sack's
  own template is a large, low-contrast, self-similar shape and the matcher's confidence bar
  rises with the distance claimed. Where it does answer, it answers at 1.2 px mean.
- 📌 **The declared-box figure, as the brief asks for both.** `frames.json`'s own box is
  refused on **0 of 12** sets, on extent, exactly as the brief predicts. Pinned to it as a
  named diagnostic (`check-declared-box.txt`), MAE(ref) reads 24.23 / 17.92 / … against the
  record's 24.93 / 19.17 / … — the framing is worth **0.7–1.3 MAE**, and what is left is the
  keys. 🚫 The pinned run is not the record.
- 📌 **The texture floor the brief predicts did not measure as a floor.** `check --atlas
  <the example's own>` sends MAE(ref) *up* — 24.93 → 28.84, 19.17 → 27.75 — because `--atlas`
  substitutes region geometry as well as texture and those regions are packed `rotate: 270`
  and trimmed, while this rig's attachments are measured from the loose PNGs. Recorded in
  `check-atlas.txt` and read as inconclusive rather than as a floor. §9.2's precondition was
  met: the rest pose places all three parts, provably.

## Re-inspecting this candidate

`spine/` holds `skeleton.json` and `skeleton.atlas` only. The atlas names the example's own
three PNGs by relative path — they are not redistributable and are not here. To read it:

```bash
bun run fetch-examples                     # brings examples/7-anticipation/images/ back
bun cli.ts check --candidate bench/runs/2026-08-28-rung7-2/spine \
                 --frames bench/reference-local/7-anticipation
```

from the repository root, with no `--atlas` override. Verified to reproduce every figure above
to the digit. The frames have to be rendered first, with the three commands at the top.

## What the guide should have said

Eight items, in `LOOP.md`'s *Notes*. The four that cost this run the most:

1. ⭐ **A fitted run should diff its compiled animation against its own pose series before it
   reads a single measure.** §9.1 covers three inert writes *inside* a fit; the mirror defect
   is on the way out — a translate key is an offset from setup while a fitter drives the
   absolute local position. `build` was green and `check` reported it only as a framing
   catastrophe, which reads like a wrong rig rather than a wrong emission.
2. ⭐ **§9.1's cliff has a second entrance: the objective's own window.** All three of its
   defences were in place and none reached this — an objective computed in a window charges
   nothing for ink that leaves the window, and the fitter duly hung the panel 164 px below the
   frame while reporting progress.
3. ⭐ **§9.1's "assert the part is drawn" has to be written at the pyramid level's own
   resolution.** At full-resolution counts it refuses every coarse pose, and a refusal that
   fires on everything looks exactly like an objective with no gradient.
4. ⚠️ **§10.3's one-tolerance rule and its basin rule can pull apart by an order of magnitude,
   and the section does not say which wins.** What resolved it: the basin belongs to *the
   estimator that wrote the channel*, and a run that fits poses has more than one.
