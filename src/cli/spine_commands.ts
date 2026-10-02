/**
 * The bodies of the commands that run through spine-core — `build`,
 * `validate` and `bench` (the gate is the round trip), `bonedist` (it poses
 * both skeletons through the runtime by design), `preview` and `vote` (the
 * page names its atlas pages through the runtime's reader, and its gate line
 * is the round trip's) — moved here unchanged from `cli.ts` (issue #1052, step
 * 4e of #380), with the helpers only they call. Only `cli.ts` imports this
 * module (`SPINE_COMMAND_RUNS`); an entry that does not links nothing of the
 * runtime, and refuses these commands naming what each needs it for.
 */
import { type AtlasRegion, DEFAULT_PADDING, DEFAULT_PAGE_EDGES, DEFAULT_PAGE_SIZE, packAtlas, PAGE_EDGES, type PageEdges, pageFootprint } from '../atlas.ts';
import { type BallotCandidateInput, type BallotInput, buildBallot, ledgerLineText, MAX_CANDIDATES, MIN_CANDIDATES, parseLedger, readBallotManifest, resultFilename, TIE, verifyResult, VOTE_RULES } from '../ballot.ts';
import { boneDistance, boneDistLines, type BoneDistReport } from '../bonedist.ts';
import { IDENTITY_CORRESPONDENCE } from '../correspondence.ts';
import { checkLines, type CheckReport } from '../check.ts';
import { compile, type CompileOptions } from '../compile.ts';
import { diffLines, type DiffReport, diffSkeletons, reportedFigures, sectionFigures } from '../diff.ts';
import { copyAtlasPages, plannedPageCopies } from '../emit.ts';
import { findRung, RUNG_IDS, type RungSkeleton } from '../ladder.ts';
import { MODEL_DOCUMENT_FILE, modelDocument } from '../model.ts';
import { buildPreview, buildPreviewPanes, PLAYER_LINE, type PreviewGate, type PreviewInput, type PreviewPage } from '../preview.ts';
import { atlasPageNames } from '../render.ts';
import { BoneDistError } from '../bonedist.ts';
import { type CompileResult } from '../types.ts';
import { assertionCountForProfile, CLI_DEFAULT_PROFILE, reportLines, validate, VALIDATE_PROFILES, type ValidateProfile } from '../validate.ts';
import { type CliRefusal, type CommandRun, DEFAULT_BALLOT, dropLine, PACKAGE_ROOT, DEFAULT_LEDGER, meshBudget, meshDepthNote, meshFit, meshInfluenceNote, parseJsonNamed, readAnimationFlag, readJsonFile, readPackageMeta, readSkeletonText, readVersion, resolveArtifacts, resolveCut, resolveViewable, runCheck, STAGELESS_FRAMING, UsageError, writeJson } from './shared.ts';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';


function repositoryUrl(): string {
  const repo = readPackageMeta()?.repository;
  const url = typeof repo === 'string' ? repo : repo?.url;
  return (url ?? 'https://github.com/firejune/rigc').replace(/^git\+/, '').replace(/\.git$/, '');
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
  modelText: string,
  opts: CompileOptions,
  profile: ValidateProfile,
  /** The atlas text `build` writes for a compile's own — `--copy-images` renames the pages — which the second compile's document is spelled from, as `modelText` was (issue #1016). */
  written: (atlasText: string) => string,
  atlas?: AtlasOverride,
): number {
  // The determinism check compares a second, independent compile — its model
  // document included, which is the text `build` writes beside the pair, and
  // which states where each region sits in the atlas written with it (`pages`,
  // issue #1016): so the second document is spelled from the second compile's
  // atlas as it would be written, or from the second, independent pack.
  const again = compile(opts);
  const report = validate({
    skeletonText: result.skeletonText,
    atlasText: atlas ? atlas.text : result.atlasText,
    atlasDir: opts.outDir,
    declaredDurations: result.declaredDurations,
    modelText,
    reEmit: { skeletonText: again.skeletonText, atlasText: atlas ? atlas.again : again.atlasText, modelText: modelDocument(again.model, again.skeletonText, atlas ? atlas.again : written(again.atlasText)) },
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

/**
 * Read `--page-edges`, or its default — `pot`.
 *
 * An unknown value is a usage error for `readProfile`'s reason: a typo that fell
 * back to `pot` would hand the caller who asked for the smaller page the bigger
 * one, green, and say nothing.
 */
function readPageEdges(flags: Record<string, string>): PageEdges {
  const raw = flags['page-edges'];
  if (raw === undefined) return DEFAULT_PAGE_EDGES;
  const found = PAGE_EDGES.find((e) => e === raw);
  if (!found) throw new UsageError(`--page-edges ${JSON.stringify(raw)}; known values: ${PAGE_EDGES.join(', ')}`);
  return found;
}

/**
 * The rectangle a region occupies **on its page**, for a line that has already
 * said where the region is — and the empty string where the page rectangle is
 * the one `bounds:` already states.
 *
 * ## The fact no surface an author reads carried (issue #718)
 *
 * The atlas line beside this clause prints the DRAWING's size, because that is
 * what an attachment's width and height mean. A packer that turned the drawing a
 * quarter to fit it wrote `bounds:` in the drawing's orientation too. So an
 * author holding the pack and the build report had neither end of the rectangle
 * they have to cut out of the page to measure a part against a rendered frame —
 * and the one place rigc printed it was `A06`'s overlap text, reachable only
 * under `--profile spine-html`. The knowledge was in the tree the whole time:
 * `pageFootprint` has derived this rectangle for every reader of it since issue
 * #579, and nothing an author reads said it.
 *
 * ⚠️ **The condition is `pageFootprint`'s own answer, not a second reading of
 * `degrees`.** Re-spelling that predicate here is the exact duplication #579 was
 * filed on — four readers derived this rectangle and two derived it wrongly — so
 * the clause asks the function whether its answer differs from the `bounds:`
 * line, and prints only then.
 *
 * 🔸 A consequence worth stating rather than leaving to be discovered: a region
 * whose KEPT rectangle is square is silent here, because a quarter turn leaves
 * its footprint the same two numbers and there is nothing the pack does not
 * already say. The general rule — `bounds` is the unturned size, the footprint
 * is its transpose at `rotate: 90` and `rotate: 270`, and which way to turn the
 * rectangle to recover the drawing — belongs to an author's own reading and is
 * stated in `docs/AUTHORING.md` §0.2, which holds for every region including
 * that one.
 */
function pageRectangle(region: AtlasRegion): string {
  const foot = pageFootprint(region);
  return foot.width === region.width && foot.height === region.height
    ? ''
    : `, occupies ${foot.width}x${foot.height}`;
}

export function cmdBuild(flags: Record<string, string>): void {
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
    for (const name of ['page-size', 'padding', 'page-edges'] as const) {
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
    //
    // `pageRectangle` closes the line's last silence (issue #718), and it is
    // placed LAST rather than beside the turn it follows from, which is where
    // the card put it. The two clauses collide nowhere else, and the collision
    // is real: `scale 0.5 (373x106 texels)` is itself a size, so
    // `rotate 90, occupies 106x373 scale 0.5 (…)` reads as though the footprint
    // were the scaled quantity. As a trailing clause of the whole location
    // phrase it is unambiguous with a `scale:` line and identical to the card's
    // wording without one, which is every pack that has no `scale:` to state.
    const where =
      img.atlas === undefined
        ? img.page
        : `${img.page} @ ${img.atlas.x},${img.atlas.y}${img.atlas.degrees ? ` rotate ${img.atlas.degrees}` : ''}` +
          (img.atlasScale === undefined
            ? ''
            : ` scale ${img.atlasScale} (${img.atlas.originalWidth}x${img.atlas.originalHeight} texels)`) +
          pageRectangle(img.atlas);
    console.log(`  ..      ${img.region.padEnd(24)} ${img.width}x${img.height}  <- ${where}`);
  }
  for (const d of result.droppedStates) console.log(dropLine(d));
  // "The optional slots are optional" is a claim about this code path, so this
  // code path says which ones it left out rather than being silently right.
  for (const a of result.absentParts) {
    console.log(`  ABSENT ${a.slot}: ${a.why} — slot not emitted`);
  }
  for (const m of result.meshes) {
    console.log(
      `  MESH  ${m.slot.padEnd(12)} ${m.kind.padEnd(8)} ${m.vertices} vertices / ${m.triangles} triangles  ` +
        `${meshBudget(result.rig)}  bones=[${m.bones.join(', ')}]  attachments=[${m.attachments.join(', ')}]${meshFit(m)}` +
        meshDepthNote(m) +
        meshInfluenceNote(m),
    );
  }
  for (const ph of result.physics) {
    console.log(
      `  PHYS  ${ph.name.padEnd(12)} bone=${ph.bone.padEnd(14)} components=[${ph.components.join(', ')}] ` +
        `mix=${ph.mix}${ph.drivesMesh ? '  <- drives a mesh: its canvas re-rasterises while the spring settles' : ''}`,
    );
  }

  // The model's document is spelled before the gate, so the text A18 compares
  // is the text written, and a model the document cannot carry is refused
  // before anything is (issue #922). It states where each region sits in the
  // atlas written beside it (`pages`, issue #1016), so it is spelled from that
  // atlas: under `--copy-images` the text with the copies' page names, planned
  // here from the text alone (`plannedPageCopies`) and copied after the gate.
  // Under `--pack` the pages move again after this gate, and the document
  // written is the one the packed gate below spells and compares.
  const copying = flags['copy-images'] !== undefined;
  const writtenAtlas = (atlasText: string): string => (copying ? plannedPageCopies(atlasText, opts.outDir).atlasText : atlasText);
  let modelText = modelDocument(result.model, result.skeletonText, writtenAtlas(result.atlasText));
  console.log(`  ..    validate (spine-core round trip + machine assertions, profile ${profile})`);
  const failures = runGate(result, modelText, opts, profile, writtenAtlas);
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
  //
  // What is copied is what the ATLAS names, not what the image list holds: under
  // `--atlas-in` the two are different lists, and rebuilding the text from the
  // second wrote a file the pack never contained — zero bytes for a rig that
  // declares no parts, one fabricated page per part for a rig that does, both of
  // them green here because the gate above had already read the compile's own
  // text (issue #693, `src/emit.ts`).
  let atlasText = result.atlasText;
  if (flags['copy-images'] !== undefined) {
    const copied = copyAtlasPages(atlasText, opts.outDir);
    // The document's pages were spelled from the plan; the copy is held to it before anything of the pair is written.
    if (copied.atlasText !== writtenAtlas(result.atlasText)) {
      throw new Error(`internal: --copy-images wrote an atlas whose page names are not the ones ${MODEL_DOCUMENT_FILE} was spelled with — nothing of the pair was written`);
    }
    atlasText = copied.atlasText;
    console.log(`  ..    copy-images: ${copied.pages.length} page(s) copied into ${opts.outDir}`);
    for (const p of copied.pages) {
      const note = p.to === basename(p.from) ? '' : '  (renamed — basename collision)';
      console.log(`  ..      ${p.to.padEnd(24)} <- ${p.from}  (${p.regions} region(s))${note}`);
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
      pageEdges: readPageEdges(flags),
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
          `${(page.occupancy * 100).toFixed(1)}% covered, padding ${packed.padding}` +
          (packOpts.pageEdges === 'free' ? ', page edges free' : ''),
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
    // The document written is spelled from the packed atlas, and this gate's A18 compares it with a
    // second compile's spelled from the second, independent pack (issue #1016).
    modelText = modelDocument(result.model, result.skeletonText, atlasText);
    const packFailures = runGate(result, modelText, opts, profile, (text) => text, { text: atlasText, again: packAgain.atlasText });
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
  // rigc's own record of the compiled rig (`rigc-compiled/3`, issue #922;
  // its `pages` the atlas just written, issue #1016), written with the pair
  // and only after the same gate — under `--pack`, the packed one. rigc's own posing core
  // reads it (`readModel`, `src/core/index.ts`, issue #380's step 2).
  writeFileSync(join(opts.outDir, MODEL_DOCUMENT_FILE), modelText);
  console.log(`rigc: wrote ${join(opts.outDir, 'skeleton.json')}`);
  console.log(`rigc: wrote ${join(opts.outDir, 'skeleton.atlas')}`);
  console.log(`rigc: wrote ${join(opts.outDir, MODEL_DOCUMENT_FILE)}`);
  // The next command is part of the message (issue #837). A green build is the
  // moment somebody wants to see what came out, and the one page rigc writes
  // for that is `preview` of exactly this directory — so the line names it,
  // with the path already resolved. Printed only here: a red build wrote
  // nothing, so there is nothing to look at and no line.
  console.log(`rigc: look at it: rigc preview --candidate ${opts.outDir}`);
}

export function cmdValidate(flags: Record<string, string>, positional: string[]): void {
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

/**
 * Does this skeleton declare a setup stage — a numeric width AND height?
 *
 * Read off the file's header for `preview`, which never loads one; `render`
 * reads the same statement off its candidate (`SkeletonFacts.declaresStage`:
 * the header again on a rigc build the core poses, the loaded `SkeletonData`
 * on an export). Both are the same two fields, because
 * `SkeletonJson` copies them across unconditionally (`SkeletonJson.js:70-73`),
 * so a header that omits them leaves `undefined` on a field typed `number`.
 */
function declaresSetupStage(header: { width?: unknown; height?: unknown }): boolean {
  return typeof header.width === 'number' && typeof header.height === 'number';
}

/** The `skeleton` block of a skeleton file's text, or an empty one where it has none. */
function skeletonHeaderOf(skeletonText: string): { width?: unknown; height?: unknown } {
  const root = JSON.parse(skeletonText) as { skeleton?: { width?: unknown; height?: unknown } };
  return root.skeleton ?? {};
}

/** The animation names an emitted skeleton carries, in the order it lists them. */
function skeletonAnimationNames(skeletonText: string, path: string): string[] {
  const parsed = parseJsonNamed(skeletonText, path);
  if (typeof parsed !== 'object' || parsed === null) throw new UsageError(`${path} is not a skeleton object`);
  const animations = (parsed as { animations?: unknown }).animations;
  if (animations === undefined) return [];
  if (typeof animations !== 'object' || animations === null || Array.isArray(animations)) {
    throw new UsageError(`${path} has an "animations" field that is not an object`);
  }
  return Object.keys(animations);
}

/**
 * The gate's reading of one candidate, taken the way `rigc validate <dir>`
 * takes it (issue #837).
 *
 * ⭐ The same call `cmdValidate` makes on a bare directory: the two texts, the
 * atlas's own directory, the default profile, and nothing a directory cannot
 * supply — no rig spec, no declared durations, no second compile. So `A09` and
 * `A18` report SKIP here exactly as they do there, and the line is the line
 * that command prints for these files, not the one `build` printed for the
 * compile that wrote them. Measured on every run, because the page must not
 * carry a figure this run did not measure.
 */
function previewGate(skeletonText: string, atlasText: string, atlasDir: string): PreviewGate {
  const lines = reportLines(validate({ skeletonText, atlasText, atlasDir, profile: CLI_DEFAULT_PROFILE }));
  const refusal = lines.find((line) => line.startsWith('  FAIL  '));
  return {
    // `reportLines` ends on the summary by construction; the gutter is the
    // report's layout, not part of what the gate said.
    summary: lines[lines.length - 1].replace(/^ {2}\.\. {4}/, ''),
    refusal: refusal === undefined ? null : refusal.trimStart(),
  };
}

/**
 * preview — the artifact playing in Esoteric's own web player, as one file.
 *
 * ⚠️ Nothing is rasterised here and nothing is decoded. The pages go into the
 * page as the bytes they are on disk, so a preview works for any PNG a BROWSER
 * can draw rather than for the ones our own decoder reads — which is the right
 * direction for the command whose whole job is "just show me".
 */
export function cmdPreview(flags: Record<string, string>, candidates: string[]): void {
  // Refused rather than ignored: a preview asked to hide `head` that plays the
  // whole rig is a picture that answers a question it was not asked (issue #835).
  for (const flag of ['slot', 'hide'] as const) {
    if (flags[flag] !== undefined) {
      throw new UsageError(
        `preview takes no --${flag}: the Spine Web Player draws what the skeleton draws. A subset of the slots is ` +
          `\`rigc render --${flag} ${flags[flag]}\`, on the whole rig's grid`,
      );
    }
  }
  const several = candidates.length > 1;
  // `--atlas` names ONE atlas, and with several skeletons there is no
  // unambiguous thing it could mean — the refusal `vote` makes, for the reason
  // it makes it.
  if (several && flags.atlas !== undefined) {
    throw new UsageError(
      `--atlas names one atlas and ${candidates.length} --candidate were given; each candidate's atlas has to sit ` +
        'beside its skeleton, which is what `build --out` leaves behind',
    );
  }
  const found = several
    ? candidates.map((target) => {
        const { skeletonPath, atlasPath } = resolveArtifacts(target, undefined);
        for (const path of [skeletonPath, atlasPath]) {
          if (!existsSync(path)) throw new UsageError(`nothing at ${path}`);
        }
        return { target, skeletonPath, atlasPath, atlasDir: dirname(atlasPath) };
      })
    : [{ target: flags.candidate, ...resolveViewable(flags) }];
  // ⚠️ By the FILE each one resolves to, not by the text typed: `build/` and
  // `build/skeleton.json` are two spellings of one candidate, and so are
  // `/tmp/x` and `/private/tmp/x` on a machine where one is a link to the other
  // — `resolve` alone left that pair unrefused, measured on macOS. A page
  // showing one skeleton twice is two panes that look like a comparison of
  // nothing. (`vote` accepts a repeat today, exit 0; that is its own card.)
  const identities = found.map((f) => realpathSync(f.skeletonPath));
  for (let i = 1; i < found.length; i++) {
    const first = identities.indexOf(identities[i]);
    if (first < i) {
      throw new UsageError(
        `--candidate ${JSON.stringify(found[i].target)} is ${identities[i]}, which --candidate ` +
          `${JSON.stringify(found[first].target)} already names (candidates ${first + 1} and ${i + 1}); a pane per ` +
          'candidate would show the same skeleton twice',
      );
    }
  }

  // Every candidate's texts and animation are read before a line is printed,
  // so a refusal about any of them comes before the report, as it always has.
  const loaded = found.map((f, i) => {
    const skeletonText = readFileSync(f.skeletonPath, 'utf8');
    const atlasText = readFileSync(f.atlasPath, 'utf8');
    const animations = skeletonAnimationNames(skeletonText, f.skeletonPath);
    let chosen: string | undefined;
    try {
      chosen = readAnimationFlag(flags, animations);
    } catch (err) {
      // With several candidates the refusal has to say WHICH one lacks it.
      if (several && err instanceof UsageError) {
        throw new UsageError(`candidate ${i + 1} (${f.skeletonPath}): ${err.message}`);
      }
      throw err;
    }
    return { ...f, skeletonText, atlasText, animations, chosen };
  });

  // A directory for --out is taken as "put the default name in here", because
  // `--out render/` is what the sibling command means by the same flag and a
  // preview written OVER a directory is not a recoverable mistake.
  const target = resolve(flags.out ?? 'preview.html');
  const out = existsSync(target) && statSync(target).isDirectory() ? join(target, 'preview.html') : target;
  const version = readVersion();

  console.log('rigc preview');
  const inputs: PreviewInput[] = loaded.map((candidate, i) => {
    const { skeletonPath, atlasPath, atlasDir, skeletonText, atlasText, animations, chosen } = candidate;
    if (several) console.log(`  ..    pane ${i + 1} of ${loaded.length}`);
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
    if (!declaresSetupStage(skeletonHeaderOf(skeletonText))) console.log(`  ..    ${STAGELESS_FRAMING.preview}`);
    const gate = previewGate(skeletonText, atlasText, atlasDir);
    console.log(`  ..    gate     ${gate.summary}`);
    if (gate.refusal !== null) {
      console.log(
        `  ..    gate     refused — ${gate.refusal}. Previewed anyway: looking at a red build is what preview is ` +
          'for, and the page header says the same',
      );
    }
    return {
      skeletonText,
      atlasText,
      pages,
      animation: chosen ?? animations[0] ?? null,
      animations,
      label: skeletonPath,
      version,
      gate,
    };
  });

  const html = several ? buildPreviewPanes(inputs, version) : buildPreview(inputs[0]);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  const pageCount = inputs.reduce((n, input) => n + input.pages.length, 0);
  console.log(
    several
      ? `  ..    embedded ${pageCount} page(s) + ${inputs.length} skeletons and atlases as data URIs, one pane each; ` +
          `the player itself loads from unpkg (@${PLAYER_LINE}), so the first open needs a network`
      : `  ..    embedded ${pageCount} page(s) + the skeleton and atlas as data URIs; ` +
          `the player itself loads from unpkg (@${PLAYER_LINE}), so the first open needs a network`,
  );
  console.log(`rigc: wrote ${out}  (${(html.length / 1024).toFixed(1)} KiB — open it in a browser)`);
}

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

export function cmdVote(flags: Record<string, string>, candidates: string[]): void {
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
export function cmdBench(flags: Record<string, string>, positional: string[]): void {
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
  const exportDir = resolve(PACKAGE_ROOT, 'examples', rung.example, 'export');
  if (!existsSync(exportDir)) {
    // `bun run fetch-examples` runs `scripts/fetch-examples.sh`, and `scripts/`
    // is not in package.json's `files` — an npm install has no such script to
    // run. Its presence is what tells the two contexts apart, so the remedy
    // named here is one that actually exists in whichever context this is.
    const remedy = existsSync(resolve(PACKAGE_ROOT, 'scripts', 'fetch-examples.sh'))
      ? 'run `bun run fetch-examples` first'
      : `bench needs a checkout of ${repositoryUrl()} — its \`fetch-examples\` script is not part of the installed package`;
    throw new UsageError(`no example corpus at ${exportDir} — ${remedy} (examples/ is gitignored, not shipped)`);
  }

  // Both files there and the skeleton JSON before the first line is printed, refused by name as `render` refuses
  // them (issue #1042): a missing file and a skeleton that is not JSON surfaced as an ENOENT or a SyntaxError and a
  // stack, the second only after the validate block had printed.
  const { skeletonPath, atlasPath } = resolveViewable({ candidate: flags.candidate, ...(flags.atlas === undefined ? {} : { atlas: flags.atlas }) });
  const skeletonText = readSkeletonText(skeletonPath);
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
        referenceSkeleton: referencePath,
        referenceAtlas: join(exportDir, skeleton.atlas),
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
export function cmdBoneDist(flags: Record<string, string>): void {
  if (flags.candidate === undefined) throw new UsageError('bonedist needs --candidate <dir | skeleton.json>');
  if (flags.reference === undefined) throw new UsageError('bonedist needs --reference <skeleton.json>');
  if (flags.bones === undefined) {
    throw new UsageError(
      `bonedist needs --bones <correspondence.json | ${IDENTITY_CORRESPONDENCE}> — a candidate is entitled to its own bone ` +
        'names, so the mapping is an input and never a guess; pass `identity` to state that the two use the same names',
    );
  }
  // Each side's files there and its skeleton JSON, refused by name as `render` refuses them (issue #1042); a pair
  // that does not load is `boneDistance`'s refusal (`CandidatePairError`, exit 2 below).
  const sideOf = (target: string, atlas: string | undefined): { skeletonPath: string; atlasPath: string } => {
    const side = resolveViewable({ candidate: target, ...(atlas === undefined ? {} : { atlas }) });
    readSkeletonText(side.skeletonPath);
    return side;
  };
  const candidate = sideOf(flags.candidate, flags.atlas);
  const reference = sideOf(flags.reference, flags['reference-atlas']);
  const report = boneDistance({
    candidateSkeleton: candidate.skeletonPath,
    candidateAtlas: candidate.atlasPath,
    referenceSkeleton: reference.skeletonPath,
    referenceAtlas: reference.atlasPath,
    bones: flags.bones,
    ...(flags.fps === undefined ? {} : { fps: Number(flags.fps) }),
  });
  console.log('rigc bonedist — per-frame bone world-transform distance (the ladder\'s stage 3)');
  for (const line of boneDistLines(report, { allBones: flags['all-bones'] !== undefined })) console.log(line);
  if (flags.json !== undefined) writeJson(flags.json, report);
}

/**
 * The bodies of every command whose `runtime` is not `false` (`COMMANDS`), by
 * name — what only `cli.ts` registers, beside `./core_commands.ts`'s.
 */
export const SPINE_COMMAND_RUNS: Readonly<Record<string, CommandRun>> = {
  build: ({ flags }) => cmdBuild(flags),
  validate: ({ flags, positional }) => cmdValidate(flags, positional),
  bench: ({ flags, positional }) => cmdBench(flags, positional),
  bonedist: ({ flags }) => cmdBoneDist(flags),
  preview: ({ flags, lists }) => cmdPreview(flags, lists.candidate ?? []),
  vote: ({ flags, lists }) => cmdVote(flags, lists.candidate ?? []),
};

/** `bonedist`'s refusal, whose class lives in the module that poses through spine-core (`CliEntry.refusals`). */
export const SPINE_COMMAND_REFUSALS: readonly CliRefusal[] = [
  { is: (err) => err instanceof BoneDistError, prefix: 'rigc bonedist error: ', status: 1 },
];

/** Each profile's rule count — the validator's, which the usage's `--profile` paragraph states. */
export const PROFILE_RULES = (profile: 'spine' | 'spine-html'): number => assertionCountForProfile(profile);
