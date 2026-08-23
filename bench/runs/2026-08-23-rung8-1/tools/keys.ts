/**
 * Turning a per-frame fit into keys, and keys into curves.
 *
 * Two halves, and §10 decides both:
 *
 * · **where the keys go** (§10.3 🧩) — every change of direction, every hold
 *   boundary, and wherever one Bezier span cannot carry the shape. Not a target
 *   density: §10.6 says no public page gives one and this does not invent one.
 * · **what shape each span has** (§10.4 🧩) — Bezier is the default and linear
 *   the exception. Each span's handles are fitted against the frames, then the
 *   fitted handles are clustered into a small named `easings` table and every
 *   span takes the nearest entry by name. That is what "a handful of named
 *   shapes, reused by name" means when the shapes come from the shot rather than
 *   from a guess.
 *
 * ⚠️ Key times are floored to 6 dp. Rung 6 rounded to 4 and its last key landed
 * a fraction of a millisecond past the animation's last sample, so the event on
 * it never fired and the gate had nothing to say about it.
 */

/** Spine's normalised graph handles: [hx1, hy1, hx2, hy2] in 0..1 on x. */
export type Handles = [number, number, number, number];

/** Evaluate the normalised curve: given p in 0..1 of the span, return q. */
export function curveAt(h: Handles, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  // x(s) and y(s) are cubic Beziers through (0,0) and (1,1).
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const s = (lo + hi) / 2;
    const u = 1 - s;
    const x = 3 * h[0] * s * u * u + 3 * h[2] * s * s * u + s * s * s;
    if (x < p) lo = s;
    else hi = s;
  }
  const s = (lo + hi) / 2;
  const u = 1 - s;
  return 3 * h[1] * s * u * u + 3 * h[3] * s * s * u + s * s * s;
}

export interface Series {
  /** sample times, strictly increasing */
  t: number[];
  /** one value per sample */
  v: number[];
}

/**
 * A timeline with more than one channel — `translate` and `scale` key both axes
 * on one key (§10.3 📗), so their keys and their curve shape are shared and the
 * fit has to see both channels at once.
 */
export interface MultiSeries {
  t: number[];
  /** `channels[c][i]` — one array per value channel, in the key's field order. */
  channels: number[][];
}

function multiErr(m: MultiSeries, a: number, b: number, h: Handles): { worst: number; at: number } {
  let worst = 0;
  let at = -1;
  for (let i = a + 1; i < b; i++) {
    const p = (m.t[i] - m.t[a]) / (m.t[b] - m.t[a]);
    const q = curveAt(h, p);
    let d = 0;
    for (const ch of m.channels) d = Math.max(d, Math.abs(ch[a] + (ch[b] - ch[a]) * q - ch[i]));
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  return { worst, at };
}

/** The best shared handles for one span of a multi-channel timeline. */
export function fitSpanMulti(m: MultiSeries, a: number, b: number): { handles: Handles; error: number } {
  if (b - a < 2) return { handles: [0.25, 0, 0.75, 1], error: 0 };
  let best: Handles = [0.25, 0, 0.75, 1];
  let bestErr = multiErr(m, a, b, best).worst;
  for (const h of HANDLE_GRID) {
    const e = multiErr(m, a, b, h).worst;
    if (e < bestErr) {
      bestErr = e;
      best = h;
    }
  }
  let step = 0.08;
  while (step > 0.005) {
    let improved = false;
    for (let k = 0; k < 4; k++) {
      for (const sign of [1, -1]) {
        const trial = best.slice() as Handles;
        trial[k] = Math.min(1, Math.max(0, trial[k] + sign * step));
        const e = multiErr(m, a, b, trial).worst;
        if (e < bestErr - 1e-9) {
          best = trial;
          bestErr = e;
          improved = true;
          break;
        }
      }
    }
    if (!improved) step /= 2;
  }
  return { handles: best, error: bestErr };
}

/**
 * The best entry of a **named table** for one span.
 *
 * ⭐ This is what makes a key count honest. Fitting each span's own handles and
 * then substituting the nearest table entry silently gives up whatever the
 * substitution costs — measured here at 1.07 → 4.65 MAE on the `pendulum`, four
 * times the fit's own floor, with the gate green and `diff` unmoved. So the key
 * chooser is given the table and asked whether **a shape it can actually
 * write** holds the span; where none does, that is a key.
 */
export function bestFromTable(
  m: MultiSeries,
  a: number,
  b: number,
  table: Handles[],
): { handles: Handles; error: number; at: number } {
  if (b - a < 2) return { handles: table[0] ?? [0.25, 0, 0.75, 1], error: 0, at: -1 };
  let best = table[0];
  let bestE = Infinity;
  let bestAt = -1;
  for (const h of table) {
    const e = multiErr(m, a, b, h);
    if (e.worst < bestE) {
      bestE = e.worst;
      best = h;
      bestAt = e.at;
    }
  }
  return { handles: best, error: bestE, at: bestAt };
}

/**
 * Key choice for a multi-channel timeline: the same rule, seeing every channel.
 * With a `table` the spans are measured under the shapes that will actually be
 * written; without one, under each span's own best-fit shape.
 */
export function chooseKeysMulti(m: MultiSeries, tol: number, table?: Handles[]): number[] {
  const n = m.t.length;
  const keys = new Set<number>([0, n - 1]);
  for (const ch of m.channels) for (const i of turningPoints(ch)) keys.add(i);
  const sorted = (): number[] => [...keys].sort((x, y) => x - y);
  const spanFit = (a: number, b: number): { handles: Handles; error: number; at: number } => {
    if (table) return bestFromTable(m, a, b, table);
    const f = fitSpanMulti(m, a, b);
    return { ...f, at: multiErr(m, a, b, f.handles).at };
  };
  for (let guard = 0; guard < 400; guard++) {
    const ks = sorted();
    let worstErr = tol;
    let worstAt = -1;
    for (let s = 0; s < ks.length - 1; s++) {
      const a = ks[s];
      const b = ks[s + 1];
      if (b - a < 2) continue;
      const f = spanFit(a, b);
      if (f.error > worstErr) {
        worstErr = f.error;
        worstAt = f.at;
      }
    }
    if (worstAt < 0) break;
    keys.add(worstAt);
  }
  let ks = sorted();
  for (let pass = 0; pass < 3; pass++) {
    let removed = false;
    for (let s = 1; s < ks.length - 1; s++) {
      const { error } = spanFit(ks[s - 1], ks[s + 1]);
      if (error <= tol) {
        keys.delete(ks[s]);
        ks = sorted();
        removed = true;
        s = Math.max(0, s - 1);
      }
    }
    if (!removed) break;
  }
  return sorted();
}

/** Where a series turns: the samples where its own difference changes sign. */
export function turningPoints(v: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < v.length - 1; i++) {
    const a = v[i] - v[i - 1];
    const b = v[i + 1] - v[i];
    if ((a > 0 && b < 0) || (a < 0 && b > 0)) out.push(i);
    // the first and last sample of a run of equal values — a hold's boundary.
    else if (a !== 0 && b === 0) out.push(i);
    else if (a === 0 && b !== 0) out.push(i);
  }
  return out;
}

const HANDLE_GRID: Handles[] = (() => {
  const out: Handles[] = [];
  for (const hx1 of [0, 0.15, 0.25, 0.4, 0.55, 0.7]) {
    for (const hy1 of [0, 0.1, 0.25, 0.45]) {
      for (const hx2 of [0.3, 0.45, 0.6, 0.75, 0.85, 1]) {
        for (const hy2 of [0.55, 0.75, 0.9, 1]) out.push([hx1, hy1, hx2, hy2]);
      }
    }
  }
  return out;
})();

/** The best handles for one span, over a coarse grid then a local walk. */
export function fitSpan(series: Series, a: number, b: number): { handles: Handles; error: number } {
  const t0 = series.t[a];
  const t1 = series.t[b];
  const v0 = series.v[a];
  const v1 = series.v[b];
  const dv = v1 - v0;
  const inner: { p: number; q: number }[] = [];
  for (let i = a + 1; i < b; i++) {
    inner.push({ p: (series.t[i] - t0) / (t1 - t0), q: dv === 0 ? 0 : (series.v[i] - v0) / dv });
  }
  if (inner.length === 0 || dv === 0) return { handles: [0.25, 0, 0.75, 1], error: 0 };
  const err = (h: Handles): number => {
    let worst = 0;
    for (const s of inner) worst = Math.max(worst, Math.abs(curveAt(h, s.p) - s.q) * Math.abs(dv));
    return worst;
  };
  let best: Handles = [0.25, 0, 0.75, 1];
  let bestErr = err(best);
  for (const h of HANDLE_GRID) {
    const e = err(h);
    if (e < bestErr) {
      bestErr = e;
      best = h;
    }
  }
  let step = 0.08;
  while (step > 0.005) {
    let improved = false;
    for (let k = 0; k < 4; k++) {
      for (const sign of [1, -1]) {
        const trial = best.slice() as Handles;
        trial[k] = Math.min(1, Math.max(0, trial[k] + sign * step));
        const e = err(trial);
        if (e < bestErr - 1e-9) {
          best = trial;
          bestErr = e;
          improved = true;
          break;
        }
      }
    }
    if (!improved) step /= 2;
  }
  return { handles: best, error: bestErr };
}

/** Error of a span under given handles, measured on the samples inside it. */
function spanError(series: Series, a: number, b: number, h: Handles): number {
  const t0 = series.t[a];
  const t1 = series.t[b];
  const v0 = series.v[a];
  const v1 = series.v[b];
  const dv = v1 - v0;
  let worst = 0;
  for (let i = a + 1; i < b; i++) {
    const p = (series.t[i] - t0) / (t1 - t0);
    const want = v0 + dv * curveAt(h, p);
    worst = Math.max(worst, Math.abs(want - series.v[i]));
  }
  return worst;
}

/**
 * Choose keys for one series: turning points first, then split wherever a span
 * cannot hold the shape, then try removing each key that turns out redundant.
 */
export function chooseKeys(series: Series, tol: number): number[] {
  const n = series.v.length;
  const keys = new Set<number>([0, n - 1]);
  for (const i of turningPoints(series.v)) keys.add(i);
  const sorted = (): number[] => [...keys].sort((x, y) => x - y);

  for (let guard = 0; guard < 400; guard++) {
    const ks = sorted();
    let worstSpan = -1;
    let worstErr = tol;
    let worstAt = -1;
    for (let s = 0; s < ks.length - 1; s++) {
      const a = ks[s];
      const b = ks[s + 1];
      if (b - a < 2) continue;
      const { handles } = fitSpan(series, a, b);
      let e = 0;
      let at = -1;
      for (let i = a + 1; i < b; i++) {
        const p = (series.t[i] - series.t[a]) / (series.t[b] - series.t[a]);
        const want = series.v[a] + (series.v[b] - series.v[a]) * curveAt(handles, p);
        const d = Math.abs(want - series.v[i]);
        if (d > e) {
          e = d;
          at = i;
        }
      }
      if (e > worstErr) {
        worstErr = e;
        worstSpan = s;
        worstAt = at;
      }
    }
    if (worstSpan < 0) break;
    keys.add(worstAt);
  }

  // prune: a turning point a single span already explains is not a key.
  let ks = sorted();
  for (let pass = 0; pass < 3; pass++) {
    let removed = false;
    for (let s = 1; s < ks.length - 1; s++) {
      const a = ks[s - 1];
      const b = ks[s + 1];
      const { handles, error } = fitSpan(series, a, b);
      if (error <= tol) {
        void spanError(series, a, b, handles);
        keys.delete(ks[s]);
        ks = sorted();
        removed = true;
        s = Math.max(0, s - 1);
      }
    }
    if (!removed) break;
  }
  return sorted();
}

/** Cluster fitted handles into a small named table, k-means on the four numbers. */
export function clusterHandles(all: Handles[], k: number): Handles[] {
  if (all.length <= k) return all.slice();
  const centres: Handles[] = [];
  const step = Math.floor(all.length / k);
  for (let i = 0; i < k; i++) centres.push(all[i * step].slice() as Handles);
  for (let iter = 0; iter < 40; iter++) {
    const sums: number[][] = centres.map(() => [0, 0, 0, 0, 0]);
    for (const h of all) {
      let bi = 0;
      let bd = Infinity;
      centres.forEach((c, i) => {
        const d = (c[0] - h[0]) ** 2 + (c[1] - h[1]) ** 2 + (c[2] - h[2]) ** 2 + (c[3] - h[3]) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      for (let j = 0; j < 4; j++) sums[bi][j] += h[j];
      sums[bi][4]++;
    }
    let moved = 0;
    sums.forEach((s, i) => {
      if (s[4] === 0) return;
      for (let j = 0; j < 4; j++) {
        const v = s[j] / s[4];
        moved += Math.abs(v - centres[i][j]);
        centres[i][j] = v;
      }
    });
    if (moved < 1e-6) break;
  }
  return centres.map((c) => c.map((v) => Math.round(v * 1000) / 1000) as Handles);
}

export function nearestHandle(h: Handles, table: Handles[]): number {
  let bi = 0;
  let bd = Infinity;
  table.forEach((c, i) => {
    const d = (c[0] - h[0]) ** 2 + (c[1] - h[1]) ** 2 + (c[2] - h[2]) ** 2 + (c[3] - h[3]) ** 2;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return bi;
}

/** Floor to 6 dp so no key can land later than the sample that should see it. */
export function floorTime(t: number): number {
  return Math.floor(t * 1e6) / 1e6;
}

export interface TimelinePlan {
  /** one array per value channel, in the key's field order */
  channels: number[][];
  /** deviation this timeline is allowed, in its own units */
  tol: number;
}

export interface PlannedTimeline {
  keys: number[];
  /** index into `table` for the span that starts at each key; the last is unused */
  easing: number[];
  /** the worst deviation any span of this timeline still carries */
  worst: number;
}

/**
 * Plan every timeline of an animation at once, in two passes.
 *
 * Pass A fits each span's own handles freely and only exists to *discover* what
 * shapes this shot uses. Those are clustered into one small named table, and
 * pass B then re-plans every timeline **under that table** — so the tolerance a
 * key count was bought at is the tolerance the emitted file actually holds.
 */
export function planTimelines(
  t: number[],
  timelines: TimelinePlan[],
  easingCount: number,
): { plans: PlannedTimeline[]; table: Handles[] } {
  const free: Handles[] = [];
  for (const tl of timelines) {
    const m: MultiSeries = { t, channels: tl.channels };
    const keys = chooseKeysMulti(m, tl.tol);
    for (let s = 0; s < keys.length - 1; s++) {
      if (keys[s + 1] - keys[s] >= 2) free.push(fitSpanMulti(m, keys[s], keys[s + 1]).handles);
    }
  }
  const table = clusterHandles(free, Math.min(easingCount, Math.max(1, free.length)));
  const plans: PlannedTimeline[] = [];
  for (const tl of timelines) {
    const m: MultiSeries = { t, channels: tl.channels };
    const keys = chooseKeysMulti(m, tl.tol, table);
    const easing: number[] = [];
    let worst = 0;
    for (let s = 0; s < keys.length - 1; s++) {
      const f = bestFromTable(m, keys[s], keys[s + 1], table);
      easing.push(nearestHandle(f.handles, table));
      worst = Math.max(worst, f.error);
    }
    plans.push({ keys, easing, worst });
  }
  return { plans, table };
}
