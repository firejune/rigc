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
 * The composition mirrors spine-core exactly (`Bone.updateWorldTransform`):
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
 * wrong. `computeWorldTransforms` below is `BonePose.updateWorldTransform`
 * (spine-core 4.3.13, `BonePose.js:110-216`) at setup, with a skeleton scale of 1.
 */
import type { SpineBone } from './types.ts';

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
 * 🔒 **A bone with the default scale and no shear takes the exact arithmetic
 * this function always used** — `lb = -sin`, `ld = cos` rather than the
 * runtime's `cos(rot + 90°)`/`sin(rot + 90°)`, which can differ in the last bit.
 * Every figure rigc emitted off an unscaled rig was computed that way, and one
 * bit there can move a float32 spelling in the file, so the general local matrix
 * is taken only where the old one was wrong: nothing an unscaled, normally
 * inheriting rig emits moves by a byte. The five `inherit` cases are the
 * runtime's, transcribed.
 */
export function computeWorldTransforms(bones: SpineBone[]): Map<string, BoneTransform> {
  const out = new Map<string, BoneTransform>();
  for (const bone of bones) {
    const rotation = bone.rotation ?? 0;
    const scaleX = bone.scaleX ?? 1;
    const scaleY = bone.scaleY ?? 1;
    const shearX = bone.shearX ?? 0;
    const shearY = bone.shearY ?? 0;
    const plain = scaleX === 1 && scaleY === 1 && shearX === 0 && shearY === 0;
    let la: number;
    let lb: number;
    let lc: number;
    let ld: number;
    if (plain) {
      const cos = Math.cos(rotation * DEG);
      const sin = Math.sin(rotation * DEG);
      la = cos;
      lb = -sin;
      lc = sin;
      ld = cos;
    } else {
      const rx = (rotation + shearX) * DEG;
      const ry = (rotation + 90 + shearY) * DEG;
      la = Math.cos(rx) * scaleX;
      lb = Math.cos(ry) * scaleY;
      lc = Math.sin(rx) * scaleX;
      ld = Math.sin(ry) * scaleY;
    }
    const x = bone.x ?? 0;
    const y = bone.y ?? 0;
    if (!bone.parent) {
      const worldRotation = plain ? rotation : (Math.atan2(lc, la) / DEG + 360) % 360;
      out.set(bone.name, { a: la, b: lb, c: lc, d: ld, worldX: x, worldY: y, worldRotation });
      continue;
    }
    const p = out.get(bone.parent);
    if (!p) throw new TransformError(`bone "${bone.name}" names parent "${bone.parent}", which is not declared before it`);
    const [a, b, c, d] = inheritedMatrix(inheritMode(bone), p, [la, lb, lc, ld], rotation, scaleX, scaleY, shearX, shearY);
    out.set(bone.name, {
      a,
      b,
      c,
      d,
      worldX: p.a * x + p.b * y + p.worldX,
      worldY: p.c * x + p.d * y + p.worldY,
      worldRotation: (Math.atan2(c, a) / DEG + 360) % 360,
    });
  }
  return out;
}

/** `MathUtils.epsilon2` — the threshold `noRotationOrReflection` tests a degenerate parent against. */
const EPSILON2 = 0.00001 * 0.00001;

type InheritMode = 'normal' | 'onlyTranslation' | 'noRotationOrReflection' | 'noScale' | 'noScaleOrReflection';

const INHERIT_MODES: readonly InheritMode[] = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection'];

/**
 * A bone's `inherit`, folded the way `Utils.enumValue` folds it — the first
 * letter and nothing else. A spelling the runtime cannot resolve is refused by
 * name rather than read as normal: the runtime's switch matches no case and
 * leaves the matrix where it was, and the rig spec's parse refuses that
 * spelling first (issue #733), so reaching this throw is rigc's own defect.
 */
function inheritMode(bone: SpineBone): InheritMode {
  const value = bone.inherit;
  if (value === undefined) return 'normal';
  const folded = value.length === 0 ? value : value[0].toLowerCase() + value.slice(1);
  const mode = INHERIT_MODES.find((m) => m === folded);
  if (!mode) {
    throw new TransformError(`bone "${bone.name}" inherit is ${JSON.stringify(value)}, which the runtime resolves to no mode`);
  }
  return mode;
}

/**
 * `BonePose.updateWorldTransform`'s switch (`BonePose.js:136-215`) for a bone
 * with a parent, at a skeleton scale of 1 — so every `sx`/`sy` factor there is 1
 * and is left out rather than multiplied in.
 */
function inheritedMatrix(
  inherit: InheritMode,
  p: BoneTransform,
  local: [number, number, number, number],
  rotation: number,
  scaleX: number,
  scaleY: number,
  shearX: number,
  shearY: number,
): [number, number, number, number] {
  const [la, lb, lc, ld] = local;
  if (inherit === 'normal') {
    return [p.a * la + p.b * lc, p.a * lb + p.b * ld, p.c * la + p.d * lc, p.c * lb + p.d * ld];
  }
  if (inherit === 'onlyTranslation') return [la, lb, lc, ld];
  if (inherit === 'noRotationOrReflection') {
    let pa = p.a;
    let pb = p.b;
    let pc = p.c;
    let pd = p.d;
    let s = pa * pa + pc * pc;
    let r: number;
    if (s > EPSILON2) {
      s = Math.abs(pa * pd - pb * pc) / s;
      pb = pc * s;
      pd = pa * s;
      r = rotation - Math.atan2(pc, pa) / DEG;
    } else {
      pa = 0;
      pc = 0;
      r = rotation - 90 + Math.atan2(pd, pb) / DEG;
    }
    const rx = (r + shearX) * DEG;
    const ry = (r + shearY + 90) * DEG;
    const ra = Math.cos(rx) * scaleX;
    const rb = Math.cos(ry) * scaleY;
    const rc = Math.sin(rx) * scaleX;
    const rd = Math.sin(ry) * scaleY;
    return [pa * ra - pb * rc, pa * rb - pb * rd, pc * ra + pd * rc, pc * rb + pd * rd];
  }
  // noScale / noScaleOrReflection
  const r = rotation * DEG;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  let za = p.a * cos + p.b * sin;
  let zc = p.c * cos + p.d * sin;
  const s = 1 / Math.sqrt(za * za + zc * zc);
  za *= s;
  zc *= s;
  let zb = -zc;
  let zd = za;
  if (inherit === 'noScale' && p.a * p.d - p.b * p.c < 0) {
    zb = -zb;
    zd = -zd;
  }
  const rx = shearX * DEG;
  const ry = (90 + shearY) * DEG;
  const ra = Math.cos(rx) * scaleX;
  const rb = Math.cos(ry) * scaleY;
  const rc = Math.sin(rx) * scaleX;
  const rd = Math.sin(ry) * scaleY;
  return [za * ra + zb * rc, za * rb + zb * rd, zc * ra + zd * rc, zc * rb + zd * rd];
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
