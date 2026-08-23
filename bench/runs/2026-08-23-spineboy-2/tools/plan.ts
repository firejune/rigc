/**
 * Key placement, §10.3 and §10.4 taken literally.
 *
 * - one tolerance, declared **in frame pixels at the end of what the bone
 *   swings**, divided per bone by that bone's own lever arm (`lever.ts`);
 * - a key wherever the motion turns, and a key at both ends of a hold;
 * - two passes: pass A fits each span's own handles only to discover which
 *   shapes the shot uses, they are clustered into a table, and pass B re-plans
 *   every timeline under the table it will actually write. Fitting freely and
 *   substituting the nearest named shape afterwards is the failure §10.4 marks
 *   with a siren.
 */
import { bezier, cluster, fitHandle, LINEAR, spanError, type Handle } from './curves.ts';

export interface Timeline {
  ts: number[];
  /** one channel per value component */
  ch: number[][];
  tol: number;
}

export interface PlannedKey {
  t: number;
  v: number[];
  ease?: string;
}

function err(tl: Timeline, a: number, b: number, h: Handle | 'stepped'): number {
  let worst = 0;
  for (let c = 0; c < tl.ch.length; c++) worst = Math.max(worst, spanError(tl.ts, tl.ch[c], a, b, h));
  return worst;
}

/** §10.3: turning points and hold boundaries, before anything greedy runs. */
function seeds(tl: Timeline): number[] {
  const n = tl.ts.length;
  const out = new Set<number>([0, n - 1]);
  for (const y of tl.ch) {
    for (let i = 1; i < n - 1; i++) {
      const d0 = y[i] - y[i - 1];
      const d1 = y[i + 1] - y[i];
      if (d0 === 0 && d1 === 0) continue;
      if (d0 * d1 < 0 && Math.max(Math.abs(d0), Math.abs(d1)) > tl.tol) out.add(i);
    }
    // a hold is authored, not omitted: key its start and its end
    let a = 0;
    for (let i = 1; i <= n; i++) {
      const still = i < n && Math.abs(y[i] - y[a]) <= tl.tol / 3;
      if (!still) {
        if (i - 1 - a >= 2) {
          out.add(a);
          out.add(i - 1);
        }
        a = i;
      }
    }
  }
  return [...out].sort((x, y) => x - y);
}

export interface PlanResult {
  keys: PlannedKey[];
  handles: Handle[];
}

/** `table` null = pass A (free handles); otherwise pass B, held to the table. */
export function plan(tl: Timeline, table: { name: string; h: Handle }[] | null): PlanResult {
  const n = tl.ts.length;
  if (n === 1) return { keys: [{ t: tl.ts[0], v: tl.ch.map((c) => c[0]) }], handles: [] };
  let idx = seeds(tl);
  const chosen = new Map<number, { name?: string; h: Handle | 'stepped'; e: number }>();

  const pick = (a: number, b: number) => {
    if (b - a < 2) return { h: LINEAR as Handle | 'stepped', e: 0, name: undefined as string | undefined };
    if (table) {
      let best: { name?: string; h: Handle | 'stepped'; e: number } = { h: LINEAR, e: err(tl, a, b, LINEAR) };
      for (const t of table) {
        const e = err(tl, a, b, t.h);
        if (e < best.e - 1e-9) best = { name: t.name, h: t.h, e };
      }
      return best;
    }
    const per = tl.ch.map((c) => fitHandle(tl.ts, c, a, b));
    // one handle has to serve every channel of a paired key (§10.3)
    let best = per[0].h;
    let bestE = err(tl, a, b, best);
    for (const p of per) {
      const e = err(tl, a, b, p.h);
      if (e < bestE) {
        bestE = e;
        best = p.h;
      }
    }
    const lin = err(tl, a, b, LINEAR);
    if (lin <= bestE + 1e-9) return { h: LINEAR as Handle | 'stepped', e: lin, name: undefined };
    return { h: best as Handle | 'stepped', e: bestE, name: undefined };
  };

  for (let guard = 0; guard < 2000; guard++) {
    chosen.clear();
    let worst = -1;
    let worstAt = -1;
    for (let s = 0; s + 1 < idx.length; s++) {
      const a = idx[s];
      const b = idx[s + 1];
      const c = pick(a, b);
      chosen.set(a, c);
      if (c.e > worst) {
        worst = c.e;
        worstAt = s;
      }
    }
    if (worst <= tl.tol || worstAt < 0) break;
    const a = idx[worstAt];
    const b = idx[worstAt + 1];
    let split = -1;
    let se = -1;
    for (let i = a + 1; i < b; i++) {
      let e = 0;
      const h = chosen.get(a)!.h;
      for (let c = 0; c < tl.ch.length; c++) {
        const y = tl.ch[c];
        const u = (tl.ts[i] - tl.ts[a]) / (tl.ts[b] - tl.ts[a]);
        const pv = h === 'stepped' ? y[a] : y[a] + (y[b] - y[a]) * bezier(u, h);
        e = Math.max(e, Math.abs(pv - y[i]));
      }
      if (e > se) {
        se = e;
        split = i;
      }
    }
    if (split < 0) break;
    idx = [...idx, split].sort((x, y) => x - y);
  }

  const keys: PlannedKey[] = [];
  const handles: Handle[] = [];
  for (let s = 0; s < idx.length; s++) {
    const i = idx[s];
    const key: PlannedKey = { t: tl.ts[i], v: tl.ch.map((c) => c[i]) };
    if (s + 1 < idx.length) {
      const c = chosen.get(i);
      if (c && c.h !== 'stepped' && c.h !== LINEAR) {
        handles.push(c.h as Handle);
        if (c.name) key.ease = c.name;
      } else if (c && c.h !== 'stepped' && c.h === LINEAR) {
        // linear: no `ease` — §4.5's positive claim of constant speed
      }
    }
    keys.push(key);
  }
  return { keys, handles };
}

export function buildTable(all: Handle[], k: number): { name: string; h: Handle }[] {
  const centres = cluster(all, k);
  return centres.map((h, i) => ({ name: `ease-${String.fromCharCode(97 + i)}`, h }));
}
