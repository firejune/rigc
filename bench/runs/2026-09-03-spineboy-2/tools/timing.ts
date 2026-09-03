/** How much one objective evaluation costs at each pyramid level. */
import { declaredViewport, plateToRgb, sidecarOf } from './geom';
import { applyPose, levelsFor, loadCandidate, renderPose } from './fitlib';
const view = declaredViewport(sidecarOf(process.env.REF ?? 'bench/reference/spineboy/ess'));
const c = loadCandidate(process.env.CAND ?? '/tmp/sb2/probe');
for (const f of [4, 2, 1]) {
  const [lv] = levelsFor(view, [{ factor: f, knobs: null, metric: 'colour' as const }]);
  const N = 200;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    applyPose(c.skeleton, { 'torso.rotate': i * 0.01 });
    plateToRgb(renderPose(c, lv.viewport));
  }
  process.stdout.write(`level ${f}: ${lv.viewport.width}x${lv.viewport.height}  ${((performance.now() - t0) / N).toFixed(2)} ms/eval\n`);
}
