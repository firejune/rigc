/**
 * rigc's own core: it reads the compiled model as `build` writes it
 * (`rigc-compiled/1`, `skeleton.model.json`) and poses it (issue #925, step 2a
 * of issue #380). It is the second dumper `tools/pose_oracle.ts` was shaped
 * for: what it poses is written into the same `pose-oracle/1` document the
 * runtime's dump is, and `compare` holds the two to each other.
 *
 * ## What it poses, and what it does not yet
 *
 * One construct is here: **the setup pose of every bone** — its world origin
 * and matrix, its active flag and its parent, rounded as the oracle rounds
 * (`gridRound`). Every other block of the oracle's document is a construct not
 * yet admitted (the order of §5 of the design on issue #380: slots, attachments, timelines,
 * constraints, clipping), and the core says so by name (`NOT_ADMITTED`) rather
 * than writing a value for it.
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
 * ## The evaluator
 *
 * World transforms come from the core's own evaluator, `worldTransforms` in
 * `./world.ts`, written from what a bone's fields mean and from measurement
 * against the runtime's dump; its header states each measured choice. It is
 * not `src/transform.ts`'s `computeWorldTransforms`, and cannot be: that is
 * the compiler's arithmetic, frozen so that no emitted byte moves, and called
 * as it is it read IDENTICAL on 1 of the 12 recipes the core poses (DIFF on
 * 11, worst 61 millionths against a tolerance of one — issue #925's report).
 * The owner's decision is recorded on issue #380. `poseSetup` takes the
 * evaluator as a parameter so the suite's plant can pass a copy.
 *
 * ## Purity
 *
 * `src/` is pure and this directory is held to it by the core suite's tree
 * rule (`selftest.ts`, band `CO`): no clock, no randomness, no network, no
 * child process, no file system — `readModel` takes the document's TEXT — and
 * nothing from the Spine runtime package, as a value or as a type.
 */
import type { ModelBone, ModelSlot } from '../model.ts';
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
/** The five constraint kinds a document names. */
export const CORE_CONSTRAINT_KINDS = ['ik', 'transform', 'path', 'physics', 'slider'] as const;
export type CoreConstraintKind = (typeof CORE_CONSTRAINT_KINDS)[number];
/** The five inherit modes, as the rig spec spells them once its first letter is lower-cased. */
export const CORE_INHERIT_MODES = ['normal', 'onlyTranslation', 'noRotationOrReflection', 'noScale', 'noScaleOrReflection'] as const;

/** One skin, as far as this card reads it: its name and the bones it activates. */
export interface CoreSkin {
  name: string;
  bones: string[];
}

/** One constraint, as far as this card reads it: its kind and name. */
export interface CoreConstraint {
  kind: CoreConstraintKind;
  name: string;
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
    out.push(raw as unknown as ModelSlot);
  });
  return out;
}

function readSkins(value: unknown, bones: ReadonlySet<string>, problems: string[]): CoreSkin[] {
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
    if (!isRecord(raw.attachments)) problems.push(`${label}: attachments is not an object`);
    out.push({ name: typeof raw.name === 'string' ? raw.name : '', bones: members });
  });
  return out;
}

function readConstraints(value: unknown, problems: string[]): CoreConstraint[] {
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
    if (kind !== undefined && typeof raw.name === 'string') out.push({ kind, name: raw.name });
  });
  return out;
}

/**
 * Read a `rigc-compiled/1` document from its text, refusing by name a text
 * that is not JSON, a wrong `spec`, a missing section, a section the document
 * does not have, and — in the records this card reads — a field the writer
 * does not write (the writer's own rule, `ordered` in `src/model.ts`,
 * mirrored), a value of the wrong type, a parent declared after its child and
 * a name that resolves to nothing. Every problem is collected and thrown once.
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
  const skins = readSkins(value.skins, names, problems);
  const constraints = readConstraints(value.constraints, problems);
  if (problems.length > 0) throw new CoreInputError(`${where}: ${problems.length} problem(s): ${problems.join('; ')}`);
  return { spec: CORE_DOCUMENT_SPEC, bones, slots, skins, constraints };
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

/**
 * The blocks of the oracle's document the core does not produce, each with the
 * construct that has to be admitted first (§5 of the design on issue #380), in the
 * document's key order. `setup.bones` is not here: it is produced, or absent
 * for the reason `poseSetup` gives.
 */
export const NOT_ADMITTED: ReadonlyArray<readonly [string, string]> = [
  ['physics', 'physics constraint parameters: constraints are not admitted (item 5)'],
  ['paths', 'path constraint parameters: constraints are not admitted (item 5)'],
  ['pathAttachments', 'path attachments: attachments are not admitted (item 3)'],
  ['setup.slots', 'slots, colours and attachment names: not admitted (item 2)'],
  ['setup.drawOrder', 'the draw order: not admitted (item 2)'],
  ['setup.attachments', 'attachment world vertices: not admitted (item 3)'],
  ['setup.clips', 'clipping polygons: not admitted (items 3 and 6)'],
  ['animations', 'timelines and curves: not admitted (item 4)'],
];

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

/** The oracle's `setup` block as the core writes it: bones posed or absent, every other block absent. */
export interface CoreSetup {
  bones: CoreBoneRow[] | null;
  slots: null;
  drawOrder: null;
  attachments: null;
  clips: null;
}

/**
 * The setup pose of every bone, in the oracle's row shape and rounding, and
 * every block the core leaves absent with its reason (`absent`, in document
 * order). Bones are absent when the document declares a constraint (the
 * header's ⚠️), with the kinds and counts named.
 */
export function poseSetup(doc: CompiledDocument, evaluate: SetupEvaluator = worldTransforms): { setup: CoreSetup; absent: Array<[string, string]> } {
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
  // `NOT_ADMITTED` is in document order, and `setup.bones` stands just before `setup.slots`.
  const absent: Array<[string, string]> = [];
  for (const [block, why] of NOT_ADMITTED) {
    if (block === 'setup.slots' && bonesWhy !== null) absent.push(['setup.bones', bonesWhy]);
    absent.push([block, why]);
  }
  return { setup: { bones, slots: null, drawOrder: null, attachments: null, clips: null }, absent };
}

/** Why the setup bones cannot be posed yet, or null when they can. */
function constraintsWhy(doc: CompiledDocument): string | null {
  if (doc.constraints.length === 0) return null;
  const counts = CORE_CONSTRAINT_KINDS.map((k) => [k, doc.constraints.filter((c) => c.kind === k).length] as const).filter(([, n]) => n > 0);
  return `the document declares ${counts.map(([k, n]) => `${k} ×${n}`).join(', ')}, and constraints are not admitted (item 5): the oracle's setup applies them`;
}
