/**
 * Stage C (§8.1): re-fit the setup against frames drawn from every fitted shot.
 * Knobs: bone pivots (setup x/y, with attachment+child compensation so the
 * setup render is invariant) and attachment offsets (x/y/rotation[/scale]).
 * Poses are held fixed; the objective is the mean windowed error over the spread.
 * Writes fitting/skeleton-fit.json (bone setups + attachment locals, verbatim).
 */
import { RegionAttachment } from '@esotericsoftware/spine-core';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { refFrames, RUN, inkBox } from './lib.ts';
import { loadCandidate, type PoseVec } from './pose.ts';
import { evalPose, refCrop, type EvalCtx, type Window } from './fitcore.ts';

const { posable, skeleton } = loadCandidate();

interface SpreadEntry { anim: string; fi: number; ctx: EvalCtx; pose: PoseVec }
const SPREAD: [string, number[]][] = [
  ['idle', [0, 5, 10, 15]],
  ['walk', [0, 2, 4, 6, 9, 11]],
  ['run', [0, 2, 3, 5, 6, 8]],
  ['shoot', [0]],
  ['aim', [0]],
];
// death/hit appended by --all once those shots are fitted
if (process.argv.includes('--all')) {
  SPREAD.push(['death', [0, 3, 5, 8, 11, 14, 17]], ['hit', [0, 2, 4]], ['jump', [0, 4, 9, 14, 16]]);
}

const spread: SpreadEntry[] = [];
for (const [anim, fis] of SPREAD) {
  const poseFile = join(RUN, `fitting/poses/${anim}.json`);
  if (!existsSync(poseFile)) continue;
  const store = JSON.parse(readFileSync(poseFile, 'utf8'));
  const frames = refFrames(anim);
  for (const fi of fis) {
    if (!store.frames[fi] || store.frames[fi].err === null || !Object.keys(store.frames[fi].pose).length) continue;
    const ref = frames[fi];
    const box = inkBox(ref)!;
    const M = 26;
    const win: Window = {
      px0: Math.max(0, box.minX - M), py0: Math.max(0, box.minY - M),
      px1: Math.min(ref.width - 1, box.maxX + M), py1: Math.min(ref.height - 1, box.maxY + M),
    };
    const crops = new Map([[1, refCrop(ref, win, 1)]]);
    spread.push({ anim, fi, pose: store.frames[fi].pose, ctx: { posable, skeleton, win, crops, attachments: store.attachments } });
  }
}
console.log('spread:', spread.map((s) => `${s.anim}:${s.fi}`).join(' '));

function total(): number {
  let sum = 0;
  for (const s of spread) sum += evalPose(s.ctx, s.pose, 1);
  return sum / spread.length;
}

// ---------- knob machinery ----------
const D = Math.PI / 180;

function attachmentsOn(boneName: string): RegionAttachment[] {
  const out: RegionAttachment[] = [];
  const skin = skeleton.data.defaultSkin!;
  for (const slot of skeleton.slots) {
    if (slot.bone.data.name !== boneName) continue;
    for (const entry of skin.attachments[slot.data.index] ? Object.values(skin.attachments[slot.data.index]) : []) {
      if (entry instanceof RegionAttachment) out.push(entry);
    }
  }
  return out;
}

/** move bone pivot by (dx,dy) in PARENT space, compensating attachments + child bones */
function movePivot(boneName: string, dx: number, dy: number): void {
  const bone = skeleton.findBone(boneName)!;
  const sp = bone.data.setupPose;
  sp.x += dx; sp.y += dy;
  // delta expressed in the bone's own local frame
  const r = -sp.rotation * D;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  for (const att of attachmentsOn(boneName)) {
    att.x -= lx; att.y -= ly;
    att.updateSequence();
  }
  for (const child of skeleton.bones) {
    if (child.parent?.data.name === boneName) {
      child.data.setupPose.x -= lx;
      child.data.setupPose.y -= ly;
    }
  }
}

const PIVOTS = [
  'hip', 'torso', 'neck', 'head',
  'front-upper-arm', 'front-bracer', 'front-fist',
  'rear-upper-arm', 'rear-bracer', 'gun',
  'front-thigh', 'front-shin', 'front-foot',
  'rear-thigh', 'rear-shin', 'rear-foot',
];

// attachment offset knobs on every drawn part (skip muzzle pieces + eye, hidden/unused)
const ATT_SLOTS = [
  ['torso', 'torso'], ['head', 'head'], ['goggles', 'goggles'], ['neck', 'neck'],
  ['mouth', 'mouth-smile'],
  ['gun', 'gun'],
  ['front-shin', 'front-shin'], ['rear-shin', 'rear-shin'],
  ['front-foot', 'front-foot'], ['rear-foot', 'rear-foot'],
  ['front-thigh', 'front-thigh'], ['rear-thigh', 'rear-thigh'],
  ['front-upper-arm', 'front-upper-arm'], ['front-bracer', 'front-bracer'],
  ['rear-upper-arm', 'rear-upper-arm'], ['rear-bracer', 'rear-bracer'],
  ['front-fist', 'front-fist-open'], ['front-fist', 'front-fist-closed'],
] as const;

function attachment(slot: string, name: string): RegionAttachment {
  const s = skeleton.findSlot(slot)!;
  return skeleton.getAttachment(s.data.index, name) as RegionAttachment;
}

let best = total();
console.log('start', best.toFixed(4));

const rounds = Number(process.argv.find((a) => a.startsWith('--rounds='))?.split('=')[1] ?? 2);
for (let round = 0; round < rounds; round++) {
  // pivots
  for (const b of PIVOTS) {
    for (const axis of ['x', 'y'] as const) {
      for (const step of [6, 2]) {
        let moved = true;
        let guard = 0;
        while (moved && guard++ < 5) {
          moved = false;
          for (const sgn of [1, -1]) {
            const dx = axis === 'x' ? sgn * step : 0;
            const dy = axis === 'y' ? sgn * step : 0;
            movePivot(b, dx, dy);
            const e = total();
            if (e < best - 1e-6) { best = e; moved = true; }
            else movePivot(b, -dx, -dy);
          }
        }
      }
    }
  }
  console.log(`round ${round} pivots: ${best.toFixed(4)}`);
  // attachment offsets
  for (const [slot, name] of ATT_SLOTS) {
    const a = attachment(slot, name);
    if (!a) continue;
    for (const ch of ['x', 'y', 'rotation'] as const) {
      for (const step of [4, 1.2]) {
        let moved = true;
        let guard = 0;
        while (moved && guard++ < 5) {
          moved = false;
          for (const sgn of [1, -1]) {
            (a as unknown as Record<string, number>)[ch] += sgn * step;
            a.updateSequence();
            const e = total();
            if (e < best - 1e-6) { best = e; moved = true; }
            else { (a as unknown as Record<string, number>)[ch] -= sgn * step; a.updateSequence(); }
          }
        }
      }
    }
  }
  console.log(`round ${round} attachments: ${best.toFixed(4)}`);
}

// ---------- dump the whole fitted skeleton ----------
const bonesOut: Record<string, { x: number; y: number; rotation: number }> = {};
for (const b of skeleton.bones) {
  bonesOut[b.data.name] = {
    x: +b.data.setupPose.x.toFixed(2), y: +b.data.setupPose.y.toFixed(2), rotation: +b.data.setupPose.rotation.toFixed(2),
  };
}
const attsOut: Record<string, Record<string, { x: number; y: number; rotation: number; scaleX: number; scaleY: number }>> = {};
const skin = skeleton.data.defaultSkin!;
for (const slot of skeleton.slots) {
  const entries = skin.attachments[slot.data.index];
  if (!entries) continue;
  for (const [name, att] of Object.entries(entries)) {
    if (!(att instanceof RegionAttachment)) continue;
    attsOut[slot.data.name] = attsOut[slot.data.name] ?? {};
    attsOut[slot.data.name][name] = {
      x: +att.x.toFixed(2), y: +att.y.toFixed(2), rotation: +att.rotation.toFixed(2),
      scaleX: +att.scaleX.toFixed(4), scaleY: +att.scaleY.toFixed(4),
    };
  }
}
writeFileSync(join(RUN, 'fitting/skeleton-fit.json'), JSON.stringify({ bones: bonesOut, attachments: attsOut }, null, 1));
console.log('final', best.toFixed(4), '— wrote skeleton-fit.json');
