/**
 * A28, the body (issue #1025, step 4c of #380): a ribbon's rows share their
 * weights. An `archetype` rule.
 *
 * This is what makes "length without width" a property of the file rather than
 * a hope. Both vertices of a row carry the same bones at the same weights, so
 * whatever the chain does to one it does to the other and their separation can
 * only rotate — the strip curves and stretches, and never gets fatter. Give one
 * side a different weight and the strip develops a taper that grows with its
 * travel, which is the sort of thing that reads as bad art rather than as a bug.
 *
 * Moved out of `src/validate.ts` whole: both clauses are about the rig — a
 * document's ribbon states every vertex's bindings — and the row's shape is
 * printed as the file holds it, each bone by its index in the roster and each
 * weight as the runtime's float32. The guard on a skeleton the round trip did
 * not load stays in `validate()`, which has no facts to hand over then.
 */
import type { Verdicts } from '../harness.ts';
import type { MeshFacts } from '../facts/mesh_attachments.ts';
import type { RigInfo } from '../../types.ts';

export function a28RibbonRowsShareWeights({ fail, skip }: Verdicts, facts: MeshFacts | null, rig: RigInfo | undefined): void {
  if (facts === null) return skip('A28_RIBBON_ROWS_SHARE_WEIGHTS', 'the skeleton did not load (A00 owns that failure)');
  if (!rig) return skip('A28_RIBBON_ROWS_SHARE_WEIGHTS', 'no rig info (validating a bare directory), so no mesh is known to be a ribbon');
  const kinds = rig.meshKinds;
  if (!Object.values(kinds).includes('ribbon')) {
    // Say WHICH kind of "no ribbon" this is. "declares no ribbon" is true of a
    // cut with no mesh at all, of one whose meshes are authored geometry, and
    // of one whose meshes are contours — and the last two are cases where a
    // reader should know that a mesh went unmeasured on purpose.
    const unpaired = Object.entries(kinds)
      .filter(([, kind]) => kind === 'authored' || kind === 'contour' || kind === 'segments')
      .map(([slot, kind]) => `"${slot}" (${kind})`);
    return skip(
      'A28_RIBBON_ROWS_SHARE_WEIGHTS',
      unpaired.length
        ? `the rig "${rig.archetype}" declares no ribbon mesh on this cut — its mesh slot(s) ${unpaired.join(', ')} have no rows to pair: authored geometry is somebody else's topology, a contour is one silhouette loop, and a segments lattice has cells rather than cross rows`
        : `the rig "${rig.archetype}" declares no ribbon mesh on this cut`,
    );
  }
  for (const mesh of facts.meshes) {
    if (!mesh.weights) continue;
    // 🔗 A LINKED mesh's rows are its source's and are paired there. Skipped
    // for A21's reason and with A21's failure mode behind it: this reads
    // `meshKinds` at the LINK's slot, which says nothing about the geometry
    // the link borrowed, so a link sitting in a ribbon's slot from another
    // skin would be measured twice and a link to a NON-ribbon in a ribbon's
    // slot would be measured as a strip it was never built as (issue #691).
    if (mesh.link !== null) continue;
    if (rig.meshKinds[mesh.slot] !== 'ribbon') continue;
    const perVertex = mesh.weights;
    if (perVertex.length % 2 !== 0) {
      fail('A28_RIBBON_ROWS_SHARE_WEIGHTS', `ribbon "${mesh.name}" has ${perVertex.length} vertices; a strip has an even count`);
      continue;
    }
    // Perimeter order: left row i is index i, right row i is its mirror.
    const rows = perVertex.length / 2;
    for (let i = 0; i < rows; i++) {
      const left = perVertex[i];
      const right = perVertex[perVertex.length - 1 - i];
      const shape = (v: typeof left) => v.map((w) => `${w.bone}:${w.weight.toFixed(6)}`).join(',');
      if (shape(left) !== shape(right)) {
        fail(
          'A28_RIBBON_ROWS_SHARE_WEIGHTS',
          `ribbon "${mesh.name}" row ${i} has [${shape(left)}] on one side and [${shape(right)}] on the other; its width would change with the chain`,
        );
      }
    }
  }
}
