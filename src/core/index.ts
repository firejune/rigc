/**
 * rigc's own core: it reads the compiled model as `build` writes it
 * (`rigc-compiled/1`, `skeleton.model.json`) and poses it (issue #925, step 2a
 * of issue #380). It is the second dumper `tools/pose_oracle.ts` was shaped
 * for: what it poses is written into the same `pose-oracle/1` document the
 * runtime's dump is, and `compare` holds the two to each other.
 *
 * ## What it poses, and what it does not yet
 *
 * Two constructs are here, in the runtime's own order (§5 of the design on
 * issue #380): **the setup pose of every bone** — its world origin and matrix,
 * its active flag and its parent (issue #925) — and **the slots at the setup
 * pose** — what each shows, its colour and dark colour, and the region path
 * the shown attachment names (issue #928, below). Both are rounded as the
 * oracle rounds (`gridRound`). Every other block of the oracle's document is a
 * construct not yet admitted (attachments, timelines, constraints, clipping),
 * and the core says so by name (`NOT_ADMITTED`) rather than writing a value
 * for it.
 *
 * ⚠️ **A document that declares any constraint has no setup bones from the
 * core.** The oracle poses the setup pose with every constraint applied, so a
 * bone an ik, transform, path or slider constraint moves is not where its
 * hierarchy alone puts it, and a physics constraint is left in the list
 * because no rig in the tree's corpora declares physics without another kind
 * beside it, so what it does to the setup under `--physics none` has not been
 * measured apart. Measured over the nineteen recipes `tools/emit_hashes.ts`
 * generates: seven declare a constraint, and on each of them, posed with the
 * evaluator that is exact on the other twelve (below), at least one bone of
 * the runtime's setup pose differs from its hierarchy's alone — on six by more
 * than the tolerance of one grid step.
 * Which bones a constraint reaches is the constraints' own admission; until
 * then the whole block is absent, with the kinds named.
 *
 * 🔸 **Active** is measured rather than assumed. Posed through the runtime by
 * `tools/pose_oracle.ts dump` on a hand-written skeleton (issue #925's
 * report; held by the core suite's `CO07`): a bone that is not skin-required
 * is active; a skin-required bone is active exactly when the applied skin
 * names it or names a bone below it — a skin-required parent of a named bone
 * is active, and a bone that is not skin-required stays active under an
 * inactive parent. The oracle's `--skin all`, the only skin option the core
 * takes, applies every skin at once, so under it `active` means: not
 * skin-required, or named — itself or a bone below it — by ANY skin's `bones`
 * list. An inactive bone is not posed (`worldTransforms` in `./world.ts`).
 *
 ## The slots at the setup pose (issue #928)
 *
 * Every rule below was measured by posing a hand-written skeleton through
 * `tools/pose_oracle.ts dump` (spine-core 4.3.13, `--skin all`) and reading
 * the slot rows it printed; the core suite's `CO11` holds the same skeleton
 * against the core at tolerance 0.
 *
 * - **Which attachment a slot shows.** A slot whose setup placeholder is
 *   `null` shows nothing (`null`). Otherwise the placeholder is looked up in
 *   every skin; one skin filling it — the default or a named one alone —
 *   shows that record. A placeholder no skin fills shows nothing: the row
 *   reads `null` for the attachment and for the path, not the placeholder's
 *   name.
 * - ⚠️ **Several skins filling one placeholder: the LAST in the Spine FILE's
 *   skin order wins — and the model does not hold that order.** Three skins
 *   filling one placeholder with three names, in three file orders
 *   (`default, s1, s2`; `s2, s1, default`; `s1, default, s2`), showed `s2`,
 *   `default` and `s2`'s name: the last one listed, every time — the oracle's
 *   `--skin all` merges the skins in file order, a later one replacing an
 *   earlier one's entry. The file's order is not the model's: the Spine
 *   emitter writes `default` first and the rest in the editor's order
 *   (`editorSkinOrder` in `src/compile.ts`), so a rig built with skins
 *   `default, zulu, alpha` has a model listing them so and a file listing
 *   `default, alpha, zulu`; with `zulu` and `alpha` filling one placeholder,
 *   spine-core showed `zulu`'s attachment, and "last in the model's order"
 *   would have shown `alpha`'s (measured through `ingest` and `build`; the
 *   core suite's `CO12` builds it). That order is a Spine spelling the model
 *   rightly does not carry (census §4's class), so the core does not guess it:
 *   where every skin filling a slot's setup placeholder gives the same row —
 *   the same shown name and path — the order cannot matter and the row is
 *   posed; where they differ, the whole `setup.slots` block is absent, naming
 *   the slot, the placeholder and the skins. Posing one skin at a time
 *   (`--skin <name>`) has no order to know, and is the construct that would
 *   admit it.
 * - **The name shown** is the record's own `name` where the model states one,
 *   else the placeholder: a region filed under `p` with `path: "other"` shows
 *   `p`; one stating `name: "n"` shows `n`.
 * - **The region path** is the record's `path` where stated, else the name
 *   shown — for a region, a mesh and a linked mesh (a region stating
 *   `name: "n"` and no path reads path `n`; a linked mesh stating
 *   `path: "lm"` reads `lm`; a region or mesh with a `sequence` reads its
 *   stated `path` as written, `seq` and not a numbered frame). A bounding
 *   box, a clipping polygon and a path attachment read `null`, as does a
 *   point, which rigc does not emit.
 * - **Colour.** No colour stated reads `1, 1, 1, 1`. A stated colour reads
 *   each channel as its two hex digits over 255 (`ff800040` reads
 *   `1, 0.501961, 0, 0.25098`; upper case reads the same); six digits read
 *   an alpha of 1. The attachment's own colour does not enter the slot's row
 *   (a region tinted `00000080` under an unstated slot colour read white).
 *   Every one of the 256 byte values in every channel is held by `CO11`.
 * - **Dark colour** is `null` when the slot states none, else its first
 *   three channels read the same way; eight digits read the same three, the
 *   fourth unread.
 * - 🚫 **Any other spelling is refused by `readModel`, by name.** The
 *   runtime's reading of one is not a colour: `ff80004` (seven digits) read
 *   alpha 1, `zz800040` read a red of NaN, `f` read red 0.058824 and green
 *   NaN, and an empty colour read white while an empty dark colour read none.
 *   Reproducing that would be copying a parser's accidents, not posing a slot.
 * - **A slot on an inactive bone still shows its attachment** (a slot on a
 *   skin-required bone no skin names read its region and path).
 * - ⚠️ **A slider poses slots at setup; the other four constraint kinds do
 *   not.** A slider applies an animation, and the oracle's setup applies
 *   constraints: a hand-written slider whose animation keys a slot's `rgba`
 *   to `ff000080` and its attachment to `q` turned that slot's setup row from
 *   `r, 1, 1, 1, 1` to `q, 1, 0, 0, 0.501961`, with its dial bone and without
 *   one. So `setup.slots` is absent, naming the slider, its animation and the
 *   slots it keys, when any slider's animation keys a slot, until constraints
 *   are admitted (item 5). An ik, transform, path or physics constraint moves
 *   bones only: the six recipes declaring those and no slider that keys a slot
 *   read IDENTICAL on `setup.slots`. One recipe does declare such a slider
 *   (`gallery/look`, whose `turn` keys two slots' `rgba`) and read IDENTICAL
 *   too before this rule — only because its dial rests where `turn` keys the
 *   colours the slots already have; that is the rig's design, not a law the
 *   core could pose by (issue #928's report).
 * - **Blend modes are not in the row.** The oracle's slot row has no blend
 *   field, so a blend mode is not judged by this block; `tools/core_gate.ts`
 *   counts the rows stating one and prints that it is unjudged.
 *
 * ## The evaluator
 *
 * World transforms come from the core's own evaluator, `worldTransforms` in
 * `./world.ts`, written from what a bone's fields mean and from measurement
 * against the runtime's dump; its header states each measured choice. It is
 * not `src/transform.ts`'s `computeWorldTransforms`, and cannot be: that is
 * the compiler's arithmetic, frozen so that no emitted byte moves, and called
 * as it is it read IDENTICAL on 1 of the 12 recipes the core poses (DIFF on
 * 11, worst 61 millionths against a tolerance of one — issue #925's report).
 * The owner's decision is recorded on issue #380. `poseSetup` takes a
 * `CorePlant` — the evaluator, the skin resolution, the colour reading — so
 * the suite's plants can pass a copy of one of them; nothing else passes one.
 *
 * ## Purity
 *
 * `src/` is pure and this directory is held to it by the core suite's tree
 * rule (`selftest.ts`, band `CO`): no clock, no randomness, no network, no
 * child process, no file system — `readModel` takes the document's TEXT — and
 * nothing from the Spine runtime package, as a value or as a type.
 */
import type { ModelAtlasRect, ModelBone, ModelSlot, SkinTableEntry } from '../model.ts';
import { worldTransforms, type CoreWorld } from './world.ts';

/** The document spec this reader takes. */
export const CORE_DOCUMENT_SPEC = 'rigc-compiled/1';

/** Who posed a dump the core wrote — the oracle document's `dumper`. */
export const CORE_DUMPER = 'rigc-core';

/** A refusal about the document read. Every problem is collected and named in one throw. */
export class CoreInputError extends Error {}

/** The document's sections after `spec`, in its key order (`modelDocument` in `src/model.ts`). */
export const CORE_SECTIONS = [
  'bones', 'slots', 'skins', 'constraints', 'events', 'animations',
  'images', 'pageGrids', 'droppedStates', 'absentParts', 'meshBones', 'meshes', 'physics', 'deformTransforms', 'trackDerivations', 'rig',
] as const;

/** The fields a bone record may carry, as the writer lists them. A field outside this list is refused. */
export const CORE_BONE_FIELDS = ['name', 'parent', 'length', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY', 'inheritMode', 'skinRequired', 'editor'] as const;
const BONE_NUMBERS = ['length', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY'] as const;
/** The fields a slot record may carry. */
export const CORE_SLOT_FIELDS = ['name', 'bone', 'setup', 'color', 'dark', 'blend'] as const;
/** The fields a skin record may carry. */
export const CORE_SKIN_FIELDS = ['name', 'bones', 'constraints', 'attachments'] as const;
/**
 * The fields each attachment kind's record may carry, as the writer lists them
 * (`ATTACHMENT_FIELDS` in `src/model.ts`, mirrored as the bone and slot lists
 * are). A field outside its kind's list is refused.
 */
export const CORE_ATTACHMENT_FIELDS: Readonly<Record<SkinTableEntry['kind'], readonly string[]>> = {
  mesh: ['kind', 'name', 'path', 'color', 'uvs', 'triangles', 'vertices', 'hull', 'edges', 'width', 'height', 'sequence'],
  boundingbox: ['kind', 'name', 'vertexCount', 'vertices', 'editorColor'],
  clipping: ['kind', 'name', 'end', 'convex', 'inverse', 'vertexCount', 'vertices', 'editorColor'],
  path: ['kind', 'name', 'closed', 'constantSpeed', 'vertexCount', 'vertices', 'lengths', 'editorColor'],
  region: ['kind', 'name', 'path', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'width', 'height', 'color', 'sequence', 'atlas'],
  linkedmesh: ['kind', 'name', 'path', 'source', 'skin', 'slot', 'timelines', 'width', 'height', 'color', 'sequence'],
};
/** The kinds whose shown record names an atlas region — the ones the oracle's row gives a path (the header's measurement). */
export const CORE_REGION_KINDS: ReadonlySet<SkinTableEntry['kind']> = new Set(['region', 'mesh', 'linkedmesh']);
/** A colour the core reads: six or eight hex digits, either case (the header's measurement; anything else is refused). */
const HEX_COLOUR = /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
/** The five constraint kinds a document names. */
export const CORE_CONSTRAINT_KINDS = ['ik', 'transform', 'path', 'physics', 'slider'] as const;
export type CoreConstraintKind = (typeof CORE_CONSTRAINT_KINDS)[number];
/** The five inherit modes, as the rig spec spells them once its first letter is lower-cased. */
export const CORE_INHERIT_MODES = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection'] as const;

/**
 * The fields of a region's atlas rectangle (`ModelAtlasRect` in `src/model.ts`,
 * issue #935), every one required and a finite number.
 */
export const CORE_ATLAS_RECT_FIELDS = ['width', 'height', 'offsetX', 'offsetY', 'originalWidth', 'originalHeight'] as const;

/**
 * One attachment record, as far as the slots read it: its kind, and its own
 * name and region path where stated — and a region's atlas rectangle where the
 * record carries one, `null` where the build had no source for it (issue #935).
 * Nothing here poses a region yet; the rectangle is read so the construct that
 * does (issue #931) finds it checked. A sequence's per-frame rectangles are not
 * read: no construct here reads a sequence.
 */
export interface CoreAttachment {
  kind: SkinTableEntry['kind'];
  name?: string;
  path?: string;
  atlas?: ModelAtlasRect | null;
}

/** One skin, as far as these constructs read it: its name, the bones it activates, and its table — slot, then placeholder. */
export interface CoreSkin {
  name: string;
  bones: string[];
  attachments: Record<string, Record<string, CoreAttachment>>;
}

/** One constraint, as far as these constructs read it: its kind and name, and a slider's animation. */
export interface CoreConstraint {
  kind: CoreConstraintKind;
  name: string;
  /** The animation a slider applies — the one constraint kind measured to pose a slot (the slots' ⚠️). */
  animation?: string;
}

/** One animation, as far as these constructs read it: its name and the slots its timelines key. */
export interface CoreAnimation {
  name: string;
  slots: string[];
}

/**
 * A `rigc-compiled/1` document, read. `bones` and `slots` are checked field by
 * field against the writer's own records; skins and constraints are read as
 * far as their names and memberships, and every other section is only
 * required to be present — no construct this card admits reads it.
 */
export interface CompiledDocument {
  spec: string;
  bones: ModelBone[];
  slots: ModelSlot[];
  skins: CoreSkin[];
  constraints: CoreConstraint[];
  animations: CoreAnimation[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The mode a stated `inheritMode` folds to — the first letter lower-cased and nothing else — or null. */
export function foldInheritMode(value: string): (typeof CORE_INHERIT_MODES)[number] | null {
  const folded = value.length === 0 ? value : value[0].toLowerCase() + value.slice(1);
  return CORE_INHERIT_MODES.find((m) => m === folded) ?? null;
}

function unknownFields(record: Record<string, unknown>, known: readonly string[], where: string, problems: string[]): void {
  for (const key of Object.keys(record)) {
    if (!known.includes(key)) problems.push(`${where}: field "${key}" is not one this reader knows; it reads [${known.join(', ')}]`);
  }
}

function readBones(value: unknown, problems: string[]): ModelBone[] {
  if (!Array.isArray(value)) {
    problems.push('bones is not a list');
    return [];
  }
  const out: ModelBone[] = [];
  const seen = new Set<string>();
  value.forEach((raw, i) => {
    const where = `bones[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const label = typeof raw.name === 'string' ? `${where} "${raw.name}"` : where;
    unknownFields(raw, CORE_BONE_FIELDS, label, problems);
    if (typeof raw.name !== 'string' || raw.name === '') problems.push(`${where}: name is ${JSON.stringify(raw.name)}, not a non-empty string`);
    else if (seen.has(raw.name)) problems.push(`${label}: the name is declared twice`);
    if (raw.parent !== undefined) {
      if (typeof raw.parent !== 'string') problems.push(`${label}: parent is ${JSON.stringify(raw.parent)}, not a bone name`);
      else if (!seen.has(raw.parent)) problems.push(`${label}: parent "${raw.parent}" is not declared before it; bones are parents first`);
    }
    for (const key of BONE_NUMBERS) {
      const v = raw[key];
      if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) problems.push(`${label}: ${key} is ${JSON.stringify(v)}, not a finite number`);
    }
    if (raw.inheritMode !== undefined) {
      if (typeof raw.inheritMode !== 'string' || foldInheritMode(raw.inheritMode) === null) {
        problems.push(`${label}: inheritMode is ${JSON.stringify(raw.inheritMode)}, which folds to none of ${CORE_INHERIT_MODES.join(', ')}`);
      }
    }
    if (raw.skinRequired !== undefined && typeof raw.skinRequired !== 'boolean') problems.push(`${label}: skinRequired is ${JSON.stringify(raw.skinRequired)}, not a boolean`);
    if (raw.editor !== undefined) {
      if (!isRecord(raw.editor)) problems.push(`${label}: editor is not an object`);
      else {
        unknownFields(raw.editor, ['color', 'icon'], `${label}.editor`, problems);
        for (const key of ['color', 'icon'] as const) {
          if (raw.editor[key] !== undefined && typeof raw.editor[key] !== 'string') problems.push(`${label}.editor: ${key} is not a string`);
        }
      }
    }
    if (typeof raw.name === 'string' && raw.name !== '') seen.add(raw.name);
    out.push(raw as unknown as ModelBone);
  });
  return out;
}

function readSlots(value: unknown, bones: ReadonlySet<string>, problems: string[]): ModelSlot[] {
  if (!Array.isArray(value)) {
    problems.push('slots is not a list');
    return [];
  }
  const out: ModelSlot[] = [];
  value.forEach((raw, i) => {
    const where = `slots[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const label = typeof raw.name === 'string' ? `${where} "${raw.name}"` : where;
    unknownFields(raw, CORE_SLOT_FIELDS, label, problems);
    if (typeof raw.name !== 'string' || raw.name === '') problems.push(`${where}: name is ${JSON.stringify(raw.name)}, not a non-empty string`);
    if (typeof raw.bone !== 'string') problems.push(`${label}: bone is ${JSON.stringify(raw.bone)}, not a bone name`);
    else if (!bones.has(raw.bone)) problems.push(`${label}: bone "${raw.bone}" is not a bone of this document`);
    if (raw.setup !== null && typeof raw.setup !== 'string') problems.push(`${label}: setup is ${JSON.stringify(raw.setup)}, not a placeholder name or null`);
    for (const key of ['color', 'dark', 'blend'] as const) {
      if (raw[key] !== undefined && typeof raw[key] !== 'string') problems.push(`${label}: ${key} is ${JSON.stringify(raw[key])}, not a string`);
    }
    for (const key of ['color', 'dark'] as const) {
      const v = raw[key];
      if (typeof v === 'string' && !HEX_COLOUR.test(v)) problems.push(`${label}: ${key} is ${JSON.stringify(v)}, not six or eight hex digits (rrggbb or rrggbbaa) — the only spellings whose reading was measured to be a colour`);
    }
    out.push(raw as unknown as ModelSlot);
  });
  return out;
}

function readAttachments(value: Record<string, unknown>, slots: ReadonlySet<string>, label: string, problems: string[]): Record<string, Record<string, CoreAttachment>> {
  const out: Record<string, Record<string, CoreAttachment>> = {};
  for (const [slot, table] of Object.entries(value)) {
    const at = `${label}.attachments["${slot}"]`;
    if (!slots.has(slot)) problems.push(`${at}: "${slot}" is not a slot of this document`);
    if (!isRecord(table)) {
      problems.push(`${at} is not an object`);
      continue;
    }
    const entries: Record<string, CoreAttachment> = {};
    for (const [placeholder, raw] of Object.entries(table)) {
      const where = `${at}["${placeholder}"]`;
      if (!isRecord(raw)) {
        problems.push(`${where} is not an object`);
        continue;
      }
      const kinds = Object.keys(CORE_ATTACHMENT_FIELDS) as Array<SkinTableEntry['kind']>;
      const kind = kinds.find((k) => k === raw.kind);
      if (kind === undefined) {
        problems.push(`${where}: kind is ${JSON.stringify(raw.kind)}, none of ${kinds.join(', ')}`);
        continue;
      }
      unknownFields(raw, CORE_ATTACHMENT_FIELDS[kind], where, problems);
      const record: CoreAttachment = { kind };
      for (const key of ['name', 'path'] as const) {
        const v = raw[key];
        if (v === undefined) continue;
        if (typeof v !== 'string' || v === '') problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a non-empty string`);
        else record[key] = v;
      }
      if (kind === 'region' && raw.atlas !== undefined) {
        const rect = readAtlasRect(raw.atlas, `${where}.atlas`, problems);
        if (rect !== undefined) record.atlas = rect;
      }
      entries[placeholder] = record;
    }
    out[slot] = entries;
  }
  return out;
}

/** A region's `atlas`: `null`, or an object holding exactly the six fields, each a finite number. `undefined` when refused. */
function readAtlasRect(value: unknown, where: string, problems: string[]): ModelAtlasRect | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) {
    problems.push(`${where} is ${JSON.stringify(value)}, neither null nor an object`);
    return undefined;
  }
  const before = problems.length;
  unknownFields(value, CORE_ATLAS_RECT_FIELDS, where, problems);
  for (const key of CORE_ATLAS_RECT_FIELDS) {
    const v = value[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(`${where}: ${key} is ${JSON.stringify(v) ?? 'absent'}, not a finite number`);
  }
  return problems.length === before ? (value as unknown as ModelAtlasRect) : undefined;
}

function readSkins(value: unknown, bones: ReadonlySet<string>, slots: ReadonlySet<string>, problems: string[]): CoreSkin[] {
  if (!Array.isArray(value)) {
    problems.push('skins is not a list');
    return [];
  }
  const out: CoreSkin[] = [];
  value.forEach((raw, i) => {
    const where = `skins[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const label = typeof raw.name === 'string' ? `${where} "${raw.name}"` : where;
    unknownFields(raw, CORE_SKIN_FIELDS, label, problems);
    if (typeof raw.name !== 'string' || raw.name === '') problems.push(`${where}: name is ${JSON.stringify(raw.name)}, not a non-empty string`);
    const members: string[] = [];
    if (!Array.isArray(raw.bones)) problems.push(`${label}: bones is not a list`);
    else {
      raw.bones.forEach((b, j) => {
        if (typeof b !== 'string') problems.push(`${label}: bones[${j}] is not a bone name`);
        else if (!bones.has(b)) problems.push(`${label}: bones[${j}] "${b}" is not a bone of this document`);
        else members.push(b);
      });
    }
    if (!isRecord(raw.constraints)) problems.push(`${label}: constraints is not an object`);
    let attachments: Record<string, Record<string, CoreAttachment>> = {};
    if (!isRecord(raw.attachments)) problems.push(`${label}: attachments is not an object`);
    else attachments = readAttachments(raw.attachments, slots, label, problems);
    out.push({ name: typeof raw.name === 'string' ? raw.name : '', bones: members, attachments });
  });
  return out;
}

function readAnimations(value: unknown, slots: ReadonlySet<string>, problems: string[]): CoreAnimation[] {
  if (!Array.isArray(value)) {
    problems.push('animations is not a list');
    return [];
  }
  const out: CoreAnimation[] = [];
  value.forEach((raw, i) => {
    const where = `animations[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    if (typeof raw.name !== 'string' || raw.name === '') problems.push(`${where}: name is ${JSON.stringify(raw.name)}, not a non-empty string`);
    const label = typeof raw.name === 'string' ? `${where} "${raw.name}"` : where;
    const keyed: string[] = [];
    if (!Array.isArray(raw.slots)) problems.push(`${label}: slots is not a list`);
    else {
      raw.slots.forEach((entry, j) => {
        if (!isRecord(entry) || typeof entry.name !== 'string') problems.push(`${label}: slots[${j}] names no slot`);
        else if (!slots.has(entry.name)) problems.push(`${label}: slots[${j}] "${entry.name}" is not a slot of this document`);
        else keyed.push(entry.name);
      });
    }
    out.push({ name: typeof raw.name === 'string' ? raw.name : '', slots: keyed });
  });
  return out;
}

function readConstraints(value: unknown, animations: ReadonlySet<string>, problems: string[]): CoreConstraint[] {
  if (!Array.isArray(value)) {
    problems.push('constraints is not a list');
    return [];
  }
  const out: CoreConstraint[] = [];
  value.forEach((raw, i) => {
    const where = `constraints[${i}]`;
    if (!isRecord(raw)) {
      problems.push(`${where} is not an object`);
      return;
    }
    const kind = CORE_CONSTRAINT_KINDS.find((k) => k === raw.kind);
    if (kind === undefined) problems.push(`${where}: kind is ${JSON.stringify(raw.kind)}, none of ${CORE_CONSTRAINT_KINDS.join(', ')}`);
    if (typeof raw.name !== 'string' || raw.name === '') problems.push(`${where}: name is ${JSON.stringify(raw.name)}, not a non-empty string`);
    if (raw.declaredIn !== 'rig' && raw.declaredIn !== 'motion') problems.push(`${where}: declaredIn is ${JSON.stringify(raw.declaredIn)}, not "rig" or "motion"`);
    if (kind === 'slider' && (typeof raw.animation !== 'string' || !animations.has(raw.animation))) problems.push(`${where}: a slider's animation is ${JSON.stringify(raw.animation)}, not an animation of this document`);
    if (kind !== undefined && typeof raw.name === 'string') out.push({ kind, name: raw.name, ...(kind === 'slider' && typeof raw.animation === 'string' ? { animation: raw.animation } : {}) });
  });
  return out;
}

/**
 * Read a `rigc-compiled/1` document from its text, refusing by name a text
 * that is not JSON, a wrong `spec`, a missing section, a section the document
 * does not have, and — in the records these constructs read (bones, slots,
 * skins and their attachment tables) — a field the writer does not write (the
 * writer's own rule, `ordered` in `src/model.ts`, mirrored), a value of the
 * wrong type, a colour spelled other than six or eight hex digits, a parent
 * declared after its child and a name that resolves to nothing. Every problem
 * is collected and thrown once.
 */
export function readModel(text: string, where = 'the model document'): CompiledDocument {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw new CoreInputError(`${where}: not JSON — ${(err as Error).message}`);
  }
  if (!isRecord(value)) throw new CoreInputError(`${where}: not a JSON object`);
  if (value.spec !== CORE_DOCUMENT_SPEC) throw new CoreInputError(`${where}: spec is ${JSON.stringify(value.spec)}, not "${CORE_DOCUMENT_SPEC}"`);
  const problems: string[] = [];
  for (const key of CORE_SECTIONS) if (!(key in value)) problems.push(`section "${key}" is missing`);
  for (const key of Object.keys(value)) {
    if (key !== 'spec' && !(CORE_SECTIONS as readonly string[]).includes(key)) problems.push(`section "${key}" is not one a ${CORE_DOCUMENT_SPEC} document has`);
  }
  const bones = readBones(value.bones, problems);
  const names = new Set(bones.map((b) => b.name));
  const slots = readSlots(value.slots, names, problems);
  const slotNames = new Set(slots.map((x) => x.name));
  const skins = readSkins(value.skins, names, slotNames, problems);
  const animations = readAnimations(value.animations, slotNames, problems);
  const constraints = readConstraints(value.constraints, new Set(animations.map((a) => a.name)), problems);
  if (problems.length > 0) throw new CoreInputError(`${where}: ${problems.length} problem(s): ${problems.join('; ')}`);
  return { spec: CORE_DOCUMENT_SPEC, bones, slots, skins, constraints, animations };
}

/**
 * The oracle's rounding, stated in its header: six decimals, half up
 * (`Math.round(v * 1e6) / 1e6`), `null` for a value that is not finite, and a
 * `-0` written as `0`. `tools/pose_oracle.ts` rounds with this function, so the
 * two dumpers cannot round two ways.
 */
export function gridRound(v: number): number | null {
  if (!Number.isFinite(v)) return null;
  const out = Math.round(v * 1e6) / 1e6;
  return out === 0 ? 0 : out;
}

/** One bone of a posed setup: `[name, worldX, worldY, a, b, c, d, active, parent]`, the oracle's row. */
export type CoreBoneRow = [string, number | null, number | null, number | null, number | null, number | null, number | null, 0 | 1, string | null];

/** What computes the world transforms: the core's own `worldTransforms` (`./world.ts`) unless a caller passes another. */
export type SetupEvaluator = (bones: readonly ModelBone[], active: ReadonlySet<string>) => Map<string, CoreWorld>;

/** One slot of a posed setup: `[name, attachment, r, g, b, a, dark, path]`, the oracle's row. */
export type CoreSlotRow = [string, string | null, number | null, number | null, number | null, number | null, [number | null, number | null, number | null] | null, string | null];

/** The record a slot's setup placeholder resolves to, and the skin whose table holds it. */
export interface CoreShown {
  skin: string;
  placeholder: string;
  record: CoreAttachment;
}

/**
 * What a slot shows at setup: `null` for nothing, the record shown, or — when
 * the skins filling its placeholder disagree about the row — `conflict`,
 * naming each skin with the name it would show (the header's ⚠️).
 */
export type ShownResolution = CoreShown | null | { conflict: Array<{ skin: string; shown: string; path: string | null }> };

/** What resolves a slot's setup attachment: `shownAttachment` unless a caller passes another. */
export type ShownResolver = (doc: CompiledDocument, slot: ModelSlot) => ShownResolution;

/** What reads a stated light colour into its four channels: `readColour` unless a caller passes another. */
export type ColourReader = (hex: string) => [number, number, number, number];

/**
 * What the core poses with, each part replaceable. The core suite's plants
 * pass a copy of one of them — a mode's sign flipped, the wrong skin, a
 * channel misread — and nothing else passes any.
 */
export interface CorePlant {
  evaluate?: SetupEvaluator;
  shown?: ShownResolver;
  colour?: ColourReader;
}

/**
 * The blocks of the oracle's document the core does not produce, each with the
 * construct that has to be admitted first (§5 of the design on issue #380), in the
 * document's key order. `setup.bones` and `setup.slots` are not here: each is
 * produced, or absent for the reason `poseSetup` gives.
 */
export const NOT_ADMITTED: ReadonlyArray<readonly [string, string]> = [
  ['physics', 'physics constraint parameters: constraints are not admitted (item 5)'],
  ['paths', 'path constraint parameters: constraints are not admitted (item 5)'],
  ['pathAttachments', 'path attachments: attachments are not admitted (item 3)'],
  ['setup.drawOrder', 'the draw order: not admitted (item 2)'],
  ['setup.attachments', 'attachment world vertices: not admitted (item 3)'],
  ['setup.clips', 'clipping polygons: not admitted (items 3 and 6)'],
  ['animations', 'timelines and curves: not admitted (item 4)'],
];

/** The two blocks the core poses, in the document's order: after `pathAttachments`, before `setup.drawOrder`. */
const POSED_BLOCKS = ['setup.bones', 'setup.slots'] as const;

/** Bones active under every skin applied at once — the rule measured in the header. */
export function activeBones(doc: CompiledDocument): Set<string> {
  const named = new Set(doc.skins.flatMap((s) => s.bones));
  const parentOf = new Map(doc.bones.map((b) => [b.name, b.parent]));
  const reached = new Set<string>();
  for (const name of named) {
    for (let at: string | undefined = name; at !== undefined && !reached.has(at); at = parentOf.get(at)) reached.add(at);
  }
  return new Set(doc.bones.filter((b) => b.skinRequired !== true || reached.has(b.name)).map((b) => b.name));
}

/**
 * A stated light colour's four channels: each pair of hex digits over 255,
 * and an alpha of 1 when six digits are stated (the header's measurement).
 * `readModel` has already refused every other spelling.
 */
export function readColour(hex: string): [number, number, number, number] {
  const channel = (i: number): number => Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16) / 255;
  return [channel(0), channel(1), channel(2), hex.length === 8 ? channel(3) : 1];
}

/** The name a record shows and the region path it names — the header's two measured rules. */
export function shownRow(shown: CoreShown): { name: string; path: string | null } {
  const name = shown.record.name ?? shown.placeholder;
  return { name, path: CORE_REGION_KINDS.has(shown.record.kind) ? (shown.record.path ?? name) : null };
}

/**
 * What a slot shows at setup under every skin at once — the header's rule:
 * nothing for a `null` placeholder or one no skin fills; the one record where
 * every skin filling the placeholder gives the same row; a `conflict`, naming
 * each skin in the model's order, where they differ.
 */
export function shownAttachment(doc: CompiledDocument, slot: ModelSlot): ShownResolution {
  if (slot.setup === null) return null;
  const placeholder = slot.setup;
  const filling: CoreShown[] = [];
  for (const skin of doc.skins) {
    const record = skin.attachments[slot.name]?.[placeholder];
    if (record !== undefined) filling.push({ skin: skin.name, placeholder, record });
  }
  if (filling.length === 0) return null;
  const rows = filling.map((f) => ({ skin: f.skin, ...shownRow(f) }));
  const agree = rows.every((r) => r.name === rows[0].name && r.path === rows[0].path);
  return agree ? filling[0] : { conflict: rows.map((r) => ({ skin: r.skin, shown: r.name, path: r.path })) };
}

/** The oracle's `setup` block as the core writes it: bones and slots posed or absent, every other block absent. */
export interface CoreSetup {
  bones: CoreBoneRow[] | null;
  slots: CoreSlotRow[] | null;
  drawOrder: null;
  attachments: null;
  clips: null;
}

/**
 * The setup pose of every bone and every slot, in the oracle's row shapes and
 * rounding, and every block the core leaves absent with its reason (`absent`,
 * in document order). Bones are absent when the document declares a
 * constraint (the header's ⚠️), with the kinds and counts named; slots are
 * absent when a slot's setup placeholder is filled by skins that disagree
 * (the slots' ⚠️), with each such slot named.
 */
export function poseSetup(doc: CompiledDocument, plant: CorePlant = {}): { setup: CoreSetup; absent: Array<[string, string]> } {
  const evaluate = plant.evaluate ?? worldTransforms;
  const resolve = plant.shown ?? shownAttachment;
  const colour = plant.colour ?? readColour;
  const bonesWhy = constraintsWhy(doc);
  let bones: CoreBoneRow[] | null = null;
  if (bonesWhy === null) {
    const active = activeBones(doc);
    const world = evaluate(doc.bones, active);
    bones = doc.bones.map((b): CoreBoneRow => {
      const t = world.get(b.name);
      if (t === undefined) throw new CoreInputError(`the evaluator returned no transform for bone "${b.name}"`);
      return [b.name, gridRound(t.worldX), gridRound(t.worldY), gridRound(t.a), gridRound(t.b), gridRound(t.c), gridRound(t.d), active.has(b.name) ? 1 : 0, b.parent ?? null];
    });
  }
  const conflicts: string[] = [];
  const slotRows: CoreSlotRow[] = [];
  for (const slot of doc.slots) {
    const shown = resolve(doc, slot);
    if (shown !== null && 'conflict' in shown) {
      conflicts.push(`slot "${slot.name}" placeholder "${slot.setup}" is filled by skins ${shown.conflict.map((c) => `"${c.skin}" (shows ${JSON.stringify(c.shown)}, path ${JSON.stringify(c.path)})`).join(', ')}`);
      continue;
    }
    const row = shown === null ? null : shownRow(shown);
    const [r, g, b, a] = slot.color === undefined ? [1, 1, 1, 1] : colour(slot.color);
    const dark = slot.dark === undefined ? null : readColour(slot.dark);
    slotRows.push([
      slot.name,
      row === null ? null : row.name,
      gridRound(r), gridRound(g), gridRound(b), gridRound(a),
      dark === null ? null : [gridRound(dark[0]), gridRound(dark[1]), gridRound(dark[2])],
      row === null ? null : row.path,
    ]);
  }
  const slotsWhy = slidersWhy(doc) ?? (conflicts.length === 0
    ? null
    : `${conflicts.join('; ')} — under --skin all the LAST of them in the Spine file's skin order wins, and that order is the emitter's (default first, the rest in the editor's order), not the model's; posing one skin at a time is not admitted`);
  const slots = slotsWhy === null ? slotRows : null;
  // `NOT_ADMITTED` is in document order; the two posed blocks stand between `pathAttachments` and `setup.drawOrder`.
  const why: Record<(typeof POSED_BLOCKS)[number], string | null> = { 'setup.bones': bonesWhy, 'setup.slots': slotsWhy };
  const absent: Array<[string, string]> = [];
  for (const [block, reason] of NOT_ADMITTED) {
    if (block === 'setup.drawOrder') for (const posed of POSED_BLOCKS) if (why[posed] !== null) absent.push([posed, why[posed] as string]);
    absent.push([block, reason]);
  }
  return { setup: { bones, slots, drawOrder: null, attachments: null, clips: null }, absent };
}

/** Why the setup slots cannot be posed yet because a slider poses them, or null when no slider's animation keys a slot. */
function slidersWhy(doc: CompiledDocument): string | null {
  const keyed = doc.constraints.flatMap((c) => {
    if (c.kind !== 'slider') return [];
    const slots = doc.animations.find((a) => a.name === c.animation)?.slots ?? [];
    return slots.length === 0 ? [] : [`slider "${c.name}" applies animation "${c.animation}", which keys slot(s) ${slots.map((x) => `"${x}"`).join(', ')}`];
  });
  return keyed.length === 0 ? null : `${keyed.join('; ')} — the oracle's setup applies sliders, and a slider poses the slots its animation keys; constraints are not admitted (item 5)`;
}

/** Why the setup bones cannot be posed yet, or null when they can. */
function constraintsWhy(doc: CompiledDocument): string | null {
  if (doc.constraints.length === 0) return null;
  const counts = CORE_CONSTRAINT_KINDS.map((k) => [k, doc.constraints.filter((c) => c.kind === k).length] as const).filter(([, n]) => n > 0);
  return `the document declares ${counts.map(([k, n]) => `${k} ×${n}`).join(', ')}, and constraints are not admitted (item 5): the oracle's setup applies them`;
}
