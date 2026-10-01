/**
 * The skeleton's bones and slots as the file lists them (issue #1025, cut 4c-4
 * of #380) — the census's F01 and F02, the halves of them that A12, A25 and
 * A26 read: each bone's name and its parent's, and each slot's name and
 * whether it declares a dark colour, in the file's order.
 *
 * ⭐ **The order is a value.** The slots array IS the draw order, and A26
 * holds it to the rig's table index for index; A12 prints one line per dark
 * slot in that order. The emitter writes both arrays in the model's own order
 * and never re-sorts them (`emitBones`, `emitSlots` in `src/emit_spine.ts`), so
 * the document's lists are the file's.
 *
 * ⚠️ **Read as the bodies always read the raw JSON.** A slot is any object in
 * the array, its name `String(name)` (a slot with no string name reads
 * `"undefined"`, as it always printed) and `dark` whether the key is present at
 * all; a bone is an object whose name is a string, its parent the string the
 * file states or `null`. `validate()` reads them off the skeleton JSON
 * (`rawSkeletonRoster`), which it parses before the round trip, so a file the
 * loader refuses is still read; the model side reads them off the document
 * (`../model/skeleton_roster.ts`).
 *
 * Links nothing from the runtime.
 */

/** A bone as the rules over parentage read it. */
export interface RosterBone {
  readonly name: string;
  /** The parent's name, or `null` for a root (or a parent the file does not spell as a string). */
  readonly parent: string | null;
}

/** A slot as the rules over the draw order and the dark colour read it. */
export interface RosterSlot {
  readonly name: string;
  /** Whether the slot declares a dark colour — the key's presence, which is all A12 asks. */
  readonly dark: boolean;
}

/** What A12, A25 and A26 read of the skeleton's arrays. */
export interface SkeletonRosterFacts {
  /** The bones, in the file's order. */
  readonly bones: readonly RosterBone[];
  /** The slots, in the file's order — the draw order. */
  readonly slots: readonly RosterSlot[];
}
