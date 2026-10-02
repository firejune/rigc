/**
 * A18, the body (issue #1060, step 4e of #380): a second, independent compile
 * writes the same model document, byte for byte.
 *
 * One body, two suppliers, as every moved assertion is — but split. The
 * runtime's side (`validate()` in `src/validate.ts`) compares the second
 * compile's Spine pair as well, `skeleton.json` and `skeleton.atlas`, and
 * hands those findings over as `encoding`, in the order it always printed
 * them; the model side (`../model/index.ts`) compares the document alone,
 * which is all a build with no Spine pair writes (`cli_core.ts build`). So
 * the model's clause is written once, here, and the two sides cannot spell it
 * apart. When neither side was handed a second compile — a re-gate of files on
 * disk — there is nothing determinate about a comparison that never ran, and
 * it SKIPs with the reason the round trip always gave (the vacuous-pass trap
 * `A09` is guarded against too).
 *
 * Moved out of `src/validate.ts` unchanged but for the seam; `firstDifferingLine`
 * moved with it, the one reader of it.
 */
import type { Verdicts } from '../harness.ts';

const A18 = 'A18_DETERMINISTIC_EMIT';

/** What A18 reads: whether a second compile was handed over, the encoding's findings, and the two documents. */
export interface DeterminismFacts {
  /** Whether a second, independent compile was handed over — without one the assertion has nothing to compare. */
  again: boolean;
  /** The findings of the clauses only one side compares (the Spine pair, on the runtime's), each a detail, in the order they print. */
  encoding: readonly string[];
  /** The first compile's model document — `undefined` where the caller handed a second compile and no first document. */
  first: string | undefined;
  /** The second compile's model document; read only where `again`. */
  second: string;
}

/**
 * Where two texts first differ, as A18 names it: the 1-based line and each
 * side's line, trimmed and cut to 120 characters.
 */
export function firstDifferingLine(first: string, second: string): string {
  const a = first.split('\n');
  const b = second.split('\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const cut = (line: string | undefined): string => (line === undefined ? '(end of text)' : JSON.stringify(line.trim().slice(0, 120)));
  return `${i + 1}: ${cut(a[i])} first, ${cut(b[i])} second`;
}

export function a18DeterministicEmit({ fail, skip }: Verdicts, facts: DeterminismFacts): void {
  if (!facts.again) return skip(A18, 'no second compile to compare against (re-gating artifacts on disk)');
  for (const detail of facts.encoding) fail(A18, detail);
  // The model document is compared like the Spine pair (issue #922): it is
  // written beside them, and a map iterated in an order nothing fixed would
  // reach it before it reached either of them — the document writes every
  // `Map` of the model as an array in the map's order. On a build with no
  // Spine pair it is the only artifact there is to compare.
  if (facts.first === undefined) {
    fail(A18, 'a second compile was handed over with no first model document to compare its skeleton.model.json against');
  } else if (facts.second !== facts.first) {
    fail(A18, `recompiling produced a different skeleton.model.json (first differing line ${firstDifferingLine(facts.first, facts.second)})`);
  }
}
