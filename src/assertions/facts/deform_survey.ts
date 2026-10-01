/**
 * The deform survey (issue #1025, cut 4c-3 of step 4c of #380) — the
 * census's R6 and the structure under it, as A39 reads them: every deform key
 * of every animation measured in the frame its animation is reached in, every
 * span between two keys scanned, and what was passed over.
 *
 * ⭐ **One fact, because it is one measurement.** The survey is what
 * `explain`'s `DEFORM` block prints whole and A39 gates on, and the reason
 * both read one survey rather than each posing for itself is that the
 * report's reversal count and A39's are the same count
 * (`src/deformmeasure.ts`'s header). So A39 is handed the survey, not the
 * poses under it: `validate()` hands it spine-core's — the Spine skeleton read
 * and posed by the runtime (`surveyDeformKeys`) — and the model side the core's
 * — the model document's structure posed by rigc's core (`surveyOfModel`,
 * `src/deformsurvey.ts`). `tools/survey_hashes.ts` holds the two to one survey
 * on every corpus row, and the selftest on every call with a model in hand
 * (`VF12`).
 *
 * Links nothing from the runtime.
 */
import type { DeformSurvey } from '../../deformsurvey.ts';

/** What A39 reads. */
export interface DeformSurveyFacts {
  /** The survey, with the slots in `exempt` passed over unmeasured (the rig's `deformMayFold`). */
  survey(exempt: ReadonlySet<string>): DeformSurvey;
}
