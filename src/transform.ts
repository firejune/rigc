/**
 * Setup-pose world transforms, and their inverses.
 *
 * The mesh tier used to get away with "bind = world - bone origin", and the
 * compiler asserted the precondition it needed: every bone translation-only. The
 * joint archetype breaks that on purpose — `axis` carries the cut's angle and the
 * grips carry their radial facing — so the shortcut has to become a real inverse.
 *
 * ⚠️ A rotated parent would NOT have failed loudly under the old shortcut. It
 * would have sheared every weighted vertex at setup and looked like a badly
 * measured polygon. That is why the old code refused rotation instead of ignoring
 * it, and why this file exists rather than a relaxed assertion.
 *
 * The composition, for a bone with a parent in the `normal` mode:
 *
 *   la = cos(rot)      lb = cos(rot + 90) = -sin(rot)
 *   lc = sin(rot)      ld = sin(rot + 90) =  cos(rot)
 *   a = pa*la + pb*lc  b = pa*lb + pb*ld
 *   c = pc*la + pd*lc  d = pc*lb + pd*ld
 *   worldX = pa*x + pb*y + parent.worldX
 *
 * ⚠️ **Scale, shear and `inherit` are honoured, and that is a correction** (issue
 * #804). This header said *"scale and shear are not emitted by rigc, so they are
 * fixed at 1 and 0 here"* long after the rig spec gained `scaleX`/`scaleY`/
 * `shearX`/`shearY`/`inherit` and `ingest` began carrying them from every export
 * that states them — so every setup measurement over a scaled bone was taken on
 * a skeleton the runtime never builds. A 50/50-weighted probe path over one bone
 * at scale 2 measured **0.752×** the runtime's own `PathConstraint.curves` on the
 * build's posed geometry, and a production rig's weighted path 2.35×. The
 * weights were blended all along; the matrices they were blended through were
 * wrong.
 *
 * ⭐ **`computeWorldTransforms` is the core's evaluator** (`worldTransforms` in
 * [`src/core/world.ts`](core/world.ts), issue #1015), whose every rule — the five
 * inherit modes, the collapsed parent axis, the operation orders — was measured
 * against the runtime's pose dump and is held there by the core suite. This file
 * hands it the compiler's arithmetic (`COMPILER_ARITHMETIC`, below) and keeps
 * what is the compiler's own: the coordinate contract, the refusals by name, the
 * world rotation a region cancels, and the inverses.
 */
import type { ModelBone } from './model.ts';
import { modeMatrix, worldTransforms, type CoreWorld, type WorldArithmetic } from './core/world.ts';

/**
 * What `computeWorldTransforms` reads off a bone — a structural type, so both a
 * Spine bone (`SpineBone`, what spine-parts and every skeleton reader hold) and
 * a compiled-model bone (`ModelBone`, what `compile` holds) satisfy it as they
 * are, without a cast.
 *
 * The two differ in one key, the inherit mode: Spine 4.3 spells it `inherit`
 * and the model `inheritMode`. The union below admits exactly one of the two on
 * any one bone (the other is `never`), so a bone carrying both is a type error
 * rather than a question of which one wins, and the mode is read as
 * `inheritMode ?? inherit` — whichever the bone has.
 */
export type PosableBone = {
  name: string;
  parent?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  shearX?: number;
  shearY?: number;
} & ({ inherit?: string; inheritMode?: never } | { inheritMode?: string; inherit?: never });

export interface BoneTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  worldX: number;
  worldY: number;
  /** World rotation in degrees, CCW, y up. What a region attachment cancels. */
  worldRotation: number;
}

export class TransformError extends Error {}

const DEG = Math.PI / 180;

/**
 * The arithmetic every figure rigc emits was computed with, handed to the core's
 * evaluator (issue #1015). It differs from the runtime's in the last bit and in
 * no matrix: degrees to radians with `Math.PI` rather than the runtime's
 * 3.1415927, radians back to degrees by dividing by that factor, and a bone with
 * the default scale and no shear framed as `lb = -sin`, `ld = cos` rather than
 * `cos`/`sin` of `rot + 90°`. One bit can move a float32 spelling in the file, so
 * this is a parameter and not a rewrite: measured with the runtime's arithmetic
 * instead, 2 of the 19 public recipes moved by at most 4e-5. Whether the compiler
 * should bind with the runtime's constant is a question of its own, not settled
 * here.
 */
const COMPILER_ARITHMETIC: WorldArithmetic = {
  radiansPerDegree: DEG,
  degreesOf: (radians) => radians / DEG,
  rotationOnlyFrame: true,
};

/**
 * Crop pixels (y down, origin top-left) -> Spine world (y up, origin at the
 * bottom-left of the crop).
 *
 * This is the whole coordinate contract, and it is also the viewer's: the
 * renderer's root element sits at the BOTTOM-left of the stage because
 * spine-html negates world Y (Spine is Y-up, CSS is Y-down).
 *
 * It lived in `src/archetype.ts` until the archetype tables left the code, which
 * was the wrong home for it anyway — it is not a property of any formation.
 */
export function cropToSpineY(cropY: number, cropHeight: number): number {
  return cropHeight - cropY;
}

/**
 * World transform of every bone, in declaration order.
 *
 * Bones must be declared parents-first, which is also what `SkeletonJson`
 * requires (it resolves `parent` by name against the bones already read), so a
 * violation here is a violation there.
 *
 * The matrices and origins are the core's (`worldTransforms`, under
 * `COMPILER_ARITHMETIC`). What is decided here is what the core does not say:
 * an undeclared parent and an `inherit` no mode answers to are refused by name
 * as `TransformError`, a bone whose `parent` is empty is a root as it always was
 * here, and `worldRotation` is read off the matrix — a root with the default
 * scale and no shear keeps its stated rotation, unwrapped.
 */
export function computeWorldTransforms(bones: readonly PosableBone[]): Map<string, BoneTransform> {
  const model: ModelBone[] = [];
  const declared = new Set<string>();
  for (const bone of bones) {
    const parent = bone.parent ? bone.parent : undefined;
    if (parent !== undefined && !declared.has(parent)) {
      throw new TransformError(`bone "${bone.name}" names parent "${parent}", which is not declared before it`);
    }
    model.push({
      name: bone.name,
      parent,
      x: bone.x,
      y: bone.y,
      rotation: bone.rotation,
      scaleX: bone.scaleX,
      scaleY: bone.scaleY,
      shearX: bone.shearX,
      shearY: bone.shearY,
      inheritMode: parent === undefined ? undefined : inheritMode(bone),
    });
    declared.add(bone.name);
  }
  const worlds = worldTransforms(model, null, modeMatrix, COMPILER_ARITHMETIC);
  const out = new Map<string, BoneTransform>();
  for (const bone of model) {
    const w = worlds.get(bone.name) as CoreWorld;
    const plain = (bone.scaleX ?? 1) === 1 && (bone.scaleY ?? 1) === 1 && (bone.shearX ?? 0) === 0 && (bone.shearY ?? 0) === 0;
    const worldRotation = bone.parent === undefined && plain ? (bone.rotation ?? 0) : (Math.atan2(w.c, w.a) / DEG + 360) % 360;
    out.set(bone.name, { a: w.a, b: w.b, c: w.c, d: w.d, worldX: w.worldX, worldY: w.worldY, worldRotation });
  }
  return out;
}

type InheritMode = 'normal' | 'onlyTranslation' | 'noRotationOrReflection' | 'noScale' | 'noScaleOrReflection';

const INHERIT_MODES: readonly InheritMode[] = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection'];

/**
 * A bone's `inherit`, folded the way `Utils.enumValue` folds it — the first
 * letter and nothing else. A spelling the runtime cannot resolve is refused by
 * name rather than read as normal: the runtime's switch matches no case and
 * leaves the matrix where it was, and the rig spec's parse refuses that
 * spelling first (issue #733), so reaching this throw is rigc's own defect.
 */
function inheritMode(bone: PosableBone): InheritMode {
  const value = bone.inheritMode ?? bone.inherit;
  if (value === undefined) return 'normal';
  const folded = value.length === 0 ? value : value[0].toLowerCase() + value.slice(1);
  const mode = INHERIT_MODES.find((m) => m === folded);
  if (!mode) {
    throw new TransformError(`bone "${bone.name}" inherit is ${JSON.stringify(value)}, which the runtime resolves to no mode`);
  }
  return mode;
}

/**
 * World point -> the bone's local space. Used for bind coordinates and offsets.
 *
 * ⚠️ **Not rounded**, since issue #716. It used to round to six decimals here,
 * which made this file a second emitter: `buildBone` and the region placement
 * wrote its result straight into the skeleton. The emitted number's precision
 * is one decision, `f32` in `compile.ts`, so the callers quantise what they
 * emit and this returns the double.
 */
export function toBoneLocal(m: BoneTransform, worldX: number, worldY: number): [number, number] {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) {
    throw new TransformError(`bone transform is singular (det ${det}); a zero-scale bone cannot hold bind coordinates`);
  }
  const px = worldX - m.worldX;
  const py = worldY - m.worldY;
  return [(px * m.d - py * m.b) / det, (py * m.a - px * m.c) / det];
}

/**
 * A world **displacement** -> the bone's local space: rotation and scale only,
 * with the translation left out.
 *
 * ⭐ Not a variant of `toBoneLocal` for convenience — it is the other half of a
 * different identity. `computeWorldVertices` composes a weighted vertex as
 * `Σ wᵢ · (Rᵢ · (bindᵢ + deformᵢ) + tᵢ)`, so the translation `tᵢ` lands on the
 * vertex once and never on the offset. Writing `Rᵢ⁻¹ · D` into every influence
 * therefore moves the vertex by exactly `D · Σ wᵢ`, which is `D` because the
 * weights close at 1 (issue #389). Running a displacement through `toBoneLocal`
 * instead would subtract the bone's origin from it and land the vertex
 * somewhere nobody asked for.
 *
 * ⚠️ **Not rounded**, for `toWorld`'s reason: the caller quantises the one
 * number it emits, and rounding an intermediate would bias it.
 */
export function toBoneLocalVector(m: BoneTransform, worldDX: number, worldDY: number): [number, number] {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) {
    throw new TransformError(`bone transform is singular (det ${det}); a zero-scale bone cannot carry a displacement`);
  }
  return [(worldDX * m.d - worldDY * m.b) / det, (worldDY * m.a - worldDX * m.c) / det];
}

/**
 * A bone-local point -> world. The inverse of `toBoneLocal`, and the direction
 * `VertexAttachment.computeWorldVertices` takes at setup.
 *
 * ⚠️ **Not rounded**, and that is the difference from every other function here.
 * Its callers measure with the result — a path's arc lengths are a sum over many
 * of these — so quantising each point first would bias the sum by up to half a
 * step per sample. Round the answer, not the samples.
 */
export function toWorld(m: BoneTransform, localX: number, localY: number): [number, number] {
  return [m.a * localX + m.b * localY + m.worldX, m.c * localX + m.d * localY + m.worldY];
}

/**
 * Normalise degrees into (-180, 180], which is how an editor shows a rotation.
 *
 * Not rounded, for `toBoneLocal`'s reason: a caller that emits the angle
 * quantises it with `f32`, and one that compares or measures with it wants the
 * double.
 */
export function normaliseDegrees(deg: number): number {
  let v = ((deg % 360) + 360) % 360;
  if (v > 180) v -= 360;
  return v;
}

/**
 * Screen degrees (y down, the convention the manifest and the art share) ->
 * Spine degrees (y up, CCW). One negation, stated once, so no other file has to
 * remember which way the y flip goes.
 */
export function screenToSpineDegrees(screenDeg: number): number {
  return normaliseDegrees(-screenDeg);
}
