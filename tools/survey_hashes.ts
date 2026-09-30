/**
 * survey_hashes — the deform survey of every build in every corpus hashed, and
 * two such documents compared across commits (issue #969, step 3e of issue
 * #380).
 *
 *   bun tools/survey_hashes.ts run --recipes <recipes.json> --out <hashes.json>
 *                                  [--source auto|spine-core|model] [--work <dir>] [--root <dir>]
 *   bun tools/survey_hashes.ts compare <a.json> <b.json>
 *
 * ⭐ Why this exists. Step 3e of issue #380 moves `src/deformmeasure.ts` from
 * posing through spine-core to posing through rigc's own core, and its gate is
 * "the same survey, byte for byte, on every corpus". Nothing held the survey's
 * bytes before: the selftest's deform controls read a handful of fields off
 * probes built to fold. This tool is that instrument and it is measurement
 * only.
 *
 * ## A row
 *
 * The recipes are `tools/emit_hashes.ts`'s, read by its own reader (an
 * `emit-hashes-recipes/1` file — `bun tools/emit_hashes.ts recipes --out …`
 * writes the tree's 19 — an `emit-hashes/1` document, or a `survey-hashes/1`
 * document, whose recipes are then re-run exactly). `--root` is how a private
 * corpus is run, as there. Each recipe's build chain runs through
 * `emit_hashes.ts`'s `runRecipe` into `{{work}}`, and then, when it exited 0:
 *
 * 1. **the survey**, in this process, through the seam `explain` reads
 *    (`surveyOfBuild` in `src/deformmeasure.ts`) over `out/skeleton.json`,
 *    `out/skeleton.atlas` and — when the build wrote one — `out/skeleton.model.json`,
 *    with no exemption (the report's reading; A39's only removes slots). The
 *    `DeformSurvey` is written as canonical JSON (below) to `<work>/survey.json`
 *    and hashed; `source` — which poser the survey used and why — is recorded
 *    beside the hash and is NOT part of it, because the gate is exactly that
 *    two sources give one survey.
 * 2. **`explain`'s `DEFORM` block**: the build's own last command re-run as
 *    `explain` (same flags), its block — from the `deform  (` header to the
 *    first empty line after it — written to `<work>/deform-block.txt` and hashed.
 * 3. **A39's lines** off the build's own log (every line naming
 *    `A39_DEFORM_KEEPS_TRIANGLE_WINDING`), hashed. `validate.ts` poses through
 *    spine-core and this change leaves it there; the row says so by not moving.
 *
 * ## Canonical JSON
 *
 * Keys sorted by UTF-16 code unit at every level, arrays in their own order, no
 * whitespace; a number as `JSON.stringify` spells it, except `-0` written `-0`
 * and a non-finite value written as the string `"NaN"`, `"Infinity"` or
 * `"-Infinity"` — so no two different doubles share a spelling and nothing is
 * folded to `null`. The top-level `source` key is left out (see 1.).
 *
 * ## `run` — the document, `"spec": "survey-hashes/1"`
 *
 * `JSON.stringify(doc, null, 2)` and a newline; key order fixed as written;
 * recipes sorted by `name` (UTF-16). Nothing about time, the work directory or
 * the host is in it; the wall time goes to stderr only.
 *
 * - `spec`; `source` — the `--source` asked for (`auto` unstated);
 * - `recipes[]` — `name`, `stage`, `commands`; `exits` — the build chain's;
 *   `used` — the poser the survey used (`model` or `spine-core`) and `why` —
 *   the reason when that is not the one asked for, else `null` (`null`, `null`
 *   when the chain refused); `survey` — `{ sha256, keys, spans, timelines }`
 *   or `null`; `explainExit`; `explain` — `{ sha256, lines }` or `null`;
 *   `a39` — `{ sha256, lines }` or `null`.
 *
 * ## `compare`
 *
 * IDENTICAL (exit 0) when every row has the same exits and the same `survey`,
 * `explain` and `a39` hashes — whatever poser each side used, which each row
 * names when the two differ (`SOURCE`). Otherwise DIFF (exit 1) naming per row
 * what differs. Exit 2 when the pair cannot be compared: not a
 * `survey-hashes/1` document, or one recipe name standing for two builds.
 *
 * ## `hooks` — every hook of the core held to spine-core at tolerance 0
 *
 *   bun tools/survey_hashes.ts hooks --recipes <recipes.json> [--work <dir>] [--root <dir>]
 *
 * Each recipe built as above; then, on its three texts, both posers of the
 * survey's seam (`deformPosers` in `src/deformmeasure.ts`) answer the same
 * calls, and every answer is compared (`hookCensus`): numbers with `Object.is`
 * (so `-0` is not `0` and a NaN matches only a NaN), float32 rows element by
 * element the same way, names with `===`. The calls are the survey's own and
 * more of them:
 *
 * - **the jump**, at every key time of every deform timeline on a mesh, every
 *   midpoint between two keys, and a quarter second past the duration, under
 *   the skin holding the mesh: the skin worn; what the timeline's slot (and
 *   every slot in `timelineSlots`) shows of the mesh and at what alpha; the
 *   mesh's world vertices with the slot's deform as posed, cleared and replaced
 *   by every key's array — each as the doubles and as the float32 rows the
 *   survey stores;
 * - **the dial**, for every slider under every skin: on a slider with a bone,
 *   each of the six local fields' setup value, then the property read and
 *   `SliderPose.time` with the field at its setup value, one probe step on,
 *   2.5 below, 37.125 above and at −1.5 times plus 0.3 — the pose the last one
 *   left read as the jump's is, on every mesh the slider's animation deforms;
 *   on a bone-less one `SliderPose.time` with the time at −0.5, 0, 0.3, half
 *   the duration, the duration and one past it (`dial.time.applied`).
 *
 * It prints one line per recipe and one per hook — `N exact of M` — and a
 * `HOOKS … EXACT|OFF` verdict (exit 0 exact, 1 off). A row the core refuses is
 * named with the refusal and counts as off.
 *
 * Exit codes throughout: 0 done (or IDENTICAL, or every hook exact), 1 DIFF (or
 * a hook off), 2 a bad input by name.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DeformTimeline, MeshAttachment, SliderData, type Skin } from '@esotericsoftware/spine-core';
import { deformPosers, surveyOfBuild, type DeformSurveyInput, type DeformSurveySource, type ShownReading, type SurveyPose } from '../src/deformmeasure.ts';
import { CoreInputError } from '../src/core/index.ts';
import { DIAL_BONE_FIELDS } from '../src/core/hooks.ts';
import { MODEL_DOCUMENT_FILE } from '../src/model.ts';
import { HashesInputError, readRecipes, recipesOfValue, runRecipe, TREE_ROOT, type Recipe, type StageEntry } from './emit_hashes.ts';

export const SURVEY_HASHES_SPEC = 'survey-hashes/1';
const CLI = join(TREE_ROOT, 'cli.ts');

/** The source a run asks for: `auto` — the model document when the build wrote one, spine-core otherwise. */
export type SurveySourceFlag = 'auto' | DeformSurveySource;
const SOURCES: readonly SurveySourceFlag[] = ['auto', 'spine-core', 'model'];

export interface HashedText {
  sha256: string;
  lines: number;
}

export interface SurveyHash {
  sha256: string;
  keys: number;
  spans: number;
  timelines: number;
}

export interface SurveyRow extends Recipe {
  exits: Array<number | null>;
  used: DeformSurveySource | null;
  why: string | null;
  survey: SurveyHash | null;
  explainExit: number | null;
  explain: HashedText | null;
  a39: HashedText | null;
}

export interface SurveyHashesDocument {
  spec: string;
  source: SurveySourceFlag;
  recipes: SurveyRow[];
}

/** UTF-16 code-unit order, never the locale's. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

/** The header's canonical JSON. */
export function canonicalJson(value: unknown, top = true): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (Object.is(value, -0)) return '-0';
    if (!Number.isFinite(value)) return JSON.stringify(String(value));
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v, false)).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined && !(top && k === 'source'))
      .sort(byCodeUnit);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k], false)}`).join(',')}}`;
  }
  throw new HashesInputError(`canonicalJson: a ${typeof value} is not JSON`);
}

/** The `DEFORM` block of an `explain` stdout: from its header to the first empty line after it. */
export function deformBlockOf(stdout: string): string[] {
  const lines = stdout.split('\n');
  const start = lines.findIndex((l) => l.startsWith('deform  ('));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start; i < lines.length && lines[i] !== ''; i++) out.push(lines[i]);
  return out;
}

function resolveArg(arg: string, work: string, out: string): string {
  return arg.split('{{work}}').join(work).split('{{out}}').join(out);
}

/** One recipe into `work`, which must not exist yet: build, survey, explain, hash. */
export function surveyRow(recipe: Recipe, work: string, root: string, source: SurveySourceFlag): SurveyRow {
  const built = runRecipe(recipe, work, root);
  const row: SurveyRow = { name: recipe.name, stage: recipe.stage, commands: recipe.commands, exits: built.exits, used: null, why: null, survey: null, explainExit: null, explain: null, a39: null };
  if (built.exits.length !== recipe.commands.length || built.exits.some((e) => e !== 0)) return row;
  const out = join(work, 'out');
  const modelPath = join(out, MODEL_DOCUMENT_FILE);
  const survey = surveyOfBuild(
    {
      skeletonText: readFileSync(join(out, 'skeleton.json'), 'utf8'),
      atlasText: readFileSync(join(out, 'skeleton.atlas'), 'utf8'),
      modelText: existsSync(modelPath) ? readFileSync(modelPath, 'utf8') : null,
    },
    new Set(),
    source,
  );
  row.used = survey.source.used;
  row.why = survey.source.why;
  const text = canonicalJson(survey);
  writeFileSync(join(work, 'survey.json'), `${text}\n`);
  row.survey = { sha256: sha(text), keys: survey.keys.length, spans: survey.spans.length, timelines: survey.timelines };
  // The build's own flags, re-run as `explain`.
  const last = recipe.commands[recipe.commands.length - 1];
  const args = ['explain', ...last.slice(1)].map((arg) => resolveArg(arg, work, join(work, 'explain-out')));
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: work, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  writeFileSync(join(work, 'log-explain.txt'), `$ rigc ${args.join(' ')}\n${result.stdout}\n--- stderr ---\n${result.stderr}`);
  row.explainExit = result.status;
  if (result.status === 0) {
    const block = deformBlockOf(result.stdout);
    writeFileSync(join(work, 'deform-block.txt'), block.map((l) => `${l}\n`).join(''));
    row.explain = { sha256: sha(block.join('\n')), lines: block.length };
  }
  const log = readFileSync(join(work, `log-${recipe.commands.length - 1}.txt`), 'utf8');
  const a39 = log.split('\n').filter((l) => l.includes('A39_DEFORM_KEEPS_TRIANGLE_WINDING'));
  row.a39 = { sha256: sha(a39.join('\n')), lines: a39.length };
  return row;
}

export function surveyHashesText(doc: SurveyHashesDocument): string {
  const ordered: SurveyHashesDocument = {
    spec: doc.spec,
    source: doc.source,
    recipes: doc.recipes.map((r) => ({
      name: r.name,
      stage: r.stage.map((s: StageEntry) => ({ from: s.from, to: s.to })),
      commands: r.commands,
      exits: r.exits,
      used: r.used,
      why: r.why,
      survey: r.survey === null ? null : { sha256: r.survey.sha256, keys: r.survey.keys, spans: r.survey.spans, timelines: r.survey.timelines },
      explainExit: r.explainExit,
      explain: r.explain === null ? null : { sha256: r.explain.sha256, lines: r.explain.lines },
      a39: r.a39 === null ? null : { sha256: r.a39.sha256, lines: r.a39.lines },
    })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Every recipe, each in `<work>/<NNN>` (name order), into one document. */
export function surveyRows(recipes: readonly Recipe[], work: string, root: string, source: SurveySourceFlag, progress: (line: string) => void): SurveyHashesDocument {
  const width = String(recipes.length).length;
  const rows = [...recipes]
    .sort((a, b) => byCodeUnit(a.name, b.name))
    .map((recipe, i) => {
      const r = surveyRow(recipe, join(work, String(i).padStart(width, '0')), root, source);
      const code = r.exits.find((e) => e !== 0);
      progress(`  build ${code === undefined ? 0 : code}  ${r.used ?? '-'}  ${r.survey === null ? '-' : `${r.survey.keys} key(s) ${r.survey.spans} span(s)`}  explain ${r.explainExit ?? '-'}  ${r.name}`);
      return r;
    });
  return { spec: SURVEY_HASHES_SPEC, source, recipes: rows };
}

// ---------------------------------------------------------------------------
// reading and comparing documents
// ---------------------------------------------------------------------------

const isHash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

/** A `survey-hashes/1` document, every malformed field named in one refusal. */
export function readSurveyHashes(path: string): SurveyHashesDocument {
  if (!existsSync(path)) throw new HashesInputError(`no such file ${path}`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new HashesInputError(`${path}: not JSON — ${(err as Error).message}`);
  }
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  if (record.spec !== SURVEY_HASHES_SPEC) throw new HashesInputError(`${path}: spec is ${JSON.stringify(record.spec ?? value)}, not ${JSON.stringify(SURVEY_HASHES_SPEC)}`);
  const problems: string[] = [];
  const source = SOURCES.find((s) => s === record.source);
  if (source === undefined) problems.push(`source is ${JSON.stringify(record.source)}, none of ${SOURCES.join(', ')}`);
  if (!Array.isArray(record.recipes)) problems.push('recipes is not an array');
  let recipes: Recipe[] = [];
  if (problems.length === 0) {
    try {
      recipes = recipesOfValue(record.recipes, path, true);
    } catch (err) {
      if (!(err instanceof HashesInputError)) throw err;
      problems.push(err.message);
    }
  }
  const text = (v: unknown, at: string): HashedText | null | undefined => {
    if (v === null) return null;
    const t = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>;
    if (!isHash(t.sha256) || !Number.isInteger(t.lines)) {
      problems.push(`${at} is not null or { sha256, lines }`);
      return undefined;
    }
    return { sha256: t.sha256, lines: t.lines as number };
  };
  const rows: SurveyRow[] = [];
  (Array.isArray(record.recipes) ? record.recipes : []).forEach((entry, i) => {
    const e = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<string, unknown>;
    const at = `recipes[${i}]`;
    const recipe = recipes.find((r) => r.name === e.name);
    const exitsOk = Array.isArray(e.exits) && e.exits.every((x) => x === null || Number.isInteger(x));
    if (!exitsOk) problems.push(`${at}.exits is not an array of integers or null`);
    const used = e.used === null ? null : (['spine-core', 'model'] as const).find((s) => s === e.used);
    if (used === undefined) problems.push(`${at}.used is ${JSON.stringify(e.used)}, not null, "spine-core" or "model"`);
    if (!(e.why === null || typeof e.why === 'string')) problems.push(`${at}.why is not null or a string`);
    let survey: SurveyHash | null | undefined = null;
    if (e.survey !== null) {
      const s = (typeof e.survey === 'object' && e.survey !== null ? e.survey : {}) as Record<string, unknown>;
      if (!isHash(s.sha256) || !Number.isInteger(s.keys) || !Number.isInteger(s.spans) || !Number.isInteger(s.timelines)) {
        problems.push(`${at}.survey is not null or { sha256, keys, spans, timelines }`);
        survey = undefined;
      } else survey = { sha256: s.sha256, keys: s.keys as number, spans: s.spans as number, timelines: s.timelines as number };
    }
    if (!(e.explainExit === null || Number.isInteger(e.explainExit))) problems.push(`${at}.explainExit is not an integer or null`);
    const explain = text(e.explain, `${at}.explain`);
    const a39 = text(e.a39, `${at}.a39`);
    if (recipe !== undefined && exitsOk && used !== undefined && survey !== undefined && explain !== undefined && a39 !== undefined) {
      rows.push({ ...recipe, exits: e.exits as Array<number | null>, used, why: (e.why as string | null) ?? null, survey, explainExit: (e.explainExit as number | null) ?? null, explain, a39 });
    }
  });
  if (problems.length > 0) throw new HashesInputError(`${path}: not a ${SURVEY_HASHES_SPEC} document — ${problems.join('; ')}`);
  return { spec: SURVEY_HASHES_SPEC, source: source as SurveySourceFlag, recipes: rows.sort((a, b) => byCodeUnit(a.name, b.name)) };
}

/** The recipes a `run` executes: a recipes file, an `emit-hashes/1` document, or a `survey-hashes/1` one. */
export function recipesFrom(path: string): Recipe[] {
  if (existsSync(path)) {
    let spec: unknown;
    try {
      spec = (JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>).spec;
    } catch {
      spec = undefined;
    }
    if (spec === SURVEY_HASHES_SPEC) return readSurveyHashes(path).recipes.map(({ name, stage, commands }) => ({ name, stage, commands }));
  }
  return readRecipes(path);
}

export interface SurveyComparison {
  identical: boolean;
  recipes: number;
  onlyA: string[];
  onlyB: string[];
  differ: Array<{ name: string; findings: string[] }>;
  /** Rows whose two sides used different posers and agree — the switch this instrument gates. */
  sources: Array<{ name: string; a: string; b: string }>;
}

/** Two documents; throws HashesInputError when they cannot be compared. */
export function compareSurveyHashes(a: SurveyHashesDocument, b: SurveyHashesDocument): SurveyComparison {
  const inA = new Map(a.recipes.map((r) => [r.name, r]));
  const inB = new Map(b.recipes.map((r) => [r.name, r]));
  const mismatched = a.recipes.filter((ra) => {
    const rb = inB.get(ra.name);
    return rb !== undefined && JSON.stringify([ra.stage, ra.commands]) !== JSON.stringify([rb.stage, rb.commands]);
  });
  if (mismatched.length > 0) {
    throw new HashesInputError(`the two documents come from different recipe sets — ${mismatched.length} name(s) stand for different builds: ${mismatched.map((r) => JSON.stringify(r.name)).join(', ')}`);
  }
  const onlyA = a.recipes.filter((r) => !inB.has(r.name)).map((r) => r.name);
  const onlyB = b.recipes.filter((r) => !inA.has(r.name)).map((r) => r.name);
  const differ: SurveyComparison['differ'] = [];
  const sources: SurveyComparison['sources'] = [];
  for (const ra of a.recipes) {
    const rb = inB.get(ra.name);
    if (rb === undefined) continue;
    const findings: string[] = [];
    if (JSON.stringify(ra.exits) !== JSON.stringify(rb.exits)) findings.push(`build exit codes ${JSON.stringify(ra.exits)} in A, ${JSON.stringify(rb.exits)} in B`);
    const s = (x: SurveyHash | null): string => (x === null ? 'none' : `${x.sha256.slice(0, 12)} (${x.keys} key(s), ${x.spans} span(s), ${x.timelines} timeline(s))`);
    if (JSON.stringify(ra.survey) !== JSON.stringify(rb.survey)) findings.push(`survey ${s(ra.survey)} in A, ${s(rb.survey)} in B`);
    const t = (x: HashedText | null): string => (x === null ? 'none' : `${x.sha256.slice(0, 12)} (${x.lines} line(s))`);
    if (ra.explainExit !== rb.explainExit) findings.push(`explain exit ${String(ra.explainExit)} in A, ${String(rb.explainExit)} in B`);
    if (JSON.stringify(ra.explain) !== JSON.stringify(rb.explain)) findings.push(`explain's DEFORM block ${t(ra.explain)} in A, ${t(rb.explain)} in B`);
    if (JSON.stringify(ra.a39) !== JSON.stringify(rb.a39)) findings.push(`A39's lines ${t(ra.a39)} in A, ${t(rb.a39)} in B`);
    if (findings.length > 0) differ.push({ name: ra.name, findings });
    if (ra.used !== rb.used) sources.push({ name: ra.name, a: `${ra.used ?? 'none'}${ra.why === null ? '' : ` (${ra.why})`}`, b: `${rb.used ?? 'none'}${rb.why === null ? '' : ` (${rb.why})`}` });
  }
  return { identical: onlyA.length === 0 && onlyB.length === 0 && differ.length === 0, recipes: a.recipes.length - onlyA.length, onlyA, onlyB, differ, sources };
}

export function surveyComparisonLines(c: SurveyComparison): string[] {
  const lines: string[] = [];
  for (const d of c.differ) {
    lines.push(`  DIFF  ${d.name}`);
    for (const f of d.findings) lines.push(`          ${f}`);
  }
  for (const s of c.sources) lines.push(`  SOURCE  ${s.name}: ${s.a} in A, ${s.b} in B`);
  for (const name of c.onlyA) lines.push(`  ONLY-A  ${name}`);
  for (const name of c.onlyB) lines.push(`  ONLY-B  ${name}`);
  if (c.identical) {
    lines.push(`IDENTICAL — ${c.recipes} recipe(s): every exit code, survey, DEFORM block and A39 line equal${c.sources.length === 0 ? '' : `; ${c.sources.length} row(s) surveyed through a different poser on each side`}`);
  } else {
    const parts = [
      `${c.differ.length} of ${c.recipes} shared recipe(s) differ${c.differ.length > 0 ? ` (${c.differ.map((d) => d.name).join(', ')})` : ''}`,
      ...(c.onlyA.length > 0 ? [`${c.onlyA.length} only in A`] : []),
      ...(c.onlyB.length > 0 ? [`${c.onlyB.length} only in B`] : []),
    ];
    lines.push(`DIFF — ${parts.join('; ')}`);
  }
  return lines;
}


// ---------------------------------------------------------------------------
// hooks — the core's answers held to spine-core's (the header's `hooks`)
// ---------------------------------------------------------------------------

/** The hooks a census counts, in the order its lines print them. */
export const HOOKS = [
  'jump.under', 'jump.shown', 'jump.rows.posed', 'jump.float32.posed', 'jump.rows.cleared', 'jump.float32.cleared', 'jump.rows.replaced', 'jump.float32.replaced',
  'dial.base', 'dial.read', 'dial.applied', 'dial.time.applied', 'dial.under', 'dial.shown', 'dial.float32.posed', 'dial.float32.cleared',
] as const;
export type Hook = (typeof HOOKS)[number];

/** One hook's count: calls answered alike, calls, and the first that was not. */
export interface HookTally {
  exact: number;
  calls: number;
  first: string | null;
}

export interface HookCensus {
  hooks: Record<Hook, HookTally>;
  /** The core's refusal, when it refused the build — every call is then off. */
  refused: string | null;
}

/** Both sides equal to the bit: `Object.is` on every number, element by element on an array, `===` on anything else. */
function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b);
  if ((Array.isArray(a) || a instanceof Float32Array) && (Array.isArray(b) || b instanceof Float32Array)) {
    if (a.length !== b.length || (a instanceof Float32Array) !== (b instanceof Float32Array)) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
  }
  return a === b;
}

/** Where two answers first part, for a finding. */
function partWays(a: unknown, b: unknown): string {
  if ((Array.isArray(a) || a instanceof Float32Array) && (Array.isArray(b) || b instanceof Float32Array)) {
    if (a.length !== b.length) return `${a.length} value(s) against ${b.length}`;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return `value ${i}: ${a[i]} against ${b[i]}`;
    return `a float32 row against a double row`;
  }
  return `${JSON.stringify(a)} against ${JSON.stringify(b)}`;
}

const SHOWN_FIELDS = ['shown', 'showsThisMesh', 'slotAlpha', 'attachmentAlpha', 'alpha'] as const;

/** The census of one build's three texts (the header's `hooks`). */
export function hookCensus(input: DeformSurveyInput & { modelText: string }): HookCensus {
  const hooks = Object.fromEntries(HOOKS.map((h) => [h, { exact: 0, calls: 0, first: null }])) as Record<Hook, HookTally>;
  const tally = (hook: Hook, where: string, a: unknown, b: unknown): void => {
    const t = hooks[hook];
    t.calls++;
    if (sameValue(a, b)) t.exact++;
    else t.first ??= `${where}: spine-core ${partWays(a, b)} from the core`;
  };
  try {
    const { data, spine, core } = deformPosers(input);
    const skins = [data.defaultSkin, ...data.skins].filter((k, i, all): k is Skin => k !== null && all.indexOf(k) === i);
    const holder = (slotIndex: number, attachment: MeshAttachment): Skin | null =>
      skins.find((k) => {
        const entries: Array<{ attachment: unknown }> = [];
        k.getAttachmentsForSlot(slotIndex, entries as Parameters<typeof k.getAttachmentsForSlot>[1]);
        return entries.some((e) => e.attachment === attachment);
      }) ?? null;
    /** The two poses read alike: the skin, and each (slot, mesh)'s shown reading and world vertices — as the survey reads them, then replaced. */
    const poses = (kind: 'jump' | 'dial', where: string, a: SurveyPose, b: SurveyPose, meshes: ReadonlyArray<{ slotIndex: number; attachment: MeshAttachment; keys: ReadonlyArray<ArrayLike<number>> }>): void => {
      tally(kind === 'jump' ? 'jump.under' : 'dial.under', where, a.under(), b.under());
      for (const { slotIndex, attachment, keys } of meshes) {
        const at = `${where} slot #${slotIndex} mesh "${attachment.name}"`;
        for (const s of [slotIndex, ...attachment.timelineSlots]) {
          const ra: ShownReading = a.shownAt(s, attachment);
          const rb: ShownReading = b.shownAt(s, attachment);
          for (const f of SHOWN_FIELDS) tally(kind === 'jump' ? 'jump.shown' : 'dial.shown', `${at} on slot #${s} ${f}`, ra[f], rb[f]);
        }
        if (kind === 'jump') tally('jump.rows.posed', at, a.rows(slotIndex, attachment, 'posed'), b.rows(slotIndex, attachment, 'posed'));
        tally(kind === 'jump' ? 'jump.float32.posed' : 'dial.float32.posed', at, a.deformed(slotIndex, attachment), b.deformed(slotIndex, attachment));
        if (kind === 'jump') tally('jump.rows.cleared', at, a.rows(slotIndex, attachment, 'cleared'), b.rows(slotIndex, attachment, 'cleared'));
        tally(kind === 'jump' ? 'jump.float32.cleared' : 'dial.float32.cleared', at, a.plain(slotIndex, attachment), b.plain(slotIndex, attachment));
        if (kind !== 'jump') continue;
        keys.forEach((v, k) => {
          tally('jump.rows.replaced', `${at} key ${k}`, a.rows(slotIndex, attachment, v), b.rows(slotIndex, attachment, v));
          tally('jump.float32.replaced', `${at} key ${k}`, a.withDeform(slotIndex, attachment, v), b.withDeform(slotIndex, attachment, v));
        });
      }
    };
    const deformed = (animation: string): Array<{ slotIndex: number; attachment: MeshAttachment; keys: ReadonlyArray<ArrayLike<number>>; timeline: DeformTimeline }> =>
      (data.findAnimation(animation)?.timelines ?? []).flatMap((tl) =>
        tl instanceof DeformTimeline && tl.attachment instanceof MeshAttachment && (tl.attachment.triangles?.length ?? 0) >= 3
          ? [{ slotIndex: tl.slotIndex, attachment: tl.attachment, keys: tl.vertices, timeline: tl }]
          : [],
      );
    for (const anim of data.animations) {
      for (const m of deformed(anim.name)) {
        const skin = holder(m.slotIndex, m.attachment);
        const frames = [...m.timeline.frames];
        const times = [...frames, ...frames.slice(1).map((t, i) => (frames[i] + t) / 2), anim.duration + 0.25];
        for (const t of times) {
          const where = `"${anim.name}" at ${t}`;
          poses('jump', where, spine.track(skin, anim.name, t), core.track(skin, anim.name, t), [m]);
        }
      }
    }
    for (const c of data.constraints) {
      if (!(c instanceof SliderData)) continue;
      const meshes = deformed(c.animation.name);
      for (const skin of skins) {
        const where = `slider "${c.name}" under skin "${skin.name}"`;
        const a = spine.dial(skin, c);
        const b = core.dial(skin, c);
        if (a === null || b === null) {
          tally('dial.applied', where, a === null ? 'no dial' : 'a dial', b === null ? 'no dial' : 'a dial');
          continue;
        }
        const probe = (field: (typeof DIAL_BONE_FIELDS)[number] | null, u: number): void => {
          const at = `${where} ${field ?? 'time'} ${u}`;
          const ra = a.at(field, u);
          const rb = b.at(field, u);
          if (field !== null) tally('dial.read', at, ra.read, rb.read);
          tally(field === null ? 'dial.time.applied' : 'dial.applied', at, ra.applied, rb.applied);
        };
        if (a.hasBone) {
          for (const field of DIAL_BONE_FIELDS) {
            const base = a.base(field);
            tally('dial.base', `${where} ${field}`, base, b.base(field));
            const step = field === 'scaleX' || field === 'scaleY' ? 0.25 : 1;
            for (const u of [base, base + step, base - 2.5, base + 37.125, base * -1.5 + 0.3]) probe(field, u);
            poses('dial', `${where} ${field}`, a.pose(), b.pose(), meshes);
          }
        } else {
          const d = c.animation.duration;
          for (const t of [-0.5, 0, 0.3, d / 2, d, d + 1]) probe(null, t);
          poses('dial', `${where} time`, a.pose(), b.pose(), meshes);
        }
      }
    }
    return { hooks, refused: null };
  } catch (err) {
    if (!(err instanceof CoreInputError)) throw err;
    return { hooks, refused: err.message };
  }
}

/** The census's lines: one per hook with calls, and the verdict. */
export function hookLines(rows: ReadonlyArray<{ name: string; census: HookCensus | null }>): { lines: string[]; exact: boolean } {
  const lines: string[] = [];
  const total = Object.fromEntries(HOOKS.map((h) => [h, { exact: 0, calls: 0, first: null }])) as Record<Hook, HookTally>;
  let refused = 0;
  for (const r of rows) {
    if (r.census === null) continue;
    if (r.census.refused !== null) {
      refused++;
      lines.push(`  REFUSED  ${r.name}: ${r.census.refused}`);
    }
    for (const h of HOOKS) {
      const t = r.census.hooks[h];
      total[h].exact += t.exact;
      total[h].calls += t.calls;
      if (t.first !== null) {
        total[h].first ??= `${r.name}: ${t.first}`;
        lines.push(`  OFF  ${r.name}  ${h}: ${t.exact} exact of ${t.calls} — first ${t.first}`);
      }
    }
  }
  for (const h of HOOKS) lines.push(`  HOOK  ${h}: ${total[h].exact} exact of ${total[h].calls}`);
  const exact = refused === 0 && HOOKS.every((h) => total[h].exact === total[h].calls);
  const counted = rows.filter((r) => r.census !== null).length;
  lines.push(`HOOKS (tolerance 0) ${exact ? 'EXACT' : 'OFF'} — ${counted} row(s) built, ${refused} refused by the core; ${HOOKS.map((h) => `${h} ${total[h].exact}/${total[h].calls}`).join(', ')}`);
  return { lines, exact };
}

// ---------------------------------------------------------------------------
// the command
// ---------------------------------------------------------------------------

export const SURVEY_HASHES_USAGE = [
  'usage:',
  '  bun tools/survey_hashes.ts run --recipes <recipes.json> --out <hashes.json> [--source auto|spine-core|model] [--work <dir>] [--root <dir>]',
  '  bun tools/survey_hashes.ts compare <a.json> <b.json>',
  '  bun tools/survey_hashes.ts hooks --recipes <recipes.json> [--work <dir>] [--root <dir>]',
  '  (the tree\'s 19 recipes: bun tools/emit_hashes.ts recipes --out <recipes.json>)',
].join('\n');

function parseFlags(args: readonly string[], known: readonly string[]): { positional: string[]; flags: Map<string, string> } {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    if (!known.includes(arg)) throw new HashesInputError(`unknown flag ${arg}; this command takes ${known.join(', ') || 'no flag'}`);
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new HashesInputError(`${arg} needs a value`);
    if (flags.has(arg)) throw new HashesInputError(`${arg} given twice`);
    flags.set(arg, value);
    i++;
  }
  return { positional, flags };
}

function freshWork(named: string | undefined): string {
  if (named === undefined) return mkdtempSync(join(tmpdir(), 'rigc-survey-hashes-'));
  const work = resolve(named);
  if (existsSync(work) && readdirSync(work).length > 0) throw new HashesInputError(`--work ${work} is not empty; every recipe runs in a fresh directory`);
  mkdirSync(work, { recursive: true });
  return work;
}

/** The command; returns the exit code. */
export function surveyHashesMain(argv: readonly string[], print: (line: string) => void = console.log, warn: (line: string) => void = console.error): number {
  const [command, ...rest] = argv;
  try {
    if (command === 'run') {
      const { positional, flags } = parseFlags(rest, ['--recipes', '--out', '--source', '--work', '--root']);
      if (positional.length > 0) throw new HashesInputError(`run takes no path, got ${positional.join(' ')}`);
      const recipesPath = flags.get('--recipes');
      const out = flags.get('--out');
      if (recipesPath === undefined) throw new HashesInputError('run: --recipes <recipes.json> is required');
      if (out === undefined) throw new HashesInputError('run: --out <hashes.json> is required');
      const asked = flags.get('--source') ?? 'auto';
      const source = SOURCES.find((s) => s === asked);
      if (source === undefined) throw new HashesInputError(`--source ${JSON.stringify(asked)} is none of ${SOURCES.join(', ')}`);
      const root = resolve(flags.get('--root') ?? TREE_ROOT);
      if (!existsSync(root) || !statSync(root).isDirectory()) throw new HashesInputError(`--root ${root} is not a directory`);
      const recipes = recipesFrom(recipesPath);
      const unstaged = recipes.flatMap((r) => r.stage.filter((e) => !existsSync(resolve(root, e.from))).map((e) => `recipe ${JSON.stringify(r.name)} stages ${JSON.stringify(e.from)}, and nothing is at ${resolve(root, e.from)}`));
      if (unstaged.length > 0) throw new HashesInputError(`${unstaged.length} input(s) missing before anything ran: ${unstaged.join('; ')}`);
      const work = freshWork(flags.get('--work'));
      warn(`survey_hashes: ${recipes.length} recipe(s), source ${source}, work directory ${work}`);
      const started = performance.now();
      const doc = surveyRows(recipes, work, root, source, print);
      writeFileSync(out, surveyHashesText(doc));
      const surveyed = doc.recipes.filter((r) => r.survey !== null).length;
      print(`survey_hashes: ${doc.recipes.length} recipe(s), ${surveyed} surveyed, ${doc.recipes.length - surveyed} refused → ${out}`);
      warn(`survey_hashes: wall time ${((performance.now() - started) / 1000).toFixed(1)} s`);
      return 0;
    }
    if (command === 'hooks') {
      const { positional, flags } = parseFlags(rest, ['--recipes', '--work', '--root']);
      if (positional.length > 0) throw new HashesInputError(`hooks takes no path, got ${positional.join(' ')}`);
      const recipesPath = flags.get('--recipes');
      if (recipesPath === undefined) throw new HashesInputError('hooks: --recipes <recipes.json> is required');
      const root = resolve(flags.get('--root') ?? TREE_ROOT);
      if (!existsSync(root) || !statSync(root).isDirectory()) throw new HashesInputError(`--root ${root} is not a directory`);
      const recipes = [...recipesFrom(recipesPath)].sort((a, b) => byCodeUnit(a.name, b.name));
      const work = freshWork(flags.get('--work'));
      warn(`survey_hashes hooks: ${recipes.length} recipe(s), work directory ${work}`);
      const width = String(recipes.length).length;
      const rows = recipes.map((recipe, i) => {
        const dir = join(work, String(i).padStart(width, '0'));
        const built = runRecipe(recipe, dir, root);
        const out = join(dir, 'out');
        const modelPath = join(out, MODEL_DOCUMENT_FILE);
        const green = built.exits.length === recipe.commands.length && built.exits.every((e) => e === 0) && existsSync(modelPath);
        const census = green ? hookCensus({ skeletonText: readFileSync(join(out, 'skeleton.json'), 'utf8'), atlasText: readFileSync(join(out, 'skeleton.atlas'), 'utf8'), modelText: readFileSync(modelPath, 'utf8') }) : null;
        const calls = census === null ? 0 : HOOKS.reduce((n, h) => n + census.hooks[h].calls, 0);
        print(`  ${census === null ? 'not built' : `${calls} call(s)`}  ${recipe.name}`);
        return { name: recipe.name, census };
      });
      const verdict = hookLines(rows);
      for (const line of verdict.lines) print(line);
      return verdict.exact ? 0 : 1;
    }
    if (command === 'compare') {
      const { positional } = parseFlags(rest, []);
      if (positional.length !== 2) throw new HashesInputError(`compare: expected <a.json> <b.json>, got ${positional.length} path(s)`);
      const c = compareSurveyHashes(readSurveyHashes(positional[0]), readSurveyHashes(positional[1]));
      print(`survey_hashes compare A=${positional[0]} B=${positional[1]}`);
      for (const line of surveyComparisonLines(c)) print(line);
      return c.identical ? 0 : 1;
    }
    throw new HashesInputError(command === undefined ? 'no command' : `unknown command ${JSON.stringify(command)}`);
  } catch (err) {
    if (err instanceof HashesInputError) {
      warn(`survey_hashes: ${err.message}`);
      if (err.message.startsWith('no command') || err.message.startsWith('unknown command')) warn(SURVEY_HASHES_USAGE);
      return 2;
    }
    throw err;
  }
}

if (import.meta.main) process.exit(surveyHashesMain(process.argv.slice(2)));
