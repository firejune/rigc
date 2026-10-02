/**
 * A05, restated over the emitted text (issue #1060): the clause
 * `validate()` runs in `src/validate.ts`, word for word, over the skeleton JSON — the
 * text rigc wrote, read by rigc's own reader rather than by spine-core's. The
 * round trip's copy is unchanged and runs in `cli.ts build`; this one runs in
 * the gate of the entry that links none of the runtime
 * (`../emitted/index.ts`), and the selftest's `RC28` holds the two to the
 * same lines on every recipe and on this assertion's mutants.
 */
import type { Verdicts } from '../harness.ts';
import { SKIP_NO_TIMELINE } from '../reasons.ts';
import { CHANNELS_BY_KIND, walkTimelines } from '../../timelines.ts';
import { isObj, type Json } from '../values.ts';

export function a05CurveArrayLength({ fail, skip }: Verdicts, raw: Json | null): void {
  // Two clauses, so the SKIP needs both to be empty (#580). The vocabulary
  // clause below measures every timeline it is handed — an unchecked name is a
  // finding whether or not any key on it carries a curve — so a skeleton with
  // timelines and no curve at all has still been measured. What measures
  // nothing is a skeleton `walkTimelines` never calls back on.
  let timelines = 0;
  walkTimelines(raw, (path, kind, name, keys) => {
    timelines++;
    const table = CHANNELS_BY_KIND[kind];
    if (!(name in table)) {
      fail('A05_CURVE_ARRAY_LENGTH', `${path}: unchecked ${kind} timeline "${name}" — extend the validator`);
      return;
    }
    const channels = table[name];
    for (const key of keys) {
      if (!isObj(key) || !('curve' in key)) continue;
      const curve = key.curve;
      if (channels === null) {
        fail('A05_CURVE_ARRAY_LENGTH', `${path}: timeline "${name}" cannot carry a curve`);
        continue;
      }
      if (curve === 'stepped') continue;
      if (!Array.isArray(curve)) {
        fail('A05_CURVE_ARRAY_LENGTH', `${path}: curve is ${JSON.stringify(curve)}, expected "stepped" or an array`);
        continue;
      }
      if (curve.length !== channels * 4) {
        fail(
          'A05_CURVE_ARRAY_LENGTH',
          `${path} (t=${String(key.time ?? 0)}): curve has ${curve.length} numbers, "${name}" needs ${channels} channels x 4 = ${channels * 4}`,
        );
      }
      for (const n of curve) {
        if (typeof n !== 'number' || !Number.isFinite(n)) {
          fail('A05_CURVE_ARRAY_LENGTH', `${path}: curve holds a non-finite value ${JSON.stringify(n)}`);
        }
      }
    }
  });
  if (timelines === 0) return skip('A05_CURVE_ARRAY_LENGTH', SKIP_NO_TIMELINE);
}
