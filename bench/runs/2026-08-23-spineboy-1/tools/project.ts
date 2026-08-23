/**
 * Project free per-part placements back onto the hierarchy.
 *
 * Each attachment sits on its bone at a **constant** local rotation, so a part's
 * world rotation names its bone's world rotation outright — no search. That
 * turns the free relax from a diagnostic into an initialiser: instead of asking
 * a coordinate descent to find a `walk` pose starting from an `idle` pose, hand
 * it the pose the pixels already put the parts in and let it only tidy up. It is
 * the single change that moved this run's fits (LOOP §8).
 *
 * Bones no part rides — `hip`, `neck`, `muzzle` — take their turn from the bone
 * next to them, because there is nothing in the picture that is only them.
 */
import type { Skeleton, Pose } from './skel.ts';
import type { Placement } from './lib.ts';
import { DEG } from './lib.ts';

const DRIVER = [
  'torso',
  'head',
  'front-upper-arm',
  'front-bracer',
  'front-fist',
  'rear-upper-arm',
  'rear-bracer',
  'gun',
  'front-thigh',
  'front-shin',
  'front-foot',
  'rear-thigh',
  'rear-shin',
  'rear-foot',
];

export function project(s: Skeleton, free: Placement[]): Pose {
  const byPart = new Map(free.map((p) => [p.part, p]));
  const attach = new Map(s.attachments.map((a) => [a.slot, a]));
  const bone = new Map(s.bones.map((b) => [b.name, b]));

  // start from the setup-pose world rotations, then replace the ones a part names
  const world = new Map(s.bones.map((b) => [b.name, b.world]));
  const delta = new Map(s.bones.map((b) => [b.name, 0]));
  for (const name of DRIVER) {
    const p = byPart.get(name);
    const a = attach.get(name);
    const b = bone.get(name);
    if (!p || !a || !b) continue;
    world.set(name, p.rot - a.rotation);
    delta.set(name, p.rot - a.rotation - b.world);
  }
  const carry = (name: string, from: string[]) => {
    const d = from.reduce((s2, n) => s2 + (delta.get(n) ?? 0), 0) / from.length;
    world.set(name, bone.get(name)!.world + d);
  };
  carry('hip', ['torso']);
  carry('neck', ['torso', 'head']);
  carry('muzzle', ['gun']);

  const rot: Record<string, number> = {};
  for (const b of s.bones) {
    rot[b.name] = b.parent ? world.get(b.name)! - world.get(b.parent)! - b.rotation : 0;
  }

  // where the hip lands: read it off the torso, whose joint is the hip's own
  const move: Record<string, [number, number]> = { hip: [0, 0] };
  const tp = byPart.get('torso');
  const ta = attach.get('torso');
  const hip = bone.get('hip')!;
  const root = bone.get('root')!;
  if (tp && ta) {
    const w = world.get('torso')! * DEG;
    const jx = tp.cx - (ta.x * Math.cos(w) - ta.y * Math.sin(w));
    const jy = tp.cy - (ta.x * Math.sin(w) + ta.y * Math.cos(w));
    const r = -root.world * DEG;
    move.hip = [jx * Math.cos(r) - jy * Math.sin(r) - hip.x, jx * Math.sin(r) + jy * Math.cos(r) - hip.y];
  }
  return { rot, move };
}
