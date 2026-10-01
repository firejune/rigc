/**
 * The animations and how long each one runs (issue #1025, cut 4c-3 of step
 * 4c of #380) — the census's F18 and F19 as A09 reads them: the animation
 * roster in the file's order, each animation's duration as the runtime holds
 * it, and each of its timelines' own duration.
 *
 * ⭐ **The runtime's durations, not the stated ones.** An animation's duration
 * is the last key of every timeline it carries, as float32 — the number
 * `SkeletonJson` computes and stores, which is what A09 holds against the
 * declared duration — and a timeline's own duration is its last key, as
 * float32 (`Timeline.getDuration`). A09 counts the timelines keyed past the
 * declared duration in its message, so the list holds one entry per timeline
 * the runtime builds, in no order a body may read: A09 counts them and
 * nothing else.
 *
 * The order of the roster is the file's: A09's last clause prints one line per
 * animation the spec does not declare, in it.
 *
 * Links nothing from the runtime: `validate()` reads it off the loaded
 * skeleton (`spineAnimationDurations`), the model side off the document and
 * the core (`../model/animation_durations.ts`).
 */

/** One animation, as A09 reads it. */
export interface AnimationDuration {
  readonly name: string;
  /** The runtime's duration: the last key of every timeline, float32. */
  readonly duration: number;
  /** Each timeline's own duration — its last key, float32 — one per timeline the runtime builds. */
  readonly timelineDurations: readonly number[];
}

/** What A09 reads. */
export interface AnimationDurationFacts {
  /** Every animation the skeleton holds, in the file's order. */
  readonly animations: readonly AnimationDuration[];
}
