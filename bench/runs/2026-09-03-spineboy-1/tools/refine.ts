/**
 * Refine the setup pose against frames drawn from EVERY shot.
 *
 * AUTHORING §8.1: every animation is measured from the setup pose, so an error
 * in it is an error in all of them — and it is exactly the error one frame cannot
 * show, because that frame's own rotations absorb it. It also states the rule
 * this file is built around: **a structural descent that holds the fitted poses
 * fixed cannot recover a mis-triangulated pivot at all**, because the poses have
 * already absorbed its error and the gradient at fixed poses points nowhere. So
 * every candidate value of every setup parameter here is scored with the affected
 * subtree's rotations **re-solved**, on a spread of frames from all eight shots.
 *
 * The two `spine-core` traps §9.1 names are both on this path and both are taken
 * literally: the setup transform lives on `bone.data.setupPose`, and a region
 * attachment's offsets are cached, so `updateSequence()` follows every write.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readViewport } from './geom.ts';
import { BONES, SLOTS, type Setup } from './rig.ts';
import { applyPose, loadPosable, refLevels, score, type PoseVec, type Posed, type RefLevel } from './fitlib.ts';
import { FROZEN, KNOBS, zeroPose } from './fit.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';

/** Frames drawn from every shot — §8.1's spread, not a sequence of single fits. */
export const SPREAD = [
  'aim/f0000',
  'idle/f0000',
  'idle/f0010',
  'walk/f0000',
  'walk/f0003',
  'walk/f0006',
  'walk/f0009',
  'run/f0002',
  'run/f0006',
  'jump/f0000',
  'jump/f0009',
  'jump/f0015',
  'shoot/f0000',
  'hit/f0000',
  'hit/f0004',
  'death/f0007',
  'death/f0030',
  'death/f0050',
];

/** Sweep-radius multiplier, so a first pass can reach further than a later one. */
const RS = Number(process.argv[4] ?? 1);
/**
 * Which parameters this pass is allowed to move.
 *
 * The trunk is measured by `tools/solve.ts` to 0.5-3 frame px off `pose`'s own
 * placements, so a composite sweep can only spend that measurement; the default
 * filter therefore holds the trunk and moves the limbs.
 */
const ONLY = new RegExp(process.argv[5] ?? '^(bone:(?!head$)|att:(?!torso$|neck$|head$|goggles$|eye|mouth))');

const CHILDREN = new Map<string, string[]>();
for (const [b, p] of BONES) {
  if (p === null) continue;
  CHILDREN.set(p, [...(CHILDREN.get(p) ?? []), b]);
}
export function subtree(bone: string): string[] {
  const out: string[] = [];
  const walk = (b: string): void => {
    out.push(b);
    for (const c of CHILDREN.get(b) ?? []) walk(c);
  };
  walk(bone);
  return out;
}

export function applySetup(p: Posed, setup: Setup): void {
  for (const [name, xy] of Object.entries(setup.bones)) {
    const bone = p.bones.get(name);
    if (!bone) continue;
    bone.data.setupPose.x = xy[0];
    bone.data.setupPose.y = xy[1];
  }
  for (const s of SLOTS) {
    const slot = p.skeleton.findSlot(s.slot);
    if (!slot) continue;
    for (const a of s.attachments) {
      const att = p.skeleton.getAttachment(slot.data.index, a) as { x: number; y: number; updateSequence(): void } | null;
      if (!att) continue;
      const xy = setup.attach[a];
      if (!xy) continue;
      att.x = xy[0];
      att.y = xy[1];
      att.updateSequence();
    }
  }
}

interface Frame {
  key: string;
  levels: RefLevel[];
  pose: PoseVec;
}

const KNOB_BY_KEY = new Map(KNOBS.map((k) => [k.key, k]));

function refitSubtree(p: Posed, f: Frame, bones: Set<string>, level: number, rounds = 2, radiusDeg = 12): number {
  const keys = KNOBS.filter(
    (k) => k.key.endsWith('.rotate') && bones.has(k.key.slice(0, -7)) && !FROZEN.has(k.key),
  ).map((k) => k.key);
  if (bones.has('torso') && !FROZEN.has('torso.x')) keys.push('torso.x', 'torso.y');
  let best = Infinity;
  for (let r = 0; r < rounds; r++) {
    for (const key of keys) {
      const k = KNOB_BY_KEY.get(key)!;
      applyPose(p, f.pose);
      best = score(p, f.levels[level]).value;
      let bestV = f.pose[key];
      const radius = key.endsWith('.rotate') ? radiusDeg : radiusDeg * 3;
      for (let i = -4; i <= 4; i++) {
        if (i === 0) continue;
        const v = Math.max(k.min, Math.min(k.max, bestV + (i * radius) / 4));
        f.pose[key] = v;
        applyPose(p, f.pose);
        const s = score(p, f.levels[level]).value;
        if (s < best) {
          best = s;
          bestV = v;
        }
      }
      f.pose[key] = bestV;
    }
  }
  applyPose(p, f.pose);
  return score(p, f.levels[level]).value;
}

interface Param {
  label: string;
  get(s: Setup): number;
  set(s: Setup, v: number): void;
  /** Bones whose rotations have to be re-solved for a change here to be readable. */
  affects: string[];
  radius: number;
}

function boneParams(): Param[] {
  const out: Param[] = [];
  for (const [b, parent] of BONES) {
    if (parent === null) continue;
    const sub = subtree(b);
    for (const axis of [0, 1] as const) {
      out.push({
        label: `bone:${b}.${axis ? 'y' : 'x'}`,
        get: (s) => s.bones[b][axis],
        set: (s, v) => {
          s.bones[b][axis] = v;
        },
        affects: sub,
        radius: (b === 'torso' ? 24 : 14) * RS,
      });
    }
  }
  return out;
}

function attachParams(): Param[] {
  const out: Param[] = [];
  for (const s of SLOTS) {
    for (const a of s.attachments) {
      if (a.startsWith('muzzle')) continue;
      const sub = subtree(s.bone);
      for (const axis of [0, 1] as const) {
        out.push({
          label: `att:${a}.${axis ? 'y' : 'x'}`,
          get: (st) => st.attach[a][axis],
          set: (st, v) => {
            st.attach[a][axis] = v;
          },
          affects: sub,
          radius: (a === 'goggles' || a.startsWith('eye') || a.startsWith('mouth') ? 40 : 18) * RS,
        });
      }
    }
  }
  return out;
}

if (import.meta.main) {
  const passes = Number(process.argv[2] ?? 2);
  const level = Number(process.argv[3] ?? 2);
  const vp = readViewport(join(REF, 'frames.json'));
  const p = loadPosable(join(ROOT, 'spine'));
  const setup: Setup = JSON.parse(readFileSync(join(ROOT, 'fit/setup.json'), 'utf8'));
  applySetup(p, setup);

  const frames: Frame[] = SPREAD.map((key) => {
    const [set, frame] = key.split('/');
    const file = join(ROOT, `fit/poses/${set.replace('@', '_at_')}.json`);
    const poses = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
    return { key, levels: refLevels(join(REF, set, `${frame}.png`), vp), pose: poses[frame] ?? zeroPose() };
  });

  const total = (): number => {
    let acc = 0;
    for (const f of frames) {
      applyPose(p, f.pose);
      acc += score(p, f.levels[level]).value;
    }
    return acc / frames.length;
  };

  const params = [...boneParams(), ...attachParams()].filter((q) => ONLY.test(q.label));
  console.log(`${params.length} parameter(s) in play, radius x${RS}`);
  for (let pass = 0; pass < passes; pass++) {
    // Seat the poses under the current setup first.
    for (const f of frames) refitSubtree(p, f, new Set(subtree('torso')), level, 3, 30);
    console.log(`pass ${pass}: seated at ${total().toFixed(3)}`);
    for (const param of params) {
      const base = param.get(setup);
      const affects = new Set(param.affects);
      const snapshot = frames.map((f) => ({ ...f.pose }));
      let best = { v: base, s: Infinity, poses: snapshot };
      for (let i = -3; i <= 3; i++) {
        const v = base + (i * param.radius) / 3;
        param.set(setup, v);
        applySetup(p, setup);
        let acc = 0;
        const poses: PoseVec[] = [];
        frames.forEach((f, n) => {
          f.pose = { ...snapshot[n] };
          acc += refitSubtree(p, f, affects, level, 1, 16);
          poses.push({ ...f.pose });
        });
        acc /= frames.length;
        if (acc < best.s) best = { v, s: acc, poses };
      }
      param.set(setup, best.v);
      applySetup(p, setup);
      frames.forEach((f, n) => {
        f.pose = best.poses[n];
      });
      if (Math.abs(best.v - base) > 1e-9) {
        console.log(`  ${param.label.padEnd(28)} ${base.toFixed(1)} -> ${best.v.toFixed(1)}   ${best.s.toFixed(3)}`);
      }
    }
    console.log(`pass ${pass}: ${total().toFixed(3)}`);
    writeFileSync(join(ROOT, 'fit/setup.json'), JSON.stringify(setup, null, 2));
    for (const key of SPREAD) {
      const [set, frame] = key.split('/');
      const file = join(ROOT, `fit/poses/${set.replace('@', '_at_')}.json`);
      const poses = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
      poses[frame] = frames.find((f) => f.key === key)!.pose;
      writeFileSync(file, JSON.stringify(poses, null, 1));
    }
  }
}
