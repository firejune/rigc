/**
 * Like-for-like attachment test (§8): fit the same frames twice, once per
 * candidate attachment, and compare the objective. A gap inside the objective's
 * own scatter is NOT a vote — it means the frames do not decide it.
 */
import { Fitter, refFrame, cropPlate, knobsFor } from './fit.ts';
import { readFileSync } from 'node:fs';
import type { Plate } from '../tools/plate.ts';
import type { Pose } from './fit.ts';

const slot = process.argv[2];
const options = process.argv[3].split(',');
const cases = process.argv[4].split('|').map((c) => { const [a, l] = c.split(':'); return [a, l.split(',').map(Number)] as [string, number[]]; });
const f = new Fitter();
const X = 60, Y = 120, W = 300, H = 235;
const view = f.window(X, Y, W, H);
for (const [anim, idxs] of cases) {
  const pl = JSON.parse(readFileSync(`work/placements-${anim}.json`, 'utf8'))[anim];
  const results: Record<string, number> = {};
  for (const opt of options) {
    f.rig.setAttachment(slot, opt === 'null' ? null : opt);
    let acc = 0;
    for (const i of idxs) {
      const crop: Plate = cropPlate(refFrame(anim, i), X, Y, W, H);
      const pose: Pose = JSON.parse(JSON.stringify(pl[i]));
      const kn = knobsFor(pose, false).filter((k) => k.bone.includes('fist') || k.bone.includes('bracer') || k.bone.includes('muzzle') || k.bone.includes('upper-arm') || k.bone === 'gun');
      // small local refit so neither option is scored on the other's pose
      let best = f.cost(pose, view, crop, 1);
      for (const st of [4, 2, 1]) for (const k of kn) {
        const s = (pose[k.bone] ??= {}); const cur = s[k.prop] ?? 0; let bv = cur;
        for (const v of [cur - st, cur + st]) { s[k.prop] = v; const c = f.cost(pose, view, crop, 1); if (c < best - 1e-7) { best = c; bv = v; } }
        s[k.prop] = bv;
      }
      acc += best;
    }
    results[opt] = acc / idxs.length;
  }
  const sorted = Object.entries(results).sort((a, b) => a[1] - b[1]);
  const gap = ((sorted[1][1] - sorted[0][1]) / sorted[0][1]) * 100;
  console.log(anim.padEnd(8), sorted.map(([n, v]) => `${n}=${v.toFixed(4)}`).join('  '), ` gap ${gap.toFixed(2)}%`);
}
