/**
 * Reference | candidate | difference for one frame of a fitted set.
 *
 *   bun … tools/viewfit.ts <fits.json> <set> <index> <out.png> [zoom]
 */
import { writeFileSync } from 'node:fs';
import { encodePng } from '../../../../tools/plate.ts';
import { sideBySide } from './view.ts';
import { refFrame, renderPlacements, subject, unionMae, viewportOf } from './lib.ts';

const [file, set, idxArg, out, zoomArg] = process.argv.slice(2);
const doc = JSON.parse(await Bun.file(file).text());
const idx = Number(idxArg);
const entry = doc.frames ? doc.frames.find((f: { index: number }) => f.index === idx) : doc;
const v = viewportOf('ess');
const ref = refFrame('ess', set, idx);
const cand = renderPlacements(entry.placements, v);
const m = unionMae(ref, cand);
const a = subject(ref);
const b = subject(cand);
const x0 = Math.max(0, Math.min(a.minX, b.minX) - 6);
const y0 = Math.max(0, Math.min(a.minY, b.minY) - 6);
const w = Math.min(v.width - x0, Math.max(a.maxX, b.maxX) + 6 - x0);
const h = Math.min(v.height - y0, Math.max(a.maxY, b.maxY) + 6 - y0);
console.log(`${set}/f${idx} union MAE ${m.mae.toFixed(2)} over ${m.union} px`);
const img = sideBySide(ref, cand, Number(zoomArg ?? 4), [x0, y0, w, h]);
writeFileSync(out, encodePng(img.width, img.height, img.data));
console.log(`wrote ${out} ${img.width}x${img.height}`);
