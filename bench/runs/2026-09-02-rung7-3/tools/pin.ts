/**
 * How far the frames pin one part's placement — a drift measurement that does
 * not need the template matcher.
 *
 * ## Why this exists
 *
 * `check`'s per-slot drift is a correlation, and a correlation needs a peak. A
 * part the reference has drawn mostly behind another has no peak to find: the
 * matcher scores the slot over the pixels it DRAWS, occluded ones included, so
 * most of its own pixels are compared against the occluder's colour and sliding
 * the template changes almost nothing. `check` then prints a blank, which is the
 * honest answer to the question it asked — and says nothing about whether the
 * part is in the right place.
 *
 * This asks the question the other way round. Translate the part bodily, by a
 * whole number of FRAME PIXELS, through the whole shot, and watch what the frames
 * say: the figure of record for a set is the mean over its frames of the absolute
 * difference over every pixel either side covers, divided by the pixels the
 * REFERENCE drew — `check`'s own `maeReference`, which nothing the candidate does
 * can dilute. If the minimum sits at 0 and the figure rises as the part moves
 * away, the frames have located the part, and the offset at which the rise
 * exceeds a stated fraction is how tightly.
 *
 * The render is deterministic (two independent renders of the 12 fps set produce
 * identical digests), so there is no run-to-run noise floor to clear: any rise is
 * a real disagreement with the picture. The `+1 %` column is a legibility
 * threshold, not a significance one, and is stated as such.
 *
 * ⚠️ This is a measurement of the CANDIDATE against the frames. It never opens
 * the reference skeleton, and the offsets it reports are the candidate's own.
 *
 * usage:
 *   bun tools/pin.ts --rig <r> --motion <m> --images <dir> --out <spineDir>
 *     --frames <dir> --bone <name> [--set <dir>] [--reach 8]
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
  const bone = flag('bone') as string;
  const only = flag('set');
  const reach = Number(flag('reach') ?? 8);

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
  const perPixel = 1 / viewport.scale;

  const motion = JSON.parse(readFileSync(motionPath, 'utf8'));
  const scratch = join(tmpdir(), 'pin.motion.json');
  let pages: Map<string, Plate> | null = null;

  const setsOf = sidecar.sets as Array<{ dir: string; animation: string; fps: number }>;
  const references = new Map<string, Plate>();
  const referenceFor = (dir: string, i: number): Plate | null => {
    const key = `${dir}/${i}`;
    const seen = references.get(key);
    if (seen) return seen;
    try {
      const p = readPlate(join(framesRoot, dir, `f${String(i).padStart(4, '0')}.png`));
      references.set(key, p);
      return p;
    } catch {
      return null;
    }
  };

  /** The set's mean `maeReference` with the bone's whole track shifted by dx,dy px. */
  const measure = (set: { dir: string; animation: string; fps: number }, dx: number, dy: number): number => {
    const track = (motion.animations[set.animation].tracks as Array<{ bone: string; property: string; keys: Array<{ v: number[] }> }>).find(
      (k) => k.bone === bone && k.property === 'translate',
    );
    if (!track) throw new Error(`no translate track for ${bone} in ${set.animation}`);
    const saved = track.keys.map((k) => k.v.slice());
    for (const key of track.keys) {
      key.v[0] += dx * perPixel;
      // Frame y runs down and the world's runs up, so a +dy px move is -dy units.
      key.v[1] -= dy * perPixel;
    }
    writeFileSync(scratch, JSON.stringify(motion));
    const result = compile({ rigPath, motionPath: scratch, outDir, imagesDir });
    const atlas = new TextureAtlas(result.atlasText);
    if (!pages) {
      pages = new Map();
      for (const page of atlas.pages) pages.set(page.name, readPlate(join(outDir, page.name)));
    }
    const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(result.skeletonText));
    const frames = sampleAnimation(data, set.animation, set.fps);
    let total = 0;
    let counted = 0;
    for (let i = 0; i < frames.length; i++) {
      const reference = referenceFor(set.dir, i);
      if (!reference) continue;
      const mine = new Plate(viewport.width, viewport.height);
      for (let y = 0; y < viewport.height; y++) for (let x = 0; x < viewport.width; x++) mine.set(x, y, background);
      const drawn = new Uint8Array(viewport.width * viewport.height);
      const project = projector(viewport);
      for (const piece of frames[i].pieces) {
        rasterisePiece(pageFor(pages, piece), piece, project, viewport, (px, py, r, g, b, a) => {
          mine.blend(px, py, [r, g, b, a]);
          drawn[py * viewport.width + px] = 1;
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
      total += n === 0 ? 0 : sum / n;
      counted++;
    }
    track.keys.forEach((key, at) => {
      key.v = saved[at];
    });
    return counted === 0 ? 0 : total / counted;
  };

  console.log(`pinning "${bone}" — set mean maeReference against a whole-track translation, in frame pixels`);
  console.log(`  reach ±${reach} px on each axis; 1 px = ${perPixel.toFixed(3)} world units at this viewport`);
  for (const set of setsOf) {
    if (only && set.dir !== only) continue;
    const at0 = measure(set, 0, 0);
    const row: Array<{ label: string; value: number }> = [];
    let worstInward = 0;
    let pinned = reach + 1;
    for (const d of [1, 2, 3, 4, 6, 8]) {
      if (d > reach) break;
      const four = [measure(set, d, 0), measure(set, -d, 0), measure(set, 0, d), measure(set, 0, -d)];
      const least = Math.min(...four);
      row.push({ label: `${d}px`, value: least });
      if (least < at0) worstInward = Math.max(worstInward, at0 - least);
      if (pinned > reach && least > at0 * 1.01) pinned = d;
    }
    const shape = row.map((r) => `${r.label} +${(r.value - at0).toFixed(3)}`).join('  ');
    console.log(
      `  ${set.dir.padEnd(28)} at 0 px ${at0.toFixed(3)}   ${shape}` +
        (worstInward > 0 ? `   ⚠️ a shifted placement is BETTER by ${worstInward.toFixed(3)}` : '') +
        `   ⇒ +1 % at ${pinned > reach ? `>${reach}` : pinned} px`,
    );
  }
}

main();
