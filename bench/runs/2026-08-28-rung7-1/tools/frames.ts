/**
 * Rung 7 — reading the reference frames.
 *
 * The frames live in bench/reference-local/7-anticipation/ and are never committed.
 * This module only measures them; it opens no export.
 *
 * Conventions (the brief states all three, and the run's LOOP.md records that none
 * of them is the obvious choice):
 *   - a pixel is DRAWN when it differs from the backdrop (232,232,232) by more than
 *     8/255 on some channel;
 *   - among drawn pixels, CAPE <=> g - b <= 8, SACK otherwise;
 *   - velocity is a central difference, (p[i+1] - p[i-1]) / 2.
 */
import { readdirSync } from 'node:fs';
import { readPlate, type Plate } from '../../../../tools/plate.ts';

export const FRAMES_ROOT = 'bench/reference-local/7-anticipation';
export const BACKDROP: [number, number, number] = [232, 232, 232];
export const MASK_TOL = 8;
export const CAPE_GB = 8;
export const ANIMS = ['fall-in', 'hello', 'walk', 'cape-follow-example'] as const;

export interface Part {
  area: number;
  cx: number;
  cy: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const EMPTY: Part = { area: 0, cx: 0, cy: 0, left: 0, top: 0, right: 0, bottom: 0 };

export interface FrameMasks {
  w: number;
  h: number;
  drawn: Uint8Array;
  cape: Uint8Array;
  sack: Uint8Array;
  all: Part;
  capeP: Part;
  sackP: Part;
}

function partOf(m: Uint8Array, w: number, h: number): Part {
  let area = 0;
  let sx = 0;
  let sy = 0;
  let left = w;
  let top = h;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (m[y * w + x]) {
        area++;
        sx += x;
        sy += y;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
  if (!area) return EMPTY;
  return { area, cx: sx / area, cy: sy / area, left, top, right, bottom };
}

export function masksOf(plate: Plate): FrameMasks {
  const { width: w, height: h } = plate;
  const drawn = new Uint8Array(w * h);
  const cape = new Uint8Array(w * h);
  const sack = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = plate.get(x, y);
      const d = Math.max(
        Math.abs(r - BACKDROP[0]),
        Math.abs(g - BACKDROP[1]),
        Math.abs(b - BACKDROP[2]),
      );
      if (d <= MASK_TOL) continue;
      const i = y * w + x;
      drawn[i] = 1;
      if (g - b <= CAPE_GB) cape[i] = 1;
      else sack[i] = 1;
    }
  return {
    w,
    h,
    drawn,
    cape,
    sack,
    all: partOf(drawn, w, h),
    capeP: partOf(cape, w, h),
    sackP: partOf(sack, w, h),
  };
}

export function frameFiles(set: string): string[] {
  return readdirSync(`${FRAMES_ROOT}/${set}`)
    .filter((f) => /^f\d+\.png$/.test(f))
    .sort();
}

export function loadSet(set: string): FrameMasks[] {
  return frameFiles(set).map((f) => masksOf(readPlate(`${FRAMES_ROOT}/${set}/${f}`)));
}

/** Denoise: drop a pixel with fewer than four same-class neighbours in its 3x3. */
export function denoise(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!m[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          if (m[yy * w + xx]) n++;
        }
      if (n >= 4) out[i] = 1;
    }
  return out;
}

export function diameterOf(m: Uint8Array, w: number, h: number): number {
  const pts: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < w; x++)
      if (m[y * w + x]) {
        if (a < 0) a = x;
        b = x;
      }
    if (a >= 0) {
      pts.push([a, y]);
      if (b !== a) pts.push([b, y]);
    }
  }
  for (let x = 0; x < w; x++) {
    let a = -1;
    let b = -1;
    for (let y = 0; y < h; y++)
      if (m[y * w + x]) {
        if (a < 0) a = y;
        b = y;
      }
    if (a >= 0) {
      pts.push([x, a]);
      if (b !== a) pts.push([x, b]);
    }
  }
  let best = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i][0] - pts[j][0];
      const dy = pts[i][1] - pts[j][1];
      const d = dx * dx + dy * dy;
      if (d > best) best = d;
    }
  return Math.sqrt(best);
}

/** 8-connected component count. */
export function components(m: Uint8Array, w: number, h: number): number {
  const seen = new Uint8Array(w * h);
  let n = 0;
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || seen[s]) continue;
    n++;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const y = (i / w) | 0;
      const x = i % w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (m[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
  }
  return n;
}

if (import.meta.main) {
  // Cross-checks against the brief. Every line here is a claim the brief states with
  // a number; a disagreement is either my estimator or the brief, and §8 says find
  // out which before authoring anything on top of it.
  const sets = new Map<string, FrameMasks[]>();
  for (const a of ANIMS) sets.set(a, loadSet(a));

  const rest: [string, number][] = [
    ['fall-in', 20],
    ['hello', 0],
    ['cape-follow-example', 0],
  ];
  console.log('== the rest pose ==   brief: 99 x 153-154, drawn 10244-10249, crimson 1843-1846');
  for (const [s, i] of rest) {
    const m = sets.get(s)![i];
    console.log(
      `  ${s}/f${String(i).padStart(4, '0')}  subject ${m.all.right - m.all.left + 1} x ${m.all.bottom - m.all.top + 1}` +
        `  drawn ${m.all.area}  crimson ${m.capeP.area}` +
        `  sack ${m.sackP.right - m.sackP.left + 1} x ${m.sackP.bottom - m.sackP.top + 1}` +
        `  components ${components(m.drawn, m.w, m.h)}`,
    );
  }

  console.log('\n== walk sack widths ==   brief: 104, 130, 114, 83, 73, 72, 73, 85, 104');
  console.log(
    '  ' +
      sets
        .get('walk')!
        .map((m) => m.sackP.right - m.sackP.left + 1)
        .join(', '),
  );
  console.log('   heights: ' + sets.get('walk')!.map((m) => m.sackP.bottom - m.sackP.top + 1).join(', ') + '   (brief: 137-149)');
  console.log(
    '   body centroid x: ' +
      sets
        .get('walk')!
        .map((m) => m.sackP.cx.toFixed(1))
        .join(', ') +
      '   (brief: spans 6.3 px, 145.1 .. 151.5, ends 145.2)',
  );

  console.log('\n== fall-in ==   brief: base rows 191, 333, 477, 620, 737; sack 87x154, 82x161, 79x172, 79x181, 161x125');
  const fi = sets.get('fall-in')!;
  console.log('  base rows f0..f4: ' + fi.slice(0, 5).map((m) => m.sackP.bottom).join(', '));
  console.log('  sack boxes f0..f4: ' + fi.slice(0, 5).map((m) => `${m.sackP.right - m.sackP.left + 1}x${m.sackP.bottom - m.sackP.top + 1}`).join(', '));
  console.log('  rebound f5..f8:    ' + fi.slice(5, 9).map((m) => `${m.sackP.right - m.sackP.left + 1}x${m.sackP.bottom - m.sackP.top + 1}`).join(', ') + '   (brief: 98x122, 90x131, 88x151, 87x146)');
  console.log('  base row f8..f20:  ' + fi.slice(8).map((m) => m.sackP.bottom).join(', ') + '   (brief: settles on 749)');
  console.log('  body centroid y f0..f4: ' + fi.slice(0, 5).map((m) => m.sackP.cy.toFixed(1)).join(', ') + '   (brief drops 139.5, 139.9, 139.9, 157.9)');

  console.log('\n== hello ==   brief: f3 centroid 688.2 (f2 688.3); f13->f17 x 148.5 -> 125.2; f17->f34 125.2 -> 928.9');
  const he = sets.get('hello')!;
  console.log('  body cy f0..f4: ' + he.slice(0, 5).map((m) => m.sackP.cy.toFixed(1)).join(', ') + '   (brief 677.2 -> 688.2)');
  console.log('  body cx f13..f17: ' + he.slice(13, 18).map((m) => m.sackP.cx.toFixed(1)).join(', '));
  console.log('  body cx f34: ' + he[34].sackP.cx.toFixed(1));
  console.log('  sack h f4..f13: ' + he.slice(4, 14).map((m) => m.sackP.bottom - m.sackP.top + 1).join(', ') + '   (brief 149 -> 161, holds 160-161 f7..f13)');
  console.log('  base row f19..f34: ' + he.slice(19).map((m) => m.sackP.bottom).join(', ') + '\n   (brief: 736 702 693 721 737 722 662 675 714 740 740 737 622 565 578 670)');

  console.log('\n== cape-follow-example ==   brief: f3->f11 x 148.2 -> 112.4; f11->f21 -> 350.4; apex f17 base 579');
  const cf = sets.get('cape-follow-example')!;
  console.log('  body cx f0,f3,f11,f21: ' + [0, 3, 11, 21].map((i) => cf[i].sackP.cx.toFixed(1)).join(', '));
  console.log('  sack boxes f3,f5,f11,f14,f20,f21: ' + [3, 5, 11, 14, 20, 21].map((i) => `${cf[i].sackP.right - cf[i].sackP.left + 1}x${cf[i].sackP.bottom - cf[i].sackP.top + 1}`).join(', ') + '\n   (brief: 90x152, 113x127, 150x143, 84x208, 112x204, 152x108)');
  console.log('  base row f17: ' + cf[17].sackP.bottom + '   (brief 579)');
  console.log('  cape area f27..f36: ' + cf.slice(27).map((m) => m.capeP.area).join(', ') + '\n   (brief: 2003 1794 1643 1533 1443 1365 1264 1186 1110 1055)');
  console.log('  body cx f27..f36: ' + cf.slice(27).map((m) => m.sackP.cx.toFixed(2)).join(', ') + '   (brief: pinned 345.3 +- 0.1)');
}
