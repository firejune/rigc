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
 * ⚠️ **The numbers are exactly the numbers the file holds**, and the emitter
 * copies them without touching one. Which decimal a number is spelled with is
 * model content and not formatting: it is the double spine-core's JSON reader
 * keeps, so it moves the pose (census §4, 19 of 19 builds).
 *
 * 🔸 **"On the float32 grid" holds for the values `f32` produced, not for
 * every number here** (issue #931's measurement, corrected by #935). A bone's
 * transform, a region's placement and size and a key's value are `f32`'d. A
 * generated weight, and the bind and vertex coordinates an ingested rig
 * states, are `r6` or the source's own decimals: on the nineteen recipes
 * `tools/emit_hashes.ts` generates, 503 of 516 bind coordinates of
 * `gallery/flex` and 767 of 792 of `spineboy-pro` are not float32 values. The
 * runtime reads a bone's and a region's numbers as the doubles the text
 * spells, and a vertex attachment's `vertices` (weights and bind coordinates
 * included) into a float32 array; so a reader reproducing the runtime's pose
 * reads vertex arrays and weights through `Math.fround` and every other number
 * as written. Read as doubles, the corpus's weighted meshes pose 1 to 3
 * millionths away from spine-core; read through `Math.fround`, exact.
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
 * build; and every region's atlas rectangle (issue #935, `ModelAtlasRect`). Every other field is `CompileResult`'s own, carried by reference under
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
 * 📄 **It is written as a document** (issue #922, cut 1f): `modelDocument` below
 * spells it as `rigc-compiled/1`, and `build` writes that text into `--out` as
 * `skeleton.model.json` beside the Spine files, after the gate, like them.
 */
import { CompileError } from './errors.ts';
import type { BoneTransform } from './transform.ts';
import type { RigSkinConstraintKey } from './rig.ts';
import type { CompileResult } from './types.ts';

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
 * A numbered series of atlas regions an attachment draws in turn: the four
 * fields exactly as the spec stated them, each optional one only when stated.
 * Which of them Spine leaves out at the parser's default is the emitter's
 * (`emitSequenceBlock`).
 */
export interface ModelSequence {
  count: number;
  start?: number;
  digits?: number;
  setup?: number;
}

/**
 * The rectangle a region draws through, in the atlas's own numbers and under
 * the names the atlas's `bounds:` and `offsets:` lines carry (issue #935): the
 * kept rectangle's `width` and `height`, in the drawing's orientation; the
 * trim's `offsetX` (from the drawing's left) and `offsetY` (from its bottom);
 * and the untrimmed drawing's `originalWidth` and `originalHeight`. All six are
 * in the page's texels, exactly as the atlas states them (`AtlasRegion` in
 * `src/atlas.ts`) — NOT divided by a page's `scale:`, because the pose reads
 * only their ratios to the record's `width` and `height`.
 *
 * ⭐ **Why the model holds it.** A region's four corners are
 * `x1 = -W/2·sx + offsetX·W/originalWidth·sx`, `x2 = x1 + width·W/originalWidth·sx`
 * (and the same in y) before the record's placement and the bone — measured
 * exact on 3000 of 3000 probes against spine-core 4.3.13, and 976 of 3000 with
 * the trim ignored (issue #931). The trim and the original size live only in
 * the atlas, so until this record held them one model document posed two ways:
 * `examples/3-timing-and-spacing` built against two atlases differing only in
 * `square`'s trim wrote byte-identical `skeleton.model.json` and
 * `skeleton.json`, and spine-core moved that region's corners by 11.925 world
 * units. A value any backend posing the rig needs belongs in the model.
 *
 * 🔸 **What it leaves out, and why.** The page, the rectangle's `x`/`y` on it
 * and its `rotate` are WHERE the drawing sits in one arrangement of the pixels,
 * not what the drawing is: `build --pack` repacks every part onto shared pages
 * after this document is spelled, and `--copy-images` renames every page, so
 * those four would state a place the written atlas does not have on two of
 * the three routes that write one. None of them enters a region's corners
 * (#931: the atlas's `rotate` transposed into the corners was exact on 2018 of
 * 3000 probes, ignored on 3000 of 3000). The trim and the original size do not
 * move under either: rigc's packer never trims or rotates (`src/atlas.ts`).
 */
export interface ModelAtlasRect {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  originalWidth: number;
  originalHeight: number;
}

/**
 * A region's sequence: the four stated fields, and `atlas`, one rectangle per
 * frame in frame order — frame `i` is the region `<path><start + i>`, padded
 * to `digits`, and the runtime draws each frame through its own rectangle
 * (`Sequence.apply` sets the region the corners are computed from).
 *
 * A parallel array rather than a `frames` list of objects: a frame's region
 * NAME is derived from the four fields, so the rectangle is the one thing per
 * frame the record does not already state. Never `null`: the gather pass
 * atlases every frame of every sequence or refuses the missing one by name
 * before any attachment is built. A mesh's or a linked mesh's sequence does not
 * carry it — a mesh's vertices read no atlas (#931, 400 of 400 meshes exact
 * with none), and neither kind's record carries a rectangle.
 */
export interface ModelRegionSequence extends ModelSequence {
  atlas: ModelAtlasRect[];
}

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
  sequence?: ModelSequence;
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
  sequence?: ModelRegionSequence;
  /**
   * The rectangle this region draws through (`ModelAtlasRect`), present exactly
   * when the record has no `sequence` — a sequence's frames carry theirs. It is
   * looked up under the region NAME the runtime asks for — `path`, else the
   * stated `name`, else the placeholder — in the build's one atlas source:
   *
   *   - `--atlas-in`: the pack's region of that name, first match (as
   *     `TextureAtlas.findRegion` resolves it), its numbers as the pack states
   *     them;
   *   - otherwise: the part PNG atlased under that name, which is its own page —
   *     `width`/`height` and `originalWidth`/`originalHeight` the PNG's size,
   *     offsets 0. `build --pack` keeps all six (it never trims);
   *   - `null` when the source has no region of that name — an ingested region
   *     built without `--atlas-in`, or one naming a region the pack lacks. That
   *     is a statement that the build has no source, never a trim of 0, and a
   *     green build never carries one: the emitted atlas has no such region
   *     either, and `A08_REGION_NAMES_MATCH_ATTACHMENTS` refuses the build.
   */
  atlas?: ModelAtlasRect | null;
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
  sequence?: ModelSequence;
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

// ---------------------------------------------------------------------------
// the document: `rigc-compiled/1` (issue #922, cut 1f)
// ---------------------------------------------------------------------------

/** The document's `spec` value. */
export const MODEL_DOCUMENT_SPEC = 'rigc-compiled/1';

/** The file `build` writes the document to, in `--out` beside `skeleton.json` and `skeleton.atlas`. */
export const MODEL_DOCUMENT_FILE = 'skeleton.model.json';

/** A value the document writes: what `JSON.stringify` reproduces exactly. */
type DocValue = string | number | boolean | null | DocValue[] | { [key: string]: DocValue };

/**
 * `record`'s fields in `keys`' order, each only when present (`undefined` is
 * absent, as `JSON.stringify` reads it). A field `keys` does not list is
 * refused by name rather than dropped: a field added to a model record without
 * a place in the document would otherwise vanish from it in silence.
 */
function ordered(record: object, keys: readonly string[], where: string, value: (key: string, v: unknown) => DocValue = (_k, v) => plain(v, `${where}.${_k}`)): { [key: string]: DocValue } {
  const own = record as Record<string, unknown>;
  for (const key of Object.keys(own)) {
    if (!keys.includes(key)) {
      throw new CompileError(`internal: the model document has no place for field "${key}" of ${where}; it writes [${keys.join(', ')}]`);
    }
  }
  const out: { [key: string]: DocValue } = {};
  for (const key of keys) if (own[key] !== undefined) out[key] = value(key, own[key]);
  return out;
}

/**
 * A value the model holds, as the document writes it: objects in their own
 * key order, arrays in theirs. A number JSON cannot carry exactly is refused
 * by its path — `-0` (written `0`), `NaN` and the infinities (written `null`)
 * — and so are `undefined` inside an array (written `null`), a `Map` or `Set`
 * (written `{}`), and anything that is not plain data. Each of those would
 * make the document state a value the model does not hold.
 */
function plain(value: unknown, where: string): DocValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new CompileError(`internal: the model document cannot carry ${value} at ${where}; JSON writes it as null`);
    if (Object.is(value, -0)) throw new CompileError(`internal: the model document cannot carry -0 at ${where}; JSON writes it as 0`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => {
      if (item === undefined) throw new CompileError(`internal: the model document cannot carry undefined at ${where}[${i}]; JSON writes it as null`);
      return plain(item, `${where}[${i}]`);
    });
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: { [key: string]: DocValue } = {};
    for (const [key, item] of Object.entries(value)) if (item !== undefined) out[key] = plain(item, `${where}.${key}`);
    return out;
  }
  throw new CompileError(`internal: the model document cannot carry ${Object.prototype.toString.call(value)} at ${where}; it writes plain data only`);
}

/** A `Map` as the array of its entries in the map's order, each `{ name, … }`. */
function named<V>(map: ReadonlyMap<string, V>, where: string, entry: (value: V, at: string) => { [key: string]: DocValue }): DocValue[] {
  return [...map].map(([name, value]) => ({ name, ...entry(value, `${where}["${name}"]`) }));
}

/** Keys, as the model holds them: each key's own field order is the compiler's, and a byte for the emitter. */
function keysOf(keys: readonly ModelKey[], where: string): DocValue {
  return plain(keys, where);
}

/** One target's timelines: `[{ name, keys }]`, in the model's order. */
function timelinesOf(timelines: ModelTimelines, where: string): DocValue[] {
  return named(timelines, where, (keys, at) => ({ keys: keysOf(keys, at) }));
}

/** target -> timelines: `[{ name, timelines }]`, in the model's order. */
function targetsOf(targets: ReadonlyMap<string, ModelTimelines>, where: string): DocValue[] {
  return named(targets, where, (timelines, at) => ({ timelines: timelinesOf(timelines, at) }));
}

const BONE_FIELDS = ['name', 'parent', 'length', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY', 'inheritMode', 'skinRequired', 'editor'] as const;
const SLOT_FIELDS = ['name', 'bone', 'setup', 'color', 'dark', 'blend'] as const;
const SEQUENCE_FIELDS = ['count', 'start', 'digits', 'setup', 'atlas'] as const;
const ATLAS_RECT_FIELDS = ['width', 'height', 'offsetX', 'offsetY', 'originalWidth', 'originalHeight'] as const;
const BINDING_FIELDS = ['bone', 'x', 'y', 'weight'] as const;
const EVENT_FIELDS = ['int', 'float', 'string', 'audio', 'volume', 'balance'] as const;
const CONSTRAINT_KINDS = ['ik', 'transform', 'path', 'physics', 'slider'] as const;
const ATTACHMENT_FIELDS: Readonly<Record<SkinTableEntry['kind'], readonly string[]>> = {
  mesh: ['kind', 'name', 'path', 'color', 'uvs', 'triangles', 'vertices', 'hull', 'edges', 'width', 'height', 'sequence'],
  boundingbox: ['kind', 'name', 'vertexCount', 'vertices', 'editorColor'],
  clipping: ['kind', 'name', 'end', 'convex', 'inverse', 'vertexCount', 'vertices', 'editorColor'],
  path: ['kind', 'name', 'closed', 'constantSpeed', 'vertexCount', 'vertices', 'lengths', 'editorColor'],
  region: ['kind', 'name', 'path', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'width', 'height', 'color', 'sequence', 'atlas'],
  linkedmesh: ['kind', 'name', 'path', 'source', 'skin', 'slot', 'timelines', 'width', 'height', 'color', 'sequence'],
};

function verticesOf(vertices: ModelVertices, where: string): DocValue {
  return vertices.weighted
    ? ordered(vertices, ['weighted', 'bindings'], where, (key, v) =>
        key === 'bindings'
          ? vertices.bindings.map((influences, i) => influences.map((b, j) => ordered(b, BINDING_FIELDS, `${where}.bindings[${i}][${j}]`)))
          : plain(v, `${where}.${key}`),
      )
    : ordered(vertices, ['weighted', 'xy'], where);
}

function attachmentOf(entry: SkinTableEntry, where: string): DocValue {
  const fields = ATTACHMENT_FIELDS[entry.kind];
  if (fields === undefined) throw new CompileError(`internal: the model document knows no attachment kind "${String(entry.kind)}" at ${where}`);
  if (entry.kind === 'region' && (entry.atlas === undefined) === (entry.sequence === undefined)) {
    throw new CompileError(
      `internal: the region at ${where} carries ${entry.atlas === undefined ? 'neither an atlas rectangle nor a sequence' : 'both an atlas rectangle and a sequence'}; ` +
        'a region states exactly one of the two, and a sequence holds a rectangle per frame (issue #935)',
    );
  }
  return ordered(entry, fields, where, (key, v) => {
    if (key === 'vertices') return verticesOf(v as ModelVertices, `${where}.vertices`);
    if (key === 'sequence') {
      return ordered(v as object, SEQUENCE_FIELDS, `${where}.sequence`, (k, item) =>
        k === 'atlas' ? (item as ModelAtlasRect[]).map((rect, i) => atlasRectOf(rect, `${where}.sequence.atlas[${i}]`)) : plain(item, `${where}.sequence.${k}`),
      );
    }
    if (key === 'atlas') return v === null ? null : atlasRectOf(v as ModelAtlasRect, `${where}.atlas`);
    return plain(v, `${where}.${key}`);
  });
}

/** One rectangle, in `ModelAtlasRect`'s order, every field required. */
function atlasRectOf(rect: ModelAtlasRect, where: string): DocValue {
  for (const key of ATLAS_RECT_FIELDS) {
    if (rect[key] === undefined) throw new CompileError(`internal: the atlas rectangle at ${where} has no ${key}; it states all of [${ATLAS_RECT_FIELDS.join(', ')}]`);
  }
  return ordered(rect, ATLAS_RECT_FIELDS, where);
}

function skinOf(skin: ModelSkin, where: string): DocValue {
  return ordered(skin, ['name', 'bones', 'constraints', 'attachments'], where, (key, v) => {
    if (key === 'constraints') return ordered(skin.constraints, CONSTRAINT_KINDS, `${where}.constraints`);
    if (key !== 'attachments') return plain(v, `${where}.${key}`);
    const bySlot: { [slot: string]: DocValue } = {};
    for (const [slot, byPlaceholder] of Object.entries(skin.attachments)) {
      const entries: { [placeholder: string]: DocValue } = {};
      for (const [placeholder, entry] of Object.entries(byPlaceholder)) entries[placeholder] = attachmentOf(entry, `${where}.attachments["${slot}"]["${placeholder}"]`);
      bySlot[slot] = entries;
    }
    return bySlot;
  });
}

/** A constraint: `kind`, `name`, `declaredIn`, then every other field in the builder's order, which is a byte for the emitter. */
function constraintOf(constraint: ModelConstraint, where: string): DocValue {
  const { kind, name, declaredIn, ...rest } = constraint;
  return { kind, name, declaredIn, ...(plain(rest, where) as { [key: string]: DocValue }) };
}

function animationOf(animation: CompiledAnimation, where: string): { [key: string]: DocValue } {
  return ordered(animation, ['duration', 'bones', 'slots', 'constraints', 'attachments', 'drawOrder', 'events'], where, (key, v) => {
    const at = `${where}.${key}`;
    switch (key) {
      case 'bones':
      case 'slots':
        return targetsOf(v as ReadonlyMap<string, ModelTimelines>, at);
      case 'constraints': {
        const c = animation.constraints;
        return ordered(c, CONSTRAINT_KINDS, at, (kind, byName) =>
          kind === 'ik' || kind === 'transform'
            ? named(byName as ReadonlyMap<string, ModelKey[]>, `${at}.${kind}`, (keys, k) => ({ keys: keysOf(keys, k) }))
            : targetsOf(byName as ReadonlyMap<string, ModelTimelines>, `${at}.${kind}`),
        );
      }
      case 'attachments':
        return named(animation.attachments, at, (bySlot, s) => ({
          slots: named(bySlot, s, (byAttachment, a) => ({
            attachments: named(byAttachment, a, (timelines, t) =>
              ordered(timelines, ['deform', 'sequence'], t, (k, keys) => keysOf(keys as ModelKey[], `${t}.${k}`)),
            ),
          })),
        }));
      case 'drawOrder':
      case 'events':
        return keysOf(v as ModelKey[], at);
      default:
        return plain(v, at);
    }
  });
}

/** The model's fields the document writes, after `spec`, in its key order. */
const MODEL_DOCUMENT_FIELDS: readonly string[] = [
  'bones', 'slots', 'skins', 'constraints', 'events', 'animations',
  'images', 'pageGrids', 'droppedStates', 'absentParts', 'meshBones', 'meshes', 'physics', 'deformTransforms', 'trackDerivations', 'rig',
];

/** The model's fields the document leaves out — see `modelDocument`. */
const MODEL_DOCUMENT_LEFT_OUT: readonly string[] = ['setupWorld'];

/**
 * The compiled model as a document: `rigc-compiled/1`, `JSON.stringify(doc,
 * null, 2)` and a newline — the text `build` writes to `skeleton.model.json`,
 * and the record a posing core of rigc's own will read (issue #380, step 2).
 * Nothing reads it yet.
 *
 * **Key order.** `spec`, then the model's fields in the order this file
 * declares them — `bones`, `slots`, `skins`, `constraints`, `events`,
 * `animations` — then the fields carried from `CompileResult` in
 * `CarriedFromCompileResult`'s order: `images`, `pageGrids`, `droppedStates`,
 * `absentParts`, `meshBones`, `meshes`, `physics`, `deformTransforms`,
 * `trackDerivations`, `rig`. Inside a model record, its interface's field
 * order (`ModelBone`, `ModelSlot`, `ModelSkin`, each attachment kind,
 * `ModelBinding`, `ModelSequence`, `ModelAtlasRect`, `ModelEvent`, `CompiledAnimation`), each
 * field only when the record carries it, and a field the interface does not
 * list refused by name. Three kinds of record keep their own order, because
 * there the order is the value: a constraint's fields after `kind`, `name`,
 * `declaredIn` (the builder's order, which the emitter keeps and which reaches
 * the file where the key-order table has no row), a timeline key's fields
 * (`time`, its channels, `curve`, as the compiler inserted them), and the
 * carried reports, written as `compile` builds them.
 *
 * **Collections.** Every `Map` is an array of `{ name, … }` in the map's
 * order, and that order is the model's own: bones parents first (a weighted
 * binding's index counts in it), slots the draw order (a draw-order offset
 * counts in it), skins, constraints, events and animations in the spec's
 * declared order, timelines and keys in the order they are applied. A skin's
 * attachment table stays an object keyed slot -> placeholder, as the model
 * holds it. An animation writes `bones` and `slots` as `[{ name, timelines:
 * [{ name, keys }] }]`, its `ik` and `transform` constraints as `[{ name, keys
 * }]` and the other three kinds like a bone, and `attachments` as `[{ name:
 * skin, slots: [{ name, attachments: [{ name, deform?, sequence? }] }] }]`;
 * the physics timeline that names no constraint keeps the model's name for it,
 * `*` (`EVERY_GLOBAL_PHYSICS`), not the empty name Spine spells it with.
 *
 * **Numbers** are written exactly as the model holds them — the numbers the
 * Spine file holds — so nothing is re-rounded; which of them are float32
 * values, and how a reader reads the rest, is the header's 🔸. A number JSON cannot carry
 * exactly — `-0`, `NaN`, an infinity — is refused by its path (`plain`).
 *
 * ⚠️ **One carried report is the exception, and it is not machine-independent**
 * (issue #942). `meshes[].depth.ceiling` holds the fold angles `turnCeiling`
 * (`src/depth.ts`) computes with `Math.atan` as full doubles, and no Spine file
 * holds them: one ulp of the platform's `atan` changes their spelling. That is
 * the whole of the macOS/Linux difference in `gallery/look`'s document, measured
 * by reconstruction to the Linux file's hash. Over the nineteen recipes a
 * one-ulp perturbation of `atan2`, `cos`, `sin`, `hypot`, `log` and `log2`
 * moved no output byte; perturbing `atan` or `pow` moved this report only
 * (`pow` reaches it through the depth tone, `Math.pow(level, gamma)`).
 *
 * **Left out, and why.** Each is something the model holds that is not a
 * statement about the rig:
 *
 *   - `setupWorld` — computed from `bones` by `computeWorldTransforms`
 *     (`src/transform.ts`), so it states nothing `bones` does not, and a core
 *     is to compute it rather than read it; and it is the one field holding a
 *     `-0` (a root bone's `b` is `-sin 0`), which JSON cannot spell.
 *   - `images[].absPath` — where the part was on this machine's disk, for the
 *     size assertions.
 *   - `droppedStates[].why` — the sentence names the `--atlas-in` file by its
 *     absolute path.
 *
 * What the Spine emitter adds (`emitSkeleton`'s header, its spellings, its
 * orders and omissions) is not in the model and so not here.
 */
export function modelDocument(model: CompiledModel): string {
  for (const key of Object.keys(model)) {
    if (!MODEL_DOCUMENT_FIELDS.includes(key) && !MODEL_DOCUMENT_LEFT_OUT.includes(key)) {
      throw new CompileError(`internal: the model document has no place for the model's field "${key}"; it writes [${MODEL_DOCUMENT_FIELDS.join(', ')}] and leaves out [${MODEL_DOCUMENT_LEFT_OUT.join(', ')}]`);
    }
  }
  const doc: { [key: string]: DocValue } = {
    spec: MODEL_DOCUMENT_SPEC,
    bones: model.bones.map((bone, i) =>
      ordered(bone, BONE_FIELDS, `bones[${i}]`, (key, v) => (key === 'editor' ? ordered(v as object, ['color', 'icon'], `bones[${i}].editor`) : plain(v, `bones[${i}].${key}`))),
    ),
    slots: model.slots.map((slot, i) => ordered(slot, SLOT_FIELDS, `slots[${i}]`)),
    skins: model.skins.map((skin, i) => skinOf(skin, `skins[${i}]`)),
    constraints: model.constraints.map((constraint, i) => constraintOf(constraint, `constraints[${i}]`)),
    events: named(model.events, 'events', (event, at) => ordered(event, EVENT_FIELDS, at)),
    animations: named(model.animations, 'animations', (animation, at) => animationOf(animation, at)),
    images: plain(model.images.map(({ absPath: _absPath, ...image }) => image), 'images'),
    pageGrids: plain(model.pageGrids, 'pageGrids'),
    droppedStates: plain(model.droppedStates.map(({ why: _why, ...state }) => state), 'droppedStates'),
    absentParts: plain(model.absentParts, 'absentParts'),
    meshBones: plain(model.meshBones, 'meshBones'),
    meshes: plain(model.meshes, 'meshes'),
    physics: plain(model.physics, 'physics'),
    deformTransforms: plain(model.deformTransforms, 'deformTransforms'),
    trackDerivations: plain(model.trackDerivations, 'trackDerivations'),
    rig: plain(model.rig, 'rig'),
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}
