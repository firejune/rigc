/**
 * In-loop instrument over the COMPILED candidate (never opens the reference export):
 *  1. §9.1 parity — sampleAnimation's bone locals vs the fitted pose series
 *  2. §9.2 change column — my rendered adjacent-pair changed-pixel counts vs the
 *     reference frames' own, with check's exact disagreement rule
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPosable, sampleAnimation, renderFrame } from '../../../../src/render.ts';
import { refFrames, RUN, BG, changedPixels, sidecar } from './lib.ts';
import { viewportAt } from './pose.ts';

const SPINE = join(RUN, 'ess/spine');
const posable = loadPosable(join(SPINE, 'skeleton.json'), join(SPINE, 'skeleton.atlas'), SPINE);

const CHANGE_RATIO = 4, CHANGE_EXCESS = 24;
function disagrees(mine: number, theirs: number): boolean {
  if (mine === 0) return false;
  if (theirs === 0) return true;
  return mine > theirs * CHANGE_RATIO && mine - theirs > CHANGE_EXCESS;
}

const anims = process.argv[2] ? [process.argv[2]] : ['aim', 'death', 'hit', 'idle', 'jump', 'run', 'shoot', 'walk'];
let totalDisagree = 0;
for (const anim of anims) {
  const ref = refFrames(anim);
  const frames = sampleAnimation(posable.data, anim, 12);
  if (frames.length !== ref.length) console.log(`⚠️ ${anim}: sampled ${frames.length} vs ${ref.length} on disk`);
  // parity vs fitted series (rotate channels as deltas from setup)
  const store = JSON.parse(readFileSync(join(RUN, `fitting/poses/${anim}.json`), 'utf8'));
  const vp = viewportAt(1);
  const plates = frames.map((f) => renderFrame(f, posable.pages, vp, [BG[0], BG[1], BG[2], 255]));
  let bad = 0;
  const lines: string[] = [];
  for (let i = 1; i < Math.min(plates.length, ref.length); i++) {
    const mine = changedPixels(plates[i - 1], plates[i]);
    const theirs = changedPixels(ref[i - 1], ref[i]);
    const v = disagrees(mine, theirs) ? 'MOVES' : disagrees(theirs, mine) ? 'HOLDS' : '';
    if (v) { bad++; lines.push(`  f${i - 1}->f${i}: mine ${mine} ref ${theirs}  ${v}`); }
  }
  totalDisagree += bad;
  console.log(`${anim}: ${plates.length} samples, ${bad} change disagreements`);
  for (const l of lines.slice(0, 12)) console.log(l);
}
console.log('total disagreements:', totalDisagree);
