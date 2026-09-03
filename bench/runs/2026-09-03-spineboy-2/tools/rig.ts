/**
 * Emit `spineboy-ess.rig.json` from `tools/skeleton.ts`'s joint table.
 *
 * Two things are read out of the frames rather than the art:
 *
 *  - the trunk's world position, from the pelvis point carried through
 *    `pose`'s `torso` placement on the setup frame into the sidecar's own world
 *    box, so the candidate is authored in the FRAMES' own coordinates and
 *    `check` can take the declared box (AUTHORING §9, the `declared` line);
 *  - the face slots' offsets, from `pose`'s placements of `goggles` and the
 *    mouth on the same frame, relative to the `head` placement there.
 *
 * Everything else is the art's own geometry, so it does not depend on any one
 * frame — which is §8.1's reason for preferring an art-side reading: "the
 * shot's own extremes are a measurement, while segment lengths taken off a
 * folded pose are an estimate".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { geometryOf } from './art';
import { declaredViewport, frameToWorld, sidecarOf } from './geom';
import { BONE_ORDER, JOINTS, PARENTS, SLOTS } from './skeleton';

const REF = process.env.REF ?? 'bench/reference/spineboy/ess';
const PARTS = process.env.PARTS ?? '/tmp/sb2/ess-parts';
const POSE = process.env.SETUP_POSE ?? '/tmp/sb2/pose/idle-f0000.json';
const OUT = process.argv[2] ?? 'bench/runs/2026-09-03-spineboy-2/spineboy-ess.rig.json';
const SHOULDERS = process.env.SHOULDERS ?? '';

const sidecar = sidecarOf(REF);
const view = declaredViewport(sidecar);
const poseReport = JSON.parse(readFileSync(POSE, 'utf8'));

if (SHOULDERS) {
  const swept = JSON.parse(readFileSync(SHOULDERS, 'utf8')) as Record<string, [number, number]>;
  for (const [child, at] of Object.entries(swept)) {
    if (JOINTS.torso.children) JOINTS.torso.children[child] = at;
  }
}

const placementOf = (part: string): { x: number; y: number; rotationDeg: number; scale: number } => {
  const entry = poseReport.parts.find((p: { part: string }) => p.part === `${part}.png`);
  if (!entry?.placement) throw new Error(`no placement for ${part} in ${POSE}`);
  return entry.placement;
};

const geo = new Map<string, ReturnType<typeof geometryOf>>();
const geometry = (part: string) => {
  let g = geo.get(part);
  if (!g) {
    g = geometryOf(join(PARTS, `${part}.png`), part);
    geo.set(part, g);
  }
  return g;
};

const RAD = Math.PI / 180;

/** A part-image point through a `pose` placement, into Spine world. */
function partPointToWorld(part: string, px: number, py: number): [number, number] {
  const p = placementOf(part);
  const g = geometry(part);
  const t = p.rotationDeg * RAD;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const dx = px - g.width / 2;
  const dy = py - g.height / 2;
  return frameToWorld(view, p.x + p.scale * (c * dx - s * dy), p.y + p.scale * (s * dx + c * dy));
}

// --- the trunk's world position -------------------------------------------
const [pelvisX, pelvisY] = partPointToWorld('torso', JOINTS.torso.pivot[0], JOINTS.torso.pivot[1]);

// --- the bones -------------------------------------------------------------
interface BoneOut {
  name: string;
  parent?: string;
  x?: number;
  y?: number;
  length?: number;
}
const bones: BoneOut[] = [{ name: 'root' }];
const round = (v: number) => Number(v.toFixed(2));

for (const name of BONE_ORDER) {
  if (name === 'root') continue;
  const parent = PARENTS[name];
  if (name === 'torso') {
    bones.push({ name, parent, x: round(pelvisX), y: round(pelvisY) });
    continue;
  }
  const parentJoints = JOINTS[parent];
  const at = parentJoints?.children?.[name];
  if (!at) throw new Error(`no child joint for ${name} under ${parent}`);
  // The child's pivot, in the parent's art pixels, relative to the parent's own
  // pivot — and y flipped once, MOTION.md §6.3.
  const [pjx, pjy] = parentJoints.pivot;
  let dx = at[0] - pjx;
  let dy = pjy - at[1];
  // LIMB_SHORTEN pulls every LINK's far joint toward its own pivot by this
  // fraction, keeping the direction. It exists because a cap centroid sits at
  // the plate's rounded TIP while the joint two plates share sits inside the
  // overlap: assembled straight from the caps, this rig's hip-to-sole reach is
  // 308 units where `check --frames …/idle`'s `in units` line puts the whole
  // standing figure's height at 648.7 against this candidate's 727.9. The
  // factor is chosen by measurement, not by argument — `tools/reach.ts`.
  const shorten = Number(process.env.LIMB_SHORTEN ?? 0);
  // The muzzle offset is the BARREL, a plate dimension rather than an overlap.
  if (shorten > 0 && parent !== 'root' && parent !== 'torso' && name !== 'muzzle') {
    dx *= 1 - shorten;
    dy *= 1 - shorten;
  }
  bones.push({ name, parent, x: round(dx), y: round(dy) });
}

// The structural corrections `tools/setupfit.ts` settled against the spread,
// baked into the bones they belong to. A bone's local x/y IS its joint, so a
// `tx`/`ty` from that sweep and a joint offset are the same number.
if (process.env.STRUCTURE) {
  const structure = JSON.parse(readFileSync(process.env.STRUCTURE, 'utf8')) as { structure: Record<string, number> };
  for (const [key, value] of Object.entries(structure.structure)) {
    const [boneName, kind] = [key.slice(0, key.lastIndexOf('.')), key.slice(key.lastIndexOf('.') + 1)];
    const bone = bones.find((b) => b.name === boneName);
    if (!bone || (kind !== 'tx' && kind !== 'ty')) continue;
    if (kind === 'tx') bone.x = round((bone.x ?? 0) + value);
    else bone.y = round((bone.y ?? 0) + value);
  }
}

// bone `length`: the distance to the single child, where there is exactly one.
// Cosmetic in a renderer, part of a faithful reproduction (§3.2).
for (const bone of bones) {
  // Not `root`: its single child is the trunk, and a length there would be a
  // claim about a bone that points at nothing.
  if (bone.name === 'root') continue;
  const kids = Object.entries(PARENTS).filter(([, p]) => p === bone.name);
  if (kids.length !== 1) continue;
  const child = bones.find((b) => b.name === kids[0][0]);
  if (!child || child.x === undefined || child.y === undefined) continue;
  const len = Math.hypot(child.x, child.y);
  if (len > 0.5) bone.length = round(len);
}

// --- the slots and the skin ------------------------------------------------
interface AttachmentOut {
  image: string;
  x?: number;
  y?: number;
  rotation?: number;
}
const slots: { name: string; bone: string; attachment: string | null }[] = [];
const skin: Record<string, Record<string, AttachmentOut>> = {};

// The head bone's world rotation and pivot on the setup frame, for the face
// slots' offsets.
const headPlacement = placementOf('head');
const headWorldRot = -headPlacement.rotationDeg; // screenToSpineDegrees
const headJoint = JOINTS.head.pivot;
const [headPivotWX, headPivotWY] = partPointToWorld('head', headJoint[0], headJoint[1]);

/** A world point into a bone's local axes, given that bone's world rotation. */
function intoLocal(wx: number, wy: number, originX: number, originY: number, worldRotDeg: number): [number, number] {
  const t = -worldRotDeg * RAD;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const dx = wx - originX;
  const dy = wy - originY;
  return [c * dx - s * dy, s * dx + c * dy];
}

for (const plan of SLOTS) {
  slots.push({ name: plan.slot, bone: plan.bone, attachment: plan.setup });
  skin[plan.slot] = {};
  for (const [placeholder, image] of Object.entries(plan.attachments)) {
    const part = image.replace(/\.png$/, '');
    const g = geometry(part);
    let x: number;
    let y: number;
    let rotation = 0;
    const boneJoints = JOINTS[plan.bone];
    if (boneJoints && boneJoints.part === part) {
      // This slot's art IS the part the bone's pivot was read from.
      x = g.width / 2 - boneJoints.pivot[0];
      y = boneJoints.pivot[1] - g.height / 2;
    } else if (plan.pivotIn?.[placeholder]) {
      const [jx, jy] = plan.pivotIn[placeholder];
      x = g.width / 2 - jx;
      y = jy - g.height / 2;
    } else if (plan.bone === 'head') {
      // A face slot: read off the setup frame, relative to `head`'s own
      // placement there, so the goggles sit where the frame puts them.
      const [wx, wy] = partPointToWorld(part, g.width / 2, g.height / 2);
      [x, y] = intoLocal(wx, wy, headPivotWX, headPivotWY, headWorldRot);
      const own = placementOf(part);
      rotation = -own.rotationDeg - headWorldRot;
    } else {
      throw new Error(`no offset rule for ${plan.slot}/${placeholder}`);
    }
    const out: AttachmentOut = { image, x: round(x), y: round(y) };
    if (Math.abs(rotation) > 0.25) out.rotation = round(rotation);
    skin[plan.slot][placeholder] = out;
  }
}

// The eye is a prior: concentric with the goggles, which cover it on every
// frame of the reference (the brief measures this).
const goggles = skin.goggles.goggles;
for (const eye of Object.keys(skin.eye)) {
  skin.eye[eye] = { image: skin.eye[eye].image, x: goggles.x, y: goggles.y, ...(goggles.rotation ? { rotation: goggles.rotation } : {}) };
}

const rig = {
  spec: 'rigc-rig/1',
  name: 'spineboy-ess',
  images: 'images',
  // Nothing in the scoring reads the skeleton header (the brief says so); this
  // box comfortably contains every shot's world extent.
  skeleton: { x: -820, y: -160, width: 1760, height: 1680 },
  bones,
  slots,
  skins: { default: skin },
};

writeFileSync(OUT, `${JSON.stringify(rig, null, 2)}\n`);
process.stderr.write(
  `wrote ${OUT}\n  pelvis world (${pelvisX.toFixed(2)}, ${pelvisY.toFixed(2)})\n` +
    `  ${bones.length} bones, ${slots.length} slots, ` +
    `${Object.values(skin).reduce((n, s) => n + Object.keys(s).length, 0)} attachments\n`,
);
