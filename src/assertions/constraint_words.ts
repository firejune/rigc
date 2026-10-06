/**
 * What the constraint bodies share (issue #1025, step 4c of #380): the one
 * reading of "does an animation switch this on", the one predicate a path or
 * slider mix is judged by, the physics components, and the sentences A23,
 * A36, A37, A47 and A48 say alike. Moved here from `src/validate.ts`, each
 * unchanged but for what `switchedOn` reads — the facts
 * (`./facts/constraints.ts`) rather than the loaded timelines — because the
 * bodies that read them moved, and a second copy is how two rules come to
 * disagree. `src/validate.ts` imports what A40 still reads.
 *
 * Links nothing from the runtime.
 */
import type { ConstraintFacts, ConstraintTimeline } from './facts/constraints.ts';
import type { RigInfo } from '../types.ts';

/**
 * Every component a physics constraint can drive (`PhysicsConstraintData`), the
 * vocabulary A23 reads when it asks whether a constraint drives anything.
 *
 * 📏 It stood beside a second set, the components "the Spine editor models",
 * read by A41 (the editor round-trip rule) and measured in issue #540 as
 * `x` and `y`. Issue #1196 measured what that was really seeing, on Spine 4.3.23
 * and 4.3.26: the editor imports a physics constraint's `rotate`, `scaleX` and
 * `shearX` into its project and its JSON and binary exports omit them **only on
 * a bone with no length** — on any bone with a length (0.01, 1, 40 tried) all
 * three come back, and the editor's own example export keeps 18 of 18 `rotate`
 * constraints through the same trip. A23 refuses those components on a
 * zero-length bone (issue #1195), so a rig that passes it has nothing the editor drops, and
 * A41, its declaration and its set were retired rather than reworded.
 */
export const PHYSICS_COMPONENTS = ['x', 'y', 'rotate', 'scaleX', 'shearX'] as const;

/**
 * The half of a muted-at-rest refusal that says what was searched, and how
 * widely — one text for `A23`, `A36` and `A37`, which ask one question of three
 * constraint kinds (issues #743, #752). A rig with no animation at all says
 * "none of the 0 animations" rather than implying somebody keyed something.
 */
export function noneKeysItsMixAbove0(animations: number): string {
  return `none of the ${animations} animation${animations === 1 ? '' : 's'} keys its mix above 0`;
}

/** The two repairs a muted-at-rest refusal names, since either one is a rig the runtime plays. */
export const REST_OR_KEY_ITS_MIX = 'rest it above 0, or key its mix above 0 in an animation';

/**
 * The one predicate a path or slider mix is judged by, at setup and on every
 * value a key poses: above 0, where `update()` does anything at all.
 */
export const mixLive = (value: number): boolean => value > 0;

/**
 * 🔑 **An ik or transform mix is live by the runtime's own test, `!== 0`, and
 * not `mixLive`'s `> 0`.** `IkConstraint.update` returns on `mix === 0` and a
 * transform's inner loop applies a property only when `to.mix(pose) !== 0`, so
 * a negative mix runs. That is not a corner: [measured] five transform
 * constraints across four of the editor's own example exports rest at mixX =
 * mixY = −1, nothing keys them, and each moves its bones at setup against the
 * same constraint with every mix 0. A `> 0` reading refuses all five.
 * (`A36`/`A37` still read `> 0` — a path or slider resting negative is a
 * question for their own card.)
 */
export const ikLive = (value: number): boolean => value !== 0;

/**
 * The constraints some animation keys to a value `live` accepts, on any of the
 * first `channels` channels of a timeline `owns` claims — the one answer to
 * "does anything switch this on" for `A23`, `A36`, `A37`, `A40`, `A47` and
 * `A48` (issues #743, #752), as positions in `facts.constraints`.
 *
 * ⭐ It replaced `keyedBy`, which read the raw JSON and took a non-empty key
 * array as the answer, and it did so rather than teaching that one to read
 * values, because the raw file is the wrong place to read a value: a path
 * `mix` key that omits `mixRotate` means 1 (`SkeletonJson.js:1011-1013`), a
 * `mixY` it omits means that key's `mixX`, and a Bezier between two keys
 * poses values neither key states. So this reads every value a channel poses
 * — each key's own and every sample of each Bézier segment the parser built
 * between two keys (`ConstraintTimeline.channelValues`): spine-core's loaded
 * timelines on one side, the core's reading of the document on the other.
 * [measured] the reading `keyedBy` gave was wrong in the accepting
 * direction: a path constraint and a slider, both muted at rest and keyed to
 * 0 only, pose every bone exactly where the same rig with no timeline does
 * (max |Δ| 0.000000 over 60 steps at 60 fps) and both passed.
 *
 * A timeline naming no constraint is the physics family's global form, and
 * its `reach` says who it writes; every other constraint timeline names its
 * one constraint.
 *
 * `live` is handed the channel as well as the value, because not every
 * channel of every constraint timeline is a mix (issue #765): an ik frame is
 * mix, softness, bend direction, compress and stretch, so a bend direction of
 * +1 is not a key that switches anything on, and a transform frame carries
 * six mixes of which only the ones for a property the constraint drives are
 * ever read. `channels` is how many leading channels the caller's `live` can
 * accept a value on.
 */
export function switchedOn(
  facts: ConstraintFacts,
  owns: (timeline: ConstraintTimeline) => boolean,
  channels: number,
  live: (timeline: ConstraintTimeline, value: number, channel: number) => boolean,
): Set<number> {
  const reached = new Set<number>();
  for (const timeline of facts.timelines) {
    if (!owns(timeline)) continue;
    let keysLive = false;
    for (let channel = 0; channel < channels && !keysLive; channel++) {
      keysLive = timeline.channelValues(channel).some((value) => live(timeline, value, channel));
    }
    if (!keysLive) continue;
    for (const one of timeline.reach) reached.add(one);
  }
  return reached;
}

// 🔑 **The third door: the consumer drives the mix (issue #784).** A muted
// constraint nothing in the file switches on is either a leftover or a dial
// a game turns from code, and the two export as the same bytes — so the rig
// spec says which, in `invariants.consumerDrivenMix`, and a declared
// constraint is not measured by `A47` / `A48`. What that buys is never a pass
// on it:
//
//   * every constraint of the kind declared — nothing is left to measure, so
//     the rule SKIPs, naming each constraint, the declaration and its `why`;
//   * some declared and some not — the rest are measured, and the declared
//     ones go on the stats line, which is `A39`'s shape for `deformMayFold`.
//     A SKIP there would put "nothing measured" over a rule that measured,
//     and the summary would count a measured rule as skipped (`reportLines`'
//     four buckets partition the registry, one row per rule).
//
// ⛔ A declared constraint the file ALSO switches on — resting live, or keyed
// above 0 — is refused: the declaration exempts nothing there, which is the
// shape `deformMayFold` on a slot with no mesh is refused for. [measured]
// (`scratchpad/consumerdriven_runtime.ts`) an ik keyed at mix 0.5 with code
// writing 1: code before `state.apply` is overwritten (applied mix 0.5),
// code after it wins (1.0) — so which author holds a frame is the order of
// the consumer's own loop, a fact about the scene rather than the object.

/** The rig's consumer-driven declarations of one kind: constraint name -> why. */
export function consumerDriven(rig: RigInfo | undefined, type: 'ik' | 'transform'): Map<string, string> {
  return new Map((rig?.consumerDrivenMix ?? []).filter((e) => e.type === type).map((e) => [e.constraint, e.why]));
}

/** The third repair a muted-throughout refusal names. */
export function declareIt(type: 'ik' | 'transform', name: string): string {
  return (
    `or declare that the consumer drives its mix, in the rig spec as invariants.consumerDrivenMix: ` +
    `[{ "constraint": "${name}", "type": "${type}", "why": … }]`
  );
}

/** The refusal of a declaration that exempts nothing. */
export function declaredButLive(where: string, how: string): string {
  return (
    `${where} is declared in the rig spec as invariants.consumerDrivenMix, and the file already switches it on — ` +
    `${how} — so the declaration exempts nothing; drop the entry. Where code also sets that mix, which of the two ` +
    'holds on a frame is the order of the consumer\'s own loop: `state.apply` overwrites a mix written before it, ' +
    'and a mix written after it replaces the key'
  );
}

/** The SKIP when every constraint of the kind is declared consumer-driven. */
export function consumerSkip(kind: string, exempt: Array<[string, string]>, animations: number): string {
  return (
    `every ${kind} constraint here is declared in the rig spec as invariants.consumerDrivenMix, so its mix is the ` +
    `consumer's to set and nothing in this file shows it moving — ${exempt.map(([name, why]) => `"${name}" (why: ${why})`).join('; ')}: ` +
    `${exempt.length === 1 ? 'it rests' : 'each rests'} muted and ${noneKeysItsMixAbove0(animations)}`
  );
}
