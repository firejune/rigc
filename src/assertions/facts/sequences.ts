/**
 * Numbered series and the frame a slot shows (issue #1025, cut 4c-3 of step
 * 4c of #380) — the census's F02, F03, F18 and R4 as A46 reads them: every
 * skin entry that draws a region, as the file states it and whether the
 * runtime loaded it; every sequence timeline, as the file states it; an
 * animation's duration; and what a slot shows at a time.
 *
 * ⭐ **Attachments by address, never by object.** A46 used to key what it knew
 * by the loaded attachment object and to ask whether the slot shows "the keyed
 * attachment or one playing its timelines" by identity. An object is the
 * runtime's; an address — `skin`, `slot`, `placeholder`, the triple the file
 * files an entry under and a timeline names it by — is the file's, and on the
 * runtime's side each loaded entry is exactly one object (one per skin, slot
 * and placeholder, which `Skin.getAttachment` is keyed by). So `posedFrame`
 * answers with addresses: the entry the slot shows, and the entry whose
 * timelines it plays (itself, or a linked mesh's source when the link plays
 * its source's timelines).
 *
 * ⭐ **The file's order and spelling where A46 walks and prints**: the skins in
 * the file's order, a skin's slot keys and a slot's placeholders in it; every
 * `sequence` block and key as the file spells it, since A46 parses them itself
 * and prints what it found.
 *
 * Links nothing from the runtime: `validate()` reads it off the skeleton JSON
 * and the loaded skeleton (`spineSequenceFacts`), the model side off the
 * document and the core (`../model/sequences.ts`).
 */

/** A skin entry's address: `skin`, `slot`, `placeholder`, joined by NULs. */
export type EntryAddress = string;

/** The address of one skin entry. */
export function entryAddress(skin: string, slot: string, placeholder: string): EntryAddress {
  return `${skin}\u0000${slot}\u0000${placeholder}`;
}

/** One skin entry that draws a region — a region, a mesh or a linked mesh. */
export interface SequenceSkinEntry {
  readonly skin: string;
  readonly slot: string;
  readonly placeholder: string;
  /** The entry's `name`, `path` and `sequence` as the file spells them (`undefined` where it states none). */
  readonly name: unknown;
  readonly path: unknown;
  readonly sequence: unknown;
  /** Whether the runtime loaded an attachment for the entry: its slot exists and the skin holds it. */
  readonly loaded: boolean;
}

/** One sequence timeline — an attachment's `sequence` that the file states as a list — the address it keys, and its keys as the file spells them. */
export interface SequenceTimeline {
  readonly animation: string;
  readonly skin: string;
  readonly slot: string;
  readonly placeholder: string;
  readonly keys: readonly unknown[];
}

/** What a slot shows at one pose. */
export interface PosedSequence {
  /** The entry the slot shows. */
  readonly shown: EntryAddress;
  /** The entry whose timelines it plays: itself, or the source of a linked mesh that plays its source's. */
  readonly playsAs: EntryAddress;
  /** The atlas region the shown entry's series resolves to at this pose, or `null` for none. */
  readonly region: string | null;
}

/** What A46 reads. */
export interface SequenceFacts {
  /** Every skin entry of a region, mesh or linked mesh, in the file's order: skins, then each skin's slot keys, then a slot's placeholders. */
  readonly entries: readonly SequenceSkinEntry[];
  /** Every animation's sequence timelines, in the file's order: animations, then skins, slots and placeholders as the animation keys them. */
  readonly timelines: readonly SequenceTimeline[];
  /** Whether the skeleton has a slot of this name. */
  hasSlot(slot: string): boolean;
  /** The runtime's duration of an animation, or `null` for no animation of that name. */
  duration(animation: string): number | null;
  /**
   * What the slot shows with the animation applied at `time` on a fresh,
   * non-looping track from the setup pose, no skin set — `null` when it
   * shows nothing.
   */
  posedFrame(animation: string, slot: string, time: number): PosedSequence | null;
}
