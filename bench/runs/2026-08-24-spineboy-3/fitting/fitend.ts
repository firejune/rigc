/**
 * Fit the ONE frame each 30 fps set ships at the animation's own duration —
 * the only sample the reference gives at a time the 12 fps grid never lands on,
 * and the key an animation has to end on.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Fitter, cropPlate, knobsFor } from './fit.ts';
import { readPlate } from '../../../../tools/plate.ts';
import { FIST } from './fitrun.ts';
import { DUR } from './genmotion.ts';
import type { Pose } from './fit.ts';

const END: Record<string, number> = { death: 148, hit: 10, idle: 50, jump: 40, run: 20, shoot: 12, walk: 30 };
const out: Record<string, Pose> = {};
const f = new Fitter();
const X = 40, Y = 100, W = 330, H = 260;
const view = f.window(X, Y, W, H);
for (const [anim, idx] of Object.entries(END)) {
  const path = `bench/reference/spineboy/ess/${anim}@30fps/f${String(idx).padStart(4, '0')}.png`;
  if (!existsSync(path)) { console.error('missing', path); continue; }
  const pl = JSON.parse(readFileSync(`work/placements-${anim}.json`, 'utf8'))[anim];
  const last = Math.max(...Object.keys(pl).map(Number));
  const crop = cropPlate(readPlate(path), X, Y, W, H);
  f.rig.setAttachment('front-fist', FIST[anim] ?? 'front-fist-open');
  const pose: Pose = JSON.parse(JSON.stringify(pl[last]));
  const kn = knobsFor(pose, false);
  let best = f.cost(pose, view, crop, 1);
  const start = best;
  for (const st of [3, 1.5, 0.75, 0.35, 0.15]) for (const k of kn) {
    const s = (pose[k.bone] ??= {}); const cur = s[k.prop] ?? 0; let bv = cur;
    for (const v of [cur - st, cur + st]) { s[k.prop] = v; const c = f.cost(pose, view, crop, 1); if (c < best - 1e-7) { best = c; bv = v; } }
    s[k.prop] = bv;
  }
  out[anim] = pose;
  console.log(anim.padEnd(8), `t=${DUR[anim].toFixed(4)}  seed ${start.toFixed(3)} -> ${best.toFixed(3)}`);
}
writeFileSync('work/placements-end.json', JSON.stringify(out, null, 1));
