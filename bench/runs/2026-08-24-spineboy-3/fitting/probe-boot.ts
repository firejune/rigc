/** boot size, measured: the red-kit blobs below the knees, mine vs the reference. */
import { Fitter, refFrame } from './fit.ts';
import { readFileSync } from 'node:fs';
import { FIST } from './fitrun.ts';
import type { Plate } from '../../../../tools/plate.ts';
import { readPlate } from '../../../../tools/plate.ts';
function blobs(p: Plate, y0: number, y1: number): [number, number, number, number][] {
  const seen = new Uint8Array(p.width * p.height);
  const isRed = (x: number, y: number) => { const i = (y * p.width + x) * 4; return p.data[i] > 140 && p.data[i+1] < 100 && p.data[i+2] < 100; };
  const out: [number, number, number, number][] = [];
  for (let y = y0; y < y1; y++) for (let x = 0; x < p.width; x++) {
    if (seen[y * p.width + x] || !isRed(x, y)) continue;
    const q = [[x, y]]; seen[y * p.width + x] = 1;
    let a0 = x, a1 = x, b0 = y, b1 = y, n = 0;
    while (q.length) {
      const [cx, cy] = q.pop()!;
      n++; a0 = Math.min(a0, cx); a1 = Math.max(a1, cx); b0 = Math.min(b0, cy); b1 = Math.max(b1, cy);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < y0 || nx >= p.width || ny >= y1) continue;
        if (seen[ny * p.width + nx] || !isRed(nx, ny)) continue;
        seen[ny * p.width + nx] = 1; q.push([nx, ny]);
      }
    }
    if (n >= 25) out.push([a0, b0, a1, b1]);
  }
  return out.sort((u, v) => u[0] - v[0]);
}
const f = new Fitter();
const pl = JSON.parse(readFileSync('work/placements-idle.json', 'utf8')).idle;
f.rig.setAttachment('front-fist', FIST['idle']);
f.rig.apply(pl[0]);
const mine = f.rig.render(f.full);
const ref = refFrame('idle', 0);
const fmt = (b: [number, number, number, number][]) => b.map((q) => `(${q[0]},${q[1]})-(${q[2]},${q[3]}) ${q[2]-q[0]+1}x${q[3]-q[1]+1}`).join('  ');
console.log('ref  boots ', fmt(blobs(ref, 310, 350)));
console.log('mine boots ', fmt(blobs(mine, 310, 350)));
const art = readPlate('examples/spineboy/images/front-foot.png');
let n = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
for (let y = 0; y < art.height; y++) for (let x = 0; x < art.width; x++) { const i = (y * art.width + x) * 4;
  if (art.data[i+3] > 128) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
console.log(`front-foot.png drawn ${x1-x0+1}x${y1-y0+1} art px -> ${((x1-x0+1)*0.222973).toFixed(1)}x${((y1-y0+1)*0.222973).toFixed(1)} frame px at 1 unit per art px`);
