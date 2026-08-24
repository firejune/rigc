import { Fitter, refFrame, cropPlate } from './fit.ts';
import { Plate, encodePng } from '../../../../tools/plate.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Pose } from './fit.ts';
const pl = JSON.parse(readFileSync('work/placements-shoot.json', 'utf8')).shoot;
const f = new Fitter();
const X = 195, Y = 195, W = 180, H = 115;
const view = f.window(X, Y, W, H);
const arts = ['muzzle01','muzzle02','muzzle03','muzzle04','muzzle05'];
const out: Record<string, unknown> = {};
const panels: Plate[] = [];
for (const i of [2, 3, 4]) {
  const crop = cropPlate(refFrame('shoot', i), X, Y, W, H);
  const rows: [string, number, Record<string, number>][] = [];
  for (const art of arts) {
    f.rig.setAttachment('muzzle', art);
    const pose: Pose = JSON.parse(JSON.stringify(pl[i]));
    pose['muzzle'] = { rotation: 0, x: 0, y: 0, scaleX: 1, scaleY: 1 };
    const m = pose['muzzle'] as Record<string, number>;
    const setS = (v: number) => { m.scaleX = v; m.scaleY = v; };
    let c = Infinity;
    for (let s = 0.6; s <= 4.5; s += 0.1) for (let x = -60; x <= 200; x += 20) for (let y = -60; y <= 60; y += 20) {
      setS(s); m.x = x; m.y = y;
      const q = f.cost(pose, view, crop, 4);
      if (q < c) { c = q; out['tmp'] = null; m.x = x; m.y = y; }
    }
    // redo keeping the best (recompute since loop mutates)
    let bs = 1, bx = 0, by = 0; c = Infinity;
    for (let s = 0.6; s <= 4.5; s += 0.1) for (let x = -60; x <= 200; x += 20) for (let y = -60; y <= 60; y += 20) {
      setS(s); m.x = x; m.y = y;
      const q = f.cost(pose, view, crop, 4);
      if (q < c) { c = q; bs = s; bx = x; by = y; }
    }
    setS(bs); m.x = bx; m.y = by;
    for (const block of [2, 1]) {
      c = f.cost(pose, view, crop, block);
      for (const st of [8, 4, 2, 1, 0.5, 0.25]) {
        for (const k of ['x', 'y', 'rotation']) {
          const cur = m[k]; let bv = cur;
          for (const v of [cur - st, cur + st]) { m[k] = v; const q = f.cost(pose, view, crop, block); if (q < c - 1e-7) { c = q; bv = v; } }
          m[k] = bv;
        }
        const cur = m.scaleX; let bv = cur;
        for (const v of [cur - st / 25, cur + st / 25]) { setS(v); const q = f.cost(pose, view, crop, block); if (q < c - 1e-7) { c = q; bv = v; } }
        setS(bv);
      }
    }
    rows.push([art, c, { ...m }]);
  }
  rows.sort((a, b) => a[1] - b[1]);
  f.rig.setAttachment('muzzle', null);
  const bare = f.cost(pl[i], view, crop, 1);
  console.log(`f${i}  none ${bare.toFixed(4)} | ` + rows.map(([a, c]) => `${a}=${c.toFixed(4)}`).join(' ') + `  gap ${(((rows[1][1]-rows[0][1])/rows[0][1])*100).toFixed(1)}%  best ${JSON.stringify(rows[0][2])}`);
  out[i] = { art: rows[0][0], pose: rows[0][2], cost: rows[0][1], bare };
  f.rig.setAttachment('muzzle', rows[0][0]);
  const pose: Pose = JSON.parse(JSON.stringify(pl[i])); pose['muzzle'] = rows[0][2];
  f.rig.apply(pose);
  panels.push(f.rig.render(view), crop);
}
writeFileSync('work/muzzle.json', JSON.stringify(out, null, 1));
const S = 4;
const img = new Plate(W * S * panels.length + 6 * panels.length, H * S);
panels.forEach((p, k) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const si = (y * W + x) * 4;
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) { const di = ((y * S + dy) * img.width + x * S + dx + k * (W * S + 6)) * 4;
    img.data[di] = p.data[si]; img.data[di+1] = p.data[si+1]; img.data[di+2] = p.data[si+2]; img.data[di+3] = 255; } } });
writeFileSync('work/muzzlefit.png', encodePng(img.width, img.height, img.data));
