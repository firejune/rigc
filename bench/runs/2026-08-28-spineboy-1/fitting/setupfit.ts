/**
 * Stage A: refine attachment offsets (x, y, rotation [, scale for eye/mouth])
 * against idle/f0000, holding the pose at setup. Coordinate descent, full-range
 * scans per knob, coarse-to-fine. Writes fitted values to fitting/setup-fit.json.
 */
import { RegionAttachment, Skeleton } from '@esotericsoftware/spine-core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCandidate, renderPose, objective } from './pose.ts';
import { refFrames, RUN, pyramid, pyrSize } from './lib.ts';
import { Plate } from '../../../../tools/plate.ts';

const { posable, skeleton } = loadCandidate();
const idle0 = refFrames('idle')[0];

// pyramid reference
const refs = new Map<number, Float32Array>();
for (const k of [3, 1]) refs.set(k, pyramid(idle0, k));

function score(k: number): number {
  const cand = renderPose(posable, skeleton, {}, k);
  if (k === 1) return objective(cand, idle0).err;
  // coarse: compare candidate (rendered at 1/k) against box-averaged reference
  const r = refs.get(k)!;
  const { w, h } = pyrSize(idle0, k);
  let sum = 0;
  for (let i = 0; i < Math.min(w * h, cand.width * cand.height); i++) {
    const cy = Math.floor(i / w), cx = i % w;
    const o = (cy * cand.width + cx) * 4;
    const dr = cand.data[o] - r[i * 3], dg = cand.data[o + 1] - r[i * 3 + 1], db = cand.data[o + 2] - r[i * 3 + 2];
    sum += dr * dr + dg * dg + db * db;
  }
  return sum;
}

interface Knob { slot: string; att: string; ch: 'x' | 'y' | 'rotation' | 'scale'; lo: number; hi: number; step: number }

function attachmentOf(slot: string, name: string): RegionAttachment {
  const s = skeleton.findSlot(slot)!;
  const a = skeleton.getAttachment(s.data.index, name);
  if (!(a instanceof RegionAttachment)) throw new Error(`${slot}/${name} not a region`);
  return a;
}

function get(a: RegionAttachment, ch: Knob['ch']): number {
  return ch === 'scale' ? a.scaleX : (a as unknown as Record<string, number>)[ch];
}
function set(a: RegionAttachment, ch: Knob['ch'], v: number): void {
  if (ch === 'scale') { a.scaleX = v; a.scaleY = v; }
  else (a as unknown as Record<string, number>)[ch] = v;
  a.updateSequence();
}

// visible-in-idle parts only; hidden parts (rear arm, thighs under jacket, neck, eye) get
// multi-shot treatment later.
const fitParts: { slot: string; att: string; scale?: boolean }[] = [
  { slot: 'torso', att: 'torso' },
  { slot: 'head', att: 'head' },
  { slot: 'goggles', att: 'goggles' },
  { slot: 'mouth', att: 'mouth-smile', scale: true },
  { slot: 'gun', att: 'gun' },
  { slot: 'front-shin', att: 'front-shin' },
  { slot: 'rear-shin', att: 'rear-shin' },
  { slot: 'front-foot', att: 'front-foot' },
  { slot: 'rear-foot', att: 'rear-foot' },
  { slot: 'front-thigh', att: 'front-thigh' },
  { slot: 'rear-thigh', att: 'rear-thigh' },
  { slot: 'front-upper-arm', att: 'front-upper-arm' },
  { slot: 'front-bracer', att: 'front-bracer' },
  { slot: 'front-fist', att: 'front-fist-open' },
  { slot: 'neck', att: 'neck' },
];

let best = score(1);
console.log('start objective', best.toFixed(4));

for (let round = 0; round < 3; round++) {
  for (const p of fitParts) {
    const a = attachmentOf(p.slot, p.att);
    const channels: Knob['ch'][] = p.scale ? ['x', 'y', 'rotation', 'scale'] : ['x', 'y', 'rotation'];
    for (const ch of channels) {
      const cur = get(a, ch);
      const range = ch === 'rotation' ? 30 : ch === 'scale' ? 0.5 : 40;
      const steps = ch === 'scale' ? 0.05 : range / 10;
      let bv = cur, bs = best;
      for (let v = cur - range; v <= cur + range + 1e-9; v += steps) {
        set(a, ch, v);
        const s = score(1);
        if (s < bs) { bs = s; bv = v; }
      }
      // refine
      const fine = ch === 'scale' ? 0.01 : ch === 'rotation' ? 0.5 : 1;
      for (let v = bv - steps; v <= bv + steps + 1e-9; v += fine) {
        set(a, ch, v);
        const s = score(1);
        if (s < bs) { bs = s; bv = v; }
      }
      set(a, ch, bv);
      best = bs;
    }
  }
  console.log(`round ${round}: objective ${best.toFixed(4)}`);
}

// dump fitted attachment locals
const out: Record<string, Record<string, { x: number; y: number; rotation: number; scaleX?: number }>> = {};
for (const p of fitParts) {
  const a = attachmentOf(p.slot, p.att);
  out[p.slot] = out[p.slot] ?? {};
  out[p.slot][p.att] = { x: +a.x.toFixed(2), y: +a.y.toFixed(2), rotation: +a.rotation.toFixed(2) };
  if (p.scale) out[p.slot][p.att].scaleX = +a.scaleX.toFixed(3);
}
writeFileSync(join(RUN, 'fitting/setup-fit.json'), JSON.stringify(out, null, 2));
console.log('final', best.toFixed(4));
