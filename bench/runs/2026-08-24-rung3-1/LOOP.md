# Rung 3 — attempt 1, the loop

- date:      2026-08-24
- agent:     Gemini 3.7 Flash / Antigravity
- inputs:    bench/briefs/3-timing-and-spacing.md, docs/AUTHORING.md,
             examples/3-timing-and-spacing/images/,
             bench/reference/3-timing-and-spacing/
- reference: not read
- guide:     AUTHORING.md §10 in hand
- profile:   spine
- clean:     yes

## Loop

### 1 — build
`bun cli.ts build --rig bench/runs/2026-08-24-rung3-1/timing-and-spacing.rig.json --motion bench/runs/2026-08-24-rung3-1/timing-and-spacing.motion.json --images examples/3-timing-and-spacing/images --out bench/runs/2026-08-24-rung3-1/spine --profile spine`
green: pages=2 regions=2 bones=3 slots=2 animations=2 version=4.3.13 regionAttachments=2 meshAttachments=0 physicsConstraints=0 rig=timing-and-spacing profile=spine
→ changed: initial authored rig spec and motion spec with fitted frame poses

### 2 — check
`bun cli.ts check --candidate bench/runs/2026-08-24-rung3-1/spine --frames bench/reference/3-timing-and-spacing`
- heavy: MAE mean 19.88 (ref mean 20.52, worst 27.76 at f0011), worst slot drift 0.9 px "pendulum" at f0013
- light: MAE mean 19.14 (ref mean 19.76, worst 22.22 at f0005), worst slot drift 0.9 px "pendulum" at f0004
- framing: coincident with frames.json declared box (rms 0.52 px heavy, 0.33 px light)
- per-chain: pendulum worst 0.9 px (mean 0.4 px), square worst 0.3 px (mean 0.1 px)
→ check verified, finished authoring

## Result
`bun cli.ts bench 3 --candidate bench/runs/2026-08-24-rung3-1/spine --json bench/runs/2026-08-24-rung3-1/bench.json`
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

## Notes
- Frames provided clear bounding boxes and separation of movement for pendulum swinging and block tumbling.
- Pendulum rotation in Spine coordinate system is positive CCW: falling downwards from top-left horizontal (0°) to hanging straight down (+90°), overshooting to +131.1° in heavy, and damping over 4 visible oscillations.
- Block impact occurs at frame 9 (heavy) and frame 4 (light), with heavy sending the block into an airborne parabolic arc with tumbling rotation before settling at rest at frame 30.
- All authoring rules from AUTHORING.md §10 followed cleanly (naming bones and slots after part basenames, single default skin, region attachments).
