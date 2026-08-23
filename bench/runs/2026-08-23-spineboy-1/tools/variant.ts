/**
 * Swap one decision and refit, so a choice the frames might decide is decided by
 * measurement rather than by a glance (rung 8's LOOP §9 in the like-for-like
 * form: render **your own candidate** both ways and read the same number off
 * both).
 *
 *   bun … tools/variant.ts <pose.json> <set> <index> image <slot> <a.png,b.png,…>
 *   bun … tools/variant.ts <pose.json> <set> <index> order <slotA> <slotB>
 */
import { fitPose } from './fitpose.ts';
import { refFrame, renderPlacements, unionMae, viewportOf, type Placement } from './lib.ts';

const [file, set, idxArg, mode, a, b] = process.argv.slice(2);
const doc = JSON.parse(await Bun.file(file).text());
const base: Placement[] = doc.placements;
const v = viewportOf('ess');
const ref = refFrame('ess', set, Number(idxArg));

function refit(list: Placement[], freeNames: string[]): { sad: number; mae: number; list: Placement[] } {
  const free = list.map((p, i) => (freeNames.includes(p.part) ? i : -1)).filter((i) => i >= 0);
  const r = fitPose(
    list,
    ref,
    v,
    1,
    { free, posSteps: [6, 2.5, 1, 0.4], rotSteps: [3, 1.2, 0.5, 0.2], scaleSteps: [0, 0, 0, 0], passes: 4 },
  );
  return { sad: r.sad, mae: unionMae(ref, renderPlacements(r.placements, v)).mae, list: r.placements };
}

if (mode === 'image') {
  for (const image of b.split(',')) {
    const list = base.map((p) => (p.part === a ? { ...p, image } : { ...p }));
    const r = refit(list, [a]);
    console.log(`${a} = ${image.padEnd(20)} sad ${r.sad.toFixed(0)}  union MAE ${r.mae.toFixed(3)}`);
  }
} else if (mode === 'order') {
  const names = base.map((p) => p.part);
  const ia = names.indexOf(a);
  const ib = names.indexOf(b);
  for (const swap of [false, true]) {
    const list = base.map((p) => ({ ...p }));
    if (swap) {
      const [x] = list.splice(ia, 1);
      list.splice(ib, 0, x);
    }
    const r = refit(list, [a, b]);
    console.log(`${swap ? `${a} moved to ${b}'s place` : 'as authored'}: sad ${r.sad.toFixed(0)}  union MAE ${r.mae.toFixed(3)}`);
  }
}
