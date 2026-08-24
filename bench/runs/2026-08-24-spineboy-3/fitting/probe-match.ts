import { readPlate } from '../tools/plate.ts';
import { buildTemplate, match } from './match.ts';
const frame = readPlate('bench/reference/spineboy/ess/idle/f0000.png');
const box: [number, number, number, number] = [130, 180, 250, 345];
for (const n of ['torso', 'head', 'gun', 'front-fist-open', 'front-shin', 'rear-shin']) {
  const t = buildTemplate(`examples/spineboy/images/${n}.png`, n);
  const t0 = Date.now();
  const m = match(t, frame, box);
  console.log(n.padEnd(18), `(${m.x.toFixed(1)}, ${m.y.toFixed(1)})`.padEnd(18), `deg ${m.deg.toFixed(2)}`.padEnd(12), `res ${m.residual.toFixed(0)}`.padEnd(12), `vis ${(m.vis*100).toFixed(0)}%`, `${Date.now()-t0}ms`);
}
