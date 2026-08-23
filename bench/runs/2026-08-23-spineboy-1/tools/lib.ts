/**
 * The shared measuring bench for this run.
 *
 * Everything here composites **loose art PNGs** through the repository's own
 * rasteriser (`src/render.ts`), so a candidate pose and a reference frame are
 * drawn by the same code and their difference is the pose rather than two
 * rasterisers disagreeing. A part is a plain (centre, rotation) placement in
 * world units, which is exactly what a Spine region attachment on a bone
 * resolves to — so a fit here transfers to a rig spec without a second model.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import type { Quad, Frame, Viewport } from '../../../../src/render.ts';
import { renderFrame, viewportOfSize } from '../../../../src/render.ts';

export const ROOT = join(import.meta.dir, '../../../..');
export const IMAGES = join(ROOT, 'examples/spineboy/images');
export const BG: [number, number, number, number] = [232, 232, 232, 255];
export const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// art
// ---------------------------------------------------------------------------

const artCache = new Map<string, Plate>();
export function art(name: string): Plate {
  let p = artCache.get(name);
  if (!p) {
    p = readPlate(join(IMAGES, `${name}.png`));
    artCache.set(name, p);
  }
  return p;
}

export const pages = new Proxy(new Map<string, Plate>(), {}) as Map<string, Plate>;

/** Page map for `renderFrame`, keyed by the part name each quad declares. */
export function pageMap(names: string[]): Map<string, Plate> {
  const m = new Map<string, Plate>();
  for (const n of names) m.set(n, art(n));
  return m;
}

// ---------------------------------------------------------------------------
// placements
// ---------------------------------------------------------------------------

/** One art plate placed in the world: centre, rotation (degrees CCW), scale. */
export interface Placement {
  part: string;
  /** the art file, when it differs from the part (slot) name */
  image?: string;
  cx: number;
  cy: number;
  rot: number;
  sx?: number;
  sy?: number;
}

/** The four world corners of a placed plate, in spine-core's br, bl, ul, ur order. */
export function quadOf(p: Placement): Quad {
  const image = p.image ?? p.part;
  const plate = art(image);
  const hw = (plate.width * (p.sx ?? 1)) / 2;
  const hh = (plate.height * (p.sy ?? 1)) / 2;
  const c = Math.cos(p.rot * DEG);
  const s = Math.sin(p.rot * DEG);
  const at = (lx: number, ly: number): [number, number] => [p.cx + lx * c - ly * s, p.cy + lx * s + ly * c];
  const [brx, bry] = at(hw, -hh);
  const [blx, bly] = at(-hw, -hh);
  const [ulx, uly] = at(-hw, hh);
  const [urx, ury] = at(hw, hh);
  return {
    kind: 'region',
    slot: p.part,
    page: image,
    tint: [1, 1, 1, 1],
    world: [brx, bry, blx, bly, ulx, uly, urx, ury],
    // u across the page, v down it: the quad's upper-left corner is the image's
    // first row, which is v = 0.
    uvs: [1, 1, 0, 1, 0, 0, 1, 0],
  };
}

export function frameOf(placements: Placement[]): Frame {
  return { index: 0, time: 0, pieces: placements.map(quadOf) };
}

export function renderPlacements(placements: Placement[], viewport: Viewport): Plate {
  const names = new Set<string>();
  for (const p of placements) names.add(p.image ?? p.part);
  return renderFrame(frameOf(placements), pageMap([...names]), viewport, BG);
}

// ---------------------------------------------------------------------------
// the reference frames
// ---------------------------------------------------------------------------

export interface Sidecar {
  viewport: { x: number; y: number; width: number; height: number; scale: number; pixelWidth: number; pixelHeight: number };
  sets: { dir: string; animation: string; fps: number; sampled: number; written: number; duration: number }[];
}

export function sidecar(skeleton: 'ess' | 'pro'): Sidecar {
  return JSON.parse(readFileSync(join(ROOT, 'bench/reference/spineboy', skeleton, 'frames.json'), 'utf8'));
}

export function viewportOf(skeleton: 'ess' | 'pro'): Viewport {
  const v = sidecar(skeleton).viewport;
  return viewportOfSize(v.x, v.y, v.width, v.height, v.scale, v.pixelWidth, v.pixelHeight);
}

export function refFrame(skeleton: 'ess' | 'pro', set: string, index: number): Plate {
  const n = String(index).padStart(4, '0');
  return readPlate(join(ROOT, 'bench/reference/spineboy', skeleton, set, `f${n}.png`));
}

/**
 * The same world grid over a pixel sub-rectangle of the frame.
 *
 * Fitting spends nearly all its time filling and differencing background, and a
 * standing figure covers a twentieth of this rung's viewport. Cropping to the
 * part of the frame either side can draw in keeps the scale and the world origin
 * **exactly**, so a number measured in a crop is the number measured in the
 * frame — nothing here is a resample.
 */
export function cropViewport(v: Viewport, x0: number, y0: number, w: number, h: number): Viewport {
  const minX = v.minX + x0 / v.scale;
  const maxY = v.maxY - y0 / v.scale;
  return { minX, maxX: minX + w / v.scale, maxY, minY: maxY - h / v.scale, scale: v.scale, width: w, height: h };
}

export function cropPlate(p: Plate, x0: number, y0: number, w: number, h: number): Plate {
  const out = new Plate(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      const sy = y0 + y;
      out.set(x, y, sx >= 0 && sy >= 0 && sx < p.width && sy < p.height ? p.get(sx, sy) : BG);
    }
  return out;
}

/** World → frame pixel, and back. */
export function worldToPixel(v: Viewport) {
  return (wx: number, wy: number): [number, number] => [(wx - v.minX) * v.scale, (v.maxY - wy) * v.scale];
}
export function pixelToWorld(v: Viewport) {
  return (px: number, py: number): [number, number] => [v.minX + px / v.scale, v.maxY - py / v.scale];
}

// ---------------------------------------------------------------------------
// difference
// ---------------------------------------------------------------------------

/** Mean absolute RGB difference over the union of the two subject masks. */
export function unionMae(a: Plate, b: Plate, tol = 8): { mae: number; union: number } {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const ar = a.data[i], ag = a.data[i + 1], ab = a.data[i + 2];
      const br = b.data[i], bg = b.data[i + 1], bb = b.data[i + 2];
      const aOn = Math.abs(ar - BG[0]) > tol || Math.abs(ag - BG[1]) > tol || Math.abs(ab - BG[2]) > tol;
      const bOn = Math.abs(br - BG[0]) > tol || Math.abs(bg - BG[1]) > tol || Math.abs(bb - BG[2]) > tol;
      if (!aOn && !bOn) continue;
      sum += (Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb)) / 3;
      n++;
    }
  }
  return { mae: n === 0 ? 0 : sum / n, union: n };
}

/** Plain sum of absolute RGB difference over the whole frame — the fitting objective. */
export function sad(a: Plate, b: Plate): number {
  let sum = 0;
  const d = a.data;
  const e = b.data;
  for (let i = 0; i < d.length; i += 4) {
    sum += Math.abs(d[i] - e[i]) + Math.abs(d[i + 1] - e[i + 1]) + Math.abs(d[i + 2] - e[i + 2]);
  }
  return sum;
}

/** The subject mask's bounding box and centroid, at the brief's own 8/255 threshold. */
export function subject(p: Plate, tol = 8) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0, sx = 0, sy = 0;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 4;
      if (
        Math.abs(p.data[i] - BG[0]) <= tol &&
        Math.abs(p.data[i + 1] - BG[1]) <= tol &&
        Math.abs(p.data[i + 2] - BG[2]) <= tol
      )
        continue;
      n++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { count: n, cx: sx / n, cy: sy / n, minX, minY, maxX, maxY };
}
