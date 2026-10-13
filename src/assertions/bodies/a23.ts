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
  physicsStepStability,
  type PhysicsPoseRule,
  type PhysicsStepStability,
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
  // intervals; the reason is the arm the value took — above 1, at 1 (issue
  // #1422, inside from #794 until then) or below 0.
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
// becomes an infinite massInverse; and `damping` at or above 1 never settles,
// which on a mesh-driving bone means the canvas re-rasterises forever. 1 itself
// was inside the bound from issue #794 to #1422, as a jiggle held rather than a
// fault; it is out because a decay of 1 puts the step's eigenvalues on the unit
// circle, and a chain of such links was measured resonating without limit.
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
  // Each constraint whose setup values the stability clause read, by position — the
  // floor every animation's combination is taken from below.
  const setupCombos = new Map<number, StabilityCombo>();
  facts.constraints.forEach((constraint, index) => {
    const physics = constraint.physics;
    if (physics === undefined) return;
    const where = `physics "${constraint.name}"`;
    const components = PHYSICS_COMPONENTS.filter((k) => physics.components[k] > 0);
    if (!components.length) {
      fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} drives no component; it parses and does nothing`);
    }
    // --- a lever drive on a bone with no lever (issue #1195) ---------------
    //
    // `rotate`, `shearX` and `scaleX` are stepped off the bone's tip,
    // `length·(a, c)` (`stepPhysics` in `src/core/constraints_physics.ts`,
    // held to spine-core at tolerance 0); `x` and `y` read only the origin, so
    // they are not refused here — the editor's own example exports and
    // rigc's public builds carry them on bones of length 0 and they step as
    // authored. The two lever readings fail in opposite directions, so they
    // print two sentences:
    //
    // 📏 rotate / shearX: the offset chases `atan2(dy + ty, dx + tx)`, and with
    // no tip and no motion that is `atan2(0, 0)` = 0 — a WORLD direction —
    // where any tip at all makes it the bone's own previous direction.
    // Measured through the core on a four-bone chain held still for 3 s
    // (inertia 0.5, strength 100, damping 0.85, weight 0.2794): at length 0
    // the bone turns 26.602° from a 45° rest, 53.204° from 90°, 106.408° from
    // 180°, and holds there; at length 0.01 it moves 0.0000. The swing under
    // motion, by contrast, is continuous in the length (0.914° at 36.5 up to
    // 64.934° at 0 on one bounce) — that is the author's tuning, not a defect,
    // and this clause does not judge it.
    //
    // ⚠️ The rest ANGLE is not read. The same probe resting at world 0° moves
    // 0.000° at length 0 — but only because the bone already points where the
    // solver aims it. A key that turns the bone, or a parent that turns it,
    // breaks that, so a length-0 bone resting at 0° is the same defect waiting
    // for its first rotation, and refusing it by the angle would refuse a
    // pose rather than a rig.
    //
    // 📏 scaleX: the along-bone motion is divided by `length·|x column|` and
    // nothing is added when that is 0, so the drive does nothing — every
    // length-0 rung of the same probe read 0.0000, where 0.01 threw the tip
    // 806 units. It is this assertion's first clause reached through the bone
    // rather than the component fields.
    if (physics.boneLength === 0) {
      const turns = components.filter((k) => k === 'rotate' || k === 'shearX');
      if (turns.length) {
        fail(
          'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
          `${where} drives ${turns.join(' and ')} on bone "${physics.bone}" whose length is 0 — with no tip the solver aims the bone ` +
            `at world angle 0 and holds it there; give "${physics.bone}" a length or drive x/y instead`,
        );
      }
      if (components.includes('scaleX')) {
        fail(
          'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
          `${where} drives scaleX on bone "${physics.bone}" whose length is 0, which the solver divides the motion by, so it drives ` +
            `nothing; give "${physics.bone}" a length`,
        );
      }
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
    // --- the step itself has to settle (issue #1416, part B) ------------------
    //
    // The rows above judge each value against its own interval; this is the one
    // joint condition, `physicsStepStability`'s. It is read only where the rows
    // it combines all hold — a value its own row refuses is named there, and a
    // second line about the same number would be the same fault twice — and
    // only on a constraint that drives something, which the first clause names
    // otherwise.
    if (components.length && stableInputs(pose, physics.step)) {
      const setupCombo: StabilityCombo = {
        strength: { value: pose.strength, from: 'setup' },
        massInverse: { value: pose.massInverse, from: 'setup' },
        damping: { value: pose.damping, from: 'setup' },
      };
      const at = physicsStepStability(pose.strength, pose.massInverse, pose.damping, physics.step);
      if (!at.stable) fail('A23_PHYSICS_CONSTRAINT_EFFECTIVE', `${where} has ${runawaySays(setupCombo, physics.step, at)}`);
      setupCombos.set(index, setupCombo);
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

  // --- the step has to settle on every pose an animation reaches (#1416) ----
  //
  // 🔑 **Which combinations are read.** Per animation and per constraint its
  // `strength`, `mass` or `damping` timelines reach (a named one, or each a
  // global one reaches): the LARGEST strength, the LARGEST massInverse and the
  // SMALLEST damping that animation can pose on that constraint, judged
  // together. A value's candidates are every key and every Bézier sample of
  // every such timeline, as the pose field it lands in (`posed`) — and the
  // setup value as well wherever the animation keys that value not at all, or
  // keys it first after t = 0, because before its first key a timeline poses the
  // setup value. Each extreme is exact for its own value: the runtime moves
  // a value linearly between those points, `massInverse` is monotone in the
  // mass it inverts, and the bound is monotone in damping.
  //
  // ⚠️ The JOINT is an upper bound rather than a time-aligned pose: an
  // animation that raises strength while it raises mass, so the ratio holds,
  // is judged at the larger strength against the smaller mass. That is the
  // conservative direction — no pose this animation reaches is less stable
  // than the combination read — and it was chosen over evaluating the three
  // curves at shared times because the facts carry each curve's values and
  // not its sample times, and because a single held key crossing the bound is
  // already a runaway. A line names which key or setup supplied each value, so
  // a refusal of that kind says so.
  //
  // A combination equal to the setup's is not repeated: the setup line names
  // it already. A value its own row refuses is left out of the extremes — it
  // was named above, by its key.
  const keyed = new Map<string, Map<number, Partial<Record<StabilityWord, Candidate[]>>>>();
  for (const timeline of facts.timelines) {
    if (timeline.kind !== 'physics' || !isStabilityWord(timeline.word)) continue;
    const rule = physicsRuleFor(timeline.word);
    if (rule === undefined) continue;
    const word = timeline.word;
    const values = timeline.channelValues(0);
    const firstTime = timeline.frames[0]?.time ?? 0;
    const candidates: Candidate[] = [];
    // `channelValues` lists each key and then the Bézier samples of the segment
    // it opens, so the next key's value is that key and anything else is the
    // curve leaving the key before it.
    let next = 0;
    for (const value of values) {
      const frame = timeline.frames[next];
      const isKey = frame !== undefined && frame.value === value;
      if (isKey) next++;
      const posedValue = timeline.posed === undefined ? rule.toPose(value) : timeline.posed(value);
      if (physicsKeyRefusal(rule, value, posedValue) !== null) continue;
      candidates.push({
        value: posedValue,
        from: isKey ? `the key at t=${frame.time.toFixed(6)}s` : `the curve after the key at t=${(timeline.frames[next - 1]?.time ?? 0).toFixed(6)}s`,
      });
    }
    const byConstraint = keyed.get(timeline.animation) ?? new Map<number, Partial<Record<StabilityWord, Candidate[]>>>();
    keyed.set(timeline.animation, byConstraint);
    for (const index of timeline.reach) {
      const setup = setupCombos.get(index);
      if (setup === undefined) continue;
      const slot = byConstraint.get(index) ?? {};
      byConstraint.set(index, slot);
      const list = slot[word] ?? [];
      list.push(...candidates);
      // Before the first key the timeline poses the setup value.
      if (firstTime > 0) list.push(setup[STABILITY_FIELD[word]]);
      slot[word] = list;
    }
  }
  for (const [animation, byConstraint] of keyed) {
    for (const [index, slot] of byConstraint) {
      const setup = setupCombos.get(index);
      const physics = facts.constraints[index]?.physics;
      if (setup === undefined || physics === undefined) continue;
      const pick = (word: StabilityWord, worse: (a: number, b: number) => boolean): Candidate => {
        const list = slot[word];
        // A value this animation never keys, or keys only with values refused above, stays at setup.
        if (list === undefined || list.length === 0) return setup[STABILITY_FIELD[word]];
        return list.reduce((best, one) => (worse(one.value, best.value) ? one : best));
      };
      const combo: StabilityCombo = {
        strength: pick('strength', (a, b) => a > b),
        massInverse: pick('mass', (a, b) => a > b),
        damping: pick('damping', (a, b) => a < b),
      };
      if (combo.strength.value === setup.strength.value && combo.massInverse.value === setup.massInverse.value && combo.damping.value === setup.damping.value) continue;
      const at = physicsStepStability(combo.strength.value, combo.massInverse.value, combo.damping.value, physics.step);
      if (at.stable) continue;
      // A decay rounded to 1 by the setup damping itself is the setup line's, whatever else this animation keys.
      if (!(at.d < 1) && at.k < at.bound && combo.damping.from === 'setup') continue;
      fail(
        'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
        `animation "${animation}" can pose physics "${facts.constraints[index]?.name ?? `#${index}`}" at ${runawaySays(combo, physics.step, at)}`,
      );
    }
  }

  // --- strength held at 0 for as long as an animation plays (issue #1422) ---
  //
  // A strength KEY of 0 is accepted (issue #727) because it releases the
  // constraint for a span and a later key pulls the offset back. An animation
  // whose strength timelines pose 0 at EVERY time has no later key: [measured on
  // #1422, x drive, the runtime's default world, spine-core and rigc's core
  // identical bit for bit] the offset grows exactly linearly while it plays —
  // 1.33e4 at 60 s, 5.33e4 at 240 s, 1.33e5 at 600 s — and A10's walk of
  // max(duration, 1) s sees a finite number and passes it.
  //
  // 🔑 **"Every time it plays", not "looped".** Whether an animation loops is
  // not in the artifact: skeleton JSON has no loop flag, the motion spec's
  // `loop` is a player hint the compiler never reads (`MotionAnimation.loop`),
  // and an editor export carries neither — and when it plays, and for how long,
  // is the consumer's. The criterion that needs none of that is the one the
  // runtime makes true either way: looped, the animation never leaves its
  // values; played once, a track holds its last frame, which is 0. So the
  // clause reads the timeline alone — every key and every Bézier sample, as
  // the pose field it lands in, and the first key at t = 0, since before a
  // later first key the timeline poses the setup value, which the strength row
  // holds above 0.
  //
  // Per animation and constraint: when two strength timelines reach one
  // constraint in one animation (a named one and the global one), it is held
  // only if both are — a timeline that lifts it is a later key for the other.
  // A constraint driving nothing is named by the first clause, and one resting
  // at strength 0 or below by its row, so neither is read here.
  const strengthRule = physicsRuleFor('strength');
  const heldAtZero = new Map<string, Map<number, { keys: number; held: boolean }>>();
  for (const timeline of facts.timelines) {
    if (timeline.kind !== 'physics' || timeline.word !== 'strength') continue;
    const first = timeline.frames[0];
    const posed = (value: number): number => (timeline.posed === undefined ? value : timeline.posed(value));
    const held = first !== undefined && first.time <= 0 && timeline.channelValues(0).every((value) => posed(value) === 0);
    const byConstraint = heldAtZero.get(timeline.animation) ?? new Map<number, { keys: number; held: boolean }>();
    heldAtZero.set(timeline.animation, byConstraint);
    for (const index of timeline.reach) {
      const was = byConstraint.get(index);
      byConstraint.set(index, { keys: (was?.keys ?? 0) + timeline.frames.length, held: (was?.held ?? true) && held });
    }
  }
  for (const [animation, byConstraint] of heldAtZero) {
    for (const [index, { keys, held }] of byConstraint) {
      const constraint = facts.constraints[index];
      const physics = constraint?.physics;
      if (!held || constraint === undefined || physics === undefined || strengthRule === undefined) continue;
      if (!PHYSICS_COMPONENTS.some((k) => physics.components[k] > 0) || !strengthRule.poseOk(physics.setup.strength)) continue;
      fail(
        'A23_PHYSICS_CONSTRAINT_EFFECTIVE',
        `animation "${animation}" poses physics "${constraint.name}" strength 0 at every time it plays — ${keys} key(s) from t=0, ` +
          `every one 0 and no curve between them lifting it, so ${physicsOutsideSays(strengthRule, 0)}: a strength key of 0 is ` +
          'accepted for a span because a later key pulls the offset back, and this animation has none, so for as long as it ' +
          'plays, looped or held on its last frame, a push (wind, gravity, the bone moving) carries the offset away and it ' +
          'grows without limit; key strength above 0 somewhere in the animation, or remove the timeline',
      );
    }
  }
}

/** The three timelines whose values the stability clause combines. */
type StabilityWord = 'strength' | 'mass' | 'damping';
const STABILITY_FIELD: Record<StabilityWord, keyof StabilityCombo> = { strength: 'strength', mass: 'massInverse', damping: 'damping' };
function isStabilityWord(word: string): word is StabilityWord {
  return word === 'strength' || word === 'mass' || word === 'damping';
}

/** One value the stability clause read, and where it came from: `setup`, or a key or curve of the animation. */
interface Candidate {
  readonly value: number;
  readonly from: string;
}

/** The three pose values the stability clause judges together. */
interface StabilityCombo {
  readonly strength: Candidate;
  readonly massInverse: Candidate;
  readonly damping: Candidate;
}

/** Whether every value the stability clause combines is inside its own row, so the joint condition is the only one left to read. */
function stableInputs(pose: PhysicsSetup, step: number): boolean {
  if (!(step > 0) || !Number.isFinite(step)) return false;
  return PHYSICS_POSE_RULES.every((rule) => rule.timeline === 'mix' || rule.poseOk(pose[rule.field]));
}

/** A number as an author typed it: `1 / (1 / 45)` prints 45 rather than its last-bit neighbour. */
function plain(value: number): string {
  return String(Number(value.toPrecision(12)));
}

/**
 * The stability clause's sentence: the four authored numbers, `k` and the bound
 * as the runtime forms them, what the step does at that pose, and the four
 * levers that move it back under the bound.
 *
 * ⚠️ One pose fails with `k` under the bound: a damping the row accepts — below
 * 1 — whose decay `damping ** (60 * step)` the runtime's doubles round to exactly
 * 1 (issue #1422: the largest double below 1 does from fps 121 on). That is the
 * damping row's own fault, a velocity that never decays, reached through the
 * rate, so it says so rather than printing a `k` that is under its bound.
 */
function runawaySays(combo: StabilityCombo, step: number, at: PhysicsStepStability): string {
  const src = (c: Candidate): string => (c.from === 'setup' ? '' : ` (${c.from})`);
  const fps = plain(1 / step);
  if (!(at.d < 1)) {
    return (
      `damping ${combo.damping.value}${src(combo.damping)} at fps ${fps} — damping^(60·step) = ${at.d} as the runtime forms it, ` +
      'so although the damping is below 1 no velocity ever decays: the step\'s eigenvalues lie on the unit circle, the fault ' +
      'the damping row refuses 1 for, reached here by rounding; lower damping or lower fps'
    );
  }
  const places = apart(at.k, at.bound, 4);
  return (
    `strength ${combo.strength.value}${src(combo.strength)}, mass ${plain(1 / combo.massInverse.value)} (massInverse ${combo.massInverse.value})${src(combo.massInverse)}, ` +
    `fps ${fps}, damping ${combo.damping.value}${src(combo.damping)} — strength·massInverse·step² = ${at.k.toFixed(places)} must be < ` +
    `2·(1 + damping^(60·step)) = ${at.bound.toFixed(places)}: at or past that bound the step stops settling — one step can ` +
    `multiply the offset by ${at.growth.toFixed(apart(at.growth, 1, 3))} every 1/${fps} s — so a push (wind, gravity, a key, the ` +
    'bone moving) never dies out, and past the bound it grows without limit; lower strength, raise mass, raise fps or raise damping'
  );
}

/**
 * The fewest decimal places, from `min`, at which `a` and `b` print apart — so
 * a value one part in 10⁹ past the bound does not print as equal to it. Two
 * equal numbers print at `min`.
 */
function apart(a: number, b: number, min: number): number {
  if (a === b) return min;
  for (let places = min; places < 17; places++) if (a.toFixed(places) !== b.toFixed(places)) return places;
  return 17;
}
