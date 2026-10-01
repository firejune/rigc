/**
 * The skin entries, as the bodies that walk them read them (issue #1025, step
 * 4c of #380) — the census's F03, F05 and F06: every skin's attachments, of
 * which kind each is, and a region's name and size.
 *
 * ⭐ **The order is a fact, and it is the file's.** A body that prints one
 * line per offending entry prints them in the order this list holds them, so a
 * supplier that walked another order would print the same findings in another
 * order — a different report about the same rig. The order is the one
 * spine-core's loaded skins list their entries in: the skins in the file's
 * order (`default` first, the rest in the editor's order the emitter writes —
 * `editorSkinOrder` in `src/compile.ts`), and within a skin the entries slot by
 * slot in the skeleton's slot order, each slot's in the order its table states
 * them. The model side produces it by calling the emitter's own order, never
 * by restating it (`../model/skin_entries.ts`); the selftest measures the two
 * walks equal on every multi-skin build it makes.
 *
 * Links nothing from the runtime: a spine-core `RegionAttachment` satisfies
 * the entry shape structurally, which is how `validate()` supplies it.
 */

/** One region attachment: the name it loaded under (its `name`, else its placeholder) and its size. */
export interface RegionEntry {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

/** What the skins hold, for A03 and A11. */
export interface SkinEntryFacts {
  /** Every region attachment of every skin, in the file's walk order (the header's ⭐). */
  readonly regionAttachments: readonly RegionEntry[];
  /** How many clipping attachments the skins hold, every skin counted. */
  readonly clippingCount: number;
}
