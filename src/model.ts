/**
 * The compiled model — what `compile` knows about a rig once every name is
 * resolved and every number is on the grid the runtime will read, held apart
 * from the shape any one output format gives it (issue #915, step 1b of #380).
 *
 * ## What it is
 *
 * The record a posing core of rigc's own would read: bones with their inherit
 * modes, slots, every attachment kind rigc builds, skins, constraints, events
 * and animations. It is the neutral side of the census in `docs/COMPILED_MODEL.md`:
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
 * ## What it holds
 *
 * `bones` and `setupWorld` (issue #915, cut 1b); the four vertex-attachment
 * kinds — mesh, path, bounding box, clipping — as records whose weighted
 * vertices name their bone (issue #917, cut 1c); and the remaining structural
 * records (issue #919, cut 1d): `slots`, the region and linked-mesh
 * attachments, `skins` holding every attachment as a model record,
 * `constraints` and `events`; and `animations` (issue #921, cut 1e), each a
 * `CompiledAnimation` whose timelines hold the keys the timeline compilers
 * build. Every other field is `CompileResult`'s own, carried by reference under
 * the same name (`CarriedFromCompileResult`) until its own cut gives it a
 * model-side form; the skeleton object, its text and the atlas text are emitted
 * artifacts and are not part of the model at all.
 *
 * ⭐ **A weighted vertex names its bone.** Spine's run binds a vertex to a bone by
 * its POSITION in the emitted bone array, and until cut 1c every vertex
 * attachment carried that run from the moment it was built, so five later
 * stages decoded the index back into a bone. The model keeps the binding by
 * name (`ModelBinding`); the Spine emitter turns names into positions once, at
 * emission, against `bones`' order (`emitVertices`). A bone inserted ahead of a
 * mesh then moves the emitted indexes and no binding.
 *
 * 🔸 **Every omission at a parser fallback the constructors made inline is the
 * emitter's now, and the model holds the value.** A slot's setup attachment is
 * `null` rather than absent; a manifest region carries its `x`, `y` and
 * `rotation` at 0; a physics constraint carries every component and parameter
 * the spec stated, at 0 and at the parser's default included; a linked mesh
 * carries the skin, slot and `timelines` flag it resolves through, its own
 * slot, `default` and `true` included. The Spine emitter leaves each of those
 * out where the constructor used to (`src/emit_spine.ts`).
 *
 * ⚠️ **One omission is still the builder's: `path`** on a region, a mesh and a
 * linked mesh. It is present exactly when `attachmentPath` in `compile.ts`
 * returns one — a stated `path` always, one derived from `image` only where the
 * basename differs from the name the attachment carries. That is the value
 * semantics cut 1c kept for a mesh, and it is not a rule the emitter could run
 * on the model: a STATED `path` equal to the name is written today, a DERIVED
 * one equal to it is not, and the record cannot tell the two apart. Holding
 * the region an attachment resolves through always, and moving that omission
 * to the emitter with a flag for which was stated, is a later decision.
 *
 * 🔸 **The atlas's two constants are not model content.** `filter: Linear,
 * Linear` and `pma: false` (`writeAtlasText` in `src/atlas.ts`) are a sampling
 * hint and an alpha convention the Spine backend chooses and no input states —
 * the census's two `open` rows (docs/COMPILED_MODEL.md §5), decided at cut 1d:
 * they are the atlas emitter's constants, and the model does not carry them.
 *
 * Nothing here is serialised yet: `setupWorld`, `events` and `animations` are `Map`s, and making the model
 * a document (`rigc-compiled/1`) is a later cut of step 1.
 */
import type { BoneTransform } from './transform.ts';
import type { RigSkinConstraintKey } from './rig.ts';
import type { CompileResult, SpineSequence } from './types.ts';

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
   * The atlas region, present exactly when `attachmentPath` in `compile.ts`
   * returns one: stated, or derived from `image` where the basename differs from
   * the name the attachment carries. See the header's ⚠️ — resolving it to the
   * region always is a later decision, and so is moving that omission here.
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
 * A region: one quad of one atlas region (or of a numbered series), placed on
 * the slot's bone. `buildRigRegion` for a rig spec's, `placeRegion` for a
 * manifest part's.
 *
 * `x`, `y`, `rotation`, `scaleX`, `scaleY` are present exactly when the spec
 * stated them — and, for a manifest part, `x`, `y` and `rotation` ALWAYS, since
 * `placeRegion` computes all three and 0 is a placement like any other. The
 * Spine emitter leaves a 0 out (`emitRegion`).
 */
export interface ModelRegionAttachment {
  kind: 'region';
  name?: string;
  /** As on a mesh: present exactly when `attachmentPath` returns one (see the header's ⚠️). */
  path?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width: number;
  height: number;
  color?: string;
  sequence?: SpineSequence;
}

/**
 * A linked mesh: another mesh's geometry under a region of its own.
 *
 * The link is held IN FULL — `skin`, `slot` and `timelines` as the parser
 * resolves them, the defaults applied: `skin` "default" where none was stated,
 * `slot` the attachment's own slot, `timelines` true unless stated false. The
 * Spine emitter leaves out each one that equals the parser's fallback
 * (`emitLinkedMesh`). Whether the author wrote a key or took its default is a
 * fact only the refusals need, and it stays on `compile.ts`'s `PendingLink`.
 */
export interface ModelLinkedMeshAttachment {
  kind: 'linkedmesh';
  name?: string;
  /** As on a mesh: present exactly when `attachmentPath` returns one (see the header's ⚠️). */
  path?: string;
  /** The PLACEHOLDER of the source mesh in `skin`/`slot`. */
  source: string;
  skin: string;
  slot: string;
  /** Whether the link plays its source's deform and sequence timelines. */
  timelines: boolean;
  width: number;
  height: number;
  color?: string;
  sequence?: SpineSequence;
}

/**
 * What a skin table holds per placeholder: a model record of one of the six
 * attachment kinds rigc builds, told apart by `kind`, whose words are Spine's
 * `type` words (a region's `type` is the one the emitter leaves out). rigc
 * emits no point attachment (`DEFERRED_ATTACHMENTS` in `compile.ts`).
 */
export type SkinTableEntry = ModelVertexAttachment | ModelRegionAttachment | ModelLinkedMeshAttachment;

/** One skin's attachments: slot -> placeholder -> record, in the spec's order. */
export type SkinTable = Record<string, Record<string, SkinTableEntry>>;

/** Whether a skin-table entry is one of the four vertex kinds — the ones a deform timeline can key. */
export function isModelVertexAttachment(entry: SkinTableEntry): entry is ModelVertexAttachment {
  return entry.kind === 'mesh' || entry.kind === 'boundingbox' || entry.kind === 'clipping' || entry.kind === 'path';
}

/**
 * One slot, as the slot loop computes it. The slot array IS the draw order, so
 * `CompiledModel.slots` is in the rig's declaration order and a draw-order
 * offset counts in it.
 */
export interface ModelSlot {
  name: string;
  bone: string;
  /** The setup attachment's placeholder; `null` is "shows nothing", which Spine spells by leaving the key out. */
  setup: string | null;
  /**
   * The setup tint as 8-bit hex channels: `rgbaHex` of the motion spec's setup
   * colour (the rounding to the 8-bit grid is value), or the rig's as stated.
   */
  color?: string;
  /** The two-colour tint's dark colour, as stated; a slot with none takes no `rgba2`/`rgb2` timeline. */
  dark?: string;
  blend?: string;
}

/**
 * One skin. `bones` and `constraints` are what it activates (`splitRigSkin`'s
 * member lists, empty for a skin the spec gives none — the manifest's `default`
 * among them); `attachments` is its table, in the spec's order.
 */
export interface ModelSkin {
  name: string;
  bones: string[];
  constraints: Record<RigSkinConstraintKey, string[]>;
  attachments: SkinTable;
}

/** The five constraint kinds Spine 4.3 has. */
export type ModelConstraintKind = 'ik' | 'transform' | 'path' | 'physics' | 'slider';

/**
 * One constraint: its `kind` and `name`, and every field `buildRigConstraint`
 * (for a rig spec's) or the motion spec's physics table computes, under the
 * name it has in the spec, numbers already `f32`'d.
 *
 * `declaredIn` says which of the two built it, and it is here because the
 * bytes differ: the physics table writes a physics constraint's fields in
 * another order than `buildRigConstraint`'s physics branch — `inertia` …
 * `mix`, then `fps`, `limit`, where the builder writes `limit`, `fps` first —
 * and the key-order table lists neither `fps` nor `limit`, so the order
 * survives into the file (`MS05` plants it). A table constraint holds every
 * component and parameter the spec stated, 0 and the parser's default
 * included; which of them Spine leaves out is the emitter's.
 */
export type ModelConstraint = {
  kind: ModelConstraintKind;
  name: string;
  declaredIn: 'rig' | 'motion';
} & Record<string, unknown>;

/** An event's payload, as the rig declares it; `float`, `volume`, `balance` `f32`'d. */
export interface ModelEvent {
  int?: number;
  float?: number;
  string?: string;
  audio?: string;
  volume?: number;
  balance?: number;
}

/**
 * One timeline key, as the timeline compilers in `compile.ts` build it: `time`,
 * then the channels its timeline defines, then `curve` — each in the order the
 * compiler inserted it, which the Spine emitter keeps (a key's field order is a
 * byte wherever the key-order table has no row for its kind).
 *
 * Every number is already on the float32 grid (`keyTime` for `time`, `f32` for
 * the rest), for the reason the header gives.
 *
 * 🔸 **The channel names are Spine's** — `value`, `x`/`y`, `mix`, `mixRotate`,
 * `color`, `offset`/`vertices`, `name`, `mode`/`index`/`delay` — because the
 * motion spec's vocabulary is Spine's (docs/COMPILED_MODEL.md §1.1, *The input
 * vocabulary is already Spine's*; docs/AUTHORING.md, *The vocabulary is
 * Spine's*): a channel is named once, by the format the spec was written
 * against, and a second backend maps from it. A later cut may give the model
 * names of its own; this one does not.
 *
 * 🔸 **`curve` is absolute control points, four per channel, or `'stepped'`.**
 * The points are what `bezierForChannel` computes from an easing's handles (the
 * curve the runtime samples, not the handles an editor shows) or a raw curve's
 * own numbers. `'stepped'` is the format's word for a hold, and the model keeps
 * that word because its one consumer reads the same word: a named easing over a
 * segment whose values do not move is held as `'stepped'` (`easingCurve`,
 * issue #369) — a curve over a flat segment draws nothing, so the two encodings
 * play one animation, and `'stepped'` is the one the editor writes. A later cut
 * may spell the hold another way; this one does not.
 *
 * On an ik key the three flags `bendPositive`, `compress` and `stretch` are
 * the flags IN EFFECT on that key: the key's own where the motion states one,
 * else the constraint's, else the constraint's parser default (issue #273 — the
 * 4.3 parser reads the flags per key without inheriting the constraint's, so
 * which flag a key carries is a value). Which of them Spine writes is the
 * emitter's (`emitAnimations`).
 */
export type ModelKey = { time: number; curve?: number[] | 'stepped' } & Record<string, unknown>;

/** One target's timelines: timeline name (`rotate`, `rgba`, `mix` …) -> its keys, in the spec's order. */
export type ModelTimelines = Map<string, ModelKey[]>;

/** The two timelines an attachment can carry, `deform` compiled before `sequence`. */
export interface ModelAttachmentTimelines {
  deform?: ModelKey[];
  sequence?: ModelKey[];
}

/**
 * One animation: every timeline the motion spec's animation compiles to, each
 * collection in the order the spec states its tracks (the order the timelines
 * are built in), and the declared duration the compiler verified against the
 * last key.
 *
 * A collection is empty when the animation keys nothing of its kind — `drawOrder`
 * and `events` included, since the compiler refuses an empty key list for both.
 * Which of them a format writes, in what order, and under what spelling is the
 * emitter's.
 *
 * ⭐ **The physics timeline that names no constraint is held under
 * `EVERY_GLOBAL_PHYSICS` (`'*'`, `src/motion.ts`)** — the motion spec's own
 * name for the target that drives every physics constraint declaring the keyed
 * property global (issue #726). It is a key of `constraints.physics` and not a
 * collection of its own because its POSITION among the named physics
 * constraints is a value: `readAnimation` builds the physics timelines in the
 * order it reads them and applies them in that order, and the file interleaves
 * it — a motion keying `wob_b`, then `*`, then `wob` writes `wob_b, "", wob`.
 * `'*'` cannot name a constraint (the rig parse refuses a physics constraint of
 * that name), so the key is unambiguous. Spine spells it as the empty name;
 * that spelling is the emitter's.
 */
export interface CompiledAnimation {
  /** The motion spec's declared duration, verified by the compiler to be the last key's time within a frame. */
  duration: number;
  /** bone -> its timelines. */
  bones: Map<string, ModelTimelines>;
  /** slot -> its timelines. */
  slots: Map<string, ModelTimelines>;
  /**
   * By constraint kind: `ik` and `transform` hold one unnamed timeline per
   * constraint, so a constraint maps straight to its keys; `path`, `physics`
   * and `slider` hold timelines by name, like a bone.
   */
  constraints: {
    ik: Map<string, ModelKey[]>;
    transform: Map<string, ModelKey[]>;
    path: Map<string, ModelTimelines>;
    physics: Map<string, ModelTimelines>;
    slider: Map<string, ModelTimelines>;
  };
  /** skin -> slot -> attachment placeholder -> its deform and/or sequence keys. */
  attachments: Map<string, Map<string, Map<string, ModelAttachmentTimelines>>>;
  /**
   * Draw-order keys. A key's `offsets` are the moves as the motion spec states
   * them, each resolved and checked; the order the format needs them in (by
   * setup index) is the emitter's. A key with no `offsets` is "back to the setup
   * order".
   */
  drawOrder: ModelKey[];
  /** Event firings, in the spec's (non-decreasing time) order, each naming a declared event. */
  events: ModelKey[];
}

export interface CompiledModel extends CarriedFromCompileResult {
  /** Every bone, in the rig's declaration order — parents first, as the runtime requires. */
  bones: ModelBone[];
  /** The setup world transform of every bone, computed from `bones`. Never emitted. */
  setupWorld: Map<string, BoneTransform>;
  /** Every slot, in draw order — the rig's declaration order. */
  slots: ModelSlot[];
  /**
   * Every skin, in the order the spec declares them (`default` first when there
   * is one), each with its attachments as model records in the spec's order —
   * NOT the editor's order the emitter sorts skins and slot keys into.
   */
  skins: ModelSkin[];
  /** The rig's constraints in declaration order, then the motion spec's physics table's. */
  constraints: ModelConstraint[];
  /** Event definitions, in the rig's declared order. */
  events: Map<string, ModelEvent>;
  /**
   * Every animation, in the motion spec's order — NOT the editor's order the
   * Spine emitter keys them in (`emitAnimations`).
   */
  animations: Map<string, CompiledAnimation>;
}
