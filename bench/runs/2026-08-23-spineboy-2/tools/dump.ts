/** Render a fitted pose series back out, so the fit can be looked at. */
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadCandidate, Rigged } from './harness.ts';
import { toPose, type FramePose } from './fit-poses.ts';
const run = join(import.meta.dir, '..');
const rig = new Rigged(loadCandidate(join(run, 'ess', 'spine')));
const anim = process.argv[2];
const poses: FramePose[] = JSON.parse(readFileSync(join(import.meta.dir, `poses-${anim}.json`), 'utf8'));
const out = join(import.meta.dir, 'dump', anim);
mkdirSync(out, { recursive: true });
poses.forEach((p, i) => {
  rig.render(toPose(p.v, p.fist)).writePng(join(out, `f${String(i).padStart(4, '0')}.png`));
});
console.log(`${poses.length} frames → ${out}`);
