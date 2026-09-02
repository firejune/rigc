#!/usr/bin/env bun
/**
 * rigc — the rig compiler.
 *
 *   bun cli.ts build --rig <path> --motion <path> --out <dir> [--manifest <path>]
 *   bun cli.ts build --cut <name> --cuts <cuts.json>
 *   bun cli.ts explain --rig <path> --motion <path> --out <dir>
 *   bun cli.ts explain --cut <name> --cuts <cuts.json>
 *   bun cli.ts validate <dir>            re-run the gate on artifacts on disk
 *   bun cli.ts check --candidate <dir> --frames <dir>   compare against pictures
 *
 * `build` emits ONLY if validate is green. That ordering is the point: the
 * compiler is allowed to be wrong, it is not allowed to leave the wrong thing
 * on disk.
 *
 * ⚠️ Green is a claim about VALIDITY and about nothing else. The gate has no way
 * to know whether the animation is the one that was asked for — a build with
 * every easing reversed passes it — so `check` is the other half of the loop, and
 * it is a separate command because it needs something the gate does not have: a
 * picture of what the result is supposed to look like.
 *
 * rigc knows nothing about any particular project. A cut is a rig spec, a motion
 * spec and an output directory — plus a cut manifest when there is measured art
 * behind it — and a `cuts.json` is a named table of them:
 *
 *   {
 *     "my_cut": { "rig": "…/rigs/my_rig.rig.json", "motion": "…/my.motion.json",
 *                 "out": "…/spine", "manifest": "…/manifest.json" }
 *   }
 *
 * Its paths resolve against the cuts.json file itself, so the table travels
 * with the project that owns the art rather than with this repository.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  BallotError,
  buildBallot,
  ledgerLineText,
  MAX_CANDIDATES,
  MIN_CANDIDATES,
  parseLedger,
  readBallotManifest,
  resultFilename,
  TIE,
  verifyResult,
  VOTE_RULES,
  type BallotCandidateInput,
  type BallotInput,
} from './src/ballot.ts';
import { checkAgainstFrames, checkLines, CheckError, type CheckOptions, type CheckReport } from './src/check.ts';
import { compile, CompileError, type CompileOptions } from './src/compile.ts';
import { diffLines, diffSkeletons, sectionFigures, type DiffReport } from './src/diff.ts';
import { copyAtlasImages } from './src/emit.ts';
import { parseJsonWithPosition } from './src/json-position.ts';
import { findRung, RUNG_IDS, type RungSkeleton } from './src/ladder.ts';
import {
  DEFAULT_MAX_RESIDUAL,
  DEFAULT_SCALE_MAX,
  DEFAULT_SCALE_MIN,
  estimatePose,
  PoseError,
  poseLines,
  type PoseOptions,
} from './src/pose.ts';
import { buildPreview, PLAYER_LINE, type PreviewPage } from './src/preview.ts';
import {
  atlasPageNames,
  BACKGROUND,
  contactSheet,
  FRAMES_SIDECAR,
  FRAMES_SPEC,
  framingViewport,
  loadPosable,
  PROTOCOL_FPS,
  renderFrame,
  sampleAll,
  sampleAnimation,
  SETUP_POSE_DIR,
  SHEET_FILE,
  SHEET_TILE,
  type Frame,
  type FramesSidecar,
  type FrameSet,
} from './src/render.ts';
import { CLI_DEFAULT_PROFILE, reportLines, validate, VALIDATE_PROFILES, type ValidateProfile } from './src/validate.ts';
import type { CompileResult, MotionSpec } from './src/types.ts';

/**
 * One entry of a cuts.json, every path relative to the cuts.json file.
 *
 * `rig` is required — it is the skeleton's structure, and until it was a file
 * that structure was three hard-coded tables in the compiler. `manifest` is
 * optional: a skeleton with no measured art behind it has none, and then the rig
 * spec carries its own attachments and stage size.
 */
export interface CutEntry {
  rig: string;
  motion: string;
  out: string;
  manifest?: string;
  /** Base directory for the rig spec's `image` references, if not the rig's own. */
  images?: string;
}

export type CutTable = Record<string, CutEntry>;

class UsageError extends Error {}

// ---------------------------------------------------------------------------
// package metadata — the installed version and repository, for `--version`
// and for naming a remedy `bench` can only give from a repo checkout.
// ---------------------------------------------------------------------------

interface PackageMeta {
  version?: string;
  repository?: string | { url?: string };
}

let packageMeta: PackageMeta | null | undefined;

/** `package.json` sits next to this file both in the repo and once installed. */
function readPackageMeta(): PackageMeta | null {
  if (packageMeta === undefined) {
    try {
      packageMeta = JSON.parse(readFileSync(join(import.meta.dir, 'package.json'), 'utf8')) as PackageMeta;
    } catch {
      packageMeta = null;
    }
  }
  return packageMeta;
}

function readVersion(): string {
  return readPackageMeta()?.version ?? 'unknown';
}

function repositoryUrl(): string {
  const repo = readPackageMeta()?.repository;
  const url = typeof repo === 'string' ? repo : repo?.url;
  return (url ?? 'https://github.com/firejune/rigc').replace(/^git\+/, '').replace(/\.git$/, '');
}

// ---------------------------------------------------------------------------
// argument parsing
// ---------------------------------------------------------------------------

/**
 * The flags that are switches rather than `--flag value` pairs.
 *
 * Listed by name rather than inferred from "the next argument looks like a
 * flag": inferring it would turn `--out --json report.json` — a real typo, a
 * missing value — into a silently accepted switch plus a stray positional.
 */
const BOOLEAN_FLAGS = new Set(['all-frames', 'help', 'copy-images', 'again']);

/**
 * The flags a command is allowed to spell more than once.
 *
 * Only `vote --candidate` is, because a ballot is *by definition* several
 * candidates. Everywhere else a repeat is a mistake and is refused: `check
 * --candidate a --candidate b` used to take `b` silently, which is a report
 * about a rig the caller did not think they were asking about.
 */
const REPEATABLE_FLAGS: Record<string, ReadonlySet<string>> = {
  vote: new Set(['candidate']),
};

/**
 * `--flag value` pairs plus the leftover positionals, in order.
 *
 * `lists` carries every occurrence of every flag and `flags` carries the last
 * one, so a command that wants a repeated flag reads `lists` and the ones that
 * do not are untouched by the addition.
 */
function parseArgs(
  argv: string[],
  repeatable: ReadonlySet<string> = new Set(),
): { flags: Record<string, string>; lists: Record<string, string[]>; positional: string[] } {
  const flags: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  const positional: string[] = [];
  const take = (name: string, value: string): void => {
    if (flags[name] !== undefined && !repeatable.has(name)) {
      throw new UsageError(
        `--${name} was given more than once (${JSON.stringify(flags[name])} then ${JSON.stringify(value)}); ` +
          'this command takes it once',
      );
    }
    flags[name] = value;
    (lists[name] ??= []).push(value);
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        take(arg.slice(2, eq), arg.slice(eq + 1));
      } else if (BOOLEAN_FLAGS.has(arg.slice(2))) {
        take(arg.slice(2), 'true');
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) throw new UsageError(`${arg} needs a value`);
        take(arg.slice(2), next);
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, lists, positional };
}

/**
 * Read and parse a JSON file the caller named on the command line — a cuts
 * table, a candidate or reference skeleton to `diff`. A parse failure names the
 * file and, best-effort, where inside it the syntax broke (see
 * `parseJsonWithPosition`); left as a raw `JSON.parse`, it would surface as an
 * unhandled `SyntaxError` with a stack trace instead of a usage error.
 */
function readJsonFile(path: string): unknown {
  try {
    return parseJsonWithPosition(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new UsageError(`cannot read ${path}: ${(err as Error).message}`);
  }
}

/**
 * Read a cuts.json and resolve its three paths against the file's own
 * directory. Anchoring on the table rather than on the process cwd is what lets
 * the same command work from anywhere in the owning project.
 */
function readCutTable(cutsPath: string): { dir: string; table: CutTable } {
  const abs = resolve(cutsPath);
  if (!existsSync(abs)) throw new UsageError(`no cuts file at ${abs}`);
  const parsed = readJsonFile(abs);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new UsageError(`${abs}: expected an object of cut name -> { manifest, motion, out }`);
  }
  return { dir: dirname(abs), table: parsed as CutTable };
}

function entryToOptions(dir: string, name: string, entry: CutEntry): CompileOptions {
  for (const key of ['rig', 'motion', 'out'] as const) {
    if (typeof entry?.[key] !== 'string') throw new UsageError(`cut ${JSON.stringify(name)} has no "${key}" path`);
  }
  const opts: CompileOptions = {
    rigPath: resolve(dir, entry.rig),
    motionPath: resolve(dir, entry.motion),
    outDir: resolve(dir, entry.out),
  };
  if (entry.manifest !== undefined) opts.manifestPath = resolve(dir, entry.manifest);
  if (entry.images !== undefined) opts.imagesDir = resolve(dir, entry.images);
  return opts;
}

/**
 * Resolve the cut a command was pointed at, either spelled out on the command
 * line or looked up by name in a cuts.json.
 */
function resolveCut(flags: Record<string, string>): { label: string; opts: CompileOptions } {
  const explicit =
    flags.rig !== undefined || flags.manifest !== undefined || flags.motion !== undefined || flags.out !== undefined;
  if (explicit) {
    if (flags.cut !== undefined || flags.cuts !== undefined) {
      throw new UsageError('--rig/--motion/--out and --cut/--cuts are two ways to say the same thing; pick one');
    }
    for (const key of ['rig', 'motion', 'out'] as const) {
      if (flags[key] === undefined) throw new UsageError(`--${key} is required when the cut is spelled out`);
    }
    const opts: CompileOptions = {
      rigPath: resolve(flags.rig),
      motionPath: resolve(flags.motion),
      outDir: resolve(flags.out),
    };
    if (flags.manifest !== undefined) opts.manifestPath = resolve(flags.manifest);
    if (flags.images !== undefined) opts.imagesDir = resolve(flags.images);
    return { label: flags.rig, opts };
  }
  if (flags.cut === undefined) throw new UsageError('give either --cut <name> --cuts <cuts.json>, or --rig/--motion/--out');
  if (flags.cuts === undefined) throw new UsageError('--cut needs --cuts <cuts.json> to look the name up in');
  const { dir, table } = readCutTable(flags.cuts);
  const entry = table[flags.cut];
  if (!entry) {
    throw new UsageError(
      `unknown cut ${JSON.stringify(flags.cut)} in ${resolve(flags.cuts)}. known: ${Object.keys(table).join(', ') || '(none)'}`,
    );
  }
  return { label: flags.cut, opts: entryToOptions(dir, flags.cut, entry) };
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

/**
 * Read `--profile`, defaulting to `spine` — see `CLI_DEFAULT_PROFILE`.
 *
 * An unknown name is a usage error rather than a silent fallback, and that
 * matters in both directions: a typo used to re-apply the strictest rulebook to
 * data the caller was trying to exempt, and it would now drop the policy layer
 * from a caller who typed `--profile spine-htlm` and believes they asked for it.
 * Neither is something to discover from a green.
 */
function readProfile(flags: Record<string, string>): ValidateProfile {
  const raw = flags.profile;
  if (raw === undefined) return CLI_DEFAULT_PROFILE;
  const found = VALIDATE_PROFILES.find((p) => p === raw);
  if (!found) throw new UsageError(`--profile ${JSON.stringify(raw)}; known profiles: ${VALIDATE_PROFILES.join(', ')}`);
  return found;
}

function runGate(result: CompileResult, opts: CompileOptions, profile: ValidateProfile): number {
  // The determinism check compares a second, independent compile.
  const again = compile(opts);
  const report = validate({
    skeletonText: result.skeletonText,
    atlasText: result.atlasText,
    atlasDir: opts.outDir,
    declaredDurations: result.declaredDurations,
    reEmit: { skeletonText: again.skeletonText, atlasText: again.atlasText },
    rig: result.rig,
    profile,
  });
  for (const line of reportLines(report)) console.log(line);
  console.log(
    `  ..    ${Object.entries(report.stats)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  );
  return report.failures.length;
}

function cmdBuild(flags: Record<string, string>): void {
  const { label, opts } = resolveCut(flags);
  const profile = readProfile(flags);
  console.log(`rigc build ${label}`);
  // Named explicitly and on their own lines rather than folded into the header
  // above: with two input files, a header that names only one of them (the rig,
  // historically) reads as though it were the one at fault whenever the error
  // that follows actually comes from the other.
  console.log(`  ..    rig    ${opts.rigPath}`);
  console.log(`  ..    motion ${opts.motionPath}`);
  const result = compile(opts);

  console.log(`  ..    ${result.images.length} part page(s):`);
  for (const img of result.images) {
    console.log(`  ..      ${img.region.padEnd(24)} ${img.width}x${img.height}  <- ${img.page}`);
  }
  for (const d of result.droppedStates) {
    console.log(`  DROP  ${d.slot}/${d.state}: no PNG at ${d.path} (state not emitted)`);
  }
  // "The optional slots are optional" is a claim about this code path, so this
  // code path says which ones it left out rather than being silently right.
  for (const a of result.absentParts) {
    console.log(`  ABSENT ${a.slot}: ${a.why} — slot not emitted`);
  }
  for (const m of result.meshes) {
    console.log(
      `  MESH  ${m.slot.padEnd(12)} ${m.kind.padEnd(6)} ${m.vertices} vertices / ${m.triangles} triangles  ` +
        `(budget 80)  bones=[${m.bones.join(', ')}]  attachments=[${m.attachments.join(', ')}]`,
    );
  }
  for (const ph of result.physics) {
    console.log(
      `  PHYS  ${ph.name.padEnd(12)} bone=${ph.bone.padEnd(14)} components=[${ph.components.join(', ')}] ` +
        `mix=${ph.mix}${ph.drivesMesh ? '  <- drives a mesh: its canvas re-rasterises while the spring settles' : ''}`,
    );
  }

  console.log(`  ..    validate (spine-core round trip + machine assertions, profile ${profile})`);
  const failures = runGate(result, opts, profile);
  if (failures > 0) {
    console.error(`rigc: ${failures} assertion(s) failed — nothing written`);
    process.exit(1);
  }

  mkdirSync(opts.outDir, { recursive: true });

  // `--copy-images`: `--out` is otherwise NOT self-contained — a page's default
  // path is relative to the source art (often `../parts/foo.png`), which is
  // correct for a build sitting beside the project it came from and breaks the
  // moment the directory is zipped, committed or moved on its own (issue #217).
  // Opt-in only: the default stays exactly what it has always been.
  let atlasText = result.atlasText;
  if (flags['copy-images'] !== undefined) {
    const copied = copyAtlasImages(result.images, opts.outDir);
    atlasText = copied.atlasText;
    console.log(`  ..    copy-images: ${copied.pages.length} page(s) copied into ${opts.outDir}`);
    for (const p of copied.pages) {
      const note = p.to === basename(p.from) ? '' : `  (renamed from ${basename(p.from)} — basename collision)`;
      console.log(`  ..      ${p.region.padEnd(24)} <- ${p.to}${note}`);
    }
  }

  writeFileSync(join(opts.outDir, 'skeleton.json'), result.skeletonText);
  writeFileSync(join(opts.outDir, 'skeleton.atlas'), atlasText);
  console.log(`rigc: wrote ${join(opts.outDir, 'skeleton.json')}`);
  console.log(`rigc: wrote ${join(opts.outDir, 'skeleton.atlas')}`);
}

/**
 * Where a pair of artifacts lives, given what the caller pointed at.
 *
 * Two shapes, because rigc's own output and a foreign export are named
 * differently and both have to be gateable. rigc writes `skeleton.json` +
 * `skeleton.atlas` into a directory. Everybody else writes whatever the editor
 * called the project, and the official examples are not even consistent with
 * themselves — `7-anticipation/export/` holds `sack-pro.json`, `spineboy/export/`
 * holds two skeletons and two atlases.
 *
 * ⚠️ When more than one atlas sits beside the skeleton, this refuses to choose.
 * Guessing by name would be wrong on the corpus that motivated it: `spineboy-ess`
 * shares a longer prefix with `spineboy-run.atlas` than with the `spineboy.atlas`
 * it actually uses, so the plausible heuristic picks the wrong file and every
 * attachment then resolves against the wrong pixels — silently, which is the
 * exact failure mode this tool exists to remove.
 */
function resolveArtifacts(target: string, atlasFlag: string | undefined): { skeletonPath: string; atlasPath: string } {
  const abs = resolve(target);
  if (!existsSync(abs)) throw new UsageError(`nothing at ${abs}`);
  if (statSync(abs).isDirectory()) {
    return {
      skeletonPath: join(abs, 'skeleton.json'),
      atlasPath: atlasFlag ? resolve(atlasFlag) : join(abs, 'skeleton.atlas'),
    };
  }
  if (!abs.endsWith('.json')) throw new UsageError(`${abs} is neither a directory nor a .json skeleton`);
  if (atlasFlag) return { skeletonPath: abs, atlasPath: resolve(atlasFlag) };
  const dir = dirname(abs);
  const atlases = readdirSync(dir)
    .filter((f) => f.endsWith('.atlas'))
    .sort();
  if (atlases.length === 1) return { skeletonPath: abs, atlasPath: join(dir, atlases[0]) };
  if (atlases.length === 0) throw new UsageError(`no .atlas beside ${abs}; name one with --atlas <path>`);
  throw new UsageError(
    `${atlases.length} atlases beside ${abs} (${atlases.join(', ')}); name the right one with --atlas <path> ` +
      '— guessing by filename is how an attachment quietly resolves against the wrong page',
  );
}

function cmdValidate(flags: Record<string, string>, positional: string[]): void {
  // A bare directory validates what is on disk. Naming the cut as well lets the
  // gate re-derive the declared durations and the structural expectations, which
  // a directory alone cannot supply — and the report says which it had.
  const named = flags.cut !== undefined || flags.rig !== undefined;
  const profile = readProfile(flags);
  const derivedOpts = named ? resolveCut(flags).opts : null;
  const { skeletonPath, atlasPath } = resolveArtifacts(derivedOpts ? derivedOpts.outDir : (positional[0] ?? '.'), flags.atlas);
  console.log(`rigc validate ${skeletonPath}`);
  console.log(`  ..    atlas ${atlasPath}`);
  const skeletonText = readFileSync(skeletonPath, 'utf8');
  const atlasText = readFileSync(atlasPath, 'utf8');
  const derived = derivedOpts ? compile(derivedOpts) : null;

  const report = validate({
    skeletonText,
    atlasText,
    atlasDir: dirname(atlasPath),
    declaredDurations: derived?.declaredDurations,
    rig: derived?.rig,
    profile,
  });
  for (const line of reportLines(report)) console.log(line);
  if (report.failures.length > 0) {
    console.error(`rigc: ${report.failures.length} assertion(s) failed`);
    process.exit(1);
  }
  console.log('rigc: green');
}

function cmdDiff(flags: Record<string, string>, positional: string[]): void {
  const [candidate, reference] = positional;
  if (!candidate || !reference) throw new UsageError('diff takes two paths: <candidate.json> <reference.json>');
  const candidatePath = resolve(candidate);
  const referencePath = resolve(reference);
  for (const path of [candidatePath, referencePath]) {
    if (!existsSync(path)) throw new UsageError(`nothing at ${path}`);
  }
  const report = diffSkeletons(readJsonFile(candidatePath), readJsonFile(referencePath));
  console.log('rigc diff');
  for (const line of diffLines(report, { candidate: candidatePath, reference: referencePath })) console.log(line);
  if (flags.json !== undefined) {
    // ⚠️ `...report` carries its OWN `candidate` and `reference` — the raw
    // per-side counts. Spelling the paths under those two names put them on
    // the losing side of the spread, so the written report named neither file
    // it compared. The paths get their own keys.
    writeJson(flags.json, { candidatePath, referencePath, ...report });
  }
}

/**
 * check — how close does the candidate LOOK to the reference frames?
 *
 * ⭐ The gate cannot see a wrong animation. It parses, it steps, it refuses the
 * degenerate — and a rig whose easings are all reversed passes it green, which is
 * not a hypothetical: ladder rung 1's first honest run shipped exactly that build
 * and the validator was structurally incapable of noticing. `diff` cannot see it
 * either, because it compares structure and a reversed curve is the same curve
 * count. The only thing that can is a picture, so this renders the candidate into
 * the reference's own frame and compares pixels.
 *
 * 🔒 It never reads the reference skeleton — see `src/check.ts`. That is what
 * keeps it usable **inside** an authoring loop rather than at the finish line the
 * way `bench` is: an author may run it as often as they like without their run
 * stopping being an authoring run.
 *
 * There is no pass mark, for the same reason `diff` has none.
 */
function readCheckFlags(flags: Record<string, string>): Pick<CheckOptions, 'fps' | 'viewport' | 'as' | 'framing'> {
  const out: Pick<CheckOptions, 'fps' | 'viewport' | 'as' | 'framing'> = {};
  if (flags.framing !== undefined) {
    if (flags.framing !== 'per-shot' && flags.framing !== 'shared') {
      throw new UsageError('--framing takes per-shot (the default) or shared');
    }
    out.framing = flags.framing;
  }
  if (flags.fps !== undefined) {
    const fps = Number(flags.fps);
    if (!Number.isFinite(fps) || fps <= 0) throw new UsageError('--fps must be a positive number');
    out.fps = fps;
  }
  if (flags.viewport !== undefined) {
    const parts = flags.viewport.split(',').map((s) => Number(s.trim()));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      throw new UsageError('--viewport takes four numbers: <x>,<y>,<width>,<height> — the world box, y up');
    }
    if (parts[2] <= 0 || parts[3] <= 0) throw new UsageError('--viewport width and height must be positive');
    out.viewport = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
  }
  if (flags.as !== undefined) out.as = flags.as;
  return out;
}

function runCheck(candidate: string, atlasFlag: string | undefined, framesDir: string, flags: Record<string, string>): CheckReport {
  const { skeletonPath, atlasPath } = resolveArtifacts(candidate, atlasFlag);
  return checkAgainstFrames({
    skeletonText: readFileSync(skeletonPath, 'utf8'),
    atlasText: readFileSync(atlasPath, 'utf8'),
    atlasDir: dirname(atlasPath),
    framesDir,
    labels: { skeleton: skeletonPath, atlas: atlasPath },
    ...readCheckFlags(flags),
  });
}

function cmdCheck(flags: Record<string, string>): void {
  if (flags.candidate === undefined) throw new UsageError('check needs --candidate <dir | skeleton.json>');
  if (flags.frames === undefined) throw new UsageError('check needs --frames <dir> — a rendered reference frame set');
  const report = runCheck(flags.candidate, flags.atlas, flags.frames, flags);
  console.log('rigc check');
  for (const line of checkLines(report, { allFrames: flags['all-frames'] !== undefined })) console.log(line);
  if (flags.json !== undefined) writeJson(flags.json, report);
}

function writeJson(target: string, body: unknown): void {
  const out = resolve(target);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(body, null, 2)}\n`);
  console.log(`rigc: wrote ${out}`);
}

// ---------------------------------------------------------------------------
// seeing the result — render and preview
// ---------------------------------------------------------------------------
//
// ⭐ Why two commands exist for one question. `validate` says the artifact is
// valid, `check` says how close it is to reference frames — and a first user has
// neither a reference nor any way to look at what they built. A rig whose head
// sits visibly off its torso passes the gate, loads in `spine-core` and steps
// cleanly, because the offsets are the ones the spec asked for. The only remedy
// is looking (issue #216).
//
// `render` looks with OUR rasteriser: PNGs on disk, no browser, no network, and
// the same frame geometry `check` compares against — so its output is a frame set
// like any other, sidecar included. `preview` looks with ESOTERIC'S, in one HTML
// file, which is the stronger statement of the two: a rig that plays there has
// been played by the reference implementation rather than by ours (issue #151).
//
// Both take a COMPILED artifact rather than a rig and motion spec. That is what
// `check`, `bench` and `validate` all take, it is what `build --out` leaves
// behind, and it keeps `--out` meaning one thing per command instead of naming
// the build directory on the way in and the pictures on the way out.

/** Both commands' shared front door: which artifact, and what is in it. */
function resolveViewable(flags: Record<string, string>): {
  skeletonPath: string;
  atlasPath: string;
  atlasDir: string;
} {
  if (flags.candidate === undefined) {
    throw new UsageError('needs --candidate <dir | skeleton.json> — the directory `build --out` wrote');
  }
  const { skeletonPath, atlasPath } = resolveArtifacts(flags.candidate, flags.atlas);
  for (const path of [skeletonPath, atlasPath]) {
    if (!existsSync(path)) throw new UsageError(`nothing at ${path}`);
  }
  return { skeletonPath, atlasPath, atlasDir: dirname(atlasPath) };
}

/** `--animation`, checked against what the skeleton actually carries. */
function readAnimationFlag(flags: Record<string, string>, available: string[]): string | undefined {
  const name = flags.animation;
  if (name === undefined) return undefined;
  if (!available.includes(name)) {
    throw new UsageError(
      `no animation ${JSON.stringify(name)} in this skeleton; it has [${available.join(', ') || 'none'}]`,
    );
  }
  return name;
}

function readPositiveNumber(flags: Record<string, string>, key: string, fallback: number, least: number): number {
  const raw = flags[key];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < least) throw new UsageError(`--${key} must be a number of at least ${least}`);
  return value;
}

/**
 * render — the frame series, drawn by the same rasteriser `check` measures with.
 *
 * The framing is measured across EVERY animation at `FRAMING_FPS` and not across
 * the one being written, which is `src/render.ts`'s own invariant: the viewport is
 * a property of the shot, so two animations of one rig — and the same animation at
 * two rates — land on one pixel grid and stay comparable.
 */
function cmdRender(flags: Record<string, string>): void {
  const { skeletonPath, atlasPath, atlasDir } = resolveViewable(flags);
  const fps = readPositiveNumber(flags, 'fps', PROTOCOL_FPS, 1);
  const maxSide = readPositiveNumber(flags, 'max', 256, 16);
  const outRoot = resolve(flags.out ?? 'render');

  console.log('rigc render');
  console.log(`  ..    skeleton ${skeletonPath}`);
  console.log(`  ..    atlas    ${atlasPath}`);
  const { data, pages } = loadPosable(skeletonPath, atlasPath, atlasDir);
  const only = readAnimationFlag(flags, data.animations.map((a) => a.name));

  const viewport = framingViewport(data, maxSide);
  if (!viewport) {
    throw new UsageError(
      `${skeletonPath} posed no drawable attachment in any animation or in its setup pose — there is nothing to draw`,
    );
  }

  // `sampleAll` covers the skeleton with no animation at all, which files its one
  // setup-pose frame under the reserved name. Narrowing to one animation reuses
  // the same sampler rather than a second path through it.
  const sampled: Map<string, Frame[]> =
    only === undefined ? sampleAll(data, fps) : new Map([[only, sampleAnimation(data, only, fps)]]);
  console.log(`  ..    ${viewport.width}x${viewport.height}px at ${fps} fps, ${sampled.size} set(s) -> ${outRoot}`);

  mkdirSync(outRoot, { recursive: true });
  const sets: FrameSet[] = [];
  for (const [name, frames] of sampled) {
    // Same naming as a reference render: the protocol rate says nothing, any
    // other rate says itself, so two rates of one animation sit side by side.
    const dirName = fps === PROTOCOL_FPS ? name : `${name}@${fps}fps`;
    const dir = join(outRoot, dirName);
    // Cleared rather than written over: a shorter animation would otherwise leave
    // the tail of a longer previous run on disk, and stale frames in a frame set
    // are indistinguishable from real ones.
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    for (let i = 0; i < frames.length; i++) {
      renderFrame(frames[i], pages, viewport, BACKGROUND).writePng(join(dir, `f${String(i).padStart(4, '0')}.png`));
    }
    // One frame has nothing to compare itself against, so it gets no sheet — it
    // would be the same picture with a border and a "0" on it.
    const sheet = frames.length > 1;
    if (sheet) contactSheet(frames, pages, viewport, SHEET_TILE).writePng(join(dir, SHEET_FILE));
    const duration = frames[frames.length - 1].time;
    sets.push({
      dir: dirName,
      animation: name === SETUP_POSE_DIR && data.animations.length === 0 ? null : name,
      fps,
      sampled: frames.length,
      written: frames.length,
      stride: 1,
      duration,
    });
    const how = frames.length === 1 ? 'a single pose' : `${duration.toFixed(3)}s`;
    console.log(`  ..    ${name.padEnd(16)} ${frames.length} frame(s), ${how}${sheet ? ` + ${SHEET_FILE}` : ''} -> ${dir}`);
  }

  // The sidecar is what makes this a frame SET rather than a pile of pictures:
  // the world box every frame is a picture of, so a distance measured in pixels
  // converts back to the units the rig is authored in — and so `rigc check` can
  // render something else into the same grid later.
  const sidecar: FramesSidecar = {
    spec: FRAMES_SPEC,
    background: BACKGROUND,
    viewport: {
      x: viewport.minX,
      y: viewport.minY,
      width: viewport.maxX - viewport.minX,
      height: viewport.maxY - viewport.minY,
      scale: viewport.scale,
      pixelWidth: viewport.width,
      pixelHeight: viewport.height,
    },
    sets: [...sets].sort((a, b) => a.dir.localeCompare(b.dir)),
  };
  writeFileSync(join(outRoot, FRAMES_SIDECAR), `${JSON.stringify(sidecar, null, 2)}\n`);
  console.log(`rigc: wrote ${join(outRoot, FRAMES_SIDECAR)}`);
}

/** The animation names an emitted skeleton carries, in the order it lists them. */
function skeletonAnimationNames(skeletonText: string, path: string): string[] {
  let parsed: unknown;
  try {
    parsed = parseJsonWithPosition(skeletonText);
  } catch (err) {
    throw new UsageError(`cannot read ${path}: ${(err as Error).message}`);
  }
  if (typeof parsed !== 'object' || parsed === null) throw new UsageError(`${path} is not a skeleton object`);
  const animations = (parsed as { animations?: unknown }).animations;
  if (animations === undefined) return [];
  if (typeof animations !== 'object' || animations === null || Array.isArray(animations)) {
    throw new UsageError(`${path} has an "animations" field that is not an object`);
  }
  return Object.keys(animations);
}

/**
 * preview — the artifact playing in Esoteric's own web player, as one file.
 *
 * ⚠️ Nothing is rasterised here and nothing is decoded. The pages go into the
 * page as the bytes they are on disk, so a preview works for any PNG a BROWSER
 * can draw rather than for the ones our own decoder reads — which is the right
 * direction for the command whose whole job is "just show me".
 */
function cmdPreview(flags: Record<string, string>): void {
  const { skeletonPath, atlasPath, atlasDir } = resolveViewable(flags);
  const skeletonText = readFileSync(skeletonPath, 'utf8');
  const atlasText = readFileSync(atlasPath, 'utf8');
  const animations = skeletonAnimationNames(skeletonText, skeletonPath);
  const chosen = readAnimationFlag(flags, animations);

  // A directory for --out is taken as "put the default name in here", because
  // `--out render/` is what the sibling command means by the same flag and a
  // preview written OVER a directory is not a recoverable mistake.
  const target = resolve(flags.out ?? 'preview.html');
  const out = existsSync(target) && statSync(target).isDirectory() ? join(target, 'preview.html') : target;

  console.log('rigc preview');
  console.log(`  ..    skeleton ${skeletonPath}`);
  console.log(`  ..    atlas    ${atlasPath}`);

  const pages: PreviewPage[] = atlasPageNames(atlasText).map((name) => {
    const path = join(atlasDir, name);
    if (!existsSync(path)) {
      throw new UsageError(
        `the atlas declares page "${name}", which resolves to ${path} and is not there — ` +
          'a page a preview cannot embed is a page the player could not have loaded either',
      );
    }
    return { name, bytes: readFileSync(path) };
  });
  for (const page of pages) {
    console.log(`  ..    page     ${page.name.padEnd(28)} ${(page.bytes.length / 1024).toFixed(1)} KiB`);
  }

  const html = buildPreview({
    skeletonText,
    atlasText,
    pages,
    animation: chosen ?? animations[0] ?? null,
    animations,
    label: skeletonPath,
    version: readVersion(),
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(
    `  ..    embedded ${pages.length} page(s) + the skeleton and atlas as data URIs; ` +
      `the player itself loads from unpkg (@${PLAYER_LINE}), so the first open needs a network`,
  );
  console.log(`rigc: wrote ${out}  (${(html.length / 1024).toFixed(1)} KiB — open it in a browser)`);
}

// ---------------------------------------------------------------------------
// reading a given condition — pose
// ---------------------------------------------------------------------------
//
// ⭐ Every other command here takes a spec and looks at what came out. This one
// runs the other way: it takes a PICTURE the user already has — a key pose — and
// reads spec coordinates out of it, so an agent can state those poses in a rig and
// a motion by construction and spend its loops on the part nobody can measure, the
// movement between them.
//
// 🚫 It grades nothing, and the distinction is load-bearing rather than modest.
// `check` and `bench` compare a build against a reference and their numbers mean
// "how close"; a pose frame is not a reference, it is an INPUT, and once the spec
// states it there is nothing left to be close to. So the residual here is a trust
// signal — how much of the frame this placement actually explains — and the only
// threshold in `src/pose.ts` is the one that decides whether to print an answer at
// all, which the caller can move.
//
//   rigc pose --images parts/ --frame poseA.png [--out pose.json]

const DEFAULT_POSE_OUT = 'pose.json';

/** `--scale 0.5,2` / `--rotation -30,30` — a pair of numbers, low first. */
function readRange(flags: Record<string, string>, key: string): { low: number; high: number } | undefined {
  const raw = flags[key];
  if (raw === undefined) return undefined;
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) {
    throw new UsageError(`--${key} takes two numbers: <min>,<max>`);
  }
  if (parts[1] < parts[0]) throw new UsageError(`--${key} ${JSON.stringify(raw)}: the minimum must not exceed the maximum`);
  return { low: parts[0], high: parts[1] };
}

function cmdPose(flags: Record<string, string>): void {
  if (flags.images === undefined) throw new UsageError('pose needs --images <dir> — the directory the loose part PNGs are in');
  if (flags.frame === undefined) throw new UsageError('pose needs --frame <path> — one pose frame to read the placements out of');
  const options: PoseOptions = { imagesDir: flags.images, framePath: flags.frame };
  const scale = readRange(flags, 'scale');
  if (scale) {
    if (scale.low <= 0) throw new UsageError('--scale minimum must be greater than zero');
    options.scale = { min: scale.low, max: scale.high };
  }
  const rotation = readRange(flags, 'rotation');
  if (rotation) {
    if (rotation.high - rotation.low > 360) throw new UsageError('--rotation cannot span more than a full turn');
    options.rotation = { minDeg: rotation.low, maxDeg: rotation.high };
  }
  if (flags['max-residual'] !== undefined) {
    const value = Number(flags['max-residual']);
    if (!Number.isFinite(value) || value <= 0 || value > 1) throw new UsageError('--max-residual must be a number in (0, 1]');
    options.maxResidual = value;
  }

  console.log('rigc pose');
  const report = estimatePose(options);
  for (const line of poseLines(report)) console.log(line);

  // Same `--out` shape as `preview` and `vote`: one file, and a directory means
  // "the default name in here" rather than a report written over a directory.
  const target = resolve(flags.out ?? DEFAULT_POSE_OUT);
  const out = existsSync(target) && statSync(target).isDirectory() ? join(target, DEFAULT_POSE_OUT) : target;
  writeJson(out, report);
}

// ---------------------------------------------------------------------------
// choosing between results — vote
// ---------------------------------------------------------------------------
//
// ⭐ `preview` shows one candidate; this shows two to four of them side by side
// and takes an answer back. The rest of this toolchain is instruments, and it
// should be — the vote opens only where the instruments have already run out.
// See `src/ballot.ts` for why the ballot is ordered compile-first-vote-last,
// why the labels are A and B, and why the record is hashes.
//
// Two modes on one command, because they share exactly one thing and it is the
// contract between them: the ballot manifest. Splitting them would document
// that format twice and let the halves drift.
//
//   rigc vote --candidate <a> --candidate <b> [--animation <n>] [--out ballot.html]
//   rigc vote --record <result.json> [--ballot ballot.html] [--ledger votes.jsonl] [--again]

const DEFAULT_BALLOT = 'ballot.html';
const DEFAULT_LEDGER = 'votes.jsonl';

/** Load one candidate off disk in the shape a ballot needs. */
function loadBallotCandidate(target: string): { candidate: BallotCandidateInput; animations: string[] } {
  const { skeletonPath, atlasPath } = resolveArtifacts(target, undefined);
  for (const path of [skeletonPath, atlasPath]) {
    if (!existsSync(path)) throw new UsageError(`nothing at ${path}`);
  }
  const skeletonText = readFileSync(skeletonPath, 'utf8');
  const atlasText = readFileSync(atlasPath, 'utf8');
  const atlasDir = dirname(atlasPath);
  const pages: PreviewPage[] = atlasPageNames(atlasText).map((name) => {
    const path = join(atlasDir, name);
    if (!existsSync(path)) {
      throw new UsageError(
        `the atlas declares page "${name}", which resolves to ${path} and is not there — ` +
          'a page a ballot cannot embed is a page the player could not have loaded either',
      );
    }
    return { name, bytes: readFileSync(path) };
  });
  return {
    candidate: { source: skeletonPath, skeletonText, atlasText, pages },
    animations: skeletonAnimationNames(skeletonText, skeletonPath),
  };
}

/**
 * The one animation every candidate plays.
 *
 * ⚠️ Refused rather than resolved per candidate. Two panes running two
 * different animations look like a comparison and are not one, and a voter has
 * no way to see that it happened — the labels are `A` and `B`, which is the
 * whole point, so nothing on the screen would say so.
 */
function commonAnimation(
  flags: Record<string, string>,
  loaded: { animations: string[] }[],
): string | null {
  const asked = flags.animation;
  if (asked === undefined) {
    const first = loaded[0].animations[0];
    if (first === undefined) {
      const withAny = loaded.findIndex((l) => l.animations.length > 0);
      if (withAny !== -1) {
        throw new UsageError(
          `candidate ${withAny + 1} has animations [${loaded[withAny].animations.join(', ')}] and candidate 1 has none — ` +
            'a ballot plays one animation in every pane, so there is nothing to compare here',
        );
      }
      return null;
    }
    const missing = loaded.findIndex((l) => !l.animations.includes(first));
    if (missing !== -1) {
      throw new UsageError(
        `the default animation is candidate 1's first, ${JSON.stringify(first)}, and candidate ${missing + 1} does not ` +
          `have it (it has [${loaded[missing].animations.join(', ') || 'none'}]); name one they share with --animation`,
      );
    }
    return first;
  }
  const missing = loaded.findIndex((l) => !l.animations.includes(asked));
  if (missing !== -1) {
    throw new UsageError(
      `no animation ${JSON.stringify(asked)} in candidate ${missing + 1}; it has ` +
        `[${loaded[missing].animations.join(', ') || 'none'}]`,
    );
  }
  return asked;
}

/** vote (ballot mode) — write the page a human opens. */
function cmdVoteBallot(flags: Record<string, string>, candidates: string[]): void {
  if (candidates.length < MIN_CANDIDATES) {
    throw new UsageError(
      `a ballot needs ${MIN_CANDIDATES}–${MAX_CANDIDATES} --candidate <dir | skeleton.json>, and ${candidates.length} ` +
        'was given — one candidate on its own is `rigc preview`',
    );
  }
  if (candidates.length > MAX_CANDIDATES) {
    throw new UsageError(
      `${candidates.length} candidates were given and a ballot holds at most ${MAX_CANDIDATES} — they go side by side ` +
        'on one screen, and a comparison that needs scrolling is not a comparison',
    );
  }
  // `--atlas` names ONE atlas and there are several skeletons here, so there is
  // no unambiguous thing it could mean. Each candidate's atlas has to sit beside
  // its skeleton, which is what `build --out` leaves behind.
  if (flags.atlas !== undefined) {
    throw new UsageError(
      '--atlas names one atlas and a ballot has several candidates; each one\'s atlas has to sit beside its skeleton',
    );
  }

  const loaded = candidates.map((target) => loadBallotCandidate(target));
  const animation = commonAnimation(flags, loaded);

  const target = resolve(flags.out ?? DEFAULT_BALLOT);
  const out = existsSync(target) && statSync(target).isDirectory() ? join(target, DEFAULT_BALLOT) : target;

  const input: BallotInput = {
    candidates: loaded.map((l) => l.candidate),
    animation,
    version: readVersion(),
  };
  const { html, manifest } = buildBallot(input);

  console.log('rigc vote');
  console.log(`  ..    ballot    ${manifest.ballot}`);
  console.log(`  ..    animation ${animation === null ? '(none — the setup pose)' : animation}`);
  for (let i = 0; i < manifest.candidates.length; i++) {
    const entry = manifest.candidates[i];
    const bytes = loaded[i].candidate.pages.reduce((n, p) => n + p.bytes.length, 0);
    console.log(
      `  ..    ${entry.label}         ${entry.digest.slice(0, 'sha256:'.length + 12)}…  ` +
        `${entry.pages.length} page(s), ${(bytes / 1024).toFixed(1)} KiB  <- ${entry.source}`,
    );
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(
    `  ..    the page shows ${manifest.candidates.map((c) => c.label).join('/')} and nothing else — the paths above are ` +
      'in its manifest, never on the screen',
  );
  console.log(
    `  ..    embedded every candidate's skeleton, atlas and page(s) as data URIs; the player itself loads from ` +
      `unpkg (@${PLAYER_LINE}), so the first open needs a network`,
  );
  console.log(`rigc: wrote ${out}  (${(html.length / 1024).toFixed(1)} KiB — open it in a browser)`);
  console.log(
    `rigc: then record the saved vote with  rigc vote --record ${resultFilename(manifest.ballot)} --ballot ${out}`,
  );
}

/** vote (record mode) — check one saved vote and append it to the ledger. */
function cmdVoteRecord(flags: Record<string, string>): void {
  for (const key of ['candidate', 'out'] as const) {
    if (flags[key] !== undefined) {
      throw new UsageError(`--record and --${key} are the two halves of this command; run them one at a time`);
    }
  }
  const resultPath = resolve(flags.record);
  const ballotPath = resolve(flags.ballot ?? DEFAULT_BALLOT);
  const ledgerPath = resolve(flags.ledger ?? DEFAULT_LEDGER);
  for (const [what, path] of [
    ['result', resultPath],
    ['ballot', ballotPath],
  ] as const) {
    if (!existsSync(path)) {
      throw new UsageError(
        `no ${what} file at ${path}` + (what === 'ballot' ? ' — name the page this vote came from with --ballot' : ''),
      );
    }
  }

  console.log('rigc vote --record');
  console.log(`  ..    result ${resultPath}`);
  console.log(`  ..    ballot ${ballotPath}`);
  console.log(`  ..    ledger ${ledgerPath}`);

  const manifest = readBallotManifest(readFileSync(ballotPath, 'utf8'), ballotPath);
  const result = readJsonFile(resultPath);
  const existing = existsSync(ledgerPath) ? parseLedger(readFileSync(ledgerPath, 'utf8'), ledgerPath) : [];
  const attempts = existing.filter((l) => l.ballot === manifest.ballot).length;
  const again = flags.again !== undefined;

  const { refusals, line } = verifyResult(manifest, result, { attempts, again });
  if (line === null) {
    for (const refusal of refusals) console.error(`  FAIL  ${refusal.rule}: ${refusal.detail}`);
    console.error(`rigc: ${refusals.length} refusal(s) — nothing appended to ${ledgerPath}`);
    process.exit(1);
  }
  for (const rule of VOTE_RULES) console.log(`  PASS  ${rule}`);

  line.seq = existing.length + 1;
  mkdirSync(dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, ledgerLineText(line));
  console.log(
    `  ..    ${line.choice === TIE ? 'tie' : `winner ${line.choice} = ${line.winner}`}, ` +
      `reason code ${line.reasonCode}${line.attempt > 1 ? `, attempt ${line.attempt}` : ''}`,
  );
  console.log(
    `  ..    coverage ${line.coverage.length} candidate(s): ` +
      line.coverage.map((c) => `${c.label}=${c.digest.slice(0, 'sha256:'.length + 12)}…`).join(' '),
  );
  console.log(`rigc: appended line ${line.seq} to ${ledgerPath}`);
}

function cmdVote(flags: Record<string, string>, candidates: string[]): void {
  if (flags.record !== undefined) cmdVoteRecord(flags);
  else if (candidates.length > 0) cmdVoteBallot(flags, candidates);
  else {
    throw new UsageError(
      'vote takes either 2–4 --candidate <dir | skeleton.json> to write a ballot, or --record <result.json> to ' +
        'record one that came back',
    );
  }
}

/**
 * bench — run one rung of the benchmark ladder against a candidate rig.
 *
 * Two questions, asked in this order and never merged:
 *
 *   1. Is the candidate valid Spine at all? That is `validate --profile spine`,
 *      and it is the only part with a pass/fail. The profile is pinned here, not
 *      inherited from the CLI default: the thing being reproduced is an editor
 *      export, and holding it to this project's renderer policy would fail rungs
 *      for reasons the rung is not about.
 *   2. How close is it, structurally, to the reference? That is `diff`, and it
 *      has no threshold at all. There is no score to pass, on purpose — see
 *      `src/diff.ts`. A rung is called cleared by a human reading the measures,
 *      and `docs/LADDER.md` records that judgement.
 *
 * ⚠️ The candidate is validated against the SPINE profile and compared against
 * the reference; the reference is never validated here. It is editor output and
 * is the definition of correct for this exercise, so gating it would be gating
 * the yardstick with the ruler.
 */
function cmdBench(flags: Record<string, string>, positional: string[]): void {
  const rungId = positional[0];
  if (!rungId) throw new UsageError(`bench takes a rung: ${RUNG_IDS.join(' | ')}`);
  const rung = findRung(rungId);
  if (!rung) throw new UsageError(`unknown rung ${JSON.stringify(rungId)}; known: ${RUNG_IDS.join(', ')}`);
  if (flags.candidate === undefined) throw new UsageError('bench needs --candidate <dir | skeleton.json>');

  // bench judges a reproduction of editor output, so `spine` is PINNED here
  // rather than inherited. It reads the same as the CLI default today (#221) and
  // is kept as its own statement anyway: the ladder's stage-1 gate is defined by
  // `docs/GATE.md` as `validate --profile spine`, and a bench run must go on
  // meaning that whatever a later release decides the default should be.
  const profile: ValidateProfile = flags.profile === undefined ? 'spine' : readProfile(flags);
  const exportDir = resolve(import.meta.dir, 'examples', rung.example, 'export');
  if (!existsSync(exportDir)) {
    // `bun run fetch-examples` runs `scripts/fetch-examples.sh`, and `scripts/`
    // is not in package.json's `files` — an npm install has no such script to
    // run. Its presence is what tells the two contexts apart, so the remedy
    // named here is one that actually exists in whichever context this is.
    const remedy = existsSync(resolve(import.meta.dir, 'scripts', 'fetch-examples.sh'))
      ? 'run `bun run fetch-examples` first'
      : `bench needs a checkout of ${repositoryUrl()} — its \`fetch-examples\` script is not part of the installed package`;
    throw new UsageError(`no example corpus at ${exportDir} — ${remedy} (examples/ is gitignored, not shipped)`);
  }

  const { skeletonPath, atlasPath } = resolveArtifacts(flags.candidate, flags.atlas);
  const skeletonText = readFileSync(skeletonPath, 'utf8');
  const atlasText = readFileSync(atlasPath, 'utf8');

  console.log(`rigc bench rung ${rung.id} — ${rung.example}`);
  console.log(`  gates      ${rung.gates}`);
  console.log(`  candidate  ${skeletonPath}`);
  console.log(`  atlas      ${atlasPath}`);
  console.log('');

  console.log(`  ── validate (profile ${profile}) ──`);
  const report = validate({ skeletonText, atlasText, atlasDir: dirname(atlasPath), profile });
  for (const line of reportLines(report)) console.log(`  ${line}`);
  console.log('');

  const candidateJson: unknown = JSON.parse(skeletonText);
  const diffs: Array<{ skeleton: RungSkeleton; reference: string; report: DiffReport }> = [];
  for (const skeleton of rung.skeletons) {
    const referencePath = join(exportDir, skeleton.file);
    if (!existsSync(referencePath)) {
      console.error(`  MISSING  ${referencePath} — re-run \`bun run fetch-examples\``);
      continue;
    }
    const role = skeleton.role === 'stretch' ? ' (stretch — reported, does not count)' : '';
    console.log(`  ── diff vs ${rung.example}/${skeleton.label}${role} ──`);
    const diff = diffSkeletons(candidateJson, JSON.parse(readFileSync(referencePath, 'utf8')));
    for (const line of diffLines(diff, { candidate: skeletonPath, reference: referencePath })) console.log(`  ${line}`);
    console.log('');
    diffs.push({ skeleton, reference: referencePath, report: diff });
  }

  // Third, optional and third for a reason: is it the same MOTION? `diff`
  // compares structure, and a reversed easing is the same key count and the same
  // curve kind — so a row of this ladder carrying only `validate` and `diff`
  // records a rig that could be animated backwards. `--frames` folds `check`'s
  // table into the report so a future row carries both.
  let check: CheckReport | null = null;
  if (flags.frames !== undefined) {
    console.log(`  ── check vs frames ${resolve(flags.frames)} ──`);
    check = runCheck(flags.candidate, flags.atlas, flags.frames, flags);
    for (const line of checkLines(check, { allFrames: flags['all-frames'] !== undefined })) console.log(`  ${line}`);
    console.log('');
  }

  console.log('  ── summary ──');
  console.log(`  validate   ${report.failures.length === 0 ? 'green' : `${report.failures.length} FAILED`}  (profile ${profile})`);
  for (const d of diffs) {
    const means = d.report.sections.map((s) => `${s.name}=${s.ratio.toFixed(3)}`).join('  ');
    console.log(`  ${d.skeleton.label.padEnd(10)} ${means}${d.skeleton.role === 'stretch' ? '   [stretch]' : ''}`);
    // Second line, not folded into the first: the figures above are the ones
    // every bench.json on disk already carries, and a ladder record is worth
    // less the moment its headline stops meaning what the older ones meant.
    // The sections whose measures are dominated by name-keyed ones get their
    // name-agnostic figure printed beside — issue #21.
    const split = d.report.sections.filter((s) => s.nameAgnostic !== undefined);
    if (split.length > 0) console.log(`  ${''.padEnd(10)} ${split.map(sectionFigures).join('   ')}`);
  }
  if (check) {
    // The framing goes first because it is upstream of every MAE below it: a
    // summary that reported those numbers without saying how the two shots were
    // put on each other is how issue #34 stayed invisible for two ladder runs.
    const framing = check.framingFit;
    if (!framing && check.sharedFraming) {
      const f = check.sharedFraming.fit;
      console.log(
        `  framing    one per set (${check.animations.length}); one shared box leaves ` +
          `x${f.scale.toFixed(6)}, rms ${f.rms.toFixed(2)}px — see the check table above for each set's own`,
      );
    }
    if (framing) {
      const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
      const how = !framing.applied
        ? 'measured only — --viewport pinned'
        : framing.source === 'declared'
          ? `frames.json's own box, the candidate measured into it`
          : `fitted to the candidate's pixels, ${framing.passes} pass(es)${framing.settled ? '' : framing.cycled ? ', cycling' : ', unsettled'}`;
      // The MAE-refined offset belongs on this line rather than only in `check`'s
      // own table: it moved the box every figure below was measured in, so a row
      // that quoted the figures without it would not say what they were measured
      // against — issue #146's own version of the #34 lesson above.
      const r = framing.refinement;
      const refined =
        r === null || !r.applied
          ? ''
          : `  MAE-refined ${signed(r.dx)}, ${signed(r.dy)}px (${r.before.toFixed(2)} → ${r.after.toFixed(2)} ref)`;
      console.log(
        `  framing    fit x${framing.fit.scale.toFixed(6)}  rms ${framing.fit.rms.toFixed(2)}px  union residual ` +
          `${signed(framing.fit.residualWidth)} x ${signed(framing.fit.residualHeight)}px  (${how})${refined}`,
      );
    }
    for (const anim of check.animations) {
      const attributed = anim.compared - anim.framesWithoutDrift;
      const drift =
        anim.worstDriftFrame < 0
          ? 'no slot attributable in any of them'
          : `worst slot drift ${anim.worstDrift.toFixed(1)}px, attributed in ${attributed}`;
      // The per-frame change count is carried here and not only in `check`'s own
      // table because it is the one figure a flat MAE cannot imply: a shot can be
      // right at every frame and still hold or blink at the wrong moments.
      const change =
        anim.changeDisagreements === 0
          ? ''
          : `, ${anim.changeDisagreements}/${anim.changePairs} pair(s) change unlike the reference`;
      // Which of the candidate's own bone chains the error is in — one name, so a
      // loop between builds reads a unit to fix rather than a verdict on the shot.
      // The full table is in `check`'s own report; this is its headline.
      const worstChain = [...anim.chains].sort((a, b) => b.maeShare - a.maeShare)[0];
      const chain =
        worstChain === undefined ? '' : `, ${worstChain.chain} carries ${(worstChain.maeShare * 100).toFixed(0)}%`;
      // `ref=` is the same difference over the reference's own drawn pixels. It is
      // carried here and not only in `check`'s own table because this is the line a
      // loop reads between builds, and `mean=` has a denominator the candidate can
      // grow — see `FrameCheck.maeReference`.
      // ...and the contact sheet, when the set ships one: a row reading "over 2
      // frame(s)" for a 311-frame shot is the hole issue #36 closed, and the whole
      // -shot figure is the one that says the frames between the stills were seen.
      const sheet =
        anim.sheet === null
          ? ''
          : `, sheet ${anim.sheet.compared} tile(s) mean=${anim.sheet.meanMae.toFixed(2)} ` +
            `worst=${anim.sheet.worstMae.toFixed(2)}`;
      console.log(
        `  ${anim.dir.padEnd(10)} MAE mean=${anim.meanMae.toFixed(2)} worst=${anim.worstMae.toFixed(2)} ` +
          `ref=${anim.meanMaeReference.toFixed(2)}  over ${anim.compared} frame(s)  ${drift}${change}${chain}${sheet}`,
      );
    }
  } else {
    console.log('  check      not run — pass --frames <dir> to compare against the rendered reference frames.');
    console.log('             Without it this report says nothing about whether the ANIMATION is right.');
  }
  console.log('  Section figures are means of their own measures. There is no rung score:');
  console.log('  a rung is cleared by a person reading the measures, and docs/LADDER.md records it.');

  if (flags.json !== undefined) {
    // No `gates` field, deliberately. The rung's gate string names its features
    // and its per-skeleton counts, which `bench/runs/README.md` forbids a run
    // from reading — and this report is one of the six files the run protocol
    // requires committing, so a copy of it here would sit inside every future
    // run's directory, which is exactly where the next author looks for process
    // notes. `rung` identifies the rung and carries nothing (issue #137). The
    // console block above still prints the gate string: that is for the person
    // reading the run, not a file the protocol commits.
    writeJson(flags.json, {
      rung: rung.id,
      example: rung.example,
      profile,
      candidate: { skeleton: skeletonPath, atlas: atlasPath },
      validate: report,
      // `referencePath`, not `reference`: a DiffReport already has a
      // `reference` of its own (the raw counts), and the spread wins.
      diffs: diffs.map((d) => ({
        label: d.skeleton.label,
        role: d.skeleton.role,
        referencePath: d.reference,
        ...d.report,
      })),
      check,
    });
  }

  if (report.failures.length > 0) {
    console.error(`rigc: candidate is not valid Spine — ${report.failures.length} assertion(s) failed`);
    process.exit(1);
  }
}

function cmdExplain(flags: Record<string, string>): void {
  const { label, opts } = resolveCut(flags);
  console.log(`rigc explain ${label}`);
  // See the identical pair of lines in `cmdBuild` for why both paths are named
  // here rather than only the one the header's `label` happens to carry.
  console.log(`  ..    rig    ${opts.rigPath}`);
  console.log(`  ..    motion ${opts.motionPath}`);
  const result = compile(opts);
  const motion = readJsonFile(opts.motionPath) as MotionSpec;

  console.log(`\nstage  ${result.skeleton.skeleton.width} x ${result.skeleton.skeleton.height}  (spine ${result.skeleton.skeleton.spine})`);

  // The crop note describes where the numbers CAME from, and without a manifest
  // they came from the rig spec's own literals — there is no crop to be relative
  // to. Printing it anyway told a rung-3 author their bone positions were in a
  // coordinate system that did not exist in their rig.
  const frame = opts.manifestPath ? '  (crop y-down -> spine y-up, origin at the bottom-left of the crop)' : '  (spine world: y up)';
  console.log(`\nbones${frame}`);
  for (const b of result.skeleton.bones) {
    // `rotation` is the axis keystone and the grips' radial facing, so it earns
    // a column even though it is absent on most bones.
    const rot = b.rotation === undefined ? '' : `  rotation=${b.rotation}`;
    console.log(`  ${b.name.padEnd(12)} parent=${(b.parent ?? '-').padEnd(10)} x=${b.x ?? 0} y=${b.y ?? 0}${rot}`);
  }

  console.log('\nslots  (array order IS the draw order)');
  for (const s of result.skeleton.slots) {
    const atts = Object.keys(result.skeleton.skins[0].attachments[s.name] ?? {});
    console.log(
      `  ${s.name.padEnd(12)} bone=${s.bone.padEnd(12)} setup=${(s.attachment ?? 'null').padEnd(22)} color=${s.color ?? 'ffffffff'}  attachments=[${atts.join(', ')}]`,
    );
  }

  console.log('\nanimations');
  for (const [animName, anim] of Object.entries(result.skeleton.animations)) {
    const spec = motion.animations[animName];
    console.log(`  ${animName}  declared=${spec.duration}s loop=${spec.loop}`);
    for (const [boneName, timelines] of Object.entries(anim.bones ?? {})) {
      // "(mesh tier)" is a claim about what the bone DRIVES, and it was printed
      // on every bone track regardless — which reads, on a rig with no mesh in
      // it at all, as though the track were deforming one.
      const drives = result.meshBones.includes(boneName) ? '  <- drives a mesh' : '';
      for (const [timelineName, keys] of Object.entries(timelines)) {
        console.log(`    ${boneName}.${timelineName}  ${keys.length} key(s)${drives}`);
        for (const key of keys) {
          const fields = Object.entries(key)
            .filter(([k]) => k !== 'time' && k !== 'curve')
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(' ');
          const curve = Array.isArray(key.curve)
            ? `bezier[${key.curve.length}]`
            : key.curve === 'stepped'
              ? 'stepped'
              : 'linear';
          console.log(`      t=${String(key.time).padEnd(7)} ${fields.padEnd(30)} ${curve}`);
        }
      }
    }
    for (const [slotName, timelines] of Object.entries(anim.slots ?? {})) {
      for (const [timelineName, keys] of Object.entries(timelines)) {
        console.log(`    ${slotName}.${timelineName}  ${keys.length} key(s)`);
        for (const key of keys) {
          const curve = key.curve;
          const shape = Array.isArray(curve)
            ? `bezier[${curve.length}] ${curve.slice(12).join(', ')}  <- alpha channel, absolute (t,v)`
            : curve === 'stepped'
              ? 'stepped'
              : timelineName === 'attachment'
                ? 'stepped (attachment timelines always are)'
                : 'linear';
          const value = 'color' in key ? `#${String(key.color)}` : `attachment=${String(key.name)}`;
          console.log(`      t=${String(key.time).padEnd(7)} ${value.padEnd(30)} ${shape}`);
        }
      }
    }
    // The two constraint groups: one unnamed timeline per constraint, so the
    // name printed is the constraint's and there is no timeline name to print
    // beside it. Every field a key carries is shown, because each one is
    // optional in the file and the ABSENT ones are what a reader has to see —
    // an omitted `softness` is 0, not "unchanged".
    for (const group of ['ik', 'transform'] as const) {
      for (const [name, keys] of Object.entries(anim[group] ?? {})) {
        console.log(`    ${group}.${name}  ${keys.length} key(s)  <- one timeline per constraint`);
        for (const key of keys) {
          const fields = Object.entries(key)
            .filter(([k]) => k !== 'time' && k !== 'curve')
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(' ');
          const curve = Array.isArray(key.curve) ? `bezier[${key.curve.length}]` : key.curve === 'stepped' ? 'stepped' : 'linear';
          console.log(`      t=${String(key.time).padEnd(7)} ${(fields || '(all defaults)').padEnd(46)} ${curve}`);
        }
      }
    }
    // Deform timelines are keyed on a skin/slot/attachment triple, and the run
    // is printed as its span rather than its numbers: `offset` plus a length is
    // what tells a reader whether the key lands where they meant, and a hundred
    // vertex offsets on one line tells them nothing.
    for (const [skinName, slotMap] of Object.entries(anim.attachments ?? {})) {
      for (const [slotName, attMap] of Object.entries(slotMap)) {
        for (const [attName, timelines] of Object.entries(attMap)) {
          for (const [timelineName, keys] of Object.entries(timelines)) {
            console.log(`    ${skinName}/${slotName}/${attName}.${timelineName}  ${keys.length} key(s)`);
            for (const key of keys) {
              const run = Array.isArray(key.vertices) ? (key.vertices as number[]) : null;
              const offset = typeof key.offset === 'number' ? key.offset : 0;
              const span = run
                ? `deform[${offset}..${offset + run.length}]  ${run.length / 2} pair(s)`
                : 'back to the setup pose';
              const curve = Array.isArray(key.curve) ? `bezier[${key.curve.length}]` : key.curve === 'stepped' ? 'stepped' : 'linear';
              console.log(`      t=${String(key.time).padEnd(7)} ${span.padEnd(46)} ${curve}`);
            }
          }
        }
      }
    }
    // The draw-order timeline names no target, so it hangs off the animation
    // rather than off a slot — and a timeline `explain` did not print would be a
    // timeline nobody could check without reading the emitted JSON.
    if (anim.drawOrder) {
      console.log(`    drawOrder  ${anim.drawOrder.length} key(s)  <- whole animation, offsets against the SETUP order`);
      for (const key of anim.drawOrder) {
        const offsets = Array.isArray(key.offsets)
          ? (key.offsets as Array<{ slot: string; offset: number }>)
              .map((o) => `${o.slot}${o.offset >= 0 ? '+' : ''}${o.offset}`)
              .join(' ')
          : 'back to the setup order';
        console.log(`      t=${String(key.time).padEnd(7)} ${offsets}`);
      }
    }
  }

  if (result.physics.length) {
    console.log('\nphysics constraints (4.3 top-level `constraints` array, type per entry)');
    for (const ph of result.physics) {
      console.log(`  ${ph.name.padEnd(12)} bone=${ph.bone.padEnd(14)} components=[${ph.components.join(', ')}] mix=${ph.mix} drivesMesh=${ph.drivesMesh}`);
    }
  }

  if (result.meshes.length) {
    console.log('\nmeshes  (ring tier: rim ring pinned on the window edge, seam ring pinned on the mask contour)');
    for (const m of result.meshes) {
      console.log(
        `  ${m.slot.padEnd(12)} ${m.kind.padEnd(6)} ${m.vertices} vertices / ${m.triangles} triangles  bones=[${m.bones.join(', ')}]`,
      );
    }
  }

  if (result.droppedStates.length) {
    console.log('\ndropped states (listed in the manifest, no PNG on disk)');
    for (const d of result.droppedStates) console.log(`  ${d.slot}/${d.state}  ${d.path}`);
  }

  console.log('\nmix table (player config, not skeleton JSON)');
  console.log(`  default=${motion.mix?.default ?? 0} pairs=${JSON.stringify(motion.mix?.pairs ?? [])}`);
}

// ---------------------------------------------------------------------------
// usage / per-command help
// ---------------------------------------------------------------------------

/**
 * One meaning per flag name, shared by every command that takes it — the
 * single place this project states what a flag means. AUTHORING.md §0 quotes
 * this table for `build`'s `--rig`/`--motion`/`--out`/`--images`/`--manifest`/
 * `--profile`; if the two ever disagree, this is the one the code runs.
 */
const FLAG_MEANINGS: Record<string, string> = {
  rig: 'the rig spec — skeleton structure',
  motion: 'the motion spec — time',
  out: 'directory for skeleton.json + skeleton.atlas; atlas page paths are written relative to it',
  images: "override the rig spec's own images directory (relative to your working directory)",
  manifest: 'a cut manifest, for a rig with measured art behind it; a foreign skeleton has none',
  'copy-images':
    'also copy every referenced page PNG into --out and rewrite the atlas to the copies, so the directory is ' +
    'self-contained enough to zip or commit on its own (default: page paths still point at the source art)',
  cut: 'look up a named cut in --cuts <cuts.json>, instead of --rig/--motion/--out',
  cuts: 'the cuts.json --cut names',
  profile:
    'which rulebook to check against (default: spine) — spine = valid Spine 4.3 that any runtime plays ' +
    "correctly; spine-html = also this project's renderer/archetype policy",
  atlas: "the candidate's atlas, when it is not beside the skeleton",
  candidate: 'a compiled skeleton: a directory holding skeleton.json + skeleton.atlas, or a skeleton.json path',
  frames: 'a rendered reference frame set (a skeleton root, or one animation directory)',
  fps: 'frame rate, only for a frame set with no frames.json sidecar',
  viewport: "pin the candidate's world box, y up, instead of fitting it",
  framing: 'fit each frame set on its own (default) or once across all of them',
  as: 'the candidate animation to play, when it is named differently from the frame set',
  'all-frames': 'print every frame, not just the worst by MAE',
  json: 'also write the whole report to this path',
  frame: 'one pose frame — a picture of the pose to read the part placements out of',
  scale: `the scale window to search, as frame pixels per part pixel (default \`${DEFAULT_SCALE_MIN},${DEFAULT_SCALE_MAX}\`)`,
  rotation: 'the rotation window to search, in screen degrees (default `-180,180`, a full turn)',
  'max-residual':
    `above this residual a placement is refused by name instead of reported flat (default ${DEFAULT_MAX_RESIDUAL}); ` +
    'it is a reporting threshold, not a pass bar',
  animation: 'which animation to show; the default is every one for `render` and the first for `preview`',
  max: 'longest side of a rendered frame, in pixels (default 256)',
  record: 'a saved vote to check against its ballot and append to the ledger, instead of writing a ballot',
  ballot: `the ballot the --record'd vote answers (default \`${DEFAULT_BALLOT}\`); its embedded manifest is what the vote is checked against`,
  ledger: `the append-only JSONL the vote lands in (default \`${DEFAULT_LEDGER}\`)`,
  again: 'record a second vote on a ballot the ledger already has; without it, a repeat is refused rather than doubled',
  help: "show this command's flags and exit",
};

/** The `<value>` a flag takes, for its column in a command's flag table. Absent for a boolean switch. */
const FLAG_VALUES: Record<string, string> = {
  rig: '<path>',
  motion: '<path>',
  out: '<dir>',
  images: '<dir>',
  manifest: '<path>',
  cut: '<name>',
  cuts: '<path>',
  profile: 'spine|spine-html',
  atlas: '<path>',
  candidate: '<dir|skeleton.json>',
  frames: '<dir>',
  fps: '<n>',
  viewport: '<x,y,w,h>',
  framing: 'per-shot|shared',
  as: '<name>',
  json: '<out>',
  frame: '<path>',
  scale: '<min,max>',
  rotation: '<min,max>',
  'max-residual': '<0..1>',
  animation: '<name>',
  max: '<px>',
  record: '<result.json>',
  ballot: '<ballot.html>',
  ledger: '<votes.jsonl>',
};

interface CommandDoc {
  name: string;
  /** One or more invocation forms, each already spelling the command name. */
  usage: string[];
  /** Flag names (into FLAG_MEANINGS/FLAG_VALUES), in display order. `--help` is appended automatically. */
  flags: string[];
  /**
   * Per-command wording for a flag whose value or meaning genuinely differs here.
   *
   * ⚠️ The default above it — one meaning per flag name, everywhere — is the rule
   * and this is the named exception to it, not a second table. Three flags earn it:
   * `--out` is a directory of artifacts to `build`, a directory of pictures to
   * `render` and one file to `preview` and `vote`; `--fps` is the rate a frame set
   * was RECORDED at to `check`, which reads it off a sidecar, and the rate to
   * SAMPLE at to `render`, which is choosing it; `--candidate` is one artifact
   * everywhere except `vote`, which is the one command that takes several and is
   * the reason there is a ballot at all. Writing any of them as one sentence
   * covering every command would leave every command's own help less true.
   */
  overrides?: Record<string, { value?: string; meaning?: string }>;
}

const COMMANDS: CommandDoc[] = [
  {
    name: 'build',
    usage: [
      'rigc build --rig <path> --motion <path> --out <dir> [--manifest <path>] [--images <dir>] [--profile spine|spine-html] [--copy-images]',
      'rigc build --cut <name> --cuts <cuts.json>',
    ],
    flags: ['rig', 'motion', 'out', 'manifest', 'images', 'copy-images', 'cut', 'cuts', 'profile'],
  },
  {
    name: 'explain',
    usage: ['rigc explain  (same arguments as build, minus --profile — it never gates)'],
    flags: ['rig', 'motion', 'out', 'manifest', 'images', 'cut', 'cuts'],
  },
  {
    name: 'validate',
    usage: [
      'rigc validate <dir | skeleton.json> [--atlas <path>] [--profile spine|spine-html]',
      'rigc validate --cut <name> --cuts <cuts.json>   (also re-derives declared durations)',
    ],
    flags: ['atlas', 'profile', 'cut', 'cuts', 'rig', 'motion', 'out', 'manifest', 'images'],
  },
  {
    name: 'diff',
    usage: ['rigc diff <candidate.json> <reference.json> [--json <out>]'],
    flags: ['json'],
  },
  {
    name: 'check',
    usage: ['rigc check --candidate <dir | skeleton.json> --frames <dir> [flags]'],
    flags: ['candidate', 'frames', 'atlas', 'fps', 'viewport', 'framing', 'as', 'all-frames', 'json'],
  },
  {
    name: 'bench',
    usage: [`rigc bench <${RUNG_IDS.join(' | ')}> --candidate <dir | skeleton.json> [--frames <dir>] [flags]`],
    flags: ['candidate', 'atlas', 'frames', 'profile', 'all-frames', 'json'],
  },
  {
    name: 'render',
    usage: [
      'rigc render --candidate <dir | skeleton.json> [--animation <name>] [--fps 12] [--max 256] [--out render/]',
    ],
    flags: ['candidate', 'atlas', 'animation', 'fps', 'max', 'out'],
    overrides: {
      out: { value: '<dir>', meaning: 'directory to write the frame series into (default `render/`)' },
      fps: { meaning: `frames per second to sample the animation at (default ${PROTOCOL_FPS})` },
    },
  },
  {
    name: 'preview',
    usage: ['rigc preview --candidate <dir | skeleton.json> [--animation <name>] [--out preview.html]'],
    flags: ['candidate', 'atlas', 'animation', 'out'],
    overrides: {
      out: {
        value: '<file>',
        meaning: 'the .html file to write (default `preview.html`); a directory means "the default name in here"',
      },
    },
  },
  {
    name: 'pose',
    usage: [
      `rigc pose --images <dir> --frame <path> [--scale ${DEFAULT_SCALE_MIN},${DEFAULT_SCALE_MAX}] [--rotation -180,180] [--out ${DEFAULT_POSE_OUT}]`,
    ],
    flags: ['images', 'frame', 'scale', 'rotation', 'max-residual', 'out'],
    overrides: {
      images: { value: '<dir>', meaning: 'the loose part PNGs to place; every `.png` in it is a part, in name order' },
      out: {
        value: '<file>',
        meaning: `the .json report to write (default \`${DEFAULT_POSE_OUT}\`); a directory means "the default name in here"`,
      },
    },
  },
  {
    name: 'vote',
    usage: [
      `rigc vote --candidate <dir | skeleton.json> --candidate <…> [--candidate …] [--animation <name>] [--out ${DEFAULT_BALLOT}]`,
      `rigc vote --record <result.json> [--ballot ${DEFAULT_BALLOT}] [--ledger ${DEFAULT_LEDGER}] [--again]`,
    ],
    flags: ['candidate', 'animation', 'out', 'record', 'ballot', 'ledger', 'again'],
    overrides: {
      candidate: {
        value: '<dir|skeleton.json>',
        meaning: `repeat it ${MIN_CANDIDATES}–${MAX_CANDIDATES} times — one compiled artifact per pane, labelled A, B, C, D in the order given`,
      },
      animation: {
        meaning:
          'the one animation every pane plays (default: the first of candidate A). A candidate that does not have ' +
          'it is refused — two panes playing two animations is not a comparison',
      },
      out: {
        value: '<file>',
        meaning: `the .html ballot to write (default \`${DEFAULT_BALLOT}\`); a directory means "the default name in here"`,
      },
    },
  },
];

const KNOWN_COMMANDS = COMMANDS.map((c) => c.name);

/** `rigc <command> --help`: that command's own usage line(s) and flag table. */
function commandHelp(name: string): string {
  const doc = COMMANDS.find((c) => c.name === name);
  if (!doc) throw new Error(`internal: no help text for command "${name}"`);
  const keys = [...doc.flags, 'help'];
  const value = (key: string): string | undefined => doc.overrides?.[key]?.value ?? FLAG_VALUES[key];
  const meaning = (key: string): string => doc.overrides?.[key]?.meaning ?? FLAG_MEANINGS[key];
  const labels = keys.map((key) => `--${key}${value(key) ? ` ${value(key)}` : ''}`);
  const width = Math.max(...labels.map((l) => l.length)) + 2;
  return ['usage:', ...doc.usage.map((u) => `  ${u}`), '', 'flags:', ...keys.map((key, i) => `  ${labels[i].padEnd(width)}${meaning(key)}`)].join(
    '\n',
  );
}

const USAGE = [
  'rigc — the rig compiler',
  '',
  '(from a source checkout: `bun cli.ts <command>` is the same as `rigc <command>`)',
  '',
  'usage:',
  ...COMMANDS.flatMap((c) => c.usage.map((u) => `  ${u}`)),
  '',
  '  rigc <command> --help    that command\'s own flag table',
  '  rigc --version           print the installed version (-v works too)',
  '',
  'build, validate and bench take --profile spine|spine-html:',
  '  spine       is this valid Spine 4.3 that any runtime plays correctly?',
  '              THE DEFAULT — 20 rules, and the question the output answers when',
  '              you import it into the Spine editor.',
  '  spine-html  the above, plus this project\'s renderer and archetype policy:',
  '              all 36 rules, opt-in. Those extra 14 fire on real, correct,',
  '              editor-produced Spine data, so they are somebody\'s policy rather',
  '              than anybody\'s validity.',
  '',
  'Every report names the profile that judged it and lists, on PROF lines, the',
  'rules that profile left out.',
  '',
  'check renders the candidate onto the reference frames\' own pixel grid, fitting it',
  'there by its own drawn pixels, and compares. It reads the frames and never the',
  'reference skeleton, so it belongs INSIDE an authoring loop — the validator cannot',
  'see a wrong animation and this can. See `rigc check --help` for its flags.',
  '',
  'render and preview are how you LOOK at a build, and they need no reference at all:',
  '  rigc render  --candidate <the dir build --out wrote>    PNG frames + a contact sheet',
  '  rigc preview --candidate <the same dir>                 one .html file that plays it',
  'A rig with its head off its torso passes the gate and steps cleanly — the offsets',
  'are the ones you asked for — so looking is the only thing that catches it. render',
  'draws with rigc\'s own rasteriser; preview embeds the artifact in a page that plays',
  'it in the official Spine Web Player, which is also the interop proof.',
  '',
  'pose runs the other way round from everything above: it reads a picture you already',
  'have — one key pose — and reports where each loose part PNG sits in it (x, y, rotation,',
  'scale) so an agent can state those poses in a spec by construction:',
  '  rigc pose --images parts/ --frame poseA.png       pose.json, one entry per part',
  'It grades nothing and no pass bar attaches to its numbers. The residual is a trust',
  'signal, and where two placements are equally good it reports BOTH rather than picking —',
  'two identical limbs look exactly like that. A part that matches nowhere, a part the',
  'canvas cannot contain and a part whose rotation is a free degree of freedom are each',
  'named as such. See `rigc pose --help`.',
  '',
  'vote is the same page with two to four builds in it and an answer coming back:',
  '  rigc vote --candidate <build A> --candidate <build B>   ballot.html, panes labelled A and B',
  '  rigc vote --record vote-<id>.json --ballot ballot.html  check it, append it to votes.jsonl',
  'Reach for it where the instruments have run out — a choice with no reference behind',
  'it, two fits that measure the same. The panes carry no paths, a tie is a recorded',
  'answer rather than a missing one, and a result whose hashes are not the ballot\'s is',
  'refused by name instead of appended.',
  '',
  'a cuts.json is { "<name>": { "rig": "...", "motion": "...", "out": "...",',
  '                             "manifest": "..." (optional) } }, with every path',
  'resolved relative to the cuts.json file itself.',
].join('\n');

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === undefined) {
    console.error(USAGE);
    process.exit(2);
  }
  if (command === '--version' || command === '-v') {
    console.log(readVersion());
    process.exit(0);
  }
  if (command === '--help' || command === '-h') {
    console.log(USAGE);
    process.exit(0);
  }
  if (!KNOWN_COMMANDS.includes(command)) {
    throw new UsageError(`unknown command: ${command}`);
  }

  const { flags, lists, positional } = parseArgs(rest, REPEATABLE_FLAGS[command]);
  if (flags.help !== undefined) {
    console.log(commandHelp(command));
    process.exit(0);
  }
  if (command === 'build') cmdBuild(flags);
  else if (command === 'validate') cmdValidate(flags, positional);
  else if (command === 'explain') cmdExplain(flags);
  else if (command === 'diff') cmdDiff(flags, positional);
  else if (command === 'check') cmdCheck(flags);
  else if (command === 'bench') cmdBench(flags, positional);
  else if (command === 'render') cmdRender(flags);
  else if (command === 'preview') cmdPreview(flags);
  else if (command === 'pose') cmdPose(flags);
  else if (command === 'vote') cmdVote(flags, lists.candidate ?? []);
} catch (err) {
  if (err instanceof UsageError) {
    console.error(`rigc: ${err.message}\n\n${USAGE}`);
    process.exit(2);
  }
  // A ballot refuses on its arguments, like a usage error, but its messages are
  // long enough that reprinting the whole usage under them buries the reason.
  if (err instanceof BallotError) {
    console.error(`rigc vote: ${err.message}`);
    process.exit(2);
  }
  if (err instanceof CompileError) {
    console.error(`rigc compile error: ${err.message}`);
    process.exit(1);
  }
  if (err instanceof CheckError) {
    console.error(`rigc check error: ${err.message}`);
    process.exit(1);
  }
  // Like a usage error in kind — a missing directory, an unreadable frame — but
  // its messages name a path and a reason, and reprinting the whole usage under
  // them buries that.
  if (err instanceof PoseError) {
    console.error(`rigc pose: ${err.message}`);
    process.exit(2);
  }
  throw err;
}
