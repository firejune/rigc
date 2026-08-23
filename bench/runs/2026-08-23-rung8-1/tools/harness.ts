/**
 * Rendering a candidate back into the reference frames' own grid, and measuring
 * what differs.
 *
 * This is a `check`-class loop, not a `bench`-class one: it opens the reference
 * **frames** and never the reference skeleton. It exists because `check` reports
 * one number per animation and a fit needs one per frame, per pose parameter.
 */
import { Skeleton, Physics, type SkeletonData } from '@esotericsoftware/spine-core';
import { Plate, type RGBA } from '../../../../tools/plate.ts';
import {
  blitPiece,
  loadPosable,
  pageFor,
  piecesOf,
  projector,
  renderFrame,
  viewportOfSize,
  type Posable,
  type Viewport,
} from '../../../../src/render.ts';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sidecar, type Sidecar } from './frames.ts';

export function viewportOf(side: Sidecar): Viewport {
  const v = side.viewport;
  return viewportOfSize(v.x, v.y, v.width, v.height, v.scale, v.pixelWidth, v.pixelHeight);
}

/** Compile a rig + motion pair with the CLI and load the result for posing. */
export function compile(
  outDir: string,
  rig: unknown,
  motion: unknown,
  images = 'examples/8-follow-through/images',
): { posable: Posable; report: string } {
  mkdirSync(outDir, { recursive: true });
  const rigPath = join(outDir, 'rig.json');
  const motionPath = join(outDir, 'motion.json');
  writeFileSync(rigPath, JSON.stringify(rig, null, 2));
  writeFileSync(motionPath, JSON.stringify(motion, null, 2));
  const spine = join(outDir, 'spine');
  const report = execFileSync(
    'bun',
    [
      'cli.ts',
      'build',
      '--rig',
      rigPath,
      '--motion',
      motionPath,
      '--images',
      images,
      '--out',
      spine,
      '--profile',
      'spine',
    ],
    { encoding: 'utf8' },
  );
  return { posable: loadPosable(join(spine, 'skeleton.json'), join(spine, 'skeleton.atlas'), spine), report };
}

export interface Poser {
  skeleton: Skeleton;
  set(bone: string, field: 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY', value: number): void;
  /** Render the current pose into the reference grid. */
  render(): Plate;
  /**
   * Render into a plate the caller owns, clearing only `win` first.
   *
   * The fit calls this tens of thousands of times, and a fresh 512x381 plate per
   * call is most of its cost. Pixels outside `win` are left stale on purpose —
   * nothing reads them, because the cost function only ever looks inside it.
   */
  renderInto(plate: Plate, win: Window): void;
  reset(): void;
}

export interface Window {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function poser(data: SkeletonData, viewport: Viewport, pages: Posable['pages'], background: RGBA): Poser {
  const skeleton = new Skeleton(data);
  skeleton.setupPose();
  return {
    skeleton,
    renderInto(plate, win) {
      skeleton.update(0);
      skeleton.updateWorldTransform(Physics.update);
      const d = plate.data;
      for (let y = win.y0; y < win.y1; y++) {
        let i = (y * plate.width + win.x0) * 4;
        for (let x = win.x0; x < win.x1; x++) {
          d[i] = background[0];
          d[i + 1] = background[1];
          d[i + 2] = background[2];
          d[i + 3] = background[3];
          i += 4;
        }
      }
      const project = projector(viewport);
      for (const piece of piecesOf(skeleton)) blitPiece(plate, pageFor(pages, piece), piece, project);
    },
    // ⚠️ spine-core 4.3 keeps a bone's local transform on `bone.pose`, not on the
    // bone. Writing `bone.rotation` is not an error and not a rotation either —
    // it adds a property nothing reads, and every frame renders as the setup
    // pose. That cost one loop here; see LOOP.md §3.
    set(bone, field, value) {
      const b = skeleton.findBone(bone);
      if (!b) throw new Error(`no bone "${bone}"`);
      b.pose[field] = value;
    },
    reset() {
      skeleton.setupPose();
    },
    render() {
      skeleton.update(0);
      skeleton.updateWorldTransform(Physics.update);
      return renderFrame({ index: 0, time: 0, pieces: piecesOf(skeleton) }, pages, viewport, background);
    },
  };
}

/** Mean absolute RGB difference over a window, plus the count of differing pixels. */
export function mae(a: Plate, b: Plate, win: Window): { mae: number; n: number } {
  const da = a.data;
  const db = b.data;
  let sum = 0;
  let n = 0;
  for (let y = win.y0; y < win.y1; y++) {
    let i = (y * a.width + win.x0) * 4;
    for (let x = win.x0; x < win.x1; x++) {
      sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      n += 3;
      i += 4;
    }
  }
  return { mae: sum / n, n };
}

/** A window around everything either side draws, padded so nothing can hide outside it. */
export function windowOf(plates: Plate[], background: RGBA, pad: number, w: number, h: number) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of plates) {
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const [r, g, b] = p.get(x, y);
        const d = Math.max(Math.abs(r - background[0]), Math.abs(g - background[1]), Math.abs(b - background[2]));
        if (d <= 8) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return {
    x0: Math.max(0, x0 - pad),
    y0: Math.max(0, y0 - pad),
    x1: Math.min(w, x1 + pad + 1),
    y1: Math.min(h, y1 + pad + 1),
  };
}

export function backgroundOf(skeleton: string): RGBA {
  const bg = sidecar(skeleton).background;
  return [bg[0], bg[1], bg[2], bg[3]];
}
