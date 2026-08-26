/**
 * Fitted pose series -> motion spec.
 *
 * Reads `fit/<set>.poses.json` (12 fps) and, when it exists, `fit/<set>.half.json`
 * (the 24 fps series, whose odd samples are fitted against that set's own contact
 * sheet), plans keys under one pixel tolerance per §10.3, and writes the motion
 * spec.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { planSeries, forcedIndices, bez, HX1, HX2, isLinear, type Span } from './plan.ts';
import type { Knobs } from './fitlib.ts';

const RUN = 'bench/runs/2026-08-26-rung4-1';
const PXU = 11.507375; // world units per frame pixel

/** Pixels at the end of what a bone swings — one tolerance for the whole rig. */
export const TOL_PX = 0.28;

/** Set by measurement: no adjacent pair of reference frames here is identical. */
export const HOLDS_IN_THIS_SHOT = false;

/** Lever arm in world units, per knob: how far the far end of what it moves sits. */
export const LEVER: Record<string, number> = {
  prot: 963, c1: 905, c2: 668, c3: 431, c4: 204,
  brot: 103, srot: 103,
};

export interface Series { [k: string]: number[] }

export function loadSeries(set: string): { s: Series; fps: number; n: number } {
  const half = `${RUN}/fit/${set}.half.json`;
  const src = existsSync(half) ? half : `${RUN}/fit/${set}.poses.json`;
  const doc = JSON.parse(readFileSync(src, 'utf8')) as { poses: Knobs[]; fps?: number };
  const keys: (keyof Knobs)[] = ['px', 'py', 'prot', 'c1', 'c2', 'c3', 'c4', 'bx', 'by', 'brot', 'bsx', 'bsy', 'srot', 'balpha', 'lalpha'];
  const s: Series = {};
  for (const k of keys) s[k as string] = doc.poses.map((p) => p[k] as number);
  return { s, fps: doc.fps ?? 12, n: doc.poses.length };
}

/** Continuity repairs the fit cannot make frame by frame. */
export function tidy(s: Series): void {
  // an angle has no branch: keep the one nearest its neighbour, so a series that
  // turns right over reads as a turn rather than as a jump back
  for (const name of ['prot', 'c1', 'c2', 'c3', 'c4', 'srot', 'brot']) {
    const v = s[name];
    for (let i = 1; i < v.length; i++) {
      while (v[i] - v[i - 1] > 180) v[i] -= 360;
      while (v[i] - v[i - 1] < -180) v[i] += 360;
    }
  }
  // the squash DIRECTION is unobservable while there is no squash (§10.3's gauge
  // rule): fold it out rather than key the fitter's wander along it
  for (let i = 0; i < s.brot.length; i++) {
    if (Math.abs(s.bsx[i] - 1) < 0.05 && Math.abs(s.bsy[i] - 1) < 0.05) s.brot[i] = 0;
  }
}

/**
 * 🚫 **Not used, and the reason is a measurement.**
 *
 * §10.3 asks for both ends of every run of exactly equal values to be forced as
 * keys, and for a near-still span to be snapped to exactly still so that test can
 * see it. **This shot has no still span at all**: not one adjacent pair of
 * reference frames is pixel-identical, in any of the three animations (121 + 17 +
 * 17 frames, checked pair by pair). Even the last two frames of `ball-catch`
 * differ — the brief says the saucer and the chain are *still settling at the
 * final frame*, and they are.
 *
 * Left switched on, this function invented the one defect `check` could see: it
 * snapped the tail of `ball-catch` into a hold, and the per-frame column read
 * *"f0120, yours moved 0 px where the reference moved 28"* — §9.2's held-pose
 * defect arriving from the opposite direction, a hold authored where the shot has
 * none. So the rule is kept and the step is not: **snap a hold only where the
 * frames show one**, and here they show none.
 */
export function snapHolds(s: Series, tolPx: number): void {
  if (!HOLDS_IN_THIS_SHOT) return;
  for (const [name, v] of Object.entries(s)) {
    const unit = holdEps(name, tolPx);
    let i = 0;
    while (i < v.length - 1) {
      let j = i;
      while (j + 1 < v.length && Math.abs(v[j + 1] - v[i]) <= unit) j++;
      if (j > i + 1) { const m = v[i]; for (let q = i; q <= j; q++) v[q] = m; i = j; } else i++;
    }
  }
}

function holdEps(name: string, tolPx: number): number {
  const frac = 0.35; // well under the fit's own resolution
  if (name === 'px' || name === 'py' || name === 'bx' || name === 'by') return tolPx * frac * PXU;
  if (name === 'bsx' || name === 'bsy') return (tolPx * frac) / (103 * 0.0869008);
  if (name === 'balpha') return 0.02;
  const lever = LEVER[name] ?? 200;
  return (tolPx * frac * PXU * 180) / (Math.PI * lever);
}

/** One tolerance in pixels, converted by the knob's own lever arm (§10.3). */
export function tolFor(name: string, tolPx: number): number {
  if (name === 'px' || name === 'py' || name === 'bx' || name === 'by') return tolPx * PXU;
  if (name === 'bsx' || name === 'bsy') return tolPx / (103 * 0.0869008);
  if (name === 'balpha') return 0.06;
  const lever = LEVER[name] ?? 200;
  return (tolPx * PXU * 180) / (Math.PI * lever);
}

export interface Timeline { target: 'bone' | 'slot'; name: string; property: string; channels: string[]; spans: Span[]; series: number[][] }

/** Plan one timeline. `channels` are the knob names it carries, in field order. */
export function planTimeline(s: Series, channels: string[], tolPx: number, table: [number, number][]): { spans: Span[]; series: number[][] } {
  const series = channels.map((c) => s[c]);
  // one tolerance for the timeline: scale each channel so the tolerance is 1
  const scale = channels.map((c) => 1 / tolFor(c, tolPx));
  const forced = forcedIndices(series.map((v, i) => v.map((x) => x * scale[i])));
  const spans = planSeries(series, { tol: 1, table, forced, channelScale: scale, maxSpan: 64 });
  return { spans, series };
}

/** Is this channel set worth a timeline at all, against the setup value? */
export function isFlat(series: number[][], setup: number[], tolPx: number, channels: string[]): boolean {
  for (let c = 0; c < series.length; c++) {
    const t = tolFor(channels[c], tolPx);
    for (const v of series[c]) if (Math.abs(v - setup[c]) > t) return false;
  }
  return true;
}

export const round = (x: number, d = 4): number => Number(x.toFixed(d));

/** The residual a plan leaves on the samples, in pixels — the reduction's own cost. */
export function planResidual(spans: Span[], series: number[][], channels: string[]): number {
  let worst = 0;
  for (const sp of spans) {
    for (let c = 0; c < series.length; c++) {
      const v = series[c];
      const dv = v[sp.j] - v[sp.i];
      for (let m = sp.i + 1; m < sp.j; m++) {
        const u = (m - sp.i) / (sp.j - sp.i);
        const d = Math.abs(v[sp.i] + dv * bez(u, sp.hy1, sp.hy2) - v[m]);
        const px = pxOf(channels[c], d);
        if (px > worst) worst = px;
      }
    }
  }
  return worst;
}

function pxOf(name: string, delta: number): number {
  if (name === 'px' || name === 'py' || name === 'bx' || name === 'by') return delta / PXU;
  if (name === 'bsx' || name === 'bsy') return delta * 103 * 0.0869008;
  if (name === 'balpha') return delta * 4;
  const lever = LEVER[name] ?? 200;
  return (delta * Math.PI / 180) * lever / PXU;
}

export { HX1, HX2, isLinear, writeFileSync };
