/**
 * The deepest inward advance the animation data asks for, in axis pixels —
 * shared by A29 and A30 (issue #1025, cut 4c-4 of #380), moved here from
 * `src/validate.ts` unchanged but for what it reads: the bone timelines are a
 * fact (`./facts/bone_timelines.ts`) rather than the raw JSON.
 *
 * Shared by A29 and A30 because they bound the SAME quantity against two
 * different measured facts. Two things spend the same clearance and so are added:
 *
 *   * the stroke — a translateX on a bone in the axis subtree. A24 guarantees
 *     there is no hidden screen-space component to miss.
 *   * the mass bone's own inward keys. It typically hangs outside the axis
 *     subtree, so its keys are screen-space by design and get PROJECTED onto the
 *     axis rather than read as axis coordinates. Ignoring them would let a rig
 *     pass while a recoil key closed the last few pixels.
 *
 * Links nothing from the runtime.
 */
import type { RigInfo } from '../types.ts';
import type { BoneTimelineFacts } from './facts/bone_timelines.ts';
import { isObj, type Json } from './values.ts';

export function deepestInwardAdvance({ boneTimelines }: BoneTimelineFacts, rig: RigInfo): { total: number; describe: () => string } {
  const subtree = new Set(rig.axisSubtree);
  let strokeMax = 0;
  let strokeWhere = '';
  let massMax = 0;
  let massWhere = '';
  for (const { animation: animName, bone: boneName, timelines } of boneTimelines) {
    if (!isObj(timelines)) continue;
    const keys = (timelines as Json).translate;
    if (!Array.isArray(keys)) continue;
    for (const key of keys) {
      if (!isObj(key)) continue;
      if (subtree.has(boneName)) {
        // +x is inward along the axis; a retracted key is negative and spends
        // no clearance, so only the inward extreme matters.
        const x = Number(key.x ?? 0);
        if (Number.isFinite(x) && x > strokeMax) {
          strokeMax = x;
          strokeWhere = `${animName}.${boneName} t=${String(key.time ?? 0)}`;
        }
      } else if (boneName === rig.massBone && rig.inwardUnit) {
        const inward = Number(key.x ?? 0) * rig.inwardUnit[0] + Number(key.y ?? 0) * rig.inwardUnit[1];
        if (Number.isFinite(inward) && inward > massMax) {
          massMax = inward;
          massWhere = `${animName}.${boneName} t=${String(key.time ?? 0)}`;
        }
      }
    }
  }
  return {
    total: strokeMax + massMax,
    describe: () =>
      `deepest inward advance is ${(strokeMax + massMax).toFixed(3)}px (stroke ${strokeMax.toFixed(3)} at ${strokeWhere}` +
      `${massMax > 0 ? ` + mass ${massMax.toFixed(3)} at ${massWhere}` : ''})`,
  };
}
