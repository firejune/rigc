export type Vec = number[];
export type Handles = [number,number,number,number];

/** Evaluate the normalised cubic bezier y at x (Newton + bisection fallback). */
export function bezY(h: Handles, x: number): number {
  const [x1,y1,x2,y2] = h;
  const bx = (t:number) => 3*(1-t)*(1-t)*t*x1 + 3*(1-t)*t*t*x2 + t*t*t;
  const by = (t:number) => 3*(1-t)*(1-t)*t*y1 + 3*(1-t)*t*t*y2 + t*t*t;
  let lo=0, hi=1, t=x;
  for (let i=0;i<40;i++) { const v=bx(t); if (v<x) lo=t; else hi=t; t=(lo+hi)/2; }
  return by(t);
}
export const LINEAR: Handles = [1/3, 1/3, 2/3, 2/3];

export function autoHandles(t: number[], v: number[], i: number, j: number): Handles {
  const dt = t[j]-t[i], dv = v[j]-v[i];
  if (Math.abs(dv) < 1e-12) return [1/3, 0, 2/3, 1];
  const mi = i===0 ? (v[i+1]-v[i])/(t[i+1]-t[i]) : (v[i+1]-v[i-1])/(t[i+1]-t[i-1]);
  const mj = j===v.length-1 ? (v[j]-v[j-1])/(t[j]-t[j-1]) : (v[j+1]-v[j-1])/(t[j+1]-t[j-1]);
  const cl = (x:number)=>Math.max(-3,Math.min(4,x));
  return [1/3, cl(mi*dt/dv/3), 2/3, cl(1 - mj*dt/dv/3)];
}

/** Worst deviation of a span under handles `h`, in the channel's own units (max over channels). */
export function spanDev(t: number[], chans: number[][], i: number, j: number, h: Handles, weight: number[]): number {
  let worst = 0;
  for (let k=i+1;k<j;k++) {
    const x = (t[k]-t[i])/(t[j]-t[i]);
    const y = bezY(h, x);
    let d2 = 0;
    for (let c=0;c<chans.length;c++) {
      const v = chans[c][i] + (chans[c][j]-chans[c][i])*y;
      const e = (v - chans[c][k]) * weight[c];
      d2 += e*e;
    }
    worst = Math.max(worst, Math.sqrt(d2));
  }
  return worst;
}

/** Fit handles freely for one span (coordinate descent from the automatic handles). */
export function fitHandles(t: number[], chans: number[][], i: number, j: number, weight: number[]): Handles {
  let h = autoHandles(t, chans[0], i, j);
  let best = spanDev(t, chans, i, j, h, weight);
  for (const st of [0.4, 0.15, 0.05, 0.015, 0.005]) for (let it=0; it<40; it++) {
    let imp = false;
    for (let k=0;k<4;k++) for (const d of [st,-st]) {
      const q = h.slice() as Handles; q[k]+=d;
      if (q[0]<0||q[0]>1||q[2]<0||q[2]>1) continue;
      const e = spanDev(t, chans, i, j, q, weight);
      if (e < best - 1e-12) { best = e; h = q; imp = true; }
    }
    if (!imp) break;
  }
  return h;
}

export type Key = { i: number; ease: string | null };
/** Greedy span planning under a fixed table. */
export function stepPx(chans: number[][], weight: number[], a: number, b: number): number {
  let d2 = 0;
  for (let c=0;c<chans.length;c++) { const e = (chans[c][b]-chans[c][a])*weight[c]; d2 += e*e; }
  return Math.sqrt(d2);
}
/** The smallest single-frame move inside a span, in px — a relative floor on the tolerance. */
export function minStep(chans: number[][], weight: number[], i: number, j: number): number {
  let m = Infinity;
  for (let k=i;k<j;k++) m = Math.min(m, stepPx(chans, weight, k, k+1));
  return m;
}
export function planKeys(
  t: number[], chans: number[][], tol: number, forced: Set<number>,
  table: Record<string, Handles>, weight: number[], rel = 1,
): Key[] {
  const n = t.length;
  const out: Key[] = [];
  const names = Object.keys(table);
  const pick = (i:number,j:number): { ease: string|null, dev: number } => {
    if (j === i+1) {
      // no interior sample: the automatic handles snapped to the nearest table entry (AUTHORING §10.4)
      const a = autoHandles(t, chans[0], i, j);
      let bn = names[0], bd = Infinity;
      for (const nm of names) { const h=table[nm];
        const d = (h[0]-a[0])**2+(h[1]-a[1])**2+(h[2]-a[2])**2+(h[3]-a[3])**2;
        if (d < bd) { bd = d; bn = nm; } }
      return { ease: bn, dev: 0 };
    }
    let bn: string|null = null, bd = Infinity;
    for (const nm of names) { const d = spanDev(t, chans, i, j, table[nm], weight); if (d < bd) { bd = d; bn = nm; } }
    return { ease: bn, dev: bd };
  };
  let i = 0;
  while (i < n-1) {
    let bestJ = i+1, bestEase = pick(i, i+1).ease;
    for (let j = i+2; j < n; j++) {
      if (forced.has(j-1)) break;
      const p = pick(i, j);
      // absolute tolerance AND a relative floor: a span may not err by more than the
      // smallest single-frame move inside it, or a slow span reads as a fast one
      const cap = Math.min(tol, rel * minStep(chans, weight, i, j));
      if (p.dev > cap) break;
      bestJ = j; bestEase = p.ease;
    }
    out.push({ i, ease: bestEase });
    i = bestJ;
  }
  out.push({ i: n-1, ease: null });
  return out;
}

/** Series ends, turning points, and both ends of every run of EXACTLY equal values (§10.3). */
export function forcedIndices(chans: number[][]): Set<number> {
  const n = chans[0].length;
  const f = new Set<number>([0, n-1]);
  const same = (a:number,b:number) => chans.every(c => c[a] === c[b]);
  for (let i=1;i<n-1;i++) {
    for (const c of chans) {
      const d1 = c[i]-c[i-1], d2 = c[i+1]-c[i];
      if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) { f.add(i); break; }
    }
  }
  for (let i=0;i<n-1;i++) {
    if (same(i, i+1)) {
      let j = i; while (j+1 < n && same(j, j+1)) j++;
      f.add(i); f.add(j); i = j-1;
    }
  }
  return f;
}

/** k-means over 4-D handle vectors. */
export function clusterHandles(samples: Handles[], k: number): Handles[] {
  if (samples.length <= k) return samples.slice();
  const cents: Handles[] = [];
  const step = samples.length / k;
  const sorted = samples.slice().sort((a,b)=>(a[1]+a[3])-(b[1]+b[3]));
  for (let i=0;i<k;i++) cents.push(sorted[Math.floor(i*step)].slice() as Handles);
  for (let it=0; it<60; it++) {
    const buckets: Handles[][] = cents.map(()=>[]);
    for (const s of samples) {
      let bi=0, bd=Infinity;
      cents.forEach((c,ci)=>{ const d=(c[0]-s[0])**2+(c[1]-s[1])**2+(c[2]-s[2])**2+(c[3]-s[3])**2; if(d<bd){bd=d;bi=ci;} });
      buckets[bi].push(s);
    }
    let moved = 0;
    buckets.forEach((b,bi)=>{ if(!b.length) return;
      const m: Handles = [0,0,0,0];
      for (const s of b) for (let c=0;c<4;c++) m[c]+=s[c]/b.length;
      for (let c=0;c<4;c++) { moved += Math.abs(m[c]-cents[bi][c]); cents[bi][c]=m[c]; } });
    if (moved < 1e-9) break;
  }
  return cents;
}
