import { readFileSync } from 'node:fs';
import { readViewport } from './geom.ts';
import { loadPosable, refLevels, applyPose, score } from './fitlib.ts';
import { SLOTS } from './rig.ts';
const R='bench/runs/2026-09-03-spineboy-1';
const key = process.argv[2] ?? 'aim/f0000';
const [set, frame] = key.split('/');
const vp = readViewport('bench/reference/spineboy/ess/frames.json');
const p = loadPosable(`${R}/spine`);
const poses = JSON.parse(readFileSync(`${R}/fit/poses/${set.replace('@','_at_')}.json`,'utf8'));
const levels = refLevels(`bench/reference/spineboy/ess/${set}/${frame}.png`, vp, 24);
const lv = levels[3];
applyPose(p, poses[frame]);
const base = score(p, lv).value;
console.log('base', base.toFixed(3));
for (const s of SLOTS) {
  if (s.setup === null) continue;
  applyPose(p, poses[frame], { [s.slot]: null });
  const v = score(p, lv).value;
  console.log(`  hide ${s.slot.padEnd(18)} ${v.toFixed(3)}  ${(v-base>=0?'+':'')}${(v-base).toFixed(3)}`);
}
