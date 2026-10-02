/**
 * A19, the body (issue #1025, step 4c of #380): every overlay part can draw a
 * transparent pixel — only the base plate may be opaque.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the pages and
 * regions are a fact (`../facts/atlas_regions.ts`), the stage is a fact
 * (`../facts/stage.ts`), the region attachments are the skins' fact
 * (`../facts/skin_entries.ts`), and the directory and the rig info are the
 * caller's. Why transparency is not the same thing as an alpha channel (#215)
 * stays above the `check` call in `validate()`.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Verdicts } from '../harness.ts';
import type { AtlasRegionEntry, AtlasRegionFacts } from '../facts/atlas_regions.ts';
import type { SkinEntryFacts } from '../facts/skin_entries.ts';
import type { StageFacts } from '../facts/stage.ts';
import { SKIP_NO_ATLAS, SKIP_NO_ATLAS_PAGE } from '../reasons.ts';
import { pageFootprint } from '../../atlas.ts';
import { colourTypeName, readPngHeader } from '../../png.ts';
import { readPlate } from '../../../tools/plate.ts';
import type { RigInfo } from '../../types.ts';

export function a19OverlayPngsHaveAlpha({ fail: failed, skip }: Verdicts, { atlas }: AtlasRegionFacts, stage: StageFacts, { regionAttachments }: Pick<SkinEntryFacts, 'regionAttachments'>, input: { atlasDir: string; rig?: RigInfo }): void {
  // A SKIP for the same reason A06's is (#568). This one is invisible under
  // `spine`, where the profile excludes the rule before its body runs — and
  // that is exactly why it was worth finding: `--profile spine-html` reported
  // it, and A27 below, green on an atlas nothing had read.
  if (!atlas) return skip('A19_OVERLAY_PNGS_HAVE_ALPHA', SKIP_NO_ATLAS);
  if (atlas.pages.length === 0) return skip('A19_OVERLAY_PNGS_HAVE_ALPHA', SKIP_NO_ATLAS_PAGE);
  // Every sentence this body prints goes through here, so its end can tell
  // "nothing failed" from "something failed" (issue #1055, at the page loop).
  let failures = 0;
  const fail = (assertion: string, detail: string): void => {
    failures++;
    failed(assertion, detail);
  };
  const stageW = stage.width ?? 0;
  const stageH = stage.height ?? 0;
  // 🔒 **Which image is the base plate is decided ONCE, and the rig's own
  // statement decides it** (issue #770). A cut manifest names its base plate
  // — the part whose window IS the crop — and that needs no stage box; the
  // size of an attachment against the stage is read only when the build
  // names none, because it is then the only statement there is (every build
  // from a rig spec, and `validate <dir>`, which has no rig at all). Both
  // routes below read the same two sets, so they cannot disagree about it.
  //
  // ⚠️ Before this, "at least the stage's size" was the only reading, and a
  // stageless manifest rig came out with no base plate: the packed build was
  // refused for its plate's opaque texels while the loose build of the same
  // rig passed on the file's colour type. The order is a rule rather than a
  // coincidence of the fixtures, where the two readings agree: a stage stated
  // small enough for an overlay to "cover" is exactly where they part.
  const named = input.rig?.basePlates ?? [];
  const basePages = new Set<string>();
  const baseRegions = new Set<string>();
  const exempt = (name: string): void => {
    const region = atlas.findRegion(name);
    if (region) {
      basePages.add(region.page.name);
      baseRegions.add(region.name);
    }
  };
  if (named.length > 0) {
    for (const name of named) exempt(name);
  } else {
    for (const att of regionAttachments) {
      if (stageW && stageH && att.width >= stageW && att.height >= stageH) exempt(att.path || att.name);
    }
  }
  // The escape hatch is named the way it is reachable. With a base plate the
  // rig names, that plate; with none but a stage, the size reading; and with
  // neither, nothing here decides which image is the plate — so the sentence
  // says what would, rather than pointing at a door that is not there.
  const undecided =
    'Only a base plate may be opaque, and nothing here decides which image that is: this skeleton declares no ' +
    'stage size to measure one against, and ';
  const exemption =
    named.length > 0
      ? `Only the base plate the rig names (${named.map((name) => JSON.stringify(name)).join(', ')}, the part ` +
        "whose window is the cut manifest's crop) may be opaque."
      : stageW && stageH
        ? `Only the one image big enough to cover the whole stage (${stageW}x${stageH}) may be opaque.`
        : input.rig
          ? `${undecided}the build names no base plate. Either would decide it: give the rig spec a "skeleton" ` +
            'stage the plate covers, or build from a cut manifest, whose base plate is the part whose window is ' +
            'the crop.'
          : `${undecided}no rig was given to name one. Either would decide it: state a "skeleton" stage the plate ` +
            'covers, or validate with the specs it was built from (--rig, --motion and the --manifest, whose base ' +
            'plate is the part whose window is the crop).';
  // 🚨 Counted per page for the unpacked convention and per REGION on a shared
  // page, and the split is not a convenience (issue #266, follow-up 2). A
  // packed page's own file all but always declares transparency — the gutter
  // and whatever is left over of the page are transparent — so the file-level
  // question is answered "yes" by the packing itself, whatever the parts on it
  // look like. Asking it that way once packs became gateable under this profile
  // would have turned this assertion into a pass that measures nothing, which
  // is the failure mode this file exists to prevent. So a shared page is opened
  // and each region's own rectangle is measured instead.
  const sharedPages = new Map<string, AtlasRegionEntry[]>();
  for (const region of atlas.regions) {
    const on = sharedPages.get(region.page.name);
    if (on) on.push(region);
    else sharedPages.set(region.page.name, [region]);
  }
  // 🔒 **A page whose file is not on disk is a page whose parts were not
  // read, and the body says so rather than passing** (issue #1055). Until
  // this the loop walked past such a page, and on a build with every page
  // file deleted the assertion printed PASS on all 19 of the tree's recipes
  // under `spine-html` having opened nothing. The rule for what it prints
  // instead is `a06.ts`'s, read off what `A17` prints on the same input: A17
  // FAILs naming each missing file, so the report is already red and the file
  // already named; a FAIL here would be the second naming and a PASS a
  // certificate over alpha nobody read. So the body SKIPs, naming the pages it
  // did not read and pointing at A17 — only when it failed nothing else,
  // because `skip()` is per assertion (#705's argument, below) and a FAIL
  // certifies nothing.
  //
  // ⚠️ A page counts only when it carries a part this rule judges, by the
  // predicate the non-PNG branch below uses: a missing page holding nothing
  // but the base plate had nothing for this rule to read either way, so it
  // moves nothing here (the size it was not measured at is `A06`'s to say).
  let pagesWithParts = 0;
  const unread: string[] = [];
  const unreadable: string[] = [];
  for (const page of atlas.pages) {
    const abs = resolve(input.atlasDir, page.name);
    const on = sharedPages.get(page.name) ?? [];
    const carriesPart = on.length > 1 ? on.some((region) => !baseRegions.has(region.name)) : !basePages.has(page.name);
    if (carriesPart) pagesWithParts++;
    if (!existsSync(abs)) {
      if (carriesPart) unread.push(page.name); // A17 names the file; this body says only that it did not read it
      continue;
    }
    // 🔒 **A page that is on disk and cannot be read as a PNG is named once,
    // by `A06`, and this body only says it did not read it** (issue #1064,
    // the other half of #1055's rule). Until this it FAILed here with a
    // second sentence about the same file (#732's `not measured … belongs to
    // A06`), so one unreadable page was two red lines: measured on the tree's
    // 19 recipes with the first page replaced by text bytes, by a PNG cut
    // inside its IDAT and by one with a wrong signature byte, A06 FAILed
    // naming the file on 19 of 19 under both profiles and this rule added its
    // FAIL on the 12 whose first page carries a part (`spine-html`).
    //
    // ⭐ Who names it is read off the two bodies, not chosen. Both ask
    // `readPngHeader` (`pngProblem`, the one reader of a page's identity) the
    // same question about the same file, A06 runs under both profiles and this
    // rule under `spine-html` alone, and A06 FAILs on every page for which it
    // answers with a problem — so on every input that reaches this branch, A06
    // has already named the file and the report is red. A FAIL here would be
    // the second naming and a PASS a certificate over alpha nobody read, so
    // the page joins `#1055`'s unread list, with its own owner beside it.
    //
    // ⚠️ #732 chose a FAIL because `skip()` is per assertion and would delete
    // the verdicts on every other page. Under #1055's rule that argument no
    // longer forces it: the SKIP below is printed only when this body failed
    // nothing else, so the verdicts it would replace are all passes, and its
    // reason says how many pages they covered. With another failure standing,
    // the failures stand and the unreadable page is A06's alone. A page
    // holding nothing but the base plate had nothing for this rule to read
    // either way and moves nothing, exactly as a missing one does.
    //
    // ⚠️ Only what `pngProblem` refuses comes here. A page whose header it
    // accepts and whose texels the decoder then refuses (a broken zlib stream
    // in an intact chunk walk) reaches `readPlate` below, which A06 never
    // calls — this rule is the one reader that finds that file unreadable,
    // and its line is unchanged by this.
    const header = readPngHeader(abs);
    if (header.problem !== null) {
      if (carriesPart) unreadable.push(page.name); // A06 names the file; this body says only that it did not read it
      continue;
    }
    if (on.length > 1) {
      // 🚨 A rotated region is refused by A06 under this profile, so this
      // reading was assumed to be cosmetic — a rectangle printed beside a
      // failure already standing. It is not: the loop below OPENS the
      // rectangle and stops at the first transparent texel, so a rectangle
      // wider than the drawing runs into the transparent gutter, finds its
      // texel there and names nothing. With the transpose applied at 90 only,
      // two fully opaque parts on one page were measured green at
      // `rotate: 270` and red at 0, 90 and 180 — this assertion's own verdict,
      // flipped by the rotation it does not judge (issue #579). The footprint
      // is `pageFootprint`'s, which every other reader of it now calls.
      // 🚨 **The scan counts what it READ, and zero texels read is not a
      // verdict** (issue #705). The `continue` above walks past every
      // coordinate that is not on the page, so a rectangle none of whose
      // texels are on it came out of this loop with `transparent` still
      // false — indistinguishable from a solid drawing — and the sentence
      // below then stated opacity over texels nobody had opened. Measured on
      // a pack shaped like #707's: `part "block" is opaque in every one of
      // its 12x8 texels`, over **0 of 96**, on art carrying 36 clear texels
      // where it was packed. That is the message-as-UI defect in one line —
      // the reader is sent to re-export a part whose alpha was never the
      // problem, and the rectangle that is the problem belongs to A06.
      //
      // ⚠️ It is a FAIL rather than a SKIP, and the report's own shape
      // decides that rather than taste. `skip()` is per ASSERTION, so
      // skipping here would delete the verdicts on every other part of the
      // page — on that same pack the second part is genuinely opaque and is
      // named — and adding a skip BESIDE those failures puts A19 in two of
      // the four buckets `reportLines` adds up, which prints `45 assertions`
      // where the registry holds 44. What is left is a failure that says
      // what was not measured, which is also what "green means measured"
      // requires: a part this rule could not read must not be certified by
      // it.
      const plate = readPlate(abs);
      // 🚨 **The scan's coordinates are the atlas's, so a file that is not the
      // declared grid is a non-measurement for every region on it** (issue
      // #715), and #705's clause above does not cover it. That one fires when
      // a rectangle has NO texel on the page; a page whose image is a rescale
      // of the declared size leaves most rectangles partly on it, at
      // coordinates that address a different part of the picture. Measured on
      // a two-region pack at a uniform 0.5: the opaque part's failure
      // DISAPPEARED — the scan found a transparent texel 32 texels away from
      // it and returned — while the other printed #705's sentence over 0 of
      // 256 texels. A verdict and a silence, both about texels nobody located.
      //
      // A FAIL for #705's reason, word for word: `skip()` is per assertion and
      // would delete the verdicts on every other page in the same report.
      if (plate.width !== page.width || plate.height !== page.height) {
        for (const region of on) {
          if (baseRegions.has(region.name)) continue;
          const { width, height } = pageFootprint(region);
          fail(
            'A19_OVERLAY_PNGS_HAVE_ALPHA',
            `part "${region.name}" is not measured: this rule opens the page at the coordinates the atlas ` +
              `states, and page "${page.name}" declares ${page.width}x${page.height} over a ` +
              `${plate.width}x${plate.height} image, so the ${width}x${height} rectangle at ${region.x},` +
              `${region.y} is not where "${region.name}"'s texels are on this file and this rule states ` +
              'nothing about whether it can draw a transparent pixel. The page grid is ' +
              "A06_ATLAS_PAGE_SIZE_MATCHES_PNG's to judge, and it names the ratio and how to declare the page " +
              'honestly. This is renderer policy, and it belongs to --profile spine-html: the default ' +
              '--profile spine does not run this check.',
          );
        }
        continue;
      }
      for (const region of on) {
        if (baseRegions.has(region.name)) continue;
        const { width, height } = pageFootprint(region);
        const declared = width * height;
        let read = 0;
        let transparent = false;
        for (let y = region.y; y < region.y + height && !transparent; y++) {
          for (let x = region.x; x < region.x + width; x++) {
            if (x < 0 || y < 0 || x >= plate.width || y >= plate.height) continue;
            read++;
            if (plate.get(x, y)[3] < 255) {
              transparent = true;
              break;
            }
          }
        }
        if (transparent) continue;
        // The page's size here is the DECODED image's and not the `size:`
        // line's, because it is the bound this scan actually clipped
        // against; where the two disagree A06 says so in its own sentence.
        if (read === 0) {
          fail(
            'A19_OVERLAY_PNGS_HAVE_ALPHA',
            `part "${region.name}" is not measured: this rule read 0 of the ${declared} texels of its ` +
              `${width}x${height} rectangle at ${region.x},${region.y} on page "${page.name}", whose image is ` +
              `${plate.width}x${plate.height}, so it states nothing about whether "${region.name}" can draw a ` +
              "transparent pixel. A region's rectangle is A06_ATLAS_PAGE_SIZE_MATCHES_PNG's to judge, and one " +
              'that runs off its page is refused there by name. This is renderer policy, and it belongs to ' +
              '--profile spine-html: the default --profile spine does not run this check.',
          );
          continue;
        }
        // A rectangle partly on the page states the verdict over the texels
        // it read and says how many of the declared ones that was. A whole
        // rectangle prints the sentence it has always printed, to the byte.
        const over =
          read === declared
            ? `every one of its ${width}x${height} texels on shared page "${page.name}"`
            : `every one of the ${read} texels of its ${width}x${height} rectangle at ${region.x},${region.y} ` +
              `that are on shared page "${page.name}", whose image is ${plate.width}x${plate.height} — the ` +
              `other ${declared - read} of the ${declared} it declares are not on the page and are not ` +
              'measured here';
        fail(
          'A19_OVERLAY_PNGS_HAVE_ALPHA',
          `part "${region.name}" is opaque in ${over}, so it would paint a solid rectangle over whatever is ` +
            `drawn behind it. Re-export the part with transparency and pack again. ${exemption} This is ` +
            'renderer policy, and it belongs to --profile spine-html: the default --profile spine does not run ' +
            'this check.',
        );
      }
      continue;
    }
    const info = header.info;
    if (basePages.has(page.name)) continue; // the base plate: opaque is correct
    // The header is the FAST NEGATIVE and only that (#215's rule, unchanged):
    // a colour type 0, 2 or 3 file with no tRNS chunk has nowhere to keep a
    // transparent texel, so it is refused without opening it.
    if (!info.hasTransparency) {
      fail(
        'A19_OVERLAY_PNGS_HAVE_ALPHA',
        `part image "${page.name}" cannot be transparent anywhere: it is colour type ${info.colourType} ` +
          `(${colourTypeName(info.colourType)}) with no tRNS chunk, so it would paint a solid rectangle over ` +
          'whatever is drawn behind it. Re-export it with transparency — as RGBA, or as an indexed or greyscale ' +
          `PNG that keeps its tRNS chunk. ${exemption} This is renderer policy, and it belongs to --profile ` +
          'spine-html: the default --profile spine does not run this check.',
      );
      continue;
    }
    // 🚨 **A header that says "could be transparent" is not an answer, and
    // the texels decide it exactly as they do on a shared page** (issue
    // #777). Until this the loose route stopped here, so a part saved as
    // RGBA passed whether or not any texel used the channel: on the
    // articulated fixture, stageless, an overlay rewritten as colour type 6
    // with 0 of its 16,000 texels below full alpha PASSED loose and was
    // refused by `--pack` of the same rig, over the same texels. The runtime
    // draws those texels, not the file's declaration, so the loose verdict
    // was the false green. The rectangle is the whole decoded image — on a
    // loose page the file IS the part, so no atlas coordinate is read and
    // #705's and #715's non-measurements cannot arise here — and the scan
    // stops at the first clear texel, as the shared page's does.
    const plate = readPlate(abs);
    let transparent = false;
    for (let y = 0; y < plate.height && !transparent; y++) {
      for (let x = 0; x < plate.width; x++) {
        if (plate.get(x, y)[3] < 255) {
          transparent = true;
          break;
        }
      }
    }
    if (transparent) continue;
    const holds = info.hasAlpha
      ? `colour type ${info.colourType} (${colourTypeName(info.colourType)}) carries an alpha channel`
      : `colour type ${info.colourType} (${colourTypeName(info.colourType)}) carries a tRNS chunk`;
    fail(
      'A19_OVERLAY_PNGS_HAVE_ALPHA',
      `part image "${page.name}" is opaque in every one of its ${plate.width}x${plate.height} texels, so it ` +
        `would paint a solid rectangle over whatever is drawn behind it: its file can hold transparency — ${holds} ` +
        '— and no texel uses it. Re-export the part with the transparency it is meant to have. ' +
        `${exemption} This is renderer policy, and it belongs to --profile spine-html: the default --profile ` +
        'spine does not run this check.',
    );
  }
  if (failures > 0 || unread.length + unreadable.length === 0) return;
  skip('A19_OVERLAY_PNGS_HAVE_ALPHA', unreadAlpha(pagesWithParts, unread, unreadable));
}

/**
 * The SKIP's reason over the pages carrying a part that this rule did not
 * read: `missing` (not on disk, which A17 names — issue #1055) and
 * `unreadable` (on disk and not a PNG rigc can read, which A06 names — issue
 * #1064). With only missing pages it is #1055's sentence to the byte; each
 * group names its own owner, so one file is pointed at the one rule that
 * names it.
 */
function unreadAlpha(pagesWithParts: number, missing: readonly string[], unreadable: readonly string[]): string {
  const A17 = 'A17_ATLAS_PAGE_FILES_EXIST';
  const A06 = 'A06_ATLAS_PAGE_SIZE_MATCHES_PNG';
  const names = (pages: readonly string[]): string => pages.map((name) => JSON.stringify(name)).join(', ');
  const total = missing.length + unreadable.length;
  if (total === pagesWithParts) {
    if (unreadable.length === 0) {
      return (
        `no part's alpha was read: none of the ${pagesWithParts} page file(s) carrying a part is on disk, which ` +
        `${A17} names file by file, and that is not a pass while every part is unread`
      );
    }
    if (missing.length === 0) {
      return (
        `no part's alpha was read: none of the ${pagesWithParts} page file(s) carrying a part can be read as PNG, ` +
        `which ${A06} names file by file, and that is not a pass while every part is unread`
      );
    }
    return (
      `no part's alpha was read: of the ${pagesWithParts} page file(s) carrying a part, ${missing.length} are not ` +
      `on disk, which ${A17} names file by file, and ${unreadable.length} cannot be read as PNG, which ${A06} ` +
      'names file by file, and that is not a pass while every part is unread'
    );
  }
  const because = [
    ...(missing.length > 0 ? [`${names(missing)} — because the file is not on disk, which ${A17} names`] : []),
    ...(unreadable.length > 0 ? [`${names(unreadable)} — because the file cannot be read as PNG, which ${A06} names`] : []),
  ].join(', and — ');
  return (
    `${total} of the ${pagesWithParts} page(s) carrying a part were not read — ${because}. Every part on the ` +
    `${pagesWithParts - total} page(s) that were read can draw a transparent pixel, and that is not a pass while ` +
    "a part's alpha is unread"
  );
}
