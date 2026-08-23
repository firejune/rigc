/**
 * The `ball` shot, measured off its rendered frames only.
 *
 * The subject is one shape of about 20 px, so almost everything here is a
 * geodesic walk over a mask that small. Per frame:
 *
 *   · the subject mask, its centroid, box and principal axes;
 *   · the two extremities — the geodesically farthest-apart pair;
 *   · the inscribed-radius profile along the shape, and the **neck**: the split
 *     between ball and trail. Taken from each end in turn, keeping the split
 *     whose ball piece best fills its own ellipse, and refused outright when the
 *     neck has no prominence (the launch frame has no neck at all).
 *   · the ball's principal axes once split, and the trail's centre line as a
 *     cubic in geodesic distance — a level-set centroid is pure noise on a
 *     9 px-wide spindle (rung 6 measured that and this pass reproduces it).
 *
 * Controls: the same estimator is run over `ball.png` and `tail.png` composited
 * by hand at the sidecar's scale with a known squash, so its bias is measured
 * before anything it says is used. `bun … measure-ball.ts control` prints that.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/measure-ball.ts [12|24] [control]`
 */
import { Plate, readPlate, type RGBA } from '../../../../tools/plate.ts';
import { loadSet, sidecar, mask, boxOf, components, principalAxes, IMAGES } from './frames.ts';
import { join } from 'node:path';

export interface BallFrame {
  index: number;
  /** whole-subject figures, always available */
  area: number;
  cx: number;
  cy: number;
  subjectMajor: number;
  subjectMinor: number;
  subjectAngle: number;
  /** the ball, when the shape has a neck to cut at */
  ball: { cx: number; cy: number; major: number; minor: number; angle: number; area: number } | null;
  /** how deep the neck is; 0 means "no neck", and the split is refused */
  prominence: number;
  /** the trail's sagitta and chord ÷ arc, when the split held */
  sagitta: number | null;
  chordOverArc: number | null;
  /** the tail tip, the extremity away from the ball */
  tip: [number, number] | null;
  /**
   * The trail's centre line, sampled from the neck to the tip in frame pixels,
   * with the geodesic distance from the ball's far end at each sample.
   *
   * ⭐ This is what seeds the chain. A fit started from a straight chain has to
   * find five rotations at once and does not: it spends the ball's own scale on
   * the trail's error instead, and this run measured that happening — a round
   * f0 fitted as 1.56 x 0.59 with the worst frame cost in the shot.
   */
  spine: { d: number; x: number; y: number }[];
}

/** 8-connected geodesic distance in whole steps, from a set of seeds. */
function geodesic(m: Uint8Array, w: number, h: number, seeds: number[]): Int32Array {
  const d = new Int32Array(m.length).fill(-1);
  let front = seeds.filter((s) => m[s]);
  for (const s of front) d[s] = 0;
  let step = 0;
  while (front.length) {
    const next: number[] = [];
    step++;
    for (const p of front) {
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (m[q] && d[q] < 0) {
            d[q] = step;
            next.push(q);
          }
        }
      }
    }
    front = next;
  }
  return d;
}

/** Inscribed radius: the chessboard distance to the nearest pixel not in the mask. */
function inscribed(m: Uint8Array, w: number, h: number): Float64Array {
  const out = new Float64Array(m.length);
  const outside: number[] = [];
  const inv = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!m[i]) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || inv[ny * w + nx]) {
            edge = true;
            break;
          }
        }
      }
      if (edge) outside.push(i);
    }
  }
  const d = geodesic(m, w, h, outside);
  for (let i = 0; i < m.length; i++) out[i] = m[i] ? d[i] + 1 : 0;
  return out;
}

function largestComponent(m: Uint8Array, w: number, h: number): { m: Uint8Array; idx: number[] } {
  const comps = components(m, w, h).sort((a, b) => b.length - a.length);
  const out = new Uint8Array(m.length);
  for (const p of comps[0]) out[p] = 1;
  return { m: out, idx: comps[0] };
}

function pointsFrom(idx: number[], w: number): [number, number][] {
  return idx.map((p) => [p % w, Math.floor(p / w)] as [number, number]);
}

function fillRatio(pts: [number, number][]): number {
  if (pts.length < 6) return 0;
  const a = principalAxes(pts);
  const ell = (Math.PI / 4) * a.major * a.minor;
  return ell > 0 ? pts.length / ell : 0;
}

/** Split the shape at the neck, taken from `from` towards the other end. */
function splitAt(
  idx: number[],
  w: number,
  h: number,
  m: Uint8Array,
  from: number,
  radius: Float64Array,
): { ball: number[]; trail: number[]; prominence: number } | null {
  const g = geodesic(m, w, h, [from]);
  let maxD = 0;
  for (const p of idx) if (g[p] > maxD) maxD = g[p];
  if (maxD < 6) return null;
  const prof: number[] = new Array(maxD + 1).fill(0);
  for (const p of idx) if (g[p] >= 0 && radius[p] > prof[g[p]]) prof[g[p]] = radius[p];
  // The neck is the deepest interior minimum with a peak on each side.
  let best = -1;
  let bestProm = 0;
  for (let k = 2; k < maxD - 1; k++) {
    let left = 0;
    for (let j = 0; j < k; j++) left = Math.max(left, prof[j]);
    let right = 0;
    for (let j = k + 1; j <= maxD; j++) right = Math.max(right, prof[j]);
    const prom = Math.min(left, right) - prof[k];
    if (prom > bestProm) {
      bestProm = prom;
      best = k;
    }
  }
  if (best < 0) return null;
  const ball: number[] = [];
  const trail: number[] = [];
  for (const p of idx) (g[p] <= best ? ball : trail).push(p);
  if (ball.length < 8 || trail.length < 8) return null;
  return { ball, trail, prominence: bestProm };
}

/** Extremities: the geodesically farthest pair, found by two sweeps. */
function extremities(idx: number[], w: number, h: number, m: Uint8Array): [number, number] {
  const g0 = geodesic(m, w, h, [idx[0]]);
  let a = idx[0];
  for (const p of idx) if (g0[p] > g0[a]) a = p;
  const g1 = geodesic(m, w, h, [a]);
  let b = a;
  for (const p of idx) if (g1[p] > g1[b]) b = p;
  return [a, b];
}

/** Cubic least squares of x(d), y(d) over the trail's pixels, then its bow. */
function trailBow(
  trail: number[],
  w: number,
  h: number,
  m: Uint8Array,
  from: number,
): { sagitta: number; chordOverArc: number; spine: { d: number; x: number; y: number }[] } | null {
  const sub = new Uint8Array(m.length);
  for (const p of trail) sub[p] = 1;
  const g = geodesic(m, w, h, [from]);
  let maxD = 0;
  for (const p of trail) if (g[p] > maxD) maxD = g[p];
  let minD = Infinity;
  for (const p of trail) if (g[p] < minD) minD = g[p];
  if (maxD - minD < 6) return null;
  const rows: { d: number; x: number; y: number }[] = [];
  for (const p of trail) rows.push({ d: g[p], x: p % w, y: Math.floor(p / w) });
  const basis = (d: number): number[] => {
    const t = (d - minD) / (maxD - minD);
    return [1, t, t * t, t * t * t];
  };
  const solve = (pick: (r: { x: number; y: number }) => number): number[] => {
    const A: number[][] = Array.from({ length: 4 }, () => new Array<number>(5).fill(0));
    for (const r of rows) {
      const b = basis(r.d);
      const v = pick(r);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) A[i][j] += b[i] * b[j];
        A[i][4] += b[i] * v;
      }
    }
    for (let c = 0; c < 4; c++) {
      let piv = c;
      for (let r = c + 1; r < 4; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-12) return [0, 0, 0, 0];
      [A[c], A[piv]] = [A[piv], A[c]];
      for (let r = 0; r < 4; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k <= 4; k++) A[r][k] -= f * A[c][k];
      }
    }
    return A.map((row, i) => row[4] / A[i][i]);
  };
  const cx = solve((r) => r.x);
  const cy = solve((r) => r.y);
  const at = (t: number): [number, number] => {
    const b = [1, t, t * t, t * t * t];
    return [
      cx.reduce((s, v, i) => s + v * b[i], 0),
      cy.reduce((s, v, i) => s + v * b[i], 0),
    ];
  };
  const N = 60;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) pts.push(at(i / N));
  let arc = 0;
  for (let i = 1; i <= N; i++) arc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const chord = Math.hypot(pts[N][0] - pts[0][0], pts[N][1] - pts[0][1]);
  let sagitta = 0;
  for (const p of pts) {
    const ux = (pts[N][0] - pts[0][0]) / (chord || 1);
    const uy = (pts[N][1] - pts[0][1]) / (chord || 1);
    const vx = p[0] - pts[0][0];
    const vy = p[1] - pts[0][1];
    sagitta = Math.max(sagitta, Math.abs(vx * uy - vy * ux));
  }
  const spine: { d: number; x: number; y: number }[] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    const [x, y] = at(u);
    spine.push({ d: minD + u * (maxD - minD), x, y });
  }
  return { sagitta, chordOverArc: arc > 0 ? chord / arc : 0, spine };
}

export function measureBallPlate(plate: Plate, background: RGBA, prev: [number, number] | null): BallFrame {
  const w = plate.width;
  const h = plate.height;
  const raw = mask(plate, background, 8);
  const { m, idx } = largestComponent(raw, w, h);
  const box = boxOf(raw, w, h);
  const pts = pointsFrom(idx, w);
  const axes = principalAxes(pts);
  const radius = inscribed(m, w, h);
  const [e0, e1] = extremities(idx, w, h, m);

  let bestSplit: { ball: number[]; trail: number[]; prominence: number; from: number } | null = null;
  let bestFill = -1;
  for (const from of [e0, e1]) {
    const s = splitAt(idx, w, h, m, from, radius);
    if (!s) continue;
    const fill = fillRatio(pointsFrom(s.ball, w));
    if (fill > bestFill) {
      bestFill = fill;
      bestSplit = { ...s, from };
    }
  }
  // A frame whose neck has no prominence has no ball to measure: that failure
  // reads back as a plausible near-round number if it is not gated, so it is.
  if (bestSplit && bestSplit.prominence < 1.5) bestSplit = null;

  let ball: BallFrame['ball'] = null;
  let bow: { sagitta: number; chordOverArc: number; spine: { d: number; x: number; y: number }[] } | null = null;
  let tip: [number, number] | null = null;
  if (bestSplit) {
    const bp = pointsFrom(bestSplit.ball, w);
    const a = principalAxes(bp);
    ball = { cx: a.cx, cy: a.cy, major: a.major, minor: a.minor, angle: a.angle, area: bp.length };
    bow = trailBow(bestSplit.trail, w, h, m, bestSplit.from);
    const other = bestSplit.from === e0 ? e1 : e0;
    tip = [other % w, Math.floor(other / w)];
  } else if (prev) {
    // fall back to the extremity farther from where the ball was last frame
    const p0: [number, number] = [e0 % w, Math.floor(e0 / w)];
    const p1: [number, number] = [e1 % w, Math.floor(e1 / w)];
    tip = Math.hypot(p0[0] - prev[0], p0[1] - prev[1]) > Math.hypot(p1[0] - prev[0], p1[1] - prev[1]) ? p0 : p1;
  }
  return {
    index: 0,
    area: box ? box.count : 0,
    cx: axes.cx,
    cy: axes.cy,
    subjectMajor: axes.major,
    subjectMinor: axes.minor,
    subjectAngle: axes.angle,
    ball,
    prominence: bestSplit ? bestSplit.prominence : 0,
    sagitta: bow ? bow.sagitta : null,
    chordOverArc: bow ? bow.chordOverArc : null,
    tip,
    spine: bow ? bow.spine : [],
  };
}

export function measureBall(dir: string): BallFrame[] {
  const side = sidecar('ball');
  const bg: RGBA = [side.background[0], side.background[1], side.background[2], side.background[3]];
  const plates = loadSet('ball', dir);
  const out: BallFrame[] = [];
  let prev: [number, number] | null = null;
  for (let i = 0; i < plates.length; i++) {
    const f = measureBallPlate(plates[i], bg, prev);
    f.index = i;
    if (f.ball) prev = [f.ball.cx, f.ball.cy];
    out.push(f);
  }
  return out;
}

/** Composite one plate onto another with the renderer's own rule, for controls. */
function compositeControl(scale: number, aspect: number, rot: number): Plate {
  const ball = readPlate(join(IMAGES, 'ball.png'));
  const tail = readPlate(join(IMAGES, 'tail.png'));
  const out = new Plate(160, 160);
  const bg: RGBA = [232, 232, 232, 255];
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.set(x, y, bg);
  const cos = Math.cos((rot * Math.PI) / 180);
  const sin = Math.sin((rot * Math.PI) / 180);
  const place = (src: Plate, ox: number, oy: number, sx: number, sy: number): void => {
    for (let py = 0; py < out.height; py++) {
      for (let px = 0; px < out.width; px++) {
        // inverse map into the source
        const dx = px - 80;
        const dy = py - 80;
        const ux = dx * cos + dy * sin;
        const uy = -dx * sin + dy * cos;
        const sxx = ux / (scale * sx) + ox;
        const syy = uy / (scale * sy) + oy;
        if (sxx < 0 || syy < 0 || sxx >= src.width - 1 || syy >= src.height - 1) continue;
        const x0 = Math.floor(sxx);
        const y0 = Math.floor(syy);
        const fx = sxx - x0;
        const fy = syy - y0;
        const acc: number[] = [0, 0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const c00 = src.get(x0, y0)[k];
          const c10 = src.get(x0 + 1, y0)[k];
          const c01 = src.get(x0, y0 + 1)[k];
          const c11 = src.get(x0 + 1, y0 + 1)[k];
          acc[k] = c00 * (1 - fx) * (1 - fy) + c10 * fx * (1 - fy) + c01 * (1 - fx) * fy + c11 * fx * fy;
        }
        if (acc[3] > 127) out.blend(px, py, [acc[0], acc[1], acc[2], acc[3]] as RGBA);
      }
    }
  };
  // the trail behind, its blunt end 4 px behind the ball's centre — inside the
  // ball, which is about 11 px in radius here, so the two are one shape.
  place(tail, 378 + 4 / scale, 55.5, 1, 1);
  place(ball, 78, 78, 1 / Math.sqrt(aspect), Math.sqrt(aspect));
  return out;
}

if (import.meta.main) {
  const side = sidecar('ball');
  if (process.argv[2] === 'control') {
    const bg: RGBA = [232, 232, 232, 255];
    console.log('# control: ball.png + tail.png composited with a KNOWN squash, read back');
    console.log('true aspect   rot   read aspect   read major x minor   prominence');
    for (const aspect of [1, 1.5, 2.1, 2.6, 3.0]) {
      for (const rot of [0, 35, 70, 115]) {
        const plate = compositeControl(side.viewport.scale, aspect, rot);
        const f = measureBallPlate(plate, bg, null);
        const read = f.ball ? f.ball.major / f.ball.minor : NaN;
        console.log(
          `  ${aspect.toFixed(2).padStart(5)}   ${String(rot).padStart(4)}   ` +
            `${Number.isFinite(read) ? read.toFixed(2) : '  — '}          ` +
            `${f.ball ? `${f.ball.major.toFixed(1)} x ${f.ball.minor.toFixed(1)}` : '—'}   ${f.prominence.toFixed(2)}`,
        );
      }
    }
  } else {
    const fps = process.argv[2] === '12' ? 12 : 24;
    const frames = measureBall(fps === 24 ? 'follow-through@24fps' : 'follow-through');
    console.log(`# ball ${fps} fps — ${frames.length} frames`);
    console.log('idx  area  subject centre     subj ax    ball centre        aspect  axis   sag  c/arc  prom');
    for (const f of frames) {
      console.log(
        `${String(f.index).padStart(3)} ${String(f.area).padStart(5)}  ` +
          `(${f.cx.toFixed(1).padStart(5)},${f.cy.toFixed(1).padStart(5)})  ` +
          `${f.subjectAngle.toFixed(0).padStart(4)}°  ` +
          (f.ball
            ? `(${f.ball.cx.toFixed(1).padStart(5)},${f.ball.cy.toFixed(1).padStart(5)})  ` +
              `${(f.ball.major / f.ball.minor).toFixed(2)}  ${f.ball.angle.toFixed(0).padStart(4)}°`
            : `      no neck        —      —  `) +
          `  ${f.sagitta === null ? '  — ' : f.sagitta.toFixed(1).padStart(4)}  ` +
          `${f.chordOverArc === null ? ' — ' : f.chordOverArc.toFixed(2)}  ${f.prominence.toFixed(1)}`,
      );
    }
    const areas = frames.map((f) => f.area);
    console.log(`\narea ${Math.min(...areas)}–${Math.max(...areas)} px, mean ${(areas.reduce((a, b) => a + b, 0) / areas.length).toFixed(0)}`);
    const asp = frames.filter((f) => f.ball).map((f) => (f.ball as NonNullable<BallFrame['ball']>).major / (f.ball as NonNullable<BallFrame['ball']>).minor);
    console.log(`aspect ${Math.min(...asp).toFixed(2)}–${Math.max(...asp).toFixed(2)} over ${asp.length} readable frames`);
    console.log(`no neck on: ${frames.filter((f) => !f.ball).map((f) => `f${f.index}`).join(', ') || 'none'}`);
  }
}
