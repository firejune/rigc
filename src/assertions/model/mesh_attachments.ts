/**
 * The model side's supply of `MeshFacts` (issue #1025, step 4c of #380): the
 * document's mesh and linked-mesh records, in the file's walk order, with the
 * geometry and the weights the runtime holds after its parse.
 *
 * Every value is the document's, through a function rigc already runs:
 *
 * - **The order** is `fileOrderedEntries` (`./skin_entries.ts`), the skins
 *   put in the file's order (`fileSkinOrder`, issue #1034).
 * - **A binding's bone** is the index the emitter writes for its name,
 *   `boneIndexOf` over the document's bones (`src/emit_spine.ts`), and its
 *   weight the float32 the runtime stores a vertex array in (`Math.fround`,
 *   `src/model.ts`'s 🔸).
 * - **A link's geometry is its source's**: its vertices are the core's
 *   `sourceOfDoc`, its `uvs` and triangles the core's `drawWalkOf(...).meshOf`
 *   — the two lookups the core poses a linked mesh through — and its hull
 *   the source record's, read where those two read it.
 * - **The counts the parser derives**: `worldVerticesLength` is the length
 *   of `uvs` (the length the parser hands its vertex reader for a mesh), and
 *   `hullLength` twice the record's `hull`, which the parser reads at the
 *   mesh row's default of the parser-default table when the key is absent
 *   (`PARSER_DEFAULTS` in `src/keyorder.ts`, which the selftest holds to the
 *   parser row by row).
 *
 * `encoding` is empty on every entry: the document states the weighted form
 * outright and names bones, so the clauses about the flat run have no subject
 * here (`../facts/mesh_attachments.ts`'s 🔒).
 *
 * Links nothing from the runtime.
 */
import { boneIndexOf } from '../../emit_spine.ts';
import { drawWalkOf, shownRow, sourceOfDoc } from '../../core/index.ts';
import { PARSER_DEFAULTS } from '../../keyorder.ts';
import type { ModelVertices } from '../../model.ts';
import type { MeshBinding, MeshEntry, MeshFacts } from '../facts/mesh_attachments.ts';
import { fileOrderedEntries } from './skin_entries.ts';
import type { ReadDocument } from './parse.ts';

/** The parser's reading of a mesh with no `hull` key, off the parser-default table. */
function hullDefault(): number {
  const stated = PARSER_DEFAULTS['mesh attachment']?.hull;
  if (typeof stated !== 'number') throw new Error('internal: the parser-default table has no number for a mesh attachment\'s hull');
  return stated;
}

export function modelMeshFacts(read: ReadDocument): MeshFacts {
  const { doc } = read;
  const indexOf = boneIndexOf(doc.bones);
  const sourceVertices = sourceOfDoc(doc);
  const walk = drawWalkOf(doc, []);
  const slotBone = new Map(doc.slots.map((s) => [s.name, s.bone]));
  const meshes: MeshEntry[] = [];
  for (const entry of fileOrderedEntries(read)) {
    const g = entry.record.geometry;
    if (g === undefined || (g.kind !== 'mesh' && g.kind !== 'linkedmesh')) continue;
    const where = `skin "${entry.skin}" slot "${entry.slot}" placeholder "${entry.placeholder}"`;
    let vertices: ModelVertices;
    let uvs: readonly number[];
    let triangles: readonly number[];
    let hull: number | undefined;
    if (g.kind === 'mesh') {
      ({ vertices, uvs, triangles, hull } = g);
    } else {
      // `readModel` resolves every link to a mesh or refuses the document, so a miss here is this module's defect.
      const found = sourceVertices(g.skin, g.slot, g.source);
      const drawn = walk.meshOf(g.skin, g.slot, g.source);
      if (typeof found === 'string' || drawn === undefined) throw new Error(`internal: ${where} is a link the reader returned without a source mesh: ${typeof found === 'string' ? found : 'no uvs'}`);
      vertices = found;
      ({ uvs, triangles } = drawn);
      const source = doc.skins.find((k) => k.name === g.skin)?.attachments[g.slot]?.[g.source]?.geometry;
      hull = source?.kind === 'mesh' ? source.hull : undefined;
    }
    const weights: MeshBinding[][] | null = vertices.weighted ? vertices.bindings.map((influences) => influences.map((b) => ({ bone: indexOf(b.bone), weight: Math.fround(b.weight) }))) : null;
    meshes.push({
      name: shownRow(entry).name,
      skin: entry.skin,
      slot: entry.slot,
      slotBone: slotBone.get(entry.slot) ?? '',
      placeholder: entry.placeholder,
      link: g.kind === 'linkedmesh' ? { source: g.source } : null,
      triangles,
      worldVerticesLength: uvs.length,
      regionUVs: uvs,
      hullLength: 2 * (hull ?? hullDefault()),
      weights,
      encoding: [],
    });
  }
  return { bones: doc.bones.map((b) => b.name), meshes };
}
