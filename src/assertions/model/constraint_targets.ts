/**
 * The model side's supply of `ConstraintTargetFacts` (issue #1025, cut 4c-5
 * of step 4c of #380): the document's constraints and every animation's
 * constraint groups, laid out as the Spine file lays them.
 *
 * - **The constraints**: the document's, in its order — which the emitter
 *   writes the `constraints` array in — each its name and its kind, the word
 *   the file spells its `type` with.
 * - **The animations**: in the file's order (`fileAnimationOrder`, issue
 *   #1034); in each the five groups in A34's fixed order, a group only where
 *   the document holds an entry for it (`emitAnimation` writes a group only
 *   when the model holds something for it); each group's entries in the order
 *   the file keys them — an object the emitter fills in the document's order,
 *   so its names land as `keyedOrder` lands them, built here as that object;
 *   the timeline naming no physics constraint under the empty name the
 *   emitter spells it with, where the document spells it `*`
 *   (`EVERY_GLOBAL_PHYSICS`); each entry's timelines in the document's order,
 *   which the emitter writes unchanged (a name-keyed map no key-order pass
 *   touches, `src/keyorder.ts`). A document the reader accepted states every
 *   key array as a non-empty list, a named group's entry as named timelines,
 *   and only constraints of the kind its group names, so the clauses that
 *   refuse those shapes have nothing to fire on here.
 * - **The reach** of a physics timeline naming none: the core's own reading,
 *   `unnamedReach` (`./constraints.ts`, which poses the timeline through
 *   `posedPhysics` and reads which records took the key), over the document's
 *   physics records in its order. The reader refuses a physics timeline name
 *   it does not know, so every name asked of it is one the core poses.
 *
 * Links nothing from the runtime.
 */
import { fileAnimationOrder } from '../../compile.ts';
import { EVERY_GLOBAL_PHYSICS, PHYSICS_TIMELINE_KINDS, type CorePhysicsRecord } from '../../core/constraints_physics.ts';
import type { ConstraintTargetFacts, TargetAnimation, TargetEntry, TargetKeyArray } from '../facts/constraint_targets.ts';
import { isObj, type Json } from '../values.ts';
import { unnamedReach } from './constraints.ts';
import type { ReadDocument } from './parse.ts';

const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObj) : []);
const keyArray = (timeline: string, keys: unknown): TargetKeyArray => ({ timeline, keys: Array.isArray(keys) ? { count: keys.length } : { spelled: `${JSON.stringify(keys)}` } });

/** One group's entries as the file keys them: an object filled in the document's order, read back in its key order. */
function fileEntries(group: 'ik' | 'transform' | 'path' | 'physics' | 'slider', entries: readonly Json[]): TargetEntry[] {
  const keyed: Record<string, TargetEntry> = {};
  for (const entry of entries) {
    if (typeof entry.name !== 'string') continue;
    const name = group === 'physics' && entry.name === EVERY_GLOBAL_PHYSICS ? '' : entry.name;
    keyed[name] =
      group === 'ik' || group === 'transform'
        ? { name, bare: null, keyArrays: [keyArray('', entry.keys)] }
        : { name, bare: null, keyArrays: list(entry.timelines).flatMap((t) => (typeof t.name === 'string' ? [keyArray(t.name, t.keys)] : [])) };
  }
  return Object.values(keyed);
}

export function modelConstraintTargets(read: ReadDocument): ConstraintTargetFacts {
  const { doc } = read;
  const byName = new Map<string, Json>();
  for (const anim of list(read.json.animations)) if (typeof anim.name === 'string') byName.set(anim.name, anim);
  const animations: TargetAnimation[] = [];
  for (const name of fileAnimationOrder(doc)) {
    const anim = byName.get(name);
    if (anim === undefined) continue;
    const groups: TargetAnimation['groups'][number][] = [];
    const constraints = isObj(anim.constraints) ? anim.constraints : {};
    for (const group of ['ik', 'transform', 'path', 'physics', 'slider'] as const) {
      const entries = list(constraints[group]);
      if (entries.length > 0) groups.push({ group, entries: fileEntries(group, entries) });
    }
    animations.push({ name, groups });
  }
  const records = doc.constraints.flatMap((c): CorePhysicsRecord[] => (c.record?.kind === 'physics' ? [c.record] : []));
  return {
    constraints: doc.constraints.map((c) => ({ name: c.name, type: c.kind, spelled: c.name })),
    groupsByAnimation: animations,
    reach: (timeline) => {
      const kind = PHYSICS_TIMELINE_KINDS.find((k) => k === timeline);
      if (kind === undefined) return null;
      const reached = unnamedReach(records, kind);
      return { resets: kind === 'reset', reached: records.filter((r) => reached.has(r.name)).map((r) => r.name) };
    },
  };
}
