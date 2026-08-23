/**
 * Render a compiled candidate's own animation back into the reference frames and
 * report what differs, frame by frame.
 *
 * This is the run's own frame-fidelity self-check. It overlaps `rigc check` and
 * is not a substitute for it: `check` fits the framing, matches slots and reports
 * per-frame deltas, and this reports one number per frame over a fixed window so
 * that two builds of the same rig are directly comparable while the keys move.
 * Like `check`, it opens the frames and never the reference skeleton.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/render-back.ts <skeleton> <candidate-dir> [--all]`
 */
import { join } from 'node:path';
import { loadSet, sidecar } from './frames.ts';
import { backgroundOf, mae, viewportOf, windowOf } from './harness.ts';
import { loadPosable, renderFrame, sampleAnimation } from '../../../../src/render.ts';

export function renderBack(
  skeleton: 'ball' | 'pendulum',
  candidateDir: string,
  dir: string,
): { per: number[]; mean: number; worst: number; worstAt: number } {
  const side = sidecar(skeleton);
  const view = viewportOf(side);
  const bg = backgroundOf(skeleton);
  const reference = loadSet(skeleton, dir);
  const fps = side.sets.find((s) => s.dir === dir)?.fps ?? 24;
  const posable = loadPosable(
    join(candidateDir, 'skeleton.json'),
    join(candidateDir, 'skeleton.atlas'),
    candidateDir,
  );
  const frames = sampleAnimation(posable.data, 'follow-through', fps);
  const per: number[] = [];
  for (let i = 0; i < reference.length; i++) {
    const win = windowOf([reference[i]], bg, 12, side.viewport.pixelWidth, side.viewport.pixelHeight);
    const plate = renderFrame(frames[Math.min(i, frames.length - 1)], posable.pages, view, bg);
    per.push(mae(plate, reference[i], win).mae);
  }
  const mean = per.reduce((a, b) => a + b, 0) / per.length;
  const worst = Math.max(...per);
  return { per, mean, worst, worstAt: per.indexOf(worst) };
}

if (import.meta.main) {
  const skeleton = process.argv[2] as 'ball' | 'pendulum';
  const candidate = process.argv[3];
  for (const dir of ['follow-through', 'follow-through@24fps']) {
    const r = renderBack(skeleton, candidate, dir);
    console.log(
      `${skeleton} ${dir.padEnd(22)} window MAE mean ${r.mean.toFixed(3)}  worst ${r.worst.toFixed(2)} at f${r.worstAt}` +
        `  (${r.per.length} frames)`,
    );
    if (process.argv.includes('--all')) {
      console.log(`  ${r.per.map((v, i) => `f${i}:${v.toFixed(1)}`).join(' ')}`);
    }
  }
}
