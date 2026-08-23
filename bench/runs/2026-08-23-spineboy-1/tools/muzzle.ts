/**
 * Which flare art is on which frame of `shoot`, and how big it is drawn.
 *
 * The flash reaches 118 frame px where `muzzle01` is 133 art px ≈ 30 frame px at
 * one unit per pixel, so either the attachment or its bone carries a scale. The
 * sweep below measures it instead of assuming it, on the frames the brief says
 * carry a flare, against a background nothing else of the figure reaches.
 */
import { locate } from './match.ts';
import { refFrame, viewportOf, pixelToWorld } from './lib.ts';

const BASE = 0.22297348561444258;
const [set, idxArg, boxArg, scalesArg] = process.argv.slice(2);
const [x0, y0, x1, y1] = (boxArg ?? '230,230,370,310').split(',').map(Number);
const scales = (scalesArg ?? '1,1.5,2,2.5,3,3.5,4,4.5,5').split(',').map(Number);
const ref = refFrame('ess', set, Number(idxArg));
const toWorld = pixelToWorld(viewportOf('ess'));
const rots: number[] = [];
for (let r = -30; r <= 30; r += 10) rots.push(r);

for (const img of ['muzzle01', 'muzzle02', 'muzzle03', 'muzzle04', 'muzzle05']) {
  let best = { score: Infinity, s: 0, cx: 0, cy: 0, rot: 0 };
  for (const s of scales) {
    const m = locate(img, ref, { minX: x0, minY: y0, maxX: x1, maxY: y1 }, BASE * s, rots, 0.8);
    if (m.score < best.score) best = { score: m.score, s, cx: m.cx, cy: m.cy, rot: m.rot };
  }
  const [wx, wy] = toWorld(best.cx, best.cy);
  console.log(
    `${img.padEnd(12)} scale ${best.s.toFixed(2)}  score ${best.score.toFixed(2)}  px ${best.cx.toFixed(1)},${best.cy.toFixed(1)}  rot ${best.rot.toFixed(1)}  world ${wx.toFixed(1)},${wy.toFixed(1)}`,
  );
}
