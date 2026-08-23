/**
 * Place every part against `ess/idle/f0000` by rendering the whole figure and
 * minimising the difference. A per-part template match cannot do this: §8's
 * first trap is exactly that two parts which touch become one blob, and on a
 * character almost every part touches another. The render occludes the way the
 * picture occludes, so the objective is honest where a template's is not.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RegionAttachment } from '@esotericsoftware/spine-core';
import { loadCandidate, loadFrame, mae, Rigged, type Pose } from './harness.ts';
import { w2p } from './geom.ts';
import { PARTS } from './rigdata.ts';

const run = join(import.meta.dir, '..');
const rig = new Rigged(loadCandidate(join(run, 'ess', 'spine')));
const ref = loadFrame(join(run, '../../reference/spineboy/ess/idle/f0000.png'));
const sk = rig.skeleton;

const pose: Pose = { bones: {} };
const score = () => mae(rig.render(pose), ref);

interface Handle {
  slot: string;
  atts: RegionAttachment[];
  bone: string;
}
const handles: Handle[] = [];
for (const p of PARTS) {
  if (!p.setup) continue;
  const slot = sk.findSlot(p.slot)!;
  const atts = p.attachments
    .map((a) => sk.getAttachment(slot.data.index, a))
    .filter((a): a is RegionAttachment => a instanceof RegionAttachment);
  handles.push({ slot: p.slot, atts, bone: p.bone });
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
console.log('start MAE', best.toFixed(3));
const steps: [number, number][] = [
  [16, 8],
  [8, 4],
  [4, 2],
  [2, 1],
  [1, 0.5],
  [0.5, 0.25],
];
for (const [d, dr] of steps) {
  for (let pass = 0; pass < 6; pass++) {
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
        } else {
          nudge(h, -dx, -dy, -drot);
        }
      }
    }
    if (!moved) break;
  }
  console.log(`step ${d}/${dr}: MAE ${best.toFixed(3)}`);
}

const out: Record<string, { px: number; py: number; rot: number }> = {};
for (const h of handles) {
  const bone = sk.findBone(h.bone)!;
  void bone;
  const a = h.atts[0];
  const world = boneWorld(h.bone);
  const [px, py] = w2p(world[0] + a.x, world[1] + a.y);
  out[h.slot] = { px: r2(px), py: r2(py), rot: r2(a.rotation) };
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
function r2(v: number): number {
  return Math.round(v * 1000) / 1000;
}
writeFileSync(join(import.meta.dir, 'placements.json'), JSON.stringify(out, null, 2) + '\n');
rig.render(pose).writePng(join(import.meta.dir, 'setup.png'));
console.log('final MAE', best.toFixed(3));
