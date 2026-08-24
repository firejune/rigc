/**
 * Reduce a fitted pose-per-frame series to keys (§10.3): one tolerance in
 * PIXELS at the end of what each bone swings, converted per bone by its own
 * lever arm; turning points forced; spans planned under the easing table that
 * will actually be written (§10.4, two passes).
 */
import { bezierY, candidateTable, type Handles } from './curves.ts';

export interface Series { times: number[]; values: number[] }
export interface Key { t: number; v: number; ease?: string }

/** error of one span under one shape, at the interior sample times */
export function spanError(s: Series, a: number, b: number, h: Handles | null): number {
  const t0 = s.times[a], t1 = s.times[b], v0 = s.values[a], v1 = s.values[b];
  if (t1 <= t0) return 0;
  let worst = 0;
  for (let i = a + 1; i < b; i++) {
    const x = (s.times[i] - t0) / (t1 - t0);
    const y = h ? bezierY(h, x) : x;
    worst = Math.max(worst, Math.abs(v0 + (v1 - v0) * y - s.values[i]));
  }
  return worst;
}

/**
 * Indices that must carry a key: the ends, every change of direction, and BOTH
 * ENDS OF EVERY HOLD.
 *
 * The hold is §10.3's rule and it is not the same as the tolerance. Two keys of
 * equal value are the only way to say "nothing moves here" on an interpolated
 * timeline; a greedy span is free to run straight through a plateau as long as
 * it stays inside the per-bone tolerance, which authors a slope where the shot
 * holds. That is invisible to the gate, to `diff` and to the aggregate MAE, and
 * `check`'s per-frame column is the only thing that sees it — on `death`'s
 * nine still frames it read `the reference holds still here and yours does not`
 * on every pair, at 123-154 px each, with the POSES already identical.
 *
 * A plateau here is exact equality, which is what the pose series carries where
 * the reference frames themselves do not change (work/settle.ts). Slow motion
 * inside the tolerance is not a hold and is deliberately not caught by this.
 */
export function turningPoints(s: Series, eps: number): number[] {
  const n = s.values.length;
  const idx = new Set<number>([0, n - 1]);
  let dir = 0;
  for (let i = 1; i < n; i++) {
    const d = s.values[i] - s.values[i - 1];
    if (Math.abs(d) <= eps) continue;
    const nd = d > 0 ? 1 : -1;
    if (dir !== 0 && nd !== dir) idx.add(i - 1);
    dir = nd;
  }
  for (let a = 0; a < n - 1; ) {
    let b = a;
    while (b + 1 < n && s.values[b + 1] === s.values[b]) b++;
    if (b > a) { idx.add(a); idx.add(b); }
    a = b + 1;
  }
  return [...idx].sort((a, b) => a - b);
}

/**
 * Spine's automatic handles for one span (§10.4: "first apply automatic handles,
 * then adjust them manually only if necessary"): the tangent at each end is the
 * slope the keys on either side imply, converted into the normalised handle the
 * JSON format holds. This is what makes the curve KIND come from what the motion
 * does rather than from how far apart two keys landed — a planner that tries
 * linear first writes the one shape a hand-animated reference almost never has.
 */
export function autoHandles(s: Series, a: number, b: number): Handles {
  const t0 = s.times[a], t1 = s.times[b], v0 = s.values[a], v1 = s.values[b];
  const dt = t1 - t0, dv = v1 - v0;
  if (dt <= 0 || Math.abs(dv) < 1e-9) return [1 / 3, 1 / 3, 2 / 3, 2 / 3];
  const prev = a > 0 ? a - 1 : a;
  const next = b < s.values.length - 1 ? b + 1 : b;
  const mOut = prev === a ? dv / dt : (v1 - s.values[prev]) / (t1 - s.times[prev]);
  const mIn = next === b ? dv / dt : (s.values[next] - v0) / (s.times[next] - t0);
  const clamp = (y: number) => Math.max(-0.4, Math.min(1.4, y));
  return [1 / 3, clamp((mOut * (dt / 3)) / dv), 2 / 3, clamp(1 - (mIn * (dt / 3)) / dv)];
}
export function nearest(h: Handles, table: Record<string, Handles>): string | null {
  let best: string | null = null, bd = Infinity;
  for (const [n, t] of Object.entries(table)) {
    const d = (h[0] - t[0]) ** 2 + (h[1] - t[1]) ** 2 + (h[2] - t[2]) ** 2 + (h[3] - t[3]) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

export function planTimeline(s: Series, tol: number, table: Record<string, Handles>): Key[] {
  const n = s.values.length;
  if (n === 0) return [];
  if (n === 1) return [{ t: s.times[0], v: s.values[0] }];
  const forced = new Set(turningPoints(s, tol * 0.5));
  const names = Object.keys(table);
  const keys: Key[] = [];
  let a = 0;
  while (a < n - 1) {
    let bestB = a + 1, bestEase: string | undefined;
    for (let b = a + 1; b < n; b++) {
      // a forced index strictly inside the span ends it
      let blocked = false;
      for (let i = a + 1; i < b; i++) if (forced.has(i)) { blocked = true; break; }
      if (blocked) break;
      // §10.4: the shape comes from the automatic handles, snapped to the table
      // that will actually be written. Linear is the exception, taken only when
      // that is what the auto handles themselves say.
      let ok: string | undefined | null = null;
      const auto = nearest(autoHandles(s, a, b), table);
      if (auto && spanError(s, a, b, table[auto]) <= tol) ok = auto;
      else {
        let bestErr = Infinity, bestName: string | undefined;
        for (const nm of names) {
          const e = spanError(s, a, b, table[nm]);
          if (e < bestErr) { bestErr = e; bestName = nm; }
        }
        if (bestErr <= tol) ok = bestName;
        else if (spanError(s, a, b, null) <= tol) ok = undefined;
      }
      if (ok === null) break;
      bestB = b; bestEase = ok;
    }
    keys.push({ t: s.times[a], v: s.values[a], ...(bestEase ? { ease: bestEase } : {}) });
    a = bestB;
  }
  keys.push({ t: s.times[n - 1], v: s.values[n - 1] });
  return keys;
}

/** pass A: which shapes does this shot actually use? */
export function discoverTable(all: { s: Series; tol: number }[], size: number): Record<string, Handles> {
  const cand = candidateTable();
  const use = new Map<string, number>();
  for (const { s, tol } of all) for (const k of planTimeline(s, tol, cand)) if (k.ease) use.set(k.ease, (use.get(k.ease) ?? 0) + 1);
  const top = [...use.entries()].sort((a, b) => b[1] - a[1]).slice(0, size);
  const out: Record<string, Handles> = {};
  for (const [n] of top) out[n] = cand[n];
  return out;
}

/**
 * §10.3's default form for a bone that moves on both axes: ONE translate
 * timeline carrying both channels, keyed at the union of what either channel
 * needs, with one curve shape per key.
 *
 * Spine's own default is the paired key — *"each translate, scale, and shear
 * key for a bone sets both X and Y. This is sufficient for many animations and
 * reduces the number of timelines"* — and the Separate checkbox is for a bone
 * whose axes need different times or different curves. A planner that reduces
 * each axis under its own tolerance produces the Separate form on almost every
 * shot **by construction**, which is the editor's exception standing in for its
 * default. Measured here: of eight shots only `aim` (one key) came out with the
 * two axes on the same times.
 */
export interface PairKey { t: number; v: [number, number]; ease?: string }
export function planPaired(sx: Series, sy: Series, tolX: number, tolY: number, table: Record<string, Handles>): PairKey[] {
  const n = sx.values.length;
  if (n === 0) return [];
  if (n === 1) return [{ t: sx.times[0], v: [sx.values[0], sy.values[0]] }];
  const forced = new Set<number>([...turningPoints(sx, tolX * 0.5), ...turningPoints(sy, tolY * 0.5)]);
  const names = Object.keys(table);
  const fits = (a: number, b: number, h: Handles | null) =>
    spanError(sx, a, b, h) <= tolX && spanError(sy, a, b, h) <= tolY;
  const keys: PairKey[] = [];
  let a = 0;
  while (a < n - 1) {
    let bestB = a + 1, bestEase: string | undefined;
    for (let b = a + 1; b < n; b++) {
      let blocked = false;
      for (let i = a + 1; i < b; i++) if (forced.has(i)) { blocked = true; break; }
      if (blocked) break;
      // the shape is chosen for the channel that swings furthest, then checked
      // against both — one key carries one curve for the pair.
      const lead = Math.abs(sx.values[b] - sx.values[a]) >= Math.abs(sy.values[b] - sy.values[a]) ? sx : sy;
      let ok: string | undefined | null = null;
      const auto = nearest(autoHandles(lead, a, b), table);
      if (auto && fits(a, b, table[auto])) ok = auto;
      else {
        let bestName: string | undefined, found = false;
        for (const nm of names) if (fits(a, b, table[nm])) { bestName = nm; found = true; break; }
        if (found) ok = bestName;
        else if (fits(a, b, null)) ok = undefined;
      }
      if (ok === null) break;
      bestB = b; bestEase = ok;
    }
    keys.push({ t: sx.times[a], v: [sx.values[a], sy.values[a]], ...(bestEase ? { ease: bestEase } : {}) });
    a = bestB;
  }
  keys.push({ t: sx.times[n - 1], v: [sx.values[n - 1], sy.values[n - 1]] });
  return keys;
}
