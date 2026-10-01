/**
 * A25, the body (issue #1025, cut 4c-4 of #380): a bone the rig declares
 * detached from another is not its descendant.
 *
 * Moved out of `src/validate.ts` unchanged but for what it reads: the bones
 * and their parents are a fact (`../facts/skeleton_roster.ts`) rather than the
 * raw JSON's `bones`, and the rig info is the caller's. Why some bones are
 * detached on purpose stays above the `check` call in `validate()`.
 */
import type { Verdicts } from '../harness.ts';
import type { SkeletonRosterFacts } from '../facts/skeleton_roster.ts';
import type { RigInfo } from '../../types.ts';

export function a25DetachedBoneParentage({ fail, skip }: Verdicts, { bones }: SkeletonRosterFacts, input: { rig?: RigInfo }): void {
  const rig = input.rig;
  if (!rig) return skip('A25_DETACHED_BONE_PARENTAGE', 'no rig info (validating a bare directory)');
  if (!rig.detached.length) {
    return skip('A25_DETACHED_BONE_PARENTAGE', `the rig "${rig.archetype}" declares no forbidden parentage`);
  }
  const parentOf = new Map<string, string | null>();
  for (const bone of bones) parentOf.set(bone.name, bone.parent);
  for (const [child, forbidden] of rig.detached) {
    if (!parentOf.has(child)) {
      fail('A25_DETACHED_BONE_PARENTAGE', `the rig declares "${child}" detached from "${forbidden}" but has no such bone`);
      continue;
    }
    const seen = new Set<string>();
    for (let cursor = parentOf.get(child) ?? null; cursor; cursor = parentOf.get(cursor) ?? null) {
      if (seen.has(cursor)) break; // a cycle; the loader would have thrown first
      seen.add(cursor);
      if (cursor !== forbidden) continue;
      fail(
        'A25_DETACHED_BONE_PARENTAGE',
        `"${child}" is a descendant of "${forbidden}"; it must not be dragged by that bone's motion`,
      );
      break;
    }
  }
}
