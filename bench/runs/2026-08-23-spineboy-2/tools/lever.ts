/**
 * §10.3: "a key tolerance on a rotation is not a number of degrees". One
 * tolerance is declared in **pixels at the end of what the bone swings**, and
 * converted per bone by that bone's own lever arm — measured here off the setup
 * pose, as the furthest drawn corner of anything in the bone's subtree.
 */
import { join } from 'node:path';
import { Physics, Skeleton } from '@esotericsoftware/spine-core';
import { piecesOf } from '../../../../src/render.ts';
import { loadCandidate } from './harness.ts';
import { SCALE } from './geom.ts';
import { BONES, PARTS } from './rigdata.ts';

export function leverArms(dir: string): Record<string, number> {
  const posable = loadCandidate(dir);
  const sk = new Skeleton(posable.data);
  sk.setupPose();
  sk.update(0);
  sk.updateWorldTransform(Physics.update);
  const corners = new Map<string, number[]>();
  for (const piece of piecesOf(sk)) corners.set(piece.slot, [...piece.world]);

  const childrenOf = new Map<string, string[]>();
  for (const b of BONES) if (b.parent) (childrenOf.get(b.parent) ?? childrenOf.set(b.parent, []).get(b.parent)!).push(b.name);
  const subtree = (name: string): string[] => [name, ...(childrenOf.get(name) ?? []).flatMap(subtree)];

  const out: Record<string, number> = {};
  for (const b of BONES) {
    const bone = sk.findBone(b.name)!;
    const bones = new Set(subtree(b.name));
    let far = 0;
    for (const p of PARTS) {
      if (!bones.has(p.bone)) continue;
      const v = corners.get(p.slot);
      if (!v) continue;
      for (let i = 0; i + 1 < v.length; i += 2) {
        const dx = v[i] - bone.pose.worldX;
        const dy = v[i + 1] - bone.pose.worldY;
        const d = Math.hypot(dx, dy);
        if (d > far) far = d;
      }
    }
    // frame pixels moved by one degree at that radius
    out[b.name] = (far * SCALE * Math.PI) / 180;
  }
  return out;
}

if (import.meta.main) {
  const arms = leverArms(join(import.meta.dir, '..', 'ess', 'spine'));
  for (const [k, v] of Object.entries(arms)) console.log(`${k.padEnd(20)} ${v.toFixed(4)} px/deg`);
  console.log(`hip translate: ${SCALE.toFixed(4)} px/unit`);
}
