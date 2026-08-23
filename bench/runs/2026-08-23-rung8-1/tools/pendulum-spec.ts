/**
 * The `pendulum` rig and motion specs, emitted from the structure the frames
 * measured plus a list of per-frame poses.
 *
 * Structure (world units, y up), all of it read off the frames:
 *   · the chain hangs from the discus's own centre — the midpoint of its rim's
 *     two tips — which is also the point the discus turns about;
 *   · five bones down the chain, each at the joint above it, each link's length
 *     fitted as the distance that stays constant across all 88 frames;
 *   · every attachment is a plain region, because nothing in this shot deforms.
 *
 * Art anchors come from the PNGs: each link's orange bead is its own anchor, and
 * `ANCHOR` is where that anchor sits along the bone. Only `chain-1`'s is not
 * decided by the beads — the discus covers 70 % of that one — so it is swept
 * against the pixels in `fit-pendulum-pixels.ts`.
 */
import type { RigSpec } from '../../../../src/rig.ts';
import type { MotionSpec, MotionTrack, EasingHandles } from '../../../../src/types.ts';

export interface PendulumStructure {
  /** link 1's bone in the discus's frame; the fit puts it on the discus's centre. */
  pivot: [number, number];
  /** bone-to-bone distances down the chain, units. */
  L: [number, number, number, number];
  /** how far chain-1's bead sits below its own bone, units. Swept against pixels. */
  h1: number;
  /** the discus's setup position in world units. */
  discus: [number, number];
  /** the setup-pose bounding box. */
  box: { x: number; y: number; width: number; height: number };
}

export interface PendulumPose {
  t: number;
  /** discus translation from setup, world units. */
  x: number;
  y: number;
  /** discus rotation, degrees. */
  rotation: number;
  /** each link's rotation relative to its parent, degrees. */
  link: [number, number, number, number];
}

/**
 * Where each plate's own anchor sits inside it, in image pixels, and the plate's
 * centre. `art.ts` measures both; they are written out here so the arithmetic
 * that turns them into attachment offsets is in one place.
 */
const PLATES = {
  platform: { size: [687, 106], anchor: [342.5, 54.5] },
  'chain-1': { size: [108, 303], anchor: [53.5, 49.0] },
  'chain-2': { size: [74, 252], anchor: [36.5, 36.5] },
  'chain-3': { size: [74, 223], anchor: [36.5, 36.5] },
  'chain-4': { size: [74, 196], anchor: [36.5, 36.5] },
  'chain-end': { size: [126, 120], anchor: [63.8, 66.5] },
} as const;

/**
 * A plate's centre relative to its anchor, in the art's own upright world frame
 * (y up), which is what a region attachment's `x`/`y` want once the bone's own
 * rotation is undone.
 */
function offsetOf(name: keyof typeof PLATES): [number, number] {
  const p = PLATES[name];
  return [p.size[0] / 2 - p.anchor[0], -(p.size[1] / 2 - p.anchor[1])];
}

/**
 * The chain bones point **down** the chain, so their local +x is world −y in the
 * setup pose. A world offset (wx, wy) is therefore local (−wy, wx), and the art
 * is brought back upright with a +90° attachment rotation.
 */
function downBoneOffset(name: keyof typeof PLATES, along: number): { x: number; y: number; rotation: number } {
  const [wx, wy] = offsetOf(name);
  return { x: along - wy, y: wx, rotation: 90 };
}

export function pendulumRig(s: PendulumStructure): RigSpec {
  const flat = offsetOf('platform');
  return {
    spec: 'rigc-rig/1',
    name: 'pendulum',
    images: 'images',
    skeleton: s.box,
    bones: [
      { name: 'root' },
      { name: 'discus', parent: 'root', x: s.discus[0], y: s.discus[1], rotation: 0, length: 343 },
      { name: 'chain1', parent: 'discus', x: s.pivot[0], y: s.pivot[1], rotation: -90, length: s.L[0] },
      { name: 'chain2', parent: 'chain1', x: s.L[0], y: 0, rotation: 0, length: s.L[1] },
      { name: 'chain3', parent: 'chain2', x: s.L[1], y: 0, rotation: 0, length: s.L[2] },
      { name: 'chain4', parent: 'chain3', x: s.L[2], y: 0, rotation: 0, length: s.L[3] },
      { name: 'eyelet', parent: 'chain4', x: s.L[3], y: 0, rotation: 0, length: 120 },
    ],
    // R4: index 0 is drawn first, so this list runs back to front.
    //
    // ⭐ **The frames decide more of this than the brief could.** The discus
    // covering 70 % of the top link's bead is visible on the reference alone; the
    // rest is only visible **like-for-like**, by rendering a candidate back and
    // measuring the same feature on both sides. Composited unoccluded, each of
    // the lower links' beads is 113 px at this scale. The reference reads
    // 99–109; a candidate with the links stacked the other way reads 108–116, and
    // the terminal eyelet's disc reads 119–126 on **both** sides. So each link is
    // drawn in front of the one below it, and the eyelet — which nothing covers
    // either way, because the link above it stops 3.7 px short of its disc — is
    // put behind on the same pattern rather than on evidence. LOOP.md §9.
    slots: [
      { name: 'chain-end', bone: 'eyelet', attachment: 'chain-end' },
      { name: 'chain-4', bone: 'chain4', attachment: 'chain-4' },
      { name: 'chain-3', bone: 'chain3', attachment: 'chain-3' },
      { name: 'chain-2', bone: 'chain2', attachment: 'chain-2' },
      { name: 'chain-1', bone: 'chain1', attachment: 'chain-1' },
      { name: 'platform', bone: 'discus', attachment: 'platform' },
    ],
    skins: {
      default: {
        'chain-1': { 'chain-1': { image: 'chain-1.png', ...downBoneOffset('chain-1', s.h1) } },
        'chain-2': { 'chain-2': { image: 'chain-2.png', ...downBoneOffset('chain-2', 0) } },
        'chain-3': { 'chain-3': { image: 'chain-3.png', ...downBoneOffset('chain-3', 0) } },
        'chain-4': { 'chain-4': { image: 'chain-4.png', ...downBoneOffset('chain-4', 0) } },
        'chain-end': { 'chain-end': { image: 'chain-end.png', ...downBoneOffset('chain-end', 0) } },
        platform: { platform: { image: 'platform.png', x: flat[0], y: flat[1], rotation: 0 } },
      },
    },
  };
}

export function pendulumMotion(
  duration: number,
  tracks: MotionTrack[],
  easings: Record<string, EasingHandles>,
): MotionSpec {
  return {
    spec: 'rigc-motion/1',
    archetype: 'pendulum',
    cut: 'follow-through',
    easings,
    animations: {
      'follow-through': {
        duration,
        loop: false,
        tracks,
      },
    },
  };
}

/** A static rig — what the fitting loop poses directly, with no timelines at all. */
export function pendulumStatic(): MotionSpec {
  return {
    spec: 'rigc-motion/1',
    archetype: 'pendulum',
    cut: 'follow-through',
    easings: {},
    animations: {},
  };
}
