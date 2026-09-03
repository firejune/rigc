/**
 * The rig's STRUCTURE, as data — and the arithmetic that turns it into a rig
 * spec.
 *
 * Every joint below is a point in ONE part image's own pixels, read off that
 * image's opaque geometry by `tools/art.ts` (a cap centroid) or, where the art
 * does not draw the joint, declared here as a prior and marked so. The
 * conversion is MOTION.md §6.3's: a bone sits at its pivot, an attachment's
 * `x`/`y` is the gap from that pivot to the image's own centre in the bone's
 * axes with y flipped once, and one art pixel is one world unit — which this
 * run MEASURED (`pose` with the scale window opened to 0.10..0.40 returns
 * 0.216..0.221 on the four biggest unoccluded parts against the sidecar's
 * 0.222973 px/unit) rather than assumed.
 *
 * ## Why the hierarchy is this hierarchy
 *
 * Bone parentage is not in the frames (AUTHORING §9.3), so it is chosen. Two
 * choices are load-bearing and both are made for IDENTIFIABILITY:
 *
 *  - **`torso` is the trunk and everything hangs off it**, rather than a
 *    pelvis bone with the chest and the legs as siblings. `rigc chainfit`
 *    recovers a bone from an anchor by walking OUTWARD only — "a bone above an
 *    anchor does not [follow]", §12.2 — and `torso` is the one part `pose`
 *    places confidently on almost every frame of this corpus. Under a pelvis
 *    the legs would sit above the only reliable anchor and come back
 *    `no-anchor` on every frame.
 *  - **the neck plate rides the head bone.** §10.1 asks for one slot per
 *    image, which this rig gives it; it does not ask for one bone per slot. A
 *    separate neck bone would be a second rotation between the torso and the
 *    head, and at 8x9 frame pixels the frames cannot separate the two — so it
 *    would be a channel fitted to nothing.
 */

export interface JointTable {
  /** The part image this bone's pivot is read out of. */
  part: string;
  /** The pivot, in that image's own pixels. */
  pivot: [number, number];
  /** Where each child bone's pivot sits, in THIS bone's part image pixels. */
  children?: Record<string, [number, number]>;
  /** True where the pivot is a declared prior rather than an art cap. */
  prior?: string;
}

/**
 * The caps `tools/art.ts` measured, quoted so the arithmetic below is readable
 * without re-running it. `topCap`/`bottomCap` are the opaque-pixel centroids of
 * the topmost and bottommost 12% of opaque rows, at alpha >= 128.
 */
export const JOINTS: Record<string, JointTable> = {
  torso: {
    part: 'torso',
    // bottomCap (53.3, 166.6) — the pelvis end of the chest plate.
    pivot: [53.3, 166.6],
    children: {
      // TRIANGULATED, not a cap: `tools/joints.ts` over 19 battery frames whose
      // relative rotation across this joint spans 87.0 deg, rms 1.588 frame px,
      // worst single frame 3.4. The plate's own topCap (25.0, 12.8) is 29 units
      // left of this and put the head 22.9 frame px left of where `idle/f0000`
      // has it — the narrow top-left of the chest plate is a shoulder, not the
      // neck. Conditioning: dropping the 6 most angularly diverse frames moves
      // the answer 11.6 image px, so the diverse frames carry part of the
      // identification and this is recorded as such.
      head: [53.9, -4.3],
      // The shoulders are NOT drawn as caps on the torso plate: they are
      // interior to it. Both are declared priors, placed on the plate's upper
      // chest, and both are swept against the frames by tools/shoulders.ts.
      'front-upper-arm': [56.0, 40.0],
      'rear-upper-arm': [50.0, 46.0],
      // Same for the hips, interior to the plate just above the pelvis cap.
      'front-thigh': [50.0, 150.0],
      'rear-thigh': [56.0, 150.0],
    },
    prior: 'shoulders and hips are interior to the plate and are declared, then swept',
  },
  head: {
    part: 'head',
    // The other half of the same triangulation. The plate's own bottomCap is
    // (139.6, 276.0); the solve puts the joint 47.9 units left of it, which is
    // the back of the jaw rather than its middle.
    pivot: [91.7, 268.1],
  },
  'front-upper-arm': {
    part: 'front-upper-arm',
    pivot: [24.1, 7.5], // topCap — the shoulder end
    children: { 'front-bracer': [17.6, 89.3] }, // bottomCap — the elbow
  },
  'front-bracer': {
    part: 'front-bracer',
    pivot: [15.1, 5.6], // topCap — the elbow end
    children: { 'front-fist': [31.3, 73.4] }, // bottomCap — the wrist
  },
  'front-fist': {
    part: 'front-fist-closed',
    pivot: [19.4, 6.4], // topCap — the wrist end
  },
  'rear-upper-arm': {
    part: 'rear-upper-arm',
    pivot: [18.8, 6.4],
    children: { 'rear-bracer': [18.9, 79.6] },
  },
  'rear-bracer': {
    part: 'rear-bracer',
    pivot: [10.6, 5.4],
    children: { gun: [23.5, 63.8] },
  },
  gun: {
    part: 'gun',
    // bottomCap (184.1, 187.0) — the end the gun's own gripping hand is drawn
    // at. The brief settles that the gun is in the FAR hand and that it carries
    // its own hand, so this cap is the wrist joint.
    pivot: [184.1, 187.0],
    // The barrel's open end, at the far corner of the plate's wide top-left
    // body. A prior: the muzzle is a shape, not a cap centroid.
    children: { muzzle: [6.0, 46.0] },
    prior: 'the muzzle point is the barrel mouth, declared off the plate outline',
  },
  muzzle: {
    part: 'muzzle01',
    // The flare plates are drawn with the barrel end at their left: leftCap
    // (23.3, 38.8) on muzzle01.
    pivot: [23.3, 38.8],
  },
  'front-thigh': {
    part: 'front-thigh',
    pivot: [16.5, 8.1],
    children: { 'front-shin': [20.5, 102.9] },
  },
  'front-shin': {
    part: 'front-shin',
    pivot: [52.3, 13.6],
    children: { 'front-foot': [28.7, 169.7] },
  },
  'front-foot': { part: 'front-foot', pivot: [41.0, 5.3] },
  'rear-thigh': {
    part: 'rear-thigh',
    pivot: [14.2, 6.2],
    children: { 'rear-shin': [36.5, 86.8] },
  },
  'rear-shin': {
    part: 'rear-shin',
    pivot: [52.0, 15.3],
    children: { 'rear-foot': [26.0, 162.0] },
  },
  'rear-foot': { part: 'rear-foot', pivot: [30.0, 4.6] },
};

export const PARENTS: Record<string, string> = {
  torso: 'root',
  head: 'torso',
  'front-upper-arm': 'torso',
  'front-bracer': 'front-upper-arm',
  'front-fist': 'front-bracer',
  'rear-upper-arm': 'torso',
  'rear-bracer': 'rear-upper-arm',
  gun: 'rear-bracer',
  muzzle: 'gun',
  'front-thigh': 'torso',
  'front-shin': 'front-thigh',
  'front-foot': 'front-shin',
  'rear-thigh': 'torso',
  'rear-shin': 'rear-thigh',
  'rear-foot': 'rear-shin',
};

/** Declaration order — a parent always before its children (§10.1, 📗). */
export const BONE_ORDER = [
  'root',
  'torso',
  'head',
  'rear-upper-arm',
  'rear-bracer',
  'gun',
  'muzzle',
  'front-upper-arm',
  'front-bracer',
  'front-fist',
  'rear-thigh',
  'rear-shin',
  'rear-foot',
  'front-thigh',
  'front-shin',
  'front-foot',
];

export interface SlotPlan {
  slot: string;
  bone: string;
  /** placeholder -> image, in the `default` skin. */
  attachments: Record<string, string>;
  /** The setup-pose attachment, or null for "show nothing". */
  setup: string | null;
  /**
   * Where this slot's art sits relative to its bone, when it is NOT the part
   * the bone's pivot was read from: a point in the OTHER part's own pixels that
   * coincides with the bone's pivot.
   */
  pivotIn?: Record<string, [number, number]>;
  /** Extra offset in bone-local units, for a slot placed against a sibling. */
  offset?: [number, number];
  note?: string;
}

/**
 * The slots array IS the setup draw order (R4), index 0 furthest back.
 *
 * Three edges here are the frames' own, from the brief's *What this brief cannot
 * tell you*: the near leg is drawn in front of the gun, and in front of the far
 * leg. Everything else is a pair the frames never catch overlapping, and is
 * ordered far-side-first by the art's own naming.
 */
export const SLOTS: SlotPlan[] = [
  { slot: 'rear-foot', bone: 'rear-foot', attachments: { 'rear-foot': 'rear-foot.png' }, setup: 'rear-foot' },
  { slot: 'rear-shin', bone: 'rear-shin', attachments: { 'rear-shin': 'rear-shin.png' }, setup: 'rear-shin' },
  { slot: 'rear-thigh', bone: 'rear-thigh', attachments: { 'rear-thigh': 'rear-thigh.png' }, setup: 'rear-thigh' },
  {
    slot: 'rear-upper-arm',
    bone: 'rear-upper-arm',
    attachments: { 'rear-upper-arm': 'rear-upper-arm.png' },
    setup: 'rear-upper-arm',
  },
  { slot: 'rear-bracer', bone: 'rear-bracer', attachments: { 'rear-bracer': 'rear-bracer.png' }, setup: 'rear-bracer' },
  { slot: 'gun', bone: 'gun', attachments: { gun: 'gun.png' }, setup: 'gun' },
  {
    slot: 'muzzle-ring',
    bone: 'muzzle',
    attachments: { 'muzzle-ring': 'muzzle-ring.png' },
    setup: null,
    pivotIn: { 'muzzle-ring': [24.5, 23.2] },
    note: 'the ring is drawn around the flare; its topCap is the barrel end',
  },
  {
    slot: 'muzzle',
    bone: 'muzzle',
    attachments: {
      muzzle01: 'muzzle01.png',
      muzzle02: 'muzzle02.png',
      muzzle03: 'muzzle03.png',
      muzzle04: 'muzzle04.png',
      muzzle05: 'muzzle05.png',
    },
    setup: null,
    pivotIn: {
      muzzle01: [23.3, 38.8],
      muzzle02: [23.5, 41.0],
      muzzle03: [30.0, 52.0],
      muzzle04: [26.0, 44.0],
      muzzle05: [23.0, 37.0],
    },
    note: 'five numbered flare frames as ALTERNATIVES in one slot — §10.1, "a weapon slot may have a knife, sword, axe"; the shot swaps between them, which is what earns the shared slot',
  },
  {
    slot: 'muzzle-glow',
    bone: 'muzzle',
    attachments: { 'muzzle-glow': 'muzzle-glow.png' },
    setup: null,
    pivotIn: { 'muzzle-glow': [24.5, 24.5] },
  },
  {
    slot: 'neck',
    bone: 'head',
    attachments: { neck: 'neck.png' },
    setup: 'neck',
    pivotIn: { neck: [21.1, 2.5] },
    note: 'the collar plate, on the head bone: its topCap meets the head bone pivot',
  },
  { slot: 'torso', bone: 'torso', attachments: { torso: 'torso.png' }, setup: 'torso' },
  { slot: 'front-thigh', bone: 'front-thigh', attachments: { 'front-thigh': 'front-thigh.png' }, setup: 'front-thigh' },
  { slot: 'front-shin', bone: 'front-shin', attachments: { 'front-shin': 'front-shin.png' }, setup: 'front-shin' },
  { slot: 'front-foot', bone: 'front-foot', attachments: { 'front-foot': 'front-foot.png' }, setup: 'front-foot' },
  { slot: 'head', bone: 'head', attachments: { head: 'head.png' }, setup: 'head' },
  {
    slot: 'eye',
    bone: 'head',
    attachments: { 'eye-indifferent': 'eye-indifferent.png', 'eye-surprised': 'eye-surprised.png' },
    setup: 'eye-indifferent',
    note: 'UNOBSERVABLE: the brief measures the goggles covering the eyes on every frame of both skeletons, so this slot is a prior — placed concentric with the goggles',
  },
  { slot: 'goggles', bone: 'head', attachments: { goggles: 'goggles.png' }, setup: 'goggles' },
  {
    slot: 'mouth',
    bone: 'head',
    attachments: { 'mouth-grind': 'mouth-grind.png', 'mouth-oooo': 'mouth-oooo.png', 'mouth-smile': 'mouth-smile.png' },
    setup: 'mouth-smile',
  },
  {
    slot: 'front-upper-arm',
    bone: 'front-upper-arm',
    attachments: { 'front-upper-arm': 'front-upper-arm.png' },
    setup: 'front-upper-arm',
  },
  {
    slot: 'front-bracer',
    bone: 'front-bracer',
    attachments: { 'front-bracer': 'front-bracer.png' },
    setup: 'front-bracer',
  },
  {
    slot: 'front-fist',
    bone: 'front-fist',
    attachments: { 'front-fist-closed': 'front-fist-closed.png', 'front-fist-open': 'front-fist-open.png' },
    setup: 'front-fist-closed',
    pivotIn: { 'front-fist-closed': [19.4, 6.4], 'front-fist-open': [23.2, 6.3] },
  },
];
