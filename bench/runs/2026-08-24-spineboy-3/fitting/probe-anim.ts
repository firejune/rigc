/** render the COMPILED animation (not the fitter's pose) beside the reference */
import { loadPosable, sampleAnimation, renderFrame } from '../src/render.ts';
import { fullViewport, cropPlate } from './harness.ts';
import { refFrame } from './fit.ts';
import { Plate, encodePng } from '../tools/plate.ts';
import { writeFileSync } from 'node:fs';
const dir = 'bench/runs/2026-08-24-spineboy-3/ess/spine';
const p = loadPosable(`${dir}/skeleton.json`, `${dir}/skeleton.atlas`, dir);
const view = fullViewport('bench/reference/spineboy/ess/frames.json');
const cases = (process.argv[2] ?? 'idle:0|walk:4').split('|').map((c) => { const [a, i] = c.split(':'); return [a, Number(i)] as [string, number]; });
const X = 0, Y = 0, W = 384, H = 367, S = 2;
const rows: Plate[][] = [];
for (const [anim, i] of cases) {
  const frames = sampleAnimation(p.data, anim, 12);
  const fr = frames[Math.min(i, frames.length - 1)];
  const mine = renderFrame(fr, p.pages, view, [232, 232, 232, 255]);
  console.log(anim, i, 'sampled', frames.length);
  rows.push([cropPlate(mine, X, Y, W, H), cropPlate(refFrame(anim, i), X, Y, W, H)]);
}
const img = new Plate((W * S + 6) * 2, (H * S + 6) * rows.length);
rows.forEach((r, ri) => r.forEach((pl, ci) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const si = (y * W + x) * 4;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const di = ((ri * (H * S + 6) + y * S + dy) * img.width + ci * (W * S + 6) + x * S + dx) * 4;
      img.data[di] = pl.data[si]; img.data[di+1] = pl.data[si+1]; img.data[di+2] = pl.data[si+2]; img.data[di+3] = 255; } }
}));
writeFileSync('work/anim.png', encodePng(img.width, img.height, img.data));
