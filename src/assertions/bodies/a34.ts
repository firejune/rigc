/**
 * A34, the body (issue #1025, cut 4c-5 of step 4c of #380): a constraint
 * timeline aims at a constraint of that type.
 *
 * The argument — the two shapes, the lookup by name AND type, the empty key
 * array the parser skips in silence, the physics group that names no
 * constraint — stands above the `check` call in `validate()`.
 *
 * Moved out of `src/validate.ts` whole, every clause with it (cut 4c-4
 * deferred it whole because its one rig clause shares this walk with the
 * physics branch): which constraint an entry names, what it holds and whom a
 * physics timeline naming none reaches are the rig's, and a document's records
 * state each — except what no readable document can carry, which only the
 * Spine text holds (a name the skeleton lacks, a name of another type, an
 * empty key array, a bare key array where named timelines go): the model
 * side's walk never meets those, and the reader refuses the document that
 * would state them.
 */
import type { Verdicts } from '../harness.ts';
import type { ConstraintTargetFacts, TargetKeyArray } from '../facts/constraint_targets.ts';
import { CHANNELS_BY_KIND } from '../../timelines.ts';

export function a34ConstraintTimelineTargets({ fail, skip }: Verdicts, facts: ConstraintTargetFacts): void {
  if (facts.groupsByAnimation === null) return skip('A34_CONSTRAINT_TIMELINE_TARGETS', 'the skeleton declares no animations');
  // name -> the KINDS declared under it, because that is the namespace the
  // lookup this assertion is about resolves in: `findConstraint(name, type)`
  // tests the type first, so a skeleton may carry `leg` as an ik constraint
  // AND as a transform one and each group finds its own (issue #692). A map
  // keyed by the name alone let the second of a pair overwrite the first, and
  // this assertion then reported a correct file as a type mismatch.
  const kindsOf = new Map<string, string[]>();
  for (const entry of facts.constraints) {
    if (entry.name !== null) kindsOf.set(entry.name, [...(kindsOf.get(entry.name) ?? []), entry.type]);
  }
  /** The file's physics constraints, which the unnamed physics group is read against. */
  const rawPhysics = facts.constraints.filter((entry) => entry.type === 'physics');
  let sawATimeline = false;
  /** One target of one group: the name resolves, the type matches, keys exist. */
  const checkTarget = (at: string, group: string, name: string, keyArrays: readonly TargetKeyArray[]): void => {
    sawATimeline = true;
    const declared = kindsOf.get(name) ?? [];
    if (declared.length === 0) {
      const known = [...kindsOf.entries()].filter(([, kinds]) => kinds.includes(group)).map(([n]) => n);
      fail(
        'A34_CONSTRAINT_TIMELINE_TARGETS',
        `${at}: the skeleton's constraints array has no "${name}"` +
          (known.length ? ` (${group} constraints: ${known.join(', ')})` : `, and no ${group} constraint at all`),
      );
      return;
    }
    if (!declared.includes(group)) {
      fail(
        'A34_CONSTRAINT_TIMELINE_TARGETS',
        `${at}: "${name}" is declared as a "${declared.join('"/"')}" constraint, so the ${group} lookup misses it and the loader throws`,
      );
      return;
    }
    checkKeys(at, keyArrays);
  };
  /** The key arrays of one group entry that resolved: each one is walked, so each has to hold a key. */
  const checkKeys = (at: string, keyArrays: readonly TargetKeyArray[]): void => {
    if (keyArrays.length === 0) {
      fail(
        'A34_CONSTRAINT_TIMELINE_TARGETS',
        `${at}: the constraint is named and carries no timeline at all; the group is walked and nothing happens`,
      );
      return;
    }
    for (const { timeline, keys } of keyArrays) {
      if ('count' in keys && keys.count > 0) continue;
      fail(
        'A34_CONSTRAINT_TIMELINE_TARGETS',
        `${at}${timeline ? ` timeline "${timeline}"` : ''}: the key array is ` +
          `${'count' in keys ? 'empty' : keys.spelled}; the parser reads key 0, finds nothing and ` +
          'skips the whole timeline without a word',
      );
    }
  };
  for (const { name: animName, groups } of facts.groupsByAnimation) {
    for (const { group, entries } of groups) {
      for (const { name, bare, keyArrays } of entries) {
        // group.<constraint> = keys[]
        if (group === 'ik' || group === 'transform') {
          checkTarget(`animation "${animName}" ${group} timeline "${name}"`, group, name, keyArrays);
          continue;
        }
        // group.<constraint>.<timeline> = keys[]
        const at = `animation "${animName}" ${group} constraint "${name}"`;
        if (bare !== null) {
          sawATimeline = true;
          fail(
            'A34_CONSTRAINT_TIMELINE_TARGETS',
            `${at}: this group maps a constraint to NAMED timelines ` +
              `(${Object.keys(CHANNELS_BY_KIND[group]).join('/')}), and this one holds ${bare} — ` +
              'a bare key array here is the ik/transform shape and is walked as an object',
          );
          continue;
        }
        // The empty name is not a miss: it is the physics group's global form,
        // which `SkeletonJson` loads as `constraintIndex -1` rather than looking
        // anything up, and which writes every physics constraint that declares
        // the timeline's property global (issue #726). Refusing it as "no
        // constraint called ''" was a sentence that is false about the file.
        // What CAN be wrong with it is that it reaches nobody: the parser
        // accepts it, the runtime walks every constraint, and none of them
        // takes the key.
        if (group === 'physics' && name === '') {
          sawATimeline = true;
          for (const { timeline: timelineName } of keyArrays) {
            const reach = facts.reach(timelineName);
            // A name the parser skips is skipped here too: no timeline exists
            // to reach anybody, and whether the NAME is right is not a target
            // question.
            if (reach === null || reach.reached.length > 0) continue;
            fail(
              'A34_CONSTRAINT_TIMELINE_TARGETS',
              `${at} timeline "${timelineName}": a physics group that names no constraint writes every physics ` +
                `constraint ${reach.resets ? 'the skeleton has' : `declaring "${timelineName}Global": true`}, and ` +
                (rawPhysics.length === 0 ? 'the skeleton has no physics constraint' : `none of ${rawPhysics.map((one) => `"${one.spelled}"`).join(', ')} does`) +
                ' — the parser loads it, the runtime walks every constraint, and no constraint takes the key',
            );
          }
          checkKeys(at, keyArrays);
          continue;
        }
        checkTarget(at, group, name, keyArrays);
      }
    }
  }
  if (!sawATimeline) {
    return skip('A34_CONSTRAINT_TIMELINE_TARGETS', 'no animation carries a constraint timeline');
  }
}
