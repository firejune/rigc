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
 */
export class CompileError extends Error {}

/**
 * The spec can say it, the format can hold it, and rigc cannot emit it yet.
 *
 * Always name the field and what would have to be built, so the message is a
 * work item rather than a wall.
 */
export class NotImplementedError extends CompileError {}
