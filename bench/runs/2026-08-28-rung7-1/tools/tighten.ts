/**
 * Rung 7 — bring my frame-to-frame change inside the band, where the reference barely
 * moves.
 *
 * `smooth.ts` established that the jitter is NOT free wander: of 13,090 offered
 * neighbour-mean steps only 229 were accepted, so nearly every knob is pinned by the
 * pixels. The excess change is therefore the per-frame residual itself — each frame is
 * a little wrong, in a slightly different direction, and on a pair the reference moves
 * 426 pixels across, two independent 12 % errors add up to 2,872.
 *
 * §10.3's ⚠️ is the same observation from the planner's side: "the same tolerance that
 * is generous on the fast part of the shot is a 90 % error on the slow part, because
 * one figure in pixels cannot be both". The fit has that property too, and the fix has
 * the same shape — make the constraint RELATIVE to what the shot is doing there.
 *
 * So: on exactly the pairs `check` would call a disagreement, contract the two poses
 * toward each other until my own change is inside the band, and report what that cost
 * in part error. It is a deliberate trade of a little fidelity on the quietest frames
 * of the shot for agreement on the one measure that can see a hold — and it is recorded
 * as a trade rather than presented as a fit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { applyPose, classify, framesBox, makeRig, partError, renderInto, windowViewport, type Knob } from './pose.ts';
import { ANIMS, frameFiles } from './frames.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const RUN = 'bench/runs/2026-08-28-rung7-1';
const CHANGE_TOLERANCE = 8;
const CHANGE_RATIO = 4;
const CHANGE_EXCESS = 24;
/** aim inside the band with room to spare, since the planner re-interpolates after */
const MARGIN = 0.75;

const store = JSON.parse(readFileSync(`${RUN}/placements.json`, 'utf8')) as {
  knobs: Knob[];
  values: Record<string, number[][]>;
  times?: Record<string, number[]>;
};
const KNOBS = store.knobs;
const rig = makeRig(`${RUN}/spine`);
const ref = framesBox(ROOT);
const view = windowViewport(ref, 0, 0, ref.width, ref.height, 1);
const N = ref.width * ref.height;
const ms = new Uint8Array(N);
const mc = new Uint8Array(N);

function delta(a: Plate, b: Plate): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if (
      Math.abs(a.data[i] - b.data[i]) > CHANGE_TOLERANCE ||
      Math.abs(a.data[i + 1] - b.data[i + 1]) > CHANGE_TOLERANCE ||
      Math.abs(a.data[i + 2] - b.data[i + 2]) > CHANGE_TOLERANCE
    )
      n++;
  return n;
}

/** the largest change of mine that is not a disagreement against `theirs` */
function allowed(theirs: number): number {
  if (theirs === 0) return 0;
  return Math.max(theirs + CHANGE_EXCESS, theirs * CHANGE_RATIO) * MARGIN;
}

for (const set of ANIMS) {
  const files = frameFiles(set);
  const series = store.values[set];
  const n = Math.min(series.length, files.length);
  const refs = files.map((f) => readPlate(`${ROOT}/${set}/${f}`));
  const targets = refs.map((p) => {
    const s = new Uint8Array(N);
    const c = new Uint8Array(N);
    const counts = classify(p, s, c);
    return { sack: s, cape: c, sackN: counts.sackN, capeN: counts.capeN };
  });
  const mine: Plate[] = [];
  const render = (v: number[]): Plate => {
    applyPose(rig, KNOBS, v);
    const p = new Plate(ref.width, ref.height);
    renderInto(rig, p, view);
    return p;
  };
  for (let i = 0; i < n; i++) mine.push(render(series[i]));
  const err = (i: number, v: number[]): number => {
    applyPose(rig, KNOBS, v);
    const p = new Plate(ref.width, ref.height);
    renderInto(rig, p, view);
    const t = targets[i];
    return partError(p, ms, mc, t.sack, t.cape, t.sackN, t.capeN);
  };

  const fixes: string[] = [];
  /**
   * Sweep to convergence, because contracting one pair moves a frame the pair BEFORE it
   * shares.
   *
   * The first version of this made one pass in index order: contracting f33-f34 and then
   * f34-f35 moves f34 twice, so the f33-f34 figure it had just reported was stale and
   * f34-f35 came back out of band on the next measurement. Two of the run's remaining
   * disagreements were exactly that — an in-band figure printed for a pair that had been
   * pushed back out by its neighbour one line later.
   */
  for (let sweep = 0; sweep < 12; sweep++) {
  let dirty = false;
  for (let i = 1; i < n; i++) {
    const theirs = delta(refs[i - 1], refs[i]);
    let ours = delta(mine[i - 1], mine[i]);
    if (ours <= allowed(theirs)) continue;
    const e0 = (err(i - 1, series[i - 1]) + err(i, series[i])) / 2;
    let alpha = 0;
    let bestPair: [number[], number[]] | null = null;
    for (let step = 1; step <= 12; step++) {
      const a = step / 14;
      const mid = KNOBS.map((_, k) => (series[i - 1][k] + series[i][k]) / 2);
      const p0 = KNOBS.map((_, k) => series[i - 1][k] + (mid[k] - series[i - 1][k]) * a);
      const p1 = KNOBS.map((_, k) => series[i][k] + (mid[k] - series[i][k]) * a);
      const q0 = render(p0);
      const q1 = render(p1);
      const d = delta(q0, q1);
      alpha = a;
      bestPair = [p0, p1];
      if (d <= allowed(theirs)) {
        ours = d;
        break;
      }
      ours = d;
    }
    if (!bestPair) continue;
    series[i - 1] = bestPair[0];
    series[i] = bestPair[1];
    mine[i - 1] = render(series[i - 1]);
    mine[i] = render(series[i]);
    const e1 = (err(i - 1, series[i - 1]) + err(i, series[i])) / 2;
    dirty = true;
    fixes.push(
      `f${String(i - 1).padStart(4, '0')}→f${String(i).padStart(4, '0')}: reference ${theirs}, mine now ${ours} ` +
        `(allowed ${Math.round(allowed(theirs))}), contracted ${(alpha * 100).toFixed(0)}%, part error ${e0.toFixed(3)} → ${e1.toFixed(3)}`,
    );
  }
  if (!dirty) break;
  }
  // final state, after the sweeps settled
  const settled: string[] = [];
  for (let i = 1; i < n; i++) {
    const theirs = delta(refs[i - 1], refs[i]);
    const ours = delta(mine[i - 1], mine[i]);
    if (ours > allowed(theirs))
      settled.push(`f${String(i - 1).padStart(4, '0')}→f${String(i).padStart(4, '0')}: reference ${theirs}, mine ${ours}, allowed ${Math.round(allowed(theirs))}`);
  }
  console.log(
    `  ${set}: ${fixes.length ? fixes.length + ' contraction(s)' : 'nothing out of band'}` +
      (settled.length ? `; ${settled.length} pair(s) STILL out of band` : fixes.length ? '; all pairs in band' : ''),
  );
  for (const f of fixes) console.log(`      ${f}`);
  for (const f of settled) console.log(`      ⚠️ ${f}`);
}
writeFileSync(`${RUN}/placements.json`, JSON.stringify(store, null, 1) + '\n');
console.log(`wrote ${RUN}/placements.json`);
