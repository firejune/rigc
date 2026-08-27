/**
 * Rung 7 — art-side measurement, and the calibration of every estimator this run
 * uses on the frames.
 *
 * The brief's revision-2 header states five art-side controls with their answers.
 * Reproducing all five is what licenses the same code to be pointed at the frames
 * (docs/AUTHORING.md §8: score the estimator against a shape built out of the art
 * itself before believing a number it gives you).
 *
 * Conventions, all of them stated by the brief and none of them the obvious choice:
 *   - opaque, on the art side, means alpha >= 128
 *   - sack vs cape is split on g - b:  cape <=> g - b <= 8
 *   - the frames' scale is 0.18987105139412822 px per unit (frames.json)
 */
import { readPlate } from '../../../../tools/plate.ts';

export const SCALE = 0.18987105139412822;
export const OPAQUE = 128;
export const CAPE_GB = 8;
export const IMAGES = 'examples/7-anticipation/images';

export interface ArtMask {
  w: number;
  h: number;
  /** 1 where alpha >= OPAQUE */
  on: Uint8Array;
  /** 1 where on and g - b <= CAPE_GB */
  cape: Uint8Array;
  count: number;
  capeCount: number;
  box: { left: number; top: number; right: number; bottom: number };
}

export function artMask(file: string): ArtMask {
  const p = readPlate(`${IMAGES}/${file}`);
  const on = new Uint8Array(p.width * p.height);
  const cape = new Uint8Array(p.width * p.height);
  let count = 0;
  let capeCount = 0;
  let left = p.width;
  let top = p.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const [r, g, b, a] = p.get(x, y);
      if (a < OPAQUE) continue;
      const i = y * p.width + x;
      on[i] = 1;
      count++;
      if (g - b <= CAPE_GB) {
        cape[i] = 1;
        capeCount++;
      }
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return { w: p.width, h: p.height, on, cape, count, capeCount, box: { left, top, right, bottom } };
}

/** The farthest-apart pair of set pixels, exactly, over the mask's convex hull. */
export function diameter(m: Uint8Array, w: number, h: number): number {
  // Per-row first/last is enough: the extreme pair is always on the boundary, and
  // the boundary of a raster mask is covered by the per-row and per-column extremes.
  const pts: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < w; x++)
      if (m[y * w + x]) {
        if (a < 0) a = x;
        b = x;
      }
    if (a >= 0) {
      pts.push([a, y]);
      if (b !== a) pts.push([b, y]);
    }
  }
  for (let x = 0; x < w; x++) {
    let a = -1;
    let b = -1;
    for (let y = 0; y < h; y++)
      if (m[y * w + x]) {
        if (a < 0) a = y;
        b = y;
      }
    if (a >= 0) {
      pts.push([x, a]);
      if (b !== a) pts.push([x, b]);
    }
  }
  let best = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i][0] - pts[j][0];
      const dy = pts[i][1] - pts[j][1];
      const d = dx * dx + dy * dy;
      if (d > best) best = d;
    }
  return Math.sqrt(best);
}

if (import.meta.main) {
  const files = ['sack.png', 'cape-back.png', 'cape-front.png'];
  console.log('scale', SCALE, ' opaque alpha >=', OPAQUE, ' cape <=> g-b <=', CAPE_GB);
  console.log('');
  for (const f of files) {
    const m = artMask(f);
    const bw = m.box.right - m.box.left + 1;
    const bh = m.box.bottom - m.box.top + 1;
    const d = diameter(m.on, m.w, m.h);
    console.log(
      `${f.padEnd(15)} png ${m.w}x${m.h}  opaque box ${bw}x${bh}` +
        `  at scale ${(bw * SCALE).toFixed(1)}x${(bh * SCALE).toFixed(1)}` +
        `  opaque ${m.count}  cape-side ${m.capeCount} (${((100 * m.capeCount) / m.count).toFixed(1)}%)` +
        `  area@scale ${Math.round(m.count * SCALE * SCALE)}` +
        `  diameter@scale ${(d * SCALE).toFixed(1)}`,
    );
    // centre of the opaque box relative to the PNG centre, in art pixels — this is
    // the attachment offset a region needs if the bone sits on the drawing's centre.
    const cx = (m.box.left + m.box.right + 1) / 2 - m.w / 2;
    const cy = (m.box.top + m.box.bottom + 1) / 2 - m.h / 2;
    console.log(`${''.padEnd(15)} opaque-box centre vs png centre  dx ${cx.toFixed(1)}  dy ${cy.toFixed(1)} (png px, y down)`);
  }
}
