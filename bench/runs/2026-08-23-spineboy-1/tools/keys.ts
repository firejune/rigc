/**
 * Turn a fitted per-frame series into keys with named easings.
 *
 * Two rules from the guide drive this, and they are applied in this order:
 *
 * §10.3 🧩 — a key wherever the motion changes direction, and wherever one span
 * cannot hold the shape. The extrema go in first; the greedy pass adds the rest.
 *
 * §10.4 🧩 + rung 8's note 3 — the easings table is **in hand while the keys are
 * chosen**, never fitted per span and snapped afterwards. Every span is scored
 * against the same ten named shapes and takes the best of them, so the table is
 * a constraint on the fit rather than a rounding of it.
 *
 * Tolerance is stated in **frame pixels at the lever arm**, not in degrees
 * (rung 8's note 2): a quarter degree at the shoulder and a quarter degree at
 * the wrist are not the same error, and a rig keyed to one number in degrees
 * keys its far ends four times too loosely.
 */
export type Handles = [number, number, number, number];

/** A small reused table — §10.4's "handful of named shapes". */
export const EASINGS: Record<string, Handles> = {
  smooth: [0.42, 0, 0.58, 1],
  start: [0.42, 0, 1, 1],
  stop: [0, 0, 0.58, 1],
  soft: [0.25, 0.1, 0.75, 0.9],
  hold: [0.7, 0, 0.3, 1],
  lead: [0.15, 0.35, 0.5, 1],
  drift: [0.5, 0, 0.85, 0.65],
  whip: [0.6, 0.05, 0.75, 1],
  settle: [0.1, 0.6, 0.4, 1],
  push: [0.5, 0.2, 0.9, 0.6],
};

const cubic = (a: number, b: number, s: number): number => {
  const u = 1 - s;
  return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s;
};

/** Bezier value fraction at time fraction `x`, for normalised handles. */
export function ease(h: Handles, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lo = 0;
  let hi = 1;
  let s = x;
  for (let i = 0; i < 24; i++) {
    const bx = cubic(h[0], h[2], s);
    if (bx < x) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return cubic(h[1], h[3], s);
}

export interface Key {
  t: number;
  v: number;
  ease?: string;
}

function spanError(ts: number[], vs: number[], i0: number, i1: number, name: string | null): number {
  const t0 = ts[i0];
  const t1 = ts[i1];
  const v0 = vs[i0];
  const v1 = vs[i1];
  if (t1 <= t0) return 0;
  let worst = 0;
  for (let i = i0 + 1; i < i1; i++) {
    const x = (ts[i] - t0) / (t1 - t0);
    const f = name === null ? x : ease(EASINGS[name], x);
    worst = Math.max(worst, Math.abs(v0 + (v1 - v0) * f - vs[i]));
  }
  return worst;
}

function bestEase(ts: number[], vs: number[], i0: number, i1: number): { name: string | null; err: number } {
  let best: { name: string | null; err: number } = { name: null, err: spanError(ts, vs, i0, i1, null) };
  for (const name of Object.keys(EASINGS)) {
    const err = spanError(ts, vs, i0, i1, name);
    // ⭐ A Bezier has to be *worse* than linear to lose, not merely no better:
    // §10.4's rule is that constant speed is the exception you argue for.
    if (err < best.err - 1e-9 || (best.name === null && err <= best.err + 1e-9)) best = { name, err };
  }
  return best;
}

/** Local extrema whose swing either side clears `prominence`. */
function extrema(vs: number[], prominence: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < vs.length - 1; i++) {
    const a = vs[i] - vs[i - 1];
    const b = vs[i + 1] - vs[i];
    if (a === 0 && b === 0) continue;
    if (a >= 0 !== b > 0) {
      let left = 0;
      for (let j = i - 1; j >= 0; j--) {
        left = Math.max(left, Math.abs(vs[i] - vs[j]));
        if ((vs[j] - vs[i]) * (vs[i] - vs[i + 1]) > 0) break;
      }
      let right = 0;
      for (let j = i + 1; j < vs.length; j++) {
        right = Math.max(right, Math.abs(vs[i] - vs[j]));
        if ((vs[j] - vs[i]) * (vs[i] - vs[i - 1]) > 0) break;
      }
      if (Math.min(left, right) >= prominence) out.push(i);
    }
  }
  return out;
}

/**
 * `required` pins the boundaries of a hold.
 *
 * §10.3's *"a shipped export does not repeat a value"* is about redundant keys,
 * and a hold's two ends are not redundant: without a key where the stillness
 * begins, the span before it slopes straight through the plateau — legal under
 * the per-key tolerance and wrong in exactly the way §9.2 names ("a held pose
 * that is not held"). `check`'s per-frame column found it here on `death` f18–f26
 * before this argument existed.
 */
export function reduce(ts: number[], vs: number[], tol: number, cap = 96, required: number[] = []): Key[] {
  const n = ts.length;
  if (n === 1) return [{ t: ts[0], v: vs[0] }];
  const set = new Set<number>([0, n - 1, ...required.filter((i) => i > 0 && i < n - 1), ...extrema(vs, tol * 2)]);
  for (;;) {
    const idx = [...set].sort((a, b) => a - b);
    let worst = { err: 0, at: -1 };
    for (let k = 0; k + 1 < idx.length; k++) {
      const { err } = bestEase(ts, vs, idx[k], idx[k + 1]);
      if (err > worst.err) {
        // insert where the span is furthest off, not at its middle
        let at = -1;
        let d = -1;
        for (let i = idx[k] + 1; i < idx[k + 1]; i++) {
          const x = (ts[i] - ts[idx[k]]) / (ts[idx[k + 1]] - ts[idx[k]]);
          const name = bestEase(ts, vs, idx[k], idx[k + 1]).name;
          const f = name === null ? x : ease(EASINGS[name], x);
          const e = Math.abs(vs[idx[k]] + (vs[idx[k + 1]] - vs[idx[k]]) * f - vs[i]);
          if (e > d) {
            d = e;
            at = i;
          }
        }
        worst = { err, at };
      }
    }
    if (worst.err <= tol || worst.at < 0 || set.size >= cap) break;
    set.add(worst.at);
  }
  const idx = [...set].sort((a, b) => a - b);
  const keys: Key[] = [];
  for (let k = 0; k < idx.length; k++) {
    const key: Key = { t: ts[idx[k]], v: vs[idx[k]] };
    if (k + 1 < idx.length) {
      const name = bestEase(ts, vs, idx[k], idx[k + 1]).name;
      if (name) key.ease = name;
    }
    keys.push(key);
  }
  return keys;
}

/** Two channels keyed together, as §10.3's default paired key. */
export function reducePair(ts: number[], xs: number[], ys: number[], tol: number, required: number[] = []): { t: number; v: [number, number]; ease?: string }[] {
  const a = reduce(ts, xs, tol, 96, required);
  const b = reduce(ts, ys, tol, 96, required);
  const times = [...new Set([...a.map((k) => k.t), ...b.map((k) => k.t)])].sort((p, q) => p - q);
  const at = (arr: number[], t: number): number => arr[ts.indexOf(t)];
  const idx = times.map((t) => ts.indexOf(t));
  const out: { t: number; v: [number, number]; ease?: string }[] = [];
  for (let k = 0; k < idx.length; k++) {
    const entry: { t: number; v: [number, number]; ease?: string } = { t: times[k], v: [at(xs, times[k]), at(ys, times[k])] };
    if (k + 1 < idx.length) {
      // one shape for both channels, the way a paired key carries one curve
      let best: { name: string | null; err: number } = { name: null, err: Infinity };
      for (const name of [null, ...Object.keys(EASINGS)]) {
        const err = Math.max(spanError(ts, xs, idx[k], idx[k + 1], name), spanError(ts, ys, idx[k], idx[k + 1], name));
        if (err < best.err - 1e-9) best = { name, err };
      }
      if (best.name) entry.ease = best.name;
    }
    out.push(entry);
  }
  return out;
}
