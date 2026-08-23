# Rung 3, attempt 2 — `3-timing-and-spacing`

The second honest run at rung 3, and **the first authored with
[`docs/AUTHORING.md` §10](../../../docs/AUTHORING.md) in hand** — the editor's default
conventions, sourced from Spine's public documentation and adopted as a standard input on
2026-08-23. The run exists to measure what §10 changes, so §10 is called out explicitly
below, item by item.

- **date** — 2026-08-23
- **model** — Claude Opus 5 (1M context), running as a Claude Code / Agent SDK agent
- **profile** — `spine`
- **clean or bench-assisted** — **clean.** `bench 3` was run exactly once, at the end, and
  no file was edited afterwards.

## Inputs

| input | note |
| --- | --- |
| [`bench/briefs/3-timing-and-spacing.md`](../../briefs/3-timing-and-spacing.md) | the brief. **Not verified by a second agent** — `bench/runs/README.md` flags rung 3's brief as still needing that pass |
| [`docs/AUTHORING.md`](../../../docs/AUTHORING.md) | the whole guide, **including §8 (reading frames), §9 (`check`) and §10 (editor conventions)** |
| [`bench/runs/README.md`](../README.md) | the run protocol |
| `examples/3-timing-and-spacing/images/` | `pendulum.png` 745×212, `square.png` 159×159 |
| `bench/reference/3-timing-and-spacing/` | 2 contact sheets, 86 stills, `frames.json` |

**§10 was an input.** This run is on the far side of the 2026-08-23 boundary that
`bench/runs/README.md` warns about, so its convention measures are not comparable with a
run authored before it.

Nothing under `examples/*/export/`, `bench/transcriptions/`, any `bench/runs/*-rung*`
directory, `docs/SPEC_COVERAGE.md`, `docs/LADDER.md`, `docs/feature_matrix.*`,
`bench/count_features.ts` or `bench/render_reference.ts` was opened; no git history, no PR
body, no web search.

## Files

```
pendulum.rig.json      the rig spec
pendulum.motion.json   the motion spec
spine/                 the compiled candidate — skeleton.json + skeleton.atlas
LOOP.md                every turn of the loop, honestly
bench.json             the one bench run
tools/                 the measurement scripts every number came out of
```

`tools/` is runnable from the repository root: `png.ts` (a small PNG decoder),
`measure-frames.ts` / `measure-pendulum.ts` (the pivot circle fit and the bar-angle
estimators), `measure-block.ts` (the block's template fit), and
`bezfit.ts` / `joint.ts` / `fit-motion.ts` (the Bezier-handle and key fit).

## Which §10 conventions were applied, and where

| §10 line | applied | where |
| --- | --- | --- |
| §10.1 📗 one image → one slot → one region attachment | yes | two images, `slots: [block, pendulum]`, one placeholder each in `default` |
| §10.1 📗 a shared slot is for alternatives only | yes (nothing shared) | both parts are on screen together in every frame, so they cannot share a slot |
| §10.1 🧩 if nothing swaps, give them a slot each | yes | no attachment timeline anywhere |
| §10.1 📗 the attachment name **is** the image name | yes | placeholders `square` / `pendulum`; the emitted skeleton contains **no `path`** at all |
| §10.1 📗 skin called `default`; parents before children | yes | one skin, `root → block`, `root → pendulum` in that order |
| §10.2 📗 an overlap change is a draw-order key | n/a, deliberately | the overlap never changes: the block is behind the pendulum in every frame of both shots, so the setup slots array (R4) says it and there is **no `drawOrder` timeline** — `A31` reports SKIP for that reason |
| §10.2 🧩 never express an overlap by re-parenting | yes | one bone per part, both on `root`, nothing re-parented |
| §10.2 📗 hide with an attachment key, not alpha | n/a | nothing is hidden |
| §10.3 📗 both axes on one key by default | **overridden, with a reason** | the block uses `translatex` + `translatey` (the Separate checkbox). Its x is one decelerating slide with 4 keys; its y is four ballistic arcs with 8 keys at different times. §10.3 names exactly this case — "axes [that] need different times or different curves" — and a shared per-key curve costs ~2 px of x drift inside each arc. The pendulum needs only `rotate`, so the question does not arise there |
| §10.3 📗 times are seconds, frames are a convenience | yes | no key sits on the 12 fps grid except where the motion actually turns there; times are fitted turning points like 0.987708 s |
| §10.3 📗 dense, but does not repeat a value | **one deliberate exception** | `light`'s rotate holds 90.139 at 1.5 s and again at 1.666667 s. f18/f19/f20 are bit-identical and R7 needs a key at the duration; see LOOP.md |
| §10.3 🧩 key every change of direction, and where a span cannot hold the shape | yes | every swing extreme (11 in heavy, 6 in light), every bounce apex and contact of the block, plus the two keys the fit showed a single span could not carry: the bottom of each of heavy's first two swings, one mid-spin key on the block, one mid-slide key |
| §10.4 🧩 Bezier is the default, linear is the exception | yes | **every key that has a successor carries a named easing.** The only `linear` keys in the file are the eight last keys — one per track — which cannot carry one |
| §10.4 📗 automatic handles first, then adjust | yes, in spirit | started from one smooth ease-in-out shape and let a least-squares fit against the frames adjust it per role |
| §10.4 🧩 a handful of named shapes reused by name; raw `curve` is the escape hatch | yes | **15 named easings, 0 raw `curve` entries.** `swing` carries 9 keys, `swingl` 7, `arc` 7, `snap`/`drop`/`catch`/`leave`/`land`/`fling`/`slide`/`stop`/`toss`/`whip`/`spin`/`rock` the specials |
| §10.4 📗 handles are normalised, and that is what `easings` takes | yes | all 15 are 0..1 graph-view handles; rigc does the conversion |
| §10.4 📗 some keys have no curve | n/a | no attachment or draw-order keys exist here |
| §10.5 📗 nonessential data off by default | yes | no `fps`; the emitted skeleton header is `spine/x/y/width/height` and nothing else |
| §10.5 ⚠️ a region's width/height are not nonessential — name an `image` | yes | both attachments carry `image`, so rigc measured the PNGs (R5) |
| §10.5 ⚠️ do not imitate the exporter's omissions | yes | `block.x: 0` is written out loud (R1) |

Two §10 lines have no counterpart in this shot and are recorded as such rather than
quietly skipped: §10.2's draw-order key (the overlap is constant) and §10.2's fade-then-hide
pattern (nothing disappears).

## Reading — what the measures say

**`validate` is green under `spine`, and every count matches**: `bones 3/3`, `slots 2/2`,
`skins 1/1`, `attachments 2/2`, `constraints 0/0`, `animations 2/2`, `events 0/0`. Under
`animations`, `count`, `names`, `duration`, `timeline_kinds`, `draw_order` and `deform` are
all 1.000 — the two shots are the right length, carry the right eight timelines, and neither
side has a draw-order or deform timeline the other lacks.

**Against the pictures the shot is close.** heavy `MAE mean 9.84`, light `10.93`, over the
union alpha of a 256×116 frame in which each part is 19–88 px across; worst slot drift 0.9 px
and 0.7 px, and every slot attributed in every frame. The framing fit is
`x0.999458, rms 0.25 px, union residual +0.50 × +0.01 px` — my shot is the same size and
shape as the reference's to about a quarter of a pixel, which is the method's own floor
(§9.2). The MAE that is left is edge coverage, not motion: my candidate draws ~5% fewer
pixels than the reference for the same bounding box, so a shot whose parts are mostly outline
carries a floor of about 9–10 even where the drift is zero (light's held frames f18–f20 sit
at 10.04 with drift 0.0).

**The low measures are the ones a frame cannot carry.** `bones names 1/5`,
`slots bone 0/2`, `attachments names 1/3`, `bones parent_by_name 1/3` and `order 1/3` all
follow from one choice the brief explicitly grants ("Names are yours"). `bones
length_present 1/3` and `inherit_present 1/3` are different and are a genuine miss: the
reference declares a setup `length` and an `inherit` where I declared neither, because §9.3
lists both as invisible in frames and §10 does not say what an editor writes. A bone made
with Spine's Create tool has a length; that belongs in §10 and would have moved two
measures. LOOP.md proposes the line.

**`key_counts 49/69` is the run's real finding.** I did not aim at a density — §10.6 is
right that no public page gives one — and applied §10.3's rule instead: a key at every
change of direction, at every hold boundary, and wherever the fit showed one Bezier span
could not hold the shape. That produced 49 keys against the reference's 69. The remaining
20 are keys a span already explains: at 0.118 px/unit they move nothing, so `check` cannot
ask for them and `bench` can see them. That is exactly the class of divergence §10 was
written to close, and the one line of it that no convention read off a public page can.
