/**
 * A magick-only mock-up of the setup pose, straight off the shared bone table.
 *
 * It exists so the ART can be iterated on without paying for a build+render
 * round trip. Because it reads `spec/skeleton.ts` rather than a second copy of
 * the numbers, a disagreement between this picture and `rigc render`'s setup
 * pose is a real bug in one of the two.
 */
import { $ } from 'bun';
import { PLATE_H } from './layout';
import { SLOTS, solve, rot } from '../spec/skeleton';

const OUT = new URL('./', import.meta.url).pathname;
const PARTS = new URL('./parts/', import.meta.url).pathname;

const world = solve();

const args: string[] = [`${PARTS}plate.png`];
let minX = Infinity;
let maxX = -Infinity;
let minY = Infinity;
let maxY = -Infinity;

for (const s of SLOTS) {
  if (s.slot === 'plate') continue;
  const b = world[s.bone];
  const [ox, oy] = rot(s.x ?? 0, s.y ?? 0, b.rotation);
  const cx = b.x + ox;
  const cy = b.y + oy;
  const size = (await $`magick identify -format "%w %h" ${PARTS}${s.image}`.text()).split(' ');
  const w = Number(size[0]);
  const h = Number(size[1]);
  // magick cannot rotate about an arbitrary point in one pass, so the mock
  // approximates a rotated part by rotating the plate about its own centre.
  const rotated = Math.abs(b.rotation) > 0.5;
  const px = Math.round(cx - w / 2);
  const py = Math.round(PLATE_H - (cy + h / 2));
  if (rotated) {
    args.push('(', `${PARTS}${s.image}`, '-background', 'none', '-rotate', String(-b.rotation), ')');
  } else {
    args.push(`${PARTS}${s.image}`);
  }
  args.push('-geometry', `+${px}+${py}`, '-composite');
  minX = Math.min(minX, cx - w / 2);
  maxX = Math.max(maxX, cx + w / 2);
  minY = Math.min(minY, cy - h / 2);
  maxY = Math.max(maxY, cy + h / 2);
}

await $`magick ${args} -resize 50% ${OUT}mock.png`;
console.log(`wrote mock.png`);
console.log(
  `figure bbox: x ${minX.toFixed(0)}..${maxX.toFixed(0)}  y ${minY.toFixed(0)}..${maxY.toFixed(0)}`,
);
