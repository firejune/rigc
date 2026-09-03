/**
 * The film's geometry and palette, in one place.
 *
 * Film three is a PORTRAIT rig in a LANDSCAPE frame, and that is not a taste —
 * it is arithmetic. `gallery/portrait`'s plate is 640x880, so a bust framing
 * that keeps the cowlick at the top and the shoulders at the bottom is ~500
 * plate units tall. In a 600x405 film (films one and two's shape, kept so the
 * three read as a set) the stage above the caption band is 359px tall, and
 *
 *     head width on screen = 340 · 359 / windowHeight
 *
 * which depends on the window's HEIGHT alone. ⇒ narrowing the figure pane costs
 * nothing but side margin, and the space it frees is free type space. That is
 * why the type sits in a column beside her rather than in a band under her.
 */

/** The final canvas. Films one and two are 600x405; this is the third of a set. */
export const GIF_W = 600;
export const GIF_H = 405;

/** The caption band along the bottom, and therefore the stage's height. */
export const BAND_H = 46;
export const STAGE_H = GIF_H - BAND_H;

/** The figure pane on the left, and the type column on the right. */
export const PANE_W = 344;
export const COL_X = PANE_W;
export const COL_W = GIF_W - PANE_W;

/** Type inset inside the column: 224px of text, which is 44 chars at 9pt. */
export const COL_PAD = 16;
export const TEXT_X = COL_X + COL_PAD;
export const TEXT_W = COL_W - 2 * COL_PAD;

/**
 * The bust window, in PLATE units (the plate is 640x880, y down from its top).
 *
 * Measured, not guessed: the figure's ink across the film's own frames — rest,
 * both breath extremes, the blink, the gaze hold and the yaw hold — spans plate
 * x 113.1..531.2 and reaches y 13.3 at the cowlick's tip (`probe/inkbbox.log`).
 * The window below clears that by ~40 units on each side and 13 above.
 */
export const WIN_Y0 = 0;
export const WIN_Y1 = 520;
/** The ink's own horizontal centre, which is 2 units right of the yaw axis. */
export const WIN_CX = 322.15;

/** Where the yaw axis is, in plate units: the head bone's world x. */
export const YAW_AXIS_X = 320;

/** Palette — `gallery/rigby.ts`'s, which is also Vela's, plus films 1–2's type greys. */
export const TEAL = '#4FC7B4';
export const HEAD = '#f2d49c';
export const BODY = '#aeb9c8';
export const LABEL = '#93a0b0';
export const CMD = '#7b8695';
export const DIM = '#5c6672';
export const PANEL = '#141922';
export const PANEL_EDGE = '#2b3341';
