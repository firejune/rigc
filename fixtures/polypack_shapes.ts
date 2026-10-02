/**
 * A seeded set of mesh regions shaped like a production rig's page — the
 * fixture the polygon packer's cost is held on (issue #1102, `PK92`–`PK95`).
 *
 * ⭐ Why it exists. The polygon packer's first cost fix (#1101) was measured on
 * a synthetic set of 30 mid-sized parts whose hulls were their rectangles pulled
 * in by a few per cent. A production rig is not that shape, and the packer took
 * 1,764 s on one where `rect` took 19 s. What that rig has and that set did not:
 *
 *   * **few regions, a handful of them large** — 31 regions, every one a mesh;
 *     four with a long side between 580 and 1,420 texels, the rest between
 *     about 50 and 420, so the set does not fit one 2048 page and spills;
 *   * **hulls of a few to a few dozen vertices** (4 to 57, most between 8 and
 *     25) that cover a third to three quarters of their rectangle, a couple
 *     that are the whole rectangle, and **one large region whose mesh draws a
 *     small part of it** — so its owned box does not start at its cell's
 *     corner.
 *
 * That rig's own silhouette is private and is not here. This generates a set
 * with the same counts, size bands and hull-vertex range from a seed, so the
 * cost is reproducible from a fresh clone; the numbers above are bands chosen
 * to cover what was measured, not a copy of any region.
 *
 * Every hull is a star polygon around its region's centre — its vertices at
 * increasing angles, so the loop is simple — with each radius a random fraction
 * of the half extent, clamped to the rectangle. The generator is a pure
 * function of the seed (mulberry32, no clock), so two calls agree to the bit.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Plate } from '../tools/plate.ts';

/** One generated region: its size, and its hull loop `[x0, y0, x1, y1, …]` in region texels (x right, y down). */
export interface PolypackShape {
  region: string;
  width: number;
  height: number;
  hull: number[];
}

/**
 * The seed `PK93` holds the cost on: the first from 1102 up whose set spills to
 * two pages under `rect` and packs to the same pages under `polygon`, as the
 * rig it stands for does (1102 spills to three, 1103–1106 do not spill or do
 * not pack identically).
 */
export const POLYPACK_SEED = 1107;

/**
 * A seed whose set the footprint pass wins on — a spilled page whose largest
 * region's owned box does start at its cell's corner, so the pass places it
 * and packs the page smaller (`PK92`). The first such seed from 1102 up.
 */
export const POLYPACK_GAIN_SEED = 1105;

/** How many regions a set has — the production page's count. */
export const POLYPACK_REGIONS = 31;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number log-uniform in `[lo, hi]`. */
function logUniform(random: () => number, lo: number, hi: number): number {
  return Math.round(Math.exp(Math.log(lo) + random() * (Math.log(hi) - Math.log(lo))));
}

/** Round to the 2 decimals a hull's texel coordinates carry once a 7-decimal UV is multiplied out — enough to be off the grid. */
const at2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * A star polygon of `n` vertices around `(cx, cy)` with radii `(rx, ry)` scaled
 * by a per-vertex fraction in `[lo, hi]`, clamped to `width x height`.
 */
function star(random: () => number, n: number, cx: number, cy: number, rx: number, ry: number, lo: number, hi: number, width: number, height: number): number[] {
  const hull: number[] = [];
  const phase = random() * 2 * Math.PI;
  for (let i = 0; i < n; i++) {
    const angle = phase + (2 * Math.PI * i) / n;
    const f = lo + random() * (hi - lo);
    const x = Math.min(width, Math.max(0, cx + Math.cos(angle) * rx * f));
    const y = Math.min(height, Math.max(0, cy + Math.sin(angle) * ry * f));
    hull.push(at2(x), at2(y));
  }
  return hull;
}

/**
 * The set for `seed`: `POLYPACK_REGIONS` mesh regions. The sizes are drawn
 * first, then the hulls; the small interior hull goes to the region the packer
 * takes first (the longest side, then the larger area), as it does on the rig
 * this set stands for.
 */
export function polypackShapes(seed: number = POLYPACK_SEED): PolypackShape[] {
  const random = mulberry32(seed);
  const sizes: Array<{ width: number; height: number }> = [];
  for (let i = 0; i < POLYPACK_REGIONS; i++) {
    if (i < 4) {
      const long = logUniform(random, 580, 1420);
      const short = Math.round(long * (0.75 + random() * 0.25));
      const wide = random() < 0.5;
      sizes.push({ width: wide ? long : short, height: wide ? short : long });
    } else {
      sizes.push({ width: logUniform(random, 48, 420), height: logUniform(random, 48, 420) });
    }
  }
  let first = 0;
  sizes.forEach((s, i) => {
    const long = Math.max(s.width, s.height);
    const best = Math.max(sizes[first].width, sizes[first].height);
    if (long > best || (long === best && s.width * s.height > sizes[first].width * sizes[first].height)) first = i;
  });
  return sizes.map(({ width, height }, i) => {
    let hull: number[];
    if (i === first) {
      // The large region whose mesh draws a small part of it: a hull of a few
      // dozen texels' radius somewhere inside, clear of the edges.
      const n = 4 + Math.floor(random() * 6);
      const rx = width * (0.03 + random() * 0.04);
      const ry = height * (0.03 + random() * 0.04);
      const cx = width * (0.3 + random() * 0.4);
      const cy = height * (0.3 + random() * 0.4);
      hull = star(random, n, cx, cy, rx, ry, 0.6, 1, width, height);
    } else if (i === 5 || i === 17) {
      // Two hulls that are the whole rectangle.
      hull = [width, height, 0, height, 0, 0, width, 0];
    } else {
      // 4 to 57 vertices, most between 8 and 25.
      const n = random() < 0.15 ? 26 + Math.floor(random() * 32) : 4 + Math.floor(random() * 22);
      hull = star(random, n, width / 2, height / 2, width / 2, height / 2, 0.45, 1.25, width, height);
    }
    return { region: `poly_${String(i).padStart(2, '0')}`, width, height, hull };
  });
}

/**
 * The set written as plates under `dir` — opaque inside each hull (texel
 * centres, even-odd), transparent outside, which is what a mesh region's PNG
 * is — and returned as pack inputs carrying the hull as their footprint.
 */
export function writePolypackInputs(
  dir: string,
  shapes: readonly PolypackShape[],
): Array<{ region: string; absPath: string; width: number; height: number; footprint: { polygons: number[][] } }> {
  mkdirSync(dir, { recursive: true });
  return shapes.map((shape) => {
    const plate = new Plate(shape.width, shape.height);
    const n = shape.hull.length / 2;
    for (let y = 0; y < shape.height; y++) {
      const py = y + 0.5;
      const crossings: number[] = [];
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const yi = shape.hull[2 * i + 1];
        const yj = shape.hull[2 * j + 1];
        if (yi > py !== yj > py) {
          const xi = shape.hull[2 * i];
          const xj = shape.hull[2 * j];
          crossings.push(xi + ((py - yi) * (xj - xi)) / (yj - yi));
        }
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(crossings[k] - 0.5)); x < Math.min(shape.width, Math.ceil(crossings[k + 1] - 0.5)); x++) {
          plate.set(x, y, [(x * 7) % 256, (y * 5) % 256, (x ^ y) % 256, 255]);
        }
      }
    }
    const absPath = join(dir, `${shape.region}.png`);
    plate.writePng(absPath);
    return { region: shape.region, absPath, width: shape.width, height: shape.height, footprint: { polygons: [shape.hull] } };
  });
}
