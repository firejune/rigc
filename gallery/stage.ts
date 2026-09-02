/**
 * Where the figure stands — read out of the rig spec rather than typed twice.
 *
 * ⭐ **Why a part script reads the rig at all.** A stage plate has to put its
 * glow behind the chest and its contact shadow under the feet, and both of those
 * are bone positions the rig spec already states. Writing them a second time in
 * the drawing script is the defect that produces a shadow under nobody's feet,
 * and it is invisible in both files — each is internally consistent. So the rig
 * spec is the one author of the geometry and this module is how the drawing
 * asks it.
 *
 * It computes **setup-pose world positions**, walking the parent chain and
 * applying each parent's rotation and scale the way the runtime does. Only the
 * translation comes back: a plate's glow does not care which way a bone points.
 *
 * 🚫 It is not a second compiler and must not become one. It reads `skeleton`
 * and `bones` and nothing else; anything a drawing needs that is not a bone
 * position belongs in the drawing.
 */
import { readFileSync } from 'node:fs';

/** The slice of a rig spec a stage needs. Everything else is ignored. */
export interface StageRig {
  skeleton: { width: number; height: number };
  bones: { name: string; parent?: string; x?: number; y?: number; rotation?: number; scaleX?: number; scaleY?: number }[];
}

export interface Stage {
  /** The stage plate's size, which is the skeleton's declared size. */
  width: number;
  height: number;
  /** A bone's setup-pose world position, in Spine coordinates (y up). */
  bone: (name: string) => { x: number; y: number };
  /**
   * Spine world y to plate-image y.
   *
   * The drawing code works top-left-origin, y down — the same way the part
   * drawings do — and Spine's world is y up from the bottom left of the plate.
   * This is the only place the gallery flips between them.
   */
  imageY: (worldY: number) => number;
}

/** Read a rig spec and answer where its bones sit. */
export function readStage(rigPath: string): Stage {
  const rig: StageRig = JSON.parse(readFileSync(rigPath, 'utf8'));
  if (!rig.skeleton || typeof rig.skeleton.width !== 'number' || typeof rig.skeleton.height !== 'number') {
    throw new Error(`${rigPath}: a stage needs skeleton.width and skeleton.height`);
  }
  const byName = new Map(rig.bones.map((b) => [b.name, b]));
  const cache = new Map<string, { x: number; y: number }>();

  const world = (name: string): { x: number; y: number } => {
    const hit = cache.get(name);
    if (hit) return hit;
    const bone = byName.get(name);
    if (!bone) {
      throw new Error(`${rigPath} declares no bone "${name}"; it has [${[...byName.keys()].join(', ')}]`);
    }
    const lx = bone.x ?? 0;
    const ly = bone.y ?? 0;
    let out: { x: number; y: number };
    if (bone.parent === undefined) {
      out = { x: lx, y: ly };
    } else {
      // The parent's own rotation and scale, composed the way the runtime
      // composes them. A bone under a rotated parent is not at the parent's
      // position plus its own numbers, and a leg chain is exactly that case.
      const chain: typeof bone[] = [];
      for (let b = byName.get(bone.parent); b !== undefined; b = b.parent === undefined ? undefined : byName.get(b.parent)) {
        chain.push(b);
      }
      let rot = 0;
      let sx = 1;
      let sy = 1;
      for (const b of chain) {
        rot += b.rotation ?? 0;
        sx *= b.scaleX ?? 1;
        sy *= b.scaleY ?? 1;
      }
      const parent = world(bone.parent);
      const a = (rot * Math.PI) / 180;
      out = {
        x: parent.x + (lx * sx * Math.cos(a) - ly * sy * Math.sin(a)),
        y: parent.y + (lx * sx * Math.sin(a) + ly * sy * Math.cos(a)),
      };
    }
    cache.set(name, out);
    return out;
  };

  return {
    width: rig.skeleton.width,
    height: rig.skeleton.height,
    bone: world,
    imageY: (worldY: number) => rig.skeleton.height - worldY,
  };
}
