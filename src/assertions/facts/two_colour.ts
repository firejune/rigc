/**
 * The two-colour tint (issue #1025, cut 4c-3 of step 4c of #380) — the
 * census's F02, F18, F22 and R4 as A43 reads them: the dark colour each slot
 * states and the one the runtime loaded for it, the slot timelines the file
 * keys, and a slot's light and dark colour posed at a time.
 *
 * ⭐ **The file's spelling where A43 prints it, the runtime's reading where it
 * compares.** A43 parses the stated hex itself — a check that read the
 * required value out of the parser it checks would agree with it whatever it
 * did — so the stated `dark` and every key are handed over as the file spells
 * them; the loaded and the posed colours are the values the runtime holds.
 *
 * The slot timelines are `SlotColourFacts`' (`./slot_colour.ts`): one walk of
 * the file's animations, in its order and its spelling, which A45 reads too.
 *
 * Links nothing from the runtime: `validate()` reads it off the skeleton JSON
 * and the loaded skeleton (`spineTwoColourFacts`), the model side off the
 * document and the core (`../model/two_colour.ts`).
 */
import type { SlotTimelines } from './slot_colour.ts';

/** A dark colour as loaded or posed: three channels, NaN where the reading was no number. */
export interface DarkColour {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** A slot's two colours, posed. */
export interface PosedTint {
  readonly light: { readonly r: number; readonly g: number; readonly b: number; readonly a: number };
  /** `null` where the posed slot holds no dark colour. */
  readonly dark: DarkColour | null;
}

/** What A43 reads. */
export interface TwoColourFacts {
  /** Every slot whose entry states `dark` as a string, in the file's slot order, name and value as the file spells them. */
  readonly slotDarks: ReadonlyArray<{ readonly slot: string; readonly dark: string }>;
  /** The setup dark colour the loaded skeleton holds for the slot, or `null` for none (or no such slot). */
  loadedDark(slot: string): DarkColour | null;
  /** Every (animation, slot) pair whose timelines the file keys, in the file's order and spelling. */
  readonly slotTimelines: readonly SlotTimelines[];
  /** Whether the skeleton holds an animation of this name. */
  hasAnimation(name: string): boolean;
  /**
   * The slot's light and dark colour with the animation applied at `time` on
   * a fresh, non-looping track from the setup pose, no skin set — or
   * `undefined` for a slot the skeleton does not have.
   */
  posedTint(animation: string, slot: string, time: number): PosedTint | undefined;
}
