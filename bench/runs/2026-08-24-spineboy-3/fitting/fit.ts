/**
 * Whole-composite pose fit (§8.1): coarse-to-fine, full-range scans per knob,
 * neighbour seeding, parents before children, one calibrated front/rear
 * assignment pinned for the run.
 */
import { Rigger, fullViewport, windowViewport, cost, ink, inkCentre, readPlate, cropPlate } from './harness.ts';
import type { Plate } from '../tools/plate.ts';
import type { Viewport } from '../src/render.ts';

export const REF = 'bench/reference/spineboy/ess';
export const CAND = 'bench/runs/2026-08-24-spineboy-3/ess/spine';

export type Pose = Record<string, Partial<Record<'rotation' | 'x' | 'y' | 'scaleX' | 'scaleY', number>>>;
export interface Knob { bone: string; prop: 'rotation' | 'x' | 'y'; lo: number; hi: number; step: number }

/** the chain order a scan walks: a parent settles before its children. */
export const ORDER = [
  'hip', 'torso', 'neck', 'head',
  'rear-thigh', 'rear-shin', 'rear-foot',
  'front-thigh', 'front-shin', 'front-foot',
  'rear-upper-arm', 'rear-bracer', 'gun',
  'front-upper-arm', 'front-bracer', 'front-fist',
];

/**
 * How far each bone can plausibly turn, in degrees off the setup pose. §8.1's
 * "scan each knob's WHOLE plausible range" — a line search out from where a
 * bone sits cannot bring an arm 60 degrees round.
 */
export const SPAN: Record<string, number> = {
  torso: 60, neck: 45, head: 50,
  'front-thigh': 110, 'front-shin': 125, 'front-foot': 75,
  'rear-thigh': 110, 'rear-shin': 125, 'rear-foot': 75,
  'front-upper-arm': 170, 'front-bracer': 165, 'front-fist': 95,
  'rear-upper-arm': 170, 'rear-bracer': 165, gun: 95,
};
export function knobsFor(base: Pose, wide = false): Knob[] {
  const out: Knob[] = [];
  for (const bone of ORDER) {
    if (bone === 'hip') {
      out.push({ bone, prop: 'x', lo: -460, hi: 300, step: 14 });
      out.push({ bone, prop: 'y', lo: -260, hi: 800, step: 14 });
      out.push({ bone, prop: 'rotation', lo: -180, hi: 180, step: 6 });
      continue;
    }
    const span = SPAN[bone] ?? 70;
    if (wide) out.push({ bone, prop: 'rotation', lo: -span, hi: span, step: 6 });
    else {
      const cur = base[bone]?.rotation ?? 0;
      out.push({ bone, prop: 'rotation', lo: Math.max(-span, cur - 55), hi: Math.min(span, cur + 55), step: 3 });
    }
  }
  return out;
}
/** the two-link pairs §8.1 says only decide together. */
export const PAIRS: [string, string][] = [
  ['front-upper-arm', 'front-bracer'], ['rear-upper-arm', 'rear-bracer'],
  ['front-thigh', 'front-shin'], ['rear-thigh', 'rear-shin'],
];

export class Fitter {
  rig: Rigger;
  full: Viewport;
  constructor(dir = CAND) {
    this.rig = new Rigger(dir);
    this.full = fullViewport(`${REF}/frames.json`);
  }
  window(px: number, py: number, w: number, h: number): Viewport {
    return windowViewport(this.full, px, py, w, h);
  }
  cost(pose: Pose, view: Viewport, refCrop: Plate, block: number): number {
    this.rig.apply(pose);
    return cost(this.rig.render(view), refCrop, block);
  }
  /**
   * The objective with the guard that stops the search DELETING the figure.
   * On a shot whose poses the scan cannot reach — `hit` opens on a horizontal
   * body — moving the rig out of the window scores better than posing it
   * wrongly, and a coordinate scan will take that trade every time. Charging
   * the ink shortfall makes an empty frame the most expensive answer there is.
   */
  costGuarded(pose: Pose, view: Viewport, refCrop: Plate, block: number, refInk: number): number {
    this.rig.apply(pose);
    const mine = this.rig.render(view);
    const base = cost(mine, refCrop, block);
    const mineInk = ink(mine);
    const short = Math.max(0, 1 - mineInk / Math.max(1, refInk));
    return base + 40 * short * short;
  }
  centreOf(pose: Pose, view: Viewport): [number, number] | null {
    this.rig.apply(pose);
    return inkCentre(this.rig.render(view));
  }
}

/** one coordinate pass: scan each knob over its range, keep the best. */
export function scanPass(f: Fitter, pose: Pose, knobs: Knob[], view: Viewport, refCrop: Plate, block: number, seeds: number[][] = []): number {
  let best = f.cost(pose, view, refCrop, block);
  for (let k = 0; k < knobs.length; k++) {
    const kn = knobs[k];
    const slot = (pose[kn.bone] ??= {});
    const cur = slot[kn.prop] ?? 0;
    let bestV = cur;
    const tries: number[] = [];
    for (let v = kn.lo; v <= kn.hi + 1e-9; v += kn.step) tries.push(v);
    for (const s of seeds) if (s[k] !== undefined) tries.push(s[k]);
    for (const v of tries) {
      slot[kn.prop] = v;
      const c = f.cost(pose, view, refCrop, block);
      if (c < best) { best = c; bestV = v; }
    }
    slot[kn.prop] = bestV;
  }
  return best;
}

/** local refinement: shrinking steps around the current value. */
export function refinePass(f: Fitter, pose: Pose, knobs: Knob[], view: Viewport, refCrop: Plate, block: number, steps: number[]): number {
  let best = f.cost(pose, view, refCrop, block);
  for (const st of steps) {
    for (const kn of knobs) {
      const slot = (pose[kn.bone] ??= {});
      const cur = slot[kn.prop] ?? 0;
      let bestV = cur;
      for (const v of [cur - st, cur + st, cur - st / 2, cur + st / 2]) {
        slot[kn.prop] = v;
        const c = f.cost(pose, view, refCrop, block);
        if (c < best - 1e-6) { best = c; bestV = v; }
      }
      slot[kn.prop] = bestV;
    }
  }
  return best;
}

export function refFrame(anim: string, i: number): Plate {
  return readPlate(`${REF}/${anim}/f${String(i).padStart(4, '0')}.png`);
}
export { cropPlate };
