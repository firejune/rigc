import { readPlate } from '../tools/plate.ts';
import { buildTemplate, match } from './match.ts';
import { buildSetup, toWorld, unrotv } from './rigspec.ts';
import { readFileSync } from 'node:fs';
const s = buildSetup();
const m = JSON.parse(readFileSync('work/matches.json','utf8'))['idle/0'];
const head = s.origin['head'], thHead = s.rot['head'];
console.log('head bone origin (world)', head.map((v)=>v.toFixed(1)), 'rot', thHead);
for (const n of ['goggles']) {
  const c = toWorld(m[n].x, m[n].y);
  const off = unrotv(thHead, [c[0]-head[0], c[1]-head[1]]);
  console.log(n, 'centre px', m[n].x, m[n].y, 'deg', m[n].deg, '-> head-local offset', off.map((v)=>v.toFixed(1)));
}
// mouth + eye: search the face region only
const fr = readPlate('bench/reference/spineboy/ess/idle/f0000.png');
for (const n of ['mouth-grind','mouth-oooo','mouth-smile','eye-indifferent','eye-surprised']) {
  const t = buildTemplate(`examples/spineboy/images/${n}.png`, n, 900);
  const mm = match(t, fr, [175, 205, 215, 250], -40, 40);
  const c = toWorld(mm.x, mm.y);
  const off = unrotv(thHead, [c[0]-head[0], c[1]-head[1]]);
  console.log(n.padEnd(16), `(${mm.x},${mm.y}) deg ${mm.deg} res ${mm.residual.toFixed(0)} vis ${(mm.vis*100).toFixed(0)}%`, '-> head-local', off.map((v)=>v.toFixed(1)), `solid=${t.solid}`);
}
