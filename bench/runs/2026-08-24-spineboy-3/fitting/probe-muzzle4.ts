/**
 * Joint fit: ONE attachment scale for the whole flare set (pinned), a per-art
 * offset, and a per-frame bone scale + rotation. The assignment 01/03/04 is
 * fixed from the two decisive like-for-like tests (f2 132%, f3 15%) and the
 * art's own numbering; f4's own test is 1.2% apart, which is no answer.
 */
import { Fitter, refFrame, cropPlate } from './fit.ts';
import { Plate, encodePng } from '../tools/plate.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Pose } from './fit.ts';
const pl = JSON.parse(readFileSync('work/placements-shoot.json', 'utf8')).shoot;
const f = new Fitter();
const X = 190, Y = 190, W = 190, H = 120;
const view = f.window(X, Y, W, H);
const ASSIGN: [number, string][] = [[2, 'muzzle01'], [3, 'muzzle03'], [4, 'muzzle04']];
const crops = new Map(ASSIGN.map(([i]) => [i, cropPlate(refFrame('shoot', i), X, Y, W, H)]));
const off: Record<string, [number, number]> = { muzzle01: [167, -9], muzzle03: [202, -11], muzzle04: [148, -29] };
let k = 3.5;
const bone: Record<number, { rotation: number; scaleX: number; scaleY: number }> = {
  2: { rotation: -21, scaleX: 1, scaleY: 1 }, 3: { rotation: -21, scaleX: 1, scaleY: 1 }, 4: { rotation: -11, scaleX: 1, scaleY: 1 },
};
function total(): number {
  let acc = 0;
  for (const [i, art] of ASSIGN) {
    f.rig.setAttachment('muzzle', art);
    f.rig.setAttachmentTransform('muzzle', art, { x: off[art][0], y: off[art][1], scaleX: k, scaleY: k, rotation: 0 });
    const pose: Pose = JSON.parse(JSON.stringify(pl[i]));
    pose['muzzle'] = { ...bone[i] };
    acc += f.cost(pose, view, crops.get(i)!, 1);
  }
  return acc;
}
let best = total();
console.log('start', best.toFixed(4));
for (const step of [24, 12, 6, 3, 1.5, 0.75]) {
  for (let rep = 0; rep < 2; rep++) {
    for (const art of Object.keys(off)) for (const ax of [0, 1]) {
      const c0 = off[art][ax]; let bv = c0;
      for (const v of [c0 - step, c0 + step]) { off[art][ax] = v; const q = total(); if (q < best - 1e-7) { best = q; bv = v; } }
      off[art][ax] = bv;
    }
    { const c0 = k; let bv = c0;
      for (const v of [c0 - step / 40, c0 + step / 40]) { k = v; const q = total(); if (q < best - 1e-7) { best = q; bv = v; } }
      k = bv; }
    for (const [i] of ASSIGN) for (const key of ['rotation', 'scaleX'] as const) {
      const c0 = bone[i][key]; let bv = c0;
      const d = key === 'rotation' ? step / 3 : step / 40;
      for (const v of [c0 - d, c0 + d]) {
        bone[i][key] = v; if (key === 'scaleX') bone[i].scaleY = v;
        const q = total(); if (q < best - 1e-7) { best = q; bv = v; }
      }
      bone[i][key] = bv; if (key === 'scaleX') bone[i].scaleY = bv;
    }
  }
}
console.log('final', best.toFixed(4), 'k', k.toFixed(3), JSON.stringify(off), JSON.stringify(bone));
writeFileSync('work/muzzle.json', JSON.stringify({ k, off, bone, assign: ASSIGN }, null, 1));
const panels: Plate[] = [];
for (const [i, art] of ASSIGN) {
  f.rig.setAttachment('muzzle', art);
  f.rig.setAttachmentTransform('muzzle', art, { x: off[art][0], y: off[art][1], scaleX: k, scaleY: k, rotation: 0 });
  const pose: Pose = JSON.parse(JSON.stringify(pl[i])); pose['muzzle'] = { ...bone[i] };
  f.rig.apply(pose);
  panels.push(f.rig.render(view), crops.get(i)!);
}
const S = 4;
const img = new Plate(W * S * panels.length + 6 * panels.length, H * S);
panels.forEach((p, kk) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const si = (y * W + x) * 4;
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) { const di = ((y * S + dy) * img.width + x * S + dx + kk * (W * S + 6)) * 4;
    img.data[di] = p.data[si]; img.data[di+1] = p.data[si+1]; img.data[di+2] = p.data[si+2]; img.data[di+3] = 255; } } });
writeFileSync('work/muzzlefit.png', encodePng(img.width, img.height, img.data));
