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
 * ⛔ **It can never be a selftest control.** The suite is self-contained and CI
 * has no editor; a control that needs one would report SKIP forever, which is
 * how a gate comes to look kept while checking nothing. When the editor is
 * absent this tool REFUSES by name and exits non-zero — the honest answer, and
 * never a pass.
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
interface Shape {
  spine: string;
  bones: number;
  slots: number;
  attachments: number;
  constraints: Record<string, number>;
  animations: string[];
  timelineKinds: string[];
  images: string | null;
}

function shapeOf(path: string): Shape {
  interface Skel {
    skeleton?: { spine?: string; images?: string };
    bones?: unknown[];
    slots?: unknown[];
    skins?: Array<{ attachments?: Record<string, Record<string, unknown>> }>;
    ik?: unknown[];
    transform?: unknown[];
    path?: unknown[];
    physics?: unknown[];
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
    constraints: {
      ik: (d.ik ?? []).length,
      transform: (d.transform ?? []).length,
      path: (d.path ?? []).length,
      physics: (d.physics ?? []).length,
    },
    animations: Object.keys(d.animations ?? {}).sort(),
    timelineKinds: [...kinds].sort(),
    images: d.skeleton?.images ?? null,
  };
}

/** The rows where the two shapes disagree — what the editor rewrote. */
function shapeDiff(before: Shape, after: Shape): string[] {
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
  for (const k of Object.keys(before.constraints)) cmp(`${k} constraints`, before.constraints[k], after.constraints[k]);
  cmp('animations', before.animations, after.animations);
  cmp('timeline kinds', before.timelineKinds, after.timelineKinds);
  return rows;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const rigc = rigcCommand();
  const fail = (message: string): never => {
    console.error(`rigc editor_roundtrip: ${message}`);
    process.exit(1);
  };

  const source = join(opts.build, 'skeleton.json');
  if (!existsSync(source)) fail(`no skeleton.json in the build directory ${opts.build}`);

  rmSync(opts.out, { recursive: true, force: true });
  mkdirSync(join(opts.out, 'export'), { recursive: true });
  mkdirSync(join(opts.out, 'export-cand'), { recursive: true });

  const log: string[] = [];
  const emit = (line: string): void => {
    console.log(line);
    log.push(line);
  };

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
          'This tool round-trips through a LICENSED Spine editor and has nothing to measure without one — ' +
          'pass --editor <path>, or run it on a machine that has the editor installed. ' +
          'See https://esotericsoftware.com/spine-command-line-interface',
      );
    }
    const ver = run(opts.editor, ['--version'], 60);
    emit(`  editor   ${opts.editor}`);
    for (const line of ver.stdout.trim().split('\n').slice(-3)) emit(`           ${line}`);
    const pin = opts.editorVersion === null ? [] : ['-u', opts.editorVersion];

    emit('');
    emit('## 1 import  (json -> project)');
    const project = join(opts.out, `${opts.name}.spine`);
    const imported = run(opts.editor, [...pin, '-i', source, '-o', project, '-r', opts.name], opts.timeoutS);
    emit(`  exit=${imported.status}${imported.timedOut ? `  TIMED OUT after ${opts.timeoutS}s` : ''}`);
    if (imported.timedOut) fail(`the editor did not return within ${opts.timeoutS}s on import — that is a hang, not a result`);
    if (!existsSync(project)) fail('the editor wrote no project file; the import did not happen');

    emit('');
    emit('## 2 export  (project -> json, default settings)');
    const exported = run(opts.editor, [...pin, '-i', project, '-o', join(opts.out, 'export'), '-e', 'json'], opts.timeoutS);
    emit(`  exit=${exported.status}${exported.timedOut ? `  TIMED OUT after ${opts.timeoutS}s` : ''}`);
    if (exported.timedOut) fail(`the editor did not return within ${opts.timeoutS}s on export — that is a hang, not a result`);
    const written = readdirSync(join(opts.out, 'export')).filter((f) => f.endsWith('.json'));
    if (written.length === 0) fail('the editor wrote no json; stopping before the re-gate rather than measuring nothing');
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

  writeFileSync(join(opts.out, 'roundtrip.log'), `${log.join('\n')}\n`);
  emit('');
  emit(`log: ${join(opts.out, 'roundtrip.log')}`);
  // The verdict is the gate's and the check's, not this tool's opinion of them.
  process.exit(gate.status === 0 && check.status === 0 ? 0 : 1);
}

main();
