/**
 * A47, the body (issue #1025, step 4c of #380): an ik constraint muted for
 * good — resting at mix 0 with no animation switching it on — is refused,
 * unless the rig declares that the consumer drives its mix.
 *
 * The question A23, A36 and A37 ask of their own kinds, asked of the kind
 * editor exports use most (issue #765): a constraint that rests muted and
 * that no animation switches on parses, sits in the update cache and moves
 * nothing. 🔑 Live is the runtime's own test, `!== 0`: `IkConstraint.update`
 * returns on `mix === 0`, so a negative mix runs. Channel 0 of an ik frame is
 * `mix`; the other four are softness, bend direction, compress and stretch.
 * The argument with its measurements sits above the `check` call in
 * `validate()`.
 *
 * Moved out of `src/validate.ts` whole: the bones, the target, the setup mix
 * and the keyed ones are the rig's, the declaration the rig spec's.
 */
import type { Verdicts } from '../harness.ts';
import type { ConstraintFacts } from '../facts/constraints.ts';
import { consumerDriven, consumerSkip, declaredButLive, declareIt, ikLive, noneKeysItsMixAbove0, REST_OR_KEY_ITS_MIX, switchedOn } from '../constraint_words.ts';
import type { RigInfo } from '../../types.ts';

export function a47IkConstraintNotMutedThroughout({ fail, skip, stats }: Verdicts, facts: ConstraintFacts, rig: RigInfo | undefined): void {
  const NAME = 'A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT';
  const constraints = facts.constraints.flatMap((c, index) => (c.ik === undefined ? [] : [{ name: c.name, ik: c.ik, index }]));
  if (!constraints.length) return skip(NAME, 'the skeleton declares no ik constraint');
  // Channel 0 is `mix`; the other four are softness, bend direction, compress and stretch.
  const ikSwitchedOn = switchedOn(facts, (timeline) => timeline.kind === 'ik', 1, (_timeline, value, channel) => channel === 0 && ikLive(value));
  const declared = consumerDriven(rig, 'ik');
  const exempt: Array<[string, string]> = [];
  for (const { name, ik: constraint, index } of constraints) {
    const mix = constraint.mix;
    const live = ikLive(mix) || ikSwitchedOn.has(index);
    const why = declared.get(name);
    if (why !== undefined) {
      if (!live) exempt.push([name, why]);
      else {
        fail(
          NAME,
          declaredButLive(
            `ik constraint "${name}"`,
            ikLive(mix) ? `it rests at mix ${mix}` : 'an animation keys its mix above 0',
          ),
        );
      }
      continue;
    }
    if (live) continue;
    fail(
      NAME,
      `ik constraint "${name}" has mix ${mix} at setup and ${noneKeysItsMixAbove0(facts.animations)}; ` +
        `update() returns on mix 0, so ${constraint.bones.map((bone) => `"${bone}"`).join(' and ')} never ` +
        `reach${constraint.bones.length === 1 ? 'es' : ''} for "${constraint.target}" — ${REST_OR_KEY_ITS_MIX}, ` +
        declareIt('ik', name),
    );
  }
  if (exempt.length) stats.ikConsumerDriven = exempt.map(([name]) => name).join(',');
  if (exempt.length === constraints.length) return skip(NAME, consumerSkip('ik', exempt, facts.animations));
}
