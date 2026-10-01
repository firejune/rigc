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
 *   by the emitter's `editorSkinOrder`, a skin's slot keys by its
 *   `editorSlotKeyOrder` (both `src/compile.ts`, the functions `emitSkins` is
 *   handed) — NOT the draw order `./skin_entries.ts` walks, because A08 walks the
 *   file's keys and the loaded skins do not — and a slot's records in its
 *   table's order. A record of a kind that resolves a region (`CORE_REGION_KINDS`:
 *   region, mesh, linked mesh) joins under its `name`, else its placeholder,
 *   through its `path`, else that name; a `sequence` makes the lookups
 *   `attachmentRegionLookups` makes of the Spine file's, called on the
 *   document's own sequence record.
 *
 * Links nothing from the runtime.
 */
import { editorSkinOrder, editorSlotKeyOrder } from '../../compile.ts';
import { CORE_REGION_KINDS } from '../../core/index.ts';
import type { SkinTableEntry } from '../../model.ts';
import type { RegionJoinFacts } from '../facts/region_joins.ts';
import { attachmentRegionLookups, type AttachmentRegionJoin } from '../region_lookups.ts';
import { isObj, type Json } from '../values.ts';
import type { ReadDocument } from './parse.ts';

/** The joins, with the skins and their slot keys put in order by `skins` and `slotKeys` — the emitter's unless the selftest asks what the document's own order would print. */
export function modelRegionJoinsWith(
  read: ReadDocument,
  skins: <T extends { name: string }>(list: readonly T[]) => T[] = editorSkinOrder,
  slotKeys: <T>(table: Record<string, T>) => Record<string, T> = editorSlotKeyOrder,
): RegionJoinFacts {
  const pages = read.doc.pages;
  const regionNames = pages === null ? null : pages.flatMap((page) => page.regions.map((region) => region.name));
  const stated = (Array.isArray(read.json.skins) ? read.json.skins.filter(isObj) : []).filter((skin): skin is Json & { name: string } => typeof skin.name === 'string');
  const joins: AttachmentRegionJoin[] = [];
  for (const skin of skins(stated)) {
    if (!isObj(skin.attachments)) continue;
    for (const [slot, table] of Object.entries(slotKeys(skin.attachments))) {
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
