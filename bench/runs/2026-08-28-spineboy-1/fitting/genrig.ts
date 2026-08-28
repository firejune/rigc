/**
 * Generate the ess rig spec from measured joint/part poses (idle/f0000 = setup pose).
 * World units: the frames' own (frames.json viewport; 1 art px = 1 world unit,
 * confirmed by template matches at scale 1 landing on the brief's own figures).
 * Frame px -> world: wx = vx + px/scale ; wy = vy + (pixelHeight - py)/scale.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sidecar, RUN } from './lib.ts';

const v = sidecar().viewport;
export const W = (px: number) => v.x + px / v.scale;
export const H = (py: number) => v.y + (v.pixelHeight - py) / v.scale;
export const toPx = (wx: number) => (wx - v.x) * v.scale;
export const toPy = (wy: number) => v.pixelHeight - (wy - v.y) * v.scale;

// ---- joints in idle/f0000 image px (from zoom reading + matches) ----
const J = {
  hip: [180, 292],
  neckBase: [186, 252],
  headBase: [187, 246],
  frontShoulder: [158, 264],
  frontElbow: [153, 272],
  frontWrist: [152, 281],
  rearShoulder: [175, 262],
  rearElbow: [183, 275],
  rearWrist: [190, 277],
  frontHipJ: [172, 290],
  frontKnee: [156, 301],
  frontAnkle: [160, 323],
  frontToe: [176, 331],
  rearHipJ: [186, 289],
  rearKnee: [196, 302],
  rearAnkle: [198, 324],
  rearToe: [216, 330],
} as const;
const jw: Record<string, [number, number]> = {};
for (const [k, [px, py]] of Object.entries(J)) jw[k] = [W(px), H(py)];

// gun pivot & muzzle from the gun match on idle (centre img (212,282), world rot 30deg)
// art 210x203, grip pivot at art (35,65), muzzle tip at art (190,180)
function artOffsetWorld(art: [number, number], size: [number, number], phiDeg: number): [number, number] {
  const [u, vv] = art;
  const [aw, ah] = size;
  const lx = u - aw / 2, ly = ah / 2 - vv;
  const r = (phiDeg * Math.PI) / 180;
  return [lx * Math.cos(r) - ly * Math.sin(r), lx * Math.sin(r) + ly * Math.cos(r)];
}
const gunCentre: [number, number] = [W(212), H(282)];
const gunPhi = 30;
const gunPivotOff = artOffsetWorld([35, 65], [210, 203], gunPhi);
const gunPivot: [number, number] = [gunCentre[0] + gunPivotOff[0], gunCentre[1] + gunPivotOff[1]];
const muzzleOff = artOffsetWorld([190, 180], [210, 203], gunPhi);
const muzzleTip: [number, number] = [gunCentre[0] + muzzleOff[0], gunCentre[1] + muzzleOff[1]];

// ---- bone tree: [name, parent, origin, pointsAt|null] ----
type BoneDef = { name: string; parent: string | null; origin: [number, number]; at?: [number, number]; rot?: number };
const bones: BoneDef[] = [
  { name: 'root', parent: null, origin: [0, 0], rot: 0 },
  { name: 'hip', parent: 'root', origin: jw.hip, rot: 0 },
  { name: 'torso', parent: 'hip', origin: jw.hip, at: jw.neckBase },
  { name: 'neck', parent: 'torso', origin: jw.neckBase, at: jw.headBase },
  { name: 'head', parent: 'neck', origin: jw.headBase, rot: 85 },
  { name: 'front-upper-arm', parent: 'torso', origin: jw.frontShoulder, at: jw.frontElbow },
  { name: 'front-bracer', parent: 'front-upper-arm', origin: jw.frontElbow, at: jw.frontWrist },
  { name: 'front-fist', parent: 'front-bracer', origin: jw.frontWrist, rot: -90 },
  { name: 'rear-upper-arm', parent: 'torso', origin: jw.rearShoulder, at: jw.rearElbow },
  { name: 'rear-bracer', parent: 'rear-upper-arm', origin: jw.rearElbow, at: jw.rearWrist },
  { name: 'gun', parent: 'rear-bracer', origin: gunPivot, rot: gunPhi },
  { name: 'muzzle', parent: 'gun', origin: muzzleTip, rot: 0 },
  { name: 'front-thigh', parent: 'hip', origin: jw.frontHipJ, at: jw.frontKnee },
  { name: 'front-shin', parent: 'front-thigh', origin: jw.frontKnee, at: jw.frontAnkle },
  { name: 'front-foot', parent: 'front-shin', origin: jw.frontAnkle, at: jw.frontToe },
  { name: 'rear-thigh', parent: 'hip', origin: jw.rearHipJ, at: jw.rearKnee },
  { name: 'rear-shin', parent: 'rear-thigh', origin: jw.rearKnee, at: jw.rearAnkle },
  { name: 'rear-foot', parent: 'rear-shin', origin: jw.rearAnkle, at: jw.rearToe },
];

// world rot + length per bone
const worldRot = new Map<string, number>();
const worldPos = new Map<string, [number, number]>();
const lengths = new Map<string, number>();
for (const b of bones) {
  worldPos.set(b.name, b.origin);
  if (b.at) {
    const dx = b.at[0] - b.origin[0], dy = b.at[1] - b.origin[1];
    worldRot.set(b.name, (Math.atan2(dy, dx) * 180) / Math.PI);
    lengths.set(b.name, Math.hypot(dx, dy));
  } else {
    worldRot.set(b.name, b.rot ?? 0);
  }
}
// give leaf bones with art a nominal length along their axis
lengths.set('head', 180);
lengths.set('front-fist', 30);
lengths.set('gun', 150);
lengths.set('hip', 0);

// ---- parts: attachment placements (world centre in img px + world rotation) ----
// matched on idle/f0000 unless noted; geometric guesses marked ~
type PartDef = {
  slot: string; bone: string; placeholders: { name: string; centre: [number, number]; phi: number; scale?: number }[];
  setup: string | null;
};
const parts: PartDef[] = [
  { slot: 'rear-upper-arm', bone: 'rear-upper-arm', setup: 'rear-upper-arm',
    placeholders: [{ name: 'rear-upper-arm', centre: [179, 269], phi: -58 }] }, // ~ hidden in idle
  { slot: 'rear-bracer', bone: 'rear-bracer', setup: 'rear-bracer',
    placeholders: [{ name: 'rear-bracer', centre: [186.5, 276], phi: -60 }] }, // ~ hidden in idle
  { slot: 'rear-thigh', bone: 'rear-thigh', setup: 'rear-thigh',
    placeholders: [{ name: 'rear-thigh', centre: [191, 295.5], phi: -20 }] }, // ~ mostly under jacket
  { slot: 'rear-shin', bone: 'rear-shin', setup: 'rear-shin',
    placeholders: [{ name: 'rear-shin', centre: [192, 313], phi: 7.5 }] },
  { slot: 'rear-foot', bone: 'rear-foot', setup: 'rear-foot',
    placeholders: [{ name: 'rear-foot', centre: [200, 329], phi: -5 }] },
  { slot: 'neck', bone: 'neck', setup: 'neck',
    placeholders: [{ name: 'neck', centre: [185, 249], phi: 10 }] }, // ~ hidden behind head/torso
  { slot: 'torso', bone: 'torso', setup: 'torso',
    placeholders: [{ name: 'torso', centre: [172, 270], phi: -7.5 }] },
  { slot: 'gun', bone: 'gun', setup: 'gun',
    placeholders: [{ name: 'gun', centre: [212, 282], phi: 30 }] },
  { slot: 'muzzle-ring', bone: 'muzzle', setup: null,
    placeholders: [{ name: 'muzzle-ring', centre: [237, 288], phi: 0 }] },
  { slot: 'muzzle-glow', bone: 'muzzle', setup: null,
    placeholders: [{ name: 'muzzle-glow', centre: [237, 288], phi: 0 }] },
  { slot: 'muzzle', bone: 'muzzle', setup: null,
    placeholders: [
      { name: 'muzzle01', centre: [252, 288], phi: 0 },
      { name: 'muzzle02', centre: [252, 288], phi: 0 },
      { name: 'muzzle03', centre: [252, 288], phi: 0 },
      { name: 'muzzle04', centre: [252, 288], phi: 0 },
      { name: 'muzzle05', centre: [252, 288], phi: 0 },
    ] },
  { slot: 'head', bone: 'head', setup: 'head',
    placeholders: [{ name: 'head', centre: [188, 224], phi: 2.5 }] },
  { slot: 'eye', bone: 'head', setup: 'eye-indifferent',
    placeholders: [
      { name: 'eye-indifferent', centre: [199, 231], phi: 2.5, scale: 0.6 },
      { name: 'eye-surprised', centre: [199, 231], phi: 2.5, scale: 0.6 },
    ] },
  { slot: 'goggles', bone: 'head', setup: 'goggles',
    placeholders: [{ name: 'goggles', centre: [184, 230], phi: 2.5 }] },
  { slot: 'mouth', bone: 'head', setup: 'mouth-smile',
    placeholders: [
      { name: 'mouth-smile', centre: [193, 249], phi: 2.5, scale: 0.4 },
      { name: 'mouth-grind', centre: [193, 249], phi: 2.5, scale: 0.4 },
      { name: 'mouth-oooo', centre: [193, 249], phi: 2.5, scale: 0.4 },
    ] },
  { slot: 'front-thigh', bone: 'front-thigh', setup: 'front-thigh',
    placeholders: [{ name: 'front-thigh', centre: [163, 295], phi: 20 }] }, // ~ under jacket
  { slot: 'front-shin', bone: 'front-shin', setup: 'front-shin',
    placeholders: [{ name: 'front-shin', centre: [162, 313], phi: -20 }] },
  { slot: 'front-foot', bone: 'front-foot', setup: 'front-foot',
    placeholders: [{ name: 'front-foot', centre: [162, 327], phi: -10 }] },
  { slot: 'front-upper-arm', bone: 'front-upper-arm', setup: 'front-upper-arm',
    placeholders: [{ name: 'front-upper-arm', centre: [156, 267], phi: -15 }] },
  { slot: 'front-bracer', bone: 'front-bracer', setup: 'front-bracer',
    placeholders: [{ name: 'front-bracer', centre: [153, 275], phi: -20 }] },
  { slot: 'front-fist', bone: 'front-fist', setup: 'front-fist-open',
    placeholders: [
      { name: 'front-fist-open', centre: [154, 285], phi: -40 },
      { name: 'front-fist-closed', centre: [154, 285], phi: -40 },
    ] },
];

// ---- emit rig spec ----
function localOf(bone: string, wpt: [number, number]): [number, number] {
  // parent chain: compute bone world transform (rotation + position), invert
  const rot = (worldRot.get(bone)! * Math.PI) / 180;
  const [ox, oy] = worldPos.get(bone)!;
  const dx = wpt[0] - ox, dy = wpt[1] - oy;
  return [dx * Math.cos(-rot) - dy * Math.sin(-rot), dx * Math.sin(-rot) + dy * Math.cos(-rot)];
}

const rigBones = bones.map((b) => {
  const out: Record<string, unknown> = { name: b.name };
  if (b.parent) out.parent = b.parent;
  if (b.parent) {
    const p = b.parent;
    const loc = localOf(p, b.origin);
    out.x = +loc[0].toFixed(2);
    out.y = +loc[1].toFixed(2);
    out.rotation = +(worldRot.get(b.name)! - worldRot.get(p)!).toFixed(2);
  } else {
    out.x = 0; out.y = 0; out.rotation = 0;
  }
  const len = lengths.get(b.name);
  if (len !== undefined && len > 0) out.length = +len.toFixed(2);
  return out;
});

const rigSlots = parts.map((p) => ({ name: p.slot, bone: p.bone, attachment: p.setup }));

// fitted attachment locals, if a fit stage has produced them
const fitPath = join(RUN, 'fitting/setup-fit.json');
const fitted: Record<string, Record<string, { x: number; y: number; rotation: number; scaleX?: number }>> =
  existsSync(fitPath) ? JSON.parse(readFileSync(fitPath, 'utf8')) : {};

const skin: Record<string, Record<string, Record<string, unknown>>> = {};
for (const p of parts) {
  skin[p.slot] = {};
  for (const ph of p.placeholders) {
    const cw: [number, number] = [W(ph.centre[0]), H(ph.centre[1])];
    const loc = localOf(p.bone, cw);
    const att: Record<string, unknown> = {
      image: ph.name + '.png',
      x: +loc[0].toFixed(2),
      y: +loc[1].toFixed(2),
      rotation: +(ph.phi - worldRot.get(p.bone)!).toFixed(2),
    };
    if (ph.scale) { att.scaleX = ph.scale; att.scaleY = ph.scale; }
    const f = fitted[p.slot]?.[ph.name];
    if (f) {
      att.x = f.x; att.y = f.y; att.rotation = f.rotation;
      if (f.scaleX) { att.scaleX = f.scaleX; att.scaleY = f.scaleX; }
    } else if (fitted[p.slot]) {
      // sibling placeholder of a fitted one (alternate fist/mouth/eye/muzzle art):
      // inherit the fitted transform of its sibling so alternatives stay co-located
      const sib = Object.values(fitted[p.slot])[0];
      if (sib) {
        att.x = sib.x; att.y = sib.y; att.rotation = sib.rotation;
        if (sib.scaleX) { att.scaleX = sib.scaleX; att.scaleY = sib.scaleX; }
      }
    }
    skin[p.slot][ph.name] = att;
  }
}

// overlay a whole-skeleton fit (stage C) verbatim, when present
const skelFitPath = join(RUN, 'fitting/skeleton-fit.json');
if (existsSync(skelFitPath)) {
  const sf = JSON.parse(readFileSync(skelFitPath, 'utf8')) as {
    bones: Record<string, { x: number; y: number; rotation: number }>;
    attachments: Record<string, Record<string, { x: number; y: number; rotation: number; scaleX: number; scaleY: number }>>;
  };
  for (const b of rigBones) {
    const f = sf.bones[b.name as string];
    if (f && b.name !== 'root') { b.x = f.x; b.y = f.y; b.rotation = f.rotation; }
  }
  for (const [slotName, atts] of Object.entries(sf.attachments)) {
    for (const [attName, f] of Object.entries(atts)) {
      const att = skin[slotName]?.[attName];
      if (!att) continue;
      att.x = f.x; att.y = f.y; att.rotation = f.rotation;
      if (Math.abs(f.scaleX - 1) > 1e-6) { att.scaleX = f.scaleX; att.scaleY = f.scaleY; }
      else { delete att.scaleX; delete att.scaleY; }
    }
  }
}

const rig = {
  spec: 'rigc-rig/1',
  name: 'spineboy-ess',
  images: '../../../../examples/spineboy/images',
  skeleton: { x: -796, y: -139, width: 1723, height: 1646 },
  bones: rigBones,
  slots: rigSlots,
  skins: { default: skin },
  events: { footstep: {}, shoot: {} },
};

const out = join(RUN, 'ess/spineboy-ess.rig.json');
writeFileSync(out, JSON.stringify(rig, null, 2) + '\n');
console.log('wrote', out);
// world transform table for the fitter
writeFileSync(join(RUN, 'fitting/bones-world.json'), JSON.stringify({
  worldRot: Object.fromEntries(worldRot), worldPos: Object.fromEntries(worldPos),
}, null, 2));
