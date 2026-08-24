import { Fitter, refFrame, cropPlate } from './fit.ts';
import { Plate, encodePng } from '../tools/plate.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import type { Pose } from './fit.ts';
const pl = JSON.parse(readFileSync('work/placements-shoot.json', 'utf8')).shoot;
const f = new Fitter();
const X = 190, Y = 190, W = 190, H = 120;
const view = f.window(X, Y, W, H);
const K = 3.369;
const ASSIGN: [number, string][] = [[2, 'muzzle01'], [3, 'muzzle03'], [4, 'muzzle04']];
const off: Record<string, [number, number]> = {};
const bone: Record<number, { rotation: number }> = {};
const panels: Plate[] = [];
for (const [i, art] of ASSIGN) {
  const crop = cropPlate(refFrame('shoot', i), X, Y, W, H);
  f.rig.setAttachment('muzzle', art);
  const pose: Pose = JSON.parse(JSON.stringify(pl[i]));
  let bx = 150, by = 0, br = -20, best = Infinity;
  for (let ox = 20; ox <= 420; ox += 15) for (let oy = -90; oy <= 90; oy += 15) for (let r = -40; r <= 20; r += 5) {
    f.rig.setAttachmentTransform('muzzle', art, { x: ox, y: oy, scaleX: K, scaleY: K, rotation: 0 });
    pose['muzzle'] = { rotation: r };
    const q = f.cost(pose, view, crop, 4);
    if (q < best) { best = q; bx = ox; by = oy; br = r; }
  }
  let cur = { x: bx, y: by, r: br };
  for (const block of [2, 1]) {
    f.rig.setAttachmentTransform('muzzle', art, { x: cur.x, y: cur.y, scaleX: K, scaleY: K, rotation: 0 });
    pose['muzzle'] = { rotation: cur.r };
    best = f.cost(pose, view, crop, block);
    for (const st of [10, 5, 2, 1, 0.5]) for (const key of ['x', 'y', 'r'] as const) {
      const d = key === 'r' ? st / 3 : st;
      const c0 = cur[key]; let bv = c0;
      for (const v of [c0 - d, c0 + d]) {
        const t = { ...cur, [key]: v };
        f.rig.setAttachmentTransform('muzzle', art, { x: t.x, y: t.y, scaleX: K, scaleY: K, rotation: 0 });
        pose['muzzle'] = { rotation: t.r };
        const q = f.cost(pose, view, crop, block);
        if (q < best - 1e-7) { best = q; bv = v; }
      }
      cur = { ...cur, [key]: bv };
    }
  }
  off[art] = [cur.x, cur.y]; bone[i] = { rotation: cur.r };
  f.rig.setAttachmentTransform('muzzle', art, { x: cur.x, y: cur.y, scaleX: K, scaleY: K, rotation: 0 });
  pose['muzzle'] = { rotation: cur.r };
  f.rig.apply(pose);
  const bare = (() => { f.rig.setAttachment('muzzle', null); const q = f.cost(pl[i], view, crop, 1); f.rig.setAttachment('muzzle', art); return q; })();
  console.log(`f${i} ${art} -> ${best.toFixed(4)} (bare ${bare.toFixed(4)})  off ${JSON.stringify(cur)}`);
  f.rig.setAttachment('muzzle', art);
  f.rig.apply(pose);
  panels.push(f.rig.render(view), crop);
}
writeFileSync('work/muzzle.json', JSON.stringify({ k: K, off, bone, assign: ASSIGN }, null, 1));
const S = 4;
const img = new Plate(W * S * panels.length + 6 * panels.length, H * S);
panels.forEach((p, kk) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const si = (y * W + x) * 4;
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) { const di = ((y * S + dy) * img.width + x * S + dx + kk * (W * S + 6)) * 4;
    img.data[di] = p.data[si]; img.data[di+1] = p.data[si+1]; img.data[di+2] = p.data[si+2]; img.data[di+3] = 255; } } });
writeFileSync('work/muzzlefit.png', encodePng(img.width, img.height, img.data));
