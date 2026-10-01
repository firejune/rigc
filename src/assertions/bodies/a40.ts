/**
 * A40, the body (issue #1025, cut 4c-5 of step 4c of #380): two sliders on
 * one property, and the later one erases the other.
 *
 * The argument — why this is `validity`, the three shapes excluded
 * structurally (authority below 1, a skin switch, different properties), the
 * second clause and the events clause removed — stands above the `check` call
 * in `validate()`. What a timeline does with `add` is the one fact here that
 * is behaviour rather than a record: it is posed, and the body asks for it
 * (`behaviour`) only for the later timeline of a shared property, once per
 * timeline.
 *
 * Moved out of `src/validate.ts` whole: the sliders, their setup mix, their
 * `additive` flag, the skins that list them, the animations they apply and the
 * properties those animations' timelines register are the rig's, and a
 * document's records state each; the class a timeline's additive application
 * falls in is the core's computation over the document
 * (`src/core/additive.ts`), held to the runtime's probe by the core suite's
 * `CO27`. The words the sentences print are the facts' own: the runtime class
 * a timeline loads as, the property's name, the target as the sentence names
 * it.
 */
import type { Verdicts } from '../harness.ts';
import type { ConstraintFacts } from '../facts/constraints.ts';
import type { AddBehaviour, SliderCompositionFacts, SliderFact, SliderTimelineFact } from '../facts/slider_composition.ts';
import { switchedOn } from '../constraint_words.ts';

export function a40SlidersComposeOnASharedTarget({ fail, skip, stats }: Verdicts, facts: SliderCompositionFacts, constraints: ConstraintFacts): void {
  const sliders = facts.sliders;
  if (sliders.length < 2) {
    return skip(
      'A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET',
      `the skeleton declares ${sliders.length} slider constraint${sliders.length === 1 ? '' : 's'}, and one slider has nothing to compose with`,
    );
  }
  // Clause 1 of the "could this be correct?" list above the check.
  // "Keyed at all" rather than "keyed live", and on purpose: this clause asks
  // whether the mix can MOVE from its setup value, so any mix timeline
  // disqualifies it — the question `keyedBy` answered here, through the one
  // reading `switchedOn` gives (`../constraint_words.ts`, over the same facts
  // the moved constraint bodies read — issue #1025), and unchanged by issue
  // #752.
  const mixKeyed = switchedOn(constraints, (timeline) => timeline.kind === 'slider' && timeline.word === 'mix', 1, () => true);
  const authoritative = sliders.filter((s) => s.mix >= 1 && !mixKeyed.has(s.index));
  if (authoritative.length < 2) {
    return skip(
      'A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET',
      `${authoritative.length} of the ${sliders.length} slider constraints apply at full authority; below mix 1 an ` +
        'apply is a lerp from the current pose rather than an overwrite, so what the others do to a shared property is a weighting',
    );
  }
  /** Which skins switch a slider on, or null when it is active under every skin. */
  const skinsOf = new Map<SliderFact, Set<string> | null>();
  for (const slider of authoritative) skinsOf.set(slider, slider.skinRequired ? new Set(slider.skins) : null);
  /** Clause 2: can these two ever run in the same frame? */
  const canOverlap = (a: SliderFact, b: SliderFact): boolean => {
    const skinsA = skinsOf.get(a) ?? null;
    const skinsB = skinsOf.get(b) ?? null;
    if (!skinsA || !skinsB) return true;
    for (const name of skinsA) {
      if (skinsB.has(name)) return true;
    }
    return false;
  };
  type User = { slider: SliderFact; timeline: SliderTimelineFact; animation: string; at: number; property: string; names: string };
  /** property id -> the sliders whose animation keys it, in constraints-array order. */
  const byProperty = new Map<string, User[]>();
  for (const slider of authoritative) {
    const seen = new Set<string>();
    const animation = slider.animation;
    if (animation === null) continue;
    animation.timelines.forEach((timeline, at) => {
      for (const { id, property, names } of timeline.properties) {
        if (seen.has(id)) continue;
        seen.add(id);
        byProperty.set(id, [...(byProperty.get(id) ?? []), { slider, timeline, animation: animation.name, at, property, names }]);
      }
    });
  }
  /** Posed once per timeline, because the answer is the class's and the rigs that reach here share timelines. */
  const behaviour = new Map<string, AddBehaviour>();
  const addBehaviourOf = (user: User): AddBehaviour => {
    const key = `${user.animation}\u0000${user.at}`;
    const known = behaviour.get(key);
    if (known !== undefined) return known;
    const measured = facts.behaviour(user.animation, user.at);
    behaviour.set(key, measured);
    return measured;
  };
  let shared = 0;
  for (const [, users] of byProperty) {
    if (users.length < 2) continue;
    shared++;
    const at = (slider: SliderFact): string => `"${slider.name}" (constraints[${slider.index}], additive: ${String(slider.additive)})`;
    const chain = users.map((u) => at(u.slider)).join(', ');
    for (let j = 1; j < users.length; j++) {
      const later = users[j];
      const composes = addBehaviourOf(later);
      if (composes === 'accumulates' && later.slider.additive) continue;
      // Nothing a second slider could take away: applied with the arguments
      // a slider passes — `firedEvents` null among them — this timeline
      // moves no pose at all.
      if (composes === 'inert') continue;
      const erased = users.slice(0, j).filter((e) => canOverlap(e.slider, later.slider));
      if (!erased.length) continue;
      const erasedNames = `${erased.map((e) => `"${e.slider.name}"`).join(', ')} contribute${erased.length === 1 ? 's' : ''}`;
      const why =
        composes === 'accumulates'
          ? `slider "${later.slider.name}" applies animation "${later.slider.animation?.name}" with additive false, and at ` +
            'mix 1 a non-additive apply writes the value outright (`getRelativeValue` returns `setup + value`, ' +
            '`getAbsoluteValue` returns `value`) rather than adding to the pose it found. Set `"additive": true` on ' +
            `slider "${later.slider.name}" in the rig spec — rigc will not choose that flag for you — or key this ` +
            `property from one slider only. [measured] \`${later.timeline.runtimeClass}.apply\` posed twice with ` +
            '`add` set accumulates, so that flag is the repair here'
          : `the ${later.property} timeline they share writes its value outright whatever the ` +
            `flags say — [measured] \`${later.timeline.runtimeClass}.apply\` posed twice with \`add\` set left the ` +
            'same value there rather than adding to it — so `"additive": true` would NOT compose these. Key this ' +
            'property from one slider only, or move both edits into the one animation a single slider applies';
      fail(
        'A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET',
        `${later.names} is keyed by the animations of ${users.length} sliders — ${chain} — and every ` +
          `one of them applies at mix 1. Today ${at(later.slider)} wins that property and ${erasedNames} ` +
          `nothing to it: ${why}.`,
      );
    }
  }
  stats.sliderSharedTargets = shared;
}
