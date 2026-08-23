/**
 * The `ball` shot, fitted against the frames by rendering the candidate back.
 *
 * The subject is about 20 px of comet on a 512 x 413 frame, so no estimator run
 * on the reference alone can carry a ten-parameter pose. What can is the thing
 * rung 6 used: pose the compiled candidate directly through `spine-core`, render
 * it with `src/render.ts` into the frames' own viewport, and minimise the mean
 * absolute difference. Both sides go through the same rasteriser, so any bias in
 * it cancels and only the difference is read. This never opens the reference
 * skeleton — only its frames — so it is a `check`-class loop.
 *
 * Three things the first version of this got wrong, all found by reading the
 * fitted numbers back rather than by any gate:
 *
 * 1. **A straight chain is not a seed.** Started straight, the optimiser cannot
 *    find six rotations at once, so it spends the *ball's* scale on the trail's
 *    error — f0, a frame the estimator reads as round at 1.09, came back fitted
 *    at 1.56 x 0.59. The chain is now seeded from the trail's measured centre
 *    line, and the ball's scale only has its own job to do.
 * 2. **`tail0` wrapped.** Its fitted series ran 0.9, −323.4, −363.9, 24.7 — the
 *    same poses 360° apart, which reads as a spin between two keys. It is now
 *    unwrapped against the previous frame.
 * 3. **A bound has to be on the value, not on the step** (rung 6's §13, the same
 *    shape of bug). `sy` reached −0.247 at f40, a mirrored ball; the clamps here
 *    are applied where the parameter is written.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/fit-ball-pixels.ts sweep|fit [--out f]`
 */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Plate } from '../../../../tools/plate.ts';
import { loadSet, sidecar } from './frames.ts';
import { measureBall, type BallFrame } from './measure-ball.ts';
import { ballRig, ballStatic, type BallStructure } from './ball-spec.ts';
import { backgroundOf, compile, mae, poser, viewportOf, windowOf, type Window } from './harness.ts';

const DIR = 'follow-through@24fps';
const TAIL_LENGTH = 378;

export interface BallFit {
  index: number;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  tail: number[];
  mae: number;
}

const BOX = { x: -1000, y: -1000, width: 2000, height: 2000 };

export function structure(
  comet: [number, number],
  segments: number,
  lead: number,
  artScale = 1,
  ballScale = 1,
): BallStructure {
  return { comet, segments, artScale, ballScale, lead, box: BOX };
}

function wrapNear(v: number, ref: number): number {
  let out = v;
  while (out - ref > 180) out -= 360;
  while (ref - out > 180) out += 360;
  return out;
}

/**
 * Seed the chain from the trail's measured centre line: the direction of the
 * spindle at the middle of each segment, in screen degrees with y up.
 */
export function seedTail(m: BallFrame, segments: number, artScale: number, scale: number): number[] {
  const centre: [number, number] = m.ball ? [m.ball.cx, m.ball.cy] : [m.cx, m.cy];
  const seg = (TAIL_LENGTH * artScale) / segments;
  const dirs: number[] = [];
  if (m.spine.length < 4) {
    const tip = m.tip ?? [m.cx - 1, m.cy];
    const d = (Math.atan2(-(tip[1] - centre[1]), tip[0] - centre[0]) * 180) / Math.PI;
    for (let k = 0; k < segments; k++) dirs.push(d);
  } else {
    const pts = m.spine.map((s) => [s.x, s.y] as [number, number]);
    const arc: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const head = Math.hypot(pts[0][0] - centre[0], pts[0][1] - centre[1]);
    const tangentAt = (a: number): number => {
      if (a <= 0) return (Math.atan2(-(pts[0][1] - centre[1]), pts[0][0] - centre[0]) * 180) / Math.PI;
      let i = 1;
      while (i < arc.length - 1 && arc[i] < a) i++;
      const p0 = pts[i - 1];
      const p1 = pts[i];
      return (Math.atan2(-(p1[1] - p0[1]), p1[0] - p0[0]) * 180) / Math.PI;
    };
    for (let k = 0; k < segments; k++) dirs.push(tangentAt((k + 0.5) * seg * scale - head));
  }
  const out: number[] = [wrapNear(dirs[0] - 180, 0)];
  for (let k = 1; k < segments; k++) out.push(wrapNear(dirs[k] - dirs[k - 1], 0));
  return out;
}

function toWorld(side: ReturnType<typeof sidecar>): (px: number, py: number) => [number, number] {
  const v = side.viewport;
  const maxY = v.y + v.height;
  return (px, py) => [v.x + px / v.scale, maxY - py / v.scale];
}

if (import.meta.main) {
  const mode = process.argv[2] ?? 'fit';
  const side = sidecar('ball');
  const view = viewportOf(side);
  const bg = backgroundOf('ball');
  const reference = loadSet('ball', DIR);
  const measured = measureBall(DIR);
  const world = toWorld(side);
  const W = side.viewport.pixelWidth;
  const H = side.viewport.pixelHeight;
  const windows: Window[] = reference.map((r) => windowOf([r], bg, 14, W, H));
  const centres = measured.map((m) => world(m.ball ? m.ball.cx : m.cx, m.ball ? m.ball.cy : m.cy));

  const tmp = mkdtempSync(join(tmpdir(), 'rung8-ball-'));
  const setupWorld = centres[0];

  const run = (segments: number, lead: number, artScale: number, ballScale: number, stride: number): BallFit[] => {
    const built = compile(
      join(tmp, `s${segments}-l${Math.round(lead)}-a${Math.round(artScale * 100)}-b${Math.round(ballScale * 100)}`),
      ballRig(structure(setupWorld, segments, lead, artScale, ballScale)),
      ballStatic(),
    );
    const p = poser(built.posable.data, view, built.posable.pages, bg);
    const scratch = new Plate(W, H);
    const n = 4 + segments;
    const cost = (f: BallFit, i: number): number => {
      p.reset();
      p.set('comet', 'x', setupWorld[0] + f.dx);
      p.set('comet', 'y', setupWorld[1] + f.dy);
      p.set('ball', 'scaleX', f.sx);
      p.set('ball', 'scaleY', f.sy);
      for (let k = 0; k < segments; k++) p.set(`tail${k}`, 'rotation', (k === 0 ? 180 : 0) + f.tail[k]);
      p.renderInto(scratch, windows[i]);
      return mae(scratch, reference[i], windows[i]).mae;
    };
    const get = (f: BallFit, k: number): number =>
      k === 0 ? f.dx : k === 1 ? f.dy : k === 2 ? f.sx : k === 3 ? f.sy : f.tail[k - 4];
    // ⚠️ clamp the VALUE, not the step (rung 6 §13). A ball may flatten hard but
    // may not turn inside out, and a joint may not fold past 80°.
    const put = (f: BallFit, k: number, v: number): void => {
      if (k === 0) f.dx = v;
      else if (k === 1) f.dy = v;
      else if (k === 2) f.sx = Math.min(3.5, Math.max(0.25, v));
      else if (k === 3) f.sy = Math.min(3.5, Math.max(0.25, v));
      else if (k === 4) f.tail[0] = v;
      else f.tail[k - 4] = Math.min(80, Math.max(-80, v));
    };
    const steps0 = [40, 40, 0.12, 0.12, ...new Array<number>(segments).fill(6)];
    const refine = (f: BallFit, i: number, scaleDown: number, maxRounds: number): number => {
      let best = cost(f, i);
      const steps = steps0.map((v) => v / scaleDown);
      for (let round = 0; round < maxRounds; round++) {
        let improved = false;
        for (let k = 0; k < n; k++) {
          for (const sign of [1, -1]) {
            const old = get(f, k);
            put(f, k, old + sign * steps[k]);
            const c = cost(f, i);
            if (c < best - 1e-6) {
              best = c;
              improved = true;
              break;
            }
            put(f, k, old);
          }
        }
        if (!improved) {
          for (let k = 0; k < n; k++) steps[k] /= 2;
          if (steps[0] < 0.5) break;
        }
      }
      f.mae = best;
      return best;
    };

    const fits: BallFit[] = [];
    let previous: BallFit | null = null;
    for (let i = 0; i < reference.length; i += stride) {
      const fresh: BallFit = {
        index: i,
        dx: centres[i][0] - setupWorld[0],
        dy: centres[i][1] - setupWorld[1],
        sx: 1,
        sy: 1,
        tail: seedTail(measured[i], segments, artScale, side.viewport.scale),
        mae: 0,
      };
      if (previous) fresh.tail[0] = wrapNear(fresh.tail[0], previous.tail[0]);
      const candidates: BallFit[] = [fresh];
      if (previous) {
        candidates.push({ ...previous, index: i, dx: fresh.dx, dy: fresh.dy, tail: previous.tail.slice() });
      }
      let best: BallFit | null = null;
      for (const c of candidates) {
        refine(c, i, 1, 60);
        if (!best || c.mae < best.mae) best = c;
      }
      const chosen = best as BallFit;
      refine(chosen, i, 4, 40);
      if (previous) chosen.tail[0] = wrapNear(chosen.tail[0], previous.tail[0]);
      fits.push(chosen);
      previous = chosen;
      if (mode === 'fit' && i % 10 === 0) process.stderr.write(`  f${i} ${chosen.mae.toFixed(2)}\n`);
    }

    if (stride === 1) {
      // Continuity passes: a neighbour's pose is a seed too, and where it costs
      // no more than the incumbent it is preferred — the same fix rung 6 made
      // when its per-frame fit found three visibly different poses at equal cost.
      for (let pass = 0; pass < 2; pass++) {
        const order = pass % 2 === 0 ? [...fits.keys()].reverse() : [...fits.keys()];
        for (const i of order) {
          for (const nb of [fits[i - 1], fits[i + 1]]) {
            if (!nb) continue;
            const trial: BallFit = { ...nb, index: i, dx: fits[i].dx, dy: fits[i].dy, tail: nb.tail.slice() };
            refine(trial, i, 2, 40);
            if (trial.mae <= fits[i].mae * 1.01) {
              trial.tail[0] = wrapNear(trial.tail[0], nb.tail[0]);
              fits[i] = trial;
            }
          }
          refine(fits[i], i, 4, 30);
        }
        if (mode === 'fit') {
          process.stderr.write(
            `  continuity pass ${pass + 1}: mean ${(fits.reduce((s, f) => s + f.mae, 0) / fits.length).toFixed(3)}\n`,
          );
        }
      }
      // Rescue: a handful of frames sit in a local minimum the neighbours cannot
      // reach — the arrival at f24 and the last arc at f60–f61 are where a chain
      // of six can be folded two ways for nearly the same silhouette. They get a
      // multi-start, seeded off their own solution with the bend shaken.
      const sorted = fits.map((f) => f.mae).sort((a, b) => a - b);
      const cut = Math.max(4, sorted[Math.floor(sorted.length / 2)] * 2);
      let rng = 12345;
      const rand = (): number => {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        return rng / 0x7fffffff;
      };
      for (let i = 0; i < fits.length; i++) {
        if (fits[i].mae <= cut) continue;
        const base = fits[i];
        for (let attempt = 0; attempt < 24; attempt++) {
          const trial: BallFit = {
            ...base,
            tail: base.tail.map((v, k) => (k === 0 ? v + (rand() - 0.5) * 40 : v + (rand() - 0.5) * 70)),
            sx: 0.5 + rand() * 1.8,
            sy: 0.5 + rand() * 1.8,
          };
          refine(trial, i, 1, 60);
          refine(trial, i, 4, 40);
          if (trial.mae < fits[i].mae) fits[i] = trial;
        }
        if (mode === 'fit') process.stderr.write(`  rescue f${i}: ${base.mae.toFixed(2)} → ${fits[i].mae.toFixed(2)}\n`);
      }
      for (let i = 1; i < fits.length; i++) fits[i].tail[0] = wrapNear(fits[i].tail[0], fits[i - 1].tail[0]);
      // one last continuity sweep so a rescued frame does not stand alone
      for (const i of fits.keys()) {
        for (const nb of [fits[i - 1], fits[i + 1]]) {
          if (!nb) continue;
          const trial: BallFit = { ...nb, index: i, dx: fits[i].dx, dy: fits[i].dy, tail: nb.tail.slice() };
          refine(trial, i, 2, 40);
          if (trial.mae <= fits[i].mae) fits[i] = trial;
        }
      }
      for (let i = 1; i < fits.length; i++) fits[i].tail[0] = wrapNear(fits[i].tail[0], fits[i - 1].tail[0]);
    }
    return fits;
  };

  const arg = (name: string, fallback: number): number => {
    const at = process.argv.indexOf(name);
    return at >= 0 ? Number(process.argv[at + 1]) : fallback;
  };

  if (mode === 'sweep') {
    const cases: [number, number, number, number][] = [];
    for (const lead of [-40, -20, 0]) cases.push([6, lead, 1, 1]);
    for (const a of [1.05, 1.1]) cases.push([6, -20, a, 1]);
    for (const segments of [4, 8]) cases.push([segments, -20, 1, 1]);
    for (const [segments, lead, a, b] of cases) {
      const fits = run(segments, lead, a, b, 4);
      const mean = fits.reduce((s, f) => s + f.mae, 0) / fits.length;
      console.log(
        `  segments ${segments}  lead ${String(lead).padStart(3)}  artScale ${a}  ballScale ${b}   MAE ${mean.toFixed(3)}`,
      );
    }
  } else {
    const segments = arg('--segments', 6);
    const lead = arg('--lead', -20);
    const artScale = arg('--art', 1);
    const ballScale = arg('--ball', 1);
    const fits = run(segments, lead, artScale, ballScale, 1);
    const mean = fits.reduce((s, f) => s + f.mae, 0) / fits.length;
    const worst = fits.slice().sort((a, b) => b.mae - a.mae)[0];
    console.log(
      `ball fit: segments ${segments} lead ${lead} art ${artScale} ball ${ballScale} → ` +
        `MAE mean ${mean.toFixed(3)}, worst ${worst.mae.toFixed(2)} at f${worst.index}`,
    );
    const outAt = process.argv.indexOf('--out');
    if (outAt >= 0) {
      writeFileSync(
        process.argv[outAt + 1],
        JSON.stringify({ setupWorld, segments, lead, artScale, ballScale, fits }, null, 1),
      );
    }
  }
}
