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
 *
 * ⭐ **A weighted vertex's bone index is written here and nowhere else** (issue
 * #917). The model binds by name; `emitVertices` writes Spine's run —
 * `boneCount, (boneIndex, x, y, weight) × n` per vertex — with each index the
 * bone's position in the model's bone array, which `emitBones` keeps in order.
 */
import { CompileError } from './errors.ts';
import {
  isModelVertexAttachment,
  type ModelBone,
  type ModelBoundingBoxAttachment,
  type ModelClippingAttachment,
  type ModelMeshAttachment,
  type ModelPathAttachment,
  type ModelVertexAttachment,
  type ModelVertices,
  type SkinTableEntry,
} from './model.ts';
import type {
  SpineAttachment,
  SpineBone,
  SpineBoundingBoxAttachment,
  SpineClippingAttachment,
  SpineMeshAttachment,
  SpinePathAttachment,
} from './types.ts';

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

/**
 * The bone index a weighted run writes for each name: its position in the model's
 * bone array, the array `emitBones` writes in the same order. A name that is not
 * a bone is refused by name — the builders resolve every binding before it
 * reaches the model, so this is the emitter declining to write an index for
 * something it cannot find rather than a check an author can reach.
 */
export function boneIndexOf(bones: readonly ModelBone[]): (bone: string) => number {
  const index = new Map(bones.map((bone, i) => [bone.name, i] as const));
  return (bone) => {
    const at = index.get(bone);
    if (at === undefined) throw new CompileError(`internal: a weighted vertex binds bone "${bone}", which is not in the model's bone list`);
    return at;
  };
}

/**
 * A vertex attachment's `vertices` array in Spine 4.3's encoding.
 *
 * Unweighted: `xy` verbatim. Weighted: per vertex its binding count, then per
 * binding `indexOf(bone), x, y, weight` — every number but the index copied from
 * the model untouched, since the model already holds the float32 values the
 * file carries. The reader tells the two apart by length alone (`readVertices`),
 * which is why the model says `weighted` out loud and this is the one place it
 * becomes a length.
 */
export function emitVertices(vertices: ModelVertices, indexOf: (bone: string) => number): number[] {
  if (!vertices.weighted) return vertices.xy.slice();
  const out: number[] = [];
  for (const vertex of vertices.bindings) {
    out.push(vertex.length);
    for (const binding of vertex) out.push(indexOf(binding.bone), binding.x, binding.y, binding.weight);
  }
  return out;
}

/**
 * A mesh, keys in the order every mesh builder in `compile.ts` inserted them
 * before the model existed — `buildRigMesh`, `buildGeneratedMesh`,
 * `buildGridAttachment`, `buildSegmentsAttachment`, `buildContourAttachment`
 * and the manifest's `buildMesh` all wrote one order, with `withStatedName`
 * putting `name` ahead of everything:
 *
 *   `name, type, path, color, uvs, triangles, vertices, hull, edges, width, height, sequence`
 *
 * each optional key only when the record carries it. The mesh row of the key
 * order lists `type` … `height`; `name`, `path`, `color` and `sequence` it does
 * not list, so their positions are this constructor's and are bytes.
 */
export function emitMesh(mesh: ModelMeshAttachment, indexOf: (bone: string) => number): SpineMeshAttachment {
  return {
    ...(mesh.name !== undefined ? { name: mesh.name } : {}),
    type: 'mesh',
    ...(mesh.path !== undefined ? { path: mesh.path } : {}),
    ...(mesh.color !== undefined ? { color: mesh.color } : {}),
    uvs: mesh.uvs,
    triangles: mesh.triangles,
    vertices: emitVertices(mesh.vertices, indexOf),
    hull: mesh.hull,
    edges: mesh.edges,
    width: mesh.width,
    height: mesh.height,
    ...(mesh.sequence !== undefined ? { sequence: mesh.sequence } : {}),
  };
}

/**
 * A bounding box, keys in `buildRigBoundingBox`'s order after `withStatedName`:
 * `name, type, vertexCount, vertices, color`. The row lists `type`,
 * `vertexCount`, `vertices`; `name` and `color` hold the constructor's places.
 */
export function emitBoundingBox(box: ModelBoundingBoxAttachment, indexOf: (bone: string) => number): SpineBoundingBoxAttachment {
  return {
    ...(box.name !== undefined ? { name: box.name } : {}),
    type: 'boundingbox',
    vertexCount: box.vertexCount,
    vertices: emitVertices(box.vertices, indexOf),
    ...(box.editorColor !== undefined ? { color: box.editorColor } : {}),
  };
}

/**
 * A clipping polygon, keys in `buildRigClipping`'s order after `withStatedName`:
 * `name, type, end, convex, inverse, vertexCount, vertices, color`. The row
 * lists `type`, `end`, `vertexCount`, `vertices`, `color`; `name`, `convex` and
 * `inverse` hold the constructor's places.
 */
export function emitClipping(clip: ModelClippingAttachment, indexOf: (bone: string) => number): SpineClippingAttachment {
  return {
    ...(clip.name !== undefined ? { name: clip.name } : {}),
    type: 'clipping',
    ...(clip.end !== undefined ? { end: clip.end } : {}),
    ...(clip.convex !== undefined ? { convex: clip.convex } : {}),
    ...(clip.inverse !== undefined ? { inverse: clip.inverse } : {}),
    vertexCount: clip.vertexCount,
    vertices: emitVertices(clip.vertices, indexOf),
    ...(clip.editorColor !== undefined ? { color: clip.editorColor } : {}),
  };
}

/**
 * A path, keys in `buildRigPath`'s order after `withStatedName`:
 * `name, type, closed, constantSpeed, vertexCount, vertices, lengths, color`.
 * The key order has no row for a path attachment, so every position here is
 * this constructor's.
 */
export function emitPath(path: ModelPathAttachment, indexOf: (bone: string) => number): SpinePathAttachment {
  return {
    ...(path.name !== undefined ? { name: path.name } : {}),
    type: 'path',
    ...(path.closed !== undefined ? { closed: path.closed } : {}),
    ...(path.constantSpeed !== undefined ? { constantSpeed: path.constantSpeed } : {}),
    vertexCount: path.vertexCount,
    vertices: emitVertices(path.vertices, indexOf),
    lengths: path.lengths,
    ...(path.editorColor !== undefined ? { color: path.editorColor } : {}),
  };
}

/** One model vertex attachment as its Spine 4.3 object. */
export function emitVertexAttachment(att: ModelVertexAttachment, indexOf: (bone: string) => number): SpineAttachment {
  switch (att.kind) {
    case 'mesh':
      return emitMesh(att, indexOf);
    case 'boundingbox':
      return emitBoundingBox(att, indexOf);
    case 'clipping':
      return emitClipping(att, indexOf);
    case 'path':
      return emitPath(att, indexOf);
  }
}

/**
 * One skin's slot -> placeholder table as the skeleton file carries it: every
 * model record emitted, every Spine object (a region, a linked mesh — cut 1d's)
 * passed through as the same object, slots and placeholders in the table's own
 * order. The editor's slot-key order is applied by the caller, as before.
 */
export function emitSkinAttachments(
  table: Record<string, Record<string, SkinTableEntry>>,
  indexOf: (bone: string) => number,
): Record<string, Record<string, SpineAttachment>> {
  const out: Record<string, Record<string, SpineAttachment>> = {};
  for (const [slot, perSlot] of Object.entries(table)) {
    const emitted: Record<string, SpineAttachment> = {};
    for (const [placeholder, entry] of Object.entries(perSlot)) {
      emitted[placeholder] = isModelVertexAttachment(entry) ? emitVertexAttachment(entry, indexOf) : entry;
    }
    out[slot] = emitted;
  }
  return out;
}
