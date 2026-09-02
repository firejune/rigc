#!/usr/bin/env bash
# The 17 body parts `rigc pose` was pointed at, as a directory of loose PNGs.
#
# `pose --images` treats every .png in the directory as a part, so the 12 files
# `ess` never draws — the hoverboard, the portal layers, the crosshair — and the
# flare pieces, which draw on three frames of one shot, are left out: a part that
# is not in the picture spends the search and adds a refusal to read past. The
# directory is symlinks into `examples/`, which `fetch-examples` populates and git
# ignores, so it is recreated rather than committed.
set -e
R="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$R/parts-ess"
cd "$R/parts-ess"
for f in front-bracer front-fist-closed front-fist-open front-foot front-shin \
         front-thigh front-upper-arm goggles gun head neck rear-bracer rear-foot \
         rear-shin rear-thigh rear-upper-arm torso; do
  ln -sf "../../../../examples/spineboy/images/$f.png" .
done
ls | wc -l
