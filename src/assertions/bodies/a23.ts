/**
 * A23, the body (issue #1025, step 4c of #380): a physics constraint that
 * does nothing, quietly — at its setup pose, and on every physics key.
 *
 * Moved out of `src/validate.ts` whole: every clause is about the rig — the
 * components a constraint drives, its four bounded setup values, its `fps`,
 * every value a physics timeline keys and what switches a muted constraint on
 * — and a document's constraint and timeline records state each. Nothing it
 * reads is the encoding's. The values are the ones the runtime holds after
 * its parse, through the facts (`../facts/constraints.ts`): a field left out
 * at the parser's value, `massInverse` = `1 / mass`, `step` = `1 / fps`, a
 * key's time and value as float32, a key's value as the pose field it lands
 * in (`posed`), and the constraints a timeline naming none reaches.
 */
import type { Verdicts } from '../harness.ts';
import type { ConstraintFacts, PhysicsSetup } from '../facts/constraints.ts';
import type { MeshFacts } from '../facts/mesh_attachments.ts';
import { noneKeysItsMixAbove0, PHYSICS_COMPONENTS, REST_OR_KEY_ITS_MIX, switchedOn } from '../constraint_words.ts';
import { SKIP_NO_PHYSICS_CONSTRAINT } from '../reasons.ts';
import {
  PHYSICS_POSE_RULES,
  physicsBasisFor,
  physicsBasisSays,
  physicsKeyRefusal,
  physicsOutsideSays,
  physicsRuleFor,
  type PhysicsPoseRule,
} from '../../timelines.ts';

/**
 * What A23 says about a SETUP pose outside its bound, per property.
 *
 * The predicate lives in `PHYSICS_POSE_RULES` and the sentence lives here, and
 * the split is deliberate: the predicate is the thing the compiler and this file
 * must not disagree about, while the sentence names what happens to THIS rig —
 * "it is muted", "nothing pulls it back" — which is what the author acts on and
 * is worth nothing to a compiler refusing a key. `PHYSICS_POSE_RULES` is the
 * index, so a rule added there with no sentence here fails to type-check rather
 * than printing `undefined`.
 *
 * ⚠️ These are the SETUP pose's sentences and nothing else, which matters on the
 * two rows whose keyed bound is wider than their resting one — `mix` since issue
 * #610 and `strength` since #727. A key of 0 on either is accepted, so "it is
 * muted" and "nothing pulls it back" are read here by a rig that states the
 * number at rest, and what a key is refused with is the row's own `why`.
 *
 * `animations` is how many animations the skeleton declares, and only the `mix`
 * sentence reads it: that bound is the one a key can satisfy instead of the
 * setup pose (`inertAtSetup`, issue #743), so the refusal has to say that the
 * other half was looked for and how wide the search was. A rig with no animation
 * at all then says "none of the 0 animations" rather than implying somebody
 * keyed something.
 *
 * `rule` is the row the value was judged by, and every sentence reads it: the
 * reason each prints is the row's `basis` arm for the value (issue #798), the
 * same object the key's sentence quotes, so what the setup pose and a key say
 * about one number is one text — and whether that reason is the runtime's
 * arithmetic or rigc's call is stated rather than implied.
 */
const SETUP_POSE_SAYS: Record<string, (pose: PhysicsSetup, animations: number, rule: PhysicsPoseRule) => string> = {
  // Every reason below is the row's `basis` arm for the value (issue #798): an
  // arithmetic arm names its expression, a behavioural one says refusing it is
  // rigc's call and what the value does. ⚠️ Until then a setup mix BELOW 0 was
  // told "it is muted", which it is not — [measured] it moves the bone by
  // exactly −1× what +0.5 does — so the two ways out print two sentences.
  mix: (pose, animations, rule) =>
    `has mix ${pose.mix} and ${noneKeysItsMixAbove0(animations)}; ${setupBasisSays(rule, pose.mix)} — ${REST_OR_KEY_ITS_MIX}`,
  mass: (pose, _animations, rule) => `has massInverse ${pose.massInverse}; mass must be ${rule.states} — ${setupBasisSays(rule, pose.massInverse)}`,
  // Two arms, read off the row (issue #748): 0 is a constraint nothing pulls
  // back and below 0 one that is pushed away, and the row's `why` — the key's
  // sentence — quotes the second from the same object. The basis sentence ends
  // on the arm's own words, which `T100` holds.
  strength: (pose, _animations, rule) => `has strength ${pose.strength}; ${setupBasisSays(rule, pose.strength)}`,
  // The bound is read off the row, so the setup pose and a key cannot state two
  // intervals; the reason is the arm the value took, since the ends are inside (#794).
  damping: (pose, _animations, rule) =>
    `has damping ${pose.damping}; must be ${rule.states} — the per-step decay is \`damping ** (60 * step)\`, and ` +
    setupBasisSays(rule, pose.damping),
};

/**
 * The basis sentence for a setup value, or the bound itself where no arm holds
 * — a pose value the parser handed over that none of the row's arms is about
 * (a NaN, say), which has no reason to give and must not borrow another's.
 */
function setupBasisSays(rule: PhysicsPoseRule, poseValue: number): string {
  const arm = physicsBasisFor(rule, poseValue);
  return arm === undefined ? physicsOutsideSays(rule, poseValue) : physicsBasisSays(arm);
}

// Every failure mode here is silent. The five component fields default to
// 0, so a constraint can drive nothing at all; `mix` 0 mutes it; `mass` 0
// becomes an infinite massInverse; and `damping` above 1 never settles, which
// on a mesh-driving bone means the canvas re-rasterises forever. 1 itself is
// inside the bound since issue #794: it never decays, which is finite and a
// choice, and what it costs a consumer's frame is the consumer's to judge.
//
// 🔑 **Two arms, one criterion.** The second arm below reads every physics
// TIMELINE key, and it is written against `PHYSICS_POSE_RULES` — the table
// this one is also written against, and the table `compileValueTrack`
// refuses a spec's own out-of-range number with. Three readings of one rule
// is how two of them come to disagree, so there is one (issue #610).
export function a23PhysicsConstraintEffective({ fail, skip, stats }: Verdicts, facts: ConstraintFacts, meshFacts: MeshFacts): void {
  // ⟨subject⟩_⟨property⟩, and its two siblings already read this way: A36
  // skips on "the skeleton declares no path constraint" and A37 on "no
  // slider constraint", while this one passed over an empty filter (#580).
  // The stat is written before the guard so a reader of a SKIP still sees
  // the count that produced it.
  stats.physicsConstraints = facts.constraints.filter((c) => c.physics !== undefined).length;
  if (stats.physicsConstraints === 0) return skip('A23_PHYSICS_CONSTRAINT_EFFECTIVE', SKIP_NO_PHYSICS_CONSTRAINT);
  const meshBoneNames = new Set<string>();
  for (const mesh of meshFacts.meshes) meshBoneNames.add(mesh.slotBone);
  for (const mesh of meshFacts.meshes) {
    if (!mesh.weights) continue;
    for (const vertex of mesh.weights) {
      for (const { bone: index } of vertex) {
        const bone = meshFacts.bones[index];
        if (bone !== undefined) meshBoneNames.add(bone);
      }
    }
  }
  // --- which constraints an animation switches ON (issue #743) ----------
  //
  // 🔑 The setup pose is the rig AT REST, and one of the four bounds is a
  // state rather than a break there: `PHYSICS_POSE_RULES` marks `mix`
  // `inertAtSetup`, because `update` opens with `if (mix === 0) return;`
  // (`PhysicsConstraint.js:109-111`) and nothing else in the pose has such a
  // branch. So a constraint that rests muted and is keyed above 0 by an
  // animation is a rig the runtime plays as authored, and refusing it would
  // refuse a design: physics off at rest, switched on by the animation that
  // needs it.
  //
  // 📏 Measured on a generated physics fixture, 36 steps at 60 fps with the
  // constraint's own bone swung by its parent: resting at `mix` 0 with an
  // animation keying `mix` to 1 poses the bone IDENTICALLY to the same rig
  // resting at 1 (max |dx| 0.000000) and up to 7.771177 away from the twin
  // that keys nothing — which poses identically to one keyed to 0 only
  // (max |dx| 0.000000). Two states, and the file says which.
  //
  // ⚠️ The escape is the rule's own field rather than the word "mix": a
  // setup `mass` of 0 is `massInverse` Infinity BEFORE anything plays, and
  // [measured] at rest it reads NaN on every frame although an animation
  // keys `mass` to 1. A key cannot rescue a value that has already broken
  // the rig it is resting in.
  //
  // The keys are read by `switchedOn`, the one reading A36 and A37 share
  // (issue #752), through the runtime's own accessor: the pose field is
  // where the integrator reads the number, and for `mass` that is not the
  // number the key states. It counts the unnamed global form through the
  // timeline's reach and a Bezier segment's samples as well as its keys.
  const unmuted = new Map<number, Set<string>>();
  for (const rule of PHYSICS_POSE_RULES) {
    if (!rule.inertAtSetup) continue;
    const reached = switchedOn(
      facts,
      (timeline) => timeline.kind === 'physics' && timeline.word === rule.timeline,
      1,
      (timeline, value) => rule.poseOk(timeline.posed === undefined ? value : timeline.posed(value)),
    );
    facts.constraints.forEach((one, index) => {
      if (one.physics === undefined || !reached.has(index)) return;
      const by = unmuted.get(index) ?? new Set<string>();
      by.add(rule.timeline);
      unmuted.set(index, by);
    });
  }
  let mutedUntilKeyed = 0;
  facts.constraints.forEach((constraint, index) => {
    const physics = constraint.physics;
    if (physics === undefined) return;
    const where = `physics "${constraint.name}"`;
    const components = PHYSICS_COMPONENTS.filter((k) => physics.components[k] > 0);
    if (!components.length) {
      fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} drives no component; it parses and does nothing`);
    }
    const pose = physics.setup;
    // The four bounded fields, each judged by its `PHYSICS_POSE_RULES` row.
    // The wording is per-field and stays so: "it is muted" and "nothing
    // pulls it back" say what happens to THIS rig, which is what the author
    // needs, and the shared table supplies the predicate rather than the
    // sentence.
    for (const rule of PHYSICS_POSE_RULES) {
      if (rule.poseOk(pose[rule.field])) continue;
      if (rule.inertAtSetup && unmuted.get(index)?.has(rule.timeline)) {
        mutedUntilKeyed++;
        continue;
      }
      const drivesAMesh = rule.timeline === 'damping' && meshBoneNames.has(physics.bone);
      fail(
        'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
        `${where} ${SETUP_POSE_SAYS[rule.timeline](pose, facts.animations, rule)}` +
          (drivesAMesh ? ' — and this bone drives a mesh, so the canvas never rests' : ''),
      );
    }
    if (physics.step <= 0 || !Number.isFinite(physics.step)) {
      fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has step ${physics.step} (fps must be > 0)`);
    }
  });
  // What the PASS would otherwise not say: this rig rests with physics off
  // on that many constraints and an animation is what switches them on. A
  // pass carries no detail — `passed` is a list of names — so `stats` is the
  // channel that exists, and a number is what belongs in a line printed as
  // `k=v`: naming every such constraint and the animations that reach it
  // would be a paragraph on one line, and the rig where nobody meant it is
  // the rig where the NUMBER is the surprise. Absent rather than 0 when
  // nothing rests muted, so it appears only where it says something.
  if (mutedUntilKeyed) stats.physicsMutedUntilKeyed = mutedUntilKeyed;

  // --- the same criterion, on every physics timeline key (issue #610) ----
  //
  // The arm above reads the setup pose and, until this one existed, nothing
  // else — complete while a motion spec could key `mix` and `reset` only,
  // and incomplete from #593 on, when it became able to key all seven.
  //
  // 📏 Measured on the tree before this landed, one keyed value at a time on
  // a generated physics rig, 24 steps at 60 fps: `mass: 0` reached
  // `massInverse` Infinity and every offset NaN — named by
  // `A10_NO_NAN_AFTER_STEPPING`, from the BONE, with no word about the
  // animation, the constraint, the timeline or the key; `damping: 2` ran the
  // x offset to −26,634 and the velocity to −1.55e6 and still climbing, with
  // **zero** gate failures; `strength: 0` drifted monotonically with zero gate
  // failures; `mix: 1.5` produced zero gate failures and an integration
  // identical to `mix: 1`, because mix multiplies the finished offset onto
  // the bone and never enters the solve.
  //
  // ⭐ The value is judged where the runtime keeps it, not where the file
  // writes it: `posed` is the number the runtime's own accessor writes, so a
  // `mass` key lands as its reciprocal and is then held to exactly the
  // predicate the setup arm holds `massInverse` to.
  let keysRead = 0;
  for (const timeline of facts.timelines) {
    // A `reset` timeline keys no value, and was never one of the seven the pose holds.
    if (timeline.kind !== 'physics' || timeline.word === 'reset') continue;
    const name = timeline.word;
    const rule = physicsRuleFor(name);
    // -1 is the global form: the timeline drives every physics constraint
    // whose matching `…Global` flag is set, so there is no one name to give.
    const target =
      timeline.constraint === -1
        ? 'every physics constraint'
        : `physics "${facts.constraints[timeline.constraint]?.name ?? `#${timeline.constraint}`}"`;
    for (const frame of timeline.frames) {
      keysRead++;
      if (rule === undefined) continue;
      const value = frame.value;
      const refusal = physicsKeyRefusal(rule, value, timeline.posed === undefined ? undefined : timeline.posed(value));
      if (refusal === null) continue;
      fail(
        'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
        `animation "${timeline.animation}" ${target} ${name} key at t=${frame.time.toFixed(6)}s is ${refusal}`,
      );
    }
  }
  stats.physicsTimelineKeys = keysRead;
}
