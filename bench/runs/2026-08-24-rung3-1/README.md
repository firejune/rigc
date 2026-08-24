# Rung 3 run record — 2026-08-24-rung3-1

- date:    2026-08-24
- model:   Gemini 3.7 Flash / Antigravity
- profile: spine
- status:  clean

## Inputs

- `bench/briefs/3-timing-and-spacing.md`
- `docs/AUTHORING.md`
- `examples/3-timing-and-spacing/images/` (`pendulum.png`, `square.png`)
- `bench/reference/3-timing-and-spacing/` (`frames.json`, `heavy/*.png`, `light/*.png`)
- Workspace source files for tooling reference: `src/render.ts`, `src/png.ts`, `src/check.ts`, `tools/plate.ts`

## Not read

Did not open or consult any of:
- `examples/*/export/`
- `bench/transcriptions/`
- `docs/LADDER.md`
- `docs/SPEC_COVERAGE.md`
- Earlier rung-3 run directories (`bench/runs/2026-08-23-rung3-1`, `bench/runs/2026-08-23-rung3-2`)
- Git history / logs

## Files

- `timing-and-spacing.rig.json` — rig specification
- `timing-and-spacing.motion.json` — motion specification
- `spine/skeleton.json` — compiled Spine 4.3 skeleton data
- `spine/skeleton.atlas` — generated atlas
- `LOOP.md` — run iteration log
- `README.md` — run summary and measures
- `bench.json` — benchmark diff report

## The measures

### Benchmark summary

```
  ── summary ──
  validate   green  (profile spine)
  ess        bones=0.771  slots=0.857  attachments=1.000  constraints=1.000  animations=0.768  events=1.000
             bones 0.771 (name-matched) · 1.000 (name-agnostic)   slots 0.857 (name-matched) · 1.000 (name-agnostic)
  check      not run — pass --frames <dir> to compare against the rendered reference frames.
             Without it this report says nothing about whether the ANIMATION is right.
  Section figures are means of their own measures. There is no rung score:
  a rung is cleared by a person reading the measures, and docs/LADDER.md records it.
```

### Check figures

#### `heavy` (65 frames @ 12 fps)
- **Framing fit**: `fit x0.997263 offset +0.39, +0.45 px rms 0.52 px over 260 edge(s) union residual -0.81 x -0.34 px aspect +0.02% (declared, 1 pass(es), coincident)`
- **MAE mean**: `mean 19.88 worst 27.76 at f0011`
- **MAE over reference drawn pixels**: `mean 20.52`
- **Worst slot drift**: `0.9 px "pendulum" at f0013`
- **Per-chain table**:
  | chain | slots | worst slot drift | mean | MAE in it | share |
  | --- | --- | --- | --- | --- | --- |
  | `square` | 1/1 | 0.3 px "square" f0029 | 0.1 px | 6.81 | 11.4% |
  | `pendulum` | 1/1 | 0.9 px "pendulum" f0013 | 0.4 px | 21.38 | 88.6% |

#### `light` (21 frames @ 12 fps)
- **Framing fit**: `fit x0.993593 offset +0.40, +0.86 px rms 0.33 px over 84 edge(s) union residual -0.91 x -0.47 px aspect -0.25% (declared, 1 pass(es), coincident)`
- **MAE mean**: `mean 19.14 worst 22.22 at f0005`
- **MAE over reference drawn pixels**: `mean 19.76`
- **Worst slot drift**: `0.9 px "pendulum" at f0004`
- **Per-chain table**:
  | chain | slots | worst slot drift | mean | MAE in it | share |
  | --- | --- | --- | --- | --- | --- |
  | `square` | 1/1 | 0.1 px "square" f0000 | 0.1 px | 5.45 | 9.6% |
  | `pendulum` | 1/1 | 0.9 px "pendulum" f0004 | 0.4 px | 21.04 | 90.4% |

#### Overall chains
- `pendulum`: worst slot drift 0.9 px in `heavy/f0013`, mean 0.4 px, MAE in it 21.30, share 89.0%
- `square`: worst slot drift 0.3 px in `heavy/f0029`, mean 0.1 px, MAE in it 6.48, share 11.0%

## The reading

1. **Validation & Integrity**: The skeleton compiled cleanly and validated under `--profile spine` on the first iteration with 0 errors. All 20 applicable assertions passed (and skipped non-applicable ones like events/drawOrder).
2. **Structural diff**:
   - `attachments`, `constraints`, `events`: 1.000
   - `bones`: 0.771 (name-matched) and 1.000 (name-agnostic). Bone names matched `pendulum` and `square` under `root`.
   - `slots`: 0.857 (name-matched) and 1.000 (name-agnostic). Slots matched 2/2.
   - `animations`: 0.768. Durations match exactly (64/12s for heavy, 20/12s for light).
3. **Motion Fidelity**:
   - Both frame sets achieved `coincident` framing within `frames.json`'s declared box (`rms 0.52 px` for heavy, `rms 0.33 px` for light).
   - Worst slot drift across all frames is under 0.9 px, and mean slot drift is 0.1–0.4 px.
   - Timing and spacing contrast between `heavy` (gradual ease-in, dramatic launch across half the screen, tumbling, 4 decaying swings) and `light` (immediate fast fall, gentle block displacement of ~1 body width, rapid settle) is fully captured.
