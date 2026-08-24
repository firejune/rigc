// reproduce the brief's own control: the near fist of ess/idle/f0000 at (154,284)
import { readPlate } from '../../../../tools/plate.ts';
import { buildTemplate, match } from './match.ts';
const fr = readPlate('bench/reference/spineboy/ess/idle/f0000.png');
for (const n of ['front-fist-open', 'front-fist-closed']) {
  const t = buildTemplate(`examples/spineboy/images/${n}.png`, n);
  const m = match(t, fr, [144, 274, 164, 294]);
  console.log(n.padEnd(19), `(${m.x},${m.y}) deg ${m.deg} res ${m.residual.toFixed(0)} vis ${(m.vis*100).toFixed(0)}%`);
}
// and the walk control the brief also gives
for (const [f, bx, by] of [[6, 190, 280], [0, 165, 289]] as [number, number, number][]) {
  const frw = readPlate(`bench/reference/spineboy/ess/walk/f000${f}.png`);
  for (const n of ['front-fist-open', 'front-fist-closed']) {
    const t = buildTemplate(`examples/spineboy/images/${n}.png`, n);
    const m = match(t, frw, [bx - 12, by - 12, bx + 12, by + 12]);
    console.log(`walk/f${f}`.padEnd(10), n.padEnd(19), `(${m.x},${m.y}) deg ${m.deg} res ${m.residual.toFixed(0)} vis ${(m.vis*100).toFixed(0)}%`);
  }
}
