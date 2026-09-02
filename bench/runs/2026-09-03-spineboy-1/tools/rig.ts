/**
 * The rig's structure, and the emitter that turns a parameter file into a rig spec.
 *
 * The tree, the slot order and the attachment inventory are authoring decisions
 * recorded here once; `fit/setup.json` carries only numbers, so the fitter can
 * rewrite the geometry without ever rewriting the structure.
 *
 * Conventions this file fixes, all of them AUTHORING §10.1's:
 *   - one image -> one placeholder, named after the PNG's basename;
 *   - a slot per image, except where two images can never be on screen together
 *     (the fist, the numbered flares, the eyes, the mouths), which is what a
 *     shared slot is for;
 *   - every bone's setup rotation is 0, so the art rests at the orientation its
 *     own PNG is drawn at and a `rotate` key is the bone's absolute local angle.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** name -> parent. Declaration order is parent-before-child, as the format needs. */
export const BONES: [string, string | null][] = [
  ['root', null],
  ['torso', 'root'],
  ['neck', 'torso'],
  ['head', 'neck'],
  ['rear-upper-arm', 'torso'],
  ['rear-bracer', 'rear-upper-arm'],
  ['gun', 'rear-bracer'],
  ['muzzle', 'gun'],
  ['front-upper-arm', 'torso'],
  ['front-bracer', 'front-upper-arm'],
  ['front-fist', 'front-bracer'],
  ['rear-thigh', 'torso'],
  ['rear-shin', 'rear-thigh'],
  ['rear-foot', 'rear-shin'],
  ['front-thigh', 'torso'],
  ['front-shin', 'front-thigh'],
  ['front-foot', 'front-shin'],
];

export const PARENT_OF = new Map(BONES);

/** Root-to-leaf chain of every bone, itself last. */
export function chainOf(bone: string): string[] {
  const out: string[] = [];
  let b: string | null | undefined = bone;
  while (b) {
    out.unshift(b);
    b = PARENT_OF.get(b) ?? null;
  }
  return out;
}

export interface SlotDef {
  slot: string;
  bone: string;
  /** Placeholder names, in the order they are declared; the first is the setup pose. */
  attachments: string[];
  /** `null` when the slot shows nothing at setup. */
  setup: string | null;
}

/**
 * Draw order, back to front — AUTHORING R4: the slots array *is* the setup order.
 *
 * Two edges are forced by the frames and are recorded in LOOP.md §2 with their
 * measurements; the rest is this run's reading, swept where a sweep could read it.
 */
export const SLOTS: SlotDef[] = [
  { slot: 'rear-foot', bone: 'rear-foot', attachments: ['rear-foot'], setup: 'rear-foot' },
  { slot: 'rear-shin', bone: 'rear-shin', attachments: ['rear-shin'], setup: 'rear-shin' },
  { slot: 'rear-thigh', bone: 'rear-thigh', attachments: ['rear-thigh'], setup: 'rear-thigh' },
  { slot: 'rear-upper-arm', bone: 'rear-upper-arm', attachments: ['rear-upper-arm'], setup: 'rear-upper-arm' },
  { slot: 'rear-bracer', bone: 'rear-bracer', attachments: ['rear-bracer'], setup: 'rear-bracer' },
  { slot: 'neck', bone: 'neck', attachments: ['neck'], setup: 'neck' },
  { slot: 'torso', bone: 'torso', attachments: ['torso'], setup: 'torso' },
  { slot: 'gun', bone: 'gun', attachments: ['gun'], setup: 'gun' },
  {
    slot: 'muzzle',
    bone: 'muzzle',
    attachments: ['muzzle01', 'muzzle02', 'muzzle03', 'muzzle04', 'muzzle05'],
    setup: null,
  },
  { slot: 'muzzle-glow', bone: 'muzzle', attachments: ['muzzle-glow'], setup: null },
  { slot: 'muzzle-ring', bone: 'muzzle', attachments: ['muzzle-ring'], setup: null },
  { slot: 'front-thigh', bone: 'front-thigh', attachments: ['front-thigh'], setup: 'front-thigh' },
  { slot: 'front-shin', bone: 'front-shin', attachments: ['front-shin'], setup: 'front-shin' },
  { slot: 'front-foot', bone: 'front-foot', attachments: ['front-foot'], setup: 'front-foot' },
  { slot: 'front-upper-arm', bone: 'front-upper-arm', attachments: ['front-upper-arm'], setup: 'front-upper-arm' },
  { slot: 'front-bracer', bone: 'front-bracer', attachments: ['front-bracer'], setup: 'front-bracer' },
  {
    slot: 'front-fist',
    bone: 'front-fist',
    attachments: ['front-fist-closed', 'front-fist-open'],
    setup: 'front-fist-closed',
  },
  { slot: 'head', bone: 'head', attachments: ['head'], setup: 'head' },
  { slot: 'eye', bone: 'head', attachments: ['eye-indifferent', 'eye-surprised'], setup: 'eye-indifferent' },
  { slot: 'mouth', bone: 'head', attachments: ['mouth-grind', 'mouth-oooo', 'mouth-smile'], setup: 'mouth-grind' },
  { slot: 'goggles', bone: 'head', attachments: ['goggles'], setup: 'goggles' },
];

/** Every art file this rig draws, by placeholder name. */
export const IMAGE_OF = new Map<string, string>(
  SLOTS.flatMap((s) => s.attachments.map((a) => [a, `${a}.png`] as [string, string])),
);

/** The slot a placeholder belongs to. */
export const SLOT_OF_ATTACHMENT = new Map<string, string>(
  SLOTS.flatMap((s) => s.attachments.map((a) => [a, s.slot] as [string, string])),
);

export interface Setup {
  /** bone name -> [x, y] in the parent's local axes, world units. */
  bones: Record<string, [number, number]>;
  /** placeholder name -> [x, y]: the art's centre relative to its slot's bone. */
  attach: Record<string, [number, number]>;
}

export function readSetup(path: string): Setup {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Untrimmed PNG size, straight out of the IHDR. */
export function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

export function artSizes(imagesDir: string): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const a of IMAGE_OF.keys()) out.set(a, pngSize(join(imagesDir, `${a}.png`)));
  return out;
}

export interface RigSpecOptions {
  name: string;
  images: string;
  /** The frames' own world box, so the emitted header contains the shot. */
  skeleton: { x: number; y: number; width: number; height: number };
}

export function rigSpec(setup: Setup, opts: RigSpecOptions): unknown {
  const bones = BONES.map(([name, parent]) => {
    if (parent === null) return { name };
    const [x, y] = setup.bones[name] ?? [0, 0];
    return { name, parent, x: round(x), y: round(y) };
  });
  const skins: Record<string, Record<string, unknown>> = {};
  for (const s of SLOTS) {
    const table: Record<string, unknown> = {};
    for (const a of s.attachments) {
      const [x, y] = setup.attach[a] ?? [0, 0];
      const entry: Record<string, unknown> = { image: `${a}.png` };
      if (x !== 0) entry.x = round(x);
      if (y !== 0) entry.y = round(y);
      table[a] = entry;
    }
    skins[s.slot] = table;
  }
  return {
    spec: 'rigc-rig/1',
    name: opts.name,
    images: opts.images,
    skeleton: {
      x: round(opts.skeleton.x),
      y: round(opts.skeleton.y),
      width: round(opts.skeleton.width),
      height: round(opts.skeleton.height),
    },
    bones,
    slots: SLOTS.map((s) => ({ name: s.slot, bone: s.bone, attachment: s.setup })),
    skins: { default: skins },
    // ⭐ The rung's second ask: *"a game wants to know WHEN a foot lands and when
    // the gun fires, so it can put a sound or a puff of dust there"*. The brief
    // quotes those instants to the frame and says outright that how the moment is
    // *spelled* is in the export and out of bounds — so the names are this run's,
    // and the times are the brief's windows. §3.6: an empty object is the normal
    // case, and the declaration is what the firings resolve against.
    events: { footstep: {}, gunshot: {}, land: {} },
  };
}

export function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
