/**
 * A20, the body (issue #1025, step 4c of #380): a weighted mesh's weights
 * cohere — every vertex bound, every weight finite and non-negative, every
 * vertex's weights summing to 1 — and, under `spine-html`, a generated mesh is
 * weighted, binds only bones that move it and binds every bone it declares.
 *
 * Moved out of `src/validate.ts` clause by clause, every clause about the
 * weights themselves moving: a document's mesh names each vertex's bindings,
 * so a vertex count that disagrees with the `uvs`, an empty binding list, a
 * weight that is not finite, below 0 or 0 on a generated mesh, a sum off 1 and
 * a declared bone no vertex binds each have a place to live there (the reader
 * refuses the first three by the record's name). The one clause that does not
 * — a binding's index past the bone array — is about the encoding: the
 * document names a binding's bone, and the index is the emitter's to write.
 * It stays with the round trip, which hands its finding in on the binding
 * (`MeshBinding.encoding`), printed where the body always printed it.
 *
 * The weights are the ones the runtime holds — float32 — and a binding's bone
 * its index in the roster, because the weight-0 clause prints it.
 */
import type { Verdicts } from '../harness.ts';
import type { MeshFacts } from '../facts/mesh_attachments.ts';
import { meshKindOf } from '../mesh_kinds.ts';
import { SKIP_NO_MESH_ATTACHMENT } from '../reasons.ts';
import type { RigInfo } from '../../types.ts';

export function a20MeshWeightsCoherent({ fail, skip }: Verdicts, { meshes, bones }: MeshFacts, policy: boolean, rig: RigInfo | undefined): void {
  if (meshes.length === 0) return skip('A20_MESH_WEIGHTS_COHERENT', SKIP_NO_MESH_ATTACHMENT);
  for (const mesh of meshes) {
    // 🚨 Authored geometry is not rigc's to have opinions about. The two
    // policy branches in this assertion are both statements about what a
    // rigc GENERATOR is supposed to produce — "a mesh here is weighted",
    // "a generated mesh binds only bones that move it" — and neither is a
    // fact about Spine or about somebody else's mesh. Applying them to
    // authored geometry failed correct data (issue #44). The coherence
    // rules below the branch are unconditional and still apply.
    const generated = meshKindOf(mesh, rig) !== 'authored';
    if (!mesh.weights) {
      // 📐 PROFILE. An unweighted mesh is perfectly valid Spine — spineboy
      // ships two — and the runtime poses it from the slot bone. What is
      // NOT valid, in any profile, is a weighted mesh whose weights do not
      // cohere, which is everything below this branch. So the requirement
      // that a mesh be weighted at all is the policy half, and it is the
      // only half gated here.
      if (policy && generated) {
        fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" is unweighted; the ring tier drives meshes by bones`);
      }
      continue;
    }
    const perVertex = mesh.weights;
    const expected = mesh.worldVerticesLength / 2;
    if (perVertex.length !== expected) {
      fail(
        'A20_MESH_WEIGHTS_COHERENT',
        `mesh "${mesh.name}" has weights for ${perVertex.length} vertices but ${expected} uv pairs`,
      );
      continue;
    }
    perVertex.forEach((vertex, i) => {
      if (!vertex.length) fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} has no bones`);
      let sum = 0;
      for (const { bone, weight, encoding } of vertex) {
        if (!Number.isFinite(weight) || weight < 0) {
          fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} has weight ${weight}`);
        }
        // 📐 PROFILE. A weight of exactly 0 is legal, harmless Spine: the
        // runtime accumulates `(…) * weight` (Attachment.js:131), so the
        // binding contributes nothing. The Spine editor writes them — the
        // auto-weighted meshes in 6-arcs, 7-anticipation and 8-follow-through
        // carry dozens, and their vertex weights still sum to 1. Treating one
        // as corruption failed three rungs of the ladder on correct data.
        // In a rigc-GENERATED ring or ribbon it is still a defect: the
        // generator bound a bone that does nothing, which is a bug in the
        // generator and dead work in the runtime's inner loop. So it stays a
        // failure under spine-html and is not one under spine.
        else if (policy && generated && weight === 0) {
          fail(
            'A20_MESH_WEIGHTS_COHERENT',
            `mesh "${mesh.name}" vertex ${i} is bound to bone index ${bone} at weight 0; a generated mesh binds only bones that move it`,
          );
        }
        // The index's range is the encoding's, kept with the round trip (the header).
        if (encoding !== undefined) fail('A20_MESH_WEIGHTS_COHERENT', encoding);
        sum += weight;
      }
      if (Math.abs(sum - 1) > 1e-3) {
        fail('A20_MESH_WEIGHTS_COHERENT', `mesh "${mesh.name}" vertex ${i} weights sum to ${sum.toFixed(4)}`);
      }
    });
    // 📐 PROFILE, and the converse of the weight-0 branch above: that one
    // says a generated mesh binds only bones that MOVE it, and this one says
    // every bone it declares moves it. They are halves of one sentence — the
    // bone set the mesh declares is the bone set its weights reference — so
    // they are one assertion rather than two, and neither is a fact about
    // Spine: a declared bone nothing binds loads and renders perfectly.
    //
    // 🚨 It is the one mesh question a vertex cannot answer, which is why
    // every per-vertex rule above was green on the ring that raised it: a
    // rig-spec ring naming two grips bound one of them, and the absent bone
    // appears in no vertex, in no sum and in no index (issue #684). The
    // declaration comes from the compiler's own record of what it bound,
    // which is what the `MESH` report line prints.
    if (policy && generated && rig) {
      const declared = rig.meshDeclaredBones[mesh.slot] || [];
      const bound = new Set<string>();
      for (const vertex of perVertex) {
        for (const { bone } of vertex) {
          const named = bones[bone];
          if (named !== undefined) bound.add(named);
        }
      }
      for (const name of declared) {
        if (bound.has(name)) continue;
        fail(
          'A20_MESH_WEIGHTS_COHERENT',
          `mesh "${mesh.name}" declares bone "${name}" and none of its ${perVertex.length} vertices binds it; ` +
            `the weights reference ${[...bound].map((n) => `"${n}"`).join(', ')}`,
        );
      }
    }
  }
}
