/**
 * Rung 7 — a fitted pose per frame is not a key. This turns one into the other.
 *
 * Everything §10.3 and §10.4 ask for, in the order they ask for it:
 *
 *  1. difference every adjacent pair of reference frames FIRST, because a snap-to-still
 *     step applied to a shot that never holds manufactures the defect it prevents
 *     (§10.3's 🚨, rung 4's tail);
 *  2. declare ONE tolerance in PIXELS at the end of what each bone swings, and convert
 *     it per bone by that bone's own lever arm — the same figure in degrees keys the far
 *     end of a chain four times too loosely;
 *  3. measure the objective's BASIN before declaring that tolerance, because a
 *     tolerance under the accuracy of whatever produced the series buys keys that encode
 *     the fitter's wander, and `check` cannot see that it happened;
 *  4. second-difference the fitted series and halve it, to find out whether the key
 *     density is a choice or a fact about the subject;
 *  5. force the series ends, every turning point, and BOTH ENDS OF EVERY RUN OF EXACTLY
 *     EQUAL VALUES — a plateau is neither an end nor a turn, and a greedy span stays
 *     inside its own tolerance straight across one;
 *  6. cap each span's deviation at the smaller of the absolute tolerance and the
 *     smallest single-frame move inside that span, because one figure in pixels cannot
 *     be generous on the fast part of a shot and tight on the slow part;
 *  7. two passes for the easings (§10.4): pass A fits free handles to DISCOVER the
 *     shapes, they are clustered into a table, and pass B re-plans every timeline under
 *     the table it will actually write. Never fit free and substitute the nearest name;
 *  8. a span with no interior sample takes the editor's AUTOMATIC handles snapped to the
 *     table, not linear — "no information" is not an argument for constant speed;
 *  9. then close the loop on the frames: `verify.ts` samples the planned curves at the
 *     frames' own rate, compares every adjacent pair's change against the reference's,
 *     and hands back the frames to force as keys. This module re-plans with those.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Plate, readPlate } from '../../../../tools/plate.ts';
import { applyPose, classify, framesBox, makeRig, renderInto, windowViewport, partError, type Knob } from './pose.ts';
import { ANIMS, frameFiles } from './frames.ts';
import { autoHandles, clusterHandles, evalHandles, fitHandles, LINEAR, type Handles } from './curve.ts';
import { DURATIONS } from './spec.ts';

const ROOT = 'bench/reference-local/7-anticipation';
const RUN = 'bench/runs/2026-08-28-rung7-1';
const FPS = 12;
const args = process.argv.slice(2);
const num = (k: string, d: number): number => (args.includes(`--${k}`) ? Number(args[args.indexOf(`--${k}`) + 1]) : d);
const TOL_PX = num('tol', 0);
const TABLE = num('table', 8);

const store = JSON.parse(readFileSync(`${RUN}/placements.json`, 'utf8')) as {
  knobs: Knob[];
  values: Record<string, number[][]>;
  times?: Record<string, number[]>;
};

/**
 * The sample times of each fitted series, which are NOT always `i / 12`.
 *
 * `hello`'s duration is 86/30 s and its 12 fps set's last sample is at 34/12 =
 * 2.8333 — 0.0333 s short. R7 gives a declared duration one frame of slack at 1/60 s,
 * so a last key at 2.8333 against a declared 2.8667 is a compile error, not a rounding
 * question. What closes it is a real measurement rather than a hold: the 30 fps set
 * writes its first and last still at full resolution, and `hello@30fps/f0086.png` IS
 * the pose at 86/30. So that frame is fitted too and becomes the animation's last key.
 * The other three shots need nothing — 50/30, 20/30 and 90/30 land exactly on 20/12,
 * 8/12 and 36/12.
 */
function timesFor(set: string, n: number): number[] {
  const given = store.times?.[set];
  if (given && given.length === n) return given;
  return Array.from({ length: n }, (_, i) => i / FPS);
}
const KNOBS = store.knobs;
const rig = makeRig(`${RUN}/spine`);
const ref = framesBox(ROOT);

// ---------------------------------------------------------------------------
// 2 — lever arms: how many frame pixels one unit of each knob is worth
// ---------------------------------------------------------------------------

/**
 * The farthest art point each bone carries, in world units from that bone's origin.
 *
 * For the chain this is measured off the mesh's own setup geometry, weighted: a bone
 * only swings the vertices bound to it, so the lever is the largest distance to a
 * vertex whose weight on that bone is non-trivial.
 */
function levers(): { px: number[]; label: string[] } {
  const skel = rig.skeleton;
  applyPose(rig, [], []);
  const reach = new Map<string, { r: number; ex: number; ey: number }>();
  for (const b of rig.posable.data.bones) reach.set(b.name, { r: 0, ex: 0, ey: 0 });
  for (const slot of skel.drawOrder.appliedPose) {
    // §9.1's neighbourhood: a Slot's `setupPose` is the METHOD that resets its pose,
    // while the attachment lives on `appliedPose` — the same shape as bone.pose.
    const att = slot.appliedPose.attachment;
    if (!att) continue;
    const bone = slot.bone;
    // region: the four corners of the quad in bone-local space; mesh: its vertices
    const pts: [number, number][] = [];
    const a = att as unknown as { vertices?: number[]; bones?: number[]; width?: number; height?: number; x?: number; y?: number; scaleX?: number; scaleY?: number };
    if (a.bones && a.vertices) {
      // weighted mesh: bind positions per bone, walked from the flat run
      const v = a.vertices;
      const bonesArr = a.bones;
      let i = 0;
      let vi = 0;
      while (i < bonesArr.length) {
        const n = bonesArr[i++];
        for (let k = 0; k < n; k++) {
          const bi = bonesArr[i++];
          const bx = v[vi++];
          const by = v[vi++];
          const w = v[vi++];
          if (w < 0.2) continue;
          const name = rig.posable.data.bones[bi].name;
          const e = reach.get(name)!;
          const r = Math.hypot(bx, by);
          if (r > e.r) e.r = r;
          if (Math.abs(bx) > e.ex) e.ex = Math.abs(bx);
          if (Math.abs(by) > e.ey) e.ey = Math.abs(by);
        }
      }
    } else {
      const hw = ((a.width ?? 0) * (a.scaleX ?? 1)) / 2;
      const hh = ((a.height ?? 0) * (a.scaleY ?? 1)) / 2;
      const ox = a.x ?? 0;
      const oy = a.y ?? 0;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push([ox + sx * hw, oy + sy * hh]);
      const e = reach.get(bone.data.name)!;
      for (const [px, py] of pts) {
        const r = Math.hypot(px, py);
        if (r > e.r) e.r = r;
        if (Math.abs(px) > e.ex) e.ex = Math.abs(px);
        if (Math.abs(py) > e.ey) e.ey = Math.abs(py);
      }
    }
  }
  // a parent's lever must cover everything hanging below it
  const byName = new Map(rig.posable.data.bones.map((b) => [b.name, b]));
  const resolve = (name: string): { r: number; ex: number; ey: number } => {
    const own = reach.get(name)!;
    let r = own.r;
    let ex = own.ex;
    let ey = own.ey;
    for (const b of rig.posable.data.bones) {
      if (b.parent?.name !== name) continue;
      const child = resolve(b.name);
      const d = Math.hypot(b.setupPose.x, b.setupPose.y);
      if (child.r + d > r) r = child.r + d;
      if (child.ex + Math.abs(b.setupPose.x) > ex) ex = child.ex + Math.abs(b.setupPose.x);
      if (child.ey + Math.abs(b.setupPose.y) > ey) ey = child.ey + Math.abs(b.setupPose.y);
    }
    return { r, ex, ey };
  };
  const px: number[] = [];
  const label: string[] = [];
  for (const k of KNOBS) {
    const e = resolve(k.bone);
    let perUnit: number;
    if (k.prop === 'x' || k.prop === 'y') perUnit = ref.scale;
    else if (k.prop === 'rotation') perUnit = ((e.r * Math.PI) / 180) * ref.scale;
    else if (k.prop === 'scaleX') perUnit = e.ex * ref.scale;
    else perUnit = e.ey * ref.scale;
    px.push(perUnit);
    label.push(`${k.bone}.${k.prop}`);
  }
  return { px, label };
}
const LEVER = levers();

// ---------------------------------------------------------------------------
// 1 — does the shot hold at all?
// ---------------------------------------------------------------------------

function referenceChange(set: string): number[] {
  const files = frameFiles(set);
  const out: number[] = [];
  let prev: Plate | null = null;
  for (const f of files) {
    const p = readPlate(`${ROOT}/${set}/${f}`);
    if (prev) {
      let n = 0;
      for (let i = 0; i < p.data.length; i += 4)
        if (
          Math.abs(p.data[i] - prev.data[i]) > 8 ||
          Math.abs(p.data[i + 1] - prev.data[i + 1]) > 8 ||
          Math.abs(p.data[i + 2] - prev.data[i + 2]) > 8
        )
          n++;
      out.push(n);
    }
    prev = p;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3 — the objective's basin
// ---------------------------------------------------------------------------

function basin(set: string, indices: number[]): number[] {
  const files = frameFiles(set);
  const series = store.values[set];
  const view = windowViewport(ref, 0, 0, ref.width, ref.height, 1);
  const plate = new Plate(ref.width, ref.height);
  const N = ref.width * ref.height;
  const ms = new Uint8Array(N);
  const mc = new Uint8Array(N);
  const widths: number[][] = KNOBS.map(() => []);
  for (const i of indices) {
    const rp = readPlate(`${ROOT}/${set}/${files[i]}`);
    const rs = new Uint8Array(N);
    const rc = new Uint8Array(N);
    const counts = classify(rp, rs, rc);
    const at = (v: number[]): number => {
      applyPose(rig, KNOBS, v);
      renderInto(rig, plate, view);
      return partError(plate, ms, mc, rs, rc, counts.sackN, counts.capeN);
    };
    const base = at(series[i]);
    // the objective's own resolution: one pixel of the smaller part
    const eps = 0.5 / Math.min(counts.sackN, counts.capeN);
    for (let k = 0; k < KNOBS.length; k++) {
      // how far can this knob move before the objective moves by more than eps?
      const unit = 0.25 / Math.max(1e-9, LEVER.px[k]); // a quarter pixel's worth
      let w = 0;
      for (let m = 1; m <= 24; m++) {
        const d = unit * m;
        const up = series[i].slice();
        up[k] += d;
        const dn = series[i].slice();
        dn[k] -= d;
        if (Math.abs(at(up) - base) > eps || Math.abs(at(dn) - base) > eps) break;
        w = d;
      }
      widths[k].push(w * LEVER.px[k]);
    }
  }
  return widths.map((w) => (w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0));
}

// ---------------------------------------------------------------------------
// 5-8 — the planner
// ---------------------------------------------------------------------------

interface Chan {
  /** knob indices making up this property, in the order rigc's `v` array wants */
  idx: number[];
  bone: string;
  property: string;
}

function channels(): Chan[] {
  const out: Chan[] = [];
  const has = (bone: string, prop: string): number => KNOBS.findIndex((k) => k.bone === bone && k.prop === prop);
  const bones = [...new Set(KNOBS.map((k) => k.bone))];
  for (const bone of bones) {
    const x = has(bone, 'x');
    const y = has(bone, 'y');
    if (x >= 0 && y >= 0) out.push({ idx: [x, y], bone, property: 'translate' });
    const r = has(bone, 'rotation');
    if (r >= 0) out.push({ idx: [r], bone, property: 'rotate' });
    const sx = has(bone, 'scaleX');
    const sy = has(bone, 'scaleY');
    if (sx >= 0 && sy >= 0) out.push({ idx: [sx, sy], bone, property: 'scale' });
  }
  return out;
}
const CHANS = channels();

/** forced key indices: series ends, turning points, and both ends of equal runs */
function forced(series: number[][], idx: number[], n: number): Set<number> {
  const f = new Set<number>([0, n - 1]);
  for (const k of idx) {
    const v = series.map((s) => s[k]);
    for (let i = 1; i < n - 1; i++) {
      const a = v[i] - v[i - 1];
      const b = v[i + 1] - v[i];
      if (a === 0 && b === 0) continue;
      if (a * b < 0) f.add(i); // a change of direction
    }
    // both ends of every run of EXACTLY equal values (§10.3's third forced index)
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && v[j + 1] === v[i]) j++;
      if (j > i) {
        f.add(i);
        f.add(j);
      }
      i = j + 1;
    }
  }
  return f;
}

/** deviation of a straight/eased span, in pixels, over every sample it skips */
function spanDeviation(
  series: number[][],
  times: number[],
  idx: number[],
  a: number,
  b: number,
  h: Handles | null,
): number {
  if (b - a < 2) return 0;
  let worst = 0;
  const span = times[b] - times[a];
  for (const k of idx) {
    const v0 = series[a][k];
    const v1 = series[b][k];
    for (let i = a + 1; i < b; i++) {
      const u = (times[i] - times[a]) / span;
      const f = h ? evalHandles(h, u) : u;
      const dev = Math.abs(v0 + (v1 - v0) * f - series[i][k]);
      const px = dev * LEVER.px[k];
      if (px > worst) worst = px;
    }
  }
  return worst;
}

/** the smallest single-frame move inside a span, in pixels (§10.3's relative floor) */
function slowestMove(series: number[][], idx: number[], a: number, b: number): number {
  let smallest = Infinity;
  for (let i = a; i < b; i++) {
    let m = 0;
    for (const k of idx) m = Math.max(m, Math.abs(series[i + 1][k] - series[i][k]) * LEVER.px[k]);
    if (m < smallest) smallest = m;
  }
  return smallest === Infinity ? 0 : smallest;
}

interface PlannedKey {
  t: number;
  v: number[];
  ease?: string;
}

/**
 * Plan one channel of one animation.
 *
 * `table` null = pass A (free handles, to discover shapes); otherwise pass B, which may
 * only use the table's entries.
 */
function planChannel(
  series: number[][],
  times: number[],
  chan: Chan,
  tolPx: number,
  table: { name: string; h: Handles }[] | null,
  extraForced: Set<number>,
): { keys: PlannedKey[]; discovered: Handles[] } {
  const n = series.length;
  const force = forced(series, chan.idx, n);
  for (const i of extraForced) if (i >= 0 && i < n) force.add(i);
  const sorted = [...force].sort((a, b) => a - b);

  const cuts: number[] = [0];
  let i = 0;
  while (i < n - 1) {
    const nextForced = sorted.find((f) => f > i) ?? n - 1;
    let best = i + 1;
    for (let j = i + 1; j <= nextForced; j++) {
      const cap = Math.min(tolPx, Math.max(slowestMove(series, chan.idx, i, j), tolPx * 0.05));
      // The shape that will ACTUALLY be written decides whether the span is legal —
      // §10.4's rule that a constraint not enforced where the value is written is not
      // a constraint. In pass A that shape is the editor's automatic handles (cheap,
      // and what a span with no interior sample gets anyway); in pass B it is the
      // table's own entries and nothing else.
      let bestDev: number;
      if (table === null) {
        bestDev = Math.min(
          spanDeviation(series, times, chan.idx, i, j, null),
          spanDeviation(series, times, chan.idx, i, j, autoFor(series, chan, i, j, n)),
        );
      } else {
        bestDev = spanDeviation(series, times, chan.idx, i, j, null);
        for (const e of table) bestDev = Math.min(bestDev, spanDeviation(series, times, chan.idx, i, j, e.h));
      }
      const ok = bestDev <= cap;
      if (ok) best = j;
      else break;
    }
    cuts.push(best);
    i = best;
  }

  const discovered: Handles[] = [];
  const keys: PlannedKey[] = [];
  for (let c = 0; c < cuts.length; c++) {
    const at = cuts[c];
    const v = chan.idx.map((k) => series[at][k]);
    const key: PlannedKey = { t: times[at], v };
    if (c < cuts.length - 1) {
      const a = at;
      const b = cuts[c + 1];
      const flat = chan.idx.every((k) => series[b][k] === series[a][k]);
      if (flat) {
        // a hold: any shape gives the same constant, so no ease is written
      } else if (b - a >= 3) {
        // two or more interior samples: a free four-parameter fit is determined enough
        // to be evidence about the shape.
        const h = fitFor(series, times, chan, a, b);
        discovered.push(h);
        if (table) key.ease = pick(table, series, times, chan, a, b);
      } else {
        // One interior sample or none. Fitting four handle numbers to one point is not
        // a measurement, it is an interpolation with three degrees of freedom left
        // over, and the grid search duly returns extremes: a first table built this way
        // came out with entries overshooting to -1.06 and +1.48, which is not a shape
        // this shot uses, it is one sample being hit exactly. §10.4's rule for a span
        // with no interior sample is the editor's AUTOMATIC handles, and a span with
        // one is closer to that case than to a fitted one.
        const h = autoFor(series, chan, a, b, n);
        discovered.push(h);
        if (table) key.ease = pick(table, series, times, chan, a, b, h);
      }
    }
    keys.push(key);
  }
  return { keys, discovered };
}

/** free handles for a span, fitted across the channel's axes together */
function fitFor(series: number[][], times: number[], chan: Chan, a: number, b: number): Handles {
  const us: number[] = [];
  const ys: number[] = [];
  const span = times[b] - times[a];
  for (const k of chan.idx) {
    const v0 = series[a][k];
    const v1 = series[b][k];
    if (Math.abs(v1 - v0) * LEVER.px[k] < 0.4) continue; // this axis carries no shape
    for (let i = a + 1; i < b; i++) {
      us.push((times[i] - times[a]) / span);
      ys.push((series[i][k] - v0) / (v1 - v0));
    }
  }
  if (!us.length) return LINEAR;
  return fitHandles(us, ys);
}

function autoFor(series: number[][], chan: Chan, a: number, b: number, n: number): Handles {
  // use the axis with the largest move to define the shape
  let bestK = chan.idx[0];
  let bestM = -1;
  for (const k of chan.idx) {
    const m = Math.abs(series[b][k] - series[a][k]) * LEVER.px[k];
    if (m > bestM) {
      bestM = m;
      bestK = k;
    }
  }
  return autoHandles(
    a > 0 ? series[a - 1][bestK] : null,
    series[a][bestK],
    series[b][bestK],
    b < n - 1 ? series[b + 1][bestK] : null,
  );
}

/** the table entry that fits this span best; undefined means linear is better */
function pick(
  table: { name: string; h: Handles }[],
  series: number[][],
  times: number[],
  chan: Chan,
  a: number,
  b: number,
  target?: Handles,
): string | undefined {
  let bestName: string | undefined;
  let bestDev = target ? Infinity : spanDeviation(series, times, chan.idx, a, b, null);
  if (target) {
    // no interior sample: choose the table entry nearest the automatic handles
    let bd = Infinity;
    for (const e of table) {
      let s = 0;
      for (let j = 0; j < 4; j++) s += (e.h[j] - target[j]) ** 2;
      if (s < bd) {
        bd = s;
        bestName = e.name;
      }
    }
    return bestName;
  }
  for (const e of table) {
    const d = spanDeviation(series, times, chan.idx, a, b, e.h);
    if (d < bestDev - 1e-9) {
      bestDev = d;
      bestName = e.name;
    }
  }
  return bestName;
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

const holdReport: string[] = [];
for (const set of ANIMS) {
  const ch = referenceChange(set);
  const still = ch.filter((c) => c === 0).length;
  holdReport.push(
    `  ${set.padEnd(22)} ${ch.length} adjacent pair(s), ${still} with ZERO changed pixels; ` +
      `min ${Math.min(...ch)} max ${Math.max(...ch)}`,
  );
}
console.log('1 — does the shot hold at all? (reference frame-to-frame change, >8/255 on some channel)');
console.log(holdReport.join('\n'));

console.log('\n2 — lever arms: frame pixels per unit of each knob');
for (let k = 0; k < KNOBS.length; k++)
  console.log(`  ${LEVER.label[k].padEnd(22)} ${LEVER.px[k].toFixed(5)} px/unit`);

console.log('\n3 — the objective\'s basin, in pixels at the end of what each bone swings');
const b = basin('hello', [8, 15, 20, 27, 31]);
let widest = 0;
for (let k = 0; k < KNOBS.length; k++) {
  console.log(`  ${LEVER.label[k].padEnd(22)} ${b[k].toFixed(3)} px`);
  if (b[k] > widest) widest = b[k];
}
console.log(`  ⇒ widest basin ${widest.toFixed(3)} px`);

const tol = TOL_PX > 0 ? TOL_PX : Math.max(0.35, Math.ceil(widest * 20) / 20);
console.log(`\n   declared tolerance: ${tol.toFixed(2)} px  ${TOL_PX > 0 ? '(given)' : '(at or above the widest basin)'}`);

console.log('\n4 — what a skipped sample costs: |f(n-1) - 2f(n) + f(n+1)| / 2, in px');
for (const set of ANIMS) {
  const series = store.values[set];
  const per: string[] = [];
  for (const chan of CHANS) {
    const ds: number[] = [];
    for (const k of chan.idx)
      for (let i = 1; i < series.length - 1; i++)
        ds.push((Math.abs(series[i - 1][k] - 2 * series[i][k] + series[i + 1][k]) / 2) * LEVER.px[k]);
    ds.sort((a, c) => a - c);
    per.push(`${chan.bone}.${chan.property}=${(ds[Math.floor(ds.length / 2)] ?? 0).toFixed(2)}`);
  }
  console.log(`  ${set.padEnd(22)} median second-difference/2: ${per.join('  ')}`);
}

// pass A: discover the shapes
const extra: Record<string, Set<number>> = existsSync(`${RUN}/force.json`)
  ? Object.fromEntries(
      Object.entries(JSON.parse(readFileSync(`${RUN}/force.json`, 'utf8')) as Record<string, number[]>).map(([k, v]) => [
        k,
        new Set(v),
      ]),
    )
  : {};

const allShapes: Handles[] = [];
for (const set of ANIMS)
  for (const chan of CHANS) {
    const r = planChannel(store.values[set], timesFor(set, store.values[set].length), chan, tol, null, extra[set] ?? new Set());
    allShapes.push(...r.discovered);
  }
console.log(`\n7 — pass A discovered ${allShapes.length} span shape(s); clustering into ${TABLE}`);
const centres = clusterHandles(allShapes, TABLE);
const table = centres.map((h, i) => ({ name: `e${i + 1}`, h }));
for (const e of table) console.log(`  ${e.name}  [${e.h.map((v) => v.toFixed(3)).join(', ')}]`);

// pass B: re-plan every timeline under the table it will actually write
const animations: Record<string, unknown[]> = {};
let totalKeys = 0;
let totalTracks = 0;
const kinds = { linear: 0, bezier: 0 };
for (const set of ANIMS) {
  const tracks: unknown[] = [];
  for (const chan of CHANS) {
    const times = timesFor(set, store.values[set].length);
    const r = planChannel(store.values[set], times, chan, tol, table, extra[set] ?? new Set());
    // Clean Up (§10.3): a timeline whose every key equals the setup pose is not written
    const isSetup = r.keys.every((k) => k.v.every((v, j) => Math.abs(v - KNOBS[chan.idx[j]].base) < 1e-9));
    if (isSetup) continue;
    // a constant timeline needs one key, not two
    let keys = r.keys;
    if (keys.length > 1 && keys.every((k) => k.v.every((v, j) => v === keys[0].v[j]))) keys = [{ t: 0, v: keys[0].v }];
    const last = times[times.length - 1];
    const out = keys.map((k, i) => {
      // §4.4: translate values are relative to setup; scale is a multiplier where 1 is
      // setup; rotation is degrees. Every bone here has setup rotation 0 and scale 1,
      // so only translate needs the subtraction.
      const v =
        chan.property === 'translate' ? k.v.map((x, j) => x - KNOBS[chan.idx[j]].base) : k.v.slice();
      // A key sitting on the series' own last sample is written at the DECLARED
      // duration instead. R7 gives one 1/60 s frame of slack and `hello`'s last sample
      // is 0.0333 s short of its duration, which is twice that — a compile error, not a
      // rounding question. The value is the one fitted to the 30 fps still AT that
      // time, so this moves the key's clock rather than inventing its pose.
      const onLast = Math.abs(k.t - last) < 1e-9;
      const key: Record<string, unknown> = { t: onLast ? DURATIONS[set] : k.t, v };
      if (i === keys.length - 1) {
        // §4.5: the last key of a track carries neither `ease` nor `curve`
      } else if (k.ease) {
        key.ease = k.ease;
        kinds.bezier++;
      } else kinds.linear++;
      return key;
    });
    totalKeys += out.length;
    totalTracks++;
    tracks.push({ bone: chan.bone, property: chan.property, keys: out });
  }
  animations[set] = tracks;
}

writeFileSync(
  `${RUN}/keys.json`,
  JSON.stringify({ easings: Object.fromEntries(table.map((e) => [e.name, e.h])), animations }, null, 1) + '\n',
);
console.log(
  `\nplanned: ${totalTracks} track(s), ${totalKeys} key(s) at ${tol.toFixed(2)} px  ` +
    `(${kinds.bezier} bezier span(s), ${kinds.linear} linear)`,
);
console.log(`wrote ${RUN}/keys.json`);
