#!/usr/bin/env bash
# One turn of the loop: build the candidate, then check it against the frames.
#
#   bash bench/runs/2026-09-03-spineboy-2/tools/loop.sh <tag> [out-dir]
#
# Writes the build report and the check table to /tmp/sb2/<tag>.{build,check}.txt
# so a turn can be compared against the one before it. `bench` is NOT here: it is
# the finish line and it runs once, at the end (bench/runs/README.md).
set -euo pipefail
root="$(cd "$(dirname "$0")/../../../.." && pwd)"
run="$root/bench/runs/2026-09-03-spineboy-2"
tag="${1:?tag}"
out="${2:-/tmp/sb2/cand}"
work="${WORK:-/tmp/sb2}"
mkdir -p "$work"

cd "$root"
if ! bun cli.ts build \
  --rig "$run/spineboy-ess.rig.json" \
  --motion "$run/spineboy-ess.motion.json" \
  --images examples/spineboy/images \
  --out "$out" \
  --profile spine > "$work/$tag.build.txt" 2>&1; then
  echo "build RED — $work/$tag.build.txt"
  grep -E '^  FAIL|CompileError|error' "$work/$tag.build.txt" | head -20
  exit 1
fi
grep -cE '^  PASS' "$work/$tag.build.txt" | sed 's/^/build: /' | tr '\n' ' '
grep -cE '^  FAIL' "$work/$tag.build.txt" | sed 's/^/FAIL /'

bun cli.ts check --candidate "$out" --frames bench/reference/spineboy/ess > "$work/$tag.check.txt" 2>&1 || true
grep -E '^  ── |worst attributable|slot drift|per-frame|MAE  |sheet ' "$work/$tag.check.txt" | head -80
echo
echo "full table: $work/$tag.check.txt"
