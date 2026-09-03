/**
 * The one place the stage's geometry is written down.
 *
 * `make_parts.ts` needs it so the plate's glow and contact shadow land under
 * the figure; `make_specs.ts` needs it so the rig puts the figure there. Two
 * copies of these six numbers is how the shadow ends up under nobody's feet.
 *
 * Units are art pixels — 2x the final GIF, so every rotated edge is
 * supersampled and downsampled once at the end.
 */

/** The stage plate, and therefore rigc's framing box. */
export const PLATE_W = 1280;
export const PLATE_H = 864;

/** Where the hip bone sits on the plate, in Spine world coordinates (y up). */
export const HIP_X = 770;
export const HIP_Y = 302;

/**
 * The band along the bottom of the stage the GIF writes its caption into, in
 * art pixels. Nothing — no scattered plate, no part of the figure — may reach
 * into it, or the type lands on top of the art. `make_specs.ts` checks it.
 */
export const BAND_H = 122;

/** The figure's own extent above and below its hip, from the bone table. */
export const FEET_BELOW_HIP = 120;
export const EARS_ABOVE_HIP = 484;

/** Palette — two hues plus ink, shared by the art and the caption band. */
export const INK = '#241E2B';
export const FUR = '#F2D49C';
export const FUR_LT = '#FBE8C4';
export const FUR_DK = '#DCB472';
export const TEAL = '#4FC7B4';
export const TEAL_DK = '#2E9A8A';
export const BLUSH = '#E98D7C';
export const GROUND = '#1b1f26';
