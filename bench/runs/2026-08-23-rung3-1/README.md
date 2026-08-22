# Rung 3, attempt 1 — `3-timing-and-spacing`

A rig spec and a motion spec authored from the brief and the rendered reference
frames alone, compiled with rigc, gated under `--profile spine`, and benchmarked
once at the end.

| | |
| --- | --- |
| date | 2026-08-23 |
| agent | Claude Opus 5 (1M context), Claude Code / Agent SDK |
| rig | [`pendulum-and-block.rig.json`](pendulum-and-block.rig.json) |
| motion | [`pendulum-and-block.motion.json`](pendulum-and-block.motion.json) |
| candidate | [`spine/`](spine/) — `skeleton.json` + `skeleton.atlas` + two pages |
| loop log | [`LOOP.md`](LOOP.md) |
| bench report | [`bench.json`](bench.json) |
| build iterations | **1** — green on the first compile |
| status | **clean run** |

## Inputs

Used: [the brief](../../briefs/3-timing-and-spacing.md),
[`docs/AUTHORING.md`](../../../docs/AUTHORING.md), [the run
protocol](../README.md), the two PNGs in
`examples/3-timing-and-spacing/images/`, every frame and both contact sheets in
`bench/reference/3-timing-and-spacing/`, and — as format documentation —
`src/rig.ts`, `src/types.ts`, `src/timelines.ts`, `bezierForChannel` in
`src/compile.ts` and the `A10` stepping loop in `src/validate.ts`.

Not used, not opened, at any point: `examples/*/export/`,
`bench/transcriptions/`, `docs/SPEC_COVERAGE.md`, `docs/LADDER.md`,
`docs/feature_matrix.*`, `bench/count_features.ts`, `bench/render_reference.ts`,
and git history. No web search. `bench` was run once, after the specs were final,
and nothing was edited afterwards — so this run is **clean**, not bench-assisted.

## Reproducing it

```bash
bun cli.ts build \
  --rig    bench/runs/2026-08-23-rung3-1/pendulum-and-block.rig.json \
  --motion bench/runs/2026-08-23-rung3-1/pendulum-and-block.motion.json \
  --images examples/3-timing-and-spacing/images \
  --out    bench/runs/2026-08-23-rung3-1/spine \
  --profile spine

bun cli.ts bench 3 --candidate bench/runs/2026-08-23-rung3-1/spine
```

## What was authored

Three bones (`root`, and a `pendulum` and a `block` hanging off it), two slots in
draw order, one skin, two region attachments measured from the PNGs, no
constraints. Both animations key the same four timelines: `pendulum.rotate`,
`block.translatex`, `block.translatey`, `block.rotate`. Nine named easings, of
which one — `arc` — carries every swing in both shots, and two — `heave` and
`drop` — are the falls that separate them.

Units are `pendulum.png` pixels and the origin is the pivot. Every number in the
specs was measured off the reference frames: the pivot and the render scale come
from a least-squares fit over all 86 frames (residual 0.21 px), the poses from
per-frame silhouette measurements, and the curves from a least-squares fit of
bézier handles to those series. [`LOOP.md`](LOOP.md) has the method and the dead
ends.

## Reading the measures

**Validity.** Green under `--profile spine`: 15 PASS, 0 FAIL. The two SKIPs are
artefacts of re-gating files on disk (`bench` has no motion spec to compare a
declared duration against, and no second compile to diff) — both ran and passed
in `build`, where the inputs exist. Fourteen assertions are `PROF`: this candidate
has **not** been held to the renderer policy or to any archetype rule, and a
foreign skeleton on this profile never can be.

**The skeleton is the right shape and the wrong words.** `bones` and `slots` come
out lowest (0.567 / 0.476) and both are dominated by naming. Bone `count` is 3/3,
and the two name-agnostic measures are perfect: `depth_histogram` 3/3 and
`degree_sequence` 3/3 say the bone tree has the same number of bones at each depth
and the same number of children per bone — i.e. structurally identical. The
name-matched measures underneath (`parent_by_name`, `order`, `length_present`,
`inherit_present`, all 1/3) can only score on bones whose names coincide, so with
one name in common they are the naming figure repeated four times, not four
independent findings. The same is true of `slots`: `count` 2/2, everything else
keyed off one matching name. `bone` 0/2 is the compound case — a slot whose name
matches, bound to a bone whose name does not.

The brief says names are mine, and `diff` prints the name-agnostic figures
precisely so this case is legible. Read that way, the skeleton section says the
rig is right and the vocabulary is different.

**Attachments (0.870) are as close as a differently-named rig can get.** Skin
count, attachment count and type counts are all exact; `names` 1/3 is the same
naming gap; `region_size_present` 1/2 is a real, small difference in what gets
emitted rather than in what the file means — both sides carry the size, they do
not both carry it in the same place, because rigc's R1 emits a field exactly when
the spec declares it and `image` declares both.

**Constraints and events are 1.000 by absence.** Nothing on either side. Worth
naming as such: those two 1.000s are not evidence of anything.

**Animations (0.911) is the one that matters for this rung, and it is the good
news.** `count` 2/2, `names` 2/2, `duration` 2/2 and `timeline_kinds` 8/8. That
last one is the answer to the only structural judgement call in the run: the block
is keyed as separate `translatex` and `translatey` timelines rather than a paired
`translate`, because its horizontal decay and its vertical arc want different key
times and different curves. Getting 8/8 on timeline kinds means that call landed.

The gap is density: `key_counts` 42/69 and `curve_kinds` 41/69. The reference
carries about half again as many keys as I authored. That is a real difference and
it is the honest limit of authoring from 12 fps frames — where a single cubic held
the samples to within about a pixel I used one segment, and there is no way to see
from the frames whether the reference broke it into two. It is under-keying, not
mis-timing: durations match, and playing the compiled candidate through
`spine-core` and differencing against the measured series gives a worst-frame
error of 2.42° of pendulum rotation and about one frame pixel of block travel
(table in [`LOOP.md`](LOOP.md)), with typical error well under a degree. A
re-render of the candidate composited over the reference frames differs by 3.4/255
mean absolute pixel value.

**Where I would look first if this rung is judged not cleared.** The 42/69 key
count, and nothing else — the skeleton, the timeline set, the durations and the
draw order are all where they should be, and the naming is out of scope by the
brief's own rule.

## Caveats

- `skeleton.width`/`height` is a guess. It is required without a manifest, nothing
  in the scoring reads it, and no assertion in this profile measures against it.
- The pendulum bone has no `length` and points along its own −x; see
  [`LOOP.md`](LOOP.md) §"Notes for the guide" for the alternative and why it was
  not taken.
- The measurement of the reference frames — pivot, scale, per-frame poses — is
  mine, not the reference's, and carries roughly 0.2 px / 0.3° of noise. The
  authored curves are fitted to it, so that noise is inside the specs.
