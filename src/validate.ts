/**
 * rigc validate — the other half of the tool.
 *
 * The parser is forgiving, and that is the danger: there are at least six ways
 * to write a wrong skeleton that loads with no error at all. So this stage has
 * two layers:
 *
 *   A. Round-trip through the REAL spine-core. If TextureAtlas or SkeletonJson
 *      throws, the artifact is dead on arrival — those are the two failures the
 *      parser does report.
 *   B. Assertions we make ourselves, because the parser will not. Every silent
 *      failure becomes one named machine check here.
 *
 * A failure is a named assertion, and a named assertion is a nonzero exit.
 */
import { existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import {
  AnimationState,
  AnimationStateData,
  AtlasAttachmentLoader,
  type BoneData,
  BoundingBoxAttachment,
  ClippingAttachment,
  DeformTimeline,
  isBoneTimeline,
  isConstraintTimeline,
  isSlotTimeline,
  MeshAttachment,
  MixFrom,
  PathAttachment,
  PathConstraintData,
  Physics,
  PhysicsConstraintData,
  PhysicsConstraintPose,
  PhysicsConstraintTimeline,
  Property,
  RegionAttachment,
  Skeleton,
  SkeletonJson,
  SliderData,
  TextureAtlas,
  type TextureAtlasRegion,
  type Timeline,
} from '@esotericsoftware/spine-core';
// ⚠️ `src/` reaches outside itself for exactly two modules and this is one of
// them, so it is already on `package.json`'s `files` allowlist — see CLAUDE.md.
// A19 needs the DECODED page, not its header, to measure one region's own
// rectangle on a shared page.
import { readPlate } from '../tools/plate.ts';
import { pageFootprint } from './atlas.ts';
import {
  surveyDeformKeys,
  unreachableWhy,
  type DeformDialDispute,
  type DeformDialTie,
  type DeformReach,
  type DialSpan,
} from './deformmeasure.ts';
import { colourTypeName, readPngInfo } from './png.ts';
import {
  CHANNELS_BY_KIND,
  KEY_TIME_EPSILON,
  PHYSICS_POSE_RULES,
  physicsKeyRefusal,
  physicsRuleFor,
  walkTimelines,
} from './timelines.ts';
import type { RigInfo } from './types.ts';

export interface Failure {
  assertion: string;
  detail: string;
}

/**
 * Which body of rules to hold the artifact to.
 *
 * ⭐ The distinction this draws is the difference between "wrong" and "not how we
 * do it here", and conflating the two is how a validator stops being usable on
 * anybody else's data. Fifteen of the 40 assertions are policy — seven for one
 * renderer (`spine-html`) and one project's canvas budget, eight for rigc's own
 * formations — and every one of them fires
 * on real, correct, editor-produced Spine data — the official example projects
 * carry clipping attachments, unweighted meshes, 116-triangle meshes and packed
 * atlases, all of which are perfectly valid and none of which spine-html likes.
 *
 * - `spine`      — is this valid Spine 4.3 that any runtime will play correctly?
 * - `spine-html` — the above, plus this project's renderer and archetype policy.
 *
 * ⚠️ `validate()` has NO default profile — `ValidateInput.profile` is required,
 * and that is deliberate. A silent default here can only be wrong in one of two
 * directions: loosen it and a caller who did not ask gets a weaker gate than the
 * one they think they ran; tighten it and foreign data is refused by a policy the
 * caller has no stake in. Issue #221 flipped the CLI to `spine` while several
 * internal callers still wanted `spine-html`, at which point one constant could
 * no longer honestly serve both — so the choice is made at every call site now,
 * by the caller who knows which question they are asking.
 */
export type ValidateProfile = 'spine' | 'spine-html';

export const VALIDATE_PROFILES: readonly ValidateProfile[] = ['spine', 'spine-html'];

/**
 * What the CLI uses when `--profile` is absent — and ONLY the CLI. This is not
 * `validate()`'s default; that function has none (above).
 *
 * `spine` since issue #221. The published package's pitch is "the output imports
 * into the Spine editor", which is exactly the question `spine` asks, and a
 * stranger's first build was being judged instead against one renderer's policy
 * and one project's canvas budget — 14 rules they have no stake in, with the
 * escape hatch documented only in prose. Defaults beat prose. `spine-html` is
 * still one flag away, and every report names the profile that judged it.
 */
export const CLI_DEFAULT_PROFILE: ValidateProfile = 'spine';

/**
 * What kind of rule each assertion is. Every assertion has an entry, and
 * `check()` throws on a name that has none — a new assertion must state its kind
 * rather than defaulting into one, because the default would decide, silently,
 * whether it runs on foreign data.
 *
 *   validity  — the file is wrong for any consumer. Runs under every profile.
 *   renderer  — valid Spine that this project's renderer or frame budget refuses.
 *   archetype — a structural rule about rigc's own formations, meaningless to a
 *               skeleton rigc did not compile.
 *
 * Two assertions are MIXED and are marked `validity` here because their
 * validity half must never stop running; their policy clauses are gated inside
 * the assertion body against `profile`, and each such clause says so where it
 * lives. They are A06 (size-vs-PNG is validity; pma / rotation / full-page
 * coverage are policy) and A20 (weight coherence is validity; requiring a mesh
 * to be weighted at all is policy).
 *
 * A08 was the third until issue #574 retired its policy clause. It required a
 * skin entry's placeholder to be spelled like the region it resolves to, under
 * a renderer that resolves art by `path` and has never read a placeholder — so
 * restating it as the renderer's own join made it a tautology over the validity
 * half. The argument, with the renderer lines it is measured against, sits above
 * `check('A08_…')`.
 */
const ASSERTION_KIND: Record<string, 'validity' | 'renderer' | 'archetype'> = {
  A00_ROUNDTRIP_PARSE: 'validity',
  A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS: 'validity',
  A02_NO_BONE_TRANSFORM_KEY: 'validity',
  A03_REGION_WIDTH_HEIGHT_FINITE: 'validity',
  A04_MESH_TRIANGLES_AND_ENCODING: 'validity',
  A05_CURVE_ARRAY_LENGTH: 'validity',
  A06_ATLAS_PAGE_SIZE_MATCHES_PNG: 'validity', // mixed — see above
  A07_ATLAS_TEXT_SHAPE: 'validity',
  A08_REGION_NAMES_MATCH_ATTACHMENTS: 'validity', // no longer mixed — see above (#574)
  A09_ANIMATION_DURATION_MATCHES_SPEC: 'validity',
  A10_NO_NAN_AFTER_STEPPING: 'validity',
  A11_NO_CLIPPING_ATTACHMENTS: 'renderer',
  A12_NO_DARK_COLOR: 'renderer',
  A13_MESH_BUDGET: 'renderer',
  A14_NO_FULL_FRAME_MESH: 'renderer',
  A15_IDLE_NO_MESH_BONE_KEYS: 'renderer',
  A16_SKELETON_VERSION_4_3: 'validity',
  A17_ATLAS_PAGE_FILES_EXIST: 'validity',
  A18_DETERMINISTIC_EMIT: 'validity',
  A19_OVERLAY_PNGS_HAVE_ALPHA: 'renderer',
  A20_MESH_WEIGHTS_COHERENT: 'validity', // mixed — see above
  A21_MESH_RIM_PINNED: 'archetype',
  A22_MESH_UVS_IN_UNIT_RANGE: 'validity',
  A23_PHYSICS_CONSTRAINT_EFFECTIVE: 'validity',
  A24_AXIS_SPACE_STROKE: 'archetype',
  A25_DETACHED_BONE_PARENTAGE: 'archetype',
  A26_SLOT_DRAW_ORDER: 'archetype',
  A27_REGION_NAME_MATCHES_PAGE_FILENAME: 'renderer',
  A28_RIBBON_ROWS_SHARE_WEIGHTS: 'archetype',
  A29_STROKE_WITHIN_CONTACT_DEPTH: 'archetype',
  A30_STROKE_WITHIN_CAP_CONTAINMENT: 'archetype',
  A31_DRAW_ORDER_OFFSETS_RESOLVE: 'validity',
  A32_EVENT_KEYS_RESOLVE: 'validity',
  A33_VERTEX_ATTACHMENT_GEOMETRY: 'validity',
  A34_CONSTRAINT_TIMELINE_TARGETS: 'validity',
  A35_DEFORM_KEYS_FIT_THE_ATTACHMENT: 'validity',
  A36_PATH_CONSTRAINT_EFFECTIVE: 'validity',
  A37_SLIDER_CONSTRAINT_EFFECTIVE: 'validity',
  A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED: 'validity',
  A39_DEFORM_KEEPS_TRIANGLE_WINDING: 'archetype',
  A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET: 'validity',
  A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP: 'validity',
  A42_DRIVEN_SLIDERS_UPDATE_AFTER_THEIR_DRIVER: 'validity',
};

/**
 * Every assertion this validator knows, in registry order.
 *
 * Exported so a control can count them instead of quoting a number that goes
 * stale the next time one is added — two selftest cases used to assert `39` and
 * `14` as literals, which is a guardrail that has to be remembered rather than
 * one that holds.
 */
export const ASSERTION_NAMES: readonly string[] = Object.keys(ASSERTION_KIND);

/** How many assertions this profile applies, by the kinds it carries. */
export function assertionCountForProfile(profile: ValidateProfile): number {
  if (profile === 'spine-html') return ASSERTION_NAMES.length;
  return ASSERTION_NAMES.filter((name) => ASSERTION_KIND[name] === 'validity').length;
}

/**
 * What a SKIP says when `A00_ROUNDTRIP_PARSE` handed an assertion nothing to
 * look at.
 *
 * Two of them rather than one, because what an assertion was denied is the whole
 * content of its SKIP: `A20` wanted the loaded skeleton and `A06` wanted the
 * loaded atlas, and a reader who is told which can tell a rule that is waiting
 * on the parse from one that is waiting on the art. Both point at A00 instead of
 * restating its detail, which the FAIL row prints in full.
 *
 * Exported so a control compares against them rather than quoting them — the
 * same reason `ASSERTION_NAMES` is exported.
 */
export const SKIP_NO_SKELETON = 'the round trip did not produce a skeleton to measure (A00 owns that failure)';
export const SKIP_NO_ATLAS = 'the round trip did not produce an atlas to measure (A00 owns that failure)';
/**
 * The third of them, and it is NOT waiting on A00 (issue #608): the atlas parsed
 * and it has no pages, which is what a compile that measured no art writes. The
 * four rules whose only subject is a page — A06, A17, A19, A27 — have nothing to
 * look at, and an empty loop walking out of `check()` is reported as a PASS.
 */
/*
 * **An empty subject list: SKIP or PASS, and which one is derived (issue #580).**
 *
 * `check()` records a pass when a body runs to its end without a `fail()` or a
 * `skip()`, so a body whose main construct is a loop over a list that is EMPTY
 * passes having measured nothing — the vacuous green one ring out from the bare
 * `return` guards issue #568 converted. Two different things can be true of such
 * a loop, and the criterion decides between them by reading the rule's own name
 * and its `fail()` sentences rather than by preference:
 *
 *   * A name of the form ⟨subject⟩_⟨property⟩ — `REGION_WIDTH_HEIGHT_FINITE`,
 *     `MESH_TRIANGLES_AND_ENCODING`, `PHYSICS_CONSTRAINT_EFFECTIVE`,
 *     `ATLAS_PAGE_SIZE_MATCHES_PNG` — quantifies over the subject it names, and
 *     its `fail()` names a member of that subject, the value found and the value
 *     required. With no member, nothing was measured: it **SKIPs**, and the
 *     reason names the subject that was absent.
 *   * A name of the form NO_⟨construct⟩ — `NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS`,
 *     `NO_BONE_TRANSFORM_KEY`, `NO_CLIPPING_ATTACHMENTS`, `NO_DARK_COLOR`,
 *     `NO_FULL_FRAME_MESH` — quantifies over occurrences of something a correct
 *     artifact has NONE of, and its `fail()` reports that the construct is
 *     present rather than measuring a value on it. Zero occurrences IS the
 *     measurement, so it **PASSes**: the loop is a search of the artifact, and
 *     the artifact is what it measured.
 *   * A name carrying both halves takes each at its word.
 *     `A15_IDLE_NO_MESH_BONE_KEYS` is the pattern and already reads this way: no
 *     `idle` animation, or an `idle` with no bone timeline, is the named subject
 *     absent and SKIPs; no mesh-driving bone among the bones `idle` does key is
 *     the construct absent and passes. `A10_NO_NAN_AFTER_STEPPING` is the same
 *     shape — the stepping is per animation, so a skeleton with none has not
 *     been stepped.
 *   * An assertion with more than one clause SKIPs only when EVERY clause had
 *     nothing to measure, which is the shape `A09`, `A33` and `A38` already
 *     carry (`polygons.length === 0 && endsChecked === 0`). `A13_MESH_BUDGET` is
 *     why the clause is stated: a declared slot budget is measured against a
 *     count of mesh slots, and zero is a count, so that half passes on a rig
 *     with no mesh — while a rig that declares only a TRIANGLE budget has
 *     nothing left to measure and skips.
 *
 * ⚠️ What the criterion is not allowed to become is a table of assertions with
 * their verdicts written beside them. Every row above is decided by reading the
 * name and the sentences the assertion already prints, so a rule added tomorrow
 * is decided by the same reading and nobody re-opens this question.
 */

/**
 * What a SKIP says when the artifact carries no member of the subject a rule
 * quantifies over (issue #580), by subject.
 *
 * One constant per SUBJECT rather than one per assertion, for the reason the two
 * above are two: what the rule was denied is the whole content of its SKIP, and
 * three rules denied the same thing should say so in the same words. Exported so
 * a control compares against them rather than quoting them.
 */
export const SKIP_NO_REGION_ATTACHMENT = 'the skeleton carries no region attachment';
export const SKIP_NO_MESH_ATTACHMENT = 'the skeleton carries no mesh attachment';
export const SKIP_NO_ANIMATION = 'the skeleton carries no animation';
export const SKIP_NO_TIMELINE = 'no animation here carries a timeline';
export const SKIP_NO_PHYSICS_CONSTRAINT = 'the skeleton declares no physics constraint';
export const SKIP_NO_ATLAS_PAGE = 'the atlas declares no page';
export const SKIP_NO_ATLAS_REGION = 'the atlas declares no region';
export const SKIP_NO_ATTACHMENT_REGION_JOIN =
  'no attachment names a region and the atlas declares none, so there is no attachment-to-region join to hold';
/**
 * A09's, which predates this list and joins it rather than being rewritten: it
 * is the same fact about the same subject, and a control that compares against
 * eight constants and quotes the ninth is a control with a hand-kept exception
 * in it.
 */
export const SKIP_NO_DECLARED_DURATION =
  'the motion spec declares no animations and the skeleton has none — a static rig has no duration to compare';

export interface ValidateInput {
  skeletonText: string;
  atlasText: string;
  /** Directory the atlas lives in; page names resolve against it. */
  atlasDir: string;
  /** Declared durations from the motion spec. */
  declaredDurations?: Record<string, number>;
  /** Re-emitted artifacts, for the determinism check. */
  reEmit?: { skeletonText: string; atlasText: string };
  /**
   * Structural expectations the artifact cannot state about itself: which mesh is
   * a ribbon, which bone carries the axis, which parentage is forbidden, what the
   * canonical draw order is. Absent when `validate <dir>` is pointed at a bare
   * directory, and the assertions that need it then SKIP rather than guess — the
   * stats line says `rig=absent` so a green run cannot be mistaken for a full one.
   */
  rig?: RigInfo;
  /**
   * Which body of rules to apply. Required, and deliberately so — there is no
   * default to fall into. See ValidateProfile.
   */
  profile: ValidateProfile;
}

export interface ValidateReport {
  failures: Failure[];
  /** Assertions that ran and passed, in order. */
  passed: string[];
  /**
   * Assertions that had no data to run against, with the reason.
   *
   * ⚠️ Not cosmetic. An assertion whose subject is a per-cut MEASUREMENT (a
   * contact depth, a containment ceiling) is vacuous on a cut that never measured
   * one, and reporting that as PASS is this project's favourite false green: a
   * gate that says it checked something it never looked at. So the report says
   * SKIP and why, and `passed` does not count it.
   */
  skipped: Array<{ assertion: string; reason: string }>;
  /** Which body of rules ran. */
  profile: ValidateProfile;
  /**
   * Assertions this profile does not apply, with their kind.
   *
   * Kept separate from `skipped` on purpose: a SKIP means "there was nothing to
   * look at", a profile skip means "this rule was deliberately out of scope".
   * Reading a `--profile spine` green as though the renderer policy had passed
   * is exactly the misreading the two lists exist to prevent.
   */
  profileSkipped: Array<{ assertion: string; kind: 'renderer' | 'archetype' }>;
  stats: Record<string, number | string>;
}

/**
 * The clause A39 puts after an animation's name when the frame it measured is
 * not the track (issue #407).
 *
 * Empty on the track, which is what every animation no slider applies gets — so
 * a message about a rig with no sliders in it reads exactly as it always has.
 */
function frameClause(reach: DeformReach): string {
  return reach.kind === 'slider' ? ` (applied by slider "${reach.slider}", not played on a track)` : '';
}

/**
 * A dial's reach as A39's stats line spells it, or `none` when it can select no
 * part of its animation at all.
 *
 * Six decimals because a key time has six: a reach whose end is printed coarser
 * than the times it is compared against cannot be read against them.
 */
function dialSpanText(span: DialSpan | null): string {
  return span === null ? 'none' : `${span.lo.toFixed(6)}..${span.hi.toFixed(6)}s`;
}

/**
 * One disputed dial on A39's stats line — both answers, both reaches, and the
 * frames the artifact's answer could not have posed (issue #427).
 *
 * ⭐ **`outside:` is always there, `none` included.** The comparison it reports is
 * what decides whether a disagreement changed anything the survey measured, and a
 * comparison that came out equal must not look like one nobody made. It is the
 * difference between "both answers pose the same frames, so the disagreement is a
 * fact about rigc and not about this rig" and "these key times were surveyed
 * through a field the skeleton does not name and no settable value of the one it
 * does reaches them".
 *
 * ⚠️ No spaces anywhere in it: the stats line is `k=v` pairs joined by spaces, and
 * a value with a space in it turns one reading into two.
 */
function dialDisputeText(dispute: DeformDialDispute): string {
  const stated = dispute.statedResponse === null ? 'unmeasured' : dispute.statedResponse.toExponential(3);
  return (
    `${dispute.slider}|artifact:${dispute.bone}.${dispute.stated}@${stated}` +
    `|reaches:${dialSpanText(dispute.statedReach)}` +
    `|probe:${dispute.bone}.${dispute.drive}@${dispute.driveResponse.toExponential(3)}` +
    `|reaches:${dialSpanText(dispute.driveReach)}` +
    `|outside:${dispute.outside.length === 0 ? 'none' : dispute.outside.map((t) => `${t.toFixed(6)}s`).join('+')}`
  );
}

/** One tied dial on the same line, in the shape that cannot be read as a dispute. */
function dialTieText(tie: DeformDialTie): string {
  const rivals = tie.rivals.map((r) => `${tie.bone}.${r.field}@${r.response.toExponential(3)}`).join('+');
  return `${tie.slider}|artifact:${tie.bone}.${tie.drive}@${tie.driveResponse.toExponential(3)}|tied:${rivals}`;
}

const FRAME = 1 / 60;
const STEP_FRAMES = 120;

/**
 * The constraint groups that spell `group.<constraint>.<timeline>` — a
 * constraint name, then named timelines under it (A34's second shape).
 *
 * A constant rather than a literal in the loop because the same three names
 * have to pick the timeline vocabulary out of `CHANNELS_BY_KIND` for A34's
 * message, and a group listed in one place and not the other is a group whose
 * constraint nobody resolves. `ik` and `transform` are the other shape — one
 * unnamed timeline per constraint — and are enumerated separately there.
 */
const NAMED_TIMELINE_GROUPS = ['path', 'physics', 'slider'] as const;

/**
 * Every component a physics constraint can drive (`PhysicsConstraintData`), and
 * the subset the **Spine editor** models.
 *
 * ⭐ One list, read by both A23 and A41, because the relationship between those
 * two rules is the thing most worth keeping true: A23 fires when the driven set
 * is EMPTY, A41 when it contains something outside `EDITOR_PHYSICS_COMPONENTS`.
 * Written against one array those conditions cannot both hold on one constraint,
 * and a reader can see that they cannot. Two copies of the vocabulary could
 * drift into overlapping, and a rig refused twice for one fact is a report that
 * has stopped saying what is wrong with it.
 *
 * 📏 The subset is measured rather than read off a document, and it is the whole
 * of issue #540: three rigs, twelve constraints, predictions recorded before the
 * round trip and scored by the code that printed them. A lone `y` came back, `x`
 * and `y` together came back — so the rule is membership and not arity — and a
 * lone `rotate`, a lone `scaleX` and a lone `shearX` each came back driving no
 * component at all, with neither `scaleY` mode rescuing `scaleX`. Every
 * constraint carried a fixed-point `strength` and all twelve returned exactly,
 * so the rows that reported nothing were reading live data. Measured on Spine
 * 4.3.26 Professional.
 */
const PHYSICS_COMPONENTS = ['x', 'y', 'rotate', 'scaleX', 'shearX'] as const;
const EDITOR_PHYSICS_COMPONENTS: ReadonlySet<(typeof PHYSICS_COMPONENTS)[number]> = new Set(['x', 'y'] as const);

/**
 * What A23 says about a SETUP pose outside its bound, per property.
 *
 * The predicate lives in `PHYSICS_POSE_RULES` and the sentence lives here, and
 * the split is deliberate: the predicate is the thing the compiler and this file
 * must not disagree about, while the sentence names what happens to THIS rig —
 * "it is muted", "nothing pulls it back" — which is what the author acts on and
 * is worth nothing to a compiler refusing a key. `PHYSICS_POSE_RULES` is the
 * index, so a rule added there with no sentence here fails to type-check rather
 * than printing `undefined`.
 */
const SETUP_POSE_SAYS: Record<string, (pose: PhysicsConstraintPose) => string> = {
  mix: (pose) => `has mix ${pose.mix}; it is muted`,
  mass: (pose) => `has massInverse ${pose.massInverse} (mass must be > 0)`,
  strength: (pose) => `has strength ${pose.strength}; nothing pulls it back`,
  damping: (pose) => `has damping ${pose.damping}; outside (0,1) it never settles`,
};

/**
 * The skeleton-JSON name of each physics timeline, keyed by the runtime's own
 * `Property` id.
 *
 * ⚠️ Derived from the enum rather than from `timeline instanceof
 * PhysicsConstraintMassTimeline` and rather than from a list of digits: the ids
 * are what `ConstraintTimeline1` puts in its propertyId (`<Property>|<index>`),
 * and a renumbering of the enum moves both sides of this map at once. The names
 * on the right are the ones `SkeletonJson`'s physics branch reads
 * (`SkeletonJson.js:1063-1094`), which is also what a motion spec's `property`
 * says.
 */
export const PHYSICS_TIMELINE_NAMES: Record<number, string> = {
  [Property.physicsConstraintInertia]: 'inertia',
  [Property.physicsConstraintStrength]: 'strength',
  [Property.physicsConstraintDamping]: 'damping',
  [Property.physicsConstraintMass]: 'mass',
  [Property.physicsConstraintWind]: 'wind',
  [Property.physicsConstraintGravity]: 'gravity',
  [Property.physicsConstraintMix]: 'mix',
};

/**
 * One step of the **float32** grid at `t`, which is the grid a loaded key time
 * actually sits on: `spine-core` reads every timeline's frames into a
 * `Float32Array`, so a time the compiler wrote as `32.366667` comes back as
 * `32.366668701171875`.
 *
 * A09 needs this and the compiler does not, and that asymmetry is the reason it
 * is a function rather than a constant. `KEY_TIME_EPSILON` is fixed because the
 * compiler's own grid is fixed — `r6` puts every key time on 1e-6 s at any
 * magnitude. A float32 step is not: 4.8e-7 s at 5 s, 3.8e-6 s at 32 s. Adding a
 * flat epsilon to a comparison against a value that has been through float32
 * would fail correct data for being long — 971 frames at 30 fps keyed exactly on
 * its own declared duration arrives 2.0e-6 s late, twice the whole epsilon.
 *
 * The spacing of a normal float is 2^(exponent − 23), and `Math.log2` recovers
 * the exponent. Zero takes the guard — a named empty animation declares
 * `duration: 0` and A09 does compare it — and the magnitude is taken first, so a
 * sign never reaches `log2`.
 */
function float32Step(t: number): number {
  const magnitude = Math.abs(t);
  if (!Number.isFinite(magnitude) || magnitude === 0) return 0;
  return 2 ** (Math.floor(Math.log2(magnitude)) - 23);
}

/**
 * `4.3`, `4.3.<patch>`, or `4.3.<patch>-<suffix>` — the last of which is what the
 * Spine editor writes for a pre-release (`"4.3.75-beta"` in all twelve official
 * example exports). The major/minor pair is the load-bearing part; see A16.
 */
const SPINE_4_3_VERSION = /^4\.3(\.\d+(-[0-9A-Za-z][0-9A-Za-z.+-]*)?)?$/;

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The atlas region names one raw skin entry will make the loader look up — or
 * `null` when the file states a sequence this walk cannot predict.
 *
 * ⚠️ Transcribed from the loader rather than reasoned out, because a join that
 * merely looks right is the thing A08 exists to refuse. `readSequence`
 * (`dist/SkeletonJson.js:641-649`) turns an absent or null `sequence` into
 * `new Sequence(1, false)` — one lookup, at the bare path — and a present one
 * into `new Sequence(count ?? 0, true)`, so a sequence map with no `count`
 * looks up nothing at all. `Sequence.getPath` (`dist/Sequence.js:124-132`)
 * appends `start + i`, left-padded with zeros to `digits`.
 *
 * Nothing in `examples/` carries a `sequence` (measured: 0 occurrences across
 * all twelve editor exports), so without this the assertion would have read a
 * sequence's base path as a region name and refused correct foreign data —
 * `A21_MESH_RIM_PINNED`'s old `|| 'ring'` default, one file over.
 */
function attachmentRegionLookups(sequence: unknown, path: string): string[] | null {
  if (sequence === undefined || sequence === null) return [path];
  if (!isObj(sequence)) return null;
  const whole = (value: unknown, fallback: number): number | null => {
    if (value === undefined) return fallback;
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
  };
  const count = whole(sequence.count, 0);
  const start = whole(sequence.start, 1);
  const digits = whole(sequence.digits, 0);
  if (count === null || start === null || digits === null || count < 0) return null;
  const lookups: string[] = [];
  for (let i = 0; i < count; i++) {
    const frame = String(start + i);
    lookups.push(`${path}${'0'.repeat(Math.max(0, digits - frame.length))}${frame}`);
  }
  return lookups;
}

/** One skin entry's join onto the atlas, as the loader will perform it. */
export interface AttachmentRegionJoin {
  skin: string;
  slot: string;
  placeholder: string;
  /** The attachment's own name — the entry's `name` when it states one, else the placeholder. */
  name: string;
  /**
   * Every atlas region name the loader will ask this atlas for, in the order it
   * asks. Empty for a `sequence` with no `count`, and `null` for a sequence map
   * this walk will not guess at.
   */
  lookups: string[] | null;
}

/**
 * Every atlas-region lookup `AtlasAttachmentLoader` will perform, read off the
 * RAW skeleton JSON — before the loader is asked, which is the whole point.
 *
 * 🚨 This is a SECOND implementation of a join `spine-core` already performs,
 * and the tree's standing judgment about a second opinion on somebody else's
 * format is that it is measured rather than asserted: `PS127` runs the loader
 * with its `findRegion` recording what it asked for, and compares. A wrong walk
 * here would refuse correct foreign data by name, which is the one failure that
 * would be worse than the silence #589 removed.
 *
 * Which entries resolve a region is the parser's list, not a guess:
 * `SkeletonJson.readAttachment` (`dist/SkeletonJson.js:524-575`) calls the
 * loader with a path for `region`, `mesh` and `linkedmesh` — a linked mesh
 * resolves its own region before the `source` branch — and for nothing else.
 * `type` defaults to `region` (`:527`), `name` to the placeholder (`:526`) and
 * `path` to the name (`:529`, `:560`): three names that default into one
 * another, which is why a report printing only the last of them cannot say
 * what to change.
 */
export function attachmentRegionJoins(raw: unknown): AttachmentRegionJoin[] {
  const joins: AttachmentRegionJoin[] = [];
  if (!isObj(raw) || !Array.isArray(raw.skins)) return joins;
  for (const skin of raw.skins as unknown[]) {
    if (!isObj(skin) || !isObj(skin.attachments)) continue;
    const skinName = typeof skin.name === 'string' ? skin.name : '(unnamed)';
    for (const [slot, entries] of Object.entries(skin.attachments)) {
      if (!isObj(entries)) continue;
      for (const [placeholder, entry] of Object.entries(entries)) {
        if (!isObj(entry)) continue;
        const type = entry.type === undefined ? 'region' : entry.type;
        if (type !== 'region' && type !== 'mesh' && type !== 'linkedmesh') continue;
        const name = typeof entry.name === 'string' ? entry.name : placeholder;
        const path = typeof entry.path === 'string' ? entry.path : name;
        joins.push({ skin: skinName, slot, placeholder, name, lookups: attachmentRegionLookups(entry.sequence, path) });
      }
    }
  }
  return joins;
}

/**
 * How long the array a deform key edits is, read off one raw attachment — or
 * `null` when the file does not say.
 *
 * The rule is `readVertices`' own: the attachment's `vertices` is coordinates
 * when its length equals `worldVerticesLength`, and a weight run otherwise. A
 * deform array is therefore one `x, y` pair per **vertex** in the first case and
 * one per **bone influence** (`vertices.length / 3`) in the second — the same
 * count with two different meanings, which is exactly why this measures rather
 * than assumes.
 *
 * `null` for the two shapes that cannot be measured from this object alone: a
 * type with no vertices at all (nothing to deform, and the parser throws on it),
 * and a `linkedmesh`, whose geometry belongs to another attachment.
 */
function deformArrayLength(att: Json): number | null {
  const type = typeof att.type === 'string' ? att.type : 'region';
  let worldVerticesLength: number;
  if (type === 'mesh') {
    if (!Array.isArray(att.uvs)) return null;
    worldVerticesLength = att.uvs.length;
  } else if (type === 'boundingbox' || type === 'clipping' || type === 'path') {
    if (typeof att.vertexCount !== 'number') return null;
    worldVerticesLength = att.vertexCount * 2;
  } else {
    return null;
  }
  if (!Array.isArray(att.vertices)) return null;
  const vertices = att.vertices as unknown[];
  if (vertices.length === worldVerticesLength) return worldVerticesLength;
  // ⚠️ Weighted, and the length is the INFLUENCE COUNT — which is the sum of the
  // per-vertex bone counts, not a division of this array's length. The file
  // holds `boneCount` followed by `boneIndex, x, y, weight` per influence, so a
  // one-bone vertex is FIVE numbers; `readVertices` unpacks that into three
  // numbers per influence, which is where the parser's own `/3*2` comes from and
  // exactly why it cannot be applied to the raw form. Applied here it measured
  // `gallery/flex`'s 77-vertex leaf at 256.667 against its true 154 and put
  // A35's bar two thirds too wide on every weighted mesh — the silence A35
  // exists to break, arriving inside A35.
  //
  // Derived here rather than shared with `src/compile.ts`'s own walk on purpose:
  // the gate re-derives from the emitted file so that it is not checking the
  // compiler's assumptions with the compiler's code. Both had this wrong, which
  // is an argument for a control on each and not for one implementation.
  let influences = 0;
  for (let i = 0; i < vertices.length; ) {
    const n = vertices[i++];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return null;
    influences += n;
    i += n * 4;
    if (i > vertices.length) return null;
  }
  return influences * 2;
}

/**
 * What one timeline's own `apply` does with the `add` argument.
 *
 * - `accumulates` — a second application adds to the first, so two sliders both
 *   `additive` compose on it.
 * - `overwrites` — it writes its value whatever `add` says, so the later slider
 *   owns the property and `"additive": true` is not the repair.
 * - `inert` — applied with the arguments a slider passes it changes nothing a
 *   pose holds, so there is nothing for a second slider to erase.
 */
export type TimelineAddBehaviour = 'accumulates' | 'overwrites' | 'inert';

/**
 * The displacement the second start state carries, chosen to be exact in binary
 * floating point so the probe adds no rounding of its own.
 */
const PROBE_DISPLACEMENT = 0.375;

/** Every own value of a pose object a timeline could have written, as text. */
function poseReading(pose: object): string {
  const parts: string[] = [];
  for (const key of Object.keys(pose).sort()) {
    const value = (pose as Record<string, unknown>)[key];
    if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
      parts.push(`${key}=${String(value)}`);
      continue;
    }
    if (Array.isArray(value)) {
      const entries: unknown[] = value;
      if (entries.every((one) => typeof one === 'number')) parts.push(`${key}=[${entries.join(',')}]`);
      continue;
    }
    if (typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    // A colour, or anything else built only of numbers. Everything with a
    // structure — a bone back-reference, a slot's data — is either an identity
    // (read by name below) or something no timeline writes.
    if (keys.length > 0 && keys.every((one) => typeof record[one] === 'number')) {
      parts.push(`${key}={${keys.map((one) => `${one}:${String(record[one])}`).join(',')}}`);
    } else if (typeof record.name === 'string') {
      parts.push(`${key}=@${record.name}`);
    }
  }
  return parts.join(',');
}

/** The whole of what a timeline could have changed, in one comparable string. */
function skeletonReading(skeleton: Skeleton): string {
  const parts: string[] = [];
  for (const bone of skeleton.bones) parts.push(poseReading(bone.appliedPose));
  for (const slot of skeleton.slots) parts.push(poseReading(slot.appliedPose));
  for (const constraint of skeleton.constraints) parts.push(poseReading(constraint.appliedPose as object));
  parts.push(skeleton.drawOrder.appliedPose.map((slot) => slot.data.name).join('>'));
  return parts.join('|');
}

/**
 * The two start states a probe is taken from, in order: the setup pose, and the
 * setup pose displaced.
 *
 * ⚠️ Both are needed and neither is redundant. From the **setup** pose a
 * `DeformTimeline` is live, because its `apply` is gated on the slot still
 * holding the attachment the timeline names. From the **displaced** pose a
 * timeline whose every key states its target's own setup value is still seen to
 * write, which from the setup pose alone would read as `inert` — a later slider
 * keying a slot's colour to exactly the colour it already has erases an earlier
 * one just the same.
 */
function probeStartStates(skeleton: Skeleton): Array<() => void> {
  return [
    () => undefined,
    () => {
      for (const bone of skeleton.bones) displacePose(bone.appliedPose);
      for (const slot of skeleton.slots) {
        displacePose(slot.appliedPose);
        slot.appliedPose.setAttachment(null);
      }
      for (const constraint of skeleton.constraints) displacePose(constraint.appliedPose as object);
      skeleton.drawOrder.appliedPose.push(...skeleton.drawOrder.appliedPose.splice(0, 1));
    },
  ];
}

/** Move every number a pose holds, so "it wrote nothing" cannot mean "it wrote what was there". */
function displacePose(pose: object): void {
  for (const key of Object.keys(pose)) {
    const value = (pose as Record<string, unknown>)[key];
    if (typeof value === 'number') {
      (pose as Record<string, number>)[key] = value + PROBE_DISPLACEMENT;
      continue;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length > 0 && keys.every((one) => typeof record[one] === 'number')) {
      for (const one of keys) (record as Record<string, number>)[one] += PROBE_DISPLACEMENT;
    }
  }
}

/** Every time the timeline's own frames name, the midpoints between them, and one past the end. */
function probeTimes(timeline: Timeline): number[] {
  const stride = timeline.getFrameEntries();
  const frames = timeline.frames;
  const at: number[] = [];
  for (let i = 0; i < frames.length; i += stride) at.push(frames[i]);
  const between: number[] = [];
  for (let i = 1; i < at.length; i++) between.push((at[i - 1] + at[i]) / 2);
  return [...at, ...between, (at.length ? at[at.length - 1] : 0) + 1];
}

/**
 * 🚨 **What `apply` does with `add`, posed rather than read off a flag.**
 *
 * `Timeline.additive` is the runtime's own declaration that a class "supports
 * being applied additively", and for two classes it is not what the class does:
 * `PathConstraintMixTimeline` and `SliderTimeline` declare `false` and pass the
 * `add` argument straight through anyway. A40 read the flag, so it refused two
 * correct rigs with a sentence about the runtime the runtime does not perform
 * (issue #655, measured by `PS143` over all thirty spellings of the motion
 * vocabulary).
 *
 * So the answer is taken from the object instead. The timeline is applied with
 * exactly the arguments `Slider.update` passes — `firedEvents` null, `alpha` 1,
 * `MixFrom.current`, `appliedPose` true — **twice**, at every time its own
 * frames name. A second application that moves the pose again is a class that
 * honours `add`; one that lands on the same value is a class that writes
 * outright; one that never moves the pose at all writes nothing a second slider
 * could erase, which is what an events timeline under a slider *is*.
 *
 * ⛔ Rejected: reading the source of `apply` (not a measurement of anything, and
 * a class whose body changes under a runtime bump would still read the old
 * answer), and a table of the two disagreeing classes written here (the same
 * hand-kept list this repository has a judgment about — it would have been
 * written after the census found two and been wrong at the third).
 *
 * ⚠️ **The skeleton wears every skin in turn, and that is not thoroughness.**
 * `Skeleton.updateCache` leaves a `skinRequired` constraint inactive under the
 * skins that do not list it, and an inactive target makes ANY timeline read
 * `inert` — a fact about that skin, not about the class. Reading one skin would
 * put a whole class in the third state and quietly stop refusing pairs that
 * share it, which is this repository's worst failure shape: a gate that looks
 * kept while checking nothing. The strongest verdict any skin produces wins.
 */
export function timelineAddBehaviour(data: ReturnType<SkeletonJson['readSkeletonData']>, timeline: Timeline): TimelineAddBehaviour {
  let wrote = false;
  for (const skin of [null, ...data.skins]) {
    const skeleton = new Skeleton(data);
    if (skin !== null) skeleton.setSkin(skin);
    for (const displace of probeStartStates(skeleton)) {
      for (const time of probeTimes(timeline)) {
        skeleton.setupPose();
        for (const bone of skeleton.bones) bone.resetConstrained();
        for (const slot of skeleton.slots) slot.resetConstrained();
        for (const constraint of skeleton.constraints) constraint.resetConstrained();
        skeleton.drawOrder.resetConstrained();
        displace();
        const before = skeletonReading(skeleton);
        timeline.apply(skeleton, time, time, null, 1, MixFrom.current, true, false, true);
        const once = skeletonReading(skeleton);
        timeline.apply(skeleton, time, time, null, 1, MixFrom.current, true, false, true);
        if (skeletonReading(skeleton) !== once) return 'accumulates';
        if (once !== before) wrote = true;
      }
    }
  }
  return wrote ? 'overwrites' : 'inert';
}

export function validate(input: ValidateInput): ValidateReport {
  const failures: Failure[] = [];
  const passed: string[] = [];
  const skipped: ValidateReport['skipped'] = [];
  const profileSkipped: ValidateReport['profileSkipped'] = [];
  const stats: Record<string, number | string> = {};
  const profile = input.profile;
  /** True when this profile's rulebook includes the policy layer. */
  const policy = profile === 'spine-html';

  const fail = (assertion: string, detail: string) => failures.push({ assertion, detail });
  /** Declare that an assertion had nothing to check, and why. */
  const skip = (assertion: string, reason: string) => skipped.push({ assertion, reason });
  /**
   * Run one assertion; record it as passed only if it neither failed nor skipped,
   * and do not run it at all when the profile does not carry that kind of rule.
   *
   * The unknown-assertion throw is deliberate: an assertion with no entry in
   * ASSERTION_KIND would otherwise pick a profile by accident, and picking wrong
   * means either a rule that never runs or a rule that fires on everybody's data.
   *
   * The body's return value is handed back — `undefined` when the assertion did
   * not run or threw. Only A00 uses it, and it uses it so that the loaded atlas
   * and skeleton can be `const`: assigning them from inside this callback leaves
   * the type checker unable to see that they were ever set, and every later read
   * of `atlas.pages` or `data.bones` becomes a property of `never`.
   */
  const check = <T>(assertion: string, body: () => T): T | undefined => {
    const kind = ASSERTION_KIND[assertion];
    if (!kind) throw new Error(`validate: assertion "${assertion}" has no ASSERTION_KIND entry`);
    if (kind !== 'validity' && !policy) {
      profileSkipped.push({ assertion, kind });
      return undefined;
    }
    const before = failures.length;
    const skippedBefore = skipped.length;
    let result: T | undefined;
    try {
      result = body();
    } catch (err) {
      fail(assertion, `threw: ${(err as Error).message}`);
    }
    if (failures.length === before && skipped.length === skippedBefore) passed.push(assertion);
    return result;
  };

  // -------------------------------------------------------------------------
  // Raw text / raw JSON assertions (they must run even if the parser is happy)
  // -------------------------------------------------------------------------

  let raw: Json | null = null;
  try {
    raw = JSON.parse(input.skeletonText) as Json;
  } catch (err) {
    fail('A00_ROUNDTRIP_PARSE', `skeleton JSON is not parseable: ${(err as Error).message}`);
  }

  // --- A07: atlas text shape ------------------------------------------------
  // Two traps, both measured: a region name is the RAW
  // line (only the page name is trimmed), and a blank line closes the page
  // block, so a blank line between a page header and its regions turns the
  // regions into pages.
  //
  // 🚨 Both traps are about a page BLOCK, and an atlas can honestly have none
  // (issue #608). A rig whose skins fill no slot with anything that needs art —
  // a hit-box skeleton carrying only a `boundingbox`, a clipping polygon, a
  // path — measures no pages, and `writeAtlasText` now spells that as the empty
  // file. Before this skip existed the walk below read it as one malformed page
  // block and printed two findings whose SUBJECTS DO NOT EXIST: there are no
  // consecutive blank lines in a file with no lines, and no last page block to
  // declare a region. `''.split('\n')` is `['']` rather than `[]`, so a
  // zero-byte atlas and a one-newline atlas both arrived here as a single blank
  // line, and the compiler's own output was refused by name for a shape nobody
  // had written.
  //
  // ⇒ Nothing to measure is a SKIP, and the sibling rule already settled this
  // for the same file: A08 skips with "this atlas declares no region and the
  // skeleton names no attachment that resolves through one". The protection is
  // not lost, because the case where an empty atlas MATTERS is an attachment
  // that wanted a region, and that is A08's failure by name (measured: a spec
  // built with `ingest --art none` and no `--atlas-in` fails A08 twice and A00
  // once, each naming the skin, the slot and the placeholder).
  const atlasLines = input.atlasText.replace(/\n$/, '').split('\n');
  const atlasPageLines = atlasLines.filter((line) => line.trim().length > 0).length;
  check('A07_ATLAS_TEXT_SHAPE', () => {
    if (atlasPageLines === 0) {
      // One of the exported reason constants, not a sentence of its own: the
      // static-rig suite's arithmetic (S50, #580) counts a rule as skipped
      // for want of a SUBJECT only when its reason is one of those constants.
      return skip('A07_ATLAS_TEXT_SHAPE', SKIP_NO_ATLAS_PAGE);
    }
    let expectPage = true;
    let sawRegionForPage = false;
    for (let i = 0; i < atlasLines.length; i++) {
      const line = atlasLines[i];
      if (line.trim().length === 0) {
        if (expectPage) fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: consecutive blank lines`);
        else if (!sawRegionForPage) {
          fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: blank line before this page had any region`);
        }
        expectPage = true;
        sawRegionForPage = false;
        continue;
      }
      if (expectPage) {
        expectPage = false;
        continue; // page name line
      }
      if (line.includes(':')) continue; // key: value line
      // A bare non-key line is a region name, and it is used untrimmed.
      if (line !== line.trim()) {
        fail('A07_ATLAS_TEXT_SHAPE', `line ${i + 1}: region name has stray whitespace: ${JSON.stringify(line)}`);
      }
      sawRegionForPage = true;
    }
    if (!sawRegionForPage && atlasLines.length) {
      fail('A07_ATLAS_TEXT_SHAPE', 'the last page block declares no region');
    }
  });

  // --- A08: every attachment path resolves to a region the atlas has -------
  //
  // 🚨 This runs on the RAW file, before the round trip, and that placement is
  // the whole of issue #589. Two of the three clauses below used to sit behind
  // A00 and could not be reached by any input: `lookup` was the path spine-core
  // had already resolved, and `AtlasAttachmentLoader.findRegion`
  // (`dist/AtlasAttachmentLoader.js:55-59`) throws
  // `Region not found in atlas: <path> (attachment: <name>)` for a path naming
  // no region and for one padded with whitespace alike, so the skeleton never
  // finished loading and A08's body never ran. Measured on three weakenings of
  // `examples/spineboy` × both profiles: every one printed A00 FAIL and A08
  // SKIP. An assertion that names the defect only when the defect is absent is
  // the silence this tool exists to convert.
  //
  // ⇒ The join is re-derived here from the raw JSON, where it is visible before
  // the loader is asked, so the miss is refused by its own sentence naming the
  // attachment, the placeholder and the path as THREE THINGS. The loader's
  // message names none of them: `(attachment: crosshair)` is the attachment's
  // `name`, never the placeholder or the skin, it never says which of the two
  // files moved, and for a padded path it prints the string unquoted —
  // `Region not found in atlas:  crosshair  (attachment: crosshair)` — where the
  // defect is literally invisible. `JSON.stringify` below is why A08 can show it.
  //
  // 🔒 The round trip is NOT suppressed by any of this, and that is deliberate:
  // it is the oracle, and gating it on rigc's own re-derivation would mean a
  // wrong join here could silence the parser rigc did not write. Because it
  // still runs, the two are a permanent two-sided cross-check — A08 refusing a
  // path A00 then loads, or A00 throwing `Region not found` over a green A08,
  // is a visible contradiction in one report. What A00 does instead of throwing
  // twice about one fact is defer: see its own body.
  //
  // 🗑️ A08 used to be MIXED: the join is validity, and a second clause gated on
  // `spine-html` required the skin entry's PLACEHOLDER to be spelled exactly
  // like the region it resolves to ("v0 requires them identical"). That clause
  // is retired (issue #574), and the reason is that the renderer it was profiled
  // under never performed the join it described.
  //
  // `spine-html@0.4.1` resolves art in two steps and the placeholder is in
  // neither. `DomTexture.js:78,102` builds the image map with
  // `put(atlasRegion.name, …)` over every region of the atlas, and
  // `SpineHtmlRenderer.js:172` reads it back as
  // `const regionImage = region && this.regionImages.get(region.name)`, where
  // `region` came off the attachment — which `AtlasAttachmentLoader` resolved
  // through `path`. Every published version of that renderer keys the same way
  // (checked 0.1.0 through 0.4.1, the whole series). Nothing in it reads an
  // attachment's name, let alone its placeholder.
  //
  // ⚠️ It was not merely inert, either: it refused rigs on both sides of the
  // convention it was written for. `path` exists precisely so a placeholder
  // may differ from the PNG basename (R5), and since issue #567 a placeholder
  // two named skins share is emitted as `<skin>/<placeholder>` with `path`
  // restated to the basename — the only spelling the Spine editor holds. Under
  // the old clause that shape, and any rig that merely named a part something
  // other than its placeholder, was red under `spine-html` while the editor
  // imported it and the renderer drew it.
  /**
   * Every attachment path A08 refused because the atlas holds no region of that
   * name — which is exactly the set `AtlasAttachmentLoader.findRegion` throws
   * on. A00 reads it so that its own row can point at A08 rather than restate
   * the miss in the loader's poorer words.
   */
  const pathsWithNoRegion = new Set<string>();
  check('A08_REGION_NAMES_MATCH_ATTACHMENTS', () => {
    let regionNames: Set<string>;
    try {
      regionNames = new Set(new TextureAtlas(input.atlasText).regions.map((r) => r.name));
    } catch {
      return skip(
        'A08_REGION_NAMES_MATCH_ATTACHMENTS',
        'the atlas text does not parse, so there are no region names to join against (A00 owns that failure)',
      );
    }
    if (!raw) {
      return skip('A08_REGION_NAMES_MATCH_ATTACHMENTS', 'the skeleton JSON did not parse (A00 owns that failure)');
    }
    let joined = 0;
    for (const join of attachmentRegionJoins(raw)) {
      // A `sequence` the walk will not guess at: say nothing rather than invent
      // a region name. A00 still has the last word on it.
      if (join.lookups === null) continue;
      for (const lookup of join.lookups) {
        joined++;
        const at = `skin "${join.skin}" slot "${join.slot}" placeholder "${join.placeholder}"`;
        const present = regionNames.has(lookup);
        if (!present) pathsWithNoRegion.add(lookup);
        if (lookup !== lookup.trim()) {
          fail(
            'A08_REGION_NAMES_MATCH_ATTACHMENTS',
            `${at}: attachment "${join.name}" resolves through path ${JSON.stringify(lookup)}, which has stray ` +
              `whitespace — the atlas is matched on the exact string, and ${
                present
                  ? 'the region it finds carries the same padding'
                  : regionNames.has(lookup.trim())
                    ? `the region this atlas has is ${JSON.stringify(lookup.trim())}, without it`
                    : 'no region of this atlas carries it'
              }`,
          );
        } else if (!present) {
          // Not a guess and not a repair — a region the atlas DOES hold that
          // differs from the wanted name only by case or padding. It is
          // reported because it was measured, and where there is none the
          // sentence says nothing at all.
          const near = [...regionNames].find((r) => r.trim().toLowerCase() === lookup.toLowerCase());
          fail(
            'A08_REGION_NAMES_MATCH_ATTACHMENTS',
            `${at}: attachment "${join.name}" wants region "${lookup}", which this atlas does not have${
              near === undefined ? '' : ` — it does have ${JSON.stringify(near)}`
            }. Either the skeleton's "path" or the atlas region name is the one that moved`,
          );
        }
      }
    }
    for (const region of regionNames) {
      if (region !== region.trim()) {
        fail('A08_REGION_NAMES_MATCH_ATTACHMENTS', `atlas region ${JSON.stringify(region)} has stray whitespace`);
      }
    }
    if (joined === 0 && regionNames.size === 0) {
      return skip('A08_REGION_NAMES_MATCH_ATTACHMENTS', SKIP_NO_ATTACHMENT_REGION_JOIN);
    }
  });

  // --- A31: every draw-order offset lands on a real place -------------------
  //
  // 🚨 This one runs BEFORE the round trip, and with A08 above it that is now
  // two assertions that do so for a reason other than "the parser is happy
  // about it" — A08 because the loader refuses the file before it can name what
  // is wrong with it, this one because the loader does not come back. A draw-order
  // key whose offsets are not in ascending slot order does not load wrong — it
  // does not load at all. `readDrawOrder` (SkeletonJson.ts:1336-1374) walks a
  // forward-only cursor:
  //
  //   while (originalIndex !== index) unchanged[unchangedIndex++] = originalIndex++;
  //
  // and an entry naming an EARLIER slot than the one before it makes that
  // condition unreachable, so the loader spins and grows an array until the
  // process dies. So the check has to happen first, and when it finds that shape
  // the round trip is not attempted at all — reported as such, not as a pass.
  //
  // The other two shapes are the format's usual silence. An offset that puts a
  // slot outside the array writes past the end, leaves a −1 hole in the
  // permutation, and the fill loop reads `unchanged[-1]` — `undefined` where a
  // slot index belongs, with nothing thrown. Two entries for one slot write
  // twice at one cursor position and the first move is simply lost.
  let drawOrderIsUnparseable: string | null = null;
  check('A31_DRAW_ORDER_OFFSETS_RESOLVE', () => {
    if (!raw) return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'the skeleton JSON did not parse (A00 owns that failure)');
    if (!Array.isArray(raw.slots) || !isObj(raw.animations)) {
      return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'the skeleton declares no slots or no animations');
    }
    const slotIndex = new Map<string, number>();
    (raw.slots as unknown[]).forEach((slot, i) => {
      if (isObj(slot) && typeof slot.name === 'string') slotIndex.set(slot.name, i);
    });
    const slotCount = (raw.slots as unknown[]).length;
    let sawATimeline = false;
    for (const [animName, anim] of Object.entries(raw.animations as Json)) {
      if (!isObj(anim) || !Array.isArray(anim.drawOrder)) continue;
      sawATimeline = true;
      (anim.drawOrder as unknown[]).forEach((key, k) => {
        const at = `animation "${animName}" drawOrder key ${k}`;
        if (!isObj(key) || !Array.isArray(key.offsets)) return; // no offsets = setup order
        let previous = -1;
        for (const entry of key.offsets as unknown[]) {
          if (!isObj(entry) || typeof entry.slot !== 'string' || typeof entry.offset !== 'number') {
            fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', `${at}: an offset is not { slot: string, offset: number }`);
            continue;
          }
          const index = slotIndex.get(entry.slot);
          if (index === undefined) {
            fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', `${at}: slot "${entry.slot}" is not in the skeleton`);
            continue;
          }
          if (index <= previous) {
            const detail =
              `${at}: slot "${entry.slot}" is at index ${index}, after an entry at index ${previous} — ` +
              'offsets must be in ascending slot order or the loader never finishes reading them';
            fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', detail);
            drawOrderIsUnparseable ??= detail;
            continue;
          }
          previous = index;
          const landing = index + entry.offset;
          if (!Number.isInteger(entry.offset) || landing < 0 || landing >= slotCount) {
            fail(
              'A31_DRAW_ORDER_OFFSETS_RESOLVE',
              `${at}: slot "${entry.slot}" is at index ${index} and offset ${entry.offset} puts it at ${landing}, ` +
                `outside the ${slotCount} slots`,
            );
          }
        }
      });
    }
    if (!sawATimeline) return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'no animation carries a drawOrder timeline');
  });

  // --- A32: every event key fires a declared event, in order ----------------
  //
  // The event timeline's three failure modes, and only the first is loud:
  //
  //   1. **An undeclared name.** `findEvent` returns null and `readAnimation`
  //      throws `Event not found` (SkeletonJson.ts:1244). A00 would catch it, but
  //      as a parser message about a name with no context; this one says which
  //      animation, which key, and what the skeleton does declare.
  //   2. **Times out of order.** `readAnimation` writes frame `i` from key `i` in
  //      ARRAY order and never sorts, so a decreasing time builds an
  //      `EventTimeline` whose frames run backwards. It loads clean, and the
  //      firings behind the fold simply never come out. Equal times are fine —
  //      two events on one frame is ordinary — so this is non-decreasing.
  //   3. **`volume`/`balance` on a silent event.** `:1254-1257` reads them only
  //      inside `if (event.data.audioPath)`, so on an event with no `audio` they
  //      are two numbers in the file that no runtime will ever read.
  //
  // It runs on the raw JSON rather than on the loaded data because the loaded
  // `Event` no longer remembers which fields the file wrote: an override that was
  // dropped and an override that matched the default are the same object.
  check('A32_EVENT_KEYS_RESOLVE', () => {
    if (!raw) return skip('A32_EVENT_KEYS_RESOLVE', 'the skeleton JSON did not parse (A00 owns that failure)');
    if (!isObj(raw.animations)) return skip('A32_EVENT_KEYS_RESOLVE', 'the skeleton declares no animations');
    const declared = isObj(raw.events) ? (raw.events as Json) : {};
    const known = Object.keys(declared);
    let sawATimeline = false;
    for (const [animName, anim] of Object.entries(raw.animations as Json)) {
      if (!isObj(anim) || !Array.isArray(anim.events)) continue;
      sawATimeline = true;
      let previous = -Infinity;
      (anim.events as unknown[]).forEach((key, k) => {
        const at = `animation "${animName}" event key ${k}`;
        if (!isObj(key) || typeof key.name !== 'string') {
          fail('A32_EVENT_KEYS_RESOLVE', `${at}: an event key needs a string "name"`);
          return;
        }
        const definition = declared[key.name];
        if (definition === undefined) {
          fail(
            'A32_EVENT_KEYS_RESOLVE',
            `${at}: fires "${key.name}", which the skeleton's events block does not declare` +
              (known.length ? ` (declared: ${known.join(', ')})` : ' (that block is empty or absent)'),
          );
          return;
        }
        // `time` defaults to 0 when absent (`:1247`), which is what the editor
        // writes for a firing on frame 0.
        const time = key.time === undefined ? 0 : key.time;
        if (typeof time !== 'number' || !Number.isFinite(time)) {
          fail('A32_EVENT_KEYS_RESOLVE', `${at}: time is ${JSON.stringify(key.time)}, not a finite number`);
          return;
        }
        if (time < previous) {
          fail(
            'A32_EVENT_KEYS_RESOLVE',
            `${at}: "${key.name}" is at t=${time}, after a key at t=${previous} — the parser fills frames in ` +
              'array order and never sorts them, so the earlier firing is unreachable',
          );
        }
        previous = Math.max(previous, time);
        const hasAudio = isObj(definition) && typeof definition.audio === 'string';
        for (const field of ['volume', 'balance'] as const) {
          if (key[field] !== undefined && !hasAudio) {
            fail(
              'A32_EVENT_KEYS_RESOLVE',
              `${at}: "${key.name}" sets ${field}, but the event declares no audio path — the parser reads ` +
                `${field} only for an event that has one, so it is dropped in silence`,
            );
          }
        }
      });
    }
    if (!sawATimeline) return skip('A32_EVENT_KEYS_RESOLVE', 'no animation carries an event timeline');
  });

  // --- A34: a constraint timeline aims at a constraint of that type ---------
  //
  // Five groups, in two shapes. `ik` and `transform` are ONE unnamed timeline
  // per constraint (`animations.<a>.ik.<name>` is the key array itself); `path`,
  // `physics` and `slider` put named timelines under the constraint
  // (`animations.<a>.path.<name>.position`). Both
  // shapes resolve the constraint by name AND by type —
  // `findConstraint(name, IkConstraintData)` returns null for a transform
  // constraint that happens to share the name, and `readAnimation` then throws
  // `IK Constraint not found`. That one is loud — A00 reports it, as a parser
  // message about a name with no context — so this assertion exists for the
  // second failure, which is silent:
  //
  //   **An empty key array.** `let keyMap = constraintMap[0]; if (!keyMap)
  //   continue;` — the group is read, the timeline is skipped, and nothing is
  //   said. `"ik": { "leg-ik": [] }` is a timeline that does not exist, written
  //   by a generator that thought it wrote one. Every one of the five groups has
  //   that line.
  //
  // Reporting both from here also means a candidate with a misspelled constraint
  // gets told which constraints it does have, rather than being handed the
  // loader's own sentence.
  //
  // ⚠️ `physics` was NOT in the named-timeline loop until issue #593, and the
  // comment above it named the shape after the group it left out. It cost
  // nothing while the motion spec could state two physics timelines and both
  // came from `compileValueTrack`; a spec that can state six more is a spec
  // that can aim them at a constraint that is not there. The group list is a
  // constant now, and the message that names the timelines a group takes reads
  // them off `CHANNELS_BY_KIND` — it used to be a ternary over two groups,
  // which is a sentence that cannot be extended without being rewritten.
  check('A34_CONSTRAINT_TIMELINE_TARGETS', () => {
    if (!raw) return skip('A34_CONSTRAINT_TIMELINE_TARGETS', 'the skeleton JSON did not parse (A00 owns that failure)');
    if (!isObj(raw.animations)) return skip('A34_CONSTRAINT_TIMELINE_TARGETS', 'the skeleton declares no animations');
    const typeOf = new Map<string, string>();
    for (const entry of Array.isArray(raw.constraints) ? (raw.constraints as unknown[]) : []) {
      if (isObj(entry) && typeof entry.name === 'string') typeOf.set(entry.name, String(entry.type));
    }
    let sawATimeline = false;
    /** One target of one group: the name resolves, the type matches, keys exist. */
    const checkTarget = (at: string, group: string, name: string, keyArrays: Array<[string, unknown]>): void => {
      sawATimeline = true;
      const declared = typeOf.get(name);
      if (declared === undefined) {
        const known = [...typeOf.entries()].filter(([, t]) => t === group).map(([n]) => n);
        fail(
          'A34_CONSTRAINT_TIMELINE_TARGETS',
          `${at}: the skeleton's constraints array has no "${name}"` +
            (known.length ? ` (${group} constraints: ${known.join(', ')})` : `, and no ${group} constraint at all`),
        );
        return;
      }
      if (declared !== group) {
        fail(
          'A34_CONSTRAINT_TIMELINE_TARGETS',
          `${at}: "${name}" is declared as a "${declared}" constraint, so the ${group} lookup misses it and the loader throws`,
        );
        return;
      }
      if (keyArrays.length === 0) {
        fail(
          'A34_CONSTRAINT_TIMELINE_TARGETS',
          `${at}: the constraint is named and carries no timeline at all; the group is walked and nothing happens`,
        );
        return;
      }
      for (const [timeline, keys] of keyArrays) {
        if (Array.isArray(keys) && keys.length > 0) continue;
        fail(
          'A34_CONSTRAINT_TIMELINE_TARGETS',
          `${at}${timeline ? ` timeline "${timeline}"` : ''}: the key array is ` +
            `${Array.isArray(keys) ? 'empty' : JSON.stringify(keys)}; the parser reads key 0, finds nothing and ` +
            'skips the whole timeline without a word',
        );
      }
    };
    for (const [animName, anim] of Object.entries(raw.animations as Json)) {
      if (!isObj(anim)) continue;
      // group.<constraint> = keys[]
      for (const group of ['ik', 'transform'] as const) {
        if (!isObj(anim[group])) continue;
        for (const [name, keys] of Object.entries(anim[group] as Json)) {
          checkTarget(`animation "${animName}" ${group} timeline "${name}"`, group, name, [['', keys]]);
        }
      }
      // group.<constraint>.<timeline> = keys[]
      for (const group of NAMED_TIMELINE_GROUPS) {
        if (!isObj(anim[group])) continue;
        for (const [name, timelines] of Object.entries(anim[group] as Json)) {
          const at = `animation "${animName}" ${group} constraint "${name}"`;
          if (!isObj(timelines)) {
            sawATimeline = true;
            fail(
              'A34_CONSTRAINT_TIMELINE_TARGETS',
              `${at}: this group maps a constraint to NAMED timelines ` +
                `(${Object.keys(CHANNELS_BY_KIND[group]).join('/')}), and this one holds ${JSON.stringify(timelines)} — ` +
                'a bare key array here is the ik/transform shape and is walked as an object',
            );
            continue;
          }
          checkTarget(at, group, name, Object.entries(timelines));
        }
      }
    }
    if (!sawATimeline) {
      return skip('A34_CONSTRAINT_TIMELINE_TARGETS', 'no animation carries a constraint timeline');
    }
  });

  // --- A35: a deform key's run lands inside the attachment it edits ---------
  //
  // 🚨 The nastiest silent failure in the animation half of this format. A deform
  // key is a sparse edit of a vertex array whose length comes from the attachment,
  // and the parser applies it with
  //
  //   Utils.arrayCopy(verticesValue, 0, deform, start, verticesValue.length)
  //
  // into a `Float32Array`. Writing past the end of a typed array in JavaScript is
  // a **no-op** — no throw, no warning, no NaN — so a run one pair too long, or a
  // run aimed at an attachment with fewer vertices than the author thought, loses
  // its tail and deforms the rest correctly. The result looks nearly right, which
  // is worse than looking wrong.
  //
  // One more shape, equally quiet: a **non-finite value** in `vertices` reaches
  // `computeWorldVertices` and turns the vertex into NaN, which A10 would only
  // catch if the deformed slot's BONE went non-finite, and it does not.
  //
  // The length depends on the encoding and the two are the same split
  // `readVertices` makes: unweighted is one pair per vertex, weighted is one pair
  // per bone influence (`vertices.length / 3 * 2`). Deriving it here rather than
  // assuming either is the whole point — assuming would produce a confident,
  // wrong bound on half the meshes in the world.
  //
  // ## ⛔ What this rule must NOT require: pair alignment (issue #262)
  //
  // It used to refuse an odd `offset` and an odd-length run, on the reading that
  // "the array is x, y pairs, so a run has to start and end on one". The array is
  // pairs; the RUN is not, and the parser above is the whole argument — `start` is
  // a raw index into the deform array, `arrayCopy` copies `verticesValue.length`
  // floats from it, and the element-wise `deform[i] += vertices[i]` that follows
  // walks the entire array rather than the run. There is no pair arithmetic
  // anywhere in that path, so a run may begin and end mid-pair, and every slot the
  // run does not cover keeps the zero the fresh `Float32Array` came with — which
  // is the identity delta, i.e. exactly the setup vertex.
  //
  // 🚨 That made the rule refuse legitimate editor output. Spine trims leading
  // zeros off a delta run, and a trim lands wherever the zeros stop: the official
  // `spineboy-pro` export keys `hoverboard-board` (an unweighted mesh, 148 floats)
  // with `offset: 1` and 147 values, covering `1..148`. A35 was the only assertion
  // that failed it — `A00` round-trips it and `A10` steps it clean — and it is a
  // `'validity'` rule, so it fired in every profile and told an agent holding a
  // file that every Spine runtime plays to go and change correct data.
  //
  // ⭐ The bound that survives is the one the runtime actually has: the run has to
  // FIT (`offset + vertices.length <= deformLength`). That is the quiet defect the
  // rule exists for and it is unaffected by where the run starts.
  check('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', () => {
    if (!raw) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'the skeleton JSON did not parse (A00 owns that failure)');
    if (!isObj(raw.animations)) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'the skeleton declares no animations');
    /** skin name -> slot -> attachment, straight off the raw JSON. */
    const skins = new Map<string, Json>();
    for (const skin of Array.isArray(raw.skins) ? (raw.skins as unknown[]) : []) {
      if (isObj(skin) && typeof skin.name === 'string' && isObj(skin.attachments)) {
        skins.set(skin.name, skin.attachments as Json);
      }
    }
    let sawATimeline = false;
    let measured = 0;
    for (const [animName, anim] of Object.entries(raw.animations as Json)) {
      if (!isObj(anim) || !isObj(anim.attachments)) continue;
      for (const [skinName, slotMap] of Object.entries(anim.attachments as Json)) {
        if (!isObj(slotMap)) continue;
        for (const [slotName, attMap] of Object.entries(slotMap)) {
          if (!isObj(attMap)) continue;
          for (const [attName, timelines] of Object.entries(attMap)) {
            if (!isObj(timelines) || !Array.isArray(timelines.deform)) continue;
            sawATimeline = true;
            const at = `animation "${animName}" deform ${skinName}/${slotName}/${attName}`;
            const attachment = isObj(skins.get(skinName)?.[slotName])
              ? ((skins.get(skinName)![slotName] as Json)[attName] as unknown)
              : undefined;
            if (!isObj(attachment)) {
              fail(
                'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
                `${at}: skin "${skinName}" has no attachment "${attName}" on slot "${slotName}"; the parser throws ` +
                  '`Timeline attachment not found`',
              );
              continue;
            }
            const length = deformArrayLength(attachment);
            if (length === null) {
              // A linked mesh takes its geometry from another attachment, so the
              // raw file cannot state this one's length. Saying nothing beats
              // inventing a bound: an assertion with a default is how "nothing to
              // measure" becomes a measurement of the wrong thing.
              continue;
            }
            measured++;
            const keys = timelines.deform as unknown[];
            if (keys.length === 0) {
              fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at}: the key array is empty; the parser skips the timeline in silence`);
              continue;
            }
            keys.forEach((key, k) => {
              if (!isObj(key)) {
                fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: not an object`);
                return;
              }
              const vertices = key.vertices;
              if (vertices === undefined || vertices === null) return; // "back to setup" — nothing to fit
              if (!Array.isArray(vertices)) {
                fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: vertices is ${JSON.stringify(vertices)}, not an array`);
                return;
              }
              const offset = key.offset === undefined ? 0 : key.offset;
              if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
                fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: offset is ${JSON.stringify(key.offset)}`);
                return;
              }
              // ⛔ No parity clause here, and the header says why: an odd `offset`
              // and an odd-length run are both what a trimmed editor export looks
              // like, and the parser has no pair arithmetic to be misaligned
              // against (#262).
              if (offset + vertices.length > length) {
                fail(
                  'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
                  `${at} key ${k}: the run covers ${offset}..${offset + vertices.length} of a ${length}-long deform ` +
                    'array; everything past the end is copied into a Float32Array and dropped without a word',
                );
              }
              for (const n of vertices as unknown[]) {
                if (typeof n !== 'number' || !Number.isFinite(n)) {
                  fail('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', `${at} key ${k}: the run holds a non-finite value ${JSON.stringify(n)}`);
                  break;
                }
              }
            });
          }
        }
      }
    }
    if (!sawATimeline) return skip('A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', 'no animation carries a deform timeline');
    if (measured === 0) {
      return skip(
        'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT',
        'every deform timeline here keys an attachment whose vertex count the raw file does not state (a linked mesh)',
      );
    }
  });

  // --- A: the round trip ----------------------------------------------------
  // The two loaded objects come back OUT of the assertion rather than being
  // assigned into it. Everything below reads them, and a `let` written inside a
  // callback is a value the type checker cannot see being set: it narrows to
  // `null` at the first guard and to `never` inside it, so `atlas.pages` stops
  // type-checking while working perfectly at runtime.
  const roundTrip = check('A00_ROUNDTRIP_PARSE', () => {
    if (drawOrderIsUnparseable !== null) {
      throw new Error(`not attempted — the loader would not return: ${drawOrderIsUnparseable}`);
    }
    const parsedAtlas = new TextureAtlas(input.atlasText);
    const json = new SkeletonJson(new AtlasAttachmentLoader(parsedAtlas));
    try {
      return { atlas: parsedAtlas, data: json.readSkeletonData(JSON.parse(input.skeletonText)) };
    } catch (err) {
      // 📌 The round trip is still ATTEMPTED — always, and A08 above cannot
      // stop it (issue #589). What changes here is only what A00 SAYS when the
      // loader refuses a region A08 has already refused by name: it defers
      // instead of printing the same fact a second time, in words that name
      // neither the placeholder nor the skin and that cannot show whitespace.
      //
      // ⚠️ The deference is conditional on the two agreeing about the exact
      // path, so the case A08 is wrong about stays loud: a `Region not found`
      // throw over a path A08 did NOT refuse prints verbatim, and A08 refusing
      // a path the loader then resolves leaves a FAIL beside a green A00. This
      // is the one clause that would hide either, and it is written so it
      // cannot.
      const wanted = /^Region not found in atlas: (.*) \(attachment: .+\)$/.exec((err as Error).message);
      if (wanted !== null && pathsWithNoRegion.has(wanted[1])) {
        throw new Error(
          'the loader refused the file at the first attachment path this atlas has no region for — ' +
            'A08_REGION_NAMES_MATCH_ATTACHMENTS names it, with the skin, the slot and the placeholder that wanted it',
        );
      }
      throw err;
    }
  });
  const atlas: TextureAtlas | null = roundTrip?.atlas ?? null;
  const skeletonData: ReturnType<SkeletonJson['readSkeletonData']> | null = roundTrip?.data ?? null;

  if (atlas) {
    stats.pages = atlas.pages.length;
    stats.regions = atlas.regions.length;
  }
  if (skeletonData) {
    stats.bones = skeletonData.bones.length;
    stats.slots = skeletonData.slots.length;
    stats.animations = skeletonData.animations.length;
    stats.version = skeletonData.version ?? '(none)';
  }

  // --- A16: version label ---------------------------------------------------
  //
  // The label must be on the 4.3 line, and the line includes its pre-releases:
  // every one of the nine official example exports declares "4.3.75-beta", which
  // the original `/^4\.3(\.\d+)?$/` rejected. That made the first file of the
  // benchmark ladder fail on a cosmetic string. What the assertion is actually
  // for is the MAJOR.MINOR pair — a 4.2 or 5.x label is portable-fragile because
  // some runtimes refuse a version mismatch outright (spine-runtimes CHANGELOG
  // line 1678), while spine-ts stores the string and never compares it. So the
  // patch component and any pre-release suffix after it are free, and 4.2/5.x
  // stay rejected.
  check('A16_SKELETON_VERSION_4_3', () => {
    const declared = isObj(raw?.skeleton) ? (raw.skeleton as Json).spine : undefined;
    if (typeof declared !== 'string' || !SPINE_4_3_VERSION.test(declared)) {
      fail(
        'A16_SKELETON_VERSION_4_3',
        `skeleton.spine is ${JSON.stringify(declared)}, expected 4.3, 4.3.<patch> or 4.3.<patch>-<suffix>`,
      );
    }
  });

  // --- A01: no legacy top-level constraint arrays ---------------------------
  // 4.3 folds every constraint into one `constraints` array with a `type`.
  // A 4.1/4.2-shaped `physics` array loads clean and the constraint just
  // vanishes.
  check('A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS', () => {
    for (const key of ['ik', 'transform', 'path', 'physics', 'slider']) {
      if (raw && key in raw) {
        fail(
          'A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS',
          `top-level "${key}" array present; 4.3 wants it inside "constraints" with type:"${key}"`,
        );
      }
    }
  });

  // --- A02: no bone.transform key ------------------------------------------
  // 4.3 renamed it to `inherit`; the old key loads and silently falls back to
  // Normal inheritance (case 6b).
  check('A02_NO_BONE_TRANSFORM_KEY', () => {
    const bones = Array.isArray(raw?.bones) ? (raw.bones as unknown[]) : [];
    for (const bone of bones) {
      if (isObj(bone) && 'transform' in bone) {
        fail('A02_NO_BONE_TRANSFORM_KEY', `bone "${String(bone.name)}" uses 4.2's "transform"; 4.3 wants "inherit"`);
      }
    }
  });

  // --- A12: no dark / two-colour tint --------------------------------------
  // Parsed, then silently ignored by spine-html.
  check('A12_NO_DARK_COLOR', () => {
    const slots = Array.isArray(raw?.slots) ? (raw.slots as unknown[]) : [];
    for (const slot of slots) {
      if (isObj(slot) && 'dark' in slot) {
        fail('A12_NO_DARK_COLOR', `slot "${String(slot.name)}" declares a dark colour; the renderer ignores it`);
      }
    }
    walkTimelines(raw, (path, kind, name) => {
      if (kind === 'slot' && (name === 'rgba2' || name === 'rgb2')) {
        fail('A12_NO_DARK_COLOR', `${path}: two-colour timeline "${name}" is silently ignored by the renderer`);
      }
    });
  });

  // --- A05: curve arrays are 4 numbers per value channel --------------------
  check('A05_CURVE_ARRAY_LENGTH', () => {
    // Two clauses, so the SKIP needs both to be empty (#580). The vocabulary
    // clause below measures every timeline it is handed — an unchecked name is a
    // finding whether or not any key on it carries a curve — so a skeleton with
    // timelines and no curve at all has still been measured. What measures
    // nothing is a skeleton `walkTimelines` never calls back on.
    let timelines = 0;
    walkTimelines(raw, (path, kind, name, keys) => {
      timelines++;
      const table = CHANNELS_BY_KIND[kind];
      if (!(name in table)) {
        fail('A05_CURVE_ARRAY_LENGTH', `${path}: unchecked ${kind} timeline "${name}" — extend the validator`);
        return;
      }
      const channels = table[name];
      for (const key of keys) {
        if (!isObj(key) || !('curve' in key)) continue;
        const curve = key.curve;
        if (channels === null) {
          fail('A05_CURVE_ARRAY_LENGTH', `${path}: timeline "${name}" cannot carry a curve`);
          continue;
        }
        if (curve === 'stepped') continue;
        if (!Array.isArray(curve)) {
          fail('A05_CURVE_ARRAY_LENGTH', `${path}: curve is ${JSON.stringify(curve)}, expected "stepped" or an array`);
          continue;
        }
        if (curve.length !== channels * 4) {
          fail(
            'A05_CURVE_ARRAY_LENGTH',
            `${path} (t=${String(key.time ?? 0)}): curve has ${curve.length} numbers, "${name}" needs ${channels} channels x 4 = ${channels * 4}`,
          );
        }
        for (const n of curve) {
          if (typeof n !== 'number' || !Number.isFinite(n)) {
            fail('A05_CURVE_ARRAY_LENGTH', `${path}: curve holds a non-finite value ${JSON.stringify(n)}`);
          }
        }
      }
    });
    if (timelines === 0) return skip('A05_CURVE_ARRAY_LENGTH', SKIP_NO_TIMELINE);
  });

  // -------------------------------------------------------------------------
  // Loaded-data assertions
  // -------------------------------------------------------------------------

  const regionAttachments: RegionAttachment[] = [];
  const meshAttachments: MeshAttachment[] = [];
  let clippingCount = 0;
  const meshSlots = new Set<number>();

  if (skeletonData) {
    const data = skeletonData as NonNullable<typeof skeletonData>;
    for (const skin of data.skins) {
      for (const entry of skin.getAttachments()) {
        const att = entry.attachment;
        if (att instanceof RegionAttachment) regionAttachments.push(att);
        else if (att instanceof MeshAttachment) {
          meshAttachments.push(att);
          meshSlots.add(entry.slotIndex);
        } else if (att instanceof ClippingAttachment) clippingCount++;
      }
    }
    stats.regionAttachments = regionAttachments.length;
    stats.meshAttachments = meshAttachments.length;

    // --- A03: every region has finite width/height (case 6c) ---------------
    check('A03_REGION_WIDTH_HEIGHT_FINITE', () => {
      // ⟨subject⟩_⟨property⟩: with no region there is no size to find non-finite,
      // and a loop over nothing used to report that as held (#580).
      if (regionAttachments.length === 0) return skip('A03_REGION_WIDTH_HEIGHT_FINITE', SKIP_NO_REGION_ATTACHMENT);
      for (const att of regionAttachments) {
        if (!Number.isFinite(att.width) || !Number.isFinite(att.height)) {
          fail('A03_REGION_WIDTH_HEIGHT_FINITE', `region "${att.name}" loaded w=${att.width} h=${att.height}`);
        }
        if (att.width <= 0 || att.height <= 0) {
          fail('A03_REGION_WIDTH_HEIGHT_FINITE', `region "${att.name}" has a non-positive size`);
        }
      }
    });

    // --- A04: mesh triangles + encoding coherence (case 6f) ----------------
    check('A04_MESH_TRIANGLES_AND_ENCODING', () => {
      if (meshAttachments.length === 0) return skip('A04_MESH_TRIANGLES_AND_ENCODING', SKIP_NO_MESH_ATTACHMENT);
      for (const mesh of meshAttachments) {
        if (!mesh.triangles || mesh.triangles.length === 0) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" has no triangles`);
          continue;
        }
        if (mesh.triangles.length % 3 !== 0) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" triangle count is not a multiple of 3`);
        }
        const vertexCount = mesh.worldVerticesLength / 2;
        for (const idx of mesh.triangles) {
          if (idx < 0 || idx >= vertexCount) {
            fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" index ${idx} is outside 0..${vertexCount - 1}`);
            break;
          }
        }
        // Weighted vs unweighted is decided by a length comparison alone — a
        // coincidental match reads weight data as coordinates.
        const weighted = !!mesh.bones;
        if (weighted && mesh.vertices.length % 3 !== 0) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" weighted vertex run is not a multiple of 3`);
        }
        if (!weighted && mesh.vertices.length !== mesh.worldVerticesLength) {
          fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" unweighted vertices disagree with uvs`);
        }
      }
    });

    // --- A33: bounding boxes and clipping polygons hold a real polygon -------
    //
    // These two types are the same shape — a polygon and nothing else — and they
    // fail the same three ways, all three silent:
    //
    //   1. **A missing or wrong `vertexCount`.** The parser reads
    //      `map.vertexCount << 1` and hands it to `readVertices` as the length to
    //      expect (`:552`, `:632`). `undefined << 1` is 0, so an omission makes
    //      the coordinate array read as a WEIGHTED run: it decodes numbers as
    //      bone counts and weights, and the attachment ends up with no vertices
    //      at all. Nothing throws, and neither type draws a pixel, so nothing
    //      downstream notices either.
    //   2. **A weighted run that does not decode to that many vertices.** Same
    //      trap as a mesh's (A04), minus the uvs that would have caught it.
    //   3. **A clipping `end` naming a slot that is not there.**
    //      `skeletonData.findSlot` returns null on a miss and `:626-627` assigns
    //      the null, so the clip does not end where it was told to — it runs to
    //      the bottom of the draw order and takes every slot below it with it.
    //      Checked on the raw JSON, because a null `endSlot` and an `end` that
    //      was never written are the same loaded object.
    check('A33_VERTEX_ATTACHMENT_GEOMETRY', () => {
      const polygons: Array<{ what: string; att: BoundingBoxAttachment | ClippingAttachment | PathAttachment }> = [];
      const paths: PathAttachment[] = [];
      for (const skin of data.skins) {
        for (const entry of skin.getAttachments()) {
          const att = entry.attachment;
          if (att instanceof BoundingBoxAttachment) polygons.push({ what: `bounding box "${att.name}"`, att });
          else if (att instanceof ClippingAttachment) polygons.push({ what: `clipping attachment "${att.name}"`, att });
          else if (att instanceof PathAttachment) {
            // A path is the same shape with one more rule on top: its vertices
            // are knots AND handles, walked in groups of three.
            polygons.push({ what: `path "${att.name}"`, att });
            paths.push(att);
          }
        }
      }
      for (const path of paths) {
        const what = `path "${path.name}"`;
        const vertexCount = path.worldVerticesLength / 2;
        if (vertexCount % 3 !== 0) {
          fail(
            'A33_VERTEX_ATTACHMENT_GEOMETRY',
            `${what} has ${vertexCount} vertices, which is not a multiple of 3 — a path is knots and Bezier ` +
              'handles read in groups of three, and `Utils.newArray(vertexCount / 3, 0)` accepts the fractional ' +
              'size without a word, so the curves straddle the knots',
          );
          continue;
        }
        // Curves: 3K + 1 chain points. An open path drops the first and last
        // vertex (the end knots' outer handles), a closed one repeats the first.
        const curves = path.closed ? vertexCount / 3 : vertexCount / 3 - 1;
        if (curves < 1) {
          fail('A33_VERTEX_ATTACHMENT_GEOMETRY', `${what} has ${vertexCount} vertices, which is not one whole curve`);
          continue;
        }
        // `lengths` is what a `constantSpeed: false` traversal measures with:
        // `lengths[curve]` bounds each curve and the last entry IS the path
        // length. The parser sizes the array from `vertexCount / 3` and copies
        // whatever the file gave, so a short array leaves trailing zeros — and a
        // zero-length curve makes the parser divide the position by it.
        const lengths = path.lengths;
        let previous = 0;
        for (let c = 0; c < curves; c++) {
          const value = lengths[c];
          if (!Number.isFinite(value) || value <= previous) {
            fail(
              'A33_VERTEX_ATTACHMENT_GEOMETRY',
              `${what} lengths[${c}] is ${String(value)}, and the entry before it was ${previous}. The array is the ` +
                'CUMULATIVE arc length at the end of each of the ' +
                `${curves} curve(s), so it strictly increases; a value that does not means either a zero-length ` +
                'curve (the position is divided by it) or an array shorter than the geometry (the tail reads as 0)',
            );
            break;
          }
          previous = value;
        }
      }
      const slotNames = new Set(data.slots.map((s) => s.name));
      let endsChecked = 0;
      if (raw && Array.isArray(raw.skins)) {
        for (const skin of raw.skins as unknown[]) {
          if (!isObj(skin) || !isObj(skin.attachments)) continue;
          for (const [slotName, perSlot] of Object.entries(skin.attachments as Json)) {
            if (!isObj(perSlot)) continue;
            for (const [placeholder, att] of Object.entries(perSlot)) {
              if (!isObj(att) || att.type !== 'clipping' || att.end === undefined) continue;
              endsChecked++;
              if (typeof att.end !== 'string' || !slotNames.has(att.end)) {
                fail(
                  'A33_VERTEX_ATTACHMENT_GEOMETRY',
                  `clipping attachment "${placeholder}" on slot "${slotName}" ends at ${JSON.stringify(att.end)}, ` +
                    'which is not a slot of this skeleton — the clip would run to the bottom of the draw order',
                );
              }
            }
          }
        }
      }
      if (polygons.length === 0 && endsChecked === 0) {
        return skip(
          'A33_VERTEX_ATTACHMENT_GEOMETRY',
          'the skeleton carries no bounding box, clipping attachment or path',
        );
      }
      for (const { what, att } of polygons) {
        const length = att.worldVerticesLength;
        if (!Number.isInteger(length) || length < 6 || length % 2 !== 0) {
          fail(
            'A33_VERTEX_ATTACHMENT_GEOMETRY',
            `${what} loaded worldVerticesLength ${length}; a polygon is an even count of at least 6 (3 vertices). ` +
              'A missing "vertexCount" reads as 0 and takes the polygon with it',
          );
          continue;
        }
        const vertexCount = length / 2;
        if (!att.bones) {
          if (att.vertices.length !== length) {
            fail(
              'A33_VERTEX_ATTACHMENT_GEOMETRY',
              `${what} declares ${vertexCount} vertices but holds ${att.vertices.length} unweighted numbers ` +
                `(expected ${length}); the parser reads that mismatch as a weighted run`,
            );
          }
          continue;
        }
        // Weighted: `bones` is boneCount, (index × boneCount), repeated, and
        // `vertices` holds x, y, weight per binding.
        let decoded = 0;
        let bindings = 0;
        let ok = true;
        for (let i = 0; i < att.bones.length; decoded++) {
          const count = att.bones[i++];
          if (!Number.isInteger(count) || count < 1 || i + count > att.bones.length) {
            fail('A33_VERTEX_ATTACHMENT_GEOMETRY', `${what} vertex ${decoded} claims ${count} bone(s); the run is malformed`);
            ok = false;
            break;
          }
          for (let k = 0; k < count; k++, i++) {
            const index = att.bones[i];
            if (index < 0 || index >= data.bones.length) {
              fail('A33_VERTEX_ATTACHMENT_GEOMETRY', `${what} vertex ${decoded} references bone index ${index}`);
              ok = false;
            }
          }
          bindings += count;
        }
        if (!ok) continue;
        if (decoded !== vertexCount) {
          fail(
            'A33_VERTEX_ATTACHMENT_GEOMETRY',
            `${what} declares ${vertexCount} vertices and its weighted run decodes to ${decoded}`,
          );
        }
        if (att.vertices.length !== bindings * 3) {
          fail(
            'A33_VERTEX_ATTACHMENT_GEOMETRY',
            `${what} has ${bindings} binding(s) and ${att.vertices.length} weight numbers (expected ${bindings * 3})`,
          );
        }
      }
    });

    // --- A11 / A13 / A14: renderer + canvas budgets ----
    check('A11_NO_CLIPPING_ATTACHMENTS', () => {
      if (clippingCount > 0) {
        fail('A11_NO_CLIPPING_ATTACHMENTS', `${clippingCount} clipping attachment(s); the renderer skips them silently`);
      }
    });
    // 📐 The two numbers come from the rig spec's `invariants`, never from here.
    // A mesh budget is one consumer's frame time written down — the editor's own
    // example projects ship meshes many times denser and they are valid — so a
    // constant in the validator would fail correct foreign data in the name of
    // somebody else's canvas. A rig that declares no budget has nothing to be
    // measured against, and the assertion says so instead of inventing a wall.
    check('A13_MESH_BUDGET', () => {
      const slotBudget = input.rig?.meshSlotBudget ?? null;
      const triangleBudget = input.rig?.meshTriangleBudget ?? null;
      if (slotBudget === null && triangleBudget === null) {
        return skip(
          'A13_MESH_BUDGET',
          input.rig
            ? `the rig "${input.rig.archetype}" declares no \`invariants.meshSlots\` or \`invariants.meshTriangles\` budget`
            : 'no rig info (validating a bare directory), so no budget is declared',
        );
      }
      // Two clauses and only one of them has a subject that can vanish (#580).
      // A slot budget is a ceiling on a COUNT, and zero is a count — "this rig
      // uses 0 of its 3 mesh slots" is a measurement — so that half holds on a
      // skeleton with no mesh. A triangle budget is a ceiling on each mesh, so a
      // rig that declares only that one and carries no mesh has measured
      // nothing at all.
      if (slotBudget === null && meshAttachments.length === 0) {
        return skip(
          'A13_MESH_BUDGET',
          `the rig "${input.rig?.archetype}" budgets mesh triangles and nothing else, and ${SKIP_NO_MESH_ATTACHMENT}`,
        );
      }
      if (slotBudget !== null && meshSlots.size > slotBudget) {
        fail('A13_MESH_BUDGET', `${meshSlots.size} mesh slots, the rig budgets ${slotBudget}`);
      }
      if (triangleBudget === null) return;
      for (const mesh of meshAttachments) {
        const tris = (mesh.triangles?.length ?? 0) / 3;
        if (tris > triangleBudget) {
          fail('A13_MESH_BUDGET', `mesh "${mesh.name}" has ${tris} triangles, the rig budgets ${triangleBudget}`);
        }
      }
    });
    check('A14_NO_FULL_FRAME_MESH', () => {
      const stageW = data.width || 0;
      const stageH = data.height || 0;
      // ⚠️ A stage-less skeleton has nothing for a mesh to span, and this rule
      // used to report that as a PASS — the `stageW && stageH` guard below reads
      // as a measurement of a 0x0 stage that no mesh can reach. It was only ever
      // reachable from a foreign file until a rig spec could *declare* no stage
      // (issue #578), and a pass certifying an unmeasured rig is the exact
      // failure mode `A21_MESH_RIM_PINNED`'s `|| 'ring'` default was (#44).
      if (!stageW || !stageH) {
        return skip(
          'A14_NO_FULL_FRAME_MESH',
          'the skeleton declares no stage size, so there is no full frame for a mesh to span',
        );
      }
      for (const mesh of meshAttachments) {
        if (mesh.width >= stageW && mesh.height >= stageH) {
          fail('A14_NO_FULL_FRAME_MESH', `mesh "${mesh.name}" spans the whole ${stageW}x${stageH} stage`);
        }
      }
    });

    // --- A15: idle must not key a mesh-driving bone (dirty-skip lever) -----
    check('A15_IDLE_NO_MESH_BONE_KEYS', () => {
      const meshBoneNames = new Set<string>();
      for (const slotIndex of meshSlots) meshBoneNames.add(data.slots[slotIndex].boneData.name);
      // The slot's own bone is not the whole story once weights exist: a ring
      // mesh is driven by its CONTROL bone, which is a different bone entirely.
      // Checking only the slot bone would let `idle` key the one bone that
      // actually dirties the canvas every frame.
      for (const mesh of meshAttachments) {
        if (!mesh.bones) continue;
        for (let i = 0; i < mesh.bones.length; ) {
          const boneCount = mesh.bones[i++];
          for (let n = 0; n < boneCount; n++, i++) {
            const bone = data.bones[mesh.bones[i]];
            if (bone) meshBoneNames.add(bone.name);
          }
        }
      }
      // The same shape as A06's and A17's guards, found by auditing for it
      // (#568): a rig with no `idle` at all has nothing here to be wrong, and a
      // rule that reports "held" over a subject that does not exist is the
      // vacuous pass this file's own doctrine refuses. The two states get their
      // own sentences because they are different absences — no such animation,
      // versus one that keys no bone.
      const idle = isObj(raw?.animations) ? (raw.animations as Json).idle : undefined;
      if (!isObj(idle)) {
        return skip('A15_IDLE_NO_MESH_BONE_KEYS', 'the skeleton declares no "idle" animation, so nothing here can key a mesh-driving bone');
      }
      if (!isObj(idle.bones)) {
        return skip('A15_IDLE_NO_MESH_BONE_KEYS', '"idle" carries no bone timeline at all, so there is no key to hold against the mesh-driving bones');
      }
      for (const boneName of Object.keys(idle.bones as Json)) {
        if (meshBoneNames.has(boneName)) {
          fail('A15_IDLE_NO_MESH_BONE_KEYS', `idle keys bone "${boneName}", which drives a mesh — meshes never idle-skip`);
        }
      }
    });

    // --- A20/A21/A22: the mesh checks the parser will never make ------------
    //
    // A mesh is the one attachment type where every mistake is silent. Bad
    // weights do not throw, they skew; a uv outside the region samples the
    // wrong pixels; and an unpinned rim moves the seam, which is the single
    // thing the whole generated-parts approach depends on not happening.
    const meshWeights = meshWeightsOf;

    /** The slot a skin attachment belongs to; several assertions need it. */
    const slotOfAttachment = (target: MeshAttachment): string | null => {
      for (const skin of data.skins) {
        for (const entry of skin.getAttachments()) {
          if (entry.attachment === target) return data.slots[entry.slotIndex].name;
        }
      }
      return null;
    };
    /**
     * What built this mesh. ring unless the rig says otherwise; absent rig info
     * reads as ring (legacy).
     *
     * 🚨 `authored` is not a third topology, it is the ABSENCE of one rigc may
     * assume. Geometry that came in through the rig spec was drawn by somebody
     * with an editor, and its rim, its row pairing and its entry edge are
     * whatever that person made them. The `||` fallback below used to hand such
     * a mesh the string `ring`, and A21 then checked ring topology on a shape
     * that was never a ring — 40 failures on correct data (issue #44).
     */
    const kindOf = (target: MeshAttachment): RigInfo['meshKinds'][string] => {
      const slot = slotOfAttachment(target);
      return (slot && input.rig?.meshKinds[slot]) || 'ring';
    };
    /** Meshes rigc did not build, by name — the reason string several skips need. */
    const authoredMeshNames = (list: MeshAttachment[]): string[] =>
      list.filter((m) => kindOf(m) === 'authored').map((m) => `"${m.name}"`);

    check('A20_MESH_WEIGHTS_COHERENT', () => {
      if (meshAttachments.length === 0) return skip('A20_MESH_WEIGHTS_COHERENT', SKIP_NO_MESH_ATTACHMENT);
      for (const mesh of meshAttachments) {
        // 🚨 Authored geometry is not rigc's to have opinions about. The two
        // policy branches in this assertion are both statements about what a
        // rigc GENERATOR is supposed to produce — "a mesh here is weighted",
        // "a generated mesh binds only bones that move it" — and neither is a
        // fact about Spine or about somebody else's mesh. Applying them to
        // authored geometry failed correct data (issue #44). The coherence
        // rules below the branch are unconditional and still apply.
        const generated = kindOf(mesh) !== 'authored';
        if (!mesh.bones) {
          // 📐 PROFILE. An unweighted mesh is perfectly valid Spine — spineboy
          // ships two — and the runtime poses it from the slot bone. What is
          // NOT valid, in any profile, is a weighted mesh whose weights do not
          // cohere, which is everything below this branch. So the requirement
          // that a mesh be weighted at all is the policy half, and it is the
          // only half gated here.
          if (policy && generated) {
            fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" is unweighted; the ring tier drives meshes by bones`);
          }
          continue;
        }
        const perVertex = meshWeights(mesh);
        const expected = mesh.worldVerticesLength / 2;
        if (perVertex.length !== expected) {
          fail(
            'A20_MESH_WEIGHTS_COHERENT',
            `mesh "${mesh.name}" has weights for ${perVertex.length} vertices but ${expected} uv pairs`,
          );
          continue;
        }
        perVertex.forEach((vertex, i) => {
          if (!vertex.length) fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} has no bones`);
          let sum = 0;
          for (const { bone, weight } of vertex) {
            if (!Number.isFinite(weight) || weight < 0) {
              fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} has weight ${weight}`);
            }
            // 📐 PROFILE. A weight of exactly 0 is legal, harmless Spine: the
            // runtime accumulates `(…) * weight` (Attachment.js:131), so the
            // binding contributes nothing. The Spine editor writes them — the
            // auto-weighted meshes in 6-arcs, 7-anticipation and 8-follow-through
            // carry dozens, and their vertex weights still sum to 1. Treating one
            // as corruption failed three rungs of the ladder on correct data.
            // In a rigc-GENERATED ring or ribbon it is still a defect: the
            // generator bound a bone that does nothing, which is a bug in the
            // generator and dead work in the runtime's inner loop. So it stays a
            // failure under spine-html and is not one under spine.
            else if (policy && generated && weight === 0) {
              fail(
                'A20_MESH_WEIGHTS_COHERENT',
                `mesh "${mesh.name}" vertex ${i} is bound to bone index ${bone} at weight 0; a generated mesh binds only bones that move it`,
              );
            }
            if (!(bone >= 0 && bone < data.bones.length)) {
              fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} references bone index ${bone}`);
            }
            sum += weight;
          }
          if (Math.abs(sum - 1) > 1e-3) {
            fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} weights sum to ${sum.toFixed(4)}`);
          }
        });
      }
    });

    check('A21_MESH_RIM_PINNED', () => {
      // Without the rig, ring and ribbon cannot be told apart — and the two kinds
      // pin OPPOSITE edges, so guessing one would either check the wrong edge or
      // check nothing while reporting a pass.
      if (!input.rig) {
        return skip('A21_MESH_RIM_PINNED', 'no rig info (validating a bare directory), so ring and ribbon cannot be told apart');
      }
      if (!meshAttachments.some((m) => m.bones)) {
        return skip('A21_MESH_RIM_PINNED', 'the skeleton has no weighted mesh attachment, so there is no rim to find unpinned');
      }
      // An authored mesh has no rim rigc drew and no entry row rigc placed, so
      // there is nothing here to measure against. Nothing to measure is a SKIP —
      // never a pass, and never a failure on somebody else's correct geometry.
      const measurable = meshAttachments.filter((m) => m.bones && kindOf(m) !== 'authored');
      if (measurable.length === 0) {
        const authored = authoredMeshNames(meshAttachments.filter((m) => m.bones));
        return skip(
          'A21_MESH_RIM_PINNED',
          `every weighted mesh here is authored geometry (${authored.join(', ')}), not a rigc ring or ribbon — ` +
            'rigc did not place its rim, so it has no rim of its own to find unpinned',
        );
      }
      for (const mesh of measurable) {
        if (!mesh.bones) continue;
        const perVertexAll = meshWeights(mesh);
        const slotBoneOf = (() => {
          for (const skin of data.skins) {
            for (const entry of skin.getAttachments()) {
              if (entry.attachment === mesh) return data.slots[entry.slotIndex].boneData;
            }
          }
          return null;
        })();
        // A ribbon's outer boundary is SUPPOSED to move — that is the whole point
        // of a strip that changes length. So the rule splits by mesh kind rather
        // than being relaxed: for a ribbon the invariant is that the ENTRY row
        // cannot move, because that row is where the strip joins the part it
        // comes out of. Both rules protect the same thing (the mesh's join to the
        // plate underneath); they just live at different edges of the mesh.
        //
        // A `contour` takes the hull path below, and that is the check it wants
        // rather than a third branch: a contour mesh's hull IS every vertex it
        // has, and every one is pinned to the slot bone at weight 1, so "the rim
        // is pinned" reads over the whole mesh. If a later contour tier ever
        // moves interior vertices, this is the assertion that has to grow a
        // branch — it will fail rather than pass quietly, which is the right way
        // round.
        if (kindOf(mesh) === 'ribbon') {
          const uvs = mesh.regionUVs ?? [];
          let entryRow = 0;
          for (let v = 0; v < perVertexAll.length; v++) {
            if (Math.abs(uvs[v * 2 + 1]) > 1e-6) continue; // not on the entry edge
            entryRow++;
            const vertex = perVertexAll[v];
            if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
              fail(
                'A21_MESH_RIM_PINNED',
                `ribbon "${mesh.name}" entry vertex ${v} is not pinned (${vertex.map((w) => w.weight.toFixed(3)).join('+')})`,
              );
              continue;
            }
            if (slotBoneOf && data.bones[vertex[0].bone]?.name !== slotBoneOf.name) {
              fail(
                'A21_MESH_RIM_PINNED',
                `ribbon "${mesh.name}" entry vertex ${v} is pinned to "${data.bones[vertex[0].bone]?.name}", not the anchor bone "${slotBoneOf.name}"`,
              );
            }
          }
          if (entryRow < 2) {
            fail('A21_MESH_RIM_PINNED', `ribbon "${mesh.name}" has ${entryRow} vertices on its entry edge; a strip needs two`);
          }
          continue;
        }
        // A rim a soft mask deliberately CARRIED (issue #382). The rule splits
        // by declaration rather than being relaxed — the same move the ribbon
        // branch above makes, and for the same reason: a wobbling silhouette is
        // supposed to move, and the invariant is that nothing ELSE does. So on
        // such a mesh a vertex is either pinned to the slot bone at 1 or shared
        // between it and the ONE bone the rig declared, and a third bone, a
        // wrong bone or a weight that does not close is still a failure.
        const boundBone = (() => {
          const slot = slotOfAttachment(mesh);
          return slot ? (input.rig?.meshSoftBones[slot] ?? null) : null;
        })();
        if (boundBone !== null) {
          const allowed = new Set([slotBoneOf?.name, boundBone]);
          let carried = 0;
          for (let v = 0; v < perVertexAll.length; v++) {
            const vertex = perVertexAll[v];
            let sum = 0;
            for (const { bone, weight } of vertex) {
              const name = data.bones[bone]?.name;
              if (!allowed.has(name)) {
                fail(
                  'A21_MESH_RIM_PINNED',
                  `mesh "${mesh.name}" vertex ${v} is carried by "${name}", and this mesh declares only ` +
                    `"${slotBoneOf?.name}" and the soft region's "${boundBone}"`,
                );
              }
              if (name === boundBone && weight > 0) carried = carried + (weight >= 1 ? 1 : 0);
              sum += weight;
            }
            if (Math.abs(sum - 1) > 1e-4) {
              fail(
                'A21_MESH_RIM_PINNED',
                `mesh "${mesh.name}" vertex ${v} weights sum to ${sum.toFixed(4)}; a depth-bound mesh splits each ` +
                  'vertex between the slot bone and the bound bone, so it closes at 1',
              );
            }
          }
          // A mask that carried nothing reached here as a mesh pinned exactly
          // as before, which is not the thing that was declared.
          if (carried === 0) {
            fail(
              'A21_MESH_RIM_PINNED',
              `mesh "${mesh.name}" declares a soft region on "${boundBone}" and no vertex is fully carried by it`,
            );
          }
          continue;
        }
        const hullVertices = mesh.hullLength / 2;
        if (!Number.isInteger(hullVertices) || hullVertices < 3) {
          fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" declares hull ${mesh.hullLength / 2}; the rim must be a real ring`);
          continue;
        }
        const perVertex = meshWeights(mesh);
        if (hullVertices > perVertex.length) {
          fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" hull is ${hullVertices} of ${perVertex.length} vertices`);
          continue;
        }
        // The rim is the alpha contour where generated pixels meet untouched
        // base. One bone at weight 1, and that bone must be the slot's own —
        // anything else and the seam can move.
        const slotBone = (() => {
          for (const skin of data.skins) {
            for (const entry of skin.getAttachments()) {
              if (entry.attachment === mesh) return data.slots[entry.slotIndex].boneData;
            }
          }
          return null;
        })();
        for (let i = 0; i < hullVertices; i++) {
          const vertex = perVertex[i];
          if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
            fail(
              'A21_MESH_RIM_PINNED',
              `mesh "${mesh.name}" rim vertex ${i} is not pinned (${vertex.map((v) => v.weight.toFixed(3)).join('+')})`,
            );
            continue;
          }
          if (slotBone && data.bones[vertex[0].bone]?.name !== slotBone.name) {
            fail(
              'A21_MESH_RIM_PINNED',
              `mesh "${mesh.name}" rim vertex ${i} is pinned to "${data.bones[vertex[0].bone]?.name}", not the slot bone "${slotBone.name}"`,
            );
          }
        }
        // Independent of the ring ORDER: whatever sits on the region border is
        // the outline, and the outline moving means the part's own edge moving.
        // Without this, reordering the rings would move the pinned prefix off
        // the outline and A21 would still pass on the count alone.
        const uvs = mesh.regionUVs ?? [];
        for (let v = 0; v < perVertex.length; v++) {
          const u = uvs[v * 2];
          const t = uvs[v * 2 + 1];
          const onBorder = [u, t].some((c) => Math.abs(c) < 1e-6 || Math.abs(c - 1) < 1e-6);
          if (!onBorder) continue;
          const vertex = perVertex[v];
          if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
            fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" vertex ${v} is on the region border but not pinned`);
            break;
          }
        }
      }
    });

    check('A22_MESH_UVS_IN_UNIT_RANGE', () => {
      if (meshAttachments.length === 0) return skip('A22_MESH_UVS_IN_UNIT_RANGE', SKIP_NO_MESH_ATTACHMENT);
      for (const mesh of meshAttachments) {
        // `regionUVs` is what the JSON authored; `uvs` is the page-space result
        // and stays EMPTY until a renderer calls computeUVs, so asserting on it
        // here would be asserting on the wrong array (measured: length 0 after
        // a clean load). With one part per page the two are equal anyway —
        // computeUVs reduces to `u + regionUV * width` with u=0, width=1
        // (MeshAttachment.js:173-174), which is the claim this assertion rests
        // on and this is where it is checked.
        const uvs = mesh.regionUVs;
        if (!uvs || uvs.length !== mesh.worldVerticesLength) {
          fail(
            'A22_MESH_UVS_IN_UNIT_RANGE',
            `mesh "${mesh.name}" has ${uvs?.length ?? 0} authored uv values for ${mesh.worldVerticesLength}`,
          );
          continue;
        }
        for (let i = 0; i < uvs.length; i++) {
          if (!Number.isFinite(uvs[i]) || uvs[i] < -1e-6 || uvs[i] > 1 + 1e-6) {
            fail('A22_MESH_UVS_IN_UNIT_RANGE', `mesh "${mesh.name}" uv[${i}] is ${uvs[i]}`);
            break;
          }
        }
      }
    });

    // --- A39: a deform key that turns a triangle inside out ------------------
    //
    // 🚨 The animation half of this format had NO geometric measurement at all.
    // `A35` measures a deform run's LENGTH and its finiteness, and is silent on
    // whether the numbers in it mean anything: a key whose offsets are the wrong
    // sign, the wrong magnitude, or geometrically degenerate is green. Issue
    // #296 is that asymmetry, measured — three builds of `gallery/portrait`, one
    // correct, one with a band inverted and one folded at 40°, gate green with
    // the same 26 PASS / 13 SKIP and a byte-identical `MESH` coverage line,
    // because that line reports the SETUP pose (docs/FACE.md §9.2).
    //
    // What this measures is the one deformed-geometry fault that has a
    // reference-free answer: a triangle whose winding REVERSES draws its texture
    // backwards, and a mesh with one in it has locally turned inside out.
    //
    // ## The frame, and why it is the posed one
    //
    // Both sides of the comparison are taken at the key's OWN time, with the
    // animation applied — the deformed mesh against the same posed bones with
    // the deform cleared. Holding the bones at SETUP instead was tried and is
    // wrong in principle: a weighted mesh's offsets are authored in bone space
    // against the pose they land in, so setup bones measure a pose that never
    // occurs. (Measured, on this corpus the two frames agree to ~0.001 px² —
    // the fold is in the deform data either way — but the principle decides it,
    // not the agreement.) Sharing the bones between the two sides is also what
    // makes a MIRRORED slot bone a non-event: a negative determinant flips every
    // triangle on both sides and cancels.
    //
    // 🚨 **And "applied" means applied the way the animation is reached** (issue
    // #407). An animation a slider applies is never played on a track — the dial
    // selects the time, so the key's time and the applied time are the same
    // number by construction — and posing it on a track while its own slider
    // applies it at the neutral is the same error as setup bones, one level up:
    // a frame no playthrough contains. It reported a fold on a correct rig, and
    // the slot-colour half of the neutral apply undid the very alpha-0 key the
    // exemption below reads. So the survey inverts the slider's own mapping and
    // drives its bone until the runtime selects this key's time; the frame it
    // used is on every `DEFORM` line and on the stats line here.
    //
    // ## ⚠️ Why this is `archetype` and not `validity`
    //
    // Because the issue's premise — "it has no legitimate counter-example" — is
    // false on this repository's own corpus, and that was found by running it:
    //
    //   - `spineboy-pro`, an official Spine editor export, flips 1 of the 101
    //     triangles of `hoverboard-board` at key 1 (area −31.53 → +8.48, 2.5e-3
    //     of that mesh's largest triangle).
    //   - `gallery/flex` flipped up to 7 of the 75 triangles of its `leaf`, and
    //     that one WAS a defect — visible tearing at the gust peak. Repaired in
    //     issue #313: its exemption is gone and it gates green here now, which
    //     leaves the editor export as the only standing counter-example.
    //
    // A `validity` rule would therefore tell an author holding correct editor
    // output to go and change it, which is what issues #44 and #262 already
    // cost this file twice. `archetype` says what is true: *rigc's own
    // formations do not fold*, judged under the profile where rigc's own policy
    // lives, and never on a skeleton rigc did not compile.
    //
    // A magnitude threshold was considered as the way to keep it `validity` —
    // exempt spineboy's 2.5e-3 sliver, catch the rest — and declined: the
    // smallest genuine defect the corpus then held (`flex` at 5.4e-3) and that
    // sliver were within a factor of two, so the wall would have been calibrated
    // on two points and separated nothing. Repairing `flex` does not revive the
    // idea: it removes the only point that was on the other side of the wall.
    // `invariants.deformMayFold` is the escape hatch instead, because *the
    // author* knows whether the page is turning over — and as of #313 nothing in
    // this repository uses it.
    //
    // ## The keys it reads no winding off at all (issue #401)
    //
    // One whose slot draws **no pixels** at that key's own time: faded to alpha
    // exactly 0, or showing another attachment. The message below states the
    // harm as "draws its texture backwards there", and that sentence is false
    // when nothing of the mesh lands — so the key is measured, printed, counted
    // on the stats line and then passed over. A triangle that draws no pixels
    // cannot draw them backwards.
    //
    // 🚨 **Exactly 0, and per key.** At alpha 0.5 a reversed triangle is plainly
    // visible at half strength and this goes on refusing it, with the alpha in
    // the message; any floor above 0 would be this repository choosing a
    // visibility policy, which is the thing an archetype rule exists not to do.
    // And a slot keyed to 0 in ONE animation is still gated in every other,
    // because the measurement is of a time and not of a slot — which is the
    // whole difference between this and `deformMayFold`, and why widening that
    // field was the wrong fix: it would have bought the fade at the price of a
    // blind spot at every angle where the part is fully visible.
    //
    // ## And the times NO key lands on (issue #403)
    //
    // The keys are where the data is; they are not where the runtime is. A deform
    // inside its fold angle at every key can be past it in between, and the
    // exemption above makes that easy to build into rather than merely possible:
    // land the alpha-0 key ON the folding key and the frames just before it are
    // drawn, nearly folded and — until this — unmeasured. Measured on the turn
    // probe: eight reversed triangles at alpha 0.20, gating green.
    //
    // So the survey also scans every SPAN between two consecutive keys. Its
    // arithmetic is a closed form rather than a subdivision count (the derivation
    // is on `wrongSignFractions`), and what it names is then *measured* at that
    // real posed time, alpha included — so a span refusal below is the same
    // measurement as a key refusal, taken at a time no key lands on.
    //
    // ⭐ **A span refusal is suppressed when either of its own two keys is
    // already refused.** The span check exists to say what the keys cannot; when
    // a key has already said it, a second and third message about one defect is
    // noise, and the build is refused either way.
    //
    // ## Where the arithmetic lives
    //
    // In [`src/deformmeasure.ts`](src/deformmeasure.ts), not here — because issue
    // #316's `DEFORM` report block prints the same reversal count this assertion
    // refuses on, and two derivations of one number drift. The survey measures
    // every key of every timeline and every span between them; this reads the
    // reversals out of it and the report prints the rest. What stays here is the
    // SEVERITY and the exemption: the survey has no opinion about either, which
    // is what lets a report run it with no exemption at all.
    check('A39_DEFORM_KEEPS_TRIANGLE_WINDING', () => {
      if (!input.rig) {
        return skip(
          'A39_DEFORM_KEEPS_TRIANGLE_WINDING',
          'no rig info (validating a bare directory), so the rig cannot say which slots fold on purpose',
        );
      }
      const survey = surveyDeformKeys(data, new Set(input.rig.deformMayFold));
      // 🚨 Which dial was turned, when rigc's two halves did not simply agree
      // about that — and BEFORE any of the returns below, because every one of
      // them is a run that posed frames through this dial (issue #427).
      //
      // The verdict used to live in `DeformReach.label`, which `explain` prints
      // and nothing else does, so a `build`-only run — the normal loop, and the
      // one an agent that cannot see the rig actually runs — never learned that
      // the artifact and the probe named different fields.
      //
      // ⛔ Not a refusal, and the measurement rather than taste is why (#427).
      // The frames this survey posed were each checked against `SliderPose.time`
      // by the runtime itself, so a disagreement cannot make it pose one that
      // does not happen; and the field it drives is the largest response the
      // probe found, so it cannot make it miss one that does. What a
      // disagreement CAN do is leave the rig naming a property no settable value
      // of turns far enough — which is what `outside` measures and what an
      // author can act on. A refusal would refuse a rig spine-core poses
      // correctly at every key, with no edit that would make it green.
      //
      // 🔒 A tie is not a disagreement and gets a line that cannot be read as
      // one: there the probe named no field, the artifact broke the tie, and the
      // parent-45° geometry that reaches it is legitimate.
      if (survey.dialTies.length) {
        stats.deformDialsTied = survey.dialTies.length;
        stats.deformDialTied = survey.dialTies.map(dialTieText).join(',');
      }
      if (survey.dialDisputes.length) {
        stats.deformDialsDisagreed = survey.dialDisputes.length;
        stats.deformDialDisagreed = survey.dialDisputes.map(dialDisputeText).join(',');
      }
      /** A key this rule is refusing, by the triple that identifies it. */
      const refusedKey = new Set<string>();
      for (const key of survey.keys) {
        // ⭐ The one thing this rule cannot say about a key that draws nothing.
        // Its own message below states the harm as "draws its texture
        // backwards", and that sentence is false when no pixel of the mesh
        // lands at this time — the slot has faded to alpha 0, or shows another
        // attachment. So the key is measured, reported and not gated (issue
        // #401). Per key and per time: the SAME slot folding at full alpha in
        // another animation, or at another key, is refused as before, which is
        // what makes this a measurement rather than a second `deformMayFold`.
        if (key.draw.blank !== null) continue;
        // And the one thing it cannot say about a key at a time no dial selects
        // (issue #407): the frame posed is not this key's, so its geometry
        // belongs to some other time and a winding read off it would be a
        // measurement of the wrong thing. Named below, on the stats line.
        if (key.dial?.unreachable === true) continue;
        if (key.reversed.length === 0) continue;
        refusedKey.add(`${key.animation} ${key.slot} ${key.attachment} ${key.key}`);
        const shown = key.reversed
          .slice(0, 4)
          .map((r) => `${r.triangle} [${r.ids.join(',')}] ${r.before.toFixed(3)} -> ${r.after.toFixed(3)}px²`);
        const more = key.reversed.length > shown.length ? `, and ${key.reversed.length - shown.length} more` : '';
        fail(
          'A39_DEFORM_KEEPS_TRIANGLE_WINDING',
          // ⚠️ The frame is in the message whenever it is not the track, because
          // the same key can be refused in one frame and passed over in another
          // — two sliders applying one animation are two frames — and a message
          // that named only the key would be ambiguous about which (issue #407).
          `animation "${key.animation}"${frameClause(key.reach)} deform ${key.slot}/${key.attachment} ` +
            `key ${key.key} (t=${key.time}s): ` +
            `${key.reversed.length} of ${key.triangles} triangle(s) reverse winding — triangle ${shown.join('; triangle ')}` +
            `${more}. The mesh has turned inside out there and draws its texture backwards` +
            // The alpha is in the message whenever it is not full, because the
            // one thing that would make this key exempt is alpha exactly 0 and
            // an author who has already faded the part half out needs to be
            // told that half is not none (issue #401).
            (key.draw.alpha === 1
              ? ''
              : ` at alpha ${key.draw.alpha.toFixed(4)} — visible at that strength, and only alpha exactly 0 draws ` +
                'no pixels at all') +
            '. Fix the key\'s ' +
            'offsets in the motion spec\'s deform timeline (a projection past its fold angle is the usual ' +
            'cause — docs/FACE.md §4.2 has the closed form), or, if this slot folds on purpose, declare it ' +
            `in the rig spec as invariants.deformMayFold: [{ "slot": "${key.slot}", "why": … }]`,
        );
      }
      // --- and the folds no key lands on (issue #403) ------------------------
      let spanFolds = 0;
      for (const span of survey.spans) {
        if (span.fold === null) continue;
        // Suppressed when a bounding key already says it: one defect, one
        // message. The span check is here for what the keys cannot see.
        const bounded = `${span.animation} ${span.slot} ${span.attachment} `;
        if (refusedKey.has(bounded + span.fromKey) || refusedKey.has(bounded + span.toKey)) continue;
        spanFolds++;
        const at = span.fold;
        const shown = at.measure.reversed
          .slice(0, 4)
          .map((r) => `${r.triangle} [${r.ids.join(',')}] ${r.before.toFixed(3)} -> ${r.after.toFixed(3)}px²`);
        const more =
          at.measure.reversed.length > shown.length ? `, and ${at.measure.reversed.length - shown.length} more` : '';
        // A stepped segment interpolates NOTHING — it holds the earlier key's
        // geometry across the whole span — so saying "the runtime interpolates"
        // there would be telling the author to look for a defect in the wrong
        // place. What changed across a stepped span is what the slot DRAWS.
        const held = span.curve === 'stepped';
        fail(
          'A39_DEFORM_KEEPS_TRIANGLE_WINDING',
          `animation "${span.animation}"${frameClause(span.reach)} deform ${span.slot}/${span.attachment} ` +
            `BETWEEN key ${span.fromKey} ` +
            `(t=${span.fromTime}s) and key ${span.toKey} (t=${span.toTime}s), at t=${at.time.toFixed(6)}s` +
            (held ? ' (a stepped segment)' : ` — ${(at.percent * 100).toFixed(1)}% of the way from one to the other`) +
            `: ${at.measure.reversed.length} of ${at.measure.triangles} triangle(s) reverse winding — ` +
            `triangle ${shown.join('; triangle ')}${more}. NO KEY LANDS THERE: ` +
            (held
              ? `a stepped segment interpolates nothing, it HOLDS key ${span.fromKey}'s geometry across the whole ` +
                'span — so the fold is that key\'s and what changes here is what the slot draws'
              : 'the runtime interpolates between the two keys, and the mesh is inside out for part of the way') +
            ', drawing its texture backwards' +
            (at.measure.draw.alpha === 1
              ? ''
              : ` at alpha ${at.measure.draw.alpha.toFixed(4)} — visible at that strength, and only alpha exactly 0 ` +
                'draws no pixels at all') +
            '. ' +
            (held
              ? `Fix key ${span.fromKey}'s offsets, or keep the slot drawing nothing for as long as it holds them`
              : 'Add a key inside the span so the geometry the runtime passes through is geometry you wrote, or ' +
                "move the two keys' offsets closer together (a projection past its fold angle is the usual cause " +
                '— docs/FACE.md §4.2 has the closed form)') +
            (at.measure.draw.alpha === 1
              ? ''
              : '; if the part is being faded out over this turn, land the alpha-0 key BEFORE the folding key ' +
                'rather than on it, so every frame that folds is a frame that draws nothing (docs/FACE.md §9.2)') +
            `, or, if this slot folds on purpose, declare it in the rig spec as invariants.deformMayFold: ` +
            `[{ "slot": "${span.slot}", "why": … }]`,
        );
      }
      if (survey.timelines === 0) {
        return skip('A39_DEFORM_KEEPS_TRIANGLE_WINDING', 'no animation carries a deform timeline');
      }
      if (survey.keys.length === 0) {
        const why = [
          survey.exempted.length ? `the rig declares ${survey.exempted.join(', ')} as deformMayFold` : '',
          survey.notAMesh.length ? `${survey.notAMesh.join(', ')} deform an attachment with no triangles` : '',
        ].filter(Boolean);
        return skip(
          'A39_DEFORM_KEEPS_TRIANGLE_WINDING',
          `no deform timeline here has a winding to keep: ${why.join('; ') || 'every mesh keyed has no triangles'}`,
        );
      }
      // ⚠️ Silence is not a pass. A key passed over because nothing of it is
      // drawn has to be visible on a green run too — this is the only surface
      // `validate` has, and `explain`'s DEFORM block prints the whole sentence
      // beside the key's own figures.
      // ⚠️ Unreachable first and `blank` second, in the survey's own order, so
      // the two counts partition the ungated keys instead of double-counting a
      // key that is both.
      const unreachable = survey.keys.filter((k) => k.dial?.unreachable === true);
      const blank = survey.keys.filter((k) => k.dial?.unreachable !== true && k.draw.blank !== null);
      const ungated = blank.length + unreachable.length;
      const name = (k: (typeof survey.keys)[number]): string =>
        `${k.animation}/${k.slot}/${k.attachment}#${k.key}:${k.draw.showsThisMesh ? 'alpha0' : 'notShown'}`;
      // ⚠️ `&& spanFolds === 0` because a rig whose every key draws nothing can
      // still fold at a time between two of them that DOES draw — that is issue
      // #403's own case, and a SKIP printed over a refusal would be this rule
      // reporting "nothing to measure" about the thing it just measured.
      if (ungated === survey.keys.length && spanFolds === 0) {
        const first = blank[0] ?? unreachable[0];
        return skip(
          'A39_DEFORM_KEEPS_TRIANGLE_WINDING',
          `no deform key here is measurable in the frame its animation is reached in — ` +
            `${first.animation} ${first.slot}/${first.attachment} key ${first.key}: ` +
            `${first.draw.blank ?? unreachableWhy(first)}` +
            (survey.keys.length > 1 ? `, and ${survey.keys.length - 1} more key(s) like it` : '') +
            (unreachable.length
              ? `. ${unreachable.length} of them at a time no dial selects, which is a rig defect this rule does ` +
                'not refuse and does not pass over in silence either'
              : '') +
            (survey.spans.length
              ? `. The ${survey.spans.length} span(s) between them were scanned too and none folds where anything ` +
                'is drawn'
              : ''),
        );
      }
      stats.deformKeysMeasured = survey.keys.length - ungated;
      stats.deformTrianglesMeasured = survey.trianglesMeasured;
      stats.deformTrianglesCollapsed = survey.collapsed;
      // Which frame each animation was posed in (issue #407) — printed only when
      // a slider chose one, because on every other rig it says "a track" about
      // every animation and a stats line that never varies is not a reading.
      const frames = [...new Map(survey.keys.map((k) => [`${k.animation}/${k.reach.slider ?? 'track'}`, k])).values()];
      if (frames.some((k) => k.reach.kind === 'slider')) {
        stats.deformFrames = frames
          .map((k) => `${k.animation}:${k.reach.kind === 'slider' ? `slider/${k.reach.slider}` : 'track'}`)
          .join(',');
      }
      if (blank.length) {
        stats.deformKeysNotDrawn = blank.length;
        stats.deformNotDrawn = blank.map(name).join(',');
        if (survey.notDrawnReversed) stats.deformNotDrawnReversed = survey.notDrawnReversed;
      }
      // 🚨 A key at a time no dial can select is NOT a pass and NOT a refusal —
      // it is a rig whose slider cannot reach its own animation's key, named
      // here so a green run cannot be read as having measured it (issue #407).
      if (unreachable.length) {
        stats.deformKeysUnreachable = unreachable.length;
        stats.deformUnreachable = unreachable
          .map((k) => `${k.animation}/${k.slot}/${k.attachment}#${k.key}@${k.dial?.applied.toFixed(6) ?? '?'}`)
          .join(',');
        if (survey.notReachableReversed) stats.deformUnreachableReversed = survey.notReachableReversed;
      }
      if (survey.exempted.length) stats.deformFoldExempt = survey.exempted.join(',');
      // ⚠️ The between-keys scan on the stats line, on a GREEN run too (issue
      // #403). `deformSpansScanned` is the positive control an agent can read —
      // a scan that ran and found nothing has to be distinguishable from a scan
      // that never ran — and `deformSpanProbes` is what it cost: 0 on a rig the
      // closed form flags nothing in, one posed measurement per flagged window
      // otherwise.
      stats.deformSpansScanned = survey.spans.length;
      // ⚠️ And the ones it could NOT scan, for the same reason the line above
      // exists: a span bounded by a key at a time no dial selects would be
      // solved over two poses of some other time, so it is skipped — and a skip
      // nobody can see is the silence this whole surface is against (#407).
      if (survey.spansNotScanned) stats.deformSpansNotScanned = survey.spansNotScanned;
      if (survey.spanProbes) stats.deformSpanProbes = survey.spanProbes;
      if (survey.spansNotDrawn) stats.deformSpansNotDrawn = survey.spansNotDrawn;
      // A prediction nothing reproduced. Never a refusal — that would be the
      // false red issues #44 and #262 already cost this file — and never a
      // silence either: the one case that reaches it is a weighted mesh whose
      // bones move across the span, where the closed form's fixed-pose
      // assumption is the thing that did not hold.
      if (survey.spansUnconfirmed) stats.deformSpansUnconfirmed = survey.spansUnconfirmed;
    });

    // --- A23: a physics constraint that does nothing, quietly ---------------
    //
    // Every failure mode here is silent. The five component fields default to
    // 0, so a constraint can drive nothing at all; `mix` 0 mutes it; `mass` 0
    // becomes an infinite massInverse; and `damping` >= 1 never settles, which
    // on a mesh-driving bone means the canvas re-rasterises forever.
    //
    // 🔑 **Two arms, one criterion.** The second arm below reads every physics
    // TIMELINE key, and it is written against `PHYSICS_POSE_RULES` — the table
    // this one is also written against, and the table `compileValueTrack`
    // refuses a spec's own out-of-range number with. Three readings of one rule
    // is how two of them come to disagree, so there is one (issue #610).
    check('A23_PHYSICS_CONSTRAINT_EFFECTIVE', () => {
      // ⟨subject⟩_⟨property⟩, and its two siblings already read this way: A36
      // skips on "the skeleton declares no path constraint" and A37 on "no
      // slider constraint", while this one passed over an empty filter (#580).
      // The stat is written before the guard so a reader of a SKIP still sees
      // the count that produced it.
      stats.physicsConstraints = data.constraints.filter((c) => c instanceof PhysicsConstraintData).length;
      if (stats.physicsConstraints === 0) return skip('A23_PHYSICS_CONSTRAINT_EFFECTIVE', SKIP_NO_PHYSICS_CONSTRAINT);
      const meshBoneNames = new Set<string>();
      for (const slotIndex of meshSlots) meshBoneNames.add(data.slots[slotIndex].boneData.name);
      for (const mesh of meshAttachments) {
        if (!mesh.bones) continue;
        for (let i = 0; i < mesh.bones.length; ) {
          const boneCount = mesh.bones[i++];
          for (let n = 0; n < boneCount; n++, i++) {
            const bone = data.bones[mesh.bones[i]];
            if (bone) meshBoneNames.add(bone.name);
          }
        }
      }
      for (const constraint of data.constraints) {
        if (!(constraint instanceof PhysicsConstraintData)) continue;
        const where = `physics "${constraint.name}"`;
        const components = PHYSICS_COMPONENTS.filter((k) => constraint[k] > 0);
        if (!components.length) {
          fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} drives no component; it parses and does nothing`);
        }
        const pose = constraint.setupPose;
        // The four bounded fields, each judged by its `PHYSICS_POSE_RULES` row.
        // The wording is per-field and stays so: "it is muted" and "nothing
        // pulls it back" say what happens to THIS rig, which is what the author
        // needs, and the shared table supplies the predicate rather than the
        // sentence.
        for (const rule of PHYSICS_POSE_RULES) {
          if (rule.poseOk(pose[rule.field])) continue;
          const drivesAMesh = rule.timeline === 'damping' && meshBoneNames.has(constraint.bone.name);
          fail(
            'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
            `${where} ${SETUP_POSE_SAYS[rule.timeline](pose)}` +
              (drivesAMesh ? ' — and this bone drives a mesh, so the canvas never rests' : ''),
          );
        }
        if (constraint.step <= 0 || !Number.isFinite(constraint.step)) {
          fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has step ${constraint.step} (fps must be > 0)`);
        }
      }

      // --- the same criterion, on every physics timeline key (issue #610) ----
      //
      // The arm above reads the setup pose and, until this one existed, nothing
      // else — complete while a motion spec could key `mix` and `reset` only,
      // and incomplete from #593 on, when it became able to key all seven.
      //
      // 📏 Measured on the tree before this landed, one keyed value at a time on
      // a generated physics rig, 24 steps at 60 fps: `mass: 0` reached
      // `massInverse` Infinity and every offset NaN — named by
      // `A10_NO_NAN_AFTER_STEPPING`, from the BONE, with no word about the
      // animation, the constraint, the timeline or the key; `damping: 2` ran the
      // x offset to −26,634 and the velocity to −1.55e6 and still climbing, with
      // **zero** gate failures; `strength: 0` drifted monotonically with zero gate
      // failures; `mix: 1.5` produced zero gate failures and an integration
      // identical to `mix: 1`, because mix multiplies the finished offset onto
      // the bone and never enters the solve.
      //
      // ⭐ The value is judged where the runtime keeps it, not where the file
      // writes it: `timeline.set` is the runtime's own accessor, so a `mass` key
      // lands in the probe as its reciprocal and is then held to exactly the
      // predicate the setup arm holds `setupPose.massInverse` to.
      const probe = new PhysicsConstraintPose();
      let keysRead = 0;
      for (const animation of data.animations) {
        for (const timeline of animation.timelines) {
          if (!(timeline instanceof PhysicsConstraintTimeline)) continue;
          // `ConstraintTimeline1` encodes its propertyId as `<Property>|<index>`,
          // so the name comes from the runtime's own enum rather than from a
          // table of strings this file would have to keep in step.
          const name = PHYSICS_TIMELINE_NAMES[Number(timeline.getPropertyIds()[0].split('|')[0])];
          if (name === undefined) continue;
          const rule = physicsRuleFor(name);
          // -1 is the global form: the timeline drives every physics constraint
          // whose matching `…Global` flag is set, so there is no one name to give.
          const target =
            timeline.constraintIndex === -1
              ? 'every physics constraint'
              : `physics "${data.constraints[timeline.constraintIndex]?.name ?? `#${timeline.constraintIndex}`}"`;
          const entries = timeline.getFrameEntries();
          for (let i = 0; i < timeline.frames.length; i += entries) {
            keysRead++;
            if (rule === undefined) continue;
            const value = timeline.frames[i + 1];
            timeline.set(probe, value);
            const refusal = physicsKeyRefusal(rule, value, probe[rule.field]);
            if (refusal === null) continue;
            fail(
              'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
              `animation "${animation.name}" ${target} ${name} key at t=${timeline.frames[i].toFixed(6)}s is ${refusal}`,
            );
          }
        }
      }
      stats.physicsTimelineKeys = keysRead;
    });

    // --- A41: a physics component the Spine editor cannot hold --------------
    //
    // 🚨 The silence this converts is not in the artifact — it is one consumer
    // downstream of it. An author builds a rig whose cowlick jiggles, opens it
    // in the editor to move an eyebrow, saves, exports, and the hair has stopped
    // moving. The returned file says nothing: the component is simply absent,
    // and absent parses as 0. `gallery/look` is exactly that rig.
    //
    // 🔑 **rigc's output is correct, so the refusal is opt-in.** `rotate` on a
    // physics constraint is valid Spine 4.3 that every runtime plays, and
    // refusing it by default would be refusing correct data on behalf of a
    // pipeline rigc was never told about. What rigc can see is the object; which
    // consumers it is for is the rig's to say, and it says it with
    // `invariants.editorRoundTrip` (`src/rig.ts`).
    //
    // ⚠️ **The SKIP is the other half of the product and is not a shrug.** A rig
    // that declares nothing is not gated — but the reason names the constraint
    // and the components a round trip would drop, so the one thing that must not
    // happen (nobody finds out) does not happen either. That is why this reads
    // the whole skeleton before it reads the declaration, rather than returning
    // early on a rig that asked for nothing.
    //
    // 🔸 **Against A23, on the far side of the same trip.** A23 refuses a
    // constraint driving NOTHING — which is what the editor hands back, after
    // the loss — and it is what fires today on a round-tripped `look`. This
    // refuses a constraint driving something the editor will not keep, before
    // the trip. They cannot both fire on one constraint: A23's condition is an
    // empty driven set and this one's is a non-empty one (see
    // `PHYSICS_COMPONENTS`), so the two are disjoint by construction rather than
    // by agreement.
    //
    // `validity` rather than policy, on A09's precedent: what it measures is the
    // artifact against a claim the artifact's own spec makes, and a rig that
    // makes no such claim has nothing to be measured against and SKIPs. Nothing
    // here is one renderer's taste or one formation's shape, so there is no
    // profile it should be hidden behind.
    check('A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP', () => {
      // Counted here rather than read off `stats.physicsConstraints`: that entry
      // is written by A23, and a rule whose SKIP depends on another rule having
      // run is a rule that reports "nothing to measure" when its neighbour threw.
      const physics = data.constraints.filter((c) => c instanceof PhysicsConstraintData);
      const dropped: string[] = [];
      for (const constraint of physics) {
        const lost = PHYSICS_COMPONENTS.filter((k) => constraint[k] > 0 && !EDITOR_PHYSICS_COMPONENTS.has(k));
        if (lost.length) dropped.push(`physics "${constraint.name}" drives ${lost.join(', ')}`);
      }
      const editorKeeps = [...EDITOR_PHYSICS_COMPONENTS].join(' and ');
      const found =
        dropped.length === 0
          ? 'no physics constraint here drives a component it would discard'
          : `${dropped.join('; ')}, and the editor's physics model holds ${editorKeeps} only, so a round trip ` +
            'returns that constraint driving nothing at all (issue #540)';
      if (input.rig?.editorRoundTrip !== true) {
        return skip(
          'A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP',
          `${
            input.rig
              ? `the rig "${input.rig.archetype}" does not declare \`invariants.editorRoundTrip\``
              : 'this is a bare directory, with no rig info to declare `invariants.editorRoundTrip`'
          }, so nothing here is gated against the Spine editor. What is here: ${found}`,
        );
      }
      if (physics.length === 0) {
        return skip(
          'A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP',
          `the rig "${input.rig.archetype}" is declared for the editor, but it carries no physics constraint — ` +
            'there is nothing here whose components could be lost',
        );
      }
      for (const one of dropped) {
        fail(
          'A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP',
          `${one}; the editor's physics model holds ${editorKeeps} only, and this ` +
            'rig declares `invariants.editorRoundTrip` — drive it in x/y, or drop the declaration if this rig never ' +
            'goes through the editor (issue #540)',
        );
      }
    });

    /**
     * Does any animation key `<group>.<constraint>.<timeline>`?
     *
     * ⭐ The reason the two assertions below need this, and the reason they are
     * not A23 with a different type name: a constraint whose mixes are all 0 at
     * setup is **the idiom**, not a defect — spineboy's aim rig is exactly that,
     * and issue #88 landed the timelines that turn one on. So "muted" is only a
     * finding when nothing turns it on, and that question lives in the animations
     * rather than in the constraint.
     */
    const keyedBy = (group: string, name: string, timeline: string): boolean => {
      if (!raw || !isObj(raw.animations)) return false;
      for (const anim of Object.values(raw.animations as Json)) {
        if (!isObj(anim) || !isObj(anim[group])) continue;
        const timelines = (anim[group] as Json)[name];
        if (!isObj(timelines)) continue;
        const keys = timelines[timeline];
        if (Array.isArray(keys) && keys.length > 0) return true;
      }
      return false;
    };

    // --- A36: a path constraint that follows nothing, quietly ---------------
    //
    // 🚨 The first failure here is the quietest in the whole constraint half of
    // the format. `PathConstraint.update` opens with
    //
    //   const attachment = this.slot.appliedPose.attachment;
    //   if (!(attachment instanceof PathAttachment)) return;
    //
    // so a path constraint aimed at a slot that never shows a path loads
    // perfectly, reports every mix it was given, appears in the update cache —
    // and moves nothing, forever. Nothing in the file is wrong on its face: the
    // slot exists, the constraint resolves, the mixes are 1.
    //
    // The rest are the same shape as A23's: a constraint that parses and does
    // nothing. All three mixes at 0 is only a finding when no animation keys the
    // `mix` timeline (see `keyedBy`), and a chain with no bones on it is one
    // whether or not anything is keyed.
    check('A36_PATH_CONSTRAINT_EFFECTIVE', () => {
      const constraints = data.constraints.filter((c) => c instanceof PathConstraintData);
      if (!constraints.length) return skip('A36_PATH_CONSTRAINT_EFFECTIVE', 'the skeleton declares no path constraint');
      /** slot index -> how many path attachments any skin gives it. */
      const pathsBySlot = new Map<number, number>();
      for (const skin of data.skins) {
        for (const entry of skin.getAttachments()) {
          if (!(entry.attachment instanceof PathAttachment)) continue;
          pathsBySlot.set(entry.slotIndex, (pathsBySlot.get(entry.slotIndex) ?? 0) + 1);
        }
      }
      for (const constraint of constraints) {
        const where = `path constraint "${constraint.name}"`;
        if (!constraint.bones.length) {
          fail('A36_PATH_CONSTRAINT_EFFECTIVE', `${where} constrains no bone; it parses and does nothing`);
        }
        const slot = constraint.slot;
        if (!pathsBySlot.has(slot.index)) {
          fail(
            'A36_PATH_CONSTRAINT_EFFECTIVE',
            `${where} follows slot "${slot.name}", and no skin gives that slot a path attachment — ` +
              "PathConstraint.update returns immediately unless the slot's attachment is a path, so this " +
              'constraint reports its mixes and moves nothing',
          );
        }
        const pose = constraint.setupPose;
        const muted = !(pose.mixRotate > 0) && !(pose.mixX > 0) && !(pose.mixY > 0);
        if (muted && !keyedBy('path', constraint.name, 'mix')) {
          fail(
            'A36_PATH_CONSTRAINT_EFFECTIVE',
            `${where} has mixRotate ${pose.mixRotate}, mixX ${pose.mixX} and mixY ${pose.mixY} at setup and no ` +
              'animation keys its mix timeline; update() returns on all-zero mixes, so nothing ever puts a bone on the path',
          );
        }
      }
      stats.pathConstraints = constraints.length;
    });

    // --- A37: a slider that applies nothing, quietly ------------------------
    //
    // A slider is the only constraint that applies an ANIMATION, so its failure
    // modes are about that animation rather than about a transform:
    //
    //   1. **An animation with no timelines.** `animation.apply` walks an empty
    //      array. The slider is in the update cache, its time moves, and the
    //      skeleton never changes.
    //   2. **`loop` on a zero-length animation.** `Slider.update` computes
    //      `animation.duration + (p.time % animation.duration)` when looping, so
    //      a duration of 0 makes the time **NaN** — and it then applies the
    //      animation at NaN, which is a pose nobody can predict and no error.
    //      Only reachable with a bone, because that is the branch the loop
    //      arithmetic lives in.
    //   3. **`scale` 0 with a bone.** `time = offset + (value - offset) * 0`, so
    //      the dial turns and the slider holds one frame.
    //   4. **`mix` 0** with nothing keying it — the same rule as A36's.
    check('A37_SLIDER_CONSTRAINT_EFFECTIVE', () => {
      const sliders = data.constraints.filter((c) => c instanceof SliderData);
      if (!sliders.length) return skip('A37_SLIDER_CONSTRAINT_EFFECTIVE', 'the skeleton declares no slider constraint');
      for (const slider of sliders) {
        const where = `slider "${slider.name}"`;
        const animation = slider.animation;
        if (!animation) {
          // The parser's second pass throws on a miss, so this is only reachable
          // on an artifact that never went through it.
          fail('A37_SLIDER_CONSTRAINT_EFFECTIVE', `${where} applies no animation`);
          continue;
        }
        if (animation.timelines.length === 0) {
          fail(
            'A37_SLIDER_CONSTRAINT_EFFECTIVE',
            `${where} applies animation "${animation.name}", which carries no timeline at all; the slider runs and ` +
              'the skeleton never changes',
          );
        }
        if (slider.bone && slider.loop && !(animation.duration > 0)) {
          fail(
            'A37_SLIDER_CONSTRAINT_EFFECTIVE',
            `${where} loops animation "${animation.name}", whose duration is ${animation.duration} — ` +
              'Slider.update computes `duration + (time % duration)` when looping, so the applied time is NaN',
          );
        }
        if (slider.bone && slider.scale === 0) {
          fail(
            'A37_SLIDER_CONSTRAINT_EFFECTIVE',
            `${where} drives off bone "${slider.bone.name}" with scale 0, so the property cannot move the slider's time`,
          );
        }
        const mix = slider.setupPose.mix;
        if (!(mix > 0) && !keyedBy('slider', slider.name, 'mix')) {
          fail(
            'A37_SLIDER_CONSTRAINT_EFFECTIVE',
            `${where} has mix ${mix} at setup and no animation keys its mix timeline; update() returns on mix 0`,
          );
        }
      }
      stats.sliderConstraints = sliders.length;
    });

    // --- A40: two sliders on one property, and the later one erases the other -
    //
    // 🚨 The hole A37 leaves. Every clause above is INTRA-slider — it asks
    // whether one slider applies anything at all — so nothing in the gate had an
    // opinion about two of them meeting, which is the shape a parameter-driven
    // face IS: one slider per axis, all of them on the same bones.
    //
    // `Slider.update` ends with
    //
    //   animation.apply(skeleton, p.time, p.time, data.loop, null, p.mix,
    //                   MixFrom.current, data.additive, false, true)
    //
    // and `additive` defaults to **false** (`SkeletonJson.js`: `getValue(map,
    // "additive", false)`). With `add` false and `alpha` 1 every value function
    // in `Animation.js` drops the pose it was handed — `getRelativeValue`
    // returns `setup + value`, `getAbsoluteValue` and `getScaleValue` return
    // `value` — so whatever an earlier slider wrote to that property is gone,
    // and the sliders run in the order the `constraints` array puts them in
    // (`Skeleton.updateCache` walks that array and each `Slider.sort` pushes
    // itself onto the update cache as it is reached).
    //
    // [measured, issue #402, and reproduced by the controls in `selftest.ts`]
    // Two dials on one bone contributing 7.50° and 18.75°: both at the default
    // pose the bone at **18.7498°** — the later one alone; the same pair with
    // the array order swapped poses **7.4999°** — the other one alone; both
    // `additive: true` pose **26.2497°**, the sum. On a three-axis face two axes
    // are silently dead, the rig builds, and every other assertion is green.
    //
    // ## ⚠️ Why this is `validity`
    //
    // Because the claim is Spine's own arithmetic and not this project's taste:
    // a skeleton shaped this way is wrong for every runtime that plays it, so a
    // `renderer` or `archetype` kind would exclude the rule from `--profile
    // spine` — the CLI default — and the rig the issue is about would build
    // green for exactly the stranger it was written for.
    //
    // The counter-question is the one issues #44 and #262 cost this file twice:
    // can correct editor output trip it? Three shapes could, and each is
    // excluded STRUCTURALLY rather than by a threshold:
    //
    //   1. **Authority below 1.** At `mix < 1` the apply is a lerp from the
    //      current pose (`current + (value + setup - current) * alpha`), so the
    //      earlier slider still contributes and a chain of partial mixes is a
    //      legitimate — if order-dependent — weighting. A slider whose setup mix
    //      is under 1, or whose `mix` any animation keys, is dropped before the
    //      comparison. This assertion has no opinion below full authority.
    //   2. **A skin switch.** `Skeleton.updateCache` makes a `skinRequired`
    //      constraint active only while `skin.constraints.includes(data)`, and a
    //      skeleton wears one skin, so two sliders listed by disjoint skins can
    //      never be active in the same frame and cannot erase each other.
    //   3. **Different properties.** The unit compared is spine-core's own
    //      `Timeline.propertyIds`, so two sliders on one bone that key different
    //      properties — a yaw that rotates and a lift that translates — are not
    //      a finding, and a partial overlap is refused only on the properties
    //      that actually overlap.
    //
    // What is left is not a judgement call. At full authority, with both sliders
    // active, there is no value of the erased slider's dial at which it changes
    // that property: it is dead weight on every frame. That is also why this
    // rule has no `invariants` escape hatch where A39 needs one — there is
    // nothing an author could be preserving.
    //
    // ⚠️ Unmeasured, and stated as such: no editor export in this repository
    // carries a slider AT ALL — it is 4.3's newest constraint — so unlike A39
    // the "correct editor output" question rests on the runtime's arithmetic
    // rather than on a counter-example anybody has held. If an export ever
    // trips it, this paragraph is the one to reread.
    //
    // ## The second clause: `additive: true` is not always available
    //
    // A slot colour, an attachment swap, a draw order, an ik mix and a path's
    // spacing IGNORE the `add` argument entirely (`RGBATimeline.apply1` takes it
    // and never reads it), so two sliders sharing one of those overwrite each
    // other whatever the flags say. Refusing that case too is what keeps this
    // message from teaching a fix that does not work: an author told to set
    // `additive: true` on a shared rgba would get a green gate over the same
    // dead axis.
    //
    // 🚨 **Which class is which is MEASURED, and reading the flag was wrong.**
    // This clause used to ask `Timeline.additive`, the runtime's own declaration
    // that a class supports additive application — and two classes declare
    // `false` and honour `add` anyway. `PathConstraintMixTimeline` and
    // `SliderTimeline` pass the argument straight through, so two additive
    // sliders keying one path constraint's `mix`, or one bone-less slider's
    // `time`, **do** compose as the plain sum, and this assertion refused them
    // by name with a sentence about the runtime the runtime does not perform
    // (issue #655; `PS143` poses all thirty spellings of the motion vocabulary
    // and `PS140` holds the `time` case to a grid). `timelineAddBehaviour`
    // above poses each shared timeline instead, so what is compared is what the
    // class does rather than what it says about itself.
    //
    // ## The events clause, removed rather than narrowed
    //
    // The same reading refused two sliders whose animations both fire events,
    // and that refusal was over a property no pose can distinguish: `Slider`
    // applies its animation with `firedEvents` **null**
    // (`Slider.js`: `animation.apply(skeleton, p.time, p.time, data.loop, null,
    // …)`), and `EventTimeline.apply` opens with `if (!firedEvents) return`, so
    // a slider fires no event at all. Neither slider has anything on that
    // property for the other to erase. The same is true of a physics `reset`
    // under a slider, where `lastTime === time` leaves its window empty.
    //
    // ⭐ Neither is named here, and that is the point: the probe's third state
    // is **a timeline that writes nothing at all**, so both fall out of one
    // measurement instead of two exceptions. A list of unobservable spellings
    // written into this file would have been the hand-kept table that produced
    // the defect above.
    check('A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET', () => {
      const sliders = data.constraints.filter((c) => c instanceof SliderData);
      if (sliders.length < 2) {
        return skip(
          'A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET',
          `the skeleton declares ${sliders.length} slider constraint${sliders.length === 1 ? '' : 's'}, and one slider has nothing to compose with`,
        );
      }
      // Clause 1 of the "could this be correct?" list above.
      const authoritative = sliders.filter((s) => s.setupPose.mix >= 1 && !keyedBy('slider', s.name, 'mix'));
      if (authoritative.length < 2) {
        return skip(
          'A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET',
          `${authoritative.length} of the ${sliders.length} slider constraints apply at full authority; below mix 1 an ` +
            'apply is a lerp from the current pose rather than an overwrite, so what the others do to a shared property is a weighting',
        );
      }
      /** Which skins switch a slider on, or null when it is active under every skin. */
      const skinsOf = new Map<SliderData, Set<string> | null>();
      for (const slider of authoritative) {
        if (!slider.skinRequired) {
          skinsOf.set(slider, null);
          continue;
        }
        const names = new Set<string>();
        for (const skin of data.skins) {
          if (skin.constraints.includes(slider)) names.add(skin.name);
        }
        skinsOf.set(slider, names);
      }
      /** Clause 2: can these two ever run in the same frame? */
      const canOverlap = (a: SliderData, b: SliderData): boolean => {
        const skinsA = skinsOf.get(a) ?? null;
        const skinsB = skinsOf.get(b) ?? null;
        if (!skinsA || !skinsB) return true;
        for (const name of skinsA) {
          if (skinsB.has(name)) return true;
        }
        return false;
      };
      /** What a property id points at, in the words the rig spec uses. */
      const describe = (timeline: Timeline, id: string): string => {
        const property = Property[Number(id.split('|')[0])] ?? id;
        if (isBoneTimeline(timeline)) return `bone "${data.bones[timeline.boneIndex]?.name ?? timeline.boneIndex}" ${property}`;
        if (timeline instanceof DeformTimeline) {
          return `slot "${data.slots[timeline.slotIndex]?.name ?? timeline.slotIndex}" deform of "${timeline.attachment.name}"`;
        }
        if (isSlotTimeline(timeline)) return `slot "${data.slots[timeline.slotIndex]?.name ?? timeline.slotIndex}" ${property}`;
        if (isConstraintTimeline(timeline) && timeline.constraintIndex >= 0) {
          return `constraint "${data.constraints[timeline.constraintIndex]?.name ?? timeline.constraintIndex}" ${property}`;
        }
        return `the skeleton's ${property}`;
      };
      /** property id -> the sliders whose animation keys it, in constraints-array order. */
      const byProperty = new Map<string, Array<{ slider: SliderData; timeline: Timeline }>>();
      for (const slider of authoritative) {
        const seen = new Set<string>();
        for (const timeline of slider.animation?.timelines ?? []) {
          for (const id of timeline.propertyIds) {
            if (seen.has(id)) continue;
            seen.add(id);
            byProperty.set(id, [...(byProperty.get(id) ?? []), { slider, timeline }]);
          }
        }
      }
      /** Posed once per timeline, because the answer is the class's and the rigs that reach here share timelines. */
      const behaviour = new Map<Timeline, TimelineAddBehaviour>();
      const addBehaviourOf = (timeline: Timeline): TimelineAddBehaviour => {
        const known = behaviour.get(timeline);
        if (known !== undefined) return known;
        const measured = timelineAddBehaviour(data, timeline);
        behaviour.set(timeline, measured);
        return measured;
      };
      let shared = 0;
      for (const [id, users] of byProperty) {
        if (users.length < 2) continue;
        shared++;
        const at = (slider: SliderData): string =>
          `"${slider.name}" (constraints[${data.constraints.indexOf(slider)}], additive: ${String(slider.additive)})`;
        const chain = users.map((u) => at(u.slider)).join(', ');
        for (let j = 1; j < users.length; j++) {
          const later = users[j];
          const composes = addBehaviourOf(later.timeline);
          if (composes === 'accumulates' && later.slider.additive) continue;
          // Nothing a second slider could take away: applied with the arguments
          // a slider passes — `firedEvents` null among them — this timeline
          // moves no pose at all.
          if (composes === 'inert') continue;
          const erased = users.slice(0, j).filter((e) => canOverlap(e.slider, later.slider));
          if (!erased.length) continue;
          const erasedNames = `${erased.map((e) => `"${e.slider.name}"`).join(', ')} contribute${erased.length === 1 ? 's' : ''}`;
          const why =
            composes === 'accumulates'
              ? `slider "${later.slider.name}" applies animation "${later.slider.animation?.name}" with additive false, and at ` +
                'mix 1 a non-additive apply writes the value outright (`getRelativeValue` returns `setup + value`, ' +
                '`getAbsoluteValue` returns `value`) rather than adding to the pose it found. Set `"additive": true` on ' +
                `slider "${later.slider.name}" in the rig spec — rigc will not choose that flag for you — or key this ` +
                `property from one slider only. [measured] \`${later.timeline.constructor.name}.apply\` posed twice with ` +
                '`add` set accumulates, so that flag is the repair here'
              : `the ${Property[Number(id.split('|')[0])] ?? id} timeline they share writes its value outright whatever the ` +
                `flags say — [measured] \`${later.timeline.constructor.name}.apply\` posed twice with \`add\` set left the ` +
                'same value there rather than adding to it — so `"additive": true` would NOT compose these. Key this ' +
                'property from one slider only, or move both edits into the one animation a single slider applies';
          fail(
            'A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET',
            `${describe(later.timeline, id)} is keyed by the animations of ${users.length} sliders — ${chain} — and every ` +
              `one of them applies at mix 1. Today ${at(later.slider)} wins that property and ${erasedNames} ` +
              `nothing to it: ${why}.`,
          );
        }
      }
      stats.sliderSharedTargets = shared;
    });

    // --- A42: a dial that drives a slider the array already ran -------------
    //
    // 🚨 The hole A40 leaves, and it leaves it BY CONSTRUCTION. A40's population
    // is the sliders at full authority whose own `mix` nothing keys, so the one
    // pair this rule is about — a slider whose `mix` IS keyed — is excluded
    // before any timeline is looked at. Between them the two rules ask different
    // questions about the same array: A40 asks who writes a shared property
    // last, this asks whether anybody reads what was written at all.
    //
    // `Skeleton.updateCache` walks `constraints` in order and each `Slider.sort`
    // pushes itself onto the update cache as it is reached, so the array IS the
    // update order. `Slider.update` then opens with
    //
    //   const p = this.appliedPose;
    //   if (p.mix === 0) return;
    //   … animation.apply(skeleton, p.time, p.time, data.loop, null, p.mix, …)
    //
    // — both `mix` and `time` are read off the applied pose BEFORE the animation
    // runs. So a slider that keys another slider's `mix` or `time` is read by
    // that slider only when the driven one comes LATER in the array; written the
    // other way round the value lands in a pose whose only reader has already
    // run, and `Posed.resetConstrained` copies `pose` back over it before the
    // next frame. The dial turns, the pose holds the number, and nothing moves.
    //
    // ⭐ The runtime repairs this for BONES and not for constraints, which is
    // why an author cannot reason it out from the bone case. `Slider.sort`
    // clears `sorted` on every bone its animation keys and re-sorts them, so
    // those bones always update after the slider; for a constraint it calls
    // `skeleton.constrained(constraints[t.constraintIndex])`, which only swaps
    // the pose the constraint will be read through and moves nothing in the
    // update cache.
    //
    // 🔒 Keying its OWN `mix` or `time` is the same failure with the indices
    // equal, and it is the one A37 cannot see: A37 asks whether any animation
    // keys the slider's `mix` and the slider's own animation is one of them, so
    // a slider muted at setup that keys its own `mix` up reports green and is
    // dead forever — `update` returns on `mix === 0` before the animation that
    // would raise it is ever applied.
    //
    // [measured, issue #658] Two dials, the second keying the first's `mix`
    // 0 -> 1: in the declared order the flag bone runs 0.000000° to 105.000000°
    // over the grid and the driven dial's own travel is 18.750000° per row; with
    // the two array entries swapped that travel is 0.000000° at every row while
    // the driven slider's `mix` still reads back 0.250000 .. 1.000000. The gate
    // was green on both.
    check('A42_DRIVEN_SLIDERS_UPDATE_AFTER_THEIR_DRIVER', () => {
      const sliders = data.constraints.filter((c) => c instanceof SliderData);
      if (!sliders.length) {
        return skip('A42_DRIVEN_SLIDERS_UPDATE_AFTER_THEIR_DRIVER', 'the skeleton declares no slider constraint');
      }
      /** `sliderTime` / `sliderMix` in the words a motion spec writes them. */
      const drivenProperty = (timeline: Timeline): 'time' | 'mix' | null => {
        for (const id of timeline.propertyIds) {
          const property = Property[Number(id.split('|')[0])];
          if (property === 'sliderTime') return 'time';
          if (property === 'sliderMix') return 'mix';
        }
        return null;
      };
      let pairs = 0;
      for (const driver of sliders) {
        const driverIndex = data.constraints.indexOf(driver);
        for (const timeline of driver.animation?.timelines ?? []) {
          const property = drivenProperty(timeline);
          if (property === null || !isConstraintTimeline(timeline)) continue;
          const drivenIndex = timeline.constraintIndex;
          const driven = data.constraints[drivenIndex];
          if (!(driven instanceof SliderData)) continue;
          pairs++;
          if (drivenIndex > driverIndex) continue;
          const animation = `animation "${driver.animation?.name}"`;
          fail(
            'A42_DRIVEN_SLIDERS_UPDATE_AFTER_THEIR_DRIVER',
            drivenIndex === driverIndex
              ? `slider "${driver.name}" (constraints[${driverIndex}]) keys its own \`${property}\` in ${animation}. ` +
                  '`Slider.update` reads `appliedPose.' +
                  `${property}\` as the ${property === 'mix' ? 'alpha it applies that animation with' : 'time it applies that animation at'}, ` +
                  'before the animation runs, so the key is written after its only reader and `Posed.resetConstrained` ' +
                  `puts the pose back before the next frame${
                    property === 'mix'
                      ? ' — and at `mix` 0 `update` returns before applying anything at all, so the key that would raise it is unreachable'
                      : ''
                  }. Key \`slider.${driver.name}.${property}\` from a slider EARLIER in \`constraints\`, or state the ` +
                  `\`${property}\` this slider should start at in the rig spec`
              : `slider "${driver.name}" (constraints[${driverIndex}]) keys \`${property}\` of slider "${driven.name}" ` +
                  `(constraints[${drivenIndex}]) in ${animation}, and "${driven.name}" updates FIRST. The \`constraints\` ` +
                  'array is the update order (`Skeleton.updateCache` walks it and each `Slider.sort` pushes itself as it ' +
                  `is reached) and \`Slider.update\` reads its own \`appliedPose.${property}\` before applying anything, ` +
                  `so that key is written after the only read of it and \`Posed.resetConstrained\` discards it before ` +
                  `the next frame: the axis "${driven.name}" drives is dead at every reading of "${driver.name}"'s dial, ` +
                  `although its pose still holds the number. Move "${driver.name}" before "${driven.name}" in ` +
                  `\`constraints\`, or key \`slider.${driven.name}.${property}\` from a slider that already is`,
          );
        }
      }
      if (pairs === 0) {
        return skip(
          'A42_DRIVEN_SLIDERS_UPDATE_AFTER_THEIR_DRIVER',
          `no animation applied by one of the ${sliders.length} slider constraint${sliders.length === 1 ? '' : 's'} keys a ` +
            "slider's `mix` or `time`, so no slider here drives another",
        );
      }
      stats.sliderDrivenSliders = pairs;
    });

    // --- A38: a per-skin member list and its `skin: true` flag agree --------
    //
    // 🚨 Two halves of one switch, and either half alone is dead data in silence.
    // `Skeleton.updateCache` (`:191-217`) starts every bone `active` unless it is
    // `skinRequired`, then activates the current skin's `bones` **and their whole
    // ancestor chain**; a constraint is `active` unless `skinRequired`, and then
    // only while `skin.constraints.includes(data)`. So:
    //
    //   * listed without `skin: true` — the object is active under every skin,
    //     and the list changes nothing at all;
    //   * `skin: true` and listed nowhere — the object is inactive under every
    //     skin there is: a bone that never poses, a constraint that never runs.
    //
    // Both load. Both animate. Neither is what the author wrote, and no other
    // check in this file can see either one, because the artifact is internally
    // consistent — it is the PAIRING that is wrong.
    check('A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED', () => {
      /** Every bone a skin can switch on, including the ancestors it drags in. */
      const activatable = new Set<string>();
      const listedConstraints = new Map<string, string>();
      let listed = 0;
      for (const skin of data.skins) {
        for (const bone of skin.bones) {
          listed++;
          for (let cursor: BoneData | null = bone; cursor; cursor = cursor.parent) activatable.add(cursor.name);
          if (!bone.skinRequired) {
            fail(
              'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED',
              `skin "${skin.name}" activates bone "${bone.name}", which is not skinRequired — updateCache starts it ` +
                'active anyway, so it poses under every skin and this list changes nothing',
            );
          }
        }
        for (const constraint of skin.constraints) {
          listed++;
          listedConstraints.set(constraint.name, skin.name);
          if (!constraint.skinRequired) {
            fail(
              'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED',
              `skin "${skin.name}" activates constraint "${constraint.name}", which is not skinRequired — it runs ` +
                'under every skin, so this list changes nothing',
            );
          }
        }
      }
      const required = data.bones.filter((b) => b.skinRequired).length + data.constraints.filter((c) => c.skinRequired).length;
      if (listed === 0 && required === 0) {
        return skip(
          'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED',
          'no skin activates a bone or a constraint, and nothing declares itself skinRequired',
        );
      }
      for (const bone of data.bones) {
        if (bone.skinRequired && !activatable.has(bone.name)) {
          fail(
            'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED',
            `bone "${bone.name}" is skinRequired and no skin's bones list reaches it, so it is never active — ` +
              'it and its subtree hold the setup pose under every skin',
          );
        }
      }
      for (const constraint of data.constraints) {
        if (constraint.skinRequired && !listedConstraints.has(constraint.name)) {
          fail(
            'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED',
            `constraint "${constraint.name}" is skinRequired and no skin lists it, so it never runs`,
          );
        }
      }
      stats.skinMembers = listed;
    });

    // --- A09: compiled duration == declared duration (rule 4) --------------
    check('A09_ANIMATION_DURATION_MATCHES_SPEC', () => {
      // Without the spec there is no declared duration to compare the compiled
      // one against, and returning here used to count as a PASS — a gate saying
      // it checked something it never looked at.
      if (!input.declaredDurations) {
        return skip('A09_ANIMATION_DURATION_MATCHES_SPEC', 'no motion spec supplied, so no declared duration to compare against');
      }
      // Same trap one level down. A **static rig** — a skeleton that exists to
      // be posed and carries no animation at all, which is what
      // `1-weight-and-mass`'s second export is — declares nothing and loads
      // nothing, so both loops below iterate zero times and the assertion
      // reported PASS. That is the vacuous green this report is built to refuse:
      // there is no duration here, and saying so is the honest answer.
      if (Object.keys(input.declaredDurations).length === 0 && data.animations.length === 0) {
        return skip('A09_ANIMATION_DURATION_MATCHES_SPEC', SKIP_NO_DECLARED_DURATION);
      }
      for (const [name, declared] of Object.entries(input.declaredDurations)) {
        const anim = data.findAnimation(name);
        if (!anim) {
          fail('A09_ANIMATION_DURATION_MATCHES_SPEC', `spec declares animation "${name}" but the skeleton has none`);
          continue;
        }
        // Two arms, and the asymmetry is the point.
        //
        // UNDERSHOOT is R7's question — is the declared duration wrong? An
        // animation may hold its final pose, so a last key a little before the
        // end is ordinary and a frame of that is slack.
        //
        // OVERSHOOT is a different question with a different tolerance.
        // `anim.duration` IS the largest key time (`SkeletonJson.ts:1261` takes
        // the max over every timeline's own duration), so a loaded duration past
        // the declared one means a KEY is past it — and nothing that plays the
        // animation for the duration it declares will ever reach that key. Rung
        // 6 lost a one-frame attachment reveal to a key 3.4e-5 s past the end,
        // 1/500 of FRAME, which this comparison read as agreement (issue #54).
        // `compile.ts` refuses that per timeline now; this is the same rule held
        // against a skeleton the compiler never saw.
        const slack = KEY_TIME_EPSILON + float32Step(declared);
        const past = anim.duration - declared;
        if (past > slack) {
          const late = anim.timelines.filter((t) => t.getDuration() - declared > slack).length;
          fail(
            'A09_ANIMATION_DURATION_MATCHES_SPEC',
            `animation "${name}" has ${late} timeline(s) keyed past the declared duration ${declared}s — ` +
              `the last key is at ${anim.duration}s, ${past.toFixed(6)}s late, so nothing ever samples it`,
          );
        } else if (declared - anim.duration > FRAME) {
          fail(
            'A09_ANIMATION_DURATION_MATCHES_SPEC',
            `animation "${name}" loaded duration ${anim.duration}s, spec declares ${declared}s`,
          );
        }
      }
      for (const anim of data.animations) {
        if (!(anim.name in input.declaredDurations)) {
          fail('A09_ANIMATION_DURATION_MATCHES_SPEC', `skeleton has animation "${anim.name}" with no spec entry`);
        }
      }
    });

    // --- A10: step every animation and look for NaN ------------------------
    check('A10_NO_NAN_AFTER_STEPPING', () => {
      // The name carries a subject as well as a construct, and A15 is the
      // pattern (#580): the NaN is produced by STEPPING, which happens once per
      // animation, so a skeleton with none has not been stepped and has no pose
      // to find non-finite. A09 already reads the same subject this way — a
      // static rig has no duration to compare — and the two must not print
      // different verdicts over one skeleton's empty animation list.
      if (data.animations.length === 0) return skip('A10_NO_NAN_AFTER_STEPPING', SKIP_NO_ANIMATION);
      for (const anim of data.animations) {
        const skeleton = new Skeleton(data);
        const state = new AnimationState(new AnimationStateData(data));
        state.setAnimation(0, anim.name, true);
        skeleton.setupPose();
        skeleton.update(0);
        skeleton.updateWorldTransform(Physics.reset);
        const step = Math.max(anim.duration, 1) / STEP_FRAMES;
        for (let i = 0; i < STEP_FRAMES; i++) {
          state.update(step);
          state.apply(skeleton);
          skeleton.update(step);
          skeleton.updateWorldTransform(Physics.update);
          for (const bone of skeleton.bones) {
            const pose = bone.appliedPose;
            if (!Number.isFinite(pose.worldX) || !Number.isFinite(pose.worldY)) {
              fail('A10_NO_NAN_AFTER_STEPPING', `${anim.name}: bone "${bone.data.name}" world is (${pose.worldX}, ${pose.worldY})`);
              return;
            }
          }
          for (const slot of skeleton.slots) {
            const c = slot.appliedPose.color;
            if (![c.r, c.g, c.b, c.a].every(Number.isFinite)) {
              fail('A10_NO_NAN_AFTER_STEPPING', `${anim.name}: slot "${slot.data.name}" colour is non-finite`);
              return;
            }
          }
        }
      }
    });
  }

  // --- A06 / A17 / A19: the atlas against the PNGs on disk ------------------
  // Case 6h: a `size:` that disagrees with the file loads fine and collapses
  // every UV — rigid stays correct, meshes sample a corner scrap.
  //
  // 🚨 The guard is a SKIP and never a bare `return` (issue #568). A `return`
  // inside `check()` leaves the failure count and the skip count where they
  // were, which is precisely how that function decides an assertion PASSED — so
  // for as long as this line read `if (!atlas) return;` a candidate whose atlas
  // the round trip could not load was reported green by the two rules whose only
  // subject IS the atlas. It was measured on a fixture carrying a page that
  // declares twice the size of its PNG, the exact defect A06 names when the
  // parse succeeds: with a region also removed so the round trip threw, A06
  // printed `PASS`. Everything below reads `atlas.pages`, so a report of "held"
  // here is a report about zero pages.
  //
  // ⚠️ That last sentence was the whole of the next defect (issue #608). The
  // guard caught the atlas that would not PARSE and left the one that parses to
  // NO PAGES, which reaches these four loops as an empty array and walks out of
  // them with the failure and skip counts untouched — a PASS. It stayed
  // invisible only because a zero-page atlas was itself refused by A07, so no
  // green build had ever contained one; making that state legal is exactly what
  // #608 does, so the same state has to stop printing four passes about nothing.
  // `SKIP_NO_ATLAS_PAGE` is one string for all four because it is one condition.
  check('A17_ATLAS_PAGE_FILES_EXIST', () => {
    if (!atlas) return skip('A17_ATLAS_PAGE_FILES_EXIST', SKIP_NO_ATLAS);
    // The other absence, one ring in (#580): the atlas LOADED and declares no
    // page, so there is no file to find missing. `!atlas` and "zero pages" print
    // different reasons because they are different facts about the artifact.
    if (atlas.pages.length === 0) return skip('A17_ATLAS_PAGE_FILES_EXIST', SKIP_NO_ATLAS_PAGE);
    for (const page of atlas.pages) {
      const abs = resolve(input.atlasDir, page.name);
      if (!existsSync(abs)) fail('A17_ATLAS_PAGE_FILES_EXIST', `page "${page.name}" is not on disk at ${abs}`);
    }
  });
  check('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', () => {
    if (!atlas) return skip('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', SKIP_NO_ATLAS);
    if (atlas.pages.length === 0) return skip('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', SKIP_NO_ATLAS_PAGE);
    for (const page of atlas.pages) {
      const abs = resolve(input.atlasDir, page.name);
      if (!existsSync(abs)) continue; // A17 owns this
      const info = readPngInfo(abs);
      if (page.width !== info.width || page.height !== info.height) {
        fail(
          'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
          `page "${page.name}" declares ${page.width}x${page.height} but the PNG is ${info.width}x${info.height}`,
        );
      }
      // 📐 PROFILE, from here down. `pma: false` and no rotation are rigc's atlas
      // CONVENTION, not the atlas format's rules — a packed page with
      // `rotate: 90` is what the Spine packer produces and every official example
      // ships one. Under `spine` an atlas is judged only on whether its declared
      // size matches the file it names.
      if (policy && page.pma) {
        fail('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', `page "${page.name}" claims premultiplied alpha; parts are straight alpha`);
      }
    }
    if (!policy) return;
    // ⭐ **One part per page OR a tiling page** (issue #266, follow-up 2). This
    // clause used to be the first alternative alone — every region's UVs
    // `(0,0)-(1,1)` — which is rigc's *unpacked* convention and exactly what
    // `build --pack` stops being true, so `--pack --profile spine-html` had to be
    // a named CLI refusal. A pack is not a defect, and refusing it under this
    // profile meant the one shape that exercises the renderer's shared-page
    // sampling could never be gated by the renderer's own rulebook.
    //
    // What the first alternative bought was the attachment -> region -> file
    // chain being checkable exactly, and `A27` already owns that half and already
    // stands down on a multi-region page. What is left to check on a *tiling*
    // page is what makes shared-page sampling well defined at all: every region
    // wholly inside the page it names, and no two regions on one page
    // overlapping. Both are conditions a foreign pack can fail while loading
    // clean — an off-page rectangle samples texels that are not there, and two
    // overlapping rectangles put one drawing inside another's.
    //
    // ⚠️ Rotation stays refused either way, and that is not the same clause: it
    // is about rigc's own packer never turning a region, which is a statement
    // about what rigc WRITES. It stopped being a statement about what rigc can
    // read in issue #570 — `extractRegion` now lifts a rotated region back off
    // its page as a transcription of `MeshAttachment.computeUVs` — and the two
    // must not be re-merged: an artifact under the renderer's own rulebook that
    // rigc did not pack is still a foreign artifact, whatever rigc can measure.
    const regionsPerPage = new Map<string, TextureAtlasRegion[]>();
    for (const region of atlas.regions) {
      const on = regionsPerPage.get(region.page.name);
      if (on) on.push(region);
      else regionsPerPage.set(region.page.name, [region]);
    }
    for (const [pageName, on] of regionsPerPage) {
      const onePartPerPage =
        on.length === 1 && on[0].u === 0 && on[0].v === 0 && on[0].u2 === 1 && on[0].v2 === 1;
      if (onePartPerPage) continue;
      // The rectangle a region occupies on its page is `pageFootprint`'s and
      // nobody else's here (issue #579). What `TextureAtlas` transposes at 90 and
      // not at 270 is `u2`/`v2` — a UV pair `MeshAttachment.computeUVs` never
      // reads for an atlas region — and the page rectangle is a different
      // quantity, transposed at BOTH quarter turns. See that function for the
      // runtime lines.
      const rects = on.map((region) => {
        const foot = pageFootprint(region);
        return { name: region.name, x: region.x, y: region.y, width: foot.width, height: foot.height, page: region.page };
      });
      for (const rect of rects) {
        if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > rect.page.width || rect.y + rect.height > rect.page.height) {
          fail(
            'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
            `region "${rect.name}" occupies ${rect.x},${rect.y} ${rect.width}x${rect.height} of page ` +
              `"${pageName}", which is ${rect.page.width}x${rect.page.height} — a region that runs off its page ` +
              'samples texels that are not there',
          );
        }
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i];
          const b = rects[j];
          if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
            fail(
              'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
              `regions "${a.name}" (${a.x},${a.y} ${a.width}x${a.height}) and "${b.name}" (${b.x},${b.y} ` +
                `${b.width}x${b.height}) overlap on page "${pageName}"; a page is one part covering it exactly or ` +
                'a tiling of regions that do not, and two rectangles over the same texels put one drawing inside ' +
                "the other's",
            );
          }
        }
      }
    }
    for (const region of atlas.regions) {
      if (region.degrees !== 0) {
        fail(
          'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
          `region "${region.name}" is rotated; rigc's own packer never turns a region (see PACK_NO_ROTATE in ` +
            'src/atlas.ts), so this atlas came from somewhere else',
        );
      }
    }
  });
  // An overlay part must be able to draw a transparent pixel or it cannot be an
  // overlay: it would paint a solid rectangle over the untouched base, and an
  // overlay formation's whole claim is that the still frame has no seam. The base
  // plate itself is the one page allowed to be opaque, and it identifies
  // itself structurally — it is the region that covers the whole stage.
  //
  // ⭐ Transparency is not the same thing as an alpha CHANNEL, and this assertion
  // used to conflate them (#215). Colour types 4 and 6 store alpha per pixel;
  // types 0, 2 and 3 store it in a `tRNS` chunk instead, and indexed+tRNS is the
  // ordinary output of ImageMagick, Photoshop's PNG-8 export, GIMP's indexed
  // mode, aseprite and pngquant. Judging on the colour type alone refused art
  // that was never broken — seven of one author's nine hand-drawn parts, on their
  // first build — and told them, untruthfully, that the file held no transparency
  // at all. That audit is also why the CLI's default is now `spine`, which does
  // not run this rule at all (#221): a stranger reaches this refusal only by
  // asking for `spine-html`. It still has to be both TRUE and actionable when it
  // fires, and it now has to name the profile it belongs to as well as the one
  // that does not ask — the reader opted in, and the message is where they find
  // out what they opted into.
  check('A19_OVERLAY_PNGS_HAVE_ALPHA', () => {
    // A SKIP for the same reason A06's is (#568). This one is invisible under
    // `spine`, where the profile excludes the rule before its body runs — and
    // that is exactly why it was worth finding: `--profile spine-html` reported
    // it, and A27 below, green on an atlas nothing had read.
    if (!atlas) return skip('A19_OVERLAY_PNGS_HAVE_ALPHA', SKIP_NO_ATLAS);
    if (atlas.pages.length === 0) return skip('A19_OVERLAY_PNGS_HAVE_ALPHA', SKIP_NO_ATLAS_PAGE);
    const stageW = skeletonData?.width ?? 0;
    const stageH = skeletonData?.height ?? 0;
    const basePages = new Set<string>();
    const baseRegions = new Set<string>();
    for (const att of regionAttachments) {
      if (stageW && stageH && att.width >= stageW && att.height >= stageH) {
        const region = atlas.findRegion(att.path || att.name);
        if (region) {
          basePages.add(region.page.name);
          baseRegions.add(region.name);
        }
      }
    }
    // The escape hatch is only worth naming when it is reachable: with no stage
    // size to measure against, `basePages` is empty and no image can qualify, so
    // pointing at it would send the reader after a door that is not there.
    const exemption =
      stageW && stageH
        ? `Only the one image big enough to cover the whole stage (${stageW}x${stageH}) may be opaque.`
        : 'The one image that covers the whole stage may be opaque, but this skeleton declares no stage size, so ' +
          'nothing here qualifies.';
    // 🚨 Counted per page for the unpacked convention and per REGION on a shared
    // page, and the split is not a convenience (issue #266, follow-up 2). A
    // packed page's own file all but always declares transparency — the gutter
    // and whatever is left over of the page are transparent — so the file-level
    // question is answered "yes" by the packing itself, whatever the parts on it
    // look like. Asking it that way once packs became gateable under this profile
    // would have turned this assertion into a pass that measures nothing, which
    // is the failure mode this file exists to prevent. So a shared page is opened
    // and each region's own rectangle is measured instead.
    const sharedPages = new Map<string, TextureAtlasRegion[]>();
    for (const region of atlas.regions) {
      const on = sharedPages.get(region.page.name);
      if (on) on.push(region);
      else sharedPages.set(region.page.name, [region]);
    }
    for (const page of atlas.pages) {
      const abs = resolve(input.atlasDir, page.name);
      if (!existsSync(abs)) continue;
      const on = sharedPages.get(page.name) ?? [];
      if (on.length > 1) {
        // 🚨 A rotated region is refused by A06 under this profile, so this
        // reading was assumed to be cosmetic — a rectangle printed beside a
        // failure already standing. It is not: the loop below OPENS the
        // rectangle and stops at the first transparent texel, so a rectangle
        // wider than the drawing runs into the transparent gutter, finds its
        // texel there and names nothing. With the transpose applied at 90 only,
        // two fully opaque parts on one page were measured green at
        // `rotate: 270` and red at 0, 90 and 180 — this assertion's own verdict,
        // flipped by the rotation it does not judge (issue #579). The footprint
        // is `pageFootprint`'s, which every other reader of it now calls.
        const plate = readPlate(abs);
        for (const region of on) {
          if (baseRegions.has(region.name)) continue;
          const { width, height } = pageFootprint(region);
          let transparent = false;
          for (let y = region.y; y < region.y + height && !transparent; y++) {
            for (let x = region.x; x < region.x + width; x++) {
              if (x < 0 || y < 0 || x >= plate.width || y >= plate.height) continue;
              if (plate.get(x, y)[3] < 255) {
                transparent = true;
                break;
              }
            }
          }
          if (transparent) continue;
          fail(
            'A19_OVERLAY_PNGS_HAVE_ALPHA',
            `part "${region.name}" is opaque in every one of its ${width}x${height} texels on shared page ` +
              `"${page.name}", so it would paint a solid rectangle over whatever is drawn behind it. Re-export ` +
              `the part with transparency and pack again. ${exemption} This is renderer policy, and it belongs ` +
              'to --profile spine-html: the default --profile spine does not run this check.',
          );
        }
        continue;
      }
      const info = readPngInfo(abs);
      if (info.hasTransparency) continue;
      if (basePages.has(page.name)) continue; // full-stage base plate: opaque is correct
      fail(
        'A19_OVERLAY_PNGS_HAVE_ALPHA',
        `part image "${page.name}" cannot be transparent anywhere: it is colour type ${info.colourType} ` +
          `(${colourTypeName(info.colourType)}) with no tRNS chunk, so it would paint a solid rectangle over ` +
          'whatever is drawn behind it. Re-export it with transparency — as RGBA, or as an indexed or greyscale ' +
          `PNG that keeps its tRNS chunk. ${exemption} This is renderer policy, and it belongs to --profile ` +
          'spine-html: the default --profile spine does not run this check.',
      );
    }
  });

  // -------------------------------------------------------------------------
  // Archetype assertions — the invariants the RIG declares about itself.
  //
  // These need `input.rig`, because skeleton JSON does not record which bone
  // carries the axis, which parentage is forbidden, what the canonical draw
  // order is, or which mesh is a ribbon. Every one of them reads the rig spec's
  // `invariants` block ([`src/rig.ts`](rig.ts)) and every one of them SKIPs when
  // the field it needs is absent — a rig that declares nothing is not thereby
  // certified, it is unmeasured, and the two must never print the same.
  // -------------------------------------------------------------------------
  stats.rig = input.rig ? input.rig.archetype : 'absent';
  stats.profile = profile;

  // --- A24: motion under the axis bone stays in AXIS space -----------------
  //
  // ⭐ The keystone of an articulated cut, and it exists because of a real bug:
  // a generator wrote its travel as screen-space x/y pairs (`x: 30, y: 8` ->
  // `x: -45, y: -12`), so every key had to be re-recorded for a cut framed at a
  // different camera angle — and sibling variants of ONE cut can differ by tens
  // of degrees. Put the direction in the axis bone's setup rotation instead and
  // the keys become translateX along it, reusable across every variant. A
  // screen-space y component on any bone in that subtree therefore means
  // somebody has put the direction back into the keys.
  //
  // The axis bone itself must carry no keys at all: `invariants.axisBone` names
  // a per-cut SETUP value, and animating it swings the whole formation.
  check('A24_AXIS_SPACE_STROKE', () => {
    const rig = input.rig;
    if (!rig) return skip('A24_AXIS_SPACE_STROKE', 'no rig info (validating a bare directory)');
    if (!rig.axisBone) {
      return skip(
        'A24_AXIS_SPACE_STROKE',
        `the rig "${rig.archetype}" declares no axis bone, so there is no axis space for a stroke to leave`,
      );
    }
    const subtree = new Set(rig.axisSubtree);
    const anims = isObj(raw?.animations) ? (raw.animations as Json) : {};
    // The stroke is the subject and its keys are where it lives (#580). A rig
    // that names an axis bone and then keys neither it nor anything under it has
    // no stroke for this rule to find out of axis space, and a loop over nothing
    // used to report that as held.
    let keyed = 0;
    for (const [animName, anim] of Object.entries(anims)) {
      if (!isObj(anim) || !isObj(anim.bones)) continue;
      for (const [boneName, timelines] of Object.entries(anim.bones as Json)) {
        if (boneName === rig.axisBone) {
          keyed++;
          fail(
            'A24_AXIS_SPACE_STROKE',
            `"${animName}" keys the axis bone "${boneName}"; the axis angle is a per-cut SETUP value, not animation`,
          );
          continue;
        }
        if (subtree.has(boneName)) keyed++;
        if (!subtree.has(boneName) || !isObj(timelines)) continue;
        if ('translatey' in timelines) {
          fail(
            'A24_AXIS_SPACE_STROKE',
            `"${animName}" gives "${boneName}" a translatey timeline; a bone under "${rig.axisBone}" moves along the axis only`,
          );
        }
        const keys = (timelines as Json).translate;
        if (!Array.isArray(keys)) continue;
        for (const key of keys) {
          if (!isObj(key)) continue;
          const y = Number(key.y ?? 0);
          if (Number.isFinite(y) && Math.abs(y) > 1e-6) {
            fail(
              'A24_AXIS_SPACE_STROKE',
              `"${animName}" keys "${boneName}" translate y=${y} at t=${String(key.time ?? 0)}; the axis bone carries the direction, so keys are translateX only`,
            );
          }
        }
      }
    }
    if (keyed === 0) {
      return skip(
        'A24_AXIS_SPACE_STROKE',
        `no animation keys the axis bone "${rig.axisBone}" or any of the ${rig.axisSubtree.length} bone(s) under ` +
          'it, so this rig has no stroke to hold in axis space',
      );
    }
  });

  // --- A25: parentage that must never happen -------------------------------
  //
  // ⚠️ Some bones are detached ON PURPOSE. An emitter that releases something
  // into the world must not ride the part that released it, or what it emits
  // gets dragged along with every stroke instead of staying where it left and
  // taking gravity. The rig states each such pair in `invariants.detached`, with
  // the reason it is tempting, because the wrong parentage still loads and still
  // animates — it just lies. That is exactly the class of invariant that belongs
  // in a machine guard rather than in prose.
  check('A25_DETACHED_BONE_PARENTAGE', () => {
    const rig = input.rig;
    if (!rig) return skip('A25_DETACHED_BONE_PARENTAGE', 'no rig info (validating a bare directory)');
    if (!rig.detached.length) {
      return skip('A25_DETACHED_BONE_PARENTAGE', `the rig "${rig.archetype}" declares no forbidden parentage`);
    }
    const parentOf = new Map<string, string | null>();
    for (const bone of Array.isArray(raw?.bones) ? (raw.bones as unknown[]) : []) {
      if (isObj(bone) && typeof bone.name === 'string') {
        parentOf.set(bone.name, typeof bone.parent === 'string' ? bone.parent : null);
      }
    }
    for (const [child, forbidden] of rig.detached) {
      if (!parentOf.has(child)) {
        fail('A25_DETACHED_BONE_PARENTAGE', `the rig declares "${child}" detached from "${forbidden}" but has no such bone`);
        continue;
      }
      const seen = new Set<string>();
      for (let cursor = parentOf.get(child) ?? null; cursor; cursor = parentOf.get(cursor) ?? null) {
        if (seen.has(cursor)) break; // a cycle; the loader would have thrown first
        seen.add(cursor);
        if (cursor !== forbidden) continue;
        fail(
          'A25_DETACHED_BONE_PARENTAGE',
          `"${child}" is a descendant of "${forbidden}"; it must not be dragged by that bone's motion`,
        );
        break;
      }
    }
  });

  // --- A26: the slots array IS the rig's slot table ------------------------
  //
  // The slots array IS the draw order (z-index = array index), so a formation
  // whose illusion depends on one part occluding another depends on one
  // adjacency in that array — and nothing in the file objects to the wrong
  // order. On a still frame it can even look plausible. The rig's own slot list
  // is the canonical table, and this checks the emitted array against it in
  // both directions: nothing out of order, and nothing missing.
  //
  // ⚠️ The second half is new with issue #575 and the first half is why it had
  // to be. This clause used to accept any SUBSEQUENCE of the table, because the
  // compiler dropped a slot no skin filled and the gate was written around that
  // — so the defect #575 filed was licensed by the assertion that was supposed
  // to catch it: two production exports declaring 53 and 61 slots built green
  // at 51 and 57. `compile` now emits every declared slot, empty if nothing
  // fills it, so a shorter array is a loss and is named as one here. A slot
  // missing from the array moves every slot below it up one index, which is
  // what a `drawOrder` key's offsets are counted against.
  check('A26_SLOT_DRAW_ORDER', () => {
    if (!input.rig) return skip('A26_SLOT_DRAW_ORDER', 'no rig info (validating a bare directory)');
    const order = input.rig.slotOrder;
    if (!order) {
      return skip(
        'A26_SLOT_DRAW_ORDER',
        `the rig "${input.rig.archetype}" declares no canonical slot order, so the emitted order has nothing to disagree with`,
      );
    }
    const names = (Array.isArray(raw?.slots) ? (raw.slots as unknown[]) : [])
      .filter(isObj)
      .map((s) => String(s.name));
    // ⛔ **No empty-subject SKIP here, and #575 is the whole reason** (#580). The
    // empty sequence is a subsequence of every table, so before #575 a skeleton
    // with no slot reported its draw order held and this rule wanted the same
    // guard its neighbours got. It no longer does: the completeness clause below
    // reads zero emitted slots against a declared table as EVERY slot lost,
    // which is the maximal case of exactly the defect #575 filed — so the honest
    // verdict is a FAIL naming them, and a SKIP here would suppress it. Measured:
    // with the guard in place a rig declaring one slot beside an artifact
    // carrying none reported SKIP; with it gone, `"block" is declared and not
    // emitted`. A26 therefore has no vacuous pass left to convert, the way
    // `A07_ATLAS_TEXT_SHAPE` has none.
    let at = 0;
    for (const name of names) {
      const found = order.indexOf(name, at);
      if (found < 0) {
        const known = order.indexOf(name);
        fail(
          'A26_SLOT_DRAW_ORDER',
          known < 0
            ? `slot "${name}" is not in the archetype's slot table`
            : `slot "${name}" is drawn out of order (table position ${known}, after a slot at ${at})`,
        );
        return;
      }
      at = found + 1;
    }
    const emitted = new Set(names);
    const missing = order.filter((name) => !emitted.has(name));
    if (missing.length > 0) {
      fail(
        'A26_SLOT_DRAW_ORDER',
        `the rig "${input.rig.archetype}" declares ${order.length} slot(s) and the skeleton has ${names.length}: ` +
          `${missing.map((name) => `"${name}"`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} declared and ` +
          'not emitted. A slot nothing fills is emitted with no setup attachment, not dropped — dropping one ' +
          'moves every slot below it up one index',
      );
    }
  });

  // --- A27: region name == the PNG's basename ------------------------------
  //
  // The join key is a chain of three names — attachment -> atlas region -> file —
  // and A08 only holds the first link. The second was held by convention alone:
  // an atlas could declare page `../plates/02_overlay.png` with a region
  // called anything at all, every attachment could agree with it, and the rig
  // would load with the wrong pixels under the right name. One part per page (A06
  // forces it) makes the check exact.
  check('A27_REGION_NAME_MATCHES_PAGE_FILENAME', () => {
    if (!atlas) return skip('A27_REGION_NAME_MATCHES_PAGE_FILENAME', SKIP_NO_ATLAS);
    if (atlas.regions.length === 0) return skip('A27_REGION_NAME_MATCHES_PAGE_FILENAME', SKIP_NO_ATLAS_REGION);
    const perPage = new Map<string, number>();
    for (const region of atlas.regions) perPage.set(region.page.name, (perPage.get(region.page.name) ?? 0) + 1);
    for (const region of atlas.regions) {
      // A real packer puts many regions on one page and the names stop matching
      // filenames by design. Then this check has nothing to say, so it says
      // nothing rather than something wrong.
      if ((perPage.get(region.page.name) ?? 0) !== 1) continue;
      const expected = basename(region.page.name).replace(/\.png$/i, '');
      if (region.name !== expected) {
        fail(
          'A27_REGION_NAME_MATCHES_PAGE_FILENAME',
          `region "${region.name}" is the only region on page "${region.page.name}", whose basename is "${expected}"`,
        );
      }
    }
  });

  // --- A28: a ribbon's rows share their weights ----------------------------
  //
  // This is what makes "length without width" a property of the file rather than
  // a hope. Both vertices of a row carry the same bones at the same weights, so
  // whatever the chain does to one it does to the other and their separation can
  // only rotate — the strip curves and stretches, and never gets fatter. Give one
  // side a different weight and the strip develops a taper that grows with its
  // travel, which is the sort of thing that reads as bad art rather than as a bug.
  check('A28_RIBBON_ROWS_SHARE_WEIGHTS', () => {
    if (!skeletonData) return skip('A28_RIBBON_ROWS_SHARE_WEIGHTS', 'the skeleton did not load (A00 owns that failure)');
    if (!input.rig) return skip('A28_RIBBON_ROWS_SHARE_WEIGHTS', 'no rig info (validating a bare directory), so no mesh is known to be a ribbon');
    const kinds = input.rig.meshKinds;
    if (!Object.values(kinds).includes('ribbon')) {
      // Say WHICH kind of "no ribbon" this is. "declares no ribbon" is true of a
      // cut with no mesh at all, of one whose meshes are authored geometry, and
      // of one whose meshes are contours — and the last two are cases where a
      // reader should know that a mesh went unmeasured on purpose.
      const unpaired = Object.entries(kinds)
        .filter(([, kind]) => kind === 'authored' || kind === 'contour')
        .map(([slot, kind]) => `"${slot}" (${kind})`);
      return skip(
        'A28_RIBBON_ROWS_SHARE_WEIGHTS',
        unpaired.length
          ? `the rig "${input.rig.archetype}" declares no ribbon mesh on this cut — its mesh slot(s) ${unpaired.join(', ')} have no rows to pair: authored geometry is somebody else's topology, and a contour is one silhouette loop`
          : `the rig "${input.rig.archetype}" declares no ribbon mesh on this cut`,
      );
    }
    const data = skeletonData as NonNullable<typeof skeletonData>;
    for (const skin of data.skins) {
      for (const entry of skin.getAttachments()) {
        const mesh = entry.attachment;
        if (!(mesh instanceof MeshAttachment) || !mesh.bones) continue;
        if (input.rig.meshKinds[data.slots[entry.slotIndex].name] !== 'ribbon') continue;
        const perVertex = meshWeightsOf(mesh);
        if (perVertex.length % 2 !== 0) {
          fail('A28_RIBBON_ROWS_SHARE_WEIGHTS', `ribbon "${mesh.name}" has ${perVertex.length} vertices; a strip has an even count`);
          continue;
        }
        // Perimeter order: left row i is index i, right row i is its mirror.
        const rows = perVertex.length / 2;
        for (let i = 0; i < rows; i++) {
          const left = perVertex[i];
          const right = perVertex[perVertex.length - 1 - i];
          const shape = (v: typeof left) => v.map((w) => `${w.bone}:${w.weight.toFixed(6)}`).join(',');
          if (shape(left) !== shape(right)) {
            fail(
              'A28_RIBBON_ROWS_SHARE_WEIGHTS',
              `ribbon "${mesh.name}" row ${i} has [${shape(left)}] on one side and [${shape(right)}] on the other; its width would change with the chain`,
            );
          }
        }
      }
    }
  });

  // --- A29: inward travel stops where the two masses meet ------------------
  //
  // 🎯 The rule: inward travel goes at most as far as the point where the moving
  // mass touches the part that occludes it. That distance is MEASURED off the two
  // plates (`tools/measure_contact_depth.ts`) and recorded in the manifest as
  // `stroke.contact_depth`, so the ceiling is a fact about the art rather than a
  // number somebody picked. Drive past it and the frame renders two bodies
  // interpenetrating — and NOTHING in skeleton JSON objects: the animation loads,
  // plays, and is simply wrong. Exactly the shape of silent wrongness this
  // validator exists for.
  //
  // Two things spend the same clearance and so are added together:
  //   * the travel itself, a translateX on a bone in the axis subtree (A24
  //     guarantees there is no hidden screen-space component to miss); and
  //   * the mass bone's own inward keys. `invariants.massBone` typically hangs
  //     outside the axis subtree, so its keys are screen-space by design — they
  //     get projected onto the axis rather than read as axis coordinates.
  //     Ignoring them would let a rig pass while a recoil key closed the last few
  //     pixels of the gap.
  check('A29_STROKE_WITHIN_CONTACT_DEPTH', () => {
    const rig = input.rig;
    if (!rig) return skip('A29_STROKE_WITHIN_CONTACT_DEPTH', 'no rig info (validating a bare directory)');
    if (!rig.contactDepth) {
      return skip(
        'A29_STROKE_WITHIN_CONTACT_DEPTH',
        'the manifest declares no `stroke.contact_depth`, so this cut has no measured contact ceiling to hold the stroke to',
      );
    }
    const deep = deepestInwardAdvance(raw, rig);
    stats.contactDepth = rig.contactDepth;
    stats.deepestAdvance = Math.round(deep.total * 1000) / 1000;
    if (deep.total > rig.contactDepth + 1e-6) {
      fail(
        'A29_STROKE_WITHIN_CONTACT_DEPTH',
        `${deep.describe()} but the masses meet at ${rig.contactDepth}px — the two plates would interpenetrate`,
      );
    }
  });

  // --- A30: inward travel stops where the drawn cover runs out -------------
  //
  // 🎯 The second ceiling, and it is NOT a restatement of A29. Contact asks when
  // two masses collide; containment asks when the moving part's leading contour
  // stops being covered by the occluder's opaque footprint. Past that point the
  // part is drawn in a place the art says is hidden — and like every failure in
  // this family it is completely silent: the animation loads, plays, and shows
  // one plate passing through another.
  //
  // A cut can have either ceiling without the other, which is why they are two
  // manifest fields and two assertions. Two plates cut from ONE piece of art are
  // adjacent at rest and never "meet", so that cut has no contact ceiling at all
  // and only a containment one.
  //
  // ⚠️ Second half, and it is what keeps the first half true: the ceiling is
  // measured on the UNDEFORMED contour, by translating the plate along the axis.
  // A scale key on any bone in the axis subtree changes the contour itself, so the
  // measured number stops describing the rig — quietly, because the file still
  // validates. Rather than assert a number that no longer means anything, refuse
  // the deformation. A cut that wants squash under a declared ceiling has to
  // re-measure containment for the scaled contour and say so.
  check('A30_STROKE_WITHIN_CAP_CONTAINMENT', () => {
    const rig = input.rig;
    if (!rig) return skip('A30_STROKE_WITHIN_CAP_CONTAINMENT', 'no rig info (validating a bare directory)');
    if (!rig.capContainmentCeiling) {
      return skip(
        'A30_STROKE_WITHIN_CAP_CONTAINMENT',
        'the manifest declares no `stroke.cap_containment_ceiling`, so this cut has no measured containment ceiling',
      );
    }
    const deep = deepestInwardAdvance(raw, rig);
    stats.capCeiling = rig.capContainmentCeiling;
    stats.deepestAdvance = Math.round(deep.total * 1000) / 1000;
    if (deep.total > rig.capContainmentCeiling + 1e-6) {
      fail(
        'A30_STROKE_WITHIN_CAP_CONTAINMENT',
        `${deep.describe()} but the leading contour leaves the occluder's opaque footprint at ` +
          `${rig.capContainmentCeiling}px — the part would be drawn where it should be covered`,
      );
    }
    const subtree = new Set(rig.axisSubtree);
    const anims = isObj(raw?.animations) ? (raw.animations as Json) : {};
    for (const [animName, anim] of Object.entries(anims)) {
      if (!isObj(anim) || !isObj(anim.bones)) continue;
      for (const [boneName, timelines] of Object.entries(anim.bones as Json)) {
        if (!subtree.has(boneName) || !isObj(timelines)) continue;
        for (const name of Object.keys(timelines)) {
          if (name !== 'scale' && name !== 'scalex' && name !== 'scaley') continue;
          fail(
            'A30_STROKE_WITHIN_CAP_CONTAINMENT',
            `"${animName}" gives "${boneName}" a ${name} timeline while a cap-containment ceiling is declared; ` +
              'the ceiling was measured on the undeformed contour, so a scaled plate is outside its evidence',
          );
        }
      }
    }
  });

  // --- A18: determinism ----------------------------------------------------
  check('A18_DETERMINISTIC_EMIT', () => {
    // Same vacuous-pass trap as A09: re-gating artifacts already on disk hands
    // this assertion no second compile, and there is nothing determinate about
    // a comparison that never ran.
    if (!input.reEmit) {
      return skip('A18_DETERMINISTIC_EMIT', 'no second compile to compare against (re-gating artifacts on disk)');
    }
    if (input.reEmit.skeletonText !== input.skeletonText) {
      fail('A18_DETERMINISTIC_EMIT', 'recompiling produced a different skeleton.json');
    }
    if (input.reEmit.atlasText !== input.atlasText) {
      fail('A18_DETERMINISTIC_EMIT', 'recompiling produced a different skeleton.atlas');
    }
  });

  // --- every assertion leaves a row ----------------------------------------
  //
  // 🔒 **A missing row is the vacuous pass one level up** (issue #568). Twenty
  // assertions live inside `if (skeletonData) {` above, so a round trip that
  // throws does not skip them — it never reaches them, and they appear in none
  // of the four lists. Measured on a fixture whose atlas was missing a region
  // the skeleton names: 13 of 42 printed a verdict, 9 more printed `PROF`, and
  // 20 printed nothing at all. The run exits 1 and the reader is right to fix
  // A00 first, which is exactly why the silence survives — nobody counts the
  // rows on a red run. A report that names 22 of 42 and says nothing about the
  // rest is telling a reader that those rules are fine, in the only way a
  // report can: by not mentioning them.
  //
  // ⚠️ The sweep DERIVES its list rather than keeping one, because a hand-kept
  // roster of "assertions behind the round trip" is a second place to update
  // and would be wrong the first time somebody moved a `check` call. Anything
  // `ASSERTION_NAMES` knows that reached here with no row did not run, and what
  // it is honest to say about it is decided by the state:
  //
  //   * the profile does not carry that kind of rule — `PROF`, the same verdict
  //     `check()`'s own guard would have recorded had the call been reached;
  //   * the round trip produced nothing — `SKIP`, naming that;
  //   * anything else — a FAIL, **by name**. An assertion that vanished while
  //     the skeleton was loaded is a defect in this file, and inventing a SKIP
  //     for it would be the same silence one ring further out. The one state
  //     the sweep is allowed to explain is the one it can prove.
  const reported = new Set<string>([
    ...passed,
    ...failures.map((f) => f.assertion),
    ...skipped.map((s) => s.assertion),
    ...profileSkipped.map((p) => p.assertion),
  ]);
  for (const name of ASSERTION_NAMES) {
    if (reported.has(name)) continue;
    const kind = ASSERTION_KIND[name];
    if (kind !== 'validity' && !policy) profileSkipped.push({ assertion: name, kind });
    else if (!roundTrip) skip(name, SKIP_NO_SKELETON);
    else {
      fail(
        name,
        'the assertion left no row: its body was never reached, and the round trip that would explain that ' +
          'succeeded. A guard above returned before the call — find it and make it a SKIP naming what was absent',
      );
    }
  }

  return { failures, passed, skipped, profileSkipped, profile, stats };
}

/**
 * Deepest inward advance the animation data asks for, in axis pixels.
 *
 * Shared by A29 and A30 because they bound the SAME quantity against two
 * different measured facts. Two things spend the same clearance and so are added:
 *
 *   * the stroke — a translateX on a bone in the axis subtree. A24 guarantees
 *     there is no hidden screen-space component to miss.
 *   * the mass bone's own inward keys. It typically hangs outside the axis
 *     subtree, so its keys are screen-space by design and get PROJECTED onto the
 *     axis rather than read as axis coordinates. Ignoring them would let a rig
 *     pass while a recoil key closed the last few pixels.
 */
function deepestInwardAdvance(
  raw: Json | null,
  rig: NonNullable<ValidateInput['rig']>,
): { total: number; describe: () => string } {
  const anims = isObj(raw?.animations) ? (raw.animations as Json) : {};
  const subtree = new Set(rig.axisSubtree);
  let strokeMax = 0;
  let strokeWhere = '';
  let massMax = 0;
  let massWhere = '';
  for (const [animName, anim] of Object.entries(anims)) {
    if (!isObj(anim) || !isObj(anim.bones)) continue;
    for (const [boneName, timelines] of Object.entries(anim.bones as Json)) {
      if (!isObj(timelines)) continue;
      const keys = (timelines as Json).translate;
      if (!Array.isArray(keys)) continue;
      for (const key of keys) {
        if (!isObj(key)) continue;
        if (subtree.has(boneName)) {
          // +x is inward along the axis; a retracted key is negative and spends
          // no clearance, so only the inward extreme matters.
          const x = Number(key.x ?? 0);
          if (Number.isFinite(x) && x > strokeMax) {
            strokeMax = x;
            strokeWhere = `${animName}.${boneName} t=${String(key.time ?? 0)}`;
          }
        } else if (boneName === rig.massBone && rig.inwardUnit) {
          const inward = Number(key.x ?? 0) * rig.inwardUnit[0] + Number(key.y ?? 0) * rig.inwardUnit[1];
          if (Number.isFinite(inward) && inward > massMax) {
            massMax = inward;
            massWhere = `${animName}.${boneName} t=${String(key.time ?? 0)}`;
          }
        }
      }
    }
  }
  return {
    total: strokeMax + massMax,
    describe: () =>
      `deepest inward advance is ${(strokeMax + massMax).toFixed(3)}px (stroke ${strokeMax.toFixed(3)} at ${strokeWhere}` +
      `${massMax > 0 ? ` + mass ${massMax.toFixed(3)} at ${massWhere}` : ''})`,
  };
}

/**
 * Decode a weighted mesh's `vertices` run into per-vertex (boneIndex, weight).
 *
 * The encoding carries no marker at all — weighted versus unweighted is decided
 * by a length comparison — so every assertion that talks
 * about weights has to walk the run itself.
 */
function meshWeightsOf(mesh: MeshAttachment): Array<Array<{ bone: number; weight: number }>> {
  const out: Array<Array<{ bone: number; weight: number }>> = [];
  if (!mesh.bones) return out;
  let bi = 0;
  let vi = 0;
  while (bi < mesh.bones.length) {
    const boneCount = mesh.bones[bi++];
    const vertex: Array<{ bone: number; weight: number }> = [];
    for (let n = 0; n < boneCount; n++, bi++, vi += 3) {
      vertex.push({ bone: mesh.bones[bi], weight: mesh.vertices[vi + 2] });
    }
    out.push(vertex);
  }
  return out;
}

export function reportLines(report: ValidateReport): string[] {
  const lines: string[] = [];
  // The profile goes FIRST and names what it left out. A report that says
  // "green" without saying which rulebook produced it is the one thing this
  // switch could make worse than no switch: `--profile spine` green means
  // "valid Spine", never "passes the renderer policy".
  const renderer = report.profileSkipped.filter((p) => p.kind === 'renderer').length;
  const archetype = report.profileSkipped.filter((p) => p.kind === 'archetype').length;
  lines.push(
    report.profileSkipped.length === 0
      ? `  ..    profile ${report.profile} — every assertion applies`
      : `  ..    profile ${report.profile} — ${renderer} renderer-policy and ${archetype} archetype assertion(s) do not apply`,
  );
  for (const name of report.passed) lines.push(`  PASS  ${name}`);
  for (const s of report.skipped) lines.push(`  SKIP  ${s.assertion}: ${s.reason}`);
  for (const p of report.profileSkipped) lines.push(`  PROF  ${p.assertion}: ${p.kind} rule, not in profile "${report.profile}"`);
  for (const f of report.failures) lines.push(`  FAIL  ${f.assertion}: ${f.detail}`);
  // How many of them MEASURED anything, which is the figure the rows above do
  // not hand a reader (issue #568). Counting `PASS` lines answers a different
  // question — before the sweep that closed #568 a run could print seven of
  // them over a candidate on which five rules had not executed at all.
  //
  // ⚠️ Every figure here is a count of ASSERTIONS and not of rows, which is why
  // the failed side is a Set: `fail()` is called once per finding, so one
  // assertion can print six `FAIL` lines, and a line-count would report 47 of
  // 42. The four buckets partition `ASSERTION_NAMES`, so the total is derived
  // by adding them rather than stated — a `42` written here would be the one
  // number in the report that no run could contradict.
  const failed = new Set(report.failures.map((f) => f.assertion));
  const measured = report.passed.length + failed.size;
  const total = measured + report.skipped.length + report.profileSkipped.length;
  lines.push(
    `  ..    ${total} assertions: ${measured} measured (${report.passed.length} passed, ${failed.size} failed), ` +
      `${report.skipped.length} skipped, ${report.profileSkipped.length} not in profile "${report.profile}"`,
  );
  return lines;
}

export function atlasDirOf(atlasPath: string): string {
  return dirname(resolve(atlasPath));
}

// ---------------------------------------------------------------------------
// skeletonValues — the round trip read as VALUES rather than as assertions
// ---------------------------------------------------------------------------

/**
 * One value the parser read out of a skeleton file, at a path that names it.
 *
 * `bones/hip/setup/rotation`, `skins/default/head/head/regionUVs/12`,
 * `animations/walk/RotateTimeline/bone:hip/key/3/v1`. Numbers stay numbers so
 * that a comparison can state a tolerance; everything else — a blend mode the
 * runtime holds as an enum, an attachment name, a boolean, an absent object —
 * is a string, and is compared exactly.
 */
export interface SkeletonValue {
  /** Stable, name-keyed, and never an index into an emitted array (issue #45). */
  path: string;
  value: number | string;
}

/**
 * Keys the walk below does not read, each with the reason it is not a value the
 * file carries. It is a SKIP list rather than an include list on purpose: the
 * field names come from the parser, so a field spine-core starts reading is
 * compared the day it starts reading it, and the only hand-kept part is the
 * short list of things that are demonstrably not in the file.
 *
 * ⚠️ `id` is the sharp one. `VertexAttachment.id` is a process-wide counter, so
 * two parses in one process disagree about it by construction — and it reaches
 * `DeformTimeline.getPropertyIds()`, which is why the timeline key below is
 * built from the resolved owner rather than from the property ids.
 */
const NOT_A_VALUE_IN_THE_FILE: Record<string, string> = {
  a: 'the derived world matrix',
  b: 'the derived world matrix',
  c: 'the derived world matrix',
  d: 'the derived world matrix',
  world: 'derived by the runtime',
  local: 'derived by the runtime',
  worldX: 'derived by the runtime',
  worldY: 'derived by the runtime',
  region: 'the atlas, which is not the skeleton',
  regions: 'the atlas, which is not the skeleton',
  uvs: 'computed from the region',
  offsets: 'computed from the region',
  tempColor: 'runtime scratch',
  deform: 'runtime scratch on the setup pose',
  id: 'a process-wide counter, not a value in the file',
  index: 'the array position this walk already iterates by name',
  timelineIds: 'derived from the timelines',
  timelineSlots: 'derived from the skin',
  properties: 'derived from the constraint',
  propertyIds: 'carries an attachment id, which is a counter (see above)',
};

/** How deep a chain of unnamed objects may go before the walk says so and stops. */
const VALUE_WALK_DEPTH = 10;

/**
 * Reflection over the parsed form: numbers and strings as they are, arrays by
 * index, objects by their own keys in **sorted** order, and any nested object
 * that carries a `name` by that name rather than by expansion — which is what
 * makes a cross-reference (`parent`, `boneData`, `endSlot`, a constraint's
 * `bones`) a name and terminates every cycle the runtime's back-references
 * would otherwise walk forever.
 *
 * Sorted rather than insertion-ordered because `A18_DETERMINISTIC_EMIT`'s rule
 * applies here too: nothing whose order is the runtime's business may decide
 * what this function emits.
 */
function pushValue(value: unknown, path: string, out: SkeletonValue[], depth: number): void {
  if (value === null || value === undefined) {
    out.push({ path, value: '(none)' });
    return;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    out.push({ path, value });
    return;
  }
  if (typeof value === 'boolean') {
    out.push({ path, value: value ? 'true' : 'false' });
    return;
  }
  if (typeof value === 'function') return;
  if (ArrayBuffer.isView(value) || Array.isArray(value)) {
    const list = value as ArrayLike<unknown>;
    for (let i = 0; i < list.length; i++) pushValue(list[i], `${path}/${i}`, out, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;
  if (depth > 0 && typeof obj.name === 'string') {
    out.push({ path, value: obj.name });
    return;
  }
  if (depth > VALUE_WALK_DEPTH) {
    out.push({ path, value: '(deeper than the walk goes)' });
    return;
  }
  for (const key of Object.keys(obj).sort()) {
    if (key in NOT_A_VALUE_IN_THE_FILE) continue;
    pushValue(obj[key], `${path}/${key}`, out, depth + 1);
  }
}

/**
 * Which timeline this is, in words that both sides of a comparison can reach.
 *
 * The class name and the OWNER'S NAME — never the property ids, which carry
 * array indices and, for a deform timeline, a counter. A rig that reorders its
 * bones is a structural finding `diff` already makes; it must not also arrive
 * here as a timeline nobody can pair.
 */
function timelineKey(timeline: Timeline, data: ReturnType<SkeletonJson['readSkeletonData']>): string {
  const kind = timeline.constructor?.name ?? 'Timeline';
  const asBone = timeline as Timeline & Partial<{ boneIndex: number }>;
  if (isBoneTimeline(asBone)) return `${kind}/bone:${data.bones[asBone.boneIndex]?.name ?? `#${asBone.boneIndex}`}`;
  const asSlot = timeline as Timeline & Partial<{ slotIndex: number }>;
  if (isSlotTimeline(asSlot)) {
    const slot = data.slots[asSlot.slotIndex]?.name ?? `#${asSlot.slotIndex}`;
    const attachment = (timeline as Timeline & Partial<{ attachment: { name: string } }>).attachment;
    return `${kind}/slot:${slot}${attachment === undefined ? '' : `:${attachment.name}`}`;
  }
  const asConstraint = timeline as Timeline & Partial<{ constraintIndex: number }>;
  if (isConstraintTimeline(asConstraint)) {
    return `${kind}/constraint:${data.constraints[asConstraint.constraintIndex]?.name ?? `#${asConstraint.constraintIndex}`}`;
  }
  return `${kind}/skeleton`;
}

/**
 * Every value a skeleton file carries, as the **parser** understands it.
 *
 * ## Why this is here and not in `diff.ts`
 *
 * `diff` compares structure over raw JSON and says so in its own header:
 * *"Pure JSON reading — no spine-core, no filesystem."* Comparing the values
 * inside that structure needs the format's per-field defaults — `time` absent
 * is 0, `scaleX` absent is 1, a physics key's `value` absent is 0 but its `mix`
 * is 1 — and a second spelling of those inside the gate is exactly what this
 * repository refuses (CLAUDE.md, *The compiler never invents a value*). So the
 * defaults are taken from the one reader that owns them, which means the
 * runtime, which means this file: `CLAUDE.md`'s *Conventions* names the three
 * modules allowed to link spine-core and `src/validate.ts` is the one that
 * "owns the round trip". `src/bonedist.ts` is the precedent for the other half
 * — an instrument that needs the runtime and reaches it through `render.ts`
 * rather than linking it itself. `diff.ts` compares what this returns.
 *
 * ## What it covers
 *
 * Everything on `SkeletonData` that is not on the skip list above: the header
 * and stage, every bone's setup pose and `length`, every slot's colours, blend
 * and setup attachment, every attachment in every skin (a region's offsets,
 * rotation, scale and size; a mesh's vertices, weights, `regionUVs`,
 * triangles, hull and edges; a bounding box's, path's and clipping shape's
 * vertices), every constraint's pose and flags, every event's payload, and for
 * every timeline every frame — time and values, from the runtime's own
 * `getFrameEntries()` — its curve type and Bezier samples, and its deform
 * vertices, attachment names, draw orders and event payloads.
 *
 * ## What it does not
 *
 * - **`version` and `hash`.** The rig spec has no field for either; `ingest`
 *   reports them as `HEADER_REDERIVED` and `HEADER_BOOKKEEPING` findings, and
 *   a rebuild restating the runtime rigc links is the whole reason the corpus
 *   gate is `diff` at 1.000 rather than a byte comparison (`docs/INGEST.md`
 *   §2.3). They are named here so that skipping them is a decision a reader
 *   can see rather than an omission.
 * - **Anything below one float32 step.** `spine-core` stores frames, curves and
 *   vertices in `Float32Array`, so two values that round to the same float32
 *   are equal to this walk whatever the file says. The comparison's tolerance
 *   states that bound rather than hiding it.
 * - **A Bezier's control points as such.** The parser samples them into
 *   `curves` (`setBezier`), so what is compared is the sampled curve; a moved
 *   handle moves the samples, but by a different amount than it moved the
 *   handle.
 */
export function skeletonValues(skeletonText: string, atlasText: string): SkeletonValue[] {
  const data = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(atlasText))).readSkeletonData(
    JSON.parse(skeletonText),
  );
  const out: SkeletonValue[] = [];
  const header = data as unknown as Record<string, unknown>;
  for (const field of ['x', 'y', 'width', 'height', 'referenceScale', 'fps', 'imagesPath', 'audioPath', 'name']) {
    pushValue(header[field], `skeleton/${field}`, out, 1);
  }
  for (const bone of data.bones) {
    const at = `bones/${bone.name}`;
    const rec = bone as unknown as Record<string, unknown>;
    for (const key of Object.keys(rec).sort()) {
      if (key in NOT_A_VALUE_IN_THE_FILE || key === 'name') continue;
      pushValue(rec[key], `${at}/${key === 'setupPose' ? 'setup' : key}`, out, 1);
    }
  }
  for (const slot of data.slots) {
    const at = `slots/${slot.name}`;
    const rec = slot as unknown as Record<string, unknown>;
    for (const key of Object.keys(rec).sort()) {
      if (key in NOT_A_VALUE_IN_THE_FILE || key === 'name') continue;
      pushValue(rec[key], `${at}/${key === 'setupPose' ? 'setup' : key}`, out, 1);
    }
  }
  for (const skin of data.skins) {
    const at = `skins/${skin.name}`;
    pushValue(skin.color, `${at}/color`, out, 1);
    pushValue(skin.bones, `${at}/bones`, out, 1);
    pushValue(skin.constraints, `${at}/constraints`, out, 1);
    for (const [slotIndex, held] of skin.attachments.entries()) {
      if (held === undefined || held === null) continue;
      const slot = data.slots[slotIndex]?.name ?? `#${slotIndex}`;
      const byName = held as unknown as Record<string, unknown>;
      for (const placeholder of Object.keys(byName).sort()) {
        const attachment = byName[placeholder] as Record<string, unknown>;
        const where = `${at}/${slot}/${placeholder}`;
        // The attachment's TYPE, which is the one thing reflection cannot see:
        // a region and a mesh differ in their fields, and a walk that only read
        // the fields would call a swap a pile of unpaired paths rather than a
        // kind that changed.
        pushValue(attachment.constructor?.name ?? '(unknown)', `${where}/kind`, out, 1);
        pushValue(attachment, where, out, 0);
      }
    }
  }
  for (const constraint of data.constraints) {
    const at = `constraints/${constraint.name}`;
    pushValue(constraint.constructor?.name ?? '(unknown)', `${at}/kind`, out, 1);
    pushValue(constraint, at, out, 0);
  }
  for (const event of data.events) pushValue(event, `events/${event.name}`, out, 0);
  for (const animation of data.animations) {
    const at = `animations/${animation.name}`;
    pushValue(animation.duration, `${at}/duration`, out, 1);
    // Timelines are grouped by their key and numbered within the group, so that
    // two timelines a runtime distinguishes by object identity — one deform per
    // skin over the same slot and attachment — still pair up in file order
    // rather than colliding on one path.
    const grouped = new Map<string, Timeline[]>();
    for (const timeline of animation.timelines) {
      const key = timelineKey(timeline, data);
      const held = grouped.get(key);
      if (held === undefined) grouped.set(key, [timeline]);
      else held.push(timeline);
    }
    for (const key of [...grouped.keys()].sort()) {
      const group = grouped.get(key) ?? [];
      for (const [n, timeline] of group.entries()) {
        const where = `${at}/${key}${group.length > 1 ? `#${n}` : ''}`;
        // The frames, split into time and values by the runtime's own count of
        // entries per frame rather than by a table of what each timeline kind
        // keys. Entry 0 is the time for every timeline spine-core defines.
        const entries = timeline.getFrameEntries();
        for (let i = 0; i < timeline.frames.length; i++) {
          const slot = i % entries;
          pushValue(timeline.frames[i], `${where}/key/${Math.floor(i / entries)}/${slot === 0 ? 'time' : `v${slot}`}`, out, 1);
        }
        const rec = timeline as unknown as Record<string, unknown>;
        for (const field of Object.keys(rec).sort()) {
          if (field in NOT_A_VALUE_IN_THE_FILE || field === 'frames') continue;
          // The owner is in the path already; comparing the index as well would
          // report one reordering twice, in a measure that is not about order.
          if (field === 'boneIndex' || field === 'slotIndex' || field === 'constraintIndex') continue;
          pushValue(rec[field], `${where}/${field}`, out, 1);
        }
      }
    }
  }
  return out;
}
