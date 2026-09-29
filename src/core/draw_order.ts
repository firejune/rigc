/**
 * Construct 4 of the core, its remainder (issue #955, step 2f of issue #380):
 * the draw order — at the setup pose, and a draw-order timeline's at a
 * sample time and under a slider.
 *
 * Every rule below was measured by posing hand-written skeletons through
 * `tools/pose_oracle.ts dump` (spine-core 4.3.13) and reading the slot names
 * the dump lists (`drawOrder`); nothing here was written from the runtime's
 * source. The core suite's `CD` controls hold the same skeletons against the
 * core.
 *
 * - **The setup order is the slot order** (`ModelSlot`: the model's slot
 *   array is the draw order), on every probe and on 19 of 19 recipes.
 * - **A key's moves are a permutation of the SETUP order**, whatever the
 *   order before it: each moved slot lands at its setup index plus its
 *   offset, and the slots no key moves fill the remaining places in setup
 *   order. The moves are applied as a set — the model holds them in the order
 *   the spec states them, and the order they are listed in changes nothing.
 * - **Before the first key the setup order; a key with no moves restores
 *   it.** Measured on 3,600 samples of 120 random timelines (three to eight
 *   slots, one to four keys, one to three moves each, empty keys among them):
 *   0 misses.
 * - **Key times are float32**, as every key's (`./animation.ts`).
 * - **A slider applies its animation's draw-order key after the sample's, at
 *   any mix but 0, and writes nothing before its first key**: a slider at
 *   0.5 over a key at 0.3 moving the first of three slots two places read
 *   `s1, s2, s0` at setup at mix 1, 0.5, 0.01 and −1, and the setup order at
 *   mix 0 and at a time before the key.
 *
 * 🚫 **Two moves landing on one place are refused by `readModel`, by name.**
 * The writer refuses a slot moved twice and a destination outside the slots
 * (`compileDrawOrder` in `src/compile.ts`), not two slots sent to one
 * destination; the runtime's fill then leaves a slot out and lists another
 * twice (the compiler's note on the parser), which is a parser's accident
 * and not an order to reproduce.
 */
import type { ModelSlot } from '../model.ts';
import { keyIndexAt } from './animation.ts';

/** One draw-order key, as read: its time (float32) and its moves as slot indices, empty for the setup order. */
export interface CoreDrawOrderKey {
  time: number;
  moves: Array<{ slot: number; offset: number }>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * An animation record's `drawOrder` keys, read: times strictly increasing,
 * every move naming a slot of the document once per key, a whole offset
 * landing inside the slots, no two moves landing on one place.
 */
export function readDrawOrderKeys(value: unknown, label: string, slots: readonly ModelSlot[], problems: string[]): CoreDrawOrderKey[] {
  const where = `${label}.drawOrder`;
  if (!Array.isArray(value)) {
    problems.push(`${where} is not a list`);
    return [];
  }
  const indexOf = new Map(slots.map((s, i) => [s.name, i]));
  const out: CoreDrawOrderKey[] = [];
  let last = -Infinity;
  value.forEach((k, i) => {
    const at = `${where}[${i}]`;
    if (!isRecord(k)) {
      problems.push(`${at} is not an object`);
      return;
    }
    for (const key of Object.keys(k)) if (key !== 'time' && key !== 'offsets') problems.push(`${at}: field "${key}" is not one a draw-order key carries; it carries [time, offsets]`);
    const t = k.time;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) problems.push(`${at}: time is ${JSON.stringify(t)}, not a finite time at or after 0`);
    else if (t <= last) problems.push(`${at}: time ${t} is not after the key before it — the writer refuses key times that do not strictly increase`);
    if (typeof t === 'number' && Number.isFinite(t)) last = Math.max(last, t);
    const moves: CoreDrawOrderKey['moves'] = [];
    if (k.offsets !== undefined) {
      if (!Array.isArray(k.offsets)) problems.push(`${at}: offsets is not a list`);
      else {
        const landed = new Map<number, string>();
        k.offsets.forEach((o: unknown, j: number) => {
          const oat = `${at}.offsets[${j}]`;
          if (!isRecord(o) || typeof o.slot !== 'string') {
            problems.push(`${oat} names no slot`);
            return;
          }
          const index = indexOf.get(o.slot);
          if (index === undefined) {
            problems.push(`${oat}: "${o.slot}" is not a slot of this document`);
            return;
          }
          if (typeof o.offset !== 'number' || !Number.isInteger(o.offset)) {
            problems.push(`${oat}: slot "${o.slot}" offset is ${JSON.stringify(o.offset)}, not a whole number`);
            return;
          }
          if (moves.some((m) => m.slot === index)) problems.push(`${oat}: slot "${o.slot}" is moved twice in one key`);
          const to = index + o.offset;
          if (to < 0 || to >= slots.length) problems.push(`${oat}: slot "${o.slot}" is at ${index} and offset ${o.offset} lands at ${to}, outside the ${slots.length} slots`);
          else if (landed.has(to)) problems.push(`${oat}: slot "${o.slot}" lands at ${to}, where slot "${landed.get(to)}" lands too — two moves on one place leave a slot out of the runtime's order`);
          else landed.set(to, o.slot);
          moves.push({ slot: index, offset: o.offset });
        });
      }
    }
    out.push({ time: Math.fround(typeof t === 'number' && Number.isFinite(t) ? t : 0), moves });
  });
  return out;
}

/** The slot indices in the order a key's moves put them — the header's permutation of the setup order. */
export function orderOf(count: number, moves: CoreDrawOrderKey['moves']): number[] {
  const order = new Array<number>(count).fill(-1);
  for (const m of moves) order[m.slot + m.offset] = m.slot;
  const moved = new Set(moves.map((m) => m.slot));
  const rest = Array.from({ length: count }, (_v, i) => i).filter((i) => !moved.has(i));
  let next = 0;
  for (let i = 0; i < count; i++) if (order[i] === -1) order[i] = rest[next++];
  return order;
}

/** What evaluates a draw-order timeline: `drawOrderAt` unless a plant passes another. */
export type DrawOrderEvaluator = (count: number, keys: readonly CoreDrawOrderKey[], t: number) => number[] | null;

/** The order a timeline sets at `t` as slot indices, or `null` before its first key. */
export function drawOrderAt(count: number, keys: readonly CoreDrawOrderKey[], t: number): number[] | null {
  const i = keyIndexAt(keys, t);
  return i < 0 ? null : orderOf(count, keys[i].moves);
}
