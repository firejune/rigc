/**
 * The model side's supply of `SkinMeshFacts` (issue #1025, step 4c of #380):
 * every mesh and linked-mesh record of every skin, read off the document in the
 * file's walk order.
 *
 * - **The order** is `fileOrderedEntries`'s (`./skin_entries.ts`): the skins by
 *   the emitter's `editorSkinOrder`, the slots in the document's slot order, a
 *   slot's records in its table's order — the walk the selftest measures equal
 *   to spine-core's `getAttachments()`.
 * - **A linked mesh's geometry is its source's**, read through the core's own
 *   joins rather than a copy of them: the vertices through `sourceOfDoc` and
 *   the UVs and triangles through the draw walk's `meshOf` (`drawWalkOf`), both
 *   in `src/core/index.ts`; and its `width` and `height` are the source
 *   record's too, the two numbers `setSourceMesh` overwrites the link's own
 *   with. `readModel` refuses a link whose source does not resolve, so a miss
 *   here is this module's defect.
 * - **The bones a mesh's weights name** are its bindings' bone names, in the
 *   bindings' order — the document states a weighted vertex by bone NAME, and
 *   the Spine file's index run is the emitter's encoding of exactly that list.
 * - **`worldVerticesLength`** is two per vertex: `2 · bindings.length` for a
 *   weighted mesh, `xy.length` for a plain one — the derivation
 *   `src/deformstructure.ts` already makes for the deform survey.
 * - **`width` and `height`** are the record's, off the document's JSON: the
 *   core's geometry reader keeps a mesh's vertices, UVs and triangles and not
 *   its size, which no pose reads.
 *
 * Links nothing from the runtime.
 */
import { drawWalkOf, shownRow, sourceOfDoc } from '../../core/index.ts';
import type { ModelVertices } from '../../model.ts';
import type { MeshEntry, SkinMeshFacts } from '../facts/skin_meshes.ts';
import { isObj } from '../values.ts';
import type { ReadDocument } from './parse.ts';
import { fileOrderedEntries } from './skin_entries.ts';

/** A record's own `width` and `height` as the document states them, found by skin (the first of that name, as a link resolves its skin), slot and placeholder. */
function statedSize(read: ReadDocument, skin: string, slot: string, placeholder: string): { width: number; height: number } {
  const skins = Array.isArray(read.json.skins) ? read.json.skins : [];
  const found = skins.find((k: unknown) => isObj(k) && k.name === skin);
  const table = isObj(found) && isObj(found.attachments) ? found.attachments[slot] : undefined;
  const record = isObj(table) ? table[placeholder] : undefined;
  if (!isObj(record) || typeof record.width !== 'number' || typeof record.height !== 'number') {
    throw new Error(`internal: skin "${skin}" slot "${slot}" placeholder "${placeholder}" is a mesh record the document states no width and height for`);
  }
  return { width: record.width, height: record.height };
}

export function modelSkinMeshes(read: ReadDocument): SkinMeshFacts {
  const doc = read.doc;
  const sourceVertices = sourceOfDoc(doc);
  const walk = drawWalkOf(doc, []);
  const slotBone = new Map(doc.slots.map((slot) => [slot.name, slot.bone] as const));
  const meshes: MeshEntry[] = [];
  for (const entry of fileOrderedEntries(read)) {
    if (entry.record.kind !== 'mesh' && entry.record.kind !== 'linkedmesh') continue;
    const g = entry.record.geometry;
    let vertices: ModelVertices;
    let uvs: number[];
    let triangles: number[];
    let size: { width: number; height: number };
    if (g?.kind === 'mesh') {
      ({ vertices, uvs, triangles } = g);
      size = statedSize(read, entry.skin, entry.slot, entry.placeholder);
    } else if (g?.kind === 'linkedmesh') {
      const source = sourceVertices(g.skin, g.slot, g.source);
      const drawn = walk.meshOf(g.skin, g.slot, g.source);
      if (typeof source === 'string' || drawn === undefined) throw new Error(`internal: skin "${entry.skin}" slot "${entry.slot}" placeholder "${entry.placeholder}": ${typeof source === 'string' ? source : 'its source draws no mesh'}, and the reader accepted it`);
      vertices = source;
      ({ uvs, triangles } = drawn);
      size = statedSize(read, g.skin, g.slot, g.source);
    } else {
      // `readModel` reads every mesh and link record's geometry or refuses the document, so a record without one is this module's defect.
      throw new Error(`internal: skin "${entry.skin}" slot "${entry.slot}" placeholder "${entry.placeholder}" is a ${entry.record.kind} record the reader returned without its geometry`);
    }
    const bone = slotBone.get(entry.slot);
    if (bone === undefined) throw new Error(`internal: skin "${entry.skin}" names slot "${entry.slot}", which the reader accepted and the document does not hold`);
    meshes.push({
      name: shownRow(entry).name,
      slot: entry.slot,
      slotBone: bone,
      triangles,
      width: size.width,
      height: size.height,
      regionUVs: uvs,
      worldVerticesLength: vertices.weighted ? 2 * vertices.bindings.length : vertices.xy.length,
      weightBones: vertices.weighted ? vertices.bindings.flatMap((vertex) => vertex.map((binding) => binding.bone)) : [],
    });
  }
  return { meshes };
}
