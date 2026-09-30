/**
 * core_gate — the equivalence gate of issue #380 run over a corpus: every
 * recipe built through the CLI, its Spine build posed by spine-core and its
 * model document posed by rigc's own core, the two compared, and the census of
 * what the corpus reaches (issue #925, step 2a; the slots, issue #928; the
 * attachments' world vertices and the clipping polygons, issue #931).
 *
 *   bun tools/core_gate.ts [--recipes <recipes.json>] [--root <dir>] [--work <dir>]
 *
 * With no `--recipes`, the tree's own: `tools/emit_hashes.ts`'s `treeRecipes`
 * (every fetched editor export and every gallery rig — nineteen when
 * `examples/` is fetched), staged and built exactly as `emit_hashes run`
 * builds them (`runRecipes`), so the same rows are measured here and there.
 * `--recipes` takes an `emit-hashes-recipes/1` or `emit-hashes/1` document and
 * `--root` resolves its stages, which is how a private corpus is run: its
 * recipes live with it and only the printed figures leave it.
 *
 * ## Per row
 *
 * `tools/pose_oracle.ts`'s two dumpers on the build in `{{out}}`: `dump` of
 * `skeleton.json` + `skeleton.atlas` (spine-core) and `dump --core` of
 * `skeleton.model.json`, both under the default options (grid, nine samples,
 * every skin, no physics), then `compare`. Each block the core poses —
 * `setup.bones`, `setup.slots`, `setup.drawOrder`, `setup.attachments`,
 * `setup.clips`, `setup.clipped`, and a sample's `bones`, `slots`,
 * `drawOrder`, `attachments`, `clips`, `clipped` and `events` (`GATE_BLOCKS`;
 * the sample's draw order, attachments, clips and events and the setup's draw
 * order since issue #955, both `clipped` blocks since issue #964, with a
 * clipping census — `CLIPPED_CENSUS_FIELDS` — off the spine-core dump) — is
 * judged on its own, by a
 * `compare` of the spine-core dump against the core's with the other posed
 * blocks left out, and reads:
 *
 *   - `IDENTICAL` — the block agrees;
 *   - `SKIP` — the core left the block out, with the construct it names (a
 *     path walking a slot whose placeholder skins fill differently, or
 *     another case `src/core/constraints_path.ts` names, or a slider keying a
 *     constraint timeline, for the bones — every constraint kind is posed
 *     since issue #938; a slider keying a slot on such a row, or skins
 *     disagreeing over a placeholder — under the merged view only, and
 *     judged per skin below — for the slots; either of those, a shown
 *     region whose atlas rectangle is `null`, or a deform or sequence
 *     timeline moving a record several skins fill, for the attachments; a
 *     slider keying the draw order on a row whose bones are absent, for the
 *     draw order), so the row holds nothing about it;
 *   - `DIFF` — with the first difference.
 *
 * The row's own verdict is `DIFF` when any block is (or the whole comparison
 * is), `IDENTICAL` when every block is, `SKIP` otherwise — naming the blocks
 * skipped — and `REFUSED` when the build chain exited non-zero or a document
 * could not be read; a refused row is not measured and says why. Under the
 * row, one line per animation (issue #936): its verdict on each sample
 * block, and the first difference of a DIFF.
 *
 * ## Per skin (issue #932)
 *
 * The run above poses every skin merged (`--skin all`), which is the
 * instrument's view and not a state a runtime is ever in: a placeholder
 * several skins fill shows the last of them in the Spine file's order,
 * which the model does not hold, so the core leaves such a block out. A row
 * whose model declares several skins is therefore run once more per skin,
 * both dumpers under `--skin <name>` (the named skin's record, else the
 * default skin's; the named skin's bones and constraint lists alone —
 * `src/core/skins.ts`), each block judged alone as above, the stepped run
 * too. A block the merged run leaves out and every skin's run poses is
 * judged by those runs — DIFF when any skin's is, IDENTICAL otherwise, its
 * reason saying so — and a skin's DIFF makes the row DIFF, naming the skin.
 * The merged run stays: it is what the rosters are compared on, and a
 * block it poses is judged there as before. A row declaring one skin (or
 * none) is not run again: its one skin and the merged view are the same
 * pose — measured on the nineteen tree rows, spine-core's dump under
 * `--skin <its skin>` equals its `--skin all` dump in every block
 * (`CN05`) — so the per-skin runs cost nothing on a one-skin corpus. Each
 * skin's verdict prints under its row, the verdict line counts the rows
 * declaring several skins and their runs, and a corpus with none prints a
 * `per skin` HOLE.
 *
 * ## The stepped run (issue #956)
 *
 * Every row is dumped a second time by both dumpers under `--physics step
 * --dt 1/60` (`STEPPED_OPTIONS`, the oracle's default `dt`, the same nine
 * grid samples) and its `setup.bones` and `animations.bones` judged alone,
 * the `physics` parameter block with each — both phases on every run, not a
 * flag: the stepped share of a run over the nineteen tree rows measured
 * 0.56 s and 1.67 s on two runs of a shared machine, against builds that
 * take the rest of its half-minute. A row declaring a physics constraint,
 * or one whose stepped verdict is not IDENTICAL, prints the `dt` its two
 * documents state (they must state the same one, or the row is DIFF) and,
 * per animation, the steps the schedule takes to reach each sample from the
 * one before (`stepSchedule` in `src/core/constraints_physics.ts`; the first
 * sample, at 0, takes none: it is the reset pose). A stepped DIFF turns the
 * run RED, and the verdict line counts the stepped verdicts after the rest.
 *
 * ## The census
 *
 * One line per row: bones, the inherit modes the model states (a bone that
 * states none inherits `normal`), and how many bones state each field a
 * setup pose reads — `length`, `scaleX`, `scaleY`, `shearX`, `shearY`,
 * `skinRequired` — plus three conditions: a negative scale, a rotation of 360
 * degrees or more in magnitude, and a parent whose setup world matrix
 * reflects (determinant below 0 in the spine-core dump). A mode or field no
 * row whose `setup.bones` was compared reaches is printed as a HOLE: the gate
 * held nothing about it, and that is the finding.
 *
 * And one line per row for the slots (`SLOT_CENSUS_FIELDS`, issue #928): a
 * second skin, a setup placeholder several skins fill (and those that
 * disagree), a `null` setup attachment, a placeholder no skin fills, a stated
 * colour (and one of six digits), a dark colour (and one of eight digits), a
 * stated blend mode by the mode it reads (`blendNormal`, `blendAdditive`,
 * `blendMultiply`, `blendScreen`; a slot stating none reads `Normal` and is
 * judged on every compared row), a shown record whose name is not its
 * placeholder or whose path is not its name, each kind shown at setup, a slot
 * on an inactive bone, and a slider whose animation keys a slot. Each field no
 * row whose `setup.slots` was compared reaches is a HOLE. The blend mode is
 * the slot row's last cell since issue #933, so a stated one is judged like
 * every other field.
 *
 * And one line per row for the animations (`ANIMATION_CENSUS_FIELDS`, issue
 * #936): the timelines of each bone and slot kind, the keys by the curve that
 * leaves them, the gate's sample times before a timeline's first key and after
 * its last, a bone keyed by two timelines posing one channel, and — since
 * issue #955, which replaced the one `laterTimelines` HOLE — construct 4's
 * remainder per kind: deform timelines (weighted, on a path, on a clipping
 * polygon, played by a linked mesh; Bézier and stepped segments; partial
 * runs and keys with no run; in a slider's animation), sequence timelines,
 * draw-order timelines (restores; a slider's) and events (a payload stated),
 * each judged on the block it changes (`REMAINDER_CENSUS_BLOCKS`). A field no
 * row whose block was compared reaches is a HOLE. Then one `KIND` line per
 * timeline kind — deform, sequence, draw order, events — the rows carrying
 * it that are judged on its block, and those that stay SKIP.
 *
 * And one line per row for the constraints (`CONSTRAINT_CENSUS_FIELDS`, issue
 * #938): the ik and transform constraints and what each states, their
 * timelines, and the update order's two effects — a constraint reading a bone
 * an earlier one moved, and a world-space edit a later one re-poses — each a
 * HOLE when no row whose bones were compared reaches it; the physics
 * constraints and their timelines, and the slider's forms, flags, what its
 * animation keys and its timelines, likewise; the kinds
 * no cut poses yet (`later`) a HOLE however many rows declare one, and a
 * `NONE` line saying so when no kind is left to a later cut.
 *
 * And one line per row for the stepped phase (`STEPPED_CENSUS_FIELDS`, issue
 * #956): each component a physics constraint drives, each setting it states
 * off the parser's value, each timeline kind keyed, the timeline naming no
 * constraint, a `mix` of 0, two constraints on one bone, one physics bone
 * below another and a skin-required constraint — each a HOLE when no row
 * the stepped run judged IDENTICAL reaches it, which the core suite's `CK`
 * probes hold (it replaces issue #938's `physics.stepped` HOLE).
 *
 * And one line per row for the path constraints (`PATH_CENSUS_FIELDS`, issue
 * #938's second cut): every mode and setting the walk reads, the curve each
 * walks, a percent position past an open path's ends, which slot bone the
 * offset reads, a slot showing no path, a path after a constraint that moves
 * what it reads, and the three timelines — each a HOLE when no compared row
 * reaches it, which the core suite's `CP11` holds to a probe. Then one `KIND`
 * line per constraint kind: the rows declaring it that are judged and those
 * that stay SKIP.
 *
 * And one line per row for the attachments (`ATTACHMENT_CENSUS_FIELDS`, issue
 * #931), each a count of slots whose setup attachment has it: a weighted mesh,
 * a mesh bound to several bones, a mesh bound to a bone whose setup world
 * matrix reflects or shears (off the spine-core dump), a linked mesh, a
 * trimmed region, a region with non-unit scale or a rotation, a region under
 * a negative scale or a reflecting bone, a region with a sequence, a region
 * whose rectangle is `null`, a clipping polygon and one ending at a slot, a
 * bounding box and a path attachment. Each field no row whose block was
 * compared reaches is a HOLE; ⚠️ a bounding box and a path are HOLEs on every
 * corpus, since the oracle's dump writes no vertices for either, and a trim
 * is reached only from a pack that trims, which the public examples do not.
 *
 * Exit codes: 0 when every row is IDENTICAL or SKIP; 1 when any row is DIFF or
 * REFUSED, or its stepped run or any skin's run is DIFF; 2 on a bad input, by name. `tools/` is not `src/`: this file runs
 * child processes (through `runRecipes`) and reads the disk.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { activeBones, CORE_INHERIT_MODES, CoreInputError, foldInheritMode, readBlend, readModel, shownAttachment, shownRow } from '../src/core/index.ts';
import { BONE_TIMELINE_KINDS, sampleTime, SLOT_TIMELINE_KINDS, type TimelinePlant } from '../src/core/animation.ts';
import { ADMITTED_CONSTRAINT_KINDS, TRANSFORM_PROPERTIES, type CoreConstraintRecord } from '../src/core/constraints.ts';
import { slotBonePlan, type CorePathRecord } from '../src/core/constraints_path.ts';
import { EVERY_GLOBAL_PHYSICS, PHYSICS_DEFAULTS, stepSchedule, type CorePhysicsRecord } from '../src/core/constraints_physics.ts';
import { CORE_CONSTRAINT_KINDS } from '../src/core/index.ts';
import { MODEL_DOCUMENT_FILE } from '../src/model.ts';
import { HashesInputError, readRecipes, runRecipes, TREE_ROOT, treeRecipes, type Recipe } from './emit_hashes.ts';
import {
  compareDumps,
  coreDump,
  dumpSkeleton,
  loadOracleData,
  ORACLE_BLOCKS,
  ORACLE_DEFAULT_DT,
  ORACLE_DEFAULT_SAMPLES,
  ORACLE_DEFAULT_TOL,
  OracleInputError,
  parseDt,
  type OracleBlock,
  type OracleComparison,
  type OracleDocument,
  type OracleOptions,
} from './pose_oracle.ts';

/** The options both dumps are taken under: the oracle's defaults. */
export const GATE_OPTIONS: OracleOptions = { phase: 'grid', samples: ORACLE_DEFAULT_SAMPLES, skin: 'all', physics: 'none', dt: null };

/** The stepped run's options (issue #956): the same samples, `--physics step` at the oracle's default `--dt`. */
export const STEPPED_OPTIONS: OracleOptions = { ...GATE_OPTIONS, physics: 'step', dt: parseDt(ORACLE_DEFAULT_DT) };

/**
 * The stepped phase's census fields (issue #956), in the order its table
 * prints them: each component a physics constraint drives (above 0), a
 * component stated below 0 (off, though a negative `rotate` or `shearX` still
 * weighs the rotation), each setting stated other than the parser's value
 * (`PHYSICS_DEFAULTS`), each timeline kind keyed, the timeline that names no
 * constraint, a constraint resting at `mix` 0 or keyed to it, two constraints
 * on one bone, a physics bone below another physics bone, and a
 * skin-required one. Each a count of physics constraints (or timelines),
 * over the document.
 */
export const STEPPED_CENSUS_FIELDS = [
  'x', 'y', 'rotate', 'scaleX', 'shearX', 'componentNegative',
  'inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix', 'limit', 'fps',
  'timeline.inertia', 'timeline.strength', 'timeline.damping', 'timeline.mass', 'timeline.wind', 'timeline.gravity', 'timeline.mix', 'timeline.reset',
  'timeline.global', 'mixZero', 'sameBone', 'chain', 'skin',
] as const;
export type SteppedCensusField = (typeof STEPPED_CENSUS_FIELDS)[number];
export type SteppedCensusRow = Record<SteppedCensusField, number>;

/** One row's stepped run: its bones judged under `STEPPED_OPTIONS`, the `dt` both documents state, and the steps the walk takes between samples. */
export interface SteppedRow {
  verdict: BlockVerdict;
  why: string | null;
  /** The `options.dt` both documents carry. */
  dt: number | null;
  boneSamples: number;
  /** Per animation, the steps taken to reach each sample from the one before (the first from the reset at 0). */
  steps: Array<{ animation: string; counts: number[] }>;
  census: SteppedCensusRow;
}

/** The census's bone fields, in the order its table prints them. */
export const CENSUS_FIELDS = ['length', 'scaleX', 'scaleY', 'shearX', 'shearY', 'skinRequired', 'negativeScale', 'rotation360', 'reflectingParent'] as const;
export type CensusField = (typeof CENSUS_FIELDS)[number];

export interface CensusRow {
  bones: number;
  modes: Record<(typeof CORE_INHERIT_MODES)[number], number>;
  fields: Record<CensusField, number>;
}

/** The slots' census fields, in the order its table prints them — the header's list. */
export const SLOT_CENSUS_FIELDS = [
  'secondSkin', 'multiFilled', 'conflicting', 'nullSetup', 'unfilled', 'colour', 'colour6', 'dark', 'dark8', 'blendNormal', 'blendAdditive', 'blendMultiply', 'blendScreen',
  'nameDiffers', 'pathDiffers', 'region', 'mesh', 'linkedmesh', 'boundingbox', 'clipping', 'path', 'inactiveBone', 'sliderKeysSlot',
] as const;
export type SlotCensusField = (typeof SLOT_CENSUS_FIELDS)[number];
export type SlotCensusRow = Record<SlotCensusField, number> & { slots: number };

/**
 * The attachments' census fields (issue #931), each a count of slots shown at
 * setup, in the order its table prints them — the header's list.
 */
export const ATTACHMENT_CENSUS_FIELDS = [
  'weightedMesh', 'multiBoneMesh', 'skewedBinding', 'linkedMesh', 'trimmedRegion', 'scaledOrTurnedRegion', 'mirroredRegion', 'sequenceRegion', 'nullAtlas',
  'clipping', 'clipEnd', 'boundingbox', 'path',
] as const;
export type AttachmentCensusField = (typeof ATTACHMENT_CENSUS_FIELDS)[number];
export type AttachmentCensusRow = Record<AttachmentCensusField, number>;

/**
 * The constraints' census fields (issue #938), in the order its table prints
 * them: the ik and transform constraints and what they state, their
 * timelines, and the order effects — a constraint whose target or source is
 * a bone an earlier constraint moved or placed below one, and a bone a
 * world-space transform moved that a later constraint re-poses. Each a count
 * of constraints (or timelines), over the document.
 */
export const CONSTRAINT_CENSUS_FIELDS = [
  'ik', 'ik.oneBone', 'ik.twoBone', 'ik.mixPartial', 'ik.mixZero', 'ik.softness', 'ik.bendNegative', 'ik.compress', 'ik.stretch', 'ik.scaleYUniform', 'ik.scaleYVolume', 'ik.nonNormal', 'ik.nonUniformParent', 'ik.childOffsetY',
  'transform', ...TRANSFORM_PROPERTIES.map((p) => `transform.${p}`), 'transform.crossMapping', 'transform.localSource', 'transform.localTarget', 'transform.additive', 'transform.clamp',
  'transform.fromOffset', 'transform.toOffset', 'transform.toScale', 'transform.offsets', 'transform.mixNegative', 'transform.mixPartial', 'transform.nonNormal',
  'ik.timeline', 'ik.timelineBezier', 'ik.timelineFlags', 'ik.timelineMixPartial', 'ik.timelineSoftness', 'transform.timeline', 'transform.timelineBezier',
  'order.readsMoved', 'order.worldEditReposed', 'skin',
  'physics', 'physics.timeline',
  'slider', 'slider.boneLocal', 'slider.boneWorld', 'slider.boneless', 'slider.additive', 'slider.mixPartial', 'slider.loop', 'slider.keysBone', 'slider.keysSlot', 'slider.timeline',
  'later',
] as const;
export type ConstraintCensusField = (typeof CONSTRAINT_CENSUS_FIELDS)[number];
export type ConstraintCensusRow = Record<ConstraintCensusField, number>;

/**
 * The path constraints' census fields (issue #938, second cut), in the order
 * its table prints them: the constraints and every mode and setting the walk
 * reads, the curve each walks (open or closed, measured at constant speed or
 * off its stated `lengths`, weighted), a percent position beyond an open
 * path's ends (the walk's straight-line extension), which slot bone the
 * offset reads (brought up to date by an earlier constraint's ordering, or
 * the previous pose's), a slot showing no path at setup, and the three
 * timelines. Each a count of path constraints (or timelines), over the
 * document.
 */
export const PATH_CENSUS_FIELDS = [
  'path', 'path.oneBone', 'path.severalBones', 'path.positionFixed', 'path.positionPercent',
  'path.spacingLength', 'path.spacingFixed', 'path.spacingPercent', 'path.spacingProportional', 'path.spacingNegative',
  'path.tangent', 'path.chain', 'path.chainScale', 'path.offsetRotation', 'path.mixPartial', 'path.mixZero',
  'path.open', 'path.closed', 'path.constantSpeed', 'path.statedLengths', 'path.weighted', 'path.beyondEnds',
  'path.slotBoneEarlier', 'path.slotBonePrevious', 'path.noPathShown', 'path.afterConstraint',
  'path.timelinePosition', 'path.timelineSpacing', 'path.timelineMix', 'path.timelineBezier',
] as const;
export type PathCensusField = (typeof PATH_CENSUS_FIELDS)[number];
export type PathCensusRow = Record<PathCensusField, number>;

/** The blocks the core poses, each judged on its own, in the document's order. */
export const GATE_BLOCKS = [
  'setup.bones', 'setup.slots', 'setup.drawOrder', 'setup.attachments', 'setup.clips', 'setup.clipped',
  'animations.bones', 'animations.slots', 'animations.drawOrder', 'animations.attachments', 'animations.clips', 'animations.clipped', 'animations.events',
] as const;
export type GateBlock = (typeof GATE_BLOCKS)[number];

/**
 * The animations' census fields (issue #936), in the order its table prints
 * them: timelines of each bone and slot kind, keys by the curve that leaves
 * them (`linear`, `stepped`, `bezier`, for bones and for slots), the sample
 * times of the gate's options that fall before a timeline's first key and
 * after its last, a bone keyed by two timelines that pose one channel
 * (`translate` and `translatex`, …) — and, since issue #955, construct 4's
 * remainder per kind: deform timelines (weighted, on a path, on a clipping
 * polygon, played by a linked mesh; keys left by a Bézier or a hold; runs
 * that start past 0 or stop short; keys with no run; in a slider's
 * animation), sequence timelines (on a region; in a slider's animation),
 * draw-order timelines (keys restoring the setup order; in a slider's
 * animation), event timelines, and event keys or definitions stating a
 * payload.
 */
export const ANIMATION_CENSUS_FIELDS = [
  ...BONE_TIMELINE_KINDS.map((k) => `bone.${k}`),
  ...SLOT_TIMELINE_KINDS.map((k) => `slot.${k}`),
  'bone.linear', 'bone.stepped', 'bone.bezier', 'slot.linear', 'slot.stepped', 'slot.bezier',
  'beforeFirstKey', 'afterLastKey', 'overlappingBoneChannels',
  'deform', 'deformWeighted', 'deformPath', 'deformClipping', 'deformLinked', 'deformBezier', 'deformStepped', 'deformPartialRun', 'deformEmptyKey', 'deformSlider',
  'sequence', 'sequenceRegion', 'sequenceSlider', 'drawOrder', 'drawOrderEmpty', 'drawOrderSlider', 'events', 'eventPayload',
] as const;

/**
 * The block each field of construct 4's remainder (issue #955) is judged on:
 * a deform moves the attachments' vertices (a clipping polygon's the clips,
 * a walked path's the bones), a slider's deform, frame and order the setup's
 * as well; a sequence reaches the dump only through a region's corners.
 */
export const REMAINDER_CENSUS_BLOCKS: Readonly<Record<string, GateBlock>> = {
  deform: 'animations.attachments', deformWeighted: 'animations.attachments', deformPath: 'animations.bones', deformClipping: 'animations.clips', deformLinked: 'animations.attachments',
  deformBezier: 'animations.attachments', deformStepped: 'animations.attachments', deformPartialRun: 'animations.attachments', deformEmptyKey: 'animations.attachments', deformSlider: 'setup.attachments',
  sequence: 'animations.attachments', sequenceRegion: 'animations.attachments', sequenceSlider: 'setup.attachments',
  drawOrder: 'animations.drawOrder', drawOrderEmpty: 'animations.drawOrder', drawOrderSlider: 'setup.drawOrder', events: 'animations.events', eventPayload: 'animations.events',
};
export type AnimationCensusField = (typeof ANIMATION_CENSUS_FIELDS)[number];
export type AnimationCensusRow = Record<AnimationCensusField, number> & { animations: number };

/** One animation's verdict on each animation block. */
export interface AnimationVerdict {
  name: string;
  bones: BlockVerdict;
  slots: BlockVerdict;
  drawOrder: BlockVerdict;
  attachments: BlockVerdict;
  clips: BlockVerdict;
  clipped: BlockVerdict;
  events: BlockVerdict;
  /** The first difference, on a DIFF. */
  why: string | null;
}

/** An animation's verdicts before any block is judged: every block SKIP. */
const unjudged = (name: string): AnimationVerdict => ({ name, bones: 'SKIP', slots: 'SKIP', drawOrder: 'SKIP', attachments: 'SKIP', clips: 'SKIP', clipped: 'SKIP', events: 'SKIP', why: null });

export type GateVerdict = 'IDENTICAL' | 'SKIP' | 'DIFF' | 'REFUSED';
export type BlockVerdict = 'IDENTICAL' | 'SKIP' | 'DIFF';

export interface GateRow {
  name: string;
  verdict: GateVerdict;
  /** Why: the SKIP's constructs, the DIFF's first difference, the REFUSED's cause; null on IDENTICAL. */
  why: string | null;
  /** Each posed block's own verdict and why; null on a REFUSED row. */
  blocks: Record<GateBlock, { verdict: BlockVerdict; why: string | null }> | null;
  /** Bone-samples `compare` compared (the setup pose's bones, when carried). */
  boneSamples: number;
  /** Slot rows compared (the setup pose's slots, when carried). */
  slotRows: number;
  worstXy: number;
  worstM: number;
  census: CensusRow | null;
  slotCensus: SlotCensusRow | null;
  /** Per animation, each animation block's verdict; empty on a REFUSED row. */
  animations: AnimationVerdict[];
  animationCensus: AnimationCensusRow | null;
  /** Attachment rows and vertices compared (the setup pose's attachments and clips, when carried). */
  attachmentRows: number;
  vertices: number;
  attachmentCensus: AttachmentCensusRow | null;
  constraintCensus: ConstraintCensusRow | null;
  pathCensus: PathCensusRow | null;
  /** The stepped run (issue #956); absent on a REFUSED row. */
  stepped?: SteppedRow;
  /** What the spine-core dump draws under a clip (issue #964); absent on a REFUSED row. */
  clippedCensus?: ClippedCensusRow;
  /** One run per declared skin (issue #932) on a row declaring several; empty on a row declaring one or none, absent on a REFUSED row. */
  perSkin?: SkinRun[];
}

/**
 * One skin's run of a row declaring several (issue #932): both dumps under
 * `--skin <name>`, each posed block judged alone as the merged run's are, and
 * the stepped run under the same skin.
 */
export interface SkinRun {
  skin: string;
  verdict: BlockVerdict;
  /** The DIFF's first difference, or the SKIP's blocks; null on IDENTICAL. */
  why: string | null;
  blocks: Record<GateBlock, { verdict: BlockVerdict; why: string | null }>;
  /** Per animation, each animation block's verdict under this skin. */
  animations: AnimationVerdict[];
  stepped: SteppedRow;
}

/**
 * The clipping census's fields (issue #964), each a count of rows of the
 * spine-core dump's `clipped` blocks — the setup and every sample: a slot
 * drawn under a clip, one the clipper left whole (`clipped` 0), one it cut,
 * and one it cut away entirely (no triangle left).
 */
export const CLIPPED_CENSUS_FIELDS = ['drawn', 'whole', 'cut', 'gone'] as const;
export type ClippedCensusRow = Record<(typeof CLIPPED_CENSUS_FIELDS)[number], number>;

/** The clipping census of one spine-core dump. */
export function clippedCensusOf(spine: OracleDocument): ClippedCensusRow {
  const out: ClippedCensusRow = { drawn: 0, whole: 0, cut: 0, gone: 0 };
  const poses = [spine.setup.clipped ?? [], ...(spine.animations ?? []).flatMap((a) => a.samples.map((x) => x.clipped ?? []))];
  for (const rows of poses) {
    for (const r of rows) {
      out.drawn++;
      if (r[2] === 0) out.whole++;
      else if (r[5].length === 0) out.gone++;
      else out.cut++;
    }
  }
  return out;
}

/**
 * One line per row drawing under a clip, then each field REACHed by a row
 * whose `animations.clipped` (or, with no animation, `setup.clipped`) was
 * compared, or a HOLE.
 */
export function clippedReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const c = r.clippedCensus;
    if (c === undefined || c.drawn === 0) continue;
    out.push(`  CLIP  ${r.name}: ${CLIPPED_CENSUS_FIELDS.map((f) => `${f} ${c[f]}`).join(', ')} — setup.clipped ${r.blocks?.['setup.clipped'].verdict}, animations.clipped ${r.blocks?.['animations.clipped'].verdict}`);
  }
  const judged = rows.filter((r) => r.blocks !== null && r.blocks['setup.clipped'].verdict === 'IDENTICAL' && r.blocks['animations.clipped'].verdict === 'IDENTICAL');
  for (const f of CLIPPED_CENSUS_FIELDS) {
    const on = judged.filter((r) => (r.clippedCensus?.[f] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH clipped ${f}: ${on.join(', ')}` : `  HOLE  clipped ${f}: no compared row reaches it — the core suite's CL probes are its only reading`);
  }
  return out;
}

/** A refusal about an input — the command exits 2 on it. */
export class GateInputError extends Error {}

/** The census of one model document, with reflection read off the spine-core setup pose. */
export function censusOf(modelText: string, reflecting: ReadonlySet<string>): CensusRow {
  const doc = readModel(modelText);
  const modes = Object.fromEntries(CORE_INHERIT_MODES.map((m) => [m, 0])) as CensusRow['modes'];
  const fields = Object.fromEntries(CENSUS_FIELDS.map((f) => [f, 0])) as CensusRow['fields'];
  for (const bone of doc.bones) {
    const mode = bone.inheritMode === undefined ? 'normal' : foldInheritMode(bone.inheritMode);
    if (mode !== null) modes[mode]++;
    for (const f of ['length', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const) if (bone[f] !== undefined) fields[f]++;
    if (bone.skinRequired !== undefined) fields.skinRequired++;
    if ((bone.scaleX ?? 1) < 0 || (bone.scaleY ?? 1) < 0) fields.negativeScale++;
    if (Math.abs(bone.rotation ?? 0) >= 360) fields.rotation360++;
    if (bone.parent !== undefined && reflecting.has(bone.parent)) fields.reflectingParent++;
  }
  return { bones: doc.bones.length, modes, fields };
}

/**
 * The slots' census of one model document — the header's fields, each a count
 * of slots (of skins, for `secondSkin`: the skins after the first). What a
 * slot shows is resolved by the core's own rule (`shownAttachment`), so a
 * field counts what the block the core poses actually carries.
 */
export function slotCensusOf(modelText: string): SlotCensusRow {
  const doc = readModel(modelText);
  const out = { slots: doc.slots.length, ...Object.fromEntries(SLOT_CENSUS_FIELDS.map((f) => [f, 0])) } as SlotCensusRow;
  out.secondSkin = Math.max(0, doc.skins.length - 1);
  const active = activeBones(doc);
  for (const slot of doc.slots) {
    if (slot.setup === null) out.nullSetup++;
    else {
      const filling = doc.skins.filter((k) => k.attachments[slot.name]?.[slot.setup as string] !== undefined).length;
      if (filling === 0) out.unfilled++;
      if (filling > 1) out.multiFilled++;
    }
    if (slot.color !== undefined) out.colour++;
    if (slot.color !== undefined && slot.color.length === 6) out.colour6++;
    if (slot.dark !== undefined) out.dark++;
    if (slot.dark !== undefined && slot.dark.length === 8) out.dark8++;
    if (slot.blend !== undefined) out[`blend${readBlend(slot)}`]++;
    if (!active.has(slot.bone)) out.inactiveBone++;
    const shown = shownAttachment(doc, slot);
    if (shown === null) continue;
    if ('conflict' in shown) {
      out.conflicting++;
      continue;
    }
    const row = shownRow(shown);
    if (row.name !== shown.placeholder) out.nameDiffers++;
    if (shown.record.path !== undefined && shown.record.path !== row.name) out.pathDiffers++;
    out[shown.record.kind]++;
  }
  out.sliderKeysSlot = doc.constraints.filter((c) => c.kind === 'slider' && (doc.animations.find((a) => a.name === c.animation)?.slots.length ?? 0) > 0).length;
  return out;
}

/**
 * The animations' census of one model document — the fields of
 * `ANIMATION_CENSUS_FIELDS`, each a count over every animation; the
 * before/after counts over the gate's sample times (`options`).
 */
export function animationCensusOf(modelText: string, options: OracleOptions = GATE_OPTIONS): AnimationCensusRow {
  const doc = readModel(modelText);
  const out = { animations: doc.animations.length, ...Object.fromEntries(ANIMATION_CENSUS_FIELDS.map((f) => [f, 0])) } as AnimationCensusRow;
  const channelsOf: Record<string, string[]> = {
    translate: ['x', 'y'], translatex: ['x'], translatey: ['y'], scale: ['sx', 'sy'], scalex: ['sx'], scaley: ['sy'],
    shear: ['hx', 'hy'], shearx: ['hx'], sheary: ['hy'], rotate: ['r'], inherit: ['mode'],
  };
  for (const anim of doc.animations) {
    const tl = anim.timelines;
    const times = Array.from({ length: options.samples }, (_v, i) => sampleTime(options.phase, tl.duration, i, options.samples));
    const each = (group: 'bone' | 'slot', kind: string, keys: ReadonlyArray<{ time: number; curve: unknown }>): void => {
      out[`${group}.${kind}` as AnimationCensusField]++;
      keys.forEach((k, i) => {
        if (i === keys.length - 1 || kind === 'attachment' || kind === 'inherit') return;
        out[`${group}.${k.curve === 'linear' ? 'linear' : k.curve === 'stepped' ? 'stepped' : 'bezier'}` as AnimationCensusField]++;
      });
      out.beforeFirstKey += times.filter((t) => t < keys[0].time).length;
      out.afterLastKey += times.filter((t) => t > keys[keys.length - 1].time).length;
    };
    for (const b of tl.bones) {
      for (const x of b.timelines) each('bone', x.kind, x.keys);
      const channels = b.timelines.flatMap((x) => channelsOf[x.kind] ?? []);
      if (new Set(channels).size < channels.length) out.overlappingBoneChannels++;
    }
    for (const sl of tl.slots) for (const x of sl.timelines) each('slot', x.kind, x.keys);
    // Construct 4's remainder (issue #955): each deform and sequence timeline by what it keys, the draw order and the events.
    const sliding = doc.constraints.some((c) => c.kind === 'slider' && c.animation === anim.name);
    for (const a of tl.attachments) {
      const record = doc.skins.find((k) => k.name === a.skin)?.attachments[a.slot]?.[a.attachment];
      const g = record?.geometry;
      const keys = a.deform;
      if (keys !== null) {
        out.deform++;
        const vertices = g !== undefined && g.kind !== 'region' && g.kind !== 'linkedmesh' ? g.vertices : null;
        if (vertices?.weighted === true) out.deformWeighted++;
        if (g?.kind === 'path') out.deformPath++;
        if (g?.kind === 'clipping') out.deformClipping++;
        if (doc.skins.some((k) => Object.values(k.attachments).some((t) => Object.values(t).some((r) => r.geometry?.kind === 'linkedmesh' && r.timelines === true && r.geometry.skin === a.skin && r.geometry.slot === a.slot && r.geometry.source === a.attachment)))) out.deformLinked++;
        const length = vertices === null ? 0 : vertices.weighted ? 2 * vertices.bindings.reduce((n, b) => n + b.length, 0) : vertices.xy.length;
        keys.forEach((k, i) => {
          if (i < keys.length - 1 && Array.isArray(k.curve)) out.deformBezier++;
          if (i < keys.length - 1 && k.curve === 'stepped') out.deformStepped++;
          if (k.vertices.length === 0) out.deformEmptyKey++;
          else if (k.offset > 0 || k.vertices.length < length) out.deformPartialRun++;
        });
        if (sliding) out.deformSlider++;
      }
      if (a.sequence !== null) {
        out.sequence++;
        if (g?.kind === 'region') out.sequenceRegion++;
        if (sliding) out.sequenceSlider++;
      }
    }
    if (tl.drawOrder.length > 0) {
      out.drawOrder++;
      out.drawOrderEmpty += tl.drawOrder.filter((k) => k.moves.length === 0).length;
      if (sliding) out.drawOrderSlider++;
    }
    if (tl.events.length > 0) out.events++;
  }
  // An event key or definition stating a payload the row carries: the int, float or string a fired row reads.
  const raw = JSON.parse(modelText) as { events?: Array<Record<string, unknown>>; animations?: Array<{ events?: Array<Record<string, unknown>> }> };
  const payload = (e: Record<string, unknown>): boolean => e.int !== undefined || e.float !== undefined || e.string !== undefined;
  out.eventPayload = (raw.events ?? []).filter(payload).length + (raw.animations ?? []).reduce((n, a) => n + (a.events ?? []).filter(payload).length, 0);
  return out;
}

/**
 * The constraints' census of one model document (issue #938) — the fields of
 * `CONSTRAINT_CENSUS_FIELDS`. The physics fields count the constraints and
 * their timelines (posed under `Physics.none`, where they apply nothing); the
 * slider fields its forms — a dial read locally or in world space, or no dial —
 * its flags, what its animation keys and its timelines. A path constraint is
 * counted in the paths' census (`pathCensusOf`) and enters the order effects
 * here. `later` counts the constraints of the kinds no cut poses yet
 * (`ADMITTED_CONSTRAINT_KINDS`; since the path cut, none).
 */
export function constraintCensusOf(modelText: string): ConstraintCensusRow {
  const doc = readModel(modelText);
  const out = Object.fromEntries(CONSTRAINT_CENSUS_FIELDS.map((f) => [f, 0])) as ConstraintCensusRow;
  const byName = new Map(doc.bones.map((b) => [b.name, b]));
  const parentOf = (n: string): string | undefined => byName.get(n)?.parent;
  const under = (n: string, top: string): boolean => {
    for (let at: string | undefined = n; at !== undefined; at = parentOf(at)) if (at === top) return true;
    return false;
  };
  const nonNormal = (n: string): boolean => (byName.get(n)?.inheritMode ?? 'normal').toLowerCase() !== 'normal';
  const moved: string[] = [];
  const inWorld: string[] = [];
  for (const c of doc.constraints) {
    const r = c.record;
    if (r === undefined || !ADMITTED_CONSTRAINT_KINDS.includes(c.kind)) {
      out.later++;
      continue;
    }
    if (r.kind === 'path') {
      // Counted in the paths' census (`pathCensusOf`); a path moves its bones in world space, which later constraints read.
      moved.push(...r.bones);
      inWorld.push(...r.bones);
      continue;
    }
    if (r.skin) out.skin++;
    if (r.kind === 'physics') {
      out.physics++;
      continue;
    }
    if (r.kind === 'slider') {
      out.slider++;
      if (r.bone === null) out['slider.boneless']++;
      else out[r.local ? 'slider.boneLocal' : 'slider.boneWorld']++;
      if (r.additive) out['slider.additive']++;
      if (r.mix !== 0 && r.mix !== 1) out['slider.mixPartial']++;
      if (r.loop) out['slider.loop']++;
      if (r.timelines.bones.length > 0) out['slider.keysBone']++;
      if (r.timelines.slots.length > 0) out['slider.keysSlot']++;
      moved.push(...r.timelines.bones.map((b) => b.name));
      continue;
    }
    const read = r.kind === 'ik' ? r.target : r.source;
    if (moved.some((m) => under(read, m))) out['order.readsMoved']++;
    if (inWorld.some((w) => r.bones.some((b) => under(w, b) && w !== b))) out['order.worldEditReposed']++;
    moved.push(...r.bones);
    if (r.kind === 'ik') {
      out.ik++;
      out[r.bones.length === 1 ? 'ik.oneBone' : 'ik.twoBone']++;
      if (r.mix === 0) out['ik.mixZero']++;
      else if (r.mix !== 1) out['ik.mixPartial']++;
      if (r.softness !== 0) out['ik.softness']++;
      if (!r.bendPositive) out['ik.bendNegative']++;
      if (r.compress) out['ik.compress']++;
      if (r.stretch) out['ik.stretch']++;
      if (r.scaleY === 'uniform') out['ik.scaleYUniform']++;
      if (r.scaleY === 'volume') out['ik.scaleYVolume']++;
      if (r.bones.some(nonNormal)) out['ik.nonNormal']++;
      if (r.bones.length === 2) {
        const p = byName.get(r.bones[0]);
        if (p !== undefined && Math.abs(Math.abs(p.scaleX ?? 1) - Math.abs(p.scaleY ?? 1)) > 0.00001) out['ik.nonUniformParent']++;
        if ((byName.get(r.bones[1])?.y ?? 0) !== 0) out['ik.childOffsetY']++;
      }
      continue;
    }
    out.transform++;
    const driven = new Set(r.properties.flatMap((f) => f.to.map((t) => t.property)));
    for (const p of driven) out[`transform.${p}` as ConstraintCensusField]++;
    if (r.properties.some((f) => f.to.some((t) => t.property !== f.property))) out['transform.crossMapping']++;
    if (r.localSource) out['transform.localSource']++;
    if (r.localTarget) out['transform.localTarget']++;
    if (r.additive) out['transform.additive']++;
    if (r.clamp) out['transform.clamp']++;
    if (r.properties.some((f) => f.offset !== 0)) out['transform.fromOffset']++;
    if (r.properties.some((f) => f.to.some((t) => t.offset !== 0))) out['transform.toOffset']++;
    if (r.properties.some((f) => f.to.some((t) => t.scale !== 1))) out['transform.toScale']++;
    if (TRANSFORM_PROPERTIES.some((p) => r.offsets[p] !== 0)) out['transform.offsets']++;
    if ([...driven].some((p) => r.mixes[p] < 0)) out['transform.mixNegative']++;
    if ([...driven].some((p) => r.mixes[p] !== 0 && r.mixes[p] !== 1)) out['transform.mixPartial']++;
    if (r.bones.some(nonNormal)) out['transform.nonNormal']++;
    if (!r.localTarget) inWorld.push(...r.bones);
  }
  for (const a of doc.animations) {
    for (const tl of a.constraints.ik) {
      out['ik.timeline']++;
      if (tl.keys.some((k, i) => i < tl.keys.length - 1 && Array.isArray(k.curve))) out['ik.timelineBezier']++;
      if (tl.keys.some((k) => JSON.stringify(k.flags) !== JSON.stringify(tl.keys[0].flags))) out['ik.timelineFlags']++;
      if (tl.keys.some((k) => k.values[0] !== 0 && k.values[0] !== 1)) out['ik.timelineMixPartial']++;
      if (tl.keys.some((k) => k.values[1] !== 0)) out['ik.timelineSoftness']++;
    }
    for (const tl of a.constraints.transform) {
      out['transform.timeline']++;
      if (tl.keys.some((k, i) => i < tl.keys.length - 1 && Array.isArray(k.curve))) out['transform.timelineBezier']++;
    }
    out['physics.timeline'] += a.constraints.physics;
    for (const tl of a.constraints.slider) out['slider.timeline'] += (tl.time === null ? 0 : 1) + (tl.mix === null ? 0 : 1);
  }
  return out;
}

/**
 * The stepped phase's census of one model document (issue #956) — the
 * fields of `STEPPED_CENSUS_FIELDS`, read off the physics records and the
 * physics timelines.
 */
export function steppedCensusOf(modelText: string): SteppedCensusRow {
  const doc = readModel(modelText);
  const out = Object.fromEntries(STEPPED_CENSUS_FIELDS.map((f) => [f, 0])) as SteppedCensusRow;
  const records = doc.constraints.flatMap((c) => (c.record?.kind === 'physics' ? [c.record as CorePhysicsRecord] : []));
  const parentOf = new Map(doc.bones.map((b) => [b.name, b.parent]));
  const bones = new Set(records.map((r) => r.bone));
  const counted = new Set<string>();
  for (const r of records) {
    for (const f of ['x', 'y', 'rotate', 'scaleX', 'shearX'] as const) if (r[f] > 0) out[f]++;
    if ((['x', 'y', 'rotate', 'scaleX', 'shearX'] as const).some((f) => r[f] < 0)) out.componentNegative++;
    for (const f of ['inertia', 'strength', 'damping', 'wind', 'gravity', 'mix', 'limit'] as const) if (r[f] !== PHYSICS_DEFAULTS[f]) out[f]++;
    if (r.massInverse !== 1 / PHYSICS_DEFAULTS.mass) out.mass++;
    if (r.step !== 1 / PHYSICS_DEFAULTS.fps) out.fps++;
    if (r.mix === 0) out.mixZero++;
    if (records.filter((q) => q.bone === r.bone).length > 1) out.sameBone++;
    for (let at = parentOf.get(r.bone); at !== undefined; at = parentOf.get(at)) {
      if (bones.has(at)) {
        out.chain++;
        break;
      }
    }
    if (r.skin) out.skin++;
  }
  for (const a of doc.animations) {
    for (const tl of a.constraints.physicsKeyed ?? []) {
      out[`timeline.${tl.kind}` as SteppedCensusField]++;
      if (tl.name === EVERY_GLOBAL_PHYSICS) out['timeline.global']++;
      const key = `${a.name}/${tl.name}`;
      if (tl.kind === 'mix' && tl.keys.some((k) => k.values[0] === 0) && !counted.has(key)) {
        counted.add(key);
        out.mixZero++;
      }
    }
  }
  return out;
}

/**
 * The path constraints' census of one model document (issue #938, second
 * cut) — the fields of `PATH_CENSUS_FIELDS`. The slot bone's reading is the
 * core's own plan (`slotBonePlan`), under every skin at once.
 */
export function pathCensusOf(modelText: string): PathCensusRow {
  const doc = readModel(modelText);
  const out = Object.fromEntries(PATH_CENSUS_FIELDS.map((f) => [f, 0])) as PathCensusRow;
  const records = doc.constraints.flatMap((c) => (c.record === undefined ? [] : [c.record]));
  const active = activeBones(doc);
  const skipped = new Set(records.flatMap((r, i) => (r.skin && !r.listedBySkin ? [i] : [])));
  const plan = slotBonePlan(doc.bones, active, records, skipped);
  const byName = new Map(doc.bones.map((b) => [b.name, b]));
  const under = (n: string, top: string): boolean => {
    for (let at: string | undefined = n; at !== undefined; at = byName.get(at)?.parent) if (at === top) return true;
    return false;
  };
  records.forEach((r, i) => {
    if (r.kind !== 'path') return;
    const c: CorePathRecord = r;
    out.path++;
    out[c.bones.length === 1 ? 'path.oneBone' : 'path.severalBones']++;
    out[c.positionMode === 'fixed' ? 'path.positionFixed' : 'path.positionPercent']++;
    out[({ length: 'path.spacingLength', fixed: 'path.spacingFixed', percent: 'path.spacingPercent', proportional: 'path.spacingProportional' } as const)[c.spacingMode]]++;
    if (c.spacing < 0) out['path.spacingNegative']++;
    out[({ tangent: 'path.tangent', chain: 'path.chain', chainScale: 'path.chainScale' } as const)[c.rotateMode]]++;
    if (c.offsetRotation !== 0) out['path.offsetRotation']++;
    const mixes = [c.mixRotate, c.mixX, c.mixY];
    if (mixes.some((m) => m !== 0 && m !== 1)) out['path.mixPartial']++;
    if (mixes.some((m) => m === 0)) out['path.mixZero']++;
    const g = c.path;
    if (g === null) out['path.noPathShown']++;
    else {
      out[g.closed ? 'path.closed' : 'path.open']++;
      out[g.constantSpeed ? 'path.constantSpeed' : 'path.statedLengths']++;
      if (g.vertices.weighted) out['path.weighted']++;
      const keyed = doc.animations.flatMap((a) => a.constraints.path.filter((t) => t.name === c.name).flatMap((t) => (t.position ?? []).map((k) => k.values[0])));
      if (!g.closed && c.positionMode === 'percent' && [c.position, ...keyed].some((v) => v < 0 || v > 1)) out['path.beyondEnds']++;
    }
    const e = plan.get(i) ?? null;
    if (c.offsetRotation !== 0 && e === null) out['path.slotBonePrevious']++;
    else if (c.offsetRotation !== 0 && e !== null && e.at !== i) out['path.slotBoneEarlier']++;
    const reads = [...c.slotDeps, c.slotBone];
    // What an earlier constraint moves: a physics constraint nothing under Physics.none, a slider the bones its animation keys.
    const movedBy = (q: CoreConstraintRecord): readonly string[] => (q.kind === 'physics' ? [] : q.kind === 'slider' ? q.timelines.bones.map((b) => b.name) : q.bones);
    if (records.slice(0, i).some((q, j) => !skipped.has(j) && movedBy(q).some((b) => reads.some((x) => under(x, b))))) out['path.afterConstraint']++;
  });
  for (const a of doc.animations) {
    for (const t of a.constraints.path) {
      if (t.position !== undefined) out['path.timelinePosition']++;
      if (t.spacing !== undefined) out['path.timelineSpacing']++;
      if (t.mix !== undefined) out['path.timelineMix']++;
      if ([t.position, t.spacing, t.mix].some((keys) => keys?.some((k, i) => i < keys.length - 1 && Array.isArray(k.curve)))) out['path.timelineBezier']++;
    }
  }
  return out;
}

/**
 * The attachments' census of one model document (issue #931) — the header's
 * fields, each a count of slots whose setup attachment (resolved by the core's
 * own `shownAttachment`) has it. `reflecting` and `sheared` are the bones
 * whose setup world matrix reflects (determinant below 0) or shears (columns
 * not at right angles), read off the spine-core dump.
 */
export function attachmentCensusOf(modelText: string, reflecting: ReadonlySet<string>, sheared: ReadonlySet<string>): AttachmentCensusRow {
  const doc = readModel(modelText);
  const out = Object.fromEntries(ATTACHMENT_CENSUS_FIELDS.map((f) => [f, 0])) as AttachmentCensusRow;
  const skewed = (bone: string): boolean => reflecting.has(bone) || sheared.has(bone);
  for (const slot of doc.slots) {
    const shown = shownAttachment(doc, slot);
    if (shown === null || 'conflict' in shown) continue;
    const g = shown.record.geometry;
    if (g === undefined) continue;
    if (g.kind === 'boundingbox' || g.kind === 'path') out[g.kind]++;
    if (g.kind === 'region') {
      const r = g.region;
      if (r.atlas === null) out.nullAtlas++;
      else if (r.atlas.offsetX !== 0 || r.atlas.offsetY !== 0 || r.atlas.width !== r.atlas.originalWidth || r.atlas.height !== r.atlas.originalHeight) out.trimmedRegion++;
      if ((r.scaleX ?? 1) !== 1 || (r.scaleY ?? 1) !== 1 || (r.rotation ?? 0) !== 0) out.scaledOrTurnedRegion++;
      if ((r.scaleX ?? 1) < 0 || (r.scaleY ?? 1) < 0 || reflecting.has(slot.bone)) out.mirroredRegion++;
      if (isSequence(modelText, shown.skin, slot.name, shown.placeholder)) out.sequenceRegion++;
    }
    let vertices = g.kind === 'mesh' || g.kind === 'clipping' ? g.vertices : null;
    if (g.kind === 'linkedmesh') {
      out.linkedMesh++;
      const source = doc.skins.find((k) => k.name === g.skin)?.attachments[g.slot]?.[g.source]?.geometry;
      vertices = source?.kind === 'mesh' ? source.vertices : null;
    }
    if (g.kind === 'clipping') {
      out.clipping++;
      if (g.end !== null) out.clipEnd++;
    }
    if (vertices === null || g.kind === 'clipping') continue;
    const bones = vertices.weighted ? [...new Set(vertices.bindings.flatMap((v) => v.map((b) => b.bone)))] : [slot.bone];
    if (vertices.weighted) out.weightedMesh++;
    if (bones.length > 1) out.multiBoneMesh++;
    if (bones.some(skewed)) out.skewedBinding++;
  }
  return out;
}

/** Whether the record at skin/slot/placeholder states a `sequence` — read off the text, since the core keeps only the setup frame's rectangle. */
function isSequence(modelText: string, skin: string, slot: string, placeholder: string): boolean {
  const doc = JSON.parse(modelText) as { skins: Array<{ name: string; attachments: Record<string, Record<string, { sequence?: unknown }>> }> };
  return doc.skins.find((k) => k.name === skin)?.attachments[slot]?.[placeholder]?.sequence !== undefined;
}

/** The core's document with every posed block but `keep` left out — so a `compare` judges that block alone. */
function only(core: OracleDocument, keep: GateBlock): OracleDocument {
  const drop = GATE_BLOCKS.filter((b) => b !== keep);
  const absent = [...(core.absent ?? [])];
  const setup = { ...core.setup };
  let animations = core.animations;
  for (const block of drop) {
    if (block === 'setup.bones') setup.bones = null;
    else if (block === 'setup.slots') setup.slots = null;
    else if (block === 'setup.drawOrder') setup.drawOrder = null;
    else if (block === 'setup.attachments') setup.attachments = null;
    else if (block === 'setup.clips') setup.clips = null;
    else if (block === 'setup.clipped') setup.clipped = null;
    else {
      const field = block.slice('animations.'.length);
      animations = (animations ?? []).map((a) => ({ ...a, samples: a.samples.map((x) => ({ ...x, [field]: null })) }));
    }
    if (!absent.some((x) => x[0] === block)) absent.push([block, 'left out by core_gate to judge another block alone']);
  }
  absent.sort((x, y) => ORACLE_BLOCKS.indexOf(x[0] as OracleBlock) - ORACLE_BLOCKS.indexOf(y[0] as OracleBlock));
  return { ...core, absent, setup, animations };
}

/**
 * The stepped run of one build (issue #956): both dumps again under
 * `STEPPED_OPTIONS`, the setup bones and the samples' bones each judged
 * alone — the physics parameter block with them — then the whole document
 * (every block the core writes, #955's among them), the `dt` both documents
 * state, and the steps the core's schedule takes between samples.
 */
export function steppedRun(skeletonText: string, atlasText: string, skeletonPath: string, modelText: string, modelPath: string, plant: TimelinePlant, tol: { xy: number; m: number }, skin: string = STEPPED_OPTIONS.skin): SteppedRow {
  const options: OracleOptions = { ...STEPPED_OPTIONS, skin };
  const spine = dumpSkeleton(loadOracleData(skeletonText, atlasText, skeletonPath), options);
  const doc = readModel(modelText, modelPath);
  const core = coreDump(doc, options, plant);
  const census = steppedCensusOf(modelText);
  const dt = spine.options.dt === core.options.dt ? core.options.dt : null;
  const steps = doc.animations.map((a) => ({ animation: a.name, counts: stepSchedule(STEPPED_OPTIONS.phase, a.timelines.duration, STEPPED_OPTIONS.samples, STEPPED_OPTIONS.dt as number).map((x) => x.length) }));
  if (dt === null) return { verdict: 'DIFF', why: `the two documents state dt ${spine.options.dt} and ${core.options.dt}`, dt, boneSamples: 0, steps, census };
  const skipped: string[] = [];
  let boneSamples = 0;
  for (const block of ['setup.bones', 'animations.bones'] as const) {
    const why = core.absent?.find((x) => x[0] === block)?.[1];
    if (why !== undefined) {
      skipped.push(`${block}: ${why}`);
      continue;
    }
    const alone = compareDumps(spine, only(core, block), tol);
    if (!alone.identical) return { verdict: 'DIFF', why: `${block}: ${alone.first}`, dt, boneSamples, steps, census };
    boneSamples += alone.boneSamples;
  }
  // Every other block the core writes under the step (issue #955's attachments, clips, draw order and events among them) compared whole; a block the core leaves out is SKIP there, not a difference.
  const whole = compareDumps(spine, core, tol);
  if (!whole.identical) return { verdict: 'DIFF', why: `the whole document: ${whole.first}`, dt, boneSamples, steps, census };
  return skipped.length === 0 ? { verdict: 'IDENTICAL', why: null, dt, boneSamples, steps, census } : { verdict: 'SKIP', why: skipped.join(' | '), dt, boneSamples, steps, census };
}

/** One built row: both dumps, the comparisons — whole and per block — and the census. `plant` replaces a part of the core (a control's plant). */
export function gateBuild(name: string, outDir: string, plant: TimelinePlant = {}): GateRow {
  const skeleton = join(outDir, 'skeleton.json');
  const atlas = join(outDir, 'skeleton.atlas');
  const model = join(outDir, MODEL_DOCUMENT_FILE);
  const missing = [skeleton, atlas, model].filter((p) => !existsSync(p));
  const refused = (why: string): GateRow => ({ name, verdict: 'REFUSED', why, blocks: null, boneSamples: 0, slotRows: 0, worstXy: 0, worstM: 0, census: null, slotCensus: null, attachmentRows: 0, vertices: 0, attachmentCensus: null, constraintCensus: null, pathCensus: null, animations: [], animationCensus: null });
  if (missing.length > 0) return refused(`the build wrote no ${missing.map((p) => p.slice(outDir.length + 1)).join(', ')}`);
  let c: OracleComparison;
  let census: CensusRow;
  let slotCensus: SlotCensusRow;
  let animationCensus: AnimationCensusRow;
  const blocks = {} as Record<GateBlock, { verdict: BlockVerdict; why: string | null }>;
  const perAnimation = new Map<string, AnimationVerdict>();
  let slotRows = 0;
  let attachmentCensus: AttachmentCensusRow;
  let constraintCensus: ConstraintCensusRow;
  let pathCensus: PathCensusRow;
  let stepped: SteppedRow;
  let attachmentRows = 0;
  let clippedCensus: ClippedCensusRow;
  const perSkin: SkinRun[] = [];
  // What the per-skin runs compared, added to the merged run's figures.
  const extra = { boneSamples: 0, slotRows: 0, attachmentRows: 0, worstXy: 0, worstM: 0 };
  try {
    const spine = dumpSkeleton(loadOracleData(readFileSync(skeleton, 'utf8'), readFileSync(atlas, 'utf8'), skeleton), GATE_OPTIONS);
    const modelText = readFileSync(model, 'utf8');
    const modelDoc = readModel(modelText, model);
    const core = coreDump(modelDoc, GATE_OPTIONS, plant);
    const tol = { xy: ORACLE_DEFAULT_TOL, m: ORACLE_DEFAULT_TOL };
    c = compareDumps(spine, core, tol);
    clippedCensus = clippedCensusOf(spine);
    const judged = judgeBlocks(spine, core, tol);
    Object.assign(blocks, judged.blocks);
    for (const [k, v] of judged.animations) perAnimation.set(k, v);
    // A row declaring several skins is posed once per skin as well (issue #932): the merged view is an artefact of the instrument, each skin a state a runtime is in.
    if (modelDoc.skins.length > 1) {
      for (const k of modelDoc.skins) {
        const options: OracleOptions = { ...GATE_OPTIONS, skin: k.name };
        const spineK = dumpSkeleton(loadOracleData(readFileSync(skeleton, 'utf8'), readFileSync(atlas, 'utf8'), skeleton), options);
        const coreK = coreDump(modelDoc, options, plant);
        const whole = compareDumps(spineK, coreK, tol);
        const j = judgeBlocks(spineK, coreK, tol);
        const skippedK = GATE_BLOCKS.filter((b) => j.blocks[b].verdict === 'SKIP');
        extra.boneSamples += whole.boneSamples;
        extra.worstXy = Math.max(extra.worstXy, whole.worstXy);
        extra.worstM = Math.max(extra.worstM, whole.worstM);
        if (j.blocks['setup.slots'].verdict !== 'SKIP') extra.slotRows += coreK.setup.slots?.length ?? 0;
        if (j.blocks['setup.attachments'].verdict !== 'SKIP') extra.attachmentRows += coreK.setup.attachments?.length ?? 0;
        if (j.blocks['setup.clips'].verdict !== 'SKIP') extra.attachmentRows += coreK.setup.clips?.length ?? 0;
        const steppedK = steppedRun(readFileSync(skeleton, 'utf8'), readFileSync(atlas, 'utf8'), skeleton, modelText, model, plant, tol, k.name);
        perSkin.push({
          skin: k.name,
          verdict: !whole.identical ? 'DIFF' : skippedK.length > 0 ? 'SKIP' : 'IDENTICAL',
          why: !whole.identical ? whole.first : skippedK.length > 0 ? skippedK.map((b) => `${b}: ${j.blocks[b].why}`).join(' | ') : null,
          blocks: j.blocks,
          animations: [...j.animations.values()],
          stepped: steppedK,
        });
      }
      promotePerSkin(blocks, perAnimation, perSkin);
    }
    if (core.setup.slots !== null) slotRows = core.setup.slots.length;
    attachmentRows = (core.setup.attachments?.length ?? 0) + (core.setup.clips?.length ?? 0);
    const reflecting = new Set(spine.setup.bones.filter((b) => b[3] !== null && b[4] !== null && b[5] !== null && b[6] !== null && b[3] * b[6] - b[4] * b[5] < 0).map((b) => b[0]));
    census = censusOf(modelText, reflecting);
    slotCensus = slotCensusOf(modelText);
    animationCensus = animationCensusOf(modelText);
    const sheared = new Set(spine.setup.bones.filter((b) => b[3] !== null && b[4] !== null && b[5] !== null && b[6] !== null && Math.abs(b[3] * b[4] + b[5] * b[6]) > 1e-6).map((b) => b[0]));
    attachmentCensus = attachmentCensusOf(modelText, reflecting, sheared);
    constraintCensus = constraintCensusOf(modelText);
    pathCensus = pathCensusOf(modelText);
    stepped = steppedRun(readFileSync(skeleton, 'utf8'), readFileSync(atlas, 'utf8'), skeleton, modelText, model, plant, tol);
  } catch (err) {
    if (err instanceof OracleInputError || err instanceof CoreInputError) return refused(err.message);
    throw err;
  }
  const animations = [...perAnimation.values()];
  const setupRow = c.rows.find((x) => x.name === '(setup)');
  const base = {
    name, blocks, boneSamples: c.boneSamples + extra.boneSamples, slotRows: slotRows + extra.slotRows, worstXy: Math.max(c.worstXy, extra.worstXy), worstM: Math.max(c.worstM, extra.worstM), census, slotCensus,
    attachmentRows: attachmentRows + extra.attachmentRows, vertices: setupRow?.vertices ?? 0, attachmentCensus, constraintCensus, pathCensus, animations, animationCensus, stepped: combineStepped(stepped, perSkin), clippedCensus, perSkin,
  };
  if (!c.identical) return { ...base, verdict: 'DIFF', why: c.first };
  const redSkin = perSkin.find((k) => k.verdict === 'DIFF');
  if (redSkin !== undefined) return { ...base, verdict: 'DIFF', why: `--skin ${JSON.stringify(redSkin.skin)}: ${redSkin.why}` };
  const skipped = GATE_BLOCKS.filter((b) => blocks[b].verdict === 'SKIP');
  if (skipped.length > 0) return { ...base, verdict: 'SKIP', why: skipped.map((b) => `${b}: ${blocks[b].why}`).join(' | ') };
  return { ...base, verdict: 'IDENTICAL', why: null };
}

/** Each posed block of one pair of dumps judged alone — the core's side with every other posed block left out — and each animation's verdict on each sample block. */
function judgeBlocks(spine: OracleDocument, core: OracleDocument, tol: { xy: number; m: number }): { blocks: Record<GateBlock, { verdict: BlockVerdict; why: string | null }>; animations: Map<string, AnimationVerdict> } {
  const blocks = {} as Record<GateBlock, { verdict: BlockVerdict; why: string | null }>;
  const perAnimation = new Map<string, AnimationVerdict>();
  for (const block of GATE_BLOCKS) {
    const why = core.absent?.find((x) => x[0] === block)?.[1];
    if (why !== undefined) {
      blocks[block] = { verdict: 'SKIP', why };
      continue;
    }
    const alone = compareDumps(spine, only(core, block), tol);
    blocks[block] = alone.identical ? { verdict: 'IDENTICAL', why: null } : { verdict: 'DIFF', why: alone.first };
    if (block.startsWith('animations.')) {
      const field = block.slice('animations.'.length) as SampleField;
      for (const row of alone.rows) {
        if (row.name === '(setup)') continue;
        const v = perAnimation.get(row.name) ?? unjudged(row.name);
        const verdict: BlockVerdict = row.findings.length === 0 ? 'IDENTICAL' : 'DIFF';
        v[field] = verdict;
        if (verdict === 'DIFF' && v.why === null) v.why = row.findings[0];
        perAnimation.set(row.name, v);
      }
    }
  }
  for (const a of core.animations ?? []) if (!perAnimation.has(a.name)) perAnimation.set(a.name, unjudged(a.name));
  return { blocks, animations: perAnimation };
}

type SampleField = 'bones' | 'slots' | 'drawOrder' | 'attachments' | 'clips' | 'clipped' | 'events';

/**
 * A block the merged run (`--skin all`) leaves out and EVERY per-skin run
 * poses is judged by the per-skin runs (issue #932): the merged view's
 * absence was then about merging — a placeholder several skins fill, whose
 * winner is the Spine file's skin order — and every state a runtime is
 * actually in was compared. It reads DIFF when any skin's does, else
 * IDENTICAL, and says it was judged per skin; each animation's verdict on a
 * sample block is taken the same way. A block some skin's run leaves out
 * too stays SKIP with the merged run's reason.
 */
function promotePerSkin(blocks: Record<GateBlock, { verdict: BlockVerdict; why: string | null }>, perAnimation: Map<string, AnimationVerdict>, runs: readonly SkinRun[]): void {
  for (const block of GATE_BLOCKS) {
    if (blocks[block].verdict !== 'SKIP' || runs.some((k) => k.blocks[block].verdict === 'SKIP')) continue;
    const red = runs.find((k) => k.blocks[block].verdict === 'DIFF');
    const judged = `judged per skin (${runs.map((k) => `${k.skin} ${k.blocks[block].verdict}`).join(', ')}); the merged view leaves it out — ${blocks[block].why}`;
    blocks[block] = red === undefined ? { verdict: 'IDENTICAL', why: judged } : { verdict: 'DIFF', why: `--skin ${JSON.stringify(red.skin)}: ${red.blocks[block].why}` };
    if (!block.startsWith('animations.')) continue;
    const field = block.slice('animations.'.length) as SampleField;
    for (const [name, v] of perAnimation) {
      const theirs = runs.map((k) => k.animations.find((a) => a.name === name));
      const diff = theirs.find((a) => a !== undefined && a[field] === 'DIFF');
      v[field] = diff !== undefined ? 'DIFF' : theirs.every((a) => a !== undefined && a[field] === 'IDENTICAL') ? 'IDENTICAL' : v[field];
      if (diff !== undefined && v.why === null) v.why = diff.why;
    }
  }
}

/**
 * The row's stepped verdict with its per-skin runs (issue #932): DIFF when any
 * skin's is; a merged SKIP every skin's run judged IDENTICAL reads IDENTICAL,
 * saying so; otherwise the merged run's.
 */
function combineStepped(merged: SteppedRow, runs: readonly SkinRun[]): SteppedRow {
  if (runs.length === 0) return merged;
  const red = runs.find((k) => k.stepped.verdict === 'DIFF');
  if (merged.verdict !== 'DIFF' && red !== undefined) return { ...merged, verdict: 'DIFF', why: `--skin ${JSON.stringify(red.skin)}: ${red.stepped.why}` };
  if (merged.verdict === 'SKIP' && runs.every((k) => k.stepped.verdict === 'IDENTICAL')) {
    return { ...merged, verdict: 'IDENTICAL', why: `judged per skin (${runs.map((k) => `${k.skin} IDENTICAL`).join(', ')}); the merged view leaves it out — ${merged.why}`, boneSamples: merged.boneSamples + runs.reduce((n, k) => n + k.stepped.boneSamples, 0) };
  }
  return merged;
}

/** One recipe built: its name, its `{{out}}` and the chain's exit codes. */
export interface BuiltRow {
  name: string;
  out: string;
  exits: Array<number | null>;
}

/** Every recipe built into `work` (`runRecipes`' layout), in name order. */
export function buildRecipes(recipes: readonly Recipe[], work: string, root: string, progress: (line: string) => void = () => {}): BuiltRow[] {
  const built = runRecipes(recipes, work, root, progress);
  const width = String(recipes.length).length;
  return built.recipes.map((r, i) => ({ name: r.name, out: join(work, String(i).padStart(width, '0'), 'out'), exits: r.exits }));
}

/** Built rows gated; `plant` replaces a part of the core on every row (a control's plant). */
export function gateBuilt(built: readonly BuiltRow[], plant: TimelinePlant = {}): GateRow[] {
  return built.map((r) =>
    r.exits.some((e) => e !== 0)
      ? { name: r.name, verdict: 'REFUSED' as const, why: `the build chain exited ${JSON.stringify(r.exits)}`, blocks: null, boneSamples: 0, slotRows: 0, worstXy: 0, worstM: 0, census: null, slotCensus: null, attachmentRows: 0, vertices: 0, attachmentCensus: null, constraintCensus: null, pathCensus: null, animations: [], animationCensus: null }
      : gateBuild(r.name, r.out, plant),
  );
}

/** Every recipe built into `work` and gated, in name order. */
export function gateRecipes(recipes: readonly Recipe[], work: string, root: string, progress: (line: string) => void = () => {}, plant: TimelinePlant = {}): GateRow[] {
  return gateBuilt(buildRecipes(recipes, work, root, progress), plant);
}

/** The census as a markdown table, one row per recipe, then the totals. */
export function censusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'setup.bones', 'bones', ...CORE_INHERIT_MODES, ...CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 2 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(head.length - 2).fill(0);
  for (const row of rows) {
    const c = row.census;
    const cells = c === null ? head.slice(2).map(() => '—') : [c.bones, ...CORE_INHERIT_MODES.map((m) => c.modes[m]), ...CENSUS_FIELDS.map((f) => c.fields[f])].map(String);
    if (c !== null) [c.bones, ...CORE_INHERIT_MODES.map((m) => c.modes[m]), ...CENSUS_FIELDS.map((f) => c.fields[f])].forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['setup.bones'].verdict ?? row.verdict} | ${cells.join(' | ')} |`);
  }
  out.push(`| **all** | | ${total.join(' | ')} |`);
  return out;
}

/** The slots' census as a markdown table, one row per recipe, then the totals. */
export function slotCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'setup.slots', 'slots', ...SLOT_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 2 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(head.length - 2).fill(0);
  for (const row of rows) {
    const c = row.slotCensus;
    const values = c === null ? null : [c.slots, ...SLOT_CENSUS_FIELDS.map((f) => c[f])];
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['setup.slots'].verdict ?? row.verdict} | ${(values ?? head.slice(2).map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | ${total.join(' | ')} |`);
  return out;
}

/** The animations' census as a markdown table, one row per recipe, then the totals. */
export function animationCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'animations.bones', 'animations.slots', 'animations', ...ANIMATION_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 3 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(head.length - 3).fill(0);
  for (const row of rows) {
    const c = row.animationCensus;
    const values = c === null ? null : [c.animations, ...ANIMATION_CENSUS_FIELDS.map((f) => c[f])];
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['animations.bones'].verdict ?? row.verdict} | ${row.blocks?.['animations.slots'].verdict ?? row.verdict} | ${(values ?? head.slice(3).map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | | ${total.join(' | ')} |`);
  return out;
}

/**
 * Each animation census field the compared rows reach — a bone field on a row
 * whose `animations.bones` was compared, a slot field on one whose
 * `animations.slots` was, a field of construct 4's remainder on one whose
 * block (`REMAINDER_CENSUS_BLOCKS`) was — and the HOLEs: what no compared row
 * reaches. Since issue #955 no timeline kind is left to a later construct.
 */
export function animationReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const f of ANIMATION_CENSUS_FIELDS) {
    const block: GateBlock = REMAINDER_CENSUS_BLOCKS[f] ?? (f.startsWith('slot.') ? 'animations.slots' : 'animations.bones');
    const compared = comparedOn(rows, block);
    const on = compared.filter((r) => (r.animationCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.animationCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const where = f in REMAINDER_CENSUS_BLOCKS ? ` (judged on ${block})` : '';
    out.push(on.length > 0 ? `  REACH animations ${f}: ${on.length} compared row(s)${where}` : `  HOLE  animations ${f}: no compared row reaches it${where}${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/**
 * Per timeline kind of construct 4's remainder (issue #955) — deform,
 * sequence, draw order, events — the rows carrying one that are judged on
 * the block it changes, with their verdict, and those left SKIP, named: the
 * kind is admitted where every row carrying it reads IDENTICAL.
 */
export function timelineKindLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const kind of ['deform', 'sequence', 'drawOrder', 'events'] as const) {
    const block = REMAINDER_CENSUS_BLOCKS[kind];
    const carrying = rows.filter((r) => (r.animationCensus?.[kind] ?? 0) > 0);
    const judged = carrying.filter((r) => r.blocks !== null && r.blocks[block].verdict !== 'SKIP');
    const skipped = carrying.filter((r) => !judged.includes(r));
    out.push(`  KIND  ${kind} (${block}): ${judged.length} row(s) judged${judged.length > 0 ? ` (${judged.map((r) => `${r.name} ${r.blocks?.[block].verdict}`).join(', ')})` : ''}; ${skipped.length} SKIP${skipped.length > 0 ? ` (${skipped.map((r) => r.name).join(', ')})` : ''}`);
  }
  return out;
}

/** The rows whose `block` was compared — IDENTICAL or DIFF on it. */
function comparedOn(rows: readonly GateRow[], block: GateBlock): GateRow[] {
  return rows.filter((r) => r.blocks !== null && r.blocks[block].verdict !== 'SKIP');
}

/** Each slot field the rows whose `setup.slots` was compared reach, and the HOLEs. */
export function slotReachLines(rows: readonly GateRow[]): string[] {
  const compared = comparedOn(rows, 'setup.slots');
  const out: string[] = [];
  for (const f of SLOT_CENSUS_FIELDS) {
    const on = compared.filter((r) => (r.slotCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.slotCensus?.[f] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH slots ${f}: ${on.length} compared row(s)` : `  HOLE  slots ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/** The attachments' census as a markdown table, one row per recipe, then the totals. */
export function attachmentCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'setup.attachments', 'setup.clips', ...ATTACHMENT_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 3 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(ATTACHMENT_CENSUS_FIELDS.length).fill(0);
  for (const row of rows) {
    const c = row.attachmentCensus;
    const values = c === null ? null : ATTACHMENT_CENSUS_FIELDS.map((f) => c[f]);
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['setup.attachments'].verdict ?? row.verdict} | ${row.blocks?.['setup.clips'].verdict ?? row.verdict} | ${(values ?? ATTACHMENT_CENSUS_FIELDS.map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | | ${total.join(' | ')} |`);
  return out;
}

/**
 * Each attachment field the rows whose block was compared reach, and the
 * HOLEs (issue #931): the clipping fields against `setup.clips`, the rest
 * against `setup.attachments`. A bounding box and a path attachment are HOLEs
 * however many rows show one — the oracle's dump writes no vertices for
 * either — and a `null` rectangle is never compared: the core leaves the block
 * out by name.
 */
export function attachmentReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const f of ATTACHMENT_CENSUS_FIELDS) {
    const block: GateBlock = f === 'clipping' || f === 'clipEnd' ? 'setup.clips' : 'setup.attachments';
    const on = comparedOn(rows, block).filter((r) => (r.attachmentCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.attachmentCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const elsewhere = anywhere.length > 0 ? ` (shown on ${anywhere.join(', ')})` : '';
    if (f === 'boundingbox' || f === 'path') out.push(`  HOLE  attachments ${f}: the oracle's dump writes no vertices for it, so none was judged${elsewhere}`);
    else if (f === 'nullAtlas') out.push(on.length > 0 ? `  REACH attachments ${f}: ${on.length} compared row(s)` : `  HOLE  attachments ${f}: no compared row carries one — the core leaves the block out by name where one is shown${elsewhere}`);
    else if (f === 'trimmedRegion' && on.length === 0) out.push(`  HOLE  attachments ${f}: no compared row reaches it — only a pack that trims does (a private corpus under --recipes)${elsewhere}`);
    else out.push(on.length > 0 ? `  REACH attachments ${f}: ${on.length} compared row(s)` : `  HOLE  attachments ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/** The constraints' census as a markdown table, one row per recipe, then the totals. */
export function constraintCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'setup.bones', 'animations.bones', ...CONSTRAINT_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 3 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(CONSTRAINT_CENSUS_FIELDS.length).fill(0);
  for (const row of rows) {
    const c = row.constraintCensus;
    const values = c === null ? null : CONSTRAINT_CENSUS_FIELDS.map((f) => c[f]);
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['setup.bones'].verdict ?? row.verdict} | ${row.blocks?.['animations.bones'].verdict ?? row.verdict} | ${(values ?? CONSTRAINT_CENSUS_FIELDS.map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | | ${total.join(' | ')} |`);
  return out;
}

/**
 * Each constraint field the compared rows reach — a timeline field on a row
 * whose `animations.bones` was compared, every other on one whose
 * `setup.bones` was — and the HOLEs; `later` is a HOLE however many rows carry
 * one, since no cut judges those kinds yet, and when no kind is left to a
 * later cut it is a `NONE` line saying so. The stepped phase has its own
 * census since issue #956 (`steppedReachLines`).
 */
export function constraintReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const f of CONSTRAINT_CENSUS_FIELDS) {
    const block: GateBlock = f.includes('timeline') ? 'animations.bones' : 'setup.bones';
    const on = comparedOn(rows, block).filter((r) => (r.constraintCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.constraintCensus?.[f] ?? 0) > 0).map((r) => r.name);
    if (f === 'later') {
      const laterKinds = CORE_CONSTRAINT_KINDS.filter((k) => !ADMITTED_CONSTRAINT_KINDS.includes(k));
      out.push(laterKinds.length === 0 ? `  NONE  constraints ${f}: no constraint kind is left to a later cut — ${ADMITTED_CONSTRAINT_KINDS.join(', ')} are all posed` : `  HOLE  constraints ${f}: ${anywhere.length} row(s) declare a ${laterKinds.join(', ')} constraint; those are later cuts and none was judged`);
    }
    else out.push(on.length > 0 ? `  REACH constraints ${f}: ${on.length} compared row(s)` : `  HOLE  constraints ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/**
 * Per constraint kind, the rows now judged — every block compared on a row
 * declaring the kind — and those that stay SKIP, named (issue #938: the
 * seven constrained rows turned green one kind at a time).
 */
export function constraintKindLines(rows: readonly GateRow[], kinds: ReadonlyMap<string, readonly string[]>): string[] {
  const out: string[] = [];
  for (const kind of ['ik', 'transform', 'path', 'physics', 'slider']) {
    const declaring = rows.filter((r) => (kinds.get(r.name) ?? []).includes(kind));
    const judged = declaring.filter((r) => r.blocks !== null && r.blocks['setup.bones'].verdict !== 'SKIP');
    const skipped = declaring.filter((r) => !judged.includes(r));
    out.push(`  KIND  ${kind}: ${judged.length} row(s) judged${judged.length > 0 ? ` (${judged.map((r) => `${r.name} ${r.blocks?.['setup.bones'].verdict}`).join(', ')})` : ''}; ${skipped.length} SKIP${skipped.length > 0 ? ` (${skipped.map((r) => r.name).join(', ')})` : ''}`);
  }
  return out;
}

/** Each mode and field the compared rows reach, and the HOLEs — what no compared row reaches. */
export function reachLines(rows: readonly GateRow[]): string[] {
  const compared = comparedOn(rows, 'setup.bones');
  const out: string[] = [];
  for (const m of CORE_INHERIT_MODES) {
    const on = compared.filter((r) => (r.census?.modes[m] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.census?.modes[m] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH inherit ${m}: ${on.length} compared row(s)` : `  HOLE  inherit ${m}: no compared row states it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  for (const f of CENSUS_FIELDS) {
    const on = compared.filter((r) => (r.census?.fields[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.census?.fields[f] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH ${f}: ${on.length} compared row(s)` : `  HOLE  ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/** The path constraints' census as a markdown table, one row per recipe, then the totals. */
export function pathCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'setup.bones', 'animations.bones', ...PATH_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 3 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(PATH_CENSUS_FIELDS.length).fill(0);
  for (const row of rows) {
    const c = row.pathCensus;
    const values = c === null ? null : PATH_CENSUS_FIELDS.map((f) => c[f]);
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.blocks?.['setup.bones'].verdict ?? row.verdict} | ${row.blocks?.['animations.bones'].verdict ?? row.verdict} | ${(values ?? PATH_CENSUS_FIELDS.map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | | ${total.join(' | ')} |`);
  return out;
}

/**
 * Each path field the compared rows reach — a timeline field on a row whose
 * `animations.bones` was compared, every other on one whose `setup.bones` was
 * — and the HOLEs, each covered by the core suite's `CP` probes.
 */
export function pathReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const f of PATH_CENSUS_FIELDS) {
    const block: GateBlock = f.includes('timeline') ? 'animations.bones' : 'setup.bones';
    const on = comparedOn(rows, block).filter((r) => (r.pathCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.pathCensus?.[f] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH paths ${f}: ${on.length} compared row(s)` : `  HOLE  paths ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
  }
  return out;
}

/** The stepped census as a markdown table, one row per recipe, then the totals. */
export function steppedCensusTable(rows: readonly GateRow[]): string[] {
  const head = ['row', 'stepped', ...STEPPED_CENSUS_FIELDS];
  const out = [`| ${head.join(' | ')} |`, `| ${head.map((_h, i) => (i < 2 ? '---' : '---:')).join(' | ')} |`];
  const total: number[] = new Array<number>(STEPPED_CENSUS_FIELDS.length).fill(0);
  for (const row of rows) {
    const c = row.stepped?.census ?? null;
    const values = c === null ? null : STEPPED_CENSUS_FIELDS.map((f) => c[f]);
    if (values !== null) values.forEach((v, i) => (total[i] += v));
    out.push(`| ${row.name} | ${row.stepped?.verdict ?? row.verdict} | ${(values ?? STEPPED_CENSUS_FIELDS.map(() => '—')).map(String).join(' | ')} |`);
  }
  out.push(`| **all** | | ${total.join(' | ')} |`);
  return out;
}

/**
 * Each stepped field a row judged IDENTICAL under the step reaches, and the
 * HOLEs — what no such row reaches, each covered by the core suite's `CK`
 * probes (issue #956; it replaces the `physics.stepped` HOLE of issue #938).
 */
export function steppedReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const f of STEPPED_CENSUS_FIELDS) {
    const on = rows.filter((r) => r.stepped?.verdict === 'IDENTICAL' && r.stepped.census[f] > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.stepped?.census[f] ?? 0) > 0).map((r) => r.name);
    out.push(on.length > 0 ? `  REACH stepped ${f}: ${on.length} compared row(s)` : `  HOLE  stepped ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the stepped run does not judge IDENTICAL)` : ''}`);
  }
  return out;
}

/**
 * Which rows the per-skin runs judged (issue #932): each row declaring
 * several skins, with its skins, or a HOLE when none does — the merged run
 * then speaks for every row, and the core suite's `CN` probes are the only
 * reading of the per-skin rule.
 */
export function skinReachLines(rows: readonly GateRow[]): string[] {
  const several = rows.filter((r) => (r.perSkin?.length ?? 0) > 0);
  if (several.length === 0) return ['  HOLE  per skin: no row declares several skins, so no per-skin run judged anything (each row\'s one skin is its merged view)'];
  return several.map((r) => `  REACH per skin: ${r.name} — ${(r.perSkin ?? []).map((k) => `${k.skin} ${k.verdict}`).join(', ')}`);
}

/** The verdict line. */
export function gateVerdict(rows: readonly GateRow[]): { ok: boolean; line: string } {
  const count = (v: GateVerdict): number => rows.filter((r) => r.verdict === v).length;
  const on = (block: GateBlock, v: BlockVerdict): number => rows.filter((r) => r.blocks?.[block].verdict === v).length;
  const stepped = (v: BlockVerdict): number => rows.filter((r) => r.stepped?.verdict === v).length;
  const several = rows.filter((r) => (r.perSkin?.length ?? 0) > 0);
  const runs = several.flatMap((r) => r.perSkin ?? []);
  const skin = (v: BlockVerdict): number => runs.filter((k) => k.verdict === v).length;
  const skinStepped = (v: BlockVerdict): number => runs.filter((k) => k.stepped.verdict === v).length;
  const ok = count('DIFF') === 0 && count('REFUSED') === 0 && stepped('DIFF') === 0 && skin('DIFF') === 0 && skinStepped('DIFF') === 0;
  return {
    ok,
    line:
      `${ok ? 'GREEN' : 'RED'} — ${rows.length} row(s): ` +
      GATE_BLOCKS.map((b) => `${b} ${on(b, 'IDENTICAL')} IDENTICAL, ${on(b, 'SKIP')} SKIP, ${on(b, 'DIFF')} DIFF`).join('; ') +
      `; ${count('REFUSED')} REFUSED; stepped (--physics step --dt ${ORACLE_DEFAULT_DT}) bones ${stepped('IDENTICAL')} IDENTICAL, ${stepped('SKIP')} SKIP, ${stepped('DIFF')} DIFF` +
      `; per skin (--skin <name>): ${several.length} row(s) declaring several skins, ${runs.length} skin run(s) ${skin('IDENTICAL')} IDENTICAL, ${skin('SKIP')} SKIP, ${skin('DIFF')} DIFF, stepped ${skinStepped('IDENTICAL')} IDENTICAL, ${skinStepped('SKIP')} SKIP, ${skinStepped('DIFF')} DIFF`,
  };
}

function parseFlags(args: readonly string[], known: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!known.includes(arg)) throw new GateInputError(`unknown argument ${arg}; this command takes ${known.join(', ')}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new GateInputError(`${arg} needs a value`);
    if (flags.has(arg)) throw new GateInputError(`${arg} given twice`);
    flags.set(arg, value);
    i++;
  }
  return flags;
}

/** The command; returns the exit code. */
export function gateMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  try {
    const flags = parseFlags(argv, ['--recipes', '--root', '--work']);
    const root = resolve(flags.get('--root') ?? TREE_ROOT);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new GateInputError(`--root ${root} is not a directory`);
    const named = flags.get('--recipes');
    const recipes = named === undefined ? treeRecipes(root, warn) : readRecipes(named);
    if (recipes.length === 0) throw new GateInputError('no recipes to run');
    const workFlag = flags.get('--work');
    let work: string;
    if (workFlag === undefined) work = mkdtempSync(join(tmpdir(), 'rigc-core-gate-'));
    else {
      work = resolve(workFlag);
      if (existsSync(work) && readdirSync(work).length > 0) throw new GateInputError(`--work ${work} is not empty; every recipe runs in a fresh directory`);
      mkdirSync(work, { recursive: true });
    }
    warn(`core_gate: ${recipes.length} recipe(s), work directory ${work}`);
    const rows = gateRecipes(recipes, work, root, warn);
    for (const row of rows) {
      const blocks = row.blocks === null ? '' : ` [${GATE_BLOCKS.map((b) => `${b} ${row.blocks?.[b].verdict}`).join(', ')}]`;
      print(
        `  ${row.verdict.padEnd(9)} ${row.name}${blocks}: ${row.boneSamples} bone-sample(s), ${row.slotRows} slot row(s) and ${row.attachmentRows} attachment row(s) of ${row.vertices} vertices compared, worst Δxy ${row.worstXy.toFixed(6)}, worst Δabcd ${row.worstM.toFixed(6)}` +
          (row.why === null ? '' : ` — ${row.why}`),
      );
      for (const a of row.animations) print(`              animation ${JSON.stringify(a.name)}: bones ${a.bones}, slots ${a.slots}, drawOrder ${a.drawOrder}, attachments ${a.attachments}, clips ${a.clips}, clipped ${a.clipped}, events ${a.events}${a.why === null ? '' : ` — ${a.why}`}`);
      for (const k of row.perSkin ?? []) {
        print(`              skin ${JSON.stringify(k.skin)}: ${k.verdict} [${GATE_BLOCKS.map((b) => `${b} ${k.blocks[b].verdict}`).join(', ')}], stepped bones ${k.stepped.verdict}${k.why === null ? '' : ` — ${k.why}`}${k.stepped.why === null ? '' : ` — stepped: ${k.stepped.why}`}`);
      }
      const st = row.stepped;
      if (st !== undefined && ((row.constraintCensus?.physics ?? 0) > 0 || st.verdict !== 'IDENTICAL')) {
        print(`              stepped (--physics step, dt ${st.dt} in both documents): bones ${st.verdict}, ${st.boneSamples} bone-sample(s)${st.why === null ? '' : ` — ${st.why}`}`);
        for (const a of st.steps) print(`                steps between samples, ${JSON.stringify(a.animation)}: [${a.counts.join(', ')}] (${a.counts.reduce((x, y) => x + y, 0)} in all)`);
      }
    }
    print('');
    for (const line of censusTable(rows)) print(line);
    print('');
    for (const line of slotCensusTable(rows)) print(line);
    print('');
    for (const line of attachmentCensusTable(rows)) print(line);
    print('');
    for (const line of animationCensusTable(rows)) print(line);
    print('');
    for (const line of constraintCensusTable(rows)) print(line);
    print('');
    for (const line of pathCensusTable(rows)) print(line);
    print('');
    for (const line of steppedCensusTable(rows)) print(line);
    print('');
    for (const line of reachLines(rows)) print(line);
    for (const line of slotReachLines(rows)) print(line);
    for (const line of attachmentReachLines(rows)) print(line);
    for (const line of animationReachLines(rows)) print(line);
    for (const line of constraintReachLines(rows)) print(line);
    for (const line of pathReachLines(rows)) print(line);
    for (const line of steppedReachLines(rows)) print(line);
    for (const line of clippedReachLines(rows)) print(line);
    for (const line of skinReachLines(rows)) print(line);
    const kinds = new Map<string, string[]>();
    for (const row of rows) {
      const path = join(work, String(rows.indexOf(row)).padStart(String(rows.length).length, '0'), 'out', MODEL_DOCUMENT_FILE);
      if (existsSync(path)) kinds.set(row.name, readModel(readFileSync(path, 'utf8')).constraints.map((c) => c.kind));
    }
    for (const line of constraintKindLines(rows, kinds)) print(line);
    for (const line of timelineKindLines(rows)) print(line);
    const verdict = gateVerdict(rows);
    print(verdict.line);
    return verdict.ok ? 0 : 1;
  } catch (err) {
    if (err instanceof GateInputError || err instanceof HashesInputError) {
      warn(`core_gate: ${err.message}`);
      return 2;
    }
    throw err;
  }
}

if (import.meta.main) process.exit(gateMain(process.argv.slice(2)));
