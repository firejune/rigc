/**
 * Partial observations off a frame's own pixels, to start the render fit from.
 *
 * Each estimator is measured on pixels that can only be its own part (§8), and
 * each is allowed to say nothing:
 *  - the platform's orange under-band is one long thin blob, so where it survives
 *    as one its centroid and principal axis give the saucer's place and |angle|;
 *  - a chain joint is a compact saturated-orange bead;
 *  - the ball is warm brown, which no other part is.
 *
 * The sign of the platform's angle is NOT in an axis (an axis is mod 180), so
 * both readings come back as candidates and the render decides between them —
 * §8's symmetric-shape warning, kept out of the estimator rather than guessed at.
 */
import { readPlate, type Plate } from '../../../../tools/plate.ts';

const SCALE = 0.08690080818283744;
const MINX = -7238.582100601831;
const MAXY = 6927.946804058118;

export const toWorld = (px: number, py: number): [number, number] => [px / SCALE + MINX, MAXY - py / SCALE];

interface Blob { n: number; cx: number; cy: number; w: number; h: number; sxx: number; sxy: number; syy: number }

function blobs(p: Plate, pick: (i: number) => boolean, min: number): Blob[] {
  const W = p.width, H = p.height;
  const mask = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (pick(k * 4)) mask[k] = 1;
  const lab = new Int32Array(W * H).fill(-1);
  const out: Blob[] = [];
  const st: number[] = [];
  for (let k = 0; k < W * H; k++) {
    if (!mask[k] || lab[k] >= 0) continue;
    const id = out.length; st.length = 0; st.push(k); lab[k] = id;
    const xs: number[] = [], ys: number[] = [];
    while (st.length) {
      const q = st.pop()!; const x = q % W, y = (q - x) / W;
      xs.push(x); ys.push(y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (mask[nk] && lab[nk] < 0) { lab[nk] = id; st.push(nk); }
      }
    }
    const n = xs.length;
    const cx = xs.reduce((a, b) => a + b, 0) / n;
    const cy = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - cx, dy = ys[i] - cy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    out.push({ n, cx, cy, w: Math.max(...xs) - Math.min(...xs) + 1, h: Math.max(...ys) - Math.min(...ys) + 1, sxx: sxx / n, sxy: sxy / n, syy: syy / n });
  }
  return out.filter((b) => b.n >= min);
}

/** Saturated orange — the beads and the platform's band. The ball is not this. */
const orange = (p: Plate) => (i: number) => {
  const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2];
  return r > 150 && r - b > 95 && r - g > 55;
};
/**
 * Warm — the ball, and nothing else in this shot.
 *
 * The bar is low because the ball **loses most of its colour** when it is thrown:
 * it reads r−b ≈ 53 while it is brown and r−b ≈ 7–18 once it is grey, and the
 * first predicate (r−b > 14) lost it for the last thirty frames of the shot. The
 * saucer and the chain are teal, so r−b is NEGATIVE on them and a low positive
 * bar still separates cleanly; the beads and the band are excluded by their own
 * saturation instead.
 */
const warm = (p: Plate) => (i: number) => {
  const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2];
  return r - b >= 5 && r > 90 && r < 226 && !(r - b > 75 && r - g > 40);
};

/** Every drawn pixel, whatever it belongs to. */
const ink = (p: Plate) => (i: number) => {
  const d = Math.abs(p.data[i] - 232) + Math.abs(p.data[i + 1] - 232) + Math.abs(p.data[i + 2] - 232);
  return d > 24;
};

/** The band's centroid in the platform bone's own frame, measured off the art. */
const BAND_LOCAL: [number, number] = [327.9 - 343.5, -(77.8 - 53)];
export const CHAIN1_LOCAL: [number, number] = [0, -63];
export const LINKS = [250.6, 234.9, 211.9, 203.7];

export interface Plat { px: number; py: number; prot: number; chain?: number[] }
export interface Obs {
  ball?: [number, number];
  plats: Plat[];
  /**
   * The centroid of everything drawn that is not the ball.
   *
   * The band survives as one long blob on only about half the frames of
   * `ball-catch`, and on the other half the saucer had no observation at all —
   * which left the fast passage to tracking alone and lost it. This is the
   * fallback that always exists: it is the saucer *and* the chain, so it sits
   * within about 25 px of the saucer's own centre rather than on it, which is a
   * start and not a measurement.
   */
  rig?: [number, number];
}

function elongation(b: Blob): number {
  const tr = b.sxx + b.syy, det = b.sxx * b.syy - b.sxy * b.sxy;
  const disc = Math.max(0, tr * tr / 4 - det);
  const l1 = tr / 2 + Math.sqrt(disc), l2 = Math.max(1e-6, tr / 2 - Math.sqrt(disc));
  return Math.sqrt(l1 / l2);
}

export function observe(path: string): Obs {
  const p = readPlate(path);
  const os = blobs(p, orange(p), 5);
  const out: Obs = { plats: [] };

  const ws = blobs(p, warm(p), 40).filter((b) => b.w <= 34 && b.h <= 34 && b.n >= 90).sort((a, b) => b.n - a.n)[0];
  if (ws) out.ball = toWorld(ws.cx, ws.cy);
  {
    let n = 0, sx = 0, sy = 0;
    const isInk = ink(p), isWarm = warm(p);
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const i = (y * p.width + x) * 4;
        if (!isInk(i) || isWarm(i)) continue;
        n++; sx += x; sy += y;
      }
    }
    if (n > 100) out.rig = toWorld(sx / n, sy / n);
  }

  const band = os
    .filter((b) => Math.max(b.w, b.h) >= 16 && elongation(b) >= 2.6 && b.n >= 14)
    .sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h))[0];
  if (!band) return out;
  const beads = os.filter((b) => b !== band && Math.max(b.w, b.h) <= 14 && b.n >= 8);
  const theta = 0.5 * Math.atan2(2 * band.sxy, band.sxx - band.syy);
  const bandWorld = toWorld(band.cx, band.cy);
  for (const flip of [0, 180]) {
    const phi = -theta * 180 / Math.PI + flip;
    const rad = phi * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    const px = bandWorld[0] - (c * BAND_LOCAL[0] - s * BAND_LOCAL[1]);
    const py = bandWorld[1] - (s * BAND_LOCAL[0] + c * BAND_LOCAL[1]);
    const plat: Plat = { px, py, prot: phi };
    let cur: [number, number] = [px + (c * CHAIN1_LOCAL[0] - s * CHAIN1_LOCAL[1]), py + (s * CHAIN1_LOCAL[0] + c * CHAIN1_LOCAL[1])];
    let worldAngle = phi;
    const used = new Set<Blob>();
    const rots: number[] = [];
    let ok = true;
    for (let i = 0; i < 4 && ok; i++) {
      let pick: Blob | null = null, bestErr = Infinity;
      for (const b of beads) {
        if (used.has(b)) continue;
        const [wx, wy] = toWorld(b.cx, b.cy);
        const err = Math.abs(Math.hypot(wx - cur[0], wy - cur[1]) - LINKS[i]);
        if (err < bestErr) { bestErr = err; pick = b; }
      }
      if (!pick || bestErr > 0.35 * LINKS[i]) { ok = false; break; }
      used.add(pick);
      const [wx, wy] = toWorld(pick.cx, pick.cy);
      const a = Math.atan2(wy - cur[1], wx - cur[0]) * 180 / Math.PI;
      rots.push(a - worldAngle);
      worldAngle = a;
      const d = Math.hypot(wx - cur[0], wy - cur[1]);
      cur = [cur[0] + (wx - cur[0]) * LINKS[i] / d, cur[1] + (wy - cur[1]) * LINKS[i] / d];
    }
    if (ok) plat.chain = rots;
    out.plats.push(plat);
  }
  return out;
}

export function observeSet(setName: string, count: number): Obs[] {
  const out: Obs[] = [];
  for (let i = 0; i < count; i++) out.push(observe(`bench/reference/4-wave-principle/${setName}/f${String(i).padStart(4, '0')}.png`));
  return out;
}
