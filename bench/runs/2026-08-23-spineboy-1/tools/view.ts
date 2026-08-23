/**
 * Reference | candidate | difference, side by side and blown up.
 *
 *   bun … tools/view.ts <placements.json> <set> <index> <out.png> [zoom]
 */
import { writeFileSync } from 'node:fs';
import { Plate, encodePng } from '../../../../tools/plate.ts';
import { refFrame, renderPlacements, viewportOf, unionMae, BG, type Placement } from './lib.ts';

export function sideBySide(ref: Plate, cand: Plate, zoom: number, crop?: [number, number, number, number]): Plate {
  const [cx0, cy0, cw, ch] = crop ?? [0, 0, ref.width, ref.height];
  const out = new Plate(cw * zoom * 3 + 8, ch * zoom);
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.set(x, y, [255, 255, 255, 255]);
  for (let y = 0; y < ch * zoom; y++) {
    for (let x = 0; x < cw * zoom; x++) {
      const sx = cx0 + Math.floor(x / zoom);
      const sy = cy0 + Math.floor(y / zoom);
      const a = ref.get(sx, sy);
      const b = cand.get(sx, sy);
      out.set(x, y, a);
      out.set(cw * zoom + 4 + x, y, b);
      const d = Math.min(255, (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3);
      out.set(cw * zoom * 2 + 8 + x, y, [255 - d, 255 - d, 255 - d, 255]);
    }
  }
  return out;
}

if (import.meta.main) {
  const [file, set, idxArg, out, zoomArg] = process.argv.slice(2);
  const placements: Placement[] = JSON.parse(await Bun.file(file).text()).placements;
  const v = viewportOf('ess');
  const ref = refFrame('ess', set, Number(idxArg));
  const cand = renderPlacements(placements, v);
  const m = unionMae(ref, cand);
  console.log(`union MAE ${m.mae.toFixed(2)} over ${m.union} px`);
  const img = sideBySide(ref, cand, Number(zoomArg ?? 4), [150, 185, 75, 80]);
  writeFileSync(out, encodePng(img.width, img.height, img.data));
  console.log(`wrote ${out} ${img.width}x${img.height}`);
  void BG;
}
