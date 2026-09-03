/**
 * Triangulate a joint from two parts' placements across CONFIGURATIONS.
 *
 * AUTHORING §8.1: "Triangulate a joint from part template matches across
 * configurations, not from the whole-figure objective. Match the two parts the
 * joint connects — each is its own art file and its own reading — on frames that
 * put the joint in genuinely different relative angles, and solve for the one
 * point that is fixed in both parts' own coordinates."
 *
 * The solve is linear. With `u = a - centreA` and `v = b - centreB`,
 * `s·R(θA,i)·u − s·R(θB,i)·v = cB,i − cA,i` is two equations per frame in four
 * unknowns, so two frames determine it and more condition it.
 *
 * Both of §8.1's checks are implemented rather than described:
 *  - the conditioning check — re-solve from the subset that EXCLUDES the most
 *    angularly diverse frames and report how far the answer moves;
 *  - the self-agreement check — reconstruct the joint from each frame
 *    separately and report the spread.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { geometryOf } from './art';

const RAD = Math.PI / 180;

export interface Reading {
  set: string;
  a: { x: number; y: number; rotationDeg: number; scale: number; residual: number };
  b: { x: number; y: number; rotationDeg: number; scale: number; residual: number };
}

/** Solve a 4x4 by Gaussian elimination with partial pivoting. */
function solve4(m: number[][], rhs: number[]): number[] {
  const n = 4;
  const a = m.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    [a[col], a[piv]] = [a[piv], a[col]];
    if (Math.abs(a[col][col]) < 1e-12) throw new Error('singular joint system — the frames do not condition this pivot');
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let k = col; k <= n; k++) a[r][k] -= f * a[col][k];
    }
  }
  return a.map((row) => row[n] / row[row.indexOf(row.find((v, i) => i < n && Math.abs(v) > 1e-12) as number)]).map((_, i) => a[i][n] / a[i][i]);
}

export interface JointSolve {
  /** The joint in part A's own image pixels. */
  inA: [number, number];
  /** The joint in part B's own image pixels. */
  inB: [number, number];
  /** Residual of the fit, in frame pixels, rms over the frames used. */
  rms: number;
  frames: number;
  /** Relative rotation across the joint, per frame, in screen degrees. */
  relative: number[];
  /**
   * The worst single frame's disagreement between the two reconstructions, in
   * frame pixels — MOTION.md §3.9's self-agreement check.
   *
   * ⚠️ NOT the spread of the reconstructed point across frames: the figure
   * itself travels, so that spread is a fact about the shot list and says
   * nothing about the joint. An earlier version of this tool printed it and it
   * read 52.7 px on a solve whose rms was 1.59.
   */
  worstFrame: number;
}

export function triangulate(
  readings: Reading[],
  centreA: [number, number],
  centreB: [number, number],
): JointSolve {
  const M = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const R = [0, 0, 0, 0];
  for (const r of readings) {
    const ta = r.a.rotationDeg * RAD;
    const tb = r.b.rotationDeg * RAD;
    const sa = r.a.scale;
    const sb = r.b.scale;
    // rows: [ sa*ca, -sa*sa_, -sb*cb, sb*sb_ ] etc.
    const rowX = [sa * Math.cos(ta), -sa * Math.sin(ta), -sb * Math.cos(tb), sb * Math.sin(tb)];
    const rowY = [sa * Math.sin(ta), sa * Math.cos(ta), -sb * Math.sin(tb), -sb * Math.cos(tb)];
    const bx = r.b.x - r.a.x;
    const by = r.b.y - r.a.y;
    for (const [row, rhs] of [
      [rowX, bx],
      [rowY, by],
    ] as [number[], number][]) {
      for (let i = 0; i < 4; i++) {
        R[i] += row[i] * rhs;
        for (let j = 0; j < 4; j++) M[i][j] += row[i] * row[j];
      }
    }
  }
  const [ux, uy, vx, vy] = solve4(M, R);
  const inA: [number, number] = [centreA[0] + ux, centreA[1] + uy];
  const inB: [number, number] = [centreB[0] + vx, centreB[1] + vy];

  let sum = 0;
  let worstFrame = 0;
  const relative: number[] = [];
  for (const r of readings) {
    const ta = r.a.rotationDeg * RAD;
    const tb = r.b.rotationDeg * RAD;
    const ax = r.a.x + r.a.scale * (Math.cos(ta) * ux - Math.sin(ta) * uy);
    const ay = r.a.y + r.a.scale * (Math.sin(ta) * ux + Math.cos(ta) * uy);
    const bx = r.b.x + r.b.scale * (Math.cos(tb) * vx - Math.sin(tb) * vy);
    const by = r.b.y + r.b.scale * (Math.sin(tb) * vx + Math.cos(tb) * vy);
    const d2 = (ax - bx) ** 2 + (ay - by) ** 2;
    sum += d2;
    worstFrame = Math.max(worstFrame, Math.sqrt(d2));
    relative.push(r.b.rotationDeg - r.a.rotationDeg);
  }
  return { inA, inB, rms: Math.sqrt(sum / readings.length), frames: readings.length, relative, worstFrame };
}

/**
 * The same solve with part B's own pivot already known — two unknowns instead
 * of four, and much better conditioned.
 *
 * Reach for it where B's art DRAWS its joint (a limb plate's cap) and A's does
 * not (a chest plate's shoulder is interior to it).
 */
export function triangulateFixed(
  readings: Reading[],
  centreA: [number, number],
  centreB: [number, number],
  pivotInB: [number, number],
): JointSolve {
  const vx = pivotInB[0] - centreB[0];
  const vy = pivotInB[1] - centreB[1];
  const M = [
    [0, 0],
    [0, 0],
  ];
  const R = [0, 0];
  for (const r of readings) {
    const ta = r.a.rotationDeg * RAD;
    const tb = r.b.rotationDeg * RAD;
    const sa = r.a.scale;
    const bx = r.b.x + r.b.scale * (Math.cos(tb) * vx - Math.sin(tb) * vy) - r.a.x;
    const by = r.b.y + r.b.scale * (Math.sin(tb) * vx + Math.cos(tb) * vy) - r.a.y;
    const rowX = [sa * Math.cos(ta), -sa * Math.sin(ta)];
    const rowY = [sa * Math.sin(ta), sa * Math.cos(ta)];
    for (const [row, rhs] of [
      [rowX, bx],
      [rowY, by],
    ] as [number[], number][]) {
      for (let i = 0; i < 2; i++) {
        R[i] += row[i] * rhs;
        for (let j = 0; j < 2; j++) M[i][j] += row[i] * row[j];
      }
    }
  }
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  if (Math.abs(det) < 1e-12) throw new Error('singular');
  const ux = (R[0] * M[1][1] - R[1] * M[0][1]) / det;
  const uy = (R[1] * M[0][0] - R[0] * M[1][0]) / det;

  let sum = 0;
  let worstFrame = 0;
  const relative: number[] = [];
  for (const r of readings) {
    const ta = r.a.rotationDeg * RAD;
    const tb = r.b.rotationDeg * RAD;
    const ax = r.a.x + r.a.scale * (Math.cos(ta) * ux - Math.sin(ta) * uy);
    const ay = r.a.y + r.a.scale * (Math.sin(ta) * ux + Math.cos(ta) * uy);
    const bx = r.b.x + r.b.scale * (Math.cos(tb) * vx - Math.sin(tb) * vy);
    const by = r.b.y + r.b.scale * (Math.sin(tb) * vx + Math.cos(tb) * vy);
    const d2 = (ax - bx) ** 2 + (ay - by) ** 2;
    sum += d2;
    worstFrame = Math.max(worstFrame, Math.sqrt(d2));
    relative.push(r.b.rotationDeg - r.a.rotationDeg);
  }
  return {
    inA: [centreA[0] + ux, centreA[1] + uy],
    inB: pivotInB,
    rms: Math.sqrt(sum / readings.length),
    frames: readings.length,
    relative,
    worstFrame,
  };
}

if (import.meta.main) {
  const battery = JSON.parse(readFileSync(process.env.BATTERY ?? '/tmp/sb2/pose/battery.json', 'utf8'));
  const PARTS = process.env.PARTS ?? '/tmp/sb2/ess-parts';
  const partA = process.argv[2];
  const partB = process.argv[3];
  const maxRes = Number(process.argv[4] ?? 0.16);
  const gA = geometryOf(join(PARTS, `${partA}.png`), partA);
  const gB = geometryOf(join(PARTS, `${partB}.png`), partB);

  const readings: Reading[] = [];
  for (const [set, report] of Object.entries<any>(battery)) {
    const ea = report.parts.find((p: any) => p.part === `${partA}.png`);
    const eb = report.parts.find((p: any) => p.part === `${partB}.png`);
    if (!ea?.placement || !eb?.placement) continue;
    if (ea.placement.residual > maxRes || eb.placement.residual > maxRes) continue;
    if (ea.ambiguous || eb.ambiguous) continue;
    readings.push({
      set,
      a: { ...ea.placement },
      b: { ...eb.placement },
    });
  }
  if (readings.length < 2) throw new Error(`only ${readings.length} usable reading(s) for ${partA} <-> ${partB}`);

  const fixB = process.env.FIX_B ? (process.env.FIX_B.split(',').map(Number) as [number, number]) : null;
  const all = fixB
    ? triangulateFixed(readings, [gA.width / 2, gA.height / 2], [gB.width / 2, gB.height / 2], fixB)
    : triangulate(readings, [gA.width / 2, gA.height / 2], [gB.width / 2, gB.height / 2]);
  // Conditioning: drop the four most angularly extreme frames and re-solve.
  const byRel = [...readings].sort(
    (p, q) => Math.abs(p.b.rotationDeg - p.a.rotationDeg) - Math.abs(q.b.rotationDeg - q.a.rotationDeg),
  );
  const narrow = byRel.slice(0, Math.max(2, byRel.length - 6));
  let cond: JointSolve | null = null;
  try {
    cond = triangulate(narrow, [gA.width / 2, gA.height / 2], [gB.width / 2, gB.height / 2]);
  } catch {
    cond = null;
  }

  const spread = Math.max(...all.relative) - Math.min(...all.relative);
  process.stdout.write(
    `${partA} <-> ${partB}\n` +
      `  frames used            ${all.frames} (${readings.map((r) => r.set).join(', ')})\n` +
      `  relative rotation span ${spread.toFixed(1)} deg  (${Math.min(...all.relative).toFixed(1)} .. ${Math.max(...all.relative).toFixed(1)})\n` +
      `  joint in ${partA}      (${all.inA[0].toFixed(1)}, ${all.inA[1].toFixed(1)})  [image is ${gA.width}x${gA.height}]\n` +
      `  joint in ${partB}      (${all.inB[0].toFixed(1)}, ${all.inB[1].toFixed(1)})  [image is ${gB.width}x${gB.height}]\n` +
      `  fit rms                ${all.rms.toFixed(3)} frame px\n` +
      `  worst single frame      ${all.worstFrame.toFixed(3)} frame px\n`,
  );
  if (cond) {
    const moveA = Math.hypot(cond.inA[0] - all.inA[0], cond.inA[1] - all.inA[1]);
    const moveB = Math.hypot(cond.inB[0] - all.inB[0], cond.inB[1] - all.inB[1]);
    process.stdout.write(
      `  conditioning check     dropping the ${readings.length - narrow.length} most diverse frame(s) moves the answer ` +
        `${moveA.toFixed(1)} px in ${partA} and ${moveB.toFixed(1)} px in ${partB} (rms ${cond.rms.toFixed(3)})\n`,
    );
  }
  if (process.argv[5]) {
    writeFileSync(process.argv[5], `${JSON.stringify({ partA, partB, ...all }, null, 1)}\n`);
    process.stdout.write(`  wrote ${process.argv[5]}\n`);
  }
}
