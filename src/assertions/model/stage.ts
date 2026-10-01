/**
 * The model side's supply of `StageFacts` (issue #1025, step 4c of #380): the
 * stage its caller gives, because the document does not hold it until issue
 * #1026 — the emitter's header carries it (`SkeletonHeader.stage`), and the
 * model the header is emitted beside does not.
 *
 * ⚠️ A caller that gives no stage at all is refused by name rather than read as
 * "the skeleton declares none": those are two different statements, and only
 * the second is one the caller made. A stage stated as `null` IS that second
 * statement, and reads as both extents absent, the way the runtime loads a
 * header with neither key.
 *
 * Links nothing from the runtime.
 */
import type { StageFacts } from '../facts/stage.ts';
import type { ModelGiven } from './given.ts';

export function modelStage(given: ModelGiven | undefined): StageFacts {
  if (given === undefined) throw new Error('the caller gave no stage; the document does not state one, so the model side cannot read it');
  return { width: given.stage?.width, height: given.stage?.height };
}
