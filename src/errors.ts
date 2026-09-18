/**
 * The compiler's two error kinds, in their own module so that `src/rig.ts` and
 * `src/compile.ts` can both throw them without importing each other.
 *
 * `NotImplementedError` is not a lesser `CompileError`; it is a promise about
 * the failure mode. The Spine 4.3 format holds seven attachment types and five
 * constraint types (SPEC_COVERAGE part 1), rigc emits a slice of that, and the
 * parser's behaviour on the rest is to **drop them without a word** — an unknown
 * attachment `type` returns null (`SkeletonJson.ts:653`), a constraint entry with
 * an unrecognised `type` matches no case and vanishes (`:148-367`). So a rig spec
 * that asks for one of those must be refused by name rather than compiled into a
 * skeleton that is quietly missing it.
 *
 * The one import here is a TYPE, erased at build time, so this module still has
 * no runtime dependency on anything and the sentence above still holds.
 */
import type { DroppedState } from './types.ts';

export class CompileError extends Error {
  /**
   * States the manifest listed whose art was not found, recorded before this
   * refusal was raised (issue #671).
   *
   * ⭐ **A drop is a fact about the inputs, and a throw is where it used to be
   * lost.** The `DROP` lines are printed from the compile RESULT, which a throw
   * never returns — so the one output naming the file was suppressed exactly on
   * the run that failed because of it. It rides here rather than being printed
   * from the compiler because `src/` writes to no console at all — grep its 31
   * modules for one and the count is zero, this sentence included — and a
   * library caller's `compile()` must not start emitting to stdout.
   *
   * It is a field on the base class rather than a subclass so that a
   * `NotImplementedError` keeps its own class while carrying the same facts:
   * the wrapper in `src/compile.ts` annotates whatever was thrown instead of
   * re-wrapping it into something else.
   *
   * ⚠️ `declare`, so this is a type and not a field the constructor defines.
   * Written as an ordinary optional field it is emitted as `droppedStates;`,
   * which gives **every** `CompileError` an own key holding `undefined` — and
   * an uncaught one then dumps `droppedStates: undefined,` under its message,
   * measured on a crashing run. A refusal with no drops behind it should read
   * exactly as it did before.
   */
  declare droppedStates?: readonly DroppedState[];
}

/**
 * The spec can say it, the format can hold it, and rigc cannot emit it yet.
 *
 * Always name the field and what would have to be built, so the message is a
 * work item rather than a wall.
 */
export class NotImplementedError extends CompileError {}
