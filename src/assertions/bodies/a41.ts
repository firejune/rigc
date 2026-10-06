/**
 * A41, the body (issue #1025, step 4c of #380): a physics component the Spine
 * editor cannot hold, refused on a rig declared for the editor.
 *
 * 🚨 The silence this converts is not in the artifact — it is one consumer
 * downstream of it. An author builds a rig whose cowlick jiggles, opens it
 * in the editor to move an eyebrow, saves, exports, and the hair has stopped
 * moving. The returned file says nothing: the component is simply absent,
 * and absent parses as 0. `gallery/look` is exactly that rig.
 *
 * 🔑 **rigc's output is correct, so the refusal is opt-in.** `rotate` on a
 * physics constraint is valid Spine 4.3 that every runtime plays, and
 * refusing it by default would be refusing correct data on behalf of a
 * pipeline rigc was never told about. What rigc can see is the object; which
 * consumers it is for is the rig's to say, and it says it with
 * `invariants.editorRoundTrip` (`src/rig.ts`).
 *
 * ⚠️ **The SKIP is the other half of the product and is not a shrug.** A rig
 * that declares nothing is not gated — but the reason names the constraint
 * and the components a round trip would drop, so the one thing that must not
 * happen (nobody finds out) does not happen either. That is why this reads
 * the whole skeleton before it reads the declaration, rather than returning
 * early on a rig that asked for nothing.
 *
 * 🔸 **Against A23, on the far side of the same trip.** A23 refuses a
 * constraint driving NOTHING — which is what the editor hands back, after
 * the loss — and it is what fires today on a round-tripped `look`. This
 * refuses a constraint driving something the editor will not keep, before
 * the trip. A23's *drives no component* clause and this rule cannot both
 * fire on one constraint: that clause's condition is an empty driven set and
 * this one's is a non-empty one (see `PHYSICS_COMPONENTS`), so the two are
 * disjoint by construction rather than by agreement. A23's length clause
 * (issue #1195) can name the same constraint as this rule, for a different
 * fact: the bone it sits on has no length, which no round trip changes.
 *
 * Moved out of `src/validate.ts` whole: the components are the document's
 * physics records, the declaration the rig's.
 */
import type { Verdicts } from '../harness.ts';
import type { ConstraintFacts } from '../facts/constraints.ts';
import { EDITOR_PHYSICS_COMPONENTS, PHYSICS_COMPONENTS } from '../constraint_words.ts';
import type { RigInfo } from '../../types.ts';

export function a41PhysicsSurvivesEditorRoundTrip({ fail, skip }: Verdicts, facts: ConstraintFacts, rig: RigInfo | undefined): void {
  // Counted here rather than read off `stats.physicsConstraints`: that entry
  // is written by A23, and a rule whose SKIP depends on another rule having
  // run is a rule that reports "nothing to measure" when its neighbour threw.
  const physics = facts.constraints.flatMap((c) => (c.physics === undefined ? [] : [{ name: c.name, components: c.physics.components }]));
  const dropped: string[] = [];
  for (const constraint of physics) {
    const lost = PHYSICS_COMPONENTS.filter((k) => constraint.components[k] > 0 && !EDITOR_PHYSICS_COMPONENTS.has(k));
    if (lost.length) dropped.push(`physics "${constraint.name}" drives ${lost.join(', ')}`);
  }
  const editorKeeps = [...EDITOR_PHYSICS_COMPONENTS].join(' and ');
  const found =
    dropped.length === 0
      ? 'no physics constraint here drives a component it would discard'
      : `${dropped.join('; ')}, and the editor's physics model holds ${editorKeeps} only, so a round trip ` +
        'returns that constraint driving nothing at all (issue #540)';
  if (rig?.editorRoundTrip !== true) {
    return skip(
      'A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP',
      `${
        rig
          ? `the rig "${rig.archetype}" does not declare \`invariants.editorRoundTrip\``
          : 'this is a bare directory, with no rig info to declare `invariants.editorRoundTrip`'
      }, so nothing here is gated against the Spine editor. What is here: ${found}`,
    );
  }
  if (physics.length === 0) {
    return skip(
      'A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP',
      `the rig "${rig.archetype}" is declared for the editor, but it carries no physics constraint — ` +
        'there is nothing here whose components could be lost',
    );
  }
  for (const one of dropped) {
    fail(
      'A41_PHYSICS_SURVIVES_EDITOR_ROUND_TRIP',
      `${one}; the editor's physics model holds ${editorKeeps} only, and this ` +
        'rig declares `invariants.editorRoundTrip` — drive it in x/y, or drop the declaration if this rig never ' +
        'goes through the editor (issue #540)',
    );
  }
}
