/**
 * The other half of "the compiler never invents a value that is not in the
 * spec": **the compiler never discards a value that is in the spec.**
 *
 * `src/compile.ts` reads an input object by naming the fields it knows — a
 * literal list walked by a `copy` helper, or a run of `if (spec.x !== undefined)`
 * lines. Either spelling asks the same question, *what does the emitter want?*,
 * and neither ever asks the opposite one, *what does this file actually say?* So
 * a key outside the known set was never looked at, never mentioned and never
 * emitted, and the build exited 0 with every assertion green (issue #545).
 *
 * That is the input-side twin of the silence the whole tool exists to remove.
 * A missing number is already a `CompileError` naming the field; an extra one
 * was nothing at all — and the extra one is the worse of the two, because an
 * invented value at least appears in the output where somebody can see it.
 *
 * ## What this module is, and what it is not
 *
 * It is one refusal and the near-miss search that makes the refusal a repair. It
 * is **not** a schema: the known-key sets live beside the shapes they describe
 * (`RIG_KEYS` in [`rig.ts`](rig.ts), `MOTION_KEYS` in [`motion.ts`](motion.ts)),
 * because a set of key names two files away from its interface is a set that
 * drifts from it. `KEY01` in `selftest.ts` derives each set from the interface's
 * own source text and compares, so the pair cannot drift in silence, and `KEY02`
 * refuses a declared key that occurs nowhere else in the tree — which is the
 * exact shape `scaleYMode` had.
 *
 * ## Why the refusal is at parse time rather than at emit time
 *
 * The alternative considered was to record the keys the emitter actually
 * touches and subtract them afterwards — no table at all, and therefore no
 * drift. It is rejected for two measured reasons:
 *
 *   - **It answers a different question.** `buildRigMesh` returns at
 *     `if (att.generator)` before reading `width`, `hull` or `edges`, so a
 *     recorder would refuse `"width"` on a generated mesh and accept it on an
 *     authored one. That makes the accepted key set a property of the file's own
 *     values rather than of the format, and the format's key set is what an
 *     agent authoring against it has to be told.
 *   - **It cannot reach what the emitter never visits.** The emit loop walks the
 *     rig's slots and skips one with no attachments before it reads `setup` —
 *     the blind spot issue #293 was lost in for three weeks and `parseMotionSpec`
 *     was written to remove. A recorder rebuilds it.
 */
import { CompileError } from './errors.ts';

/**
 * Levenshtein distance. Only ever called on the losing side of a refusal, so the
 * O(n*m) table is free and a cheaper heuristic (shared prefix, substring) would
 * miss the commonest real case — a transposition or one wrong character in a
 * hand-typed name.
 */
export function nameDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = new Array<number>(cols);
  for (let j = 0; j < cols; j++) previous[j] = j;
  for (let i = 1; i < rows; i++) {
    const current = new Array<number>(cols);
    current[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[cols - 1];
}

/** Up to five known names closest to the one that was not found. */
export function nearMisses(wanted: string, known: Iterable<string>): string[] {
  const scored: Array<{ name: string; d: number }> = [];
  for (const name of known) {
    const d = nameDistance(wanted.toLowerCase(), name.toLowerCase());
    // Half the name's length, floored at 2: "leg" must not suggest "arm", and a
    // long name may still be recognisable through several typos.
    if (d <= Math.max(2, Math.floor(wanted.length / 2))) scored.push({ name, d });
  }
  scored.sort((x, y) => x.d - y.d || (x.name < y.name ? -1 : 1));
  return scored.slice(0, 5).map((s) => s.name);
}

/**
 * Refuse every key of `node` that `known` does not carry.
 *
 * ⭐ **Every** one of them, in one message, rather than the first. The four keys
 * issue #545 planted into a single constraint were four separate mistakes an
 * author had made in one place, and a refusal that names one of them buys three
 * more round trips through a compile that is not cheap.
 *
 * ⭐ The near miss is what makes this a repair rather than a lecture. Both sides
 * are lower-cased before the distance is taken, so `ROTATE` is distance 0 from
 * `rotate` and comes back first — a real key in the wrong case is the commonest
 * of these and the one an author is least likely to spot by re-reading.
 *
 * `known` may be empty (a shape with no fields at all); the message then says so
 * rather than printing `known: ` with nothing after it.
 */
export function refuseUnknownKeys(
  node: Record<string, unknown>,
  known: readonly string[],
  where: string,
  what: string,
): void {
  const strays = Object.keys(node).filter((key) => !known.includes(key));
  if (strays.length === 0) return;
  const named = strays.map((key) => {
    const near = nearMisses(key, known);
    return near.length === 0 ? `"${key}"` : `"${key}" (did you mean ${near.map((n) => `"${n}"`).join(', ')}?)`;
  });
  throw new CompileError(
    `${where}: ${what} has ${strays.length === 1 ? 'a key' : `${strays.length} keys`} this compiler does not read: ` +
      `${named.join(', ')}. Nothing reads such a key, so it would be dropped from the emitted skeleton in silence — ` +
      'fix the spelling or remove it. ' +
      (known.length === 0 ? 'This shape has no fields at all.' : `Known here: ${[...known].sort().join(', ')}.`),
  );
}
