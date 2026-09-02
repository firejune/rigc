/**
 * Set the trunk from the trunk's OWN template match, per frame.
 *
 * ⭐ AUTHORING §9.1, verbatim: *"prefer the frame-derived instruments when they
 * disagree with the composite about a single part's place: the composite is one
 * number over everything, while a template match on that part's own art is a
 * measurement of the thing in question."* `check`'s drift is per slot, so a slot's
 * own template match is the instrument that reads the same quantity the clause
 * gates on — and the composite is not, which this run measured both ways:
 * unfreezing the trunk for a local polish moved `hit`'s torso drift 9.0 → 8.8 px
 * and `death`'s 5.0 → 9.4 px on the same pass.
 *
 * So the trunk's three channels are not searched at all here. The torso's and the
 * head's placements are measured with the occluders masked out (`tools/place.ts`),
 * and the pose is **arithmetic** off them: a part's measured screen angle is its
 * bone's world rotation, and its measured centre minus the art offset is the
 * bone's world position. Two passes, because the cover masks come from the
 * candidate and improve with it.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPlate } from '../../../../tools/plate.ts';
import { piecesOf, projector, viewportOfSize } from '../../../../src/render.ts';
import { DEG, readViewport, toWorld, wrap180 } from './geom.ts';
import { type Setup } from './rig.ts';
import { TORSO_SETUP } from './setup.ts';
import { applyPose, loadPosable, type PoseVec } from './fitlib.ts';
import { coverMasks, fitPlacement, samplePart } from './place.ts';
import { setsOf } from './fit.ts';

const ROOT = 'bench/runs/2026-09-03-spineboy-1';
const REF = 'bench/reference/spineboy/ess';
const IMAGES = 'examples/spineboy/images';

const passes = Number(process.argv[2] ?? 2);
const window = Number(process.argv[3] ?? 9);
const vp = readViewport(join(REF, 'frames.json'));
const setup: Setup = JSON.parse(readFileSync(join(ROOT, 'fit/setup.json'), 'utf8'));
const p = loadPosable(join(ROOT, 'spine'));
const samples = new Map(
  ['torso', 'head'].map((part) => [part, samplePart(readPlate(join(IMAGES, `${part}.png`)), 4)] as const),
);
const viewport = viewportOfSize(vp.minX, vp.minY, vp.maxX - vp.minX, vp.maxY - vp.minY, vp.scale, vp.width, vp.height);
const project = projector(viewport);

let moved = 0;
let worstMove = 0;
for (let pass = 0; pass < passes; pass++) {
  moved = 0;
  worstMove = 0;
  for (const set of setsOf()) {
    const file = join(ROOT, `fit/poses/${set.dir.replace('@', '_at_')}.json`);
    if (!existsSync(file)) continue;
    const poses: Record<string, PoseVec> = JSON.parse(readFileSync(file, 'utf8'));
    for (const f of set.frames) {
      const frame = f.replace('.png', '');
      const pose = poses[frame];
      if (!pose) continue;
      const ref = readPlate(join(REF, set.dir, f));
      applyPose(p, pose);
      const covers = coverMasks(p, vp);
      const seeds = new Map<string, { x: number; y: number; rot: number }>();
      for (const piece of piecesOf(p.skeleton)) {
        const w = piece.world;
        let sx = 0;
        let sy = 0;
        for (let i = 0; i < 4; i++) {
          const [px, py] = project(w[i * 2], w[i * 2 + 1]);
          sx += px / 4;
          sy += py / 4;
        }
        // corner order bl, ul, ur, br — the screen angle is the bl->br edge
        const [blx, bly] = project(w[0], w[1]);
        const [brx, bry] = project(w[6], w[7]);
        seeds.set(piece.slot, { x: sx, y: sy, rot: (Math.atan2(bry - bly, brx - blx) * 180) / Math.PI });
      }
      const fitOne = (part: string): { x: number; y: number; rot: number; res: number; vis: number } | null => {
        const seed = seeds.get(part);
        const cover = covers.get(part);
        if (!seed || !cover) return null;
        const r = fitPlacement(samples.get(part)!, ref, cover, seed, { window, rotWindow: 10, scale: vp.scale });
        return Number.isFinite(r.res) ? r : null;
      };
      const torso = fitOne('torso');
      if (!torso) continue;
      const torsoWorldRot = -torso.rot;
      const [cx, cy] = toWorld(vp, torso.x, torso.y);
      const [ax, ay] = setup.attach['torso'];
      const c = Math.cos(torsoWorldRot * DEG);
      const s = Math.sin(torsoWorldRot * DEG);
      const bx = cx - (c * ax - s * ay);
      const by = cy - (s * ax + c * ay);
      const before = [pose['torso.x'], pose['torso.y'], pose['torso.rotate']];
      pose['torso.x'] = bx - TORSO_SETUP[0];
      pose['torso.y'] = by - TORSO_SETUP[1];
      pose['torso.rotate'] = wrap180(torsoWorldRot);
      const head = fitOne('head');
      if (head) pose['head.rotate'] = wrap180(-head.rot - torsoWorldRot - pose['neck.rotate']);
      const d = Math.hypot(pose['torso.x'] - before[0], pose['torso.y'] - before[1]) * vp.scale;
      if (d > 0.05) moved++;
      worstMove = Math.max(worstMove, d);
    }
    writeFileSync(file, JSON.stringify(poses, null, 1));
  }
  console.log(`pass ${pass}: ${moved} frame(s) moved, worst ${worstMove.toFixed(2)} frame px`);
}
