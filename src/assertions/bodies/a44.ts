/**
 * A44, the body (issue #1025, step 4c of #380): a linked mesh states no
 * geometry of its own.
 *
 * Moved out of `src/validate.ts` by its subject only. Which links the file
 * declares is the rig's — a document's `linkedmesh` record is one — so the
 * roster moved, and a rig with no link SKIPs on both sides. What A44 refuses
 * is the encoding's: a link record holds no geometry field, and `uvs`,
 * `triangles`, `vertices`, `hull` and `edges` written on a link exist only in
 * the Spine text (the census's row for A44). That clause, and the sentence it
 * prints, stay with the round trip, which hands its finding about each link in
 * as the link's `encoding`, printed in the order the body always printed it.
 */
import type { Verdicts } from '../harness.ts';
import type { LinkFacts } from '../facts/linked_meshes.ts';
import { SKIP_NO_LINKED_MESH } from '../reasons.ts';

export function a44LinkedMeshStatesNoGeometryOfItsOwn({ fail, skip }: Verdicts, { links }: LinkFacts): void {
  if (links.length === 0) return skip('A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN', SKIP_NO_LINKED_MESH);
  for (const link of links) {
    for (const detail of link.encoding) fail('A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN', detail);
  }
}
