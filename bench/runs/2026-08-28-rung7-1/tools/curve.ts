/**
 * Rung 7 — Spine's own normalised Bezier handles, and how a span reads under one.
 *
 * §10.4: "the X axis is from 0 to 1 and represents the percent of time between the two
 * keyframes. The Y axis is from 0 to 1 and represents the percent of the difference
 * between the keyframe's values" — so an `easings` entry is exactly [hx1, hy1, hx2,
 * hy2] and rigc converts it per key into the absolute control points the file holds.
 *
 * One shape serves both channels of a paired property, because that is what a single
 * `ease` on a rigc key means. §10.3's default form is the paired one.
 */

export type Handles = [number, number, number, number];

export const LINEAR: Handles = [1 / 3, 1 / 3, 2 / 3, 2 / 3];

/** x(s) of the cubic Bezier through (0,0), (hx1,·), (hx2,·), (1,1). */
function bezier(p1: number, p2: number, s: number): number {
  const t = 1 - s;
  return 3 * t * t * s * p1 + 3 * t * s * s * p2 + s * s * s;
}

/**
 * y at normalised time u under `h`.
 *
 * Newton on x(s) = u with a bisection fallback: the handles are unconstrained in y
 * (an overshoot is a legitimate shape) but hx must stay in [0, 1] for x(s) to be
 * monotone, which `fitHandles` enforces.
 */
export function evalHandles(h: Handles, u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  let lo = 0;
  let hi = 1;
  let s = u;
  for (let i = 0; i < 40; i++) {
    const x = bezier(h[0], h[2], s);
    if (Math.abs(x - u) < 1e-9) break;
    if (x < u) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return bezier(h[1], h[3], s);
}

/**
 * The editor's automatic handles for the key at `i` of a sampled series.
 *
 * §10.4: "The angle of the handles is adjusted automatically based on the values of the
 * keys before and after the key … It can be useful to first apply automatic handles,
 * then adjust them manually only if necessary." A Catmull-Rom tangent is that rule
 * written down: the slope at a key is the secant through its neighbours.
 *
 * This is what a span with no interior sample gets (§10.4's last 🧩) — the samples
 * cannot constrain that span's shape at all, and "no information" is not an argument
 * for constant speed.
 */
export function autoHandles(prev: number | null, a: number, b: number, next: number | null): Handles {
  const d = b - a;
  if (Math.abs(d) < 1e-12) return LINEAR;
  // outgoing slope at a, incoming slope at b, both as (value per unit time) / d
  const sa = prev === null ? d : (b - prev) / 2;
  const sb = next === null ? d : (next - a) / 2;
  const clamp = (v: number): number => Math.max(-1.2, Math.min(1.6, v));
  return [1 / 3, clamp(sa / d / 3), 2 / 3, clamp(1 - sb / d / 3)];
}

/**
 * Best free handles for one span, given the samples inside it.
 *
 * Pass A of §10.4's two-pass rule: this exists only to DISCOVER which shapes the shot
 * uses, so that they can be clustered into the table pass B will actually write. The
 * rule it enforces is that a fitted shape is never substituted for the nearest named
 * one after the fact — rung 8's first version did that and went from 1.07 to 4.65 MAE.
 */
export function fitHandles(us: number[], ys: number[]): Handles {
  // ys are normalised to 0 at the span's start and 1 at its end
  let best: Handles = LINEAR;
  let bestE = Infinity;
  const grid = [0.05, 0.16, 0.28, 0.4, 0.55, 0.72, 0.9];
  const yg = [-0.35, -0.12, 0, 0.12, 0.28, 0.45, 0.62, 0.8, 1.0, 1.2];
  for (const hx1 of grid)
    for (const hy1 of yg)
      for (const hx2 of grid)
        for (const hy2 of yg) {
          const h: Handles = [hx1, hy1, hx2, hy2];
          let e = 0;
          for (let i = 0; i < us.length; i++) {
            const d = evalHandles(h, us[i]) - ys[i];
            e += d * d;
          }
          if (e < bestE) {
            bestE = e;
            best = h;
          }
        }
  // local refinement
  let h = best.slice() as Handles;
  let step = 0.06;
  let e = bestE;
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let k = 0; k < 4; k++)
      for (const d of [step, -step]) {
        const t = h.slice() as Handles;
        t[k] += d;
        if (k % 2 === 0 && (t[k] < 0.01 || t[k] > 0.99)) continue;
        let q = 0;
        for (let i = 0; i < us.length; i++) {
          const dd = evalHandles(t, us[i]) - ys[i];
          q += dd * dd;
        }
        if (q < e - 1e-12) {
          e = q;
          h = t;
          moved = true;
        }
      }
    if (!moved) {
      step /= 1.8;
      if (step < 1e-3) break;
    }
  }
  return h;
}

/** k-means over handle vectors, seeded deterministically by spread. */
export function clusterHandles(all: Handles[], k: number): Handles[] {
  if (all.length <= k) return all.slice();
  const centres: Handles[] = [];
  const used = new Set<number>();
  // seed: the point furthest from those already chosen (k-means++ without randomness)
  let seed = 0;
  for (let i = 1; i < all.length; i++) if (all[i][1] + all[i][3] < all[seed][1] + all[seed][3]) seed = i;
  centres.push(all[seed].slice() as Handles);
  used.add(seed);
  while (centres.length < k) {
    let bi = -1;
    let bd = -1;
    for (let i = 0; i < all.length; i++) {
      if (used.has(i)) continue;
      let d = Infinity;
      for (const c of centres) {
        let s = 0;
        for (let j = 0; j < 4; j++) s += (all[i][j] - c[j]) ** 2;
        if (s < d) d = s;
      }
      if (d > bd) {
        bd = d;
        bi = i;
      }
    }
    if (bi < 0) break;
    centres.push(all[bi].slice() as Handles);
    used.add(bi);
  }
  for (let iter = 0; iter < 40; iter++) {
    const sums = centres.map(() => [0, 0, 0, 0]);
    const counts = centres.map(() => 0);
    for (const h of all) {
      let bi = 0;
      let bd = Infinity;
      for (let c = 0; c < centres.length; c++) {
        let s = 0;
        for (let j = 0; j < 4; j++) s += (h[j] - centres[c][j]) ** 2;
        if (s < bd) {
          bd = s;
          bi = c;
        }
      }
      counts[bi]++;
      for (let j = 0; j < 4; j++) sums[bi][j] += h[j];
    }
    let moved = false;
    for (let c = 0; c < centres.length; c++) {
      if (!counts[c]) continue;
      for (let j = 0; j < 4; j++) {
        const v = sums[c][j] / counts[c];
        if (Math.abs(v - centres[c][j]) > 1e-9) moved = true;
        centres[c][j] = v;
      }
    }
    if (!moved) break;
  }
  // keep hx inside (0,1) so x(s) stays monotone
  for (const c of centres) {
    c[0] = Math.max(0.02, Math.min(0.98, c[0]));
    c[2] = Math.max(0.02, Math.min(0.98, c[2]));
  }
  return centres;
}
