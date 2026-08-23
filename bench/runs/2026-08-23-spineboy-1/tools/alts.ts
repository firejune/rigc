/**
 * Which alternative each shared slot shows, per shot.
 *
 * The brief lists this among the things it cannot tell you — *"which shot uses
 * which is not readable here"* — and a glance really cannot read a mouth 6 px
 * across. What can is the composite: hold the fitted pose still, swap one
 * attachment, and read the objective off both builds over the whole shot. The
 * comparison never opens the reference skeleton; it compares two of **my** renders
 * against the same frames.
 *
 *   bun … tools/alts.ts <setup.json> <poses-dir> [sets…]
 */
import { build, pose, type Pose } from './skel.ts';
import { TREE, DRAW_ORDER, ALTERNATIVES, loadSetup } from './model.ts';
import { refFrame, renderPlacements, sad, viewportOf, cropViewport, cropPlate, subject } from './lib.ts';

const [setupFile, posesDir, ...only] = process.argv.slice(2);
const setup = await loadSetup(setupFile);
const s = build(TREE, setup, DRAW_ORDER.filter((d) => setup.some((p) => p.part === d)));
const full = viewportOf('ess');
const SETS = only.length ? only : ['idle', 'walk', 'run', 'jump', 'hit', 'shoot', 'aim', 'death'];

for (const set of SETS) {
  const doc = JSON.parse(await Bun.file(`${posesDir}/${set}.json`).text()) as { frames: { index: number; pose: Pose }[] };
  const out: string[] = [];
  for (const [slot, options] of Object.entries(ALTERNATIVES)) {
    if (slot === 'muzzle') continue;
    const totals = options.map(() => 0);
    for (const f of doc.frames) {
      const ref = refFrame('ess', set, f.index);
      const b = subject(ref);
      const x0 = Math.max(0, b.minX - 10);
      const y0 = Math.max(0, b.minY - 10);
      const w = Math.min(full.width - x0, b.maxX + 10 - x0);
      const h = Math.min(full.height - y0, b.maxY + 10 - y0);
      const vp = cropViewport(full, x0, y0, w, h);
      const target = cropPlate(ref, x0, y0, w, h);
      options.forEach((img, i) => {
        const p = pose(s, { ...f.pose, images: { [slot]: img } });
        totals[i] += sad(renderPlacements(p, vp), target);
      });
    }
    const best = totals.indexOf(Math.min(...totals));
    out.push(
      `${slot}=${options[best]} (${options.map((o, i) => `${o}:${(totals[i] / 1000).toFixed(0)}k`).join(' ')})`,
    );
  }
  console.log(`${set.padEnd(6)} ${out.join('   ')}`);
}
