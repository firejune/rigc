/**
 * Spine's own normalised Bezier handles, evaluated.
 *
 * "For a Bezier key, the X axis is from 0 to 1 and represents the percent of
 * time between the two keyframes. The Y axis is from 0 to 1 and represents the
 * percent of the difference between the keyframe's values" — the JSON format
 * page, quoted in AUTHORING §10.4. So a handle pair is the cubic Bezier with
 * control points (0,0), (hx1,hy1), (hx2,hy2), (1,1) and the value at a time
 * fraction `u` is `y(s)` where `x(s) = u`.
 */

export type Handles = [number, number, number, number];

export const LINEAR: Handles = [1 / 3, 1 / 3, 2 / 3, 2 / 3];

const cubic = (a: number, b: number, c: number, d: number, s: number): number => {
  const m = 1 - s;
  return m * m * m * a + 3 * m * m * s * b + 3 * m * s * s * c + s * s * s * d;
};

/** The value fraction at time fraction `u`, by bisection on x(s) = u. */
export function evalHandles(h: Handles, u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const s = (lo + hi) / 2;
    if (cubic(0, h[0], h[2], 1, s) < u) lo = s;
    else hi = s;
  }
  return cubic(0, h[1], h[3], 1, (lo + hi) / 2);
}

/**
 * The editor's AUTOMATIC handles: "The angle of the handles is adjusted
 * automatically based on the values of the keys before and after the key"
 * (Graph, quoted in §10.4).
 *
 * Implemented as a Catmull-Rom tangent at each end of the span, converted into
 * normalised handle space. This is what §10.4 says to take for a span with no
 * interior sample — "No information is not an argument for constant speed".
 */
export function automaticHandles(prev: number | null, v0: number, v1: number, next: number | null): Handles {
  const dv = v1 - v0;
  if (Math.abs(dv) < 1e-9) return LINEAR;
  const m0 = prev === null ? dv : (v1 - prev) / 2;
  const m1 = next === null ? dv : (next - v0) / 2;
  // A handle a third of the way along, with the tangent's own slope.
  const clamp = (v: number): number => Math.max(-3, Math.min(3, v));
  return [1 / 3, clamp(m0 / dv) / 3, 2 / 3, 1 - clamp(m1 / dv) / 3];
}

/** The deviation of a span's interpolant from the samples inside it. */
export function spanDeviation(values: number[], from: number, to: number, h: Handles): number {
  const v0 = values[from];
  const v1 = values[to];
  let worst = 0;
  for (let i = from + 1; i < to; i++) {
    const u = (i - from) / (to - from);
    const got = v0 + (v1 - v0) * evalHandles(h, u);
    worst = Math.max(worst, Math.abs(got - values[i]));
  }
  return worst;
}

/**
 * The best handles for one span, by a coarse grid then a local refinement.
 *
 * This is §10.4's pass A — it exists to DISCOVER which shapes the shot uses,
 * and its output is clustered into the table that pass B re-plans under. It is
 * never used to write a curve directly: "Never fit free handles and substitute
 * the nearest named shape after the fact."
 */
export function fitHandles(values: number[], from: number, to: number): { handles: Handles; deviation: number } {
  if (to - from < 2) return { handles: LINEAR, deviation: 0 };
  let best: { handles: Handles; deviation: number } = { handles: LINEAR, deviation: spanDeviation(values, from, to, LINEAR) };
  const grid = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];
  for (const hy1 of grid) {
    for (const hy2 of grid) {
      const h: Handles = [1 / 3, hy1, 2 / 3, hy2];
      const d = spanDeviation(values, from, to, h);
      if (d < best.deviation) best = { handles: h, deviation: d };
    }
  }
  for (const hx1 of [0.1, 0.25, 1 / 3, 0.45, 0.6]) {
    for (const hx2 of [0.4, 0.55, 2 / 3, 0.75, 0.9]) {
      const h: Handles = [hx1, best.handles[1], hx2, best.handles[3]];
      const d = spanDeviation(values, from, to, h);
      if (d < best.deviation) best = { handles: h, deviation: d };
    }
  }
  return best;
}

/** k-means over handle vectors, to build the `easings` table §10.4 asks for. */
export function clusterHandles(samples: Handles[], k: number): Handles[] {
  if (samples.length === 0) return [LINEAR];
  const sorted = [...samples].sort((a, b) => a[1] + a[3] - (b[1] + b[3]));
  let centres: Handles[] = [];
  for (let i = 0; i < k; i++) {
    centres.push([...sorted[Math.min(sorted.length - 1, Math.floor((i * sorted.length) / k))]] as Handles);
  }
  for (let round = 0; round < 25; round++) {
    const sums = centres.map(() => [0, 0, 0, 0, 0]);
    for (const s of samples) {
      let bestAt = 0;
      let bestD = Infinity;
      for (let i = 0; i < centres.length; i++) {
        const d = centres[i].reduce((acc, c, j) => acc + (c - s[j]) ** 2, 0);
        if (d < bestD) {
          bestD = d;
          bestAt = i;
        }
      }
      for (let j = 0; j < 4; j++) sums[bestAt][j] += s[j];
      sums[bestAt][4]++;
    }
    const next: Handles[] = [];
    for (let i = 0; i < centres.length; i++) {
      if (sums[i][4] === 0) continue;
      next.push([0, 1, 2, 3].map((j) => sums[i][j] / sums[i][4]) as unknown as Handles);
    }
    centres = next.length ? next : centres;
  }
  return centres.map((c) => c.map((v) => Number(v.toFixed(4))) as Handles);
}
