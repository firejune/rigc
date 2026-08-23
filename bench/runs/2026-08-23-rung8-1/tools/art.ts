/**
 * What the eight loose PNGs actually contain: alpha box, connected components,
 * and where the orange bead sits in each chain link.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/art.ts`
 */
import { readPlate } from '../../../../tools/plate.ts';
import { IMAGES, components, isOrange } from './frames.ts';
import { join } from 'node:path';

const files = [
  'ball.png',
  'tail.png',
  'platform.png',
  'chain-1.png',
  'chain-2.png',
  'chain-3.png',
  'chain-4.png',
  'chain-end.png',
];

for (const name of files) {
  const plate = readPlate(join(IMAGES, name));
  const w = plate.width;
  const h = plate.height;
  const alpha = new Uint8Array(w * h);
  const orange = new Uint8Array(w * h);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  let ox = 0;
  let oy = 0;
  let ocount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = plate.get(x, y);
      if (a <= 8) continue;
      alpha[y * w + x] = 1;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (a > 128 && isOrange(r, g, b)) {
        orange[y * w + x] = 1;
        ocount++;
        ox += x;
        oy += y;
      }
    }
  }
  const comps = components(alpha, w, h).sort((a, b) => b.length - a.length);
  const ocomps = components(orange, w, h)
    .filter((c) => c.length >= 12)
    .sort((a, b) => b.length - a.length);
  // Column profile: first and last rows with alpha, at a few sample columns.
  const colHeights: number[] = [];
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (alpha[y * w + x]) n++;
    colHeights.push(n);
  }
  const rowWidths: number[] = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (alpha[y * w + x]) n++;
    rowWidths.push(n);
  }
  const widest = colHeights.indexOf(Math.max(...colHeights));
  console.log(
    `${name.padEnd(14)} ${w}x${h}  alpha box x[${minX}..${maxX}] y[${minY}..${maxY}] ` +
      `(${maxX - minX + 1}x${maxY - minY + 1})  drawn ${count}  comps ${comps.length} [${comps
        .slice(0, 4)
        .map((c) => c.length)
        .join(', ')}]`,
  );
  console.log(
    `${' '.repeat(14)} col heights: x=${minX}:${colHeights[minX]} x=${widest}(max):${colHeights[widest]} x=${maxX}:${colHeights[maxX]}` +
      `   row widths: y=${minY}:${rowWidths[minY]} y=${maxY}:${rowWidths[maxY]}`,
  );
  if (ocount > 0) {
    console.log(
      `${' '.repeat(14)} orange ${ocount} px, centroid (${(ox / ocount).toFixed(1)}, ${(oy / ocount).toFixed(1)}), ` +
        `components>=12px: ${ocomps.length} [${ocomps.map((c) => c.length).join(', ')}]`,
    );
    for (const c of ocomps.slice(0, 3)) {
      let cx = 0;
      let cy = 0;
      let lo = Infinity;
      let hi = -Infinity;
      let loy = Infinity;
      let hiy = -Infinity;
      for (const p of c) {
        const x = p % w;
        const y = Math.floor(p / w);
        cx += x;
        cy += y;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
        if (y < loy) loy = y;
        if (y > hiy) hiy = y;
      }
      console.log(
        `${' '.repeat(16)} · ${c.length} px at (${(cx / c.length).toFixed(1)}, ${(cy / c.length).toFixed(1)}) ` +
          `box x[${lo}..${hi}] y[${loy}..${hiy}] (${hi - lo + 1}x${hiy - loy + 1})`,
      );
    }
  }
}
