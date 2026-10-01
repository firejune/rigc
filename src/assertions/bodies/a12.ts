/**
 * A12, the body (issue #1025, cut 4c-4 of #380): no dark colour and no
 * two-colour timeline — both parsed, then silently ignored by spine-html.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the slots
 * are a fact (`../facts/skeleton_roster.ts`) and the slot timelines are A45's
 * (`../facts/slot_colour.ts`), rather than the raw JSON and `walkTimelines`
 * over it. The path printed is the one `walkTimelines` built for a slot
 * timeline, `<animation>.slots.<slot>.<timeline>`, and only a timeline whose
 * keys are a list is one it visited.
 */
import type { Verdicts } from '../harness.ts';
import type { SkeletonRosterFacts } from '../facts/skeleton_roster.ts';
import type { SlotTimelines } from '../facts/slot_colour.ts';

export function a12NoDarkColor({ fail }: Verdicts, { slots }: SkeletonRosterFacts, slotTimelines: readonly SlotTimelines[]): void {
  for (const slot of slots) {
    if (slot.dark) {
      fail('A12_NO_DARK_COLOR', `slot "${slot.name}" declares a dark colour; the renderer ignores it`);
    }
  }
  for (const { animation, slot, timelines } of slotTimelines) {
    for (const [name, keys] of Object.entries(timelines)) {
      if (!Array.isArray(keys)) continue;
      if (name === 'rgba2' || name === 'rgb2') {
        fail('A12_NO_DARK_COLOR', `${animation}.slots.${slot}.${name}: two-colour timeline "${name}" is silently ignored by the renderer`);
      }
    }
  }
}
