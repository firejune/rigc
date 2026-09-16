/**
 * The editor round trip, as a tool (issue #374).
 *
 * `build` → import into the Spine editor → export back to JSON → gate, `diff`,
 * `render` and `check` the export against the build it came from. It is the one
 * measurement that answers *"does the editor accept what rigc wrote, and does
 * what comes back still play the same"*, and on its first run it found three
 * emitter defects (#368 `hull`/`edges`, #369 hold curves, #370
 * `skeleton.images`) before proving that a human edit survives the trip.
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
const EDITOR_DEFAULTS: Record<string, string> = {
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
 * Every `diff` measure that is not a perfect match — what the editor changed,
 * named by the measure that saw it.
 *
 * A round trip through a correct editor moves nothing, so an empty list is the
 * result and a populated one is the finding. Silence is not reported as a
 * match: a report that could not be read says so.
 */
function movedMeasures(reportPath: string): string[] {
  if (!existsSync(reportPath)) return ['(no diff report was written, so nothing was read from one)'];
  interface Measure { id: string; what: string; matched: number; total: number; ratio: number }
  interface Report { sections?: Array<{ name: string; measures?: Measure[] }> }
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report;
  const moved: string[] = [];
  let measured = 0;
  for (const section of report.sections ?? []) {
    for (const m of section.measures ?? []) {
      measured++;
      if (m.ratio === 1) continue;
      moved.push(`  moved  ${m.id}  ${m.matched}/${m.total} (${(m.ratio * 100).toFixed(2)}%) — ${m.what}`);
    }
  }
  if (measured === 0) return ['(the diff report carried no measures — read it before believing this run)'];
  return moved.length === 0 ? [`  ${measured} measure(s), every one a perfect match`] : moved;
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
    animation: string;
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
      `  ${a.animation.padEnd(12)} ${a.compared} frame(s)  mean MAE ${a.meanMae.toFixed(4)}  worst ${a.worstMae.toFixed(4)}` +
      `  worst drift ${a.worstDrift.toFixed(3)}px${a.worstDriftSlot ? ` on ${a.worstDriftSlot} @ f${a.worstDriftFrame}` : ''}`,
  );
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
      skins?: Array<{ attachments?: Record<string, Record<string, { type?: string; path?: string }>> }>;
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
            wanted.add(att.path ?? placeholder);
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
  for (const line of movedMeasures(diffJson)) emit(`  ${line}`);

  emit('');
  emit(`## 5 render both @${opts.fps}fps, check the export against the build's own frames`);
  run(rigc.cmd, [...rigc.prefix, 'render', '--candidate', opts.build, '--fps', String(opts.fps), '--out', join(opts.out, 'render-build')], 900);
  run(rigc.cmd, [...rigc.prefix, 'render', '--candidate', cand, '--fps', String(opts.fps), '--out', join(opts.out, 'render-export')], 900);
  const check = run(
    rigc.cmd,
    [...rigc.prefix, 'check', '--candidate', cand, '--frames', join(opts.out, 'render-build'), '--json', join(opts.out, 'check.json')],
    900,
  );
  emit(`  exit=${check.status}`);
  for (const line of verdictLines(check.stdout)) emit(`  ${line}`);
  for (const line of checkFigures(join(opts.out, 'check.json'))) emit(`  ${line}`);

  emit('');
  emit('## 6 what the editor rewrote');
  const rows = shapeDiff(shapeOf(source), shapeOf(join(cand, 'skeleton.json')));
  if (rows.length === 0) emit('  nothing at this resolution: same version, counts, animations and timeline kinds');
  for (const row of rows) emit(`  ${row}`);

  keepLog();
  emit('');
  emit(`log: ${logPath}`);
  // The verdict is the gate's and the check's, not this tool's opinion of them.
  process.exit(gate.status === 0 && check.status === 0 ? 0 : 1);
}

// ⭐ Guarded so `shapeOf` and `shapeDiff` can be READ by a control that has no
// editor (issue #561). Every other `ERT` case drives this file as a subprocess,
// which is the right shape for a refusal; step 6's summary is a pure function of
// two skeleton files, and driving an editor — or four rigc subcommands — to
// reach it would be paying for a round trip to test arithmetic. Run as a
// program this is unchanged: `bun tools/editor_roundtrip.ts …` makes this module
// the entry, so `import.meta.main` is true.
if (import.meta.main) main();
