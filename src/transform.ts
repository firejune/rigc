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
 * against the runtime's pose dump and is held there by the core suite. Since
 * issue #1021 it runs under the runtime's own arithmetic (`RUNTIME_ARITHMETIC`,
 * the evaluator's default), so the matrices every point is bound through are the
 * ones the runtime poses the build with, to the bit. This file keeps what is the
 * compiler's own: the coordinate contract, the refusals by name, the world
 * rotation a region cancels, and the inverses.
 *
 * ⚠️ **Why the runtime's arithmetic and not the textbook's** (issue #1021). A
 * point is bound by inverting a setup matrix; the runtime then poses it through
 * its own. The two used to differ in the last bits — `Math.PI` against the
 * runtime's 3.1415927, `[cos, −sin, sin, cos]` against the y column taken at
 * `rotation + 90`, radians to degrees by division against multiplication — and
 * that is not noise below the file's precision: an unrotated root reads
 * `b = −2.3e-8` in the runtime, so a point 256 units above its bone was bound
 * 5.9e-6 off before the float32 spelling was even applied. Measured from inside
 * `compile` (every authored world position `toBoneLocal` was handed) against
 * spine-core's pose of the emitted build, the old arithmetic put `gallery/look`'s
 * 312 bound points up to 8.6e-5 from where they were authored (RMS 5.1e-5) and
 * `gallery/flex`'s 258 up to 2.3e-5; the runtime's puts every one of them at the
 * float32 floor — the distance the float32 spelling of the exact inverse alone
 * accounts for (look 8.1e-6, flex 4.1e-6). `CO24` holds it.
 *
 * 🔸 **The rule has a second half: what is MEASURED reads the exact frame.**
 * The runtime's arithmetic is for what is bound — the matrices a point is
 * inverted through. Anything the compiler measures of the authored rig and
 * reports, compares against a threshold, sorts by or refuses on is a statement
 * about the spec, and reads `computeExactFrameTransforms` (below): a depth turn
 * ceiling, a ring's control angles, a `segments` mesh's segments and falloff.
 * An angle the author stated as 90 has to print as 90.
 */
import type { ModelBone } from './model.ts';
import { modeMatrix, RUNTIME_ARITHMETIC, worldTransforms, type CoreWorld, type WorldArithmetic } from './core/world.ts';

/**
 * What `computeWorldTransforms` reads off a bone — a structural type, so both a
 * Spine bone (`SpineBone`, what rig-parts and every skeleton reader hold) and
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
 * The textbook's arithmetic — `Math.PI`, a bone with the default scale and no
 * shear framed as `[cos, −sin, sin, cos]`, radians to degrees by dividing by
 * the degree factor — in which an unrotated bone's frame is the identity
 * exactly. Every point the compiler binds goes through the runtime's instead
 * (the header's ⚠️); this is what `computeExactFrameTransforms` evaluates
 * under, and nothing else.
 */
const EXACT_FRAME_ARITHMETIC: WorldArithmetic = {
  radiansPerDegree: Math.PI / 180,
  degreesOf: (radians) => radians / (Math.PI / 180),
  rotationOnlyFrame: true,
};

/**
 * World transform of every bone, in declaration order.
 *
 * Bones must be declared parents-first, which is also what `SkeletonJson`
 * requires (it resolves `parent` by name against the bones already read), so a
 * violation here is a violation there.
 *
 * The matrices and origins are the core's (`worldTransforms`, under the
 * runtime's arithmetic — the header's ⚠️). What is decided here is what the core does not say:
 * an undeclared parent and an `inherit` no mode answers to are refused by name
 * as `TransformError`, a bone whose `parent` is empty is a root as it always was
 * here, and `worldRotation` is read off the matrix — a root with the default
 * scale and no shear keeps its stated rotation, unwrapped. The angle is turned
 * into degrees as the runtime turns one (`RUNTIME_DEG`, by multiplying), so
 * the rotation a region writes to cancel it is read back by the runtime as
 * that angle.
 */
export function computeWorldTransforms(bones: readonly PosableBone[]): Map<string, BoneTransform> {
  return evaluate(bones, RUNTIME_ARITHMETIC);
}

/**
 * The same bones under `EXACT_FRAME_ARITHMETIC`: the frame the compiler
 * MEASURES the authored rig in, and binds nothing through (issue #1021) — a
 * mesh's depth turn ceiling (`sampleMeshDepth` in `compile.ts`), a ring's
 * control angles (`ringControlAngles`, which orders the split and refuses a
 * tie by printing the angle), and a `segments` mesh's segments, the distances
 * its falloff and `minWeight` read and its shared-origin refusal. It differs from
 * `computeWorldTransforms` only in the last bits, and that is exactly why it is
 * kept (issue #1021): the ceiling is a statement about the authored mesh, and
 * its reader treats an axis whose area term is exactly zero as one that cannot
 * fold. The runtime frames an unrotated bone with `b = −2.3e-8`, so in its
 * bind space a sheet whose depth rises linearly in x — which cannot fold a
 * pitch at any angle — reads a pitch ceiling of 89.99997°, and `gallery/look`'s
 * two hair locks gained four such ceilings with their counts (`TC03`, `TC06`
 * went red on it). A control angle read through the runtime's frame printed
 * an authored 90 as 89.99999734089101 in its tie refusal (`RF46`). On the 19
 * recipes the only bytes this keeps from moving are look's ceilings; no
 * emitted position goes through it.
 */
export function computeExactFrameTransforms(bones: readonly PosableBone[]): Map<string, BoneTransform> {
  return evaluate(bones, EXACT_FRAME_ARITHMETIC);
}

function evaluate(bones: readonly PosableBone[], arithmetic: WorldArithmetic): Map<string, BoneTransform> {
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
  const worlds = worldTransforms(model, null, modeMatrix, arithmetic);
  const out = new Map<string, BoneTransform>();
  for (const bone of model) {
    const w = worlds.get(bone.name) as CoreWorld;
    const plain = (bone.scaleX ?? 1) === 1 && (bone.scaleY ?? 1) === 1 && (bone.shearX ?? 0) === 0 && (bone.shearY ?? 0) === 0;
    const worldRotation = bone.parent === undefined && plain ? (bone.rotation ?? 0) : (arithmetic.degreesOf(Math.atan2(w.c, w.a)) + 360) % 360;
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
