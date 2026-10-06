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
 *
 * 🔩 A second clause reads the constraint's `bones` as a shape, whatever its
 * mix (issue #1205): more than two bones, or a pair whose second bone's
 * parent is not the first, is a constraint the solver cannot apply as drawn
 * — `ikShapeFault` below, whose sentence the rig-spec parser prints too. A
 * clause rather than an assertion of its own because it asks this body's
 * question of the same object — does this ik do what it says — and a new
 * registry entry would move every count the documents state.
 */
import type { Verdicts } from '../harness.ts';
import type { ConstraintFacts } from '../facts/constraints.ts';
import { consumerDriven, consumerSkip, declaredButLive, declareIt, ikLive, noneKeysItsMixAbove0, REST_OR_KEY_ITS_MIX, switchedOn } from '../constraint_words.ts';
import type { RigInfo } from '../../types.ts';

/**
 * What is wrong with an ik constraint's `bones` as a shape, in the sentence
 * both the rig-spec parser and A47 print — or `null` when the shape is one
 * the solver applies as drawn (issue #1205).
 *
 * - **A count other than one or two moves nothing.** The runtime's update
 *   switches on the count with a case for one bone and one for two, so a
 *   constraint over three or more is in the update cache and applies nothing
 *   [measured: a chain under an ik over three bones and over four posed every
 *   bone exactly where the same rig with no constraint did, 49 samples,
 *   tolerance 0]. A list of none is refused before this (the compiler's
 *   "needs a non-empty bones array"; an export's own loader).
 * - **A pair whose second bone's parent is not the first solves another
 *   triangle.** The two-bone solve places the second bone through the first's
 *   matrix from the second's own local offset, so whatever stands between
 *   them is left out of the chain it solves [measured on the same chain: a
 *   bone between them at the child's origin left the tip 0.27–2.60 off the
 *   target, a pair skipping a bone 18.95–22.25 off, and a zero-offset bone
 *   between them at the parent's origin landed only while it held its
 *   identity — turned 15° in setup, 3.50–4.11 off in every frame]. The rule
 *   reads the parent and not the pose, because a pose that happens to agree
 *   is not a rig that does. rigc's own reader of the model document refuses
 *   both shapes too (`A00_MODEL_READ` on the core entry); this is the same
 *   refusal on the side that reads a Spine file.
 *
 * `secondAncestors` is the second bone's ancestors, parent first, as the
 * facts carry them.
 */
export function ikShapeFault(name: string, bones: readonly string[], secondAncestors: readonly string[]): string | null {
  const quoted = (list: readonly string[]): string => list.map((b) => `"${b}"`).join(', ');
  if (bones.length > 2) {
    return (
      `ik constraint "${name}" names ${bones.length} bones (${quoted(bones)}); the solver applies one or two, so a constraint ` +
      `over ${bones.length} moves nothing — name one bone, or two where the second is the first's child`
    );
  }
  if (bones.length !== 2 || secondAncestors[0] === bones[0]) return null;
  const [first, second] = bones;
  const at = secondAncestors.indexOf(first);
  const why =
    at > 0
      ? `${quoted(secondAncestors.slice(0, at))} ${at === 1 ? 'stands' : 'stand'} between`
      : secondAncestors.length === 0
        ? `"${second}" has no parent`
        : `"${first}" is not above it; its parent is "${secondAncestors[0]}"`;
  return (
    `ik constraint "${name}": "${second}" is not a child of "${first}" (${why}), so the two-bone solve is not of the ` +
    `chain drawn — name "${second}"'s own parent as the first bone, or make "${second}" a child of "${first}"`
  );
}

export function a47IkConstraintNotMutedThroughout({ fail, skip, stats }: Verdicts, facts: ConstraintFacts, rig: RigInfo | undefined): void {
  const NAME = 'A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT';
  const constraints = facts.constraints.flatMap((c, index) => (c.ik === undefined ? [] : [{ name: c.name, ik: c.ik, index }]));
  if (!constraints.length) return skip(NAME, 'the skeleton declares no ik constraint');
  // The shape first, whatever the mix: a constraint the solver cannot apply as drawn is not exempted by a declaration of who sets its mix.
  let shapeFaults = 0;
  for (const { name, ik } of constraints) {
    const fault = ikShapeFault(name, ik.bones, ik.secondAncestors);
    if (fault === null) continue;
    shapeFaults++;
    fail(NAME, fault);
  }
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
  if (exempt.length === constraints.length && shapeFaults === 0) return skip(NAME, consumerSkip('ik', exempt, facts.animations));
}
