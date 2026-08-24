// view.ts out.png scale [file:x,y,w,h | file] ...
import { readPlate, Plate, encodePng } from '../tools/plate.ts';
import { writeFileSync } from 'node:fs';
const [outPath, scaleS, ...srcs] = process.argv.slice(2);
const scale = Number(scaleS);
type Item = { p: Plate; x: number; y: number; w: number; h: number };
const items: Item[] = srcs.map((s) => {
  const [file, box] = s.split(':');
  const p = readPlate(file);
  if (!box) return { p, x: 0, y: 0, w: p.width, h: p.height };
  const [x, y, w, h] = box.split(',').map(Number);
  return { p, x, y, w, h };
});
const W = items.reduce((a, i) => a + i.w, 0) + (items.length - 1);
const H = Math.max(...items.map((i) => i.h));
const out = new Plate(W * scale, H * scale);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 60; out.data[i+1] = 60; out.data[i+2] = 70; out.data[i+3] = 255; }
let ox = 0;
for (const it of items) {
  for (let y = 0; y < it.h; y++) for (let x = 0; x < it.w; x++) {
    const sx = it.x + x, sy = it.y + y;
    if (sx < 0 || sy < 0 || sx >= it.p.width || sy >= it.p.height) continue;
    const si = (sy * it.p.width + sx) * 4;
    const a = it.p.data[si + 3] / 255;
    const r = it.p.data[si] * a + 60 * (1 - a), g = it.p.data[si+1] * a + 60 * (1 - a), b = it.p.data[si+2] * a + 70 * (1 - a);
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const di = (((y * scale + dy) * out.width) + (ox + x) * scale + dx) * 4;
      out.data[di] = r; out.data[di+1] = g; out.data[di+2] = b; out.data[di+3] = 255;
    }
  }
  ox += it.w + 1;
}
writeFileSync(outPath, encodePng(out.width, out.height, out.data));
console.log(outPath, out.width, out.height);
