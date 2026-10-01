/**
 * The model side of the validator (issue #1025, step 4c of #380): the
 * assertions that moved out of `src/validate.ts`, run over the model document
 * and rigc's core instead of over what spine-core loaded.
 *
 * ⭐ **One body, two suppliers.** Every moved assertion is one function under
 * `../bodies/`, written against a fact interface under `../facts/`.
 * `validate()` supplies the facts from spine-core's loaded objects and calls
 * the body inside its own `check`; this entry supplies them from the document
 * (`./parse.ts`, `./skin_entries.ts`, `./atlas_pages.ts`, `./slot_colour.ts`)
 * and calls the same body inside the same harness (`../harness.ts`). The
 * selftest holds the two to the same lines on every call it makes with a
 * model in hand, and `tools/verdict_gate.ts` on every recipe.
 *
 * 🔸 **What the entry is given.** The document's text, the directory its
 * pages resolve against, and the profile — and nothing read off a Spine file:
 * a model-side verdict that read `skeleton.json` would be a second reading of
 * the encoding, which is the round trip's subject and not the rig's. The stage
 * and the atlas's `pma`, which the document does not hold, are the caller's to
 * give once an assertion that reads them moves (a later cut, the census's §2).
 *
 * ⛔ **Not wired into any command.** `build` keeps the round trip and its
 * forty-nine lines; this entry is what the selftest and the instrument call
 * until every moved assertion is on it (the card's design, point 7).
 *
 * Links nothing from the runtime, directly or through what it imports — held
 * by the selftest's `VF` controls.
 */
import { ASSERTION_KIND, type AssertionProfile } from '../kinds.ts';
import { verdictHarness, type VerdictHarness, type Verdicts, type VerdictLists } from '../harness.ts';
import { SKIP_NO_ATLAS, SKIP_NO_MODEL } from '../reasons.ts';
import { a03RegionWidthHeightFinite } from '../bodies/a03.ts';
import { a11NoClippingAttachments } from '../bodies/a11.ts';
import { a17AtlasPageFilesExist } from '../bodies/a17.ts';
import { a45SeparableColorTimelinesOwnTheirChannelsAndPoseAsWritten } from '../bodies/a45.ts';
import { A00_MODEL_READ, A00_MODEL_REGIONS_ON_PAGES, MODEL_PARSE_KIND, modelRead, modelRegionsOnPages, SKIP_NO_MODEL_DOCUMENT, type ReadDocument } from './parse.ts';
import { modelSkinEntries } from './skin_entries.ts';
import { modelAtlasPages } from './atlas_pages.ts';
import { modelSlotColour } from './slot_colour.ts';
import type { SkinEntryFacts } from '../facts/skin_entries.ts';
import type { AtlasPageFacts } from '../facts/atlas_pages.ts';
import type { SlotColourFacts } from '../facts/slot_colour.ts';

/** What the model side is given. */
export interface ModelValidateInput {
  /** The document `build` writes beside the Spine pair (`skeleton.model.json`). */
  modelText: string;
  /** The directory the document's page names resolve against — the build's `--out`. */
  atlasDir: string;
  profile: AssertionProfile;
}

/** The model side's report: `validate()`'s shape, over the moved assertions and the two parse rules. */
export interface ModelReport extends VerdictLists {
  profile: AssertionProfile;
}

/**
 * The fact families, composed: one supplier per family under `./`, each a
 * function of the read document. A body names the family it reads, so a later
 * cut that moves an assertion over an existing family adds a body file and a
 * row below, and one over a new family adds a facts file, a supplier file and
 * a field here.
 */
export interface ModelSupply {
  skinEntries: (read: ReadDocument) => SkinEntryFacts;
  atlasPages: (read: ReadDocument) => AtlasPageFacts;
  slotColour: (read: ReadDocument) => SlotColourFacts;
}

/** The suppliers the model side runs on. */
export const MODEL_SUPPLY: ModelSupply = { skinEntries: modelSkinEntries, atlasPages: modelAtlasPages, slotColour: modelSlotColour };

/**
 * One moved assertion: its code, and how the model side runs its body once the
 * document is read. The list is the registry of what has moved — each later
 * cut appends its rows — and the selftest reads it for the codes it compares.
 */
export interface MovedAssertion {
  code: string;
  /** The body, over the document. Not called when the model side read no document. */
  run: (verdicts: Verdicts, read: ReadDocument, input: ModelValidateInput, supply: ModelSupply) => void;
  /** What the body SKIPs with when there is no document — the model side's counterpart of the reason `validate()` gives when the round trip produced nothing. */
  unread: string;
}

/**
 * The moved assertions, in `validate()`'s report order. `SKIP_NO_ATLAS` for
 * A17 rather than `SKIP_NO_MODEL` because that is what A17 says over a missing
 * atlas on either side: its body reads only the pages, and on this side no
 * document means no pages.
 */
export const MOVED_ASSERTIONS: readonly MovedAssertion[] = [
  { code: 'A03_REGION_WIDTH_HEIGHT_FINITE', run: (v, read, _input, supply) => a03RegionWidthHeightFinite(v, supply.skinEntries(read)), unread: SKIP_NO_MODEL },
  { code: 'A11_NO_CLIPPING_ATTACHMENTS', run: (v, read, _input, supply) => a11NoClippingAttachments(v, supply.skinEntries(read)), unread: SKIP_NO_MODEL },
  { code: 'A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN', run: (v, read, _input, supply) => a45SeparableColorTimelinesOwnTheirChannelsAndPoseAsWritten(v, supply.slotColour(read)), unread: SKIP_NO_MODEL },
  { code: 'A17_ATLAS_PAGE_FILES_EXIST', run: (v, read, input, supply) => a17AtlasPageFilesExist(v, supply.atlasPages(read), input), unread: SKIP_NO_ATLAS },
];

/** The codes the model side prints: its two parse rules, then the moved assertions. */
export const MODEL_SIDE_CODES: readonly string[] = [A00_MODEL_READ, A00_MODEL_REGIONS_ON_PAGES, ...MOVED_ASSERTIONS.map((m) => m.code)];

/** The parse: the reader, then the region rule. Returns the document when both held. */
function parse(h: VerdictHarness, modelText: string): ReadDocument | null {
  const read = h.check(A00_MODEL_READ, () => modelRead(h.verdicts, modelText)) ?? null;
  if (read === null) {
    h.check(A00_MODEL_REGIONS_ON_PAGES, () => h.skip(A00_MODEL_REGIONS_ON_PAGES, SKIP_NO_MODEL_DOCUMENT));
    return null;
  }
  return h.check(A00_MODEL_REGIONS_ON_PAGES, () => modelRegionsOnPages(h.verdicts, read)) === true ? read : null;
}

/**
 * Run the model side: the parse, then every moved assertion — each over the
 * document, or skipped naming the parse when there is none — and return the
 * report in `validate()`'s shape, which `reportLines` in `src/validate.ts`
 * prints. `plant` replaces a family's supplier; only the selftest's plants
 * pass one.
 */
export function validateModel(input: ModelValidateInput, plant: Partial<ModelSupply> = {}): ModelReport {
  const supply: ModelSupply = { ...MODEL_SUPPLY, ...plant };
  const h = verdictHarness(input.profile, { ...ASSERTION_KIND, ...MODEL_PARSE_KIND }, 'the model side');
  const read = parse(h, input.modelText);
  for (const moved of MOVED_ASSERTIONS) {
    h.check(moved.code, () => (read === null ? h.skip(moved.code, moved.unread) : moved.run(h.verdicts, read, input, supply)));
  }
  const { failures, passed, skipped, profileSkipped, stats } = h;
  return { failures, passed, skipped, profileSkipped, stats, profile: input.profile };
}

