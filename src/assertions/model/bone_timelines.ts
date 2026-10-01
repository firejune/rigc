/**
 * The model side's supply of `BoneTimelineFacts` (issue #1025, cut 4c-4 of
 * #380): every animation's bone timelines as the Spine file states them.
 *
 * The same reading A45's slot timelines are given (`fileSlotTimelines` in
 * `./slot_colour.ts`), over the `bones` group: the animations put in the
 * file's order by `editorAnimationOrder` (`src/compile.ts`, the function the
 * emitter is handed), each animation's bones and their timelines laid out as
 * the file lays them (`animations.<name>.bones.<bone>.<timeline> = keys`, in
 * the document's order, which is the order `emitAnimation` writes the model's
 * map in), and the whole handed to the emitter's own `withoutParserDefaults`
 * and `inEditorKeyOrder` (`src/keyorder.ts`) — so a key field the emitter
 * leaves out at the parser's default (`time: 0`, a translate key's `y: 0`) is
 * left out here too, and a body printing a key's `time` prints what it prints
 * over the file. Nothing here restates either rule.
 *
 * Links nothing from the runtime.
 */
import { editorAnimationOrder } from '../../compile.ts';
import { inEditorKeyOrder, withoutParserDefaults } from '../../keyorder.ts';
import type { BoneTimelineFacts, BoneTimelines } from '../facts/bone_timelines.ts';
import { isObj, type Json } from '../values.ts';
import type { ReadDocument } from './parse.ts';

const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObj) : []);

/** Every animation's bone timelines as the Spine file states them: `animations.<name>.bones.<bone>.<timeline> = keys`. */
export function fileBoneTimelines(read: ReadDocument): BoneTimelines[] {
  const byName = new Map<string, Json>();
  for (const anim of list(read.json.animations)) if (typeof anim.name === 'string') byName.set(anim.name, anim);
  const animations: Json = {};
  for (const name of editorAnimationOrder([...byName.keys()])) {
    const bones: Json = {};
    for (const bone of list((byName.get(name) as Json).bones)) {
      if (typeof bone.name !== 'string') continue;
      const timelines: Json = {};
      for (const timeline of list(bone.timelines)) {
        if (typeof timeline.name === 'string') timelines[timeline.name] = list(timeline.keys).map((key) => ({ ...key }));
      }
      bones[bone.name] = timelines;
    }
    // An animation keying no bone writes no `bones` group — `emitAnimation`'s `if (animation.bones.size)`.
    animations[name] = Object.keys(bones).length > 0 ? { bones } : {};
  }
  const file = inEditorKeyOrder(withoutParserDefaults({ animations }));
  const out: BoneTimelines[] = [];
  for (const [animation, anim] of Object.entries(file.animations)) {
    if (!isObj(anim) || !isObj(anim.bones)) continue;
    for (const [bone, timelines] of Object.entries(anim.bones)) out.push({ animation, bone, timelines });
  }
  return out;
}

export function modelBoneTimelines(read: ReadDocument): BoneTimelineFacts {
  return { boneTimelines: fileBoneTimelines(read) };
}
