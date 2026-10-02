/**
 * A49, the body (issue #1099): no two regions on one page draw over each
 * other — refused only where their rectangles overlap **and** what they draw
 * overlaps, so a mesh's region may sit over a neighbour's rectangle wherever
 * its hull is not. The footprint, and why the test is exactly A06's old tiling
 * clause for two rectangles, is `../footprints.ts`.
 *
 * ⭐ **The clause it replaces.** A06 held, under `spine-html`, that no two
 * region rectangles on one page overlap. A rectangle's footprint is the
 * rectangle, so on every pair A06 refused where neither region is a readable
 * mesh hull — every editor alias, every sequence frame, every rotated region,
 * every plant of two rectangles over the same texels — this refuses the same
 * pair, printing the same two rectangles first. What it accepts that A06 did
 * not is a pair whose rectangles overlap where a hull leaves the rectangle
 * transparent: what `--pack-shape polygon` writes.
 *
 * 🔸 **Nothing about the padding.** A06 never held a gap between two
 * rectangles, and the padding a pack was made with is on no file the gate
 * reads — not the atlas, not the model document; only the `pack:` line on
 * stdout states it. The `2 · padding` the packer keeps between footprints is
 * the packer's promise, held by `PK81`.
 *
 * 📐 **Renderer kind, the profile the clause ran under.** Two regions over the
 * same texels is what an editor's packer writes for an alias or a sequence:
 * measured over the ten atlases in `examples/`, 49 pairs on four pages, and a
 * correct editor export. A rule that refused them under `spine` would be one
 * consumer's convention refusing everybody else's data.
 *
 * The order of the lines is the atlas's: pages as they come, and within a page
 * each pair in region order — the order A06's clause printed them in.
 */
import type { Verdicts } from '../harness.ts';
import type { AtlasRegionFacts } from '../facts/atlas_regions.ts';
import type { MeshFacts } from '../facts/mesh_attachments.ts';
import type { RegionJoinFacts } from '../facts/region_joins.ts';
import { footprintOverlap, rectanglesOverlap, regionFootprints, type RegionFootprint } from '../footprints.ts';
import { SKIP_NO_ATLAS, SKIP_NO_ATLAS_PAGE, SKIP_NO_ATLAS_REGION, SKIP_NO_ATLAS_REGION_PAIR } from '../reasons.ts';

const NAME = 'A49_PACKED_FOOTPRINTS_DO_NOT_OVERLAP';

/** A number for the sentence: to four places, trailing zeros dropped — `347`, `81.5`, `1916.5512`. */
const texels = (n: number): string => n.toFixed(4).replace(/\.?0+$/, '');

const rectSaid = (f: RegionFootprint): string => `"${f.region.name}" (${f.rect.x},${f.rect.y} ${f.rect.width}x${f.rect.height})`;

export function a49PackedFootprintsDoNotOverlap({ fail, skip }: Verdicts, facts: AtlasRegionFacts, joins: RegionJoinFacts, meshes: MeshFacts | null): void {
  const { atlas } = facts;
  if (!atlas) return skip(NAME, SKIP_NO_ATLAS);
  if (atlas.pages.length === 0) return skip(NAME, SKIP_NO_ATLAS_PAGE);
  if (atlas.regions.length === 0) return skip(NAME, SKIP_NO_ATLAS_REGION);
  const feet = regionFootprints(facts, joins, meshes);
  const perPage = new Map<string, RegionFootprint[]>();
  for (const foot of feet) {
    const on = perPage.get(foot.region.page.name);
    if (on) on.push(foot);
    else perPage.set(foot.region.page.name, [foot]);
  }
  if ([...perPage.values()].every((on) => on.length < 2)) return skip(NAME, SKIP_NO_ATLAS_REGION_PAIR);
  for (const [pageName, on] of perPage) {
    for (let i = 0; i < on.length; i++) {
      for (let j = i + 1; j < on.length; j++) {
        const a = on[i];
        const b = on[j];
        if (!rectanglesOverlap(a, b)) continue;
        const shared = footprintOverlap(a, b);
        if (shared === null) continue;
        const where =
          a.whole && b.whole
            ? `the two rectangles share ${texels(shared.box.x0)},${texels(shared.box.y0)} ${texels(shared.box.x1 - shared.box.x0)}x${texels(shared.box.y1 - shared.box.y0)}`
            : `what they draw overlaps by ${texels(shared.area)} texel(s) of area inside ${texels(shared.box.x0)},${texels(shared.box.y0)} ` +
              `${texels(shared.box.x1 - shared.box.x0)}x${texels(shared.box.y1 - shared.box.y0)}`;
        fail(
          NAME,
          `regions ${rectSaid(a)} and ${rectSaid(b)} overlap on page "${pageName}", and so do their footprints — ` +
            `"${a.region.name}" draws ${a.drawn}, "${b.region.name}" draws ${b.drawn}; ${where}. One drawing samples ` +
            "texels that are the other's: move one region clear of the other's footprint, or pack the page again",
        );
      }
    }
  }
}
