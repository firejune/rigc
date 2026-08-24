/** how big is each part in the reference? template match with a free scale.
 *  Control: run the same estimator on parts whose size is not in doubt. */
import { readPlate } from '../tools/plate.ts';
import { buildTemplate, score, visibility, ESS_SCALE } from './match.ts';
const frame = readPlate(`bench/reference/spineboy/ess/${process.argv[2] ?? 'idle'}/f${String(Number(process.argv[3] ?? 0)).padStart(4, '0')}.png`);
const jobs: [string, number, number, number][] = JSON.parse(process.argv[4]);
for (const [name, bx, by, rad] of jobs) {
  const t = buildTemplate(`examples/spineboy/images/${name}.png`, name);
  let best = { s: 1, x: bx, y: by, deg: 0, r: Infinity };
  for (let k = 0.45; k <= 1.45; k += 0.025) {
    for (let deg = -60; deg <= 60; deg += 2) {
      const rr = (deg * Math.PI) / 180, c = Math.cos(rr), sn = Math.sin(rr);
      for (let y = by - rad; y <= by + rad; y += 1) for (let x = bx - rad; x <= bx + rad; x += 1) {
        const v = score(t, frame, x, y, c, sn, ESS_SCALE * k);
        if (v < best.r) best = { s: k, x, y, deg, r: v };
      }
    }
  }
  const rr = (best.deg * Math.PI) / 180;
  const vis = visibility(t, frame, best.x, best.y, Math.cos(rr), Math.sin(rr), ESS_SCALE * best.s);
  console.log(name.padEnd(14), `scale ${best.s.toFixed(3)}`.padEnd(14), `(${best.x},${best.y}) deg ${best.deg}`.padEnd(22), `res ${best.r.toFixed(0)}`.padEnd(11), `vis ${(vis*100).toFixed(0)}%`);
}
