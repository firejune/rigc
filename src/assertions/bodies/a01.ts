/**
 * A01, restated over the emitted text (issue #1060): the clause
 * `validate()` runs in `src/validate.ts`, word for word, over the skeleton JSON — the
 * text rigc wrote, read by rigc's own reader rather than by spine-core's. The
 * round trip's copy is unchanged and runs in `cli.ts build`; this one runs in
 * the gate of the entry that links none of the runtime
 * (`../emitted/index.ts`), and the selftest's `RC28` holds the two to the
 * same lines on every recipe and on this assertion's mutants.
 */
import type { Verdicts } from '../harness.ts';
import { TOPLEVEL_CONSTRAINT_ARRAYS } from '../../generation.ts';
import type { Json } from '../values.ts';

export function a01NoLegacyToplevelConstraintArrays({ fail }: Verdicts, raw: Json | null): void {
  for (const key of TOPLEVEL_CONSTRAINT_ARRAYS) {
    if (raw && key in raw) {
      fail(
        'A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS',
        `top-level "${key}" array present; 4.3 wants it inside "constraints" with type:"${key}"`,
      );
    }
  }
}
