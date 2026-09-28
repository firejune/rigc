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
 * drifts from it. `CUR17` in `selftest.ts` derives each set from the interface's
 * own source text and compares, so the pair cannot drift in silence, and `CUR18`
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
 * is a string; there is no number here to refuse, and that is
 * `refuseValuesOfTheWrongType`'s question (issue #890), which the parsers ask
 * before this walk on the rig spec and the manifest, and after the motion
 * spec's own field checks.
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

/**
 * The type a field of an input file holds — the vocabulary of the per-shape
 * type tables (`RIG_TYPES` in [`rig.ts`](rig.ts), `MOTION_TYPES` in
 * [`motion.ts`](motion.ts), `MANIFEST_TYPES` in [`types.ts`](types.ts)).
 *
 * The first twelve are **checked** by `refuseValuesOfTheWrongType`. The last
 * six are named so that every key has a type, and are deliberately not checked
 * here, because each already has an owner that says more than a type could:
 *
 *   - `object`, `object[]`, `object[][]`, `map of object` — a nested shape. Its
 *     own keys are typed in its own row, and whether the container is the right
 *     kind of container is the refusal of the reader that walks it (a rig spec's
 *     `"bones"` that is not an array is *a rig spec needs a non-empty "bones"
 *     array*);
 *   - `enum` — a closed set of names, refused by name where it is read, with the
 *     names that exist listed (a slot's `blend`, a constraint's `type`);
 *   - `mixed` — a union of kinds whose owner decides by the value (`MotionKey.v`
 *     is numbers on `rotate`, a name on `attachment`, a member map on a group).
 */
export const SPEC_VALUE_TYPES = [
  'number',
  'string',
  'boolean',
  'number | null',
  'string | null',
  'number[]',
  'number[] | null',
  'string[]',
  'number[][]',
  'map of number[]',
  'map of string[]',
  'map of string | null',
  'object',
  'object[]',
  'object[][]',
  'map of object',
  'enum',
  'mixed',
] as const;

export type SpecValueType = (typeof SPEC_VALUE_TYPES)[number];

/** A shape's keys and the type each one holds. */
export type SpecTypeRow = Readonly<Record<string, SpecValueType>>;

/** One node of an input file that a key scan visited, as the type walk needs it. */
export interface ShapeVisit {
  node: Record<string, unknown>;
  /** The row of the type table this node's keys are typed by. */
  shape: string;
  /** The words a refusal uses for a path below this node — `x`, `weights[3][1]`, `color[2]`. */
  name: (tail: ReadonlyArray<string | number>) => string;
}

/** What a JSON value is, in the words the type refusal uses: `a string "5"`, `an array [1]`, `null`. */
function typeFound(value: unknown): string {
  if (value === null) return 'null';
  const kind = Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value;
  const shown = JSON.stringify(value) ?? String(value);
  return `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind} ${shown.length > 60 ? `${shown.slice(0, 57)}...` : shown}`;
}

/** A checked type as the refusal requires it: `a number`, `an array of numbers`, `a string or null`. */
const REQUIRED: Record<string, string> = {
  number: 'a number',
  string: 'a string',
  boolean: 'a boolean (true or false)',
  'number | null': 'a number or null',
  'string | null': 'a string or null',
  'number[]': 'an array of numbers',
  'number[] | null': 'an array of numbers, or null',
  'string[]': 'an array of strings',
  'number[][]': 'an array of arrays of numbers',
  'map of number[]': 'an object whose every value is an array of numbers',
  'map of string[]': 'an object whose every value is an array of strings',
  'map of string | null': 'an object whose every value is a string or null',
};

/** The types `refuseValuesOfTheWrongType` checks — every one `REQUIRED` can word. */
export const CHECKED_SPEC_VALUE_TYPES: readonly SpecValueType[] = SPEC_VALUE_TYPES.filter((t) => REQUIRED[t] !== undefined);

/**
 * The first place under `value` that is not of `type`, and what was required
 * there — or `null` when it is. An element fault names its own index, so an
 * array of numbers with a string in slot 3 is refused at `[3]` rather than as
 * a whole array.
 */
function wrongTypeAt(
  value: unknown,
  type: SpecValueType,
): { tail: Array<string | number>; value: unknown; required: string } | null {
  const is = (v: unknown, t: SpecValueType): boolean => {
    switch (t) {
      case 'number':
        return typeof v === 'number';
      case 'string':
        return typeof v === 'string';
      case 'boolean':
        return typeof v === 'boolean';
      case 'number | null':
        return v === null || typeof v === 'number';
      case 'string | null':
        return v === null || typeof v === 'string';
      default:
        return true;
    }
  };
  const fault = (tail: Array<string | number>, v: unknown, t: SpecValueType) => ({ tail, value: v, required: REQUIRED[t] });
  const list = (v: unknown, element: SpecValueType, whole: SpecValueType, tail: Array<string | number>) => {
    if (!Array.isArray(v)) return fault(tail, v, whole);
    for (const [i, item] of v.entries()) if (!is(item, element)) return fault([...tail, i], item, element);
    return null;
  };
  const map = (v: unknown, each: SpecValueType, whole: SpecValueType) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return fault([], v, whole);
    const record = v as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const inner = wrongTypeAt(record[key], each);
      if (inner !== null) return { ...inner, tail: [key, ...inner.tail] };
    }
    return null;
  };
  switch (type) {
    case 'number':
    case 'string':
    case 'boolean':
    case 'number | null':
    case 'string | null':
      return is(value, type) ? null : fault([], value, type);
    case 'number[]':
      return list(value, 'number', type, []);
    case 'number[] | null':
      return value === null ? null : list(value, 'number', type, []);
    case 'string[]':
      return list(value, 'string', type, []);
    case 'number[][]': {
      if (!Array.isArray(value)) return fault([], value, type);
      for (const [i, row] of value.entries()) {
        const inner = list(row, 'number', 'number[]', [i]);
        if (inner !== null) return inner;
      }
      return null;
    }
    case 'map of number[]':
      return map(value, 'number[]', type);
    case 'map of string[]':
      return map(value, 'string[]', type);
    case 'map of string | null':
      return map(value, 'string | null', type);
    default:
      return null;
  }
}

/**
 * Refuse the first value in an input file whose JSON type is not the one its
 * field holds (issue #890).
 *
 * 🚨 The defect this closes was a green build, and it sat directly under the
 * rule #881 wrote. A number that is not a number is coerced by the arithmetic
 * that reads it before any rule sees a number at all: measured on the root bone
 * of the generated probes, `"x": "5"` built as `5`, `"rotation": "90"` as `90`,
 * `"x": true` as `1`, `"x": [1]` as `1` and `"x": "NaN"` as `null`, every one
 * green. The compiler was writing a value the spec never stated, or one it
 * guessed.
 *
 * ⭐ It walks the nodes the key scan visited, not the emitter's route, and it
 * reads the type table that sits beside the key table — so a key cannot be
 * admitted by the scan and untyped here (a selftest control holds the two
 * tables equal, and so does `satisfies` over the key table's own type). The
 * refusal names the field, the value found and the type required:
 * `bone "hip" x is a string "5"; a number is required`.
 *
 * 🔒 The report order is fixed — visits in the scan's order, keys in the
 * document's order, arrays by index — so the refusal names the same value on
 * every run.
 *
 * ⚠️ A JSON `null` is a value, not an absence. It is accepted only where the
 * field's type says `null` (a slot's setup `attachment`, a stage stated absent);
 * everywhere else it is refused as `null`, because the readers downstream
 * treated it as whatever `null` coerces to in the arithmetic they happened to do
 * — measured, a bone's `"rotation": null` built green with its bytes moved.
 */
export function refuseValuesOfTheWrongType(
  visits: readonly ShapeVisit[],
  types: Readonly<Record<string, SpecTypeRow>>,
  where: string,
): void {
  for (const visit of visits) {
    const row = types[visit.shape];
    if (row === undefined) throw new Error(`no type row for shape ${visit.shape} (a key scan visited a shape the type table does not have)`);
    for (const key of Object.keys(visit.node)) {
      const type = row[key];
      // An unknown key is the key scan's refusal and it has already run; a
      // shape without a scan (the cut manifest) tolerates keys it does not
      // read, and this walk does not change what a shape accepts.
      if (type === undefined) continue;
      const wrong = wrongTypeAt(visit.node[key], type);
      if (wrong === null) continue;
      throw new CompileError(
        `${where}: ${visit.name([key, ...wrong.tail])} is ${typeFound(wrong.value)}; ${wrong.required} is required`,
      );
    }
  }
}
