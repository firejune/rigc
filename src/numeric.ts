/**
 * The length of a 2-D vector, spelled so that every platform returns the same bits
 * (issue #1377).
 *
 * `Math.sqrt(dx * dx + dy * dy)` and not `Math.hypot(dx, dy)`. IEEE 754 requires
 * `*`, `+` and `sqrt` to be correctly rounded, so this expression has one answer
 * for one input wherever it runs; `Math.hypot` carries no such requirement, and
 * Bun 1.4.2's was measured returning 34.27192399143071 on macOS and
 * 34.27192399143072 on Linux for the same bit-identical input (rig-c/parts#276).
 * One ulp is enough to turn a strict win into a tie, move a value across a
 * rounding grid, or reorder a sort — each of which this tree writes to disk.
 *
 * What it gives up is `hypot`'s guard against intermediate overflow and
 * underflow: the squares overflow above about 1.3e154 and lose precision below
 * about 1.5e-154. Every length measured here is in pixels, world units or UV
 * units, many orders of magnitude inside both.
 *
 * 🔒 `CUR128` in `selftest.ts` holds `src/` and every module `src/` imports from
 * outside itself free of `Math.hypot`, naming the file and symbol of any call.
 */
export function hypot2(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}
