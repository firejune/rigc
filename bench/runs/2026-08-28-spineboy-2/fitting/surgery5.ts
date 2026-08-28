/**
 * Attempt-5 surgery: re-seat the shoulder/chest joint (the neck pivot on the
 * torso) at the position triangulated THROUGH THE LYING POSES by chestlock.ts.
 * One movePivot('neck', Δ), setup-render-invariant (compensates the neck
 * attachment and the head bone origin). Dumps the full skeleton as
 * fitting/skeleton-fit.json for genrig to overlay verbatim.
 */
import { RegionAttachment } from '@esotericsoftware/spine-core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCandidate, applyPose } from './pose.ts';
import { RUN } from './lib.ts';

// chestlock.ts solve, 2026-08-28, 17 rows, lying poses included:
const P_MEASURED: [number, number] = [5.0, 89.9]; // neck joint in torso-art coords

const { skeleton } = loadCandidate();
const D = Math.PI / 180;

// current joint in TRUE torso-art coords (art x-axis = att world rotation)
applyPose(skeleton, {});
const neck = skeleton.findBone('neck')!;
const torsoSlot = skeleton.findSlot('torso')!;
const torsoAtt = skeleton.getAttachment(torsoSlot.data.index, 'torso') as RegionAttachment;
const wv = new Array<number>(8).fill(0);
torsoAtt.computeWorldVertices(torsoSlot, torsoAtt.getOffsets(torsoSlot.appliedPose), wv, 0, 2);
const cx = (wv[0] + wv[2] + wv[4] + wv[6]) / 4, cy = (wv[1] + wv[3] + wv[5] + wv[7]) / 4;
const torsoBoneWorld = Math.atan2(torsoSlot.bone.appliedPose.c, torsoSlot.bone.appliedPose.a) / D;
const artWorld = (torsoBoneWorld + torsoAtt.rotation) * D; // torso art x-axis in world
const jx = neck.appliedPose.worldX - cx, jy = neck.appliedPose.worldY - cy;
const pCur: [number, number] = [
  Math.cos(artWorld) * jx + Math.sin(artWorld) * jy,
  -Math.sin(artWorld) * jx + Math.cos(artWorld) * jy,
];
console.log('current p (torso-art):', pCur.map((v) => v.toFixed(2)).join(', '));
const dArt: [number, number] = [P_MEASURED[0] - pCur[0], P_MEASURED[1] - pCur[1]];
console.log('delta (torso-art):    ', dArt.map((v) => v.toFixed(2)).join(', '));

// art -> torso-bone space: bone_pt = attXY + R(att.rotation)·art_pt
const r = torsoAtt.rotation * D;
const dParent: [number, number] = [
  Math.cos(r) * dArt[0] - Math.sin(r) * dArt[1],
  Math.sin(r) * dArt[0] + Math.cos(r) * dArt[1],
];
console.log('movePivot(neck) parent-space Δ:', dParent.map((v) => v.toFixed(2)).join(', '));

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
  const rr = -sp.rotation * D;
  const lx = dx * Math.cos(rr) - dy * Math.sin(rr);
  const ly = dx * Math.sin(rr) + dy * Math.cos(rr);
  for (const att of attachmentsOn(boneName)) { att.x -= lx; att.y -= ly; att.updateSequence(); }
  for (const child of skeleton.bones) {
    if (child.parent?.data.name === boneName) { child.data.setupPose.x -= lx; child.data.setupPose.y -= ly; }
  }
}

const before = { neck: { ...neck.data.setupPose }, head: { ...skeleton.findBone('head')!.data.setupPose } };
movePivot('neck', dParent[0], dParent[1]);
const after = { neck: neck.data.setupPose, head: skeleton.findBone('head')!.data.setupPose };
console.log(`neck bone: (${before.neck.x.toFixed(2)}, ${before.neck.y.toFixed(2)}) -> (${after.neck.x.toFixed(2)}, ${after.neck.y.toFixed(2)})`);
console.log(`head bone: (${before.head.x.toFixed(2)}, ${before.head.y.toFixed(2)}) -> (${after.head.x.toFixed(2)}, ${after.head.y.toFixed(2)})`);

// verify: joint now at P_MEASURED
applyPose(skeleton, {});
torsoAtt.computeWorldVertices(torsoSlot, torsoAtt.getOffsets(torsoSlot.appliedPose), wv, 0, 2);
const cx2 = (wv[0] + wv[2] + wv[4] + wv[6]) / 4, cy2 = (wv[1] + wv[3] + wv[5] + wv[7]) / 4;
const jx2 = neck.appliedPose.worldX - cx2, jy2 = neck.appliedPose.worldY - cy2;
console.log('new p (torso-art):', (Math.cos(artWorld) * jx2 + Math.sin(artWorld) * jy2).toFixed(2), (-Math.sin(artWorld) * jx2 + Math.cos(artWorld) * jy2).toFixed(2));

// dump full skeleton (same shape setupfit2 writes; genrig overlays verbatim)
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
