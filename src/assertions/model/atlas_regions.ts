/**
 * The model side's supply of `AtlasRegionFacts` (issue #1025, step 4c of
 * #380): the document's `pages` section — which `build` spells from the atlas
 * text it writes (`pagesOfAtlas` in `src/model.ts`, the reader `PKR01` holds
 * field for field to spine-core's `TextureAtlas`) — with each page's `pma`
 * given by the caller, because the document does not state it until issue
 * #1026.
 *
 * - The pages and their regions in the document's order, which is the atlas
 *   file's; each region carries the page it sits on.
 * - `findRegion` is the core's lookup, called: `documentPageLookup`
 *   (`src/core/uvs.ts`), the first region of exactly that spelling with pages
 *   in order — the runtime's `findRegion`, measured there.
 * - A `rigc-compiled/1` document states no pages, and reads as no atlas.
 *
 * ⚠️ `pma` is the one value here the document does not hold. A caller that
 * gives none, or gives a list that is not one value per page, is refused by
 * name rather than read as `false`: a page's claim the caller did not state is
 * not a claim of straight alpha.
 *
 * Links nothing from the runtime.
 */
import { documentPageLookup } from '../../core/uvs.ts';
import type { ModelPageRegion } from '../../model.ts';
import type { AtlasRegionEntry, AtlasRegionFacts, AtlasRegionPage } from '../facts/atlas_regions.ts';
import type { ReadDocument } from './parse.ts';
import type { ModelGiven } from './given.ts';

export function modelAtlasRegions(read: ReadDocument, given: ModelGiven | undefined): AtlasRegionFacts {
  const pages = read.doc.pages;
  if (pages === null) return { atlas: null };
  const pma = given?.pma;
  if (pma === undefined || pma.length !== pages.length) {
    throw new Error(`the caller gave ${pma === undefined ? 'no' : pma.length} page pma value(s) for the document's ${pages.length} page(s); the document does not state pma, so the model side cannot read a page without it`);
  }
  const outPages: AtlasRegionPage[] = [];
  const regions: AtlasRegionEntry[] = [];
  const byRecord = new Map<ModelPageRegion, AtlasRegionEntry>();
  pages.forEach((page, i) => {
    const at: AtlasRegionPage = { name: page.name, width: page.width, height: page.height, pma: pma[i] };
    outPages.push(at);
    for (const region of page.regions) {
      const entry: AtlasRegionEntry = {
        name: region.name,
        page: at,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
        degrees: region.degrees,
        offsetX: region.offsetX,
        offsetY: region.offsetY,
        originalWidth: region.originalWidth,
        originalHeight: region.originalHeight,
      };
      regions.push(entry);
      byRecord.set(region, entry);
    }
  });
  const lookup = documentPageLookup(pages);
  return {
    atlas: {
      pages: outPages,
      regions,
      findRegion: (name) => {
        const found = lookup(name);
        return found === null ? null : (byRecord.get(found.region) ?? null);
      },
    },
  };
}
