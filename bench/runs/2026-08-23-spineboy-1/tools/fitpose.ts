/**
 * Fit a set of placements to one reference frame by composite descent.
 *
 * The objective is the sum of absolute RGB difference over the **whole frame**
 * between the candidate composite and the reference PNG — one number, computed
 * on pixels both sides can only have got from the same rasteriser. Per-part
 * template matching (`match.ts`) is only ever the initialiser: on a character
 * every interesting frame has parts touching, and §8's first trap is exactly
 * that a per-part estimator changes meaning there. The composite has no such
 * failure, because what it scores is the picture.
 */
import { Plate } from '../../../../tools/plate.ts';
import type { Viewport } from '../../../../src/render.ts';
import { renderPlacements, sad, type Placement } from './lib.ts';

export interface FitOptions {
  /** which placement indices may move */
  free?: number[];
  /** fit one shared art scale across every placement */
  fitScale?: boolean;
  posSteps?: number[];
  rotSteps?: number[];
  scaleSteps?: number[];
  /** cap on descent passes per step size */
  passes?: number;
  log?: (s: string) => void;
}

export interface FitResult {
  placements: Placement[];
  scale: number;
  sad: number;
  evals: number;
}

export function fitPose(
  start: Placement[],
  ref: Plate,
  viewport: Viewport,
  globalScale = 1,
  opts: FitOptions = {},
): FitResult {
  const posSteps = opts.posSteps ?? [24, 10, 4, 1.5, 0.6, 0.25];
  const rotSteps = opts.rotSteps ?? [10, 4, 1.5, 0.6, 0.25, 0.1];
  const scaleSteps = opts.scaleSteps ?? [0.04, 0.016, 0.006, 0.0025, 0.001, 0.0004];
  const passes = opts.passes ?? 3;
  const free = opts.free ?? start.map((_, i) => i);
  let evals = 0;
  const current = start.map((p) => ({ ...p }));
  let scale = globalScale;

  const withScale = (list: Placement[], s: number): Placement[] => list.map((p) => ({ ...p, sx: s, sy: s }));
  const cost = (list: Placement[], s: number): number => {
    evals++;
    return sad(renderPlacements(withScale(list, s), viewport), ref);
  };

  let best = cost(current, scale);
  for (let level = 0; level < posSteps.length; level++) {
    const ps = posSteps[level];
    const rs = rotSteps[level];
    const ss = scaleSteps[level];
    for (let pass = 0; pass < passes; pass++) {
      let moved = false;
      for (const i of free) {
        for (const axis of ['cx', 'cy', 'rot'] as const) {
          const step = axis === 'rot' ? rs : ps;
          for (const dir of [1, -1]) {
            let improvedHere = false;
            for (;;) {
              const before = current[i][axis];
              current[i][axis] = before + dir * step;
              const c = cost(current, scale);
              if (c < best - 1e-9) {
                best = c;
                moved = true;
                improvedHere = true;
              } else {
                current[i][axis] = before;
                break;
              }
            }
            if (improvedHere) break;
          }
        }
      }
      if (opts.fitScale) {
        for (const dir of [1, -1]) {
          let improvedHere = false;
          for (;;) {
            const before = scale;
            scale = before + dir * ss;
            const c = cost(current, scale);
            if (c < best - 1e-9) {
              best = c;
              moved = true;
              improvedHere = true;
            } else {
              scale = before;
              break;
            }
          }
          if (improvedHere) break;
        }
      }
      opts.log?.(`  level ${level} pass ${pass}: sad ${best.toFixed(0)} scale ${scale.toFixed(5)} evals ${evals}`);
      if (!moved) break;
    }
  }
  return { placements: withScale(current, scale), scale, sad: best, evals };
}
