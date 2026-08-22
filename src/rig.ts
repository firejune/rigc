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
  /** Default false → `BoneData.skinRequired`. */
  skin?: boolean;
  /** `rrggbbaa`. Editor affordance; no rendering effect. */
  color?: string;
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
export interface RigMeshAttachment {
  type: 'mesh';
  path?: string;
  image?: string;
  /** Its length defines `worldVerticesLength`; required with authored geometry. */
  uvs?: number[];
  triangles?: number[];
  vertices?: number[];
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
 * The four types the format holds and rigc's emitter does not cover yet. They
 * are in the type so a spec can *say* them and get a named
 * `NotImplementedError`; the alternative is the parser's own behaviour, which is
 * to return `null` for an unknown `type` and drop the attachment without a word
 * (`SkeletonJson.ts:653`).
 */
export interface RigUnimplementedAttachment {
  type: 'boundingbox' | 'point' | 'clipping' | 'path' | 'linkedmesh';
  [field: string]: unknown;
}

export type RigAttachment = RigRegionAttachment | RigMeshAttachment | RigUnimplementedAttachment;

/** `slotName -> placeholderName -> attachment` (`SkeletonJson.ts:431-439`). */
export type RigSkin = Record<string, Record<string, RigAttachment>>;

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
  /** Default false → `skinRequired` (`:147`). */
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
 * 🚧 `path` (`:269-300`) and `slider` (`:340-366`) are in the type so a spec can
 * say them and be refused by name. Neither appears anywhere in the benchmark
 * corpus (SPEC_COVERAGE part 4-2), so neither is on the ladder's critical path.
 */
export interface RigUnimplementedConstraint extends RigConstraintCommon {
  type: 'path' | 'slider';
  [field: string]: unknown;
}

export type RigConstraint =
  | RigIkConstraint
  | RigTransformConstraint
  | RigPhysicsConstraint
  | RigUnimplementedConstraint;

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
  /** At least `default`, which becomes `skeletonData.defaultSkin` (`:441`). */
  skins?: Record<string, RigSkin>;
  constraints?: RigConstraint[];
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
  for (const constraint of spec.constraints ?? []) {
    if (!isObj(constraint) || typeof constraint.name !== 'string' || constraint.name.length === 0) {
      throw new CompileError(`${where}: every constraint needs a "name"`);
    }
    if (constraintNames.has(constraint.name)) throw new CompileError(`${where}: two constraints are called "${constraint.name}"`);
    constraintNames.add(constraint.name);
  }

  return spec;
}
