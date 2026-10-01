/**
 * A29, the body (issue #1025, cut 4c-4 of #380): inward travel stops where the
 * two masses meet — the measured `stroke.contact_depth`.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the travel
 * is measured over the bone timelines as a fact (`../inward_advance.ts` over
 * `../facts/bone_timelines.ts`) rather than over the raw JSON, and the rig
 * info is the caller's. Why the ceiling is a measured fact about the art stays
 * above the `check` call in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { BoneTimelineFacts } from '../facts/bone_timelines.ts';
import type { RigInfo } from '../../types.ts';
import { deepestInwardAdvance } from '../inward_advance.ts';

export function a29StrokeWithinContactDepth({ fail, skip, stats }: Verdicts, facts: BoneTimelineFacts, input: { rig?: RigInfo }): void {
  const rig = input.rig;
  if (!rig) return skip('A29_STROKE_WITHIN_CONTACT_DEPTH', 'no rig info (validating a bare directory)');
  if (!rig.contactDepth) {
    return skip(
      'A29_STROKE_WITHIN_CONTACT_DEPTH',
      'the manifest declares no `stroke.contact_depth`, so this cut has no measured contact ceiling to hold the stroke to',
    );
  }
  const deep = deepestInwardAdvance(facts, rig);
  stats.contactDepth = rig.contactDepth;
  stats.deepestAdvance = Math.round(deep.total * 1000) / 1000;
  if (deep.total > rig.contactDepth + 1e-6) {
    fail(
      'A29_STROKE_WITHIN_CONTACT_DEPTH',
      `${deep.describe()} but the masses meet at ${rig.contactDepth}px — the two plates would interpenetrate`,
    );
  }
}
