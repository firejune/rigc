/**
 * The Spine emitter — the compiled model (`src/model.ts`) written as Spine 4.3
 * skeleton objects (issue #915, step 1b of #380).
 *
 * The model holds values; this file owns the bytes. So every Spine 4.3
 * spelling of a model field lives here and nowhere in the model: a bone's
 * inherit mode is written under `inherit` (4.0/4.1 wrote `transform`, which 4.3
 * loads silently as Normal — `A02`), and its skin-required flag under `skin`.
 *
 * 🔒 **Key insertion order is part of the byte contract.** `inEditorKeyOrder`
 * (`src/keyorder.ts`) permutes only the keys its row lists; a key the row does
 * not list — a bone's `shearX`, `shearY`, `skin` — keeps the position the
 * constructor gave it. So each constructor here inserts keys in exactly the
 * order `compile.ts` inserted them before the model existed, and a reorder here
 * is a byte change on every build that carries the key, which the byte-identity
 * gate (`tools/emit_hashes.ts`) names.
 *
 * Parser defaults are not dropped here: `withoutParserDefaults` does that on
 * the finished skeleton, once, as it did before.
 */
import type { ModelBone } from './model.ts';
import type { SpineBone } from './types.ts';

/**
 * One `SpineBone` per model bone, in the model's order — which is the order a
 * weighted vertex's bone index counts in, so it is never re-sorted.
 *
 * Keys, each only when the model bone carries it: `name, parent, length, x, y,
 * rotation, scaleX, scaleY, shearX, shearY, inherit, skin, color, icon`.
 */
export function emitBones(bones: readonly ModelBone[]): SpineBone[] {
  return bones.map((model) => {
    const bone: SpineBone = { name: model.name };
    if (model.parent !== undefined) bone.parent = model.parent;
    if (model.length !== undefined) bone.length = model.length;
    if (model.x !== undefined) bone.x = model.x;
    if (model.y !== undefined) bone.y = model.y;
    if (model.rotation !== undefined) bone.rotation = model.rotation;
    if (model.scaleX !== undefined) bone.scaleX = model.scaleX;
    if (model.scaleY !== undefined) bone.scaleY = model.scaleY;
    if (model.shearX !== undefined) bone.shearX = model.shearX;
    if (model.shearY !== undefined) bone.shearY = model.shearY;
    if (model.inheritMode !== undefined) bone.inherit = model.inheritMode;
    if (model.skinRequired !== undefined) bone.skin = model.skinRequired;
    if (model.editor?.color !== undefined) bone.color = model.editor.color;
    if (model.editor?.icon !== undefined) bone.icon = model.editor.icon;
    return bone;
  });
}
