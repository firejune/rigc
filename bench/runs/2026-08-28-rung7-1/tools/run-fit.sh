#!/bin/bash
# Rung 7 — the staged fit, in the order the colour split makes well-conditioned:
# the sack on beige, the capes on crimson, then a joint polish with everything free.
set -e
cd "$(dirname "$0")/../../../.."
R=bench/runs/2026-08-28-rung7-1
for stage in sack cape all all; do
  echo "=== stage $stage ==="
  bun $R/tools/fit.ts --passes 1 --part $stage --out $R/placements.json
done
echo "=== done ==="
