/**
 * Attempt-5: re-impose death's dead hold after the per-frame refits.
 * f17..f26 must be POSE-IDENTICAL (the reference's nine pairs read 0,0,0,0,0,1,
 * 0,0,0 at 8/255; genmotion authors the one-pixel blip and the f13-f16 boot
 * settle on top). Pick the refitted pose among f13..f26 with the lowest MEAN
 * error over frames f17..f26, assign it to f13..f26 (feet included — genmotion
 * adds its settle degrees relative to these values).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { refFrames, RUN, inkBox } from './lib.ts';
import { loadCandidate, type PoseVec } from './pose.ts';
import { evalPose, refCrop, type EvalCtx, type Window } from './fitcore.ts';

const { posable, skeleton } = loadCandidate();
const frames = refFrames('death');
const poseFile = join(RUN, 'fitting/poses/death.json');
const store = JSON.parse(readFileSync(poseFile, 'utf8')) as {
  frames: { pose: PoseVec; err: number | null }[]; attachments: Record<string, string | null>;
};

const HOLD_EVAL = [17, 20, 23, 26];
const ctxs: EvalCtx[] = HOLD_EVAL.map((fi) => {
  const ref = frames[fi];
  const box = inkBox(ref)!;
  const M = 26;
  const win: Window = {
    px0: Math.max(0, box.minX - M), py0: Math.max(0, box.minY - M),
    px1: Math.min(ref.width - 1, box.maxX + M), py1: Math.min(ref.height - 1, box.maxY + M),
  };
  return { posable, skeleton, win, crops: new Map([[1, refCrop(ref, win, 1)]]), attachments: store.attachments };
});

let best: { fi: number; mean: number } | null = null;
for (let fi = 13; fi <= 26; fi++) {
  const pose = store.frames[fi].pose;
  let sum = 0;
  for (const c of ctxs) sum += evalPose(c, pose, 1);
  const mean = sum / ctxs.length;
  console.log(`f${fi} pose: mean hold err ${mean.toFixed(4)}`);
  if (!best || mean < best.mean) best = { fi, mean };
}
console.log(`hold pose = f${best!.fi} (mean ${best!.mean.toFixed(4)})`);
const hold = store.frames[best!.fi].pose;
for (let fi = 13; fi <= 26; fi++) {
  store.frames[fi] = { pose: { ...hold }, err: +best!.mean.toFixed(4) };
}
writeFileSync(poseFile, JSON.stringify(store, null, 1));
console.log('unified f13..f26 and saved');
