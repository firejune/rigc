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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { checkAgainstFrames, checkLines, CheckError, type CheckOptions, type CheckReport } from './src/check.ts';
import { compile, CompileError, type CompileOptions } from './src/compile.ts';
import { diffLines, diffSkeletons, sectionFigures, type DiffReport } from './src/diff.ts';
import { findRung, RUNG_IDS, type RungSkeleton } from './src/ladder.ts';
import { DEFAULT_PROFILE, reportLines, validate, VALIDATE_PROFILES, type ValidateProfile } from './src/validate.ts';
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
// argument parsing
// ---------------------------------------------------------------------------

/**
 * The flags that are switches rather than `--flag value` pairs.
 *
 * Listed by name rather than inferred from "the next argument looks like a
 * flag": inferring it would turn `--out --json report.json` — a real typo, a
 * missing value — into a silently accepted switch plus a stray positional.
 */
const BOOLEAN_FLAGS = new Set(['all-frames']);

/** `--flag value` pairs plus the leftover positionals, in order. */
function parseArgs(argv: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else if (BOOLEAN_FLAGS.has(arg.slice(2))) {
        flags[arg.slice(2)] = 'true';
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) throw new UsageError(`${arg} needs a value`);
        flags[arg.slice(2)] = next;
        i++;
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

/**
 * Read a cuts.json and resolve its three paths against the file's own
 * directory. Anchoring on the table rather than on the process cwd is what lets
 * the same command work from anywhere in the owning project.
 */
function readCutTable(cutsPath: string): { dir: string; table: CutTable } {
  const abs = resolve(cutsPath);
  if (!existsSync(abs)) throw new UsageError(`no cuts file at ${abs}`);
  const parsed: unknown = JSON.parse(readFileSync(abs, 'utf8'));
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
 * Read `--profile`, defaulting to the profile every caller had before the flag
 * existed. An unknown name is a usage error rather than a silent fallback: the
 * fallback would be `spine-html`, so a typo would quietly re-apply the strictest
 * rulebook to data the caller was trying to exempt.
 */
function readProfile(flags: Record<string, string>): ValidateProfile {
  const raw = flags.profile;
  if (raw === undefined) return DEFAULT_PROFILE;
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
  writeFileSync(join(opts.outDir, 'skeleton.json'), result.skeletonText);
  writeFileSync(join(opts.outDir, 'skeleton.atlas'), result.atlasText);
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
  const report = diffSkeletons(
    JSON.parse(readFileSync(candidatePath, 'utf8')),
    JSON.parse(readFileSync(referencePath, 'utf8')),
  );
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
function readCheckFlags(flags: Record<string, string>): Pick<CheckOptions, 'fps' | 'viewport' | 'as'> {
  const out: Pick<CheckOptions, 'fps' | 'viewport' | 'as'> = {};
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

/**
 * bench — run one rung of the benchmark ladder against a candidate rig.
 *
 * Two questions, asked in this order and never merged:
 *
 *   1. Is the candidate valid Spine at all? That is `validate --profile spine`,
 *      and it is the only part with a pass/fail. `spine-html` is not the default
 *      here (it is everywhere else): the thing being reproduced is an editor
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

  // bench judges a reproduction of editor output, so `spine` is the default.
  const profile = flags.profile === undefined ? 'spine' : readProfile(flags);
  const exportDir = resolve(import.meta.dir, 'examples', rung.example, 'export');
  if (!existsSync(exportDir)) {
    throw new UsageError(
      `no example corpus at ${exportDir} — run \`bun run fetch-examples\` first (examples/ is gitignored, not shipped)`,
    );
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
    if (framing) {
      const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;
      const how = !framing.applied
        ? 'measured only — --viewport pinned'
        : framing.source === 'declared'
          ? `frames.json's own box, the candidate measured into it`
          : `fitted to the candidate's pixels, ${framing.passes} pass(es)${framing.settled ? '' : framing.cycled ? ', cycling' : ', unsettled'}`;
      console.log(
        `  framing    fit x${framing.fit.scale.toFixed(6)}  rms ${framing.fit.rms.toFixed(2)}px  union residual ` +
          `${signed(framing.fit.residualWidth)} x ${signed(framing.fit.residualHeight)}px  (${how})`,
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
      console.log(
        `  ${anim.dir.padEnd(10)} MAE mean=${anim.meanMae.toFixed(2)} worst=${anim.worstMae.toFixed(2)}  ` +
          `over ${anim.compared} frame(s)  ${drift}${change}`,
      );
    }
  } else {
    console.log('  check      not run — pass --frames <dir> to compare against the rendered reference frames.');
    console.log('             Without it this report says nothing about whether the ANIMATION is right.');
  }
  console.log('  Section figures are means of their own measures. There is no rung score:');
  console.log('  a rung is cleared by a person reading the measures, and docs/LADDER.md records it.');

  if (flags.json !== undefined) {
    writeJson(flags.json, {
      rung: rung.id,
      example: rung.example,
      gates: rung.gates,
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
  const result = compile(opts);
  const motion = JSON.parse(readFileSync(opts.motionPath, 'utf8')) as MotionSpec;

  console.log(`rigc explain ${label}`);
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

const USAGE = [
  'usage:',
  '  bun cli.ts build    --rig <path> --motion <path> --out <dir> [--manifest <path>] [--images <dir>]',
  '  bun cli.ts build    --cut <name> --cuts <cuts.json>',
  '  bun cli.ts explain  (same arguments as build)',
  '  bun cli.ts validate <dir | skeleton.json> [--atlas <path>]',
  '  bun cli.ts diff     <candidate.json> <reference.json> [--json <out>]',
  '  bun cli.ts check    --candidate <dir | skeleton.json> --frames <dir>',
  `  bun cli.ts bench    <${RUNG_IDS.join(' | ')}> --candidate <dir | skeleton.json> [--frames <dir>]`,
  '',
  'build and validate take --profile spine|spine-html (default spine-html):',
  '  spine       is this valid Spine 4.3 that any runtime plays correctly?',
  '  spine-html  the above, plus this project\'s renderer and archetype policy.',
  '',
  'check renders the candidate onto the reference frames\' own pixel grid, fitting it',
  'there by its own drawn pixels, and compares. It reads the frames and never the',
  'reference skeleton, so it belongs INSIDE an authoring loop — the validator cannot',
  'see a wrong animation and this can:',
  '  --frames <dir>        a rendered frame set (a skeleton root, or one animation dir)',
  '  --atlas <path>        the candidate\'s atlas, when it is not beside the skeleton',
  '  --fps <n>             only for a frame set with no frames.json sidecar',
  '  --viewport x,y,w,h    pin the candidate\'s world box, y up, instead of fitting it',
  '  --as <name>           the candidate animation to play, when it is named differently',
  '  --all-frames          print every frame, not just the worst by MAE',
  '  --json <out>          the whole per-frame, per-slot report',
  '',
  'a cuts.json is { "<name>": { "rig": "...", "motion": "...", "out": "...",',
  '                             "manifest": "..." (optional) } }, with every path',
  'resolved relative to the cuts.json file itself.',
].join('\n');

const [command, ...rest] = process.argv.slice(2);
try {
  const { flags, positional } = parseArgs(rest);
  if (command === 'build') cmdBuild(flags);
  else if (command === 'validate') cmdValidate(flags, positional);
  else if (command === 'explain') cmdExplain(flags);
  else if (command === 'diff') cmdDiff(flags, positional);
  else if (command === 'check') cmdCheck(flags);
  else if (command === 'bench') cmdBench(flags, positional);
  else {
    console.error(USAGE);
    process.exit(2);
  }
} catch (err) {
  if (err instanceof UsageError) {
    console.error(`rigc: ${err.message}\n\n${USAGE}`);
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
  throw err;
}
