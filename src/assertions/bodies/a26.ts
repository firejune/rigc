/**
 * A26, the body (issue #1025, cut 4c-4 of #380): the slots array IS the rig's
 * slot table — nothing out of order and nothing missing.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the slots'
 * names are a fact (`../facts/skeleton_roster.ts`) rather than the raw JSON's
 * `slots`, and the rig info is the caller's. Why the second half exists (issue
 * #575) stays above the `check` call in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { SkeletonRosterFacts } from '../facts/skeleton_roster.ts';
import type { RigInfo } from '../../types.ts';

export function a26SlotDrawOrder({ fail, skip }: Verdicts, { slots }: SkeletonRosterFacts, input: { rig?: RigInfo }): void {
  if (!input.rig) return skip('A26_SLOT_DRAW_ORDER', 'no rig info (validating a bare directory)');
  const order = input.rig.slotOrder;
  if (!order) {
    return skip(
      'A26_SLOT_DRAW_ORDER',
      `the rig "${input.rig.archetype}" declares no canonical slot order, so the emitted order has nothing to disagree with`,
    );
  }
  const names = slots.map((s) => s.name);
  // ⛔ **No empty-subject SKIP here, and #575 is the whole reason** (#580). The
  // empty sequence is a subsequence of every table, so before #575 a skeleton
  // with no slot reported its draw order held and this rule wanted the same
  // guard its neighbours got. It no longer does: the completeness clause below
  // reads zero emitted slots against a declared table as EVERY slot lost,
  // which is the maximal case of exactly the defect #575 filed — so the honest
  // verdict is a FAIL naming them, and a SKIP here would suppress it. Measured:
  // with the guard in place a rig declaring one slot beside an artifact
  // carrying none reported SKIP; with it gone, `"block" is declared and not
  // emitted`. A26 therefore has no vacuous pass left to convert, the way
  // `A07_ATLAS_TEXT_SHAPE` has none.
  let at = 0;
  for (const name of names) {
    const found = order.indexOf(name, at);
    if (found < 0) {
      const known = order.indexOf(name);
      fail(
        'A26_SLOT_DRAW_ORDER',
        known < 0
          ? `slot "${name}" is not in the archetype's slot table`
          : `slot "${name}" is drawn out of order (table position ${known}, after a slot at ${at})`,
      );
      return;
    }
    at = found + 1;
  }
  const emitted = new Set(names);
  const missing = order.filter((name) => !emitted.has(name));
  if (missing.length > 0) {
    fail(
      'A26_SLOT_DRAW_ORDER',
      `the rig "${input.rig.archetype}" declares ${order.length} slot(s) and the skeleton has ${names.length}: ` +
        `${missing.map((name) => `"${name}"`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} declared and ` +
        'not emitted. A slot nothing fills is emitted with no setup attachment, not dropped — dropping one ' +
        'moves every slot below it up one index',
    );
  }
}
