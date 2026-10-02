/**
 * A31, restated over the emitted text (issue #1060): the clause
 * `validate()` runs in `src/validate.ts`, word for word, over the skeleton JSON — the
 * text rigc wrote, read by rigc's own reader rather than by spine-core's. The
 * round trip's copy is unchanged and runs in `cli.ts build`; this one runs in
 * the gate of the entry that links none of the runtime
 * (`../emitted/index.ts`), and the selftest's `RC28` holds the two to the
 * same lines on every recipe and on this assertion's mutants.
 */
import type { Verdicts } from '../harness.ts';
import { isObj, type Json } from '../values.ts';

export function a31DrawOrderOffsetsResolve({ fail, skip }: Verdicts, raw: Json | null): void {
  if (!raw) return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'the skeleton JSON did not parse (A00 owns that failure)');
  if (!Array.isArray(raw.slots) || !isObj(raw.animations)) {
    return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'the skeleton declares no slots or no animations');
  }
  const slotIndex = new Map<string, number>();
  (raw.slots as unknown[]).forEach((slot, i) => {
    if (isObj(slot) && typeof slot.name === 'string') slotIndex.set(slot.name, i);
  });
  const slotCount = (raw.slots as unknown[]).length;
  let sawATimeline = false;
  for (const [animName, anim] of Object.entries(raw.animations as Json)) {
    if (!isObj(anim) || !Array.isArray(anim.drawOrder)) continue;
    sawATimeline = true;
    (anim.drawOrder as unknown[]).forEach((key, k) => {
      const at = `animation "${animName}" drawOrder key ${k}`;
      if (!isObj(key) || !Array.isArray(key.offsets)) return; // no offsets = setup order
      let previous = -1;
      for (const entry of key.offsets as unknown[]) {
        if (!isObj(entry) || typeof entry.slot !== 'string' || typeof entry.offset !== 'number') {
          fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', `${at}: an offset is not { slot: string, offset: number }`);
          continue;
        }
        const index = slotIndex.get(entry.slot);
        if (index === undefined) {
          fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', `${at}: slot "${entry.slot}" is not in the skeleton`);
          continue;
        }
        if (index <= previous) {
          const detail =
            `${at}: slot "${entry.slot}" is at index ${index}, after an entry at index ${previous} — ` +
            'offsets must be in ascending slot order or the loader never finishes reading them';
          fail('A31_DRAW_ORDER_OFFSETS_RESOLVE', detail);
          continue;
        }
        previous = index;
        const landing = index + entry.offset;
        if (!Number.isInteger(entry.offset) || landing < 0 || landing >= slotCount) {
          fail(
            'A31_DRAW_ORDER_OFFSETS_RESOLVE',
            `${at}: slot "${entry.slot}" is at index ${index} and offset ${entry.offset} puts it at ${landing}, ` +
              `outside the ${slotCount} slots`,
          );
        }
      }
    });
  }
  if (!sawATimeline) return skip('A31_DRAW_ORDER_OFFSETS_RESOLVE', 'no animation carries a drawOrder timeline');
}
