/**
 * What the model side is given beside the document (issue #1025, step 4c of
 * #380): the two values the census found the document does not hold, which a
 * moved assertion reads — the stage (A14, A19) and each atlas page's `pma`
 * (A06). Both enter the document with issue #1026, and this input goes then.
 *
 * ⛔ **The model side never reads them off a Spine file itself.** A verdict that
 * read `skeleton.json` would be a second reading of the encoding, which is the
 * round trip's subject; so whoever calls the model side states them, from what
 * it holds. The selftest's supplier check and `tools/verdict_gate.ts` hold the
 * build they gate, and read both off it with one function
 * (`modelGivenOfBuild` in that tool): the stage the skeleton header the build
 * wrote states, and each page's `pma` as rigc's own atlas reader
 * (`parseAtlasText`) reads the atlas the build wrote.
 *
 * Links nothing from the runtime.
 */

/** The stage and the pages' `pma`, as the caller states them. */
export interface ModelGiven {
  /** The stage the skeleton states — each extent where it states one — or `null` where it states none. */
  readonly stage: { readonly width?: number; readonly height?: number } | null;
  /** Each page's `pma`, in the atlas's page order: one value per page of the document's `pages`. */
  readonly pma: readonly boolean[];
}
