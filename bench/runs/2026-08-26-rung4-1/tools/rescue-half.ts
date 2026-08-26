/**
 * Exhaustive rescue for a half-frame whose tile is far off.
 *
 * The sheet clause reads a set's WORST tile against that sheet's own mean, so a
 * single half-frame in a basin costs more than a hundred good ones gain. Same
 * method as `rescue.ts`, at the tile's own scale: walk the product of the
 * saucer's rotation and the chain's first joint, take the whole schedule from
 * each start, and keep only what beats what is on disk.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { sheetTiles, rigFrom, scoreKnobs, Scratch, type Knobs, type RefFrame } from './fitlib.ts';
import { tileViewport } from './half.ts';

const RUN = 'bench/runs/2026-08-26-rung4-1';
const D = `${RUN}/spine`;
const U = 11.507375;
const setName = process.argv[2];
const worst = Number(process.argv[3] ?? 8);
const n24 = setName === 'ball-catch' ? 241 : 33;
const ball = setName === 'ball-catch';
const rig = rigFrom(readFileSync(`${D}/skeleton.json`, 'utf8'), readFileSync(`${D}/skeleton.atlas`, 'utf8'), D);
const tiles: RefFrame[] = sheetTiles(`bench/reference/4-wave-principle/${setName}@24fps/contact.png`, n24, 8, 0, 0);
const v = tileViewport(3);
const sc = new Scratch(v.width, v.height);
const file = `${RUN}/fit/${setName}.half.json`;
const doc = JSON.parse(readFileSync(file, 'utf8')) as { poses: Knobs[]; fps: number };

const ranked = doc.poses
  .map((k, i) => ({ i, r: tiles[i].inkCount ? scoreKnobs(sc, rig, v, tiles[i], k) / tiles[i].inkCost : 0 }))
  .filter((x) => x.i % 2 === 1)
  .sort((a, b) => b.r - a.r)
  .slice(0, worst);

const polish = (k: Knobs, ref: RefFrame): { k: Knobs; score: number } => {
  let best = { ...k };
  let bestScore = scoreKnobs(sc, rig, v, ref, best);
  const steps: [keyof Knobs, number][] = [['px', 30 * U], ['py', 30 * U], ['prot', 40], ['c1', 40], ['c2', 40], ['c3', 40], ['c4', 45]];
  if (ball) steps.push(['bx', 45 * U], ['by', 45 * U], ['bsx', 0.35], ['bsy', 0.35], ['brot', 45], ['srot', 45]);
  for (let round = 0; round < 5; round++) {
    const shrink = Math.pow(0.4, round);
    for (const [name, span0] of steps) {
      const span = span0 * shrink, step = span / 7;
      const centre = best[name] as number;
      for (let q = -7; q <= 7; q++) {
        if (q === 0) continue;
        const trial = { ...best, [name]: centre + q * step } as Knobs;
        const s = scoreKnobs(sc, rig, v, ref, trial);
        if (s < bestScore) { bestScore = s; best = trial; }
      }
    }
  }
  return { k: best, score: bestScore };
};

let touched = 0;
for (const { i, r } of ranked) {
  const ref = tiles[i];
  let best = polish(doc.poses[i], ref);
  for (let a = 0; a < 360; a += 30) {
    for (const c1 of [-60, -90, -120]) {
      const cand = polish({ ...doc.poses[i], prot: a, c1, c2: 0, c3: 0, c4: 0, ball }, ref);
      if (cand.score < best.score) best = cand;
    }
  }
  const after = best.score / ref.inkCost;
  if (after < r - 1e-9) { doc.poses[i] = best.k; touched++; }
  console.log(`tile ${String(i).padStart(4, '0')} ${r.toFixed(4)} -> ${after.toFixed(4)}`);
}
writeFileSync(file, JSON.stringify(doc, null, 1));
console.log(`${setName}: ${touched} half-frame(s) rescued`);
