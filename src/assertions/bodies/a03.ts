/**
 * A03, the body (issue #1025, step 4c of #380): every region attachment has a
 * finite, positive width and height (case 6c).
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the region
 * attachments are a fact (`../facts/skin_entries.ts`) rather than the list
 * `validate()` filled from spine-core's loaded skins, so the same body runs over
 * the model document. The `check` call — and so where the verdict sits in the
 * report — stays in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { SkinEntryFacts } from '../facts/skin_entries.ts';
import { SKIP_NO_REGION_ATTACHMENT } from '../reasons.ts';

export function a03RegionWidthHeightFinite({ fail, skip }: Verdicts, { regionAttachments }: SkinEntryFacts): void {
  // ⟨subject⟩_⟨property⟩: with no region there is no size to find non-finite,
  // and a loop over nothing used to report that as held (#580).
  if (regionAttachments.length === 0) return skip('A03_REGION_WIDTH_HEIGHT_FINITE', SKIP_NO_REGION_ATTACHMENT);
  for (const att of regionAttachments) {
    if (!Number.isFinite(att.width) || !Number.isFinite(att.height)) {
      fail('A03_REGION_WIDTH_HEIGHT_FINITE', `region "${att.name}" loaded w=${att.width} h=${att.height}`);
    }
    if (att.width <= 0 || att.height <= 0) {
      fail('A03_REGION_WIDTH_HEIGHT_FINITE', `region "${att.name}" has a non-positive size`);
    }
  }
}
