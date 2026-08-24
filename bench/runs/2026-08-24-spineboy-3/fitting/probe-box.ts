/** my candidate's drawn box per frame, against the reference's, in frame px. */
import { loadPosable, sampleAnimation, renderFrame } from '../src/render.ts';
import { fullViewport } from './harness.ts';
import { refFrame } from './fit.ts';
import { SETS } from './fitrun.ts';
import type { Plate } from '../tools/plate.ts';
const dir = 'bench/runs/2026-08-24-spineboy-3/ess/spine';
const p = loadPosable(`${dir}/skeleton.json`, `${dir}/skeleton.atlas`, dir);
const view = fullViewport('bench/reference/spineboy/ess/frames.json');
function box(pl: Plate): [number, number, number, number] {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < pl.height; y++) for (let x = 0; x < pl.width; x++) {
    const i = (y * pl.width + x) * 4;
    if (Math.abs(pl.data[i] - 232) > 8 || Math.abs(pl.data[i+1] - 232) > 8 || Math.abs(pl.data[i+2] - 232) > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}
let ux0 = 1e9, uy0 = 1e9, ux1 = -1, uy1 = -1, rx0 = 1e9, ry0 = 1e9, rx1 = -1, ry1 = -1;
for (const anim of Object.keys(SETS)) {
  const frames = sampleAnimation(p.data, anim, 12);
  for (let i = 0; i < SETS[anim]; i++) {
    const mine = box(renderFrame(frames[Math.min(i, frames.length - 1)], p.pages, view, [232, 232, 232, 255]));
    const ref = box(refFrame(anim, i));
    ux0 = Math.min(ux0, mine[0]); uy0 = Math.min(uy0, mine[1]); ux1 = Math.max(ux1, mine[2]); uy1 = Math.max(uy1, mine[3]);
    rx0 = Math.min(rx0, ref[0]); ry0 = Math.min(ry0, ref[1]); rx1 = Math.max(rx1, ref[2]); ry1 = Math.max(ry1, ref[3]);
    const bad = Math.abs(mine[0]-ref[0]) > 8 || Math.abs(mine[1]-ref[1]) > 8 || Math.abs(mine[2]-ref[2]) > 8 || Math.abs(mine[3]-ref[3]) > 8;
    if (bad) console.log(`${anim}/f${i}`.padEnd(12), `mine (${mine.join(',')})`.padEnd(28), `ref (${ref.join(',')})`);
  }
}
console.log('UNION mine', [ux0, uy0, ux1, uy1].join(','), ' ref', [rx0, ry0, rx1, ry1].join(','));
