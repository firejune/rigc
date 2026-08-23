/**
 * Lay several PNGs out in a labelled grid on the reference backdrop, so a set of
 * loose parts can be looked at in one glance and compared at one scale.
 *
 *   bun … tools/montage.ts <out.png> <scale> <a.png> <b.png> …
 */
import { readPlate, Plate, encodePng } from '../../../../tools/plate.ts';
import { drawText } from '../../../../tools/font5x7.ts';
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const [outPath, scaleArg, ...files] = process.argv.slice(2);
const scale = Number(scaleArg);
const plates = files.map((f) => ({ name: basename(f, '.png'), plate: readPlate(f) }));
const cellW = Math.max(...plates.map((p) => Math.ceil(p.plate.width * scale))) + 8;
const cellH = Math.max(...plates.map((p) => Math.ceil(p.plate.height * scale))) + 16;
const cols = Math.ceil(Math.sqrt(plates.length * 1.4));
const rows = Math.ceil(plates.length / cols);
const out = new Plate(cols * cellW, rows * cellH);
for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.set(x, y, [232, 232, 232, 255]);

plates.forEach(({ name, plate }, i) => {
  const cx = (i % cols) * cellW;
  const cy = Math.floor(i / cols) * cellH;
  const w = Math.ceil(plate.width * scale);
  const h = Math.ceil(plate.height * scale);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const sx = Math.floor(px / scale);
      const sy = Math.floor(py / scale);
      out.blend(cx + 4 + px, cy + 12 + py, plate.get(sx, sy));
    }
  }
  drawText(name, cx + 2, cy + 2, 1, (x, y) => out.set(x, y, [20, 20, 20, 255]));
});
writeFileSync(outPath, encodePng(out.width, out.height, out.data));
console.log(`${outPath} ${out.width}x${out.height}`);
