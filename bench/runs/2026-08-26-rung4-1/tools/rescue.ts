/**
 * Exhaustive rescue for a frame the tracked search cannot leave.
 *
 * §8.1: *a search that stopped improving is evidence about the start it was given
 * and about nothing else.* The saucer's silhouette is an ellipse and the chain
 * hangs four ways off it, so a frame can sit in a basin no neighbour start
 * reaches. This walks the whole product of the saucer's rotation and the chain's
 * first joint — 18 x 3 starts, each taken through the full schedule — and keeps
 * the result only if it beats what is on disk. `ball-catch` frame 5 went from
 * 0.440 of the reference's ink cost to 0.199 on the first run of it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildLevels, loadRig, fitOne } from './fitrun.ts';
import type { Knobs } from './fitlib.ts';

const RUN = 'bench/runs/2026-08-26-rung4-1';
const setName = process.argv[2];
const count = setName === 'ball-catch' ? 121 : 17;
const ball = setName === 'ball-catch';
const threshold = Number(process.argv[3] ?? 0.2);
const rig = loadRig();
const levels = buildLevels(setName, count);
const file = `${RUN}/fit/${setName}.poses.json`;
const d = JSON.parse(readFileSync(file, 'utf8')) as { poses: Knobs[]; scores: number[] };
let touched = 0;
for (let i = 0; i < count; i++) {
  const ref = levels[2].refs[i];
  if (d.scores[i] / ref.inkCost <= threshold) continue;
  const before = d.scores[i];
  let best = { k: d.poses[i], score: d.scores[i] };
  for (let a = 0; a < 360; a += 20) {
    for (const c1 of [-60, -90, -120]) {
      const st: Knobs = { ...d.poses[i], prot: a, c1, c2: 0, c3: 0, c4: 0, ball };
      const r = fitOne(levels, rig, i, st, 'track');
      if (r.score < best.score) best = r;
    }
  }
  if (best.score < before) {
    d.poses[i] = best.k; d.scores[i] = best.score; touched++;
    console.log(`f${String(i).padStart(4, '0')} ${(before / ref.inkCost).toFixed(4)} -> ${(best.score / ref.inkCost).toFixed(4)}`);
  } else {
    console.log(`f${String(i).padStart(4, '0')} ${(before / ref.inkCost).toFixed(4)} unchanged`);
  }
}
writeFileSync(file, JSON.stringify(d, null, 1));
const ratios = d.scores.map((v, i) => v / levels[2].refs[i].inkCost);
console.log(`${setName}: ${touched} frame(s) rescued; mean ${(ratios.reduce((a, b) => a + b, 0) / count).toFixed(4)} worst ${Math.max(...ratios).toFixed(4)} at f${ratios.indexOf(Math.max(...ratios))}`);
