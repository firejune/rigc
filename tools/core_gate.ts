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
 * `setup.bones`, `setup.slots`, `setup.attachments`, `setup.clips`,
 * `animations.bones`, `animations.slots`
 * (`GATE_BLOCKS`) — is judged on its own, by a `compare` of the spine-core
 * dump against the core's with the other posed blocks left out, and reads:
 *
 *   - `IDENTICAL` — the block agrees;
 *   - `SKIP` — the core left the block out, with the construct it names (a
 *     path walking a slot whose placeholder skins fill differently, or
 *     another case `src/core/constraints_path.ts` names, or a slider keying a
 *     constraint timeline, for the bones — every constraint kind is posed
 *     since issue #938; a slider keying a slot on such a row, or skins
 *     disagreeing over a placeholder, for the slots; either of those, a shown
 *     region whose atlas rectangle is `null`, or a slider keying a deform,
 *     for the attachments), so the row holds nothing about it;
 *   - `DIFF` — with the first difference.
 *
 * The row's own verdict is `DIFF` when any block is (or the whole comparison
 * is), `IDENTICAL` when every block is, `SKIP` otherwise — naming the blocks
 * skipped — and `REFUSED` when the build chain exited non-zero or a document
 * could not be read; a refused row is not measured and says why. Under the
 * row, one line per animation (issue #936): its verdict on `animations.bones`
 * and on `animations.slots`, and the first difference of a DIFF.
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
 * its last, a bone keyed by two timelines posing one channel, and the
 * timelines of the groups construct 4 does not pose. A field no row whose
 * animation block was compared reaches is a HOLE, and the later groups'
 * timelines are a HOLE however many rows carry them.
 *
 * And one line per row for the constraints (`CONSTRAINT_CENSUS_FIELDS`, issue
 * #938): the ik and transform constraints and what each states, their
 * timelines, and the update order's two effects — a constraint reading a bone
 * an earlier one moved, and a world-space edit a later one re-poses — each a
 * HOLE when no row whose bones were compared reaches it; the physics
 * constraints and their timelines, and the slider's forms, flags, what its
 * animation keys and its timelines, likewise; the stepped phase of a physics
 * constraint a HOLE by name, since the gate poses `--physics none`; the kinds
 * no cut poses yet (`later`) a HOLE however many rows declare one, and a
 * `NONE` line saying so when no kind is left to a later cut.
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
 * REFUSED; 2 on a bad input, by name. `tools/` is not `src/`: this file runs
 * child processes (through `runRecipes`) and reads the disk.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { activeBones, CORE_INHERIT_MODES, CoreInputError, foldInheritMode, readBlend, readModel, shownAttachment, shownRow } from '../src/core/index.ts';
import { BONE_TIMELINE_KINDS, sampleTime, SLOT_TIMELINE_KINDS, type TimelinePlant } from '../src/core/animation.ts';
import { ADMITTED_CONSTRAINT_KINDS, TRANSFORM_PROPERTIES, type CoreConstraintRecord } from '../src/core/constraints.ts';
import { slotBonePlan, type CorePathRecord } from '../src/core/constraints_path.ts';
import { CORE_CONSTRAINT_KINDS } from '../src/core/index.ts';
import { MODEL_DOCUMENT_FILE } from '../src/model.ts';
import { HashesInputError, readRecipes, runRecipes, TREE_ROOT, treeRecipes, type Recipe } from './emit_hashes.ts';
import {
  compareDumps,
  coreDump,
  dumpSkeleton,
  loadOracleData,
  ORACLE_BLOCKS,
  ORACLE_DEFAULT_SAMPLES,
  ORACLE_DEFAULT_TOL,
  OracleInputError,
  type OracleBlock,
  type OracleComparison,
  type OracleDocument,
  type OracleOptions,
} from './pose_oracle.ts';

/** The options both dumps are taken under: the oracle's defaults. */
export const GATE_OPTIONS: OracleOptions = { phase: 'grid', samples: ORACLE_DEFAULT_SAMPLES, skin: 'all', physics: 'none', dt: null };

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

/** The blocks the core poses, each judged on its own. */
export const GATE_BLOCKS = ['setup.bones', 'setup.slots', 'setup.attachments', 'setup.clips', 'animations.bones', 'animations.slots'] as const;
export type GateBlock = (typeof GATE_BLOCKS)[number];

/**
 * The animations' census fields (issue #936), in the order its table prints
 * them: timelines of each bone and slot kind, keys by the curve that leaves
 * them (`linear`, `stepped`, `bezier`, for bones and for slots), the sample
 * times of the gate's options that fall before a timeline's first key and
 * after its last, a bone keyed by two timelines that pose one channel
 * (`translate` and `translatex`, …), and the timelines of the groups this
 * construct does not pose.
 */
export const ANIMATION_CENSUS_FIELDS = [
  ...BONE_TIMELINE_KINDS.map((k) => `bone.${k}`),
  ...SLOT_TIMELINE_KINDS.map((k) => `slot.${k}`),
  'bone.linear', 'bone.stepped', 'bone.bezier', 'slot.linear', 'slot.stepped', 'slot.bezier',
  'beforeFirstKey', 'afterLastKey', 'overlappingBoneChannels', 'laterTimelines',
] as const;
export type AnimationCensusField = (typeof ANIMATION_CENSUS_FIELDS)[number];
export type AnimationCensusRow = Record<AnimationCensusField, number> & { animations: number };

/** One animation's verdict on each animation block. */
export interface AnimationVerdict {
  name: string;
  bones: BlockVerdict;
  slots: BlockVerdict;
  /** The first difference, on a DIFF. */
  why: string | null;
}

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
    // The ik, transform, physics and slider timelines are judged since issue #938 (the constraints' census counts them), the path timelines since its second cut (the paths' census); the rest of the later groups are not.
    const pathTimelines = anim.constraints.path.reduce((sum, p) => sum + [p.position, p.spacing, p.mix].filter((k) => k !== undefined).length, 0);
    const sliderTimelines = anim.constraints.slider.reduce((n, x) => n + (x.time === null ? 0 : 1) + (x.mix === null ? 0 : 1), 0);
    out.laterTimelines += tl.later.reduce((sum, [, n]) => sum + n, 0) - anim.constraints.ik.length - anim.constraints.transform.length - pathTimelines - anim.constraints.physics - sliderTimelines;
  }
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
 * The path constraints' census of one model document (issue #938, second
 * cut) — the fields of `PATH_CENSUS_FIELDS`. The slot bone's reading is the
 * core's own plan (`slotBonePlan`), under every skin at once.
 */
export function pathCensusOf(modelText: string): PathCensusRow {
  const doc = readModel(modelText);
  const out = Object.fromEntries(PATH_CENSUS_FIELDS.map((f) => [f, 0])) as PathCensusRow;
  const records = doc.constraints.flatMap((c) => (c.record === undefined ? [] : [c.record]));
  const active = activeBones(doc);
  const skipped = new Set(records.flatMap((r, i) => (r.skin ? [i] : [])));
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
    else if (block === 'setup.attachments') setup.attachments = null;
    else if (block === 'setup.clips') setup.clips = null;
    else {
      const field = block === 'animations.bones' ? 'bones' : 'slots';
      animations = (animations ?? []).map((a) => ({ ...a, samples: a.samples.map((x) => ({ ...x, [field]: null })) }));
    }
    if (!absent.some((x) => x[0] === block)) absent.push([block, 'left out by core_gate to judge another block alone']);
  }
  absent.sort((x, y) => ORACLE_BLOCKS.indexOf(x[0] as OracleBlock) - ORACLE_BLOCKS.indexOf(y[0] as OracleBlock));
  return { ...core, absent, setup, animations };
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
  let attachmentRows = 0;
  try {
    const spine = dumpSkeleton(loadOracleData(readFileSync(skeleton, 'utf8'), readFileSync(atlas, 'utf8'), skeleton), GATE_OPTIONS);
    const modelText = readFileSync(model, 'utf8');
    const core = coreDump(readModel(modelText, model), GATE_OPTIONS, plant);
    const tol = { xy: ORACLE_DEFAULT_TOL, m: ORACLE_DEFAULT_TOL };
    c = compareDumps(spine, core, tol);
    for (const block of GATE_BLOCKS) {
      const why = core.absent?.find((x) => x[0] === block)?.[1];
      if (why !== undefined) {
        blocks[block] = { verdict: 'SKIP', why };
        continue;
      }
      const alone = compareDumps(spine, only(core, block), tol);
      blocks[block] = alone.identical ? { verdict: 'IDENTICAL', why: null } : { verdict: 'DIFF', why: alone.first };
      if (block === 'animations.bones' || block === 'animations.slots') {
        for (const row of alone.rows) {
          if (row.name === '(setup)') continue;
          const v = perAnimation.get(row.name) ?? { name: row.name, bones: 'SKIP', slots: 'SKIP', why: null };
          const verdict: BlockVerdict = row.findings.length === 0 ? 'IDENTICAL' : 'DIFF';
          if (block === 'animations.bones') v.bones = verdict;
          else v.slots = verdict;
          if (verdict === 'DIFF' && v.why === null) v.why = row.findings[0];
          perAnimation.set(row.name, v);
        }
      }
    }
    for (const a of core.animations ?? []) if (!perAnimation.has(a.name)) perAnimation.set(a.name, { name: a.name, bones: 'SKIP', slots: 'SKIP', why: null });
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
  } catch (err) {
    if (err instanceof OracleInputError || err instanceof CoreInputError) return refused(err.message);
    throw err;
  }
  const animations = [...perAnimation.values()];
  const setupRow = c.rows.find((x) => x.name === '(setup)');
  const base = { name, blocks, boneSamples: c.boneSamples, slotRows, worstXy: c.worstXy, worstM: c.worstM, census, slotCensus, attachmentRows, vertices: setupRow?.vertices ?? 0, attachmentCensus, constraintCensus, pathCensus, animations, animationCensus };
  if (!c.identical) return { ...base, verdict: 'DIFF', why: c.first };
  const skipped = GATE_BLOCKS.filter((b) => blocks[b].verdict === 'SKIP');
  if (skipped.length > 0) return { ...base, verdict: 'SKIP', why: skipped.map((b) => `${b}: ${blocks[b].why}`).join(' | ') };
  return { ...base, verdict: 'IDENTICAL', why: null };
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
 * `animations.slots` was — and the HOLEs: what no compared row reaches, and
 * `laterTimelines`, which no comparison of this construct judges.
 */
export function animationReachLines(rows: readonly GateRow[]): string[] {
  const out: string[] = [];
  for (const f of ANIMATION_CENSUS_FIELDS) {
    const block: GateBlock = f.startsWith('slot.') ? 'animations.slots' : 'animations.bones';
    const compared = comparedOn(rows, block);
    const on = compared.filter((r) => (r.animationCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.animationCensus?.[f] ?? 0) > 0).map((r) => r.name);
    if (f === 'laterTimelines') out.push(`  HOLE  animations ${f}: ${anywhere.length} row(s) carry one; deform, sequence, draw-order and event timelines are later constructs and none was judged (ik, transform, physics and slider timelines are judged and counted in the constraints' census, path timelines in the paths')`);
    else out.push(on.length > 0 ? `  REACH animations ${f}: ${on.length} compared row(s)` : `  HOLE  animations ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
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
 * later cut it is a `NONE` line saying so; and the stepped phase of a
 * physics constraint is a HOLE by name on every corpus, since the gate poses
 * `--physics none` only.
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
  const physics = rows.filter((r) => (r.constraintCensus?.physics ?? 0) > 0).map((r) => r.name);
  out.push(`  HOLE  constraints physics.stepped: ${physics.length} row(s) declare a physics constraint; the gate poses --physics none only, where it applies nothing, and the stepped phase (--physics step) is its own card — none was judged`);
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

/** The verdict line. */
export function gateVerdict(rows: readonly GateRow[]): { ok: boolean; line: string } {
  const count = (v: GateVerdict): number => rows.filter((r) => r.verdict === v).length;
  const on = (block: GateBlock, v: BlockVerdict): number => rows.filter((r) => r.blocks?.[block].verdict === v).length;
  const ok = count('DIFF') === 0 && count('REFUSED') === 0;
  return {
    ok,
    line:
      `${ok ? 'GREEN' : 'RED'} — ${rows.length} row(s): ` +
      GATE_BLOCKS.map((b) => `${b} ${on(b, 'IDENTICAL')} IDENTICAL, ${on(b, 'SKIP')} SKIP, ${on(b, 'DIFF')} DIFF`).join('; ') +
      `; ${count('REFUSED')} REFUSED`,
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
      for (const a of row.animations) print(`              animation ${JSON.stringify(a.name)}: bones ${a.bones}, slots ${a.slots}${a.why === null ? '' : ` — ${a.why}`}`);
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
    for (const line of reachLines(rows)) print(line);
    for (const line of slotReachLines(rows)) print(line);
    for (const line of attachmentReachLines(rows)) print(line);
    for (const line of animationReachLines(rows)) print(line);
    for (const line of constraintReachLines(rows)) print(line);
    for (const line of pathReachLines(rows)) print(line);
    const kinds = new Map<string, string[]>();
    for (const row of rows) {
      const path = join(work, String(rows.indexOf(row)).padStart(String(rows.length).length, '0'), 'out', MODEL_DOCUMENT_FILE);
      if (existsSync(path)) kinds.set(row.name, readModel(readFileSync(path, 'utf8')).constraints.map((c) => c.kind));
    }
    for (const line of constraintKindLines(rows, kinds)) print(line);
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
