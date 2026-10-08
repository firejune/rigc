/**
 * What `npm publish` runs before it packs anything — `prepublishOnly` (issue #1249).
 *
 *     bun scripts/prepublish_gate.ts
 *
 * Always `bun run typecheck` and `bun run lint` first. Then one of two paths:
 *
 *   - `RIGC_PREPUBLISH_TALLY` unset or empty: the full one-process selftest,
 *     `bun run selftest`, exactly what this script replaced.
 *   - `RIGC_PREPUBLISH_TALLY=<path>`: the merged tally document a sharded run
 *     wrote (`bun selftest.ts --merge <file>… --tally-out <path>`), READ and
 *     held to the tree being published. Accepted only when every clause of
 *     `tallyDecision` holds — its commit is this tree's `git rev-parse HEAD`,
 *     the tree has no change against it, the `selftest.ts` that wrote it is the
 *     one on disk, every shard of its declared count is present once and
 *     exited 2 over no failure, the merge exited 0 over no failure, and its
 *     census accounts for every registered suite exactly once. Then it prints
 *     `accepted tally <path> for <sha>: <n> suites, <m> case lines, 0 FAIL` and
 *     exits 0. ANY other state — no file, a file that is not one, another
 *     commit, a red or partial or inconsistent tally — names every reason it
 *     was refused and runs the full selftest, so the publish waits for the gate
 *     rather than skipping it.
 *
 * 🔒 This is not a way past the selftest, and there is deliberately no second
 * variable, flag or shortcut. The document is evidence that the full selftest
 * already ran over exactly this commit, in the same workflow run, as the shards
 * and the merge whose verdict `ci.yml` and `release.yml` both read; the variable
 * points at that evidence, and the evidence is checked rather than believed.
 * A tally that cannot be checked is not a pass, it is a reason to run the gate.
 *
 * `tallyDecision` is pure — the tree it holds the document to is handed in — so
 * `TY46` in `selftest.ts` drives it over a genuine document and one plant per
 * refusal without running a selftest. `selftest.ts` imports the document's
 * shape and `treeHead` from here, so the writer and this reader cannot disagree
 * about either.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** The merged tally document's format word. */
export const MERGED_TALLY_SPEC = 'selftest-merged/1';

/** The variable that names the document. The only one this script reads. */
export const PREPUBLISH_TALLY_VARIABLE = 'RIGC_PREPUBLISH_TALLY';

/** One shard as the merge read it off that shard's own document. */
export interface MergedTallyShard {
  i: number;
  n: number;
  /** The commit the shard's checkout was at (`git rev-parse HEAD`), or `null` where it could not be read. */
  commit: string | null;
  /** sha256 of the `selftest.ts` that wrote the shard's document. */
  source: string;
  /** The exit the shard wrote into its document: 2 is a green shard, never 0. */
  exit: number;
  /** How many suites it ran, and the case lines and FAIL lines over them. */
  suites: number;
  cases: number;
  fails: number;
}

/** One registered suite of the merged run: who ran it, and what it printed. */
export interface MergedTallySuite {
  suite: string;
  /** The 1-based shard that ran it, or 0 for a suite the merge ran itself (it reads the whole run). */
  shard: number;
  cases: number;
  fails: number;
}

/** What `--merge … --tally-out <file>` writes, on every way a merge that read its documents ends. */
export interface MergedTally {
  spec: string;
  /** The merge's own checkout (`git rev-parse HEAD`), or `null` where it could not be read. */
  commit: string | null;
  /** sha256 of the `selftest.ts` that merged — the shards' was held equal to it before the replay. */
  source: string;
  /** The shard count every document declared. */
  n: number;
  /** The registration list, in order: the full suite set this `selftest.ts` declares. */
  registered: string[];
  shards: MergedTallyShard[];
  /** Per registered suite, in registration order. */
  suites: MergedTallySuite[];
  /** Over every suite: the case lines and the FAIL lines. */
  cases: number;
  fails: number;
  /** The exit the merge process ended with: 0 is the verdict "green". */
  exit: number;
  platform: string;
  bun: string;
}

/** The tree a document is held to: its HEAD, its changes against HEAD, and the `selftest.ts` on its disk. */
export interface TallyTree {
  head: string | null;
  /** `git status --porcelain` lines: anything here is a tree that is not the commit. */
  dirty: string[];
  source: string;
}

export type TallyDecision = { accepted: true; line: string } | { accepted: false; reasons: string[] };

/** This checkout's commit, or `null` where git cannot say (no git, not a repository). */
export function treeHead(root: string): string | null {
  const read = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const sha = read.status === 0 ? read.stdout.trim() : '';
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

/** The tree as this script holds a document to it. */
export function treeOf(root: string): TallyTree {
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  const dirty = status.status === 0 ? status.stdout.split('\n').filter((line) => line.trim() !== '') : ['`git status` could not be read'];
  const selftest = join(root, 'selftest.ts');
  const source = existsSync(selftest) ? createHash('sha256').update(readFileSync(selftest)).digest('hex') : '';
  return { head: treeHead(root), dirty, source };
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const short = (sha: unknown): string => (typeof sha === 'string' ? `${sha.slice(0, 12)}…` : JSON.stringify(sha ?? null));

/**
 * Whether the document at `path` stands for a green full selftest over `tree`
 * — and when it does not, every reason, each under a name. Pure.
 */
export function tallyDecision(parsed: unknown, path: string, tree: TallyTree): TallyDecision {
  const reasons: string[] = [];
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { accepted: false, reasons: [`TALLY_SPEC: ${path} is not a JSON object, so it is no "${MERGED_TALLY_SPEC}" document`] };
  }
  const doc = parsed as Partial<MergedTally>;
  if (doc.spec !== MERGED_TALLY_SPEC) {
    return { accepted: false, reasons: [`TALLY_SPEC: ${path} states the format ${JSON.stringify(doc.spec ?? null)}, where "${MERGED_TALLY_SPEC}" is required`] };
  }

  // The tree: the commit, its changes, the selftest that would run here.
  if (tree.head === null) reasons.push("TALLY_COMMIT: this tree's HEAD could not be read with `git rev-parse HEAD`, so no tally can be held to it");
  else if (doc.commit !== tree.head) reasons.push(`TALLY_COMMIT: the tally was written at commit ${short(doc.commit)} and the tree being published is ${short(tree.head)}`);
  if (tree.dirty.length > 0) {
    reasons.push(`TALLY_DIRTY: the tree being published differs from its commit in ${tree.dirty.length} path(s) — ${tree.dirty.slice(0, 3).join('; ')} — so a tally of the commit is not a tally of it`);
  }
  if (doc.source !== tree.source) reasons.push(`TALLY_SOURCE: the tally was written by a selftest.ts whose sha256 is ${short(doc.source)}, and this tree's is ${short(tree.source)}`);

  // The shards: one per index of the declared count, each green on its own record.
  const n = doc.n;
  const shards = Array.isArray(doc.shards) ? doc.shards : [];
  if (!isCount(n) || n < 1) {
    reasons.push(`TALLY_SHARD_MISSING: the tally declares the shard count ${JSON.stringify(n ?? null)}, which is not a whole number from 1`);
  } else {
    for (let i = 1; i <= n; i++) {
      const found = shards.filter((shard) => shard?.i === i);
      if (found.length === 0) reasons.push(`TALLY_SHARD_MISSING: shard ${i}/${n} is not in the tally, so the suites dealt to it were measured by nothing`);
      if (found.length > 1) reasons.push(`TALLY_SHARD_MISSING: shard ${i}/${n} is in the tally ${found.length} times`);
    }
    for (const shard of shards) {
      if (!isCount(shard?.i) || shard.i < 1 || shard.i > n || shard.n !== n) reasons.push(`TALLY_SHARD_MISSING: the tally carries a shard ${JSON.stringify(shard?.i ?? null)}/${JSON.stringify(shard?.n ?? null)} that is not one of 1..${n}`);
    }
  }
  const suites = Array.isArray(doc.suites) ? doc.suites : [];
  for (const shard of shards) {
    const label = `shard ${String(shard?.i)}/${String(shard?.n)}`;
    if (shard?.commit !== doc.commit) reasons.push(`TALLY_COMMIT: ${label} ran at commit ${short(shard?.commit)} and the merge at ${short(doc.commit)}`);
    if (shard?.source !== doc.source) reasons.push(`TALLY_SOURCE: ${label} was written by a selftest.ts whose sha256 is ${short(shard?.source)}, and the merge's is ${short(doc.source)}`);
    if (shard?.exit !== 2) reasons.push(`TALLY_SHARD_RED: ${label} exited ${JSON.stringify(shard?.exit ?? null)}, where a green shard exits 2`);
    const own = suites.filter((suite) => suite?.shard === shard?.i);
    const ownFails = own.reduce((sum, suite) => sum + (isCount(suite?.fails) ? suite.fails : 0), 0);
    const ownCases = own.reduce((sum, suite) => sum + (isCount(suite?.cases) ? suite.cases : 0), 0);
    if (shard?.fails !== 0) reasons.push(`TALLY_SHARD_RED: ${label} records ${JSON.stringify(shard?.fails ?? null)} FAIL line(s)`);
    if (shard?.fails !== ownFails || shard?.suites !== own.length || shard?.cases !== ownCases) {
      reasons.push(
        `TALLY_FORGED: ${label} records ${String(shard?.suites)} suite(s), ${String(shard?.cases)} case line(s) and ${String(shard?.fails)} FAIL, ` +
          `and the suites the tally deals to it add up to ${own.length}, ${ownCases} and ${ownFails}`,
      );
    }
  }

  // The census: every registered suite exactly once, run by a shard of the run or by the merge.
  const registered = Array.isArray(doc.registered) ? doc.registered.filter((key): key is string => typeof key === 'string') : [];
  if (registered.length === 0 || registered.length !== (doc.registered ?? []).length || new Set(registered).size !== registered.length) {
    reasons.push('TALLY_SUITE_MISSING: the tally states no registration list of distinct suite names, so the full suite set cannot be read off it');
  }
  const seen = new Map<string, number>();
  for (const suite of suites) seen.set(String(suite?.suite), (seen.get(String(suite?.suite)) ?? 0) + 1);
  const missing = registered.filter((key) => !seen.has(key));
  if (missing.length > 0) reasons.push(`TALLY_SUITE_MISSING: ${missing.length} registered suite(s) are in no shard's or the merge's record: ${missing.slice(0, 5).join(', ')}`);
  const twice = [...seen].filter(([, times]) => times > 1).map(([key]) => key);
  if (twice.length > 0) reasons.push(`TALLY_SUITE_MISSING: ${twice.length} suite(s) are recorded more than once: ${twice.slice(0, 5).join(', ')}`);
  const strangers = [...seen.keys()].filter((key) => !registered.includes(key));
  if (strangers.length > 0) reasons.push(`TALLY_SUITE_MISSING: ${strangers.length} recorded suite(s) are not registered: ${strangers.slice(0, 5).join(', ')}`);
  if (suites.length === registered.length && missing.length === 0 && twice.length === 0 && suites.some((suite, k) => suite?.suite !== registered[k])) {
    reasons.push('TALLY_SUITE_MISSING: the suites are recorded out of registration order, so the record is not the replay the merge made');
  }
  for (const suite of suites) {
    if (!isCount(suite?.shard) || (isCount(n) && suite.shard > n)) reasons.push(`TALLY_SUITE_MISSING: the suite "${String(suite?.suite)}" is dealt to ${JSON.stringify(suite?.shard ?? null)}, which is neither the merge (0) nor a shard of 1..${String(n)}`);
    if (!isCount(suite?.cases) || !isCount(suite?.fails)) reasons.push(`TALLY_FORGED: the suite "${String(suite?.suite)}" records no whole count of case lines and FAIL lines`);
  }

  // The merge: exit 0, and a record that says so.
  const totalFails = suites.reduce((sum, suite) => sum + (isCount(suite?.fails) ? suite.fails : 0), 0);
  const totalCases = suites.reduce((sum, suite) => sum + (isCount(suite?.cases) ? suite.cases : 0), 0);
  if (doc.exit !== 0) reasons.push(`TALLY_MERGE_EXIT: the merge exited ${JSON.stringify(doc.exit ?? null)}, and only 0 is a verdict that the tree is green`);
  if (doc.fails !== 0 || totalFails !== 0) reasons.push(`TALLY_MERGE_EXIT: the merge records ${JSON.stringify(doc.fails ?? null)} FAIL line(s) and its suites ${totalFails}`);
  if (doc.fails !== totalFails || doc.cases !== totalCases) {
    reasons.push(`TALLY_FORGED: the merge records ${String(doc.cases)} case line(s) and ${String(doc.fails)} FAIL, and its suites add up to ${totalCases} and ${totalFails}`);
  }
  if (totalCases === 0) reasons.push('TALLY_SUITE_MISSING: the tally records no case line at all, which is an empty gate rather than a green one');

  if (reasons.length > 0) return { accepted: false, reasons };
  return { accepted: true, line: `accepted tally ${path} for ${String(doc.commit)}: ${registered.length} suites, ${totalCases} case lines, 0 FAIL` };
}

/** The document at `path`, parsed, or the refusal for a file that is not readable JSON. */
export function readTally(path: string): unknown | TallyDecision {
  if (!existsSync(path)) return { accepted: false, reasons: [`TALLY_ABSENT: ${path} does not exist`] } satisfies TallyDecision;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    return { accepted: false, reasons: [`TALLY_SPEC: ${path} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`] } satisfies TallyDecision;
  }
}

const isDecision = (value: unknown): value is TallyDecision =>
  value !== null && typeof value === 'object' && 'accepted' in value && (value as { accepted: unknown }).accepted === false && 'reasons' in value;

/** One `bun run <script>`, its output on this process's, and its exit (1 for a signal). */
function run(root: string, script: string): number {
  const ran = spawnSync(process.execPath, ['run', script], { cwd: root, stdio: 'inherit' });
  return ran.status ?? 1;
}

function main(): number {
  const root = resolve(import.meta.dir, '..');
  for (const script of ['typecheck', 'lint']) {
    const code = run(root, script);
    if (code !== 0) {
      console.error(`prepublish: \`bun run ${script}\` exited ${code}, so nothing is published`);
      return code;
    }
  }
  const named = process.env[PREPUBLISH_TALLY_VARIABLE];
  if (named === undefined || named === '') {
    console.log(`prepublish: ${PREPUBLISH_TALLY_VARIABLE} is not set, so the full selftest runs`);
    return run(root, 'selftest');
  }
  const path = resolve(named);
  const read = readTally(path);
  const decision = isDecision(read) ? read : tallyDecision(read, path, treeOf(root));
  if (decision.accepted) {
    console.log(`prepublish: ${decision.line}`);
    return 0;
  }
  console.error(`prepublish: the tally ${PREPUBLISH_TALLY_VARIABLE} names was NOT accepted, so the full selftest runs:`);
  for (const reason of decision.reasons) console.error(`  ${reason}`);
  return run(root, 'selftest');
}

if (import.meta.main) process.exit(main());
