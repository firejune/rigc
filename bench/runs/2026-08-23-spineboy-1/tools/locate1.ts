/**
 * Locate one part in one reference frame, inside a stated window.
 *
 *   bun … tools/locate1.ts <set> <index> <part> <x0,y0,x1,y1> [rotLo,rotHi,step] [scale] [keep]
 */
import { locate } from './match.ts';
import { refFrame, viewportOf, pixelToWorld } from './lib.ts';

const [set, idxArg, part, boxArg, rotArg, scaleArg, keepArg] = process.argv.slice(2);
const [x0, y0, x1, y1] = (boxArg ?? '0,0,383,366').split(',').map(Number);
const [rl, rh, rs] = (rotArg ?? '-180,180,10').split(',').map(Number);
const scale = Number(scaleArg ?? 0.22297348561444258);
const keep = Number(keepArg ?? 0.6);
const rots: number[] = [];
for (let r = rl; r <= rh; r += rs) rots.push(r);

const ref = refFrame('ess', set, Number(idxArg));
const m = locate(part, ref, { minX: x0, minY: y0, maxX: x1, maxY: y1 }, scale, rots, keep);
const [wx, wy] = pixelToWorld(viewportOf('ess'))(m.cx, m.cy);
console.log(
  `${part} score ${m.score.toFixed(2)}  px ${m.cx.toFixed(2)},${m.cy.toFixed(2)}  rot ${m.rot.toFixed(2)}  world ${wx.toFixed(1)},${wy.toFixed(1)}`,
);
