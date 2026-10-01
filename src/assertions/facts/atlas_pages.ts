/**
 * The atlas's pages, as the bodies that read them see them (issue #1025, step
 * 4c of #380) — the census's F20, without `pma`, which the model document does
 * not hold and a later cut supplies from the caller.
 *
 * Links nothing from the runtime: a spine-core `TextureAtlas` satisfies the
 * shape structurally, which is how `validate()` supplies it, and the model
 * side supplies the document's `pages` section (`../model/atlas_pages.ts`).
 */

/** One page: its name, a path relative to the directory the atlas sits in. */
export interface AtlasPage {
  readonly name: string;
}

/** The atlas, or `null` when there is none to read — the round trip refused it, or the model side read no document. */
export interface AtlasPageFacts {
  readonly atlas: { readonly pages: readonly AtlasPage[] } | null;
}
