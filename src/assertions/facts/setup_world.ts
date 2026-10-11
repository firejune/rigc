/**
 * Each bone's world frame at the setup pose (issue #1351) — what
 * `A51_BONES_LIE_ALONG_THEIR_DECLARED_AXIS` reads: a bone's world origin, and
 * the column of its world matrix its x axis points along.
 *
 * ⭐ **The pose is A50's**, on both suppliers: a fresh skeleton at the setup
 * pose with constraints applied, no physics stepped and no skin set —
 * `setupPose()` then `updateWorldTransform(Physics.none)` through spine-core
 * (`spineSetupWorld` in `../../validate.ts`), `poseSetup` under no skin
 * through rigc's core (`../model/setup_world.ts`). `tools/core_gate.ts` holds
 * the core's setup world to spine-core's at tolerance 0, which is what lets the
 * two print one line.
 *
 * A bone is answered lazily: a rig that declares no axis poses nothing.
 *
 * Links nothing from the runtime.
 */

/** A bone's world frame at the setup pose: its origin, and its world x axis `(a, c)`. */
export interface SetupBoneFrame {
  readonly worldX: number;
  readonly worldY: number;
  readonly a: number;
  readonly c: number;
}

/** What A51 reads. */
export interface SetupWorldFacts {
  /**
   * The bone's frame at the setup pose; a sentence saying why the setup pose
   * places it nowhere (inactive with no skin set, a setup pose the core does
   * not pose); or `null` when the skeleton has no bone of that name.
   */
  frameOf(bone: string): SetupBoneFrame | string | null;
}

/** The sentence for a bone the setup pose leaves inactive — one spelling for both suppliers. */
export function inactiveAtSetup(bone: string): string {
  return `bone "${bone}" is inactive with no skin set, so the setup pose places it nowhere`;
}
