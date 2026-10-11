/**
 * Whether release-please can read a commit message, asked of the parser
 * release-please itself uses (issue #1354).
 *
 *     bun scripts/commit_parse.ts message <file | ->
 *     bun scripts/commit_parse.ts pr
 *     bun scripts/commit_parse.ts history <n> [<ref>]
 *
 * 🚨 **The incident.** The squash of #1352 (1c04a03) shipped nothing. Line 20
 * of its body began with a code span holding a call, the conventional-commit
 * grammar reads `name(` at the start of a body line as the start of a footer
 * token, and the parser threw `unexpected token '(' at 20:23, valid tokens
 * [)]`. release-please catches that throw, logs it at debug level, counts the
 * commit as nothing and **concludes success** — so the release run was green
 * and opened no release pull request. A rule a person has to remember breaks
 * again; this reads the text before the merge, where the author can still
 * change it.
 *
 * ⭐ **The verdict is the release run's verdict because the parser is the
 * release run's parser.** `release.yml` runs `googleapis/release-please-action@v4`,
 * which resolved to 5c625bfb5d1ff62eadeeb3772007f7f66fdcf071 on run 38147112861
 * and logged `Running release-please version: 17.3.0`. That action's lockfile at
 * that SHA pins `@conventional-commits/parser` to **0.4.1**, which is also the
 * newest version the registry carries, and `package.json` pins the same version
 * exactly — not a range, and not a regex that looks like the grammar. On the
 * message of 1c04a03 this script prints `20:23` and the same error text the
 * release log printed, byte for byte. When the action moves to a release-please
 * that pins another parser, the devDependency moves with it.
 *
 * What release-please does around the parser is mirrored here from its
 * `build/src/commit.js` at 17.3.0 rather than imported, because importing it
 * means installing release-please and its thirty-odd runtime dependencies for
 * a dozen lines: `preprocessCommitMessage` (a `BEGIN_COMMIT_OVERRIDE` …
 * `END_COMMIT_OVERRIDE` block in the pull request body replaces the commit
 * message outright), and `splitMessages` (`BEGIN_NESTED_COMMIT` …
 * `END_NESTED_COMMIT` blocks become messages of their own, and the rest is cut
 * before every blank line followed by a conventional header). Each resulting
 * part is handed to the parser on its own, as release-please hands it, so a
 * fault's position is printed twice: within the part, which is what the
 * release log would say, and within the whole text, which is where the author
 * edits.
 *
 * 📜 **Which text the squash writes**, read from the repository's settings
 * (`gh api repos/rig-c/core`): `squash_merge_commit_title` is
 * `COMMIT_OR_PR_TITLE` and `squash_merge_commit_message` is `COMMIT_MESSAGES`.
 * GitHub documents those as: the title is the one commit's own subject when
 * the branch carries one commit, and the pull request title when it carries
 * more, followed by ` (#N)`; the body is the one commit's own body, or, for
 * more than one, every commit message in order, each opened by `* `, joined by
 * a blank line, and — when any of them carries a `Co-authored-by:` trailer —
 * closed by a `---------` line and the distinct co-authors. Both shapes are
 * measured on this repository's `main`: #1352 is one commit under a pull
 * request titled `feat(validate): A51 — bones declared to share an axis …`,
 * and `main` carries the commit's own subject instead; #1233 is two commits,
 * and 3604330 carries the title, the two `* ` messages and the `---------`
 * block. So `pr` reads the commits on the branch, and the pull request title
 * only when there is more than one of them. The pull request body reaches the
 * squash on neither shape, and is read only for the override block, which
 * release-please reads from it at release time.
 *
 * ⚖️ `squashText` was replayed over the 100 newest merged pull requests (97 of
 * one commit, 3 of several) against the commit each landed as on `main`: 58
 * byte-identical, and the other 42 differ only in `Co-authored-by:` lines —
 * GitHub adds one naming the commit's author when somebody else merges (every
 * release pull request gains `github-actions[bot]`), and once dropped one —
 * which depend on who presses the button and cannot be known before it. The
 * parse verdict agreed on all 100. A one-commit body's trailers are written in
 * GitHub's casing, `Co-authored-by:`, as `main` carries them.
 *
 * 🕳️ **What this cannot see.** The merge box lets whoever merges rewrite the
 * title and body after this has run, and nothing available to a pull request
 * check can read that edit. The text it reads is the text the squash writes
 * when nobody edits it.
 *
 * `message` parses a file (or stdin) as one commit message. `pr` assembles the
 * squash text from `PR_TITLE`, `PR_NUMBER`, `PR_BODY`, `BASE_SHA` and
 * `HEAD_SHA` in the environment — never from arguments, since a pull request
 * title and body are a stranger's text — and the branch commits from git.
 * `history` parses the newest `<n>` commits on `<ref>` (default `HEAD`) and
 * names each one release-please would have skipped.
 *
 * Exit codes: **0** every message parses; **1** at least one does not, each
 * named with its line, column and the line itself; **2** a usage error or a
 * git read that did not complete, so nothing was measured.
 *
 * Not `tools/`: it does not ship, and it runs from a checkout.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parser } from '@conventional-commits/parser';

/** One message release-please would hand to the parser, and where it starts in the text it came from. */
export interface ReleasePart {
  text: string;
  /** Zero-based line of the text on which this part's first line sits, or null when the part is not one contiguous run of it. */
  firstLine: number | null;
}

export interface ParseFault {
  /** The parser's own error text, unchanged. */
  error: string;
  /** One-based position within the part, as the release log prints it. Null when the error carries none. */
  partLine: number | null;
  partColumn: number | null;
  /** One-based line within the whole text, when the part can be placed in it. */
  line: number | null;
  /** The offending line, as the author wrote it. */
  lineText: string | null;
  partIndex: number;
  partCount: number;
}

const CONVENTIONAL_SPLIT = /\r?\n\r?\n(?=(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\(.*?\))?: )/;

/**
 * release-please 17.3.0's `preprocessCommitMessage` followed by its
 * `splitMessages`, with each part's starting line tracked where it has one.
 */
export function releasePleaseParts(message: string, pullRequestBody: string | null = null): { parts: ReleasePart[]; source: string; overridden: boolean } {
  if (pullRequestBody !== null) {
    const override = (pullRequestBody.split('BEGIN_COMMIT_OVERRIDE')[1] ?? '').split('END_COMMIT_OVERRIDE')[0].trim();
    if (override !== '') return { parts: splitMessages(override), source: override, overridden: true };
  }
  return { parts: splitMessages(message), source: message, overridden: false };
}

function lineOf(text: string, index: number): number {
  let line = 0;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function splitMessages(message: string): ReleasePart[] {
  const pieces = message.split('BEGIN_NESTED_COMMIT');
  let main = pieces.shift() ?? '';
  const nested: ReleasePart[] = [];
  let cursor = main.length;
  let contiguous = true;
  for (const piece of pieces) {
    const at = cursor + 'BEGIN_NESTED_COMMIT'.length;
    const [inner, ...rest] = piece.split('END_NESTED_COMMIT');
    nested.push({ text: inner, firstLine: lineOf(message, at) });
    const tail = rest.join('END_NESTED_COMMIT');
    if (tail.trim() !== '') contiguous = false;
    main += tail;
    cursor = at + piece.length;
  }
  const out: ReleasePart[] = [];
  let from = 0;
  for (const text of main.split(CONVENTIONAL_SPLIT)) {
    const start = main.indexOf(text, from);
    from = start + text.length;
    if (text === '') continue;
    out.push({ text, firstLine: contiguous && start >= 0 ? lineOf(main, start) : null });
  }
  return [...out, ...nested];
}

/** Every fault release-please's parser raises on this message, in release-please's own order of parts. */
export function parseFaults(message: string, pullRequestBody: string | null = null): ParseFault[] {
  const { parts, source } = releasePleaseParts(message, pullRequestBody);
  const wholeLines = source.split('\n');
  const faults: ParseFault[] = [];
  parts.forEach((part, partIndex) => {
    try {
      parser(part.text);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const at = / at (\d+):(\d+),/.exec(text);
      const partLine = at === null ? null : Number(at[1]);
      const partColumn = at === null ? null : Number(at[2]);
      const line = partLine === null || part.firstLine === null ? null : part.firstLine + partLine;
      const partLines = part.text.split('\n');
      const lineText = line !== null ? (wholeLines[line - 1] ?? null) : partLine !== null ? (partLines[partLine - 1] ?? null) : null;
      faults.push({ error: text, partLine, partColumn, line, lineText, partIndex, partCount: parts.length });
    }
  });
  return faults;
}

/** The faults as an author reads them: where, what the parser said, the line, and a caret under the column. */
export function describeFaults(label: string, faults: readonly ParseFault[]): string[] {
  const lines: string[] = [];
  for (const fault of faults) {
    const where = fault.line !== null ? `line ${fault.line}:${fault.partColumn}` : fault.partLine !== null ? `line ${fault.partLine}:${fault.partColumn} of part ${fault.partIndex + 1}` : 'no position';
    const part = fault.partCount > 1 ? ` (release-please reads part ${fault.partIndex + 1} of ${fault.partCount}, at ${fault.partLine}:${fault.partColumn})` : '';
    lines.push(`${label}: ${where}${part}: ${fault.error.replace(/\n/g, '\\n')}`);
    if (fault.lineText !== null) {
      lines.push(`  | ${fault.lineText}`);
      if (fault.partColumn !== null) lines.push(`  | ${' '.repeat(Math.max(0, fault.partColumn - 1))}^`);
    }
  }
  return lines;
}

export interface SquashInput {
  /** The pull request title. */
  title: string;
  /** The pull request number, which GitHub appends to the subject as ` (#N)`. */
  number: string;
  /** Every commit message on the branch, oldest first, as `git log --format=%B` gives it. */
  commits: readonly string[];
}

/**
 * The squash commit message GitHub writes under `COMMIT_OR_PR_TITLE` and
 * `COMMIT_MESSAGES` when nobody edits the merge box.
 */
export function squashText(input: SquashInput): string {
  if (input.commits.length === 0) throw new Error('a pull request with no commits has no squash text');
  const messages = input.commits.map((message) => message.replace(/\s+$/, ''));
  if (messages.length === 1) {
    const [subject, ...rest] = messages[0].split('\n');
    const body = rest
      .map((line) => line.replace(/^co-authored-by:/i, 'Co-authored-by:'))
      .join('\n')
      .replace(/^\s*\n/, '');
    return body === '' ? `${subject} (#${input.number})` : `${subject} (#${input.number})\n\n${body}`;
  }
  const coAuthors: string[] = [];
  for (const message of messages) {
    for (const line of message.split('\n')) {
      const m = /^co-authored-by:\s*(.+?)\s*$/i.exec(line);
      if (m !== null && !coAuthors.includes(m[1])) coAuthors.push(m[1]);
    }
  }
  const body = messages.map((message) => `* ${message}`).join('\n\n');
  const trailer = coAuthors.length === 0 ? '' : `\n\n---------\n\n${coAuthors.map((who) => `Co-authored-by: ${who}`).join('\n')}`;
  return `${input.title} (#${input.number})\n\n${body}${trailer}`;
}

/**
 * The pull request check's whole judgement over text it is handed, with no git
 * and no environment in it — `pr` calls it, and so does the selftest, so the
 * controls and the check are one piece of code rather than two agreeing.
 */
export function judgeSquash(input: SquashInput & { body: string }): { exit: 0 | 1; lines: string[]; faults: ParseFault[] } {
  const text = squashText(input);
  const { source, overridden } = releasePleaseParts(text, input.body);
  const what = overridden ? 'the commit override' : 'the squash text';
  const lines = [
    `${input.commits.length} commit(s) on the branch, so the squash subject is ${input.commits.length === 1 ? "the commit's own" : 'the pull request title'}` +
      (overridden ? '; the pull request body carries BEGIN_COMMIT_OVERRIDE, which release-please reads instead of the squash text' : ''),
    overridden ? 'the override release-please reads:' : 'the squash text, as GitHub writes it when the merge box is left alone:',
    ...source.split('\n').map((line) => `  > ${line}`),
  ];
  const faults = parseFaults(text, input.body);
  if (faults.length === 0) return { exit: 0, lines: [...lines, `release-please parses ${what}`], faults };
  lines.push(...describeFaults(what, faults));
  lines.push('release-please would skip this landing, and its release run would still conclude success.');
  if (faults.some((fault) => (fault.line ?? fault.partLine) === 1)) {
    lines.push(
      `The subject has to open with a conventional type, \`type(scope): …\` — and the subject is ${input.commits.length === 1 ? "the one commit's own, so amend it" : 'the pull request title, so edit it'}.`,
    );
  }
  if (faults.some((fault) => (fault.line ?? fault.partLine ?? 1) > 1)) {
    lines.push(
      `The body is ${input.commits.length === 1 ? "the one commit's own body" : 'every commit message on the branch'}, so the line is fixed by amending that commit or replacing it. ` +
        'A line that opens with a word and an open parenthesis is read as the start of a footer token, and it fails when another parenthesis or the end of the line comes before the closing one; ' +
        'moving the code span off the start of the line settles it.',
    );
  }
  return { exit: 1, lines, faults };
}

function git(args: string[]): string | null {
  const ran = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (ran.status !== 0) {
    console.error(`git ${args.join(' ')} exited ${ran.status}: ${(ran.stderr ?? '').trim()}`);
    return null;
  }
  return ran.stdout;
}

function report(label: string, faults: readonly ParseFault[]): number {
  if (faults.length === 0) return 0;
  for (const line of describeFaults(label, faults)) console.log(line);
  return 1;
}

function main(argv: string[]): number {
  const [mode, ...rest] = argv;
  if (mode === 'message' && rest.length === 1) {
    const text = rest[0] === '-' ? readFileSync(0, 'utf8') : readFileSync(rest[0], 'utf8');
    const faults = parseFaults(text);
    if (report(rest[0] === '-' ? 'stdin' : rest[0], faults) !== 0) return 1;
    console.log('release-please parses this message');
    return 0;
  }
  if (mode === 'pr' && rest.length === 0) {
    const env = (name: string): string | null => {
      const value = process.env[name];
      return value === undefined ? null : value;
    };
    const title = env('PR_TITLE');
    const number = env('PR_NUMBER');
    const base = env('BASE_SHA');
    const head = env('HEAD_SHA');
    const body = env('PR_BODY') ?? '';
    if (title === null || number === null || base === null || head === null) {
      console.error('pr reads PR_TITLE, PR_NUMBER, BASE_SHA and HEAD_SHA (and PR_BODY) from the environment, and one of the four is unset');
      return 2;
    }
    const mergeBase = git(['merge-base', base, head]);
    if (mergeBase === null) return 2;
    const log = git(['log', '--reverse', '--format=%B%x00', `${mergeBase.trim()}..${head}`]);
    if (log === null) return 2;
    const commits = log.split('\0').map((m) => m.replace(/^\n/, '')).filter((m) => m.trim() !== '');
    if (commits.length === 0) {
      console.error(`no commits between ${mergeBase.trim()} and ${head}, so there is no squash text to read`);
      return 2;
    }
    const verdict = judgeSquash({ title, number, commits, body });
    for (const line of verdict.lines) console.log(line);
    return verdict.exit;
  }
  if (mode === 'history' && (rest.length === 1 || rest.length === 2) && /^[1-9]\d*$/.test(rest[0])) {
    const ref = rest[1] ?? 'HEAD';
    const log = git(['log', `-n${rest[0]}`, '--format=%H%x01%B%x00', ref]);
    if (log === null) return 2;
    const entries = log
      .split('\0')
      .map((entry) => entry.replace(/^\n/, ''))
      .filter((entry) => entry.includes('\x01'))
      .map((entry) => {
        const [sha, message] = entry.split('\x01');
        return { sha, message };
      });
    let failed = 0;
    for (const { sha, message } of entries) {
      const faults = parseFaults(message);
      if (faults.length > 0) {
        failed++;
        report(`${sha.slice(0, 12)} ${message.split('\n')[0].slice(0, 72)}`, faults);
      }
    }
    console.log(`${entries.length - failed} of ${entries.length} commit(s) on ${ref} parse; ${failed} would be skipped by release-please`);
    return failed === 0 ? 0 : 1;
  }
  console.error('usage: bun scripts/commit_parse.ts message <file | -> | pr | history <n> [<ref>]');
  return 2;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
