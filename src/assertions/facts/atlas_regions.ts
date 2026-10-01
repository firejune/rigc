/**
 * The atlas as the page rules read it (issue #1025, step 4c of #380) — the
 * census's F20 and F21 whole: every page's name, declared size and `pma`, every
 * region's rectangle and the page it sits on, and the region a name resolves
 * to. A06, A19 and A27 read it; A17, which reads only the page names, keeps the
 * narrower `./atlas_pages.ts`.
 *
 * ⭐ **The order is a fact, and it is the file's.** A06 and A27 print one line
 * per offending page or region, and A06's overlap clause prints a pair in the
 * order it meets them, so `pages` and `regions` hold the atlas's own order —
 * pages as the file lists them, regions page by page in the file's order — and
 * `findRegion` answers with the FIRST region of exactly that name, the one the
 * runtime's lookup returns.
 *
 * Links nothing from the runtime: spine-core's `TextureAtlas` satisfies the
 * shape structurally, which is how `validate()` supplies it. The model side
 * supplies the document's `pages` section, with each page's `pma` given by its
 * caller until the document states it (issue #1026) — `../model/atlas_regions.ts`.
 */

/** One page: its name (a path relative to the directory the atlas sits in), the size it declares, and whether it claims premultiplied alpha. */
export interface AtlasRegionPage {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly pma: boolean;
}

/** One region: its name exactly as the atlas spells it, the rectangle in the page's texels, and the page it sits on. */
export interface AtlasRegionEntry {
  readonly name: string;
  readonly page: AtlasRegionPage;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly degrees: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly originalWidth: number;
  readonly originalHeight: number;
}

/** The atlas, or `null` when there is none to read — the round trip refused it, or the model side read no document. */
export interface AtlasRegionFacts {
  readonly atlas: {
    readonly pages: readonly AtlasRegionPage[];
    readonly regions: readonly AtlasRegionEntry[];
    /** The first region of exactly this name, pages in order — or `null`. */
    findRegion(name: string): AtlasRegionEntry | null;
  } | null;
}
