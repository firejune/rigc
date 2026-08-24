// scratch viewer: crop + integer-upscale a frame (or several side by side)
import { readPlate, Plate, encodePng } from '../tools/plate.ts';
import { writeFileSync } from 'node:fs';

const [outPath, scaleS, ...srcs] = process.argv.slice(2);
const scale = Number(scaleS);
const plates = srcs.map((s) => readPlate(s));
const w = plates.reduce((a, p) => a + p.width, 0);
const h = Math.max(...plates.map((p) => p.height));
const out = new Plate(w * scale, h * scale);
for (let i = 0; i < out.data.length; i += 4) { out.data[i] = 40; out.data[i+1] = 40; out.data[i+2] = 40; out.data[i+3] = 255; }
let ox = 0;
for (const p of plates) {
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const si = (y * p.width + x) * 4;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const di = (((y * scale + dy) * out.width) + (ox + x) * scale + dx) * 4;
      out.data[di] = p.data[si]; out.data[di+1] = p.data[si+1]; out.data[di+2] = p.data[si+2]; out.data[di+3] = 255;
    }
  }
  ox += p.width;
}
writeFileSync(outPath, encodePng(out.width, out.height, out.data));
console.log(outPath, out.width, out.height);
