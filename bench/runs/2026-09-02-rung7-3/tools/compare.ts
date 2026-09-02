/**
 * Author's viewer — the candidate beside the frame, cropped and zoomed.
 *
 * `check` prints numbers; this prints the picture the numbers are about. The
 * candidate is posed and rasterised into the frames' own viewport (the box ten
 * of the twelve sets are measured in), then both are cropped to the union of
 * their drawn boxes so the two panes are the same window on the world.
 *
 * ⚠️ Rung 7's frames and anything derived from them are LOCAL ONLY — the output
 * must land outside the repository, and this refuses anywhere else.
 *
 * usage:
 *   bun tools/compare.ts --candidate <dir> --frames <dir> --set <dir> --frame <i>
 *                        --out <file.png> [--zoom 4] [--classes] [--only <slot>]
 */
import { realpathSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { encodePng, Plate, readPlate, type RGBA } from '../../../../tools/plate.ts';
import { isContent } from '../../../../src/framing.ts';
import {
  pageFor,
  posableFromText,
  projector,
  rasterisePiece,
  sampleAnimation,
  type Viewport,
} from '../../../../src/render.ts';

const CRIMSON: RGBA = [220, 40, 40, 255];
const BEIGE: RGBA = [40, 90, 220, 255];

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function main(): void {
  const out = resolve(flag('out') ?? '');
  const repo = realpathSync(resolve(import.meta.dir, '../../../..'));
  if (out.startsWith(`${repo}/`)) throw new Error(`refusing to write inside the repository: ${out}`);
  const zoom = Number(flag('zoom') ?? 4);
  const classes = has('classes');
  const only = flag('only');
  const setDir = flag('set') as string;
  const index = Number(flag('frame'));

  const candidateDir = resolve(flag('candidate') as string);
  const framesRoot = resolve(flag('frames') as string);
  const sidecar = JSON.parse(readFileSync(join(framesRoot, 'frames.json'), 'utf8'));
  const background = sidecar.background as RGBA;
  const v = sidecar.viewport;
  const viewport: Viewport = {
    minX: v.x,
    minY: v.y,
    maxX: v.x + v.width,
    maxY: v.y + v.height,
    scale: v.scale,
    width: v.pixelWidth,
    height: v.pixelHeight,
  };
  const set = (sidecar.sets as Array<{ dir: string; animation: string; fps: number }>).find((s) => s.dir === setDir);
  if (!set) throw new Error(`no set ${setDir}`);

  const posable = posableFromText(
    readFileSync(join(candidateDir, 'skeleton.json'), 'utf8'),
    readFileSync(join(candidateDir, 'skeleton.atlas'), 'utf8'),
    candidateDir,
  );
  const frame = sampleAnimation(posable.data, set.animation, set.fps)[index];
  const mine = new Plate(viewport.width, viewport.height);
  for (let y = 0; y < viewport.height; y++) for (let x = 0; x < viewport.width; x++) mine.set(x, y, background);
  const project = projector(viewport);
  for (const piece of frame.pieces) {
    if (only && piece.slot !== only) continue;
    rasterisePiece(pageFor(posable.pages, piece), piece, project, viewport, (px, py, r, g, b, a) =>
      mine.blend(px, py, [r, g, b, a]),
    );
  }
  const reference = readPlate(join(framesRoot, setDir, `f${String(index).padStart(4, '0')}.png`));

  let minX = viewport.width;
  let minY = viewport.height;
  let maxX = -1;
  let maxY = -1;
  for (const p of [mine, reference]) {
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        if (!isContent(p, x, y, background)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 6;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const w = Math.min(viewport.width, maxX + pad + 1) - x0;
  const h = Math.min(viewport.height, maxY + pad + 1) - y0;

  const dest = new Plate(w * zoom * 2 + 4, h * zoom);
  for (let y = 0; y < dest.height; y++) for (let x = 0; x < dest.width; x++) dest.set(x, y, [0, 0, 0, 255]);
  const paint = (plate: Plate, offset: number): void => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let colour = plate.get(x0 + x, y0 + y);
        if (classes) {
          if (!isContent(plate, x0 + x, y0 + y, background)) colour = background;
          else colour = colour[1] - colour[2] <= 8 ? CRIMSON : BEIGE;
        }
        for (let dy = 0; dy < zoom; dy++) {
          for (let dx = 0; dx < zoom; dx++) dest.set(offset + x * zoom + dx, y * zoom + dy, colour);
        }
      }
    }
  };
  paint(mine, 0);
  paint(reference, w * zoom + 4);
  writeFileSync(out, encodePng(dest.width, dest.height, dest.data));
  console.log(`${out}  ${dest.width}x${dest.height}  left = candidate, right = frame  window ${x0},${y0} ${w}x${h}`);
}

main();
