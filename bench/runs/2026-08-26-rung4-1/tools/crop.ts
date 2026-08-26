// crop.ts <in> <out> <x> <y> <w> <h> [zoom]
import { readPlate, Plate, encodePng } from '../../../../tools/plate.ts';
import { writeFileSync } from 'node:fs';
const [inp, out, xs, ys, ws, hs, zs] = process.argv.slice(2);
const x = +xs, y = +ys, w = +ws, h = +hs, z = zs ? +zs : 1;
const p = readPlate(inp);
const o = new Plate(w * z, h * z);
for (let j = 0; j < h * z; j++) for (let i = 0; i < w * z; i++) {
  const sx = x + Math.floor(i / z), sy = y + Math.floor(j / z);
  const si = (sy * p.width + sx) * 4, di = (j * w * z + i) * 4;
  if (sx < 0 || sy < 0 || sx >= p.width || sy >= p.height) { o.data[di+3] = 255; continue; }
  o.data[di] = p.data[si]; o.data[di+1] = p.data[si+1]; o.data[di+2] = p.data[si+2]; o.data[di+3] = p.data[si+3];
}
writeFileSync(out, encodePng(o.width, o.height, o.data));
console.log(`${out} ${o.width}x${o.height}`);
