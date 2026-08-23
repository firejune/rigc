/**
 * The shot's own quantities, measured on the candidate and on the reference with
 * **the same estimator**, so its bias cancels.
 *
 * Every quantity here is one the brief states, in the brief's own terms — its
 * 8/255 subject mask, its floor row from `frames.json`'s viewport, its
 * ground-contact band, its teal predicate split at 45 % of the box height, its
 * flare predicate. Reproducing the brief's numbers off the reference is the
 * control; the candidate column is the answer.
 *
 *   bun … tools/selfcheck.ts <candidate-dir>
 */
import { loadPosable, sampleAnimation, renderFrame } from '../../../../src/render.ts';
import type { Plate } from '../../../../tools/plate.ts';
import { refFrame, viewportOf, subject, BG } from './lib.ts';

const [dir] = process.argv.slice(2);
const p = loadPosable(`${dir}/skeleton.json`, `${dir}/skeleton.atlas`, dir);
const v = viewportOf('ess');
const FLOOR = 335.96;

const drawn = (pl: Plate, x: number, y: number): boolean => {
  const i = (y * pl.width + x) * 4;
  return (
    Math.abs(pl.data[i] - BG[0]) > 8 || Math.abs(pl.data[i + 1] - BG[1]) > 8 || Math.abs(pl.data[i + 2] - BG[2]) > 8
  );
};

/** Columns carrying a drawn pixel in [floor−8, floor+4], grouped with a 2-column gap. */
function contactGroups(pl: Plate): number {
  const lo = Math.round(FLOOR - 8);
  const hi = Math.round(FLOOR + 4);
  const cols: number[] = [];
  for (let x = 0; x < pl.width; x++) {
    for (let y = lo; y <= hi && y < pl.height; y++) {
      if (drawn(pl, x, y)) {
        cols.push(x);
        break;
      }
    }
  }
  let groups = 0;
  for (let i = 0; i < cols.length; i++) if (i === 0 || cols[i] - cols[i - 1] > 3) groups++;
  return groups;
}

/** The gun's own share of the teal: the lower half of the subject's box. */
function gunTeal(pl: Plate): number {
  const s = subject(pl);
  const split = s.minY + (s.maxY - s.minY) * 0.55;
  let n = 0;
  for (let y = Math.ceil(split); y <= s.maxY; y++) {
    for (let x = s.minX; x <= s.maxX; x++) {
      const i = (y * pl.width + x) * 4;
      const [r, g, b] = [pl.data[i], pl.data[i + 1], pl.data[i + 2]];
      if (g > 100 && g > r + 30 && b > r + 15 && b < g + 40) n++;
    }
  }
  return n;
}

function flare(pl: Plate): number {
  let n = 0;
  for (let y = 0; y < pl.height; y++)
    for (let x = 0; x < pl.width; x++) {
      const i = (y * pl.width + x) * 4;
      const [r, g, b] = [pl.data[i], pl.data[i + 1], pl.data[i + 2]];
      if (r > 200 && b > 140 && g < Math.min(r, b) - 30) n++;
    }
  return n;
}

const SETS: Record<string, number> = { aim: 1, death: 60, hit: 5, idle: 21, jump: 17, run: 9, shoot: 6, walk: 13 };
const row = (label: string, a: (string | number)[], b: (string | number)[]) =>
  `${label.padEnd(22)} candidate ${a.join(' ')}\n${' '.repeat(22)} reference ${b.join(' ')}`;

for (const [set, n] of Object.entries(SETS)) {
  const frames = sampleAnimation(p.data, set, 12);
  const mine = frames.map((f) => renderFrame(f, p.pages, v, BG));
  const theirs = Array.from({ length: n }, (_, i) => refFrame('ess', set, i));
  console.log(`\n── ${set} ──`);
  console.log(row('lowest drawn row', mine.map((m) => subject(m).maxY), theirs.map((m) => subject(m).maxY)));
  console.log(row('box width', mine.map((m) => subject(m).maxX - subject(m).minX + 1), theirs.map((m) => subject(m).maxX - subject(m).minX + 1)));
  console.log(row('box height', mine.map((m) => subject(m).maxY - subject(m).minY + 1), theirs.map((m) => subject(m).maxY - subject(m).minY + 1)));
  console.log(row('centroid x', mine.map((m) => subject(m).cx.toFixed(1)), theirs.map((m) => subject(m).cx.toFixed(1))));
  console.log(row('ground-contact groups', mine.map(contactGroups), theirs.map(contactGroups)));
  if (set === 'idle' || set === 'walk') console.log(row('gun teal (lower)', mine.map(gunTeal), theirs.map(gunTeal)));
  if (set === 'shoot') console.log(row('flare px', mine.map(flare), theirs.map(flare)));
}
