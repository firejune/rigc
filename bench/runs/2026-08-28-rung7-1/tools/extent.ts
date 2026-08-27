/**
 * Rung 7 — why `check` refused frames.json's own box, and which frame is short.
 *
 * §9.2: `check` renders the candidate into the box `frames.json` records and keeps that
 * box if the candidate's pixels land on the reference's to within a pixel of corner
 * spread. On this candidate it refused, and fell back to a fitted box 0.67 % smaller —
 * and a fraction of a percent of scale is worth several MAE, with the declared box worth
 * 15-25 on the shot it was measured on.
 *
 * The refusal is decided on the UNION content box over every compared frame, so one
 * frame whose extreme is short moves it. This prints the union box per set in the
 * declared coordinates, then the per-frame extremes, so the frame responsible is named
 * rather than guessed.
 */
import { readFileSync } from 'node:fs';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { applyPose, framesBox, makeRig, renderInto, windowViewport, type Knob } from './pose.ts';
import { masksOf, frameFiles, ANIMS } from './frames.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const RUN = 'bench/runs/2026-08-28-rung7-1';

const store = JSON.parse(readFileSync(`${RUN}/placements.json`, 'utf8')) as {
  knobs: Knob[];
  values: Record<string, number[][]>;
};
const rig = makeRig(`${RUN}/spine`);
const ref = framesBox(ROOT);
const view = windowViewport(ref, 0, 0, ref.width, ref.height, 1);
const plate = new Plate(ref.width, ref.height);

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
const grow = (a: Box | null, m: { left: number; top: number; right: number; bottom: number }): Box =>
  a
    ? { l: Math.min(a.l, m.left), t: Math.min(a.t, m.top), r: Math.max(a.r, m.right), b: Math.max(a.b, m.bottom) }
    : { l: m.left, t: m.top, r: m.right, b: m.bottom };

let myAll: Box | null = null;
let refAll: Box | null = null;
console.log('union content box per set, in frames.json\'s own coordinates (pixels)');
console.log('  set                       mine                       reference                  Δleft Δtop Δright Δbottom');
const worst: { name: string; d: number; which: string }[] = [];
for (const set of ANIMS) {
  const files = frameFiles(set);
  const n = Math.min(files.length, store.values[set].length);
  let mine: Box | null = null;
  let rf: Box | null = null;
  for (let i = 0; i < n; i++) {
    applyPose(rig, store.knobs, store.values[set][i]);
    renderInto(rig, plate, view);
    const m = masksOf(plate).all;
    const r = masksOf(readPlate(`${ROOT}/${set}/${files[i]}`)).all;
    mine = grow(mine, m);
    rf = grow(rf, r);
    // which frames set each extreme, and by how much they disagree
    for (const [name, a, b] of [
      ['left', m.left, r.left],
      ['top', m.top, r.top],
      ['right', m.right, r.right],
      ['bottom', m.bottom, r.bottom],
    ] as [string, number, number][])
      worst.push({ name: `${set}/f${String(i).padStart(4, '0')}`, d: Math.abs(a - b), which: name });
  }
  myAll = grow(myAll, { left: mine!.l, top: mine!.t, right: mine!.r, bottom: mine!.b });
  refAll = grow(refAll, { left: rf!.l, top: rf!.t, right: rf!.r, bottom: rf!.b });
  console.log(
    `  ${set.padEnd(24)} [${mine!.l},${mine!.t}..${mine!.r},${mine!.b}] ${String(mine!.r - mine!.l + 1).padStart(4)}x${String(mine!.b - mine!.t + 1).padStart(3)}   ` +
      `[${rf!.l},${rf!.t}..${rf!.r},${rf!.b}] ${String(rf!.r - rf!.l + 1).padStart(4)}x${String(rf!.b - rf!.t + 1).padStart(3)}   ` +
      `${String(mine!.l - rf!.l).padStart(5)} ${String(mine!.t - rf!.t).padStart(4)} ${String(mine!.r - rf!.r).padStart(6)} ${String(mine!.b - rf!.b).padStart(8)}`,
  );
}
console.log(
  `  ${'ALL 4 SETS'.padEnd(24)} [${myAll!.l},${myAll!.t}..${myAll!.r},${myAll!.b}] ${myAll!.r - myAll!.l + 1}x${myAll!.b - myAll!.t + 1}   ` +
    `[${refAll!.l},${refAll!.t}..${refAll!.r},${refAll!.b}] ${refAll!.r - refAll!.l + 1}x${refAll!.b - refAll!.t + 1}   ` +
    `${myAll!.l - refAll!.l} ${myAll!.t - refAll!.t} ${myAll!.r - refAll!.r} ${myAll!.b - refAll!.b}`,
);
worst.sort((a, b) => b.d - a.d);
console.log('\nthe ten frames whose own box edge is furthest out:');
for (const w of worst.slice(0, 10)) console.log(`  ${w.name.padEnd(26)} ${w.which.padEnd(7)} out by ${w.d} px`);
