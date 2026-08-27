/**
 * Rung 7 — how much warp does the sack actually need?
 *
 * affine-verdict.ts settles that ONE bone cannot do it. This sizes the mesh: it fits
 * polynomial warps of rising order from the art's silhouette to each frame's, and
 * reads where the residual reaches the estimator's own floor. The order that gets
 * there is the number of degrees of freedom the deformation has, which is what
 * decides how many control bones the mesh needs — not a guess, and no build spent.
 *
 * Parametrisation: art coordinates are normalised to u,v in [-1,1] over the opaque
 * box, and the map is a polynomial in (u,v) per output axis. Order 1 IS the affine
 * (6 params) and reproduces affine-verdict's numbers; order 2 adds u^2, uv, v^2
 * (12 params) = what a 3x3 lattice of control points can express; order 3 (20) = 4x4.
 */
import { readPlate } from '../../../../tools/plate.ts';
import { artMask } from './art.ts';
import { masksOf, type FrameMasks, ANIMS, frameFiles } from './frames.ts';

const art = artMask('sack.png');
const bx = (art.box.left + art.box.right + 1) / 2;
const by = (art.box.top + art.box.bottom + 1) / 2;
const hw = (art.box.right + 1 - art.box.left) / 2;
const hh = (art.box.bottom + 1 - art.box.top) / 2;

/** The monomials of (u,v) up to `order`, in a fixed sequence. */
function basis(order: number, u: number, v: number, out: Float64Array): number {
  let n = 0;
  for (let d = 0; d <= order; d++)
    for (let i = 0; i <= d; i++) {
      let t = 1;
      for (let k = 0; k < d - i; k++) t *= u;
      for (let k = 0; k < i; k++) t *= v;
      out[n++] = t;
    }
  return n;
}
const terms = (order: number): number => ((order + 1) * (order + 2)) / 2;

/**
 * Score a warp by pushing the ART FORWARD (the inverse of a polynomial is not a
 * polynomial), splatting into a scratch mask, then comparing. Splatting can leave
 * pinholes when the map expands, so the mask is closed by a 3x3 dilate-erode before
 * comparing — and the controls below go through the identical path, so the floor
 * this introduces is measured rather than assumed.
 */
const W = 1024;
const H = 798;
const hit = new Uint8Array(W * H);
const closed = new Uint8Array(W * H);

function scoreWarp(f: FrameMasks, order: number, p: Float64Array): number {
  hit.fill(0);
  const n = terms(order);
  const mono = new Float64Array(n);
  let lo = W;
  let hi = 0;
  let to = H;
  let bo = 0;
  for (let ay = art.box.top; ay <= art.box.bottom; ay++)
    for (let ax = art.box.left; ax <= art.box.right; ax++) {
      if (!art.on[ay * art.w + ax]) continue;
      const u = (ax + 0.5 - bx) / hw;
      const v = (ay + 0.5 - by) / hh;
      basis(order, u, v, mono);
      let px = 0;
      let py = 0;
      for (let k = 0; k < n; k++) {
        px += p[k] * mono[k];
        py += p[n + k] * mono[k];
      }
      const ix = px | 0;
      const iy = py | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      hit[iy * W + ix] = 1;
      if (ix < lo) lo = ix;
      if (ix > hi) hi = ix;
      if (iy < to) to = iy;
      if (iy > bo) bo = iy;
    }
  if (hi < lo) return 1e9;
  // close pinholes: a set pixel with >=5 set neighbours stays; an unset pixel with
  // >=6 set neighbours joins.
  const x0 = Math.max(1, lo - 2);
  const x1 = Math.min(W - 2, hi + 2);
  const y0 = Math.max(1, to - 2);
  const y1 = Math.min(H - 2, bo + 2);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (hit[(y + dy) * W + x + dx]) c++;
        }
      closed[i] = hit[i] ? 1 : c >= 6 ? 1 : 0;
    }
  let bad = 0;
  const X0 = Math.min(x0, f.sackP.left);
  const X1 = Math.max(x1, f.sackP.right);
  const Y0 = Math.min(y0, f.sackP.top);
  const Y1 = Math.max(y1, f.sackP.bottom);
  for (let y = Y0; y <= Y1; y++)
    for (let x = X0; x <= X1; x++) {
      const i = y * W + x;
      const inW = x >= x0 && x <= x1 && y >= y0 && y <= y1 && closed[i] === 1;
      if (f.sack[i] === 1 ? !inW : inW && f.cape[i] !== 1) bad++;
    }
  return bad / f.sackP.area;
}

function affineStart(f: FrameMasks): Float64Array {
  // centroid + covariance match, in the (u,v) frame; order-1 params only
  const mom = (m: Uint8Array, w: number, h: number, norm: boolean) => {
    let n = 0;
    let sx = 0;
    let sy = 0;
    const px: number[] = [];
    const py: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (m[y * w + x]) {
          const a = norm ? (x + 0.5 - bx) / hw : x + 0.5;
          const b = norm ? (y + 0.5 - by) / hh : y + 0.5;
          px.push(a);
          py.push(b);
          sx += a;
          sy += b;
          n++;
        }
    const cx = sx / n;
    const cy = sy / n;
    let xx = 0;
    let xy = 0;
    let yy = 0;
    for (let i = 0; i < n; i++) {
      xx += (px[i] - cx) ** 2;
      xy += (px[i] - cx) * (py[i] - cy);
      yy += (py[i] - cy) ** 2;
    }
    return { cx, cy, xx: xx / n, xy: xy / n, yy: yy / n };
  };
  const A = mom(art.on, art.w, art.h, true);
  const F = mom(f.sack, f.w, f.h, false);
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
  const M = mul2(sqrtm(F.xx, F.xy, F.yy), inv2(sqrtm(A.xx, A.xy, A.yy)));
  // order 1 basis sequence is [1, u, v]
  const p = new Float64Array(6);
  p[0] = F.cx - (M[0] * A.cx + M[1] * A.cy);
  p[1] = M[0];
  p[2] = M[1];
  p[3] = F.cy - (M[2] * A.cx + M[3] * A.cy);
  p[4] = M[2];
  p[5] = M[3];
  return p;
}

/** Lift order-k params into order-(k+1) with the new terms zeroed. */
function lift(p: Float64Array, from: number, to: number): Float64Array {
  const nf = terms(from);
  const nt = terms(to);
  const q = new Float64Array(2 * nt);
  for (let k = 0; k < nf; k++) {
    q[k] = p[k];
    q[nt + k] = p[nf + k];
  }
  return q;
}

function descend(f: FrameMasks, order: number, p0: Float64Array, scale: number): { p: Float64Array; err: number } {
  const n = terms(order);
  let p = Float64Array.from(p0);
  let e = scoreWarp(f, order, p);
  let step = scale;
  for (let pass = 0; pass < 400; pass++) {
    let moved = false;
    for (let k = 0; k < 2 * n; k++) {
      const isConst = k % n === 0;
      const s = isConst ? step * 12 : step;
      for (const d of [s, -s]) {
        const t = Float64Array.from(p);
        t[k] += d;
        const v = scoreWarp(f, order, t);
        if (v < e - 1e-11) {
          e = v;
          p = t;
          moved = true;
        }
      }
    }
    if (!moved) {
      step /= 1.7;
      if (step < 0.02) break;
    }
  }
  return { p, err: e };
}

function ladder(f: FrameMasks, maxOrder: number): number[] {
  const out: number[] = [];
  let p = affineStart(f);
  let r = descend(f, 1, p, 1.2);
  out.push(r.err);
  for (let o = 2; o <= maxOrder; o++) {
    p = lift(r.p, o - 1, o);
    r = descend(f, o, p, 1.2);
    out.push(r.err);
  }
  return out;
}

/** control: the art itself, splatted through a known affine — the path's own floor */
function synthFrame(p: Float64Array, order: number): FrameMasks {
  hit.fill(0);
  const n = terms(order);
  const mono = new Float64Array(n);
  const sack = new Uint8Array(W * H);
  let cnt = 0;
  let l = W;
  let t = H;
  let rr = -1;
  let b = -1;
  for (let ay = art.box.top; ay <= art.box.bottom; ay++)
    for (let ax = art.box.left; ax <= art.box.right; ax++) {
      if (!art.on[ay * art.w + ax]) continue;
      basis(order, (ax + 0.5 - bx) / hw, (ay + 0.5 - by) / hh, mono);
      let px = 0;
      let py = 0;
      for (let k = 0; k < n; k++) {
        px += p[k] * mono[k];
        py += p[n + k] * mono[k];
      }
      const ix = px | 0;
      const iy = py | 0;
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      sack[iy * W + ix] = 1;
    }
  // close it the same way, so the control's own splat holes are not counted as shape
  const out = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (sack[(y + dy) * W + x + dx]) c++;
        }
      if (sack[i] || c >= 6) {
        out[i] = 1;
        cnt++;
        if (x < l) l = x;
        if (x > rr) rr = x;
        if (y < t) t = y;
        if (y > b) b = y;
      }
    }
  const pp = { area: cnt, cx: 0, cy: 0, left: l, top: t, right: rr, bottom: b };
  return { w: W, h: H, drawn: out, cape: new Uint8Array(W * H), sack: out, all: pp, capeP: { ...pp, area: 0 }, sackP: pp };
}

const ctlAffine = new Float64Array([520, 82, 6, 400, -9, 152]);
console.log('control — art splatted through a known affine, then fitted back');
console.log('  order 1..3 : ' + ladder(synthFrame(ctlAffine, 1), 3).map((v) => v.toFixed(4)).join('  '));
const ctlBend = new Float64Array([520, 82, 6, 0, 0, 0, 400, -9, 152, 0, 0, 26]);
console.log('control — the same plus a v^2 term of 26 px (a visible bend)');
console.log('  order 1..3 : ' + ladder(synthFrame(ctlBend, 2), 3).map((v) => v.toFixed(4)).join('  '));
console.log('');

const picks: [string, number][] = [
  ['hello', 0],
  ['walk', 1],
  ['walk', 5],
  ['fall-in', 3],
  ['fall-in', 4],
  ['hello', 20],
  ['hello', 27],
  ['hello', 29],
  ['hello', 34],
  ['cape-follow-example', 11],
  ['cape-follow-example', 14],
  ['cape-follow-example', 20],
  ['cape-follow-example', 21],
];
console.log('the frames — residual by polynomial order (1 = one bone, 2 = 3x3 lattice, 3 = 4x4)');
console.log('  frame                        order1   order2   order3');
const tot = [0, 0, 0];
for (const [set, i] of picks) {
  const f = masksOf(readPlate(`bench/reference-local/7-anticipation/${set}/f${String(i).padStart(4, '0')}.png`));
  const r = ladder(f, 3);
  for (let k = 0; k < 3; k++) tot[k] += r[k];
  console.log(`  ${`${set}/f${String(i).padStart(4, '0')}`.padEnd(28)} ${r.map((v) => v.toFixed(4)).join('   ')}`);
}
console.log(`  ${'mean'.padEnd(28)} ${tot.map((v) => (v / picks.length).toFixed(4)).join('   ')}`);
