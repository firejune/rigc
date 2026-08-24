/**
 * §8's second draw-order test: build the rig both ways, render each at the
 * frames' own scale and compare like with like. A gap inside the objective's
 * own scatter is no answer and is reported as one.
 */
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { emitRig, SLOTS } from './emit.ts';
import { Fitter, refFrame, cropPlate } from './fit.ts';
import { FIST, MUZZLE } from './fitrun.ts';
import type { Pose } from './fit.ts';
import type { Plate } from '../../../../tools/plate.ts';

const SPREAD: [string, number[]][] = [
  ['idle', [0, 6, 12, 18]], ['walk', [0, 3, 6, 9, 12]], ['run', [0, 2, 4, 6, 8]],
  ['aim', [0]], ['jump', [0, 8, 16]], ['death', [0, 8, 30, 50]], ['hit', [0, 3]], ['shoot', [0, 3]],
];
/** each variant is a list of [slot, moveBefore] swaps applied to the base order */
const VARIANTS: Record<string, [string, string][]> = JSON.parse(process.argv[2] ?? '{}');
const ROT = ['torso', 'neck', 'head', 'front-thigh', 'front-shin', 'front-foot', 'rear-thigh', 'rear-shin', 'rear-foot',
  'front-upper-arm', 'front-bracer', 'front-fist', 'rear-upper-arm', 'rear-bracer', 'gun'];

function orderFor(swaps: [string, string][]): string[] {
  const names = SLOTS.map(([n]) => n);
  for (const [slot, before] of swaps) {
    const from = names.indexOf(slot);
    names.splice(from, 1);
    const to = names.indexOf(before);
    names.splice(to < 0 ? names.length : to, 0, slot);
  }
  return names;
}
const X = 110, Y = 150, W = 190, H = 205;
const results: Record<string, number> = {};
for (const [label, swaps] of Object.entries(VARIANTS)) {
  const order = orderFor(swaps);
  const rig = emitRig() as { slots: { name: string }[] };
  rig.slots.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  const dir = `work/order/${label}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/rig.json`, JSON.stringify(rig, null, 1));
  execSync(`bun cli.ts build --rig ${dir}/rig.json --motion bench/runs/2026-08-24-spineboy-3/ess/spineboy-ess.motion.json --images examples/spineboy/images --out ${dir}/spine --profile spine`, { stdio: 'pipe' });
  const f = new Fitter(`${dir}/spine`);
  const view = f.window(X, Y, W, H);
  let acc = 0, n = 0;
  for (const [anim, idxs] of SPREAD) {
    const pl = JSON.parse(readFileSync(`work/placements-${anim}.json`, 'utf8'))[anim];
    f.rig.setAttachment('front-fist', FIST[anim] ?? 'front-fist-open');
    for (const i of idxs) {
      f.rig.setAttachment('muzzle', anim === 'shoot' ? (MUZZLE[i] ?? null) : null);
      const crop: Plate = cropPlate(refFrame(anim, i), X, Y, W, H);
      const pose: Pose = JSON.parse(JSON.stringify(pl[i]));
      let best = f.cost(pose, view, crop, 1);
      for (const st of [3, 1.5, 0.75, 0.35]) for (const b of ROT) {
        const s = (pose[b] ??= {}); const cur = s.rotation ?? 0; let bv = cur;
        for (const v of [cur - st, cur + st]) { s.rotation = v; const q = f.cost(pose, view, crop, 1); if (q < best - 1e-7) { best = q; bv = v; } }
        s.rotation = bv;
      }
      acc += best; n++;
    }
  }
  results[label] = acc / n;
  console.log(label.padEnd(28), (acc / n).toFixed(5));
}
const sorted = Object.entries(results).sort((a, b) => a[1] - b[1]);
if (sorted.length > 1) {
  const gap = ((sorted[1][1] - sorted[0][1]) / sorted[0][1]) * 100;
  console.log(`\nbest ${sorted[0][0]} by ${gap.toFixed(2)}%${gap < 1 ? '  — inside the objective\'s own scatter: NO ANSWER' : ''}`);
}
