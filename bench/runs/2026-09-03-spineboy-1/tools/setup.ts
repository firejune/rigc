/**
 * The setup pose, in the art's own pixel coordinates, and the emitter that turns
 * it into a rig spec.
 *
 * Every joint below is a point in one art file's own pixels, read off that file's
 * character map (`tools/art.ts`) — MOTION.md §3.9's first default, "the joint the
 * art draws", which is a measurement of one point rather than a solve that
 * amplifies placement noise. Two of them came off the `pose` triangulation
 * instead (`tools/joints.ts`), and are marked; the rest are refined against the
 * frames by `tools/refine.ts`, which re-solves the poses inside every pivot
 * evaluation because a descent at fixed poses cannot move a pivot at all
 * (AUTHORING §8.1).
 *
 * One art pixel is one world unit: the frames are drawn at 0.222973 px/unit and
 * `pose` places every part at 0.223 frame px per part px on a pinned window, so
 * the two agree and the rig is authored in the frames' own units.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { artSizes, SLOTS, BONES, rigSpec, type Setup } from './rig.ts';

const IMAGES = 'examples/spineboy/images';

/** Each part's own pivot — where its bone sits — in that art file's pixels, y down. */
export const OWN_PIVOT: Record<string, [number, number]> = {
  torso: [49, 168], // the pelvis: a pure gauge (absorbed by the torso's own translate)
  neck: [18, 20.5], // the part's own centre; the neck barely turns and is weakly identified
  head: [66.8, 238.6], // TRIANGULATED (pose, 64 frames, 228° of relative angle, rms 0.34 px)
  'rear-upper-arm': [16, 12],
  'rear-bracer': [12, 8],
  gun: [20, 58],
  'front-upper-arm': [18, 14],
  'front-bracer': [16, 10],
  'front-fist-closed': [14, 14],
  'front-fist-open': [14, 16],
  'rear-thigh': [16, 10],
  'rear-shin': [56, 32],
  'rear-foot': [33, 6],
  'front-thigh': [17, 14],
  'front-shin': [50, 36],
  'front-foot': [39, 10],
};

/** Where each child's bone sits, in the PARENT art's own pixels. */
export const SOCKET: Record<string, [number, number]> = {
  neck: [38.6, -21.7], // in torso.png — above its top edge; the neck part bridges the gap
  head: [18.8, 18.1], // in neck.png — TRIANGULATED
  'rear-upper-arm': [30, 42],
  'rear-bracer': [18, 76],
  gun: [26, 60],
  muzzle: [175, 190], // in gun.png, the barrel's end
  'front-upper-arm': [34, 40],
  'front-bracer': [16, 84],
  'front-fist': [28, 66],
  'rear-thigh': [34, 150],
  'rear-shin': [28, 88],
  'rear-foot': [26, 126],
  'front-thigh': [42, 150],
  'front-shin': [20, 100],
  'front-foot': [28, 130],
};

/**
 * Parts whose slot hangs off a bone they do not pivot — offsets straight in world
 * units relative to that bone, y up. The face pieces ride the head; the flare
 * pieces ride the muzzle.
 */
export const RIDER: Record<string, [number, number]> = {
  goggles: [61, -49],
  'eye-indifferent': [96, -66],
  'eye-surprised': [96, -66],
  'mouth-grind': [126, -110],
  'mouth-oooo': [126, -110],
  'mouth-smile': [126, -110],
  muzzle01: [40, 0],
  muzzle02: [40, 0],
  muzzle03: [40, 0],
  muzzle04: [40, 0],
  muzzle05: [40, 0],
  'muzzle-glow': [0, 0],
  'muzzle-ring': [0, 0],
};

/** The bone `torso` sits here in root's space: the standing pelvis, from `pose`. */
export const TORSO_SETUP: [number, number] = [-28.4, 215.5];

export function buildSetup(): Setup {
  const sizes = artSizes(IMAGES);
  const attach: Record<string, [number, number]> = {};
  for (const s of SLOTS) {
    for (const a of s.attachments) {
      if (RIDER[a]) {
        attach[a] = RIDER[a];
        continue;
      }
      const [w, h] = sizes.get(a)!;
      const [pu, pv] = OWN_PIVOT[a] ?? [w / 2, h / 2];
      attach[a] = [w / 2 - pu, pv - h / 2];
    }
  }
  const bones: Record<string, [number, number]> = {};
  for (const [child, parent] of BONES) {
    if (parent === null) continue;
    if (parent === 'root') {
      bones[child] = TORSO_SETUP;
      continue;
    }
    const socket = SOCKET[child];
    // The parent art is the parent bone's own art file — the placeholder that
    // shares its name, which is how §10.1's naming rule is used here.
    const parentPivot = OWN_PIVOT[parent] ?? OWN_PIVOT[`${parent}-closed`];
    if (!socket || !parentPivot) throw new Error(`no socket or parent pivot for ${child} under ${parent}`);
    bones[child] = [socket[0] - parentPivot[0], parentPivot[1] - socket[1]];
  }
  return { bones, attach };
}

if (import.meta.main) {
  const dest = process.argv[2] ?? 'bench/runs/2026-09-03-spineboy-1/fit/setup.json';
  const setup = existsSync(dest) && process.argv[3] === '--keep' ? JSON.parse(readFileSync(dest, 'utf8')) : buildSetup();
  writeFileSync(dest, JSON.stringify(setup, null, 2));
  const spec = rigSpec(setup, {
    name: 'spineboy-ess',
    images: '../../../../examples/spineboy/images',
    skeleton: { x: -800, y: -140, width: 1730, height: 1650 },
  });
  const rigPath = process.argv[4] ?? 'bench/runs/2026-09-03-spineboy-1/spineboy-ess.rig.json';
  writeFileSync(rigPath, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`setup -> ${dest}\nrig   -> ${rigPath}`);
}
