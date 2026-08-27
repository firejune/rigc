/**
 * Rung 7 — the one sample the 12 fps set does not carry.
 *
 * `hello`'s duration is 86/30 s. Its 12 fps set's last sample is at 34/12 = 2.8333,
 * which is 0.0333 s short — twice R7's 1/60 s of slack, so a track whose last key sits
 * there against a declared 2.8667 is a compile error rather than a rounding question.
 * The brief warns about this from the other side: *"If you declare 2.833 you will be a
 * frame short and every timing measure will carry it."*
 *
 * A hold over the last 0.033 s would satisfy the compiler and be a fabrication. What
 * the frames actually offer is better: the 30 fps set writes its first and last still
 * at the full 1024 x 798, and `hello@30fps/f0086.png` is the pose at exactly 86/30. So
 * that pose is measured, and it becomes the animation's last key.
 *
 * ⚠️ The two times are one thirtieth of a second apart, and that is NOT the same as the
 * two poses being close: `hello` is still travelling at its end, and this frame sits
 * 84.7 units of sack.y away from f34's. A first version seeded from f34 and ran a local
 * descent only; it reached part error 0.635 against a corpus norm of 0.24-0.39, and
 * `check` charged that to the two sets whose only other still is the first frame —
 * `hello@24fps` and `hello@30fps` read MAE 41.88 and 41.11 against 27.81 at 12 fps,
 * both with their worst frame on this one pose. §8.1's rule is the fix: scan each knob's
 * whole plausible range rather than line-searching out from where it sits, and give the
 * search more than one start.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { applyPose, classify, framesBox, makeRig, partError, renderInto, windowViewport, type Knob } from './pose.ts';
import { frameFiles, ANIMS } from './frames.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const RUN = 'bench/runs/2026-08-28-rung7-1';
const FPS = 12;

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

const rp = readPlate(`${ROOT}/hello@30fps/f0086.png`);
const rs = new Uint8Array(N);
const rc = new Uint8Array(N);
const counts = classify(rp, rs, rc);

const refN = counts.sackN + counts.capeN;
/**
 * The part error, with the objective's one degenerate optimum shut off.
 *
 * `partError` charges a mismatch in both directions, so a candidate that draws NOTHING
 * where the reference draws scores exactly 1.0 — while a candidate present but badly
 * posed can score above that, because its ink is wrong in two channels at once. On a
 * full-range search that makes "leave the frame" the global minimum, and a first version
 * of this file duly walked sack.x 5,695 units away and reported 1.0000 as an improvement
 * on the seed's 1.4018. §9.1's rule that a number which will not move is an inert write
 * has a twin: a number that improves by removing the subject is not an objective.
 *
 * So a candidate has to actually overlap the reference to be scored at all.
 */
const at = (v: number[]): number => {
  applyPose(rig, KNOBS, v);
  renderInto(rig, plate, view);
  classify(plate, ms, mc);
  let hit = 0;
  for (let k = 0; k < rs.length; k++) if ((ms[k] || mc[k]) && (rs[k] || rc[k])) hit++;
  if (hit < 0.35 * refN) return 10;
  return partError(plate, ms, mc, rs, rc, counts.sackN, counts.capeN);
};

const series = store.values.hello;
// if this has already been appended once, drop it and re-fit from scratch
const base12 = store.times?.hello && store.times.hello.length === series.length ? series.slice(0, -1) : series;
console.log(`hello@30fps/f0086 (t = 86/30 = ${(86 / 30).toFixed(4)}s)`);
console.log(`  seeded from the 12 fps f34 pose: err ${at(base12[base12.length - 1]).toFixed(4)}`);

/**
 * The analytic seed: where the reference's own beige centroid moved to.
 *
 * The shot is landing at its end — the subject's centroid drops 63.9 px and slides 8.5
 * px right between 34/12 and 86/30, which is most of a body length in a thirtieth of a
 * second. Converting that pixel shift into world units and applying it to sack.x/y puts
 * the seed on the answer instead of two thirds of the way from it, which is the same
 * trick fit.ts uses for every frame.
 */
const last12 = readPlate(`${ROOT}/hello/f0034.png`);
const l12s = new Uint8Array(rs.length);
const l12c = new Uint8Array(rs.length);
classify(last12, l12s, l12c);
const centroid = (m: Uint8Array): [number, number] => {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let k = 0; k < m.length; k++)
    if (m[k]) {
      n++;
      sx += k % ref.width;
      sy += (k / ref.width) | 0;
    }
  return [sx / n, sy / n];
};
const [ax, ay] = centroid(l12s);
const [bx, by] = centroid(rs);
const dx = (bx - ax) / ref.scale;
const dy = -(by - ay) / ref.scale;
console.log(`  the reference's beige centroid moves (${(bx - ax).toFixed(1)}, ${(by - ay).toFixed(1)}) px over that 1/30 s`);
const ix = KNOBS.findIndex((k) => k.bone === 'sack' && k.prop === 'x');
const iy = KNOBS.findIndex((k) => k.bone === 'sack' && k.prop === 'y');

const starts: number[][] = [];
const prev = base12[base12.length - 1];
const prev2 = base12[base12.length - 2];
starts.push(prev.slice());
for (const f of [0.4, 0.7, 1.0]) {
  // extrapolate the last 12 fps step, and separately seed the measured shift
  starts.push(KNOBS.map((_, i) => prev[i] + (prev[i] - prev2[i]) * f));
}
for (const f of [0.7, 1.0, 1.3]) {
  const v2 = prev.slice();
  v2[ix] += dx * f;
  v2[iy] += dy * f;
  starts.push(v2);
}
// the measured shift, plus the rest of the pose extrapolated
{
  const v2 = KNOBS.map((_, i) => prev[i] + (prev[i] - prev2[i]) * 0.4);
  v2[ix] = prev[ix] + dx;
  v2[iy] = prev[iy] + dy;
  starts.push(v2);
}

/** ranges: what `hello` itself uses, but sack.x/y bounded around the seeded position */
const lo = KNOBS.map((k, i) => Math.min(...base12.map((p) => p[i])));
const hi = KNOBS.map((k, i) => Math.max(...base12.map((p) => p[i])));
for (let i = 0; i < KNOBS.length; i++) {
  const pad = (hi[i] - lo[i]) * 0.2 + (KNOBS[i].prop.startsWith('scale') ? 0.05 : KNOBS[i].prop === 'rotation' ? 3 : 30);
  lo[i] -= pad;
  hi[i] += pad;
}
lo[ix] = prev[ix] + dx - 400;
hi[ix] = prev[ix] + dx + 400;
lo[iy] = prev[iy] + dy - 400;
hi[iy] = prev[iy] + dy + 400;

let v = starts[0].slice();
let e = at(v);
for (const start of starts) {
  let cand = start.slice();
  let ce = at(cand);
  for (let round = 0; round < 5; round++) {
    let moved = false;
    for (let i = 0; i < KNOBS.length; i++) {
      let bv = cand[i];
      let be = ce;
      for (let t = 0; t <= 18; t++) {
        const val = lo[i] + ((hi[i] - lo[i]) * t) / 18;
        const trial = cand.slice();
        trial[i] = val;
        const q = at(trial);
        if (q < be - 1e-9) {
          be = q;
          bv = val;
        }
      }
      if (bv !== cand[i]) {
        cand[i] = bv;
        ce = be;
        moved = true;
      }
    }
    if (!moved) break;
  }
  let mult = 0.06;
  for (let pass = 0; pass < 400; pass++) {
    let moved = false;
    for (let i = 0; i < KNOBS.length; i++) {
      const span = (hi[i] - lo[i]) * mult;
      for (const d of [span, -span]) {
        const trial = cand.slice();
        trial[i] = cand[i] + d;
        const q = at(trial);
        if (q < ce - 1e-10) {
          ce = q;
          cand = trial;
          moved = true;
        }
      }
    }
    if (!moved) {
      mult /= 1.7;
      if (mult < 1e-5) break;
    }
  }
  if (ce < e) {
    e = ce;
    v = cand.slice();
  }
}
console.log(`  refined over ${starts.length} start(s) with full-range scans: err ${e.toFixed(4)}`);

// the largest single-knob move from f34, so the log can say how much the shot did in
// that one thirtieth of a second rather than asserting it held
let worstK = '';
let worstD = 0;
for (let i = 0; i < KNOBS.length; i++) {
  const d = Math.abs(v[i] - base12[base12.length - 1][i]);
  if (d > worstD) {
    worstD = d;
    worstK = `${KNOBS[i].bone}.${KNOBS[i].prop}`;
  }
}
console.log(`  the shot's largest knob move over that 1/30 s: ${worstK} by ${worstD.toFixed(2)}`);

store.values.hello = [...base12, v];
store.times = store.times ?? {};
for (const set of ANIMS) {
  const n = frameFiles(set).length;
  store.times[set] = Array.from({ length: n }, (_, i) => i / FPS);
}
store.times.hello = [...Array.from({ length: base12.length }, (_, i) => i / FPS), 86 / 30];
writeFileSync(`${RUN}/placements.json`, JSON.stringify(store, null, 1) + '\n');
console.log(`\nhello now has ${store.values.hello.length} samples; wrote ${RUN}/placements.json`);
