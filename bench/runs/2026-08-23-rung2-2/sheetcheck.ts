/**
 * Whole-shot self-check for a rung whose reference is contact sheets.
 *
 * `rigc check` compares the `fNNNN.png` files a frame set ships, and rung 2
 * ships two of them per animation — so it sees `f0000` and `f0310` and nothing
 * between. The other 309 frames of each shot are on the contact sheet, and a
 * contact sheet is a reference *frame set*: it is the same thing `check` reads,
 * and reading it does not read the answer.
 *
 * So this renders the compiled candidate at the protocol rate into the
 * reference's own world box at quarter scale — the scale the sheet's tiles were
 * drawn at — and reports MAE per frame against the matching tile. A flat series
 * is framing or art; a spike is timing at that moment (AUTHORING §9.2).
 *
 * It opens `frames.json`, the contact sheets and the candidate. It does not open
 * any reference skeleton.
 *
 *   bun bench/runs/2026-08-23-rung2-2/sheetcheck.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BACKGROUND, loadPosable, renderFrame, sampleAnimation, viewportOfSize } from '../../../src/render.ts';
import { readPlate } from '../../../tools/plate.ts';

/** Tile geometry of `bench/render_reference.ts`'s contact sheets. */
const TILE_W = 64;
const TILE_H = 57;
const GAP = 1;
const COLS = 8;
/** The frame number is painted into the top-left corner of every tile. */
const LABEL_W = 20;
const LABEL_H = 8;
const PROTOCOL_FPS = 12;

const here = dirname(new URL(import.meta.url).pathname);
const candidateDir = process.argv[2] ?? join(here, 'spine');
const framesRoot = process.argv[3] ?? join(here, '../../reference/2-the-12-principles');

const sidecar = JSON.parse(readFileSync(join(framesRoot, 'frames.json'), 'utf8'));
const v = sidecar.viewport;
const viewport = viewportOfSize(v.x, v.y, v.width, v.height, v.scale / 4, TILE_W, TILE_H);
const { data, pages } = loadPosable(
  join(candidateDir, 'skeleton.json'),
  join(candidateDir, 'skeleton.atlas'),
  candidateDir,
);

const isContent = (c: [number, number, number, number]): boolean =>
  Math.max(Math.abs(c[0] - BACKGROUND[0]), Math.abs(c[1] - BACKGROUND[1]), Math.abs(c[2] - BACKGROUND[2])) > 2;

for (const set of sidecar.sets) {
  const sheet = readPlate(join(framesRoot, set.dir, 'contact.png'));
  const frames = sampleAnimation(data, set.animation, PROTOCOL_FPS);
  const count = Math.min(frames.length, set.sampled);
  const per: number[] = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const plate = renderFrame(frames[i], pages, viewport, BACKGROUND);
    const ox = GAP + (i % COLS) * (TILE_W + GAP);
    const oy = GAP + Math.floor(i / COLS) * (TILE_H + GAP);
    let acc = 0;
    let n = 0;
    for (let y = 0; y < TILE_H; y++) {
      for (let x = 0; x < TILE_W; x++) {
        if (y < LABEL_H && x < LABEL_W) continue;
        const a = plate.get(x, y);
        const b = sheet.get(ox + x, oy + y);
        if (!isContent(a) && !isContent(b)) continue;
        acc += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
        n++;
      }
    }
    const mae = n === 0 ? 0 : acc / n;
    per.push(mae);
    sum += mae;
  }
  const ranked = per.map((m, i): [number, number] => [m, i]).sort((a, b) => b[0] - a[0]);
  const [worst, worstAt] = ranked[0];
  console.log(
    `${String(set.dir).padEnd(14)} ${count} frames   MAE mean ${(sum / count).toFixed(2)}` +
      `  worst ${worst.toFixed(2)} at f${String(worstAt).padStart(4, '0')}`,
  );
  console.log(
    '   worst 8: ' + ranked.slice(0, 8).map(([m, i]) => `f${String(i).padStart(4, '0')}=${m.toFixed(1)}`).join('  '),
  );
}
