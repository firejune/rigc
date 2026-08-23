/**
 * Fit the setup-pose placements to one reference frame, art scale included.
 *
 *   bun … tools/fitsetup.ts <in.json> <set> <index> <out.json> [scale]
 */
import { writeFileSync } from 'node:fs';
import { fitPose } from './fitpose.ts';
import { refFrame, renderPlacements, unionMae, viewportOf, type Placement } from './lib.ts';

const [file, set, idxArg, out, scaleArg] = process.argv.slice(2);
const doc = JSON.parse(await Bun.file(file).text());
const placements: Placement[] = doc.placements;
const v = viewportOf('ess');
const ref = refFrame('ess', set, Number(idxArg));
const t0 = Date.now();
const r = fitPose(placements, ref, v, Number(scaleArg ?? doc.scale ?? 1), {
  fitScale: true,
  log: (s) => console.log(s),
});
const m = unionMae(ref, renderPlacements(r.placements, v));
console.log(`sad ${r.sad.toFixed(0)}  union MAE ${m.mae.toFixed(2)}  scale ${r.scale.toFixed(6)}  ${r.evals} evals in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
writeFileSync(
  out,
  JSON.stringify(
    { note: doc.note, fittedTo: `${set}/f${idxArg}`, scale: r.scale, unionMae: m.mae, placements: r.placements.map((p) => ({ ...p, cx: +p.cx.toFixed(3), cy: +p.cy.toFixed(3), rot: +p.rot.toFixed(3) })) },
    null,
    2,
  ),
);
console.log(`wrote ${out}`);
