#!/usr/bin/env bash
# Rebuild this run's candidate from its stored specs, from a clone.
#
# The specs and the harness are the run's own work-product; the reference
# frames and the art are not committed (the art is fetched, and NOTICE.md says
# why). Run this from the repository root.
#
#   bash bench/runs/2026-09-03-spineboy-2/tools/rebuild.sh [out-dir]
#
# The full authoring pipeline — the one that PRODUCED those specs — is the
# ordered list at the foot of this file, and it needs the frames and about an
# hour of compute. This function is the cheap half: specs -> artifact.
set -euo pipefail

root="$(cd "$(dirname "$0")/../../../.." && pwd)"
run="$root/bench/runs/2026-09-03-spineboy-2"
out="${1:-$run/spine}"

if [ ! -d "$root/examples/spineboy/images" ]; then
  echo "examples/spineboy/images is missing — run: bun run fetch-examples" >&2
  exit 1
fi

cd "$root"
bun cli.ts build \
  --rig "$run/spineboy-ess.rig.json" \
  --motion "$run/spineboy-ess.motion.json" \
  --images examples/spineboy/images \
  --out "$out" \
  --profile spine

echo
echo "check it against the frames:"
echo "  bun cli.ts check --candidate $out --frames bench/reference/spineboy/ess"

# ---------------------------------------------------------------------------
# The authoring pipeline, in order. Each step writes what the next one reads.
# ---------------------------------------------------------------------------
#
#  0. bash bench/runs/2026-09-03-spineboy-2/tools/parts.sh \
#         examples/spineboy/images /tmp/sb2/ess-parts
#  1. bun .../tools/frames.ts                       # the frame-side census
#  2. bun .../tools/posebattery.ts                  # `pose` over 23 frames
#  3. bun .../tools/joints.ts torso head 0.16       # triangulate the neck joint
#  4. bun .../tools/rig.ts                          # rig v1, art-side geometry
#  5. bun cli.ts build … --out /tmp/sb2/probe       # a candidate to read through
#  6. ROUNDS=3 bun .../tools/setupfit.ts            # settle the structure
#  7. STRUCTURE=… bun .../tools/rig.ts              # bake it, rebuild the probe
#  8. bun .../tools/chainread.ts                    # `pose` + `chainfit`, 147 frames
#  9. bun .../tools/cfreport.ts                     # the chainfit census
# 10. CHAINSEED=… bun .../tools/fit.ts              # the per-frame poses
# 11. bun .../tools/skins.ts                        # the flare and fist sweeps
# 12. bun .../tools/keys.ts                         # the motion spec
# 13. bun cli.ts build … && bun cli.ts check …      # the loop
# 14. bun .../tools/trail.ts                        # the per-part usage trail
