/**
 * A27, the body (issue #1025, step 4c of #380): the only region on a page is
 * named for the page's file.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the regions
 * are a fact (`../facts/atlas_regions.ts`). Why the second link of the
 * attachment -> region -> file chain needs holding stays above the `check`
 * call in `validate()`.
 */
import { basename } from 'node:path';
import type { Verdicts } from '../harness.ts';
import type { AtlasRegionFacts } from '../facts/atlas_regions.ts';
import { SKIP_NO_ATLAS, SKIP_NO_ATLAS_REGION } from '../reasons.ts';

export function a27RegionNameMatchesPageFilename({ fail, skip }: Verdicts, { atlas }: AtlasRegionFacts): void {
  if (!atlas) return skip('A27_REGION_NAME_MATCHES_PAGE_FILENAME', SKIP_NO_ATLAS);
  if (atlas.regions.length === 0) return skip('A27_REGION_NAME_MATCHES_PAGE_FILENAME', SKIP_NO_ATLAS_REGION);
  const perPage = new Map<string, number>();
  for (const region of atlas.regions) perPage.set(region.page.name, (perPage.get(region.page.name) ?? 0) + 1);
  for (const region of atlas.regions) {
    // A real packer puts many regions on one page and the names stop matching
    // filenames by design. Then this check has nothing to say, so it says
    // nothing rather than something wrong.
    if ((perPage.get(region.page.name) ?? 0) !== 1) continue;
    const expected = basename(region.page.name).replace(/\.png$/i, '');
    if (region.name !== expected) {
      fail(
        'A27_REGION_NAME_MATCHES_PAGE_FILENAME',
        `region "${region.name}" is the only region on page "${region.page.name}", whose basename is "${expected}"`,
      );
    }
  }
}
