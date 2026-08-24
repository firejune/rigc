/** per set: my content box in frames.json's own box, against the reference's. */
import { loadPosable, sampleAnimation } from '../../../../src/render.ts';
import { frameContentBox, contentBoxOfPlate, unionBoxes, type ContentBox } from '../../../../src/framing.ts';
import { fullViewport } from './harness.ts';
import { refFrame } from './fit.ts';
import { SETS } from './fitrun.ts';
const dir = 'bench/runs/2026-08-24-spineboy-3/ess/spine';
const p = loadPosable(`${dir}/skeleton.json`, `${dir}/skeleton.atlas`, dir);
const view = fullViewport('bench/reference/spineboy/ess/frames.json');
const BG: [number, number, number, number] = [232, 232, 232, 255];
const LEVEL = Number(process.env.LEVEL ?? 0);
for (const anim of Object.keys(SETS)) {
  const frames = sampleAnimation(p.data, anim, 12);
  let mine: ContentBox | null = null, ref: ContentBox | null = null;
  const bad: string[] = [];
  for (let i = 0; i < SETS[anim]; i++) {
    const mb = frameContentBox(frames[Math.min(i, frames.length - 1)], p.pages, view, BG, LEVEL);
    const rb = contentBoxOfPlate(refFrame(anim, i), BG, LEVEL);
    mine = unionBoxes(mine, mb); ref = unionBoxes(ref, rb);
    if (mb && rb) {
      const d = [mb.left - rb.left, mb.top - rb.top, mb.right - rb.right, mb.bottom - rb.bottom];
      if (Math.max(...d.map(Math.abs)) > (Number(process.env.TOL ?? 2))) bad.push(`f${i}(${d.map((v) => v.toFixed(0)).join(',')})`);
    }
  }
  const d = [mine!.left - ref!.left, mine!.top - ref!.top, mine!.right - ref!.right, mine!.bottom - ref!.bottom];
  console.log(anim.padEnd(7), `union L${d[0].toFixed(1)} T${d[1].toFixed(1)} R${d[2].toFixed(1)} B${d[3].toFixed(1)}`.padEnd(40), bad.length ? `off frames: ${bad.slice(0, 14).join(' ')}${bad.length > 14 ? ` +${bad.length - 14}` : ''}` : '');
}
