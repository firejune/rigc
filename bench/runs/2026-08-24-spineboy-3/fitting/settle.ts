/**
 * §8.1's adjacency rule, and §10.3's hold, applied to the fitted pose SERIES.
 *
 * `check`'s per-frame column found two defects nothing else in the loop can
 * see, both in the relation between two frames rather than in either one:
 *
 *   death  13 of 59 adjacent pairs change by a different amount than the
 *          reference does — f18..f26 the reference is exactly still and mine
 *          moves 720, 447, 351, 270, 261, 219, 144, 47, 6 px;
 *   shoot  f0 -> f1, where the reference is bit-identical (the brief's only
 *          motionless pair in the whole set) and mine moves 1078 px.
 *
 * Both are a frame-by-frame fit wandering along directions the picture barely
 * sees. The reference's OWN frame-to-frame change says where it may not:
 *
 *   1. STILL RUNS. Where the reference does not change, collapse the run to a
 *      single pose — chosen as the best of the run's own poses, then refined
 *      against every frame of the run at once. This is §10.3's "key the start
 *      of a hold and key its end, at the same value" decided at the pose level,
 *      before the series becomes keys.
 *   2. QUIET PAIRS. Where the reference moves a little and mine moves a lot,
 *      slide my pose along the segment towards its neighbour and keep the
 *      furthest point that does not cost the picture anything. One knob,
 *      guarded by the objective, so it can only trade motion it was not buying
 *      anything with.
 *
 * Both read only the committed frames.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { Fitter, refFrame, cropPlate, knobsFor, type Pose } from './fit.ts';
import { ink } from './harness.ts';
import { SETS, MUZZLE, FIST } from './fitrun.ts';
import { LOOPS } from './genmotion.ts';
import type { Plate } from '../tools/plate.ts';

const BG = 232;
/** the brief's own frame-to-frame convention: a pixel differing by >2/255. */
function refDelta(a: Plate, b: Plate): number {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if (Math.abs(a.data[i] - b.data[i]) > 2 || Math.abs(a.data[i+1] - b.data[i+1]) > 2 || Math.abs(a.data[i+2] - b.data[i+2]) > 2) n++;
  return n;
}
function subjectBox(p: Plate): [number, number, number, number] {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    if (Math.abs(p.data[i] - BG) > 8 || Math.abs(p.data[i+1] - BG) > 8 || Math.abs(p.data[i+2] - BG) > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}
const lerp = (a: Pose, b: Pose, t: number): Pose => {
  const out: Pose = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const A = a[k] ?? {}, B = b[k] ?? {}, o: Record<string, number> = {};
    for (const p of new Set([...Object.keys(A), ...Object.keys(B)])) {
      o[p] = (A as Record<string, number>)[p] ?? 0;
      o[p] += t * (((B as Record<string, number>)[p] ?? 0) - o[p]);
    }
    out[k] = o as Pose[string];
  }
  return out;
};

export function settle(anim: string): { moved: number; runs: string[]; before: number; after: number } {
  const n = SETS[anim];
  const file = `work/placements-${anim}.json`;
  const store = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<number, Pose>>;
  const poses = store[anim];
  const f = new Fitter();
  const frames: Plate[] = [];
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  for (let i = 0; i < n; i++) {
    const p = refFrame(anim, i); frames.push(p);
    const [a, b, c, d] = subjectBox(p);
    bx0 = Math.min(bx0, a); by0 = Math.min(by0, b); bx1 = Math.max(bx1, c); by1 = Math.max(by1, d);
  }
  const PAD = 26;
  const X = Math.max(0, bx0 - PAD), Y = Math.max(0, by0 - PAD);
  const W = Math.min(384, bx1 + PAD) - X, H = Math.min(367, by1 + PAD) - Y;
  const view = f.window(X, Y, W, H);
  const crops = frames.map((p) => cropPlate(p, X, Y, W, H));
  const refInk = crops.map((c) => ink(c));
  f.rig.setAttachment('front-fist', FIST[anim] ?? 'front-fist-open');
  let armed = -2;
  const cost = (pose: Pose, i: number) => {
    const want = anim === 'shoot' ? (MUZZLE[i] ?? null) : null;
    if (armed !== i) { f.rig.setAttachment('muzzle', want); armed = i; }
    return f.costGuarded(pose, view, crops[i], 1, refInk[i]);
  };
  const myPlate = (pose: Pose, i: number): Plate => { cost(pose, i); f.rig.apply(pose); return f.rig.render(view); };

  const rd: number[] = [0];
  for (let i = 1; i < n; i++) rd.push(refDelta(frames[i - 1], frames[i]));
  const moving = rd.slice(1).filter((v) => v > 0).sort((a, b) => a - b);
  const med = moving[Math.floor(moving.length / 2)] ?? 0;
  const STILL = Math.max(60, 0.02 * med);

  const before = Array.from({ length: n }, (_, i) => cost(poses[i], i)).reduce((a, b) => a + b, 0) / n;
  const runs: string[] = [];

  // 1 — frames that MUST share one pose, as a single partition.
  //
  //   still runs   the reference does not change across the pair;
  //   loop seam    a cycle's last pose is its first pose. The brief sorts the
  //                17 first-to-last differences into two groups with a factor
  //                of 8.6 and nothing between them - 0,0,0,0,1,55,77,104,302 px
  //                are the cycles and 2,595 upwards the one-shots - and the
  //                fits disagreed wildly where the pixels say they must not
  //                (`shoot`'s end pose put the near forearm 100 degrees from
  //                frame 0's, against a reference pair differing by 0 px).
  //
  // They are one partition rather than two passes because they OVERLAP: on
  // `shoot`, f0..f1 is a still run and f0/f5 is the seam, so running them in
  // sequence has the second silently undo the first. That is what happened.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (i: number, j: number) => { const a = find(i), b = find(j); if (a !== b) parent[b] = a; };
  for (let i = 1; i < n; i++) if (rd[i] <= STILL) join(i - 1, i);
  const seam = LOOPS[anim] ? refDelta(frames[0], frames[n - 1]) : Infinity;
  if (seam <= 400) join(0, n - 1);
  const classes = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const r = find(i); (classes.get(r) ?? classes.set(r, []).get(r)!).push(i); }

  for (const idx of classes.values()) {
    if (idx.length < 2) continue;
    const total = (p: Pose) => idx.reduce((s, j) => s + cost(p, j), 0);
    let best = poses[idx[0]], bv = total(best);
    for (const j of idx) { const v = total(poses[j]); if (v < bv) { bv = v; best = poses[j]; } }
    const pose: Pose = JSON.parse(JSON.stringify(best));
    let cur = total(pose);
    for (const st of [3, 1.5, 0.75, 0.35, 0.15]) {
      for (const kn of knobsFor(pose, false)) {
        const slot = (pose[kn.bone] ??= {});
        const c0 = slot[kn.prop] ?? 0;
        let bestV = c0;
        for (const v of [c0 - st, c0 + st, c0 - st / 2, c0 + st / 2]) {
          slot[kn.prop] = v; const c = total(pose);
          if (c < cur - 1e-9) { cur = c; bestV = v; }
        }
        slot[kn.prop] = bestV;
      }
    }
    for (const j of idx) poses[j] = JSON.parse(JSON.stringify(pose));
    runs.push(`{${idx.map((j) => 'f' + j).join(',')}} held as ONE pose`);
  }
  if (LOOPS[anim]) {
    const endFile = 'work/placements-end.json';
    const ends = JSON.parse(readFileSync(endFile, 'utf8')) as Record<string, Pose>;
    if (seam <= 400) { ends[anim] = JSON.parse(JSON.stringify(poses[n - 1])); writeFileSync(endFile, JSON.stringify(ends)); }
    runs.push(seam <= 400 ? `loop seam closed (reference first-to-last ${seam} px)` : `loop seam NOT closed (${seam} px)`);
  }

  // 2 — quiet pairs: where the reference moves a little and mine moves a lot,
  // slide my pose along the segment towards its neighbour and keep the furthest
  // point that costs the picture nothing. One knob, guarded by the objective,
  // so it can only give back motion it was not buying anything with.
  let moved = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n; i++) {
      if (find(i) === find(i - 1)) continue;
      if (classes.get(find(i))!.length > 1) continue;
      const mine = refDelta(myPlate(poses[i - 1], i - 1), myPlate(poses[i], i));
      const allow = 1.4 * rd[i] + 60;
      if (mine <= allow) continue;
      const c0 = cost(poses[i], i);
      let bestT = 0, bestD = mine;
      for (const t of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
        const p = lerp(poses[i], poses[i - 1], t);
        if (cost(p, i) > c0 * 1.02 + 1e-4) continue;
        const d = refDelta(myPlate(poses[i - 1], i - 1), myPlate(p, i));
        if (d < bestD) { bestD = d; bestT = t; }
      }
      if (bestT > 0) { poses[i] = lerp(poses[i], poses[i - 1], bestT); moved++; }
    }
  }

  const after = Array.from({ length: n }, (_, i) => cost(poses[i], i)).reduce((a, b) => a + b, 0) / n;
  store[anim] = poses;
  writeFileSync(file, JSON.stringify(store));
  return { moved, runs, before, after };
}

if (import.meta.main) {
  for (const anim of process.argv.slice(2)) {
    if (!existsSync(`work/placements-${anim}.json`)) { console.log(`${anim}: no placements`); continue; }
    const r = settle(anim);
    console.log(`${anim.padEnd(6)} cost ${r.before.toFixed(3)} -> ${r.after.toFixed(3)}   ${r.moved} pair(s) damped`);
    for (const s of r.runs) console.log(`   ${s}`);
  }
}
