import { quads, type Glob, type Pose } from './fitall.ts';
import { render, err, refFrame } from './fit.ts';
import { dpx, band } from './dcheck.ts';
import type { Plate } from '../../../../tools/plate.ts';
import { readFileSync, writeFileSync } from 'node:fs';
const { g, poses } = JSON.parse(readFileSync('./clean.json','utf8')) as { g: Glob, poses: Record<string,Pose[]> };
const S = 'heavy', LO = 51, HI = 60;   // rho[61..64] are the rest value and stay pinned
const refs: Plate[] = []; for (let i=LO-1;i<=64;i++) refs[i] = refFrame(S,i);
const refD: number[] = []; for (let i=LO;i<=64;i++) refD[i] = dpx(refs[i-1], refs[i]);
const rho = poses[S].map(p=>p.rho);
const B = poses[S][64];
const plate = (r:number) => render(quads(g, { rho: r, Bx: B.Bx, By: B.By, phi: B.phi }));
function cost(v: number[]) {
  const R = rho.slice(); for (let i=LO;i<=HI;i++) R[i] = v[i-LO];
  let c = 0;
  const pl: Plate[] = []; for (let i=LO-1;i<=64;i++) pl[i] = plate(R[i]);
  for (let i=LO-1;i<=64;i++) c += err(pl[i], refs[i]);
  for (let i=LO;i<=64;i++) {
    const [lo,hi] = band(refD[i]);
    const m = dpx(pl[i-1], pl[i]);
    if (m < lo) c += 30 * (lo - m + 1);
    if (m > hi) c += 30 * (m - hi + 1);
  }
  return c;
}
let v = rho.slice(LO, HI+1);
let best = cost(v);
for (const st of [0.4, 0.15, 0.06, 0.02, 0.008, 0.003, 0.001]) for (let it=0; it<80; it++) {
  let imp = false;
  for (let k=0;k<v.length;k++) for (const d of [st,-st]) {
    const q = v.slice(); q[k]+=d; const c = cost(q);
    if (c < best - 1e-9) { best = c; v = q; imp = true; }
  }
  if (!imp) break;
}
console.log('cost', best.toFixed(4));
const R = rho.slice(); for (let i=LO;i<=HI;i++) R[i] = v[i-LO];
const pl2: Plate[] = []; for (let i=LO-1;i<=64;i++) pl2[i] = plate(R[i]);
for (let i=LO;i<=64;i++) { const [lo,hi]=band(refD[i]); const m=dpx(pl2[i-1],pl2[i]);
  console.log(` pair ${i}: mine=${String(m).padStart(4)} ref=${String(refD[i]).padStart(4)} ok=[${lo}..${hi}] ${m<lo||m>hi?'BAD':''}  rho(f${i})=${R[i].toFixed(4)}`); }
const tw = JSON.parse(readFileSync('./tweak.json','utf8'));
tw.heavy = tw.heavy ?? {};
for (let i=LO;i<=HI;i++) tw.heavy[String(i)] = Math.round(R[i]*10000)/10000;
writeFileSync('./tweak.json', JSON.stringify(tw, null, 1));
console.log('tail written to _tweak.json');
