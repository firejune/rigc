/**
 * Author's viewer — crop the drawn subject out of one frame and zoom it.
 *
 * The viewport is the union of four shots and the subject is under 2 % of it, so
 * a frame opened whole shows a speck. This finds the drawn box, pads it, scales
 * it up by an integer factor and writes a PNG. Optionally paints a class map
 * (crimson / beige) instead of the colours, which is what makes "where is the
 * panel exposed" a picture rather than a percentage.
 *
 * ⚠️ Rung 7's frames and anything derived from them are LOCAL ONLY — write the
 * output outside the repository. This tool refuses a destination inside it.
 *
 * usage:
 *   bun tools/crop.ts <frame.png> <out.png> [--zoom 4] [--classes] [--pair other.png]
 */
import { realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { encodePng, Plate, readPlate } from '../../../../tools/plate.ts';
import { isContent } from '../../../../src/framing.ts';
import type { RGBA } from '../../../../tools/plate.ts';

const BACKGROUND: RGBA = [232, 232, 232, 255];
const CRIMSON: RGBA = [220, 40, 40, 255];
const BEIGE: RGBA = [40, 90, 220, 255];

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function drawnBox(p: Plate): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = p.width;
  let minY = p.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (!isContent(p, x, y, BACKGROUND)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

function main(): void {
  const src = process.argv[2];
  const out = resolve(process.argv[3]);
  const repo = realpathSync(resolve(import.meta.dir, '../../../..'));
  if (out.startsWith(`${repo}/`)) {
    throw new Error(`refusing to write inside the repository: ${out} — rung 7 frames are local only`);
  }
  const zoom = Number(flag('zoom') ?? 4);
  const classes = has('classes');
  const other = flag('pair');

  const a = readPlate(src);
  const b = other ? readPlate(other) : null;
  const box = drawnBox(a);
  if (b) {
    const second = drawnBox(b);
    box.minX = Math.min(box.minX, second.minX);
    box.minY = Math.min(box.minY, second.minY);
    box.maxX = Math.max(box.maxX, second.maxX);
    box.maxY = Math.max(box.maxY, second.maxY);
  }
  const pad = 6;
  const x0 = Math.max(0, box.minX - pad);
  const y0 = Math.max(0, box.minY - pad);
  const w = Math.min(a.width, box.maxX + pad + 1) - x0;
  const h = Math.min(a.height, box.maxY + pad + 1) - y0;
  const panes = b ? 2 : 1;
  const dest = new Plate(w * zoom * panes + (panes - 1) * 4, h * zoom);
  for (let y = 0; y < dest.height; y++) for (let x = 0; x < dest.width; x++) dest.set(x, y, [0, 0, 0, 255]);

  const paint = (plate: Plate, offset: number): void => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let colour = plate.get(x0 + x, y0 + y);
        if (classes) {
          if (!isContent(plate, x0 + x, y0 + y, BACKGROUND)) colour = BACKGROUND;
          else {
            const [, g, bb] = colour;
            colour = g - bb <= 8 ? CRIMSON : BEIGE;
          }
        }
        for (let dy = 0; dy < zoom; dy++) {
          for (let dx = 0; dx < zoom; dx++) dest.set(offset + x * zoom + dx, y * zoom + dy, colour);
        }
      }
    }
  };
  paint(a, 0);
  if (b) paint(b, w * zoom + 4);
  writeFileSync(out, encodePng(dest.width, dest.height, dest.data));
  console.log(`${out}  ${dest.width}x${dest.height}  from box ${x0},${y0} ${w}x${h}`);
}

main();
