/**
 * Fist test with the search restricted to where the fitted rig actually puts
 * the hand — the control the whole-figure search failed (it matched the head).
 * Calibrated on `idle/f0000` and `walk`, whose answers the brief already gives.
 */
import { Fitter, refFrame } from './fit.ts';
import { piecesOf } from '../src/render.ts';
import { projector } from '../src/render.ts';
import { buildTemplate, match } from './match.ts';
import { readFileSync } from 'node:fs';
import { FIST } from './fitrun.ts';
const RAD = Number(process.env.RAD ?? 9);
const f = new Fitter();
const tpl = { 'front-fist-closed': buildTemplate('examples/spineboy/images/front-fist-closed.png', 'c'), 'front-fist-open': buildTemplate('examples/spineboy/images/front-fist-open.png', 'o') };
const CASES: [string, number[]][] = process.env.CASES ? JSON.parse(process.env.CASES) : [['idle',[0,10]],['walk',[0,4,8]],['run',[0,4,8]],['jump',[0,4,8,16]],['shoot',[0,3]],['hit',[0,4]],['death',[0,10,40,50]],['aim',[0]]];
for (const [anim, idxs] of CASES) {
  const pl = JSON.parse(readFileSync(`work/placements-${anim}.json`, 'utf8'))[anim];
  f.rig.setAttachment('front-fist', FIST[anim] ?? 'front-fist-open');
  const scores: Record<string, number[]> = { 'front-fist-closed': [], 'front-fist-open': [] };
  for (const i of idxs) {
    f.rig.apply(pl[i]);
    const project = projector(f.full);
    let cx = 0, cy = 0, n = 0;
    for (const p of piecesOf(f.rig.skeleton)) if (p.slot === 'front-fist') {
      for (let k = 0; k < p.world.length; k += 2) { const [x, y] = project(p.world[k], p.world[k + 1]); cx += x; cy += y; n++; }
    }
    if (!n) continue;
    cx /= n; cy /= n;
    const fr = refFrame(anim, i);
    for (const name of Object.keys(tpl) as (keyof typeof tpl)[]) {
      const m = match(tpl[name], fr, [cx - RAD, cy - RAD, cx + RAD, cy + RAD]);
      scores[name].push(m.residual);
    }
  }
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  const c = mean(scores['front-fist-closed']), o = mean(scores['front-fist-open']);
  const win = c < o ? 'closed' : 'open';
  console.log(anim.padEnd(7), `closed ${c.toFixed(0)}`.padEnd(14), `open ${o.toFixed(0)}`.padEnd(14), `ratio ${(Math.max(c, o) / Math.min(c, o)).toFixed(2)}x -> ${win}`);
  if (process.env.PERFRAME) idxs.forEach((i, k) => {
    const cc = scores['front-fist-closed'][k], oo = scores['front-fist-open'][k];
    console.log(`   f${i}`.padEnd(9), `closed ${cc?.toFixed(0)}`.padEnd(14), `open ${oo?.toFixed(0)}`.padEnd(14), `-> ${cc < oo ? 'closed' : 'open'} ${(Math.max(cc, oo) / Math.min(cc, oo)).toFixed(2)}x`);
  });
}
