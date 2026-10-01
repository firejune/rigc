/**
 * A10, the body (issue #1025, cut 4c-5a of step 4c of #380): no pose the
 * skeleton is stepped through holds a number that is not finite, or a bone
 * with no inheritance mode.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads, which is
 * `BoneTimelineFacts` (`../facts/bone_timelines.ts`) for the `inherit` keys
 * where it read the skeleton JSON, and `SteppedPoseFacts`
 * (`../facts/stepped_poses.ts`) where it posed a spine-core skeleton itself:
 * the setup pose, each animation's looping walk, and a bone's mode posed at a
 * key — which `validate()` takes from spine-core and the model side from
 * rigc's core. The scan of a pose is `firstNonFinite` (`../../nonfinite.ts`),
 * the sentence `render` refuses on, called rather than restated. The argument
 * for each clause is above the `check` call, which stays in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { BoneTimelineFacts } from '../facts/bone_timelines.ts';
import type { SteppedFrame, SteppedPoseFacts } from '../facts/stepped_poses.ts';
import { SKIP_NO_POSE } from '../reasons.ts';
import { isObj } from '../values.ts';
import { firstNonFinite } from '../../nonfinite.ts';
import { BONE_INHERIT_KNOWN } from '../../rig.ts';

/** The steps A10 takes through every animation: the walk is `max(duration, 1) / STEP_FRAMES` long per step. */
export const STEP_FRAMES = 120;

export function a10NoNanAfterStepping({ fail, skip, stats }: Verdicts, boneTimelines: BoneTimelineFacts, facts: SteppedPoseFacts): void {
  if (facts.steppedAnimations.length === 0 && facts.boneCount === 0) {
    skip('A10_NO_NAN_AFTER_STEPPING', SKIP_NO_POSE);
    return;
  }

  // -- the bone's inheritance mode, posed at every `inherit` key
  let unresolved = 0;
  for (const { animation: animName, bone: boneName, timelines } of boneTimelines.boneTimelines) {
    if (!isObj(timelines) || !Array.isArray(timelines.inherit)) continue;
    if (!facts.hasAnimation(animName) || !facts.hasBone(boneName)) continue;
    for (const rawKey of timelines.inherit as unknown[]) {
      if (!isObj(rawKey)) continue;
      const time = typeof rawKey.time === 'number' ? rawKey.time : 0;
      const posed = facts.posedInherit(animName, boneName, time);
      if (posed === null) continue;
      unresolved++;
      fail(
        'A10_NO_NAN_AFTER_STEPPING',
        `animation "${animName}" bone "${boneName}" inherit (t=${time}): the bone poses inheritance mode ` +
          `${String(posed)} — the key spells ${JSON.stringify(rawKey.inherit)}, which the runtime's mode lookup ` +
          `does not resolve (${BONE_INHERIT_KNOWN}), so no mode applies until the next key and the bone keeps ` +
          'the world rotation, scale and shear it had',
      );
    }
  }
  if (unresolved > 0) return;

  // -- the whole world transform, at the setup pose and every stepped frame
  if (facts.steppedAnimations.length === 0) stats.nanStepping = 'skipped';
  const atRest = facts.setup();
  const atSetup = firstNonFinite('the setup pose', atRest.drawn, atRest.bones);
  if (atSetup !== null) {
    fail('A10_NO_NAN_AFTER_STEPPING', atSetup);
    return;
  }

  /**
   * What a posed frame shows that the world-transform scan does not read: a
   * bone posing no inheritance mode, and a slot colour that is not finite.
   * `where` leads the sentence — the animation's name at a stepped frame,
   * as it always has, or `the setup pose` on a skeleton with no animation.
   */
  const poseDefect = (where: string, frame: SteppedFrame): string | null => {
    for (const bone of frame.bones) {
      if (bone.inherit !== null) {
        return (
          `${where}: bone "${bone.name}" poses inheritance mode ${bone.inherit} — its setup ` +
          `spells inherit ${facts.statedInherit(bone.name)}, which the ` +
          `runtime's mode lookup does not resolve (${BONE_INHERIT_KNOWN}), so its world rotation, scale and shear ` +
          'are never computed — they stay 0 and everything the bone carries collapses to a point'
        );
      }
    }
    for (const slot of frame.slots) {
      if (!slot.colour.every(Number.isFinite)) return `${where}: slot "${slot.name}" colour is non-finite`;
      if (slot.dark !== null && !slot.dark.every(Number.isFinite)) {
        return `${where}: slot "${slot.name}" dark colour is non-finite`;
      }
    }
    return null;
  };

  if (facts.steppedAnimations.length === 0) {
    const atRestDefect = poseDefect('the setup pose', atRest);
    if (atRestDefect !== null) fail('A10_NO_NAN_AFTER_STEPPING', atRestDefect);
    return;
  }
  for (const anim of facts.steppedAnimations) {
    const step = Math.max(anim.duration, 1) / STEP_FRAMES;
    const frames = facts.walk(anim.name, step, STEP_FRAMES);
    for (let i = 0; i < STEP_FRAMES; i++) {
      const frame = frames[i];
      const found = firstNonFinite(
        `animation ${JSON.stringify(anim.name)} frame ${i + 1} of ${STEP_FRAMES} (t=${((i + 1) * step).toFixed(4)}s)`,
        frame.drawn,
        frame.bones,
      );
      if (found !== null) {
        fail('A10_NO_NAN_AFTER_STEPPING', found);
        return;
      }
      const defect = poseDefect(anim.name, frame);
      if (defect !== null) {
        fail('A10_NO_NAN_AFTER_STEPPING', defect);
        return;
      }
    }
  }
}
