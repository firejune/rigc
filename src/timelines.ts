/**
 * The 4.3 animation timeline catalogue, as data plus one walker.
 *
 * This lives on its own because two very different consumers need the same
 * enumeration and neither may drift from the other: `validate.ts` walks it to
 * check curve arrays (A05) and two-colour timelines (A12), and `diff.ts` walks
 * it to count what a rig actually keys. When it was inlined in the validator,
 * "which groups exist" was stated in one place and the comparison tool would
 * have had to restate it — and a second copy of a catalogue is a second copy
 * that goes stale silently.
 *
 * `PHYSICS_POSE_RULES` at the bottom is here for that reason and no other: the
 * compiler refuses an out-of-range physics value a spec states, `A23` names one
 * in a file rigc did not write, and the two have to be the same criterion rather
 * than two readings of one (issue #610).
 *
 * Pure JSON reading. No spine-core, no filesystem. The line numbers cited are
 * into `SkeletonJson.ts` on branch 4.3; the field-by-field survey is in
 * `docs/SPEC_COVERAGE.md` part 1-8.
 */

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * How many value channels each timeline carries. A curve array holds exactly
 * four numbers PER channel; anything shorter
 * multiplies `undefined` into the cubic and produces a NaN curve with no error
 * (case 6g). `null` means "this timeline takes no curve at all".
 */
const BONE_CHANNELS: Record<string, number | null> = {
  rotate: 1,
  translate: 2,
  translatex: 1,
  translatey: 1,
  scale: 2,
  scalex: 1,
  scaley: 1,
  shear: 2,
  shearx: 1,
  sheary: 1,
  inherit: null,
};
const SLOT_CHANNELS: Record<string, number | null> = {
  attachment: null,
  rgba: 4,
  rgb: 3,
  alpha: 1,
  rgba2: 7,
  rgb2: 6,
};
const ATTACHMENT_CHANNELS: Record<string, number | null> = {
  deform: 1,
  sequence: null,
};
const PHYSICS_CHANNELS: Record<string, number | null> = {
  inertia: 1,
  strength: 1,
  damping: 1,
  mass: 1,
  wind: 1,
  gravity: 1,
  mix: 1,
  reset: null,
};
const PATH_CHANNELS: Record<string, number | null> = {
  position: 1,
  spacing: 1,
  mix: 3,
};
const SLIDER_CHANNELS: Record<string, number | null> = {
  time: 1,
  mix: 1,
};
/**
 * `ik` and `transform` are ONE timeline per constraint with no sub-name — the
 * group maps a constraint name straight to a key array. There is no name in the
 * file to look up, so the walker passes the group's own name and these tables
 * hold that single entry.
 */
const IK_CHANNELS: Record<string, number | null> = { ik: 2 };
const TRANSFORM_CHANNELS: Record<string, number | null> = { transform: 6 };
/** Whole-animation timelines. None of the three can carry a curve at all. */
const DRAW_ORDER_CHANNELS: Record<string, number | null> = { drawOrder: null };
const DRAW_ORDER_FOLDER_CHANNELS: Record<string, number | null> = { drawOrderFolder: null };
const EVENT_CHANNELS: Record<string, number | null> = { events: null };

/**
 * How far past an animation's declared `duration` a key time may land: one step
 * of the **float32** grid at that duration, which is the grid a key time is
 * both emitted on and stored on.
 *
 * `spine-core` reads every timeline's frames into a `Float32Array`, and since
 * issue #716 the compiler writes every number as its float32's shortest name,
 * so the two grids are one. A key placed exactly ON a duration the float cannot
 * hold is stored at most half a step from it — later, for a time like `0.2`
 * whose own text names a float; never later for a time off that grid, which
 * `keyTime` steps down (issue #99). What still needs the tolerance is the first
 * case, and every artifact no rigc compile touched. Anything a whole step past a
 * declared duration was authored there, not rounded onto it.
 *
 * ⭐ **A function and not a constant, because the grid is relative.** The fixed
 * `KEY_TIME_EPSILON = 1e-6` that stood here was one step of `r6`'s six-decimal
 * grid, and `A09` added this function to it for the float the file is read back
 * into. With `r6` retired the first term had nothing left to be a step of, so it
 * retired with it: a float32 step is 4.8e-7 s at 5 s and 3.8e-6 s at 32 s, and a
 * flat epsilon would fail correct data for being long — 972 frames at 30 fps
 * keyed exactly on their own declared duration are stored 1.5e-6 s late.
 *
 * ⚠️ `FRAME` (1/60 s) is the wrong tolerance for this, which is why the function
 * is separate rather than reused: 1/60 s answers "is the DECLARED DURATION
 * wrong?", it is some 35,000 times wider than this at 5 s, and it hid the
 * defect that put this here. Rung 6 rounded key times to 4 dp in its authoring
 * tooling, so a one-frame attachment reveal landed 3.3e-5 s past a 68/12 s
 * duration — about 70 steps past this line but 1/500 of FRAME, with another
 * track already sitting on the declared duration, so the compiler's Rule 4 and
 * the validator's A09 both compared the animation's max key time and agreed.
 * The reveal never fired (issue #54).
 *
 * The spacing of a normal float is 2^(exponent − 23), and `Math.log2` recovers
 * the exponent. Zero takes the guard — a named empty animation declares
 * `duration: 0` and A09 does compare it — and the magnitude is taken first, so a
 * sign never reaches `log2`.
 *
 * It lives here, beside the timeline catalogue, for the reason the catalogue
 * does: `compile.ts` refuses on it and `validate.ts` re-checks the emitted file
 * against it, and a second copy is a second copy that drifts.
 */
export function float32Step(t: number): number {
  const magnitude = Math.abs(t);
  if (!Number.isFinite(magnitude) || magnitude === 0) return 0;
  return 2 ** (Math.floor(Math.log2(magnitude)) - 23);
}

/**
 * Every timeline group `readAnimation` reads (SPEC_COVERAGE part 1-8), keyed by
 * the walker's `kind`. A05 selects its channel table from here, so a group that
 * is missing from this map is a group whose curves nobody checks.
 */
export const CHANNELS_BY_KIND: Record<TimelineKind, Record<string, number | null>> = {
  bone: BONE_CHANNELS,
  slot: SLOT_CHANNELS,
  ik: IK_CHANNELS,
  transform: TRANSFORM_CHANNELS,
  path: PATH_CHANNELS,
  physics: PHYSICS_CHANNELS,
  slider: SLIDER_CHANNELS,
  attachment: ATTACHMENT_CHANNELS,
  drawOrder: DRAW_ORDER_CHANNELS,
  drawOrderFolder: DRAW_ORDER_FOLDER_CHANNELS,
  event: EVENT_CHANNELS,
};

/** The eleven timeline groups one animation can hold in 4.3. */
export type TimelineKind =
  | 'bone'
  | 'slot'
  | 'ik'
  | 'transform'
  | 'path'
  | 'physics'
  | 'slider'
  | 'attachment'
  | 'drawOrder'
  | 'drawOrderFolder'
  | 'event';


/**
 * Walks every timeline group `readAnimation` reads and hands each timeline to
 * the visitor.
 *
 * ⚠️ This function is the reach of A05 and A12, so a group it does not descend
 * is a group whose curve arrays nobody checks — and a short curve array is the
 * format's nastiest silent failure (`curve[i+3]` is
 * `undefined`, the cubic yields NaN, nothing throws). It used to descend
 * `bones`, `slots`, `physics` and `attachments` only, which left `ik`,
 * `transform`, `path`, `slider`, `drawOrder`, `drawOrderFolder` and `events`
 * completely unexamined. The comment that stood here claimed drawOrder and
 * events were "skipped by design" because they carry no curves — but "carries
 * no curve" is precisely a rule that has to be CHECKED, and the parser ignores
 * a stray `curve` key on those timelines rather than rejecting it.
 *
 * The groups come in four shapes, and the shape is the whole reason this is not
 * one loop (SPEC_COVERAGE part 1-8):
 *
 *   group.<target>.<timeline> = keys[]   bones, slots, path, physics, slider
 *   group.<target>            = keys[]   ik, transform — one unnamed timeline
 *   group                     = keys[]   drawOrder, events — one per animation
 *   group                     = folders[] with .keys[]   drawOrderFolder
 *
 * plus `attachments.<skin>.<slot>.<attachment>.<timeline>`. For the shapes with
 * no timeline name in the file, the walker passes the group's own name so that
 * A05's table lookup and its "unchecked timeline" fail-closed branch both keep
 * working unchanged.
 */
export function walkTimelines(
  raw: Json | null,
  visit: (path: string, kind: TimelineKind, name: string, keys: unknown[]) => void,
): void {
  if (!raw || !isObj(raw.animations)) return;
  for (const [animName, anim] of Object.entries(raw.animations as Json)) {
    if (!isObj(anim)) continue;

    // group.<target>.<timeline> = keys[]
    for (const [group, kind] of [
      ['bones', 'bone'],
      ['slots', 'slot'],
      ['path', 'path'],
      ['physics', 'physics'],
      ['slider', 'slider'],
    ] as const) {
      if (!isObj(anim[group])) continue;
      for (const [targetName, timelines] of Object.entries(anim[group] as Json)) {
        if (!isObj(timelines)) continue;
        for (const [timelineName, keys] of Object.entries(timelines)) {
          if (!Array.isArray(keys)) continue;
          visit(`${animName}.${group}.${targetName}.${timelineName}`, kind, timelineName, keys);
        }
      }
    }

    // group.<constraint> = keys[] — the constraint IS the timeline
    for (const [group, kind] of [
      ['ik', 'ik'],
      ['transform', 'transform'],
    ] as const) {
      if (!isObj(anim[group])) continue;
      for (const [targetName, keys] of Object.entries(anim[group] as Json)) {
        if (!Array.isArray(keys)) continue;
        visit(`${animName}.${group}.${targetName}`, kind, group, keys);
      }
    }

    // group = keys[] — one timeline for the whole animation
    for (const [group, kind] of [
      ['drawOrder', 'drawOrder'],
      ['events', 'event'],
    ] as const) {
      const keys = anim[group];
      if (!Array.isArray(keys)) continue;
      visit(`${animName}.${group}`, kind, group, keys);
    }

    // drawOrderFolder = [ { slots: [...], keys: [...] } ] — one timeline per folder
    if (Array.isArray(anim.drawOrderFolder)) {
      (anim.drawOrderFolder as unknown[]).forEach((folder, i) => {
        if (!isObj(folder) || !Array.isArray(folder.keys)) return;
        visit(`${animName}.drawOrderFolder[${i}]`, 'drawOrderFolder', 'drawOrderFolder', folder.keys);
      });
    }

    // attachments.<skin>.<slot>.<attachment>.<timeline>
    if (isObj(anim.attachments)) {
      for (const [skinName, skinMap] of Object.entries(anim.attachments as Json)) {
        if (!isObj(skinMap)) continue;
        for (const [slotName, slotMap] of Object.entries(skinMap)) {
          if (!isObj(slotMap)) continue;
          for (const [attName, attMap] of Object.entries(slotMap)) {
            if (!isObj(attMap)) continue;
            for (const [timelineName, keys] of Object.entries(attMap)) {
              if (!Array.isArray(keys)) continue;
              visit(
                `${animName}.attachments.${skinName}.${slotName}.${attName}.${timelineName}`,
                'attachment',
                timelineName,
                keys,
              );
            }
          }
        }
      }
    }
  }
}


/**
 * A physics constraint's pose, as the four fields `A23` judges.
 *
 * Structural rather than spine-core's `PhysicsConstraintPose`, because this
 * module links no runtime (see the header) — the runtime's class satisfies it,
 * and so does the probe `validate.ts` hands the runtime's own timeline `set` to
 * fill.
 */
export interface PhysicsJudgedPose {
  mix: number;
  massInverse: number;
  strength: number;
  damping: number;
}

/** One way out of a physics bound, and what the runtime does with a value that takes it. */
export interface PhysicsOutsideArm {
  /** True for the pose values this arm is about — every one of them outside the bound. */
  when: (poseValue: number) => boolean;
  /** What the runtime does with such a value, in the words both of `A23`'s arms print. */
  says: string;
}

/**
 * A value a basis arm is measured at: a stated number (a key's or the tuning
 * table's, before `toPose`) and the constraint `fps` it is stepped at, where the
 * arm's claim depends on the rate. Absent `fps` is the constraint's own rate.
 */
export interface PhysicsBasisWitness {
  value: number;
  fps?: number;
}

/**
 * Why one way out of a physics bound is refused, in the one of two kinds it is
 * (issue #798).
 *
 * - **arithmetic** — the runtime cannot compute the value: an expression in the
 *   integrator is non-finite at it, whatever the rest of the rig does.
 *   `expression` says which and `lines` cites where.
 * - **behavioural** — the runtime computes it, finitely, and the rig runs
 *   wrongly: a run-away, an inverted jiggle, a constraint doing nothing.
 *   Refusing it is rigc's call, and the sentence says so.
 *
 * ⚠️ The line between them is **non-finite within the walk that measures it**,
 * never "non-finite eventually". [measured] through spine-core on the generated
 * physics fixture, stepped from `Physics.reset` at 60 fps under a displacing
 * animation: a setup `damping` of 2 is finite for 1,064 steps and its velocity
 * is Infinity at step 1,065, and 1.0001 is finite over 4,000; a `mass` of −1
 * takes the offset to 2.7e6 in 120 steps and is finite on every one. Every
 * run-away overflows at SOME horizon, so "eventually" would call each of them
 * arithmetic and the distinction would say nothing. The arithmetic arms are
 * non-finite from the first or second step: `mass` 0 at step 1, a `damping` of
 * −0.5 at 45 fps at step 2.
 *
 * `witness` is the value `T113` steps through the runtime to hold `kind`
 * against it: an arithmetic arm has to go non-finite within its 120 steps, a
 * behavioural one has to stay finite for all of them.
 */
export type PhysicsBoundBasis =
  | {
      kind: 'arithmetic';
      /** True for the pose values this arm is about — every one of them outside the bound. */
      when: (poseValue: number) => boolean;
      witness: PhysicsBasisWitness;
      /** The expression that is non-finite at the value, and what that does to the pose. */
      expression: string;
      /** Where the runtime computes it, in spine-core 4.3.13's `dist`. */
      lines: string;
    }
  | {
      kind: 'behavioural';
      /** True for the pose values this arm is about — every one of them outside the bound. */
      when: (poseValue: number) => boolean;
      witness: PhysicsBasisWitness;
      /** What the runtime does with the value, finitely — the reason the rig is wrong. */
      does: string;
    };

/**
 * One arm's reason, in the words every sentence that refuses a value by it
 * prints: an arithmetic arm names its expression and lines, a behavioural one
 * says that refusing it is rigc's call and then what the value does.
 *
 * ⚠️ The behavioural reason ENDS on `does`, so a sentence built on it ends on
 * what the value does — `T100` holds `strength`'s setup sentences to ending on
 * the row's own `outside` arm, and this order is what keeps that true.
 */
export function physicsBasisSays(arm: PhysicsBoundBasis): string {
  return arm.kind === 'arithmetic'
    ? `${arm.expression} (\`${arm.lines}\`)`
    : `the runtime runs this value finitely, so refusing it is rigc's call rather than the runtime's: ${arm.does}`;
}

/** The arm of a row's `basis` that holds for a pose value, or `undefined` where none does. */
export function physicsBasisFor(rule: PhysicsPoseRule, poseValue: number): PhysicsBoundBasis | undefined {
  return rule.basis.find((arm) => arm.when(poseValue));
}

/**
 * One physics property `A23` has an opinion about, stated once for the two
 * layers that hold it.
 *
 * ⚠️ **The keyed number and the pose field are not always the same number.**
 * `mass` is the one: `PhysicsConstraintMassTimeline.set` is
 * `pose.massInverse = 1 / value` (`Animation.js:2132-2145`) and the parser does
 * the same to a constraint's own `mass` (`SkeletonJson.js:309`), so a key states
 * a mass and the integrator reads its reciprocal. `toPose` IS that transform, and
 * every predicate here is written against the pose field rather than against the
 * keyed number — which is what makes "the compiler and the assertion apply the
 * same criterion" a property of the code and not a claim about it.
 */
export interface PhysicsPoseRule {
  /** The timeline name in skeleton JSON, and the motion spec's `property`. */
  timeline: string;
  /** The pose field the integrator reads. */
  field: keyof PhysicsJudgedPose;
  /** The pose field, from the number a key or the rig's tuning table states. */
  toPose: (value: number) => number;
  /** True when the integrator can use that pose field. */
  poseOk: (poseValue: number) => boolean;
  /**
   * The same question asked of a KEY, where it differs — `null` means it does
   * not. **Two rows have one, and in both the widening is to 0 exactly**, for
   * the same reason: a setup pose states what a constraint IS and a key states
   * what it is doing for a stretch, so a value that makes a constraint
   * permanently useless can be a deliberate span inside an animation.
   *
   * - `mix`: `update` opens with `if (mix === 0) return;`
   *   (`PhysicsConstraint.js:109-111`) and `PhysicsConstraintPose` documents the
   *   field as "a percentage (0+)", so a mix of exactly 0 is a state the runtime
   *   has a branch for. Measured, not assumed: the editor's own `sack-pro`
   *   example keys mix to 0 on 24 of its 36 mix keys, and applying the setup
   *   rule to keys would refuse all 24 (issue #610).
   * - `strength`: 0 takes the restoring term out of the velocity update and
   *   leaves `damping` and `inertia` applied, which is a released span rather
   *   than a broken constraint. Measured through spine-core on the generated
   *   overlay fixture, keying 0 for a span and restoring it (issue #727): no
   *   NaN; with no wind or gravity the offset coasts to a LIMIT rather than
   *   running away — 0.5 s of it and 2.0 s of it end 0.95 % apart — and the
   *   restoring key takes the offset from 5.5063 back under 0.01 in 54 steps at
   *   60 fps. With `gravity -40` acting, the offset travels at
   *   terminal velocity while the key holds (178 units over 0.5 s, 843 over
   *   2.0 s) and the restoring key still pulls it back to the never-keyed run's
   *   own equilibrium — 39.999969 against 40.000000 — in 13 steps. What that
   *   measurement rules out is the thing a key cannot undo, and the neighbour
   *   that HAS one is the contrast: a keyed `mass` of 0 is NaN from the first
   *   sub-step and still NaN after the restoring key, so it stays refused.
   */
  keyOk: ((poseValue: number) => boolean) | null;
  /**
   * True where a SETUP value this bound refuses leaves the constraint doing
   * **nothing**, rather than doing something wrong — so an animation keying a
   * value the bound accepts makes it effective, and a rig resting outside the
   * bound is off rather than broken.
   *
   * Only `mix` is, and it is measured rather than argued (issue #743). At rest —
   * setup pose, no animation applied, 36 steps at 60 fps — a constraint resting
   * at `mix` 0 leaves its bone at worldX 12.0000 on every frame, while one
   * resting at `mass` 0 reads NaN on every frame *although an animation keys
   * `mass` to 1*, because `massInverse` is already Infinity before anything
   * plays. Measured with the fixture's gravity at 0 and again at −40: the second
   * rig is NaN either way, since `m = t * massInverse` is Infinity and the force
   * it multiplies need not be non-zero for the product to be NaN.
   *
   * The same asymmetry is in the runtime's own text: `update` opens with
   * `if (mix === 0) return;` (`PhysicsConstraint.js:109-111`) and has no such
   * branch for the other three.
   *
   * ⚠️ This is NOT `keyOk !== null`, although today both are `mix` alone. That
   * one says what a KEY may hold; this says whether a key can rescue the SETUP
   * value — two questions with one answer here and no reason to share a field.
   */
  inertAtSetup: boolean;
  /**
   * What the runtime does with a value outside the bound, one arm per way out,
   * where the ways out do different things — or `null` where one sentence covers
   * them all. `A23`'s SETUP sentence reads the arm that holds for the value, and
   * the row's `why` — the KEY's sentence — is written from the same arms, so the
   * two cannot say different things about one number (issue #748).
   *
   * Only `strength` has two, and they are measured rather than argued: resting
   * at 0 the offset is only the bone's own lag, since nothing restores it,
   * while resting below 0 the restoring term is added instead of taken out and
   * the offset runs away — on the generated physics fixture, stepped at 60 fps
   * from `Physics.reset`, a setup `strength` of −100 grew the offset 28.35× over
   * 0.5 s with no sign change. The single sentence this replaced said "nothing
   * pulls it back" of both, which sends an author reading the negative one to
   * the wrong fix.
   */
  outside: readonly PhysicsOutsideArm[] | null;
  /**
   * Why each way out of the bound is refused — one arm per way out, arithmetic
   * or behavioural, disjoint and together covering every pose value `poseOk`
   * refuses (issue #798). `A23`'s setup sentence prints the arm that holds for
   * the value, and the row's `why` — the key's sentence — opens with the arms a
   * key can still take. Until this field existed `src/types.ts` said of all four
   * rows that "the bounds are the runtime's, not a policy", which is true of two
   * of the eight ways out.
   */
  basis: readonly PhysicsBoundBasis[];
  /** The bound in words, for a message: what the value has to be. */
  states: string;
  /** The bound a KEY is held to, where `keyOk` widens it. */
  statesKeyed: string;
  /**
   * What the runtime does outside the bound, with the lines that say so. It
   * OPENS with the basis of the ways out a key can take — the arithmetic
   * arm's expression, or the behavioural arm's "refusing it is rigc's call"
   * and what the value does (issue #798) — quoted off the same `basis` objects
   * the setup sentence prints, so the two cannot say different things.
   *
   * ⚠️ It is the sentence a **key** is refused with — `physicsKeyRefusal` is
   * this field's only reader, and the setup pose's own wording lives beside
   * `A23` in `validate.ts`. So a row whose `keyOk` widens the bound states here
   * what is wrong with the values a key can still be refused for, not what is
   * wrong with the value the widening admitted (issue #727).
   */
  why: string;
}

/**
 * `strength`'s two ways out of its bound — two different rigs, so two sentences
 * (issue #748). Resting at 0 there is no restoring force and the offset is only
 * the bone's own lag; below 0 the restoring term has the wrong sign, so the
 * offset feeds its own velocity and runs away. The row's `outside` is this array
 * and its `why` quotes the first arm, which is the one a key can still take.
 */
const STRENGTH_OUTSIDE: readonly PhysicsOutsideArm[] = [
  {
    when: (v) => v < 0,
    says:
      'below 0 the restoring term is ADDED to the offset instead of taken out of it, so the offset is pushed ' +
      'away and grows with every step',
  },
  { when: (v) => v === 0, says: 'nothing pulls it back' },
];

/**
 * The eight ways out of the four bounds, each with its basis (issue #798). They
 * are named constants rather than literals inside the rows because each row's
 * `why` quotes its own — the key's sentence and `A23`'s setup sentence are then
 * one text about one number, as `STRENGTH_OUTSIDE` already made them for two.
 *
 * 📏 Every witness below was stepped through spine-core 4.3.13 on the generated
 * physics fixture — `x` and `y` driven, 120 steps from `Physics.reset` at 60 fps
 * under an animation that swings the constraint's bone and brings it back — as
 * the constraint's SETUP value: `mass` 0 is NaN at step 1 (`xVelocity`, and the
 * bone's `worldX` with it); `mass` −1 is finite on every step and runs the
 * offset away to 2.7e6; `strength` 0 and −5 are finite; `mix` 0 poses the bone
 * exactly where the rig with no constraint does, on every step; `mix` −0.5 is
 * finite and moves the bone by exactly −1× what +0.5 moves it by; `damping` 2 is
 * finite over the walk (Infinity only at step 1,065); `damping` −0.5 at 45 fps is
 * NaN at step 2. `T113` re-takes all eight on every run.
 */
const MIX_BELOW_0: PhysicsBoundBasis = {
  kind: 'behavioural',
  when: (v) => v < 0,
  witness: { value: -0.5 },
  does:
    'below 0 the jiggle is applied inverted, on `x` and `y` exactly the offset a positive mix of the same size ' +
    'applies, mirrored (`PhysicsConstraint.js:172,174`), and `PhysicsConstraintPose` documents mix as ' +
    '"a percentage (0+)" where a transform constraint documents its own as "unbounded"',
};
const MIX_AT_0: PhysicsBoundBasis = {
  kind: 'behavioural',
  when: (v) => v === 0,
  witness: { value: 0 },
  does: 'at 0 `update` returns before it does anything (`PhysicsConstraint.js:109-111`), so the constraint is muted',
};
const MASS_AT_0: PhysicsBoundBasis = {
  kind: 'arithmetic',
  // The pose holds 1 / mass, so a mass of 0 arrives as Infinity (−0 as −Infinity).
  when: (v) => !Number.isFinite(v),
  witness: { value: 0 },
  expression:
    'at 0 `massInverse = 1 / mass` is Infinity and `m = t * massInverse` multiplies every velocity update, so the ' +
    'first step takes every velocity and offset to NaN',
  lines: 'SkeletonJson.js:309, Animation.js:2140, PhysicsConstraint.js:149,156,211',
};
const MASS_BELOW_0: PhysicsBoundBasis = {
  kind: 'behavioural',
  when: (v) => Number.isFinite(v) && v < 0,
  witness: { value: -1 },
  does:
    'below 0 `massInverse` is a finite negative, which flips the sign of every force the velocity update applies, ' +
    'so the restoring force pushes the offset away and it grows with every step',
};
const STRENGTH_BELOW_0: PhysicsBoundBasis = {
  kind: 'behavioural',
  when: STRENGTH_OUTSIDE[0].when,
  witness: { value: -5 },
  does: STRENGTH_OUTSIDE[0].says,
};
const STRENGTH_AT_0: PhysicsBoundBasis = {
  kind: 'behavioural',
  when: STRENGTH_OUTSIDE[1].when,
  witness: { value: 0 },
  does: STRENGTH_OUTSIDE[1].says,
};
const DAMPING_ABOVE_1: PhysicsBoundBasis = {
  kind: 'behavioural',
  when: (v) => v > 1,
  witness: { value: 2 },
  does: 'above 1 every velocity grows on every step and the offset diverges',
};
const DAMPING_BELOW_0: PhysicsBoundBasis = {
  kind: 'arithmetic',
  when: (v) => v < 0,
  // 45 rather than 60: at 60 the exponent is exactly 1 and a negative base is
  // finite, which is the whole of #748.
  witness: { value: -0.5, fps: 45 },
  expression: 'at any fps where `60 / fps` is not whole it is a negative number raised to a fractional power, which is NaN',
  lines: 'PhysicsConstraint.js:148,210',
};

/**
 * Every physics property with a bound, and **only** those — each bound either
 * where the runtime's arithmetic fails or where the value runs and runs wrongly,
 * and each row's `basis` says which.
 *
 * 🚫 `inertia`, `wind` and `gravity` are absent on purpose. The runtime
 * documents no range for any of them and the integrator diverges on none:
 * `inertia` scales how much bone movement is converted (`PhysicsConstraint.js:137,143`)
 * so 0 is an inert frame and nothing worse, and `wind`/`gravity` are forces along
 * the skeleton's own vectors (`:151-153, :214-215`) where a negative number is the
 * other direction — the corpus keys `wind` at −27.4 through −12.6 on all 48 of its
 * wind keys. Inventing a bound for them would refuse correct data, which is the
 * failure this repository has already paid for twice (issues #44, #262).
 *
 * 🚫 There is no UPPER bound on `mix` either, for the same reason and a stronger
 * one: `PhysicsConstraintPose` documents it as "a percentage (0+)", and on `x`
 * and `y` a keyed mix of 1.5 changes nothing inside the integration at all — it
 * multiplies the finished offset onto the bone (`:172,174,251,253`), so it is an
 * over-mix and an over-mix is a real idiom (the same argument
 * `CONSTRAINT_TIMELINES` makes for a transform mix).
 *
 * ⚠️ On `rotate` and `shearX` that is not the whole of it, and the sentence this
 * replaced said it was (issue #798): `mr = (rotate + shearX) * mix` (`:188`) is
 * read INSIDE the rotation solve (`:190,192,230`), so there mix changes what is
 * integrated as well as how much of it is applied. [measured] on the generated
 * physics fixture with `rotate: 1` added, 120 steps from `Physics.reset` at
 * 60 fps: a setup mix of −0.5 leaves `xOffset` equal to the mix-1 run's while
 * `rotateOffset` peaks at 1.4151 against the mix-1 run's 1.7994. Finite either
 * way, which is all the `mix` row's basis claims.
 *
 * 🔎 Each row's `basis` says, per way out, whether the runtime's arithmetic
 * fails there or the value runs and rigc refuses what it does (issue #798). Of
 * the eight ways out, two are arithmetic — `mass` at 0 and `damping` below 0 —
 * and six are rigc's call.
 */
export const PHYSICS_POSE_RULES: PhysicsPoseRule[] = [
  {
    timeline: 'mix',
    field: 'mix',
    toPose: (v) => v,
    poseOk: (v) => v > 0,
    keyOk: (v) => v >= 0,
    inertAtSetup: true,
    outside: null,
    // 🔑 Both ways out are BEHAVIOURAL (issue #798), and the negative one is the
    // question #798 asked: a transform constraint resting at a negative mix is
    // accepted (`T105`) and a physics one is refused. [measured] the arithmetic
    // is the same on both sides, a signed scale of what the constraint applies
    // and finite on every step: on the generated physics fixture a setup mix of
    // −0.5 moves the bone by exactly −1× what +0.5 moves it by, step for step,
    // and a transform constraint at `mixRotate` −0.5 rotates its bone by exactly
    // −1× what +0.5 does. So neither the refusal nor the acceptance is the
    // runtime's arithmetic. What differs is the runtime's own DOCUMENTED range,
    // and each rule follows its own: `PhysicsConstraintPose.mix` is "a
    // percentage (0+)" and `TransformConstraintPose.mixRotate` is "a percentage
    // (unbounded)". Neither is wrong; both are rigc's call, made on the
    // runtime's text rather than on its arithmetic, and `T114` holds the
    // mirror, the finiteness and both documented ranges against the runtime.
    basis: [MIX_BELOW_0, MIX_AT_0],
    states: '> 0',
    statesKeyed: '>= 0',
    // A key is refused below 0 only, so the key's sentence is that arm's.
    why:
      `${physicsBasisSays(MIX_BELOW_0)}. 0 is a key the runtime has a branch for: \`update\` returns immediately ` +
      '(`PhysicsConstraint.js:109-111`), which mutes the constraint for the span',
  },
  {
    timeline: 'mass',
    field: 'massInverse',
    toPose: (v) => 1 / v,
    poseOk: (v) => Number.isFinite(v) && v > 0,
    keyOk: null,
    inertAtSetup: false,
    outside: null,
    // The one row with a way out of each kind: 0 is the runtime's arithmetic
    // and below 0 is rigc's call, so the key's sentence says both, in that order.
    basis: [MASS_AT_0, MASS_BELOW_0],
    states: '> 0',
    statesKeyed: '> 0',
    why: `${physicsBasisSays(MASS_AT_0)}; ${physicsBasisSays(MASS_BELOW_0)}`,
  },
  {
    timeline: 'strength',
    field: 'strength',
    toPose: (v) => v,
    poseOk: (v) => v > 0,
    keyOk: (v) => v >= 0,
    inertAtSetup: false,
    outside: STRENGTH_OUTSIDE,
    basis: [STRENGTH_BELOW_0, STRENGTH_AT_0],
    states: '> 0',
    statesKeyed: '>= 0',
    // The key's sentence names the arm a key can still take — below 0 — off the
    // same object the setup sentence reads, so the two say one thing about it.
    why:
      `${physicsBasisSays(STRENGTH_BELOW_0)}. It is the restoring force, \`velocity += (a - offset * strength) * m\` ` +
      '(`PhysicsConstraint.js:150,156,212,220`), and a multiplicand everywhere it is read. 0 is a key the runtime plays: ' +
      'it releases the constraint for the span, damping and inertia still apply, and the next key pulls the offset back',
  },
  {
    timeline: 'damping',
    field: 'damping',
    toPose: (v) => v,
    poseOk: (v) => v >= 0 && v <= 1,
    keyOk: null,
    inertAtSetup: false,
    outside: null,
    // Below 0 is arithmetic at every rate where the exponent is fractional;
    // above 1 is a run-away, finite until the velocity overflows (step 1,065
    // for a setup of 2 at 60 fps), so it is behavioural by the line
    // `PhysicsBoundBasis` draws — the card that asked for the bases (#798)
    // counted it arithmetic, and the walk says otherwise.
    basis: [DAMPING_ABOVE_1, DAMPING_BELOW_0],
    states: 'inside [0, 1]',
    statesKeyed: 'inside [0, 1]',
    // 🔑 The interval is CLOSED (issue #794). `1 ** x` is 1 and `0 ** x` is 0
    // for every positive exponent, so both ends are finite at every `fps` and
    // both are rigs somebody can mean: 1 holds the jiggle, 0 follows the bone
    // with no overshoot. [measured] through spine-core on the generated physics
    // fixture, 120 steps from `Physics.reset` at 60, 45 and 30 fps under a
    // displacing animation, as a setup value and as a key: every pose value
    // finite, the velocity never 0 at 1 and 0 after every step at 0. And 1 is
    // not only a choice: it is 4.2's own parser default for an omitted
    // `damping` (`SkeletonJson.js:242` in 4.2.120,
    // `getValue(constraintMap, "damping", 1)`; 4.3.13 reads 0.85 at `:308`), so a
    // rig migrated from 4.2 that keys "the default" writes 1 and the editor
    // exports it as it is. The open interval this replaced refused that rig.
    //
    // ⚠️ The frame-rate half is why the bound cannot be checked by playing a rig
    // at 60 fps (issue #748): `step` is `1 / fps`, the constraint's own rate, so
    // the exponent is exactly 1 there and a negative damping only flips the
    // velocity's sign. [measured] on the generated physics fixture, a keyed −0.5
    // stays finite at 60 fps and at 30 (exponent 2), and is NaN within three
    // steps of the key at 45 and at 120 (exponents 1.3333 and 0.5).
    why:
      'the per-step decay is `damping ** (60 * step)`, with `step` = 1 / the constraint\'s `fps`, and every velocity ' +
      `is multiplied by it (\`PhysicsConstraint.js:114,148,158,163,210,222,227\`), so ${DAMPING_ABOVE_1.does}, at ` +
      "every rate — finite on every step until the velocity overflows, so refusing it is rigc's call rather than the " +
      "runtime's. Below 0 the result depends on `fps`: where `60 / fps` is a " +
      'whole number a negative base stays finite — at 60 fps it is the velocity\'s sign flipped each step, which can ' +
      `look like a jiggle settling — and ${DAMPING_BELOW_0.expression} (\`(-0.5) ** (60 / 45)\`), so a rig tried only at 60 fps never shows the failure. The two ends are ` +
      'values the runtime plays at every rate: at 1 the velocity never decays, so the jiggle holds for as long as it ' +
      'runs, and at 0 every velocity is zeroed on every step, so the offset follows the bone with no overshoot',
  },
];

/**
 * What `A23`'s setup arm says about a pose value its rule refuses: the arm of
 * `outside` that holds for it, or the bound itself where the row has no arms or
 * none holds (a non-number the parser handed over, say).
 */
export function physicsOutsideSays(rule: PhysicsPoseRule, poseValue: number): string {
  return rule.outside?.find((arm) => arm.when(poseValue))?.says ?? `must be ${rule.states}`;
}

/** The rule for one timeline name, or `undefined` where the runtime bounds nothing. */
export function physicsRuleFor(timeline: string): PhysicsPoseRule | undefined {
  return PHYSICS_POSE_RULES.find((rule) => rule.timeline === timeline);
}

/**
 * Whether the number a KEY states is one the runtime can use, judged on the pose
 * field it becomes rather than on itself.
 *
 * `null` when it is. The string is the tail of a message and names the bound and
 * the reason, never just "invalid".
 */
export function physicsKeyRefusal(rule: PhysicsPoseRule, value: number, posedBy?: number): string | null {
  // ⚠️ `posedBy` exists so the VALIDATOR can hand over the number the runtime's
  // own `PhysicsConstraint*Timeline.set` wrote, rather than rigc's reading of
  // what that call does. The compiler cannot: it links no runtime, by the rule in
  // CLAUDE.md, so it passes nothing and `toPose` answers. Those are two paths to
  // one number and a selftest control measures that they agree — without it this
  // parameter would be exactly the silent second opinion this table exists to
  // remove.
  const posed = posedBy ?? rule.toPose(value);
  const ok = rule.keyOk ?? rule.poseOk;
  if (ok(posed)) return null;
  // The pose field only when it is a different number from the keyed one, which
  // is derived rather than declared: it is exactly `mass`, and only where the
  // reciprocal has moved.
  const shown = posed === value ? '' : ` (${rule.field} ${posed})`;
  return `${value}${shown}; must be ${rule.statesKeyed} — ${rule.why}`;
}

/** One of the three colours a slot poses: the light colour's rgb, its alpha, and the dark colour. */
export type SlotColorChannel = 'rgb' | 'alpha' | 'dark';

/**
 * Which of a slot's colour channels each of the format's five colour timelines
 * poses — the `propertyIds` each class registers in `Animation.js`
 * (`Property.rgb`, `Property.alpha`, `Property.rgb2`), under the names an author
 * reads them by.
 *
 * ⭐ **It is the whole of what makes `rgb` + `alpha` a different thing from
 * `rgba`**, and the reason it is a table rather than a fact every reader knows:
 * `RGBTimeline.apply1` writes `color.r/g/b` and never touches `color.a`,
 * `AlphaTimeline.apply` writes `color.a` alone, and `RGB2Timeline` writes the
 * light rgb and the dark colour and leaves the light alpha where it was. A
 * timeline that poses a channel poses it at EVERY time — before its first key
 * it writes the setup value (`MixFrom.setup`) — so two timelines of one slot
 * that share a channel are not two layers of one colour: the one applied later,
 * which is the one the file states later, overwrites the other everywhere, and
 * the earlier one's keys on that channel are read by nothing.
 *
 * It lives here, beside the catalogue, for `PHYSICS_POSE_RULES`' reason:
 * `compile.ts` refuses two tracks that share a channel, `A45` names the same
 * pair on a file rigc did not write, and the two have to be one criterion. The
 * compiler links no runtime, so it cannot ask a timeline for its ids; a selftest
 * control asks the linked runtime instead and holds this table to what it says.
 */
export const SLOT_COLOR_CHANNELS: Record<string, readonly SlotColorChannel[]> = {
  rgba: ['rgb', 'alpha'],
  rgb: ['rgb'],
  alpha: ['alpha'],
  rgba2: ['rgb', 'alpha', 'dark'],
  rgb2: ['rgb', 'dark'],
};

/**
 * The seven modes a `sequence` key may state, in the runtime's own enum order
 * (`SequenceMode` in `attachments/Sequence.js`: `hold` 0 … `pingpongReverse` 6).
 *
 * 🚨 **The parser does not refuse a mode it does not know.** `readAnimation`
 * reads `SequenceMode[getValue(keyMap, "mode", "hold")]`, which is `undefined`
 * for a spelling outside the seven (and for a NUMBER, because the enum's reverse
 * mapping turns `3` into the string `"pingpong"`), and `setFrame` then stores
 * `undefined | (index << 4)` — mode bits 0, which is `hold`. Measured: a key
 * spelled `"pingPong"` loads without a word and shows its `index` frame for
 * the whole key. So every reader of a mode refuses anything outside this list,
 * by this list.
 *
 * It lives here for `SLOT_COLOR_CHANNELS`' reason: the motion parser refuses an
 * unknown mode in a spec, `A46` names one in a file rigc did not write, `ingest`
 * carries one, and the four have to be one list. The compiler links no runtime,
 * so a selftest control asks the linked one for its enum and holds this to it.
 */
export const SEQUENCE_MODES = ['hold', 'once', 'loop', 'pingpong', 'onceReverse', 'loopReverse', 'pingpongReverse'] as const;

/** One of `SEQUENCE_MODES`. */
export type SequenceModeName = (typeof SEQUENCE_MODES)[number];
