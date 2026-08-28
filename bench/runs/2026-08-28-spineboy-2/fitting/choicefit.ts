/**
 * Categorical attachment choices per shot (mouth; jump/hit fist), decided by the
 * objective on a clear frame. Where the separation is inside noise the setup
 * choice ships on reasoning and the log says so.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { refFrames, RUN, inkBox } from './lib.ts';
import { loadCandidate } from './pose.ts';
import { evalPose, refCrop, type EvalCtx, type Window } from './fitcore.ts';

const { posable, skeleton } = loadCandidate();

const JOBS: { anim: string; fi: number; slot: string; candidates: string[] }[] = [
  { anim: 'idle', fi: 0, slot: 'mouth', candidates: ['mouth-smile', 'mouth-grind', 'mouth-oooo'] },
  { anim: 'walk', fi: 0, slot: 'mouth', candidates: ['mouth-smile', 'mouth-grind', 'mouth-oooo'] },
  { anim: 'run', fi: 4, slot: 'mouth', candidates: ['mouth-smile', 'mouth-grind', 'mouth-oooo'] },
  { anim: 'jump', fi: 2, slot: 'mouth', candidates: ['mouth-smile', 'mouth-grind', 'mouth-oooo'] },
  { anim: 'shoot', fi: 0, slot: 'mouth', candidates: ['mouth-smile', 'mouth-grind', 'mouth-oooo'] },
  { anim: 'aim', fi: 0, slot: 'mouth', candidates: ['mouth-smile', 'mouth-grind', 'mouth-oooo'] },
  { anim: 'hit', fi: 4, slot: 'mouth', candidates: ['mouth-smile', 'mouth-grind', 'mouth-oooo'] },
  { anim: 'death', fi: 30, slot: 'mouth', candidates: ['mouth-smile', 'mouth-grind', 'mouth-oooo'] },
  { anim: 'jump', fi: 9, slot: 'front-fist', candidates: ['front-fist-closed', 'front-fist-open'] },
  { anim: 'hit', fi: 4, slot: 'front-fist', candidates: ['front-fist-closed', 'front-fist-open'] },
];

const stores = new Map<string, { frames: { pose: Record<string, number>; err: number }[]; attachments: Record<string, string | null> }>();
function storeOf(anim: string) {
  if (!stores.has(anim)) stores.set(anim, JSON.parse(readFileSync(join(RUN, `fitting/poses/${anim}.json`), 'utf8')));
  return stores.get(anim)!;
}

for (const job of JOBS) {
  const store = storeOf(job.anim);
  const ref = refFrames(job.anim)[job.fi];
  const box = inkBox(ref)!;
  const win: Window = { px0: Math.max(0, box.minX - 26), py0: Math.max(0, box.minY - 26), px1: Math.min(ref.width - 1, box.maxX + 26), py1: Math.min(ref.height - 1, box.maxY + 26) };
  const crops = new Map([[1, refCrop(ref, win, 1)]]);
  const scores: [string, number][] = [];
  for (const cand of job.candidates) {
    const ctx: EvalCtx = { posable, skeleton, win, crops, attachments: { ...store.attachments, [job.slot]: cand } };
    scores.push([cand, evalPose(ctx, store.frames[job.fi].pose, 1)]);
  }
  scores.sort((a, b) => a[1] - b[1]);
  const sep = (scores[1][1] - scores[0][1]) / scores[0][1];
  const decided = sep > 0.004; // separation must exceed ~0.4% of the figure
  console.log(`${job.anim}/${job.slot}: ${scores.map(([n, e]) => `${n}=${e.toFixed(4)}`).join(' ')} -> ${decided ? scores[0][0] : `UNDECIDED (keep ${store.attachments[job.slot]})`}`);
  if (decided) store.attachments[job.slot] = scores[0][0];
}
for (const [anim, store] of stores) writeFileSync(join(RUN, `fitting/poses/${anim}.json`), JSON.stringify(store, null, 1));
console.log('saved');
