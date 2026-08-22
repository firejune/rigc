/**
 * Contact depth — how far the moving part may go in before the masses meet.
 *
 * 🎯 Owner rule (2026-08-22): *"삼켜짐 깊이 기본으로는 최대 04 바디 소프트가 립에 닿을
 * 때 까지"* — the swallow depth goes, as the default, at most until `04_body_soft`
 * touches the `lip`. So the deepest inward amplitude stops being a number somebody
 * picks and becomes a fact about two plates.
 *
 * ⭐ Why it is DERIVED and not a constant: this is the same principle as the axis
 * angle. One measured manifest fact, no per-cut code — a different cut with the
 * masses placed differently gets a different, correct depth for free.
 *
 * The measurement is a 2-D one, not a projection of two edges, and it has to be:
 * the occluder is a HORSESHOE (plan 02 section 2-2), so along the axis centreline
 * there is nothing to collide with at all. The mass is far wider than the corridor,
 * so contact happens at the corridor's flanks. Reducing this to "leading edge
 * versus boundary" on the axis line would return infinity.
 *
 * ⚠️ Both plates are static in the rig — the mass hangs off `cam` and does not
 * stroke. That is exactly why the gap between them IS the room: advancing the
 * inserting side by d moves the mass and the part together, so the largest d that
 * keeps the two footprints disjoint is the deepest the part may be driven.
 */
import type { Plate } from './plate.ts';

/** Alpha at or above this reads as body. */
export const BODY_ALPHA = 128;

export interface PlateFootprint {
  plate: Plate;
  /** Window top-left in crop pixels. */
  offset: [number, number];
}

export interface ContactResult {
  /**
   * Do the two footprints meet at all within the search range?
   *
   * ⚠️ Not a formality. The two cuts of this lane share plates but differ in axis,
   * and along the second axis the mass simply never reaches the occluder - it goes
   * past it. `depth` is then the scan limit, which is a sentinel and not a
   * measurement, and writing it into a manifest as a number would hand that cut a
   * 4096px ceiling that reads as real. When this is false the correct manifest
   * value is null: the rule imposes no ceiling because the bodies never meet.
   */
  touches: boolean;
  /** Largest inward advance, in axis pixels, that keeps the footprints disjoint. */
  depth: number;
  /** Overlapping body pixels at `depth` (must be 0) and at `depth + 1` (must be > 0). */
  overlapAtDepth: number;
  overlapPastDepth: number;
  /** Where they first meet, in crop pixels — the mass pixel that lands on the lip. */
  contactPoint: [number, number] | null;
  massPixels: number;
  lipPixels: number;
  alphaThreshold: number;
}

/** Points of a plate whose alpha reads as body, in crop pixels. */
function bodyPixels(f: PlateFootprint, threshold: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let y = 0; y < f.plate.height; y++) {
    for (let x = 0; x < f.plate.width; x++) {
      if (f.plate.data[(y * f.plate.width + x) * 4 + 3] >= threshold) out.push([f.offset[0] + x, f.offset[1] + y]);
    }
  }
  return out;
}

/**
 * Largest inward advance of `mass` that does not put any of its body pixels on a
 * body pixel of `against`.
 *
 * Scans outward from 0 one pixel at a time rather than bisecting: the footprints
 * are not convex (the horseshoe has a notch), so "disjoint at d" is not monotone
 * in d and a bisection could sail straight past first contact.
 */
export function measureContactDepth(
  mass: PlateFootprint,
  against: PlateFootprint,
  /** Inward unit vector in CROP space (y down). */
  inward: [number, number],
  limit = 4096,
  threshold = BODY_ALPHA,
): ContactResult {
  const massPoints = bodyPixels(mass, threshold);
  const lipPoints = bodyPixels(against, threshold);
  const occupied = new Set<number>();
  for (const [x, y] of lipPoints) occupied.add(y * 8192 + x);

  const overlapAt = (d: number): { count: number; first: [number, number] | null } => {
    let count = 0;
    let first: [number, number] | null = null;
    for (const [x, y] of massPoints) {
      const px = Math.round(x + inward[0] * d);
      const py = Math.round(y + inward[1] * d);
      if (!occupied.has(py * 8192 + px)) continue;
      count++;
      if (!first) first = [px, py];
    }
    return { count, first };
  };

  let depth = 0;
  let contact: [number, number] | null = null;
  let touches = false;
  for (let d = 0; d <= limit; d++) {
    const hit = overlapAt(d);
    if (hit.count > 0) {
      contact = hit.first;
      touches = true;
      break;
    }
    depth = d;
  }
  return {
    touches,
    depth,
    overlapAtDepth: overlapAt(depth).count,
    overlapPastDepth: overlapAt(depth + 1).count,
    contactPoint: contact,
    massPixels: massPoints.length,
    lipPixels: lipPoints.length,
    alphaThreshold: threshold,
  };
}
