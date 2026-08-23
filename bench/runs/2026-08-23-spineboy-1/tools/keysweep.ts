/**
 * What a key-reduction tolerance buys, measured.
 *
 * Rung 8's clearest own-goal was aiming at a sub-pixel tolerance against a fitted
 * pose series and getting twice the reference's key count for it — *"a knob, not
 * a bug"*, but only if the run turns the knob and reads the dial. This turns it:
 * emit at each tolerance, compile, render the compiled animation back at the
 * frames' own rate, and report keys against fidelity so the choice is made on a
 * table rather than on a preference.
 *
 *   bun … tools/keysweep.ts <rig.json> <setup.json> <poses-dir> <tol…>
 */
import { $ } from 'bun';
import { loadPosable, sampleAnimation, renderFrame } from '../../../../src/render.ts';
import { refFrame, unionMae, viewportOf, BG } from './lib.ts';

const [rig, setup, poses, ...tols] = process.argv.slice(2);
const SETS: Record<string, number> = { aim: 1, death: 60, hit: 5, idle: 21, jump: 17, run: 9, shoot: 6, walk: 13 };
const here = import.meta.dir;
const v = viewportOf('ess');

for (const tol of tols) {
  const motion = `/tmp/sb/sweep-${tol}.motion.json`;
  const outDir = `/tmp/sb/sweep-${tol}`;
  const emit = await $`bun ${here}/emitmotion.ts ${setup} ${motion} ${tol} ${poses}`.quiet();
  const keys = [...emit.stdout.toString().matchAll(/(\d+) keys/g)].reduce((n, m) => n + Number(m[1]), 0);
  const timelines = [...emit.stdout.toString().matchAll(/(\d+) timelines/g)].reduce((n, m) => n + Number(m[1]), 0);
  await $`bun ${here}/../../../../cli.ts build --rig ${rig} --motion ${motion} --images examples/spineboy/images --out ${outDir} --profile spine`.quiet();
  const p = loadPosable(`${outDir}/skeleton.json`, `${outDir}/skeleton.atlas`, outDir);
  let sum = 0;
  let n = 0;
  let worst = 0;
  for (const [set, count] of Object.entries(SETS)) {
    const frames = sampleAnimation(p.data, set, 12);
    for (let i = 0; i < count && i < frames.length; i++) {
      const m = unionMae(refFrame('ess', set, i), renderFrame(frames[i], p.pages, v, BG)).mae;
      sum += m;
      n++;
      worst = Math.max(worst, m);
    }
  }
  console.log(`tol ${String(tol).padStart(4)} px  ${String(timelines).padStart(3)} timelines  ${String(keys).padStart(4)} keys  mean MAE ${(sum / n).toFixed(2)}  worst ${worst.toFixed(1)}`);
}
