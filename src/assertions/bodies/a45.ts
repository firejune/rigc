/**
 * A45, the body (issue #1025, step 4c of #380): the separable colour timelines
 * own their channels and pose as written.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads, which is
 * three facts (`../facts/slot_colour.ts`) where it read the skeleton JSON and
 * the loaded skeleton: the animations' slot timelines in the file's order, as
 * the file spells them; whether an animation exists; and a slot's colour posed
 * at a time on a fresh track, which `validate()` takes from spine-core and the
 * model side from rigc's core. The `check` call stays in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { SlotColourFacts } from '../facts/slot_colour.ts';
import { SKIP_NO_SEPARABLE_COLOR } from '../reasons.ts';
import { atStoredKey, isObj } from '../values.ts';
import { SLOT_COLOR_CHANNELS } from '../../timelines.ts';

// ⭐ **Why this is its own rule and not a clause on `A43`.** `rgb` and
// `alpha` pose no dark colour, so under A43's name a failure would be a
// verdict saying "two-colour tint" about a file that states one colour —
// the name would say something other than what it decides (the rule #712
// applied to A43 itself, against a clause on A10). And the SKIP is the
// sharper half: a rig with a `dark` and no separable timeline has A43's
// subject present, so a clause there could only PASS on it, which is a pass
// for an absent subject.
//
// 🚨 **What it decides is what makes `rgb` + `alpha` not `rgba`**, and both
// clauses are about the file against the runtime:
//
//   1. **One channel, one timeline.** Each colour timeline poses its
//      channels at EVERY time — before its first key it writes the setup
//      value — so when two of one slot share a channel, the one applied
//      later (the one the file states later) overwrites the other
//      everywhere and the first one's keys on it are read by nothing
//      (`SLOT_COLOR_CHANNELS`). It is the shape a converter that writes a
//      separable `rgb` as `rgba` leaves beside the `alpha` it kept, and it
//      loads without a word.
//   2. **Posed as written.** Stepped to each key's own time, the channels
//      the timeline writes are the key's: a colour that is not six hex
//      digits loads as NaN, and a key whose time another key repeats is
//      read by nothing, and both parse in silence.
//
// ⚠️ An `rgb` timeline alone that a converter wrote as `rgba` with the
// setup alpha is NOT this rule's to see, and nothing that reads only the
// file can see it: the result is a correct `rgba`, which is also what an
// author keying the light colour and holding its alpha would write. What
// differs is what happens UNDER another track that moves the alpha, which
// is the consumer's composing rather than the object (CLAUDE.md). That
// file SKIPs here — it keys no `rgb` or `alpha` — and says so.
//
// ⚠️ The required values are parsed HERE, as A43's are, and the channel
// table is `timelines.ts`'s rather than the loaded timelines' property ids:
// a check that asked the parser what a timeline writes would agree with it
// whatever it did. A selftest control holds that table to the runtime's ids.
export function a45SeparableColorTimelinesOwnTheirChannelsAndPoseAsWritten({ fail, skip, stats }: Verdicts, facts: SlotColourFacts): void {
  const NAME = 'A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN';
  /** `rrggbb`, or `rrggbbaa` whose alpha an `rgb` key cannot pose. Null for anything else. */
  const readRgbHex = (hex: unknown): [number, number, number] | null => {
    if (typeof hex !== 'string') return null;
    const body = hex.startsWith('#') ? hex.slice(1) : hex;
    if (!/^[\da-fA-F]{6}([\da-fA-F]{2})?$/.test(body)) return null;
    return [0, 2, 4].map((i) => Number.parseInt(body.slice(i, i + 2), 16) / 255) as [number, number, number];
  };
  /** Half a byte step for a hex channel; a stored `Float32` for an alpha `value`. */
  const HEX_STEP = 1 / 510;
  const FLOAT_STEP = 1e-6;
  const off = (found: number, want: number, step: number): boolean => !Number.isFinite(found) || Math.abs(found - want) > step;
  const show = (c: readonly number[]): string => c.map((n) => (Number.isFinite(n) ? n.toFixed(4) : 'NaN')).join(', ');

  // -- the subjects, read off the FILE ---------------------------------
  const subjects: Array<{ anim: string; slot: string; timelines: Record<string, unknown> }> = [];
  for (const { animation: animName, slot: slotName, timelines } of facts.slotTimelines) {
    if (Array.isArray(timelines.rgb) || Array.isArray(timelines.alpha)) {
      subjects.push({ anim: animName, slot: slotName, timelines });
    }
  }
  if (subjects.length === 0) return skip(NAME, SKIP_NO_SEPARABLE_COLOR);
  stats.separableColorTimelines = subjects.reduce(
    (n, s) => n + (Array.isArray(s.timelines.rgb) ? 1 : 0) + (Array.isArray(s.timelines.alpha) ? 1 : 0),
    0,
  );

  for (const { anim: animName, slot: slotName, timelines } of subjects) {
    const at = `animation "${animName}" slot "${slotName}"`;
    // In FILE order, which is the order `readAnimation` pushes them and so
    // the order they apply in.
    const colour = Object.keys(timelines).filter((name) => name in SLOT_COLOR_CHANNELS && Array.isArray(timelines[name]));

    // -- clause 1: one channel, one timeline ---------------------------
    let shared = false;
    for (const channel of ['rgb', 'alpha', 'dark'] as const) {
      const writers = colour.filter((name) => SLOT_COLOR_CHANNELS[name].includes(channel));
      if (writers.length < 2 || !writers.some((name) => name === 'rgb' || name === 'alpha')) continue;
      shared = true;
      const last = writers[writers.length - 1];
      fail(
        NAME,
        `${at}: ${writers.map((name) => `"${name}"`).join(' and ')} ${writers.length === 2 ? 'both' : 'all'} key the ${channel === 'rgb' ? 'light rgb' : channel === 'alpha' ? 'alpha' : 'dark colour'} ` +
          `— each poses it at every time, its setup value before its first key included, so "${last}", which the ` +
          `file states last, overwrites ${writers.length === 2 ? `"${writers[0]}"` : 'the others'} everywhere and ` +
          'those keys are read by nothing. Key each channel once: "rgb" and "alpha" on their own key times, or one "rgba"',
      );
    }
    if (shared) continue;

    // -- clause 2: posed as written ------------------------------------
    //
    // ⚠️ Two things this does NOT do, both measured rather than skipped:
    // it does not read the loaded timeline's CLASS back, and it does not
    // hold a channel the timeline leaves alone to the setup pose. Against
    // the linked parser neither can fail — every `rgb` / `alpha` array that
    // loads at all loads as an `RGBTimeline` / `AlphaTimeline`, and the
    // three other outcomes (an empty array, a slot the skeleton lacks, a
    // name outside the switch) throw at `A00` — so either would be a clause
    // nobody can see fire. The selftest reads both off spine-core directly
    // (`S82`–`S84`), where they are measurements of the runtime rather than
    // checks on a file.
    if (!facts.hasAnimation(animName)) {
      fail(NAME, `${at}: the loaded skeleton has no animation "${animName}"`);
      continue;
    }
    for (const name of ['rgb', 'alpha'] as const) {
      const keys = timelines[name];
      if (!Array.isArray(keys)) continue;
      const where = `${at} ${name}`;
      for (const rawKey of keys) {
        if (!isObj(rawKey)) continue;
        const time = typeof rawKey.time === 'number' ? rawKey.time : 0;
        // At the key as the runtime stores it, not one float step before
        // it — see `atStoredKey` (issue #771).
        const posed = facts.posedSlot(animName, slotName, atStoredKey(time));
        if (!posed) {
          fail(NAME, `${where} (t=${time}): the posed skeleton has no slot "${slotName}" to read`);
          continue;
        }
        const light = [posed.color.r, posed.color.g, posed.color.b, posed.color.a];
        if (name === 'rgb') {
          const stated = readRgbHex(rawKey.color);
          if (stated === null) {
            fail(
              NAME,
              `${where} (t=${time}): the key states color ${JSON.stringify(rawKey.color)} — an rgb key is six hex ` +
                `digits — and the runtime poses (${show(light.slice(0, 3))})`,
            );
          } else if (light.slice(0, 3).some((n, i) => off(n, stated[i], HEX_STEP))) {
            fail(
              NAME,
              `${where} (t=${time}): rgb posed (${show(light.slice(0, 3))}), the key states ` +
                `${JSON.stringify(rawKey.color)} = (${show(stated)})`,
            );
          }
        } else {
          // `readTimeline1(…, 0, 1)`: an absent `value` IS 0, and an editor
          // omits it there, so absence is read the parser's way rather than
          // as a malformed key.
          const stated = rawKey.value === undefined ? 0 : rawKey.value;
          if (typeof stated !== 'number' || off(light[3], stated, FLOAT_STEP)) {
            fail(
              NAME,
              `${where} (t=${time}): alpha posed ${show([light[3]])}, the key states value ${JSON.stringify(rawKey.value)}` +
                (typeof stated !== 'number'
                  ? ' — an alpha key\'s value is a number'
                  : stated < 0 || stated > 1
                    ? ' — the runtime clamps a posed alpha to 0..1'
                    : ''),
            );
          }
        }
      }
    }
  }
}
