/**
 * The core's own setup evaluator: every bone's world matrix and origin from
 * the compiled model's bones (issue #925). Written from what a bone's fields
 * mean and from measurement against the runtime's pose dump
 * (`tools/pose_oracle.ts dump`, spine-core 4.3.13), and held to it by the core
 * suite's equivalence controls; it shares no code with `src/transform.ts`,
 * which is the compiler's arithmetic and stays frozen so that no emitted byte
 * moves.
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
 *   A parent whose x axis has zero length reads its angle off the y axis
 *   instead; such a parent has `det = 0`, which the oracle's ill-conditioned
 *   rule excludes with its subtree, so that branch cannot be measured and is
 *   stated rather than claimed.
 * - `noScale` — the parent's rotation (and reflection), not its scale: the
 *   bone's local rotation is carried through the parent's matrix as a
 *   direction, normalised to unit length; the y axis is that direction turned
 *   90 degrees, turned the other way when the parent reflects (`det < 0`);
 *   the bone's own shear and scale are applied on that frame.
 * - `noScaleOrReflection` — as `noScale`, never turned for a reflection.
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

/** What computes a child's world matrix from its mode, its parent's world and its own fields. */
export type InheritComputation = (mode: CoreInheritMode, parent: CoreWorld, bone: ModelBone) => M2;

/** The matrix of a rotation, shears and scales, in the column form the header states. */
function frame(rotation: number, shearX: number, shearY: number, scaleX: number, scaleY: number): M2 {
  const xAngle = (rotation + shearX) * RAD;
  const yAngle = (rotation + 90 + shearY) * RAD;
  return [Math.cos(xAngle) * scaleX, Math.cos(yAngle) * scaleY, Math.sin(xAngle) * scaleX, Math.sin(yAngle) * scaleY];
}

function times(p: M2, q: M2): M2 {
  return [p[0] * q[0] + p[1] * q[2], p[0] * q[1] + p[1] * q[3], p[2] * q[0] + p[3] * q[2], p[2] * q[1] + p[3] * q[3]];
}

/** The world matrix of a child under `parent` in `mode`. */
function modeMatrix(mode: CoreInheritMode, parent: CoreWorld, bone: ModelBone): M2 {
  const rotation = bone.rotation ?? 0;
  const shearX = bone.shearX ?? 0;
  const shearY = bone.shearY ?? 0;
  const scaleX = bone.scaleX ?? 1;
  const scaleY = bone.scaleY ?? 1;
  const p: M2 = [parent.a, parent.b, parent.c, parent.d];
  switch (mode) {
    case 'normal':
      return times(p, frame(rotation, shearX, shearY, scaleX, scaleY));
    case 'onlyTranslation':
      return frame(rotation, shearX, shearY, scaleX, scaleY);
    case 'noRotationOrReflection': {
      const xLengthSq = p[0] * p[0] + p[2] * p[2];
      let conformal: M2;
      let parentAngle: number;
      if (xLengthSq > 0) {
        const k = Math.abs(p[0] * p[3] - p[1] * p[2]) / xLengthSq;
        conformal = [p[0], -p[2] * k, p[2], p[0] * k];
        parentAngle = Math.atan2(p[2], p[0]) / RAD;
      } else {
        conformal = [0, p[1], 0, p[3]];
        parentAngle = Math.atan2(p[3], p[1]) / RAD - 90;
      }
      return times(conformal, frame(rotation - parentAngle, shearX, shearY, scaleX, scaleY));
    }
    case 'noScale':
    case 'noScaleOrReflection': {
      const r = rotation * RAD;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      let ux = p[0] * cos + p[1] * sin;
      let uy = p[2] * cos + p[3] * sin;
      const length = Math.sqrt(ux * ux + uy * uy);
      ux /= length;
      uy /= length;
      const flip = mode === 'noScale' && p[0] * p[3] - p[1] * p[2] < 0 ? -1 : 1;
      const turned: M2 = [ux, -uy * flip, uy, ux * flip];
      return times(turned, frame(0, shearX, shearY, scaleX, scaleY));
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
 * flipped, and nothing else does.
 */
export function worldTransforms(bones: readonly ModelBone[], active: ReadonlySet<string> | null = null, inherit: InheritComputation = modeMatrix): Map<string, CoreWorld> {
  const out = new Map<string, CoreWorld>();
  for (const bone of bones) {
    if (active !== null && !active.has(bone.name)) {
      out.set(bone.name, { a: 0, b: 0, c: 0, d: 0, worldX: 0, worldY: 0 });
      continue;
    }
    const x = bone.x ?? 0;
    const y = bone.y ?? 0;
    if (bone.parent === undefined) {
      const [a, b, c, d] = frame(bone.rotation ?? 0, bone.shearX ?? 0, bone.shearY ?? 0, bone.scaleX ?? 1, bone.scaleY ?? 1);
      out.set(bone.name, { a, b, c, d, worldX: x, worldY: y });
      continue;
    }
    const parent = out.get(bone.parent);
    if (parent === undefined) throw new Error(`bone "${bone.name}": parent "${bone.parent}" is not posed before it`);
    const [a, b, c, d] = inherit(modeOf(bone), parent, bone);
    out.set(bone.name, { a, b, c, d, worldX: parent.a * x + parent.b * y + parent.worldX, worldY: parent.c * x + parent.d * y + parent.worldY });
  }
  return out;
}

/** The mode computation `worldTransforms` uses, exported so a control can wrap it. */
export { modeMatrix };
