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
import {
  boneDistance,
  BONEDIST_SPEC,
  boneDistLines,
  BoneDistError,
  IDENTITY_CORRESPONDENCE,
  type BoneDistReport,
} from './src/bonedist.ts';
import { checkAgainstFrames, checkLines, CheckError, type CheckOptions, type CheckReport } from './src/check.ts';
import { compile, CompileError, type CompileOptions } from './src/compile.ts';
import {
  skeletonDataFromText,
  surveyDeformKeys,
  type DeformExtreme,
  type DeformKeyMeasure,
  type DeformSpan,
} from './src/deformmeasure.ts';
import { diffLines, diffSkeletons, reportedFigures, sectionFigures, type DiffReport } from './src/diff.ts';
import { copyAtlasImages } from './src/emit.ts';
import { DEFAULT_PADDING, DEFAULT_PAGE_SIZE, packAtlas } from './src/atlas.ts';
import { parseJsonWithPosition } from './src/json-position.ts';
import { KEY_TIME_EPSILON } from './src/timelines.ts';
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
import {
  ANCHOR_MAX_RESIDUAL,
  ANCHOR_MAX_UNEXPLAINED,
  chainFitLines,
  ChainFitError,
  DEFAULT_HINGE_MAX,
  DEFAULT_HINGE_MIN,
  DEFAULT_MIN_LEVER_PX,
  DEFAULT_MIN_VISIBLE,
  DEFAULT_PASSES,
  estimateChainFit,
  type ChainFitOptions,
} from './src/chainfit.ts';
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
import {
  assertionCountForProfile,
  CLI_DEFAULT_PROFILE,
  reportLines,
  validate,
  VALIDATE_PROFILES,
  type ValidateProfile,
} from './src/validate.ts';
import { parseMotionSpec } from './src/motion.ts';
import { depthStepLevels, type FoldLimit, type TurnCeiling } from './src/depth.ts';
import type { CompileResult } from './src/types.ts';

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
 *
 * ⚠️ This set and `FLAG_VALUES` are two halves of one statement, and they are
 * the halves a reader and the parser read separately: a flag absent from
 * `FLAG_VALUES` is printed bare in every usage line and flag table, and a flag
 * present here is the only kind the parser will accept bare. `all-bones` was in
 * one half and not the other for two releases — documented bare in `bonedist`'s
 * usage line, in the shared flag table, and in the hint `src/bonedist.ts` prints
 * under a truncated bone table, while the parser fell through to the value
 * branch and answered the caller who followed that hint with `rigc: --all-bones
 * needs a value` (issue #328). `CLI10`/`CLI11` in `selftest.ts` now hold the two
 * halves together by reading `--help` rather than by naming a flag.
 */
const BOOLEAN_FLAGS = new Set(['all-frames', 'all-bones', 'help', 'copy-images', 'again', 'pack']);

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
    if (flags['atlas-in'] !== undefined) opts.atlasInPath = resolve(flags['atlas-in']);
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
  const opts = entryToOptions(dir, flags.cut, entry);
  // `--atlas-in` is not part of the cuts table: a cut names its rig, motion and
  // manifest, and where the pixels are delivered from is a property of the BUILD.
  // Resolved against the working directory, like every other path on the command
  // line, rather than against the table's directory.
  if (flags['atlas-in'] !== undefined) opts.atlasInPath = resolve(flags['atlas-in']);
  return { label: flags.cut, opts };
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

/**
 * An atlas text to gate INSTEAD of the compile's own, with the second, independent
 * emit A18 compares it against.
 *
 * `--pack` is the only caller. A packed build is gated twice on purpose — once as
 * compiled (which is the gate that reads the loose PNGs, so `A06`'s size-vs-file
 * clause still measures the art R5 measures) and once as packed (which is the pair
 * that actually ships). Handing the second pass its texts rather than re-deriving
 * them here keeps `runGate` ignorant of what a pack is.
 */
interface AtlasOverride {
  text: string;
  again: string;
}

function runGate(
  result: CompileResult,
  opts: CompileOptions,
  profile: ValidateProfile,
  atlas?: AtlasOverride,
): number {
  // The determinism check compares a second, independent compile.
  const again = compile(opts);
  const report = validate({
    skeletonText: result.skeletonText,
    atlasText: atlas ? atlas.text : result.atlasText,
    atlasDir: opts.outDir,
    declaredDurations: result.declaredDurations,
    reEmit: { skeletonText: again.skeletonText, atlasText: atlas ? atlas.again : again.atlasText },
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

/**
 * One line per mesh kind on this cut, printed above the table.
 *
 * A legend rather than a heading: the heading used to describe the ring tier
 * unconditionally, so a build whose only mesh was a ribbon or a contour got a
 * sentence about a rim ring and a seam it does not have.
 */
/**
 * What a depth map and a soft region put on a mesh, when it named either.
 *
 * The digests are the reason this prints at all: a claim about a rig can name
 * WHICH sheet produced it, and two runs a reader believes differ can be shown to
 * have read the same pixels. The ranges and counts are what say the input
 * reached the geometry rather than merely being resolved — a `carried 0` never
 * gets here (it is refused) and a `ramped 0` is a hard-edged mask, which is
 * legal and usually not what somebody meant.
 */
/**
 * One axis's two ceilings, as `+31.41 / -18.03`, or what is unbounded on it.
 *
 * ⚠️ `none` and a number are different claims and are printed differently. A
 * sheet with no gradient along an axis cannot fold anything on it AT ANY ANGLE,
 * which is a fact about the sheet worth reading; printing `90` for it would be
 * a limit nothing measured.
 */
function ceilingPair(axis: { positive: FoldLimit | null; negative: FoldLimit | null }): string {
  const one = (l: FoldLimit | null, sign: string) => (l === null ? `${sign}none` : `${sign}${l.degrees.toFixed(2)}°`);
  return `${one(axis.positive, '+')} / ${one(axis.negative, '-')}`;
}

/**
 * The same axis's two 1st percentiles, each with its ratio to the ceiling above
 * it and the population it came out of — `+64.80° x1.003 of 5988`.
 *
 * ⭐ The ratio is the whole point and it is printed rather than judged. A
 * ceiling set by the FORM is the floor of a band: the steepest region of a
 * smooth sheet has area, so the 1st percentile sits a fraction of a percent
 * above the minimum. A ceiling set by one bad texel has 99 % of the mesh
 * surviving to the form's angle while the reported number collapses — 64.58°
 * against 6.08° for one texel of 160,000, with the percentile unmoved at 64.80°
 * in both ([#412](https://github.com/firejune/rigc/issues/412),
 * `bench/studies/2026-09-05-noise` §6).
 *
 * Three spellings, three different claims, for the reason `ceilingPair` prints
 * `none` rather than 90: `+none` is a side nothing folds on at all, `+unranked
 * of 36` is a side whose population is too small for a first percentile to be
 * anything but the minimum itself, and a number is a measurement.
 *
 * ⛔ No threshold lives here. What ratio means what is in `docs/AUTHORING.md`
 * §3.4, because a number rigc printed an adjective beside would be a policy the
 * compiler invented out of a measurement — and `A39` would go on refusing at the
 * raw angle either way.
 */
function spreadPair(axis: { positive: FoldLimit | null; negative: FoldLimit | null }): string {
  const one = (l: FoldLimit | null, sign: string) =>
    l === null
      ? `${sign}none`
      : l.p1 === null
        ? `${sign}unranked of ${l.count}`
        : `${sign}${l.p1.toFixed(2)}° x${(l.p1 / l.degrees).toFixed(3)} of ${l.count}`;
  return `${one(axis.positive, '+')} / ${one(axis.negative, '-')}`;
}

/** The tightest of the four, so the line that names a triangle names the right one. */
function tightestFold(c: TurnCeiling): { kind: string; sign: string; limit: FoldLimit } | null {
  const all = [
    { kind: 'yaw', sign: '+', limit: c.yaw.positive },
    { kind: 'yaw', sign: '-', limit: c.yaw.negative },
    { kind: 'pitch', sign: '+', limit: c.pitch.positive },
    { kind: 'pitch', sign: '-', limit: c.pitch.negative },
  ].filter((e): e is { kind: string; sign: string; limit: FoldLimit } => e.limit !== null);
  if (all.length === 0) return null;
  return all.reduce((best, e) => (e.limit.degrees < best.limit.degrees ? e : best));
}

function meshDepthNote(m: CompileResult['meshes'][number]): string {
  const parts: string[] = [];
  if (m.depth) {
    parts.push(
      `depth "${m.depth.image}" ${m.depth.digest} near=${m.depth.near} zScale=${m.depth.zScale} ` +
        `z=[${m.depth.range[0]}, ${m.depth.range[1]}]`,
    );
    const c = m.depth.ceiling;
    parts.push(`turn ceiling  yaw ${ceilingPair(c.yaw)}   pitch ${ceilingPair(c.pitch)}`);
    const worst = tightestFold(c);
    if (worst !== null) {
      parts.push(`  1st pct     yaw ${spreadPair(c.yaw)}   pitch ${spreadPair(c.pitch)}`);
    }
    parts.push(
      worst === null
        ? `              nothing in this sheet folds: ${c.measured} triangle(s) measured, none with a depth gradient across it`
        : `              first to fold: ${worst.kind} ${worst.sign} at ${worst.limit.degrees.toFixed(2)}°, ` +
          `triangle ${worst.limit.triangle} [${worst.limit.ids.join(',')}], the sheet steps ` +
          `${depthStepLevels(worst.limit.depthStep, m.depth.zScale).toFixed(2)} level(s) across it` +
          `${c.degenerate ? `; ${c.degenerate} triangle(s) too flat in setup to measure` : ''}`,
    );
  }
  if (m.soft) {
    parts.push(
      `soft "${m.soft.mask}" ${m.soft.digest} -> ${m.soft.bone}, ${m.soft.carried} carried / ${m.soft.ramped} in the falloff`,
    );
  }
  return parts.length === 0 ? '' : `\n        ${parts.join('\n        ')}`;
}

const MESH_KIND_NOTES: Record<CompileResult['meshes'][number]['kind'], string> = {
  ring: 'ring      rim ring pinned on the window edge, seam ring pinned on the mask contour, aperture moves',
  ribbon: 'ribbon    entry row pinned, rows share their weights so the strip lengthens without widening',
  contour: 'contour   the art\'s own silhouette, every vertex pinned to the slot bone (geometry, not a deformation)',
  grid: 'grid      a lattice over the part window at stated column and row positions, every vertex pinned to the slot bone',
  authored: 'authored  geometry rigc did not build; it assumes nothing about the topology',
};

/**
 * What a mesh measured about its own fit against the art it names, or nothing
 * for a mesh with no art to measure against.
 *
 * Printed for authored geometry as well as for a `contour` (issue #277): the
 * figure is a measurement between the emitted triangles and the PNG, so it means
 * the same thing whoever drew the vertices, and the silence was the defect —
 * an octagon rim placed on a round part's silhouette clips its own ink outline
 * at 94.31% and used to print nothing at all.
 *
 * The hole is appended only when there is one, so the common line is unchanged.
 * It is the one figure in the report that a hole moves: `coverage` and
 * `overshoot` are both measured against the FILLED silhouette, so spanning an
 * interior hole is neither missing coverage nor reaching past anything, and an
 * unintentional hole — a gap in the art, a stroke that failed to join — bought
 * fill over transparent pixels with nothing anywhere saying so (issue #275).
 */
function meshFit(m: CompileResult['meshes'][number]): string {
  if (m.coverage === undefined) return '';
  const hole = m.holePixels ? `, enclosing ${m.holePixels}px of hole` : '';
  return `  covers ${(m.coverage * 100).toFixed(2)}% of the art, reaching ${m.overshoot?.toFixed(2) ?? '?'}px past it${hole}`;
}

/**
 * The triangle budget a `MESH` line is read against: the rig's, or nothing.
 *
 * 📐 It used to be the literal `80`, which was nobody's budget — the rig quoted
 * in issue #275 declared 64, `A13_MESH_BUDGET` measured against that 64
 * correctly, and the line an author actually reads printed 80. Under the default
 * `--profile spine` `A13` is `PROF`, so the printed number is the only budget
 * figure in the output and it has to be the declared one. A rig that declares
 * none says so in the same words `A13` SKIPs in, rather than being given a wall.
 */
function meshBudget(rig: CompileResult['rig']): string {
  return rig.meshTriangleBudget === null ? '(no budget declared)' : `(budget ${rig.meshTriangleBudget})`;
}

/**
 * One extreme, as `x0.637306 tri 0`, or an em dash when no triangle on the key
 * could carry the quantity.
 *
 * A dash rather than `x1.000000`: a key over a mesh whose every triangle is a
 * hair has no ratio and no map, and printing the identity there would report a
 * measurement that was never taken — this repository's favourite false green.
 */
function deformExtreme(extreme: DeformExtreme | null): string {
  return extreme === null ? '—'.padEnd(9) : `x${extreme.value.toFixed(6)} tri ${extreme.triangle}`;
}

/**
 * The `MEMBER` report block — a group track's per-member values, side by side
 * (issue #295).
 *
 * ## Why side by side is the whole point
 *
 * The complaint that filed #295 was not the line count. `gallery/portrait`'s
 * held yaw put six sibling bones' `translatex` in six separate tracks, and the
 * reason that is bad is that **nobody can see a wrong sign in a column that is
 * eighty lines from its neighbours.** FACE §3 makes the same argument from the
 * other side: a residual is 1–6 units where a total is 30–40, and the split is
 * *an auditing decision before it is a rigging one*. So the report's job is to
 * put the numbers in the arrangement the audit needs — one row per member, one
 * block per key — which is exactly the arrangement the emitted format cannot
 * have, because Spine keys one bone per timeline.
 *
 * ## It quotes; it does not re-derive
 *
 * The same rule as the `DEFORM` block. Every value here is the one the compiler
 * **emitted**, carried on `result.trackDerivations`, so the block and the
 * artifact cannot disagree. `derived` and `formula` are the model's own strings
 * from `src/trackgen.ts`, so the block names the closed form the spec stated
 * rather than a second reading of it.
 *
 * ## What it deliberately does not print
 *
 * **Tracks whose members all share one value** — the ordinary `groups` entry.
 * There is one number there and the timelines above already show it on every
 * member; a table of six identical rows would be a tautology, and the block
 * exists to make a *difference* visible. `look_l`/`look_r` in the worked example
 * are exactly that case and they are right to be absent from here.
 *
 * **`stagger`.** A per-member time offset is printed as it always was — on each
 * member's own timeline, where the shifted key times are. Repeating it here
 * would put one lag in two places.
 */
function memberReportLines(result: CompileResult): string[] {
  if (result.trackDerivations.length === 0) return [];
  const out: string[] = [
    '',
    'group members  (the per-member values of one track, side by side — issue #295)',
    '  ..    a row per member and a block per key, because a wrong sign is visible in a column of six and',
    '  ..    invisible in six tracks. Values are the EMITTED ones, so this and the artifact cannot disagree',
    '  ..    a group whose members all share one value is not here: there is one number and the timelines',
    '  ..    above already carry it. `stagger` is not here either — the shifted key times are on those timelines',
  ];
  for (const entry of result.trackDerivations) {
    const states =
      entry.model === null
        ? 'stated per member'
        : `derive ${entry.model.kind}  ${entry.model.stated}  -> ${entry.model.projection === 'shift' ? 'the displacement' : 'the narrowing'}`;
    out.push(
      `  MEMBER  ${entry.animation}  ${entry.targetKind} "${entry.target}".${entry.property}  ` +
        `t=${entry.time.toFixed(6)}  ${entry.members.length} member(s)  ${states}`,
    );
    if (entry.model !== null) {
      out.push(`          ${entry.model.formula}`);
      for (const line of entry.model.derived) out.push(`            ${line}`);
    }
    const width = Math.max(6, ...entry.members.map((m) => m.member.length));
    for (let i = 0; i < entry.members.length; i++) {
      const m = entry.members[i];
      const value = Array.isArray(m.value) ? m.value.join(', ') : JSON.stringify(m.value);
      // The model's own row carries the two inputs that produced the value — the
      // coordinate it read off the rig and the depth the spec stated — because
      // "5.513" alone is a number a reader can only take on trust, and `−62` and
      // `150` beside it are a claim they can check.
      const from = entry.model === null ? '' : `  <- ${entry.model.members[i].at >= 0 ? ' ' : ''}${entry.model.members[i].at} at depth ${entry.model.members[i].depth}`;
      out.push(`            ${m.member.padEnd(width)}  ${value.padStart(12)}${from}`);
    }
  }
  return out;
}

/** `head/head key 1`, which is how A39's own message names a key. */
function deformKeyName(key: DeformKeyMeasure): string {
  return `${key.slot}/${key.attachment} key ${key.key}`;
}

/**
 * Does this compiled `transform` report belong to this loaded key?
 *
 * ⚠️ The two times are not the same number and cannot be compared with `===`.
 * The report's is the spec's own `t`; the survey's came back through
 * `Float32Array`, because that is what `spine-core` reads a timeline's frames
 * into — a key written `0.62` arrives as `0.6200000047683716`. So the tolerance
 * is the compiler's own key-time grid plus one float32 ulp at this magnitude,
 * which is narrower than any key spacing the format can hold and wide enough for
 * both roundings.
 */
function sameKeyTime(specTime: number, loaded: number): boolean {
  return Math.abs(specTime - loaded) <= KEY_TIME_EPSILON + Math.abs(loaded) * 2 ** -23;
}

/**
 * The `DEFORM` report block — what each deform key does to the geometry, per key
 * and then per animation (issue #316).
 *
 * ## Why this is a report and not an assertion
 *
 * Because a 3× stretch is a real thing to author, for the same reason issue #277
 * settled mesh coverage as a printed figure on authored geometry rather than a
 * bar. The one deformed-geometry fault that has no legitimate counter-example is
 * the fold, and that one already IS an assertion —
 * `A39_DEFORM_KEEPS_TRIANGLE_WINDING`. What this block adds is **the approach to
 * that wall**: FACE §4.2's table of ratios down to the fold at 31.37° was
 * measured by rendering seven variants of `gallery/portrait` and looking at them,
 * and `0.637` was a number an author derived from the closed form rather than one
 * the tool printed.
 *
 * ## It quotes; it does not re-derive
 *
 * - the reversal and collapse counts are the **survey's**, which is A39's own
 *   survey ([`src/deformmeasure.ts`](src/deformmeasure.ts)) — one measurement,
 *   two readers, so the block and the gate cannot disagree about a fold;
 * - a key's model is the **compiler's** `transform` report (§4.11.1), so the
 *   block names the same `kind` and parameters the spec stated;
 * - the fold ANGLE is nowhere here. It is A39's, derived at run time from the
 *   grid, and a second copy of it printed beside a ratio would be a number that
 *   goes stale when somebody moves a column;
 * - and a key the gate read **no winding** off — because the slot draws no pixels
 *   of the mesh at that key's own time (issue #401) — says so on a `skipped` line
 *   with the survey's own sentence, and is kept out of the rollup's counts,
 *   because that line ends by claiming A39 reads the same two;
 * - the **spans** between the keys are the survey's too (issue #403). A `BETWEEN`
 *   line appears wherever the closed form found a fold at a time no key lands
 *   on, whether the gate refuses it or passes it over because nothing is drawn
 *   there — and a `spans` line says how many were scanned even when nothing was
 *   found, because a scan that ran and found nothing has to be distinguishable
 *   from a scan that never ran.
 *
 * ## And what it deliberately does not print
 *
 * **Deformed coverage**, which #296 asked for. The coverage figure is rasterised
 * from the attachment's **uvs** against the part's alpha, and a deform moves
 * positions and never uvs — so it is identical at every key by construction, and
 * a `coverage 100.00% (setup 100.00%)` line would be a tautology wearing a
 * measurement's clothes. The header line says so and points at `meshes`, because
 * an author who came here asking whether their deform broke the coverage
 * deserves the answer rather than a silence. What does move is the stretch.
 */
function deformReportLines(result: CompileResult, exempt: ReadonlySet<string>): string[] {
  const survey = surveyDeformKeys(skeletonDataFromText(result.skeletonText, result.atlasText));
  if (survey.timelines === 0) return [];
  const out: string[] = ['', 'deform  (what each key does to the geometry — figures with names, never a bar; issue #316)'];
  // The legend costs six lines and is worth them exactly once — on a report that
  // has figures in it. A bounding box or a clipping polygon deformed and nothing
  // else gets the reason it has no figures and no essay about them.
  if (survey.keys.length) {
    out.push(
      '  ..    every key measured at its OWN time against the same pose with the deform CLEARED, so the',
      '  ..    denominator is 1.000 by definition and a NEGATIVE area ratio IS a reversed triangle',
      '  ..    stretch is the two singular values of the map from the cleared triangle to the deformed one —',
      '  ..    the worst stretch and the worst squash the drawing takes there; their product is |area ratio|',
      '  ..    coverage is NOT here: it is rasterised from the uvs, which no deform moves, so the figure on',
      '  ..    the `meshes` line below is already the deformed one',
    );
  }
  if (survey.notAMesh.length) {
    out.push(`  ..    ${survey.notAMesh.join(', ')} deform an attachment with no triangles — nothing to measure`);
  }
  for (const key of survey.keys) {
    const model = result.deformTransforms.find(
      (g) =>
        g.animation === key.animation &&
        g.skin === key.skin &&
        g.slot === key.slot &&
        g.attachment === key.placeholder &&
        sameKeyTime(g.time, key.time),
    );
    // A stated model is quoted rather than reduced to its results: `yaw
    // radius=170 degrees=12` is what a reviewer checks the ratios against, and an
    // authored table says so instead of saying nothing, because "no model here"
    // is itself the thing a reader of a wrong ratio needs to know.
    const states = model === undefined ? 'authored table' : `transform ${model.kind}  ${model.stated}`;
    out.push(
      `  DEFORM  ${key.animation}  ${key.skin}/${key.slot}/${key.placeholder}  key ${key.key}  ` +
        `t=${key.time.toFixed(6)}  ${states}`,
    );
    // ⚠️ An exemption nobody can see is how a gate comes to look kept while
    // checking nothing (issue #401). A key the gate passed over because the mesh
    // draws no pixels there says so on its own line, in the survey's own words,
    // whether or not it folds.
    if (key.draw.blank !== null) {
      out.push(
        `          skipped    A39 reads no winding off this key: ${key.draw.blank} — a triangle that draws no ` +
          'pixels cannot draw them backwards',
      );
    }
    // And when the slot shows something else, the figures below would be a
    // second falsehood rather than a caveat: the runtime applies no deform to a
    // slot that is not showing the mesh (`DeformTimeline.applyToSlot`), so every
    // figure would be the identity and `moved 0` would read as "this key is the
    // setup pose" — which is exactly what the key is NOT.
    if (!key.draw.showsThisMesh) {
      out.push(
        `          ..         the slot shows ${key.draw.shown === null ? 'no attachment' : `"${key.draw.shown}"`} ` +
          'here, so the runtime applied no deform and there is no posed geometry to measure' +
          (key.draw.blank === null
            ? ' — but the mesh IS drawn in another slot this deform reaches (timelineSlots), so nothing here is exempt'
            : ''),
      );
      continue;
    }
    // A key that moves nothing gets one line and no figures. `{ "t": 2.2 }` with
    // no run is the format's own way of writing "back to the setup pose" (§4.11),
    // and its geometry is bit-identical to the cleared pose it would be measured
    // against — so `x1.000000` there is the definition and not a measurement, and
    // four lines of it on every loop's opening and closing key is the noise that
    // stops the block being read. It is still counted in the rollup below,
    // because A39 measures it too.
    if (key.moved === 0) {
      out.push(
        `          moved      0 of ${key.vertices} vertices — this key IS the setup pose, so every ` +
          `figure is the identity (${key.triangles} triangles, all kept)`,
      );
      continue;
    }
    out.push(
      `          moved      ${key.moved} of ${key.vertices} vertices, ` +
        `worst ${key.maxDisplacement.toFixed(4)}px at v${key.maxDisplacementVertex}`,
    );
    out.push(
      `          area       min ${deformExtreme(key.areaRatioMin)}   max ${deformExtreme(key.areaRatioMax)}   ` +
        `(${key.triangles} triangles, ${key.degenerate} with no area at the cleared pose, band ${key.band.toFixed(6)}px²)`,
    );
    out.push(
      `          stretch    max ${deformExtreme(key.stretchMax)}   min ${deformExtreme(key.stretchMin)}`,
    );
    // The marker has to know about the exemption, or it says the false half of
    // the truth on the one build where it matters: a declared fold IS a fold and
    // A39 does not refuse it — it SKIPs the slot entirely.
    const exempted = exempt.has(key.slot);
    const fold = key.reversed.length
      ? key.draw.blank !== null
        ? '  <- a fold, and nothing gates it: this key draws no pixels (see above)'
        : exempted
          ? '  <- a fold, and A39 does not gate it — see below'
          : '  <- a fold: A39 refuses this key by name'
      : '';
    out.push(
      `          winding    ${key.triangles - key.reversed.length} of ${key.triangles} kept, ` +
        `${key.collapsed} collapsed${fold}`,
    );
    if (exempted) {
      out.push(
        `          ..         A39 is exempt on "${key.slot}" (invariants.deformMayFold), so nothing here is gated`,
      );
    }
  }
  // The folds at times no key lands on (issue #403), printed after the keys they
  // lie between rather than interleaved: they are a different measurement — the
  // closed form named the time and the runtime was posed there — and a reader
  // needs to be able to tell the two apart at a glance.
  for (const span of survey.spans) {
    if (span.fold === null) continue;
    const at = span.fold;
    out.push(
      `  BETWEEN ${span.animation}  ${span.skin}/${span.slot}/${span.placeholder}  key ${span.fromKey} -> ` +
        `${span.toKey}  t=${at.time.toFixed(6)}  ${span.curve}` +
        (span.curve === 'stepped' ? '  (held, not interpolated)' : `  ${(at.percent * 100).toFixed(1)}% of the way`),
    );
    out.push(
      `          winding    ${at.measure.triangles - at.measure.reversed.length} of ${at.measure.triangles} kept, ` +
        `${at.measure.collapsed} collapsed  <- a fold at a time no key lands on` +
        (at.measure.draw.blank !== null
          ? ', and nothing gates it: nothing is drawn there'
          : exempt.has(span.slot)
            ? ', and A39 does not gate it (invariants.deformMayFold)'
            : `: A39 refuses this span by name, at alpha ${at.measure.draw.alpha.toFixed(4)}`),
    );
  }
  // The rollup, per animation: the worst key by each quantity. A timeline's own
  // eight keys are eight blocks above, and "which of them is the one to look at"
  // is the question the sweep in issue #313's landing comment answered by hand.
  for (const animation of [...new Set(survey.keys.map((k) => k.animation))]) {
    // Only the keys the gate ran on, because the line ends by claiming A39 reads
    // the same two counts and A39 reads none of a key that draws nothing. The
    // ones it left out get their own line rather than a silence (issue #401).
    const keys = survey.keys.filter((k) => k.animation === animation && k.draw.blank === null);
    const blank = survey.keys.filter((k) => k.animation === animation && k.draw.blank !== null);
    const worst = (
      pick: (key: DeformKeyMeasure) => DeformExtreme | null,
      better: (a: number, b: number) => boolean,
    ): string => {
      let best: { key: DeformKeyMeasure; extreme: DeformExtreme } | null = null;
      for (const key of keys) {
        const extreme = pick(key);
        if (extreme === null) continue;
        if (best === null || better(extreme.value, best.extreme.value)) best = { key, extreme };
      }
      return best === null ? '—' : `x${best.extreme.value.toFixed(6)} (${deformKeyName(best.key)} tri ${best.extreme.triangle})`;
    };
    const reversed = keys.reduce((n, k) => n + k.reversed.length, 0);
    const collapsed = keys.reduce((n, k) => n + k.collapsed, 0);
    const samples = keys.reduce((n, k) => n + k.triangles, 0);
    if (keys.length) {
      out.push(
        `  WORST   ${animation}  area ${worst((k) => k.areaRatioMin, (a, b) => a < b)}  ` +
          `stretch ${worst((k) => k.stretchMax, (a, b) => a > b)}  ` +
          `squash ${worst((k) => k.stretchMin, (a, b) => a < b)}`,
      );
      out.push(
        `  ..      ${''.padEnd(animation.length)}  reversed ${reversed}, collapsed ${collapsed}, over ` +
          `${keys.length} key(s) and ${samples} triangle sample(s)  <- A39 reads the same two counts`,
      );
    }
    if (blank.length) {
      out.push(
        `  ..      ${keys.length ? ''.padEnd(animation.length) : animation}  ${blank.length} key(s) draw no pixels ` +
          `at their own time and are read for no winding, carrying ` +
          `${blank.reduce((n, k) => n + k.reversed.length, 0)} reversed triangle(s) nothing gates  <- A39 counts ` +
          'them as deformKeysNotDrawn',
      );
    }
    // ⚠️ Printed on a clean animation too. "The scan ran and found nothing" and
    // "the scan never ran" are the two things a gate must never say the same
    // way, and this line is the only place an author can tell them apart
    // (issue #403).
    const spans = survey.spans.filter((s) => s.animation === animation);
    if (spans.length) {
      out.push(
        `  ..      ${keys.length || blank.length ? ''.padEnd(animation.length) : animation}  ${spans.length} ` +
          `span(s) between consecutive keys scanned for a fold no key lands on: ` +
          `${spanTally(spans)}  <- A39 reads the same scan`,
      );
    }
  }
  return out;
}

/** What the between-keys scan found, in one clause (issue #403). */
function spanTally(spans: readonly DeformSpan[]): string {
  const folds = spans.filter((s) => s.fold !== null).length;
  const notDrawn = spans.filter((s) => s.notDrawn > 0).length;
  const unconfirmed = spans.filter((s) => s.unconfirmed).length;
  const probes = spans.reduce((n, s) => n + s.probed.length, 0);
  if (folds === 0 && notDrawn === 0 && unconfirmed === 0) {
    return `none folds (the closed form flagged nothing, so no span cost a posed measurement)`;
  }
  return (
    [
      folds ? `${folds} fold(s)` : '',
      notDrawn ? `${notDrawn} folding only where nothing is drawn` : '',
      unconfirmed ? `${unconfirmed} predicted a fold no probe reproduced` : '',
    ]
      .filter(Boolean)
      .join(', ') + `, at a cost of ${probes} posed measurement(s)`
  );
}

/**
 * The header the `scale` rows carry, because the figure beside them lies without
 * it.
 *
 * ⛔ Three things it has to say, and each one is a way the number is wrong if
 * taken at face value:
 *   - it is the key's OWN factor. A nonuniform parent shears its children, so
 *     the drawn area is not this product;
 *   - a key that moved only one axis has no product to state, and gets none
 *     rather than an invented 1 on the other;
 *   - a uniform scale has a product too, and it is a zoom rather than a squash.
 */
const SCALE_PRODUCT_NOTE =
  '..  x·y is the key\'s own local area factor: ~1.00 is the volume kept, and it is a READING, never a rule — ' +
  'a nonuniform parent shears this, and a uniform scale has a product without being a squash';

/**
 * `x·y` for a `scale` key that states both, and nothing otherwise.
 *
 * ⭐ Why it is here at all: `explain` ALREADY prints this reading for the other
 * spelling of squash and stretch. A `transform: affine` deform key reports
 * `area x1.020800`, which is exactly its own `0.88 × 1.16` — so the author who
 * reaches for the advanced spelling is told whether the volume held and the
 * author who reaches for the cheap one is not, while `docs/MOTION.md` §7 points
 * a first candidate at the cheap one on purpose. That asymmetry is the defect;
 * this is not a new kind of number (issue #377).
 *
 * 🔒 A reading and never an assertion. `deformReportLines` states the test a
 * geometric figure has to pass to become a gate — no legitimate counter-example
 * — and this fails it in quantity: a shadow, a zoom, a cartoon squash that
 * gains mass on purpose. Volume preservation is a style commitment no spec can
 * declare, so a bar here would be one consumer's house style failing correct
 * foreign data. There is no honest SKIP either: an absent declaration is not
 * "nothing to measure", it is "no way to know what was meant".
 */
function scaleProduct(timelineName: string, key: Record<string, unknown>): string {
  if (timelineName !== 'scale') return '';
  const x = key.x;
  const y = key.y;
  // Both axes, or nothing: a key that moved one axis has no area factor, and
  // defaulting the other to 1 would invent the very number being reported.
  if (typeof x !== 'number' || typeof y !== 'number') return '';
  return `  x·y=${(x * y).toFixed(4)}`;
}

/**
 * Read one non-negative integer flag, or its default.
 *
 * A usage error rather than a `NaN` that reaches the packer: `--padding two`
 * would otherwise place every region at NaN and write a blank page, which is a
 * green build and an empty picture.
 */
function readIntFlag(flags: Record<string, string>, name: string, fallback: number): number {
  const raw = flags[name];
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new UsageError(`--${name} takes a non-negative integer, got ${JSON.stringify(raw)}`);
  return Number(raw);
}

function cmdBuild(flags: Record<string, string>): void {
  const { label, opts } = resolveCut(flags);
  const profile = readProfile(flags);
  const packing = flags.pack !== undefined;
  // Two combinations are refused rather than silently resolved, because in each
  // one the two flags disagree about a single question and there is no answer
  // that is not a guess about which the caller meant. (There were three until
  // issue #266 — see the note below the second.)
  if (packing && opts.atlasInPath !== undefined) {
    throw new UsageError(
      '--pack and --atlas-in are opposite directions through the same door: --pack MAKES an atlas out of the ' +
        'loose parts, --atlas-in resolves the parts against one somebody already made. Pick one',
    );
  }
  if (packing && flags['copy-images'] !== undefined) {
    throw new UsageError(
      '--pack already writes self-contained pages into --out (that is what packing is), and --copy-images copies ' +
        'the loose part PNGs, which a packed atlas does not reference. Drop --copy-images',
    );
  }
  // The copy itself happens after the gate (below). The header has to know NOW,
  // because the skeleton text the gate reads is the skeleton text that is written
  // — `skeleton.images` says where the parts will be (issue #370).
  if (flags['copy-images'] !== undefined) opts.copyImages = true;
  // `--pack --profile spine-html` used to be the third refusal here, because
  // A06's coverage clause was "one part per page" flat and a legitimate pack
  // arrived at the gate reading as a defect. Since issue #266's second follow-up
  // that clause is "one part per page OR a tiling page", so the combination is
  // now a build like any other — and it is the only one that puts the renderer's
  // own rulebook over shared-page sampling.
  if (!packing) {
    for (const name of ['page-size', 'padding'] as const) {
      if (flags[name] !== undefined) throw new UsageError(`--${name} only means something with --pack`);
    }
  }
  console.log(`rigc build ${label}`);
  // Named explicitly and on their own lines rather than folded into the header
  // above: with two input files, a header that names only one of them (the rig,
  // historically) reads as though it were the one at fault whenever the error
  // that follows actually comes from the other.
  console.log(`  ..    rig    ${opts.rigPath}`);
  console.log(`  ..    motion ${opts.motionPath}`);
  const result = compile(opts);

  if (opts.atlasInPath !== undefined) console.log(`  ..    atlas-in ${opts.atlasInPath}`);
  console.log(`  ..    ${result.images.length} part page(s):`);
  for (const img of result.images) {
    // An imported part says where on the page it came from, because "resolved
    // against a region" is the claim `--atlas-in` makes and a line that only
    // repeated the page filename would look identical for all of them. A page
    // that declares a `scale:` also says so and shows the texels it was read
    // from: the size on the left is the DRAWING's and the rectangle is the
    // pack's, and issue #267 is the report that printed the second as the first.
    const where =
      img.atlas === undefined
        ? img.page
        : `${img.page} @ ${img.atlas.x},${img.atlas.y}${img.atlas.degrees ? ` rotate ${img.atlas.degrees}` : ''}` +
          (img.atlasScale === undefined
            ? ''
            : ` scale ${img.atlasScale} (${img.atlas.originalWidth}x${img.atlas.originalHeight} texels)`);
    console.log(`  ..      ${img.region.padEnd(24)} ${img.width}x${img.height}  <- ${where}`);
  }
  for (const d of result.droppedStates) {
    console.log(`  DROP  ${d.slot}/${d.state}: ${d.why ?? `no PNG at ${d.path}`} (state not emitted)`);
  }
  // "The optional slots are optional" is a claim about this code path, so this
  // code path says which ones it left out rather than being silently right.
  for (const a of result.absentParts) {
    console.log(`  ABSENT ${a.slot}: ${a.why} — slot not emitted`);
  }
  for (const m of result.meshes) {
    console.log(
      `  MESH  ${m.slot.padEnd(12)} ${m.kind.padEnd(8)} ${m.vertices} vertices / ${m.triangles} triangles  ` +
        `${meshBudget(result.rig)}  bones=[${m.bones.join(', ')}]  attachments=[${m.attachments.join(', ')}]${meshFit(m)}` +
        meshDepthNote(m),
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

  // `--pack`: the parts go onto shared pages, which are written here as real
  // PNGs, so `--out` is self-contained by construction. The atlas above stays
  // the one the gate just read — packing changes only the ARRANGEMENT of the
  // bytes, and the sizes in `result.images` are still the ones measured off the
  // loose PNGs (see src/atlas.ts's header).
  if (packing) {
    const packOpts = {
      pageSize: readIntFlag(flags, 'page-size', DEFAULT_PAGE_SIZE),
      padding: readIntFlag(flags, 'padding', DEFAULT_PADDING),
      pageStem: 'skeleton',
    };
    const inputs = result.images.map((img) => ({
      region: img.region,
      absPath: img.absPath,
      width: img.width,
      height: img.height,
    }));
    const packed = packAtlas(inputs, packOpts);
    atlasText = packed.atlasText;
    for (const page of packed.pages) {
      page.plate.writePng(join(opts.outDir, page.name));
      console.log(
        `  ..    pack: ${page.name} ${page.width}x${page.height}, ` +
          `${packed.placements.filter((p) => packed.pages[p.page].name === page.name).length} region(s), ` +
          `${(page.occupancy * 100).toFixed(1)}% covered, padding ${packed.padding}`,
      );
    }
    for (const place of packed.placements) {
      console.log(
        `  ..      ${place.region.padEnd(24)} ${place.width}x${place.height} -> ` +
          `${packed.pages[place.page].name} @ ${place.x},${place.y}`,
      );
    }
    // The pages are on disk now, so the packed pair can be gated as an artifact
    // rather than trusted as a construction: A17 stats every page, A06 reads its
    // IHDR back, A07 re-reads the text shape, A08 re-joins every attachment onto
    // a region, and A18 compares a second independent compile+pack. Two gates on
    // one build is the cost of shipping a second atlas shape.
    console.log('  ..    validate (packed atlas, pages on disk)');
    const packAgain = packAtlas(
      compile(opts).images.map((img) => ({
        region: img.region,
        absPath: img.absPath,
        width: img.width,
        height: img.height,
      })),
      packOpts,
    );
    const packFailures = runGate(result, opts, profile, { text: atlasText, again: packAgain.atlasText });
    if (packFailures > 0) {
      console.error(
        `rigc: ${packFailures} assertion(s) failed on the PACKED atlas — the pages were written to ` +
          `${opts.outDir}, the skeleton/atlas pair was not`,
      );
      process.exit(1);
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
function readCheckFlags(
  flags: Record<string, string>,
): Pick<CheckOptions, 'fps' | 'viewport' | 'as' | 'framing' | 'textureFrom'> {
  const out: Pick<CheckOptions, 'fps' | 'viewport' | 'as' | 'framing' | 'textureFrom'> = {};
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
  if (flags['texture-from'] !== undefined) {
    const path = resolve(flags['texture-from']);
    if (!existsSync(path)) {
      throw new UsageError(
        `--texture-from ${path} is not a file. It takes the ATLAS the reference frames were rendered through — the ` +
          "example's own .atlas — so check can measure how much of the MAE is texture resampling.",
      );
    }
    out.textureFrom = { atlasText: readFileSync(path, 'utf8'), atlasDir: dirname(path), label: flags['texture-from'] };
  }
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
// reading the half a picture hides — chainfit
// ---------------------------------------------------------------------------
//
// ⭐ `pose` above reads a picture with nothing but the loose parts, and refuses
// the parts another part is drawn over — a residual measured through an occluder
// rises AT the correct placement, so the honest answer is a refusal. This reads
// those, and the whole difference is that it is also given the CANDIDATE: with a
// draw order the covered pixels can be excluded from a part's objective instead
// of charged to it, and with a hierarchy a child of a placed bone has one degree
// of freedom — the hinge about its own pivot — where `pose` has four.
//
// 🚫 Same phase and the same framing as `pose`: it reads a given condition into
// spec coordinates and grades nothing. Every residual is a trust signal, every
// threshold is reported, and `visibleShare` is how much of the part the number
// was even computed on.
//
//   rigc chainfit --candidate <dir> --images <dir> --frame poseA.png [--anchor pose.json]

const DEFAULT_CHAINFIT_OUT = 'chainfit.json';

function cmdChainFit(flags: Record<string, string>): void {
  if (flags.candidate === undefined) {
    throw new UsageError('chainfit needs --candidate <dir | skeleton.json> — the compiled rig to read the frame through');
  }
  if (flags.images === undefined) {
    throw new UsageError("chainfit needs --images <dir> — where the candidate's attachment image names resolve to PNGs");
  }
  if (flags.frame === undefined) throw new UsageError('chainfit needs --frame <path> — one pose frame to read the placements out of');
  // Refused rather than ignored. Every other --candidate command takes --atlas, so
  // passing it here is a reasonable thing to try — and a flag that silently does
  // nothing is worse than one that says why it cannot.
  if (flags.atlas !== undefined) {
    throw new UsageError(
      'chainfit reads no atlas: the part art comes from --images, one PNG per attachment image name, and the ' +
        'skeleton is all it needs of the candidate. Drop --atlas',
    );
  }
  const options: ChainFitOptions = {
    candidatePath: flags.candidate,
    imagesDir: flags.images,
    framePath: flags.frame,
  };
  if (flags.anchor !== undefined) options.anchorPath = flags.anchor;
  const hinge = readRange(flags, 'hinge');
  if (hinge) {
    if (hinge.high - hinge.low > 360) throw new UsageError('--hinge cannot span more than a full turn');
    options.hinge = { minDeg: hinge.low, maxDeg: hinge.high };
  }
  if (flags.stretch !== undefined) {
    const value = Number(flags.stretch);
    if (!Number.isFinite(value) || value < 1) throw new UsageError('--stretch must be a ratio of 1 or more, e.g. 1.25');
    options.stretch = value;
  }
  if (flags['min-visible'] !== undefined) {
    const value = Number(flags['min-visible']);
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new UsageError('--min-visible must be a number in [0, 1]');
    options.minVisible = value;
  }
  if (flags['max-residual'] !== undefined) {
    const value = Number(flags['max-residual']);
    if (!Number.isFinite(value) || value <= 0 || value > 1) throw new UsageError('--max-residual must be a number in (0, 1]');
    options.maxResidual = value;
  }
  if (flags.passes !== undefined) {
    const value = Number(flags.passes);
    if (!Number.isInteger(value) || value < 1 || value > 8) throw new UsageError('--passes must be a whole number in 1..8');
    options.passes = value;
  }
  if (flags['inward-lever'] !== undefined) {
    const value = Number(flags['inward-lever']);
    if (!Number.isFinite(value) || value < 0) throw new UsageError('--inward-lever must be a number of frame pixels, 0 or more');
    options.minLeverPx = value;
  }
  if (flags['anchor-residual'] !== undefined) {
    const value = Number(flags['anchor-residual']);
    if (!Number.isFinite(value) || value <= 0 || value > 1) throw new UsageError('--anchor-residual must be a number in (0, 1]');
    options.anchorMaxResidual = value;
  }
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

  console.log('rigc chainfit');
  const report = estimateChainFit(options);
  for (const line of chainFitLines(report)) console.log(line);

  const target = resolve(flags.out ?? DEFAULT_CHAINFIT_OUT);
  const out = existsSync(target) && statSync(target).isDirectory() ? join(target, DEFAULT_CHAINFIT_OUT) : target;
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

  // Stage 3, optional and behind a flag because the correspondence is an INPUT:
  // a candidate is entitled to its own bone names, so there is nothing sensible
  // to default to and a derived mapping would be a guess reported as a
  // measurement (issue #8). Nothing here gates, and without the flag the report
  // above is unchanged to the byte.
  const boneDists: Array<{ skeleton: RungSkeleton; report: BoneDistReport }> = [];
  if (flags.bones !== undefined) {
    for (const skeleton of rung.skeletons) {
      const referencePath = join(exportDir, skeleton.file);
      if (!existsSync(referencePath)) continue;
      console.log(`  ── bonedist vs ${rung.example}/${skeleton.label} (stage 3) ──`);
      const boneDist = boneDistance({
        candidateSkeleton: skeletonPath,
        candidateAtlas: atlasPath,
        candidateAtlasDir: dirname(atlasPath),
        referenceSkeleton: referencePath,
        referenceAtlas: join(exportDir, skeleton.atlas),
        referenceAtlasDir: exportDir,
        bones: flags.bones,
        // Deliberately NOT `flags.fps`. Inside `bench` that flag already means
        // "the rate this frame set was recorded at, for a set with no sidecar",
        // and one flag doing two unrelated things in one command is how a
        // reader ends up quoting a figure measured at a rate they did not ask
        // for. A run wanting another sampling rate calls `rigc bonedist`, where
        // `--fps` has exactly one meaning.
      });
      for (const line of boneDistLines(boneDist, { allBones: flags['all-bones'] !== undefined })) console.log(`  ${line}`);
      console.log('');
      boneDists.push({ skeleton, report: boneDist });
    }
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
    // A third line, for the same reason the second one is not folded into the
    // first: the reported measures are unobservable by construction, so they
    // roll into no mean at all and cannot be shown as one. Each is named with
    // its own figure — a per-section digest would be the mean this block exists
    // to refuse.
    const reported = reportedFigures(d.report);
    if (reported !== null) console.log(`  ${''.padEnd(10)} reported: ${reported}`);
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
  if (boneDists.length > 0) {
    for (const b of boneDists) {
      const w = b.report.worst;
      console.log(
        `  ${b.skeleton.label.padEnd(10)} bonedist worst position ${w.position.value.toFixed(6)} skeleton-size(s), ` +
          `rotation ${w.rotation.value.toFixed(4)}°, scale ${w.scale.value.toFixed(6)}, linear ${w.linear.value.toFixed(6)}  ` +
          `over ${b.report.animations.reduce((n, a) => n + a.compared, 0)} frame(s) × ${b.report.correspondence.pairs} bone pair(s)`,
      );
    }
  } else {
    console.log('  bonedist   not run — pass --bones <correspondence.json | identity> for the stage-3 per-frame');
    console.log('             bone world-transform distance. It reports and gates nothing.');
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
      // Absent rather than null when the flag was not passed: `bonedist: null`
      // in a stored record would read as "measured, nothing to report", and
      // that is the opposite of "not measured".
      ...(boneDists.length === 0
        ? {}
        : { boneDists: boneDists.map((b) => ({ label: b.skeleton.label, role: b.skeleton.role, ...b.report })) }),
    });
  }

  if (report.failures.length > 0) {
    console.error(`rigc: candidate is not valid Spine — ${report.failures.length} assertion(s) failed`);
    process.exit(1);
  }
}

/**
 * bonedist — the ladder's stage 3, run on its own.
 *
 * ⚠️ It reads BOTH skeletons, so it is a finish-line instrument like `bench` and
 * unlike `check`. Every convention behind every figure is printed above the
 * tables, and there is no score — see [`src/bonedist.ts`](src/bonedist.ts).
 */
function cmdBoneDist(flags: Record<string, string>): void {
  if (flags.candidate === undefined) throw new UsageError('bonedist needs --candidate <dir | skeleton.json>');
  if (flags.reference === undefined) throw new UsageError('bonedist needs --reference <skeleton.json>');
  if (flags.bones === undefined) {
    throw new UsageError(
      `bonedist needs --bones <correspondence.json | ${IDENTITY_CORRESPONDENCE}> — a candidate is entitled to its own bone ` +
        'names, so the mapping is an input and never a guess; pass `identity` to state that the two use the same names',
    );
  }
  const candidate = resolveArtifacts(flags.candidate, flags.atlas);
  const reference = resolveArtifacts(flags.reference, flags['reference-atlas']);
  const report = boneDistance({
    candidateSkeleton: candidate.skeletonPath,
    candidateAtlas: candidate.atlasPath,
    candidateAtlasDir: dirname(candidate.atlasPath),
    referenceSkeleton: reference.skeletonPath,
    referenceAtlas: reference.atlasPath,
    referenceAtlasDir: dirname(reference.atlasPath),
    bones: flags.bones,
    ...(flags.fps === undefined ? {} : { fps: Number(flags.fps) }),
  });
  console.log('rigc bonedist — per-frame bone world-transform distance (the ladder\'s stage 3)');
  for (const line of boneDistLines(report, { allBones: flags['all-bones'] !== undefined })) console.log(line);
  if (flags.json !== undefined) writeJson(flags.json, report);
}

function cmdExplain(flags: Record<string, string>): void {
  const { label, opts } = resolveCut(flags);
  console.log(`rigc explain ${label}`);
  // See the identical pair of lines in `cmdBuild` for why both paths are named
  // here rather than only the one the header's `label` happens to carry.
  console.log(`  ..    rig    ${opts.rigPath}`);
  console.log(`  ..    motion ${opts.motionPath}`);
  const result = compile(opts);
  // `compile` has already parsed this file, so the read below cannot fail — but
  // it goes through the same parser rather than a cast, because the cast was the
  // last one in the repository and issue #307 was about exactly that.
  const motion = parseMotionSpec(readJsonFile(opts.motionPath), opts.motionPath);

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
        if (timelineName === 'scale') console.log(`      ${SCALE_PRODUCT_NOTE}`);
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
          console.log(`      t=${String(key.time).padEnd(7)} ${fields.padEnd(30)} ${curve}${scaleProduct(timelineName, key)}`);
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
    // The other two constraint groups. These DO carry a timeline name under the
    // constraint (`path.<name>.position`), which is the physics shape rather
    // than the ik/transform one, so the name printed is both.
    for (const group of ['path', 'slider'] as const) {
      for (const [name, timelines] of Object.entries(anim[group] ?? {})) {
        for (const [timelineName, keys] of Object.entries(timelines)) {
          console.log(`    ${group}.${name}.${timelineName}  ${keys.length} key(s)`);
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
              // A generated key prints its MODEL and then every offset the model
              // produced (issue #294). Both halves are the point: the model is
              // what a reviewer checks a claim against, and the offsets are what
              // reaches the file — printing only the first would ask a reader to
              // trust an evaluation they cannot see, which is the gap FACE §9.3
              // records. The numbers are the emitted ones, not a second
              // evaluation, so this block and the artifact cannot disagree.
              const gen = result.deformTransforms.find(
                (g) => g.animation === animName && g.skin === skinName && g.slot === slotName && g.attachment === attName && g.time === key.time,
              );
              if (gen === undefined) continue;
              console.log(`               transform ${gen.kind}  ${gen.stated}`);
              console.log(`               ${gen.formula}`);
              for (const line of gen.derived) console.log(`                 ${line}`);
              console.log(
                `               ${gen.vertexCount} vertices, largest offset ${gen.maxOffset}px at vertex ${gen.maxOffsetVertex}`,
              );
              for (let v = 0; v < gen.vertexCount; v += 4) {
                const pairs: string[] = [];
                for (let k = v; k < Math.min(v + 4, gen.vertexCount); k++) {
                  pairs.push(`v${String(k).padStart(3)} (${gen.offsets[2 * k]}, ${gen.offsets[2 * k + 1]})`);
                }
                console.log(`                 ${pairs.join('  ')}`);
              }
              // On a multi-influence attachment those pairs are the model's
              // WORLD displacements, and the file holds one `Mᵢ⁻¹·D` pair per
              // influence instead (issue #389). Printing the first without the
              // second would put numbers on the screen that are nowhere in the
              // artifact — the exact gap this block exists to close.
              if (gen.expanded !== undefined) {
                console.log(
                  `               written as ${gen.expanded.length / 2} per-influence pair(s), each vertex's D through ` +
                    'its own bone inverse',
                );
                for (let i = 0; i < gen.expanded.length / 2; i += 4) {
                  const pairs: string[] = [];
                  for (let k = i; k < Math.min(i + 4, gen.expanded.length / 2); k++) {
                    pairs.push(`i${String(k).padStart(3)} (${gen.expanded[2 * k]}, ${gen.expanded[2 * k + 1]})`);
                  }
                  console.log(`                 ${pairs.join('  ')}`);
                }
              }
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

  // The `MEMBER` block sits beside the `DEFORM` one and for the same reason:
  // both re-print timelines the reader has just read, in the arrangement the
  // question needs rather than the one the format has.
  for (const line of memberReportLines(result)) console.log(line);

  // The `DEFORM` block goes after the timelines and before the constraints,
  // because it is a measurement OF the deform timelines printed above — the keys
  // it names are the keys the reader has just read, by the same index.
  for (const line of deformReportLines(result, new Set(result.rig.deformMayFold))) console.log(line);

  if (result.physics.length) {
    console.log('\nphysics constraints (4.3 top-level `constraints` array, type per entry)');
    for (const ph of result.physics) {
      console.log(`  ${ph.name.padEnd(12)} bone=${ph.bone.padEnd(14)} components=[${ph.components.join(', ')}] mix=${ph.mix} drivesMesh=${ph.drivesMesh}`);
    }
  }

  // Path constraints, with the curve each one follows MEASURED — its length and
  // its curve count are the two numbers an author cannot get from the spec, and
  // `position` means nothing without the first of them under `positionMode:
  // "percent"`. Read off the emitted attachment rather than recomputed here.
  const constraintsOf = (type: string) => (result.skeleton.constraints ?? []).filter((c) => c.type === type);
  const pathConstraints = constraintsOf('path');
  if (pathConstraints.length) {
    console.log('\npath constraints  (position is a fraction of the measured length under positionMode "percent")');
    for (const c of pathConstraints) {
      const slot = String(c.slot);
      const attachments = result.skeleton.skins.flatMap((skin) => Object.values(skin.attachments[slot] ?? {}));
      const curve = attachments.find((att) => (att as { type?: string }).type === 'path') as
        | { lengths?: number[]; closed?: boolean; constantSpeed?: boolean }
        | undefined;
      const lengths = curve?.lengths ?? [];
      console.log(
        `  ${c.name.padEnd(12)} slot=${slot.padEnd(12)} bones=[${(c.bones as string[]).join(', ')}] ` +
          `position=${c.position ?? 0} ${String(c.positionMode ?? 'percent')}/${String(c.spacingMode ?? 'length')}/${String(c.rotateMode ?? 'tangent')}`,
      );
      console.log(
        `  ${''.padEnd(12)} curve: ${lengths.length} curve(s), ${lengths[lengths.length - 1] ?? 0} long, ` +
          `${curve?.closed ? 'closed' : 'open'}, constantSpeed=${curve?.constantSpeed ?? true}`,
      );
    }
  }

  const sliders = constraintsOf('slider');
  if (sliders.length) {
    console.log('\nsliders  (each applies one animation at a time it chooses)');
    for (const c of sliders) {
      const driver = c.bone === undefined ? `time=${c.time ?? 0} (keyed by slider.${c.name}.time)` : `bone=${String(c.bone)}.${String(c.property)}`;
      console.log(
        `  ${c.name.padEnd(12)} applies=${String(c.animation).padEnd(14)} ${driver}  ` +
          `mix=${c.mix ?? 1} loop=${c.loop ?? false} additive=${c.additive ?? false}`,
      );
    }
  }

  // Which bones and constraints a skin switches on. Printed because the pairing
  // with `skin: true` is invisible in the emitted file: a member list and a
  // skinRequired flag are two keys in two places, and only together do they mean
  // "this bone belongs to this skin".
  const skinMembers = result.skeleton.skins.filter((skin) => skin.bones?.length || skin.ik?.length || skin.transform?.length || skin.path?.length || skin.physics?.length || skin.slider?.length);
  if (skinMembers.length) {
    console.log('\nskin members  (skinRequired bones and constraints, active only under their own skin)');
    for (const skin of skinMembers) {
      const lists = (['bones', 'ik', 'transform', 'path', 'physics', 'slider'] as const)
        .filter((key) => skin[key]?.length)
        .map((key) => `${key}=[${skin[key]!.join(', ')}]`)
        .join(' ');
      console.log(`  ${skin.name.padEnd(12)} ${lists}`);
    }
  }

  if (result.meshes.length) {
    console.log('\nmeshes');
    for (const kind of new Set(result.meshes.map((m) => m.kind))) console.log(`  ${MESH_KIND_NOTES[kind]}`);
    for (const m of result.meshes) {
      // The depth block belongs here more than it belongs in `build`: `explain`
      // is the command that says what a spec MEANS, and the turn ceiling is the
      // number an author needs before writing a key rather than after a refusal.
      // It was absent, while `docs/AUTHORING.md` said both commands printed it.
      console.log(
        `  ${m.slot.padEnd(12)} ${m.kind.padEnd(8)} ${m.vertices} vertices / ${m.triangles} triangles  ` +
          `${meshBudget(result.rig)}  bones=[${m.bones.join(', ')}]${meshFit(m)}` +
          meshDepthNote(m),
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
  out: 'directory for skeleton.json + skeleton.atlas; atlas page paths and skeleton.images are written relative to it',
  images: "override the rig spec's own images directory (relative to your working directory)",
  manifest: 'a cut manifest, for a rig with measured art behind it; a foreign skeleton has none',
  'copy-images':
    'also copy every referenced page PNG into --out and rewrite the atlas to the copies, so the directory is ' +
    'self-contained enough to zip or commit on its own, and point skeleton.images at --out itself so the editor finds ' +
    'the parts beside the skeleton on import (default: page paths still point at the source art)',
  pack: 'arrange every part PNG onto shared atlas page(s) written into --out as real PNGs, instead of one page ' +
    'per part. Lossless: every region is a byte-for-byte copy and nothing is resampled, trimmed or rotated ' +
    '(default: one part, one page, pointing at the source art)',
  'page-size': `largest page edge, --pack only (default ${DEFAULT_PAGE_SIZE}); pages are powers of two and the ` +
    'one written is the smallest that holds the pack, spilling to more pages only when the set will not fit',
  padding: `gutter each region reserves on every side, --pack only (default ${DEFAULT_PADDING}); it is filled by ` +
    "extending the region's own edge pixels outwards, which is what stops a neighbour bleeding in",
  'atlas-in':
    'resolve every part against the regions of this pre-packed .atlas instead of against loose PNGs — region ' +
    'geometry (bounds/offsets/rotate) is read from the file and the atlas is re-emitted into --out, re-anchored',
  cut: 'look up a named cut in --cuts <cuts.json>, instead of --rig/--motion/--out',
  cuts: 'the cuts.json --cut names',
  profile:
    'which rulebook to check against (default: spine) — spine = valid Spine 4.3 that any runtime plays ' +
    "correctly; spine-html = also this project's renderer/archetype policy",
  atlas: "the candidate's atlas, when it is not beside the skeleton",
  reference: 'the reference skeleton to pose beside the candidate — a directory or a skeleton.json path',
  'reference-atlas': "the reference's atlas, when it is not beside the reference skeleton",
  bones: `a bone correspondence — { "spec": "${BONEDIST_SPEC}", "bones": { "<candidate bone>": "<reference bone>" }, ` +
    '"animations"?: { … } } — or `identity` to state that the two skeletons use the same names. An INPUT, never ' +
    'derived: a candidate is entitled to its own vocabulary, so a mapping worked out here would be a guess reported ' +
    'as a measurement',
  'all-bones': 'print every bone pair, not just the worst by position',
  'texture-from':
    "also measure this run through this atlas's texels, keeping the candidate's own geometry, and report how much " +
    'of the MAE is texture resampling rather than the rig — pass the atlas the reference frames were rendered ' +
    'through. ⚠️ NOT --atlas: that one names the candidate\'s own atlas and loading a foreign one there re-seats ' +
    'every region attachment on its packing, so a rotated or trimmed pack moves the geometry too',
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
  anchor:
    'a `rigc pose` report for THIS frame, whose confident placements become the anchors the chains hang off ' +
    '(default: run that pass internally over exactly the parts the candidate draws)',
  hinge:
    `the window each child bone's local rotation is searched over, in Spine degrees about its setup value ` +
    `(default \`${DEFAULT_HINGE_MIN},${DEFAULT_HINGE_MAX}\`, a full turn — one degree of freedom is cheap enough not ` +
    'to risk a window that does not contain the truth)',
  stretch:
    'also search a uniform scale on every bone, over this ratio either way (e.g. 1.25). Without it the stretch ' +
    "degree of freedom is searched only where the candidate's own animations key a `scale` timeline, because a rig " +
    'that never scales a bone is a rig saying that bone does not stretch',
  'min-visible':
    `below this share of a part surviving the parts drawn over it, the placement is refused by name instead of ` +
    `reported flat (default ${DEFAULT_MIN_VISIBLE}); the best one found is still printed, and it is a reporting ` +
    'threshold, not a pass bar',
  passes:
    `how many times the occluder masks are rebuilt from the answers and the fit rerun (default ${DEFAULT_PASSES}); ` +
    "pass 1 freezes each part's visible set where the RIG predicts it, later passes where the last one landed",
  'anchor-residual':
    `the residual a \`pose\` placement must be within to anchor a chain (default ${ANCHOR_MAX_RESIDUAL}, with ` +
    `unexplained ≤ ${ANCHOR_MAX_UNEXPLAINED} and unambiguous — the 2026-09-03 measurement run's own clean-frame criterion)`,
  'inward-lever':
    `how far apart, in frame pixels, two anchored descendants have to sit before the rotation they determine is ` +
    `printed (default ${DEFAULT_MIN_LEVER_PX}); below it the bone is refused \`no-bracket\` naming the measured ` +
    'lever, because an angle read across a short lever turns a half-pixel anchor error into several degrees',
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
  'atlas-in': '<file.atlas>',
  'page-size': '<px>',
  padding: '<px>',
  'texture-from': '<path>',
  reference: '<dir|skeleton.json>',
  'reference-atlas': '<path>',
  bones: `<correspondence.json|${IDENTITY_CORRESPONDENCE}>`,
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
  anchor: '<pose.json>',
  hinge: '<min,max>',
  stretch: '<ratio>',
  'min-visible': '<0..1>',
  passes: '<n>',
  'anchor-residual': '<0..1>',
  'inward-lever': '<px>',
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
      `rigc build … --pack [--page-size ${DEFAULT_PAGE_SIZE}] [--padding ${DEFAULT_PADDING}]   (parts onto shared pages, written into --out)`,
      'rigc build … --atlas-in <skeleton.atlas>                    (resolve the parts against a pack somebody already made)',
      'rigc build --cut <name> --cuts <cuts.json>',
    ],
    flags: [
      'rig',
      'motion',
      'out',
      'manifest',
      'images',
      'copy-images',
      'pack',
      'page-size',
      'padding',
      'atlas-in',
      'cut',
      'cuts',
      'profile',
    ],
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
    flags: ['candidate', 'frames', 'atlas', 'texture-from', 'fps', 'viewport', 'framing', 'as', 'all-frames', 'json'],
  },
  {
    name: 'bench',
    usage: [`rigc bench <${RUNG_IDS.join(' | ')}> --candidate <dir | skeleton.json> [--frames <dir>] [flags]`],
    flags: ['candidate', 'atlas', 'frames', 'profile', 'bones', 'all-frames', 'all-bones', 'json'],
    overrides: {
      bones: {
        meaning:
          'also run the stage-3 per-frame bone world-transform distance against each of the rung\'s reference ' +
          `skeletons, with this correspondence (or \`identity\`), at ${PROTOCOL_FPS} fps. Reports; gates nothing — ` +
          'for another sampling rate call `rigc bonedist` directly, where --fps means only that',
      },
    },
  },
  {
    name: 'bonedist',
    usage: [
      `rigc bonedist --candidate <dir | skeleton.json> --reference <dir | skeleton.json> --bones <path | ${IDENTITY_CORRESPONDENCE}> [--fps ${PROTOCOL_FPS}] [--all-bones] [--json <out>]`,
    ],
    flags: ['candidate', 'atlas', 'reference', 'reference-atlas', 'bones', 'fps', 'all-bones', 'json'],
    overrides: {
      fps: { meaning: `the rate both skeletons are sampled at, from t=0 over their own durations (default ${PROTOCOL_FPS})` },
    },
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
    name: 'chainfit',
    usage: [
      `rigc chainfit --candidate <dir | skeleton.json> --images <dir> --frame <path> [--anchor pose.json] [--out ${DEFAULT_CHAINFIT_OUT}]`,
    ],
    flags: [
      'candidate',
      'images',
      'frame',
      'anchor',
      'hinge',
      'stretch',
      'min-visible',
      'max-residual',
      'passes',
      'anchor-residual',
      'inward-lever',
      'scale',
      'rotation',
      'out',
    ],
    overrides: {
      images: {
        value: '<dir>',
        meaning:
          "where each attachment's image name resolves to a loose PNG. ⚠️ NOT a part list the way `pose --images` " +
          'is one — the candidate decides what the parts are, so extra PNGs in here are simply unused and a name ' +
          'the directory lacks is refused by name',
      },
      scale: {
        meaning:
          'the scale window the INTERNAL anchor pass searches, as frame pixels per part pixel (default ' +
          `\`${DEFAULT_SCALE_MIN},${DEFAULT_SCALE_MAX}\`). Refused together with --anchor, which means there is no internal pass`,
      },
      rotation: {
        meaning:
          'the rotation window the INTERNAL anchor pass searches, in screen degrees (default `-180,180`). Refused ' +
          'together with --anchor — the chains\' own window is --hinge',
      },
      out: {
        value: '<file>',
        meaning: `the .json report to write (default \`${DEFAULT_CHAINFIT_OUT}\`); a directory means "the default name in here"`,
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
  `              THE DEFAULT — ${assertionCountForProfile('spine')} rules, and the question the output answers when`,
  '              you import it into the Spine editor.',
  '  spine-html  the above, plus this project\'s renderer and archetype policy:',
  `              all ${assertionCountForProfile('spine-html')} rules, opt-in. Those extra ` +
    `${assertionCountForProfile('spine-html') - assertionCountForProfile('spine')} fire on real, correct,`,
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
  'chainfit reads the half of that picture pose refuses. It is the same question with',
  'one more input — the candidate rig — and that input buys two things: draw order, so',
  'the pixels another part covers are EXCLUDED from a part\'s residual instead of',
  'charged to it, and hierarchy, so a child of a placed bone is searched over one hinge',
  'instead of four degrees of freedom:',
  '  rigc chainfit --candidate build/ --images parts/ --frame poseA.png',
  'Every residual is over the part\'s VISIBLE pixels and comes with the `visibleShare` it',
  'was computed on, so a mostly-hidden answer carries its own uncertainty. It grades',
  'nothing either: a part too far behind the others is refused by the visibility floor,',
  'a limb with no trusted part on it or above it is refused `no-anchor`, and two hinge',
  'answers that explain the picture equally well are both reported. See',
  '`rigc chainfit --help`.',
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
  else if (command === 'bonedist') cmdBoneDist(flags);
  else if (command === 'render') cmdRender(flags);
  else if (command === 'preview') cmdPreview(flags);
  else if (command === 'pose') cmdPose(flags);
  else if (command === 'chainfit') cmdChainFit(flags);
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
  if (err instanceof BoneDistError) {
    console.error(`rigc bonedist error: ${err.message}`);
    process.exit(1);
  }
  // Like a usage error in kind — a missing directory, an unreadable frame — but
  // its messages name a path and a reason, and reprinting the whole usage under
  // them buries that.
  if (err instanceof PoseError) {
    console.error(`rigc pose: ${err.message}`);
    process.exit(2);
  }
  // Same kind as a PoseError, and printed the same way for the same reason: the
  // messages name a path, a bone or an attachment, and reprinting the whole
  // usage under them buries the one line that says what to change.
  if (err instanceof ChainFitError) {
    console.error(`rigc chainfit: ${err.message}`);
    process.exit(2);
  }
  throw err;
}
