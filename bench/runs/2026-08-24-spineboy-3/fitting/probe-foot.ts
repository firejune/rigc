/** the boots, matched in a box around where they are — the control the
 *  whole-figure search failed. Then the same measure on MY render. */
import { readPlate } from '../tools/plate.ts';
import { buildTemplate, match } from './match.ts';
import { Fitter, refFrame } from './fit.ts';
import { readFileSync } from 'node:fs';
import { FIST } from './fitrun.ts';
const f = new Fitter();
const view = f.full;
const tf = buildTemplate('examples/spineboy/images/front-foot.png', 'ff');
const tr = buildTemplate('examples/spineboy/images/rear-foot.png', 'rf');
for (const [anim, i, fx, fy, rx, ry] of [['idle', 0, 158, 328, 196, 328], ['walk', 0, 160, 328, 205, 326]] as [string, number, number, number, number, number][]) {
  const pl = JSON.parse(readFileSync(`work/placements-${anim}.json`, 'utf8'))[anim];
  f.rig.setAttachment('front-fist', FIST[anim] ?? 'front-fist-open');
  f.rig.apply(pl[i]);
  const mine = f.rig.render(view);
  const ref = refFrame(anim, i);
  for (const [name, t, bx, by] of [['front-foot', tf, fx, fy], ['rear-foot', tr, rx, ry]] as [string, typeof tf, number, number][]) {
    const mr = match(t, ref, [bx - 11, by - 11, bx + 11, by + 11]);
    const mm = match(t, mine, [bx - 16, by - 16, bx + 16, by + 16]);
    console.log(`${anim}/f${i}`.padEnd(9), name.padEnd(11),
      `ref  (${mr.x.toFixed(1)},${mr.y.toFixed(1)}) deg ${mr.deg.toFixed(1)} res ${mr.residual.toFixed(0)} vis ${(mr.vis*100).toFixed(0)}%`.padEnd(52),
      `mine (${mm.x.toFixed(1)},${mm.y.toFixed(1)}) deg ${mm.deg.toFixed(1)} res ${mm.residual.toFixed(0)} vis ${(mm.vis*100).toFixed(0)}%`);
  }
}
