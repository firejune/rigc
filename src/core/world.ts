/**
 * The core's own setup evaluator: every bone's world matrix and origin from
 * the compiled model's bones (issue #925). Written from what a bone's fields
 * mean and from measurement against the runtime's pose dump
 * (`tools/pose_oracle.ts dump`, spine-core 4.3.13), and held to it by the core
 * suite's equivalence controls.
 *
 * ⭐ **The compiler's setup transforms are this evaluator too** (issue #1015),
 * under the same arithmetic (issue #1021). `src/transform.ts` held a second
 * evaluator of its own until #1015, and the two differed in exactly three
 * places, none of them a different matrix: the degree factor (`Math.PI / 180`
 * there, the runtime's 3.1415927 here), the frame of a bone with scale 1 and
 * no shear (`[cos, −sin, sin, cos]` of the rotation there, the y column at
 * `rotation + 90` here), and how a radian angle is turned into degrees
 * (divided by the degree factor there, multiplied by `180 / pi` here). #1015
 * made them a parameter (`WorldArithmetic`) so that no byte moved; #1021
 * measured which binds closer — every point the compiler binds from a world
 * position, posed by spine-core from the emitted build, against that position
 * — and the runtime's three put every one at the float32 floor where the
 * compiler's left `gallery/look`'s up to 8.6e-5 off. So the compiler passes
 * none now, and `RUNTIME_ARITHMETIC`, the measured choices below, is the only
 * arithmetic anything here runs under; the parameter stays for the plants
 * that swap one choice back in to show a control fire.
 *
 * ## What each measured choice is
 *
 * - **Degrees to radians with pi written 3.1415927.** The runtime's root bone
 *   at rotation 0 reads `b = -2.3205103333142417e-8` and
 *   `d = 0.9999999999999998`: `cos` and `sin` of 90 degrees converted with
 *   pi = 3.1415927, since `(3.1415927 - pi) / 2 = 2.3205e-8`. It is that
 *   decimal in double arithmetic — not float32: pi rounded to float32 would
 *   give `4.37e-8`, and the bone fields read through `Math.fround` moved the
 *   dump further, not closer (measured on the nineteen recipes).
 * - **The degree factor is taken once**, `pi / 180`, and every angle is
 *   multiplied by it.
 * - **The y column is `cos(rotation + 90 + shearY)` and `sin(…)` on every
 *   bone**, never `-sin`/`cos` of the rotation. With the constant above but
 *   the `-sin` form, `2-the-12-principles` stays 61 millionths off.
 * - **A root bone is its local matrix at its own `x`, `y`**: the skeleton is
 *   at the origin, unscaled, in every dump taken.
 *
 * Both halves together read IDENTICAL, worst delta exactly 0, on the 12
 * recipes without constraints (`tools/core_gate.ts`); either half alone is
 * exact on none of them.
 *
 * ## The five inherit modes
 *
 * What each mode takes from the parent, as the format's documentation words
 * it, then how it is computed here. A child's ORIGIN is always the parent's
 * matrix applied to the local `x`, `y` plus the parent's origin — the modes
 * change only the matrix.
 *
 * - `normal` — everything: parent matrix times local matrix.
 * - `onlyTranslation` — the parent's position only: the local matrix alone.
 * - `noRotationOrReflection` — the parent's scale (and what shear leaves of
 *   it), not its rotation and not a reflection. The parent's matrix is made
 *   conformal on its x axis: that axis kept, the y axis turned to 90 degrees
 *   from it with length `|det| / |x axis|` (so the area, the scale the parent
 *   carries, is kept and its sign is not); the local matrix is built at the
 *   bone's rotation MINUS the parent's x-axis angle; the product is the world.
 *   ⚠️ **A parent x axis whose squared length is at most `1e-5` squared is
 *   collapsed** (issue #979, `COLLAPSED_X_AXIS_SQ`): the conformal frame is
 *   then the parent's y column with its x component negated, beside a zero x
 *   column, and the local matrix is built at the rotation less 90 plus the y
 *   column's angle, summed in that order. Measured on a child of such a
 *   parent: by bisection on the x axis's length, 1e-5 reads collapsed and the
 *   next double above does not, at parent rotations 0, 30 and 45 (whether the
 *   runtime compares the squared length with `1e-5 · 1e-5` or the length with
 *   `1e-5`, 200,000 parents searched separated no pair); 480 probes of x axes
 *   from 1e-4 down to 1e-20 and 0 under y axes up to 2e17, sheared, scaled and
 *   reflected, read exact, where the reading this replaced (collapsed only at
 *   length 0, the y column as it is, the angle less 90) read 71 of 96 off and
 *   the rotation-first sum `rotation − (90 − angle)` 10 of 480. The zero
 *   matrix of a bone below an inactive one is the collapsed case at length 0,
 *   and it fixes the signs of zero of every child in this mode there (`CC13`).
 * - `noScale` — the parent's rotation (and reflection), not its scale: the
 *   bone's local rotation is carried through the parent's matrix as a
 *   direction, normalised to unit length; the y axis is that direction turned
 *   90 degrees, turned the other way when the parent reflects (`det < 0`);
 *   the bone's own shear and scale are applied on that frame.
 * - `noScaleOrReflection` — as `noScale`, never turned for a reflection.
 *
 * ## To the bit (issue #966)
 *
 * The rules above were measured on the oracle's six-decimal grid; three of
 * the modes matched it and not the runtime's last bit (issue #959). Held
 * against `pose_oracle.ts dump --raw` at tolerance 0 — a bone in the mode
 * under a parent rotated, scaled, sheared and reflecting, two children 1e9
 * units out (the core suite's `CR02`, 300 per mode) — three operation orders
 * are the runtime's and the grid could not tell them:
 *
 * - a radian angle is turned into degrees by multiplying with `180 / pi`
 *   (`RUNTIME_DEG`), not by dividing by `pi / 180`: the division read 106
 *   of 300 `noRotationOrReflection` bones off;
 * - `noRotationOrReflection`'s y angle is `r + shearY + 90`, the shear
 *   added before the right angle (`r + 90 + shearY` read 46 of 300 off);
 * - `noScale`'s direction is normalised by multiplying with the reciprocal
 *   of its length (dividing read 138 of 300 off).
 *
 * Measured: `normal` on 12 recipes, `onlyTranslation` on 1 and
 * `noRotationOrReflection` on 2 of the tree's corpus; all five, under rotated,
 * scaled, sheared and reflecting parents, on the hand-written probe the core
 * suite builds (`CO07`), because the corpus reaches `noScale` only on a rig
 * with constraints and `noScaleOrReflection` on none.
 */
import type { ModelBone } from '../model.ts';

/** Pi as the runtime converts degrees with it — see the header. */
export const RUNTIME_PI = 3.1415927;
const RAD = RUNTIME_PI / 180;
/** Radians to degrees as the runtime converts them (issue #966): multiplied by `180 / pi`, not divided by `pi / 180` — the two differ in the last bit. */
export const RUNTIME_DEG = 180 / RUNTIME_PI;

/** A parent x axis whose squared length is at most this is collapsed for `noRotationOrReflection` (issue #979): `1e-5` squared, as measured — see the header. */
export const COLLAPSED_X_AXIS_SQ = 0.00001 * 0.00001;

/**
 * The three places an evaluator's arithmetic may differ in the last bit while
 * computing the same matrix (issue #1015) — see the header. The core poses and
 * the compiler binds with `RUNTIME_ARITHMETIC` (issue #1021); another value is
 * a plant's.
 */
export interface WorldArithmetic {
  /** Degrees to radians: every angle is multiplied by it. */
  radiansPerDegree: number;
  /** Radians to degrees — the angle `noRotationOrReflection` takes off a parent's axis. */
  degreesOf: (radians: number) => number;
  /** A bone with scale 1 and no shear takes `[cos r, −sin r, sin r, cos r]` instead of the y column at `r + 90`; the general frame everywhere else. */
  rotationOnlyFrame: boolean;
}

/** The runtime's arithmetic, as measured (the header's three choices): what the core poses with. */
export const RUNTIME_ARITHMETIC: WorldArithmetic = {
  radiansPerDegree: RAD,
  degreesOf: (radians) => radians * RUNTIME_DEG,
  rotationOnlyFrame: false,
};

/** One bone's world transform: the matrix `[a b; c d]` and the origin, y up. */
export interface CoreWorld {
  a: number;
  b: number;
  c: number;
  d: number;
  worldX: number;
  worldY: number;
}

/** The five modes, after the first-letter fold the rig spec admits. */
export type CoreInheritMode = 'normal' | 'onlyTranslation' | 'noRotationOrReflection' | 'noScale' | 'noScaleOrReflection';

export type M2 = [number, number, number, number];

/** What computes a child's world matrix from its mode, its parent's world, its own fields and the arithmetic in force. */
export type InheritComputation = (mode: CoreInheritMode, parent: CoreWorld, bone: ModelBone, arithmetic: WorldArithmetic) => M2;

/** The matrix of a rotation, shears and scales, in the column form the header states. */
function frame(rotation: number, shearX: number, shearY: number, scaleX: number, scaleY: number, rad: number = RAD): M2 {
  const xAngle = (rotation + shearX) * rad;
  const yAngle = (rotation + 90 + shearY) * rad;
  return [Math.cos(xAngle) * scaleX, Math.cos(yAngle) * scaleY, Math.sin(xAngle) * scaleX, Math.sin(yAngle) * scaleY];
}

/** A bone's own frame — a root's matrix, and the local factor of `normal` and `onlyTranslation` — under `arithmetic`. */
function localFrame(arithmetic: WorldArithmetic, rotation: number, shearX: number, shearY: number, scaleX: number, scaleY: number): M2 {
  const rad = arithmetic.radiansPerDegree;
  if (arithmetic.rotationOnlyFrame && scaleX === 1 && scaleY === 1 && shearX === 0 && shearY === 0) {
    const cos = Math.cos(rotation * rad);
    const sin = Math.sin(rotation * rad);
    return [cos, -sin, sin, cos];
  }
  return frame(rotation, shearX, shearY, scaleX, scaleY, rad);
}

function times(p: M2, q: M2): M2 {
  return [p[0] * q[0] + p[1] * q[2], p[0] * q[1] + p[1] * q[3], p[2] * q[0] + p[3] * q[2], p[2] * q[1] + p[3] * q[3]];
}

/**
 * The unit direction a `noScale` / `noScaleOrReflection` bone's x axis takes:
 * its local rotation carried through the parent's matrix and normalised. Shared
 * by the forward frame and `localFromWorld`'s read-back (`./constraints.ts`),
 * which builds the frame to read the bone's columns in from the rotation it
 * has just read, through this same arithmetic (issue #966).
 */
export function noScaleDirection(p: M2, rotation: number, rad: number = RAD): [number, number] {
  const r = rotation * rad;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const ux = p[0] * cos + p[1] * sin;
  const uy = p[2] * cos + p[3] * sin;
  // Normalised by multiplying with the reciprocal of the length, not by dividing by it (issue #966): the division reads 1 ulp off on 375 bone-samples of the corpus's `noScale` row.
  const inverse = 1 / Math.sqrt(ux * ux + uy * uy);
  return [ux * inverse, uy * inverse];
}

/** The world matrix of a child under `parent` in `mode`, under `arithmetic` (the runtime's unless a caller passes its own). */
function modeMatrix(mode: CoreInheritMode, parent: CoreWorld, bone: ModelBone, arithmetic: WorldArithmetic = RUNTIME_ARITHMETIC): M2 {
  const rotation = bone.rotation ?? 0;
  const shearX = bone.shearX ?? 0;
  const shearY = bone.shearY ?? 0;
  const scaleX = bone.scaleX ?? 1;
  const scaleY = bone.scaleY ?? 1;
  const rad = arithmetic.radiansPerDegree;
  const p: M2 = [parent.a, parent.b, parent.c, parent.d];
  switch (mode) {
    case 'normal':
      return times(p, localFrame(arithmetic, rotation, shearX, shearY, scaleX, scaleY));
    case 'onlyTranslation':
      return localFrame(arithmetic, rotation, shearX, shearY, scaleX, scaleY);
    case 'noRotationOrReflection': {
      const xLengthSq = p[0] * p[0] + p[2] * p[2];
      let conformal: M2;
      let r: number;
      if (xLengthSq > COLLAPSED_X_AXIS_SQ) {
        const k = Math.abs(p[0] * p[3] - p[1] * p[2]) / xLengthSq;
        conformal = [p[0], -p[2] * k, p[2], p[0] * k];
        r = rotation - arithmetic.degreesOf(Math.atan2(p[2], p[0]));
      } else {
        // A collapsed x axis (issue #979): the parent's y column with its x component negated, and the rotation less 90 plus the y column's angle — see the header.
        conformal = [0, -p[1], 0, p[3]];
        r = rotation - 90 + arithmetic.degreesOf(Math.atan2(p[3], p[1]));
      }
      // The y angle adds the shear before the right angle here, unlike `frame` (issue #966): `(r + 90 + shearY)` reads last-bit off on 81 of 205 sheared or scaled bones at a 1e9 amplifier, `(r + shearY + 90)` on none; `r = rotation − parentAngle` taken first (adding the shear before the parent's angle is taken off reads 102 of 205 off).
      const xAngle = (r + shearX) * rad;
      const yAngle = (r + shearY + 90) * rad;
      return times(conformal, [Math.cos(xAngle) * scaleX, Math.cos(yAngle) * scaleY, Math.sin(xAngle) * scaleX, Math.sin(yAngle) * scaleY]);
    }
    case 'noScale':
    case 'noScaleOrReflection': {
      const [ux, uy] = noScaleDirection(p, rotation, rad);
      const flip = mode === 'noScale' && p[0] * p[3] - p[1] * p[2] < 0 ? -1 : 1;
      const turned: M2 = [ux, -uy * flip, uy, ux * flip];
      return times(turned, frame(0, shearX, shearY, scaleX, scaleY, rad));
    }
  }
}

/** The fold the rig spec admits: the first letter lower-cased; anything else is not a mode. */
function modeOf(bone: ModelBone): CoreInheritMode {
  const stated = bone.inheritMode;
  if (stated === undefined) return 'normal';
  const folded = stated.length === 0 ? stated : stated[0].toLowerCase() + stated.slice(1);
  if (folded === 'normal' || folded === 'onlyTranslation' || folded === 'noRotationOrReflection' || folded === 'noScale' || folded === 'noScaleOrReflection') return folded;
  throw new Error(`bone "${bone.name}": inheritMode ${JSON.stringify(stated)} is no mode (readModel refuses it first)`);
}

/**
 * Every bone's setup world transform, parents first as the model lists them.
 *
 * `active`, when given, is the set of bones the applied skins leave active; a
 * bone outside it is not posed. Measured on a hand-written skeleton: the
 * runtime's dump reads an inactive bone as all zeros — matrix and origin, its
 * world as a skeleton is created — and a bone under it, active or not, is
 * posed from those zeros like any child. `inherit` replaces the mode
 * computation — the core suite's plant passes a copy with one mode's sign
 * flipped, and nothing else does. `arithmetic` is the runtime's unless a
 * caller states its own, and only a plant does: `src/transform.ts` takes the
 * default since issue #1021, as every posing path does.
 */
export function worldTransforms(
  bones: readonly ModelBone[],
  active: ReadonlySet<string> | null = null,
  inherit: InheritComputation = modeMatrix,
  arithmetic: WorldArithmetic = RUNTIME_ARITHMETIC,
): Map<string, CoreWorld> {
  const out = new Map<string, CoreWorld>();
  for (const bone of bones) {
    if (active !== null && !active.has(bone.name)) {
      out.set(bone.name, { a: 0, b: 0, c: 0, d: 0, worldX: 0, worldY: 0 });
      continue;
    }
    const x = bone.x ?? 0;
    const y = bone.y ?? 0;
    if (bone.parent === undefined) {
      const [a, b, c, d] = localFrame(arithmetic, bone.rotation ?? 0, bone.shearX ?? 0, bone.shearY ?? 0, bone.scaleX ?? 1, bone.scaleY ?? 1);
      out.set(bone.name, { a, b, c, d, worldX: x, worldY: y });
      continue;
    }
    const parent = out.get(bone.parent);
    if (parent === undefined) throw new Error(`bone "${bone.name}": parent "${bone.parent}" is not posed before it`);
    const [a, b, c, d] = inherit(modeOf(bone), parent, bone, arithmetic);
    out.set(bone.name, { a, b, c, d, worldX: parent.a * x + parent.b * y + parent.worldX, worldY: parent.c * x + parent.d * y + parent.worldY });
  }
  return out;
}

/** The mode computation `worldTransforms` uses, exported so a control can wrap it. */
export { modeMatrix };
