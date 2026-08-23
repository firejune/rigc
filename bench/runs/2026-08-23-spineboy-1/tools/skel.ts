/**
 * The rig as a hierarchy, and forward kinematics for it.
 *
 * This is the same model a Spine region attachment on a bone resolves to — a
 * bone's world transform composed with a constant local offset and rotation —
 * so a pose fitted here is a pose the emitted skeleton reproduces without a
 * second opinion about where anything is. Bones are limb-aligned: a bone's own
 * +X points at its child joint and its `length` is the distance, which is what
 * the editor's Create tool makes and what gives `length` a meaning.
 *
 * ⚠️ spine-core 4.3 keeps the local transform on `bone.pose`, so a rotate key's
 * value is a **delta from the setup local rotation**. Everything below is in
 * those terms: `params.rot[bone]` is exactly the number that goes into the
 * motion spec.
 */
import type { Placement } from './lib.ts';
import { DEG } from './lib.ts';

export interface BoneDef {
  name: string;
  parent: string | null;
  /** setup-pose joint, world */
  joint: [number, number];
  /** setup-pose world rotation, degrees CCW */
  world: number;
  length: number;
  /** local x, y in the parent's setup frame */
  x: number;
  y: number;
  /** local rotation in the parent's setup frame */
  rotation: number;
}

export interface AttachDef {
  slot: string;
  image: string;
  bone: string;
  /** offset from the bone's joint, in the bone's own setup frame */
  x: number;
  y: number;
  /** rotation relative to the bone's setup world rotation */
  rotation: number;
}

export interface Skeleton {
  bones: BoneDef[];
  attachments: AttachDef[];
  order: string[];
}

const rot = (x: number, y: number, deg: number): [number, number] => {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [x * c - y * s, x * s + y * c];
};

export interface TreeSpec {
  bones: { name: string; parent: string | null; joint: [number, number]; aim?: [number, number] | number }[];
  /** slot → bone */
  binding: Record<string, string>;
}

export function build(tree: TreeSpec, placements: Placement[], drawOrder: string[]): Skeleton {
  const byName = new Map(tree.bones.map((b) => [b.name, b]));
  const children = new Map<string, string[]>();
  for (const b of tree.bones) if (b.parent) (children.get(b.parent) ?? children.set(b.parent, []).get(b.parent)!).push(b.name);

  const world = new Map<string, number>();
  const bones: BoneDef[] = [];
  for (const b of tree.bones) {
    let aimAt: [number, number] | null = null;
    let fixed: number | null = null;
    if (typeof b.aim === 'number') fixed = b.aim;
    else if (Array.isArray(b.aim)) aimAt = b.aim;
    else {
      const kids = children.get(b.name) ?? [];
      if (kids.length === 1) aimAt = byName.get(kids[0])!.joint;
      else fixed = 90;
    }
    const dx = aimAt ? aimAt[0] - b.joint[0] : 0;
    const dy = aimAt ? aimAt[1] - b.joint[1] : 0;
    const w = fixed !== null ? fixed : Math.atan2(dy, dx) / DEG;
    const length = aimAt ? Math.hypot(dx, dy) : 0;
    world.set(b.name, w);
    const pw = b.parent ? world.get(b.parent)! : 0;
    const pj = b.parent ? byName.get(b.parent)!.joint : ([0, 0] as [number, number]);
    const [lx, ly] = rot(b.joint[0] - pj[0], b.joint[1] - pj[1], -pw);
    bones.push({ name: b.name, parent: b.parent, joint: b.joint, world: w, length, x: lx, y: ly, rotation: w - pw });
  }

  const attachments: AttachDef[] = [];
  for (const p of placements) {
    const bone = tree.binding[p.part];
    if (!bone) throw new Error(`no bone bound for slot "${p.part}"`);
    const b = byName.get(bone)!;
    const w = world.get(bone)!;
    const [ox, oy] = rot(p.cx - b.joint[0], p.cy - b.joint[1], -w);
    attachments.push({ slot: p.part, image: p.image ?? p.part, bone, x: ox, y: oy, rotation: p.rot - w });
  }
  return { bones, attachments, order: drawOrder };
}

export interface Pose {
  /** local rotation delta per bone, degrees */
  rot: Record<string, number>;
  /** translate delta on one bone, in its parent's frame */
  move: Record<string, [number, number]>;
  /** slot → image override, for attachment timelines */
  images?: Record<string, string | null>;
}

export function emptyPose(s: Skeleton): Pose {
  const rotRec: Record<string, number> = {};
  for (const b of s.bones) rotRec[b.name] = 0;
  return { rot: rotRec, move: {} };
}

/** Forward kinematics → one placement per visible slot, in draw order. */
export function pose(s: Skeleton, p: Pose): Placement[] {
  const wr = new Map<string, number>();
  const wp = new Map<string, [number, number]>();
  for (const b of s.bones) {
    const pr = b.parent ? wr.get(b.parent)! : 0;
    const pp = b.parent ? wp.get(b.parent)! : ([0, 0] as [number, number]);
    const mv = p.move[b.name];
    const lx = b.x + (mv ? mv[0] : 0);
    const ly = b.y + (mv ? mv[1] : 0);
    const [dx, dy] = rot(lx, ly, pr);
    wp.set(b.name, [pp[0] + dx, pp[1] + dy]);
    wr.set(b.name, pr + b.rotation + (p.rot[b.name] ?? 0));
  }
  const out: Placement[] = [];
  for (const name of s.order) {
    const a = s.attachments.find((q) => q.slot === name);
    if (!a) continue;
    const image = p.images && name in p.images ? p.images[name] : a.image;
    if (image === null) continue;
    const w = wr.get(a.bone)!;
    const [bx, by] = wp.get(a.bone)!;
    const [ox, oy] = rot(a.x, a.y, w);
    out.push({ part: a.slot, image: image ?? a.image, cx: bx + ox, cy: by + oy, rot: w + a.rotation });
  }
  return out;
}

/** Where every bone's joint lands under a pose — for measuring, not drawing. */
export function joints(s: Skeleton, p: Pose): Map<string, [number, number]> {
  const wr = new Map<string, number>();
  const wp = new Map<string, [number, number]>();
  for (const b of s.bones) {
    const pr = b.parent ? wr.get(b.parent)! : 0;
    const pp = b.parent ? wp.get(b.parent)! : ([0, 0] as [number, number]);
    const mv = p.move[b.name];
    const [dx, dy] = rot(b.x + (mv ? mv[0] : 0), b.y + (mv ? mv[1] : 0), pr);
    wp.set(b.name, [pp[0] + dx, pp[1] + dy]);
    wr.set(b.name, pr + b.rotation + (p.rot[b.name] ?? 0));
  }
  return wp;
}
