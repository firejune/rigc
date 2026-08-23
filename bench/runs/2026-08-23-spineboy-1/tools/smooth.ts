/**
 * Sweep the fitted poses again, starting each frame from the average of its
 * neighbours.
 *
 * A frame-by-frame fit has no idea that it is part of a shot. Where a part is
 * covered up — the gun behind the near leg on `walk` f6, the far arm on nearly
 * every frame — the picture has nothing to say and the descent leaves it
 * wherever it started, which is a different place on each frame and reads as
 * jitter. Starting from the neighbours' average makes the smooth answer the one
 * the descent has to be argued out of, which is the right default for a part
 * nothing can see: it carries on doing what it was doing.
 *
 *   bun … tools/smooth.ts <setup.json> <poses-dir> <out-dir> [sweeps] [sets…]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { build, pose, type Pose } from './skel.ts';
import { TREE, DRAW_ORDER, loadSetup } from './model.ts';
import { fitFrame } from './fitanim.ts';
import { refFrame, renderPlacements, unionMae, viewportOf } from './lib.ts';

const [setupFile, inDir, outDir, sweepArg, ...only] = process.argv.slice(2);
const sweeps = Number(sweepArg ?? 2);
const setup = await loadSetup(setupFile);
const s = build(TREE, setup, DRAW_ORDER.filter((p) => setup.some((q) => q.part === p)));
const v = viewportOf('ess');
mkdirSync(outDir, { recursive: true });

const SETS = only.length ? only : ['aim', 'death', 'hit', 'idle', 'jump', 'run', 'shoot', 'walk'];
/**
 * The four shots the brief measures as cycles. Their last committed frame is the
 * animation's own duration, so it and frame 0 are the *same instant* played
 * twice — which means the neighbour of the last frame is the second, not
 * itself. Wrapping the sweep there is what stops a cycle drifting apart at its
 * seam; the brief's own first-to-last figures (`run` 1 px, `shoot` 0) are the
 * control that says the reference's do not.
 */
const LOOPS = new Set(['idle', 'run', 'shoot', 'walk']);

for (const set of SETS) {
  const doc = JSON.parse(await Bun.file(join(inDir, `${set}.json`)).text()) as {
    frames: { index: number; sad: number; mae: number; pose: Pose }[];
  };
  const poses = doc.frames.map((f) => f.pose);
  const n = poses.length;
  for (let sweep = 0; sweep < sweeps && n > 2; sweep++) {
    for (let pass = 0; pass < 2; pass++) {
      const order = pass === 0 ? [...poses.keys()] : [...poses.keys()].reverse();
      for (const i of order) {
        const wrap = LOOPS.has(set);
        const a = poses[i === 0 ? (wrap ? n - 2 : 0) : i - 1];
        const b = poses[i === n - 1 ? (wrap ? 1 : n - 1) : i + 1];
        const start: Pose = { rot: {}, move: { hip: [0, 0] } };
        for (const k of Object.keys(poses[i].rot)) start.rot[k] = ((a.rot[k] ?? 0) + (b.rot[k] ?? 0)) / 2;
        const ma = a.move.hip ?? [0, 0];
        const mb = b.move.hip ?? [0, 0];
        start.move.hip = [(ma[0] + mb[0]) / 2, (ma[1] + mb[1]) / 2];
        const r = fitFrame(s, start, refFrame('ess', set, doc.frames[i].index));
        if (r.sad <= doc.frames[i].sad * 1.03) {
          poses[i] = r.pose;
          doc.frames[i].sad = r.sad;
        }
      }
    }
  }
  const frames = doc.frames.map((f, i) => {
    const mae = unionMae(refFrame('ess', set, f.index), renderPlacements(pose(s, poses[i]), v)).mae;
    return {
      index: f.index,
      sad: f.sad,
      mae: +mae.toFixed(3),
      pose: {
        rot: Object.fromEntries(Object.entries(poses[i].rot).map(([k, q]) => [k, +q.toFixed(4)])),
        move: Object.fromEntries(Object.entries(poses[i].move).map(([k, q]) => [k, q.map((x) => +x.toFixed(4)) as [number, number]])),
      },
    };
  });
  const maes = frames.map((f) => f.mae);
  console.log(`${set.padEnd(6)} mean MAE ${(maes.reduce((x, y) => x + y, 0) / maes.length).toFixed(2)}  worst ${Math.max(...maes).toFixed(1)}`);
  writeFileSync(join(outDir, `${set}.json`), JSON.stringify({ set, frames }, null, 1));
}
