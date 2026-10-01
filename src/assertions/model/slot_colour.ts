/**
 * The model side's supply of `SlotColourFacts` (issue #1025, step 4c of #380).
 *
 * - **The slot timelines, in the file's order and spelling.** The document
 *   holds each animation's slot timelines in the order they are applied, with
 *   every key as the compiler built it; the Spine file keys the animations in
 *   the editor's order and passes every key through two passes. So the
 *   animations are put in order by `editorAnimationOrder` (`src/compile.ts`,
 *   the function the emitter is handed), and the timelines are laid out as the
 *   file lays them and handed to the emitter's own `withoutParserDefaults` and
 *   `inEditorKeyOrder` (`src/keyorder.ts`) — so a key field the emitter would
 *   leave out at the parser's default is left out here too, and a body
 *   printing `JSON.stringify(key.value)` prints what it prints over the file.
 *   Nothing here restates either rule.
 * - **Whether an animation exists**: the document's own roster.
 * - **A slot's posed colour**: the core's raw entry (`poseRawAnimation`,
 *   `src/core/raw.ts`) taking one step of the time on a fresh non-looping
 *   track, under the view the core poses with no skin set (`noSkinView`,
 *   `src/render_core.ts`) — the reading of what `validate()` does through
 *   spine-core (a fresh skeleton, no skin, setup pose, the track stepped to the
 *   time and applied). Its slot rows are the ones `CR03` holds bit for bit to
 *   spine-core on every frame of the nineteen recipes; that the two readings
 *   print the same A45 line is the selftest's supplier check, on every call
 *   that poses one (`VF02`). A channel the pose read as no number is NaN, as a
 *   non-finite channel reads on the runtime's side.
 *
 * Links nothing from the runtime.
 */
import { editorAnimationOrder } from '../../compile.ts';
import type { CompiledDocument } from '../../core/index.ts';
import { poseRawAnimation } from '../../core/raw.ts';
import { inEditorKeyOrder, withoutParserDefaults } from '../../keyorder.ts';
import { noSkinView } from '../../render_core.ts';
import type { SlotColourFacts, SlotTimelines } from '../facts/slot_colour.ts';
import { isObj, type Json } from '../values.ts';
import type { ReadDocument } from './parse.ts';

const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObj) : []);

/** Every animation's slot timelines as the Spine file states them: `animations.<name>.slots.<slot>.<timeline> = keys`. */
export function fileSlotTimelines(read: ReadDocument): SlotTimelines[] {
  const byName = new Map<string, Json>();
  for (const anim of list(read.json.animations)) if (typeof anim.name === 'string') byName.set(anim.name, anim);
  const animations: Json = {};
  for (const name of editorAnimationOrder([...byName.keys()])) {
    const slots: Json = {};
    for (const slot of list((byName.get(name) as Json).slots)) {
      if (typeof slot.name !== 'string') continue;
      const timelines: Json = {};
      for (const timeline of list(slot.timelines)) {
        if (typeof timeline.name === 'string') timelines[timeline.name] = list(timeline.keys).map((key) => ({ ...key }));
      }
      slots[slot.name] = timelines;
    }
    // An animation keying no slot writes no `slots` group — `emitAnimation`'s `if (animation.slots.size)`.
    animations[name] = Object.keys(slots).length > 0 ? { slots } : {};
  }
  const file = inEditorKeyOrder(withoutParserDefaults({ animations }));
  const out: SlotTimelines[] = [];
  for (const [animation, anim] of Object.entries(file.animations)) {
    if (!isObj(anim) || !isObj(anim.slots)) continue;
    for (const [slot, timelines] of Object.entries(anim.slots)) if (isObj(timelines)) out.push({ animation, slot, timelines });
  }
  return out;
}

export function modelSlotColour(read: ReadDocument): SlotColourFacts {
  let view: CompiledDocument | null = null;
  return {
    slotTimelines: fileSlotTimelines(read),
    hasAnimation: (name) => read.doc.animations.some((a) => a.name === name),
    posedSlot: (animation, slot, time) => {
      view ??= noSkinView(read.doc);
      const row = poseRawAnimation(view, animation, [time], {}, 'animation')[1].slots.find((r) => r[0] === slot);
      if (row === undefined) return undefined;
      const channel = (v: number | null): number => (v === null ? Number.NaN : v);
      return { color: { r: channel(row[2]), g: channel(row[3]), b: channel(row[4]), a: channel(row[5]) } };
    },
  };
}
