/**
 * Every animation's bone timelines, in the file's order and spelling (issue
 * #1025, cut 4c-4 of #380) — the half of the census's F18/F19 that the stroke
 * rules read: which bones each animation keys, with which timelines, and each
 * key as the file states it.
 *
 * ⭐ **The file's order, and the file's spelling**, for the reason A45's slot
 * timelines carry both (`./slot_colour.ts`): A24 and A30 print one line per
 * bone and per timeline in the order the file keys them, and A24, A29 and A30
 * print a key's `x`, `y` and `time` as the file states them. So the list holds,
 * for every animation in the order the file keys them and every bone in the
 * order the animation keys them, that bone's timelines — name to keys — as
 * the file spells them. `validate()` reads it off the skeleton JSON
 * (`rawBoneTimelines`); the model side produces it from the document by calling
 * the emitter's own order and its parser-default and key-order passes
 * (`../model/bone_timelines.ts`), so a key field the emitter would leave out at
 * the parser's default is left out here too.
 *
 * ⚠️ `timelines` is `unknown` rather than an object because the raw JSON can
 * hold anything there and A24 counts a keyed bone before it asks what the
 * bone's timelines are; the document always holds an object.
 *
 * Links nothing from the runtime.
 */

/** One animation's timelines on one bone: timeline name -> keys, as the file states them. */
export interface BoneTimelines {
  readonly animation: string;
  readonly bone: string;
  readonly timelines: unknown;
}

/** What A24, A29 and A30 read. */
export interface BoneTimelineFacts {
  /** Every (animation, bone) pair the file keys, in the header's order. */
  readonly boneTimelines: readonly BoneTimelines[];
}
