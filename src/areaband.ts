/**
 * The area band a triangle's sign is read against — the one A39 reads a
 * winding by, and the one the mesh-quality measurement reads orientation and
 * degeneracy by (`src/meshquality.ts`).
 *
 * Moved here unchanged from `src/deformsurvey.ts`, which imports these back
 * and re-exports every name it exported before, so no caller changed an import
 * — and `stretchSingularValues` after them (issue #1230), for the motion
 * comparison (`src/meshcompare.ts`), which reads a triangle's stretch the way
 * the deform survey does and must not reach the compiler either.
 * They moved because a module the `rig-c/mesh` entry reaches has to read
 * the same band, and `src/deformsurvey.ts` reaches the compiler and the core
 * (`src/deformstructure.ts`, `src/core/`) — a geometry entry that loaded the
 * compiler to read three numbers would also close an import cycle through
 * `src/compile.ts`, which imports `src/mesh.ts`.
 *
 * Imports nothing: no clock, no runtime, no other module.
 */

/**
 * How near zero a triangle's area has to be, as a fraction of the largest
 * triangle in the same mesh at the same pose, before a sign is not read off it.
 *
 * A RELATIVE band, because an absolute one has no scale that means anything on
 * its own — these are pixel² figures on whatever plate the rig was drawn at, and
 * `gallery/flex`'s leaf tops out at 792.6 px² where `spineboy-pro`'s hoverboard
 * reaches 3338.4 px². On those two it comes to 7.9e-4 and 3.3e-3 px².
 *
 * ⚠️ It is **not** what holds the float32 noise off; `float32AreaNoise` is, and
 * the two are combined rather than ranked because on a big mesh the noise bound
 * is the larger of them. This one is the shape band: it keeps a setup triangle
 * that has no area from being read as a reversal of anything, and a triangle the
 * key collapses onto zero from being read as turned over.
 */
export const DEFORM_AREA_EPSILON = 1e-6;

/** Half an ulp of a float32 mantissa — the relative error of one stored coordinate. */
const FLOAT32_HALF_ULP = 2 ** -24;

/**
 * An upper bound on how much of a triangle's signed area is float32 noise.
 *
 * The world vertices arrive in a `Float32Array`, so each coordinate carries up
 * to `|c|·2⁻²⁴` of error. An area is `½·(Δx₁·Δy₂ − Δx₂·Δy₁)`, and propagating
 * that error through one product gives `Δ·|c|·2⁻²⁴` twice over; four such terms
 * across the two products, halved, bounds the area error by `2·C²·2⁻²⁴` with `C`
 * the largest coordinate magnitude in the mesh (which also bounds every `Δ`).
 * Doubled once more for the subtraction, so the constant is 4.
 *
 * On a mesh whose vertices reach 500 units that is 6e-2 px², i.e. **larger** than
 * the relative band above — which is the whole reason this exists. It is a bound
 * rather than a measurement, and deliberately loose: what has to stay clear of it
 * is a genuine reversal, and the smallest one anywhere in the corpus is
 * `spineboy-pro`'s hoverboard triangle at 8.478 px², more than two orders of
 * magnitude above. Nothing measured lands between the two, so nothing between
 * them is being tuned.
 */
export function float32AreaNoise(world: ArrayLike<number>): number {
  let coordinate = 0;
  for (let i = 0; i < world.length; i++) coordinate = Math.max(coordinate, Math.abs(world[i]));
  return 4 * coordinate * coordinate * FLOAT32_HALF_ULP;
}

/**
 * Twice-signed area, halved, of every triangle of `triangles` over the
 * interleaved `x, y` world vertices in `world`.
 *
 * The SIGN is the whole point and the magnitude is the tolerance's yardstick, so
 * this returns the signed figure rather than an absolute one. Positive and
 * negative are not "correct" and "wrong" — a mesh may be wound either way, and
 * what A39 reads is whether one triangle's sign CHANGED.
 */
export function triangleAreas(world: ArrayLike<number>, triangles: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const i0 = triangles[t] * 2;
    const i1 = triangles[t + 1] * 2;
    const i2 = triangles[t + 2] * 2;
    const x0 = world[i0];
    const y0 = world[i0 + 1];
    out.push(0.5 * ((world[i1] - x0) * (world[i2 + 1] - y0) - (world[i2] - x0) * (world[i1 + 1] - y0)));
  }
  return out;
}

/**
 * The dead band a set of areas is read against.
 *
 * Both bands, and the wider one wins. The relative one is about the SHAPE (a
 * triangle with no area has no winding); the noise one is about the arithmetic (a
 * sign read off float32 rounding is not a measurement). Each is the larger on a
 * different mesh.
 */
export function areaBand(plainAreas: readonly number[], ...worlds: ReadonlyArray<ArrayLike<number>>): number {
  const largest = plainAreas.reduce((m, a) => Math.max(m, Math.abs(a)), 0);
  let band = largest * DEFORM_AREA_EPSILON;
  for (const world of worlds) band = Math.max(band, float32AreaNoise(world));
  return band;
}

/**
 * The two singular values of the linear map that takes one triangle onto the
 * other — the largest and smallest factor by which it scales a direction.
 *
 * ## Why this is the texture's stretch
 *
 * A mesh's uvs are fixed to the attachment and a deform never touches them, so
 * the texture is mapped affinely onto the *plain* triangle and the same texels
 * end up on the *deformed* one. The change in that mapping is exactly `J = D·P⁻¹`
 * with `P` and `D` the two triangles' edge pairs, and its singular values are the
 * worst stretch and the worst squash the drawing takes there. A σ of 1.4 means
 * every texel in that direction is drawn 1.4 px wide; 0.6 means the art is
 * crushed to 60%.
 *
 * `σ₁·σ₂ = |det J|` is the signed-area ratio's magnitude, which is why the two
 * quantities in the report cannot disagree — and `DR01` is the control that says
 * so on a case whose ratio the closed form predicts.
 *
 * Returns `null` for a plain triangle with no area: `P` is singular, there is no
 * map, and inventing one would be the report's own version of the false green
 * this file exists to avoid. Those triangles are counted as `degenerate`.
 */
export function stretchSingularValues(
  plain: ArrayLike<number>,
  deformed: ArrayLike<number>,
  triangles: ArrayLike<number>,
  t: number,
): { max: number; min: number } | null {
  const i0 = triangles[t * 3] * 2;
  const i1 = triangles[t * 3 + 1] * 2;
  const i2 = triangles[t * 3 + 2] * 2;
  const ux = plain[i1] - plain[i0];
  const uy = plain[i1 + 1] - plain[i0 + 1];
  const vx = plain[i2] - plain[i0];
  const vy = plain[i2 + 1] - plain[i0 + 1];
  const det = ux * vy - vx * uy;
  if (det === 0) return null;
  const px = deformed[i1] - deformed[i0];
  const py = deformed[i1 + 1] - deformed[i0 + 1];
  const qx = deformed[i2] - deformed[i0];
  const qy = deformed[i2 + 1] - deformed[i0 + 1];
  // J = D·P⁻¹, written out — P⁻¹ = (1/det)·[[vy, −vx], [−uy, ux]].
  const a = (px * vy - qx * uy) / det;
  const b = (-px * vx + qx * ux) / det;
  const c = (py * vy - qy * uy) / det;
  const d = (-py * vx + qy * ux) / det;
  // σ₁² + σ₂² = ‖J‖²_F and σ₁·σ₂ = |det J|, which is two equations for the two
  // values and needs no eigen decomposition. The discriminant is non-negative in
  // exact arithmetic (it is `(σ₁² − σ₂²)²`); the clamp is for rounding on a map
  // that is very nearly a rotation.
  const frobenius = a * a + b * b + c * c + d * d;
  const determinant = a * d - b * c;
  const discriminant = Math.max(0, frobenius * frobenius - 4 * determinant * determinant);
  const root = Math.sqrt(discriminant);
  return {
    max: Math.sqrt(Math.max(0, (frobenius + root) / 2)),
    min: Math.sqrt(Math.max(0, (frobenius - root) / 2)),
  };
}
