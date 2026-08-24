/** candidate | reference | difference, for a few frames. */
import { Fitter, refFrame, cropPlate } from './fit.ts';
import { Plate, encodePng } from '../tools/plate.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { FIST } from './fitrun.ts';
import type { Pose } from './fit.ts';
const f = new Fitter();
const X = Number(process.env.X ?? 120), Y = Number(process.env.Y ?? 175), W = Number(process.env.W ?? 150), H = Number(process.env.H ?? 175), S = 4;
const view = f.window(X, Y, W, H);
const cases = (process.argv[2] ?? 'idle:0|walk:4|run:2').split('|').map((c) => { const [a, i] = c.split(':'); return [a, Number(i)] as [string, number]; });
const rows: Plate[][] = [];
for (const [anim, i] of cases) {
  const pl = JSON.parse(readFileSync(`work/placements-${anim}.json`, 'utf8'))[anim];
  f.rig.setAttachment('front-fist', FIST[anim] ?? 'front-fist-open');
  const pose: Pose = pl[i];
  f.rig.apply(pose);
  const mine = f.rig.render(view);
  const ref = cropPlate(refFrame(anim, i), X, Y, W, H);
  const d = new Plate(W, H);
  for (let k = 0; k < d.data.length; k += 4) {
    const e = (Math.abs(mine.data[k] - ref.data[k]) + Math.abs(mine.data[k+1] - ref.data[k+1]) + Math.abs(mine.data[k+2] - ref.data[k+2])) / 3;
    const v = Math.min(255, e * 2.2);
    d.data[k] = 255 - v; d.data[k+1] = 255 - v; d.data[k+2] = 255 - Math.min(255, v * 0.4); d.data[k+3] = 255;
  }
  rows.push([mine, ref, d]);
}
const cols = 3;
const img = new Plate((W * S + 6) * cols, (H * S + 6) * rows.length);
rows.forEach((r, ri) => r.forEach((p, ci) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const si = (y * W + x) * 4;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const di = ((ri * (H * S + 6) + y * S + dy) * img.width + ci * (W * S + 6) + x * S + dx) * 4;
      img.data[di] = p.data[si]; img.data[di+1] = p.data[si+1]; img.data[di+2] = p.data[si+2]; img.data[di+3] = 255; } }
}));
writeFileSync('work/diff.png', encodePng(img.width, img.height, img.data));
console.log('ok');
