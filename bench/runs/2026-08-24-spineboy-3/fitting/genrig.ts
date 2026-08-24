/**
 * Emit the rig spec from the measured geometry: joints from the least-squares
 * pivot solve, setup pose from one reference frame's matched part poses.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { poseOf, type M, type Matches } from './solve.ts';

const REF_FRAME = process.env.REF_FRAME ?? 'idle/0';
const matches: Matches = JSON.parse(readFileSync('work/matches.json', 'utf8'));
const joints: Record<string, { aP: number[]; aC: number[] }> = JSON.parse(readFileSync('work/joints.json', 'utf8'));

const rot = (th: number): [number, number] => [Math.cos((th * Math.PI) / 180), Math.sin((th * Math.PI) / 180)];
const apply = (th: number, a: number[]): [number, number] => { const [c, s] = rot(th); return [c * a[0] - s * a[1], s * a[0] + c * a[1]]; };
const unapply = (th: number, v: number[]): [number, number] => { const [c, s] = rot(th); return [c * v[0] + s * v[1], -s * v[0] + c * v[1]]; };

const R = matches[REF_FRAME];
const P = (n: string) => poseOf(R[n] as M);

/** bone -> parent, in declaration order. `hip` and `root` carry no art. */
export const BONES: [string, string | null, string | null][] = [
  // name, parent, art part (null = no art)
  ['root', null, null],
  ['hip', 'root', null],
  ['torso', 'hip', 'torso'],
  ['front-upper-arm', 'torso', 'front-upper-arm'],
  ['front-bracer', 'front-upper-arm', 'front-bracer'],
  ['front-fist', 'front-bracer', 'front-fist-closed'],
  ['rear-upper-arm', 'torso', 'rear-upper-arm'],
  ['rear-bracer', 'rear-upper-arm', 'rear-bracer'],
  ['gun', 'rear-bracer', 'gun'],
  ['muzzle', 'gun', null],
  ['neck', 'torso', 'neck'],
  ['head', 'neck', 'head'],
  ['front-thigh', 'hip', 'front-thigh'],
  ['front-shin', 'front-thigh', 'front-shin'],
  ['front-foot', 'front-shin', 'front-foot'],
  ['rear-thigh', 'hip', 'rear-thigh'],
  ['rear-shin', 'rear-thigh', 'rear-shin'],
  ['rear-foot', 'rear-shin', 'rear-foot'],
];
/** which joint entry gives a bone's origin inside its parent's ART frame */
const JOINT_OF: Record<string, [string, string]> = {
  // bone -> [joint key, parent art part]
  'front-upper-arm': ['front-upper-arm', 'torso'],
  'front-bracer': ['front-bracer', 'front-upper-arm'],
  'front-fist': ['front-fist-closed', 'front-bracer'],
  'rear-upper-arm': ['rear-upper-arm', 'torso'],
  'rear-bracer': ['rear-bracer', 'rear-upper-arm'],
  gun: ['gun', 'rear-bracer'],
  neck: ['neck', 'torso'],
  head: ['head', 'neck'],
  'front-shin': ['front-shin', 'front-thigh'],
  'front-foot': ['front-foot', 'front-shin'],
  'rear-shin': ['rear-shin', 'rear-thigh'],
  'rear-foot': ['rear-foot', 'rear-shin'],
  'front-thigh': ['front-thigh', 'torso'],
  'rear-thigh': ['rear-thigh', 'torso'],
};

export interface Geo { world: Record<string, [number, number]>; worldRot: Record<string, number>; hip: [number, number] }

/** world origin + world rotation of every art bone on the reference frame */
export function geometryOn(m: Record<string, M>): Geo {
  const world: Record<string, [number, number]> = {};
  const worldRot: Record<string, number> = {};
  const pose = (n: string) => poseOf(m[n]);
  for (const [bone, , part] of BONES) {
    if (!part) continue;
    worldRot[bone] = pose(part).th;
  }
  const originIn = (jointKey: string, parentPart: string): [number, number] => {
    const j = joints[jointKey];
    const pp = pose(parentPart);
    const d = apply(pp.th, j.aP);
    return [pp.c[0] + d[0], pp.c[1] + d[1]];
  };
  for (const [bone, , part] of BONES) {
    if (!part) continue;
    const jo = JOINT_OF[bone];
    if (jo) world[bone] = originIn(jo[0], jo[1]);
  }
  // hip: midway between the two pelvis joints
  const hf = originIn('front-thigh', 'torso');
  const hr = originIn('rear-thigh', 'torso');
  const hip: [number, number] = [(hf[0] + hr[0]) / 2, (hf[1] + hr[1]) / 2];
  world['torso'] = hip;
  world['hip'] = hip;
  return { world, worldRot, hip };
}

if (import.meta.main) {
  const g = geometryOn(R);
  const bones: Record<string, unknown>[] = [];
  const attach: Record<string, { x: number; y: number }> = {};
  for (const [name, parent, part] of BONES) {
    if (name === 'root') { bones.push({ name: 'root' }); continue; }
    if (name === 'hip') {
      bones.push({ name: 'hip', parent: 'root', x: round(g.hip[0]), y: round(g.hip[1]) });
      continue;
    }
    if (name === 'muzzle') continue; // placed below, from the gun art
    const wr = g.worldRot[name];
    const parentRot = parent === 'hip' ? 0 : g.worldRot[parent!];
    const parentPos = parent === 'hip' ? g.hip : g.world[parent!];
    const local = unapply(parentRot, [g.world[name][0] - parentPos[0], g.world[name][1] - parentPos[1]]);
    bones.push({ name, parent, x: round(local[0]), y: round(local[1]), rotation: round(wr - parentRot) });
    // attachment offset, in this bone's own local frame
    const c = P(part!).c;
    const off = unapply(wr, [c[0] - g.world[name][0], c[1] - g.world[name][1]]);
    attach[name] = { x: round(off[0]), y: round(off[1]) };
  }
  writeFileSync('work/geometry.json', JSON.stringify({ bones, attach, hip: g.hip }, null, 1));
  console.log(JSON.stringify({ bones, attach }, null, 1));
}
function round(v: number): number { return Math.round(v * 100) / 100; }
