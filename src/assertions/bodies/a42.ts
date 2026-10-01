/**
 * A42, the body (issue #1025, step 4c of #380): a constraint a slider's
 * animation keys updates after that slider.
 *
 * `Skeleton.updateCache` walks the `constraints` array in order and each
 * constraint's `sort` pushes itself as it is reached — `Slider.sort` included,
 * which pushes bones and never a constraint — so the array IS the update order,
 * for every kind. Every constraint then opens its `update` by reading its own
 * applied pose, so a slider that keys any property of a constraint is read by
 * that constraint only when it comes LATER in the array; written the other way
 * round the value lands in a pose whose only reader has already run, and
 * `Posed.resetConstrained` puts the pose back before the next frame (the
 * argument and its measurements sit above the `check` call in `validate()`).
 *
 * Moved out of `src/validate.ts` whole: the array's order, the slider's
 * animation and the constraint timelines it holds — which constraint each
 * names, what it keys, and whom a physics timeline naming none reaches — are
 * the rig's, and a document's records state each. The words the sentence
 * prints are the facts' own: what a timeline keys (`word`, the motion spec's
 * word for it) and the runtime class whose `update` reads it (`runtimeClass`).
 */
import type { Verdicts } from '../harness.ts';
import type { ConstraintFacts } from '../facts/constraints.ts';

export function a42DrivenConstraintsUpdateAfterTheirDriver({ fail, skip, stats }: Verdicts, facts: ConstraintFacts): void {
  const sliders = facts.constraints.flatMap((c, index) => (c.slider === undefined ? [] : [{ name: c.name, slider: c.slider, index }]));
  if (!sliders.length) {
    return skip('A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER', 'the skeleton declares no slider constraint');
  }
  let pairs = 0;
  let resets = 0;
  for (const driver of sliders) {
    const driverIndex = driver.index;
    const animationName = driver.slider.animation?.name;
    for (const timeline of facts.timelines) {
      if (animationName === undefined || timeline.animation !== animationName) continue;
      if (timeline.kind === 'physics' && timeline.word === 'reset') {
        resets++;
        continue;
      }
      const word = timeline.word;
      const everyPhysics = timeline.constraint < 0;
      // A physics timeline whose animation names no constraint reaches every
      // ACTIVE physics constraint whose own data declares that property
      // global — the timeline's `reach`, the one reading of it A23 and A34
      // share (issue #726).
      for (const drivenIndex of timeline.reach) {
        const driven = facts.constraints[drivenIndex];
        if (driven === undefined) continue;
        pairs++;
        if (drivenIndex > driverIndex) continue;
        const kind = { word: driven.kind, runtime: driven.runtimeClass };
        const animation = `animation "${animationName}"`;
        const reference = `\`${kind.word}.${driven.name}${word === kind.word ? '' : `.${word}`}\``;
        fail(
          'A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER',
          drivenIndex === driverIndex
            ? `slider "${driver.name}" (constraints[${driverIndex}]) keys its own \`${word}\` in ${animation}. ` +
                '`Slider.update` reads `appliedPose.' +
                `${word}\` as the ${word === 'mix' ? 'alpha it applies that animation with' : 'time it applies that animation at'}, ` +
                'before the animation runs, so the key is written after its only reader and `Posed.resetConstrained` ' +
                `puts the pose back before the next frame${
                  word === 'mix'
                    ? ' — and at `mix` 0 `update` returns before applying anything at all, so the key that would raise it is unreachable'
                    : ''
                }. Key ${reference} from a slider EARLIER in \`constraints\`, or state the ` +
                `\`${word}\` this slider should start at in the rig spec`
            : `slider "${driver.name}" (constraints[${driverIndex}]) keys ${
                word === kind.word ? `the \`${word}\` timeline` : `\`${word}\``
              } of ${kind.word} constraint ` +
                `"${driven.name}" (constraints[${drivenIndex}]) in ${animation}${
                  everyPhysics ? ' — the timeline names no constraint, which the runtime reads as every physics constraint declaring that property global —' : ''
                }, and "${driven.name}" updates FIRST. The \`constraints\` array is the update order ` +
                '(`Skeleton.updateCache` walks it and each constraint\'s `sort` pushes itself as it is reached) and ' +
                `\`${kind.runtime}.update\` reads its own \`appliedPose\` before applying anything, so that key is ` +
                'written after the only read of it and `Posed.resetConstrained` discards it before the next frame: ' +
                `what "${driven.name}" drives is dead at every reading of "${driver.name}"'s dial, although its pose ` +
                `still holds the number. Move "${driver.name}" before "${driven.name}" in \`constraints\`, or key ` +
                `${reference} from a slider that already is`,
        );
      }
    }
  }
  if (pairs === 0) {
    return skip(
      'A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER',
      `no animation applied by one of the ${sliders.length} slider constraint${sliders.length === 1 ? '' : 's'} keys a ` +
        `property of a constraint, so no slider here drives a constraint${
          resets === 0
            ? ''
            : ` — the ${resets} \`physics\` \`reset\` key(s) they do carry are not a pose write, and [measured] a slider ` +
              'applies its animation at one instant, so `PhysicsConstraintResetTimeline` never fires from one in either array order'
        }`,
    );
  }
  stats.sliderDrivenConstraints = pairs;
}
