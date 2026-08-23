/**
 * Crop a frame (or any PNG) and blow it up by an integer factor, so a 100 px
 * figure can be looked at. Nearest-neighbour on purpose: no invented pixels.
 *
 *   bun bench/runs/2026-08-23-spineboy-1/tools/zoom.ts <in.png> <out.png> [x y w h] [factor]
 */
import { readPlate, Plate, encodePng } from '../../../../tools/plate.ts';
import { writeFileSync } from 'node:fs';

const [inPath, outPath, ...rest] = process.argv.slice(2);
const plate = readPlate(inPath);
let x = 0,
  y = 0,
  w = plate.width,
  h = plate.height,
  f = 4;
if (rest.length >= 4) [x, y, w, h] = rest.slice(0, 4).map(Number);
if (rest.length >= 5) f = Number(rest[4]);

const out = new Plate(w * f, h * f);
for (let py = 0; py < h * f; py++) {
  for (let px = 0; px < w * f; px++) {
    const sx = x + Math.floor(px / f);
    const sy = y + Math.floor(py / f);
    if (sx < 0 || sy < 0 || sx >= plate.width || sy >= plate.height) continue;
    out.set(px, py, plate.get(sx, sy));
  }
}
writeFileSync(outPath, encodePng(out.width, out.height, out.data));
console.log(`${outPath} ${out.width}x${out.height} from ${inPath} [${x},${y} ${w}x${h}] x${f}`);
