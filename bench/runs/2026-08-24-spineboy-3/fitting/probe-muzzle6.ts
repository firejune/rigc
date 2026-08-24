/** muzzle04 on shoot f4, with a free scale: does the reference's flare reach
 *  further than a pinned 3.369 allows? Reference reaches column 354. */
import { Fitter, refFrame, cropPlate } from './fit.ts';
import { readFileSync } from 'node:fs';
import { piecesOf, projector } from '../src/render.ts';
import type { Pose } from './fit.ts';
const pl = JSON.parse(readFileSync('work/placements-shoot.json', 'utf8')).shoot;
const f = new Fitter();
const X = 190, Y = 190, W = 190, H = 120;
const view = f.window(X, Y, W, H);
const project = projector(f.full);
for (const [i, art] of [[2, 'muzzle01'], [3, 'muzzle03'], [4, 'muzzle04']] as [number, string][]) {
  const crop = cropPlate(refFrame('shoot', i), X, Y, W, H);
  f.rig.setAttachment('muzzle', art);
  const pose: Pose = JSON.parse(JSON.stringify(pl[i]));
  const a = f.rig.skeleton.getAttachment('muzzle', art) as unknown as { x: number; y: number; scaleX: number };
  let cur = { k: a.scaleX, x: a.x, y: a.y };
  f.rig.setAttachmentTransform('muzzle', art, { ...cur, scaleX: cur.k, scaleY: cur.k });
  let best = f.cost(pose, view, crop, 1);
  const start = best;
  for (const st of [40, 20, 10, 5, 2, 1, 0.5]) for (const key of ['k', 'x', 'y'] as const) {
    const d = key === 'k' ? st / 40 : st;
    const c0 = cur[key]; let bv = c0;
    for (const v of [c0 - d, c0 + d]) {
      const t = { ...cur, [key]: v };
      f.rig.setAttachmentTransform('muzzle', art, { x: t.x, y: t.y, scaleX: t.k, scaleY: t.k, rotation: 0 });
      const q = f.cost(pose, view, crop, 1);
      if (q < best - 1e-7) { best = q; bv = v; }
    }
    cur = { ...cur, [key]: bv };
    f.rig.setAttachmentTransform('muzzle', art, { x: cur.x, y: cur.y, scaleX: cur.k, scaleY: cur.k, rotation: 0 });
  }
  f.rig.apply(pose);
  let far = -1;
  for (const p of piecesOf(f.rig.skeleton)) if (p.slot === 'muzzle')
    for (let k = 0; k < p.world.length; k += 2) far = Math.max(far, project(p.world[k], p.world[k + 1])[0]);
  let refFar = -1;
  const fr = refFrame('shoot', i);
  for (let y = 0; y < fr.height; y++) for (let x = 0; x < fr.width; x++) { const j = (y * fr.width + x) * 4;
    if (Math.abs(fr.data[j]-232)>8||Math.abs(fr.data[j+1]-232)>8||Math.abs(fr.data[j+2]-232)>8) refFar = Math.max(refFar, x); }
  console.log(`f${i} ${art}`.padEnd(16), `${start.toFixed(4)} -> ${best.toFixed(4)}`.padEnd(22), `k ${cur.k.toFixed(3)} x ${cur.x.toFixed(1)} y ${cur.y.toFixed(1)}`.padEnd(34), `my flare quad reaches col ${far.toFixed(0)}, reference frame reaches ${refFar}`);
}
