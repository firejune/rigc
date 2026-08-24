/** Emit <name>.rig.json from the measured setup, and a motion spec on request. */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { ANCHOR, buildSetup, unrotv, type BoneDef } from './rigspec.ts';
ANCHOR['front-fist-closed'] = [0, 31];

export const BONES: [string, string | null][] = [
  ['root', null], ['hip', 'root'], ['torso', 'hip'],
  ['neck', 'torso'], ['head', 'neck'],
  ['front-upper-arm', 'torso'], ['front-bracer', 'front-upper-arm'], ['front-fist', 'front-bracer'],
  ['rear-upper-arm', 'torso'], ['rear-bracer', 'rear-upper-arm'], ['gun', 'rear-bracer'], ['muzzle', 'gun'],
  ['front-thigh', 'hip'], ['front-shin', 'front-thigh'], ['front-foot', 'front-shin'],
  ['rear-thigh', 'hip'], ['rear-shin', 'rear-thigh'], ['rear-foot', 'rear-shin'],
];
/** bone -> the art whose anchor defines its origin and whose centre it draws */
export const BONE_ART: Record<string, string> = {
  torso: 'torso', neck: 'neck', head: 'head',
  'front-upper-arm': 'front-upper-arm', 'front-bracer': 'front-bracer', 'front-fist': 'front-fist-open',
  'rear-upper-arm': 'rear-upper-arm', 'rear-bracer': 'rear-bracer', gun: 'gun',
  'front-thigh': 'front-thigh', 'front-shin': 'front-shin', 'front-foot': 'front-foot',
  'rear-thigh': 'rear-thigh', 'rear-shin': 'rear-shin', 'rear-foot': 'rear-foot',
};
/** slots, back to front. R4: this array IS the setup draw order. */
export const SLOTS: [string, string, string[], string | null][] = [
  // name, bone, placeholders, setup attachment
  ['rear-upper-arm', 'rear-upper-arm', ['rear-upper-arm'], 'rear-upper-arm'],
  ['rear-bracer', 'rear-bracer', ['rear-bracer'], 'rear-bracer'],
  ['gun', 'gun', ['gun'], 'gun'],
  ['muzzle-ring', 'muzzle', ['muzzle-ring'], null],
  ['muzzle-glow', 'muzzle', ['muzzle-glow'], null],
  ['muzzle', 'muzzle', ['muzzle01', 'muzzle02', 'muzzle03', 'muzzle04', 'muzzle05'], null],
  ['rear-thigh', 'rear-thigh', ['rear-thigh'], 'rear-thigh'],
  // the boot is drawn BEHIND its own shin — measured like-for-like (work/orderdiff.ts)
  ['rear-foot', 'rear-foot', ['rear-foot'], 'rear-foot'],
  ['rear-shin', 'rear-shin', ['rear-shin'], 'rear-shin'],
  ['neck', 'neck', ['neck'], 'neck'],
  ['torso', 'torso', ['torso'], 'torso'],
  ['head', 'head', ['head'], 'head'],
  ['eye', 'head', ['eye-indifferent', 'eye-surprised'], 'eye-indifferent'],
  ['mouth', 'head', ['mouth-grind', 'mouth-oooo', 'mouth-smile'], 'mouth-grind'],
  ['goggles', 'head', ['goggles'], 'goggles'],
  ['front-thigh', 'front-thigh', ['front-thigh'], 'front-thigh'],
  ['front-foot', 'front-foot', ['front-foot'], 'front-foot'],
  ['front-shin', 'front-shin', ['front-shin'], 'front-shin'],
  ['front-upper-arm', 'front-upper-arm', ['front-upper-arm'], 'front-upper-arm'],
  ['front-bracer', 'front-bracer', ['front-bracer'], 'front-bracer'],
  ['front-fist', 'front-fist', ['front-fist-closed', 'front-fist-open'], 'front-fist-open'],
];
/** attachments drawn on a bone other than their own art's, with an offset */
export const EXTRA_OFFSET: Record<string, [number, number]> = {};

/** the global setup refit's result — bone origins and attachment offsets. */
export interface SetupOverrides { bones?: Record<string, { x?: number; y?: number }>; attach?: Record<string, { x?: number; y?: number; scaleX?: number; scaleY?: number }> }
export function loadOverrides(): SetupOverrides {
  return existsSync('work/setup-overrides.json') ? JSON.parse(readFileSync('work/setup-overrides.json', 'utf8')) : {};
}
export function emitRig(overrides: Partial<Record<string, [number, number]>> = {}, extra: Record<string, unknown> = {}) {
  const OV = loadOverrides();
  const s = buildSetup();
  const bones: BoneDef[] = [];
  for (const [name, parent] of BONES) {
    if (parent === null) { bones.push({ name }); continue; }
    const po = s.origin[parent] ?? [0, 0];
    const pr = s.rot[parent] ?? 0;
    const o = s.origin[name] ?? po;
    const local = unrotv(pr, [o[0] - po[0], o[1] - po[1]]);
    const b: BoneDef = name === 'muzzle'
      ? { name, parent, x: MUZZLE_LOCAL[0], y: MUZZLE_LOCAL[1], rotation: MUZZLE_ROT, length: 40 }
      : { name, parent, x: r2(local[0]), y: r2(local[1]) };
    const bov = OV.bones?.[name];
    if (bov) { if (bov.x !== undefined) b.x = r2(bov.x); if (bov.y !== undefined) b.y = r2(bov.y); }
    if (name === 'muzzle') { bones.push(b); continue; }
    const rr = (s.rot[name] ?? 0) - pr;
    if (Math.abs(rr) > 1e-9) b.rotation = r2(rr);
    const art = BONE_ART[name];
    if (art) b.length = r2(LENGTH[name] ?? 60);
    bones.push(b);
  }
  const skin: Record<string, Record<string, { image: string; x: number; y: number }>> = {};
  for (const [slot, bone, placeholders] of SLOTS) {
    skin[slot] = {};
    for (const ph of placeholders) {
      void bone;
      const anchor = overrides[ph] ?? ANCHOR[ph];
      const off = anchor ? [-anchor[0], -anchor[1]] : (ATTACH[ph] ?? [0, 0]);
      const ovs = OV.attach?.[ph];
      const extraKeys = ovs?.scaleX !== undefined ? { scaleX: r2(ovs.scaleX), scaleY: r2(ovs.scaleY ?? 1) }
        : SCALED[ph] ? { scaleX: SCALED[ph][0], scaleY: SCALED[ph][1] } : {};
      const aov = OV.attach?.[ph];
      skin[slot][ph] = { image: `${ph}.png`, x: r2(aov?.x ?? off[0]), y: r2(aov?.y ?? off[1]), ...extraKeys };
    }
  }
  return {
    spec: 'rigc-rig/1',
    name: 'spineboy-ess',
    images: '../../../../examples/spineboy/images',
    skeleton: { width: 500, height: 780, fps: 30 },
    bones,
    slots: SLOTS.map(([name, bone, , attachment]) => ({ name, bone, attachment })),
    events: { footstep: {}, shoot: {} },
    skins: { default: skin },
    ...extra,
  };
}
/** muzzle bone: at the gun's barrel mouth, aimed along the barrel. */
export const MUZZLE_LOCAL: [number, number] = [127, -138];
export const MUZZLE_ROT = -52.22;
export const LENGTH: Record<string, number> = {
  torso: 148, neck: 32, head: 150,
  'front-upper-arm': 74, 'front-bracer': 62, 'front-fist': 55,
  'rear-upper-arm': 70, 'rear-bracer': 58, gun: 150, muzzle: 40,
  'front-thigh': 96, 'front-shin': 147, 'front-foot': 90,
  'rear-thigh': 76, 'rear-shin': 143, 'rear-foot': 80,
};
/** attachment offsets, in the bone's own local frame, for art that does not
 *  define its bone's origin. Measured (goggles, mouth) or fitted (muzzle). */
export const ATTACH: Record<string, [number, number]> = {
  goggles: [7.2, 70.6],
  'eye-indifferent': [37, 60], 'eye-surprised': [37, 60],
  'mouth-grind': [21, -13], 'mouth-oooo': [21, -13], 'mouth-smile': [21, -13],
  muzzle01: [171.5, -8], muzzle02: [187, -3], muzzle03: [202.5, 1.5], muzzle04: [239, -6], muzzle05: [250, -5],
  'muzzle-ring': [120, 0], 'muzzle-glow': [40, 0],
};
/** attachment scale, where the shot draws a piece larger than its art. */
export const SCALED: Record<string, [number, number]> = {
  muzzle01: [3.981, 3.981], muzzle02: [3.6, 3.6], muzzle03: [3.294, 3.294],
  muzzle04: [3.832, 3.832], muzzle05: [3.9, 3.9],
};
function r2(v: number): number { return Math.round(v * 100) / 100; }

if (import.meta.main) {
  writeFileSync(process.argv[2] ?? 'bench/runs/2026-08-24-spineboy-3/ess/spineboy-ess.rig.json', JSON.stringify(emitRig(), null, 2) + '\n');
  if (process.env.STATIC_MOTION) writeFileSync('bench/runs/2026-08-24-spineboy-3/ess/spineboy-ess.motion.json', JSON.stringify({ spec: 'rigc-motion/1', archetype: 'spineboy-ess', cut: 'spineboy-ess', easings: {}, animations: {} }, null, 2) + '\n');
  console.log('written');
}
