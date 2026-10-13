/**
 * `rigc guide` — read exactly the row of the guide a failure line names, or one
 * numbered section of it, from the shipped `docs/AUTHORING.md` at the moment of
 * the call (issue #1397, the form shared word for word with rig-c/parts#343).
 *
 * ⭐ **The guide stays one ledger.** Nothing here keeps a copy, an index or a
 * generated split of it: every read is a slice of the file's text as it is on
 * disk when the command runs, so there is nothing to drift. The one other file
 * read is the one a code's row lives in when that is not AUTHORING — `ingest`'s
 * finding codes, whose table is `docs/INGEST.md`'s *Every finding code* — and
 * the output names the file it read.
 *
 * Pure: the texts come in as arguments and the lines go out as values, so the
 * CLI owns the reading of the files and the selftest can plant on a text.
 *
 * 📐 What counts as a **rule row** is grammar, not a hand-kept list of tables: a
 * table row (outside a code fence) whose first cell is one code span naming a
 * rule — `` `A20_MESH_WEIGHTS_COHERENT` ``, optionally after its web anchor. In
 * AUTHORING a rule name carries an underscore, which is what tells a rule from
 * the other upper-case words tables there key on (the `BLOCK`/`JUDGE`/`LOSS`
 * gutters, a picture's `REFERENCE` pane); in INGEST's finding-code table every
 * row is a rule, `DURATION` included. A row whose code holds a `<WORD>` is a
 * **family** — `ATTACHMENT_<TYPE>` — and answers for every code it spells
 * (`ATTACHMENT_POINT`) that has no row of its own.
 *
 * 📐 A section is addressed the way the shared form fixes it (HQ's ruling on
 * rig-c/parts#343): `§<n>` is the `## <n>.` heading, and `§<n>.<m>` is the m-th
 * `###` under it, **counted** when the guide is read — never a number read off
 * the heading. AUTHORING also writes the number into each `###`, so the two
 * must agree, and `numberingFaults` is what says where they do not.
 */

/** The command a pointer names — `rigc` here, `rig-parts` in the sibling package. */
export const GUIDE_BIN = 'rigc';

/** The guide, relative to the package root — what every read is a slice of. */
export const GUIDE_FILE = 'docs/AUTHORING.md';

/**
 * The shipped documents a rule's row may live in other than the guide, and the
 * heading that opens the one table of rules each holds. Only a code with no row
 * in the guide is looked for here (issue #1397, change 7).
 */
export const GUIDE_RULE_TABLES_ELSEWHERE: ReadonlyArray<{ file: string; heading: string }> = [
  { file: 'docs/INGEST.md', heading: '#### Every finding code' },
];

/**
 * The end of every failure line that names a rule: ` (see rigc guide <RULE>)` —
 * that text, that spacing. The one writer of it; `failLine` and the finding
 * line are the two callers that put it on a line.
 */
export function guidePointer(rule: string): string {
  return ` (see ${GUIDE_BIN} guide ${rule})`;
}

/** A failure line as every gate prints it: the gutter, the rule, the detail, and the pointer to the rule's row. */
export function failLine(rule: string, detail: string): string {
  return `  FAIL  ${rule}: ${detail}${guidePointer(rule)}`;
}

/** One heading outside a code fence: its level, its text, the line it is on (1-based) and its byte offset. */
export interface GuideHeading {
  level: number;
  title: string;
  line: number;
  offset: number;
}

const ENCODER = new TextEncoder();

/** A string's length in UTF-8 bytes — the size a reader's context pays for it. No `Buffer`: nothing here is Node's. */
function utf8Length(text: string): number {
  return ENCODER.encode(text).length;
}

/** A fenced block's opening, and the run of the same character that closes it. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Whether `line` closes the block `fence` opened: a run of the same character, at least as long, and nothing after it. */
function closesFence(line: string, fence: string): boolean {
  const run = /^ {0,3}(`+|~+)\s*$/.exec(line);
  return run !== null && run[1][0] === fence[0] && run[1].length >= fence.length;
}

/**
 * Every heading of a markdown text that is a heading — a `#` line inside a
 * fenced block is a shell comment or an example, and AUTHORING carries
 * hundreds of them.
 */
export function guideHeadings(text: string): GuideHeading[] {
  const out: GuideHeading[] = [];
  let fence: string | null = null;
  let offset = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opens = FENCE.exec(line);
    if (opens !== null) {
      if (fence === null) fence = opens[1];
      else if (closesFence(line, fence)) fence = null;
    } else if (fence === null) {
      const heading = /^(#{1,6}) (.*)$/.exec(line);
      if (heading !== null) out.push({ level: heading[1].length, title: heading[2].trim(), line: i + 1, offset });
    }
    offset += utf8Length(line) + 1;
  }
  return out;
}

/** One addressable section: its address, its heading, and the byte and line span it covers. */
export interface GuideSection {
  /** `5` or `5.2` — what follows `§`. */
  address: string;
  heading: GuideHeading;
  /** Byte offsets into the text: the heading's line up to the next heading of its level or above. */
  start: number;
  end: number;
  /** Line numbers, 1-based and inclusive. */
  firstLine: number;
  lastLine: number;
}

/** The number a `## ` heading carries before its first `.` — `5` for `5. Reading a failure`. */
function chapterNumber(title: string): string | null {
  const m = /^(\d+)\. /.exec(title);
  return m === null ? null : m[1];
}

/**
 * Every section `§<n>` and `§<n>.<m>` addresses, in the order the text gives
 * them. `§<n>.<m>` is the m-th `###` under `## <n>.`, counted here.
 */
export function guideSections(text: string): GuideSection[] {
  const heads = guideHeadings(text);
  const total = utf8Length(text);
  const lineCount = text.split('\n').length;
  const span = (k: number): { start: number; end: number; firstLine: number; lastLine: number } => {
    const h = heads[k];
    const next = heads.slice(k + 1).find((x) => x.level <= h.level);
    return {
      start: h.offset,
      end: next === undefined ? total : next.offset,
      firstLine: h.line,
      lastLine: next === undefined ? lineCount : next.line - 1,
    };
  };
  const out: GuideSection[] = [];
  let chapter: string | null = null;
  let m = 0;
  for (let k = 0; k < heads.length; k++) {
    const h = heads[k];
    if (h.level <= 2) {
      chapter = h.level === 2 ? chapterNumber(h.title) : null;
      m = 0;
      if (chapter !== null) out.push({ address: chapter, heading: h, ...span(k) });
    } else if (h.level === 3 && chapter !== null) {
      m++;
      out.push({ address: `${chapter}.${m}`, heading: h, ...span(k) });
    }
  }
  return out;
}

/**
 * Every `###` whose written number is not the position it is counted at — the
 * guide writes `### 5.2 …`, and `§5.2` is the second `###` under `## 5.`, so a
 * heading inserted, moved or misnumbered would make the printed number lie
 * about what `rigc guide §5.2` prints. Named by heading and line. A `###` that
 * writes no number is counted and not checked; one that writes a number not of
 * the form `<n>.<m>` is a fault, because nothing could address it by it.
 */
export function numberingFaults(text: string, file: string = GUIDE_FILE): string[] {
  const faults: string[] = [];
  for (const section of guideSections(text)) {
    if (section.heading.level !== 3) continue;
    const written = /^(\d+(?:\.\d+)*[a-z]?(?:\.\d+)*)\s/.exec(section.heading.title);
    if (written === null) continue;
    if (written[1] !== section.address) {
      faults.push(
        `${file}:${section.heading.line} "### ${section.heading.title}" writes ${written[1]} and is the ` +
          `${ordinal(Number(section.address.split('.')[1]))} ### under "## ${section.address.split('.')[0]}.", so ${GUIDE_BIN} guide §${section.address} prints it — ` +
          `renumber it ${section.address}, or make it a #### of the ### above it`,
      );
    }
  }
  return faults;
}

function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** A rule row: the rule its first cell names, the row's text, where it is, and the table it sits in. */
export interface GuideRow {
  rule: string;
  /** The row as written. */
  text: string;
  file: string;
  line: number;
  /** The table's header row and its separator, so the cells can be read by their column. */
  header: string[];
  /** The nearest heading above the row. */
  heading: GuideHeading | null;
  /** The anchor id the first cell opens with, or `null` when it carries none. */
  anchor: string | null;
}

/** A rule name as a row spells it: upper-case words joined by `_`, a `<WORD>` standing for a family's member. */
const RULE_CELL = /^\|\s*(?:<a id="([^"]*)"><\/a>)?`([A-Z][A-Z0-9]*(?:<[A-Z]+>)?(?:_(?:[A-Z0-9]+|<[A-Z]+>))*)`\s*\|/;

/**
 * Every rule row of a text. With `section` the rows are those under that
 * heading, up to the next heading of its level or above — the one table of
 * rules a document other than the guide holds; without it, every row of the
 * text whose code carries an underscore (the module comment says why).
 */
export function guideRows(text: string, file: string, section?: string): GuideRow[] {
  const heads = guideHeadings(text);
  const lines = text.split('\n');
  let from = 1;
  let to = lines.length;
  if (section !== undefined) {
    const at = heads.findIndex((h) => `${'#'.repeat(h.level)} ${h.title}`.startsWith(section));
    if (at < 0) return [];
    const next = heads.slice(at + 1).find((h) => h.level <= heads[at].level);
    from = heads[at].line + 1;
    to = next === undefined ? lines.length : next.line - 1;
  }
  const out: GuideRow[] = [];
  let fence: string | null = null;
  let header: string[] = [];
  let h = 0;
  let heading: GuideHeading | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    while (h < heads.length && heads[h].line <= i + 1) heading = heads[h++];
    const opens = FENCE.exec(line);
    if (opens !== null) {
      if (fence === null) fence = opens[1];
      else if (closesFence(line, fence)) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (line.startsWith('|') && i + 1 < lines.length && /^\|\s*:?-{3,}/.test(lines[i + 1])) header = [line, lines[i + 1]];
    if (i + 1 < from || i + 1 > to) continue;
    const row = RULE_CELL.exec(line);
    if (row === null) continue;
    if (section === undefined && !row[2].includes('_')) continue;
    out.push({ rule: row[2], text: line, file, line: i + 1, header, heading, anchor: row[1] ?? null });
  }
  return out;
}

/** Whether a family row's code (`ATTACHMENT_<TYPE>`) spells `rule`. */
export function familySpells(family: string, rule: string): boolean {
  if (!family.includes('<')) return false;
  const pattern = family.split(/<[A-Z]+>/).map((part) => part.replace(/[^A-Z0-9_]/g, '')).join('[A-Z0-9]+');
  return new RegExp(`^${pattern}$`).test(rule);
}

/** The documents `guide` reads, as their texts: the guide, and each other document a rule table lives in. */
export interface GuideTexts {
  guide: string;
  /** By file, as `GUIDE_RULE_TABLES_ELSEWHERE` names them; a file that could not be read is absent. */
  elsewhere: Readonly<Record<string, string>>;
}

/** Every rule row `guide` can print: the guide's, then each other document's table. */
export function allRuleRows(texts: GuideTexts): GuideRow[] {
  const rows = guideRows(texts.guide, GUIDE_FILE);
  for (const table of GUIDE_RULE_TABLES_ELSEWHERE) {
    const text = texts.elsewhere[table.file];
    if (text !== undefined) rows.push(...guideRows(text, table.file, table.heading));
  }
  return rows;
}

/**
 * The rows that answer for `rule`: its own rows, in the guide first; or, where
 * it has none anywhere, the family rows that spell it. Empty when nothing does.
 */
export function rowsFor(rule: string, rows: readonly GuideRow[]): GuideRow[] {
  const own = rows.filter((row) => row.rule === rule);
  if (own.length > 0) return own;
  return rows.filter((row) => familySpells(row.rule, rule));
}

/**
 * The `n` known names nearest to `asked`, case aside: a name it is the start of
 * (or, from three characters, a part of) first; then by edit distance less the
 * prefix the two share, so `A00_MODEL_READ` is nearer `A00_MODEL_REGIONS_ON_PAGES`
 * than a short name a few edits away; then by name.
 */
export function nearestNames(asked: string, known: readonly string[], n = 3): string[] {
  const key = asked.toUpperCase();
  const shared = (name: string): number => {
    let k = 0;
    while (k < key.length && k < name.length && key[k] === name[k]) k++;
    return k;
  };
  const score = (name: string): number =>
    name.toUpperCase().startsWith(key) || (key.length >= 3 && name.toUpperCase().includes(key)) ? -Infinity : editDistance(key, name.toUpperCase()) - shared(name.toUpperCase());
  return [...new Set(known)]
    .map((name) => ({ name, d: score(name) }))
    .sort((a, b) => a.d - b.d || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, n)
    .map((x) => x.name);
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** What `guide` answers: the lines to print, or a refusal sentence (exit 1). */
export type GuideAnswer = { ok: true; lines: string[] } | { ok: false; refusal: string };

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** The `§` address of the section a line of the guide sits in — its `###` when it has one, else its `## <n>.`; `null` outside every numbered section. */
function addressOfLine(sections: readonly GuideSection[], line: number): string | null {
  let best: GuideSection | null = null;
  for (const s of sections) if (s.firstLine <= line && line <= s.lastLine && (best === null || s.heading.level > best.heading.level)) best = s;
  return best === null ? null : best.address;
}

/**
 * `rigc guide <RULE>` and `rigc guide §<n>[.<m>]`, over the texts as read.
 * A rule prints every row naming it, each under the file, the `§` and the
 * heading it sits in, with its table's header so its cells read by column; a
 * section prints its text as it stands, after a line per subsection with its
 * address and size.
 */
export function guideAnswer(asked: string, texts: GuideTexts): GuideAnswer {
  const sections = guideSections(texts.guide);
  if (asked.startsWith('§')) {
    const address = asked.slice(1);
    const section = sections.find((s) => s.address === address);
    if (section === undefined) {
      // Nearest by number, not by spelling: the chapter first (§14 is nearer §13 than §1), then the subsection
      // (§5.9 is nearer §5.4 than §4.9); an address that is not numbers falls back to the spelling.
      const parts = (a: string): number[] => a.split('.').map((p) => Number.parseInt(p, 10));
      const want = parts(address);
      const near = want.some((p) => Number.isNaN(p))
        ? nearestNames(address, sections.map((s) => s.address)).map((a) => `§${a}`)
        : [...sections]
            .map((s) => ({ a: s.address, p: parts(s.address) }))
            .sort((x, y) => {
              const dx = [Math.abs(x.p[0] - want[0]), Math.abs((x.p[1] ?? 0) - (want[1] ?? 0)), x.p.length];
              const dy = [Math.abs(y.p[0] - want[0]), Math.abs((y.p[1] ?? 0) - (want[1] ?? 0)), y.p.length];
              return dx[0] - dy[0] || dx[1] - dy[1] || dx[2] - dy[2];
            })
            .slice(0, 3)
            .map((x) => `§${x.a}`);
      return {
        ok: false,
        refusal:
          `no section is addressed ${asked} in ${GUIDE_FILE}: §<n> is a "## <n>." heading and §<n>.<m> the m-th ### under it; ` +
          `the nearest are ${near.join(', ')}`,
      };
    }
    const body = texts.guide.split('\n').slice(section.firstLine - 1, section.lastLine).join('\n').replace(/\n+$/, '');
    const lines = [`${GUIDE_FILE} §${section.address}, lines ${section.firstLine}–${section.lastLine}, ${kb(section.end - section.start)}`];
    if (section.heading.level === 2) {
      const subs = sections.filter((s) => s.heading.level === 3 && s.address.startsWith(`${section.address}.`));
      for (const sub of subs) lines.push(`  §${sub.address.padEnd(6)} ${kb(sub.end - sub.start).padStart(9)}  ${sub.heading.title}`);
    }
    lines.push('', body);
    return { ok: true, lines };
  }
  const rows = allRuleRows(texts);
  const found = rowsFor(asked, rows);
  if (found.length === 0) {
    const files = [GUIDE_FILE, ...GUIDE_RULE_TABLES_ELSEWHERE.map((t) => `${t.file}'s "${t.heading.replace(/^#+ /, '')}" table`)];
    return {
      ok: false,
      refusal: `no rule is named ${asked} in ${files.join(' or ')}; the nearest are ${nearestNames(asked, rows.map((r) => r.rule)).join(', ')}`,
    };
  }
  const lines: string[] = [];
  for (const row of found) {
    if (lines.length > 0) lines.push('');
    const address = row.file === GUIDE_FILE ? addressOfLine(sections, row.line) : null;
    const where = `${row.file}${address === null ? '' : ` §${address}`}, line ${row.line}`;
    lines.push(`${where} — under "${row.heading === null ? '(no heading)' : row.heading.title}"`);
    if (row.rule !== asked) lines.push(`${asked} has no row of its own; the row for the family ${row.rule}, which spells it, answers for it`);
    lines.push(...row.header, row.text);
  }
  return { ok: true, lines };
}
