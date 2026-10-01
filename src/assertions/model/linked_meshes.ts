/**
 * The model side's supply of `LinkFacts` (issue #1025, step 4c of #380): the
 * document's `linkedmesh` records, in the order the Spine file spells them —
 * the skins by the emitter's `editorSkinOrder`, each skin's slot keys by its
 * `editorSlotKeyOrder`, each slot's records in table order
 * (`fileSpelledEntries`, `./vertex_polygons.ts`).
 *
 * `encoding` is empty on every link: a link record has no geometry field, so
 * the geometry keys A44 refuses cannot be spelled here (`../facts/linked_meshes.ts`'s 🔒).
 *
 * Links nothing from the runtime.
 */
import type { LinkEntry, LinkFacts } from '../facts/linked_meshes.ts';
import { fileSpelledEntries } from './vertex_polygons.ts';
import type { ReadDocument } from './parse.ts';

export function modelLinkFacts(read: ReadDocument): LinkFacts {
  const links: LinkEntry[] = [];
  for (const { skin, slot, placeholder, record } of fileSpelledEntries(read)) {
    if (record.kind !== 'linkedmesh' || typeof record.source !== 'string') continue;
    links.push({ skin, slot, placeholder, source: record.source, encoding: [] });
  }
  return { links };
}
