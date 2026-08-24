/**
 * The flare sized and placed as an ATTACHMENT (a constant of the rig), with only
 * the bone's rotation left per frame — the shape an animator authors.
 */
import { Fitter, refFrame, cropPlate } from './fit.ts';
import { Plate, encodePng } from '../tools/plate.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Pose } from './fit.ts';
const pl = JSON.parse(readFileSync('work/placements-shoot.json', 'utf8')).shoot;
const f = new Fitter();
const X = 190, Y = 190, W = 190, H = 120;
const view = f.window(X, Y, W, H);
const arts = ['muzzle01','muzzle02','muzzle03','muzzle04','muzzle05'];
const out: Record<string, unknown> = {};
const panels: Plate[] = [];
for (const i of [2, 3, 4]) {
  const crop = cropPlate(refFrame('shoot', i), X, Y, W, H);
  const rows: [string, number, Record<string, number>, number][] = [];
  for (const art of arts) {
    f.rig.setAttachment('muzzle', art);
    const pose: Pose = JSON.parse(JSON.stringify(pl[i]));
    pose['muzzle'] = { rotation: 0 };
    const m = pose['muzzle'] as Record<string, number>;
    let bk = 1, bx = 0, by = 0, br = 0, best = Infinity;
    for (let k = 1; k <= 7; k += 0.5) for (let ox = -50; ox <= 550; ox += 40) for (let oy = -120; oy <= 120; oy += 40) {
      f.rig.setAttachmentTransform('muzzle', art, { x: ox, y: oy, scaleX: k, scaleY: k, rotation: 0 });
      const q = f.cost(pose, view, crop, 4);
      if (q < best) { best = q; bk = k; bx = ox; by = oy; }
    }
    let cur = { k: bk, x: bx, y: by, r: br };
    for (const block of [2, 1]) {
      f.rig.setAttachmentTransform('muzzle', art, { x: cur.x, y: cur.y, scaleX: cur.k, scaleY: cur.k, rotation: 0 });
      m.rotation = cur.r;
      best = f.cost(pose, view, crop, block);
      for (const st of [20, 10, 5, 2, 1]) for (const key of ['k', 'x', 'y', 'r'] as const) {
        const d = key === 'k' ? st / 40 : key === 'r' ? st / 3 : st;
        const c0 = cur[key]; let bv = c0;
        for (const v of [c0 - d, c0 + d]) {
          const t = { ...cur, [key]: v };
          f.rig.setAttachmentTransform('muzzle', art, { x: t.x, y: t.y, scaleX: t.k, scaleY: t.k, rotation: 0 });
          m.rotation = t.r;
          const q = f.cost(pose, view, crop, block);
          if (q < best - 1e-7) { best = q; bv = v; }
        }
        cur = { ...cur, [key]: bv };
        f.rig.setAttachmentTransform('muzzle', art, { x: cur.x, y: cur.y, scaleX: cur.k, scaleY: cur.k, rotation: 0 });
        m.rotation = cur.r;
      }
    }
    rows.push([art, best, { ...cur }, cur.k]);
  }
  rows.sort((a, b) => a[1] - b[1]);
  f.rig.setAttachment('muzzle', null);
  const bare = f.cost(pl[i], view, crop, 1);
  console.log(`f${i} none ${bare.toFixed(4)} | ` + rows.map(([a, c]) => `${a}=${c.toFixed(4)}`).join(' ') + `  gap ${(((rows[1][1]-rows[0][1])/rows[0][1])*100).toFixed(1)}%`);
  console.log('   ', rows[0][0], JSON.stringify(rows[0][2]));
  out[i] = { art: rows[0][0], t: rows[0][2], cost: rows[0][1], bare, all: rows.map(([a, c]) => [a, c]) };
  const art = rows[0][0], t = rows[0][2];
  f.rig.setAttachment('muzzle', art);
  f.rig.setAttachmentTransform('muzzle', art, { x: t.x, y: t.y, scaleX: t.k, scaleY: t.k, rotation: 0 });
  const pose: Pose = JSON.parse(JSON.stringify(pl[i])); pose['muzzle'] = { rotation: t.r };
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
