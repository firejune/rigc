/**
 * The model side's supply of `DeformSurveyFacts` (issue #1025, cut 4c-3 of
 * step 4c of #380): the survey off the model document alone —
 * `surveyOfModel` (`src/deformsurvey.ts`), the document's structure read by
 * `modelStructure` (`src/deformstructure.ts`) and every pose taken by the
 * core's poser. It is the survey `explain` takes of a build that carries a
 * model document (`surveyOfBuild`'s model path) and the one
 * `tools/survey_hashes.ts` holds byte for byte to spine-core's on every corpus
 * row; called, not restated.
 *
 * A pose the core refuses — a construct it leaves out, a value it computes as
 * no number — is a `CoreInputError` naming why, and it reaches A39 as the
 * refusal: the line the harness prints for a body that threw, the core's
 * sentence in it. A survey that is not the runtime's is never handed on.
 *
 * Links nothing from the runtime.
 */
import { surveyOfModel } from '../../deformsurvey.ts';
import type { DeformSurveyFacts } from '../facts/deform_survey.ts';
import type { ReadDocument } from './parse.ts';

export function modelDeformSurvey(read: ReadDocument): DeformSurveyFacts {
  return { survey: (exempt) => surveyOfModel(read.doc, exempt) };
}
