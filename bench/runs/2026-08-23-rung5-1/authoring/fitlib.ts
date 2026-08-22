/**
 * Piecewise cubic-bezier fitting for rigc motion specs.
 *
 * Handles are held at hx = (1/3, 2/3), which makes the bezier's time map exactly
 * linear (Bx(p) = p) and leaves a clean two-parameter value shape whose
 * least-squares fit is linear in both the key values and the handles.
 */
export interface Sample {
  t: number;
  v: number[];
}

export const HX1 = 1 / 3;
export const HX2 = 2 / 3;

/** Bezier basis weights at parameter p, for value = v1 + (v2-v1)*By(p). */
export function basis(p: number): [number, number, number] {
  const q = 1 - p;
  return [3 * q * q * p, 3 * q * p * p, p * p * p];
}

export function valueAt(p: number, v1: number, v2: number, hy1: number, hy2: number): number {
  const [b1, b2, b3] = basis(p);
  return v1 + (v2 - v1) * (b1 * hy1 + b2 * hy2 + b3);
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) M[c][c] = 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Fit (hy1, hy2) for one segment, over every channel at once.
 *
 * `floor` is the smallest value change worth shaping. The handles are normalised
 * by (v2 - v1), so a segment that barely moves divides by nearly nothing and the
 * fit runs off to whatever the noise asks for — a hold with handles at 2.2 is a
 * 220% overshoot of a change too small to see, and it is still a wrong curve.
 * Those segments are left linear.
 */
export function fitHandles(
  t1: number,
  t2: number,
  v1: number[],
  v2: number[],
  samples: Sample[],
  floor = 0,
): [number, number] {
  if (v1.every((v, c) => Math.abs(v2[c] - v) < floor)) return [1 / 3, 2 / 3];
  const A = [
    [0, 0],
    [0, 0],
  ];
  const rhs = [0, 0];
  let used = 0;
  for (const s of samples) {
    if (s.t <= t1 || s.t >= t2) continue;
    const p = (s.t - t1) / (t2 - t1);
    const [b1, b2, b3] = basis(p);
    for (let c = 0; c < v1.length; c++) {
      const d = v2[c] - v1[c];
      if (Math.abs(d) < Math.max(1e-9, floor)) continue;
      const x1 = b1 * d;
      const x2 = b2 * d;
      const y = s.v[c] - v1[c] - b3 * d;
      A[0][0] += x1 * x1;
      A[0][1] += x1 * x2;
      A[1][0] += x2 * x1;
      A[1][1] += x2 * x2;
      rhs[0] += x1 * y;
      rhs[1] += x2 * y;
      used++;
    }
  }
  if (used < 2) return [1 / 3, 2 / 3];
  // Ridge term keeps a segment with one interior sample from running away.
  A[0][0] += 1e-6;
  A[1][1] += 1e-6;
  const [h1, h2] = solve(A, rhs);
  const clamp = (h: number) => Math.max(-0.5, Math.min(1.5, h));
  return [clamp(h1), clamp(h2)];
}

/** Fit every key value at once, with the handles held fixed. */
export function fitValues(
  times: number[],
  handles: [number, number][],
  samples: Sample[],
  channel: number,
  pinned: Map<number, number>,
): number[] {
  const n = times.length;
  const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array(n).fill(0);
  for (const s of samples) {
    let j = -1;
    for (let k = 0; k < n - 1; k++) if (s.t >= times[k] && s.t <= times[k + 1]) { j = k; break; }
    if (j < 0) continue;
    const span = times[j + 1] - times[j];
    const p = span > 0 ? (s.t - times[j]) / span : 0;
    const [b1, b2, b3] = basis(p);
    const [hy1, hy2] = handles[j];
    const w = b1 * hy1 + b2 * hy2 + b3;
    const c1 = 1 - w;
    const c2 = w;
    A[j][j] += c1 * c1;
    A[j][j + 1] += c1 * c2;
    A[j + 1][j] += c2 * c1;
    A[j + 1][j + 1] += c2 * c2;
    rhs[j] += c1 * s.v[channel];
    rhs[j + 1] += c2 * s.v[channel];
  }
  for (let k = 0; k < n; k++) A[k][k] += 1e-4;
  for (const [k, v] of pinned) {
    for (let c = 0; c < n; c++) A[k][c] = 0;
    A[k][k] = 1;
    rhs[k] = v;
  }
  return solve(A, rhs);
}

export function evaluate(times: number[], values: number[][], handles: [number, number][], t: number): number[] {
  const n = times.length;
  if (t <= times[0]) return values[0];
  if (t >= times[n - 1]) return values[n - 1];
  let j = 0;
  for (let k = 0; k < n - 1; k++) if (t >= times[k] && t <= times[k + 1]) { j = k; break; }
  const span = times[j + 1] - times[j];
  const p = span > 0 ? (t - times[j]) / span : 0;
  const [hy1, hy2] = handles[j];
  return values[j].map((v1, c) => valueAt(p, v1, values[j + 1][c], hy1, hy2));
}

export interface FitResult {
  times: number[];
  values: number[][];
  handles: [number, number][];
  rms: number[];
  worst: { t: number; channel: number; err: number };
}

export function fitTrack(
  times: number[],
  samples: Sample[],
  channels: number,
  pinned: Map<number, number[]> = new Map(),
  floor = 0,
  rounds = 8,
): FitResult {
  const interp = (t: number, c: number): number => {
    let lo = samples[0];
    let hi = samples[samples.length - 1];
    for (let i = 0; i < samples.length - 1; i++) {
      if (samples[i].t <= t && t <= samples[i + 1].t) { lo = samples[i]; hi = samples[i + 1]; break; }
    }
    const span = hi.t - lo.t;
    const w = span > 0 ? (t - lo.t) / span : 0;
    return lo.v[c] + (hi.v[c] - lo.v[c]) * w;
  };
  let values: number[][] = times.map((t) => Array.from({ length: channels }, (_, c) => interp(t, c)));
  for (const [k, v] of pinned) values[k] = [...v];
  let handles: [number, number][] = times.slice(0, -1).map(() => [1 / 3, 2 / 3] as [number, number]);
  for (let round = 0; round < rounds; round++) {
    for (let j = 0; j < times.length - 1; j++) {
      handles[j] = fitHandles(times[j], times[j + 1], values[j], values[j + 1], samples, floor);
    }
    for (let c = 0; c < channels; c++) {
      const pin = new Map<number, number>();
      for (const [k, v] of pinned) pin.set(k, v[c]);
      const col = fitValues(times, handles, samples, c, pin);
      for (let k = 0; k < times.length; k++) values[k][c] = col[k];
    }
  }
  const rms = new Array(channels).fill(0);
  let worst = { t: 0, channel: 0, err: 0 };
  for (const s of samples) {
    const got = evaluate(times, values, handles, s.t);
    for (let c = 0; c < channels; c++) {
      const e = got[c] - s.v[c];
      rms[c] += e * e;
      if (Math.abs(e) > Math.abs(worst.err)) worst = { t: s.t, channel: c, err: e };
    }
  }
  for (let c = 0; c < channels; c++) rms[c] = Math.sqrt(rms[c] / samples.length);
  return { times, values, handles, rms, worst };
}
