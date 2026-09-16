/**
 * Does the PUBLISHED PACKAGE build a rig on a machine that has never seen this
 * repository?
 *
 *     bun run smoke                      the whole battery, on this tree's tarball
 *     bun run smoke -- --case clean      just the green one
 *     bun run smoke -- --source registry --version 0.21.0
 *
 * Four exit codes, because a caller has to be able to tell the outcomes apart
 * without reading prose: **0** every case passed, **1** a case went red —
 * against `--source registry`, the published artifact does not build — **2**
 * nothing ran at all, and **3** the registry never served the version inside
 * `--wait`, which says nothing about the package. See *The wait* below.
 *
 * Nothing else in this repository asks that question. `prepublishOnly` gates the
 * SOURCE TREE, the `ships` job in `ci.yml` reads packed PATH LISTS, `CUR16` reads
 * the relative imports of shipped modules, and `release.yml` publishes and never
 * installs. Each of those is a fact about a list; this is the fact about a
 * program — `npm pack`, `npm install` into an empty directory, and a real build:
 * compile, the round trip through `spine-core`, and files on disk.
 *
 * 🔒 **Nothing under this repository is on the fixture's path at run time.** The
 * rig spec, the motion spec and the plate generator below are authored as text
 * into the install directory, and the generator imports `spine-rigc/tools/plate.ts`
 * as a BARE specifier, so it resolves inside the install or not at all —
 * `SMOKE_FIXTURE_CAME_FROM_THE_PACKAGE` prints the path it resolved to and
 * refuses one that is not under the install. The only thing that crosses from the
 * checkout is the tarball this script packed out of it, which is the subject.
 *
 * 🌱 **The plants are part of the tool, not a story in a pull request.** A smoke
 * that has never been seen to fail proves that a program ran, not that a program
 * was checked, so three of the five cases rebuild the tarball from a PATCHED COPY
 * of the extracted package — an allowlist entry removed, a module removed, a
 * dependency removed — and INVERT the verdict: such a case is green only when the
 * smoke went red at the step it was supposed to, naming the module that went
 * missing. The worktree is never patched; the patch is applied to the extraction
 * and packed from there, and a plant that removed nothing is itself a fault.
 *
 * ## The wait, and the two outcomes it separates (issue #563)
 *
 * ⏳ A publish returns before the registry serves what it published, and npm
 * says so on the way out: *"Your package is being processed and may take a few
 * minutes to become available."* That notice is the only statement of the
 * window anybody has, and it has no upper bound in it, so `--wait <minutes>`
 * keeps asking — 5 s, 10 s, 20 s, then every 30 s — and prints how long it has
 * been asking. The default is 15 minutes against three cuts measured between a
 * publish step returning and the version entering the registry's own packument
 * (`time[version]`): 4 min 11 s, 2 min 07 s and 2 min 38 s, all on 2026-09-16.
 * RELEASING.md carries those figures and their sources.
 *
 * 🚨 **Not-yet-served and served-and-broken are different facts and they do not
 * print the same red.** A version the registry has not finished processing says
 * nothing at all about the package: that is exit **3** and a message saying the
 * confirmation was not taken. Only a case going red on an artifact the registry
 * did serve is exit **1** and *the published artifact does not build*. The first
 * real run of the confirmation step went red on a cut that was fine, because a
 * 60-second wait ended in `npm view`'s raw `E404` and nothing said which of the
 * two had happened.
 *
 * What it cannot see, stated so nothing reads more into a green run than is
 * there: it does not run the published artifact unless `--source registry` asks
 * it to (the tarball this tree packs is not the tarball npm serves until a
 * publish makes it one), it says nothing about how the rig LOOKS — `rigc check`
 * is that instrument — and it is one platform's answer, the runner's. ⚠️ The
 * wait's probe is `npm view <spec> version`, which is the registry answering
 * about its packument and not about the tarball: a version whose metadata is
 * served before its tarball is would be read here as an artifact that does not
 * build rather than as one still arriving. The probe is `--prefer-online` for
 * the neighbouring reason — npm caches a packument, a negative answer
 * included, and a poll reading its own earlier 404 back would wait out the
 * whole ceiling on a package that had already arrived.
 *
 * ## Why `scripts/` and not `tools/`
 *
 * It does not ship: it runs from a checkout, in CI and from `bun run smoke`, and
 * `scripts/fetch-examples.sh` is the standing example of exactly that. Both
 * directories are inside `bun run typecheck` — `tsconfig.json`'s `include` names
 * every `.ts` under `scripts/` as well as under `tools/` — and inside `bun run
 * lint`, so neither placement escapes a gate. But `tools/` is inside one more,
 * and being inside it is a cost rather than a benefit: `CUR18` asks whether every
 * declared spec key is named by code somewhere outside its own declaration, and
 * its population is `cli.ts`, `src/` and `tools/`. This file embeds a rig spec
 * and a motion spec, so measured against that population it names **56 of the
 * 182 declared keys** for a reason that has nothing to do with anything reading
 * them. Under `tools/` it would dilute a gate by a third of its subject; under
 * `scripts/` it is read by no gate whose population it can weaken.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository this script packs — it is the subject, and nothing else reaches the fixture. */
const ROOT = resolve(import.meta.dir, '..');

// ---------------------------------------------------------------------------
// The fixture, authored here because the package carries no art and no spec
// ---------------------------------------------------------------------------
//
// `gallery/`, `fixtures/` and `examples/` are outside `files`, so an installed
// package has nothing to build. What it does have is `tools/plate.ts`, which
// writes a PNG with a true size and a true alpha channel — the same choice
// `fixtures/public.ts` makes for the selftest, and the reason the plates below
// are checkerboards and capsules rather than anything anybody could mistake for
// art. No claim about seams, blending or appearance can come from them.
//
// The rig is the smallest one that makes the round trip non-trivial: a four-deep
// bone chain (root -> hip -> torso -> arm -> hand), three region attachments, one
// contour MESH built from a plate's own silhouette, and one animation whose two
// rotate timelines carry a named easing, so `A05_CURVE_ARRAY_LENGTH` reads a
// bezier rather than a constant. Every part carries transparent margin because
// `A19_OVERLAY_PNGS_HAVE_ALPHA` refuses an opaque overlay — the gate wrote this
// paragraph, not a preference.

const PLATE_SOURCE = `import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Plate, type RGBA } from 'spine-rigc/tools/plate.ts';

// \`fileURLToPath\` and not \`new URL(...).pathname\`: a URL's path is
// percent-encoded, so the gallery's own idiom writes into a directory literally
// named \`install%20smoke\` the moment the install path has a space in it. The
// unusual-path case is what found that, which is the whole reason it is a case.
const HERE = fileURLToPath(new URL('.', import.meta.url));
const OUT = join(HERE, 'parts');
mkdirSync(OUT, { recursive: true });

const INK: RGBA = [34, 38, 48, 255];
const PALE: RGBA = [214, 220, 232, 255];
const WARM: RGBA = [206, 132, 72, 255];

const stage = new Plate(256, 256);
for (let y = 0; y < 256; y += 32) {
  for (let x = 0; x < 256; x += 32) {
    const dark = (x / 32 + y / 32) % 2 === 0;
    stage.rect(x, y, 32, 32, dark ? [58, 64, 80, 255] : [78, 86, 106, 255]);
  }
}
stage.frame(0, 0, 256, 256, 2, PALE);
stage.textCentred('PLACEHOLDER', 128, 120, 2, PALE);
stage.writePng(join(OUT, 'stage.png'));

const torso = new Plate(48, 64);
torso.disc(24, 16, 16, PALE);
torso.disc(24, 48, 16, PALE);
torso.rect(8, 16, 32, 32, PALE);
torso.textCentred('TORSO', 24, 28, 1, INK);
torso.writePng(join(OUT, 'torso.png'));

const arm = new Plate(20, 48);
arm.disc(10, 10, 9, WARM);
arm.disc(10, 38, 9, WARM);
arm.rect(1, 10, 18, 28, WARM);
arm.writePng(join(OUT, 'arm.png'));

const flag = new Plate(56, 40);
flag.disc(18, 20, 15, WARM);
flag.disc(38, 20, 15, WARM);
flag.rect(18, 5, 20, 30, WARM);
flag.writePng(join(OUT, 'flag.png'));

console.log('RESOLVED ' + import.meta.resolve('spine-rigc/tools/plate.ts'));
console.log('PLATES ' + OUT);
`;

const RIG_SPEC = {
  spec: 'rigc-rig/1',
  name: 'install_smoke',
  note: 'Authored by scripts/install_smoke.ts into an install directory. Synthetic plates; no claim about appearance comes from it.',
  images: 'parts',
  skeleton: { x: 0, y: 0, width: 256, height: 256 },
  invariants: { meshSlots: 1, meshTriangles: 96 },
  bones: [
    { name: 'root' },
    { name: 'hip', parent: 'root', x: 128, y: 64 },
    { name: 'torso', parent: 'hip', x: 0, y: 0, length: 64 },
    { name: 'arm', parent: 'torso', x: 0, y: 56, rotation: -20, length: 48 },
    { name: 'hand', parent: 'arm', x: 48, y: 0, length: 28 },
  ],
  slots: [
    { name: 'stage', bone: 'root', attachment: 'stage' },
    { name: 'torso', bone: 'torso', attachment: 'torso' },
    { name: 'arm', bone: 'arm', attachment: 'arm' },
    { name: 'flag', bone: 'hand', attachment: 'flag' },
  ],
  skins: {
    default: {
      stage: { stage: { image: 'stage.png', x: 128, y: 128 } },
      torso: { torso: { image: 'torso.png', y: 32 } },
      arm: { arm: { image: 'arm.png', x: 24, rotation: 90 } },
      flag: {
        flag: {
          type: 'mesh',
          image: 'flag.png',
          generator: { kind: 'contour', tolerance: 0.9, margin: 1.2, maxVertices: 96, alpha: 60 },
        },
      },
    },
  },
};

const MOTION_SPEC = {
  spec: 'rigc-motion/1',
  archetype: 'install_smoke',
  cut: 'install-smoke',
  easings: { settle: [0.28, 0, 0.36, 1] },
  animations: {
    wave: {
      duration: 1,
      loop: true,
      note: 'Two rotate timelines under a named easing, so the emitted curve arrays are beziers and not a pair of constants.',
      tracks: [
        {
          bone: 'arm',
          property: 'rotate',
          keys: [
            { t: 0, v: [0], ease: 'settle' },
            { t: 0.5, v: [18], ease: 'settle' },
            { t: 1, v: [0] },
          ],
        },
        {
          bone: 'hand',
          property: 'rotate',
          keys: [
            { t: 0, v: [0], ease: 'settle' },
            { t: 0.5, v: [-12], ease: 'settle' },
            { t: 1, v: [0] },
          ],
        },
      ],
    },
  },
};

/**
 * The plates the generator writes, and the size each one has to come back at.
 *
 * Read off the PNG header rather than off the file existing: a zero-byte file is
 * a file, and "the plate has a true size and a true alpha channel" is the only
 * thing that makes the build's measurements mean anything.
 */
const PLATES: Array<{ file: string; width: number; height: number }> = [
  { file: 'stage.png', width: 256, height: 256 },
  { file: 'torso.png', width: 48, height: 64 },
  { file: 'arm.png', width: 20, height: 48 },
  { file: 'flag.png', width: 56, height: 40 },
];

/**
 * The assertions this fixture makes the validator run, each named for the
 * feature that guarantees it.
 *
 * ⚠️ Not a count and not the whole list — a total would be a hand-kept number
 * that moves with every new rule, and "no FAIL line" is satisfied by a build
 * that asserted nothing at all. These six are the ones the fixture was built to
 * reach, so a run that does not print them measured something else.
 */
const REQUIRED_ASSERTIONS: Array<[string, string]> = [
  ['A00_ROUNDTRIP_PARSE', 'the round trip through the installed @esotericsoftware/spine-core, which is the dependency under test'],
  ['A04_MESH_TRIANGLES_AND_ENCODING', 'the contour mesh on slot "flag"'],
  ['A05_CURVE_ARRAY_LENGTH', "the two rotate timelines' named easing, emitted as bezier curve arrays"],
  ['A06_ATLAS_PAGE_SIZE_MATCHES_PNG', 'the packed page, whose PNG the validator re-reads off disk'],
  ['A17_ATLAS_PAGE_FILES_EXIST', 'the atlas written beside the skeleton'],
  ['A18_DETERMINISTIC_EMIT', 'the second, independent compile the build runs to compare byte for byte'],
];

// ---------------------------------------------------------------------------
// Running things
// ---------------------------------------------------------------------------

interface Ran {
  status: number;
  out: string;
}

type Env = Record<string, string | undefined>;

function run(cmd: string, args: string[], cwd: string, env?: Env): Ran {
  const r = spawnSync(cmd, args, {
    cwd,
    env: env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = typeof r.stdout === 'string' ? r.stdout : '';
  const stderr = typeof r.stderr === 'string' ? r.stderr : '';
  const failed = r.error === undefined ? '' : `\n${r.error.message}`;
  return { status: typeof r.status === 'number' ? r.status : 1, out: `${stdout}${stderr}${failed}` };
}

/** Where a command lives, or null — used to say "bun is not on PATH" by name rather than as a stack trace. */
function onPath(cmd: string): string | null {
  const r = spawnSync('command', ['-v', cmd], { encoding: 'utf8', shell: true });
  const found = typeof r.stdout === 'string' ? r.stdout.trim() : '';
  return found === '' ? null : found;
}

/** Width, height and colour type out of a PNG's first 26 bytes, or null if those bytes are not a PNG header. */
function pngHeader(path: string): { width: number; height: number; colourType: number } | null {
  const buf = readFileSync(path);
  if (buf.length < 26) return null;
  const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < SIGNATURE.length; i++) if (buf[i] !== SIGNATURE[i]) return null;
  if (buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colourType: buf[25] };
}

// ---------------------------------------------------------------------------
// The wait for the registry
// ---------------------------------------------------------------------------

/**
 * What this script exits with. They are the only machine-readable thing a
 * caller gets, and two of them exist because one number cannot carry two
 * facts — see *The wait* at the top of this file.
 */
const EXIT_GREEN = 0;
const EXIT_RED = 1;
const EXIT_NOTHING_RAN = 2;
const EXIT_NOT_SERVED = 3;

/** Minutes the registry is given to serve a version, when no `--wait` says otherwise. */
const DEFAULT_WAIT_MINUTES = 15;

/**
 * Sleep on this thread.
 *
 * The script is synchronous end to end — one case after another, each one a
 * `spawnSync` — and a poll is no reason to make it otherwise. `Atomics.wait` is
 * the sleep that needs no child process and no event loop.
 */
function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** `2m 37s`, so an elapsed time reads against the table in RELEASING.md without arithmetic. */
function elapsedText(ms: number): string {
  const whole = Math.round(ms / 1000);
  return `${Math.floor(whole / 60)}m ${String(whole % 60).padStart(2, '0')}s`;
}

/** How long to wait before the attempt after this one: 5 s, 10 s, 20 s, then 30 s for the rest of the wait. */
function backoffMs(attempt: number): number {
  return Math.min(5000 * 2 ** (attempt - 1), 30000);
}

interface RegistryWait {
  served: boolean;
  attempts: number;
  ms: number;
  /** The last thing npm said, so a network that is down is not reported as a version that is late. */
  last: string;
}

/**
 * Ask the registry for a version until it answers or the wait runs out.
 *
 * ⚠️ Every attempt is announced with its elapsed time. The step this replaced
 * printed six identical lines and then somebody else's `E404`, so a reader had
 * no way to tell a 60-second wait from a 6-minute one without reading the
 * timestamps in the log gutter.
 */
function waitForRegistry(spec: string, minutes: number, cwd: string): RegistryWait {
  const started = Date.now();
  const deadline = started + Math.round(minutes * 60_000);
  let attempts = 0;
  let last = '';
  for (;;) {
    attempts += 1;
    const asked = run('npm', ['view', spec, 'version', '--prefer-online'], cwd);
    if (asked.status === 0) return { served: true, attempts, ms: Date.now() - started, last: asked.out.trim() };
    // The line npm names the failure on, and not the last line it printed: the
    // last one is the path to a debug log, which says nothing about whether
    // this was a 404 or a network that is down.
    const said = asked.out
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !/A complete log of this run/.test(line));
    last = said.find((line) => /\berror code\b/.test(line)) ?? said[0] ?? '';
    const left = deadline - Date.now();
    if (left <= 0) return { served: false, attempts, ms: Date.now() - started, last };
    const nap = Math.min(backoffMs(attempts), left);
    console.log(
      `  the registry is not serving ${spec} yet — attempt ${attempts}, ${elapsedText(Date.now() - started)} into a ` +
        `${minutes} min wait; asking again in ${Math.round(nap / 1000)}s`,
    );
    sleepMs(nap);
  }
}

// ---------------------------------------------------------------------------
// The tarball, and the plants that patch a COPY of it
// ---------------------------------------------------------------------------

type Plant = 'none' | 'drop-plate' | 'drop-src-module' | 'drop-dependency';

/** The module each plant takes out of the package, and the step whose output has to name it. */
const PLANTED: Record<Exclude<Plant, 'none'>, { names: string[]; steps: string[]; what: string }> = {
  'drop-plate': {
    names: ['tools/plate.ts'],
    steps: ['fixture', 'build'],
    what: '`tools/plate.ts` removed from `files`, which is the allowlist hole CLAUDE.md describes: "A module added under `tools/` and left out of `files` still runs from a clone — the installed package is where it throws `Cannot find module`, on the command that needs it"',
  },
  'drop-src-module': {
    names: ['validate.ts'],
    steps: ['build'],
    what: '`src/validate.ts` removed from the packed tree. `files` names the `src` DIRECTORY, so a module leaves the package by leaving the tree rather than by leaving the array, and this is what that looks like from the install: the owner of the spine-core round trip is the module that goes missing',
  },
  'drop-dependency': {
    names: ['@esotericsoftware/spine-core'],
    steps: ['build'],
    what: '`@esotericsoftware/spine-core` removed from `dependencies`. The tree would not notice — a checkout installs it as a devDependency of nothing and it is already there — and the install is where the round trip has nothing to run',
  },
};

/**
 * A tarball to install, packed either out of this tree or downloaded from the
 * registry, and then — if a plant is asked for — extracted, patched and packed
 * again from the patched copy.
 *
 * 🔒 The patch never touches the worktree. `npm pack` writes into `work`, the
 * extraction is under `work`, and the second pack reads the extraction.
 */
function tarballFor(
  work: string,
  source: { kind: 'tree' } | { kind: 'registry'; spec: string },
  plant: Plant,
): { tgz: string; faults: string[]; packedPaths: number; evidence: string } {
  const faults: string[] = [];
  const packDir = join(work, 'pack');
  mkdirSync(packDir, { recursive: true });

  // `--prefer-online` on the registry arm for the wait's reason: the poll above
  // has just refreshed this packument, and a pack reading a cached copy of the
  // 404 it was polling through would fail on a version the registry is serving.
  const packed =
    source.kind === 'tree'
      ? run('npm', ['pack', ROOT, '--pack-destination', packDir, '--silent'], work)
      : run('npm', ['pack', source.spec, '--pack-destination', packDir, '--silent', '--prefer-online'], work);
  const tarballs = existsSync(packDir) ? readdirSync(packDir).filter((f) => f.endsWith('.tgz')) : [];
  if (packed.status !== 0 || tarballs.length !== 1) {
    faults.push(
      `SMOKE_PACK_WROTE_A_TARBALL: \`npm pack\` exited ${packed.status} and left ${tarballs.length} tarball(s) in ${packDir}; one was required. ${packed.out.trim()}`,
    );
    return { tgz: '', faults, packedPaths: 0, evidence: '' };
  }
  const first = join(packDir, tarballs[0]);
  const paths = tarPaths(first, work);
  if (plant === 'none') return { tgz: first, faults, packedPaths: paths.length, evidence: '' };

  // Extract, patch, pack again. `npm pack <dir>` reads that directory's own
  // package.json, so a `files` entry removed from the extraction is a file the
  // second tarball does not carry.
  const patchDir = join(work, 'patched');
  mkdirSync(patchDir, { recursive: true });
  const untar = run('tar', ['-xzf', first, '-C', patchDir], work);
  const pkgDir = join(patchDir, 'package');
  if (untar.status !== 0 || !existsSync(join(pkgDir, 'package.json'))) {
    faults.push(`SMOKE_PLANT_APPLIED: extracting ${first} left no package/package.json under ${patchDir}. ${untar.out.trim()}`);
    return { tgz: '', faults, packedPaths: 0, evidence: '' };
  }

  const pkgPath = join(pkgDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    files?: string[];
    dependencies?: Record<string, string>;
  };
  if (plant === 'drop-plate') {
    pkg.files = (pkg.files ?? []).filter((entry) => entry !== 'tools/plate.ts');
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } else if (plant === 'drop-dependency') {
    delete (pkg.dependencies ?? {})['@esotericsoftware/spine-core'];
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } else {
    const victim = join(pkgDir, 'src', 'validate.ts');
    if (!existsSync(victim)) {
      faults.push(`SMOKE_PLANT_APPLIED: src/validate.ts is not in the packed tree, so removing it plants nothing`);
      return { tgz: '', faults, packedPaths: 0, evidence: '' };
    }
    rmSync(victim);
  }

  const repackDir = join(work, 'repack');
  mkdirSync(repackDir, { recursive: true });
  const repacked = run('npm', ['pack', pkgDir, '--pack-destination', repackDir, '--silent'], work);
  const again = readdirSync(repackDir).filter((f) => f.endsWith('.tgz'));
  if (repacked.status !== 0 || again.length !== 1) {
    faults.push(`SMOKE_PLANT_APPLIED: re-packing the patched copy exited ${repacked.status} with ${again.length} tarball(s). ${repacked.out.trim()}`);
    return { tgz: '', faults, packedPaths: 0, evidence: '' };
  }
  const second = join(repackDir, again[0]);

  // 🚨 The control on the plant itself, read out of the TARBALL that will be
  // installed rather than out of the directory it was packed from. A plant that
  // removed nothing would let the case go green on a package that is still
  // whole, and the inverted verdict below would then be reporting that a correct
  // package fails.
  //
  // ⚠️ Two plants change the path list and one does not, so one clause cannot
  // serve both: `drop-dependency` leaves every path where it was and edits one
  // line inside `package.json`, and a clause written only for the first kind
  // would pass it by construction.
  const before = new Set(paths);
  const after = tarPaths(second, work);
  const gone = [...before].filter((p) => !after.includes(p));
  let evidence = '';
  if (plant === 'drop-dependency') {
    const shipped = run('tar', ['-xzOf', second, 'package/package.json'], work);
    const deps = shipped.status === 0 ? ((JSON.parse(shipped.out) as { dependencies?: Record<string, string> }).dependencies ?? {}) : {};
    if (shipped.status !== 0 || '@esotericsoftware/spine-core' in deps) {
      faults.push(
        `SMOKE_PLANT_APPLIED: the packed package.json still declares ${Object.keys(deps).join(', ') || '(unreadable)'}, so nothing was planted and a red below would be somebody else's fault`,
      );
    } else {
      evidence = `the packed package.json declares ${Object.keys(deps).length} dependenc(ies) where the tree declares 1`;
    }
  } else if (gone.length === 0) {
    faults.push(
      `SMOKE_PLANT_APPLIED: the plant "${plant}" left the packed path list unchanged at ${after.length} path(s), so nothing was planted and a red below would be somebody else's fault`,
    );
  } else {
    evidence = `the plant took ${gone.join(', ')} out of the pack`;
  }
  return { tgz: second, faults, packedPaths: after.length, evidence };
}

/** Make one directory under another and hand back its path. */
function mkdirIn(parent: string, name: string): string {
  const path = join(parent, name);
  mkdirSync(path, { recursive: true });
  return path;
}

/** The paths inside a tarball, as `tar -tzf` lists them, with the leading `package/` stripped. */
function tarPaths(tgz: string, cwd: string): string[] {
  const listed = run('tar', ['-tzf', tgz], cwd);
  if (listed.status !== 0) return [];
  return listed.out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.endsWith('/'))
    .map((line) => (line.startsWith('package/') ? line.slice('package/'.length) : line));
}

// ---------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------

interface CaseSpec {
  name: string;
  source: { kind: 'tree' } | { kind: 'registry'; spec: string };
  installer: 'npm' | 'bun';
  plant: Plant;
  /** A directory name for the install root, when the case is about the path itself. */
  dirName: string;
}

interface CaseResult {
  name: string;
  faults: string[];
  /** Which named step each fault came from, so a plant can require the red where it planted it. */
  steps: string[];
  notes: string[];
  output: string;
}

function runCase(spec: CaseSpec, work: string, keep: boolean): CaseResult {
  const faults: string[] = [];
  const steps: string[] = [];
  const notes: string[] = [];
  let output = '';
  const fault = (step: string, message: string): void => {
    faults.push(message);
    steps.push(step);
  };

  const built = tarballFor(work, spec.source, spec.plant);
  for (const f of built.faults) fault('pack', f);
  if (built.tgz === '') return { name: spec.name, faults, steps, notes, output };
  notes.push(`the tarball carries ${built.packedPaths} path(s)`);
  if (built.evidence !== '') notes.push(built.evidence);

  // An EMPTY directory with a package.json of its own, so npm resolves here and
  // does not walk up into whatever this temp directory happens to sit under.
  // `realpathSync` because a module specifier resolves through the real path:
  // on macOS this temp directory is reached as /var/… and reported as /private/var/…,
  // and the control below compares the two.
  const home = realpathSync(mkdirIn(work, spec.dirName));
  writeFileSync(join(home, 'package.json'), `${JSON.stringify({ name: 'rigc-install-smoke', private: true, version: '0.0.0' }, null, 2)}\n`);

  const install =
    spec.installer === 'npm'
      ? run('npm', ['install', built.tgz, '--no-audit', '--no-fund'], home)
      : run('bun', ['add', built.tgz], home);
  output += install.out;
  const pkgRoot = join(home, 'node_modules', 'spine-rigc');
  if (!existsSync(join(pkgRoot, 'package.json'))) {
    fault(
      'install',
      `SMOKE_INSTALL_EMPTY_DIR: ${spec.installer} install of ${built.tgz} exited ${install.status} and left no node_modules/spine-rigc/package.json under ${home}. ${install.out.trim().slice(0, 4000)}`,
    );
    if (!keep) rmSync(home, { recursive: true, force: true });
    return { name: spec.name, faults, steps, notes, output };
  }

  const bin = join(home, 'node_modules', '.bin', 'rigc');
  if (!existsSync(bin)) {
    fault('install', `SMOKE_INSTALL_EMPTY_DIR: the install wrote no node_modules/.bin/rigc under ${home}, so the package's own \`bin\` entry never reached a shim`);
  }

  // The dependency, by the version the installed package asks for rather than by
  // one written here: the emitted skeleton names it back, and those two have to
  // be the same fact.
  const corePkg = join(home, 'node_modules', '@esotericsoftware', 'spine-core', 'package.json');
  let coreVersion: string | null = null;
  if (existsSync(corePkg)) {
    coreVersion = (JSON.parse(readFileSync(corePkg, 'utf8')) as { version?: string }).version ?? null;
    notes.push(`@esotericsoftware/spine-core ${coreVersion ?? '(no version field)'} came down with it`);
  } else if (spec.plant !== 'drop-dependency') {
    fault('install', `SMOKE_INSTALL_EMPTY_DIR: the install left no node_modules/@esotericsoftware/spine-core, so no round trip can run`);
  }

  // The fixture: written here, generated by the package.
  writeFileSync(join(home, 'rig.json'), `${JSON.stringify(RIG_SPEC, null, 2)}\n`);
  writeFileSync(join(home, 'motion.json'), `${JSON.stringify(MOTION_SPEC, null, 2)}\n`);
  writeFileSync(join(home, 'make_plates.ts'), PLATE_SOURCE);

  const plates = run('bun', [join(home, 'make_plates.ts')], home);
  output += plates.out;
  if (plates.status !== 0) {
    fault('fixture', `SMOKE_FIXTURE_PLATES_FROM_THE_PACKAGE: \`bun make_plates.ts\` exited ${plates.status}. ${plates.out.trim().slice(0, 4000)}`);
  } else {
    const resolved = /^RESOLVED (.+)$/m.exec(plates.out)?.[1] ?? '';
    const asPath = resolved.startsWith('file://') ? fileURLToPath(resolved) : resolved;
    if (!asPath.startsWith(join(home, 'node_modules'))) {
      fault(
        'fixture',
        `SMOKE_FIXTURE_CAME_FROM_THE_PACKAGE: the generator resolved 'spine-rigc/tools/plate.ts' to ${asPath || '(nothing)'}, which is not under ${join(home, 'node_modules')} — so the plates were not made by the installed package`,
      );
    } else {
      notes.push(`the plate codec resolved to ${asPath.slice(home.length + 1)}`);
    }
    for (const plate of PLATES) {
      const path = join(home, 'parts', plate.file);
      if (!existsSync(path)) {
        fault('fixture', `SMOKE_FIXTURE_PLATES_FROM_THE_PACKAGE: ${plate.file} was not written`);
        continue;
      }
      const header = pngHeader(path);
      if (header === null) {
        fault('fixture', `SMOKE_FIXTURE_PLATES_FROM_THE_PACKAGE: ${plate.file} does not start with a PNG header`);
      } else if (header.width !== plate.width || header.height !== plate.height || header.colourType !== 6) {
        fault(
          'fixture',
          `SMOKE_FIXTURE_PLATES_FROM_THE_PACKAGE: ${plate.file} is ${header.width}x${header.height} colour type ${header.colourType}; ${plate.width}x${plate.height} colour type 6 (RGBA, straight alpha) was required`,
        );
      }
    }
  }

  // The build. Every flag is one a stranger would reach for: `--pack` writes a
  // real page PNG and validates the packed atlas as well as the loose one, and
  // `--profile spine-html` runs every rule the package has rather than the
  // twenty-seven the default profile keeps.
  const outDir = join(home, 'build');
  const build = run(bin, ['build', '--rig', 'rig.json', '--motion', 'motion.json', '--out', 'build', '--profile', 'spine-html', '--pack'], home);
  output += build.out;
  if (build.status !== 0) {
    fault('build', `SMOKE_BUILD_EXIT_0: \`node_modules/.bin/rigc build\` exited ${build.status}. ${build.out.trim().slice(0, 6000)}`);
  }

  const failLines = build.out.split('\n').filter((line) => /^\s*FAIL\s/.test(line));
  for (const line of failLines) fault('build', `SMOKE_BUILD_ASSERTIONS_PASSED: the build printed ${line.trim()}`);
  const passLines = build.out.split('\n').filter((line) => /^\s*PASS\s/.test(line)).length;
  if (build.status === 0 && passLines === 0) {
    fault('build', 'SMOKE_BUILD_ASSERTIONS_PASSED: the build exited 0 and printed no PASS line at all, so nothing was asserted and a green here means nothing');
  }
  if (build.status === 0) {
    notes.push(`${passLines} assertion(s) passed on the build`);
    for (const [name, why] of REQUIRED_ASSERTIONS) {
      if (!build.out.includes(name)) {
        fault('build', `SMOKE_BUILD_ASSERTIONS_PASSED: the build never printed ${name}, which this fixture reaches through ${why}`);
      }
    }
  }

  // The artifacts. A build that exits 0 and writes nothing is the failure this
  // repository names first — emit only after green, and the file on disk is what
  // outlives the console.
  const skeletonPath = join(outDir, 'skeleton.json');
  for (const file of ['skeleton.json', 'skeleton.atlas', 'skeleton.png']) {
    const path = join(outDir, file);
    if (!existsSync(path) || statSync(path).size === 0) {
      fault('artifacts', `SMOKE_ARTIFACTS_WRITTEN: ${file} is ${existsSync(path) ? 'empty' : 'missing'} in ${outDir}`);
    }
  }
  if (existsSync(skeletonPath) && statSync(skeletonPath).size > 0) {
    const skeleton = JSON.parse(readFileSync(skeletonPath, 'utf8')) as {
      skeleton?: { spine?: string };
      bones?: unknown[];
      animations?: Record<string, { bones?: Record<string, { rotate?: unknown[] }> }>;
      skins?: Array<{ attachments?: Record<string, Record<string, { type?: string }>> }>;
    };
    const bones = skeleton.bones?.length ?? 0;
    if (bones !== RIG_SPEC.bones.length) {
      fault('artifacts', `SMOKE_ARTIFACTS_WRITTEN: skeleton.json carries ${bones} bone(s) and the spec declares ${RIG_SPEC.bones.length}`);
    }
    const rotate = skeleton.animations?.wave?.bones?.arm?.rotate;
    if (!Array.isArray(rotate) || rotate.length === 0) {
      fault('artifacts', 'SMOKE_ARTIFACTS_WRITTEN: skeleton.json carries no rotate timeline for bone "arm" in animation "wave"');
    }
    const meshes = (skeleton.skins ?? []).flatMap((skin) =>
      Object.values(skin.attachments ?? {}).flatMap((slot) => Object.values(slot).filter((att) => att.type === 'mesh')),
    );
    if (meshes.length !== RIG_SPEC.invariants.meshSlots) {
      fault('artifacts', `SMOKE_ARTIFACTS_WRITTEN: skeleton.json carries ${meshes.length} mesh attachment(s) and the rig declares ${RIG_SPEC.invariants.meshSlots}`);
    }
    // 🔒 The emitted version against the dependency that was installed, rather
    // than against a number written here: those are the same fact, and a smoke
    // that states its own is checking itself.
    if (coreVersion !== null && skeleton.skeleton?.spine !== coreVersion) {
      fault(
        'artifacts',
        `SMOKE_ARTIFACTS_WRITTEN: skeleton.json says spine "${skeleton.skeleton?.spine ?? '(none)'}" and the installed @esotericsoftware/spine-core is ${coreVersion}`,
      );
    }
  }

  // Read it back with the installed CLI, which is the other half of the claim:
  // the package can validate what somebody else's build wrote.
  const validate = run(bin, ['validate', 'build', '--profile', 'spine-html'], home);
  output += validate.out;
  if (validate.status !== 0) {
    fault('validate', `SMOKE_VALIDATE_READS_BACK: \`node_modules/.bin/rigc validate build\` exited ${validate.status}. ${validate.out.trim().slice(0, 4000)}`);
  }

  // The shim's own promise, measured rather than assumed: with bun off PATH the
  // `bin` entry has to say so in one sentence instead of dying as `env: bun: No
  // such file or directory`.
  const bunPath = onPath('bun');
  if (bunPath === null) {
    notes.push('SKIP the without-bun control: bun is not on PATH in this run, which is the state it is about');
  } else {
    const bunDir = dirname(bunPath);
    const stripped = (process.env.PATH ?? '').split(delimiter).filter((part) => part !== bunDir);
    if (onPath('node') !== null && dirname(onPath('node') ?? '') === bunDir) {
      notes.push(`SKIP the without-bun control: node and bun share ${bunDir}, so removing it would remove the shim's own interpreter`);
    } else {
      const withoutBun = run(bin, ['--version'], home, { ...process.env, PATH: stripped.join(delimiter) });
      if (withoutBun.status === 0 || !/runs on Bun/.test(withoutBun.out)) {
        fault(
          'shim',
          `SMOKE_SHIM_NAMES_BUN_WHEN_BUN_IS_ABSENT: with ${bunDir} off PATH the shim exited ${withoutBun.status} saying ${JSON.stringify(withoutBun.out.trim().slice(0, 400))}; a non-zero exit naming Bun was required`,
        );
      } else {
        notes.push('with bun off PATH the shim names Bun and stops');
      }
    }
  }

  if (!keep) rmSync(home, { recursive: true, force: true });
  return { name: spec.name, faults, steps, notes, output };
}

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------

const HELP = `rigc install smoke — does the published package build a rig in an empty directory?

usage:
  bun run smoke                          every case below, on a tarball packed from this tree
  bun run smoke -- --case clean          one case by name
  bun run smoke -- --source registry --version 0.21.0
  bun run smoke -- --source registry --version 0.21.0 --wait 15
  bun run smoke -- --installer bun       install the tarball with \`bun add\` instead of \`npm install\`
  bun run smoke -- --keep                leave the install directories where they are

--wait <minutes> is for \`--source registry\` and nothing else: a publish returns
before the registry serves what it published, so this is how long to keep asking
before giving up. Default ${DEFAULT_WAIT_MINUTES}; \`--wait 0\` asks once and does not sleep.

exit codes:
  0  every case passed
  1  a case went red — against \`--source registry\`, the published artifact does not build
  2  no case ran, so this run measured nothing
  3  the registry did not serve the version within --wait, so the confirmation was NOT taken;
     nothing here says the package is broken

cases:
  clean          a correct package installs and builds, and the bin shim names Bun when bun is absent
  unusual-path   the same, installed at an absolute path with spaces and non-ASCII in it
  drop-plate     tools/plate.ts out of \`files\`  — the smoke has to go RED naming it
  drop-src-module  src/validate.ts out of the packed tree — the smoke has to go RED naming it
  drop-dependency  @esotericsoftware/spine-core out of \`dependencies\` — the smoke has to go RED naming it

A plant case is green when the smoke failed the way the plant says it must, and
red when the smoke passed anyway. Nothing is written inside the repository.
`;

function main(): number {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const flag = (name: string): string | null => {
    const at = argv.indexOf(`--${name}`);
    return at === -1 || at === argv.length - 1 ? null : argv[at + 1];
  };
  const keep = argv.includes('--keep');
  const only = flag('case');
  const installer = flag('installer') === 'bun' ? 'bun' : 'npm';
  const sourceKind = flag('source') === 'registry' ? 'registry' : 'tree';
  const version = flag('version');
  const pkgVersion = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version?: string }).version ?? '';
  const wanted = version ?? pkgVersion;
  const source: { kind: 'tree' } | { kind: 'registry'; spec: string } =
    sourceKind === 'registry' ? { kind: 'registry', spec: `spine-rigc@${wanted}` } : { kind: 'tree' };

  // A flag that quietly does nothing is worse than one that is refused: a
  // `--wait` on a tarball this tree packs would read as a wait that was taken.
  const waitFlag = flag('wait');
  const waitMinutes = waitFlag === null ? DEFAULT_WAIT_MINUTES : Number(waitFlag);
  if (waitFlag !== null && sourceKind !== 'registry') {
    console.log(
      '  FAIL  SMOKE_WAIT_IS_MINUTES_ON_THE_REGISTRY_PATH: --wait is for `--source registry`. A tarball packed from ' +
        'this tree is on disk the moment `npm pack` returns, so there is nothing here to wait for',
    );
    return EXIT_RED;
  }
  if (!Number.isFinite(waitMinutes) || waitMinutes < 0) {
    console.log(`  FAIL  SMOKE_WAIT_IS_MINUTES_ON_THE_REGISTRY_PATH: --wait ${JSON.stringify(waitFlag)} is not a number of minutes`);
    return EXIT_RED;
  }

  console.log(`rigc install smoke — ${source.kind === 'tree' ? `a tarball packed from ${ROOT}` : `${source.spec} from the registry`}, installed with ${installer}`);

  for (const tool of ['npm', 'bun', 'tar']) {
    if (onPath(tool) === null) {
      console.log(`  FAIL  SMOKE_PREREQ_TOOLS_ON_PATH: \`${tool}\` is not on PATH, and this smoke installs and runs a package that needs it`);
      return EXIT_RED;
    }
  }

  // ⏳ The first of the two outcomes issue #563 separates. A version the
  // registry has not finished processing is not a package that fails to build,
  // and the two must not end in the same red — so this returns its own exit
  // code, names what was not taken, and says how to take it later.
  const registrySpec = source.kind === 'registry' ? source.spec : null;
  let served: RegistryWait | null = null;
  if (registrySpec !== null) {
    served = waitForRegistry(registrySpec, waitMinutes, ROOT);
    const byHand = `bun run smoke -- --source registry --version ${wanted} --case clean`;
    if (!served.served) {
      console.log(
        `  FAIL  SMOKE_REGISTRY_SERVED_THE_VERSION: the registry did not serve ${registrySpec} within ${waitMinutes} min ` +
          `(${served.attempts} attempt(s), ${elapsedText(served.ms)}) — the confirmation was NOT taken, and nothing here ` +
          'says the package is broken. npm\'s own notice on publish is "Your package is being processed and may take a ' +
          'few minutes to become available". Re-run the confirmation (Actions -> release -> Run workflow, version ' +
          `${wanted}) or take it by hand once the registry answers: ${byHand}` +
          (served.last === '' ? '' : `. The last thing npm said was: ${served.last}`),
      );
      console.log(`rigc install smoke: the registry did not serve ${registrySpec} — confirmation NOT taken`);
      return EXIT_NOT_SERVED;
    }
    console.log(
      `  the registry served ${registrySpec} on attempt ${served.attempts}, ${elapsedText(served.ms)} after this run ` +
        'started asking',
    );
  }

  const battery: CaseSpec[] = [
    { name: 'clean', source, installer, plant: 'none', dirName: 'empty' },
    // The negative control the card asks for: a CORRECT package at a path
    // nothing in the tree has ever seen, so a pass here is not a pass about
    // this machine's tidy temp directory.
    { name: 'unusual-path', source, installer, plant: 'none', dirName: 'install smoke ünïcode 한글' },
    { name: 'drop-plate', source, installer, plant: 'drop-plate', dirName: 'planted-plate' },
    { name: 'drop-src-module', source, installer, plant: 'drop-src-module', dirName: 'planted-src' },
    { name: 'drop-dependency', source, installer, plant: 'drop-dependency', dirName: 'planted-dep' },
  ];
  const chosen = only === null ? battery : battery.filter((c) => c.name === only);
  if (chosen.length === 0) {
    console.log(`  FAIL  SMOKE_PREREQ_TOOLS_ON_PATH: no case is named "${only}" — ${battery.map((c) => c.name).join(', ')}`);
    return EXIT_RED;
  }

  let bad = 0;
  let ran = 0;
  for (const spec of chosen) {
    const work = mkdtempSync(join(tmpdir(), 'rigc-smoke-'));
    try {
      const result = runCase(spec, work, keep);
      ran += 1;
      const planted = spec.plant === 'none' ? null : PLANTED[spec.plant];
      if (planted === null) {
        if (result.faults.length === 0) {
          console.log(`  PASS  SMOKE_CASE[${spec.name}]  ${result.notes.join('; ')}`);
        } else {
          bad += 1;
          console.log(`  FAIL  SMOKE_CASE[${spec.name}]`);
          for (const f of result.faults) console.log(`          ${f}`);
        }
      } else {
        // 🌱 Inverted: the plant is green when the smoke went red where it said
        // it would, naming what went missing.
        const missed: string[] = [];
        if (result.faults.length === 0) missed.push('the smoke passed on a package the plant broke');
        for (const step of planted.steps) {
          if (!result.steps.includes(step)) missed.push(`no fault came from the ${step} step, where this plant has to bite`);
        }
        const said = `${result.faults.join('\n')}\n${result.output}`;
        for (const name of planted.names) {
          if (!said.includes(name)) missed.push(`nothing in the run named ${name}, so the failure does not say what is missing`);
        }
        if (missed.length === 0) {
          console.log(`  PASS  SMOKE_PLANT[${spec.name}]  ${planted.what}`);
          for (const note of result.notes) console.log(`          ${note}`);
          for (const f of result.faults.slice(0, 2)) console.log(`          red: ${f.split('\n')[0].slice(0, 300)}`);
        } else {
          bad += 1;
          console.log(`  FAIL  SMOKE_PLANT[${spec.name}]`);
          for (const m of missed) console.log(`          ${m}`);
        }
      }
    } finally {
      if (!keep) rmSync(work, { recursive: true, force: true });
      else console.log(`          kept: ${work}`);
    }
  }

  // 🚨 The floor. A run that installed nothing and printed a tidy summary is the
  // shape of false green this whole repository is written against.
  if (ran === 0) {
    console.log('  FAIL  SMOKE_PREREQ_TOOLS_ON_PATH: no case ran, so this run measured nothing');
    return EXIT_NOTHING_RAN;
  }
  console.log(bad === 0 ? `rigc install smoke: green — ${ran} case(s)` : `rigc install smoke: ${bad} of ${ran} case(s) failed`);
  if (bad === 0) return EXIT_GREEN;
  // 🚨 The second of the two outcomes, said out loud. Reaching here on a
  // registry source means the wait above ENDED — the registry answered for this
  // version — so what went red went red on the artifact people receive, and
  // calling that a propagation delay would be the #563 defect pointed the other
  // way.
  if (served !== null) {
    console.log(
      `the published artifact does not build: the registry served ${registrySpec} ${elapsedText(served.ms)} after this ` +
        `run started asking, and ${bad} of ${ran} case(s) above went red on it. ` +
        'This is a fault in what was published, not a wait that was too short',
    );
  }
  return EXIT_RED;
}

process.exit(main());
