/** the whole boot: red AND maroon (r > g+25 and r > b+25), mine vs reference. */
import { Fitter, refFrame } from './fit.ts';
import { readFileSync } from 'node:fs';
import { FIST } from './fitrun.ts';
import type { Plate } from '../../../../tools/plate.ts';
function boxes(p: Plate, y0: number, y1: number): [number, number, number, number, number][] {
  const seen = new Uint8Array(p.width * p.height);
  const hot = (x: number, y: number) => { const i = (y * p.width + x) * 4; return p.data[i] > p.data[i+1] + 25 && p.data[i] > p.data[i+2] + 25; };
  const out: [number, number, number, number, number][] = [];
  for (let y = y0; y < y1; y++) for (let x = 0; x < p.width; x++) {
    if (seen[y * p.width + x] || !hot(x, y)) continue;
    const q = [[x, y]]; seen[y * p.width + x] = 1;
    let a0 = x, a1 = x, b0 = y, b1 = y, n = 0;
    while (q.length) { const [cx, cy] = q.pop()!;
      n++; a0 = Math.min(a0, cx); a1 = Math.max(a1, cx); b0 = Math.min(b0, cy); b1 = Math.max(b1, cy);
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < y0 || nx >= p.width || ny >= y1 || seen[ny * p.width + nx] || !hot(nx, ny)) continue;
        seen[ny * p.width + nx] = 1; q.push([nx, ny]); } }
    if (n >= 30) out.push([a0, b0, a1, b1, n]);
  }
  return out.sort((u, v) => u[0] - v[0]);
}
const f = new Fitter();
for (const [anim, i] of [['idle', 0], ['aim', 0], ['walk', 0]] as [string, number][]) {
  const pl = JSON.parse(readFileSync(`work/placements-${anim}.json`, 'utf8'))[anim];
  f.rig.setAttachment('front-fist', FIST[anim] ?? 'front-fist-open');
  f.rig.apply(pl[i]);
  const mine = f.rig.render(f.full);
  const ref = refFrame(anim, i);
  const fmt = (b: [number, number, number, number, number][]) => b.map((q) => `${q[2]-q[0]+1}x${q[3]-q[1]+1}@(${q[0]},${q[1]}) n=${q[4]}`).join('   ');
  console.log(`${anim}/f${i} ref `, fmt(boxes(ref, 305, 350)));
  console.log(`${anim}/f${i} mine`, fmt(boxes(mine, 305, 350)));
}
