/**
 * Archetype tables — the fixed part of a rig, per plan 04 section 3
 * ("아키타입 v1을 컴파일러의 고정 테이블로").
 *
 * v0 ships one archetype: `face_overlay_v1`, the overlay formation that plan 05
 * section 2-2 adopted. Its shape in one line: an untouched base plate with
 * per-state overlay parts pinned on top by manifest offsets, nothing moving,
 * meshes zero.
 *
 * Everything geometric comes from the cut manifest and everything temporal from
 * the motion spec; what lives here is only what is true of *every* cut of this
 * archetype — the bone spine and the coordinate convention.
 */

/**
 * One bone of an explicit archetype tree.
 *
 * `anchor` is a key into the cut manifest's `anchors` block, never a number in
 * this file — plan 01 section 6.4 traced every dead script in this pipeline back
 * to a per-cut constant sitting in code.
 */
export interface ArchetypeBone {
  name: string;
  parent?: string;
  /** Manifest `anchors` key. Omitted only by the skeleton origin. */
  anchor?: string;
  /** Take the setup rotation from the manifest's `axis.deg` instead of the anchor. */
  rotationFrom?: 'axis';
}

export interface Archetype {
  name: string;
  /**
   * Root chain emitted before any slot bone, and each slot gets a bone of its
   * own name hanging off the last link. This is the overlay-archetype shape:
   * parts are pinned by manifest offsets and the formation has no articulation.
   */
  rootChain: string[];
  /** Mesh slots allowed. v0 is rigid-only — plan 04 section 7-1 step 2. */
  maxMeshSlots: number;

  // -- explicit-tree archetypes ---------------------------------------------
  /**
   * An articulated archetype declares its bones instead of deriving one per
   * slot, because several slots share a bone (`piston` + `piston_blur`, `lip` +
   * `fluid_pool`) and several bones drive no slot at all (the grips, the chain).
   */
  bones?: ArchetypeBone[];
  /** slot -> bone. Required when `bones` is present; a slot outside it is refused. */
  slotBone?: Record<string, string>;
  /** Canonical draw order — the archetype's slot table, top to bottom. */
  slotOrder?: string[];
  /** The bone carrying the cut's axis angle. Its subtree is authored in axis space. */
  axisBone?: string;
  /**
   * The bone carrying the INSERTING side's mass. Named here because the contact
   * rule needs to know whose motion eats the clearance, and because which side a
   * mass belongs to is a fact about the archetype rather than about a cut.
   */
  massBone?: string;
  /** Parentage that must never happen, with the reason it is tempting. */
  detached?: Array<{ bone: string; notUnder: string; why: string }>;
}

export const FACE_OVERLAY_V1: Archetype = {
  name: 'face_overlay_v1',
  // `root` is the skeleton origin; `face` is the single handle that a later cut
  // can translate/scale to re-seat the whole formation without touching parts.
  rootChain: ['root', 'face'],
  maxMeshSlots: 0,
};

/**
 * v2 = the same formation with the mesh tier switched on (plan 04 section 7-1
 * step 4). Nothing else changes: same root chain, same overlay logic, same
 * coordinate contract. A cut stays on v1 until its manifest actually declares a
 * mesh, so the rigid result that the owner already signed off keeps compiling
 * byte for byte.
 *
 * The budget is 3 and not 4: plan 02 section 2-3 targets three meshes and the
 * validator's A13 stops the room at four, so the archetype holds the target and
 * the assertion holds the wall.
 */
export const FACE_OVERLAY_V2: Archetype = {
  name: 'face_overlay_v2',
  rootChain: ['root', 'face'],
  maxMeshSlots: 3,
};

/**
 * Tier 2 — the joint-closeup archetype of plan 02 section 2.
 *
 * ⭐ `axis` is the keystone. The stroke is a translateX along this rotated bone,
 * never a screen-space x/y pair: the scaffold hardcoded the pairs and that is
 * precisely why its animation could not move to another cut (plan 01 section 1-1
 * measured a ~40 degree axis difference between sibling variants of ONE cut).
 * With axis-space authoring a new cut changes `axis.rotation` and replays the
 * same keys, and that angle comes from the manifest.
 *
 * ⚠️ `fluid_src` hangs off `axis`, NOT off `piston`. The scaffold parented it to
 * the moving part (`spine_builder.py:49`) and every emitted drop then got dragged
 * back and forth with each stroke. Once released, fluid stays at the entry point
 * and only takes gravity. That is `detached` below, and the validator holds it.
 *
 * Bones with no slot are not decoration: the four grips drive the `lip` ring, the
 * chain drives the `fluid` ribbon, `body_soft_a/b` drive the flesh ring, and
 * `piston_tip` is the reference point an occluder reaction reads.
 */
export const JOINT_CLOSEUP_V1: Archetype = {
  name: 'joint_closeup_v1',
  rootChain: ['root'],
  // Target 3, and assertion A13 holds the room at 4 (plan 02 section 2-3).
  maxMeshSlots: 3,
  bones: [
    { name: 'root' },
    { name: 'cam', parent: 'root', anchor: 'cam' },
    { name: 'base', parent: 'cam', anchor: 'base' },
    { name: 'body', parent: 'cam', anchor: 'body' },
    { name: 'body_soft_a', parent: 'body', anchor: 'body_soft_a' },
    { name: 'body_soft_b', parent: 'body', anchor: 'body_soft_b' },
    { name: 'axis', parent: 'cam', anchor: 'axis', rotationFrom: 'axis' },
    { name: 'piston', parent: 'axis', anchor: 'piston' },
    { name: 'piston_tip', parent: 'piston', anchor: 'piston_tip' },
    { name: 'rim', parent: 'axis', anchor: 'rim' },
    { name: 'rim_grip_a', parent: 'rim', anchor: 'rim_grip_a' },
    { name: 'rim_grip_b', parent: 'rim', anchor: 'rim_grip_b' },
    { name: 'rim_grip_c', parent: 'rim', anchor: 'rim_grip_c' },
    { name: 'rim_grip_d', parent: 'rim', anchor: 'rim_grip_d' },
    { name: 'fluid_src', parent: 'axis', anchor: 'fluid_src' },
    { name: 'fluid_a', parent: 'fluid_src', anchor: 'fluid_a' },
    { name: 'fluid_b', parent: 'fluid_a', anchor: 'fluid_b' },
    { name: 'fluid_c', parent: 'fluid_b', anchor: 'fluid_c' },
  ],
  // Plan 02 section 2-2's table, without the `slot_` prefix the scaffold used.
  slotBone: {
    base: 'base',
    body_soft: 'body',
    piston: 'piston',
    piston_blur: 'piston',
    lip: 'rim',
    fluid: 'fluid_src',
    fluid_pool: 'rim',
    near: 'body',
    grade: 'cam',
  },
  slotOrder: ['base', 'body_soft', 'piston', 'piston_blur', 'lip', 'fluid', 'fluid_pool', 'near', 'grade'],
  axisBone: 'axis',
  // ⚠️ `body` is the INSERTING side's mass, not the receiving side's. The
  // receiving body's surface IS `lip` + `base`, so a gap between it and the
  // occluder would be a gap inside one body and the contact rule would not
  // compute. Plan 02 section 2-1's prose said "receiving" and the rig had always
  // placed it outward; the prose was the loser (plan 02 section 8-10).
  massBone: 'body',
  detached: [
    {
      bone: 'fluid_src',
      notUnder: 'piston',
      why: 'released fluid stays at the entry point and only takes gravity; parented to the moving part it gets dragged with every stroke (spine_builder.py:49)',
    },
  ],
};

export const ARCHETYPES: Record<string, Archetype> = {
  [FACE_OVERLAY_V1.name]: FACE_OVERLAY_V1,
  [FACE_OVERLAY_V2.name]: FACE_OVERLAY_V2,
  [JOINT_CLOSEUP_V1.name]: JOINT_CLOSEUP_V1,
};

/**
 * Crop pixels (y down, origin top-left) -> Spine world (y up, origin at the
 * bottom-left of the crop).
 *
 * This is the whole coordinate contract, and it is also the viewer's: the
 * renderer's root element sits at the BOTTOM-left of the stage because
 * spine-html negates world Y (Spine is Y-up, CSS is Y-down).
 */
export function cropToSpineY(cropY: number, cropHeight: number): number {
  return cropHeight - cropY;
}
