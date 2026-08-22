/**
 * Input and output shapes for rigc.
 *
 * Three inputs, one domain each:
 *   - the cut manifest, which owns measured geometry: crop, part offsets, part sizes, mask
 *     polygons, the state machine, anchors, the axis and the measured ceilings.
 *     Optional — a foreign skeleton has none;
 *   - the **rig spec** ([`src/rig.ts`](rig.ts), `spec: "rigc-rig/1"`), which owns
 *     skeleton structure: bones, slots, skins, constraints, invariants. Required.
 *     It replaced the three hard-coded archetype tables that used to be code;
 *   - the motion spec, which owns time: keys, named
 *     easings, groups, declared durations.
 *
 * Nothing else is an input, and the compiler never invents a value that is in
 * none of them.
 */

// ---------------------------------------------------------------------------
// Cut manifest (face class)
// ---------------------------------------------------------------------------

/**
 * Mesh declaration for a part — geometry, so it belongs to the manifest and not
 * to the motion spec. It says WHERE the deformable ring
 * is; the motion spec says WHEN it moves, by keying the control bone.
 */
export interface FaceManifestMesh {
  /**
   * Which generator builds this mesh. Absent means `ring`, so every manifest
   * written before the joint archetype keeps its meaning.
   *
   *   ring   — three concentric rings + a hub. The outer two are pinned (region
   *            border, then mask contour) and only the aperture ring moves.
   *   ribbon — a two-wide strip along a bone chain. Length changes, width does
   *            not, because paired vertices carry identical weights.
   */
  kind?: 'ring' | 'ribbon';
  /** Ring only. The part's own mask polygon, which is the seam. */
  hull?: 'polygon';
  /** Ring only. Aperture centre in CROP pixels (y down) — measured, not guessed. */
  center?: [number, number];
  /** Ring only. Inner ring position between centre (0) and hull (1). */
  inner?: number;
  /**
   * Ring only, legacy form: ONE control bone which the compiler CREATES as a
   * child of the slot bone. Used by archetypes that have no explicit bone tree.
   */
  control_bone?: string;
  /**
   * Control bones that already exist in the archetype's bone tree — the ring's
   * authority is split between them by angular position, so a four-grip ring
   * can expand asymmetrically without a key per vertex.
   */
  control_bones?: string[];
  /** Ribbon only. Number of cross rows; triangles = 2 * (rows - 1). */
  rows?: number;
  /** Ribbon only. The bone chain the strip rides, root first. */
  chain?: string[];
  /**
   * Directional weighting. Without it the ring deforms symmetrically about the
   * centre, which moves the upper lip and the upper teeth along with the jaw —
   * anatomically wrong, and the owner spotted it on the first review.
   *
   * `axis_deg` is the mouth line measured on the art (screen degrees, y down).
   * `ramp` is the signed distance across that axis, in part pixels, over which
   * control authority goes 0 -> 1; positive is the jaw side.
   */
  bias?: { axis_deg: number; ramp: [number, number]; note?: string };
}

export interface FaceManifestPart {
  slot: string;
  /**
   * The archetype slot this part joins on, when it differs from `slot`.
   *
   * ⚠️ A cut manifest is often ALSO the record of the pipeline that generated
   * the art, and that pipeline names parts after what they depict while a rig
   * names them after the role they play. The rig's slot table has to stay
   * single-valued — the runtime, the tooling and A26 all join on the emitted slot
   * name, and a second alias for one slot is how a slot vanishes with no error.
   * So the manifest carries the mapping and `slot` keeps meaning what its author
   * meant. Absent = the two are the same name.
   */
  rig_slot?: string;
  draw_order: number;
  /**
   * Base plate only: the unmodified crop. Explicit `null` (with no `states`)
   * means the manifest is recording a part this cut does NOT carry, and the
   * compiler skips it and reports the absence.
   */
  image?: string | null;
  /** Top-left of the part window in crop pixels, y down. */
  offset: [number, number];
  /** Part window size in pixels. Absent on the base plate (= the crop size). */
  size?: [number, number];
  /** Which key of `state_machine` drives this slot. */
  state_key?: string;
  /** state name -> PNG path relative to the manifest, or null for "base pixels". */
  states?: Record<string, string | null>;
  /** Mask polygon in CROP pixels (y down). Required when `mesh` is present. */
  polygon?: Array<[number, number]>;
  /** Promote this part's attachments from regions to ring meshes. */
  mesh?: FaceManifestMesh;
}

export interface FaceManifest {
  schema: string;
  crop: { x: number; y: number; w: number; h: number; resample: string };
  base: string;
  /** Overlay archetypes only; the joint archetype has no per-slot state list. */
  state_machine?: Record<string, string[]>;
  parts: FaceManifestPart[];

  // -- articulated-cut fields ------------------------------------------------
  /**
   * Entry point in crop pixels, y down — the origin of the cut's axis frame.
   */
  insertion?: [number, number];
  /**
   * ⭐ The one value a new cut of this archetype changes.
   * `deg` is SCREEN degrees, y down, the same convention as `mesh.bias.axis_deg`;
   * the compiler negates it into Spine's y-up CCW rotation. `unit` is the same
   * direction as a vector and is cross-checked against `deg`, because a manifest
   * that disagrees with itself is the cheapest bug to catch and the worst to
   * debug later.
   */
  axis?: { deg: number; unit: [number, number] };
  /**
   * One-way stroke amplitude in axis pixels, the extension the plate covers, and
   * the DERIVED ceiling on inward travel.
   *
   * 🎯 `contact_depth` is the owner's rule of 2026-08-22 made mechanical: the
   * swallow goes at most until the inserting mass touches the occluder. It is a
   * MEASURED fact about two plates (rigc/tools/contact.ts), so it belongs in the
   * manifest for exactly the reason `mesh.center` does — the compiler never
   * re-measures art. Assertion A29 holds every animation to it.
   */
  stroke?: {
    amplitude?: number;
    extension?: number;
    contact_depth?: number | null;
    /**
     * 🎯 The second, independent ceiling on inward travel: the deepest insert at
     * which the moving part's cap contour is still entirely inside the occluder's
     * opaque footprint. Past it the cap is DRAWN where it should be swallowed.
     *
     * It is not a restatement of `contact_depth`. Contact asks when two masses
     * collide; containment asks when the drawn flesh runs out of patch to hide
     * behind — and a cut can have one without the other. The real tier-2 cut has
     * exactly that shape: no contact ceiling at all, and a containment ceiling of
     * 118px. Measured, like every other art fact in this file. Assertion A30.
     */
    cap_containment_ceiling?: number | null;
  };
  /** ROI box, recorded for provenance; the compiler does not read it. */
  roi?: { x: number; y: number; w: number; h: number };
  /**
   * Bone positions in crop pixels, y down: `[x, y]`, or `[x, y, facing_deg]`
   * where the third element is a SCREEN-space facing angle that becomes the
   * bone's setup rotation. A grip whose local +X points radially outward turns
   * "expand the ring" into one shared translate key, which is the same trick the
   * `axis` bone plays for the stroke.
   */
  anchors?: Record<string, number[]>;
}

// ---------------------------------------------------------------------------
// Motion spec  (spec: "rigc-motion/1")
// ---------------------------------------------------------------------------

/** Graph-view style normalised handles [hx1, hy1, hx2, hy2]. */
export type EasingHandles = [number, number, number, number];

export interface MotionKey {
  /** Time in seconds. */
  t: number;
  /**
   * Value. Meaning depends on the track property:
   *   rgba       -> [r, g, b, a] in 0..1
   *   attachment -> attachment name, or null for "show nothing"
   *   translate  -> [x, y] in pixels, relative to the bone's setup position
   *   scale      -> [x, y] as multipliers (1 = setup)
   *   rotate     -> [degrees]
   *   mix        -> [0..1] physics authority
   *   reset      -> null; the key is the event
   */
  v: number[] | string | null;
  /** Named easing from `easings`, or "stepped". Absent = linear. */
  ease?: string;
  /**
   * Escape hatch: this key's bezier written out, as ABSOLUTE (time, value)
   * control points — four numbers per value channel, in field order, which is
   * exactly what the emitted JSON holds.
   *
   * ⭐ `ease` stays the recommended path and a key may carry one or the other,
   * never both. A named easing says "this shape, wherever it is used", which is
   * what makes a motion spec readable as intent; this says "these numbers", which
   * is what a transcription of an editor export needs, because an export has a
   * different shape per key per channel.
   *
   * ⚠️ Not the normalised graph-view handles `easings` takes. Those go through
   * `bezierForChannel`; writing them here loads clean and plays a different
   * curve.
   */
  curve?: number[] | 'stepped';
}

/**
 * Bone timelines the compiler emits. Channel counts live in the validator.
 *
 * The single-axis forms are not sugar for the paired ones: Spine keys them as
 * separate timelines, and an export that used `translatex` alone is not
 * reproduced by a `translate` whose y channel happens to be flat — the key
 * counts differ, and so does what a runtime blends against.
 */
export type BoneProperty =
  | 'translate'
  | 'translatex'
  | 'translatey'
  | 'scale'
  | 'scalex'
  | 'scaley'
  | 'shear'
  | 'shearx'
  | 'sheary'
  | 'rotate';

/** Physics timelines the compiler emits. `reset` carries no value at all. */
export type PhysicsProperty = 'mix' | 'reset';

/**
 * One physics constraint.
 *
 * Structure, so it could argue for the manifest — but every field here is a
 * tuning number for motion over time, so the starting-parameter table goes into
 * the motion spec. It lives with the keys it competes against.
 *
 * ⚠️ The component fields (`x`/`y`/`rotate`/`scaleX`/`shearX`) all default to 0,
 * which means a constraint that names none of them parses cleanly and does
 * absolutely nothing. That is assertion A23.
 */
export interface MotionPhysics {
  bone: string;
  x?: number;
  y?: number;
  rotate?: number;
  scaleX?: number;
  shearX?: number;
  inertia?: number;
  strength?: number;
  damping?: number;
  mass?: number;
  wind?: number;
  gravity?: number;
  mix?: number;
  fps?: number;
  limit?: number;
  note?: string;
}

export interface MotionTrack {
  /** Target one slot... */
  slot?: string;
  /** ...or a named group of slots. */
  group?: string;
  /** ...or one bone, for the mesh tier: the control bone carries every key. */
  bone?: string;
  /** ...or one physics constraint, by name. */
  physics?: string;
  property: 'rgba' | 'attachment' | BoneProperty | PhysicsProperty;
  /** Seconds added to every key time of this track. */
  lag?: number;
  /** Extra per-member delay inside a group, in member order. */
  stagger?: number;
  keys: MotionKey[];
}

/**
 * One slot moved, at one draw-order key: `offset` positions later in the array.
 *
 * ⚠️ The offset is counted against the SETUP order, not against wherever the
 * slot ended up at the previous key — `readDrawOrder` rebuilds the whole
 * permutation from the setup array every time (SkeletonJson.ts:1336-1374). A key
 * is a complete statement of the change, not an edit to the one before it.
 */
export interface MotionDrawOrderOffset {
  slot: string;
  /** How many places later this slot is drawn. Negative moves it earlier. */
  offset: number;
}

/**
 * One key of the whole-animation draw-order timeline.
 *
 * A key with **no** `offsets` restores the setup draw order — that is the
 * parser's own encoding (`readDrawOrder` returns null, and the timeline sets the
 * setup array), and it is how an animation that has swapped two slots puts them
 * back.
 */
export interface MotionDrawOrderKey {
  /** Time in seconds. */
  t: number;
  offsets?: MotionDrawOrderOffset[];
}

export interface MotionAnimation {
  /** Declared, then verified against the compiled result (rule 4). */
  duration: number;
  /** Player hint only; not expressible in skeleton JSON. */
  loop: boolean;
  note?: string;
  tracks: MotionTrack[];
  /**
   * The draw-order timeline. **One per animation, and it names no target** —
   * which is why it is not a `track`: 4.3 writes it as `animations.<a>.drawOrder`
   * beside `bones` and `slots`, not inside either (SPEC_COVERAGE part 1-8).
   *
   * Draw order is the one thing about a slot that the slots array already
   * states (rule R4), so this timeline is the only way to say it changes over
   * time. First needed at ladder rung 5.
   */
  drawOrder?: MotionDrawOrderKey[];
}

/**
 * Setup pose per slot. Declared, never inferred — rule 5. It decides which of
 * the two overlay mechanisms a slot uses:
 *   - an attachment + alpha 0  => the lid tier, driven by rgba timelines;
 *   - attachment null          => the swap tier, driven by attachment timelines
 *                                 (null = the untouched base pixels show).
 */
export interface MotionSetupSlot {
  attachment?: string | null;
  /** [r, g, b, a] in 0..1. Omit for opaque white. */
  color?: [number, number, number, number];
}

export interface MotionSpec {
  spec: 'rigc-motion/1';
  /**
   * The rig this spec was authored against — it must equal the rig spec's
   * `name`, and a mismatch is a compile error rather than a silent pairing.
   *
   * It named a hard-coded table until 2026-08-22; now it names a file's own
   * name, and the file's path comes from the cuts table. The check is kept
   * because the keys in here are aimed at bones by NAME: pair the spec with
   * another rig whose names happen to overlap and every one of them lands on
   * something that means something else.
   */
  archetype: string;
  cut: string;
  note?: string;
  easings: Record<string, EasingHandles>;
  groups?: Record<string, string[]>;
  setup?: Record<string, MotionSetupSlot>;
  /** Physics constraints by name. Emitted into the 4.3 `constraints` array. */
  physics?: Record<string, MotionPhysics>;
  animations: Record<string, MotionAnimation>;
  /** Player-side AnimationStateData config; not emitted into skeleton JSON. */
  mix?: { default: number; pairs?: Array<[string, string, number]> };
}

// ---------------------------------------------------------------------------
// Emitted Spine 4.3 skeleton JSON
// ---------------------------------------------------------------------------

/**
 * Field order here is the order the emitter writes them, and it is rigc's, not
 * the editor's: Spine writes `length, rotation, x, y` and rigc writes
 * `length, x, y, rotation`. Both load identically — key order carries no meaning
 * in JSON — and rigc's order is the one every artifact on disk already has, so
 * changing it would be a byte-level diff that says nothing.
 *
 * A field is present exactly when the rig spec declared it; see `src/rig.ts`.
 */
export interface SpineBone {
  name: string;
  parent?: string;
  length?: number;
  x?: number;
  y?: number;
  /** Spine degrees, CCW in a y-up world. */
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  shearX?: number;
  shearY?: number;
  /** 4.2+ name. 4.0/4.1's `transform` still loads and is silently ignored — A02. */
  inherit?: string;
  skin?: boolean;
  color?: string;
}

export interface SpineSlot {
  name: string;
  bone: string;
  attachment?: string;
  color?: string;
  dark?: string;
  blend?: string;
}

export interface SpineRegionAttachment {
  path?: string;
  /** Required. Omitting these yields NaN with no error. */
  width: number;
  height: number;
  x?: number;
  y?: number;
  /**
   * Cancels the bone's world rotation so a plate authored in screen space stays
   * screen-upright under a rotated bone. Without it every slot hanging off the
   * `axis` bone would render tilted by the axis angle.
   */
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  color?: string;
}

/**
 * Weighted mesh. `triangles` and `uvs` are not optional in practice: a missing
 * `triangles` loads as `undefined` and `uvs` is
 * what decides `worldVerticesLength`.
 */
export interface SpineMeshAttachment {
  type: 'mesh';
  path?: string;
  uvs: number[];
  triangles: number[];
  /** Weighted encoding: boneCount, (boneIndex, bindX, bindY, weight)*n, repeated. */
  vertices: number[];
  /** Hull vertex count. The loader stores this doubled. */
  hull: number;
  /** Nonessential, but they make the mesh budget assertions readable. */
  width: number;
  height: number;
  /** Nonessential index pairs the editor draws; carried through when authored. */
  edges?: number[];
  color?: string;
}

export type SpineAttachment = SpineRegionAttachment | SpineMeshAttachment;

export type SpineTimelineKey = Record<string, unknown>;

/**
 * 4.3 puts every constraint type in ONE top-level `constraints` array and
 * branches on `type` (SkeletonJson.js:129-350). The 4.1-era per-type arrays
 * (`physics: [...]`, `ik: [...]`) are not read at all — the constraint vanishes
 * with no error, which is assertion A01.
 */
export type SpineConstraint = { name: string; type: string } & Record<string, unknown>;

export interface SpineSkeletonJson {
  skeleton: {
    spine: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fps?: number;
    referenceScale?: number;
    images?: string;
  };
  bones: SpineBone[];
  slots: SpineSlot[];
  constraints?: SpineConstraint[];
  skins: Array<{ name: string; attachments: Record<string, Record<string, SpineAttachment>> }>;
  animations: Record<
    string,
    {
      slots?: Record<string, Record<string, SpineTimelineKey[]>>;
      bones?: Record<string, Record<string, SpineTimelineKey[]>>;
      physics?: Record<string, Record<string, SpineTimelineKey[]>>;
      /** Whole-animation timeline: no target name, one array per animation. */
      drawOrder?: SpineTimelineKey[];
    }
  >;
}

// ---------------------------------------------------------------------------
// Compiler result
// ---------------------------------------------------------------------------

export interface CompiledImage {
  /** Region name = attachment name = PNG basename. */
  region: string;
  /** Atlas page name: the PNG path relative to the atlas file. */
  page: string;
  /** Absolute path on disk, for the size assertions. */
  absPath: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  isBase: boolean;
}

/**
 * Structural expectations the validator cannot read out of skeleton JSON.
 *
 * Some invariants of a rig are simply not written down in the artifact:
 * nothing in the file says "this mesh is a ribbon" or "this emitter must not
 * hang off the part that released it". The compiler knows, because the rig
 * spec's `invariants` block says so, and it hands the knowledge over rather than
 * letting the validator guess. Mutants stay honest because a mutant edits the
 * ARTIFACT while this block keeps saying what the rig was supposed to be.
 */
export interface RigInfo {
  /** The rig spec's `name`. Reported by the validator so a green names its rig. */
  archetype: string;
  /** The bone whose setup rotation carries the cut's axis, if the rig has one. */
  axisBone: string | null;
  /** Bones under the axis bone, whose translate keys must stay on the axis. */
  axisSubtree: string[];
  /** [bone, ancestor it must never have] — see `invariants.detached`. */
  detached: Array<[string, string]>;
  /** Canonical draw order (the rig's slot array), or null if it declares none. */
  slotOrder: string[] | null;
  /**
   * slot -> what built this mesh, for the kind-aware mesh assertions.
   *
   * `ring` and `ribbon` are rigc's own generators, whose topology it therefore
   * knows: where the rim is, which edge is the entry row, that the rows pair up.
   * **`authored`** is geometry that came in through the rig spec — drawn by an
   * animator, transcribed from an export — and rigc knows nothing about its
   * topology at all. An assertion that measures generator topology has nothing
   * to say about one, so it SKIPs with that as the reason rather than checking
   * a ring the mesh was never supposed to be.
   */
  meshKinds: Record<string, 'ring' | 'ribbon' | 'authored'>;
  /** Mesh slots this rig budgets for, or null when it declares no budget. */
  meshSlotBudget: number | null;
  /** Triangles one mesh may carry, or null when the rig declares no budget. */
  meshTriangleBudget: number | null;
  /** Deepest inward advance the two masses allow, from the manifest. */
  contactDepth: number | null;
  /**
   * Deepest inward advance at which the cap contour is still covered, from the
   * manifest. Null when the cut has not measured one — A30 then says nothing
   * rather than inventing a wall.
   */
  capContainmentCeiling: number | null;
  /**
   * The bone the inserting mass hangs on. Its own inward keys spend the same
   * clearance the stroke does: if both move in, both close the gap.
   */
  massBone: string | null;
  /** Inward unit vector in SPINE world (y up), for projecting off-axis keys. */
  inwardUnit: [number, number] | null;
}

export interface CompileResult {
  skeleton: SpineSkeletonJson;
  skeletonText: string;
  atlasText: string;
  images: CompiledImage[];
  /** States listed in the manifest whose PNG is not on disk. */
  droppedStates: Array<{ slot: string; state: string; path: string }>;
  /**
   * Parts the manifest declares and the cut does not carry (`image: null`, no
   * states). Reported rather than swallowed: "the optional slots are optional" is
   * a claim about the emit path, so the emit path says out loud which ones it
   * left out.
   */
  absentParts: Array<{ slot: string; why: string }>;
  /** Declared durations, carried into the validator (rule 4). */
  declaredDurations: Record<string, number>;
  /** Bones that drive a mesh attachment: the slot bone plus its control bone. */
  meshBones: string[];
  /** Mesh slots emitted, with triangle counts — reported by `build`. */
  meshes: Array<{
    slot: string;
    kind: 'ring' | 'ribbon' | 'authored';
    attachments: string[];
    vertices: number;
    triangles: number;
    bones: string[];
  }>;
  /** Structural expectations handed to the validator. */
  rig: RigInfo;
  /** Physics constraints emitted, with the bone each one drives. */
  physics: Array<{ name: string; bone: string; components: string[]; mix: number; drivesMesh: boolean }>;
}
