/**
 * Attempt-5 polish: for frames whose local refit is stuck in the old-geometry
 * basin, add a start with the torso analytically seeded on its own template
 * match (§8.1 multi-start — the incumbent stays among the candidates), then
 * re-settle the coupled channels plus a LOCAL leg/hip re-refine (the old
 * compromise bent the whole figure, so the legs' share of it must be allowed
 * to relax). Accept only on composite improvement.
 * Usage: bun torsopolish.ts anim:fi [anim:fi ...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RegionAttachment } from '@esotericsoftware/spine-core';
import { refFrames, RUN, inkBox, sidecar } from './lib.ts';
import { loadCandidate, applyPose, type PoseVec } from './pose.ts';
import { evalPose, refCrop, refine, localPair, localTriple, scan, type EvalCtx, type KnobDef, type Window } from './fitcore.ts';
import { matchPart } from './match.ts';

const vw = sidecar().viewport;
const D = Math.PI / 180;
const { posable, skeleton } = loadCandidate();
const R = (key: string, lo: number, hi: number, coarse: number): KnobDef => ({ key, lo, hi, coarse });
const norm = (a: number): number => { while (a > 180) a -= 360; while (a <= -180) a += 360; return a; };

function torsoArtPose(pose: PoseVec): { cx: number; cy: number; artPhi: number; world: [number, number] } {
  applyPose(skeleton, pose);
  const slot = skeleton.findSlot('torso')!;
  const att = skeleton.getAttachment(slot.data.index, 'torso') as RegionAttachment;
  const wv = new Array<number>(8).fill(0);
  att.computeWorldVertices(slot, att.getOffsets(slot.appliedPose), wv, 0, 2);
  const cxw = (wv[0] + wv[2] + wv[4] + wv[6]) / 4, cyw = (wv[1] + wv[3] + wv[5] + wv[7]) / 4;
  const edge = Math.atan2(wv[3] - wv[1], wv[2] - wv[0]) / D;
  return {
    cx: (cxw - vw.x) * vw.scale, cy: vw.pixelHeight - (cyw - vw.y) * vw.scale,
    artPhi: edge - 90, world: [cxw, cyw],
  };
}

for (const t of process.argv.slice(2)) {
  const [anim, fiS] = t.split(':');
  const fi = Number(fiS);
  const frames = refFrames(anim);
  const ref = frames[fi];
  const poseFile = join(RUN, `fitting/poses/${anim}.json`);
  const store = JSON.parse(readFileSync(poseFile, 'utf8')) as {
    frames: { pose: PoseVec; err: number | null }[]; attachments: Record<string, string | null>;
  };
  const incumbent: PoseVec = { ...store.frames[fi].pose };
  const box = inkBox(ref)!;
  const M = 26;
  const win: Window = {
    px0: Math.max(0, box.minX - M), py0: Math.max(0, box.minY - M),
    px1: Math.min(ref.width - 1, box.maxX + M), py1: Math.min(ref.height - 1, box.maxY + M),
  };
  const crops = new Map([[3, refCrop(ref, win, 3)], [1, refCrop(ref, win, 1)]]);
  const ctx: EvalCtx = { posable, skeleton, win, crops, attachments: store.attachments };
  const errInc = evalPose(ctx, incumbent, 1);

  // match the torso art around the incumbent's own placement
  const cur = torsoArtPose(incumbent);
  const phis: number[] = [];
  for (let d = -22; d <= 22; d += 2) phis.push(norm(cur.artPhi + d));
  const m = matchPart('torso', ref, { x0: cur.cx - 16, y0: cur.cy - 16, x1: cur.cx + 16, y1: cur.cy + 16 }, phis);
  console.log(`${anim} f${fi}: incumbent err ${errInc.toFixed(4)}, torso cand (${cur.cx.toFixed(1)},${cur.cy.toFixed(1)})@${cur.artPhi.toFixed(1)} match (${m.x},${m.y})@${m.phi.toFixed(1)} res ${m.score.toFixed(0)}`);

  // seed: set torso.rot + torso.x/y so the torso art lands on the match
  const seed: PoseVec = { ...incumbent };
  seed['torso.rot'] = (incumbent['torso.rot'] ?? 0) + norm(m.phi - cur.artPhi);
  // with the new rot, where does the art land at current torso.x/y? move the rest in hip space
  const p1 = torsoArtPose(seed);
  const targetWorld: [number, number] = [vw.x + m.x / vw.scale, vw.y + (vw.pixelHeight - m.y) / vw.scale];
  const dWorld: [number, number] = [targetWorld[0] - p1.world[0], targetWorld[1] - p1.world[1]];
  const hip = skeleton.findBone('hip')!;
  const hipRot = Math.atan2(hip.appliedPose.c, hip.appliedPose.a);
  seed['torso.x'] = (seed['torso.x'] ?? 0) + Math.cos(-hipRot) * dWorld[0] - Math.sin(-hipRot) * dWorld[1];
  seed['torso.y'] = (seed['torso.y'] ?? 0) + Math.sin(-hipRot) * dWorld[0] + Math.cos(-hipRot) * dWorld[1];

  // re-settle: neck/head + arms around the seeded torso, then a LOCAL whole-pose refine
  const around = (key: string, span: number, coarse: number): KnobDef => {
    const c = seed[key] ?? 0; return R(key, c - span, c + span, coarse);
  };
  const K: Record<string, KnobDef> = Object.fromEntries([
    around('torso.x', 12, 3), around('torso.y', 12, 3), around('torso.rot', 8, 2.5),
    R('neck.rot', -45, 45, 6), around('head.rot', 45, 6),
    around('front-upper-arm.rot', 40, 7), around('front-bracer.rot', 40, 7), around('front-fist.rot', 35, 7),
    around('rear-upper-arm.rot', 40, 7), around('rear-bracer.rot', 40, 7), around('gun.rot', 35, 7),
    around('hip.x', 10, 3), around('hip.y', 10, 3), around('hip.rot', 8, 2.5),
    around('front-thigh.rot', 12, 4), around('front-shin.rot', 12, 4), around('front-foot.rot', 12, 4),
    around('rear-thigh.rot', 12, 4), around('rear-shin.rot', 12, 4), around('rear-foot.rot', 12, 4),
  ].map((k) => [k.key, k]));
  const coupled = ['torso.x', 'torso.y', 'torso.rot', 'neck.rot', 'head.rot',
    'front-upper-arm.rot', 'front-bracer.rot', 'front-fist.rot',
    'rear-upper-arm.rot', 'rear-bracer.rot', 'gun.rot'].map((k) => K[k]);
  const legs = ['hip.x', 'hip.y', 'hip.rot', 'front-thigh.rot', 'front-shin.rot', 'front-foot.rot',
    'rear-thigh.rot', 'rear-shin.rot', 'rear-foot.rot'].map((k) => K[k]);

  localPair(ctx, seed, K['neck.rot'], K['head.rot'], 3, 18, 6);
  localPair(ctx, seed, K['front-upper-arm.rot'], K['front-bracer.rot'], 3, 20, 5);
  localPair(ctx, seed, K['rear-upper-arm.rot'], K['rear-bracer.rot'], 3, 20, 5);
  refine(ctx, seed, coupled, 1, [4, 1.5]);
  localTriple(ctx, seed, K['rear-upper-arm.rot'], K['rear-bracer.rot'], K['gun.rot'], 1, 6, 3);
  localTriple(ctx, seed, K['front-upper-arm.rot'], K['front-bracer.rot'], K['front-fist.rot'], 1, 6, 3);
  refine(ctx, seed, legs, 1, [3, 1]);
  const errSeed = refine(ctx, seed, [...coupled, ...legs], 1, [1.5, 0.5]);

  const p2 = torsoArtPose(seed);
  console.log(`   seeded err ${errSeed.toFixed(4)}  torso now (${p2.cx.toFixed(1)},${p2.cy.toFixed(1)})@${p2.artPhi.toFixed(1)}  ${errSeed < errInc ? 'ACCEPT' : 'keep incumbent'}`);
  if (errSeed < errInc) {
    store.frames[fi] = { pose: seed, err: +errSeed.toFixed(4) };
    writeFileSync(poseFile, JSON.stringify(store, null, 1));
    console.log('   saved');
  }
}
