/**
 * Refine the setup placements against SEVERAL fitted frames at once.
 *
 * Fitting a part's offset against one frame lets a wrong offset hide inside
 * that frame's own bone rotations — the two are not separable from a single
 * pose. Across frames they are: an offset has to be the same in all of them and
 * the rotations do not. This is §8's cross-check ("run the same estimator over
 * two shots and cross-check a quantity that must agree between them") applied
 * to the rig rather than to a measurement.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RegionAttachment } from '@esotericsoftware/spine-core';
import { loadCandidate, loadFrame, mae, Rigged } from './harness.ts';
import { toPose, type FramePose } from './fit-poses.ts';
import { w2p } from './geom.ts';
import { PARTS } from './rigdata.ts';

const here = import.meta.dir;
const run = join(here, '..');
const rig = new Rigged(loadCandidate(join(run, 'ess', 'spine')));
const sk = rig.skeleton;

const PICKS: [string, number][] = [
  ['idle', 0],
  ['idle', 6],
  ['idle', 13],
  ['aim', 0],
  ['walk', 0],
  ['walk', 6],
  ['run', 2],
  ['jump', 8],
  ['hit', 0],
  ['death', 30],
];
const frames: { pose: FramePose; ref: ReturnType<typeof loadFrame> }[] = [];
for (const [anim, i] of PICKS) {
  const path = join(here, `poses-${anim}.json`);
  let poses: FramePose[];
  try {
    poses = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    continue;
  }
  if (!poses[i]) continue;
  frames.push({
    pose: poses[i],
    ref: loadFrame(join(run, '../../reference/spineboy/ess', anim, `f${String(i).padStart(4, '0')}.png`)),
  });
}
console.log(`refining against ${frames.length} fitted frames`);

const score = () => frames.reduce((s, f) => s + mae(rig.render(toPose(f.pose.v, f.pose.fist)), f.ref), 0) / frames.length;

interface Handle {
  slot: string;
  bone: string;
  atts: RegionAttachment[];
}
const handles: Handle[] = [];
for (const p of PARTS) {
  if (!p.setup) continue;
  const slot = sk.findSlot(p.slot)!;
  const atts = p.attachments
    .map((a) => sk.getAttachment(slot.data.index, a))
    .filter((a): a is RegionAttachment => a instanceof RegionAttachment);
  handles.push({ slot: p.slot, bone: p.bone, atts });
}
function nudge(h: Handle, dx: number, dy: number, drot: number): void {
  for (const a of h.atts) {
    a.x += dx;
    a.y += dy;
    a.rotation += drot;
    a.updateSequence();
  }
}

let best = score();
console.log('start', best.toFixed(3));
for (const [d, dr] of [
  [8, 4],
  [4, 2],
  [2, 1],
  [1, 0.5],
  [0.5, 0.25],
] as [number, number][]) {
  for (let pass = 0; pass < 5; pass++) {
    let moved = false;
    for (const h of handles) {
      for (const [dx, dy, drot] of [
        [d, 0, 0],
        [-d, 0, 0],
        [0, d, 0],
        [0, -d, 0],
        [0, 0, dr],
        [0, 0, -dr],
      ]) {
        nudge(h, dx, dy, drot);
        const s = score();
        if (s < best - 1e-6) {
          best = s;
          moved = true;
        } else nudge(h, -dx, -dy, -drot);
      }
    }
    if (!moved) break;
  }
  console.log(`step ${d}/${dr}: ${best.toFixed(3)}`);
}

function boneWorld(name: string): [number, number] {
  let x = 0;
  let y = 0;
  let b = sk.findBone(name);
  while (b) {
    x += b.data.setupPose.x;
    y += b.data.setupPose.y;
    b = b.parent;
  }
  return [x, y];
}
const out: Record<string, { px: number; py: number; rot: number }> = {};
for (const h of handles) {
  const w = boneWorld(h.bone);
  const a = h.atts[0];
  const [px, py] = w2p(w[0] + a.x, w[1] + a.y);
  out[h.slot] = { px: r3(px), py: r3(py), rot: r3(a.rotation) };
}
function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
writeFileSync(join(here, 'placements.json'), JSON.stringify(out, null, 2) + '\n');
console.log('final', best.toFixed(3));
