/**
 * Place the muzzle flare.
 *
 * The flare is the one part of this rig no stance frame can place: it exists on
 * three frames of one shot. Each numbered flare is fitted against the frame the
 * attachment timeline shows it on, with that frame's fitted body pose held
 * still, so what moves is only the flare's own offset from the muzzle bone.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RegionAttachment } from '@esotericsoftware/spine-core';
import { bbox, centroid, loadCandidate, loadFrame, maeFixed, Rigged } from './harness.ts';
import { toPose, type FramePose } from './fit-poses.ts';
import { w2p } from './geom.ts';
import { BONES } from './rigdata.ts';

const here = import.meta.dir;
const run = join(here, '..');
const rig = new Rigged(loadCandidate(join(run, 'ess', 'spine')));
const sk = rig.skeleton;
const poses: FramePose[] = JSON.parse(readFileSync(join(here, 'poses-shoot.json'), 'utf8'));
const refDir = join(run, '../../reference/spineboy/ess/shoot');

/** frame index → the attachment the shoot timeline shows there */
const SHOWN: [number, string][] = [
  [2, 'muzzle01'],
  [3, 'muzzle03'],
  [4, 'muzzle04'],
];

function att(slot: string, name: string): RegionAttachment {
  const s = sk.findSlot(slot)!;
  return sk.getAttachment(s.data.index, name) as RegionAttachment;
}
const EXTRA = { 'muzzle-glow': 'muzzle-glow', 'muzzle-ring': 'muzzle-ring' };

const refCache = new Map<number, { plate: ReturnType<typeof loadFrame>; drawn: number }>();
function refOf(i: number) {
  let r = refCache.get(i);
  if (!r) {
    const plate = loadFrame(join(refDir, `f${String(i).padStart(4, '0')}.png`));
    r = { plate, drawn: centroid(plate)[2] };
    refCache.set(i, r);
  }
  return r;
}
function scoreOn(indices: number[], shown: Record<number, string>): number {
  let s = 0;
  for (const i of indices) {
    const r = refOf(i);
    s += maeFixed(rig.render(toPose(poses[i].v, poses[i].fist, { ...EXTRA, muzzle: shown[i] })), r.plate, r.drawn);
  }
  return s / indices.length;
}

const MUZZLE_KNOBS = ['muzzle.rot', 'muzzle.sx', 'muzzle.sy'];
for (const [i] of SHOWN) {
  const p = poses[i];
  if (p.v['muzzle.sx'] === undefined) {
    p.v['muzzle.rot'] = 0;
    p.v['muzzle.sx'] = 1;
    p.v['muzzle.sy'] = 1;
  }
}

interface Group {
  atts: RegionAttachment[];
  frames: number[];
}
const shownAll: Record<number, string> = {};
for (const [i, n] of SHOWN) shownAll[i] = n;
const groups: Group[] = [];
for (const [i, n] of SHOWN) groups.push({ atts: [att('muzzle', n)], frames: [i] });
groups.push({ atts: [att('muzzle-glow', 'muzzle-glow')], frames: SHOWN.map(([i]) => i) });
groups.push({ atts: [att('muzzle-ring', 'muzzle-ring')], frames: SHOWN.map(([i]) => i) });

function nudge(g: Group, dx: number, dy: number, dr: number): void {
  for (const a of g.atts) {
    a.x += dx;
    a.y += dy;
    a.rotation += dr;
    a.updateSequence();
  }
}

/**
 * The flare is drawn much larger than its art. `muzzle03` is 166 x 106 art
 * pixels, which is 37 x 24 frame pixels at one unit per art pixel — and the
 * reference's flare reaches to column 354, about 130 px across. So the shot
 * scales it, and the scale is keyed: the flare blooms and disperses (166 →
 * 1,659 → 717 drawn pixels over three frames). Scale is fitted per flash frame
 * on the muzzle bone, which is what an editor would key.
 */
/**
 * The flare's scale is set by the box the brief measures, not by the objective.
 *
 * The difference objective barely moves for it — the flare is soft and its
 * pixels are cheap either way — so it is the wrong instrument. What the frames
 * DO state to the pixel is the subject's bounding box: 108 px wide without the
 * flare, and **189 / 202 / 218 px** on the three frames that have it, with the
 * height 152 px on all six. So the scale is solved against that width, which is
 * a measurement, and the offset is then settled by the difference.
 */
const TARGET_WIDTH: Record<number, number> = { 2: 189, 3: 202, 4: 218 };
const TARGET_HEIGHT = 152;

function boxOf(i: number): { w: number; h: number } {
  const b = bbox(rig.render(toPose(poses[i].v, poses[i].fist, { ...EXTRA, muzzle: shownAll[i] })));
  return { w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 };
}

function fitScale(global: boolean): void {
  void global;
  for (const [i] of SHOWN) {
    const p = poses[i];
    let best = Infinity;
    let bx = 1;
    let by = 1;
    for (let sx = 0.5; sx <= 6.01; sx += 0.1) {
      for (let sy = 0.4; sy <= 3.01; sy += 0.2) {
        p.v['muzzle.sx'] = sx;
        p.v['muzzle.sy'] = sy;
        const b = boxOf(i);
        // the width is the measurement; the height must not exceed the figure's
        const cost = Math.abs(b.w - TARGET_WIDTH[i]) + Math.max(0, b.h - TARGET_HEIGHT) * 2;
        if (cost < best - 1e-9) {
          best = cost;
          bx = sx;
          by = sy;
        }
      }
    }
    p.v['muzzle.sx'] = bx;
    p.v['muzzle.sy'] = by;
  }
}

function fitOffsets(): void {
  for (const g of groups) {
    let best = scoreOn(g.frames, shownAll);
    for (const [d, dr] of [
      [40, 12],
      [18, 6],
      [8, 3],
      [3, 1.5],
      [1.5, 0.7],
    ] as [number, number][]) {
      for (let pass = 0; pass < 8; pass++) {
        let moved = false;
        for (const [dx, dy, drot] of [
          [d, 0, 0],
          [-d, 0, 0],
          [0, d, 0],
          [0, -d, 0],
          [0, 0, dr],
          [0, 0, -dr],
        ]) {
          nudge(g, dx, dy, drot);
          const s = scoreOn(g.frames, shownAll);
          if (s < best - 1e-6) {
            best = s;
            moved = true;
          } else nudge(g, -dx, -dy, -drot);
        }
        if (!moved) break;
      }
    }
  }
}

// the flare's offset from the muzzle bone starts at half its own width, so a
// scale about the bone grows it away from the barrel rather than through it
for (const [i, n] of SHOWN) {
  void i;
  const a = att('muzzle', n);
  a.x = a.width / 2;
  a.y = 0;
  a.rotation = 0;
  a.updateSequence();
}
fitOffsets();
for (let round = 0; round < 3; round++) {
  fitScale(true);
  fitOffsets();
  console.log(
    `round ${round}: ${scoreOn([2, 3, 4], shownAll).toFixed(3)}  box ${SHOWN.map(([i]) => `${boxOf(i).w}/${TARGET_WIDTH[i]}`).join(' ')}  scales ${SHOWN.map(([i]) => `${poses[i].v['muzzle.sx'].toFixed(2)}x${poses[i].v['muzzle.sy'].toFixed(2)}`).join(' ')}`,
  );
}
for (const [i, n] of SHOWN) {
  poses[i].slots = { muzzle: n, 'muzzle-glow': 'muzzle-glow', 'muzzle-ring': 'muzzle-ring' };
}
writeFileSync(join(here, 'poses-shoot.json'), JSON.stringify(poses, null, 1) + '\n');

// muzzle02 and muzzle05 are never on a committed 12 fps frame; they take their
// neighbours' offsets rather than a number nothing measured
const m01 = att('muzzle', 'muzzle01');
const m03 = att('muzzle', 'muzzle03');
const m04 = att('muzzle', 'muzzle04');
for (const [name, src] of [
  ['muzzle02', m01],
  ['muzzle05', m04],
] as [string, RegionAttachment][]) {
  const a = att('muzzle', name);
  a.x = src.x;
  a.y = src.y;
  a.rotation = src.rotation;
  a.updateSequence();
}
void m03;

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
const file = join(here, 'placements.json');
const out: Record<string, { px: number; py: number; rot: number }> = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
const w = boneWorld(BONES.find((b) => b.name === 'muzzle')!.name);
for (const [slot, name] of [
  ['muzzle', 'muzzle01'],
  ['muzzle', 'muzzle02'],
  ['muzzle', 'muzzle03'],
  ['muzzle', 'muzzle04'],
  ['muzzle', 'muzzle05'],
  ['muzzle-glow', 'muzzle-glow'],
  ['muzzle-ring', 'muzzle-ring'],
] as [string, string][]) {
  const a = att(slot, name);
  const [px, py] = w2p(w[0] + a.x, w[1] + a.y);
  const key = slot === 'muzzle' ? `${slot}/${name}` : slot;
  out[key] = { px: Math.round(px * 1000) / 1000, py: Math.round(py * 1000) / 1000, rot: Math.round(a.rotation * 1000) / 1000 };
}
writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
console.log('placements.json updated for muzzle slots');
