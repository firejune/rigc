/**
 * A30, the body (issue #1025, cut 4c-4 of #380): inward travel stops where the
 * drawn cover runs out — the measured `stroke.cap_containment_ceiling` — and
 * no bone under the axis scales while that ceiling is declared.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the travel
 * and the scale timelines are read off the bone timelines as a fact
 * (`../facts/bone_timelines.ts`, through `../inward_advance.ts`) rather than
 * off the raw JSON, and the rig info is the caller's. Why this is not a
 * restatement of A29, and why a scale key is refused rather than measured,
 * stay above the `check` call in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { BoneTimelineFacts } from '../facts/bone_timelines.ts';
import type { RigInfo } from '../../types.ts';
import { deepestInwardAdvance } from '../inward_advance.ts';
import { isObj } from '../values.ts';

export function a30StrokeWithinCapContainment({ fail, skip, stats }: Verdicts, facts: BoneTimelineFacts, input: { rig?: RigInfo }): void {
  const rig = input.rig;
  if (!rig) return skip('A30_STROKE_WITHIN_CAP_CONTAINMENT', 'no rig info (validating a bare directory)');
  if (!rig.capContainmentCeiling) {
    return skip(
      'A30_STROKE_WITHIN_CAP_CONTAINMENT',
      'the manifest declares no `stroke.cap_containment_ceiling`, so this cut has no measured containment ceiling',
    );
  }
  const deep = deepestInwardAdvance(facts, rig);
  stats.capCeiling = rig.capContainmentCeiling;
  stats.deepestAdvance = Math.round(deep.total * 1000) / 1000;
  if (deep.total > rig.capContainmentCeiling + 1e-6) {
    fail(
      'A30_STROKE_WITHIN_CAP_CONTAINMENT',
      `${deep.describe()} but the leading contour leaves the occluder's opaque footprint at ` +
        `${rig.capContainmentCeiling}px — the part would be drawn where it should be covered`,
    );
  }
  const subtree = new Set(rig.axisSubtree);
  for (const { animation: animName, bone: boneName, timelines } of facts.boneTimelines) {
    if (!subtree.has(boneName) || !isObj(timelines)) continue;
    for (const name of Object.keys(timelines)) {
      if (name !== 'scale' && name !== 'scalex' && name !== 'scaley') continue;
      fail(
        'A30_STROKE_WITHIN_CAP_CONTAINMENT',
        `"${animName}" gives "${boneName}" a ${name} timeline while a cap-containment ceiling is declared; ` +
          'the ceiling was measured on the undeformed contour, so a scaled plate is outside its evidence',
      );
    }
  }
}
