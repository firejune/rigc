#!/usr/bin/env bash
# The `ess` part subset: the 29 PNGs of examples/spineboy/images that any `ess`
# shot can show. The Hoverboard and Portal groups and the crosshair are named in
# the brief's art table as appearing only in shots `pro` has, so they are not in
# this rig and `pose` is not asked to place them.
#
# usage: parts.sh <images-dir> <out-dir>
set -euo pipefail
src="${1:?images dir}"
out="${2:?out dir}"
mkdir -p "$out"
for f in \
  eye-indifferent.png eye-surprised.png \
  front-bracer.png front-fist-closed.png front-fist-open.png \
  front-foot.png front-shin.png front-thigh.png front-upper-arm.png \
  goggles.png gun.png head.png \
  mouth-grind.png mouth-oooo.png mouth-smile.png \
  muzzle-glow.png muzzle-ring.png \
  muzzle01.png muzzle02.png muzzle03.png muzzle04.png muzzle05.png \
  neck.png \
  rear-bracer.png rear-foot.png rear-shin.png rear-thigh.png rear-upper-arm.png \
  torso.png; do
  cp "$src/$f" "$out/$f"
done
ls "$out" | wc -l
