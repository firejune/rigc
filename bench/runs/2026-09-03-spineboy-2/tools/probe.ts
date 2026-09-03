/** Does applyPose actually move the render? A control on the fitter's own knobs. */
import { declaredViewport, inkStats, sidecarOf } from './geom';
import { applyPose, loadCandidate, renderPose, type Pose } from './fitlib';
const view = declaredViewport(sidecarOf(process.env.REF ?? 'bench/reference/spineboy/ess'));
const c = loadCandidate(process.env.CAND ?? '/tmp/sb2/probe');
const cases: Pose[] = [{}, { 'torso.rotate': 90 }, { 'torso.tx': 300 }, { 'front-thigh.rotate': 60 }, { 'gun.rotate': 120 }];
for (const p of cases) {
  applyPose(c.skeleton, p);
  const s = inkStats(renderPose(c, view));
  process.stdout.write(`${JSON.stringify(p).padEnd(30)} -> ${String(s.pixels).padStart(6)} px  centroid ${s.cx.toFixed(1)}, ${s.cy.toFixed(1)}\n`);
}
