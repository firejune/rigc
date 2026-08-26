// bbox.ts <frame...>  — content bbox of non-background pixels
import { readPlate } from '../../../../tools/plate.ts';
const bg = [232, 232, 232];
for (const f of process.argv.slice(2)) {
  const p = readPlate(f);
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    const d = Math.abs(p.data[i] - bg[0]) + Math.abs(p.data[i+1] - bg[1]) + Math.abs(p.data[i+2] - bg[2]);
    if (d > 12) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  console.log(`${f.split('/').pop()} bbox x[${x0}..${x1}] y[${y0}..${y1}] w=${x1-x0+1} h=${y1-y0+1} ink=${n}`);
}
