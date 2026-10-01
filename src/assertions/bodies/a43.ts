/**
 * A43, the body (issue #1025, cut 4c-3 of step 4c of #380): the two-colour
 * tint loads and poses as written.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads, which is
 * `TwoColourFacts` (`../facts/two_colour.ts`) where it read the skeleton JSON
 * and the loaded skeleton: the dark colour each slot states and the one the
 * runtime loaded, the file's slot timelines, whether an animation exists, and
 * a slot's two colours posed at a key's time — which `validate()` takes from
 * spine-core and the model side from rigc's core. The argument for the rule is
 * above its `check` call, which stays in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { TwoColourFacts } from '../facts/two_colour.ts';
import { SKIP_NO_TWO_COLOR_TINT } from '../reasons.ts';
import { atStoredKey, isObj } from '../values.ts';

export function a43TwoColorTintLoadsAndPosesAsWritten({ fail, skip, stats }: Verdicts, facts: TwoColourFacts): void {
  /** `rrggbb`, or `rrggbbaa` whose last pair the format drops. Null for anything else. */
  const readDarkHex = (hex: string): [number, number, number] | null => {
    const body = hex.startsWith('#') ? hex.slice(1) : hex;
    if (!/^[\da-fA-F]{6}([\da-fA-F]{2})?$/.test(body)) return null;
    return [0, 2, 4].map((i) => Number.parseInt(body.slice(i, i + 2), 16) / 255) as [number, number, number];
  };
  /** `rrggbbaa`, or `rrggbb` the runtime opens at alpha 1. Null for anything else. */
  const readLightHex = (hex: string): [number, number, number, number] | null => {
    const body = hex.startsWith('#') ? hex.slice(1) : hex;
    if (!/^[\da-fA-F]{6}([\da-fA-F]{2})?$/.test(body)) return null;
    const rgb = [0, 2, 4].map((i) => Number.parseInt(body.slice(i, i + 2), 16) / 255);
    return [rgb[0], rgb[1], rgb[2], body.length === 8 ? Number.parseInt(body.slice(6, 8), 16) / 255 : 1];
  };
  /**
   * Half a quantisation step. A channel is one byte in the file and a
   * `Float32Array` entry in a timeline, so the widest honest gap between the
   * number written and the number posed is well under `1/510`.
   */
  const STEP = 1 / 510;
  const off = (found: number, want: number): boolean => !Number.isFinite(found) || Math.abs(found - want) > STEP;
  const show = (c: readonly number[]): string => c.map((n) => (Number.isFinite(n) ? n.toFixed(4) : 'NaN')).join(', ');

  // -- the subjects, read off the FILE ---------------------------------
  const declared = new Map<string, string>();
  for (const { slot, dark } of facts.slotDarks) declared.set(slot, dark);
  // `rgb2` joined in issue #730, and it is this rule's subject rather than a
  // new one's because it is the same tint with the light alpha left out:
  // `RGB2Timeline` writes the light rgb and the dark colour, and on a slot
  // with no dark colour it throws in `apply1` exactly as `RGBA2Timeline`
  // does (measured on a forged file: `TypeError: null is not an object
  // (evaluating 'dark.r = …')`). The one thing it does differently is the
  // alpha it does NOT pose, which is `A45`'s question, not this one's.
  const keyed: Array<{ anim: string; slot: string; timeline: 'rgba2' | 'rgb2'; keys: unknown[] }> = [];
  for (const { animation: animName, slot: slotName, timelines } of facts.slotTimelines) {
    for (const timeline of ['rgba2', 'rgb2'] as const) {
      const keys = timelines[timeline];
      if (Array.isArray(keys)) keyed.push({ anim: animName, slot: slotName, timeline, keys });
    }
  }
  if (declared.size === 0 && keyed.length === 0) {
    return skip('A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN', SKIP_NO_TWO_COLOR_TINT);
  }
  stats.darkSlots = declared.size;
  stats.rgba2Timelines = keyed.filter((t) => t.timeline === 'rgba2').length;
  stats.rgb2Timelines = keyed.filter((t) => t.timeline === 'rgb2').length;

  // -- clause 1: the setup pose ----------------------------------------
  for (const [name, hex] of declared) {
    const want = readDarkHex(hex);
    const loaded = facts.loadedDark(name);
    // ⚠️ "The parser kept nothing" is asked FIRST, and the order is the
    // finding rather than a style: an empty string is both unreadable as a
    // colour and dropped outright, and only the second sentence is about
    // what the loaded skeleton holds. Asked the other way round, `""` was
    // reported as "not six hex digits" — true, and about the file, on the
    // one input where the file is not what went wrong.
    if (loaded === null) {
      fail(
        'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
        `slot "${name}" states dark ${JSON.stringify(hex)} and the loaded skeleton holds no dark colour for ` +
          'it at all — the slot reader takes `dark` through a truthiness test, so a falsy value is dropped ' +
          'in silence and the slot is tinted with one colour',
      );
      continue;
    }
    if (want === null) {
      fail(
        'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
        `slot "${name}" states dark ${JSON.stringify(hex)}, which is not six hex digits — the parser reads ` +
          'fixed two-character slices and stores whatever `parseInt` returns, so the loaded colour is ' +
          `(${show([loaded.r, loaded.g, loaded.b])}) rather than a failure`,
      );
      continue;
    }
    const found: [number, number, number] = [loaded.r, loaded.g, loaded.b];
    if (found.some((n, i) => off(n, want[i]))) {
      fail(
        'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
        `slot "${name}" states dark ${JSON.stringify(hex)} and the runtime loaded (${show(found)}), wanted ` +
          `(${show(want)})`,
      );
    }
  }

  // -- clauses 2 and 3: every rgba2 and rgb2 timeline --------------------
  //
  // ⚠️ Clause 2 poisons its whole ANIMATION, not only its own timeline: the
  // throw happens inside `state.apply`, which applies every timeline of the
  // animation at once, so posing a second — correct — `rgba2` timeline in the
  // same animation would take this assertion down with a `threw:` line
  // instead of the two named failures it has already worked out.
  const cannotPose = new Set(keyed.filter((t) => !declared.has(t.slot)).map((t) => t.anim));
  for (const { anim: animName, slot: slotName, timeline, keys } of keyed) {
    const where = `animation "${animName}" slot "${slotName}" ${timeline}`;
    if (!declared.has(slotName)) {
      fail(
        'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
        `${where}: slot "${slotName}" declares no setup "dark", so the runtime allocates no dark colour for ` +
          `it and applying this animation throws instead of tinting — give the slot a \`dark\`, or key ` +
          `"${timeline === 'rgba2' ? 'rgba' : 'rgb'}"`,
      );
      continue;
    }
    if (cannotPose.has(animName)) continue;
    if (!facts.hasAnimation(animName)) {
      fail('A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN', `${where}: the loaded skeleton has no animation "${animName}"`);
      continue;
    }
    for (const rawKey of keys) {
      if (!isObj(rawKey)) continue;
      const time = typeof rawKey.time === 'number' ? rawKey.time : 0;
      const wantLight = typeof rawKey.light === 'string' ? readLightHex(rawKey.light) : null;
      const wantDark = typeof rawKey.dark === 'string' ? readDarkHex(rawKey.dark) : null;
      // ⚠️ Posed BEFORE the key's own spelling is judged, so that a key whose
      // hex cannot be read is still reported with the colour the runtime
      // actually holds. `Color.setFromString` slices fixed offsets and stores
      // whatever `parseInt` gives back, so the value found is the product
      // here — "not six hex digits" alone would be the value REQUIRED twice
      // over and the found value nowhere.
      // At the key as the runtime stores it — see `atStoredKey` (#771).
      const posed = facts.posedTint(animName, slotName, atStoredKey(time));
      const light = posed?.light;
      const dark = posed?.dark ?? null;
      if (!light || dark === null) {
        fail(
          'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
          `${where} (t=${time}): the posed skeleton has no ${light ? 'dark colour' : 'slot'} to read`,
        );
        continue;
      }
      const foundLight: [number, number, number, number] = [light.r, light.g, light.b, light.a];
      const foundDark: [number, number, number] = [dark.r, dark.g, dark.b];
      if (wantLight === null || wantDark === null) {
        fail(
          'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
          `${where} (t=${time}): the key states light ${JSON.stringify(rawKey.light)} and dark ` +
            `${JSON.stringify(rawKey.dark)} — an ${timeline} key needs both, each six or eight hex digits — and the ` +
            `runtime poses light (${show(foundLight)}), dark (${show(foundDark)})`,
        );
        continue;
      }
      // An `rgb2` key's light colour is three channels, and the posed alpha
      // is not its to state — `RGB2Timeline` leaves it where it was — so the
      // comparison is over the channels the timeline writes. For `rgba2`
      // that is all four, and the line reads as it always did.
      const lightChannels = timeline === 'rgba2' ? 4 : 3;
      if (foundLight.slice(0, lightChannels).some((n, i) => off(n, wantLight[i]))) {
        fail(
          'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
          `${where} (t=${time}): light posed (${show(foundLight.slice(0, lightChannels))}), the key states ` +
            `${JSON.stringify(rawKey.light)} = (${show(wantLight.slice(0, lightChannels))})`,
        );
      }
      if (foundDark.some((n, i) => off(n, wantDark[i]))) {
        fail(
          'A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN',
          `${where} (t=${time}): dark posed (${show(foundDark)}), the key states ${JSON.stringify(rawKey.dark)} ` +
            `= (${show(wantDark)})`,
        );
      }
    }
  }
}
