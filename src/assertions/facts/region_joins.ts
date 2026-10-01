/**
 * The join from an attachment to an atlas region, before anything loads it
 * (issue #1025, step 4c of #380) — the census's F21 names plus the skin
 * entries' region paths, as A08 reads them: every region name the atlas
 * declares, and every lookup a skin entry will make.
 *
 * 🚨 **Both halves are read before the round trip, on purpose** (issue #589):
 * A08 exists to name a miss the loader would refuse without naming the
 * placeholder or the skin, so it cannot read what the loader produced. On the
 * model side the same holds one step over — A08 runs behind the reader alone,
 * not behind the region rule that stands in A00's place, so a miss is named by
 * A08's sentence on both sides and the parse beside it refuses the same file.
 *
 * ⭐ **The order is the file's.** A08 prints one line per lookup that misses,
 * in the order the skins, a skin's slot keys and a slot's placeholders stand in
 * the file — the emitter's `editorSkinOrder` and `editorSlotKeyOrder`, called
 * on the model side — and then one per padded region name, in the atlas's
 * order.
 *
 * Links nothing from the runtime: `validate()` reads the region names off a
 * `TextureAtlas` it builds for this alone and the lookups off the skeleton
 * JSON; the model side reads both off the document (`../model/region_joins.ts`).
 */
import type { AttachmentRegionJoin } from '../region_lookups.ts';

export type { AttachmentRegionJoin };

/** What A08 reads. Each half is `null` when its file did not parse, and the body says which. */
export interface RegionJoinFacts {
  /** Every region the atlas declares, by its name as spelled (untrimmed), in the atlas's order. */
  readonly regionNames: readonly string[] | null;
  /** Every skin entry that resolves through a region, with the names it will look up, in the file's order. */
  readonly joins: readonly AttachmentRegionJoin[] | null;
}
