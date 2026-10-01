/**
 * A21, the body (issue #1025, step 4c of #380): a generated mesh's rim — or
 * a ribbon's entry row — is pinned to the slot's own bone, and a soft region
 * moves only the vertices it declares. An `archetype` rule.
 *
 * Moved out of `src/validate.ts` whole: every clause is about the rig — which
 * vertex sits on the region border or the hull, which bone carries it and at
 * what weight — and a document's mesh states each of those (its `uvs`, its
 * `hull`, its bindings by bone). Nothing it reads is the encoding's. The
 * weights are the runtime's float32, a binding's bone its index in the roster
 * (named back through the roster where the sentence names it), and a link's
 * geometry its source's.
 */
import type { Verdicts } from '../harness.ts';
import type { MeshFacts } from '../facts/mesh_attachments.ts';
import { authoredMeshNames, meshKindOf } from '../mesh_kinds.ts';
import type { RigInfo } from '../../types.ts';

export function a21MeshRimPinned({ fail, skip }: Verdicts, { meshes, bones }: MeshFacts, rig: RigInfo | undefined): void {
  // Without the rig, ring and ribbon cannot be told apart — and the two kinds
  // pin OPPOSITE edges, so guessing one would either check the wrong edge or
  // check nothing while reporting a pass.
  if (!rig) {
    return skip('A21_MESH_RIM_PINNED', 'no rig info (validating a bare directory), so ring and ribbon cannot be told apart');
  }
  if (!meshes.some((m) => m.weights)) {
    return skip('A21_MESH_RIM_PINNED', 'the skeleton has no weighted mesh attachment, so there is no rim to find unpinned');
  }
  // An authored mesh has no rim rigc drew and no entry row rigc placed, and
  // a linked mesh has no rim of its OWN at all — the one it draws belongs to
  // its source, and is measured there. Nothing to measure is a SKIP — never
  // a pass, and never a failure on somebody else's correct geometry.
  //
  // 🔸 A `segments` mesh is rigc's own geometry and still has no rim to pin:
  // its outline is traced off the art and weighted by distance like every
  // other vertex, because a layer pulled by named bones is SUPPOSED to move
  // at its edge. "Pinned to the slot bone" is not a claim that generator
  // makes, so there is nothing here to hold it to — and `A20`'s coherence
  // rules, which it does make, still apply to it in full.
  const rimless = (m: (typeof meshes)[number]): boolean => meshKindOf(m, rig) === 'authored' || meshKindOf(m, rig) === 'segments';
  const measurable = meshes.filter((m) => m.weights && !rimless(m));
  if (measurable.length === 0) {
    const authored = authoredMeshNames(meshes.filter((m) => m.weights), rig);
    const segmented = meshes.filter((m) => m.weights && meshKindOf(m, rig) === 'segments').map((m) => `"${m.name}"`);
    return skip(
      'A21_MESH_RIM_PINNED',
      segmented.length === 0
        ? `every weighted mesh here is authored or linked geometry (${authored.join(', ')}), not a rigc ring or ` +
            'ribbon — rigc did not place its rim, so it has no rim of its own to find unpinned'
        : `every weighted mesh here is ${authored.length ? `authored or linked geometry (${authored.join(', ')}) or ` : ''}` +
            `a "segments" lattice (${segmented.join(', ')}), not a rigc ring or ribbon — a segments mesh weights its ` +
            'outline by distance to the bones it names, so it has no rim pinned to the slot bone to find unpinned',
    );
  }
  for (const mesh of measurable) {
    if (!mesh.weights) continue;
    const perVertexAll = mesh.weights;
    const slotBoneOf = mesh.slotBone;
    // A ribbon's outer boundary is SUPPOSED to move — that is the whole point
    // of a strip that changes length. So the rule splits by mesh kind rather
    // than being relaxed: for a ribbon the invariant is that the ENTRY row
    // cannot move, because that row is where the strip joins the part it
    // comes out of. Both rules protect the same thing (the mesh's join to the
    // plate underneath); they just live at different edges of the mesh.
    //
    // A `contour` takes the hull path below, and that is the check it wants
    // rather than a third branch: a contour mesh's hull IS every vertex it
    // has, and every one is pinned to the slot bone at weight 1, so "the rim
    // is pinned" reads over the whole mesh. If a later contour tier ever
    // moves interior vertices, this is the assertion that has to grow a
    // branch — it will fail rather than pass quietly, which is the right way
    // round.
    if (meshKindOf(mesh, rig) === 'ribbon') {
      const uvs = mesh.regionUVs ?? [];
      let entryRow = 0;
      for (let v = 0; v < perVertexAll.length; v++) {
        if (Math.abs(uvs[v * 2 + 1]) > 1e-6) continue; // not on the entry edge
        entryRow++;
        const vertex = perVertexAll[v];
        if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
          fail(
            'A21_MESH_RIM_PINNED',
            `ribbon "${mesh.name}" entry vertex ${v} is not pinned (${vertex.map((w) => w.weight.toFixed(3)).join('+')})`,
          );
          continue;
        }
        if (slotBoneOf && bones[vertex[0].bone] !== slotBoneOf) {
          fail(
            'A21_MESH_RIM_PINNED',
            `ribbon "${mesh.name}" entry vertex ${v} is pinned to "${bones[vertex[0].bone]}", not the anchor bone "${slotBoneOf}"`,
          );
        }
      }
      if (entryRow < 2) {
        fail('A21_MESH_RIM_PINNED', `ribbon "${mesh.name}" has ${entryRow} vertices on its entry edge; a strip needs two`);
      }
      continue;
    }
    // A rim a soft mask deliberately CARRIED (issue #382). The rule splits
    // by declaration rather than being relaxed — the same move the ribbon
    // branch above makes, and for the same reason: a wobbling silhouette is
    // supposed to move, and the invariant is that nothing ELSE does. So on
    // such a mesh a vertex is either pinned to the slot bone at 1 or shared
    // between it and the ONE bone the rig declared, and a third bone, a
    // wrong bone or a weight that does not close is still a failure.
    const boundBone = rig.meshSoftBones[mesh.slot] ?? null;
    if (boundBone !== null) {
      const allowed = new Set([slotBoneOf, boundBone]);
      let carried = 0;
      for (let v = 0; v < perVertexAll.length; v++) {
        const vertex = perVertexAll[v];
        let sum = 0;
        for (const { bone, weight } of vertex) {
          const name = bones[bone];
          if (!allowed.has(name)) {
            fail(
              'A21_MESH_RIM_PINNED',
              `mesh "${mesh.name}" vertex ${v} is carried by "${name}", and this mesh declares only ` +
                `"${slotBoneOf}" and the soft region's "${boundBone}"`,
            );
          }
          if (name === boundBone && weight > 0) carried = carried + (weight >= 1 ? 1 : 0);
          sum += weight;
        }
        if (Math.abs(sum - 1) > 1e-4) {
          fail(
            'A21_MESH_RIM_PINNED',
            `mesh "${mesh.name}" vertex ${v} weights sum to ${sum.toFixed(4)}; a depth-bound mesh splits each ` +
              'vertex between the slot bone and the bound bone, so it closes at 1',
          );
        }
      }
      // A mask that carried nothing reached here as a mesh pinned exactly
      // as before, which is not the thing that was declared.
      if (carried === 0) {
        fail(
          'A21_MESH_RIM_PINNED',
          `mesh "${mesh.name}" declares a soft region on "${boundBone}" and no vertex is fully carried by it`,
        );
      }
      continue;
    }
    const hullVertices = mesh.hullLength / 2;
    if (!Number.isInteger(hullVertices) || hullVertices < 3) {
      fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" declares hull ${mesh.hullLength / 2}; the rim must be a real ring`);
      continue;
    }
    const perVertex = mesh.weights;
    if (hullVertices > perVertex.length) {
      fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" hull is ${hullVertices} of ${perVertex.length} vertices`);
      continue;
    }
    // The rim is the alpha contour where generated pixels meet untouched
    // base. One bone at weight 1, and that bone must be the slot's own —
    // anything else and the seam can move.
    const slotBone = mesh.slotBone;
    for (let i = 0; i < hullVertices; i++) {
      const vertex = perVertex[i];
      if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
        fail(
          'A21_MESH_RIM_PINNED',
          `mesh "${mesh.name}" rim vertex ${i} is not pinned (${vertex.map((v) => v.weight.toFixed(3)).join('+')})`,
        );
        continue;
      }
      if (slotBone && bones[vertex[0].bone] !== slotBone) {
        fail(
          'A21_MESH_RIM_PINNED',
          `mesh "${mesh.name}" rim vertex ${i} is pinned to "${bones[vertex[0].bone]}", not the slot bone "${slotBone}"`,
        );
      }
    }
    // Independent of the ring ORDER: whatever sits on the region border is
    // the outline, and the outline moving means the part's own edge moving.
    // Without this, reordering the rings would move the pinned prefix off
    // the outline and A21 would still pass on the count alone.
    const uvs = mesh.regionUVs ?? [];
    for (let v = 0; v < perVertex.length; v++) {
      const u = uvs[v * 2];
      const t = uvs[v * 2 + 1];
      const onBorder = [u, t].some((c) => Math.abs(c) < 1e-6 || Math.abs(c - 1) < 1e-6);
      if (!onBorder) continue;
      const vertex = perVertex[v];
      if (vertex.length !== 1 || Math.abs(vertex[0].weight - 1) > 1e-6) {
        fail('A21_MESH_RIM_PINNED', `mesh "${mesh.name}" vertex ${v} is on the region border but not pinned`);
        break;
      }
    }
  }
}
