/**
 * The model side's parse (issue #1025, step 4c of #380): what stands where
 * `A00_ROUNDTRIP_PARSE` stands when there is no spine-core object to load.
 *
 * Two rules, each a named line:
 *
 * - **`A00_MODEL_READ`** — `readModel` (`src/core/index.ts`) read the document.
 *   Its refusals are the parse: every one names the path of what it refused,
 *   and the line carries the reader's own sentence. A document it refuses is
 *   one whose wrongness has no readable model to live in — a size that is
 *   absent, a colour that is not hex, key times that do not increase (the
 *   census found four of the slice's mutants there) — and that refusal is the
 *   model side's verdict on it.
 * - **`A00_MODEL_REGIONS_ON_PAGES`** — every region a record resolves through
 *   is a region of the document's `pages`, and no region record states an
 *   `atlas` of `null`. Measured by the census before this rule existed: 23
 *   cases fail `A00_ROUNDTRIP_PARSE` in a selftest run, and 14 of them are
 *   documents `readModel` accepts — a record's path naming no region (five
 *   forged), and nine builds whose model holds `atlas: null` because the build
 *   had no art or its pack lacked the region. spine-core refuses all fourteen
 *   at load (`Region not found in atlas`), and the core refused them only when
 *   it posed. This rule refuses them where the parse does, by the record's
 *   address and the region's name.
 *
 * The region a record resolves through is the core's rule, called rather than
 * restated: its name and path are `shownRow`'s (path, else name, else the
 * placeholder), a series' frame names are `frameRegionName` over the series
 * `readUvSequences` reads, and a name is looked up as `documentPageLookup`
 * looks it up — the first region of that exact spelling, pages in order.
 *
 * ⛔ Rejected: the codes `M00_…` (`M` plus two digits names a mutant row in the
 * selftest — `M03`, `M12` — and a reader of a report could not tell a rule
 * from a plant), and a new assertion number (`A50`): the gate's registry would
 * then demand the row of every `validate()` report, and these two rules have no
 * meaning there. `A00_` because they stand in A00's place, and `_MODEL_`
 * because they are the model side's.
 *
 * Links nothing from the runtime.
 */
import { CORE_REGION_KINDS, CoreInputError, readModel, shownRow, type CompiledDocument } from '../../core/index.ts';
import { documentPageLookup, frameRegionName, readUvSequences } from '../../core/uvs.ts';
import type { AssertionKind } from '../kinds.ts';
import type { Verdicts } from '../harness.ts';

/** The reader's refusal, as a line. */
export const A00_MODEL_READ = 'A00_MODEL_READ';
/** The region rule, as a line. */
export const A00_MODEL_REGIONS_ON_PAGES = 'A00_MODEL_REGIONS_ON_PAGES';

/** The two rules' kinds: both are validity — a document either is one a build could pose, or it is not. */
export const MODEL_PARSE_KIND: Readonly<Record<string, AssertionKind>> = {
  [A00_MODEL_READ]: 'validity',
  [A00_MODEL_REGIONS_ON_PAGES]: 'validity',
};

/** What the region rule SKIPs with when the reader refused the document. */
export const SKIP_NO_MODEL_DOCUMENT = `the reader refused the document, so there is no record to resolve (${A00_MODEL_READ} owns that failure)`;
/** What A08 SKIPs with on the model side over a `rigc-compiled/1` document, which states no pages to read region names off (issue #1025, cut 4c-1). */
export const SKIP_NO_MODEL_PAGES = 'the document is a rigc-compiled/1 document, which states no pages, so there are no region names to join against';
/** What the region rule SKIPs with when no record resolves through a region. */
export const SKIP_NO_REGION_RECORD = 'no record of the document resolves through an atlas region';

/** The document as both readings hold it: `readModel`'s, and the JSON the suppliers read spellings from. */
export interface ReadDocument {
  doc: CompiledDocument;
  json: Record<string, unknown>;
}

/** `A00_MODEL_READ`'s body: the document read, or the reader's refusal as a FAIL. Returns the read document or null. */
export function modelRead({ fail }: Verdicts, modelText: string): ReadDocument | null {
  let doc: CompiledDocument;
  try {
    doc = readModel(modelText);
  } catch (err) {
    if (!(err instanceof CoreInputError)) throw err;
    fail(A00_MODEL_READ, err.message);
    return null;
  }
  return { doc, json: JSON.parse(modelText) as Record<string, unknown> };
}

/**
 * Every region name each record resolves through, by the record's address —
 * the census's rule R-region, read with the core's own lookups. A record of a
 * kind that draws no region (clipping, path, bounding box) resolves through
 * none.
 */
export function regionNamesOf(read: ReadDocument): Array<{ where: string; names: string[]; atlasNull: boolean }> {
  const sequences = readUvSequences(read.json);
  const out: Array<{ where: string; names: string[]; atlasNull: boolean }> = [];
  for (const skin of read.doc.skins) {
    for (const [slot, table] of Object.entries(skin.attachments)) {
      for (const [placeholder, record] of Object.entries(table)) {
        if (!CORE_REGION_KINDS.has(record.kind)) continue;
        const path = shownRow({ skin: skin.name, placeholder, record }).path as string;
        const series = sequences.get(`${skin.name}/${slot}/${placeholder}`);
        const names = series === undefined ? [path] : Array.from({ length: series.count }, (_, i) => frameRegionName(path, series, i));
        out.push({ where: `skin "${skin.name}" slot "${slot}" placeholder "${placeholder}"`, names, atlasNull: record.kind === 'region' && record.atlas === null });
      }
    }
  }
  return out;
}

/** `A00_MODEL_REGIONS_ON_PAGES`'s body. Returns whether the document passed it. */
export function modelRegionsOnPages({ fail, skip }: Verdicts, read: ReadDocument): boolean {
  let records: ReturnType<typeof regionNamesOf>;
  try {
    records = regionNamesOf(read);
  } catch (err) {
    // A series `readModel` keeps only the count of: `readUvSequences` refuses its `start` or `digits` by path.
    if (!(err instanceof CoreInputError)) throw err;
    fail(A00_MODEL_REGIONS_ON_PAGES, err.message);
    return false;
  }
  if (records.length === 0) {
    skip(A00_MODEL_REGIONS_ON_PAGES, SKIP_NO_REGION_RECORD);
    return true;
  }
  if (read.doc.pages === null) {
    fail(A00_MODEL_REGIONS_ON_PAGES, `the document is ${read.doc.spec}, which states no pages, so none of the ${records.length} record(s) that resolve through a region can be found on one`);
    return false;
  }
  const lookup = documentPageLookup(read.doc.pages);
  let held = true;
  for (const { where, names, atlasNull } of records) {
    if (atlasNull) {
      fail(A00_MODEL_REGIONS_ON_PAGES, `${where}: the region record's atlas is null — the build had no rectangle for "${names[0]}", and a runtime loading it finds no region`);
      held = false;
    }
    for (const name of names) {
      if (lookup(name) !== null) continue;
      fail(A00_MODEL_REGIONS_ON_PAGES, `${where}: resolves through the region ${JSON.stringify(name)}, which no page of the document holds`);
      held = false;
    }
  }
  return held;
}
