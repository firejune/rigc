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
 * order, and a rig no line fails on still has one. And since cut 4c-1, every
 * fact family that cut added, read off both suppliers and spelled whole
 * (`factSpellings`) — the meshes, the bones an animation keys, the skin
 * members, the region joins, the atlas's pages and regions, the stage and the
 * region paths — so a value no line printed on this row is still compared.
 *
 * ## What the model side is given
 *
 * The stage and each page's `pma`, which the document does not hold until
 * issue #1026 (`src/assertions/model/given.ts`), are read off the build this
 * row gates by `modelGivenOfBuild`: the stage the skeleton header states and
 * each page's `pma` as `parseAtlasText` reads the atlas. The selftest's
 * supplier check gives them the same way. No rig is given, to either side.
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
import { parseAtlasText } from '../src/atlas.ts';
import { readModel } from '../src/core/index.ts';
import { reportLines, runtimeFacts, validate, type ValidateProfile, type ValidateReport } from '../src/validate.ts';
import { MODEL_SUPPLY, MOVED_ASSERTIONS, validateModel, type ModelReport, type ModelValidateInput } from '../src/assertions/model/index.ts';
import type { ModelGiven } from '../src/assertions/model/given.ts';
import type { ReadDocument } from '../src/assertions/model/parse.ts';
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
  /** Each fact family cut 4c-1 added, spelled on both sides (`factSpellings`); absent on a refused row. */
  facts?: Array<{ family: string; spine: string; model: string; identical: boolean }>;
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

/**
 * What the model side is given beside a build's document (issue #1025, cut
 * 4c-1; `src/assertions/model/given.ts`), read off the build itself: the stage
 * its skeleton header states — each extent where the header states a number,
 * `null` where it states neither — and each atlas page's `pma` as rigc's own
 * reader takes it (`parseAtlasText`, which `PKR01` holds field for field to
 * spine-core's). The one function both the selftest and this tool give it by.
 */
export function modelGivenOfBuild(skeletonText: string, atlasText: string): ModelGiven {
  const parsed: unknown = JSON.parse(skeletonText);
  const header = typeof parsed === 'object' && parsed !== null ? (parsed as { skeleton?: unknown }).skeleton : undefined;
  const stated = (key: 'width' | 'height'): number | undefined => {
    const value = typeof header === 'object' && header !== null ? (header as Record<string, unknown>)[key] : undefined;
    return typeof value === 'number' ? value : undefined;
  };
  const width = stated('width');
  const height = stated('height');
  return {
    stage: width === undefined && height === undefined ? null : { ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }) },
    pma: parseAtlasText(atlasText).pages.map((page) => page.pma),
  };
}

/** The fact families cut 4c-1 added, as one supplier states them — `runtimeFacts`'s, or the model side's (`modelFactSet`). */
export interface FactSet {
  skinEntries: SkinEntryFacts;
  skinMeshes: ReturnType<ModelSupplyOf<'skinMeshes'>>;
  animatedBones: ReturnType<ModelSupplyOf<'animatedBones'>>;
  skinMembers: ReturnType<ModelSupplyOf<'skinMembers'>>;
  regionJoins: ReturnType<ModelSupplyOf<'regionJoins'>>;
  atlasRegions: ReturnType<ModelSupplyOf<'atlasRegions'>>;
  stage: ReturnType<ModelSupplyOf<'stage'>>;
}
type ModelSupplyOf<K extends keyof typeof MODEL_SUPPLY> = (typeof MODEL_SUPPLY)[K];

/** The model side's `FactSet` over a document and what it is given — the suppliers `validateModel` runs, called the same way. */
export function modelFactSet(modelText: string, given: ModelGiven, supply: typeof MODEL_SUPPLY = MODEL_SUPPLY): FactSet {
  const read: ReadDocument = { doc: readModel(modelText), json: JSON.parse(modelText) as Record<string, unknown> };
  const input: ModelValidateInput = { modelText, atlasDir: '', profile: 'spine', given };
  return {
    skinEntries: supply.skinEntries(read),
    skinMeshes: supply.skinMeshes(read),
    animatedBones: supply.animatedBones(read),
    skinMembers: supply.skinMembers(read),
    regionJoins: supply.regionJoins(read),
    atlasRegions: supply.atlasRegions(read, input),
    stage: supply.stage(read, input),
  };
}

/**
 * Each family of a `FactSet` as one string, every value a body can read and
 * the order it reads them in — and where a body asks by identity (a skin's
 * constraint, a region's page, `findRegion`'s answer), the position of the
 * entry it is handed. `animations` are the names `bonesKeyedBy` is asked for.
 */
export function factSpellings(f: FactSet, animations: readonly string[]): Record<string, string> {
  const atlas = f.atlasRegions.atlas;
  const members = f.skinMembers;
  const names = atlas === null ? [] : [...new Set(atlas.regions.map((r) => r.name)), '\u0000no such region'];
  return {
    'region paths': JSON.stringify(f.skinEntries.regionAttachments.map((r) => [r.name, r.path ?? null])),
    meshes: JSON.stringify(f.skinMeshes.meshes.map((m) => [m.name, m.slot, m.slotBone, Array.from(m.triangles), m.width, m.height, Array.from(m.regionUVs), m.worldVerticesLength, m.weightBones])),
    'animated bones': JSON.stringify(animations.map((name) => [name, f.animatedBones.bonesKeyedBy(name) ?? (f.animatedBones.bonesKeyedBy(name) === null ? 'no bone timeline' : 'no such animation')])),
    'skin members': JSON.stringify([
      members.skins.map((s) => [s.name, s.bones.map((b) => members.bones.indexOf(b)), s.constraints.map((c) => members.constraints.indexOf(c))]),
      members.bones.map((b) => [b.name, b.skinRequired, b.parent === null ? null : members.bones.indexOf(b.parent)]),
      members.constraints.map((c) => [c.name, c.skinRequired]),
    ]),
    'region joins': JSON.stringify(f.regionJoins),
    atlas:
      atlas === null
        ? 'null'
        : JSON.stringify([
            atlas.pages.map((p) => [p.name, p.width, p.height, p.pma]),
            atlas.regions.map((r) => [r.name, atlas.pages.indexOf(r.page), r.x, r.y, r.width, r.height, r.degrees, r.offsetX, r.offsetY, r.originalWidth, r.originalHeight]),
            names.map((name) => {
              const found = atlas.findRegion(name);
              return found === null ? -1 : atlas.regions.indexOf(found);
            }),
          ]),
    stage: JSON.stringify([f.stage.width ?? null, f.stage.height ?? null]),
  };
}

/** The animation names a row's `bonesKeyedBy` is asked for: the document's, then `idle` (A15's), then one no skeleton holds. */
export function askedAnimations(modelText: string): string[] {
  const doc = JSON.parse(modelText) as { animations?: Array<{ name?: unknown }> };
  const named = (doc.animations ?? []).map((a) => String(a.name));
  return [...new Set([...named, 'idle', '\u0000no such animation'])];
}

/** Both sides' `factSpellings` over one build, family by family. */
export function compareFacts(skeletonText: string, atlasText: string, modelText: string): Array<{ family: string; spine: string; model: string; identical: boolean }> | null {
  const runtime = runtimeFacts(skeletonText, atlasText);
  if (runtime === null) return null;
  const animations = askedAnimations(modelText);
  const spine = factSpellings(runtime, animations);
  const model = factSpellings(modelFactSet(modelText, modelGivenOfBuild(skeletonText, atlasText)), animations);
  return Object.keys(spine).map((family) => ({ family, spine: spine[family], model: model[family], identical: spine[family] === model[family] }));
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
    const model = validateModel({ modelText, atlasDir: outDir, profile, given: modelGivenOfBuild(skeletonText, atlasText) });
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
  return { name, refused: null, cells, walk: { spine: spineWalk, model: modelWalk, identical: spineWalk === modelWalk }, facts: compareFacts(skeletonText, atlasText, modelText) ?? [] };
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
  let facts = 0;
  let factsDiffering = 0;
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
    for (const fact of row.facts ?? []) {
      facts++;
      if (fact.identical) lines.push(`  IDENTICAL  ${row.name}  the facts: ${fact.family}`);
      else {
        factsDiffering++;
        lines.push(`  DIFFERING  ${row.name}  the facts: ${fact.family}`);
        lines.push(`               spine-core: ${fact.spine.slice(0, 400)}`);
        lines.push(`               model:      ${fact.model.slice(0, 400)}`);
      }
    }
  }
  const refused = rows.filter((r) => r.refused !== null).length;
  const empty = cells === 0;
  const ok = !empty && differing === 0 && walksDiffering === 0 && factsDiffering === 0;
  lines.push(
    `${empty ? 'NOTHING COMPARED' : ok ? 'IDENTICAL' : 'DIFFERING'} — ${rows.length} recipe(s), ${refused} refused; ` +
      `${cells} line set(s) compared (${MOVED_ASSERTIONS.length} moved assertion(s) × ${VERDICT_PROFILES.length} profile(s)), ${cells - differing} identical, ${differing} differing; ` +
      `${walks} skins' walk(s) compared, ${walks - walksDiffering} identical, ${walksDiffering} differing; ` +
      `${facts} fact family reading(s) compared, ${facts - factsDiffering} identical, ${factsDiffering} differing`,
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
