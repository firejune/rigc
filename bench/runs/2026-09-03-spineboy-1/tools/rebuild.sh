#!/usr/bin/env bash
# Regenerate the rig spec from fit/setup.json and compile it.
#
# It is a script because the ordering is a trap: `tools/setup.ts` writes BOTH the
# parameter file and the rig spec, so running it after a solve overwrites the
# solve. `--keep` regenerates only the spec. One build of this run was scored
# against the seed for exactly that reason (LOOP §4.4).
set -e
R=bench/runs/2026-09-03-spineboy-1
bun $R/tools/setup.ts $R/fit/setup.json --keep > /dev/null
bun cli.ts build --rig $R/spineboy-ess.rig.json --motion $R/spineboy-ess.motion.json \
  --images examples/spineboy/images --out $R/spine --profile spine 2>&1 | grep -E "FAIL|pages=" || true
