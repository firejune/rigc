/**
 * Decide one draw-order edge by measuring it on your own candidate.
 *
 * §8 reads draw order off the reference by finding a frame where one part's
 * interior detail survives inside another's area. That settles the edges the
 * reference happens to show. This settles the rest, the way rung 8's LOOP §9
 * did: build it both ways, fit both, and read the same number off both — a part
 * that is 3 px wider in your render than in the frames is being covered there
 * and not here.
 *
 *   bun … tools/orderfit.ts <setup.json> <set> <frames…> -- <slotA>:<slotB> …
 *
 * `A:B` moves A to B's index (before B if A was after it).
 */
import { build, emptyPose, type Pose } from './skel.ts';
import { TREE, DRAW_ORDER, loadSetup } from './model.ts';
import { fitFrame } from './fitanim.ts';
import { refFrame } from './lib.ts';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const [setupFile, set, ...frameArgs] = argv.slice(0, sep < 0 ? undefined : sep);
const swaps = sep < 0 ? [] : argv.slice(sep + 1);
const indices = frameArgs.map(Number);
const setup = await loadSetup(setupFile);
const drawable = DRAW_ORDER.filter((d) => setup.some((p) => p.part === d));

function moved(order: string[], spec: string): string[] {
  const [a, b] = spec.split(':');
  const out = order.filter((n) => n !== a);
  const at = out.indexOf(b);
  out.splice(at < 0 ? out.length : at, 0, a);
  return out;
}

async function run(order: string[], label: string) {
  const s = build(TREE, setup, order);
  let cur: Pose = emptyPose(s);
  let total = 0;
  for (const i of indices) {
    const r = fitFrame(s, cur, refFrame('ess', set, i));
    cur = r.pose;
    total += r.sad;
  }
  console.log(`${label.padEnd(40)} total sad ${total.toFixed(0)}`);
}

await run(drawable, 'as authored');
for (const spec of swaps) await run(moved(drawable, spec), spec);
