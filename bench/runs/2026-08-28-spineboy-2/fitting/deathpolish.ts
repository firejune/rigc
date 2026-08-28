/**
 * Attempt-5, death: polish the lying torso onto its template match while
 * KEEPING the f13..f26 dead hold pose-identical.
 *  1. Seed the unified hold pose's torso on its f19 match; re-settle neck/head/
 *     arms against f19; score as MEAN over hold frames; accept within 8%.
 *  2. Apply the same torso delta to the slide (f8..f12) and the wave (f27..f59),
 *     with a light per-frame re-settle of neck/head/arm channels.
 *  3. Re-assign the polished hold pose to f13..f26.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RegionAttachment } from '@esotericsoftware/spine-core';
import { refFrames, RUN, inkBox, sidecar } from './lib.ts';
import { loadCandidate, applyPose, type PoseVec } from './pose.ts';
import { evalPose, refCrop, refine, localPair, localTriple, type EvalCtx, type KnobDef, type Window } from './fitcore.ts';
import { matchPart } from './match.ts';

const vw = sidecar().viewport;
const D = Math.PI / 180;
const norm = (a: number): number => { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; };
const { posable, skeleton } = loadCandidate();
const R = (key: string, lo: number, hi: number, coarse: number): KnobDef => ({ key, lo, hi, coarse });

const frames = refFrames('death');
const poseFile = join(RUN, 'fitting/poses/death.json');
const store = JSON.parse(readFileSync(poseFile, 'utf8')) as {
  frames: { pose: PoseVec; err: number | null }[]; attachments: Record<string, string | null>;
};

function ctxFor(fi: number, levels: number[] = [1]): EvalCtx {
  const ref = frames[fi];
  const box = inkBox(ref)!;
  const M = 26;
  const win: Window = {
    px0: Math.max(0, box.minX - M), py0: Math.max(0, box.minY - M),
    px1: Math.min(ref.width - 1, box.maxX + M), py1: Math.min(ref.height - 1, box.maxY + M),
  };
  const crops = new Map(levels.map((k) => [k, refCrop(ref, win, k)] as const));
  return { posable, skeleton, win, crops, attachments: store.attachments };
}
function torsoArtPose(pose: PoseVec): { cx: number; cy: number; artPhi: number; world: [number, number] } {
  applyPose(skeleton, pose);
  const slot = skeleton.findSlot('torso')!;
  const att = skeleton.getAttachment(slot.data.index, 'torso') as RegionAttachment;
  const wv = new Array<number>(8).fill(0);
  att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), wv, 0, 2);
  const cxw = (wv[0] + wv[2] + wv[4] + wv[6]) / 4, cyw = (wv[1] + wv[3] + wv[5] + wv[7]) / 4;
  const edge = Math.atan2(wv[3] - wv[1], wv[2] - wv[0]) / D;
  return { cx: (cxw - vw.x) * vw.scale, cy: vw.pixelHeight - (cyw - vw.y) * vw.scale, artPhi: edge - 90, world: [cxw, cyw] };
}

// ---- 1: hold pose ----
const HOLD_EVAL = [17, 20, 23, 26];
const holdCtxs = HOLD_EVAL.map((fi) => ctxFor(fi));
const meanHold = (p: PoseVec): number => holdCtxs.reduce((s, c) => s + evalPose(c, p, 1), 0) / holdCtxs.length;

const hold: PoseVec = { ...store.frames[19].pose };
const before = meanHold(hold);
const cur = torsoArtPose(hold);
const phis: number[] = [];
for (let d = -22; d <= 22; d += 2) phis.push(norm(cur.artPhi + d));
const m = matchPart('torso', frames[19], { x0: cur.cx - 14, y0: cur.cy - 14, x1: cur.cx + 14, y1: cur.cy + 14 }, phis);
console.log(`hold: torso cand (${cur.cx.toFixed(1)},${cur.cy.toFixed(1)})@${norm(cur.artPhi).toFixed(1)} match (${m.x},${m.y})@${m.phi.toFixed(1)} res ${m.score.toFixed(0)}`);

const seed: PoseVec = { ...hold };
const dRot = norm(m.phi - cur.artPhi);
seed['torso.rot'] = (seed['torso.rot'] ?? 0) + dRot;
const p1 = torsoArtPose(seed);
const targetWorld: [number, number] = [vw.x + m.x / vw.scale, vw.y + (vw.pixelHeight - m.y) / vw.scale];
const dW: [number, number] = [targetWorld[0] - p1.world[0], targetWorld[1] - p1.world[1]];
const hip = skeleton.findBone('hip')!;
const hipRot = Math.atan2(hip.appliedPose.c, hip.appliedPose.a);
const dTx = Math.cos(-hipRot) * dW[0] - Math.sin(-hipRot) * dW[1];
const dTy = Math.sin(-hipRot) * dW[0] + Math.cos(-hipRot) * dW[1];
seed['torso.x'] = (seed['torso.x'] ?? 0) + dTx;
seed['torso.y'] = (seed['torso.y'] ?? 0) + dTy;

// re-settle chest-hung channels on f19 with the torso pinned
const ctx19 = ctxFor(19, [3, 1]);
const around = (key: string, span: number, coarse: number): KnobDef => {
  const c = seed[key] ?? 0; return R(key, c - span, c + span, coarse);
};
const K: Record<string, KnobDef> = Object.fromEntries([
  around('torso.x', 2, 1), around('torso.y', 2, 1), around('torso.rot', 2, 1),
  R('neck.rot', -45, 45, 5), around('head.rot', 35, 5),
  around('front-upper-arm.rot', 45, 7), around('front-bracer.rot', 45, 7), around('front-fist.rot', 40, 7),
  around('rear-upper-arm.rot', 45, 7), around('rear-bracer.rot', 45, 7), around('gun.rot', 40, 7),
].map((k) => [k.key, k]));
localPair(ctx19, seed, K['neck.rot'], K['head.rot'], 3, 20, 5);
localPair(ctx19, seed, K['front-upper-arm.rot'], K['front-bracer.rot'], 3, 20, 5);
localPair(ctx19, seed, K['rear-upper-arm.rot'], K['rear-bracer.rot'], 3, 20, 5);
refine(ctx19, seed, Object.values(K), 1, [4, 1.5]);
localTriple(ctx19, seed, K['front-upper-arm.rot'], K['front-bracer.rot'], K['front-fist.rot'], 1, 6, 3);
refine(ctx19, seed, Object.values(K), 1, [1, 0.4]);

const after = meanHold(seed);
const p2 = torsoArtPose(seed);
console.log(`hold: mean err ${before.toFixed(4)} -> ${after.toFixed(4)}  torso now (${p2.cx.toFixed(1)},${p2.cy.toFixed(1)})@${norm(p2.artPhi).toFixed(1)}`);
if (after < before * 1.08) {
  for (let fi = 13; fi <= 26; fi++) store.frames[fi] = { pose: { ...seed }, err: +after.toFixed(4) };
  console.log('hold ACCEPTED (within 8%)');
  // ---- 2: propagate the same torso delta to slide + wave, light re-settle ----
  const deltaApplied = {
    rot: (seed['torso.rot'] ?? 0) - (hold['torso.rot'] ?? 0),
    x: (seed['torso.x'] ?? 0) - (hold['torso.x'] ?? 0),
    y: (seed['torso.y'] ?? 0) - (hold['torso.y'] ?? 0),
  };
  console.log('propagating torso delta', JSON.stringify(deltaApplied));
  const others = [...Array.from({ length: 5 }, (_, i) => 8 + i), ...Array.from({ length: 33 }, (_, i) => 27 + i)];
  for (const fi of others) {
    const pose: PoseVec = { ...store.frames[fi].pose };
    pose['torso.rot'] = (pose['torso.rot'] ?? 0) + deltaApplied.rot;
    pose['torso.x'] = (pose['torso.x'] ?? 0) + deltaApplied.x;
    pose['torso.y'] = (pose['torso.y'] ?? 0) + deltaApplied.y;
    const c = ctxFor(fi, [1]);
    const e0raw = evalPose(c, store.frames[fi].pose, 1);
    const K2: Record<string, KnobDef> = Object.fromEntries([
      R('neck.rot', -45, 45, 5),
      { key: 'head.rot', lo: (pose['head.rot'] ?? 0) - 30, hi: (pose['head.rot'] ?? 0) + 30, coarse: 5 },
      { key: 'front-upper-arm.rot', lo: (pose['front-upper-arm.rot'] ?? 0) - 30, hi: (pose['front-upper-arm.rot'] ?? 0) + 30, coarse: 6 },
      { key: 'front-bracer.rot', lo: (pose['front-bracer.rot'] ?? 0) - 30, hi: (pose['front-bracer.rot'] ?? 0) + 30, coarse: 6 },
      { key: 'front-fist.rot', lo: (pose['front-fist.rot'] ?? 0) - 30, hi: (pose['front-fist.rot'] ?? 0) + 30, coarse: 6 },
      { key: 'rear-upper-arm.rot', lo: (pose['rear-upper-arm.rot'] ?? 0) - 30, hi: (pose['rear-upper-arm.rot'] ?? 0) + 30, coarse: 6 },
      { key: 'rear-bracer.rot', lo: (pose['rear-bracer.rot'] ?? 0) - 30, hi: (pose['rear-bracer.rot'] ?? 0) + 30, coarse: 6 },
      { key: 'gun.rot', lo: (pose['gun.rot'] ?? 0) - 30, hi: (pose['gun.rot'] ?? 0) + 30, coarse: 6 },
      { key: 'torso.x', lo: (pose['torso.x'] ?? 0) - 2, hi: (pose['torso.x'] ?? 0) + 2, coarse: 1 },
      { key: 'torso.y', lo: (pose['torso.y'] ?? 0) - 2, hi: (pose['torso.y'] ?? 0) + 2, coarse: 1 },
      { key: 'torso.rot', lo: (pose['torso.rot'] ?? 0) - 2, hi: (pose['torso.rot'] ?? 0) + 2, coarse: 1 },
    ].map((k) => [k.key, k]));
    const e1 = refine(c, pose, Object.values(K2), 1, [4, 1.5, 0.5]);
    if (e1 < e0raw * 1.08) {
      store.frames[fi] = { pose, err: +e1.toFixed(4) };
      console.log(`f${fi}: ${e0raw.toFixed(4)} -> ${e1.toFixed(4)} (accepted)`);
    } else {
      console.log(`f${fi}: ${e0raw.toFixed(4)} -> ${e1.toFixed(4)} (kept old)`);
    }
  }
  writeFileSync(poseFile, JSON.stringify(store, null, 1));
  console.log('saved');
} else {
  console.log('hold seed rejected — leaving death as refit left it');
}
