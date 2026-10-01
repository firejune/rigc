/**
 * A08, the body (issue #1025, step 4c of #380): every region an attachment
 * resolves through is a region the atlas has, spelled exactly.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the atlas's
 * region names and the skin entries' lookups are a fact
 * (`../facts/region_joins.ts`) rather than a `TextureAtlas` built here and the
 * raw JSON's walk. Why the rule runs before the round trip, and what A00 does
 * about a miss it names, is argued above the `check` call in `validate()`,
 * which stays there.
 *
 * `pathsWithNoRegion` is filled, not read: every lookup this body refuses for
 * want of a region, which `validate()`'s A00 reads to defer to this rule rather
 * than restate the miss. The model side hands a set nobody reads.
 */
import type { Verdicts } from '../harness.ts';
import type { RegionJoinFacts } from '../facts/region_joins.ts';
import { SKIP_NO_ATTACHMENT_REGION_JOIN } from '../reasons.ts';

export function a08RegionNamesMatchAttachments({ fail, skip }: Verdicts, facts: RegionJoinFacts, pathsWithNoRegion: Set<string>): void {
  if (facts.regionNames === null) {
    return skip(
      'A08_REGION_NAMES_MATCH_ATTACHMENTS',
      'the atlas text does not parse, so there are no region names to join against (A00 owns that failure)',
    );
  }
  const regionNames = new Set(facts.regionNames);
  if (facts.joins === null) {
    return skip('A08_REGION_NAMES_MATCH_ATTACHMENTS', 'the skeleton JSON did not parse (A00 owns that failure)');
  }
  let joined = 0;
  for (const join of facts.joins) {
    // A `sequence` the walk will not guess at: say nothing rather than invent
    // a region name. A00 still has the last word on it.
    if (join.lookups === null) continue;
    for (const lookup of join.lookups) {
      joined++;
      const at = `skin "${join.skin}" slot "${join.slot}" placeholder "${join.placeholder}"`;
      const present = regionNames.has(lookup);
      if (!present) pathsWithNoRegion.add(lookup);
      if (lookup !== lookup.trim()) {
        fail(
          'A08_REGION_NAMES_MATCH_ATTACHMENTS',
          `${at}: attachment "${join.name}" resolves through path ${JSON.stringify(lookup)}, which has stray ` +
            `whitespace — the atlas is matched on the exact string, and ${
              present
                ? 'the region it finds carries the same padding'
                : regionNames.has(lookup.trim())
                  ? `the region this atlas has is ${JSON.stringify(lookup.trim())}, without it`
                  : 'no region of this atlas carries it'
            }`,
        );
      } else if (!present) {
        // Not a guess and not a repair — a region the atlas DOES hold that
        // differs from the wanted name only by case or padding. It is
        // reported because it was measured, and where there is none the
        // sentence says nothing at all.
        const near = [...regionNames].find((r) => r.trim().toLowerCase() === lookup.toLowerCase());
        fail(
          'A08_REGION_NAMES_MATCH_ATTACHMENTS',
          `${at}: attachment "${join.name}" wants region "${lookup}", which this atlas does not have${
            near === undefined ? '' : ` — it does have ${JSON.stringify(near)}`
          }. Either the skeleton's "path" or the atlas region name is the one that moved`,
        );
      }
    }
  }
  for (const region of regionNames) {
    if (region !== region.trim()) {
      fail('A08_REGION_NAMES_MATCH_ATTACHMENTS', `atlas region ${JSON.stringify(region)} has stray whitespace`);
    }
  }
  if (joined === 0 && regionNames.size === 0) {
    return skip('A08_REGION_NAMES_MATCH_ATTACHMENTS', SKIP_NO_ATTACHMENT_REGION_JOIN);
  }
}
