/**
 * The reference's own frame-to-frame change, at the measure's own tolerance.
 *
 * `check`'s change column is the only instrument in the toolchain that can see a
 * hold, a loop seam or a one-frame event (AUTHORING §0, §9.2), and it is
 * two-sided: a pair where one side is **exactly** still and the other is not is a
 * disagreement however small the other side is. So a key plan has to know, per
 * committed rate, which of the reference's own pairs are dead — and the number has
 * to be computed at `CHANGE_TOLERANCE` (8 levels, `src/check.ts`) over the WHOLE
 * frame, not over a mask, which is what this does.
 *
 * ⚠️ The brief's own difference counts are at 2/255 and it says so; at 8 its
 * `ess/death` passage is *nine* held pairs rather than a crawl. This is that
 * measurement taken locally, on all 147 committed frames, so the plan is built
 * against the threshold the report reads.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPlate } from '../../../../tools/plate.ts';
import { CHANGE_TOLERANCE } from '../../../../src/check.ts';
import { setsOf } from './fit.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';

export function changedPixels(aPath: string, bPath: string): number {
  const a = readPlate(aPath);
  const b = readPlate(bPath);
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (
      Math.abs(a.data[i] - b.data[i]) > CHANGE_TOLERANCE ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > CHANGE_TOLERANCE ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > CHANGE_TOLERANCE
    ) {
      n++;
    }
  }
  return n;
}

if (import.meta.main) {
  const out: Record<string, number[]> = {};
  for (const set of setsOf()) {
    if (set.frames.length < 2) continue;
    const series: number[] = [];
    for (let i = 1; i < set.frames.length; i++) {
      series.push(changedPixels(join(REF, set.dir, set.frames[i - 1]), join(REF, set.dir, set.frames[i])));
    }
    out[set.dir] = series;
    const holds = series.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
    console.log(
      `${set.dir.padEnd(16)} ${series.length} pair(s), ${holds.length} dead  ` +
        `min ${Math.min(...series)}  max ${Math.max(...series)}` +
        (holds.length ? `  dead at f${holds.map((i) => `${i}->${i + 1}`).join(' f')}` : ''),
    );
  }
  const dest = join(ROOT, 'fit/refchange.json');
  writeFileSync(dest, JSON.stringify(out, null, 1));

  console.log(`-> ${dest}`);
}
