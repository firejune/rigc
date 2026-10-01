/**
 * Slot colour timelines and the colour a slot poses at (issue #1025, step 4c
 * of #380) — the census's F18 and R4: the animations and the slot timelines
 * they key, and one slot's light colour posed by the runtime's rule.
 *
 * ⭐ **The file's order, and the file's spelling.** A45's first clause names
 * the timeline "which the file states last" as the one that wins, so the order
 * of a slot's timelines is a value and not a presentation; and its findings
 * print a key's `time`, `color` and `value` as the file states them. So the
 * list holds, for every animation in the order the file keys them and every
 * slot in the order the animation keys them, that slot's timelines in the
 * file's order, each key as the file spells it. `validate()` reads it off the
 * skeleton JSON; the model side produces it from the document by calling the
 * emitter's own order and its own parser-default and key-order passes
 * (`../model/slot_colour.ts`), so a key the emitter would write without a field
 * reads without it here too.
 */

/** One animation's timelines on one slot: timeline name -> keys, as the file states them. */
export interface SlotTimelines {
  readonly animation: string;
  readonly slot: string;
  readonly timelines: Readonly<Record<string, unknown>>;
}

/** A slot's light colour as posed: four channels, NaN where the pose read no number. */
export interface PosedSlotColour {
  readonly color: { readonly r: number; readonly g: number; readonly b: number; readonly a: number };
}

/** What A45 reads. */
export interface SlotColourFacts {
  /** Every (animation, slot) pair whose timelines the file keys, in the header's order. */
  readonly slotTimelines: readonly SlotTimelines[];
  /** Whether the skeleton holds an animation of this name. */
  hasAnimation(name: string): boolean;
  /**
   * The slot's colour with the animation applied at `time` on a fresh,
   * non-looping track from the setup pose, no skin set — or `undefined` for a
   * slot the skeleton does not have.
   */
  posedSlot(animation: string, slot: string, time: number): PosedSlotColour | undefined;
}
