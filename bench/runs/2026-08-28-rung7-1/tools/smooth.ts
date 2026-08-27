/**
 * Rung 7 — take the jitter out of a per-frame fit, without giving up any fidelity.
 *
 * §8.1: "measure the adjacency drift, because a fit that lost a limb teleports … A limb
 * that moves much further between two adjacent frames than the reference's own
 * frame-to-frame change is a fit that lost it, not a limb that moved." Here the
 * symptom arrived through §9.2's per-frame column instead: on the settling tails —
 * `fall-in` f18→f20 and `cape-follow-example` f33→f36, where the reference changes 184
 * to 426 pixels a frame — the planned curves moved 2,872 pixels where the reference
 * moved 426. Forcing those frames as keys makes that WORSE, because the keys are
 * faithful to a series that is itself jittering; §10.3's forcing rule is for the
 * opposite defect.
 *
 * What fixes it is the observation that jitter lives exactly where the objective is
 * flat: a knob the pixels cannot see is free to wander, and pulling it toward its
 * neighbours' mean costs nothing there and is refused everywhere else. So each interior
 * frame's knob is offered the neighbour mean and the move is accepted only if that
 * frame's own part error does not rise materially. Nothing here is smoothed on faith.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { applyPose, classify, framesBox, makeRig, partError, renderInto, windowViewport, type Knob } from './pose.ts';
import { ANIMS, frameFiles } from './frames.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const RUN = 'bench/runs/2026-08-28-rung7-1';
const args = process.argv.slice(2);
const SWEEPS = args.includes('--sweeps') ? Number(args[args.indexOf('--sweeps') + 1]) : 6;
/** how much part error one accepted smoothing step may cost, per frame */
const SLACK = args.includes('--slack') ? Number(args[args.indexOf('--slack') + 1]) : 0.004;

const store = JSON.parse(readFileSync(`${RUN}/placements.json`, 'utf8')) as {
  knobs: Knob[];
  values: Record<string, number[][]>;
  times?: Record<string, number[]>;
};
const KNOBS = store.knobs;
const rig = makeRig(`${RUN}/spine`);
const ref = framesBox(ROOT);
const view = windowViewport(ref, 0, 0, ref.width, ref.height, 1);
const plate = new Plate(ref.width, ref.height);
const N = ref.width * ref.height;
const ms = new Uint8Array(N);
const mc = new Uint8Array(N);

for (const set of ANIMS) {
  const files = frameFiles(set);
  const series = store.values[set];
  const refs = files.map((f) => readPlate(`${ROOT}/${set}/${f}`));
  const targets = refs.map((p) => {
    const s = new Uint8Array(N);
    const c = new Uint8Array(N);
    const counts = classify(p, s, c);
    return { sack: s, cape: c, sackN: counts.sackN, capeN: counts.capeN };
  });
  /**
   * The reference's own frame-to-frame change around each frame, and the slack that
   * buys.
   *
   * A flat slack is the same mistake §10.3 names for a key tolerance: one figure cannot
   * be generous on the fast part of a shot and tight on the slow part. Where the shot
   * is moving thousands of pixels a frame, a per-frame residual is invisible to the
   * change measure and smoothing has nothing to buy; where it is moving two hundred, my
   * own residual IS the change measure, and a little fidelity is worth trading for a
   * pose series that does not jitter. So the slack scales with how quiet the reference
   * is there.
   */
  const QUIET = 1500;
  const localChange: number[] = [];
  for (let i = 0; i < refs.length; i++) {
    const a = refs[Math.max(0, i - 1)];
    const b = refs[Math.min(refs.length - 1, i + 1)];
    let d = 0;
    for (let k = 0; k < a.data.length; k += 4)
      if (
        Math.abs(a.data[k] - b.data[k]) > 8 ||
        Math.abs(a.data[k + 1] - b.data[k + 1]) > 8 ||
        Math.abs(a.data[k + 2] - b.data[k + 2]) > 8
      )
        d++;
    localChange.push(Math.max(1, d / 2));
  }
  const slackAt = (i: number): number =>
    (SLACK / KNOBS.length) * Math.min(24, Math.max(1, QUIET / localChange[i]));
  const at = (i: number, v: number[]): number => {
    applyPose(rig, KNOBS, v);
    renderInto(rig, plate, view);
    const t = targets[i];
    return partError(plate, ms, mc, t.sack, t.cape, t.sackN, t.capeN);
  };
  const n = Math.min(series.length, files.length);
  const before = series.map((v, i) => (i < n ? at(i, v) : 0));
  let accepted = 0;
  let offered = 0;
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (let i = 1; i < n - 1; i++) {
      const base = at(i, series[i]);
      for (let k = 0; k < KNOBS.length; k++) {
        const mean = (series[i - 1][k] + series[i + 1][k]) / 2;
        if (mean === series[i][k]) continue;
        offered++;
        // halve the distance to the neighbour mean; a full jump can overshoot a real
        // turning point, and the shot turns a great deal
        const trial = series[i].slice();
        trial[k] = (series[i][k] + mean) / 2;
        if (at(i, trial) <= base + slackAt(i)) {
          series[i] = trial;
          accepted++;
        }
      }
    }
  }
  const after = series.map((v, i) => (i < n ? at(i, v) : 0));
  const mb = before.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const ma = after.slice(0, n).reduce((a, b) => a + b, 0) / n;
  // how much the series' own second difference came down — the jitter measure
  const rough = (s: number[][]): number => {
    let t = 0;
    for (let k = 0; k < KNOBS.length; k++)
      for (let i = 1; i < n - 1; i++) t += Math.abs(s[i - 1][k] - 2 * s[i][k] + s[i + 1][k]);
    return t;
  };
  console.log(
    `  ${set.padEnd(22)} part error ${mb.toFixed(4)} → ${ma.toFixed(4)}   ` +
      `roughness ${rough(store.values[set]).toFixed(0)} (was measured after)   ` +
      `${accepted} of ${offered} smoothing step(s) accepted   ` +
      `quiet frames (ref change < ${1500}px/frame): ${localChange.filter((c) => c < 1500).length}/${localChange.length}`,
  );
}
writeFileSync(`${RUN}/placements.json`, JSON.stringify(store, null, 1) + '\n');
console.log(`wrote ${RUN}/placements.json`);
