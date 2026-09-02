/**
 * Author's landscape probe — the objective over a 2-D grid of one bone's key.
 *
 * A coordinate descent that will not move is either at the optimum or blind, and
 * only a grid tells you which. This prints `check`'s own figure of record for one
 * frame — absolute difference over every pixel either side covers, divided by the
 * pixels the REFERENCE drew — over a grid of offsets applied to one key of one
 * bone, so the shape of the basin is visible rather than inferred.
 *
 * usage:
 *   bun tools/scan.ts --rig <r> --motion <m> --images <dir> --out <spineDir>
 *     --frames <dir> --set <dir> --frame <i> --bone <name>
 *     [--span 768] [--steps 6] [--slot <name>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { AtlasAttachmentLoader, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-core';

import { compile } from '../../../../src/compile.ts';
import { isContent } from '../../../../src/framing.ts';
import { pageFor, projector, rasterisePiece, sampleAnimation, type Viewport } from '../../../../src/render.ts';
import { Plate, readPlate, type RGBA } from '../../../../tools/plate.ts';

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

function main(): void {
  const rigPath = resolve(flag('rig') as string);
  const motionPath = resolve(flag('motion') as string);
  const imagesDir = resolve(flag('images') as string);
  const outDir = resolve(flag('out') as string);
  const framesRoot = resolve(flag('frames') as string);
  const setDir = flag('set') as string;
  const index = Number(flag('frame'));
  const bone = flag('bone') as string;
  const span = Number(flag('span') ?? 768);
  const steps = Number(flag('steps') ?? 6);
  const slot = flag('slot');

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
  const reference = readPlate(join(framesRoot, setDir, `f${String(index).padStart(4, '0')}.png`));

  const motion = JSON.parse(readFileSync(motionPath, 'utf8'));
  const track = (motion.animations[set.animation].tracks as Array<{ bone: string; property: string; keys: Array<{ t: number; v: number[] }> }>).find(
    (k) => k.bone === bone && k.property === 'translate',
  );
  if (!track) throw new Error(`no translate track for ${bone} in ${set.animation}`);
  const t = index / set.fps;
  let key = track.keys[0];
  let gap = Infinity;
  for (const k of track.keys) {
    if (Math.abs(k.t - t) < gap) {
      gap = Math.abs(k.t - t);
      key = k;
    }
  }
  const base = [key.v[0], key.v[1]];
  const scratch = join(tmpdir(), 'scan.motion.json');
  let pages: Map<string, Plate> | null = null;

  const measure = (): { mae: number; own: number } => {
    writeFileSync(scratch, JSON.stringify(motion));
    const result = compile({ rigPath, motionPath: scratch, outDir, imagesDir });
    const atlas = new TextureAtlas(result.atlasText);
    if (!pages) {
      pages = new Map();
      for (const page of atlas.pages) pages.set(page.name, readPlate(join(outDir, page.name)));
    }
    const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(result.skeletonText));
    const frame = sampleAnimation(data, set.animation, set.fps)[index];
    const mine = new Plate(viewport.width, viewport.height);
    for (let y = 0; y < viewport.height; y++) for (let x = 0; x < viewport.width; x++) mine.set(x, y, background);
    const drawn = new Uint8Array(viewport.width * viewport.height);
    const project = projector(viewport);
    let own = 0;
    for (const piece of frame.pieces) {
      rasterisePiece(pageFor(pages, piece), piece, project, viewport, (px, py, r, g, b, a) => {
        mine.blend(px, py, [r, g, b, a]);
        drawn[py * viewport.width + px] = 1;
        if (slot && piece.slot === slot) own++;
      });
    }
    let sum = 0;
    let n = 0;
    for (let y = 0; y < viewport.height; y++) {
      for (let x = 0; x < viewport.width; x++) {
        const inRef = isContent(reference, x, y, background);
        if (inRef) n++;
        if (!drawn[y * viewport.width + x] && !inRef) continue;
        const a = mine.get(x, y);
        const b = reference.get(x, y);
        sum += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
      }
    }
    return { mae: n === 0 ? 0 : sum / n, own };
  };

  const offsets: number[] = [];
  for (let i = -steps; i <= steps; i++) offsets.push((i * span) / steps);
  console.log(`bone ${bone}, key t=${key.t.toFixed(4)} (frame ${index} samples t=${t.toFixed(4)}), base ${base[0].toFixed(1)},${base[1].toFixed(1)}`);
  process.stdout.write('        dy →\n   dx     ');
  for (const dy of offsets) process.stdout.write(String(Math.round(dy)).padStart(8));
  process.stdout.write('\n');
  let best = { mae: Infinity, dx: 0, dy: 0 };
  for (const dx of offsets) {
    process.stdout.write(String(Math.round(dx)).padStart(7));
    for (const dy of offsets) {
      key.v[0] = base[0] + dx;
      key.v[1] = base[1] + dy;
      const { mae } = measure();
      if (mae < best.mae) best = { mae, dx, dy };
      process.stdout.write(mae.toFixed(2).padStart(8));
    }
    process.stdout.write('\n');
  }
  console.log(`best ${best.mae.toFixed(3)} at dx ${Math.round(best.dx)} dy ${Math.round(best.dy)}  (${(best.dx * viewport.scale).toFixed(1)}, ${(best.dy * viewport.scale).toFixed(1)} px)`);
}

main();
