/**
 * Spine's Bezier, and the two-pass planner §10.4 asks for.
 *
 * Handles are the normalised graph-view pair the editor shows and an `easings`
 * entry holds (§4.1): x is the fraction of the time between two keys, y the
 * fraction of the difference between their values.
 */
export type Handle = [number, number, number, number];

/** Value fraction at time fraction `u`, for the cubic those handles describe. */
export function bezier(u: number, h: Handle): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const [x1, y1, x2, y2] = h;
  let s = u;
  for (let i = 0; i < 8; i++) {
    const t = 1 - s;
    const x = 3 * t * t * s * x1 + 3 * t * s * s * x2 + s * s * s;
    const dx = 3 * t * t * x1 + 6 * t * s * (x2 - x1) + 3 * s * s * (1 - x2);
    if (Math.abs(x - u) < 1e-7 || dx <= 1e-9) break;
    s = Math.min(1, Math.max(0, s - (x - u) / dx));
  }
  const t = 1 - s;
  return 3 * t * t * s * y1 + 3 * t * s * s * y2 + s * s * s;
}

export const LINEAR: Handle = [1 / 3, 1 / 3, 2 / 3, 2 / 3];

/** Worst absolute error of one span under one handle, over the interior samples. */
export function spanError(ts: number[], ys: number[], a: number, b: number, h: Handle | 'stepped'): number {
  const t0 = ts[a];
  const t1 = ts[b];
  const y0 = ys[a];
  const y1 = ys[b];
  let worst = 0;
  for (let i = a + 1; i < b; i++) {
    const u = (ts[i] - t0) / (t1 - t0);
    const y = h === 'stepped' ? y0 : y0 + (y1 - y0) * bezier(u, h);
    const e = Math.abs(y - ys[i]);
    if (e > worst) worst = e;
  }
  return worst;
}

const GRID = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95];
const YGRID = [-0.35, -0.15, 0, 0.15, 0.35, 0.5, 0.65, 0.85, 1, 1.15, 1.35];

/** Pass A: the freest handle this span can take, found on a grid then polished. */
export function fitHandle(ts: number[], ys: number[], a: number, b: number): { h: Handle; err: number } {
  if (b - a < 2) return { h: LINEAR, err: 0 };
  let best: Handle = LINEAR;
  let bestErr = spanError(ts, ys, a, b, LINEAR);
  for (const x1 of GRID)
    for (const y1 of YGRID)
      for (const x2 of GRID)
        for (const y2 of YGRID) {
          const h: Handle = [x1, y1, x2, y2];
          const e = spanError(ts, ys, a, b, h);
          if (e < bestErr) {
            bestErr = e;
            best = h;
          }
        }
  for (const step of [0.08, 0.03, 0.01]) {
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      for (let k = 0; k < 4; k++) {
        for (const d of [step, -step]) {
          const h = [...best] as Handle;
          h[k] += d;
          if (k % 2 === 0 && (h[k] < 0.02 || h[k] > 0.98)) continue;
          const e = spanError(ts, ys, a, b, h);
          if (e < bestErr - 1e-9) {
            bestErr = e;
            best = h;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  }
  return { h: best, err: bestErr };
}

/** k-means over the handles pass A discovered — the table pass B is held to. */
export function cluster(samples: Handle[], k: number): Handle[] {
  if (samples.length === 0) return [];
  const uniq = samples.slice().sort(() => 0);
  const centres: Handle[] = [];
  const stride = Math.max(1, Math.floor(uniq.length / k));
  for (let i = 0; i < k && i * stride < uniq.length; i++) centres.push([...uniq[i * stride]] as Handle);
  for (let iter = 0; iter < 40; iter++) {
    const sums = centres.map(() => [0, 0, 0, 0, 0]);
    for (const s of samples) {
      let bi = 0;
      let bd = Infinity;
      for (let i = 0; i < centres.length; i++) {
        let d = 0;
        for (let j = 0; j < 4; j++) d += (s[j] - centres[i][j]) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      for (let j = 0; j < 4; j++) sums[bi][j] += s[j];
      sums[bi][4]++;
    }
    let moved = false;
    for (let i = 0; i < centres.length; i++) {
      if (sums[i][4] === 0) continue;
      for (let j = 0; j < 4; j++) {
        const v = sums[i][j] / sums[i][4];
        if (Math.abs(v - centres[i][j]) > 1e-6) moved = true;
        centres[i][j] = v;
      }
    }
    if (!moved) break;
  }
  return centres.map((c) => c.map((v) => Math.round(v * 1000) / 1000) as Handle);
}
