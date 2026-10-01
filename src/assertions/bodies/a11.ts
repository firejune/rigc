/**
 * A11, the body (issue #1025, step 4c of #380): no clipping attachment — the
 * renderer skips them silently. A `renderer` rule, so `spine` never runs it.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the count is
 * a fact (`../facts/skin_entries.ts`).
 */
import type { Verdicts } from '../harness.ts';
import type { SkinEntryFacts } from '../facts/skin_entries.ts';

export function a11NoClippingAttachments({ fail }: Verdicts, { clippingCount }: SkinEntryFacts): void {
  if (clippingCount > 0) {
    fail('A11_NO_CLIPPING_ATTACHMENTS', `${clippingCount} clipping attachment(s); the renderer skips them silently`);
  }
}
