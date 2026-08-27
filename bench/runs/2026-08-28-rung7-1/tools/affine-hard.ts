/**
 * Rung 7 — is the affine test's residual the shape, or my optimiser?
 *
 * AUTHORING.md §8: score the estimator against a transform whose answer you already
 * know. Two controls here:
 *   1. the rest pose, whose answer is "the art at scale 1" — and which the same code
 *      already reaches at err 0.0156;
 *   2. a SYNTHETIC frame: take the art, push it through an affine I choose, and see
 *      whether the search recovers it. If it recovers a known affine to ~0 and still
 *      reports 0.24 on cape-follow-example/f0014, the residual is the shape.
 * Then a much harder multi-start search on the three worst frames, to be sure the
 * 0.12-0.28 band is not a basin problem.
 */
import { readPlate } from '../../../../tools/plate.ts';
import { artMask } from './art.ts';
import { masksOf, type FrameMasks } from './frames.ts';

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

function hunt(f: FrameMasks, seeds: number[][], rounds: number): { a: number[]; err: number } {
  let bestA = seeds[0];
  let bestE = Infinity;
  for (const seed of seeds) {
    let a = seed.slice();
    let e = score(f, a);
    let step = [0.12, 0.12, 0.12, 0.12, 20, 20];
    for (let pass = 0; pass < rounds; pass++) {
      let moved = false;
      for (let k = 0; k < 6; k++)
        for (const s of [step[k], -step[k], step[k] / 3, -step[k] / 3]) {
          const t = a.slice();
          t[k] += s;
          const v = score(f, t);
          if (v < e - 1e-10) {
            e = v;
            a = t;
            moved = true;
          }
        }
      if (!moved) {
        step = step.map((s) => s / 1.7);
        if (step[4] < 0.02) break;
      }
    }
    if (e < bestE) {
      bestE = e;
      bestA = a;
    }
  }
  return { a: bestA, err: bestE };
}

/** Render the art through an affine into a synthetic FrameMasks — a known answer. */
function synth(a: number[], w = 1024, h = 798): FrameMasks {
  const sack = new Uint8Array(w * h);
  const cape = new Uint8Array(w * h);
  const drawn = new Uint8Array(w * h);
  const [m00, m01, m10, m11, tx, ty] = a;
  const det = m00 * m11 - m01 * m10;
  const i00 = m11 / det;
  const i01 = -m01 / det;
  const i10 = -m10 / det;
  const i11 = m00 / det;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let l = w;
  let t = h;
  let r = -1;
  let b = -1;
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const dx = px + 0.5 - tx;
      const dy = py + 0.5 - ty;
      const ax = i00 * dx + i01 * dy;
      const ay = i10 * dx + i11 * dy;
      if (ax < 0 || ay < 0 || ax >= art.w || ay >= art.h) continue;
      if (!art.on[((ay | 0) * art.w + ax) | 0]) continue;
      const i = py * w + px;
      sack[i] = 1;
      drawn[i] = 1;
      n++;
      sx += px;
      sy += py;
      if (px < l) l = px;
      if (px > r) r = px;
      if (py < t) t = py;
      if (py > b) b = py;
    }
  const p = { area: n, cx: sx / n, cy: sy / n, left: l, top: t, right: r, bottom: b };
  return { w, h, drawn, cape, sack, all: p, capeP: { ...p, area: 0 }, sackP: p };
}

// ---- control 2: a known affine, recovered from scratch ----
const known = [0.16, 0.05, -0.04, 0.24, 520, 400];
const sy = synth(known);
const wide: number[][] = [];
for (const sx of [0.12, 0.19, 0.26])
  for (const syy of [0.14, 0.19, 0.26])
    for (const sh of [-0.06, 0, 0.06])
      wide.push([sx, sh, -sh, syy, sy.sackP.cx, sy.sackP.cy]);
const rec = hunt(sy, wide, 200);
console.log('control — a known affine recovered from 27 blind starts');
console.log(`  truth  [${known.map((v) => v.toFixed(3)).join(', ')}]`);
console.log(`  found  [${rec.a.map((v) => v.toFixed(3)).join(', ')}]   err ${rec.err.toFixed(4)}\n`);

// ---- the real frames, hard search ----
console.log('the frames — 27 blind starts each, 200 rounds, steps down to 0.02 px');
console.log('  frame                       best err   (rest pose reference: 0.0156)');
for (const [set, i] of [
  ['hello', 0],
  ['fall-in', 4],
  ['cape-follow-example', 14],
  ['cape-follow-example', 20],
  ['walk', 1],
] as [string, number][]) {
  const f = masksOf(readPlate(`bench/reference-local/7-anticipation/${set}/f${String(i).padStart(4, '0')}.png`));
  const seeds: number[][] = [];
  for (const a of [0.12, 0.19, 0.26])
    for (const b of [0.14, 0.19, 0.26])
      for (const sh of [-0.08, 0, 0.08]) seeds.push([a, sh, -sh, b, f.sackP.cx, f.sackP.cy]);
  const r = hunt(f, seeds, 200);
  console.log(`  ${`${set}/f${String(i).padStart(4, '0')}`.padEnd(26)} ${r.err.toFixed(4)}`);
}
