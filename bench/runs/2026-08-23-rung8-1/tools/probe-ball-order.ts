/**
 * Draw order in the `ball`, decided the way §8 says to decide it — on the frames
 * where the two parts genuinely overlap.
 *
 * The brief calls this undecidable, on the grounds that the trail's blunt end
 * meets the ball inside the ball's own silhouette. That is true of most of the
 * shot. It is not true of the landing frames, where the trail curls right over
 * where the ball is: there, one of them covers the other and which one is visible.
 * So both orders are built from the same fitted poses and rendered back.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/probe-ball-order.ts <fit.json>`
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Plate } from '../../../../tools/plate.ts';
import { loadSet, sidecar } from './frames.ts';
import { ballRig, ballStatic } from './ball-spec.ts';
import { backgroundOf, compile, mae, poser, viewportOf, windowOf } from './harness.ts';
import type { BallFit } from './fit-ball-pixels.ts';

const DIR = 'follow-through@24fps';
/** The frames the brief names as the ones where the trail curls over the ball. */
const CURLED = [25, 26, 27, 28, 39, 40, 41];

if (import.meta.main) {
  const data = JSON.parse(readFileSync(process.argv[2], 'utf8')) as {
    setupWorld: [number, number];
    segments: number;
    lead: number;
    artScale: number;
    ballScale: number;
    fits: BallFit[];
  };
  const side = sidecar('ball');
  const view = viewportOf(side);
  const bg = backgroundOf('ball');
  const reference = loadSet('ball', DIR);
  const W = side.viewport.pixelWidth;
  const H = side.viewport.pixelHeight;
  const windows = reference.map((r) => windowOf([r], bg, 14, W, H));
  const tmp = mkdtempSync(join(tmpdir(), 'rung8-order-'));

  for (const ballBehind of [false, true]) {
    const built = compile(
      join(tmp, ballBehind ? 'ball-behind' : 'trail-behind'),
      ballRig({
        comet: data.setupWorld,
        segments: data.segments,
        artScale: data.artScale,
        ballScale: data.ballScale,
        lead: data.lead,
        ballBehind,
        box: { x: -1000, y: -1000, width: 2000, height: 2000 },
      }),
      ballStatic(),
    );
    const p = poser(built.posable.data, view, built.posable.pages, bg);
    const scratch = new Plate(W, H);
    let total = 0;
    let curled = 0;
    for (let i = 0; i < reference.length; i++) {
      const f = data.fits[i];
      p.reset();
      p.set('comet', 'x', data.setupWorld[0] + f.dx);
      p.set('comet', 'y', data.setupWorld[1] + f.dy);
      p.set('ball', 'scaleX', f.sx);
      p.set('ball', 'scaleY', f.sy);
      for (let k = 0; k < data.segments; k++) p.set(`tail${k}`, 'rotation', (k === 0 ? 180 : 0) + f.tail[k]);
      p.renderInto(scratch, windows[i]);
      const m = mae(scratch, reference[i], windows[i]).mae;
      total += m;
      if (CURLED.includes(i)) curled += m;
    }
    console.log(
      `${(ballBehind ? 'trail in front of the ball' : 'ball in front of the trail').padEnd(30)} ` +
        `whole shot ${(total / reference.length).toFixed(3)}   the curled frames ${(curled / CURLED.length).toFixed(3)}`,
    );
  }
  console.log(`\n(the poses are the ones fitted with the ball in front, so that order has the advantage;`);
  console.log(` read the gap, not the absolute numbers. Curled frames: ${CURLED.map((i) => `f${i}`).join(' ')})`);
}
