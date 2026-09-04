/**
 * A **depth map** as a mesh input: a greyscale sheet, in the part's own pixel
 * grid, that says how far in front of the turn axis each pixel sits.
 *
 * ## Why this is an input and not a measurement
 *
 * `yaw` and `pitch` (`src/deformgen.ts`) turn a part by treating it as painted
 * on a cylinder: a vertex at `u` off the axis gets `z = √(radius² − u²)`, and
 * the key is that rotation projected back to the screen. One radius per
 * attachment is a whole model of a shape, and it is the right model for a
 * fringe or a plate that really does bend like a barrel.
 *
 * It is the wrong model for a face. A nose is not on the skull's cylinder, an
 * ear is behind it, and no single radius puts both where they are — the
 * cylinder answers "how far off the axis is this column" when the question is
 * "how far forward is this pixel". A depth map answers the second question
 * directly, per vertex, and the arithmetic downstream does not otherwise
 * change: the same closed form runs, with `z` read instead of derived.
 *
 * ⚠️ **The map is relative and rigc does not make it absolute.** 8 bits of
 * level say nothing about world units, so `zScale` — how far apart level 0 and
 * level 255 are — is an authored number, exactly like `radius` was. rigc
 * refuses to guess it, records the map's digest so a claim can name which sheet
 * produced it, and reports the range it actually sampled. What it will not do
 * is measure a plate and invent a depth from it.
 *
 * ## The tone curve, and why it lives here
 *
 * A consumer that renders the same sheet in a shader applies a tone curve
 * before displacing anything — gamma, contrast, bias. If rigc sampled the raw
 * level and the shader sampled a curved one, the mesh and the shader would be
 * two different surfaces and the cross-check between them (#382's positive
 * control) would compare nothing. So the curve is stated in the spec, applied
 * here, and written into the report in the form the consumer can compare
 * against.
 *
 * Order of operations, fixed and stated because every one of them is a place
 * two implementations can silently disagree:
 *
 *   1. **bilinear sample of the RAW level**, at pixel centres — this is what a
 *      GPU's linear filter does, and doing it after the curve would filter a
 *      different function;
 *   2. **`near`**, which turns a level into a nearness in 0..1;
 *   3. **the tone curve**, clamped back into 0..1;
 *   4. **`zScale`**, which is the only step carrying units.
 */
import { createHash } from 'node:crypto';

/** Which end of the range is closest to the viewer. */
export type DepthNear = 'white' | 'black';

/**
 * The curve applied between "nearness in 0..1" and the value `zScale` multiplies.
 *
 * Stated in full rather than left partly defaulted, so the report can print the
 * curve a consumer has to match without a reader having to know which fields
 * were written and which were filled in.
 */
export interface DepthTone {
  /** Applied to the 0..1 nearness. 1 is a straight line. */
  gamma: number;
  /** Fanned about 0.5. 1 leaves the range alone. */
  contrast: number;
  /** Added after the fan. 0 leaves the midpoint alone. */
  bias: number;
}

/** The curve that changes nothing — what an unstated tone block means. */
export const DEPTH_TONE_IDENTITY: DepthTone = { gamma: 1, contrast: 1, bias: 0 };

export interface DepthMap {
  width: number;
  height: number;
  /** One level per pixel, row major, y down, 0..255. */
  level: Uint8Array;
}

export class DepthError extends Error {}

/**
 * Refuse a tone block that cannot describe a curve.
 *
 * `gamma` and `contrast` at or below 0 are the two that matter: a gamma of 0
 * maps every level to 1 and a contrast of 0 maps every level to the midpoint,
 * so both turn a depth map into a constant — a flat part with a file behind it,
 * which is precisely the silence this feature exists to remove.
 */
export function checkTone(tone: DepthTone, where: string): void {
  const finite = (n: number, field: string): void => {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new DepthError(`${where}: depth tone "${field}" is ${JSON.stringify(n)}; it is a finite number`);
    }
  };
  finite(tone.gamma, 'gamma');
  finite(tone.contrast, 'contrast');
  finite(tone.bias, 'bias');
  if (tone.gamma <= 0) {
    throw new DepthError(
      `${where}: depth tone "gamma" is ${tone.gamma}; a gamma at or below 0 maps every level to the same nearness, ` +
        'so the map would describe a flat part. It is a positive number, and 1 is the straight line.',
    );
  }
  if (tone.contrast <= 0) {
    throw new DepthError(
      `${where}: depth tone "contrast" is ${tone.contrast}; a contrast at or below 0 collapses the range onto the ` +
        'midpoint (or turns it inside out), so the map would describe a flat part. It is a positive number, and 1 ' +
        'leaves the range alone.',
    );
  }
}

/** Refuse a scale that carries no units. */
export function checkZScale(zScale: number, where: string): void {
  if (typeof zScale !== 'number' || !Number.isFinite(zScale)) {
    throw new DepthError(`${where}: "zScale" is ${JSON.stringify(zScale)}; it is a finite number of world units`);
  }
  if (zScale <= 0) {
    throw new DepthError(
      `${where}: "zScale" is ${zScale}; it is how many units the map's full range spans, so a positive number. ` +
        'To put the near end at the back, say "near": "black" — a negative scale states the same thing twice and ' +
        'the two can then disagree.',
    );
  }
}

/**
 * Bilinear sample of the raw level at a part-local pixel position, y down.
 *
 * Pixel `i` covers `[i, i+1)` and its centre is at `i + 0.5`, so a position is
 * converted to centre space before interpolating — sampling at `i` without that
 * shift reads a value half a pixel off, which is invisible on a smooth sheet
 * and wrong at every edge. Positions outside the map clamp to the edge texel,
 * the same as a GPU's clamp-to-edge; a vertex out there is a separate refusal
 * the caller makes, and clamping here keeps this function total.
 */
export function sampleLevel(map: DepthMap, x: number, y: number): number {
  const { width: w, height: h, level } = map;
  const u = x - 0.5;
  const v = y - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const cx = (i: number): number => (i < 0 ? 0 : i > w - 1 ? w - 1 : i);
  const cy = (j: number): number => (j < 0 ? 0 : j > h - 1 ? h - 1 : j);
  const x0c = cx(x0);
  const x1c = cx(x0 + 1);
  const y0c = cy(y0);
  const y1c = cy(y0 + 1);
  const l00 = level[y0c * w + x0c];
  const l10 = level[y0c * w + x1c];
  const l01 = level[y1c * w + x0c];
  const l11 = level[y1c * w + x1c];
  const top = l00 + (l10 - l00) * fx;
  const bottom = l01 + (l11 - l01) * fx;
  return top + (bottom - top) * fy;
}

/** A raw level in 0..255 to a nearness in 0..1, `near` applied and the curve run. */
export function toneLevel(rawLevel: number, near: DepthNear, tone: DepthTone): number {
  const nearness = near === 'white' ? rawLevel / 255 : 1 - rawLevel / 255;
  const curved = (Math.pow(nearness, tone.gamma) - 0.5) * tone.contrast + 0.5 + tone.bias;
  return curved < 0 ? 0 : curved > 1 ? 1 : curved;
}

/**
 * The whole chain at one position: sample, `near`, curve, scale.
 *
 * The four steps are the four places two implementations of one model can drift
 * apart, which is why the module header fixes their order and this function is
 * the only thing that runs them.
 */
export function sampleDepth(
  map: DepthMap,
  x: number,
  y: number,
  near: DepthNear,
  tone: DepthTone,
  zScale: number,
): number {
  return toneLevel(sampleLevel(map, x, y), near, tone) * zScale;
}

/**
 * A digest of the map's pixels, so a claim can name the sheet it was made from.
 *
 * Over the levels alone, not the PNG file: the same depth re-encoded at a
 * different compression level is the same map, and a digest that changed with
 * the encoder would make provenance unfalsifiable in the direction that
 * matters — two runs the reader believes differ when they do not.
 */
export function depthDigest(map: DepthMap): string {
  const h = createHash('sha256');
  const header = new Uint8Array(8);
  new DataView(header.buffer).setUint32(0, map.width);
  new DataView(header.buffer).setUint32(4, map.height);
  h.update(header);
  h.update(map.level);
  return h.digest('hex').slice(0, 16);
}
