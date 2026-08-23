/**
 * Fit the hierarchy to every frame, then let each part off the hierarchy by a
 * few units — and record where it goes.
 *
 * That displacement is the measurement this run needs most. A part that will
 * not stay on the end of its parent is telling you the **joint** is in the wrong
 * place, and averaged over a whole shot the direction it wants is exactly the
 * least-squares fixed point `joints.ts` solves for. The relax is deliberately
 * short-stepped: it starts from a connected pose, so an occluded part with no
 * gradient simply does not move, and nothing can fly off the way a cold free fit
 * does.
 *
 *   bun … tools/relax.ts <setup.json> <out.json> <set>:<frames> …
 */
import { writeFileSync } from 'node:fs';
import { build, pose, emptyPose, type Pose } from './skel.ts';
import { TREE, DRAW_ORDER, loadSetup } from './model.ts';
import { fitFrame } from './fitanim.ts';
import { fitPose } from './fitpose.ts';
import { refFrame, renderPlacements, unionMae, viewportOf, type Placement } from './lib.ts';

const [setupFile, out, posesDir, ...sets] = process.argv.slice(2);
const setup = await loadSetup(setupFile);
const order = DRAW_ORDER.filter((d) => setup.some((p) => p.part === d));
const s = build(TREE, setup, order);
const v = viewportOf('ess');

const result: Record<string, { index: number; hier: Pose; free: Placement[]; hierMae: number; freeMae: number }[]> = {};
for (const spec of sets) {
  const [set, nArg] = spec.split(':');
  const n = Number(nArg);
  const rows: (typeof result)[string] = [];
  let cur = emptyPose(s);
  let seeded: { index: number; pose: Pose }[] | null = null;
  if (posesDir !== '-') {
    seeded = (JSON.parse(await Bun.file(`${posesDir}/${set}.json`).text()) as { frames: { index: number; pose: Pose }[] }).frames;
  }
  for (let i = 0; i < n; i++) {
    const ref = refFrame('ess', set, i);
    const seed = seeded ? seeded.find((f) => f.index === i)!.pose : cur;
    const h = fitFrame(s, seed, ref);
    cur = h.pose;
    const hp = pose(s, h.pose);
    const f = fitPose(hp, ref, v, 1, {
      posSteps: [4, 1.6, 0.6, 0.25],
      rotSteps: [2, 0.8, 0.3, 0.12],
      scaleSteps: [0, 0, 0, 0],
      passes: 4,
    });
    rows.push({
      index: i,
      hier: { rot: h.pose.rot, move: h.pose.move },
      free: f.placements.map((p) => ({ part: p.part, image: p.image, cx: +p.cx.toFixed(3), cy: +p.cy.toFixed(3), rot: +p.rot.toFixed(3) })),
      hierMae: +unionMae(ref, renderPlacements(hp, v)).mae.toFixed(3),
      freeMae: +unionMae(ref, renderPlacements(f.placements, v)).mae.toFixed(3),
    });
    console.log(`${set} f${i}: hier ${rows[i].hierMae}  free ${rows[i].freeMae}`);
  }
  result[set] = rows;
}
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`wrote ${out}`);
