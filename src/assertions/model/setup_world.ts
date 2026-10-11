/**
 * The model side's supply of `SetupWorldFacts` (issue #1351): each bone's
 * world frame at the setup pose as rigc's core poses it — `poseSetup` under no
 * skin, constraints applied, the pose `./stage_box.ts` reads for A50 — posed
 * once, on the first question, so a rig that declares no axis poses nothing.
 *
 * Links nothing from the runtime.
 */
import { activeBones, poseSetup, rawNumber, underNoSkin } from '../../core/index.ts';
import type { CoreWorld } from '../../core/world.ts';
import { inactiveAtSetup, type SetupWorldFacts } from '../facts/setup_world.ts';
import type { ReadDocument } from './parse.ts';

export function modelSetupWorld(read: ReadDocument): SetupWorldFacts {
  let posed: { active: ReadonlySet<string>; world: Map<string, CoreWorld> | string } | null = null;
  const pose = (): { active: ReadonlySet<string>; world: Map<string, CoreWorld> | string } => {
    if (posed !== null) return posed;
    const view = underNoSkin(read.doc);
    const setup = poseSetup(view, { round: rawNumber });
    const world = setup.world ?? setup.absent.find(([block]) => block === 'setup.bones')?.[1] ?? "rigc's core does not pose this setup pose";
    posed = { active: activeBones(view), world };
    return posed;
  };
  return {
    frameOf: (bone) => {
      if (!read.doc.bones.some((b) => b.name === bone)) return null;
      const { active, world } = pose();
      if (!active.has(bone)) return inactiveAtSetup(bone);
      if (typeof world === 'string') return world;
      const frame = world.get(bone);
      if (frame === undefined) return `bone "${bone}" has no setup world transform`;
      return { worldX: frame.worldX, worldY: frame.worldY, a: frame.a, c: frame.c };
    },
  };
}
