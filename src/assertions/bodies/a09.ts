/**
 * A09, the body (issue #1025, cut 4c-3 of step 4c of #380): the compiled
 * duration is the declared duration (rule 4).
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the
 * animations, their durations and their timelines' durations as one fact
 * (`../facts/animation_durations.ts`) where it read the loaded skeleton's
 * `animations`, `findAnimation` and each timeline's `getDuration()`. The
 * declared durations are the caller's on both sides, as the rig info is. The
 * `check` call stays in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { AnimationDurationFacts } from '../facts/animation_durations.ts';
import { SKIP_NO_DECLARED_DURATION } from '../reasons.ts';
import { float32Step } from '../../timelines.ts';

/** One frame at 60 fps: how far a last key may fall short of the declared end before the declared duration reads as wrong. */
const FRAME = 1 / 60;

export function a09AnimationDurationMatchesSpec({ fail, skip }: Verdicts, facts: AnimationDurationFacts, declaredDurations: Record<string, number> | undefined): void {
  // Without the spec there is no declared duration to compare the compiled
  // one against, and returning here used to count as a PASS — a gate saying
  // it checked something it never looked at.
  if (!declaredDurations) {
    return skip('A09_ANIMATION_DURATION_MATCHES_SPEC', 'no motion spec supplied, so no declared duration to compare against');
  }
  // Same trap one level down. A **static rig** — a skeleton that exists to
  // be posed and carries no animation at all, which is what
  // `1-weight-and-mass`'s second export is — declares nothing and loads
  // nothing, so both loops below iterate zero times and the assertion
  // reported PASS. That is the vacuous green this report is built to refuse:
  // there is no duration here, and saying so is the honest answer.
  if (Object.keys(declaredDurations).length === 0 && facts.animations.length === 0) {
    return skip('A09_ANIMATION_DURATION_MATCHES_SPEC', SKIP_NO_DECLARED_DURATION);
  }
  for (const [name, declared] of Object.entries(declaredDurations)) {
    const anim = facts.animations.find((a) => a.name === name);
    if (!anim) {
      fail('A09_ANIMATION_DURATION_MATCHES_SPEC', `spec declares animation "${name}" but the skeleton has none`);
      continue;
    }
    // Two arms, and the asymmetry is the point.
    //
    // UNDERSHOOT is R7's question — is the declared duration wrong? An
    // animation may hold its final pose, so a last key a little before the
    // end is ordinary and a frame of that is slack.
    //
    // OVERSHOOT is a different question with a different tolerance.
    // `anim.duration` IS the largest key time (`SkeletonJson.ts:1261` takes
    // the max over every timeline's own duration), so a loaded duration past
    // the declared one means a KEY is past it — and nothing that plays the
    // animation for the duration it declares will ever reach that key. Rung
    // 6 lost a one-frame attachment reveal to a key 3.4e-5 s past the end,
    // 1/500 of FRAME, which this comparison read as agreement (issue #54).
    // `compile.ts` refuses that per timeline now; this is the same rule held
    // against a skeleton the compiler never saw.
    // The slack is one float32 step at the declared duration, and it is the
    // same function the compiler's Rule 4 refuses on (`float32Step`, in
    // `timelines.ts`, which says why it is a step of the float and no longer
    // a fixed 1e-6 plus one).
    const slack = float32Step(declared);
    const past = anim.duration - declared;
    if (past > slack) {
      const late = anim.timelineDurations.filter((d) => d - declared > slack).length;
      fail(
        'A09_ANIMATION_DURATION_MATCHES_SPEC',
        `animation "${name}" has ${late} timeline(s) keyed past the declared duration ${declared}s — ` +
          `the last key is at ${anim.duration}s, ${past.toFixed(6)}s late, so nothing ever samples it`,
      );
    } else if (declared - anim.duration > FRAME) {
      fail(
        'A09_ANIMATION_DURATION_MATCHES_SPEC',
        `animation "${name}" loaded duration ${anim.duration}s, spec declares ${declared}s`,
      );
    }
  }
  for (const anim of facts.animations) {
    if (!(anim.name in declaredDurations)) {
      fail('A09_ANIMATION_DURATION_MATCHES_SPEC', `skeleton has animation "${anim.name}" with no spec entry`);
    }
  }
}
