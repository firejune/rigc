/**
 * Rung 7 — where the fitted residual actually is.
 *
 * §8.1's rule is that the next iteration goes to the worst chain by error PER PIXEL,
 * not by share, because share confounds wrong with big. check's chain table does that
 * for a built candidate; this does it for a fitted pose series, without a build, and
 * splits it the way this shot splits: beige, crimson, and ink on the backdrop.
 */
import { readFileSync } from 'node:fs';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { applyPose, framesBox, makeRig, renderInto, windowViewport, type Knob } from './pose.ts';
import { masksOf, frameFiles } from './frames.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const RUN = 'bench/runs/2026-08-28-rung7-1';
const file = process.argv[2] ?? `${RUN}/placements.json`;
const setArg = process.argv[3] ?? null;

const store = JSON.parse(readFileSync(file, 'utf8')) as { knobs: Knob[]; values: Record<string, number[][]> };
const rig = makeRig(`${RUN}/spine`);
const ref = framesBox(ROOT);
const view = windowViewport(ref, 0, 0, ref.width, ref.height, 1);
const plate = new Plate(ref.width, ref.height);

const iou = (a: Uint8Array, b: Uint8Array): number => {
  let i = 0;
  let u = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k] && b[k]) i++;
    if (a[k] || b[k]) u++;
  }
  return u ? i / u : 1;
};

console.log('set / frame     sack IoU  cape IoU   my sack  ref sack   my cape  ref cape   sack box              ref sack box');
for (const [set, series] of Object.entries(store.values)) {
  if (setArg && set !== setArg) continue;
  const files = frameFiles(set);
  let sIoU = 0;
  let cIoU = 0;
  let worstS = 1;
  let worstSAt = '';
  let worstC = 1;
  let worstCAt = '';
  const nCmp = Math.min(series.length, files.length);
  for (let i = 0; i < nCmp; i++) {
    applyPose(rig, store.knobs, series[i]);
    renderInto(rig, plate, view);
    const mine = masksOf(plate);
    const refM = masksOf(readPlate(`${ROOT}/${set}/${files[i]}`));
    const s = iou(mine.sack, refM.sack);
    const c = iou(mine.cape, refM.cape);
    sIoU += s;
    cIoU += c;
    if (s < worstS) {
      worstS = s;
      worstSAt = `f${String(i).padStart(4, '0')}`;
    }
    if (c < worstC) {
      worstC = c;
      worstCAt = `f${String(i).padStart(4, '0')}`;
    }
    if (setArg)
      console.log(
        `  f${String(i).padStart(4, '0')}         ${s.toFixed(3)}     ${c.toFixed(3)}    ` +
          `${String(mine.sackP.area).padStart(6)} ${String(refM.sackP.area).padStart(6)}    ` +
          `${String(mine.capeP.area).padStart(6)} ${String(refM.capeP.area).padStart(6)}   ` +
          `${mine.sackP.right - mine.sackP.left + 1}x${mine.sackP.bottom - mine.sackP.top + 1} @ ${mine.sackP.left},${mine.sackP.top}` +
          `        ${refM.sackP.right - refM.sackP.left + 1}x${refM.sackP.bottom - refM.sackP.top + 1} @ ${refM.sackP.left},${refM.sackP.top}`,
      );
  }
  console.log(
    `${set.padEnd(22)} mean sack IoU ${(sIoU / nCmp).toFixed(3)}  mean cape IoU ${(cIoU / nCmp).toFixed(3)}` +
      `   worst sack ${worstS.toFixed(3)} @${worstSAt}   worst cape ${worstC.toFixed(3)} @${worstCAt}`,
  );
}
