/**
 * §8's second draw-order test: render the candidate both ways and measure.
 *
 * The frames settle one edge in this rung by themselves (the near leg is in
 * front of the gun) and the brief says the search for others came up empty.
 * Like-for-like reaches the rest — or reports honestly that it cannot, which is
 * an answer too and the one §8 says you have to let it give.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadCandidate, loadFrame, mae, Rigged } from './harness.ts';
import { toPose, type FramePose } from './fit-poses.ts';
import { PARTS } from './rigdata.ts';

const here = import.meta.dir;
const run = join(here, '..');
const rig = new Rigged(loadCandidate(join(run, 'ess', 'spine')));
const base = PARTS.map((p) => p.slot);

const shots = process.argv.slice(3).length ? process.argv.slice(3) : ['idle', 'walk', 'run', 'jump', 'shoot', 'hit'];

function total(order: string[] | null): number {
  rig.order = order;
  let sum = 0;
  let n = 0;
  for (const anim of shots) {
    const poses: FramePose[] = JSON.parse(readFileSync(join(here, `poses-${anim}.json`), 'utf8'));
    const dir = join(run, '../../reference/spineboy/ess', anim);
    const files = readdirSync(dir).filter((f) => /^f\d+\.png$/.test(f)).sort();
    poses.forEach((p, i) => {
      if (i >= files.length) return;
      sum += mae(rig.render(toPose(p.v, p.fist)), loadFrame(join(dir, files[i])));
      n++;
    });
  }
  rig.order = null;
  return sum / n;
}

function moved(slot: string, to: number): string[] {
  const o = base.filter((s) => s !== slot);
  o.splice(to, 0, slot);
  return o;
}

const b = total(base);
console.log(`base order: ${b.toFixed(4)}`);
const slot = process.argv[2];
if (slot) {
  for (let i = 0; i < base.length; i++) {
    const o = moved(slot, i);
    if (o.join() === base.join()) continue;
    const v = total(o);
    console.log(`  ${slot} → index ${i} (before ${o[i + 1] ?? 'end'}): ${v.toFixed(4)}  ${(v - b >= 0 ? '+' : '') + (v - b).toFixed(4)}`);
  }
}
