/**
 * Rung 7 — the region-or-mesh verdict, with the estimator's own floor measured
 * through the identical code path.
 *
 * The floor is what affine-hard.ts was missing: a coarse grid of blind starts is a
 * worse start than the analytic one, so its "control" measured the seeds and not the
 * shape. Here every case — synthetic control and real frame alike — gets the
 * second-moment start (four sign flips, which is the whole ambiguity of a covariance
 * match) and the same long refinement.
 *
 * Three synthetic controls bracket the answer:
 *   exact     the art through a known affine                  => the floor
 *   bent      the art with its top third sheared sideways     => a deformation the
 *             frames would show, at a size worth noticing
 *   scaled    the art at a plain non-uniform scale            => must read as the floor
 */
import { readPlate } from '../../../../tools/plate.ts';
import { artMask } from './art.ts';
import { masksOf, type FrameMasks, ANIMS, frameFiles } from './frames.ts';

const art = artMask('sack.png');

function score(f: FrameMasks, a: number[]): number {
  const [m00, m01, m10, m11, tx, ty] = a;
  const det = m00 * m11 - m01 * m10;
  if (Math.abs(det) < 1e-9) return 1e9;
  const i00 = m11 / det;
  const i01 = -m01 / det;
  const i10 = -m10 / det;
  const i11 = m00 / det;
  const cs: [number, number][] = [
    [0, 0],
    [art.w, 0],
    [0, art.h],
    [art.w, art.h],
  ].map(([x, y]) => [m00 * x + m01 * y + tx, m10 * x + m11 * y + ty]) as [number, number][];
  const x0 = Math.max(0, Math.floor(Math.min(f.sackP.left, ...cs.map((c) => c[0]))) - 1);
  const x1 = Math.min(f.w - 1, Math.ceil(Math.max(f.sackP.right, ...cs.map((c) => c[0]))) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(f.sackP.top, ...cs.map((c) => c[1]))) - 1);
  const y1 = Math.min(f.h - 1, Math.ceil(Math.max(f.sackP.bottom, ...cs.map((c) => c[1]))) + 1);
  let bad = 0;
  for (let py = y0; py <= y1; py++)
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - tx;
      const dy = py + 0.5 - ty;
      const ax = i00 * dx + i01 * dy;
      const ay = i10 * dx + i11 * dy;
      const inArt = ax >= 0 && ay >= 0 && ax < art.w && ay < art.h && art.on[((ay | 0) * art.w + ax) | 0] === 1;
      const i = py * f.w + px;
      if (f.sack[i] === 1 ? !inArt : inArt && f.cape[i] !== 1) bad++;
    }
  return bad / f.sackP.area;
}

function moments(m: Uint8Array, w: number, h: number) {
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
}

const sqrtm = (xx: number, xy: number, yy: number): number[] => {
  const s = Math.sqrt(Math.max(xx * yy - xy * xy, 1e-12));
  const t = Math.sqrt(Math.max(xx + yy + 2 * s, 1e-12));
  return [(xx + s) / t, xy / t, xy / t, (yy + s) / t];
};
const inv2 = (m: number[]): number[] => {
  const d = m[0] * m[3] - m[1] * m[2];
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d];
};
const mul2 = (p: number[], q: number[]): number[] => [
  p[0] * q[0] + p[1] * q[2],
  p[0] * q[1] + p[1] * q[3],
  p[2] * q[0] + p[3] * q[2],
  p[2] * q[1] + p[3] * q[3],
];

function momentStarts(f: FrameMasks): number[][] {
  const A = moments(art.on, art.w, art.h);
  const F = moments(f.sack, f.w, f.h);
  const ia = inv2(sqrtm(A.xx, A.xy, A.yy));
  const sf = sqrtm(F.xx, F.xy, F.yy);
  const out: number[][] = [];
  for (const flip of [
    [1, 0, 0, 1],
    [-1, 0, 0, 1],
    [1, 0, 0, -1],
    [-1, 0, 0, -1],
  ]) {
    const M = mul2(sf, mul2(flip, ia));
    out.push([M[0], M[1], M[2], M[3], F.cx - (M[0] * A.cx + M[1] * A.cy), F.cy - (M[2] * A.cx + M[3] * A.cy)]);
  }
  return out;
}

function fit(f: FrameMasks): number {
  let best = Infinity;
  for (const seed of momentStarts(f)) {
    let a = seed.slice();
    let e = score(f, a);
    let step = [0.03, 0.03, 0.03, 0.03, 4, 4];
    for (let pass = 0; pass < 300; pass++) {
      let moved = false;
      for (let k = 0; k < 6; k++)
        for (const s of [step[k], -step[k]]) {
          const t = a.slice();
          t[k] += s;
          const v = score(f, t);
          if (v < e - 1e-11) {
            e = v;
            a = t;
            moved = true;
          }
        }
      if (!moved) {
        step = step.map((s) => s / 1.6);
        if (step[4] < 0.01) break;
      }
    }
    if (e < best) best = e;
  }
  return best;
}

/** art -> synthetic frame, optionally with a per-row extra shear (a real bend). */
function synth(a: number[], bend = 0): FrameMasks {
  const w = 1024;
  const h = 798;
  const sack = new Uint8Array(w * h);
  const cape = new Uint8Array(w * h);
  const [m00, m01, m10, m11, tx, ty] = a;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let l = w;
  let t = h;
  let r = -1;
  let b = -1;
  for (let ay = 0; ay < art.h; ay++)
    for (let ax = 0; ax < art.w; ax++) {
      if (!art.on[ay * art.w + ax]) continue;
      // bend: the top third slides sideways, linearly in height, like a leaning sack
      const u = Math.max(0, (art.h / 3 - ay) / (art.h / 3));
      const bx = ax + bend * u * u * art.w;
      const px = (m00 * bx + m01 * ay + tx) | 0;
      const py = (m10 * bx + m11 * ay + ty) | 0;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const i = py * w + px;
      if (!sack[i]) {
        sack[i] = 1;
        n++;
        sx += px;
        sy += py;
        if (px < l) l = px;
        if (px > r) r = px;
        if (py < t) t = py;
        if (py > b) b = py;
      }
    }
  const p = { area: n, cx: sx / n, cy: sy / n, left: l, top: t, right: r, bottom: b };
  return { w, h, drawn: sack, cape, sack, all: p, capeP: { ...p, area: 0 }, sackP: p };
}

console.log('controls — the same fit, on shapes whose answer is known');
const base = [0.19, 0, 0, 0.19, 520, 400];
console.log(`  exact  (art through a known affine)                  ${fit(synth(base)).toFixed(4)}`);
console.log(`  scaled (non-uniform 1.55x in y, 0.85x in x)          ${fit(synth([0.1615, 0, 0, 0.2945, 520, 260])).toFixed(4)}`);
console.log(`  bent   (top third slides 0.10 of the art's width)    ${fit(synth(base, 0.1)).toFixed(4)}`);
console.log(`  bent   (top third slides 0.20 of the art's width)    ${fit(synth(base, 0.2)).toFixed(4)}`);
console.log('');

const all: { name: string; err: number }[] = [];
for (const set of ANIMS) {
  const files = frameFiles(set);
  for (let i = 0; i < files.length; i++) {
    const f = masksOf(readPlate(`bench/reference-local/7-anticipation/${set}/${files[i]}`));
    all.push({ name: `${set}/f${String(i).padStart(4, '0')}`, err: fit(f) });
  }
}
all.sort((a, b) => a.err - b.err);
const mean = all.reduce((s, v) => s + v.err, 0) / all.length;
console.log(`all 102 frames — best affine residual as a fraction of the sack's own pixels`);
console.log(`  mean ${mean.toFixed(4)}   median ${all[51].err.toFixed(4)}   best ${all[0].err.toFixed(4)} (${all[0].name})   worst ${all[101].err.toFixed(4)} (${all[101].name})`);
console.log(`  under 0.05: ${all.filter((v) => v.err < 0.05).length} frame(s)   over 0.15: ${all.filter((v) => v.err > 0.15).length}`);
console.log('  the ten best :  ' + all.slice(0, 10).map((v) => `${v.name}=${v.err.toFixed(3)}`).join('  '));
console.log('  the ten worst:  ' + all.slice(-10).map((v) => `${v.name}=${v.err.toFixed(3)}`).join('  '));
