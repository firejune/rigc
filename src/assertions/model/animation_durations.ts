/**
 * The model side's supply of `AnimationDurationFacts` (issue #1025, cut 4c-3
 * of step 4c of #380): the document's animations in the file's order, each
 * with the runtime's duration and every timeline's own duration.
 *
 * Every number is the core's reading, through functions rigc already runs:
 *
 * - **The roster's order** is the file's, `fileAnimationOrder` (`src/compile.ts`,
 *   issue #1034): a `rigc-compiled/3` document's stated `editorOrder`, else the
 *   emitter's own rule over the document's names — integer-like names first,
 *   as the file keys them.
 * - **An animation's duration** is `CoreAnimationTimelines.duration`, the last
 *   key time of every timeline as float32 — the value `tools/pose_oracle.ts
 *   compare` holds equal to spine-core's on its `animations` roster.
 * - **A timeline's own duration** is its last key's time as the core read it
 *   (float32): each bone and slot timeline, each constraint timeline in the
 *   order the runtime builds them (`modelConstraintTimelineSources`), each
 *   attachment's deform and sequence timeline, the draw order and the events.
 *   How many timelines that makes is the count the runtime builds
 *   (`timelineCount`, which the selftest's `VF10` holds equal to the runtime's
 *   on every slider animation); a walk that lists another count is this
 *   module's defect and throws by name rather than handing A09 a list of the
 *   wrong length.
 *
 * Links nothing from the runtime.
 */
import { fileAnimationOrder } from '../../compile.ts';
import type { AnimationDuration, AnimationDurationFacts } from '../facts/animation_durations.ts';
import { modelConstraintTimelineSources, timelineCount } from './constraints.ts';
import type { ReadDocument } from './parse.ts';

/** The last of `times`, which the core read in key order. */
const lastOf = (times: ReadonlyArray<{ time: number }>): number[] => (times.length === 0 ? [] : [times[times.length - 1].time]);

export function modelAnimationDurations(read: ReadDocument): AnimationDurationFacts {
  const constraintTimelines = modelConstraintTimelineSources(read);
  const animations: AnimationDuration[] = [];
  for (const name of fileAnimationOrder(read.doc)) {
    const anim = read.doc.animations.find((a) => a.name === name);
    if (anim === undefined) continue;
    const t = anim.timelines;
    const durations: number[] = [];
    for (const target of [...t.bones, ...t.slots]) for (const tl of target.timelines) durations.push(...lastOf(tl.keys));
    for (const source of constraintTimelines) if (source.animation === name) durations.push(...lastOf(source.keys));
    for (const a of t.attachments) {
      if (a.deform !== null) durations.push(...lastOf(a.deform));
      if (a.sequence !== null) durations.push(...lastOf(a.sequence));
    }
    durations.push(...lastOf(t.drawOrder), ...lastOf(t.events));
    const built = timelineCount(t);
    if (durations.length !== built) {
      throw new Error(`internal: animation "${name}": the durations walk lists ${durations.length} timeline(s) and the core reads ${built}`);
    }
    animations.push({ name, duration: t.duration, timelineDurations: durations });
  }
  return { animations };
}
