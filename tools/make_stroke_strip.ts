#!/usr/bin/env bun
/**
 * Compose the owner's 1x stroke strip out of the frames the render probe wrote.
 *
 *   bun tools/make_stroke_strip.ts <frames.json> <out.png> [winX winY winW winH]
 *
 * ⛔ 1x MEANS 1x. Every tile is a straight 1:1 window of a frame the probe grabbed
 * at `stageRect().scale === 1` and `deviceScaleFactor: 1`, at the same window
 * coordinates, so tiles are comparable to each other and to the source art. No
 * scaling happens anywhere in this file — and that is not a style preference:
 * this track has twice had a magnified crop stand in for a 1x claim, once by the
 * command tower, and criterion 1 is *literally* "can the seam be found at 100%".
 * A resampled tile cannot answer it either way.
 *
 * The strip is an INDEX, not the evidence of last resort. The evidence is the
 * full-frame grabs next to it (`piston_slow_t*.png`), which the owner can open at
 * 100% in any viewer; the strip exists so the whole excursion can be scanned in
 * one look before zooming into one frame.
 *
 * Composition, not generation: the pixels come from the probe. This file only
 * cuts windows and draws labels, so it cannot invent an appearance.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Plate, readPlate } from './plate.ts';
import { drawText } from './font5x7.ts';

const [framesArg, outArg, ...win] = process.argv.slice(2);
if (!framesArg || !outArg) {
  console.error('usage: bun tools/make_stroke_strip.ts <frames.json> <out.png> [winX winY winW winH]');
  process.exit(2);
}
const framesPath = resolve(framesArg);
const dir = dirname(framesPath);
const manifest = JSON.parse(readFileSync(framesPath, 'utf8')) as {
  stage: [number, number];
  scale: number;
  frames: Array<{ t: number; axis: number; file: string }>;
};

if (manifest.scale !== 1) {
  console.error(`frames were grabbed at ${manifest.scale}x; a strip built from them cannot claim 1x`);
  process.exit(1);
}

// Default window: the seam and the part surface next to it, in crop pixels. Wide
// enough that the cap contour, the fold and a good run of the shaft's specular
// are all in frame at both extremes of the stroke (the tip travels crop
// (535,468) -> (433,453) over this excursion).
const WIN_X = win.length ? Number(win[0]) : 300;
const WIN_Y = win.length ? Number(win[1]) : 372;
const WIN_W = win.length ? Number(win[2]) : 512;
const WIN_H = win.length ? Number(win[3]) : 384;
const COLS = 3;
const LABEL_H = 16;
const PAD = 4;

const rows = Math.ceil(manifest.frames.length / COLS);
const TILE_W = WIN_W + PAD * 2;
const TILE_H = WIN_H + LABEL_H + PAD * 2;
// The footer gets a band of its own. Drawn over the last row it would sit ON the
// art, and a caption printed across the thing being judged is not a caption.
const FOOTER_H = 18;
const sheet = new Plate(COLS * TILE_W, rows * TILE_H + FOOTER_H);
sheet.rect(0, 0, sheet.width, sheet.height, [16, 16, 20, 255]);

manifest.frames.forEach((frame, i) => {
  // frames.json records repo-relative paths for the reader; the files sit next to
  // it, so the basename against its own directory is what opens them wherever the
  // pipeline is checked out.
  const src = readPlate(resolve(dir, frame.file.split('/').pop()!));
  if (src.width !== manifest.stage[0] || src.height !== manifest.stage[1]) {
    throw new Error(`${frame.file} is ${src.width}x${src.height}, not the ${manifest.stage.join('x')} stage`);
  }
  const ox = (i % COLS) * TILE_W + PAD;
  const oy = Math.floor(i / COLS) * TILE_H + PAD + LABEL_H;
  for (let y = 0; y < WIN_H; y++) {
    for (let x = 0; x < WIN_W; x++) {
      const sx = WIN_X + x;
      const sy = WIN_Y + y;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      sheet.set(ox + x, oy + y, src.get(sx, sy));
    }
  }
  const label = `t=${frame.t.toFixed(3)}  axis ${frame.axis > 0 ? '+' : ''}${frame.axis.toFixed(1)}px`;
  drawText(label, ox + 1, Math.floor(i / COLS) * TILE_H + PAD + 3, 2, (x, y) => sheet.set(x, y, [216, 222, 231, 255]));
});

const footer = `1x  window ${WIN_X},${WIN_Y} ${WIN_W}x${WIN_H} of the ${manifest.stage.join('x')} stage  -  no magnification anywhere`;
drawText(footer, PAD + 1, rows * TILE_H + 6, 1, (x, y) => sheet.set(x, y, [138, 147, 161, 255]));

const out = resolve(outArg);
sheet.writePng(out);
console.log(`wrote ${out}  ${sheet.width}x${sheet.height}  (${manifest.frames.length} tiles, 1x, window ${WIN_X},${WIN_Y} ${WIN_W}x${WIN_H})`);
