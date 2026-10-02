/**
 * A15, the body (issue #1025, step 4c of #380): `idle` keys no bone that
 * drives a mesh, unless the rig declares that its idle deforms them.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the meshes
 * and the bones that drive them are a fact (`../facts/mesh_attachments.ts`, the bones derived from the weights by `weightBonesOf`) rather
 * than spine-core's loaded skins and the weight run decoded here, the bones
 * `idle` keys are a fact (`../facts/animated_bones.ts`) rather than the raw
 * JSON, and the rig info is the caller's. Why the rule assumes meshes are
 * mostly static, and why a painting rig may say otherwise, stays above the
 * `check` call in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import { weightBonesOf, type MeshEntry, type MeshFacts } from '../facts/mesh_attachments.ts';
import type { AnimatedBoneFacts } from '../facts/animated_bones.ts';
import type { RigInfo } from '../../types.ts';

export function a15IdleNoMeshBoneKeys({ fail, skip }: Verdicts, facts: MeshFacts, animated: AnimatedBoneFacts, input: { rig?: RigInfo }): void {
  const A15 = 'A15_IDLE_NO_MESH_BONE_KEYS';
  /**
   * Every mesh attachment, loaded, with the bones that drive it — its slot's
   * bone, and, once weights exist, every bone its weights name. A ring mesh
   * is driven by its CONTROL bone, a different bone from the slot's, and
   * checking only the slot bone would let `idle` key the one bone that
   * actually dirties the canvas every frame.
   */
  const meshDrivers: Array<{ mesh: MeshEntry; bones: Set<string> }> = [];
  for (const mesh of facts.meshes) {
    const bones = new Set<string>([mesh.slotBone]);
    for (const bone of weightBonesOf(facts, mesh)) bones.add(bone);
    meshDrivers.push({ mesh, bones });
  }
  const meshBoneNames = new Set<string>();
  for (const { bones } of meshDrivers) for (const name of bones) meshBoneNames.add(name);
  const declared = input.rig?.idleDrivesMeshes ?? null;
  /**
   * A declaration that switches off nothing is refused rather than skipped,
   * the standard `consumerDrivenMix` is held to: an opt-out that exempts
   * nothing reads exactly like one that worked, and the next reader cannot
   * tell the rig that needs it from the rig it was copied onto.
   */
  const stale = (why: string): void => {
    fail(
      A15,
      `the rig "${input.rig?.archetype}" declares invariants.idleDrivesMeshes ("${declared}"), but ${why}, so the ` +
        'declaration switches off nothing — remove it',
    );
  };
  // The same shape as A06's and A17's guards, found by auditing for it
  // (#568): a rig with no `idle` at all has nothing here to be wrong, and a
  // rule that reports "held" over a subject that does not exist is the
  // vacuous pass this file's own doctrine refuses. The two states get their
  // own sentences because they are different absences — no such animation,
  // versus one that keys no bone.
  const idleBones = animated.bonesKeyedBy('idle');
  if (idleBones === undefined) {
    if (declared !== null) return stale('the skeleton declares no "idle" animation');
    return skip(A15, 'the skeleton declares no "idle" animation, so nothing here can key a mesh-driving bone');
  }
  if (idleBones === null) {
    if (declared !== null) return stale('"idle" carries no bone timeline at all');
    return skip(A15, '"idle" carries no bone timeline at all, so there is no key to hold against the mesh-driving bones');
  }
  const keyed = idleBones.filter((name) => meshBoneNames.has(name));
  if (declared !== null) {
    if (keyed.length === 0) return stale('"idle" keys no bone that drives a mesh');
    const keyedSet = new Set(keyed);
    const moved = meshDrivers.filter(({ bones }) => [...bones].some((name) => keyedSet.has(name)));
    // `worldVerticesLength` is two numbers per vertex whatever the encoding,
    // which is the count the runtime recomputes; reading `vertices.length`
    // would count a weighted mesh's bone entries instead.
    const vertices = moved.reduce((sum, { mesh }) => sum + mesh.worldVerticesLength / 2, 0);
    const SHOWN = 8;
    const names =
      keyed.slice(0, SHOWN).map((name) => `"${name}"`).join(', ') + (keyed.length > SHOWN ? ` +${keyed.length - SHOWN}` : '');
    return skip(
      A15,
      `declared by the rig ("${declared}"): idle keys ${keyed.length} bone(s) that drive ${moved.length} mesh ` +
        `attachment(s) totalling ${vertices} vertices — ${names} — and each of those meshes is recomputed on every ` +
        'frame it is shown',
    );
  }
  for (const [i, boneName] of keyed.entries()) {
    // The case is named once, on the first line an agent reads, rather than
    // after every bone: the first painting rig this met printed 42 of these,
    // and 42 identical sentences read as 42 separate mistakes. It rides the
    // first finding rather than being a finding of its own, so the count of
    // FAIL lines is still the count of bones.
    const hint =
      i > 0
        ? ''
        : `. ${keyed.length} bone(s) keyed by idle drive meshes; if this idle is meant to deform them (a painting ` +
          'rig), declare invariants.idleDrivesMeshes: { "why": … } in the rig spec — or, where the motion belongs to ' +
          'a pivot above the mesh, key that pivot one link up (FACE.md §3)';
    fail(A15, `idle keys bone "${boneName}", which drives a mesh — meshes never idle-skip${hint}`);
  }
}
