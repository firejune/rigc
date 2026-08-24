/**
 * The global setup refit (§8.1): bone origins and attachment offsets are ONE
 * set of numbers shared by every shot, so they are fitted against frames drawn
 * from every shot at once, with the per-frame poses held fixed. A single frame
 * cannot identify them — that frame's own rotations absorb whatever is wrong.
 */
import { Fitter, refFrame, cropPlate } from './fit.ts';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { Pose } from './fit.ts';
import type { Plate } from '../tools/plate.ts';
import { FIST } from './fitrun.ts';

const SPREAD: [string, number[]][] = [
  ['idle', [0, 7, 14]], ['walk', [0, 3, 6, 9]], ['run', [0, 2, 4, 6]],
  ['jump', [0, 5, 10, 16]], ['shoot', [0, 3]], ['hit', [0, 2, 4]],
  ['death', [0, 5, 20, 40, 55]], ['aim', [0]],
];
const BONES = ['neck', 'head', 'front-upper-arm', 'front-bracer', 'front-fist', 'rear-upper-arm', 'rear-bracer', 'gun',
  'front-thigh', 'front-shin', 'front-foot', 'rear-thigh', 'rear-shin', 'rear-foot'];
const ATT: [string, string][] = [
  ['torso', 'torso'], ['neck', 'neck'], ['head', 'head'], ['goggles', 'goggles'], ['mouth', 'mouth-grind'], ['eye', 'eye-indifferent'],
  ['front-upper-arm', 'front-upper-arm'], ['front-bracer', 'front-bracer'],
  ['front-fist', 'front-fist-closed'], ['front-fist', 'front-fist-open'],
  ['rear-upper-arm', 'rear-upper-arm'], ['rear-bracer', 'rear-bracer'], ['gun', 'gun'],
  ['front-thigh', 'front-thigh'], ['front-shin', 'front-shin'], ['front-foot', 'front-foot'],
  ['rear-thigh', 'rear-thigh'], ['rear-shin', 'rear-shin'], ['rear-foot', 'rear-foot'],
];

const f = new Fitter();
const X = 20, Y = 95, W = 350, H = 265;
const view = f.window(X, Y, W, H);
const cases: { anim: string; pose: Pose; crop: Plate; fist: string }[] = [];
for (const [anim, idxs] of SPREAD) {
  const pl = JSON.parse(readFileSync(`work/placements-${anim}.json`, 'utf8'))[anim];
  for (const i of idxs) cases.push({ anim, pose: pl[i], crop: cropPlate(refFrame(anim, i), X, Y, W, H), fist: FIST[anim] ?? 'front-fist-open' });
}
// current values
const boneXY: Record<string, [number, number]> = {};
for (const b of BONES) { const bb = f.rig.bones.get(b)!; boneXY[b] = [bb.data.setupPose.x, bb.data.setupPose.y]; }
const attXY: Record<string, [number, number]> = {};
for (const [slot, name] of ATT) {
  const a = f.rig.skeleton.getAttachment(slot, name) as unknown as { x: number; y: number };
  attXY[`${slot}|${name}`] = [a.x, a.y];
}
function push(): void {
  for (const b of BONES) { const bb = f.rig.bones.get(b)!; bb.data.setupPose.x = boneXY[b][0]; bb.data.setupPose.y = boneXY[b][1]; }
  for (const [slot, name] of ATT) {
    const k = `${slot}|${name}`;
    f.rig.setAttachmentTransform(slot, name, { x: attXY[k][0], y: attXY[k][1] });
  }
}
function total(block = 1): number {
  push();
  let acc = 0;
  for (const c of cases) { f.rig.setAttachment('front-fist', c.fist); acc += f.cost(c.pose, view, c.crop, block); }
  return acc / cases.length;
}
let best = total();
console.log('start', best.toFixed(4));
for (const step of [12, 8, 5, 3, 2, 1, 0.5]) {
  for (const b of BONES) for (const ax of [0, 1]) {
    const c0 = boneXY[b][ax]; let bv = c0;
    for (const v of [c0 - step, c0 + step]) { boneXY[b][ax] = v; const q = total(); if (q < best - 1e-6) { best = q; bv = v; } }
    boneXY[b][ax] = bv;
  }
  for (const key of Object.keys(attXY)) for (const ax of [0, 1]) {
    const c0 = attXY[key][ax]; let bv = c0;
    for (const v of [c0 - step, c0 + step]) { attXY[key][ax] = v; const q = total(); if (q < best - 1e-6) { best = q; bv = v; } }
    attXY[key][ax] = bv;
  }
  console.log(`step ${step}`.padEnd(10), best.toFixed(4));
}
const prev = existsSync('work/setup-overrides.json') ? JSON.parse(readFileSync('work/setup-overrides.json', 'utf8')) : {};
const out = { bones: { ...(prev.bones ?? {}) }, attach: { ...(prev.attach ?? {}) } };
for (const b of BONES) out.bones[b] = { x: boneXY[b][0], y: boneXY[b][1] };
for (const key of Object.keys(attXY)) out.attach[key.split('|')[1]] = { x: attXY[key][0], y: attXY[key][1] };
writeFileSync('work/setup-overrides.json', JSON.stringify(out, null, 1));
console.log('final', best.toFixed(4));
