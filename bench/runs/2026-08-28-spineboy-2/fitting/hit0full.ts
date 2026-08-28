/**
 * Attempt-5, hit f0: joint re-derivation. The composite compromise at f0 uses
 * the torso as sacrificial cover for a mis-seated gun (brief: its teal lies at
 * x148–164, rows 304–322 — at the floor) and legs. Seed torso ON its template
 * match, gun chain ON its measured teal, legs from red components (both
 * assignments), then a joint local refine over everything. Accept on composite
 * improvement only; incumbent stays a candidate.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RegionAttachment } from '@esotericsoftware/spine-core';
import { refFrames, RUN, inkBox, sidecar } from './lib.ts';
import { loadCandidate, applyPose, type PoseVec } from './pose.ts';
import { evalPose, refCrop, refine, localPair, localTriple, scan, type EvalCtx, type KnobDef, type Window } from './fitcore.ts';
import { matchPart } from './match.ts';
import { gunTeal } from './gunseed.ts';
import { chainSeeds, redComponents, toWorld, REAR_ARM, FRONT_ARM, FRONT_LEG, REAR_LEG } from './armseed.ts';

const vw = sidecar().viewport;
const D = Math.PI / 180;
const norm = (a: number): number => { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; };
const { posable, skeleton } = loadCandidate();
const R = (key: string, lo: number, hi: number, coarse: number): KnobDef => ({ key, lo, hi, coarse });

const FI = Number(process.argv[2] ?? 0);
const frames = refFrames('hit');
const ref = frames[FI];
const poseFile = join(RUN, 'fitting/poses/hit.json');
const store = JSON.parse(readFileSync(poseFile, 'utf8')) as {
  frames: { pose: PoseVec; err: number | null }[]; attachments: Record<string, string | null>;
};
const incumbent: PoseVec = { ...store.frames[FI].pose };
const box = inkBox(ref)!;
const M = 26;
const win: Window = {
  px0: Math.max(0, box.minX - M), py0: Math.max(0, box.minY - M),
  px1: Math.min(ref.width - 1, box.maxX + M), py1: Math.min(ref.height - 1, box.maxY + M),
};
const crops = new Map([[3, refCrop(ref, win, 3)], [1, refCrop(ref, win, 1)]]);
const ctx: EvalCtx = { posable, skeleton, win, crops, attachments: store.attachments };
const errInc = evalPose(ctx, incumbent, 1);
console.log('incumbent err', errInc.toFixed(4));

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
function headPxOf(pose: PoseVec): { x: number; y: number; r: number } {
  applyPose(skeleton, pose);
  const slot = skeleton.findSlot('head')!;
  const att = slot.appliedPose.attachment as RegionAttachment;
  const wv = new Array<number>(8).fill(0);
  att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), wv, 0, 2);
  const cxw = (wv[0] + wv[2] + wv[4] + wv[6]) / 4, cyw = (wv[1] + wv[3] + wv[5] + wv[7]) / 4;
  return { x: (cxw - vw.x) * vw.scale, y: vw.pixelHeight - (cyw - vw.y) * vw.scale, r: 42 };
}

// 1) seed the torso on its own match
const seed: PoseVec = { ...incumbent };
const cur = torsoArtPose(seed);
const phis: number[] = [];
for (let d = -22; d <= 22; d += 2) phis.push(norm(cur.artPhi + d));
const m = matchPart('torso', ref, { x0: cur.cx - 16, y0: cur.cy - 16, x1: cur.cx + 16, y1: cur.cy + 16 }, phis);
console.log(`torso match (${m.x},${m.y})@${m.phi.toFixed(1)} res ${m.score.toFixed(0)}`);
seed['torso.rot'] = (seed['torso.rot'] ?? 0) + norm(m.phi - cur.artPhi);
const p1 = torsoArtPose(seed);
const targetWorld: [number, number] = [vw.x + m.x / vw.scale, vw.y + (vw.pixelHeight - m.y) / vw.scale];
const dW: [number, number] = [targetWorld[0] - p1.world[0], targetWorld[1] - p1.world[1]];
const hip = skeleton.findBone('hip')!;
const hipRot = Math.atan2(hip.appliedPose.c, hip.appliedPose.a);
seed['torso.x'] = (seed['torso.x'] ?? 0) + Math.cos(-hipRot) * dW[0] - Math.sin(-hipRot) * dW[1];
seed['torso.y'] = (seed['torso.y'] ?? 0) + Math.sin(-hipRot) * dW[0] + Math.cos(-hipRot) * dW[1];

// settle neck/head about the new chest
const Kneck = R('neck.rot', -45, 45, 5), Khead = R('head.rot', (seed['head.rot'] ?? 0) - 45, (seed['head.rot'] ?? 0) + 45, 5);
localPair(ctx, seed, Kneck, Khead, 3, 20, 5);

// 2) gun chain on its measured teal (hair excluded around the placed head)
const gt = gunTeal(ref, box, headPxOf(seed));
if (gt && gt.count >= 20) {
  console.log(`gun teal at (${gt.cx.toFixed(1)},${gt.cy.toFixed(1)}) axis ${gt.axisDeg.toFixed(1)} n=${gt.count}`);
  let best = evalPose(ctx, seed, 3);
  for (const s of chainSeeds(skeleton, seed, REAR_ARM, toWorld(gt.cx, gt.cy), [gt.axisDeg - 36, gt.axisDeg + 144, gt.axisDeg - 16, gt.axisDeg + 164])) {
    const e = evalPose(ctx, s, 3);
    if (e < best) { best = e; Object.assign(seed, s); }
  }
}

// 3) legs from red components, both assignments
{
  const rowCut = box.minY + 0.4 * (box.maxY - box.minY);
  const reds = redComponents(ref, box, 40, rowCut).slice(0, 3);
  console.log('red components:', reds.map((r) => `(${r.cx.toFixed(0)},${r.cy.toFixed(0)}) n=${r.n}`).join(' '));
  if (reds.length >= 2) {
    let bestE = evalPose(ctx, seed, 3);
    let bestP: PoseVec | null = null;
    for (let ai = 0; ai < reds.length; ai++) for (let bi = 0; bi < reds.length; bi++) {
      if (ai === bi) continue;
      const A = reds[ai], B = reds[bi];
      for (const sF of chainSeeds(skeleton, seed, FRONT_LEG, toWorld(A.cx, A.cy), [A.axisDeg, A.axisDeg + 180])) {
        for (const sR of chainSeeds(skeleton, sF, REAR_LEG, toWorld(B.cx, B.cy), [B.axisDeg, B.axisDeg + 180])) {
          const e = evalPose(ctx, sR, 3);
          if (e < bestE) { bestE = e; bestP = sR; }
        }
      }
    }
    if (bestP) Object.assign(seed, bestP);
  }
}

// 4) joint local refine, torso held on a short leash
const around = (key: string, span: number, coarse: number): KnobDef => {
  const c = seed[key] ?? 0; return R(key, c - span, c + span, coarse);
};
const K: Record<string, KnobDef> = Object.fromEntries([
  around('torso.x', 2, 1), around('torso.y', 2, 1), around('torso.rot', 2, 1),
  R('neck.rot', -45, 45, 5), around('head.rot', 30, 5),
  around('front-upper-arm.rot', 60, 7), around('front-bracer.rot', 60, 7), around('front-fist.rot', 55, 7),
  around('rear-upper-arm.rot', 60, 7), around('rear-bracer.rot', 60, 7), around('gun.rot', 55, 7),
  around('hip.x', 12, 3), around('hip.y', 12, 3), around('hip.rot', 10, 2.5),
  around('front-thigh.rot', 30, 6), around('front-shin.rot', 30, 6), around('front-foot.rot', 30, 6),
  around('rear-thigh.rot', 30, 6), around('rear-shin.rot', 30, 6), around('rear-foot.rot', 30, 6),
].map((k) => [k.key, k]));
const all = Object.values(K);
localPair(ctx, seed, K['front-thigh.rot'], K['front-shin.rot'], 3, 22, 5.5);
localPair(ctx, seed, K['rear-thigh.rot'], K['rear-shin.rot'], 3, 22, 5.5);
localPair(ctx, seed, K['front-upper-arm.rot'], K['front-bracer.rot'], 3, 22, 5.5);
localPair(ctx, seed, K['rear-upper-arm.rot'], K['rear-bracer.rot'], 3, 22, 5.5);
refine(ctx, seed, all, 1, [5, 2]);
localTriple(ctx, seed, K['rear-upper-arm.rot'], K['rear-bracer.rot'], K['gun.rot'], 1, 7, 3.5);
localTriple(ctx, seed, K['front-upper-arm.rot'], K['front-bracer.rot'], K['front-fist.rot'], 1, 7, 3.5);
localTriple(ctx, seed, K['front-thigh.rot'], K['front-shin.rot'], K['front-foot.rot'], 1, 7, 3.5);
localTriple(ctx, seed, K['rear-thigh.rot'], K['rear-shin.rot'], K['rear-foot.rot'], 1, 7, 3.5);
const errSeed = refine(ctx, seed, all, 1, [1.5, 0.5]);
const p2 = torsoArtPose(seed);
console.log(`seeded err ${errSeed.toFixed(4)} (incumbent ${errInc.toFixed(4)})  torso now (${p2.cx.toFixed(1)},${p2.cy.toFixed(1)})@${p2.artPhi.toFixed(1)} vs match (${m.x},${m.y})@${m.phi.toFixed(1)}`);
if (errSeed < errInc * 1.10) {
  store.frames[FI] = { pose: seed, err: +errSeed.toFixed(4) };
  writeFileSync(poseFile, JSON.stringify(store, null, 1));
  console.log('ACCEPTED + saved');
} else {
  console.log('kept incumbent (composite still prefers it) — write both figures to the log');
}
