/**
 * How an assertion body reads a value — the helpers the bodies under
 * `./bodies/` share with the ones still in `src/validate.ts` (issue #1025,
 * step 4c of #380), moved here unchanged so both read a value one way. Links
 * nothing from the runtime.
 */

/** A JSON object as `JSON.parse` returns it. */
export type Json = Record<string, unknown>;

/** A JSON object, and not an array or `null`. */
export function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The time to pose a key at so that the runtime is AT it: the later of the
 * file's number and that number as spine-core stores it (issue #771).
 *
 * 🚨 Every timeline keeps its key times in a `Float32Array`
 * (`Utils.newFloatArray`), and a key time the float cannot hold exactly is
 * stored at the nearest one — for `0.2`, `0.20000000298…`, which is LATER than
 * the double `0.2`. Stepped to the file's own number, a timeline is then just
 * BEFORE its key: before a first key it writes the setup value (`time <
 * frames[0]`), and past a stepped key it still holds the one before
 * (`frames[i] > time`). That is a pose one float step from the key, not the
 * key's — measured on the selftest's own `ingest_probe`, whose `alpha` key at
 * 0.2 posed the setup 1.0 and was refused as `the key states value 0.4`.
 *
 * ⚠️ The later of the two rather than `Math.fround` alone: where the float
 * rounds DOWN, the file's number is already past the stored key, and a runtime
 * built without typed arrays stores the double itself — in both, the file's
 * number is the one at or after the key. What a key time rounds to is the
 * runtime's storage and not the file's statement, so a rule judging what a KEY
 * states poses at the key; the rounding itself is nothing an author can repair.
 */
export function atStoredKey(time: number): number {
  return Math.max(time, Math.fround(time));
}
