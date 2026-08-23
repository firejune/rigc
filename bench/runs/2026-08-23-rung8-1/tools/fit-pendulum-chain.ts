/**
 * The pendulum's chain, solved as a rigid kinematic chain against the four bead
 * positions the frames give unambiguously.
 *
 * Model, in world units (y up), all of it structural except the four angles:
 *
 *   bone1 = discus ∘ pivot                     pivot fixed in the discus's frame
 *   bone(i+1) = bone(i) + L(i) · u(i)          u(i) = link i's unit direction
 *   bead(i)  = bone(i) + h(i) · u(i)           where the art's orange bead sits
 *
 * `bead(1)` is never used: the discus covers most of it, so its centroid is a
 * crescent's and moves with the relative angle. `bead(5)` is the eyelet's disc
 * and `h(5)` is fixed at 0 — that is a choice of where to put the eyelet's bone,
 * not a claim, because a round disc cannot show its own rotation.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/fit-pendulum-chain.ts [12|24] [--json out]`
 */
import { writeFileSync } from 'node:fs';
import { sidecar } from './frames.ts';
import { measurePendulum, type PendulumFrame } from './measure-pendulum.ts';

const D = 180 / Math.PI;

export interface Structure {
  /** link 1's bone, in the discus's local frame, world units. */
  pivotX: number;
  pivotY: number;
  /** bone-to-bone distances, units. */
  L: [number, number, number, number];
  /** where each link's own bead sits along it, from its bone, units. h[0] is link 1's and is not fitted. */
  h: [number, number, number, number];
}

export interface Pose {
  index: number;
  /** the discus, in world units and degrees. */
  x: number;
  y: number;
  rotation: number;
  /** each link's world direction in degrees (0 = +x, 90 = up). */
  dir: [number, number, number, number];
  /** worst bead residual for this frame, in frame pixels. */
  residual: number;
}

export interface Observed {
  index: number;
  cx: number;
  cy: number;
  angle: number;
  /** beads 2..5 in world units. */
  beads: [number, number][];
}

export function toWorld(side: ReturnType<typeof sidecar>): (px: number, py: number) => [number, number] {
  const v = side.viewport;
  const maxY = v.y + v.height;
  return (px, py) => [v.x + px / v.scale, maxY - py / v.scale];
}

export function observe(frames: PendulumFrame[], side: ReturnType<typeof sidecar>): Observed[] {
  const w = toWorld(side);
  return frames.map((f) => {
    const [cx, cy] = w(f.cx, f.cy);
    return {
      index: f.index,
      cx,
      cy,
      angle: f.angle,
      beads: f.beads.slice(1).map((b) => w(b.cx, b.cy)) as [number, number][],
    };
  });
}

/** Forward kinematics: the four bone origins and the four bead positions. */
function forward(s: Structure, o: Observed, dir: number[]): { beads: [number, number][]; bones: [number, number][] } {
  const t = (o.angle * Math.PI) / 180;
  const bx = o.cx + s.pivotX * Math.cos(t) - s.pivotY * Math.sin(t);
  const by = o.cy + s.pivotX * Math.sin(t) + s.pivotY * Math.cos(t);
  const bones: [number, number][] = [[bx, by]];
  for (let i = 0; i < 4; i++) {
    const a = (dir[i] * Math.PI) / 180;
    const p = bones[i];
    bones.push([p[0] + s.L[i] * Math.cos(a), p[1] + s.L[i] * Math.sin(a)]);
  }
  const beads: [number, number][] = [];
  for (let i = 1; i < 4; i++) {
    const a = (dir[i] * Math.PI) / 180;
    beads.push([bones[i][0] + s.h[i] * Math.cos(a), bones[i][1] + s.h[i] * Math.sin(a)]);
  }
  beads.push([bones[4][0], bones[4][1]]); // the eyelet's disc sits on its own bone
  return { beads, bones };
}

function residuals(s: Structure, o: Observed, dir: number[]): number[] {
  const { beads } = forward(s, o, dir);
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    out.push(beads[i][0] - o.beads[i][0], beads[i][1] - o.beads[i][1]);
  }
  return out;
}

/** Gauss-Newton over the four link angles of one frame. */
function sq(r: number[]): number {
  let c = 0;
  for (const v of r) c += v * v;
  return c;
}

export function solvePose(s: Structure, o: Observed, seed: number[]): { dir: number[]; cost: number } {
  let dir = seed.slice();
  let cost = sq(residuals(s, o, dir));
  let lambda = 1e-3;
  for (let iter = 0; iter < 120; iter++) {
    const r0 = residuals(s, o, dir);
    const J: number[][] = [];
    const eps = 1e-4;
    for (let k = 0; k < 4; k++) {
      const bump = dir.slice();
      bump[k] += eps;
      J.push(residuals(s, o, bump).map((v, i) => (v - r0[i]) / eps));
    }
    const A: number[][] = Array.from({ length: 4 }, () => new Array<number>(4).fill(0));
    const g = new Array<number>(4).fill(0);
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 4; b++) for (let i = 0; i < r0.length; i++) A[a][b] += J[a][i] * J[b][i];
      for (let i = 0; i < r0.length; i++) g[a] -= J[a][i] * r0[i];
    }
    let accepted = false;
    for (let attempt = 0; attempt < 12 && !accepted; attempt++) {
      const damped = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-12 : v)));
      const step = solve4(damped, g);
      if (!step || step.some((v) => !Number.isFinite(v))) {
        lambda *= 10;
        continue;
      }
      const trial = dir.map((v, k) => v + step[k]);
      const c = sq(residuals(s, o, trial));
      if (Number.isFinite(c) && c < cost) {
        dir = trial;
        cost = c;
        lambda = Math.max(1e-9, lambda / 3);
        accepted = true;
      } else {
        lambda *= 10;
      }
    }
    if (!accepted) break;
    if (cost < 1e-12) break;
  }
  return { dir, cost };
}

function solve4(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    if (Math.abs(m[piv][c]) < 1e-12) return null;
    [m[c], m[piv]] = [m[piv], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / m[i][i]);
}

export function fitAll(obs: Observed[], s0: Structure): { structure: Structure; poses: Pose[]; rms: number } {
  let s = { ...s0, L: [...s0.L] as Structure['L'], h: [...s0.h] as Structure['h'] };
  let seeds: number[][] = obs.map((o) => {
    // seed each link from the bead chain itself
    const out: number[] = [];
    let prev: [number, number] = [o.cx, o.cy];
    for (let i = 0; i < 4; i++) {
      const b = o.beads[i];
      out.push(Math.atan2(b[1] - prev[1], b[0] - prev[0]) * D);
      prev = b;
    }
    return out;
  });

  const total = (st: Structure): { cost: number; dirs: number[][] } => {
    let cost = 0;
    const dirs: number[][] = [];
    for (let k = 0; k < obs.length; k++) {
      const r = solvePose(st, obs[k], seeds[k]);
      cost += r.cost;
      dirs.push(r.dir);
    }
    return { cost, dirs };
  };

  let best = total(s);
  seeds = best.dirs;
  // Coordinate descent over the nine structural numbers.
  const keys: ('pivotX' | 'pivotY' | ['L' | 'h', number])[] = [
    'pivotX',
    'pivotY',
    ['L', 0],
    ['L', 1],
    ['L', 2],
    ['L', 3],
    ['h', 1],
    ['h', 2],
    ['h', 3],
  ];
  let step = 8;
  while (step > 1e-3) {
    let improved = false;
    for (const key of keys) {
      for (const sign of [1, -1]) {
        const trial = { ...s, L: [...s.L] as Structure['L'], h: [...s.h] as Structure['h'] };
        if (typeof key === 'string') trial[key] += sign * step;
        else if (key[0] === 'L') trial.L[key[1]] += sign * step;
        else trial.h[key[1]] += sign * step;
        const t = total(trial);
        if (t.cost < best.cost - 1e-9) {
          s = trial;
          best = t;
          seeds = t.dirs;
          improved = true;
          break;
        }
      }
    }
    if (!improved) step /= 2;
  }
  const n = obs.length * 8;
  const poses: Pose[] = obs.map((o, k) => {
    const r = residuals(s, o, best.dirs[k]);
    let worst = 0;
    for (let i = 0; i < 4; i++) worst = Math.max(worst, Math.hypot(r[2 * i], r[2 * i + 1]));
    return {
      index: o.index,
      x: o.cx,
      y: o.cy,
      rotation: o.angle,
      dir: best.dirs[k] as Pose['dir'],
      residual: worst,
    };
  });
  return { structure: s, poses, rms: Math.sqrt(best.cost / n) };
}

if (import.meta.main) {
  const fps = process.argv[2] === '24' ? 24 : 12;
  const side = sidecar('pendulum');
  const obs = observe(measurePendulum(fps === 24 ? 'follow-through@24fps' : 'follow-through'), side);
  const s0: Structure = { pivotX: 0, pivotY: 0, L: [300, 240, 210, 210], h: [0, 0, 0, 0] };
  const { structure, poses, rms } = fitAll(obs, s0);
  const px = (u: number): string => (u * side.viewport.scale).toFixed(2);
  console.log(`# pendulum chain fit, ${fps} fps, ${obs.length} frames`);
  console.log(
    `pivot (${structure.pivotX.toFixed(1)}, ${structure.pivotY.toFixed(1)}) units = ` +
      `(${px(structure.pivotX)}, ${px(structure.pivotY)}) px, in the discus's frame`,
  );
  structure.L.forEach((v, i) => console.log(`L${i + 1} = ${v.toFixed(1)} units (${px(v)} px)`));
  structure.h.forEach((v, i) =>
    console.log(`h${i + 1} = ${v.toFixed(1)} units (${px(v)} px)${i === 0 ? '  — not fitted, bead 1 is occluded' : ''}`),
  );
  console.log(
    `rms bead residual ${rms.toFixed(2)} units = ${px(rms)} px; worst frame ` +
      `${Math.max(...poses.map((p) => p.residual)).toFixed(1)} units = ` +
      `${px(Math.max(...poses.map((p) => p.residual)))} px`,
  );
  const jsonAt = process.argv.indexOf('--json');
  if (jsonAt >= 0) writeFileSync(process.argv[jsonAt + 1], JSON.stringify({ structure, poses }, null, 1));
}
