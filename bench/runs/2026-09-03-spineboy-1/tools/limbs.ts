/**
 * Limb geometry, searched with the poses re-solved from scratch each time.
 *
 * 🚨 AUTHORING §8.1's reach check, from the other side. The leg chain read off
 * the art measured **250 units** hip-to-ankle while the frames put the stance's
 * pelvis **215 units** above the floor — so a straight leg overshoots the floor
 * and every per-frame fit "absorbs the deficit by rotating the parts it does
 * have": the fitted stance splayed a leg sideways and reported an ordinary
 * residual. §8.1 says that is invisible to every per-frame fit and that the check
 * is arithmetic, before the fitting budget is spent. This is the repair: sweep
 * the chain's own lengths and sockets, and inside every candidate **re-scan each
 * limb rotation across its whole range** rather than line-searching from where it
 * sat, because the incumbent pose was fitted to the wrong chain and a local refit
 * only re-absorbs the error.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readViewport } from './geom.ts';
import { type Setup } from './rig.ts';
import { applyPose, loadPosable, refLevels, score, type PoseVec, type Posed, type RefLevel } from './fitlib.ts';
import { FROZEN, KNOBS, zeroPose } from './fit.ts';
import { applySetup, subtree } from './refine.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';

const SPREAD = [
  'idle/f0000',
  'idle/f0010',
  'walk/f0000',
  'walk/f0004',
  'walk/f0006',
  'walk/f0010',
  'run/f0002',
  'run/f0006',
  'jump/f0000',
  'jump/f0009',
  'aim/f0000',
  'shoot/f0003',
  'hit/f0000',
  'death/f0007',
  'death/f0030',
];

const KNOB_BY_KEY = new Map(KNOBS.map((k) => [k.key, k]));

interface Frame {
  key: string;
  levels: RefLevel[];
  pose: PoseVec;
}

/** Re-solve a subtree's rotations from scratch: whole-range scan, then refine. */
function resolveSubtree(p: Posed, f: Frame, bones: Set<string>, coarse = 1, fine = 2): number {
  const keys = KNOBS.filter(
    (k) => k.key.endsWith('.rotate') && bones.has(k.key.slice(0, -7)) && !FROZEN.has(k.key),
  ).map((k) => k.key);
  if (bones.has('torso') && !FROZEN.has('torso.x')) keys.unshift('torso.x', 'torso.y');
  const evalAt = (level: number): number => {
    applyPose(p, f.pose);
    return score(p, f.levels[level]).value;
  };
  for (const key of keys) {
    const k = KNOB_BY_KEY.get(key)!;
    let best = evalAt(coarse);
    let bestV = f.pose[key];
    const samples = key.endsWith('.rotate') ? 30 : 16;
    for (let i = 0; i <= samples; i++) {
      f.pose[key] = k.min + ((k.max - k.min) * i) / samples;
      const s = evalAt(coarse);
      if (s < best) {
        best = s;
        bestV = f.pose[key];
      }
    }
    f.pose[key] = bestV;
  }
  for (const level of [coarse, fine]) {
    for (let round = 0; round < 2; round++) {
      for (const key of keys) {
        const k = KNOB_BY_KEY.get(key)!;
        let best = evalAt(level);
        let bestV = f.pose[key];
        const radius = key.endsWith('.rotate') ? (level === coarse ? 12 : 4) : level === coarse ? 40 : 12;
        for (let i = -4; i <= 4; i++) {
          if (i === 0) continue;
          f.pose[key] = Math.max(k.min, Math.min(k.max, bestV + (i * radius) / 4));
          const s = evalAt(level);
          if (s < best) {
            best = s;
            bestV = f.pose[key];
          }
        }
        f.pose[key] = bestV;
      }
    }
  }
  return evalAt(fine);
}

interface Param {
  label: string;
  get(s: Setup): number;
  set(s: Setup, v: number): void;
  affects: string[];
  radius: number;
}

function boneParam(bone: string, axis: 0 | 1, radius: number): Param {
  return {
    label: `bone:${bone}.${axis ? 'y' : 'x'}`,
    get: (s) => s.bones[bone][axis],
    set: (s, v) => {
      s.bones[bone][axis] = v;
    },
    affects: subtree(bone),
    radius,
  };
}

function attParam(part: string, bone: string, axis: 0 | 1, radius: number): Param {
  return {
    label: `att:${part}.${axis ? 'y' : 'x'}`,
    get: (s) => s.attach[part][axis],
    set: (s, v) => {
      s.attach[part][axis] = v;
    },
    affects: subtree(bone),
    radius,
  };
}

const LEG_PARAMS = (r: number): Param[] => [
  boneParam('front-thigh', 0, 26 * r),
  boneParam('front-thigh', 1, 26 * r),
  boneParam('rear-thigh', 0, 26 * r),
  boneParam('rear-thigh', 1, 26 * r),
  boneParam('front-shin', 0, 20 * r),
  boneParam('front-shin', 1, 30 * r),
  boneParam('rear-shin', 0, 20 * r),
  boneParam('rear-shin', 1, 30 * r),
  boneParam('front-foot', 0, 20 * r),
  boneParam('front-foot', 1, 30 * r),
  boneParam('rear-foot', 0, 20 * r),
  boneParam('rear-foot', 1, 30 * r),
  attParam('front-thigh', 'front-thigh', 0, 16 * r),
  attParam('front-thigh', 'front-thigh', 1, 16 * r),
  attParam('rear-thigh', 'rear-thigh', 0, 16 * r),
  attParam('rear-thigh', 'rear-thigh', 1, 16 * r),
  attParam('front-shin', 'front-shin', 0, 16 * r),
  attParam('front-shin', 'front-shin', 1, 16 * r),
  attParam('rear-shin', 'rear-shin', 0, 16 * r),
  attParam('rear-shin', 'rear-shin', 1, 16 * r),
  attParam('front-foot', 'front-foot', 0, 16 * r),
  attParam('front-foot', 'front-foot', 1, 16 * r),
  attParam('rear-foot', 'rear-foot', 0, 16 * r),
  attParam('rear-foot', 'rear-foot', 1, 16 * r),
];

const ARM_PARAMS = (r: number): Param[] => [
  boneParam('front-upper-arm', 0, 20 * r),
  boneParam('front-upper-arm', 1, 20 * r),
  boneParam('rear-upper-arm', 0, 20 * r),
  boneParam('rear-upper-arm', 1, 20 * r),
  boneParam('front-bracer', 0, 16 * r),
  boneParam('front-bracer', 1, 24 * r),
  boneParam('rear-bracer', 0, 16 * r),
  boneParam('rear-bracer', 1, 24 * r),
  boneParam('front-fist', 0, 16 * r),
  boneParam('front-fist', 1, 20 * r),
  boneParam('gun', 0, 16 * r),
  boneParam('gun', 1, 20 * r),
  attParam('front-upper-arm', 'front-upper-arm', 0, 14 * r),
  attParam('front-upper-arm', 'front-upper-arm', 1, 14 * r),
  attParam('rear-upper-arm', 'rear-upper-arm', 0, 14 * r),
  attParam('rear-upper-arm', 'rear-upper-arm', 1, 14 * r),
  attParam('front-bracer', 'front-bracer', 0, 14 * r),
  attParam('front-bracer', 'front-bracer', 1, 14 * r),
  attParam('rear-bracer', 'rear-bracer', 0, 14 * r),
  attParam('rear-bracer', 'rear-bracer', 1, 14 * r),
  attParam('front-fist-closed', 'front-fist', 0, 14 * r),
  attParam('front-fist-closed', 'front-fist', 1, 14 * r),
  attParam('front-fist-open', 'front-fist', 0, 14 * r),
  attParam('front-fist-open', 'front-fist', 1, 14 * r),
  attParam('gun', 'gun', 0, 14 * r),
  attParam('gun', 'gun', 1, 14 * r),
];

if (import.meta.main) {
  const which = process.argv[2] ?? 'legs';
  const passes = Number(process.argv[3] ?? 2);
  const r = Number(process.argv[4] ?? 1);
  const level = 2;
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

  const params = which === 'arms' ? ARM_PARAMS(r) : which === 'both' ? [...LEG_PARAMS(r), ...ARM_PARAMS(r)] : LEG_PARAMS(r);
  const affectedUnion = new Set(params.flatMap((q) => q.affects));

  const total = (): number => {
    let acc = 0;
    for (const f of frames) {
      applyPose(p, f.pose);
      acc += score(p, f.levels[level]).value;
    }
    return acc / frames.length;
  };

  for (let pass = 0; pass < passes; pass++) {
    for (const f of frames) resolveSubtree(p, f, affectedUnion, 1, level);
    console.log(`pass ${pass}: re-solved to ${total().toFixed(3)}`);
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
          acc += resolveSubtree(p, f, affects, 1, level);
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
      console.log(`  ${param.label.padEnd(26)} ${base.toFixed(1)} -> ${best.v.toFixed(1)}   ${best.s.toFixed(3)}`);
    }
    writeFileSync(join(ROOT, 'fit/setup.json'), JSON.stringify(setup, null, 2));
    for (const f of frames) {
      const [set, frame] = f.key.split('/');
      const file = join(ROOT, `fit/poses/${set.replace('@', '_at_')}.json`);
      const poses = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
      poses[frame] = f.pose;
      writeFileSync(file, JSON.stringify(poses, null, 1));
    }
    console.log(`pass ${pass}: ${total().toFixed(3)}`);
  }
}
