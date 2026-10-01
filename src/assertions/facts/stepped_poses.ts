/**
 * The stepped poses (issue #1025, cut 4c-5a of step 4c of #380) — the census's
 * F01, F18, R4 (the posed `inherit`) and R5 as A10 reads them: the skeleton's
 * setup pose with every physics state reset, every animation walked on a
 * LOOPING track from that pose in equal steps, and a bone's inheritance mode
 * posed at one time on a fresh, non-looping track.
 *
 * ⭐ **A pose is handed over whole, non-finite values in place.** A10's
 * subject is the first number of a pose that is not finite, so a supplier
 * that refused such a pose, or wrote it as something else, would answer a
 * different question. The runtime's supplier reads what spine-core posed; the
 * model side's is the core's looping walk (`src/core/walk.ts`), which returns
 * the value rather than refusing it.
 *
 * 🔸 **The inheritance mode is `null` where the pose holds a mode**, and the
 * value it holds, as `String` spells it, where it holds none — the one bone
 * reading that can be wrong with every number finite (#733): the runtime's
 * lookup leaves a spelling it does not resolve as no mode at all.
 *
 * The bone timelines A10 walks for its `inherit` keys are `BoneTimelineFacts`
 * (`./bone_timelines.ts`), the family A24, A29 and A30 read.
 *
 * Links nothing from the runtime: `validate()` supplies it from spine-core
 * (`spineSteppedPoses`), the model side from the document and the core
 * (`../model/stepped_poses.ts`).
 */
import type { PosedVertices, WorldTransform } from '../../nonfinite.ts';

/** One bone of a pose: its world transform as computed, and its inheritance mode — `null` for a mode, else the value held. */
export interface SteppedBone extends WorldTransform {
  readonly inherit: string | null;
}

/** One slot of a pose: its light colour and its dark colour (`null` for a slot holding none), as computed. */
export interface SteppedSlot {
  readonly name: string;
  readonly colour: readonly [number, number, number, number];
  readonly dark: readonly [number, number, number] | null;
}

/** One pose: every bone in skeleton order, every region and mesh shown in draw order, every slot in setup order. */
export interface SteppedFrame {
  readonly bones: readonly SteppedBone[];
  readonly drawn: readonly PosedVertices[];
  readonly slots: readonly SteppedSlot[];
}

/** What A10 reads. */
export interface SteppedPoseFacts {
  /** The skeleton's bone count. */
  readonly boneCount: number;
  /** The animations, in the file's order, each with the runtime's duration (the last key of every timeline, as float32). */
  readonly steppedAnimations: ReadonlyArray<{ readonly name: string; readonly duration: number }>;
  /** Whether the skeleton holds an animation of this name. */
  hasAnimation(name: string): boolean;
  /** Whether the skeleton holds a bone of this name. */
  hasBone(name: string): boolean;
  /**
   * The bone's inheritance mode with the animation applied at `time` on a
   * fresh, non-looping track from the setup pose, every physics state reset
   * before it — `null` where the pose holds a mode, else that value spelled by
   * `String`, and `undefined` for a bone the skeleton does not have.
   */
  posedInherit(animation: string, bone: string, time: number): string | null | undefined;
  /** How the file spells a bone's setup `inherit`: `JSON.stringify` of the stated value (`"undefined"` for none). */
  statedInherit(bone: string): string;
  /** The setup pose, every physics state reset, before any animation is set. */
  setup(): SteppedFrame;
  /**
   * The animation set on a LOOPING track over that setup pose, then `frames`
   * steps of `step` each — the poses after steps 1 to `frames`, in order.
   */
  walk(animation: string, step: number, frames: number): SteppedFrame[];
}
