/**
 * The compiled model — what `compile` knows about a rig once every name is
 * resolved and every number is on the grid the runtime will read, held apart
 * from the shape any one output format gives it (issue #915, step 1b of #380).
 *
 * ## What it is
 *
 * The record a posing core of rigc's own would read: bones with their inherit
 * modes, and in later cuts slots, attachments, constraints, events and
 * animations. It is the neutral side of the census in `docs/COMPILED_MODEL.md`:
 * a value belongs here when any backend posing this rig would need it, and a
 * spelling, a key order or an omission at a parser default belongs to the
 * emitter that writes one format. The Spine emitter (`src/emit_spine.ts`) is its
 * first consumer, and the one that owns every Spine 4.3 byte; the model owns
 * none.
 *
 * ⚠️ **Numbers are already on the float32 grid** (`f32` in `compile.ts`). That is
 * model content and not formatting: which decimal a float32 is spelled with is
 * the double spine-core's JSON reader keeps, so it moves the pose (census §4,
 * 19 of 19 builds). The model therefore holds exactly the numbers the file
 * holds, and the emitter copies them without touching one.
 *
 * ## What this cut fills
 *
 * `bones` and `setupWorld` (issue #915, cut 1b), and the four vertex-attachment
 * kinds — mesh, path, bounding box, clipping — as records whose weighted
 * vertices name their bone (issue #917, cut 1c), held in `attachments`. Every
 * other field is `CompileResult`'s own, carried by reference under the same
 * name (`CarriedFromCompileResult`) until its own cut gives it a model-side
 * form; the skeleton object, its text and the atlas text are emitted artifacts
 * and are not part of the model at all.
 *
 * ⭐ **A weighted vertex names its bone.** Spine's run binds a vertex to a bone by
 * its POSITION in the emitted bone array, and until cut 1c every vertex
 * attachment carried that run from the moment it was built, so five later
 * stages decoded the index back into a bone. The model keeps the binding by
 * name (`ModelBinding`); the Spine emitter turns names into positions once, at
 * emission, against `bones`' order (`emitVertices`). A bone inserted ahead of a
 * mesh then moves the emitted indexes and no binding.
 *
 * 🔸 **Region, point and linked-mesh attachments are still Spine objects**, and
 * a skin table's entry is therefore a union (`SkinTableEntry`): a model record
 * for the four vertex kinds, the Spine object for the others, told apart by the
 * model record's `kind` (a Spine attachment carries `type`, or nothing for a
 * region). Cut 1d gives the remaining kinds their records and removes the union.
 * rigc emits no point attachment at all today (`DEFERRED_ATTACHMENTS` in
 * `compile.ts`), so in practice the Spine half holds regions and linked meshes.
 *
 * Nothing here is serialised yet: `setupWorld` is a `Map`, and making the model
 * a document (`rigc-compiled/1`) is a later cut of step 1.
 */
import type { BoneTransform } from './transform.ts';
import type { CompileResult, SpineLinkedMeshAttachment, SpineRegionAttachment, SpineSequence } from './types.ts';

/**
 * One bone, as `buildBone` computes it — a field is present exactly when the rig
 * spec declared it (or, for `x`/`y`/`rotation`, when `from` supplied it), and
 * every number is already `f32`'d.
 */
export interface ModelBone {
  name: string;
  parent?: string;
  length?: number;
  /** Local to the parent, y up. Solved from the manifest when the spec says `from`. */
  x?: number;
  y?: number;
  /** Degrees, CCW, y up. */
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  shearX?: number;
  shearY?: number;
  /**
   * The inherit MODE, as the spec states it (the rig parse admits the runtime's
   * first-letter fold, so `noScale` and `NoScale` both reach here). What key the
   * mode is written under is the emitter's: Spine 4.3 spells it `inherit`.
   */
  inheritMode?: string;
  /** The bone is inactive unless the applied skin names it. Spine 4.3 spells it `skin`. */
  skinRequired?: boolean;
  /** Editor affordances: no pose reads them. */
  editor?: { color?: string; icon?: string };
}

/**
 * The fields of `CompileResult` the model carries as they are today, by
 * reference. A later cut replaces one of these with a model-side form by moving
 * it out of this list.
 */
export type CarriedFromCompileResult = Pick<
  CompileResult,
  | 'images'
  | 'pageGrids'
  | 'droppedStates'
  | 'absentParts'
  | 'declaredDurations'
  | 'meshBones'
  | 'meshes'
  | 'physics'
  | 'deformTransforms'
  | 'trackDerivations'
  | 'rig'
>;

/**
 * One influence of a weighted vertex: the bone by NAME, the vertex in that bone's
 * local setup space, and the share it carries. Every number is exactly what the
 * emitted run holds — `f32` (and, for a generated mesh, the generator's `r6` on
 * the weight) already applied where the builder applies it.
 */
export interface ModelBinding {
  bone: string;
  x: number;
  y: number;
  weight: number;
}

/**
 * A vertex attachment's geometry, in one of the format's two encodings.
 *
 * `weighted` is said outright. Spine's reader chooses the encoding by comparing
 * the run's length with the vertex count and nothing else, so a run of the
 * wrong length is read as the other encoding without a word; the model does not
 * inherit that, and the Spine emitter is the one place the choice becomes a
 * length again.
 *
 *   - unweighted: `xy`, one `x, y` per vertex in the attachment's own space (the
 *     slot bone's), the numbers exactly as the emitted array carries them;
 *   - weighted: `bindings`, per vertex its influences in order, each naming its bone.
 */
export type ModelVertices = { weighted: false; xy: number[] } | { weighted: true; bindings: ModelBinding[][] };

/**
 * A mesh: `buildRigMesh`'s authored geometry, the five generators' output, and a
 * manifest part's ring or ribbon. Fields as the builders compute them today.
 */
export interface ModelMeshAttachment {
  kind: 'mesh';
  /** The spec's own `name`, present exactly when stated (issue #796). */
  name?: string;
  /**
   * The atlas region, present exactly when it differs from the name the
   * attachment is known by — `attachmentPath` in `compile.ts` still makes that
   * omission, as it did before the model existed. Resolving it to the region
   * always is a later cut's, with the region attachment's own.
   */
  path?: string;
  color?: string;
  uvs: number[];
  triangles: number[];
  vertices: ModelVertices;
  hull: number;
  edges: number[];
  width: number;
  height: number;
  sequence?: SpineSequence;
}

/** A bounding box: a polygon and nothing else. */
export interface ModelBoundingBoxAttachment {
  kind: 'boundingbox';
  name?: string;
  vertexCount: number;
  vertices: ModelVertices;
  /** The editor's display colour; no pose reads it. Spine writes it as `color`. */
  editorColor?: string;
}

/** A clipping polygon, and the slot its clip ends at. */
export interface ModelClippingAttachment {
  kind: 'clipping';
  name?: string;
  end?: string;
  convex?: boolean;
  inverse?: boolean;
  vertexCount: number;
  vertices: ModelVertices;
  editorColor?: string;
}

/** A path: knots and their handles, and the cumulative curve lengths stated or measured on the setup pose. */
export interface ModelPathAttachment {
  kind: 'path';
  name?: string;
  closed?: boolean;
  constantSpeed?: boolean;
  vertexCount: number;
  vertices: ModelVertices;
  lengths: number[];
  editorColor?: string;
}

/** The four attachment kinds that carry a vertex array — the ones a deform timeline can key. */
export type ModelVertexAttachment =
  | ModelMeshAttachment
  | ModelBoundingBoxAttachment
  | ModelClippingAttachment
  | ModelPathAttachment;

/**
 * What a skin table holds per placeholder in cut 1c: a model record for the four
 * vertex kinds, or the Spine object for a region or a linked mesh, which are not
 * model records until cut 1d. The emitter maps the first and passes the second
 * through; 1d removes this union.
 */
export type SkinTableEntry = ModelVertexAttachment | SpineRegionAttachment | SpineLinkedMeshAttachment;

/** Skin -> slot -> placeholder -> entry. */
export type SkinTables = Map<string, Record<string, Record<string, SkinTableEntry>>>;

/** Whether a skin-table entry is a model record (it has a `kind`) rather than a Spine object. */
export function isModelVertexAttachment(entry: SkinTableEntry): entry is ModelVertexAttachment {
  return 'kind' in entry;
}

/**
 * The attachment type an entry would be read as: a model record's `kind`, which
 * for these four is Spine's `type` word for word, or a Spine object's `type`,
 * absent on a region. The one reader of both halves of `SkinTableEntry`.
 */
export function attachmentTypeOf(entry: SkinTableEntry): string {
  if (isModelVertexAttachment(entry)) return entry.kind;
  return (entry as { type?: string }).type ?? 'region';
}

export interface CompiledModel extends CarriedFromCompileResult {
  /** Every bone, in the rig's declaration order — parents first, as the runtime requires. */
  bones: ModelBone[];
  /** The setup world transform of every bone, computed from `bones`. Never emitted. */
  setupWorld: Map<string, BoneTransform>;
  /**
   * Every skin's attachments, in the order the spec declares skins, slots and
   * placeholders — NOT the editor's order the emitter sorts skins and slot keys
   * into. Vertex attachments are model records; the rest are the Spine objects
   * the skeleton file carries (`SkinTableEntry`), which the emitter's two
   * whole-object passes reach in place, as they did before the model existed.
   */
  attachments: SkinTables;
}
