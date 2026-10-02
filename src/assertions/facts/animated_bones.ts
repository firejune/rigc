/**
 * Which bones an animation keys (issue #1025, step 4c of #380) — the roster
 * half of the census's F18 that A15 reads: whether the skeleton holds an
 * animation of a name, whether it keys any bone, and which bones, in the
 * order the file keys them.
 *
 * ⭐ **Three states, because A15 says three different things.** No such
 * animation, an animation that keys no bone, and the bones it keys are each a
 * sentence of their own in A15 — one is a missing subject, the next a subject
 * with nothing in it, the last the subject — so the fact keeps them apart
 * rather than folding the first two into an empty list.
 *
 * The order is the file's: A15 prints one line per keyed bone in it. The file
 * keys an animation's bones in an object filled in the order the emitter
 * writes the model's (`emitAnimation`), which is the document's own list — so
 * an array-index bone name (`5`, `10`) is listed first whatever its place in
 * that list (issue #1039), and the model side reads it through `keyedOrder`.
 *
 * Links nothing from the runtime: `validate()` reads it off the skeleton JSON
 * as A15 always did, and the model side off the document
 * (`../model/animated_bones.ts`).
 */
export interface AnimatedBoneFacts {
  /**
   * The bones `animation` keys, in the file's order — `undefined` when the
   * skeleton holds no animation of that name, `null` when it holds one that
   * carries no bone timeline at all.
   */
  bonesKeyedBy(animation: string): readonly string[] | null | undefined;
}
