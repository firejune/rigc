/**
 * A22, the body (issue #1025, step 4c of #380): every mesh's authored UVs lie
 * in the unit square, one pair per vertex.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the meshes
 * are a fact (`../facts/mesh_attachments.ts`). The `check` call stays in
 * `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { MeshFacts } from '../facts/mesh_attachments.ts';
import { SKIP_NO_MESH_ATTACHMENT } from '../reasons.ts';

export function a22MeshUvsInUnitRange({ fail, skip }: Verdicts, { meshes }: Pick<MeshFacts, 'meshes'>): void {
  const meshAttachments = meshes;
  if (meshAttachments.length === 0) return skip('A22_MESH_UVS_IN_UNIT_RANGE', SKIP_NO_MESH_ATTACHMENT);
  for (const mesh of meshAttachments) {
    // `regionUVs` is what the JSON authored; `uvs` is the page-space result
    // and stays EMPTY until a renderer calls computeUVs, so asserting on it
    // here would be asserting on the wrong array (measured: length 0 after
    // a clean load). With one part per page the two are equal anyway —
    // computeUVs reduces to `u + regionUV * width` with u=0, width=1
    // (MeshAttachment.js:173-174), which is the claim this assertion rests
    // on and this is where it is checked.
    const uvs = mesh.regionUVs;
    if (!uvs || uvs.length !== mesh.worldVerticesLength) {
      fail(
        'A22_MESH_UVS_IN_UNIT_RANGE',
        `mesh "${mesh.name}" has ${uvs?.length ?? 0} authored uv values for ${mesh.worldVerticesLength}`,
      );
      continue;
    }
    for (let i = 0; i < uvs.length; i++) {
      if (!Number.isFinite(uvs[i]) || uvs[i] < -1e-6 || uvs[i] > 1 + 1e-6) {
        fail('A22_MESH_UVS_IN_UNIT_RANGE', `mesh "${mesh.name}" uv[${i}] is ${uvs[i]}`);
        break;
      }
    }
  }
}
