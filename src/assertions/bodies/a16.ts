/**
 * A16, restated over the emitted text (issue #1060): the clause
 * `validate()` runs in `src/validate.ts`, word for word, over the skeleton JSON — the
 * text rigc wrote, read by rigc's own reader rather than by spine-core's. The
 * round trip's copy is unchanged and runs in `cli.ts build`; this one runs in
 * the gate of the entry that links none of the runtime
 * (`../emitted/index.ts`), and the selftest's `RC28` holds the two to the
 * same lines on every recipe and on this assertion's mutants.
 */
import type { Verdicts } from '../harness.ts';
import { spineGeneration, type SpineGeneration } from '../../generation.ts';
import { isObj, type Json } from '../values.ts';

const SPINE_4_3: SpineGeneration = '4.3';

export function a16SkeletonVersion43({ fail }: Verdicts, raw: Json | null): void {
  const declared = isObj(raw?.skeleton) ? (raw.skeleton as Json).spine : undefined;
  if (typeof declared !== 'string' || spineGeneration(declared) !== SPINE_4_3) {
    fail(
      'A16_SKELETON_VERSION_4_3',
      `skeleton.spine is ${JSON.stringify(declared)}, expected 4.3, 4.3.<patch> or 4.3.<patch>-<suffix>`,
    );
  }
}
