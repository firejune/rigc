/**
 * What the model side is given beside the document (issue #1025, step 4c of
 * #380): the two values the census found the document does not hold, which a
 * moved assertion reads — the stage (A14, A19) and each atlas page's `pma`
 * (A06). Both entered the document with issue #1026 (`rigc-compiled/3`):
 * a `/3` document is read for them and this input is for a `/2` or `/1`
 * document alone — given beside a `/3` document it is refused by name
 * (`refuseGivenBeside`) rather than ignored, because a value the caller states
 * beside the document's own is a second source for one fact, and a silent
 * winner between two sources is how a verdict comes to pass for the wrong
 * reason.
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

import type { ReadDocument } from './parse.ts';

/**
 * A caller's `given` beside a document that states both values itself
 * (`rigc-compiled/3`, issue #1026), refused by name: the caller is to give
 * them for a `/2` or `/1` document only (`modelGivenOf` in
 * `tools/verdict_gate.ts` gives them exactly then).
 */
export function refuseGivenBeside(read: ReadDocument, given: ModelGiven | undefined): void {
  if (given !== undefined && read.doc.stated !== null) {
    throw new Error(`the caller gave the stage and the pages' pma beside a ${read.doc.spec} document, which states both itself (issue #1026); a second source for one fact is refused rather than one of them silently read`);
  }
}

/** The stage and the pages' `pma`, as the caller states them. */
export interface ModelGiven {
  /** The stage the skeleton states — each extent where it states one — or `null` where it states none. */
  readonly stage: { readonly width?: number; readonly height?: number } | null;
  /** Each page's `pma`, in the atlas's page order: one value per page of the document's `pages`. */
  readonly pma: readonly boolean[];
}
