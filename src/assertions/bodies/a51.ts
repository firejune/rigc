/**
 * A51, the body (issue #1351): the bones a rig declares to share an axis lie
 * along it at the setup pose.
 *
 * For each `invariants.axes` entry the line is drawn through the setup-pose
 * world origins of its two `through` bones, first to second, and every bone
 * of its `bones` must have its setup-pose world x axis within `tolerance`
 * degrees of that line — as a line, so a bone pointing the opposite way (a
 * mirrored bone, a world scaleX of −1) lies along it too. Why the rule exists,
 * and why it holds bones no animation keys, is above its `check` call in
 * `validate()` and on `RigInvariants.axes` in `src/rig.ts`.
 *
 * Reads the declaration from the rig info and the pose from a fact
 * (`../facts/setup_world.ts`), so the body is one function over spine-core's
 * setup pose and rigc's core's. Every angle it prints is a degree in Spine's
 * world (y up), counter-clockwise from +x.
 *
 * Links nothing from the runtime.
 */
import type { Verdicts } from '../harness.ts';
import type { SetupBoneFrame, SetupWorldFacts } from '../facts/setup_world.ts';
import type { RigInfo } from '../../types.ts';

const CODE = 'A51_BONES_LIE_ALONG_THEIR_DECLARED_AXIS';

/** Degrees, to the four places every angle on this rule's lines is printed at. */
const deg = (v: number): string => `${v.toFixed(4)}°`;

/** How far apart two directions are as lines, in degrees: 0 to 90. */
export function lineGap(a: number, b: number): number {
  const d = (((a - b) % 180) + 180) % 180;
  return Math.min(d, 180 - d);
}

/** The world angle of a bone's x axis, in degrees — `atan2(c, a)`, the angle spine-core's `getWorldRotationX` reports. */
export function worldAxisDegrees(frame: SetupBoneFrame): number {
  return (Math.atan2(frame.c, frame.a) * 180) / Math.PI;
}

export function a51BonesLieAlongTheirDeclaredAxis({ fail, skip }: Verdicts, facts: SetupWorldFacts, input: { rig?: RigInfo }): void {
  const rig = input.rig;
  if (!rig) return skip(CODE, 'no rig info (validating a bare directory)');
  if (!rig.axes.length) return skip(CODE, `the rig "${rig.archetype}" declares no axes (invariants.axes)`);
  /** A bone's frame, or the failure that says why there is none. */
  const placed = (axis: string, bone: string): SetupBoneFrame | null => {
    const frame = facts.frameOf(bone);
    if (frame === null) {
      fail(CODE, `axis "${axis}" names bone "${bone}", which the skeleton does not have`);
      return null;
    }
    if (typeof frame === 'string') {
      fail(CODE, `axis "${axis}": ${frame}, so it cannot be held to the axis`);
      return null;
    }
    return frame;
  };
  for (const axis of rig.axes) {
    const [from, to] = axis.through;
    const a = placed(axis.name, from);
    const b = placed(axis.name, to);
    if (a === null || b === null) continue;
    const dx = b.worldX - a.worldX;
    const dy = b.worldY - a.worldY;
    // Exactly one origin, and no threshold: any distance above 0 draws a line, and a threshold would be a number the rig did not state.
    if (dx === 0 && dy === 0) {
      fail(
        CODE,
        `axis "${axis.name}": "${from}" and "${to}" share the world origin (${a.worldX}, ${a.worldY}) at the setup pose, so they draw no line — ` +
          'name two bones whose origins differ',
      );
      continue;
    }
    const line = (Math.atan2(dy, dx) * 180) / Math.PI;
    const head = `axis "${axis.name}" (through "${from}"→"${to}", ${deg(line)})`;
    for (const bone of axis.bones) {
      const frame = placed(axis.name, bone);
      if (frame === null) continue;
      if (frame.a === 0 && frame.c === 0) {
        fail(CODE, `${head}: bone "${bone}" has no world x axis at the setup pose (the x column of its world matrix is 0, 0 — a scale of 0), so it lies along no line`);
        continue;
      }
      const found = worldAxisDegrees(frame);
      const off = lineGap(found, line);
      if (off <= axis.tolerance) continue;
      fail(
        CODE,
        `${head}: bone "${bone}" world x axis at ${deg(found)}, ${deg(off)} off, tolerance ${axis.tolerance}° — ` +
          'rotate the bone in the rig spec onto the line and counter-rotate its attachments so the setup pose stays put',
      );
    }
  }
}
