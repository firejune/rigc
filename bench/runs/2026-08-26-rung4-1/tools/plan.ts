/**
 * Turn a fitted pose series into keys (AUTHORING.md §10.3, §10.4).
 *
 * Two things decide what survives the reduction, and both are §10.3's:
 *  - ONE tolerance, declared in PIXELS at the end of what each bone swings, and
 *    converted per bone by that bone's lever arm — the same angular error costs a
 *    different number of pixels at every level of this chain (the platform swings
 *    963 units of chain, chain-4 swings 209);
 *  - both ends of every run of EXACTLY equal values are forced keys, because a
 *    hold is a thing the shot does and a tolerance is not a hold.
 *
 * The easing table exists WHILE the keys are chosen, not after (§10.4's 🚨).
 * Pass A fits each span's handles freely to discover which shapes the shot uses;
 * those are clustered into the table; pass B re-plans every timeline under the
 * table it will actually write.
 *
 * The handle X positions are fixed at 1/3 and 2/3 — the editor's own default
 * handle length. With those, Spine's cubic has t(s) = s exactly, so a span's two
 * handle Y values are a LINEAR least-squares fit against the samples, which is
 * what makes pass A cheap enough to run on every span of a 241-sample series.
 */

export const HX1 = 1 / 3;
export const HX2 = 2 / 3;

/** Bezier value at normalised time u, for handles (1/3, hy1), (2/3, hy2). */
export function bez(u: number, hy1: number, hy2: number): number {
  const a = 3 * (1 - u) * (1 - u) * u;
  const b = 3 * (1 - u) * u * u;
  const c = u * u * u;
  return a * hy1 + b * hy2 + c;
}

export interface Span { i: number; j: number; hy1: number; hy2: number; kind: 'bezier' | 'linear' | 'stepped' }

/**
 * Least-squares (hy1, hy2) for the interior samples of [i, j].
 *
 * ⚠️ **A span that barely moves cannot be asked what shape it has.** The fit
 * divides by the span's own rise, so a rise of a fraction of the tolerance
 * returns handles of −7.1 and +14.8 — real minimisers of a meaningless
 * objective, and pass A duly clustered them into the easing table. The floor
 * below is what keeps a near-flat span out of the vote; it still gets a shape,
 * from the automatic handles, like any other span with nothing to fit.
 */
function fitHandles(v: number[], i: number, j: number, floor = 0): { hy1: number; hy2: number } | null {
  const dv = v[j] - v[i];
  if (j - i < 2) return null;
  if (Math.abs(dv) < Math.max(1e-9, floor)) return null;
  let saa = 0, sab = 0, sbb = 0, sar = 0, sbr = 0;
  for (let m = i + 1; m < j; m++) {
    const u = (m - i) / (j - i);
    const A = 3 * (1 - u) * (1 - u) * u;
    const B = 3 * (1 - u) * u * u;
    const C = u * u * u;
    const r = (v[m] - v[i]) / dv - C;
    saa += A * A; sab += A * B; sbb += B * B; sar += A * r; sbr += B * r;
  }
  const det = saa * sbb - sab * sab;
  if (Math.abs(det) < 1e-12) {
    // one interior sample: infinitely many (hy1, hy2) fit it. Take the symmetric
    // solution, which is the automatic-handle answer for a symmetric span.
    const denom = saa + 2 * sab + sbb;
    if (Math.abs(denom) < 1e-12) return null;
    const h = (sar + sbr) / denom;
    return { hy1: h, hy2: h };
  }
  const hy1 = (sbb * sar - sab * sbr) / det;
  const hy2 = (saa * sbr - sab * sar) / det;
  // an editor's handle stays inside the key pair it belongs to, give or take an
  // overshoot; anything past this is the division above, not a shape
  if (hy1 < -0.75 || hy1 > 1.75 || hy2 < -0.75 || hy2 > 1.75) return null;
  return { hy1, hy2 };
}

function maxDev(v: number[], i: number, j: number, hy1: number, hy2: number): number {
  const dv = v[j] - v[i];
  let worst = 0;
  for (let m = i + 1; m < j; m++) {
    const u = (m - i) / (j - i);
    const d = Math.abs(v[i] + dv * bez(u, hy1, hy2) - v[m]);
    if (d > worst) worst = d;
  }
  return worst;
}

/** Automatic handles for the span (i, j), from the tangents the neighbours imply. */
export function autoHandles(v: number[], i: number, j: number): { hy1: number; hy2: number } {
  const dv = v[j] - v[i];
  if (Math.abs(dv) < 1e-9) return { hy1: 0, hy2: 1 };
  const n = v.length;
  const slope = (m: number): number => {
    const a = Math.max(0, m - 1), b = Math.min(n - 1, m + 1);
    return (v[b] - v[a]) / (b - a);
  };
  const span = j - i;
  const hy1 = (slope(i) * span * HX1) / dv;
  const hy2 = 1 - (slope(j) * span * (1 - HX2)) / dv;
  return { hy1, hy2 };
}

export interface PlanOptions {
  tol: number;
  /** table of (hy1, hy2); empty = pass A (free handles). */
  table: [number, number][];
  /** indices that must be keys whatever the tolerance says. */
  forced?: Set<number>;
  maxSpan?: number;
  /** per-channel weight, so one tolerance in pixels covers x, y and an angle. */
  channelScale?: number[];
}

/**
 * Indices the reduction may not drop: the ends, the turns, and every hold's edges.
 *
 * ⚠️ A turn needs a size. The series here is a FIT, and a fit wanders: on a
 * channel whose motion is slow, the sign of the first difference flips on the fit's
 * own last digit at half the samples in the shot, and forcing every one of those
 * keys the noise rather than the shot. So a turn counts only when BOTH sides of it
 * are larger than the tolerance the caller scaled this series by — the same
 * tolerance the spans are held to, which is the only figure in the loop that is
 * about the picture rather than about the estimator.
 */
export function forcedIndices(series: number[][], turnEps = 0.5): Set<number> {
  const n = series[0].length;
  const out = new Set<number>([0, n - 1]);
  for (const v of series) {
    for (let i = 1; i < n - 1; i++) {
      const a = v[i] - v[i - 1];
      const b = v[i + 1] - v[i];
      if (Math.min(Math.abs(a), Math.abs(b)) < turnEps) continue;
      if ((a > 0 && b < 0) || (a < 0 && b > 0)) out.add(i);
    }
    // both ends of every run of EXACTLY equal values (§10.3's ⚠️)
    let run = 0;
    for (let i = 1; i < n; i++) {
      if (v[i] === v[i - 1]) { run++; continue; }
      if (run >= 1) { out.add(i - 1 - run); out.add(i - 1); }
      run = 0;
    }
    if (run >= 1) { out.add(n - 1 - run); out.add(n - 1); }
  }
  return out;
}

const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Plan one scalar series; every channel of a paired timeline shares the spans. */
export function planSeries(series: number[][], o: PlanOptions): Span[] {
  const n = series[0].length;
  const forced = o.forced ?? forcedIndices(series);
  const maxSpan = o.maxSpan ?? 64;
  const spans: Span[] = [];
  let i = 0;
  while (i < n - 1) {
    let bestJ = i + 1;
    let bestShape: { hy1: number; hy2: number; kind: Span['kind'] } = { hy1: 0, hy2: 1, kind: 'bezier' };
    for (let j = i + 2; j <= Math.min(n - 1, i + maxSpan); j++) {
      let blocked = false;
      for (let m = i + 1; m < j; m++) if (forced.has(m)) { blocked = true; break; }
      if (blocked) break;
      const shape = bestShapeFor(series, i, j, o);
      if (!shape) break;
      bestJ = j; bestShape = shape;
    }
    if (bestJ === i + 1) {
      // no interior sample: take the automatic handles, snapped to the table
      const chosen = adjacentShape(series, i, i + 1, o);
      spans.push({ i, j: i + 1, ...chosen });
    } else {
      spans.push({ i, j: bestJ, ...bestShape });
    }
    i = spans[spans.length - 1].j;
  }
  return spans;
}

function bestShapeFor(series: number[][], i: number, j: number, o: PlanOptions): { hy1: number; hy2: number; kind: Span['kind'] } | null {
  // one shape must hold every channel of the timeline at once — a named easing
  // says "the same shape, everywhere" (compile.ts's bezierForChannel)
  const candidates: [number, number][] = [];
  if (o.table.length === 0) {
    for (let c = 0; c < series.length; c++) {
      // the floor is the tolerance in this channel's own scaled units: a span
      // whose whole rise is under twice that has no shape to report
      const floor = 2 / (o.channelScale?.[c] ?? 1);
      const f = fitHandles(series[c], i, j, floor);
      if (f) candidates.push([f.hy1, f.hy2]);
    }
    candidates.push([HX1, HX2], [0, 1]); // linear and the flat S, always worth trying
  } else {
    candidates.push(...o.table);
  }
  let best: { hy1: number; hy2: number; kind: Span['kind'] } | null = null;
  let bestDev = Infinity;
  for (const [hy1, hy2] of candidates) {
    let dev = 0;
    for (let c = 0; c < series.length; c++) {
      const scale = o.channelScale?.[c] ?? 1;
      dev = Math.max(dev, maxDev(series[c], i, j, hy1, hy2) * scale);
    }
    if (dev < bestDev) { bestDev = dev; best = { hy1, hy2, kind: isLinear(hy1, hy2) ? 'linear' : 'bezier' }; }
  }
  if (bestDev > o.tol) return null;
  return best;
}

function adjacentShape(series: number[][], i: number, j: number, o: PlanOptions): { hy1: number; hy2: number; kind: Span['kind'] } {
  // §10.4: a span with no interior sample takes the automatic handles, snapped to
  // the table — "no information" is not an argument for constant speed
  const auto = series.map((v) => autoHandles(v, i, j));
  const mean: [number, number] = [
    auto.reduce((a, b) => a + b.hy1, 0) / auto.length,
    auto.reduce((a, b) => a + b.hy2, 0) / auto.length,
  ];
  if (!Number.isFinite(mean[0]) || !Number.isFinite(mean[1])) return { hy1: HX1, hy2: HX2, kind: 'linear' };
  const clamp = (x: number) => Math.max(-0.5, Math.min(1.5, x));
  const want: [number, number] = [clamp(mean[0]), clamp(mean[1])];
  if (o.table.length === 0) return { hy1: want[0], hy2: want[1], kind: isLinear(want[0], want[1]) ? 'linear' : 'bezier' };
  let best = o.table[0];
  for (const t of o.table) if (near(t, want) < near(best, want)) best = t;
  return { hy1: best[0], hy2: best[1], kind: isLinear(best[0], best[1]) ? 'linear' : 'bezier' };
}

export function isLinear(hy1: number, hy2: number): boolean {
  return Math.abs(hy1 - HX1) < 1e-6 && Math.abs(hy2 - HX2) < 1e-6;
}
