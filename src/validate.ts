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
  type ConstraintTimeline,
  type CurveTimeline,
  DeformTimeline,
  IkConstraintData,
  IkConstraintTimeline,
  Inherit,
  isBoneTimeline,
  isConstraintTimeline,
  isSlotTimeline,
  MeshAttachment,
  MixFrom,
  PathAttachment,
  PathConstraintData,
  PathConstraintMixTimeline,
  Physics,
  PhysicsConstraintData,
  PhysicsConstraintPose,
  PhysicsConstraintResetTimeline,
  PhysicsConstraintTimeline,
  Property,
  RegionAttachment,
  Skeleton,
  SkeletonJson,
  SliderData,
  SliderMixTimeline,
  TextureAtlas,
  type TextureAtlasRegion,
  type Timeline,
  ToRotate,
  ToScaleX,
  ToScaleY,
  ToShearY,
  ToX,
  ToY,
  TransformConstraintData,
  TransformConstraintTimeline,
} from '@esotericsoftware/spine-core';
// ⚠️ `src/` reaches outside itself for exactly two modules and this is one of
// them, so it is already on `package.json`'s `files` allowlist — see CLAUDE.md.
// A19 needs the DECODED page, not its header, to measure one region's own
// rectangle on a shared page.
import { readPlate } from '../tools/plate.ts';
import { pageFootprint, pageGridSentence } from './atlas.ts';
import {
  BEZIER_POINTS,
  curveStorage,
  surveyDeformKeys,
  unreachableWhy,
  type DeformDialDispute,
  type DeformDialTie,
  type DeformReach,
  type DialSpan,
} from './deformmeasure.ts';
import {
  LEGACY_BONE_INHERIT_KEY,
  spineGeneration,
  TOPLEVEL_CONSTRAINT_ARRAYS,
  type SpineGeneration,
} from './generation.ts';
import { colourTypeName, readPngHeader } from './png.ts';
import { BONE_INHERIT_KNOWN } from './rig.ts';
import {
  CHANNELS_BY_KIND,
  float32Step,
  PHYSICS_POSE_RULES,
  physicsKeyRefusal,
  physicsOutsideSays,
  physicsRuleFor,
  type PhysicsPoseRule,
  SEQUENCE_MODES,
  SLOT_COLOR_CHANNELS,
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
 * lives. They are A06 (size-vs-PNG and every region's rectangle inside the page
 * it names are validity; pma / rotation / two regions over the same texels are
 * policy — the rectangle moved across that line in issue #694, and the reason
 * is stated where it now sits) and A20 (weight coherence is validity; requiring
 * a mesh to be weighted at all is policy).
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
  A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER: 'validity',
  A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN: 'validity',
  A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN: 'validity',
  A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN: 'validity',
  A46_SEQUENCE_ATTACHMENTS_SHOW_THE_FRAME_THE_FILE_STATES: 'validity',
  A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT: 'validity',
  A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT: 'validity',
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
export const SKIP_NO_TWO_COLOR_TINT =
  'no slot declares a "dark" colour and no animation keys an "rgba2" or "rgb2" timeline, so there is no two-colour tint to read back';
export const SKIP_NO_SEPARABLE_COLOR =
  'no animation keys an "rgb" or "alpha" timeline, so there is no separable slot colour to read back';
export const SKIP_NO_LINKED_MESH = 'no attachment in this skeleton takes its geometry from another one';
export const SKIP_NO_SEQUENCE =
  'no attachment carries a "sequence" block and no animation keys a "sequence" timeline, so there is no numbered series to read back';
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
 * The half of a muted-at-rest refusal that says what was searched, and how
 * widely — one text for `A23`, `A36` and `A37`, which ask one question of three
 * constraint kinds (issues #743, #752). A rig with no animation at all says
 * "none of the 0 animations" rather than implying somebody keyed something.
 */
function noneKeysItsMixAbove0(animations: number): string {
  return `none of the ${animations} animation${animations === 1 ? '' : 's'} keys its mix above 0`;
}

/** The two repairs a muted-at-rest refusal names, since either one is a rig the runtime plays. */
const REST_OR_KEY_ITS_MIX = 'rest it above 0, or key its mix above 0 in an animation';

/**
 * Every value one channel of a curve timeline can pose while it plays: each
 * key's own value, and every sample of each Bezier segment the parser built
 * between two keys (issue #752).
 *
 * ⚠️ The samples are the half a reading of the keys alone misses. The runtime
 * interpolates a Bezier segment between the points `setBezier` stored
 * (`Animation.js:257-298`), not between the two keys, so two keys of 0 joined
 * by a curve whose handles lie above 0 pose values above 0 in between.
 * [measured] on generated fixtures, a `mix` pair of 0 → 0 with its handles at
 * 0.8 poses a path constraint's bone up to 32.69 away from the flat pair, a
 * slider's by 0.54 and a physics constraint's by 3.81. Between two stored
 * points the runtime is linear, so nothing it poses lies outside this list's
 * range — which is what makes "is any of these above 0" the whole question.
 *
 * Channel `c` of frame `f` is `frames[f * entries + 1 + c]`. `curves[f]` is 0
 * for linear, 1 for stepped and `2 + i` for a Bezier whose points start at `i`
 * (`Animation.js:259-261`); `readCurve` stores one segment per channel in
 * order, so channel `c`'s points start `2 * BEZIER_POINTS * c` further on, as
 * `(time, value)` pairs. The storage is read through `curveStorage`, the one
 * reach into that protected array, which `deformmeasure.ts` owns.
 */
function curveChannelValues(timeline: CurveTimeline, channel: number): number[] {
  const entries = timeline.getFrameEntries();
  const curves = curveStorage(timeline);
  const values: number[] = [];
  for (let i = 0, frame = 0; i < timeline.frames.length; i += entries, frame++) {
    values.push(timeline.frames[i + 1 + channel]);
    const code = curves[frame];
    if (!(code >= 2)) continue;
    const start = code - 2 + 2 * BEZIER_POINTS * channel;
    for (let point = 0; point < BEZIER_POINTS; point++) values.push(curves[start + 2 * point + 1]);
  }
  return values;
}

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
 *
 * ⚠️ These are the SETUP pose's sentences and nothing else, which matters on the
 * two rows whose keyed bound is wider than their resting one — `mix` since issue
 * #610 and `strength` since #727. A key of 0 on either is accepted, so "it is
 * muted" and "nothing pulls it back" are read here by a rig that states the
 * number at rest, and what a key is refused with is the row's own `why`.
 *
 * `animations` is how many animations the skeleton declares, and only the `mix`
 * sentence reads it: that bound is the one a key can satisfy instead of the
 * setup pose (`inertAtSetup`, issue #743), so the refusal has to say that the
 * other half was looked for and how wide the search was. A rig with no animation
 * at all then says "none of the 0 animations" rather than implying somebody
 * keyed something.
 *
 * `rule` is the row the value was judged by, and only the `strength` sentence
 * reads it: its two arms live on the row (`outside`), beside the key's own
 * sentence, so what the setup pose and a key say about one number is one text.
 */
const SETUP_POSE_SAYS: Record<
  string,
  (pose: PhysicsConstraintPose, animations: number, rule: PhysicsPoseRule) => string
> = {
  mix: (pose, animations) => `has mix ${pose.mix} and ${noneKeysItsMixAbove0(animations)}; it is muted — ${REST_OR_KEY_ITS_MIX}`,
  mass: (pose) => `has massInverse ${pose.massInverse} (mass must be > 0)`,
  // Two arms, read off the row (issue #748): 0 is a constraint nothing pulls
  // back and below 0 one that is pushed away, and the row's `why` — the key's
  // sentence — quotes the second from the same object.
  strength: (pose, _animations, rule) => `has strength ${pose.strength}; ${physicsOutsideSays(rule, pose.strength)}`,
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
 * Which physics constraints a physics timeline that names NO constraint writes
 * into — the one reading of the unnamed form, for every rule that has to answer
 * it (`A23`, `A34`, `A42`; issue #726).
 *
 * `SkeletonJson` gives a physics group keyed by the empty name `constraintIndex
 * -1` (`SkeletonJson.js:1048-1054`), and the runtime reads that two ways. A
 * value timeline writes every active physics constraint whose own data declares
 * that property global — `PhysicsConstraintTimeline.apply` asks each subclass's
 * `global` (`Animation.js:2067-2075`). `reset` resets every active one and asks
 * no flag at all (`:2234-2238`). Activity is a skin question and is not asked
 * here: a constraint a skin switches on is still one the timeline can reach.
 *
 * 🔑 `constraints` may be the FILE's objects rather than loaded data, and that
 * is what makes this one reading rather than two: `SkeletonJson` copies each
 * `…Global` field onto the data verbatim (`:313-319`), so the runtime's own
 * `global`, asked of the raw object, reads exactly what it would read of the
 * loaded one — a string `"false"` included, which is truthy to both. A rule that
 * spelled `<property>Global` itself would be a second copy of the runtime's
 * table, free to disagree with it.
 */
export function unnamedPhysicsReach<C extends object>(timeline: Timeline, constraints: readonly C[]): C[] {
  if (timeline instanceof PhysicsConstraintResetTimeline) return [...constraints];
  if (!(timeline instanceof PhysicsConstraintTimeline)) return [];
  return constraints.filter((one) => Boolean(timeline.global(one as unknown as PhysicsConstraintData)));
}

/**
 * The timeline the runtime builds for one physics timeline NAME, read by the
 * runtime's own parser off a skeleton that holds nothing else — or null for a
 * name its physics branch skips (`SkeletonJson.js:1094`).
 *
 * ⚠️ This is how a raw-JSON rule gets the runtime's class for a name without a
 * table of the eight: a hand-kept map from `"strength"` to
 * `PhysicsConstraintStrengthTimeline` is the copy this avoids, and the parser's
 * `switch` is already that map. The probe skeleton declares no constraint, so
 * the only group it can carry is the unnamed one, and one key is all
 * `readTimeline1` needs to build the object.
 */
export function unnamedPhysicsTimeline(name: string): Timeline | null {
  const probe = new SkeletonJson(new AtlasAttachmentLoader(new TextureAtlas(''))).readSkeletonData({
    skeleton: {},
    animations: { probe: { physics: { '': { [name]: [{}] } } } },
  });
  return probe.animations[0]?.timelines[0] ?? null;
}

/**
 * The generation `A16` demands, which is the whole of what that assertion is
 * about: the MAJOR.MINOR pair.
 *
 * ⭐ **The reading itself moved to [`generation.ts`](generation.ts)** with issue
 * #706 — one reader of `skeleton.spine` for the whole repository, because
 * `ingest` has to ask the same question of a file somebody else wrote and two
 * regexes would answer it two ways. What did NOT move is the accepted set:
 * `4.3`, `4.3.<patch>` and `4.3.<patch>-<suffix>`, the last of which is what the
 * editor writes for a pre-release (`"4.3.75-beta"` in all twelve official
 * example exports, and the string the original `/^4\.3(\.\d+)?$/` rejected —
 * blocker B2). `GN05` holds that set against the old regex, which survives in
 * `selftest.ts` and nowhere else, for exactly that comparison.
 */
const SPINE_4_3: SpineGeneration = '4.3';

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The time to pose a key at so that the runtime is AT it: the later of the
 * file's number and that number as spine-core stores it (issue #771).
 *
 * 🚨 Every timeline keeps its key times in a `Float32Array`
 * (`Utils.newFloatArray`), and a key time the float cannot hold exactly is
 * stored at the nearest one — for `0.2`, `0.20000000298…`, which is LATER than
 * the double `0.2`. Stepped to the file's own number, a timeline is then just
 * BEFORE its key: before a first key it writes the setup value (`time <
 * frames[0]`), and past a stepped key it still holds the one before
 * (`frames[i] > time`). That is a pose one float step from the key, not the
 * key's — measured on the selftest's own `ingest_probe`, whose `alpha` key at
 * 0.2 posed the setup 1.0 and was refused as `the key states value 0.4`.
 *
 * ⚠️ The later of the two rather than `Math.fround` alone: where the float
 * rounds DOWN, the file's number is already past the stored key, and a runtime
 * built without typed arrays stores the double itself — in both, the file's
 * number is the one at or after the key. What a key time rounds to is the
 * runtime's storage and not the file's statement, so a rule judging what a KEY
 * states poses at the key; the rounding itself is nothing an author can repair.
 */
function atStoredKey(time: number): number {
  return Math.max(time, Math.fround(time));
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
 * The mesh keys the `source` branch never reaches — the geometry a linked mesh
 * may state and nothing reads (issue #710).
 *
 * Derived from the branch rather than chosen. `readAttachment` returns at
 * `SkeletonJson.js:586` as soon as `source` is truthy, and everything below that
 * return reads `map.uvs` (twice: as the length handed to `readVertices` and as
 * `regionUVs`), `map.triangles`, `map.edges` and `map.hull`. `vertices` is on the
 * list because `readVertices` reads `map.vertices` and nothing else (`:654`), so
 * it goes unread with the call that would have read it.
 *
 * ⚠️ `width` and `height` are NOT on this list, although `setSourceMesh`
 * overwrites both with the source's (`MeshAttachment.js:102-103`). The branch
 * reads them at `:569-570`, the format carries them on a link and rigc emits
 * them (#691). A key the parser reads is not a key the parser ignores, whatever
 * a later pass does with the value.
 */
const LINKED_MESH_UNREAD_KEYS = ['uvs', 'triangles', 'vertices', 'hull', 'edges'] as const;

/** One linked mesh as the FILE spells it, before the loader has resolved anything. */
interface RawLinkedMesh {
  /** The placeholder of the mesh whose geometry this attachment draws. */
  source: string;
  /**
   * The `skin` the entry states, or `undefined` for the parser's default — which
   * is the DEFAULT skin and never the skin the link is written in (`:429`).
   */
  skin?: string;
  /** The `slot` the entry states, or `undefined` for the parser's default: this attachment's own slot (`:573-579`). */
  slot?: string;
  /** Which of `LINKED_MESH_UNREAD_KEYS` this entry states, in that order. */
  geometry: string[];
  /**
   * How big a mesh those keys describe — `uvs.length / 2` and
   * `triangles.length / 3` — when the entry states them as arrays.
   *
   * Read so that the failure can put the shape the author wrote beside the shape
   * the runtime draws. `undefined` where the file states the key as something
   * other than an array, which is a file this rule refuses for the key rather
   * than for its length.
   */
  statedVertices?: number;
  statedTriangles?: number;
}

/**
 * `"<skin>\0<slot>\0<placeholder>" -> source` for every linked mesh the raw
 * skeleton declares, with what the file says about each one (issues #691, #710).
 *
 * 🔑 The test is the parser's own and it is not `type`: `type: "mesh"` and
 * `type: "linkedmesh"` share one branch and a truthy `source` is what decides
 * between them (`SkeletonJson.js:568-569`, `:582`). An empty `source` is falsy
 * there, so it is not a link here either — that map is read as an ordinary mesh,
 * which is exactly what the runtime does with it.
 */
function rawLinkedMeshes(raw: unknown): Map<string, RawLinkedMesh> {
  const links = new Map<string, RawLinkedMesh>();
  if (!isObj(raw) || !Array.isArray(raw.skins)) return links;
  for (const skin of raw.skins as unknown[]) {
    if (!isObj(skin) || !isObj(skin.attachments)) continue;
    const skinName = typeof skin.name === 'string' ? skin.name : '(unnamed)';
    for (const [slot, entries] of Object.entries(skin.attachments)) {
      if (!isObj(entries)) continue;
      for (const [placeholder, entry] of Object.entries(entries)) {
        if (!isObj(entry)) continue;
        const type = entry.type === undefined ? 'region' : entry.type;
        if (type !== 'mesh' && type !== 'linkedmesh') continue;
        const source = entry.source;
        if (typeof source !== 'string' || source.length === 0) continue;
        links.set(`${skinName}\u0000${slot}\u0000${placeholder}`, {
          source,
          skin: typeof entry.skin === 'string' ? entry.skin : undefined,
          slot: typeof entry.slot === 'string' ? entry.slot : undefined,
          geometry: LINKED_MESH_UNREAD_KEYS.filter((key) => entry[key] !== undefined),
          statedVertices: Array.isArray(entry.uvs) ? entry.uvs.length / 2 : undefined,
          statedTriangles: Array.isArray(entry.triangles) ? entry.triangles.length / 3 : undefined,
        });
      }
    }
  }
  return links;
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
    // name -> the KINDS declared under it, because that is the namespace the
    // lookup this assertion is about resolves in: `findConstraint(name, type)`
    // tests the type first, so a skeleton may carry `leg` as an ik constraint
    // AND as a transform one and each group finds its own (issue #692). A map
    // keyed by the name alone let the second of a pair overwrite the first, and
    // this assertion then reported a correct file as a type mismatch.
    const kindsOf = new Map<string, string[]>();
    for (const entry of Array.isArray(raw.constraints) ? (raw.constraints as unknown[]) : []) {
      if (isObj(entry) && typeof entry.name === 'string') {
        kindsOf.set(entry.name, [...(kindsOf.get(entry.name) ?? []), String(entry.type)]);
      }
    }
    /** The file's physics constraints, which the unnamed physics group is read against. */
    const rawPhysics = (Array.isArray(raw.constraints) ? (raw.constraints as unknown[]) : []).filter(
      (entry): entry is Json => isObj(entry) && entry.type === 'physics',
    );
    let sawATimeline = false;
    /** One target of one group: the name resolves, the type matches, keys exist. */
    const checkTarget = (at: string, group: string, name: string, keyArrays: Array<[string, unknown]>): void => {
      sawATimeline = true;
      const declared = kindsOf.get(name) ?? [];
      if (declared.length === 0) {
        const known = [...kindsOf.entries()].filter(([, kinds]) => kinds.includes(group)).map(([n]) => n);
        fail(
          'A34_CONSTRAINT_TIMELINE_TARGETS',
          `${at}: the skeleton's constraints array has no "${name}"` +
            (known.length ? ` (${group} constraints: ${known.join(', ')})` : `, and no ${group} constraint at all`),
        );
        return;
      }
      if (!declared.includes(group)) {
        fail(
          'A34_CONSTRAINT_TIMELINE_TARGETS',
          `${at}: "${name}" is declared as a "${declared.join('"/"')}" constraint, so the ${group} lookup misses it and the loader throws`,
        );
        return;
      }
      checkKeys(at, keyArrays);
    };
    /** The key arrays of one group entry that resolved: each one is walked, so each has to hold a key. */
    const checkKeys = (at: string, keyArrays: Array<[string, unknown]>): void => {
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
          // The empty name is not a miss: it is the physics group's global form,
          // which `SkeletonJson` loads as `constraintIndex -1` rather than looking
          // anything up (`:1048-1054`), and which writes every physics constraint
          // that declares the timeline's property global (issue #726). Refusing
          // it as "no constraint called ''" was a sentence that is false about
          // the file. What CAN be wrong with it is that it reaches nobody: the
          // parser accepts it, the runtime walks every constraint, and none of
          // them takes the key.
          if (group === 'physics' && name === '') {
            sawATimeline = true;
            for (const [timelineName] of Object.entries(timelines)) {
              const timeline = unnamedPhysicsTimeline(timelineName);
              // A name the parser skips is skipped here too: no timeline exists
              // to reach anybody, and whether the NAME is right is not a target
              // question.
              if (timeline === null || unnamedPhysicsReach(timeline, rawPhysics).length > 0) continue;
              const resets = timeline instanceof PhysicsConstraintResetTimeline;
              fail(
                'A34_CONSTRAINT_TIMELINE_TARGETS',
                `${at} timeline "${timelineName}": a physics group that names no constraint writes every physics ` +
                  `constraint ${resets ? 'the skeleton has' : `declaring "${timelineName}Global": true`}, and ` +
                  (rawPhysics.length === 0
                    ? 'the skeleton has no physics constraint'
                    : `none of ${rawPhysics.map((one) => `"${String(one.name)}"`).join(', ')} does`) +
                  ' — the parser loads it, the runtime walks every constraint, and no constraint takes the key',
              );
            }
            checkKeys(at, Object.entries(timelines));
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
    if (typeof declared !== 'string' || spineGeneration(declared) !== SPINE_4_3) {
      fail(
        'A16_SKELETON_VERSION_4_3',
        `skeleton.spine is ${JSON.stringify(declared)}, expected 4.3, 4.3.<patch> or 4.3.<patch>-<suffix>`,
      );
    }
  });

  // --- A01: no legacy top-level constraint arrays ---------------------------
  // 4.3 folds every constraint into one `constraints` array with a `type`.
  // A 4.1/4.2-shaped `physics` array loads clean and the constraint just
  // vanishes. ⭐ The list is `generation.ts`'s since #706, because `ingest` has
  // to count the same arrays in a file it did not emit, and two copies of five
  // names is how one of them comes to be four.
  check('A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS', () => {
    for (const key of TOPLEVEL_CONSTRAINT_ARRAYS) {
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
  // Normal inheritance (case 6b). The key itself is `generation.ts`'s, for
  // A01's reason.
  check('A02_NO_BONE_TRANSFORM_KEY', () => {
    const bones = Array.isArray(raw?.bones) ? (raw.bones as unknown[]) : [];
    for (const bone of bones) {
      if (isObj(bone) && LEGACY_BONE_INHERIT_KEY in bone) {
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
  /**
   * The loaded mesh of every attachment the FILE spells as a link, to what the
   * file says about it (issues #691, #710).
   *
   * 🔑 Read off the raw JSON and joined by (skin, slot, placeholder) rather than
   * asked of the loaded object, because `MeshAttachment.sourceMesh` is **private
   * with no accessor** (`MeshAttachment.d.ts:50`) and `as any` is not available
   * in `src/`. The join is the parser's own: `readSkin` keys a skin's table by
   * the JSON key (`SkeletonJson.js:415-418`) and `SkinEntry.placeholder` is that
   * same key, so the two sides cannot drift.
   *
   * ⚠️ It is a Map of the LOADED object and not a set of names, because a
   * placeholder is unique only within one skin's slot and several skins fill
   * one — and every assertion downstream holds the attachment, not its address.
   */
  const linkedMeshes = new Map<MeshAttachment, RawLinkedMesh>();
  /**
   * The same pairing the other way round — join key -> the attachment the loader
   * produced for it — which is what `A44` needs and `kindOf` does not.
   *
   * 🔑 Two maps rather than one because the two questions are different. Every
   * rule that asks "is THIS attachment a link" holds the object and wants the
   * file's word about it; `A44` walks the FILE's links and asks what the runtime
   * made of each, including the answer "nothing" — a link whose region is
   * missing loads as `null` and is in no skin at all (`A08` names that), so its
   * join key is absent here while the file still declares it.
   */
  const loadedLinks = new Map<string, MeshAttachment>();

  if (skeletonData) {
    const data = skeletonData as NonNullable<typeof skeletonData>;
    const rawLinks = rawLinkedMeshes(raw);
    for (const skin of data.skins) {
      for (const entry of skin.getAttachments()) {
        const att = entry.attachment;
        if (att instanceof RegionAttachment) regionAttachments.push(att);
        else if (att instanceof MeshAttachment) {
          meshAttachments.push(att);
          meshSlots.add(entry.slotIndex);
          const join = `${skin.name}\u0000${data.slots[entry.slotIndex].name}\u0000${entry.placeholder}`;
          const link = rawLinks.get(join);
          if (link !== undefined) {
            linkedMeshes.set(att, link);
            loadedLinks.set(join, att);
          }
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
      // 🔗 A LINKED mesh borrows another attachment's geometry, so no generator
      // topology is a claim about THIS attachment — and the ARTIFACT says which
      // ones they are (`linkedMeshes`, read off the file's own `source` keys).
      // It is read from there rather than off `meshKinds` for two reasons, and
      // the second is the load-bearing one.
      //
      //   1. `meshKinds` is keyed by SLOT, and a link's slot is not its
      //      geometry's: a link to a `ring` in another slot looked up the LINK's
      //      slot, found nothing, and took the `|| 'ring'` fallback — issue #44's
      //      own default, reached by a new route. Measured before this clause on
      //      a correct rig (a ring on slot "sa", a link to it on slot "sb"):
      //      **8 A21 failures**, `mesh "sb" rim vertex 0 is pinned to "a", not
      //      the slot bone "b"`, one per hull vertex. The rim is pinned exactly
      //      where the ring's own slot put it, which is the only place it could
      //      be.
      //   2. Writing the link into `meshKinds` instead would have overwritten
      //      the source's kind wherever the two share a slot, which is the
      //      commonest linked mesh there is — silencing A21 on the mesh rigc
      //      DID build. A gate turned off by a feature is worse than a gate
      //      that skips something it cannot measure.
      if (linkedMeshes.has(target)) return 'authored';
      const slot = slotOfAttachment(target);
      return (slot && input.rig?.meshKinds[slot]) || 'ring';
    };
    /**
     * Meshes whose topology is not rigc's to have an opinion about, by name and
     * with the reason each one is on the list — the string several skips need.
     */
    const authoredMeshNames = (list: MeshAttachment[]): string[] =>
      list
        .filter((m) => kindOf(m) === 'authored')
        .map((m) => {
          const source = linkedMeshes.get(m)?.source;
          return source === undefined ? `"${m.name}"` : `"${m.name}" (linked to "${source}")`;
        });

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
        // 📐 PROFILE, and the converse of the weight-0 branch above: that one
        // says a generated mesh binds only bones that MOVE it, and this one says
        // every bone it declares moves it. They are halves of one sentence — the
        // bone set the mesh declares is the bone set its weights reference — so
        // they are one assertion rather than two, and neither is a fact about
        // Spine: a declared bone nothing binds loads and renders perfectly.
        //
        // 🚨 It is the one mesh question a vertex cannot answer, which is why
        // every per-vertex rule above was green on the ring that raised it: a
        // rig-spec ring naming two grips bound one of them, and the absent bone
        // appears in no vertex, in no sum and in no index (issue #684). The
        // declaration comes from the compiler's own record of what it bound,
        // which is what the `MESH` report line prints.
        if (policy && generated && input.rig) {
          const slot = slotOfAttachment(mesh);
          const declared = (slot && input.rig.meshDeclaredBones[slot]) || [];
          const bound = new Set<string>();
          for (const vertex of perVertex) {
            for (const { bone } of vertex) {
              const named = data.bones[bone];
              if (named) bound.add(named.name);
            }
          }
          for (const name of declared) {
            if (bound.has(name)) continue;
            fail(
              'A20_MESH_WEIGHTS_COHERENT',
              `mesh "${mesh.name}" declares bone "${name}" and none of its ${perVertex.length} vertices binds it; ` +
                `the weights reference ${[...bound].map((n) => `"${n}"`).join(', ')}`,
            );
          }
        }
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
      // An authored mesh has no rim rigc drew and no entry row rigc placed, and
      // a linked mesh has no rim of its OWN at all — the one it draws belongs to
      // its source, and is measured there. Nothing to measure is a SKIP — never
      // a pass, and never a failure on somebody else's correct geometry.
      const measurable = meshAttachments.filter((m) => m.bones && kindOf(m) !== 'authored');
      if (measurable.length === 0) {
        const authored = authoredMeshNames(meshAttachments.filter((m) => m.bones));
        return skip(
          'A21_MESH_RIM_PINNED',
          `every weighted mesh here is authored or linked geometry (${authored.join(', ')}), not a rigc ring or ` +
            'ribbon — rigc did not place its rim, so it has no rim of its own to find unpinned',
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

    /**
     * The constraints some animation keys to a value `live` accepts, on any
     * channel of a timeline `owns` claims — the one answer to "does anything
     * switch this on" for `A23`, `A36`, `A37` and `A40` (issues #743, #752).
     *
     * ⭐ It replaced `keyedBy`, which read the raw JSON and took a non-empty key
     * array as the answer, and it did so rather than teaching that one to read
     * values, because the raw file is the wrong place to read a value: a path
     * `mix` key that omits `mixRotate` means 1 (`SkeletonJson.js:1011-1013`), a
     * `mixY` it omits means that key's `mixX`, and a Bezier between two keys
     * poses values neither key states. A raw reader would restate the parser's
     * defaults and re-derive its curves — a second opinion on the runtime's own
     * numbers — so this reads the loaded timelines instead, with
     * `curveChannelValues` for the curves. [measured] the reading `keyedBy` gave
     * was wrong in the accepting direction: a path constraint and a slider,
     * both muted at rest and keyed to 0 only, pose every bone exactly where the
     * same rig with no timeline does (max |Δ| 0.000000 over 60 steps at 60 fps) and both
     * passed.
     *
     * A timeline naming no constraint is the physics family's global form and
     * `unnamedPhysicsReach` answers who it reaches; every other constraint
     * timeline names its one constraint by index.
     *
     * `live` is handed the channel as well as the value, because not every
     * channel of every constraint timeline is a mix (issue #765): an ik frame is
     * mix, softness, bend direction, compress and stretch, so a bend direction of
     * +1 is not a key that switches anything on, and a transform frame carries
     * six mixes of which only the ones for a property the constraint drives are
     * ever read.
     */
    const keyedLive = <T extends CurveTimeline & ConstraintTimeline>(
      owns: (timeline: Timeline) => timeline is T,
      live: (timeline: T, value: number, channel: number) => boolean,
    ): Set<object> => {
      const reached = new Set<object>();
      for (const animation of data.animations) {
        for (const timeline of animation.timelines) {
          if (!owns(timeline)) continue;
          let keysLive = false;
          for (let channel = 0; channel < timeline.getFrameEntries() - 1 && !keysLive; channel++) {
            keysLive = curveChannelValues(timeline, channel).some((value) => live(timeline, value, channel));
          }
          if (!keysLive) continue;
          const reach =
            timeline.constraintIndex === -1
              ? unnamedPhysicsReach(timeline, data.constraints.filter((one) => one instanceof PhysicsConstraintData))
              : [data.constraints[timeline.constraintIndex]];
          for (const one of reach) if (one) reached.add(one);
        }
      }
      return reached;
    };

    /**
     * The one predicate a path or slider mix is judged by, at setup and on every
     * value a key poses: above 0, where `update()` does anything at all.
     */
    const mixLive = (value: number): boolean => value > 0;

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
      // --- which constraints an animation switches ON (issue #743) ----------
      //
      // 🔑 The setup pose is the rig AT REST, and one of the four bounds is a
      // state rather than a break there: `PHYSICS_POSE_RULES` marks `mix`
      // `inertAtSetup`, because `update` opens with `if (mix === 0) return;`
      // (`PhysicsConstraint.js:109-111`) and nothing else in the pose has such a
      // branch. So a constraint that rests muted and is keyed above 0 by an
      // animation is a rig the runtime plays as authored, and refusing it would
      // refuse a design: physics off at rest, switched on by the animation that
      // needs it.
      //
      // 📏 Measured on a generated physics fixture, 36 steps at 60 fps with the
      // constraint's own bone swung by its parent: resting at `mix` 0 with an
      // animation keying `mix` to 1 poses the bone IDENTICALLY to the same rig
      // resting at 1 (max |dx| 0.000000) and up to 7.771177 away from the twin
      // that keys nothing — which poses identically to one keyed to 0 only
      // (max |dx| 0.000000). Two states, and the file says which.
      //
      // ⚠️ The escape is the rule's own field rather than the word "mix": a
      // setup `mass` of 0 is `massInverse` Infinity BEFORE anything plays, and
      // [measured] at rest it reads NaN on every frame although an animation
      // keys `mass` to 1. A key cannot rescue a value that has already broken
      // the rig it is resting in.
      //
      // The keys are read by `keyedLive`, the one reading A36 and A37 share
      // (issue #752), through the runtime's own accessor: the pose field is
      // where the integrator reads the number, and for `mass` that is not the
      // number the key states. It counts the unnamed global form through
      // `unnamedPhysicsReach` and a Bezier segment's samples as well as its keys.
      const unmuted = new Map<PhysicsConstraintData, Set<string>>();
      const raised = new PhysicsConstraintPose();
      for (const rule of PHYSICS_POSE_RULES) {
        if (!rule.inertAtSetup) continue;
        const reached = keyedLive(
          (timeline): timeline is PhysicsConstraintTimeline =>
            timeline instanceof PhysicsConstraintTimeline &&
            PHYSICS_TIMELINE_NAMES[Number(timeline.getPropertyIds()[0].split('|')[0])] === rule.timeline,
          (timeline, value) => {
            timeline.set(raised, value);
            return rule.poseOk(raised[rule.field]);
          },
        );
        for (const one of data.constraints) {
          if (!(one instanceof PhysicsConstraintData) || !reached.has(one)) continue;
          const by = unmuted.get(one) ?? new Set<string>();
          by.add(rule.timeline);
          unmuted.set(one, by);
        }
      }
      let mutedUntilKeyed = 0;
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
          if (rule.inertAtSetup && unmuted.get(constraint)?.has(rule.timeline)) {
            mutedUntilKeyed++;
            continue;
          }
          const drivesAMesh = rule.timeline === 'damping' && meshBoneNames.has(constraint.bone.name);
          fail(
            'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
            `${where} ${SETUP_POSE_SAYS[rule.timeline](pose, data.animations.length, rule)}` +
              (drivesAMesh ? ' — and this bone drives a mesh, so the canvas never rests' : ''),
          );
        }
        if (constraint.step <= 0 || !Number.isFinite(constraint.step)) {
          fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has step ${constraint.step} (fps must be > 0)`);
        }
      }
      // What the PASS would otherwise not say: this rig rests with physics off
      // on that many constraints and an animation is what switches them on. A
      // pass carries no detail — `passed` is a list of names — so `stats` is the
      // channel that exists, and a number is what belongs in a line printed as
      // `k=v`: naming every such constraint and the animations that reach it
      // would be a paragraph on one line, and the rig where nobody meant it is
      // the rig where the NUMBER is the surprise. Absent rather than 0 when
      // nothing rests muted, so it appears only where it says something.
      if (mutedUntilKeyed) stats.physicsMutedUntilKeyed = mutedUntilKeyed;

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
     * Which path constraints and sliders an animation switches ON — `keyedLive`
     * over their `mix` timelines, judged by `mixLive`, the predicate their setup
     * pose is judged by below.
     *
     * ⭐ The reason the two assertions below need this: a constraint whose mixes
     * are all 0 at setup is **the idiom**, not a defect — spineboy's aim rig is
     * exactly that, and issue #88 landed the timelines that turn one on. So
     * "muted" is only a finding when nothing turns it on, and that question
     * lives in the animations rather than in the constraint.
     *
     * 🔑 "Turns it on" is a VALUE question, and until issue #752 these two asked
     * a weaker one than `A23` — whether a `mix` key array was non-empty — so a
     * timeline keying 0 only was a rescue for a constraint it leaves exactly as
     * muted as no timeline does. Now a path constraint is switched on by a key
     * posing any of its three mixes above 0, which is the runtime's own
     * condition: `PathConstraint.update` returns when `mixRotate`, `mixX` and
     * `mixY` are all 0 (`PathConstraint.js:73-75`), and `Slider.update` when
     * `mix` is (`Slider.js:53-54`).
     */
    const pathSwitchedOn = keyedLive(
      (timeline): timeline is PathConstraintMixTimeline => timeline instanceof PathConstraintMixTimeline,
      (_timeline, value) => mixLive(value),
    );
    const sliderSwitchedOn = keyedLive(
      (timeline): timeline is SliderMixTimeline => timeline instanceof SliderMixTimeline,
      (_timeline, value) => mixLive(value),
    );

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
    // nothing. All three mixes at 0 is only a finding when no animation keys one
    // of them above 0 (see `pathSwitchedOn`), and a chain with no bones on it is
    // one whether or not anything is keyed.
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
        const muted = ![pose.mixRotate, pose.mixX, pose.mixY].some(mixLive);
        if (muted && !pathSwitchedOn.has(constraint)) {
          fail(
            'A36_PATH_CONSTRAINT_EFFECTIVE',
            `${where} has mixRotate ${pose.mixRotate}, mixX ${pose.mixX} and mixY ${pose.mixY} at setup and ` +
              `${noneKeysItsMixAbove0(data.animations.length)}; update() returns on all-zero mixes, so nothing ever ` +
              'puts a bone on the path — rest one of the three above 0, or key its mix above 0 in an animation',
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
        if (!mixLive(mix) && !sliderSwitchedOn.has(slider)) {
          fail(
            'A37_SLIDER_CONSTRAINT_EFFECTIVE',
            `${where} has mix ${mix} at setup and ${noneKeysItsMixAbove0(data.animations.length)}; update() returns ` +
              `on mix 0 — ${REST_OR_KEY_ITS_MIX}`,
          );
        }
      }
      stats.sliderConstraints = sliders.length;
    });

    // --- A47 / A48: an ik or a transform constraint muted for good ----------
    //
    // The question A23, A36 and A37 ask of their own kinds, asked of the two
    // kinds editor exports use most (issue #765): a constraint that rests muted
    // and that no animation switches on parses, sits in the update cache and
    // moves nothing. [measured] on generated fixtures, 61 steps at 60 fps: an ik
    // at `mix` 0 that nothing keys, one keyed to 0 only, a transform at every mix
    // 0 that nothing keys and one keyed to 0 only each pose every bone exactly
    // where the same rig with no constraint does (max |Δ| 0.000000), and all four
    // gated green with 0 failures before these two existed.
    //
    // 🔑 **Live is the runtime's own test, `!== 0`, and not `mixLive`'s `> 0`.**
    // `IkConstraint.update` returns on `mix === 0` and a transform's inner loop
    // applies a property only when `to.mix(pose) !== 0`, so a negative mix runs.
    // That is not a corner: [measured] five transform constraints across four of
    // the editor's own example exports rest at mixX = mixY = −1, nothing keys
    // them, and each moves its bones at setup against the same constraint with
    // every mix 0. A `> 0` reading refuses all five. (`A36`/`A37` still read
    // `> 0` — a path or slider resting negative is a question for their own card.)
    //
    // 🔑 **A transform mix is read only for a property the constraint drives.**
    // The early return in `TransformConstraint.update` is over all six mixes, but
    // it is not what decides whether anything moves: each `to` entry reads its own
    // mix (`ToRotate.mix` is `mixRotate`, …). At setup the parser only reads a mix
    // whose property is declared, so the two tests agree there — but a timeline
    // key that omits a mix is read as 1 (`SkeletonJson.js`, every `getValue(…, 1)`),
    // so a key of `mixRotate: 0` alone on a rotate-only constraint passes the
    // six-mix test on five mixes nothing reads. [measured] that key poses every
    // bone exactly where no constraint does, and so does one keying `mixX` 1 on
    // the same constraint. So this reads the mixes of the declared `to` kinds,
    // at setup and on every value a key poses.
    const ikLive = (value: number): boolean => value !== 0;
    /** A transform timeline's six channels, in frame order, and the `to` kind each one is the mix of. */
    const TRANSFORM_MIXES = [
      ['mixRotate', ToRotate],
      ['mixX', ToX],
      ['mixY', ToY],
      ['mixScaleX', ToScaleX],
      ['mixScaleY', ToScaleY],
      ['mixShearY', ToShearY],
    ] as const;
    /** Which of the six channels `constraint` reads at all: the ones whose `to` kind it declares. */
    const transformReads = (constraint: TransformConstraintData): boolean[] =>
      TRANSFORM_MIXES.map(([, kind]) => constraint.properties.some((from) => from.to.some((to) => to instanceof kind)));
    const ikSwitchedOn = keyedLive(
      (timeline): timeline is IkConstraintTimeline => timeline instanceof IkConstraintTimeline,
      // Channel 0 is `mix`; the other four are softness, bend direction, compress and stretch.
      (_timeline, value, channel) => channel === 0 && ikLive(value),
    );
    const transformSwitchedOn = keyedLive(
      (timeline): timeline is TransformConstraintTimeline => timeline instanceof TransformConstraintTimeline,
      (timeline, value, channel) => {
        const constraint = data.constraints[timeline.constraintIndex];
        return constraint instanceof TransformConstraintData && transformReads(constraint)[channel] && value !== 0;
      },
    );

    check('A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT', () => {
      const constraints = data.constraints.filter((c) => c instanceof IkConstraintData);
      if (!constraints.length) return skip('A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT', 'the skeleton declares no ik constraint');
      for (const constraint of constraints) {
        const mix = constraint.setupPose.mix;
        if (ikLive(mix) || ikSwitchedOn.has(constraint)) continue;
        fail(
          'A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT',
          `ik constraint "${constraint.name}" has mix ${mix} at setup and ${noneKeysItsMixAbove0(data.animations.length)}; ` +
            `update() returns on mix 0, so ${constraint.bones.map((bone) => `"${bone.name}"`).join(' and ')} never ` +
            `reach${constraint.bones.length === 1 ? 'es' : ''} for "${constraint.target.name}" — ${REST_OR_KEY_ITS_MIX}`,
        );
      }
    });

    check('A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT', () => {
      const NAME = 'A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT';
      const constraints = data.constraints.filter((c) => c instanceof TransformConstraintData);
      if (!constraints.length) return skip(NAME, 'the skeleton declares no transform constraint');
      for (const constraint of constraints) {
        const where = `transform constraint "${constraint.name}"`;
        const reads = transformReads(constraint);
        const pose = constraint.setupPose;
        const read = TRANSFORM_MIXES.filter((_, i) => reads[i]).map(([field]) => field);
        if (read.length === 0) {
          // No `to` at all: no mix is ever read, so neither remedy below applies.
          fail(
            NAME,
            `${where} drives no property — its \`properties\` name no \`to\` — so no mix it carries is ever read and it ` +
              'moves nothing; declare the property it should drive',
          );
          continue;
        }
        if (read.some((field) => pose[field] !== 0) || transformSwitchedOn.has(constraint)) continue;
        fail(
          NAME,
          `${where} drives ${read.map((field) => field.slice(3).replace(/^./, (c) => c.toLowerCase())).join(', ')} and has ` +
            `${read.map((field) => `${field} ${pose[field]}`).join(', ')} at setup, and ` +
            `${noneKeysItsMixAbove0(data.animations.length)}; a mix is read only for a property the constraint drives, and ` +
            `update() skips each one at 0, so nothing ever moves ${constraint.bones.map((bone) => `"${bone.name}"`).join(', ')} — ` +
            `rest ${read.length === 1 ? read[0] : `one of ${read.join(', ')}`} above 0, or key its mix above 0 in an animation`,
        );
      }
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
      // "Keyed at all" rather than "keyed live", and on purpose: this clause asks
      // whether the mix can MOVE from its setup value, so any mix timeline
      // disqualifies it — the question `keyedBy` answered here, through the one
      // reading `keyedLive` gives, and unchanged by issue #752.
      const mixKeyed = keyedLive(
        (timeline): timeline is SliderMixTimeline => timeline instanceof SliderMixTimeline,
        () => true,
      );
      const authoritative = sliders.filter((s) => s.setupPose.mix >= 1 && !mixKeyed.has(s));
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

    // --- A42: a dial that drives a constraint the array already ran ---------
    //
    // 🚨 The hole A40 leaves, and it leaves it BY CONSTRUCTION. A40's population
    // is the sliders at full authority whose own `mix` nothing keys, so the one
    // pair this rule is about — a slider whose `mix` IS keyed — is excluded
    // before any timeline is looked at. Between them the two rules ask different
    // questions about the same array: A40 asks who writes a shared property
    // last, this asks whether anybody reads what was written at all.
    //
    // `Skeleton.updateCache` walks `constraints` in order and each constraint's
    // `sort` pushes itself onto the update cache as it is reached — `sortBone`
    // pushes bones and never a constraint — so the array IS the update order,
    // for every kind. Every constraint then opens its `update` by reading its
    // own applied pose: `Slider.update` takes `mix` and `time` off it before
    // applying its animation, `PhysicsConstraint.update` returns on `mix === 0`
    // before reading `inertia`, `wind` and the rest, and the ik, transform and
    // path constraints read their mixes the same way. So a slider that keys any
    // property of a constraint is read by that constraint only when it comes
    // LATER in the array; written the other way round the value lands in a pose
    // whose only reader has already run, and `Skeleton.updateWorldTransform`
    // opens the next frame by putting `Posed.resetConstrained` over it.
    //
    // [measured, issue #665] One dial and one constraint, in both array orders,
    // read at 6 positions of the dial. The constraint's own pose holds the same
    // ramp in BOTH orders — the write happens either way — and what the
    // constraint drives is dead in one of them:
    //
    //   ik         shin worldY   0.000e+0 against 1.662e+1 the other way round
    //   transform  shin world x-angle 0.000e+0 against 4.000e+1
    //   path       rider worldX  0.000e+0 against 1.620e+2
    //   physics    tip worldX    0.000e+0 against 4.256e+2, over 30 frames, so
    //              the one kind with state of its own is not rescued by it
    //   slider     flag rotate   0.000e+0 against 4.000e+1
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
    // would raise it is ever applied. Only a slider can reach that shape: the
    // constraint at the driver's own index IS the driver.
    //
    // ⚠️ `physics` `reset` is NOT in this population, and the measurement is why
    // the card that asked for "every constraint a slider's animation keys" is
    // refused here on one spelling. `PhysicsConstraintResetTimeline` writes no
    // pose at all — `constraint.reset()` sets fields on the constraint object,
    // which `resetConstrained` does not touch — and it fires only when a frame
    // time is CROSSED. A slider applies its animation with `p.time` as both
    // `lastTime` and `time`, so nothing is ever crossed: [measured] 0 calls to
    // `PhysicsConstraint.reset` at 6 dial readings x 4 frames in BOTH array
    // orders, against 1 call when the same animation is applied over a span.
    // Refusing it would name a reorder that repairs nothing, so the SKIP says
    // what was found instead.
    check('A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER', () => {
      const sliders = data.constraints.filter((c) => c instanceof SliderData);
      if (!sliders.length) {
        return skip('A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER', 'the skeleton declares no slider constraint');
      }
      /**
       * The runtime class behind a `*Data`, and the word a motion spec writes
       * for its kind. Taken structurally rather than through
       * `ConstraintData<T, P>`, whose two type arguments the runtime itself
       * fills with `any` — which `src/` may not write.
       */
      const kindOf = (constraint: { constructor: { name: string } }): { word: string; runtime: string } => {
        const runtime = constraint.constructor.name.replace(/Data$/, '');
        return { word: runtime.replace(/Constraint$/, '').toLowerCase(), runtime };
      };
      /**
       * `physicsConstraintWind` -> `wind`, `pathConstraintMix` -> `mix`,
       * `sliderTime` -> `time`, `ikConstraint` -> `ik`: the `Property` name with
       * the constraint kind taken off the front, which is the word the motion
       * spec's own track or block carries. Derived rather than tabulated — a
       * table here would be one more hand-kept list of the runtime's enum.
       */
      const keyedWord = (property: string, kind: string): string => {
        const rest = property.replace(/^(ik|transform|path|physics|slider)(Constraint)?/, '');
        return rest === '' ? kind : rest.charAt(0).toLowerCase() + rest.slice(1);
      };
      /**
       * Which constraints one timeline writes into.
       *
       * A physics timeline whose animation names no constraint carries
       * `constraintIndex -1`, and `PhysicsConstraintTimeline.apply` reads that
       * as every ACTIVE physics constraint whose own data declares that property
       * global. A motion spec spells it `"physics": "*"` (issue #726) and a
       * foreign file the empty name; `unnamedPhysicsReach` is the one reading
       * of it, shared with `A23` and `A34`.
       */
      const drivenBy = (timeline: Timeline & ConstraintTimeline): number[] => {
        if (timeline.constraintIndex >= 0) return [timeline.constraintIndex];
        return unnamedPhysicsReach(
          timeline,
          data.constraints.filter((one) => one instanceof PhysicsConstraintData),
        ).map((one) => data.constraints.indexOf(one));
      };
      let pairs = 0;
      let resets = 0;
      for (const driver of sliders) {
        const driverIndex = data.constraints.indexOf(driver);
        for (const timeline of driver.animation?.timelines ?? []) {
          if (!isConstraintTimeline(timeline)) continue;
          if (timeline instanceof PhysicsConstraintResetTimeline) {
            resets++;
            continue;
          }
          const property = String(Property[Number(timeline.propertyIds[0].split('|')[0])] ?? timeline.propertyIds[0]);
          const everyPhysics = timeline.constraintIndex < 0;
          for (const drivenIndex of drivenBy(timeline)) {
            const driven = data.constraints[drivenIndex];
            if (driven === undefined) continue;
            pairs++;
            if (drivenIndex > driverIndex) continue;
            const kind = kindOf(driven);
            const word = keyedWord(property, kind.word);
            const animation = `animation "${driver.animation?.name}"`;
            const reference = `\`${kind.word}.${driven.name}${word === kind.word ? '' : `.${word}`}\``;
            fail(
              'A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER',
              drivenIndex === driverIndex
                ? `slider "${driver.name}" (constraints[${driverIndex}]) keys its own \`${word}\` in ${animation}. ` +
                    '`Slider.update` reads `appliedPose.' +
                    `${word}\` as the ${word === 'mix' ? 'alpha it applies that animation with' : 'time it applies that animation at'}, ` +
                    'before the animation runs, so the key is written after its only reader and `Posed.resetConstrained` ' +
                    `puts the pose back before the next frame${
                      word === 'mix'
                        ? ' — and at `mix` 0 `update` returns before applying anything at all, so the key that would raise it is unreachable'
                        : ''
                    }. Key ${reference} from a slider EARLIER in \`constraints\`, or state the ` +
                    `\`${word}\` this slider should start at in the rig spec`
                : `slider "${driver.name}" (constraints[${driverIndex}]) keys ${
                    word === kind.word ? `the \`${word}\` timeline` : `\`${word}\``
                  } of ${kind.word} constraint ` +
                    `"${driven.name}" (constraints[${drivenIndex}]) in ${animation}${
                      everyPhysics ? ' — the timeline names no constraint, which the runtime reads as every physics constraint declaring that property global —' : ''
                    }, and "${driven.name}" updates FIRST. The \`constraints\` array is the update order ` +
                    '(`Skeleton.updateCache` walks it and each constraint\'s `sort` pushes itself as it is reached) and ' +
                    `\`${kind.runtime}.update\` reads its own \`appliedPose\` before applying anything, so that key is ` +
                    'written after the only read of it and `Posed.resetConstrained` discards it before the next frame: ' +
                    `what "${driven.name}" drives is dead at every reading of "${driver.name}"'s dial, although its pose ` +
                    `still holds the number. Move "${driver.name}" before "${driven.name}" in \`constraints\`, or key ` +
                    `${reference} from a slider that already is`,
            );
          }
        }
      }
      if (pairs === 0) {
        return skip(
          'A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER',
          `no animation applied by one of the ${sliders.length} slider constraint${sliders.length === 1 ? '' : 's'} keys a ` +
            `property of a constraint, so no slider here drives a constraint${
              resets === 0
                ? ''
                : ` — the ${resets} \`physics\` \`reset\` key(s) they do carry are not a pose write, and [measured] a slider ` +
                  'applies its animation at one instant, so `PhysicsConstraintResetTimeline` never fires from one in either array order'
            }`,
        );
      }
      stats.sliderDrivenConstraints = pairs;
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
      // The constraint OBJECTS a skin lists, never their names: a name is not a
      // constraint in this format, and two constraints of one name under two
      // kinds are two objects a skin may list separately (issue #692). Keyed by
      // name, a `transform` `leg` that no skin lists read as listed because an
      // `ik` `leg` was — a skinRequired constraint that never runs, reported
      // green by the one assertion that looks for exactly that.
      const listedConstraints = new Set(data.skins.flatMap((skin) => skin.constraints));
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
        if (constraint.skinRequired && !listedConstraints.has(constraint)) {
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
        // The slack is one float32 step at the declared duration, and it is the
        // same function the compiler's Rule 4 refuses on (`float32Step`, in
        // `timelines.ts`, which says why it is a step of the float and no longer
        // a fixed 1e-6 plus one).
        const slack = float32Step(declared);
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
      /** Is this a mode `updateWorldTransform`'s switch has a case for? Read off the runtime's own enum. */
      const isMode = (inherit: unknown): boolean => typeof inherit === 'number' && Inherit[inherit] !== undefined;

      // -- the bone's inheritance mode, posed at every `inherit` key ---------
      //
      // 🚨 The one bone timeline whose value is a NAME, and the only one that
      // can pose a NaN with a finite world: `SkeletonJson` resolves a key's mode
      // through `Utils.enumValue`, which folds the first letter's case and
      // nothing else, so `"NOSCALE"` resolves to `undefined` and the timeline's
      // `Float32Array` frame stores NaN. `InheritTimeline.apply` then sets
      // `pose.inherit = NaN`, `updateWorldTransform`'s switch matches no case,
      // and the bone keeps whatever world matrix it had — measured on a forged
      // two-bone chain: at the key the child's `a,b,c,d` equal the setup
      // Normal-mode pose to the last digit while the file says `noScale`. The
      // world position stays finite, so the loop below never saw it (#733).
      //
      // ⚠️ Posed AT each key rather than read off the stepping loop, because a
      // stepped value lives from its key to the next one and a sampling grid
      // can step over a short span entirely. What is judged is whether the
      // posed value IS a mode — which is this assertion's name exactly — and
      // not which mode: for any spelling the lookup resolves, the mode posed
      // is the mode written by construction of the same lookup, so an equality
      // here would be the parser agreeing with itself.
      const rawAnimations = isObj(raw) && isObj(raw.animations) ? raw.animations : {};
      let unresolved = 0;
      for (const [animName, rawAnim] of Object.entries(rawAnimations)) {
        if (!isObj(rawAnim) || !isObj(rawAnim.bones)) continue;
        for (const [boneName, timelines] of Object.entries(rawAnim.bones)) {
          if (!isObj(timelines) || !Array.isArray(timelines.inherit)) continue;
          if (!data.findAnimation(animName) || !data.findBone(boneName)) continue;
          for (const rawKey of timelines.inherit as unknown[]) {
            if (!isObj(rawKey)) continue;
            const time = typeof rawKey.time === 'number' ? rawKey.time : 0;
            const skeleton = new Skeleton(data);
            const state = new AnimationState(new AnimationStateData(data));
            state.setAnimation(0, animName, false);
            skeleton.setupPose();
            skeleton.update(0);
            skeleton.updateWorldTransform(Physics.reset);
            state.update(time);
            state.apply(skeleton);
            skeleton.update(time);
            skeleton.updateWorldTransform(Physics.update);
            const posed = skeleton.findBone(boneName)?.appliedPose.inherit;
            if (isMode(posed)) continue;
            unresolved++;
            fail(
              'A10_NO_NAN_AFTER_STEPPING',
              `animation "${animName}" bone "${boneName}" inherit (t=${time}): the bone poses inheritance mode ` +
                `${String(posed)} — the key spells ${JSON.stringify(rawKey.inherit)}, which the runtime's mode lookup ` +
                `does not resolve (${BONE_INHERIT_KNOWN}), so no mode applies until the next key and the bone keeps ` +
                'the world rotation, scale and shear it had',
            );
          }
        }
      }
      if (unresolved > 0) return;

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
            // The setup half of the clause above: a bone's own `inherit` goes
            // through the same lookup, and a miss there loads `undefined` into
            // the setup pose, which every frame copies. Only reachable on a
            // file rigc did not write — `parseRigSpec` refuses the spelling.
            if (!isMode(pose.inherit)) {
              const rawBone = Array.isArray(raw?.bones)
                ? (raw.bones as unknown[]).find((b) => isObj(b) && b.name === bone.data.name)
                : undefined;
              fail(
                'A10_NO_NAN_AFTER_STEPPING',
                `${anim.name}: bone "${bone.data.name}" poses inheritance mode ${String(pose.inherit)} — its setup ` +
                  `spells inherit ${JSON.stringify(isObj(rawBone) ? rawBone.inherit : undefined)}, which the ` +
                  `runtime's mode lookup does not resolve (${BONE_INHERIT_KNOWN}), so its world rotation, scale and shear ` +
                  'are never computed — they stay 0 and everything the bone carries collapses to a point',
              );
              return;
            }
          }
          for (const slot of skeleton.slots) {
            const c = slot.appliedPose.color;
            if (![c.r, c.g, c.b, c.a].every(Number.isFinite)) {
              fail('A10_NO_NAN_AFTER_STEPPING', `${anim.name}: slot "${slot.data.name}" colour is non-finite`);
              return;
            }
            // The other colour a slot poses, and it was outside this loop until
            // issue #690 for the reason every gap here has: nothing emitted one.
            // `null` is the ordinary case — a slot with no `dark` allocates no
            // dark colour at all — and is not a reading to make, so it is
            // skipped rather than treated as zero.
            const d = slot.appliedPose.darkColor;
            if (d !== null && ![d.r, d.g, d.b].every(Number.isFinite)) {
              fail('A10_NO_NAN_AFTER_STEPPING', `${anim.name}: slot "${slot.data.name}" dark colour is non-finite`);
              return;
            }
          }
        }
      }
    });

    // --- A43: the two-colour tint, read back off the runtime ----------------
    //
    // ⭐ **Why this is its own rule and not a clause on `A10`.** A10 steps every
    // animation already and now reads `darkColor` for NaN, which is squarely its
    // own name; what is below is an EQUALITY — the colour in the file against the
    // colour the runtime holds — and a failure of it printed under
    // `A10_NO_NAN_AFTER_STEPPING` would be a verdict whose name contradicts its
    // own detail. The rule this repository applies to a suite's summary figure
    // applies to an assertion's name: it may not say less than what it decides.
    //
    // 🚨 **And the subject is real silence, measured rather than supposed.** Three
    // shapes load with no complaint:
    //
    //   1. A `dark` the parser drops. `SkeletonJson` reads `getValue(slotMap,
    //      "dark", null)` and then `if (dark)`, so `""` is discarded without a
    //      word and the slot renders as though the field had never been written.
    //   2. A `dark` that is not six hex digits. `Color.setFromString` runs
    //      `parseInt` over fixed offsets and stores whatever comes back, so
    //      `"4020"` loads `b = NaN` — a colour that is neither the author's nor
    //      an error.
    //   3. An `rgba2` (or, since issue #730, `rgb2`) timeline on a slot with no
    //      `dark` at all. `Slot`'s
    //      constructor allocates `SlotPose.darkColor` only `if
    //      (data.setupPose.darkColor != null)`, and `RGBA2Timeline.apply1` then
    //      writes `dark.r` unconditionally — so the file parses, and the first
    //      `state.apply` throws `TypeError: null is not an object` in the
    //      consumer's process. `compile.ts` refuses that pairing outright; this
    //      is the same fact held against a skeleton the compiler never saw, and
    //      it is a named failure here rather than A10's `threw:` line, which
    //      names neither the slot nor the timeline.
    //
    // ⚠️ The hex is parsed HERE rather than through `Color.fromString`, and that
    // is the point of the clause: a check that read the required value out of the
    // same parser it is checking would agree with it whatever it did.
    check('A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN', () => {
      /** `rrggbb`, or `rrggbbaa` whose last pair the format drops. Null for anything else. */
      const readDarkHex = (hex: string): [number, number, number] | null => {
        const body = hex.startsWith('#') ? hex.slice(1) : hex;
        if (!/^[\da-fA-F]{6}([\da-fA-F]{2})?$/.test(body)) return null;
        return [0, 2, 4].map((i) => Number.parseInt(body.slice(i, i + 2), 16) / 255) as [number, number, number];
      };
      /** `rrggbbaa`, or `rrggbb` the runtime opens at alpha 1. Null for anything else. */
      const readLightHex = (hex: string): [number, number, number, number] | null => {
        const body = hex.startsWith('#') ? hex.slice(1) : hex;
        if (!/^[\da-fA-F]{6}([\da-fA-F]{2})?$/.test(body)) return null;
        const rgb = [0, 2, 4].map((i) => Number.parseInt(body.slice(i, i + 2), 16) / 255);
        return [rgb[0], rgb[1], rgb[2], body.length === 8 ? Number.parseInt(body.slice(6, 8), 16) / 255 : 1];
      };
      /**
       * Half a quantisation step. A channel is one byte in the file and a
       * `Float32Array` entry in a timeline, so the widest honest gap between the
       * number written and the number posed is well under `1/510`.
       */
      const STEP = 1 / 510;
      const off = (found: number, want: number): boolean => !Number.isFinite(found) || Math.abs(found - want) > STEP;
      const show = (c: readonly number[]): string => c.map((n) => (Number.isFinite(n) ? n.toFixed(4) : 'NaN')).join(', ');

      // -- the subjects, read off the FILE ---------------------------------
      const declared = new Map<string, string>();
      for (const slot of Array.isArray(raw?.slots) ? (raw.slots as unknown[]) : []) {
        if (isObj(slot) && typeof slot.dark === 'string') declared.set(String(slot.name), slot.dark);
      }
      // `rgb2` joined in issue #730, and it is this rule's subject rather than a
      // new one's because it is the same tint with the light alpha left out:
      // `RGB2Timeline` writes the light rgb and the dark colour, and on a slot
      // with no dark colour it throws in `apply1` exactly as `RGBA2Timeline`
      // does (measured on a forged file: `TypeError: null is not an object
      // (evaluating 'dark.r = …')`). The one thing it does differently is the
      // alpha it does NOT pose, which is `A45`'s question, not this one's.
      const keyed: Array<{ anim: string; slot: string; timeline: 'rgba2' | 'rgb2'; keys: unknown[] }> = [];
      const rawAnimations = isObj(raw) && isObj(raw.animations) ? raw.animations : {};
      for (const [animName, anim] of Object.entries(rawAnimations)) {
        if (!isObj(anim) || !isObj(anim.slots)) continue;
        for (const [slotName, timelines] of Object.entries(anim.slots)) {
          if (!isObj(timelines)) continue;
          for (const timeline of ['rgba2', 'rgb2'] as const) {
            const keys = timelines[timeline];
            if (Array.isArray(keys)) keyed.push({ anim: animName, slot: slotName, timeline, keys });
          }
        }
      }
      if (declared.size === 0 && keyed.length === 0) {
        return skip('A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN', SKIP_NO_TWO_COLOR_TINT);
      }
      stats.darkSlots = declared.size;
      stats.rgba2Timelines = keyed.filter((t) => t.timeline === 'rgba2').length;
      stats.rgb2Timelines = keyed.filter((t) => t.timeline === 'rgb2').length;

      // -- clause 1: the setup pose ----------------------------------------
      for (const [name, hex] of declared) {
        const want = readDarkHex(hex);
        const loaded = data.findSlot(name)?.setupPose.darkColor ?? null;
        // ⚠️ "The parser kept nothing" is asked FIRST, and the order is the
        // finding rather than a style: an empty string is both unreadable as a
        // colour and dropped outright, and only the second sentence is about
        // what the loaded skeleton holds. Asked the other way round, `""` was
        // reported as "not six hex digits" — true, and about the file, on the
        // one input where the file is not what went wrong.
        if (loaded === null) {
          fail(
            'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
            `slot "${name}" states dark ${JSON.stringify(hex)} and the loaded skeleton holds no dark colour for ` +
              'it at all — the slot reader takes `dark` through a truthiness test, so a falsy value is dropped ' +
              'in silence and the slot is tinted with one colour',
          );
          continue;
        }
        if (want === null) {
          fail(
            'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
            `slot "${name}" states dark ${JSON.stringify(hex)}, which is not six hex digits — the parser reads ` +
              'fixed two-character slices and stores whatever `parseInt` returns, so the loaded colour is ' +
              `(${show([loaded.r, loaded.g, loaded.b])}) rather than a failure`,
          );
          continue;
        }
        const found: [number, number, number] = [loaded.r, loaded.g, loaded.b];
        if (found.some((n, i) => off(n, want[i]))) {
          fail(
            'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
            `slot "${name}" states dark ${JSON.stringify(hex)} and the runtime loaded (${show(found)}), wanted ` +
              `(${show(want)})`,
          );
        }
      }

      // -- clauses 2 and 3: every rgba2 and rgb2 timeline --------------------
      //
      // ⚠️ Clause 2 poisons its whole ANIMATION, not only its own timeline: the
      // throw happens inside `state.apply`, which applies every timeline of the
      // animation at once, so posing a second — correct — `rgba2` timeline in the
      // same animation would take this assertion down with a `threw:` line
      // instead of the two named failures it has already worked out.
      const cannotPose = new Set(keyed.filter((t) => !declared.has(t.slot)).map((t) => t.anim));
      for (const { anim: animName, slot: slotName, timeline, keys } of keyed) {
        const where = `animation "${animName}" slot "${slotName}" ${timeline}`;
        if (!declared.has(slotName)) {
          fail(
            'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
            `${where}: slot "${slotName}" declares no setup "dark", so the runtime allocates no dark colour for ` +
              `it and applying this animation throws instead of tinting — give the slot a \`dark\`, or key ` +
              `"${timeline === 'rgba2' ? 'rgba' : 'rgb'}"`,
          );
          continue;
        }
        if (cannotPose.has(animName)) continue;
        const animation = data.findAnimation(animName);
        if (!animation) {
          fail('A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN', `${where}: the loaded skeleton has no animation "${animName}"`);
          continue;
        }
        for (const rawKey of keys) {
          if (!isObj(rawKey)) continue;
          const time = typeof rawKey.time === 'number' ? rawKey.time : 0;
          const wantLight = typeof rawKey.light === 'string' ? readLightHex(rawKey.light) : null;
          const wantDark = typeof rawKey.dark === 'string' ? readDarkHex(rawKey.dark) : null;
          // ⚠️ Posed BEFORE the key's own spelling is judged, so that a key whose
          // hex cannot be read is still reported with the colour the runtime
          // actually holds. `Color.setFromString` slices fixed offsets and stores
          // whatever `parseInt` gives back, so the value found is the product
          // here — "not six hex digits" alone would be the value REQUIRED twice
          // over and the found value nowhere.
          const skeleton = new Skeleton(data);
          const state = new AnimationState(new AnimationStateData(data));
          state.setAnimation(0, animName, false);
          skeleton.setupPose();
          skeleton.update(0);
          skeleton.updateWorldTransform(Physics.reset);
          // At the key as the runtime stores it — see `atStoredKey` (#771).
          state.update(atStoredKey(time));
          state.apply(skeleton);
          skeleton.update(atStoredKey(time));
          skeleton.updateWorldTransform(Physics.update);
          const posed = skeleton.slots.find((s) => s.data.name === slotName)?.appliedPose;
          const light = posed?.color;
          const dark = posed?.darkColor ?? null;
          if (!light || dark === null) {
            fail(
              'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
              `${where} (t=${time}): the posed skeleton has no ${light ? 'dark colour' : 'slot'} to read`,
            );
            continue;
          }
          const foundLight: [number, number, number, number] = [light.r, light.g, light.b, light.a];
          const foundDark: [number, number, number] = [dark.r, dark.g, dark.b];
          if (wantLight === null || wantDark === null) {
            fail(
              'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
              `${where} (t=${time}): the key states light ${JSON.stringify(rawKey.light)} and dark ` +
                `${JSON.stringify(rawKey.dark)} — an ${timeline} key needs both, each six or eight hex digits — and the ` +
                `runtime poses light (${show(foundLight)}), dark (${show(foundDark)})`,
            );
            continue;
          }
          // An `rgb2` key's light colour is three channels, and the posed alpha
          // is not its to state — `RGB2Timeline` leaves it where it was — so the
          // comparison is over the channels the timeline writes. For `rgba2`
          // that is all four, and the line reads as it always did.
          const lightChannels = timeline === 'rgba2' ? 4 : 3;
          if (foundLight.slice(0, lightChannels).some((n, i) => off(n, wantLight[i]))) {
            fail(
              'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
              `${where} (t=${time}): light posed (${show(foundLight.slice(0, lightChannels))}), the key states ` +
                `${JSON.stringify(rawKey.light)} = (${show(wantLight.slice(0, lightChannels))})`,
            );
          }
          if (foundDark.some((n, i) => off(n, wantDark[i]))) {
            fail(
              'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
              `${where} (t=${time}): dark posed (${show(foundDark)}), the key states ${JSON.stringify(rawKey.dark)} ` +
                `= (${show(wantDark)})`,
            );
          }
        }
      }
    });

    // --- A45: the separable colour timelines own their channels ------------
    //
    // ⭐ **Why this is its own rule and not a clause on `A43`.** `rgb` and
    // `alpha` pose no dark colour, so under A43's name a failure would be a
    // verdict saying "two-colour tint" about a file that states one colour —
    // the name would say something other than what it decides (the rule #712
    // applied to A43 itself, against a clause on A10). And the SKIP is the
    // sharper half: a rig with a `dark` and no separable timeline has A43's
    // subject present, so a clause there could only PASS on it, which is a pass
    // for an absent subject.
    //
    // 🚨 **What it decides is what makes `rgb` + `alpha` not `rgba`**, and both
    // clauses are about the file against the runtime:
    //
    //   1. **One channel, one timeline.** Each colour timeline poses its
    //      channels at EVERY time — before its first key it writes the setup
    //      value — so when two of one slot share a channel, the one applied
    //      later (the one the file states later) overwrites the other
    //      everywhere and the first one's keys on it are read by nothing
    //      (`SLOT_COLOR_CHANNELS`). It is the shape a converter that writes a
    //      separable `rgb` as `rgba` leaves beside the `alpha` it kept, and it
    //      loads without a word.
    //   2. **Posed as written.** Stepped to each key's own time, the channels
    //      the timeline writes are the key's: a colour that is not six hex
    //      digits loads as NaN, and a key whose time another key repeats is
    //      read by nothing, and both parse in silence.
    //
    // ⚠️ An `rgb` timeline alone that a converter wrote as `rgba` with the
    // setup alpha is NOT this rule's to see, and nothing that reads only the
    // file can see it: the result is a correct `rgba`, which is also what an
    // author keying the light colour and holding its alpha would write. What
    // differs is what happens UNDER another track that moves the alpha, which
    // is the consumer's composing rather than the object (CLAUDE.md). That
    // file SKIPs here — it keys no `rgb` or `alpha` — and says so.
    //
    // ⚠️ The required values are parsed HERE, as A43's are, and the channel
    // table is `timelines.ts`'s rather than the loaded timelines' property ids:
    // a check that asked the parser what a timeline writes would agree with it
    // whatever it did. A selftest control holds that table to the runtime's ids.
    check('A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN', () => {
      const NAME = 'A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN';
      /** `rrggbb`, or `rrggbbaa` whose alpha an `rgb` key cannot pose. Null for anything else. */
      const readRgbHex = (hex: unknown): [number, number, number] | null => {
        if (typeof hex !== 'string') return null;
        const body = hex.startsWith('#') ? hex.slice(1) : hex;
        if (!/^[\da-fA-F]{6}([\da-fA-F]{2})?$/.test(body)) return null;
        return [0, 2, 4].map((i) => Number.parseInt(body.slice(i, i + 2), 16) / 255) as [number, number, number];
      };
      /** Half a byte step for a hex channel; a stored `Float32` for an alpha `value`. */
      const HEX_STEP = 1 / 510;
      const FLOAT_STEP = 1e-6;
      const off = (found: number, want: number, step: number): boolean => !Number.isFinite(found) || Math.abs(found - want) > step;
      const show = (c: readonly number[]): string => c.map((n) => (Number.isFinite(n) ? n.toFixed(4) : 'NaN')).join(', ');

      // -- the subjects, read off the FILE ---------------------------------
      const subjects: Array<{ anim: string; slot: string; timelines: Record<string, unknown> }> = [];
      const rawAnimations = isObj(raw) && isObj(raw.animations) ? raw.animations : {};
      for (const [animName, anim] of Object.entries(rawAnimations)) {
        if (!isObj(anim) || !isObj(anim.slots)) continue;
        for (const [slotName, timelines] of Object.entries(anim.slots)) {
          if (!isObj(timelines)) continue;
          if (Array.isArray(timelines.rgb) || Array.isArray(timelines.alpha)) {
            subjects.push({ anim: animName, slot: slotName, timelines });
          }
        }
      }
      if (subjects.length === 0) return skip(NAME, SKIP_NO_SEPARABLE_COLOR);
      stats.separableColorTimelines = subjects.reduce(
        (n, s) => n + (Array.isArray(s.timelines.rgb) ? 1 : 0) + (Array.isArray(s.timelines.alpha) ? 1 : 0),
        0,
      );

      for (const { anim: animName, slot: slotName, timelines } of subjects) {
        const at = `animation "${animName}" slot "${slotName}"`;
        // In FILE order, which is the order `readAnimation` pushes them and so
        // the order they apply in.
        const colour = Object.keys(timelines).filter((name) => name in SLOT_COLOR_CHANNELS && Array.isArray(timelines[name]));

        // -- clause 1: one channel, one timeline ---------------------------
        let shared = false;
        for (const channel of ['rgb', 'alpha', 'dark'] as const) {
          const writers = colour.filter((name) => SLOT_COLOR_CHANNELS[name].includes(channel));
          if (writers.length < 2 || !writers.some((name) => name === 'rgb' || name === 'alpha')) continue;
          shared = true;
          const last = writers[writers.length - 1];
          fail(
            NAME,
            `${at}: ${writers.map((name) => `"${name}"`).join(' and ')} ${writers.length === 2 ? 'both' : 'all'} key the ${channel === 'rgb' ? 'light rgb' : channel === 'alpha' ? 'alpha' : 'dark colour'} ` +
              `— each poses it at every time, its setup value before its first key included, so "${last}", which the ` +
              `file states last, overwrites ${writers.length === 2 ? `"${writers[0]}"` : 'the others'} everywhere and ` +
              'those keys are read by nothing. Key each channel once: "rgb" and "alpha" on their own key times, or one "rgba"',
          );
        }
        if (shared) continue;

        // -- clause 2: posed as written ------------------------------------
        //
        // ⚠️ Two things this does NOT do, both measured rather than skipped:
        // it does not read the loaded timeline's CLASS back, and it does not
        // hold a channel the timeline leaves alone to the setup pose. Against
        // the linked parser neither can fail — every `rgb` / `alpha` array that
        // loads at all loads as an `RGBTimeline` / `AlphaTimeline`, and the
        // three other outcomes (an empty array, a slot the skeleton lacks, a
        // name outside the switch) throw at `A00` — so either would be a clause
        // nobody can see fire. The selftest reads both off spine-core directly
        // (`S82`–`S84`), where they are measurements of the runtime rather than
        // checks on a file.
        if (!data.findAnimation(animName)) {
          fail(NAME, `${at}: the loaded skeleton has no animation "${animName}"`);
          continue;
        }
        for (const name of ['rgb', 'alpha'] as const) {
          const keys = timelines[name];
          if (!Array.isArray(keys)) continue;
          const where = `${at} ${name}`;
          for (const rawKey of keys) {
            if (!isObj(rawKey)) continue;
            const time = typeof rawKey.time === 'number' ? rawKey.time : 0;
            const skeleton = new Skeleton(data);
            const state = new AnimationState(new AnimationStateData(data));
            state.setAnimation(0, animName, false);
            skeleton.setupPose();
            skeleton.update(0);
            skeleton.updateWorldTransform(Physics.reset);
            // At the key as the runtime stores it, not one float step before
            // it — see `atStoredKey` (issue #771).
            state.update(atStoredKey(time));
            state.apply(skeleton);
            const posed = skeleton.slots.find((s) => s.data.name === slotName)?.appliedPose;
            if (!posed) {
              fail(NAME, `${where} (t=${time}): the posed skeleton has no slot "${slotName}" to read`);
              continue;
            }
            const light = [posed.color.r, posed.color.g, posed.color.b, posed.color.a];
            if (name === 'rgb') {
              const stated = readRgbHex(rawKey.color);
              if (stated === null) {
                fail(
                  NAME,
                  `${where} (t=${time}): the key states color ${JSON.stringify(rawKey.color)} — an rgb key is six hex ` +
                    `digits — and the runtime poses (${show(light.slice(0, 3))})`,
                );
              } else if (light.slice(0, 3).some((n, i) => off(n, stated[i], HEX_STEP))) {
                fail(
                  NAME,
                  `${where} (t=${time}): rgb posed (${show(light.slice(0, 3))}), the key states ` +
                    `${JSON.stringify(rawKey.color)} = (${show(stated)})`,
                );
              }
            } else {
              // `readTimeline1(…, 0, 1)`: an absent `value` IS 0, and an editor
              // omits it there, so absence is read the parser's way rather than
              // as a malformed key.
              const stated = rawKey.value === undefined ? 0 : rawKey.value;
              if (typeof stated !== 'number' || off(light[3], stated, FLOAT_STEP)) {
                fail(
                  NAME,
                  `${where} (t=${time}): alpha posed ${show([light[3]])}, the key states value ${JSON.stringify(rawKey.value)}` +
                    (typeof stated !== 'number'
                      ? ' — an alpha key\'s value is a number'
                      : stated < 0 || stated > 1
                        ? ' — the runtime clamps a posed alpha to 0..1'
                        : ''),
                );
              }
            }
          }
        }
      }
    });

    // --- A44: a linked mesh states no geometry of its own ------------------
    //
    // 🚨 The one shape the parser reads in SILENCE. `readAttachment` returns from
    // the `source` branch at `SkeletonJson.js:586`, before `map.uvs` is touched
    // at all, so `uvs`, `triangles`, `vertices`, `hull` and `edges` written on a
    // link are read by nothing — and `setSourceMesh` then fills the attachment
    // with the SOURCE's arrays. The file says one mesh and every runtime draws
    // another, which is why this is `validity` and not one renderer's policy.
    //
    // ⭐ **It is a separate assertion rather than a clause on A04, and the reason
    // is measurable both ways.** A04 reads the LOADED attachment —
    // `mesh.triangles`, `mesh.worldVerticesLength`, `mesh.vertices` — which on a
    // link are the source's after `setSourceMesh`: measured on a forged link
    // declaring 5 uvs and 3 triangles beside a 4-vertex source, A04 PASSED
    // having read 8 and 2, the source's own. The keys this rule is about are not
    // in the data A04 holds, so the clause would have had to reach for the raw
    // file, and a verdict line reading A04's name would then be naming a
    // measurement of the loaded geometry while deciding about file keys nothing
    // read. The SKIP is the sharper half: A04's subject is mesh attachments, so
    // on a rig with meshes and no link its subject is PRESENT and it passes —
    // there is no verdict left for "this rig has no link to measure", and a
    // clause that cannot report SKIP reports a pass for an absent subject, which
    // this repository already has a judgment about.
    //
    // ⚠️ The subject is the FILE's links and not the loaded ones. A link whose
    // region is missing loads as `null` and is in no skin (`A08` names it), so
    // walking the loaded attachments would let the whole rule vanish on exactly
    // the file that is already wrong.
    check('A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN', () => {
      if (rawLinks.size === 0) return skip('A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN', SKIP_NO_LINKED_MESH);
      for (const [join, link] of rawLinks) {
        if (link.geometry.length === 0) continue;
        const [skinName, slotName, placeholder] = join.split('\u0000');
        const at = `skin ${JSON.stringify(skinName)} slot ${JSON.stringify(slotName)} placeholder ${JSON.stringify(placeholder)}`;
        const keys = link.geometry.map((key) => JSON.stringify(key)).join(', ');
        // Where the parser looks for `source`, with the two defaults spelled out:
        // an omitted `skin` is the DEFAULT skin rather than this attachment's own
        // (`:429`), and an omitted `slot` IS this attachment's own (`:573-579`).
        const where =
          `skin ${JSON.stringify(link.skin ?? 'default')}${link.skin === undefined ? ' (the default skin, because no "skin" was stated — never the skin this attachment is written in)' : ''} ` +
          `slot ${JSON.stringify(link.slot ?? slotName)}${link.slot === undefined ? ' (this attachment\'s own, because no "slot" was stated)' : ''}`;
        // What the author's own keys describe, printed only when both are
        // readable — the shape the file states, beside the shape it draws.
        const states =
          link.statedVertices === undefined || link.statedTriangles === undefined
            ? ''
            : ` (${link.statedVertices} vertices and ${link.statedTriangles} triangles)`;
        const drawn = loadedLinks.get(join);
        const loaded =
          drawn === undefined
            ? 'what it loaded is not shown here because the round trip produced no attachment for it (A00 owns that)'
            : `it loaded ${drawn.worldVerticesLength / 2} vertices and ${drawn.triangles.length / 3} triangles`;
        fail(
          'A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN',
          `${at} links to ${JSON.stringify(link.source)} and states ${keys}${states}, and a linked mesh has no geometry of ` +
            'its own. The parser returns from the `source` branch before `readVertices` ' +
            `(\`SkeletonJson.ts:582-586\`), so ${link.geometry.length === 1 ? 'that key is' : 'those keys are'} read by ` +
            `nothing at all: what this attachment draws is the geometry of ${JSON.stringify(link.source)} in ${where}, and ` +
            `${loaded}. Remove ${link.geometry.length === 1 ? 'it' : 'them'}, or remove "source" and author this as a ` +
            'mesh of its own.',
        );
      }
    });

    // --- A46: a numbered series shows the frame the file states ------------
    //
    // 🚨 Every way this goes wrong loads without a word (issue #729, measured on
    // spine-core 4.3.13): a `sequence` block with no `count` loads a series of
    // no region; a `setup` past the end is clamped to the last frame; a key's
    // `mode` outside the seven loads as `hold`; an `index` past the end is
    // clamped and a fraction truncated; an advancing mode at an effective delay
    // of 0 never advances; and a `sequence` timeline on an attachment with no
    // block steps a one-region series and shows that region under every mode.
    //
    // ⭐ Two halves, and the second is the one only posing can see. The first
    // reads each of those off the FILE and names the value. The second POSES
    // every key at sampled times — mid-frame, so a float32 key time cannot land
    // a sample on a frame boundary — and compares the region the slot shows
    // against the one the file's own statement gives: the frame arithmetic of
    // `SequenceTimeline.applyToSlot` transcribed here, and the frame names of
    // `Sequence.getPath` transcribed in `attachmentRegionLookups`. Neither is
    // read off the loaded timeline, so the check is not the runtime agreeing
    // with itself.
    //
    // ⚠️ A sample where the slot shows some other attachment is not compared —
    // `applyToSlot` returns there, and a series that is hidden is not a series
    // showing the wrong frame. A timeline with no comparable sample at all is
    // counted in `stats.sequenceSamplesUnshown` rather than failed.
    check('A46_SEQUENCE_ATTACHMENTS_SHOW_THE_FRAME_THE_FILE_STATES', () => {
      const NAME = 'A46_SEQUENCE_ATTACHMENTS_SHOW_THE_FRAME_THE_FILE_STATES';
      type Series = { where: string; lookups: string[] | null; count: number; setup: number };
      /** The loaded attachment -> what the FILE says its series is. */
      const series = new Map<object, Series>();
      /** `skin\0slot\0placeholder` -> the loaded attachment, for the timelines to find. */
      const byJoin = new Map<string, object>();
      /** Attachments whose block was already refused above — their timelines say nothing more. */
      const refused = new Set<object>();
      const whole = (v: unknown, fallback: number): number | null =>
        v === undefined ? fallback : typeof v === 'number' && Number.isInteger(v) ? v : null;
      let blocks = 0;
      for (const skin of isObj(raw) && Array.isArray(raw.skins) ? (raw.skins as unknown[]) : []) {
        if (!isObj(skin) || !isObj(skin.attachments)) continue;
        const skinName = typeof skin.name === 'string' ? skin.name : '(unnamed)';
        const loadedSkin = data.findSkin(skinName);
        for (const [slotName, entries] of Object.entries(skin.attachments)) {
          if (!isObj(entries)) continue;
          const slotIndex = data.findSlot(slotName)?.index;
          for (const [placeholder, entry] of Object.entries(entries)) {
            if (!isObj(entry)) continue;
            const type = entry.type === undefined ? 'region' : entry.type;
            if (type !== 'region' && type !== 'mesh' && type !== 'linkedmesh') continue;
            const loaded = slotIndex === undefined ? null : loadedSkin?.getAttachment(slotIndex, placeholder) ?? null;
            const where = `skin ${JSON.stringify(skinName)} slot ${JSON.stringify(slotName)} attachment ${JSON.stringify(placeholder)}`;
            if (loaded !== null) byJoin.set(`${skinName}\u0000${slotName}\u0000${placeholder}`, loaded);
            if (entry.sequence === undefined || entry.sequence === null) continue;
            blocks++;
            const seq = entry.sequence;
            const name = typeof entry.name === 'string' ? entry.name : placeholder;
            const path = typeof entry.path === 'string' ? entry.path : name;
            const count = isObj(seq) ? whole(seq.count, 0) : null;
            const setup = isObj(seq) ? whole(seq.setup, 0) : null;
            if ((count === null || setup === null || count < 1) && loaded !== null) refused.add(loaded);
            if (count === null || setup === null || count < 1) {
              fail(
                NAME,
                `${where}: the sequence states ${JSON.stringify(seq)}` +
                  (isObj(seq) && seq.count === undefined
                    ? ' and no "count" — `readSequence` reads 0 (`SkeletonJson.js:644`), so the attachment loads holding no region and draws nothing'
                    : ' — "count" is a whole number of at least 1 and "setup" a whole number, or the series the parser builds is not the one written'),
              );
              continue;
            }
            if ((setup < 0 || setup >= count) && loaded !== null) refused.add(loaded);
            if (setup < 0 || setup >= count) {
              fail(
                NAME,
                `${where}: the sequence's setup frame is ${setup} of a ${count}-frame series (frames 0 to ${count - 1}); ` +
                  '`Sequence.resolveIndex` clamps it, so the setup pose shows ' +
                  `${setup < 0 ? 'no frame at all' : `frame ${count - 1}, which the file does not name`}`,
              );
              continue;
            }
            if (loaded === null) continue; // A00/A08 own an attachment that did not load
            series.set(loaded, { where, lookups: attachmentRegionLookups(seq, path), count, setup });
          }
        }
      }

      /** The frame `SequenceTimeline.applyToSlot` shows — transcribed, not called. */
      const frameOf = (mode: string, index: number, elapsed: number, delay: number, count: number): number => {
        if (mode === 'hold') return index;
        let i = index + Math.trunc(elapsed / delay + 0.00001);
        const n = count * 2 - 2;
        switch (mode) {
          case 'once':
            return Math.min(count - 1, i);
          case 'loop':
            return i % count;
          case 'pingpong':
            i = n === 0 ? 0 : i % n;
            return i >= count ? n - i : i;
          case 'onceReverse':
            return Math.max(count - 1 - i, 0);
          case 'loopReverse':
            return count - 1 - (i % count);
          default: // pingpongReverse
            i = n === 0 ? 0 : (i + count - 1) % n;
            return i >= count ? n - i : i;
        }
      };

      let timelines = 0;
      let compared = 0;
      let unshown = 0;
      const rawAnimations = isObj(raw) && isObj(raw.animations) ? raw.animations : {};
      for (const [animName, anim] of Object.entries(rawAnimations)) {
        if (!isObj(anim) || !isObj(anim.attachments)) continue;
        for (const [skinName, perSkin] of Object.entries(anim.attachments)) {
          if (!isObj(perSkin)) continue;
          for (const [slotName, perSlot] of Object.entries(perSkin)) {
            if (!isObj(perSlot)) continue;
            for (const [placeholder, perAttachment] of Object.entries(perSlot)) {
              if (!isObj(perAttachment) || !Array.isArray(perAttachment.sequence)) continue;
              const keys = perAttachment.sequence as unknown[];
              if (keys.length === 0) continue; // `readAnimation` skips it; A34 owns an empty timeline
              timelines++;
              const where = `animation ${JSON.stringify(animName)} ${skinName}/${slotName}/${placeholder} sequence`;
              const keyed = byJoin.get(`${skinName}\u0000${slotName}\u0000${placeholder}`);
              if (keyed === undefined) continue; // the parser throws on a missing target: A00's
              if (refused.has(keyed)) continue; // its block is already named above
              const own = series.get(keyed);
              if (own === undefined) {
                fail(
                  NAME,
                  `${where}: the timeline steps an attachment that carries no "sequence" block. The parser gives it a ` +
                    'series of ONE region (`readSequence(null)` is `new Sequence(1, false)`), so every mode shows that ' +
                    'region at every time — measured: a "loop" key on a plain region showed it throughout',
                );
                continue;
              }
              // -- the keys, as the file states them --------------------------
              type Key = { time: number; mode: string; index: number; delay: number };
              const read: Key[] = [];
              let carried = 0;
              let malformed = false;
              keys.forEach((rawKey, k) => {
                const key = isObj(rawKey) ? rawKey : {};
                const at = `${where} key ${k}`;
                const time = typeof key.time === 'number' ? key.time : 0;
                const mode = key.mode === undefined ? 'hold' : key.mode;
                const index = key.index === undefined ? 0 : key.index;
                if (key.delay !== undefined) carried = typeof key.delay === 'number' ? key.delay : Number.NaN;
                if (typeof mode !== 'string' || !(SEQUENCE_MODES as readonly string[]).includes(mode)) {
                  malformed = true;
                  fail(
                    NAME,
                    `${at} (t=${time}): mode ${JSON.stringify(key.mode)} is not one of the ${SEQUENCE_MODES.length} the ` +
                      `format has (${SEQUENCE_MODES.join(', ')}); the parser reads \`SequenceMode[mode]\`, which is ` +
                      'undefined, stores mode bits 0, and the key plays as "hold"',
                  );
                  return;
                }
                if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= own.count) {
                  malformed = true;
                  fail(
                    NAME,
                    `${at} (t=${time}): index ${JSON.stringify(key.index)} is not a frame of the ${own.count}-frame series ` +
                      `(0 to ${own.count - 1}); the runtime stores \`index << 4\`, truncating a fraction, and ` +
                      '`Sequence.resolveIndex` clamps a frame past the end to the last one',
                  );
                  return;
                }
                if (mode !== 'hold' && !(carried > 0)) {
                  malformed = true;
                  fail(
                    NAME,
                    `${at} (t=${time}): "${mode}" at a delay of ${String(carried)}${key.delay === undefined ? ' (carried from the key before, 0 on the first)' : ''} — ` +
                      'the frame advances by `(time - keyTime) / delay`, and at 0 that is Infinity, `Infinity | 0` is 0, ' +
                      'and the key shows its first frame throughout: "hold" spelt as another mode',
                  );
                  return;
                }
                read.push({ time, mode, index, delay: carried });
              });
              if (malformed) continue;

              // -- the pose, sampled ------------------------------------------
              const animation = data.findAnimation(animName);
              const slotIndex = data.findSlot(slotName)?.index;
              if (animation === null || slotIndex === undefined) continue; // A00's
              /** `key` is the index into `read`, or -1 before the first key (the setup frame). */
              const samples: Array<{ time: number; key: number; steps: number }> = [];
              const end = animation.duration;
              if (read[0].time > 0) samples.push({ time: read[0].time / 2, key: -1, steps: 0 });
              read.forEach((key, k) => {
                const until = k + 1 < read.length ? read[k + 1].time : end;
                if (key.mode === 'hold') {
                  samples.push({ time: key.time, key: k, steps: 0 });
                  return;
                }
                // Mid-frame, and enough steps to wrap every mode at least once.
                for (let step = 0; step < own.count * 2 + 2; step++) {
                  const time = key.time + (step + 0.5) * key.delay;
                  if (time >= until || time > end) break;
                  samples.push({ time, key: k, steps: step + 0.5 });
                }
              });
              let shownHere = 0;
              for (const sample of samples) {
                const skeleton = new Skeleton(data);
                const state = new AnimationState(new AnimationStateData(data));
                state.setAnimation(0, animName, false);
                skeleton.setupPose();
                skeleton.update(0);
                skeleton.updateWorldTransform(Physics.reset);
                // A `hold` sample is AT its key, so it is posed at the key as
                // the runtime stores it (`atStoredKey`); a mid-frame sample is
                // half a delay from any key and is posed where it is.
                state.update(sample.key >= 0 && sample.steps === 0 ? atStoredKey(sample.time) : sample.time);
                state.apply(skeleton);
                const pose = skeleton.slots[slotIndex].appliedPose;
                const shown = pose.attachment;
                // The slot must show the keyed attachment or one playing its
                // timelines — the only case `applyToSlot` writes.
                if (shown === null || (shown !== keyed && shown.timelineAttachment !== keyed)) continue;
                const drawn = series.get(shown);
                if (drawn === undefined || drawn.lookups === null) continue;
                shownHere++;
                compared++;
                // The frame count the runtime folds by is the SHOWN attachment's:
                // a link with a series of its own steps it by its source's keys.
                const key = sample.key < 0 ? null : read[sample.key];
                const want = key === null ? drawn.setup : frameOf(key.mode, key.index, sample.time - key.time, key.delay, drawn.count);
                const sequence = (shown as RegionAttachment | MeshAttachment).sequence;
                const region = (sequence.regions[sequence.resolveIndex(pose)] as TextureAtlasRegion | null | undefined)?.name ?? null;
                if (region !== drawn.lookups[want]) {
                  fail(
                    NAME,
                    `${where} (t=${Number(sample.time.toFixed(4))}): the slot shows region ${JSON.stringify(region)}, and ` +
                      `the file states frame ${want} of ${drawn.count} — ${JSON.stringify(drawn.lookups[want])} — ` +
                      (key === null
                        ? 'the setup frame, before the first key'
                        : `key ${sample.key} plays "${key.mode}" from frame ${key.index} every ${key.delay}s, ` +
                          `${sample.steps} delay(s) in`),
                  );
                  break;
                }
              }
              if (shownHere === 0) unshown++;
            }
          }
        }
      }
      if (blocks === 0 && timelines === 0) return skip(NAME, SKIP_NO_SEQUENCE);
      stats.sequenceBlocks = blocks;
      stats.sequenceTimelines = timelines;
      stats.sequenceSamples = compared;
      if (unshown > 0) stats.sequenceSamplesUnshown = unshown;
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
      // 🔒 **A page that is not a PNG is a named failure, not a throw** (issue
      // #732). The reader's throw used to reach this rule's catch and print as
      // `threw: not a PNG (bad signature)`: the verdict right, the sentence a
      // stack message that named neither what the file was nor what rigc reads.
      // `pngProblem` ([`src/png.ts`](png.ts)) is the one sentence every reader
      // of a page states; this rule prefixes the size the atlas declares, the
      // value the file would have had to carry.
      //
      // ⚠️ No size is read off a file rigc cannot decode, deliberately. A WebP
      // header carries its dimensions in a fixed field, and reading them would
      // print a number no oracle in this tree has checked (rigc links no WebP
      // reader to compare a parse against), about a page that is refused here
      // either way — and measured, the variant that PASSED a WebP page whose
      // size agreed built green under the default profile and wrote a
      // directory that `render` then refused.
      const header = readPngHeader(abs);
      if (header.problem !== null) {
        fail(
          'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
          `page "${page.name}" declares ${page.width}x${page.height} and its file cannot be read as PNG, so the ` +
            `size was not measured: ${header.problem}`,
        );
      }
      const info = header.info;
      const onPage = atlas.regions.filter((region) => region.page.name === page.name);
      const gridSaid = info === null ? null : pageGridSentence(page, info, onPage);
      if (gridSaid !== null) {
        // 🔒 **Still validity, and now for a measured reason rather than an
        // inherited one** (issue #715). The card that opened this expected the
        // clause to move behind the profile switch once the runtime's mapping
        // was measured — it is declared-size-relative, so a rescaled page
        // draws. What settles it the other way is that the sentence below can
        // name a repair the FORMAT already provides (`scale:`), and that two of
        // the three readers a wrong grid breaks are rigc's own and run under
        // both profiles. The sentence, and the one derivation of the ratio under
        // it, is `pageGridSentence` in [`src/atlas.ts`](atlas.ts): the compiler's
        // region lift states the same one when it is asked for texels on such a
        // page (issue #750), so the two cannot come to describe one page two ways.
        fail('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', gridSaid);
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
    // 🔒 **A region's rectangle lies inside the page it names, and that is
    // VALIDITY** (issue #694). The clause is not new — it has read the same four
    // numbers since issue #266 — but it stood inside the policy half below, and
    // behind a guard that skipped any page carrying one region that covered it.
    // Both fences were wrong for it. A rectangle that leaves its page is not a
    // convention somebody else may hold differently: `u2 > 1` samples whatever
    // the wrap mode returns, which is never the drawing the pack was made of, so
    // the part draws garbage or nothing at all. Measured on a pack shaped like
    // the two production atlases that found this — a page declaring 2048x256
    // with regions at `2274,0 980x200` and `0,252 100x258` — every atlas
    // assertion passed under the default profile and the first of the two parts
    // drew 0 of the 10,517 pixels it draws when the same rig is built loose.
    //
    // ⭐ The tool's other half already said so, which is what settles where the
    // clause belongs. `resolveFromAtlas` ([`src/compile.ts`](compile.ts)) refuses
    // exactly this rectangle as a `CompileError` under every profile when a pack
    // arrives through `--atlas-in`, so while it was policy here the compiler and
    // the gate disagreed about the same four numbers — and the gate is the only
    // half that a skeleton and a pack somebody else made ever reach.
    //
    // ⚠️ It is stated over `atlas.regions` rather than per page group, because
    // the question is about one region and its own page and needs no neighbour:
    // a page carrying a single full-page region is measured too, and answers
    // trivially. The rectangle is `pageFootprint`'s and nobody else's here
    // (issue #579): what `TextureAtlas` transposes at 90 and not at 270 is
    // `u2`/`v2`, a UV pair `MeshAttachment.computeUVs` never reads for an atlas
    // region, and the page rectangle is a different quantity — transposed at
    // BOTH quarter turns. A region that fits only *because* it is turned is
    // inside its page, and this clause says so.
    for (const region of atlas.regions) {
      const foot = pageFootprint(region);
      if (
        region.x < 0 ||
        region.y < 0 ||
        region.x + foot.width > region.page.width ||
        region.y + foot.height > region.page.height
      ) {
        fail(
          'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
          `region "${region.name}" occupies ${region.x},${region.y} ${foot.width}x${foot.height} of page ` +
            `"${region.page.name}", which is ${region.page.width}x${region.page.height} — a region that runs off ` +
            'its page samples texels that are not there',
        );
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
    // page is what makes shared-page sampling well defined at all: no two regions
    // on one page overlapping. A foreign pack can fail that while loading clean,
    // and two overlapping rectangles put one drawing inside another's.
    //
    // ⚠️ Its sibling — every region inside the page it names — moved above and
    // out of this profile in issue #694, and the two are not symmetrical. That
    // one is broken for every consumer; this one is a statement about what a
    // pack MEANS, and the corpus is the evidence rather than the taste:
    // measured over the ten atlases in `examples/`, 0 of 132 regions are off
    // their page and 49 pairs on four of those pages overlap, editor-exported
    // and correct. A rule that called those files broken would be one
    // consumer's convention refusing everybody else's data, which is the thing
    // the profile split exists to prevent.
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
      // The `onePartPerPage` guard that stood here went with the clause it was
      // written for: with only the pair check left, a page carrying one region
      // has no pair and the loop below does nothing on it anyway. Nothing reads
      // `u`/`v`/`u2`/`v2` in this assertion any more, which is the point of
      // #579 kept rather than restated.
      const rects = on.map((region) => {
        const foot = pageFootprint(region);
        return { name: region.name, x: region.x, y: region.y, width: foot.width, height: foot.height };
      });
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
  // plate itself is the one page allowed to be opaque: the one the rig names
  // (a cut manifest's part whose window is the crop), or, when the build names
  // none, the region that covers the whole stage.
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
    // 🔒 **Which image is the base plate is decided ONCE, and the rig's own
    // statement decides it** (issue #770). A cut manifest names its base plate
    // — the part whose window IS the crop — and that needs no stage box; the
    // size of an attachment against the stage is read only when the build
    // names none, because it is then the only statement there is (every build
    // from a rig spec, and `validate <dir>`, which has no rig at all). Both
    // routes below read the same two sets, so they cannot disagree about it.
    //
    // ⚠️ Before this, "at least the stage's size" was the only reading, and a
    // stageless manifest rig came out with no base plate: the packed build was
    // refused for its plate's opaque texels while the loose build of the same
    // rig passed on the file's colour type. The order is a rule rather than a
    // coincidence of the fixtures, where the two readings agree: a stage stated
    // small enough for an overlay to "cover" is exactly where they part.
    const named = input.rig?.basePlates ?? [];
    const basePages = new Set<string>();
    const baseRegions = new Set<string>();
    const exempt = (name: string): void => {
      const region = atlas.findRegion(name);
      if (region) {
        basePages.add(region.page.name);
        baseRegions.add(region.name);
      }
    };
    if (named.length > 0) {
      for (const name of named) exempt(name);
    } else {
      for (const att of regionAttachments) {
        if (stageW && stageH && att.width >= stageW && att.height >= stageH) exempt(att.path || att.name);
      }
    }
    // The escape hatch is named the way it is reachable. With a base plate the
    // rig names, that plate; with none but a stage, the size reading; and with
    // neither, nothing here decides which image is the plate — so the sentence
    // says what would, rather than pointing at a door that is not there.
    const undecided =
      'Only a base plate may be opaque, and nothing here decides which image that is: this skeleton declares no ' +
      'stage size to measure one against, and ';
    const exemption =
      named.length > 0
        ? `Only the base plate the rig names (${named.map((name) => JSON.stringify(name)).join(', ')}, the part ` +
          "whose window is the cut manifest's crop) may be opaque."
        : stageW && stageH
          ? `Only the one image big enough to cover the whole stage (${stageW}x${stageH}) may be opaque.`
          : input.rig
            ? `${undecided}the build names no base plate. Either would decide it: give the rig spec a "skeleton" ` +
              'stage the plate covers, or build from a cut manifest, whose base plate is the part whose window is ' +
              'the crop.'
            : `${undecided}no rig was given to name one. Either would decide it: state a "skeleton" stage the plate ` +
              'covers, or validate with the specs it was built from (--rig, --motion and the --manifest, whose base ' +
              'plate is the part whose window is the crop).';
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
      // 🔒 **A page that is not a PNG is a non-measurement for every part on
      // it** (issue #732), stated the way #705's and #715's are: a FAIL naming
      // what was not read, because `skip()` is per assertion and would delete
      // the verdicts on every other page of the same report. The file's
      // identity is `A06`'s to judge, and this sentence points there. A page
      // holding nothing but the full-stage base plate has no part to judge and
      // says nothing, exactly as a readable one would.
      const header = readPngHeader(abs);
      if (header.problem !== null) {
        const shared = on.length > 1;
        const parts = shared ? on.filter((region) => !baseRegions.has(region.name)).map((region) => region.name) : [];
        if (shared ? parts.length === 0 : basePages.has(page.name)) continue;
        const subject = shared
          ? `the ${parts.length} part(s) on shared page "${page.name}" (${parts.map((name) => JSON.stringify(name)).join(', ')}) are`
          : `part image "${page.name}" is`;
        fail(
          'A19_OVERLAY_PNGS_HAVE_ALPHA',
          `${subject} not measured: this rule reads a page's alpha out of its PNG, and the file cannot be read as ` +
            'one, so it states nothing about whether any of them can draw a transparent pixel. What the file is ' +
            "belongs to A06_ATLAS_PAGE_SIZE_MATCHES_PNG, which names it. This is renderer policy, and it belongs to " +
            '--profile spine-html: the default --profile spine does not run this check.',
        );
        continue;
      }
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
        // 🚨 **The scan counts what it READ, and zero texels read is not a
        // verdict** (issue #705). The `continue` above walks past every
        // coordinate that is not on the page, so a rectangle none of whose
        // texels are on it came out of this loop with `transparent` still
        // false — indistinguishable from a solid drawing — and the sentence
        // below then stated opacity over texels nobody had opened. Measured on
        // a pack shaped like #707's: `part "block" is opaque in every one of
        // its 12x8 texels`, over **0 of 96**, on art carrying 36 clear texels
        // where it was packed. That is the message-as-UI defect in one line —
        // the reader is sent to re-export a part whose alpha was never the
        // problem, and the rectangle that is the problem belongs to A06.
        //
        // ⚠️ It is a FAIL rather than a SKIP, and the report's own shape
        // decides that rather than taste. `skip()` is per ASSERTION, so
        // skipping here would delete the verdicts on every other part of the
        // page — on that same pack the second part is genuinely opaque and is
        // named — and adding a skip BESIDE those failures puts A19 in two of
        // the four buckets `reportLines` adds up, which prints `45 assertions`
        // where the registry holds 44. What is left is a failure that says
        // what was not measured, which is also what "green means measured"
        // requires: a part this rule could not read must not be certified by
        // it.
        const plate = readPlate(abs);
        // 🚨 **The scan's coordinates are the atlas's, so a file that is not the
        // declared grid is a non-measurement for every region on it** (issue
        // #715), and #705's clause above does not cover it. That one fires when
        // a rectangle has NO texel on the page; a page whose image is a rescale
        // of the declared size leaves most rectangles partly on it, at
        // coordinates that address a different part of the picture. Measured on
        // a two-region pack at a uniform 0.5: the opaque part's failure
        // DISAPPEARED — the scan found a transparent texel 32 texels away from
        // it and returned — while the other printed #705's sentence over 0 of
        // 256 texels. A verdict and a silence, both about texels nobody located.
        //
        // A FAIL for #705's reason, word for word: `skip()` is per assertion and
        // would delete the verdicts on every other page in the same report.
        if (plate.width !== page.width || plate.height !== page.height) {
          for (const region of on) {
            if (baseRegions.has(region.name)) continue;
            const { width, height } = pageFootprint(region);
            fail(
              'A19_OVERLAY_PNGS_HAVE_ALPHA',
              `part "${region.name}" is not measured: this rule opens the page at the coordinates the atlas ` +
                `states, and page "${page.name}" declares ${page.width}x${page.height} over a ` +
                `${plate.width}x${plate.height} image, so the ${width}x${height} rectangle at ${region.x},` +
                `${region.y} is not where "${region.name}"'s texels are on this file and this rule states ` +
                'nothing about whether it can draw a transparent pixel. The page grid is ' +
                "A06_ATLAS_PAGE_SIZE_MATCHES_PNG's to judge, and it names the ratio and how to declare the page " +
                'honestly. This is renderer policy, and it belongs to --profile spine-html: the default ' +
                '--profile spine does not run this check.',
            );
          }
          continue;
        }
        for (const region of on) {
          if (baseRegions.has(region.name)) continue;
          const { width, height } = pageFootprint(region);
          const declared = width * height;
          let read = 0;
          let transparent = false;
          for (let y = region.y; y < region.y + height && !transparent; y++) {
            for (let x = region.x; x < region.x + width; x++) {
              if (x < 0 || y < 0 || x >= plate.width || y >= plate.height) continue;
              read++;
              if (plate.get(x, y)[3] < 255) {
                transparent = true;
                break;
              }
            }
          }
          if (transparent) continue;
          // The page's size here is the DECODED image's and not the `size:`
          // line's, because it is the bound this scan actually clipped
          // against; where the two disagree A06 says so in its own sentence.
          if (read === 0) {
            fail(
              'A19_OVERLAY_PNGS_HAVE_ALPHA',
              `part "${region.name}" is not measured: this rule read 0 of the ${declared} texels of its ` +
                `${width}x${height} rectangle at ${region.x},${region.y} on page "${page.name}", whose image is ` +
                `${plate.width}x${plate.height}, so it states nothing about whether "${region.name}" can draw a ` +
                "transparent pixel. A region's rectangle is A06_ATLAS_PAGE_SIZE_MATCHES_PNG's to judge, and one " +
                'that runs off its page is refused there by name. This is renderer policy, and it belongs to ' +
                '--profile spine-html: the default --profile spine does not run this check.',
            );
            continue;
          }
          // A rectangle partly on the page states the verdict over the texels
          // it read and says how many of the declared ones that was. A whole
          // rectangle prints the sentence it has always printed, to the byte.
          const over =
            read === declared
              ? `every one of its ${width}x${height} texels on shared page "${page.name}"`
              : `every one of the ${read} texels of its ${width}x${height} rectangle at ${region.x},${region.y} ` +
                `that are on shared page "${page.name}", whose image is ${plate.width}x${plate.height} — the ` +
                `other ${declared - read} of the ${declared} it declares are not on the page and are not ` +
                'measured here';
          fail(
            'A19_OVERLAY_PNGS_HAVE_ALPHA',
            `part "${region.name}" is opaque in ${over}, so it would paint a solid rectangle over whatever is ` +
              `drawn behind it. Re-export the part with transparency and pack again. ${exemption} This is ` +
              'renderer policy, and it belongs to --profile spine-html: the default --profile spine does not run ' +
              'this check.',
          );
        }
        continue;
      }
      const info = header.info;
      if (info.hasTransparency) continue;
      if (basePages.has(page.name)) continue; // the base plate: opaque is correct
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
        // 🔗 A LINKED mesh's rows are its source's and are paired there. Skipped
        // for A21's reason and with A21's failure mode behind it: this reads
        // `meshKinds` at the LINK's slot, which says nothing about the geometry
        // the link borrowed, so a link sitting in a ribbon's slot from another
        // skin would be measured twice and a link to a NON-ribbon in a ribbon's
        // slot would be measured as a strip it was never built as (issue #691).
        if (linkedMeshes.has(mesh)) continue;
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
    // The KIND is part of the path, not just a value under it (issue #692):
    // `leg` may be an ik constraint and a transform constraint at once, and a
    // path keyed on the name alone pairs the first of one file with the second
    // of the other. Measured on the export that made the card: a rebuild
    // carrying both, correctly, reported `values.constraints` 197/199 with
    // `constraints/<name>/kind "IkConstraintData" vs "TransformConstraintData"`
    // as the difference — the comparison contradicting itself rather than the
    // file. The class name is the same string `/kind` already carries, so the
    // two sides pair wherever they agree about what the constraint is.
    const at = `constraints/${constraint.constructor?.name ?? '(unknown)'}:${constraint.name}`;
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
