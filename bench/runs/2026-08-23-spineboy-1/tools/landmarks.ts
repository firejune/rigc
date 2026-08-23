/**
 * Colour-keyed landmarks in a reference frame.
 *
 * Every predicate here is stated in the brief's own terms (its gun teal, its
 * muzzle pink) or is a plain hue window, and each is reported as a set of
 * 8-connected components with their box and centroid — never as a single blob,
 * because two boots are two components and a single centroid of both is a
 * number that is true of neither (the brief's own ground-contact estimator
 * makes the same distinction).
 *
 *   bun … tools/landmarks.ts <skeleton> <set> <index>
 */
import { refFrame, viewportOf, pixelToWorld, BG } from './lib.ts';
import type { Plate } from '../../../../tools/plate.ts';

type Pred = (r: number, g: number, b: number) => boolean;

export const KEYS: Record<string, Pred> = {
  // the brief's own gun predicate — teal, and it catches the hair too
  teal: (r, g, b) => g > 100 && g > r + 30 && b > r + 15 && b < g + 40,
  // bright red: boots, knee pads, bracers, shoulder balls
  red: (r, g, b) => r > 130 && g < 90 && b < 90 && r - Math.max(g, b) > 60,
  // skin
  skin: (r, g, b) => r > 200 && g > 130 && g < 205 && b > 110 && b < 190 && r - b > 40,
  // the goggles' pale lens
  lens: (r, g, b) => b > 190 && g > 190 && r > 170 && b >= g && g > r + 5,
  // muzzle flare (the brief's predicate)
  flare: (r, g, b) => r > 200 && b > 140 && g < Math.min(r, b) - 30,
  // anything drawn at all
  drawn: (r, g, b) => Math.abs(r - BG[0]) > 8 || Math.abs(g - BG[1]) > 8 || Math.abs(b - BG[2]) > 8,
};

export interface Blob {
  n: number;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function components(p: Plate, pred: Pred, minSize = 8): Blob[] {
  const w = p.width;
  const h = p.height;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (pred(p.data[i], p.data[i + 1], p.data[i + 2])) mask[y * w + x] = 1;
    }
  const seen = new Uint8Array(w * h);
  const out: Blob[] = [];
  const stack: number[] = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    let n = 0,
      sx = 0,
      sy = 0,
      minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      n++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    if (n >= minSize) out.push({ n, cx: sx / n, cy: sy / n, minX, minY, maxX, maxY });
  }
  return out.sort((a, b) => b.n - a.n);
}

if (import.meta.main) {
  const [sk, set, idx] = process.argv.slice(2);
  const plate = refFrame(sk as 'ess' | 'pro', set, Number(idx));
  const v = viewportOf(sk as 'ess' | 'pro');
  const toWorld = pixelToWorld(v);
  for (const [name, pred] of Object.entries(KEYS)) {
    const blobs = components(plate, pred, name === 'drawn' ? 20 : 6).slice(0, 6);
    console.log(`\n${name}:`);
    for (const b of blobs) {
      const [wx, wy] = toWorld(b.cx, b.cy);
      console.log(
        `  n=${String(b.n).padStart(5)}  px ${b.minX}..${b.maxX} x ${b.minY}..${b.maxY}` +
          `  centroid ${b.cx.toFixed(1)},${b.cy.toFixed(1)}  world ${wx.toFixed(0)},${wy.toFixed(0)}`,
      );
    }
  }
}
