/**
 * The model side's supply of `TwoColourFacts` (issue #1025, cut 4c-3 of step
 * 4c of #380).
 *
 * - **The stated dark colours**: the document's slots in their order — the
 *   emitted slot array's — each `dark` as the document holds it, which the
 *   emitter writes into the slot unchanged (`emitSlot`). `readModel` refuses
 *   a `dark` that is not six or eight hex digits, so a spelling the runtime
 *   would load as NaN or drop has no document to arrive in.
 * - **The loaded dark colour**: the core's reading of that hex (`readColour`,
 *   its first three channels) — the reading the setup pose's slot rows carry,
 *   which `tools/pose_oracle.ts compare` holds equal to spine-core's on its
 *   `setup.slots` block, on the grid and under `--raw`.
 * - **The slot timelines**: `fileSlotTimelines` (`./slot_colour.ts`), the walk
 *   A45 reads — the file's order and spelling, through the emitter's own
 *   passes.
 * - **A slot's posed colours**: the core's raw entry (`poseRawAnimation`,
 *   `src/core/raw.ts`) taking one step of the time on a fresh track, under the
 *   view the core poses with no skin set (`noSkinView`), as A45's posed colour
 *   is taken — the slot row's light channels and its dark colour, NaN where the
 *   row reads no number. No gate samples the times A43 asks for (a key's own
 *   time), so the selftest compares these values with spine-core's at every
 *   time the body asks, on every call with a model in hand (`VF12`).
 *
 * Links nothing from the runtime.
 */
import { readColour, type CompiledDocument } from '../../core/index.ts';
import { poseRawAnimation } from '../../core/raw.ts';
import { noSkinView } from '../../render_core.ts';
import type { DarkColour, TwoColourFacts } from '../facts/two_colour.ts';
import type { ReadDocument } from './parse.ts';
import { fileSlotTimelines } from './slot_colour.ts';

/** A channel the pose read as no number, as a non-finite channel reads on the runtime's side. */
const channel = (v: number | null): number => (v === null ? Number.NaN : v);

export function modelTwoColour(read: ReadDocument): TwoColourFacts {
  let view: CompiledDocument | null = null;
  const slotDarks = read.doc.slots.flatMap((slot) => (typeof slot.dark === 'string' ? [{ slot: slot.name, dark: slot.dark }] : []));
  return {
    slotDarks,
    loadedDark: (name): DarkColour | null => {
      const dark = read.doc.slots.find((s) => s.name === name)?.dark;
      if (dark === undefined) return null;
      const [r, g, b] = readColour(dark);
      return { r, g, b };
    },
    slotTimelines: fileSlotTimelines(read),
    hasAnimation: (name) => read.doc.animations.some((a) => a.name === name),
    posedTint: (animation, slot, time) => {
      view ??= noSkinView(read.doc);
      const row = poseRawAnimation(view, animation, [time], {}, 'animation')[1].slots.find((r) => r[0] === slot);
      if (row === undefined) return undefined;
      const dark = row[6];
      return {
        light: { r: channel(row[2]), g: channel(row[3]), b: channel(row[4]), a: channel(row[5]) },
        dark: dark === null ? null : { r: channel(dark[0]), g: channel(dark[1]), b: channel(dark[2]) },
      };
    },
  };
}
