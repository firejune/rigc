/**
 * A48, the body (issue #1025, step 4c of #380): a transform constraint muted
 * for good on every mix it reads is refused, unless the rig declares that the
 * consumer drives its mix.
 *
 * 🔑 **A transform mix is read only for a property the constraint drives.**
 * The early return in `TransformConstraint.update` is over all six mixes, but
 * it is not what decides whether anything moves: each `to` entry reads its own
 * mix (`ToRotate.mix` is `mixRotate`, …). At setup the parser only reads a mix
 * whose property is declared, so the two tests agree there — but a timeline
 * key that omits a mix is read as 1 (`SkeletonJson.js`, every `getValue(…, 1)`),
 * so a key of `mixRotate: 0` alone on a rotate-only constraint passes the
 * six-mix test on five mixes nothing reads. [measured] that key poses every
 * bone exactly where no constraint does, and so does one keying `mixX` 1 on
 * the same constraint. So this reads the mixes of the declared `to` kinds,
 * at setup and on every value a key poses — the fact's `mixes`, `null` where
 * the constraint declares no `to` of that property. Live is `!== 0`
 * (`ikLive`'s note).
 *
 * Moved out of `src/validate.ts` whole: the declared `to` kinds, the setup
 * mixes and the keyed ones are the rig's, the declaration the rig spec's.
 */
import type { Verdicts } from '../harness.ts';
import type { ConstraintFacts } from '../facts/constraints.ts';
import { consumerDriven, consumerSkip, declaredButLive, declareIt, noneKeysItsMixAbove0, switchedOn } from '../constraint_words.ts';
import type { RigInfo } from '../../types.ts';

export function a48TransformConstraintNotMutedThroughout({ fail, skip, stats }: Verdicts, facts: ConstraintFacts, rig: RigInfo | undefined): void {
  const NAME = 'A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT';
  const constraints = facts.constraints.flatMap((c, index) => (c.transform === undefined ? [] : [{ name: c.name, transform: c.transform, index }]));
  if (!constraints.length) return skip(NAME, 'the skeleton declares no transform constraint');
  /** Which of the six channels `constraint` reads at all: the ones whose `to` kind it declares. */
  const transformReads = (index: number): boolean[] => (facts.constraints[index]?.transform?.mixes ?? []).map((mix) => mix !== null);
  const transformSwitchedOn = switchedOn(facts, (timeline) => timeline.kind === 'transform', 6, (timeline, value, channel) => {
    const constraint = facts.constraints[timeline.constraint];
    return constraint?.transform !== undefined && transformReads(timeline.constraint)[channel] && value !== 0;
  });
  const declared = consumerDriven(rig, 'transform');
  const exempt: Array<[string, string]> = [];
  for (const { name, transform: constraint, index } of constraints) {
    const where = `transform constraint "${name}"`;
    const pose: Record<string, number> = {};
    for (const mix of constraint.mixes) if (mix !== null) pose[mix.field] = mix.setup;
    const read = constraint.mixes.flatMap((mix) => (mix === null ? [] : [mix.field]));
    if (read.length === 0) {
      // No `to` at all: no mix is ever read, so neither remedy below applies.
      fail(
        NAME,
        `${where} drives no property — its \`properties\` name no \`to\` — so no mix it carries is ever read and it ` +
          'moves nothing; declare the property it should drive',
      );
      continue;
    }
    const resting = read.filter((field) => pose[field] !== 0);
    const live = resting.length > 0 || transformSwitchedOn.has(index);
    const why = declared.get(name);
    if (why !== undefined) {
      if (!live) exempt.push([name, why]);
      else {
        fail(
          NAME,
          declaredButLive(
            where,
            resting.length ? `it rests at ${resting.map((field) => `${field} ${pose[field]}`).join(', ')}` : 'an animation keys its mix above 0',
          ),
        );
      }
      continue;
    }
    if (live) continue;
    fail(
      NAME,
      `${where} drives ${read.map((field) => field.slice(3).replace(/^./, (c) => c.toLowerCase())).join(', ')} and has ` +
        `${read.map((field) => `${field} ${pose[field]}`).join(', ')} at setup, and ` +
        `${noneKeysItsMixAbove0(facts.animations)}; a mix is read only for a property the constraint drives, and ` +
        `update() skips each one at 0, so nothing ever moves ${constraint.bones.map((bone) => `"${bone}"`).join(', ')} — ` +
        `rest ${read.length === 1 ? read[0] : `one of ${read.join(', ')}`} above 0, or key its mix above 0 in an animation, ` +
        declareIt('transform', name),
    );
  }
  if (exempt.length) stats.transformConsumerDriven = exempt.map(([name]) => name).join(',');
  if (exempt.length === constraints.length) return skip(NAME, consumerSkip('transform', exempt, facts.animations));
}
