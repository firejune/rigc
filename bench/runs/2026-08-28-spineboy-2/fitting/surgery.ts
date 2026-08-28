/**
 * Geometry surgery: lengthen the front-arm segments to the art's own proportions
 * (idle's folded arm had been misread as short bones — death's wave and walk's
 * fist pendulum both need ~200 units of reach, the short chain had ~98).
 * Pivot moves are compensated (attachments + children) so the setup render is
 * unchanged; only how the chain unfolds changes. Dumps skeleton-fit.json.
 */
import { RegionAttachment } from '@esotericsoftware/spine-core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCandidate } from './pose.ts';
import { RUN } from './lib.ts';

const { skeleton } = loadCandidate();
const D = Math.PI / 180;

function attachmentsOn(boneName: string): RegionAttachment[] {
  const out: RegionAttachment[] = [];
  const skin = skeleton.data.defaultSkin!;
  for (const slot of skeleton.slots) {
    if (slot.bone.data.name !== boneName) continue;
    const entries = skin.attachments[slot.data.index];
    if (!entries) continue;
    for (const entry of Object.values(entries)) if (entry instanceof RegionAttachment) out.push(entry);
  }
  return out;
}

function movePivot(boneName: string, dx: number, dy: number): void {
  const bone = skeleton.findBone(boneName)!;
  const sp = bone.data.setupPose;
  sp.x += dx; sp.y += dy;
  const r = -sp.rotation * D;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  for (const att of attachmentsOn(boneName)) { att.x -= lx; att.y -= ly; att.updateSequence(); }
  for (const child of skeleton.bones) {
    if (child.parent?.data.name === boneName) { child.data.setupPose.x -= lx; child.data.setupPose.y -= ly; }
  }
}

// current front chain: bracer at ~(L1, 0) in upper-arm space; fist at ~(L2, 0) in bracer space
const bracer = skeleton.findBone('front-bracer')!;
const fist = skeleton.findBone('front-fist')!;
console.log('before: bracer local', bracer.data.setupPose.x.toFixed(1), bracer.data.setupPose.y.toFixed(1),
  'fist local', fist.data.setupPose.x.toFixed(1), fist.data.setupPose.y.toFixed(1));

// target lengths from the art: upper 75, bracer 58
const L1 = Math.hypot(bracer.data.setupPose.x, bracer.data.setupPose.y);
const L2 = Math.hypot(fist.data.setupPose.x, fist.data.setupPose.y);
const s1 = 75 / L1, s2 = 58 / L2;
movePivot('front-bracer', bracer.data.setupPose.x * (s1 - 1), bracer.data.setupPose.y * (s1 - 1));
movePivot('front-fist', fist.data.setupPose.x * (s2 - 1), fist.data.setupPose.y * (s2 - 1));
console.log('after: bracer local', bracer.data.setupPose.x.toFixed(1), bracer.data.setupPose.y.toFixed(1),
  'fist local', fist.data.setupPose.x.toFixed(1), fist.data.setupPose.y.toFixed(1));

// dump (same shape setupfit2 writes)
const bonesOut: Record<string, { x: number; y: number; rotation: number }> = {};
for (const b of skeleton.bones) {
  bonesOut[b.data.name] = {
    x: +b.data.setupPose.x.toFixed(2), y: +b.data.setupPose.y.toFixed(2), rotation: +b.data.setupPose.rotation.toFixed(2),
  };
}
const attsOut: Record<string, Record<string, { x: number; y: number; rotation: number; scaleX: number; scaleY: number }>> = {};
const skin = skeleton.data.defaultSkin!;
for (const slot of skeleton.slots) {
  const entries = skin.attachments[slot.data.index];
  if (!entries) continue;
  for (const [name, att] of Object.entries(entries)) {
    if (!(att instanceof RegionAttachment)) continue;
    attsOut[slot.data.name] = attsOut[slot.data.name] ?? {};
    attsOut[slot.data.name][name] = {
      x: +att.x.toFixed(2), y: +att.y.toFixed(2), rotation: +att.rotation.toFixed(2),
      scaleX: +att.scaleX.toFixed(4), scaleY: +att.scaleY.toFixed(4),
    };
  }
}
writeFileSync(join(RUN, 'fitting/skeleton-fit.json'), JSON.stringify({ bones: bonesOut, attachments: attsOut }, null, 1));
console.log('wrote skeleton-fit.json');
