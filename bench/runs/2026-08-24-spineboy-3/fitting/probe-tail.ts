import { loadPosable, sampleAnimation, renderFrame } from '../src/render.ts';
import { fullViewport } from './harness.ts';
import { refFrame } from './fit.ts';
import { piecesOf, projector } from '../src/render.ts';
import { Rigger } from './harness.ts';
import { readFileSync } from 'node:fs';
const dir = 'bench/runs/2026-08-24-spineboy-3/ess/spine';
const p = loadPosable(`${dir}/skeleton.json`, `${dir}/skeleton.atlas`, dir);
const view = fullViewport('bench/reference/spineboy/ess/frames.json');
// which of MY slots reaches lowest on death f8..f12?
const r = new Rigger(dir);
const pl = JSON.parse(readFileSync('work/placements-death.json', 'utf8')).death;
const project = projector(view);
for (const i of [8, 9, 10, 11, 12]) {
  r.setAttachment('front-fist', 'front-fist-open');
  r.apply(pl[i]);
  let worst = ['', -1];
  for (const pc of piecesOf(r.skeleton)) {
    let lo = -1;
    for (let k = 0; k < pc.world.length; k += 2) lo = Math.max(lo, project(pc.world[k], pc.world[k+1])[1]);
    if (lo > (worst[1] as number)) worst = [pc.slot, lo];
  }
  const ref = refFrame('death', i);
  let refLo = -1;
  for (let y = 0; y < ref.height; y++) for (let x = 0; x < ref.width; x++) { const j = (y * ref.width + x) * 4;
    if (Math.abs(ref.data[j]-232)>8||Math.abs(ref.data[j+1]-232)>8||Math.abs(ref.data[j+2]-232)>8) refLo = Math.max(refLo, y); }
  console.log(`death/f${i}`.padEnd(12), `my lowest slot ${worst[0]} at row ${(worst[1] as number).toFixed(0)}`.padEnd(46), `reference lowest row ${refLo}`);
}
// shoot f4: my rightmost slot vs the reference's rightmost column
const pls = JSON.parse(readFileSync('work/placements-shoot.json', 'utf8')).shoot;
r.setAttachment('front-fist', 'front-fist-closed');
r.setAttachment('muzzle', 'muzzle04');
r.apply(pls[4]);
let far = ['', -1];
for (const pc of piecesOf(r.skeleton)) { let hi = -1;
  for (let k = 0; k < pc.world.length; k += 2) hi = Math.max(hi, project(pc.world[k], pc.world[k+1])[0]);
  if (hi > (far[1] as number)) far = [pc.slot, hi]; }
console.log('shoot/f4 my rightmost slot', far[0], 'at col', (far[1] as number).toFixed(0), '(quad edge, not drawn ink)');
void sampleAnimation; void renderFrame;
