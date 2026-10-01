/**
 * A37, the body (issue #1025, step 4c of #380): a slider that applies
 * nothing, quietly.
 *
 * A slider is the only constraint that applies an ANIMATION, so its failure
 * modes are about that animation rather than about a transform:
 *
 *   1. **An animation with no timelines.** `animation.apply` walks an empty
 *      array. The slider is in the update cache, its time moves, and the
 *      skeleton never changes.
 *   2. **`loop` on a zero-length animation.** `Slider.update` computes
 *      `animation.duration + (p.time % animation.duration)` when looping, so
 *      a duration of 0 makes the time **NaN** — and it then applies the
 *      animation at NaN, which is a pose nobody can predict and no error.
 *      Only reachable with a bone, because that is the branch the loop
 *      arithmetic lives in.
 *   3. **`scale` 0 with a bone.** `time = offset + (value - offset) * 0`, so
 *      the dial turns and the slider holds one frame.
 *   4. **`mix` 0** with nothing keying it — the same rule as A36's.
 *
 * Moved out of `src/validate.ts` whole: the animation it applies (its
 * timeline count and duration), its dial, `loop`, `scale` and mix, and the
 * keys that raise its mix are the rig's, and a document's records state each.
 * ⚠️ `scale` is read behind `bone` only, and that is where the one known
 * disagreement between the suppliers lives: on a bone-less slider spine-core
 * leaves `scale` at 0 and the document states 1 (#1027). Clause 3 never reads
 * a bone-less slider's scale, so no line can differ on it.
 */
import type { Verdicts } from '../harness.ts';
import type { ConstraintFacts } from '../facts/constraints.ts';
import { mixLive, noneKeysItsMixAbove0, REST_OR_KEY_ITS_MIX, switchedOn } from '../constraint_words.ts';

export function a37SliderConstraintEffective({ fail, skip, stats }: Verdicts, facts: ConstraintFacts): void {
  const sliders = facts.constraints.flatMap((c, index) => (c.slider === undefined ? [] : [{ name: c.name, slider: c.slider, index }]));
  if (!sliders.length) return skip('A37_SLIDER_CONSTRAINT_EFFECTIVE', 'the skeleton declares no slider constraint');
  /** Which sliders an animation switches ON — `switchedOn` over their `mix` timelines, judged by `mixLive` (A36's ⭐ and 🔑; `Slider.update` returns when `mix` is 0, `Slider.js:53-54`). */
  const sliderSwitchedOn = switchedOn(facts, (timeline) => timeline.kind === 'slider' && timeline.word === 'mix', 1, (_timeline, value) => mixLive(value));
  for (const { name, slider, index } of sliders) {
    const where = `slider "${name}"`;
    const animation = slider.animation;
    if (!animation) {
      // The parser's second pass throws on a miss, so this is only reachable
      // on an artifact that never went through it.
      fail('A37_SLIDER_CONSTRAINT_EFFECTIVE', `${where} applies no animation`);
      continue;
    }
    if (animation.timelines === 0) {
      fail(
        'A37_SLIDER_CONSTRAINT_EFFECTIVE',
        `${where} applies animation "${animation.name}", which carries no timeline at all; the slider runs and ` +
          'the skeleton never changes',
      );
    }
    if (slider.bone && slider.loop && !(animation.duration > 0)) {
      fail(
        'A37_SLIDER_CONSTRAINT_EFFECTIVE',
        `${where} loops animation "${animation.name}", whose duration is ${animation.duration} — ` +
          'Slider.update computes `duration + (time % duration)` when looping, so the applied time is NaN',
      );
    }
    if (slider.bone && slider.scale === 0) {
      fail(
        'A37_SLIDER_CONSTRAINT_EFFECTIVE',
        `${where} drives off bone "${slider.bone}" with scale 0, so the property cannot move the slider's time`,
      );
    }
    const mix = slider.mix;
    if (!mixLive(mix) && !sliderSwitchedOn.has(index)) {
      fail(
        'A37_SLIDER_CONSTRAINT_EFFECTIVE',
        `${where} has mix ${mix} at setup and ${noneKeysItsMixAbove0(facts.animations)}; update() returns ` +
          `on mix 0 — ${REST_OR_KEY_ITS_MIX}`,
      );
    }
  }
  stats.sliderConstraints = sliders.length;
}
