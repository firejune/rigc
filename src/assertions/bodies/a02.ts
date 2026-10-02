/**
 * A02, restated over the emitted text (issue #1060): the clause
 * `validate()` runs in `src/validate.ts`, word for word, over the skeleton JSON — the
 * text rigc wrote, read by rigc's own reader rather than by spine-core's. The
 * round trip's copy is unchanged and runs in `cli.ts build`; this one runs in
 * the gate of the entry that links none of the runtime
 * (`../emitted/index.ts`), and the selftest's `RC28` holds the two to the
 * same lines on every recipe and on this assertion's mutants.
 */
import type { Verdicts } from '../harness.ts';
import { LEGACY_BONE_INHERIT_KEY } from '../../generation.ts';
import { isObj, type Json } from '../values.ts';

export function a02NoBoneTransformKey({ fail }: Verdicts, raw: Json | null): void {
  const bones = Array.isArray(raw?.bones) ? (raw.bones as unknown[]) : [];
  for (const bone of bones) {
    if (isObj(bone) && LEGACY_BONE_INHERIT_KEY in bone) {
      fail('A02_NO_BONE_TRANSFORM_KEY', `bone "${String(bone.name)}" uses "transform", the key 4.0 and 4.1 spelled; 4.2 and 4.3 spell it "inherit"`);
    }
  }
}
