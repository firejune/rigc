/**
 * The one place the frames' own coordinate system is written down.
 *
 * `bench/reference/spineboy/ess/frames.json` records the viewport every `ess`
 * frame was drawn in. Everything this run measures is read in frame pixels and
 * authored in world units, so the two conversions live here and nowhere else.
 */
export const SCALE = 0.22297348561444258;
export const VIEW_X = -795.445317629071;
export const VIEW_Y = -138.02508173937127;
export const VIEW_W = 1722.1778586894338;
export const VIEW_H = 1644.7599339120825;
export const PIXEL_W = 384;
export const PIXEL_H = 367;

/** Frame pixels (y down) → world units (y up). */
export function p2w(px: number, py: number): [number, number] {
  return [px / SCALE + VIEW_X, VIEW_Y + VIEW_H - py / SCALE];
}

/** World units (y up) → frame pixels (y down). */
export function w2p(wx: number, wy: number): [number, number] {
  return [(wx - VIEW_X) * SCALE, (VIEW_Y + VIEW_H - wy) * SCALE];
}
