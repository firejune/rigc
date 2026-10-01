/**
 * A24, the body (issue #1025, cut 4c-4 of #380): motion under the axis bone
 * stays in AXIS space, and the axis bone itself carries no keys.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the bone
 * timelines are a fact (`../facts/bone_timelines.ts`) rather than the raw
 * JSON's `animations`, walked in the same order, and the rig info is the
 * caller's. Why the rule exists — the generator that wrote screen-space travel
 * — stays above the `check` call in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { BoneTimelineFacts } from '../facts/bone_timelines.ts';
import type { RigInfo } from '../../types.ts';
import { isObj, type Json } from '../values.ts';

export function a24AxisSpaceStroke({ fail, skip }: Verdicts, { boneTimelines }: BoneTimelineFacts, input: { rig?: RigInfo }): void {
  const rig = input.rig;
  if (!rig) return skip('A24_AXIS_SPACE_STROKE', 'no rig info (validating a bare directory)');
  if (!rig.axisBone) {
    return skip(
      'A24_AXIS_SPACE_STROKE',
      `the rig "${rig.archetype}" declares no axis bone, so there is no axis space for a stroke to leave`,
    );
  }
  const subtree = new Set(rig.axisSubtree);
  // The stroke is the subject and its keys are where it lives (#580). A rig
  // that names an axis bone and then keys neither it nor anything under it has
  // no stroke for this rule to find out of axis space, and a loop over nothing
  // used to report that as held.
  let keyed = 0;
  for (const { animation: animName, bone: boneName, timelines } of boneTimelines) {
    if (boneName === rig.axisBone) {
      keyed++;
      fail(
        'A24_AXIS_SPACE_STROKE',
        `"${animName}" keys the axis bone "${boneName}"; the axis angle is a per-cut SETUP value, not animation`,
      );
      continue;
    }
    if (subtree.has(boneName)) keyed++;
    if (!subtree.has(boneName) || !isObj(timelines)) continue;
    if ('translatey' in timelines) {
      fail(
        'A24_AXIS_SPACE_STROKE',
        `"${animName}" gives "${boneName}" a translatey timeline; a bone under "${rig.axisBone}" moves along the axis only`,
      );
    }
    const keys = (timelines as Json).translate;
    if (!Array.isArray(keys)) continue;
    for (const key of keys) {
      if (!isObj(key)) continue;
      const y = Number(key.y ?? 0);
      if (Number.isFinite(y) && Math.abs(y) > 1e-6) {
        fail(
          'A24_AXIS_SPACE_STROKE',
          `"${animName}" keys "${boneName}" translate y=${y} at t=${String(key.time ?? 0)}; the axis bone carries the direction, so keys are translateX only`,
        );
      }
    }
  }
  if (keyed === 0) {
    return skip(
      'A24_AXIS_SPACE_STROKE',
      `no animation keys the axis bone "${rig.axisBone}" or any of the ${rig.axisSubtree.length} bone(s) under ` +
        'it, so this rig has no stroke to hold in axis space',
    );
  }
}
