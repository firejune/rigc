/**
 * Construct 5 of the core, third cut (issue #938, step 2e-iii of issue
 * #380): the physics constraint under `Physics.none` — the oracle's default
 * phase, and the only one the core poses.
 *
 * ## What an unstepped physics constraint contributes: nothing
 *
 * Measured by posing hand-written skeletons through `tools/pose_oracle.ts
 * dump` (spine-core 4.3.13, `--skin all`, `--physics none`) twice — once as
 * written, once with every physics constraint and every physics timeline
 * taken out — and comparing the two dumps at tolerance 0:
 *
 * - 400 one-constraint skeletons: the constrained bone in all five inherit
 *   modes under a reflecting, sheared, scaled parent, with amplifier bones ten
 *   thousand units out along its axes; each of the five components (`x`, `y`,
 *   `rotate`, `scaleX`, `shearX`) at 1, between 0 and 2 or negative; `limit`,
 *   `fps`, `inertia`, `strength`, `damping`, `mass`, `wind`, `gravity` and
 *   `mix` at random, each `…Global` flag at random; half of them with
 *   physics timelines keying `mix`, `wind` and `reset` in an animation that
 *   also swings the parent — sampled at seven `grid` or `irr` times, every
 *   sample posed on the ONE skeleton the dump reuses: **400 of 400
 *   identical**.
 * - 462 nine-bone rigs whose two to six constraints mix physics constraints
 *   with ik and world- and local-space transform constraints in random order
 *   (so a physics constraint sits between a world-space edit and a constraint
 *   that re-poses it), physics timelines keying `mix` and `inertia`, five
 *   `irr` samples: **462 of 462 identical**, 41,577 bone-samples.
 *
 * So under `Physics.none` the physics constraint neither moves its bone nor
 * re-poses anything below it, whatever its parameters, its `mix` or its
 * timelines, and wherever it stands in the update order: the core reads its
 * record (so a malformed one is still refused by name) and applies nothing.
 * `tools/pose_oracle.ts`'s header said the same in one sentence ("they hold
 * the bones where the animation left them"); this is its measurement.
 *
 * ⚠️ **What this does not cover is the stepped phase** — `--physics step`,
 * `Physics.reset` then `Physics.update` at a fixed `dt` — where the constraint
 * integrates and its parameters are the whole of its behaviour. The core
 * refuses that option by name and the oracle's `physics` parameter block stays
 * absent from the core's dump; both are the stepped-physics card's.
 *
 * ## Purity
 *
 * As the rest of the core: nothing from the Spine runtime package, nothing
 * from `src/transform.ts`, no clock, no randomness, no I/O.
 */

/** The fields a physics constraint's record may carry after `kind`, `name`, `declaredIn` — the rig branch of `buildRigConstraint` and the motion spec's physics table (`src/compile.ts`). */
export const PHYSICS_FIELDS = [
  'bone', 'scaleY', 'x', 'y', 'rotate', 'scaleX', 'shearX', 'limit', 'fps', 'inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix',
  'inertiaGlobal', 'strengthGlobal', 'dampingGlobal', 'massGlobal', 'windGlobal', 'gravityGlobal', 'mixGlobal', 'skin',
] as const;
const PHYSICS_NUMBERS = ['x', 'y', 'rotate', 'scaleX', 'shearX', 'limit', 'fps', 'inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix'] as const;
const PHYSICS_FLAGS = ['inertiaGlobal', 'strengthGlobal', 'dampingGlobal', 'massGlobal', 'windGlobal', 'gravityGlobal', 'mixGlobal', 'skin'] as const;
/** The `scaleY` modes, first letter in either case (the ik constraint's enum, which a physics constraint shares). */
const SCALE_Y_MODES = ['none', 'uniform', 'volume'] as const;

/** A physics constraint, as far as `Physics.none` reads it: its name and bone. Every other field is checked and left unposed. */
export interface CorePhysicsRecord {
  kind: 'physics';
  name: string;
  bone: string;
  skin: boolean;
}

/**
 * A physics constraint's record, read field by field — every field the writer
 * can write for the kind and no other, each of its type, its bone a bone of
 * the document — or `undefined` with the problems named.
 */
export function readPhysicsRecord(raw: Record<string, unknown>, name: string, where: string, bones: ReadonlySet<string>, problems: string[]): CorePhysicsRecord | undefined {
  const before = problems.length;
  for (const key of Object.keys(raw)) {
    if (key === 'kind' || key === 'name' || key === 'declaredIn') continue;
    if (!(PHYSICS_FIELDS as readonly string[]).includes(key)) problems.push(`${where}: field "${key}" is not one this reader knows; it reads [${PHYSICS_FIELDS.join(', ')}]`);
  }
  if (typeof raw.bone !== 'string' || !bones.has(raw.bone)) problems.push(`${where}: bone is ${JSON.stringify(raw.bone)}, not a bone of this document`);
  for (const key of PHYSICS_NUMBERS) {
    const v = raw[key];
    if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a finite number`);
  }
  for (const key of PHYSICS_FLAGS) {
    const v = raw[key];
    if (v !== undefined && typeof v !== 'boolean') problems.push(`${where}: ${key} is ${JSON.stringify(v)}, not a boolean`);
  }
  if (raw.scaleY !== undefined) {
    const folded = typeof raw.scaleY === 'string' && raw.scaleY.length > 0 ? raw.scaleY[0].toLowerCase() + raw.scaleY.slice(1) : '';
    if (!(SCALE_Y_MODES as readonly string[]).includes(folded)) problems.push(`${where}: scaleY is ${JSON.stringify(raw.scaleY)}, none of ${SCALE_Y_MODES.join(', ')}`);
  }
  if (problems.length !== before) return undefined;
  return { kind: 'physics', name, bone: raw.bone as string, skin: raw.skin === true };
}

/**
 * How many physics timelines one animation record's `constraints.physics`
 * holds — read for the census only: under `Physics.none` a physics timeline
 * poses nothing (the header's measurement keyed `mix`, `wind`, `inertia` and
 * `reset`). Their key times still set the animation's duration, which
 * `./animation.ts` reads.
 */
export function physicsTimelineCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  let n = 0;
  for (const entry of value) {
    if (typeof entry === 'object' && entry !== null && Array.isArray((entry as { timelines?: unknown }).timelines)) n += (entry as { timelines: unknown[] }).timelines.length;
  }
  return n;
}
