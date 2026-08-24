#!/bin/bash
set -e
cd "$(dirname "$0")/.."
bun work/emit.ts > /dev/null
bun work/genmotion.ts "${1:-0.35}" "${2:-8}"
bun cli.ts build --rig bench/runs/2026-08-24-spineboy-3/ess/spineboy-ess.rig.json \
  --motion bench/runs/2026-08-24-spineboy-3/ess/spineboy-ess.motion.json \
  --images examples/spineboy/images --out bench/runs/2026-08-24-spineboy-3/ess/spine --profile spine 2>&1 | grep -E "FAIL|CompileError|^rigc: wrote" | head -4
