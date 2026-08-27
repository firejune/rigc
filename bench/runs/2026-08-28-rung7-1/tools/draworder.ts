/**
 * Rung 7 — the panel's draw-order edge, tested the way §8 says to test one.
 *
 * The brief settles ONE edge by measurement: the collar is in front of the sack,
 * because the beige silhouette is two separate pieces on 75 of the 102 frames and a
 * part that cuts another part's silhouette in two is drawn in front of it. It says the
 * panel's side is the weaker reading and *"the frames do not force it"*.
 *
 * §8's second test reaches edges the frames show no interior detail on: render your own
 * candidate both ways, at the frames' own scale, and score both **over the pixels where
 * the two renders differ at all** — because two builds that differ only in slot order
 * are bit-identical everywhere the two slots do not overlap, and a whole-shot figure
 * divides the evidence by the whole figure.
 *
 * Two things make this cheap and honest here:
 *   - no build is needed. `piecesOf` hands back the posed drawables in draw order, and
 *     reordering that array before blitting is exactly the same picture a reordered
 *     slots array would draw;
 *   - the CONTROL is free. The collar's edge is settled by measurement, so running the
 *     identical test on it says how far apart two builds come out when the answer is
 *     known — which is the scale a real answer is measured against (§8's ⚠️ about a
 *     spread inside the objective's own scatter being *no answer*).
 */
import { readFileSync } from 'node:fs';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { blitPiece, pageFor, piecesOf } from '../../../../src/render.ts';
import { applyPose, BG, framesBox, makeRig, windowViewport, type Knob } from './pose.ts';
import { ANIMS, frameFiles } from './frames.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const RUN = 'bench/runs/2026-08-28-rung7-1';

const store = JSON.parse(readFileSync(`${RUN}/placements.json`, 'utf8')) as {
  knobs: Knob[];
  values: Record<string, number[][]>;
};
const rig = makeRig(`${RUN}/spine`);
const ref = framesBox(ROOT);
const view = windowViewport(ref, 0, 0, ref.width, ref.height, 1);

/** Render with the pieces in a given permutation of the draw order. */
function renderOrder(plate: Plate, order: number[]): void {
  const d = plate.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = BG[0];
    d[i + 1] = BG[1];
    d[i + 2] = BG[2];
    d[i + 3] = 255;
  }
  const project = (wx: number, wy: number): [number, number] => [
    (wx - view.minX) * view.scale,
    (view.maxY - wy) * view.scale,
  ];
  const pieces = piecesOf(rig.skeleton);
  for (const i of order) if (pieces[i]) blitPiece(plate, pageFor(rig.posable.pages, pieces[i]), pieces[i], project);
}

const slotOrder = rig.posable.data.slots.map((s) => s.name);
console.log(`the candidate's setup draw order: ${slotOrder.join(' → ')} (index 0 furthest back)`);
const iBack = slotOrder.indexOf('cape-back');
const iSack = slotOrder.indexOf('sack');
const iFront = slotOrder.indexOf('cape-front');

const BASE = [0, 1, 2];
const swap = (a: number, b: number): number[] => {
  const o = BASE.slice();
  o[BASE.indexOf(a)] = b;
  o[BASE.indexOf(b)] = a;
  return o;
};

const cases: { name: string; order: number[]; settled: boolean }[] = [
  { name: `panel↔sack (cape-back in FRONT of sack)`, order: swap(iBack, iSack), settled: false },
  { name: `collar↔sack (cape-front BEHIND sack)  [control: settled]`, order: swap(iFront, iSack), settled: true },
];

const a = new Plate(ref.width, ref.height);
const b = new Plate(ref.width, ref.height);

for (const c of cases) {
  let baseWins = 0;
  let variantWins = 0;
  let ties = 0;
  let baseSum = 0;
  let varSum = 0;
  let decidingTotal = 0;
  const perSet: string[] = [];
  for (const set of ANIMS) {
    const files = frameFiles(set);
    const n = Math.min(files.length, store.values[set].length);
    let sb = 0;
    let sv = 0;
    let dec = 0;
    let bw = 0;
    let vw = 0;
    for (let i = 0; i < n; i++) {
      applyPose(rig, store.knobs, store.values[set][i]);
      renderOrder(a, BASE);
      renderOrder(b, c.order);
      const r = readPlate(`${ROOT}/${set}/${files[i]}`);
      // the deciding pixels: where the two orders draw ANYTHING different
      let eb = 0;
      let ev = 0;
      let d = 0;
      for (let k = 0; k < a.data.length; k += 4) {
        if (a.data[k] === b.data[k] && a.data[k + 1] === b.data[k + 1] && a.data[k + 2] === b.data[k + 2]) continue;
        d++;
        eb += Math.abs(a.data[k] - r.data[k]) + Math.abs(a.data[k + 1] - r.data[k + 1]) + Math.abs(a.data[k + 2] - r.data[k + 2]);
        ev += Math.abs(b.data[k] - r.data[k]) + Math.abs(b.data[k + 1] - r.data[k + 1]) + Math.abs(b.data[k + 2] - r.data[k + 2]);
      }
      if (!d) {
        ties++;
        continue;
      }
      dec += d;
      sb += eb;
      sv += ev;
      if (eb < ev) {
        bw++;
        baseWins++;
      } else if (ev < eb) {
        vw++;
        variantWins++;
      } else ties++;
    }
    baseSum += sb;
    varSum += sv;
    decidingTotal += dec;
    perSet.push(`${set}=${bw}:${vw}`);
  }
  const mb = baseSum / 3 / Math.max(1, decidingTotal);
  const mv = varSum / 3 / Math.max(1, decidingTotal);
  console.log(`\n${c.name}`);
  console.log(`  deciding pixels over the corpus: ${decidingTotal}`);
  console.log(`  MAE over exactly those pixels — as built ${mb.toFixed(3)}   swapped ${mv.toFixed(3)}   separation ${(((mv - mb) / mb) * 100).toFixed(2)}%`);
  console.log(`  per-frame tally (as built : swapped) ${baseWins}:${variantWins}, ${ties} tie(s)   by shot ${perSet.join('  ')}`);
}
