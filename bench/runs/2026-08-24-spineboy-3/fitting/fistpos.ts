/**
 * Where the near fist actually is, on every frame.
 *
 * The whole-figure search is drawn to the head (both fist templates land on it,
 * ~14k residual and no real match); masking the head out with the fitted rig's
 * own head footprint fixes it, and the estimator then reproduces both controls
 * the brief publishes — `idle/f0000` open at (154, 284) and `walk/f0` closed at
 * (165, 289).
 */
import { Fitter, refFrame } from './fit.ts';
import { piecesOf, projector } from '../src/render.ts';
import { buildTemplate, match, type Match } from './match.ts';
import { Plate } from '../tools/plate.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { SETS, FIST } from './fitrun.ts';

const f = new Fitter();
const project = projector(f.full);
const tpl = {
  'front-fist-closed': buildTemplate('examples/spineboy/images/front-fist-closed.png', 'c'),
  'front-fist-open': buildTemplate('examples/spineboy/images/front-fist-open.png', 'o'),
};
const MASK = new Set(['head', 'goggles', 'eye', 'mouth', 'neck', 'torso']);
const out: Record<string, Record<number, { art: string; m: Match; other: number }>> = {};
for (const anim of Object.keys(SETS)) {
  const pl = JSON.parse(readFileSync(`work/placements-${anim}.json`, 'utf8'))[anim];
  f.rig.setAttachment('front-fist', FIST[anim] ?? 'front-fist-open');
  out[anim] = {};
  for (let i = 0; i < SETS[anim]; i++) {
    f.rig.apply(pl[i]);
    const fr = refFrame(anim, i);
    const masked = new Plate(fr.width, fr.height);
    masked.data.set(fr.data);
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < fr.height; y++) for (let x = 0; x < fr.width; x++) {
      const j = (y * fr.width + x) * 4;
      if (Math.abs(fr.data[j] - 232) > 8 || Math.abs(fr.data[j+1] - 232) > 8 || Math.abs(fr.data[j+2] - 232) > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    for (const p of piecesOf(f.rig.skeleton)) {
      if (!MASK.has(p.slot)) continue;
      let a0 = 1e9, b0 = 1e9, a1 = -1, b1 = -1;
      for (let k = 0; k < p.world.length; k += 2) {
        const [px, py] = project(p.world[k], p.world[k + 1]);
        a0 = Math.min(a0, px); a1 = Math.max(a1, px); b0 = Math.min(b0, py); b1 = Math.max(b1, py);
      }
      for (let y = Math.floor(b0); y <= Math.ceil(b1); y++) for (let x = Math.floor(a0); x <= Math.ceil(a1); x++) {
        if (x < 0 || y < 0 || x >= fr.width || y >= fr.height) continue;
        const j = (y * fr.width + x) * 4;
        masked.data[j] = 232; masked.data[j+1] = 232; masked.data[j+2] = 232; masked.data[j+3] = 255;
      }
    }
    const box: [number, number, number, number] = [x0 - 4, y0 - 4, x1 + 4, y1 + 4];
    const mc = match(tpl['front-fist-closed'], masked, box);
    const mo = match(tpl['front-fist-open'], masked, box);
    const best = mc.residual < mo.residual ? ['front-fist-closed', mc, mo.residual] : ['front-fist-open', mo, mc.residual];
    out[anim][i] = { art: best[0] as string, m: best[1] as Match, other: best[2] as number };
  }
  const rows = Object.values(out[anim]);
  const good = rows.filter((r) => r.m.residual < 9000);
  const closed = rows.filter((r) => r.art === 'front-fist-closed').length;
  console.log(anim.padEnd(7), `${rows.length} frames · clean matches ${good.length} · closed ${closed}/${rows.length} · median res ${median(rows.map((r) => r.m.residual)).toFixed(0)} · clean verdict ${good.length ? tally(good) : '—'}`);
}
writeFileSync('work/fistpos.json', JSON.stringify(out, null, 1));
function median(a: number[]): number { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; }
function tally(rows: { art: string; m: Match; other: number }[]): string {
  const c = rows.filter((r) => r.art === 'front-fist-closed').length;
  const ratio = rows.reduce((s, r) => s + r.other / r.m.residual, 0) / rows.length;
  return `${c} closed / ${rows.length - c} open, mean ${ratio.toFixed(2)}x`;
}
