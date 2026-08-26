/**
 * Frame measurement for the rung-4 shot. Reference FRAMES only — no export.
 *
 * Observables, each on pixels that can only be that part (AUTHORING §8):
 *  - orange bead blobs: the four chain joints and the end ring's disc;
 *  - the platform: a long thin dark bar with an orange band on ONE side, so its
 *    second moments give |angle| and the band gives the sign;
 *  - the ball: the single big orange blob (206 px art -> ~18 frame px).
 */
import { readPlate, type Plate } from '../../../../tools/plate.ts';

export const BG = [232, 232, 232];
export interface Blob { n: number; cx: number; cy: number; x0: number; x1: number; y0: number; y1: number }

export function isInk(p: Plate, i: number): boolean {
  return Math.abs(p.data[i] - BG[0]) + Math.abs(p.data[i+1] - BG[1]) + Math.abs(p.data[i+2] - BG[2]) > 12;
}
export function isOrange(p: Plate, i: number): boolean {
  const r = p.data[i], g = p.data[i+1], b = p.data[i+2];
  return r > 130 && r - b > 55 && r - g > 25;
}

export function blobs(p: Plate, pick: (i: number) => boolean, min = 4): Blob[] {
  const W = p.width, H = p.height;
  const mask = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (pick(k * 4)) mask[k] = 1;
  const lab = new Int32Array(W * H).fill(-1);
  const out: Blob[] = [];
  const st: number[] = [];
  for (let k = 0; k < W * H; k++) {
    if (!mask[k] || lab[k] >= 0) continue;
    const id = out.length; st.length = 0; st.push(k); lab[k] = id;
    let n = 0, sx = 0, sy = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
    while (st.length) {
      const q = st.pop()!; const x = q % W, y = (q - x) / W;
      n++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (mask[nk] && lab[nk] < 0) { lab[nk] = id; st.push(nk); }
      }
    }
    out.push({ n, cx: sx / n, cy: sy / n, x0, x1, y0, y1 });
  }
  return out.filter(c => c.n >= min);
}

export function load(f: string): Plate { return readPlate(f); }
