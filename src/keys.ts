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

/**
 * The largest float32, `3.4028234663852886e38`. The skeleton file is written at
 * float32 precision (`f32` in `src/compile.ts` rounds every emitted number), so
 * this is the largest magnitude a stated number can have and still come out of
 * the emitter as a number.
 */
export const FLOAT32_MAX = 3.4028234663852886e38;

/**
 * Refuse the first number in an input file that the skeleton file cannot carry
 * — one that is not finite, or that is finite only as a double (issue #881).
 *
 * 🚨 The defect this closes was a green build. `JSON.parse` reads `1e309` as
 * `Infinity`, the emitter wrote it, and `JSON.stringify(Infinity)` is `null`:
 * a bone stated at `x: 1e309` built green on the overlay probe as `"x": null`
 * and was read as 0, a value the spec never stated. `1e308` did exactly the same
 * — it is a finite double, but every emitted number is rounded to a float32 and
 * `Math.fround(1e308)` is `Infinity` — so the line is float32's range and not
 * the double's: `3.4028234663852886e38` built green and was emitted as itself,
 * the next double up that rounds past it (`3.4028235677973366e38`) was emitted
 * as `null`. The predicate is therefore `Number.isFinite(Math.fround(n))`,
 * which is `NaN`, both infinities and exactly that overflow.
 *
 * ⭐ It walks the file, not the emitter's route — `checkRigSpecKeys`'s design
 * and its reason. Before this, a handful of readers in `compile.ts` carried a
 * finite check of their own (vertex arrays, a path's lengths, a segments
 * falloff, a slider's mapping, an event's payload), each right about its own
 * field, and none of them was a rule. Measured when this was written, planting
 * `1e309` at every numeric leaf of nine rig specs — 610 plants over 57 kinds
 * of field: 19 kinds were refused by a rule of their own (30 of those 70
 * refusals printing the Infinity as `null`, and some only by a later symptom
 * such as *hull Infinity disagrees with the triangles*), 1 was caught only by
 * the gate, and 37 built green with a `null` in them on at least one rig. One
 * pass over every number the document holds cannot miss a reader added next
 * month, and it runs before any of them — so a range rule further down (a
 * radius that is positive, a weight in 0..1) never has to print `NaN`.
 *
 * 🔒 The report order is fixed: `Object.keys` of parsed JSON is the
 * document's key order (integer-like keys first, as the language orders them)
 * and arrays are visited by index, so the refusal names the same number on
 * every run.
 *
 * ⚠️ What it cannot see is a number spelled as something else. `"x": "NaN"`
 * is a string; there is no number here to refuse, and the reader downstream
 * that coerces it is a type question this walk does not answer.
 *
 * `place` turns a path into the words the refusal uses for it.
 */
export function refuseNumbersTheFileCannotCarry(
  raw: unknown,
  where: string,
  place: (path: ReadonlyArray<string | number>) => string,
): void {
  const visit = (node: unknown, path: Array<string | number>): void => {
    if (typeof node === 'number') {
      if (Number.isFinite(Math.fround(node))) return;
      const why = Number.isNaN(node)
        ? ''
        : Number.isFinite(node)
          ? ' This one is finite as a double and has no float32 but Infinity.'
          : ' JSON has no spelling for Infinity: a literal past ±1.7976931348623157e308, such as 1e309, parses to it.';
      throw new CompileError(
        `${where}: ${place(path)} is ${String(node)}; a number in this file is finite at float32 precision, at most ` +
          `±${String(FLOAT32_MAX)}, because the skeleton is written as float32 — past that it would be emitted as ` +
          `Infinity, which JSON writes as null, a value the file never stated.${why}`,
      );
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => visit(child, [...path, i]));
    } else if (node !== null && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      for (const key of Object.keys(record)) visit(record[key], [...path, key]);
    }
  };
  visit(raw, []);
}

/** A path as the file spells it: `.key`, `."odd key"`, `[3]`. */
export function dottedPath(path: ReadonlyArray<string | number>): string {
  let out = '';
  for (const step of path) {
    if (typeof step === 'number') out += `[${step}]`;
    else out += /^[A-Za-z_][A-Za-z0-9_]*$/.test(step) ? `${out === '' ? '' : '.'}${step}` : `${out === '' ? '' : '.'}${JSON.stringify(step)}`;
  }
  return out;
}
