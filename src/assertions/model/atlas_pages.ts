/**
 * The model side's supply of `AtlasPageFacts` (issue #1025, step 4c of #380):
 * the document's `pages` section, which `build` spells from the atlas text it
 * writes (`pagesOfAtlas` in `src/model.ts`), so the page names are the ones
 * the written atlas names, in its order and trimmed as the parser trims them.
 * A `rigc-compiled/1` document states no pages, and reads as no atlas.
 *
 * Links nothing from the runtime.
 */
import type { AtlasPageFacts } from '../facts/atlas_pages.ts';
import type { ReadDocument } from './parse.ts';

export function modelAtlasPages(read: ReadDocument): AtlasPageFacts {
  return { atlas: read.doc.pages === null ? null : { pages: read.doc.pages.map((page) => ({ name: page.name })) } };
}
