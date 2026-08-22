#!/usr/bin/env bun
/**
 * rigc — the rig compiler.
 *
 *   bun cli.ts build --manifest <path> --motion <path> --out <dir>
 *   bun cli.ts build --cut <name> --cuts <cuts.json>
 *   bun cli.ts explain --manifest <path> --motion <path> --out <dir>
 *   bun cli.ts explain --cut <name> --cuts <cuts.json>
 *   bun cli.ts validate <dir>            re-run the gate on artifacts on disk
 *
 * `build` emits ONLY if validate is green. That ordering is the point: the
 * compiler is allowed to be wrong, it is not allowed to leave the wrong thing
 * on disk (plan 04 section 4-3 step 7).
 *
 * rigc knows nothing about any particular project. A cut is three paths, and a
 * `cuts.json` is a named table of them:
 *
 *   {
 *     "my_cut": { "manifest": "…/manifest.json", "motion": "…/my.motion.json",
 *                 "out": "…/spine" }
 *   }
 *
 * Its paths resolve against the cuts.json file itself, so the table travels
 * with the project that owns the art rather than with this repository.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { compile, CompileError, type CompileOptions } from './src/compile.ts';
import { diffLines, diffSkeletons } from './src/diff.ts';
import { DEFAULT_PROFILE, reportLines, validate, VALIDATE_PROFILES, type ValidateProfile } from './src/validate.ts';
import type { CompileResult, MotionSpec } from './src/types.ts';

/** One entry of a cuts.json: three paths, relative to the cuts.json file. */
export interface CutEntry {
  manifest: string;
  motion: string;
  out: string;
}

export type CutTable = Record<string, CutEntry>;

class UsageError extends Error {}

// ---------------------------------------------------------------------------
// argument parsing
// ---------------------------------------------------------------------------

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
  for (const key of ['manifest', 'motion', 'out'] as const) {
    if (typeof entry?.[key] !== 'string') throw new UsageError(`cut ${JSON.stringify(name)} has no "${key}" path`);
  }
  return {
    manifestPath: resolve(dir, entry.manifest),
    motionPath: resolve(dir, entry.motion),
    outDir: resolve(dir, entry.out),
  };
}

/**
 * Resolve the cut a command was pointed at, either spelled out on the command
 * line or looked up by name in a cuts.json.
 */
function resolveCut(flags: Record<string, string>): { label: string; opts: CompileOptions } {
  const explicit = flags.manifest !== undefined || flags.motion !== undefined || flags.out !== undefined;
  if (explicit) {
    if (flags.cut !== undefined || flags.cuts !== undefined) {
      throw new UsageError('--manifest/--motion/--out and --cut/--cuts are two ways to say the same thing; pick one');
    }
    for (const key of ['manifest', 'motion', 'out'] as const) {
      if (flags[key] === undefined) throw new UsageError(`--${key} is required when the cut is spelled out`);
    }
    return {
      label: flags.manifest,
      opts: { manifestPath: resolve(flags.manifest), motionPath: resolve(flags.motion), outDir: resolve(flags.out) },
    };
  }
  if (flags.cut === undefined) throw new UsageError('give either --cut <name> --cuts <cuts.json>, or --manifest/--motion/--out');
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
  const named = flags.cut !== undefined || flags.manifest !== undefined;
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
    const out = resolve(flags.json);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      `${JSON.stringify({ candidate: candidatePath, reference: referencePath, ...report }, null, 2)}\n`,
    );
    console.log(`rigc: wrote ${out}`);
  }
}

function cmdExplain(flags: Record<string, string>): void {
  const { label, opts } = resolveCut(flags);
  const result = compile(opts);
  const motion = JSON.parse(readFileSync(opts.motionPath, 'utf8')) as MotionSpec;

  console.log(`rigc explain ${label}`);
  console.log(`\nstage  ${result.skeleton.skeleton.width} x ${result.skeleton.skeleton.height}  (spine ${result.skeleton.skeleton.spine})`);

  console.log('\nbones  (crop y-down -> spine y-up, origin at the bottom-left of the crop)');
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
      for (const [timelineName, keys] of Object.entries(timelines)) {
        console.log(`    ${boneName}.${timelineName}  ${keys.length} key(s)  <- bone track (mesh tier)`);
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

  console.log('\nmix table (player config, not skeleton JSON — plan 02 section 4-5)');
  console.log(`  default=${motion.mix?.default ?? 0} pairs=${JSON.stringify(motion.mix?.pairs ?? [])}`);
}

const USAGE = [
  'usage:',
  '  bun cli.ts build    --manifest <path> --motion <path> --out <dir>',
  '  bun cli.ts build    --cut <name> --cuts <cuts.json>',
  '  bun cli.ts explain  (same arguments as build)',
  '  bun cli.ts validate <dir | skeleton.json> [--atlas <path>]',
  '  bun cli.ts diff     <candidate.json> <reference.json> [--json <out>]',
  '',
  'build and validate take --profile spine|spine-html (default spine-html):',
  '  spine       is this valid Spine 4.3 that any runtime plays correctly?',
  '  spine-html  the above, plus this project\'s renderer and archetype policy.',
  '',
  'a cuts.json is { "<name>": { "manifest": "...", "motion": "...", "out": "..." } },',
  'with every path resolved relative to the cuts.json file itself.',
].join('\n');

const [command, ...rest] = process.argv.slice(2);
try {
  const { flags, positional } = parseArgs(rest);
  if (command === 'build') cmdBuild(flags);
  else if (command === 'validate') cmdValidate(flags, positional);
  else if (command === 'explain') cmdExplain(flags);
  else if (command === 'diff') cmdDiff(flags, positional);
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
  throw err;
}
