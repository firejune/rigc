// draw matched templates back onto a frame, tinted, to eyeball the fit
import { readPlate, Plate, encodePng } from '../tools/plate.ts';
import { buildTemplate, ESS_SCALE } from './match.ts';
import { IMAGES } from './parts.ts';
import { readFileSync, writeFileSync } from 'node:fs';
const matches = JSON.parse(readFileSync('work/matches.json', 'utf8'));
const key = process.argv[2] ?? 'idle/0';
const [anim, f] = key.split('/');
const frame = readPlate(`bench/reference/spineboy/ess/${anim}/f${String(Number(f)).padStart(4, '0')}.png`);
const parts = (process.argv[3] ?? Object.keys(matches[key]).join(',')).split(',');
const S = 6, X0 = 120, Y0 = 175, W = 130, H = 175;
const out = new Plate(W * S * 2 + 4, H * S);
const put = (ox: number, x: number, y: number, r: number, g: number, b: number) => {
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
    const px = (x - X0) * S + dx + ox, py = (y - Y0) * S + dy;
    if (px < 0 || py < 0 || px >= out.width || py >= out.height) continue;
    const i = (py * out.width + px) * 4;
    out.data[i] = r; out.data[i+1] = g; out.data[i+2] = b; out.data[i+3] = 255;
  }
};
for (let y = Y0; y < Y0 + H; y++) for (let x = X0; x < X0 + W; x++) {
  const i = (y * frame.width + x) * 4;
  put(0, x, y, frame.data[i], frame.data[i+1], frame.data[i+2]);
  put(W * S + 4, x, y, 235, 235, 235);
}
const palette = [[255,0,0],[0,180,0],[0,80,255],[255,160,0],[200,0,220],[0,200,200],[130,90,40],[255,90,140],[90,90,90],[160,220,0],[0,120,120],[255,255,0],[120,0,255],[255,120,255],[60,255,120],[180,180,255],[255,60,0]];
parts.forEach((name, k) => {
  const m = matches[key][name]; if (!m) return;
  const t = buildTemplate(`${IMAGES}/${name}.png`, name, 6000);
  const r = (m.deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  const col = palette[k % palette.length];
  for (let i = 0; i < t.n; i++) {
    const u = t.us[i] * ESS_SCALE, v = t.vs[i] * ESS_SCALE;
    const x = Math.round(m.x + u * cos - v * sin), y = Math.round(m.y + u * sin + v * cos);
    put(W * S + 4, x, y, col[0], col[1], col[2]);
  }
});
writeFileSync('work/overlay.png', encodePng(out.width, out.height, out.data));
console.log(parts.map((p, k) => `${p}=${palette[k % palette.length]}`).join(' '));
