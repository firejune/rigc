/**
 * Attempt-5 probe: where does the torso subtree want to sit when its per-frame
 * translate is NOT boxed at ±35? Refits chest-coupled channels only (torso.x/y/
 * rot, neck.rot, head.rot, arm rotations) with hip + legs frozen, torso.x/y
 * widened to ±110. Writes fitting/probe-waist.json. Never touches pose stores.
 * Usage: bun waistprobe.ts [anim:fi anim:fi ...]   (default spread below)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { refFrames, RUN, inkBox } from './lib.ts';
import { loadCandidate, type PoseVec } from './pose.ts';
import { evalPose, refCrop, refine, pairScan, localPair, scan, type EvalCtx, type KnobDef, type Window } from './fitcore.ts';

const DEFAULT = [
  'hit:0', 'hit:1', 'hit:2', 'hit:3', 'hit:4',
  'death:8', 'death:10', 'death:12', 'death:17', 'death:30', 'death:45',
  'idle:0', 'idle:10', 'walk:0', 'walk:3', 'walk:6', 'walk:9',
  'run:0', 'run:2', 'run:4', 'run:6', 'jump:5', 'jump:9', 'jump:14',
  'shoot:3', 'aim:0',
];
const targets = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT;

const { posable, skeleton } = loadCandidate();
const R = (key: string, lo: number, hi: number, coarse: number): KnobDef => ({ key, lo, hi, coarse });

const results: {
  anim: string; fi: number; errBefore: number; errAfter: number;
  torsoRot: number; dx: number; dy: number; neckRot: number; headRot: number;
}[] = [];

const framesCache = new Map<string, ReturnType<typeof refFrames>>();
const storeCache = new Map<string, { frames: { pose: PoseVec; err: number }[]; attachments: Record<string, string | null> }>();

for (const t of targets) {
  const [anim, fiS] = t.split(':');
  const fi = Number(fiS);
  if (!framesCache.has(anim)) framesCache.set(anim, refFrames(anim));
  if (!storeCache.has(anim)) storeCache.set(anim, JSON.parse(readFileSync(join(RUN, `fitting/poses/${anim}.json`), 'utf8')));
  const ref = framesCache.get(anim)![fi];
  const store = storeCache.get(anim)!;
  const pose: PoseVec = { ...store.frames[fi].pose };
  const box = inkBox(ref)!;
  const M = 26;
  const win: Window = {
    px0: Math.max(0, box.minX - M), py0: Math.max(0, box.minY - M),
    px1: Math.min(ref.width - 1, box.maxX + M), py1: Math.min(ref.height - 1, box.maxY + M),
  };
  const crops = new Map([[3, refCrop(ref, win, 3)], [1, refCrop(ref, win, 1)]]);
  const ctx: EvalCtx = { posable, skeleton, win, crops, attachments: store.attachments };

  const errBefore = evalPose(ctx, pose, 1);

  const tx = R('torso.x', -110, 110, 12);
  const ty = R('torso.y', -110, 110, 12);
  const trot = R('torso.rot', (pose['torso.rot'] ?? 0) - 20, (pose['torso.rot'] ?? 0) + 20, 5);
  const neck = R('neck.rot', -45, 45, 6);
  const head = R('head.rot', -160, 160, 6);
  const arms = [
    R('front-upper-arm.rot', -200, 200, 8), R('front-bracer.rot', -200, 200, 8), R('front-fist.rot', -90, 90, 8),
    R('rear-upper-arm.rot', -200, 200, 8), R('rear-bracer.rot', -200, 200, 8), R('gun.rot', -110, 110, 8),
  ];

  // k=3: place the torso subtree over the widened box
  pairScan(ctx, pose, tx, ty, 3, 12, 12);
  scan(ctx, pose, trot, 3, 4);
  localPair(ctx, pose, neck, head, 3, 16, 4);
  for (const [a, b] of [[arms[0], arms[1]], [arms[3], arms[4]]] as const) localPair(ctx, pose, a, b, 3, 14, 5);
  // k=1: refine the coupled set
  const coupled = [tx, ty, trot, neck, head, ...arms];
  localPair(ctx, pose, tx, ty, 1, 10, 2.5);
  refine(ctx, pose, coupled, 1, [4, 1.5, 0.5]);
  const errAfter = evalPose(ctx, pose, 1);

  const row = {
    anim, fi, errBefore: +errBefore.toFixed(4), errAfter: +errAfter.toFixed(4),
    torsoRot: +(pose['torso.rot'] ?? 0).toFixed(1),
    dx: +(pose['torso.x'] ?? 0).toFixed(1), dy: +(pose['torso.y'] ?? 0).toFixed(1),
    neckRot: +(pose['neck.rot'] ?? 0).toFixed(1), headRot: +(pose['head.rot'] ?? 0).toFixed(1),
  };
  results.push(row);
  console.log(`${anim} f${fi}: err ${row.errBefore} -> ${row.errAfter}  torso.rot ${row.torsoRot}  d=(${row.dx}, ${row.dy})  neck ${row.neckRot} head ${row.headRot}`);
}

writeFileSync(join(RUN, 'fitting/probe-waist.json'), JSON.stringify(results, null, 1));
console.log('wrote probe-waist.json');
