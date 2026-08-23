/**
 * Where one loose art plate sits in a reference frame.
 *
 * The score is a **trimmed** mean colour distance over the template's own opaque
 * pixels — the best 60 % of them — so a part that is half covered by something
 * drawn over it still localises. §8's first trap is the reason: a whole-shape
 * estimator changes meaning on exactly the frames where two parts touch, and on
 * a character every frame is such a frame. A trimmed score answers "where does
 * this part's *visible* evidence sit" instead.
 *
 * ⚠️ It is an initialiser, not a measurement. Nothing downstream believes a
 * match without the composite fit agreeing.
 */
import { Plate } from '../../../../tools/plate.ts';
import { art, DEG } from './lib.ts';

export interface Template {
  w: number;
  h: number;
  /** rgba rows, frame scale */
  data: Float32Array;
  /** offset from the template's top-left to the placement centre, in template px */
  ox: number;
  oy: number;
}

/** Rasterise one art plate at `scale`, rotated by `rot` degrees CCW (y up). */
export function template(name: string, rot: number, scale: number): Template {
  const src = art(name);
  const c = Math.cos(rot * DEG);
  const s = Math.sin(rot * DEG);
  const hw = (src.width * scale) / 2;
  const hh = (src.height * scale) / 2;
  // corners of the rotated box in frame px (y down, so the rotation flips sign)
  const xs = [hw * c + hh * s, -hw * c + hh * s, hw * c - hh * s, -hw * c - hh * s];
  const ys = [hw * s - hh * c, -hw * s - hh * c, hw * s + hh * c, -hw * s + hh * c];
  const w = Math.ceil(Math.max(...xs) - Math.min(...xs)) + 2;
  const h = Math.ceil(Math.max(...ys) - Math.min(...ys)) + 2;
  const ox = w / 2;
  const oy = h / 2;
  const data = new Float32Array(w * h * 4);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      // template px → frame-space offset from centre → world offset (y up)
      const fx = px + 0.5 - ox;
      const fy = -(py + 0.5 - oy);
      // undo the rotation, undo the scale → art-local, y up from centre
      const lx = (fx * c + fy * s) / scale;
      const ly = (-fx * s + fy * c) / scale;
      const ax = lx + src.width / 2;
      const ay = src.height / 2 - ly;
      if (ax < 0 || ay < 0 || ax >= src.width || ay >= src.height) continue;
      const [r, g, b, a] = bilinear(src, ax - 0.5, ay - 0.5);
      const i = (py * w + px) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { w, h, data, ox, oy };
}

function bilinear(p: Plate, x: number, y: number): [number, number, number, number] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (ix: number, iy: number): number[] => {
    const cx = Math.max(0, Math.min(p.width - 1, ix));
    const cy = Math.max(0, Math.min(p.height - 1, iy));
    const i = (cy * p.width + cx) * 4;
    return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
  };
  const c00 = at(x0, y0);
  const c10 = at(x0 + 1, y0);
  const c01 = at(x0, y0 + 1);
  const c11 = at(x0 + 1, y0 + 1);
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const top = c00[c] + (c10[c] - c00[c]) * fx;
    const bot = c01[c] + (c11[c] - c01[c]) * fx;
    out[c] = top + (bot - top) * fy;
  }
  return out as [number, number, number, number];
}

/** Trimmed mean colour distance of a template placed with its centre at (cx, cy). */
export function score(t: Template, ref: Plate, cx: number, cy: number, keep = 0.6): number {
  const x0 = Math.round(cx - t.ox);
  const y0 = Math.round(cy - t.oy);
  const ds: number[] = [];
  for (let py = 0; py < t.h; py++) {
    const ry = y0 + py;
    if (ry < 0 || ry >= ref.height) continue;
    for (let px = 0; px < t.w; px++) {
      const i = (py * t.w + px) * 4;
      if (t.data[i + 3] < 160) continue;
      const rx = x0 + px;
      if (rx < 0 || rx >= ref.width) {
        ds.push(400);
        continue;
      }
      const j = (ry * ref.width + rx) * 4;
      ds.push(
        Math.abs(t.data[i] - ref.data[j]) + Math.abs(t.data[i + 1] - ref.data[j + 1]) + Math.abs(t.data[i + 2] - ref.data[j + 2]),
      );
    }
  }
  if (ds.length === 0) return Infinity;
  ds.sort((a, b) => a - b);
  const k = Math.max(1, Math.round(ds.length * keep));
  let s = 0;
  for (let i = 0; i < k; i++) s += ds[i];
  return s / k / 3;
}

export interface Match {
  cx: number;
  cy: number;
  rot: number;
  score: number;
}

/** Coarse-to-fine search over centre and rotation, in frame pixels. */
export function locate(
  name: string,
  ref: Plate,
  box: { minX: number; minY: number; maxX: number; maxY: number },
  scale: number,
  rots: number[],
  keep = 0.6,
): Match {
  let best: Match = { cx: 0, cy: 0, rot: 0, score: Infinity };
  for (const rot of rots) {
    const t = template(name, rot, scale);
    for (let cy = box.minY; cy <= box.maxY; cy += 2) {
      for (let cx = box.minX; cx <= box.maxX; cx += 2) {
        const s = score(t, ref, cx, cy, keep);
        if (s < best.score) best = { cx, cy, rot, score: s };
      }
    }
  }
  // refine
  for (let pass = 0; pass < 3; pass++) {
    const step = [1, 0.5, 0.25][pass];
    const dr = [4, 1.5, 0.5][pass];
    let improved = true;
    while (improved) {
      improved = false;
      for (const [dx, dy, drot] of [
        [step, 0, 0],
        [-step, 0, 0],
        [0, step, 0],
        [0, -step, 0],
        [0, 0, dr],
        [0, 0, -dr],
      ]) {
        const cand = { cx: best.cx + dx, cy: best.cy + dy, rot: best.rot + drot, score: 0 };
        const t = template(name, cand.rot, scale);
        cand.score = score(t, ref, cand.cx, cand.cy, keep);
        if (cand.score < best.score - 1e-6) {
          best = cand;
          improved = true;
        }
      }
    }
  }
  return best;
}
