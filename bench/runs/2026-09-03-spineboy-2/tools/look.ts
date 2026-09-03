/**
 * LOOK at a pose beside the frame it is meant to be — AUTHORING §0's "if
 * nobody gave you frames, LOOK at it instead", applied where there ARE frames
 * and the question is which way a limb went.
 *
 * There is no viewport here, so the picture is an ASCII silhouette pair over the
 * declared box. It exists because `check`'s table cannot say "the arm is on the
 * wrong side of the body" and this can.
 */
import { existsSync, readFileSync } from 'node:fs';
import { Plate } from '../../../../tools/plate';
import { declaredViewport, isInk, loadFrame, sidecarOf } from './geom';
import { applyPose, applySkin, loadCandidate, renderPose, type Pose, type Skin } from './fitlib';

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const CAND = process.env.CAND ?? '/tmp/sb2/probe';

const sidecar = sidecarOf(REF);
const view = declaredViewport(sidecar);
const c = loadCandidate(CAND);

const frameArg = process.argv[2] ?? 'idle/f0000';
const poseArg = process.argv[3];
const pose: Pose = poseArg && existsSync(poseArg) ? (JSON.parse(readFileSync(poseArg, 'utf8')) as Pose) : {};
const skinArg = process.argv[4];
const skin: Skin = skinArg && existsSync(skinArg) ? (JSON.parse(readFileSync(skinArg, 'utf8')) as Skin) : {};

applyPose(c.skeleton, pose);
if (Object.keys(skin).length) {
  applySkin(c.skeleton, skin);
  c.skeleton.update(0);
}
const mine = renderPose(c, view);
const theirs = loadFrame(`${REF}/${frameArg}.png`);

// Crop to the union of the two silhouettes, then print both at 2x1 cells.
const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
for (const p of [mine, theirs]) {
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (!isInk(p, x, y)) continue;
      if (x < box.left) box.left = x;
      if (x > box.right) box.right = x;
      if (y < box.top) box.top = y;
      if (y > box.bottom) box.bottom = y;
    }
  }
}
const w = box.right - box.left + 1;
const h = box.bottom - box.top + 1;
const step = Math.max(1, Math.ceil(w / 56));

const glyph = (p: Plate, x0: number, y0: number): string => {
  let hit = 0;
  let total = 0;
  for (let y = y0; y < Math.min(p.height, y0 + step * 2); y++) {
    for (let x = x0; x < Math.min(p.width, x0 + step); x++) {
      total++;
      if (isInk(p, x, y)) hit++;
    }
  }
  const s = total === 0 ? 0 : hit / total;
  return s > 0.66 ? '#' : s > 0.33 ? '+' : s > 0.05 ? '.' : ' ';
};

process.stdout.write(`\n  ${'CANDIDATE'.padEnd(Math.ceil(w / step) + 2)}  ${frameArg}\n`);
for (let y = box.top; y <= box.bottom; y += step * 2) {
  let a = '';
  let b = '';
  for (let x = box.left; x <= box.right; x += step) {
    a += glyph(mine, x, y);
    b += glyph(theirs, x, y);
  }
  process.stdout.write(`  |${a}|  |${b}|\n`);
}
process.stdout.write(`  box ${w}x${h} px at (${box.left},${box.top})\n`);
