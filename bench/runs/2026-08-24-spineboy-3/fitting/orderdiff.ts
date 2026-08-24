/**
 * The like-for-like draw-order test, restricted to the pixels that can decide it.
 *
 * Two builds differing only in slot order are bit-identical everywhere the two
 * slots do not overlap, so a whole-shot MAE divides the evidence by the whole
 * figure and 130 frames that carry none of it. `ctl-rear-leg-over-front` — an
 * edge the brief SETTLED by measurement — came out 0.1% the wrong way under
 * that dilution, which is the scatter, not an answer.
 *
 * So: find the pixels where the two builds actually differ, and score both
 * against the reference over exactly those. Nothing else can contribute.
 */
import { loadPosable, sampleAnimation, renderFrame, type Posable } from '../../../../src/render.ts';
import { readPlate } from '../../../../tools/plate.ts';
import { fullViewport, BG } from './harness.ts';
import { REF } from './fit.ts';
import { existsSync } from 'node:fs';

const view = fullViewport(`${REF}/frames.json`);
const ANIMS = ['aim', 'death', 'hit', 'idle', 'jump', 'run', 'shoot', 'walk'];
const load = (d: string): Posable => loadPosable(`${d}/skeleton.json`, `${d}/skeleton.atlas`, d);

const [baseDir, ...variants] = process.argv.slice(2);
const base = load(baseDir);

for (const vd of variants) {
  const v = load(vd);
  let aAcc = 0, bAcc = 0, n = 0, framesTouched = 0;
  const worst: [string, number, number, number, number][] = [];
  for (const anim of ANIMS) {
    const fa = sampleAnimation(base.data, anim, 12), fb = sampleAnimation(v.data, anim, 12);
    for (let i = 0; i < fa.length; i++) {
      const p = `${REF}/${anim}/f${String(i).padStart(4, '0')}.png`;
      if (!existsSync(p)) continue;
      const ref = readPlate(p);
      const A = renderFrame(fa[i], base.pages, view, BG), B = renderFrame(fb[i], v.pages, view, BG);
      let a = 0, b = 0, m = 0;
      for (let k = 0; k < A.data.length; k += 4) {
        if (A.data[k] === B.data[k] && A.data[k+1] === B.data[k+1] && A.data[k+2] === B.data[k+2]) continue;
        for (let c = 0; c < 3; c++) { a += Math.abs(A.data[k+c] - ref.data[k+c]); b += Math.abs(B.data[k+c] - ref.data[k+c]); }
        m += 3;
      }
      if (m === 0) continue;
      framesTouched++; aAcc += a; bAcc += b; n += m;
      worst.push([`${anim}/f${i}`, m / 3, a / m, b / m, (b - a) / m]);
    }
  }
  const per: Record<string, [number, number, number, number]> = {};
  for (const [f, px, a, b] of worst) {
    const an = f.split('/')[0];
    const e = (per[an] ??= [0, 0, 0, 0]);
    e[0] += a * px * 3; e[1] += b * px * 3; e[2] += px * 3; e[3] += b < a ? 1 : -1;
  }
  worst.sort((x, y) => Math.abs(y[4]) - Math.abs(x[4]));
  const A = aAcc / n, B = bAcc / n;
  console.log(`\n${vd}  vs  ${baseDir}`);
  console.log(`  ${framesTouched} frame(s) differ at all, ${(n / 3).toFixed(0)} px in total`);
  console.log(`  over exactly those pixels: base ${A.toFixed(2)}   variant ${B.toFixed(2)}   ⇒ ${B < A ? 'VARIANT' : 'BASE'} better by ${(Math.abs(B - A) / Math.max(A, B) * 100).toFixed(1)}%`);
  console.log('  per shot — px, base, variant, and the frame tally (+ = variant wins):');
  for (const [an, e] of Object.entries(per)) console.log(`    ${an.padEnd(6)} ${String(Math.round(e[2]/3)).padStart(6)} px   base ${(e[0]/e[2]).toFixed(1).padStart(6)}   variant ${(e[1]/e[2]).toFixed(1).padStart(6)}   tally ${e[3] > 0 ? '+' : ''}${e[3]}`);
  console.log('  the 6 frames carrying most of it:');
  for (const [f, px, a, b, d] of worst.slice(0, 6)) {
    console.log(`    ${f.padEnd(12)} ${String(Math.round(px)).padStart(5)} px   base ${a.toFixed(1).padStart(6)}   variant ${b.toFixed(1).padStart(6)}   ${d > 0 ? 'base' : 'variant'} better`);
  }
}
