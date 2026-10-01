/**
 * The model side of the validator (issue #1025, step 4c of #380): the
 * assertions that moved out of `src/validate.ts`, run over the model document
 * and rigc's core instead of over what spine-core loaded.
 *
 * ⭐ **One body, two suppliers.** Every moved assertion is one function under
 * `../bodies/`, written against a fact interface under `../facts/`.
 * `validate()` supplies the facts from spine-core's loaded objects and calls
 * the body inside its own `check`; this entry supplies them from the document
 * (`./parse.ts`, `./skin_entries.ts`, `./atlas_pages.ts`, `./slot_colour.ts`;
 * cut 4c-2's `./mesh_attachments.ts`, `./vertex_polygons.ts`,
 * `./linked_meshes.ts`, `./constraints.ts`; cut 4c-4's
 * `./skeleton_roster.ts`, `./bone_timelines.ts`, `./event_keys.ts`; cut
 * 4c-3's `./deform_survey.ts`, `./animation_durations.ts`, `./two_colour.ts`,
 * `./sequences.ts`; cut 4c-5's `./slider_composition.ts`,
 * `./constraint_targets.ts`)
 * and calls the same body inside the same harness (`../harness.ts`). The
 * selftest holds the two to the same lines on every call it makes with a
 * model in hand, and `tools/verdict_gate.ts` on every recipe.
 *
 * 🔸 **What the entry is given.** The document's text, the directory its
 * pages resolve against, and the profile — and nothing read off a Spine file:
 * a model-side verdict that read `skeleton.json` would be a second reading of
 * the encoding, which is the round trip's subject and not the rig's. Since cut
 * 4c-1 it is also given the rig info (as `validate()` is) and, in `given`, the
 * two values a `rigc-compiled/2` or `/1` document does not hold — the stage and
 * each page's `pma` (`./given.ts`). A `/3` document states both (issue #1026)
 * and is read for them; `given` beside one is refused by name.
 *
 * ⛔ **Not wired into any command.** `build` keeps the round trip and its
 * forty-nine lines; this entry is what the selftest and the instrument call
 * until every moved assertion is on it (the card's design, point 7).
 *
 * Links nothing from the runtime, directly or through what it imports — held
 * by the selftest's `VF` controls.
 */
import { ASSERTION_KIND, type AssertionProfile } from '../kinds.ts';
import { verdictHarness, type VerdictHarness, type Verdicts, type VerdictLists } from '../harness.ts';
import { SKIP_NO_ATLAS, SKIP_NO_MODEL } from '../reasons.ts';
import { a03RegionWidthHeightFinite } from '../bodies/a03.ts';
import { a11NoClippingAttachments } from '../bodies/a11.ts';
import { a17AtlasPageFilesExist } from '../bodies/a17.ts';
import { a45SeparableColorTimelinesOwnTheirChannelsAndPoseAsWritten } from '../bodies/a45.ts';
import { A00_MODEL_READ, A00_MODEL_REGIONS_ON_PAGES, MODEL_PARSE_KIND, modelRead, modelRegionsOnPages, SKIP_NO_MODEL_DOCUMENT, SKIP_NO_MODEL_PAGES, type ReadDocument } from './parse.ts';
import { modelSkinEntries } from './skin_entries.ts';
import { modelAtlasPages } from './atlas_pages.ts';
import { modelSlotColour } from './slot_colour.ts';
import type { SkinEntryFacts } from '../facts/skin_entries.ts';
import type { AtlasPageFacts } from '../facts/atlas_pages.ts';
import type { SlotColourFacts } from '../facts/slot_colour.ts';
import type { RigInfo } from '../../types.ts';
import type { ModelGiven } from './given.ts';
import { a08RegionNamesMatchAttachments } from '../bodies/a08.ts';
import { a13MeshBudget } from '../bodies/a13.ts';
import { a14NoFullFrameMesh } from '../bodies/a14.ts';
import { a15IdleNoMeshBoneKeys } from '../bodies/a15.ts';
import { a22MeshUvsInUnitRange } from '../bodies/a22.ts';
import { a38SkinMembersAreSkinRequired } from '../bodies/a38.ts';
import { a06AtlasPageSizeMatchesPng } from '../bodies/a06.ts';
import { a19OverlayPngsHaveAlpha } from '../bodies/a19.ts';
import { a27RegionNameMatchesPageFilename } from '../bodies/a27.ts';
import { modelSkinMeshes } from './skin_meshes.ts';
import { modelAnimatedBones } from './animated_bones.ts';
import { modelSkinMembers } from './skin_members.ts';
import { modelRegionJoins } from './region_joins.ts';
import { modelAtlasRegions } from './atlas_regions.ts';
import { modelStage } from './stage.ts';
import type { SkinMeshFacts } from '../facts/skin_meshes.ts';
import type { AnimatedBoneFacts } from '../facts/animated_bones.ts';
import type { SkinMemberFacts } from '../facts/skin_members.ts';
import type { RegionJoinFacts } from '../facts/region_joins.ts';
import type { AtlasRegionFacts } from '../facts/atlas_regions.ts';
import type { StageFacts } from '../facts/stage.ts';
import { a04MeshTrianglesAndEncoding } from '../bodies/a04.ts';
import { a20MeshWeightsCoherent } from '../bodies/a20.ts';
import { a21MeshRimPinned } from '../bodies/a21.ts';
import { a23PhysicsConstraintEffective } from '../bodies/a23.ts';
import { a28RibbonRowsShareWeights } from '../bodies/a28.ts';
import { a33VertexAttachmentGeometry } from '../bodies/a33.ts';
import { a36PathConstraintEffective } from '../bodies/a36.ts';
import { a37SliderConstraintEffective } from '../bodies/a37.ts';
import { a41PhysicsSurvivesEditorRoundTrip } from '../bodies/a41.ts';
import { a42DrivenConstraintsUpdateAfterTheirDriver } from '../bodies/a42.ts';
import { a44LinkedMeshStatesNoGeometryOfItsOwn } from '../bodies/a44.ts';
import { a47IkConstraintNotMutedThroughout } from '../bodies/a47.ts';
import { a48TransformConstraintNotMutedThroughout } from '../bodies/a48.ts';
import { modelMeshFacts } from './mesh_attachments.ts';
import { modelPolygonFacts } from './vertex_polygons.ts';
import { modelLinkFacts } from './linked_meshes.ts';
import { modelConstraintFacts } from './constraints.ts';
import type { MeshFacts } from '../facts/mesh_attachments.ts';
import type { PolygonFacts } from '../facts/vertex_polygons.ts';
import type { LinkFacts } from '../facts/linked_meshes.ts';
import type { ConstraintFacts } from '../facts/constraints.ts';
import { a12NoDarkColor } from '../bodies/a12.ts';
import { a24AxisSpaceStroke } from '../bodies/a24.ts';
import { a25DetachedBoneParentage } from '../bodies/a25.ts';
import { a26SlotDrawOrder } from '../bodies/a26.ts';
import { a29StrokeWithinContactDepth } from '../bodies/a29.ts';
import { a30StrokeWithinCapContainment } from '../bodies/a30.ts';
import { a32EventKeysResolve } from '../bodies/a32.ts';
import { modelSkeletonRoster } from './skeleton_roster.ts';
import { modelBoneTimelines } from './bone_timelines.ts';
import { modelEventKeys } from './event_keys.ts';
import type { SkeletonRosterFacts } from '../facts/skeleton_roster.ts';
import type { BoneTimelineFacts } from '../facts/bone_timelines.ts';
import type { EventKeyFacts } from '../facts/event_keys.ts';
import { a39DeformKeepsTriangleWinding } from '../bodies/a39.ts';
import { a09AnimationDurationMatchesSpec } from '../bodies/a09.ts';
import { a43TwoColorTintLoadsAndPosesAsWritten } from '../bodies/a43.ts';
import { a46SequenceAttachmentsShowTheFrameTheFileStates } from '../bodies/a46.ts';
import { modelDeformSurvey } from './deform_survey.ts';
import { modelAnimationDurations } from './animation_durations.ts';
import { modelTwoColour } from './two_colour.ts';
import { modelSequences } from './sequences.ts';
import type { DeformSurveyFacts } from '../facts/deform_survey.ts';
import type { AnimationDurationFacts } from '../facts/animation_durations.ts';
import type { TwoColourFacts } from '../facts/two_colour.ts';
import type { SequenceFacts } from '../facts/sequences.ts';
import { a40SlidersComposeOnASharedTarget } from '../bodies/a40.ts';
import { modelSliderComposition } from './slider_composition.ts';
import type { SliderCompositionFacts } from '../facts/slider_composition.ts';
import { a34ConstraintTimelineTargets } from '../bodies/a34.ts';
import { modelConstraintTargets } from './constraint_targets.ts';
import type { ConstraintTargetFacts } from '../facts/constraint_targets.ts';

/** What the model side is given. */
export interface ModelValidateInput {
  /** The document `build` writes beside the Spine pair (`skeleton.model.json`). */
  modelText: string;
  /** The directory the document's page names resolve against — the build's `--out`. */
  atlasDir: string;
  profile: AssertionProfile;
  /** The rig info the build carries, as `validate()` is handed it — A13, A15, A19 (cut 4c-1) and A20, A21, A28, A41, A47, A48 (cut 4c-2) and A24, A25, A26, A29, A30 (cut 4c-4) read it; optional because `ValidateInput.rig` is: absent for a bare directory, on both sides. */
  rig?: RigInfo;
  /**
   * The stage and the pages' `pma`, for a `rigc-compiled/2` or `/1` document,
   * which does not hold them (`./given.ts`). A06, A14 and A19 read them; a
   * caller that gives none there has those three refuse by name rather than
   * read a value nobody stated. A `/3` document states both (issue #1026), and
   * `given` beside it is refused by name.
   */
  given?: ModelGiven;
  /** The motion spec's declared durations, as `validate()` is handed them — A09 reads them (cut 4c-3); absent where the caller has no motion spec, on both sides. */
  declaredDurations?: Record<string, number>;
}

/** The model side's report: `validate()`'s shape, over the moved assertions and the two parse rules. */
export interface ModelReport extends VerdictLists {
  profile: AssertionProfile;
}

/**
 * The fact families, composed: one supplier per family under `./`, each a
 * function of the read document. A body names the family it reads, so a later
 * cut that moves an assertion over an existing family adds a body file and a
 * row below, and one over a new family adds a facts file, a supplier file and
 * a field here.
 */
export interface ModelSupply {
  skinEntries: (read: ReadDocument) => SkinEntryFacts;
  atlasPages: (read: ReadDocument) => AtlasPageFacts;
  slotColour: (read: ReadDocument) => SlotColourFacts;
  skinMeshes: (read: ReadDocument) => SkinMeshFacts;
  animatedBones: (read: ReadDocument) => AnimatedBoneFacts;
  skinMembers: (read: ReadDocument) => SkinMemberFacts;
  regionJoins: (read: ReadDocument) => RegionJoinFacts;
  atlasRegions: (read: ReadDocument, input: ModelValidateInput) => AtlasRegionFacts;
  stage: (read: ReadDocument, input: ModelValidateInput) => StageFacts;
  meshes: (read: ReadDocument) => MeshFacts;
  polygons: (read: ReadDocument) => PolygonFacts;
  links: (read: ReadDocument) => LinkFacts;
  constraints: (read: ReadDocument) => ConstraintFacts;
  skeletonRoster: (read: ReadDocument) => SkeletonRosterFacts;
  boneTimelines: (read: ReadDocument) => BoneTimelineFacts;
  eventKeys: (read: ReadDocument) => EventKeyFacts;
  deformSurvey: (read: ReadDocument) => DeformSurveyFacts;
  animationDurations: (read: ReadDocument) => AnimationDurationFacts;
  twoColour: (read: ReadDocument) => TwoColourFacts;
  sequences: (read: ReadDocument) => SequenceFacts;
  sliderComposition: (read: ReadDocument) => SliderCompositionFacts;
  constraintTargets: (read: ReadDocument) => ConstraintTargetFacts;
}

/** The suppliers the model side runs on. */
export const MODEL_SUPPLY: ModelSupply = {
  skinEntries: modelSkinEntries,
  atlasPages: modelAtlasPages,
  slotColour: modelSlotColour,
  skinMeshes: modelSkinMeshes,
  animatedBones: modelAnimatedBones,
  skinMembers: modelSkinMembers,
  regionJoins: modelRegionJoins,
  atlasRegions: (read, input) => modelAtlasRegions(read, input.given),
  stage: (read, input) => modelStage(read, input.given),
  meshes: modelMeshFacts,
  polygons: modelPolygonFacts,
  links: modelLinkFacts,
  constraints: modelConstraintFacts,
  skeletonRoster: modelSkeletonRoster,
  boneTimelines: modelBoneTimelines,
  eventKeys: modelEventKeys,
  deformSurvey: modelDeformSurvey,
  animationDurations: modelAnimationDurations,
  twoColour: modelTwoColour,
  sequences: modelSequences,
  sliderComposition: modelSliderComposition,
  constraintTargets: modelConstraintTargets,
};

/**
 * One moved assertion: its code, and how the model side runs its body once the
 * document is read. The list is the registry of what has moved — each later
 * cut appends its rows — and the selftest reads it for the codes it compares.
 */
export interface MovedAssertion {
  code: string;
  /** The body, over the document. Not called when the model side read no document. */
  run: (verdicts: Verdicts, read: ReadDocument, input: ModelValidateInput, supply: ModelSupply) => void;
  /** What the body SKIPs with when there is no document — the model side's counterpart of the reason `validate()` gives when the round trip produced nothing. */
  unread: string;
  /**
   * The body runs behind the reader alone, not behind the region rule — the
   * model side's place for a rule `validate()` runs BEFORE its round trip
   * (A08, issue #589), so that a region miss is named by the rule's own
   * sentence on both sides while the parse beside it refuses the file.
   *
   * Since cut 4c-4 also every rule `validate()` runs over the skeleton JSON
   * whatever its round trip did (A12, A24, A25, A26, A29, A30, and A32, which
   * runs before it; since cut 4c-5 A34): on the runtime's side their verdict does not wait on the
   * load, so on this side it does not wait on the region rule, and where both
   * parses refuse a build the two sides' lines of these rules are still
   * compared.
   */
  beforeTheParse?: boolean;
}

/**
 * The moved assertions, in `validate()`'s report order (the order its `check`
 * calls stand in; the selftest and the instrument compare per code). `SKIP_NO_ATLAS` for
 * A17 rather than `SKIP_NO_MODEL` because that is what A17 says over a missing
 * atlas on either side: its body reads only the pages, and on this side no
 * document means no pages.
 */
export const MOVED_ASSERTIONS: readonly MovedAssertion[] = [
  { code: 'A08_REGION_NAMES_MATCH_ATTACHMENTS', run: (v, read, _input, supply) => (read.doc.pages === null ? v.skip('A08_REGION_NAMES_MATCH_ATTACHMENTS', SKIP_NO_MODEL_PAGES) : a08RegionNamesMatchAttachments(v, supply.regionJoins(read), new Set<string>())), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A03_REGION_WIDTH_HEIGHT_FINITE', run: (v, read, _input, supply) => a03RegionWidthHeightFinite(v, supply.skinEntries(read)), unread: SKIP_NO_MODEL },
  { code: 'A04_MESH_TRIANGLES_AND_ENCODING', run: (v, read, _input, supply) => a04MeshTrianglesAndEncoding(v, supply.meshes(read)), unread: SKIP_NO_MODEL },
  { code: 'A33_VERTEX_ATTACHMENT_GEOMETRY', run: (v, read, _input, supply) => a33VertexAttachmentGeometry(v, supply.polygons(read)), unread: SKIP_NO_MODEL },
  { code: 'A11_NO_CLIPPING_ATTACHMENTS', run: (v, read, _input, supply) => a11NoClippingAttachments(v, supply.skinEntries(read)), unread: SKIP_NO_MODEL },
  { code: 'A13_MESH_BUDGET', run: (v, read, input, supply) => a13MeshBudget(v, supply.skinMeshes(read), input), unread: SKIP_NO_MODEL },
  { code: 'A14_NO_FULL_FRAME_MESH', run: (v, read, input, supply) => a14NoFullFrameMesh(v, supply.skinMeshes(read), supply.stage(read, input)), unread: SKIP_NO_MODEL },
  { code: 'A15_IDLE_NO_MESH_BONE_KEYS', run: (v, read, input, supply) => a15IdleNoMeshBoneKeys(v, supply.skinMeshes(read), supply.animatedBones(read), input), unread: SKIP_NO_MODEL },
  { code: 'A20_MESH_WEIGHTS_COHERENT', run: (v, read, input, supply) => a20MeshWeightsCoherent(v, supply.meshes(read), input.profile === 'spine-html', input.rig), unread: SKIP_NO_MODEL },
  { code: 'A21_MESH_RIM_PINNED', run: (v, read, input, supply) => a21MeshRimPinned(v, supply.meshes(read), input.rig), unread: SKIP_NO_MODEL },
  { code: 'A22_MESH_UVS_IN_UNIT_RANGE', run: (v, read, _input, supply) => a22MeshUvsInUnitRange(v, supply.skinMeshes(read)), unread: SKIP_NO_MODEL },
  { code: 'A23_PHYSICS_CONSTRAINT_EFFECTIVE', run: (v, read, _input, supply) => a23PhysicsConstraintEffective(v, supply.constraints(read), supply.meshes(read)), unread: SKIP_NO_MODEL },
  { code: 'A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP', run: (v, read, input, supply) => a41PhysicsSurvivesEditorRoundTrip(v, supply.constraints(read), input.rig), unread: SKIP_NO_MODEL },
  { code: 'A36_PATH_CONSTRAINT_EFFECTIVE', run: (v, read, _input, supply) => a36PathConstraintEffective(v, supply.constraints(read)), unread: SKIP_NO_MODEL },
  { code: 'A37_SLIDER_CONSTRAINT_EFFECTIVE', run: (v, read, _input, supply) => a37SliderConstraintEffective(v, supply.constraints(read)), unread: SKIP_NO_MODEL },
  { code: 'A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT', run: (v, read, input, supply) => a47IkConstraintNotMutedThroughout(v, supply.constraints(read), input.rig), unread: SKIP_NO_MODEL },
  { code: 'A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT', run: (v, read, input, supply) => a48TransformConstraintNotMutedThroughout(v, supply.constraints(read), input.rig), unread: SKIP_NO_MODEL },
  { code: 'A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER', run: (v, read, _input, supply) => a42DrivenConstraintsUpdateAfterTheirDriver(v, supply.constraints(read)), unread: SKIP_NO_MODEL },
  { code: 'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED', run: (v, read, _input, supply) => a38SkinMembersAreSkinRequired(v, supply.skinMembers(read)), unread: SKIP_NO_MODEL },
  { code: 'A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN', run: (v, read, _input, supply) => a45SeparableColorTimelinesOwnTheirChannelsAndPoseAsWritten(v, supply.slotColour(read)), unread: SKIP_NO_MODEL },
  { code: 'A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN', run: (v, read, _input, supply) => a44LinkedMeshStatesNoGeometryOfItsOwn(v, supply.links(read)), unread: SKIP_NO_MODEL },
  { code: 'A17_ATLAS_PAGE_FILES_EXIST', run: (v, read, input, supply) => a17AtlasPageFilesExist(v, supply.atlasPages(read), input), unread: SKIP_NO_ATLAS },
  { code: 'A06_ATLAS_PAGE_SIZE_MATCHES_PNG', run: (v, read, input, supply) => a06AtlasPageSizeMatchesPng(v, supply.atlasRegions(read, input), input, input.profile === 'spine-html'), unread: SKIP_NO_ATLAS },
  { code: 'A19_OVERLAY_PNGS_HAVE_ALPHA', run: (v, read, input, supply) => a19OverlayPngsHaveAlpha(v, supply.atlasRegions(read, input), supply.stage(read, input), supply.skinEntries(read), input), unread: SKIP_NO_ATLAS },
  { code: 'A27_REGION_NAME_MATCHES_PAGE_FILENAME', run: (v, read, input, supply) => a27RegionNameMatchesPageFilename(v, supply.atlasRegions(read, input)), unread: SKIP_NO_ATLAS },
  { code: 'A28_RIBBON_ROWS_SHARE_WEIGHTS', run: (v, read, input, supply) => a28RibbonRowsShareWeights(v, supply.meshes(read), input.rig), unread: SKIP_NO_MODEL },
  { code: 'A32_EVENT_KEYS_RESOLVE', run: (v, read, _input, supply) => a32EventKeysResolve(v, supply.eventKeys(read)), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A12_NO_DARK_COLOR', run: (v, read, _input, supply) => a12NoDarkColor(v, supply.skeletonRoster(read), supply.slotColour(read).slotTimelines), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A24_AXIS_SPACE_STROKE', run: (v, read, input, supply) => a24AxisSpaceStroke(v, supply.boneTimelines(read), input), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A25_DETACHED_BONE_PARENTAGE', run: (v, read, input, supply) => a25DetachedBoneParentage(v, supply.skeletonRoster(read), input), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A26_SLOT_DRAW_ORDER', run: (v, read, input, supply) => a26SlotDrawOrder(v, supply.skeletonRoster(read), input), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A29_STROKE_WITHIN_CONTACT_DEPTH', run: (v, read, input, supply) => a29StrokeWithinContactDepth(v, supply.boneTimelines(read), input), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A30_STROKE_WITHIN_CAP_CONTAINMENT', run: (v, read, input, supply) => a30StrokeWithinCapContainment(v, supply.boneTimelines(read), input), unread: SKIP_NO_MODEL, beforeTheParse: true },
  { code: 'A39_DEFORM_KEEPS_TRIANGLE_WINDING', run: (v, read, input, supply) => a39DeformKeepsTriangleWinding(v, supply.deformSurvey(read), input.rig), unread: SKIP_NO_MODEL },
  { code: 'A09_ANIMATION_DURATION_MATCHES_SPEC', run: (v, read, input, supply) => a09AnimationDurationMatchesSpec(v, supply.animationDurations(read), input.declaredDurations), unread: SKIP_NO_MODEL },
  { code: 'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN', run: (v, read, _input, supply) => a43TwoColorTintLoadsAndPosesAsWritten(v, supply.twoColour(read)), unread: SKIP_NO_MODEL },
  { code: 'A46_SEQUENCE_ATTACHMENTS_SHOW_THE_FRAME_THE_FILE_STATES', run: (v, read, _input, supply) => a46SequenceAttachmentsShowTheFrameTheFileStates(v, supply.sequences(read)), unread: SKIP_NO_MODEL },
  { code: 'A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET', run: (v, read, _input, supply) => a40SlidersComposeOnASharedTarget(v, supply.sliderComposition(read), supply.constraints(read)), unread: SKIP_NO_MODEL },
  { code: 'A34_CONSTRAINT_TIMELINE_TARGETS', run: (v, read, _input, supply) => a34ConstraintTimelineTargets(v, supply.constraintTargets(read)), unread: SKIP_NO_MODEL, beforeTheParse: true },
];

/** The codes the model side prints: its two parse rules, then the moved assertions. */
export const MODEL_SIDE_CODES: readonly string[] = [A00_MODEL_READ, A00_MODEL_REGIONS_ON_PAGES, ...MOVED_ASSERTIONS.map((m) => m.code)];

/**
 * The parse: the reader, then the region rule. Returns what the reader read
 * (`null` when it refused) and whether the region rule held too — a
 * `beforeTheParse` body needs only the first.
 */
function parse(h: VerdictHarness, modelText: string): { read: ReadDocument | null; held: boolean } {
  const read = h.check(A00_MODEL_READ, () => modelRead(h.verdicts, modelText)) ?? null;
  if (read === null) {
    h.check(A00_MODEL_REGIONS_ON_PAGES, () => h.skip(A00_MODEL_REGIONS_ON_PAGES, SKIP_NO_MODEL_DOCUMENT));
    return { read: null, held: false };
  }
  return { read, held: h.check(A00_MODEL_REGIONS_ON_PAGES, () => modelRegionsOnPages(h.verdicts, read)) === true };
}

/**
 * Run the model side: the parse, then every moved assertion — each over the
 * document, or skipped naming the parse when there is none — and return the
 * report in `validate()`'s shape, which `reportLines` in `src/validate.ts`
 * prints. `plant` replaces a family's supplier; only the selftest's plants
 * pass one.
 */
export function validateModel(input: ModelValidateInput, plant: Partial<ModelSupply> = {}): ModelReport {
  const supply: ModelSupply = { ...MODEL_SUPPLY, ...plant };
  const h = verdictHarness(input.profile, { ...ASSERTION_KIND, ...MODEL_PARSE_KIND }, 'the model side');
  const { read, held } = parse(h, input.modelText);
  for (const moved of MOVED_ASSERTIONS) {
    const doc = read !== null && (held || moved.beforeTheParse === true) ? read : null;
    h.check(moved.code, () => (doc === null ? h.skip(moved.code, moved.unread) : moved.run(h.verdicts, doc, input, supply)));
  }
  const { failures, passed, skipped, profileSkipped, stats } = h;
  return { failures, passed, skipped, profileSkipped, stats, profile: input.profile };
}

