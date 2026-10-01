/**
 * The core's looping walk (issue #1025, cut 4c-5a of step 4c of #380): one
 * animation on a LOOPING track, reset at the setup pose and then stepped at
 * the caller's steps, every pose returned as the doubles the core computed —
 * a value that is not finite included, in place, rather than refused.
 *
 * This is the walk `A10_NO_NAN_AFTER_STEPPING` takes, and the reason it is
 * its own entry rather than the raw entry (`./raw.ts`) under another name is
 * the two things the raw entry's contract excludes on purpose: its track
 * holds at the duration, and it refuses a non-finite value by name
 * (`CoreInputError`), because a renderer handed one would draw a different
 * picture in silence. A10's subject is exactly that value, so here it is the
 * answer, not a refusal. Everything else is the raw entry's walk, called
 * rather than restated (`walkIn` in `./raw.ts`, which branches on the two).
 *
 * ## The walk, measured
 *
 * Written from spine-core 4.3.13 running A10's own recipe — `Skeleton`,
 * `AnimationState` with `setAnimation(0, name, true)`; `setupPose()`,
 * `update(0)`, `updateWorldTransform(Physics.reset)`; then per step
 * `AnimationState.update(dt)`, `apply`, `Skeleton.update(dt)`,
 * `updateWorldTransform(Physics.update)` — and read off `TrackEntry.trackTime`,
 * `TrackEntry.getAnimationTime()`, every bone's `appliedPose`, every shown
 * region's and mesh's world vertices, every slot's colours and the calls the
 * runtime makes to `PhysicsConstraint.reset`. The PR of issue #1025's cut
 * 4c-5a carries the tables; each rule names the count that held it.
 *
 * - **Pose 0 is the setup pose, reset** — the animation is set and not yet
 *   applied, so the reset is taken at the setup pose (`RawReset` `setup`).
 * - **The track time is the running sum of the steps**, as on the raw
 *   entry's walk: `TrackEntry.trackTime` equalled it on every step of the
 *   nineteen tree rows' walks (6,480 of 6,480).
 * - **The time** — the animation is applied at the track time wrapped by the
 *   duration (`loopedTime` in `./raw.ts`): `trackTime % duration` in double,
 *   so a track time of exactly the duration is 0, the first pose again, and
 *   over a duration of 0 the time is 0 whatever the track time (an animation
 *   keying nothing, or keying only at 0) — `getAnimationTime()` read so on
 *   6,480 of 6,480 steps, 1,087 of them at or past the duration and 4 exactly
 *   on it; before the zero-duration reading it read 6,000.
 * - **The physics clock moves by the step itself** (`Skeleton.update(dt)`),
 *   whatever the wrap does to the animation time: moved by the animation
 *   time's own change instead, 32 of 82 seeded and forged walks read off.
 * - **A `reset` key across the wrap.** A key is crossed when it lies in
 *   `(previous animation time, animation time]`, as on the raw entry; on a
 *   step whose animation time went DOWN — the wrap — it is crossed when it
 *   lies after the previous time or at or before the new one, `(last, ∞)`
 *   and `(−1, t]` (`resetCrossed` in `./constraints_physics.ts`). A step
 *   that passes the duration once or more while its animation time still
 *   rises is not a wrap there: a key at 0.25 s of a 0.3 s animation stepped
 *   by 0.7 s fired on neither of the two steps that carried the track past
 *   it, and an equal time is not a wrap either (a 0.25 s animation stepped by
 *   0.25 s fired its key at 0 once). With the wrap firing nothing, 957 of
 *   14,460 poses of a seeded population read off.
 * - **A value that is not finite** is the IEEE result of the same
 *   arithmetic, kept: a world matrix term, a world position, a vertex, a slot
 *   colour channel. Where the raw entry writes such a value `null` and
 *   refuses, this entry writes the double; on 4,333 poses holding one, every
 *   NaN and Infinity stood where spine-core's did.
 *
 * Events are not carried: A10 reads none, and what a looping track fires
 * across the wrap was not measured.
 *
 * ⛔ **What is still refused** is the raw entry's other refusal: a construct
 * the core would leave out (a block the oracle's core dump names absent) is a
 * `CoreInputError` naming why, as there — a pose with a block missing is not
 * a pose whose values can be judged finite.
 *
 * ⛔ **And one construct this walk refuses that the raw entry does not**
 * (`sliderPhysicsWhy`): a slider whose animation keys a physics timeline.
 * Issue #1049. Of the selftest's builds of that class (a dial, or two
 * sliders, keying a physics constraint's `wind` or `gravity`), five walked off spine-core from the third
 * step on — `tip` at worldX 14.87 against 12.09 on the first, at 0.025 s —
 * while others of the same class walked exact. The raw entry's own non-looping walk reads the same
 * gap (and with the slider made non-additive, 14.78 against 12.09), so it is
 * the stepped walk's reading of a slider's physics keys, not the loop's.
 * Which of the class it reaches is not measured, so the walk refuses the
 * class by name rather than return a pose it cannot vouch for. On the same
 * five inputs, `./additive.ts` and spine-core's probe agree that each slider's
 * `wind` or `gravity` timeline accumulates when applied twice with `add` — so
 * the gap is downstream of that rule, in the stepped bones, not in it.
 */
import { setupPoseIn, walkIn, type RawBone, type RawDrawn, type WalkMode } from './raw.ts';
import { activeBones, CoreInputError, constraintRecords, type CompiledDocument, type CorePlant, type CoreSlotRow } from './index.ts';
import { historyTaint } from './constraints.ts';
import type { TimelinePlant } from './animation.ts';

/** One pose of the looping walk: the raw entry's pose less what this walk does not carry (events, the clip rows, the shown records). */
export interface WalkPose {
  /** The running sum of the steps, 0 for pose 0. */
  trackTime: number;
  /** The time the animation was applied at: the track time wrapped by the duration (`loopedTime`). */
  animationTime: number;
  /** Every bone in document order, its world matrix and origin as computed, finite or not. */
  bones: RawBone[];
  /** Every slot row (`CoreSlotRow`) with its colour channels as computed, finite or not. */
  slots: CoreSlotRow[];
  /** The slot names in the posed draw order. */
  drawOrder: string[];
  /** Every region and mesh a slot shows, in draw order, its world vertices as computed, finite or not. */
  drawn: RawDrawn[];
}

/**
 * Why the looping walk refuses this document, or `null` (the header's last
 * ⛔, issue #1049): every slider whose animation keys a physics timeline,
 * named with it.
 */
export function sliderPhysicsWhy(doc: CompiledDocument): string | null {
  const keyed = constraintRecords(doc).flatMap((r) => {
    if (r.kind !== 'slider') return [];
    const anim = doc.animations.find((a) => a.name === r.animation);
    return anim !== undefined && anim.constraints.physics > 0 ? [`slider "${r.name}" applies animation "${r.animation}", which keys physics timelines`] : [];
  });
  return keyed.length === 0 ? null : `${keyed.join('; ')} — under the stepped walk spine-core's bones leave the core's from the third step, on the raw entry's walk as on this one, and that reading is not measured (issue #1049)`;
}

/**
 * The bones and slots whose numbers the walk does not vouch for, because the
 * runtime's own value there is HISTORY (issue #979): a bone the view leaves
 * unposed — inactive, or below an inactive bone — that a constraint writing
 * into an inactive bone reaches (`historyTaint` in `./constraints.ts`, the
 * walk the core's leak refusal reads), each with that writer; and every slot
 * on such a bone. spine-core never updates an inactive bone, so what a
 * constraint wrote into it on the step before is what the constraint reads
 * on the next one; the core poses every step from the setup pose. Measured on
 * a public probe (a transform constraint writing four skin-required bones no
 * skin activates): at mix 1 the two differ only in the sign of zero of the
 * matrix cells (`atan2` of a zero matrix is 0° or 180° by those signs), and at
 * a translate mix of 0.5 by value (worldX 30.000000348 in spine-core against
 * 20.000000232 in the core at step 1), on the bones and on an active child of
 * one. Where such a value reaches a posed bone the core already refuses the
 * document (`unposedLeakWhy`); here nothing posed reads it, so a walk
 * comparison counts these numbers apart by name and compares them with
 * nothing, as `tools/pose_oracle.ts unposed` does under the step.
 */
export function walkHistory(view: CompiledDocument): { bones: Map<string, string>; slots: Map<string, string> } {
  const active = activeBones(view);
  const unposed = new Set<string>();
  for (const b of view.bones) if (!active.has(b.name) || (b.parent !== undefined && unposed.has(b.parent))) unposed.add(b.name);
  const bones = new Map<string, string>();
  for (const [bone, w] of historyTaint(view).tainted) if (unposed.has(bone)) bones.set(bone, `${w.kind}/${w.name} on inactive ${w.inactive}`);
  return { bones, slots: new Map(view.slots.filter((s) => bones.has(s.bone)).map((s) => [s.name, s.bone])) };
}

/** Refuse, by name, a document the looping walk cannot vouch for (`sliderPhysicsWhy`). */
function refuseUnmeasured(doc: CompiledDocument): void {
  const why = sliderPhysicsWhy(doc);
  if (why !== null) throw new CoreInputError(`the looping walk leaves the bones out: ${why}`);
}

/** The looping walk's mode: the track loops, and a non-finite value stays in the pose. */
const LOOPING: WalkMode = { loop: true, keep: true };

/**
 * The looping walk's plants (the core suite's `CO26`), each the reading the
 * walk was measured against and rejected, in a copy: the time a step applies
 * at, what the physics clock moves by, and what a number is written as.
 * Nothing but a control passes one.
 */
export interface WalkPlant {
  time?: WalkMode['time'];
  clock?: WalkMode['clock'];
  wrapResets?: WalkMode['wrapResets'];
  /** Every number of a pose rewritten — a swallowed non-finite value is `(v) => (Number.isFinite(v) ? v : 0)`. */
  number?: (v: number) => number;
}

/** A raw pose narrowed to what the looping walk carries, every number through `number`. */
function narrow(p: { trackTime: number; animationTime: number; bones: RawBone[]; slots: CoreSlotRow[]; drawOrder: string[]; drawn: RawDrawn[] }, number?: (v: number) => number): WalkPose {
  if (number === undefined) return { trackTime: p.trackTime, animationTime: p.animationTime, bones: p.bones, slots: p.slots, drawOrder: p.drawOrder, drawn: p.drawn };
  const n = (v: number | null): number | null => (v === null ? null : number(v));
  return {
    trackTime: p.trackTime,
    animationTime: p.animationTime,
    bones: p.bones.map((b) => ({ ...b, a: number(b.a), b: number(b.b), c: number(b.c), d: number(b.d), worldX: number(b.worldX), worldY: number(b.worldY) })),
    slots: p.slots.map((r): CoreSlotRow => [r[0], r[1], n(r[2]), n(r[3]), n(r[4]), n(r[5]), r[6] === null ? null : [n(r[6][0]), n(r[6][1]), n(r[6][2])], r[7], r[8]]),
    drawOrder: p.drawOrder,
    drawn: p.drawn.map((d) => ({ ...d, vertices: d.vertices.map(number) })),
  };
}

/**
 * The setup pose, every physics state reset, every value kept whatever it is —
 * what A10 reads before any animation is set.
 */
export function poseWalkSetup(doc: CompiledDocument, plant: CorePlant = {}, walkPlant: WalkPlant = {}): WalkPose {
  refuseUnmeasured(doc);
  return narrow(setupPoseIn(doc, plant, LOOPING), walkPlant.number);
}

/**
 * One animation on a looping track (the header's *The walk*): pose 0 the setup
 * pose reset, then one pose per step of `steps` — `steps.length + 1` poses in
 * all. A step must be a finite time at or above 0 and the animation the
 * document's, as on the raw entry; a construct the core would leave out
 * refuses the call by name; a value that is not finite does not.
 */
export function poseLoopingWalk(doc: CompiledDocument, animation: string, steps: readonly number[], plant: TimelinePlant = {}, walkPlant: WalkPlant = {}): WalkPose[] {
  refuseUnmeasured(doc);
  const mode: WalkMode = { ...LOOPING, ...(walkPlant.time === undefined ? {} : { time: walkPlant.time }), ...(walkPlant.clock === undefined ? {} : { clock: walkPlant.clock }), ...(walkPlant.wrapResets === undefined ? {} : { wrapResets: walkPlant.wrapResets }) };
  return walkIn(doc, animation, steps, plant, 'setup', mode).map((p) => narrow(p, walkPlant.number));
}
