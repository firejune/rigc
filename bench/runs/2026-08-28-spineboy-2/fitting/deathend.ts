/** Fit the death@30fps LAST still (t=148/30) — a pose no 12fps frame carries. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPlate } from '../../../../tools/plate.ts';
import { RUN, REF, inkBox } from './lib.ts';
import { loadCandidate, type PoseVec } from './pose.ts';
import { evalPose, refCrop, refine, localTriple, type EvalCtx, type KnobDef, type Window } from './fitcore.ts';

const { posable, skeleton } = loadCandidate();
const ref = readPlate(join(REF, 'death@30fps/f0148.png'));
const store = JSON.parse(readFileSync(join(RUN, 'fitting/poses/death.json'), 'utf8'));
const R = (key: string, lo: number, hi: number, coarse: number): KnobDef => ({ key, lo, hi, coarse });
const WAVE: KnobDef[] = [
  R('front-upper-arm.rot', -170, 170, 10),
  R('front-bracer.rot', -170, 170, 10),
  R('front-fist.rot', -110, 110, 10),
  R('head.rot', -80, 80, 8),
  R('neck.rot', -40, 40, 8),
];
const box = inkBox(ref)!;
const M = 26;
const win: Window = { px0: Math.max(0, box.minX - M), py0: Math.max(0, box.minY - M), px1: Math.min(ref.width - 1, box.maxX + M), py1: Math.min(ref.height - 1, box.maxY + M) };
const crops = new Map([[3, refCrop(ref, win, 3)], [1, refCrop(ref, win, 1)]]);
const ctx: EvalCtx = { posable, skeleton, win, crops, attachments: store.attachments };
const pose: PoseVec = { ...store.frames[59].pose };
localTriple(ctx, pose, WAVE[0], WAVE[1], WAVE[2], 1, 14, 4.5);
const e = refine(ctx, pose, WAVE, 1, [4, 1.5, 0.5]);
writeFileSync(join(RUN, 'fitting/poses/death-end.json'), JSON.stringify({ pose, err: e }, null, 1));
console.log('death end pose err', e.toFixed(4));
