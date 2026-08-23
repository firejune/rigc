/**
 * Locate every part of the art in one reference frame, independently.
 *
 *   bun … tools/locate.ts <set> <index> [scale] [parts…]
 */
import { locate } from './match.ts';
import { refFrame, subject, viewportOf, pixelToWorld } from './lib.ts';

const ALL = [
  'head',
  'goggles',
  'torso',
  'neck',
  'gun',
  'front-thigh',
  'front-shin',
  'front-foot',
  'rear-thigh',
  'rear-shin',
  'rear-foot',
  'front-upper-arm',
  'front-bracer',
  'front-fist-open',
  'front-fist-closed',
  'rear-upper-arm',
  'rear-bracer',
  'mouth-grind',
  'mouth-smile',
  'mouth-oooo',
  'eye-indifferent',
  'eye-surprised',
];

const [set, idxArg, scaleArg, ...only] = process.argv.slice(2);
const idx = Number(idxArg ?? 0);
const scale = Number(scaleArg ?? 0.22297348561444258);
const ref = refFrame('ess', set, idx);
const s = subject(ref);
const box = { minX: s.minX - 6, minY: s.minY - 6, maxX: s.maxX + 6, maxY: s.maxY + 6 };
const v = viewportOf('ess');
const toWorld = pixelToWorld(v);
const rots: number[] = [];
for (let r = -180; r < 180; r += 10) rots.push(r);

const parts = only.length ? only : ALL;
for (const part of parts) {
  const t0 = Date.now();
  const m = locate(part, ref, box, scale, rots);
  const [wx, wy] = toWorld(m.cx, m.cy);
  console.log(
    `${part.padEnd(18)} score ${m.score.toFixed(1).padStart(6)}  px ${m.cx.toFixed(2)},${m.cy.toFixed(2)}` +
      `  rot ${m.rot.toFixed(1).padStart(7)}  world ${wx.toFixed(1)},${wy.toFixed(1)}  (${Date.now() - t0}ms)`,
  );
}
