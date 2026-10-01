/**
 * What built a mesh, as the bodies that hold generator topology to its own
 * rules ask it (issue #1025, step 4c of #380) — `A20`, `A21` and `A28`. Moved
 * here from `validate()`'s closures unchanged but for what they read: a mesh
 * entry of `./facts/mesh_attachments.ts` rather than a loaded attachment and
 * the prelude's link map. Links nothing from the runtime.
 */
import type { RigInfo } from '../types.ts';
import type { MeshEntry } from './facts/mesh_attachments.ts';

/**
 * What built this mesh. ring unless the rig says otherwise; absent rig info
 * reads as ring (legacy).
 *
 * 🚨 `authored` is not a third topology, it is the ABSENCE of one rigc may
 * assume. Geometry that came in through the rig spec was drawn by somebody
 * with an editor, and its rim, its row pairing and its entry edge are
 * whatever that person made them. The `||` fallback below used to hand such
 * a mesh the string `ring`, and A21 then checked ring topology on a shape
 * that was never a ring — 40 failures on correct data (issue #44).
 *
 * 🔗 A LINKED mesh borrows another attachment's geometry, so no generator
 * topology is a claim about THIS attachment — and the ARTIFACT says which
 * ones they are (the entry's `link`, read off the file's own `source` keys).
 * It is read from there rather than off `meshKinds` for two reasons, and the
 * second is the load-bearing one.
 *
 *   1. `meshKinds` is keyed by SLOT, and a link's slot is not its
 *      geometry's: a link to a `ring` in another slot looked up the LINK's
 *      slot, found nothing, and took the `|| 'ring'` fallback — issue #44's
 *      own default, reached by a new route. Measured before this clause on
 *      a correct rig (a ring on slot "sa", a link to it on slot "sb"):
 *      **8 A21 failures**, `mesh "sb" rim vertex 0 is pinned to "a", not
 *      the slot bone "b"`, one per hull vertex. The rim is pinned exactly
 *      where the ring's own slot put it, which is the only place it could
 *      be.
 *   2. Writing the link into `meshKinds` instead would have overwritten
 *      the source's kind wherever the two share a slot, which is the
 *      commonest linked mesh there is — silencing A21 on the mesh rigc
 *      DID build. A gate turned off by a feature is worse than a gate
 *      that skips something it cannot measure.
 */
export function meshKindOf(mesh: MeshEntry, rig: RigInfo | undefined): RigInfo['meshKinds'][string] {
  if (mesh.link !== null) return 'authored';
  return rig?.meshKinds[mesh.slot] || 'ring';
}

/**
 * Meshes whose topology is not rigc's to have an opinion about, by name and
 * with the reason each one is on the list — the string several skips need.
 */
export function authoredMeshNames(list: readonly MeshEntry[], rig: RigInfo | undefined): string[] {
  return list
    .filter((m) => meshKindOf(m, rig) === 'authored')
    .map((m) => (m.link === null ? `"${m.name}"` : `"${m.name}" (linked to "${m.link.source}")`));
}
