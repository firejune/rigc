/**
 * A04, the body (issue #1025, step 4c of #380): every mesh has triangles, in
 * threes, each an index into its own vertices (case 6f).
 *
 * Moved out of `src/validate.ts` clause by clause. The three clauses about
 * the triangles are about the rig — a document's mesh states its triangles
 * and its vertices, so the same wrongness has a place to live there (where
 * the reader refuses two of the three by the record's name) — and moved. The
 * two about the vertex run — a weighted run whose length is not a multiple of
 * three, an unweighted array of another length than the `uvs` — are about
 * the encoding: the document states the weighted form outright, and the flat
 * run is written by the emitter. They stay with the round trip, which hands
 * their findings in as each mesh's `encoding`, printed where the body always
 * printed them.
 */
import type { Verdicts } from '../harness.ts';
import type { MeshFacts } from '../facts/mesh_attachments.ts';
import { SKIP_NO_MESH_ATTACHMENT } from '../reasons.ts';

export function a04MeshTrianglesAndEncoding({ fail, skip }: Verdicts, { meshes }: MeshFacts): void {
  if (meshes.length === 0) return skip('A04_MESH_TRIANGLES_AND_ENCODING', SKIP_NO_MESH_ATTACHMENT);
  for (const mesh of meshes) {
    if (!mesh.triangles || mesh.triangles.length === 0) {
      fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" has no triangles`);
      continue;
    }
    if (mesh.triangles.length % 3 !== 0) {
      fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" triangle count is not a multiple of 3`);
    }
    const vertexCount = mesh.worldVerticesLength / 2;
    for (const idx of mesh.triangles) {
      if (idx < 0 || idx >= vertexCount) {
        fail('A04_MESH_TRIANGLES_AND_ENCODING', `mesh "${mesh.name}" index ${idx} is outside 0..${vertexCount - 1}`);
        break;
      }
    }
    // The encoding's own clauses, kept with the round trip (the header).
    for (const detail of mesh.encoding) fail('A04_MESH_TRIANGLES_AND_ENCODING', detail);
  }
}
