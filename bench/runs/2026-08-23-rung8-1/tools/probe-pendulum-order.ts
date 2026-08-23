/**
 * Draw order in the `pendulum`, decided the way §8 says to decide it: find where
 * one part's **interior detail** is cut, and see which part's silhouette cuts it.
 *
 * Each link's orange bead is interior detail of that link. Composited alone at
 * this shot's scale a bead covers a known number of pixels and fills a known box;
 * where a frame shows fewer, something is drawn over it, and the only candidates
 * are the discus and the link above.
 *
 * `bun bench/runs/2026-08-23-rung8-1/tools/probe-pendulum-order.ts [12|24]`
 */
import { readPlate } from '../../../../tools/plate.ts';
import { IMAGES, sidecar, loadSet, orangeMask, components, isOrange } from './frames.ts';
import { join } from 'node:path';

function beadOfArt(file: string): { px: number; w: number; h: number } {
  const plate = readPlate(join(IMAGES, file));
  let n = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < plate.height; y++) {
    for (let x = 0; x < plate.width; x++) {
      const [r, g, b, a] = plate.get(x, y);
      if (a > 128 && isOrange(r, g, b)) {
        n++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { px: n, w: maxX - minX + 1, h: maxY - minY + 1 };
}

if (import.meta.main) {
  const fps = process.argv[2] === '24' ? 24 : 12;
  const side = sidecar('pendulum');
  const s = side.viewport.scale;
  const art = ['chain-1.png', 'chain-2.png', 'chain-3.png', 'chain-4.png', 'chain-end.png'].map(beadOfArt);
  console.log('predicted at this shot’s scale (area scales by s², a box by s):');
  art.forEach((a, i) =>
    console.log(
      `  bead ${i + 1}: ${(a.px * s * s).toFixed(0)} px, box ${(a.w * s).toFixed(1)} x ${(a.h * s).toFixed(1)}`,
    ),
  );

  const plates = loadSet('pendulum', fps === 24 ? 'follow-through@24fps' : 'follow-through');
  const seen: { px: number[]; w: number[]; h: number[] }[] = art.map(() => ({ px: [], w: [], h: [] }));
  for (const plate of plates) {
    const w = plate.width;
    const om = orangeMask(plate);
    const comps = components(om, w, plate.height).filter((c) => c.length >= 12);
    const info = comps.map((c) => {
      let cx = 0;
      let cy = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of c) {
        const x = p % w;
        const y = Math.floor(p / w);
        cx += x;
        cy += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return {
        cx: cx / c.length,
        cy: cy / c.length,
        px: c.length,
        bw: maxX - minX + 1,
        bh: maxY - minY + 1,
      };
    });
    info.sort((a, b) => b.bw - a.bw);
    const rim = info[0];
    const rest = info.slice(1);
    let from: [number, number] = [rim.cx, rim.cy];
    for (let i = 0; i < 5; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let k = 0; k < rest.length; k++) {
        const d = Math.hypot(rest[k].cx - from[0], rest[k].cy - from[1]);
        if (d < bd) {
          bd = d;
          bi = k;
        }
      }
      const t = rest.splice(bi, 1)[0];
      seen[i].px.push(t.px);
      seen[i].w.push(t.bw);
      seen[i].h.push(t.bh);
      from = [t.cx, t.cy];
    }
  }
  console.log(`\nmeasured over ${plates.length} frames at ${fps} fps:`);
  seen.forEach((v, i) => {
    const pred = art[i].px * s * s;
    const lo = Math.min(...v.px);
    const hi = Math.max(...v.px);
    console.log(
      `  bead ${i + 1}: ${lo}–${hi} px (${((100 * lo) / pred).toFixed(0)}–${((100 * hi) / pred).toFixed(0)} % of ${pred.toFixed(0)}), ` +
        `box w ${Math.min(...v.w)}–${Math.max(...v.w)} (pred ${(art[i].w * s).toFixed(1)}), ` +
        `h ${Math.min(...v.h)}–${Math.max(...v.h)} (pred ${(art[i].h * s).toFixed(1)})`,
    );
  });
}
