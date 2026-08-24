/**
 * Solve each joint as the point fixed in BOTH the parent's and the child's art
 * frame: for every frame f, C_P + R(t_P) aP = C_C + R(t_C) aC. Linear in
 * (aP, aC), so a least squares over many frames identifies the pivot without
 * anybody eyeballing where a knee is.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PARENT } from './parts.ts';

/** the thighs hang off an art-less `hip`; solve them against the torso instead. */
const SOLVE_PARENT: Record<string, string> = { ...PARENT, 'front-thigh': 'torso', 'rear-thigh': 'torso' };

const V = JSON.parse(readFileSync('bench/reference/spineboy/ess/frames.json', 'utf8')).viewport;
export const SCALE = V.scale as number;
export const toWorld = (px: number, py: number): [number, number] => [V.x + px / SCALE, V.y + V.height - py / SCALE];

export interface M { x: number; y: number; deg: number; residual: number; vis: number }
export type Matches = Record<string, Record<string, M>>;

/** part world pose on a frame: centre (world) and rotation (spine degrees, CCW y-up). */
export function poseOf(m: M): { c: [number, number]; th: number } {
  return { c: toWorld(m.x, m.y), th: -m.deg };
}
const rot = (th: number): [number, number] => [Math.cos((th * Math.PI) / 180), Math.sin((th * Math.PI) / 180)];

/** Solve 4x4 normal equations for (aPx, aPy, aCx, aCy). */
export function solveJoint(rows: { p: M; c: M }[]): { aP: [number, number]; aC: [number, number]; rms: number } {
  const N = 4;
  const AtA = Array.from({ length: N }, () => new Float64Array(N));
  const Atb = new Float64Array(N);
  const push = (row: number[], rhs: number) => {
    for (let i = 0; i < N; i++) { for (let j = 0; j < N; j++) AtA[i][j] += row[i] * row[j]; Atb[i] += row[i] * rhs; }
  };
  for (const { p, c } of rows) {
    const P = poseOf(p), C = poseOf(c);
    const [cp, sp] = rot(P.th), [cc, sc] = rot(C.th);
    // x: Px + cp*aPx - sp*aPy - Cx - cc*aCx + sc*aCy = 0
    push([cp, -sp, -cc, sc], C.c[0] - P.c[0]);
    push([sp, cp, -sc, -cc], C.c[1] - P.c[1]);
  }
  // gaussian elimination
  const A = AtA.map((r, i) => [...r, Atb[i]]);
  for (let i = 0; i < N; i++) {
    let piv = i;
    for (let k = i + 1; k < N; k++) if (Math.abs(A[k][i]) > Math.abs(A[piv][i])) piv = k;
    [A[i], A[piv]] = [A[piv], A[i]];
    if (Math.abs(A[i][i]) < 1e-9) continue;
    for (let k = 0; k < N; k++) { if (k === i) continue; const f = A[k][i] / A[i][i]; for (let j = i; j <= N; j++) A[k][j] -= f * A[i][j]; }
  }
  const x = Array.from({ length: N }, (_, i) => (Math.abs(A[i][i]) < 1e-9 ? 0 : A[i][N] / A[i][i]));
  const aP: [number, number] = [x[0], x[1]], aC: [number, number] = [x[2], x[3]];
  let acc = 0;
  for (const { p, c } of rows) {
    const P = poseOf(p), C = poseOf(c);
    const [cp, sp] = rot(P.th), [cc, sc] = rot(C.th);
    const jx = P.c[0] + cp * aP[0] - sp * aP[1] - (C.c[0] + cc * aC[0] - sc * aC[1]);
    const jy = P.c[1] + sp * aP[0] + cp * aP[1] - (C.c[1] + sc * aC[0] + cc * aC[1]);
    acc += jx * jx + jy * jy;
  }
  return { aP, aC, rms: Math.sqrt(acc / Math.max(1, rows.length)) };
}

if (import.meta.main) {
  const matches: Matches = JSON.parse(readFileSync(process.argv[2] ?? 'work/matches.json', 'utf8'));
  const frames = Object.keys(matches);
  const out: Record<string, { aP: number[]; aC: number[]; rms: number; n: number }> = {};
  for (const [child, parent] of Object.entries(SOLVE_PARENT)) {
    if (parent === 'hip') continue;
    let rows = frames
      .filter((f) => matches[f][parent] && matches[f][child])
      .map((f) => ({ f, p: matches[f][parent], c: matches[f][child] }))
      .filter((r) => r.p.vis > 0.55 && r.c.vis > 0.55);
    if (rows.length < 4) { console.log(child.padEnd(20), 'too few rows', rows.length); continue; }
    let sol = solveJoint(rows);
    // two robust passes: drop the worst quarter, re-solve
    for (let it = 0; it < 3 && rows.length > 6; it++) {
      const err = rows.map((r) => {
        const s = solveJoint([r]);
        const one = solveJoint(rows);
        void s; void one;
        return 0;
      });
      void err;
      const resid = rows.map((r) => {
        const P = poseOf(r.p), C = poseOf(r.c);
        const [cp, sp] = rot(P.th), [cc, sc] = rot(C.th);
        const jx = P.c[0] + cp * sol.aP[0] - sp * sol.aP[1] - (C.c[0] + cc * sol.aC[0] - sc * sol.aC[1]);
        const jy = P.c[1] + sp * sol.aP[0] + cp * sol.aP[1] - (C.c[1] + sc * sol.aC[0] + cc * sol.aC[1]);
        return Math.hypot(jx, jy);
      });
      const order = resid.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
      const keep = order.slice(0, Math.max(6, Math.floor(rows.length * 0.75))).map(([, i]) => i).sort((a, b) => a - b);
      rows = keep.map((i) => rows[i]);
      sol = solveJoint(rows);
    }
    out[child] = { aP: sol.aP, aC: sol.aC, rms: sol.rms, n: rows.length };
    console.log(child.padEnd(20), `parent-local (${sol.aP[0].toFixed(1)}, ${sol.aP[1].toFixed(1)})`.padEnd(30), `child-local (${sol.aC[0].toFixed(1)}, ${sol.aC[1].toFixed(1)})`.padEnd(30), `rms ${sol.rms.toFixed(2)}u  n=${rows.length}`);
  }
  writeFileSync('work/joints.json', JSON.stringify(out, null, 1));
}
