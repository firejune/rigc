/**
 * The rig as measured, in the frames' own pixel coordinates.
 *
 * Joints are read off `ess/idle/f0000.png` (the stance the setup pose is
 * authored to). Attachment placements start from a template match of the art
 * against that same frame and are then refined by `fit-setup.ts`, which renders
 * the candidate back into the frames' viewport — the only estimator that sees
 * occlusion the way the picture does.
 */
export interface BoneDef {
  name: string;
  parent: string | null;
  /** joint, in frame pixels of ess/idle/f0000 */
  px: number;
  py: number;
  /** bone length in world units; 0 = omit */
  length?: number;
}

export interface PartDef {
  /** slot name */
  slot: string;
  bone: string;
  /** attachment placeholder → image basename; first entry is the setup pose */
  attachments: string[];
  /** setup attachment, or null for "show nothing" */
  setup: string | null;
  /** art centre in frame pixels, and its rotation in degrees CCW */
  px: number;
  py: number;
  rot: number;
}

export const BONES: BoneDef[] = [
  { name: 'root', parent: null, px: 177.35, py: 335.96 },
  { name: 'hip', parent: 'root', px: 179, py: 292, length: 0 },
  { name: 'torso', parent: 'hip', px: 178, py: 289, length: 150 },
  { name: 'neck', parent: 'torso', px: 176, py: 258, length: 40 },
  { name: 'head', parent: 'neck', px: 175, py: 251, length: 160 },
  { name: 'rear-upper-arm', parent: 'torso', px: 176, py: 262, length: 70 },
  { name: 'rear-bracer', parent: 'rear-upper-arm', px: 186, py: 271, length: 60 },
  { name: 'gun', parent: 'rear-bracer', px: 196, py: 280, length: 120 },
  { name: 'muzzle', parent: 'gun', px: 233, py: 291, length: 40 },
  { name: 'front-upper-arm', parent: 'torso', px: 172, py: 261, length: 70 },
  { name: 'front-bracer', parent: 'front-upper-arm', px: 161, py: 266, length: 60 },
  { name: 'front-fist', parent: 'front-bracer', px: 152, py: 279, length: 50 },
  { name: 'rear-thigh', parent: 'hip', px: 181, py: 292, length: 90 },
  { name: 'rear-shin', parent: 'rear-thigh', px: 196, py: 299, length: 100 },
  { name: 'rear-foot', parent: 'rear-shin', px: 199, py: 322, length: 60 },
  { name: 'front-thigh', parent: 'hip', px: 177, py: 292, length: 90 },
  { name: 'front-shin', parent: 'front-thigh', px: 162, py: 301, length: 110 },
  { name: 'front-foot', parent: 'front-shin', px: 152, py: 326, length: 70 },
];

/** Draw order: index 0 is furthest back (R4). */
export const PARTS: PartDef[] = [
  { slot: 'rear-upper-arm', bone: 'rear-upper-arm', attachments: ['rear-upper-arm'], setup: 'rear-upper-arm', px: 180, py: 266, rot: -50 },
  { slot: 'rear-bracer', bone: 'rear-bracer', attachments: ['rear-bracer'], setup: 'rear-bracer', px: 190, py: 274, rot: -40 },
  { slot: 'rear-thigh', bone: 'rear-thigh', attachments: ['rear-thigh'], setup: 'rear-thigh', px: 186, py: 295, rot: 30 },
  { slot: 'rear-shin', bone: 'rear-shin', attachments: ['rear-shin'], setup: 'rear-shin', px: 192, py: 313.5, rot: 5 },
  { slot: 'rear-foot', bone: 'rear-foot', attachments: ['rear-foot'], setup: 'rear-foot', px: 200.5, py: 329.5, rot: 0 },
  { slot: 'neck', bone: 'neck', attachments: ['neck'], setup: 'neck', px: 172, py: 254, rot: 0 },
  { slot: 'torso', bone: 'torso', attachments: ['torso'], setup: 'torso', px: 173, py: 271, rot: -6 },
  { slot: 'head', bone: 'head', attachments: ['head'], setup: 'head', px: 187.5, py: 224.5, rot: 4 },
  { slot: 'eye', bone: 'head', attachments: ['eye-indifferent', 'eye-surprised'], setup: 'eye-indifferent', px: 186, py: 231, rot: 4 },
  { slot: 'mouth', bone: 'head', attachments: ['mouth-grind', 'mouth-oooo', 'mouth-smile'], setup: 'mouth-grind', px: 191, py: 245, rot: 4 },
  { slot: 'goggles', bone: 'head', attachments: ['goggles'], setup: 'goggles', px: 184.5, py: 230.5, rot: 4 },
  { slot: 'gun', bone: 'gun', attachments: ['gun'], setup: 'gun', px: 211.5, py: 283.5, rot: 30 },
  { slot: 'muzzle-ring', bone: 'muzzle', attachments: ['muzzle-ring'], setup: null, px: 240, py: 291, rot: 30 },
  { slot: 'muzzle-glow', bone: 'muzzle', attachments: ['muzzle-glow'], setup: null, px: 236, py: 291, rot: 0 },
  { slot: 'muzzle', bone: 'muzzle', attachments: ['muzzle01', 'muzzle02', 'muzzle03', 'muzzle04', 'muzzle05'], setup: null, px: 248, py: 293, rot: 30 },
  { slot: 'front-thigh', bone: 'front-thigh', attachments: ['front-thigh'], setup: 'front-thigh', px: 169, py: 296, rot: -10 },
  { slot: 'front-shin', bone: 'front-shin', attachments: ['front-shin'], setup: 'front-shin', px: 162, py: 313.5, rot: -21 },
  { slot: 'front-foot', bone: 'front-foot', attachments: ['front-foot'], setup: 'front-foot', px: 161.5, py: 329, rot: -4 },
  { slot: 'front-upper-arm', bone: 'front-upper-arm', attachments: ['front-upper-arm'], setup: 'front-upper-arm', px: 167, py: 264, rot: 60 },
  { slot: 'front-bracer', bone: 'front-bracer', attachments: ['front-bracer'], setup: 'front-bracer', px: 156, py: 270, rot: -35 },
  { slot: 'front-fist', bone: 'front-fist', attachments: ['front-fist-open', 'front-fist-closed'], setup: 'front-fist-open', px: 152, py: 285, rot: -35 },
];
