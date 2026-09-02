/**
 * Read a part's own joint features off its art, in the art's own pixel coordinates.
 *
 * MOTION.md §3.9's first default — "the joint the art draws" — needs the joint's
 * pixel coordinates, and eyeballing a thumbnail does not give them. This prints
 * the part as a coordinate-ruled character map, one class per colour family, so a
 * red shoulder cap or a hoist strip can be read as a number instead of a guess.
 */
import { readPlate } from '../../../../tools/plate.ts';
import { join } from 'node:path';

const IMAGES = 'examples/spineboy/images';

type Cls = { ch: string; test: (r: number, g: number, b: number) => boolean };

/** Colour families of this figure's kit, each distinctive enough to locate a feature. */
const CLASSES: Cls[] = [
  { ch: 'R', test: (r, g, b) => r > 130 && g < 90 && b < 90 }, // red plates, boots, caps
  { ch: 'P', test: (r, g, b) => r > 190 && g > 120 && b > 120 && r - b > 25 }, // pink/salmon (bracers, neck, skin)
  { ch: 'T', test: (r, g, b) => g > 100 && g > r + 25 && b > r + 10 }, // teal (gun, hair, goggles)
  { ch: 'W', test: (r, g, b) => r > 175 && g > 175 && b > 175 }, // pale grey trim, highlights
  { ch: 'm', test: (r, g, b) => r > 105 && g > 105 && b > 110 }, // mid grey
  { ch: '#', test: () => true }, // dark charcoal
];

function classify(r: number, g: number, b: number): string {
  for (const c of CLASSES) if (c.test(r, g, b)) return c.ch;
  return '#';
}

const part = process.argv[2];
const step = Number(process.argv[3] ?? 4);
const plate = readPlate(join(IMAGES, `${part}.png`));
console.log(`${part}.png  ${plate.width}x${plate.height}  step ${step}px per character`);
const cols: number[] = [];
for (let x = 0; x < plate.width; x += step) cols.push(x);
// column ruler, tens digit then units
let l1 = '    ';
let l2 = '    ';
for (const x of cols) {
  l1 += x % 40 === 0 ? String(Math.floor(x / 100) % 10) : ' ';
  l2 += x % 40 === 0 ? String(Math.floor(x / 10) % 10) : x % 20 === 0 ? '.' : ' ';
}
console.log(l1);
console.log(l2);
for (let y = 0; y < plate.height; y += step) {
  let row = String(y).padStart(3) + ' ';
  for (const x of cols) {
    // majority over the cell
    const counts = new Map<string, number>();
    let opaque = 0;
    let n = 0;
    for (let dy = 0; dy < step; dy++) {
      for (let dx = 0; dx < step; dx++) {
        const sx = x + dx;
        const sy = y + dy;
        if (sx >= plate.width || sy >= plate.height) continue;
        n++;
        const [r, g, b, a] = plate.get(sx, sy);
        if (a < 128) continue;
        opaque++;
        const c = classify(r, g, b);
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    if (opaque < n / 2) {
      row += '.';
      continue;
    }
    let best = '#';
    let bn = -1;
    for (const [c, k] of counts) if (k > bn) [best, bn] = [c, k];
    row += best;
  }
  console.log(row);
}
