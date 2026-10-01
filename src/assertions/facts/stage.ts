/**
 * The stage the skeleton states (issue #1025, step 4c of #380) — the census's
 * F11: the setup-pose box's width and height, which A14 measures a mesh against
 * and A19 measures an attachment against.
 *
 * ⚠️ **`undefined` is a value here, and it is the runtime's.** A skeleton that
 * declares no stage loads with `width` and `height` undefined (measured through
 * spine-core 4.3.13: a header with neither key reads both as `undefined`, not
 * 0), and the two rules read that absence differently on purpose — A14 skips,
 * A19 names the base plate it cannot decide. So the fact carries the absence
 * rather than a number standing in for it, and each body reads it as it always
 * did.
 *
 * Not in the model document: the stage is the emitter's header
 * (`SkeletonHeader.stage`), and it enters the document with issue #1026. Until
 * then the model side is given it by its caller (`../model/stage.ts`).
 * Links nothing from the runtime.
 */

/** The stage's two extents, each `undefined` where the skeleton states none. */
export interface StageFacts {
  readonly width: number | undefined;
  readonly height: number | undefined;
}
