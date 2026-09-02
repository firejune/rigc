/**
 * The rig spec — `"spec": "rigc-rig/1"`. The skeleton as **data**.
 *
 * Until this file existed the bone tree and the slot table were code: three
 * hard-coded formations in `src/archetype.ts`, a slot outside their tables a
 * compile error, and therefore **no skeleton anybody else owns could be stated
 * at all**. That was blocker B1 of [docs/LADDER.md](../docs/LADDER.md), and it
 * gated every rung of the benchmark ladder.
 *
 * ## The vocabulary is Spine's
 *
 * ⭐ Wherever rigc has no better abstraction, this format uses **Spine 4.3's own
 * concept and its own field name, with Spine's own default**, so that an agent
 * that has read Spine's documentation can author a rig here without learning a
 * second vocabulary. `bones[]` is Spine's bone list; `slots[]` is Spine's slot
 * list and its array order is the draw order; `skins` holds Spine's placeholder
 * → attachment maps; `constraints[]` is 4.3's single typed constraint array.
 * Field lists below cite `SkeletonJson.ts` line numbers, which
 * [docs/SPEC_COVERAGE.md](../docs/SPEC_COVERAGE.md) part 1 enumerates in full.
 *
 * Everything rigc adds sits **on top** of that vocabulary and is namespaced so a
 * reader can see where Spine stops:
 *
 * - `from` on a bone — take this bone's setup position from the cut manifest
 *   (an anchor, a part window, a mesh centre) instead of writing a literal that
 *   would drift away from the measured art.
 * - `generator` on a mesh attachment — build the geometry with one of the
 *   builders in `src/mesh.ts` instead of authoring vertex arrays by hand.
 * - `image` on an attachment — name a PNG and let rigc **measure** it, rather
 *   than restating a `width`/`height` that can silently disagree with the file
 *   (SPEC_COVERAGE part 1-6: a missing `width` loads as `NaN`, with no error).
 * - `invariants` — the structural facts skeleton JSON cannot state about itself,
 *   which the validator's archetype assertions read. Nothing in the file says
 *   "this bone carries the cut's axis" or "this parentage is forbidden".
 *
 * ## What a field's PRESENCE means
 *
 * 🔑 **A field is emitted exactly when the spec declares it.** Not "when it
 * differs from the default" — Spine's own exporter omits defaults, but rigc
 * cannot, because a rig may need to say `x: 0` out loud (the overlay formation's
 * handle bone does) and because deciding emission from the *value* makes the
 * emitted file depend on arithmetic rather than on what the author wrote. Omit a
 * field and Spine's default stands; write it and it is in the file. A bone whose
 * position comes `from` the manifest counts as declaring `x` and `y`, because
 * the manifest declared them.
 *
 * ## What this format does NOT own
 *
 * rigc joins three files and each owns a domain:
 *
 * - the **cut manifest** owns measured geometry — crop, part offsets and sizes,
 *   mask polygons, the state machine, anchors, the axis, the measured ceilings;
 * - the **rig spec** (this file) owns skeleton structure — bones, slots, skins,
 *   constraints, and the invariants;
 * - the **motion spec** owns time — named easings, groups, setup pose, the
 *   physics tuning table, and the animations.
 *
 * A cut compiled from all three declares its attachments in the manifest (see
 * `slots` below for the join rule) and leaves `skins` empty. A foreign skeleton
 * with no manifest at all declares them here.
 */
import { CompileError, NotImplementedError } from './errors.ts';

export { CompileError, NotImplementedError };

/** The only version this compiler reads. */
export const RIG_SPEC_VERSION = 'rigc-rig/1';

// ---------------------------------------------------------------------------
// skeleton header — `root.skeleton` (SkeletonJson.ts:75-87)
// ---------------------------------------------------------------------------

/**
 * The setup-pose bounding box and the runtime hints, all optional.
 *
 * `x`/`y` default to 0 and `width`/`height` fall back to the cut manifest's crop
 * when there is one. With neither a manifest nor a declaration here the compile
 * fails by name: `width`/`height` are what `A14_NO_FULL_FRAME_MESH` and
 * `A19_OVERLAY_PNGS_HAVE_ALPHA` measure against, and a guessed stage is a gate
 * that measures against a number nobody wrote down.
 *
 * `spine` is not here: rigc emits its own version label and `A16` re-checks it.
 * `hash` is not here either — it is the editor's change-detection token and
 * inventing one would be claiming an export this file did not come from.
 */
export interface RigSkeletonHeader {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Nonessential; `SkeletonData.fps` stays 30 when absent. */
  fps?: number;
  /** 4.2+; the runtime's physics/scale reference. Parser default 100. */
  referenceScale?: number;
  /** Nonessential path hint the editor writes; carried through verbatim. */
  images?: string;
}

// ---------------------------------------------------------------------------
// bones — `root.bones[]` (SkeletonJson.ts:90-118)
// ---------------------------------------------------------------------------

/**
 * `BoneData.ts:80`. Resolved by `Utils.enumValue`, which upper-cases the first
 * letter, so `"noScale"` and `"NoScale"` both load; rigc accepts either and
 * emits the lower-camel spelling the editor writes.
 *
 * ⚠️ 4.0/4.1 called this field `transform`. That name still *loads* in 4.3 and
 * the inheritance silently falls back to Normal — assertion `A02`.
 */
export type RigBoneInherit = 'normal' | 'onlyTranslation' | 'noRotationOrReflection' | 'noScale' | 'noScaleOrReflection';

export const RIG_BONE_INHERIT: readonly RigBoneInherit[] = [
  'normal',
  'onlyTranslation',
  'noRotationOrReflection',
  'noScale',
  'noScaleOrReflection',
];

/**
 * Take a bone's setup transform from the cut manifest rather than from a literal.
 *
 * ⭐ This is the one place the rig spec deliberately does not mirror Spine, and
 * the reason is the oldest rule in this project: **the compiler never re-measures
 * art, and a measured number lives in exactly one file.** A rig that wrote
 * `x: 456.5` would be a second copy of a part offset the manifest already holds,
 * and the two would drift the first time the art moved — silently, because both
 * files would still be valid.
 *
 * Exactly one of `anchor` / `slotWindow` / `meshCenter` may be given, and it
 * supplies the bone's `x` and `y`. All three name a point in **crop pixels, y
 * down**; the compiler converts it to Spine world (y up, origin at the crop's
 * bottom-left) and then into the parent bone's local space, so a rotated parent
 * is handled by the same inverse the mesh binder uses.
 */
export interface RigBoneFrom {
  /** A key of the manifest's `anchors` block: `[x, y]` or `[x, y, facing_deg]`. */
  anchor?: string;
  /** The centre of a manifest part's window, named by the rig slot it fills. */
  slotWindow?: string;
  /** A manifest part's `mesh.center` — the aperture a ring deforms about. */
  meshCenter?: string;
  /**
   * Where the setup rotation comes from. Omit and no rotation is emitted.
   *
   *   `axis`   — the manifest's `axis.deg`, negated into Spine's y-up CCW. This
   *              is the keystone of an articulated cut: the stroke is a
   *              translateX along this bone, so a sibling cut at another camera
   *              angle changes one number instead of every key.
   *   `anchor` — the third element of the named anchor, a screen-space facing
   *              angle. A grip whose local +X points radially outward turns
   *              "expand the ring" into one shared translate key.
   */
  rotation?: 'axis' | 'anchor';
}

/**
 * One bone. Spine's field set, Spine's defaults (`SkeletonJson.ts:90-118`).
 *
 * `parent` is resolved by name and **must be declared earlier in the array** —
 * the parser resolves against the bones it has already read, so a forward
 * reference is not a rigc restriction.
 */
export interface RigBone {
  name: string;
  /** Omitted only by the skeleton's single root bone. */
  parent?: string;
  /** Default 0. Cosmetic in a renderer; part of a faithful reproduction. */
  length?: number;
  /** Local to the parent. Default 0. Supplied by `from` when that is given. */
  x?: number;
  y?: number;
  /** Degrees, CCW, y up. Default 0. Supplied by `from.rotation` when given. */
  rotation?: number;
  /** Default 1. */
  scaleX?: number;
  scaleY?: number;
  /** Default 0. */
  shearX?: number;
  shearY?: number;
  /** Default `normal`. 4.2+ name; 4.0/4.1 called it `transform` — see A02. */
  inherit?: RigBoneInherit;
  /**
   * Default false → `BoneData.skinRequired`: this bone is **inactive** unless the
   * applied skin names it in its `bones` list (see `RigSkinEntry`). Half a switch
   * on its own, so rigc refuses the flag without a skin that activates it.
   */
  skin?: boolean;
  /** `rrggbbaa`. Editor affordance; no rendering effect. */
  color?: string;
  /**
   * The editor's icon for this bone. Editor affordance; no rendering effect,
   * and no assertion checks the name — the icon vocabulary belongs to the
   * editor, so an unknown one is not rigc's error to raise.
   */
  icon?: string;
  /** rigc extension — see `RigBoneFrom`. */
  from?: RigBoneFrom;
}

// ---------------------------------------------------------------------------
// slots — `root.slots[]` (SkeletonJson.ts:121-141)
// ---------------------------------------------------------------------------

/** `SlotData.ts:64`. */
export type RigSlotBlend = 'normal' | 'additive' | 'multiply' | 'screen';

export const RIG_SLOT_BLEND: readonly RigSlotBlend[] = ['normal', 'additive', 'multiply', 'screen'];

/**
 * One slot. **The array order IS the draw order** — there is no separate setup
 * draw-order field anywhere in the format.
 *
 * The rig's slot list is the CANONICAL table, which is a slightly stronger claim
 * than "the slots this cut emits". A cut whose manifest carries no part for a
 * slot does not emit it, and the emitted array is then a *subsequence* of this
 * one; that is what `A26_SLOT_DRAW_ORDER` checks. Declaring a slot no cut fills
 * is therefore legitimate — it fixes where that slot will sit when a cut does
 * fill it.
 */
export interface RigSlot {
  name: string;
  /** Required. A miss throws in the parser: `Couldn't find bone … for slot …`. */
  bone: string;
  /**
   * The setup-pose attachment name, or `null` for "show nothing".
   *
   * ⚠️ For a cut compiled with a motion spec this is **not** where the setup pose
   * comes from: `motion.setup` owns it, because which of the two overlay
   * mechanisms a slot uses (attachment + alpha 0, or attachment swapping) is a
   * decision about time. Declaring it in both is a compile error.
   */
  attachment?: string | null;
  /** `rrggbbaa`. Default opaque white. */
  color?: string;
  /** Two-colour tint, `rrggbb`. 🚫 `A12_NO_DARK_COLOR` under `spine-html`. */
  dark?: string;
  /** Default `normal`. */
  blend?: RigSlotBlend;
}

// ---------------------------------------------------------------------------
// attachments — `readAttachment` (SkeletonJson.ts:535-654)
// ---------------------------------------------------------------------------

/**
 * Which builder in `src/mesh.ts` makes this mesh's geometry, and its parameters.
 *
 * The builders stay **code** and are invoked by **data**: they encode a
 * deformation model (what is pinned, what may move, how authority falls off),
 * and a model is not a table of numbers.
 *
 * ⚠️ A cut with a manifest does not use this. There the generator is invoked
 * through the manifest's `mesh` block, because everything a generator needs —
 * the mask contour, the aperture centre, the part window — is *measured art*,
 * and measured art lives in the manifest. `generator` is for a skeleton with no
 * manifest behind it.
 */
export type RigMeshGenerator =
  | {
      kind: 'ring';
      /** The seam contour, in part-local pixels, y down. At least 6 points. */
      hull: Array<[number, number]>;
      /** Aperture centre, part-local pixels, y down. */
      center: [number, number];
      /** Inner ring position between the centre (0) and the hull (1). */
      inner: number;
      /** Part window size, for UVs. */
      size: [number, number];
      /** Directional authority across an axis — see `sideWeight` in mesh.ts. */
      bias?: { axis_deg: number; ramp: [number, number] };
      /** Control bones, by name. More than one splits the ring by angle. */
      controls: string[];
    }
  | {
      kind: 'ribbon';
      /** Part window size in pixels. The strip spans it. */
      size: [number, number];
      /** Cross rows, entry first. Triangles = 2 * (rows - 1). */
      rows: number;
      /** The bone chain the strip rides, root first. */
      chain: string[];
    }
  | {
      /**
       * 🚧 Not implemented. An alpha-contour triangulator (ear clipping over the
       * part's own mask) is the obvious third builder and `src/mesh.ts` does not
       * have one; `buildRingMesh` and `buildRibbonMesh` are the only two.
       */
      kind: 'contour';
      [param: string]: unknown;
    };

/** `SkeletonJson.ts:540-559`. `type` defaults to `region` (`:539`). */
export interface RigRegionAttachment {
  type?: 'region';
  /** The atlas region to resolve. Defaults to the attachment's own name. */
  path?: string;
  /**
   * rigc extension: a PNG, relative to the rig's `images` directory.
   *
   * ⭐ Naming a file instead of a size is the point. `width`/`height` have **no
   * parser default** — an omission loads as `NaN` and every UV collapses with no
   * error — so a spec that restates them by hand carries a number that can
   * disagree with the pixels. Give an `image` and rigc reads the PNG header and
   * fills both in; the atlas page it emits is that same file, so the size in the
   * skeleton and the size in the atlas cannot drift apart.
   */
  image?: string;
  x?: number;
  y?: number;
  /** Degrees. Cancels a rotated bone for a plate authored in screen space. */
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  /** Required by the format; may be omitted here when `image` is given. */
  width?: number;
  height?: number;
  /** `rrggbbaa`. */
  color?: string;
}

/**
 * `SkeletonJson.ts:568-605`. Either authored geometry or a `generator`, never
 * both.
 *
 * ⚠️ `vertices` has no encoding flag anywhere in the format. If its length
 * equals `uvs.length` the parser reads unweighted x/y pairs; otherwise it reads
 * the weighted run `boneCount, (boneIndex, bindX, bindY, weight) × n, …`. A
 * coincidental length match reads weight data as coordinates, silently — which
 * is `A04_MESH_TRIANGLES_AND_ENCODING`.
 */
/**
 * One bone's pull on one vertex of an authored mesh, **named**.
 *
 * `x`/`y` are the vertex's position in that bone's own setup space — the same
 * pair Spine's weighted run carries after the bone index. `weight` is its share;
 * a vertex's weights sum to 1.
 */
export interface RigMeshBinding {
  /** Resolved against the rig's bone list at emit. An unknown name is refused. */
  bone: string;
  x: number;
  y: number;
  weight: number;
}

export interface RigMeshAttachment {
  type: 'mesh';
  path?: string;
  image?: string;
  /** Its length defines `worldVerticesLength`; required with authored geometry. */
  uvs?: number[];
  triangles?: number[];
  /**
   * Geometry, in one of two forms.
   *
   * **Unweighted** — one `x, y` pair per uv pair, and `vertices.length` equals
   * `uvs.length`. Nothing here names a bone, so nothing here can be rebound.
   *
   * **Weighted, raw** — Spine's own encoding,
   * `boneCount, (boneIndex, bindX, bindY, weight) x n` per vertex, where
   * `boneIndex` is a position in the EMITTED bone array. 🚨 That array is not
   * something a rig spec writes or can see, so those indices shift under any
   * edit to the bone list and every vertex silently rebinds — the mesh still
   * loads, every weight still sums to 1, and nothing in the file objects. rigc
   * therefore refuses this form unless the attachment says `boneIndexing: "raw"`
   * out loud. Use `weights` instead.
   */
  vertices?: number[];
  /**
   * Weighted geometry that binds **by name**: one entry per vertex, each a list
   * of `{ bone, x, y, weight }`. This is the default form and the one everything
   * else in a rig spec already uses — a bone's `parent`, a slot's `bone`, a
   * constraint's `bones` and `target` all resolve by name and refuse a miss by
   * name. The compiler resolves these to indices on emit, so inserting a bone
   * moves the indices and changes nothing about what the mesh is bound to.
   *
   * Mutually exclusive with `vertices`.
   */
  weights?: RigMeshBinding[][];
  /**
   * How a weighted `vertices` run names its bones. Default `"name"`, which means
   * "there is no weighted run here — use `weights`". `"raw"` opts into the index
   * encoding above, for a spec transcribed from an export that has not been
   * migrated yet. It is an opt-in because the cost of it is silence.
   */
  boneIndexing?: 'name' | 'raw';
  /** Hull vertex count. The loader stores it doubled. */
  hull?: number;
  /** Edge index pairs; nonessential, editor-drawn. */
  edges?: number[];
  width?: number;
  height?: number;
  color?: string;
  /** Build the geometry instead of authoring it — see `RigMeshGenerator`. */
  generator?: RigMeshGenerator;
}

/**
 * The geometry every non-region attachment shares: a polygon, either pinned to
 * one bone or weighted across several.
 *
 * ⭐ `vertexCount` is REQUIRED and cross-checked, and that is the whole design of
 * these two types. A mesh gets its vertex count from `uvs.length`, so there is
 * nothing to state; a bounding box and a clipping polygon have no uvs, and the
 * parser reads `map.vertexCount << 1` — with the field absent that is
 * `undefined << 1` = **0**, so `readVertices` takes the weighted branch,
 * decodes coordinates as a weight run, and hands back an attachment with no
 * vertices at all. Nothing throws. So the count is declared here and checked
 * against whichever encoding the spec used.
 *
 * The two encodings are the mesh's, unchanged, and for the same reason:
 * `weights` binds by NAME and is the default; `vertices` is either an unweighted
 * `x, y` run (one pair per vertex) or Spine's index-encoded weighted run, and
 * the second of those needs `boneIndexing: "raw"` said out loud because a bone
 * inserted anywhere above shifts every index in silence (issue #45).
 */
export interface RigVertexGeometry {
  /** Required. No parser default: absent reads as 0 and the polygon vanishes. */
  vertexCount: number;
  /**
   * Unweighted `x, y` pairs (`vertices.length === vertexCount * 2`), or Spine's
   * weighted run behind `boneIndexing: "raw"`. Mutually exclusive with `weights`.
   */
  vertices?: number[];
  /** Weighted geometry bound by name — one entry per vertex. The default form. */
  weights?: RigMeshBinding[][];
  /** `"raw"` opts a `vertices` weighted run into the index encoding. */
  boneIndexing?: 'name' | 'raw';
  /** `rrggbbaa`. Editor affordance: the colour the box is drawn in. */
  color?: string;
}

/**
 * `type: "boundingbox"` (`SkeletonJson.ts:560-567`).
 *
 * **When you need one:** a polygon the game can hit-test against — a hurt box, a
 * pick region, a trigger volume — that moves with the skeleton and draws
 * nothing. It is the only attachment type whose entire purpose is outside the
 * renderer, which is why it has no `path`, no size and no uvs.
 */
export interface RigBoundingBoxAttachment extends RigVertexGeometry {
  type: 'boundingbox';
}

/**
 * `type: "clipping"` (`SkeletonJson.ts:635-651`).
 *
 * **When you need one:** a mask. The polygon clips every slot drawn from the one
 * carrying it up to and including `end`, so a window, a portal or a wipe is one
 * attachment rather than a second set of art.
 *
 * ⚠️ `end` is resolved with `skeletonData.findSlot(end)`, which returns **null**
 * on a miss and assigns that null without complaint (`:626-627`). The clip then
 * never ends — it runs to the bottom of the draw order and takes every slot
 * below it with it. rigc refuses a name the rig does not declare.
 */
export interface RigClippingAttachment extends RigVertexGeometry {
  type: 'clipping';
  /**
   * The last slot this clip applies to, by name. Absent leaves `endSlot` null,
   * which is the parser's own encoding for "clip everything after this one".
   */
  end?: string;
  /** 4.3. Default false. */
  convex?: boolean;
  /** 4.3. Default false. */
  inverse?: boolean;
}

/**
 * `type: "path"` (`SkeletonJson.ts:606-623`) — a composite cubic Bezier the
 * skeleton carries as an attachment.
 *
 * **When you need one:** a path constraint has nowhere to aim without it. The
 * polygon here is not drawn (no runtime renders a path); it is the curve
 * `RigPathConstraint` slides bones along, and it deforms with the slot's bone
 * like any other vertex attachment.
 *
 * 🚨 **`vertexCount` is knots AND handles, and it must be a multiple of 3.**
 * The parser hands `vertexCount << 1` to `readVertices` and then walks the
 * result in groups of six (`PathConstraint.computeWorldPositions`): the first
 * and last points are the outer control handles of the end knots and are
 * dropped, leaving a `3K + 1` chain — so an OPEN path of K curves has
 * `vertexCount = 3(K + 1)` (minimum 6) and a CLOSED one has `3K` (minimum 3,
 * because the chain wraps). A count that is not a multiple of 3 does not throw:
 * `Utils.newArray(vertexCount / 3, 0)` accepts a fractional size, the groups of
 * six then straddle the knots, and the constraint slides bones along a curve
 * nobody drew.
 *
 * ⚠️ `lengths` is NOT authored here. It is the cumulative arc length at the end
 * of each curve in the SETUP pose, in world units — a measurement of the
 * geometry above, and the same relationship `image` has to `width`/`height`: a
 * restated number can disagree with the vertices, and when it does, a
 * `constantSpeed: false` path traverses a length that is not the length of the
 * curve, silently. So rigc measures it and refuses an authored one by name.
 */
export interface RigPathAttachment extends RigVertexGeometry {
  type: 'path';
  /** Default false. When true the last knot joins the first. */
  closed?: boolean;
  /**
   * Default **true** (`:610`) — note the direction: leaving it out asks for the
   * expensive-and-correct traversal, in which the runtime re-measures the path
   * every frame and `lengths` is never read. `false` makes the runtime trust the
   * emitted `lengths` instead: cheaper, exact only while the path holds its setup
   * shape, and the reason a deformed path wants the default.
   */
  constantSpeed?: boolean;
  /**
   * 🚫 Refused by name. rigc measures the arc lengths off `vertices`/`weights` —
   * see the note above. The field is declared so the refusal can name it.
   */
  lengths?: number[];
}

/**
 * The two types the format holds and rigc's emitter does not cover. They are
 * in the type so a spec can *say* them and get a named `NotImplementedError`;
 * the alternative is the parser's own behaviour, which is to return `null` for
 * an unknown `type` and drop the attachment without a word
 * (`SkeletonJson.ts:653`).
 *
 * 🚧 Neither appears anywhere in the benchmark corpus (SPEC_COVERAGE parts 3-1
 * and 4-2), so neither is on the ladder's critical path — which is the reason
 * they are deferred rather than an oversight.
 */
export interface RigUnimplementedAttachment {
  type: 'point' | 'linkedmesh';
  [field: string]: unknown;
}

export type RigAttachment =
  | RigRegionAttachment
  | RigMeshAttachment
  | RigBoundingBoxAttachment
  | RigClippingAttachment
  | RigPathAttachment
  | RigUnimplementedAttachment;

/** `slotName -> placeholderName -> attachment` (`SkeletonJson.ts:431-439`). */
export type RigSkinAttachments = Record<string, Record<string, RigAttachment>>;

/** The five per-type constraint lists a skin entry can carry (`:386-429`). */
export const RIG_SKIN_CONSTRAINT_KEYS = ['ik', 'transform', 'path', 'physics', 'slider'] as const;

export type RigSkinConstraintKey = (typeof RIG_SKIN_CONSTRAINT_KEYS)[number];

/**
 * Every key the long form of a skin entry owns.
 *
 * ⚠️ Which is exactly the set of names a SLOT may not have, because these are
 * the keys that tell the two forms apart — see `splitRigSkin`. `parseRigSpec`
 * refuses such a slot by name rather than letting one form be read as the other.
 */
export const RIG_SKIN_KEYS = ['attachments', 'bones', ...RIG_SKIN_CONSTRAINT_KEYS] as const;

/**
 * A skin's full 4.3 shape: attachments, plus the bones and constraints this skin
 * **activates** (`SkeletonJson.ts:377-429`).
 *
 * ⭐ The lists are not a second way to declare a bone or a constraint. They are
 * the other half of a switch whose first half already existed: a bone's
 * `skin: true` and a constraint's `skin: true` set `skinRequired`, and
 * `Skeleton.updateCache` starts every `skinRequired` object **inactive**, turning
 * it on only for the skin that names it here (`Skeleton.ts:191-217`; a listed
 * bone activates its whole ancestor chain). So either half alone is dead data,
 * in opposite directions and both in silence — `skin: true` with no list is a
 * bone that never poses, a list without `skin: true` is a list that changes
 * nothing — which is why rigc refuses both halves by name and
 * `A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED` checks the artifact for them.
 */
export interface RigSkinEntry {
  /** `slotName -> placeholderName -> attachment`. */
  attachments?: RigSkinAttachments;
  /** Bone names this skin activates. Each one must declare `skin: true`. */
  bones?: string[];
  /** `ik` constraint names this skin activates. Each must declare `skin: true`. */
  ik?: string[];
  transform?: string[];
  path?: string[];
  physics?: string[];
  slider?: string[];
}

/**
 * One skin, in either of two spellings.
 *
 * The short one — `slotName -> placeholderName -> attachment` — is the shape
 * every rig spec in this repository already uses and it stays exactly that. The
 * long one carries the 4.3 lists beside the attachments and is recognised by its
 * own keys (`RIG_SKIN_KEYS`); see `splitRigSkin` for the one ambiguity that
 * creates and how it is refused rather than guessed.
 */
export type RigSkin = RigSkinAttachments | RigSkinEntry;

/** The two halves of a skin entry, whichever spelling the spec used. */
export interface RigSkinParts {
  attachments: RigSkinAttachments;
  bones: string[];
  constraints: Record<RigSkinConstraintKey, string[]>;
  /** True when the spec used the long form. Only the messages care. */
  explicit: boolean;
}

/**
 * Normalise one skin entry.
 *
 * ⚠️ The two spellings are told apart by the keys in `RIG_SKIN_KEYS`: a skin
 * that uses any of them is the long form. That is the one thing here that could
 * ever be ambiguous, and it is ambiguous in exactly one case — a rig with a SLOT
 * of one of those names — so rigc does not guess: `parseRigSpec` refuses such a
 * slot by name, because the alternative is a member list read as a slot's
 * placeholder table or the other way round.
 *
 * In the long form EVERY key must be one of them. A key outside the set is
 * almost always a slot name left behind by a half-finished conversion from the
 * short form, so it is refused with that as the message rather than ignored — an
 * ignored slot is an attachment that vanishes.
 */
export function splitRigSkin(skin: RigSkin, where: string): RigSkinParts {
  const empty = (): Record<RigSkinConstraintKey, string[]> => ({
    ik: [],
    transform: [],
    path: [],
    physics: [],
    slider: [],
  });
  if (!isObj(skin)) throw new CompileError(`${where}: a skin must be an object`);
  const known = new Set<string>(RIG_SKIN_KEYS);
  const keys = Object.keys(skin);
  if (!keys.some((key) => known.has(key))) {
    return { attachments: skin as RigSkinAttachments, bones: [], constraints: empty(), explicit: false };
  }
  const entry = skin as RigSkinEntry;
  if (entry.attachments !== undefined && !isObj(entry.attachments)) {
    throw new CompileError(`${where}: "attachments" is \`slotName -> placeholderName -> attachment\`, not ${JSON.stringify(entry.attachments)}`);
  }
  for (const key of keys) {
    if (known.has(key)) continue;
    throw new CompileError(
      `${where}: uses the long form (it declares ${keys.filter((k) => known.has(k)).map((k) => `"${k}"`).join(', ')}) ` +
        `and also has a key "${key}". In that form every key is one of ${RIG_SKIN_KEYS.join(', ')} — so "${key}" reads ` +
        'as neither a member list nor a slot, and a slot left outside the block is an attachment that vanishes. ' +
        'Move it inside "attachments".',
    );
  }
  const nameList = (value: unknown, field: string): string[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new CompileError(`${where}: "${field}" must be an array of names, not ${JSON.stringify(value)}`);
    return value.map((name, i) => {
      if (typeof name !== 'string' || name.length === 0) {
        throw new CompileError(`${where}: ${field}[${i}] is ${JSON.stringify(name)}; a skin lists bones and constraints BY NAME`);
      }
      return name;
    });
  };
  const constraints = empty();
  for (const key of RIG_SKIN_CONSTRAINT_KEYS) constraints[key] = nameList(entry[key], key);
  return {
    attachments: entry.attachments ?? {},
    bones: nameList(entry.bones, 'bones'),
    constraints,
    explicit: true,
  };
}

// ---------------------------------------------------------------------------
// constraints — `root.constraints[]` (SkeletonJson.ts:144-369), the 4.3 shape
// ---------------------------------------------------------------------------

/**
 * 4.3 folds every constraint into ONE array with a `type` discriminator. The
 * 4.1/4.2 shape — top-level `ik`/`transform`/`path`/`physics` arrays — still
 * loads clean and the constraints simply vanish, which is `A01`.
 *
 * 🚨 An entry whose `type` matches no case is dropped with no error and no
 * `default:` branch (`:148-367`). rigc therefore refuses an unknown `type` by
 * name rather than passing it through.
 */
export interface RigConstraintCommon {
  name: string;
  /**
   * Default false → `skinRequired` (`:147`): the constraint does not run unless
   * the applied skin lists it under its own type (see `RigSkinEntry`). Half a
   * switch on its own, so rigc refuses the flag without a skin that activates it.
   */
  skin?: boolean;
}

/** `type: "ik"` (`:149-176`). `scaleY` is 4.3's replacement for 4.2's `uniform`. */
export interface RigIkConstraint extends RigConstraintCommon {
  type: 'ik';
  /** At least one, resolved by name; a miss throws in the parser. */
  bones: string[];
  target: string;
  /** `ConstraintData.ts:50`. Absent → `None`. */
  scaleY?: 'none' | 'uniform' | 'volume';
  /** Default 1. */
  mix?: number;
  /** Default 0. */
  softness?: number;
  /** Default true → `bendDirection = ±1`. */
  bendPositive?: boolean;
  /** Default false. */
  compress?: boolean;
  stretch?: boolean;
}

/**
 * One entry of a transform constraint's `properties` map: which source property
 * drives which target properties, and by how much (`:241`, `:521`).
 *
 * The `from` and `to` names are drawn from a fixed six — `rotate`, `x`, `y`,
 * `scaleX`, `scaleY`, `shearY` — and **anything else throws in the parser**.
 */
export interface RigTransformProperty {
  offset?: number;
  to: Record<string, { offset?: number; max?: number; scale?: number }>;
}

/** `type: "transform"` (`:177-268`) — rebuilt from scratch in 4.3. */
export interface RigTransformConstraint extends RigConstraintCommon {
  type: 'transform';
  bones: string[];
  /** 4.2 called this `target`. */
  source: string;
  localSource?: boolean;
  localTarget?: boolean;
  additive?: boolean;
  clamp?: boolean;
  /** `fromName -> { offset, to: { toName -> { offset, max, scale } } }`. */
  properties?: Record<string, RigTransformProperty>;
  /** The offsets array. Default 0 each. */
  rotation?: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  shearY?: number;
  /**
   * Default 1. ⚠️ Each mix is read **only if the matching `to` property was
   * declared** (`:259-264`), so a mix without its property is dead data.
   */
  mixRotate?: number;
  mixX?: number;
  /** Defaults to `mixX`. */
  mixY?: number;
  mixScaleX?: number;
  /** Defaults to `mixScaleX`. */
  mixScaleY?: number;
  mixShearY?: number;
}

/**
 * `type: "physics"` (`:301-339`), 4.2+.
 *
 * ⚠️ The five components all default to 0, so a constraint that names none of
 * them parses cleanly and does absolutely nothing — `A23`.
 */
export interface RigPhysicsConstraint extends RigConstraintCommon {
  type: 'physics';
  bone: string;
  /** The components. All zero = a constraint that parses and does nothing. */
  x?: number;
  y?: number;
  rotate?: number;
  scaleX?: number;
  shearX?: number;
  /** 4.3; absent → `ScaleYMode.None`. */
  scaleYMode?: 'none' | 'uniform' | 'volume';
  /** Default 5000. */
  limit?: number;
  /** Default 60 → `step = 1/fps`. */
  fps?: number;
  /** Defaults: 0.5 / 100 / 0.85 / 1 / 0 / 0 / 1. */
  inertia?: number;
  strength?: number;
  damping?: number;
  /** Stored as `massInverse = 1/mass`, so 0 becomes Infinity — `A23`. */
  mass?: number;
  wind?: number;
  gravity?: number;
  mix?: number;
  inertiaGlobal?: boolean;
  strengthGlobal?: boolean;
  dampingGlobal?: boolean;
  massGlobal?: boolean;
  windGlobal?: boolean;
  gravityGlobal?: boolean;
  mixGlobal?: boolean;
}

/**
 * The three enums a path constraint chooses its model with, spelled as the
 * runtime's own enum members (`PathConstraintData.ts:77-87`).
 *
 * 🚨 They are checked, and this is one of the places where checking matters most:
 * `Utils.enumValue` is `type[name[0].toUpperCase() + name.slice(1)]`, so a name
 * outside the set resolves to **`undefined`** and is assigned without complaint.
 * The constraint then behaves as some *other* mode — an unknown `spacingMode`
 * fails the `=== Length` test and spaces bones as though `Fixed` had been asked
 * for; an unknown `rotateMode` is neither `Tangent` nor `ChainScale`, so bones
 * follow the path and never turn along it. Both load, both animate, neither is
 * what was written. Only the first letter's case is free, because that is exactly
 * what `enumValue` normalises.
 */
export const RIG_PATH_POSITION_MODES = ['Fixed', 'Percent'] as const;
export const RIG_PATH_SPACING_MODES = ['Length', 'Fixed', 'Percent', 'Proportional'] as const;
export const RIG_PATH_ROTATE_MODES = ['Tangent', 'Chain', 'ChainScale'] as const;

/** The six property names a slider or a transform constraint may read (`:241`, `:521`). */
export const RIG_FROM_PROPERTIES = ['rotate', 'x', 'y', 'scaleX', 'scaleY', 'shearY'] as const;

/**
 * `type: "path"` (`:269-300`).
 *
 * **When you need one:** anything that travels — a cart along a track, a fish
 * along a current, a chain of links wrapping a pulley. The constraint takes a
 * `RigPathAttachment` off `slot` and slides `bones` along it, so one `position`
 * key moves the whole train and the shape of the motion lives in the curve
 * rather than in the keys.
 *
 * ⚠️ `slot` must be a slot that carries a path attachment. `PathConstraint.update`
 * begins `if (!(attachment instanceof PathAttachment)) return` — so a constraint
 * aimed at a slot showing a region does nothing at all, with no error anywhere.
 * rigc refuses a slot that has no path attachment in any skin.
 */
export interface RigPathConstraint extends RigConstraintCommon {
  type: 'path';
  /** At least one, in the order they ride the path. Resolved by name. */
  bones: string[];
  /** The slot whose path attachment the bones follow. Required by the parser. */
  slot: string;
  /** Default `"Percent"`: `position` 0..1 along the path rather than in world units. */
  positionMode?: (typeof RIG_PATH_POSITION_MODES)[number] | 'fixed' | 'percent';
  /** Default `"Length"`: spacing measured in each bone's own length. */
  spacingMode?: (typeof RIG_PATH_SPACING_MODES)[number] | 'length' | 'fixed' | 'percent' | 'proportional';
  /** Default `"Tangent"`: each bone turns to the path's tangent where it sits. */
  rotateMode?: (typeof RIG_PATH_ROTATE_MODES)[number] | 'tangent' | 'chain' | 'chainScale';
  /** Default 0 → `offsetRotation`, degrees added after the path's own rotation. */
  rotation?: number;
  /** Default 0. Where the first bone sits: 0..1 under `Percent`, world units under `Fixed`. */
  position?: number;
  /** Default 0. Gap between bones, in the unit `spacingMode` chooses. */
  spacing?: number;
  /** Default 1. */
  mixRotate?: number;
  mixX?: number;
  /** Defaults to `mixX` (`:283`). */
  mixY?: number;
}

/**
 * `type: "slider"` (`:340-366`) — 4.3's own constraint, and the only one that
 * applies an **animation** rather than a transform.
 *
 * **When you need one:** a pose that has to be driven by a value instead of by
 * time — a dial that opens a door, a blend shape on a face, a suspension that
 * compresses as the wheel rises. `animation` is applied at a time the slider
 * chooses, `mix` is its authority, and everything that animation keys is under
 * its control while it is on.
 *
 * The time comes from one of two models and `bone` is the switch (`:350`):
 *
 * - **property-driven** — with a `bone`, the slider reads one transform
 *   `property` off it and maps it to a time: `time = to + (value - from) * scale`.
 *   This is the dial.
 * - **time-driven** — with no `bone`, `time` is the slider's own setup value and
 *   an `animations.<a>.slider.<name>.time` timeline keys it.
 *
 * ⚠️ `animation` is resolved in a **second pass** over the constraints array,
 * after the animations are read (`:495-507`), and a miss **throws**
 * `Slider animation not found`. It names an animation in the MOTION spec — the
 * one place a rig spec points across the file boundary, and the mirror of
 * `events`, where the rig declares a name the motion spec fires.
 */
export interface RigSliderConstraint extends RigConstraintCommon {
  type: 'slider';
  /** An animation the motion spec declares. Required: a miss throws in the parser. */
  animation: string;
  /** Default 1. The slider's authority over what its animation keys. */
  mix?: number;
  /** Default false. Add the animation to the current pose instead of overwriting it. */
  additive?: boolean;
  /**
   * Default false. Repeat past the animation's duration instead of holding the
   * last frame. ⚠️ With a `bone`, `loop` divides by the animation's duration
   * (`Slider.ts:63-64`), so looping a zero-length animation yields a NaN time.
   */
  loop?: boolean;
  /** The driving bone. Its presence switches the whole model — see above. */
  bone?: string;
  /** Which of the six transform properties to read. Required when `bone` is set. */
  property?: (typeof RIG_FROM_PROPERTIES)[number];
  /** Default 0. The property value that maps to time `to`. */
  from?: number;
  /** Default 0. The time `from` maps to. */
  to?: number;
  /** Default 1. Seconds of animation per unit of the property. */
  scale?: number;
  /** Default 0. Nonessential: the editor's top of the slider's range. */
  max?: number;
  /** Default false. Read the bone's local transform instead of its world one. */
  local?: boolean;
  /** The setup time, for the time-driven model. Read only when `bone` is absent. */
  time?: number;
}

export type RigConstraint =
  | RigIkConstraint
  | RigTransformConstraint
  | RigPathConstraint
  | RigPhysicsConstraint
  | RigSliderConstraint;

// ---------------------------------------------------------------------------
// events — `root.events` (SkeletonJson.ts:469-484), an OBJECT, not an array
// ---------------------------------------------------------------------------

/**
 * One event **definition**: a name the skeleton owns, plus the payload a firing
 * carries when the animation does not override it.
 *
 * ⭐ The declaration lives in the rig spec and the firings live in the motion
 * spec, for the same reason slots live here and their colour keys live there:
 * the name is structure — the runtime looks it up, the game listens for it —
 * and *when* it fires is time. `skeletonData.findEvent` resolves an animation's
 * key against this table and **throws** on a miss (`:1244`), so an animation
 * that names an event nobody declared does not load at all. rigc refuses it at
 * compile instead, where the message can name the file that has to change.
 *
 * ⚠️ `volume` and `balance` are read **only when `audio` is set** (`:478-481`).
 * Declared without one they are dropped in silence, so rigc refuses that pairing
 * rather than emitting two numbers the runtime will never look at.
 */
export interface RigEvent {
  /** Default 0. The `int` payload every firing inherits unless it overrides it. */
  int?: number;
  /** Default 0. */
  float?: number;
  /** Default `""`. */
  string?: string;
  /**
   * Audio path the editor recorded for this event. Nonessential to playback —
   * no runtime here loads it — but it is what makes `volume`/`balance` legible.
   */
  audio?: string;
  /** Only read when `audio` is set. */
  volume?: number;
  balance?: number;
}

// ---------------------------------------------------------------------------
// invariants — what skeleton JSON cannot say about itself
// ---------------------------------------------------------------------------

/**
 * Structural facts the emitted artifact does not record, handed to the validator
 * so its archetype assertions have something to check instead of a guess.
 *
 * These are the fields that used to be properties of a hard-coded formation.
 * They are optional, and an assertion whose field is absent reports **SKIP** —
 * never a pass, because an assertion with nothing to look at has not looked.
 */
export interface RigInvariants {
  /**
   * How many slots of this rig may carry a mesh. A budget, not a Spine rule:
   * every mesh is a canvas that re-rasterises whenever a bone driving it moves.
   */
  meshSlots?: number;
  /**
   * How many triangles one of those meshes may carry. Also a budget, and also
   * not a Spine rule — the editor's own example projects ship meshes several
   * times this size and they are perfectly valid.
   *
   * ⚠️ Declare it or `A13_MESH_BUDGET` has nothing to measure against and SKIPs.
   * A number baked into the validator would be one project's frame time
   * masquerading as a property of the format, and would fail every foreign
   * skeleton that is merely denser than that project can afford.
   */
  meshTriangles?: number;
  /**
   * The bone whose setup rotation carries the cut's insertion axis. Its subtree
   * is authored in **axis space** — translateX only — which is what lets one set
   * of keys move to a cut at another camera angle (`A24`).
   */
  axisBone?: string;
  /**
   * The bone carrying the inserting mass. Its own inward keys spend the same
   * clearance the stroke does, so `A29`/`A30` add them together.
   */
  massBone?: string;
  /** Parentage that must never happen, with the reason it is tempting (`A25`). */
  detached?: Array<{ bone: string; notUnder: string; why?: string }>;
}

// ---------------------------------------------------------------------------
// the file
// ---------------------------------------------------------------------------

export interface RigSpec {
  spec: 'rigc-rig/1';
  /**
   * The rig's own name. A motion spec's `archetype` field must equal it: the
   * spec was authored against one formation, and pairing it with a different rig
   * silently produces keys aimed at bones that mean something else.
   */
  name: string;
  note?: string;
  skeleton?: RigSkeletonHeader;
  /**
   * Base directory for every `image` in this file, relative to the rig file
   * itself. The CLI's `--images <dir>` overrides it (and is then relative to the
   * working directory), which is how a foreign corpus is compiled without
   * editing its rig spec.
   */
  images?: string;
  bones: RigBone[];
  slots: RigSlot[];
  /**
   * At least `default`, which becomes `skeletonData.defaultSkin` (`:441`).
   *
   * Each entry is either the short form — `slotName -> placeholderName ->
   * attachment` — or the long one, `{ "attachments": {…}, "bones": [...],
   * "ik": [...] }`, which also says which bones and constraints the skin
   * activates. `splitRigSkin` normalises the two.
   */
  skins?: Record<string, RigSkin>;
  constraints?: RigConstraint[];
  /**
   * `eventName -> payload defaults`. Emitted as `root.events`, which is an
   * OBJECT keyed by name and not an array. The motion spec's per-animation
   * `events` timeline fires them; a firing whose name is not a key here is a
   * compile error, because the parser throws on it at load.
   */
  events?: Record<string, RigEvent>;
  invariants?: RigInvariants;
}

// ---------------------------------------------------------------------------
// reading
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse and check the envelope, then hand back a typed spec.
 *
 * What is checked here is what makes the REST of the compiler able to assume its
 * inputs: the version tag, the two required arrays, name uniqueness, and that
 * every parent and every slot bone resolves against a bone declared earlier.
 * Deeper checks (does an attachment's image exist, does a constraint's target
 * bone exist) belong where the data is used, so their message can name the
 * consumer.
 */
export function parseRigSpec(raw: unknown, where: string): RigSpec {
  if (!isObj(raw)) throw new CompileError(`${where}: a rig spec must be a JSON object`);
  if (raw.spec !== RIG_SPEC_VERSION) {
    throw new CompileError(`${where}: unknown rig spec version ${JSON.stringify(raw.spec)}, expected "${RIG_SPEC_VERSION}"`);
  }
  if (typeof raw.name !== 'string' || raw.name.length === 0) {
    throw new CompileError(`${where}: a rig spec needs a "name" — a motion spec names it to pick this rig`);
  }
  if (!Array.isArray(raw.bones) || raw.bones.length === 0) {
    throw new CompileError(`${where}: a rig spec needs a non-empty "bones" array`);
  }
  if (!Array.isArray(raw.slots)) {
    throw new CompileError(`${where}: a rig spec needs a "slots" array (it may be empty; its ORDER is the draw order)`);
  }
  const spec = raw as unknown as RigSpec;

  const seen = new Set<string>();
  for (const bone of spec.bones) {
    if (!isObj(bone) || typeof bone.name !== 'string' || bone.name.length === 0) {
      throw new CompileError(`${where}: every bone needs a "name"`);
    }
    if (seen.has(bone.name)) {
      throw new CompileError(`${where}: two bones are called "${bone.name}"; bone names are the join key for slots, meshes and timelines`);
    }
    seen.add(bone.name);
    if (bone.parent === undefined) continue;
    if (typeof bone.parent !== 'string' || !seen.has(bone.parent)) {
      // The parser resolves `parent` against the bones it has already read, so a
      // forward reference is not a rigc restriction — it is a bone with no parent
      // in the loaded skeleton, which loads as a second root.
      throw new CompileError(
        `${where}: bone "${bone.name}" names parent ${JSON.stringify(bone.parent)}, which is not declared before it`,
      );
    }
    if (bone.inherit !== undefined && !RIG_BONE_INHERIT.some((v) => v.toLowerCase() === String(bone.inherit).toLowerCase())) {
      throw new CompileError(
        `${where}: bone "${bone.name}" has inherit ${JSON.stringify(bone.inherit)}; known: ${RIG_BONE_INHERIT.join(', ')}`,
      );
    }
    const from = bone.from;
    if (from !== undefined) {
      const sources = ['anchor', 'slotWindow', 'meshCenter'].filter((k) => from[k as keyof RigBoneFrom] !== undefined);
      if (sources.length > 1) {
        throw new CompileError(
          `${where}: bone "${bone.name}" takes its position from more than one source (${sources.join(', ')}); name exactly one`,
        );
      }
      if ((bone.x !== undefined || bone.y !== undefined) && sources.length === 1) {
        throw new CompileError(
          `${where}: bone "${bone.name}" declares both a literal x/y and from.${sources[0]}; the two would disagree the first time the art moved`,
        );
      }
      if (from.rotation !== undefined && bone.rotation !== undefined) {
        throw new CompileError(`${where}: bone "${bone.name}" declares both a literal rotation and from.rotation`);
      }
      if (from.rotation === 'anchor' && from.anchor === undefined) {
        throw new CompileError(`${where}: bone "${bone.name}" wants its rotation from an anchor but names no from.anchor`);
      }
    }
  }

  const slotNames = new Set<string>();
  for (const slot of spec.slots) {
    if (!isObj(slot) || typeof slot.name !== 'string' || slot.name.length === 0) {
      throw new CompileError(`${where}: every slot needs a "name"`);
    }
    if (slotNames.has(slot.name)) throw new CompileError(`${where}: two slots are called "${slot.name}"`);
    slotNames.add(slot.name);
    if (typeof slot.bone !== 'string' || !seen.has(slot.bone)) {
      throw new CompileError(
        `${where}: slot "${slot.name}" names bone ${JSON.stringify(slot.bone)}, which this rig does not declare`,
      );
    }
    if (slot.blend !== undefined && !RIG_SLOT_BLEND.some((v) => v.toLowerCase() === String(slot.blend).toLowerCase())) {
      throw new CompileError(`${where}: slot "${slot.name}" has blend ${JSON.stringify(slot.blend)}; known: ${RIG_SLOT_BLEND.join(', ')}`);
    }
  }

  const constraintNames = new Set<string>();
  /** name -> [type, skinRequired], for the skin lists below. */
  const constraintFacts = new Map<string, [string, boolean]>();
  for (const constraint of spec.constraints ?? []) {
    if (!isObj(constraint) || typeof constraint.name !== 'string' || constraint.name.length === 0) {
      throw new CompileError(`${where}: every constraint needs a "name"`);
    }
    if (constraintNames.has(constraint.name)) throw new CompileError(`${where}: two constraints are called "${constraint.name}"`);
    constraintNames.add(constraint.name);
    constraintFacts.set(constraint.name, [String(constraint.type), constraint.skin === true]);
  }

  // --- skins: the attachment table, and what the skin ACTIVATES --------------
  //
  // The lists resolve by name like everything else in this format, and the
  // parser is loud about a miss (`Couldn't find bone X for skin Y`) — but in the
  // consumer's process, so they are refused here where the message can name the
  // rig spec. What the parser does NOT check is the pairing with `skin: true`,
  // and that half is silent in both directions (see `RigSkinEntry`).
  const skinBoneUse = new Map<string, string>();
  const skinConstraintUse = new Map<string, string>();
  if (spec.skins !== undefined) {
    if (!isObj(spec.skins)) throw new CompileError(`${where}: "skins" is an object keyed by skin name`);
    const collision = RIG_SKIN_KEYS.find((key) => slotNames.has(key));
    if (collision !== undefined) {
      // The long form is recognised by these keys, so a slot of one of those
      // names is genuinely ambiguous in the short form. Guessing either way
      // loses an attachment table or a member list in silence.
      throw new CompileError(
        `${where}: a slot is called "${collision}", which is one of the keys that tell a skin's long form ` +
          '(`{ "attachments": {…}, "bones": [...] }`) from its short one (`slotName -> placeholder -> attachment`): ' +
          `${RIG_SKIN_KEYS.join(', ')}. Rename the slot.`,
      );
    }
    for (const [skinName, skin] of Object.entries(spec.skins)) {
      const at = `${where}: skin "${skinName}"`;
      const parts = splitRigSkin(skin, at);
      for (const bone of parts.bones) {
        if (!seen.has(bone)) {
          throw new CompileError(`${at} activates bone "${bone}", which this rig does not declare`);
        }
        const previous = skinBoneUse.get(bone);
        if (previous !== undefined && previous !== skinName) {
          // Not a parser rule — a rig-spec one. `updateCache` activates the union
          // of the current skin's bones, so a bone in two skins is a bone whose
          // "which skin am I for" question has no answer, and the second list is
          // usually a copy-paste that was meant to be a different bone.
          throw new CompileError(
            `${at} activates bone "${bone}", which skin "${previous}" already activates; a bone belongs to one skin`,
          );
        }
        skinBoneUse.set(bone, skinName);
        const declared = spec.bones.find((b) => b.name === bone);
        if (declared?.skin !== true) {
          throw new CompileError(
            `${at} activates bone "${bone}", but that bone does not declare \`"skin": true\`. ` +
              'Skeleton.updateCache starts a bone active unless it is skinRequired, so this list changes nothing — ' +
              'the bone poses under every skin.',
          );
        }
      }
      for (const type of RIG_SKIN_CONSTRAINT_KEYS) {
        for (const name of parts.constraints[type]) {
          const facts = constraintFacts.get(name);
          if (facts === undefined) {
            throw new CompileError(`${at} activates ${type} constraint "${name}", which this rig does not declare`);
          }
          if (facts[0] !== type) {
            // `findConstraint(name, IkConstraintData)` resolves by name AND type,
            // and the parser throws on the miss.
            throw new CompileError(
              `${at} lists "${name}" under "${type}", but the rig declares it as a "${facts[0]}" constraint — ` +
                'a skin looks its constraints up by name AND type, so this one is a miss and the loader throws',
            );
          }
          const previous = skinConstraintUse.get(name);
          if (previous !== undefined && previous !== skinName) {
            throw new CompileError(
              `${at} activates constraint "${name}", which skin "${previous}" already activates; a constraint belongs to one skin`,
            );
          }
          skinConstraintUse.set(name, skinName);
          if (!facts[1]) {
            throw new CompileError(
              `${at} activates ${type} constraint "${name}", but that constraint does not declare \`"skin": true\`. ` +
                'A constraint is active unless it is skinRequired, so this list changes nothing.',
            );
          }
        }
      }
    }
  }
  // The other direction, and the silent one that costs a pose: an object that
  // declared `skin: true` and appears in no list is switched off under every skin
  // there is. Outside the block above on purpose — a rig with no `skins` at all
  // is the strongest case of it. A listed bone activates its ancestors too
  // (`Skeleton.ts:198-205`), so a parent reachable only that way is not dead.
  const activated = new Set(skinBoneUse.keys());
  const parentOf = new Map(spec.bones.map((b) => [b.name, b.parent]));
  for (const bone of [...activated]) {
    for (let cursor = parentOf.get(bone); cursor; cursor = parentOf.get(cursor)) activated.add(cursor);
  }
  for (const bone of spec.bones) {
    if (bone.skin === true && !activated.has(bone.name)) {
      throw new CompileError(
        `${where}: bone "${bone.name}" declares \`"skin": true\` but no skin activates it, so it is never active — ` +
          'list it in the skin it belongs to, or drop the flag',
      );
    }
  }
  for (const [name, [type, skinRequired]] of constraintFacts) {
    if (skinRequired && !skinConstraintUse.has(name)) {
      throw new CompileError(
        `${where}: ${type} constraint "${name}" declares \`"skin": true\` but no skin activates it, so it never runs — ` +
          `list it in that skin's "${type}" array, or drop the flag`,
      );
    }
  }

  if (raw.events !== undefined) {
    if (!isObj(raw.events)) {
      throw new CompileError(
        `${where}: "events" is an object keyed by event name (\`{ "footstep": {} }\`), not an array — the format's own shape`,
      );
    }
    for (const [name, def] of Object.entries(raw.events)) {
      if (name.length === 0) throw new CompileError(`${where}: an event has an empty name`);
      if (!isObj(def)) {
        throw new CompileError(`${where}: event "${name}" must be an object of payload defaults (use {} for none)`);
      }
      for (const field of ['int', 'float', 'volume', 'balance'] as const) {
        const v = def[field];
        if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) {
          throw new CompileError(`${where}: event "${name}" has ${field} ${JSON.stringify(v)}, which is not a finite number`);
        }
      }
      if (def.int !== undefined && !Number.isInteger(def.int)) {
        throw new CompileError(`${where}: event "${name}" has int ${JSON.stringify(def.int)}; the payload is an integer`);
      }
      for (const field of ['string', 'audio'] as const) {
        if (def[field] !== undefined && typeof def[field] !== 'string') {
          throw new CompileError(`${where}: event "${name}" has ${field} ${JSON.stringify(def[field])}, which is not a string`);
        }
      }
      // SkeletonJson.ts:478-481 reads these two ONLY inside `if (data.audioPath)`.
      // Without an audio path they are dropped with no error, so a spec that
      // wrote them down would carry a number no runtime ever reads.
      for (const field of ['volume', 'balance'] as const) {
        if (def[field] !== undefined && def.audio === undefined) {
          throw new CompileError(
            `${where}: event "${name}" declares ${field} but no "audio"; the parser reads ${field} only when an audio path is set, so it would be dropped in silence`,
          );
        }
      }
    }
  }

  return spec;
}
