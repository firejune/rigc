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
 * A `rigc-compiled/3` document states it (`stage`, issue #1026), and since
 * issue #907 that is the only place a rigc build states it: the Spine header
 * carries the setup-pose bounding box. So both suppliers read a rigc build's
 * stage off its document (`spineStage` in `../../validate.ts`,
 * `../model/stage.ts`); an export, which has no document, is read off its
 * header.
 * Links nothing from the runtime.
 */

/** The stage's two extents, each `undefined` where the skeleton states none. */
export interface StageFacts {
  readonly width: number | undefined;
  readonly height: number | undefined;
}
