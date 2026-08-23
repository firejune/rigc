/**
 * Reference | candidate | difference for one fitted pose of the hierarchy.
 *
 *   bun … tools/viewpose.ts <setup.json> <poses.json> <set> <index> <out.png> [zoom]
 */
import { writeFileSync } from 'node:fs';
import { encodePng } from '../../../../tools/plate.ts';
import { sideBySide } from './view.ts';
import { build, pose } from './skel.ts';
import { TREE, DRAW_ORDER, loadSetup } from './model.ts';
import { refFrame, renderPlacements, subject, unionMae, viewportOf } from './lib.ts';

const [setupFile, poseFile, set, idxArg, out, zoomArg] = process.argv.slice(2);
const setup = await loadSetup(setupFile);
const s = build(TREE, setup, DRAW_ORDER.filter((d) => setup.some((p) => p.part === d)));
const doc = JSON.parse(await Bun.file(poseFile).text());
const idx = Number(idxArg);
const entry = doc.frames.find((f: { index: number }) => f.index === idx);
const v = viewportOf('ess');
const ref = refFrame('ess', set, idx);
const cand = renderPlacements(pose(s, entry.pose), v);
const m = unionMae(ref, cand);
const a = subject(ref);
const b = subject(cand);
const x0 = Math.max(0, Math.min(a.minX, b.minX) - 6);
const y0 = Math.max(0, Math.min(a.minY, b.minY) - 6);
const w = Math.min(v.width - x0, Math.max(a.maxX, b.maxX) + 6 - x0);
const h = Math.min(v.height - y0, Math.max(a.maxY, b.maxY) + 6 - y0);
console.log(`${set}/f${idx} union MAE ${m.mae.toFixed(2)} over ${m.union} px`);
writeFileSync(out, encodePng(...(() => { const i = sideBySide(ref, cand, Number(zoomArg ?? 4), [x0, y0, w, h]); return [i.width, i.height, i.data] as const; })()));
console.log(`wrote ${out}`);
