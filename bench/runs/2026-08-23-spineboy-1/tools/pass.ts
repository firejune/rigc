/**
 * One full authoring pass: project the free placements onto the hierarchy, refine
 * each frame, keep whichever start won, and write the poses the motion spec is
 * built from.
 *
 * Two starts are tried per frame and the better is kept, because they fail in
 * different places: the projected start is right whenever the free relax found
 * the part, and the previous frame's pose is right whenever it did not (an
 * occluded part has no evidence and should simply carry on doing what it was
 * doing). Which one wins is recorded per frame.
 *
 *   bun … tools/pass.ts <setup.json> <relax.json> <out-dir> [sets…]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { build, pose, emptyPose, type Pose } from './skel.ts';
import { TREE, DRAW_ORDER, loadSetup } from './model.ts';
import { fitFrame } from './fitanim.ts';
import { project } from './project.ts';
import { refFrame, renderPlacements, unionMae, viewportOf, type Placement } from './lib.ts';

const [setupFile, relaxFile, outDir, ...only] = process.argv.slice(2);
const setup = await loadSetup(setupFile);
const s = build(TREE, setup, DRAW_ORDER.filter((d) => setup.some((p) => p.part === d)));
const v = viewportOf('ess');
const relax = JSON.parse(await Bun.file(relaxFile).text()) as Record<string, { index: number; free: Placement[] }[]>;
mkdirSync(outDir, { recursive: true });

for (const [set, rows] of Object.entries(relax)) {
  if (only.length && !only.includes(set)) continue;
  const frames: { index: number; sad: number; mae: number; start: string; pose: Pose }[] = [];
  let prev = emptyPose(s);
  for (const row of rows) {
    const ref = refFrame('ess', set, row.index);
    const a = fitFrame(s, project(s, row.free), ref);
    const b = fitFrame(s, prev, ref);
    const win = a.sad <= b.sad ? a : b;
    prev = win.pose;
    const mae = unionMae(ref, renderPlacements(pose(s, win.pose), v)).mae;
    frames.push({
      index: row.index,
      sad: win.sad,
      mae: +mae.toFixed(3),
      start: a.sad <= b.sad ? 'projected' : 'carried',
      pose: {
        rot: Object.fromEntries(Object.entries(win.pose.rot).map(([k, q]) => [k, +q.toFixed(4)])),
        move: Object.fromEntries(Object.entries(win.pose.move).map(([k, q]) => [k, q.map((n) => +n.toFixed(4)) as [number, number]])),
      },
    });
  }
  const maes = frames.map((f) => f.mae);
  console.log(
    `${set.padEnd(6)} mean MAE ${(maes.reduce((x, y) => x + y, 0) / maes.length).toFixed(2)}  worst ${Math.max(...maes).toFixed(1)}  ` +
      `projected won ${frames.filter((f) => f.start === 'projected').length}/${frames.length}`,
  );
  writeFileSync(join(outDir, `${set}.json`), JSON.stringify({ set, frames }, null, 1));
}
