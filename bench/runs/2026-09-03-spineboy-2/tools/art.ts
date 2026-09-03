/**
 * Read the art, not the render: every part PNG's opaque geometry, plus a coarse
 * ASCII picture of it.
 *
 * AUTHORING §8's "find a second, independent way to get the number — often by
 * measuring the ART instead of the render, which needs no build at all". A limb
 * plate is drawn with its joint at one end, and that end is a fact about the
 * file rather than about any frame.
 *
 * `opaque` here means alpha >= 128, stated because rung 7's verification pass
 * found that exact convention unstated and guessed wrong.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readPlate } from '../../../../tools/plate';

export const OPAQUE_ALPHA = 128;

export interface ArtGeometry {
  part: string;
  width: number;
  height: number;
  /** Opaque bounding box, inclusive. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  opaque: number;
  /** Centroid of the opaque pixels, in image coordinates. */
  cx: number;
  cy: number;
  /** Opaque-pixel centroid of the topmost and bottommost 12% of opaque rows. */
  topCap: [number, number];
  bottomCap: [number, number];
  leftCap: [number, number];
  rightCap: [number, number];
}

export const CAP_SHARE = 0.12;

export function geometryOf(path: string, part: string): ArtGeometry {
  const p = readPlate(path);
  const d = p.data;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (d[(y * p.width + x) * 4 + 3] < OPAQUE_ALPHA) continue;
      n++;
      sx += x;
      sy += y;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const cap = (test: (x: number, y: number) => boolean): [number, number] => {
    let cn = 0;
    let cxs = 0;
    let cys = 0;
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        if (d[(y * p.width + x) * 4 + 3] < OPAQUE_ALPHA) continue;
        if (!test(x, y)) continue;
        cn++;
        cxs += x;
        cys += y;
      }
    }
    return cn === 0 ? [0, 0] : [cxs / cn, cys / cn];
  };
  const bandY = Math.max(1, Math.round((bottom - top + 1) * CAP_SHARE));
  const bandX = Math.max(1, Math.round((right - left + 1) * CAP_SHARE));
  return {
    part,
    width: p.width,
    height: p.height,
    left,
    top,
    right,
    bottom,
    opaque: n,
    cx: sx / n,
    cy: sy / n,
    topCap: cap((_x, y) => y < top + bandY),
    bottomCap: cap((_x, y) => y > bottom - bandY),
    leftCap: cap((x) => x < left + bandX),
    rightCap: cap((x) => x > right - bandX),
  };
}

export function asciiOf(path: string, cols = 24): string[] {
  const p = readPlate(path);
  const d = p.data;
  const step = Math.max(1, Math.ceil(p.width / cols));
  const rows: string[] = [];
  for (let y = 0; y < p.height; y += step * 2) {
    let line = '';
    for (let x = 0; x < p.width; x += step) {
      let hit = 0;
      let total = 0;
      for (let yy = y; yy < Math.min(p.height, y + step * 2); yy++) {
        for (let xx = x; xx < Math.min(p.width, x + step); xx++) {
          total++;
          if (d[(yy * p.width + xx) * 4 + 3] >= OPAQUE_ALPHA) hit++;
        }
      }
      const share = total === 0 ? 0 : hit / total;
      line += share > 0.66 ? '#' : share > 0.33 ? '+' : share > 0.05 ? '.' : ' ';
    }
    rows.push(line);
  }
  return rows;
}

if (import.meta.main) {
  const dir = process.argv[2] ?? '/tmp/sb2/ess-parts';
  const only = process.argv.slice(3);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .sort();
  for (const f of files) {
    const part = f.replace(/\.png$/, '');
    if (only.length && !only.includes(part)) continue;
    const g = geometryOf(join(dir, f), part);
    process.stdout.write(
      `\n${part}  ${g.width}x${g.height}  opaque box [${g.left},${g.top}]..[${g.right},${g.bottom}] ` +
        `(${g.right - g.left + 1}x${g.bottom - g.top + 1}, ${g.opaque}px)\n` +
        `  centroid (${g.cx.toFixed(1)}, ${g.cy.toFixed(1)})  ` +
        `topCap (${g.topCap[0].toFixed(1)}, ${g.topCap[1].toFixed(1)})  bottomCap (${g.bottomCap[0].toFixed(1)}, ${g.bottomCap[1].toFixed(1)})\n` +
        `  leftCap (${g.leftCap[0].toFixed(1)}, ${g.leftCap[1].toFixed(1)})  rightCap (${g.rightCap[0].toFixed(1)}, ${g.rightCap[1].toFixed(1)})\n`,
    );
    if (only.length) for (const line of asciiOf(join(dir, f))) process.stdout.write(`    |${line}|\n`);
  }
}
