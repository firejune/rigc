/** Per-frame drawn-box delta, candidate minus reference, on frames.json's grid. */
import { loadPosable, sampleAnimation, renderFrame } from '../../../../src/render.ts';
import { readPlate, type Plate } from '../../../../tools/plate.ts';
import { fullViewport, BG } from './harness.ts';
import { REF, CAND } from './fit.ts';
import { existsSync } from 'node:fs';
function box(p: Plate): [number, number, number, number] | null {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    if (Math.abs(p.data[i] - BG[0]) > 8 || Math.abs(p.data[i+1] - BG[1]) > 8 || Math.abs(p.data[i+2] - BG[2]) > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}
const view = fullViewport(`${REF}/frames.json`);
const p = loadPosable(`${CAND}/skeleton.json`, `${CAND}/skeleton.atlas`, CAND);
for (const anim of process.argv.slice(2)) {
  const fr = sampleAnimation(p.data, anim, 12);
  let sq = 0, m = 0, worst = '';
  const rows: string[] = [];
  for (let i = 0; i < fr.length; i++) {
    const path = `${REF}/${anim}/f${String(i).padStart(4, '0')}.png`;
    if (!existsSync(path)) continue;
    const a = box(renderFrame(fr[i], p.pages, view, BG)), b = box(readPlate(path));
    if (!a || !b) continue;
    const d = [a[0]-b[0], a[1]-b[1], a[2]-b[2], a[3]-b[3]];
    for (const v of d) { sq += v * v; m++; }
    const mx = Math.max(...d.map(Math.abs));
    if (mx >= 3) rows.push(`   f${String(i).padStart(4,'0')} L${d[0]>=0?'+':''}${d[0]} T${d[1]>=0?'+':''}${d[1]} R${d[2]>=0?'+':''}${d[2]} B${d[3]>=0?'+':''}${d[3]}`);
  }
  console.log(`${anim.padEnd(6)} edge rms ${Math.sqrt(sq/m).toFixed(2)} px over ${m} edges  ${Math.sqrt(sq/m) <= 1 ? '✅ would take the declared box' : '— fitted'}`);
  for (const r of rows.slice(0, 14)) console.log(r);
}
