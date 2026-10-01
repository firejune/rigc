/**
 * The sliders and the timelines their animations key, as A40 reads them
 * (issue #1025, cut 4c-5 of step 4c of #380) — the census's F01–F04, F12,
 * F15, F18, F19 and R3.
 *
 * ⭐ **The order is the runtime's.** The sliders in the `constraints` array's
 * order, which is the update order and the order A40 calls "earlier" and
 * "later" in; each animation's timelines in the order the runtime builds
 * them — the slot timelines, the bone timelines, then ik, transform, path,
 * physics, slider, the attachments' deform and sequence, the draw order and
 * the events, each group's targets in the order the file keys them [measured:
 * an animation keying `events`, `drawOrder`, `attachments`, `slider`,
 * `physics`, `path`, `transform`, `ik`, `slots`, `bones` in that key order
 * loads them slots, bones, ik, transform, path, physics, slider, deform,
 * sequence, draw order, events]; each timeline's properties in the order it
 * registers them. A40 groups the timelines by property in that order and
 * prints one line per property shared, so the order is a fact both suppliers
 * state, not a sort either applies.
 *
 * 🔑 **A property is named by an id both suppliers spell the same way**: the
 * property's name, then the index of the bone, slot or constraint it
 * addresses in the skeleton's order (`-1` for a physics timeline naming no
 * constraint), then — for a deform or sequence timeline — the attachment it
 * is keyed on as `skin/slot/placeholder`. The runtime spells the last as an
 * object's serial number, which is the runtime's and not the rig's, so its
 * supplier maps each attachment object to the address it is filed under; a
 * physics `reset` and the draw-order and event timelines carry no index at
 * all (measured: a named `reset` reads `physicsConstraintReset` alone).
 *
 * 🔸 **What applying a timeline additively does is a question, not a value.**
 * It is posed — twice, with `add`, from two start states, under every skin —
 * so a body asks for it (`behaviour`), and only for the timelines it needs:
 * the validator answers with the runtime's probe, the model side with the
 * core's (`src/core/additive.ts`), and the selftest puts every question a
 * body asks to both.
 *
 * Links nothing from the runtime.
 */

/** What applying a timeline twice with `add` does (`src/core/additive.ts`' header). */
export type AddBehaviour = 'accumulates' | 'overwrites' | 'inert';

/** One property a timeline registers: the id it is shared by, the property's name, and the target and property as A40's sentence names them. */
export interface SliderTimelineProperty {
  readonly id: string;
  readonly property: string;
  readonly names: string;
}

/** One timeline of a slider's animation. */
export interface SliderTimelineFact {
  /** The runtime class it loads as — the word A40's sentence names `apply` on. */
  readonly runtimeClass: string;
  readonly properties: readonly SliderTimelineProperty[];
}

/** One slider constraint. */
export interface SliderFact {
  readonly name: string;
  /** Its position in the skeleton's `constraints` array. */
  readonly index: number;
  /** Its setup `mix`. */
  readonly mix: number;
  readonly additive: boolean;
  readonly skinRequired: boolean;
  /** The skins whose `slider` list names it, in the skeleton's skin order. */
  readonly skins: readonly string[];
  /** The animation it applies, with its timelines in the runtime's order — or `null` where it applies none. */
  readonly animation: { readonly name: string; readonly timelines: readonly SliderTimelineFact[] } | null;
}

/** What A40 reads beside the constraint facts. */
export interface SliderCompositionFacts {
  /** Every slider, in the `constraints` array's order. */
  readonly sliders: readonly SliderFact[];
  /** What the `timeline`-th timeline of `animation` does when it is applied twice with `add` — posed. */
  behaviour(animation: string, timeline: number): AddBehaviour;
}
