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
 * `constraints` and `events`; the skeleton's `referenceScale` (issue #958),
 * which wind and gravity act over; and `animations` (issue #921, cut 1e), each a
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
 * spells it as `rigc-compiled/2` (`/1` until issue #1016 added `pages`), and
 * `build` writes that text into `--out` as `skeleton.model.json` beside the
 * Spine files, after the gate, like them.
 */
import { createHash } from 'node:crypto';
import { parseAtlasText } from './atlas.ts';
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
 * The draw, which does need the four — a region's page and page UVs — read
 * them off the atlas written beside this document, as a second input
 * (`src/core/uvs.ts`, issue #967), until issue #1016 gave the document a
 * `pages` section spelled from the atlas text `build` writes (`pagesOfAtlas`
 * below): the four are still not this record's, because they are the written
 * arrangement's, and the section moves with it.
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
  /**
   * The blend as stated, which `parseRigSpec` has held to a spelling the
   * runtime resolves (`RigSlotBlend`: only the first letter's case is free).
   */
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

/**
 * The stage the skeleton declares (issue #1026): its origin `x`, `y` and its
 * extent `width`, `height` — the rig spec's `skeleton.width`/`height` (or the
 * manifest's crop), and its `x`/`y` or 0 beside them (issue #578: four fields
 * or none). `null` where the rig declares no stage.
 *
 * ⭐ **Why the model holds it.** `render` and `check` say whether a candidate
 * declares a stage (issue #714), and `A14`/`A19` read its box; until this field
 * the header of `skeleton.json` was the only place the value was written, so a
 * reader of the document had to open the Spine file beside it.
 *
 * 🔁 **And since issue #907 this is the only place it is written.** The Spine
 * emitter used to copy it into the header's `x`, `y`, `width`, `height`,
 * which the format defines as the setup-pose bounding box; the header now
 * carries that box (`headerBoundsOf` in `src/compile.ts`), and every reader of
 * the stage — `A14`, `A19`, `explain` — reads it here.
 */
export interface ModelStage {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The orders the Spine file lists two collections in, which are not the
 * model's (issue #1026): `skins` — each skin's name and its slot keys — and
 * `animations`, both in the EDITOR's order. `compile` computes it from the
 * model with the same three functions it hands the Spine emitter
 * (`editorSkinOrder`, `editorSlotKeyOrder`, `editorAnimationOrder` in
 * `src/compile.ts`), so the order stated here and the order `skeleton.json`
 * keys are one computation over one input.
 *
 * ⭐ **Why it is a statement of its own rather than the model's arrays
 * re-sorted.** The model's `skins`, a skin's table and `animations` are in the
 * spec's order on purpose (each field's own doc), and everything that reads
 * them reads that order: a draw-order offset, a binding and a constraint
 * count in the model's arrays; `A18` is held, by `MD04`, to see an animations
 * map inserted in another order; and the model-side suppliers of #1025 put the
 * spec's order through the emitter's rules themselves. Measured on the 19
 * recipes `tools/emit_hashes.ts` generates, writing the arrays in the editor's
 * order would have rewritten 18 of the 19 documents (a skin's slot keys on
 * 18, the animations on 5, where 6,308 leaves move to another index) and told
 * every one of those readers something else; stating the order beside them
 * moves no leaf (`docs/COMPILED_MODEL.md` §9 has both counts).
 *
 * A placeholder's position inside one slot is not here: the emitter keeps a
 * slot's own map as built, which is the model's order already.
 */
export interface ModelEditorOrder {
  /** Every skin, `default` first and the rest by the editor's comparator, each with its table's slot keys in the order the file keys them. */
  skins: Array<{ name: string; slots: string[] }>;
  /** Every animation's name, in the order the file keys `animations`. */
  animations: string[];
}

export interface CompiledModel extends CarriedFromCompileResult {
  /**
   * The stage the skeleton declares, or `null` (issue #1026, `ModelStage`).
   * Not in the Spine header since issue #907, which carries the setup-pose
   * bounding box there.
   */
  stage: ModelStage | null;
  /**
   * The editor's orders the Spine file lists skins, their slot keys and
   * animations in (issue #1026, `ModelEditorOrder`) — computed from this
   * model's own `skins` and `animations`, never read back from the file.
   */
  editorOrder: ModelEditorOrder;
  /**
   * The skeleton's reference scale, which a physics constraint's `wind` and
   * `gravity` act over (issue #958): the rig spec's `skeleton.referenceScale`
   * exactly as stated, or — stating none — the 100 the parser reads a header
   * without one as (`UNSTATED_REFERENCE_SCALE` in `src/emit_spine.ts`). It is
   * the number the Spine file is read as either way: the emitter writes this
   * value into the header and the parser-default pass drops it at 100.
   *
   * ⭐ **Why the model holds it.** A Spine header stating 50 moved 30 of 50
   * wind-and-gravity probes under the stepped oracle, and none without wind
   * or gravity (issue #956); the core read the parser's 100 as a constant
   * until this field. A value any backend posing the rig needs belongs here.
   *
   * 🔸 Not `f32`'d: the runtime reads it as the double the header spells
   * (`SkeletonJson` multiplies it by the loader's `scale` and stores it), so
   * it is the rig's number unchanged, and on the grids `modelDocument`
   * states exactly when the rig spec wrote it on one. It is not a libm
   * result, so no platform moves it; none of the nineteen recipes states one,
   * and all nineteen documents carry 100.
   */
  referenceScale: number;
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
// the document: `rigc-compiled/3` (issue #922, cut 1f; `pages` and `/2`,
// issue #1016; `stage`, `editorOrder` and each page's `pma` and `scale`, `/3`,
// issue #1026)
// ---------------------------------------------------------------------------

/**
 * The document's `spec` value. `/2` since issue #1016 added the `pages`
 * section: a `/1` reader (`readModel` of rigc 1.6) refuses a section it does
 * not know by name, so the same spec over a new section would be refused by
 * every reader already installed rather than read wrongly — a new spec says so
 * before the first section is opened. `/3` since issue #1026 added `stage`,
 * `editorOrder` and two fields on every page, for the same reason: a `/2`
 * reader refuses each of them by name. `readModel` reads all three.
 */
export const MODEL_DOCUMENT_SPEC = 'rigc-compiled/3';

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

/** The stage's fields, in the order the Spine header writes them. */
export const MODEL_STAGE_FIELDS = ['x', 'y', 'width', 'height'] as const;
const STAGE_FIELDS: readonly string[] = MODEL_STAGE_FIELDS;

/**
 * The `editorOrder` section: `{ skins: [{ name, slots }], animations }`,
 * refused by name where it is not a permutation of what the model holds — an
 * order naming a skin, a slot key or an animation the model does not have, or
 * leaving one out, would state an order for another rig.
 */
function editorOrderOf(model: CompiledModel): DocValue {
  const order = model.editorOrder;
  const problems: string[] = [];
  const same = (what: string, stated: readonly string[], held: readonly string[]): void => {
    if (JSON.stringify([...stated].sort()) !== JSON.stringify([...held].sort())) problems.push(`${what} lists [${stated.join(', ')}], the model holds [${held.join(', ')}]`);
  };
  same('editorOrder.skins', order.skins.map((s) => s.name), model.skins.map((s) => s.name));
  for (const [i, entry] of order.skins.entries()) {
    const skin = model.skins.find((s) => s.name === entry.name);
    if (skin !== undefined) same(`editorOrder.skins[${i}] "${entry.name}".slots`, entry.slots, Object.keys(skin.attachments));
  }
  same('editorOrder.animations', order.animations, [...model.animations.keys()]);
  if (problems.length > 0) throw new CompileError(`internal: the model's editor order is not its own: ${problems.join('; ')}`);
  return {
    skins: order.skins.map((entry, i) => ordered(entry, ['name', 'slots'], `editorOrder.skins[${i}]`)),
    animations: plain(order.animations, 'editorOrder.animations'),
  };
}

/** The model's fields the document writes, after `spec`, in its key order. */
const MODEL_DOCUMENT_FIELDS: readonly string[] = [
  'referenceScale', 'stage', 'bones', 'slots', 'skins', 'constraints', 'events', 'animations', 'editorOrder',
  'images', 'pageGrids', 'droppedStates', 'absentParts', 'meshBones', 'meshes', 'physics', 'deformTransforms', 'trackDerivations', 'rig',
];

/** The model's fields the document leaves out — see `modelDocument`. */
const MODEL_DOCUMENT_LEFT_OUT: readonly string[] = ['setupWorld'];

/**
 * The compiled model as a document: `rigc-compiled/3`, `JSON.stringify(doc,
 * null, 2)` and a newline — the text `build` writes to `skeleton.model.json`,
 * and the record rigc's own posing core reads (`readModel` in
 * `src/core/index.ts`, issue #380, step 2). Its cost in a build is measured in
 * docs/COMPILED_MODEL.md §6 (issue #926).
 *
 * **Key order.** `spec`, then the model's fields in the order this file
 * declares them — `referenceScale` (issue #958), `stage` (issue #1026, the
 * header's four fields or `null`), `bones`, `slots`, `skins`, `constraints`,
 * `events`, `animations`, `editorOrder` (issue #1026, `{ skins: [{ name,
 * slots }], animations }`) — then the fields carried from `CompileResult` in
 * `CarriedFromCompileResult`'s order: `images`, `pageGrids`, `droppedStates`,
 * `absentParts`, `meshBones`, `meshes`, `physics`, `deformTransforms`,
 * `trackDerivations`, `rig`; then `pages`, where each region sits on its page
 * in the atlas written beside it, and each page's `pma` and `scale` (issue
 * #1026) (`pagesOfAtlas`, issue #1016), which is why
 * the atlas text is the third argument; and last `spine`, the digest of the
 * `skeleton.json` written beside it (`spineFileSha256`, issue #968), which is
 * why the Spine text is the second argument. Inside a model record, its interface's field
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
 * **Numbers** are written exactly as the model holds them, so nothing is
 * re-rounded here; which of them are float32 values, and how a reader reads
 * the rest, is the header's 🔸. A number JSON cannot carry exactly — `-0`,
 * `NaN`, an infinity — is refused by its path (`plain`).
 *
 * 🔒 **Every number the document spells is on one of two grids**: a fixed
 * point of the compiler's float32 spelling (`f32(x) === x` — the shortest
 * decimal naming a float, which is not the float's own double) or of the
 * six-decimal grid (`Math.round(x·1e6)/1e6 === x`). `MX01` in `selftest.ts`
 * holds it over every document the tree's recipes build, with a full double
 * planted to turn it red by its path. One field is the rig spec's number
 * carried unchanged rather than computed, `referenceScale` (issue #958): the
 * runtime reads the header's double, so rounding it here would pose another
 * skeleton; it is on a grid when the spec wrote it on one. A number on neither grid is a full
 * double whose last digits are the platform libm's, which is how the rule was
 * found (issue #942): `meshes[].depth.ceiling` carried `turnCeiling`'s fold
 * figures (`src/depth.ts`) as full doubles from `Math.atan` and the depth
 * tone, and `gallery/look`'s document differed between macOS and the Linux
 * runner by exactly `/meshes/0/depth/ceiling/pitch/negative/{degrees,p1}`,
 * `26.935130523311` against `26.935130523311003`, while its Spine files were
 * identical. Those figures are reported on the six-decimal grid now, and a
 * one-ulp `Math.atan` perturbation either way moves no byte of that document.
 *
 * ⚠️ A grid absorbs a difference in a value, not in a choice. Perturbing
 * `Math.pow` by one ulp moved `gallery/look`'s document until issue #949: the
 * depth tone reaches every `z`, two triangles whose fold angles round to the
 * same six-decimal value traded places as the minimum, and the fold named the
 * other triangle, with its own `depthStep` and `stepShare`. The minimum is
 * now chosen on the six-decimal grid with the lowest triangle ordinal taking
 * a tie (`src/depth.ts`'s `foldPrecedes`), and a one-ulp perturbation of
 * sixteen libm functions, either way, moves no leaf of any gallery document
 * (`TB02`). What is left is a value within one ulp of a rounding boundary.
 *
 * **Left out, and why.** Each is something the model holds that is not a
 * statement about the rig:
 *
 *   - `setupWorld` — computed from `bones` by `computeWorldTransforms`
 *     (`src/transform.ts`), so it states nothing `bones` does not, and a core
 *     is to compute it rather than read it; and it is the one field that can
 *     hold a `-0` (a bone's `c` is `sin 0 · scaleX`, which is `-0` at a
 *     `scaleX` of −1), which JSON cannot spell. (A root's `b` was `-sin 0`
 *     until issue #1021; under the runtime's arithmetic it is `cos 90°` at
 *     pi = 3.1415927, −2.3e-8.)
 *   - `images[].absPath` — where the part was on this machine's disk, for the
 *     size assertions.
 *   - `droppedStates[].why` — the sentence names the `--atlas-in` file by its
 *     absolute path.
 *
 * What the Spine emitter adds (`emitSkeleton`'s header, its spellings and
 * omissions) is not in the model and so not here — except the two things the
 * Spine files were the only place of until issue #1026, which the model now
 * holds and the emitter reads from it: the stage, and the orders the editor
 * lists skins, slot keys and animations in (`editorOrder`, computed by the
 * functions the emitter is handed). The header's `spine`, `fps`, `images` and
 * `audio` are still the emitter's alone.
 */
export function modelDocument(model: CompiledModel, skeletonText: string, atlasText: string): string {
  for (const key of Object.keys(model)) {
    if (!MODEL_DOCUMENT_FIELDS.includes(key) && !MODEL_DOCUMENT_LEFT_OUT.includes(key)) {
      throw new CompileError(`internal: the model document has no place for the model's field "${key}"; it writes [${MODEL_DOCUMENT_FIELDS.join(', ')}] and leaves out [${MODEL_DOCUMENT_LEFT_OUT.join(', ')}]`);
    }
  }
  const doc: { [key: string]: DocValue } = {
    spec: MODEL_DOCUMENT_SPEC,
    referenceScale: plain(model.referenceScale, 'referenceScale'),
    stage: model.stage === null ? null : ordered(model.stage, STAGE_FIELDS, 'stage'),
    bones: model.bones.map((bone, i) =>
      ordered(bone, BONE_FIELDS, `bones[${i}]`, (key, v) => (key === 'editor' ? ordered(v as object, ['color', 'icon'], `bones[${i}].editor`) : plain(v, `bones[${i}].${key}`))),
    ),
    slots: model.slots.map((slot, i) => ordered(slot, SLOT_FIELDS, `slots[${i}]`)),
    skins: model.skins.map((skin, i) => skinOf(skin, `skins[${i}]`)),
    constraints: model.constraints.map((constraint, i) => constraintOf(constraint, `constraints[${i}]`)),
    events: named(model.events, 'events', (event, at) => ordered(event, EVENT_FIELDS, at)),
    animations: named(model.animations, 'animations', (animation, at) => animationOf(animation, at)),
    editorOrder: editorOrderOf(model),
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
    pages: plain(pagesOfAtlas(atlasText), 'pages'),
    spine: { sha256: spineFileSha256(skeletonText) },
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// --- #1016 where each region sits on its page: begin ---
/**
 * One region of a page, as the document's `pages` section states it: the
 * region's name exactly as the atlas line spells it (untrimmed — the core finds
 * a region by that spelling, `./core/uvs.ts`), its rectangle's top-left `x`,
 * `y` on the page (y down) and `width`, `height` in the drawing's orientation,
 * the trim (`offsetX` from the drawing's left, `offsetY` from its bottom) and
 * the untrimmed size, its turn in `degrees`, and its `index:` field — every
 * number in the page's texels, exactly as `parseAtlasText` reads it.
 */
export interface ModelPageRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  originalWidth: number;
  originalHeight: number;
  degrees: number;
  index: number;
}

/**
 * One page: its name (a path from the directory `build` writes into, trimmed),
 * its `size`, its `pma` and `scale` (issue #1026), and its regions in file
 * order.
 *
 * `pma` and `scale` are present on every page `pagesOfAtlas` spells and on
 * every page a `rigc-compiled/3` document states; a `rigc-compiled/2`
 * document's pages carry neither, which is why they are optional here.
 */
export interface ModelPage {
  name: string;
  width: number;
  height: number;
  /** Whether the page's texels are premultiplied, as the runtime reads the page's `pma:` line (absent: false). */
  pma?: boolean;
  /**
   * The number the page's own `scale:` line states, or `null` where the page
   * has none. Not defaulted to the 1 a page without the line is read as: the
   * line is an importer's instruction ("these texels are this much smaller than
   * the drawings"), `check` reports a declared one (issue #171), and a default
   * would state a line the atlas does not have.
   */
  scale?: number | null;
  regions: ModelPageRegion[];
}

/** The fields of a page and of a region, in the order the document writes them — `readModel` mirrors both lists. */
export const MODEL_PAGE_FIELDS = ['name', 'width', 'height', 'pma', 'scale', 'regions'] as const;
export const MODEL_PAGE_REGION_FIELDS = ['name', 'x', 'y', 'width', 'height', 'offsetX', 'offsetY', 'originalWidth', 'originalHeight', 'degrees', 'index'] as const;

/**
 * The document's `pages` section (issue #1016): every page of `atlasText` and
 * every region on it, in file order, with the numbers the draw reads — where
 * each drawing sits, which `./core/uvs.ts` turns into page UVs. `atlasText`
 * is the atlas `build` writes beside the document, the one that run's gate
 * last read: after `--pack` the packed text, after `--copy-images` the text
 * with the copies' page names.
 *
 * ⭐ **Why it is a function of the written atlas rather than a model field.**
 * Issue #939 left the page, `x`, `y` and `rotate` out of `ModelAtlasRect`
 * because `--pack` moves them after `compile` returns and `--copy-images`
 * renames every page — a value the model held from `compile` would state a
 * place the written atlas does not have. The section is spelled from the
 * atlas text instead, so it moves exactly when that text does, and `build`
 * spells the document from the text it writes (`cli.ts`): the document a pack
 * writes is spelled from the packed text and gated by the packed pass, where
 * `A18` compares it with a second compile's document spelled from a second,
 * independent pack.
 *
 * 🔸 **What it leaves out.** The page's `format`, `filter` and `repeat`
 * lines: nothing that draws or checks reads them (the rasteriser samples one
 * way, `src/render.ts`'s header; the pose reads only the ratios the trimmed
 * and original sizes make, #939's decision 2). `pma` and `scale` were left out
 * with them until issue #1026: they are not placement either, but `A06` reads
 * `pma` and `check`'s texture note reads `scale:`, and the atlas was the only
 * place either was written. Every region of every page is written, drawn or
 * not: which regions a rig draws is the core's lookup rule (`./core/uvs.ts`,
 * *Which region, on which page*), and a writer choosing a subset would
 * restate it.
 */
export function pagesOfAtlas(atlasText: string): ModelPage[] {
  const parsed = parseAtlasText(atlasText);
  return parsed.pages.map((page) => ({
    name: page.name,
    width: page.width,
    height: page.height,
    pma: page.pma,
    scale: statedPageScale(parsed.lines, page.nameLine),
    regions: page.regions.map((r) => ({
      name: r.name,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      offsetX: r.offsetX,
      offsetY: r.offsetY,
      originalWidth: r.originalWidth,
      originalHeight: r.originalHeight,
      degrees: r.degrees,
      index: r.index,
    })),
  }));
}

/**
 * A `scale:` line, as `check` has always read one (`atlasScales` in
 * `src/render.ts` reads every such line in a text with this pattern): an
 * indented `scale:` entry and one number. Shared so the two readings — every
 * line of a text, and the lines of one page — cannot drift into two patterns.
 */
export const ATLAS_SCALE_LINE = /^[ \t]+scale:[ \t]*([0-9.eE+-]+)[ \t]*$/;

/**
 * The number a page's own `scale:` line states, or `null` (issue #1026). The
 * page's entries are the lines after its name up to the first line that is
 * blank or carries no colon — where `TextureAtlasReader` stops reading a page's
 * fields, and where `parseAtlasText` stops too. A line `ATLAS_SCALE_LINE`
 * matches and whose number is finite is the statement; the last one wins, as a
 * repeated entry does in `parseAtlasText`. Unlike `AtlasPage.scale`, nothing is
 * defaulted and a non-positive number is stated as written, because this is
 * the line `check` reports, not the ratio an importer divides by.
 */
function statedPageScale(lines: readonly string[], nameLine: number): number | null {
  let stated: number | null = null;
  for (let at = nameLine + 1; at < lines.length; at++) {
    const line = lines[at];
    const trimmed = line.trim();
    if (trimmed.length === 0 || !trimmed.includes(':')) break;
    const m = ATLAS_SCALE_LINE.exec(line);
    if (m === null) continue;
    const value = Number(m[1]);
    if (Number.isFinite(value)) stated = value;
  }
  return stated;
}
// --- #1016 where each region sits on its page: end ---

// --- #968 the Spine file the document was written beside: begin ---
/**
 * The document's last section, `spine`: `{ "sha256": "<64 lowercase hex>" }`,
 * the SHA-256 of the exact bytes `build` writes to `skeleton.json` in the same
 * run (the UTF-8 of `skeletonText`, as `writeFileSync` writes it).
 *
 * ⭐ Why it exists (issue #968). `build` writes the Spine pair and this document
 * as one output, and `rigc render` poses the document through rigc's own core
 * when it finds one beside the skeleton. Nothing else ties the two files: a
 * `skeleton.json` edited by hand after the build, beside the document it was
 * built with, was drawn from the document — the build's rig, not the file the
 * render was pointed at (the `RF89`/`RF91`/`RF93` plants, exit 0 where the
 * Spine file refuses). The render takes the core only when the file beside the
 * document hashes to this value, and names the mismatch otherwise.
 *
 * Named `spine.sha256` rather than a top-level `skeletonSha256`: the section
 * is the document's statement about the Spine output it was written with, a
 * digest of it and nothing about the rig, so it sits apart from the model's
 * fields and after them; and an object leaves the atlas's digest a field to
 * add, not a second section. The file's NAME is not recorded — `build` always
 * writes `skeleton.json` beside this document, and a copied pair keeps both.
 *
 * Deterministic because the Spine file is (`A18` compares a second compile's
 * bytes), so two builds and two platforms write the same value wherever their
 * Spine files agree.
 */
export function spineFileSha256(skeletonText: string | Uint8Array): string {
  return createHash('sha256').update(skeletonText).digest('hex');
}
// --- #968 the Spine file the document was written beside: end ---
