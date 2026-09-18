/**
 * Writing the compiled atlas to disk with its pages copied alongside it — the
 * step behind `build --copy-images` (issue #217).
 *
 * `compile()` never touches the filesystem for output; it only reads inputs and
 * assembles text (see its own header). A page's name in that text is a path *as
 * seen from the atlas file* — for the default emit `relative(outDir, absPath)`,
 * for `--atlas-in` the imported pack's own page re-anchored the same way — so it
 * points at wherever the source art already lives, which is very often outside
 * `outDir` (`../parts/torso.png`). That is the right default for a build that
 * sits beside the project that owns the art, and it is exactly what makes
 * `--out` non-self-contained the moment the directory is zipped, committed or
 * handed to someone who does not have that project.
 *
 * `copyAtlasPages` is the opt-in other half: copy every page the atlas names
 * into the output directory and hand back the same atlas text with its page
 * names rewritten to match. Nothing here runs unless `cli.ts` calls it, so the
 * default emit (`buildAtlasText` in [`src/compile.ts`](compile.ts)) is untouched.
 *
 * ## 🚨 Why it reads the atlas rather than the image list (issue #693)
 *
 * It used to take `CompiledImage[]` and rebuild the text with
 * `buildAtlasText` — one page per part, each region covering its page exactly.
 * That is a true statement about the DEFAULT emit and about nothing else, and
 * `--atlas-in` is the else: there the atlas is the imported pack, whose pages
 * carry many regions at measured rectangles and whose page count has no relation
 * to the number of parts. Rebuilding it from the image list wrote a file the
 * pack never contained, in two shapes, both of them green at the gate because
 * the gate had read the compile's text and the rebuild happened after it:
 *
 *   * a rig that declares no `image` at all — which is what `ingest --art none`
 *     writes, and it is the documented route for rebuilding somebody's export —
 *     has an EMPTY image list, so the rebuilt atlas was `writeAtlasText([])`:
 *     **zero bytes**. `validate` on the directory then reported
 *     `A00_ROUNDTRIP_PARSE` and one `A08` per attachment, on all 10 corpus
 *     rebuilds;
 *   * a rig that does declare parts got one fabricated page per part, all of
 *     them named after the pack's single page and each claiming the drawing's
 *     own size: 24 pages called `skeleton.png` declaring 800x880, 440x448, …
 *     against one 1024x2048 PNG, and 24 `A06` failures on the written directory.
 *
 * The pages an atlas names are the pages an atlas has. Reading them out of the
 * text is the one rule that is true of both emits — and on the default emit it
 * reproduces the old text byte for byte, because there the page list and the
 * image list are the same list (`PKR44`).
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { parseAtlasText, rewritePageNames } from './atlas.ts';

/** One page's source and where `--copy-images` put it. */
export interface CopiedPage {
  /** The page name as the atlas spelled it: a path relative to the atlas file. */
  from: string;
  /** Filename inside the output directory — also the atlas's new page name. */
  to: string;
  /** How many regions ride on this page, so a shared page says so. */
  regions: number;
}

export interface CopyImagesResult {
  /** The atlas text, with every page name rewritten to its `to` filename. */
  atlasText: string;
  pages: CopiedPage[];
}

/**
 * Copy every page `atlasText` names into `outDir` and return the same text with
 * the page names rewritten to the copies.
 *
 * `atlasText` is the text that is about to be written INTO `outDir`, so its page
 * names resolve against `outDir` — the same anchor `A06` and `A17` read them
 * with, which is what makes "the pages this atlas names" one thing rather than
 * two.
 *
 * ## Naming and collisions
 *
 * A page's filename in `outDir` is its source basename, unchanged. Two pages
 * that live in different directories can still share one, and a case-insensitive
 * filesystem (the macOS default) can collide two the atlas saw as distinct. On a
 * genuine collision the second and later claimants get `-2`, `-3`, … inserted
 * before the extension, assigned in the order the atlas lists its pages — which
 * is also the order the rewritten text carries them in, so the mapping is
 * identical on every run over the same text. The rewritten atlas is the record
 * of it: reading a page name back out says exactly which file it is, with no
 * side table to fall out of sync.
 *
 * ⚠️ A page that ALREADY sits in `outDir` under the name it would be copied to
 * is left alone. There is nothing to move, and `copyFileSync` onto the path it
 * is reading is not a defined way to say so.
 */
export function copyAtlasPages(atlasText: string, outDir: string): CopyImagesResult {
  mkdirSync(outDir, { recursive: true });

  const parsed = parseAtlasText(atlasText);
  const claimedBy = new Map<string, string>(); // destination filename -> absolute source holding it
  const pages: CopiedPage[] = [];

  for (const page of parsed.pages) {
    const source = resolve(outDir, page.name);
    const original = basename(page.name);
    let name = original;
    if (claimedBy.has(name) && claimedBy.get(name) !== source) {
      const ext = extname(original);
      const stem = original.slice(0, original.length - ext.length);
      let n = 2;
      do {
        name = `${stem}-${n}${ext}`;
        n++;
      } while (claimedBy.has(name) && claimedBy.get(name) !== source);
    }
    claimedBy.set(name, source);
    pages.push({ from: page.name, to: name, regions: page.regions.length });
  }

  for (const page of pages) {
    const source = resolve(outDir, page.from);
    const destination = join(outDir, page.to);
    if (source !== resolve(destination)) copyFileSync(source, destination);
  }

  return { atlasText: rewritePageNames(parsed, (_name, index) => pages[index].to), pages };
}
