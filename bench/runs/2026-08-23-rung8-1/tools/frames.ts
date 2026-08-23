/**
 * Shared frame-measurement helpers for the rung 8 run.
 *
 * Everything here reads **rendered PNGs only** — the reference frames under
 * `bench/reference/8-follow-through/` and the loose art under
 * `examples/8-follow-through/images/`. Nothing here opens a skeleton export.
 */
import { readPlate, Plate, type RGBA } from '../../../../tools/plate.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Sidecar {
  background: [number, number, number, number];
  viewport: {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
    pixelWidth: number;
    pixelHeight: number;
  };
  sets: { dir: string; animation: string; fps: number; written: number; duration: number }[];
}

export const REF_ROOT = 'bench/reference/8-follow-through';
export const IMAGES = 'examples/8-follow-through/images';

export function sidecar(skeleton: string): Sidecar {
  return JSON.parse(readFileSync(join(REF_ROOT, skeleton, 'frames.json'), 'utf8')) as Sidecar;
}

/** Every `fNNNN.png` of one set, in index order. */
export function loadSet(skeleton: string, dir: string): Plate[] {
  const path = join(REF_ROOT, skeleton, dir);
  const names = readdirSync(path)
    .filter((n) => /^f\d+\.png$/.test(n))
    .sort();
  return names.map((n) => readPlate(join(path, n)));
}

/** A pixel is drawn when it differs from the backdrop by more than `tol` on some channel. */
export function mask(plate: Plate, background: RGBA, tol = 8): Uint8Array {
  const out = new Uint8Array(plate.width * plate.height);
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      const [r, g, b] = plate.get(x, y);
      const d = Math.max(Math.abs(r - background[0]), Math.abs(g - background[1]), Math.abs(b - background[2]));
      if (d > tol) out[y * plate.width + x] = 1;
    }
  }
  return out;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
  cx: number;
  cy: number;
}

export function boxOf(m: Uint8Array, width: number, height: number): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!m[y * width + x]) continue;
      count++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (count === 0) return null;
  return { minX, minY, maxX, maxY, count, cx: sx / count, cy: sy / count };
}

/** 8-connected components of a mask, as index lists. */
export function components(m: Uint8Array, width: number, height: number): number[][] {
  const seen = new Uint8Array(m.length);
  const out: number[][] = [];
  const stack: number[] = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || seen[i]) continue;
    stack.length = 0;
    stack.push(i);
    seen[i] = 1;
    const comp: number[] = [];
    while (stack.length) {
      const p = stack.pop() as number;
      comp.push(p);
      const x = p % width;
      const y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (m[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    out.push(comp);
  }
  return out;
}

/** Orange in this art: warm, red clearly above blue. */
export function isOrange(r: number, g: number, b: number): boolean {
  return r > 120 && r - b > 55 && r >= g;
}

export function orangeMask(plate: Plate): Uint8Array {
  const out = new Uint8Array(plate.width * plate.height);
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      const [r, g, b, a] = plate.get(x, y);
      if (a > 128 && isOrange(r, g, b)) out[y * plate.width + x] = 1;
    }
  }
  return out;
}

/** Principal axes of a point set: major/minor half-extents and the major-axis angle in degrees. */
export function principalAxes(points: [number, number][]): {
  cx: number;
  cy: number;
  major: number;
  minor: number;
  angle: number;
} {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  cx /= points.length;
  cy /= points.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    const dx = x - cx;
    const dy = y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  sxx /= points.length;
  syy /= points.length;
  sxy /= points.length;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.max(0, (tr * tr) / 4 - det);
  const l1 = tr / 2 + Math.sqrt(disc);
  const l2 = tr / 2 - Math.sqrt(disc);
  // 4 sigma is the full width of a uniform ellipse: for a filled ellipse of
  // semi-axis a the second moment is a^2/4, so a = 2 sqrt(lambda).
  const major = 2 * Math.sqrt(Math.max(0, l1));
  const minor = 2 * Math.sqrt(Math.max(0, l2));
  const angle = (Math.atan2(2 * sxy, sxx - syy) / 2) * (180 / Math.PI);
  return { cx, cy, major, minor, angle };
}

export function pointsOf(m: Uint8Array, width: number, indices?: number[]): [number, number][] {
  const out: [number, number][] = [];
  if (indices) {
    for (const p of indices) out.push([p % width, Math.floor(p / width)]);
    return out;
  }
  for (let i = 0; i < m.length; i++) {
    if (m[i]) out.push([i % width, Math.floor(i / width)]);
  }
  return out;
}
