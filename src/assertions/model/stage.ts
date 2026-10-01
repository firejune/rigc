/**
 * The model side's supply of `StageFacts` (issue #1025, step 4c of #380): the
 * stage a `rigc-compiled/3` document states (`stated.stage`, issue #1026), or,
 * for a `/2` or `/1` document, which does not, the stage its caller gives.
 * A `/3` document given one anyway is refused (`refuseGivenBeside`).
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
import { refuseGivenBeside, type ModelGiven } from './given.ts';
import type { ReadDocument } from './parse.ts';

export function modelStage(read: ReadDocument, given: ModelGiven | undefined): StageFacts {
  refuseGivenBeside(read, given);
  // The document's own statement (issue #1026): `null` is a skeleton that declares none, read as both extents absent.
  if (read.doc.stated !== null) {
    const stage = read.doc.stated.stage;
    return { width: stage?.width, height: stage?.height };
  }
  if (given === undefined) throw new Error(`the caller gave no stage; a ${read.doc.spec} document does not state one, so the model side cannot read it`);
  return { width: given.stage?.width, height: given.stage?.height };
}
