/**
 * A scratch probe: render one placement set, print the subject box of a
 * reference frame, and check the world↔pixel conversion against the brief's own
 * control (the floor row and the standing box).
 */
import { writeFileSync } from 'node:fs';
import { encodePng } from '../../../../tools/plate.ts';
import { art, refFrame, renderPlacements, subject, viewportOf, pixelToWorld, worldToPixel } from './lib.ts';

const v = viewportOf('ess');
const toWorld = pixelToWorld(v);
const toPixel = worldToPixel(v);
console.log('viewport', JSON.stringify(v));
console.log('world y=0 lands at row', toPixel(0, 0)[1].toFixed(2));
console.log('world x=0 lands at col', toPixel(0, 0)[0].toFixed(2));

for (const [set, i] of [
  ['idle', 0],
  ['aim', 0],
  ['hit', 0],
  ['walk', 6],
] as const) {
  const s = subject(refFrame('ess', set, i));
  const [wx0, wy1] = toWorld(s.minX, s.maxY + 1);
  const [wx1, wy0] = toWorld(s.maxX + 1, s.minY);
  console.log(
    `${set}/f${i}: px box ${s.minX}..${s.maxX} x ${s.minY}..${s.maxY} (${s.maxX - s.minX + 1}x${s.maxY - s.minY + 1})` +
      `  centroid ${s.cx.toFixed(1)},${s.cy.toFixed(1)}  world x[${wx0.toFixed(0)}..${wx1.toFixed(0)}] y[${wy1.toFixed(0)}..${wy0.toFixed(0)}]`,
  );
}

// one part, drawn where the head plainly is, to prove the quad orientation
const head = art('head');
console.log('head art', head.width, 'x', head.height);
const plate = renderPlacements([{ part: 'head', cx: 30, cy: 520, rot: 0 }], v);
writeFileSync('/tmp/sb/probe.png', encodePng(plate.width, plate.height, plate.data));
console.log('wrote /tmp/sb/probe.png');
