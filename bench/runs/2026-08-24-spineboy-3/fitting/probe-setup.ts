import { Rigger, fullViewport, cost, savePlate, readPlate, cropPlate } from './harness.ts';
import { Plate, encodePng } from '../../../../tools/plate.ts';
import { writeFileSync } from 'node:fs';
const dir = 'bench/runs/2026-08-24-spineboy-3/ess/spine';
const r = new Rigger(dir);
const view = fullViewport('bench/reference/spineboy/ess/frames.json');
r.apply({});
const mine = r.render(view);
const ref = readPlate('bench/reference/spineboy/ess/idle/f0000.png');
console.log('full-frame mean |dRGB|', cost(mine, ref).toFixed(3));
// side by side, 4x, cropped
const X = 110, Y = 170, W = 150, H = 185, S = 4;
const a = cropPlate(mine, X, Y, W, H), b = cropPlate(ref, X, Y, W, H);
const out = new Plate(W * S * 2 + 8, H * S);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (const [p, ox] of [[a, 0], [b, W * S + 8]] as [Plate, number][]) {
  const si = (y * W + x) * 4;
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
    const di = ((y * S + dy) * out.width + x * S + dx + ox) * 4;
    out.data[di] = p.data[si]; out.data[di+1] = p.data[si+1]; out.data[di+2] = p.data[si+2]; out.data[di+3] = 255;
  }
}
writeFileSync('work/setup.png', encodePng(out.width, out.height, out.data));
void savePlate;
