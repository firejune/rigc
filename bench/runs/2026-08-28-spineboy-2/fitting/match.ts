/**
 * Template matcher: place one art piece on one reference frame.
 * Composites the PNG at the sidecar's own scale, searches rotation x position,
 * scores mean squared RGB error over the piece's solid pixels (alpha >= 128).
 * Reports best pose, residual, and visibility (share of solid pixels within
 * 45/255 of the frame) — the same conventions the brief's verification passes used.
 */
import { Plate } from '../../../../tools/plate.ts';
import { art, sidecar } from './lib.ts';

export interface Template {
  w: number;
  h: number;
  /** rgb + solid flag per pixel, at frame scale, for one rotation */
  rgb: Float32Array; // w*h*3
  solid: Uint8Array; // w*h
  /** template pixel of the piece's art-centre */
  cx: number;
  cy: number;
  count: number;
}

const SCALE = sidecar().viewport.scale; // 0.222973 px/unit; 1 art px = 1 world unit assumed

/** Render an art plate into a frame-scale template at world rotation phi (degrees, CCW, y-up). */
export function makeTemplate(a: Plate, phiDeg: number, scale = SCALE): Template {
  const phi = (phiDeg * Math.PI) / 180;
  const c = Math.cos(phi), s = Math.sin(phi);
  const cu = a.width / 2, cv = a.height / 2;
  // corners in world units relative to centre
  const pts = [
    [-cu, cv], [cu, cv], [-cu, -cv], [cu, -cv],
  ].map(([x, y]) => [x * c - y * s, x * s + y * c]);
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  const w = Math.ceil((maxX - minX) * scale) + 2;
  const h = Math.ceil((maxY - minY) * scale) + 2;
  const rgb = new Float32Array(w * h * 3);
  const solid = new Uint8Array(w * h);
  // template pixel (px,py) -> world offset -> art pixel
  const cx = -minX * scale + 1, cy = maxY * scale + 1; // template pixel of centre
  let count = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const wx = (px - cx) / scale;
      const wy = (cy - py) / scale;
      // inverse rotation
      const lx = wx * c + wy * s;
      const ly = -wx * s + wy * c;
      const u = lx + cu, v = cv - ly;
      if (u < 0 || v < 0 || u >= a.width - 1 || v >= a.height - 1) continue;
      // bilinear sample art
      const u0 = Math.floor(u), v0 = Math.floor(v);
      const fu = u - u0, fv = v - v0;
      let r = 0, g = 0, b = 0, al = 0;
      for (const [du, dv, wgt] of [
        [0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv],
      ] as const) {
        const i = ((v0 + dv) * a.width + (u0 + du)) * 4;
        const aa = a.data[i + 3] / 255;
        r += a.data[i] * aa * wgt;
        g += a.data[i + 1] * aa * wgt;
        b += a.data[i + 2] * aa * wgt;
        al += aa * wgt;
      }
      if (al >= 0.5) {
        const o = py * w + px;
        solid[o] = 1;
        rgb[o * 3] = r / al;
        rgb[o * 3 + 1] = g / al;
        rgb[o * 3 + 2] = b / al;
        count++;
      }
    }
  }
  return { w, h, rgb, solid, cx, cy, count };
}

export interface Match { x: number; y: number; phi: number; score: number; vis: number }

/** score template at integer offset (ox,oy) of its top-left on the frame */
function scoreAt(t: Template, f: Plate, ox: number, oy: number, stride = 1): { score: number; vis: number } {
  let sum = 0, n = 0, vis = 0;
  for (let py = 0; py < t.h; py += stride) {
    const fy = oy + py;
    if (fy < 0 || fy >= f.height) continue;
    for (let px = 0; px < t.w; px += stride) {
      const o = py * t.w + px;
      if (!t.solid[o]) continue;
      const fx = ox + px;
      if (fx < 0 || fx >= f.width) continue;
      const fi = (fy * f.width + fx) * 4;
      const dr = t.rgb[o * 3] - f.data[fi];
      const dg = t.rgb[o * 3 + 1] - f.data[fi + 1];
      const db = t.rgb[o * 3 + 2] - f.data[fi + 2];
      sum += dr * dr + dg * dg + db * db;
      n++;
      if (Math.abs(dr) < 45 && Math.abs(dg) < 45 && Math.abs(db) < 45) vis++;
    }
  }
  return n === 0 ? { score: Infinity, vis: 0 } : { score: sum / n / 3, vis: vis / n };
}

/**
 * Search the frame for the best placement of `name`.
 * window: centre search box in frame px. phis: rotation candidates in degrees.
 * Returns centre position in frame px + rotation + residual.
 */
export function matchPart(
  name: string,
  frame: Plate,
  window: { x0: number; y0: number; x1: number; y1: number },
  phis: number[] = Array.from({ length: 72 }, (_, i) => i * 5 - 180),
): Match {
  const a = art(name);
  let best: Match = { x: 0, y: 0, phi: 0, score: Infinity, vis: 0 };
  for (const phi of phis) {
    const t = makeTemplate(a, phi);
    // coarse: stride 3 positions, stride 2 pixels
    let cb = { x: 0, y: 0, score: Infinity };
    for (let cy = window.y0; cy <= window.y1; cy += 3) {
      for (let cx = window.x0; cx <= window.x1; cx += 3) {
        const r = scoreAt(t, frame, Math.round(cx - t.cx), Math.round(cy - t.cy), 2);
        if (r.score < cb.score) cb = { x: cx, y: cy, score: r.score };
      }
    }
    // refine: stride 1 around coarse best
    for (let cy = cb.y - 3; cy <= cb.y + 3; cy++) {
      for (let cx = cb.x - 3; cx <= cb.x + 3; cx++) {
        const r = scoreAt(t, frame, Math.round(cx - t.cx), Math.round(cy - t.cy), 1);
        if (r.score < best.score) best = { x: cx, y: cy, phi, score: r.score, vis: r.vis };
      }
    }
  }
  return best;
}
