/**
 * Rung 7 — region-or-mesh, decided before a single build is spent on it.
 *
 * The brief proves the sack is not a rigid image rotated and uniformly scaled, and
 * says outright that the frames cannot tell a non-uniform scale from a genuine
 * deformation. But there IS a build-free question underneath that one, and it is the
 * one that decides the rig: a Spine bone's local transform is translate, rotate,
 * scale and shear — a general AFFINE map. So:
 *
 *   can an affine image of sack.png's own silhouette reproduce each frame's sack
 *   silhouette, or not?
 *
 * If it can, a region attachment on one bone is sufficient and a mesh buys nothing
 * the frames can see. If it cannot, the residual is the deformation, and it needs a
 * mesh. This is §8's "look for a second way to get the number" applied to a
 * structural choice, and it costs no builds.
 *
 * Scoring, with the occlusion the shot actually has:
 *   missed = sack pixels the transformed art does not cover      (pure error)
 *   excess = transformed-art pixels that are neither sack nor cape (pure error)
 * Transformed-art pixels landing on CRIMSON are not charged: the collar is drawn in
 * front of the sack, so the sack is genuinely there and hidden. That is the same
 * budget the brief's rigid-pose table uses in its "crimson could hide" column.
 */
import { readPlate } from '../../../../tools/plate.ts';
import { artMask } from './art.ts';
import { masksOf, type FrameMasks } from './frames.ts';

const art = artMask('sack.png');

/** Inverse-map every frame pixel in the window into art space and sample. */
function score(f: FrameMasks, a: number[]): { missed: number; excess: number; err: number } {
  // a = [m00, m01, m10, m11, tx, ty] : frame = M * art + t, art coords y-down.
  const [m00, m01, m10, m11, tx, ty] = a;
  const det = m00 * m11 - m01 * m10;
  if (Math.abs(det) < 1e-9) return { missed: f.sackP.area, excess: 1e9, err: 1e9 };
  const i00 = m11 / det;
  const i01 = -m01 / det;
  const i10 = -m10 / det;
  const i11 = m00 / det;
  // window: the union of the sack box and the transformed art box, clipped
  const corners: [number, number][] = [
    [0, 0],
    [art.w, 0],
    [0, art.h],
    [art.w, art.h],
  ].map(([x, y]) => [m00 * x + m01 * y + tx, m10 * x + m11 * y + ty]) as [number, number][];
  let x0 = Math.min(f.sackP.left, ...corners.map((c) => c[0]));
  let x1 = Math.max(f.sackP.right, ...corners.map((c) => c[0]));
  let y0 = Math.min(f.sackP.top, ...corners.map((c) => c[1]));
  let y1 = Math.max(f.sackP.bottom, ...corners.map((c) => c[1]));
  x0 = Math.max(0, Math.floor(x0) - 1);
  y0 = Math.max(0, Math.floor(y0) - 1);
  x1 = Math.min(f.w - 1, Math.ceil(x1) + 1);
  y1 = Math.min(f.h - 1, Math.ceil(y1) + 1);
  let missed = 0;
  let excess = 0;
  for (let py = y0; py <= y1; py++)
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - tx;
      const dy = py + 0.5 - ty;
      const ax = i00 * dx + i01 * dy;
      const ay = i10 * dx + i11 * dy;
      const inArt =
        ax >= 0 && ay >= 0 && ax < art.w && ay < art.h && art.on[((ay | 0) * art.w + ax) | 0] === 1;
      const i = py * f.w + px;
      const isSack = f.sack[i] === 1;
      const isCape = f.cape[i] === 1;
      if (isSack && !inArt) missed++;
      else if (inArt && !isSack && !isCape) excess++;
    }
  return { missed, excess, err: (missed + excess) / f.sackP.area };
}

/** Second-moment start: match centroid and covariance, trying the four sign flips. */
function starts(f: FrameMasks): number[][] {
  const mom = (m: Uint8Array, w: number, h: number) => {
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (m[y * w + x]) {
          n++;
          sx += x + 0.5;
          sy += y + 0.5;
        }
    const cx = sx / n;
    const cy = sy / n;
    let xx = 0;
    let xy = 0;
    let yy = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (m[y * w + x]) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          xx += dx * dx;
          xy += dx * dy;
          yy += dy * dy;
        }
    return { n, cx, cy, xx: xx / n, xy: xy / n, yy: yy / n };
  };
  const A = mom(art.on, art.w, art.h);
  const F = mom(f.sack, f.w, f.h);
  // whiten art, unwhiten into frame — the classic 4-fold ambiguity is enumerated
  const sqrtm = (xx: number, xy: number, yy: number): number[] => {
    const tr = xx + yy;
    const det = xx * yy - xy * xy;
    const s = Math.sqrt(Math.max(det, 1e-12));
    const t = Math.sqrt(Math.max(tr + 2 * s, 1e-12));
    return [(xx + s) / t, xy / t, xy / t, (yy + s) / t];
  };
  const inv = (m: number[]): number[] => {
    const d = m[0] * m[3] - m[1] * m[2];
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d];
  };
  const sa = sqrtm(A.xx, A.xy, A.yy);
  const sf = sqrtm(F.xx, F.xy, F.yy);
  const ia = inv(sa);
  const mul = (p: number[], q: number[]): number[] => [
    p[0] * q[0] + p[1] * q[2],
    p[0] * q[1] + p[1] * q[3],
    p[2] * q[0] + p[3] * q[2],
    p[2] * q[1] + p[3] * q[3],
  ];
  const out: number[][] = [];
  for (const flip of [
    [1, 0, 0, 1],
    [-1, 0, 0, 1],
    [1, 0, 0, -1],
    [-1, 0, 0, -1],
  ]) {
    const M = mul(sf, mul(flip, ia));
    out.push([M[0], M[1], M[2], M[3], F.cx - (M[0] * A.cx + M[1] * A.cy), F.cy - (M[2] * A.cx + M[3] * A.cy)]);
  }
  return out;
}

function refine(f: FrameMasks, a0: number[]): { a: number[]; err: number } {
  let a = a0.slice();
  let best = score(f, a).err;
  let step = [0.06, 0.06, 0.06, 0.06, 8, 8];
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let k = 0; k < 6; k++)
      for (const s of [step[k], -step[k]]) {
        const t = a.slice();
        t[k] += s;
        const e = score(f, t).err;
        if (e < best - 1e-9) {
          best = e;
          a = t;
          moved = true;
        }
      }
    if (!moved) {
      step = step.map((s) => s / 2);
      if (step[4] < 0.05) break;
    }
  }
  return { a, err: best };
}

const cases: [string, number][] = [
  ['hello', 0],
  ['walk', 0],
  ['walk', 1],
  ['walk', 5],
  ['fall-in', 3],
  ['fall-in', 4],
  ['hello', 19],
  ['hello', 20],
  ['hello', 21],
  ['hello', 27],
  ['hello', 29],
  ['cape-follow-example', 11],
  ['cape-follow-example', 14],
  ['cape-follow-example', 20],
  ['cape-follow-example', 21],
];

console.log('affine (translate + rotate + scale + shear = what ONE Spine bone can do)');
console.log('err = (sack px not covered + covered px on the backdrop) / sack px      lower is better\n');
console.log('  frame                       sack px   err     missed  excess   det^0.5   box');
for (const [set, i] of cases) {
  const f = masksOf(readPlate(`bench/reference-local/7-anticipation/${set}/f${String(i).padStart(4, '0')}.png`));
  let bestA: number[] = [];
  let bestE = Infinity;
  for (const s of starts(f)) {
    const r = refine(f, s);
    if (r.err < bestE) {
      bestE = r.err;
      bestA = r.a;
    }
  }
  const sc = score(f, bestA);
  const det = Math.sqrt(Math.abs(bestA[0] * bestA[3] - bestA[1] * bestA[2]));
  console.log(
    `  ${`${set}/f${String(i).padStart(4, '0')}`.padEnd(26)} ${String(f.sackP.area).padStart(6)}  ${bestE.toFixed(4)}  ` +
      `${String(sc.missed).padStart(6)}  ${String(sc.excess).padStart(6)}   ${det.toFixed(3)}    ` +
      `${f.sackP.right - f.sackP.left + 1}x${f.sackP.bottom - f.sackP.top + 1}`,
  );
}
