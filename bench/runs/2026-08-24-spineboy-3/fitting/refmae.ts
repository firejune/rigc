/**
 * Reference-denominator MAE of a built candidate over every committed 12 fps
 * frame, per animation and overall. The denominator is the pixels the REFERENCE
 * drew (§9.2) — nothing the candidate does can grow it — so this is the figure
 * two builds of the same rig are compared on, like for like.
 */
import { loadPosable, sampleAnimation, renderFrame } from '../../../../src/render.ts';
import { readPlate } from '../../../../tools/plate.ts';
import { fullViewport, BG } from './harness.ts';
import { existsSync } from 'node:fs';
import { REF } from './fit.ts';

const view = fullViewport(`${REF}/frames.json`);
const ANIMS = ['aim', 'death', 'hit', 'idle', 'jump', 'run', 'shoot', 'walk'];

export function refMae(dir: string, anims = ANIMS): { per: Record<string, number>; all: number } {
  const p = loadPosable(`${dir}/skeleton.json`, `${dir}/skeleton.atlas`, dir);
  const per: Record<string, number> = {};
  let gAcc = 0, gN = 0;
  for (const anim of anims) {
    const frames = sampleAnimation(p.data, anim, 12);
    let acc = 0, n = 0;
    for (let i = 0; i < frames.length; i++) {
      const path = `${REF}/${anim}/f${String(i).padStart(4, '0')}.png`;
      if (!existsSync(path)) continue;
      const ref = readPlate(path);
      const mine = renderFrame(frames[i], p.pages, view, BG);
      for (let k = 0; k < ref.data.length; k += 4) {
        const dr = Math.abs(ref.data[k] - BG[0]), dg = Math.abs(ref.data[k + 1] - BG[1]), db = Math.abs(ref.data[k + 2] - BG[2]);
        if (dr <= 8 && dg <= 8 && db <= 8) continue;            // reference ink only
        acc += Math.abs(mine.data[k] - ref.data[k]) + Math.abs(mine.data[k + 1] - ref.data[k + 1]) + Math.abs(mine.data[k + 2] - ref.data[k + 2]);
        n += 3;
      }
    }
    per[anim] = acc / Math.max(1, n);
    gAcc += acc; gN += n;
  }
  return { per, all: gAcc / Math.max(1, gN) };
}

if (import.meta.main) {
  const dirs = process.argv.slice(2);
  const rows = dirs.map((d) => [d, refMae(d)] as const);
  const head = ['build'.padEnd(38), ...ANIMS.map((a) => a.padStart(7)), 'ALL'.padStart(8)].join(' ');
  console.log(head);
  for (const [d, r] of rows) {
    console.log([(d.split('/').slice(-2).join('/')).padEnd(38), ...ANIMS.map((a) => r.per[a].toFixed(2).padStart(7)), r.all.toFixed(3).padStart(8)].join(' '));
  }
  if (rows.length > 1) {
    const base = rows[0][1];
    console.log('\ndelta against the first build (negative = better):');
    for (const [d, r] of rows.slice(1)) {
      console.log([(d.split('/').slice(-2).join('/')).padEnd(38), ...ANIMS.map((a) => (r.per[a] - base.per[a]).toFixed(2).padStart(7)), (r.all - base.all).toFixed(3).padStart(8)].join(' '));
    }
  }
}
