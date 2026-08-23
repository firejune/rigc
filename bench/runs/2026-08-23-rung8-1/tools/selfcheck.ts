/**
 * The run's own frame-fidelity self-check: **the same estimator over both
 * sides**, so its bias cancels and only the difference is read.
 *
 * `rigc check` reports pixels; this reports the shot's own quantities — the
 * discus's rim and tilt, the chain's spacings and total bend, the eyelet's path
 * and its lag; the ball's proportion, the trail's bow, the subject's area — for a
 * candidate against the frames it was authored from. A number that reads right in
 * pixels and wrong here is a rig that lands in the right place with the wrong
 * shape, and nothing else in the loop says so.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/selfcheck.ts <ball|pendulum> <candidate-dir>`
 */
import { join } from 'node:path';
import { loadSet, sidecar } from './frames.ts';
import { backgroundOf, viewportOf } from './harness.ts';
import { loadPosable, renderFrame, sampleAnimation } from '../../../../src/render.ts';
import { measurePendulumPlate, type PendulumFrame } from './measure-pendulum.ts';
import { measureBallPlate, type BallFrame } from './measure-ball.ts';

const DIR = 'follow-through@24fps';

function wrap(d: number): number {
  let v = d;
  while (v > 180) v -= 360;
  while (v <= -180) v += 360;
  return v;
}

function range(v: number[]): string {
  return `${Math.min(...v).toFixed(2)}–${Math.max(...v).toFixed(2)}`;
}

function meanOf(v: number[]): number {
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function row(label: string, mine: string, ref: string): void {
  console.log(`  ${label.padEnd(34)} ${mine.padEnd(22)} ${ref}`);
}

function totalBend(f: PendulumFrame): number {
  const dirs: number[] = [];
  for (let i = 0; i < f.beads.length - 1; i++) {
    dirs.push((Math.atan2(-(f.beads[i + 1].cy - f.beads[i].cy), f.beads[i + 1].cx - f.beads[i].cx) * 180) / Math.PI);
  }
  return Math.abs(wrap(dirs[1] - dirs[0])) + Math.abs(wrap(dirs[2] - dirs[1])) + Math.abs(wrap(dirs[3] - dirs[2]));
}

function lag(a: { cx: number; cy: number }[], b: { cx: number; cy: number }[], axis: 'x' | 'y', maxLag: number): number {
  const va = a.slice(1).map((v, i) => (axis === 'x' ? v.cx - a[i].cx : v.cy - a[i].cy));
  const vb = b.slice(1).map((v, i) => (axis === 'x' ? v.cx - b[i].cx : v.cy - b[i].cy));
  let bestL = 0;
  let bestR = -Infinity;
  for (let l = 0; l <= maxLag; l++) {
    const n = Math.min(va.length, vb.length - l);
    let ma = 0;
    let mb = 0;
    for (let i = 0; i < n; i++) {
      ma += va[i];
      mb += vb[i + l];
    }
    ma /= n;
    mb /= n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < n; i++) {
      const u = va[i] - ma;
      const w = vb[i + l] - mb;
      num += u * w;
      da += u * u;
      db += w * w;
    }
    const r = num / Math.sqrt(da * db);
    if (r > bestR) {
      bestR = r;
      bestL = l;
    }
  }
  return bestL;
}

if (import.meta.main) {
  const skeleton = process.argv[2] as 'ball' | 'pendulum';
  const candidate = process.argv[3];
  const side = sidecar(skeleton);
  const view = viewportOf(side);
  const bg = backgroundOf(skeleton);
  const reference = loadSet(skeleton, DIR);
  const posable = loadPosable(join(candidate, 'skeleton.json'), join(candidate, 'skeleton.atlas'), candidate);
  const sampled = sampleAnimation(posable.data, 'follow-through', 24);
  const mine = reference.map((_, i) => renderFrame(sampled[Math.min(i, sampled.length - 1)], posable.pages, view, bg));

  console.log(`# ${skeleton} — the same estimator over both sides, ${reference.length} frames at 24 fps\n`);
  console.log(`  ${'quantity'.padEnd(34)} ${'candidate'.padEnd(22)} reference`);

  if (skeleton === 'pendulum') {
    const A: PendulumFrame[] = [];
    const B: PendulumFrame[] = [];
    for (let i = 0; i < reference.length; i++) {
      A.push(measurePendulumPlate(mine[i], bg, i));
      B.push(measurePendulumPlate(reference[i], bg, i));
    }
    row('discus rim, tip to tip (px)', range(A.map((f) => f.rim)), range(B.map((f) => f.rim)));
    row('discus tilt (deg)', range(A.map((f) => f.angle)), range(B.map((f) => f.angle)));
    for (let k = 0; k < 4; k++) {
      const s = (F: PendulumFrame[]): number[] =>
        F.map((f) => Math.hypot(f.beads[k + 1].cx - f.beads[k].cx, f.beads[k + 1].cy - f.beads[k].cy));
      row(`joint ${k + 1}→${k + 2} spacing (px)`, `${meanOf(s(A)).toFixed(2)} ${range(s(A))}`, `${meanOf(s(B)).toFixed(2)} ${range(s(B))}`);
    }
    row('subject drawn area (px)', range(A.map((f) => f.area)), range(B.map((f) => f.area)));
    const bendA = A.map(totalBend);
    const bendB = B.map(totalBend);
    row('total chain bend (deg)', `${range(bendA)}, peak f${bendA.indexOf(Math.max(...bendA))}`, `${range(bendB)}, peak f${bendB.indexOf(Math.max(...bendB))}`);
    const eyeA = A.map((f) => f.beads[4]);
    const eyeB = B.map((f) => f.beads[4]);
    row(
      'eyelet x extremes (px)',
      `${Math.min(...eyeA.map((e) => e.cx)).toFixed(1)} … ${Math.max(...eyeA.map((e) => e.cx)).toFixed(1)}`,
      `${Math.min(...eyeB.map((e) => e.cx)).toFixed(1)} … ${Math.max(...eyeB.map((e) => e.cx)).toFixed(1)}`,
    );
    row(
      'eyelet ÷ discus x travel',
      (
        (Math.max(...eyeA.map((e) => e.cx)) - Math.min(...eyeA.map((e) => e.cx))) /
        (Math.max(...A.map((f) => f.cx)) - Math.min(...A.map((f) => f.cx)))
      ).toFixed(2),
      (
        (Math.max(...eyeB.map((e) => e.cx)) - Math.min(...eyeB.map((e) => e.cx))) /
        (Math.max(...B.map((f) => f.cx)) - Math.min(...B.map((f) => f.cx)))
      ).toFixed(2),
    );
    row(
      'eyelet lag vs discus, x / y (frames)',
      `${lag(A, eyeA, 'x', 12)} / ${lag(A, eyeA, 'y', 12)}`,
      `${lag(B, eyeB, 'x', 12)} / ${lag(B, eyeB, 'y', 12)}`,
    );
    const step = (F: { cx: number; cy: number }[]): number => {
      let last = 0;
      for (let i = 1; i < F.length; i++) if (Math.hypot(F[i].cx - F[i - 1].cx, F[i].cy - F[i - 1].cy) > 1) last = i;
      return last;
    };
    row('last discus step over 1 px', `f${step(A)}`, `f${step(B)}`);
    row('last eyelet step over 1 px', `f${step(eyeA)}`, `f${step(eyeB)}`);
  } else {
    const A: BallFrame[] = [];
    const B: BallFrame[] = [];
    for (let i = 0; i < reference.length; i++) {
      A.push({ ...measureBallPlate(mine[i], bg, null), index: i });
      B.push({ ...measureBallPlate(reference[i], bg, null), index: i });
    }
    row('subject drawn area (px)', `${range(A.map((f) => f.area))} mean ${meanOf(A.map((f) => f.area)).toFixed(0)}`, `${range(B.map((f) => f.area))} mean ${meanOf(B.map((f) => f.area)).toFixed(0)}`);
    const asp = (F: BallFrame[]): number[] => F.filter((f) => f.ball).map((f) => (f.ball as NonNullable<BallFrame['ball']>).major / (f.ball as NonNullable<BallFrame['ball']>).minor);
    row('ball proportion, readable frames', `${range(asp(A))} over ${asp(A).length}`, `${range(asp(B))} over ${asp(B).length}`);
    const roundish = (F: BallFrame[]): number => asp(F).filter((v) => v < 1.15).length;
    row('frames under 1.15 (round)', `${roundish(A)}`, `${roundish(B)}`);
    const noNeck = (F: BallFrame[]): string => F.filter((f) => !f.ball).map((f) => `f${f.index}`).join(' ') || 'none';
    row('frames with no neck', noNeck(A), noNeck(B));
    const sag = (F: BallFrame[]): number[] => F.filter((f) => f.sagitta !== null).map((f) => f.sagitta as number);
    row('trail sagitta (px)', `${range(sag(A))} mean ${meanOf(sag(A)).toFixed(1)}`, `${range(sag(B))} mean ${meanOf(sag(B)).toFixed(1)}`);
    const coa = (F: BallFrame[]): number[] => F.filter((f) => f.chordOverArc !== null).map((f) => f.chordOverArc as number);
    row('trail chord ÷ arc', range(coa(A)), range(coa(B)));
    for (const i of [26, 27, 28, 40]) {
      const a = A[i].ball;
      const b = B[i].ball;
      row(
        `f${i} ball proportion / axis`,
        a ? `${(a.major / a.minor).toFixed(2)} / ${a.angle.toFixed(0)}°` : 'no neck',
        b ? `${(b.major / b.minor).toFixed(2)} / ${b.angle.toFixed(0)}°` : 'no neck',
      );
    }
    // ⚠️ Only on frames where BOTH sides split. Where the estimator picks the
    // trail's point as the ball — the arc-apex failure the brief names — it does
    // so on one side and not the other, and the "difference" is then the length
    // of the comet rather than anything about the rig.
    const both: { i: number; d: number }[] = [];
    for (let i = 0; i < A.length; i++) {
      const a = A[i].ball;
      const b = B[i].ball;
      if (!a || !b) continue;
      both.push({ i, d: Math.hypot(a.cx - b.cx, a.cy - b.cy) });
    }
    both.sort((x, y) => x.d - y.d);
    row(
      'ball centre difference (px)',
      `median ${both[Math.floor(both.length / 2)].d.toFixed(2)}, ${both.filter((v) => v.d < 2).length}/${both.length} under 2`,
      `worst ${both[both.length - 1].d.toFixed(1)} at f${both[both.length - 1].i} — a split failure`,
    );
  }
}
