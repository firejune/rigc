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
 * of the grid every key time is rounded onto.
 *
 * The compiler quantises key times onto that grid with `keyTime`, which rounds
 * DOWN (issue #99), so 1e-6 s is the finest distinction a key can make and a
 * *correct* key now misses its target only on the early side: a key the author put
 * exactly ON a duration of 68/12 s emits as 5.666666 rather than past it. What
 * still needs the tolerance is the other side of the same rule — `validate` re-runs
 * it on an emitted file read back through a **Float32Array**, whose steps are
 * coarser than this one and round both ways, and on artifacts no rigc compile ever
 * touched. Anything a whole step past a declared duration was authored there, not
 * rounded onto it.
 *
 * ⚠️ `FRAME` (1/60 s) is the wrong tolerance for this, which is why the constant
 * is separate rather than reused: 1/60 s answers "is the DECLARED DURATION
 * wrong?", it is 16,667 times wider than this, and it hid the defect that put
 * this here. Rung 6 rounded key times to 4 dp in its authoring tooling, so a
 * one-frame attachment reveal landed 3.4e-5 s past a 68/12 s duration — 34 steps
 * past this line but 1/500 of FRAME, with another track already sitting on the
 * declared duration, so the compiler's Rule 4 and the validator's A09 both
 * compared the animation's max key time and agreed. The reveal never fired
 * (issue #54).
 *
 * It lives here, beside the timeline catalogue, for the reason the catalogue
 * does: `compile.ts` refuses on it and `validate.ts` re-checks the emitted file
 * against it, and a second copy of the number is a second copy that drifts.
 */
export const KEY_TIME_EPSILON = 1e-6;

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
  /** The bound in words, for a message: what the value has to be. */
  states: string;
  /** The bound a KEY is held to, where `keyOk` widens it. */
  statesKeyed: string;
  /**
   * What the runtime does outside the bound, with the lines that say so.
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
 * Every physics property with a bound the runtime supports, and **only** those.
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
 * one: `PhysicsConstraintPose` documents it as "a percentage (0+)", and a keyed
 * mix of 1.5 changes nothing inside the integration at all — it multiplies the
 * finished offset onto the bone (`:172,174,251,256,287`), so it is an over-mix and
 * an over-mix is a real idiom (the same argument `CONSTRAINT_TIMELINES` makes for
 * a transform mix).
 */
export const PHYSICS_POSE_RULES: PhysicsPoseRule[] = [
  {
    timeline: 'mix',
    field: 'mix',
    toPose: (v) => v,
    poseOk: (v) => v > 0,
    keyOk: (v) => v >= 0,
    states: '> 0',
    statesKeyed: '>= 0',
    why: 'the runtime documents it as a percentage (0+) and `update` returns immediately at 0 (`PhysicsConstraint.js:109-111`)',
  },
  {
    timeline: 'mass',
    field: 'massInverse',
    toPose: (v) => 1 / v,
    poseOk: (v) => Number.isFinite(v) && v > 0,
    keyOk: null,
    states: '> 0',
    statesKeyed: '> 0',
    why:
      'the pose holds 1/mass, so 0 is an infinite massInverse and `m = t * massInverse` ' +
      '(`PhysicsConstraint.js:149,211`) takes every velocity to NaN, while a negative mass ' +
      'injects energy instead of resisting it',
  },
  {
    timeline: 'strength',
    field: 'strength',
    toPose: (v) => v,
    poseOk: (v) => v > 0,
    keyOk: (v) => v >= 0,
    states: '> 0',
    statesKeyed: '>= 0',
    why:
      'it is the restoring force — `velocity += (a - offset * strength) * m` ' +
      '(`PhysicsConstraint.js:150,156,212,220`) — so below 0 the term is ADDED to the offset instead of ' +
      'taken out of it and every step amplifies the last. 0 is a key the runtime plays: it releases the ' +
      'constraint for the span, damping and inertia still apply, and the next key pulls the offset back',
  },
  {
    timeline: 'damping',
    field: 'damping',
    toPose: (v) => v,
    poseOk: (v) => v > 0 && v < 1,
    keyOk: null,
    states: 'inside (0, 1)',
    statesKeyed: 'inside (0, 1)',
    why:
      'the per-step decay is `damping ** (60 * step)` and every velocity is multiplied by it ' +
      '(`PhysicsConstraint.js:148,158,163,210,222,227`), so 1 never decays, above 1 diverges, and ' +
      'at or below 0 the velocity is killed outright or raised to a fractional power',
  },
];

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
