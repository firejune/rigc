/**
 * A13, the body (issue #1025, step 4c of #380): the mesh slots and each mesh's
 * triangles stay within the budget the rig declares.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the meshes
 * are a fact (`../facts/skin_meshes.ts`) rather than the lists `validate()`'s
 * prelude filled from spine-core's loaded skins, and the rig info is the
 * caller's. Why the two budgets come from the rig and never from here stays
 * above the `check` call in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { SkinMeshFacts } from '../facts/skin_meshes.ts';
import { SKIP_NO_MESH_ATTACHMENT } from '../reasons.ts';
import type { RigInfo } from '../../types.ts';

export function a13MeshBudget({ fail, skip }: Verdicts, { meshes }: SkinMeshFacts, input: { rig?: RigInfo }): void {
  const meshAttachments = meshes;
  const meshSlots = new Set(meshes.map((mesh) => mesh.slot));
  const slotBudget = input.rig?.meshSlotBudget ?? null;
  const triangleBudget = input.rig?.meshTriangleBudget ?? null;
  if (slotBudget === null && triangleBudget === null) {
    return skip(
      'A13_MESH_BUDGET',
      input.rig
        ? `the rig "${input.rig.archetype}" declares no \`invariants.meshSlots\` or \`invariants.meshTriangles\` budget`
        : 'no rig info (validating a bare directory), so no budget is declared',
    );
  }
  // Two clauses and only one of them has a subject that can vanish (#580).
  // A slot budget is a ceiling on a COUNT, and zero is a count — "this rig
  // uses 0 of its 3 mesh slots" is a measurement — so that half holds on a
  // skeleton with no mesh. A triangle budget is a ceiling on each mesh, so a
  // rig that declares only that one and carries no mesh has measured
  // nothing at all.
  if (slotBudget === null && meshAttachments.length === 0) {
    return skip(
      'A13_MESH_BUDGET',
      `the rig "${input.rig?.archetype}" budgets mesh triangles and nothing else, and ${SKIP_NO_MESH_ATTACHMENT}`,
    );
  }
  if (slotBudget !== null && meshSlots.size > slotBudget) {
    fail('A13_MESH_BUDGET', `${meshSlots.size} mesh slots, the rig budgets ${slotBudget}`);
  }
  if (triangleBudget === null) return;
  for (const mesh of meshAttachments) {
    const tris = (mesh.triangles?.length ?? 0) / 3;
    if (tris > triangleBudget) {
      fail('A13_MESH_BUDGET', `mesh "${mesh.name}" has ${tris} triangles, the rig budgets ${triangleBudget}`);
    }
  }
}
