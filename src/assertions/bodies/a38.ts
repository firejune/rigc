/**
 * A38, the body (issue #1025, step 4c of #380): a skin's member list and its
 * members' `skin: true` flag agree.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the bones,
 * the constraints and the skins' lists are a fact (`../facts/skin_members.ts`)
 * — which spine-core's loaded `SkeletonData` satisfies as it stands. Why both
 * halves of the switch are dead data alone stays above the `check` call in
 * `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { MemberBone, SkinMemberFacts } from '../facts/skin_members.ts';

export function a38SkinMembersAreSkinRequired({ fail, skip, stats }: Verdicts, data: SkinMemberFacts): void {
  /** Every bone a skin can switch on, including the ancestors it drags in. */
  const activatable = new Set<string>();
  // The constraint OBJECTS a skin lists, never their names: a name is not a
  // constraint in this format, and two constraints of one name under two
  // kinds are two objects a skin may list separately (issue #692). Keyed by
  // name, a `transform` `leg` that no skin lists read as listed because an
  // `ik` `leg` was — a skinRequired constraint that never runs, reported
  // green by the one assertion that looks for exactly that.
  const listedConstraints = new Set(data.skins.flatMap((skin) => skin.constraints));
  let listed = 0;
  for (const skin of data.skins) {
    for (const bone of skin.bones) {
      listed++;
      for (let cursor: MemberBone | null = bone; cursor; cursor = cursor.parent) activatable.add(cursor.name);
      if (!bone.skinRequired) {
        fail(
          'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED',
          `skin "${skin.name}" activates bone "${bone.name}", which is not skinRequired — updateCache starts it ` +
            'active anyway, so it poses under every skin and this list changes nothing',
        );
      }
    }
    for (const constraint of skin.constraints) {
      listed++;
      if (!constraint.skinRequired) {
        fail(
          'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED',
          `skin "${skin.name}" activates constraint "${constraint.name}", which is not skinRequired — it runs ` +
            'under every skin, so this list changes nothing',
        );
      }
    }
  }
  const required = data.bones.filter((b) => b.skinRequired).length + data.constraints.filter((c) => c.skinRequired).length;
  if (listed === 0 && required === 0) {
    return skip(
      'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED',
      'no skin activates a bone or a constraint, and nothing declares itself skinRequired',
    );
  }
  for (const bone of data.bones) {
    if (bone.skinRequired && !activatable.has(bone.name)) {
      fail(
        'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED',
        `bone "${bone.name}" is skinRequired and no skin's bones list reaches it, so it is never active — ` +
          'it and its subtree hold the setup pose under every skin',
      );
    }
  }
  for (const constraint of data.constraints) {
    if (constraint.skinRequired && !listedConstraints.has(constraint)) {
      fail(
        'A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED',
        `constraint "${constraint.name}" is skinRequired and no skin lists it, so it never runs`,
      );
    }
  }
  stats.skinMembers = listed;
}
