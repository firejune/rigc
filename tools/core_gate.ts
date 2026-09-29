/**
 * core_gate — the equivalence gate of issue #380 run over a corpus: every
 * recipe built through the CLI, its Spine build posed by spine-core and its
 * model document posed by rigc's own core, the two compared, and the census of
 * what the corpus reaches (issue #925, step 2a; the slots, issue #928).
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
 * `setup.bones`, `setup.slots` (`GATE_BLOCKS`) — is judged on its own, by a
 * `compare` of the spine-core dump against the core's with the other posed
 * block left out, and reads:
 *
 *   - `IDENTICAL` — the block agrees;
 *   - `SKIP` — the core left the block out, with the construct it names (a
 *     declared constraint for the bones; a slider keying a slot, or skins
 *     disagreeing over a placeholder, for the slots), so the row holds nothing
 *     about it;
 *   - `DIFF` — with the first difference.
 *
 * The row's own verdict is `DIFF` when any block is (or the whole comparison
 * is), `IDENTICAL` when every block is, `SKIP` otherwise — naming the blocks
 * skipped — and `REFUSED` when the build chain exited non-zero or a document
 * could not be read; a refused row is not measured and says why.
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
 * blend mode, a shown record whose name is not its placeholder or whose path
 * is not its name, each kind shown at setup, a slot on an inactive bone, and a
 * slider whose animation keys a slot. Each field no row whose `setup.slots`
 * was compared reaches is a HOLE. ⚠️ `blend` is a HOLE however many rows state
 * one: the oracle's slot row has no blend field, so no comparison reads it.
 *
 * Exit codes: 0 when every row is IDENTICAL or SKIP; 1 when any row is DIFF or
 * REFUSED; 2 on a bad input, by name. `tools/` is not `src/`: this file runs
 * child processes (through `runRecipes`) and reads the disk.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { activeBones, CORE_INHERIT_MODES, CoreInputError, foldInheritMode, readModel, shownAttachment, shownRow, type CorePlant } from '../src/core/index.ts';
import { MODEL_DOCUMENT_FILE } from '../src/model.ts';
import { HashesInputError, readRecipes, runRecipes, TREE_ROOT, treeRecipes, type Recipe } from './emit_hashes.ts';
import {
  compareDumps,
  coreDump,
  dumpSkeleton,
  loadOracleData,
  ORACLE_DEFAULT_SAMPLES,
  ORACLE_DEFAULT_TOL,
  OracleInputError,
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
  'secondSkin', 'multiFilled', 'conflicting', 'nullSetup', 'unfilled', 'colour', 'colour6', 'dark', 'dark8', 'blend',
  'nameDiffers', 'pathDiffers', 'region', 'mesh', 'linkedmesh', 'boundingbox', 'clipping', 'path', 'inactiveBone', 'sliderKeysSlot',
] as const;
export type SlotCensusField = (typeof SLOT_CENSUS_FIELDS)[number];
export type SlotCensusRow = Record<SlotCensusField, number> & { slots: number };

/** The blocks the core poses, each judged on its own. */
export const GATE_BLOCKS = ['setup.bones', 'setup.slots'] as const;
export type GateBlock = (typeof GATE_BLOCKS)[number];

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
    if (slot.blend !== undefined) out.blend++;
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

/** The core's document with every posed block but `keep` left out — so a `compare` judges that block alone. */
function only(core: OracleDocument, keep: GateBlock): OracleDocument {
  const drop = GATE_BLOCKS.filter((b) => b !== keep);
  const absent = [...(core.absent ?? [])];
  const setup = { ...core.setup };
  for (const block of drop) {
    if (block === 'setup.bones') setup.bones = null;
    else setup.slots = null;
    if (!absent.some((x) => x[0] === block)) absent.push([block, 'left out by core_gate to judge another block alone']);
  }
  return { ...core, absent, setup };
}

/** One built row: both dumps, the comparisons — whole and per block — and the census. `plant` replaces a part of the core (a control's plant). */
export function gateBuild(name: string, outDir: string, plant: CorePlant = {}): GateRow {
  const skeleton = join(outDir, 'skeleton.json');
  const atlas = join(outDir, 'skeleton.atlas');
  const model = join(outDir, MODEL_DOCUMENT_FILE);
  const missing = [skeleton, atlas, model].filter((p) => !existsSync(p));
  const refused = (why: string): GateRow => ({ name, verdict: 'REFUSED', why, blocks: null, boneSamples: 0, slotRows: 0, worstXy: 0, worstM: 0, census: null, slotCensus: null });
  if (missing.length > 0) return refused(`the build wrote no ${missing.map((p) => p.slice(outDir.length + 1)).join(', ')}`);
  let c: OracleComparison;
  let census: CensusRow;
  let slotCensus: SlotCensusRow;
  const blocks = {} as Record<GateBlock, { verdict: BlockVerdict; why: string | null }>;
  let slotRows = 0;
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
    }
    if (core.setup.slots !== null) slotRows = core.setup.slots.length;
    const reflecting = new Set(spine.setup.bones.filter((b) => b[3] !== null && b[4] !== null && b[5] !== null && b[6] !== null && b[3] * b[6] - b[4] * b[5] < 0).map((b) => b[0]));
    census = censusOf(modelText, reflecting);
    slotCensus = slotCensusOf(modelText);
  } catch (err) {
    if (err instanceof OracleInputError || err instanceof CoreInputError) return refused(err.message);
    throw err;
  }
  const base = { name, blocks, boneSamples: c.boneSamples, slotRows, worstXy: c.worstXy, worstM: c.worstM, census, slotCensus };
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
export function gateBuilt(built: readonly BuiltRow[], plant: CorePlant = {}): GateRow[] {
  return built.map((r) =>
    r.exits.some((e) => e !== 0)
      ? { name: r.name, verdict: 'REFUSED' as const, why: `the build chain exited ${JSON.stringify(r.exits)}`, blocks: null, boneSamples: 0, slotRows: 0, worstXy: 0, worstM: 0, census: null, slotCensus: null }
      : gateBuild(r.name, r.out, plant),
  );
}

/** Every recipe built into `work` and gated, in name order. */
export function gateRecipes(recipes: readonly Recipe[], work: string, root: string, progress: (line: string) => void = () => {}, plant: CorePlant = {}): GateRow[] {
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

/** The rows whose `block` was compared — IDENTICAL or DIFF on it. */
function comparedOn(rows: readonly GateRow[], block: GateBlock): GateRow[] {
  return rows.filter((r) => r.blocks !== null && r.blocks[block].verdict !== 'SKIP');
}

/**
 * Each slot field the rows whose `setup.slots` was compared reach, and the
 * HOLEs. `blend` is a HOLE on every corpus: the oracle's slot row does not
 * carry it, so the line says how many compared rows state one and that none
 * was judged.
 */
export function slotReachLines(rows: readonly GateRow[]): string[] {
  const compared = comparedOn(rows, 'setup.slots');
  const out: string[] = [];
  for (const f of SLOT_CENSUS_FIELDS) {
    const on = compared.filter((r) => (r.slotCensus?.[f] ?? 0) > 0).map((r) => r.name);
    const anywhere = rows.filter((r) => (r.slotCensus?.[f] ?? 0) > 0).map((r) => r.name);
    if (f === 'blend') out.push(`  HOLE  slots ${f}: ${on.length} compared row(s) state one, and the oracle's slot row has no blend field, so none was judged`);
    else out.push(on.length > 0 ? `  REACH slots ${f}: ${on.length} compared row(s)` : `  HOLE  slots ${f}: no compared row reaches it${anywhere.length > 0 ? ` (only ${anywhere.join(', ')}, which the core skips)` : ''}`);
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
        `  ${row.verdict.padEnd(9)} ${row.name}${blocks}: ${row.boneSamples} bone-sample(s) and ${row.slotRows} slot row(s) compared, worst Δxy ${row.worstXy.toFixed(6)}, worst Δabcd ${row.worstM.toFixed(6)}` +
          (row.why === null ? '' : ` — ${row.why}`),
      );
    }
    print('');
    for (const line of censusTable(rows)) print(line);
    print('');
    for (const line of slotCensusTable(rows)) print(line);
    print('');
    for (const line of reachLines(rows)) print(line);
    for (const line of slotReachLines(rows)) print(line);
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
