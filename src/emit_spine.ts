/**
 * The Spine emitter — the compiled model (`src/model.ts`) written as Spine 4.3
 * skeleton objects (issue #915, step 1b of #380; every structural record since
 * #919, cut 1d).
 *
 * The model holds values; this file owns the bytes. So every Spine 4.3
 * spelling of a model field lives here and nowhere in the model: a bone's
 * inherit mode is written under `inherit` (4.0/4.1 wrote `transform`, which 4.3
 * loads silently as Normal — `A02`), and its skin-required flag under `skin`; a
 * constraint's and an attachment's kind under `type` (a region's left out); a
 * slot's setup attachment under `attachment`.
 *
 * 🔒 **Key insertion order is part of the byte contract.** `inEditorKeyOrder`
 * (`src/keyorder.ts`) permutes only the keys its row lists; a key the row does
 * not list — a bone's `shearX`, `shearY`, `skin` — keeps the position the
 * constructor gave it, and a kind with no row (a linked mesh, a path
 * attachment, a sequence, the path and slider constraints, an event) keeps the
 * constructor's order whole. So each emitter here inserts keys in exactly the
 * order `compile.ts` inserted them before the model existed, written down in
 * its doc comment, and a reorder here is a byte change on every build that
 * carries the key, which the byte-identity gate (`tools/emit_hashes.ts`) names.
 *
 * ✂️ **Omissions.** The parser defaults `PARSER_DEFAULTS` lists are dropped by
 * `withoutParserDefaults` on the finished skeleton, once, as before. The
 * omissions the constructors used to make INLINE are made here, because the
 * model now holds the value: a slot's `null` setup attachment, a region's `x`,
 * `y`, `rotation` at 0, a physics component at 0 and a parameter at its
 * default (`PHYSICS_PARAMS`), and a linked mesh's own slot, `default` skin and
 * `timelines: true`. Each restates what the parser reads in the key's absence.
 * One omission is not here: a `path` equal to the name, which `attachmentPath`
 * in `compile.ts` still decides (`src/model.ts`, the header's ⚠️).
 *
 * ⭐ **A weighted vertex's bone index is written here and nowhere else** (issue
 * #917). The model binds by name; `emitVertices` writes Spine's run —
 * `boneCount, (boneIndex, x, y, weight) × n` per vertex — with each index the
 * bone's position in the model's bone array, which `emitBones` keeps in order.
 *
 * 🔸 **The editor's name comparator stays in `compile.ts`** and is handed to
 * `emitSkins` (`EditorOrder`): the same comparator keys `animations`, which are
 * still assembled there until their own cut, and the selftest's scans of the
 * fold read it in that file. The ORDER is applied here; the comparator is
 * passed in, not restated.
 *
 * 🧪 Every object this file returns is a fresh one. The parser-default and
 * key-order passes run in place on the finished skeleton, and before issue
 * #919 they reached the region and linked-mesh objects the skin tables held;
 * no object of the model that those passes visit is handed to them.
 */
import { CompileError } from './errors.ts';
import type {
  ModelBone,
  ModelBoundingBoxAttachment,
  ModelClippingAttachment,
  ModelConstraint,
  ModelConstraintKind,
  ModelEvent,
  ModelLinkedMeshAttachment,
  ModelMeshAttachment,
  ModelPathAttachment,
  ModelRegionAttachment,
  ModelSkin,
  ModelSlot,
  ModelVertexAttachment,
  ModelVertices,
  SkinTable,
  SkinTableEntry,
} from './model.ts';
import { RIG_SKIN_CONSTRAINT_KEYS, type RigSkinConstraintKey } from './rig.ts';
import type {
  SpineAttachment,
  SpineBone,
  SpineBoundingBoxAttachment,
  SpineClippingAttachment,
  SpineConstraint,
  SpineEvent,
  SpineLinkedMeshAttachment,
  SpineMeshAttachment,
  SpinePathAttachment,
  SpineRegionAttachment,
  SpineSequence,
  SpineSkin,
  SpineSlot,
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
    ...(mesh.sequence !== undefined ? { sequence: emitSequenceBlock(mesh.sequence) } : {}),
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
 * A `sequence` block, keys in `emitSequence`'s order in `compile.ts`:
 * `count, start, digits, setup`, each optional key only when stated. The key
 * order has no row for a sequence, so the order is this one's. A fresh object
 * every time: the parser-default pass removes `start: 1` and `setup: 0` in
 * place, and it must not reach into the model.
 */
export function emitSequenceBlock(seq: SpineSequence): SpineSequence {
  const out: SpineSequence = { count: seq.count };
  if (seq.start !== undefined) out.start = seq.start;
  if (seq.digits !== undefined) out.digits = seq.digits;
  if (seq.setup !== undefined) out.setup = seq.setup;
  return out;
}

/**
 * A region, keys in the order `buildRigRegion` and `placeRegion` inserted them
 * before the model existed (the two wrote one order; `withStatedName` put
 * `name` ahead of everything):
 *
 *   `name, width, height, path, x, y, rotation, scaleX, scaleY, color, sequence`
 *
 * The region row lists `x, y, scaleX, scaleY, rotation, width, height`; `name`,
 * `path`, `color` and `sequence` hold this constructor's places.
 *
 * ✂️ `x`, `y` and `rotation` are left out at 0 — `placeRegion`'s inline omission,
 * made here for every region. On a rig spec's region that is the parser-default
 * pass's own decision one step early (the region row reads each at 0, and
 * every number here is `f32`'d, which never leaves a `-0`), so no byte moves.
 */
export function emitRegion(region: ModelRegionAttachment): SpineRegionAttachment {
  const out: SpineRegionAttachment = {
    ...(region.name !== undefined ? { name: region.name } : {}),
    width: region.width,
    height: region.height,
  };
  if (region.path !== undefined) out.path = region.path;
  if (region.x !== undefined && region.x !== 0) out.x = region.x;
  if (region.y !== undefined && region.y !== 0) out.y = region.y;
  if (region.rotation !== undefined && region.rotation !== 0) out.rotation = region.rotation;
  if (region.scaleX !== undefined) out.scaleX = region.scaleX;
  if (region.scaleY !== undefined) out.scaleY = region.scaleY;
  if (region.color !== undefined) out.color = region.color;
  if (region.sequence !== undefined) out.sequence = emitSequenceBlock(region.sequence);
  return out;
}

/**
 * A linked mesh, keys in `buildRigLinkedMesh`'s order after `withStatedName`:
 *
 *   `name, type, source, width, height, path, slot, skin, timelines, color, sequence`
 *
 * The key order has no row for a linked mesh, so every position is this one's.
 *
 * ✂️ The link is written only where it differs from the parser's fallback
 * (`SkeletonJson` reads `skin` as the default skin, `slot` as the attachment's
 * own, `timelines` as true): `slot` when it is not `ownSlot`, `skin` when it is
 * not `default`, `timelines` only when false.
 */
export function emitLinkedMesh(link: ModelLinkedMeshAttachment, ownSlot: string): SpineLinkedMeshAttachment {
  const out: SpineLinkedMeshAttachment = {
    ...(link.name !== undefined ? { name: link.name } : {}),
    type: 'linkedmesh',
    source: link.source,
    width: link.width,
    height: link.height,
  };
  if (link.path !== undefined) out.path = link.path;
  if (link.slot !== ownSlot) out.slot = link.slot;
  if (link.skin !== 'default') out.skin = link.skin;
  if (!link.timelines) out.timelines = false;
  if (link.color !== undefined) out.color = link.color;
  if (link.sequence !== undefined) out.sequence = emitSequenceBlock(link.sequence);
  return out;
}

/** One skin-table record as its Spine 4.3 object; `ownSlot` is the slot it is filed under. */
export function emitAttachment(att: SkinTableEntry, ownSlot: string, indexOf: (bone: string) => number): SpineAttachment {
  switch (att.kind) {
    case 'region':
      return emitRegion(att);
    case 'linkedmesh':
      return emitLinkedMesh(att, ownSlot);
    default:
      return emitVertexAttachment(att, indexOf);
  }
}

/**
 * One skin's slot -> placeholder table as the skeleton file carries it: every
 * record emitted, slots and placeholders in the table's own order. The
 * editor's slot-key order is applied by `emitSkins`.
 */
export function emitSkinAttachments(table: SkinTable, indexOf: (bone: string) => number): Record<string, Record<string, SpineAttachment>> {
  const out: Record<string, Record<string, SpineAttachment>> = {};
  for (const [slot, perSlot] of Object.entries(table)) {
    const emitted: Record<string, SpineAttachment> = {};
    for (const [placeholder, entry] of Object.entries(perSlot)) emitted[placeholder] = emitAttachment(entry, slot, indexOf);
    out[slot] = emitted;
  }
  return out;
}

/**
 * The editor's orders for the two name-keyed collections a skin array carries:
 * the skins themselves (`default` pinned first, the rest by the editor's
 * comparator, refusing a pair it could key differently) and a skin's slot keys.
 * `compile.ts`'s `editorSkinOrder` and `editorSlotKeyOrder` — see the header's
 * 🔸 for why they are passed rather than defined here.
 */
export interface EditorOrder {
  skins: <T extends { name: string }>(skins: readonly T[]) => T[];
  slotKeys: <T>(attachments: Record<string, T>) => Record<string, T>;
}

/**
 * The `skins` array, in the assembly's order before the model existed: each
 * entry built in the model's (the spec's) order, then `order.skins` over the
 * whole — `default` first, the rest in the editor's order. An entry's keys:
 *
 *   `name, bones, ik, transform, path, physics, slider, attachments`
 *
 * — `readSkeletonData`'s own order; each member list only when non-empty, so a
 * skin that activates nothing is the two-key entry it always was. `attachments`
 * is `emitSkinAttachments` keyed by `order.slotKeys`.
 */
export function emitSkins(skins: readonly ModelSkin[], indexOf: (bone: string) => number, order: EditorOrder): SpineSkin[] {
  return order.skins(
    skins.map((skin): SpineSkin => {
      const members: Partial<Record<'bones' | RigSkinConstraintKey, string[]>> = {};
      if (skin.bones.length) members.bones = skin.bones;
      for (const key of RIG_SKIN_CONSTRAINT_KEYS) if (skin.constraints[key].length) members[key] = skin.constraints[key];
      return { name: skin.name, ...members, attachments: order.slotKeys(emitSkinAttachments(skin.attachments, indexOf)) };
    }),
  );
}

/**
 * The `slots` array, in the model's order — the draw order, which a draw-order
 * key's offsets count in, so it is never re-sorted. Keys in the slot
 * constructor's order: `name, bone, attachment, color, dark, blend`, each only
 * when the model carries it.
 *
 * ✂️ `attachment` is left out when the setup is `null`: `SkeletonJson` reads
 * the key with a `null` default, so a slot with no `attachment` shows nothing,
 * which is the shape the editor exports (34 of the 52 slots of `spineboy-pro`).
 */
export function emitSlots(slots: readonly ModelSlot[]): SpineSlot[] {
  return slots.map((model) => {
    const slot: SpineSlot = { name: model.name, bone: model.bone };
    if (model.setup !== null) slot.attachment = model.setup;
    if (model.color !== undefined) slot.color = model.color;
    if (model.dark !== undefined) slot.dark = model.dark;
    if (model.blend !== undefined) slot.blend = model.blend;
    return slot;
  });
}

/**
 * A physics constraint's parameters and their parser defaults
 * (`SkeletonJson.js:295-319`), in the order the motion spec's physics table
 * writes them. The same values are `PARSER_DEFAULTS['physics constraint']`'s;
 * this list is also an ORDER, which that row is not, and `compile.ts` reads it
 * for the names the table copies.
 */
export const PHYSICS_PARAMS: ReadonlyArray<readonly [string, number]> = [
  ['inertia', 0.5],
  ['strength', 100],
  ['damping', 0.85],
  ['mass', 1],
  ['wind', 0],
  ['gravity', 0],
  ['mix', 1],
  ['fps', 60],
  ['limit', 5000],
];

/** The five components a physics constraint drives; each reads 0 in its absence. */
const PHYSICS_COMPONENT_FIELDS = ['x', 'y', 'rotate', 'scaleX', 'shearX'] as const;

/**
 * Each constraint's fields after `name, type`, in the order its builder
 * inserted them before the model existed — read off `buildRigConstraint`'s
 * branch per kind (its `copy` lists and assignments, in call order) and, for a
 * physics constraint the motion spec's table declares, off that loop:
 *
 * - `ik`: `bones, target, scaleY, mix, softness, bendPositive, compress, stretch, skin`
 * - `transform`: `bones, source, properties, localSource, localTarget, additive, clamp,
 *   rotation, x, y, scaleX, scaleY, shearY, mixRotate, mixX, mixY, mixScaleX, mixScaleY,
 *   mixShearY, skin`
 * - `path`: `bones, slot, positionMode, spacingMode, rotateMode, rotation, position, spacing,
 *   mixRotate, mixX, mixY, skin`
 * - `slider`: `animation, additive, loop, mix, bone, property, from, to, scale, max, local,
 *   time, skin` — `bone` … `local` and `time` are exclusive (the bone-less form), so one
 *   list holds both branches
 * - `physics` (rig): `bone, scaleY, x, y, rotate, scaleX, shearX, limit, fps, inertia,
 *   strength, damping, mass, wind, gravity, mix, inertiaGlobal, strengthGlobal,
 *   dampingGlobal, massGlobal, windGlobal, gravityGlobal, mixGlobal, skin`
 * - `physics` (motion table): `bone, x, y, rotate, scaleX, shearX`, then `PHYSICS_PARAMS`'
 *   order — `inertia` … `mix, fps, limit`
 *
 * The rows of the key-order table list `type, name` and a few fields of ik,
 * transform and physics; path and slider have no row, so there every position
 * here is a byte.
 */
const CONSTRAINT_FIELD_ORDER: Readonly<Record<ModelConstraintKind | 'physics table', readonly string[]>> = {
  ik: ['bones', 'target', 'scaleY', 'mix', 'softness', 'bendPositive', 'compress', 'stretch', 'skin'],
  transform: [
    'bones', 'source', 'properties', 'localSource', 'localTarget', 'additive', 'clamp', 'rotation', 'x', 'y', 'scaleX',
    'scaleY', 'shearY', 'mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY', 'skin',
  ],
  path: [
    'bones', 'slot', 'positionMode', 'spacingMode', 'rotateMode', 'rotation', 'position', 'spacing', 'mixRotate', 'mixX',
    'mixY', 'skin',
  ],
  slider: ['animation', 'additive', 'loop', 'mix', 'bone', 'property', 'from', 'to', 'scale', 'max', 'local', 'time', 'skin'],
  physics: [
    'bone', 'scaleY', 'x', 'y', 'rotate', 'scaleX', 'shearX', 'limit', 'fps', 'inertia', 'strength', 'damping', 'mass', 'wind',
    'gravity', 'mix', 'inertiaGlobal', 'strengthGlobal', 'dampingGlobal', 'massGlobal', 'windGlobal', 'gravityGlobal',
    'mixGlobal', 'skin',
  ],
  'physics table': ['bone', ...PHYSICS_COMPONENT_FIELDS, ...PHYSICS_PARAMS.map(([param]) => param)],
};

/**
 * One constraint as the `constraints[]` entry 4.3 reads: `name, type`, then
 * the kind's fields in `CONSTRAINT_FIELD_ORDER`, each only when the model
 * carries it. A field the list has no place for is refused by name rather than
 * dropped — the model's fields are the builders', so this is the emitter
 * declining to guess a position, not a check an author can reach.
 *
 * ✂️ On a physics constraint a component at 0 and a parameter at its
 * `PHYSICS_PARAMS` default are left out — the table loop's inline omission,
 * made here for both routes. On the rig's route it is the parser-default
 * pass's own decision one step early (`PARSER_DEFAULTS['physics constraint']`
 * holds the same values, and `f32` never leaves a `-0`), so no byte moves.
 */
export function emitConstraint(model: ModelConstraint): SpineConstraint {
  const order = CONSTRAINT_FIELD_ORDER[model.kind === 'physics' && model.declaredIn === 'motion' ? 'physics table' : model.kind];
  const out: SpineConstraint = { name: model.name, type: model.kind };
  const stray = Object.keys(model).filter((key) => key !== 'kind' && key !== 'name' && key !== 'declaredIn' && !order.includes(key));
  if (stray.length > 0) {
    throw new CompileError(`internal: ${model.kind} constraint "${model.name}" carries ${stray.join(', ')}, which the emitter has no place for`);
  }
  for (const field of order) {
    const value = model[field];
    if (value === undefined) continue;
    if (model.kind === 'physics') {
      if ((PHYSICS_COMPONENT_FIELDS as readonly string[]).includes(field) && value === 0) continue;
      if (PHYSICS_PARAMS.some(([param, dflt]) => param === field && value === dflt)) continue;
    }
    out[field] = value;
  }
  return out;
}

/** The `constraints[]` array, in the model's order: the rig's in declaration order, then the physics table's. */
export function emitConstraints(constraints: readonly ModelConstraint[]): SpineConstraint[] {
  return constraints.map(emitConstraint);
}

/**
 * The `events` map, in the model's (the rig's declared) order, each definition's
 * keys in the order the assembly wrote them: `int, float, string, audio,
 * volume, balance`, each only when declared. The key order has no row for an
 * event, so every position is this one's. The caller writes the map only when
 * it is non-empty.
 */
export function emitEvents(events: ReadonlyMap<string, ModelEvent>): Record<string, SpineEvent> {
  const out: Record<string, SpineEvent> = {};
  for (const [name, def] of events) {
    const entry: SpineEvent = {};
    if (def.int !== undefined) entry.int = def.int;
    if (def.float !== undefined) entry.float = def.float;
    if (def.string !== undefined) entry.string = def.string;
    if (def.audio !== undefined) entry.audio = def.audio;
    if (def.volume !== undefined) entry.volume = def.volume;
    if (def.balance !== undefined) entry.balance = def.balance;
    out[name] = entry;
  }
  return out;
}
