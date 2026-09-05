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
 * Scale and shear are not emitted by rigc, so they are fixed at 1 and 0 here and
 * the reader does not have to wonder which convention this file chose.
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

/** Round to 6 decimals and never emit "-0" (byte-stable output). */
function r6(n: number): number {
  const v = Math.round(n * 1e6) / 1e6;
  return v === 0 ? 0 : v;
}

/**
 * World transform of every bone, in declaration order.
 *
 * Bones must be declared parents-first, which is also what `SkeletonJson`
 * requires (it resolves `parent` by name against the bones already read), so a
 * violation here is a violation there.
 */
export function computeWorldTransforms(bones: SpineBone[]): Map<string, BoneTransform> {
  const out = new Map<string, BoneTransform>();
  for (const bone of bones) {
    const rotation = bone.rotation ?? 0;
    const cos = Math.cos(rotation * DEG);
    const sin = Math.sin(rotation * DEG);
    const la = cos;
    const lb = -sin;
    const lc = sin;
    const ld = cos;
    const x = bone.x ?? 0;
    const y = bone.y ?? 0;
    if (!bone.parent) {
      out.set(bone.name, { a: la, b: lb, c: lc, d: ld, worldX: x, worldY: y, worldRotation: rotation });
      continue;
    }
    const p = out.get(bone.parent);
    if (!p) throw new TransformError(`bone "${bone.name}" names parent "${bone.parent}", which is not declared before it`);
    const a = p.a * la + p.b * lc;
    const b = p.a * lb + p.b * ld;
    const c = p.c * la + p.d * lc;
    const d = p.c * lb + p.d * ld;
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

/** World point -> the bone's local space. Used for bind coordinates and offsets. */
export function toBoneLocal(m: BoneTransform, worldX: number, worldY: number): [number, number] {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) {
    throw new TransformError(`bone transform is singular (det ${det}); a zero-scale bone cannot hold bind coordinates`);
  }
  const px = worldX - m.worldX;
  const py = worldY - m.worldY;
  return [r6((px * m.d - py * m.b) / det), r6((py * m.a - px * m.c) / det)];
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

/** Normalise degrees into (-180, 180], which is how an editor shows a rotation. */
export function normaliseDegrees(deg: number): number {
  let v = ((deg % 360) + 360) % 360;
  if (v > 180) v -= 360;
  return r6(v);
}

/**
 * Screen degrees (y down, the convention the manifest and the art share) ->
 * Spine degrees (y up, CCW). One negation, stated once, so no other file has to
 * remember which way the y flip goes.
 */
export function screenToSpineDegrees(screenDeg: number): number {
  return normaliseDegrees(-screenDeg);
}
