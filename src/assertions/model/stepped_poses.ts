/**
 * The model side's supply of `SteppedPoseFacts` (issue #1025, cut 4c-5a of
 * step 4c of #380): every pose A10 reads, posed by rigc's core.
 *
 * - **The roster**: the document's bones, and its animations in the file's
 *   order (`fileAnimationOrder`, `src/compile.ts`), each with
 *   `CoreAnimationTimelines.duration` — the last key of every timeline as
 *   float32, the value `tools/pose_oracle.ts compare` holds equal to
 *   spine-core's on its `animations` roster.
 * - **The setup pose and each animation's walk**: the core's looping walk
 *   (`src/core/walk.ts` — `poseWalkSetup`, `poseLoopingWalk`), which reads
 *   A10's recipe as measured and returns a value that is not finite in place
 *   rather than refusing it. It is held equal to spine-core's walk at
 *   tolerance 0 by `tools/core_gate.ts`'s walk block and the selftest's
 *   `CO25`, and the poses A10 asks for here are compared with spine-core's on
 *   every call with a model in hand (`VF13`). Since issue #1179's second part
 *   the poses come through that walk's scan assembler (`scanWalkSetup`,
 *   `scanLoopingWalk`): the same walk, each pose carrying what A10 reads — the
 *   bones' matrix and origin, the slot rows, the drawn attachments' slot, name
 *   and vertices — and none of the bones' getter readings and oracle rows or
 *   the drawn rows' UVs, triangles and colour, which nothing it reads is
 *   computed from. The core suite's `CO43` holds the scan to the public walk's
 *   numbers bit for bit, `CO44` what it leaves out to move none of them, and
 *   `CO45` that the vertex arrays it hands on uncopied are each pose's own.
 * - **A bone's mode**: the mode the core's bone timelines pose at the time
 *   (`posedBones`, a fresh non-looping track: the time held at the duration),
 *   folded as the runtime's lookup folds it (`foldInheritMode`). `readModel`
 *   refuses a setup `inheritMode` and an `inherit` key that fold to no mode by
 *   name, so on this side every bone of every pose holds one and the answer is
 *   `null` — derived from the pose rather than assumed, so a reader that
 *   started admitting such a spelling would show up here as a bone with none.
 * - **Under no skin set**, as `validate()` poses (`noSkinView`, the view
 *   measured in issue #1051: no skin's bones or constraints applied, a slot
 *   looked up in the default skin alone).
 *
 * Links nothing from the runtime.
 */
import { fileAnimationOrder } from '../../compile.ts';
import { foldInheritMode, type CompiledDocument } from '../../core/index.ts';
import { posedBones } from '../../core/animation.ts';
import { scanLoopingWalk, scanWalkSetup } from '../../core/walk.ts';
import type { ScanPose } from '../../core/raw.ts';
import { noSkinView } from '../../render_core.ts';
import type { ModelBone } from '../../model.ts';
import type { SteppedFrame, SteppedPoseFacts } from '../facts/stepped_poses.ts';
import type { ReadDocument } from './parse.ts';

/** A bone's posed mode as the facts spell it: `null` for a mode, else the value held. */
const modeOf = (bone: ModelBone): string | null => (foldInheritMode(bone.inheritMode ?? 'normal') === null ? String(bone.inheritMode) : null);

/** A channel the walk computed; a slot row holds `null` only where a rounding wrote one, which the walk does not. */
const channel = (v: number | null): number => (v === null ? Number.NaN : v);

/** Each bone's posed mode as the facts spell it (`modeOf`), by name. */
const modesOf = (posed: readonly ModelBone[]): ReadonlyMap<string, string | null> => new Map(posed.map((b) => [b.name, modeOf(b)]));

/** One scan pose as A10 reads it, each bone's mode taken from `modes` (`modesOf` the bones the timelines posed at the pose's time); the drawn attachments are the scan's own rows, already in the shape A10 reads. */
function frameOf(pose: ScanPose, modes: ReadonlyMap<string, string | null>): SteppedFrame {
  return {
    bones: pose.bones.map((b) => ({ name: b.name, a: b.a, b: b.b, c: b.c, d: b.d, worldX: b.worldX, worldY: b.worldY, inherit: modes.get(b.name) ?? null })),
    drawn: pose.drawn,
    slots: pose.slots.map((row) => ({
      name: row[0],
      colour: [channel(row[2]), channel(row[3]), channel(row[4]), channel(row[5])] as const,
      dark: row[6] === null ? null : ([channel(row[6][0]), channel(row[6][1]), channel(row[6][2])] as const),
    })),
  };
}

export function modelSteppedPoses(read: ReadDocument): SteppedPoseFacts {
  let view: CompiledDocument | null = null;
  const viewOf = (): CompiledDocument => (view ??= noSkinView(read.doc));
  const animationOf = (name: string) => {
    const anim = viewOf().animations.find((a) => a.name === name);
    if (anim === undefined) throw new Error(`internal: the model side was asked to pose animation "${name}", which the document does not hold`);
    return anim;
  };
  return {
    boneCount: read.doc.bones.length,
    steppedAnimations: fileAnimationOrder(read.doc).flatMap((name) => {
      const anim = read.doc.animations.find((a) => a.name === name);
      return anim === undefined ? [] : [{ name, duration: anim.timelines.duration }];
    }),
    hasAnimation: (name) => read.doc.animations.some((a) => a.name === name),
    hasBone: (name) => read.doc.bones.some((b) => b.name === name),
    posedInherit: (animation, bone, time) => {
      const anim = animationOf(animation);
      const t = time < anim.timelines.duration ? time : anim.timelines.duration;
      const posed = posedBones(viewOf(), anim.timelines, t).find((b) => b.name === bone);
      return posed === undefined ? undefined : modeOf(posed);
    },
    // The document's stated mode — asked only of a bone posing none, which the reader leaves this side no document to hold.
    statedInherit: (name) => `${JSON.stringify(read.doc.bones.find((b) => b.name === name)?.inheritMode)}`,
    setup: () => frameOf(scanWalkSetup(viewOf()), modesOf(viewOf().bones)),
    walk: (animation, step, frames) => {
      const anim = animationOf(animation);
      const poses = scanLoopingWalk(viewOf(), animation, new Array<number>(frames).fill(step));
      // A bone's posed mode moves only by an `inherit` timeline: every other one `posedBones` reads leaves the setup's mode on its copy. So an animation
      // keying none poses the setup's modes at every time, and they are read once rather than posed again at each of its frames (issue #1179).
      const keysInherit = anim.timelines.bones.some((target) => target.timelines.some((tl) => tl.kind === 'inherit'));
      const setupModes = keysInherit ? null : modesOf(viewOf().bones);
      return poses.slice(1).map((pose) => frameOf(pose, setupModes ?? modesOf(posedBones(viewOf(), anim.timelines, pose.animationTime))));
    },
  };
}
