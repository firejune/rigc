/**
 * Does the file play what the fit found? — AUTHORING §9.1's exit check.
 *
 * *"A pipeline with a fit at one end and a file at the other needs one check that
 * the file plays what the fit found, and it belongs before the measures rather
 * than after a day of them."* `sampleAnimation` is the same stepper the reference
 * frames were made with, so this is exact: for two samples of one animation, every
 * bone whose world position or world angle differs, and by how much.
 *
 * It is also the instrument that caught `death`'s hold leaking. The compiled
 * animation moved `front-shin`, `front-foot` and `rear-foot` across f22->f23 where
 * the pose series held them equal, which is how the broken hold relation (LOOP
 * section 4.7) was localised to the planner's input rather than to its curves.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { posableFromText, sampleAnimation } from '../../../../src/render.ts';
const R = 'bench/runs/2026-09-03-spineboy-1';
const { data } = posableFromText(
  readFileSync(join(R, 'spine/skeleton.json'), 'utf8'),
  readFileSync(join(R, 'spine/skeleton.atlas'), 'utf8'),
  join(R, 'spine'),
);
const frames = sampleAnimation(data, process.argv[2] ?? 'death', 12, { bones: true });
const a = Number(process.argv[3] ?? 22);
const b = Number(process.argv[4] ?? 23);
const fa = frames[a].bones!;
const fb = frames[b].bones!;
for (let i = 0; i < fa.length; i++) {
  const d = Math.hypot(fa[i].worldX - fb[i].worldX, fa[i].worldY - fb[i].worldY);
  const dr = Math.abs(fa[i].rotationX - fb[i].rotationX);
  if (d > 0.01 || dr > 0.001) console.log(fa[i].name.padEnd(18), 'dpos', d.toFixed(3), 'drot', dr.toFixed(4));
}
