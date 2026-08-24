/** Which flare, how big, where — settled by fitting each candidate and comparing. */
import { Fitter, refFrame, cropPlate } from './fit.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Pose } from './fit.ts';
const pl = JSON.parse(readFileSync('work/placements-shoot.json', 'utf8')).shoot;
const f = new Fitter();
const X = 200, Y = 200, W = 175, H = 110;
const view = f.window(X, Y, W, H);
const arts = ['muzzle01','muzzle02','muzzle03','muzzle04','muzzle05'];
const best: Record<number, { art: string; pose: Record<string, number>; cost: number }> = {};
for (const i of [2, 3, 4]) {
  const crop = cropPlate(refFrame('shoot', i), X, Y, W, H);
  const rows: [string, number, Record<string, number>][] = [];
  for (const art of arts) {
    f.rig.setAttachment('muzzle', art);
    const pose: Pose = JSON.parse(JSON.stringify(pl[i]));
    pose['muzzle'] = { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1 };
    const m = pose['muzzle'] as Record<string, number>;
    let c = f.cost(pose, view, crop, 4);
    // coarse: scale then place then turn
    for (const [k, lo, hi, st] of [['scaleX',0.5,5,0.25],['scaleY',0.5,5,0.25],['x',-120,160,10],['y',-90,90,10],['rotation',-45,45,3]] as [string,number,number,number][]) {
      let bv = m[k];
      for (let v = lo; v <= hi + 1e-9; v += st) { m[k] = v; const q = f.cost(pose, view, crop, 4); if (q < c) { c = q; bv = v; } }
      m[k] = bv;
    }
    for (const block of [2, 1]) {
      c = f.cost(pose, view, crop, block);
      for (const st of [8, 4, 2, 1, 0.5]) for (const k of ['scaleX','scaleY','x','y','rotation']) {
        const sc = k.startsWith('scale') ? st / 20 : st; const cur = m[k]; let bv = cur;
        for (const v of [cur - sc, cur + sc]) { m[k] = v; const q = f.cost(pose, view, crop, block); if (q < c - 1e-7) { c = q; bv = v; } }
        m[k] = bv;
      }
    }
    rows.push([art, c, { ...m }]);
  }
  rows.sort((a, b) => a[1] - b[1]);
  f.rig.setAttachment('muzzle', null);
  const bare = f.cost(pl[i], view, crop, 1);
  console.log(`f${i}  no flare ${bare.toFixed(4)} | ` + rows.map(([a, c]) => `${a}=${c.toFixed(4)}`).join('  ') + `  gap ${(((rows[1][1]-rows[0][1])/rows[0][1])*100).toFixed(1)}%`);
  console.log('     best pose', JSON.stringify(rows[0][2]));
  best[i] = { art: rows[0][0], pose: rows[0][2], cost: rows[0][1] };
}
writeFileSync('work/muzzle.json', JSON.stringify(best, null, 1));
