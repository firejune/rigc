#!/usr/bin/env bash
# The finish line, in one script so it is reproducible and so `bench` runs once.
#
#   bash bench/runs/2026-09-03-spineboy-2/tools/finish.sh
#
# Order matters: `validate` and `check` are loop steps and may be run as often as
# the run likes; `bench` reads the reference export and is the finish line
# (bench/runs/README.md). It is the LAST thing here.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../../.." && pwd)"
run="$root/bench/runs/2026-09-03-spineboy-2"
cand="$run/spine"
frames="$root/bench/reference/spineboy/ess"
cd "$root"

echo "== build =="
bun cli.ts build \
  --rig "$run/spineboy-ess.rig.json" \
  --motion "$run/spineboy-ess.motion.json" \
  --images examples/spineboy/images \
  --out "$cand" \
  --profile spine > "$run/build.txt" 2>&1
# `grep -c` exits 1 on zero matches, which under `set -e` is exactly the green
# case killing the script. Every count below is guarded.
echo "  FAIL count: $(grep -cE '^  FAIL' "$run/build.txt" || true)"
grep -E '^  \.\.    pages=' "$run/build.txt" || true

echo "== validate (G1) =="
bun cli.ts validate "$cand" --profile spine > "$run/validate.txt" 2>&1
echo "  FAIL count: $(grep -cE '^  FAIL' "$run/validate.txt" || true)"

echo "== the compiled animation against the fitted pose series =="
# AUTHORING §9.1's last 🚨: "a pipeline with a fit at one end and a file at the
# other needs one check that the file plays what the fit found, and it belongs
# before the measures rather than after a day of them."
bun "$run/tools/verify.ts" "$cand" "$run/fit/poses.json" > "$run/evidence/compiled-vs-fit.txt" 2>&1
tail -4 "$run/evidence/compiled-vs-fit.txt"

echo "== check — the record =="
bun cli.ts check --candidate "$cand" --frames "$frames" --json "$run/check.json" > "$run/check.txt" 2>&1
bun cli.ts check --candidate "$cand" --frames "$frames" --all-frames > "$run/check-all-frames.txt" 2>&1

echo "== check --texture-from — a NAMED DIAGNOSTIC, never the record =="
# Allowed-list item 4: the example's own .atlas is a supplied input. §9.2: not
# --atlas, which re-seats region geometry and sends the figure the wrong way.
bun cli.ts check --candidate "$cand" --frames "$frames" \
  --texture-from examples/spineboy/export/spineboy.atlas \
  --json "$run/check-texture-from.json" > "$run/check-texture-from.txt" 2>&1 || true

echo "== the summary tables =="
bun "$run/tools/summary.ts" "$run/check.json" "$run/evidence/check-summary.md" > /dev/null
bun "$run/tools/summary.ts" "$run/check-texture-from.json" "$run/evidence/check-texture-summary.md" > /dev/null || true

echo "== the chainfit census and the per-part usage trail =="
bun "$run/tools/cfreport.ts" "$run/fit/chainfit.json" "$run/evidence/chainfit-census.txt" > /dev/null
POSES="$run/fit/poses.json" CHAINFIT="$run/fit/chainfit.json" \
  bun "$run/tools/trail.ts" "$run/evidence/chainfit-trail.txt" > /dev/null

echo "== bench — ONCE, at the end =="
bun cli.ts bench spineboy --candidate "$cand" --json "$run/bench.json" > "$run/bench.txt" 2>&1 || true
tail -20 "$run/bench.txt"

echo
echo "wrote: build.txt validate.txt check.txt check.json check-all-frames.txt"
echo "       check-texture-from.txt bench.txt bench.json evidence/*"
