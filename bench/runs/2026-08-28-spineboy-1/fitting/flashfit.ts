/**
 * Fit shoot's muzzle flash: which muzzle art on f2/f3/f4, at what scale and
 * where. Emits fitting/flash.json for genmotion (attachment keys on the 30 fps
 * grid, stepped scale/translate keys on the muzzle bone).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Physics } from '@esotericsoftware/spine-core';
import { refFrames, RUN, art, BG, TOL, sidecar } from './lib.ts';
import { loadCandidate, applyPose, type PoseVec } from './pose.ts';
import { Plate } from '../../../../tools/plate.ts';

const frames = refFrames('shoot');
const store = JSON.parse(require('node:fs').readFileSync(join(RUN, 'fitting/poses/shoot.json'), 'utf8'));
const vw = sidecar().viewport;

// flash mask per frame: pixels that differ from f1 (no-flash) and are right of x=222
function flashMask(fi: number): { px: Set<number>; minX: number; maxX: number; minY: number; maxY: number } {
  const a = frames[1], b = frames[fi];
  const px = new Set<number>();
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let y = 0; y < b.height; y++) for (let x = 222; x < b.width; x++) {
    const i = (y * b.width + x) * 4;
    if (Math.abs(a.data[i] - b.data[i]) > TOL || Math.abs(a.data[i + 1] - b.data[i + 1]) > TOL || Math.abs(a.data[i + 2] - b.data[i + 2]) > TOL) {
      px.add(y * b.width + x);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { px, minX, maxX, minY, maxY };
}

/** composite art at scale s, rotation 0, centred at (cx,cy); SSD over union with mask */
function scoreArt(name: string, fi: number, cx: number, cy: number, s: number, m: ReturnType<typeof flashMask>): number {
  const a = art(name);
  const ref = frames[fi];
  const w = Math.round(a.width * s * vw.scale), h = Math.round(a.height * s * vw.scale);
  let sum = 0;
  const counted = new Set<number>();
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const u = Math.min(a.width - 1, px / (s * vw.scale));
    const v = Math.min(a.height - 1, py / (s * vw.scale));
    const ai = (Math.floor(v) * a.width + Math.floor(u)) * 4;
    const al = a.data[ai + 3] / 255;
    const fx = Math.round(cx - w / 2 + px), fy = Math.round(cy - h / 2 + py);
    if (fx < 0 || fy < 0 || fx >= ref.width || fy >= ref.height) continue;
    const key = fy * ref.width + fx;
    const fi2 = key * 4;
    const rr = a.data[ai] * al + BG[0] * (1 - al);
    const gg = a.data[ai + 1] * al + BG[1] * (1 - al);
    const bb = a.data[ai + 2] * al + BG[2] * (1 - al);
    if (al > 0.06 || m.px.has(key)) {
      const dr = rr - ref.data[fi2], dg = gg - ref.data[fi2 + 1], db = bb - ref.data[fi2 + 2];
      sum += dr * dr + dg * dg + db * db;
      counted.add(key);
    }
  }
  // charge mask pixels the composite never covered (absence)
  for (const key of m.px) {
    if (counted.has(key)) continue;
    const fi2 = key * 4;
    const dr = BG[0] - frames[fi].data[fi2], dg = BG[1] - frames[fi].data[fi2 + 1], db = BG[2] - frames[fi].data[fi2 + 2];
    sum += dr * dr + dg * dg + db * db;
  }
  return sum / (255 * 255) / Math.max(m.px.size, 1);
}

const results: Record<number, { name: string; cx: number; cy: number; s: number; err: number }> = {};
for (const fi of [2, 3, 4]) {
  const m = flashMask(fi);
  console.log(`f${fi}: flash box (${m.minX},${m.minY})-(${m.maxX},${m.maxY}) ${m.px.size} px`);
  let best: { name: string; cx: number; cy: number; s: number; err: number } | null = null;
  for (const name of ['muzzle01', 'muzzle02', 'muzzle03', 'muzzle04', 'muzzle05']) {
    for (let s = 1.5; s <= 5.51; s += 0.5) {
      const gx = (m.minX + m.maxX) / 2, gy = (m.minY + m.maxY) / 2;
      for (let cy = gy - 12; cy <= gy + 12; cy += 4) {
        for (let cx = gx - 20; cx <= gx + 20; cx += 4) {
          const e = scoreArt(name, fi, cx, cy, s, m);
          if (!best || e < best.err) best = { name, cx, cy, s, err: e };
        }
      }
    }
  }
  // refine
  for (let s = best!.s - 0.4; s <= best!.s + 0.4; s += 0.1) {
    for (let cy = best!.cy - 4; cy <= best!.cy + 4; cy += 1) {
      for (let cx = best!.cx - 5; cx <= best!.cx + 5; cx += 1) {
        const e = scoreArt(best!.name, fi, cx, cy, s, flashMask(fi));
        if (e < best!.err) best = { ...best!, cx, cy, s, err: e };
      }
    }
  }
  results[fi] = best!;
  console.log(`f${fi}: ${best!.name} scale ${best!.s.toFixed(2)} at (${best!.cx},${best!.cy}) err ${best!.err.toFixed(3)}`);
}

// muzzle bone world position under the shoot pose (static across the shot)
const { skeleton } = loadCandidate();
applyPose(skeleton, store.frames[2].pose as PoseVec);
const mb = skeleton.findBone('muzzle')!;
const gb = skeleton.findBone('gun')!;
const mw = { x: mb.appliedPose.worldX, y: mb.appliedPose.worldY };
const gunWorldRot = Math.atan2(gb.appliedPose.c, gb.appliedPose.a);
const toWorld = (px: number, py: number) => [vw.x + px / vw.scale, vw.y + (vw.pixelHeight - py) / vw.scale];

const E = 1e-6;
const flash = {
  keys: [
    { t: 5 / 30 - E, muzzle: results[2].name },
    { t: 7 / 30 - E, muzzle: results[3].name },
    { t: 10 / 30 - E, muzzle: results[4].name },
    { t: 12 / 30 - E, muzzle: null },
  ],
  scale: [
    { t: 5 / 30 - E, sx: +results[2].s.toFixed(2), sy: +results[2].s.toFixed(2), ease: 'stepped' },
    { t: 7 / 30 - E, sx: +results[3].s.toFixed(2), sy: +results[3].s.toFixed(2), ease: 'stepped' },
    { t: 10 / 30 - E, sx: +results[4].s.toFixed(2), sy: +results[4].s.toFixed(2) },
  ],
  pos: [
    { t: 5 / 30 - E, ...off(results[2]), ease: 'stepped' },
    { t: 7 / 30 - E, ...off(results[3]), ease: 'stepped' },
    { t: 10 / 30 - E, ...off(results[4]) },
  ],
};
function off(r: { cx: number; cy: number }): { x: number; y: number } {
  const [wx, wy] = toWorld(r.cx, r.cy);
  // world delta -> the muzzle bone's parent (gun) local frame
  const dx = wx - mw.x, dy = wy - mw.y;
  const c = Math.cos(-gunWorldRot), s = Math.sin(-gunWorldRot);
  return { x: +(dx * c - dy * s).toFixed(1), y: +(dx * s + dy * c).toFixed(1) };
}
writeFileSync(join(RUN, 'fitting/flash.json'), JSON.stringify(flash, null, 1));
console.log('wrote flash.json; muzzle world', mw.x.toFixed(1), mw.y.toFixed(1));
