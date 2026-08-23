/**
 * Free per-part fits for every frame of one animation.
 *
 * "Free" means the parts are not yet a hierarchy: each carries its own centre
 * and rotation, and the only thing holding a limb onto a body is that the
 * picture wants it there. That is the point — the joints are then **derived**
 * from where two parts agree across the whole shot (`joints.ts`) rather than
 * guessed off the art, which is the one part of a character rig the frames
 * really can decide.
 *
 * A mild temporal prior keeps a part that is entirely hidden on some frame from
 * wandering off; it is stated in the same units as the objective so its weight
 * is readable, and it is only ever used for this derivation, never for the
 * shipped motion.
 *
 *   bun … tools/fitframes.ts <pose.json> <set> <n> <out.json> [strideBack]
 */
import { writeFileSync } from 'node:fs';
import { renderPlacements, refFrame, sad, subject, viewportOf, cropViewport, cropPlate, type Placement } from './lib.ts';

const POS_PRIOR = 30; // objective units per world unit of drift from the previous frame
const ROT_PRIOR = 110; // per degree

const [file, set, nArg, out] = process.argv.slice(2);
const doc = JSON.parse(await Bun.file(file).text());
const start: Placement[] = doc.placements.map((p: Placement) => ({ ...p, sx: 1, sy: 1 }));
const n = Number(nArg);
const full = viewportOf('ess');

const frames: { index: number; sad: number; mae: number; placements: Placement[] }[] = [];
let current = start.map((p) => ({ ...p }));

for (let i = 0; i < n; i++) {
  const ref = refFrame('ess', set, i);
  const s = subject(ref);
  const cand0 = subject(renderPlacements(current, full));
  const x0 = Math.max(0, Math.min(s.minX, cand0.minX) - 34);
  const y0 = Math.max(0, Math.min(s.minY, cand0.minY) - 34);
  const x1 = Math.min(full.width - 1, Math.max(s.maxX, cand0.maxX) + 34);
  const y1 = Math.min(full.height - 1, Math.max(s.maxY, cand0.maxY) + 34);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const vp = cropViewport(full, x0, y0, w, h);
  const target = cropPlate(ref, x0, y0, w, h);
  const prior = current.map((p) => ({ ...p }));

  let evals = 0;
  const cost = (list: Placement[]): number => {
    evals++;
    let c = sad(renderPlacements(list, vp), target);
    for (let k = 0; k < list.length; k++) {
      c += POS_PRIOR * (Math.abs(list[k].cx - prior[k].cx) + Math.abs(list[k].cy - prior[k].cy));
      c += ROT_PRIOR * Math.abs(list[k].rot - prior[k].rot);
    }
    return c;
  };

  let best = cost(current);
  const posSteps = [16, 7, 3, 1.2, 0.5, 0.2];
  const rotSteps = [7, 3, 1.2, 0.5, 0.2, 0.08];
  for (let level = 0; level < posSteps.length; level++) {
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (let k = 0; k < current.length; k++) {
        for (const axis of ['cx', 'cy', 'rot'] as const) {
          const step = axis === 'rot' ? rotSteps[level] : posSteps[level];
          for (const dir of [1, -1]) {
            let any = false;
            for (;;) {
              const before = current[k][axis];
              current[k][axis] = before + dir * step;
              const c = cost(current);
              if (c < best - 1e-9) {
                best = c;
                moved = true;
                any = true;
              } else {
                current[k][axis] = before;
                break;
              }
            }
            if (any) break;
          }
        }
      }
      if (!moved) break;
    }
  }
  const plain = sad(renderPlacements(current, vp), target);
  const mae = plain / (w * h * 3);
  frames.push({ index: i, sad: plain, mae, placements: current.map((p) => ({ ...p, cx: +p.cx.toFixed(3), cy: +p.cy.toFixed(3), rot: +p.rot.toFixed(3) })) });
  console.log(`${set} f${i}: sad ${plain.toFixed(0)}  crop ${w}x${h}  evals ${evals}`);
}

writeFileSync(out, JSON.stringify({ set, order: start.map((p) => p.part), images: Object.fromEntries(start.map((p) => [p.part, p.image ?? p.part])), frames }, null, 1));
console.log(`wrote ${out}`);
