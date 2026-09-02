/**
 * The two things this rig switches rather than moves: which fist, and the flare.
 *
 * **The fist.** The art ships one closed and one open near fist and no rear fist at
 * all, so they share a slot — §10.1's own rule that a shared slot is for
 * alternatives. Which one a shot uses is decidable by rendering both and reading
 * the difference over the pixels that differ, which is §8's structural sweep at its
 * smallest: one slot, two attachments, and a per-frame tally beside the aggregate
 * because *"an edge the frames really decide wins shot after shot rather than on a
 * couple of them"*.
 *
 * **The flare.** `muzzle01..05`, `muzzle-glow` and `muzzle-ring` are drawn on three
 * frames of `shoot` and nowhere else in `ess`, and the brief says outright that
 * which numbered flare sits on which frame is not something the frames can tell
 * you. So the sequence is a recorded decision; what is *measured* is the muzzle
 * bone's angle and scale, swept against the three frames the flare is on, because
 * the flare reaches 218 px of box where the figure alone reaches 108 and no
 * attachment at its own size covers that.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Physics } from '@esotericsoftware/spine-core';
import { readViewport } from './geom.ts';
import { applyPose, loadPosable, refLevels, score, type PoseVec, type Posed } from './fitlib.ts';
import { setsOf } from './fit.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';

const vp = readViewport(join(REF, 'frames.json'));
const p = loadPosable(join(ROOT, 'spine'));

function poseFile(dir: string): string {
  return join(ROOT, `fit/poses/${dir.replace('@', '_at_')}.json`);
}

/** Apply a pose with an explicit attachment override and score it at full res. */
function scoreWith(
  posed: Posed,
  pose: PoseVec,
  framePath: string,
  attachments: Record<string, string | null>,
  extra?: (p: Posed) => void,
): number {
  const levels = refLevels(framePath, vp);
  applyPose(posed, pose, attachments);
  if (extra) {
    extra(posed);
    posed.skeleton.update(0);
    posed.skeleton.updateWorldTransform(Physics.update);
  }
  return score(posed, levels[3]).value;
}

// ---------------------------------------------------------------------------
// the fist
// ---------------------------------------------------------------------------

const fist: Record<string, string> = {};
for (const set of setsOf()) {
  if (set.dir.endsWith('@30fps')) continue;
  const poses: Record<string, PoseVec> = JSON.parse(readFileSync(poseFile(set.dir), 'utf8'));
  let closed = 0;
  let open = 0;
  let winsClosed = 0;
  for (const f of set.frames) {
    const frame = f.replace('.png', '');
    const path = join(REF, set.dir, f);
    const a = scoreWith(p, poses[frame], path, { 'front-fist': 'front-fist-closed' });
    const b = scoreWith(p, poses[frame], path, { 'front-fist': 'front-fist-open' });
    closed += a;
    open += b;
    if (a <= b) winsClosed++;
  }
  const n = set.frames.length;
  fist[set.dir] = closed <= open ? 'front-fist-closed' : 'front-fist-open';
  console.log(
    `${set.dir.padEnd(6)} fist: closed ${(closed / n).toFixed(2)} vs open ${(open / n).toFixed(2)} ` +
      `over ${n} frame(s), closed wins ${winsClosed}/${n} -> ${fist[set.dir].replace('front-fist-', '')}`,
  );
}

// ---------------------------------------------------------------------------
// the flare
// ---------------------------------------------------------------------------

const FLASH_FRAMES = ['f0002', 'f0003', 'f0004'];
const shootPoses: Record<string, PoseVec> = JSON.parse(readFileSync(poseFile('shoot'), 'utf8'));
const flareOn: Record<string, string | null> = {
  muzzle: 'muzzle03',
  'muzzle-glow': 'muzzle-glow',
  'muzzle-ring': 'muzzle-ring',
};
const setMuzzle = (rot: number, scale: number) => (posed: Posed) => {
  const bone = posed.bones.get('muzzle');
  if (!bone) return;
  bone.pose.rotation = rot;
  bone.pose.scaleX = scale;
  bone.pose.scaleY = scale;
};

let best = { rot: 0, scale: 1, value: Infinity };
for (let rot = -180; rot <= 175; rot += 5) {
  for (let scale = 0.6; scale <= 3.4; scale += 0.2) {
    let acc = 0;
    for (const frame of FLASH_FRAMES) {
      acc += scoreWith(p, shootPoses[frame], join(REF, 'shoot', `${frame}.png`), flareOn, setMuzzle(rot, scale));
    }
    if (acc < best.value) best = { rot, scale, value: acc };
  }
}
for (let it = 0; it < 3; it++) {
  const rStep = 2 / (it + 1);
  const sStep = 0.08 / (it + 1);
  for (let dr = -3; dr <= 3; dr++) {
    for (let ds = -3; ds <= 3; ds++) {
      const rot = best.rot + dr * rStep;
      const scale = Math.max(0.3, best.scale + ds * sStep);
      let acc = 0;
      for (const frame of FLASH_FRAMES) {
        acc += scoreWith(p, shootPoses[frame], join(REF, 'shoot', `${frame}.png`), flareOn, setMuzzle(rot, scale));
      }
      if (acc < best.value) best = { rot, scale, value: acc };
    }
  }
}

// what the same three frames score with the flare hidden, as the control
let without = 0;
for (const frame of FLASH_FRAMES) {
  without += scoreWith(p, shootPoses[frame], join(REF, 'shoot', `${frame}.png`), {
    muzzle: null,
    'muzzle-glow': null,
    'muzzle-ring': null,
  });
}
console.log(
  `flare: muzzle rotate ${best.rot.toFixed(1)} deg scale x${best.scale.toFixed(2)} — ` +
    `${(best.value / 3).toFixed(2)} mean over f2-f4 against ${(without / 3).toFixed(2)} with no flare drawn`,
);

writeFileSync(
  join(ROOT, 'fit/switches.json'),
  JSON.stringify({ fist, muzzle: { rotate: best.rot, scale: best.scale } }, null, 1),
);
console.log(`-> ${join(ROOT, 'fit/switches.json')}`);
