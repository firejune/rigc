/**
 * The model side's supply of `SkeletonRosterFacts` (issue #1025, cut 4c-4 of
 * #380): the document's bones and slots, in the document's order.
 *
 * The emitter writes the file's `bones` and `slots` arrays in the model's
 * order and never re-sorts them (`emitBones`, `emitSlots` in
 * `src/emit_spine.ts`; a slot's order is the draw order a draw-order key's
 * offsets count in), and the document writes each list in that same order, so
 * the document's lists are the file's. A bone's parent is the name the
 * document states, `null` for a root; a slot declares a dark colour where the
 * document states one, which is where `emitSlots` writes the key.
 *
 * Links nothing from the runtime.
 */
import type { SkeletonRosterFacts } from '../facts/skeleton_roster.ts';
import type { ReadDocument } from './parse.ts';

export function modelSkeletonRoster(read: ReadDocument): SkeletonRosterFacts {
  return {
    bones: read.doc.bones.map((bone) => ({ name: bone.name, parent: bone.parent ?? null })),
    slots: read.doc.slots.map((slot) => ({ name: slot.name, dark: slot.dark !== undefined })),
  };
}
