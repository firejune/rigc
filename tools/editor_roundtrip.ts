/**
 * The editor round trip, as a tool (issue #374).
 *
 * `build` → import into the Spine editor → export back to JSON → gate, `diff`,
 * `render` and `check` the export against the build it came from — the last two
 * **once per skin the build declares** (issue #571; see `skinBlocks`). It is the
 * one measurement that answers *"does the editor accept what rigc wrote, and does
 * what comes back still play the same"*, and on its first run it found three
 * emitter defects (#368 `hull`/`edges`, #369 hold curves, #370
 * `skeleton.images`) before proving that a human edit survives the trip.
 *
 * ⭐ Every step quotes what its child said when that child did not do what it was
 * for (#541, and step 5 since #621). A skin NEITHER side can draw is a SKIP
 * naming that rather than a red — `check` had nothing to compare, and `validate`
 * and `diff` have already measured the rig — while a skin only ONE side draws is
 * the divergence this whole file exists to find and stays a failure.
 *
 * It ran from a shell script in a local scratch directory. A tool nobody can
 * find is not a tool, hence this file.
 *
 * ## What it is not
 *
 * 🔒 **It is not a way to get Spine data without the editor** — it is the
 * opposite, a harness that requires one. It drives only the documented command
 * line (https://esotericsoftware.com/spine-command-line-interface), never the
 * UI, and it produces nothing the editor did not produce. rigc links
 * `spine-core` and is covered by the Spine Runtimes License; this tool needs a
 * licensed *editor* on the machine as well, by construction.
 *
 * ⛔ **The round trip can never be a selftest control.** The suite is
 * self-contained and CI has no editor; a control that needs one would report
 * SKIP forever, which is how a gate comes to look kept while checking nothing.
 * When the editor is absent, or is the trial, this tool REFUSES by name and
 * exits non-zero — the honest answer, and never a pass.
 *
 * ⭐ Those REFUSALS are gated, and they are the half of this file a machine with
 * no editor can answer for (issue #410). The `ERT` suite in `selftest.ts` points
 * the tool at stubs in a temp directory and reads what comes back; it needs no
 * editor, because the question is whether the refusal fires and what it says.
 * The no-editor branch had never executed anywhere until 2026-09-05 — it was
 * written on the machine that has the editor — which is precisely the shape of
 * a gate nobody has seen fail.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/** Where the editor lives, per platform, from Esoteric's own CLI page. */
export const EDITOR_DEFAULTS: Record<string, string> = {
  darwin: '/Applications/Spine.app/Contents/MacOS/Spine',
  win32: 'C:\\Program Files\\Spine\\Spine.com',
  linux: '/opt/Spine/Spine',
};

/**
 * Every editor call is bounded.
 *
 * ⚠️ Not defensive tidiness: on the first run the trial launcher opened a
 * WINDOW and waited for someone to click it, with the harness holding the
 * terminal. A round trip that hangs forever is indistinguishable from one that
 * is working, so the wall clock is part of the measurement.
 */
const DEFAULT_TIMEOUT_S = 600;

/**
 * The tail both refusals end on.
 *
 * ⭐ Named once because the second clause is the point of it (issue #410): the
 * person reading either refusal has just found out they cannot run the round
 * trip, and `--exported` is the one thing they *can* run — its own usage text
 * says it exists "so the measuring half can be exercised on a machine with no
 * editor installed", and the refusals were the only place that never said so.
 */
const NO_EDITOR_HINT =
  'Pass --editor <path to a licensed editor>, or run this on a machine that has one installed. ' +
  'What you can still do here: --exported <file> measures an export the editor ALREADY made, skips steps 1-2 ' +
  'and runs every measurement below. ' +
  'See https://esotericsoftware.com/spine-command-line-interface';

/**
 * A name that reads "Spine Trial" — the executable's, the bundle's, or the one
 * the bundle declares.
 *
 * ⚠️ Anchored, not a substring search. `spine-trial-comparison/Spine` is a
 * directory somebody named, not a trial, and refusing it would lock out exactly
 * the caller `--editor` exists for.
 */
const TRIAL_NAME = /^spine[\s_-]*trial$/i;

/**
 * The launcher banner the trial prints, as MEASURED on this machine 2026-09-05:
 *
 *     Spine Launcher 4.3.06 Trial (macOS Apple Silicon)
 *
 * ⚠️ What the LICENSED editor prints on that line has not been measured here —
 * there is no licensed editor on the machine this was written on. So the match
 * is anchored to the launcher's own banner line and to `Trial` standing alone
 * inside it, rather than to "trial appears somewhere in the output": a build
 * path with the word in it must not be able to refuse a real editor.
 */
const TRIAL_BANNER = /^[^\n]*\bSpine Launcher\b[^\n]*\bTrial\b[^\n]*$/im;

/**
 * Everything about this path that says it is the Spine TRIAL, phrased as what
 * was found and where.
 *
 * 🔒 Read off the FILE SYSTEM, never by running it — running it is the hazard
 * this exists to avoid. `--version` on
 * `/Applications/SpineTrial.app/Contents/MacOS/Spine Trial` (4.3.06, macOS)
 * prints its banner and then does not return: measured 2026-09-05 and killed at
 * a 20 s bound, and the first attempt at this round trip on 2026-09-04 held the
 * terminal for over three minutes.
 *
 * ⚠️ Ambiguity is not a signal. A path that is neither obviously the trial nor
 * obviously the licensed editor comes back with an EMPTY list and the run
 * proceeds to fail — or succeed — on its own merits. rigc does not have the
 * authority to guess its input away, and a false refusal here would lock out
 * someone with a perfectly good editor at a nonstandard path.
 */
function trialSignalsFromPath(editor: string): string[] {
  const found: string[] = [];
  const exe = editor.split(/[/\\]/).filter((s) => s !== '').pop() ?? '';
  if (TRIAL_NAME.test(exe.replace(/\.(exe|com|bat|cmd)$/i, ''))) found.push(`its executable is named "${exe}"`);

  // The application bundle it sits in, and what that bundle says it is. Both are
  // macOS shapes; on a platform with no bundle neither fires and neither lies.
  const bundleDir = /^(.*?\.app)(?:[/\\]|$)/i.exec(editor)?.[1];
  if (bundleDir !== undefined) {
    const bundle = bundleDir.split(/[/\\]/).pop() ?? '';
    if (TRIAL_NAME.test(bundle.replace(/\.app$/i, ''))) found.push(`it sits inside the bundle "${bundle}"`);
    const declared = bundleName(join(bundleDir, 'Contents', 'Info.plist'));
    if (declared !== null && TRIAL_NAME.test(declared)) {
      found.push(`its bundle's Info.plist declares CFBundleName "${declared}"`);
    }
  }
  return found;
}

/**
 * `CFBundleName` out of an XML `Info.plist`, or null when there is nothing
 * readable there. A plist this cannot read is not a signal — it is silence, and
 * silence lets the run proceed.
 */
function bundleName(plist: string): string | null {
  if (!existsSync(plist)) return null;
  try {
    const m = /<key>\s*CFBundleName\s*<\/key>\s*<string>([^<]*)<\/string>/i.exec(readFileSync(plist, 'utf8'));
    return m === null ? null : m[1].trim();
  } catch {
    return null;
  }
}

/** The trial naming itself in its own `--version` output, or null. */
function trialSignalFromVersion(output: string): string | null {
  const banner = TRIAL_BANNER.exec(output);
  return banner === null ? null : `it introduces itself as "${banner[0].trim()}"`;
}

/**
 * The refusal, in the doctrine's shape: the object, what was found, what is
 * required, and what the reader can do instead.
 */
function trialRefusal(editor: string, signals: string[]): string {
  return (
    `the editor at ${editor} is the Spine TRIAL, not a licensed editor — ${signals.join('; ')}. ` +
    'The trial cannot save projects or export animation data, which is the whole of what steps 1-2 do, so ' +
    'there is no round trip to be had on it; worse, it does not fail cleanly — a trial call with no export ' +
    'verb has been measured opening a window and never returning. This tool needs the licensed editor, whose ' +
    'bundle and executable are named "Spine". ' +
    NO_EDITOR_HINT
  );
}

interface Options {
  build: string;
  out: string;
  name: string;
  editor: string;
  editorVersion: string | null;
  fps: number;
  timeoutS: number;
  /** Measure an export the editor already made, instead of making one. */
  exported: string | null;
}

function usage(): never {
  console.error(
    [
      'usage: bun tools/editor_roundtrip.ts --build <dir> [flags]',
      '',
      '  --build <dir>        a rigc build directory (skeleton.json + atlas + pages)   REQUIRED',
      '  --out <dir>          where the round trip writes            (default <build>/../roundtrip)',
      '  --name <name>        skeleton name given to the import      (default the build dir\'s name)',
      `  --editor <path>      the Spine editor executable            (default ${EDITOR_DEFAULTS[process.platform] ?? '(unknown for this platform)'})`,
      '  --editor-version <v> pin the editor with -u, e.g. 4.3.xx    (default: let the editor choose)',
      '  --fps <n>            render rate for the check              (default 12)',
      '  --timeout <s>        bound on each editor call              (default 600)',
      '  --exported <file>    measure an export the editor ALREADY made and skip steps 1-2.',
      '                       Not a bypass: the editor still produced the file, and every',
      '                       measurement below still runs. It exists so the measuring half',
      '                       can be exercised on a machine with no editor installed.',
      '',
      'Requires a licensed Spine editor on this machine. It drives the documented command',
      'line only, and refuses by name when the editor is not there.',
    ].join('\n'),
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Options {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) usage();
    const key = a.slice(2);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) {
      console.error(`rigc editor_roundtrip: --${key} needs a value`);
      process.exit(2);
    }
    flags.set(key, value);
  }
  const build = flags.get('build');
  if (build === undefined) usage();
  const known = new Set(['build', 'out', 'name', 'editor', 'editor-version', 'fps', 'timeout', 'exported']);
  for (const key of flags.keys()) {
    if (!known.has(key)) {
      console.error(`rigc editor_roundtrip: unknown flag --${key}`);
      process.exit(2);
    }
  }
  const buildDir = resolve(build);
  return {
    build: buildDir,
    out: resolve(flags.get('out') ?? join(buildDir, '..', 'roundtrip')),
    name: flags.get('name') ?? basename(buildDir),
    editor: flags.get('editor') ?? EDITOR_DEFAULTS[process.platform] ?? '',
    editorVersion: flags.get('editor-version') ?? null,
    fps: Number(flags.get('fps') ?? 12),
    timeoutS: Number(flags.get('timeout') ?? DEFAULT_TIMEOUT_S),
    exported: flags.get('exported') === undefined ? null : resolve(flags.get('exported')!),
  };
}

/**
 * The lines of a rigc report worth putting in the round-trip table: its verdict,
 * and anything that failed.
 *
 * ⚠️ Written after the first version took `stdout.slice(-6)`, which on `check`
 * lands in the middle of the block explaining what a column MEANS — six lines of
 * correct prose where the reader wanted one number. A tail is not a summary.
 */
function verdictLines(out: string): string[] {
  const lines = out.trim().split('\n');
  const kept = lines.filter((l) => /^\s*(FAIL|rigc:)/.test(l) || /\bexit=\d/.test(l));
  const last = lines[lines.length - 1];
  if (kept.length === 0 && last !== undefined) return [last];
  return kept.slice(-6);
}

interface Ran {
  status: number | null;
  stdout: string;
  stderr: string;
  /** The bound fired: the call is not a result, it is a hang. */
  timedOut: boolean;
}

/**
 * Everything the editor printed on a step that did not do what it was for.
 *
 * 🚨 This is the defect issue #541 is half about, and it was this tool's. A
 * four-skin rig would not import; the report said
 *
 *     ## 1 import  (json -> project)
 *       exit=1
 *     rigc editor_roundtrip: the editor wrote no project file; the import did not happen
 *
 * and the card was filed as *"the editor refuses it without a word"*. The editor
 * had not been silent at all — it named the section, the attachment and the rule:
 *
 *     ERROR: Unable to import skeleton.
 *     [error] Error reading skeleton: skins
 *     Cause: [error] Error reading attachment: patch (MOw)
 *     Cause: [error] Multiple attachments have the same name: patch patch
 *
 * `run` captured both streams and the report printed neither. A day of bisecting
 * the emitted file rediscovered what one of those lines says outright, and the
 * repository whose whole doctrine is *convert silence into a named failure* had
 * manufactured the silence.
 *
 * ⭐ The refusal is unchanged and stays unchanged: a step that did not produce
 * its artifact is still a refusal by name, and this adds the reason rather than
 * softening the verdict. What it prints is the editor's own words, quoted and
 * attributed to the stream they came off, and never rewritten — a harness that
 * summarised them would be the same defect with a smaller radius.
 */
function editorSaid(ran: Ran): string[] {
  const lines: string[] = [];
  for (const [stream, text] of [
    ['stdout', ran.stdout],
    ['stderr', ran.stderr],
  ] as const) {
    const body = text.replace(/\s+$/, '');
    if (body === '') continue;
    lines.push(`  the editor's ${stream}:`);
    for (const line of body.split('\n')) lines.push(`    | ${line}`);
  }
  // Silence is a finding too, and it has to be stated rather than left to look
  // like a harness that forgot to print. The card above is what an unstated one
  // costs.
  if (lines.length === 0) lines.push('  the editor printed nothing on stdout or stderr');
  return lines;
}

/**
 * The line a rigc child REFUSED on, out of the stream it printed it on.
 *
 * ⚠️ Not `editorSaid`, which quotes both streams whole. A rigc refusal is a
 * `UsageError` and `cli.ts` prints the entire usage under one — some sixty lines
 * of correct prose that would bury the one sentence somebody needs. Every
 * refusal rigc prints starts, at column zero, with its own name and a colon:
 * `rigc:`, `rigc check error:`, `rigc compile error:`. The usage block has
 * neither shape — its `rigc <command> …` lines are indented, and its unindented
 * ones carry no colon — so none of them is mistaken for one.
 */
function refusalLines(text: string): string[] {
  return text.split('\n').filter((line) => /^rigc\b[^\n]*:/.test(line));
}

/**
 * What one rigc child said, under the step that ran it.
 *
 * 🚨 Issue #621, and it is `editorSaid`'s defect one surface over. Step 5 was
 * the one step that printed a child's exit code and threw its words away: on a
 * rig whose only attachment is a `boundingbox` it reported a bare `exit=1`, and
 * the renderer's own refusal — *"posed no drawable attachment in any animation
 * or in its setup pose — there is nothing to draw"* — reached nobody. A reader
 * of that log cannot tell a crashed renderer from a rig with no frames, which is
 * the same silence this file already has a judgment about.
 *
 * ⭐ The fallback is the half that keeps the fix from being the defect again one
 * level down: a child that dies with a stack trace prints no `rigc…:` line at
 * all, so when nothing matched, the tail of stderr is quoted rather than
 * nothing.
 */
function rigcSaid(what: string, ran: Ran): string[] {
  const said = [
    ...refusalLines(ran.stderr),
    // `check` reports its failures on stdout, in the FAIL lines `verdictLines`
    // keeps for the green path.
    ...ran.stdout.split('\n').filter((line) => /^\s*FAIL/.test(line)),
  ];
  if (said.length === 0) {
    said.push(...ran.stderr.replace(/\s+$/, '').split('\n').slice(-6).filter((line) => line !== ''));
  }
  const head = `  ${what}  exit=${String(ran.status)}${ran.timedOut ? '  TIMED OUT' : ''}`;
  // Silence is a finding, for the reason `editorSaid` states: "it said nothing"
  // and "this harness threw its words away" look identical from the outside.
  if (said.length === 0) return [head, '    | it printed nothing on stdout or stderr'];
  return [head, ...said.map((line) => `    | ${line.trimEnd()}`)];
}

/**
 * The clause `rigc render` refuses on when the skeleton draws nothing, and the
 * exit code it leaves it with.
 *
 * ⚠️ The clause is the part of that message that does not move: `cli.ts` splices
 * ` under skin "x"` in after "setup pose" when `--skin` was passed, and ends on
 * `— there is nothing to draw` either way.
 */
const NOTHING_TO_DRAW = 'posed no drawable attachment in any animation or in its setup pose';

/** `cli.ts` exits 2 on a `UsageError`, which is what that refusal is. */
const RIGC_USAGE_EXIT = 2;

/**
 * Did this `render` call refuse because there was nothing to draw?
 *
 * 🔒 **Both signals, and the second one is why** (issue #621). The exit code
 * alone is every `UsageError` there is — an unknown flag, a candidate that is
 * not there, a `--skin` the skeleton does not declare — so reading a 2 as
 * "nothing to draw" would turn the export dropping a skin the build declares
 * into a SKIP, which is the one outcome this must never produce. The sentence
 * alone is a string found on a stream however the child exited, including a path
 * that echoed it and then did something else.
 *
 * ⛔ What was rejected: reading the two skeletons here and deciding for
 * ourselves whether either draws. That is a second implementation of
 * `framingViewport` — atlas resolution, the setup pose and every animation — and
 * two answers that need not agree is a checker agreeing with itself. The verdict
 * belongs to the child that refused.
 *
 * ⛔ Also rejected, and it is the more structural signal: an exit code of its own
 * from `cli.ts` for this refusal. `src/render.ts` emits no code at all —
 * `framingViewport` returns null and `cli.ts` turns that into a `UsageError` — so
 * that is a change to rigc's CLI contract rather than to this harness, and it is
 * wider than the card it would be landing under.
 */
function nothingToDraw(ran: Ran): boolean {
  return !ran.timedOut && ran.status === RIGC_USAGE_EXIT && ran.stderr.includes(NOTHING_TO_DRAW);
}

/**
 * Step 5's verdict when NEITHER side draws (issue #621).
 *
 * The question this step asks is *does what comes back still play the same*. A
 * rig that draws nothing on both sides gives `check` nothing to compare, and the
 * honest answer to a question with no measurement behind it is the one this file
 * gives everywhere else: SKIP by name, never a pass and never a red. `validate`
 * and `diff` have already measured the rig — this is the shape #608 removed from
 * `build`, one tool further out.
 */
const NOTHING_MEASURED =
  'neither side draws a frame, so the check is not measured; `diff` and `validate` carry this rig';

function run(cmd: string, args: string[], timeoutS: number): Ran {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: timeoutS * 1000 });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    timedOut: r.error !== undefined && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT',
  };
}

/**
 * How to invoke rigc: this checkout's `cli.ts` when the tool is running inside
 * the repository, and the installed `rigc` otherwise. Named rather than guessed
 * once, because a report that says "validate passed" has to say which binary
 * said so.
 */
function rigcCommand(): { cmd: string; prefix: string[]; how: string } {
  const local = join(import.meta.dir, '..', 'cli.ts');
  if (existsSync(local)) return { cmd: process.execPath, prefix: [local], how: `${process.execPath} ${local}` };
  return { cmd: 'rigc', prefix: [], how: 'rigc (installed)' };
}

/**
 * What `diff` reported about the export, read out of its own JSON: every
 * measure that is not a perfect match, named by the measure that saw it and by
 * the block it sits in.
 *
 * A round trip through a correct editor moves nothing, so an empty list is the
 * result and a populated one is the finding. Silence is not reported as a
 * match: a report that could not be read says so.
 *
 * 🚨 **Every block, and that is the whole of issue #597.** This walked
 * `sections[].measures` alone, so it read the measures that go into a section
 * mean and nothing else — while a `diff` report also carries each section's
 * `nameAgnostic` comparison, its `reported` block, and since #578 a top-level
 * `header` block holding the two stage measures. A round trip that changed or
 * dropped the stage therefore printed *"every one a perfect match"*, which is
 * the strongest sentence this file can print, about a question it had not
 * asked. The stage is the sharpest case because a header field is exactly the
 * kind of thing an editor rewrites on import and export, but it was never only
 * the stage: `attachments.mesh_edges`, `animations.key_density` and
 * `animations.curve_kinds` predate #578 in the same silence.
 *
 * ⭐ The headings carry `diff`'s own words rather than a paraphrase, because
 * these measures gate nothing and a summary that let them read as failures
 * would be inventing a verdict `diff` refuses to state. `ERT63` asserts the
 * distinguishing clause of each heading against what `diffLines` actually
 * prints, so a re-wording there cannot leave two documents disagreeing here.
 *
 * ⚠️ An absent `header` is a finding and not a perfect match. `DiffReport`
 * declares that block non-optional for exactly this reason — over an absent
 * one the empty list is indistinguishable from one that is all 1.000 — and
 * this tool can reach one anyway: `rigcCommand()` falls back to the INSTALLED
 * `rigc` when the file is not running inside the repository, and an install
 * predating #578 writes a report with no header in it.
 */
export function diffSummaryLines(reportPath: string): string[] {
  if (!existsSync(reportPath)) return ['(no diff report was written, so nothing was read from one)'];
  interface Measure { id: string; what: string; matched: number; total: number; ratio: number }
  interface Block { measures?: Measure[] }
  interface Section { name?: string; measures?: Measure[]; nameAgnostic?: Block; reported?: Block }
  interface Report { sections?: Section[]; header?: Block }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report;
  const sections = report.sections ?? [];
  const headerMeasures = report.header?.measures ?? [];
  // Read in the order `diff` prints them, so a row here can be found in the
  // report it came from without translating between two orderings.
  const blocks: Array<{ heading: string | null; measures: Measure[] }> = [
    { heading: null, measures: sections.flatMap((s) => s.measures ?? []) },
    {
      heading: '  name-agnostic — the same two skeletons compared with names thrown away',
      measures: sections.flatMap((s) => s.nameAgnostic?.measures ?? []),
    },
    {
      heading: '  reported — unobservable from the frames, so reported and folded into nothing',
      measures: [...sections.flatMap((s) => s.reported?.measures ?? []), ...headerMeasures],
    },
  ];
  const measured = blocks.reduce((n, block) => n + block.measures.length, 0);
  if (measured === 0) return ['(the diff report carried no measures — read it before believing this run)'];

  const lines: string[] = [];
  for (const block of blocks) {
    const moved = block.measures.filter((m) => m.ratio !== 1);
    if (moved.length === 0) continue;
    if (block.heading !== null) lines.push(block.heading);
    const indent = block.heading === null ? '  ' : '    ';
    for (const m of moved) {
      lines.push(`${indent}moved  ${m.id}  ${m.matched}/${m.total} (${(m.ratio * 100).toFixed(2)}%) — ${m.what}`);
    }
  }
  if (headerMeasures.length === 0) {
    lines.push(
      '  the report carries no `skeleton` header block, so the stage was never compared — the `rigc` that wrote ' +
        'it predates the header measures (issue #578), and an absent block must not read here like one that is ' +
        'all 1.000',
    );
  }
  if (lines.length > 0) return lines;
  // The counts are derived from the same three walks the rows come from, so the
  // one sentence that claims everything held names how much everything was.
  const [gating, agnostic, reported] = blocks.map((block) => block.measures.length);
  return [
    `  ${measured} measure(s) — ${gating} in the sections, ${agnostic} name-agnostic, ${reported} reported ` +
      'and never gating — every one a perfect match',
  ];
}

/**
 * `check`'s per-animation figures: how far the export's drawing moved from the
 * build's own frames.
 *
 * `meanMae` is the headline; `worstDrift` is the one that catches a single slot
 * in a single frame, which a mean over a whole animation hides.
 */
function checkFigures(reportPath: string): string[] {
  if (!existsSync(reportPath)) return ['(no check report was written, so nothing was read from one)'];
  interface Anim {
    /**
     * `null` on the row `check` writes for the SETUP pose (`dir: "setup"`) — which
     * is the only row a rig with no animations gets. Read as a string, that report
     * threw at step 5 on every animation-less build (issue #796's two editor fixtures).
     */
    animation: string | null;
    dir?: string;
    compared: number;
    meanMae: number;
    worstMae: number;
    worstDrift: number;
    worstDriftSlot: string | null;
    worstDriftFrame: number;
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { animations?: Anim[] };
  const animations = report.animations ?? [];
  if (animations.length === 0) return ['(the check report carried no animations — read it before believing this run)'];
  return animations.map(
    (a) =>
      `  ${(a.animation ?? `(${a.dir ?? 'setup'})`).padEnd(12)} ${a.compared} frame(s)  mean MAE ${a.meanMae.toFixed(4)}  worst ${a.worstMae.toFixed(4)}` +
      `  worst drift ${a.worstDrift.toFixed(3)}px${a.worstDriftSlot ? ` on ${a.worstDriftSlot} @ f${a.worstDriftFrame}` : ''}`,
  );
}

/**
 * The largest per-animation `meanMae` in one check report, or `null` when there
 * is no report to read one from.
 *
 * ⚠️ `check`'s exit code is not a verdict — there is no pass mark in it, by
 * design, any more than there is one in `diff` — so a per-skin roll-up built on
 * exit codes alone reports every skin as fine and reports it in the column a
 * reader looks at. This is the figure that actually moves when one skin's art
 * comes back wrong, which is what makes the roll-up a roll-up (issue #571).
 */
function worstMeanMae(reportPath: string): number | null {
  if (!existsSync(reportPath)) return null;
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { animations?: Array<{ meanMae?: number }> };
  const values = (report.animations ?? []).map((a) => a.meanMae).filter((v): v is number => typeof v === 'number');
  return values.length === 0 ? null : Math.max(...values);
}

// ---------------------------------------------------------------------------
// step 5's per-skin plan (issue #571)
// ---------------------------------------------------------------------------
//
// 🚨 Step 5 used to render and check ONCE, with no skin, which draws the default
// skin and nothing else. On a rig whose named skins carry the contested art that
// is a comparison of blank against blank: the ninth round trip read `check`
// 0.0000 on a rig where the construct under test lives in a named skin, and the
// zero was true and empty at once. So the plan below is one block PER DECLARED
// SKIN, and a skin whose art the editor moved is a red row with its own name on
// it rather than a figure nobody rendered.
//
// ⭐ Split out as pure functions for the reason `shapeOf`/`shapeDiff` are: the
// `ERT` suite has no editor and never will, and a loop that can only be read by
// driving one is a loop nobody has seen work.

/**
 * The skins a skeleton file declares, in the order the file lists them.
 *
 * ⚠️ Off the FILE rather than off `spine-core`: this is the build's own
 * `skeleton.json`, read before any of it is loaded, and the tool's other summary
 * (`shapeOf`) reads the same file the same way. A skeleton with no `skins` array
 * at all comes back empty, which is a different fact from `["default"]` and is
 * carried as one — see `skinBlocks`.
 */
export function skinsDeclaredBy(path: string): string[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { skins?: Array<{ name?: unknown }> };
  const out: string[] = [];
  for (const skin of parsed.skins ?? []) {
    // A skin with no usable name is counted under one rather than dropped: a
    // block that vanished would be a skin nobody rendered and nobody missed.
    out.push(typeof skin?.name === 'string' && skin.name !== '' ? skin.name : '(unnamed)');
  }
  return out;
}

/**
 * How one step-5 block ended (issue #621).
 *
 * Three states rather than an exit code, because `check` not having run and
 * `check` having returned 0 are different facts and used to print the same:
 * `measured` is the only one that carries a figure, and `not measured` is the
 * only one that does not fail the run.
 */
export type BlockVerdict = 'measured' | 'not measured' | 'no frames';

/** One render-and-check block of step 5: which skin, where its frames go. */
export interface SkinBlock {
  /** The skin this block poses under — `null` when the skeleton declares none. */
  skin: string | null;
  /** The heading printed above the block, which is where the skin's name is read. */
  heading: string;
  /** `--skin <name>`, or nothing at all when there is no skin to name. */
  args: string[];
  buildFrames: string;
  exportFrames: string;
  checkJson: string;
}

/**
 * A directory name for one skin's frames: its index, then what of its name is a
 * filename.
 *
 * The index leads because **a skin name is not a path**. The Spine editor writes
 * folders into skin names with `/`, so `goblins/green` would land two levels
 * down or collide with a sibling, and any scheme that replaces the offending
 * characters can map two distinct skins onto one directory. The index cannot
 * collide, and it is the skeleton's own ordering rather than a number invented
 * here.
 */
function skinDirName(name: string, index: number): string {
  return `${index}-${name.replace(/[^A-Za-z0-9._-]+/g, '_')}`;
}

/**
 * Step 5's plan: one block per declared skin, or exactly one block when the
 * skeleton declares no skin at all.
 *
 * ⭐ The no-skin case keeps the old paths (`render-build`, `render-export`,
 * `check.json`) because for such a skeleton there is nothing to distinguish, and
 * a run whose output moved would be a run whose ledgers all have to be re-read
 * for no measurement gained. A skinned skeleton files each block under its own
 * directory, so the frames of two skins can never overwrite each other — which
 * is the failure that would turn "one block per skin" back into one block.
 */
export function skinBlocks(skins: string[], out: string, fps: number): SkinBlock[] {
  if (skins.length === 0) {
    return [
      {
        skin: null,
        heading: `## 5 render both @${fps}fps, check the export against the build's own frames (no skin declared)`,
        args: [],
        buildFrames: join(out, 'render-build'),
        exportFrames: join(out, 'render-export'),
        checkJson: join(out, 'check.json'),
      },
    ];
  }
  return skins.map((skin, i) => ({
    skin,
    heading:
      `## 5.${i + 1}/${skins.length} skin "${skin}" — render both @${fps}fps, check the export against the ` +
      "build's own frames",
    args: ['--skin', skin],
    buildFrames: join(out, 'render-build', skinDirName(skin, i)),
    exportFrames: join(out, 'render-export', skinDirName(skin, i)),
    checkJson: join(out, `check-${skinDirName(skin, i)}.json`),
  }));
}

/** The shape of a skeleton file, for the field-by-field comparison. */
export interface Shape {
  spine: string;
  bones: number;
  slots: number;
  attachments: number;
  constraints: Record<string, number>;
  animations: string[];
  timelineKinds: string[];
  images: string | null;
}

/**
 * How many constraints of each `type`, read out of 4.3's single array.
 *
 * 🚨 This used to count four FIXED keys off the 4.1-era top-level arrays —
 * `d.ik`, `d.transform`, `d.path`, `d.physics` — none of which a 4.3 file has
 * (issue #561). Every row therefore read `0 -> 0` on every trip this tool has
 * ever run, so the summary's answer to *"did the editor drop a constraint"* was
 * a constant, printed with the same confidence as the rows that measure
 * something. Measured on `round6/out/pathmodes/build/skeleton.json`, whose
 * top-level keys are `skeleton, bones, slots, skins, animations, constraints`:
 * the old reads returned `{ik: 0, transform: 0, path: 0, physics: 0}` beside one
 * path constraint named `ride`.
 *
 * ⭐ The keys are now the types actually **present**, which is why `shapeDiff`
 * unions them: a type that vanishes has a key on one side only, and a fixed key
 * list would have to be kept by hand against a format that added `slider` in
 * 4.3 and can add another.
 */
function constraintsByType(list: ReadonlyArray<{ type?: unknown }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of list) {
    // A constraint with no usable `type` is what `A01` exists to catch, so it is
    // counted under a name rather than dropped — a row nobody can read beats a
    // row nobody gets.
    const type = typeof c?.type === 'string' && c.type !== '' ? c.type : '(no type)';
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

export function shapeOf(path: string): Shape {
  interface Skel {
    skeleton?: { spine?: string; images?: string };
    bones?: unknown[];
    slots?: unknown[];
    skins?: Array<{ attachments?: Record<string, Record<string, unknown>> }>;
    constraints?: Array<{ type?: unknown }>;
    animations?: Record<string, Record<string, unknown>>;
  }
  const d = JSON.parse(readFileSync(path, 'utf8')) as Skel;
  const kinds = new Set<string>();
  for (const anim of Object.values(d.animations ?? {})) for (const k of Object.keys(anim)) kinds.add(k);
  return {
    spine: d.skeleton?.spine ?? '(none)',
    bones: (d.bones ?? []).length,
    slots: (d.slots ?? []).length,
    attachments: (d.skins ?? []).reduce(
      (n, s) => n + Object.values(s.attachments ?? {}).reduce((m, v) => m + Object.keys(v).length, 0),
      0,
    ),
    constraints: constraintsByType(d.constraints ?? []),
    animations: Object.keys(d.animations ?? {}).sort(),
    timelineKinds: [...kinds].sort(),
    images: d.skeleton?.images ?? null,
  };
}

/** The rows where the two shapes disagree — what the editor rewrote. */
export function shapeDiff(before: Shape, after: Shape): string[] {
  const rows: string[] = [];
  const cmp = (field: string, a: unknown, b: unknown): void => {
    const x = JSON.stringify(a);
    const y = JSON.stringify(b);
    if (x !== y) rows.push(`${field}: build ${x} -> export ${y}`);
  };
  cmp('skeleton.spine', before.spine, after.spine);
  cmp('skeleton.images', before.images, after.images);
  cmp('bones', before.bones, after.bones);
  cmp('slots', before.slots, after.slots);
  cmp('attachments', before.attachments, after.attachments);
  // The UNION of both sides' types, not the build's: a constraint type the build
  // has and the export does not is the case this row exists for, and iterating
  // one side's keys would also miss a type only the export carries. Absent reads
  // as 0 so the row says `build 1 -> export 0` rather than naming `undefined`.
  for (const k of [...new Set([...Object.keys(before.constraints), ...Object.keys(after.constraints)])].sort()) {
    cmp(`${k} constraints`, before.constraints[k] ?? 0, after.constraints[k] ?? 0);
  }
  cmp('animations', before.animations, after.animations);
  cmp('timeline kinds', before.timelineKinds, after.timelineKinds);
  return rows;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const rigc = rigcCommand();

  const source = join(opts.build, 'skeleton.json');
  const log: string[] = [];
  const emit = (line: string): void => {
    console.log(line);
    log.push(line);
  };
  const logPath = join(opts.out, 'roundtrip.log');
  /**
   * Write what the run has said so far, wherever it stops.
   *
   * ⚠️ `roundtrip.log` used to be written on the last line of `main`, so a run
   * that REFUSED wrote none — and issue #541's card cites the log as the place to
   * read the editor's output, which on a failed import was a file that did not
   * exist. A record kept only for the runs that went well is not a record.
   */
  const keepLog = (): void => {
    // Nothing said, nothing to keep: the refusals that fire before the first
    // `emit` (no build directory) would otherwise leave an empty file and a
    // directory the run never used.
    if (log.length === 0) return;
    try {
      mkdirSync(opts.out, { recursive: true });
      writeFileSync(logPath, `${log.join('\n')}\n`);
    } catch {
      // A log this cannot write is not worth failing a refusal over; the same
      // lines already went to stdout.
    }
  };
  const fail = (message: string): never => {
    keepLog();
    console.error(`rigc editor_roundtrip: ${message}`);
    process.exit(1);
  };

  if (!existsSync(source)) fail(`no skeleton.json in the build directory ${opts.build}`);

  // 🚨 The art the EDITOR will look for, checked before the editor is started —
  // issue #562. The editor's JSON import reads `skeleton.images` and finds each
  // attachment's file by name under it; it never reads an atlas (#370, measured
  // at the MISSING wall). So a build whose `images` no longer resolves imports
  // as a skeleton with no pixels, and the run goes on to gate, `diff`, render
  // and `check` a candidate whose every region is blank — a green-looking
  // measurement of nothing, or a red one blaming the editor.
  //
  // ⚠️ This is a `--pack` build's ordinary shape, not a corner case. `--pack`
  // writes ONE shared page into `--out` and no loose parts at all (measured:
  // `round6/out/packed/build/` holds `skeleton.json`, `skeleton.atlas`,
  // `skeleton.png` and nothing else), so `skeletonImagesPath` falls through to
  // the loose parts directory and `images` necessarily points OUT of the build
  // — `"../../../rigs/packed/parts/"` on that run. The build is self-contained
  // for a runtime and is not for the editor, and the two directories go their
  // separate ways the moment anybody moves either.
  //
  // 🔒 Why this refuses rather than pointing `images` inside `--out`: there is
  // nothing in there to point AT. The editor would look for `crown.png` beside
  // the skeleton and find one packed page, so the "fix" turns a path that
  // resolves while the parts are in place into one that can never resolve at
  // all. What the editor needs is loose files, which is what `--copy-images`
  // makes — and `--pack --copy-images` is refused by `cli.ts`, correctly,
  // because a packed atlas does not reference loose parts.
  //
  // ⛔ It is checked HERE, before step 1, rather than beside the atlas check
  // further down, because each precondition sits before the step it protects:
  // the atlas's page names matter to the harness's own copy in step 3, and this
  // matters to the editor's import in step 1.
  {
    interface ImagesProbe {
      skeleton?: { images?: string };
      skins?: Array<{ attachments?: Record<string, Record<string, { type?: string; name?: string; path?: string }>> }>;
    }
    const probe = JSON.parse(readFileSync(source, 'utf8')) as ImagesProbe;
    const declared = probe.skeleton?.images;
    if (declared !== undefined && declared !== '') {
      const imagesDir = resolve(opts.build, declared);
      // Only the two attachment types that read a texture. A boundingbox,
      // clipping or path attachment names no image and would be a false
      // refusal — `src/types.ts` says so for each of them.
      const wanted = new Set<string>();
      for (const skin of probe.skins ?? []) {
        for (const slot of Object.values(skin.attachments ?? {})) {
          for (const [placeholder, att] of Object.entries(slot)) {
            if (att.type !== undefined && att.type !== 'mesh') continue;
            // The parser's own defaults: `path`, else the attachment's `name`,
            // else its placeholder (`SkeletonJson.js:526`, `:529`, `:560`) — a
            // stated `name` is the file the editor looks for (issue #796).
            wanted.add(att.path ?? att.name ?? placeholder);
          }
        }
      }
      const EXTENSIONS = ['.png', '.jpg', '.jpeg'];
      const missing = [...wanted]
        .sort()
        .filter((name) => !EXTENSIONS.some((ext) => existsSync(join(imagesDir, `${name}${ext}`))));
      if (!existsSync(imagesDir)) {
        fail(
          `the build's skeleton.images is "${declared}", which resolves to ${imagesDir} — and there is no ` +
            'directory there. The editor finds a JSON import\'s art by that path and never by the atlas, so the ' +
            'import would produce a skeleton with no pixels and every measurement after it would be of nothing. ' +
            'A `--pack` build is a runtime artifact: its pages are in --out and its `images` names the loose parts ' +
            'it was packed from, so it round-trips only while those parts are where they were at build time. ' +
            'Rebuild with `--copy-images` (which puts the parts beside the skeleton), or put that directory back.',
        );
      }
      if (missing.length > 0) {
        fail(
          `the build's skeleton.images is "${declared}" (${imagesDir}) and ${missing.length} of ${wanted.size} ` +
            `attachment image(s) are not under it — the first is "${missing[0]}". The editor resolves each ` +
            'attachment by name against that directory and never through the atlas, so those attachments would ' +
            'import with no pixels. If this is a `--pack` build, its one packed page is in --out and its parts are ' +
            'not: rebuild with `--copy-images`, which is the shape whose art travels with the skeleton.',
        );
      }
    }
  }

  rmSync(opts.out, { recursive: true, force: true });
  mkdirSync(join(opts.out, 'export'), { recursive: true });
  mkdirSync(join(opts.out, 'export-cand'), { recursive: true });

  emit(`## 0 versions`);
  emit(`  rigc     ${rigc.how}`);
  emit(`  ${run(rigc.cmd, [...rigc.prefix, '--version'], 60).stdout.trim()}`);

  let exportedJson: string;
  if (opts.exported !== null) {
    if (!existsSync(opts.exported)) fail(`no such export: ${opts.exported}`);
    exportedJson = opts.exported;
    emit(`  editor   NOT RUN — measuring an export the editor already made: ${opts.exported}`);
    emit('');
    emit('## 1-2 import / export  SKIPPED (--exported)');
  } else {
    // 🔒 The refusal, and it is the whole licence posture in one branch: with no
    // editor there is no round trip, and the tool says so rather than measuring
    // something else and calling it one.
    if (opts.editor === '' || !existsSync(opts.editor)) {
      fail(
        `Spine editor not found at ${opts.editor || '(no default known for platform ' + process.platform + ')'}. ` +
          'This tool round-trips through a LICENSED Spine editor and has nothing to measure without one. ' +
          NO_EDITOR_HINT,
      );
    }
    // 🔒 The trial, refused BEFORE it is run (issue #410). The refusal above used
    // to invite `--editor <path>` on a machine whose only Spine is the trial,
    // which cannot export and does not fail cleanly — so a path that names itself
    // a trial is answered here, off the file system, without a process starting.
    const named = trialSignalsFromPath(opts.editor);
    if (named.length > 0) fail(trialRefusal(opts.editor, named));

    const ver = run(opts.editor, ['--version'], 60);
    emit(`  editor   ${opts.editor}`);
    for (const line of ver.stdout.trim().split('\n').slice(-3)) emit(`           ${line}`);
    // The second signal, and the only one that works on a platform whose trial
    // path this repository has never seen: the binary's own banner. It costs no
    // extra call — `--version` above is one the tool already made.
    const introduced = trialSignalFromVersion(`${ver.stdout}\n${ver.stderr}`);
    if (introduced !== null) fail(trialRefusal(opts.editor, [introduced]));
    const pin = opts.editorVersion === null ? [] : ['-u', opts.editorVersion];

    emit('');
    emit('## 1 import  (json -> project)');
    const project = join(opts.out, `${opts.name}.spine`);
    const imported = run(opts.editor, [...pin, '-i', source, '-o', project, '-r', opts.name], opts.timeoutS);
    emit(`  exit=${imported.status}${imported.timedOut ? `  TIMED OUT after ${opts.timeoutS}s` : ''}`);
    // A step "went wrong" if it reported failure OR did not leave the artifact
    // it exists to leave. Both are cases where the editor's own words are the
    // next thing anybody needs, and both used to print only `exit=`.
    const importWrong = imported.status !== 0 || imported.timedOut || !existsSync(project);
    if (importWrong) for (const line of editorSaid(imported)) emit(line);
    if (imported.timedOut) fail(`the editor did not return within ${opts.timeoutS}s on import — that is a hang, not a result`);
    if (!existsSync(project)) {
      fail(`the editor wrote no project file; the import did not happen — what it printed is above and in ${logPath}`);
    }

    emit('');
    emit('## 2 export  (project -> json, default settings)');
    const exported = run(opts.editor, [...pin, '-i', project, '-o', join(opts.out, 'export'), '-e', 'json'], opts.timeoutS);
    emit(`  exit=${exported.status}${exported.timedOut ? `  TIMED OUT after ${opts.timeoutS}s` : ''}`);
    const written = existsSync(join(opts.out, 'export'))
      ? readdirSync(join(opts.out, 'export')).filter((f) => f.endsWith('.json'))
      : [];
    if (exported.status !== 0 || exported.timedOut || written.length === 0) {
      for (const line of editorSaid(exported)) emit(line);
    }
    if (exported.timedOut) fail(`the editor did not return within ${opts.timeoutS}s on export — that is a hang, not a result`);
    if (written.length === 0) {
      fail(
        'the editor wrote no json; stopping before the re-gate rather than measuring nothing — what it printed ' +
          `is above and in ${logPath}`,
      );
    }
    exportedJson = join(opts.out, 'export', written[0]);
  }

  // The export is a skeleton only; it needs the build's atlas and pages beside
  // it to be a candidate anything can load.
  //
  // 🚨 Which is why the build has to be SELF-CONTAINED, and this refuses when it
  // is not. An ordinary build's atlas names its pages by a relative path back to
  // the art directory; copy that atlas to a directory at another depth and every
  // page name resolves to nothing. Found by running this tool — it reported four
  // `A17_ATLAS_PAGE_FILES_EXIST` failures that were the harness's fault and not
  // the editor's, which is the worst kind of red: a real assertion, correctly
  // fired, pointing at the wrong culprit.
  const cand = join(opts.out, 'export-cand');
  const atlasName = readdirSync(opts.build).find((f) => f.endsWith('.atlas'));
  if (atlasName === undefined) fail(`no .atlas in the build directory ${opts.build}`);
  const pageNames = readFileSync(join(opts.build, atlasName!), 'utf8')
    .split('\n')
    .filter((line) => /\.(png|jpg|jpeg)\s*$/i.test(line.trim()) && !line.startsWith(' ') && !line.startsWith('\t'))
    .map((line) => line.trim());
  const wandering = pageNames.filter((n) => n.includes('/'));
  if (wandering.length > 0) {
    fail(
      `the build's atlas names its pages by path, not by filename — the first is "${wandering[0]}". ` +
        'The round trip copies the atlas beside the export, at a different depth, so every one of those ' +
        `${wandering.length} page name(s) would resolve to nothing and A17 would blame the editor for it. ` +
        'Rebuild with `--copy-images`, which puts the pages beside the skeleton and names them plainly.',
    );
  }
  copyFileSync(exportedJson, join(cand, 'skeleton.json'));
  for (const f of readdirSync(opts.build)) {
    if (f.endsWith('.atlas') || f.endsWith('.png')) copyFileSync(join(opts.build, f), join(cand, f));
  }

  emit('');
  emit('## 3 validate --profile spine  (the export)');
  const gate = run(rigc.cmd, [...rigc.prefix, 'validate', cand, '--profile', 'spine'], 600);
  emit(`  exit=${gate.status}`);
  for (const line of verdictLines(gate.stdout)) emit(`  ${line}`);

  emit('');
  emit('## 4 diff  (export against the build)');
  const diffJson = join(opts.out, 'diff.json');
  const diff = run(rigc.cmd, [...rigc.prefix, 'diff', join(cand, 'skeleton.json'), source, '--json', diffJson], 600);
  emit(`  exit=${diff.status}`);
  for (const line of verdictLines(diff.stdout)) emit(`  ${line}`);
  // Read the numbers out of the REPORT rather than off stdout: the measures
  // that moved are the answer to "what did the editor change", and scraping a
  // console layout for them would break the first time that layout is tidied.
  for (const line of diffSummaryLines(diffJson)) emit(`  ${line}`);

  // 🔒 The skins come off the BUILD, which is the side under test: a skin the
  // export dropped altogether then reads as a block whose check fails by name,
  // where enumerating the export's own skins would quietly stop looking for it.
  const blocks = skinBlocks(skinsDeclaredBy(source), opts.out, opts.fps);
  const checks: Array<{ skin: string | null; verdict: BlockVerdict; status: number | null; mae: number | null }> = [];
  for (const block of blocks) {
    emit('');
    emit(block.heading);
    const args = ['--fps', String(opts.fps), ...block.args];
    const drawBuild = run(rigc.cmd, [...rigc.prefix, 'render', '--candidate', opts.build, ...args, '--out', block.buildFrames], 900);
    const drawExport = run(rigc.cmd, [...rigc.prefix, 'render', '--candidate', cand, ...args, '--out', block.exportFrames], 900);
    // 🚨 Both renderers are quoted the moment either did not do what it was for
    // (issue #621) — the rule steps 1 and 2 have followed since #541, and step 5
    // was the one step that did not.
    for (const [what, ran] of [
      ['render (the build)', drawBuild],
      ['render (the export)', drawExport],
    ] as const) {
      if (ran.status !== 0 || ran.timedOut) for (const line of rigcSaid(what, ran)) emit(line);
    }
    const buildBlank = nothingToDraw(drawBuild);
    const exportBlank = nothingToDraw(drawExport);
    const buildDrew = drawBuild.status === 0 && !drawBuild.timedOut;
    const exportDrew = drawExport.status === 0 && !drawExport.timedOut;

    if (buildBlank && exportBlank) {
      emit(`  SKIP  ${NOTHING_MEASURED}`);
      checks.push({ skin: block.skin, verdict: 'not measured', status: null, mae: null });
      continue;
    }
    // 🔒 One side only, and it stays red. "Nothing to draw" is an honest answer
    // about a RIG; about one side of a round trip it is the loss the trip exists
    // to find, so the SKIP above is guarded by `&&` and never by `||`.
    if ((buildBlank && exportDrew) || (exportBlank && buildDrew)) {
      const blank = buildBlank ? 'the build' : 'the export';
      const drawn = buildBlank ? 'the export' : 'the build';
      emit(
        `  FAIL  ${blank} has nothing to draw and ${drawn} draws — one side drawing where the other does not IS ` +
          'the divergence this step measures, so it is a failure and never a SKIP',
      );
      checks.push({ skin: block.skin, verdict: 'no frames', status: null, mae: null });
      continue;
    }
    if (!buildDrew || !exportDrew) {
      emit(
        '  FAIL  a render did not do what it was for, so there is no frame set to compare — `check` is not run, ' +
          'because with a frame set missing its message would name the directory rather than the refusal above',
      );
      checks.push({ skin: block.skin, verdict: 'no frames', status: null, mae: null });
      continue;
    }
    const check = run(
      rigc.cmd,
      [...rigc.prefix, 'check', '--candidate', cand, '--frames', block.buildFrames, ...block.args, '--json', block.checkJson],
      900,
    );
    emit(`  exit=${check.status}`);
    if (check.status !== 0 || check.timedOut) for (const line of rigcSaid('check', check)) emit(line);
    for (const line of verdictLines(check.stdout)) emit(`  ${line}`);
    for (const line of checkFigures(block.checkJson)) emit(`  ${line}`);
    checks.push({ skin: block.skin, verdict: 'measured', status: check.status, mae: worstMeanMae(block.checkJson) });
  }
  // The roll-up, so a loss in one skin of many is a line somebody reads rather
  // than a row buried in the block above it. The mark is on the LARGEST figure
  // and only where the skins disagree: `check` has no pass mark to compare
  // against and this tool does not get to invent one, but "these skins did not
  // come back the same" is a fact the run itself produced.
  if (blocks.length > 1) {
    // ⚠️ Off the MEASURED blocks only (issue #621). A skin nobody could render
    // has no figure, and folding it in as one would put a number in the column a
    // reader looks at for a block where nothing was compared.
    const figures = checks.filter((c) => c.verdict === 'measured').map((c) => c.mae).filter((v): v is number => v !== null);
    const worst = figures.length === 0 ? null : Math.max(...figures);
    const agreed = figures.length === checks.length && new Set(figures).size === 1;
    emit('');
    emit(`  per skin  ${checks.length} block(s)`);
    for (const { skin, verdict, status, mae } of checks) {
      // 🔒 Never a pass and never an MAE of 0: a block that measured nothing
      // says so in the column the figures would have been in.
      if (verdict !== 'measured') {
        emit(
          `    ${String(skin).padEnd(20)} ` +
            (verdict === 'not measured'
              ? 'NOT MEASURED — neither side draws a frame under this skin'
              : '⚠️ NOT MEASURED — a render did not do what it was for, and this skin is red for it'),
        );
        continue;
      }
      emit(
        `    ${String(skin).padEnd(20)} check exit=${status}  worst mean MAE ` +
          `${mae === null ? '(no report)' : mae.toFixed(4)}` +
          `${status === 0 ? '' : '   ⚠️ this skin did not come back'}` +
          // The mark compares figures, so it needs two of them: crowning the one
          // skin that WAS measured "the worst" says nothing and reads as a loss.
          `${!agreed && figures.length > 1 && mae !== null && mae === worst ? `   ⚠️ the worst of the ${figures.length} measured skins` : ''}`,
      );
    }
    if (agreed) emit(`    ⤷ every skin came back at the same figure, so no skin is carrying a difference the others are not.`);
  }
  // 🔒 `not measured` is the one verdict that does not fail the run: nothing was
  // compared, and a round trip that ends red on a correct rig is the shape #608
  // removed from `build` (issue #621).
  const checksClean = checks.every((c) => c.verdict === 'not measured' || (c.verdict === 'measured' && c.status === 0));

  emit('');
  emit('## 6 what the editor rewrote');
  const rows = shapeDiff(shapeOf(source), shapeOf(join(cand, 'skeleton.json')));
  if (rows.length === 0) emit('  nothing at this resolution: same version, counts, animations and timeline kinds');
  for (const row of rows) emit(`  ${row}`);

  keepLog();
  emit('');
  emit(`log: ${logPath}`);
  // The verdict is the gate's and EVERY skin's check, not this tool's opinion of
  // them: one skin coming back wrong is the whole run coming back wrong, which
  // is the half a single un-skinned check could not say.
  process.exit(gate.status === 0 && checksClean ? 0 : 1);
}

// ⭐ Guarded so `shapeOf`, `shapeDiff`, `skinsDeclaredBy` and `skinBlocks` can be
// READ by a control that has no editor (issues #561, #571). Every other `ERT`
// case drives this file as a subprocess, which is the right shape for a refusal;
// step 6's summary is a pure function of two skeleton files and step 5's plan is
// a pure function of one, and driving an editor — or four rigc subcommands — to
// reach either would be paying for a round trip to test arithmetic. Run as a
// program this is unchanged: `bun tools/editor_roundtrip.ts …` makes this module
// the entry, so `import.meta.main` is true.
if (import.meta.main) main();
