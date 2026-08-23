/**
 * Write the rig spec from the model and the fitted setup pose.
 *
 *   bun … tools/emitrig.ts <setup.json> <out.rig.json>
 */
import { writeFileSync } from 'node:fs';
import { build } from './skel.ts';
import { TREE, DRAW_ORDER, ALTERNATIVES, MUZZLE_SCALE, MUZZLE_OFFSETS, JOINTS, loadSetup } from './model.ts';
import { art, quadOf, DEG, type Placement } from './lib.ts';

const [setupFile, out] = process.argv.slice(2);
const setup = await loadSetup(setupFile);
const drawn = DRAW_ORDER.filter((d) => setup.some((p) => p.part === d));
const s = build(TREE, setup, drawn);

const round = (n: number) => +n.toFixed(4);

// --- the muzzle attachments: placed off the barrel's own bead, at the size the
// --- flare is measured to be drawn (model.ts MUZZLE_SCALE).
const muzzleBone = s.bones.find((b) => b.name === 'muzzle')!;
const muzzleAttachments: Record<string, Record<string, number | string>> = {};
for (const name of ALTERNATIVES.muzzle) {
  const [ox, oy] = MUZZLE_OFFSETS[name];
  muzzleAttachments[name] = {
    image: `${name}.png`,
    x: round(ox),
    y: round(oy),
    rotation: 0,
    scaleX: MUZZLE_SCALE,
    scaleY: MUZZLE_SCALE,
  };
}

// --- the hit region: the head's own silhouette, as a polygon in the head bone's
// --- frame. Nothing draws it, so the frames can neither confirm nor deny it
// --- (brief §3); what they do give is where the head is, and that is what it is
// --- built from.
function headHull(placement: Placement, boneWorldRot: number, joint: [number, number]): number[] {
  const plate = art('head');
  const pts: [number, number][] = [];
  const step = 360 / 8;
  const cx = plate.width / 2;
  const cy = plate.height / 2;
  for (let a = 0; a < 360; a += step) {
    // walk in from far away along this ray until the art is opaque
    let hit: [number, number] | null = null;
    const dx = Math.cos(a * DEG);
    const dy = -Math.sin(a * DEG);
    for (let r = Math.max(plate.width, plate.height); r > 0; r -= 1) {
      const px = Math.round(cx + dx * r);
      const py = Math.round(cy + dy * r);
      if (px < 0 || py < 0 || px >= plate.width || py >= plate.height) continue;
      if (plate.data[(py * plate.width + px) * 4 + 3] > 120) {
        hit = [px - cx, cy - py];
        break;
      }
    }
    if (hit) pts.push(hit);
  }
  // art-local → world → bone-local
  const c = Math.cos(placement.rot * DEG);
  const sn = Math.sin(placement.rot * DEG);
  const cb = Math.cos(-boneWorldRot * DEG);
  const sb = Math.sin(-boneWorldRot * DEG);
  const out: number[] = [];
  for (const [x, y] of pts) {
    const wx = placement.cx + x * c - y * sn;
    const wy = placement.cy + x * sn + y * c;
    const ox = wx - joint[0];
    const oy = wy - joint[1];
    out.push(round(ox * cb - oy * sb), round(ox * sb + oy * cb));
  }
  return out;
}

const headPlacement = setup.find((p) => p.part === 'head')!;
const headBone = s.bones.find((b) => b.name === 'head')!;
const hull = headHull(headPlacement, headBone.world, JOINTS.head);

// --- the setup-pose bounding box, over the quads the setup pose actually draws
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const p of setup) {
  const q = quadOf({ ...p, sx: 1, sy: 1 });
  for (let i = 0; i < q.world.length; i += 2) {
    minX = Math.min(minX, q.world[i]);
    maxX = Math.max(maxX, q.world[i]);
    minY = Math.min(minY, q.world[i + 1]);
    maxY = Math.max(maxY, q.world[i + 1]);
  }
}

const skin: Record<string, Record<string, Record<string, unknown>>> = {};
for (const a of s.attachments) {
  const alts = ALTERNATIVES[a.slot];
  const entries: Record<string, Record<string, unknown>> = {};
  for (const name of alts ?? [a.image]) {
    // an alternative shares its slot's placement: they are the same part drawn
    // differently, and the editor's own reason for a shared slot (§10.1) is
    // exactly that only one of them is ever up
    entries[name] = { image: `${name}.png`, x: round(a.x), y: round(a.y), rotation: round(a.rotation) };
  }
  skin[a.slot] = entries;
}
skin.muzzle = muzzleAttachments;
skin['head-bb'] = { 'head-bb': { type: 'boundingbox', vertexCount: hull.length / 2, vertices: hull, color: 'ce3a3aff' } };

const setupAttachment: Record<string, string | null> = {
  eye: 'eye-indifferent',
  mouth: 'mouth-smile',
  'front-fist': 'front-fist-open',
  muzzle: null,
  'head-bb': 'head-bb',
};

const rig = {
  spec: 'rigc-rig/1',
  name: 'spineboy-ess',
  images: 'images',
  skeleton: {
    x: round(minX),
    y: round(minY),
    width: round(maxX - minX),
    height: round(maxY - minY),
  },
  bones: s.bones.map((b) => ({
    name: b.name,
    ...(b.parent ? { parent: b.parent } : {}),
    ...(b.length > 0.5 ? { length: round(b.length) } : {}),
    x: round(b.x),
    y: round(b.y),
    ...(Math.abs(b.rotation) > 1e-6 ? { rotation: round(b.rotation) } : {}),
  })),
  slots: DRAW_ORDER.map((name) => ({
    name,
    bone: TREE.binding[name],
    attachment: name in setupAttachment ? setupAttachment[name] : name,
  })),
  skins: { default: skin },
  events: {
    footstep: {},
    gunshot: {},
  },
};

writeFileSync(out, JSON.stringify(rig, null, 2));
console.log(`wrote ${out}: ${rig.bones.length} bones, ${rig.slots.length} slots, ${Object.values(skin).reduce((n, e) => n + Object.keys(e).length, 0)} attachments`);
