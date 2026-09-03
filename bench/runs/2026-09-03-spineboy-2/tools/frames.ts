/**
 * The frame-side census this run does BEFORE any planner runs.
 *
 * AUTHORING §10.3: "Difference every adjacent pair of frames once, before the
 * planner runs. It is one pass over the set, and it tells you whether this
 * paragraph applies to you at all" — the paragraph being the snap-to-still
 * step, which manufactures a defect on a shot that never holds.
 *
 * Everything here is measured at 8/255 (`CHANGE_TOLERANCE` in
 * `src/check.ts`, and `BACKGROUND_TOLERANCE` in `src/framing.ts` — they are the
 * same constant), which is the threshold the per-frame comparison reads at. The
 * brief counts at 2/255 and says so; both are printed, because the brief's own
 * revision-4 finding is that the two disagree on one passage.
 */
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { changedPixels, declaredViewport, inkStats, loadFrame, sidecarOf } from './geom';

const root = process.argv[2] ?? 'bench/reference/spineboy/ess';
const out = process.argv[3] ?? 'bench/runs/2026-09-03-spineboy-2/evidence/frame-census.json';

const sidecar = sidecarOf(root);
const view = declaredViewport(sidecar);
const floorRow = (view.maxY - 0) * view.scale;

interface SetCensus {
  dir: string;
  animation: string;
  fps: number;
  sampled: number;
  onDisk: number;
  duration: number;
  frames: { index: number; file: string; box: [number, number, number, number] | null; pixels: number; cx: number; cy: number; lowestRow: number | null }[];
  pairs8: number[];
  pairs2: number[];
  exactHolds8: number[];
  firstToLast8: number | null;
  firstToLast2: number | null;
}

const census: { root: string; floorRow: number; scale: number; sets: SetCensus[] } = {
  root,
  floorRow,
  scale: view.scale,
  sets: [],
};

for (const set of sidecar.sets) {
  const dir = join(root, set.dir);
  const files = readdirSync(dir)
    .filter((f) => /^f\d+\.png$/.test(f))
    .sort();
  const plates = files.map((f) => loadFrame(join(dir, f)));
  const entry: SetCensus = {
    dir: set.dir,
    animation: set.animation,
    fps: set.fps,
    sampled: set.sampled,
    onDisk: files.length,
    duration: set.duration,
    frames: [],
    pairs8: [],
    pairs2: [],
    exactHolds8: [],
    firstToLast8: null,
    firstToLast2: null,
  };
  for (let i = 0; i < plates.length; i++) {
    const s = inkStats(plates[i]);
    entry.frames.push({
      index: Number(files[i].slice(1, -4)),
      file: files[i],
      box: s.box ? [s.box.left, s.box.top, s.box.right, s.box.bottom] : null,
      pixels: s.pixels,
      cx: Number(s.cx.toFixed(2)),
      cy: Number(s.cy.toFixed(2)),
      lowestRow: s.box ? s.box.bottom : null,
    });
  }
  // Adjacent pairs only where the two files really are adjacent samples.
  for (let i = 1; i < plates.length; i++) {
    if (entry.frames[i].index !== entry.frames[i - 1].index + 1) {
      entry.pairs8.push(-1);
      entry.pairs2.push(-1);
      continue;
    }
    const c8 = changedPixels(plates[i - 1], plates[i], 8);
    entry.pairs8.push(c8);
    entry.pairs2.push(changedPixels(plates[i - 1], plates[i], 2));
    if (c8 === 0) entry.exactHolds8.push(entry.frames[i - 1].index);
  }
  if (plates.length >= 2) {
    entry.firstToLast8 = changedPixels(plates[0], plates[plates.length - 1], 8);
    entry.firstToLast2 = changedPixels(plates[0], plates[plates.length - 1], 2);
  }
  census.sets.push(entry);
  const moving = entry.pairs8.filter((n) => n > 0).length;
  const held = entry.pairs8.filter((n) => n === 0).length;
  process.stderr.write(
    `${set.dir.padEnd(16)} ${String(files.length).padStart(3)} on disk  pairs: ${moving} moving, ${held} held at 8/255` +
      `${entry.firstToLast8 === null ? '' : `  first->last ${entry.firstToLast8} (8) / ${entry.firstToLast2} (2)`}\n`,
  );
}

writeFileSync(out, `${JSON.stringify(census)}\n`);
process.stderr.write(`\nfloor row = ${floorRow.toFixed(2)} (world y=0), scale ${view.scale.toFixed(6)} px/unit\nwrote ${out}\n`);
