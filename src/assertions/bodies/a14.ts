/**
 * A14, the body (issue #1025, step 4c of #380): no mesh spans the whole
 * stage.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the meshes
 * and the stage are facts (`../facts/skin_meshes.ts`, `../facts/stage.ts`)
 * rather than spine-core's loaded skins and skeleton header. The `check` call
 * stays in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { SkinMeshFacts } from '../facts/skin_meshes.ts';
import type { StageFacts } from '../facts/stage.ts';

export function a14NoFullFrameMesh({ fail, skip }: Verdicts, { meshes }: SkinMeshFacts, stage: StageFacts): void {
  const meshAttachments = meshes;
  const stageW = stage.width || 0;
  const stageH = stage.height || 0;
  // ⚠️ A stage-less skeleton has nothing for a mesh to span, and this rule
  // used to report that as a PASS — the `stageW && stageH` guard below reads
  // as a measurement of a 0x0 stage that no mesh can reach. It was only ever
  // reachable from a foreign file until a rig spec could *declare* no stage
  // (issue #578), and a pass certifying an unmeasured rig is the exact
  // failure mode `A21_MESH_RIM_PINNED`'s `|| 'ring'` default was (#44).
  if (!stageW || !stageH) {
    return skip(
      'A14_NO_FULL_FRAME_MESH',
      'the skeleton declares no stage size, so there is no full frame for a mesh to span',
    );
  }
  for (const mesh of meshAttachments) {
    if (mesh.width >= stageW && mesh.height >= stageH) {
      fail('A14_NO_FULL_FRAME_MESH', `mesh "${mesh.name}" spans the whole ${stageW}x${stageH} stage`);
    }
  }
}
