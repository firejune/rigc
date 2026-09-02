/**
 * The visible-footprint ceiling of every slot, over every frame of every set.
 *
 * ⭐ This is the evidence GATE.md's **G2 v2.3** read-down asks for, and it is
 * measured rather than argued: *"a measured ceiling on its attributability, below
 * the bar attribution requires. The ceiling is an instrument-side geometric fact
 * about the slot's visible footprint — the share of a covering placement of it
 * that the frames put on screen at all — measured on every frame of every set
 * rather than argued from one, and computed from stated conventions. The bar is
 * calibrated on the slots of the same corpus that the instrument does attribute."*
 *
 * The conventions, stated:
 *
 * - **visible share** = the alpha-weighted share of the slot's own material that
 *   nothing drawn after it in the candidate's own draw order covers, at the pose
 *   the candidate holds on that frame. It is the candidate's own geometry — the
 *   reference is nothing but pixels here, as `check`'s own chain block puts it.
 * - a pixel counts as **covering** at alpha ≥ 96/255, the same threshold
 *   `tools/place.ts` uses for its occluder masks.
 * - the ceiling reported per slot is the **maximum over all 147 committed frames**,
 *   which is the most generous reading available: if a slot's best frame still
 *   shows a small share of it, no frame shows more.
 *
 * 🚫 What this file does NOT do is decide anything. `check` is the instrument that
 * attributes, and a slot's blank drift row is `check`'s answer, not this one's.
 * This measures the geometry beside it so a verdict can name its evidence.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPlate } from '../../../../tools/plate.ts';
import { piecesOf, projector, rasterisePiece, viewportOfSize } from '../../../../src/render.ts';
import { Plate } from '../../../../tools/plate.ts';
import { readViewport } from './geom.ts';
import { SLOTS } from './rig.ts';
import { applyPose, loadPosable, type PoseVec } from './fitlib.ts';
import { setsOf } from './fit.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';

const vp = readViewport(join(REF, 'frames.json'));
const viewport = viewportOfSize(vp.minX, vp.minY, vp.maxX - vp.minX, vp.maxY - vp.minY, vp.scale, vp.width, vp.height);
const project = projector(viewport);
const p = loadPosable(join(ROOT, 'spine'));
const target = new Plate(vp.width, vp.height);
const SLOT_ORDER = SLOTS.map((s) => s.slot);

interface Row {
  frames: number;
  best: number;
  bestAt: string;
  mean: number;
}
const rows = new Map<string, Row>();

for (const set of setsOf()) {
  const file = join(ROOT, `fit/poses/${set.dir.replace('@', '_at_')}.json`);
  if (!existsSync(file)) continue;
  const poses: Record<string, PoseVec> = JSON.parse(readFileSync(file, 'utf8'));
  for (const f of set.frames) {
    const frame = f.replace('.png', '');
    if (!poses[frame]) continue;
    applyPose(p, poses[frame]);
    // one alpha mask per drawn slot, then the union of everything after it
    const own = new Map<string, { mask: Float32Array; weight: number }>();
    for (const piece of piecesOf(p.skeleton)) {
      const page = p.pages.get(piece.page);
      if (!page) continue;
      const mask = new Float32Array(vp.width * vp.height);
      let weight = 0;
      rasterisePiece(page, piece, project, target, (px, py, _r, _g, _b, a) => {
        const ix = Math.round(px);
        const iy = Math.round(py);
        if (ix < 0 || iy < 0 || ix >= vp.width || iy >= vp.height) return;
        const w = a / 255;
        mask[iy * vp.width + ix] = Math.max(mask[iy * vp.width + ix], w);
        weight += w;
      });
      own.set(piece.slot, { mask, weight });
    }
    for (let i = 0; i < SLOT_ORDER.length; i++) {
      const slot = SLOT_ORDER[i];
      const mine = own.get(slot);
      if (!mine || mine.weight <= 0) continue;
      let visible = 0;
      for (let k = 0; k < mine.mask.length; k++) {
        const a = mine.mask[k];
        if (a <= 0) continue;
        let covered = false;
        for (let j = i + 1; j < SLOT_ORDER.length && !covered; j++) {
          const other = own.get(SLOT_ORDER[j]);
          if (other && other.mask[k] >= 96 / 255) covered = true;
        }
        if (!covered) visible += a;
      }
      const share = visible / mine.weight;
      const row = rows.get(slot) ?? { frames: 0, best: 0, bestAt: '', mean: 0 };
      row.frames++;
      row.mean += share;
      if (share > row.best) {
        row.best = share;
        row.bestAt = `${set.dir}/${frame}`;
      }
      rows.set(slot, row);
    }
  }
}

const attributed = new Map<string, number>();
const drawnIn = new Map<string, number>();
const report = JSON.parse(readFileSync(join(ROOT, 'check.json'), 'utf8'));
for (const a of report.animations) {
  for (const f of a.frames) {
    for (const s of f.slots ?? []) {
      if ((s.candidate?.pixels ?? 0) <= 0) continue;
      drawnIn.set(s.slot, (drawnIn.get(s.slot) ?? 0) + 1);
      if (s.drift !== null && s.drift !== undefined) attributed.set(s.slot, (attributed.get(s.slot) ?? 0) + 1);
    }
  }
}

const out: Record<string, unknown> = {};
console.log(
  `${'slot'.padEnd(16)} ${'ceiling'.padStart(8)} ${'mean vis'.padStart(9)} ${'at'.padEnd(20)} ` +
    `${'attributed'.padStart(11)}  of drawn`,
);
for (const [slot, row] of [...rows].sort((a, b) => a[1].best - b[1].best)) {
  const att = attributed.get(slot) ?? 0;
  const drawn = drawnIn.get(slot) ?? 0;
  out[slot] = {
    visibleCeiling: row.best,
    meanVisible: row.mean / row.frames,
    ceilingFrame: row.bestAt,
    framesDrawn: drawn,
    framesAttributed: att,
  };
  console.log(
    `${slot.padEnd(16)} ${(row.best * 100).toFixed(1).padStart(7)}% ${((row.mean / row.frames) * 100).toFixed(1).padStart(8)}% ` +
      `${row.bestAt.padEnd(20)} ${String(att).padStart(6)}/${String(drawn).padEnd(4)} ${drawn ? ((att / drawn) * 100).toFixed(0) : '-'}%`,
  );
}
writeFileSync(join(ROOT, 'evidence/slot-ceilings.json'), JSON.stringify(out, null, 1));
console.log(`-> ${join(ROOT, 'evidence/slot-ceilings.json')}`);
