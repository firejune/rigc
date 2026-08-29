/**
 * Writing the compiled atlas to disk with its pages copied alongside it — the
 * step behind `build --copy-images` (issue #217).
 *
 * `compile()` never touches the filesystem for output; it only reads inputs and
 * assembles text (see its own header). A page's name in that text is
 * `relative(outDir, absPath)` — the PNG's path *as seen from the atlas file* — so
 * it points at wherever the source art already lives, which is very often
 * outside `outDir` (`../parts/torso.png`). That is the right default for a build
 * that sits beside the project that owns the art, and it is exactly what makes
 * `--out` non-self-contained the moment the directory is zipped, committed or
 * handed to someone who does not have that project.
 *
 * `copyAtlasImages` is the opt-in other half: copy every referenced page PNG
 * into the output directory and hand back the atlas text with page names
 * rewritten to match. Nothing here runs unless `cli.ts` calls it, so the default
 * emit (`buildAtlasText` in [`src/compile.ts`](compile.ts)) is untouched.
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { buildAtlasText } from './compile.ts';
import type { CompiledImage } from './types.ts';

/** One page's source and where `--copy-images` put it. */
export interface CopiedPage {
  region: string;
  /** Absolute path the page was read from. */
  from: string;
  /** Filename inside the output directory — also the atlas's new page name. */
  to: string;
}

export interface CopyImagesResult {
  /** The atlas text, with every page name rewritten to its `to` filename. */
  atlasText: string;
  pages: CopiedPage[];
}

/**
 * Copy every image `compile()` referenced into `outDir` and return the atlas
 * text rewritten to match.
 *
 * ## Naming and collisions
 *
 * A page's filename in `outDir` is its source basename, unchanged. That is safe
 * because rigc already enforces a stronger invariant upstream: a region name IS
 * the PNG basename (`compile.ts`'s `addImage`), and two images sharing a region
 * are refused at compile time — so within one compile, no two entries of
 * `images` can legitimately carry the same basename already.
 *
 * The check below exists anyway. "The caller already prevents this" stops being
 * true the moment the caller changes, and a case-insensitive filesystem (the
 * macOS default) can still collide two basenames the region check saw as
 * distinct (`Torso.png` vs `torso.png` are different regions, one destination
 * file). On a genuine collision, the second and later claimants of a name get
 * `-2`, `-3`, … inserted before the extension, assigned in the order `images`
 * lists them — the same order the atlas itself is written in, so the mapping is
 * identical on every run of the same compile. The rewritten atlas is the record
 * of it: reading a page name back out says exactly which file it is, with no
 * side table to fall out of sync.
 */
export function copyAtlasImages(images: CompiledImage[], outDir: string): CopyImagesResult {
  mkdirSync(outDir, { recursive: true });

  const claimedBy = new Map<string, string>(); // destination filename -> absPath holding it
  const pages: CopiedPage[] = [];

  for (const img of images) {
    const original = basename(img.absPath);
    let name = original;
    if (claimedBy.has(name) && claimedBy.get(name) !== img.absPath) {
      const ext = extname(original);
      const stem = original.slice(0, original.length - ext.length);
      let n = 2;
      do {
        name = `${stem}-${n}${ext}`;
        n++;
      } while (claimedBy.has(name) && claimedBy.get(name) !== img.absPath);
    }
    claimedBy.set(name, img.absPath);
    pages.push({ region: img.region, from: img.absPath, to: name });
  }

  for (const page of pages) copyFileSync(page.from, join(outDir, page.to));

  const rewritten: CompiledImage[] = images.map((img, i) => ({ ...img, page: pages[i].to }));
  return { atlasText: buildAtlasText(rewritten), pages };
}
