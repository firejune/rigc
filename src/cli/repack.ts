/**
 * `rigc repack <build> --out <dir>` — a packed build repacked from its own
 * output, written only after the repack is shown to have lost nothing (issue
 * #1169).
 *
 * A consumer that keeps only `skeleton.json`, `skeleton.atlas` and the page
 * PNGs could not take up a packer improvement (`--page-edges free`,
 * `--pack-shape polygon`) without regenerating its parts upstream. The route
 * it measured by hand — cut each region off its page, `ingest --art loose`,
 * `build --pack` over the cut parts — is this command, in process and through
 * the tree's own functions: `liftAtlas` (`extractRegion` per region), `ingest`,
 * and `runBuild` with the entry's own gate, the body every `build` runs.
 *
 * 🔒 **Nothing reaches `--out` until three things have been shown**, and the
 * command prints each:
 *
 *   (a) every region lifted off the NEW pages is pixel-identical, by name, to
 *       the same region lifted off the input's pages (`regionDifferences`);
 *   (b) the rebuilt `skeleton.json` is byte-identical to the input's. A repack
 *       is entitled to change nothing in the skeleton: attachments name their
 *       regions and the atlas alone carries where a region sits, so the pack
 *       owns the atlas and the pages and none of the skeleton. Measured on the
 *       tree's recipes, every repack of a rigc build wrote the same bytes;
 *       a difference is refused naming the paths (`skeletonDifferences`);
 *   (c) the gate is green — `runBuild` returns only then, having gated the
 *       compile and the packed pair exactly as `build --pack` does.
 *
 * The build runs in a work directory of its own under `tmpdir()`
 * (`REPACK_WORK_PREFIX`), which also holds the lifted parts and the two specs;
 * the output is the build alone, the same four kinds of file `build --pack`
 * writes, so a repacked build can be repacked again. The directory is removed
 * when the command ends — green, refused, a gate that exits, or a throw —
 * from this function's `finally` and, for the `process.exit` inside
 * `runBuild` that no `finally` sees, from an `exit` listener. A process killed
 * by a signal runs neither and leaves its one directory.
 *
 * ⚠️ The lifted parts are not kept: the output is the input's shape, and the
 * parts are recoverable from it at any time by the same lift — keeping a
 * second copy of every texel beside the pages would be two records of one
 * thing that can disagree.
 */
import { parseAtlasText } from '../atlas.ts';
import { relativeImagesPath } from '../compile.ts';
import { ingest, INGEST_GUTTERS, IngestError, type IngestFinding, type IngestOptions, IngestSpecRefused, type IngestStage } from '../ingest.ts';
import { MODEL_DOCUMENT_FILE } from '../model.ts';
import { atlasRefusals, documentDisagreements, firstLineApart, type InputPage, liftAtlas, polygonOwnedTexels, regionDifferences, REPACK_WORK_PREFIX, RepackError, skeletonDifferences } from '../repack.ts';
import {
  type BuildGate,
  type CommandArgs,
  documentStageBeside,
  modelTextBeside,
  parseJsonNamed,
  readIntFlag,
  readPackShape,
  readPageEdges,
  readProfile,
  readSkeletonText,
  readVersion,
  resolveBuild,
  runBuild,
  UsageError,
} from './shared.ts';
import { DEFAULT_PADDING, DEFAULT_PAGE_SIZE } from '../atlas.ts';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

/** The flags `repack` takes: the packing flags `build --pack` takes, the gate's profile, the atlas when it is not beside the skeleton, the stage `ingest` takes, and `--out`. */
/**
 * The switch that writes a rebuild whose skeleton differs from the input's
 * (issue #1169's follow-up). Default off: check (b) refuses a difference, and
 * the refusal names this flag. A general acceptance rather than a switch for one
 * field, because the command cannot know WHY a skeleton differs — only where —
 * and every path is printed when it is accepted.
 */
export const ACCEPT_FLAG = 'accept-skeleton-differences';

export const REPACK_FLAGS = ['out', 'atlas', 'page-size', 'padding', 'page-edges', 'pack-shape', 'profile', 'stage', ACCEPT_FLAG] as const;

/** `build`'s flags that `repack` does not take, and why — each refused by name rather than ignored. */
const BUILD_FLAGS_REFUSED: Readonly<Record<string, string>> = {
  rig: 'repack reads the rig back out of the skeleton (ingest); it takes no rig spec',
  motion: 'repack reads the motion back out of the skeleton (ingest); it takes no motion spec',
  manifest: 'repack lifts the parts off the pages; it takes no cut manifest',
  images: 'repack lifts the parts off the pages the atlas names; it takes no parts directory',
  'copy-images': 'repack always writes self-contained pages into --out, which is what packing is',
  pack: 'repack always packs; the flag would say nothing',
  'atlas-in': 'repack MAKES a new pack out of the regions of the old one; --atlas-in would keep the old pack — pass the build itself',
  cut: 'repack takes a build directory, not a cut',
  cuts: 'repack takes a build directory, not a cuts table',
};

/** The three files besides the pages that every repacked build is, in the order `runBuild` writes them. */
const BUILD_TEXTS = ['skeleton.json', 'skeleton.atlas', MODEL_DOCUMENT_FILE] as const;

/**
 * A hook between the lift and the build, given the directory the parts were
 * lifted into — the selftest's plant (`RPK`), which alters a lifted part to
 * show check (a) refusing before anything is written. Nothing else passes one.
 */
export type RepackPlant = (liftDir: string) => void;

/** How every gate's closing line opens (`BuildGate.look`), which a staged build drops. */
const LOOK_LINE = 'rigc: look at it: ';

/** How many skeleton differences a refusal lists before it says how many more there are. */
const SKELETON_DIFFERENCES_SHOWN = 8;

/** `--stage x,y,w,h`, read as `ingest` reads it. */
function readStageFlag(raw: string | undefined): IngestStage | undefined {
  if (raw === undefined) return undefined;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) throw new UsageError(`--stage is ${JSON.stringify(raw)}; give four numbers, x,y,width,height`);
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/** Every flag given that `repack` does not take, refused by name. */
function refuseForeignFlags(flags: Record<string, string>): void {
  const taken = new Set<string>([...REPACK_FLAGS, 'help']);
  for (const name of Object.keys(flags).sort()) {
    if (taken.has(name)) continue;
    const why = BUILD_FLAGS_REFUSED[name];
    throw new UsageError(why === undefined ? `repack takes no --${name}; it takes --${REPACK_FLAGS.join(', --')}` : `repack takes no --${name}: ${why}`);
  }
}

/** `--out`: required, and absent or an empty directory — refused by name otherwise, before anything is read. */
function readOut(flags: Record<string, string>): string {
  if (flags.out === undefined) throw new UsageError('repack needs --out <dir> — the directory the repacked build is written into');
  const out = resolve(flags.out);
  if (existsSync(out)) {
    if (!statSync(out).isDirectory()) throw new RepackError(`--out ${out} is a file; it takes a directory, absent or empty — nothing was written`, 2);
    const held = readdirSync(out).sort();
    if (held.length > 0) {
      throw new RepackError(
        `--out ${out} is not empty (${held.slice(0, 4).join(', ')}${held.length > 4 ? `, … ${held.length} entries` : ''}) — a page an earlier pack wrote and this one does not ` +
          'would stay beside the new atlas with nothing naming it, so repack writes only into an absent or empty directory; nothing was written',
        2,
      );
    }
  }
  return out;
}

/**
 * The one place `repack` calls `ingest`'s options: the skeleton read back with
 * `--art loose` (an `image` per attachment, named after the region it draws,
 * which is the file the lift wrote), the parts directory spelled from the
 * specs, and the stage by `ingest`'s own rules — a caller's `--stage`, else
 * the model document beside the skeleton when it is this skeleton's, else the
 * header. A new `ingest` option goes in here and nowhere else.
 */
function ingestOptionsFor(skeletonPath: string, specsDir: string, liftDir: string, stage: IngestStage | undefined, documentStage: IngestStage | null | undefined): IngestOptions {
  return {
    ...(documentStage === undefined ? {} : { documentStage }),
    name: basename(skeletonPath, '.json'),
    art: 'loose',
    images: relativeImagesPath(specsDir, liftDir),
    stage,
    source: basename(skeletonPath),
    version: readVersion(),
  };
}

/** The stage line: the box the rebuild declares and where it came from (issue #1169's step 6). */
function stageLine(rig: { skeleton?: { x?: number | null; y?: number | null; width?: number | null; height?: number | null } }, flagged: boolean, documentStage: IngestStage | null | undefined): string {
  const head = rig.skeleton;
  const box =
    head !== undefined && typeof head.width === 'number' && typeof head.height === 'number'
      ? `${head.width} x ${head.height} at ${head.x ?? 0},${head.y ?? 0}`
      : 'none';
  const why = flagged
    ? '— from --stage, which ingest takes only for a skeleton that states no box'
    : documentStage !== undefined
      ? `— read from the ${MODEL_DOCUMENT_FILE} beside it (its spine.sha256 is this skeleton's)${documentStage === null ? ', which states the rig declared none' : ''}`
      : box === 'none'
        ? `— the skeleton's header states no box and no ${MODEL_DOCUMENT_FILE} of this skeleton is beside it`
        : `— read from the skeleton's header box: no ${MODEL_DOCUMENT_FILE} of this skeleton is beside it, and which box it is depends on the rigc that wrote it — on a build written before 2.2.0 it is the stage itself, on one written since it is the setup-pose bounding box, not the stage the rig declared, and nothing in the skeleton says which; keep ${MODEL_DOCUMENT_FILE} beside the pair to carry the stage`;
  return `  ..    stage  ${box} ${why}. skeleton.json is held byte-identical below whatever it is; ${MODEL_DOCUMENT_FILE}'s stage, and the stage rules on the rebuild, read it`;
}

/** The findings `ingest` reported, in its own format, blockers first. */
function findingLines(findings: readonly IngestFinding[]): string[] {
  const width = Math.max(...Object.values(INGEST_GUTTERS).map((gutter) => gutter.length));
  const lines: string[] = [];
  for (const kind of ['blocker', 'judgement', 'lossy'] as const) {
    for (const f of findings.filter((x) => x.kind === kind)) lines.push(`  ${INGEST_GUTTERS[kind].padEnd(width)} ${f.code}: ${f.where} — ${f.detail}`);
  }
  return lines;
}

/**
 * `runBuild` with its two closing lines restated for a build that is staged:
 * `rigc: wrote <work>/…` becomes `staged <work>/…`, and the `look at it` line
 * is dropped — the work directory is removed when the command ends, and
 * `repack` names `--out` itself once it has written there. Every other line is
 * printed as it comes, so a gate that exits mid-way loses none.
 */
function stagedBuild(flags: Record<string, string>, gate: BuildGate): void {
  const print = console.log;
  console.log = (...args: unknown[]): void => {
    const line = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
    if (line.startsWith('rigc: wrote ')) print(`  ..    staged ${line.slice('rigc: wrote '.length)}`);
    else if (!line.startsWith(LOOK_LINE)) print(...args);
  };
  try {
    runBuild(flags, gate);
  } finally {
    console.log = print;
  }
}

/** The pages and the atlas against the input's: a line saying which are byte-identical. */
function pagesLine(inputAtlas: string, inputPages: readonly InputPage[], outAtlas: string, buildDir: string, outPages: readonly string[]): string {
  const inputBytes = new Map(inputPages.map((p) => [p.page.name, p.path]));
  const same = outPages.filter((name) => {
    const from = inputBytes.get(name);
    return from !== undefined && readFileSync(from).equals(readFileSync(join(buildDir, name)));
  });
  if (inputAtlas === outAtlas && same.length === outPages.length && outPages.length === inputPages.length) {
    return `  ..    pages  skeleton.atlas and all ${outPages.length} page(s) byte-identical to the input's — these settings pack these regions as the input was packed`;
  }
  return (
    `  ..    pages  skeleton.atlas ${inputAtlas === outAtlas ? 'byte-identical to' : 'differs from'} the input's; ${same.length} of ${outPages.length} page(s) byte-identical to the input's page of the same name ` +
    `(the input had ${inputPages.length}) — pages move under other pack settings; what (a) holds is every region`
  );
}

/**
 * repack — the command body both entries register, with the entry's own gate
 * (`build`'s). `plant` is the selftest's (`RepackPlant`).
 */
export function cmdRepack({ flags, positional }: CommandArgs, gate: BuildGate, plant?: RepackPlant): void {
  refuseForeignFlags(flags);
  if (positional.length !== 1) throw new UsageError(`repack takes one path — the build directory, or its skeleton.json — and was given ${positional.length}`);
  // Every flag read before anything is: a typo is a usage error, never a default.
  const packing: Record<string, string> = {
    'page-size': String(readIntFlag(flags, 'page-size', DEFAULT_PAGE_SIZE)),
    padding: String(readIntFlag(flags, 'padding', DEFAULT_PADDING)),
    'page-edges': readPageEdges(flags),
    'pack-shape': readPackShape(flags),
    profile: readProfile(flags),
  };
  const stage = readStageFlag(flags.stage);
  const out = readOut(flags);
  const input = resolveBuild(positional[0], flags.atlas);
  if (input.atlas !== 'there') throw new UsageError(input.atlasRefusal);
  const skeletonText = readSkeletonText(input.skeletonPath);
  const atlasText = readFileSync(input.atlasPath, 'utf8');
  const parsed = parseAtlasText(atlasText);

  console.log(`rigc repack ${input.skeletonPath}`);
  console.log(`  ..    atlas  ${input.atlasPath}`);
  console.log(`  ..    out    ${out}`);
  console.log(`  ..    pack   page-size ${packing['page-size']}, padding ${packing.padding}, page-edges ${packing['page-edges']}, pack-shape ${packing['pack-shape']}, profile ${packing.profile}`);

  // What the atlas cannot carry through a repack, all of it, before anything is made.
  const { refusals, pages } = atlasRefusals(parsed, dirname(input.atlasPath));
  const modelText = modelTextBeside(input.skeletonPath, skeletonText);
  const disagreement = modelText === undefined ? null : documentDisagreements((parseJsonNamed(modelText, join(dirname(input.skeletonPath), MODEL_DOCUMENT_FILE)) as { pages?: unknown }).pages, parsed);
  if (disagreement !== null) {
    refusals.push(
      ...disagreement.lines.map(
        (line) => `the atlas and ${MODEL_DOCUMENT_FILE} beside it disagree — ${line}; the document is the record of where the build placed each region, so one of the two was edited after it was written`,
      ),
    );
  }
  if (refusals.length > 0) {
    throw new RepackError(
      `${input.atlasPath} cannot be lifted exactly — ${refusals.length} reason(s), and nothing was written:\n${refusals.map((r) => `  ${r}`).join('\n')}`,
    );
  }
  console.log(
    `  ..    model  ${
      disagreement === null
        ? `no ${MODEL_DOCUMENT_FILE} of this skeleton beside it (or one stating no pages); the atlas is read as it stands`
        : `the atlas held to ${MODEL_DOCUMENT_FILE}'s pages beside it: ${disagreement.regions} region(s), every placement field equal`
    }`,
  );

  const documentStage = documentStageBeside(input.skeletonPath, skeletonText);
  const work = mkdtempSync(join(tmpdir(), REPACK_WORK_PREFIX));
  console.error(`rigc repack: work directory ${work}`);
  const removeWork = (): void => rmSync(work, { recursive: true, force: true });
  // The `process.exit` inside `runBuild` (a red gate) and the refusal chain's are seen by no `finally`.
  const onExit = (code: number): void => {
    removeWork();
    if (code !== 0) console.error(`rigc repack: nothing was written to ${out}; the work directory ${work} was removed`);
  };
  process.on('exit', onExit);
  try {
    const liftDir = join(work, 'lift');
    const specsDir = join(work, 'specs');
    const buildDir = join(work, 'build');
    const lifted = liftAtlas(pages, liftDir);
    console.log(
      `  ..    lift   ${lifted.parts.size} region(s) off ${pages.length} page(s), each named once: ${lifted.turned} turned on its page, ${lifted.trimmed} trimmed of whitespace — ` +
        'each lifted as the drawing it is (extractRegion)',
    );
    if (plant !== undefined) plant(liftDir);

    let result: { rig: unknown; motion: unknown; findings: IngestFinding[] };
    try {
      result = ingest(parseJsonNamed(skeletonText, input.skeletonPath), ingestOptionsFor(input.skeletonPath, specsDir, liftDir, stage, documentStage));
    } catch (err) {
      if (err instanceof IngestError) throw new RepackError(`ingest refused the skeleton: ${err.message} — nothing was written`, 2);
      if (!(err instanceof IngestSpecRefused)) throw err;
      result = { rig: err.rig, motion: err.motion, findings: err.findings };
    }
    console.log(stageLine(result.rig as Parameters<typeof stageLine>[0], stage !== undefined, documentStage));
    const blockers = result.findings.filter((f) => f.kind === 'blocker');
    console.log(`  ..    ingest ${result.findings.length} finding(s), ${blockers.length} blocker(s)`);
    for (const line of findingLines(result.findings)) console.log(line);
    if (blockers.length > 0) {
      throw new RepackError(
        `ingest found ${blockers.length} blocker(s) (${[...new Set(blockers.map((f) => f.code))].join(', ')}), so a rebuild would not be the skeleton that was read — nothing was written`,
      );
    }
    mkdirSync(specsDir, { recursive: true });
    const rigPath = join(specsDir, 'rig.json');
    const motionPath = join(specsDir, 'motion.json');
    writeFileSync(rigPath, `${JSON.stringify(result.rig, null, 2)}\n`);
    writeFileSync(motionPath, `${JSON.stringify(result.motion, null, 2)}\n`);

    // (c) `build --pack` through the entry's own gate. It returns only green; a red gate exits from inside it.
    stagedBuild({ rig: rigPath, motion: motionPath, out: buildDir, pack: 'true', ...packing }, gate);

    // (a) and (b), both before the first write.
    const outAtlas = readFileSync(join(buildDir, 'skeleton.atlas'), 'utf8');
    const repacked = atlasRefusals(parseAtlasText(outAtlas), buildDir);
    if (repacked.refusals.length > 0) {
      throw new Error(`internal: the repacked atlas is one this command would refuse to lift:\n${repacked.refusals.join('\n')}`);
    }
    const outSkeleton = readFileSync(join(buildDir, 'skeleton.json'), 'utf8');
    const owned = packing['pack-shape'] === 'polygon' ? polygonOwnedTexels(outSkeleton, lifted.parts, Number(packing.padding)) : undefined;
    const regions = regionDifferences(lifted.parts, liftAtlas(repacked.pages).parts, owned);
    const lost: string[] = [];
    if (regions.differences.length > 0) lost.push(`(a) ${regions.differences.length} region(s) are not pixel-identical to the input's:`, ...regions.differences.map((d) => `  ${d}`));
    else {
      console.log(
        `  ..    check  (a) regions: ${regions.identical} of ${lifted.parts.size} pixel-identical, by name, to the same region lifted off the input's pages — ` +
          (regions.byFootprint === 0
            ? 'each over its whole rectangle'
            : `${regions.identical - regions.byFootprint} over the whole rectangle, ${regions.byFootprint} that only meshes draw over the footprint a polygon page keeps as its own (the rest of its rectangle may hold a neighbour, by design)`),
      );
    }
    const accepting = flags[ACCEPT_FLAG] !== undefined;
    if (outSkeleton === skeletonText) {
      console.log(
        "  ..    check  (b) skeleton.json: byte-identical to the input's — the pack owns none of it" +
          (accepting ? `; --${ACCEPT_FLAG} accepted nothing, because there was nothing to accept` : ''),
      );
    } else {
      // Accepted, every path is printed: an accepted difference nobody is shown is the silence the check exists to remove.
      const diff = skeletonDifferences(parseJsonNamed(skeletonText, input.skeletonPath), parseJsonNamed(outSkeleton, join(buildDir, 'skeleton.json')), accepting ? Infinity : SKELETON_DIFFERENCES_SHOWN);
      const head =
        diff.total === 0
          ? `skeleton.json: the rebuild states the same values in other bytes — ${firstLineApart(skeletonText, outSkeleton)}`
          : `skeleton.json: ${diff.total} place(s) differ from the input`;
      if (accepting) {
        console.log(`  ..    check  (b) ${head}, accepted by --${ACCEPT_FLAG} — the output's skeleton is this rigc's rebuild, not the input's bytes:`);
        for (const line of diff.lines) console.log(`  ..             ${line}`);
      } else {
        lost.push(
          `(b) ${head}, which the pack does not own${diff.total > diff.lines.length ? ` (the first ${diff.lines.length})` : ''}:`,
          ...diff.lines.map((d) => `  ${d}`),
          '  a repack changes where regions sit and nothing in the skeleton; this skeleton is not what this rigc writes from what it states. ' +
            `--${ACCEPT_FLAG} writes the rebuild anyway — the skeleton this rigc writes from what the input states, every difference listed — ` +
            'with check (a) and the gate exactly as they are; a build written before 2.2.0, whose header was the stage, differs here in its header box and nowhere else',
        );
      }
    }
    if (lost.length > 0) throw new RepackError(`the repack lost something, so nothing was written to ${out}:\n${lost.map((l) => `  ${l}`).join('\n')}`);
    console.log('  ..    check  (c) gate: green — the report above, on the compile and on the packed pair');

    const outParsed = parseAtlasText(outAtlas);
    const outPages = outParsed.pages.map((p) => p.name);
    const staged = readdirSync(buildDir).sort();
    const expected = [...BUILD_TEXTS, ...outPages].sort();
    if (staged.join('\n') !== expected.join('\n')) throw new Error(`internal: the staged build holds [${staged.join(', ')}], not [${expected.join(', ')}]`);
    console.log(pagesLine(atlasText, pages, outAtlas, buildDir, outPages));

    mkdirSync(out, { recursive: true });
    for (const name of [...outPages, ...BUILD_TEXTS]) {
      copyFileSync(join(buildDir, name), join(out, name));
      console.log(`rigc: wrote ${join(out, name)}`);
    }
    console.log(gate.look(out));
  } finally {
    removeWork();
    process.off('exit', onExit);
  }
}
