/**
 * The rig this run authors: the bone tree, the joints it hangs on, the slot
 * order, and the setup pose.
 *
 * Joints are the centroid of the two neighbouring parts' overlap in the fitted
 * setup pose (`overlaps.ts`), except the two that do not overlap — the rear
 * elbow, whose upper arm is behind the torso on every frame of the shot, and the
 * neck, which the collar covers — which are placed by hand and named as such.
 *
 * Names come from the art. §10.1's convention is that dragging an image in makes
 * a slot named after it, so a slot per image named after the image is what an
 * editor rig has; the bones take the same vocabulary because the parts do.
 */
import type { TreeSpec } from './skel.ts';
import type { Placement } from './lib.ts';

import jointsFile from './joints.json' with { type: 'json' };

export const JOINTS: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(jointsFile.joints as Record<string, number[]>).map(([k, v]) => [k, [v[0], v[1]] as [number, number]]),
);

export const TREE: TreeSpec = {
  bones: [
    { name: 'root', parent: null, joint: JOINTS.root },
    { name: 'hip', parent: 'root', joint: JOINTS.hip, aim: 90 },
    { name: 'torso', parent: 'hip', joint: JOINTS.torso, aim: JOINTS.neck },
    { name: 'front-thigh', parent: 'hip', joint: JOINTS['front-thigh'] },
    { name: 'front-shin', parent: 'front-thigh', joint: JOINTS['front-shin'] },
    { name: 'front-foot', parent: 'front-shin', joint: JOINTS['front-foot'], aim: 0 },
    { name: 'rear-thigh', parent: 'hip', joint: JOINTS['rear-thigh'] },
    { name: 'rear-shin', parent: 'rear-thigh', joint: JOINTS['rear-shin'] },
    { name: 'rear-foot', parent: 'rear-shin', joint: JOINTS['rear-foot'], aim: 0 },
    { name: 'neck', parent: 'torso', joint: JOINTS.neck },
    { name: 'head', parent: 'neck', joint: JOINTS.head, aim: 90 },
    { name: 'front-upper-arm', parent: 'torso', joint: JOINTS['front-upper-arm'] },
    { name: 'front-bracer', parent: 'front-upper-arm', joint: JOINTS['front-bracer'] },
    { name: 'front-fist', parent: 'front-bracer', joint: JOINTS['front-fist'], aim: -122 },
    { name: 'rear-upper-arm', parent: 'torso', joint: JOINTS['rear-upper-arm'] },
    { name: 'rear-bracer', parent: 'rear-upper-arm', joint: JOINTS['rear-bracer'] },
    { name: 'gun', parent: 'rear-bracer', joint: JOINTS.gun },
    { name: 'muzzle', parent: 'gun', joint: JOINTS.muzzle, aim: -15.25 },
  ],
  binding: {
    'rear-upper-arm': 'rear-upper-arm',
    'rear-bracer': 'rear-bracer',
    muzzle: 'muzzle',
    gun: 'gun',
    'rear-thigh': 'rear-thigh',
    'rear-shin': 'rear-shin',
    'rear-foot': 'rear-foot',
    torso: 'torso',
    neck: 'neck',
    head: 'head',
    eye: 'head',
    goggles: 'head',
    mouth: 'head',
    'front-thigh': 'front-thigh',
    'front-shin': 'front-shin',
    'front-foot': 'front-foot',
    'front-upper-arm': 'front-upper-arm',
    'front-bracer': 'front-bracer',
    'front-fist': 'front-fist',
    'head-bb': 'head',
  },
};

/** Back to front. The slots array IS the setup draw order (AUTHORING R4). */
export const DRAW_ORDER = [
  'rear-upper-arm',
  'rear-bracer',
  'muzzle',
  'gun',
  'rear-thigh',
  'rear-foot',
  'rear-shin',
  'torso',
  'neck',
  'head',
  'eye',
  'goggles',
  'mouth',
  'front-thigh',
  'front-foot',
  'front-shin',
  'front-upper-arm',
  'front-bracer',
  'front-fist',
  'head-bb',
];

/** Slots whose attachment is chosen per shot rather than fixed. */
export const ALTERNATIVES: Record<string, string[]> = {
  eye: ['eye-indifferent', 'eye-surprised'],
  mouth: ['mouth-smile', 'mouth-grind', 'mouth-oooo'],
  'front-fist': ['front-fist-open', 'front-fist-closed'],
  muzzle: ['muzzle01', 'muzzle02', 'muzzle03', 'muzzle04', 'muzzle05'],
};

/** The flare is drawn four times the size of its own art — measured, not assumed. */
export const MUZZLE_SCALE = 4;

/**
 * Where each flare plate sits on the muzzle bone, in that bone's own frame.
 *
 * `01`, `02` and `04` are measured: the template sweep put each on `shoot` f2,
 * f3 and f4 in world coordinates, and the fitted pose carries that back through
 * the muzzle bone's own transform. `03` and `05` are **interpolated along the
 * same line** — the 12 fps set never shows either, so nothing here measures
 * them, and the log says so. A first guess of "half the plate's scaled width"
 * put the flare 21 frame px too far out and pushed the whole shot's drawn extent
 * past the reference's rightmost column (354); these numbers are what fixed it.
 */
export const MUZZLE_OFFSETS: Record<string, [number, number]> = {
  muzzle01: [170.9, -22.1],
  muzzle02: [220.2, -33.1],
  muzzle03: [231.6, -36.7],
  muzzle04: [242.9, -40.3],
  muzzle05: [250.0, -43.0],
};

export async function loadSetup(path: string): Promise<Placement[]> {
  const doc = JSON.parse(await Bun.file(path).text());
  return doc.placements as Placement[];
}
