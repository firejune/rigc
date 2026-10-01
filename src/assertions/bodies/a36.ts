/**
 * A36, the body (issue #1025, step 4c of #380): a path constraint that
 * follows nothing, quietly.
 *
 * 🚨 The first failure here is the quietest in the whole constraint half of
 * the format. `PathConstraint.update` opens with
 *
 *   const attachment = this.slot.appliedPose.attachment;
 *   if (!(attachment instanceof PathAttachment)) return;
 *
 * so a path constraint aimed at a slot that never shows a path loads
 * perfectly, reports every mix it was given, appears in the update cache —
 * and moves nothing, forever. Nothing in the file is wrong on its face: the
 * slot exists, the constraint resolves, the mixes are 1.
 *
 * The rest are the same shape as A23's: a constraint that parses and does
 * nothing. All three mixes at 0 is only a finding when no animation keys one
 * of them above 0 (`switchedOn` over the `mix` timelines, judged by
 * `mixLive`), and a chain with no bones on it is one whether or not anything
 * is keyed.
 *
 * Moved out of `src/validate.ts` whole: the bones, the slot and the skins'
 * paths, the setup mixes and the keyed ones are all the rig's, and a
 * document's records state each.
 */
import type { Verdicts } from '../harness.ts';
import type { ConstraintFacts } from '../facts/constraints.ts';
import { mixLive, noneKeysItsMixAbove0, switchedOn } from '../constraint_words.ts';

export function a36PathConstraintEffective({ fail, skip, stats }: Verdicts, facts: ConstraintFacts): void {
  const constraints = facts.constraints.flatMap((c, index) => (c.path === undefined ? [] : [{ name: c.name, path: c.path, index }]));
  if (!constraints.length) return skip('A36_PATH_CONSTRAINT_EFFECTIVE', 'the skeleton declares no path constraint');
  /**
   * Which path constraints an animation switches ON — `switchedOn` over their
   * `mix` timelines, judged by `mixLive`, the predicate their setup pose is
   * judged by below.
   *
   * ⭐ The reason this is needed: a constraint whose mixes are all 0 at setup
   * is **the idiom**, not a defect — spineboy's aim rig is exactly that, and
   * issue #88 landed the timelines that turn one on. So "muted" is only a
   * finding when nothing turns it on, and that question lives in the
   * animations rather than in the constraint.
   *
   * 🔑 "Turns it on" is a VALUE question, and until issue #752 this asked a
   * weaker one than `A23` — whether a `mix` key array was non-empty — so a
   * timeline keying 0 only was a rescue for a constraint it leaves exactly as
   * muted as no timeline does. Now a path constraint is switched on by a key
   * posing any of its three mixes above 0, which is the runtime's own
   * condition: `PathConstraint.update` returns when `mixRotate`, `mixX` and
   * `mixY` are all 0 (`PathConstraint.js:73-75`).
   */
  const pathSwitchedOn = switchedOn(facts, (timeline) => timeline.kind === 'path' && timeline.word === 'mix', 3, (_timeline, value) => mixLive(value));
  /** The slots some skin gives a path attachment. */
  const pathsBySlot = new Set(facts.pathSlots);
  for (const { name, path: constraint, index } of constraints) {
    const where = `path constraint "${name}"`;
    if (!constraint.bones.length) {
      fail('A36_PATH_CONSTRAINT_EFFECTIVE', `${where} constrains no bone; it parses and does nothing`);
    }
    const slot = constraint.slot;
    if (!pathsBySlot.has(slot)) {
      fail(
        'A36_PATH_CONSTRAINT_EFFECTIVE',
        `${where} follows slot "${slot}", and no skin gives that slot a path attachment — ` +
          "PathConstraint.update returns immediately unless the slot's attachment is a path, so this " +
          'constraint reports its mixes and moves nothing',
      );
    }
    const pose = constraint.setup;
    const muted = ![pose.mixRotate, pose.mixX, pose.mixY].some(mixLive);
    if (muted && !pathSwitchedOn.has(index)) {
      fail(
        'A36_PATH_CONSTRAINT_EFFECTIVE',
        `${where} has mixRotate ${pose.mixRotate}, mixX ${pose.mixX} and mixY ${pose.mixY} at setup and ` +
          `${noneKeysItsMixAbove0(facts.animations)}; update() returns on all-zero mixes, so nothing ever ` +
          'puts a bone on the path — rest one of the three above 0, or key its mix above 0 in an animation',
      );
    }
  }
  stats.pathConstraints = constraints.length;
}
