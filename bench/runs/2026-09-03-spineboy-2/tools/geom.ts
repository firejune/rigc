/**
 * The run's own coordinate and plate arithmetic, in one place.
 *
 * Two conversions are NOT open-coded here — `cropToSpineY` and
 * `screenToSpineDegrees` come from `src/transform.ts`, which AUTHORING §11.2
 * says to use rather than to reimplement.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Plate, readPlate } from '../../../../tools/plate';
import { viewportOfSize, type Viewport } from '../../../../src/render';
import { cropToSpineY, screenToSpineDegrees } from '../../../../src/transform';

export const BACKGROUND: [number, number, number, number] = [232, 232, 232, 255];

/** The mask threshold the brief and `src/framing.ts` both read at: 8/255. */
export const MASK_TOLERANCE = 8;

export interface Sidecar {
  viewport: { x: number; y: number; width: number; height: number; scale: number; pixelWidth: number; pixelHeight: number };
  sets: { dir: string; animation: string; fps: number; sampled: number; written: number; stride: number; duration: number }[];
}

export function sidecarOf(root: string): Sidecar {
  return JSON.parse(readFileSync(join(root, 'frames.json'), 'utf8')) as Sidecar;
}

/** The frames' own declared box, as the renderer's Viewport. */
export function declaredViewport(s: Sidecar): Viewport {
  const v = s.viewport;
  return viewportOfSize(v.x, v.y, v.width, v.height, v.scale, v.pixelWidth, v.pixelHeight);
}

/** Frame pixel (x right, y down, origin top-left) -> Spine world (y up). */
export function frameToWorld(v: Viewport, fx: number, fy: number): [number, number] {
  return [v.minX + fx / v.scale, v.maxY - fy / v.scale];
}

/** Spine world -> frame pixel. The inverse of the above. */
export function worldToFrame(v: Viewport, wx: number, wy: number): [number, number] {
  return [(wx - v.minX) * v.scale, (v.maxY - wy) * v.scale];
}

/** A `pose`/`chainfit` placement, in that report's own frame-pixel contract. */
export interface Placement {
  x: number;
  y: number;
  rotationDeg: number;
  scale: number;
}

/** The same placement as a world centre and a Spine rotation. */
export function placementToWorld(v: Viewport, p: Placement): { x: number; y: number; rotation: number } {
  const [wx, wy] = frameToWorld(v, p.x, p.y);
  return { x: wx, y: wy, rotation: screenToSpineDegrees(p.rotationDeg) };
}

/**
 * Carry a point given in a part image's own pixel coordinates through a
 * placement into frame pixels.
 *
 * `pose` reports where the image's own centre `(w/2, h/2)` lands, and
 * §11.2's reconstruction is `centre + scale * R(rotationDeg) * (p - centre)`
 * with `rotationDeg` positive clockwise ON SCREEN — which in a y-down frame is
 * the ordinary +sin/-sin matrix below.
 */
export function partPixelToFrame(p: Placement, w: number, h: number, px: number, py: number): [number, number] {
  const t = (p.rotationDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const dx = px - w / 2;
  const dy = py - h / 2;
  return [p.x + p.scale * (c * dx - s * dy), p.y + p.scale * (s * dx + c * dy)];
}

/** The inverse: a frame pixel back into the part image's own pixels. */
export function frameToPartPixel(p: Placement, w: number, h: number, fx: number, fy: number): [number, number] {
  const t = (p.rotationDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const dx = (fx - p.x) / p.scale;
  const dy = (fy - p.y) / p.scale;
  return [c * dx + s * dy + w / 2, -s * dx + c * dy + h / 2];
}

export { cropToSpineY, screenToSpineDegrees };

// ---------------------------------------------------------------------------
// plates
// ---------------------------------------------------------------------------

export function framePath(root: string, set: string, index: number): string {
  return join(root, set, `f${String(index).padStart(4, '0')}.png`);
}

export function loadFrame(path: string): Plate {
  return readPlate(path);
}

/** Is this pixel drawn, i.e. off the backdrop by more than the mask tolerance? */
export function isInk(plate: Plate, x: number, y: number, tol = MASK_TOLERANCE): boolean {
  const i = (y * plate.width + x) * 4;
  const d = plate.data;
  return (
    Math.abs(d[i] - BACKGROUND[0]) > tol ||
    Math.abs(d[i + 1] - BACKGROUND[1]) > tol ||
    Math.abs(d[i + 2] - BACKGROUND[2]) > tol
  );
}

/** Count the pixels whose colour differs between two plates by more than `tol`. */
export function changedPixels(a: Plate, b: Plate, tol: number): number {
  const p = a.data;
  const q = b.data;
  let n = 0;
  for (let i = 0; i < p.length; i += 4) {
    if (Math.abs(p[i] - q[i]) > tol || Math.abs(p[i + 1] - q[i + 1]) > tol || Math.abs(p[i + 2] - q[i + 2]) > tol) n++;
  }
  return n;
}

/** Every pixel where two plates differ by more than `tol`, as a Uint8Array mask. */
export function changeMask(a: Plate, b: Plate, tol: number): Uint8Array {
  const p = a.data;
  const q = b.data;
  const m = new Uint8Array(a.width * a.height);
  for (let i = 0, at = 0; i < p.length; i += 4, at++) {
    if (Math.abs(p[i] - q[i]) > tol || Math.abs(p[i + 1] - q[i + 1]) > tol || Math.abs(p[i + 2] - q[i + 2]) > tol) {
      m[at] = 1;
    }
  }
  return m;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The box of drawn pixels, plus the count and centroid. */
export function inkStats(plate: Plate, tol = MASK_TOLERANCE): { box: Box | null; pixels: number; cx: number; cy: number } {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let pixels = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      if (!isInk(plate, x, y, tol)) continue;
      pixels++;
      sx += x;
      sy += y;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (pixels === 0) return { box: null, pixels: 0, cx: 0, cy: 0 };
  return { box: { left, top, right, bottom }, pixels, cx: sx / pixels, cy: sy / pixels };
}

/**
 * Box-average a plate down by an integer factor, as AUTHORING §8.1 requires
 * before comparing: "at full resolution the objective is flat over the range a
 * joint has to travel".
 */
export function reduce(plate: Plate, factor: number): { w: number; h: number; rgb: Float32Array } {
  const w = Math.max(1, Math.ceil(plate.width / factor));
  const h = Math.max(1, Math.ceil(plate.height / factor));
  const rgb = new Float32Array(w * h * 3);
  const counts = new Float32Array(w * h);
  const d = plate.data;
  for (let y = 0; y < plate.height; y++) {
    const ty = Math.floor(y / factor);
    for (let x = 0; x < plate.width; x++) {
      const tx = Math.floor(x / factor);
      const at = ty * w + tx;
      const i = (y * plate.width + x) * 4;
      rgb[at * 3] += d[i];
      rgb[at * 3 + 1] += d[i + 1];
      rgb[at * 3 + 2] += d[i + 2];
      counts[at]++;
    }
  }
  for (let i = 0; i < w * h; i++) {
    const c = counts[i] || 1;
    rgb[i * 3] /= c;
    rgb[i * 3 + 1] /= c;
    rgb[i * 3 + 2] /= c;
  }
  return { w, h, rgb };
}

/** Box-average a per-pixel weight the same way, so a pyramid level keeps it. */
export function reduceWeight(weight: Float32Array, width: number, height: number, factor: number): { w: number; h: number; v: Float32Array } {
  const w = Math.max(1, Math.ceil(width / factor));
  const h = Math.max(1, Math.ceil(height / factor));
  const v = new Float32Array(w * h);
  const counts = new Float32Array(w * h);
  for (let y = 0; y < height; y++) {
    const ty = Math.floor(y / factor);
    for (let x = 0; x < width; x++) {
      const at = ty * w + Math.floor(x / factor);
      v[at] += weight[y * width + x];
      counts[at]++;
    }
  }
  for (let i = 0; i < w * h; i++) v[i] /= counts[i] || 1;
  return { w, h, v };
}

export function plateToRgb(plate: Plate): Float32Array {
  const d = plate.data;
  const rgb = new Float32Array(plate.width * plate.height * 3);
  for (let i = 0, at = 0; i < d.length; i += 4, at += 3) {
    rgb[at] = d[i];
    rgb[at + 1] = d[i + 1];
    rgb[at + 2] = d[i + 2];
  }
  return rgb;
}

/** Weighted mean absolute RGB difference between two same-sized rgb buffers. */
export function weightedMae(a: Float32Array, b: Float32Array, weight: Float32Array | null): number {
  const n = weight ? weight.length : a.length / 3;
  let sum = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const wt = weight ? weight[i] : 1;
    if (wt <= 0) continue;
    const at = i * 3;
    sum += wt * (Math.abs(a[at] - b[at]) + Math.abs(a[at + 1] - b[at + 1]) + Math.abs(a[at + 2] - b[at + 2])) / 3;
    total += wt;
  }
  return total === 0 ? 0 : sum / total;
}
