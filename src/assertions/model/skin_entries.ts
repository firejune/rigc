/**
 * The model side's supply of `SkinEntryFacts` (issue #1025, step 4c of #380):
 * the skins' region attachments and clipping count, read off the document.
 *
 * ⭐ **In the file's order, by the emitter's own rule.** The document holds the
 * skins in the spec's order and the Spine file holds them in the editor's
 * (`default` first, the rest by the editor's comparator), so a walk of the
 * document in its own order lists the same entries in another order on a rig
 * whose skins the comparator moves — the census measured that on 3 of 52
 * multi-skin compiles. The skins are therefore put in the file's order by
 * calling `editorSkinOrder` from `src/compile.ts`, the function the emitter is
 * handed (`emitSkins`), not by a copy of its rule. Within a skin the entries go
 * slot by slot in the skeleton's slot order — the document's `slots`, which is
 * the emitted array's order — and a slot's entries in its table's order, which
 * the emitter writes unchanged; the selftest measures this walk equal to
 * spine-core's on every multi-skin build it makes.
 *
 * A region's name is the record's `name`, else its placeholder — `shownRow`'s
 * rule in the core — and its size the record's `width` and `height`, the
 * numbers the file states (`readModel` refuses a size that is not a finite
 * number, so a size the runtime would load as NaN has no document to arrive in).
 *
 * Links nothing from the runtime.
 */
import { editorSkinOrder } from '../../compile.ts';
import { shownRow } from '../../core/index.ts';
import type { RegionEntry, SkinEntryFacts } from '../facts/skin_entries.ts';
import type { ReadDocument } from './parse.ts';

/** How the skins are put in the file's order: the emitter's rule. A parameter only so the selftest can show what the document's own order would print (`VF05`). */
export type SkinOrder = <T extends { name: string }>(skins: readonly T[]) => T[];

/** The skins' entries in the file's walk order, each with its skin, slot and placeholder. */
export function fileOrderedEntries(read: ReadDocument, order: SkinOrder = editorSkinOrder): Array<{ skin: string; slot: string; placeholder: string; record: ReadDocument['doc']['skins'][number]['attachments'][string][string] }> {
  const out: ReturnType<typeof fileOrderedEntries> = [];
  for (const skin of order(read.doc.skins)) {
    for (const { name: slot } of read.doc.slots) {
      const table = skin.attachments[slot];
      if (table === undefined) continue;
      for (const [placeholder, record] of Object.entries(table)) out.push({ skin: skin.name, slot, placeholder, record });
    }
  }
  return out;
}

export function modelSkinEntries(read: ReadDocument, order: SkinOrder = editorSkinOrder): SkinEntryFacts {
  const regionAttachments: RegionEntry[] = [];
  let clippingCount = 0;
  for (const entry of fileOrderedEntries(read, order)) {
    if (entry.record.kind === 'clipping') clippingCount++;
    if (entry.record.kind !== 'region') continue;
    const geometry = entry.record.geometry;
    // `readModel` reads every region record's geometry or refuses the document, so a record without one is this module's defect.
    if (geometry?.kind !== 'region') throw new Error(`internal: skin "${entry.skin}" slot "${entry.slot}" placeholder "${entry.placeholder}" is a region record the reader returned without its geometry`);
    const shown = shownRow(entry);
    regionAttachments.push({ name: shown.name, width: geometry.region.width, height: geometry.region.height, path: shown.path as string });
  }
  return { regionAttachments, clippingCount };
}
