/**
 * Template matcher: composite one art file at the sidecar's own scale, search
 * rotations x mirrorings x positions, score mean squared RGB error over that
 * piece's solid pixels. Calibrated against the brief's own published controls.
 */
import { readPlate, type Plate } from '../../../../tools/plate.ts';

export const ESS_SCALE = 0.22297348561444258;

export interface Template {
  name: string;
  w: number;
  h: number;
  /** solid sample pixels, art coords relative to art centre, with colour */
  us: Float64Array;
  vs: Float64Array;
  rs: Float64Array;
  gs: Float64Array;
  bs: Float64Array;
  n: number;
  solid: number;
}

export function buildTemplate(path: string, name: string, maxSamples = 900): Template {
  const p = readPlate(path);
  const pts: number[][] = [];
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 4;
      if (p.data[i + 3] > 200) pts.push([x, y, p.data[i], p.data[i + 1], p.data[i + 2]]);
    }
  const solid = pts.length;
  const stride = Math.max(1, Math.ceil(solid / maxSamples));
  const kept = pts.filter((_, i) => i % stride === 0);
  const n = kept.length;
  const t: Template = {
    name, w: p.width, h: p.height, n, solid,
    us: new Float64Array(n), vs: new Float64Array(n),
    rs: new Float64Array(n), gs: new Float64Array(n), bs: new Float64Array(n),
  };
  for (let i = 0; i < n; i++) {
    t.us[i] = kept[i][0] - p.width / 2;
    t.vs[i] = kept[i][1] - p.height / 2;
    t.rs[i] = kept[i][2]; t.gs[i] = kept[i][3]; t.bs[i] = kept[i][4];
  }
  return t;
}

/** score at a placement: mean squared RGB error over the template's samples. */
export function score(t: Template, frame: Plate, cx: number, cy: number, cos: number, sin: number, s: number): number {
  let acc = 0;
  const W = frame.width, H = frame.height, d = frame.data;
  for (let i = 0; i < t.n; i++) {
    const u = t.us[i] * s, v = t.vs[i] * s;
    const x = Math.round(cx + u * cos - v * sin);
    const y = Math.round(cy + u * sin + v * cos);
    if (x < 0 || y < 0 || x >= W || y >= H) { acc += 3 * 255 * 255; continue; }
    const j = (y * W + x) * 4;
    const dr = d[j] - t.rs[i], dg = d[j + 1] - t.gs[i], db = d[j + 2] - t.bs[i];
    acc += dr * dr + dg * dg + db * db;
  }
  return acc / t.n;
}

/** visibility: share of template samples within tol/255 of the frame. */
export function visibility(t: Template, frame: Plate, cx: number, cy: number, cos: number, sin: number, s: number, tol = 45): number {
  let ok = 0;
  const W = frame.width, H = frame.height, d = frame.data;
  for (let i = 0; i < t.n; i++) {
    const u = t.us[i] * s, v = t.vs[i] * s;
    const x = Math.round(cx + u * cos - v * sin);
    const y = Math.round(cy + u * sin + v * cos);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const j = (y * W + x) * 4;
    if (Math.abs(d[j] - t.rs[i]) <= tol && Math.abs(d[j + 1] - t.gs[i]) <= tol && Math.abs(d[j + 2] - t.bs[i]) <= tol) ok++;
  }
  return ok / t.n;
}

export interface Match { x: number; y: number; deg: number; residual: number; vis: number }

/**
 * Search. `deg` is clockwise in image space (art rotated by +deg turns clockwise
 * on screen); mirroring is not searched — the art is drawn facing one way and
 * these shots never mirror a part (§ the brief's own front/rear control).
 */
export function match(
  t: Template, frame: Plate, box: [number, number, number, number],
  degLo = -180, degHi = 180, s = ESS_SCALE,
): Match {
  const [x0, y0, x1, y1] = box;
  let best: Match = { x: 0, y: 0, deg: 0, residual: Infinity, vis: 0 };
  // stage 1: 5 deg, 2 px
  for (let deg = degLo; deg <= degHi; deg += 5) {
    const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    for (let cy = y0; cy <= y1; cy += 2)
      for (let cx = x0; cx <= x1; cx += 2) {
        const v = score(t, frame, cx, cy, cos, sin, s);
        if (v < best.residual) best = { x: cx, y: cy, deg, residual: v, vis: 0 };
      }
  }
  // stage 2: 1 deg, 1 px around it
  let b2 = best;
  for (let deg = best.deg - 6; deg <= best.deg + 6; deg += 1) {
    const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    for (let cy = best.y - 3; cy <= best.y + 3; cy += 1)
      for (let cx = best.x - 3; cx <= best.x + 3; cx += 1) {
        const v = score(t, frame, cx, cy, cos, sin, s);
        if (v < b2.residual) b2 = { x: cx, y: cy, deg, residual: v, vis: 0 };
      }
  }
  // stage 3: 0.25 deg, 0.25 px
  let b3 = b2;
  for (let deg = b2.deg - 1.5; deg <= b2.deg + 1.5; deg += 0.25) {
    const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    for (let cy = b2.y - 1.5; cy <= b2.y + 1.5; cy += 0.25)
      for (let cx = b2.x - 1.5; cx <= b2.x + 1.5; cx += 0.25) {
        const v = score(t, frame, cx, cy, cos, sin, s);
        if (v < b3.residual) b3 = { x: cx, y: cy, deg, residual: v, vis: 0 };
      }
  }
  const r = (b3.deg * Math.PI) / 180;
  b3.vis = visibility(t, frame, b3.x, b3.y, Math.cos(r), Math.sin(r), s);
  return b3;
}
