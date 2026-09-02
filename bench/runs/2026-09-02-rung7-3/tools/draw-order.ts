/**
 * The build-side draw-order test the brief prescribes, with its own control.
 *
 * From the brief's rev-3 passage on the panel's edge: *"render your candidate
 * twice, swapping one adjacent pair of slots each time, and score both renders
 * against the frames over the pixels where the two renders differ at all — a
 * whole-frame figure divides the evidence by the whole frame. The panel edge
 * separates several times harder than the collar edge, which is an edge you
 * already know the answer to."*
 *
 * So three orders, from one rig spec with its `slots` array permuted:
 *
 *   A  cape-back, sack, cape-front   the candidate: panel behind, collar in front
 *   B  sack, cape-back, cape-front   the panel in FRONT of the sack
 *   C  cape-back, cape-front, sack   the collar BEHIND the sack — the control,
 *                                    whose answer the frames settle (the beige
 *                                    splits in two on 75 of the 102 frames, so a
 *                                    crimson piece is in front of the sack)
 *
 * Each pair is scored over the pixels where its two renders differ at all, which
 * is the only place the swap is evidence. The control says what a separation of a
 * known-correct edge looks like on THIS rig, so the panel's number is read
 * against it rather than against a threshold from somewhere else.
 *
 * usage:
 *   bun tools/draw-order.ts --rig <r> --motion <m> --images <dir> --out <tmpDir>
 *     --frames <dir>
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { AtlasAttachmentLoader, SkeletonJson, TextureAtlas } from '@esotericsoftware/spine-core';

import { compile } from '../../../../src/compile.ts';
import { pageFor, posableFromText, projector, rasterisePiece, sampleAnimation, type Viewport } from '../../../../src/render.ts';
import { Plate, readPlate, type RGBA } from '../../../../tools/plate.ts';

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? undefined : process.argv[at + 1];
}

const ORDERS: Record<string, string[]> = {
  A: ['cape-back', 'sack', 'cape-front'],
  B: ['sack', 'cape-back', 'cape-front'],
  C: ['cape-back', 'cape-front', 'sack'],
};

function main(): void {
  const rigPath = resolve(flag('rig') as string);
  const motionPath = resolve(flag('motion') as string);
  const imagesDir = resolve(flag('images') as string);
  const outDir = resolve(flag('out') as string);
  const framesRoot = resolve(flag('frames') as string);
  mkdirSync(outDir, { recursive: true });

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

  const rig = JSON.parse(readFileSync(rigPath, 'utf8'));
  const bySlot = new Map<string, unknown>();
  for (const slot of rig.slots as Array<{ name: string }>) bySlot.set(slot.name, slot);

  const posables = new Map<string, ReturnType<typeof posableFromText>>();
  for (const [label, order] of Object.entries(ORDERS)) {
    rig.slots = order.map((name) => {
      const slot = bySlot.get(name);
      if (!slot) throw new Error(`the rig has no slot "${name}"`);
      return slot;
    });
    const path = join(outDir, `rig-${label}.json`);
    writeFileSync(path, JSON.stringify(rig, null, 1));
    const result = compile({ rigPath: path, motionPath, outDir, imagesDir });
    const atlas = new TextureAtlas(result.atlasText);
    const pages = new Map<string, Plate>();
    for (const page of atlas.pages) pages.set(page.name, readPlate(join(outDir, page.name)));
    const data = new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(JSON.parse(result.skeletonText));
    posables.set(label, { data, pages });
  }

  const render = (label: string, animation: string, fps: number, index: number): Plate => {
    const posable = posables.get(label) as ReturnType<typeof posableFromText>;
    const frame = sampleAnimation(posable.data, animation, fps)[index];
    const plate = new Plate(viewport.width, viewport.height);
    for (let y = 0; y < viewport.height; y++) for (let x = 0; x < viewport.width; x++) plate.set(x, y, background);
    const project = projector(viewport);
    for (const piece of frame.pieces) {
      rasterisePiece(pageFor(posable.pages, piece), piece, project, viewport, (px, py, r, g, b, a) =>
        plate.blend(px, py, [r, g, b, a]),
      );
    }
    return plate;
  };

  console.log('draw-order swap, scored over the pixels where the two renders differ at all');
  console.log('  A = cape-back, sack, cape-front (the candidate)   B = panel in front   C = collar behind (control)');
  for (const set of sidecar.sets as Array<{ dir: string; animation: string; fps: number }>) {
    const totals = { ab: { a: 0, other: 0, px: 0 }, ac: { a: 0, other: 0, px: 0 } };
    // ⚠️ Enumerate the files. A `--stride` set commits f0000 and f0069 and
    // nothing between, so counting up from 0 and stopping at the first gap reads
    // one frame of a two-frame set and reports it as the set — measured, this
    // tool's first run printed the same 5,950 px for four different sets.
    const files = readdirSync(join(framesRoot, set.dir))
      .filter((f) => /^f\d+\.png$/.test(f))
      .sort();
    for (const file of files) {
      const i = Number(file.slice(1, -4));
      const reference = readPlate(join(framesRoot, set.dir, file));
      const a = render('A', set.animation, set.fps, i);
      for (const [label, into] of [
        ['B', totals.ab],
        ['C', totals.ac],
      ] as const) {
        const other = render(label, set.animation, set.fps, i);
        for (let y = 0; y < viewport.height; y++) {
          for (let x = 0; x < viewport.width; x++) {
            const p = a.get(x, y);
            const q = other.get(x, y);
            if (p[0] === q[0] && p[1] === q[1] && p[2] === q[2]) continue;
            const r = reference.get(x, y);
            into.a += (Math.abs(p[0] - r[0]) + Math.abs(p[1] - r[1]) + Math.abs(p[2] - r[2])) / 3;
            into.other += (Math.abs(q[0] - r[0]) + Math.abs(q[1] - r[1]) + Math.abs(q[2] - r[2])) / 3;
            into.px++;
          }
        }
      }
    }
    const line = (name: string, t: { a: number; other: number; px: number }): string => {
      if (t.px === 0) return `${name} no deciding pixel`;
      const a = t.a / t.px;
      const o = t.other / t.px;
      return `${name} ${t.px.toLocaleString('en-US')} px: A ${a.toFixed(1)} vs ${o.toFixed(1)} (${(o - a).toFixed(1)} apart, x${(o / Math.max(a, 1e-9)).toFixed(2)})`;
    };
    console.log(`  ${set.dir.padEnd(28)} ${line('panel edge', totals.ab)}`);
    console.log(`  ${''.padEnd(28)} ${line('collar edge (control)', totals.ac)}`);
  }
}

main();
