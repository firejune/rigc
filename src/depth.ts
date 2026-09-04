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

// ---------------------------------------------------------------------------
// Two evaluations of one turn, compared
// ---------------------------------------------------------------------------

/**
 * The 2.5D turn's displacement along the driving axis, for one point.
 *
 * The same closed form `evaluateDeformTransform` runs, written once more here
 * because this file compares two ways of EVALUATING it and neither may quietly
 * be a different model. `u` is the point's offset from the axis; `z` is how far
 * in front of that axis it sits.
 */
export function turnDisplacement(u: number, z: number, radians: number): number {
  return u * (Math.cos(radians) - 1) - z * Math.sin(radians);
}

/** What a field comparison measured. Pixels, in the part's own grid. */
export interface FieldAgreement {
  /** Pixels compared: inside the art and inside some triangle. */
  samples: number;
  /** Pixels the mesh covers that the art does not reach, or vice versa. */
  skipped: number;
  /** Mean |mesh − continuous| displacement, in part pixels. */
  mean: number;
  /** Worst |mesh − continuous| displacement, in part pixels. */
  worst: number;
}

/**
 * How closely a mesh's piecewise-linear turn reproduces the continuous one.
 *
 * ## What this measures, and what it does not
 *
 * ⚠️ It is **not** a check of the sampler. Both sides read the same sheet
 * through `sampleDepth`, deliberately — a comparison where the two sides
 * disagreed about the depth would be measuring the wrong thing. `DP01`–`DP03`
 * in `selftest.ts` are what hold the sampler honest.
 *
 * What differs is the **evaluation**. The continuous side gives every pixel its
 * own depth and displaces it by that; the mesh side gives depth to its vertices
 * only and interpolates linearly across each triangle. That is the whole
 * approximation a mesh IS, and this puts a number on it: the two agree where
 * the depth field is locally flat across a cell, and part where it curves.
 *
 * ⭐ So the figure to read is not the absolute error but **how it falls as the
 * lattice refines**. A mesh that is evaluating the same model converges on it;
 * one that is evaluating something else does not, however dense it gets.
 *
 * 🚨 And it is a different quantity from FACE §4.2's fold angle, which gets
 * WORSE as the columns refine. Both are true and they are not in tension:
 * refining the lattice buys fidelity to the model and costs the angle at which
 * a column pair inverts. This measures the first; `A39` refuses the second.
 */
export function compareTurnFields(input: {
  map: DepthMap;
  near: DepthNear;
  tone: DepthTone;
  zScale: number;
  /** One byte per pixel over the same grid; a pixel under `threshold` is not art. */
  alpha: Uint8Array;
  threshold: number;
  /** Mesh vertices in part-local pixels, y down. */
  points: ReadonlyArray<readonly [number, number]>;
  triangles: ReadonlyArray<number>;
  degrees: number;
  /** Where the axis crosses the driving coordinate, in part pixels. Default 0. */
  about?: number;
  /** 'yaw' reads x and displaces x; 'pitch' reads y and displaces y. */
  kind?: 'yaw' | 'pitch';
  /**
   * The mesh side's per-vertex `z`, when it should NOT come from the map.
   *
   * Two uses, and the second is the important one. A caller that has the
   * compiler's own sampled depths can pass them, so the comparison is against
   * what was actually emitted rather than against a re-sampling. And a NEGATIVE
   * control can pass depths from a different model entirely — a cylinder's, say
   * — which is what makes the convergence claim mean anything: a mesh
   * evaluating the same model converges on it, and one evaluating another does
   * not, however dense it gets.
   */
  vertexDepths?: readonly number[];
}): FieldAgreement {
  const { map, near, tone, zScale, alpha, threshold, points, triangles, degrees } = input;
  const about = input.about ?? 0;
  const along = (input.kind ?? 'yaw') === 'yaw' ? 0 : 1;
  const rad = (degrees * Math.PI) / 180;

  if (input.vertexDepths !== undefined && input.vertexDepths.length !== points.length) {
    throw new DepthError(
      `the mesh has ${points.length} vertices and ${input.vertexDepths.length} depths were supplied for it`,
    );
  }
  // The mesh side, per vertex, once.
  const vertexShift = points.map((p, v) =>
    turnDisplacement(
      p[along] - about,
      input.vertexDepths === undefined ? sampleDepth(map, p[0], p[1], near, tone, zScale) : input.vertexDepths[v],
      rad,
    ),
  );

  const { width: w, height: h } = map;
  // Which pixels a triangle covered, so a pixel in two triangles is counted
  // once and the untouched remainder can be reported rather than ignored.
  const seen = new Uint8Array(w * h);
  let samples = 0;
  let total = 0;
  let worst = 0;

  for (let t = 0; t < triangles.length; t += 3) {
    const [ia, ib, ic] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const [ax, ay] = points[ia];
    const [bx, by] = points[ib];
    const [cx, cy] = points[ic];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (den === 0) continue; // a degenerate triangle covers nothing
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const i = py * w + px;
        if (seen[i] || alpha[i] < threshold) continue;
        // Pixel centres, the same convention the sampler uses.
        const sx = px + 0.5;
        const sy = py + 0.5;
        const l0 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / den;
        const l1 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / den;
        const l2 = 1 - l0 - l1;
        if (l0 < 0 || l1 < 0 || l2 < 0) continue;
        seen[i] = 1;
        const meshShift = l0 * vertexShift[ia] + l1 * vertexShift[ib] + l2 * vertexShift[ic];
        const u = (along === 0 ? sx : sy) - about;
        const exact = turnDisplacement(u, sampleDepth(map, sx, sy, near, tone, zScale), rad);
        const d = Math.abs(meshShift - exact);
        samples++;
        total += d;
        if (d > worst) worst = d;
      }
    }
  }

  let skipped = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] >= threshold && !seen[i]) skipped++;
  return { samples, skipped, mean: samples === 0 ? 0 : total / samples, worst };
}
