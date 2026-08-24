/**
 * The feet decide whether a set can take frames.json's own box: every standing
 * shot's lowest drawn row is 336 in the reference and mine sat ~6 px under it,
 * which is a rig constant (ankle pivot and boot offset), not a per-frame pose.
 * So it is fitted the way §8.1 says a setup pose is — alternating the shared
 * numbers against frames drawn from every shot with the per-frame rotations,
 * on a window that only the legs are in, so the legs are what the number is
 * about.
 */
import { Fitter, refFrame, cropPlate } from './fit.ts';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { FIST } from './fitrun.ts';
import type { Pose } from './fit.ts';
import type { Plate } from '../tools/plate.ts';
import { contentBoxOfPlate } from '../src/framing.ts';

const SPREAD: [string, number[]][] = [
  ['idle', [0, 4, 8, 12, 16, 20]], ['walk', [0, 2, 4, 6, 8, 10, 12]], ['run', [0, 3, 5, 7, 8]],
  ['aim', [0]], ['shoot', [0, 3]], ['jump', [0, 15, 16]], ['hit', [4]],
];
const BONES = ['front-shin', 'front-foot', 'rear-shin', 'rear-foot'];
const ATT = ['front-shin', 'front-foot', 'rear-shin', 'rear-foot'];
const ROT = ['front-thigh', 'front-shin', 'front-foot', 'rear-thigh', 'rear-shin', 'rear-foot'];

const f = new Fitter();
const X = 120, Y = 262, W = 150, H = 96;
const view = f.window(X, Y, W, H);
const cases: { anim: string; i: number; pose: Pose; crop: Plate; fist: string }[] = [];
const docs: Record<string, Record<number, Pose>> = {};
for (const [anim, idxs] of SPREAD) {
  docs[anim] = JSON.parse(readFileSync(`work/placements-${anim}.json`, 'utf8'))[anim];
  for (const i of idxs) cases.push({ anim, i, pose: docs[anim][i], crop: cropPlate(refFrame(anim, i), X, Y, W, H), fist: FIST[anim] ?? 'front-fist-open' });
}
const boneXY: Record<string, [number, number]> = {};
for (const b of BONES) { const bb = f.rig.bones.get(b)!; boneXY[b] = [bb.data.setupPose.x, bb.data.setupPose.y]; }
const attXY: Record<string, [number, number]> = {};
const attS: Record<string, [number, number]> = {};
for (const n of ATT) { const a = f.rig.skeleton.getAttachment(n, n) as unknown as { x: number; y: number; scaleX: number; scaleY: number }; attXY[n] = [a.x, a.y]; attS[n] = [a.scaleX, a.scaleY]; }
function push(): void {
  for (const b of BONES) { const bb = f.rig.bones.get(b)!; bb.data.setupPose.x = boneXY[b][0]; bb.data.setupPose.y = boneXY[b][1]; }
  for (const n of ATT) f.rig.setAttachmentTransform(n, n, { x: attXY[n][0], y: attXY[n][1], scaleX: attS[n][0], scaleY: attS[n][1] });
}
const BG: [number, number, number, number] = [232, 232, 232, 255];
/**
 * The window MAE plus the silhouette's own bottom edge. The brief measures the
 * standing feet onto world y = 0 (lowest drawn row 336 on every stance frame),
 * and that edge is what decides whether a set can be measured in frames.json's
 * own box at all — worth 15-25 MAE per the guide, and invisible to a pixel mean
 * that has the whole leg to average over.
 */
const refBottom = cases.map((c) => contentBoxOfPlate(c.crop, BG, 0)?.bottom ?? 0);
function total(): number {
  push();
  let acc = 0;
  for (let k = 0; k < cases.length; k++) {
    const c = cases[k];
    f.rig.setAttachment('front-fist', c.fist);
    f.rig.apply(c.pose);
    const mine = f.rig.render(view);
    const box = contentBoxOfPlate(mine, BG, 0);
    const edge = box ? Math.abs(box.bottom - refBottom[k]) : 20;
    acc += f.cost(c.pose, view, c.crop, 1) + EDGE * edge;
  }
  return acc / cases.length;
}
const EDGE = Number(process.env.EDGE ?? 1.2);
let best = total();
console.log('start', best.toFixed(4));
let bestState = snapshot(); let bestSeen = best;
function snapshot() { return JSON.parse(JSON.stringify({ boneXY, attXY, attS, poses: cases.map((c) => c.pose) })); }
for (let round = 0; round < 4; round++) {
  for (const step of [6, 3, 1.5, 0.75]) {
    for (const b of BONES) for (const ax of [0, 1]) {
      const c0 = boneXY[b][ax]; let bv = c0;
      for (const v of [c0 - step, c0 + step]) { boneXY[b][ax] = v; const q = total(); if (q < best - 1e-6) { best = q; bv = v; } }
      boneXY[b][ax] = bv;
    }
    for (const n of ATT) for (const ax of [0, 1]) {
      const c0 = attXY[n][ax]; let bv = c0;
      for (const v of [c0 - step, c0 + step]) { attXY[n][ax] = v; const q = total(); if (q < best - 1e-6) { best = q; bv = v; } }
      attXY[n][ax] = bv;
    }
    if (process.env.SCALE) for (const n of ['front-foot', 'rear-foot']) for (const ax of [0, 1]) {
      const c0 = attS[n][ax]; let bv = c0;
      for (const v of [c0 - step / 40, c0 + step / 40]) { attS[n][ax] = v; const q = total(); if (q < best - 1e-6) { best = q; bv = v; } }
      attS[n][ax] = bv;
    }
  }
  // re-fit the per-frame leg rotations under the new constants
  push();
  for (const c of cases) {
    f.rig.setAttachment('front-fist', c.fist);
    let cb = f.cost(c.pose, view, c.crop, 1);
    for (const st of [6, 3, 1.5, 0.75, 0.35]) for (const bone of ROT) {
      const s = (c.pose[bone] ??= {}); const cur = s.rotation ?? 0; let bv = cur;
      for (const v of [cur - st, cur + st]) { s.rotation = v; const q = f.cost(c.pose, view, c.crop, 1); if (q < cb - 1e-7) { cb = q; bv = v; } }
      s.rotation = bv;
    }
  }
  best = total();
  if (best < bestSeen) { bestSeen = best; bestState = snapshot(); }
  console.log(`round ${round}`.padEnd(10), best.toFixed(4));
}
// keep the best state seen, not the last one
for (const b of BONES) boneXY[b] = bestState.boneXY[b];
for (const n of ATT) { attXY[n] = bestState.attXY[n]; attS[n] = bestState.attS[n]; }
cases.forEach((c, k) => { for (const key of Object.keys(bestState.poses[k])) c.pose[key] = bestState.poses[k][key]; });
best = bestSeen;
const prev = existsSync('work/setup-overrides.json') ? JSON.parse(readFileSync('work/setup-overrides.json', 'utf8')) : {};
const out = { bones: { ...(prev.bones ?? {}) }, attach: { ...(prev.attach ?? {}) } };
for (const b of BONES) out.bones[b] = { x: boneXY[b][0], y: boneXY[b][1] };
for (const n of ATT) out.attach[n] = { x: attXY[n][0], y: attXY[n][1], ...(process.env.SCALE && (n === 'front-foot' || n === 'rear-foot') ? { scaleX: attS[n][0], scaleY: attS[n][1] } : {}) };
if (process.env.SCALE) console.log('foot scale', JSON.stringify(attS['front-foot']), JSON.stringify(attS['rear-foot']));
writeFileSync('work/setup-overrides.json', JSON.stringify(out, null, 1));
for (const anim of Object.keys(docs)) writeFileSync(`work/placements-${anim}.json`, JSON.stringify({ [anim]: docs[anim] }, null, 1));
console.log('final', best.toFixed(4));
