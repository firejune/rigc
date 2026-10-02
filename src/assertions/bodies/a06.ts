/**
 * A06, the body (issue #1025, step 4c of #380): every page the atlas names is
 * the size its PNG is, every region lies inside its page, and — under
 * `spine-html` — no page claims premultiplied alpha, no two regions on one page
 * overlap and no region is turned.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the pages and
 * regions are a fact (`../facts/atlas_regions.ts`), the directory is the
 * caller's, and the profile's policy switch is passed in. The `check` call —
 * and the argument for the SKIP guards it shares with A17 and A19 (#568, #608)
 * — stays in `validate()`.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Verdicts } from '../harness.ts';
import type { AtlasRegionEntry, AtlasRegionFacts } from '../facts/atlas_regions.ts';
import { SKIP_NO_ATLAS, SKIP_NO_ATLAS_PAGE } from '../reasons.ts';
import { pageFootprint, pageGridSentence } from '../../atlas.ts';
import { readPngHeader } from '../../png.ts';

export function a06AtlasPageSizeMatchesPng({ fail: failed, skip }: Verdicts, { atlas }: AtlasRegionFacts, input: { atlasDir: string }, policy: boolean): void {
  if (!atlas) return skip('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', SKIP_NO_ATLAS);
  if (atlas.pages.length === 0) return skip('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', SKIP_NO_ATLAS_PAGE);
  // Every sentence this body prints goes through here, so the end of the body
  // can tell "nothing failed" from "something failed" (issue #1055, below).
  let failures = 0;
  const fail = (assertion: string, detail: string): void => {
    failures++;
    failed(assertion, detail);
  };
  // 🔒 **A page whose file is not on disk is a page whose size was not
  // measured, and the body says so rather than passing** (issue #1055). Until
  // this the loop below walked past such a page and the assertion came out
  // PASS — on a build with every page file deleted, a PASS over a size clause
  // that had opened nothing, measured on 33 of the 38 recipe-and-profile
  // pairs of the tree's 19 recipes (the other five failed clauses that read
  // only the atlas's numbers: overlap and rotation, under `spine-html`). What the body does instead is decided by what `A17` prints on
  // the same input, so that one missing file is named once, by the rule whose
  // subject it is: A17 FAILs naming every such file and its path, which keeps
  // the report red; this body adds no FAIL of its own about the file (a
  // second naming), and it does not PASS (a certificate over a size nobody
  // read). It SKIPs with a reason that names the pages it did not read and
  // points at A17 — `unreadSizes` below, at both of the body's exits.
  //
  // ⚠️ Only when nothing else here failed. `skip()` is per assertion, and a
  // skip beside failures puts A06 in two of the report's buckets (the #705
  // argument in `a19.ts`); and a FAIL certifies nothing, so the unread page
  // is A17's alone there. ⚠️ Not the tree's other multi-clause rule either
  // (`../reasons.ts`, #580: a multi-clause assertion SKIPs only when EVERY
  // clause had nothing to measure). That rule is about a clause whose subject
  // list is EMPTY — zero is a count, and a count was measured. A page the
  // atlas declares is a member of the size clause's subject that is present
  // and was not read, and the PASS this replaces claimed it was.
  const unread: string[] = [];
  const unreadSizes = (): void => {
    if (failures > 0 || unread.length === 0) return;
    const total = atlas.pages.length;
    skip(
      'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
      unread.length === total
        ? `no page's size was measured: none of the ${total} page file(s) the atlas declares is on disk, which ` +
            "A17_ATLAS_PAGE_FILES_EXIST names file by file. The clauses that read only the atlas's own numbers found " +
            "nothing to fail, and that is not a pass while every page's size is unread"
        : `the size of ${unread.length} of the ${total} page(s) the atlas declares was not measured — ` +
            `${unread.map((name) => JSON.stringify(name)).join(', ')} — because the file is not on disk, which ` +
            `A17_ATLAS_PAGE_FILES_EXIST names. The ${total - unread.length} page(s) that were read, and the clauses ` +
            "that read only the atlas's own numbers, found nothing to fail, and that is not a pass while a page's size is unread",
    );
  };
  for (const page of atlas.pages) {
    const abs = resolve(input.atlasDir, page.name);
    if (!existsSync(abs)) {
      unread.push(page.name); // A17 names the file; this body says only that it did not read it
      continue;
    }
    // 🔒 **A page that is not a PNG is a named failure, not a throw** (issue
    // #732). The reader's throw used to reach this rule's catch and print as
    // `threw: not a PNG (bad signature)`: the verdict right, the sentence a
    // stack message that named neither what the file was nor what rigc reads.
    // `pngProblem` ([`src/png.ts`](png.ts)) is the one sentence every reader
    // of a page states; this rule prefixes the size the atlas declares, the
    // value the file would have had to carry.
    //
    // 🔒 **And this is the one line that names it** (issue #1064). A file's
    // readability is this rule's subject — it runs under both profiles and
    // asks `pngProblem` first, so on every input where `A19` would find the
    // same page unreadable, this FAIL is already printed. `A19` therefore
    // SKIPs naming the page and pointing here when it failed nothing else,
    // and says nothing about the page when it did: one unreadable file, one
    // line, the way #1055 made one missing file A17's alone.
    //
    // ⚠️ No size is read off a file rigc cannot decode, deliberately. A WebP
    // header carries its dimensions in a fixed field, and reading them would
    // print a number no oracle in this tree has checked (rigc links no WebP
    // reader to compare a parse against), about a page that is refused here
    // either way — and measured, the variant that PASSED a WebP page whose
    // size agreed built green under the default profile and wrote a
    // directory that `render` then refused.
    const header = readPngHeader(abs);
    if (header.problem !== null) {
      fail(
        'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
        `page "${page.name}" declares ${page.width}x${page.height} and its file cannot be read as PNG, so the ` +
          `size was not measured: ${header.problem}`,
      );
    }
    const info = header.info;
    const onPage = atlas.regions.filter((region) => region.page.name === page.name);
    const gridSaid = info === null ? null : pageGridSentence(page, info, onPage);
    if (gridSaid !== null) {
      // 🔒 **Still validity, and now for a measured reason rather than an
      // inherited one** (issue #715). The card that opened this expected the
      // clause to move behind the profile switch once the runtime's mapping
      // was measured — it is declared-size-relative, so a rescaled page
      // draws. What settles it the other way is that the sentence below can
      // name a repair the FORMAT already provides (`scale:`), and that two of
      // the three readers a wrong grid breaks are rigc's own and run under
      // both profiles. The sentence, and the one derivation of the ratio under
      // it, is `pageGridSentence` in [`src/atlas.ts`](atlas.ts): the compiler's
      // region lift states the same one when it is asked for texels on such a
      // page (issue #750), so the two cannot come to describe one page two ways.
      fail('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', gridSaid);
    }
    // 📐 PROFILE, from here down. `pma: false` and no rotation are rigc's atlas
    // CONVENTION, not the atlas format's rules — a packed page with
    // `rotate: 90` is what the Spine packer produces and every official example
    // ships one. Under `spine` an atlas is judged only on whether its declared
    // size matches the file it names.
    if (policy && page.pma) {
      fail('A06_ATLAS_PAGE_SIZE_MATCHES_PNG', `page "${page.name}" claims premultiplied alpha; parts are straight alpha`);
    }
  }
  // 🔒 **A region's rectangle lies inside the page it names, and that is
  // VALIDITY** (issue #694). The clause is not new — it has read the same four
  // numbers since issue #266 — but it stood inside the policy half below, and
  // behind a guard that skipped any page carrying one region that covered it.
  // Both fences were wrong for it. A rectangle that leaves its page is not a
  // convention somebody else may hold differently: `u2 > 1` samples whatever
  // the wrap mode returns, which is never the drawing the pack was made of, so
  // the part draws garbage or nothing at all. Measured on a pack shaped like
  // the two production atlases that found this — a page declaring 2048x256
  // with regions at `2274,0 980x200` and `0,252 100x258` — every atlas
  // assertion passed under the default profile and the first of the two parts
  // drew 0 of the 10,517 pixels it draws when the same rig is built loose.
  //
  // ⭐ The tool's other half already said so, which is what settles where the
  // clause belongs. `resolveFromAtlas` ([`src/compile.ts`](compile.ts)) refuses
  // exactly this rectangle as a `CompileError` under every profile when a pack
  // arrives through `--atlas-in`, so while it was policy here the compiler and
  // the gate disagreed about the same four numbers — and the gate is the only
  // half that a skeleton and a pack somebody else made ever reach.
  //
  // ⚠️ It is stated over `atlas.regions` rather than per page group, because
  // the question is about one region and its own page and needs no neighbour:
  // a page carrying a single full-page region is measured too, and answers
  // trivially. The rectangle is `pageFootprint`'s and nobody else's here
  // (issue #579): what `TextureAtlas` transposes at 90 and not at 270 is
  // `u2`/`v2`, a UV pair `MeshAttachment.computeUVs` never reads for an atlas
  // region, and the page rectangle is a different quantity — transposed at
  // BOTH quarter turns. A region that fits only *because* it is turned is
  // inside its page, and this clause says so.
  for (const region of atlas.regions) {
    const foot = pageFootprint(region);
    if (
      region.x < 0 ||
      region.y < 0 ||
      region.x + foot.width > region.page.width ||
      region.y + foot.height > region.page.height
    ) {
      fail(
        'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
        `region "${region.name}" occupies ${region.x},${region.y} ${foot.width}x${foot.height} of page ` +
          `"${region.page.name}", which is ${region.page.width}x${region.page.height} — a region that runs off ` +
          'its page samples texels that are not there',
      );
    }
  }
  if (!policy) return unreadSizes();
  // ⭐ **One part per page OR a tiling page** (issue #266, follow-up 2). This
  // clause used to be the first alternative alone — every region's UVs
  // `(0,0)-(1,1)` — which is rigc's *unpacked* convention and exactly what
  // `build --pack` stops being true, so `--pack --profile spine-html` had to be
  // a named CLI refusal. A pack is not a defect, and refusing it under this
  // profile meant the one shape that exercises the renderer's shared-page
  // sampling could never be gated by the renderer's own rulebook.
  //
  // What the first alternative bought was the attachment -> region -> file
  // chain being checkable exactly, and `A27` already owns that half and already
  // stands down on a multi-region page. What is left to check on a *tiling*
  // page is what makes shared-page sampling well defined at all: no two regions
  // on one page overlapping. A foreign pack can fail that while loading clean,
  // and two overlapping rectangles put one drawing inside another's.
  //
  // ⚠️ Its sibling — every region inside the page it names — moved above and
  // out of this profile in issue #694, and the two are not symmetrical. That
  // one is broken for every consumer; this one is a statement about what a
  // pack MEANS, and the corpus is the evidence rather than the taste:
  // measured over the ten atlases in `examples/`, 0 of 132 regions are off
  // their page and 49 pairs on four of those pages overlap, editor-exported
  // and correct. A rule that called those files broken would be one
  // consumer's convention refusing everybody else's data, which is the thing
  // the profile split exists to prevent.
  //
  // ⚠️ Rotation stays refused either way, and that is not the same clause: it
  // is about rigc's own packer never turning a region, which is a statement
  // about what rigc WRITES. It stopped being a statement about what rigc can
  // read in issue #570 — `extractRegion` now lifts a rotated region back off
  // its page, measured against `MeshAttachment.computeUVs` (`PKR02`) — and the two
  // must not be re-merged: an artifact under the renderer's own rulebook that
  // rigc did not pack is still a foreign artifact, whatever rigc can measure.
  const regionsPerPage = new Map<string, AtlasRegionEntry[]>();
  for (const region of atlas.regions) {
    const on = regionsPerPage.get(region.page.name);
    if (on) on.push(region);
    else regionsPerPage.set(region.page.name, [region]);
  }
  for (const [pageName, on] of regionsPerPage) {
    // The `onePartPerPage` guard that stood here went with the clause it was
    // written for: with only the pair check left, a page carrying one region
    // has no pair and the loop below does nothing on it anyway. Nothing reads
    // `u`/`v`/`u2`/`v2` in this assertion any more, which is the point of
    // #579 kept rather than restated.
    const rects = on.map((region) => {
      const foot = pageFootprint(region);
      return { name: region.name, x: region.x, y: region.y, width: foot.width, height: foot.height };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
          fail(
            'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
            `regions "${a.name}" (${a.x},${a.y} ${a.width}x${a.height}) and "${b.name}" (${b.x},${b.y} ` +
              `${b.width}x${b.height}) overlap on page "${pageName}"; a page is one part covering it exactly or ` +
              'a tiling of regions that do not, and two rectangles over the same texels put one drawing inside ' +
              "the other's",
          );
        }
      }
    }
  }
  for (const region of atlas.regions) {
    if (region.degrees !== 0) {
      fail(
        'A06_ATLAS_PAGE_SIZE_MATCHES_PNG',
        `region "${region.name}" is rotated; rigc's own packer never turns a region (see PACK_NO_ROTATE in ` +
          'src/atlas.ts), so this atlas came from somewhere else',
      );
    }
  }
  unreadSizes();
}
