/**
 * The model side's supply of `AnimatedBoneFacts` (issue #1025, step 4c of
 * #380): an animation's bone timelines as the document lists them.
 *
 * The document writes each animation's `bones` as a list in the model's map
 * order, and the emitter writes the Spine file's `bones` group from that same
 * map, entry for entry, leaving the group out when it is empty
 * (`emitAnimation`'s `if (animation.bones.size)`) — so the list's order is the
 * file's, an empty list is a file with no `bones` group, and an animation the
 * document does not hold is one the file does not key. The first animation of
 * a name answers, as the file's object would hold only one.
 *
 * Links nothing from the runtime.
 */
import type { AnimatedBoneFacts } from '../facts/animated_bones.ts';
import { isObj } from '../values.ts';
import type { ReadDocument } from './parse.ts';

export function modelAnimatedBones(read: ReadDocument): AnimatedBoneFacts {
  const animations = Array.isArray(read.json.animations) ? read.json.animations.filter(isObj) : [];
  return {
    bonesKeyedBy: (name) => {
      const animation = animations.find((a) => a.name === name);
      if (animation === undefined) return undefined;
      const bones = Array.isArray(animation.bones) ? animation.bones.filter(isObj) : [];
      if (bones.length === 0) return null;
      return bones.map((bone) => String(bone.name));
    },
  };
}
