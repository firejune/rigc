/**
 * core_gate — the equivalence gate of issue #380 run over a corpus: every
 * recipe built through the CLI, its Spine build posed by spine-core and its
 * model document posed by rigc's own core, the two compared, and the census of
 * what the corpus reaches (issue #925, step 2a).
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
 * every skin, no physics), then `compare`. A row reads:
 *
 *   - `IDENTICAL` — the blocks both documents carry agree, and `setup.bones` is
 *     among them;
 *   - `SKIP setup.bones` — the core left the block out, with the construct it
 *     names (a declared constraint), so the row holds nothing about bones;
 *   - `DIFF` — with the first difference, and the worst deltas;
 *   - `REFUSED` — the build chain exited non-zero, or a document could not be
 *     read; the row is not measured and says why.
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
 * Exit codes: 0 when every row is IDENTICAL or SKIP; 1 when any row is DIFF or
 * REFUSED; 2 on a bad input, by name. `tools/` is not `src/`: this file runs
 * child processes (through `runRecipes`) and reads the disk.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CORE_INHERIT_MODES, CoreInputError, foldInheritMode, readModel, type SetupEvaluator } from '../src/core/index.ts';
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

export type GateVerdict = 'IDENTICAL' | 'SKIP' | 'DIFF' | 'REFUSED';

export interface GateRow {
  name: string;
  verdict: GateVerdict;
  /** Why: the SKIP's construct, the DIFF's first difference, the REFUSED's cause; null on IDENTICAL. */
  why: string | null;
  /** Bone-samples `compare` compared (the setup pose's bones, when carried). */
  boneSamples: number;
  worstXy: number;
  worstM: number;
  census: CensusRow | null;
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

/** One built row: both dumps, the comparison, the census. `evaluate` replaces the core's evaluator (a control's plant). */
export function gateBuild(name: string, outDir: string, evaluate?: SetupEvaluator): GateRow {
  const skeleton = join(outDir, 'skeleton.json');
  const atlas = join(outDir, 'skeleton.atlas');
  const model = join(outDir, MODEL_DOCUMENT_FILE);
  const missing = [skeleton, atlas, model].filter((p) => !existsSync(p));
  const refused = (why: string): GateRow => ({ name, verdict: 'REFUSED', why, boneSamples: 0, worstXy: 0, worstM: 0, census: null });
  if (missing.length > 0) return refused(`the build wrote no ${missing.map((p) => p.slice(outDir.length + 1)).join(', ')}`);
  let c: OracleComparison;
  let census: CensusRow;
  try {
    const spine = dumpSkeleton(loadOracleData(readFileSync(skeleton, 'utf8'), readFileSync(atlas, 'utf8'), skeleton), GATE_OPTIONS);
    const modelText = readFileSync(model, 'utf8');
    const core = coreDump(readModel(modelText, model), GATE_OPTIONS, evaluate);
    c = compareDumps(spine, core, { xy: ORACLE_DEFAULT_TOL, m: ORACLE_DEFAULT_TOL });
    const reflecting = new Set(spine.setup.bones.filter((b) => b[3] !== null && b[4] !== null && b[5] !== null && b[6] !== null && b[3] * b[6] - b[4] * b[5] < 0).map((b) => b[0]));
    census = censusOf(modelText, reflecting);
  } catch (err) {
    if (err instanceof OracleInputError || err instanceof CoreInputError) return refused(err.message);
    throw err;
  }
  const skip = c.skipped.find((s) => s.startsWith('setup.bones:'));
  const base = { name, boneSamples: c.boneSamples, worstXy: c.worstXy, worstM: c.worstM, census };
  if (!c.identical) return { ...base, verdict: 'DIFF', why: c.first };
  if (skip !== undefined) return { ...base, verdict: 'SKIP', why: skip.slice(skip.indexOf('—') + 2) };
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

/** Built rows gated; `evaluate` replaces the core's evaluator on every row (a control's plant). */
export function gateBuilt(built: readonly BuiltRow[], evaluate?: SetupEvaluator): GateRow[] {
  return built.map((r) =>
    r.exits.some((e) => e !== 0)
      ? { name: r.name, verdict: 'REFUSED' as const, why: `the build chain exited ${JSON.stringify(r.exits)}`, boneSamples: 0, worstXy: 0, worstM: 0, census: null }
      : gateBuild(r.name, r.out, evaluate),
  );
}

/** Every recipe built into `work` and gated, in name order. */
export function gateRecipes(recipes: readonly Recipe[], work: string, root: string, progress: (line: string) => void = () => {}, evaluate?: SetupEvaluator): GateRow[] {
  return gateBuilt(buildRecipes(recipes, work, root, progress), evaluate);
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
    out.push(`| ${row.name} | ${row.verdict} | ${cells.join(' | ')} |`);
  }
  out.push(`| **all** | | ${total.join(' | ')} |`);
  return out;
}

/** Each mode and field the compared rows reach, and the HOLEs — what no compared row reaches. */
export function reachLines(rows: readonly GateRow[]): string[] {
  const compared = rows.filter((r) => r.verdict === 'IDENTICAL' || r.verdict === 'DIFF');
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
  const ok = count('DIFF') === 0 && count('REFUSED') === 0;
  return {
    ok,
    line:
      `${ok ? 'GREEN' : 'RED'} — ${rows.length} row(s): ${count('IDENTICAL')} IDENTICAL on setup.bones, ${count('SKIP')} SKIP, ` +
      `${count('DIFF')} DIFF, ${count('REFUSED')} REFUSED`,
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
      print(
        `  ${row.verdict.padEnd(9)} ${row.name}: ${row.boneSamples} bone-sample(s) compared, worst Δxy ${row.worstXy.toFixed(6)}, worst Δabcd ${row.worstM.toFixed(6)}` +
          (row.why === null ? '' : ` — ${row.why}`),
      );
    }
    print('');
    for (const line of censusTable(rows)) print(line);
    print('');
    for (const line of reachLines(rows)) print(line);
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
