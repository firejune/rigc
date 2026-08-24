/**
 * Per-set, per-frame drawn-extent comparison: my compiled candidate against the
 * committed reference frames, both on frames.json's own grid.
 *
 * Why: `check`'s shared framing carries a `union residual` of -6.4 x +9.2 px
 * across the sets that could not take the frames' own box (death, hit, run,
 * shoot). One uniform scale cannot absorb that, so ONE set reaches somewhere
 * nothing in the frames does — and because the box is shared, that one set is
 * paying for the framing of the other three. This says which set and which frame.
 */
import { loadPosable, sampleAnimation, renderFrame } from '../src/render.ts';
import { readPlate, type Plate } from '../tools/plate.ts';
import { fullViewport, BG } from './harness.ts';
import { readFileSync, existsSync } from 'node:fs';
import { REF, CAND } from './fit.ts';

function box(p: Plate): [number, number, number, number] | null {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    if (Math.abs(p.data[i] - BG[0]) > 8 || Math.abs(p.data[i + 1] - BG[1]) > 8 || Math.abs(p.data[i + 2] - BG[2]) > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

const view = fullViewport(`${REF}/frames.json`);
const posable = loadPosable(`${CAND}/skeleton.json`, `${CAND}/skeleton.atlas`, CAND);
const anims = ['aim', 'death', 'hit', 'idle', 'jump', 'run', 'shoot', 'walk'];

const only = process.argv[2];
let gx0 = 1e9, gy0 = 1e9, gx1 = -1, gy1 = -1;   // candidate union
let rx0 = 1e9, ry0 = 1e9, rx1 = -1, ry1 = -1;   // reference union

for (const anim of anims) {
  if (only && anim !== only) continue;
  const frames = sampleAnimation(posable.data, anim, 12);
  const rows: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const path = `${REF}/${anim}/f${String(i).padStart(4, '0')}.png`;
    if (!existsSync(path)) continue;
    const mine = box(renderFrame(frames[i], posable.pages, view, BG));
    const ref = box(readPlate(path));
    if (!mine || !ref) continue;
    gx0 = Math.min(gx0, mine[0]); gy0 = Math.min(gy0, mine[1]); gx1 = Math.max(gx1, mine[2]); gy1 = Math.max(gy1, mine[3]);
    rx0 = Math.min(rx0, ref[0]); ry0 = Math.min(ry0, ref[1]); rx1 = Math.max(rx1, ref[2]); ry1 = Math.max(ry1, ref[3]);
    const d = [mine[0] - ref[0], mine[1] - ref[1], mine[2] - ref[2], mine[3] - ref[3]];
    // flag a frame that reaches outside the reference's own box by > 3 px
    const out = Math.max(ref[0] - mine[0], ref[1] - mine[1], mine[2] - ref[2], mine[3] - ref[3]);
    if (out > 3) rows.push(`    f${String(i).padStart(4, '0')}  mine [${mine.join(',')}]  ref [${ref.join(',')}]  d[${d.map((v) => (v >= 0 ? '+' : '') + v).join(',')}]  OUT ${out}`);
  }
  console.log(`${anim.padEnd(6)} ${frames.length} frames — ${rows.length} frame(s) reaching >3px outside the reference's box`);
  for (const r of rows.slice(0, 12)) console.log(r);
}
if (!only) {
  console.log(`\ncandidate union x ${gx0}..${gx1}  y ${gy0}..${gy1}`);
  console.log(`reference union x ${rx0}..${rx1}  y ${ry0}..${ry1}`);
  console.log(`  ⇒ mine reaches left ${rx0 - gx0}, right ${gx1 - rx1}, top ${ry0 - gy0}, bottom ${gy1 - ry1} px beyond`);
}
