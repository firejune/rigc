/**
 * The figure's bone table and its attachment table, plus the forward kinematics
 * the scatter pose needs.
 *
 * Why FK lives here: the `assemble` animation states each part's SCATTERED
 * position, and a rigc track's `translate` value is local to the bone's parent
 * (AUTHORING §4.4) — so "put the head over there on the left" is only writable
 * once you know where its parent ended up. Solving that by hand is how a rig
 * ends up mirrored in one joint (MOTION.md §2.2's warning about the y flip
 * applying once). Solving it root-to-leaf, in code, cannot drift.
 */
import { HIP_X, HIP_Y } from '../art/layout';

export interface BoneDef {
  name: string;
  parent?: string;
  /** Local offset in the parent's axes, y up. */
  x?: number;
  y?: number;
  /** Local rotation in degrees, counter-clockwise. */
  rotation?: number;
}

/**
 * The bone table. Depth is deliberate rather than decorative: `hip → torso →
 * chest → neck → head` is what lets the breathing idle offset the head's timing
 * against the chest's (MOTION.md §3.7), and `arm_f → hand_f` is what gives the
 * wave a wrist to lag behind the elbow.
 */
export const BONES: BoneDef[] = [
  { name: 'root' },
  { name: 'hip', parent: 'root', x: HIP_X, y: HIP_Y },
  { name: 'leg_l', parent: 'hip', x: -40, y: 4, rotation: 3 },
  { name: 'leg_r', parent: 'hip', x: 40, y: 4, rotation: -3 },
  { name: 'torso', parent: 'hip', x: 0, y: 0 },
  { name: 'chest', parent: 'torso', x: 0, y: 112 },
  { name: 'neck', parent: 'chest', x: 0, y: 76 },
  { name: 'head', parent: 'neck', x: 0, y: 0 },
  // The eyes get their own bone so the face can arrive as its own loose plate —
  // the last thing to land in `assemble`, which is what the blink then opens.
  { name: 'face', parent: 'head', x: 0, y: 112 },
  { name: 'ear_l', parent: 'head', x: -62, y: 188, rotation: 13 },
  { name: 'ear_r', parent: 'head', x: 62, y: 188, rotation: -13 },
  { name: 'knot', parent: 'neck', x: 0, y: -22 },
  { name: 'tail', parent: 'knot', x: -56, y: -20, rotation: -10 },
  { name: 'arm_b', parent: 'chest', x: -88, y: 48, rotation: 7 },
  { name: 'arm_f', parent: 'chest', x: 88, y: 48, rotation: -9 },
  { name: 'hand_f', parent: 'arm_f', x: 0, y: -106, rotation: -4 },
];

export interface AttachDef {
  /** Slot name; the slots array IS the draw order (AUTHORING R4). */
  slot: string;
  bone: string;
  image: string;
  /** Offset from the bone to the image's centre, in the bone's local axes. */
  x?: number;
  y?: number;
  /** Extra attachment names in the same slot, for an attachment timeline. */
  also?: { name: string; image: string; x?: number; y?: number }[];
}

/** Back to front. `plate` is the stage: it pins rigc's framing box. */
export const SLOTS: AttachDef[] = [
  { slot: 'plate', bone: 'root', image: 'plate.png', x: 640, y: 432 },
  { slot: 'leg_l', bone: 'leg_l', image: 'leg_l.png', y: -62 },
  { slot: 'arm_b', bone: 'arm_b', image: 'arm_b.png', y: -108 },
  { slot: 'leg_r', bone: 'leg_r', image: 'leg_r.png', y: -62 },
  { slot: 'torso', bone: 'torso', image: 'torso.png', y: 92 },
  { slot: 'scarf_tail', bone: 'tail', image: 'scarf_tail.png', x: -100, y: -46 },
  { slot: 'ear_l', bone: 'ear_l', image: 'ear_l.png', y: 51 },
  { slot: 'ear_r', bone: 'ear_r', image: 'ear_r.png', y: 51 },
  { slot: 'head', bone: 'head', image: 'head.png', y: 104 },
  // ⭐ The near arm goes in FRONT of the head but BEHIND the collar. That is the
  // only order in which its shoulder reads as a shoulder: drawn over the collar
  // it is a capsule stuck to a torso, and drawn under the head it disappears
  // when the wave raises it. R4 — this array is the only place to say it.
  { slot: 'arm_f', bone: 'arm_f', image: 'arm_f.png', y: -62 },
  { slot: 'hand_f', bone: 'hand_f', image: 'hand_f.png', y: -56 },
  { slot: 'scarf_knot', bone: 'knot', image: 'scarf_knot.png' },
  {
    slot: 'eyes',
    bone: 'face',
    image: 'eyes.png',
    also: [{ name: 'eyes_shut', image: 'eyes_shut.png' }],
  },
];

// ---------------------------------------------------------------------------
// forward kinematics
// ---------------------------------------------------------------------------

/** A bone's world placement: position and rotation, Spine's y-up frame. */
export interface Placement {
  x: number;
  y: number;
  rotation: number;
}

/** Per-bone deltas against the setup pose: what a motion track carries. */
export interface Delta {
  tx?: number;
  ty?: number;
  rot?: number;
}

const byName = new Map(BONES.map((b) => [b.name, b]));

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Rotate `(x, y)` by `deg` counter-clockwise. */
export function rot(x: number, y: number, deg: number): [number, number] {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return [x * c - y * s, x * s + y * c];
}

/**
 * Every bone's world placement, given per-bone deltas against setup.
 *
 * Walks the table in declaration order, which AUTHORING §3.2 guarantees is
 * parent-before-child, so one pass suffices.
 */
export function solve(deltas: Record<string, Delta> = {}): Record<string, Placement> {
  const world: Record<string, Placement> = {};
  for (const bone of BONES) {
    const d = deltas[bone.name] ?? {};
    const lx = (bone.x ?? 0) + (d.tx ?? 0);
    const ly = (bone.y ?? 0) + (d.ty ?? 0);
    const lr = (bone.rotation ?? 0) + (d.rot ?? 0);
    if (bone.parent === undefined) {
      world[bone.name] = { x: lx, y: ly, rotation: lr };
      continue;
    }
    const p = world[bone.parent];
    if (p === undefined) throw new Error(`bone "${bone.name}" names an undeclared parent`);
    const [dx, dy] = rot(lx, ly, p.rotation);
    world[bone.name] = { x: p.x + dx, y: p.y + dy, rotation: p.rotation + lr };
  }
  return world;
}

/**
 * The delta that puts `bone` at the world placement `want`, given the world
 * placement its parent already has.
 *
 * This is the inverse of one step of `solve`, and it is the whole reason the
 * scatter pose can be authored in stage coordinates: state where a part should
 * lie on the canvas, get back the `translate` and `rotate` values a track needs.
 */
export function deltaFor(name: string, want: Placement, parentWorld: Placement): Delta {
  const bone = byName.get(name);
  if (bone === undefined) throw new Error(`no bone "${name}"`);
  const [lx, ly] = rot(want.x - parentWorld.x, want.y - parentWorld.y, -parentWorld.rotation);
  return {
    tx: lx - (bone.x ?? 0),
    ty: ly - (bone.y ?? 0),
    rot: want.rotation - parentWorld.rotation - (bone.rotation ?? 0),
  };
}

/** The bone a slot's attachment rides, and the offset it rides at. */
export function slotOf(slot: string): AttachDef {
  const found = SLOTS.find((s) => s.slot === slot);
  if (found === undefined) throw new Error(`no slot "${slot}"`);
  return found;
}
