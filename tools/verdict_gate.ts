/**
 * verdict_gate — the validator's two suppliers held to the same lines over a
 * corpus (issue #1025, step 4c of #380): every recipe built through the CLI,
 * its Spine pair gated by `validate()` over what spine-core loaded and its
 * model document gated by the model side (`src/assertions/model/index.ts`)
 * over the document and rigc's core, and every moved assertion's lines
 * compared, under both profiles.
 *
 *   bun tools/verdict_gate.ts [--recipes <recipes.json>] [--root <dir>] [--work <dir>]
 *
 * With no `--recipes`, the tree's own: `tools/emit_hashes.ts`'s `treeRecipes`
 * (every fetched editor export and every gallery rig — nineteen when
 * `examples/` is fetched), built exactly as `emit_hashes run` and
 * `core_gate` build them (`buildRecipes`). `--recipes` takes an
 * `emit-hashes-recipes/1` or `emit-hashes/1` document and `--root` resolves its
 * stages, which is how a private corpus is run: its recipes live with it and
 * only the printed lines leave it.
 *
 * ## Per row
 *
 * The build's `skeleton.json`, `skeleton.atlas` and `skeleton.model.json`,
 * read from `{{out}}`. `validate()` runs over the pair with `atlasDir` the
 * output directory and nothing else — no rig, no durations, because none of
 * the moved assertions reads them — and the model side over the document with
 * the same directory, under `spine` and again under `spine-html` (A11 is a
 * renderer rule, and `spine` never runs it). For each moved assertion and
 * profile the row prints `IDENTICAL` or `DIFFERING` with both sides' lines.
 *
 * Beside the lines, the one fact a line cannot show: **the order** the skins'
 * entries are walked in (the region attachments' names and sizes and the
 * clipping count), read off both suppliers (`runtimeFacts`, `modelSkinEntries`)
 * and compared whole — an A03 that fails twice prints its two lines in that
 * order, and a rig no line fails on still has one.
 *
 * A row whose build chain exited non-zero, or that wrote no model document, or
 * whose parse both sides refused, is `REFUSED` with the reason, and compares
 * nothing. A row one side reads and the other refuses is `DIFFERING` on "the
 * parse": that is the one disagreement the region rule exists to prevent.
 *
 * ## The verdict
 *
 * The last line counts what was compared, off the rows. Exit codes as
 * `emit_hashes compare`: 0 when every line set and every walk compared is
 * identical, 1 when any differs, 2 when the input is bad by name — or when the
 * run compared nothing at all, which is no verdict.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MODEL_DOCUMENT_FILE } from '../src/model.ts';
import { readModel } from '../src/core/index.ts';
import { reportLines, runtimeFacts, validate, type ValidateProfile, type ValidateReport } from '../src/validate.ts';
import { MOVED_ASSERTIONS, validateModel, type ModelReport } from '../src/assertions/model/index.ts';
import { A00_MODEL_READ, A00_MODEL_REGIONS_ON_PAGES } from '../src/assertions/model/parse.ts';
import { modelSkinEntries } from '../src/assertions/model/skin_entries.ts';
import type { SkinEntryFacts } from '../src/assertions/facts/skin_entries.ts';
import { HashesInputError, readRecipes, treeRecipes, TREE_ROOT, type Recipe } from './emit_hashes.ts';
import { buildRecipes, type BuiltRow } from './core_gate.ts';

/** The profiles a row is gated under: `spine` runs the validity rules, `spine-html` every rule. */
export const VERDICT_PROFILES: readonly ValidateProfile[] = ['spine', 'spine-html'];

/** A refusal about an input — the command exits 2 on it. */
export class VerdictInputError extends Error {}

/** One moved assertion under one profile: both sides' lines, and whether they are the same. */
export interface VerdictCell {
  code: string;
  profile: ValidateProfile;
  spine: string[];
  model: string[];
  identical: boolean;
}

/** One recipe: refused with the reason, or every cell and the walk comparison. */
export interface VerdictRow {
  name: string;
  refused: string | null;
  cells: VerdictCell[];
  /** The skins' walk on both sides, as one string each, or null for a refused row. */
  walk: { spine: string; model: string; identical: boolean } | null;
}

/** A report line's code. */
const lineCode = (line: string): string | null => /^ {2}(?:PASS|SKIP|PROF|FAIL) {2}([A-Z0-9_]+)/.exec(line)?.[1] ?? null;

/** One code's lines in a report, as `reportLines` prints them. */
export function codeLines(report: ValidateReport | ModelReport, code: string): string[] {
  return reportLines(report as ValidateReport).filter((line) => lineCode(line) === code);
}

/** A walk of the skins as one string: every region's name and size in order, then the clipping count. */
export function walkSpelling(facts: SkinEntryFacts): string {
  return JSON.stringify([facts.regionAttachments.map((r) => [r.name, r.width, r.height]), facts.clippingCount]);
}

/** One built output directory, gated both ways. */
export function verdictRow(name: string, outDir: string): VerdictRow {
  const files = ['skeleton.json', 'skeleton.atlas', MODEL_DOCUMENT_FILE].map((f) => join(outDir, f));
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length > 0) return { name, refused: `the build wrote no ${missing.map((f) => f.slice(outDir.length + 1)).join(', ')}`, cells: [], walk: null };
  const [skeletonText, atlasText, modelText] = files.map((f) => readFileSync(f, 'utf8'));
  const cells: VerdictCell[] = [];
  for (const profile of VERDICT_PROFILES) {
    const spine = validate({ skeletonText, atlasText, atlasDir: outDir, profile });
    const model = validateModel({ modelText, atlasDir: outDir, profile });
    const spineParse = spine.failures.find((f) => f.assertion === 'A00_ROUNDTRIP_PARSE');
    const modelParse = model.failures.find((f) => f.assertion === A00_MODEL_READ || f.assertion === A00_MODEL_REGIONS_ON_PAGES);
    if (spineParse !== undefined && modelParse !== undefined) {
      return { name, refused: `both parses refused it — spine-core: ${spineParse.detail}; model: ${modelParse.assertion}: ${modelParse.detail}`, cells: [], walk: null };
    }
    if (spineParse !== undefined || modelParse !== undefined) {
      // One side read what the other refused: that is a difference, never a refusal to compare.
      const spineSaid = spineParse === undefined ? ['(read)'] : [`  FAIL  A00_ROUNDTRIP_PARSE: ${spineParse.detail}`];
      const modelSaid = modelParse === undefined ? ['(read)'] : [`  FAIL  ${modelParse.assertion}: ${modelParse.detail}`];
      cells.push({ code: 'the parse', profile, spine: spineSaid, model: modelSaid, identical: false });
      continue;
    }
    for (const { code } of MOVED_ASSERTIONS) {
      const a = codeLines(spine, code);
      const b = codeLines(model, code);
      cells.push({ code, profile, spine: a, model: b, identical: a.join('\n') === b.join('\n') });
    }
  }
  // One side refused the parse: the cells above hold that as a difference, and there is no pair of walks to read.
  if (cells.some((c) => c.code === 'the parse')) return { name, refused: null, cells, walk: null };
  const runtime = runtimeFacts(skeletonText, atlasText);
  if (runtime === null) throw new Error(`internal: ${name}: spine-core refused a pair the gate's own round trip loaded`);
  const spineWalk = walkSpelling(runtime.skinEntries);
  const modelWalk = walkSpelling(modelSkinEntries({ doc: readModel(modelText), json: JSON.parse(modelText) as Record<string, unknown> }));
  return { name, refused: null, cells, walk: { spine: spineWalk, model: modelWalk, identical: spineWalk === modelWalk } };
}

/** Built rows gated, in name order; a row whose chain exited non-zero is refused by that. */
export function verdictRows(built: readonly BuiltRow[]): VerdictRow[] {
  return built.map((r) => (r.exits.some((e) => e !== 0) ? { name: r.name, refused: `the build chain exited ${JSON.stringify(r.exits)}`, cells: [], walk: null } : verdictRow(r.name, r.out)));
}

/** Every row's lines, then the verdict line; `ok` is the exit-0 reading, `empty` the exit-2 one. */
export function verdictLines(rows: readonly VerdictRow[]): { lines: string[]; ok: boolean; empty: boolean } {
  const lines: string[] = [];
  let cells = 0;
  let differing = 0;
  let walks = 0;
  let walksDiffering = 0;
  for (const row of rows) {
    if (row.refused !== null) {
      lines.push(`  REFUSED    ${row.name} — ${row.refused}`);
      continue;
    }
    for (const cell of row.cells) {
      cells++;
      if (cell.identical) lines.push(`  IDENTICAL  ${row.name}  ${cell.code} [${cell.profile}]  ${cell.spine.length} line(s)`);
      else {
        differing++;
        lines.push(`  DIFFERING  ${row.name}  ${cell.code} [${cell.profile}]`);
        lines.push(`               spine-core: ${JSON.stringify(cell.spine)}`);
        lines.push(`               model:      ${JSON.stringify(cell.model)}`);
      }
    }
    if (row.walk !== null) {
      walks++;
      if (row.walk.identical) lines.push(`  IDENTICAL  ${row.name}  the skins' walk`);
      else {
        walksDiffering++;
        lines.push(`  DIFFERING  ${row.name}  the skins' walk`);
        lines.push(`               spine-core: ${row.walk.spine.slice(0, 400)}`);
        lines.push(`               model:      ${row.walk.model.slice(0, 400)}`);
      }
    }
  }
  const refused = rows.filter((r) => r.refused !== null).length;
  const empty = cells === 0;
  const ok = !empty && differing === 0 && walksDiffering === 0;
  lines.push(
    `${empty ? 'NOTHING COMPARED' : ok ? 'IDENTICAL' : 'DIFFERING'} — ${rows.length} recipe(s), ${refused} refused; ` +
      `${cells} line set(s) compared (${MOVED_ASSERTIONS.length} moved assertion(s) × ${VERDICT_PROFILES.length} profile(s)), ${cells - differing} identical, ${differing} differing; ` +
      `${walks} skins' walk(s) compared, ${walks - walksDiffering} identical, ${walksDiffering} differing`,
  );
  return { lines, ok, empty };
}

function parseFlags(args: readonly string[], known: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!known.includes(arg)) throw new VerdictInputError(`unknown argument ${arg}; this command takes ${known.join(', ')}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new VerdictInputError(`${arg} needs a value`);
    if (flags.has(arg)) throw new VerdictInputError(`${arg} given twice`);
    flags.set(arg, value);
    i++;
  }
  return flags;
}

/** The command; returns the exit code. */
export function verdictMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  try {
    const flags = parseFlags(argv, ['--recipes', '--root', '--work']);
    const root = resolve(flags.get('--root') ?? TREE_ROOT);
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new VerdictInputError(`--root ${root} is not a directory`);
    const named = flags.get('--recipes');
    const recipes: Recipe[] = named === undefined ? treeRecipes(root, warn) : readRecipes(named);
    if (recipes.length === 0) throw new VerdictInputError('no recipes to run');
    const workFlag = flags.get('--work');
    let work: string;
    if (workFlag === undefined) work = mkdtempSync(join(tmpdir(), 'rigc-verdict-gate-'));
    else {
      work = resolve(workFlag);
      if (existsSync(work) && readdirSync(work).length > 0) throw new VerdictInputError(`--work ${work} is not empty; every recipe runs in a fresh directory`);
      mkdirSync(work, { recursive: true });
    }
    warn(`verdict_gate: ${recipes.length} recipe(s), work directory ${work}`);
    const verdict = verdictLines(verdictRows(buildRecipes(recipes, work, root, warn)));
    for (const line of verdict.lines) print(line);
    return verdict.empty ? 2 : verdict.ok ? 0 : 1;
  } catch (err) {
    if (err instanceof VerdictInputError || err instanceof HashesInputError) {
      warn(`verdict_gate: ${err.message}`);
      return 2;
    }
    throw err;
  }
}

if (import.meta.main) process.exit(verdictMain(process.argv.slice(2)));
