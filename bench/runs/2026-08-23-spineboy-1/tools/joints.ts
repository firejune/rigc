/**
 * Solve each joint as the point two parts hold in common across the whole shot.
 *
 * For a parent `p` and a child `c`, a joint is a point `a` fixed in the parent's
 * own frame and a point `b` fixed in the child's that land on each other on
 * every frame:
 *
 *     R(θpᶠ)·a + tpᶠ  =  R(θcᶠ)·b + tcᶠ      for every frame f
 *
 * which is linear in (a, b) — two rows per frame, four unknowns — so it is one
 * least-squares solve and not a search. Frames where the two parts barely turn
 * relative to each other say nothing about where the pivot is; frames where they
 * turn a lot pin it. Two reweighting rounds drop the frames where a part was
 * occluded and the relax left it where it was.
 *
 *   bun … tools/joints.ts <relax.json> <setup.json> <out.json>
 */
import { writeFileSync } from 'node:fs';
import { loadSetup } from './model.ts';
import { DEG, type Placement } from './lib.ts';

const PAIRS: [string, string][] = [
  ['torso', 'head'],
  ['torso', 'front-upper-arm'],
  ['front-upper-arm', 'front-bracer'],
  ['front-bracer', 'front-fist'],
  ['torso', 'rear-upper-arm'],
  ['rear-upper-arm', 'rear-bracer'],
  ['rear-bracer', 'gun'],
  ['torso', 'front-thigh'],
  ['front-thigh', 'front-shin'],
  ['front-shin', 'front-foot'],
  ['torso', 'rear-thigh'],
  ['rear-thigh', 'rear-shin'],
  ['rear-shin', 'rear-foot'],
];

const [relaxFile, setupFile, out] = process.argv.slice(2);
const relax = JSON.parse(await Bun.file(relaxFile).text()) as Record<
  string,
  { index: number; free: Placement[] }[]
>;
const setup = await loadSetup(setupFile);
const setupOf = (name: string) => setup.find((p) => p.part === name)!;

interface Sample {
  set: string;
  index: number;
  p: Placement;
  c: Placement;
}
const samples: Sample[] = [];
for (const [set, rows] of Object.entries(relax))
  for (const row of rows) samples.push(...[{ set, index: row.index, p: row.free[0], c: row.free[0] }].slice(0, 0)),
    void row;

function solve4(rows: number[][], rhs: number[], w: number[]): number[] {
  const A = Array.from({ length: 4 }, () => new Array(4).fill(0));
  const b = new Array(4).fill(0);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const wi = w[i];
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 4; k++) A[j][k] += wi * r[j] * r[k];
      b[j] += wi * r[j] * rhs[i];
    }
  }
  for (let j = 0; j < 4; j++) A[j][j] += 1e-6;
  // Gaussian elimination
  for (let col = 0; col < 4; col++) {
    let piv = col;
    for (let r = col + 1; r < 4; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = col + 1; r < 4; r++) {
      const f = A[r][col] / A[col][col];
      for (let k = col; k < 4; k++) A[r][k] -= f * A[col][k];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(4).fill(0);
  for (let r = 3; r >= 0; r--) {
    let sum = b[r];
    for (let k = r + 1; k < 4; k++) sum -= A[r][k] * x[k];
    x[r] = sum / A[r][r];
  }
  return x;
}

const solved: Record<string, [number, number]> = {};
const report: string[] = [];
for (const [parent, child] of PAIRS) {
  const rows: number[][] = [];
  const rhs: number[] = [];
  const tags: string[] = [];
  for (const [set, list] of Object.entries(relax)) {
    for (const row of list) {
      const p = row.free.find((q) => q.part === parent);
      const c = row.free.find((q) => q.part === child);
      if (!p || !c) continue;
      const cp = Math.cos(p.rot * DEG);
      const sp = Math.sin(p.rot * DEG);
      const cc = Math.cos(c.rot * DEG);
      const sc = Math.sin(c.rot * DEG);
      rows.push([cp, -sp, -cc, sc]);
      rhs.push(c.cx - p.cx);
      tags.push(`${set}/f${row.index}`);
      rows.push([sp, cp, -sc, -cc]);
      rhs.push(c.cy - p.cy);
      tags.push(`${set}/f${row.index}`);
    }
  }
  let w = rows.map(() => 1);
  let x = solve4(rows, rhs, w);
  for (let round = 0; round < 3; round++) {
    const res = rows.map((r, i) => Math.abs(r[0] * x[0] + r[1] * x[1] + r[2] * x[2] + r[3] * x[3] - rhs[i]));
    const sorted = [...res].sort((a, b) => a - b);
    const cut = sorted[Math.floor(sorted.length * 0.75)];
    w = res.map((v) => (v <= cut ? 1 : (cut / Math.max(v, 1e-6)) ** 2));
    x = solve4(rows, rhs, w);
  }
  const res = rows.map((r, i) => Math.abs(r[0] * x[0] + r[1] * x[1] + r[2] * x[2] + r[3] * x[3] - rhs[i]));
  const kept = res.filter((_, i) => w[i] > 0.5);
  const rms = Math.sqrt(kept.reduce((s, v) => s + v * v, 0) / Math.max(1, kept.length));
  const sp = setupOf(parent);
  const cpo = Math.cos(sp.rot * DEG);
  const spo = Math.sin(sp.rot * DEG);
  const jx = sp.cx + x[0] * cpo - x[1] * spo;
  const jy = sp.cy + x[0] * spo + x[1] * cpo;
  solved[child] = [+jx.toFixed(2), +jy.toFixed(2)];
  report.push(
    `${parent.padEnd(17)} → ${child.padEnd(17)} joint ${jx.toFixed(1)}, ${jy.toFixed(1)}   rms ${rms.toFixed(2)} units over ${rows.length / 2} frames`,
  );
}
for (const line of report) console.log(line);
writeFileSync(out, JSON.stringify(solved, null, 1));
console.log(`wrote ${out}`);
void samples;
