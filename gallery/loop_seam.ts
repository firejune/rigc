/**
 * Measure a looping animation's seam: is its last rendered frame the pose it
 * started from?
 *
 *     bun gallery/loop_seam.ts <a frame directory rigc render wrote>
 *
 * ⭐ **Why this is here and not in rigc.** A loop seam is a defect *between two
 * frames*: every frame on its own is correct, so nothing that scores a frame can
 * see it. AUTHORING §0 says as much — `check`'s per-frame column is the only
 * thing in the toolchain that can see a hold, a seam or a one-frame event — but
 * `check` needs reference frames, and an authored motion with no reference has
 * none. A gallery example is exactly that case, so this is the stopgap: it
 * compares a render against **itself**, which needs no reference at all.
 *
 * 📐 **Why the comparison is valid.** `rigc render` samples `i = 0..round(d ·
 * fps)` *inclusive*, so the last frame it writes sits at `t = duration`. A cycle
 * that closes has the same pose at `t = 0` and `t = duration`, and therefore the
 * same pixels. Any difference is the seam, in the units a viewer sees it in.
 *
 * ⚠️ **What a nonzero reading does and does not mean.** It is the size of the
 * jump a player makes when it wraps, and nothing else. It does not say the loop
 * is wrong: an animation may legitimately end somewhere else (this is not a
 * pass bar, and the number is not compared against one here). It also cannot see
 * a *velocity* discontinuity — a cycle whose value matches at the seam but whose
 * slope does not still reads as a hitch, and every pixel in this measurement is
 * identical when that happens.
 */
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { readPlate } from '../tools/plate.ts';

export interface SeamReading {
  first: string;
  last: string;
  frames: number;
  width: number;
  height: number;
  /** Largest absolute difference of any single channel, 0..255. */
  maxChannel: number;
  /** Mean absolute channel difference over every channel of every pixel. */
  meanChannel: number;
  /** How many pixels differ in any channel. */
  pixelsDiffering: number;
  /** Where the worst pixel is, or null when the frames are identical. */
  worstAt: { x: number; y: number } | null;
}

/** Frame files `rigc render` writes, in sample order. */
function frameFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^f\d+\.png$/.test(f))
    .sort();
}

export function measureLoopSeam(dir: string): SeamReading {
  const files = frameFiles(dir);
  if (files.length < 2) {
    throw new Error(
      `${dir} holds ${files.length} frame(s) named fNNNN.png; a seam is a comparison between two, so there is nothing to measure`,
    );
  }
  const first = readPlate(join(dir, files[0]));
  const last = readPlate(join(dir, files[files.length - 1]));
  if (first.width !== last.width || first.height !== last.height) {
    throw new Error(
      `${files[0]} is ${first.width}x${first.height} and ${files[files.length - 1]} is ${last.width}x${last.height}; ` +
        'a render writes one viewport for the whole set, so these did not come from one run',
    );
  }
  let maxChannel = 0;
  let total = 0;
  let pixelsDiffering = 0;
  let worstAt: { x: number; y: number } | null = null;
  for (let y = 0; y < first.height; y++) {
    for (let x = 0; x < first.width; x++) {
      const i = (y * first.width + x) * 4;
      let pixelWorst = 0;
      for (let c = 0; c < 4; c++) {
        const d = Math.abs(first.data[i + c] - last.data[i + c]);
        total += d;
        if (d > pixelWorst) pixelWorst = d;
      }
      if (pixelWorst > 0) pixelsDiffering++;
      if (pixelWorst > maxChannel) {
        maxChannel = pixelWorst;
        worstAt = { x, y };
      }
    }
  }
  return {
    first: files[0],
    last: files[files.length - 1],
    frames: files.length,
    width: first.width,
    height: first.height,
    maxChannel,
    meanChannel: total / (first.width * first.height * 4),
    pixelsDiffering,
    worstAt,
  };
}

/** The reading as the lines a run should paste into its notes. */
export function seamLines(dir: string, r: SeamReading): string[] {
  const pct = ((100 * r.pixelsDiffering) / (r.width * r.height)).toFixed(3);
  return [
    `loop seam  ${basename(dir)}`,
    `  ${r.first} vs ${r.last}   ${r.frames} frames at ${r.width}x${r.height}`,
    `  max channel difference   ${r.maxChannel} / 255`,
    `  mean channel difference  ${r.meanChannel.toFixed(4)}`,
    `  pixels differing         ${r.pixelsDiffering} of ${r.width * r.height} (${pct}%)` +
      (r.worstAt ? `, worst at (${r.worstAt.x},${r.worstAt.y})` : ''),
    r.maxChannel === 0
      ? '  ⇒ the last frame IS the first frame, to the byte'
      : '  ⇒ the cycle does not close on its opening pose; the numbers above are the size of the jump',
  ];
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: bun gallery/loop_seam.ts <frame directory rigc render wrote>');
    process.exit(2);
  }
  for (const line of seamLines(dir, measureLoopSeam(dir))) console.log(line);
}
