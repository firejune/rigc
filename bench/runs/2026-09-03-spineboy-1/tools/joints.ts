/**
 * Triangulate every joint from `pose`'s per-part placements.
 *
 * AUTHORING §8.1: a pivot is identified only by frames whose **relative
 * rotation across that joint actually differs**, and a structural descent that
 * holds fitted poses fixed cannot recover a mis-triangulated one. So the pivots
 * are solved here, before any pose is fitted, from part template matches across
 * configurations — which is exactly what a `pose` report is.
 *
 * For parent P and child C, a joint is the one point fixed in both parts' own
 * image axes. With `pose`'s own reconstruction (fx = cx + u·cosθ − v·sinθ,
 * fy = cy + u·sinθ + v·cosθ, scale folded in):
 *
 *     c_C + s·R(θ_C)·d_C  =  c_P + s·R(θ_P)·d_P
 *
 * two equations per frame in four unknowns. Stacked over frames it is a linear
 * least squares whose conditioning IS the identifiability warning: left-multiply
 * by R(θ_P)⁻¹ and the system depends only on R(θ_C − θ_P), so frames sharing one
 * relative angle add rows and no rank. The report therefore prints the spread of
 * relative angles beside every answer, and the perturbation check MOTION.md §3.9
 * asks for.
 *
 * Robustness: `pose` places each part independently, so on a dense figure it can
 * put a near-identical pair on one limb. Those frames are outliers in this system
 * rather than noise, so the solve is trimmed — fit, drop the worst third, refit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DEG, wrap180 } from './geom.ts';
import { BONES } from './rig.ts';
import type { Table } from './collect.ts';

export interface JointSample {
  key: string;
  cpx: number;
  cpy: number;
  tp: number;
  ccx: number;
  ccy: number;
  tc: number;
  rel: number;
  weight: number;
}

export interface JointSolve {
  parent: string;
  child: string;
  /** Child's pivot as an image offset from the child art's own centre. */
  dc: [number, number];
  /** The same point as an image offset from the parent art's centre. */
  dp: [number, number];
  n: number;
  /** Root-mean-square frame-pixel closure error over the kept samples. */
  rms: number;
  /** Spread of the relative angle across the joint, degrees — the conditioning. */
  relSpread: number;
  relMin: number;
  relMax: number;
  /** How far the answer moves when every placement is perturbed by a pixel. */
  jitter: number;
}

const SCALE = 0.222973;

/** Least squares for [dc, dp] from samples, in frame pixels. */
function solve(samples: JointSample[], scale: number): { d: number[]; residuals: number[] } {
  // A·x = b with x = [dcu, dcv, dpu, dpv]
  const ata = new Float64Array(16);
  const atb = new Float64Array(4);
  const rowsOf = (s: JointSample): [number[], number[], number, number] => {
    const cc = Math.cos(s.tc * DEG) * scale;
    const sc = Math.sin(s.tc * DEG) * scale;
    const cp = Math.cos(s.tp * DEG) * scale;
    const sp = Math.sin(s.tp * DEG) * scale;
    // fx: dcu·cc − dcv·sc − dpu·cp + dpv·sp = cpx − ccx
    // fy: dcu·sc + dcv·cc − dpu·sp − dpv·cp = cpy − ccy
    return [
      [cc, -sc, -cp, sp],
      [sc, cc, -sp, -cp],
      s.cpx - s.ccx,
      s.cpy - s.ccy,
    ];
  };
  for (const s of samples) {
    const [r1, r2, b1, b2] = rowsOf(s);
    for (const [r, b] of [
      [r1, b1],
      [r2, b2],
    ] as [number[], number][]) {
      const w = s.weight;
      for (let i = 0; i < 4; i++) {
        atb[i] += w * r[i] * b;
        for (let j = 0; j < 4; j++) ata[i * 4 + j] += w * r[i] * r[j];
      }
    }
  }
  const d = gauss(ata, atb);
  const residuals = samples.map((s) => {
    const [r1, r2, b1, b2] = rowsOf(s);
    const e1 = r1[0] * d[0] + r1[1] * d[1] + r1[2] * d[2] + r1[3] * d[3] - b1;
    const e2 = r2[0] * d[0] + r2[1] * d[1] + r2[2] * d[2] + r2[3] * d[3] - b2;
    return Math.hypot(e1, e2);
  });
  return { d, residuals };
}

/** 4x4 solve with partial pivoting and a ridge, so a rank-deficient joint still returns. */
function gauss(ataIn: Float64Array, atbIn: Float64Array): number[] {
  const n = 4;
  const a = Array.from({ length: n }, (_, i) => {
    const row: number[] = [];
    for (let j = 0; j < n; j++) row.push(ataIn[i * n + j] + (i === j ? 1e-9 : 0));
    row.push(atbIn[i]);
    return row;
  });
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    [a[c], a[piv]] = [a[piv], a[c]];
    const p = a[c][c];
    if (Math.abs(p) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c] / p;
      for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  return Array.from({ length: n }, (_, i) => (Math.abs(a[i][i]) < 1e-12 ? 0 : a[i][n] / a[i][i]));
}

export interface Reliability {
  res: number;
  unexp: number;
}

export function samplesFor(
  table: Table,
  parent: string,
  child: string,
  gate: Reliability,
  onlySets?: RegExp,
): JointSample[] {
  const out: JointSample[] = [];
  for (const [key, row] of Object.entries(table)) {
    if (onlySets && !onlySets.test(key)) continue;
    const p = row[parent];
    const c = row[child];
    if (!p || !c) continue;
    if (p.res > gate.res || c.res > gate.res) continue;
    if (p.unexp > gate.unexp || c.unexp > gate.unexp) continue;
    out.push({
      key,
      cpx: p.x,
      cpy: p.y,
      tp: p.rot,
      ccx: c.x,
      ccy: c.y,
      tc: c.rot,
      rel: wrap180(c.rot - p.rot),
      weight: 1,
    });
  }
  return out;
}

export function triangulate(samples: JointSample[], parent: string, child: string): JointSolve {
  let keep = samples.slice();
  let d: number[] = [0, 0, 0, 0];
  let residuals: number[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const r = solve(keep, SCALE);
    d = r.d;
    residuals = r.residuals;
    if (pass === 2 || keep.length < 8) break;
    const order = residuals.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const cut = Math.max(6, Math.floor(order.length * 0.67));
    keep = order.slice(0, cut).map(([, i]) => keep[i]);
  }
  const rms = Math.sqrt(residuals.reduce((a, b) => a + b * b, 0) / Math.max(1, residuals.length));
  const rels = keep.map((s) => s.rel);
  // Conditioning, MOTION.md §3.9's own check: re-solve from placements pushed a
  // pixel in a fixed direction and see how far the pivot moves.
  const jittered = keep.map((s) => ({ ...s, ccx: s.ccx + 1, cpy: s.cpy + 1 }));
  const j = solve(jittered, SCALE).d;
  const jitter = Math.max(Math.hypot(j[0] - d[0], j[1] - d[1]), Math.hypot(j[2] - d[2], j[3] - d[3]));
  return {
    parent,
    child,
    dc: [d[0], d[1]],
    dp: [d[2], d[3]],
    n: keep.length,
    rms,
    relSpread: rels.length ? Math.max(...rels) - Math.min(...rels) : 0,
    relMin: rels.length ? Math.min(...rels) : 0,
    relMax: rels.length ? Math.max(...rels) : 0,
    jitter,
  };
}

if (import.meta.main) {
  const table: Table = JSON.parse(
    readFileSync(process.argv[2] ?? 'bench/runs/2026-09-03-spineboy-1/fit/placements.json', 'utf8'),
  );
  const gate = { res: Number(process.argv[4] ?? 0.16), unexp: Number(process.argv[5] ?? 0.4) };
  const out: JointSolve[] = [];
  for (const [child, parent] of BONES) {
    if (parent === null || parent === 'root') continue;
    if (child === 'muzzle') continue; // no committed frame places a flare part
    const samples = samplesFor(table, parent, child, gate);
    if (samples.length < 6) {
      console.log(`SKIP  ${parent} -> ${child}: only ${samples.length} reliable frame(s)`);
      continue;
    }
    const s = triangulate(samples, parent, child);
    out.push(s);
    console.log(
      `${parent.padEnd(16)} -> ${child.padEnd(16)} n=${String(s.n).padStart(3)} ` +
        `rel ${s.relMin.toFixed(0)}..${s.relMax.toFixed(0)} (${s.relSpread.toFixed(0)}°)  ` +
        `rms ${s.rms.toFixed(2)}px  jitter ${s.jitter.toFixed(1)}px  ` +
        `child-pivot ${s.dc[0].toFixed(1)},${s.dc[1].toFixed(1)}  parent-pivot ${s.dp[0].toFixed(1)},${s.dp[1].toFixed(1)}`,
    );
  }
  const dest = process.argv[3] ?? 'bench/runs/2026-09-03-spineboy-1/fit/joints.json';
  writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log(`-> ${dest}`);
}
