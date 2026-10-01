/**
 * The model side's supply of `RegionJoinFacts` (issue #1025, step 4c of
 * #380): the document's region names and every lookup a skin record makes.
 *
 * - **The region names** are the document's `pages` regions, page by page in
 *   order — `pagesOfAtlas` writes them from the atlas text `build` wrote, by the
 *   reader `PKR01` holds to spine-core's, so they are the atlas's regions in its
 *   order, each name as the atlas spells it. A `rigc-compiled/1` document states
 *   no pages, and the registry skips A08 on it by name rather than reading that
 *   as an atlas that declares no region (`./index.ts`).
 * - **The lookups** walk the document's skins as the file lays them: the skins
 *   and each skin's slot keys in the order `fileSkinOrder` gives
 *   (`src/compile.ts`, issue #1034) — a `rigc-compiled/3` document's
 *   `editorOrder`, else the emitter's `editorSkinOrder` and
 *   `editorSlotKeyOrder`, the functions `emitSkins` is handed — NOT the draw order `./skin_entries.ts` walks, because A08 walks the
 *   file's keys and the loaded skins do not — and a slot's records in its
 *   table's order. A record of a kind that resolves a region (`CORE_REGION_KINDS`:
 *   region, mesh, linked mesh) joins under its `name`, else its placeholder,
 *   through its `path`, else that name; a `sequence` makes the lookups
 *   `attachmentRegionLookups` makes of the Spine file's, called on the
 *   document's own sequence record.
 *
 * Links nothing from the runtime.
 */
import { fileSkinOrder, skinsInFileOrder } from '../../compile.ts';
import { CORE_REGION_KINDS } from '../../core/index.ts';
import type { SkinTableEntry } from '../../model.ts';
import type { RegionJoinFacts } from '../facts/region_joins.ts';
import { attachmentRegionLookups, type AttachmentRegionJoin } from '../region_lookups.ts';
import { isObj, type Json } from '../values.ts';
import type { ReadDocument } from './parse.ts';

/** The skins and each skin's slot keys in an order other than the file's — a parameter only so the selftest can show what that order would print. */
export type SlotKeyWalk = <T extends Json & { name: string }>(skins: readonly T[]) => Array<{ skin: T; slots: readonly string[] }>;

/**
 * The joins, with the skins and their slot keys in the file's order — the order
 * a `rigc-compiled/3` document states, else the emitter's rule
 * (`fileSkinOrder`, issue #1034) — unless the selftest hands `order`, the
 * skins and each skin's slot keys in another order, to show what it would
 * print (`VF09`, `VF11`).
 */
export function modelRegionJoinsWith(read: ReadDocument, order?: SlotKeyWalk): RegionJoinFacts {
  const pages = read.doc.pages;
  const regionNames = pages === null ? null : pages.flatMap((page) => page.regions.map((region) => region.name));
  const stated = (Array.isArray(read.json.skins) ? read.json.skins.filter(isObj) : []).filter((skin): skin is Json & { name: string } => typeof skin.name === 'string');
  const joins: AttachmentRegionJoin[] = [];
  const walk = order === undefined ? skinsInFileOrder(stated, fileSkinOrder(read.doc)) : order(stated);
  for (const { skin, slots } of walk) {
    if (!isObj(skin.attachments)) continue;
    for (const slot of slots) {
      const table = skin.attachments[slot];
      if (!isObj(table)) continue;
      for (const [placeholder, record] of Object.entries(table)) {
        if (!isObj(record) || !CORE_REGION_KINDS.has(record.kind as SkinTableEntry['kind'])) continue;
        const name = typeof record.name === 'string' ? record.name : placeholder;
        const path = typeof record.path === 'string' ? record.path : name;
        joins.push({ skin: skin.name, slot, placeholder, name, lookups: attachmentRegionLookups(record.sequence, path) });
      }
    }
  }
  return { regionNames, joins };
}

export function modelRegionJoins(read: ReadDocument): RegionJoinFacts {
  return modelRegionJoinsWith(read);
}
