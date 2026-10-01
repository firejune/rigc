/**
 * The constraints and the timelines that key them, as the bodies that ask
 * "does this constraint do anything" read them (issue #1025, step 4c of
 * #380) — the census's F12 to F17 and F19 with R1 and R2, for A23, A36, A37,
 * A41, A42, A47 and A48.
 *
 * ⭐ **The order is the runtime's update order**, which is the file's
 * `constraints` array and the document's: a body that prints one line per
 * constraint prints them in this order, and `A42` compares two positions in
 * it. A timeline's `constraint` is a position in the same list.
 *
 * ⭐ **The timelines are in the order the runtime builds them**: the
 * animations in the file's order, and within one the groups `ik`,
 * `transform`, `path`, `physics`, `slider` — whatever order the file keys
 * them in [measured: an animation keying `slider`, `physics`, `transform`,
 * `ik` in that key order loads ik, transform, physics, slider] — each group's
 * constraints and their timelines in the file's order. A body printing one
 * line per key prints them in this order.
 *
 * 🔸 **Values are the ones the runtime holds after its parse, and each
 * derivation is a function rigc already runs**, called by the model side: a
 * field the record leaves out reads the parser's value through the core's
 * record readers (`readModel`); `massInverse` and `step` are the core
 * physics record's `1 / mass` and `1 / fps`; a key's time and value are the
 * float32 the core's timeline reader stores; a Bézier segment's samples are
 * `bezierPolyline` (`src/core/animation.ts`), the runtime's curve the core
 * reproduces; the constraints a physics timeline naming none reaches are
 * read off the core's own `posedPhysics`, asked rather than restated.
 *
 * Links nothing from the runtime.
 */

/** The five constraint kinds, in the motion spec's words. */
export type ConstraintKind = 'ik' | 'transform' | 'path' | 'physics' | 'slider';

/** The five components a physics constraint drives, by name. */
export interface PhysicsComponents {
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly scaleX: number;
  readonly shearX: number;
}

/** The four bounded values of a physics constraint's setup pose — the fields `PHYSICS_POSE_RULES` judges. */
export interface PhysicsSetup {
  readonly mix: number;
  readonly massInverse: number;
  readonly strength: number;
  readonly damping: number;
}

/** One constraint, in update order. Exactly one of the kind fields is set, the one its `kind` names. */
export interface ConstraintEntry {
  readonly kind: ConstraintKind;
  readonly name: string;
  /** The runtime class the constraint updates as (`IkConstraint`, `Slider`, …) — the word A42's sentence names `update` on. */
  readonly runtimeClass: string;
  readonly physics?: { readonly bone: string; readonly components: PhysicsComponents; readonly setup: PhysicsSetup; readonly step: number };
  readonly path?: { readonly bones: readonly string[]; readonly slot: string; readonly setup: { readonly mixRotate: number; readonly mixX: number; readonly mixY: number } };
  readonly slider?: {
    /** The animation it applies — its name, how many timelines it carries and its duration — or `null` when it applies none. */
    readonly animation: { readonly name: string; readonly timelines: number; readonly duration: number } | null;
    /** The dial bone's name, or `null` for the bone-less form. */
    readonly bone: string | null;
    readonly loop: boolean;
    readonly scale: number;
    readonly mix: number;
  };
  readonly ik?: { readonly bones: readonly string[]; readonly target: string; readonly mix: number };
  /**
   * A transform constraint's six mix channels in frame order — `mixRotate`,
   * `mixX`, `mixY`, `mixScaleX`, `mixScaleY`, `mixShearY` — each the field's
   * name and its setup value where the constraint declares that property as
   * a `to`, and `null` where it does not: a mix the constraint never reads.
   */
  readonly transform?: { readonly bones: readonly string[]; readonly mixes: ReadonlyArray<{ readonly field: string; readonly setup: number } | null> };
}

/** One frame of a constraint timeline: its time and its first channel, as the runtime stores them (float32). */
export interface ConstraintFrame {
  readonly time: number;
  readonly value: number;
}

/** One constraint timeline of one animation. */
export interface ConstraintTimeline {
  readonly animation: string;
  readonly kind: ConstraintKind;
  /**
   * What it keys, in the motion spec's word: `ik` or `transform` for those
   * two; `position`, `spacing`, `mix`; `inertia` … `mix` or `reset`; `time`
   * or `mix`.
   */
  readonly word: string;
  /** The constraint it names, as a position in `constraints` — or −1 for a physics timeline naming none. */
  readonly constraint: number;
  /** The constraints it writes into, as positions in `constraints`. */
  readonly reach: readonly number[];
  /** Its frames; empty for `reset`. */
  readonly frames: readonly ConstraintFrame[];
  /**
   * Every value one channel poses while it plays: each key's own and every
   * sample of each Bézier segment between two keys, in frame order. Channel
   * 0 is the first value a frame holds (an ik frame's `mix`, a transform
   * frame's `mixRotate`, a path `mix` frame's `mixRotate`, the one value of
   * the others).
   */
  channelValues(channel: number): readonly number[];
  /**
   * On a physics timeline whose value `PHYSICS_POSE_RULES` bounds, the number
   * a keyed `value` becomes in the pose field the integrator reads — a `mass`
   * key lands as its reciprocal (`massInverse`), the rest as they are: the
   * census's R1. `validate()` asks the runtime's own `set`; the model side the
   * rule's `toPose`, the compiler's reading, which a selftest control holds to
   * the runtime's. Absent on every other timeline.
   */
  readonly posed?: (value: number) => number;
}

/** What A23, A36, A37, A41, A42, A47 and A48 read. */
export interface ConstraintFacts {
  /** How many animations the skeleton declares. */
  readonly animations: number;
  /** Every constraint, in update order. */
  readonly constraints: readonly ConstraintEntry[];
  /** Every constraint timeline of every animation, in the order the runtime builds them. */
  readonly timelines: readonly ConstraintTimeline[];
  /** The slots some skin gives a path attachment, each once. */
  readonly pathSlots: readonly string[];
}
