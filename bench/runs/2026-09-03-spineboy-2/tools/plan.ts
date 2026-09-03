/**
 * The knob table, the pyramid plan and the per-frame skin — the search's own
 * shape, kept out of the driver so both the fitter and the chainfit reader can
 * quote the same windows.
 */
import type { Knob } from './fitlib';

/**
 * Every window is the whole plausible range of that channel, not a band around
 * where it sits — AUTHORING §8.1's "Scan each knob's whole plausible range. Do
 * not line-search out from where it sits", and the same reasoning `chainfit`
 * gives for defaulting `--hinge` to a full turn.
 *
 * The two translate windows are sized off the FRAMES: `jump`'s apex is 167 px
 * above the floor, which the sidecar's 0.222973 px/unit makes 749 units, and
 * `death`'s slide travels about 95 px ≈ 426 units left. Both windows are set
 * beyond those so the truth is inside them (§11.4's warning applies to any
 * search, not only `pose`'s).
 */
export const KNOBS: Knob[] = [
  { bone: 'torso', kind: 'tx', min: -620, max: 260, steps: 44, fine: 14 },
  { bone: 'torso', kind: 'ty', min: -220, max: 830, steps: 42, fine: 14 },
  { bone: 'torso', kind: 'rotate', min: -190, max: 190, steps: 38, fine: 9 },
  { bone: 'head', kind: 'rotate', min: -110, max: 110, steps: 30, fine: 7 },
  { bone: 'rear-upper-arm', kind: 'rotate', min: -180, max: 180, steps: 36, fine: 9 },
  { bone: 'rear-bracer', kind: 'rotate', min: -180, max: 180, steps: 36, fine: 9 },
  { bone: 'gun', kind: 'rotate', min: -180, max: 180, steps: 36, fine: 9 },
  { bone: 'muzzle', kind: 'rotate', min: -40, max: 40, steps: 16, fine: 5 },
  { bone: 'front-upper-arm', kind: 'rotate', min: -180, max: 180, steps: 36, fine: 9 },
  { bone: 'front-bracer', kind: 'rotate', min: -180, max: 180, steps: 36, fine: 9 },
  { bone: 'front-fist', kind: 'rotate', min: -110, max: 110, steps: 24, fine: 7 },
  { bone: 'rear-thigh', kind: 'rotate', min: -180, max: 180, steps: 36, fine: 9 },
  { bone: 'rear-shin', kind: 'rotate', min: -180, max: 180, steps: 36, fine: 9 },
  { bone: 'rear-foot', kind: 'rotate', min: -120, max: 120, steps: 24, fine: 7 },
  { bone: 'front-thigh', kind: 'rotate', min: -180, max: 180, steps: 36, fine: 9 },
  { bone: 'front-shin', kind: 'rotate', min: -180, max: 180, steps: 36, fine: 9 },
  { bone: 'front-foot', kind: 'rotate', min: -120, max: 120, steps: 24, fine: 7 },
];

/** §8.1's "some knobs only decide together" — scanned over the grid. */
export const PAIRS: [string, string][] = [
  ['torso.tx', 'torso.ty'],
  ['front-thigh.rotate', 'front-shin.rotate'],
  ['rear-thigh.rotate', 'rear-shin.rotate'],
  ['front-upper-arm.rotate', 'front-bracer.rotate'],
  ['rear-upper-arm.rotate', 'rear-bracer.rotate'],
  ['rear-bracer.rotate', 'gun.rotate'],
];

/** The coarsest level places the body and nothing else — §8.1. */
export const BODY_KNOBS = ['torso.tx', 'torso.ty', 'torso.rotate', 'head.rotate'];

/**
 * Four stages. The first two score the SILHOUETTE and the last two the colour
 * — see `Level.metric` in fitlib for the measured reason (a colour mean over
 * the whole frame is minimised by drawing nothing).
 *
 * Factor 4 is 96x92 px, so one cell is 4 frame pixels: a shin is 18x41 frame
 * pixels there, five cells by ten, which satisfies §8.1's "decide each limb at
 * a level whose cells are smaller than the part that level is moving" — while
 * the body stage above it is the one that may not touch a limb.
 */
export const LEVEL_PLAN: { factor: number; knobs: string[] | null; metric: 'silhouette' | 'colour' }[] = [
  { factor: 4, knobs: BODY_KNOBS, metric: 'silhouette' },
  { factor: 4, knobs: null, metric: 'silhouette' },
  { factor: 2, knobs: null, metric: 'colour' },
  { factor: 1, knobs: null, metric: 'colour' },
];

export const SAMPLES: Record<number, number> = { 4: 30, 2: 22, 1: 12 };
export const PAIR_SAMPLES: Record<number, number> = { 4: 24, 2: 20, 1: 12 };

/**
 * Which slots show what, per set and frame.
 *
 * The flash window is the brief's, measured off the frames rather than taken on
 * trust — `tools/frames.ts` reproduces its pink-flare census. WHICH numbered
 * flare plate is on WHICH frame is something the brief says the frames cannot
 * tell you, so it is swept against them by `tools/flash.ts` and the answer is
 * written here.
 */
export interface SkinPlan {
  /** slot -> attachment or null, per frame index of the 12 fps set. */
  [set: string]: Record<number, Record<string, string | null>>;
}

export const HIDDEN_FLARE = { muzzle: null, 'muzzle-glow': null, 'muzzle-ring': null } as const;
