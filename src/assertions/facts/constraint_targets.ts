/**
 * The constraint timelines of every animation, as A34 walks them (issue
 * #1025, cut 4c-5 of step 4c of #380): the constraints the skeleton declares,
 * and each animation's `ik`, `transform`, `path`, `physics` and `slider`
 * groups as the Spine file states them — the constraint each entry names and
 * the key arrays under it.
 *
 * ⭐ **The order is the file's.** The animations in the order the file keys
 * them, in each the five groups in that fixed order, each group's entries in
 * the order the file keys them, each entry's timelines likewise: A34 prints
 * one line per finding, so the walk is a fact both suppliers state.
 *
 * 🔸 **Which constraints a physics timeline naming none reaches is a
 * question, not a value** — the runtime answers it by building the timeline
 * its parser builds for the name and asking each constraint's data whether it
 * takes the key (`unnamedPhysicsReach`), the model side by the core's own
 * reading (`posedPhysics`, through `unnamedReach`). A body asks for it
 * (`reach`), and the selftest puts every question to both (`VF14`).
 *
 * Links nothing from the runtime.
 */

/** One key array under an entry: the timeline's name (`''` for the `ik`/`transform` shape) and what it holds — how many keys, or the spelling of a value that is not a list. */
export interface TargetKeyArray {
  readonly timeline: string;
  readonly keys: { readonly count: number } | { readonly spelled: string };
}

/** One entry of a group: the constraint name the file keys it by, and either the spelling of a value that is not an object where named timelines go (`bare`) or its key arrays. */
export interface TargetEntry {
  readonly name: string;
  readonly bare: string | null;
  readonly keyArrays: readonly TargetKeyArray[];
}

/** One animation: its name and the groups it states, in the walk's order. */
export interface TargetAnimation {
  readonly name: string;
  readonly groups: ReadonlyArray<{ readonly group: 'ik' | 'transform' | 'path' | 'physics' | 'slider'; readonly entries: readonly TargetEntry[] }>;
}

/** What a physics timeline naming no constraint reaches: whether it is a `reset`, and the constraints that take its key. */
export interface UnnamedReach {
  readonly resets: boolean;
  readonly reached: readonly string[];
}

/** What A34 reads. */
export interface ConstraintTargetFacts {
  /** Every entry of the skeleton's `constraints` array that is an object: its name (null when it states none as a string), its type as spelled, and its name as the sentence spells it. */
  readonly constraints: ReadonlyArray<{ readonly name: string | null; readonly type: string; readonly spelled: string }>;
  /** Every animation, or `null` when the skeleton declares none (its `animations` is not an object). */
  readonly groupsByAnimation: readonly TargetAnimation[] | null;
  /** What a physics timeline named `timeline` that names no constraint reaches — or `null` for a name the parser builds no timeline for. */
  reach(timeline: string): UnnamedReach | null;
}
