/**
 * ingest — Spine 4.3 skeleton JSON back into a rig spec and a motion spec.
 *
 * ## What this is, and what makes it checkable
 *
 * `build` turns two spec files into a skeleton. This turns a skeleton back into
 * two spec files, so that the contract is an **equality against the file it was
 * read from**: `build(ingest(A)) === A`, byte for byte on `skeleton.json`. Every
 * other gate in this repository compares rigc to rigc — the compiler against the
 * validator, one compile against a second (`A18`), the emitter against its own
 * assertions. This one compares rigc's output against an input rigc did not
 * write, which is the only reference of that kind the tree has.
 *
 * ⇒ So every function below is an **inversion of one named function in
 * [`compile.ts`](compile.ts)**, and each says which. That citation is what makes
 * the module reviewable: a reader checks the pair, not the prose.
 *
 * ## The rule it is held to
 *
 * 🔒 **A decompiler never invents a value the skeleton does not carry.** It is
 * CLAUDE.md's *"the compiler never invents a value that is not in the spec"*,
 * mirrored — and the mirror is where a decompiler's defects live, because a
 * plausible guess here produces a spec that compiles, gates green and says
 * something nobody wrote. Where the skeleton cannot answer, this records a
 * **finding** with a code and writes nothing: `findings` is the product, not a
 * log. Exactly two values are not in a skeleton at all (the stage and an
 * animation's duration) and both are `judgement` findings; every construct the
 * spec format cannot hold is a `blocker`; everything rigc re-derives rather than
 * carries is `lossy`. The one thing it refuses outright rather than recording is
 * an OPTION that contradicts the file — see `IngestError`.
 *
 * ## What it does not read
 *
 * Skeleton JSON, and nothing else. Not the atlas, not a `.spine` project, not a
 * binary `.skel`, not the art. A rig spec's texture side is therefore the
 * caller's (`IngestOptions.art`) and is stated as such.
 *
 * ## Purity
 *
 * No clock, no randomness, no filesystem, no network, and no `spine-core` — the
 * three files allowed to link the runtime are named in CLAUDE.md and this is not
 * one of them (`CUR07` refuses a fourth). The provenance `note` therefore carries
 * a version the caller passes in and **no timestamp**, because a timestamp would
 * break `A18_DETERMINISTIC_EMIT` the first time anybody rebuilt from an ingested
 * spec.
 */
import { PHYSICS_COMPONENTS, SLOT_TRACKS as EMITTED_SLOT_TRACKS, SPINE_VERSION } from './compile.ts';
import { CompileError } from './errors.ts';
import { CHANNELS_BY_KIND } from './timelines.ts';
import {
  LEGACY_BONE_INHERIT_KEY,
  PHYSICS_FIELDS_WHOSE_DEFAULT_MOVED,
  SPINE_GENERATIONS,
  spineGeneration,
  TOPLEVEL_CONSTRAINT_ARRAYS,
} from './generation.ts';
import { MOTION_SPEC_VERSION, parseMotionSpec } from './motion.ts';
import { parseRigSpec, RIG_KEYS, RIG_SPEC_VERSION, type RigSpec } from './rig.ts';
import type { MotionSpec } from './types.ts';

/**
 * The invocation this module refuses outright, rather than recording.
 *
 * ⚠️ **A finding is about the FILE; this is about the call.** Everything below
 * that a skeleton cannot answer is a `finding` and the specs are still written,
 * because a spec plus a list of what is missing from it beats no spec. An
 * `IngestError` is the other thing: an option that contradicts the file it was
 * given, where writing anything at all would be writing something the caller did
 * not ask for. It is one re-run away from everything, which is what makes
 * refusing cheaper than recording here (issue #626).
 */
export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestError';
  }
}

/**
 * The specs this module wrote, and the tree's own parser refusing one of them.
 *
 * 🚨 **A parser refusal mid-`ingest` used to be the run's last word** (issue
 * #692). `parseRigSpec` throws a `CompileError`, it went straight out through
 * `ingest()`, and the run exited 1 with **no `BLOCK` line, no code and no
 * `findings.json` on disk** — so a census that counts finding codes read those
 * files as refused for no stated reason. A shape the spec format cannot hold is
 * exactly what a coded `blocker` is for, and the code rides in `findings` here
 * with everything else the run found.
 *
 * It carries the two spec objects because they are what the parser was given:
 * writing them is what lets the sentence be read against a file rather than
 * against the console. They are the same objects a successful run returns —
 * `parseRigSpec` hands its input back typed — so the bytes on disk do not depend
 * on which way the parse went.
 */
export class IngestSpecRefused extends Error {
  constructor(
    message: string,
    readonly findings: IngestFinding[],
    readonly rig: JsonObject,
    readonly motion: JsonObject,
  ) {
    super(message);
    this.name = 'IngestSpecRefused';
  }
}

// ---------------------------------------------------------------------------
// findings
// ---------------------------------------------------------------------------

/**
 * What a finding is about, which is also what the caller's exit code turns on.
 *
 * - `blocker` — the spec format cannot say this, so the rebuilt skeleton will
 *   NOT be the one that was read. Non-zero exit.
 * - `judgement` — the skeleton does not carry it and somebody has to decide.
 *   There are exactly two: the stage, and an animation's duration.
 * - `lossy` — the skeleton's spelling and rigc's differ, on purpose, and the
 *   difference is named: a value rigc re-derives rather than takes (`lengths`,
 *   the `spine` version), a field the spec has no home for (`hash`, `audio`), or
 *   a default the source left to the format and the rebuild writes out
 *   (`HEADER_ORIGIN`, issue #622). The rebuilt file is a different file in that
 *   field; it is not a different rig.
 */
export type IngestFindingKind = 'blocker' | 'judgement' | 'lossy';

/**
 * The gutter each kind prints under — the token a reader meets before the code,
 * and the column `docs/INGEST.md` §2.0's finding-code table is keyed on.
 *
 * ⭐ Exported for the reason `SLOT_TRACKS` below is read off `compile.ts`
 * (issue #650): it was a local table inside `cmdIngest`, so the CLI that prints
 * a gutter, the page that documents one and the gate that compares the two
 * would have held three copies of the same three pairs. The CLI pads it to one
 * width for the column; the width is a printing decision and stays there.
 */
export const INGEST_GUTTERS: Record<IngestFindingKind, string> = {
  blocker: 'BLOCK',
  judgement: 'JUDGE',
  lossy: 'LOSS',
};

export interface IngestFinding {
  /** Stable code, so a table can count them and a doc can name one. */
  code: string;
  /** The object this is about, named the way a validator failure names one. */
  where: string;
  /** One sentence: what was found, and what it means for the rebuild. */
  detail: string;
  kind: IngestFindingKind;
}

/** The stage a skeleton does not carry. See `NO_STAGE` below. */
export interface IngestStage {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IngestOptions {
  /** The rig spec's `name`, which the motion spec's `archetype` must equal. */
  name: string;
  /**
   * How the rebuilt spec gets at the art.
   *
   * `loose` names an `image` per attachment, so `build --images <dir>` measures
   * the PNGs; `none` states `width`/`height` only, for a rebuild that resolves
   * through `build --atlas-in <pack>`. The skeleton encodes neither, which is
   * why this is a flag rather than a derivation.
   */
  art: 'loose' | 'none';
  /**
   * The rig spec's own `images` — the directory every `image` written below
   * resolves against — ALREADY spelled relative to the directory the spec will
   * be written into (issue #595).
   *
   * Absent leaves the field out, and an absent `images` resolves against the
   * spec's own directory: a caller who extracted the parts anywhere else then
   * carries `build --images <dir>` on every rebuild forever, and a spec that
   * needs a flag to build is a spec whose `note` would have to say so.
   *
   * ⚠️ Spelled by the CALLER, not here. Turning a directory somebody typed into
   * an absolute path reads a working directory, and this module reads nothing;
   * `cli.ts` resolves it and spells it with `relativeImagesPath`, which is the
   * same function `build` spells `skeleton.images` with, so the two cannot
   * drift. Meaningless under `art: 'none'`, which writes no `image` at all —
   * `cli.ts` refuses that pair rather than writing a field nothing reads.
   */
  images?: string;
  /**
   * Supplied stage, for a skeleton that declares none.
   *
   * ⛔ **Beside a skeleton that declares one this is an `IngestError`, not an
   * override** (issue #626). It used to be read only after the early return in
   * `ingestHeader`, so a caller who passed it alongside a declared box got the
   * file's box, no finding and exit 0 — and the sharper case is the caller who
   * meant to correct a wrong box and believed they had. The file is the record
   * of what was measured; two sources for one value is a question, and rigc
   * refuses it rather than answering it quietly.
   */
  stage?: IngestStage;
  /** The source file's basename, for the provenance note. No path: no leak. */
  source: string;
  /** rigc's own version, for the provenance note. Passed in — `src/` reads no files. */
  version: string;
}

export interface IngestResult {
  rig: RigSpec;
  motion: MotionSpec;
  findings: IngestFinding[];
}

// ---------------------------------------------------------------------------
// JSON narrowing — the input is a file somebody else wrote
// ---------------------------------------------------------------------------

type JsonObject = Record<string, unknown>;

function isObj(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The array at `v`, or an empty one. An absent collection is not a fault here. */
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** The object at `v`, or an empty one. */
function obj(v: unknown): JsonObject {
  return isObj(v) ? v : {};
}

/** `Object.entries` over the OBJECT-valued entries of `v`, in file order. */
function objEntries(v: unknown): Array<[string, JsonObject]> {
  return Object.entries(obj(v)).filter((entry): entry is [string, JsonObject] => isObj(entry[1]));
}

/** `Object.entries` over the ARRAY-valued entries of `v`, in file order. */
function arrEntries(v: unknown): Array<[string, unknown[]]> {
  return Object.entries(obj(v)).filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]));
}

/** The numbers at `v`, or undefined. A mixed array is not a number array. */
function numbers(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.every((n) => typeof n === 'number') ? (v as number[]) : undefined;
}

function nameOf(v: unknown): string {
  return isObj(v) && typeof v.name === 'string' ? v.name : '';
}

// ---------------------------------------------------------------------------
// field tables — DERIVED from the rig spec's own key sets, never retyped
// ---------------------------------------------------------------------------
//
// ⭐ `RIG_KEYS` is already the statement of which fields a rig spec holds, and
// `checkRigSpecKeys` refuses everything outside it. Reading the carry list off
// that table rather than copying it means a field added to the spec becomes
// carryable here with no edit, and — the half that matters — a skeleton field
// that has no rig-spec home is refused BY NAME instead of being dropped in
// silence. A second list would be two lists that have to agree, which is the
// defect `RIG_KEYS`'s own comment is about.

/** Everything `RIG_KEYS` names for a shape, minus the keys this file handles itself. */
function carried(shape: keyof typeof RIG_KEYS, ...handled: string[]): string[] {
  return (RIG_KEYS[shape] as readonly string[]).filter((key) => !handled.includes(key));
}

/**
 * Bone fields carried verbatim. Inverts `buildBone` in `compile.ts`.
 *
 * `from` is excluded because it is rigc's own: a bone position taken from a
 * manifest anchor, resolved to `x`/`y` at compile time (`cropPointOf`). A
 * skeleton holds the resolved numbers and nothing else, so carrying them as
 * `x`/`y` is the inversion and a `from` here would be an invention.
 */
const BONE_FIELDS = carried('RigBone', 'name', 'from');

/** Slot fields carried verbatim. Inverts the slot loop in `compile()` step 4. */
const SLOT_FIELDS = carried('RigSlot', 'name');

/** Per constraint type, the fields carried verbatim. Inverts `buildRigConstraint`. */
const CONSTRAINT_FIELDS: Record<string, string[]> = {
  ik: carried('RigIkConstraint', 'name', 'type'),
  transform: carried('RigTransformConstraint', 'name', 'type'),
  path: carried('RigPathConstraint', 'name', 'type'),
  physics: carried('RigPhysicsConstraint', 'name', 'type'),
  slider: carried('RigSliderConstraint', 'name', 'type'),
};

/**
 * The physics constraints that drive nothing, by name, each with the component
 * fields it DOES state — every one of them at most 0 (issue #731).
 *
 * 🔑 The runtime's own predicate, not a reading of it: `PhysicsConstraint.update`
 * decides what it applies with `this.data.x > 0` and its four siblings
 * (`PhysicsConstraint.js:112`) and nothing else, so a constraint with none of
 * `PHYSICS_COMPONENTS` above 0 moves no bone. `build` refuses exactly that shape
 * by name — `A23_PHYSICS_CONSTRAINT_EFFECTIVE` at the gate — so carrying one
 * through made the decompiled spec of a file an editor exports unbuildable as a
 * whole, over a constraint that did nothing in it.
 *
 * ⚠️ A component that is present and NOT a number is not inert: the parser takes
 * it as written and `"0.5" > 0` is true in the runtime's comparison, so such a
 * constraint is carried and rigc's own parser says what is wrong with it.
 */
function inertPhysics(root: JsonObject): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const raw of arr(root.constraints)) {
    const constraint = obj(raw);
    if (constraint.type !== 'physics' || typeof constraint.name !== 'string') continue;
    const stated = PHYSICS_COMPONENTS.filter((field) => constraint[field] !== undefined);
    if (!stated.every((field) => typeof constraint[field] === 'number' && !((constraint[field] as number) > 0))) continue;
    out.set(
      constraint.name,
      stated.map((field) => `${field} ${String(constraint[field])}`),
    );
  }
  return out;
}

/** What omitting one inert physics constraint took with it, for its finding. */
interface PhysicsOmission {
  /** `animation "<a>" <timeline>`, in file order. */
  timelines: string[];
  /** The skins whose `physics` member list named it. */
  skins: string[];
  /** Per animation, the latest key time on an omitted timeline of this constraint. */
  lastKeys: Map<string, number>;
}

/**
 * The per-skin member lists (`SkeletonJson` reads them before `attachments`).
 *
 * `RIG_KEYS.RigSkinEntry` is `attachments` plus the five constraint lists plus
 * `bones`; the long form of a skin is exactly those, so the list is that set
 * minus the table itself.
 */
const SKIN_LISTS = carried('RigSkinEntry', 'attachments');

/**
 * One value-track channel: the JSON field, and what the PARSER reads where a key
 * omits it.
 *
 * ⚠️ A number is a constant default; a STRING is another field of the same key,
 * which is how `mixY` works (`SkeletonJson:988` — it defaults to that key's own
 * `mixX`, not to 1). The same two-shaped table as `CONSTRAINT_TIMELINES`'s
 * `inheritsFrom`, and for the same reason.
 */
type TrackShape = Array<[field: string, dflt: number | string]>;

/**
 * Bone timeline shapes. Inverts `BONE_TRACKS` + `compileValueTrack`.
 *
 * 🚨 The defaults matter more than they look, and they are not all the same:
 * Spine omits a field that equals the SETUP value, `translate` reads 0 there and
 * `scale` reads 1. A decompiler that filled every omission with 0 would collapse
 * every scale key it read, silently.
 */
const BONE_TRACKS: Record<string, TrackShape> = {
  translate: [['x', 0], ['y', 0]],
  translatex: [['value', 0]],
  translatey: [['value', 0]],
  scale: [['x', 1], ['y', 1]],
  scalex: [['value', 1]],
  scaley: [['value', 1]],
  shear: [['x', 0], ['y', 0]],
  shearx: [['value', 0]],
  sheary: [['value', 0]],
  rotate: [['value', 0]],
};

/**
 * The eight physics timelines — `PHYSICS_TRACKS` in `compile.ts`, same order.
 * `reset` carries no value at all — `compileValueTrack`'s zero-field branch.
 *
 * 🚨 The defaults are the parser's per-key ones and they are **0 on six of the
 * eight**, which is not where a reader looks for them: the constraint's own
 * defaults (`inertia` 0.5, `strength` 100, `damping` 0.85, `mass` 1) sit in the
 * same file at `:306-312` and belong to the constraint, not to a key. A
 * decompiler that filled an omitted `damping` key with 0.85 would write a spec
 * that plays a different animation from the one it read, and every gate would
 * call it green. Copied off `SkeletonJson.js:1062` and `:1090`, not assumed.
 */
const PHYSICS_TRACKS: Record<string, TrackShape> = {
  inertia: [['value', 0]],
  strength: [['value', 0]],
  damping: [['value', 0]],
  mass: [['value', 0]],
  wind: [['value', 0]],
  gravity: [['value', 0]],
  mix: [['value', 1]],
  reset: [],
};

/** `mix` is three values in ONE key — `PATH_TRACKS` in `compile.ts`. */
const PATH_TRACKS: Record<string, TrackShape> = {
  position: [['value', 0]],
  spacing: [['value', 0]],
  mix: [['mixRotate', 1], ['mixX', 1], ['mixY', 'mixX']],
};

/** ⚠️ `time`'s per-key default is **1**, not 0 (`:1121`). Copied, not assumed. */
const SLIDER_TRACKS: Record<string, TrackShape> = { time: [['value', 1]], mix: [['value', 1]] };

/**
 * The `ik` and `transform` key fields and the value the PARSER reads where a key
 * omits one — `CONSTRAINT_TIMELINES` in `compile.ts`, channels then flags.
 *
 * ⚠️ `mixY` is the one field whose default is not a constant: it is the same
 * key's own `mixX` (`SkeletonJson:988`), which is why it is spelled here as a
 * field name rather than a number.
 */
const IK_KEY_DEFAULTS: Record<string, number | boolean> = {
  mix: 1,
  softness: 0,
  bendPositive: true,
  compress: false,
  stretch: false,
};
const TRANSFORM_KEY_DEFAULTS: Record<string, number | boolean | string> = {
  mixRotate: 1,
  mixX: 1,
  mixY: 'mixX',
  mixScaleX: 1,
  mixScaleY: 1,
  mixShearY: 1,
};
/** The three ik booleans, which `compileConstraintTrack` stamps from the rig. */
const IK_FLAGS = ['bendPositive', 'compress', 'stretch'];

/**
 * The animation groups the motion spec carries. Anything else is a blocker.
 *
 * ⚠️ This said *"the groups `readAnimation` reads"* until issue #675, and the
 * `ANIMATION_GROUP` detail below said it to the reader. It is not the same set:
 * `SkeletonJson.readAnimation` reads `drawOrderFolder` too and builds a
 * `DrawOrderFolderTimeline` from it, so on that one name the sentence told an
 * author the parser ignores something it plays. What is true either way is the
 * half that decides the rebuild — the motion spec has no home for it — so that
 * is what both the list and the finding now say.
 */
const ANIMATION_GROUPS = ['bones', 'slots', 'ik', 'transform', 'path', 'physics', 'slider', 'attachments', 'drawOrder', 'events'];

/** The header fields rigc writes that no rig spec field holds. */
const HEADER_REDERIVED = ['spine'];

/** The attachment types this module inverts. Everything else is refused by name. */
const ATTACHMENT_TYPES = ['region', 'mesh', 'linkedmesh', 'boundingbox', 'clipping', 'path'];

/**
 * The geometry keys a LINKED mesh may state and the parser never reads
 * (issue #710).
 *
 * `readAttachment` returns from the `source` branch at `SkeletonJson.js:586`,
 * before `map.uvs` is touched, so a link carrying any of these is a file that
 * says one mesh while every runtime draws its source's. The rig spec cannot hold
 * them either — `buildRigLinkedMesh` refuses geometry on a link by name — so a
 * rebuild that carried one would be a spec `build` refuses, and a rebuild that
 * dropped it in silence would be this module normalising somebody's file without
 * saying so.
 *
 * ⚠️ A second list beside `src/validate.ts`'s, deliberately: that module links
 * spine-core and this one must not, so importing it would pull the runtime into
 * every `ingest`. What holds the two equal is a RUN rather than a shared
 * constant — one forged skeleton through both, with the keys `A44` names and the
 * keys this finding names compared as sets.
 */
const LINKED_MESH_UNREAD_KEYS = ['uvs', 'triangles', 'vertices', 'hull', 'edges'];

/**
 * The slot timelines the motion spec carries — `compileTrack`'s own table,
 * rather than a second list of the same two names.
 *
 * ⚠️ It was that second list until issue #650, spelled `['rgba', 'attachment']`
 * with a comment saying where it had been copied from. The copy was true, which
 * is the point: the emitter had no list at all — one `if` and a fall-through —
 * so this module's blocker was the only place in `src/` that said what a slot
 * track may be, and it said it about a compiler that accepted anything. Now
 * there is one list and both sides read it.
 */
const SLOT_TRACKS = Object.keys(EMITTED_SLOT_TRACKS);

/**
 * The slot timelines the FORMAT has and the motion spec has no track for —
 * **none** since issue #730 spelled `rgb`, `alpha` and `rgb2`, which were the
 * last three. It stays derived rather than deleted, because an empty
 * difference of two tables is a measurement and a deleted one is a claim: the
 * day the format grows a seventh slot timeline, this is where it appears, and
 * the blocker's sentence names it without an edit.
 *
 * ⭐ Both sides are derived, and that is the whole reason it exists rather than
 * being spelled into the blocker's sentence. `docs/INGEST.md`'s row for this
 * code named `rgba2` among the timelines nobody carries for as long as that was
 * true, and went on saying it after issue #690 made it false — a hand-kept list
 * beside a derived one, which is the shape this repository refuses everywhere
 * else. The format's own list is `CHANNELS_BY_KIND.slot`, the emitter's is
 * `SLOT_TRACKS`, and the difference is the answer.
 */
export const UNSPELT_SLOT_TRACKS = Object.keys(CHANNELS_BY_KIND.slot).filter((name) => !(name in EMITTED_SLOT_TRACKS));

/**
 * Everything this module has a branch for, as the branches themselves state it.
 *
 * ⭐ It exists so that a gate can ask the question a suite cannot answer from a
 * list somebody typed: **is every construct `ingest` claims to carry actually
 * exercised by a rig somebody builds?** A decompiler branch no rig reaches is a
 * branch nobody has seen work, which is this repository's own definition of not
 * a gate — and the vocabulary has to come from here, because a second copy in
 * `selftest.ts` would go stale in exactly the direction that hides the hole.
 */
export const INGEST_VOCABULARY = {
  attachments: ATTACHMENT_TYPES,
  constraints: Object.keys(CONSTRAINT_FIELDS),
  boneTracks: Object.keys(BONE_TRACKS),
  slotTracks: SLOT_TRACKS,
  path: Object.keys(PATH_TRACKS),
  physics: Object.keys(PHYSICS_TRACKS),
  slider: Object.keys(SLIDER_TRACKS),
  animationGroups: ANIMATION_GROUPS,
} as const satisfies Record<string, readonly string[]>;

// ---------------------------------------------------------------------------
// the inversions
// ---------------------------------------------------------------------------

/**
 * Spine's flat weight run back into one `{bone, x, y, weight}` list per vertex.
 *
 * 🔒 Inverts `encodeNamedWeights`, and the inversion is **by name** for exactly
 * the reason that function encodes by name: the run holds positions in the
 * EMITTED bone array, a list no spec writes, so a decompiled `vertices` run
 * would rebind every vertex the moment a bone moved in the array (issue #45).
 * The names are the join key on both sides.
 */
function decodeWeights(vertices: readonly number[], boneNames: readonly string[]): Array<Array<Record<string, unknown>>> {
  const out: Array<Array<Record<string, unknown>>> = [];
  let i = 0;
  while (i < vertices.length) {
    const count = vertices[i++];
    const vertex: Array<Record<string, unknown>> = [];
    for (let k = 0; k < count; k++) {
      vertex.push({ bone: boneNames[vertices[i]], x: vertices[i + 1], y: vertices[i + 2], weight: vertices[i + 3] });
      i += 4;
    }
    out.push(vertex);
  }
  return out;
}

/**
 * `"rrggbbaa"` back to `[r, g, b, a]` in 0..1. Inverts `rgbaHex`.
 *
 * ⚠️ One byte per channel is all the file holds, so this is exact in the only
 * direction that matters: the rebuild quantises the same floats to the same
 * bytes. It is not a recovery of whatever the original author typed.
 */
function hexToRgba(hex: string): number[] {
  return [0, 2, 4, 6].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
}

/**
 * The three-channel form, which is what a two-colour key's `dark` is written as
 * — `rrggbb` and no alpha, because `RGBA2Timeline` stores three dark channels
 * and the fourth a shader reads there is the premultiply flag rather than a
 * colour (`compile.ts`'s `rgba2Hex` states the same fact from the emit side).
 */
function hexToRgb(hex: string): number[] {
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
}

/**
 * Which placeholders more than one skin fills, per slot.
 *
 * 🔒 Inverts `contestedPlaceholders` + `nameSkinAttachment`: rigc writes an
 * attachment `name` exactly where a placeholder is contested, and the rig spec
 * has no field for one. So the name is DROPPED and re-derived — which is right
 * where the contest survives the round trip, and a loss anywhere else. This is
 * what lets that difference be reported rather than assumed.
 */
function contestedPlaceholders(skins: readonly unknown[]): Map<string, Set<string>> {
  const fillers = new Map<string, Map<string, number>>();
  for (const skin of skins) {
    for (const [slot, placeholders] of objEntries(obj(skin).attachments)) {
      const perSlot = fillers.get(slot) ?? new Map<string, number>();
      for (const placeholder of Object.keys(placeholders)) {
        perSlot.set(placeholder, (perSlot.get(placeholder) ?? 0) + 1);
      }
      fillers.set(slot, perSlot);
    }
  }
  const contested = new Map<string, Set<string>>();
  for (const [slot, perSlot] of fillers) {
    const shared = new Set([...perSlot].filter(([, count]) => count > 1).map(([placeholder]) => placeholder));
    if (shared.size) contested.set(slot, shared);
  }
  return contested;
}

/**
 * Read a skeleton, write the two specs that rebuild it.
 *
 * Pure: the same skeleton and the same options give the same specs, every time.
 * The two returned specs have been through `parseRigSpec` and `parseMotionSpec`
 * before they leave — a decompiler that hands back something the compiler's own
 * parser would refuse has produced a file nobody can use, and saying so here
 * names the decompiler instead of leaving `build` to name the file.
 */
export function ingest(skeleton: unknown, opts: IngestOptions): IngestResult {
  const findings: IngestFinding[] = [];
  const note = (kind: IngestFindingKind, code: string, where: string, detail: string): void => {
    findings.push({ code, where, detail, kind });
  };

  const root = obj(skeleton);
  const boneNames: string[] = arr(root.bones).map(nameOf);

  // -- the generation -------------------------------------------------------
  // 🚨 First, because every walk below reads the file as 4.3 and a file from
  // another generation is one this module cannot honestly claim to have read
  // (issue #706 item 3). It records; it does not refuse — see `readGeneration`.
  readGeneration(root, note);

  // -- header ---------------------------------------------------------------
  // 🚨 THE SEAM. One function decides the rig spec's `skeleton` block, and the
  // stage is the only value in this whole module that a skeleton cannot answer
  // for. Issue #578 is landing a way for a rig spec to SAY that a skeleton
  // declares no stage; when it does, this is the one place that changes.
  const rigHeader = ingestHeader(obj(root.skeleton), opts, note);

  // -- physics constraints that drive nothing (issue #731) ------------------
  // Read before the skins, because a skin's `physics` member list is one of the
  // three places such a constraint is named and each has to let go of it.
  const inert = inertPhysics(root);
  const omissions = new Map<string, PhysicsOmission>();
  const omission = (name: string): PhysicsOmission => {
    const found = omissions.get(name);
    if (found !== undefined) return found;
    const made: PhysicsOmission = { timelines: [], skins: [], lastKeys: new Map() };
    omissions.set(name, made);
    return made;
  };

  // -- bones ----------------------------------------------------------------
  // Inverts `buildBone`, which copies every declared field and omits the rest.
  const bones = arr(root.bones).map((raw) => {
    const bone = obj(raw);
    const out: JsonObject = { name: bone.name };
    for (const field of BONE_FIELDS) if (bone[field] !== undefined) out[field] = bone[field];
    for (const key of Object.keys(bone)) {
      if (key === 'name' || BONE_FIELDS.includes(key)) continue;
      note('blocker', 'BONE_FIELD', `bone "${nameOf(bone)}"`, `field "${key}" has no rig-spec field, so it is dropped`);
    }
    return out;
  });

  // -- slots ----------------------------------------------------------------
  // A slot some skin fills but that shows nothing in the setup pose carries NO
  // `attachment` field, and `build` refuses a filled slot with no setup pose
  // ("the compiler will not guess one"). The skeleton does state it: an absent
  // `attachment` on a filled slot means "show nothing", which the rig spec
  // spells `null`. Transcribing an absence is not inventing a value.
  const filled = new Set<string>();
  for (const skin of arr(root.skins)) {
    for (const [slot, placeholders] of objEntries(obj(skin).attachments)) {
      if (Object.keys(placeholders).length) filled.add(slot);
    }
  }
  const slots = arr(root.slots).map((raw) => {
    const slot = obj(raw);
    const out: JsonObject = { name: slot.name };
    for (const field of SLOT_FIELDS) if (slot[field] !== undefined) out[field] = slot[field];
    if (out.attachment === undefined && filled.has(nameOf(slot))) out.attachment = null;
    for (const key of Object.keys(slot)) {
      if (key === 'name' || SLOT_FIELDS.includes(key)) continue;
      note('blocker', 'SLOT_FIELD', `slot "${nameOf(slot)}"`, `field "${key}" has no rig-spec field, so it is dropped`);
    }
    return out;
  });

  // -- skins and attachments ------------------------------------------------
  const contested = contestedPlaceholders(arr(root.skins));
  const skins: JsonObject = {};
  for (const skin of arr(root.skins)) {
    const entry = obj(skin);
    const table: JsonObject = {};
    for (const [slot, placeholders] of objEntries(entry.attachments)) {
      const perSlot: JsonObject = {};
      for (const [placeholder, att] of Object.entries(placeholders)) {
        perSlot[placeholder] = ingestAttachment(obj(att), placeholder, boneNames, opts, note, {
          where: `skin "${nameOf(entry)}" slot "${slot}" attachment "${placeholder}"`,
          contested: contested.get(slot)?.has(placeholder) === true,
        });
      }
      table[slot] = perSlot;
    }
    const lists: JsonObject = {};
    let anyList = false;
    for (const list of SKIN_LISTS) {
      if (entry[list] !== undefined) {
        let members = entry[list];
        if (list === 'physics' && Array.isArray(members)) {
          const named = members.filter((member): member is string => typeof member === 'string' && inert.has(member));
          for (const member of named) omission(member).skins.push(nameOf(entry));
          members = members.filter((member) => !(typeof member === 'string' && inert.has(member)));
          // A list that named nothing BUT omitted constraints goes with them: an
          // empty list and an absent one read the same, and only one of them is
          // what the rebuild writes for a skin with no physics member.
          if (named.length > 0 && (members as unknown[]).length === 0) continue;
        }
        lists[list] = members;
        anyList = true;
      }
    }
    // The long form only where the skin activates something; otherwise the short
    // form, which is what every rig in this tree writes and what `splitRigSkin`
    // reads back as the bare attachment table.
    skins[nameOf(entry)] = anyList ? { ...lists, attachments: table } : table;
  }

  // -- constraints ----------------------------------------------------------
  // Inverts `buildRigConstraint`. 4.3 puts every type in ONE array and branches
  // on `type`, so an unknown `type` is refused here for the same reason the
  // parser's silence about it is assertion A01: it would simply vanish.
  const constraints: JsonObject[] = [];
  for (const raw of arr(root.constraints)) {
    const constraint = obj(raw);
    const type = typeof constraint.type === 'string' ? constraint.type : '';
    const fields = CONSTRAINT_FIELDS[type];
    const who = `constraint "${nameOf(constraint)}"`;
    if (fields === undefined) {
      note('blocker', 'CONSTRAINT_TYPE', who, `type ${JSON.stringify(constraint.type)} is not one of ${Object.keys(CONSTRAINT_FIELDS).join(', ')}`);
      continue;
    }
    // Omitted rather than carried, and said below once the timelines it takes
    // with it are known (`PHYSICS_DRIVES_NOTHING`).
    if (type === 'physics' && typeof constraint.name === 'string' && inert.has(constraint.name)) continue;
    const out: JsonObject = { name: constraint.name, type };
    for (const field of fields) if (constraint[field] !== undefined) out[field] = constraint[field];
    for (const key of Object.keys(constraint)) {
      if (key === 'name' || key === 'type' || fields.includes(key)) continue;
      note('blocker', 'CONSTRAINT_FIELD', `${who} (${type})`, `field "${key}" has no rig-spec field, so it is dropped`);
    }
    constraints.push(out);
  }

  // -- animations -----------------------------------------------------------
  const animations: JsonObject = {};
  for (const [animName, raw] of objEntries(root.animations)) {
    animations[animName] = ingestAnimation(animName, raw, root, note, inert, (name, property, lastKey) => {
      const one = omission(name);
      one.timelines.push(`animation "${animName}" ${property}`);
      one.lastKeys.set(animName, Math.max(one.lastKeys.get(animName) ?? 0, lastKey));
    });
  }

  // One finding per inert constraint, in the file's own order, naming what went
  // with it. ⚠️ An animation's duration is the largest key time it has LEFT, so
  // an omitted timeline that held the last key shortens the rebuilt animation —
  // the one place this omission is not a no-op, and the detail says so there.
  for (const [name, stated] of inert) {
    const gone = omission(name);
    const shortened = [...gone.lastKeys]
      .map(([animName, lastKey]) => [animName, lastKey, Number(obj(animations[animName]).duration)] as const)
      .filter(([, lastKey, duration]) => lastKey > duration)
      .map(
        ([animName, lastKey, duration]) =>
          `animation "${animName}" had its last key at ${lastKey}s on one of them, so the rebuilt animation ends at ${duration}s`,
      );
    note(
      'lossy',
      'PHYSICS_DRIVES_NOTHING',
      `constraint "${name}" (physics)`,
      `drives no component: ${PHYSICS_COMPONENTS.join(', ')} are ` +
        (stated.length ? `absent or at most 0 (it states ${stated.join(', ')})` : 'all absent') +
        ', and `PhysicsConstraint.update` applies one only above 0, so it moves no bone and `build` would refuse it ' +
        'by name (A23_PHYSICS_CONSTRAINT_EFFECTIVE). The rig spec omits it' +
        (gone.timelines.length
          ? `, and with it the ${gone.timelines.length} timeline(s) keyed to it, which would name a constraint the ` +
            `rebuild does not have: ${gone.timelines.join('; ')}`
          : '; no timeline keys it') +
        (gone.skins.length ? `; it is taken off the physics list of skin(s) ${gone.skins.map((skin) => `"${skin}"`).join(', ')}` : '') +
        (shortened.length
          ? `. One thing does move, because a duration is the last key an animation has left: ${shortened.join('; ')}`
          : '. The rebuild differs from the source by exactly these no-ops'),
    );
  }

  // -- assemble -------------------------------------------------------------
  const rig: JsonObject = {
    spec: RIG_SPEC_VERSION,
    name: opts.name,
    note: provenanceNote(opts, 'rig'),
  };
  if (Object.keys(rigHeader).length) rig.skeleton = rigHeader;
  // Between `skeleton` and `bones`, which is where `RIG_KEYS.RigSpec` puts it —
  // this file's key order is the spec's declared order and nothing sorts it.
  if (opts.images !== undefined) rig.images = opts.images;
  rig.bones = bones;
  rig.slots = slots;
  if (Object.keys(skins).length) rig.skins = skins;
  if (constraints.length) rig.constraints = constraints;
  if (isObj(root.events)) rig.events = { ...root.events };
  // `invariants` is deliberately absent. A skeleton states no invariant, and
  // INGEST §2.1 already says what to do about that: leave the block out, because
  // an assertion with nothing to measure reports SKIP and never a pass. Writing
  // an invariant here would be certifying a rig nobody measured.

  const motion: JsonObject = {
    spec: MOTION_SPEC_VERSION,
    archetype: opts.name,
    cut: opts.name,
    note: provenanceNote(opts, 'motion'),
    // Empty on purpose: every curve below is written as a RAW `curve` array.
    // A named easing says "this shape, wherever it is used" and an export carries
    // a different bezier per key per channel, so there is no named easing to
    // recognise — only a shape to copy. `easingCurve`'s output is what a raw
    // curve holds, which is why the rebuild is byte-identical either way.
    easings: {},
    animations,
  };

  // 🔒 Through the tree's own parsers before they leave. `parseRigSpec` and
  // `parseMotionSpec` are what `build` reads these files with, so a spec this
  // module could produce and `build` would refuse is named here, at the
  // decompiler, rather than three commands later at the file.
  //
  // ⚠️ And the refusal is a FINDING (issue #692). It is the one place in this
  // module where a reader's exit code could come from something other than the
  // findings list, which made it the one shape the census behind the finding
  // codes could not count.
  try {
    return {
      rig: parseRigSpec(rig, `ingest(${opts.source}): rig spec`),
      motion: parseMotionSpec(motion, `ingest(${opts.source}): motion spec`),
      findings,
    };
  } catch (err) {
    if (!(err instanceof CompileError)) throw err;
    note(
      'blocker',
      'SPEC_REFUSED',
      `the specs written from "${opts.source}"`,
      `${err.message} — rigc's own parser refuses what this run wrote, so \`build\` will refuse it too. Both files ` +
        'are on disk so the sentence can be read against the skeleton it came from; nothing rebuilds this ' +
        'skeleton until the shape it names has a spelling in the spec',
    );
    throw new IngestSpecRefused(err.message, findings, rig, motion);
  }
}

type Note = (kind: IngestFindingKind, code: string, where: string, detail: string) => void;

/**
 * The generation of the data this module inverts, read off the version the
 * emitter writes rather than typed beside it.
 *
 * ⚠️ `null` here would be a compiler emitting a version string this repository's
 * own detector cannot read, and the comparison below is written so that it
 * blocks every file rather than none — a reader that cannot say what it reads
 * cannot certify anything. `runGenerationSuite`'s positive control is what says
 * out loud that it is not null.
 */
const READER_GENERATION = spineGeneration(SPINE_VERSION);

/** Up to six names, so one finding cannot print a hundred. */
function spellSome(names: readonly string[]): string {
  const shown = names.slice(0, 6).map((name) => `"${name}"`).join(', ');
  return names.length > 6 ? `${shown} +${names.length - 6} more` : shown;
}

/**
 * What a 4.3 reader loses on THIS file, counted on this file.
 *
 * 🚨 Three shapes, and they are the three #706 measured rather than three this
 * module thought of: constraints parked in the top-level arrays 4.3 folded away
 * (row 1 — 1,302 shipped skeletons parsed and loaded 0 of 8,672 constraints),
 * bones carrying the key 4.3 renamed (row 6), and physics constraints omitting a
 * field whose default is not the same number in 4.2 as in 4.3 (row 4).
 *
 * ⚠️ It is a MEASUREMENT and not an inventory: a construct none of the three
 * describes is lost without being counted here, which is why the empty case says
 * so rather than saying nothing was lost.
 */
function generationLosses(root: JsonObject): string[] {
  const out: string[] = [];

  const parked = TOPLEVEL_CONSTRAINT_ARRAYS.map((kind) => [kind, arr(root[kind]).length] as const).filter(
    ([, count]) => count > 0,
  );
  const parkedTotal = parked.reduce((total, [, count]) => total + count, 0);
  if (parkedTotal > 0) {
    out.push(
      `${parkedTotal} constraint(s) sit in top-level arrays (${parked.map(([kind, count]) => `${kind} ${count}`).join(', ')}) ` +
        'and this reader takes constraints from "constraints" alone, so it reads none of them and the rebuilt rig has none',
    );
  }

  const renamed = arr(root.bones)
    .filter((bone) => isObj(bone) && LEGACY_BONE_INHERIT_KEY in bone)
    .map((bone) => nameOf(bone));
  if (renamed.length > 0) {
    out.push(
      `${renamed.length} bone(s) carry "${LEGACY_BONE_INHERIT_KEY}" where 4.3 spells "inherit" (${spellSome(renamed)}), ` +
        'each dropped as a field the rig spec has no home for — the BONE_FIELD line beside this one — so the ' +
        'rebuilt bone inherits Normally',
    );
  }

  const physics = [...arr(root.physics), ...arr(root.constraints).filter((one) => isObj(one) && one.type === 'physics')].filter(
    isObj,
  );
  const omitting = PHYSICS_FIELDS_WHOSE_DEFAULT_MOVED.map(
    (field) => [field, physics.filter((one) => one[field] === undefined).length] as const,
  ).filter(([, count]) => count > 0);
  if (omitting.length > 0) {
    out.push(
      `${physics.length} physics constraint(s), of which ${omitting.map(([field, count]) => `${count} omit "${field}"`).join(' and ')} — ` +
        "JSON omits a field equal to the parser's default and that default is NOT the same number in 4.2 as in 4.3 " +
        '(#706 row 4), so the omission means one rig there and a different one here',
    );
  }
  return out;
}

/**
 * The generation, read before a field of the file is.
 *
 * 🚨 **The silence this converts into a name was measured on the branch point.**
 * A 4.3 emit with its constraints moved into the top-level arrays 4.2 kept them
 * in came back through `ingest` as a rig spec with **zero** constraints and
 * **no finding about them at all**; the only blocker was `BONE_FIELD`, about the
 * bone key. A 3.8 label produced one `LOSS HEADER_REDERIVED` line and exit 0.
 * That is the shape this whole module exists to refuse — a decompiler that is
 * quiet about what it dropped.
 *
 * ⭐ **One code with the generation in the sentence, rather than one code per
 * generation.** `IG25` derives `docs/INGEST.md` §2.0's finding table by reading
 * every `note` call in this file for a code matching `[A-Z_]+`, and compares it
 * against rows matched with `[A-Z_<>]+`. A composed `GENERATION_${generation}`
 * would read `GENERATION_3.8` at runtime — digits and a dot — so the call would
 * be one the scan cannot resolve and the code would be missing from BOTH sides
 * of that comparison, which is the one failure comparing two sets cannot report.
 *
 * ⚠️ The same scan counts its own population with a second, dumber pattern over
 * the raw text, comments included — so a prose mention of that call spelled with
 * its opening bracket raises the count without raising the sites, and `IG25`
 * goes red on a file with nothing wrong in it. It did, on the first green run of
 * this change: **25 of 26 read**, the 26th being this very paragraph.
 *
 * ⚠️ It does NOT refuse the file. Everything here is a finding and both specs
 * are still written, for the reason `IngestFinding` states: a spec plus a list
 * of what is missing from it beats no spec. The exit code is the caller's and it
 * is 1, because this is a `blocker`.
 */
function readGeneration(root: JsonObject, note: Note): void {
  const declared = obj(root.skeleton).spine;
  const generation = typeof declared === 'string' ? spineGeneration(declared) : null;
  if (generation !== null && generation === READER_GENERATION) return;
  const stated = typeof declared === 'string' ? `${JSON.stringify(declared)}` : 'no `skeleton.spine` at all';
  const reads = READER_GENERATION ?? '(none — this build\'s own version string is unreadable)';
  const losses = generationLosses(root);
  const measured =
    losses.length > 0
      ? `Measured on this file: ${losses.join('; ')}.`
      : 'Measured on this file: no constraint in a top-level array, no bone carrying ' +
        `"${LEGACY_BONE_INHERIT_KEY}", and no physics constraint omitting a default that moved — which is three ` +
        'shapes counted and not a guarantee that nothing else differs.';
  if (generation === null) {
    note(
      'blocker',
      'GENERATION_UNKNOWN',
      'skeleton.spine',
      `the file states ${stated} and no Spine generation matches it. A version is read as its LEADING major.minor ` +
        'token — a down-export states "4.0-from-4.1.24", which is 4.0 data from a 4.1 editor — and the generations ' +
        `rigc knows are ${SPINE_GENERATIONS.join(', ')}; this reader reads ${reads}. It is NOT read as the nearest ` +
        'one: a catalogue that handed 19 skeletons labelled "3.8.99" the nearest runtime it had loaded every one of ' +
        `them and posed 238 of 248 bones as NaN (issue #706 row 7). ${measured}`,
    );
    return;
  }
  note(
    'blocker',
    'GENERATION_UNSUPPORTED',
    'skeleton.spine',
    `the file states ${stated}, which is Spine ${generation} data, and this reader reads Spine ${reads} only — it ` +
      `inverts a ${SPINE_VERSION} emitter. A generation mismatch does not throw; it drops what the newer format ` +
      `moved. ${measured} Reading the file with ${generation}'s OWN defaults is issue #706 item 2 — a ` +
      'per-generation table extracted by machine from each runtime\'s `SkeletonJson` — and is not in this tool. ' +
      `Re-export from a ${reads} editor, or transcribe the file by hand (docs/INGEST.md §2).`,
  );
}

/**
 * Does this header declare a stage?
 *
 * 🔒 One reading, three callers below — the refusal, the origin default and the
 * early return — because they are three statements about the same header and two
 * spellings of "declares a stage" would be two things that have to agree. The
 * EXTENT is what declares one: an origin for a box that is not there is a shape
 * no export carries, which is how `diff`'s `stageFacts` and `compile`'s stage
 * guard already read it.
 */
function declaresStage(head: JsonObject): boolean {
  return head.width !== undefined && head.height !== undefined;
}

/**
 * A stage as one string, for a message that has to put two of them side by side.
 *
 * The origin is spelled `0` where it is absent, for the reason `HEADER_ORIGIN`
 * writes it: inside a declared extent that is what the omission means, so a
 * refusal that printed the file's box as `undefined,undefined,…` would be
 * quoting the file against the reading every other part of this tree holds.
 */
function spellStage(x: unknown, y: unknown, width: unknown, height: unknown): string {
  return [x ?? 0, y ?? 0, width, height].map((value) => String(value)).join(',');
}

/**
 * The rig spec's `skeleton` block — and the one judgement in this module.
 *
 * 🚨 **A skeleton JSON need not carry the stage, and it cannot be derived.** rigc
 * always emits `x`/`y`/`width`/`height`, so a rigc build round-trips with nothing
 * to decide. `compile` refuses without one, and there is no derivation: posing
 * the rig gives the ANIMATED extent, which is a different number from the
 * editor's setup box. So with no `--stage` this records a blocker naming the
 * field and writes nothing plausible.
 *
 * ⚠️ This said an editor export's `skeleton` block is `hash`, `spine`, `images`,
 * `audio` **and no box at all** until issue #594 measured the corpus: all twelve
 * exports under `examples/` carry `x`/`y`/`width`/`height`, and the declared-stage
 * branch below is the one they take. The blocker is for a file that really has
 * none, and this module has no example of one.
 *
 * ⭐ It is still the judgement that costs least to get wrong. `diff` does report
 * the box — `stage_present` and `stage_box`, since issue #578 — but they sit in
 * the `(reported)` block that no rung consults, so a deliberately absurd unit box
 * is green everywhere a candidate is scored.
 *
 * 🔇 **Both of its silences were here, and both were around the DECLARED branch
 * rather than the missing one.** That branch used to be a bare early return, so
 * an origin the source omitted left no trace at all (issue #622) and a `--stage`
 * given beside a declared box was read after it and therefore never (issue #626).
 * Neither was wrong — the rebuild carried the right numbers both times — which is
 * exactly the shape this whole module exists to convert into something named:
 * a decompiler that is right for a reason it never states is a decompiler nobody
 * can check.
 */
function ingestHeader(head: JsonObject, opts: IngestOptions, note: Note): JsonObject {
  // 🚨 Before a line of transcription, because a header the caller contradicted
  // is not a header to start writing a spec from (issue #626).
  if (declaresStage(head) && opts.stage !== undefined) {
    throw new IngestError(
      `the skeleton declares a stage of ${spellStage(head.x, head.y, head.width, head.height)} and --stage supplied ` +
        `${spellStage(opts.stage.x, opts.stage.y, opts.stage.width, opts.stage.height)}: two sources for one value. ` +
        'rigc will not overwrite a box the file states — the file is the record of what was measured, and the flag ' +
        'is for a skeleton that declares none. Drop --stage, or correct `skeleton` in the source if its box is wrong',
    );
  }
  const out: JsonObject = {};
  for (const field of RIG_KEYS.RigSkeletonHeader) if (head[field] !== undefined) out[field] = head[field];
  for (const key of Object.keys(head)) {
    if ((RIG_KEYS.RigSkeletonHeader as readonly string[]).includes(key)) continue;
    if (HEADER_REDERIVED.includes(key)) {
      // Two-sided on purpose: the same fact reads as bookkeeping when the two
      // agree and as a warning when they do not, and a reader needs to be told
      // which — a rebuild of a 4.2 export states 4.3, in one field, silently.
      const same = head[key] === SPINE_VERSION;
      note(
        'lossy',
        'HEADER_REDERIVED',
        `skeleton.${key}`,
        `the source states ${JSON.stringify(head[key])} and the rig spec has no field for it: a rebuild writes the ` +
          `version of the runtime rigc links, ${SPINE_VERSION}` +
          (same ? ', which is the same string, so nothing moves' : ' — so this field WILL change on the rebuild'),
      );
      continue;
    }
    note(
      'lossy',
      'HEADER_BOOKKEEPING',
      `skeleton.${key}`,
      `the editor writes "${key}" and the rig spec has no field for it; it is dropped and nothing reads it back`,
    );
  }
  if (declaresStage(head)) {
    // ⭐ **Inside a declared extent, an omitted origin IS `0`** (issue #620),
    // which is a reading of the format rather than a value invented for a gap:
    // `compile` assembles `header.x = rig.skeleton?.x ?? 0` under this same
    // guard, `diff`'s `stageFacts` reads the omission the same way, and
    // `stageFacts`'s own comment carries the four measurements behind it. So the
    // spec states what the file meant instead of leaving the rebuild to a
    // default in another module — and the half that has to be said out loud is
    // the other one: the rebuilt header SPELLS a field the source omitted
    // (issue #622).
    const omitted = ['x', 'y'].filter((field) => head[field] === undefined);
    if (omitted.length > 0) {
      out.x = head.x ?? 0;
      out.y = head.y ?? 0;
      note(
        'lossy',
        'HEADER_ORIGIN',
        `skeleton.${omitted.join('/')}`,
        `the source declares a ${String(head.width)}x${String(head.height)} stage and omits ` +
          `${omitted.map((field) => `"${field}"`).join(' and ')}; inside a declared extent an omitted origin is 0, ` +
          'which is what `compile` emits and what `diff` compares (#620), so the rig spec states x=' +
          `${String(out.x)}, y=${String(out.y)} rather than leaving the rebuild to a default in another module. ` +
          `⚠️ The rebuild WILL spell ${omitted.length > 1 ? 'those fields' : 'that field'}: same box, different bytes`,
      );
    }
    return out;
  }
  if (opts.stage === undefined) {
    note(
      'blocker',
      'NO_STAGE',
      'skeleton.width/height',
      'the skeleton declares no stage; give --stage x,y,w,h — the value is the caller\'s, not derived. Posing the ' +
        'rig would give the ANIMATED extent, which is a different number from the setup box, so rigc refuses rather ' +
        'than measuring the wrong thing (or state the absence once the spec can)',
    );
    return out;
  }
  Object.assign(out, opts.stage);
  note(
    'judgement',
    'NO_STAGE',
    'skeleton.width/height',
    `the skeleton declares no stage and the caller supplied ${opts.stage.x},${opts.stage.y},${opts.stage.width},` +
      `${opts.stage.height}. Nothing measured it: no gate in this tree reads the skeleton header, so a wrong box is ` +
      'green everywhere (or state the absence once the spec can)',
  );
  return out;
}

/**
 * One attachment, by type. Inverts `buildRigAttachment`'s five branches.
 *
 * The types rigc does not emit are refused BY NAME rather than dropped, which is
 * the same reason `buildRigAttachment` refuses them: the parser's own behaviour
 * on a type it does not know is to return null and carry on, so a decompiler
 * that skipped one would hand back a spec that is quietly missing an attachment.
 */
function ingestAttachment(
  att: JsonObject,
  placeholder: string,
  boneNames: readonly string[],
  opts: IngestOptions,
  note: Note,
  at: { where: string; contested: boolean },
): JsonObject {
  // `readAttachment` reads no `type` as `region` (`SkeletonJson:539`), and so
  // does `checkRigSpecKeys`. Both defaults are the parser's, not a guess.
  const type = att.type === undefined ? 'region' : String(att.type);
  const out: JsonObject = {};

  // A LINKED mesh, in either of the format's two spellings. The test is the
  // parser's own — one branch for `mesh` and `linkedmesh`, and a truthy `source`
  // decides (`SkeletonJson.js:568-569`, `:582`) — so `type: "mesh"` carrying
  // `source` inverts to a link, and a `linkedmesh` with none does NOT: that map
  // is read as an ordinary mesh, whose `uvs` it does not have, and the parser
  // throws on it. Reading the second as a link would be this module inventing a
  // construct the file does not contain (issue #691).
  const linked = (type === 'mesh' || type === 'linkedmesh') && typeof att.source === 'string' && att.source.length > 0;

  // The three types the parser gives a texture `path` to, which is exactly the
  // three that call `carryArt` below. `readAttachment` reaches
  // `getValue(map, "path", name)` in the `region` branch (`SkeletonJson.js:529`)
  // and in the shared `mesh`/`linkedmesh` branch (`:560`); `boundingbox`,
  // `path`, `point` and `clipping` are constructed from the name alone and
  // resolve no region at all.
  const resolvesRegion = linked || type === 'region' || type === 'mesh';

  /**
   * The atlas region a dropped `name` was carrying, which the rebuild has to
   * state as `path` or lose.
   *
   * 🚨 **The name is not bookkeeping — it is the region key** (issue #742).
   * `readAttachment` reads `name = getValue(map, "name", placeholder)` and then
   * `path = getValue(map, "path", name)`, so `path` defaults to the NAME and not
   * to the placeholder. A source that states a `name` and no `path` therefore
   * draws the region that name spells; rigc drops the name (the rig spec has no
   * field for one — see below) and used to write no `path` either, so the
   * rebuild asked the atlas for the PLACEHOLDER. Measured on a forged export
   * whose three attachments state `name` and no `path`: the source loads against
   * its own pack and the rebuild failed `A08_REGION_NAMES_MATCH_ATTACHMENTS`
   * three times and `A00_ROUNDTRIP_PARSE` with it.
   *
   * ⚠️ A name EQUAL to the placeholder resolves the same region either way, so
   * nothing is written for it — the rebuild would otherwise spell a field the
   * source did not, and `A18`'s reference is the source file.
   *
   * 🔑 This is not `at.contested`'s business, and that is the half the card
   * nearly missed. Where a placeholder is contested rigc composes a name of its
   * own and `nameSkinAttachment` pins `path` at the PLACEHOLDER — so a contested
   * source naming its own regions lost them with no finding at all, which is
   * quieter than the uncontested case rather than safer.
   */
  const keptPath =
    att.path === undefined && resolvesRegion && typeof att.name === 'string' && att.name !== placeholder
      ? att.name
      : undefined;

  // `name` is DERIVED by rigc — `composeSkinAttachmentName` writes one exactly
  // where a placeholder is contested — so the rig spec has no field for it and
  // it is dropped. Where the contest survives the round trip the same name comes
  // back; anywhere else it is a real loss and is reported.
  if (att.name !== undefined && !at.contested) {
    note(
      'lossy',
      'ATTACHMENT_NAME',
      at.where,
      `the attachment states name ${JSON.stringify(att.name)} and only ONE skin fills this placeholder, so rigc ` +
        'writes no name on the rebuild — it composes "<skin>/<placeholder>" only for a contested placeholder (#541). ' +
        (keptPath !== undefined
          ? `That name was also the ATLAS REGION this attachment resolves, because \`path\` defaults to the name and ` +
            `not to the placeholder (\`SkeletonJson.js:526\`, \`:529\`, \`:560\`) — so the region key is KEPT as ` +
            `"path": ${JSON.stringify(keptPath)} and the name alone is lost`
          : att.path !== undefined
            ? `The region key is the source's own \`path\` ${JSON.stringify(att.path)}, carried unchanged, so the ` +
              'name alone is lost'
            : resolvesRegion
              ? 'The name is the placeholder itself, so the rebuild resolves the same atlas region and no `path` is ' +
                'written for it'
              : `An attachment of type ${JSON.stringify(type)} resolves no atlas region — the parser builds it from ` +
                'the name alone — so there is no region key to keep and the name is the whole loss'),
    );
  }

  /** The texture side, which the skeleton does not encode. Inverts `buildRigRegion`'s tail. */
  const carryArt = (): void => {
    if (att.path !== undefined) out.path = att.path;
    else if (keptPath !== undefined) out.path = keptPath;
    // `buildRigRegion` writes `path` when the image basename differs from the
    // placeholder, so naming the image after the region this attachment RESOLVES
    // reproduces the same `path` decision AND the same atlas region name. Read
    // off `out.path` rather than off `att.path`, so that the region a dropped
    // `name` was carrying names the loose PNG too — otherwise `path` and `image`
    // would disagree and `attachmentPath` would emit the first while the atlas
    // was packed under the second.
    if (opts.art === 'loose') out.image = `${out.path === undefined ? placeholder : String(out.path)}.png`;
    if (att.width !== undefined) out.width = att.width;
    if (att.height !== undefined) out.height = att.height;
  };

  /**
   * The vertex array, as one of the two encodings `readVertices` decides between.
   *
   * Inverts `buildVertexGeometry` / `encodeNamedWeights`: the run is unweighted
   * when it is exactly as long as the coordinate count the attachment declares,
   * and a weight run otherwise. That length comparison is the parser's own.
   */
  const geometry = (declaredPairs: number | undefined): void => {
    const vertices = numbers(att.vertices);
    if (vertices === undefined) return;
    if (declaredPairs !== undefined && vertices.length === declaredPairs * 2) out.vertices = vertices;
    else out.weights = decodeWeights(vertices, boneNames);
  };

  const vertexCount = typeof att.vertexCount === 'number' ? att.vertexCount : undefined;

  if (linked) {
    out.type = 'linkedmesh';
    carryArt();
    out.source = att.source;
    // Only what the file states. `slot`, `skin` and `timelines` each have a
    // parser default (this attachment's slot, the default skin, true), and
    // writing one the source omitted would be a rebuild that says more than the
    // file did — and `buildRigLinkedMesh` drops it again on the way back out.
    for (const field of ['slot', 'skin', 'timelines', 'color']) if (att[field] !== undefined) out[field] = att[field];
    const dropped = LINKED_MESH_UNREAD_KEYS.filter((field) => att[field] !== undefined);
    if (dropped.length > 0) {
      note(
        'lossy',
        'ATTACHMENT_LINK_GEOMETRY',
        at.where,
        `the attachment is a LINKED mesh and states ${dropped.map((field) => `\`${field}\``).join(', ')}, which the ` +
          'parser reads with nothing at all: it returns from the `source` branch before `readVertices` ' +
          `(\`SkeletonJson.ts:582-586\`), so what this attachment draws is the geometry of ${JSON.stringify(att.source)}. ` +
          `The rebuild drops ${dropped.length === 1 ? 'it' : 'them'} — the rig spec refuses geometry on a link by name, ` +
          'and carrying it would write a spec `build` will not take. `A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN` ' +
          'is the same fact held against the source file',
      );
    }
  } else if (type === 'region') {
    carryArt();
    for (const field of ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'color']) {
      if (att[field] !== undefined) out[field] = att[field];
    }
  } else if (type === 'mesh') {
    out.type = 'mesh';
    carryArt();
    out.uvs = att.uvs;
    out.triangles = att.triangles;
    geometry(Array.isArray(att.uvs) ? att.uvs.length / 2 : undefined);
    // Carried rather than re-derived: `authoredHullAndEdges` takes an authored
    // pair as written and cross-checks `hull` against the triangles, so stating
    // both keeps the emitted arrays identical instead of equal-by-derivation.
    if (att.hull !== undefined) out.hull = att.hull;
    if (att.edges !== undefined) out.edges = att.edges;
    if (att.color !== undefined) out.color = att.color;
  } else if (type === 'boundingbox' || type === 'clipping') {
    out.type = type;
    out.vertexCount = att.vertexCount;
    geometry(vertexCount);
    if (att.color !== undefined) out.color = att.color;
    if (type === 'clipping') {
      for (const field of ['end', 'convex', 'inverse']) if (att[field] !== undefined) out[field] = att[field];
    }
  } else if (type === 'path') {
    out.type = 'path';
    out.vertexCount = att.vertexCount;
    geometry(vertexCount);
    for (const field of ['closed', 'constantSpeed', 'color']) if (att[field] !== undefined) out[field] = att[field];
    if (att.lengths !== undefined) {
      note(
        'lossy',
        'PATH_LENGTHS',
        at.where,
        'the source states `lengths`; the rig spec refuses an authored one and rigc RE-MEASURES it as ' +
          '`PathConstraint` does (issue #560, `pathCurveLengths`). Dropping it is correct: the field is the ' +
          "runtime's own four-sample forward difference, not an arc length, and a transcribed one would freeze " +
          'whatever produced the source',
      );
    }
  } else {
    note(
      'blocker',
      `ATTACHMENT_${type.toUpperCase()}`,
      at.where,
      `attachment type ${JSON.stringify(type)} is in the Spine 4.3 format and rigc does not emit it (it emits ` +
        `${ATTACHMENT_TYPES.join(', ')}; point is the one deferred type left — docs/SPEC_COVERAGE.md part 1-6 says ` +
        'what it would carry). The rebuild will not have this attachment',
    );
    return out;
  }

  if (att.sequence !== undefined) {
    note(
      'blocker',
      'ATTACHMENT_SEQUENCE',
      at.where,
      'the attachment carries a `sequence` block (a numbered image series), which the rig spec cannot say; ' +
        'the rebuild draws the single region this attachment names',
    );
  }
  return out;
}

/** One animation. Inverts step 5 of `compile()` — the whole timeline half. */
function ingestAnimation(
  animName: string,
  anim: JsonObject,
  root: JsonObject,
  note: Note,
  inert: ReadonlyMap<string, unknown>,
  omitted: (constraint: string, property: string, lastKey: number) => void,
): JsonObject {
  const tracks: JsonObject[] = [];
  let maxT = 0;
  const seeT = (t: number): void => {
    if (t > maxT) maxT = t;
  };
  const timeOf = (key: JsonObject): number => {
    const t = typeof key.time === 'number' ? key.time : 0;
    seeT(t);
    return t;
  };

  /**
   * A key's easing, as the motion spec spells it.
   *
   * Inverts `rawCurve`: `"stepped"` is a named easing the compiler passes
   * through, and an array is the absolute (time, value) control points, four per
   * channel, which `curve` takes verbatim. A key with neither is linear.
   */
  const easing = (key: JsonObject, out: JsonObject): void => {
    if (key.curve === 'stepped') out.ease = 'stepped';
    else if (key.curve !== undefined) out.curve = key.curve;
  };

  /**
   * A value track of any of the four families. Inverts `compileValueTrack`.
   *
   * ⚠️ `compileValueTrack` never omits a channel, so a rigc-built key states all
   * of them and this reads them straight back. An EDITOR omits a channel that
   * equals the parser's default, and the spec's `v` is positional — so an
   * omission is filled at that channel's default, which is the value the runtime
   * reads there. Reported once per track, because it is a restatement rather
   * than a copy and a reader should know which.
   */
  const valueTrack = (target: JsonObject, property: string, keys: readonly unknown[], shape: TrackShape, where: string): void => {
    const fields = shape.map(([field]) => field);
    const out: JsonObject[] = [];
    let restated = 0;
    for (const raw of keys) {
      const key = obj(raw);
      const entry: JsonObject = { t: timeOf(key) };
      // The zero-field branch: `reset` IS the event, so the key carries no value
      // and the spec spells that `null`.
      entry.v =
        shape.length === 0
          ? null
          : shape.map(([field, dflt]) => {
              if (key[field] !== undefined) return key[field];
              restated++;
              // A string default names another field of THIS key (`mixY` ->
              // `mixX`); when that one is absent too the chain ends at 1, which
              // is what `ConstraintChannel.dflt` holds for both.
              if (typeof dflt !== 'string') return dflt;
              return key[dflt] === undefined ? 1 : key[dflt];
            });
      easing(key, entry);
      for (const field of Object.keys(key)) {
        if (field === 'time' || field === 'curve' || fields.includes(field)) continue;
        note('blocker', 'TIMELINE_FIELD', where, `key field "${field}" is not part of this timeline's shape`);
      }
      out.push(entry);
    }
    if (restated > 0) {
      note(
        'lossy',
        'TIMELINE_KEY_RESTATED',
        where,
        `${restated} channel value(s) the source omits are written out at the parser's default (${shape
          .map(([field, dflt]) => `${field}=${String(dflt)}`)
          .join(', ')}), because the motion spec's \`v\` is positional — the same values the runtime reads`,
      );
    }
    tracks.push({ ...target, property, keys: out });
  };

  /**
   * One family of constraint timelines: `<family>.<constraint>.<timeline>`.
   *
   * ⭐ All three tables are now COMPLETE against `SkeletonJson`'s switch for
   * their group, so the blocker below no longer fires on anything the runtime
   * plays — it is reachable only for a timeline name the parser itself falls
   * through (`:1094` for physics, and neither the path nor the slider switch
   * has a default either). It is kept rather than deleted because `ingest`'s
   * contract is byte identity and not equivalence: a name nothing reads is
   * still a name the rebuild does not write. The alternative — demoting it to
   * `lossy`, on the argument that the rebuilt skeleton plays identically — is
   * a decision about all three families and is not made here.
   */
  const family = (group: 'path' | 'physics' | 'slider', shapes: Record<string, TrackShape>): void => {
    for (const [name, timelines] of objEntries(anim[group])) {
      for (const [property, keys] of arrEntries(timelines)) {
        // A timeline keyed to a physics constraint `ingest` omitted (issue #731)
        // goes with it: carried, it names a constraint the rebuilt rig has not
        // got, and `build` refuses the whole motion spec over it. Its keys are
        // not seen by `seeT` — they are not in the rebuild — and their latest
        // time is handed back so the finding can say when that shortened one.
        if (group === 'physics' && inert.has(name)) {
          let lastKey = 0;
          for (const raw of keys) {
            const t = obj(raw).time;
            if (typeof t === 'number' && t > lastKey) lastKey = t;
          }
          omitted(name, property, lastKey);
          continue;
        }
        const shape = shapes[property];
        const where = `animation "${animName}" ${group} "${name}" ${property}`;
        if (shape === undefined) {
          note('blocker', `${group.toUpperCase()}_TIMELINE`, where, `timeline "${property}" is not in the motion spec`);
          continue;
        }
        valueTrack({ [group]: name }, property, keys, shape, where);
      }
    }
  };

  for (const [bone, timelines] of objEntries(anim.bones)) {
    for (const [property, keys] of arrEntries(timelines)) {
      const shape = BONE_TRACKS[property];
      const where = `animation "${animName}" bone "${bone}" ${property}`;
      if (shape === undefined) {
        note(
          'blocker',
          'BONE_TIMELINE',
          where,
          `timeline "${property}" has no track in the motion spec — a bone track is ${Object.keys(BONE_TRACKS).join(', ')} ` +
            'and nothing else, so the rebuild plays nothing here',
        );
        continue;
      }
      valueTrack({ bone }, property, keys, shape, where);
    }
  }

  for (const [slot, timelines] of objEntries(anim.slots)) {
    for (const [property, keys] of arrEntries(timelines)) {
      const where = `animation "${animName}" slot "${slot}" ${property}`;
      if (property === 'attachment') {
        // Inverts `compileTrack`'s attachment branch: `{time, name}`, where a
        // null name is "show nothing". Attachment keys are stepped by nature and
        // carry no curve at all.
        tracks.push({
          slot,
          property: 'attachment',
          keys: keys.map((raw) => {
            const key = obj(raw);
            return { t: timeOf(key), v: key.name === undefined ? null : key.name };
          }),
        });
      } else if (property === 'rgba') {
        // Inverts `compileTrack`'s rgba branch, whose key is `{time, color}`.
        tracks.push({
          slot,
          property: 'rgba',
          keys: keys.map((raw) => {
            const key = obj(raw);
            const entry: JsonObject = { t: timeOf(key), v: hexToRgba(String(key.color)) };
            easing(key, entry);
            return entry;
          }),
        });
      } else if (property === 'rgba2') {
        // Inverts `compileTrack`'s rgba2 branch, whose key is `{time, light,
        // dark}`. The spec's `v` concatenates the two in the format's own
        // channel order — light r g b a, then dark r g b — which is the order
        // `readCurve` indexes a curve array by, so a key and its curve stay
        // parallel through the round trip.
        tracks.push({
          slot,
          property: 'rgba2',
          keys: keys.map((raw) => {
            const key = obj(raw);
            const entry: JsonObject = {
              t: timeOf(key),
              v: [...hexToRgba(String(key.light)), ...hexToRgb(String(key.dark))],
            };
            easing(key, entry);
            return entry;
          }),
        });
      } else if (property === 'alpha') {
        // Inverts `compileTrack`'s alpha branch, whose key is `{time, value}` —
        // the one colour shape the format stores as a number, read by
        // `readTimeline1` with a per-key default of **0**. That is a value
        // track's shape exactly, so it goes through the same inversion and
        // inherits its two findings: an omitted `value` is written out at 0 and
        // reported as `TIMELINE_KEY_RESTATED`, and a field the shape has no
        // place for is a `TIMELINE_FIELD` blocker (issue #730).
        valueTrack({ slot }, property, keys, [['value', 0]], where);
      } else if (property === 'rgb' || property === 'rgb2') {
        // Inverts `compileTrack`'s other two separable shapes (issue #730):
        // `rgb` is `{time, color: "rrggbb"}` and `rgb2` is `{time, light:
        // "rrggbb", dark: "rrggbb"}`, and the spec's `v` is their channels in
        // `readCurve`'s order. Each keeps its own name and its own key times:
        // folding an `rgb` and an `alpha` into one `rgba` would state each
        // channel at the other's key times, a value nobody keyed.
        tracks.push({
          slot,
          property,
          keys: keys.map((raw) => {
            const key = obj(raw);
            const v =
              property === 'rgb'
                ? hexToRgb(String(key.color))
                : [...hexToRgb(String(key.light)), ...hexToRgb(String(key.dark))];
            const entry: JsonObject = { t: timeOf(key), v };
            easing(key, entry);
            return entry;
          }),
        });
      } else {
        // 🔒 Composed from both tables, so it says the true thing whichever of
        // two states it is reached in. A name the FORMAT has and the spec does
        // not is the first; since issue #730 carried the last three there is no
        // such name (`UNSPELT_SLOT_TRACKS` is empty), and what still reaches
        // here is a name the format does not have at all — which
        // `SkeletonJson.readAnimation` throws on (`Invalid timeline type for a
        // slot`), so the sentence says so instead of printing an empty
        // "remaining" list about a file no runtime loads.
        const inFormat = property in CHANNELS_BY_KIND.slot;
        note(
          'blocker',
          'SLOT_TIMELINE',
          where,
          (inFormat
            ? `timeline "${property}" is in the format and the motion spec has no track for it`
            : `timeline "${property}" is not a slot timeline the format has — the runtime's reader throws ` +
              '"Invalid timeline type for a slot" on it, so no player loads this file') +
            ` — a slot track is ${SLOT_TRACKS.join(' or ')} and nothing else, so the rebuild plays nothing here` +
            (UNSPELT_SLOT_TRACKS.length > 0
              ? `. The format's remaining slot timelines are ${UNSPELT_SLOT_TRACKS.join(', ')}`
              : ''),
        );
      }
    }
  }

  family('path', PATH_TRACKS);
  family('physics', PHYSICS_TRACKS);
  family('slider', SLIDER_TRACKS);

  const ik = constraintGroup('ik', animName, anim, root, IK_KEY_DEFAULTS, seeT, note);
  const transform = constraintGroup('transform', animName, anim, root, TRANSFORM_KEY_DEFAULTS, seeT, note);

  // deform — `attachments.<skin>.<slot>.<attachment>.<timeline>`.
  // Inverts `compileDeformTrack`, whose emitted key is `{time, offset?, vertices?}`
  // and whose `offset` is omitted at 0 (the parser's default).
  const deform: JsonObject[] = [];
  for (const [skinName, perSkin] of objEntries(anim.attachments)) {
    for (const [slot, perSlot] of objEntries(perSkin)) {
      for (const [attachment, timelines] of objEntries(perSlot)) {
        for (const [property, keys] of arrEntries(timelines)) {
          const where = `animation "${animName}" ${skinName}/${slot}/${attachment}`;
          if (property !== 'deform') {
            note('blocker', 'ATTACHMENT_TIMELINE', where, `timeline "${property}" (the motion spec carries \`deform\` only)`);
            continue;
          }
          const entry: JsonObject = {
            slot,
            attachment,
            keys: keys.map((raw) => {
              const key = obj(raw);
              const out: JsonObject = { t: timeOf(key) };
              if (key.offset !== undefined) out.offset = key.offset;
              if (key.vertices !== undefined) out.vertices = key.vertices;
              easing(key, out);
              return out;
            }),
          };
          // `skin` is absent for the default skin, which is the spec's own
          // spelling (`MotionDeformTrack.skin`: absent = "default").
          if (skinName !== 'default') entry.skin = skinName;
          deform.push(entry);
        }
      }
    }
  }

  // drawOrder — inverts `compileDrawOrder`. A key with no `offsets` restores the
  // setup order; that is the parser's own encoding and the spec spells it the
  // same way, so an absent array stays absent.
  let drawOrder: JsonObject[] | undefined;
  if (Array.isArray(anim.drawOrder)) {
    drawOrder = anim.drawOrder.map((raw) => {
      const key = obj(raw);
      const out: JsonObject = { t: timeOf(key) };
      if (Array.isArray(key.offsets)) {
        out.offsets = key.offsets.map((o) => ({ slot: obj(o).slot, offset: obj(o).offset }));
      }
      return out;
    });
  }

  // events — inverts `compileEvents`. The payload fields are written only where
  // the firing overrides the declared event's own, which is what the file holds.
  let events: JsonObject[] | undefined;
  if (Array.isArray(anim.events)) {
    events = anim.events.map((raw) => {
      const key = obj(raw);
      const out: JsonObject = { t: timeOf(key), name: key.name };
      for (const field of ['int', 'float', 'string', 'volume', 'balance']) {
        if (key[field] !== undefined) out[field] = key[field];
      }
      return out;
    });
  }

  for (const group of Object.keys(anim)) {
    if (ANIMATION_GROUPS.includes(group)) continue;
    note(
      'blocker',
      'ANIMATION_GROUP',
      `animation "${animName}"`,
      `group "${group}" has no home in the motion spec — an animation group is ${ANIMATION_GROUPS.join(', ')} and ` +
        'nothing else, so the rebuild carries nothing from it',
    );
  }

  // 🚨 There is no duration in skeleton JSON. The largest key time is the only
  // derivable answer and it is what a runtime plays to; it is WRONG for an
  // animation that holds its last pose past its last key, and nothing in the
  // file distinguishes the two. Recorded per animation rather than hidden.
  note(
    'judgement',
    'DURATION',
    `animation "${animName}"`,
    `skeleton JSON carries no duration; the largest key time (${maxT}) is used, which is what a runtime plays to. ` +
      'An animation meant to hold past its last key needs the real number stated by hand',
  );

  const out: JsonObject = { duration: maxT, tracks };
  if (ik.length) out.ik = ik;
  if (transform.length) out.transform = transform;
  if (deform.length) out.deform = deform;
  if (drawOrder !== undefined) out.drawOrder = drawOrder;
  if (events !== undefined) out.events = events;
  return out;
}

/**
 * `ik` / `transform` — one unnamed timeline per constraint.
 *
 * Inverts `compileConstraintTrack`, and this is the one inversion that has to
 * RESTATE rather than copy. Two reasons, and neither invents a value:
 *
 * 1. **The uniform field set.** Every field of these keys is optional with a
 *    per-key default, so `compileConstraintTrack` refuses a track whose keys do
 *    not all name the same fields — *"state it on every key or on none"*. An
 *    export does not obey that: it omits a field wherever it equals the default.
 *    So a field ANY key states is written on EVERY key, at the value the parser
 *    would have read there. Identical semantics, larger file.
 * 2. 🚨 **`rigFlags`.** `compileConstraintTrack` stamps the rig constraint's
 *    non-default `bendPositive`/`compress`/`stretch` onto a key that omits one
 *    (issue #273). On rigc's own output that is self-consistent — rigc already
 *    wrote the flag on every key, so it is read back as stated. On a FOREIGN
 *    export it would change what plays: the export's omission means the per-key
 *    default, and the stamp would substitute the constraint's setup value. So a
 *    flag the constraint declares non-default is written on every key at the
 *    PARSER default, which is what the export actually plays.
 */
function constraintGroup(
  group: 'ik' | 'transform',
  animName: string,
  anim: JsonObject,
  root: JsonObject,
  defaults: Record<string, number | boolean | string>,
  seeT: (t: number) => void,
  note: Note,
): JsonObject[] {
  const fields = Object.keys(defaults);
  const out: JsonObject[] = [];
  for (const [name, keys] of arrEntries(anim[group])) {
    const where = `animation "${animName}" ${group} "${name}"`;
    const stated = new Set<string>();
    for (const raw of keys) {
      const key = obj(raw);
      for (const field of fields) if (key[field] !== undefined) stated.add(field);
    }
    if (group === 'ik') {
      const constraint = arr(root.constraints)
        .map(obj)
        .find((c) => nameOf(c) === name && c.type === 'ik');
      for (const flag of IK_FLAGS) {
        if (constraint !== undefined && constraint[flag] !== undefined && constraint[flag] !== IK_KEY_DEFAULTS[flag]) {
          stated.add(flag);
        }
      }
    }
    if (stated.size > 0 && stated.size < fields.length) {
      note(
        'lossy',
        'CONSTRAINT_KEY_RESTATED',
        where,
        `${fields.length - stated.size} field(s) the source omits are restated at the parser's default on every key, ` +
          'because the motion spec requires one field set per track — the same values the runtime reads, spelled out',
      );
    }
    const ks = keys.map((raw) => {
      const key = obj(raw);
      const entry: JsonObject = { t: typeof key.time === 'number' ? key.time : 0 };
      seeT(entry.t as number);
      for (const field of fields) {
        if (!stated.has(field)) continue;
        if (key[field] !== undefined) entry[field] = key[field];
        else {
          const dflt = defaults[field];
          // `mixY`'s default is the same key's own `mixX`, spelled as that field
          // name in the table above.
          entry[field] = typeof dflt === 'string' ? (key[dflt] !== undefined ? key[dflt] : defaults[dflt]) : dflt;
        }
      }
      if (key.curve === 'stepped') entry.ease = 'stepped';
      else if (key.curve !== undefined) entry.curve = key.curve;
      for (const field of Object.keys(key)) {
        if (field === 'time' || field === 'curve' || fields.includes(field)) continue;
        note('blocker', `${group.toUpperCase()}_KEY_FIELD`, where, `key field "${field}" is not part of this timeline's shape`);
      }
      return entry;
    });
    out.push({ constraint: name, keys: ks });
  }
  return out;
}

/**
 * The provenance sentence both specs carry (INGEST §2.4's rule).
 *
 * ⚠️ A decompiled spec is indistinguishable from an authored one by inspection,
 * and every gate in this tree will call it green — because it IS green. No gate
 * catches a missing note, which is exactly why `ingest` writes one itself rather
 * than leaving it to the caller.
 *
 * 🔒 No timestamp, and that is a contract rather than a style: `A18` compares two
 * independent compiles byte for byte, and a dated note in a spec would break the
 * first rebuild from it.
 */
function provenanceNote(opts: IngestOptions, which: 'rig' | 'motion'): string {
  const head =
    `DECOMPILED from ${opts.source} by \`rigc ingest\` ${opts.version}. Every number here was read out of that ` +
    'skeleton; nothing was authored, so this file says what the object IS and nothing about why.';
  if (which === 'rig') {
    return (
      `${head} \`invariants\` is deliberately absent — a skeleton declares none, and an assertion with nothing to ` +
      'measure must SKIP rather than pass.'
    );
  }
  return (
    `${head} Every curve is a raw \`curve\` array — the absolute (time, value) control points verbatim — because an ` +
    'export carries a different bezier per key per channel and no named easing can say that. Each `duration` is the ' +
    'largest key time in its animation, which is the only figure skeleton JSON supports.'
  );
}
