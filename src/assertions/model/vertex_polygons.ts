/**
 * The model side's supply of `PolygonFacts` (issue #1025, step 4c of #380):
 * the document's bounding boxes, clipping attachments and paths, and the
 * clip ends it states.
 *
 * - **The polygons** in the loaded walk's order, `fileOrderedEntries`
 *   (`./skin_entries.ts`). A polygon's `worldVerticesLength` is twice the
 *   `vertexCount` the record states — the number the emitter copies into the
 *   file, which the parser doubles into the length it reads the vertices to
 *   (`readVertices`); the selftest compares it with spine-core's on every
 *   call. A path's `closed` and `lengths` are the core's reading of the record
 *   (`readGeometry`: `closed` absent reads the parser's `false`).
 * - **The clip ends** in the order the file spells them: the skins by the
 *   emitter's `editorSkinOrder`, each skin's slot keys by its
 *   `editorSlotKeyOrder` (both `src/compile.ts`, the functions `emitSkins` is
 *   handed), each slot's records in table order — every clipping record that
 *   states an `end`, with the `end` as it states it.
 *
 * `encoding` is empty on every polygon: the document states the weighted
 * form outright, so a run's decode has no subject here.
 *
 * Links nothing from the runtime.
 */
import { editorSkinOrder, editorSlotKeyOrder } from '../../compile.ts';
import { shownRow } from '../../core/index.ts';
import type { ClipEnd, PolygonEntry, PolygonFacts } from '../facts/vertex_polygons.ts';
import { isObj, type Json } from '../values.ts';
import { fileOrderedEntries } from './skin_entries.ts';
import type { ReadDocument } from './parse.ts';

/** The document's own record of one skin entry, as the JSON spells it. */
export function documentRecord(read: ReadDocument, skin: string, slot: string, placeholder: string): Json {
  const skins = Array.isArray(read.json.skins) ? read.json.skins.filter(isObj) : [];
  const table = skins.find((s) => s.name === skin)?.attachments;
  const record = isObj(table) && isObj(table[slot]) ? (table[slot] as Json)[placeholder] : undefined;
  if (!isObj(record)) throw new Error(`internal: skin "${skin}" slot "${slot}" placeholder "${placeholder}" is a record the reader returned and the document does not spell`);
  return record;
}

/** Every record of the document in the order the Spine file spells it: skins, then each skin's slot keys, then the slot's table. */
export function fileSpelledEntries(read: ReadDocument): Array<{ skin: string; slot: string; placeholder: string; record: Json }> {
  const out: Array<{ skin: string; slot: string; placeholder: string; record: Json }> = [];
  for (const skin of editorSkinOrder(read.doc.skins)) {
    for (const [slot, table] of Object.entries(editorSlotKeyOrder(skin.attachments))) {
      for (const placeholder of Object.keys(table)) out.push({ skin: skin.name, slot, placeholder, record: documentRecord(read, skin.name, slot, placeholder) });
    }
  }
  return out;
}

const WHAT: Readonly<Record<string, string>> = { boundingbox: 'bounding box', clipping: 'clipping attachment', path: 'path' };

export function modelPolygonFacts(read: ReadDocument): PolygonFacts {
  const polygons: PolygonEntry[] = [];
  for (const entry of fileOrderedEntries(read)) {
    const g = entry.record.geometry;
    if (g === undefined || (g.kind !== 'boundingbox' && g.kind !== 'clipping' && g.kind !== 'path')) continue;
    const stated = documentRecord(read, entry.skin, entry.slot, entry.placeholder).vertexCount;
    polygons.push({
      what: `${WHAT[g.kind]} "${shownRow(entry).name}"`,
      worldVerticesLength: typeof stated === 'number' ? stated * 2 : Number.NaN,
      path: g.kind === 'path' ? { closed: g.closed, lengths: g.lengths } : null,
      encoding: [],
    });
  }
  const clipEnds: ClipEnd[] = [];
  for (const { slot, placeholder, record } of fileSpelledEntries(read)) {
    if (record.kind === 'clipping' && record.end !== undefined) clipEnds.push({ placeholder, slot, end: record.end });
  }
  return { polygons, clipEnds, slots: read.doc.slots.map((s) => s.name) };
}
