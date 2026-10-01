/**
 * The deform survey of a build, through the reader and poser asked for —
 * `explain`'s `DEFORM` block and `tools/survey_hashes.ts` (issues #969,
 * #1019).
 *
 * Moved here unchanged from `./deformmeasure.ts` (issue #1052, step 4e of
 * #380), which re-exports both names: the choice between the model document
 * posed by the core and the Spine skeleton posed by spine-core names no
 * runtime class, and `explain` makes it on a rigc build without touching the
 * runtime — so an entry that links nothing of spine-core has to be able to
 * load it. The spine-core half (`throughSpine`) is `./deformmeasure.ts`'s,
 * reached through the seam (`./spine_side.ts`); where nothing registered it,
 * a survey that needs it is refused by name (`SpineRuntimeError`).
 */
import { CoreInputError, readModel } from './core/index.ts';
import { surveyOfModel, type DeformSurvey, type DeformSurveySource } from './deformsurvey.ts';
import { spineFileSha256 } from './model.ts';
import { spineSurveyFor } from './spine_side.ts';

/** A build's three texts, as `explain` and `tools/survey_hashes.ts` hold them. */
export interface DeformSurveyInput {
  skeletonText: string;
  atlasText: string;
  /** The model document (`skeleton.model.json`), or `null` when the input carries none (a Spine export). */
  modelText: string | null;
  /** What a refusal names the survey's input as; `the deform survey` unstated. */
  label?: string;
}

/**
 * The survey of a build, through the reader and poser asked for (issues #969,
 * #1019): `model` — the model document's structure posed by the core,
 * refused when there is none or when the Spine file beside it is not the one
 * it records; `spine-core` — the Spine skeleton read and posed by the runtime;
 * `auto` — the model document when the input carries one and the core poses
 * it, spine-core otherwise, the reason named in `source.why`. On the model
 * path spine-core is not touched: the Spine text is hashed, never parsed.
 */
export function surveyOfBuild(input: DeformSurveyInput, exempt: ReadonlySet<string>, asked: 'auto' | DeformSurveySource): DeformSurvey {
  const label = input.label ?? 'the deform survey';
  // `./deformmeasure.ts`'s reader and poser, through the seam: it touches the runtime first and refuses by name where it cannot be used.
  const throughSpine = (why: string | null): DeformSurvey => spineSurveyFor(label, why ?? '--poser spine').throughSpine(label, why, input, exempt);
  if (asked === 'spine-core') return throughSpine(null);
  if (input.modelText === null) {
    if (asked === 'model') throw new CoreInputError('the survey was asked to pose the model document, and the input carries none');
    return throughSpine('the input carries no model document (skeleton.model.json), so the survey posed the Spine skeleton through spine-core');
  }
  try {
    const doc = readModel(input.modelText);
    // The document reads the rig it was built with; the Spine file beside it must be that build's (issue #968's rule).
    const found = spineFileSha256(input.skeletonText);
    if (found !== doc.spine.sha256) {
      throw new CoreInputError(`the skeleton is not the one the model document was written beside: its sha256 is ${found}, the document records ${doc.spine.sha256 || 'none'}`);
    }
    return surveyOfModel(doc, exempt);
  } catch (err) {
    if (!(err instanceof CoreInputError) || asked === 'model') throw err;
    return throughSpine(`the core refused to pose the model document — ${err.message}`);
  }
}
