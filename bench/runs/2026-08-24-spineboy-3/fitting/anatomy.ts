// per-art-piece geometry: solid mask extent, principal axis, endpoints.
import { readPlate } from '../tools/plate.ts';
import { IMAGES, PARTS } from './parts.ts';
for (const [name, hint] of Object.entries(PARTS)) {
  const p = readPlate(`${IMAGES}/${name}.png`);
  let n = 0, sx = 0, sy = 0;
  const xs: number[] = [], ys: number[] = [];
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    if (p.data[(y * p.width + x) * 4 + 3] > 128) { n++; sx += x; sy += y; xs.push(x); ys.push(y); }
  }
  const cx = sx / n, cy = sy / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - cx, dy = ys[i] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= n; syy /= n; sxy /= n;
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  // extremes along the axis
  let lo = Infinity, hi = -Infinity, loP = [0, 0], hiP = [0, 0];
  for (let i = 0; i < n; i++) {
    const t = (xs[i] - cx) * Math.cos(th) + (ys[i] - cy) * Math.sin(th);
    if (t < lo) { lo = t; loP = [xs[i], ys[i]]; }
    if (t > hi) { hi = t; hiP = [xs[i], ys[i]]; }
  }
  // hinted points, in art px
  const hp = [hint.prox[0] * p.width, hint.prox[1] * p.height];
  const hd = [hint.dist[0] * p.width, hint.dist[1] * p.height];
  const yup = (q: number[]) => [q[0] - p.width / 2, -(q[1] - p.height / 2)];
  console.log(
    name.padEnd(20),
    `${p.width}x${p.height}`.padEnd(9),
    `axis ${((th * 180) / Math.PI).toFixed(0).padStart(4)}°`,
    `len ${(hi - lo).toFixed(0).padStart(4)}`,
    `ends (${loP[0]},${loP[1]}) (${hiP[0]},${hiP[1]})`.padEnd(24),
    `prox_yup (${yup(hp)[0].toFixed(0)}, ${yup(hp)[1].toFixed(0)})`.padEnd(24),
    `dist_yup (${yup(hd)[0].toFixed(0)}, ${yup(hd)[1].toFixed(0)})`,
  );
}
