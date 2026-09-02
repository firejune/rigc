/**
 * The face pieces: where they sit, and which of the alternates is drawn.
 *
 * These three ride the head bone rather than pivoting anything, so their offsets
 * are two numbers each and the head is already placed to 0.5 frame px — which
 * makes this the one part of the setup a plain sweep can settle cleanly. It is run
 * late because `tools/ceiling.ts` found the thing it repairs: the **eye** reads a
 * visible ceiling of 82.9 % with a mean of 82.0 %, while the brief says the goggles
 * cover the eyes on every frame of both skeletons. A candidate whose goggles do not
 * cover its own eye is drawing ink the frames have none of, and the per-slot
 * ablation agreed — hiding the eye and the mouth each *improved* `aim` slightly.
 *
 * The art ships **two** eyes and **three** mouths and the brief's silence list says
 * outright that which shot uses which is not readable at this frame size. So the
 * choice below is a sweep over the alternates at their own best offsets, reported
 * with its margin: where the margin is inside the objective's own scatter the answer
 * is *the frames do not decide this* (§8), and the pick is recorded as a decision.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Physics } from '@esotericsoftware/spine-core';
import { readViewport } from './geom.ts';
import { type Setup } from './rig.ts';
import { applyPose, loadPosable, refLevels, score, type PoseVec, type Posed } from './fitlib.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';

/** Frames with the face clearly presented, from four different shots. */
const FRAMES = [
  ['aim', 'f0000'],
  ['idle', 'f0000'],
  ['idle', 'f0010'],
  ['walk', 'f0003'],
  ['shoot', 'f0000'],
  ['jump', 'f0004'],
  ['hit', 'f0004'],
  ['death', 'f0030'],
];

const vp = readViewport(join(REF, 'frames.json'));
const p = loadPosable(join(ROOT, 'spine'));
const setup: Setup = JSON.parse(readFileSync(join(ROOT, 'fit/setup.json'), 'utf8'));

const loaded = FRAMES.map(([dir, frame]) => {
  const poses: Record<string, PoseVec> = JSON.parse(
    readFileSync(join(ROOT, `fit/poses/${dir.replace('@', '_at_')}.json`), 'utf8'),
  );
  return { levels: refLevels(join(REF, dir, `${frame}.png`), vp), pose: poses[frame], key: `${dir}/${frame}` };
});

function setAttachment(posed: Posed, slot: string, name: string | null, xy: [number, number] | null): void {
  const s = posed.skeleton.findSlot(slot);
  if (!s) return;
  if (name && xy) {
    const att = posed.skeleton.getAttachment(s.data.index, name) as {
      x: number;
      y: number;
      updateSequence(): void;
    } | null;
    if (att) {
      att.x = xy[0];
      att.y = xy[1];
      att.updateSequence();
    }
  }
}

/** Mean score over the eight frames with one slot's attachment and offset applied. */
function evaluate(overrides: Record<string, string | null>, offsets: [string, [number, number]][]): number {
  let acc = 0;
  for (const f of loaded) {
    applyPose(p, f.pose, overrides);
    for (const [name, xy] of offsets) {
      const slot = name.startsWith('eye') ? 'eye' : name.startsWith('mouth') ? 'mouth' : 'goggles';
      setAttachment(p, slot, name, xy);
    }
    p.skeleton.update(0);
    p.skeleton.updateWorldTransform(Physics.update);
    acc += score(p, f.levels[3]).value;
  }
  return acc / loaded.length;
}

const only = process.argv[2];
const allCandidates: Record<string, string[]> = {
  goggles: ['goggles'],
  eye: ['eye-indifferent', 'eye-surprised'],
  mouth: ['mouth-grind', 'mouth-oooo', 'mouth-smile'],
};
const candidates = only
  ? Object.fromEntries(Object.entries(allCandidates).filter(([k]) => k === only))
  : allCandidates;

const chosen: Record<string, { name: string; xy: [number, number]; value: number; margin: number }> = {};
for (const [slot, names] of Object.entries(candidates)) {
  const others: Record<string, string | null> = {};
  // hold the other two out of the way so this one is swept on its own
  for (const s of Object.keys(allCandidates)) if (s !== slot) others[s] = null;
  const results: { name: string; xy: [number, number]; value: number }[] = [];
  for (const name of names) {
    let best = { xy: setup.attach[name] as [number, number], value: Infinity };
    for (const [radius, step] of [
      [44, 8],
      [10, 2],
      [3, 1],
    ] as [number, number][]) {
      const base = best.xy;
      for (let dy = -radius; dy <= radius; dy += step) {
        for (let dx = -radius; dx <= radius; dx += step) {
          const xy: [number, number] = [base[0] + dx, base[1] + dy];
          const v = evaluate({ ...others, [slot]: name }, [[name, xy]]);
          if (v < best.value) best = { xy, value: v };
        }
      }
    }
    results.push({ name, xy: best.xy, value: best.value });
    console.log(`  ${name.padEnd(18)} offset ${best.xy[0].toFixed(0)},${best.xy[1].toFixed(0)}  ${best.value.toFixed(3)}`);
  }
  const hidden = evaluate({ ...others, [slot]: null }, []);
  results.sort((a, b) => a.value - b.value);
  const pick = results[0];
  const margin = results.length > 1 ? results[1].value - pick.value : 0;
  chosen[slot] = { ...pick, margin };
  console.log(
    `${slot.padEnd(8)} -> ${pick.name} at ${pick.xy[0].toFixed(0)},${pick.xy[1].toFixed(0)}  ` +
      `${pick.value.toFixed(3)} (hidden: ${hidden.toFixed(3)}, margin over the runner-up ${margin.toFixed(3)})`,
  );
  for (const r of results) setup.attach[r.name] = r.xy;
  // an alternate nobody ever shows still needs a sane offset: give it the winner's
  for (const r of results) if (r.name !== pick.name) setup.attach[r.name] = pick.xy;
}

writeFileSync(join(ROOT, 'fit/setup.json'), JSON.stringify(setup, null, 2));
writeFileSync(
  join(ROOT, 'evidence/face.json'),
  JSON.stringify(
    Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, { pick: v.name, offset: v.xy, mean: v.value, margin: v.margin }])),
    null,
    1,
  ),
);
console.log(`-> ${join(ROOT, 'fit/setup.json')}`);
